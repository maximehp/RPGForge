import React from "react";
import {
    createOverlayPack,
    exportOverlayPack,
    upsertOverlayEntity
} from "../../services/v2RuntimeApi";

type Props = {
    rulesetId: string;
    characterId?: string;
    onClose: () => void;
    onSaved?: () => void;
};

const CONTENT_TYPES = ["items", "spells", "features", "classes", "races", "feats", "backgrounds"];

function safeSlug(input: string): string {
    return input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 64);
}

export function HomebrewStudio(props: Props) {
    const [overlayId, setOverlayId] = React.useState<string>("");
    const [contentType, setContentType] = React.useState<string>("feats");
    const [name, setName] = React.useState<string>("");
    const [json, setJson] = React.useState<string>("{}");
    const [status, setStatus] = React.useState<string>("");
    const [error, setError] = React.useState<string>("");
    const [busy, setBusy] = React.useState(false);

    const ensureOverlay = React.useCallback(async (): Promise<string> => {
        if (overlayId) return overlayId;
        const overlay = await createOverlayPack(
            props.rulesetId,
            props.characterId ? "character" : "global",
            props.characterId,
            "Creator Homebrew"
        );
        setOverlayId(overlay.meta.id);
        return overlay.meta.id;
    }, [overlayId, props.characterId, props.rulesetId]);

    const onSave = async () => {
        try {
            setBusy(true);
            setError("");
            const trimmedName = name.trim();
            if (!trimmedName) {
                setError("Name is required.");
                return;
            }
            const parsed = JSON.parse(json || "{}") as Record<string, unknown>;
            const id = safeSlug(trimmedName) || `custom_${Date.now()}`;
            const activeOverlayId = await ensureOverlay();
            await upsertOverlayEntity(activeOverlayId, {
                contentType,
                id,
                title: trimmedName,
                data: {
                    name: trimmedName,
                    ...parsed
                }
            });
            setStatus(`Saved ${trimmedName} to ${contentType}.`);
            props.onSaved?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };

    const onExport = async () => {
        if (!overlayId) {
            setError("Create at least one homebrew entry before exporting.");
            return;
        }
        setError("");
        setBusy(true);
        try {
            const blob = await exportOverlayPack(overlayId);
            const href = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = href;
            a.download = `${overlayId}.gpack`;
            a.click();
            URL.revokeObjectURL(href);
            setStatus(`Exported ${overlayId}.gpack`);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="glass-surface homebrew-shell">
            <header className="homebrew-header">
                <div>
                    <h2>Homebrew Studio</h2>
                    <p className="home-muted">Create custom options and immediately use them in character creation.</p>
                </div>
                <button className="glass-btn secondary" onClick={props.onClose}>Back to Creator</button>
            </header>

            {error ? <div className="error-banner">{error}</div> : null}
            {status ? <p className="home-muted">{status}</p> : null}

            <div className="homebrew-grid">
                <label>
                    Type
                    <select value={contentType} onChange={e => setContentType(e.target.value)}>
                        {CONTENT_TYPES.map(type => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>
                </label>

                <label>
                    Name
                    <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Custom Arcane Trickster"
                    />
                </label>
            </div>

            <label className="homebrew-json">
                JSON Data
                <textarea
                    value={json}
                    onChange={e => setJson(e.target.value)}
                    rows={10}
                    spellCheck={false}
                    placeholder='{\"description\": \"Your custom feature text\"}'
                />
            </label>

            <div className="home-actions">
                <button className="glass-btn" disabled={busy} onClick={() => void onSave()}>
                    {busy ? "Saving..." : "Save Homebrew Entry"}
                </button>
                <button className="glass-btn secondary" disabled={busy} onClick={() => void onExport()}>
                    Export Overlay
                </button>
            </div>
        </section>
    );
}
