# T-034 Implementation Report

**Status: DONE**

**Commit:** `9947577f98f58a394a4c3968dd8ff337d1f78989` — `feat(T-034): narrow template param keys to IDENT grammar`

Files changed (file_scopes only):

- `src/engine/questions/expr.ts` — export pure `IDENT_PATTERN` + `isIdent` matching
  `^[A-Za-z_][A-Za-z0-9_]*$`. No tokenisation or evaluation semantics change.
- `src/content/schemas.ts` — import `IDENT_PATTERN` from `@engine/questions/expr`; narrow
  `templateSchema.params` via `z.record(paramKeySchema, paramRangeSchema)`. Rejected keys
  appear in the Zod issue `path` (AC-2). Regex character class is **not** duplicated in schemas.

Did **not** edit `__tests__/**` in the implement pass.

Frozen suite hash:
`fcf0e43f560bc63aacdd8b39adce5c529f92d7f6e8f4451e38f44abedd79f92f`
(`shasum -a 256 __tests__/content/schemas.test.ts`; after orchestrator `style(T-034)` `9e0bd39`)

## What was done

- Exported the T-002 IDENT grammar as a shared surface from `expr.ts` (orchestrator adjudication /
  DoD-5).
- Narrowed `params` keys at the schema boundary so authorable-but-unusable keys (`"a-b"`, `"2x"`,
  `""`, `"a b"`, `"a.b"`, digit-only `"7"`/`"0"`, …) fail load-time validation with the key named
  in the issue path.
- Existing shipped catalogs continue to parse (AC-3); AC-4 drift corpus matches the live evaluator
  oracle in the frozen suite.

## Gate evidence (final)

| Gate | Result | Notes |
| ---- | ------ | ----- |
| `npx prettier --check .` | **PASS** | After `style(T-034)` closed format debt on frozen suite |
| `npx eslint .` | **PASS** | exit 0 |
| `npx tsc --noEmit` | **PASS** | exit 0 |
| `npx vitest run` | **PASS** | **1721 / 1721** (schemas suite **109 / 109**) |
| `bash .tdd-swarm/run-local-gates.sh` | **PASS** | all tier-1 checks green |
| `bash .tdd-swarm/spec-lint.sh tickets/T-034.md` | **PASS** | AC-1…AC-4 + DoD-1…6 mapped |

## Dispute resolution

Earlier implement pass was `BLOCKED(TEST_DISPUTE)` on prettier wrap-only debt in the frozen suite
(hash `66bfa2cb…`). Orchestrator landed `9e0bd39` `style(T-034): prettier on frozen schemas suite`
and published the new frozen hash above. Feat `9947577` kept unchanged.

## Out of scope / untouched

- No implement-phase edits under `__tests__/**`
- No evaluation / tokenisation behaviour change in `expr.ts` beyond the pure export
- Ticket status in `tickets/T-034.md` left alone (not file_scopes)
