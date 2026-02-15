import { describe, expect, it } from "vitest";
import {
    listBuiltinPackContentFilesV2,
    listBuiltinPackManifestsV2,
    loadBuiltinPackByIdV2,
    loadBuiltinPackContentIndexV2,
    loadBuiltinPacksV2
} from "./builtinLoader";

describe("builtinLoader V2", () => {
    it("lists built-in manifests without loading full pack modules", async () => {
        const manifests = await listBuiltinPackManifestsV2();
        const ids = manifests.map(m => m.id);
        expect(ids).toContain("dnd_srd_5e_2024");
        expect(ids).toContain("dnd_srd_5e_2014");
        expect(ids).toContain("sandbox_rpg");
    });

    it("loads a single built-in pack by id", async () => {
        const pack = await loadBuiltinPackByIdV2("sandbox_rpg");
        expect(pack).not.toBeNull();
        expect(pack?.manifest.id).toBe("sandbox_rpg");
        expect(pack?.source).toBe("builtin");
    });

    it("loads all built-in packs on demand", async () => {
        const packs = await loadBuiltinPacksV2();
        expect(packs.length).toBeGreaterThanOrEqual(3);
        expect(packs.some(p => p.manifest.id === "dnd_srd_5e_2024")).toBe(true);
    });

    it("can read generated content index metadata for lazy creator catalogs", async () => {
        const files = await listBuiltinPackContentFilesV2("dnd_srd_5e_2014");
        expect(files.length).toBeGreaterThan(0);
        const index = await loadBuiltinPackContentIndexV2("dnd_srd_5e_2014");
        expect(index).toBeTruthy();
    });
});
