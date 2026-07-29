# A-021 Test Agent Report

## Status

`TESTS_REVISED` — the retrospective AC-1 regression is green after resolving both Important
findings from independent test-design review commit `4ddcc74`.

This ticket verifies behavior already shipped in `8ee28eb`; it does not authorize a production
implementation. Consequently the new regression is green at its base commit (`751a465`) rather
than proving RED against missing code.

## Files

- `__tests__/app/text-presentation-glyphs.test.ts`

No production file, existing test, ticket, or engine/content file was edited.

## Criterion mapping

| Criterion | Frozen coverage |
| --- | --- |
| `A-021:AC-1` | Four checks bind directly to the exact AST render sites fixed in `8ee28eb`: the `anchorGlyph` Text child, both conditional branches of the `turnPipGlyph` Text child, the `rivalIconText` watch-panel child, and the `resolveCopy` → `rivalImpact` → `icon` property. |
| `A-021:AC-1` | One in-memory mutation replaces the real rival-turn branch with bare `String.fromCodePoint(0x25c0)` and adds a compliant `◀︎` decoy literal; the site-bound evaluator still reports `expected U+25C0 U+FE0E, got U+25C0`. |

The revised test uses the TypeScript parser and resolves only the static value of each exact site.
It handles conditionals, concatenation, template expressions, const aliases, JSX numeric entities,
and `String.fromCodePoint`/`fromCharCode`. Comments and file-level decoy literals cannot satisfy the
contract. The review's out-of-scope whole-app ban was removed.

## Evidence

| Command | Result |
| --- | --- |
| `npx vitest run __tests__/app/text-presentation-glyphs.test.ts` | PASS — 5/5 after review fixes |
| `.tdd-swarm/spec-lint.sh tickets/app/A-021.md` | PASS — five AC-1 test definitions mapped; four process DoD items correctly skipped |
| `npx vitest run` | PASS — 2,034 tests across 43 files at merged target `f6a3cee` |
| `npx prettier --check __tests__/app/text-presentation-glyphs.test.ts` | PASS |
| `npx eslint . --max-warnings 0` | PASS |
| `npx tsc --noEmit` | PASS |
| `git diff --check` | PASS |
| New-test skip/focus and marker scan | PASS |

The repository wrapper `.tdd-swarm/run-local-gates.sh` was also run. Its lint, typecheck, unit,
no-TODO, no-skipped-test, and engine-purity gates passed. It returned RED for two baseline/tooling
conditions outside this ticket:

1. The original test commit preceded app/shell commit `8449b4e`, which formatted the newly merged
   A-018 release-evidence report. That commit is now present at the reviewed device target.
2. The wrapper's frozen-test history check compares every ticket branch to `swarm/engine-core` and
   therefore reports three older app commits (`81ccba9`, `ca3c6ce`, `f9ed263`) whose production
   commit subjects carried tests. None is introduced or modified by A-021.

The orchestrator was notified immediately. A-021's own scoped format/lint/typecheck/tests/spec-lint
are all green.

## Native verification

Completed against exact merged commit `f6a3cee3156dd1de5aae85f06c5afaddd5c35688`. The separate
timestamped report and screenshots are under `.tdd-swarm/release-evidence/A-021/`.
