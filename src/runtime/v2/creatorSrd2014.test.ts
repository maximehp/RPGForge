import { describe, expect, it } from "vitest";
import type { ResolvedRuleset } from "../../engine/v2/types";
import {
    evaluateSrd2014CreatorIssues,
    normalizeSrd2014CreatorSeed,
    spellLevelCap
} from "./creatorSrd2014";

const ruleset: ResolvedRuleset = {
    id: "dnd_srd_5e_2014@2.0.0",
    packOrder: ["dnd_srd_5e_2014"],
    manifests: [],
    model: { core: { stats: [], resources: [], collections: [], flags: [] }, extensions: [] },
    rules: { formulas: {}, lookups: {}, hooks: {} },
    ui: { layout: { groups: [] }, panels: [] },
    actions: {},
    content: {
        classes: {
            srd_wizard: {
                id: "srd_wizard",
                contentId: { namespace: "srd_2014", type: "class", slug: "srd_wizard" },
                title: "Wizard",
                data: {
                    features: [
                        {
                            key: "srd_wizard_ability-score-improvement",
                            name: "Ability Score Improvement",
                            gained_at: [{ level: 4 }]
                        }
                    ]
                }
            },
            "srd_school-of-evocation": {
                id: "srd_school-of-evocation",
                contentId: { namespace: "srd_2014", type: "class", slug: "srd_school-of-evocation" },
                title: "School of Evocation",
                data: { subclass_of: { key: "srd_wizard" } }
            }
        },
        spells: {
            "srd_magic-missile": {
                id: "srd_magic-missile",
                contentId: { namespace: "srd_2014", type: "spell", slug: "srd_magic-missile" },
                title: "Magic Missile",
                data: {
                    level: 1,
                    classes: [{ key: "srd_wizard" }]
                }
            },
            "srd_cure-wounds": {
                id: "srd_cure-wounds",
                contentId: { namespace: "srd_2014", type: "spell", slug: "srd_cure-wounds" },
                title: "Cure Wounds",
                data: {
                    level: 1,
                    classes: [{ key: "srd_cleric" }]
                }
            },
            srd_wish: {
                id: "srd_wish",
                contentId: { namespace: "srd_2014", type: "spell", slug: "srd_wish" },
                title: "Wish",
                data: {
                    level: 9,
                    classes: [{ key: "srd_wizard" }]
                }
            }
        },
        feats: {},
        races: {},
        items: {}
    },
    creator: {
        schemaVersion: "3.0.0",
        steps: []
    },
    effects: [],
    conflicts: []
};

describe("creatorSrd2014", () => {
    it("flags class level mismatches and missing subclasses", () => {
        const issues = evaluateSrd2014CreatorIssues(ruleset, {
            level_total: 5,
            class_plan: [{ class_id: "srd_wizard", levels: 5 }]
        }, "class_plan");

        expect(issues.some(issue => issue.id.includes("missing-subclass"))).toBe(true);
    });

    it("enforces point-buy budget and score range", () => {
        const issues = evaluateSrd2014CreatorIssues(ruleset, {
            ability_method: "point_buy",
            stats: {
                str: 15,
                dex: 15,
                con: 15,
                int: 15,
                wis: 15,
                cha: 15
            }
        }, "ability_scores");

        expect(issues.some(issue => issue.id === "point-buy-budget")).toBe(true);
    });

    it("validates spell class and spell-level caps", () => {
        const issues = evaluateSrd2014CreatorIssues(ruleset, {
            class_plan: [{ class_id: "srd_wizard", levels: 1 }],
            level_total: 1,
            spell_ids: ["srd_cure-wounds", "srd_wish"]
        }, "spells");

        expect(spellLevelCap({ class_plan: [{ class_id: "srd_wizard", levels: 1 }] })).toBe(1);
        expect(issues.some(issue => issue.id.includes("spell-class"))).toBe(true);
        expect(issues.some(issue => issue.id.includes("spell-level-cap"))).toBe(true);
    });

    it("normalizes package items and ASI feat selections", () => {
        const normalized = normalizeSrd2014CreatorSeed({
            selected_feats: ["feat_a"],
            asi_choices: [{ choice_type: "feat", feat_id: "feat_b" }],
            equipment_package_ids: ["pkg_wizard_default"],
            starting_items: ["item_a"]
        });

        expect(normalized.selected_feats).toEqual(["feat_a", "feat_b"]);
        expect(Array.isArray(normalized.starting_items)).toBe(true);
        expect((normalized.starting_items as string[]).length).toBeGreaterThan(1);
    });
});
