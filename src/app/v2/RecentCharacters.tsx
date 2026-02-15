import React from "react";
import type { CharacterListItem } from "../../services/v2RuntimeApi";

type Props = {
    rows: CharacterListItem[];
    onOpen: (characterId: string) => void;
    onBrowseAll: () => void;
};

function formatDate(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

export function RecentCharacters(props: Props) {
    if (!props.rows.length) {
        return (
            <section className="glass-surface home-card">
                <div className="home-card-header">
                    <h2>Recent Characters</h2>
                    <button className="glass-btn secondary" onClick={props.onBrowseAll}>Browse</button>
                </div>
                <p className="home-muted">No characters yet. Create one to get started.</p>
            </section>
        );
    }

    return (
        <section className="glass-surface home-card">
            <div className="home-card-header">
                <h2>Recent Characters</h2>
                <button className="glass-btn secondary" onClick={props.onBrowseAll}>Browse</button>
            </div>
            <div className="character-list">
                {props.rows.map(row => (
                    <article key={row.id} className="character-row">
                        <div>
                            <h3>{row.name}</h3>
                            <p>{row.rulesetId} · Level {row.level}</p>
                            <small>Updated {formatDate(row.updatedAt)}</small>
                        </div>
                        <button className="glass-btn" onClick={() => props.onOpen(row.id)}>Open</button>
                    </article>
                ))}
            </div>
        </section>
    );
}
