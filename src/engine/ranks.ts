/**
 * Rank tier ladder: numeric rank from cumulative win count, with a ratchet guarantee
 * that losing never demotes a player.
 *
 * Ranks are numeric (0..4) not strings, because string ordering (alphabetical) would
 * scramble the leaderboard (ARCHITECTURE.md §5).
 *
 * Thresholds are read from the @content catalog (T-006), not hardcoded.
 * The ratchet is enforced by advanceRank: it always returns max(currentTier, rankTierForWins).
 */

import type { Rank } from '@content/schemas';
import { ranks, getRankByTier } from '@content/index';

/**
 * Helper: validate that a number is a non-negative integer.
 * Used by rankTierForWins and rankForWins to guard against negative and non-integer wins.
 */
function validateNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
  }
}

/**
 * Helper: validate that a tier is in the valid range [0, 4].
 * Used by advanceRank to guard against out-of-range tiers.
 */
function validateTier(tier: number, name: string): void {
  if (!Number.isInteger(tier) || tier < 0 || tier > 4) {
    throw new RangeError(`${name} must be an integer in [0, 4], got ${tier}`);
  }
}

/**
 * Returns the highest rank tier (0..4) whose minWins threshold is <= the given wins.
 * Implements the lookup: find the rank with the greatest minWins that does not exceed wins.
 *
 * AC-1: wins=0 returns tier 0 (cadet)
 * AC-2: wins 0..500 all return integers in [0,4], non-decreasing sequence
 * AC-3: at each rank.minWins boundary, returns exactly that rank.tier (inclusive)
 * AC-4: one win short of each boundary stays at tier - 1
 * AC-5: wins above highest minWins return tier 4 (fleet_legend)
 * AC-9: negative or non-integer wins throw RangeError
 */
export function rankTierForWins(wins: number): number {
  validateNonNegativeInteger(wins, 'wins');

  // Find the highest-tier rank whose minWins does not exceed wins.
  // Because minWins is strictly increasing (T-006 AC-7), the last match is the answer.
  let resultTier = 0; // Default to cadet (tier 0)

  for (const rank of ranks) {
    if (rank.minWins <= wins) {
      resultTier = rank.tier;
    }
  }

  return resultTier;
}

/**
 * Returns the Rank catalog entry for the given win count.
 * Looks up the rank corresponding to rankTierForWins(wins).
 *
 * AC-1: rankForWins(0).id is "cadet"
 * AC-3: at each rank boundary, returns the correct rank entry
 * AC-5: above highest minWins returns fleet_legend
 * AC-9: negative or non-integer wins throw RangeError
 */
export function rankForWins(wins: number): Rank {
  validateNonNegativeInteger(wins, 'wins');

  const tier = rankTierForWins(wins);
  return rankByTier(tier);
}

/**
 * Advances a player's rank by comparing their current tier with the tier they've earned.
 * Returns max(currentTier, rankTierForWins(wins)) — a ratchet that never demotes.
 *
 * This is the child-safety guarantee: losing a duel (which does not increase wins) can never
 * lower a tier. The API design ensures no code path can express a demotion.
 *
 * AC-6: advanceRank(3, 0) returns 3 (no demotion on loss)
 * AC-6: advanceRank(0, w) where w promotes to tier 2 returns 2
 * AC-7: over 1,000 combinations, always returns >= currentTier and <= 4
 * AC-8: simulated career with losses shows tier is non-decreasing and no loss changes tier
 * AC-9: negative/non-integer wins or invalid currentTier throw RangeError
 */
export function advanceRank(currentTier: number, wins: number): number {
  validateTier(currentTier, 'currentTier');
  validateNonNegativeInteger(wins, 'wins');

  const earnedTier = rankTierForWins(wins);
  return Math.max(currentTier, earnedTier);
}

/**
 * Looks up a rank by its tier number (0..4).
 * Returns the Rank catalog entry or throws if tier is out of range.
 *
 * AC-10: rankByTier(t) for t in [0,4] returns matching catalog rank
 * AC-10: rankByTier(5) or rankByTier(-1) throw an Error naming the missing tier
 */
export function rankByTier(tier: number): Rank {
  // Use getRankByTier from @content/index, which throws if the tier is not found.
  // Provide a better error message for out-of-range tiers.
  try {
    return getRankByTier(tier);
  } catch (err) {
    // Enrich the error message to clearly name the missing tier per AC-10
    if (tier < 0 || tier > 4) {
      throw new Error(`rankByTier: no rank with tier ${tier}`);
    }
    // If we still got an error despite tier being in range, re-throw the original
    throw err;
  }
}
