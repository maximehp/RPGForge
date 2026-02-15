# Architecture

## Modules
- `src/engine/v2/`: types, schema, resolver, loaders, importer, Open5e compiler.
- `src/runtime/v2/`: character runtime, action dispatch, migration.
- `src/app/v2/`: V2 app shell, Dockview workspace, panel renderer, creator UI.
- `src/services/`: runtime API and Dexie persistence.
- `src/packs/v2/builtin/`: built-in packs.

## Runtime Contracts
- `ResolvedRuleset`
- `CharacterDocumentV2`
- `ActionEnvelopeV2`

## Data Persistence
IndexedDB via Dexie:
- DB name: `rpgforge_v2`
- One-time migration bridge from `gaminator_v2`

## Overlay Model
Overlay packs persist as addon packs and are merged by normal resolver precedence.
