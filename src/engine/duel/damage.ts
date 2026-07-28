/**
 * The damage model — "answer speed aims the shot" rendered as arithmetic.
 *
 * Math fluency shapes the QUALITY of an action, never permission to act: a correct answer always
 * fires, how fast it came biases the roll upward, and a slow-but-correct answer from a five-year-old
 * still lands a respectable volley. That last clause is the pedagogical guarantee stated in
 * ARCHITECTURE.md:206, and it is `ANSWER_QUALITY_FLOOR` binding the roll's LOWER BOUND — not merely
 * the quality input. A formulation that floors only `quality` and blends it with the uniform draw
 * lets the draw collapse a correct answer back onto `damageMin`; T-008 AC-15 is the frozen proof
 * that this module does not do that.
 *
 * Pure and seeded (ARCHITECTURE.md §4.1): `elapsedMs` is a parameter and never measured here, the
 * only nondeterminism is the threaded `Rng`, and every feel-number comes from `@engine/tuning`.
 *
 * A Perfect Shot is `+PERFECT_SHOT_BONUS_DAMAGE` damage, NOT an extra projectile.
 * `BASE_BALLS_PER_VOLLEY` is a PRESENTATION constant describing how a volley renders as cannonball
 * arcs; damage does not subdivide across balls, so no damage computation below reads it. It is used
 * for `ballCount` and nothing else. (ARCHITECTURE.md §4.3 still says "+1 bonus ball"; that wording
 * is being corrected by T-031.)
 */
import type { Cannon } from '@content/schemas';
import { nextFloat, type Rng } from '@engine/rng';
import {
  ANSWER_QUALITY_FLOOR,
  BASE_BALLS_PER_VOLLEY,
  PERFECT_SHOT_BONUS_DAMAGE,
  PERFECT_SHOT_TIMER_FRACTION,
  QUALITY_WEIGHT,
} from '@engine/tuning';

/** The resolved result of one volley. A plain serialisable value — it becomes part of `DuelState`. */
export interface ShotOutcome {
  readonly kind: 'volley' | 'misfire';
  readonly answerQuality: number; // [0,1]
  readonly rollDamage: number; // within [cannon.damageMin, cannon.damageMax]
  readonly bonusDamage: number; // PERFECT_SHOT_BONUS_DAMAGE or 0
  readonly damageToEnemy: number; // rollDamage + bonusDamage, or 0 on a misfire
  readonly damageToSelf: number; // volatile recoil, else 0
  readonly ballCount: number; // BASE_BALLS_PER_VOLLEY (+1 on a perfect shot), 0 on a misfire
  readonly perfectShot: boolean;
}

/** The arguments to `resolveShot`. */
interface ResolveShotInput {
  readonly cannon: Cannon;
  readonly correct: boolean;
  readonly elapsedMs: number;
  readonly rng: Rng;
}

/**
 * Rejects any timing argument that is not a usable duration. Shared by all three exported entry
 * points so they cannot disagree about what a legal input is.
 *
 * Both axes have the same hole, and a sign check does not close it: `NaN < 0` and `NaN <= 0` are
 * both `false`, so a `NaN` sails past a bounds-only guard and propagates into `rollDamage` — a
 * `NaN` hull in the duel reducer is a fight that never ends and throws nothing to trace.
 * `Infinity` is worse than `NaN` rather than better: `1 - elapsedMs / Infinity` is `1`, so an
 * impossible timer would report maximum quality, a maximum roll and a Perfect Shot all at once,
 * with every output field perfectly finite and therefore invisible to any finiteness check made
 * on the OUTPUT. Both are rejected here, on the input.
 *
 * This rejects a CLASS, not an axis: every finite positive timer is accepted, on or off the
 * catalog's four values, as is every finite `elapsedMs >= 0` including overruns past the timer.
 */
function requireUsableTiming(elapsedMs: number, timerMs: number): void {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError(`damage: elapsedMs must be a finite duration >= 0 (got ${elapsedMs})`);
  }
  if (!Number.isFinite(timerMs) || timerMs <= 0) {
    throw new RangeError(`damage: timerMs must be a finite duration > 0 (got ${timerMs})`);
  }
}

/**
 * How well the answer came in, in `[ANSWER_QUALITY_FLOOR, 1]` for a correct answer and exactly `0`
 * for a wrong one. Reaches the floor at 65 % of the timer and stays there, so overrunning the timer
 * with a correct answer is never worse than answering at the last tick.
 */
export function answerQuality(correct: boolean, elapsedMs: number, timerMs: number): number {
  // Guarded BEFORE the wrong-answer short-circuit. The ticket leaves that ordering open, but
  // validating first is the reading under which all three entry points agree on every input,
  // rather than only on the inputs that happen to reach the arithmetic.
  requireUsableTiming(elapsedMs, timerMs);
  if (!correct) {
    return 0;
  }
  const remaining = 1 - elapsedMs / timerMs;
  const clamped = Math.min(1, Math.max(0, remaining));
  return Math.max(ANSWER_QUALITY_FLOOR, clamped);
}

