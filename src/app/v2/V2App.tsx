import React from "react";
import type { CharacterCreatorPresetV3, CharacterDocumentV2, CreatorSessionV2, ResolvedRuleset } from "../../engine/v2/types";
import {
    activatePacks,
    completeCharacterCreator,
    dispatchAction,
    getRecentCharacters,
    importPackBundle,
    listAvailablePackIds,
    loadCharacterForOpen,
    resolvePackAlias,
    startCharacterCreator,
    upsertCreatorSessionProgress,
    type CharacterListItem,
    type OpenCharacterOptions
} from "../../services/v2RuntimeApi";
import { saveLayoutState } from "../../services/v2LayoutService";
import { DockviewWorkspace } from "./DockviewWorkspace";
import { CharacterCreator } from "./CharacterCreator";
import { CharacterBrowser } from "./CharacterBrowser";
import { RecentCharacters } from "./RecentCharacters";

type AppRoute =
    | { page: "home" }
    | { page: "characters" }
    | { page: "creator" }
    | { page: "sheet"; characterId: string };

const LAST_OPEN_CHARACTER_STORAGE_KEY = "rpgforge:last-open-character-id";

function parseRoute(pathname: string): AppRoute {
    const parts = pathname.split("/").filter(Boolean);
    if (!parts.length) return { page: "home" };
    if (parts[0] === "create") return { page: "creator" };
    if (parts[0] === "characters" && parts[1]) return { page: "sheet", characterId: decodeURIComponent(parts[1]) };
    if (parts[0] === "characters") return { page: "characters" };
    return { page: "home" };
}

function routePath(route: AppRoute): string {
    if (route.page === "home") return "/";
    if (route.page === "creator") return "/create";
    if (route.page === "characters") return "/characters";
    return `/characters/${encodeURIComponent(route.characterId)}`;
}

function readLastOpenCharacterId(): string {
    try {
        return localStorage.getItem(LAST_OPEN_CHARACTER_STORAGE_KEY) || "";
    } catch {
        return "";
    }
}

function writeLastOpenCharacterId(characterId: string): void {
    if (!characterId) return;
    try {
        localStorage.setItem(LAST_OPEN_CHARACTER_STORAGE_KEY, characterId);
    } catch {
        // Ignore storage failures in private/incognito modes.
    }
}

function clearLastOpenCharacterId(): void {
    try {
        localStorage.removeItem(LAST_OPEN_CHARACTER_STORAGE_KEY);
    } catch {
        // Ignore storage failures in private/incognito modes.
    }
}

function rootPackIdFromRulesetId(rulesetId: string): string {
    const [head] = rulesetId.split("@");
    return head || rulesetId;
}

function applyAccents(ruleset: ResolvedRuleset) {
    if (ruleset.ui.accents?.primary) {
        document.documentElement.style.setProperty("--accent-a", ruleset.ui.accents.primary);
    }
    if (ruleset.ui.accents?.secondary) {
        document.documentElement.style.setProperty("--accent-b", ruleset.ui.accents.secondary);
    }
    if (ruleset.ui.accents?.surfaceTint) {
        document.documentElement.style.setProperty("--glass", ruleset.ui.accents.surfaceTint);
    }
}

function collectionCount(value: unknown): number {
    return Array.isArray(value) ? value.length : 0;
}

function BasicSheetView(props: { character: CharacterDocumentV2; ruleset: ResolvedRuleset; reason?: string }) {
    const { character, ruleset, reason } = props;
    return (
        <section className="glass-surface workspace-fallback">
            <header className="workspace-fallback-header">
                <h2>{character.meta.name}</h2>
                <p className="home-muted">{reason || "Basic sheet fallback view."}</p>
            </header>
            <div className="workspace-fallback-grid">
                <article className="workspace-fallback-card">
                    <h3>Core</h3>
                    <p>Ruleset: {ruleset.id}</p>
                    <p>Level: {character.core.level}</p>
                    <p>XP: {character.core.xp}</p>
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
                    {Object.entries(character.collections).map(([key, value]) => (
                        <p key={key}>{key}: {collectionCount(value)}</p>
                    ))}
                </article>
            </div>
        </section>
    );
}

class SheetErrorBoundary extends React.Component<{
    fallback: React.ReactNode;
    children: React.ReactNode;
}, { hasError: boolean }> {
    constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(): { hasError: boolean } {
        return { hasError: true };
    }

    componentDidUpdate(prevProps: { children: React.ReactNode }) {
        if (prevProps.children !== this.props.children && this.state.hasError) {
            this.setState({ hasError: false });
        }
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback;
        }
        return this.props.children;
    }
}

