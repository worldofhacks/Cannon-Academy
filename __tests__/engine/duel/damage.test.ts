import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { answerQuality, isPerfectShot, resolveShot, type ShotOutcome } from '@engine/duel/damage';
import { createRng, nextFloat, type Rng } from '@engine/rng';
import {
  ANSWER_QUALITY_FLOOR,
  BASE_BALLS_PER_VOLLEY,
  ENEMY_HULL_BY_ISLAND,
  PERFECT_SHOT_BONUS_DAMAGE,
  PERFECT_SHOT_TIMER_FRACTION,
  QUALITY_WEIGHT,
} from '@engine/tuning';
import { cannons, getCannon } from '@content/index';
import type { Cannon } from '@content/schemas';

// T-008 — the damage model. "Answer speed aims the shot" (PLAN.md §The duel loop) rendered as
// arithmetic: a correct answer ALWAYS fires, speed biases the roll upward, and a slow-but-correct
// answer from a five-year-old still lands a respectable volley (ARCHITECTURE.md:206).
//
// -------------------------------------------------------------------------------------------
// HOW THIS SUITE IS BUILT — read before editing.
// -------------------------------------------------------------------------------------------
// L-006 — monotonicity proves a DIRECTION, not a MAGNITUDE. `QUALITY_WEIGHT = 0.001` satisfies
//         "damage never decreases as answers get faster" while deleting the game's core
//         mechanic. Every place speed is supposed to matter, this file asserts an EFFECT SIZE
//         over seeded samples (AC-16), never merely an inequality.
// L-012 — an aggregate certifies a projection, not the mechanism. Statistical bands here always
//         sit ALONGSIDE a structural assertion (exact bounds, exact field arithmetic, purity,
//         one-draw-per-shot), never instead of one.
// L-017 — cover DIMENSIONS, not cases. Two axes are swept to their extremes everywhere it is
//         meaningful: the quality axis (0 · 1ms · just-inside-perfect · exactly-perfect ·
//         just-outside · mid · timer-1 · timer · 2×timer · 999999) and the cannon-shape axis
//         (all ten catalog guns, from the 4-wide Swivel to the 16-wide Long Nine — the REAL
//         catalog, never an invented cannon).
// L-018 — `QUALITY_WEIGHT` froze in wave 2 against a bound DERIVED from AC-16's formula. AC-16
//         here is the downstream half of that pair; it must keep measuring the same effect size.
//
// Two rulings this file encodes, both settled before it was written:
//   1. PERFECT SHOT IS +1 DAMAGE, NOT A PROJECTILE. `PERFECT_SHOT_BONUS_DAMAGE` is added to the
//      damage roll. `BASE_BALLS_PER_VOLLEY` is a PRESENTATION constant the damage computation
//      must ignore — damage does not subdivide across balls. Asserted structurally below by
//      re-importing the module against a mutated `BASE_BALLS_PER_VOLLEY` and requiring every
//      damage field to be unchanged. (ARCHITECTURE.md §4.3 still reads "+1 bonus ball"; that
//      wording is wrong and is being corrected by T-031.)
//   2. THE FLOOR CONSTRAINS THE ROLL OUTCOME, NOT JUST THE QUALITY INPUT. AC-15 is the frozen
//      proof of ARCHITECTURE.md:206. An earlier draft blended quality with the uniform draw and
//      floored only `quality`, which let `u -> 0` roll barely above `damageMin` for a correct
//      answer. AC-15 and AC-6 both fail on any such reversion.
//
// Added with AC-17..AC-19, after the implementation review:
// L-015 — "unreachable" is a claim needing a probe. AC-19 moves the `w = 1.001` clamp probe out
//         of a scratchpad and into this file, so the comment's reachability claim carries a
//         committed measurement instead of an argument.
// L-016 — the three SOURCE-TEXT assertions in AC-18/AC-19 are LITERAL substring checks, and are
//         labelled as such at their call sites. They are secondary; the behavioural assertions
//         beside them are the authority. Each failure message spells out the exact expected
//         string so a correct implementation is never sent hunting for a phantom defect.
// L-021 — a derived bound is a hypothesis. AC-18 derives the crossover from the constants
//         (`ANSWER_QUALITY_FLOOR / QUALITY_WEIGHT`) and then MEASURES the flat region by
//         scanning the real module at 1 ms resolution, asserting the two agree.

// ===========================================================================================
// Shared fixtures and helpers
// ===========================================================================================

const SWIVEL = getCannon('swivel_gun'); // 8–12, reliable, 20s — the narrowest gun (span 4)
const CULVERIN = getCannon('culverin'); // 4–16, volatile w/ zero recoil, 20s (span 12)
const LONG_NINE = getCannon('long_nine'); // 24–40, volatile 10, 20s — the widest gun (span 16)

/** The cannon-shape axis. The REAL catalog — never an invented cannon. */
const ALL_CANNONS: readonly Cannon[] = cannons;

/** AC-16's scope: guns wide enough that a single roll's integer rounding cannot dominate. */
const WIDE_CANNONS: readonly Cannon[] = ALL_CANNONS.filter((c) => c.damageMax - c.damageMin >= 10);

const spanOf = (cannon: Cannon): number => cannon.damageMax - cannon.damageMin;

/** `arr[i]` under `noUncheckedIndexedAccess`, loud instead of `undefined`. */
function at<T>(arr: readonly T[], index: number): T {
  const value = arr[index];
  if (value === undefined) throw new Error(`index ${index} out of bounds (length ${arr.length})`);
  return value;
}

/**
 * The quality axis, swept end to end for one cannon's timer (L-017). Includes both sides of the
 * Perfect Shot boundary, `elapsed = 0`, `elapsed = timerMs`, and two overruns.
 */
function elapsedDimension(timerMs: number): readonly number[] {
  const boundary = PERFECT_SHOT_TIMER_FRACTION * timerMs;
  return [
    0, // instant
    1, // faster than perfect
    boundary - 1, // just INSIDE the Perfect Shot window
    boundary, // exactly at the boundary — strictly NOT perfect
    boundary + 1, // just outside
    Math.round(timerMs / 2), // mid
    timerMs - 1, // just under the timer
    timerMs, // the slowest possible correct answer — the floor binds here
    timerMs * 2, // overrun
    999_999, // far past the timer
  ];
}

/** N shots at fixed inputs, threading the `Rng` forward exactly as a real duel would. */
function threadedShots(
  cannon: Cannon,
  correct: boolean,
  elapsedMs: number,
  count: number,
  seed: number,
): readonly ShotOutcome[] {
  let rng: Rng = createRng(seed);
  const out: ShotOutcome[] = [];
  for (let i = 0; i < count; i += 1) {
    const [outcome, next] = resolveShot({ cannon, correct, elapsedMs, rng });
    out.push(outcome);
    rng = next;
  }
  return out;
}

const meanRoll = (shots: readonly ShotOutcome[]): number =>
  shots.reduce((sum, s) => sum + s.rollDamage, 0) / shots.length;

const minRoll = (shots: readonly ShotOutcome[]): number =>
  shots.reduce((lo, s) => Math.min(lo, s.rollDamage), Number.POSITIVE_INFINITY);

/** A catalog cannon with one field overridden — used only for AC-12's illegal `timerMs`. */
const withTimer = (cannon: Cannon, timerMs: number): Cannon => ({ ...cannon, timerMs });

// --- AC-18 / AC-19 instruments -------------------------------------------------------------

// A seed whose FIRST `nextFloat` draw is ~1.06e-5, so `round(u * (damageMax - lower))` is 0 for
// every catalog gun (the widest span is 16, and 16 * 1.06e-5 rounds to 0). One `resolveShot` call
// with this seed therefore reads the roll's integer lower bound EXACTLY, with no sampling. The
// instrument is self-verified in the first AC-18 test before anything relies on it (L-014).
const LOW_U_SEED = 188_346;

/** The roll's integer lower bound at a given elapsed time, read exactly via `LOW_U_SEED`. */
function lowerBoundAt(cannon: Cannon, elapsedMs: number): number {
  const [outcome] = resolveShot({ cannon, correct: true, elapsedMs, rng: createRng(LOW_U_SEED) });
  return outcome.rollDamage;
}

/**
 * The answer quality at which the floor STOPS binding: `q * QUALITY_WEIGHT === ANSWER_QUALITY_FLOOR`.
 * Derived from the constants, never hardcoded — if `QUALITY_WEIGHT` moves on the dev slider, every
 * assertion built on this moves with it (L-021).
 */
