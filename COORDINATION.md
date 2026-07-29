# Two-track coordination — engine swarm vs app shell

Two agents are working this repo concurrently. This file is the contract between them.
**Read it before writing anything.**

## Tracks

| Track             | Branch                                     | Owner         | Scope                                                                                                             |
| ----------------- | ------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| **A — engine**    | `swarm/engine-core` + `ticket/*` worktrees | the TDD swarm | `src/engine/**`, `src/content/**`, `__tests__/**`, `tickets/**`, `.tdd-swarm/**`                                  |
| **B — app shell** | `app/shell` (worktree `.worktrees/wt-app`) | the app build | `app/**`, `src/theme/**`, `src/components/**`, `src/stores/**`, `src/services/**`, `assets/index.ts`, Expo config |

## Shared files — coordinate before touching

These are the only real collision points:

- **`package.json` / `package-lock.json`** — Track B adds the Expo/RN dependency tree. Track A should
  add nothing here; if it genuinely must, say so first.
- **`tsconfig.json`** — Track B adds `jsx`, RN types, and any new path aliases. Existing aliases
  (`@engine/*`, `@content/*`) do not change.
- **`eslint.config.js`** — Track B adds an `app/**` + `src/components/**` block. The engine-purity
  and determinism rules for `src/engine/**` and `src/content/**` **must not be relaxed** — they are
  what keep the engine headless and replayable.

## The invariant that matters

**Track B consumes the engine; it never edits it.** If the app needs an engine change, that is a
ticket on Track A, not an edit on `app/shell`. The engine is pure TypeScript with zero React/RN
imports and that is lint-enforced — an app-shaped change reaching into `src/engine/**` breaks the
property the whole test suite rests on.

Conversely, **Track A must not add UI**. `app/**` and `src/components/**` are out of every ticket's
`file_scopes` by construction.

## Merging

Track B rebases onto `swarm/engine-core` regularly and merges back when the shell is stable.
Neither track pushes to `main` — main moves only by owner-approved PR.

## Current state at the time of writing

- Engine: waves 1–4 merged on `swarm/engine-core`, **1,438 tests green**. Wave 5 in flight —
  priority order from owner (2026-07-28): **T-014 → T-015 → T-016** (templates, ≥8/skill floor)
  first, then **T-017** (range drill; publish session API here when it lands), **T-018**
  (onboarding rival), **T-020** (duel reducer; publish state/event shape here — do **not** edit
  `src/stores/duel.ts`), **T-034** last. Do not touch owner-blocked **T-029** / **T-032**.
  Push `swarm/engine-core` after every ticket merge, not at wave end.
- App track (`app/shell`): owns presentation; currently uses a placeholder question service that
  must not ship — real templates from T-014…T-016 replace it.
- iOS: Simulator + Expo web demo path; TestFlight gated on Apple Developer enrollment.
