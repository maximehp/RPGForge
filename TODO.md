# RPGForge TODO

## Current Priority (Creator Page Redesign)
- [ ] Redesign SRD 2014 creator pages one-by-one.
- [ ] Keep the creator fully pack-driven while redesigning.
- [ ] Remove remaining UI jank (overlap, overflow, unstable inputs, inconsistent spacing).
- [ ] Keep creator data loading step-scoped and lazy.

## Creator Pages (Redo One by One)

### 1) Class Plan and Subclasses
- [ ] Redo page layout and hierarchy.
- [ ] Keep class distribution as the source of total level.
- [ ] Ensure subclass options populate from selected classes only.
- [ ] Ensure subclass requirements appear when class levels reach thresholds.
- [ ] Verify class-specific choices render cleanly and do not overlap.

### 2) Race and Subrace
- [ ] Redo page layout and hierarchy.
- [ ] Ensure race options populate correctly from pack content.
- [ ] Ensure subrace options populate from selected race metadata.
- [ ] Ensure subrace hides/clears correctly when race changes.

### 3) Background and Proficiencies
- [ ] Redo page layout and hierarchy.
- [ ] Ensure background options populate correctly.
- [ ] Improve skill/tool/language pick UX and spacing.
- [ ] Keep inline `Add Custom` available where supported.

### 4) Ability Scores
- [ ] Redo page layout and hierarchy.
- [ ] Improve method switching UX (roll, point buy, standard array, manual).
- [ ] Ensure numeric inputs accept typed values without flicker.
- [ ] Keep validation feedback clear without blocking navigation.

### 5) Feats and ASI
- [ ] Redo page layout and hierarchy.
- [ ] Improve repeat-group readability and controls.
- [ ] Ensure feat options populate correctly.
- [ ] Keep ASI/feat switching clear and stable.

### 6) Spellcasting
- [ ] Redo page layout and hierarchy.
- [ ] Ensure cantrip/spell/spellbook options populate and filter by class plan.
- [ ] Improve large-list usability and selection clarity.
- [ ] Keep inline `Add Custom` behavior fast and predictable.

### 7) Equipment
- [ ] Redo page layout and hierarchy.
- [ ] Ensure package and item options populate correctly.
- [ ] Improve density for long item lists and multi-select controls.
- [ ] Keep option loading responsive on large datasets.

### 8) About (Profile)
- [ ] Redo page layout and hierarchy.
- [ ] Finalize profile fields (name, age, height, weight, appearance, etc.).
- [ ] Keep this page editable and non-blocking.
- [ ] Ensure values persist and reopen reliably.

## Cross-Cutting Creator Requirements
- [ ] Keep Back/Next fixed at the sides; only step pills scroll when needed.
- [ ] Keep step pill styling consistent and readable across desktop/mobile.
- [ ] Keep users free to navigate steps even with incomplete fields.
- [ ] Keep creation flow finishable with partial data that can be edited later.
- [ ] Keep inline `Add Custom` in-flow instead of redirecting to separate tools.
- [ ] Preserve pack-driven behavior (no hardcoded SRD-only UI logic).

## Verification for Each Page Redesign
- [ ] Build succeeds (`pnpm run build`).
- [ ] Tests pass (`pnpm test`).
- [ ] No new obvious TypeScript errors.
- [ ] Manual check: no overlap/overflow in creator viewport.
- [ ] Manual check: step opens/reopens at expected position.

## Already Landed (Baseline)
- [x] Metadata-first app boot and deferred heavy hydration.
- [x] Character browser/open/delete/archive flows.
- [x] Layout fallback handling for invalid/empty Dockview state.
