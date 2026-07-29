# T-010 Implementation Report

**Status: DONE_WITH_CONCERNS**

**Commit:** `125d77c0dc39494e10b8ed655625e40f19699574` — `feat(T-010): dual-rate mastery meters, threshold, and unlock resolution`
File changed: `src/engine/mastery.ts` (new, 133 lines) — exactly the ticket's `file_scopes`.

## Test summary

- `__tests__/engine/mastery.test.ts`: **47/47 pass**
- Full suite (`npx vitest run`): **823/823 pass** (8 test files)
- `.tdd-swarm/spec-lint.sh tickets/T-010.md`: **PASS** — all 15 ACs mapped to `spec(T-010:AC-n)` tests
- `.tdd-swarm/run-local-gates.sh`: **lint PASS, typecheck PASS, unit PASS, no-todos PASS,
  no-skipped-tests PASS, engine-purity PASS. `format` gate is RED — see concern below.**

## Implementation notes

- `emptyMastery` is `Object.freeze`d (defensive; the trap list calls out that mutating it must
  throw).
- `applyAnswer` builds a new plain object in every branch; never touches `m`.
- `accuracy` returns `0` at `attempts === 0`, otherwise raw `correct / attempts` — unweighted by
  source, per the ticket's `proposed` decision.
- `meterPercent` is exactly `min(MASTERY_METER_MAX, round(100 * weightedCorrect / MASTERY_THRESHOLD_CORRECT))`;
  no separate clamping logic needed for `Infinity` — `Math.min` handles it since `round(Infinity)
  === Infinity`.
- `isMastered` is `weightedCorrect >= MASTERY_THRESHOLD_CORRECT && accuracy(m) >= MASTERY_MIN_ACCURACY`
  — both `>=`, per the ticket's locked decision.
- `resolveUnlocks` derives `masteredSkillIds` from the mastery map with an explicit
  `entry !== undefined` check (satisfies `noUncheckedIndexedAccess` and the "presence in the map
  is not mastery" trap), then:
  - Cannons: catalog cannons with `unlock.kind === 'range'` and `skill` mastered, minus
    `unlockedCannons`.
  - Islands: catalog islands with `requiresIsland` defined and at least one of the predecessor's
    `rangeSkills` mastered, minus `unlockedIslands`. Implemented literally per the ticket's
    pre-freeze note: `unlockedIslands` is used only to exclude the *candidate* island `I` from the
    delta, never as a precondition that the predecessor `J` is itself unlocked. Did not add a
    predecessor-unlocked guard, per the ticket's explicit instruction not to "fix" this.
- No hardcoded skill/cannon/island ids; all thresholds/rates imported from `@engine/tuning`; all
  catalog facts read from `@content/index` / `@content/schemas`.
- No `react`/`react-native`/`expo`/`firebase` imports, no `Math.random()`, no `Date`, no dynamic
  code construction, no `console.*`.

## Concern: pre-existing `format` gate failure (not caused by this change, not fixable in scope)

`npx prettier --check .` reports one warning:

```
[warn] __tests__/engine/mastery.test.ts
```

I verified this is **pre-existing and independent of my change**: temporarily removing
`src/engine/mastery.ts` and re-running `npx prettier --check .` still reports the identical
warning against the frozen test file. `src/engine/mastery.ts` itself passes
`npx prettier --check src/engine/mastery.ts` cleanly.

Per the ticket brief, test files are frozen and a hook (`.claude/hooks/guard-writes.cjs`, wired
via `.claude/settings.json` `PreToolUse` on `Edit|Write|NotebookEdit`) blocks writes under
`__tests__/`, so I cannot run `prettier --write` on it or otherwise touch it. This is the only
red item in `run-local-gates.sh`; every other gate (lint, typecheck, unit, no-todos,
no-skipped-tests, engine-purity) is green, spec-lint is green, and all 823 tests pass. Flagging
for the orchestrator to reformat the frozen test file (or adjust the format gate's scope) outside
this ticket's file scope.

## Other observations (informational only, no action taken)

- Confirmed the ticket's pre-freeze note is reflected correctly in both the implementation and
  the frozen tests (AC-12's "independent of whether J itself is already unlocked" test passes
  against the literal rule as implemented).
- The orchestrator's own note about a latent chest-unlock exploit path (out-of-band range cannon
  grants skipping islands) is out of scope for T-010 and untouched here, as instructed.
