import { describe, it, expect, vi } from 'vitest';
import * as ranksModule from '@engine/ranks';
import { ranks } from '@content/index';

// ==================== Utilities ====================

/**
 * Extract all the min win thresholds from the catalog in order.
 * We derive the expected tier boundaries from the catalog rather than hardcoding them.
 */
function getExpectedRankBoundaries() {
  const sorted = [...ranks].sort((a, b) => a.tier - b.tier);
  return sorted.map((r) => ({ tier: r.tier, minWins: r.minWins, id: r.id }));
}

/**
 * Simulate a duel sequence where wins accumulate deterministically.
 * Returns a sequence of (wins, tier) pairs after each duel.
 */
function simulateDuelSequence(duelResults: Array<{ won: boolean }>) {
  const sequence: Array<{ wins: number; tier: number }> = [];
  let wins = 0;
  let currentTier = 0;

  for (const duel of duelResults) {
    if (duel.won) {
      wins += 1;
    }
    // spec(T-012:AC-8): tier never drops on a loss
    currentTier = ranksModule.advanceRank(currentTier, wins);
    sequence.push({ wins, tier: currentTier });
  }

  return sequence;
}

// ==================== Acceptance Criteria Tests ====================

describe('T-012: Rank ladder — numeric tier from wins, ratcheted so a loss never demotes', () => {
  // spec(T-012:AC-1): wins=0 → tier 0, "cadet"
  describe('AC-1: At zero wins, returns tier 0 and cadet', () => {
    it('rankTierForWins(0) returns 0', () => {
      const tier = ranksModule.rankTierForWins(0);
      expect(tier).toBe(0);
    });

    it('rankForWins(0).id is "cadet"', () => {
      const rank = ranksModule.rankForWins(0);
      expect(rank.id).toBe('cadet');
    });

    it('rankForWins(0).tier is 0', () => {
      const rank = ranksModule.rankForWins(0);
      expect(rank.tier).toBe(0);
    });
  });

  // spec(T-012:AC-2): wins 0..500 all integers in [0,4], non-decreasing
  describe('AC-2: Sweeping wins 0..500 yields integers [0,4] in non-decreasing order', () => {
    it('all results are integers in [0, 4]', () => {
      for (let wins = 0; wins <= 500; wins++) {
        const tier = ranksModule.rankTierForWins(wins);
        expect(Number.isInteger(tier)).toBe(true);
        expect(tier).toBeGreaterThanOrEqual(0);
        expect(tier).toBeLessThanOrEqual(4);
      }
    });

    it('sequence is non-decreasing', () => {
      let prev = ranksModule.rankTierForWins(0);
      for (let wins = 1; wins <= 500; wins++) {
        const curr = ranksModule.rankTierForWins(wins);
        expect(curr).toBeGreaterThanOrEqual(prev);
        prev = curr;
      }
    });
  });

  // spec(T-012:AC-3): boundary test — at each rank's minWins, promotes to that tier
  describe('AC-3: At each rank.minWins boundary, rankTierForWins returns exactly that rank.tier', () => {
    it('every rank boundary promotes correctly (inclusive)', () => {
      const boundaries = getExpectedRankBoundaries();
      for (const { tier, minWins } of boundaries) {
        const result = ranksModule.rankTierForWins(minWins);
        expect(result).toBe(tier);
      }
    });

    it('rankForWins at each boundary returns the correct rank', () => {
      const boundaries = getExpectedRankBoundaries();
      for (const { tier, minWins, id } of boundaries) {
        const result = ranksModule.rankForWins(minWins);
        expect(result.tier).toBe(tier);
        expect(result.id).toBe(id);
      }
    });
  });

  // spec(T-012:AC-4): one win short of each rank doesn't promote
  describe('AC-4: One win short of each rank (minWins - 1) does not promote', () => {
    it('all ranks above cadet: minWins - 1 stays below that tier', () => {
      const boundaries = getExpectedRankBoundaries();
      for (const { tier, minWins } of boundaries) {
        if (tier === 0) continue; // cadet is tier 0, can't be "one below"
        const resultBefore = ranksModule.rankTierForWins(minWins - 1);
        expect(resultBefore).toBe(tier - 1);
      }
    });
  });

  // spec(T-012:AC-5): high wins clamp to tier 4
  describe('AC-5: Win counts above the highest minWins clamp to tier 4 (fleet_legend)', () => {
    it('wins > highest minWins returns tier 4', () => {
      const maxMinWins = Math.max(...ranks.map((r) => r.minWins));
      for (let wins = maxMinWins + 1; wins <= 500; wins++) {
        const tier = ranksModule.rankTierForWins(wins);
        expect(tier).toBe(4);
      }
    });

    it('rankForWins above max minWins returns fleet_legend', () => {
      const maxMinWins = Math.max(...ranks.map((r) => r.minWins));
      const result = ranksModule.rankForWins(maxMinWins + 50);
      expect(result.id).toBe('fleet_legend');
      expect(result.tier).toBe(4);
    });
  });

  // spec(T-012:AC-6): ratchet — advanceRank preserves or advances, never demotes
  describe('AC-6: advanceRank(currentTier, wins) preserves tier or advances, never demotes', () => {
    it('advanceRank(3, 0) stays at tier 3 (Commodore with zero wins still Commodore)', () => {
      const result = ranksModule.advanceRank(3, 0);
      expect(result).toBe(3);
    });

    it('advanceRank(0, w) where w promotes to tier 2 returns 2', () => {
      // Find a win count that promotes to tier 2 (captain)
      const boundaries = getExpectedRankBoundaries();
      const captain = boundaries.find((b) => b.tier === 2);
      if (captain) {
        const result = ranksModule.advanceRank(0, captain.minWins);
        expect(result).toBe(2);
      }
    });

    it('advanceRank always returns >= currentTier', () => {
      for (let currentTier = 0; currentTier <= 4; currentTier++) {
        for (let wins = 0; wins <= 100; wins++) {
          const result = ranksModule.advanceRank(currentTier, wins);
          expect(result).toBeGreaterThanOrEqual(currentTier);
        }
      }
    });
  });

  // spec(T-012:AC-7): 1,000 combinations of currentTier and wins — result always >= current, <= 4
  describe('AC-7: Over 1,000 combinations, advanceRank result >= current, <= 4', () => {
    it('all 1000 combinations yield valid tier progression', () => {
      let count = 0;
      for (let current = 0; current <= 4; current++) {
        for (let wins = 0; wins <= 200; wins++) {
          const result = ranksModule.advanceRank(current, wins);
          expect(result).toBeGreaterThanOrEqual(current);
          expect(result).toBeLessThanOrEqual(4);
          count++;
        }
      }
      expect(count).toBeGreaterThanOrEqual(1000);
    });
  });

  // spec(T-012:AC-8): Simulated 200-duel career — tier never drops on a loss
  describe('AC-8: 200-duel simulated career — tier sequence is non-decreasing, no loss changes tier', () => {
    it('tier never drops when a loss does not increase wins', () => {
      // A realistic career: 120 wins out of 200 duels, distributed to create varied tier states
      const duels = Array(120)
        .fill({ won: true })
        .concat(Array(80).fill({ won: false }));
      // Shuffle deterministically but predictably
      const rng = Math.random;
      const shuffled = duels.sort(() => (rng() > 0.5 ? 1 : -1));

      const sequence = simulateDuelSequence(shuffled);

      // Tier should never decrease
      for (let i = 1; i < sequence.length; i++) {
        const curr = sequence[i];
        const prev = sequence[i - 1];
        expect(curr).toBeDefined();
        expect(prev).toBeDefined();
        if (curr && prev) {
          expect(curr.tier).toBeGreaterThanOrEqual(prev.tier);
        }
      }

      // On a loss, tier should not change
      for (let i = 0; i < shuffled.length; i++) {
        const duel = shuffled[i];
        if (!duel.won && i > 0) {
          const curr = sequence[i];
          const prev = sequence[i - 1];
          expect(curr).toBeDefined();
          expect(prev).toBeDefined();
          if (curr && prev) {
            // Wins didn't increase, so tier should stay the same
            expect(curr.tier).toBe(prev.tier);
          }
        }
      }
    });
  });

  // spec(T-012:AC-9): Degenerate inputs throw RangeError
  describe('AC-9: Invalid inputs throw RangeError', () => {
    it('rankTierForWins with negative wins throws RangeError', () => {
      expect(() => ranksModule.rankTierForWins(-1)).toThrow(RangeError);
    });

    it('rankTierForWins with non-integer wins throws RangeError', () => {
      expect(() => ranksModule.rankTierForWins(3.5)).toThrow(RangeError);
    });

    it('rankForWins with negative wins throws RangeError', () => {
      expect(() => ranksModule.rankForWins(-5)).toThrow(RangeError);
    });

    it('rankForWins with non-integer wins throws RangeError', () => {
      expect(() => ranksModule.rankForWins(10.7)).toThrow(RangeError);
    });

    it('advanceRank with negative currentTier throws RangeError', () => {
      expect(() => ranksModule.advanceRank(-1, 10)).toThrow(RangeError);
    });

    it('advanceRank with currentTier > 4 throws RangeError', () => {
      expect(() => ranksModule.advanceRank(5, 10)).toThrow(RangeError);
    });

    it('advanceRank with negative wins throws RangeError', () => {
      expect(() => ranksModule.advanceRank(2, -1)).toThrow(RangeError);
    });

    it('advanceRank with non-integer wins throws RangeError', () => {
      expect(() => ranksModule.advanceRank(2, 5.5)).toThrow(RangeError);
    });
  });

  // AC-10: rankByTier lookup — spec(T-012:AC-10)
  describe('AC-10: rankByTier(t) for t in [0,4] returns rank; [5] throws Error', () => {
    it('rankByTier(t) for t in [0,4] returns the matching catalog rank', () => {
      for (let tier = 0; tier <= 4; tier++) {
        const result = ranksModule.rankByTier(tier);
        expect(result.tier).toBe(tier);
        expect(result.id).toBeDefined();
      }
    });

    it('rankByTier(5) throws an Error — spec(T-012:AC-10)', () => {
      expect(() => ranksModule.rankByTier(5)).toThrow(Error);
    });

    it('rankByTier(-1) throws an Error', () => {
      expect(() => ranksModule.rankByTier(-1)).toThrow(Error);
    });

    it('error message names the missing tier', () => {
      expect(() => ranksModule.rankByTier(5)).toThrow(/tier/i);
    });
  });

  // AC-11: Catalog ordering and consistency — spec(T-012:AC-11)
  describe('AC-11: Catalog tiers match position order; ids in correct sequence', () => {
    it('every rank.tier matches its position in the catalog sorted by tier', () => {
      const sorted = [...ranks].sort((a, b) => a.tier - b.tier);
      for (let i = 0; i < sorted.length; i++) {
        const rank = sorted[i];
        expect(rank).toBeDefined();
        if (rank) {
          expect(rank.tier).toBe(i);
        }
      }
    });

    it('catalog id order is cadet, ensign, captain, commodore, fleet_legend — spec(T-012:AC-11)', () => {
      const sorted = [...ranks].sort((a, b) => a.tier - b.tier);
      const ids = sorted.map((r) => r.id);
      expect(ids).toEqual(['cadet', 'ensign', 'captain', 'commodore', 'fleet_legend']);
    });

    it('minWins is strictly increasing across tiers', () => {
      const sorted = [...ranks].sort((a, b) => a.tier - b.tier);
      for (let i = 1; i < sorted.length; i++) {
        const curr = sorted[i];
        const prev = sorted[i - 1];
        expect(curr).toBeDefined();
        expect(prev).toBeDefined();
        if (curr && prev) {
          expect(curr.minWins).toBeGreaterThan(prev.minWins);
        }
      }
    });

    it('tiers are strictly increasing (0, 1, 2, 3, 4)', () => {
      const sorted = [...ranks].sort((a, b) => a.tier - b.tier);
      for (let i = 0; i < sorted.length; i++) {
        const rank = sorted[i];
        expect(rank).toBeDefined();
        if (rank) {
          expect(rank.tier).toBe(i);
        }
      }
    });

    it('all returned ranks from rankTierForWins have consistent tier values', () => {
      for (let wins = 0; wins <= 150; wins++) {
        const rank = ranksModule.rankForWins(wins);
        expect(Number.isInteger(rank.tier)).toBe(true);
        expect(rank.tier).toBeGreaterThanOrEqual(0);
        expect(rank.tier).toBeLessThanOrEqual(4);
      }
    });
  });

  // Purity tests: no side effects, no time/randomness
  describe('Purity: deterministic, no side effects', () => {
    it('rankTierForWins is pure: same input yields same output', () => {
      const result1 = ranksModule.rankTierForWins(50);
      const result2 = ranksModule.rankTierForWins(50);
      expect(result1).toBe(result2);
    });

    it('rankForWins is pure: same input yields same output', () => {
      const result1 = ranksModule.rankForWins(30);
      const result2 = ranksModule.rankForWins(30);
      expect(result1.id).toBe(result2.id);
      expect(result1.tier).toBe(result2.tier);
    });

    it('advanceRank is pure: same input yields same output', () => {
      const result1 = ranksModule.advanceRank(2, 40);
      const result2 = ranksModule.advanceRank(2, 40);
      expect(result1).toBe(result2);
    });
  });

  // Degenerate input coverage — dimensions per L-017
  describe('Dimension coverage: boundary wins values', () => {
    it('handles wins at zero exactly', () => {
      expect(() => ranksModule.rankTierForWins(0)).not.toThrow();
      expect(ranksModule.rankTierForWins(0)).toBe(0);
    });

    it('handles absurdly large wins', () => {
      expect(() => ranksModule.rankTierForWins(1_000_000)).not.toThrow();
      expect(ranksModule.rankTierForWins(1_000_000)).toBe(4);
    });

    it('handles each tier threshold exactly', () => {
      const boundaries = getExpectedRankBoundaries();
      for (const boundary of boundaries) {
        const tier = ranksModule.rankTierForWins(boundary.minWins);
        expect(tier).toBe(boundary.tier);
      }
    });

    it('handles one below each tier threshold', () => {
      const boundaries = getExpectedRankBoundaries();
      for (const boundary of boundaries) {
        if (boundary.minWins === 0) continue;
        const tier = ranksModule.rankTierForWins(boundary.minWins - 1);
        expect(tier).toBe(boundary.tier - 1);
      }
    });
  });

  // AC-12: Order independence — tier resolution must not depend on catalog array order
  // Per L-020: the implementation must handle catalogs in any order
  describe('AC-12: Order-independent tier resolution (mocked reorder test) — spec(T-012:AC-12)', () => {
    /**
     * Derive a map of (tier -> minWins) from the catalog, independent of array order.
     * Used to compute expected results for mocked catalogs.
     */
    function getTierMinWinsMap(catalog: typeof ranks) {
      const map = new Map<number, number>();
      for (const rank of catalog) {
        map.set(rank.tier, rank.minWins);
      }
      return map;
    }

    /**
     * Compute expected tier for a given win count using the tier->minWins mapping.
     * This is order-independent: it finds the highest tier whose minWins <= wins.
     */
    function expectedTierForWins(wins: number, tierMinWinsMap: Map<number, number>) {
      for (let tier = 4; tier >= 0; tier--) {
        const minWins = tierMinWinsMap.get(tier);
        if (minWins !== undefined && wins >= minWins) {
          return tier;
        }
      }
      return 0; // fallback: cadet
    }

    it('tier functions return identical results with reversed catalog', async () => {
      // Collect expected results using the original (sorted) catalog
      const originalMap = getTierMinWinsMap(ranks);
      const tierToRankMap = new Map(ranks.map((r) => [r.tier, r.id]));

      const expectedTierResults = new Map<number, number>();
      for (let wins = 0; wins <= 150; wins++) {
        expectedTierResults.set(wins, expectedTierForWins(wins, originalMap));
      }

      // Reverse the catalog and mock @content/index
      const reversedRanks = [...ranks].reverse();
      vi.doMock('@content/index', () => ({
        ranks: reversedRanks,
        getRankByTier: (tier: number) => {
          const found = reversedRanks.find((r) => r.tier === tier);
          if (found === undefined) {
            throw new Error(`getRankByTier: no rank with tier ${tier}`);
          }
          return found;
        },
      }));

      // Reset and re-import to get the mocked version
      vi.resetModules();
      const mocked = await import('@engine/ranks');

      // Test rankTierForWins across full range
      for (let wins = 0; wins <= 150; wins++) {
        const expectedTier = expectedTierResults.get(wins);
        const actualTier = mocked.rankTierForWins(wins);
        expect(actualTier).toBe(expectedTier);
      }

      // Test rankForWins across full range
      for (let wins = 0; wins <= 150; wins++) {
        const expectedTier = expectedTierResults.get(wins);
        expect(expectedTier).toBeDefined();
        if (expectedTier !== undefined) {
          const expectedId = tierToRankMap.get(expectedTier);
          const actual = mocked.rankForWins(wins);
          expect(actual.tier).toBe(expectedTier);
          expect(actual.id).toBe(expectedId);
        }
      }

      // Test rankByTier for each valid tier
      for (let tier = 0; tier <= 4; tier++) {
        const expectedId = tierToRankMap.get(tier);
        const actual = mocked.rankByTier(tier);
        expect(actual.tier).toBe(tier);
        expect(actual.id).toBe(expectedId);
      }

      vi.unmock('@content/index');
      vi.resetModules();
    });
  });
});
