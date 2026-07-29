# T-020 — Implementation Report

**Status:** DONE
**Branch:** `ticket/T-020-duel-reducer`
**Phase:** `implement`
**Active ticket:** `T-020`
**Files changed:** `src/engine/duel/reducer.ts` (added) — exactly `file_scopes`, plus this report.
**Feat commit:** `6ef7aaf` — `feat(T-020): duel reducer pure state machine`

## Unit assertion

| Check | Value |
| ----- | ----- |
| Branch | `ticket/T-020-duel-reducer` |
| Phase | `implement` |
| Active ticket | `T-020` |
| Frozen suite SHA-256 | `80c4cdb1367a39155689ec037a8cca9430849971cedb40db4b6175cc169236ca` |
| Feat SHA | `6ef7aaf` |

## What was built

`duelReducer(state, event): DuelState` — pure synchronous transition table:

| from | event | to | notes |
| ---- | ----- | -- | ----- |
| `countdown` | `ANIMATION_DONE` | `playerChoose` | `turnToken++` |
| `playerChoose` | `CANNON_SELECTED` | `reload` | loadout check; `generateQuestion`; most-recent-first `recentTemplateIds` |
| `reload` | `ANSWER_CHOSEN` / `TIMER_EXPIRED` | `resolvePlayer` | `resolveShot`; hull clamp at apply; player tally + **`bySkill`** |
| `resolvePlayer` | `ANIMATION_DONE` | `victory` \| `defeat` \| `rivalTurn` | enemy-first terminal order |
| `rivalTurn` | `RIVAL_ACTION` | `resolveRival` | rival → player via `damageToEnemy`; volatile recoil → `enemyHull` |
| `resolveRival` | `ANIMATION_DONE` | `victory` \| `defeat` \| `playerChoose` | `volleyNumber++`, `turnToken++` on continue |
| terminals | _any_ | no-op | same object reference |

Adjudications: `DuelTally.bySkill` on player answers; rival `damageToSelf` → `enemyHull`; terminal order enemy-first.

## Gate results (unpiped exits)

| Gate | Exit | Result |
| ---- | ---- | ------ |
| `prettier --check .` | 0 | clean |
| `eslint . --max-warnings 0` | 0 | clean |
| `tsc --noEmit` | 0 | clean |
| `vitest run __tests__/engine/duel/reducer.test.ts` | 0 | **33 / 33** |
| `vitest run` (full suite) | 0 | **1707 / 1707** |
| `.tdd-swarm/spec-lint.sh tickets/T-020.md` | 0 | SPEC-LINT PASS (all 24 ACs + 8 DoD) |
| `.tdd-swarm/run-local-gates.sh` | 0 | ALL LOCAL GATES PASS |

## Dispute history (closed)

1. **AC-24 self-poison** + suite `tsc` on `snapshotArrays` — fixed in `bd8bc4d`.
2. **`dod(T-013:9)`** forbade `reducer.ts` — orchestrator amended permitted list to `['damage.ts', 'reducer.ts', 'types.ts']`.

## Residual risks / notes

- No edits to `__tests__/` from this implementer after feat.
- `src/stores/duel.ts` untouched (app track).
- Pure: no `Math.random` / `Date` / `await` / React in the reducer.
