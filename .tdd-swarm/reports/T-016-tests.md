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

**DONE (RED)** — review round 2 fixes applied.

Failing tests remain for missing content JSON. Spec-lint PASS. Baseline outside this file **1438 passed**. Suite: **49 failed \| 6 passed** (55) — the 6 greens are authoring-contract preflight (3) + DoD meta (1–3).

## 2. Deliverable

| Path | Role |
| --- | --- |
| `__tests__/content/templates/g35.test.ts` | Frozen RED suite |
| Commit | `test(T-016): close AC-12 independence, dead-param, div constraints` |

## 3. Review closures (Composer REJECT → fixed)

### C-1 — AC-12 independence

**Closed** at `g35.test.ts:66–337` (REQUIRED_TEMPLATES + SPOT_CHECKS), `883–911` (AC-12 assertions).

- Removed `independentArithmetic` / template-derived expectations.
- Added T-014-style `REQUIRED_TEMPLATES` (8×3) and literal `SPOT_CHECKS` with concrete `text` / `answer` per id.
- AC-12 now does `expect(question.text).toBe(text)` and `expect(…).toBe(answer)` from the table.
- Preflight (`506–540`) proves literals match `generateQuestion` on REQUIRED rows without loading JSON.

### I-1 — AC-3 dead-param substring bypass

**Closed** at `g35.test.ts:380–385`.

```typescript
const word = new RegExp(`\\b${name}\\b`);
if (word.test(template.answerExpr)) return true;
return (template.constraints ?? []).some((constraint) => word.test(constraint));
```

Dead param `a` no longer passes via constraint `ab != 0`.

### I-2 — div_facts structural exact-divisibility

**Closed** at `g35.test.ts:432–495` (`assertDeclaredDivConstraints`), wired into:

- AC-5 structural test — `676–679`
- AC-5 outcome sweep retained — `682+`
- DoD-6 — `1050–1058`
- Preflight on REQUIRED div_facts — `517–521`

For every `ident / ident` pair in `answerExpr` and every `{a} ÷ {b}` pair in text, the template must declare `dividend % divisor == 0` and `divisor != 0` (or `> 0`). Degenerate single-value ranges with only `b != 0` now fail.

## 4. Gates

| Gate | Result |
| --- | --- |
| `bash .tdd-swarm/spec-lint.sh tickets/T-016.md` | **PASS** |
| `npx vitest run __tests__/content/templates/g35.test.ts` | **RED** — 49 failed \| 6 passed (55) |
| Existing suite excluding this file | **1438 passed** |
| prettier / eslint on new file | **PASS** |

### RED failure summary

All content failures are clean missing-file assertions (`*.json is missing from src/content/templates/`). No setup/import crashes. No unexpected AssertionErrors during RED.

## 5. AC → test mapping (unchanged tags; AC-5/AC-12 strengthened)

| AC | Coverage |
| --- | --- |
| AC-1 | parse + ≥8; REQUIRED rows present verbatim |
| AC-2 | skill / id prefix / uniqueness |
| AC-3 | token↔params; `\b` live-param check |
| AC-4 | 1000-seed golden sweep |
| AC-5 | **structural** `% == 0` + non-zero divisor **and** outcome sweep |
| AC-6 | ≤1000 bound |
| AC-7 | no `.` in fractions_int |
| AC-8 | precedence pair variety |
| AC-9 | wrong-order distractor |
| AC-10 | word-problem flag / length |
| AC-11 | ladder &lt; 250/1000 |
| AC-12 | **literal** SPOT_CHECKS table (`it.each`) |
| AC-13 | ≥5 skeletons |
| AC-14 | seeds 1…200 headroom |
| AC-15 | distractor hygiene |
