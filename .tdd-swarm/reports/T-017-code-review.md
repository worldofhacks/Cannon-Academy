# T-017 — Senior Code Review (post-implement)

## Verdict

**APPROVE_WITH_NITS.** Implementation satisfies all 14 acceptance criteria and seven DoD items.
Mastery flows exclusively through `applyAnswer(..., 'range', ...)`, recency is most-recent-first,
timeouts grade as misses, post-completion answers throw, and the module is pure with no
`Math.random` / `Date`. Scope is exactly `file_scopes`. Nits are hygiene/documentation only — no
blocking defects.

## One-line summary

Clean, ticket-faithful drill loop with correct mastery wiring and recency contract; minor
interface/DRY nits only.

## Review context

| Check | Observed |
| --- | --- |
| Worktree | `.worktrees/wt-T-017` |
| Branch | `ticket/T-017-range-drill` |
| Impl commit | `2572fbd` — `feat(T-017): range drill session (full-rate mastery)` |
| Scope | `src/engine/drill.ts` (+ this report) |
| Frozen suite SHA-256 | `7db026f67f89e6dc54b03cd33e9a520d1b2dd32190034147a2ec9ec8adc11d49` ✓ |
| Vitest drill | **32 / 32** pass (re-verified) |
| Full suite | **1652 / 1652** (orchestrator) |
| Local gates | ALL PASS (orchestrator) |

## Mandatory verification

| Requirement | Result | Evidence |
| --- | --- | --- |
| `applyAnswer(..., 'range', ...)` | **PASS** | `drill.ts:152` — sole mastery mutation path; no local rate constants (DoD-4 scan clean) |
| `recentTemplateIds` most-recent-first | **PASS** | `drill.ts:162` — `[current.templateId, ...session.recentTemplateIds]`; AC-11 `[0]` pin passes |
| Purity (no side effects) | **PASS** | New objects on every transition; input session untouched (AC-13); seeded `Rng` threaded |
| JSON serializability | **PASS** | AC-14 round-trip on live, mid, and complete sessions |
| No `Math.random` / `Date` | **PASS** | Source grep clean; DoD-5 poison test passes |
| `file_scopes` only | **PASS** | Commit `2572fbd` touches `src/engine/drill.ts` + report only |
| Completion throw | **PASS** | `drill.ts:144-146` — `Error` with `/complet/i` message; not `RangeError` (AC-8) |
| Timeout = miss | **PASS** | `drill.ts:151` — `choiceIndex === null` → `correct: false` → `applyAnswer(..., false)` (AC-5) |

## AC implementation trace

| AC | Implementation | Risk |
| --- | --- | --- |
| **AC-1** | `startDrill` returns zeroed counters, cloned mastery, first question | None |
| **AC-2** | `assertValidLength` (integer ≥ 1); empty pool delegated to T-007 `NO_TEMPLATE` | None |
| **AC-3** | Correct grading + full-rate mastery via `applyAnswer` | None |
| **AC-4** | Wrong choice: attempts +1, weighted counters unchanged | None |
| **AC-5** | `null` choiceIndex: logged as timeout miss | None |
| **AC-6** | `assertValidAnswer` throws `RangeError` before state advance | None |
| **AC-7** | `answered >= length` → `complete: true`, `current: null` | None |
| **AC-8** | Guard on `complete \|\| current === null` | None |
| **AC-9** | 10× correct → mastered (caller-side `isMastered`) | None |
| **AC-10** | 50% accuracy does not master | None |
| **AC-11** | Recency prepend feeds T-007 `eligiblePool` window | None |
| **AC-12** | Deterministic `generateQuestion` + `Rng` threading | None |
| **AC-13** | Spread/new-array returns; input fields unchanged | None |
| **AC-14** | Plain JSON session including `templates` for restore | None |

## Code quality

**Strengths**

- Matches established engine patterns: deep-copy templates on entry (duel `copyTemplate` shape),
  inject pool rather than registry dependency, delegate all question generation to T-007.
- Validation is front-loaded and fail-fast; invalid answers never partially advance state.
- Completion path skips an unnecessary `generateQuestion` call on the final answer.
- Module header documents PLAN traceability and purity contract clearly.

**Nits (non-blocking)**

### N-1 — `DrillSession.templates` extends ticket interface sketch

The ticket's Context block lists `DrillSession` without a `templates` field, but the exported
interface (`drill.ts:40`) carries the deep-copied pool. This is the right call for AC-14
(JSON restore must be able to resume question generation) and mirrors the duel's
`templatesBySkill` retention pattern. Integrators should treat `templates` as part of the public
contract; consider a follow-up doc pass on the ticket interface block.

### N-2 — Duplicated `copyTemplate` / `copyParams` helpers

`copyTemplate` (`drill.ts:55-68`) is line-for-line identical to `duel/types.ts:166-178`. Within
`file_scopes` isolation this is acceptable; a future refactor could extract a shared
`copyTemplate` utility under `src/engine/` if duplication grows.

### N-3 — Unbounded `recentTemplateIds` growth

The list prepends every answered id but never trims to `RECENT_TEMPLATE_WINDOW`. Correctness is
unaffected (`generateQuestion` reads only `slice(0, RECENT_TEMPLATE_WINDOW)`), and drill lengths
are small. Trimming would be a micro-optimization / memory hygiene tweak, not required.

## Critical findings

**None.**

## Mutant / false-green analysis

| Mutant | Would fail? |
| --- | --- |
| `applyAnswer(..., 'duel', ...)` | AC-3/9 (`MASTERY_RATE` oracle) |
| Append recency instead of prepend | AC-11 (`recentTemplateIds[0]` + window) |
| Timeout treated as skip (no attempts++) | AC-5 oracle |
| Post-complete no-op instead of throw | AC-8 |
| Local `weightedCorrect += 1` | DoD-4 source scan |
| `Math.random()` for draws | DoD-5 poison + AC-12 seed divergence |

## Residual risks

- **Caller mutates `session.templates` between answers** — same immutability-by-contract caveat
  as duel state; not a drill-module defect.
- **No `skillId` ↔ template pool validation** — explicitly caller responsibility per orchestrator
  adjudication; consistent with T-007 injection model.

## Recommendation

Merge as-is. Optional follow-ups: ticket interface doc sync (N-1), shared `copyTemplate` extract
(N-2) — neither blocks T-017.
