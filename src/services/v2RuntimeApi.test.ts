import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CharacterDocumentV2, LoadedPackV2, ResolvedRuleset } from "../engine/v2/types";

const sampleRuleset: ResolvedRuleset = {
    id: "sandbox_rpg@2.0.0",
    packOrder: ["sandbox_rpg"],
    manifests: [],
    model: { core: { stats: [], resources: [], collections: [], flags: [] }, extensions: [] },
    rules: { formulas: {}, lookups: {}, hooks: {} },
    ui: { layout: { groups: [] }, panels: [] },
    actions: {},
    content: {},
    effects: [],
    conflicts: []
};

const sampleCharacter: CharacterDocumentV2 = {
    schemaVersion: "2.0.0",
    meta: {
        id: "char_1",
        rulesetId: "sandbox_rpg@2.0.0",
        name: "Hero",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z"
    },
    core: {
        level: 1,
        xp: 0,
        tags: [],
        notes: ""
    },
    components: {
        stats: {},
        resources: {},
        effectiveStats: {},
        effectiveResources: {}
    },
    collections: {},
    derived: {},
    stateFlags: {},
    appliedPacks: ["sandbox_rpg"],
    overlayPackIds: []
};

const samplePack: LoadedPackV2 = {
    manifest: {
        schemaVersion: "2.0.0",
        id: "sandbox_rpg",
        name: "sandbox_rpg",
        version: "2.0.0",
        kind: "core",
        entrypoints: {}
    },
    module: {},
    source: "builtin",
    sourceRef: "test"
};

const dbMocks = vi.hoisted(() => ({
    getCharacter: vi.fn(async () => structuredClone(sampleCharacter)),
    getCreatorSession: vi.fn(async () => null),
    getLatestCreatorSessionForRuleset: vi.fn(async () => null),
    getOverlay: vi.fn(async () => null),
    getRuleset: vi.fn(async () => sampleRuleset),
    listCharacterRows: vi.fn(async () => [structuredClone(sampleCharacter)]),
    listPersistedPackManifestIds: vi.fn(async () => ["sandbox_rpg"]),
    deleteCharacterRow: vi.fn(async () => {}),
    loadPersistedPacksForRoots: vi.fn(async () => [samplePack]),
    loadCanonicalEntities: vi.fn(async () => []),
    loadOverlays: vi.fn(async () => []),
    persistCanonicalEntities: vi.fn(async () => {}),
    persistCharacter: vi.fn(async () => {}),
    persistCreatorSession: vi.fn(async () => {}),
    persistImportReport: vi.fn(async () => {}),
    persistOverlay: vi.fn(async () => {}),
    persistPack: vi.fn(async () => {}),
    persistRuleset: vi.fn(async () => {}),
    persistSyncReport: vi.fn(async () => {})
}));

const layoutMocks = vi.hoisted(() => ({
    loadLayoutState: vi.fn(async () => ({ layout: "state" }))
}));

const resolverMocks = vi.hoisted(() => ({
    activateRuleset: vi.fn(() => sampleRuleset)
}));

vi.mock("./v2Database", () => dbMocks);
vi.mock("./v2LayoutService", () => layoutMocks);
vi.mock("../engine/v2/resolver", () => resolverMocks);
vi.mock("../engine/v2/builtinLoader", () => ({
    listBuiltinPackManifestsV2: vi.fn(async () => []),
    loadBuiltinPackModulePartV2: vi.fn(async () => null)
}));
vi.mock("../engine/v2/importer", () => ({
    importPackBundle: vi.fn(async () => ({ pack: null, report: { source: "test", errors: [], warnings: [], conflicts: [], resolvedDependencies: [] } }))
}));
vi.mock("../runtime/v2/characterRuntime", () => ({
    createCharacter: vi.fn(),
    dispatchAction: vi.fn()
}));
vi.mock("../runtime/v2/migrations", () => ({
    migrateCharacter: vi.fn((doc: unknown) => doc),
    migratePack: vi.fn()
}));
vi.mock("../engine/v2/open5eImporter", () => ({
    compileCanonicalToPackArtifacts: vi.fn(() => ({ report: { generatedAt: "", entitiesIn: 0, entitiesOut: 0, effectsCompiled: 0, unmappedRules: 0, warnings: [] } })),
    syncOpen5eSrd: vi.fn(async () => ({ entities: [], report: { startedAt: "", finishedAt: "", documents: [], endpoints: [], pagesFetched: 0, entitiesTotal: 0, warnings: [], errors: [] } }))
}));

import { archiveCharacter, listCharacters, loadCharacterForOpen } from "./v2RuntimeApi";

describe("v2RuntimeApi", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("lists character rows as browser-friendly items", async () => {
        const rows = await listCharacters({ limit: 10 });
        expect(dbMocks.listCharacterRows).toHaveBeenCalled();
        expect(rows).toHaveLength(1);
        expect(rows[0].name).toBe("Hero");
        expect(rows[0].archived).toBe(false);
    });

    it("archives a character by adding archived tag and persisting", async () => {
        const row = await archiveCharacter("char_1");
        expect(dbMocks.persistCharacter).toHaveBeenCalledTimes(1);
        expect(row.archived).toBe(true);
    });

    it("opens character with ruleset resolution and optional layout skip", async () => {
        const withLayout = await loadCharacterForOpen("char_1");
        expect(resolverMocks.activateRuleset).toHaveBeenCalled();
        expect(layoutMocks.loadLayoutState).toHaveBeenCalled();
        expect(withLayout.layoutState).toEqual({ layout: "state" });

        layoutMocks.loadLayoutState.mockClear();
        const withoutLayout = await loadCharacterForOpen("char_1", { ignoreLayout: true });
        expect(layoutMocks.loadLayoutState).not.toHaveBeenCalled();
        expect(withoutLayout.layoutState).toBeNull();
    });
});
