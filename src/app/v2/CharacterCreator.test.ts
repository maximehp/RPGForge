import { describe, expect, it } from "vitest";
import type { CharacterCreatorPresetV3 } from "../../engine/v2/types";
import { validateCreatorStepV3 } from "./CharacterCreator";

const preset: CharacterCreatorPresetV3 = {
    schemaVersion: "3.0.0",
    title: "Test Creator",
    steps: [
        {
            id: "identity",
            title: "Identity",
            fields: [
                { id: "name", label: "Name", type: "text", required: true, bindTo: "name" },
                { id: "level", label: "Level", type: "number", required: true, bindTo: "level" },
                { id: "classes", label: "Classes", type: "multiSelect", required: true, bindTo: "classes" }
            ]
        }
    ]
};

describe("CharacterCreator V3 helpers", () => {
    it("reports required field errors", () => {
        const step = preset.steps[0];
        const errors = validateCreatorStepV3(step, {});
        expect(errors.name).toMatch(/required/i);
        expect(errors.level).toMatch(/required/i);
        expect(errors.classes).toMatch(/required/i);
    });

    it("accepts complete values", () => {
        const step = preset.steps[0];
        const errors = validateCreatorStepV3(step, {
            name: "Ari",
            level: 3,
            classes: ["wizard"]
        });
        expect(Object.keys(errors)).toHaveLength(0);
    });
});
