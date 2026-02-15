import {
    loadBuiltinPackContentChunkV2,
    loadBuiltinPackContentIndexV2,
    listBuiltinPackContentFilesV2
} from "../engine/v2/builtinLoader";
import {
    clearCreatorCatalogCache,
    clearCreatorCatalogIndex,
    loadAllPersistedPacks,
    loadCreatorCatalogCache,
    loadCreatorCatalogIndex,
    persistCreatorCatalogCache,
    persistCreatorCatalogIndex,
    type CreatorCatalogIndexRecord
} from "./v2Database";

export type CreatorCatalogQuery = {
    search?: string;
    limit?: number;
    offset?: number;
    filters?: Record<string, unknown>;
};

export type CreatorCatalogOption = {
    value: string;
    label: string;
    meta?: Record<string, unknown>;
};

function inferContentTypeFromPath(path: string): string | null {
    const file = path.split("/").pop() || "";
    if (file.includes("class")) return "classes";
    if (file.includes("race")) return "races";
    if (file.includes("feat")) return "feats";
    if (file.includes("background")) return "backgrounds";
    if (file.includes("spell")) return "spells";
    if (file.includes("item")) return "items";
    if (file.includes("monster")) return "monsters";
    if (file.includes("condition")) return "conditions";
    if (file.includes("feature")) return "features";
    return null;
}

function toQueryKey(query: CreatorCatalogQuery): string {
    const normalized = {
        search: (query.search || "").trim().toLowerCase(),
        limit: query.limit ?? 100,
        offset: query.offset ?? 0,
        filters: query.filters || {}
    };
    return JSON.stringify(normalized);
}

function resolvePath(root: unknown, path: string): unknown {
    const parts = path.split(".").filter(Boolean);
    let cur = root;
    for (const part of parts) {
        if (!cur || typeof cur !== "object") return undefined;
        cur = (cur as Record<string, unknown>)[part];
    }
    return cur;
}

function toOption(entry: Record<string, unknown>): CreatorCatalogOption {
    const id = String(entry.id || "");
    const data = (entry.data as Record<string, unknown>) || {};
    const label = String(entry.title || data.name || id || "Unnamed");
    return {
        value: id,
        label,
        meta: {
            title: entry.title,
            data
        }
    };
}

function includesSearch(entry: Record<string, unknown>, search: string): boolean {
    if (!search) return true;
    const needle = search.toLowerCase();
    const data = (entry.data as Record<string, unknown>) || {};
    const haystacks = [
        String(entry.id || ""),
        String(entry.title || ""),
        String(data.name || ""),
        String(data.key || "")
    ];
    return haystacks.some(text => text.toLowerCase().includes(needle));
}

function matchesFilters(entry: Record<string, unknown>, filters: Record<string, unknown>): boolean {
    const pairs = Object.entries(filters);
    if (!pairs.length) return true;
    for (const [path, expected] of pairs) {
        const actual = resolvePath(entry, path);
        if (Array.isArray(actual)) {
            const actualStrings = actual.map(v => String(v).toLowerCase());
            if (!actualStrings.includes(String(expected).toLowerCase())) {
                return false;
            }
            continue;
        }
        if (actual && typeof actual === "object") {
            if (!JSON.stringify(actual).toLowerCase().includes(String(expected).toLowerCase())) {
                return false;
            }
            continue;
        }
        if (String(actual ?? "").toLowerCase() !== String(expected ?? "").toLowerCase()) {
            return false;
        }
    }
    return true;
}

async function buildIndex(packId: string): Promise<CreatorCatalogIndexRecord[]> {
    const now = new Date().toISOString();
    const indexedRows: CreatorCatalogIndexRecord[] = [];
    const indexed = await loadBuiltinPackContentIndexV2(packId);
    const records = ((indexed as Record<string, unknown> | null)?.contentIndex as Record<string, unknown> | undefined)?.records;
    if (Array.isArray(records)) {
        for (const record of records) {
            if (!record || typeof record !== "object") continue;
            const entry = record as Record<string, unknown>;
            const contentType = String(entry.contentType || "").trim();
            const filePathRaw = String(entry.file || entry.filePath || "").trim();
            if (!contentType || !filePathRaw) continue;
            const filePath = filePathRaw.startsWith("/") ? filePathRaw : `/src/packs/builtin/${packId}/${filePathRaw}`;
            indexedRows.push({
                id: `${packId}:${contentType}:${filePath}`,
                packId,
                contentType,
                filePath,
                fields: Array.isArray(entry.fields) ? entry.fields.map(value => String(value)) : ["id", "title", "data.name", "data.key"],
                updatedAt: now
            });
        }
    }
    if (indexedRows.length) {
        return indexedRows;
    }

    const files = await listBuiltinPackContentFilesV2(packId);
    for (const filePath of files) {
        const type = inferContentTypeFromPath(filePath);
        if (!type) continue;
        indexedRows.push({
            id: `${packId}:${type}:${filePath}`,
            packId,
            contentType: type,
            filePath,
            fields: ["id", "title", "data.name", "data.key"],
            updatedAt: now
        });
    }
    return indexedRows;
}

