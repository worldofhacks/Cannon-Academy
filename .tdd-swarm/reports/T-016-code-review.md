# T-016 — Code Review (independent)

**Ticket:** T-016 — Question templates — grade 3–5 division facts, integer-answerable fractions, multi-digit / order of operations  
**Worktree:** `/Users/quietguy/Documents/Dev/Gauntlet/Math Game/.worktrees/wt-T-016`  
**Branch:** `ticket/T-016-templates-g35`  
**Commits under review:** `8de5d24` (initial JSON), `eea35ac` (ladder-fix contract + AC-11 preflight — test agent), `1198daa` (refresh JSON to post-`eea35ac` contract), `ddd131c` (report SHA note)  
**Content commit:** `1198daa` — feat(T-016): refresh grade 3-5 templates after ladder fix  
**Frozen suite:** `__tests__/content/templates/g35.test.ts` — SHA-256 `a48a7e7ffe7d41e72ed83c08986ae8de8ba16680076ed8bb81b2d868b272cd86` (unchanged since `eea35ac`)  
**Reviewer:** independent senior review — did not write this code  
**Date:** 2026-07-28

Ground truth accepted and independently re-verified: frozen g35 **56/56**, spec-lint **PASS**, suite hash matches implementation report. This review covers diff scope, ladder-safe distractor fixes, structural div constraints, ticket pedagogy fidelity, and what the frozen contract cannot fully judge.

---

## Verdict

**APPROVE_WITH_NITS**

**One-line summary:** Post-`eea35ac` JSON is a correct, gate-green verbatim transcription of `REQUIRED_TEMPLATES` with the ladder-collision class fixed; no blocking defects — only homogeneous near-miss distractors on two skills and minor skeleton/constraint redundancy.

---

## Critical

*(none)*

---

## Important

*(none)*

---

## Minor

| # | Location | Issue |
|---|----------|-------|
| N-1 | 16 of 24 templates (`div_facts` × 7 near-miss rows, all 8 `fractions_int`) | **Near-miss-only distractors.** Every non-special-case template uses the same `nearMiss` triple (`answer±1`, `answer+2`). Ticket Context names pedagogically rich decoys (wrong-order for precedence — present on `multi_digit_order_ops`; fraction wrong-operation patterns are not). AC-11/AC-15 pass; T-005 ladder covers gaps. Acceptable for the ≥8 floor; flag for post-MVP enrichment. |
| N-2 | `div_facts_basic` / `div_facts_divide_tens` | **Shared skeleton `# ÷ # = ?`.** Six distinct skeletons still exceed the ≥5 floor (AC-13). Intentional variant via tighter tens params and `a >= 10`. Harmless. |
| N-3 | `div_facts_same` | **Redundant constraint `a % a == 0`.** Always true when `a != 0`; harmless tautology inherited from contract. No action. |
| N-4 | `fractions_int.json` in `1198daa` | **Unchanged in refresh commit.** Correct — prior copy already matched post-`eea35ac` contract; no ladder collision in that skill. |

---

## 1. Diff vs prior content (`eea35ac` → `1198daa`)

Only deliverable JSON deltas in the feat commit (implementation report accurate):

| File | Change |
|------|--------|
| `div_facts.json` | `div_facts_same` distractors: `["0","2","a"]` → `["0","2","3"]` |
| `multi_digit_order_ops.json` | `no_paren`: params tightened (`a:[1,12]`, `b:[2,12]`, `c:[2,6]`), added `b >= a`, distractors → `["(a+b)*c","b*c","(a+b*c)+2"]` |
| | `paren`: params tightened (`c:[2,4]`) |
| | `times_minus`: distractor `a * (b - c)` → `a * b` (forgot-subtract decoy) |
| `fractions_int.json` | *(no diff — already contract-clean)* |

Initial `8de5d24` copied pre-fix `REQUIRED_TEMPLATES` and failed AC-11 (ladder collisions on `div_facts_same` param distractor `a`, order-ops near-miss overlap, implausible/duplicate distractors on `times_minus`). Test agent `eea35ac` amended the frozen contract; `1198daa` correctly re-transcribed it.

No `templates/index.ts`. No schema/generator/distractor edits. File scope honored.

---

## 2. User-requested confirmations

| Check | Verdict | Evidence |
|-------|---------|----------|
| **Ladder-safe distractors** | **met** | AC-11 preflight on `REQUIRED_TEMPLATES` + loaded JSON both pass (< 250/1000 ladder per template). Fixes target the known collision classes: constant-answer param distractor (`div_facts_same`), wrong-order vs near-miss overlap (`no_paren`), negative implausible expr (`times_minus`). |
| **≥8 templates / skill** | **met** | 8 + 8 + 8 = 24; AC-1, DoD-4 |
| **Structural div constraints** | **met** | `assertDeclaredDivConstraints` on every `div_facts` row (AC-5 structural + DoD-6). Every `/` in `answerExpr` and every `{a} ÷ {b}` text pair declares `dividend % divisor == 0` and non-zero divisor. `div_facts_missing_dividend` correctly exempt (answer is `b * c`; text has `?` not `{a}` as dividend). |
| **No `index.ts`** | **met** | DoD-7; templates dir holds exactly three scoped JSON files |

