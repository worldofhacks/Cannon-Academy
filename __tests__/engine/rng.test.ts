import { describe, expect, it } from 'vitest';
import { createRng, nextFloat, nextInt, pick, shuffle, weightedPick, type Rng } from '@engine/rng';

// T-001 — Seeded mulberry32 PRNG with pure, state-threaded draw helpers.
//
// API shape used throughout (from tickets/T-001.md "Planning Decisions", locked-decision):
// every draw function is pure and state-threaded, returning a `[value, nextRng]` tuple;
// `Rng` is `{ readonly state: number }`, a plain JSON-serialisable object, never a closure.
//
// `weightedPick` entries are locked to `{ item: T; weight: number }[]` (AC-10) — T-009
// (economy, wave 3) declares `CHEST_RARITY_ENTRIES: readonly { item: ChestRarity; weight:
// number }[]` and calls `weightedPick(rng, CHEST_RARITY_ENTRIES)` against this exact shape.
//
// AC-13 (purity) and AC-14 (readonly fixtures) were added by the orchestrator after a
// pre-freeze test-design review found that `nextInt`/`shuffle`/`pick` were constrained only
// by statistical bands, which a cheating implementation (module-scoped counter, one-swap
// shuffle, `items[0]` pick) could satisfy. See `.tdd-swarm/reports/T-001-test-design-review.md`.
// All array/entry fixtures below are typed `readonly` per AC-14 / finding I-2, so an
// implementation that types its parameters as mutable arrays fails `tsc`, not just review.
//
// AC-15 (seed validation) and AC-16 (undefined-tolerant shuffle/pick), plus the non-finite
// clause folded into AC-11, were added after an independent CODE review of the landed
// implementation (`.tdd-swarm/reports/T-001-code-review.md`) found bugs no criterion had asked
// about: `createRng` silently aliased `NaN`/`-0.5`/`2**33` to seed `0`; `weightedPick` silently
// returned the last entry for a `NaN`/`Infinity` weight; and `shuffle`/`pick`'s internal bounds
// helper checked whether the retrieved VALUE was `undefined` rather than the INDEX, so an array
// legitimately containing `undefined` (routine under this repo's `noUncheckedIndexedAccess`)
// made them throw a false "index out of bounds".

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

// A stable string key for an arbitrary element, including `undefined` — used to compare
// multisets for AC-16's undefined-tolerant permutation check, where plain numeric/string
// sort comparators break on `undefined`.
function elementKey(value: unknown): string {
  return typeof value === 'undefined' ? '<undefined>' : String(value);
}

function isPermutation(result: readonly unknown[], input: readonly unknown[]): boolean {
  if (result.length !== input.length) return false;
  const a = [...result].map(elementKey).sort();
  const b = [...input].map(elementKey).sort();
  return JSON.stringify(a) === JSON.stringify(b);
}

describe('createRng / nextFloat — reproducibility and seed sensitivity', () => {
  it('spec(T-001:AC-1): identical seeds produce element-wise identical sequences over 1000 draws', () => {
    const seed = 123456789;
    const a = drawFloats(createRng(seed), 1000);
    const b = drawFloats(createRng(seed), 1000);
    expect(a.values).toEqual(b.values);
    expect(a.values.length).toBe(1000);
  });

  it('spec(T-001:AC-2): seeds 1 and 2, advanced 10 times each, diverge in at least one output', () => {
    const a = drawFloats(createRng(1), 10);
    const b = drawFloats(createRng(2), 10);
    expect(a.values).not.toEqual(b.values);
  });
});

