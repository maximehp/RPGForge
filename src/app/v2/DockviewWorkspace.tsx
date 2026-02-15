import React from "react";
import { DockviewReact } from "dockview";
import "dockview/dist/styles/dockview.css";
import type { ActionEnvelopeV2, CharacterDocumentV2, LayoutPresetV2, UiPanelV2 } from "../../engine/v2/types";
import { PackPanel } from "./PackPanel";
import { isUsableLayoutState } from "../../services/v2LayoutService";

type Props = {
    panels: UiPanelV2[];
    layout: LayoutPresetV2;
    character: CharacterDocumentV2;
    initialLayoutState?: unknown;
    dispatchAction: (action: ActionEnvelopeV2) => void;
    onLayoutChanged: (state: unknown) => void;
};

function useIsMobile(breakpoint = 900): boolean {
    const [isMobile, setIsMobile] = React.useState(() => window.innerWidth < breakpoint);

    React.useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth < breakpoint);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [breakpoint]);

    return isMobile;
}

function panelCountFromLayoutJson(state: unknown): number {
    if (!state || typeof state !== "object") return 0;
    const stack: unknown[] = [state];
    let count = 0;
    while (stack.length) {
        const current = stack.pop();
        if (!current || typeof current !== "object") continue;
        const node = current as Record<string, unknown>;
        if (typeof node.id === "string") count += 1;
        const children = Array.isArray(node.children) ? node.children : [];
        for (const child of children) stack.push(child);
    }
    return count;
}

function renderCollectionCount(items: unknown): number {
    return Array.isArray(items) ? items.length : 0;
}

function FallbackSheet(props: { character: CharacterDocumentV2 }) {
    const { character } = props;
    return (
        <section className="glass-surface workspace-fallback">
            <header className="workspace-fallback-header">
                <h2>{character.meta.name}</h2>
                <p className="home-muted">Fallback sheet view (ruleset UI panels were unavailable)</p>
            </header>
            <div className="workspace-fallback-grid">
                <article className="workspace-fallback-card">
                    <h3>Core</h3>
                    <p>Level {character.core.level}</p>
                    <p>XP {character.core.xp}</p>
                    <p>Ruleset {character.meta.rulesetId}</p>
                </article>
                <article className="workspace-fallback-card">
                    <h3>Stats</h3>
                    {Object.entries(character.components.effectiveStats || character.components.stats).map(([key, value]) => (
                        <p key={key}>{key.toUpperCase()}: {String(value)}</p>
                    ))}
                </article>
                <article className="workspace-fallback-card">
                    <h3>Resources</h3>
                    {Object.entries(character.components.effectiveResources || character.components.resources).map(([key, value]) => (
                        <p key={key}>{key}: {value.current}/{value.max}</p>
                    ))}
                </article>
                <article className="workspace-fallback-card">
                    <h3>Collections</h3>
                    {Object.entries(character.collections).map(([key, values]) => (
                        <p key={key}>{key}: {renderCollectionCount(values)}</p>
                    ))}
                </article>
            </div>
            {character.core.notes ? (
                <article className="workspace-fallback-card">
                    <h3>Notes</h3>
                    <p>{character.core.notes}</p>
                </article>
            ) : null}
        </section>
    );
}

