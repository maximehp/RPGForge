# RPGForge TODO

## Current Priority (Creator Completeness + Quality)
- [ ] Ship a complete, pack-driven creator flow for `dnd_srd_5e_2014` with a Roll20-like end-to-end experience.
- [ ] Remove creator jank in navigation, validation feedback, and state persistence.
- [ ] Keep creator content loading step-scoped and lazy (no full catalog load up front).

## 1) Full Creator Coverage (SRD 2014)
Required flow coverage:
- [ ] Identity + campaign toggles.
- [ ] Level plan with multiclass support.
- [ ] Ability scores: roll, point buy, standard array, manual.
- [ ] Race/subrace and related choices.
- [ ] Background choices (skills/tools/languages where applicable).
- [ ] Class/subclass progression and level-gated choices.
- [ ] Feats vs ASI decisions where eligible.
- [ ] Spell setup (cantrips, known/prepared/spellbook by class behavior).
- [ ] Equipment/start loadout.
- [ ] Final review step before create.

Acceptance:
- [ ] A user can create a valid SRD 2014 character at different levels without manual JSON edits.
- [ ] Created character opens directly into sheet and persists across reload.

## 2) Creator UX and Validation Quality
- [ ] Block progression on hard errors with clear field-level messaging.
- [ ] Support warning modal with explicit `Cancel` / `Proceed anyway`.
- [ ] Persist warning overrides in creator session.
- [ ] Improve per-step touched-state and required-field behavior.
- [ ] Reduce confusing field defaults and ambiguous labels.

Acceptance:
- [ ] Validation behavior is predictable and understandable at every step.
- [ ] Users can intentionally override warnings with an audit trail.

## 3) Lazy Catalog and Performance
- [ ] Hydrate creator options by step dependencies only.
- [ ] Warm likely next-step catalogs in background without blocking UI.
- [ ] Avoid importing full Open5e-heavy chunks during boot.
- [ ] Keep search/list interactions responsive as catalog size grows.

Acceptance:
- [ ] Boot and first creator step remain interactive without full dataset hydration.
- [ ] Later steps feel fast after background warmup.

## 4) Inline Custom Additions (Homebrew-in-Flow)
- [ ] Add `Add Custom` actions directly on relevant creator fields.
- [ ] Upsert custom entities through overlays and refresh options immediately.
- [ ] Avoid forcing users into a separate editor flow for common custom additions.

Acceptance:
- [ ] Custom option appears immediately in the same creator step after creation.
- [ ] Flow remains uninterrupted.

## 5) Continuity and Reopen Reliability
- [ ] Resume interrupted creator sessions per ruleset.
- [ ] Reopen last opened character automatically on page refresh.
- [ ] Keep layout fallback/recovery stable and discoverable.

Acceptance:
- [ ] Refreshing with an open character restores usable sheet state without manual reopen.
- [ ] Corrupt layout or missing panel state falls back safely.

## Already Landed (Baseline)
- [x] Metadata-first app boot and deferred heavy hydration.
- [x] Character browser/open/delete/archive flows.
- [x] Layout fallback handling for invalid/empty Dockview state.
