/**
 * Seeded chest roll resolution — rarity, coin fallback, and missing-cannon grant (A-032).
 */
import { cannons } from '@content/index';
import type { CannonId } from '@content/schemas';
import { rollChest } from '@engine/economy';
import { createRng } from '@engine/rng';

import type { ChestGrant, ChestRarity } from '../contracts/rewards';

export function hashReceiptKey(_key: string): number {
  throw new Error('hashReceiptKey not implemented');
}

export function chestOnlyCannonIds(): readonly CannonId[] {
  return cannons.filter((c) => c.unlock.kind === 'chest').map((c) => c.id);
}

export function missingChestOnlyCannon(_ownedCannons: readonly CannonId[]): CannonId | null {
  throw new Error('missingChestOnlyCannon not implemented');
}

export interface ChestSettlementRoll {
  readonly rarity: ChestRarity;
  readonly coinFallback: number;
  readonly grant: ChestGrant;
  readonly chestCoins: number;
}

export function rollChestSettlement(_seed: number, _ownedCannons: readonly CannonId[]): ChestSettlementRoll {
  throw new Error('rollChestSettlement not implemented');
}

export type RollChestFn = typeof rollChest;
