# T-013 Implementation Report

## Unit assertion

| Check | Value |
| --- | --- |
| Branch | `ticket/T-013-duel-types` |
| Active ticket | `T-013` |
| Phase | `implement` |
| Frozen suite SHA-256 prefix | `767fc8da` (confirmed before write) |
| File scope | `src/engine/duel/types.ts` only |

## What was implemented

`src/engine/duel/types.ts`:

- `DUEL_PHASES` / `DuelPhase` — eight ARCHITECTURE.md §4.2 phases, literal tuple
- Discriminated `DuelState` on `phase` over a non-exported `DuelCore`, with per-phase extras for reload / resolvePlayer / resolveRival / victory / defeat
- Supporting shapes: `ActionLogEntry`, `RivalAction`, `RivalVolley`, `RivalView`, `DuelTally`, `DuelResult`, five-variant `DuelEvent`, `DuelConfig` (+ optional `enemyMaxHull`)
- `createDuelState` — validates seed / loadouts / islandId; deep-copies loadouts and every `Template` (params ranges, distractors, constraints); independent interiors per construction; reads `PLAYER_HULL` / `ENEMY_HULL_BY_ISLAND` from tuning
- `isTerminalPhase`, `toRivalView` (player-only `correct` values, most-recent-first)
- Immutability by typing (`readonly` throughout); no `Object.freeze`; plain JSON, no Map/Set/classes/closures

## Gate results (unpiped exits)

| Gate | Exit |
| --- | --- |
| `prettier --check src/engine/duel/types.ts` | 0 |
| `eslint src/engine/duel/types.ts --max-warnings 0` | 0 |
| `tsc --noEmit` | **0** (error count **0**, was 88) |
| `vitest run __tests__/engine/duel/types.test.ts` | 0 — **128/128** |
| `vitest run` (full) | 0 — **1357/1357** (128 + 1229) |
| `.tdd-swarm/spec-lint.sh tickets/T-013.md` | 0 — SPEC-LINT PASS |
| `.tdd-swarm/run-local-gates.sh` | 1 — see concern below |

## Residual risks / disputes

**DONE_WITH_CONCERNS** — Tier-1 `frozen-tests-unmodified` fails on two *pre-existing* branch commits that touched `__tests__` with subjects `spec(T-013): …` rather than `test(…)` / `style(…)`:

- `0b6b35c` `spec(T-013): kill shared interiors, params.b alias, and memoised rng`
- `306041c` `spec(T-013): kill shallow Template and shared-core AC-3 half-fixes`

This implement commit does not touch `__tests__/`. No `BLOCKED(TEST_DISPUTE)`. Orchestrator may need to accept the historical subject form or retag those commits.
