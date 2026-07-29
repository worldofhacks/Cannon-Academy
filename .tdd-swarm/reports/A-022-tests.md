# A-022 Test Agent Report

Status: `TESTS_WRITTEN — CLEAN RED`

## Scope

- Added `__tests__/app/victory-reward-presentation.test.ts`.
- No production, ticket, or existing-test file was edited.
- The worktree did not have its own dependency install. With orchestrator permission, gate runs
  temporarily replaced the ignored local Vitest cache directory with an untracked
  `node_modules -> ../wt-app/node_modules` symlink. The symlink was removed after every run and
  was never staged.

## Frozen contract

The tests freeze one narrow pure seam:

```ts
victoryRewards(outcome: DuelRewardOutcome): {
  readonly coins: number;
  readonly cannons: readonly Cannon[];
};

retainFirstApplied(
  current: DuelRewardOutcome | null,
  observed: DuelRewardOutcome,
): DuelRewardOutcome | null;
```

The cannon objects must be catalog entries resolved from the exact ordered
`outcome.unlockedCannons` ids. The app must retain the first applied settlement outcome and pass
its projection to `VictoryPanel`; repeated idempotent no-payment observations cannot replace it.
`VictoryPanel` may not author any catalog cannon display name and renders cannon claims by mapping
the projected cannon collection.

## Criterion mapping

| Criterion | Frozen evidence |
|---|---|
| AC-1 | Empty-unlock projection preserves actual coins and returns no cannons; the actual returned `VictoryPanel` JSX must place both `cannon.displayName` and the sole `NEW CANNON` badge inside its live `rewards.cannons.map` callback. Dead maps and unconditional badges fail. |
| AC-2 | One deliberately reversed outcome contains every id in the real cannon catalog and must return each exact catalog object in that order; AST inspection rejects authored catalog display names in returned `VictoryPanel` JSX. |
| AC-3 | Real `applyDuelOutcome` crosses the subtraction mastery threshold, then the same projected cannon is owned and appears `isNew` in existing `deckSlots`; one scoped AST/dataflow check follows the exact settlement binding through its matching state setter and `retainFirstApplied` into the rendered `VictoryPanel` prop. |
| AC-4 | Pure sequential behavior retains the first applied object by identity after a no-payment observation and retains `null` when no applied outcome has occurred. The scoped wiring check requires the screen to use that helper on the exact settlement result. |

## Baseline and RED evidence

Baseline command (excluding only the new A-022 file):

```text
npm test -- --run --exclude __tests__/app/victory-reward-presentation.test.ts
Test Files  43 passed (43)
Tests       2034 passed (2034)
```

Targeted RED command:

```text
npm test -- --run __tests__/app/victory-reward-presentation.test.ts
Test Files  1 failed (1)
Tests       7 failed (7)
```

All seven failures are missing-feature assertions, not collection/import/setup errors:

- `src/services/victoryRewards.ts` and its projection/retention helpers are absent.
- `VictoryPanel` does not render its real reward rows from `rewards.cannons`.
- `VictoryPanel` authors `Chain Shot`.
- `app/duel.tsx` does not bind the exact `applyDuelOutcome` result through one retained state
  identity into the live panel.

## Gates

```text
npm run format    PASS
npm run lint      PASS
npm run typecheck PASS
.tdd-swarm/spec-lint.sh tickets/app/A-022.md
  AC-1: 2 tests
  AC-2: 2 tests
  AC-3: 2 tests
  AC-4: 1 test
  SPEC-LINT PASS
git diff --check  PASS
```

The new tests are ready for independent test-design review before freezing.
