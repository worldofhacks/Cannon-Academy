import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRng, nextInt, type Rng } from '@engine/rng';
import {
  CHEST_COIN_RANGE_BY_RARITY,
  CHEST_RARITY_WEIGHTS,
  COINS_LOSS_BASE,
  COINS_PER_ACCURACY_PERCENT,
  COINS_PER_PERFECT_SHOT,
  COINS_WIN_BASE,
} from '@engine/tuning';
import { CHEST_RARITIES, type ChestRarity } from '@content/schemas';
import {
  CHEST_RARITY_ENTRIES,
  computeCoinPayout,
  rollChest,
  type ChestDrop,
  type DuelPerformance,
} from '@engine/economy';

// T-009 — Economy: performance coin payout and seeded chest rarity roll.
//
// PLAN.md §The duel loop: "losing never drops your rank and still pays a small purse" —
// this is the pedagogical guarantee this suite exists to protect (Context: "a loss that
// pays nothing teaches a six-year-old that trying wasn't worth it").
//
// ---------------------------------------------------------------------------------------
// HOW THIS SUITE IS BUILT — the LESSONS.md entries that shaped it.
// ---------------------------------------------------------------------------------------
//   L-006 / L-018 — direction is not magnitude. `COINS_PER_ACCURACY_PERCENT` and
//           `COINS_PER_PERFECT_SHOT` are bounded only `> 0` in tuning.ts, satisfied by
//           `1e-9` — a rate that vanishes under `Math.round`. AC-3 and AC-4 below assert
//           the FULL swept sequence (every adjacent pair, not just the endpoints) and pin
//           every step to the exact formula computed from the real imported constants, so
//           an economy.ts that hardcodes its own tiny literal instead of importing the
//           tuning constant (violating this ticket's DoD) fails here even though it might
//           satisfy a looser "payout increases with accuracy" check.
//   L-012 — an aggregate certifies a projection, not the mechanism. The chest-rarity
//           distribution test (AC-8) is backed by BOTH the frequency band AND a per-draw
//           membership check (no rarity outside `ChestRarity` ever appears); AC-10's
//           rarity-pays-better claim is asserted on the actual per-rarity coin sample mean,
//           not inferred from the tuning constants' own min/max ordering.
//   L-017 — cover dimensions, not cases. `computeCoinPayout`'s AC-1/AC-2 sweep every
//           combination of {won, totalAnswers, correctness fraction, perfect fraction} at
//           their extremes (0, half, all), not a handful of representative performances.
//           AC-6's invalid-input sweep exercises every one of the eight named failure axes
//           independently rather than one bundled "bad input" case.
//   L-011 — this suite was proven green against a throwaway scratchpad reference
//           implementation, then that reference was mutated once per assertion class
//           (weight-ignoring rarity roll, vanishing accuracy/perfect rate, missing
//           validation, wrong CHEST_RARITY_ENTRIES ordering) to confirm every mutation is
//           caught. The reference was deleted before this file was committed.

// ---------------------------------------------------------------------------------------
// Helpers over the public API and the documented formula only.
// ---------------------------------------------------------------------------------------

/**
 * The exact payout formula from tickets/T-009.md's Context section, computed from the
 * REAL imported tuning constants (never a hardcoded literal) — used for exact-equality
 * checks so a mismatch names the coefficient, not just "increases".
 */
function formulaPayout(
  won: boolean,
  correctAnswers: number,
  totalAnswers: number,
  perfectShots: number,
): number {
  const base = won ? COINS_WIN_BASE : COINS_LOSS_BASE;
  const accuracy = totalAnswers === 0 ? 0 : correctAnswers / totalAnswers;
  return Math.round(
    base + COINS_PER_ACCURACY_PERCENT * (accuracy * 100) + COINS_PER_PERFECT_SHOT * perfectShots,
  );
}

