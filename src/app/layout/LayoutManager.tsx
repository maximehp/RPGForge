import React from "react";
import type { LayoutConfig, PanelRegistry } from "../dsl/types";
import { PanelRenderer } from "../PanelRenderer";

type LegacyGroup = {
    tabs: string[];
};

function normalizeLegacyLayout(layout: LayoutConfig, panels: PanelRegistry): LegacyGroup[] {
    const cfg = (layout || {}) as any;
    const groups: LegacyGroup[] = [];

    const rowContent = cfg?.root?.content;
    if (Array.isArray(rowContent)) {
        for (const col of rowContent) {
            const tabs = Array.isArray(col?.content)
                ? col.content.map((c: any) => String(c?.componentType || "")).filter(Boolean)
                : [];
            if (tabs.length) groups.push({ tabs });
        }
    }

    if (!groups.length) {
        groups.push({ tabs: [...panels.keys()] });
    }

    return groups;
}

export function LayoutManager(props: { panels: PanelRegistry; layout: LayoutConfig }) {
    const groups = React.useMemo(() => normalizeLegacyLayout(props.layout, props.panels), [props.layout, props.panels]);

    return (
        <div className="legacy-layout-grid" style={{ display: "grid", gridTemplateColumns: `repeat(${groups.length}, minmax(220px, 1fr))`, gap: 10, padding: 10 }}>
            {groups.map((group, gi) => (
                <div key={gi} style={{ display: "grid", gap: 10, alignContent: "start" }}>
                    {group.tabs.map(tabId => {
                        const panel = props.panels.get(tabId);
                        if (!panel) return null;
                        return (
                            <div key={tabId} style={{ border: "1px solid rgba(255,255,255,0.18)", borderRadius: 12, padding: 10 }}>
                                <PanelRenderer panel={panel} />
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