const CROSSOVER_QUALITY = ANSWER_QUALITY_FLOOR / QUALITY_WEIGHT;

/** The elapsed time at which quality falls to the crossover: `q(e) = 1 - e/timer`. */
const crossoverElapsed = (timerMs: number): number => (1 - CROSSOVER_QUALITY) * timerMs;

/** The integer lower bound a fully-floored (slowest correct) answer produces. */
const flooredLowerBound = (cannon: Cannon): number =>
  Math.min(Math.ceil(cannon.damageMin + ANSWER_QUALITY_FLOOR * spanOf(cannon)), cannon.damageMax);

/**
 * The elapsed time from which the INTEGER lower bound is frozen. `ceil` freezes it strictly
 * EARLIER than `crossoverElapsed`: the bound stops moving as soon as `ceil(lowerRaw)` has already
 * fallen to its floored value, which happens at quality
 * `(flooredLowerBound - damageMin) / (QUALITY_WEIGHT * span)`.
 */
function flatFromElapsed(cannon: Cannon): number {
  const qFlat = (flooredLowerBound(cannon) - cannon.damageMin) / (QUALITY_WEIGHT * spanOf(cannon));
  return Math.max(0, (1 - Math.min(1, qFlat)) * cannon.timerMs);
}

/** The fraction of the answer window over which damage is completely insensitive to speed. */
const flatFraction = (cannon: Cannon): number => (cannon.timerMs - flatFromElapsed(cannon)) / cannon.timerMs;

/**
 * The module's own source text. AC-18 and AC-19 require the two comments that describe this
 * module's most load-bearing line to be TRUE and to carry their measurement, so the criteria are
 * about the source, and the assertion has to read it.
 */
const DAMAGE_SOURCE_PATH = fileURLToPath(new URL('../../../src/engine/duel/damage.ts', import.meta.url));
const damageSource = (): string => readFileSync(DAMAGE_SOURCE_PATH, 'utf8');

// ===========================================================================================
// AC-1 / AC-2 — the quality curve and its floor
// ===========================================================================================

describe('T-008 answerQuality — the curve, the floor, and the wrong-answer zero', () => {
  // spec(T-008:AC-1)
  it('is 1 at zero elapsed, 0.5 at half the timer, exactly the floor at and past the timer', () => {
    expect(answerQuality(true, 0, 20_000)).toBe(1);
    expect(answerQuality(true, 10_000, 20_000)).toBe(0.5);
    expect(answerQuality(true, 20_000, 20_000)).toBe(ANSWER_QUALITY_FLOOR);
    expect(answerQuality(true, 999_999, 20_000)).toBe(ANSWER_QUALITY_FLOOR);
    // The floor is pedagogically load-bearing and stated verbatim in ARCHITECTURE.md §4.3.
    // Pinned here as well as in T-004 so this module cannot be read against a retuned floor.
    expect(ANSWER_QUALITY_FLOOR).toBe(0.35);
  });

  // spec(T-008:AC-1)
  it('is exactly 0 for a wrong answer, at every point on the quality axis', () => {
    expect(answerQuality(false, 0, 20_000)).toBe(0);
    // L-017: the wrong-answer branch must be zero across the whole axis, not just at 0ms.
    for (const cannon of ALL_CANNONS) {
      for (const elapsed of elapsedDimension(cannon.timerMs)) {
        expect(answerQuality(false, elapsed, cannon.timerMs)).toBe(0);
      }
    }
  });

  // spec(T-008:AC-2)
  it('stays inside [floor, 1] and never rises as the answer gets slower (20s sweep)', () => {
    let previous = Number.POSITIVE_INFINITY;
    let samples = 0;
    for (let elapsed = 0; elapsed <= 20_000; elapsed += 100) {
      const q = answerQuality(true, elapsed, 20_000);
      expect(Number.isFinite(q)).toBe(true);
      expect(q).toBeGreaterThanOrEqual(ANSWER_QUALITY_FLOOR);
      expect(q).toBeLessThanOrEqual(1);
      expect(q).toBeLessThanOrEqual(previous);
      previous = q;
      samples += 1;
    }
    // L-017: a sweep that silently swept nothing is no evidence at all.
    expect(samples).toBe(201);
    expect(answerQuality(true, 0, 20_000)).toBe(1);
    expect(answerQuality(true, 20_000, 20_000)).toBe(ANSWER_QUALITY_FLOOR);
  });

  // spec(T-008:AC-2)
  it('holds the same bounds and monotonicity for every cannon timer in the catalog', () => {
    for (const cannon of ALL_CANNONS) {
      let previous = Number.POSITIVE_INFINITY;
      for (let step = 0; step <= 200; step += 1) {
        const elapsed = (cannon.timerMs * step) / 200;
        const q = answerQuality(true, elapsed, cannon.timerMs);
        expect(q).toBeGreaterThanOrEqual(ANSWER_QUALITY_FLOOR);
        expect(q).toBeLessThanOrEqual(1);
        expect(q).toBeLessThanOrEqual(previous);
        previous = q;
      }
      // The floor binds strictly before the timer runs out: quality reaches it at 65 % elapsed.
      expect(answerQuality(true, cannon.timerMs, cannon.timerMs)).toBe(ANSWER_QUALITY_FLOOR);
      expect(answerQuality(true, cannon.timerMs * 3, cannon.timerMs)).toBe(ANSWER_QUALITY_FLOOR);
    }
  });
});

// ===========================================================================================
// AC-3 — the Perfect Shot boundary (the off-by-one tripwire)
// ===========================================================================================

describe('T-008 isPerfectShot — the strict 40 % boundary', () => {
  // spec(T-008:AC-3)
  it('is true at 0ms and 7999ms and false at exactly 8000ms and 8001ms on a 20s timer', () => {
    expect(isPerfectShot(true, 0, 20_000)).toBe(true);
    expect(isPerfectShot(true, 7_999, 20_000)).toBe(true);
    // 8000 IS exactly 0.40 * 20000. The comparison is strict `<`, so the boundary is NOT perfect.
    expect(PERFECT_SHOT_TIMER_FRACTION * 20_000).toBe(8_000);
    expect(isPerfectShot(true, 8_000, 20_000)).toBe(false);
    expect(isPerfectShot(true, 8_001, 20_000)).toBe(false);
  });

  // spec(T-008:AC-3)
  it('is false for a wrong answer however fast it came', () => {
    expect(isPerfectShot(false, 0, 20_000)).toBe(false);
    for (const cannon of ALL_CANNONS) {
      for (const elapsed of elapsedDimension(cannon.timerMs)) {
        expect(isPerfectShot(false, elapsed, cannon.timerMs)).toBe(false);
      }
    }
  });

  // spec(T-008:AC-3)
  it('puts the boundary at 40 % of EVERY catalog timer, strictly excluding the boundary itself', () => {
    for (const cannon of ALL_CANNONS) {
      const boundary = PERFECT_SHOT_TIMER_FRACTION * cannon.timerMs;
      expect(Number.isInteger(boundary)).toBe(true); // 12s/15s/18s/20s all land on whole ms
      expect(isPerfectShot(true, 0, cannon.timerMs)).toBe(true);
      expect(isPerfectShot(true, boundary - 1, cannon.timerMs)).toBe(true);
      expect(isPerfectShot(true, boundary, cannon.timerMs)).toBe(false);
      expect(isPerfectShot(true, boundary + 1, cannon.timerMs)).toBe(false);
      expect(isPerfectShot(true, cannon.timerMs, cannon.timerMs)).toBe(false);
    }
  });

  // spec(T-008:AC-3)
  it('agrees with resolveShot: the outcome flag is the predicate, on both sides of the edge', () => {
    // L-012: the predicate being right is worthless if `resolveShot` computes its own edge.
    for (const cannon of ALL_CANNONS) {
      const boundary = PERFECT_SHOT_TIMER_FRACTION * cannon.timerMs;
      for (const elapsed of [0, 1, boundary - 1, boundary, boundary + 1, cannon.timerMs]) {
        const [outcome] = resolveShot({ cannon, correct: true, elapsedMs: elapsed, rng: createRng(7) });
        expect(outcome.perfectShot).toBe(isPerfectShot(true, elapsed, cannon.timerMs));
      }
    }
  });
});

// ===========================================================================================
// AC-4 / AC-15 — roll bounds, and the floor as an OUTCOME bound
// ===========================================================================================

