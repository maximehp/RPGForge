import { describe, it, expect } from "vitest";
import { compileCanonicalToPackArtifacts } from "./open5eImporter";
import type { Open5eCanonicalEntityV2 } from "./types";

describe("open5e importer compiler", () => {
    it("groups entities by document and kind and counts effects", () => {
        const entities: Open5eCanonicalEntityV2[] = [
            {
                id: "srd-2014:spell:test_spell",
                kind: "spell",
                title: "Test Spell",
                source: {
                    documentKey: "srd-2014",
                    endpoint: "spells",
                    fetchedAt: new Date().toISOString(),
                    hash: "abc"
                },
                data: {},
                effects: [],
                unmappedRules: []
            },
            {
                id: "srd-2024:item:test_item",
                kind: "item",
                title: "Test Item",
                source: {
                    documentKey: "srd-2024",
                    endpoint: "items",
                    fetchedAt: new Date().toISOString(),
                    hash: "def"
                },
                data: {},
                effects: [
                    {
                        id: "e1",
                        modifiers: [{ target: "stat", key: "str", value: 1 }]
                    }
                ],
                unmappedRules: ["text"]
            }
        ];

        const out = compileCanonicalToPackArtifacts(entities);
        expect(out.byDocument["srd-2014"].spell).toHaveLength(1);
        expect(out.byDocument["srd-2024"].item).toHaveLength(1);
        expect(out.report.effectsCompiled).toBe(1);
        expect(out.report.unmappedRules).toBe(1);
    });
});
