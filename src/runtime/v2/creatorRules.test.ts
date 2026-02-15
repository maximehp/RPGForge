import { describe, expect, it } from "vitest";
import { evaluateCreatorRules } from "./creatorRules";

describe("creatorRules", () => {
    it("evaluates error and warning rules with helper functions", () => {
        const issues = evaluateCreatorRules([
            {
                id: "level-range",
                severity: "error",
                when: "level_total > 20",
                message: "Too high"
            },
            {
                id: "missing-spells",
                severity: "warning",
                when: "size(spell_ids) == 0",
                message: "No spells"
            }
        ], {
            level_total: 21,
            spell_ids: []
        });

        expect(issues).toHaveLength(2);
        expect(issues[0].severity).toBe("error");
        expect(issues[1].severity).toBe("warning");
    });
});
