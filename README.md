# RPGForge

RPGForge is a pack-driven, system-agnostic character sheet platform.

## Current Status (Important)
Baseline P0 usability plumbing is in place:
- Startup loads pack metadata first and defers heavy rules/content hydration.
- A dedicated character browser/open flow is available.
- Saved characters can be reopened with recovery actions for failed load/layout states.

Current product gap:
- Character creator UX is still incomplete/janky and is the primary near-term focus.
- Next work targets a full, pack-driven, Roll20-like creator flow with smooth step progression and page-by-page redesign.

Tracking document:
- `TODO.md`

## What This Version Includes
- V2.1 pack runtime with validation/warning support and deterministic pack overlays.
- Dockview-based workspace UI with responsive fallback.
- Built-in SRD core packs:
  - `dnd_srd_5e_2014`
  - `dnd_srd_5e_2024`
- Generic reference pack: `sandbox_rpg`.
- Character runtime with base/effective values and equip-driven effect modifiers.
- In-app `+` content creation actions (`createEntity`, `updateEntity`, `equipEntity`, etc.).
- Pack-defined character creator flow.
- Local persistence in IndexedDB (`rpgforge_v2`) with migration bridge from `gaminator_v2`.
- Open5e ingestion pipeline and canonical compiler scaffolding.

## Immediate Product Focus
- Complete creator coverage for SRD 2014 (class plan/subclass, race/subrace, background, ability scores, feats/ASI, spells, equipment, about/profile).
- Redesign each creator page one-by-one for better density, hierarchy, and usability.
- Keep creator navigation non-blocking so users can continue and edit details later.
- Keep creator catalogs lazy and step-scoped (no full dataset load at boot or creator start).
- Prefer inline `Add Custom` in creator fields for homebrew additions.

## Quick Start
```bash
pnpm install
pnpm dev
```

Open: `http://localhost:5173`

Optional pack in URL query:
- `?pack=dnd_srd_5e_2024`
- `?pack=dnd_srd_5e_2014`
- `?pack=sandbox_rpg`

Legacy aliases are supported (for example `?pack=dnd_5e_2024`).

## Commands
```bash
pnpm run build
pnpm test
pnpm run sync:open5e
```

Slow connection chunk example:
```bash
pnpm run sync:open5e -- --documents=srd-2014 --endpoints=spells
```

Notes:
- `vitest` does **not** support Jest's `--runInBand` flag.
- Use `pnpm test` (or `vitest run`) directly.

## Open5e Sync
The sync script is:
- `scripts/open5e/import-srd.ts`

It:
- pulls SRD 2014 + SRD 2024 endpoint data from Open5e,
- compiles canonical artifacts,
- updates generated content/effects files under built-in SRD packs,
- writes report output to:
  - `docs/open5e-sync/latest-report.json`

## Wiki
Full project documentation is in:
- `docs/wiki/README.md`
- Current gaps and roadmap:
  - `docs/wiki/16-Current-Gaps-and-Roadmap.md`

## License
Project: MIT.

Content in SRD packs follows upstream Open5e/Wizards licensing metadata in pack manifests.
