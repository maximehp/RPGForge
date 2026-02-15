import React from "react";
import { Parser } from "expr-eval";
import { DiceRoller } from "@dice-roller/rpg-dice-roller";
import type { CharacterCreatorPresetV3, CreatorFieldV3, CreatorStepV3 } from "../../engine/v2/types";
import {
    confirmCreatorWarnings,
    hydrateCreatorStep,
    updateCreatorSessionSelection,
    validateCreatorSession
} from "../../services/v2RuntimeApi";

type Props = {
    preset: CharacterCreatorPresetV3;
    sessionId: string;
    initialSeed?: Record<string, unknown>;
    refreshToken?: number;
    onSeedChange?: (seed: Record<string, unknown>) => void;
    onComplete: (seed: Record<string, unknown>) => void;
    onCancel?: () => void;
    onOpenHomebrewStudio?: (ctx: { stepId?: string; fieldId?: string }) => void;
};

type StepIssue = { id: string; severity: "error" | "warning"; message: string };
type StepOptions = Record<string, Array<{ value: string; label: string; meta?: Record<string, unknown> }>>;

const diceRoller = new DiceRoller();
const parser = new Parser();

function displayValue(value: unknown): string {
    if (value == null || value === "") return "(empty)";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value)) return value.map(displayValue).join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

function splitPath(path: string): string[] {
    return path.split(".").map(part => part.trim()).filter(Boolean);
}

