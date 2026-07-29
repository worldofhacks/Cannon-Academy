# T-013 — Duel state types & initial-state constructor — TEST AGENT REPORT

**Round 5**, deliberately narrow: tighten AC-3 and AC-16 only after Composer re-review
rejected round 4 (`737335df…`, 128 tests). All three review mutants were re-verified live
at 128/128 against those bytes before editing (parent also verified). No restructure.

## 0. Unit assertion (L-031)

Asserted before any measurement, from an explicit `cd` into the worktree:

| Check | Value |
| --- | --- |
| `git branch --show-current` | `ticket/T-013-duel-types` |
| `.tdd-swarm/active-ticket` | `T-013` |
| `.tdd-swarm/phase` | `tests` |

| File integrity | SHA-256 of `__tests__/engine/duel/types.test.ts` |
| --- | --- |
| **Starting** (expected `737335df…`) | `737335df8969b325366fcf86259b9a27ff00019eaeb08391a8ddfdb01096ec3d` ✅ matches |
| **Ending** (after prettier; unchanged by it) | `767fc8daf622fac13081d4f1fb7147818e2401cb7afc6464292d0db12656de05` |

`src/engine/duel/types.ts` is still absent.

---

## 1. Status

**DONE**

AC-3 now walks the whole independence graph (reference inequality **and** a mutation probe
for every mutable interior named by the amended criterion). AC-16 now asserts `not.toBe` for
**every** `params` key's range array and mutates a key that is not the sole identity probe
(`params.b`). All three review mutants that passed 128/128 against the old suite are killed;
shared-core / shallow-Template / memoised controls stay dead; half-fixes one layer over
(shared `bySkill` only; aliased `constraints` after full params copy) also die; the
reference sentinel passes 128/128 with `tsc` exit 0; RED tally remains **88**; spec-lint is
green at 16 ACs with DoD-9 SKIP; wave 1–3 baseline is still 1229 passed.

No further surviving half-fix found while writing beyond the known `startsWith` residual.

---

## 2. What changed (AC-3 + AC-16 only)

| Change | Location | Tests |
| --- | --- | --- |
| **AC-3** — for `playerLoadout`, `rivalLoadout`, `templatesBySkill` (+ nested `Template[]` / Template), `actionLog`, `recentTemplateIds`, `tally`, `tally.bySkill`, and `rng`: `first.X !== second.X`, then mutate through `first` and assert `second` unchanged | existing independent-graphs `it` expanded in place | 0 net |
| **AC-16** — loop `Object.keys(params)` for every range-array `not.toBe`; mutate `params.b` (not only `params.a`) after construction | existing Template deep-copy `it` tightened in place | 0 net |

No restructure, no re-tagging, no `Object.freeze` tests (declined, locked). DoD-9 left alone.

**Recount from the committed file:**

| Metric | Round 4 | **Round 5** |
| --- | --- | --- |
| `it()` blocks | 128 | **128** |
| `spec(T-013:AC-n)` tags | 122 | **122** (AC-3 → 5, AC-16 → 4) |
| Active `@ts-expect-error` | 34 | **34** (no new type probes) |

---

## 3. Liveness proofs (required method)

Harness under `scratchpad/T-013-review4/` (deleted before commit). Absolute `MUTANT_IMPL`
paths; sentinel proven green first (L-028). Against the **old** suite bytes (`737335df…`):

| Wrong implementation | Old suite (128 tests) | New suite (128 tests) |
| --- | --- | --- |
| **share-interior-singletons** (module-level shared `tally` / `actionLog` / `recentTemplateIds`) | **128/128** | **KILLED** — AC-3 `actionLog`/`recentTemplateIds`/`tally` identity (+ mutation) |
| **share-params-b-array** (deep Template copy; aliases `params.b`) | **128/128** | **KILLED** — AC-16 `params.b must be a new range array` |
| **share-rng-object** (`Map`-memoised same `rng` object) | **128/128** | **KILLED** — AC-3 `rng` `not.toBe` (+ state mutation) |
| **shared-core-wrapper** (round-3; stays dead) | **KILLED** (1 fail) | still **KILLED** |
| **shallow-template-objects** (round-3; stays dead) | **KILLED** | still **KILLED** (AC-3 Template identity + AC-16) |
| **memoised-same-ref** | **KILLED** | still **KILLED** |
| Half-fix: new `tally` each call, shared `bySkill` | would pass tally-only identity | **KILLED** — AC-3 `tally.bySkill` `not.toBe` |
| Half-fix: copy every `params` key, alias `constraints` | would pass params-only loop | **KILLED** — AC-16 `constraints` `not.toBe` |
| Correct reference | 128/128 | **128/128**, `tsc` 0 |

A test I did not watch fail against a wrong implementation is not evidence. All three review
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

Unchanged from rounds 2–4 — both tightenings are runtime assertions. **Implementer's target
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

Against post-prettier suite hash `767fc8da…`. Scoring: KILLED only on a named failing
test or a `tsc` error located in the test file. Sentinel must survive first.

**Behavioural (vitest):**

| Mutant | Result | Killed by |
| --- | --- | --- |
| SENTINEL-reference | SURVIVED | — |
| share-interior-singletons | KILLED | AC-3 graph walk (`actionLog`/`tally`/`recent` identity) |
| share-params-b-array | KILLED | AC-16 every-params-key (`params.b`) |
| share-rng-object | KILLED | AC-3 `rng` identity (+ mutation) |
| share-byskill-only (half-fix) | KILLED | AC-3 `tally.bySkill` identity |
| share-params-constraints (half-fix) | KILLED | AC-16 `constraints` identity |
| shared-core-wrapper | KILLED | AC-3 graph walk (`playerLoadout` identity) |
| shallow-template-objects | KILLED | AC-3 Template identity; AC-16 deep-copy |
| memoised-createDuelState | KILLED | AC-2 / AC-3 (same top-level ref) |
| startsWith-terminal-phase | **SURVIVED** | equivalent over the closed eight-phase domain |

**Type-level (`tsc` with aliased impl):**

| Mutant | Result | Killed by |
| --- | --- | --- |
| reference-clean | CLEAN (exit 0) | — |
| optional-debug-on-cannon-selected | ERRORS in test file | AC-13 Exact probe |
| mutable-duelcore-seed | ERRORS in test file | AC-14 readonly probes |

Round-3/4's `startsWith` residual is unchanged: live only if a phase named `draw` /
`disconnected` / `victoryLap` lands, and AC-1 goes red first.

---

## 7. Residuals / concerns

- **`startsWith('vic') \|\| startsWith('def')`** remains an equivalent mutant on the closed
  eight-phase set. Not escalated: same residual as rounds 3–4; fixing it would mean a
  positive enumeration of the six non-terminals or a future open-ended phase list.
- No new half-fix discovered that passes the tightened suite. The bySkill-only and
  constraints-alias probes were written specifically to check one layer over the three
  review mutants; both die.

---

## 8. Scratchpad cleanup

Deleted before commit: `scratchpad/T-013-review4/` (and no `scratchpad/t013-round5/` was
created). Suite + this report are the only deliverables.
