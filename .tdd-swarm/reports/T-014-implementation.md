# T-014 Implementation Report

**Status: BLOCKED (format gate — frozen suite prettier debt)**

**Commit:** (this feat commit — see SHA below after commit)

Files refreshed (file_scopes only):

- `src/content/templates/add_within_10.json` — `add_within_10_near_doubles` third distractor `a + a` → `a + b + 2`
- `src/content/templates/add_within_20.json` — same near_doubles fix
- `src/content/templates/sub_within_20.json` — unchanged (already matched `REQUIRED_TEMPLATES`)

Did **not** create `src/content/templates/index.ts` (T-019). Did **not** edit `__tests__/**`.

Frozen suite hash (preserved):
`63628812983a2e2b0414e4f5f1dfc65fd8f4afbf787e63a3517eeff1892a6864`
(from `a0cbaeb` — recompute: `shasum -a 256 __tests__/content/templates/k2-addsub.test.ts`)

## What was done

After the TEST_DISPUTE fix in `a0cbaeb`, `REQUIRED_TEMPLATES` now declares near_doubles distractors as
`['a + b + 1', 'a + b - 1', 'a + b + 2']` so the third expression no longer collides with
`a + b - 1` under `b == a + 1`. The three skill JSON files were refreshed to match that contract
exactly (AC-1 deep-equals). Only the two near_doubles rows needed a content change; all other
templates already matched.

## Gate evidence

| Gate | Result | Notes |
| ---- | ------ | ----- |
| `npx prettier --check .` | **FAIL** | Only `__tests__/content/templates/k2-addsub.test.ts` (frozen; introduce in `a0cbaeb`). Diff is quote/wrap-only on the new AC-7 preflight `it(...)` and a few nearby lines. JSON files prettier-clean. |
| `npx eslint .` | **PASS** | `--max-warnings 0`, exit 0 |
| `npx tsc --noEmit` | **PASS** | exit 0 |
| `npx vitest run` | **PASS** | **1493 / 1493** (includes k2-addsub **55/55**) |
| `bash .tdd-swarm/run-local-gates.sh` | **RED** | format only; lint/typecheck/unit/no-todos/no-skipped/engine-purity/frozen-tests-unmodified all PASS |
| `bash .tdd-swarm/spec-lint.sh tickets/T-014.md` | **PASS** | AC-1…AC-11 + DoD-1…7 mapped |

## Blocker: format vs frozen-hash

Implement phase forbids editing `__tests__/**`. Formatting the frozen suite would also change the
SHA-256 the orchestrator asked to preserve. Content and unit gates are green; format is red solely
because `a0cbaeb` landed without `prettier --write` on `k2-addsub.test.ts`.

**Orchestrator action:** one `style(T-014):` (or amend via test agent) commit running
`npx prettier --write __tests__/content/templates/k2-addsub.test.ts`, recompute and publish the new
frozen hash, then re-run `npx prettier --check .` / `run-local-gates.sh`. No JSON rework needed.

## Out of scope / untouched

- No edits under `__tests__/**`
- No `templates/index.ts`
- Ticket status in `tickets/T-014.md` left alone (not file_scopes)