function getAtPath(root: Record<string, unknown>, path: string): unknown {
    const parts = splitPath(path);
    let current: unknown = root;
    for (const part of parts) {
        if (!current || typeof current !== "object") return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

function setAtPath(root: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
    const parts = splitPath(path);
    if (!parts.length) return root;

    const out = structuredClone(root);
    let cursor: Record<string, unknown> = out;
    for (let i = 0; i < parts.length - 1; i += 1) {
        const part = parts[i];
        const next = cursor[part];
        if (!next || typeof next !== "object" || Array.isArray(next)) {
            cursor[part] = {};
        }
        cursor = cursor[part] as Record<string, unknown>;
    }
    cursor[parts[parts.length - 1]] = value;
    return out;
}

function hasValue(value: unknown): boolean {
    if (value === undefined || value === null || value === "") return false;
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

function parseFieldValue(field: CreatorFieldV3, raw: string, checked: boolean): unknown {
    if (field.type === "toggle") return checked;
    if (field.type === "number") {
        const trimmed = raw.trim();
        if (!trimmed) return undefined;
        const n = Number(trimmed);
        return Number.isFinite(n) ? n : undefined;
    }
    return raw;
}

function evaluateVisible(field: CreatorFieldV3, seed: Record<string, unknown>, row?: Record<string, unknown>): boolean {
    if (!field.visibleWhen?.expression?.trim()) return true;
    try {
        const compiled = parser.parse(field.visibleWhen.expression);
        return Boolean(compiled.evaluate({
            seed,
            row,
            ...seed,
            size: (value: unknown) => {
                if (Array.isArray(value) || typeof value === "string") return value.length;
                if (value && typeof value === "object") return Object.keys(value).length;
                return 0;
            }
        } as any));
    } catch {
        return true;
    }
}

function validateField(
    field: CreatorFieldV3,
    scope: Record<string, unknown>,
    errors: Record<string, string>,
    errorPath: string
) {
    const key = field.bindTo || field.id;
    const value = getAtPath(scope, key);

    if (field.required && !hasValue(value)) {
        errors[errorPath] = `${field.label} is required.`;
    }

    if (field.type !== "repeatGroup" || !Array.isArray(field.fields)) {
        return;
    }

    const rows = Array.isArray(value) ? value : [];
    if (field.required && rows.length === 0) {
        errors[errorPath] = `${field.label} requires at least one entry.`;
    }

    for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        if (!row || typeof row !== "object") continue;
        for (const child of field.fields) {
            const childKey = child.bindTo || child.id;
            const childPath = `${errorPath}[${i}].${childKey}`;
            validateField(child, row as Record<string, unknown>, errors, childPath);
        }
    }
}

export function validateCreatorStepV3(step: CreatorStepV3, seed: Record<string, unknown>): Record<string, string> {
    const errors: Record<string, string> = {};
    for (const field of step.fields || []) {
        const key = field.bindTo || field.id;
        validateField(field, seed, errors, key);
    }
    return errors;
}

function getFieldValue(seed: Record<string, unknown>, field: CreatorFieldV3): unknown {
    const key = field.bindTo || field.id;
    const current = getAtPath(seed, key);
    if (current !== undefined) return current;
    return field.default;
}

function buildDefaultRepeatRow(fields: CreatorFieldV3[]): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    for (const field of fields) {
        const key = field.bindTo || field.id;
        if (field.type === "repeatGroup" && Array.isArray(field.fields)) {
            row[key] = [];
            continue;
        }
        if (field.default !== undefined) {
            row[key] = field.default;
            continue;
        }
        if (field.type === "multiSelect") row[key] = [];
        else if (field.type === "toggle") row[key] = false;
        else row[key] = "";
    }
    return row;
}

function rollValues(field: CreatorFieldV3): number[] {
    const cfg = field.roller;
    if (!cfg) return [];
    const rolls: number[] = [];
    const maxRerolls = cfg.reroll?.maxRerolls ?? 0;
    for (let i = 0; i < cfg.count; i += 1) {
        let rerolls = 0;
        let total = Number((diceRoller.roll(cfg.expression) as any)?.total ?? 0);
        while (
            cfg.reroll
            && rerolls < maxRerolls
            && (
                (cfg.reroll.equals !== undefined && total === cfg.reroll.equals)
                || (cfg.reroll.lt !== undefined && total < cfg.reroll.lt)
            )
        ) {
            total = Number((diceRoller.roll(cfg.expression) as any)?.total ?? 0);
            rerolls += 1;
        }
        rolls.push(total);
    }
    if (cfg.assignment === "auto_desc") {
        rolls.sort((a, b) => b - a);
    }
    return rolls;
}

export function CharacterCreator(props: Props) {
    const { preset } = props;
    const [stepIndex, setStepIndex] = React.useState(0);
    const [seed, setSeed] = React.useState<Record<string, unknown>>(props.initialSeed || {});
    const [touched, setTouched] = React.useState<Record<string, boolean>>({});
    const [stepOptions, setStepOptions] = React.useState<StepOptions>({});
    const [stepIssues, setStepIssues] = React.useState<StepIssue[]>([]);
    const [warningModal, setWarningModal] = React.useState<{ open: boolean; warnings: Array<{ id: string; message: string }> }>({
        open: false,
        warnings: []
    });
    const [loadingStep, setLoadingStep] = React.useState(false);

    React.useEffect(() => {
        setSeed(props.initialSeed || {});
    }, [props.initialSeed]);

    React.useEffect(() => {
        props.onSeedChange?.(seed);
    }, [props.onSeedChange, seed]);

    const totalSteps = preset.steps.length;
    const isReviewStep = stepIndex >= totalSteps;
    const step = !isReviewStep ? preset.steps[stepIndex] : null;
    const errors = React.useMemo(() => (step ? validateCreatorStepV3(step, seed) : {}), [seed, step]);
    const canProceed = Object.keys(errors).length === 0;

    React.useEffect(() => {
        if (!step) return;
        let cancelled = false;
        const run = async () => {
            try {
                setLoadingStep(true);
                const hydrated = await hydrateCreatorStep(props.sessionId, step.id, { limit: 120, offset: 0 });
                if (cancelled) return;
                setStepOptions(hydrated.options);
                setStepIssues(hydrated.issues);
            } catch {
                if (!cancelled) {
                    setStepOptions({});
                    setStepIssues([]);
                }
            } finally {
                if (!cancelled) setLoadingStep(false);
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [props.refreshToken, props.sessionId, step]);

    const setField = (field: CreatorFieldV3, value: unknown) => {
        const key = field.bindTo || field.id;
        setSeed(prev => setAtPath(prev, key, value));
        setTouched(prev => ({ ...prev, [key]: true }));
    };

    const markStepTouched = () => {
        if (!step) return;
        const nextTouched = { ...touched };
        for (const field of step.fields || []) {
            const key = field.bindTo || field.id;
            nextTouched[key] = true;
        }
        setTouched(nextTouched);
    };

    const validateBeforeAdvance = async (): Promise<boolean> => {
        if (!step) return true;
        await updateCreatorSessionSelection(props.sessionId, seed);
        const result = await validateCreatorSession(props.sessionId, step.id);
        if (result.errors.length) {
            setStepIssues(result.errors.map(error => ({ id: error.id, severity: "error", message: error.message })));
            return false;
        }
        if (result.warnings.length) {
            setWarningModal({ open: true, warnings: result.warnings });
            return false;
        }
        return true;
    };

    const renderPrimitiveField = (
        field: CreatorFieldV3,
        value: unknown,
        onChange: (next: unknown) => void,
        optionKey: string,
        error?: string
    ) => {
        const options = stepOptions[optionKey] || [];

        if (field.type === "toggle") {
            return (
                <label key={field.id} className="creator-field toggle">
                    <input
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={e => onChange(e.target.checked)}
                    />
                    <span>{field.label}</span>
                    {error ? <small className="creator-error">{error}</small> : null}
                </label>
            );
        }

        if (field.type === "select" || field.type === "tablePick") {
            return (
                <label key={field.id} className="creator-field">
                    <span>{field.label}</span>
                    <select value={String(value ?? "")} onChange={e => onChange(e.target.value)}>
                        <option value="">Select...</option>
                        {options.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                    {error ? <small className="creator-error">{error}</small> : null}
                </label>
            );
        }

        if (field.type === "multiSelect") {
            const selected = Array.isArray(value) ? value.map(String) : [];
            return (
                <label key={field.id} className="creator-field">
                    <span>{field.label}</span>
                    <select
                        multiple
                        value={selected}
                        onChange={e => {
                            const picked = [...e.target.selectedOptions].map(option => option.value);
                            onChange(picked);
                        }}
                    >
                        {options.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                    {error ? <small className="creator-error">{error}</small> : null}
                </label>
            );
        }

        if (field.type === "roller") {
            const rolls = Array.isArray(value) ? value as unknown[] : [];
            return (
                <div key={field.id} className="creator-field">
                    <span>{field.label}</span>
                    <div className="home-actions">
                        <button className="glass-btn secondary" onClick={() => onChange(rollValues(field))}>
                            Roll
                        </button>
                        <button
                            className="glass-btn secondary"
                            onClick={() => props.onOpenHomebrewStudio?.({ stepId: step?.id, fieldId: field.id })}
                        >
                            Custom Roller Preset
                        </button>
                    </div>
                    <small className="home-muted">{rolls.length ? `Rolls: ${rolls.join(", ")}` : "No rolls yet."}</small>
                    {error ? <small className="creator-error">{error}</small> : null}
                </div>
            );
        }

        return (
            <label key={field.id} className="creator-field">
                <span>{field.label}</span>
                <input
                    type={field.type === "number" ? "number" : "text"}
                    value={value === undefined ? "" : String(value)}
                    onChange={e => onChange(parseFieldValue(field, e.target.value, e.target.checked))}
                />
                {field.helpText ? <small className="home-muted">{field.helpText}</small> : null}
                {error ? <small className="creator-error">{error}</small> : null}
            </label>
        );
    };

    return (
        <div className="creator-shell glass-surface">
            <header className="creator-header">
                <h2>{preset.title || "Character Creator"}</h2>
                {preset.description ? <p>{preset.description}</p> : null}
                <p>Step {Math.min(stepIndex + 1, totalSteps + 1)} / {totalSteps + 1}</p>
                <div className="home-actions">
                    <button
                        className="glass-btn secondary"
                        onClick={() => props.onOpenHomebrewStudio?.({ stepId: step?.id })}
                    >
                        Open Homebrew Studio
                    </button>
                </div>
            </header>

            {step ? (
                <section className="creator-step">
                    <h3>{step.title}</h3>
                    {step.description ? <p>{step.description}</p> : null}
                    {loadingStep ? <p className="home-muted">Loading step options...</p> : null}
                    {stepIssues.length ? (
                        <div className="creator-issues">
                            {stepIssues.map(issue => (
                                <p key={issue.id} className={issue.severity === "error" ? "creator-error" : "home-muted"}>
                                    {issue.message}
                                </p>
                            ))}
                        </div>
                    ) : null}
                    <div className="creator-fields">
                        {step.fields.map(field => {
                            if (!evaluateVisible(field, seed)) return null;

                            const key = field.bindTo || field.id;
                            const value = getFieldValue(seed, field);
                            const showErrors = touched[key];
                            const error = showErrors ? errors[key] : "";

                            if (field.type !== "repeatGroup") {
                                return renderPrimitiveField(field, value, next => setField(field, next), field.id, error);
                            }

                            const rows = Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
                            const nestedFields = Array.isArray(field.fields) ? field.fields : [];
                            return (
                                <div key={field.id} className="creator-repeat-group">
                                    <div className="creator-repeat-head">
                                        <strong>{field.label}</strong>
                                        <button
                                            className="glass-btn secondary"
                                            onClick={() => {
                                                const nextRows = [...rows, buildDefaultRepeatRow(nestedFields)];
                                                setField(field, nextRows);
                                            }}
                                        >
                                            Add
                                        </button>
                                    </div>
                                    {error ? <small className="creator-error">{error}</small> : null}
                                    <div className="creator-repeat-rows">
                                        {rows.map((row, rowIndex) => (
                                            <div key={`${field.id}-${rowIndex}`} className="creator-repeat-row">
                                                <div className="creator-repeat-row-header">
                                                    <strong>Entry {rowIndex + 1}</strong>
                                                    <button
                                                        className="glass-btn secondary"
                                                        onClick={() => {
                                                            const nextRows = rows.filter((_, i) => i !== rowIndex);
                                                            setField(field, nextRows);
                                                        }}
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                                <div className="creator-fields">
                                                    {nestedFields.map(nested => {
                                                        if (!evaluateVisible(nested, seed, row)) return null;
                                                        const nestedKey = nested.bindTo || nested.id;
                                                        const nestedValue = row[nestedKey] ?? nested.default;
                                                        const nestedErrorKey = `${key}[${rowIndex}].${nestedKey}`;
                                                        const nestedError = showErrors ? errors[nestedErrorKey] : "";
                                                        const optionKey = `${field.id}.${nested.id}`;
                                                        return (
                                                            <React.Fragment key={`${field.id}-${rowIndex}-${nested.id}`}>
                                                                {renderPrimitiveField(
                                                                    nested,
                                                                    nestedValue,
                                                                    next => {
                                                                        const nextRows = [...rows];
                                                                        const nextRow = { ...(nextRows[rowIndex] || {}) };
                                                                        nextRow[nestedKey] = next;
                                                                        nextRows[rowIndex] = nextRow;
                                                                        setField(field, nextRows);
                                                                    },
                                                                    optionKey,
                                                                    nestedError
                                                                )}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            ) : (
                <section className="creator-step">
                    <h3>Review</h3>
                    <p>Confirm all selected values before creating the character.</p>
                    <div className="creator-review">
                        {Object.entries(seed).map(([key, value]) => (
                            <div key={key} className="creator-review-row">
                                <span>{key}</span>
                                <strong>{displayValue(value)}</strong>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <footer className="creator-actions">
                {stepIndex > 0 ? <button className="glass-btn" onClick={() => setStepIndex(i => i - 1)}>Back</button> : null}
                {step ? (
                    <button
                        className="glass-btn"
                        onClick={async () => {
                            if (!canProceed) {
                                markStepTouched();
                                return;
                            }
                            const ok = await validateBeforeAdvance();
                            if (!ok) return;
                            setStepIndex(i => i + 1);
                        }}
                    >
                        {stepIndex === totalSteps - 1 ? "Review" : "Next"}
                    </button>
                ) : (
                    <button className="glass-btn" onClick={async () => {
                        await updateCreatorSessionSelection(props.sessionId, seed);
                        props.onComplete(seed);
                    }}>
                        Create Character
                    </button>
                )}
                {props.onCancel ? <button className="glass-btn secondary" onClick={props.onCancel}>Cancel</button> : null}
            </footer>

            {warningModal.open ? (
                <div className="creator-warning-modal">
                    <div className="creator-warning-dialog glass-surface">
                        <h3>Rule Warning</h3>
                        <p>The following warnings were detected:</p>
                        <ul>
                            {warningModal.warnings.map(warning => <li key={warning.id}>{warning.message}</li>)}
                        </ul>
                        <div className="creator-actions">
                            <button className="glass-btn secondary" onClick={() => setWarningModal({ open: false, warnings: [] })}>Cancel</button>
                            <button
                                className="glass-btn"
                                onClick={async () => {
                                    await confirmCreatorWarnings(props.sessionId, warningModal.warnings.map(w => w.id));
                                    setWarningModal({ open: false, warnings: [] });
                                    setStepIndex(i => i + 1);
                                }}
                            >
                                Proceed anyway
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
