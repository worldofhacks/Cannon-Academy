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
  if (!Number.isInteger(seed) || seed < -0xffffffff || seed > 0xffffffff) {
    throw new RangeError('createRng: seed must be a finite integer representable in 32 bits');
  }
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
  // Normalise to uint32 at the public boundary so `Rng.state` is genuinely the "boxed uint32"
  // the type doc promises (mod-2^32 arithmetic makes this a no-op on the resulting stream).
  return [value, { state: nextState >>> 0 }];
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

/**
 * Reads `arr[index]`, throwing only when `index` is actually out of bounds. `T` is
 * unconstrained, so a legal element may itself be `undefined` (e.g. `[undefined, 1, 2]` or a
 * sparse array) — the guard must check the INDEX, not the retrieved value, or it throws on
 * data it is contractually required to permute or select from.
 */
function requireAt<T>(arr: readonly T[], index: number): T {
  if (index < 0 || index >= arr.length) {
    throw new RangeError(`index ${index} out of bounds (length ${arr.length})`);
  }
  return arr[index] as T; // sound: bounds proven immediately above
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
    if (!Number.isFinite(entry.weight) || entry.weight < 0) {
      throw new RangeError('weightedPick: weights must be finite and not negative');
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

  // Unreachable for any input this function accepts: every weight is finite and
  // non-negative (checked above), so `total` is finite; `cumulative` sums the same
  // weights in the same order, so it reaches `total` bit-for-bit on the last entry;
  // and `nextFloat` returns a value in `[0, 1)`, so `target = f * total < total`
  // whenever `total > 0`. Reaching this line means an invariant above was violated.
  throw new Error('weightedPick: internal invariant violated (cumulative never reached total)');
}
