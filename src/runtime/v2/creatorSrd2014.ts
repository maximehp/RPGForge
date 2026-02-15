import type {
    ContentEntryV2,
    CreatorOptionItemV3,
    ResolvedRuleset
} from "../../engine/v2/types";

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;

type AbilityKey = (typeof ABILITIES)[number];

type ClassPlanRow = {
    classId: string;
    levels: number;
};

type SpellValidationIssue = {
    id: string;
    severity: "error" | "warning";
    message: string;
};

const SUBCLASS_LEVEL_BY_CLASS: Record<string, number> = {
    srd_barbarian: 3,
    srd_bard: 3,
    srd_cleric: 1,
    srd_druid: 2,
    srd_fighter: 3,
    srd_monk: 3,
    srd_paladin: 3,
    srd_ranger: 3,
    srd_rogue: 3,
    srd_sorcerer: 1,
    srd_warlock: 1,
    srd_wizard: 2
};

const FULL_CASTER_CLASS_IDS = new Set([
    "srd_bard",
    "srd_cleric",
    "srd_druid",
    "srd_sorcerer",
    "srd_warlock",
    "srd_wizard"
]);

const HALF_CASTER_CLASS_IDS = new Set([
    "srd_paladin",
    "srd_ranger"
]);

const POINT_BUY_COST: Record<number, number> = {
    8: 0,
    9: 1,
    10: 2,
    11: 3,
    12: 4,
    13: 5,
    14: 7,
    15: 9
};

const SPELL_LEVEL_CAP_BY_WARLOCK_LEVEL: Record<number, number> = {
    1: 1,
    2: 1,
    3: 2,
    4: 2,
    5: 3,
    6: 3,
    7: 4,
    8: 4,
    9: 5,
    10: 5,
    11: 5,
    12: 5,
    13: 5,
    14: 5,
    15: 5,
    16: 5,
    17: 5,
    18: 5,
    19: 5,
    20: 5
};

const RECOMMENDED_PACKAGE_OPTIONS: Record<string, CreatorOptionItemV3> = {
    barbarian: { value: "pkg_barbarian_default", label: "Barbarian Starter (greataxe, handaxe, javelins)" },
    bard: { value: "pkg_bard_default", label: "Bard Starter (rapier, leather, instrument pack)" },
    cleric: { value: "pkg_cleric_default", label: "Cleric Starter (mace, scale mail, shield)" },
    druid: { value: "pkg_druid_default", label: "Druid Starter (scimitar, leather, focus)" },
    fighter: { value: "pkg_fighter_default", label: "Fighter Starter (chain mail, shield, longsword)" },
    monk: { value: "pkg_monk_default", label: "Monk Starter (shortsword, darts, explorer pack)" },
    paladin: { value: "pkg_paladin_default", label: "Paladin Starter (chain mail, shield, martial weapon)" },
    ranger: { value: "pkg_ranger_default", label: "Ranger Starter (longbow, shortswords, leather)" },
    rogue: { value: "pkg_rogue_default", label: "Rogue Starter (shortsword, shortbow, leather)" },
    sorcerer: { value: "pkg_sorcerer_default", label: "Sorcerer Starter (light crossbow, arcane focus)" },
    warlock: { value: "pkg_warlock_default", label: "Warlock Starter (light crossbow, leather, focus)" },
    wizard: { value: "pkg_wizard_default", label: "Wizard Starter (quarterstaff, spellbook, component pouch)" },
    acolyte: { value: "pkg_background_acolyte", label: "Background: Acolyte Equipment Pack" }
};

