import type { CharacterDocumentV2 } from "../../engine/v2/types";
import { parsePackManifestV2 } from "../../engine/v2/schema";
import type { PackManifestV2 } from "../../engine/v2/types";

export function migrateCharacter(doc: unknown, toVersion: string): CharacterDocumentV2 {
    if (toVersion !== "2.0.0") {
        throw new Error(`Unsupported target character schema version: ${toVersion}`);
    }

    const raw = (doc || {}) as Record<string, unknown>;
    if (raw.schemaVersion === "2.0.0") {
        return raw as CharacterDocumentV2;
    }

    const now = new Date().toISOString();

    const stats = ((raw.components as any)?.stats || raw.attr || {}) as Record<string, number>;
    const resources = ((raw.components as any)?.resources || raw.res || {}) as Record<string, { current: number; max: number }>;

    return {
        schemaVersion: "2.0.0",
        meta: {
            id: String((raw.meta as any)?.id || raw.id || `legacy-${Math.random().toString(36).slice(2)}`),
            rulesetId: String((raw.meta as any)?.rulesetId || raw.systemId || "unknown@0.0.0"),
            name: String((raw.meta as any)?.name || raw.name || "Migrated Character"),
            createdAt: String((raw.meta as any)?.createdAt || raw.createdAt || now),
            updatedAt: now
        },
        core: {
            level: Math.max(1, Number((raw.core as any)?.level || raw.level || 1)),
            xp: Math.max(0, Number((raw.core as any)?.xp || 0)),
            tags: Array.isArray((raw.core as any)?.tags) ? (raw.core as any).tags : (Array.isArray(raw.tags) ? raw.tags : []),
            notes: String((raw.core as any)?.notes || raw.notes || "")
        },
        components: {
            stats,
            resources,
            effectiveStats: { ...stats },
            effectiveResources: Object.fromEntries(
                Object.entries(resources).map(([k, v]) => [k, { current: Number(v?.current || 0), max: Number(v?.max || 0) }])
            )
        },
        collections: ((raw.collections as any) || { inventory: (raw as any).inventory?.items || [] }) as Record<string, unknown[]>,
        derived: ((raw.derived as any) || {}) as Record<string, number>,
        stateFlags: ((raw.stateFlags as any) || {}) as Record<string, boolean>,
        appliedPacks: Array.isArray(raw.appliedPacks) ? raw.appliedPacks.map(String) : []
    };
}

export function migratePack(manifest: unknown): PackManifestV2 {
    const maybe = (manifest || {}) as Record<string, unknown>;
    if (maybe.schemaVersion === "2.0.0") {
        return parsePackManifestV2(maybe);
    }

    const upgraded: PackManifestV2 = {
        schemaVersion: "2.0.0",
        id: String(maybe.id || "legacy_pack"),
        name: String(maybe.name || maybe.id || "Legacy Pack"),
        version: String(maybe.version || "0.0.0"),
        kind: "core",
        description: String(maybe.description || "Migrated from legacy format"),
        dependsOn: [],
        entrypoints: {
            model: "schema/model.yaml",
            rules: "rules/rules.yaml",
            content: ["content/content.yaml"],
            ui: "ui/ui.yaml",
            actions: "ui/actions.yaml"
        }
    };

    return parsePackManifestV2(upgraded);
}
