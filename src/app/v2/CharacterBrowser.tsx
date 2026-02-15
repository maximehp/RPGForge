import React from "react";
import {
    archiveCharacter,
    deleteCharacter,
    listCharacters,
    type CharacterListItem
} from "../../services/v2RuntimeApi";

type Props = {
    rulesetOptions: string[];
    onOpen: (characterId: string) => void;
    onBack: () => void;
};

const PAGE_SIZE = 25;

function formatDate(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

export function CharacterBrowser(props: Props) {
    const [name, setName] = React.useState("");
    const [rulesetId, setRulesetId] = React.useState("");
    const [includeArchived, setIncludeArchived] = React.useState(false);
    const [rows, setRows] = React.useState<CharacterListItem[]>([]);
    const [offset, setOffset] = React.useState(0);
    const [canLoadMore, setCanLoadMore] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState("");

    const loadPage = React.useCallback(async (pageOffset: number, append: boolean) => {
        try {
            setLoading(true);
            setError("");
            const page = await listCharacters({
                name: name.trim() || undefined,
                rulesetId: rulesetId || undefined,
                includeArchived,
                limit: PAGE_SIZE,
                offset: pageOffset
            });
            setRows(prev => append ? [...prev, ...page] : page);
            setOffset(pageOffset + page.length);
            setCanLoadMore(page.length >= PAGE_SIZE);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, [includeArchived, name, rulesetId]);

    React.useEffect(() => {
        setOffset(0);
        void loadPage(0, false);
    }, [name, rulesetId, includeArchived, loadPage]);

    const onArchive = async (id: string) => {
        await archiveCharacter(id);
        setOffset(0);
        await loadPage(0, false);
    };

    const onDelete = async (id: string) => {
        const ok = window.confirm("Delete this character permanently?");
        if (!ok) return;
        await deleteCharacter(id);
        setOffset(0);
        await loadPage(0, false);
    };

    return (
        <section className="glass-surface browser-shell">
            <header className="browser-header">
                <div>
                    <h2>Characters</h2>
                    <p className="home-muted">Browse, filter, open, archive, or delete saved characters.</p>
                </div>
                <button className="glass-btn secondary" onClick={props.onBack}>Back</button>
            </header>

            <div className="browser-filters">
                <label>
                    Name
                    <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Filter by character name"
                    />
                </label>
                <label>
                    Ruleset
                    <select value={rulesetId} onChange={e => setRulesetId(e.target.value)}>
                        <option value="">All rulesets</option>
                        {props.rulesetOptions.map(id => (
                            <option key={id} value={id}>{id}</option>
                        ))}
                    </select>
                </label>
                <label className="toggle-inline">
                    <input
                        type="checkbox"
                        checked={includeArchived}
                        onChange={e => setIncludeArchived(e.target.checked)}
                    />
                    <span>Show archived</span>
                </label>
            </div>

            {error ? <div className="error-banner">{error}</div> : null}

            <div className="character-list">
                {rows.map(row => (
                    <article key={row.id} className="character-row">
                        <div>
                            <h3>{row.name}{row.archived ? " (Archived)" : ""}</h3>
                            <p>{row.rulesetId} · Level {row.level}</p>
                            <small>Updated {formatDate(row.updatedAt)}</small>
                        </div>
                        <div className="character-row-actions">
                            <button className="glass-btn" onClick={() => props.onOpen(row.id)}>Open</button>
                            {!row.archived ? <button className="glass-btn secondary" onClick={() => void onArchive(row.id)}>Archive</button> : null}
                            <button className="glass-btn secondary" onClick={() => void onDelete(row.id)}>Delete</button>
                        </div>
                    </article>
                ))}
                {!rows.length && !loading ? <p className="home-muted">No characters match the current filters.</p> : null}
            </div>

            <footer className="browser-footer">
                {canLoadMore ? (
                    <button className="glass-btn secondary" disabled={loading} onClick={() => void loadPage(offset, true)}>
                        {loading ? "Loading..." : "Load more"}
                    </button>
                ) : null}
            </footer>
        </section>
    );
}
