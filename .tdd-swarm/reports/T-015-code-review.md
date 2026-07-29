# T-015 — Senior Code Review

## Summary

| Field | Value |
| --- | --- |
| **Verdict** | **APPROVE_WITH_NITS** |
| **Branch** | `ticket/T-015-templates-g23` |
| **Feat commit** | `30d2f83` — `feat(T-015): grade 2-3 templates (≥8 per skill)` |
| **Reviewer scope** | `src/content/templates/{place_value_compare,two_step_add_sub,mult_facts}.json` |
| **Frozen suite** | `__tests__/content/templates/g23.test.ts` @ SHA-256 `f941a204069afed65779e680139118f7b68a36521132b5f4f5b53efeb6ec2d04` (unchanged) |
| **Gate re-run** | `g23.test.ts` **53/53 PASS** (reviewer-local) |

**One-liner:** Shipped JSON is a byte-for-byte authoring contract match with all AC/DoD gates green; only non-blocking nits on distractor pedagogy vs ticket Context guidance.

---

## Checklist (requested confirmations)

| Check | Result | Evidence |
| --- | --- | --- |
| Exact `REQUIRED_TEMPLATES` match | **PASS** | Manual field-by-field diff of all 24 templates vs `g23.test.ts:99–328`; AC-1 deep-equals test (`619–629`) green |
| ≥8 templates / skill | **PASS** | 8 + 8 + 8 = 24 |
| Word-problem flags | **PASS** | AC-3 green: prose beyond `SYMBOLIC_OPERATOR_WORDS` → `isWordProblem: true`; catalog `symbolicOnly === false` for flagged templates |
| Two-step intermediate rules | **PASS** | AC-7 + DoD-5 green; every `two_step_add_sub` template constrains first-op intermediate ≥ 0 (see below) |
| `mult_facts` × glyph | **PASS** | AC-8 green: display `text` uses `×` only; `answerExpr` / distractors use `*`; no lowercase `x` operator |
| No `templates/index.ts` | **PASS** | Absent from worktree; commit touches only scoped JSON + report |

---

## Contract fidelity (AC-1)

All three JSON files are a **deep-equal** copy of the frozen suite’s `REQUIRED_TEMPLATES` after `templateSchema.parse`:

| File | Templates | Word / symbolic | Distinct skeletons (AC-12) |
| --- | ---: | --- | ---: |
| `place_value_compare.json` | 8 | 5 / 3 | 8 |
| `two_step_add_sub.json` | 8 | 1 / 7 | 8 |
| `mult_facts.json` | 8 | 2 / 6 | 7 (`basic` + `commute` share `# × # = ?`) |
| **Total** | **24** | — | all ≥ 5 |

No extra keys, no missing `isWordProblem` omissions that violate schema (symbolic templates correctly omit or set `false`).

---

## Word-problem gating (AC-3, AC-9, AC-12)

**Forward gate:** Templates with naval / instructional prose (`ships_more`, `word_hold`, crate/row word problems, digit-value prompts) carry `isWordProblem: true`.

**Symbolic allowlist:** Place-value comparison / rounding / difference shapes (`rounded…ten`, `Which is greater…`, `{a} is ? more than {b}`) remain `isWordProblem: false` via `SYMBOLIC_OPERATOR_WORDS` — aligned with ticket Context named shapes and test-design review I-2 closure.

**Mix per skill:** Each file has ≥1 word and ≥1 symbolic template (AC-12).

**Readability:** All `isWordProblem: true` templates satisfy AC-9 over the 1,000-seed sweep (≤140 chars, trailing `?`, substituted numerals).

---

## Two-step intermediate guard (AC-7) — manual constraint audit

| Template id | First-op intermediate (test helper) | Guarding constraints |
| --- | --- | --- |
| `plus_minus` | `a + b` | `a + b <= 100` |
| `minus_plus` | `a - b` | `a >= b` |
| `plus_plus` | `a + b` | `a + b <= 100` |
| `paren_minus` | `a + b` | `a + b <= 100`, `a + b > c` |
| `missing_last` | `a + b` | `a + b <= 100`, `a + b > c` |
| `word_hold` | `a + b` | same |
| `diff_then_sub` | `a - b` | `a >= b`, `a - b >= c` |
| `start_missing` | `d + c` | `d + c <= 100` |

Final answers are kept in `1 … 100` (stricter than ticket’s `>= 0` floor — acceptable). No template can pass through a negative intermediate under the suite’s `firstAddSubIntermediate` model.

---

## Multiplication (AC-8)

- Display strings use `×` (including word problems: `{a} crates × {b} balls…`).
- Evaluator grammar correctly uses `*` in `answerExpr`, `constraints`, and `distractors`.
- Sampled factors stay within `[0, 10]`; param ranges mostly `[2, 10]` with `{a} × 10` allowing `a ∈ [1, 10]`.

---

## Scope & hygiene

- **File scope:** Commit `30d2f83` adds only the three scoped JSON files plus `.tdd-swarm/reports/T-015-implementation.md` (swarm artifact — acceptable).
- **`index.ts`:** Not created (DoD + T-019 deferral respected).
- **Frozen suite:** Hash unchanged; implementer did not mutate tests.

---

## Nits (non-blocking)

### N-1 — Uniform `nearMiss` distractors vs ticket Context pedagogy

Every template uses the same `+1 / -1 / +2` triple on `answerExpr`. Ticket Context calls for richer patterns (off-by-ten, wrong-operation, adjacent-fact, transposed-digit near-misses for place value). **AC-14 and AC-10 are satisfied**; this is a post-MVP content-quality gap, not a contract breach.

### N-2 — `place_value_compare_which_greater` distractor shape

Ticket Context suggests loser + near-miss distractors for compare shapes; implementation uses winner ± small deltas. Pedagogically weaker for “which is greater” but **AC-5 distinct numeric choices** hold.

### N-3 — `mult_facts` factor coverage

Authoring table says factors `0 … 10`; shipped ranges emphasize `2 … 10` (plus `× 10` with `a ≥ 1`). **AC-8** only bounds rendered factors to `[0, 10]`, not full curriculum coverage — fine for merge, note for future content expansion.

### N-4 — Sparse word-problem mix in `two_step_add_sub`

1 word / 7 symbolic meets AC-12 floor; more naval word shapes would improve band fidelity later.

---

## Blockers

**None.** All 14 ACs and 7 DoD items are covered by passing tests; JSON matches the frozen authoring contract exactly.

---

## Verdict rationale

**APPROVE_WITH_NITS** — Implementation is contract-complete and test-green. Residual items are curriculum/pedagogy enhancements explicitly outside AC text, suitable for follow-up content passes (T-016+ / post-MVP armory expansion), not merge blockers.
