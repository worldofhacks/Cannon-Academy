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
 * How well the answer came in, in `[ANSWER_QUALITY_FLOOR, 1]` for a correct answer and exactly `0`
 * for a wrong one. Reaches the floor at 65 % of the timer and stays there, so overrunning the timer
 * with a correct answer is never worse than answering at the last tick.
 */
export function answerQuality(correct: boolean, elapsedMs: number, timerMs: number): number {
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

  if (elapsedMs < 0) {
    throw new RangeError(`resolveShot: elapsedMs must not be negative (got ${elapsedMs})`);
  }
  if (cannon.timerMs <= 0) {
    throw new RangeError(`resolveShot: cannon.timerMs must be greater than 0 (got ${cannon.timerMs})`);
  }

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
  // the outcome rather than about an intermediate. Quality above the floor lifts the bound further,
  // so speed shifts the whole distribution upward while genuine spread survives at every quality.
  const lowerRaw = cannon.damageMin + Math.max(quality * QUALITY_WEIGHT, ANSWER_QUALITY_FLOOR) * range;
  // The `min` binds only if `QUALITY_WEIGHT > 1` — for `w <= 1`, `lowerRaw <= damageMax` and
  // `damageMax` is an integer, so `ceil` cannot pass it. `QUALITY_WEIGHT` is a live dev-screen
  // slider, so the clamp stays rather than resting on today's value.
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
