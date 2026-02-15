import fs from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import YAML from "yaml";
import { compileCanonicalToPackArtifacts } from "../../src/engine/v2/open5eImporter";
import type { EffectSpecV2, Open5eCanonicalEntityV2 } from "../../src/engine/v2/types";

const execFile = promisify(execFileCb);
const ROOT = process.cwd();
const BASE = "https://api.open5e.com";

type DocKey = "srd-2014" | "srd-2024";

type EndpointDef = {
    id: string;
    kind: Open5eCanonicalEntityV2["kind"];
    mode: "v2" | "v1";
    path: string;
};

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

function parseDocumentsArg(argv: string[]): DocKey[] {
    const flag = argv.find(a => a.startsWith("--documents="));
    if (!flag) return ["srd-2014", "srd-2024"];
    const docs = flag.split("=")[1].split(",").map(v => v.trim()).filter(Boolean) as DocKey[];
    return docs.length ? docs : ["srd-2014", "srd-2024"];
}

function parseEndpointsArg(argv: string[]): string[] | null {
    const flag = argv.find(a => a.startsWith("--endpoints="));
    if (!flag) return null;
    const values = flag.split("=")[1].split(",").map(v => v.trim()).filter(Boolean);
    return values.length ? values : null;
}

function hashJson(input: unknown): string {
    const text = JSON.stringify(input) || "";
    let hash = 5381;
    for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
    }
    return `h${Math.abs(hash >>> 0).toString(16)}`;
}

function buildUrl(endpoint: EndpointDef, documentKey: DocKey, page = 1, limit = 25): string {
    const url = new URL(`${BASE}${endpoint.path}`);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("page", String(page));

    if (endpoint.mode === "v2") {
        url.searchParams.set("document__key", documentKey);
    } else {
        url.searchParams.set("document__slug", "wotc-srd");
    }

    return url.toString();
}

function toEffects(raw: Record<string, unknown>, kind: Open5eCanonicalEntityV2["kind"]): EffectSpecV2[] {
    const desc = String(raw.desc || raw.description || "").toLowerCase();
    const out: EffectSpecV2[] = [];
    const map: Record<string, string> = {
        strength: "str",
        dexterity: "dex",
        constitution: "con",
        intelligence: "int",
        wisdom: "wis",
        charisma: "cha"
    };

    for (const [term, key] of Object.entries(map)) {
        const hit = desc.match(new RegExp(`\\+\\s*(\\d+)\\s+${term}`, "i"));
        if (!hit) continue;
        out.push({
            id: `${kind}_${key}_bonus`,
            label: `${key.toUpperCase()} bonus`,
            modifiers: [{ target: "stat", key, operation: "add", value: Number(hit[1]) || 0 }],
            triggers: [{ kind: "equipped" }],
            duration: { type: "while_equipped" },
            stacking: "sum"
        });
    }

    return out;
}

