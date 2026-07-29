/**
 * Chest tier colours — board 7c's non-reader-friendly rarity treatment (A-010).
 *
 * Each rarity maps to a token triple so the tier reads through colour, not only the word.
 */
import { getCannon } from '../content/index';
import type { ChestRarity } from '@content/schemas';
import type { ChestReceipt } from '../contracts/rewards';
import type { VictoryRewardProjection } from '../services/victoryRewards';

import { color } from './tokens';

export interface ChestRarityLook {
  readonly fill: string;
  readonly border: string;
  readonly label: string;
}

export const chestRarityLook: Record<ChestRarity, ChestRarityLook> = {
  common: {
    fill: color.chipBg,
    border: color.borderStrong,
    label: color.chipInk,
  },
  uncommon: {
    fill: color.sea,
    border: color.seaFoam,
    label: color.white,
  },
  rare: {
    fill: color.purple,
    border: color.gold,
    label: color.gold,
  },
};

export interface ChestCeremonyProjection {
  readonly rarity: ChestRarity;
  readonly label: string;
  readonly look: ChestRarityLook;
  readonly grant:
    | { readonly kind: 'cannon'; readonly displayName: string }
    | { readonly kind: 'coins'; readonly amount: number };
  readonly purseCoins: number;
}

/** Projects the retained A-032 receipt — observation only, never rolls or grants. */
export function projectChestCeremony(
  chestReceipt: ChestReceipt,
  rewards: VictoryRewardProjection,
): ChestCeremonyProjection {
  const look = chestRarityLook[chestReceipt.rarity];
  const grant =
    chestReceipt.grant.kind === 'cannon'
      ? {
          kind: 'cannon' as const,
          displayName: getCannon(chestReceipt.grant.cannonId).displayName,
        }
      : { kind: 'coins' as const, amount: chestReceipt.grant.amount };

  return {
    rarity: chestReceipt.rarity,
    label: chestReceipt.rarity.toUpperCase(),
    look,
    grant,
    purseCoins: rewards.coins,
  };
}
