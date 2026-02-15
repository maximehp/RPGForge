# UI and Dockview

## Runtime
- Desktop/tablet: Dockview workspace (`src/app/v2/DockviewWorkspace.tsx`).
- Mobile fallback: stacked section mode using same panel definitions.

## Current Gaps
- Creator flow quality is still below target and needs polish.
- Dockview visual consistency is actively being tuned to match app glass surfaces.

## Panel Renderer
`src/app/v2/PackPanel.tsx` supports elements like:
- `text`, `value`, `bar`, `numberInput`, `toggle`, `button`, `list`
- V2.1 additions: `actionBar`, `createButton`

## In-App Authoring UX
You can wire `+` controls via actions:
- `createEntity`
- `updateEntity`
- `deleteEntity`
- `equipEntity`
- `unequipEntity`

## Layout Persistence
Per character + ruleset layout state is persisted via Dexie (`layouts` store).

## Required Next UI Work
- Complete creator UX for SRD 2014 with all required choice categories.
- Add inline custom option creation in creator fields.
- Continue Dockview polish and consistency with global spacing/glass styles.