const PACKAGE_ITEMS: Record<string, string[]> = {
    pkg_barbarian_default: ["srd-2024_greataxe", "srd-2024_handaxe", "srd-2024_javelin"],
    pkg_bard_default: ["srd-2024_rapier", "srd_leather"],
    pkg_cleric_default: ["srd-2024_mace", "srd_scale-mail"],
    pkg_druid_default: ["srd-2024_scimitar", "srd_leather"],
    pkg_fighter_default: ["srd_chain-mail", "srd-2024_longsword"],
    pkg_monk_default: ["srd-2024_shortsword", "srd-2024_dart"],
    pkg_paladin_default: ["srd_chain-mail", "srd-2024_longsword"],
    pkg_ranger_default: ["srd-2024_longbow", "srd_leather", "srd-2024_shortsword"],
    pkg_rogue_default: ["srd-2024_shortsword", "srd-2024_shortbow", "srd_leather"],
    pkg_sorcerer_default: ["srd-2024_light-crossbow", "srd-2024_dagger"],
    pkg_warlock_default: ["srd-2024_light-crossbow", "srd_leather"],
    pkg_wizard_default: ["srd-2024_quarterstaff", "srd-2024_dagger"],
    pkg_background_acolyte: []
};

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback = 0): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

export function parseClassPlan(seed: Record<string, unknown>): ClassPlanRow[] {
    const raw = Array.isArray(seed.class_plan) ? seed.class_plan : [];
    const out: ClassPlanRow[] = [];
    for (const row of raw) {
        const entry = asRecord(row);
        const classId = asString(entry.class_id || entry.classId);
        if (!classId) continue;
        const levels = Math.max(1, Math.floor(asNumber(entry.levels, 1)));
        out.push({ classId, levels });
    }
    return out;
}

export function classLevelsById(seed: Record<string, unknown>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const row of parseClassPlan(seed)) {
        out[row.classId] = (out[row.classId] || 0) + row.levels;
    }
    return out;
}

export function selectedClassIds(seed: Record<string, unknown>): string[] {
    return Object.keys(classLevelsById(seed));
}

export function totalPlannedLevel(seed: Record<string, unknown>): number {
    return parseClassPlan(seed).reduce((sum, row) => sum + row.levels, 0);
}

export function targetLevel(seed: Record<string, unknown>): number {
    return Math.max(1, Math.floor(asNumber(seed.level_total ?? seed.level, 1)));
}

function fullCasterSpellCap(level: number): number {
    if (level <= 0) return 0;
    if (level <= 2) return 1;
    if (level <= 4) return 2;
    if (level <= 6) return 3;
    if (level <= 8) return 4;
    if (level <= 10) return 5;
    if (level <= 12) return 6;
    if (level <= 14) return 7;
    if (level <= 16) return 8;
    return 9;
}

function halfCasterSpellCap(level: number): number {
    if (level < 2) return 0;
    if (level <= 4) return 1;
    if (level <= 8) return 2;
    if (level <= 12) return 3;
    if (level <= 16) return 4;
    return 5;
}

function spellCapForClass(classId: string, level: number): number {
    if (classId === "srd_warlock") {
        const key = Math.max(1, Math.min(20, Math.floor(level)));
        return SPELL_LEVEL_CAP_BY_WARLOCK_LEVEL[key] || 0;
    }
    if (FULL_CASTER_CLASS_IDS.has(classId)) {
        return fullCasterSpellCap(level);
    }
    if (HALF_CASTER_CLASS_IDS.has(classId)) {
        return halfCasterSpellCap(level);
    }
    return 0;
}

export function spellLevelCap(seed: Record<string, unknown>): number {
    const levels = classLevelsById(seed);
    let cap = 0;
    for (const [classId, level] of Object.entries(levels)) {
        cap = Math.max(cap, spellCapForClass(classId, level));
    }
    return cap;
}

export function shouldHaveSpells(seed: Record<string, unknown>): boolean {
    const levels = classLevelsById(seed);
    for (const [classId, level] of Object.entries(levels)) {
        if (FULL_CASTER_CLASS_IDS.has(classId) && level >= 1) return true;
        if (HALF_CASTER_CLASS_IDS.has(classId) && level >= 2) return true;
    }
    return false;
}

export function pointBuySpent(seed: Record<string, unknown>): number {
    const stats = asRecord(seed.stats);
    let spent = 0;
    for (const ability of ABILITIES) {
        const raw = asNumber(stats[ability], 8);
        const bounded = Math.max(8, Math.min(15, Math.floor(raw)));
        spent += POINT_BUY_COST[bounded] ?? 0;
    }
    return spent;
}

