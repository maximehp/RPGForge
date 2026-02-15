import JSZip from "jszip";
import YAML from "yaml";
import { nanoid } from "nanoid";
import { importPackBundle as importPackBundleFile } from "../engine/v2/importer";
import { listBuiltinPackManifestsV2, loadBuiltinPackModulePartV2 } from "../engine/v2/builtinLoader";
import { activateRuleset } from "../engine/v2/resolver";
import type {
    ActionEnvelopeV2,
    CharacterDocumentV2,
    CompileReportV2,
    CreatorFieldV3,
    CreatorRuleV3,
    CreatorSessionV2,
    ImportReportV2,
    LoadedPackV2,
    Open5eCanonicalEntityV2,
    Open5eSyncReportV2,
    OverlayPackDocumentV2,
    OverlayPackMetaV2,
    ResolvedRuleset
} from "../engine/v2/types";
import { compareSemver } from "../engine/v2/semver";
import {
    deleteCharacterRow,
    getCharacter,
    getCreatorSession,
    getLatestCreatorSessionForRuleset,
    getOverlay,
    getRuleset,
    listCharacterRows,
    listPersistedPackManifestIds,
    loadCanonicalEntities,
    loadOverlays,
    loadPersistedPacksForRoots,
    persistCanonicalEntities,
    persistCharacter,
    persistCreatorSession,
    persistImportReport,
    persistOverlay,
    persistPack,
    persistRuleset,
    persistSyncReport,
    type CharacterListQuery as CharacterListQueryDb
} from "./v2Database";
import { createCharacter as createCharacterDoc, dispatchAction as dispatchCharacterAction } from "../runtime/v2/characterRuntime";
import { loadLayoutState } from "./v2LayoutService";
import { migrateCharacter as migrateCharacterDoc, migratePack as migratePackManifest } from "../runtime/v2/migrations";
import { compileCanonicalToPackArtifacts as compileCanonicalArtifacts, syncOpen5eSrd as syncOpen5eSrdEngine } from "../engine/v2/open5eImporter";
import { evaluateCreatorRules } from "../runtime/v2/creatorRules";
import { invalidateCreatorCatalog, queryCreatorCatalog, warmCreatorCatalog } from "./v2CatalogService";

const PACK_ID_ALIASES: Record<string, string> = {
    "dnd_5e_2024": "dnd_srd_5e_2024",
    "dnd_srd_5e": "dnd_srd_5e_2024",
    "srd_2024": "dnd_srd_5e_2024",
    "srd_2014": "dnd_srd_5e_2014"
};

export type CharacterListQuery = CharacterListQueryDb;

export type CharacterListItem = {
    id: string;
    name: string;
    rulesetId: string;
    createdAt: string;
    updatedAt: string;
    level: number;
    archived: boolean;
};

export type OpenCharacterOptions = {
    ignoreLayout?: boolean;
    attemptMigration?: boolean;
};

export type OpenCharacterResult = {
    character: CharacterDocumentV2;
    ruleset: ResolvedRuleset;
    layoutState: unknown | null;
    warnings: string[];
};

export type CreatorStepHydration = {
    step: unknown;
    options: Record<string, Array<{ value: string; label: string; meta?: Record<string, unknown> }>>;
    issues: Array<{ id: string; severity: "error" | "warning"; message: string }>;
};

export function resolvePackAlias(id: string): string {
    return PACK_ID_ALIASES[id] || id;
}

function uniqueByVersion(packs: LoadedPackV2[]): LoadedPackV2[] {
    const out = new Map<string, LoadedPackV2>();
    for (const p of packs) {
        const key = `${p.manifest.id}@${p.manifest.version}`;
        out.set(key, p);
    }
    return [...out.values()];
}

function latestForId(packs: LoadedPackV2[], manifestId: string): LoadedPackV2 | null {
    const matches = packs.filter(p => p.manifest.id === manifestId);
    if (!matches.length) return null;
    matches.sort((a, b) => compareSemver(b.manifest.version, a.manifest.version));
    return matches[0];
}

