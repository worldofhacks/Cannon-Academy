# T-016 — Grade 3–5 templates — TEST AGENT REPORT

## 0. Unit assertion

| Check | Value |
| --- | --- |
| Worktree | `.worktrees/wt-T-016` |
| `git branch --show-current` | `ticket/T-016-templates-g35` |
| `.tdd-swarm/phase` | `tests` |
| `.tdd-swarm/active-ticket` | `T-016` |
| `src/` touched | **no** |

## 1. Status

**DONE (RED)**

Failing tests committed for all 15 ACs. Content JSON files are absent; every content-backed test fails on a clear `existsSync` assertion (not an import/setup crash). Spec-lint is green. Baseline suite outside this file stays at **1438 passed**.

## 2. Deliverable

| Path | Role |
| --- | --- |
| `__tests__/content/templates/g35.test.ts` | Frozen RED suite (26 tests) |

Files under test (not created):

- `src/content/templates/div_facts.json`
- `src/content/templates/fractions_int.json`
- `src/content/templates/multi_digit_order_ops.json`

## 3. Gates

| Gate | Result |
| --- | --- |
| `bash .tdd-swarm/spec-lint.sh tickets/T-016.md` | **PASS** (AC-1..AC-15 + DoD-1..DoD-7) |
| `npx vitest run __tests__/content/templates/g35.test.ts` | **RED** — 23 failed \| 3 passed (26) |
| Existing suite excluding this file | **1438 passed** (15 files) |
| `prettier --check` / `eslint` on the new file | **PASS** |

### RED failure summary

23 failures, all content-missing:

- `div_facts.json is missing from src/content/templates/` (majority)
- `fractions_int.json is missing…`
- `multi_digit_order_ops.json is missing…`
- DoD-7: `div_facts.json is in file_scopes` (same absence)

3 intentional greens (process meta only): `dod(T-016:1)`, `dod(T-016:2)`, `dod(T-016:3)`.

## 4. AC → test mapping

| AC | Test name (tag) | What it locks |
| --- | --- | --- |
| AC-1 | `spec(T-016:AC-1)` ×3 (`it.each` per skill) | `z.array(templateSchema)` parse + length ≥ 8 |
| AC-2 | `spec(T-016:AC-2)` | `skill` matches file; `id` prefix; global uniqueness |
| AC-3 | `spec(T-016:AC-3)` | `{token}` ↔ params; no dead params |
| AC-4 | `spec(T-016:AC-4)` | 1..1000 sweep: ranges, constraints, render, 4 distinct choices, `evaluateNumber` match |
| AC-5 | `spec(T-016:AC-5)` | `div_facts`: no `DIVISION_BY_ZERO`; integer answers |
| AC-6 | `spec(T-016:AC-6)` | answers + numeric text tokens ∈ `[0, 1000]`; `fractions_int` integer |
| AC-7 | `spec(T-016:AC-7)` | `fractions_int`: no `.` in text or choice labels |
| AC-8 | `spec(T-016:AC-8)` | `+×` no-paren + parenthesised addition; same `a,b,c` → different answers |
| AC-9 | `spec(T-016:AC-9)` | no-paren precedence template declares wrong-order distractor |
| AC-10 | `spec(T-016:AC-10)` | prose ⇒ `isWordProblem`; WP ≤160 chars and ends with `?` |
| AC-11 | `spec(T-016:AC-11)` | `describeDistractorSources` `'ladder'` samples < 250/1000 |
| AC-12 | `spec(T-016:AC-12)` | seed 17 spot check via hand render + `independentArithmetic` (not `evaluateNumber`) |
| AC-13 | `spec(T-016:AC-13)` ×3 | ≥5 distinct `#` skeletons per skill |
| AC-14 | `spec(T-016:AC-14)` | seeds 1..200: no `CONSTRAINTS_UNSATISFIED` |
| AC-15 | `spec(T-016:AC-15)` | ≥3 distractors; ≠ `answerExpr`; pairwise unique |

### DoD tags

| DoD | Tag | Notes |
| --- | --- | --- |
| 1 | `dod(T-016:1)` | Every ticket AC has a `spec` tag |
| 2 | `dod(T-016:2)` | Local gates still wired; no TODO/FIXME/focused tests |
| 3 | `dod(T-016:3)` | Numbered dod tags cover all seven items |
| 4 | `dod(T-016:4)` | ≥8 templates + ≥5 skeletons (content) |
| 5 | `dod(T-016:5)` | `fractions_int` whole answers, no decimals |
| 6 | `dod(T-016:6)` | `div_facts` constraints + non-zero divisor sampling |
| 7 | `dod(T-016:7)` | Three scoped JSON files only; no `templates/index.ts` |

## 5. Commit

`test(T-016): failing tests for grade 3-5 templates`
