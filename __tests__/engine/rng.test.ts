import { describe, expect, it } from 'vitest';
import { createRng, nextFloat, nextInt, pick, shuffle, weightedPick, type Rng } from '@engine/rng';

// T-001 — Seeded mulberry32 PRNG with pure, state-threaded draw helpers.
//
// API shape used throughout (from tickets/T-001.md "Planning Decisions", now
// locked-decision): every draw function is pure and state-threaded, returning a
// `[value, nextRng]` tuple; `Rng` is `{ readonly state: number }`, a plain
// JSON-serialisable object, never a closure.
//
// `weightedPick` entries are locked to `{ item: T; weight: number }[]` (AC-10) —
// T-009 (economy, wave 3) already declares
// `CHEST_RARITY_ENTRIES: readonly { item: ChestRarity; weight: number }[]` and calls
// `weightedPick(rng, CHEST_RARITY_ENTRIES)` against this exact shape.

// ---------------------------------------------------------------------------
// Independent reference implementation, transcribed directly from the pseudocode in
// tickets/T-001.md's Context section (NOT from src/engine/rng.ts — this is the anti-drift
// check for AC-3, so it must never be derived from or share code with the implementation).
// ---------------------------------------------------------------------------
function referenceMulberry32Step(state: number): { value: number; nextState: number } {
  const a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, nextState: a };
}

function referenceSequence(seed: number, count: number): number[] {
  const values: number[] = [];
  let state = seed;
  for (let i = 0; i < count; i += 1) {
    const { value, nextState } = referenceMulberry32Step(state);
    values.push(value);
    state = nextState;
  }
  return values;
}

// ---------------------------------------------------------------------------
// Test helpers over the public API only.
// ---------------------------------------------------------------------------
function drawFloats(start: Rng, count: number): { values: number[]; end: Rng } {
  const values: number[] = [];
  let rng = start;
  for (let i = 0; i < count; i += 1) {
    const [value, next] = nextFloat(rng);
    values.push(value);
    rng = next;
  }
  return { values, end: rng };
}

describe('createRng / nextFloat — reproducibility and seed sensitivity', () => {
  it('spec(T-001:AC-1): identical seeds produce element-wise identical sequences over 1000 draws', () => {
    const seed = 123456789;
    const a = drawFloats(createRng(seed), 1000);
    const b = drawFloats(createRng(seed), 1000);
    expect(a.values).toEqual(b.values);
    expect(a.values.length).toBe(1000);
  });

  it('spec(T-001:AC-1): re-drawing from the same, un-reassigned Rng value twice yields the same result (no hidden mutation)', () => {
    // A closure-based or internally-mutating implementation would advance on the first
    // call and desync the sequence a caller expects to be able to replay from `rng0`.
    const rng0 = createRng(42);
    const snapshotState = rng0.state;

    const [firstValue, firstNext] = nextFloat(rng0);
    const [secondValue, secondNext] = nextFloat(rng0);

    expect(firstValue).toBe(secondValue);
    expect(firstNext).toEqual(secondNext);
    expect(rng0.state).toBe(snapshotState);
  });

  it('spec(T-001:AC-2): seeds 1 and 2, advanced 10 times each, diverge in at least one output', () => {
    const a = drawFloats(createRng(1), 10);
    const b = drawFloats(createRng(2), 10);
    expect(a.values).not.toEqual(b.values);
  });
});

describe('createRng / nextFloat — known-answer test against an independent reference', () => {
  it.each([0, 1, 42, 4294967295])(
    'spec(T-001:AC-3): seed %i matches the reference mulberry32 implementation for 100 draws, exactly',
    (seed) => {
      const expected = referenceSequence(seed, 100);
      const { values: actual } = drawFloats(createRng(seed), 100);

      expect(actual).toHaveLength(100);
      for (let i = 0; i < 100; i += 1) {
        expect(actual[i]).toBe(expected[i]);
      }
    },
  );
});

describe('nextFloat — range and distribution', () => {
  it('spec(T-001:AC-4): 100,000 draws from seed 12345 all satisfy 0 <= v < 1 with mean in [0.49, 0.51]', () => {
    const count = 100_000;
    let rng = createRng(12345);
    let total = 0;

    for (let i = 0; i < count; i += 1) {
      const [value, next] = nextFloat(rng);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      total += value;
      rng = next;
    }

    const mean = total / count;
    expect(mean).toBeGreaterThanOrEqual(0.49);
    expect(mean).toBeLessThanOrEqual(0.51);
  });
});

describe('nextInt', () => {
  it('spec(T-001:AC-5): 60,000 draws of nextInt(rng, 1, 6) from seed 777 are integers in [1,6] with each face between 9000 and 11000', () => {
    const count = 60_000;
    const min = 1;
    const max = 6;
    let rng = createRng(777);
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

    for (let i = 0; i < count; i += 1) {
      const [value, next] = nextInt(rng, min, max);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(min);
      expect(value).toBeLessThanOrEqual(max);
      counts[value] = (counts[value] ?? 0) + 1;
      rng = next;
    }

    expect(Object.values(counts).reduce((sum, n) => sum + n, 0)).toBe(count);
    for (const face of [1, 2, 3, 4, 5, 6]) {
      expect(counts[face]).toBeGreaterThanOrEqual(9000);
      expect(counts[face]).toBeLessThanOrEqual(11000);
    }
  });

  it('spec(T-001:AC-6): nextInt(rng, 5, 5) returns exactly 5 and still advances the Rng (state changes, input unmutated)', () => {
    const rng0 = createRng(1);
    const initialState = rng0.state;

    const [value, rng1] = nextInt(rng0, 5, 5);

    expect(value).toBe(5);
    expect(rng1.state).not.toBe(initialState);
    // The input Rng must not have been mutated in place.
    expect(rng0.state).toBe(initialState);
  });

  it('spec(T-001:AC-7): nextInt throws RangeError when min > max', () => {
    const rng = createRng(1);
    expect(() => nextInt(rng, 5, 1)).toThrow(RangeError);
  });

  it('spec(T-001:AC-7): nextInt throws RangeError when min is not an integer', () => {
    const rng = createRng(1);
    expect(() => nextInt(rng, 1.5, 5)).toThrow(RangeError);
  });

  it('spec(T-001:AC-7): nextInt throws RangeError when max is not an integer', () => {
    const rng = createRng(1);
    expect(() => nextInt(rng, 1, 5.5)).toThrow(RangeError);
  });
});

