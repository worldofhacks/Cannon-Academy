# T-016 Implementation Report

**Status: DONE**

**Commit:** (see SHA after commit) — `feat(T-016): refresh grade 3-5 templates after ladder fix`

## Files refreshed (file_scopes only)

| File | Count |
| --- | --- |
| `src/content/templates/div_facts.json` | 8 templates |
| `src/content/templates/fractions_int.json` | 8 templates (unchanged vs prior copy; still matches contract) |
| `src/content/templates/multi_digit_order_ops.json` | 8 templates |

Did **not** create `src/content/templates/index.ts` (T-019).

## What changed (retry after TEST_DISPUTE)

Prior implement commit `8de5d24` copied the then-frozen `REQUIRED_TEMPLATES` verbatim and hit AC-11 ladder collisions. Test Agent `eea35ac` amended the authoring contract (distractors / ranges / constraints + AC-11 preflight on `REQUIRED_TEMPLATES`). This pass re-copied the post-`eea35ac` contract into JSON:

- `div_facts_same` distractors → `["0", "2", "3"]`
- `multi_digit_order_ops_no_paren` — tighter params, `b >= a`, distractors keep wrong-order `(a + b) * c` plus `b * c` / `+ 2`
- `multi_digit_order_ops_paren` — tighter params (`c: [2, 4]`)
- `multi_digit_order_ops_times_minus` distractors → `a * b` + near-miss instead of `a * (b - c)`

`nearMiss(expr)` expanded to `["(expr) + 1", "(expr) - 1", "(expr) + 2"]` as before.

## Frozen suite

| Check | Value |
| --- | --- |
| Suite path | `__tests__/content/templates/g35.test.ts` |
| sha256 | `a48a7e7ffe7d41e72ed83c08986ae8de8ba16680076ed8bb81b2d868b272cd86` |
| Matches `eea35ac` suite | yes (tests unmodified this pass) |

## Gate evidence

| Gate | Result |
| ---- | ------ |
| `npx prettier --check .` | **PASS** |
| `npx eslint .` | **PASS** |
| `npx tsc --noEmit` | **PASS** |
| `npx vitest run` | **PASS** — 1494 tests |
| Frozen suite alone | **PASS** — 56 tests |
| `bash .tdd-swarm/run-local-gates.sh` | **PASS** (all Tier 1) |
| `bash .tdd-swarm/spec-lint.sh tickets/T-016.md` | **PASS** |

## Counts

- Templates: **8 + 8 + 8 = 24**
- Full vitest: **1494 passed**
- Frozen g35: **56 passed**
