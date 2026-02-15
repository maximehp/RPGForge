import type {
    LoadedPackV2,
    PackManifestV2,
    ResolvedRuleset,
    RulesetConflict,
    UiPresetV2,
    ContentEntryV2,
    ActionSpecV2,
    AuthoringPresetV2,
    CharacterCreatorPresetV3,
    EffectSpecV2
} from "./types";
import { satisfiesSemver } from "./semver";

type GraphNode = {
    manifest: PackManifestV2;
    deps: string[];
};

export type ResolveResult = {
    ordered: LoadedPackV2[];
    resolvedDependencies: string[];
};

function stableSort(ids: string[]): string[] {
    return [...ids].sort((a, b) => a.localeCompare(b));
}

export function resolvePackOrder(allPacks: LoadedPackV2[], requestedPackIds: string[]): ResolveResult {
    const packById = new Map(allPacks.map(p => [p.manifest.id, p]));

    const needed = new Set<string>();
    const visitStack = new Set<string>();

    function collect(id: string) {
        if (needed.has(id)) return;
        if (visitStack.has(id)) {
            throw new Error(`Cyclic dependency detected at pack "${id}"`);
        }
        const pack = packById.get(id);
        if (!pack) {
            throw new Error(`Requested pack not found: ${id}`);
        }

        visitStack.add(id);
        const deps = pack.manifest.dependsOn || [];
        for (const dep of deps) {
            const depPack = packById.get(dep.id);
            if (!depPack) {
                if (dep.optional) continue;
                throw new Error(`Missing dependency: ${id} -> ${dep.id}`);
            }
            if (!satisfiesSemver(depPack.manifest.version, dep.range)) {
                throw new Error(
                    `Dependency version mismatch: ${id} requires ${dep.id}@${dep.range}, got ${depPack.manifest.version}`
                );
            }
            collect(dep.id);
        }
        visitStack.delete(id);
        needed.add(id);
    }

    for (const id of requestedPackIds) collect(id);

    const graph = new Map<string, GraphNode>();
    for (const id of needed) {
        const manifest = packById.get(id)!.manifest;
        graph.set(id, {
            manifest,
            deps: (manifest.dependsOn || [])
                .map(d => d.id)
                .filter(depId => needed.has(depId))
        });
    }

    const indegree = new Map<string, number>();
    for (const id of graph.keys()) indegree.set(id, 0);
    for (const node of graph.values()) {
        indegree.set(node.manifest.id, (indegree.get(node.manifest.id) || 0) + node.deps.length);
    }

    const queue = stableSort([...graph.keys()].filter(id => (indegree.get(id) || 0) === 0));
    const orderedIds: string[] = [];

    while (queue.length) {
        const id = queue.shift()!;
        orderedIds.push(id);

        for (const [otherId, other] of graph.entries()) {
            if (!other.deps.includes(id)) continue;
            const next = (indegree.get(otherId) || 0) - 1;
            indegree.set(otherId, next);
            if (next === 0) {
                queue.push(otherId);
                queue.sort((a, b) => a.localeCompare(b));
            }
        }
    }

    if (orderedIds.length !== graph.size) {
        throw new Error("Cycle detected while resolving dependency graph");
    }

    return {
        ordered: orderedIds.map(id => packById.get(id)!),
        resolvedDependencies: orderedIds
    };
}

function mergeUniqueById<T extends { id: string }>(left: T[] = [], right: T[] = []): T[] {
    const map = new Map<string, T>();
    for (const item of left) map.set(item.id, item);
    for (const item of right) map.set(item.id, item);
    return [...map.values()];
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...target };
    for (const [key, val] of Object.entries(source)) {
        const prev = out[key];
        if (Array.isArray(prev) && Array.isArray(val)) {
            out[key] = [...prev, ...val];
        } else if (isObject(prev) && isObject(val)) {
            out[key] = deepMerge(prev as Record<string, unknown>, val as Record<string, unknown>);
        } else {
            out[key] = val;
        }
    }
    return out;
}

function isObject(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === "object" && !Array.isArray(v);
}

function normalizeUi(ui: Partial<UiPresetV2> | undefined): UiPresetV2 {
    return {
        layout: {
            groups: ui?.layout?.groups ?? []
        },
        panels: ui?.panels ?? [],
        accents: ui?.accents
    };
}

