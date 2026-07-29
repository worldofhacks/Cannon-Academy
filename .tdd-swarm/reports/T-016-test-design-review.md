# T-016 — Independent Test-Design Re-Review (round 2)

## Verdict

**ACCEPT.** Round-1 Critical and Important findings are closed on commit `2929435`. The suite
matches the T-014 frozen-contract pattern, keeps clean missing-file RED, and is ready for freeze.

## One-line summary

Literal SPOT_CHECKS + REQUIRED_TEMPLATES authoring contract, `\b` dead-param checks, and structural
div_facts `% == 0` / non-zero-divisor assertions close all prior contract holes.

## Worktree verification

| Check | Observed |
| --- | --- |
| Worktree | `.worktrees/wt-T-016` |
| Branch | `ticket/T-016-templates-g35` |
| Commit | `2929435ed3e48e4200d68fd9c753b83038f82956` |
| Test file SHA-256 prefix | `02621515…` |
| `.tdd-swarm/phase` | `tests` |
| Content JSON | absent (expected RED) |
| Vitest | **49 failed \| 6 passed** (55) — content failures on `existsSync`; 6 greens = 3 preflight + DoD meta 1–3 |
| Spec-lint | **PASS** |
| Baseline outside file | 1438 green (orchestrator) |

DoD meta tests (`dod(T-016:1)`…`:3`) and authoring-contract preflight pass during RED; all
content-backed tests fail only on missing JSON. No vacuous GREEN.

## Round-1 closure verification

### C-1 — AC-12 independent hand-computed spot checks — **CLOSED**

| Requirement | Evidence |
| --- | --- |
| No in-test re-evaluator of `answerExpr` | `independentArithmetic` removed (grep clean) |
| T-014-style authoring contract | `REQUIRED_TEMPLATES` `g35.test.ts:75–299` — 8×3 templates covering ticket Context shapes |
| Literal `(id, seed, text, answer)` table | `SPOT_CHECKS` `g35.test.ts:306–336` — hand-pinned strings and integers |
| AC-12 asserts literals, not derived values | `g35.test.ts:900–910` — `expect(question.text).toBe(text)` and `expect(…).toBe(answer)` |
| Coverage parity | `g35.test.ts:884–897` — `checkIds === requiredIds`; every loaded id has a spot row |
| Authoring contract preflight | `g35.test.ts:506–516` — proves literals match `generateQuestion` on REQUIRED rows (does not run in AC-12 assertions) |

**Survivor mutation retest:** Wrong `answerExpr` copied into JSON is blocked by AC-1 verbatim
match (`g35.test.ts:556–560`). A divergent expr would fail AC-12 literal answer/text pins and AC-4
sweep — the correlated-bug tripwire now fires.

### I-1 — AC-3 dead-parameter substring bypass — **CLOSED**

**Evidence:** `g35.test.ts:380–385`

```typescript
const word = new RegExp(`\\b${name}\\b`);
if (word.test(template.answerExpr)) return true;
return (template.constraints ?? []).some((constraint) => word.test(constraint));
```

Dead param `a` with constraint `ab != 0` no longer passes. Matches T-014
(`k2-addsub.test.ts:511–512`).

### I-2 — div_facts structural exact-divisibility — **CLOSED**

**Evidence:** `assertDeclaredDivConstraints` `g35.test.ts:432–495`, wired into:

- AC-5 structural test — `g35.test.ts:676–679`
- AC-5 outcome sweep retained — `g35.test.ts:682–708`
- DoD-6 — `g35.test.ts:1050–1058`
- Preflight on REQUIRED div_facts — `g35.test.ts:518–521`

For every `ident / ident` pair in `answerExpr` and every `{a} ÷ {b}` pair in `text`, the template
must declare `dividend % divisor == 0` and `divisor != 0` (or `> 0`).

**Survivor mutation retest:** `answerExpr: "a / b"`, `constraints: ["b != 0"]`, degenerate
`a:[12,12], b:[3,3]` now fails structural assertion before sweeps run.

