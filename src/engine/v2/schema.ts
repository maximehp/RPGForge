import { z } from "zod";
import type {
    CharacterCreatorPresetV3,
    CreatorFieldV3,
    ContentEntryV2,
    PackManifestV2,
    PackModuleV2,
    RulesHookBindings,
    UiPresetV2
} from "./types";

const Semver = z.string().regex(/^\d+\.\d+\.\d+$/, "expected semver x.y.z");

const DependencySpecSchema = z.object({
    id: z.string().min(1),
    range: z.string().min(1),
    optional: z.boolean().optional()
});

const ContentIdSpecSchema = z.object({
    namespace: z.string().min(1),
    type: z.string().min(1),
    slug: z.string().min(1),
    revision: z.string().optional()
});

const ContentEntrySchema = z.object({
    id: z.string().min(1),
    contentId: ContentIdSpecSchema,
    title: z.string().optional(),
    data: z.record(z.string(), z.unknown()),
    mergePolicy: z.enum(["replace", "deep_merge"]).optional()
});

const ModelStatSchema = z.object({ id: z.string().min(1), label: z.string().optional(), default: z.number().optional() });
const ModelResourceSchema = z.object({
    id: z.string().min(1),
    label: z.string().optional(),
    default: z.number().optional(),
    maxFormula: z.string().optional()
});
const ModelCollectionSchema = z.object({ id: z.string().min(1), label: z.string().optional(), itemType: z.string().optional() });
const ModelFlagSchema = z.object({ id: z.string().min(1), label: z.string().optional(), default: z.boolean().optional() });

const ModelBlockSchema = z.object({
    stats: z.array(ModelStatSchema).optional(),
    resources: z.array(ModelResourceSchema).optional(),
    collections: z.array(ModelCollectionSchema).optional(),
    flags: z.array(ModelFlagSchema).optional()
});

const UiPanelSchema = z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    section: z.string().min(1),
    priority: z.number().int().optional(),
    collapsible: z.boolean().optional(),
    density: z.enum(["compact", "cozy"]).optional(),
    className: z.string().optional(),
    elements: z.array(z.unknown()).optional()
});

const LayoutPresetSchema = z.object({
    groups: z.array(z.object({
        id: z.string().min(1),
        title: z.string().optional(),
        tabs: z.array(z.string().min(1)).default([])
    })).default([])
});

const UiPresetSchema = z.object({
    layout: LayoutPresetSchema,
    panels: z.array(UiPanelSchema).default([]),
    accents: z.object({
        primary: z.string().optional(),
        secondary: z.string().optional(),
        surfaceTint: z.string().optional()
    }).optional()
});

const ActionSpecSchema = z.object({
    id: z.string().min(1),
    kind: z.enum(["domain", "script", "roll", "toggle"]),
    target: z.string().min(1),
    args: z.array(z.unknown()).optional()
});

const HookSchema = z.record(z.string(), z.enum([
    "builtin:clamp",
    "builtin:min",
    "builtin:max",
    "builtin:sum",
    "builtin:count"
]));

const CreatorOptionItemV3Schema = z.object({
    value: z.string().min(1),
    label: z.string().min(1),
    meta: z.record(z.string(), z.unknown()).optional()
});

const CreatorOptionSourceV3Schema = z.object({
    kind: z.enum(["static", "content", "lookup", "expression"]),
    values: z.array(CreatorOptionItemV3Schema).optional(),
    contentType: z.string().optional(),
    query: z.string().optional(),
    lookupTable: z.string().optional(),
    expression: z.string().optional(),
    valuePath: z.string().optional(),
    labelPath: z.string().optional()
});

const CreatorWarningPolicyV3Schema = z.object({
    id: z.string().min(1),
    title: z.string().optional(),
    message: z.string().min(1),
    confirmLabel: z.string().optional(),
    cancelLabel: z.string().optional()
});

