# A-018 Test Agent Report

## Scope

- Added `__tests__/app/chart-worklet-safety.test.ts` only.
- Added this report only.
- No production, ticket, configuration, or other test files changed.

## AC-1 evidence

The Vitest suite parses every `.ts` and `.tsx` file under `src/components/chart/` with the
TypeScript AST, finds direct `useAnimatedStyle(...)` calls, and inspects each callback subtree for
`CallExpression` nodes. It pins the complete currently shipped inventory to these four independently
executed worklets:

1. `src/components/chart/ChartShip.tsx::bobStyle`
2. `src/components/chart/Fog.tsx::driftStyle`
3. `src/components/chart/Station.tsx::ringStyle`
4. `src/components/chart/Station.tsx::riseStyle`

Any added, removed, renamed, non-callback, or helper-calling worklet fails the suite. The test also
parses an in-memory unsafe representative (`helper()` in a callback) and proves the guard records
that call; no source mutation or manufactured RED run was used.

## First-run posture

This is retrospective verification of the already shipped chart. The first source inspection of the
four shipped callbacks was green, which is expected and valid for A-018; no production mutation or
manufactured RED run was used. One test-authoring iteration corrected an over-specific column number
in the in-memory unsafe-fixture assertion; it never represented a production failure.

## Commands and results

| Command | Result |
| --- | --- |
| `npx vitest run __tests__/app/chart-worklet-safety.test.ts` | PASS — 1 file, 6 tests |
| `npx prettier --check __tests__/app/chart-worklet-safety.test.ts .tdd-swarm/reports/A-018-tests.md` | PASS |
| `npx eslint __tests__/app/chart-worklet-safety.test.ts --max-warnings 0` | PASS |
| `npx tsc --noEmit` | PASS |
| `npx vitest run` | PASS — 41 files, 2,020 tests |
| `.tdd-swarm/spec-lint.sh tickets/app/A-018.md` | RED (exit 1), expected outside this Test Agent's AC-1-only scope |

Spec-lint confirms `AC-1` has three tagged tests. It correctly reports no test coverage yet for
`AC-2` through `AC-5`, and no `dod(A-018:1)` through `dod(A-018:4)` evidence. DoD-5 and DoD-6 are
explicit `[process]` items and are skipped by the gate. Browser, iOS, controls, and release-evidence
checks remain work for their respective verification agents.
