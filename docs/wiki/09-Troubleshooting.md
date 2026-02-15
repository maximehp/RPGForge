# Troubleshooting

## Tests fail with `--runInBand`
`vitest` does not support this flag.

Use:
```bash
pnpm test
```

## Pack activation error
Check:
- missing dependencies
- dependency version mismatch
- manifest entrypoint path errors

## Imported pack not showing
- verify `.gpack` includes root `manifest.yaml` (or `.json`)
- check Import report from UI

## Open5e sync failures
- run `pnpm run sync:open5e` again (script includes retries)
- for unstable internet, run endpoint chunks:
  - `pnpm run sync:open5e -- --documents=srd-2014 --endpoints=spells`
- inspect `docs/open5e-sync/latest-report.json`
- if connection is poor, expect long runs due pagination

## Reset local state
In browser devtools, clear IndexedDB databases `rpgforge_v2` and `gaminator_v2` if needed.
