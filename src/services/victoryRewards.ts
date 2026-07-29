import { getCannon } from '../content/index';
import type { Cannon } from '../content/schemas';

import type { DuelRewardOutcome } from './duelRewards';

export interface VictoryRewardProjection {
  readonly coins: number;
  readonly cannons: readonly Cannon[];
}

/** Presents exactly the rewards applied by settlement, in settlement order. */
export function victoryRewards(outcome: DuelRewardOutcome): VictoryRewardProjection {
  return {
    coins: outcome.coins,
    cannons: outcome.unlockedCannons.map(getCannon),
  };
}

/** Keeps an applied outcome through later idempotent no-payment observations. */
export function retainFirstApplied(
  current: DuelRewardOutcome | null,
  observed: DuelRewardOutcome,
): DuelRewardOutcome | null {
  if (current !== null) return current;
  return observed.applied ? observed : null;
}
