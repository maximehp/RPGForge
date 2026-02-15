# Current Gaps and Roadmap

This page tracks product-critical gaps that must be closed for RPGForge to function as a full character sheet tool.

## Critical Gaps
- Creator completeness: SRD 2014 flow is not yet complete enough for production usage.
- Creator UX quality: current step behavior and feedback still feel janky.
- Creator content strategy: some flows still hydrate too much data too early.
- In-flow homebrew: users need inline `Add Custom` in creator fields.

## Roadmap (Immediate)
1. Complete SRD 2014 creator coverage end-to-end.
2. Improve validation/warnings UX and session continuity.
3. Enforce step-scoped lazy loading with background index warmup.
4. Add inline custom creation in creator flow.
5. Continue hardening reopen/layout reliability and refresh restore behavior.

## Linked Tracker
- Root task list: `TODO.md`

## Definition of “Character Sheet Works”
All of these must be true:
- User can create a character.
- User can find that character later in a list.
- User can open the character and continue editing.
- Changes persist and reload correctly.

For current cycle, this also includes:
- Creator supports complete SRD 2014 setup (including multiclass + spells).
- Creator is fast and clear enough to use without workarounds.