async function collectBuiltinDependencyIds(requestedPackIds: string[]): Promise<string[]> {
    const manifests = await listBuiltinPackManifestsV2();
    const manifestById = new Map(manifests.map(m => [m.id, m]));
    const needed = new Set<string>();
    const visiting = new Set<string>();

    const visit = (id: string) => {
        if (needed.has(id)) return;
        if (visiting.has(id)) {
            throw new Error(`Cyclic dependency detected at pack "${id}"`);
        }
        const manifest = manifestById.get(id);
        if (!manifest) return;

        visiting.add(id);
        for (const dep of manifest.dependsOn || []) {
            visit(dep.id);
        }
        visiting.delete(id);
        needed.add(id);
    };

    for (const rawId of requestedPackIds) {
        visit(resolvePackAlias(rawId));
    }

    return [...needed].sort((a, b) => a.localeCompare(b));
}

async function ensureBuiltinPacksLoaded(requestedPackIds: string[]): Promise<void> {
    const ids = await collectBuiltinDependencyIds(requestedPackIds);
    for (const id of ids) {
        const builtIn = await loadBuiltinPackModulePartV2(id, ["model", "rules", "ui", "actions", "creator", "authoring", "effects"]);
        if (!builtIn) continue;
        await persistPack({
            manifest: builtIn.manifest,
            module: builtIn.module,
            source: "builtin",
            sourceRef: `builtin:${id}`
        });
    }
}

async function allKnownPacks(requestedPackIds: string[], rulesetId?: string, characterId?: string): Promise<LoadedPackV2[]> {
    await ensureBuiltinPacksLoaded(requestedPackIds);

    const overlays = rulesetId ? await loadOverlays(rulesetId, characterId) : [];
    const overlayPacks: LoadedPackV2[] = overlays.map(o => ({
        manifest: o.manifest,
        module: o.module,
        source: "overlay",
        sourceRef: o.meta.id
    }));

    const roots = new Set<string>(requestedPackIds.map(resolvePackAlias));
    if (rulesetId) {
        roots.add(resolvePackAlias(rootPackIdFromRulesetId(rulesetId)));
    }
    const persisted = await loadPersistedPacksForRoots([...roots]);
    return uniqueByVersion([...persisted, ...overlayPacks]);
}

function isArchived(doc: CharacterDocumentV2): boolean {
    return doc.core.tags.includes("archived");
}

function toCharacterListItem(doc: CharacterDocumentV2): CharacterListItem {
    return {
        id: doc.meta.id,
        name: doc.meta.name,
        rulesetId: doc.meta.rulesetId,
        createdAt: doc.meta.createdAt,
        updatedAt: doc.meta.updatedAt,
        level: doc.core.level,
        archived: isArchived(doc)
    };
}

function isCreatorV3(creator: unknown): creator is { schemaVersion: "3.0.0"; steps: unknown[]; rules?: CreatorRuleV3[] } {
    return Boolean(creator)
        && typeof creator === "object"
        && (creator as { schemaVersion?: string }).schemaVersion === "3.0.0";
}

function extractPackIdFromRulesetId(rulesetId: string): string {
    return rulesetId.split("@")[0] || rulesetId;
}

export async function listAvailablePackIds(): Promise<string[]> {
    const [builtinManifests, persistedIds] = await Promise.all([
        listBuiltinPackManifestsV2(),
        listPersistedPackManifestIds()
    ]);

    const ids = new Set<string>();
    for (const manifest of builtinManifests) ids.add(manifest.id);
    for (const id of persistedIds) ids.add(id);
    return [...ids].sort((a, b) => a.localeCompare(b));
}

export async function importPackBundle(file: File): Promise<ImportReportV2> {
    const { pack, report } = await importPackBundleFile(file);
    if (pack) {
        await persistPack(pack);
        report.resolvedDependencies = (pack.manifest.dependsOn || []).map(d => `${d.id}@${d.range}`);
    }
    await persistImportReport(report);
    return report;
}