export function DockviewWorkspace(props: Props) {
    const { panels, layout, character, initialLayoutState, dispatchAction, onLayoutChanged } = props;
    const byId = React.useMemo(() => new Map(panels.map(p => [p.id, p])), [panels]);
    const isMobile = useIsMobile();

    const sectionIds = React.useMemo(() => layout.groups.map(g => g.id), [layout.groups]);
    const [activeSection, setActiveSection] = React.useState(sectionIds[0] || "");
    React.useEffect(() => {
        if (!sectionIds.length) return;
        if (!sectionIds.includes(activeSection)) {
            setActiveSection(sectionIds[0]);
        }
    }, [activeSection, sectionIds]);

    const components = React.useMemo(() => ({
        "pack-panel": (dockProps: any) => {
            const panelId = String(dockProps?.params?.panelId || "");
            const panel = byId.get(panelId);
            if (!panel) return <div className="glass-empty">Missing panel: {panelId}</div>;
            return <PackPanel panel={panel} character={character} dispatchAction={dispatchAction} />;
        }
    }), [byId, character, dispatchAction]);

    const initializedRef = React.useRef(false);
    const [showFallbackSheet, setShowFallbackSheet] = React.useState(false);

    React.useEffect(() => {
        initializedRef.current = false;
        setShowFallbackSheet(false);
    }, [character.meta.id, panels, layout]);

    const addDefaultPanels = React.useCallback((api: any): number => {
        const addPanelById = (panelId: string, referencePanelId?: string, direction: "within" | "right" = "within") => {
            const panel = byId.get(panelId);
            if (!panel) return false;
            const opts: any = {
                id: panel.id,
                title: panel.title,
                component: "pack-panel",
                params: { panelId: panel.id },
                inactive: true
            };
            if (referencePanelId) {
                opts.position = { referencePanel: referencePanelId, direction };
            }
            api.addPanel(opts);
            return true;
        };

        let added = 0;
        let firstRootPanelId: string | null = null;
        for (const group of layout.groups) {
            let firstInGroup: string | null = null;
            for (const panelId of group.tabs) {
                const ok = addPanelById(panelId, firstInGroup || firstRootPanelId || undefined, firstInGroup ? "within" : "right");
                if (!ok) continue;
                added += 1;
                firstInGroup = firstInGroup || panelId;
                firstRootPanelId = firstRootPanelId || panelId;
            }
        }

        if (added === 0 && panels.length > 0) {
            return addPanelById(panels[0].id) ? 1 : 0;
        }
        return added;
    }, [byId, layout.groups, panels]);

    const onReady = React.useCallback((event: any) => {
        const api = event?.api;
        if (!api || initializedRef.current) return;
        initializedRef.current = true;

        try {
            let restored = false;
            if (initialLayoutState && typeof api.fromJSON === "function") {
                const canRestore = panels.length > 0 && isUsableLayoutState(initialLayoutState, panels, layout);
                if (canRestore) {
                    try {
                        api.fromJSON(initialLayoutState);
                        restored = true;
                    } catch {
                        restored = false;
                    }
                }
            }

            if (!restored) {
                const added = addDefaultPanels(api);
                if (added === 0) {
                    setShowFallbackSheet(true);
                    return;
                }
            } else {
                const restoredJson = typeof api.toJSON === "function" ? api.toJSON() : null;
                const usable = isUsableLayoutState(restoredJson, panels, layout);
                if (!usable || panelCountFromLayoutJson((restoredJson as any)?.grid?.root) === 0) {
                    const added = addDefaultPanels(api);
                    if (added === 0) {
                        setShowFallbackSheet(true);
                        return;
                    }
                }
            }

            const after = typeof api.toJSON === "function" ? api.toJSON() : null;
            const renderedPanels = panelCountFromLayoutJson((after as any)?.grid?.root);
            if (renderedPanels === 0) {
                setShowFallbackSheet(true);
                return;
            }

            const requiredPanelIds = new Set(
                layout.groups
                    .flatMap(group => group.tabs)
                    .filter(panelId => byId.has(panelId))
            );
            if (typeof api.onDidRemovePanel === "function") {
                api.onDidRemovePanel((removed: any) => {
                    const removedId = String(removed?.id || "");
                    if (!requiredPanelIds.has(removedId)) return;
                    if (typeof api.getPanel === "function" && api.getPanel(removedId)) return;

                    const panel = byId.get(removedId);
                    if (!panel) return;
                    const existing = typeof api.panels === "function" ? api.panels() : [];
                    const reference = existing.length ? String(existing[0]?.id || "") : "";
                    const opts: any = {
                        id: panel.id,
                        title: panel.title,
                        component: "pack-panel",
                        params: { panelId: panel.id },
                        inactive: true
                    };
                    if (reference) {
                        opts.position = { referencePanel: reference, direction: "within" };
                    }
                    api.addPanel(opts);
                });
            }

            if (typeof api.onDidLayoutChange === "function") {
                api.onDidLayoutChange(() => {
                    if (typeof api.toJSON === "function") {
                        onLayoutChanged(api.toJSON());
                    }
                });
            }
        } catch {
            // Dockview should fail soft and remain interactive
        }
    }, [addDefaultPanels, initialLayoutState, layout, onLayoutChanged, panels]);

    if (showFallbackSheet || panels.length === 0) {
        return <FallbackSheet character={character} />;
    }

    if (isMobile) {
        const group = layout.groups.find(g => g.id === activeSection) || layout.groups[0];
        const tabs = group?.tabs || [];
        const firstId = tabs[0];
        const panel = byId.get(firstId);

        return (
            <div className="mobile-shell">
                <nav className="mobile-sections">
                    {layout.groups.map(g => (
                        <button
                            key={g.id}
                            className={g.id === activeSection ? "is-active" : ""}
                            onClick={() => setActiveSection(g.id)}
                        >
                            {g.title || g.id}
                        </button>
                    ))}
                </nav>
                <div className="mobile-panel-wrap">
                    {panel ? (
                        <PackPanel panel={panel} character={character} dispatchAction={dispatchAction} />
                    ) : (
                        <div className="glass-empty">No panel mapped for this section.</div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="dockview-shell">
            <DockviewReact className="dockview-theme-abyss dockview-theme-rpgforge" onReady={onReady} components={components} />
        </div>
    );
}