describe('T-008 resolveShot — the roll stays inside the cannon, over every cannon shape', () => {
  // spec(T-008:AC-4)
  it('keeps rollDamage an integer within [damageMin, damageMax] over 5,000 seeded combinations', () => {
    const violations: string[] = [];
    let samples = 0;
    for (const cannon of ALL_CANNONS) {
      for (const elapsed of elapsedDimension(cannon.timerMs)) {
        const shots = threadedShots(cannon, true, elapsed, 50, cannon.damageMin * 1_000 + elapsed);
        for (const shot of shots) {
          samples += 1;
          if (!Number.isInteger(shot.rollDamage)) {
            violations.push(`${cannon.id}@${elapsed}: rollDamage ${shot.rollDamage} not an integer`);
          }
          if (shot.rollDamage < cannon.damageMin || shot.rollDamage > cannon.damageMax) {
            violations.push(
              `${cannon.id}@${elapsed}: rollDamage ${shot.rollDamage} outside [${cannon.damageMin}, ${cannon.damageMax}]`,
            );
          }
        }
      }
    }
    expect(violations.slice(0, 5)).toEqual([]);
    // L-017: a passing assertion over an unswept domain is no evidence at all.
    expect(samples).toBe(5_000);
    expect(ALL_CANNONS.length).toBe(10);
  });

  // spec(T-008:AC-15)
  it('never rolls below damageMin + 0.35 * span — the floor binds the ROLL, not just quality', () => {
    // ARCHITECTURE.md:206 as an assertion. This is the criterion that dies the moment anyone
    // reverts to `u * (1 - W) + quality * W`, where `u -> 0` puts a correct answer at damageMin.
    const violations: string[] = [];
    let samples = 0;
    for (const cannon of ALL_CANNONS) {
      const guaranteed = cannon.damageMin + ANSWER_QUALITY_FLOOR * spanOf(cannon);
      for (const elapsed of elapsedDimension(cannon.timerMs)) {
        const shots = threadedShots(cannon, true, elapsed, 50, cannon.damageMax * 7_919 + elapsed);
        for (const shot of shots) {
          samples += 1;
          if (shot.rollDamage < guaranteed) {
            violations.push(
              `${cannon.id}@${elapsed}: rollDamage ${shot.rollDamage} < guaranteed ${guaranteed}`,
            );
          }
        }
      }
    }
    expect(violations.slice(0, 5)).toEqual([]);
    expect(samples).toBe(5_000);
  });

  // spec(T-008:AC-15)
  it('holds the floor at the SLOWEST correct answer for every cannon, measured as an outcome', () => {
    // The floor's whole purpose is the worst case: `elapsed = timerMs`, quality pinned at 0.35.
    // Asserting the observed MINIMUM (not a mean) is what makes this a bound on the outcome.
    for (const cannon of ALL_CANNONS) {
      const guaranteed = cannon.damageMin + ANSWER_QUALITY_FLOOR * spanOf(cannon);
      const shots = threadedShots(cannon, true, cannon.timerMs, 2_000, 4_242 + cannon.damageMax);
      expect(minRoll(shots)).toBeGreaterThanOrEqual(guaranteed);
      // …and the roll must still be an integer at or above `ceil` of that bound.
      expect(minRoll(shots)).toBeGreaterThanOrEqual(Math.ceil(guaranteed));
      // Genuine spread survives the floor: the top of the range is still reachable.
      expect(shots.some((s) => s.rollDamage === cannon.damageMax)).toBe(true);
    }
  });
});

// ===========================================================================================
// AC-5 — monotonicity in speed, and the sweep is not flat
// ===========================================================================================

describe('T-008 resolveShot — speed shifts the whole distribution upward', () => {
  // spec(T-008:AC-5)
  it('never decreases damageToEnemy as the answer gets faster, for a fixed rng (20s sweep)', () => {
    const rng = createRng(31_337);
    let previous = Number.NEGATIVE_INFINITY;
    let samples = 0;
    for (let elapsed = 20_000; elapsed >= 0; elapsed -= 100) {
      const [outcome] = resolveShot({ cannon: SWIVEL, correct: true, elapsedMs: elapsed, rng });
      expect(outcome.damageToEnemy).toBeGreaterThanOrEqual(previous);
      previous = outcome.damageToEnemy;
      samples += 1;
    }
    expect(samples).toBe(201);
  });

  // spec(T-008:AC-5)
  it('is monotone across every cannon shape and every fixed draw, and ends strictly higher', () => {
    // L-012: monotonicity alone is satisfied by a constant function. The endpoint comparison
    // below is the structural companion — the sweep must actually MOVE, on every gun in the
    // catalog including the 4-wide Swivel, for every fixed draw.
    for (const cannon of ALL_CANNONS) {
      for (const seed of [1, 2, 3, 999, 123_456]) {
        const rng = createRng(seed);
        const step = cannon.timerMs / 200;
        let previous = Number.NEGATIVE_INFINITY;
        let slowest = Number.NaN;
        let fastest = Number.NaN;
        for (let i = 200; i >= 0; i -= 1) {
          const elapsed = step * i;
          const [outcome] = resolveShot({ cannon, correct: true, elapsedMs: elapsed, rng });
          expect(outcome.damageToEnemy).toBeGreaterThanOrEqual(previous);
          previous = outcome.damageToEnemy;
          if (i === 200) slowest = outcome.damageToEnemy;
          if (i === 0) fastest = outcome.damageToEnemy;
        }
        expect(fastest).toBeGreaterThan(slowest);
      }
    }
  });

  // spec(T-008:AC-5)
  it('moves the mean roll strictly upward from the floor to full speed, on EVERY cannon', () => {
    // AC-16 pins the effect SIZE, but only for spans >= 10. This keeps the narrow guns honest
    // too: on the Swivel a flat mean would mean a K-1 player's speed changes nothing at all.
    for (const cannon of ALL_CANNONS) {
      const slow = meanRoll(threadedShots(cannon, true, cannon.timerMs, 4_000, 8_191));
      const fast = meanRoll(threadedShots(cannon, true, 0, 4_000, 8_191));
      expect(fast).toBeGreaterThan(slow);
    }
  });
});

// ===========================================================================================
// AC-6 — the pedagogical guarantee on the starter gun
// ===========================================================================================

describe('T-008 resolveShot — a slow-but-correct answer still lands a respectable volley', () => {
  // spec(T-008:AC-6)
  it('never rolls below 10 on the Swivel at the slowest correct answer, mean at least 10.5', () => {
    // 10 = ceil(8 + 0.35 * 4). A five-year-old who answers correctly on the very last tick
    // still lands in the TOP THIRD of the Swivel's 8–12 range. This is ARCHITECTURE.md:206.
    expect(SWIVEL.damageMin).toBe(8);
    expect(SWIVEL.damageMax).toBe(12);
    expect(Math.ceil(SWIVEL.damageMin + ANSWER_QUALITY_FLOOR * spanOf(SWIVEL))).toBe(10);

    const shots = threadedShots(SWIVEL, true, SWIVEL.timerMs, 10_000, 20_250_728);
    expect(shots.length).toBe(10_000);
    expect(minRoll(shots)).toBeGreaterThanOrEqual(10);
    expect(meanRoll(shots)).toBeGreaterThanOrEqual(10.5);
    // Not a degenerate constant: the whole floored band is reachable.
    expect(new Set(shots.map((s) => s.rollDamage))).toEqual(new Set([10, 11, 12]));
  });
});

// ===========================================================================================
// AC-7 — Perfect Shot is +1 DAMAGE, and BASE_BALLS_PER_VOLLEY is presentation only
// ===========================================================================================