/**
 * Whether the answer landed inside the Perfect Shot window. The comparison is strict `<`, so
 * `elapsedMs` exactly at `PERFECT_SHOT_TIMER_FRACTION * timerMs` is NOT a perfect shot.
 */
export function isPerfectShot(correct: boolean, elapsedMs: number, timerMs: number): boolean {
  requireUsableTiming(elapsedMs, timerMs);
  return correct && elapsedMs < PERFECT_SHOT_TIMER_FRACTION * timerMs;
}

/**
 * Resolves one volley, returning the outcome and the advanced `Rng`.
 *
 * The PRNG advances exactly once per shot regardless of correctness — a misfire still draws and
 * discards — so a duel's stream stays aligned with its action log for replay.
 */
export function resolveShot(input: ResolveShotInput): readonly [ShotOutcome, Rng] {
  const { cannon, correct, elapsedMs, rng } = input;

  requireUsableTiming(elapsedMs, cannon.timerMs);

  // Drawn before the correctness branch so both paths consume exactly one step of the stream.
  const [u, nextRng] = nextFloat(rng);

  if (!correct) {
    // Only a volatile gun bites back. The gate is TEMPERAMENT, not a non-zero `recoilDamage`:
    // every non-volatile gun in today's catalog happens to carry `recoilDamage: 0`, so reading
    // the field ungated would be indistinguishable against catalog data alone — and wrong the
    // moment a `standard` gun is authored with recoil (which the T-003 schema permits).
    const damageToSelf = cannon.temperament === 'volatile' ? cannon.recoilDamage : 0;
    return [
      {
        kind: 'misfire',
        answerQuality: 0,
        rollDamage: 0,
        bonusDamage: 0,
        damageToEnemy: 0,
        damageToSelf,
        ballCount: 0,
        perfectShot: false,
      },
      nextRng,
    ];
  }

  const quality = answerQuality(true, elapsedMs, cannon.timerMs);
  const range = cannon.damageMax - cannon.damageMin;

  // The floor is applied HERE, to the roll's lower bound, which is what makes it a guarantee about
  // the OUTCOME rather than about an intermediate. Genuine spread survives above that bound.
  //
  // Where speed actually pays, stated exactly because this is the module's most load-bearing line
  // and its previous description was wrong. `max(quality * QUALITY_WEIGHT, ANSWER_QUALITY_FLOOR)`
  // means quality moves the bound only once it rises above the crossover
  // `ANSWER_QUALITY_FLOOR / QUALITY_WEIGHT` (0.5 at the shipped constants); at or below that the
  // floor already dominates and answering faster buys literally nothing. `ceil` then freezes the
  // INTEGER bound earlier still, so the flat region is wider than the raw crossover implies.
  // Measured against this module at 1 ms resolution (AC-18): the slow 71 % of the answer window is
  // completely flat on the Swivel Gun — the gun a five-year-old actually holds — and likewise on
  // the Six-Pounder, Chain Shot and Nine-Pounder; 51-60 % on the wider guns. Speed aims the shot
  // only across the fast remainder.
  //
  // `answerQuality` keeps moving across that flat region even though damage does not, so a UI
  // meter driven off that field over-reports progress. AC-18 pins both halves so nobody quietly
  // "fixes" one to match the other — which side should move is a design decision, not a defect.
  const lowerRaw = cannon.damageMin + Math.max(quality * QUALITY_WEIGHT, ANSWER_QUALITY_FLOOR) * range;
  // The `min` binds only when `QUALITY_WEIGHT > 1`: for `w <= 1`, `lowerRaw <= damageMax`, and
  // `damageMax` is an integer, so `ceil` cannot carry it past. That is an argument, so it carries
  // its measurement (L-015) — AC-19 is the committed probe, and it checks both halves: the clamp
  // is inert across the whole input surface at today's weight, and re-importing this module with
  // `QUALITY_WEIGHT = 1.001` puts the unclamped bound at `damageMax + 1`, outside the cannon.
  // That weight is a live dev-screen slider, so `w > 1` is reachable config rather than a
  // hypothetical, and the clamp stays.
  const lower = Math.min(Math.ceil(lowerRaw), cannon.damageMax);
  const rollDamage = lower + Math.round(u * (cannon.damageMax - lower));

  const perfect = isPerfectShot(true, elapsedMs, cannon.timerMs);
  const bonusDamage = perfect ? PERFECT_SHOT_BONUS_DAMAGE : 0;

  return [
    {
      kind: 'volley',
      answerQuality: quality,
      rollDamage,
      bonusDamage,
      damageToEnemy: rollDamage + bonusDamage,
      damageToSelf: 0,
      ballCount: perfect ? BASE_BALLS_PER_VOLLEY + 1 : BASE_BALLS_PER_VOLLEY,
      perfectShot: perfect,
    },
    nextRng,
  ];
}
