# Character Creator Preset

## Goal
Character creation must be fully pack-defined and complete enough for real table use.

## Current State
- Creator schema/runtime exists and supports multi-step flow.
- SRD 2014 creator currently uses pack-defined steps with bottom step navigation and inline custom additions.
- Near-term priority is to redesign creator pages one-by-one while keeping the flow pack-driven and system-agnostic.

## Config
`creator` block defines:
- steps
- fields
- required constraints
- seed bindings (`bindTo`)
- rules/warnings behavior

## Runtime
- `startCharacterCreator(rulesetId)`
- `completeCharacterCreator(sessionId, choices)`
- `hydrateCreatorStep(sessionId, stepId, query?)`
- `updateCreatorSessionSelection(sessionId, patch)`
- `validateCreatorSession(sessionId, stepId?)`
- `confirmCreatorWarnings(sessionId, warningIds)`

If no creator is defined, RPGForge uses a minimal fallback creator.

## Required Improvements (Current Priority)
- Redesign each SRD 2014 creator page in sequence:
  - class plan and subclasses
  - race and subrace
  - background and proficiencies
  - ability scores
  - feats and ASI
  - spellcasting
  - equipment
  - about/profile
- Keep navigation fluid:
  - users can move between pages even with incomplete fields
  - users can finish and edit later in sheet/runtime
- Improve UX quality:
  - clearer hierarchy and spacing
  - predictable field behavior and input handling
  - stable scrolling and non-overlapping layouts
- Keep data loading lazy:
  - load only step-relevant catalogs
  - prewarm likely next step in background
- Keep inline custom creation:
  - `Add Custom` directly on creator fields where needed
  - immediate option-list refresh without leaving flow