describe('T-008 resolveShot — the Perfect Shot bonus', () => {
  // spec(T-008:AC-7)
  it('adds PERFECT_SHOT_BONUS_DAMAGE to the roll and one ball, on every cannon', () => {
    for (const cannon of ALL_CANNONS) {
      const boundary = PERFECT_SHOT_TIMER_FRACTION * cannon.timerMs;
      for (const elapsed of [0, 1, boundary - 1]) {
        const [outcome] = resolveShot({ cannon, correct: true, elapsedMs: elapsed, rng: createRng(11) });
        expect(outcome.kind).toBe('volley');
        expect(outcome.perfectShot).toBe(true);
        expect(outcome.bonusDamage).toBe(PERFECT_SHOT_BONUS_DAMAGE);
        expect(outcome.damageToEnemy).toBe(outcome.rollDamage + PERFECT_SHOT_BONUS_DAMAGE);
        expect(outcome.ballCount).toBe(BASE_BALLS_PER_VOLLEY + 1);
      }
    }
  });

  // spec(T-008:AC-7)
  it('adds nothing on a correct but non-perfect shot, on every cannon', () => {
    for (const cannon of ALL_CANNONS) {
      const boundary = PERFECT_SHOT_TIMER_FRACTION * cannon.timerMs;
      for (const elapsed of [boundary, boundary + 1, cannon.timerMs, cannon.timerMs * 2]) {
        const [outcome] = resolveShot({ cannon, correct: true, elapsedMs: elapsed, rng: createRng(11) });
        expect(outcome.kind).toBe('volley');
        expect(outcome.perfectShot).toBe(false);
        expect(outcome.bonusDamage).toBe(0);
        expect(outcome.damageToEnemy).toBe(outcome.rollDamage);
        expect(outcome.ballCount).toBe(BASE_BALLS_PER_VOLLEY);
      }
    }
  });

  // spec(T-008:AC-7)
  it('computes damage without reading BASE_BALLS_PER_VOLLEY — damage does not subdivide', async () => {
    // RULING: a Perfect Shot is +1 DAMAGE, not an extra projectile, and balls carry no damage.
    // `BASE_BALLS_PER_VOLLEY` is a presentation constant. If the damage computation ever divides
    // by it, multiplies by it, or otherwise reads it, this test goes red — which is exactly what
    // "the engine ignores it" means as an executable claim rather than a comment.
    const shotsWith = async (balls: number): Promise<readonly ShotOutcome[]> => {
      vi.resetModules();
      const actual = await vi.importActual<typeof import('@engine/tuning')>('@engine/tuning');
      vi.doMock('@engine/tuning', () => ({ ...actual, BASE_BALLS_PER_VOLLEY: balls }));
      const mod = await import('@engine/duel/damage');
      const out: ShotOutcome[] = [];
      for (const cannon of ALL_CANNONS) {
        for (const elapsed of elapsedDimension(cannon.timerMs)) {
          for (const seed of [3, 5, 8, 13, 21]) {
            const [outcome] = mod.resolveShot({
              cannon,
              correct: true,
              elapsedMs: elapsed,
              rng: createRng(seed),
            });
            out.push(outcome);
          }
        }
      }
      vi.doUnmock('@engine/tuning');
      return out;
    };

    const one = await shotsWith(BASE_BALLS_PER_VOLLEY);
    const seven = await shotsWith(BASE_BALLS_PER_VOLLEY + 6);
    vi.resetModules();

    expect(one.length).toBe(500);
    expect(seven.length).toBe(500);

    // L-014: prove the mutation is LIVE before trusting the verdict. `ballCount` must track
    // the mutated constant, or the mock never took effect and this test proves nothing.
    expect(new Set(one.map((s) => s.ballCount))).toEqual(
      new Set([BASE_BALLS_PER_VOLLEY, BASE_BALLS_PER_VOLLEY + 1]),
    );
    expect(new Set(seven.map((s) => s.ballCount))).toEqual(
      new Set([BASE_BALLS_PER_VOLLEY + 6, BASE_BALLS_PER_VOLLEY + 7]),
    );

    // …and with the mutation demonstrably live, NO damage field may move.
    for (let i = 0; i < one.length; i += 1) {
      const a = at(one, i);
      const b = at(seven, i);
      expect(b.rollDamage).toBe(a.rollDamage);
      expect(b.bonusDamage).toBe(a.bonusDamage);
      expect(b.damageToEnemy).toBe(a.damageToEnemy);
      expect(b.damageToSelf).toBe(a.damageToSelf);
      expect(b.answerQuality).toBe(a.answerQuality);
    }
  });
});

// ===========================================================================================
// AC-8 / AC-9 — the wrong-answer matrix across all three temperaments
// ===========================================================================================

describe('T-008 resolveShot — a wrong answer deals no damage, and volatile guns bite back', () => {
  // spec(T-008:AC-8)
  it('misfires cleanly on the reliable starter gun', () => {
    expect(SWIVEL.temperament).toBe('reliable');
    for (const elapsed of elapsedDimension(SWIVEL.timerMs)) {
      const [outcome] = resolveShot({
        cannon: SWIVEL,
        correct: false,
        elapsedMs: elapsed,
        rng: createRng(2_024),
      });
      expect(outcome.kind).toBe('misfire');
      expect(outcome.damageToEnemy).toBe(0);
      expect(outcome.damageToSelf).toBe(0);
      expect(outcome.ballCount).toBe(0);
      expect(outcome.perfectShot).toBe(false);
      expect(outcome.answerQuality).toBe(0);
      expect(outcome.rollDamage).toBe(0);
      expect(outcome.bonusDamage).toBe(0);
    }
  });

  // spec(T-008:AC-9)
  it('deals exactly the catalog recoil on a volatile miss: 5 / 8 / 10', () => {
    const expected: ReadonlyArray<readonly [string, number]> = [
      ['double_broadside', 5],
      ['powder_keg', 8],
      ['long_nine', 10],
    ];
    for (const [id, recoil] of expected) {
      const cannon = ALL_CANNONS.find((c) => c.id === id);
      expect(cannon).toBeDefined();
      if (cannon === undefined) continue;
      expect(cannon.temperament).toBe('volatile');
      expect(cannon.recoilDamage).toBe(recoil);
      const [outcome] = resolveShot({
        cannon,
        correct: false,
        elapsedMs: 0,
        rng: createRng(1_009),
      });
      expect(outcome.damageToSelf).toBe(recoil);
      expect(outcome.damageToEnemy).toBe(0);
      expect(outcome.kind).toBe('misfire');
    }
  });

  // spec(T-008:AC-9)
  it('reads recoil from the cannon for EVERY volatile gun, including the zero-recoil Culverin', () => {
    // The Culverin is `volatile` with `recoilDamage: 0` — it is the "swingy" starter, not a
    // punishing one. A hard-coded recoil table would pass the 5/8/10 test above and fail here.
    expect(CULVERIN.temperament).toBe('volatile');
    expect(CULVERIN.recoilDamage).toBe(0);
    const volatiles = ALL_CANNONS.filter((c) => c.temperament === 'volatile');
    expect(volatiles.length).toBeGreaterThanOrEqual(4);
    for (const cannon of volatiles) {
      for (const elapsed of elapsedDimension(cannon.timerMs)) {
        const [outcome] = resolveShot({ cannon, correct: false, elapsedMs: elapsed, rng: createRng(77) });
        expect(outcome.damageToSelf).toBe(cannon.recoilDamage);
      }
    }
  });

  // spec(T-008:AC-9)
  it('never recoils on a standard or reliable gun, and never on a CORRECT answer anywhere', () => {
    // Owner ruling D-4: reliable and standard are identical at the damage layer — flavour only.
    for (const cannon of ALL_CANNONS) {
      for (const elapsed of elapsedDimension(cannon.timerMs)) {
        const [wrong] = resolveShot({ cannon, correct: false, elapsedMs: elapsed, rng: createRng(53) });
        if (cannon.temperament === 'standard' || cannon.temperament === 'reliable') {
          expect(wrong.damageToSelf).toBe(0);
        }
        // A correct answer never recoils, on any temperament.
        const [right] = resolveShot({ cannon, correct: true, elapsedMs: elapsed, rng: createRng(53) });
        expect(right.damageToSelf).toBe(0);
        expect(right.kind).toBe('volley');
      }
    }
    expect(ALL_CANNONS.some((c) => c.temperament === 'standard')).toBe(true);
    expect(ALL_CANNONS.some((c) => c.temperament === 'reliable')).toBe(true);
  });

  // spec(T-008:AC-9)
  it('gates recoil on TEMPERAMENT, not on the recoilDamage field being non-zero', () => {
    // L-012: the four assertions above certify a projection, not the mechanism. Every
    // non-volatile gun in today's catalog already carries `recoilDamage: 0`, so
    // `damageToSelf: cannon.recoilDamage` — with no temperament check at all — passes all of
    // them. Measured: a mutant that drops the gate is indistinguishable on the real catalog.
    //
    // The ticket's formula is `temperament === 'volatile' ? recoilDamage : 0`, so the gate is
    // the contract. Probing it needs the one schema-legal shape the catalog does not happen to
    // contain: a `standard` gun carrying non-zero recoil. (`reliable` + non-zero recoil is
    // rejected by T-003's cannonSchema, so `standard` is the only legal probe.)
    const catalogStandard = ALL_CANNONS.find((c) => c.temperament === 'standard');
    expect(catalogStandard).toBeDefined();
    if (catalogStandard === undefined) return;
    expect(catalogStandard.recoilDamage).toBe(0);

    const standardWithRecoil: Cannon = { ...catalogStandard, recoilDamage: 6 };
    for (const elapsed of elapsedDimension(standardWithRecoil.timerMs)) {
      const [wrong] = resolveShot({
        cannon: standardWithRecoil,
        correct: false,
        elapsedMs: elapsed,
        rng: createRng(64),
      });
      expect(wrong.kind).toBe('misfire');
      expect(wrong.damageToSelf).toBe(0);
    }
    // …while the same field on a volatile gun IS read.
    const volatileWithRecoil: Cannon = { ...standardWithRecoil, temperament: 'volatile' };
    const [volatileMiss] = resolveShot({
      cannon: volatileWithRecoil,
      correct: false,
      elapsedMs: 0,
      rng: createRng(64),
    });
    expect(volatileMiss.damageToSelf).toBe(6);
  });
});

