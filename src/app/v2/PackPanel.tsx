import React from "react";
import type { ActionEnvelopeV2, CharacterDocumentV2, UiPanelV2 } from "../../engine/v2/types";
import { evaluateBool, evaluateNumber, interpolate, makeScope, type EvalScope } from "./expression";

type Props = {
    panel: UiPanelV2;
    character: CharacterDocumentV2;
    dispatchAction: (action: ActionEnvelopeV2) => void;
};

type AnyObj = Record<string, unknown>;

function toRows(source: string, character: CharacterDocumentV2): AnyObj[] {
    if (source === "attributes") {
        const effective = character.components.effectiveStats || {};
        return Object.entries(character.components.stats).map(([key, value]) => ({
            id: key,
            key,
            value,
            effective: Number(effective[key] ?? value)
        }));
    }
    if (source === "resources") {
        const effective = character.components.effectiveResources || {};
        return Object.entries(character.components.resources).map(([key, value]) => ({
            id: key,
            key,
            value,
            effective: effective[key] || value
        }));
    }
    if (source === "derived") {
        return Object.entries(character.derived).map(([key, value]) => ({ id: key, key, value }));
    }
    if (source === "inventory") {
        const inv = character.collections.inventory || character.collections.loadout || [];
        return Array.isArray(inv) ? (inv as AnyObj[]) : [];
    }
    const generic = character.collections[source];
    if (Array.isArray(generic)) return generic as AnyObj[];
    return [];
}

function resolveActionId(action: string): string {
    switch (action) {
        case "setAttribute": return "setAttribute";
        case "setResource": return "setResourceCurrent";
        case "setLevel": return "setLevel";
        case "toggleVar": return "toggleVar";
        case "recompute": return "recompute";
        case "shortRest": return "shortRest";
        case "longRest": return "longRest";
        case "roll": return "roll";
        case "createEntity": return "createEntity";
        case "updateEntity": return "updateEntity";
        case "deleteEntity": return "deleteEntity";
        case "equipEntity": return "equipEntity";
        case "unequipEntity": return "unequipEntity";
        case "applyTemplate": return "applyTemplate";
        default: return action;
    }
}

function makeId(prefix = "entity"): string {
    try {
        return `${prefix}_${crypto.randomUUID()}`;
    } catch {
        return `${prefix}_${Date.now()}_${Math.round(Math.random() * 1_000_000)}`;
    }
}

function resolvePayloadValue(value: unknown, scope: EvalScope): unknown {
    if (typeof value === "string") {
        const interpolated = interpolate(value, scope);
        const n = Number(interpolated);
        return Number.isFinite(n) && interpolated.trim() !== "" ? n : interpolated;
    }
    if (Array.isArray(value)) {
        return value.map(v => resolvePayloadValue(v, scope));
    }
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = resolvePayloadValue(v, scope);
        }
        return out;
    }
    return value;
}

