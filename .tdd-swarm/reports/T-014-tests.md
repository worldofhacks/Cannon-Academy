# T-014 — K–2 add/sub templates — TEST AGENT REPORT

## 0. Unit assertion

| Check | Value |
| --- | --- |
| Worktree | `/Users/quietguy/Documents/Dev/Gauntlet/Math Game/.worktrees/wt-T-014` |
| `git branch --show-current` | `ticket/T-014-templates-k2-addsub` |
| `.tdd-swarm/active-ticket` | `T-014` |
| `.tdd-swarm/phase` | `tests` |

No `src/` writes. JSON files intentionally absent.

---

## 1. Status

**DONE (RED)**

Failing tests landed at `__tests__/content/templates/k2-addsub.test.ts`. Spec-lint is green for all 11 ACs and all 7 DoD items. Existing suite remains **1438 passed**. New file: **47 failed | 7 passed (54)** — failures are exclusively `missing template file: src/content/templates/*.json`.

---

## 2. What was written

| Artefact | Role |
| --- | --- |
| `__tests__/content/templates/k2-addsub.test.ts` | Full AC-1…AC-11 suite + DoD tags + authoring contract |
| `.tdd-swarm/reports/T-014-tests.md` | This report |

**Not written:** any file under `src/` (including the three JSON targets and `templates/index.ts`).

### Authoring contract

`REQUIRED_TEMPLATES` (24 templates = 8×3 skills) is embedded in the test file. Implementer copies each skill’s slice into:

- `src/content/templates/add_within_10.json`
- `src/content/templates/add_within_20.json`
- `src/content/templates/sub_within_20.json`

`SPOT_CHECKS` pins hand-computed `(seed → text, answer)` literals for every id. A preflight block (no JSON required) proves those literals match real `generateQuestion` on the contract — so the implementer is not chasing a buggy expected value.

Adversarial coverage beyond the happy path:

| Trap | Guard |
| --- | --- |
| Eight clones of one shape | AC-9 ≥5 skeletons; contract equality rejects stubs |
| Word-problem prose with flags off | AC-3 letter residue outside `{param}` tokens |
| Dead params | AC-4 |
| Colliding / copy-paste distractors | AC-7 ladder &lt; 250/1000; AC-10 textual distinctness |
| Over-tight constraints | AC-11 seeds 1…200 never `CONSTRAINTS_UNSATISFIED` |
| Creating `templates/index.ts` | DoD-7 asserts it stays absent (T-019) |

---

## 3. RED evidence

```
npx vitest run __tests__/content/templates/k2-addsub.test.ts
 Test Files  1 failed (1)
      Tests  47 failed | 7 passed (54)
```

Every content-dependent failure message:

`missing template file: src/content/templates/<skill>.json`

The 7 passes are intentional without content: authoring-contract preflight (2) + DoD-1/2/3/6/7 meta checks (5).

```
npx vitest run --exclude '__tests__/content/templates/k2-addsub.test.ts'
 Test Files  15 passed (15)
      Tests  1438 passed (1438)
```

```
bash .tdd-swarm/spec-lint.sh tickets/T-014.md
== SPEC-LINT PASS ==
```

---

## 4. AC → test mapping

| AC | What is asserted | Where |
| --- | --- | --- |
| **AC-1** | File exists; `z.array(templateSchema)` parses; ≥8 entries; deep-equals `REQUIRED_TEMPLATES` | `AC-1 — each skill file…` |
| **AC-2** | `skill` matches file; `id` prefixed `skill_`; global id uniqueness | `AC-2 — skill / id hygiene` |
| **AC-3** | `isWordProblem`/`readAloud` absent or false; no alphabetic prose outside params | `AC-3 — symbolic only` |
| **AC-4** | Every `{name}` ∈ params; unused params appear in `answerExpr` or constraints | `AC-4 — param / text consistency` |
| **AC-5** | Seeds 1…1000: success, ranges, constraints, no braces, `CHOICE_COUNT` distinct choices, correct = `evaluateNumber` | `AC-5/6/7` sweep |
| **AC-6** | Answer ∈ 0…skillMax; numeric tokens in text ∈ 0…20 | same sweep |
| **AC-7** | `describeDistractorSources` includes `'ladder'` on &lt;250/1000 samples | same sweep |
| **AC-8** | Every shipped id has a literal spot check; each `(seed, text, answer)` matches | `AC-8 — hand-computed spot checks` |
| **AC-9** | ≥5 distinct skeletons per skill | `AC-9 — shape variety` |
| **AC-10** | ≥3 distractors; pairwise distinct; none equal to `answerExpr` | `AC-10 — declared distractor hygiene` |
| **AC-11** | Seeds 1…200 never raise `CONSTRAINTS_UNSATISFIED` | `AC-11 — sampling headroom` |

DoD tags: `dod(T-014:1)`…`dod(T-014:7)`. Ticket DoD-2/3/7 could not be marked `[process]` (write guard blocks `tickets/`); nearest unit-visible readings are tagged instead. Orchestrator may reword those checkboxes later to match T-007/T-013.

---

## 5. Implementer notes

1. Copy `REQUIRED_TEMPLATES` from the test file into the three JSON arrays (filter by `skill`).
2. Do **not** create `src/content/templates/index.ts`.
3. Do **not** edit the test file (frozen after this phase).
4. Target: new suite 54/54 green; repo suite 1438 + 54.

---

## 6. Commit

`test(T-014): failing tests for K-2 add/sub templates`
