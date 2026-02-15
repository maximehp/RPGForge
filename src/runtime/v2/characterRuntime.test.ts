import { describe, it, expect } from "vitest";
import type { ResolvedRuleset } from "../../engine/v2/types";
import { createCharacter, dispatchAction } from "./characterRuntime";

const ruleset: ResolvedRuleset = {
    id: "sandbox@2.0.0",
    packOrder: ["sandbox"],
    manifests: [],
    model: {
        core: {
            stats: [{ id: "power", default: 5 }],
            resources: [{ id: "energy", default: 10, maxFormula: "10 + stats.power" }],
            collections: [{ id: "activity_log" }, { id: "inventory" }],
            flags: [{ id: "boosted", default: false }]
        },
        extensions: []
    },
    rules: {
        formulas: {
            "derived.damage": "stats.power * 2"
        },
        lookups: {},
        hooks: {}
    },
    ui: { layout: { groups: [] }, panels: [] },
    actions: {
        setAttribute: { id: "setAttribute", kind: "domain", target: "setStat" },
        toggleVar: { id: "toggleVar", kind: "domain", target: "toggleFlag" },
        createEntity: { id: "createEntity", kind: "domain", target: "createEntity" },
        equipEntity: { id: "equipEntity", kind: "domain", target: "equipEntity" }
    },
    content: {},
    effects: [],
    conflicts: []
};

describe("characterRuntime V2", () => {
    it("creates and recomputes derived values", async () => {
        const doc = await createCharacter(ruleset.id, ruleset, { name: "Pilot" });
        expect(doc.meta.name).toBe("Pilot");
        expect(doc.derived.damage).toBe(10);
        expect(doc.components.effectiveResources.energy.max).toBe(15);
    });

    it("dispatches domain action with payload", async () => {
        const doc = await createCharacter(ruleset.id, ruleset, {});
        const next = await dispatchAction(doc.meta.id, ruleset, doc, {
            id: "setAttribute",
            payload: { key: "power", value: 8 }
        });

        expect(next.components.stats.power).toBe(8);
        expect(next.derived.damage).toBe(16);
    });

    it("fails safe for unknown hooks", async () => {
        const custom: ResolvedRuleset = {
            ...ruleset,
            rules: {
                ...ruleset.rules,
                formulas: {
                    "derived.hook_probe": "hook('unknown_hook', 10)"
                }
            }
        };

        const doc = await createCharacter(custom.id, custom, {});
        expect(doc.derived.hook_probe).toBe(0);
    });

    it("applies equipped item stat bonuses to derived formulas", async () => {
        const doc = await createCharacter(ruleset.id, ruleset, {});
        const withItem = await dispatchAction(doc.meta.id, ruleset, doc, {
            id: "createEntity",
            payload: {
                collection: "inventory",
                entity: {
                    id: "amp-core",
                    title: "Amp Core",
                    equipped: false,
                    effects: [
                        {
                            id: "power-plus-1",
                            modifiers: [{ target: "stat", key: "power", operation: "add", value: 1 }],
                            triggers: [{ kind: "equipped" }],
                            duration: { type: "while_equipped" }
                        }
                    ]
                }
            }
        });
        const equipped = await dispatchAction(doc.meta.id, ruleset, withItem, {
            id: "equipEntity",
            payload: { collection: "inventory", id: "amp-core" }
        });

        expect(equipped.components.effectiveStats.power).toBe(6);
        expect(equipped.derived.damage).toBe(12);
    });
});
