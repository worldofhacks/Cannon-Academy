// Seeded mulberry32 PRNG with pure, state-threaded draw helpers.
//
// This is the single source of nondeterminism in the game engine (ARCHITECTURE.md §4.1).
// Every export here is a pure function of its inputs: no module-scoped state, no closures,
// no caches. `Rng` is a plain, JSON-serialisable value so it can be carried inside
// `DuelState` and survive a kill/relaunch (ARCHITECTURE.md §4.2).

/** A boxed mulberry32 generator state. Always advance by threading the returned `Rng`. */
export type Rng = { readonly state: number };

/** Creates a new `Rng` from an integer seed. */
export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

/** One mulberry32 step: pure function of the current state to a draw plus the next state. */
function mulberry32Step(state: number): { readonly value: number; readonly nextState: number } {
  const a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, nextState: a };
}

/** Draws a float in `[0, 1)`, returning the value and the advanced `Rng`. */
export function nextFloat(rng: Rng): readonly [number, Rng] {
  const { value, nextState } = mulberry32Step(rng.state);
  return [value, { state: nextState }];
}

/**
 * Draws an integer in `[min, max]` inclusive. Always consumes one `nextFloat` draw —
 * even when `min === max` — so the draw stream stays stable regardless of the range.
 */
export function nextInt(rng: Rng, min: number, max: number): readonly [number, Rng] {
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new RangeError('nextInt: min and max must be integers');
  }
  if (min > max) {
    throw new RangeError('nextInt: min must be <= max');
  }
  const [f, nextRng] = nextFloat(rng);
  const range = max - min + 1;
  const value = min + Math.floor(f * range);
  return [value, nextRng];
}

/** Reads `arr[index]`, throwing rather than silently propagating `undefined`. */
function requireAt<T>(arr: readonly T[], index: number): T {
  const value = arr[index];
  if (value === undefined) {
    throw new RangeError(`index ${index} out of bounds`);
  }
  return value;
}

/**
 * Returns a new array containing a uniformly-random permutation of `items` (Fisher-Yates),
 * threading the `Rng` forward. The input array is never mutated.
 */
export function shuffle<T>(rng: Rng, items: readonly T[]): readonly [readonly T[], Rng] {
  const result = items.slice();
  let currentRng = rng;
  for (let i = result.length - 1; i > 0; i -= 1) {
    const [j, nextRng] = nextInt(currentRng, 0, i);
    currentRng = nextRng;
    const a = requireAt(result, i);
    const b = requireAt(result, j);
    result[i] = b;
    result[j] = a;
  }
  return [result, currentRng];
}

/** Picks a uniformly-random element of `items`, returning it and the advanced `Rng`. */
export function pick<T>(rng: Rng, items: readonly T[]): readonly [T, Rng] {
  if (items.length === 0) {
    throw new RangeError('pick: items must not be empty');
  }
  const [index, nextRng] = nextInt(rng, 0, items.length - 1);
  return [requireAt(items, index), nextRng];
}

/** A weighted candidate for `weightedPick`. The value field is named `item`, not `value`. */
type WeightedEntry<T> = { readonly item: T; readonly weight: number };

/**
 * Picks an entry with probability proportional to its `weight`. Throws `RangeError` for an
 * empty list, any negative weight, or a total weight of `0`. A `0`-weight entry alongside
 * positive weights is legal and is never selected.
 */
export function weightedPick<T>(rng: Rng, entries: readonly WeightedEntry<T>[]): readonly [T, Rng] {
  if (entries.length === 0) {
    throw new RangeError('weightedPick: entries must not be empty');
  }

  let total = 0;
  for (const entry of entries) {
    if (entry.weight < 0) {
      throw new RangeError('weightedPick: weights must not be negative');
    }
    total += entry.weight;
  }
  if (total <= 0) {
    throw new RangeError('weightedPick: total weight must be greater than 0');
  }

  const [f, nextRng] = nextFloat(rng);
  const target = f * total;

  let cumulative = 0;
  for (const entry of entries) {
    cumulative += entry.weight;
    if (target < cumulative) {
      return [entry.item, nextRng];
    }
  }

  // Floating-point edge case at the top boundary (target ~= total): fall back to the
  // last entry, which is guaranteed to exist because `entries` is non-empty.
  return [requireAt(entries, entries.length - 1).item, nextRng];
}
