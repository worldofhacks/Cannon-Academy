# A-018 Frozen-Test Design Re-review

## Verdict

**APPROVE_FREEZE**

At test tip `5bf8871`, AC-1 has a complete current inventory, adversarial hook-discovery and
call-safety fixtures, behavior-focused assertions, and a live unsafe guard. The remaining Important
finding from the prior review is closed. There are no Critical, Important, or Minor findings.

This review is limited to AC-1. Required web/iOS rendering, routing, screenshots, runtime results,
and commit evidence remain separate release-evidence and `[process]` DoD work.

## Prior Important finding: closed

### Named and namespace `useSharedValue` calls now fail the guard

The collector records each named Reanimated import's original exported name instead of trusting
every value from the package (`__tests__/app/chart-worklet-safety.test.ts:187-223`). A call is safe
only when that resolved name or qualified member path appears in the explicit worklet-safe set
(`__tests__/app/chart-worklet-safety.test.ts:296-317`).

The two adversarial fixtures put `useSharedValue()` directly inside an animated-style callback
through both supported forms:

- named import (`__tests__/app/chart-worklet-safety.test.ts:482-489`);
- namespace qualification (`__tests__/app/chart-worklet-safety.test.ts:490-499`).

Both fixtures use the same `workletsIn` collector as production and independently require the hook
call to appear in `unsafeCalls`
(`__tests__/app/chart-worklet-safety.test.ts:530-542`). A regression to “all Reanimated exports are
safe” therefore fails the frozen suite.

## Allowlist assessment

The allowlist is explicit and narrow: interpolation/color/clamp utilities, easing functions, and
animation builders (`__tests__/app/chart-worklet-safety.test.ts:21-49`). These are appropriate
animated-style operations, and their installed Reanimated 4.5.0 implementations are worklet-marked:

- `interpolate` and `clamp`
  (`node_modules/react-native-reanimated/src/interpolation.ts:178-240`);
- `interpolateColor`
  (`node_modules/react-native-reanimated/src/interpolateColor.ts:358-381`);
- easing functions, including factories and combinators
  (`node_modules/react-native-reanimated/src/Easing.ts:59-255`);
- animation builders, including `withTiming`, `withClamp`, `withDecay`, `withDelay`, `withRepeat`,
  `withSequence`, and `withSpring`
  (`node_modules/react-native-reanimated/src/animation/timing.ts:76-88`,
  `node_modules/react-native-reanimated/src/animation/clamp.ts:25-33`,
  `node_modules/react-native-reanimated/src/animation/decay/decay.ts:66-73`,
  `node_modules/react-native-reanimated/src/animation/delay.ts:32-41`,
  `node_modules/react-native-reanimated/src/animation/repeat.ts:39-51`,
  `node_modules/react-native-reanimated/src/animation/sequence.ts:32-36`,
  `node_modules/react-native-reanimated/src/animation/spring/spring.ts:56-64`).

The boundary is not the former “zero call expressions” implementation restriction. The safe
fixture proves an extracted callback may call both unshadowed `Math.max()` and imported
`interpolate()` (`__tests__/app/chart-worklet-safety.test.ts:602-626`). Imported-name aliases and
namespace/default member paths are resolved by provenance, while shadowed names are rejected
(`__tests__/app/chart-worklet-safety.test.ts:296-317,566-584`). APIs outside the proven style-worklet
surface fail closed instead of being assumed safe merely because Reanimated exports them.

This is a defensible safety boundary for AC-1: it permits the installed, worklet-marked operations
appropriate to a style callback without admitting JS-thread hooks or arbitrary package exports.

## Remaining test-design assessment

- Full current inventory: the recursive chart scan and exact four-worklet assertion remain in place
  (`__tests__/app/chart-worklet-safety.test.ts:90-98,442-450,501-507`).
- Lazy/adversarial bypasses: named aliases, namespace/default qualification, computed member access,
  extracted callbacks, shadowed imports, unresolvable callbacks, unsafe helpers, and JS-thread
  Reanimated hooks all have fixtures
  (`__tests__/app/chart-worklet-safety.test.ts:452-499,516-600`).
- Behavior versus implementation detail: callbacks may be inline or locally resolvable functions,
  and proven UI-runtime calls are accepted; unknown bodies and calls fail closed
  (`__tests__/app/chart-worklet-safety.test.ts:344-388,509-513,602-626`).
- Guard liveness: unsafe fixtures pass through the production collector and assert the exact unsafe
  call category, rather than testing a separate mock predicate
  (`__tests__/app/chart-worklet-safety.test.ts:516-542,544-584`).
- Retrospective posture: first-run green is explicitly permitted by the ticket and is not a finding.

## Findings

### Critical

None.

### Important

None.

### Minor

None.

## Verification evidence

- `npx vitest run __tests__/app/chart-worklet-safety.test.ts` — PASS, 1 file / 14 tests.
- `.tdd-swarm/spec-lint.sh tickets/app/A-018.md` — PASS; AC-1 maps to eight tests and all six DoD
  items are explicitly process evidence.
- `npx vitest run` — PASS, 41 files / 2,028 tests.
- `.tdd-swarm/run-local-gates.sh <worktree>`:
  - PASS: formatting, lint, typecheck, full unit suite, no-TODO, no-skipped-tests, and engine purity.
  - RED only on the pre-existing `frozen-tests-unmodified` history check for unrelated commits
    `81ccba9`, `ca3c6ce`, and `f9ed263`, as already documented in the Test Agent report. This does not
    affect A-018 frozen-test design or the `test(A-018): ...` commits under review.
