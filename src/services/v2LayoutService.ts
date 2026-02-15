import { loadLayout, persistLayout } from "./v2Database";
import type { LayoutPresetV2, UiPanelV2 } from "../engine/v2/types";

export async function saveLayoutState(characterId: string, rulesetId: string, state: unknown): Promise<void> {
    await persistLayout(characterId, rulesetId, state);
}

type DockviewLayoutJson = {
    grid?: {
        root?: unknown;
    };
    panels?: Record<string, unknown>;
};

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function collectPanelIdsFromLayout(node: unknown, ids = new Set<string>()): Set<string> {
    if (!isObject(node)) return ids;

    if (typeof node.id === "string") {
        ids.add(node.id);
    }

    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) {
        collectPanelIdsFromLayout(child, ids);
    }
    return ids;
}

function hasAnyKnownPanels(state: DockviewLayoutJson, panels: UiPanelV2[]): boolean {
    const known = new Set(panels.map(panel => panel.id));
    const ids = collectPanelIdsFromLayout(state.grid?.root);
    if (ids.size === 0 && isObject(state.panels)) {
        for (const key of Object.keys(state.panels)) ids.add(key);
    }
    for (const id of ids) {
        if (known.has(id)) return true;
    }
    return false;
}

export function isUsableLayoutState(
    state: unknown,
    panels?: UiPanelV2[],
    layout?: LayoutPresetV2
): state is DockviewLayoutJson {
    if (!isObject(state)) return false;

    const maybe = state as DockviewLayoutJson;
    const hasShape = isObject(maybe.grid) || isObject(maybe.panels);
    if (!hasShape) return false;

    if (!panels?.length) return true;
    const hasKnown = hasAnyKnownPanels(maybe, panels);
    if (hasKnown) return true;

    if (layout?.groups?.length) {
        const fallbackIds = new Set(layout.groups.flatMap(group => group.tabs));
        for (const id of fallbackIds) {
            if (panels.some(panel => panel.id === id)) return true;
        }
    }
    return false;
}

export async function loadLayoutState(characterId: string, rulesetId: string): Promise<unknown | null> {
    const raw = await loadLayout(characterId, rulesetId);
    if (raw == null) return null;
    return isUsableLayoutState(raw) ? raw : null;
}