export async function activatePacks(packIds: string[], characterId?: string): Promise<ResolvedRuleset> {
    const known = await allKnownPacks(packIds, undefined, characterId);
    const requested: string[] = [];

    for (const rawId of packIds) {
        const id = resolvePackAlias(rawId);
        const latest = latestForId(known, id);
        if (!latest) throw new Error(`Pack not found: ${id}`);
        requested.push(latest.manifest.id);
    }

    const resolved = activateRuleset(known, requested);
    await persistRuleset(resolved);
    return resolved;
}

export async function createCharacter(rulesetId: string, seed?: unknown): Promise<CharacterDocumentV2> {
    const ruleset = await getRuleset(rulesetId);
    if (!ruleset) {
        throw new Error(`Ruleset not found: ${rulesetId}. Activate packs before creating characters.`);
    }
    const doc = await createCharacterDoc(rulesetId, ruleset, seed);
    await persistCharacter(doc);
    return doc;
}

export async function dispatchAction(characterId: string, action: ActionEnvelopeV2): Promise<CharacterDocumentV2> {
    const current = await getCharacter(characterId);
    if (!current) throw new Error(`Character not found: ${characterId}`);

    const ruleset = await getRuleset(current.meta.rulesetId);
    if (!ruleset) throw new Error(`Ruleset not found: ${current.meta.rulesetId}`);

    const next = await dispatchCharacterAction(characterId, ruleset, current, action);
    await persistCharacter(next);
    return next;
}

export async function saveCharacter(doc: CharacterDocumentV2): Promise<void> {
    await persistCharacter(doc);
}

export async function loadCharacter(id: string): Promise<CharacterDocumentV2> {
    const doc = await getCharacter(id);
    if (!doc) throw new Error(`Character not found: ${id}`);
    return doc;
}

export async function listCharacters(query: CharacterListQuery = {}): Promise<CharacterListItem[]> {
    const rows = await listCharacterRows(query);
    return rows.map(toCharacterListItem);
}

export async function getRecentCharacters(limit = 10): Promise<CharacterListItem[]> {
    return await listCharacters({ limit: Math.max(1, limit), offset: 0, includeArchived: false });
}

export async function deleteCharacter(id: string): Promise<void> {
    await deleteCharacterRow(id);
}

export async function archiveCharacter(id: string): Promise<CharacterListItem> {
    const doc = await getCharacter(id);
    if (!doc) throw new Error(`Character not found: ${id}`);

    if (!doc.core.tags.includes("archived")) {
        doc.core.tags = [...doc.core.tags, "archived"];
    }
    doc.meta.updatedAt = new Date().toISOString();
    await persistCharacter(doc);
    return toCharacterListItem(doc);
}

function rootPackIdFromRulesetId(rulesetId: string): string {
    const [head] = rulesetId.split("@");
    return head || rulesetId;
}

async function resolveRulesetForCharacter(doc: CharacterDocumentV2): Promise<ResolvedRuleset> {
    const packIds = doc.appliedPacks?.length
        ? doc.appliedPacks
        : [resolvePackAlias(rootPackIdFromRulesetId(doc.meta.rulesetId))];

    const known = await allKnownPacks(packIds, doc.meta.rulesetId, doc.meta.id);
    const resolved = activateRuleset(known, packIds.map(resolvePackAlias));
    await persistRuleset(resolved);
    return resolved;
}

