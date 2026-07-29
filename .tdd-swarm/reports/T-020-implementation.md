# T-020 — Implementation Report

**Status:** BLOCKED(TEST_DISPUTE)
**Branch:** `ticket/T-020-duel-reducer`
**Phase:** `implement`
**Active ticket:** `T-020`
**Files changed:** `src/engine/duel/reducer.ts` (added) — exactly `file_scopes`, plus this report.
**Suite untouched:** `__tests__/engine/duel/reducer.test.ts` SHA-256 `bcfd707f197df84c3853932b0ebd55dde29b1102ac60a95e7652aa4d46d1f9e9` (preserved).

## Unit assertion

| Check | Value |
| ----- | ----- |
| Branch | `ticket/T-020-duel-reducer` |
| Phase | `implement` |
| Active ticket | `T-020` |
| Frozen suite SHA-256 | `bcfd707f…d1f9e9` (prefix `bcfd707f` ✓) |
| Production file | `src/engine/duel/reducer.ts` only |

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

Adjudications honoured: `DuelTally.bySkill` updates on every player answer; rival `damageToSelf` decrements `enemyHull`; terminal order enemy-first.

## Gate results

| Gate | Exit | Result |
| ---- | ---- | ------ |
| `prettier --check src/engine/duel/reducer.ts` | 0 | clean |
| `eslint src/engine/duel/reducer.ts` | 0 | clean |
| `tsc --noEmit` | **2** | **FAIL** — frozen suite type error (below) |
| `vitest run __tests__/engine/duel/reducer.test.ts` | 1 | **32 / 33** (AC-24 only) |
| `vitest run` (full) | not claimed | blocked by suite defects |
| `.tdd-swarm/spec-lint.sh tickets/T-020.md` | 0 | SPEC-LINT PASS |
| `.tdd-swarm/run-local-gates.sh` | blocked | depends on tsc + vitest |

Behavioural ACs **AC-1…AC-23** all green under the frozen suite. Only the structural self-check **AC-24** fails, and `tsc` fails on a suite type annotation — neither is reachable from production `reducer.ts`.

---

## BLOCKED(TEST_DISPUTE) — evidence

### Dispute 1 — AC-24 self-referential assertion (blocks vitest)

**File:** `__tests__/engine/duel/reducer.test.ts:1112`

```ts
expect(OWN_SOURCE.includes('DUEL_PHASES.map')).toBe(false);
```

`OWN_SOURCE` is the test file itself (`readFileSync(import.meta.url)`). The **only** occurrence of the substring `DUEL_PHASES.map` in that file is this assertion’s string literal. Therefore `includes(...)` is always `true` and the expectation always fails — independent of any production code.

**Proof:**

- Grep of the suite finds a single hit: line 1112 (the assertion).
- Failure message: `expected true to be false` at line 1112.
- Same suite already avoids this class of bug elsewhere via string-splitting (`FOCUSED_TEST_PATTERN`, `DEFERRED_WORK_MARKERS`).

**Suggested fix (test designer / do not apply in implement phase):** split the needle, e.g.

```ts
expect(OWN_SOURCE.includes(['DUEL_PHASES', '.map'].join(''))).toBe(false);
```

or assert absence of a derivation pattern that does not appear in the assertion text.

### Dispute 2 — suite fails `tsc --noEmit` (blocks local gates)

**File:** `__tests__/engine/duel/reducer.test.ts:354`

```ts
readonly choices: readonly Question['choices'] | undefined;
```

`tsc` error:

```
error TS1354: 'readonly' type modifier is only permitted on array and tuple literal types.
```

`Question['choices']` is already an array type; wrapping a union `T | undefined` with the `readonly` modifier is illegal under this TS config. Pre-existing in the frozen suite; not introduced by `reducer.ts`.

**Suggested fix:**

```ts
readonly choices: Question['choices'] | undefined;
```

---

## Residual notes

- Implementation does not touch `src/stores/duel.ts` or `__tests__/**`.
- No `Math.random` / `Date` / `await` / React in the reducer.
- Ready to green immediately once the two suite defects above are patched without changing behavioural oracles (suite hash will change — expected for a test-designer fix).
