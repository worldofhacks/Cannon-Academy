# T-007 — Question generator: test report

_Round 4, 2026-07-28. Written after Composer re-review rejected the round-3 suite on a live
mutant (`m3-render-first-fake-cause`) that ran render before distractors and attached a
fabricated `ExprError` cause. Ticket amendments tightened AC-11 / AC-20 / AC-21 (still 21
criteria)._

| | |
| --- | --- |
| Status | `DONE` |
| Worktree | `.worktrees/wt-T-007`, branch `ticket/T-007-question-generator`, active-ticket `T-007`, phase `tests` |
| Test file | `__tests__/engine/questions/generator.test.ts` |
| Starting SHA-256 | `f7c62e4d7425a5a1c467e3fe9c9d369493874c2fa93ea7305031208a045c09ae` (verified before editing; prefix `f7c62e4d`) |
| Ending SHA-256 | `1a5865707201bc288bd21deb4865cf8c49d3e176e1f43ef537229460b57799e1` — the bytes every number below was measured against |
| Tests | 81 (`it` blocks), unchanged count |
| Criterion tags | 21 unique `spec(T-007:AC-n)` + 8 `dod(T-007:n)` |
| Assertion sites | 176 `expect(` call sites (was 170) |
| Mutants | 58 built, 58 killed, reference clean, kill counts 1 → 45 |

---

## 1. Unit assertion (L-031)

Before any measurement, every command prefixed with an explicit `cd` into the worktree:

```
branch         = ticket/T-007-question-generator
active-ticket  = T-007
phase          = tests
```

Starting suite SHA-256 matched `f7c62e4d…` exactly. `src/engine/questions/generator.ts` was
absent at start and remains absent at finish.

---

## 2. Why round 3 was rejected, and what I tightened

`m3-render-first-fake-cause` (verified by the orchestrator and re-measured here): step 6 before
step 5; on render failure attaches `new ExprError('PARSE_ERROR', 'synthetic render cause')`.
**Against the old suite: 81/81 passed.** Control without the fake cause (`m5`) died on exactly
one test — AC-21's step-5-vs-6 — so `instanceof ExprError` partially bit and still let the cheat
through. AC-11 never inspected `cause` at all.

| Criterion | What changed (no restructure; same tests) |
| --- | --- |
| **AC-11** | Every render `INVALID_QUESTION` asserts `cause === undefined` — single fixtures, stray-brace cases, and the full error-seed sweep |
| **AC-20** | Cause must match the frozen evaluator's **`code` and `message`** for that expression+params (`evaluatePredicate` / `evaluateNumber` / `buildDistractors`). Mere `instanceof ExprError` fails |
| **AC-21** | Step-5 diagnosis uses AC-20's identity rule; step-6 absence is asserted via AC-11 (not only implied by the dual-failure fixture). Dual-failure cause check uses code+message identity |

---

## 3. Liveness proofs (L-014 / L-028)

Scratchpad: `scratchpad/T-007-review3/` (reviewer mutant) and `scratchpad/t007-round4/` (matrix)
— both deleted before commit.

### m3 old → new (the rejection mutant)

| Suite | Result |
| --- | --- |
| Old (`f7c62e4d…`) | **81/81 passed** — live |
| New (`1a586570…`) | **4 failed \| 77 passed** — killed by **AC-11** (3 tests: undeclared token, stray braces, per-seed absent-cause) and **AC-21** (identity mismatch on fabricated message) |

Failure detail on AC-21: `cause PARSE_ERROR/"synthetic render cause" ≠ frozen buildDistractors PARSE_ERROR/"unexpected end of expression"`.

### m5 — render-first, no fake cause

Still dies: **1 failed \| 80 passed**, AC-21 only (`cause is absent`). Discriminating profile preserved.

### Harness sentinel (L-028)

Candidate throwing `R3-HARNESS-SENTINEL-c4e1`: **168** occurrences, **67 failed \| 14 passed**.
Harness is live.

### Correct reference

`reference.ts` (ExprError wrap via post-construction `cause`): **81/81 passed**.
`tsc -p scratchpad/t007-round4/tsconfig.reference.json --noEmit` exit **0** (L-024).

---

## 4. Coverage

`spec-lint` resolves **21 of 21 criteria**; DoD 1–6 PASS; **DoD-7 SKIP** (`[process]`).

| AC | Tests | Would pass wrongly if… |
| --- | --- | --- |
| AC-1 … AC-19 | unchanged structurally | (prior analysis stands) |
| AC-11 | 4 | …a render failure carried any `cause`, including a fabricated `ExprError`. Sweep now requires `cause=absent` on every seed |
| AC-20 | 5 | …`cause` were any `instanceof ExprError` with a different `code`/`message` than the frozen site evaluator |
| AC-21 | 3 | …steps were reordered but a synthetic `ExprError` cause satisfied `instanceof`. Identity + AC-11's pure-render absent-cause close both sides |

---

## 5. RED evidence and gates

Every exit code below was read **without a pipe** (L-036).

| Gate | Exit | Result |
| --- | --- | --- |
| `npx prettier --check` (suite) | 0 | Clean after `--write` |
| `npx eslint` (suite) `--max-warnings 0` | 0 | Silent |
| `npx tsc --noEmit` | 2 | **Exactly one** diagnostic (quoted below) |
| `npx vitest run` | 1 | 1 suite failed, **1229 other tests passed** |
| `.tdd-swarm/spec-lint.sh tickets/T-007.md` | 0 | 21/21 AC PASS, DoD 1–6 PASS, **DoD-7 SKIP** |
| `tsc -p …/tsconfig.reference.json` | 0 | No diagnostics — L-024 satisfied |
| `vitest` vs reference | 0 | 81 passed (81) |

`tsc`, complete output:

```
__tests__/engine/questions/generator.test.ts(77,63): error TS2307:
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

**Old (round 3, SHA `f7c62e4d…`):** 56 mutants, 56 killed, reference clean, kill counts 1 → 45.

**New (round 4, SHA `1a586570…`):** 58 mutants, **58 killed**, reference clean, kill counts **1 → 45**.

Added: `M58-render-first-fake-cause`, `M59-fabricated-expr-cause` (plus retained M55–M57).

| New mutant | Failed | Caught by |
| --- | --- | --- |
| M58-render-first-fake-cause | 4 | **AC-11**, **AC-21** |
| M59-fabricated-expr-cause | 5 | **AC-20**, AC-21 |

Single-criterion kills still include M12/M13/M20/M29/M45/M46/M51/M54/**M57** — the suite still
discriminates. No uniform all-survived / all-killed-by-everything profile.

---

## 7. Residual risk

1. **`composeExpected` still does not wrap `ExprError`.** Success-path tests use it; AC-20/21
   assert errors directly. An implementer copying the oracle verbatim would still leak on
   malformed content — but AC-20 kills that.
2. **A lookup table over the 114 error-sweep seeds remains theoretically possible.** Unchanged.
3. **DoD-6 still cannot see a hardcoded literal equal to today's tuning value.** Unchanged.
4. **Eligible-pool order is still only pinned by composition**, not by a named criterion.
5. **`assertQuestion` call is intentionally untested** (locked-decision: output validity only).

---

## 8. What changed on disk

- `__tests__/engine/questions/generator.test.ts` — tightened AC-11 / AC-20 / AC-21 assertions
  only; no new `it` blocks, no restructuring.
- `.tdd-swarm/reports/T-007-tests.md` — this file.
- `scratchpad/T-007-review3/**` and `scratchpad/t007-round4/**` — deleted before commit.
- `src/engine/questions/generator.ts` — does not exist.
