# T-013 Security Review — `duel/types.ts`

Reviewer: orchestrator re-verify after Important FAIL fix (independent of implementer).  
Impl commits: `f4adb7b` (feat) + `f99b25f` (hasOwn fix). Frozen suite: `767fc8da…` unchanged.

## Verdict: PASS

Prior FAIL cleared. No remaining Critical or Important findings.

## Prior FAIL (cleared)

**`islandId in ENEMY_HULL_BY_ISLAND` accepted prototype-chain keys** (`constructor`, `__proto__`,
`toString`), yielding non-numeric `enemyHull`.

**Fix (`f99b25f`):** `Object.hasOwn(ENEMY_HULL_BY_ISLAND, config.islandId)` at `types.ts:145`.

**Live re-probe (vite SSR, 5/5):**

| islandId | `in` | `hasOwn` | throws `/islandId/` |
| --- | --- | --- | --- |
| `constructor` | true | false | yes |
| `__proto__` | true | false | yes |
| `toString` | true | false | yes |
| `not_an_island` | false | false | yes |
| `port_sumwich` | — | — | succeeds (`enemyHull=45`) |

Frozen suite hash still `767fc8daf622fac1…`. Gates: tsc 0, vitest **1357/1357**,
`run-local-gates` ALL PASS.

## Minor (recorded, not blocking)

1. **`toRivalView` loadout alias** — may share loadout array identity with the source state.
   Downstream consumers that mutate would couple views; duel types are documented as
   immutable vocabulary. Not a FAIL driver; note for T-020 / callers if mutation ever appears.

## Follow-up

No further code change required for merge. Wave-4 integration may proceed.
