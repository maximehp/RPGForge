export type PackKind = "core" | "addon";

export type DependencySpec = {
    id: string;
    range: string;
    optional?: boolean;
};

export type ContentIdSpec = {
    namespace: string;
    type: string;
    slug: string;
    revision?: string;
};

export type ContentEntryV2 = {
    id: string;
    contentId: ContentIdSpec;
    title?: string;
    data: Record<string, unknown>;
    mergePolicy?: "replace" | "deep_merge";
};

export type RulesHookBindings = Record<string, "builtin:clamp" | "builtin:min" | "builtin:max" | "builtin:sum" | "builtin:count">;

export type ModelStatV2 = { id: string; label?: string; default?: number };
export type ModelResourceV2 = { id: string; label?: string; default?: number; maxFormula?: string };
export type ModelCollectionV2 = { id: string; label?: string; itemType?: string };
export type ModelFlagV2 = { id: string; label?: string; default?: boolean };

export type ModelCoreV2 = {
    stats?: ModelStatV2[];
    resources?: ModelResourceV2[];
    collections?: ModelCollectionV2[];
    flags?: ModelFlagV2[];
};

export type ModelExtensionV2 = {
    stats?: ModelStatV2[];
    resources?: ModelResourceV2[];
    collections?: ModelCollectionV2[];
    flags?: ModelFlagV2[];
};

export type UiPanelV2 = {
    id: string;
    title: string;
    section: string;
    priority?: number;
    collapsible?: boolean;
    density?: "compact" | "cozy";
    className?: string;
    elements?: unknown[];
};

export type LayoutGroupV2 = {
    id: string;
    title?: string;
    tabs: string[];
};

export type LayoutPresetV2 = {
    groups: LayoutGroupV2[];
};

export type UiPresetV2 = {
    layout: LayoutPresetV2;
    panels: UiPanelV2[];
    accents?: {
        primary?: string;
        secondary?: string;
        surfaceTint?: string;
    };
};

export type CreatorSeverityV3 = "error" | "warning";

export type CreatorOptionItemV3 = {
    value: string;
    label: string;
    meta?: Record<string, unknown>;
};

export type CreatorOptionSourceV3 = {
    kind: "static" | "content" | "lookup" | "expression";
    values?: CreatorOptionItemV3[];
    contentType?: string;
    query?: string;
    lookupTable?: string;
    expression?: string;
    valuePath?: string;
    labelPath?: string;
};

export type CreatorVisibilityV3 = {
    expression: string;
};

export type CreatorOutputBindingV3 = {
    path: string;
    mode?: "set" | "append" | "merge";
};

export type CreatorWarningPolicyV3 = {
    id: string;
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
};

export type CreatorRuleV3 = {
    id: string;
    severity: CreatorSeverityV3;
    when: string;
    message: string;
    overridePolicy?: CreatorWarningPolicyV3;
};

export type CreatorRollConfigV3 = {
    expression: string;
    count: number;
    dropLowest?: number;
    reroll?: {
        equals?: number;
        lt?: number;
        maxRerolls?: number;
    };
    assignment?: "manual" | "auto_desc";
};

export type CreatorFieldTypeV3 =
    | "text"
    | "number"
    | "select"
    | "multiSelect"
    | "toggle"
    | "roller"
    | "tablePick"
    | "repeatGroup";

export type CreatorFieldV3 = {
    id: string;
    label: string;
    type: CreatorFieldTypeV3;
    bindTo?: string;
    required?: boolean;
    default?: unknown;
    helpText?: string;
    options?: CreatorOptionSourceV3;
    visibleWhen?: CreatorVisibilityV3;
    rules?: CreatorRuleV3[];
    output?: CreatorOutputBindingV3;
    roller?: CreatorRollConfigV3;
    fields?: CreatorFieldV3[];
};

export type CreatorStepV3 = {
    id: string;
    title: string;
    description?: string;
    fields: CreatorFieldV3[];
    preloadContentTypes?: string[];
    searchContentTypes?: string[];
    rules?: CreatorRuleV3[];
};

export type CharacterCreatorPresetV3 = {
    schemaVersion: "3.0.0";
    title?: string;
    description?: string;
    steps: CreatorStepV3[];
    rules?: CreatorRuleV3[];
};

export type AuthoringFieldV2 = {
    id: string;
    label: string;
    type: "text" | "number" | "boolean" | "json";
    required?: boolean;
    default?: unknown;
};

export type AuthoringTemplateV2 = {
    id: string;
    label: string;
    contentType: string;
    collectionId?: string;
    defaults?: Record<string, unknown>;
    effects?: EffectSpecV2[];
};

export type AuthoringFormV2 = {
    id: string;
    contentType: string;
    title?: string;
    fields: AuthoringFieldV2[];
};

export type AuthoringPresetV2 = {
    enabled?: boolean;
    contentTypes?: string[];
    templates?: AuthoringTemplateV2[];
    forms?: AuthoringFormV2[];
};

export type ModifierTargetV2 = "stat" | "resource_max" | "derived";
export type ModifierOperationV2 = "add" | "set" | "max" | "min" | "multiply";
export type StackingPolicyV2 = "replace" | "sum" | "max" | "exclusive";

export type TriggerSpecV2 = {
    kind: "always" | "equipped" | "flag" | "manual" | "on_rest" | "on_level_change" | "on_action";
    key?: string;
    equals?: string | number | boolean;
    actionId?: string;
};

export type ModifierSpecV2 = {
    id?: string;
    target: ModifierTargetV2;
    key: string;
    operation?: ModifierOperationV2;
    value?: number;
    formula?: string;
    stacking?: StackingPolicyV2;
};