export function selectedSubraceOptions(ruleset: ResolvedRuleset, seed: Record<string, unknown>): CreatorOptionItemV3[] {
    const raceId = asString(seed.race_id);
    if (!raceId) return [];
    const race = ruleset.content.races?.[raceId];
    const data = asRecord(race?.data);
    const subraces = Array.isArray(data.subraces) ? data.subraces : [];
    return subraces
        .map(raw => asRecord(raw))
        .map((row, index) => {
            const slug = asString(row.slug || row.name || `subrace_${index + 1}`);
            const label = asString(row.name || slug) || `Subrace ${index + 1}`;
            return {
                value: slug,
                label,
                meta: { data: row }
            } satisfies CreatorOptionItemV3;
        });
}

function asiOpportunityCountForClass(entry: ContentEntryV2 | undefined, level: number): number {
    if (!entry) return 0;
    const data = asRecord(entry.data);
    const features = Array.isArray(data.features) ? data.features : [];
    let count = 0;
    for (const rawFeature of features) {
        const feature = asRecord(rawFeature);
        const key = asString(feature.key).toLowerCase();
        const name = asString(feature.name).toLowerCase();
        if (!key.includes("ability-score-improvement") && !name.includes("ability score improvement")) {
            continue;
        }
        const gainedAt = Array.isArray(feature.gained_at) ? feature.gained_at : [];
        for (const rawLevel of gainedAt) {
            const row = asRecord(rawLevel);
            const gainedLevel = Math.max(1, Math.floor(asNumber(row.level, 0)));
            if (gainedLevel <= level) count += 1;
        }
    }
    return count;
}

export function asiOpportunityCount(ruleset: ResolvedRuleset, seed: Record<string, unknown>): number {
    const levels = classLevelsById(seed);
    let count = 0;
    for (const [classId, level] of Object.entries(levels)) {
        count += asiOpportunityCountForClass(ruleset.content.classes?.[classId], level);
    }
    return count;
}

export function recommendedEquipmentOptions(seed: Record<string, unknown>): CreatorOptionItemV3[] {
    const rows: CreatorOptionItemV3[] = [];
    const classIds = selectedClassIds(seed);
    const backgroundId = asString(seed.background_id);

    for (const classId of classIds) {
        const key = classId.replace(/^srd_/, "");
        const option = RECOMMENDED_PACKAGE_OPTIONS[key];
        if (option) rows.push(option);
    }

    if (backgroundId === "srd_acolyte") {
        rows.push(RECOMMENDED_PACKAGE_OPTIONS.acolyte);
    }

    const unique = new Map<string, CreatorOptionItemV3>();
    for (const row of rows) {
        unique.set(row.value, row);
    }
    return [...unique.values()];
}

export function expandEquipmentPackages(packageIds: string[]): string[] {
    const unique = new Set<string>();
    for (const pkgId of packageIds) {
        const ids = PACKAGE_ITEMS[pkgId] || [];
        for (const id of ids) unique.add(id);
    }
    return [...unique];
}

function ensureStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map(item => String(item)).filter(Boolean);
}

function subclassesByClass(seed: Record<string, unknown>): Record<string, string> {
    const rows = Array.isArray(seed.subclass_plan) ? seed.subclass_plan : [];
    const out: Record<string, string> = {};
    for (const raw of rows) {
        const row = asRecord(raw);
        const classId = asString(row.class_id);
        const subclass = asString(row.subclass_id || row.subclass_name);
        if (classId && subclass) out[classId] = subclass;
    }
    return out;
}

function validateSubclassRequirements(seed: Record<string, unknown>): SpellValidationIssue[] {
    const issues: SpellValidationIssue[] = [];
    const levels = classLevelsById(seed);
    const subclasses = subclassesByClass(seed);

    for (const [classId, minLevel] of Object.entries(SUBCLASS_LEVEL_BY_CLASS)) {
        const level = levels[classId] || 0;
        if (level < minLevel) continue;
        if (!subclasses[classId]) {
            issues.push({
                id: `missing-subclass:${classId}`,
                severity: "error",
                message: `Select a subclass for ${classId.replace("srd_", "")} at level ${minLevel}+.`
            });
        }
    }
    return issues;
}

