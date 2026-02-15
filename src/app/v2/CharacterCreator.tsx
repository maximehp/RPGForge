import React from "react";
import { Parser } from "expr-eval";
import { DiceRoller } from "@dice-roller/rpg-dice-roller";
import type { CharacterCreatorPresetV3, CreatorFieldV3, CreatorStepV3 } from "../../engine/v2/types";
import {
    confirmCreatorWarnings,
    hydrateCreatorStep,
    updateCreatorSessionSelection,
    upsertCreatorCustomOption,
    upsertCreatorSessionUiState,
    validateCreatorSession
} from "../../services/v2RuntimeApi";
import {
    classLevelsById,
    pointBuySpent,
    requiredSubclassClassIds,
    synchronizeClassSelections
} from "../../runtime/v2/creatorSrd2014";

type Props = {
    preset: CharacterCreatorPresetV3;
    sessionId: string;
    initialSeed?: Record<string, unknown>;
    initialStepId?: string;
    refreshToken?: number;
    onSeedChange?: (seed: Record<string, unknown>) => void;
    onComplete: (seed: Record<string, unknown>) => void;
    onCancel?: () => void;
};

type StepIssue = { id: string; severity: "error" | "warning"; message: string };
type StepOptions = Record<string, Array<{ value: string; label: string; meta?: Record<string, unknown> }>>;

type WarningModalState = {
    open: boolean;
    warnings: Array<{ id: string; message: string }>;
    action: "next" | "create";
};

type CustomModalState = {
    open: boolean;
    contentType: string;
    label: string;
    applyValue: (id: string) => void;
};

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
        if (!trimmed) return "";
        const n = Number(trimmed);
        return Number.isFinite(n) ? n : raw;
    }
    return raw;
}

function selectedClassIdsFromSeed(seed: Record<string, unknown>): string[] {
    return Object.keys(classLevelsById(seed));
}

function classSyncToken(seed: Record<string, unknown>): string {
    return JSON.stringify({
        class_plan: seed.class_plan,
        subclass_plan: seed.subclass_plan,
        level_total: seed.level_total,
        level: seed.level
    });
}

function prettyId(value: unknown): string {
    return String(value || "")
        .replace(/^srd_/, "")
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, letter => letter.toUpperCase());
}

function numericFieldBounds(
    field: CreatorFieldV3,
    optionKey: string,
    seed: Record<string, unknown>
): { min?: number; max?: number; step?: number } {
    if (field.type !== "number") return {};

    if (optionKey.endsWith(".levels") || optionKey === "level_total" || optionKey === "level") {
        return { min: 1, max: 20, step: 1 };
    }

    const bindTo = field.bindTo || field.id;
    if (bindTo.startsWith("stats.")) {
        if (String(seed.ability_method || "") === "point_buy") {
            return { min: 8, max: 15, step: 1 };
        }
        return { min: 3, max: 20, step: 1 };
    }

    return { step: 1 };
}

function hydrationDependencyValue(stepId: string, seed: Record<string, unknown>): string {
    switch (stepId) {
        case "ancestry":
            return JSON.stringify({ race_id: seed.race_id });
        case "class_plan":
            return JSON.stringify({ class_plan: seed.class_plan, subclass_plan: seed.subclass_plan });
        case "spells":
            return JSON.stringify({ class_plan: seed.class_plan });
        case "equipment":
            return JSON.stringify({ class_plan: seed.class_plan, background_id: seed.background_id });
        default:
            return "";
    }
}

