// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CharacterDocumentV2, ResolvedRuleset } from "../../engine/v2/types";

const ruleset: ResolvedRuleset = {
    id: "sandbox_rpg@2.0.0",
    packOrder: ["sandbox_rpg"],
    manifests: [],
    model: { core: { stats: [], resources: [], collections: [], flags: [] }, extensions: [] },
    rules: { formulas: {}, lookups: {}, hooks: {} },
    ui: {
        layout: {
            groups: [
                { id: "main", title: "Main", tabs: ["panel.main"] }
            ]
        },
        panels: [
            { id: "panel.main", title: "Main", section: "main", elements: [] }
        ]
    },
    actions: {},
    content: {},
    effects: [],
    conflicts: []
};

const character: CharacterDocumentV2 = {
    schemaVersion: "2.0.0",
    meta: {
        id: "char_1",
        rulesetId: "sandbox_rpg@2.0.0",
        name: "Hero",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z"
    },
    core: { level: 1, xp: 0, tags: [], notes: "" },
    components: { stats: {}, resources: {}, effectiveStats: {}, effectiveResources: {} },
    collections: {},
    derived: {},
    stateFlags: {},
    appliedPacks: ["sandbox_rpg"],
    overlayPackIds: []
};

const runtimeApiMocks = vi.hoisted(() => ({
    activatePacks: vi.fn(async () => ruleset),
    completeCharacterCreator: vi.fn(),
    dispatchAction: vi.fn(async () => character),
    getRecentCharacters: vi.fn(async () => [{
        id: "char_1",
        name: "Hero",
        rulesetId: "sandbox_rpg@2.0.0",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        level: 1,
        archived: false
    }]),
    invalidateCreatorCatalogForRuleset: vi.fn(async () => {}),
    importPackBundle: vi.fn(),
    listAvailablePackIds: vi.fn(async () => ["sandbox_rpg"]),
    loadCharacterForOpen: vi.fn(async () => ({
        character,
        ruleset,
        layoutState: null,
        warnings: []
    })),
    resolvePackAlias: vi.fn((id: string) => id),
    startCharacterCreator: vi.fn(),
    upsertCreatorSessionProgress: vi.fn()
}));

vi.mock("../../services/v2RuntimeApi", () => runtimeApiMocks);
vi.mock("../../services/v2LayoutService", () => ({
    saveLayoutState: vi.fn(async () => {})
}));
vi.mock("./DockviewWorkspace", () => ({
    DockviewWorkspace: () => <div>workspace-rendered</div>
}));

import { V2App } from "./V2App";

describe("V2App integration", () => {
    it("boots to recent list and opens a character into sheet workspace", async () => {
        const user = userEvent.setup();
        render(<V2App />);

        expect(await screen.findByText("Recent Characters")).toBeTruthy();
        expect(await screen.findByText("Hero")).toBeTruthy();

        await user.click(screen.getByRole("button", { name: "Open" }));
        expect(await screen.findByText("workspace-rendered")).toBeTruthy();
    });
});
