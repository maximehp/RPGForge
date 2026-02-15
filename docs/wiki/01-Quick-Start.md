# Quick Start

## Install and Run
```bash
pnpm install
pnpm dev
```

## Build and Test
```bash
pnpm run build
pnpm test
```

Do not pass `--runInBand` to Vitest.

## Ruleset Selection
Use topbar selector or query param:
- `?pack=dnd_srd_5e_2024`
- `?pack=dnd_srd_5e_2014`
- `?pack=sandbox_rpg`

## Import Packs
Use `Import .gpack` in the top bar.

## Open5e Sync
```bash
pnpm run sync:open5e
```
Artifacts update under:
- `src/packs/builtin/dnd_srd_5e_2014/`
- `src/packs/builtin/dnd_srd_5e_2024/`