async function fetchJsonWithCurl(url: string): Promise<any> {
    const escaped = url.replace(/'/g, "'\\''");
    let lastError: unknown;

    for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
            const command = `curl -fsSL --retry 4 --retry-delay 2 --connect-timeout 30 --max-time 240 '${escaped}'`;
            const { stdout } = await execFile("zsh", ["-lc", command], { maxBuffer: 64 * 1024 * 1024 });
            return JSON.parse(stdout);
        } catch (error) {
            lastError = error;
            // eslint-disable-next-line no-console
            console.warn(`retry ${attempt}/5 for ${url}`);
            await new Promise(resolve => setTimeout(resolve, 2_000 * attempt));
        }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function syncCanonical(docs: DocKey[], endpointFilter: string[] | null): Promise<{ entities: Open5eCanonicalEntityV2[]; pagesFetched: number; errors: string[] }> {
    const entities: Open5eCanonicalEntityV2[] = [];
    const errors: string[] = [];
    let pagesFetched = 0;

    for (const documentKey of docs) {
        for (const endpoint of ENDPOINTS) {
            if (endpointFilter && !endpointFilter.includes(endpoint.id)) continue;
            // eslint-disable-next-line no-console
            console.log(`Fetching ${endpoint.id} for ${documentKey}`);
            try {
                let next: string | null = buildUrl(endpoint, documentKey, 1);

                while (next) {
                    const payload = await fetchJsonWithCurl(next);
                    const rows = Array.isArray(payload.results) ? payload.results : [];
                    pagesFetched += 1;
                    // eslint-disable-next-line no-console
                    console.log(`  page ${pagesFetched} rows=${rows.length}`);

                    for (const raw of rows) {
                        const record = (raw || {}) as Record<string, unknown>;
                        const slug = String(record.key || record.slug || record.id || hashJson(record));

                        entities.push({
                            id: `${documentKey}:${endpoint.kind}:${slug.toLowerCase().replace(/[^a-z0-9_\-]+/g, "-")}`,
                            kind: endpoint.kind,
                            title: String(record.name || record.title || record.key || "Untitled"),
                            source: {
                                documentKey,
                                endpoint: endpoint.id,
                                url: typeof record.url === "string" ? record.url : undefined,
                                fetchedAt: new Date().toISOString(),
                                hash: hashJson(record)
                            },
                            data: record,
                            effects: toEffects(record, endpoint.kind),
                            unmappedRules: []
                        });
                    }

                    next = typeof payload.next === "string" && payload.next ? payload.next : null;
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                errors.push(`${endpoint.id}:${documentKey} -> ${message}`);
                // eslint-disable-next-line no-console
                console.error(`ERROR ${endpoint.id}:${documentKey}`, message);
            }
        }
    }

    return { entities, pagesFetched, errors };
}

function packIdFor(doc: DocKey): string {
    return doc === "srd-2014" ? "dnd_srd_5e_2014" : "dnd_srd_5e_2024";
}

function mapKindToType(kind: string): string {
    if (kind === "armor" || kind === "weapon") return "items";
    if (kind === "class" || kind === "subclass") return "classes";
    if (kind === "condition") return "conditions";
    return `${kind}s`;
}

async function writePackContent(doc: DocKey, grouped: Record<string, any[]>): Promise<void> {
    const packId = packIdFor(doc);
    const baseDir = path.join(ROOT, "src", "packs", "builtin", packId);
    const contentDir = path.join(baseDir, "content");
    const rulesDir = path.join(baseDir, "rules");

    await fs.mkdir(contentDir, { recursive: true });
    await fs.mkdir(rulesDir, { recursive: true });

    const effects: any[] = [];
    const byContentType: Record<string, any[]> = {};

    for (const [kind, entities] of Object.entries(grouped)) {
        const contentType = mapKindToType(kind);
        const rows = entities.map((entity: any) => {
            if (Array.isArray(entity.effects) && entity.effects.length) {
                effects.push(...entity.effects);
            }

            const slug = String(entity.id).split(":").pop() || entity.id;
            return {
                id: slug,
                contentId: {
                    namespace: doc.replace("-", "_"),
                    type: kind,
                    slug
                },
                title: entity.title,
                data: entity.data
            };
        });
        byContentType[contentType] = [...(byContentType[contentType] || []), ...rows];
    }

    for (const [contentType, rows] of Object.entries(byContentType)) {
        const file = path.join(contentDir, `open5e_${contentType}.yaml`);
        await fs.writeFile(file, YAML.stringify({ content: { [contentType]: rows } }), "utf8");
    }

    const indexRecords = Object.keys(byContentType).map(contentType => ({
        contentType,
        file: `content/open5e_${contentType}.yaml`,
        fields: ["id", "title", "data.name", "data.key"]
    }));
    await fs.writeFile(
        path.join(contentDir, "index.generated.yaml"),
        YAML.stringify({
            contentIndex: {
                schemaVersion: "1.0.0",
                records: indexRecords
            }
        }),
        "utf8"
    );

    const uniqEffects = effects.filter((effect, index) => {
        const key = `${effect.id}:${JSON.stringify(effect.modifiers || [])}`;
        return effects.findIndex(e => `${e.id}:${JSON.stringify(e.modifiers || [])}` === key) === index;
    });

    await fs.writeFile(path.join(rulesDir, "effects.generated.yaml"), YAML.stringify({ effects: uniqEffects }), "utf8");
}

async function run(): Promise<void> {
    const docs = parseDocumentsArg(process.argv.slice(2));
    const endpoints = parseEndpointsArg(process.argv.slice(2));
    const startedAt = new Date().toISOString();
    const sync = await syncCanonical(docs, endpoints);
    const compiled = compileCanonicalToPackArtifacts(sync.entities);

    for (const doc of docs) {
        await writePackContent(doc, compiled.byDocument[doc]);
    }

    const report = {
        sync: {
            startedAt,
            finishedAt: new Date().toISOString(),
            documents: docs,
            endpoints: (endpoints && endpoints.length ? ENDPOINTS.filter(e => endpoints.includes(e.id)) : ENDPOINTS).map(e => e.id),
            pagesFetched: sync.pagesFetched,
            entitiesTotal: sync.entities.length,
            warnings: [],
            errors: sync.errors
        },
        compile: compiled.report
    };

    const reportDir = path.join(ROOT, "docs", "open5e-sync");
    await fs.mkdir(reportDir, { recursive: true });
    await fs.writeFile(path.join(reportDir, "latest-report.json"), JSON.stringify(report, null, 2), "utf8");

    // eslint-disable-next-line no-console
    console.log(`Open5e sync complete. Entities: ${sync.entities.length}`);

    if (sync.errors.length > 0) {
        throw new Error(`Open5e sync completed with ${sync.errors.length} endpoint errors.`);
    }
}

run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
});