---

## 3. Acceptance criteria — content lens

AC-1 deep-equals loaded JSON against `REQUIRED_TEMPLATES`, so passing tests imply exact field match. Independent pedagogy spot-check:

| Skill | Ticket shapes covered | Bounds / guarantees |
|-------|----------------------|---------------------|
| `div_facts` | basic, missing divisor/dividend, same-number, quotient-first, fact family, groups word problem, tens variant | Exact division via `% == 0`; non-zero divisors; integer quotients |
| `fractions_int` | how-many-ths, missing numerator, of-set (+ rev), add-like (+ q-first), simplify, unit parts | Integer answers; no decimal glyphs (AC-7); divisibility constraints on every `/` |
| `multi_digit_order_ops` | no-paren vs paren precedence pair, add/sub, two-digit×one-digit, ×−, word sum, diff-first | AC-8 distinct answers; AC-9 wrong-order `(a+b)*c` on `no_paren`; ≤ 1000 |

| AC | Verdict |
|----|---------|
| AC-1 | **met** |
| AC-2 | **met** |
| AC-3 | **met** |
| AC-4 | **met** |
| AC-5 | **met** — structural + 1000× sweep |
| AC-6 | **met** |
| AC-7 | **met** |
| AC-8 | **met** |
| AC-9 | **met** — `multi_digit_order_ops_no_paren` declares `(a + b) * c` |
| AC-10 | **met** — word problems flagged; ≤160 chars |
| AC-11 | **met** — ladder headroom |
| AC-12 | **met** — 24 hand-pinned spot checks |
| AC-13 | **met** — 6 / 8 / 8 distinct skeletons per skill |
| AC-14 | **met** — seeds 1…200 headroom |
| AC-15 | **met** — ≥3 distinct distractor exprs per template |

**15 / 15 met.**

---

## 4. Definition of Done

| Item | Verdict |
|------|---------|
| Every AC has passing `spec(T-016:AC-n)` | **met** — spec-lint green |
| `run-local-gates.sh` green | **met** — per implementation report; g35 re-run this review |
| `spec-lint.sh tickets/T-016.md` green | **met** — verified |
| ≥8 templates, ≥5 skeletons per skill | **met** |
| Integer fraction answers; no decimals | **met** |
| Exact divisibility on `div_facts` | **met** |
| Files exactly `file_scopes`; no `index.ts` | **met** |

---

## 5. Iron Law — scope

**Nothing out of scope in the JSON deliverable.** Implementer's job on a frozen-contract ticket was transcription of post-dispute `REQUIRED_TEMPLATES`, not invention. The only content judgment was applying the test-agent ladder fixes — all correct and necessary.

Test-agent commit `eea35ac` and docs commits are expected swarm process, not implementer scope violations.

---

## 6. What the tests cannot prove (reviewed here)

1. **Independent pedagogical authoring** — Not expected. AC-1 verbatim match makes the test file the spec (T-006 / T-014 precedent).

2. **Wrong-operation distractor richness on `div_facts` / `fractions_int`** — Ticket Context lists patterns; frozen contract specifies nearMiss-only for those skills. See N-1.

3. **AC-12 arithmetic independence** — Literals are human-auditable; preflight validates contract self-consistency without running evaluator inside AC-12 assertions.

4. **Post-MVP template count** — Exactly 8 per skill (floor). Matches locked decision D-1.

---

## 7. What is genuinely clean

- **Ladder collision class identified, contract-amended, and JSON refreshed correctly** — the one real defect in initial `8de5d24` JSON is closed.
- **All three skill files are valid JSON** matching `REQUIRED_TEMPLATES` semantics byte-for-byte (AC-1 deep-equal).
- **AC-9 wrong-order distractor** present and pedagogically correct on `multi_digit_order_ops_no_paren`.
- **AC-8 precedence pair** (`no_paren` vs `paren`) produces distinct answers for shared `a,b,c`.
- **`times_minus` forgot-subtract distractor** (`a * b`) is a sound replacement for often-negative `a * (b - c)`.
- **`div_facts_same` constant-answer distractors** (`0`, `2`, `3`) avoid param-magnitude ladder fills.
- **Structural exact-division rule** enforced on every division pair; fractions use `% == 0` where needed.
- **No registry, no engine edits** — scope discipline matches Out of Scope.

---

## 8. Required to approve

**Nothing blocking.** Optional follow-ups (non-merge-blocking):

1. Enrich `div_facts` / `fractions_int` distractors beyond near-miss when raising the ≥8 floor toward 15–25 (N-1).
2. Drop tautological `a % a == 0` on `div_facts_same` in a future contract tidy (N-3).

---

**APPROVE_WITH_NITS**
