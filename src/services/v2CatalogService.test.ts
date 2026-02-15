import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LoadedPackV2 } from "../engine/v2/types";
import { db, persistPack } from "./v2Database";
import { invalidateCreatorCatalog, queryCreatorCatalog } from "./v2CatalogService";

describe("v2CatalogService", () => {
    beforeEach(async () => {
        await db.delete();
        await db.open();
    });

    afterEach(async () => {
        await db.delete();
    });

    it("loads step options from indexed built-in content lazily", async () => {
        const rows = await queryCreatorCatalog("dnd_srd_5e_2014", "classes", { limit: 5, offset: 0 });
        expect(rows.length).toBeGreaterThan(0);
    });

    it("includes overlay/homebrew content in query results", async () => {
        const overlay: LoadedPackV2 = {
            manifest: {
                schemaVersion: "2.0.0",
                id: "overlay_test",
                name: "Overlay Test",
                version: "0.0.1",
                kind: "addon",
                dependsOn: [{ id: "dnd_srd_5e_2014", range: "*" }],
                entrypoints: {}
            },
            module: {
                content: {
                    feats: [
                        {
                            id: "custom_feat_alpha",
                            contentId: {
                                namespace: "overlay_test",
                                type: "feat",
                                slug: "custom_feat_alpha"
                            },
                            title: "Custom Feat Alpha",
                            data: {
                                name: "Custom Feat Alpha"
                            }
                        }
                    ]
                }
            },
            source: "overlay",
            sourceRef: "overlay_test"
        };
        await persistPack(overlay);
        await invalidateCreatorCatalog("dnd_srd_5e_2014");

        const rows = await queryCreatorCatalog("dnd_srd_5e_2014", "feats", { search: "alpha", limit: 20 });
        expect(rows.some(row => row.value === "custom_feat_alpha")).toBe(true);
    });
});
