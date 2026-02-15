# Persistence and Import

## Dexie Database
Current DB: `rpgforge_v2`

Legacy bridge:
- On first load, data from `gaminator_v2` is copied into `rpgforge_v2`.

## Stores
- `packs`
- `rulesets`
- `characters`
- `layouts`
- `imports`
- `migrations`
- `overlays`
- `canonicalCache`
- `syncReports`
- `creatorSessions`

## Imports
- `.gpack` pack import via UI and `importPackBundle(...)`.
- Import reports include errors/warnings/conflicts/dependency info.

## Overlay Exports
Overlay packs can be exported as `.gpack` through `exportOverlayPack(...)`.