export async function loadCharacterForOpen(id: string, options: OpenCharacterOptions = {}): Promise<OpenCharacterResult> {
    const warnings: string[] = [];
    let doc = await loadCharacter(id);
    const originalRulesetId = doc.meta.rulesetId;

    if (options.attemptMigration || doc.schemaVersion !== "2.0.0") {
        const migrated = migrateCharacterDoc(doc, "2.0.0");
        migrated.meta.updatedAt = new Date().toISOString();
        doc = migrated;
        warnings.push("Character document was migrated to schema 2.0.0.");
        await persistCharacter(doc);
    }

    const ruleset = await resolveRulesetForCharacter(doc);
    const expectedRoot = rootPackIdFromRulesetId(doc.meta.rulesetId);
    const resolvedRoot = rootPackIdFromRulesetId(ruleset.id);
    if (expectedRoot && expectedRoot !== "unknown" && expectedRoot !== resolvedRoot) {
        throw new Error(`Ruleset mismatch for character ${doc.meta.id}: expected ${expectedRoot}, resolved ${resolvedRoot}`);
    }

    if (doc.meta.rulesetId !== ruleset.id) {
        doc = {
            ...doc,
            meta: {
                ...doc.meta,
                rulesetId: ruleset.id,
                updatedAt: new Date().toISOString()
            }
        };
        await persistCharacter(doc);
        warnings.push(`Character ruleset updated to ${ruleset.id}.`);
    }

    let layoutState: unknown | null = null;
    if (!options.ignoreLayout) {
        layoutState = await loadLayoutState(doc.meta.id, ruleset.id);
        if (!layoutState && originalRulesetId !== ruleset.id) {
            layoutState = await loadLayoutState(doc.meta.id, originalRulesetId);
        }
    }
    return {
        character: doc,
        ruleset,
        layoutState,
        warnings
    };
}

export const openCharacter = loadCharacterForOpen;

export async function createOverlayPack(
    rulesetId: string,
    scope: "global" | "character",
    characterId?: string,
    name = "Homebrew Overlay"
): Promise<OverlayPackDocumentV2> {
    const id = `overlay_${nanoid(10)}`;
    const now = new Date().toISOString();

    const meta: OverlayPackMetaV2 = {
        id,
        rulesetId,
        scope,
        characterId,
        name,
        createdAt: now,
        updatedAt: now
    };

    const overlay: OverlayPackDocumentV2 = {
        meta,
        manifest: {
            schemaVersion: "2.0.0",
            id,
            name,
            version: "0.1.0",
            kind: "addon",
            description: "Local homebrew overlay pack",
            dependsOn: [{ id: rulesetId.split("@")[0], range: "*" }],
            entrypoints: {
                content: ["content/homebrew.yaml"],
                effects: "rules/effects.yaml",
                authoring: "ui/authoring.yaml"
            }
        },
        module: {
            content: {},
            effects: [],
            authoring: {
                enabled: true,
                templates: []
            }
        }
    };

    await persistOverlay(overlay);
    await persistPack({
        manifest: overlay.manifest,
        module: overlay.module,
        source: "overlay",
        sourceRef: id
    });

    return overlay;
}

export async function upsertOverlayEntity(
    overlayPackId: string,
    entity: {
        contentType: string;
        id: string;
        title?: string;
        data?: Record<string, unknown>;
        contentId?: { namespace: string; type: string; slug: string; revision?: string };
    }
): Promise<void> {
    const overlay = await getOverlay(overlayPackId);
    if (!overlay) throw new Error(`Overlay pack not found: ${overlayPackId}`);

    const contentType = entity.contentType;
    const existing = overlay.module.content?.[contentType] || [];
    const idx = existing.findIndex(e => e.id === entity.id);

    const nextEntry = {
        id: entity.id,
        title: entity.title,
        contentId: entity.contentId || {
            namespace: overlay.manifest.id,
            type: contentType,
            slug: entity.id
        },
        data: entity.data || {},
        mergePolicy: "replace" as const
    };

    const nextContent = [...existing];
    if (idx >= 0) {
        nextContent[idx] = nextEntry;
    } else {
        nextContent.push(nextEntry);
    }

    overlay.module.content = {
        ...(overlay.module.content || {}),
        [contentType]: nextContent
    };
    overlay.meta.updatedAt = new Date().toISOString();

    await persistOverlay(overlay);
    await persistPack({
        manifest: overlay.manifest,
        module: overlay.module,
        source: "overlay",
        sourceRef: overlay.meta.id
    });
}