// ===========================================================================================
// AC-10 / AC-11 — determinism and PRNG stream alignment
// ===========================================================================================

describe('T-008 resolveShot — determinism and the seeded stream', () => {
  // spec(T-008:AC-10)
  it('is a pure function: 100 identical calls give 100 identical outcomes and rngs', () => {
    // L-012: the statistical tests above certify a distribution. THIS certifies the mechanism —
    // same input twice, same output — which is what rules out a module-scoped counter or
    // `Math.random()` hiding behind a plausible-looking histogram.
    for (const cannon of [SWIVEL, CULVERIN, LONG_NINE]) {
      for (const correct of [true, false]) {
        for (const elapsedMs of [0, 1_000, cannon.timerMs]) {
          const rng = createRng(90_210);
          const first = resolveShot({ cannon, correct, elapsedMs, rng });
          for (let i = 0; i < 100; i += 1) {
            const again = resolveShot({ cannon, correct, elapsedMs, rng });
            expect(again[0]).toEqual(first[0]);
            expect(again[1]).toEqual(first[1]);
          }
        }
      }
    }
  });

  // spec(T-008:AC-10)
  it('reproduces an entire volley sequence byte-for-byte from the same seed', () => {
    const play = (seed: number): readonly ShotOutcome[] => {
      let rng: Rng = createRng(seed);
      const out: ShotOutcome[] = [];
      for (let i = 0; i < 200; i += 1) {
        const cannon = at(ALL_CANNONS, i % ALL_CANNONS.length);
        const [outcome, next] = resolveShot({
          cannon,
          correct: i % 3 !== 0,
          elapsedMs: (i * 137) % cannon.timerMs,
          rng,
        });
        out.push(outcome);
        rng = next;
      }
      return out;
    };
    expect(play(555)).toEqual(play(555));
    expect(play(555)).not.toEqual(play(556));
  });

  // spec(T-008:AC-11)
  it('advances the stream exactly once per shot, whether the answer was right or wrong', () => {
    // Skipping the draw on a misfire would make replay depend on correctness. `nextFloat` is the
    // reference: the returned Rng must be EXACTLY one step on, not zero and not two.
    for (const cannon of ALL_CANNONS) {
      for (const correct of [true, false]) {
        for (const seed of [0, 1, 42, 0xffff_ffff]) {
          const rng = createRng(seed);
          const [, expectedNext] = nextFloat(rng);
          const [, actualNext] = resolveShot({ cannon, correct, elapsedMs: 500, rng });
          expect(actualNext).toEqual(expectedNext);
          expect(actualNext.state).not.toBe(rng.state);
        }
      }
    }
  });

  // spec(T-008:AC-11)
  it('keeps the stream aligned across a mixed right/wrong sequence', () => {
    // A duel replay interleaves hits and misses. After N shots the engine's Rng must equal the
    // Rng reached by N raw `nextFloat` draws — the property that makes the action log replayable.
    let engineRng: Rng = createRng(4_711);
    let rawRng: Rng = createRng(4_711);
    for (let i = 0; i < 300; i += 1) {
      const [, next] = resolveShot({
        cannon: at(ALL_CANNONS, i % ALL_CANNONS.length),
        correct: i % 2 === 0,
        elapsedMs: i * 37,
        rng: engineRng,
      });
      engineRng = next;
      rawRng = nextFloat(rawRng)[1];
      expect(engineRng).toEqual(rawRng);
    }
  });
});

// ===========================================================================================
// AC-12 — argument validation
// ===========================================================================================

describe('T-008 resolveShot — illegal arguments throw RangeError', () => {
  // spec(T-008:AC-12)
  it('rejects a negative elapsedMs', () => {
    for (const elapsedMs of [-1, -0.0001, -20_000, -999_999]) {
      expect(() => resolveShot({ cannon: SWIVEL, correct: true, elapsedMs, rng: createRng(1) })).toThrow(
        RangeError,
      );
      expect(() => resolveShot({ cannon: SWIVEL, correct: false, elapsedMs, rng: createRng(1) })).toThrow(
        RangeError,
      );
    }
  });

  // spec(T-008:AC-12)
  it('rejects a cannon whose timerMs is zero or negative', () => {
    for (const timerMs of [0, -1, -20_000]) {
      expect(() =>
        resolveShot({
          cannon: withTimer(SWIVEL, timerMs),
          correct: true,
          elapsedMs: 0,
          rng: createRng(1),
        }),
      ).toThrow(RangeError);
      expect(() =>
        resolveShot({
          cannon: withTimer(LONG_NINE, timerMs),
          correct: false,
          elapsedMs: 0,
          rng: createRng(1),
        }),
      ).toThrow(RangeError);
    }
  });

  // spec(T-008:AC-12)
  it('accepts the legal boundary: elapsedMs exactly 0 and elapsedMs far beyond the timer', () => {
    // The complement of the rejection cases — a validator that rejects everything also passes a
    // criterion listing only reject cases (L-009).
    expect(() =>
      resolveShot({ cannon: SWIVEL, correct: true, elapsedMs: 0, rng: createRng(1) }),
    ).not.toThrow();
    expect(() =>
      resolveShot({ cannon: SWIVEL, correct: true, elapsedMs: 999_999, rng: createRng(1) }),
    ).not.toThrow();
    expect(() =>
      resolveShot({ cannon: withTimer(SWIVEL, 1), correct: true, elapsedMs: 0, rng: createRng(1) }),
    ).not.toThrow();
  });
});

// ===========================================================================================
// AC-13 — the tuning relationship: duels resolve in 4–6 player volleys
// ===========================================================================================

describe('T-008 resolveShot — the first duel resolves in 4–6 volleys', () => {
  // spec(T-008:AC-13)
  it('sinks a Port Sumwich sloop in 4–6 Swivel volleys, every single observation', () => {
    // PLAN.md §The duel loop: "duels resolve in 4–6 player volleys"; "the very first duel never
    // drags". This is the test that goes red if anyone retunes enemy hull or starter damage into
    // a grind — it couples T-004's ENEMY_HULL_BY_ISLAND to this module's roll on purpose.
    const hull = ENEMY_HULL_BY_ISLAND.port_sumwich;
    const halfTimer = SWIVEL.timerMs / 2;
    const observations: number[] = [];

    for (let seed = 1; seed <= 1_000; seed += 1) {
      let rng: Rng = createRng(seed);
      let remaining = hull;
      let volleys = 0;
      while (remaining > 0 && volleys < 100) {
        const [outcome, next] = resolveShot({
          cannon: SWIVEL,
          correct: true,
          elapsedMs: halfTimer,
          rng,
        });
        remaining -= outcome.damageToEnemy;
        rng = next;
        volleys += 1;
      }
      observations.push(volleys);
    }

    expect(observations.length).toBe(1_000);
    const sorted = [...observations].sort((a, b) => a - b);
    const median = (at(sorted, 499) + at(sorted, 500)) / 2;
    expect(median).toBeGreaterThanOrEqual(4);
    expect(median).toBeLessThanOrEqual(6);
    // "no tail tolerance beyond what PLAN.md states" — EVERY observation, not just the median.
    expect(Math.min(...observations)).toBeGreaterThanOrEqual(4);
    expect(Math.max(...observations)).toBeLessThanOrEqual(6);
  });
});

// ===========================================================================================
// AC-14 — output sanity across the whole input surface
// ===========================================================================================

