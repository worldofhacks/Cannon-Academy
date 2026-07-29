# T-007 — Question generator: test report

_Round 3, 2026-07-28. Written after a cross-model re-review rejected the round-2 suite on a
live mutant that let `ExprError` escape, and the ticket was amended from 19 criteria to 21._

| | |
| --- | --- |
| Status | `DONE` |
| Worktree | `.worktrees/wt-T-007`, branch `ticket/T-007-question-generator`, active-ticket `T-007`, phase `tests` |
| Test file | `__tests__/engine/questions/generator.test.ts` |
| Starting SHA-256 | `09b3da13420206d20cc7bdd35d99e0f53b645ac3f078f1b5e1644d7b5b2bdf14` (verified before editing; prefix `09b3da13`) |
| Ending SHA-256 | `f7c62e4d7425a5a1c467e3fe9c9d369493874c2fa93ea7305031208a045c09ae` — the bytes every number below was measured against |
| Tests | 81 (`it` blocks), up from 72 |
| Criterion tags | 21 unique `spec(T-007:AC-n)` + 8 `dod(T-007:n)` |
| Assertion sites | 170 `expect(` call sites |
| Mutants | 56 built, 56 killed, reference clean, kill counts 1 → 45 |

---

## 1. Unit assertion (L-031)

Before any measurement, every command prefixed with an explicit `cd` into the worktree:

```
branch         = ticket/T-007-question-generator
active-ticket  = T-007
phase          = tests
```

Starting suite SHA-256 matched `09b3da13…` exactly. `src/engine/questions/generator.ts` was
absent at start and remains absent at finish.

---

## 2. Why round 2 was rejected, and what I added

The rejection mutant was ordinary and correct-looking: call `evaluateNumber` /
`evaluatePredicate` / `buildDistractors` and let their `ExprError`s escape. It **passed all 72
tests and typechecked clean**. Reachable because `answerExpr` (and `constraints` /
`distractors`) are `z.string()`, so `"a +"` is schema-valid. No fixture carried a malformed
expression (LESSONS.md L-038).

| Addition | Tests | What it closes |
| --- | --- | --- |
| **AC-20** | 5 (premise + 3 sites + sweep) | `ExprError` at constraints / `answerExpr` / declared distractors → `QuestionGenerationError` / `INVALID_QUESTION` naming the template id, with `ExprError` as `cause`. No `ExprError` escapes |
| **AC-5 negative half** | 1 | `NO_TEMPLATE` is never thrown for a non-empty usable pool, including when recency empties the eligible set (step 1 falls back) |
| **AC-21** | 3 (premise + 2 dual-failure cases) | Earliest documented step wins: step 3 before 4 → `CONSTRAINTS_UNSATISFIED`; step 5 before 6 → `INVALID_QUESTION` with `ExprError` cause (not the render diagnosis, which has no cause) |
| **DoD-5** | extended | Same four paths as before, plus the three AC-20 ExprError sites |

`assertQuestion` is not spied on (locked-decision). DoD-7 stays `[process]` / SKIP.

---

## 3. Liveness proofs (L-014 / L-028)

Scratchpad: `scratchpad/t007-round3/` only (deleted before commit).

### AC-20 — leaky generator

Built `leaky.ts`: seven-step algorithm calling the evaluators and `buildDistractors` with **no**
`ExprError` translation.

1. Against the **old** 72-test suite: **71 passed**, 1 failed — and the failure was only the
   DoD-1/3 tag-count meta-test (ticket already had 21 criteria; suite still cited 19). Every
   behavioural assertion was green. The mutant is live.
2. Against the **new** AC-20 tests: **4 failed** (all three site wrappers + the escape sweep).
   Premise fixture-legality test passed, as it should.
3. Against extended DoD-5: failed with
   `ExprError (not a QuestionGenerationError)` on all three bad-expression paths.

### AC-5 negative half — eager `NO_TEMPLATE`

Built `eager-no-template.ts`: throws `NO_TEMPLATE` when recency filtering empties the eligible
pool instead of falling back. Killed by the new AC-5 test (and AC-4): observed
`history=["ac5-alone"] seed=1: NO_TEMPLATE` across the sweep.

### AC-21 — out-of-order steps

Built `out-of-order.ts`: evaluates `answerExpr` on a probe draw before rejection sampling, and
renders text before building distractors.

- Dual-failure step 3+4 → reports `INVALID_QUESTION` instead of `CONSTRAINTS_UNSATISFIED`.
- Dual-failure step 5+6 → reports `INVALID_QUESTION` with **absent** cause (render-first).
- Killed by AC-21 only (`failed=2`), which is the discriminating profile wanted.

### Harness sentinel (L-028)

