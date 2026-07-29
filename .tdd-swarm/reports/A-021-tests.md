# A-021 Test Agent Report

## Status

`TESTS_WRITTEN` — the retrospective AC-1 regression is green and ready for independent
test-design review/freeze.

This ticket verifies behavior already shipped in `8ee28eb`; it does not authorize a production
implementation. Consequently the new regression is green at its base commit (`751a465`) rather
than proving RED against missing code.

## Files

- `__tests__/app/text-presentation-glyphs.test.ts`

No production file, existing test, ticket, or engine/content file was edited.

## Criterion mapping

| Criterion | Frozen coverage |
| --- | --- |
| `A-021:AC-1` | Five parameterized checks parse TS/TSX source and require U+FE0E on the HUD anchor, both branches of the conditional turn-pip site, the rival watch panel, and the rival-impact copy. |
| `A-021:AC-1` | One whole-app-layer audit parses every source string/JSX literal under `app/` and `src/components/` and rejects any bare U+2693, U+25B6, or U+25C0 occurrence. |

The test uses the TypeScript parser, not raw substring search. Comments therefore cannot satisfy
the contract, and the global audit prevents a newly introduced bare target glyph outside the four
known call sites from slipping through.

## Evidence

| Command | Result |
| --- | --- |
| `npx vitest run __tests__/app/text-presentation-glyphs.test.ts` | PASS — 6/6 |
| `.tdd-swarm/spec-lint.sh tickets/app/A-021.md` | PASS — AC-1 mapped; four process DoD items correctly skipped |
| `npx vitest run` | PASS — 2,021 tests across 42 files |
| `npx prettier --check __tests__/app/text-presentation-glyphs.test.ts` | PASS |
| `npx eslint . --max-warnings 0` | PASS |
| `npx tsc --noEmit` | PASS |
| `git diff --check` | PASS |
| New-test skip/focus and marker scan | PASS |

The repository wrapper `.tdd-swarm/run-local-gates.sh` was also run. Its lint, typecheck, unit,
no-TODO, no-skipped-test, and engine-purity gates passed. It returned RED for two baseline/tooling
conditions outside this ticket:

1. The branch had not yet received app/shell commit `8449b4e`, which formats the newly merged A-018
   release-evidence report.
2. The wrapper's frozen-test history check compares every ticket branch to `swarm/engine-core` and
   therefore reports three older app commits (`81ccba9`, `ca3c6ce`, `f9ed263`) whose production
   commit subjects carried tests. None is introduced or modified by A-021.

The orchestrator was notified immediately. A-021's own scoped format/lint/typecheck/tests/spec-lint
are all green.

## Native verification

Not started in this report. Per orchestrator instruction, simulator verification pauses until this
test commit is reviewed and the current app/shell release commits are merged into the ticket branch;
all device evidence will then identify and run against that exact merged commit.