export function mergeResolvedRuleset(orderedPacks: LoadedPackV2[]): ResolvedRuleset {
    if (!orderedPacks.length) {
        throw new Error("Cannot merge empty pack list");
    }

    const conflicts: RulesetConflict[] = [];
    const contentPackOwner = new Map<string, string>();

    let core = {
        stats: [] as Array<{ id: string; label?: string; default?: number }>,
        resources: [] as Array<{ id: string; label?: string; default?: number; maxFormula?: string }>,
        collections: [] as Array<{ id: string; label?: string; itemType?: string }>,
        flags: [] as Array<{ id: string; label?: string; default?: boolean }>
    };

    const extensions: NonNullable<ResolvedRuleset["model"]["extensions"]> = [];
    const formulas: Record<string, string> = {};
    const lookups: Record<string, Record<string, number>> = {};
    const hooks: Record<string, string> = {};
    let ui: UiPresetV2 = { layout: { groups: [] }, panels: [] };
    let creator: CharacterCreatorPresetV3 | undefined = undefined;
    let authoring: AuthoringPresetV2 | undefined = undefined;
    const effects: EffectSpecV2[] = [];
    const actions: Record<string, ActionSpecV2> = {};
    const content: Record<string, Record<string, ContentEntryV2>> = {};

    for (const pack of orderedPacks) {
        const mod = pack.module;

        if (mod.model?.core) {
            core = {
                stats: mergeUniqueById(core.stats, mod.model.core.stats),
                resources: mergeUniqueById(core.resources, mod.model.core.resources),
                collections: mergeUniqueById(core.collections, mod.model.core.collections),
                flags: mergeUniqueById(core.flags, mod.model.core.flags)
            };
        }
        if (mod.model?.extends) {
            extensions.push(mod.model.extends);
        }

        Object.assign(formulas, mod.rules?.formulas || {});
        for (const [table, rows] of Object.entries(mod.rules?.lookups || {})) {
            lookups[table] = {
                ...(lookups[table] || {}),
                ...rows
            };
        }
        Object.assign(hooks, mod.rules?.hooks || {});

        ui = normalizeUi(deepMerge(ui as unknown as Record<string, unknown>, normalizeUi(mod.ui) as unknown as Record<string, unknown>) as UiPresetV2);
        ui.panels = mergeUniqueById(ui.panels, mod.ui?.panels);

        if (mod.creator) {
            creator = mod.creator;
        }
        if (mod.authoring) {
            authoring = deepMerge((authoring || {}) as Record<string, unknown>, mod.authoring as unknown as Record<string, unknown>) as AuthoringPresetV2;
        }
        if (mod.effects?.length) {
            effects.push(...mod.effects);
        }

        for (const action of mod.actions || []) {
            actions[action.id] = action;
        }

        for (const [contentType, entries] of Object.entries(mod.content || {})) {
            const byId = (content[contentType] ||= {});
            for (const entry of entries) {
                const existing = byId[entry.id];
                if (existing) {
                    const ownerKey = `${contentType}:${entry.id}`;
                    conflicts.push({
                        id: entry.id,
                        contentType,
                        previousPackId: contentPackOwner.get(ownerKey) || "unknown",
                        nextPackId: pack.manifest.id,
                        resolution: "overridden",
                        path: `content.${contentType}.${entry.id}`
                    });
                }
                byId[entry.id] = entry;
                contentPackOwner.set(`${contentType}:${entry.id}`, pack.manifest.id);
            }
        }
    }

    const root = orderedPacks[orderedPacks.length - 1].manifest;

    return {
        id: `${root.id}@${root.version}`,
        packOrder: orderedPacks.map(p => p.manifest.id),
        manifests: orderedPacks.map(p => p.manifest),
        model: {
            core,
            extensions
        },
        rules: {
            formulas,
            lookups,
            hooks: hooks as ResolvedRuleset["rules"]["hooks"]
        },
        ui,
        creator,
        authoring,
        effects,
        actions,
        content,
        conflicts
    };
}

export function activateRuleset(allPacks: LoadedPackV2[], requestedPackIds: string[]): ResolvedRuleset {
    const { ordered } = resolvePackOrder(allPacks, requestedPackIds);
    return mergeResolvedRuleset(ordered);
}