export async function exportOverlayPack(overlayPackId: string): Promise<Blob> {
    const overlay = await getOverlay(overlayPackId);
    if (!overlay) throw new Error(`Overlay pack not found: ${overlayPackId}`);

    const zip = new JSZip();
    const manifest = { ...overlay.manifest };
    zip.file("manifest.yaml", YAML.stringify(manifest));
    zip.file("content/homebrew.yaml", YAML.stringify({ content: overlay.module.content || {} }));
    zip.file("rules/effects.yaml", YAML.stringify({ effects: overlay.module.effects || [] }));
    zip.file("ui/authoring.yaml", YAML.stringify({ authoring: overlay.module.authoring || { enabled: true } }));

    return await zip.generateAsync({ type: "blob" });
}

export async function startCharacterCreator(
    rulesetId: string,
    options?: { resume?: boolean }
): Promise<CreatorSessionV2> {
    const ruleset = await getRuleset(rulesetId);
    if (!ruleset) throw new Error(`Ruleset not found: ${rulesetId}`);

    if (options?.resume) {
        const existing = await getLatestCreatorSessionForRuleset(rulesetId);
        if (existing) return existing;
    }

    const now = new Date().toISOString();
    const session: CreatorSessionV2 = {
        id: nanoid(),
        rulesetId,
        createdAt: now,
        updatedAt: now,
        seed: {},
        steps: ruleset.creator?.steps || [],
        stepSnapshots: {},
        validation: { errors: [], warnings: [] },
        warningConfirmations: [],
        rollLog: []
    };

    await persistCreatorSession(session);
    if (isCreatorV3(ruleset.creator)) {
        const firstStep = ruleset.creator.steps[0];
        const preload = Array.isArray((firstStep as any)?.preloadContentTypes)
            ? ((firstStep as any).preloadContentTypes as string[])
            : [];
        if (preload.length) {
            void warmCreatorCatalog(extractPackIdFromRulesetId(rulesetId), preload).catch(() => {
                // warmup failure should not block creator session start
            });
        }
    }
    return session;
}

export async function upsertCreatorSessionProgress(sessionId: string, seedPatch: Record<string, unknown>): Promise<CreatorSessionV2> {
    const session = await getCreatorSession(sessionId);
    if (!session) throw new Error(`Creator session not found: ${sessionId}`);

    session.seed = { ...session.seed, ...seedPatch };
    session.updatedAt = new Date().toISOString();
    await persistCreatorSession(session);
    return session;
}

async function resolveCreatorRuleset(session: CreatorSessionV2): Promise<ResolvedRuleset> {
    const ruleset = await getRuleset(session.rulesetId);
    if (!ruleset) throw new Error(`Ruleset not found: ${session.rulesetId}`);
    return ruleset;
}

function contextFromSession(session: CreatorSessionV2): Record<string, unknown> {
    return {
        seed: session.seed,
        ...session.seed
    };
}

function gatherFieldRules(step: any): CreatorRuleV3[] {
    const out: CreatorRuleV3[] = [];
    const fields = Array.isArray(step?.fields) ? step.fields : [];
    for (const field of fields) {
        const rules = Array.isArray(field?.rules) ? field.rules : [];
        out.push(...rules);
        if (Array.isArray(field?.fields)) {
            out.push(...gatherFieldRules({ fields: field.fields }));
        }
    }
    return out;
}

function flattenCreatorFields(
    fields: CreatorFieldV3[],
    parentPath = ""
): Array<{ optionKey: string; field: CreatorFieldV3 }> {
    const out: Array<{ optionKey: string; field: CreatorFieldV3 }> = [];
    for (const field of fields) {
        const optionKey = parentPath ? `${parentPath}.${field.id}` : field.id;
        out.push({ optionKey, field });
        if (field.type === "repeatGroup" && Array.isArray(field.fields)) {
            out.push(...flattenCreatorFields(field.fields, optionKey));
        }
    }
    return out;
}

