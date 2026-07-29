# A-018 Test Agent Report

## Scope

- Added `__tests__/app/chart-worklet-safety.test.ts` only.
- Added this report only.
- No production, ticket, configuration, or other test files changed.

## AC-1 evidence

The Vitest suite parses every `.ts` and `.tsx` file under `src/components/chart/` with the
TypeScript AST and resolves `useAnimatedStyle(...)` calls to import declarations from
`react-native-reanimated`. Direct named imports, named-import aliases, namespace qualification,
default qualification, and string-literal member access are inventoried. Inline callbacks and
identifier callbacks whose local function bodies can be resolved are inspected. The complete
currently shipped inventory remains pinned to these four independently executed worklets:

1. `src/components/chart/ChartShip.tsx::bobStyle`
2. `src/components/chart/Fog.tsx::driftStyle`
3. `src/components/chart/Station.tsx::ringStyle`
4. `src/components/chart/Station.tsx::riseStyle`

Any added, removed, renamed, uninspectable, or unsafe-helper-calling worklet fails the suite. Calls
are allowed only when their provenance resolves to an explicit set of Reanimated functions whose
installed implementations are worklet-marked (interpolation, easing, and animation builders), or
to an unshadowed worklet-safe ECMAScript intrinsic. Merely importing a value from Reanimated does
not make its call safe, so the frozen test avoids both “trust every export” and the ticket-unstated
rule of “zero call expressions.”

Adversarial in-memory sources prove all of these through the same collector used for production:

- named-import alias, namespace-qualified, and default/computed hook forms are inventoried and their
  captured `jsLayout()` calls are rejected;
- a locally resolved extracted callback is inspected and its captured helper rejected;
- an unresolvable callback fails closed instead of escaping inspection;
- a local helper shadowing an imported Reanimated primitive is rejected by declaration provenance;
- named and namespace-qualified `useSharedValue()` calls are rejected as JS-thread React hooks;
- an extracted callback using `Math.max()` and Reanimated `interpolate()` is accepted.

No source mutation or manufactured RED run was used.

## Test-design review resolution

All Important findings in `.tdd-swarm/reports/A-018-test-design-review.md` are addressed:

1. Hook discovery now follows the actual Reanimated import declaration instead of matching the
   literal local name `useAnimatedStyle`.
2. Callback analysis resolves local identifier bodies and classifies calls by provenance instead of
   requiring an inline callback with no calls.
3. Reanimated call safety uses an explicit worklet-utility allowlist; React hooks such as
   `useSharedValue()` remain unsafe even though they come from the same package.

## First-run posture

This is retrospective verification of the already shipped chart. The first source inspection of the
four shipped callbacks was green, which is expected and valid for A-018; no production mutation or
manufactured RED run was used. One test-authoring iteration corrected an over-specific column number
in the in-memory unsafe-fixture assertion; it never represented a production failure.

## Commands and results

| Command | Result |
| --- | --- |
| `npx vitest run __tests__/app/chart-worklet-safety.test.ts` | PASS — 1 file, 14 tests |
| `npx prettier --check __tests__/app/chart-worklet-safety.test.ts .tdd-swarm/reports/A-018-tests.md` | PASS |
| `npx eslint __tests__/app/chart-worklet-safety.test.ts --max-warnings 0` | PASS |
| `npx tsc --noEmit` | PASS |
| `npx vitest run` | PASS — 41 files, 2,028 tests |
| `.tdd-swarm/spec-lint.sh tickets/app/A-018.md` | PASS — AC-1 covered; all six DoD items explicitly skipped as process evidence |
| `.tdd-swarm/run-local-gates.sh <worktree>` | Formatting, lint, typecheck, unit, no-markers, no-focused-tests, and purity PASS; wrapper RED only on the pre-existing `frozen-tests-unmodified` history check |

The wrapper’s history check reports three earlier non-test-subject commits that already changed
tests relative to `swarm/engine-core`: `81ccba9`, `ca3c6ce`, and `f9ed263`. This Test Agent did not
author or alter those commits. The A-018 test commits use the required `test(A-018): ...` subject.