export function V2App() {
    const [route, setRoute] = React.useState<AppRoute>(() => parseRoute(window.location.pathname));
    const [packOptions, setPackOptions] = React.useState<string[]>([]);
    const [selectedPack, setSelectedPack] = React.useState<string>("");
    const [ruleset, setRuleset] = React.useState<ResolvedRuleset | null>(null);
    const [character, setCharacter] = React.useState<CharacterDocumentV2 | null>(null);
    const [layoutState, setLayoutState] = React.useState<unknown | undefined>(undefined);
    const [recentCharacters, setRecentCharacters] = React.useState<CharacterListItem[]>([]);
    const [creatorSession, setCreatorSession] = React.useState<CreatorSessionV2 | null>(null);
    const [creatorSeed, setCreatorSeed] = React.useState<Record<string, unknown>>({});
    const [creatorRefreshToken, setCreatorRefreshToken] = React.useState(0);
    const [status, setStatus] = React.useState<string>("Booting...");
    const [error, setError] = React.useState<string>("");
    const [lastOpenCharacterId, setLastOpenCharacterId] = React.useState<string>("");
    const attemptedAutoRestoreRef = React.useRef(false);
    const attemptedRouteLoadRef = React.useRef<string>("");

    const navigate = React.useCallback((next: AppRoute, options?: { replace?: boolean }) => {
        const path = routePath(next);
        const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (current !== path) {
            if (options?.replace) {
                window.history.replaceState(null, "", path);
            } else {
                window.history.pushState(null, "", path);
            }
        }
        setRoute(next);
    }, []);

    React.useEffect(() => {
        const onPopState = () => {
            setRoute(parseRoute(window.location.pathname));
        };
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, []);

    const refreshRecent = React.useCallback(async () => {
        const rows = await getRecentCharacters(8);
        setRecentCharacters(rows);
    }, []);

    React.useEffect(() => {
        let cancelled = false;
        const boot = async () => {
            try {
                setStatus("Loading pack metadata...");
                const ids = await listAvailablePackIds();
                if (cancelled) return;
                const params = new URLSearchParams(location.search);
                const pack = params.get("pack");
                const requestedPack = pack ? resolvePackAlias(pack) : "";
                const initial = requestedPack && ids.includes(requestedPack)
                    ? requestedPack
                    : (ids.includes("dnd_srd_5e_2024") ? "dnd_srd_5e_2024" : ids[0]);

                setPackOptions(ids);
                setSelectedPack(initial || "");
                setLastOpenCharacterId(readLastOpenCharacterId());
                await refreshRecent();
                if (cancelled) return;
                setStatus("Ready");
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (!cancelled) {
                    setError(msg);
                    setStatus("Failed to initialize app");
                }
            }
        };
        void boot();
        return () => {
            cancelled = true;
        };
    }, [refreshRecent]);

    const beginCreator = React.useCallback(async (packId: string) => {
        try {
            if (!packId) {
                setError("Select a ruleset before starting character creation.");
                return;
            }
            setError("");
            setStatus(`Activating ${packId}...`);
            const rs = await activatePacks([packId]);
            if (!rs.creator || rs.creator.schemaVersion !== "3.0.0") {
                throw new Error(`Ruleset ${rs.id} is missing a V3 creator preset.`);
            }
            applyAccents(rs);
            setRuleset(rs);
            setCharacter(null);
            setLayoutState(undefined);

            const session = await startCharacterCreator(rs.id, { resume: true });
            setCreatorSession(session);
            setCreatorSeed(session.seed || {});
            setCreatorRefreshToken(0);
            navigate({ page: "creator" });
            setStatus(`Creating character for ${rs.id}`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg);
            setStatus("Failed to initialize creator");
        }
    }, [navigate]);

    const openCharacterById = React.useCallback(async (characterId: string, options: OpenCharacterOptions = {}) => {
        try {
            setError("");
            setLastOpenCharacterId(characterId);
            setStatus("Opening character...");
            const result = await loadCharacterForOpen(characterId, options);
            applyAccents(result.ruleset);
            setRuleset(result.ruleset);
            setCharacter(result.character);
            setLayoutState(result.layoutState ?? undefined);
            setSelectedPack(rootPackIdFromRulesetId(result.ruleset.id));
            setCreatorSession(null);
            setCreatorSeed({});
            setCreatorRefreshToken(0);
            navigate({ page: "sheet", characterId: result.character.meta.id });
            writeLastOpenCharacterId(result.character.meta.id);
            await refreshRecent();
            setStatus(result.warnings.length ? `Opened with warnings: ${result.warnings.join(" ")}` : `Loaded ${result.character.meta.name}`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.toLowerCase().includes("character not found")) {
                clearLastOpenCharacterId();
                setLastOpenCharacterId("");
            }
            setError(msg);
            setStatus("Failed to open character");
        }
    }, [navigate, refreshRecent]);

    React.useEffect(() => {
        if (import.meta.env.MODE === "test") return;
        if (attemptedAutoRestoreRef.current) return;
        if (!packOptions.length) return;
        if (character) return;
        if (route.page !== "home") return;
        const characterId = readLastOpenCharacterId();
        if (!characterId) return;
        attemptedAutoRestoreRef.current = true;
        void openCharacterById(characterId);
    }, [character, openCharacterById, packOptions.length, route.page]);

    React.useEffect(() => {
        attemptedRouteLoadRef.current = "";
    }, [route.page, route.page === "sheet" ? route.characterId : ""]);

    React.useEffect(() => {
        if (route.page !== "creator") return;
        if (creatorSession) return;
        if (!selectedPack) return;
        const key = `creator:${selectedPack}`;
        if (attemptedRouteLoadRef.current === key) return;
        attemptedRouteLoadRef.current = key;
        void beginCreator(selectedPack);
    }, [beginCreator, creatorSession, route.page, selectedPack]);

    React.useEffect(() => {
        if (route.page !== "sheet") return;
        const targetId = route.characterId;
        if (!targetId) return;
        if (character?.meta.id === targetId) return;
        const key = `sheet:${targetId}`;
        if (attemptedRouteLoadRef.current === key) return;
        attemptedRouteLoadRef.current = key;
        void openCharacterById(targetId);
    }, [character?.meta.id, openCharacterById, route.page, route.page === "sheet" ? route.characterId : ""]);

    const onImportPack = async (file: File) => {
        const report = await importPackBundle(file);
        if (report.errors.length) {
            setError(report.errors.join("\n"));
            setStatus("Import failed");
        } else {
            setError("");
            const importedId = report.packId || file.name;
            setStatus(`Imported ${importedId}`);
            const ids = await listAvailablePackIds();
            setPackOptions(ids);
            if (report.packId) setSelectedPack(report.packId);
        }
    };

    const onAction = React.useCallback(async (action: { id: string; payload?: Record<string, unknown> }) => {
        if (!character) return;
        try {
            const next = await dispatchAction(character.meta.id, action);
            setCharacter(next);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg);
        }
    }, [character]);

    const onLayoutChanged = React.useCallback((state: unknown) => {
        if (!character || !ruleset) return;
        void saveLayoutState(character.meta.id, ruleset.id, state);
    }, [character, ruleset]);

    const onCompleteCreator = React.useCallback(async (seed: Record<string, unknown>) => {
        if (!ruleset) return;

        try {
            setError("");
            const session = creatorSession || await startCharacterCreator(ruleset.id, { resume: true });
            const doc = await completeCharacterCreator(session.id, seed);
            setCreatorSession(null);
            setCreatorSeed({});
            setCreatorRefreshToken(0);
            setCharacter(doc);
            setLastOpenCharacterId(doc.meta.id);
            writeLastOpenCharacterId(doc.meta.id);
            setLayoutState(undefined);
            navigate({ page: "sheet", characterId: doc.meta.id });
            await refreshRecent();
            setStatus(`Loaded ${ruleset.id}`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg);
        }
    }, [creatorSession, navigate, refreshRecent, ruleset]);

    const onCreatorSeedChange = React.useCallback((seed: Record<string, unknown>) => {
        setCreatorSeed(seed);
        if (!creatorSession) return;
        void upsertCreatorSessionProgress(creatorSession.id, seed).catch(() => {
            // Persist failures should not block local creator progress.
        });
    }, [creatorSession]);

    return (
        <div className="app-shell">
            <header className="topbar glass-surface">
                <div className="title-block">
                    <h1>RPGForge V2.1</h1>
                    <p>{status}</p>
                </div>

                <div className="topbar-controls">
                    <label>
                        Ruleset
                        <select value={selectedPack} onChange={e => setSelectedPack(resolvePackAlias(e.target.value))}>
                            {packOptions.map(id => (
                                <option key={id} value={id}>{id}</option>
                            ))}
                        </select>
                    </label>

                    <button className="glass-btn" onClick={() => void beginCreator(selectedPack)}>New Character</button>
                    <button className="glass-btn secondary" onClick={() => navigate({ page: "characters" })}>Open Character</button>
                    <button className="glass-btn secondary" onClick={() => navigate({ page: "home" })}>Home</button>

                    <label className="import-label">
                        Import .gpack
                        <input
                            type="file"
                            accept=".gpack"
                            onChange={e => {
                                const f = e.currentTarget.files?.[0];
                                if (f) void onImportPack(f);
                            }}
                        />
                    </label>
                </div>
            </header>
            <main className="app-main">
                {error ? (
                    <div className="error-banner">
                        <p>{error}</p>
                        {lastOpenCharacterId ? (
                            <div className="error-actions">
                                <button className="glass-btn secondary" onClick={() => void openCharacterById(lastOpenCharacterId)}>Retry open</button>
                                <button className="glass-btn secondary" onClick={() => void openCharacterById(lastOpenCharacterId, { ignoreLayout: true })}>Open without saved layout</button>
                                <button className="glass-btn secondary" onClick={() => void openCharacterById(lastOpenCharacterId, { attemptMigration: true })}>Attempt migration and reopen</button>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {route.page === "home" ? (
                    <section className="home-shell">
                        <section className="glass-surface home-card">
                            <div className="home-card-header">
                                <h2>Open Character</h2>
                                <button className="glass-btn" onClick={() => navigate({ page: "characters" })}>Browse All</button>
                            </div>
                            <p className="home-muted">Choose an existing character or create a new one with your selected ruleset.</p>
                            <div className="home-actions">
                                <button className="glass-btn" onClick={() => void beginCreator(selectedPack)}>Create New Character</button>
                            </div>
                        </section>
                        <RecentCharacters rows={recentCharacters} onOpen={id => void openCharacterById(id)} onBrowseAll={() => navigate({ page: "characters" })} />
                    </section>
                ) : null}

                {route.page === "characters" ? (
                    <CharacterBrowser
                        rulesetOptions={packOptions}
                        onOpen={id => void openCharacterById(id)}
                        onBack={() => {
                            void refreshRecent();
                            navigate({ page: "home" });
                        }}
                    />
                ) : null}

                {route.page === "creator" && ruleset && creatorSession ? (
                    <CharacterCreator
                        preset={ruleset.creator as CharacterCreatorPresetV3}
                        sessionId={creatorSession.id}
                        initialSeed={creatorSeed}
                        initialStepId={creatorSession.uiState?.currentStepId}
                        refreshToken={creatorRefreshToken}
                        onSeedChange={onCreatorSeedChange}
                        onComplete={onCompleteCreator}
                        onCancel={() => navigate({ page: "home" })}
                    />
                ) : null}

                {route.page === "sheet" && ruleset && character ? (
                    ruleset.ui.panels.length === 0 || ruleset.ui.layout.groups.length === 0 ? (
                        <BasicSheetView
                            character={character}
                            ruleset={ruleset}
                            reason="Ruleset UI layout was missing. Showing basic sheet view."
                        />
                    ) : (
                        <SheetErrorBoundary
                            fallback={(
                                <BasicSheetView
                                    character={character}
                                    ruleset={ruleset}
                                    reason="Dockview failed to render. Showing basic sheet view."
                                />
                            )}
                        >
                            <DockviewWorkspace
                                panels={ruleset.ui.panels}
                                layout={ruleset.ui.layout}
                                character={character}
                                initialLayoutState={layoutState}
                                dispatchAction={onAction}
                                onLayoutChanged={onLayoutChanged}
                            />
                        </SheetErrorBoundary>
                    )
                ) : null}

                {route.page === "sheet" && (!ruleset || !character) ? (
                    <div className="loading-state">Loading character...</div>
                ) : null}

                {route.page === "creator" && (!ruleset || !creatorSession) ? (
                    <div className="loading-state">Preparing creator...</div>
                ) : null}

                {!packOptions.length ? <div className="loading-state">Loading ruleset metadata...</div> : null}
            </main>
        </div>
    );
}
