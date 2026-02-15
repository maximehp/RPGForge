import { Parser } from "expr-eval";
import { DiceRoller } from "@dice-roller/rpg-dice-roller";
import { nanoid } from "nanoid";
import type {
    ActionEnvelopeV2,
    CharacterDocumentV2,
    EffectSpecV2,
    ModifierSpecV2,
    ResolvedRuleset
} from "../../engine/v2/types";

const parser = new Parser();
const dice = new DiceRoller();

type HookFn = (...args: number[]) => number;

type EffectContext = {
    effect: EffectSpecV2;
    modifier: ModifierSpecV2;
    source: "ruleset" | "collection";
};

const BUILTIN_HOOKS: Record<string, HookFn> = {
    "builtin:clamp": (x, lo, hi) => Math.max(lo, Math.min(hi, x)),
    "builtin:min": (...xs) => Math.min(...xs),
    "builtin:max": (...xs) => Math.max(...xs),
    "builtin:sum": (...xs) => xs.reduce((acc, n) => acc + n, 0),
    "builtin:count": (...xs) => xs.length
};

function toEffectiveStats(doc: CharacterDocumentV2): Record<string, number> {
    if (doc.components.effectiveStats && Object.keys(doc.components.effectiveStats).length) {
        return doc.components.effectiveStats;
    }
    return doc.components.stats;
}

function toEffectiveResources(doc: CharacterDocumentV2): Record<string, { current: number; max: number }> {
    if (doc.components.effectiveResources && Object.keys(doc.components.effectiveResources).length) {
        return doc.components.effectiveResources;
    }
    return doc.components.resources;
}

function makeScope(doc: CharacterDocumentV2, ruleset: ResolvedRuleset) {
    const hook = (name: string, ...args: number[]) => {
        const mapped = ruleset.rules.hooks[name];
        const fn = mapped ? BUILTIN_HOOKS[mapped] : undefined;
        if (!fn) return 0;
        return Number(fn(...args.map(n => Number(n) || 0))) || 0;
    };

    return {
        level: doc.core.level,
        xp: doc.core.xp,
        stats: toEffectiveStats(doc),
        resources: toEffectiveResources(doc),
        derived: doc.derived,
        flags: doc.stateFlags,
        collections: doc.collections,
        notes: doc.core.notes,
        min: Math.min,
        max: Math.max,
        ceil: Math.ceil,
        floor: Math.floor,
        round: Math.round,
        clamp: (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x)),
        lookup: (table: string, key: number | string) => {
            const t = ruleset.rules.lookups[table];
            if (!t) return 0;
            const k = String(key);
            if (k in t) return Number(t[k]) || 0;
            const n = Number(k);
            if (!Number.isFinite(n)) return 0;
            let best = -Infinity;
            let value = 0;
            for (const [rk, rv] of Object.entries(t)) {
                const rn = Number(rk);
                if (Number.isFinite(rn) && rn <= n && rn > best) {
                    best = rn;
                    value = Number(rv) || 0;
                }
            }
            return value;
        },
        roll: (notation: string) => {
            try {
                const r: any = dice.roll(notation);
                const total = Number(r?.total ?? r?.value ?? 0);
                return Number.isFinite(total) ? total : 0;
            } catch {
                return 0;
            }
        },
        hook
    };
}

function evalNumber(expr: string | undefined, doc: CharacterDocumentV2, ruleset: ResolvedRuleset): number {
    if (!expr) return 0;
    try {
        const compiled = parser.parse(expr);
        const out = compiled.evaluate(makeScope(doc, ruleset) as any);
        const n = Number(out);
        return Number.isFinite(n) ? n : 0;
    } catch {
        return 0;
    }
}

function initializeComponents(ruleset: ResolvedRuleset, seed?: unknown): CharacterDocumentV2["components"] {
    const seedObj = (seed || {}) as Record<string, unknown>;
    const seedStats = (seedObj.stats || {}) as Record<string, number>;
    const seedRes = (seedObj.resources || {}) as Record<string, { current?: number; max?: number }>;

    const stats: Record<string, number> = {};
    for (const s of ruleset.model.core.stats || []) {
        stats[s.id] = Number(seedStats[s.id] ?? s.default ?? 0);
    }

    const resources: Record<string, { current: number; max: number }> = {};
    for (const r of ruleset.model.core.resources || []) {
        const maxSeed = seedRes[r.id]?.max;
        const currentSeed = seedRes[r.id]?.current;
        const max = Number(maxSeed ?? r.default ?? 0);
        const current = Number(currentSeed ?? max);
        resources[r.id] = { current: Math.max(0, current), max: Math.max(0, max) };
    }

    return {
        stats,
        resources,
        effectiveStats: { ...stats },
        effectiveResources: Object.fromEntries(
            Object.entries(resources).map(([k, v]) => [k, { current: v.current, max: v.max }])
        )
    };
}

