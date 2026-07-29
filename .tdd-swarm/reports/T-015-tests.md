# T-015 — Grade 2–3 templates: TEST AGENT REPORT

| | |
| --- | --- |
| Status | `DONE` (RED) |
| Worktree | `.worktrees/wt-T-015` |
| Branch | `ticket/T-015-templates-g23` |
| Phase | `tests` |
| Test file | `__tests__/content/templates/g23.test.ts` |
| SHA-256 | `bce3cdd128eab406aca4b5fba6f101c0e7a2de0d804c67a20cc84a1efb8eee5b` |

---

## 1. Status

**DONE** — failing suite committed. Content JSON files are absent (as required); every content-backed AC fails on missing files via `expect(existsSync)`, not setup crashes. Meta DoD 1–3 pass. Spec-lint green. Baseline suite outside this file stays green (1,438 passed).

---

## 2. Gates

| Gate | Result |
| --- | --- |
| `bash .tdd-swarm/spec-lint.sh tickets/T-015.md` | **PASS** — AC-1…AC-14 + DoD-1…DoD-7 |
| `npx vitest run __tests__/content/templates/g23.test.ts` | **RED** — 22 failed \| 3 passed (25) |
| Existing suite (`--exclude` this file) | **GREEN** — 15 files, 1,438 passed |
| Prettier / ESLint on the new file | **PASS** |

### Failure summary (right reasons)

All 22 failures are assertion failures that the three scoped JSON files are missing from `src/content/templates/`:

- `place_value_compare.json`
- `two_step_add_sub.json`
- `mult_facts.json`

Passing tests: `dod(T-015:1)`, `dod(T-015:2)`, `dod(T-015:3)` (meta / control-surface checks that do not load content).

---

## 3. AC → test mapping

| AC | What it pins | Test |
| --- | --- | --- |
| **AC-1** | `z.array(templateSchema)` parse; ≥8 per file | `it.each(SKILLS)` load + length |
| **AC-2** | `skill` matches file; id prefix `{skill}_`; global unique ids | one cross-file inspect |
| **AC-3** | alphabetic prose ⇒ `isWordProblem`; word problems ⇒ catalog `symbolicOnly === false` | prose + `getSkill` |
| **AC-4** | every `{token}` is a param; no dead params | bi-consistency walk |
| **AC-5** | seeds 1…1000: ranges, constraints, render, 4 distinct choices, answer = `evaluateNumber` | golden sweep |
| **AC-6** | non-neg ints; PV ≤1000; two_step/mult ≤100 (answers + text tokens) | bound sweep |
| **AC-7** | `two_step_add_sub` first-op intermediate ≥0 over 1,000 samples | `firstAddSubIntermediate` |
| **AC-8** | mult factors in `[0,10]`; text uses `×`, never `*` or lowercase `x` ops | glyph + factor scan |
| **AC-9** | word problems ≤140 chars, end with `?`, contain a numeral | readability sweep |
| **AC-10** | `describeDistractorSources` ladder samples `< 250` / 1000 | ladder headroom |
| **AC-11** | fixed seed: hand-rendered text + `independentArithmetic` answer (not `evaluateNumber`) | spot checks |
| **AC-12** | ≥5 skeletons/skill; ≥1 word + ≥1 symbolic per skill | skeleton + mix |
| **AC-13** | seeds 1…200 never `CONSTRAINTS_UNSATISFIED` | headroom sweep |
| **AC-14** | ≥3 distractors; none = `answerExpr` or sibling | distractor hygiene |

DoD tags: `dod(T-015:1)`…`dod(T-015:7)` cover AC tagging, gate wiring, skeleton/mix floors, two-step non-negativity, 1,000-gen survival, and scoped files (no `templates/index.ts`).

---

## 4. Notes for the implementer

- Author exactly the three JSON files in `file_scopes`. Do **not** create `templates/index.ts` (T-019).
- Floor: ≥8 templates/skill, ≥5 distinct text skeletons, and a symbolic + word-problem mix in each file.
- Word problems: `isWordProblem: true`, ≤140 chars after render, end with `?`, naval nouns OK.
- `two_step_add_sub`: constrain so the first `+`/`−` intermediate and the final answer stay ≥0; display ≤100.
- `mult_facts`: factors `0…10`, display `×` (answerExpr still uses `*`).
- Declared distractors must keep ladder fill under 250/1000.

---

## 5. Commit

`test(T-015): failing tests for grade 2-3 templates`
