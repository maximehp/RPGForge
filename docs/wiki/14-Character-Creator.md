# Character Creator Preset

## Goal
Character creation must be fully pack-defined and complete enough for real table use.

## Current State
- Creator schema/runtime exists and supports multi-step flow.
- SRD 2014 creator still feels incomplete/janky for end users.
- Near-term priority is to make creator quality comparable to Roll20-style guided creation while remaining system-agnostic.

## Config
`creator` block defines:
- steps
- fields
- required constraints
- seed bindings (`bindTo`)
- rules/warnings and override behavior

## Runtime
- `startCharacterCreator(rulesetId)`
- `completeCharacterCreator(sessionId, choices)`
- `hydrateCreatorStep(sessionId, stepId, query?)`
- `updateCreatorSessionSelection(sessionId, patch)`
- `validateCreatorSession(sessionId, stepId?)`
- `confirmCreatorWarnings(sessionId, warningIds)`

If no creator is defined, RPGForge uses a minimal fallback creator.

## Required Improvements (Current Priority)
- Complete SRD 2014 flow coverage:
  - identity
  - level/multiclass planning
  - ability score methods
  - race/background/class/subclass choices
  - feats/ASI
  - spells
  - equipment
  - review/create
- Stronger UX:
  - predictable validation
  - clear per-field errors
  - warning override modal (`Cancel` / `Proceed anyway`)
  - smoother step transitions
- Lazy data:
  - load only step-relevant catalogs
  - prewarm likely next step in background
- Inline custom creation:
  - `Add Custom` directly on creator fields where needed
  - immediate option-list refresh without leaving flow
