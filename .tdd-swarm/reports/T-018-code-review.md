# T-018 — Senior Code Review

**Reviewer:** independent (post-implement)  
**Date:** 2026-07-28  
**Branch:** `ticket/T-018-onboarding-rival`  
**Feat commit:** `702a804` — `feat(T-018): opponent interface and scripted onboarding rival`  
**Scope:** `src/engine/opponents/types.ts`, `src/engine/opponents/scripted.ts`  
**Frozen suite:** `__tests__/engine/opponents/scripted.test.ts` SHA-256 `344d3091662158cd6865106846e27a680f29e11e04f136cce1cc2a7bc00567d0` (header unpoison only — accepted)

## Verdict

**APPROVE_WITH_NITS**

## One-line summary

Correct, minimal scripted opponent that satisfies all ACs and file_scopes; only minor defensive-validation gaps vs engine norms.

---

## Verification checklist

| Requirement | Result | Evidence |
| --- | --- | --- |
| `Opponent.id` | **PASS** | Interface declares `readonly id: string`; factory returns `{ id, … }` with caller-supplied value (`types.ts:16`, `scripted.ts:42`). AC-1 green. |
| Paired `chooseAction` → `produceAnswer` | **PASS** | `chooseAction` selects step at cursor, stores in `selected`, increments cursor; `produceAnswer` returns `selected.{correct,elapsedMs}` without advancing (`scripted.ts:43-52`). AC-2 green via `driveTurn`. |
| Repeat-last exhaustion | **PASS** | When `cursor >= script.length`, index clamps to `script.length - 1`; both methods keep emitting final step (`scripted.ts:45-48`). AC-3 green (turns 4–5). |
| Immediate Promises | **PASS** | Both methods return `Promise.resolve(…)` — no timers, no deferral beyond microtask queue (`scripted.ts:48,52`). AC-8 green with fake timers frozen. |
| No `Date` / `Math.random` / timers | **PASS** | Source scan (AC-9) and dod-5 regex pass; ESLint determinism block covers `src/engine/**`. Module text is clean. |
| Validation errors | **PASS** | Empty script → `RangeError` (`scripted.ts:23-25`). Negative `elapsedMs` or unknown `cannonId` → plain `Error` naming step index (`scripted.ts:29-34`). AC-5/6 green. |
| Question / view independence | **PASS** | `void view` / `void question`; outcomes script-only (`scripted.ts:44,51`). AC-4, AC-11 (when in loadout), AC-12 green. |
| `file_scopes` | **PASS** | `src/engine/opponents/` contains exactly `scripted.ts` and `types.ts` (dod-7). Feat commit touches only scoped production files + report. |

---

## Gate & test verification

| Check | Observed |
| --- | --- |
| Vitest scripted suite | **22 / 22** (re-run at review) |
| Full suite (orchestrator) | **1674 / 1674** |
| Local gates | PASS (per implementation report) |
| Spec-lint | PASS AC-1…13 + DoD-1…7 |
| Suite hash | Matches frozen `344d309…` |
| Tests edited by implementer | **None** (feat `702a804` production-only) |

---

## Architecture alignment

- **§4.2 shape:** Two Promise methods, `RivalView` → `RivalAction`, `Question` → `{ correct, elapsedMs }`. Ticket-authoritative `id` field added — matches suite and planning decision, not ARCHITECTURE snippet omission.
- **§4.2 determinism:** No wall-clock; `elapsedMs` is scripted input, not measured. Aligns with locked decision.
- **§13 ghost replay:** Script-driven actor with no view/question coupling is the right substrate for future log replay.
- **Mutable state:** Only closure cursor + `selected` pointer; input `script` never mutated (dod-6).

---

## Strengths

1. **Minimal, readable factory** — ~55 lines; cursor/exhaustion logic is easy to audit.
2. **Construction-time validation** — Rejects empty script and bad steps before any turn is driven; error messages include step index as AC-6 requires.
3. **Explicit independence** — `void view` / `void question` documents intent better than bare unused params.
4. **Scope discipline** — No store driver, no tuning changes, no extra opponent modules; exactly `file_scopes`.
5. **Determinism by construction** — `Promise.resolve` only; no hidden state beyond cursor.

---

## Findings

### Critical

**None.**

### Important

**None.** No AC violation, no false-green path vs frozen suite, no scope creep.

### Nits (non-blocking)

| ID | Severity | Finding | Recommendation |
| --- | --- | --- | --- |
| N-1 | Low | Construction validates `elapsedMs < 0` only. `NaN` / `Infinity` pass construction and would fail AC-10 at runtime, not at factory time. Elsewhere (`damage.ts` `requireUsableTiming`) the engine rejects non-finite timings up front. | Optional: add `!Number.isFinite(step.elapsedMs)` to the construction loop for consistency with `damage.ts`. Not AC-bound today. |
| N-2 | Low | Initial `selected = script[0]!` means a driver bug calling `produceAnswer` before the first `chooseAction` silently returns step 0. Ticket adjudication correctly leaves unpaired behaviour out of scope. | Optional: document in module comment that the driver must always call `chooseAction` before `produceAnswer` each turn. No code change required for merge. |
| N-3 | Info | `CANNON_IDS as readonly string[]` cast for `.includes` is a common pattern here; runtime guard is sufficient because `CannonId` can be widened at call sites. | No action. |

---

## AC trace (implementation ↔ suite)

All thirteen acceptance criteria have passing `spec(T-018:AC-n)` tests. Definition of Done items 1–7 covered by dod tags. Implementation behaviour maps cleanly:

- **AC-1…3:** Interface + ordered playback + exhaustion — core cursor logic.
- **AC-4, 11, 12:** Script-only actor; view/question ignored.
- **AC-5, 6, 10:** Construction validation + answer shape.
- **AC-7, 8, 9:** Determinism, no scheduled time, source scan.
- **AC-13:** Arithmetic-only hull check in suite (intentionally decoupled from factory); mechanism fixture (`ALL_INCORRECT_SCRIPT`) present.

---

## Residual risks

- **Off-loadout cannon:** Implementation does not validate script cannon ∈ `rivalLoadout`; ticket leaves this open (AC-11 asserts membership only when scripted cannon is in loadout). Callers assembling onboarding scripts must keep loadout aligned — expected.
- **Unpaired driver calls:** Skipping or reordering methods can desync cursor vs answers; reducer driver (out of scope) owns pairing discipline.

---

## Recommendation

**Merge.** Ship as-is. Address N-1/N-2 in a follow-up only if tightening construction validation becomes a cross-engine convention before T-021 bot work lands.
