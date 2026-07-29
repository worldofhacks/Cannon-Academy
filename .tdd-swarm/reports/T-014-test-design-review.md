# T-014 — Test Design Review (Composer)

**Reviewer:** Composer (test-design review subagent)  
**Worktree:** `/Users/quietguy/Documents/Dev/Gauntlet/Math Game/.worktrees/wt-T-014`  
**Suite:** `__tests__/content/templates/k2-addsub.test.ts` (commit `f509c7c`)  
**Ticket:** `tickets/T-014.md`  
**Baseline:** spec-lint PASS (11 ACs); vitest **47 failed / 7 passed** (clean RED — missing JSON); repo outside file **1438 green**

---

## Verdict

**ACCEPT_WITH_NITS**

**One-line summary:** All 11 ACs are encoded with strong adversarial guards and a defensible content-as-data contract, but AC-1 deep-freezes 24 exact templates beyond the ticket’s “≥8” wording, AC-8 independence is structurally correct yet procedurally weakened by generator-backed preflight, and the embedded `REQUIRED_TEMPLATES` contract lacks an AC-7 preflight before freeze.

---

## Critical

*(none — no missing AC coverage, no loophole that lets clearly invalid content pass while green)*

---

## Important

| # | File:line | Issue |
|---|-----------|-------|
| I-1 | `k2-addsub.test.ts:405–415` | **AC-1 over-freezes content.** Ticket AC-1 requires only schema parse + **≥8** entries per file. The second AC-1 test deep-equals the loaded arrays against `REQUIRED_TEMPLATES` (exactly 24 ids, exact fields). That is acceptable for a hand-authored *data* ticket (T-006 precedent) but **exceeds the ticket’s literal AC-1 text** and forbids a 9th valid template or any field drift (ranges, distractor strings) even when pedagogically sound. Freeze is intentional only if orchestrator treats the test file as the authoring spec — flag for traceability. |
| I-2 | `k2-addsub.test.ts:363–377`, `:628–651` | **AC-8 structural vs procedural independence.** Assertions correctly compare `generateQuestion` output to **literal** `SPOT_CHECKS` (never `evaluateNumber`). However, the preflight block proves those literals by running `generateQuestion(REQUIRED_TEMPLATES, seed)` and expecting equality — strongly suggesting literals were generator-derived at authoring time. That weakens AC-8’s stated goal (“pin arithmetic independently of the evaluator”) for the evaluator+template-consistently-wrong failure mode. Mitigation: spot-check arithmetic was manually verified for at least a sample of seeds before freeze (e.g. `4 + 5 = 9` at seed 14 is human-auditable). |
| I-3 | `k2-addsub.test.ts:359–392` | **Missing AC-7 preflight on `REQUIRED_TEMPLATES`.** Preflight covers AC-8 literals and AC-11 headroom only. If any contract template exceeds the `<250/1000` ladder threshold, the implementer copies JSON from the contract and still fails AC-7 — a late surprise on a frozen test. Recommend adding AC-7 sweep to preflight *or* documenting that contract was manually verified (not done in this review pass — shell AC-7 probe blocked by phase guard). |
| I-4 | `k2-addsub.test.ts:405–415`, `:657–667` | **AC-9 largely redundant.** Once deep-equals passes, skeleton variety is fixed at six per add skill and eight for sub — AC-9 adds little beyond the authoring contract. Harmless, not a gap. |

---

## Per-AC Review

### AC-1 — Schema parse, ≥8 templates

| Dimension | Assessment |
|-----------|------------|
| Encoded? | **Yes** — per-file parse + length ≥8 (`396–402`); plus authoring-contract deep-equals (`405–415`). |
| Loopholes? | Deep-equals closes “eight lazy stubs that parse” — good adversarial guard. Loophole in the other direction: **valid extra templates are rejected** (stricter than ticket). |
| Behavior vs prescription? | **Over-prescriptive** on the second test; **behavior-aligned** on the first. For T-014 as first template content, over-prescription is defensible if test = spec. |

### AC-2 — Skill / id hygiene

| Dimension | Assessment |
|-----------|------------|
| Encoded? | **Yes** — file/skill match, `skill_` prefix, global uniqueness (`420–436`). |
| Loopholes? | None material. |
| Behavior vs prescription? | Behavior-only; matches ticket. |

### AC-3 — Symbolic only

| Dimension | Assessment |
|-----------|------------|
| Encoded? | **Yes** — flags absent/false (`442–446`); alphabetic residue scan (`449–456`). |
| Loopholes? | **Prose in `readAloud` string** with `readAloud: false` would pass (ticket only gates the flag). Unicode homoglyphs outside `[A-Za-z]` could bypass letter scan — edge case, low risk for K-2 MVP. |
| Behavior vs prescription? | Letter-residue check is a **smart behavioral extension** beyond flags alone; blocks “Tom has {a} apples” with `isWordProblem: false`. Word boundaries N/A here (whole-text strip). |

### AC-4 — Param / text consistency, no dead params

| Dimension | Assessment |
|-----------|------------|
| Encoded? | **Yes** — `{name}` ∈ `params` (`463–472`); unused keys must appear in `answerExpr` or constraints (`475–488`). |
| Loopholes? | **Word boundaries correct:** `\b${key}\b` prevents `a` matching inside `ba` / `abc`. Does not require `answerExpr` identifiers ⊆ `params` (not in ticket). |
| Behavior vs prescription? | Matches ticket; boundary regex is appropriate. |

