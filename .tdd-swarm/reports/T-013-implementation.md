# T-013 Implementation Report

## Unit assertion

| Check | Value |
| --- | --- |
| Branch | `ticket/T-013-duel-types` |
| Active ticket | `T-013` |
| Phase | `implement` |
| Frozen suite SHA-256 | `767fc8daf622fac13081d4f1fb7147818e2401cb7afc6464292d0db12656de05` (unchanged) |
| File scope | `src/engine/duel/types.ts` (+ this report) |

## What was implemented

`src/engine/duel/types.ts`:

- `DUEL_PHASES` / `DuelPhase` — eight ARCHITECTURE.md §4.2 phases, literal tuple
- Discriminated `DuelState` on `phase` over a non-exported `DuelCore`, with per-phase extras for reload / resolvePlayer / resolveRival / victory / defeat
- Supporting shapes: `ActionLogEntry`, `RivalAction`, `RivalVolley`, `RivalView`, `DuelTally`, `DuelResult`, five-variant `DuelEvent`, `DuelConfig` (+ optional `enemyMaxHull`)
- `createDuelState` — validates seed / loadouts / islandId; deep-copies loadouts and every `Template` (params ranges, distractors, constraints); independent interiors per construction; reads `PLAYER_HULL` / `ENEMY_HULL_BY_ISLAND` from tuning
- `isTerminalPhase`, `toRivalView` (player-only `correct` values, most-recent-first)
- Immutability by typing (`readonly` throughout); no `Object.freeze`; plain JSON, no Map/Set/classes/closures

## Security fix (AC-5 own-property islandId)

**FAIL:** `validateConfig` used `config.islandId in ENEMY_HULL_BY_ISLAND`. The `in` operator is true for prototype-chain keys, so `"constructor"`, `"__proto__"`, and `"toString"` passed validation and produced non-numeric `enemyHull`. Probed: `"constructor" in ENEMY_HULL_BY_ISLAND === true` while `Object.hasOwn(ENEMY_HULL_BY_ISLAND, "constructor") === false`.

**Fix (one line):**

```ts
if (!Object.hasOwn(ENEMY_HULL_BY_ISLAND, config.islandId)) {
```

AC-5 requires rejecting an `islandId` with no **own** `ENEMY_HULL_BY_ISLAND` entry.

**Probe evidence** (`scratchpad/t013-security-fix/`, deleted after run):

- `constructor` / `__proto__` / `toString` → `createDuelState` throws `/islandId/`
- Ordinary unknown ids (`atlantis`, `not_an_island`) still throw
- All own keys of `ENEMY_HULL_BY_ISLAND` still construct with numeric hull
- Probe: 4/4 passed

## Gate results (unpiped exits)

| Gate | Exit |
| --- | --- |
| `prettier --check src/engine/duel/types.ts` | 0 |
| `eslint src/engine/duel/types.ts --max-warnings 0` | 0 |
| `tsc --noEmit` | 0 |
| `vitest run` (full) | 0 — **1357/1357** |
| Frozen suite hash | `767fc8da…` unchanged |
| `.tdd-swarm/run-local-gates.sh` | 0 — **ALL LOCAL GATES PASS** |

## Residual risks / disputes

None for this pass. Diff touches only `types.ts` (+ this report). Tests untouched. `toRivalView` loadout alias left as Minor/advisory (out of scope).

**Status: DONE**