/** Builds a valid, integer-respecting DuelPerformance from fractions of total/correct. */
function buildPerformance(
  won: boolean,
  totalAnswers: number,
  correctFraction: number,
  perfectFraction: number,
): DuelPerformance {
  const correctAnswers = Math.round(totalAnswers * correctFraction);
  const perfectShots = Math.round(correctAnswers * perfectFraction);
  return { won, correctAnswers, totalAnswers, perfectShots };
}

/** The dimensions AC-1/AC-2 sweep: totals, and correctness/perfect fractions at their ends. */
const TOTAL_ANSWERS_DIMENSION = [0, 1, 5, 10, 37] as const;
const FRACTION_DIMENSION = [0, 0.5, 1] as const;

function rollMany(seed: number, count: number): readonly ChestDrop[] {
  let rng: Rng = createRng(seed);
  const drops: ChestDrop[] = [];
  for (let i = 0; i < count; i += 1) {
    const [drop, nextRng] = rollChest(rng);
    drops.push(drop);
    rng = nextRng;
  }
  return drops;
}

// =========================================================================================
describe('T-009 economy — computeCoinPayout: bounds and purse guarantee', () => {
  // spec(T-009:AC-1)
  it('pays every valid performance a finite positive integer, across every dimension', () => {
    for (const won of [true, false]) {
      for (const total of TOTAL_ANSWERS_DIMENSION) {
        for (const correctFraction of FRACTION_DIMENSION) {
          for (const perfectFraction of FRACTION_DIMENSION) {
            const p = buildPerformance(won, total, correctFraction, perfectFraction);
            const payout = computeCoinPayout(p);
            expect(Number.isFinite(payout), JSON.stringify(p)).toBe(true);
            expect(Number.isInteger(payout), JSON.stringify(p)).toBe(true);
            expect(payout, JSON.stringify(p)).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  // spec(T-009:AC-1)
  it('pays a nonzero purse at the worst possible loss — last place still pays', () => {
    // PLAN.md: "losing ... still pays a small purse". The single most important input:
    // a loss, zero correct answers, zero perfects.
    const worst: DuelPerformance = { won: false, correctAnswers: 0, totalAnswers: 10, perfectShots: 0 };
    const payout = computeCoinPayout(worst);
    expect(Number.isInteger(payout)).toBe(true);
    expect(payout).toBeGreaterThan(0);
  });

  // spec(T-009:AC-2)
  it('always pays a win strictly more than an identical loss', () => {
    for (const total of TOTAL_ANSWERS_DIMENSION) {
      for (const correctFraction of FRACTION_DIMENSION) {
        for (const perfectFraction of FRACTION_DIMENSION) {
          const correctAnswers = Math.round(total * correctFraction);
          const perfectShots = Math.round(correctAnswers * perfectFraction);
          const win = computeCoinPayout({ won: true, correctAnswers, totalAnswers: total, perfectShots });
          const loss = computeCoinPayout({ won: false, correctAnswers, totalAnswers: total, perfectShots });
          expect(win, JSON.stringify({ total, correctAnswers, perfectShots })).toBeGreaterThan(loss);
        }
      }
    }
  });

  // spec(T-009:AC-3)
  it('is non-decreasing as correctAnswers sweeps 0..10 of 10, strictly higher at the top', () => {
    for (const won of [true, false]) {
      const sequence: number[] = [];
      for (let correct = 0; correct <= 10; correct += 1) {
        sequence.push(computeCoinPayout({ won, correctAnswers: correct, totalAnswers: 10, perfectShots: 0 }));
      }
      // Every adjacent pair (L-012), not just the two endpoints.
      for (let i = 1; i < sequence.length; i += 1) {
        expect(sequence[i], `won=${won} correct=${i}`).toBeGreaterThanOrEqual(sequence[i - 1] as number);
      }
      expect(sequence[10], `won=${won}`).toBeGreaterThan(sequence[0] as number);
      // Exact formula at every step — the anti-vanishing-rate guard (L-006).
      for (let correct = 0; correct <= 10; correct += 1) {
        expect(sequence[correct], `won=${won} correct=${correct}`).toBe(formulaPayout(won, correct, 10, 0));
      }
    }
  });

  // spec(T-009:AC-4)
  it('strictly increases as perfectShots sweeps 0..8, at every step', () => {
    for (const won of [true, false]) {
      const sequence: number[] = [];
      for (let perfect = 0; perfect <= 8; perfect += 1) {
        sequence.push(computeCoinPayout({ won, correctAnswers: 8, totalAnswers: 8, perfectShots: perfect }));
      }
      for (let i = 1; i < sequence.length; i += 1) {
        expect(sequence[i], `won=${won} perfectShots=${i}`).toBeGreaterThan(sequence[i - 1] as number);
      }
      for (let perfect = 0; perfect <= 8; perfect += 1) {
        expect(sequence[perfect], `won=${won} perfectShots=${perfect}`).toBe(
          formulaPayout(won, 8, 8, perfect),
        );
      }
    }
  });

  // spec(T-009:AC-5)
  it('pays a finite positive integer for a duel abandoned before any answer, never NaN', () => {
    for (const won of [true, false]) {
      const payout = computeCoinPayout({ won, correctAnswers: 0, totalAnswers: 0, perfectShots: 0 });
      expect(Number.isNaN(payout), `won=${won}`).toBe(false);
      expect(Number.isFinite(payout), `won=${won}`).toBe(true);
      expect(Number.isInteger(payout), `won=${won}`).toBe(true);
      expect(payout, `won=${won}`).toBeGreaterThan(0);
      expect(payout, `won=${won}`).toBe(formulaPayout(won, 0, 0, 0));
    }
  });

  // spec(T-009:AC-6)
  it.each([
    ['negative correctAnswers', { won: true, correctAnswers: -1, totalAnswers: 10, perfectShots: 0 }],
    ['negative totalAnswers', { won: true, correctAnswers: 0, totalAnswers: -1, perfectShots: 0 }],
    ['negative perfectShots', { won: true, correctAnswers: 5, totalAnswers: 10, perfectShots: -1 }],
    ['non-integer correctAnswers', { won: true, correctAnswers: 2.5, totalAnswers: 10, perfectShots: 0 }],
    ['non-integer totalAnswers', { won: true, correctAnswers: 2, totalAnswers: 10.5, perfectShots: 0 }],
    ['non-integer perfectShots', { won: true, correctAnswers: 5, totalAnswers: 10, perfectShots: 1.5 }],
    ['correctAnswers > totalAnswers', { won: true, correctAnswers: 11, totalAnswers: 10, perfectShots: 0 }],
    ['perfectShots > correctAnswers', { won: true, correctAnswers: 3, totalAnswers: 10, perfectShots: 4 }],
  ] as const satisfies readonly [string, DuelPerformance][])(
    'throws RangeError for %s',
    (_name, performance) => {
      expect(() => computeCoinPayout(performance)).toThrow(RangeError);
    },
  );

  // spec(T-009:AC-7)
  it('is pure — 100 repeated calls on each of several performances all agree', () => {
    const samples: readonly DuelPerformance[] = [
      { won: true, correctAnswers: 10, totalAnswers: 10, perfectShots: 8 },
      { won: false, correctAnswers: 0, totalAnswers: 10, perfectShots: 0 },
      { won: true, correctAnswers: 0, totalAnswers: 0, perfectShots: 0 },
      { won: false, correctAnswers: 7, totalAnswers: 13, perfectShots: 3 },
    ];
    for (const p of samples) {
      const first = computeCoinPayout(p);
      for (let i = 0; i < 100; i += 1) {
        expect(computeCoinPayout(p), JSON.stringify(p)).toBe(first);
      }
    }
  });
});

// =========================================================================================
describe('T-009 economy — rollChest: seeded rarity and coin roll', () => {
  const SEED = 31337;
  const SAMPLE_SIZE = 100_000;
  let drops: readonly ChestDrop[];

  beforeAll(() => {
    drops = rollMany(SEED, SAMPLE_SIZE);
  });

  // spec(T-009:AC-8)
  it('matches the declared rarity weights within 0.01 absolute and reaches every tier', () => {
    // [L-012] Never a rarity outside the union, checked per draw, not just via the
    // histogram's key set (a weight-ignoring roll could still only ever emit legal keys).
    const counts: Record<ChestRarity, number> = { common: 0, uncommon: 0, rare: 0 };
    for (const drop of drops) {
      expect(CHEST_RARITIES as readonly string[], JSON.stringify(drop)).toContain(drop.rarity);
      counts[drop.rarity] += 1;
    }
    for (const rarity of CHEST_RARITIES) {
      expect(counts[rarity], `${rarity} never dropped in ${SAMPLE_SIZE} seeded rolls`).toBeGreaterThan(0);
    }
    // Tight enough that a uniform (weight-ignoring) roll — ~33,333 each — fails hard: the
    // deviation from 0.6/0.3/0.1 would be ~0.23-0.27, over 20x this 0.01 tolerance.
    for (const rarity of CHEST_RARITIES) {
      const observed = (counts[rarity] ?? 0) / SAMPLE_SIZE;
      const expected = CHEST_RARITY_WEIGHTS[rarity];
      expect(
        Math.abs(observed - expected),
        `${rarity}: observed ${observed}, expected ${expected}`,
      ).toBeLessThanOrEqual(0.01);
    }
  });

  // spec(T-009:AC-9)
  it('keeps every coin amount an integer inside its own rarity range, over the whole sample', () => {
    for (const drop of drops) {
      const range = CHEST_COIN_RANGE_BY_RARITY[drop.rarity];
      expect(Number.isInteger(drop.coins), JSON.stringify(drop)).toBe(true);
      expect(drop.coins, JSON.stringify(drop)).toBeGreaterThanOrEqual(range.min);
      expect(drop.coins, JSON.stringify(drop)).toBeLessThanOrEqual(range.max);
    }
  });

  // spec(T-009:AC-10)
  it('pays a rarer chest strictly better in expectation, measured on the actual coin sample', () => {
    // [L-012] Measured on the sampled `coins`, not inferred from the tuning ranges' own
    // min/max ordering — a roll that ignored the per-rarity range and drew uniformly across
    // [10, 120] regardless of rarity would still pass a check on the declared ranges, but
    // would fail this one (all three group means would converge to ~65).
    const sums: Record<ChestRarity, number> = { common: 0, uncommon: 0, rare: 0 };
    const counts: Record<ChestRarity, number> = { common: 0, uncommon: 0, rare: 0 };
    for (const drop of drops) {
      sums[drop.rarity] += drop.coins;
      counts[drop.rarity] += 1;
    }
    const mean = (rarity: ChestRarity): number => sums[rarity] / counts[rarity];
    expect(counts.common).toBeGreaterThan(0);
    expect(counts.uncommon).toBeGreaterThan(0);
    expect(counts.rare).toBeGreaterThan(0);
    expect(mean('rare')).toBeGreaterThan(mean('uncommon'));
    expect(mean('uncommon')).toBeGreaterThan(mean('common'));
  });

  // spec(T-009:AC-11)
  it('is deterministic — same starting Rng gives the same drop and the same advanced Rng', () => {
    const seeds = [1, 42, 31337, 999_999, 0];
    for (const seed of seeds) {
      const start = createRng(seed);
      const [dropA, rngA] = rollChest(start);
      const [dropB, rngB] = rollChest(start);
      expect(dropB, `seed ${seed}`).toEqual(dropA);
      expect(rngB, `seed ${seed}`).toEqual(rngA);
      // The returned Rng must differ from the input — it actually advanced the stream.
      expect(rngA, `seed ${seed}`).not.toEqual(start);
    }
  });

  // spec(T-009:AC-12)
  it('keeps the running coin total non-decreasing and non-negative over 1000 seeded duels', () => {
    let rng: Rng = createRng(2024);
    let total = 0;
    for (let i = 0; i < 1000; i += 1) {
      const [wonRoll, rngAfterWon] = nextInt(rng, 0, 1);
      const won = wonRoll === 1;
      const [totalAnswers, rngAfterTotal] = nextInt(rngAfterWon, 0, 20);
      const [correctAnswers, rngAfterCorrect] = nextInt(rngAfterTotal, 0, totalAnswers);
      const [perfectShots, rngAfterPerfect] = nextInt(rngAfterCorrect, 0, correctAnswers);
      const payout = computeCoinPayout({ won, correctAnswers, totalAnswers, perfectShots });
      const [drop, rngAfterChest] = rollChest(rngAfterPerfect);

      const before = total;
      total += payout + drop.coins;
      expect(total, `duel ${i}`).toBeGreaterThanOrEqual(before);
      expect(total, `duel ${i}`).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(total), `duel ${i}`).toBe(true);
      rng = rngAfterChest;
    }
    expect(total).toBeGreaterThan(0);
  });
});

// =========================================================================================
describe('T-009 economy — CHEST_RARITY_ENTRIES: the record-to-array ordering', () => {
  // spec(T-009:AC-13)
  it('has exactly one entry per ChestRarity, in common, uncommon, rare order, weights matching', () => {
    expect(CHEST_RARITY_ENTRIES).toHaveLength(CHEST_RARITIES.length);
    expect(CHEST_RARITY_ENTRIES.map((entry) => entry.item)).toEqual(['common', 'uncommon', 'rare']);
    for (const entry of CHEST_RARITY_ENTRIES) {
      expect(entry.weight, entry.item).toBe(CHEST_RARITY_WEIGHTS[entry.item]);
    }
  });

  // spec(T-009:AC-13)
  it('keeps entry order fixed to CHEST_RARITIES even when CHEST_RARITY_WEIGHTS is rebuilt with a different key insertion order', async () => {
    // The lazy-implementation trap this test exists for: `Object.entries(CHEST_RARITY_WEIGHTS)`
    // instead of mapping over T-003's `CHEST_RARITIES` id array. In the real, frozen
    // tuning.ts the two happen to agree (common, uncommon, rare is already the RAW object's
    // insertion order), so nothing above can tell the two implementations apart. Only
    // rebuilding CHEST_RARITY_WEIGHTS with a different key order and re-importing the module
    // under test exposes the difference: `Object.entries` would yield `rare, common,
    // uncommon` here; a correct implementation is unaffected.
    vi.resetModules();
    try {
      vi.doMock('@engine/tuning', async () => {
        const actual = await vi.importActual<typeof import('@engine/tuning')>('@engine/tuning');
        return {
          ...actual,
          CHEST_RARITY_WEIGHTS: {
            rare: actual.CHEST_RARITY_WEIGHTS.rare,
            common: actual.CHEST_RARITY_WEIGHTS.common,
            uncommon: actual.CHEST_RARITY_WEIGHTS.uncommon,
          },
        };
      });
      const reimported = await import('@engine/economy');
      expect(reimported.CHEST_RARITY_ENTRIES.map((entry) => entry.item)).toEqual([
        'common',
        'uncommon',
        'rare',
      ]);
      // Values must survive the reorder untouched — this isn't just proving the ARRAY
      // ordering ignored the reorder, but that the right WEIGHT still landed on each item.
      expect(reimported.CHEST_RARITY_ENTRIES.find((e) => e.item === 'rare')?.weight).toBe(
        CHEST_RARITY_WEIGHTS.rare,
      );
      expect(reimported.CHEST_RARITY_ENTRIES.find((e) => e.item === 'common')?.weight).toBe(
        CHEST_RARITY_WEIGHTS.common,
      );
      expect(reimported.CHEST_RARITY_ENTRIES.find((e) => e.item === 'uncommon')?.weight).toBe(
        CHEST_RARITY_WEIGHTS.uncommon,
      );
    } finally {
      vi.doUnmock('@engine/tuning');
      vi.resetModules();
    }
  });
});
