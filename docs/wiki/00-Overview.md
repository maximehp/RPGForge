# Overview

RPGForge is a system-agnostic character platform where rules, data, and UI come from packs.

## Core Principles
- SRD is data in packs, not hardcoded logic.
- Any game system can run if represented as a valid V2.1 pack.
- Addons/homebrew layer deterministically.
- Runtime safety: formula DSL + trusted hooks/effects only.

## Defaults
- Built-in core packs:
  - `dnd_srd_5e_2014`
  - `dnd_srd_5e_2024`
- Built-in reference pack:
  - `sandbox_rpg`

## High-Level Flow
1. Load packs (builtin + imports + overlays).
2. Resolve dependencies and overlay order.
3. Merge into one `ResolvedRuleset`.
4. Run pack-defined creator flow (if present).
5. Create/load character document.
6. Render Dockview panels from pack UI.
7. Dispatch actions and recompute derived/effective state.