function validatePointBuy(seed: Record<string, unknown>): SpellValidationIssue[] {
    if (asString(seed.ability_method) !== "point_buy") return [];
    const stats = asRecord(seed.stats);
    const issues: SpellValidationIssue[] = [];

    for (const ability of ABILITIES) {
        const value = Math.floor(asNumber(stats[ability], 0));
        if (value < 8 || value > 15) {
            issues.push({
                id: `point-buy-range:${ability}`,
                severity: "error",
                message: `${ability.toUpperCase()} must be between 8 and 15 in point buy.`
            });
        }
    }

    const spent = pointBuySpent(seed);
    if (spent > 27) {
        issues.push({
            id: "point-buy-budget",
            severity: "error",
            message: `Point buy exceeds 27 points (${spent}/27).`
        });
    }
    return issues;
}

function spellClassKeys(entry: ContentEntryV2 | undefined): string[] {
    const data = asRecord(entry?.data);
    const classes = Array.isArray(data.classes) ? data.classes : [];
    return classes
        .map(raw => asRecord(raw))
        .map(row => asString(row.key))
        .filter(Boolean);
}

function spellLevel(entry: ContentEntryV2 | undefined): number {
    const data = asRecord(entry?.data);
    return Math.max(0, Math.floor(asNumber(data.level, 0)));
}

function validateSpellSelections(ruleset: ResolvedRuleset, seed: Record<string, unknown>): SpellValidationIssue[] {
    const issues: SpellValidationIssue[] = [];
    const classIds = selectedClassIds(seed);
    const hasAnySpell = ensureStringArray(seed.cantrip_ids).length > 0
        || ensureStringArray(seed.spell_ids).length > 0
        || ensureStringArray(seed.spellbook_ids).length > 0;

    if (shouldHaveSpells(seed) && !hasAnySpell) {
        issues.push({
            id: "missing-spells",
            severity: "error",
            message: "Select spells for this class/level combination."
        });
    }

    const cap = spellLevelCap(seed);
    const cantripIds = ensureStringArray(seed.cantrip_ids);
    const knownIds = ensureStringArray(seed.spell_ids);
    const bookIds = ensureStringArray(seed.spellbook_ids);

    const validateIds = (ids: string[], expectedCantrip: boolean, source: string) => {
        for (const id of ids) {
            const spell = ruleset.content.spells?.[id];
            const level = spellLevel(spell);
            const classes = spellClassKeys(spell);

            if (expectedCantrip && level !== 0) {
                issues.push({
                    id: `spell-cantrip-mismatch:${id}`,
                    severity: "error",
                    message: `${id} is not a cantrip.`
                });
            }
            if (!expectedCantrip && level === 0) {
                issues.push({
                    id: `spell-level-mismatch:${id}`,
                    severity: "warning",
                    message: `${id} is a cantrip and should be in cantrip selection.`
                });
            }
            if (level > 0 && cap > 0 && level > cap) {
                issues.push({
                    id: `spell-level-cap:${id}`,
                    severity: "error",
                    message: `${id} exceeds current spell level cap (${cap}).`
                });
            }
            if (classIds.length && classes.length) {
                const classAllowed = classes.some(value => classIds.includes(value));
                if (!classAllowed) {
                    issues.push({
                        id: `spell-class:${source}:${id}`,
                        severity: "error",
                        message: `${id} is not on the selected class spell lists.`
                    });
                }
            }
        }
    };

    validateIds(cantripIds, true, "cantrips");
    validateIds(knownIds, false, "known");
    validateIds(bookIds, false, "spellbook");
    return issues;
}