function initializeCollections(ruleset: ResolvedRuleset, seed?: unknown): Record<string, unknown[]> {
    const seedObj = (seed || {}) as Record<string, unknown>;
    const seedCollections = (seedObj.collections || {}) as Record<string, unknown[]>;

    const out: Record<string, unknown[]> = {};
    for (const c of ruleset.model.core.collections || []) {
        const values = seedCollections[c.id];
        out[c.id] = Array.isArray(values) ? [...values] : [];
    }
    return out;
}

function initializeFlags(ruleset: ResolvedRuleset, seed?: unknown): Record<string, boolean> {
    const seedObj = (seed || {}) as Record<string, unknown>;
    const seedFlags = (seedObj.flags || {}) as Record<string, boolean>;

    const out: Record<string, boolean> = {};
    for (const f of ruleset.model.core.flags || []) {
        out[f.id] = Boolean(seedFlags[f.id] ?? f.default ?? false);
    }
    return out;
}

function ensureNumber(value: unknown, fallback = 0): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function ensureStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map(v => String(v)).filter(Boolean);
}

function getSeedStat(seed: Record<string, unknown>, key: string): number | undefined {
    const stats = (seed.stats as Record<string, unknown>) || {};
    const nested = Number(stats[key]);
    if (Number.isFinite(nested)) return nested;
    const direct = Number(seed[key]);
    if (Number.isFinite(direct)) return direct;
    return undefined;
}

function triggerMatches(effect: EffectSpecV2, doc: CharacterDocumentV2, lastActionId?: string): boolean {
    const triggers = effect.triggers || [];
    if (!triggers.length) return true;

    for (const trigger of triggers) {
        if (trigger.kind === "always") return true;
        if (trigger.kind === "equipped") return true;
        if (trigger.kind === "manual") continue;
        if (trigger.kind === "flag") {
            const key = trigger.key || "";
            if (!key) continue;
            const expected = trigger.equals;
            if (expected === undefined) {
                if (doc.stateFlags[key]) return true;
            } else if ((doc.stateFlags as Record<string, unknown>)[key] === expected) {
                return true;
            }
            continue;
        }
        if (trigger.kind === "on_rest" && (lastActionId === "shortRest" || lastActionId === "longRest")) {
            return true;
        }
        if (trigger.kind === "on_level_change" && lastActionId === "setLevel") {
            return true;
        }
        if (trigger.kind === "on_action" && trigger.actionId && lastActionId === trigger.actionId) {
            return true;
        }
    }

    return false;
}

function collectActiveEffectContexts(doc: CharacterDocumentV2, ruleset: ResolvedRuleset, lastActionId?: string): EffectContext[] {
    const active: EffectContext[] = [];

    for (const effect of ruleset.effects || []) {
        if (!triggerMatches(effect, doc, lastActionId)) continue;
        for (const modifier of effect.modifiers) {
            active.push({ effect, modifier, source: "ruleset" });
        }
    }

    for (const values of Object.values(doc.collections)) {
        if (!Array.isArray(values)) continue;
        for (const raw of values) {
            const item = (raw || {}) as Record<string, unknown>;
            const equipped = Boolean(item.equipped);
            if (!equipped) continue;

            const direct = Array.isArray(item.effects) ? item.effects : [];
            const nested = Array.isArray((item.data as any)?.effects) ? (item.data as any).effects : [];
            const all = [...direct, ...nested].filter(Boolean) as EffectSpecV2[];
            for (const effect of all) {
                if (!triggerMatches(effect, doc, lastActionId)) continue;
                for (const modifier of effect.modifiers || []) {
                    active.push({ effect, modifier, source: "collection" });
                }
            }
        }
    }

    return active;
}

function applyModifierValue(current: number, operation: string, value: number): number {
    switch (operation) {
        case "set":
            return value;
        case "max":
            return Math.max(current, value);
        case "min":
            return Math.min(current, value);
        case "multiply":
            return current * value;
        case "add":
        default:
            return current + value;
    }
}

