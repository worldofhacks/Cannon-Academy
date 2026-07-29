# T-013 — Duel state types & initial-state constructor — TEST AGENT REPORT

**Round 3**, deliberately narrow: two additions only (AC-16 config-array aliasing; AC-3
reference-inequality clause). Round-2 suite was accepted and left untouched except for those
additions.

## 0. Unit assertion (L-031)

Asserted before any measurement, from an explicit `cd` into the worktree:

| Check | Value |
| --- | --- |
| `git branch --show-current` | `ticket/T-013-duel-types` |
| `.tdd-swarm/active-ticket` | `T-013` |
| `.tdd-swarm/phase` | `tests` |

| File integrity | SHA-256 of `__tests__/engine/duel/types.test.ts` |
| --- | --- |
| **Starting** (expected `154ebee1…`) | `154ebee16c995de53f805bb964316f4c441e362cb2f9a4be945c9397589c5e2d` ✅ matches |
| **Ending** (after prettier; unchanged by it) | `c5e80f2b28bd58ade1ef1e32c780c402c326ff411c583c7b59150b84181c970c` |

`src/engine/duel/types.ts` is still absent.

---

## 1. Status

**DONE**

Both additions are live mutants that the old suite could not see, both are killed by the new
tests, the RED tally is unchanged at 88, spec-lint is green at 16 criteria with DoD-9 SKIP, the
wave 1–3 baseline is still 1229 passed, and the re-measured matrix is 51/51 killed with 5/5
controls surviving (including the three T-022 forward-compat controls).

---

## 2. What was added (nothing else)

| Addition | Location | Tests |
| --- | --- | --- |
| **AC-3 clause** — same config twice must not return the same object reference | new `it` inside the existing AC-3 describe; deep-equality tests untouched | 1 |
| **AC-16** — construction copies every array-valued config input (and nested `Template[]` under `templatesBySkill`); caller mutation after construction must leave the state unchanged; references must differ | new describe after AC-14, before DoD | 3 |

No restructure, no re-tagging, no `Object.freeze` tests (declined, locked). DoD-9's directory-contents
test left alone. DoD-2 and DoD-3 remain enforced.

**Recount from the committed file:**

| Metric | Round 2 | **Round 3** |
| --- | --- | --- |
| `it()` blocks | 122 | **126** |
| `spec(T-013:AC-n)` tags | 116 | **120** (AC-3 → 4, AC-16 → 3) |
| Active `@ts-expect-error` | 34 | **34** (no new type probes) |

---

## 3. Liveness proofs (required method)

Built under `scratchpad/t013-round3/` (deleted before commit). Against the **old** suite bytes
(`154ebee1…`), both wrong implementations passed every behavioural test — the only failure was
`dod(T-013:1)` reporting untagged AC-16, which is the ticket amendment itself, not a behavioural
tooth:

| Wrong implementation | Old suite (122 tests) | New suite (126 tests) |
| --- | --- | --- |
| **Aliasing** (`playerLoadout`/`rivalLoadout`/`templatesBySkill` assigned straight through) | 121 pass / 1 fail (DoD-1 only) | **KILLED** — 3 AC-16 failures |
| **Memoising** (`WeakMap` cache keyed on the config object) | 121 pass / 1 fail (DoD-1 only) | **KILLED** — 1 AC-3 reference failure |
| Half-fix: alias `playerLoadout` only | behavioural pass | **KILLED** by the playerLoadout test |
| Half-fix: alias `rivalLoadout` only | behavioural pass | **KILLED** by the rivalLoadout test |
| Half-fix: alias pool wholesale | behavioural pass | **KILLED** by the pool test |
| Half-fix: shallow-copy pool object, alias nested `Template[]` | behavioural pass | **KILLED** by the nested-array assertion |
| Correct reference | behavioural pass (DoD-1 only) | **126/126**, `tsc` 0 |

A test I did not watch fail against a wrong implementation is not evidence. Both additions were
watched fail, then watched pass against the reference.

---

## 4. RED evidence

Measured with the module absent and the scratchpad deleted. Exit codes taken without a pipe
(L-036).

```
 Test Files  1 failed | 13 passed (14)
      Tests  1229 passed (1229)
 vitest_exit=1

 FAIL  __tests__/engine/duel/types.test.ts
 Error: Cannot find module '@engine/duel/types'
```

`npx tsc --noEmit` → exit 2, **88 errors, every one inside the test file**:

| Code | Count | What it is |
| --- | --- | --- |
| `TS2307` | 3 | cannot find `@engine/duel/types` |
| `TS2322` | 51 | `Type 'true' is not assignable to type 'false'` |
| `TS2578` | 34 | Unused `@ts-expect-error` |

Unchanged from round 2 — the two additions are runtime assertions, so they add no type-level
RED signal. **Implementer's target remains 88 → 0.**

---

## 5. Gates (unpiped exits)

| Gate | Exit | Notes |
| --- | --- | --- |
| `bash .tdd-swarm/spec-lint.sh tickets/T-013.md` | **0** | **16** criteria all PASS; DoD-1…8 PASS; **DoD-9 SKIP** |
| `npx tsc --noEmit` | **2** | 88 errors (Iron Law / RED) |
| `npx vitest run` | **1** | 1229 passed elsewhere; types suite fails on missing module |
| `npx prettier --write` on the suite | **0** | file unchanged |

---

## 6. Re-measured mutation matrix (final committed bytes)

Rebuilt under `scratchpad/t013-round3/matrix/` against the post-prettier suite hash
`c5e80f2b…`, then deleted. Scoring rule unchanged: KILLED only on a named failing test or a
`tsc` error located in the test file.

**Result: 51/51 designed mutants killed, 5/5 controls survived, 0 harness faults.**

Round 2 was 45 killed / 5 controls. Round 3 adds 6 designed kills (5 AC-16 shapes + 1 memoising
AC-3) and keeps the same 5 controls.

### New this round

| Mutant | Killed by |
| --- | --- |
| alias-all-config-arrays | AC-16 ×3 |
| alias-player-loadout-only | AC-16 playerLoadout |
| alias-rival-loadout-only | AC-16 rivalLoadout |
| alias-template-pool-wholesale | AC-16 pool |
| alias-template-pool-nested-only | AC-16 nested `Template[]` |
| memoised-createDuelState | AC-3 reference inequality |

### Controls — all five still survive

| Control | Why it must survive |
| --- | --- |
| renamed private local | pure refactor |
| **optional `doubleShot?` on `ActionLogEntry`** | **T-022 forward-compat** |
| **optional field on `DuelConfig`** | **T-022 / AC-2 amendment forward-compat** |
| seed validation deleted but `createRng` still throws | legal AC-5 implementation |
| **EQUIVALENT: `isTerminalPhase` via `startsWith('v') \|\| startsWith('d')`** | behaviourally identical over the closed eight-phase domain (T-022 forward-compat evidence that the suite does not overfit the predicate's spelling) |

The equivalent-mutant residual risk is unchanged from round 2: it becomes live only if a phase
named `draw` / `disconnected` / `victoryLap` is added, and AC-1 goes red first.

---

## 7. What I could not do / did not do

- Did not add `Object.freeze` tests (declined, locked in Planning Decisions).
- Did not restructure or re-tag the round-2 suite.
- Did not leave the scratchpad behind.
- AC-16 as worded was satisfiable: the config's array-valued fields are exactly
  `playerLoadout`, `rivalLoadout`, and the nested arrays under `templatesBySkill`. No escalation.

---

## 8. Commit

Suite + this report on `ticket/T-013-duel-types`. Hash above is the post-prettier final bytes the
matrix was measured against.
