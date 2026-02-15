import Dexie, { type Table } from "dexie";
import { compareSemver } from "../engine/v2/semver";
import type {
    CharacterDocumentV2,
    CompileReportV2,
    CreatorSessionV2,
    ImportReportV2,
    LoadedPackV2,
    Open5eCanonicalEntityV2,
    Open5eSyncReportV2,
    OverlayPackDocumentV2,
    ResolvedRuleset
} from "../engine/v2/types";

export type PackRecord = {
    id: string;
    manifestId: string;
    version: string;
    source: "builtin" | "import" | "overlay";
    payload: LoadedPackV2;
    createdAt: string;
};

export type RulesetRecord = {
    id: string;
    packIds: string[];
    payload: ResolvedRuleset;
    updatedAt: string;
};

export type LayoutRecord = {
    id: string;
    characterId: string;
    rulesetId: string;
    layout: unknown;
    updatedAt: string;
};

export type ImportRecord = {
    id?: number;
    source: string;
    report: ImportReportV2;
    createdAt: string;
};

export type MigrationRecord = {
    id: string;
    entity: "character" | "pack" | "system";
    fromVersion: string;
    toVersion: string;
    at: string;
};

export type OverlayRecord = {
    id: string;
    rulesetId: string;
    scope: "global" | "character";
    characterId?: string;
    payload: OverlayPackDocumentV2;
    updatedAt: string;
};

export type CanonicalCacheRecord = {
    id: string;
    documentKey: "srd-2014" | "srd-2024";
    payload: Open5eCanonicalEntityV2;
    hash: string;
    updatedAt: string;
};

export type SyncReportRecord = {
    id?: number;
    report: Open5eSyncReportV2;
    compile?: CompileReportV2;
    createdAt: string;
};

export type CreatorCatalogIndexRecord = {
    id: string;
    packId: string;
    contentType: string;
    filePath: string;
    fields?: string[];
    updatedAt: string;
};

export type CreatorCatalogCacheRecord = {
    id: string;
    packId: string;
    contentType: string;
    queryKey: string;
    results: Array<{ value: string; label: string; meta?: Record<string, unknown> }>;
    updatedAt: string;
};

export type CharacterListQuery = {
    rulesetId?: string;
    name?: string;
    includeArchived?: boolean;
    limit?: number;
    offset?: number;
};

class RPGForgeV2Db extends Dexie {
    packs!: Table<PackRecord, string>;
    rulesets!: Table<RulesetRecord, string>;
    characters!: Table<CharacterDocumentV2, string>;
    layouts!: Table<LayoutRecord, string>;
    imports!: Table<ImportRecord, number>;
    migrations!: Table<MigrationRecord, string>;
    overlays!: Table<OverlayRecord, string>;
    canonicalCache!: Table<CanonicalCacheRecord, string>;
    syncReports!: Table<SyncReportRecord, number>;
    creatorSessions!: Table<CreatorSessionV2, string>;
    creatorCatalogIndex!: Table<CreatorCatalogIndexRecord, string>;
    creatorCatalogCache!: Table<CreatorCatalogCacheRecord, string>;

    constructor() {
        super("rpgforge_v2");
        this.version(1).stores({
            packs: "id, manifestId, version, source, createdAt",
            rulesets: "id, updatedAt",
            characters: "meta.id, meta.rulesetId, schemaVersion, meta.updatedAt",
            layouts: "id, characterId, rulesetId, updatedAt",
            imports: "++id, source, createdAt",
            migrations: "id, entity, at",
            overlays: "id, rulesetId, scope, characterId, updatedAt",
            canonicalCache: "id, documentKey, hash, updatedAt",
            syncReports: "++id, createdAt",
            creatorSessions: "id, rulesetId, updatedAt",
            creatorCatalogIndex: "id, packId, contentType, filePath, updatedAt",
            creatorCatalogCache: "id, packId, contentType, queryKey, updatedAt"
        });
        this.version(2).stores({
            packs: "id, manifestId, version, source, createdAt",
            rulesets: "id, updatedAt",
            characters: "meta.id, meta.rulesetId, schemaVersion, meta.updatedAt, meta.name",
            layouts: "id, characterId, rulesetId, updatedAt",
            imports: "++id, source, createdAt",
            migrations: "id, entity, at",
            overlays: "id, rulesetId, scope, characterId, updatedAt",
            canonicalCache: "id, documentKey, hash, updatedAt",
            syncReports: "++id, createdAt",
            creatorSessions: "id, rulesetId, updatedAt",
            creatorCatalogIndex: "id, packId, contentType, filePath, updatedAt",
            creatorCatalogCache: "id, packId, contentType, queryKey, updatedAt"
        });
        this.version(3).stores({
            packs: "id, manifestId, version, source, createdAt",
            rulesets: "id, updatedAt",
            characters: "meta.id, meta.rulesetId, schemaVersion, meta.updatedAt, meta.name",
            layouts: "id, characterId, rulesetId, updatedAt",
            imports: "++id, source, createdAt",
            migrations: "id, entity, at",
            overlays: "id, rulesetId, scope, characterId, updatedAt",
            canonicalCache: "id, documentKey, hash, updatedAt",
            syncReports: "++id, createdAt",
            creatorSessions: "id, rulesetId, updatedAt",
            creatorCatalogIndex: "id, packId, contentType, filePath, updatedAt",
            creatorCatalogCache: "id, packId, contentType, queryKey, updatedAt"
        });
    }
}

