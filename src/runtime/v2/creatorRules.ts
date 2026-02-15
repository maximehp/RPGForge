import { Parser } from "expr-eval";
import type { CreatorRuleV3 } from "../../engine/v2/types";

const parser = new Parser();

export type CreatorRuleIssue = {
    id: string;
    severity: "error" | "warning";
    message: string;
};

function evaluateWhen(expression: string, context: Record<string, unknown>): boolean {
    if (!expression.trim()) return false;
    try {
        const compiled = parser.parse(expression);
        return Boolean(compiled.evaluate({
            ...context,
            size: (value: unknown) => {
                if (Array.isArray(value) || typeof value === "string") return value.length;
                if (value && typeof value === "object") return Object.keys(value).length;
                return 0;
            },
            includes: (value: unknown, candidate: unknown) => {
                if (Array.isArray(value)) {
                    return value.map(item => String(item)).includes(String(candidate));
                }
                if (typeof value === "string") {
                    return value.includes(String(candidate));
                }
                return false;
            },
            has: (value: unknown) => {
                if (value == null) return false;
                if (Array.isArray(value) || typeof value === "string") return value.length > 0;
                if (typeof value === "object") return Object.keys(value).length > 0;
                return true;
            }
        } as any));
    } catch {
        return false;
    }
}

export function evaluateCreatorRules(
    rules: CreatorRuleV3[] = [],
    context: Record<string, unknown>
): CreatorRuleIssue[] {
    const issues: CreatorRuleIssue[] = [];
    for (const rule of rules) {
        if (!evaluateWhen(rule.when, context)) continue;
        issues.push({
            id: rule.id,
            severity: rule.severity,
            message: rule.message
        });
    }
    return issues;
}
