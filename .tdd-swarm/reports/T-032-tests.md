# T-032 — Placement starters-only (D-6) — TEST AGENT REPORT

**Phase:** `tests` · **Branch:** `ticket/T-032-placement-unlock-overlap` · **Worktree:** `.worktrees/wt-T-032`

## Status

**DONE (RED)**

Amended placement suite encodes D-6 starters-only; composition suite proves mastery still pays. Current `placement.ts` (starter∨range) fails amended/composition tests for the right reason — still pre-granting range guns.

## Files changed

| File | Action |
| --- | --- |
| `__tests__/engine/placement.test.ts` | Amended — `isCannonEligible` → starter only; rewrite AC-2/4/5; add T-032 AC-1/4/7 + DoD tags |
| `__tests__/engine/placement-mastery.test.ts` | **New** — composition AC-5 / AC-6 (`resolvePlacement` + `resolveUnlocks`) |
| `.tdd-swarm/reports/T-032-tests.md` | This report |

**Not touched:** `src/engine/placement.ts`, `src/engine/mastery.ts`, `__tests__/engine/mastery.test.ts`

## RED evidence

```
npx vitest run __tests__/engine/placement.test.ts __tests__/engine/placement-mastery.test.ts
 Test Files  2 failed (2)
      Tests  29 failed | 112 passed (141)
```

Representative failures (current buggy placement still grants range):

| Suite | Assertion | Got |
| --- | --- | --- |
| AC-2 / DoD-5 | `k_1` → exactly `{swivel_gun, culverin}` | also `six_pounder`, `chain_shot` |
| AC-4 / AC-5 | starters only at `g4_5` / `g2_3` | range guns present |
| T-032 AC-1 | every unlocked cannon `unlock.kind === 'starter'` | `chain_shot` is `range` |
| Composition AC-5 | placement leaves range guns for mastery | `six_pounder` already in `P.unlockedCannons` |
| Composition AC-6 | unlock delta includes `six_pounder`/`chain_shot` | already owned → sanity fails |

Island / maxGrade / purity / bot-band tests remain green (D-6 does not change islands).

## Baseline

```
npx vitest run --exclude placement suites → 14 files, 1315 passed
```

Frozen T-010 mastery suite untouched and green.

## Spec-lint

| Ticket | Result |
| --- | --- |
| `tickets/T-032.md` | **PASS** (AC-1…7 + DoD-1…6,8; DoD-7 SKIP process) |
| `tickets/T-011.md` | **PASS** (amended AC-2/4/5 tags retained) |

## AC mapping

| AC | Where | Tag(s) |
| --- | --- | --- |
| T-032 AC-1 | placement — starters-only per band + dimension sweep | `spec(T-032:AC-1)` |
| T-032 AC-2 | placement — `k_1` exactly two starters | `spec(T-032:AC-2)` + `spec(T-011:AC-2)` |
| T-032 AC-3 | placement — `g2_3`/`g4_5` starters; exclude named range/chest | `spec(T-032:AC-3)` + `spec(T-011:AC-4/5)` |
| T-032 AC-4 | placement — island prefix / port_sumwich / k_1 / g4_5 all | `spec(T-032:AC-4)` + `spec(T-011:AC-6/7)` |
| T-032 AC-5 | placement-mastery — full mastery → all 7 range guns | `spec(T-032:AC-5)` `dod(T-032:6)` |
| T-032 AC-6 | placement-mastery — k_1 + add/sub_within_20 → six/chain | `spec(T-032:AC-6)` |
| T-032 AC-7 | placement — meta: old four/nine-cannon expectations gone | `spec(T-032:AC-7)` |
| T-011 AC-2/4/5 | amended in place (no four-cannon / nine-cannon / range inclusions) | `spec(T-011:AC-n)` |

## Implementer target

Change `isCannonEligible` in `src/engine/placement.ts` from `unlock.kind !== 'chest'` to `unlock.kind === 'starter'` (keeping `minGrade <= maxGrade`). Islands unchanged. Then all 29 RED tests above should go green.
