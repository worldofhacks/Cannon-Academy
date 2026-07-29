# A-015 Test Agent Report

Status: RED_READY

## Frozen test

- `__tests__/app/guided-duel.test.ts`
- 9 declared tests (11 executions through two `it.each` tables)

## Criterion mapping

| Requirement | Test coverage |
| --- | --- |
| AC-1 | Engine-tuned onboarding hull, scripted-opponent identity/interface, and construction through `createScriptedOpponent` |
| AC-2 | All 40 finite correct/wrong/timeout prefixes through the derived three-turn shortest-victory bound; long all-wrong and all-timeout traces; eventual correct-only victory |
| AC-3 | Guided latch, chart destination, persistence, and hydrate/relaunch |
| AC-4 | Wrong and timeout resolving states retain the correct answer and have a positive `PHASE_DURATION_MS` teaching beat |
| AC-5 | Result/captain parity with real `applyDuelOutcome`, per-skill mastery, coins, win, and duplicate-settlement idempotence |
| DoD-5 | Exact initial-state option parameter contract, omitted-vs-empty option equality, existing hull constants, and ordinary default defeat at hull zero |

The public seams are compile-time pinned to:

- `openGuidedDuel(seed): { state, opponent }`
- `settleGuidedDuel(store, state): DuelRewardOutcome`
- `initialDuelState(seed, options?: { rivalHull?: number; hullFloor?: number })`

## RED evidence

`npx vitest run __tests__/app/guided-duel.test.ts` fails at collection because
`src/services/guidedDuel.ts` does not exist. This is the ticket's expected missing-module RED.

`npx tsc --noEmit` reports only the three expected contract gaps:

1. missing `src/services/guidedDuel`
2. `initialDuelState` does not yet have the required exact parameter tuple
3. the required options call is not yet accepted

## Baseline and test gates

- Baseline excluding the new test: **2,015 passed across 41 files**
- Prettier on the frozen test: pass
- ESLint on the frozen test with zero warnings: pass
- Spec-lint for `tickets/app/A-015.md`: pass (AC-1 through AC-5 and DoD-5 mapped)
