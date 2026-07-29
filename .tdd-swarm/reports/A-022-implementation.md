# A-022 Implementation Report

Status: **DONE**

## Production changes

- Added `victoryRewards` to project the exact applied coin amount and catalog cannons named by
  `DuelRewardOutcome.unlockedCannons`.
- Added `retainFirstApplied` so a repeated idempotent settlement cannot erase the first applied
  outcome.
- Retained settlement in `DuelScreen`, clearing it only when a new duel id starts, and passed that
  exact projection to `VictoryPanel`.
- Removed the authored “Chain Shot” claim. Cannon cards now render only for actual unlocks; the Gun
  deck remains driven by the captain store.

## Gate evidence

- Frozen A-022 suite: **7/7 passed**
- Prettier (allowed production paths): **passed**
- ESLint (allowed production paths): **passed**
- TypeScript `tsc --noEmit`: **passed**

No frozen test file was edited.