### AC-5 — 1,000-sample golden sweep

| Dimension | Assessment |
|-----------|------------|
| Encoded? | **Yes** — seeds 1…1000: success, in-range params, constraints true, no braces, 4 choices, distinct values, correct = `evaluateNumber` (`495–559`). |
| Loopholes? | None material. Uses real `generateQuestion` + `evaluateNumber` — correct integration depth. |
| Behavior vs prescription? | Behavior-only; ARCHITECTURE §9.1 aligned. |

### AC-6 — Curriculum bounds

| Dimension | Assessment |
|-----------|------------|
| Encoded? | **Yes** — answer ∈ `[0, answerMax]` per skill; rendered numeric tokens ∈ `[0, 20]` via `/\d+/g` (`562–596`). |
| Loopholes? | `\d+` matches multi-digit literals correctly; literal `10` in `{a} + ? = 10` is counted and passes. |
| Behavior vs prescription? | Matches ticket. |

### AC-7 — Distractor ladder rate

| Dimension | Assessment |
|-----------|------------|
| Encoded? | **Yes** — `describeDistractorSources` includes `'ladder'` on **< 250** of 1000 (`599–622`). Threshold matches ticket (“fewer than 250”). |
| Loopholes? | None in test logic. **Contract not preflighted** (see I-3). |
| Behavior vs prescription? | Behavior-only; uses T-005 AC-14 export as specified. |

### AC-8 — Hand-pinned spot checks

| Dimension | Assessment |
|-----------|------------|
| Encoded? | **Yes** — one literal `(seed, text, answer)` per required id; loaded JSON compared to literals, not `evaluateNumber` (`628–651`). |
| Loopholes? | **Procedural circularity** via preflight (see I-2). At runtime, assertions are independent of evaluator. Id set forced to match `REQUIRED_TEMPLATES` exactly (`629–633`). |
| Behavior vs prescription? | Correct structure for AC-8; independence claim depends on authoring discipline. |

### AC-9 — ≥5 distinct skeletons per skill

| Dimension | Assessment |
|-----------|------------|
| Encoded? | **Yes** — `skeletonOf` replaces `{…}` with `#`; count ≥5 per file (`657–667`). |
| Loopholes? | Deep-equals already fixes skeletons; AC-9 still catches future loosening of AC-1. |
| Behavior vs prescription? | Behavior-only; `#` substitution matches ticket. Contract has 6 distinct add skeletons, 8 sub. |

### AC-10 — Declared distractor hygiene

| Dimension | Assessment |
|-----------|------------|
| Encoded? | **Yes** — ≥3 distractors, pairwise textual distinct, none equal to `answerExpr` (`672–693`). |
| Loopholes? | Semantic duplicates (e.g. `a+b` vs `b+a`) not checked — not required by ticket. |
| Behavior vs prescription? | Textual checks match ticket. |

### AC-11 — Sampling headroom

| Dimension | Assessment |
|-----------|------------|
| Encoded? | **Yes** — seeds 1…200 never throw `CONSTRAINTS_UNSATISFIED` (`698–722`); preflight on contract (`379–391`). |
| Loopholes? | Only asserts that specific error code, not silent over-rejection — adequate given engine API. |
| Behavior vs prescription? | Matches ticket. |

---

## Cross-cutting observations

**Authoring contract model.** Embedding `REQUIRED_TEMPLATES` + `SPOT_CHECKS` in the test file mirrors T-006’s “tests are the catalog spec” pattern. For a wave-5 content ticket with no JSON yet, this is a reasonable immovable contract — provided stakeholders accept that **the test file, not AC-1 alone, is the content spec**.

**RED hygiene.** Seven passes without JSON (preflight + DoD meta) is correct. Failures are uniformly `missing template file` — no false greens on content.

**DoD tags.** `dod(T-014:2)` / `dod(T-014:3)` assert script file existence (process theater); acceptable given ticket write-guard on `[process]` markers. `dod(T-014:6)` meta-checks source contains `seed <= 1000` — weak but tagged.

**Performance.** Single combined 1,000×N template sweep for AC-5/6/7 will be slow but acceptable for 24 templates (~24k generations); not a freeze blocker.

---

## Recommendation

**Freeze the suite** with orchestrator acknowledgment of I-1 (test-as-spec vs ticket AC-1 wording) and I-3 (AC-7 contract verification). Optional follow-up before implement phase: add AC-7 to the preflight `describe` block so the contract self-validates without JSON files.

---

## Traceability

| AC | `spec(T-014:AC-n)` present | Behavioral assertion |
|----|----------------------------|----------------------|
| AC-1 | ✓ | ✓ |
| AC-2 | ✓ | ✓ |
| AC-3 | ✓ | ✓ |
| AC-4 | ✓ | ✓ |
| AC-5 | ✓ | ✓ |
| AC-6 | ✓ | ✓ |
| AC-7 | ✓ | ✓ |
| AC-8 | ✓ | ✓ |
| AC-9 | ✓ | ✓ |
| AC-10 | ✓ | ✓ |
| AC-11 | ✓ | ✓ |