async function hydrateFieldOptions(
    packId: string,
    field: CreatorFieldV3,
    ruleset: ResolvedRuleset,
    query?: { search?: string; limit?: number; offset?: number }
): Promise<Array<{ value: string; label: string; meta?: Record<string, unknown> }>> {
    if (!field.options) return [];
    if (field.options.kind === "static") {
        return field.options.values || [];
    }
    if (field.options.kind === "content" && field.options.contentType) {
        return await queryCreatorCatalog(packId, field.options.contentType, {
            search: query?.search,
            limit: query?.limit ?? 100,
            offset: query?.offset ?? 0
        });
    }
    if (field.options.kind === "lookup" && field.options.lookupTable) {
        const table = ruleset.rules.lookups[field.options.lookupTable] || {};
        const pairs = Object.entries(table);
        pairs.sort((a, b) => Number(a[0]) - Number(b[0]));
        return pairs.map(([value]) => ({ value, label: value }));
    }
    return [];
}

export async function hydrateCreatorStep(
    sessionId: string,
    stepId: string,
    query?: { search?: string; limit?: number; offset?: number }
): Promise<CreatorStepHydration> {
    const session = await getCreatorSession(sessionId);
    if (!session) throw new Error(`Creator session not found: ${sessionId}`);
    const ruleset = await resolveCreatorRuleset(session);
    if (!isCreatorV3(ruleset.creator)) {
        throw new Error("Creator hydration requires a V3 creator schema.");
    }

    const step = ruleset.creator.steps.find(s => (s as any).id === stepId);
    if (!step) throw new Error(`Creator step not found: ${stepId}`);

    const options: Record<string, Array<{ value: string; label: string; meta?: Record<string, unknown> }>> = {};
    const packId = extractPackIdFromRulesetId(ruleset.id);
    const fields = Array.isArray((step as any).fields) ? (step as any).fields as CreatorFieldV3[] : [];
    const flattened = flattenCreatorFields(fields);
    for (const item of flattened) {
        options[item.optionKey] = await hydrateFieldOptions(packId, item.field, ruleset, query);
    }

    const issues = evaluateCreatorRules(
        [
            ...(ruleset.creator.rules || []),
            ...((step as any).rules || []),
            ...gatherFieldRules(step)
        ],
        contextFromSession(session)
    );
    session.validation = {
        errors: issues.filter(issue => issue.severity === "error"),
        warnings: issues.filter(issue => issue.severity === "warning")
    };
    session.stepSnapshots = {
        ...(session.stepSnapshots || {}),
        [stepId]: {
            hydratedAt: new Date().toISOString(),
            query: query || {}
        }
    };
    session.updatedAt = new Date().toISOString();
    await persistCreatorSession(session);

    const stepIndex = ruleset.creator.steps.findIndex(s => (s as any).id === stepId);
    const preload = Array.isArray((step as any).preloadContentTypes) ? (step as any).preloadContentTypes as string[] : [];
    const next = stepIndex >= 0 ? ruleset.creator.steps[stepIndex + 1] : undefined;
    const nextStepWarm = next
        ? [
            ...((Array.isArray((next as any).preloadContentTypes) ? (next as any).preloadContentTypes : []) as string[]),
            ...((Array.isArray((next as any).searchContentTypes) ? (next as any).searchContentTypes : []) as string[])
        ]
        : [];
    const warmTypes = [...new Set([...preload, ...nextStepWarm])];
    if (warmTypes.length) {
        void warmCreatorCatalog(packId, warmTypes).catch(() => {
            // background warmup failures are non-blocking
        });
    }

    return {
        step,
        options,
        issues
    };
}

export async function updateCreatorSessionSelection(
    sessionId: string,
    patch: Record<string, unknown>
): Promise<CreatorSessionV2> {
    return await upsertCreatorSessionProgress(sessionId, patch);
}

