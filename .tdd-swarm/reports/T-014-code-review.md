# T-014 — Code Review (independent)

**Ticket:** T-014 — Question templates — K–2 addition and subtraction (symbolic only)  
**Worktree:** `/Users/quietguy/Documents/Dev/Gauntlet/Math Game/.worktrees/wt-T-014`  
**Branch:** `ticket/T-014-templates-k2-addsub`  
**Commits under review:** `31cb5ba` (initial JSON), `ab41906` (near_doubles AC-7 fix), `f0496f2` (prettier on frozen suite — orchestrator, not content)  
**Frozen suite:** `__tests__/content/templates/k2-addsub.test.ts` — SHA-256 `9c239b355136e2b3b49dc94751a875a3fbbf60dbd0884acccb2a2a497f44a92c`  
**Reviewer:** independent senior review — did not write this code  
**Date:** 2026-07-28

Ground truth accepted without re-confirmation: all local gates green, vitest **1493/1493**, k2-addsub **55/55**, spec-lint AC-1…AC-11 + DoD-1…7 mapped. This review covers what the frozen suite cannot fully judge: pedagogy fidelity to the ticket, diff scope, content quality beyond schema, and process artifacts.

---

## Verdict

**APPROVE_WITH_NITS**

**One-line summary:** Shipped JSON is a correct, gate-green transcription of the frozen `REQUIRED_TEMPLATES` contract with the near_doubles AC-7 collision fixed; no blocking defects — only stale implementation-report status and homogeneous near-miss-only distractors versus PLAN.md’s aspirational wrong-operation guidance.

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
| N-1 | `.tdd-swarm/reports/T-014-implementation.md` | **Report status is stale.** Header still reads `BLOCKED (format gate — frozen suite prettier debt)` and cites frozen hash `63628812…`, but `f0496f2` formatted the suite, hash is now `9c239b355136…`, and `run-local-gates.sh` is fully green. Content review is not blocked; docs agent should refresh the report before merge bookkeeping. |
| N-2 | All 24 templates except `sub_within_20_doubles` | **Distractor strategy is homogeneous.** Every non-constant template uses the same near-miss triple (`answer±1`, `answer+2`, parenthesized via `nearMiss`). Ticket Context lists wrong-operation decoys (`a - b` on addition, guarded) as patterns to “draw from”; PLAN.md §The duel loop names “right-operation-wrong-number”. None appear. AC-7/AC-10 pass; T-005’s ladder covers gaps. Acceptable for MVP because the frozen contract specifies nearMiss-only — flag for post-MVP content enrichment, not a merge blocker. |
| N-3 | `add_within_10_basic` / `add_within_10_near_doubles` (and 20 analogues) | **Shared text skeleton `{a} + {b} = ?`.** Six distinct skeletons per add skill still exceed the ≥5 floor (AC-9). Pedagogically intentional — near-doubles differs by constraint sampling, not surface form. Harmless. |
| N-4 | `sub_within_20_how_many_more`, `sub_within_20_basic`, `sub_within_20_doubles` | **Three templates collapse to skeleton `# - # = ?`.** Still six distinct skeletons for `sub_within_20`; “how many more” is correctly symbolic (`{c} - {a} = ?`) per ticket. No action. |

---

## 1. Diff vs empty baseline

JSON files did not exist before `f509c7c` (test commit). Content landed in `31cb5ba`:

| File | Templates | Lines added |
|------|-----------|-------------|
| `add_within_10.json` | 8 | 97 |
| `add_within_20.json` | 8 | 97 |
| `sub_within_20.json` | 8 | 96 |

`ab41906` changed **two distractor expressions** only — third distractor on `add_within_10_near_doubles` and `add_within_20_near_doubles` from `a + a` → `a + b + 2`. `sub_within_20.json` unchanged (already matched contract).

That fix is **correct and necessary**: under constraint `b == a + 1`, `a + a` evaluates identically to `a + b - 1`, forcing ladder fill on every draw (1000/1000 before fix; 0/1000 after — measured in test-agent report).

No `templates/index.ts`. No schema/generator/distractor edits. File scope honored for deliverable content.

---

## 2. Acceptance criteria — content lens

The suite deep-equals loaded JSON against `REQUIRED_TEMPLATES` (AC-1 second test), so passing tests imply exact field match. Independent spot-check of pedagogy rules from the ticket:

