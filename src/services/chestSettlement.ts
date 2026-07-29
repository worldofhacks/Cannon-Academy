/**
 * Seeded chest roll resolution — rarity, coin fallback, and missing-cannon grant (A-032).
 */
import { cannons } from '@content/index';
import type { CannonId } from '@content/schemas';
import { rollChest } from '@engine/economy';
import { createRng } from '@engine/rng';

import type { ChestGrant } from '../contracts/rewards';
import type { ChestRarity } from '@content/schemas';

/** Stable 32-bit FNV-1a hash for purchase receipt seeds. */
export function hashReceiptKey(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function chestOnlyCannonIds(): readonly CannonId[] {
  return cannons.filter((c) => c.unlock.kind === 'chest').map((c) => c.id);
}

/** The first catalog chest-only cannon the captain does not yet own. */
export function missingChestOnlyCannon(ownedCannons: readonly CannonId[]): CannonId | null {
  const owned = new Set(ownedCannons);
  for (const id of chestOnlyCannonIds()) {
    if (!owned.has(id)) return id;
  }
  return null;
}

export interface ChestSettlementRoll {
  readonly rarity: ChestRarity;
  readonly coinFallback: number;
  readonly grant: ChestGrant;
  readonly chestCoins: number;
}

export function rollChestSettlement(
  seed: number,
  ownedCannons: readonly CannonId[],
  roll: typeof rollChest = rollChest,
): ChestSettlementRoll {
  const [drop] = roll(createRng(seed));
  const missing = drop.rarity === 'rare' ? missingChestOnlyCannon(ownedCannons) : null;

  if (missing !== null) {
    return {
      rarity: drop.rarity,
      coinFallback: drop.coins,
      grant: { kind: 'cannon', cannonId: missing },
      chestCoins: 0,
    };
  }

  return {
    rarity: drop.rarity,
    coinFallback: drop.coins,
    grant: { kind: 'coins', amount: drop.coins },
    chestCoins: drop.coins,
  };
}

export type RollChestFn = typeof rollChest;