function applyEffects(
    doc: CharacterDocumentV2,
    ruleset: ResolvedRuleset,
    effects: EffectContext[]
): CharacterDocumentV2 {
    const next = structuredClone(doc);
    next.components.effectiveStats = { ...next.components.stats };

    const seenExclusive = new Set<string>();
    const statModifiers = effects.filter(e => e.modifier.target === "stat");

    for (const ctx of statModifiers) {
        const m = ctx.modifier;
        const key = m.key;
        if (!key) continue;

        const stacking = m.stacking || ctx.effect.stacking || "sum";
        const slot = `stat:${key}`;
        if (stacking === "exclusive" && seenExclusive.has(slot)) continue;

        const current = ensureNumber(next.components.effectiveStats[key], 0);
        const value = m.formula ? evalNumber(m.formula, next, ruleset) : ensureNumber(m.value, 0);
        const op = m.operation || "add";
        next.components.effectiveStats[key] = applyModifierValue(current, op, value);

        if (stacking === "exclusive") seenExclusive.add(slot);
    }

    const effectiveResources: Record<string, { current: number; max: number }> = {};
    for (const [key, value] of Object.entries(next.components.resources)) {
        effectiveResources[key] = { current: ensureNumber(value.current, 0), max: ensureNumber(value.max, 0) };
    }
    next.components.effectiveResources = effectiveResources;

    for (const resourceDef of ruleset.model.core.resources || []) {
        if (!resourceDef.maxFormula) continue;
        const computedMax = Math.max(0, evalNumber(resourceDef.maxFormula, next, ruleset));
        const prevCurrent = ensureNumber(next.components.effectiveResources[resourceDef.id]?.current, computedMax);
        next.components.effectiveResources[resourceDef.id] = {
            current: Math.min(computedMax, Math.max(0, prevCurrent)),
            max: computedMax
        };
    }

    const resourceModifiers = effects.filter(e => e.modifier.target === "resource_max");
    for (const ctx of resourceModifiers) {
        const m = ctx.modifier;
        const key = m.key;
        const current = ensureNumber(next.components.effectiveResources[key]?.max, 0);
        const value = m.formula ? evalNumber(m.formula, next, ruleset) : ensureNumber(m.value, 0);
        const op = m.operation || "add";

        if (!next.components.effectiveResources[key]) {
            next.components.effectiveResources[key] = { current: 0, max: 0 };
        }
        next.components.effectiveResources[key].max = Math.max(0, applyModifierValue(current, op, value));
        next.components.effectiveResources[key].current = Math.min(
            next.components.effectiveResources[key].max,
            Math.max(0, ensureNumber(next.components.effectiveResources[key].current, 0))
        );
    }

    return next;
}

function applyDerivedModifiers(
    doc: CharacterDocumentV2,
    ruleset: ResolvedRuleset,
    effects: EffectContext[]
): CharacterDocumentV2 {
    const next = structuredClone(doc);
    for (const ctx of effects) {
        const m = ctx.modifier;
        if (m.target !== "derived") continue;
        const current = ensureNumber(next.derived[m.key], 0);
        const value = m.formula ? evalNumber(m.formula, next, ruleset) : ensureNumber(m.value, 0);
        const op = m.operation || "add";
        next.derived[m.key] = applyModifierValue(current, op, value);
    }
    return next;
}

export function recomputeDerived(doc: CharacterDocumentV2, ruleset: ResolvedRuleset, lastActionId?: string): CharacterDocumentV2 {
    let next = structuredClone(doc);
    const effects = collectActiveEffectContexts(next, ruleset, lastActionId);
    next = applyEffects(next, ruleset, effects);

    for (const [key, r] of Object.entries(next.components.effectiveResources)) {
        const baseCurrent = ensureNumber(next.components.resources[key]?.current, r.current);
        next.components.effectiveResources[key] = {
            max: Math.max(0, ensureNumber(r.max, 0)),
            current: Math.max(0, Math.min(Math.max(0, ensureNumber(r.max, 0)), baseCurrent))
        };
    }

    const derived: Record<string, number> = {};
    for (const [key, formula] of Object.entries(ruleset.rules.formulas)) {
        if (!key.startsWith("derived.")) continue;
        const id = key.slice("derived.".length);
        derived[id] = evalNumber(formula, { ...next, derived }, ruleset);
    }
    next.derived = derived;

    next = applyDerivedModifiers(next, ruleset, effects);

    next.meta.updatedAt = new Date().toISOString();
    return next;
}

