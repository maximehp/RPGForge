import YAML from "yaml";
import { parsePackManifestV2, parsePackModuleV2 } from "./schema";
import type { LoadedPackV2, PackManifestV2, PackModuleV2 } from "./types";

const ALL_PACK_FILE_LOADERS: Record<string, () => Promise<string>> = import.meta.glob(
    "/src/packs/builtin/**/*.{yaml,yml,json}",
    { query: "?raw", import: "default" }
) as Record<string, () => Promise<string>>;

const BUILTIN_MANIFEST_LOADERS: Record<string, () => Promise<string>> = import.meta.glob(
    "/src/packs/builtin/**/manifest.{yaml,yml,json}",
    { query: "?raw", import: "default" }
) as Record<string, () => Promise<string>>;

let manifestCache: PackManifestV2[] | null = null;
const loadedPackCache = new Map<string, LoadedPackV2>();

export type BuiltinPackModulePart =
    | "model"
    | "rules"
    | "ui"
    | "actions"
    | "creator"
    | "authoring"
    | "effects"
    | "content";

type BuiltinManifestDescriptor = {
    manifestPath: string;
    manifest: PackManifestV2;
    folder: string;
};

function parseDoc(text: string, path: string): unknown {
    const trimmed = text.trim();
    if (!trimmed) return {};
    if (path.endsWith(".json")) return JSON.parse(trimmed);
    return YAML.parse(trimmed);
}

function dirname(path: string): string {
    const idx = path.lastIndexOf("/");
    if (idx < 0) return "/";
    return path.slice(0, idx + 1);
}

function resolvePath(baseDir: string, rel: string): string {
    if (rel.startsWith("/")) return rel;
    const baseParts = baseDir.split("/").filter(Boolean);
    const relParts = rel.split("/").filter(Boolean);
    for (const part of relParts) {
        if (part === ".") continue;
        if (part === "..") baseParts.pop();
        else baseParts.push(part);
    }
    return "/" + baseParts.join("/");
}

async function loadRaw(path: string): Promise<string> {
    const loader = ALL_PACK_FILE_LOADERS[path];
    if (!loader) {
        throw new Error(`Builtin pack file not found: ${path}`);
    }
    return await loader();
}

async function descriptorFor(packId: string): Promise<BuiltinManifestDescriptor | null> {
    const manifestPath = manifestPathFor(packId);
    if (!manifestPath) return null;
    const manifestText = await BUILTIN_MANIFEST_LOADERS[manifestPath]();
    const manifest = parsePackManifestV2(parseDoc(manifestText, manifestPath));
    return {
        manifestPath,
        manifest,
        folder: dirname(manifestPath)
    };
}

function buildPathsForParts(
    descriptor: BuiltinManifestDescriptor,
    parts: BuiltinPackModulePart[],
    contentFilter?: string[]
): string[] {
    const { manifest, folder } = descriptor;
    const include = new Set(parts);
    const paths: string[] = [];
    if (include.has("model") && manifest.entrypoints.model) paths.push(resolvePath(folder, manifest.entrypoints.model));
    if (include.has("rules") && manifest.entrypoints.rules) paths.push(resolvePath(folder, manifest.entrypoints.rules));
    if (include.has("ui") && manifest.entrypoints.ui) paths.push(resolvePath(folder, manifest.entrypoints.ui));
    if (include.has("actions") && manifest.entrypoints.actions) paths.push(resolvePath(folder, manifest.entrypoints.actions));
    if (include.has("creator") && manifest.entrypoints.creator) paths.push(resolvePath(folder, manifest.entrypoints.creator));
    if (include.has("authoring") && manifest.entrypoints.authoring) paths.push(resolvePath(folder, manifest.entrypoints.authoring));
    if (include.has("effects") && manifest.entrypoints.effects) paths.push(resolvePath(folder, manifest.entrypoints.effects));
    if (include.has("content")) {
        const allContent = (manifest.entrypoints.content || []).map(p => resolvePath(folder, p));
        if (contentFilter?.length) {
            const wanted = new Set(contentFilter.map(path => resolvePath(folder, path)));
            paths.push(...allContent.filter(path => wanted.has(path)));
        } else {
            paths.push(...allContent);
        }
    }
    return paths;
}

