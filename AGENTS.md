# AGENTS.md

## Purpose
This file defines how humans and coding agents should collaborate in this repository.

## Project Context
- Name: `rpgforge`
- Stack: TypeScript, Vite
- Source directory: `src/`
- Project stage: greenfield/in development (no published versions yet).

## Working Rules
- Keep changes focused and minimal.
- Prefer small, reviewable commits.
- Do not introduce breaking behavior without documenting it.
- Preserve existing project conventions unless a migration is intentional.
- Backward compatibility and migrations are not required unless explicitly requested.

## Current Focus (Next Thread)
- Primary focus is character creator completeness and UX quality.
- Target experience: pack-driven flow with Roll20-like completeness (level, class/subclass, race, background, feats/ASI, spells, equipment, review).
- Prioritize removing jank in step transitions, validation feedback, and reopen/session continuity.
- Keep creator data loading step-scoped and lazy (load only what is needed when it is needed).
- Prefer inline `Add Custom` actions directly in creator fields over separate homebrew editor flows unless explicitly requested.

## Code Quality
- Run tests before finalizing changes when tests exist.
- Run lint/format checks when available.
- Avoid dead code and unused dependencies.
- Keep functions/components cohesive and easy to reason about.

## File and Architecture Conventions
- Put application code in `src/`.
- Keep related code near where it is used.
- Avoid broad refactors unless required for the task.

## Agent-Specific Guidelines
- Read `README.md` before major changes.
- Explain assumptions when requirements are ambiguous.
- If blocked by missing context, ask for clarification with concrete options.
- When editing, reference exact file paths in summaries.

## Verification Checklist
Before handing off, confirm:
- Code builds successfully.
- Relevant tests pass.
- No obvious TypeScript errors introduced.
- Documentation updated if behavior changed.

## Notes
Update this file as project standards evolve.