export type EffectSpecV2 = {
    id: string;
    label?: string;
    modifiers: ModifierSpecV2[];
    triggers?: TriggerSpecV2[];
    duration?: {
        type: "instant" | "while_equipped" | "until_rest" | "timed";
        value?: number;
        unit?: "round" | "minute" | "hour";
    };
    stacking?: StackingPolicyV2;
};

export type ActionSpecV2 = {
    id: string;
    kind: "domain" | "script" | "roll" | "toggle";
    target: string;
    args?: unknown[];
};

export type PackModuleV2 = {
    model?: {
        core?: ModelCoreV2;
        extends?: ModelExtensionV2;
    };
    rules?: {
        formulas?: Record<string, string>;
        lookups?: Record<string, Record<string, number>>;
        hooks?: RulesHookBindings;
    };
    content?: Record<string, ContentEntryV2[]>;
    ui?: UiPresetV2;
    actions?: ActionSpecV2[];
    creator?: CharacterCreatorPresetV3;
    authoring?: AuthoringPresetV2;
    effects?: EffectSpecV2[];
};

export type PackManifestV2 = {
    schemaVersion: "2.0.0";
    id: string;
    name: string;
    version: string;
    kind: PackKind;
    description?: string;
    sourceLicense?: string;
    sourceUrl?: string;
    dependsOn?: DependencySpec[];
    entrypoints: {
        model?: string;
        rules?: string;
        content?: string[];
        ui?: string;
        actions?: string;
        creator?: string;
        authoring?: string;
        effects?: string;
    };
};

export type LoadedPackV2 = {
    manifest: PackManifestV2;
    module: PackModuleV2;
    source: "builtin" | "import" | "overlay";
    sourceRef: string;
};

export type RulesetConflict = {
    id: string;
    contentType: string;
    previousPackId: string;
    nextPackId: string;
    resolution: "overridden";
    path?: string;
};

export type ResolvedRuleset = {
    id: string;
    packOrder: string[];
    manifests: PackManifestV2[];
    model: {
        core: ModelCoreV2;
        extensions: ModelExtensionV2[];
    };
    rules: {
        formulas: Record<string, string>;
        lookups: Record<string, Record<string, number>>;
        hooks: RulesHookBindings;
    };
    ui: UiPresetV2;
    actions: Record<string, ActionSpecV2>;
    content: Record<string, Record<string, ContentEntryV2>>;
    creator?: CharacterCreatorPresetV3;
    authoring?: AuthoringPresetV2;
    effects: EffectSpecV2[];
    conflicts: RulesetConflict[];
};

export type ImportReportV2 = {
    packId?: string;
    source: string;
    errors: string[];
    warnings: string[];
    conflicts: RulesetConflict[];
    resolvedDependencies: string[];
};

export type CharacterDocumentV2 = {
    schemaVersion: "2.0.0";
    meta: {
        id: string;
        rulesetId: string;
        name: string;
        createdAt: string;
        updatedAt: string;
    };
    core: {
        level: number;
        xp: number;
        tags: string[];
        notes: string;
    };
    components: {
        stats: Record<string, number>;
        resources: Record<string, { current: number; max: number }>;
        effectiveStats: Record<string, number>;
        effectiveResources: Record<string, { current: number; max: number }>;
    };
    collections: Record<string, unknown[]>;
    derived: Record<string, number>;
    stateFlags: Record<string, boolean>;
    appliedPacks: string[];
    overlayPackIds?: string[];
};

export type ActionEnvelopeV2 = {
    id: string;
    payload?: Record<string, unknown>;
};

export type OverlayPackMetaV2 = {
    id: string;
    rulesetId: string;
    scope: "global" | "character";
    characterId?: string;
    name: string;
    createdAt: string;
    updatedAt: string;
};

export type OverlayPackDocumentV2 = {
    meta: OverlayPackMetaV2;
    manifest: PackManifestV2;
    module: PackModuleV2;
};

export type CreatorSessionV2 = {
    id: string;
    rulesetId: string;
    createdAt: string;
    updatedAt: string;
    seed: Record<string, unknown>;
    steps: CreatorStepV3[];
    stepSnapshots?: Record<string, Record<string, unknown>>;
    validation?: {
        errors: Array<{ id: string; message: string }>;
        warnings: Array<{ id: string; message: string }>;
    };
    warningConfirmations?: string[];
    rollLog?: Array<{
        fieldId: string;
        expression: string;
        rolls: number[];
        acceptedAt: string;
    }>;
};

export type Open5eCanonicalEntityV2 = {
    id: string;
    kind: "class" | "subclass" | "feature" | "spell" | "item" | "armor" | "weapon" | "condition" | "monster" | "background" | "feat" | "race" | "ruleSection";
    title: string;
    source: {
        documentKey: "srd-2014" | "srd-2024";
        endpoint: string;
        url?: string;
        fetchedAt: string;
        hash: string;
    };
    data: Record<string, unknown>;
    effects?: EffectSpecV2[];
    unmappedRules?: string[];
};

export type Open5eSyncReportV2 = {
    startedAt: string;
    finishedAt: string;
    documents: Array<"srd-2014" | "srd-2024">;
    endpoints: string[];
    pagesFetched: number;
    entitiesTotal: number;
    warnings: string[];
    errors: string[];
};

export type CompileReportV2 = {
    generatedAt: string;
    entitiesIn: number;
    entitiesOut: number;
    effectsCompiled: number;
    unmappedRules: number;
    warnings: string[];
};
