// Economy — performance coin payout and the seeded chest rarity roll.
//
// PLAN.md §The duel loop: "losing never drops your rank and still pays a small purse".
// Two pure functions: what a duel pays (`computeCoinPayout`), and what a chest turns out
// to be (`rollChest`). Every coefficient, weight, and range is a named `@engine/tuning`
// constant — this module contributes no literal of its own beyond formula structure.

import { CHEST_RARITIES, type ChestRarity } from '@content/schemas';
import { nextInt, weightedPick, type Rng } from '@engine/rng';
import {
  CHEST_COIN_RANGE_BY_RARITY,
  CHEST_RARITY_WEIGHTS,
  COINS_LOSS_BASE,
  COINS_PER_ACCURACY_PERCENT,
  COINS_PER_PERFECT_SHOT,
  COINS_WIN_BASE,
} from '@engine/tuning';

/** The inputs a single duel's payout is priced from. */
export interface DuelPerformance {
  readonly won: boolean;
  readonly correctAnswers: number; // integer >= 0
  readonly totalAnswers: number; // integer >= correctAnswers
  readonly perfectShots: number; // integer >= 0, <= correctAnswers
}

/** A single chest's rarity and its coin payout. */
export interface ChestDrop {
  readonly rarity: ChestRarity;
  readonly coins: number;
}

/**
 * `CHEST_RARITY_WEIGHTS` (T-004) is a `Record<ChestRarity, number>`; `weightedPick` (T-001)
 * takes an array of `{ item, weight }` entries. Built by mapping T-003's `CHEST_RARITIES` id
 * array — never `Object.entries` over the record — so the order that feeds the PRNG is fixed
 * at `common, uncommon, rare` and cannot drift with a key reordering in `tuning.ts` (L-020).
 */
export const CHEST_RARITY_ENTRIES: readonly { readonly item: ChestRarity; readonly weight: number }[] =
  CHEST_RARITIES.map((item) => ({ item, weight: CHEST_RARITY_WEIGHTS[item] }));

/** Throws `RangeError` unless `value` is a non-negative integer. */
function requireNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`computeCoinPayout: ${name} must be a non-negative integer`);
  }
}

/**
 * Prices a single duel's coin payout. `base` is `COINS_WIN_BASE` on a win, `COINS_LOSS_BASE`
 * on a loss — a loss always pays something (PLAN.md: "losing ... still pays a small purse").
 * Rises with accuracy percentage and with perfect-shot count; rounds to an integer coin count.
 */
export function computeCoinPayout(p: DuelPerformance): number {
  requireNonNegativeInteger(p.correctAnswers, 'correctAnswers');
  requireNonNegativeInteger(p.totalAnswers, 'totalAnswers');
  requireNonNegativeInteger(p.perfectShots, 'perfectShots');
  if (p.correctAnswers > p.totalAnswers) {
    throw new RangeError('computeCoinPayout: correctAnswers must be <= totalAnswers');
  }
  if (p.perfectShots > p.correctAnswers) {
    throw new RangeError('computeCoinPayout: perfectShots must be <= correctAnswers');
  }

  const base = p.won ? COINS_WIN_BASE : COINS_LOSS_BASE;
  const accuracy = p.totalAnswers === 0 ? 0 : p.correctAnswers / p.totalAnswers;
  return Math.round(
    base + COINS_PER_ACCURACY_PERCENT * (accuracy * 100) + COINS_PER_PERFECT_SHOT * p.perfectShots,
  );
}

/**
 * Rolls a chest: two draws from the same stream, in order — rarity via `weightedPick` over
 * `CHEST_RARITY_ENTRIES`, then a coin amount via `nextInt` over that rarity's declared range.
 * Threads the `Rng` in and out; consumes no randomness outside the returned advanced `Rng`.
 */
export function rollChest(rng: Rng): readonly [ChestDrop, Rng] {
  const [rarity, rngAfterRarity] = weightedPick(rng, CHEST_RARITY_ENTRIES);
  const range = CHEST_COIN_RANGE_BY_RARITY[rarity];
  const [coins, rngAfterCoins] = nextInt(rngAfterRarity, range.min, range.max);
  return [{ rarity, coins }, rngAfterCoins];
}
