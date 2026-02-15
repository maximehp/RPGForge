import type {
    CompileReportV2,
    EffectSpecV2,
    Open5eCanonicalEntityV2,
    Open5eSyncReportV2
} from "./types";

type EndpointDef = {
    id: string;
    kind: Open5eCanonicalEntityV2["kind"];
    mode: "v2" | "v1";
    path: string;
};

type SyncOptions = {
    documents?: Array<"srd-2014" | "srd-2024">;
    endpointFilter?: string[];
    onProgress?: (message: string) => void;
};

const BASE = "https://api.open5e.com";

const ENDPOINTS: EndpointDef[] = [
    { id: "spells", kind: "spell", mode: "v2", path: "/v2/spells/" },
    { id: "classes", kind: "class", mode: "v2", path: "/v2/classes/" },
    { id: "feats", kind: "feat", mode: "v2", path: "/v2/feats/" },
    { id: "conditions", kind: "condition", mode: "v2", path: "/v2/conditions/" },
    { id: "armor", kind: "armor", mode: "v2", path: "/v2/armor/" },
    { id: "weapons", kind: "weapon", mode: "v2", path: "/v2/weapons/" },
    { id: "backgrounds", kind: "background", mode: "v2", path: "/v2/backgrounds/" },
    { id: "creatures", kind: "monster", mode: "v2", path: "/v2/creatures/" },
    { id: "magicitems", kind: "item", mode: "v1", path: "/v1/magicitems/" },
    { id: "monsters", kind: "monster", mode: "v1", path: "/v1/monsters/" },
    { id: "races", kind: "race", mode: "v1", path: "/v1/races/" }
];

function hashJson(input: unknown): string {
    const text = JSON.stringify(input) || "";
    let hash = 5381;
    for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
    }
    return `h${Math.abs(hash >>> 0).toString(16)}`;
}

function buildUrl(endpoint: EndpointDef, documentKey: "srd-2014" | "srd-2024", page = 1, limit = 100): string {
    const url = new URL(`${BASE}${endpoint.path}`);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("page", String(page));

    if (endpoint.mode === "v2") {
        url.searchParams.set("document__key", documentKey);
    } else {
        if (documentKey === "srd-2014") {
            url.searchParams.set("document__slug", "wotc-srd");
        } else {
            url.searchParams.set("document__slug", "wotc-srd");
        }
    }

    return url.toString();
}

function makeId(documentKey: string, raw: Record<string, unknown>, fallbackKind: string): string {
    const key = String(raw.key || raw.slug || raw.id || raw.name || hashJson(raw));
    const safe = key.toLowerCase().replace(/[^a-z0-9_\-]+/g, "-");
    return `${documentKey}:${fallbackKind}:${safe}`;
}

function guessTitle(raw: Record<string, unknown>): string {
    return String(raw.name || raw.title || raw.key || raw.slug || "Untitled");
}

function extractRuleText(raw: Record<string, unknown>): string[] {
    const bucket: string[] = [];
    for (const key of ["desc", "description", "higher_level", "text"]) {
        const value = raw[key];
        if (typeof value === "string" && value.trim()) bucket.push(value.trim());
    }
    return bucket;
}

function compileEffects(raw: Record<string, unknown>, kind: Open5eCanonicalEntityV2["kind"]): { effects: EffectSpecV2[]; unmapped: string[] } {
    const texts = extractRuleText(raw);
    const effects: EffectSpecV2[] = [];
    const unmapped: string[] = [];

    for (const text of texts) {
        const lower = text.toLowerCase();
        const statMatches: Array<{ key: string; value: number }> = [];

        const abilityMap: Record<string, string> = {
            strength: "str",
            dexterity: "dex",
            constitution: "con",
            intelligence: "int",
            wisdom: "wis",
            charisma: "cha"
        };

        for (const [term, key] of Object.entries(abilityMap)) {
            const re = new RegExp(`\\+\\s*(\\d+)\\s+${term}`, "i");
            const hit = lower.match(re);
            if (hit) {
                statMatches.push({ key, value: Number(hit[1]) || 0 });
            }
        }

        if (statMatches.length) {
            effects.push({
                id: `${kind}_compiled_${effects.length + 1}`,
                label: `Compiled ${kind} bonus`,
                modifiers: statMatches.map(m => ({
                    target: "stat",
                    key: m.key,
                    operation: "add",
                    value: m.value,
                    stacking: "sum"
                })),
                triggers: [{ kind: "equipped" }],
                duration: { type: "while_equipped" },
                stacking: "sum"
            });
        } else if (/\+\s*\d+/.test(lower) || /increase|bonus|advantage/.test(lower)) {
            unmapped.push(text);
        }
    }

    return { effects, unmapped };
}

