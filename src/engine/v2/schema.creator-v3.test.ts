import { describe, expect, it } from "vitest";
import { parseCreatorPresetV3 } from "./schema";

describe("creator schema V3", () => {
    it("parses valid V3 creator preset", () => {
        const parsed = parseCreatorPresetV3({
            schemaVersion: "3.0.0",
            title: "Test",
            steps: [
                {
                    id: "identity",
                    title: "Identity",
                    fields: [
                        { id: "name", label: "Name", type: "text", required: true }
                    ]
                }
            ]
        });
        expect(parsed.schemaVersion).toBe("3.0.0");
        expect(parsed.steps).toHaveLength(1);
    });
});
