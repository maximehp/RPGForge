import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CharacterDocumentV2 } from "../engine/v2/types";
import { db, deleteCharacterRow, listCharacterRows, persistCharacter, persistLayout } from "./v2Database";

function mkCharacter(input: {
    id: string;
    name: string;
    rulesetId: string;
    updatedAt: string;
    archived?: boolean;
}): CharacterDocumentV2 {
    return {
        schemaVersion: "2.0.0",
        meta: {
            id: input.id,
            rulesetId: input.rulesetId,
            name: input.name,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: input.updatedAt
        },
        core: {
            level: 1,
            xp: 0,
            tags: input.archived ? ["archived"] : [],
            notes: ""
        },
        components: {
            stats: {},
            resources: {},
            effectiveStats: {},
            effectiveResources: {}
        },
        collections: {},
        derived: {},
        stateFlags: {},
        appliedPacks: ["sandbox_rpg"],
        overlayPackIds: []
    };
}

describe("v2Database character queries", () => {
    beforeEach(async () => {
        await db.delete();
        await db.open();
    });

    afterEach(async () => {
        await db.delete();
    });

    it("lists non-archived characters sorted by updatedAt desc", async () => {
        await persistCharacter(mkCharacter({
            id: "c1",
            name: "Aria",
            rulesetId: "sandbox_rpg@2.0.0",
            updatedAt: "2026-02-01T00:00:00.000Z"
        }));
        await persistCharacter(mkCharacter({
            id: "c2",
            name: "Bram",
            rulesetId: "sandbox_rpg@2.0.0",
            updatedAt: "2026-02-03T00:00:00.000Z"
        }));
        await persistCharacter(mkCharacter({
            id: "c3",
            name: "Cara",
            rulesetId: "sandbox_rpg@2.0.0",
            updatedAt: "2026-02-02T00:00:00.000Z",
            archived: true
        }));

        const rows = await listCharacterRows({ limit: 25, offset: 0 });
        expect(rows.map(r => r.meta.id)).toEqual(["c2", "c1"]);
    });

    it("supports name/ruleset filter and pagination", async () => {
        await persistCharacter(mkCharacter({
            id: "c1",
            name: "Mage One",
            rulesetId: "dnd_srd_5e_2024@2.0.0",
            updatedAt: "2026-02-01T00:00:00.000Z"
        }));
        await persistCharacter(mkCharacter({
            id: "c2",
            name: "Mage Two",
            rulesetId: "dnd_srd_5e_2024@2.0.0",
            updatedAt: "2026-02-02T00:00:00.000Z"
        }));
        await persistCharacter(mkCharacter({
            id: "c3",
            name: "Rogue",
            rulesetId: "sandbox_rpg@2.0.0",
            updatedAt: "2026-02-03T00:00:00.000Z"
        }));

        const page = await listCharacterRows({
            rulesetId: "dnd_srd_5e_2024",
            name: "mage",
            limit: 1,
            offset: 0
        });
        expect(page).toHaveLength(1);
        expect(page[0].meta.id).toBe("c2");
    });

    it("deletes character and linked layouts", async () => {
        await persistCharacter(mkCharacter({
            id: "c1",
            name: "Aria",
            rulesetId: "sandbox_rpg@2.0.0",
            updatedAt: "2026-02-01T00:00:00.000Z"
        }));
        await persistLayout("c1", "sandbox_rpg@2.0.0", { some: "layout" });
        await deleteCharacterRow("c1");

        const chars = await listCharacterRows({ includeArchived: true, limit: 10, offset: 0 });
        const layouts = await db.layouts.where("characterId").equals("c1").toArray();
        expect(chars).toHaveLength(0);
        expect(layouts).toHaveLength(0);
    });
});