function validateClassPlan(seed: Record<string, unknown>): SpellValidationIssue[] {
    const issues: SpellValidationIssue[] = [];
    const plan = parseClassPlan(seed);
    if (!plan.length) {
        issues.push({
            id: "class-plan-empty",
            severity: "error",
            message: "Select at least one class in class plan."
        });
        return issues;
    }

    const sum = totalPlannedLevel(seed);
    const target = targetLevel(seed);
    if (sum !== target) {
        issues.push({
            id: "class-level-sum",
            severity: "error",
            message: `Class levels (${sum}) must equal target level (${target}).`
        });
    }
    return issues;
}

function validateAsiChoices(ruleset: ResolvedRuleset, seed: Record<string, unknown>): SpellValidationIssue[] {
    const opportunities = asiOpportunityCount(ruleset, seed);
    if (opportunities <= 0) return [];

    const rows = Array.isArray(seed.asi_choices) ? seed.asi_choices : [];
    if (rows.length < opportunities) {
        return [{
            id: "asi-choice-count",
            severity: "error",
            message: `Choose ASI/feat decisions for all eligible levels (${rows.length}/${opportunities}).`
        }];
    }
    return [];
}

export function evaluateSrd2014CreatorIssues(
    ruleset: ResolvedRuleset,
    seed: Record<string, unknown>,
    stepId?: string
): SpellValidationIssue[] {
    const issues: SpellValidationIssue[] = [];
    const pushIf = (id: string, next: SpellValidationIssue[]) => {
        if (!stepId || stepId === id) {
            issues.push(...next);
        }
    };

    pushIf("class_plan", validateClassPlan(seed));
    pushIf("class_plan", validateSubclassRequirements(seed));
    pushIf("ability_scores", validatePointBuy(seed));
    pushIf("feats_asi", validateAsiChoices(ruleset, seed));
    pushIf("spells", validateSpellSelections(ruleset, seed));
    return issues;
}

export function abilityScores(seed: Record<string, unknown>): Record<AbilityKey, number> {
    const stats = asRecord(seed.stats);
    return {
        str: asNumber(stats.str, 10),
        dex: asNumber(stats.dex, 10),
        con: asNumber(stats.con, 10),
        int: asNumber(stats.int, 10),
        wis: asNumber(stats.wis, 10),
        cha: asNumber(stats.cha, 10)
    };
}

function dedupe(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
}

function assignedScores(seed: Record<string, unknown>, key: "standard_array_assignments" | "rolled_assignments"): Record<string, number> {
    const row = asRecord(seed[key]);
    const out: Record<string, number> = {};
    for (const ability of ABILITIES) {
        const value = asNumber(row[ability], Number.NaN);
        if (Number.isFinite(value)) out[ability] = Math.floor(value);
    }
    return out;
}

export function normalizeSrd2014CreatorSeed(seed: Record<string, unknown>): Record<string, unknown> {
    const next = structuredClone(seed) as Record<string, unknown>;
    const stats = asRecord(next.stats);
    const method = asString(next.ability_method);

    if (method === "standard_array") {
        const assigned = assignedScores(next, "standard_array_assignments");
        next.stats = { ...stats, ...assigned };
    } else if (method === "roll") {
        const assigned = assignedScores(next, "rolled_assignments");
        next.stats = { ...stats, ...assigned };
    }

    const rawChoices = Array.isArray(next.asi_choices) ? next.asi_choices : [];
    const selectedFeats = ensureStringArray(next.selected_feats);
    for (const rawChoice of rawChoices) {
        const choice = asRecord(rawChoice);
        const choiceType = asString(choice.choice_type || choice.type);
        if (choiceType === "feat") {
            const featId = asString(choice.feat_id);
            if (featId) selectedFeats.push(featId);
        }
    }
    next.selected_feats = dedupe(selectedFeats);

    const packageIds = ensureStringArray(next.equipment_package_ids);
    const packageItems = expandEquipmentPackages(packageIds);
    const startingItems = dedupe([
        ...ensureStringArray(next.starting_items),
        ...packageItems
    ]);
    next.starting_items = startingItems;

    return next;
}