describe('shuffle', () => {
  it('spec(T-001:AC-8): shuffle returns a new array, does not mutate the input, and is a permutation of it', () => {
    const input = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const inputSnapshot = [...input];
    const rng = createRng(5);

    const [result, nextRng] = shuffle(rng, input);

    expect(result).not.toBe(input);
    expect(input).toEqual(inputSnapshot); // input not mutated
    expect([...result].sort((a, b) => a - b)).toEqual([...input].sort((a, b) => a - b));
    expect(nextRng.state).not.toBe(rng.state);
  });

  it('spec(T-001:AC-8): over 10,000 shuffles from seed 99, every element lands at index 0 between 700 and 1300 times', () => {
    const items = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const trials = 10_000;
    let rng = createRng(99);
    const counts: Record<number, number> = {};
    for (const item of items) counts[item] = 0;

    for (let i = 0; i < trials; i += 1) {
      const [result, next] = shuffle(rng, items);
      const first = result[0];
      if (first !== undefined) {
        counts[first] = (counts[first] ?? 0) + 1;
      }
      rng = next;
    }

    expect(Object.values(counts).reduce((sum, n) => sum + n, 0)).toBe(trials);
    for (const item of items) {
      expect(counts[item]).toBeGreaterThanOrEqual(700);
      expect(counts[item]).toBeLessThanOrEqual(1300);
    }
  });
});

describe('pick', () => {
  it('spec(T-001:AC-9): pick on an empty array throws RangeError', () => {
    const rng = createRng(1);
    expect(() => pick(rng, [])).toThrow(RangeError);
  });

  it('spec(T-001:AC-9): pick on a single-element array returns that element', () => {
    const rng = createRng(1);
    const [value] = pick(rng, [42]);
    expect(value).toBe(42);
  });
});

describe('weightedPick', () => {
  it('spec(T-001:AC-10): weights [{item:a,weight:1},{item:b,weight:3}] over 20,000 draws from seed 2026 selects b between 14,000 and 16,000 times, and only a/b appear', () => {
    const entries = [
      { item: 'a', weight: 1 },
      { item: 'b', weight: 3 },
    ];
    const trials = 20_000;
    let rng = createRng(2026);
    const counts: Record<string, number> = { a: 0, b: 0 };

    for (let i = 0; i < trials; i += 1) {
      const [value, next] = weightedPick(rng, entries);
      expect(['a', 'b']).toContain(value);
      counts[value] = (counts[value] ?? 0) + 1;
      rng = next;
    }

    expect((counts['a'] ?? 0) + (counts['b'] ?? 0)).toBe(trials);
    expect(counts['b'] ?? 0).toBeGreaterThanOrEqual(14_000);
    expect(counts['b'] ?? 0).toBeLessThanOrEqual(16_000);
  });

  it('spec(T-001:AC-11): weightedPick throws RangeError on an empty entry list', () => {
    const rng = createRng(1);
    expect(() => weightedPick(rng, [])).toThrow(RangeError);
  });

  it('spec(T-001:AC-11): weightedPick throws RangeError when any weight is negative', () => {
    const rng = createRng(1);
    expect(() =>
      weightedPick(rng, [
        { item: 'a', weight: -1 },
        { item: 'b', weight: 5 },
      ]),
    ).toThrow(RangeError);
  });

  it('spec(T-001:AC-11): weightedPick throws RangeError when total weight is 0 (all-zero weights)', () => {
    const rng = createRng(1);
    expect(() =>
      weightedPick(rng, [
        { item: 'a', weight: 0 },
        { item: 'b', weight: 0 },
      ]),
    ).toThrow(RangeError);
  });

  it('spec(T-001:AC-11): weightedPick throws RangeError when total weight is 0 (single zero-weight entry)', () => {
    const rng = createRng(1);
    expect(() => weightedPick(rng, [{ item: 'a', weight: 0 }])).toThrow(RangeError);
  });
});

describe('Rng serialisability', () => {
  it('spec(T-001:AC-12): a JSON round-tripped Rng produces the same subsequent sequence as the original', () => {
    // Advance a few steps first so the round-trip is exercised on a non-initial state,
    // not just the freshly-seeded value.
    let rng = createRng(2024);
    for (let i = 0; i < 5; i += 1) {
      const [, next] = nextFloat(rng);
      rng = next;
    }

    const roundTripped = JSON.parse(JSON.stringify(rng)) as Rng;
    expect(roundTripped).toEqual(rng);

    const original = drawFloats(rng, 50);
    const copy = drawFloats(roundTripped, 50);
    expect(copy.values).toEqual(original.values);
  });
});