function mergeModuleParts(parts: Array<unknown>): PackModuleV2 {
    const module: PackModuleV2 = {};

    for (const partRaw of parts) {
        const part = (partRaw || {}) as Record<string, unknown>;

        if (part.model) {
            module.model = {
                core: {
                    ...(module.model?.core || {}),
                    ...((part.model as any).core || {})
                },
                extends: {
                    ...(module.model?.extends || {}),
                    ...((part.model as any).extends || {})
                }
            };
        }

        if (part.rules) {
            module.rules = {
                formulas: {
                    ...(module.rules?.formulas || {}),
                    ...((part.rules as any).formulas || {})
                },
                lookups: {
                    ...(module.rules?.lookups || {}),
                    ...((part.rules as any).lookups || {})
                },
                hooks: {
                    ...(module.rules?.hooks || {}),
                    ...((part.rules as any).hooks || {})
                }
            };
        }

        if (part.content) {
            module.content = {
                ...(module.content || {}),
                ...((part.content as any) || {})
            };
        }

        if (part.ui) {
            module.ui = {
                layout: {
                    groups: [...(module.ui?.layout.groups || []), ...(((part.ui as any).layout?.groups || []))]
                },
                panels: [...(module.ui?.panels || []), ...(((part.ui as any).panels || []))],
                accents: {
                    ...(module.ui?.accents || {}),
                    ...(((part.ui as any).accents || {}))
                }
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

export async function listBuiltinPackManifestsV2(): Promise<PackManifestV2[]> {
    if (manifestCache) {
        return [...manifestCache];
    }

    const entries = await Promise.all(
        Object.entries(BUILTIN_MANIFEST_LOADERS).map(async ([path, loader]) => {
            const manifestText = await loader();
            const manifest = parsePackManifestV2(parseDoc(manifestText, path));
            return { path, manifest };
        })
    );

    manifestCache = entries
        .sort((a, b) => a.manifest.id.localeCompare(b.manifest.id))
        .map(entry => entry.manifest);

    return [...manifestCache];
}

function manifestPathFor(packId: string): string | null {
    for (const path of Object.keys(BUILTIN_MANIFEST_LOADERS)) {
        const base = dirname(path);
        const id = base.split("/").filter(Boolean).slice(-1)[0];
        if (id === packId) return path;
    }
    return null;
}

export async function listBuiltinPackContentFilesV2(packId: string): Promise<string[]> {
    const descriptor = await descriptorFor(packId);
    if (!descriptor) return [];
    return (descriptor.manifest.entrypoints.content || []).map(path => resolvePath(descriptor.folder, path));
}

export async function loadBuiltinPackContentIndexV2(packId: string): Promise<unknown | null> {
    const descriptor = await descriptorFor(packId);
    if (!descriptor) return null;
    const indexPath = resolvePath(descriptor.folder, "content/index.generated.yaml");
    if (!ALL_PACK_FILE_LOADERS[indexPath]) return null;
    const raw = await loadRaw(indexPath);
    return parseDoc(raw, indexPath);
}

export async function loadBuiltinPackContentChunkV2(packId: string, path: string): Promise<unknown> {
    const descriptor = await descriptorFor(packId);
    if (!descriptor) throw new Error(`Built-in pack not found: ${packId}`);
    const absolutePath = path.startsWith("/") ? path : resolvePath(descriptor.folder, path);
    const raw = await loadRaw(absolutePath);
    return parseDoc(raw, absolutePath);
}

export async function loadBuiltinPackModulePartV2(
    packId: string,
    parts: BuiltinPackModulePart[],
    options?: { contentFiles?: string[] }
): Promise<{ manifest: PackManifestV2; module: PackModuleV2 } | null> {
    const descriptor = await descriptorFor(packId);
    if (!descriptor) return null;
    const paths = buildPathsForParts(descriptor, parts, options?.contentFiles);
    const docs = await Promise.all(paths.map(async path => parseDoc(await loadRaw(path), path)));
    return {
        manifest: descriptor.manifest,
        module: mergeModuleParts(docs)
    };
}

export async function loadBuiltinPackByIdV2(packId: string): Promise<LoadedPackV2 | null> {
    const cached = loadedPackCache.get(packId);
    if (cached) {
        return cached;
    }

    const descriptor = await descriptorFor(packId);
    if (!descriptor) {
        return null;
    }
    const paths = buildPathsForParts(descriptor, ["model", "rules", "ui", "actions", "creator", "authoring", "effects", "content"]);
    const parts = await Promise.all(paths.map(async path => parseDoc(await loadRaw(path), path)));

    const loaded: LoadedPackV2 = {
        manifest: descriptor.manifest,
        module: mergeModuleParts(parts),
        source: "builtin",
        sourceRef: descriptor.manifestPath
    };
    loadedPackCache.set(packId, loaded);
    return loaded;
}

export async function loadBuiltinPacksV2(): Promise<LoadedPackV2[]> {
    const manifests = await listBuiltinPackManifestsV2();
    const loaded = await Promise.all(manifests.map(m => loadBuiltinPackByIdV2(m.id)));
    return loaded.filter((pack): pack is LoadedPackV2 => Boolean(pack));
}
