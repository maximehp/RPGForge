import YAML from "yaml";
import type { PanelsFile, PanelRegistry, LayoutConfig } from "./dsl/types";

export type UIAction =
    | { id: string; kind: "domain"; fn: string; args?: unknown[] }
    | { id: string; kind: "recompute" }
    | { id: string; kind: "roll"; expr: string }
    | { id: string; kind: "toggleVar"; key: string }
    | { id: string; kind: "script"; expr: string };

export type ActionRegistry = Map<string, UIAction>;

/* Vite will inline these as raw strings */
const panelsGlobs = import.meta.glob("/src/packs/builtin/**/ui/panels.@(yaml|yml|json)", { query: "?raw", import: "default" }) as Record<string, () => Promise<string>>;
const layoutGlobs = import.meta.glob("/src/packs/builtin/**/ui/layout.json", { query: "?raw", import: "default" }) as Record<string, () => Promise<string>>;
const themeGlobs = import.meta.glob("/src/packs/builtin/**/ui/theme.css", { query: "?raw", import: "default" }) as Record<string, () => Promise<string>>;
const actionsGlobs = import.meta.glob("/src/packs/builtin/**/ui/actions.@(yaml|yml|json)", { query: "?raw", import: "default" }) as Record<string, () => Promise<string>>;

export type PackUI = {
    panels: PanelRegistry;
    layout: LayoutConfig;
    theme: string | null;
    actions: ActionRegistry;
};

export async function loadPackUi(packId: string): Promise<PackUI> {
    const panelsPath = `/src/packs/builtin/${packId}/ui/panels.yaml`;
    const panelsAltJson = `/src/packs/builtin/${packId}/ui/panels.json`;
    const layoutPath = `/src/packs/builtin/${packId}/ui/layout.json`;
    const themePath = `/src/packs/builtin/${packId}/ui/theme.css`;
    const actionsPathYaml = `/src/packs/builtin/${packId}/ui/actions.yaml`;
    const actionsPathJson = `/src/packs/builtin/${packId}/ui/actions.json`;

    const panelsRaw = await readFirst([panelsPath, panelsAltJson], panelsGlobs);
    const layoutRaw = await readOne(layoutPath, layoutGlobs);
    const themeRaw = await readOptional(themePath, themeGlobs);
    const actionsRaw = await readFirstOptional([actionsPathYaml, actionsPathJson], actionsGlobs);

    const panelsFile = parsePanels(panelsRaw);
    const panels: PanelRegistry = new Map();
    for (const p of panelsFile.panels) panels.set(p.id, p);

    const layout = JSON.parse(layoutRaw) as LayoutConfig;
    const theme = themeRaw ?? null;

    const actions = parseActions(actionsRaw);

    if (theme) injectTheme(theme);

    return { panels, layout, theme, actions };
}

function parsePanels(raw: string): PanelsFile {
    if (!raw) return { panels: [] };
    const text = raw.trim();
    if (!text) return { panels: [] };
    if (text.startsWith("{") || text.startsWith("[")) return JSON.parse(text);
    return YAML.parse(text);
}

function parseActions(raw: string | null): ActionRegistry {
    const reg: ActionRegistry = new Map();
    if (!raw) return reg;
    const text = raw.trim();
    if (!text) return reg;

    const obj = text.startsWith("{") || text.startsWith("[") ? JSON.parse(text) : YAML.parse(text);
    const arr: UIAction[] = Array.isArray(obj?.actions) ? obj.actions : [];
    for (const a of arr) {
        if (!a || typeof a.id !== "string") continue;
        reg.set(a.id, a);
    }
    return reg;
}

async function readFirst(paths: string[], glob: Record<string, () => Promise<string>>): Promise<string> {
    for (const p of paths) {
        const loader = glob[p];
        if (loader) return await loader();
    }
    throw new Error(`Panels file not found at ${paths.join(", ")}`);
}

async function readFirstOptional(paths: string[], glob: Record<string, () => Promise<string>>): Promise<string | null> {
    for (const p of paths) {
        const loader = glob[p];
        if (loader) return await loader();
    }
    return null;
}

async function readOne(path: string, glob: Record<string, () => Promise<string>>): Promise<string> {
    const loader = glob[path];
    if (!loader) throw new Error(`File not found: ${path}`);
    return await loader();
}

async function readOptional(path: string, glob: Record<string, () => Promise<string>>): Promise<string | null> {
    const loader = glob[path];
    return loader ? await loader() : null;
}

function injectTheme(css: string) {
    const id = "pack-theme-style";
    let style = document.getElementById(id) as HTMLStyleElement | null;
    if (!style) {
        style = document.createElement("style");
        style.id = id;
        document.head.appendChild(style);
    }
    style.textContent = css;
}
