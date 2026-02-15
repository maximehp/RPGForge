# Overlay and Homebrew Packs

## Why overlays
Homebrew should be reusable and portable, not only embedded in one character save.

## APIs
- `createOverlayPack(...)`
- `upsertOverlayEntity(...)`
- `exportOverlayPack(...)`

## Merge behavior
Overlays are normal addon packs with deterministic precedence and conflict reporting.

## In-App flow
- Use `+` controls in authoring-enabled panels.
- Create or edit entities.
- Equip entities to apply effects.
- Export overlay as `.gpack`.