function evaluateVisible(field: CreatorFieldV3, seed: Record<string, unknown>, row?: Record<string, unknown>): boolean {
    if (!field.visibleWhen?.expression?.trim()) return true;
    try {
        const selectedClassIds = selectedClassIdsFromSeed(seed);
        const classLevels = classLevelsById(seed);
        const compiled = parser.parse(field.visibleWhen.expression);
        return Boolean(compiled.evaluate({
            seed,
            row,
            ...seed,
            selectedClassIds,
            classLevels,
            size: (value: unknown) => {
                if (Array.isArray(value) || typeof value === "string") return value.length;
                if (value && typeof value === "object") return Object.keys(value).length;
                return 0;
            },
            includes: (value: unknown, candidate: unknown) => {
                if (Array.isArray(value)) return value.map(item => String(item)).includes(String(candidate));
                if (typeof value === "string") return value.includes(String(candidate));
                return false;
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
    const raw = getAtPath(scope, key);
    const value = raw === undefined ? field.default : raw;

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
        if (!evaluateVisible(field, seed)) continue;
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

function isCustomizableField(field: CreatorFieldV3): boolean {
    if (!field.options?.contentType) return false;
    if (field.options.kind !== "content") return false;
    return field.type === "select" || field.type === "multiSelect" || field.type === "tablePick";
}

export function CharacterCreator(props: Props) {
    const { preset } = props;
    const initialIndex = React.useMemo(() => {
        if (!props.initialStepId) return 0;
        const idx = preset.steps.findIndex(step => step.id === props.initialStepId);
        return idx >= 0 ? idx : 0;
    }, [preset.steps, props.initialStepId]);

    const [stepIndex, setStepIndex] = React.useState(initialIndex);
    const [seed, setSeed] = React.useState<Record<string, unknown>>(props.initialSeed || {});
    const [touchedByStep, setTouchedByStep] = React.useState<Record<string, Record<string, boolean>>>({});
    const [stepOptions, setStepOptions] = React.useState<StepOptions>({});
    const [stepIssues, setStepIssues] = React.useState<StepIssue[]>([]);
    const [warningModal, setWarningModal] = React.useState<WarningModalState>({
        open: false,
        warnings: [],
        action: "next"
    });
    const [loadingStep, setLoadingStep] = React.useState(false);
    const [localRefreshToken, setLocalRefreshToken] = React.useState(0);
    const [seedHydrateToken, setSeedHydrateToken] = React.useState(0);
    const [focusErrorKey, setFocusErrorKey] = React.useState("");

    const [customModal, setCustomModal] = React.useState<CustomModalState>({
        open: false,
        contentType: "",
        label: "",
        applyValue: () => {}
    });
    const [customName, setCustomName] = React.useState("");
    const [customSlug, setCustomSlug] = React.useState("");
    const [customDescription, setCustomDescription] = React.useState("");
    const [customJson, setCustomJson] = React.useState("{}");
    const [customError, setCustomError] = React.useState("");
    const [customBusy, setCustomBusy] = React.useState(false);

    const initializedSessionRef = React.useRef<string>("");
    React.useEffect(() => {
        if (initializedSessionRef.current === props.sessionId) return;
        initializedSessionRef.current = props.sessionId;
        setSeed(props.initialSeed || {});
    }, [props.initialSeed, props.sessionId]);

    React.useEffect(() => {
        setStepIndex(initialIndex);
    }, [initialIndex]);

    React.useEffect(() => {
        props.onSeedChange?.(seed);
    }, [props.onSeedChange, seed]);

    const classSyncState = React.useMemo(() => classSyncToken(seed), [seed]);
    React.useEffect(() => {
        setSeed(prev => {
            const synced = synchronizeClassSelections(prev);
            return classSyncToken(prev) === classSyncToken(synced) ? prev : synced;
        });
    }, [classSyncState]);

    const activeStepId = React.useMemo(() => {
        const total = preset.steps.length;
        const current = preset.steps[Math.min(stepIndex, Math.max(0, total - 1))];
        return current?.id || "";
    }, [preset.steps, stepIndex]);
    const hydrateDependency = React.useMemo(
        () => hydrationDependencyValue(activeStepId, seed),
        [activeStepId, seed]
    );
    React.useEffect(() => {
        if (!activeStepId) return;
        const timeout = window.setTimeout(() => {
            setSeedHydrateToken(value => value + 1);
        }, 160);
        return () => window.clearTimeout(timeout);
    }, [activeStepId, hydrateDependency]);

    const totalSteps = preset.steps.length;
    const step = preset.steps[Math.min(stepIndex, Math.max(0, totalSteps - 1))];
    const stepId = step?.id || "";

    const errors = React.useMemo(
        () => (step ? validateCreatorStepV3(step, seed) : {}),
        [seed, step]
    );

    const touched = touchedByStep[stepId] || {};

    React.useEffect(() => {
        if (!step) return;
        let cancelled = false;
        const run = async () => {
            try {
                setLoadingStep(true);
                const hydrated = await hydrateCreatorStep(props.sessionId, step.id, { limit: 300, offset: 0 });
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
    }, [localRefreshToken, props.refreshToken, props.sessionId, seedHydrateToken, step]);

    React.useEffect(() => {
        if (!step) return;
        void upsertCreatorSessionUiState(props.sessionId, {
            currentStepId: step.id,
            currentStepIndex: stepIndex
        }).catch(() => {
            // Persist failures should not block creator flow.
        });
    }, [props.sessionId, step, stepIndex]);

    React.useEffect(() => {
        if (!focusErrorKey) return;
        const el = document.querySelector<HTMLElement>(`[data-error-key="${focusErrorKey}"]`);
        if (el) {
            el.scrollIntoView({ block: "center", behavior: "smooth" });
            const input = el.querySelector<HTMLElement>("input, select, textarea, button");
            input?.focus();
        }
    }, [focusErrorKey]);

    const setField = (field: CreatorFieldV3, value: unknown) => {
        const key = field.bindTo || field.id;
        setSeed(prev => setAtPath(prev, key, value));
        setTouchedByStep(prev => ({
            ...prev,
            [stepId]: {
                ...(prev[stepId] || {}),
                [key]: true
            }
        }));
    };

    const markStepTouched = () => {
        if (!step) return;
        const nextStepTouched = { ...(touchedByStep[stepId] || {}) };
        for (const field of step.fields || []) {
            const key = field.bindTo || field.id;
            nextStepTouched[key] = true;
        }
        setTouchedByStep(prev => ({ ...prev, [stepId]: nextStepTouched }));
    };

    const validateBeforeAdvance = async (action: "next" | "create"): Promise<boolean> => {
        if (!step) return true;
        await updateCreatorSessionSelection(props.sessionId, seed);
        const result = await validateCreatorSession(props.sessionId, step.id);
        if (result.errors.length) {
            setStepIssues(result.errors.map(error => ({ id: error.id, severity: "error", message: error.message })));
            setFocusErrorKey(result.errors[0]?.id || "");
            return false;
        }
        if (result.warnings.length) {
            setWarningModal({ open: true, warnings: result.warnings, action });
            return false;
        }
        return true;
    };

    const openCustomModal = (field: CreatorFieldV3, applyValue: (id: string) => void) => {
        const contentType = field.options?.contentType || "";
        if (!contentType) return;
        setCustomName("");
        setCustomSlug("");
        setCustomDescription("");
        setCustomJson("{}");
        setCustomError("");
        setCustomModal({
            open: true,
            contentType,
            label: field.label,
            applyValue
        });
    };

    const saveCustomOption = async () => {
        if (!customModal.open) return;
        const name = customName.trim();
        if (!name) {
            setCustomError("Name is required.");
            return;
        }

        let data: Record<string, unknown> = {};
        try {
            const parsed = JSON.parse(customJson || "{}");
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                data = parsed as Record<string, unknown>;
            } else {
                setCustomError("Advanced JSON must be an object.");
                return;
            }
        } catch {
            setCustomError("Advanced JSON is invalid.");
            return;
        }

        try {
            setCustomBusy(true);
            setCustomError("");
            const created = await upsertCreatorCustomOption(props.sessionId, {
                contentType: customModal.contentType,
                name,
                slug: customSlug,
                description: customDescription,
                data
            });
            customModal.applyValue(created.id);
            setCustomModal(prev => ({ ...prev, open: false }));
            setLocalRefreshToken(value => value + 1);
        } catch (error) {
            setCustomError(error instanceof Error ? error.message : String(error));
        } finally {
            setCustomBusy(false);
        }
    };

    const renderPrimitiveField = (
        field: CreatorFieldV3,
        value: unknown,
        onChange: (next: unknown) => void,
        optionKey: string,
        currentSeed: Record<string, unknown>,
        error?: string,
        customApply?: (id: string) => void,
        optionsOverride?: Array<{ value: string; label: string; meta?: Record<string, unknown> }>
    ) => {
        const options = optionsOverride || stepOptions[optionKey] || [];
        const showCustom = isCustomizableField(field) && customApply;

        if (field.type === "toggle") {
            return (
                <label key={field.id} className="creator-field toggle" data-error-key={optionKey}>
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
                <label key={field.id} className="creator-field" data-error-key={optionKey}>
                    <span>{field.label}</span>
                    <select value={String(value ?? "")} onChange={e => onChange(e.target.value)}>
                        <option value="">Select...</option>
                        {options.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                    {showCustom ? (
                        <button
                            type="button"
                            className="glass-btn secondary creator-inline-custom"
                            onClick={() => openCustomModal(field, customApply)}
                        >
                            Add Custom
                        </button>
                    ) : null}
                    {error ? <small className="creator-error">{error}</small> : null}
                </label>
            );
        }

        if (field.type === "multiSelect") {
            const selected = Array.isArray(value) ? value.map(String) : [];
            return (
                <label key={field.id} className="creator-field" data-error-key={optionKey}>
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
                    {showCustom ? (
                        <button
                            type="button"
                            className="glass-btn secondary creator-inline-custom"
                            onClick={() => openCustomModal(field, customApply)}
                        >
                            Add Custom
                        </button>
                    ) : null}
                    {error ? <small className="creator-error">{error}</small> : null}
                </label>
            );
        }

        if (field.type === "roller") {
            const rolls = Array.isArray(value) ? value as unknown[] : [];
            return (
                <div key={field.id} className="creator-field" data-error-key={optionKey}>
                    <span>{field.label}</span>
                    <div className="home-actions">
                        <button className="glass-btn secondary" type="button" onClick={() => onChange(rollValues(field))}>
                            Roll
                        </button>
                    </div>
                    <small className="home-muted">{rolls.length ? `Rolls: ${rolls.join(", ")}` : "No rolls yet."}</small>
                    {error ? <small className="creator-error">{error}</small> : null}
                </div>
            );
        }

        return (
            <label key={field.id} className="creator-field" data-error-key={optionKey}>
                <span>{field.label}</span>
                <input
                    type={field.type === "number" ? "number" : "text"}
                    value={value === undefined ? "" : String(value)}
                    {...numericFieldBounds(field, optionKey, currentSeed)}
                    onChange={e => onChange(parseFieldValue(field, e.target.value, e.target.checked))}
                />
                {field.helpText ? <small className="home-muted">{field.helpText}</small> : null}
                {error ? <small className="creator-error">{error}</small> : null}
            </label>
        );
    };

    const pointBuyInfo = React.useMemo(() => {
        if (!step || step.id !== "ability_scores") return "";
        const method = String(getAtPath(seed, "ability_method") || "");
        if (method !== "point_buy") return "";
        const spent = pointBuySpent(seed);
        const remaining = 27 - spent;
        return `${spent}/27 points spent${remaining >= 0 ? ` (${remaining} remaining)` : " (over budget)"}`;
    }, [seed, step]);
    const classLevels = React.useMemo(() => classLevelsById(seed), [seed]);
    const classLevelTotal = React.useMemo(
        () => Object.values(classLevels).reduce((sum, value) => sum + Number(value || 0), 0),
        [classLevels]
    );
    const requiredSubclassIds = React.useMemo(() => requiredSubclassClassIds(seed), [seed]);

    return (
        <div className="creator-shell">
            <header className="creator-header">
                <h2>{preset.title || "Character Creator"}</h2>
                {preset.description ? <p>{preset.description}</p> : null}
                <p>Step {stepIndex + 1} / {totalSteps}</p>
            </header>

            <nav className="creator-stepper" aria-label="Creator Steps">
                {preset.steps.map((item, index) => (
                    <button
                        type="button"
                        key={item.id}
                        className={`creator-step-pill ${index === stepIndex ? "is-active" : ""}`}
                        onClick={() => setStepIndex(index)}
                    >
                        <span>{index + 1}</span>
                        <strong>{item.title}</strong>
                    </button>
                ))}
            </nav>

            {step ? (
                <section className="creator-step">
                    <h3>{step.title}</h3>
                    {step.description ? <p>{step.description}</p> : null}
                    {pointBuyInfo ? <p className="creator-point-buy">{pointBuyInfo}</p> : null}
                    {step.id === "class_plan" ? (
                        <div className="creator-class-summary">
                            <p>
                                Starting Level (derived from class distribution): <strong>{classLevelTotal}</strong>
                            </p>
                            {requiredSubclassIds.length ? (
                                <p>
                                    Subclass required for:{" "}
                                    <strong>{requiredSubclassIds.map(id => prettyId(id)).join(", ")}</strong>
                                </p>
                            ) : (
                                <p>Subclass fields unlock automatically when class levels reach their subclass thresholds.</p>
                            )}
                        </div>
                    ) : null}
                    {loadingStep ? <p className="home-muted">Loading step options...</p> : null}

                    {stepIssues.length ? (
                        <div className="creator-issues">
                            {stepIssues.map(issue => (
                                <p key={issue.id} className={issue.severity === "error" ? "creator-error" : "creator-warning"}>
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
                            const showErrors = Boolean(touched[key]);
                            const error = showErrors ? errors[key] : "";
                            const topLevelOptionsOverride = (() => {
                                if (step.id !== "ancestry" || field.id !== "subrace_id") return undefined;
                                const selectedRaceId = String(getAtPath(seed, "race_id") || "");
                                if (!selectedRaceId) return [];
                                const raceOptions = stepOptions.race_id || [];
                                const race = raceOptions.find(option => option.value === selectedRaceId);
                                const raceMeta = (race?.meta && typeof race.meta === "object")
                                    ? race.meta as Record<string, unknown>
                                    : {};
                                const raceData = (raceMeta.data && typeof raceMeta.data === "object")
                                    ? raceMeta.data as Record<string, unknown>
                                    : {};
                                const subraces = Array.isArray(raceData.subraces) ? raceData.subraces : [];
                                const rows: Array<{ value: string; label: string; meta?: Record<string, unknown> }> = [];
                                for (let index = 0; index < subraces.length; index += 1) {
                                    const raw = subraces[index];
                                    const row = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
                                    const valueId = String(row.slug || row.name || `subrace_${index + 1}`).trim();
                                    const label = String(row.name || valueId || `Subrace ${index + 1}`).trim();
                                    if (!valueId) continue;
                                    rows.push({ value: valueId, label, meta: { data: row } });
                                }
                                return rows;
                            })();

                            if (field.type !== "repeatGroup") {
                                return renderPrimitiveField(
                                    field,
                                    value,
                                    next => setField(field, next),
                                    field.id,
                                    seed,
                                    error,
                                    id => {
                                        if (field.type === "multiSelect") {
                                            const next = Array.isArray(value) ? [...value.map(String), id] : [id];
                                            setField(field, [...new Set(next)]);
                                        } else {
                                            setField(field, id);
                                        }
                                    },
                                    topLevelOptionsOverride
                                );
                            }

                            const rows = Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
                            const nestedFields = Array.isArray(field.fields) ? field.fields : [];
                            const isManagedSubclassPlan = step.id === "class_plan" && key === "subclass_plan";

                            return (
                                <div key={field.id} className="creator-repeat-group" data-error-key={key}>
                                    <div className="creator-repeat-head">
                                        <strong>{field.label}</strong>
                                        {!isManagedSubclassPlan ? (
                                            <button
                                                type="button"
                                                className="glass-btn secondary"
                                                onClick={() => {
                                                    const nextRows = [...rows, buildDefaultRepeatRow(nestedFields)];
                                                    setField(field, nextRows);
                                                }}
                                            >
                                                Add
                                            </button>
                                        ) : null}
                                    </div>
                                    {error ? <small className="creator-error">{error}</small> : null}
                                    {isManagedSubclassPlan && rows.length === 0 ? (
                                        <small className="home-muted">
                                            Subclass selections will appear once a class reaches its subclass unlock level.
                                        </small>
                                    ) : null}
                                    <div className="creator-repeat-rows">
                                        {rows.map((row, rowIndex) => (
                                            <div key={`${field.id}-${rowIndex}`} className="creator-repeat-row">
                                                <div className="creator-repeat-row-header">
                                                    <strong>
                                                        {isManagedSubclassPlan
                                                            ? prettyId((row as Record<string, unknown>).class_id || `Entry ${rowIndex + 1}`)
                                                            : `Entry ${rowIndex + 1}`}
                                                    </strong>
                                                    {!isManagedSubclassPlan ? (
                                                        <button
                                                            type="button"
                                                            className="glass-btn secondary"
                                                            onClick={() => {
                                                                const nextRows = rows.filter((_, i) => i !== rowIndex);
                                                                setField(field, nextRows);
                                                            }}
                                                        >
                                                            Remove
                                                        </button>
                                                    ) : null}
                                                </div>
                                                <div className="creator-fields">
                                                    {nestedFields.map(nested => {
                                                        if (!evaluateVisible(nested, seed, row)) return null;
                                                        const nestedKey = nested.bindTo || nested.id;
                                                        const nestedValue = row[nestedKey] ?? nested.default;
                                                        const nestedErrorKey = `${key}[${rowIndex}].${nestedKey}`;
                                                        const nestedError = showErrors ? errors[nestedErrorKey] : "";
                                                        const optionKey = `${field.id}.${nested.id}`;
                                                        const rowClassId = String((row as Record<string, unknown>).class_id || "");
                                                        const subclassOptions = isManagedSubclassPlan && nested.id === "subclass_id"
                                                            ? (stepOptions[optionKey] || []).filter(option => {
                                                                const owner = String(
                                                                    ((option.meta as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined)?.subclass_of
                                                                        ? (((option.meta as Record<string, unknown>).data as Record<string, unknown>).subclass_of as Record<string, unknown>).key
                                                                        : ""
                                                                );
                                                                return owner === rowClassId;
                                                            })
                                                            : undefined;

                                                        if (isManagedSubclassPlan && nested.id === "class_id") {
                                                            return (
                                                                <label
                                                                    key={`${field.id}-${rowIndex}-${nested.id}`}
                                                                    className="creator-field"
                                                                    data-error-key={nestedErrorKey}
                                                                >
                                                                    <span>{nested.label}</span>
                                                                    <input readOnly value={prettyId(rowClassId)} />
                                                                    {nestedError ? <small className="creator-error">{nestedError}</small> : null}
                                                                </label>
                                                            );
                                                        }

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
                                                                    seed,
                                                                    nestedError,
                                                                    id => {
                                                                        const nextRows = [...rows];
                                                                        const nextRow = { ...(nextRows[rowIndex] || {}) };
                                                                        if (nested.type === "multiSelect") {
                                                                            const current = Array.isArray(nextRow[nestedKey]) ? nextRow[nestedKey] as unknown[] : [];
                                                                            nextRow[nestedKey] = [...new Set([...current.map(String), id])];
                                                                        } else {
                                                                            nextRow[nestedKey] = id;
                                                                        }
                                                                        nextRows[rowIndex] = nextRow;
                                                                        setField(field, nextRows);
                                                                    },
                                                                    subclassOptions
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

                    {step.id === "review" ? (
                        <div className="creator-review">
                            {Object.entries(seed).map(([key, value]) => (
                                <div key={key} className="creator-review-row">
                                    <span>{key}</span>
                                    <strong>{displayValue(value)}</strong>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </section>
            ) : null}

            <footer className="creator-actions creator-actions-sticky">
                {stepIndex > 0 ? (
                    <button className="glass-btn secondary" type="button" onClick={() => setStepIndex(index => index - 1)}>
                        Back
                    </button>
                ) : null}

                {stepIndex < totalSteps - 1 ? (
                    <button
                        className="glass-btn"
                        type="button"
                        onClick={async () => {
                            const localErrorKeys = Object.keys(errors);
                            if (localErrorKeys.length > 0) {
                                markStepTouched();
                                setFocusErrorKey(localErrorKeys[0]);
                                return;
                            }
                            const ok = await validateBeforeAdvance("next");
                            if (!ok) return;
                            setStepIndex(index => Math.min(totalSteps - 1, index + 1));
                        }}
                    >
                        Next
                    </button>
                ) : (
                    <button
                        className="glass-btn"
                        type="button"
                        onClick={async () => {
                            const localErrorKeys = Object.keys(errors);
                            if (localErrorKeys.length > 0) {
                                markStepTouched();
                                setFocusErrorKey(localErrorKeys[0]);
                                return;
                            }
                            const ok = await validateBeforeAdvance("create");
                            if (!ok) return;
                            await updateCreatorSessionSelection(props.sessionId, seed);
                            props.onComplete(seed);
                        }}
                    >
                        Create Character
                    </button>
                )}

                {props.onCancel ? (
                    <button className="glass-btn secondary" type="button" onClick={props.onCancel}>
                        Cancel
                    </button>
                ) : null}
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
                            <button
                                className="glass-btn secondary"
                                type="button"
                                onClick={() => setWarningModal({ open: false, warnings: [], action: "next" })}
                            >
                                Cancel
                            </button>
                            <button
                                className="glass-btn"
                                type="button"
                                onClick={async () => {
                                    await confirmCreatorWarnings(props.sessionId, warningModal.warnings.map(warning => warning.id));
                                    const action = warningModal.action;
                                    setWarningModal({ open: false, warnings: [], action: "next" });
                                    if (action === "next") {
                                        setStepIndex(index => Math.min(totalSteps - 1, index + 1));
                                        return;
                                    }
                                    await updateCreatorSessionSelection(props.sessionId, seed);
                                    props.onComplete(seed);
                                }}
                            >
                                Proceed anyway
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {customModal.open ? (
                <div className="creator-warning-modal">
                    <div className="creator-warning-dialog glass-surface creator-custom-dialog">
                        <h3>Add Custom {customModal.label}</h3>
                        <label className="creator-field">
                            <span>Name</span>
                            <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Custom option name" />
                        </label>
                        <label className="creator-field">
                            <span>Slug (optional)</span>
                            <input value={customSlug} onChange={e => setCustomSlug(e.target.value)} placeholder="custom_option_slug" />
                        </label>
                        <label className="creator-field">
                            <span>Description (optional)</span>
                            <input value={customDescription} onChange={e => setCustomDescription(e.target.value)} placeholder="Short description" />
                        </label>
                        <label className="creator-field">
                            <span>Advanced JSON (optional)</span>
                            <textarea value={customJson} onChange={e => setCustomJson(e.target.value)} rows={8} spellCheck={false} />
                        </label>
                        {customError ? <p className="creator-error">{customError}</p> : null}
                        <div className="creator-actions">
                            <button
                                type="button"
                                className="glass-btn secondary"
                                onClick={() => setCustomModal(prev => ({ ...prev, open: false }))}
                            >
                                Cancel
                            </button>
                            <button type="button" className="glass-btn" disabled={customBusy} onClick={() => void saveCustomOption()}>
                                {customBusy ? "Saving..." : "Save Custom"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
