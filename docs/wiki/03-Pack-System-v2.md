# Pack System V2.1

## Pack Structure
A pack is a manifest + module entrypoints.

Required manifest keys:
- `schemaVersion: "2.0.0"`
- `id`, `name`, `version`, `kind`
- `entrypoints`

Optional V2.1 entrypoints:
- `creator`
- `authoring`
- `effects`

## Module Blocks
- `model`: core schema and extensions.
- `rules`: formulas, lookups, trusted hooks.
- `content`: typed entities with namespaced `contentId`.
- `ui`: Dockview groups/panels/elements.
- `actions`: action IDs to runtime behavior.
- `creator`: character creation step flow.
- `authoring`: in-app creation/editor templates.
- `effects`: global effect definitions.

## Dependency and Overlay Rules
- Strict semver dependency checks.
- Cycles fail activation.
- Deterministic order.
- Later packs override earlier entries on same `contentType + id`.
- Conflicts are captured with explicit path metadata.
