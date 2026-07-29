# A-015 Test-Design Review

**Frozen test commit:** `30f66b2`

**Reviewed branch tip:** `8c05d86` (the later commit changes only the reported test count)

**Test:** `__tests__/app/guided-duel.test.ts`

## Verdict

**FIX_NEEDED — DO NOT FREEZE.**

No Critical findings. Four Important findings block freeze.

## Findings

### Important — AC-4 does not test the full, unskippable teaching hold

Evidence: `__tests__/app/guided-duel.test.ts:211-225`; ticket AC-4 at
`tickets/app/A-015.md:92-94`.

The test proves only that a wrong answer or timeout enters the expected resolving phase, retains
the question's answer, and has a configured duration greater than zero. It never advances a clock,
never observes the guided screen/controller, and never asserts that the phase remains in place for
the exact `PHASE_DURATION_MS`. A lazy guided screen that dispatches `ADVANCE` immediately, or waits
one millisecond, passes. In fact, the test harness itself dispatches `ADVANCE` immediately from
these phases at lines 100-103.

AC-4 explicitly requires the full duration and says the teaching moment is not skippable. Add a
deterministic fake-clock/scheduler test for both `miss` and `timeout`: assert the correct answer is
still exposed and the phase has not advanced immediately or at `duration - 1`, then assert it
advances at the exact configured duration. The test also needs to prove that the guided path
cannot bypass that hold with an early advance action. This may require a small public guided-duel
controller seam; merely asserting the duration table's value cannot establish elapsed behavior.

### Important — AC-1's scripted-opponent provenance has a trivial source-text bypass

Evidence: `__tests__/app/guided-duel.test.ts:145-158`; ticket AC-1 and ruled service seam at
`tickets/app/A-015.md:71-77,81-83`.

The returned opponent is checked only for the shared ID and two function-shaped properties. The
separate source assertion matches the text `createScriptedOpponent(` anywhere in the service
file. A hand-built opponent with the same ID and method names passes if a comment, unreachable
branch, or discarded factory call contains that text. The test therefore does not prove that
`openGuidedDuel` returns T-018's scripted opponent.

Bind the returned value behaviorally or structurally to the actual T-018 factory result, or use a
robust source/AST check that proves the returned opponent is derived from that call. Keep the
ticket's no-literal check as the stated process/diff review; this finding concerns the behavioral
half of AC-1, not that process-only clause.

### Important — settlement can complete an unfinished duel and still pass

Evidence: `__tests__/app/guided-duel.test.ts:196-209,228-248`; ruled service seam at
`tickets/app/A-015.md:71-75`.

Both settlement tests pass a finished victory. They strongly cover victory persistence, real-duel
reward parity, and a duplicate settlement for the same `duelId`, but never exercise an unfinished
state. An implementation may call `markGuidedDuelFought()` for every state—including the initial
`select` state—and still pass every proposed test. That violates the explicit ruling that the
service marks guided completion **only for a finished guided victory**.

Add a negative settlement test using an unfinished guided state. It should assert a non-applied
reward outcome, no coins/win/mastery change, `hasFoughtGuidedDuel === false`, and no captain-store
mutation. Then retain the existing victory and repeated-victory assertions to cover the complete
state transition and its idempotency.

### Important — the proposed RED is a collection error, not a clean behavioral failure

Evidence: import at `__tests__/app/guided-duel.test.ts:22-25`.

At reviewed tip `8c05d86`, this command:

```text
npx vitest run __tests__/app/guided-duel.test.ts
```

exits 1 before collecting any A-015 tests because `../../src/services/guidedDuel` does not exist.
Vitest reports one failed suite and no executed test assertions. The full local gate similarly
reports 2,015 pre-existing tests passing and the A-015 suite failing at module load. This is an
import/setup error, so it does not establish that each new test is RED for its intended missing
behavior.

Restructure the pre-freeze test setup so the file collects and the new assertions execute, with
failures attributable to the missing A-015 behaviors. Re-run the dedicated file and record the
individual intended failures before freezing.

## Coverage Assessment

- **Exact ruled seam:** Strongly pinned at lines 30-49. The compile-time checks require exactly
  `openGuidedDuel(seed) -> { state, opponent }`,
  `settleGuidedDuel(store, state) -> DuelRewardOutcome`, and the optional
  `{ rivalHull?, hullFloor? }` initial-state parameter.
- **AC-2 finite-prefix semantics:** Strong and non-vacuous. The bound is derived from engine
  tuning, asserted to be three, and all 40 prefixes over correct/wrong/timeout are enumerated.
  Safety is checked after every reducer transition. Separate 17-turn all-wrong and all-timeout
  traces exceed ordinary hull survivability and are followed by eventual victories.
- **AC-2 terminal behavior:** The correct-only trace requires `victory`, zero rival hull, and
  positive player hull. DoD-5's ordinary-default trace reaches `defeat`, proving that the guided
  safety assertions are not passing because rival damage is globally harmless.
- **AC-3:** The finished-victory happy path covers the latch, persistence/hydration, relaunch, and
  chart destination. The unfinished-state hole is the settlement finding above.
- **AC-5:** The reference-store comparison gives good parity coverage for coins, win, and mastery,
  while the second call checks externally observable per-`duelId` idempotency. The suite does not
  literally spy on the internal `applyDuelOutcome` call count, but its reward parity and unchanged
  duplicate outcome are an appropriate public-behavior assertion.
- **DoD-5 defaults:** Strong. The unparameterized call is compared with explicit `{}`, both hull
  defaults are checked against engine tuning, and ordinary defeat establishes preservation of
  today's floor behavior.

## Independent Verification

- `git diff 30f66b2..8c05d86 -- __tests__/app/guided-duel.test.ts` — empty; the frozen test is
  unchanged by the report-count correction.
- Baseline:
  `npx vitest run --exclude __tests__/app/guided-duel.test.ts` — **PASS**, 41 files / 2,015 tests.
- Dedicated A-015 run — **FAIL at collection**, missing `src/services/guidedDuel.ts`; zero A-015
  assertions execute.
- Scoped Prettier and ESLint for the test/report — **PASS** before this review report was added.
- Spec lint — **PASS**: AC-1 (1), AC-2 (3), AC-3 (1), AC-4 (1), AC-5 (1), DoD-5 (1).
- `npx tsc --noEmit` — expected RED errors for the missing service and not-yet-implemented
  `initialDuelState` signature.
- Full `.tdd-swarm/run-local-gates.sh` — lint, no-TODO, no-skipped-test, and engine-purity gates
  pass. Unit/typecheck are RED for A-015. Format also reports a pre-existing A-018 evidence file,
  and the branch-level frozen-history check reports earlier stacked commits; neither is introduced
  by the A-015 frozen test.
