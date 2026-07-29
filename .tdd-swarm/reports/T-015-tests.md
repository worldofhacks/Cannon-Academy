# T-015 — Grade 2–3 templates: TEST AGENT REPORT (round 2)

| | |
| --- | --- |
| Status | `DONE` (RED) — review Critical/Important closed |
| Worktree | `.worktrees/wt-T-015` |
| Branch | `ticket/T-015-templates-g23` |
| Phase | `tests` |
| Test file | `__tests__/content/templates/g23.test.ts` |
| SHA-256 | `f941a204069afed65779e680139118f7b68a36521132b5f4f5b53efeb6ec2d04` |

---

## 1. Status

**DONE** after Composer test-design REJECT. Round-2 closes C-1 / I-1 / I-2 / I-3.

- Spec-lint **PASS** (AC-1…AC-14 + DoD-1…DoD-7)
- Suite **RED**: 47 failed \| 6 passed (53)
- Passes are intentional without JSON: authoring-contract preflight (3) + DoD-1/2/3 (3)
- Failures are missing-file assertions on the three scoped JSON paths
- Baseline outside this file: **1438 passed**

---

## 2. Review closures

| Finding | Closure | File:line (post-fix) |
| --- | --- | --- |
| **C-1** AC-11 not independent | Replaced `independentArithmetic(answerExpr, …)` with T-014-style `REQUIRED_TEMPLATES` (24) + literal `SPOT_CHECKS` (`expect(q.text).toBe(…)` / numeric answers). Preflight proves literals against real `generateQuestion`. AC-10-style ladder preflight on `REQUIRED_TEMPLATES`. | `g23.test.ts` `REQUIRED_TEMPLATES` ~99–330; `SPOT_CHECKS` ~337–377; preflight ~560–605; AC-11 ~920–955 |
| **I-1** AC-4 dead-param substring | `paramIsLive` now uses `\\b${name}\\b` on `answerExpr` and constraints. | `g23.test.ts` ~430–435 |
| **I-2** AC-3 operator allowlist | `SYMBOLIC_OPERATOR_WORDS` allowlist for comparison/place-value operator vocabulary; prose beyond it still requires `isWordProblem: true`. | `g23.test.ts` ~72–85; AC-3 ~680–705 |
| **I-3** unreachable `failures.push` | Removed; AC-11 uses `it.each(SPOT_CHECKS)` with direct `expect` literals only. | AC-11 block ~920–955 |

---

## 3. Authoring contract

Implementer copies each skill’s slice of `REQUIRED_TEMPLATES` into:

- `src/content/templates/place_value_compare.json`
- `src/content/templates/two_step_add_sub.json`
- `src/content/templates/mult_facts.json`

Do **not** create `templates/index.ts` (T-019).

`SPOT_CHECKS` pins hand-computed `(seed → text, answer)` for every required id (e.g. `2 × 6 = ?` → `12`).

---

## 4. Gates

| Gate | Result |
| --- | --- |
| `bash .tdd-swarm/spec-lint.sh tickets/T-015.md` | **PASS** |
| `npx vitest run __tests__/content/templates/g23.test.ts` | **RED** 47 failed \| 6 passed |
| Baseline `--exclude` this file | **GREEN** 1438 |
| Prettier / ESLint | **PASS** |

---

## 5. Commit

`test(T-015): hand-pinned spot checks, word-boundary params, AC-3 allowlist`