Candidate that always throws `R3-HARNESS-SENTINEL-c4e1`: **168** occurrences, **67 failed | 14
passed**. The 14 survivors are premise / meta tests that never call the generator. Harness is
live.

### Correct reference

`reference.ts` wraps `ExprError` via post-construction `cause` assignment (ES2022; no change to
frozen `types.ts`). Against the final suite bytes: **81/81 passed**, `tsc -p
scratchpad/t007-round3/tsconfig.candidate.json --noEmit` exit **0**.

---

## 4. Coverage

`spec-lint` resolves **21 of 21 criteria**; DoD 1–6 PASS; **DoD-7 SKIP** (`[process]`).

| AC | Tests | Would pass wrongly if… |
| --- | --- | --- |
| AC-1 … AC-19 | unchanged | (round-2 analysis stands) |
| AC-5 | 3 | …`NO_TEMPLATE` were thrown for non-empty pools. **Negative half now forbids it**, including the recency-empty path |
| AC-20 | 5 | …only one site were wrapped, or `cause` were omitted, or a bare `Error` carried a `code`. Sweep covers all three sites × 114 seeds; premise proves `"a +"` is schema-valid and throws `ExprError` directly |
| AC-21 | 3 | …steps were reordered but the winning code happened to match. Case 5+6 shares `INVALID_QUESTION` with render failure — separated by `cause` (`ExprError` vs absent). Premise proves both failures are live on each fixture |

---

## 5. RED evidence and gates

Every exit code below was read **without a pipe** (L-036).

| Gate | Exit | Result |
| --- | --- | --- |
| `npx prettier --check` (suite) | 0 | Unchanged after `--write` |
| `npx eslint` (suite) `--max-warnings 0` | 0 | Silent |
| `npx tsc --noEmit` | 2 | **Exactly one** diagnostic (quoted below) |
| `npx vitest run` | 1 | 1 suite failed, **1229 other tests passed** |
| `.tdd-swarm/spec-lint.sh tickets/T-007.md` | 0 | 21/21 AC PASS, DoD 1–6 PASS, **DoD-7 SKIP** |
| `tsc -p …/tsconfig.candidate.json` vs reference | 0 | No diagnostics — L-024 satisfied |
| `vitest` vs reference | 0 | 81 passed (81) |

`tsc`, complete output:

```
__tests__/engine/questions/generator.test.ts(71,63): error TS2307:
  Cannot find module '@engine/questions/generator' or its corresponding type declarations.
```

`vitest`:

```
 FAIL  __tests__/engine/questions/generator.test.ts
Error: Cannot find module '@engine/questions/generator' imported from
'.../.worktrees/wt-T-007/__tests__/engine/questions/generator.test.ts'.

 Test Files  1 failed | 13 passed (14)
      Tests  1229 passed (1229)
```

`src/engine/questions/` still contains only `distractors.ts`, `expr.ts`, `types.ts`.

---

## 6. Mutation matrix (re-measured after prettier — L-027)

**Old (round 2, SHA `09b3da13…`):** 53 mutants, 53 killed, reference clean, kill counts 1 → 44.

**New (round 3, SHA `f7c62e4d…`):** 56 mutants, **56 killed**, reference clean, kill counts **1 → 45**.

Added: `M55-leaky-expr-errors`, `M56-eager-no-template`, `M57-out-of-order` (plus retained
`M54-localeCompare-key-order` from round 2).

| New mutant | Failed | Caught by |
| --- | --- | --- |
| M55-leaky-expr-errors | 6 | **AC-20**, AC-21, DoD-5 |
| M56-eager-no-template | 4 | AC-4, **AC-5** |
| M57-out-of-order | 2 | **AC-21** only |

Single-criterion kills include M12/M13/M20/M29/M45/M46/M51/M54/**M57** — the suite still
discriminates. No uniform all-survived / all-killed-by-everything profile.

---

## 7. Residual risk

1. **`composeExpected` still does not wrap `ExprError`.** Success-path tests use it; AC-20/21
   assert errors directly. An implementer copying the oracle verbatim would still leak on
   malformed content — but AC-20 kills that. Worth a one-line note in the implementer brief.
2. **A lookup table over the 114 error-sweep seeds remains theoretically possible.** Same limit
   as round 2; seeds are contiguous + sparse to make it expensive.
3. **DoD-6 still cannot see a hardcoded literal equal to today's tuning value.** Unchanged.
4. **Eligible-pool order is still only pinned by composition**, not by a named criterion.
5. **`assertQuestion` call is intentionally untested** (locked-decision: output validity only).

---

## 8. What changed on disk

- `__tests__/engine/questions/generator.test.ts` — additions only; no restructuring of existing
  blocks.
- `.tdd-swarm/reports/T-007-tests.md` — this file.
- `scratchpad/t007-round3/**` — deleted before commit.
- `src/engine/questions/generator.ts` — does not exist.