export async function validateCreatorSession(
    sessionId: string,
    stepId?: string
): Promise<{ errors: Array<{ id: string; message: string }>; warnings: Array<{ id: string; message: string }> }> {
    const session = await getCreatorSession(sessionId);
    if (!session) throw new Error(`Creator session not found: ${sessionId}`);
    const ruleset = await resolveCreatorRuleset(session);
    if (!isCreatorV3(ruleset.creator)) {
        return { errors: [], warnings: [] };
    }

    const rules: CreatorRuleV3[] = [...(ruleset.creator.rules || [])];
    if (stepId) {
        const step = ruleset.creator.steps.find(s => (s as any).id === stepId);
        if (step) {
            rules.push(...((step as any).rules || []));
            rules.push(...gatherFieldRules(step));
        }
    } else {
        for (const step of ruleset.creator.steps) {
            rules.push(...((step as any).rules || []));
            rules.push(...gatherFieldRules(step));
        }
    }
    const issues = evaluateCreatorRules(rules, contextFromSession(session));
    const errors = issues
        .filter(issue => issue.severity === "error")
        .map(issue => ({ id: issue.id, message: issue.message }));
    const warnings = issues
        .filter(issue => issue.severity === "warning")
        .map(issue => ({ id: issue.id, message: issue.message }));

    session.validation = { errors, warnings };
    session.updatedAt = new Date().toISOString();
    await persistCreatorSession(session);
    return { errors, warnings };
}

export async function confirmCreatorWarnings(sessionId: string, warningIds: string[]): Promise<CreatorSessionV2> {
    const session = await getCreatorSession(sessionId);
    if (!session) throw new Error(`Creator session not found: ${sessionId}`);
    session.warningConfirmations = [...new Set([...(session.warningConfirmations || []), ...warningIds])];
    session.updatedAt = new Date().toISOString();
    await persistCreatorSession(session);
    return session;
}

export async function invalidateCreatorCatalogForRuleset(rulesetId: string): Promise<void> {
    const packId = extractPackIdFromRulesetId(rulesetId);
    await invalidateCreatorCatalog(packId);
}

export async function completeCharacterCreator(sessionId: string, choices: Record<string, unknown>): Promise<CharacterDocumentV2> {
    const session = await upsertCreatorSessionProgress(sessionId, choices);
    const validation = await validateCreatorSession(sessionId);
    if (validation.errors.length) {
        throw new Error(`Creator has blocking validation errors: ${validation.errors.map(e => e.message).join("; ")}`);
    }
    if (validation.warnings.length) {
        const confirmations = new Set(session.warningConfirmations || []);
        const missing = validation.warnings.filter(w => !confirmations.has(w.id));
        if (missing.length) {
            throw new Error(`Creator requires warning confirmations: ${missing.map(w => w.message).join("; ")}`);
        }
    }
    return await createCharacter(session.rulesetId, session.seed);
}

export async function syncOpen5eSrd(options?: {
    documents?: Array<"srd-2014" | "srd-2024">;
    endpointFilter?: string[];
}): Promise<Open5eSyncReportV2> {
    const { entities, report } = await syncOpen5eSrdEngine(options);
    await persistCanonicalEntities(entities);
    await persistSyncReport(report);
    return report;
}

export async function compileCanonicalToPackArtifacts(input?: Open5eCanonicalEntityV2[]): Promise<CompileReportV2> {
    const entities = input || await loadCanonicalEntities();
    const { report } = compileCanonicalArtifacts(entities);
    await persistSyncReport({
        startedAt: report.generatedAt,
        finishedAt: report.generatedAt,
        documents: ["srd-2014", "srd-2024"],
        endpoints: [],
        pagesFetched: 0,
        entitiesTotal: entities.length,
        warnings: [],
        errors: []
    }, report);
    return report;
}

export const migrateCharacter = migrateCharacterDoc;
export const migratePack = migratePackManifest;
