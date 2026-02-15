# API Reference

## Runtime APIs
- `importPackBundle(file)`
- `activatePacks(packIds)`
- `createCharacter(rulesetId, seed?)`
- `dispatchAction(characterId, action)`
- `saveCharacter(doc)`
- `loadCharacter(id)`

## Creator APIs
- `startCharacterCreator(rulesetId)`
- `completeCharacterCreator(sessionId, choices)`

## Overlay APIs
- `createOverlayPack(rulesetId, scope, characterId?, name?)`
- `upsertOverlayEntity(overlayPackId, entity)`
- `exportOverlayPack(overlayPackId)`

## Open5e APIs
- `syncOpen5eSrd(options?)`
- `compileCanonicalToPackArtifacts(input?)`

## Migration APIs
- `migrateCharacter(doc, toVersion)`
- `migratePack(manifest)`