describe('T-008 ShotOutcome — every field is finite, non-negative, and serialisable', () => {
  // spec(T-008:AC-14)
  it('holds the numeric invariants over every cannon, every quality, right and wrong', () => {
    let samples = 0;
    for (const cannon of ALL_CANNONS) {
      const ceiling = cannon.damageMax + PERFECT_SHOT_BONUS_DAMAGE;
      for (const correct of [true, false]) {
        for (const elapsed of elapsedDimension(cannon.timerMs)) {
          for (const shot of threadedShots(cannon, correct, elapsed, 25, 6_007 + elapsed)) {
            samples += 1;
            for (const field of [
              shot.rollDamage,
              shot.bonusDamage,
              shot.damageToEnemy,
              shot.damageToSelf,
              shot.ballCount,
            ]) {
              expect(Number.isFinite(field)).toBe(true);
              expect(Number.isInteger(field)).toBe(true);
              expect(field).toBeGreaterThanOrEqual(0);
            }
            expect(Number.isFinite(shot.answerQuality)).toBe(true);
            expect(shot.answerQuality).toBeGreaterThanOrEqual(0);
            expect(shot.answerQuality).toBeLessThanOrEqual(1);
            // Damage may exceed the cannon's advertised max ONLY by the Perfect Shot bonus.
            expect(shot.damageToEnemy).toBeLessThanOrEqual(ceiling);
            expect(shot.damageToSelf).toBeLessThanOrEqual(cannon.recoilDamage);
            expect(shot.kind).toBe(correct ? 'volley' : 'misfire');
          }
        }
      }
    }
    expect(samples).toBe(5_000);
  });

  // spec(T-008:AC-14)
  it('is a plain serialisable object — it becomes part of DuelState in T-013', () => {
    const [outcome] = resolveShot({
      cannon: LONG_NINE,
      correct: true,
      elapsedMs: 0,
      rng: createRng(8),
    });
    expect(JSON.parse(JSON.stringify(outcome))).toEqual(outcome);
    expect(Object.getPrototypeOf(outcome)).toBe(Object.prototype);
    expect(new Set(Object.keys(outcome))).toEqual(
      new Set([
        'kind',
        'answerQuality',
        'rollDamage',
        'bonusDamage',
        'damageToEnemy',
        'damageToSelf',
        'ballCount',
        'perfectShot',
      ]),
    );
    expect(outcome.damageToEnemy).toBe(outcome.rollDamage + outcome.bonusDamage);
  });
});

// ===========================================================================================
// AC-16 — the effect size. Without this, the game's core mechanic can ship invisible.
// ===========================================================================================

describe('T-008 resolveShot — answer speed moves damage by a MEASURABLE amount', () => {
  // spec(T-008:AC-16)
  it('lifts the mean roll by at least 0.10 * span from the floor to full speed', () => {
    // L-006 / L-018. `QUALITY_WEIGHT` froze in wave 2 against a bound derived from THIS formula
    // (w > 7/12); a lazy `w = 0.001` passes every monotonicity check in this file and makes
    // "answer speed aims the shot" statistically undetectable in play. Scoped to spans >= 10,
    // where a single roll's integer rounding cannot dominate the measurement.
    expect(WIDE_CANNONS.map((c) => c.id)).toEqual([
      'culverin',
      'twelve_pounder',
      'mortar',
      'double_broadside',
      'powder_keg',
      'long_nine',
    ]);

    for (const cannon of WIDE_CANNONS) {
      const span = spanOf(cannon);
      const fast = threadedShots(cannon, true, 0, 20_000, 1_301 + span);
      const slow = threadedShots(cannon, true, cannon.timerMs, 20_000, 6_101 + span);
      expect(fast.length).toBe(20_000);
      expect(slow.length).toBe(20_000);
      const gap = meanRoll(fast) - meanRoll(slow);
      expect(gap).toBeGreaterThanOrEqual(0.1 * span);
    }
  });

  // spec(T-008:AC-16)
  it('shifts the whole band, not just the average — the fast floor clears the slow floor', () => {
    // L-012: a mean gap is a projection. An implementation could hit the mean by adding a rare
    // spike. What the child actually feels is the BAND moving: on the Culverin, a slow-correct
    // answer rolls 9–16 and a fast one rolls 13–16. Assert the observed minima separate.
    for (const cannon of WIDE_CANNONS) {
      const fast = threadedShots(cannon, true, 0, 5_000, 2_207 + spanOf(cannon));
      const slow = threadedShots(cannon, true, cannon.timerMs, 5_000, 2_207 + spanOf(cannon));
      expect(minRoll(fast)).toBeGreaterThan(minRoll(slow));
      // …and the lift is a real fraction of the gun's range, not one point of rounding noise.
      expect(minRoll(fast) - minRoll(slow)).toBeGreaterThanOrEqual(0.1 * spanOf(cannon));
    }
  });
});

// ===========================================================================================
// AC-17 — non-finite `elapsedMs` is rejected, never propagated
// ===========================================================================================

describe('T-008 — a non-finite elapsedMs throws rather than leaking NaN downstream', () => {
  // Measured on the implementation under review, before this criterion existed:
  //   resolveShot({ correct: true, elapsedMs: NaN })       -> rollDamage NaN, damageToEnemy NaN
  //   resolveShot({ correct: true, elapsedMs: Infinity })  -> no throw, quality 0.35, roll 11
  //   answerQuality(true, -Infinity, 20000)                -> 1        (the BEST possible quality)
  //   isPerfectShot(true, -Infinity, 20000)                -> true     (an impossible Perfect Shot)
  // A NaN hull in T-020 is a duel that never ends and throws nothing to trace — the "state
  // machine that soft-locks a child mid-fight" catastrophe class in posture.md. AC-14's
  // finiteness invariant claims to cover this; AC-12's guards did not reach it.
  const NON_FINITE = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY] as const;

  // spec(T-008:AC-17)
  it('rejects NaN, Infinity and -Infinity from resolveShot, on every cannon and both answers', () => {
    for (const cannon of ALL_CANNONS) {
      for (const elapsedMs of NON_FINITE) {
        for (const correct of [true, false]) {
          expect(() => resolveShot({ cannon, correct, elapsedMs, rng: createRng(9) })).toThrow(RangeError);
        }
      }
    }
  });

  // spec(T-008:AC-17)
  it('never returns a non-finite ShotOutcome field — the invariant AC-14 claims, enforced', () => {
    // L-012: "it throws" is the mechanism; THIS is the property that actually matters downstream.
    // Written as an outcome assertion so it survives any future decision to clamp instead of throw.
    for (const cannon of ALL_CANNONS) {
      for (const elapsedMs of NON_FINITE) {
        for (const correct of [true, false]) {
          let outcome: ShotOutcome | undefined;
          try {
            [outcome] = resolveShot({ cannon, correct, elapsedMs, rng: createRng(9) });
          } catch {
            continue; // throwing is the specified behaviour; a thrown call leaks nothing
          }
          const leaked = [
            outcome.rollDamage,
            outcome.bonusDamage,
            outcome.damageToEnemy,
            outcome.damageToSelf,
            outcome.ballCount,
            outcome.answerQuality,
          ].filter((field) => !Number.isFinite(field));
          expect(leaked).toEqual([]);
        }
      }
    }
  });

  // spec(T-008:AC-17)
  it('guards the exported predicates too — T-013 and T-020 may call them directly', () => {
    // `answerQuality` and `isPerfectShot` are part of the public surface, not private helpers.
    // Only the `correct: true` branch is pinned: on `correct: false` both short-circuit to a
    // constant (0 / false) before `elapsedMs` is read, and this ticket does not say whether the
    // guard precedes that short-circuit. Nothing non-finite escapes either way.
    for (const cannon of ALL_CANNONS) {
      for (const elapsedMs of NON_FINITE) {
        expect(() => answerQuality(true, elapsedMs, cannon.timerMs)).toThrow(RangeError);
        expect(() => isPerfectShot(true, elapsedMs, cannon.timerMs)).toThrow(RangeError);
      }
    }
  });

  // spec(T-008:AC-17)
  it('still accepts every finite elapsed time — the guard rejects the class, not the input', () => {
    // L-009: a criterion listing only reject cases is passed by a validator that rejects
    // everything. `-Infinity` already threw before this criterion existed (it is `< 0`), so
    // without this complement the whole AC could be "satisfied" by throwing unconditionally.
    for (const cannon of ALL_CANNONS) {
      for (const elapsedMs of elapsedDimension(cannon.timerMs)) {
        expect(() => resolveShot({ cannon, correct: true, elapsedMs, rng: createRng(9) })).not.toThrow();
        expect(answerQuality(true, elapsedMs, cannon.timerMs)).toBeGreaterThanOrEqual(ANSWER_QUALITY_FLOOR);
        expect(typeof isPerfectShot(true, elapsedMs, cannon.timerMs)).toBe('boolean');
      }
    }
  });
});