const CreatorRuleV3Schema = z.object({
    id: z.string().min(1),
    severity: z.enum(["error", "warning"]),
    when: z.string().min(1),
    message: z.string().min(1),
    overridePolicy: CreatorWarningPolicyV3Schema.optional()
});

const CreatorRollConfigV3Schema = z.object({
    expression: z.string().min(1),
    count: z.number().int().min(1),
    dropLowest: z.number().int().min(0).optional(),
    reroll: z.object({
        equals: z.number().optional(),
        lt: z.number().optional(),
        maxRerolls: z.number().int().min(0).optional()
    }).optional(),
    assignment: z.enum(["manual", "auto_desc"]).optional()
});

const CreatorFieldV3Schema: z.ZodType<CreatorFieldV3> = z.lazy(() =>
    z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        type: z.enum(["text", "number", "select", "multiSelect", "toggle", "roller", "tablePick", "repeatGroup"]),
        bindTo: z.string().optional(),
        required: z.boolean().optional(),
        default: z.unknown().optional(),
        helpText: z.string().optional(),
        options: CreatorOptionSourceV3Schema.optional(),
        visibleWhen: z.object({ expression: z.string().min(1) }).optional(),
        rules: z.array(CreatorRuleV3Schema).optional(),
        output: z.object({
            path: z.string().min(1),
            mode: z.enum(["set", "append", "merge"]).optional()
        }).optional(),
        roller: CreatorRollConfigV3Schema.optional(),
        fields: z.array(CreatorFieldV3Schema).optional()
    })
);

const CreatorStepV3Schema = z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    fields: z.array(CreatorFieldV3Schema).default([]),
    preloadContentTypes: z.array(z.string().min(1)).optional(),
    searchContentTypes: z.array(z.string().min(1)).optional(),
    rules: z.array(CreatorRuleV3Schema).optional()
});

const CreatorPresetV3Schema = z.object({
    schemaVersion: z.literal("3.0.0"),
    title: z.string().optional(),
    description: z.string().optional(),
    steps: z.array(CreatorStepV3Schema).default([]),
    rules: z.array(CreatorRuleV3Schema).optional()
});

const AuthoringFieldSchema = z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    type: z.enum(["text", "number", "boolean", "json"]),
    required: z.boolean().optional(),
    default: z.unknown().optional()
});

const TriggerSchema = z.object({
    kind: z.enum(["always", "equipped", "flag", "manual", "on_rest", "on_level_change", "on_action"]),
    key: z.string().optional(),
    equals: z.union([z.string(), z.number(), z.boolean()]).optional(),
    actionId: z.string().optional()
});

const ModifierSchema = z.object({
    id: z.string().optional(),
    target: z.enum(["stat", "resource_max", "derived"]),
    key: z.string().min(1),
    operation: z.enum(["add", "set", "max", "min", "multiply"]).optional(),
    value: z.number().optional(),
    formula: z.string().optional(),
    stacking: z.enum(["replace", "sum", "max", "exclusive"]).optional()
}).superRefine((value, ctx) => {
    if (value.value == null && value.formula == null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "modifier requires value or formula" });
    }
});

const EffectSchema = z.object({
    id: z.string().min(1),
    label: z.string().optional(),
    modifiers: z.array(ModifierSchema).min(1),
    triggers: z.array(TriggerSchema).optional(),
    duration: z.object({
        type: z.enum(["instant", "while_equipped", "until_rest", "timed"]),
        value: z.number().optional(),
        unit: z.enum(["round", "minute", "hour"]).optional()
    }).optional(),
    stacking: z.enum(["replace", "sum", "max", "exclusive"]).optional()
});

const AuthoringTemplateSchema = z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    contentType: z.string().min(1),
    collectionId: z.string().optional(),
    defaults: z.record(z.string(), z.unknown()).optional(),
    effects: z.array(EffectSchema).optional()
});