async function fetchPage(url: string): Promise<{ results: Array<Record<string, unknown>>; next: string | null }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    const response = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeout));
    if (!response.ok) {
        throw new Error(`Open5e fetch failed (${response.status}) for ${url}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const results = Array.isArray(data.results) ? (data.results as Array<Record<string, unknown>>) : [];
    const next = typeof data.next === "string" ? data.next : null;
    return { results, next };
}

export async function syncOpen5eSrd(options: SyncOptions = {}): Promise<{ entities: Open5eCanonicalEntityV2[]; report: Open5eSyncReportV2 }> {
    const startedAt = new Date().toISOString();
    const documents: Array<"srd-2014" | "srd-2024"> = options.documents?.length
        ? options.documents
        : ["srd-2014", "srd-2024"];
    const allowedEndpoints = new Set(options.endpointFilter || ENDPOINTS.map(e => e.id));

    const report: Open5eSyncReportV2 = {
        startedAt,
        finishedAt: startedAt,
        documents,
        endpoints: [],
        pagesFetched: 0,
        entitiesTotal: 0,
        warnings: [],
        errors: []
    };

    const entities: Open5eCanonicalEntityV2[] = [];

    for (const documentKey of documents) {
        for (const endpoint of ENDPOINTS) {
            if (!allowedEndpoints.has(endpoint.id)) continue;
            report.endpoints.push(`${endpoint.id}:${documentKey}`);
            options.onProgress?.(`Fetching ${endpoint.id} for ${documentKey}`);

            try {
                let page = 1;
                let nextUrl: string | null = buildUrl(endpoint, documentKey, page);

                while (nextUrl) {
                    const { results, next } = await fetchPage(nextUrl);
                    report.pagesFetched += 1;
                    options.onProgress?.(`Fetched page ${report.pagesFetched} (${endpoint.id}:${documentKey}) rows=${results.length}`);

                    for (const raw of results) {
                        const id = makeId(documentKey, raw, endpoint.kind);
                        const { effects, unmapped } = compileEffects(raw, endpoint.kind);

                        entities.push({
                            id,
                            kind: endpoint.kind,
                            title: guessTitle(raw),
                            source: {
                                documentKey,
                                endpoint: endpoint.id,
                                url: typeof raw.url === "string" ? raw.url : undefined,
                                fetchedAt: new Date().toISOString(),
                                hash: hashJson(raw)
                            },
                            data: raw,
                            effects,
                            unmappedRules: unmapped
                        });
                    }

                    nextUrl = next;
                    page += 1;
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                report.errors.push(`${endpoint.id}:${documentKey} -> ${message}`);
                options.onProgress?.(`ERROR ${endpoint.id}:${documentKey}: ${message}`);
            }
        }
    }

    report.entitiesTotal = entities.length;
    report.finishedAt = new Date().toISOString();

    return { entities, report };
}

export function compileCanonicalToPackArtifacts(entities: Open5eCanonicalEntityV2[]): {
    byDocument: Record<"srd-2014" | "srd-2024", Record<string, Open5eCanonicalEntityV2[]>>;
    report: CompileReportV2;
} {
    const byDocument: Record<"srd-2014" | "srd-2024", Record<string, Open5eCanonicalEntityV2[]>> = {
        "srd-2014": {},
        "srd-2024": {}
    };

    let effectsCompiled = 0;
    let unmappedRules = 0;

    for (const entity of entities) {
        const doc = entity.source.documentKey;
        if (!byDocument[doc][entity.kind]) byDocument[doc][entity.kind] = [];
        byDocument[doc][entity.kind].push(entity);
        effectsCompiled += entity.effects?.length || 0;
        unmappedRules += entity.unmappedRules?.length || 0;
    }

    const report: CompileReportV2 = {
        generatedAt: new Date().toISOString(),
        entitiesIn: entities.length,
        entitiesOut: Object.values(byDocument).reduce((sum, group) => {
            return sum + Object.values(group).reduce((n, rows) => n + rows.length, 0);
        }, 0),
        effectsCompiled,
        unmappedRules,
        warnings: []
    };

    return { byDocument, report };
}