describe('createRng — seed validation', () => {
  it.each([NaN, Infinity, -0.5, 2 ** 33])(
    'spec(T-001:AC-15): createRng throws RangeError for a non-finite-integer seed (%s)',
    (seed) => {
      expect(() => createRng(seed)).toThrow(RangeError);
    },
  );
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
    const values: number[] = [];

    for (let i = 0; i < count; i += 1) {
      const [value, next] = nextFloat(rng);
      values.push(value);
      rng = next;
    }

    expect(values).toHaveLength(count);
    expect(values.every((v) => Number.isFinite(v) && v >= 0 && v < 1)).toBe(true);

    const mean = values.reduce((sum, v) => sum + v, 0) / count;
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
    const values: number[] = [];

    for (let i = 0; i < count; i += 1) {
      const [value, next] = nextInt(rng, min, max);
      values.push(value);
      rng = next;
    }

    expect(values.every((v) => Number.isInteger(v) && v >= min && v <= max)).toBe(true);

    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    for (const v of values) counts[v] = (counts[v] ?? 0) + 1;

    expect(Object.values(counts).reduce((sum, n) => sum + n, 0)).toBe(count);
    for (const face of [1, 2, 3, 4, 5, 6]) {
      expect(counts[face] ?? 0).toBeGreaterThanOrEqual(9000);
      expect(counts[face] ?? 0).toBeLessThanOrEqual(11000);
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
    const input: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const inputSnapshot = [...input];
    const rng = createRng(5);

    const [result, nextRng] = shuffle(rng, input);

    expect(result).not.toBe(input);
    expect(input).toEqual(inputSnapshot); // input not mutated
    expect([...result].sort((a, b) => a - b)).toEqual([...input].sort((a, b) => a - b));
    expect(nextRng.state).not.toBe(rng.state);
  });

  it('spec(T-001:AC-8): over 10,000 shuffles from seed 99, every element lands at index 0 AND index 5 each between 700 and 1300 times', () => {
    const items: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const trials = 10_000;
    let rng = createRng(99);
    const idx0Counts: Record<number, number> = {};
    const idx5Counts: Record<number, number> = {};
    for (const item of items) {
      idx0Counts[item] = 0;
      idx5Counts[item] = 0;
    }

    for (let i = 0; i < trials; i += 1) {
      const [result, next] = shuffle(rng, items);
      const first = result[0];
      const sixth = result[5];
      if (first !== undefined) idx0Counts[first] = (idx0Counts[first] ?? 0) + 1;
      if (sixth !== undefined) idx5Counts[sixth] = (idx5Counts[sixth] ?? 0) + 1;
      rng = next;
    }

    expect(Object.values(idx0Counts).reduce((sum, n) => sum + n, 0)).toBe(trials);
    expect(Object.values(idx5Counts).reduce((sum, n) => sum + n, 0)).toBe(trials);
    for (const item of items) {
      expect(idx0Counts[item] ?? 0).toBeGreaterThanOrEqual(700);
      expect(idx0Counts[item] ?? 0).toBeLessThanOrEqual(1300);
      expect(idx5Counts[item] ?? 0).toBeGreaterThanOrEqual(700);
      expect(idx5Counts[item] ?? 0).toBeLessThanOrEqual(1300);
    }
  });

  it('spec(T-001:AC-8): a 4-element array shuffled 24,000 times from seed 99 produces all 24 permutations, each between 850 and 1150 times', () => {
    const items: readonly number[] = [0, 1, 2, 3];
    const trials = 24_000;
    let rng = createRng(99);
    const permCounts = new Map<string, number>();

    for (let i = 0; i < trials; i += 1) {
      const [result, next] = shuffle(rng, items);
      const key = result.join(',');
      permCounts.set(key, (permCounts.get(key) ?? 0) + 1);
      rng = next;
    }

    expect(permCounts.size).toBe(24);
    for (const count of permCounts.values()) {
      expect(count).toBeGreaterThanOrEqual(850);
      expect(count).toBeLessThanOrEqual(1150);
    }
  });
});

describe('pick', () => {
  it('spec(T-001:AC-9): pick on an empty array throws RangeError', () => {
    const rng = createRng(1);
    const items: readonly number[] = [];
    expect(() => pick(rng, items)).toThrow(RangeError);
  });

  it('spec(T-001:AC-9): pick on a single-element array returns that element', () => {
    const rng = createRng(1);
    const items: readonly number[] = [42];
    const [value] = pick(rng, items);
    expect(value).toBe(42);
  });

  it('spec(T-001:AC-9): 10,000 threaded picks from a 10-element array from seed 5 select every element between 900 and 1100 times, and the tuple advances the Rng', () => {
    const items: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const trials = 10_000;
    let rng = createRng(5);
    const counts: Record<number, number> = {};
    for (const item of items) counts[item] = 0;

    const firstResult = pick(rng, items);
    expect(firstResult).toHaveLength(2);
    expect(firstResult[1].state).not.toBe(rng.state);

    for (let i = 0; i < trials; i += 1) {
      const [value, next] = pick(rng, items);
      counts[value] = (counts[value] ?? 0) + 1;
      rng = next;
    }

    expect(Object.values(counts).reduce((sum, n) => sum + n, 0)).toBe(trials);
    for (const item of items) {
      expect(counts[item] ?? 0).toBeGreaterThanOrEqual(900);
      expect(counts[item] ?? 0).toBeLessThanOrEqual(1100);
    }
  });
});

