# T-013 — Duel state types & initial-state constructor — TEST AGENT REPORT

**Round 4**, deliberately narrow: tighten AC-3 and AC-16 only after Composer re-review
rejected round 3 (`c5e80f2b…`, 126 tests). Both review mutants were re-verified live at
126/126 against those bytes before editing. No restructure.

## 0. Unit assertion (L-031)

Asserted before any measurement, from an explicit `cd` into the worktree:

| Check | Value |
| --- | --- |
| `git branch --show-current` | `ticket/T-013-duel-types` |
| `.tdd-swarm/active-ticket` | `T-013` |
| `.tdd-swarm/phase` | `tests` |

| File integrity | SHA-256 of `__tests__/engine/duel/types.test.ts` |
| --- | --- |
| **Starting** (expected `c5e80f2b…`) | `c5e80f2b28bd58ade1ef1e32c780c402c326ff411c583c7b59150b84181c970c` ✅ matches |
| **Ending** (after prettier; unchanged by it) | `737335df8969b325366fcf86259b9a27ff00019eaeb08391a8ddfdb01096ec3d` |

`src/engine/duel/types.ts` is still absent.

---

## 1. Status

**DONE**

AC-3 now requires independent state graphs (not only top-level `not.toBe`); AC-16 now
requires deep-copy of every `Template` and its nested `params` / `distractors` /
`constraints`. Both review mutants that passed 126/126 against the old suite are killed;
the memoised same-ref control still dies; the reference sentinel passes 128/128 with
`tsc` exit 0; RED tally remains **88**; spec-lint is green at 16 ACs with DoD-9 SKIP;
wave 1–3 baseline is still 1229 passed.

---

## 2. What changed (AC-3 + AC-16 only)

| Change | Location | Tests |
| --- | --- | --- |
| **AC-3** — independent state graphs: after two constructions, `first.playerLoadout.push` and a nested write through `first.templatesBySkill[…][0].text` must not change `second` | new `it` in the existing AC-3 describe; prior deep-equality / `not.toBe` / rng tests untouched | +1 |
| **AC-16** — deep-copy each `Template` and nested `params` / `distractors` / `constraints`; mutate caller-held `text` + nested slots after construction; assert no `Template` (nor nested arrays/records) is `===` the config's | new `it` in the existing AC-16 describe; three container-copy tests kept | +1 |

No restructure, no re-tagging, no `Object.freeze` tests (declined, locked). DoD-9 left alone.

**Recount from the committed file:**

| Metric | Round 3 | **Round 4** |
| --- | --- | --- |
| `it()` blocks | 126 | **128** |
| `spec(T-013:AC-n)` tags | 120 | **122** (AC-3 → 5, AC-16 → 4) |
| Active `@ts-expect-error` | 34 | **34** (no new type probes) |

---

## 3. Liveness proofs (required method)

Harness under `scratchpad/T-013-review3/` (deleted before commit). Absolute `MUTANT_IMPL`
paths; sentinel proven green first (L-028). Against the **old** suite bytes (`c5e80f2b…`):

| Wrong implementation | Old suite (126 tests) | New suite (128 tests) |
| --- | --- | --- |
| **Shallow Template[]** (`[...templates]`, shared `Template` refs) | **126/126** | **KILLED** — AC-16 Template deep-copy (+ AC-3 nested write, same shared Template objects) |
| **Shared-core wrapper** (`WeakMap` core + `{ ...cached, phase }`) | **126/126** (`not.toBe` green; `playerLoadout.push` rewrites second) | **KILLED** — AC-3 independent graphs only (1 fail / 127 pass) after giving it a correct deep Template copy so AC-16 is not a confounder |
| **Memoised** (same top-level ref) | **KILLED** by AC-3 `not.toBe` | still **KILLED** by AC-3 `not.toBe` (+ independence) |
| Half-fix: `{ ...template }` shares nested fields | behavioural pass on old | **KILLED** by AC-16 nested `not.toBe` / mutation |
| Half-fix: new Template + distractors/constraints, shared `params` | behavioural pass on old | **KILLED** by AC-16 `params` identity |
| Correct reference | 126/126 | **128/128**, `tsc` 0 |

A test I did not watch fail against a wrong implementation is not evidence. Both review
mutants were watched pass the old suite, then watched fail the new one; the reference was
watched pass both.

---

## 4. RED evidence

Measured with the module absent and after scratchpad deletion path cleared for the suite
itself. Exit codes taken without a pipe (L-036).

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

Unchanged from rounds 2–3 — both additions are runtime assertions. **Implementer's target
remains 88 → 0.**

`npx tsc --noEmit` against the scratchpad reference (aliased `@engine/duel/types`) → **exit 0**.

---

## 5. Gates (unpiped exits)

| Gate | Exit | Notes |
| --- | --- | --- |
| `bash .tdd-swarm/spec-lint.sh tickets/T-013.md` | **0** | **16** criteria all PASS; DoD-1…8 PASS; **DoD-9 SKIP** |
| `npx tsc --noEmit` | **2** | 88 errors (Iron Law / RED) |
| `npx vitest run` | **1** | 1229 passed elsewhere; types suite fails on missing module |
| `npx prettier --write` on the suite | **0** | file unchanged after format |

---

## 6. Re-measured mutation matrix (final committed bytes)

Against post-prettier suite hash `737335df…`. Scoring: KILLED only on a named failing
test or a `tsc` error located in the test file. Sentinel must survive first.

**Behavioural (vitest):**

| Mutant | Result | Killed by |
| --- | --- | --- |
| SENTINEL-reference | SURVIVED | — |
| shallow-template-objects | KILLED | AC-16 deep-copy; AC-3 nested write |
| shared-core-wrapper | KILLED | AC-3 independent graphs (`playerLoadout.push`) |
| memoised-createDuelState | KILLED | AC-3 `not.toBe` (+ independence) |
| alias-all-loadouts | KILLED | AC-16 ×3 containers (+ deep-copy / AC-3) |
| alias-nested-template-arrays | KILLED | AC-16 nested arrays (+ deep-copy / AC-3) |
| spread-template-share-nested | KILLED | AC-16 nested field identity |
| spread-template-share-params | KILLED | AC-16 `params` identity |
| startsWith-terminal-phase | **SURVIVED** | equivalent over the closed eight-phase domain |

**Type-level (`tsc` with aliased impl):**

| Mutant | Result | Killed by |
| --- | --- | --- |
| reference-clean | CLEAN (exit 0) | — |
| optional-debug-on-cannon-selected | ERRORS in test file | AC-13 Exact probe |
| mutable-duelcore-seed | ERRORS in test file | AC-14 readonly probes |

Round-3's five forward-compat / equivalent controls remain the residual story for
`startsWith` (live only if a phase named `draw` / `disconnected` / `victoryLap` lands, and
AC-1 goes red first). Optional `doubleShot?` / extra `DuelConfig` field controls were not
re-litigated this round; AC-2's existing non-exactness stance is unchanged.

---

## 7. What I could not do / did not do

- Did not restructure or re-tag the round-3 suite beyond the two tightenings.
- Did not add `Object.freeze` tests (declined, locked).
- Did not leave the scratchpad behind.
- Did not invent new acceptance criteria; ticket amendments stayed at 16.

---

## 8. Commit

| | |
| --- | --- |
| Commit | _(filled after commit)_ on `ticket/T-013-duel-types` |
| Suite SHA-256 | `737335df8969b325366fcf86259b9a27ff00019eaeb08391a8ddfdb01096ec3d` |

Matrix was measured against those final post-prettier bytes. Scratchpad deleted.
