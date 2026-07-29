# T-009 Implementation Report — Economy

**Status: DONE**

**Commit:** `01b3d18` — `feat(T-009): economy — performance coin payout and seeded chest rarity roll`
Branch: `ticket/T-009-economy`. Only `src/engine/economy.ts` staged/committed (matches `file_scopes` exactly).

## What was implemented

`src/engine/economy.ts`, two pure functions plus one derived constant, per the ticket's Context
section:

- `computeCoinPayout(p: DuelPerformance): number` — validates `correctAnswers`, `totalAnswers`,
  `perfectShots` are non-negative integers, `correctAnswers <= totalAnswers`, and
  `perfectShots <= correctAnswers` (throws `RangeError` otherwise, 8 independent axes per AC-6).
  Computes `base (COINS_WIN_BASE/COINS_LOSS_BASE) + COINS_PER_ACCURACY_PERCENT * accuracy% +
  COINS_PER_PERFECT_SHOT * perfectShots`, rounded, using only named `@engine/tuning` constants —
  no literal coefficients in this module.
- `CHEST_RARITY_ENTRIES` — built via `CHEST_RARITIES.map(item => ({ item, weight:
  CHEST_RARITY_WEIGHTS[item] }))`, i.e. mapped over T-003's id array, not `Object.entries` over
  the tuning record, so the PRNG-feeding order is pinned to `common, uncommon, rare` regardless of
  `tuning.ts` key order (L-020's specific trap — the mocked-reorder test in the frozen suite
  exercises exactly this).
- `rollChest(rng: Rng): readonly [ChestDrop, Rng]` — two draws off the same stream in order:
  `weightedPick(rng, CHEST_RARITY_ENTRIES)` for rarity, then `nextInt(rngAfterRarity, range.min,
  range.max)` from `CHEST_COIN_RANGE_BY_RARITY[rarity]` for coins. Threads and returns the
  advanced `Rng`; no `Math.random()`, no `Date`, no module state.

## Test summary

- `__tests__/engine/economy.test.ts`: **22/22 passing**, untouched (frozen; not edited).
- Full suite: **798/798 passing** (776 inherited + 22 new).
- `.tdd-swarm/run-local-gates.sh`: format, lint, typecheck, unit, no-todos, no-skipped-tests,
  engine-purity — all PASS.
- `.tdd-swarm/spec-lint.sh tickets/T-009.md`: AC-1 through AC-13 all mapped to at least one
  passing `spec(T-009:AC-n)` test — PASS.

## Concerns

None. No test disputes; the ticket's formula, validation set, and `CHEST_RARITY_ENTRIES`
ordering requirement were implemented as specified with no ambiguity requiring a judgment call.