**Note:** `div_facts_missing_dividend` (`answerExpr: "b * c"`, text `? ÷ {b} = {c}`) correctly
exempt — no `/` pair in expr and no `{param}÷{param}` token pair in text. Non-zero divisor still
required where applicable; integer outcome guaranteed by multiplication. Not the I-2 bypass class.

### I-3 — AC-12 unreachable failure accumulation — **CLOSED**

Prior dead `failures.push` branches after throwing `expect` are gone. AC-12 uses direct
`it.each(SPOT_CHECKS)` assertions.

## Remaining Critical / Important findings

**None.**

## AC-by-AC discrimination (updated)

| AC | Encoded? | Adversarial / lazy bypass? | Notes |
| --- | --- | --- | --- |
| **AC-1** | Yes — `550–561`, DoD-4 | No | Schema + ≥8 floor; verbatim REQUIRED row match pins authoring contract. |
| **AC-2** | Yes — `568–584` | No | Skill field, id prefix, global uniqueness. |
| **AC-3** | Yes — `591–610` | No | `\b` word-boundary live-param check (I-1 closed). |
| **AC-4** | Yes — `617–668` | Unlikely | Full 1,000-seed golden sweep. |
| **AC-5** | Yes — structural + outcome `675–708` | No | Structural `% == 0` + non-zero divisor (I-2 closed) plus integer sweep. |
| **AC-6** | Yes — `715–741` | Unlikely | Answer + text numeric tokens bounded; fractions_int integer guard. |
| **AC-7** | Yes — `748–767` | Unlikely | No `.` in text or choice labels. |
| **AC-8** | Yes — `774–797` | Minor | No-paren vs parenthesised pair; same `{a,b,c}` comparison. |
| **AC-9** | Yes — `804–818` | Minor | Wrong-order distractor regex; sufficient for cited example. |
| **AC-10** | Yes — `825–852` | Minor | Prose ⇒ `isWordProblem`; length/`?` on flagged templates. |
| **AC-11** | Yes — `859–876` | Unlikely | Ladder `< 250/1000`. |
| **AC-12** | Yes — `883–911` | No | Literal SPOT_CHECKS; C-1 closed. |
| **AC-13** | Yes — `918–922`, DoD-4 | Partial | ≥5 skeletons; allows duplicate skeletons up to AC floor. |
| **AC-14** | Yes — `929–949` | Unlikely | Seeds 1..200 headroom. |
| **AC-15** | Yes — `956–977` | Unlikely | ≥3 distractors, textual uniqueness. |

## Nits (non-blocking)

- AC-12 coverage uses mutual containment (`requiredIds ⊆ loadedIds ⊆ checkIds`) rather than
  T-014's single `expect(loadedIds).toEqual(checkIds)` (`k2-addsub.test.ts:660–662`). Equivalent
  under the frozen 24-template contract; slightly more verbose.
- All 24 SPOT_CHECKS use `seed: 1`; T-014 varies seeds per row. AC-12 requires only one fixed
  seed per template — acceptable.
- DoD-5 (`1034–1047`) remains a spot-check subset of AC-6/AC-7 — redundant DoD shorthand, harmless.

## Over-constraint / out-of-scope checks

Unchanged from round 1 — no new over-constraints introduced. Ticket Context shapes, tap-the-picture,
stacked fractions, and `templates/index.ts` remain correctly out of scope.

## DoD / RED integrity

| DoD | RED behaviour | Correct? |
| --- | --- | --- |
| dod(T-016:1) | PASS — tag coverage | Yes (meta) |
| dod(T-016:2) | PASS — gates, no TODO/focus | Yes (meta) |
| dod(T-016:3) | PASS — numbered dod tags | Yes (meta) |
| dod(T-016:4) | FAIL — missing JSON | Yes |
| dod(T-016:5) | FAIL — missing JSON | Yes |
| dod(T-016:6) | FAIL — missing JSON | Yes |
| dod(T-016:7) | FAIL — missing JSON | Yes |

## Integrity

Only this review report was written. The frozen test file was not modified. No commit was made.
