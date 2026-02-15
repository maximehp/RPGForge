import { Parser } from "expr-eval";
import type { CharacterDocumentV2 } from "../../engine/v2/types";

const parser = new Parser();
const INTERP = /\{\{\s*([^}]+)\s*\}\}/g;
const FULL_INTERP = /^\{\{\s*([^}]+)\s*\}\}$/;

export type EvalScope = {
    meta: CharacterDocumentV2["meta"];
    level: number;
    xp: number;
    stats: Record<string, number>;
    resources: Record<string, { current: number; max: number }>;
    derived: Record<string, number>;
    flags: Record<string, boolean>;
    collections: Record<string, unknown[]>;
    notes: string;
    item?: Record<string, unknown>;
    index?: number;
    min: typeof Math.min;
    max: typeof Math.max;
    floor: typeof Math.floor;
    ceil: typeof Math.ceil;
    round: typeof Math.round;
    abs: typeof Math.abs;
};

export function makeScope(doc: CharacterDocumentV2, extra?: Record<string, unknown>): EvalScope {
    const stats = Object.keys(doc.components.effectiveStats || {}).length
        ? doc.components.effectiveStats
        : doc.components.stats;
    const resources = Object.keys(doc.components.effectiveResources || {}).length
        ? doc.components.effectiveResources
        : doc.components.resources;

    return {
        meta: doc.meta,
        level: doc.core.level,
        xp: doc.core.xp,
        stats,
        resources,
        derived: doc.derived,
        flags: doc.stateFlags,
        collections: doc.collections,
        notes: doc.core.notes,
        min: Math.min,
        max: Math.max,
        floor: Math.floor,
        ceil: Math.ceil,
        round: Math.round,
        abs: Math.abs,
        ...(extra || {})
    };
}

function evalRaw(expr: string, scope: EvalScope): unknown {
    const source = expr.trim();
    if (!source) return "";

    if (/^[a-zA-Z_][\w.]*$/.test(source)) {
        return resolvePath(scope, source);
    }

    try {
        const compiled = parser.parse(source);
        return compiled.evaluate(scope as any);
    } catch {
        return "";
    }
}

export function interpolate(input: string | undefined, scope: EvalScope): string {
    if (!input) return "";
    return input.replace(INTERP, (_, inner) => {
        const out = evalRaw(String(inner), scope);
        return out == null ? "" : String(out);
    });
}

export function evaluateAny(input: string | undefined, scope: EvalScope): unknown {
    if (!input) return undefined;
    const m = input.match(FULL_INTERP);
    if (m) return evalRaw(m[1], scope);
    return evalRaw(input, scope);
}

export function evaluateNumber(input: string | undefined, scope: EvalScope): number {
    const out = evaluateAny(input, scope);
    const n = Number(out);
    return Number.isFinite(n) ? n : 0;
}

export function evaluateBool(input: string | undefined, scope: EvalScope): boolean {
    const out = evaluateAny(input, scope);
    return Boolean(out);
}

export function resolvePath(root: unknown, path: string): unknown {
    const parts = path.split(".").filter(Boolean);
    let cur: unknown = root;
    for (const part of parts) {
        if (!cur || typeof cur !== "object") return undefined;
        cur = (cur as Record<string, unknown>)[part];
    }
    return cur;
}