export const db = new RPGForgeV2Db();
let legacyMigrationChecked = false;

async function ensureLegacyMigration(): Promise<void> {
    if (legacyMigrationChecked) return;
    legacyMigrationChecked = true;

    const migrationId = "system:db:gaminator_v2->rpgforge_v2";
    const already = await db.migrations.get(migrationId);
    if (already) return;

    const legacy = new Dexie("gaminator_v2");
    legacy.version(1).stores({
        packs: "id, manifestId, version, source, createdAt",
        rulesets: "id, updatedAt",
        characters: "meta.id, meta.rulesetId, schemaVersion, meta.updatedAt",
        layouts: "id, characterId, rulesetId, updatedAt",
        imports: "++id, source, createdAt",
        migrations: "id, entity, at"
    });

    try {
        await legacy.open();

        const [legacyPacks, legacyRulesets, legacyCharacters, legacyLayouts, legacyImports] = await Promise.all([
            legacy.table("packs").toArray() as Promise<PackRecord[]>,
            legacy.table("rulesets").toArray() as Promise<RulesetRecord[]>,
            legacy.table("characters").toArray() as Promise<CharacterDocumentV2[]>,
            legacy.table("layouts").toArray() as Promise<LayoutRecord[]>,
            legacy.table("imports").toArray() as Promise<ImportRecord[]>
        ]);

        if (legacyPacks.length) await db.packs.bulkPut(legacyPacks);
        if (legacyRulesets.length) await db.rulesets.bulkPut(legacyRulesets);
        if (legacyCharacters.length) await db.characters.bulkPut(legacyCharacters);
        if (legacyLayouts.length) await db.layouts.bulkPut(legacyLayouts);
        if (legacyImports.length) await db.imports.bulkPut(legacyImports);
        await db.migrations.put({
            id: migrationId,
            entity: "system",
            fromVersion: "gaminator_v2",
            toVersion: "rpgforge_v2",
            at: new Date().toISOString()
        });
    } catch {
        await db.migrations.put({
            id: migrationId,
            entity: "system",
            fromVersion: "gaminator_v2",
            toVersion: "rpgforge_v2",
            at: new Date().toISOString()
        });
    } finally {
        legacy.close();
    }
}

export async function persistPack(pack: LoadedPackV2): Promise<void> {
    await ensureLegacyMigration();
    const key = `${pack.manifest.id}@${pack.manifest.version}`;
    await db.packs.put({
        id: key,
        manifestId: pack.manifest.id,
        version: pack.manifest.version,
        source: pack.source,
        payload: pack,
        createdAt: new Date().toISOString()
    });
}

export async function loadAllPersistedPacks(): Promise<LoadedPackV2[]> {
    await ensureLegacyMigration();
    const rows = await db.packs.toArray();
    return rows.map(r => r.payload);
}

function latestPackForManifestId(records: PackRecord[]): LoadedPackV2 | null {
    if (!records.length) return null;
    const sorted = [...records].sort((a, b) => compareSemver(b.version, a.version));
    return sorted[0]?.payload || null;
}

