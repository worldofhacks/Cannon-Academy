# T-034 Implementation Report

**Status: BLOCKED (format gate — frozen suite prettier debt)**

**Commit:** `9947577f98f58a394a4c3968dd8ff337d1f78989` — `feat(T-034): narrow template param keys to IDENT grammar`

Files changed (file_scopes only):

- `src/engine/questions/expr.ts` — export pure `IDENT_PATTERN` + `isIdent` matching
  `^[A-Za-z_][A-Za-z0-9_]*$`. No tokenisation or evaluation semantics change.
- `src/content/schemas.ts` — import `IDENT_PATTERN` from `@engine/questions/expr`; narrow
  `templateSchema.params` via `z.record(paramKeySchema, paramRangeSchema)`. Rejected keys
  appear in the Zod issue `path` (AC-2). Regex character class is **not** duplicated in schemas.

Did **not** edit `__tests__/**`.

Frozen suite hash (preserved):
`66bfa2cb93fc93fbb3c98a854c116578aaf7e34d46df608e915dfc9603f7f8ca`
(`shasum -a 256 __tests__/content/schemas.test.ts`; tip commit `2240821`)

## What was done

- Exported the T-002 IDENT grammar as a shared surface from `expr.ts` (orchestrator adjudication /
  DoD-5).
- Narrowed `params` keys at the schema boundary so authorable-but-unusable keys (`"a-b"`, `"2x"`,
  `""`, `"a b"`, `"a.b"`, digit-only `"7"`/`"0"`, …) fail load-time validation with the key named
  in the issue path.
- Existing shipped catalogs continue to parse (AC-3); AC-4 drift corpus matches the live evaluator
  oracle in the frozen suite.

## Gate evidence

| Gate | Result | Notes |
| ---- | ------ | ----- |
| `npx prettier --check .` | **FAIL** | Only `__tests__/content/schemas.test.ts` (frozen). Source files under `file_scopes` are prettier-clean. |
| `npx eslint .` | **PASS** | exit 0 |
| `npx tsc --noEmit` | **PASS** | exit 0 |
| `npx vitest run` | **PASS** | **1721 / 1721** (schemas suite **109 / 109**, includes all `spec(T-034:*)` / `dod(T-034:*)`) |
| `bash .tdd-swarm/run-local-gates.sh` | **RED** | format only; lint/typecheck/unit/no-todos/no-skipped/engine-purity/frozen-tests-unmodified all PASS |
| `bash .tdd-swarm/spec-lint.sh tickets/T-034.md` | **PASS** | AC-1…AC-4 + DoD-1…6 mapped |

## Blocker: BLOCKED(TEST_DISPUTE) — format vs frozen-hash

Implement phase forbids editing `__tests__/**`. Formatting the frozen suite would also change the
SHA-256 the orchestrator asked to preserve (`66bfa2cb…`).

**Evidence — prettier wants wrap-only edits in the frozen suite:**

1. `__tests__/content/schemas.test.ts` ~1045–1050 (`loadShippedTemplates` expect message ternary)
2. `__tests__/content/schemas.test.ts` ~1078–1081 (`spec(T-034:AC-2)` expect `.toBe(false)`)

`npx prettier __tests__/content/schemas.test.ts | diff -u …` shows only those two wrap collapses.
`git hash-object` matches `HEAD` blob `3186d3fc…` — debt landed with `2240821` / tip, not this
implement pass. Production sources check clean:

```text
npx prettier --check src/content/schemas.ts src/engine/questions/expr.ts  # PASS
```

**Orchestrator action:** Test Agent (or style pass) run
`npx prettier --write __tests__/content/schemas.test.ts`, publish the new frozen hash, then re-run
`npx prettier --check .` / `run-local-gates.sh`. No production rework needed for the format debt.

## Out of scope / untouched

- No edits under `__tests__/**`
- No evaluation / tokenisation behaviour change in `expr.ts` beyond the pure export
- Ticket status in `tickets/T-034.md` left alone (not file_scopes)
