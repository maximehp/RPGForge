# Character Runtime

## CharacterDocumentV2
Key runtime shape:
- `components.stats`: base stats
- `components.effectiveStats`: computed stats after active effects
- `components.resources`: base resource values
- `components.effectiveResources`: computed resource values
- `derived`: formula outputs (+ optional derived modifiers)

## Recompute Pipeline
1. Start from base state.
2. Collect active effects from ruleset + equipped collection entities.
3. Apply stat/resource modifiers.
4. Compute formulas (`derived.*`).
5. Apply derived-target modifiers.

## Domain Actions
Supported V2.1 actions include:
- `setStat`, `deltaStat`, `setLevel`, `setResourceCurrent`
- `createEntity`, `updateEntity`, `deleteEntity`
- `equipEntity`, `unequipEntity`, `applyTemplate`
- `shortRest`, `longRest`, `recompute`

## Safety
- Unknown hooks fail safely.
- No arbitrary code execution from packs.