describe('shuffle / pick — tolerate legitimately undefined elements', () => {
  // Seed 0 is a VERIFIED regression seed, not a guess: probed directly against the current
  // src/engine/rng.ts across seeds 0..49, `shuffle(createRng(s), [undefined, 1, 2, 3])` throws
  // for 37 of 50 seeds and `pick(createRng(s), [undefined, 1, 2])` throws for 14 of 50 — seed 0
  // is in both sets (it throws "index 0 out of bounds", a false message: index 0 of a
  // 4/3-element array is in bounds). Using a seed confirmed to trigger the bug makes this a
  // genuine regression test rather than a pass that only holds by seed luck (cf. M-3 in the
  // test-design review).
  const REGRESSION_SEED = 0;

  it('spec(T-001:AC-16): shuffle does not throw on an array containing undefined, and still returns a permutation (seed 0)', () => {
    const items: readonly (number | undefined)[] = [undefined, 1, 2, 3];
    const rng = createRng(REGRESSION_SEED);

    const [result] = shuffle(rng, items);

    expect(isPermutation(result, items)).toBe(true);
  });

  it('spec(T-001:AC-16): shuffle does not throw on a sparse array (new Array(4)), and still returns a permutation (seed 0)', () => {
    const items: readonly unknown[] = new Array(4);
    const rng = createRng(REGRESSION_SEED);

    const [result] = shuffle(rng, items);

    expect(result).toHaveLength(4);
    expect(isPermutation(result, items)).toBe(true);
  });

  it('spec(T-001:AC-16): pick does not throw on an array containing undefined (seed 0)', () => {
    const items: readonly (number | undefined)[] = [undefined, 1, 2];
    const rng = createRng(REGRESSION_SEED);

    const [value] = pick(rng, items);

    expect(items).toContain(value);
  });
});

describe('weightedPick', () => {
  it('spec(T-001:AC-10): weights [{item:a,weight:1},{item:b,weight:3}] over 20,000 draws from seed 2026 selects b between 14,000 and 16,000 times, and only a/b appear', () => {
    const entries: readonly { item: string; weight: number }[] = [
      { item: 'a', weight: 1 },
      { item: 'b', weight: 3 },
    ];
    const trials = 20_000;
    let rng = createRng(2026);
    const values: string[] = [];

    for (let i = 0; i < trials; i += 1) {
      const [value, next] = weightedPick(rng, entries);
      values.push(value);
      rng = next;
    }

    expect(values.every((v) => v === 'a' || v === 'b')).toBe(true);

    const counts: Record<string, number> = { a: 0, b: 0 };
    for (const v of values) counts[v] = (counts[v] ?? 0) + 1;

    expect((counts['a'] ?? 0) + (counts['b'] ?? 0)).toBe(trials);
    expect(counts['b'] ?? 0).toBeGreaterThanOrEqual(14_000);
    expect(counts['b'] ?? 0).toBeLessThanOrEqual(16_000);
  });

  it('spec(T-001:AC-11): weightedPick throws RangeError on an empty entry list', () => {
    const rng = createRng(1);
    const entries: readonly { item: string; weight: number }[] = [];
    expect(() => weightedPick(rng, entries)).toThrow(RangeError);
  });

  it('spec(T-001:AC-11): weightedPick throws RangeError when any weight is negative', () => {
    const rng = createRng(1);
    const entries: readonly { item: string; weight: number }[] = [
      { item: 'a', weight: -1 },
      { item: 'b', weight: 5 },
    ];
    expect(() => weightedPick(rng, entries)).toThrow(RangeError);
  });

  it('spec(T-001:AC-11): weightedPick throws RangeError when total weight is 0 (all-zero weights)', () => {
    const rng = createRng(1);
    const entries: readonly { item: string; weight: number }[] = [
      { item: 'a', weight: 0 },
      { item: 'b', weight: 0 },
    ];
    expect(() => weightedPick(rng, entries)).toThrow(RangeError);
  });

  it('spec(T-001:AC-11): weightedPick throws RangeError when total weight is 0 (single zero-weight entry)', () => {
    const rng = createRng(1);
    const entries: readonly { item: string; weight: number }[] = [{ item: 'a', weight: 0 }];
    expect(() => weightedPick(rng, entries)).toThrow(RangeError);
  });

  it('spec(T-001:AC-11): a zero weight alongside a positive weight does not throw, and the zero-weight item is never selected across 5,000 draws', () => {
    const entries: readonly { item: string; weight: number }[] = [
      { item: 'z', weight: 0 },
      { item: 'p', weight: 1 },
    ];
    const trials = 5_000;
    let rng = createRng(3);
    const values: string[] = [];

    expect(() => weightedPick(createRng(3), entries)).not.toThrow();

    for (let i = 0; i < trials; i += 1) {
      const [value, next] = weightedPick(rng, entries);
      values.push(value);
      rng = next;
    }

    expect(values.every((v) => v === 'p')).toBe(true);
    expect(values).not.toContain('z');
  });

  it.each([NaN, Infinity, -Infinity])(
    'spec(T-001:AC-11): weightedPick throws RangeError when a weight is non-finite (%s)',
    (weight) => {
      const rng = createRng(1);
      const entries: readonly { item: string; weight: number }[] = [
        { item: 'a', weight },
        { item: 'b', weight: 1 },
      ];
      expect(() => weightedPick(rng, entries)).toThrow(RangeError);
    },
  );
});

