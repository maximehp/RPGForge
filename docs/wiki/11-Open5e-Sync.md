# Open5e Sync Pipeline

## Script
- `scripts/open5e/import-srd.ts`

## Scope
- SRD document keys:
  - `srd-2014`
  - `srd-2024`

## Behavior
- Pulls paginated endpoint data.
- Creates canonical entities with source metadata.
- Compiles grouped artifacts by document + entity kind.
- Writes generated content files into built-in SRD packs.
- Emits report:
  - `docs/open5e-sync/latest-report.json`

## CI
Scheduled workflow:
- `.github/workflows/open5e-sync.yml`

## Slow Connection Strategy
Run in chunks:
```bash
pnpm run sync:open5e -- --documents=srd-2014 --endpoints=spells
pnpm run sync:open5e -- --documents=srd-2014 --endpoints=classes,feats
pnpm run sync:open5e -- --documents=srd-2024 --endpoints=spells,creatures
```