export async function ensureCreatorCatalogIndex(packId: string): Promise<CreatorCatalogIndexRecord[]> {
    const existing = await loadCreatorCatalogIndex(packId);
    if (existing.length) return existing;

    const rebuilt = await buildIndex(packId);
    if (rebuilt.length) {
        await persistCreatorCatalogIndex(rebuilt);
    }
    return rebuilt;
}

async function loadEntriesFromIndex(packId: string, contentType: string): Promise<Array<Record<string, unknown>>> {
    const index = await ensureCreatorCatalogIndex(packId);
    const files = index
        .filter(row => row.contentType === contentType)
        .map(row => row.filePath);

    const entries: Array<Record<string, unknown>> = [];
    for (const filePath of files) {
        const doc = await loadBuiltinPackContentChunkV2(packId, filePath);
        const content = (doc as Record<string, unknown>)?.content as Record<string, unknown> | undefined;
        const rows = content?.[contentType];
        if (Array.isArray(rows)) {
            entries.push(...rows.filter(Boolean) as Array<Record<string, unknown>>);
        }
    }
    return entries;
}

async function loadOverlayEntries(packId: string, contentType: string): Promise<Array<Record<string, unknown>>> {
    const packs = await loadAllPersistedPacks();
    const entries: Array<Record<string, unknown>> = [];
    for (const pack of packs) {
        if (pack.source !== "overlay") continue;
        const dependsOn = pack.manifest.dependsOn || [];
        const appliesToPack = dependsOn.some(dep => dep.id === packId) || pack.manifest.id === packId;
        if (!appliesToPack) continue;
        const overlayRows = pack.module.content?.[contentType];
        if (Array.isArray(overlayRows)) {
            entries.push(...(overlayRows as Array<Record<string, unknown>>));
        }
    }
    return entries;
}

export async function queryCreatorCatalog(
    packId: string,
    contentType: string,
    query: CreatorCatalogQuery = {}
): Promise<CreatorCatalogOption[]> {
    const queryKey = toQueryKey(query);
    const cacheId = `${packId}:${contentType}:${queryKey}`;
    const cached = await loadCreatorCatalogCache(packId, contentType, queryKey);
    if (cached) return cached.results;

    const search = (query.search || "").trim();
    const limit = Math.max(1, query.limit ?? 100);
    const offset = Math.max(0, query.offset ?? 0);
    const filters = query.filters || {};

    const [baseEntries, overlayEntries] = await Promise.all([
        loadEntriesFromIndex(packId, contentType),
        loadOverlayEntries(packId, contentType)
    ]);
    const mergedById = new Map<string, Record<string, unknown>>();
    for (const entry of [...baseEntries, ...overlayEntries]) {
        const id = String(entry.id || "");
        if (!id) continue;
        mergedById.set(id, entry);
    }
    const filtered = [...mergedById.values()]
        .filter(entry => includesSearch(entry, search))
        .filter(entry => matchesFilters(entry, filters))
        .map(toOption);

    const paged = filtered.slice(offset, offset + limit);
    await persistCreatorCatalogCache({
        id: cacheId,
        packId,
        contentType,
        queryKey,
        results: paged,
        updatedAt: new Date().toISOString()
    });
    return paged;
}

export async function warmCreatorCatalog(packId: string, contentTypes: string[]): Promise<void> {
    const unique = [...new Set(contentTypes)];
    for (const type of unique) {
        await queryCreatorCatalog(packId, type, { limit: 200, offset: 0 });
    }
}

export async function invalidateCreatorCatalog(packId: string): Promise<void> {
    await clearCreatorCatalogIndex(packId);
    await clearCreatorCatalogCache(packId);
}
