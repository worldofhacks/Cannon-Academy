# T-015 Implementation Report

## Unit assertion

| Check | Value |
| --- | --- |
| Branch | `ticket/T-015-templates-g23` |
| Active ticket | `T-015` |
| Phase | `implement` |
| Frozen suite | `__tests__/content/templates/g23.test.ts` @ `3ec4364` |
| Frozen suite SHA-256 | `f941a204069afed65779e680139118f7b68a36521132b5f4f5b53efeb6ec2d04` (unchanged) |
| File scope | three skill JSON files under `src/content/templates/` (+ this report) |

## What was implemented

Copied the frozen suite’s `REQUIRED_TEMPLATES` authoring contract into the three scoped JSON files (exact AC-1 deep-equals match after `templateSchema.parse`):

| File | Count | Notes |
| --- | ---: | --- |
| `place_value_compare.json` | 8 | 5 word / 3 symbolic; digit value, rounding, compare, difference |
| `two_step_add_sub.json` | 8 | 1 word / 7 symbolic; non-negative intermediate via constraints |
| `mult_facts.json` | 8 | 2 word / 6 symbolic; display `×`, `answerExpr` `*` |
| **Total** | **24** | ≥8 / skill, ≥5 skeletons / skill |

No `templates/index.ts` (T-019).

Distractors are the contract’s `nearMiss` triple (`+1`, `-1`, `+2` on `answerExpr`). AC-10 ladder preflight on `REQUIRED_TEMPLATES` was green before ship (all `< 250/1000`).

## Gate results

| Gate | Result |
| --- | --- |
| `npx prettier --check .` | PASS |
| `npx eslint . --max-warnings 0` | PASS |
| `npx tsc --noEmit` | PASS |
| `npx vitest run` | PASS — **1491/1491** (incl. g23 **53/53**) |
| `bash .tdd-swarm/run-local-gates.sh` | PASS — **ALL LOCAL GATES PASS** |
| `bash .tdd-swarm/spec-lint.sh tickets/T-015.md` | PASS |
| Frozen suite hash | unchanged (`f941a204…`) |

## Housekeeping

Cleared leftover `scratchpad/T-015-spot/` junk from test-design that was failing the lint gate (`*.test.ts` under scratchpad). Not part of the deliverable; scratchpad is gitignored.

## Residual risks / disputes

None. No AC-1 / ladder conflict. JSON matches `REQUIRED_TEMPLATES` exactly.

**Status: DONE**