function renderElement(
    el: AnyObj,
    scope: EvalScope,
    character: CharacterDocumentV2,
    dispatchAction: (action: ActionEnvelopeV2) => void,
    listPages: Record<string, number>,
    setListPages: React.Dispatch<React.SetStateAction<Record<string, number>>>,
    path = "root"
): React.ReactNode {
    const kind = String(el.kind || "");

    if (kind === "text") {
        return <p className={String(el.className || "")}>{interpolate(String(el.text || ""), scope)}</p>;
    }

    if (kind === "value") {
        return (
            <div className={`glass-value ${String(el.className || "")}`}>
                {el.label ? <label>{interpolate(String(el.label), scope)}</label> : null}
                <span>{interpolate(String(el.value || ""), scope)}</span>
            </div>
        );
    }

    if (kind === "bar") {
        const current = Math.max(0, evaluateNumber(String(el.current || "0"), scope));
        const max = Math.max(1, evaluateNumber(String(el.max || "1"), scope));
        const pct = Math.min(100, Math.round((current / max) * 100));
        return (
            <div className={`glass-bar ${String(el.className || "")}`}>
                {el.label ? <div className="glass-bar-label">{interpolate(String(el.label), scope)}</div> : null}
                <div className="glass-bar-track"><div className="glass-bar-fill" style={{ width: `${pct}%` }} /></div>
                {el.showNumbers ? <div className="glass-bar-numbers">{current} / {max}</div> : null}
            </div>
        );
    }

    if (kind === "numberInput") {
        const inputId = String(el.id || "");
        const value = evaluateNumber(String(el.value || "0"), scope);
        const oc = (el.onChange || {}) as AnyObj;

        const onChange = (next: number) => {
            const actionId = resolveActionId(String(oc.action || ""));
            const key = oc.key ? interpolate(String(oc.key), scope) : undefined;
            const payload: Record<string, unknown> = { value: next };
            if (key) payload.key = key;
            dispatchAction({ id: actionId, payload });
        };

        return (
            <div className={`glass-input ${String(el.className || "")}`}>
                {el.label ? <label htmlFor={inputId}>{interpolate(String(el.label), scope)}</label> : null}
                <input
                    id={inputId}
                    type="number"
                    value={value}
                    min={el.min as number | undefined}
                    max={el.max as number | undefined}
                    step={(el.step as number | undefined) ?? 1}
                    onChange={e => onChange(Number(e.target.value))}
                />
            </div>
        );
    }

    if (kind === "toggle") {
        const inputId = String(el.id || "");
        const checked = evaluateBool(String(el.value || "false"), scope);
        const oc = (el.onChange || {}) as AnyObj;

        const onChange = () => {
            const actionId = resolveActionId(String(oc.action || "toggleVar"));
            const key = oc.key ? interpolate(String(oc.key), scope) : undefined;
            const payload = key ? { key } : undefined;
            dispatchAction({ id: actionId, payload });
        };

        return (
            <label className={`glass-toggle ${String(el.className || "")}`}>
                <input id={inputId} type="checkbox" checked={checked} onChange={onChange} />
                <span>{interpolate(String(el.label || ""), scope)}</span>
            </label>
        );
    }

    if (kind === "button") {
        const oc = (el.onClick || {}) as AnyObj;
        const onClick = () => {
            const actionId = resolveActionId(String(oc.action || ""));
            const payloadConfig = (oc.payload || {}) as AnyObj;
            const payload: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(payloadConfig)) {
                payload[k] = resolvePayloadValue(v, scope);
            }
            if (actionId === "setResourceCurrent") {
                const key = interpolate(String(oc.key || ""), scope);
                const to = evaluateNumber(String(oc.to || "0"), scope);
                dispatchAction({ id: actionId, payload: { key, value: to } });
                return;
            }
            dispatchAction({ id: actionId, payload: Object.keys(payload).length ? payload : undefined });
        };

        return <button className={`glass-btn ${String(el.className || "")}`} onClick={onClick}>{interpolate(String(el.label || "Action"), scope)}</button>;
    }

    if (kind === "list") {
        const of = (el.of || "") as string;
        const rows = toRows(of, character);
        const rowElements = Array.isArray(el.row) ? (el.row as AnyObj[]) : [];
        const listId = `${path}:${String(el.id || of || "list")}`;
        const pageSizeRaw = Number(el.pageSize ?? 50);
        const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.floor(pageSizeRaw) : 50;
        const configuredPage = Number(el.page ?? 0);
        const page = Number.isFinite(configuredPage) && configuredPage > 0
            ? Math.floor(configuredPage)
            : (listPages[listId] || 1);
        const maxVisible = page * pageSize;
        const visibleRows = rows.slice(0, maxVisible);
        const hasMoreDefault = visibleRows.length < rows.length;
        const hasMore = typeof el.hasMore === "boolean" ? Boolean(el.hasMore) : hasMoreDefault;

        if (!rows.length) {
            return <div className="glass-empty">{interpolate(String(el.emptyText || "Nothing to show"), scope)}</div>;
        }

        return (
            <div className={`glass-list ${String(el.className || "")}`}>
                {visibleRows.map((row, index) => {
                    const rowScope = makeScope(character, { item: row, index });
                    return (
                        <div className="glass-list-row" key={String((row.id as string) || index)}>
                            {rowElements.map((child, idx) => (
                                <React.Fragment key={String(child.id || idx)}>
                                    {renderElement(
                                        child,
                                        rowScope,
                                        character,
                                        dispatchAction,
                                        listPages,
                                        setListPages,
                                        `${listId}:row:${index}`
                                    )}
                                </React.Fragment>
                            ))}
                        </div>
                    );
                })}
                {hasMoreDefault && hasMore ? (
                    <button
                        className="glass-btn secondary"
                        onClick={() => {
                            if (configuredPage > 0) return;
                            setListPages(prev => ({ ...prev, [listId]: (prev[listId] || 1) + 1 }));
                        }}
                    >
                        Load more ({visibleRows.length}/{rows.length})
                    </button>
                ) : null}
            </div>
        );
    }

    if (kind === "actionBar") {
        const buttons = Array.isArray(el.buttons) ? (el.buttons as AnyObj[]) : [];
        return (
            <div className={`glass-action-bar ${String(el.className || "")}`}>
                {buttons.map((btn, idx) => (
                    <React.Fragment key={String(btn.id || idx)}>
                        {renderElement({ ...btn, kind: "button" }, scope, character, dispatchAction, listPages, setListPages, `${path}:button:${idx}`)}
                    </React.Fragment>
                ))}
            </div>
        );
    }

    if (kind === "createButton") {
        const label = interpolate(String(el.label || "+ New"), scope);
        const actionId = resolveActionId(String(el.action || "createEntity"));
        const collection = String(el.collection || "inventory");
        const contentType = String(el.contentType || "item");
        const defaultBonusKey = String(el.bonusKey || "str");
        const defaultBonus = Number(el.bonusValue ?? 0);
        const template = (el.template || {}) as AnyObj;

        const onClick = () => {
            const name = window.prompt(String(el.namePrompt || `Create ${contentType} name`), String(template.title || ""));
            if (name == null || !name.trim()) return;

            const bonusText = window.prompt(String(el.bonusPrompt || "Stat bonus (optional)"), String(defaultBonus));
            const bonusValue = Number(bonusText);
            const key = String(el.bonusKeyPrompt ? (window.prompt(String(el.bonusKeyPrompt), defaultBonusKey) || defaultBonusKey) : defaultBonusKey);

            const effects = Number.isFinite(bonusValue) && bonusValue !== 0
                ? [{
                    id: `bonus_${key}`,
                    label: `Bonus ${key}`,
                    modifiers: [{ target: "stat", key, operation: "add", value: bonusValue }],
                    triggers: [{ kind: "equipped" }],
                    duration: { type: "while_equipped" },
                    stacking: "sum"
                }]
                : [];

            const entity = {
                id: String(template.id || makeId(contentType)),
                title: name.trim(),
                contentType,
                equipped: false,
                ...template,
                effects: effects.length ? effects : (template.effects || [])
            };

            dispatchAction({
                id: actionId,
                payload: {
                    collection,
                    entity
                }
            });
        };

        return <button className={`glass-btn ${String(el.className || "")}`} onClick={onClick}>{label}</button>;
    }

    if (kind === "image") {
        return (
            <img
                className={String(el.className || "")}
                src={interpolate(String(el.src || ""), scope)}
                alt={interpolate(String(el.alt || ""), scope)}
                width={el.width as number | undefined}
                height={el.height as number | undefined}
            />
        );
    }

    return null;
}

export function PackPanel(props: Props) {
    const { panel, character, dispatchAction } = props;
    const [collapsed, setCollapsed] = React.useState(false);
    const [listPages, setListPages] = React.useState<Record<string, number>>({});
    const scope = React.useMemo(() => makeScope(character), [character]);
    const elements = Array.isArray(panel.elements) ? (panel.elements as AnyObj[]) : [];

    React.useEffect(() => {
        setListPages({});
    }, [character.meta.id, panel.id]);

    return (
        <section className="glass-panel">
            <header className="glass-panel-header">
                <h3>{panel.title}</h3>
                {panel.collapsible ? (
                    <button className="glass-collapse" onClick={() => setCollapsed(v => !v)}>
                        {collapsed ? "Expand" : "Collapse"}
                    </button>
                ) : null}
            </header>
            {!collapsed ? (
                <div className="glass-panel-body">
                    {elements.map((el, idx) => (
                        <React.Fragment key={String(el.id || idx)}>
                            {renderElement(el, scope, character, dispatchAction, listPages, setListPages, `${panel.id}:${idx}`)}
                        </React.Fragment>
                    ))}
                </div>
            ) : null}
        </section>
    );
}
