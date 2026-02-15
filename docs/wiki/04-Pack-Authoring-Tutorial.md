# Pack Authoring Tutorial

## 1) Start from Template
Copy one of:
- `src/packs/v2/builtin/sandbox_rpg/`
- `src/packs/v2/builtin/dnd_srd_5e_2024/`

## 2) Configure Manifest
Set:
- unique `id`
- semver `version`
- `kind` (`core` or `addon`)
- `dependsOn` (for addons)
- `entrypoints`

## 3) Define Model
In `schema/model.yaml` declare:
- `stats`
- `resources`
- `collections`
- `flags`

## 4) Define Rules
In `rules/rules.yaml` define formulas as `derived.*` and lookup tables.

## 5) Add Content
Use namespaced IDs:
```yaml
content:
  items:
    - id: iron_sword
      contentId: { namespace: mypack, type: item, slug: iron_sword }
      title: Iron Sword
      data: {}
```

## 6) Add Effects
In `rules/effects.generated.yaml` or dedicated effects file:
```yaml
effects:
  - id: sword_bonus
    modifiers:
      - target: stat
        key: str
        operation: add
        value: 1
    triggers:
      - kind: equipped
```

## 7) Add Creator + Authoring (Optional)
- `ui/creator.yaml` for pack-defined character creation steps.
- `ui/authoring.yaml` for in-app `+` templates/forms.

## 8) Validate
```bash
pnpm run build
pnpm test
```

## 9) Package
Zip with manifest at root and rename to `.gpack`.