// ===========================================================================================
// AC-18 — the dead zone: where speed stops mattering, and how wide it really is
// ===========================================================================================

describe('T-008 — the quality crossover, measured rather than asserted in prose', () => {
  // spec(T-008:AC-18)
  it('reads the roll lower bound exactly — the instrument this criterion depends on', () => {
    // L-014: prove the instrument before trusting any verdict it produces. `LOW_U_SEED` is only
    // a valid probe if its first draw rounds to zero for the WIDEST gun in the catalog.
    const [u] = nextFloat(createRng(LOW_U_SEED));
    const widestSpan = Math.max(...ALL_CANNONS.map(spanOf));
    expect(Math.round(u * widestSpan)).toBe(0);
    // …and the bound it reads must be the floored bound at the slowest correct answer.
    for (const cannon of ALL_CANNONS) {
      expect(lowerBoundAt(cannon, cannon.timerMs)).toBe(flooredLowerBound(cannon));
      expect(lowerBoundAt(cannon, cannon.timerMs)).toBe(
        minRoll(threadedShots(cannon, true, cannon.timerMs, 2_000, 31)),
      );
    }
  });

  // spec(T-008:AC-18)
  it('freezes damage on the slow side of the crossover while answerQuality keeps moving', () => {
    // The crossover is DERIVED: quality below `ANSWER_QUALITY_FLOOR / QUALITY_WEIGHT` contributes
    // nothing, because `max(q * QUALITY_WEIGHT, ANSWER_QUALITY_FLOOR)` is already at the floor.
    expect(CROSSOVER_QUALITY).toBeGreaterThan(ANSWER_QUALITY_FLOOR);
    expect(CROSSOVER_QUALITY).toBeLessThan(1);

    for (const cannon of ALL_CANNONS) {
      const justSlower = Math.ceil(crossoverElapsed(cannon.timerMs)) + 1;
      const slowest = cannon.timerMs;
      expect(justSlower).toBeLessThan(slowest);

      // Damage is bit-identical across the whole slow side, for the same draw stream.
      const a = threadedShots(cannon, true, justSlower, 400, 5_501);
      const b = threadedShots(cannon, true, slowest, 400, 5_501);
      expect(a.map((s) => s.rollDamage)).toEqual(b.map((s) => s.rollDamage));
      expect(a.map((s) => s.damageToEnemy)).toEqual(b.map((s) => s.damageToEnemy));

      // …while `answerQuality` still reports a difference. A UI meter driven off that field
      // therefore OVER-REPORTS: it shows the child improving where nothing changes. Pinned so
      // nobody "fixes" one of the two to match the other without a design decision.
      expect(answerQuality(true, justSlower, cannon.timerMs)).not.toBe(
        answerQuality(true, slowest, cannon.timerMs),
      );
      expect(answerQuality(true, justSlower, cannon.timerMs)).toBeGreaterThan(
        answerQuality(true, slowest, cannon.timerMs),
      );
    }
  });

  // spec(T-008:AC-18)
  it('measures the flat region at 1ms resolution and agrees with the derived crossover', () => {
    // L-021: the closed form is a hypothesis. Scan the real module and make the two agree.
    for (const cannon of ALL_CANNONS) {
      const floored = flooredLowerBound(cannon);
      let firstFlat = cannon.timerMs;
      for (let e = cannon.timerMs; e >= 0; e -= 1) {
        if (lowerBoundAt(cannon, e) !== floored) break;
        firstFlat = e;
      }
      // The measurement and the derivation must land within a millisecond of each other.
      expect(Math.abs(firstFlat - flatFromElapsed(cannon))).toBeLessThanOrEqual(1);
      // Strictly below the flat region the bound really is higher — the region has an edge.
      expect(lowerBoundAt(cannon, firstFlat - 1)).toBeGreaterThan(floored);
      // …and `ceil` freezes the bound EARLIER than the raw quality crossover, which is the part
      // the source comment got wrong: the dead zone is wider than `q <= FLOOR / WEIGHT` implies.
      expect(firstFlat).toBeLessThan(crossoverElapsed(cannon.timerMs));
    }
  });

  // spec(T-008:AC-18)
  it('leaves over half of every answer window flat, and 71 % of the K-1 starter gun', () => {
    // The measured extent this criterion exists to document. On the Swivel Gun — the gun a
    // five-year-old actually holds — answering in the last 71 % of the window is worth exactly
    // the same as answering at the buzzer.
    for (const cannon of ALL_CANNONS) {
      expect(flatFraction(cannon)).toBeGreaterThanOrEqual(0.5);
      expect(flatFraction(cannon)).toBeLessThan(1);
    }
    expect(Math.round(100 * flatFraction(SWIVEL))).toBe(71);
    // The three grade-1/2 guns share the Swivel's figure; the wide guns are the 51–60 % end.
    for (const id of ['six_pounder', 'chain_shot', 'nine_pounder'] as const) {
      const cannon = ALL_CANNONS.find((c) => c.id === id);
      expect(cannon).toBeDefined();
      if (cannon === undefined) continue;
      expect(Math.round(100 * flatFraction(cannon))).toBe(71);
    }
    expect(Math.round(100 * flatFraction(LONG_NINE))).toBeLessThanOrEqual(60);
  });

  // spec(T-008:AC-18)
  it('says so in the source: the crossover comment must be true and carry its measurement', () => {
    // ---- LITERAL SOURCE-TEXT CHECK (L-016) -------------------------------------------------
    // This is a SECONDARY check; the four behavioural tests above are the authority. It exists
    // because the criterion is about a comment that currently misleads, and a comment cannot be
    // pinned any other way. The exact strings are named in each failure message, so a correct
    // implementation is never sent hunting for a defect that is not there.
    const src = damageSource();
    const swivelPercent = String(Math.round(100 * flatFraction(SWIVEL)));

    expect(
      src.includes('lifts the bound further'),
      'damage.ts must no longer claim "Quality above the floor lifts the bound further" — it ' +
        'lifts nothing until quality exceeds ANSWER_QUALITY_FLOOR / QUALITY_WEIGHT. Remove or ' +
        'rewrite that phrase.',
    ).toBe(false);

    expect(
      src.includes('ANSWER_QUALITY_FLOOR / QUALITY_WEIGHT'),
      'damage.ts must state the crossover formula literally as ' +
        '"ANSWER_QUALITY_FLOOR / QUALITY_WEIGHT" so it moves with the dev slider instead of ' +
        'baking in today`s 0.5.',
    ).toBe(true);

    expect(
      new RegExp(`\\b${swivelPercent}\\b`).test(src),
      `damage.ts must carry the measured extent of the flat region — ${swivelPercent} % of the ` +
        'answer window on the Swivel Gun (and on the three grade-1/2 guns), 51-60 % on the rest.',
    ).toBe(true);
  });
});

// ===========================================================================================
// AC-19 — the damageMax clamp: inert today, reachable via the dev slider
// ===========================================================================================

