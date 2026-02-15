import JSZip from "jszip";
import YAML from "yaml";
import { parsePackManifestV2, parsePackModuleV2 } from "./schema";
import type { ImportReportV2, LoadedPackV2, PackModuleV2 } from "./types";

function parseDoc(text: string, path: string): unknown {
    const trimmed = text.trim();
    if (!trimmed) return {};
    if (path.endsWith(".json")) return JSON.parse(trimmed);
    return YAML.parse(trimmed);
}

function mergeModuleParts(parts: Array<unknown>): PackModuleV2 {
    const module: PackModuleV2 = {};
    for (const p of parts) {
        const part = (p || {}) as Record<string, unknown>;

        if (part.model) {
            module.model = {
                core: { ...(module.model?.core || {}), ...((part.model as any).core || {}) },
                extends: { ...(module.model?.extends || {}), ...((part.model as any).extends || {}) }
            };
        }

        if (part.rules) {
            module.rules = {
                formulas: { ...(module.rules?.formulas || {}), ...((part.rules as any).formulas || {}) },
                lookups: { ...(module.rules?.lookups || {}), ...((part.rules as any).lookups || {}) },
                hooks: { ...(module.rules?.hooks || {}), ...((part.rules as any).hooks || {}) }
            };
        }

        if (part.content) {
            module.content = { ...(module.content || {}), ...((part.content as any) || {}) };
        }

        if (part.ui) {
            module.ui = {
                layout: {
                    groups: [...(module.ui?.layout.groups || []), ...(((part.ui as any).layout?.groups || []))]
                },
                panels: [...(module.ui?.panels || []), ...(((part.ui as any).panels || []))],
                accents: { ...(module.ui?.accents || {}), ...(((part.ui as any).accents || {})) }
            };
        }

        if (part.actions) {
            module.actions = [...(module.actions || []), ...((part.actions as any) || [])];
        }

        if (part.creator) {
            module.creator = part.creator as any;
        }

        if (part.authoring) {
            module.authoring = {
                ...(module.authoring || {}),
                ...(part.authoring as any)
            };
        }

        if (part.effects) {
            module.effects = [...(module.effects || []), ...((part.effects as any) || [])];
        }
    }

    return parsePackModuleV2(module);
}

function resolvePath(root: string, rel: string): string {
    if (rel.startsWith("/")) return rel.slice(1);
    const base = root.split("/").filter(Boolean);
    const parts = rel.split("/").filter(Boolean);
    for (const part of parts) {
        if (part === ".") continue;
        if (part === "..") base.pop();
        else base.push(part);
    }
    return base.join("/");
}

async function loadZipText(zip: JSZip, path: string): Promise<string> {
    const file = zip.file(path);
    if (!file) throw new Error(`Missing file in gpack: ${path}`);
    return await file.async("string");
}

export async function importPackBundle(file: File): Promise<{ pack: LoadedPackV2 | null; report: ImportReportV2 }> {
    const report: ImportReportV2 = {
        source: file.name,
        errors: [],
        warnings: [],
        conflicts: [],
        resolvedDependencies: []
    };

    try {
        if (!file.name.endsWith(".gpack")) {
            report.errors.push("Unsupported bundle format. Expected .gpack");
            return { pack: null, report };
        }

        const zip = await JSZip.loadAsync(await file.arrayBuffer());
        const manifestText = await loadZipText(zip, "manifest.yaml").catch(async () => {
            return await loadZipText(zip, "manifest.json");
        });
        const manifestPath = manifestText.trim().startsWith("{") ? "manifest.json" : "manifest.yaml";
        const manifest = parsePackManifestV2(parseDoc(manifestText, manifestPath));
        report.packId = manifest.id;

        const parts: unknown[] = [];
        const root = "";
        const entrypoints = manifest.entrypoints;

        const loadPaths: string[] = [];
        if (entrypoints.model) loadPaths.push(resolvePath(root, entrypoints.model));
        if (entrypoints.rules) loadPaths.push(resolvePath(root, entrypoints.rules));
        if (entrypoints.ui) loadPaths.push(resolvePath(root, entrypoints.ui));
        if (entrypoints.actions) loadPaths.push(resolvePath(root, entrypoints.actions));
        if (entrypoints.creator) loadPaths.push(resolvePath(root, entrypoints.creator));
        if (entrypoints.authoring) loadPaths.push(resolvePath(root, entrypoints.authoring));
        if (entrypoints.effects) loadPaths.push(resolvePath(root, entrypoints.effects));
        for (const p of entrypoints.content || []) loadPaths.push(resolvePath(root, p));

        for (const p of loadPaths) {
            const raw = await loadZipText(zip, p);
            parts.push(parseDoc(raw, p));
        }

        const module = mergeModuleParts(parts);
        report.resolvedDependencies = (manifest.dependsOn || []).map(d => `${d.id}@${d.range}`);

        return {
            pack: {
                manifest,
                module,
                source: "import",
                sourceRef: file.name
            },
            report
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        report.errors.push(msg);
        return { pack: null, report };
    }
}