export async function createCharacter(rulesetId: string, ruleset: ResolvedRuleset, seed?: unknown): Promise<CharacterDocumentV2> {
    const now = new Date().toISOString();
    const seedObj = (seed || {}) as Record<string, unknown>;
    const totalLevel = Math.max(1, Number(seedObj.level_total ?? seedObj.level ?? 1));

    const doc: CharacterDocumentV2 = {
        schemaVersion: "2.0.0",
        meta: {
            id: nanoid(),
            rulesetId,
            name: String(seedObj.name || "Adventurer"),
            createdAt: now,
            updatedAt: now
        },
        core: {
            level: totalLevel,
            xp: Math.max(0, Number(seedObj.xp || 0)),
            tags: Array.isArray(seedObj.tags) ? seedObj.tags.map(String) : [],
            notes: String(seedObj.notes || "")
        },
        components: initializeComponents(ruleset, seed),
        collections: initializeCollections(ruleset, seed),
        derived: {},
        stateFlags: initializeFlags(ruleset, seed),
        appliedPacks: [...ruleset.packOrder],
        overlayPackIds: []
    };

    for (const statKey of Object.keys(doc.components.stats)) {
        const picked = getSeedStat(seedObj, statKey);
        if (picked !== undefined) {
            doc.components.stats[statKey] = picked;
            doc.components.effectiveStats[statKey] = picked;
        }
    }

    const classes = Array.isArray(seedObj.class_plan) ? seedObj.class_plan : [];
    if (classes.length) {
        doc.collections.classes = classes.map((row, idx) => {
            const entry = (row || {}) as Record<string, unknown>;
            const classId = String(entry.class_id || entry.classId || `class_${idx + 1}`);
            return {
                id: classId,
                classId,
                levels: Math.max(1, Math.floor(ensureNumber(entry.levels, 1)))
            };
        });
    }

    const subclassPlan = Array.isArray(seedObj.subclass_plan) ? seedObj.subclass_plan : [];
    const chosenFeats = ensureStringArray(seedObj.selected_feats);
    const features: unknown[] = [...(doc.collections.features || [])];
    for (const featId of chosenFeats) {
        features.push({ id: featId, type: "feat", source: "creator" });
    }
    for (const row of subclassPlan) {
        const entry = (row || {}) as Record<string, unknown>;
        const classId = String(entry.class_id || "");
        const subclassName = String(entry.subclass_name || "");
        const atLevel = Math.max(1, Math.floor(ensureNumber(entry.at_level, 3)));
        if (classId || subclassName) {
            features.push({
                id: `${classId || "class"}:${subclassName || "subclass"}:${atLevel}`,
                type: "subclass",
                classId,
                subclass: subclassName,
                atLevel
            });
        }
    }
    if (features.length) {
        doc.collections.features = features;
    }

    const spellIds = [
        ...ensureStringArray(seedObj.cantrip_ids),
        ...ensureStringArray(seedObj.spell_ids),
        ...ensureStringArray(seedObj.spellbook_ids)
    ];
    if (spellIds.length) {
        const seen = new Set<string>();
        doc.collections.spells = spellIds
            .filter(id => {
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
            })
            .map(id => ({ id, source: "creator" }));
    }

    const startItems = ensureStringArray(seedObj.starting_items);
    if (startItems.length) {
        const existing = Array.isArray(doc.collections.inventory) ? doc.collections.inventory : [];
        doc.collections.inventory = [
            ...existing,
            ...startItems.map(id => ({ id, title: id, equipped: false, source: "creator" }))
        ];
    }

    const raceId = String(seedObj.race_id || "").trim();
    const backgroundId = String(seedObj.background_id || "").trim();
    if (raceId) doc.core.tags.push(`race:${raceId}`);
    if (backgroundId) doc.core.tags.push(`background:${backgroundId}`);
    if (seedObj.use_homebrew === true) doc.core.tags.push("creator:homebrew_enabled");

    doc.collections.activity_log = [
        ...(Array.isArray(doc.collections.activity_log) ? doc.collections.activity_log : []),
        {
            id: `creator_seed_${Date.now()}`,
            type: "creator_seed",
            seed: structuredClone(seedObj)
        }
    ];

    return recomputeDerived(doc, ruleset);
}

function updateCollectionEntity(
    collection: unknown[],
    id: string,
    updater: (prev: Record<string, unknown>) => Record<string, unknown>
): unknown[] {
    const out: unknown[] = [];
    let found = false;
    for (const raw of collection) {
        const item = (raw || {}) as Record<string, unknown>;
        if (String(item.id || "") === id) {
            out.push(updater(item));
            found = true;
        } else {
            out.push(item);
        }
    }
    return found ? out : collection;
}

