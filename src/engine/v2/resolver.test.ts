import { describe, it, expect } from "vitest";
import type { LoadedPackV2 } from "./types";
import { resolvePackOrder, mergeResolvedRuleset } from "./resolver";

function mkPack(input: Partial<LoadedPackV2> & { id: string; version: string; kind?: "core" | "addon" }): LoadedPackV2 {
    return {
        manifest: {
            schemaVersion: "2.0.0",
            id: input.id,
            name: input.id,
            version: input.version,
            kind: input.kind || "core",
            dependsOn: input.manifest?.dependsOn || [],
            entrypoints: {}
        },
        module: input.module || {},
        source: "builtin",
        sourceRef: input.id
    };
}

describe("V2 pack resolver", () => {
    it("resolves dependencies in deterministic order", () => {
        const core = mkPack({ id: "core", version: "1.0.0" });
        const addon = mkPack({
            id: "addon",
            version: "1.0.0",
            kind: "addon",
            manifest: {
                dependsOn: [{ id: "core", range: "^1.0.0" }]
            }
        } as any);

        const result = resolvePackOrder([addon, core], ["addon"]);
        expect(result.ordered.map(p => p.manifest.id)).toEqual(["core", "addon"]);
    });

    it("throws on missing dependency", () => {
        const addon = mkPack({
            id: "addon",
            version: "1.0.0",
            kind: "addon",
            manifest: {
                dependsOn: [{ id: "core", range: "^1.0.0" }]
            }
        } as any);

        expect(() => resolvePackOrder([addon], ["addon"])).toThrow(/Missing dependency/);
    });

    it("throws on dependency cycles", () => {
        const a = mkPack({
            id: "a",
            version: "1.0.0",
            manifest: { dependsOn: [{ id: "b", range: "^1.0.0" }] }
        } as any);
        const b = mkPack({
            id: "b",
            version: "1.0.0",
            manifest: { dependsOn: [{ id: "a", range: "^1.0.0" }] }
        } as any);

        expect(() => resolvePackOrder([a, b], ["a"])).toThrow(/Cyclic dependency/);
    });

    it("reports override conflicts during merge", () => {
        const base = mkPack({
            id: "base",
            version: "1.0.0",
            module: {
                content: {
                    items: [{
                        id: "shield",
                        contentId: { namespace: "base", type: "item", slug: "shield" },
                        data: {}
                    }]
                }
            }
        });
        const patch = mkPack({
            id: "patch",
            version: "1.0.1",
            module: {
                content: {
                    items: [{
                        id: "shield",
                        contentId: { namespace: "patch", type: "item", slug: "shield" },
                        data: { bonus: 3 }
                    }]
                }
            }
        });

        const merged = mergeResolvedRuleset([base, patch]);
        expect(merged.content.items.shield.contentId.namespace).toBe("patch");
        expect(merged.conflicts).toHaveLength(1);
    });
});