| Rule | `add_within_10` | `add_within_20` | `sub_within_20` |
|------|-----------------|-----------------|-----------------|
| Answer range | sum ≤ 10 via `a + b <= 10`, missing-addend constraints | sum ≤ 20 | difference ≥ 0 via `a >= b`, `c >= a`, `b + c <= 20`, etc. |
| Non-negative operands | params `[0, …]` throughout | same | same |
| Symbolic only | no `isWordProblem`/`readAloud`; no alphabetic residue | same | same |
| ≥8 templates / skill | 8 | 8 | 8 |
| ≥5 skeletons / skill | 6 | 6 | 6 |
| Id prefix hygiene | `add_within_10_*` | `add_within_20_*` | `sub_within_20_*` |

**Shape coverage vs ticket Context:** direct add/sub, missing addend/first, missing subtrahend/minuend, doubles, near-doubles, make-ten, three-term, sum-first/diff-first, how-many-more symbolic, minus-zero, two-step subtract — all present. No word-problem prose.

| AC | Verdict | Notes |
|----|---------|-------|
| AC-1 | **met** | Parse + ≥8; deep-equals `REQUIRED_TEMPLATES` (24 entries) |
| AC-2 | **met** | Skill/file match, prefixed ids, global uniqueness |
| AC-3 | **met** | Symbolic-only flags and letter-residue scan |
| AC-4 | **met** | Param tokens ↔ params; no dead keys |
| AC-5 | **met** | 1000× golden sweep per template |
| AC-6 | **met** | Curriculum bounds on answers and rendered numerics |
| AC-7 | **met** | Ladder &lt; 250/1000 (near_doubles fix verified) |
| AC-8 | **met** | 24 hand-pinned spot checks |
| AC-9 | **met** | ≥5 skeletons per skill |
| AC-10 | **met** | ≥3 distinct distractor exprs, none equal to answerExpr |
| AC-11 | **met** | Seeds 1…200 never `CONSTRAINTS_UNSATISFIED` |

**11 / 11 met.**

---

## 3. Definition of Done

| Item | Verdict |
|------|---------|
| Every AC has passing `spec(T-014:AC-n)` | **met** — spec-lint green |
| `run-local-gates.sh` green | **met** — verified this review |
| `spec-lint.sh tickets/T-014.md` green | **met** |
| ≥8 templates, ≥5 skeletons per skill | **met** — 8 and 6 respectively |
| Symbolic-only; bounded non-negative answers | **met** |
| 1000-seed survival, four distinct choices | **met** — AC-5 sweep |
| Files changed exactly `file_scopes` (no `index.ts`) | **met** for JSON deliverable |

DoD-2/3 are process checks on script existence; DoD-7 confirms no registry file.

---

## 4. Iron Law — scope

**Nothing out of scope in the JSON deliverable.** The implementer’s job on a frozen-contract content ticket was transcription, not invention. The only content judgment exercised was applying the test-dispute fix (`a + a` → `a + b + 2`) — correct.

Orchestrator commits outside `file_scopes` (test prettier, ticket status, reports) are expected swarm process, not implementer scope violations.

---

## 5. What the tests cannot prove (reviewed here)

1. **Independent pedagogical authoring** — Not expected. AC-1 deep-equals makes the test file the spec (T-006 precedent; acknowledged in test-design review I-1).

2. **Wrong-operation distractor richness** — PLAN.md asks for it; frozen contract does not. See N-2.

3. **AC-8 arithmetic independence** — Literals are pinned correctly at runtime; preflight uses generator to validate contract self-consistency (test-design I-2). Spot checks like `4 + 5 = 9` are human-auditable; no evidence of evaluator/template joint bug.

4. **Post-MVP template count** — Exactly 8 per skill (floor), not 15–25. Matches locked decision D-1.

---

## 6. What is genuinely clean

- **Near_doubles collision class identified and fixed correctly** before merge — the one real content defect in the initial JSON.
- **All three skill files are valid, prettier-clean JSON** matching the frozen authoring contract byte-for-byte on semantics.
- **Pedagogy table constraints hold** on every template shape; subtraction never goes negative; K–2 symbolic-only rule is airtight.
- **Six distinct skeletons per skill** cover the ticket’s enumerated forms without lazy clone-stubs.
- **`sub_within_20_doubles`** constant `answerExpr: "0"` with literal `[1,2,3]` distractors is a sound special case for `a - a`.
- **No registry, no engine edits, no word problems** — scope discipline matches Out of Scope.

---

## 7. Required to approve

**Nothing blocking.** Optional follow-ups (non-merge-blocking):

1. Refresh `T-014-implementation.md` to **DONE / gates green** and publish hash `9c239b355136…` (N-1).
2. Consider wrong-operation distractors in a future content pass when the ≥8 floor is raised toward 15–25 (N-2).

---

**APPROVE_WITH_NITS**