function applyDomainAction(doc: CharacterDocumentV2, target: string, payload: Record<string, unknown> = {}): CharacterDocumentV2 {
    const next = structuredClone(doc);

    switch (target) {
        case "setLevel": {
            next.core.level = Math.max(1, Math.floor(ensureNumber(payload.value, next.core.level)));
            return next;
        }
        case "setStat": {
            const key = String(payload.key || "");
            if (key) next.components.stats[key] = ensureNumber(payload.value, next.components.stats[key] ?? 0);
            return next;
        }
        case "deltaStat": {
            const key = String(payload.key || "");
            if (key) {
                const prev = ensureNumber(next.components.stats[key], 0);
                next.components.stats[key] = prev + ensureNumber(payload.value, 0);
            }
            return next;
        }
        case "setResourceCurrent": {
            const key = String(payload.key || "");
            const r = next.components.resources[key];
            if (r) {
                r.current = Math.max(0, Math.min(r.max, ensureNumber(payload.value, r.current)));
            }
            return next;
        }
        case "longRest": {
            for (const key of Object.keys(next.components.resources)) {
                next.components.resources[key].current = next.components.resources[key].max;
            }
            return next;
        }
        case "shortRest": {
            return next;
        }
        case "recompute": {
            return next;
        }
        case "toggleFlag": {
            const key = String(payload.key || "");
            if (key) next.stateFlags[key] = !next.stateFlags[key];
            return next;
        }
        case "appendCollection": {
            const key = String(payload.key || "");
            if (!key) return next;
            if (!Array.isArray(next.collections[key])) next.collections[key] = [];
            next.collections[key].push(payload.item ?? null);
            return next;
        }
        case "createEntity": {
            const collection = String(payload.collection || payload.key || "inventory");
            const entity = ((payload.entity as Record<string, unknown>) || {}) as Record<string, unknown>;
            const id = String(entity.id || payload.id || nanoid());
            const withId = { ...entity, id };
            if (!Array.isArray(next.collections[collection])) next.collections[collection] = [];
            next.collections[collection].push(withId);
            return next;
        }
        case "updateEntity": {
            const collection = String(payload.collection || payload.key || "inventory");
            const id = String(payload.id || "");
            const patch = ((payload.patch as Record<string, unknown>) || {}) as Record<string, unknown>;
            const values = next.collections[collection];
            if (!id || !Array.isArray(values)) return next;
            next.collections[collection] = updateCollectionEntity(values, id, prev => ({ ...prev, ...patch }));
            return next;
        }
        case "deleteEntity": {
            const collection = String(payload.collection || payload.key || "inventory");
            const id = String(payload.id || "");
            const values = next.collections[collection];
            if (!id || !Array.isArray(values)) return next;
            next.collections[collection] = values.filter(v => String((v as any)?.id || "") !== id);
            return next;
        }
        case "equipEntity": {
            const collection = String(payload.collection || payload.key || "inventory");
            const id = String(payload.id || "");
            const slot = payload.slot ? String(payload.slot) : undefined;
            const values = next.collections[collection];
            if (!id || !Array.isArray(values)) return next;
            next.collections[collection] = updateCollectionEntity(values, id, prev => ({ ...prev, equipped: true, slot }));
            return next;
        }
        case "unequipEntity": {
            const collection = String(payload.collection || payload.key || "inventory");
            const id = String(payload.id || "");
            const values = next.collections[collection];
            if (!id || !Array.isArray(values)) return next;
            next.collections[collection] = updateCollectionEntity(values, id, prev => ({ ...prev, equipped: false }));
            return next;
        }
        case "applyTemplate": {
            const collection = String(payload.collection || "inventory");
            const template = ((payload.template as Record<string, unknown>) || {}) as Record<string, unknown>;
            if (!Array.isArray(next.collections[collection])) next.collections[collection] = [];
            next.collections[collection].push({ ...template, id: String(template.id || nanoid()) });
            return next;
        }
        default:
            return next;
    }
}

export async function dispatchAction(
    characterId: string,
    ruleset: ResolvedRuleset,
    current: CharacterDocumentV2,
    action: ActionEnvelopeV2
): Promise<CharacterDocumentV2> {
    if (current.meta.id !== characterId) {
        throw new Error(`Character mismatch: expected ${current.meta.id}, got ${characterId}`);
    }

    const spec = ruleset.actions[action.id];
    if (!spec) {
        throw new Error(`Unknown action: ${action.id}`);
    }

    let next = structuredClone(current);

    if (spec.kind === "domain") {
        next = applyDomainAction(next, spec.target, action.payload);
    } else if (spec.kind === "toggle") {
        next.stateFlags[spec.target] = !next.stateFlags[spec.target];
    } else if (spec.kind === "script") {
        void evalNumber(spec.target, next, ruleset);
    } else if (spec.kind === "roll") {
        const value = evalNumber(spec.target, next, ruleset);
        next.collections.activity_log = [...(next.collections.activity_log || []), { type: "roll", value, at: new Date().toISOString() }];
    }

    return recomputeDerived(next, ruleset, action.id);
}