const AuthoringFormSchema = z.object({
    id: z.string().min(1),
    contentType: z.string().min(1),
    title: z.string().optional(),
    fields: z.array(AuthoringFieldSchema).default([])
});

const AuthoringPresetSchema = z.object({
    enabled: z.boolean().optional(),
    contentTypes: z.array(z.string().min(1)).optional(),
    templates: z.array(AuthoringTemplateSchema).optional(),
    forms: z.array(AuthoringFormSchema).optional()
});

export const PackManifestV2Schema = z.object({
    schemaVersion: z.literal("2.0.0"),
    id: z.string().min(1),
    name: z.string().min(1),
    version: Semver,
    kind: z.enum(["core", "addon"]),
    description: z.string().optional(),
    sourceLicense: z.string().optional(),
    sourceUrl: z.string().url().optional(),
    dependsOn: z.array(DependencySpecSchema).optional(),
    entrypoints: z.object({
        model: z.string().optional(),
        rules: z.string().optional(),
        content: z.array(z.string()).optional(),
        ui: z.string().optional(),
        actions: z.string().optional(),
        creator: z.string().optional(),
        authoring: z.string().optional(),
        effects: z.string().optional()
    })
});

export const PackModuleV2Schema = z.object({
    model: z.object({
        core: ModelBlockSchema.optional(),
        extends: ModelBlockSchema.optional()
    }).optional(),
    rules: z.object({
        formulas: z.record(z.string(), z.string()).optional(),
        lookups: z.record(z.string(), z.record(z.string(), z.number())).optional(),
        hooks: HookSchema.optional()
    }).optional(),
    content: z.record(z.string(), z.array(ContentEntrySchema)).optional(),
    ui: UiPresetSchema.optional(),
    actions: z.array(ActionSpecSchema).optional(),
    creator: CreatorPresetV3Schema.optional(),
    authoring: AuthoringPresetSchema.optional(),
    effects: z.array(EffectSchema).optional()
});

function firstIssueMessage(err: z.ZodError): string {
    const issue = err.issues[0];
    const at = issue?.path?.join(".") || "(root)";
    return `${issue?.message || "validation failed"} at ${at}`;
}

export function parsePackManifestV2(input: unknown): PackManifestV2 {
    const res = PackManifestV2Schema.safeParse(input);
    if (!res.success) {
        throw new Error(`Invalid V2 manifest: ${firstIssueMessage(res.error)}`);
    }
    return res.data;
}

export function parsePackModuleV2(input: unknown): PackModuleV2 {
    const res = PackModuleV2Schema.safeParse(input);
    if (!res.success) {
        throw new Error(`Invalid V2 module: ${firstIssueMessage(res.error)}`);
    }
    return res.data;
}

export function parseUiPresetV2(input: unknown): UiPresetV2 {
    const res = UiPresetSchema.safeParse(input);
    if (!res.success) {
        throw new Error(`Invalid V2 ui preset: ${firstIssueMessage(res.error)}`);
    }
    return res.data;
}

export function parseContentEntriesV2(input: unknown): ContentEntryV2[] {
    const res = z.array(ContentEntrySchema).safeParse(input);
    if (!res.success) {
        throw new Error(`Invalid V2 content entries: ${firstIssueMessage(res.error)}`);
    }
    return res.data;
}

export function parseHooksV2(input: unknown): RulesHookBindings {
    const res = HookSchema.safeParse(input ?? {});
    if (!res.success) {
        throw new Error(`Invalid V2 hooks: ${firstIssueMessage(res.error)}`);
    }
    return res.data;
}

export function parseCreatorPresetV3(input: unknown): CharacterCreatorPresetV3 {
    const res = CreatorPresetV3Schema.safeParse(input ?? {});
    if (!res.success) {
        throw new Error(`Invalid V3 creator preset: ${firstIssueMessage(res.error)}`);
    }
    return res.data;
}