describe('T-008 — the damageMax clamp carries a committed measurement, not an argument', () => {
  // spec(T-008:AC-19)
  it('is inert at the shipped QUALITY_WEIGHT — the ceil never reaches damageMax', () => {
    // The comment claims the `min(..., damageMax)` binds only when `QUALITY_WEIGHT > 1`. Half of
    // that claim is "it does nothing today", asserted here across the full input surface rather
    // than argued: the UNCLAMPED value is what the module actually returns everywhere.
    expect(QUALITY_WEIGHT).toBeLessThanOrEqual(1);
    for (const cannon of ALL_CANNONS) {
      for (const elapsedMs of elapsedDimension(cannon.timerMs)) {
        const quality = answerQuality(true, elapsedMs, cannon.timerMs);
        const unclamped = Math.ceil(
          cannon.damageMin + Math.max(quality * QUALITY_WEIGHT, ANSWER_QUALITY_FLOOR) * spanOf(cannon),
        );
        expect(unclamped).toBeLessThanOrEqual(cannon.damageMax);
        expect(lowerBoundAt(cannon, elapsedMs)).toBe(unclamped);
      }
    }
  });

  // spec(T-008:AC-19)
  it('becomes active above 1 — the reachability probe, committed instead of scratchpadded', async () => {
    // L-015: "unreachable" is a claim that needs a probe, and a probe that lives in a scratchpad
    // is not evidence. `QUALITY_WEIGHT` is a live dev-screen slider, so `w > 1` is reachable by
    // a designer moving it, not merely in principle.
    const WEIGHT_ABOVE_ONE = 1.001;
    vi.resetModules();
    const actual = await vi.importActual<typeof import('@engine/tuning')>('@engine/tuning');
    vi.doMock('@engine/tuning', () => ({ ...actual, QUALITY_WEIGHT: WEIGHT_ABOVE_ONE }));
    const mod = await import('@engine/duel/damage');

    for (const cannon of ALL_CANNONS) {
      // L-014: the mutation must be demonstrably live before its verdict means anything. Without
      // the clamp the bound would be ceil(damageMin + 1.001 * span) = damageMax + 1, which is
      // OUTSIDE the cannon — so this is also the case AC-4 depends on the clamp to prevent.
      const unclamped = Math.ceil(cannon.damageMin + WEIGHT_ABOVE_ONE * spanOf(cannon));
      expect(unclamped).toBeGreaterThan(cannon.damageMax);

      const [outcome] = mod.resolveShot({
        cannon,
        correct: true,
        elapsedMs: 0,
        rng: createRng(LOW_U_SEED),
      });
      expect(outcome.rollDamage).toBe(cannon.damageMax);
      expect(outcome.rollDamage).toBeLessThanOrEqual(cannon.damageMax);
    }

    vi.doUnmock('@engine/tuning');
    vi.resetModules();
  });

  // spec(T-008:AC-19)
  it('cites where that measurement lives, so the comment is evidence and not an argument', () => {
    // ---- LITERAL SOURCE-TEXT CHECK (L-016) -------------------------------------------------
    // Secondary to the two behavioural tests above. INTERPRETATION FLAGGED IN THE RETURN: the
    // criterion says the comment "must carry its measurement" without saying in what form. In
    // this repo a committed measurement is a `spec(T-008:AC-n)`-tagged test, so the comment
    // carrying it means citing that criterion. If the coordinator wants a numeric probe written
    // into the prose instead, this is a one-string change.
    const src = damageSource();
    expect(
      /AC-19/.test(src),
      'the min(..., damageMax) clamp comment must cite the committed measurement that backs its ' +
        'reachability claim — the string "AC-19" (per L-015, a claim carries its measurement or ' +
        'it is an argument).',
    ).toBe(true);
  });
});

// ===========================================================================================
// AC-20 — a non-finite `timerMs` is the twin of AC-17's hole, and is rejected identically
// ===========================================================================================

describe('T-008 — a non-finite timerMs throws rather than fabricating a maximum volley', () => {
  // Measured on the implementation under review, before this criterion existed:
  //
  //   timerMs        resolveShot(correct: true)              answerQuality   isPerfectShot
  //   NaN            rollDamage NaN, damageToEnemy NaN       NaN             false
  //   Infinity       rollDamage 12 (= damageMax),            1               true
  //                  perfectShot true, damageToEnemy 13
  //   -Infinity      throws RangeError                       1               false
  //
  // `NaN <= 0` is false, so AC-12's `timerMs <= 0` guard sails straight past a non-finite timer —
  // the identical shape to `elapsedMs < 0` missing `NaN` (AC-17). `Infinity` is the worse of the
  // two: `1 - elapsed/Infinity` is `1`, so an impossible timer reports the BEST possible outcome
  // in every field at once — maximum quality, maximum roll, and a Perfect Shot. And `-Infinity`
  // shows the three entry points already disagreeing: `resolveShot` throws while `answerQuality`
  // returns 1, which is what AC-20's "guard identically" clause exists to close.
  const NON_FINITE = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY] as const;

  /** Classifies a call as having thrown, or as having returned a value. */
  function classify(fn: () => unknown): { threw: boolean; error?: string; value?: unknown } {
    try {
      return { threw: false, value: fn() };
    } catch (error) {
      return { threw: true, error: (error as Error).constructor.name };
    }
  }

  // spec(T-008:AC-20)
  it('rejects a NaN, Infinity or -Infinity timerMs from resolveShot, on every cannon', () => {
    for (const cannon of ALL_CANNONS) {
      for (const timerMs of NON_FINITE) {
        for (const correct of [true, false]) {
          expect(() =>
            resolveShot({ cannon: withTimer(cannon, timerMs), correct, elapsedMs: 0, rng: createRng(12) }),
          ).toThrow(RangeError);
        }
      }
    }
  });

  // spec(T-008:AC-20)
  it('never lets a non-finite timer produce a volley — least of all a maximum one', () => {
    // L-012: "it throws" is the mechanism. THIS is the property T-020 depends on: an impossible
    // timer must not become a shot at all. Written as an outcome assertion so it survives any
    // later decision to clamp rather than throw, and so it catches `Infinity` — whose fields are
    // all perfectly FINITE and therefore invisible to a finiteness check alone.
    for (const cannon of ALL_CANNONS) {
      for (const timerMs of NON_FINITE) {
        const result = classify(() =>
          resolveShot({
            cannon: withTimer(cannon, timerMs),
            correct: true,
            elapsedMs: 0,
            rng: createRng(12),
          }),
        );
        expect(result.threw).toBe(true);
        expect(result.error).toBe('RangeError');
      }
    }
  });

  // spec(T-008:AC-20)
  it('guards the exported predicates identically — all three entry points agree', () => {
    // "the exported `answerQuality` and `isPerfectShot` guard identically". Swept as the full
    // CROSS-PRODUCT of both parameters (L-017) rather than a list of cases: whenever EITHER
    // argument is non-finite, all three entry points must reach the same verdict. Today they do
    // not — at `timerMs = -Infinity`, `resolveShot` throws while `answerQuality` returns 1.
    const elapsedAxis = [0, 5_000, ...NON_FINITE];
    const timerAxis = [20_000, ...NON_FINITE];
    let combinations = 0;

    for (const cannon of ALL_CANNONS) {
      for (const elapsedMs of elapsedAxis) {
        for (const timerMs of timerAxis) {
          const anyNonFinite = !Number.isFinite(elapsedMs) || !Number.isFinite(timerMs);
          if (!anyNonFinite) continue;
          combinations += 1;

          const quality = classify(() => answerQuality(true, elapsedMs, timerMs));
          const perfect = classify(() => isPerfectShot(true, elapsedMs, timerMs));
          const shot = classify(() =>
            resolveShot({
              cannon: withTimer(cannon, timerMs),
              correct: true,
              elapsedMs,
              rng: createRng(12),
            }),
          );

          expect(quality.threw).toBe(true);
          expect(perfect.threw).toBe(true);
          expect(shot.threw).toBe(true);
          expect([quality.error, perfect.error, shot.error]).toEqual([
            'RangeError',
            'RangeError',
            'RangeError',
          ]);
        }
      }
    }
    // L-017: a sweep that silently swept nothing is no evidence at all. 5 elapsed values x 4
    // timers = 20 pairs, minus the 2 x 1 = 2 pairs where both are finite, leaves 18 per cannon.
    expect(elapsedAxis.length * timerAxis.length).toBe(20);
    expect(combinations).toBe(ALL_CANNONS.length * 18);
  });

  // spec(T-008:AC-20)
  it('still accepts every finite positive timer — the guard rejects the class, not the axis', () => {
    // L-009: `-Infinity` already threw from `resolveShot` before this criterion existed, so
    // without a complement the whole AC could be "satisfied" by rejecting every timer outright.
    // Finite positive timers off the catalog are included so the guard cannot degenerate into an
    // allowlist of today's four values.
    for (const timerMs of [1, 500, 12_000, 20_000, 60_000, Number.MAX_SAFE_INTEGER]) {
      const cannon = withTimer(SWIVEL, timerMs);
      expect(() => resolveShot({ cannon, correct: true, elapsedMs: 0, rng: createRng(12) })).not.toThrow();
      expect(answerQuality(true, 0, timerMs)).toBe(1);
      expect(answerQuality(true, timerMs, timerMs)).toBe(ANSWER_QUALITY_FLOOR);
      expect(isPerfectShot(true, 0, timerMs)).toBe(true);
      expect(isPerfectShot(true, timerMs, timerMs)).toBe(false);
    }
    // …and every real catalog timer still works across the whole quality axis.
    for (const cannon of ALL_CANNONS) {
      for (const elapsedMs of elapsedDimension(cannon.timerMs)) {
        expect(() => resolveShot({ cannon, correct: true, elapsedMs, rng: createRng(12) })).not.toThrow();
        expect(Number.isFinite(answerQuality(true, elapsedMs, cannon.timerMs))).toBe(true);
      }
    }
  });
});
