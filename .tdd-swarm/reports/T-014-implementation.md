# T-014 Implementation Report

**Status: BLOCKED**

**Commit:** `31cb5bad7951d0628c0d2c4e04d6d3bb931cc3b6` — `feat(T-014): K-2 add/sub templates (≥8 per skill, symbolic only)`

Files created (file_scopes only):

- `src/content/templates/add_within_10.json` (8 templates)
- `src/content/templates/add_within_20.json` (8 templates)
- `src/content/templates/sub_within_20.json` (8 templates)

Did **not** create `src/content/templates/index.ts` (T-019).

Frozen suite hash unchanged:
`66e68a23fc4570a7a65156f965ada4a8817d4ffd3bb562c68d21f9f9b9fe5745`
(commit `f509c7c`).

## What was done

Copied `REQUIRED_TEMPLATES` from `__tests__/content/templates/k2-addsub.test.ts` into the three
skill JSON arrays (filter by `skill`), expanding `nearMiss(expr)` to the three parenthesized
strings the contract uses. Content matches the AC-1 deep-equals authoring contract exactly —
per orchestrator instruction not to dispute that freeze (ACCEPT_WITH_NITS I-1).

## Blocker: AC-1 vs AC-7 contradiction in the frozen contract

`add_within_10_near_doubles` and `add_within_20_near_doubles` declare:

```text
constraints: ["b == a + 1", ...]
distractors: ["a + b + 1", "a + b - 1", "a + a"]
```

Under `b == a + 1`, `a + a === a + b - 1` for every legal draw, so only **two** distinct declared
distractor values exist. `describeDistractorSources` therefore always includes `'ladder'` to fill
the third slot → **1000/1000** ladder hits (threshold is `< 250`).

- Fixing the distractor strings (e.g. replace `a + a` with `(a + b) + 2`) would pass AC-7 but
  **fail AC-1** deep-equals to `REQUIRED_TEMPLATES`.
- Copying the contract verbatim (as instructed) passes AC-1 and fails AC-7.

This is exactly the risk flagged as nit **I-3** in
`.tdd-swarm/reports/T-014-test-design-review.md` (missing AC-7 preflight on
`REQUIRED_TEMPLATES` before freeze). Implementer cannot edit `__tests__/**` in this phase.

**Orchestrator action needed:** amend the frozen suite (test/style/spec commit) to change the
near-doubles distractors in `REQUIRED_TEMPLATES` (and keep SPOT_CHECKS unchanged — they do not
depend on distractors), then re-implement / re-verify. Suggested replacement for both
near-doubles templates: `["(a + b) + 1", "(a + b) - 1", "(a + b) + 2"]` (same shape as
`nearMiss('a + b')`).

## Gate evidence

| Gate | Result | Notes |
| ---- | ------ | ----- |
| `npx prettier --check .` | **FAIL** | Only `__tests__/content/templates/k2-addsub.test.ts` (frozen; cannot format). Three JSON files are prettier-clean. |
| `npx eslint .` | **PASS** | exit 0 |
| `npx tsc --noEmit` | **PASS** | exit 0 |
| `npx vitest run` (full) | **FAIL** | 1491 pass / **1 fail** — AC-7 near-doubles |
| Frozen suite alone | **FAIL** | 53 pass / 1 fail — same AC-7 |
| `bash .tdd-swarm/run-local-gates.sh` | **RED** | format + unit fail |
| `bash .tdd-swarm/spec-lint.sh tickets/T-014.md` | **PASS** | all AC-1…AC-11 + DoD-1…7 mapped |

### AC-7 failure excerpt

```
FAIL  … > spec(T-014:AC-7) describeDistractorSources reports 'ladder' on fewer than 250 of 1000…
AssertionError: add_within_10_near_doubles: ladder used on 1000/1000 samples …
add_within_20_near_doubles: ladder used on 1000/1000 samples …
```

## Out of scope / untouched

- No edits under `__tests__/**`
- No `templates/index.ts`
- Ticket status bump in `tickets/T-014.md` left unstaged (not file_scopes)