describe('purity — every draw function is a pure function of Rng, never hidden state (AC-13)', () => {
  it('spec(T-001:AC-13): nextFloat repeat-called on the same un-reassigned Rng agrees with itself', () => {
    const rng0 = createRng(42);
    const initialState = rng0.state;

    const [firstValue, firstNext] = nextFloat(rng0);
    const [secondValue, secondNext] = nextFloat(rng0);

    expect(firstValue).toBe(secondValue);
    expect(firstNext).toEqual(secondNext);
    expect(rng0.state).toBe(initialState);
  });

  it('spec(T-001:AC-13): nextInt repeat-called on the same un-reassigned Rng agrees with itself', () => {
    const rng0 = createRng(7);
    const initialState = rng0.state;

    const [firstValue, firstNext] = nextInt(rng0, 1, 100);
    const [secondValue, secondNext] = nextInt(rng0, 1, 100);

    expect(firstValue).toBe(secondValue);
    expect(firstNext).toEqual(secondNext);
    expect(rng0.state).toBe(initialState);
  });

  it('spec(T-001:AC-13): shuffle repeat-called on the same un-reassigned Rng agrees with itself', () => {
    const items: readonly number[] = [0, 1, 2, 3, 4];
    const rng0 = createRng(11);
    const initialState = rng0.state;

    const [firstResult, firstNext] = shuffle(rng0, items);
    const [secondResult, secondNext] = shuffle(rng0, items);

    expect(firstResult).toEqual(secondResult);
    expect(firstNext).toEqual(secondNext);
    expect(rng0.state).toBe(initialState);
  });

  it('spec(T-001:AC-13): pick repeat-called on the same un-reassigned Rng agrees with itself', () => {
    const items: readonly string[] = ['a', 'b', 'c', 'd'];
    const rng0 = createRng(13);
    const initialState = rng0.state;

    const [firstValue, firstNext] = pick(rng0, items);
    const [secondValue, secondNext] = pick(rng0, items);

    expect(firstValue).toBe(secondValue);
    expect(firstNext).toEqual(secondNext);
    expect(rng0.state).toBe(initialState);
  });

  it('spec(T-001:AC-13): weightedPick repeat-called on the same un-reassigned Rng agrees with itself', () => {
    const entries: readonly { item: string; weight: number }[] = [
      { item: 'a', weight: 1 },
      { item: 'b', weight: 2 },
    ];
    const rng0 = createRng(17);
    const initialState = rng0.state;

    const [firstValue, firstNext] = weightedPick(rng0, entries);
    const [secondValue, secondNext] = weightedPick(rng0, entries);

    expect(firstValue).toBe(secondValue);
    expect(firstNext).toEqual(secondNext);
    expect(rng0.state).toBe(initialState);
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

describe('readonly fixture compatibility (AC-14)', () => {
  it('spec(T-001:AC-14): shuffle, pick, and weightedPick each accept a readonly array without a type error', () => {
    const shuffleItems: readonly number[] = [1, 2, 3, 4];
    const pickItems: readonly string[] = ['x', 'y', 'z'];
    const entries: readonly { item: string; weight: number }[] = [
      { item: 'a', weight: 1 },
      { item: 'b', weight: 1 },
    ];
    const rng = createRng(1);

    const [shuffled] = shuffle(rng, shuffleItems);
    const [picked] = pick(rng, pickItems);
    const [weighted] = weightedPick(rng, entries);

    expect(shuffled).toHaveLength(shuffleItems.length);
    expect(pickItems).toContain(picked);
    expect(['a', 'b']).toContain(weighted);
  });
});