export async function loadPersistedPacksForRoots(rootManifestIds: string[]): Promise<LoadedPackV2[]> {
    await ensureLegacyMigration();

    const queue = [...new Set(rootManifestIds.filter(Boolean))];
    const visited = new Set<string>();
    const out = new Map<string, LoadedPackV2>();

    while (queue.length) {
        const manifestId = queue.shift()!;
        if (!manifestId || visited.has(manifestId)) continue;
        visited.add(manifestId);

        const rows = await db.packs.where("manifestId").equals(manifestId).toArray();
        const latest = latestPackForManifestId(rows);
        if (!latest) continue;

        out.set(manifestId, latest);
        for (const dep of latest.manifest.dependsOn || []) {
            if (!visited.has(dep.id)) {
                queue.push(dep.id);
            }
        }
    }

    return [...out.values()];
}

export async function listPersistedPackManifestIds(): Promise<string[]> {
    await ensureLegacyMigration();
    const keys = await db.packs.toCollection().primaryKeys();
    const ids = new Set<string>();
    for (const keyRaw of keys) {
        const key = String(keyRaw);
        const at = key.lastIndexOf("@");
        const manifestId = at > 0 ? key.slice(0, at) : key;
        if (manifestId.startsWith("overlay_")) continue;
        ids.add(manifestId);
    }
    return [...ids].sort((a, b) => a.localeCompare(b));
}

export async function persistRuleset(ruleset: ResolvedRuleset): Promise<void> {
    await ensureLegacyMigration();
    await db.rulesets.put({
        id: ruleset.id,
        packIds: ruleset.packOrder,
        payload: ruleset,
        updatedAt: new Date().toISOString()
    });
}

export async function getRuleset(id: string): Promise<ResolvedRuleset | null> {
    await ensureLegacyMigration();
    const row = await db.rulesets.get(id);
    return row?.payload || null;
}

export async function persistLayout(characterId: string, rulesetId: string, layout: unknown): Promise<void> {
    await ensureLegacyMigration();
    const key = `${rulesetId}:${characterId}`;
    await db.layouts.put({
        id: key,
        characterId,
        rulesetId,
        layout,
        updatedAt: new Date().toISOString()
    });
}

export async function loadLayout(characterId: string, rulesetId: string): Promise<unknown | null> {
    await ensureLegacyMigration();
    const key = `${rulesetId}:${characterId}`;
    const row = await db.layouts.get(key);
    return row?.layout ?? null;
}

export async function persistImportReport(report: ImportReportV2): Promise<void> {
    await ensureLegacyMigration();
    await db.imports.add({
        source: report.source,
        report,
        createdAt: new Date().toISOString()
    });
}

export async function persistCharacter(doc: CharacterDocumentV2): Promise<void> {
    await ensureLegacyMigration();
    await db.characters.put(doc, doc.meta.id);
}

export async function getCharacter(id: string): Promise<CharacterDocumentV2 | null> {
    await ensureLegacyMigration();
    const row = await db.characters.get(id);
    return row || null;
}

function isArchivedCharacter(doc: CharacterDocumentV2): boolean {
    return doc.core.tags.includes("archived");
}

function compareIsoDesc(left: string, right: string): number {
    return right.localeCompare(left);
}

export async function listCharacterRows(query: CharacterListQuery = {}): Promise<CharacterDocumentV2[]> {
    await ensureLegacyMigration();

    const includeArchived = query.includeArchived === true;
    const nameNeedle = (query.name || "").trim().toLowerCase();
    const offset = Math.max(0, query.offset || 0);
    const limit = Math.max(1, query.limit || 25);

    let rows = await db.characters.toArray();
    if (query.rulesetId) {
        rows = rows.filter(row => row.meta.rulesetId.startsWith(query.rulesetId!));
    }
    if (nameNeedle) {
        rows = rows.filter(row => row.meta.name.toLowerCase().includes(nameNeedle));
    }
    if (!includeArchived) {
        rows = rows.filter(row => !isArchivedCharacter(row));
    }

    rows.sort((a, b) => {
        const byUpdatedAt = compareIsoDesc(a.meta.updatedAt, b.meta.updatedAt);
        if (byUpdatedAt !== 0) return byUpdatedAt;
        return a.meta.id.localeCompare(b.meta.id);
    });
    return rows.slice(offset, offset + limit);
}

export async function deleteCharacterRow(id: string): Promise<void> {
    await ensureLegacyMigration();
    await db.transaction("rw", db.characters, db.layouts, async () => {
        await db.characters.delete(id);
        await db.layouts.where("characterId").equals(id).delete();
    });
}

export async function recordMigration(entity: "character" | "pack" | "system", id: string, fromVersion: string, toVersion: string): Promise<void> {
    await ensureLegacyMigration();
    await db.migrations.put({
        id: `${entity}:${id}:${toVersion}`,
        entity,
        fromVersion,
        toVersion,
        at: new Date().toISOString()
    });
}

export async function persistOverlay(doc: OverlayPackDocumentV2): Promise<void> {
    await ensureLegacyMigration();
    await db.overlays.put({
        id: doc.meta.id,
        rulesetId: doc.meta.rulesetId,
        scope: doc.meta.scope,
        characterId: doc.meta.characterId,
        payload: doc,
        updatedAt: new Date().toISOString()
    });
}

export async function loadOverlays(rulesetId: string, characterId?: string): Promise<OverlayPackDocumentV2[]> {
    await ensureLegacyMigration();
    const all = await db.overlays.where("rulesetId").equals(rulesetId).toArray();
    return all
        .filter(row => row.scope === "global" || (row.scope === "character" && row.characterId === characterId))
        .map(row => row.payload);
}

export async function getOverlay(id: string): Promise<OverlayPackDocumentV2 | null> {
    await ensureLegacyMigration();
    const row = await db.overlays.get(id);
    return row?.payload || null;
}

export async function persistCanonicalEntities(entities: Open5eCanonicalEntityV2[]): Promise<void> {
    await ensureLegacyMigration();
    const now = new Date().toISOString();
    const rows: CanonicalCacheRecord[] = entities.map(entity => ({
        id: entity.id,
        documentKey: entity.source.documentKey,
        hash: entity.source.hash,
        payload: entity,
        updatedAt: now
    }));
    if (rows.length) {
        await db.canonicalCache.bulkPut(rows);
    }
}

export async function loadCanonicalEntities(documentKey?: "srd-2014" | "srd-2024"): Promise<Open5eCanonicalEntityV2[]> {
    await ensureLegacyMigration();
    if (!documentKey) {
        const rows = await db.canonicalCache.toArray();
        return rows.map(r => r.payload);
    }
    const rows = await db.canonicalCache.where("documentKey").equals(documentKey).toArray();
    return rows.map(r => r.payload);
}

export async function persistSyncReport(report: Open5eSyncReportV2, compile?: CompileReportV2): Promise<void> {
    await ensureLegacyMigration();
    await db.syncReports.add({
        report,
        compile,
        createdAt: new Date().toISOString()
    });
}

export async function persistCreatorSession(session: CreatorSessionV2): Promise<void> {
    await ensureLegacyMigration();
    await db.creatorSessions.put(session, session.id);
}

export async function getCreatorSession(id: string): Promise<CreatorSessionV2 | null> {
    await ensureLegacyMigration();
    const row = await db.creatorSessions.get(id);
    return row || null;
}

export async function getLatestCreatorSessionForRuleset(rulesetId: string): Promise<CreatorSessionV2 | null> {
    await ensureLegacyMigration();
    const rows = await db.creatorSessions.where("rulesetId").equals(rulesetId).toArray();
    if (!rows.length) return null;
    rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return rows[0];
}

export async function persistCreatorCatalogIndex(rows: CreatorCatalogIndexRecord[]): Promise<void> {
    await ensureLegacyMigration();
    if (!rows.length) return;
    await db.creatorCatalogIndex.bulkPut(rows);
}

export async function loadCreatorCatalogIndex(packId: string): Promise<CreatorCatalogIndexRecord[]> {
    await ensureLegacyMigration();
    return await db.creatorCatalogIndex.where("packId").equals(packId).toArray();
}

export async function clearCreatorCatalogIndex(packId: string): Promise<void> {
    await ensureLegacyMigration();
    await db.creatorCatalogIndex.where("packId").equals(packId).delete();
}

export async function persistCreatorCatalogCache(row: CreatorCatalogCacheRecord): Promise<void> {
    await ensureLegacyMigration();
    await db.creatorCatalogCache.put(row);
}

export async function loadCreatorCatalogCache(packId: string, contentType: string, queryKey: string): Promise<CreatorCatalogCacheRecord | null> {
    await ensureLegacyMigration();
    const id = `${packId}:${contentType}:${queryKey}`;
    const row = await db.creatorCatalogCache.get(id);
    return row || null;
}

export async function clearCreatorCatalogCache(packId: string): Promise<void> {
    await ensureLegacyMigration();
    await db.creatorCatalogCache.where("packId").equals(packId).delete();
}
