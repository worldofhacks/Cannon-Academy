import { fileURLToPath } from 'node:url';
import { dirname, join, sep } from 'node:path';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as tuningNamespace from '@engine/tuning';
import {
  ANSWER_QUALITY_FLOOR,
  BASE_BALLS_PER_VOLLEY,
  BOT_ACCURACY_BAND_BY_GRADE,
  BOT_ACCURACY_WINDOW,
  BOT_MERCY_MARGIN,
  CHEST_COIN_RANGE_BY_RARITY,
  CHEST_RARITY_WEIGHTS,
  CHOICE_COUNT,
  COINS_LOSS_BASE,
  COINS_PER_ACCURACY_PERCENT,
  COINS_PER_PERFECT_SHOT,
  COINS_WIN_BASE,
  HARBOR_CHEST_PRICE,
  DISTRACTOR_ABS_FLOOR,
  DISTRACTOR_MAX_RATIO,
  DOUBLE_SHOT_TIMER_FACTOR,
  DOUBLE_SHOT_VOLLEY_COUNT,
  ENEMY_HULL_BY_ISLAND,
  MASTERY_METER_MAX,
  MASTERY_MIN_ACCURACY,
  MASTERY_RATE_DUEL,
  MASTERY_RATE_RANGE,
  MASTERY_THRESHOLD_CORRECT,
  MAX_DISTRACTOR_ATTEMPTS,
  MAX_PARAM_SAMPLE_ATTEMPTS,
  MERCY_FORCED_MISFIRES,
  MERCY_LOSS_STREAK_TRIGGER,
  ONBOARDING_ENEMY_HULL,
  PERFECT_SHOT_BONUS_DAMAGE,
  PERFECT_SHOT_TIMER_FRACTION,
  PLAYER_HULL,
  QUALITY_WEIGHT,
  RECENT_TEMPLATE_WINDOW,
} from '@engine/tuning';
import {
  CHEST_RARITIES,
  GRADE_BANDS,
  ISLAND_IDS,
  type ChestRarity,
  type GradeBand,
  type IslandId,
} from '@content/schemas';
import { createRng, weightedPick } from '@engine/rng';

// T-004 — Central tuning constants. Every feel-number in the game lives in `@engine/tuning`
// (ARCHITECTURE.md §4.3 / §8: "All tuning constants live in one file"; §0 + §12: the hidden
// dev slider screen reads exactly this module).
//
// ---------------------------------------------------------------------------------------
// HOW THIS SUITE IS BUILT — read before editing.
// ---------------------------------------------------------------------------------------
// A file of constants is the easiest place in the project to write criteria that LOOK
// rigorous and are satisfied by a value that breaks the game two waves later. Four wave-1
// lessons drove the shape of every assertion below:
//
//   L-005 — a constant's permitted RANGE is itself a contract. For every bound this ticket
//           pins, the tests below ask what the *worst legal value* does to a named downstream
//           consumer, and assert the property that consumer needs rather than only the bound.
//           Six such derivations are marked `[L-005 derived]`; each one cites the exact
//           downstream AC it is protecting. Where a derived bound is STRICTLY TIGHTER than
//           this ticket's literal AC text, the comment says so explicitly and the orchestrator
//           report flags it — the intersection is always non-empty, so no legal value is lost.
//   L-006 — direction is not magnitude. `QUALITY_WEIGHT` is bounded by AC-3 only as
//           `0 < w <= 1`; `w = 0.001` satisfies that while deleting the game's entire
//           pedagogical premise. AC-3's effect-size test below asserts a magnitude.
//   L-012 — an aggregate certifies a projection, not the mechanism. "All hulls increase" is
//           asserted pairwise, never as `first < last`; "weights sum to 1 and decrease" is
//           backed by a reachability draw against the real PRNG, because
//           `{1 - 3e-9, 2e-9, 1e-9}` satisfies the aggregate and makes two chest tiers
//           unreachable.
//   L-017 — cover dimensions, not cases. Every entry of every record, every boundary of every
//           range, and the relationships *between* entries are asserted — not a sample. AC-10
//           walks the module namespace so a missing export cannot make a "for every numeric
//           export" assertion pass vacuously.
//
// SAME-WAVE IMPORT RULE (ticket Planning Decisions, `proposed`): this suite must not import
// `@content` catalog JSON. T-006 owns `cannons.json` / `islands.json` and is a same-wave
// sibling whose files do not exist in this worktree. Every catalog-derived number below is
// therefore a hardcoded literal with its PLAN.md citation. The id UNIONS are a different
// matter — `src/content/schemas.ts` (T-003) exists on this branch, so `ISLAND_IDS`,
// `CHEST_RARITIES` and `GRADE_BANDS` are imported and the type system proves exhaustiveness.

// ---------------------------------------------------------------------------------------
// Catalog literals, hardcoded per the same-wave rule above.
// ---------------------------------------------------------------------------------------

/** Island `order` ascending. Ticket AC-2 states this sequence verbatim. */
const ISLAND_ORDER = [
  'port_sumwich',
  'isla_products',
  'quotient_cove',
  'fraction_reef',
  'grandline',
] as const satisfies readonly IslandId[];

/** Swivel Gun damage range — PLAN.md §The armory: "Swivel Gun … 8–12 … Reliable … 20s". */
const SWIVEL_DAMAGE_MIN = 8;
const SWIVEL_DAMAGE_MAX = 12;

/**
 * Every cannon in PLAN.md §The armory whose `damageMax - damageMin >= 10`. This is exactly
 * the set T-008 AC-16 (the effect-size floor on `QUALITY_WEIGHT`) is scoped to.
 */
const WIDE_RANGE_CANNONS = [
  { id: 'culverin', damageMin: 4, damageMax: 16 },
  { id: 'twelve_pounder', damageMin: 14, damageMax: 24 },
  { id: 'mortar', damageMin: 14, damageMax: 24 },
  { id: 'double_broadside', damageMin: 16, damageMax: 28 },
  { id: 'powder_keg', damageMin: 20, damageMax: 34 },
  { id: 'long_nine', damageMin: 24, damageMax: 40 },
] as const;

/** Every distinct `timerMs` in PLAN.md §The armory: 20s, 15s, 12s, 18s. */
const CANNON_TIMERS_MS = [12_000, 15_000, 18_000, 20_000] as const;

/** PLAN.md day 3: "≥8 templates/skill floor". Cited by ticket AC-4. */
const TEMPLATES_PER_SKILL_FLOOR = 8;

// ---------------------------------------------------------------------------------------
// Downstream formulas, transcribed from the tickets that own them. These are NOT imported —
// the owning modules do not exist yet — so each is a literal transcription with a citation.
// They exist so this suite can assert the PROPERTY a bound protects instead of the bound.
// ---------------------------------------------------------------------------------------

/**
 * T-008 Context, "Formula — implement exactly this": the roll's integer lower bound.
 *   lowerRaw = damageMin + max(quality * QUALITY_WEIGHT, ANSWER_QUALITY_FLOOR) * range
 *   lower    = min(ceil(lowerRaw), damageMax)
 */
function rollLowerBound(damageMin: number, damageMax: number, quality: number): number {
  const range = damageMax - damageMin;
  const lowerRaw = damageMin + Math.max(quality * QUALITY_WEIGHT, ANSWER_QUALITY_FLOOR) * range;
  return Math.min(Math.ceil(lowerRaw), damageMax);
}

/**
 * Expected `rollDamage` for a given quality.
 *
 * T-008's roll is `lower + round(u * (damageMax - lower))` with `u = nextFloat(rng)` uniform on
 * `[0, 1)`. For `N = damageMax - lower`, `round(u * N)` takes value `k` with probability `1/N`
 * for `k = 1 … N-1` and `0.5/N` for `k = 0` and `k = N`, so its mean is exactly `N / 2`.
 * The expectation is therefore closed-form and this helper needs no sampling.
 */
function meanRollDamage(damageMin: number, damageMax: number, quality: number): number {
  const lower = rollLowerBound(damageMin, damageMax, quality);
  return (lower + damageMax) / 2;
}

/**
 * T-005 Context, "Plausibility rule (the operational definition of 'plausibly typed')".
 * Transcribed verbatim; `DISTRACTOR_ABS_FLOOR` / `DISTRACTOR_MAX_RATIO` come from the module
 * under test, so this helper measures what the frozen constants actually permit.
 */
function isPlausibleDistractor(candidate: number, answer: number): boolean {
  if (!Number.isFinite(candidate)) return false;
  if (Number.isInteger(candidate) !== Number.isInteger(answer)) return false;
  if (answer >= 0 && candidate < 0) return false;
  if (Math.abs(candidate - answer) <= DISTRACTOR_ABS_FLOOR) return true;
  return (
    Math.abs(candidate) <= Math.abs(answer) * DISTRACTOR_MAX_RATIO &&
    Math.abs(candidate) >= Math.abs(answer) / DISTRACTOR_MAX_RATIO
  );
}

/**
 * T-005 Context, "Near-miss fill ladder … exactly 9 rungs":
 * `x+1, x-1, x+2, x-2, x+10, x-10, x*2, x+3, x-3`.
 */
function nearMissLadder(answer: number): readonly number[] {
  return [
    answer + 1,
    answer - 1,
    answer + 2,
    answer - 2,
    answer + 10,
    answer - 10,
    answer * 2,
    answer + 3,
    answer - 3,
  ];
}

/**
 * Walk the ladder in order, taking the first distinct, non-colliding, plausible values, and
 * stop after `MAX_DISTRACTOR_ATTEMPTS` rungs. Returns what T-005's fill can actually produce
 * under the frozen constants.
 */
function fillFromLadder(answer: number, need: number): readonly number[] {
  const ladder = nearMissLadder(answer);
  const reachable = Math.min(ladder.length, MAX_DISTRACTOR_ATTEMPTS);
  const filled: number[] = [];
  for (let i = 0; i < reachable && filled.length < need; i += 1) {
    const candidate = ladder[i];
    if (candidate === undefined) continue;
    if (candidate === answer) continue;
    if (filled.includes(candidate)) continue;
    if (!isPlausibleDistractor(candidate, answer)) continue;
    filled.push(candidate);
  }
  return filled;
}

// ---------------------------------------------------------------------------------------
// Export surface (ticket Context, "Required export surface"). Used by AC-10 so its
// "every numeric export" sweep cannot pass vacuously against a module that exports nothing.
// ---------------------------------------------------------------------------------------

const REQUIRED_EXPORTS = [
  // Duel
  'PLAYER_HULL',
  'ENEMY_HULL_BY_ISLAND',
  'ONBOARDING_ENEMY_HULL',
  // Damage
  'ANSWER_QUALITY_FLOOR',
  'PERFECT_SHOT_TIMER_FRACTION',
  'QUALITY_WEIGHT',
  'BASE_BALLS_PER_VOLLEY',
  'PERFECT_SHOT_BONUS_DAMAGE',
  // Double-Shot
  'DOUBLE_SHOT_TIMER_FACTOR',
  'DOUBLE_SHOT_VOLLEY_COUNT',
  // Questions
  'MAX_PARAM_SAMPLE_ATTEMPTS',
  'RECENT_TEMPLATE_WINDOW',
  'CHOICE_COUNT',
  'DISTRACTOR_MAX_RATIO',
  'DISTRACTOR_ABS_FLOOR',
  'MAX_DISTRACTOR_ATTEMPTS',
  // Mastery
  'MASTERY_THRESHOLD_CORRECT',
  'MASTERY_MIN_ACCURACY',
  'MASTERY_RATE_RANGE',
  'MASTERY_RATE_DUEL',
  'MASTERY_METER_MAX',
  // Economy
  'COINS_WIN_BASE',
  'COINS_LOSS_BASE',
  'COINS_PER_ACCURACY_PERCENT',
  'COINS_PER_PERFECT_SHOT',
  'HARBOR_CHEST_PRICE',
  'CHEST_RARITY_WEIGHTS',
  'CHEST_COIN_RANGE_BY_RARITY',
  // Opponents
  'BOT_ACCURACY_WINDOW',
  'BOT_MERCY_MARGIN',
  'BOT_ACCURACY_BAND_BY_GRADE',
  'MERCY_LOSS_STREAK_TRIGGER',
  'MERCY_FORCED_MISFIRES',
] as const;

/**
 * Every constant the ticket documents as an integer. AC-10's `Number.isInteger` clause is
 * meaningless without this list written out — an implementation is free to make the others
 * fractional, so a blanket integer sweep would be wrong and a blanket non-sweep vacuous.
 */
const INTEGER_CONSTANTS = [
  'PLAYER_HULL',
  'ONBOARDING_ENEMY_HULL',
  'BASE_BALLS_PER_VOLLEY',
  'PERFECT_SHOT_BONUS_DAMAGE',
  'DOUBLE_SHOT_VOLLEY_COUNT',
  'MAX_PARAM_SAMPLE_ATTEMPTS',
  'RECENT_TEMPLATE_WINDOW',
  'CHOICE_COUNT',
  'DISTRACTOR_ABS_FLOOR',
  'MAX_DISTRACTOR_ATTEMPTS',
  'MASTERY_THRESHOLD_CORRECT',
  'MASTERY_METER_MAX',
  'BOT_ACCURACY_WINDOW',
  'MERCY_LOSS_STREAK_TRIGGER',
  'MERCY_FORCED_MISFIRES',
  'HARBOR_CHEST_PRICE',
] as const;

/** Collect every finite-number leaf reachable from the module namespace, with its path. */
function numericLeaves(value: unknown, path: string, into: { path: string; value: number }[]): void {
  if (typeof value === 'number') {
    into.push({ path, value });
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      numericLeaves(child, `${path}.${key}`, into);
    }
  }
}

// =======================================================================================
describe('T-004 tuning — documented constants', () => {
  // spec(T-004:AC-1)
  it('pins every value the design documents fix exactly', () => {
    // ARCHITECTURE.md §4.3 / PLAN.md §The duel loop. This test is the tripwire against a
    // "helpful" retune of a pedagogically load-bearing number, so each is asserted
    // individually rather than as one deep-equal blob — a deep-equal failure names the
    // object, an individual failure names the constant.
    expect(PLAYER_HULL).toBe(100);
    expect(ANSWER_QUALITY_FLOOR).toBe(0.35);
    expect(PERFECT_SHOT_TIMER_FRACTION).toBe(0.4);
    expect(MAX_PARAM_SAMPLE_ATTEMPTS).toBe(100);
    expect(CHOICE_COUNT).toBe(4);
    expect(MASTERY_THRESHOLD_CORRECT).toBe(10);
    expect(MASTERY_MIN_ACCURACY).toBe(0.7);
    expect(MASTERY_RATE_RANGE).toBe(1);
    // RE-BASELINED 2026-08-02 (A-062): 0.5 → 1 by the owner's 2026-07-30 ruling, recorded on
    // MASTERY_RATE_DUEL in `src/engine/tuning.ts` — PLAN.md's half-rate clause is void. The
    // tripwire's job is unchanged: this pins the RULED value against a drive-by retune.
    expect(MASTERY_RATE_DUEL).toBe(1);
    expect(MASTERY_METER_MAX).toBe(100);
    expect(MERCY_LOSS_STREAK_TRIGGER).toBe(2);
    expect(MERCY_FORCED_MISFIRES).toBe(2);
  });

  // spec(T-004:AC-1)
  it('keeps duel and range answers worth exactly the same, and the meter reachable', () => {
    // RE-BASELINED 2026-08-02 (A-062) against the owner's 2026-07-30 MASTERY_RATE_DUEL 0.5 → 1
    // change, recorded on the constant in `src/engine/tuning.ts`: the original intent ("range
    // worth twice a duel answer", PLAN.md §Sea chart) is VOID rather than nudged — the range's
    // edge is now its own economics (~10 questions back to back), not a discount on the duel.
    // What this test still owns is the RELATIONSHIP arithmetic: the four mastery constants are
    // only meaningful together, and pinning the numbers without their relationships would let a
    // future edit keep every value "documented" while making the meter unreachable.
    expect(MASTERY_RATE_RANGE).toBe(MASTERY_RATE_DUEL);
    expect(MASTERY_RATE_DUEL).toBeGreaterThan(0);
    const rangeAnswersToMastery = MASTERY_THRESHOLD_CORRECT / MASTERY_RATE_RANGE;
    const duelAnswersToMastery = MASTERY_THRESHOLD_CORRECT / MASTERY_RATE_DUEL;
    expect(duelAnswersToMastery).toBe(rangeAnswersToMastery);
    expect(rangeAnswersToMastery).toBe(10);
    // A full meter must land exactly on MASTERY_METER_MAX, not overshoot or undershoot it.
    expect(
      Math.round((100 * (MASTERY_THRESHOLD_CORRECT * MASTERY_RATE_RANGE)) / MASTERY_THRESHOLD_CORRECT),
    ).toBe(MASTERY_METER_MAX);
    // PLAN.md: "10 correct at ≥70% accuracy" — accuracy is a fraction, not a percentage.
    expect(MASTERY_MIN_ACCURACY).toBeGreaterThan(0);
    expect(MASTERY_MIN_ACCURACY).toBeLessThan(1);
  });
});

// =======================================================================================
describe('T-004 tuning — enemy hull by island', () => {
  // spec(T-004:AC-2)
  it('has exactly one entry per IslandId, typed against T-003 union', () => {
    // Type-level exhaustiveness: if `ENEMY_HULL_BY_ISLAND` is not keyed by `IslandId`, or an
    // island is missing, this line fails `tsc` — the DoD requirement that adding an island is
    // a type error until its hull is supplied. Runtime checks below cover the reverse
    // direction (an EXTRA key, which a wider record type would happily allow).
    const typed: Record<IslandId, number> = ENEMY_HULL_BY_ISLAND;
    expect(Object.keys(typed).sort()).toEqual([...ISLAND_IDS].sort());
    expect(Object.keys(typed)).toHaveLength(5);
  });

  // spec(T-004:AC-2)
  it('keeps the hardcoded island order in sync with T-003 ISLAND_IDS', () => {
    // The same-wave rule forces AC-2's island order to be a literal here. This assertion is
    // what stops that literal silently drifting from the real union: if T-003 ever gains,
    // loses or renames an island, this fails instead of the ordering test quietly checking
    // four of six islands.
    expect([...ISLAND_ORDER].sort()).toEqual([...ISLAND_IDS].sort());
    expect(ISLAND_ORDER).toHaveLength(ISLAND_IDS.length);
  });

  // spec(T-004:AC-2)
  it('gives every island a positive integer hull', () => {
    // Every entry, not a sample (L-017).
    for (const island of ISLAND_IDS) {
      const hull = ENEMY_HULL_BY_ISLAND[island];
      expect(Number.isFinite(hull), `${island} hull must be finite`).toBe(true);
      expect(Number.isInteger(hull), `${island} hull must be an integer`).toBe(true);
      expect(hull, `${island} hull must be positive`).toBeGreaterThan(0);
    }
  });

  // spec(T-004:AC-2)
  it('puts the first island in [40, 50] at BOTH ends of the range', () => {
    // PLAN.md §The duel loop: "first pirate sloops carry 40–50 hull against your 100".
    // Both ends are inclusive per AC-2, so assert the closed interval, not `> 40 && < 50`.
    expect(ENEMY_HULL_BY_ISLAND.port_sumwich).toBeGreaterThanOrEqual(40);
    expect(ENEMY_HULL_BY_ISLAND.port_sumwich).toBeLessThanOrEqual(50);
  });

  // spec(T-004:AC-2)
  it('increases strictly at every adjacent island pair', () => {
    // L-012: `first < last` is satisfied by a sequence that dips in the middle. Assert every
    // adjacent pair, and name the pair in the failure message.
    for (let i = 1; i < ISLAND_ORDER.length; i += 1) {
      const previousId = ISLAND_ORDER[i - 1] as IslandId;
      const currentId = ISLAND_ORDER[i] as IslandId;
      expect(
        ENEMY_HULL_BY_ISLAND[currentId],
        `${currentId} hull must exceed ${previousId} hull`,
      ).toBeGreaterThan(ENEMY_HULL_BY_ISLAND[previousId]);
    }
  });

  // spec(T-004:AC-2)
  it('never lets an enemy sloop out-hull the player at the first island', () => {
    // PLAN.md: "enemy hulls are tuned per island … so the very first duel never drags",
    // against the player's 100. The relationship the [40,50] band exists to guarantee.
    expect(ENEMY_HULL_BY_ISLAND.port_sumwich).toBeLessThan(PLAYER_HULL);
  });
});

// =======================================================================================
describe('T-004 tuning — damage constants', () => {
  // spec(T-004:AC-3)
  it('bounds QUALITY_WEIGHT at both ends of its permitted range', () => {
    expect(Number.isFinite(QUALITY_WEIGHT)).toBe(true);
    expect(QUALITY_WEIGHT).toBeGreaterThan(0);
    expect(QUALITY_WEIGHT).toBeLessThanOrEqual(1);
  });

  // spec(T-031:AC-6) / spec(T-031:AC-7) — measured effect-size floor (ceil-aware), value unchanged
  it('spec(T-031:AC-6) keeps QUALITY_WEIGHT strictly above the measured 0.6 floor (not the unsound 7/12)', () => {
    // The closed-form >7/12 omitted ceil in lower = min(ceil(lowerRaw), damageMax); measured
    // against T-008 AC-16 the real threshold is W > 0.6. Shipped value stays 0.7 (AC-7).
    expect(QUALITY_WEIGHT).toBeGreaterThan(0.6);
    expect(QUALITY_WEIGHT).toBe(0.7);
  });

  // spec(T-031:AC-3)
  it('spec(T-031:AC-3) leaves PERFECT_SHOT_BONUS_DAMAGE at 1 — semantics fix, not a retune', () => {
    expect(PERFECT_SHOT_BONUS_DAMAGE).toBe(1);
  });

  // spec(T-004:AC-3)
  it('makes answer speed a PERCEPTIBLE effect, not merely a positive one', () => {
    // [L-006] AC-3's `0 < w <= 1` is passed by `w = 0.001`, which makes "answer speed aims
    // the shot" — PLAN.md's entire differentiation pitch — statistically invisible. Direction
    // is not the requirement; effect size is.
    //
    // [L-005 derived] The magnitude is NOT invented here. T-008 AC-16 requires, for every
    // cannon with `damageMax - damageMin >= 10`, that the mean `rollDamage` at full quality
    // exceed the mean at the floor by at least `0.10 * range`. T-008's formula makes that
    // expectation closed-form (see `meanRollDamage`), so the worst legal `QUALITY_WEIGHT`
    // under AC-3 can be checked against T-008's frozen requirement directly rather than
    // through an invented threshold. Every cannon in the scope is checked, not a sample.
    for (const cannon of WIDE_RANGE_CANNONS) {
      const range = cannon.damageMax - cannon.damageMin;
      expect(range, `${cannon.id} must be in T-008 AC-16 scope`).toBeGreaterThanOrEqual(10);
      const atFullSpeed = meanRollDamage(cannon.damageMin, cannon.damageMax, 1);
      const atFloor = meanRollDamage(cannon.damageMin, cannon.damageMax, ANSWER_QUALITY_FLOOR);
      expect(
        atFullSpeed - atFloor,
        `${cannon.id}: QUALITY_WEIGHT=${QUALITY_WEIGHT} moves the mean roll by ` +
          `${atFullSpeed - atFloor}, under T-008 AC-16's floor of ${0.1 * range}`,
      ).toBeGreaterThanOrEqual(0.1 * range);
    }
  });

  // spec(T-004:AC-3)
  it('keeps the quality-raised lower bound inside the cannon range at every quality', () => {
    // [L-005] The worst legal `QUALITY_WEIGHT` is 1. T-008 AC-4 requires the roll to stay
    // inside `[damageMin, damageMax]`; sweeping quality across its whole domain (not a
    // representative value — L-017) proves no legal weight can push the lower bound out,
    // including the degenerate 4-wide Swivel range where `ceil` bites hardest.
    const cannons = [
      { id: 'swivel_gun', damageMin: SWIVEL_DAMAGE_MIN, damageMax: SWIVEL_DAMAGE_MAX },
      ...WIDE_RANGE_CANNONS,
    ];
    for (const cannon of cannons) {
      for (let q = 0; q <= 1.0000001; q += 0.01) {
        const quality = Math.min(q, 1);
        const lower = rollLowerBound(cannon.damageMin, cannon.damageMax, quality);
        expect(lower, `${cannon.id} @ q=${quality}`).toBeGreaterThanOrEqual(cannon.damageMin);
        expect(lower, `${cannon.id} @ q=${quality}`).toBeLessThanOrEqual(cannon.damageMax);
      }
    }
  });

  // spec(T-004:AC-3)
  it('makes the roll lower bound non-decreasing in quality', () => {
    // The monotonicity T-008 AC-5 depends on holds for the frozen QUALITY_WEIGHT, at every
    // cannon, across the whole quality domain.
    for (const cannon of WIDE_RANGE_CANNONS) {
      let previous = rollLowerBound(cannon.damageMin, cannon.damageMax, 0);
      for (let q = 0.01; q <= 1.0000001; q += 0.01) {
        const current = rollLowerBound(cannon.damageMin, cannon.damageMax, Math.min(q, 1));
        expect(current, `${cannon.id} @ q=${q}`).toBeGreaterThanOrEqual(previous);
        previous = current;
      }
    }
  });

  // spec(T-004:AC-3)
  it('makes BASE_BALLS_PER_VOLLEY an integer of at least one', () => {
    expect(Number.isInteger(BASE_BALLS_PER_VOLLEY)).toBe(true);
    expect(BASE_BALLS_PER_VOLLEY).toBeGreaterThanOrEqual(1);
  });

  // spec(T-004:AC-3)
  it('makes PERFECT_SHOT_BONUS_DAMAGE an integer of at least one', () => {
    // ARCHITECTURE.md §4.3 (T-031): Perfect Shot is +1 damage. A bonus of 0 would make the
    // Perfect Shot a purely cosmetic event, which is the laziest value AC-3's `>= 1` excludes.
    expect(Number.isInteger(PERFECT_SHOT_BONUS_DAMAGE)).toBe(true);
    expect(PERFECT_SHOT_BONUS_DAMAGE).toBeGreaterThanOrEqual(1);
  });

  // spec(T-004:AC-3)
  it('leaves a real Perfect Shot window inside every cannon timer', () => {
    // [L-005] `PERFECT_SHOT_TIMER_FRACTION = 0.4` is exact (AC-1), but the property it exists
    // to guarantee is that the window is non-empty in integer milliseconds for every timer in
    // the catalog — T-008 AC-3 tests the boundary at exactly 40% and T-022 AC-9 repeats it
    // against the shortened Double-Shot timer.
    for (const timerMs of CANNON_TIMERS_MS) {
      expect(PERFECT_SHOT_TIMER_FRACTION * timerMs, `timer ${timerMs}`).toBeGreaterThanOrEqual(1);
      expect(PERFECT_SHOT_TIMER_FRACTION * timerMs, `timer ${timerMs}`).toBeLessThan(timerMs);
    }
  });
});

// =======================================================================================
describe('T-004 tuning — question generation windows', () => {
  // spec(T-004:AC-4)
  it('bounds RECENT_TEMPLATE_WINDOW at both ends of its permitted range', () => {
    expect(Number.isInteger(RECENT_TEMPLATE_WINDOW)).toBe(true);
    expect(RECENT_TEMPLATE_WINDOW).toBeGreaterThanOrEqual(1);
    expect(RECENT_TEMPLATE_WINDOW).toBeLessThanOrEqual(TEMPLATES_PER_SKILL_FLOOR);
  });

  // spec(T-004:AC-4)
  it('never lets the recency filter fully exclude a skill at the template floor', () => {
    // [L-005 derived — TIGHTER THAN AC-4'S LITERAL TEXT, flagged to the orchestrator]
    // AC-4 states the bound as `<= 8` and states its rationale as "it must stay BELOW the
    // ≥8-templates-per-skill floor so a skill's pool can never be fully excluded". Those two
    // clauses contradict each other at exactly 8: a skill sitting on the floor with exactly 8
    // templates has its ENTIRE pool excluded, T-007 step 1's fallback fires on every single
    // call, and the recency feature becomes a permanent no-op — the very outcome the bound
    // exists to prevent. T-007's own Planning Decisions restate the intent as "T-004's AC-4
    // already keeps RECENT_TEMPLATE_WINDOW below the per-skill template floor".
    //
    // The assertion below is the RATIONALE, which is the honest reading, and it intersects
    // AC-4's literal range in 1..7 — so no value that is legal under BOTH readings is lost.
    expect(RECENT_TEMPLATE_WINDOW).toBeLessThan(TEMPLATES_PER_SKILL_FLOOR);
    const poolAtFloor = TEMPLATES_PER_SKILL_FLOOR;
    expect(poolAtFloor - RECENT_TEMPLATE_WINDOW).toBeGreaterThanOrEqual(1);
  });

  // spec(T-004:AC-4)
  it('lets MAX_DISTRACTOR_ATTEMPTS reach every rung of the fixed 9-rung ladder', () => {
    expect(Number.isInteger(MAX_DISTRACTOR_ATTEMPTS)).toBe(true);
    expect(MAX_DISTRACTOR_ATTEMPTS).toBeGreaterThanOrEqual(9);
    // The bare `>= 9` is a number; this is the relationship it exists to guarantee. T-005's
    // ladder has exactly 9 fixed rungs and a smaller bound silently makes the later ones
    // unreachable, reintroducing the zero-answer starvation.
    expect(nearMissLadder(0)).toHaveLength(9);
    expect(MAX_DISTRACTOR_ATTEMPTS).toBeGreaterThanOrEqual(nearMissLadder(0).length);
  });

  // spec(T-004:AC-4)
  it('reaches the last rung the zero-answer case actually needs', () => {
    // [L-005 derived] T-005 AC-13: a legal `sub_within_20` draw with `a == b` yields answer 0
    // and MUST return three distinct plausible distractors rather than throwing
    // DISTRACTOR_FAILURE. At `x = 0` the only surviving ladder values are `{1, 2, 3}` and the
    // last of them (`x + 3`) sits at rung index 7. Assert the fill actually completes under
    // the FROZEN attempt budget, not that the budget is some number.
    const filled = fillFromLadder(0, CHOICE_COUNT - 1);
    expect(filled).toHaveLength(CHOICE_COUNT - 1);
  });
});

// =======================================================================================
describe('T-004 tuning — distractor plausibility', () => {
  // spec(T-004:AC-5)
  it('makes DISTRACTOR_MAX_RATIO a finite number strictly above 1', () => {
    expect(Number.isFinite(DISTRACTOR_MAX_RATIO)).toBe(true);
    expect(DISTRACTOR_MAX_RATIO).toBeGreaterThan(1);
  });

  // spec(T-004:AC-5)
  it('makes DISTRACTOR_ABS_FLOOR an integer of at least 3', () => {
    expect(Number.isInteger(DISTRACTOR_ABS_FLOOR)).toBe(true);
    expect(DISTRACTOR_ABS_FLOOR).toBeGreaterThanOrEqual(3);
  });

  // spec(T-004:AC-5)
  it('can build a full four-choice question for a ZERO answer', () => {
    // [L-005] This is the derivation AC-5's `>= 3` encodes, asserted as the property rather
    // than the number. At `x = 0` the magnitude-ratio branch collapses (`|x| * RATIO === 0`),
    // clause 3 removes every negative rung, and `x * 2` collides with the answer, so the
    // complete set the ladder can ever yield is `{1, 2, 3}`. A floor of 2 leaves two values
    // and the question is unbuildable — the failure would surface non-deterministically deep
    // inside T-014's 1,000-sample sweep, against a constant frozen two waves earlier.
    const filled = fillFromLadder(0, CHOICE_COUNT - 1);
    expect(filled).toHaveLength(CHOICE_COUNT - 1);
    expect(new Set(filled).size).toBe(CHOICE_COUNT - 1);
    expect(filled).not.toContain(0);
    for (const value of filled) {
      expect(value, `distractor ${value} must be plausible against 0`).toBeGreaterThan(0);
      expect(isPlausibleDistractor(value, 0)).toBe(true);
    }
    // T-005 AC-13 asserts the returned set is exactly {1, 2, 3} at a floor of 3; every legal
    // floor must at minimum make those three reachable, since they are all the ladder has.
    expect(isPlausibleDistractor(1, 0)).toBe(true);
    expect(isPlausibleDistractor(2, 0)).toBe(true);
    expect(isPlausibleDistractor(3, 0)).toBe(true);
  });

  // spec(T-004:AC-5)
  it('rejects every negative and the answer itself for a zero answer', () => {
    // The degenerate case, swept across the whole ladder rather than spot-checked (L-017).
    for (const rung of nearMissLadder(0)) {
      if (rung < 0) {
        expect(isPlausibleDistractor(rung, 0), `${rung} must be implausible against 0`).toBe(false);
      }
    }
    // `x + 10` is out of reach for a zero answer unless the floor is >= 10; a floor that large
    // would be legal under AC-5 but is not required, so this only checks consistency between
    // the frozen floor and the rule, not a specific floor.
    expect(isPlausibleDistractor(10, 0)).toBe(DISTRACTOR_ABS_FLOOR >= 10);
  });

  // spec(T-004:AC-5)
  it('still admits a same-magnitude declared distractor (T-005 AC-1)', () => {
    // [L-005 derived] The worst legal `DISTRACTOR_MAX_RATIO` at the LOW end is `1 + epsilon`.
    // T-005 AC-1 is frozen on `answerExpr "a + b"` with `{a: 3, b: 4}` returning exactly
    // `[8, 6, 12]` — so `12` must be plausible against the answer `7`. `|12 - 7| = 5`, so
    // either DISTRACTOR_ABS_FLOOR >= 5 or DISTRACTOR_MAX_RATIO >= 12/7. A ratio of 1.0001
    // with a floor of 3 satisfies AC-5's literal text and makes T-005 AC-1 impossible.
    expect(isPlausibleDistractor(12, 7), 'T-005 AC-1 requires 12 to be a valid decoy for 7').toBe(true);
    expect(isPlausibleDistractor(8, 7)).toBe(true);
    expect(isPlausibleDistractor(6, 7)).toBe(true);
  });

  // spec(T-004:AC-5)
  it('still rejects a wildly out-of-magnitude declared distractor (T-005 AC-5)', () => {
    // [L-005 derived] The worst legal `DISTRACTOR_MAX_RATIO` at the HIGH end is arbitrarily
    // large — AC-5 states no upper bound. T-005 AC-5 is frozen on `"a * b * 1000"` = 12000
    // against an answer of 7 being EXCLUDED as implausible. Any ratio >= 12000/7 ≈ 1714.3
    // satisfies AC-5's literal text and makes T-005 AC-5 impossible, turning "plausibly typed
    // (same magnitude/sign)" into a no-op and handing a K-5 player a free elimination.
    expect(isPlausibleDistractor(12000, 7), 'T-005 AC-5 requires 12000 to be rejected as a decoy for 7').toBe(
      false,
    );
    // Same shape at the other end of the magnitude dimension (L-017): a decoy far BELOW the
    // answer must also be rejected by the `|d| >= |x| / RATIO` clause.
    expect(isPlausibleDistractor(0, 700)).toBe(false);
  });

  // spec(T-004:AC-5)
  it('never admits a decoy of a different numeric type or a non-finite one', () => {
    // Clause 1 and clause 2 of the rule, over the value-domain dimension.
    expect(isPlausibleDistractor(Number.NaN, 7)).toBe(false);
    expect(isPlausibleDistractor(Number.POSITIVE_INFINITY, 7)).toBe(false);
    expect(isPlausibleDistractor(Number.NEGATIVE_INFINITY, 7)).toBe(false);
    expect(isPlausibleDistractor(7.5, 7)).toBe(false);
    expect(isPlausibleDistractor(7, 7.5)).toBe(false);
  });

  // spec(T-004:AC-5)
  it('leaves room for CHOICE_COUNT - 1 distinct decoys at a small non-zero answer', () => {
    // The other degenerate end: answer 1, where the magnitude branch is narrow and the ladder
    // must carry the question. Ties the two constants to CHOICE_COUNT, which is what actually
    // determines how many decoys are needed.
    for (const answer of [0, 1, 2, 3, 5, 10]) {
      const filled = fillFromLadder(answer, CHOICE_COUNT - 1);
      expect(filled, `answer ${answer} must yield ${CHOICE_COUNT - 1} decoys`).toHaveLength(CHOICE_COUNT - 1);
      expect(new Set(filled).size).toBe(CHOICE_COUNT - 1);
      expect(filled).not.toContain(answer);
    }
  });
});

// =======================================================================================
describe('T-004 tuning — economy', () => {
  // spec(T-004:AC-6)
  it('makes every coin constant a finite positive number', () => {
    const coinConstants = {
      COINS_WIN_BASE,
      COINS_LOSS_BASE,
      COINS_PER_ACCURACY_PERCENT,
      COINS_PER_PERFECT_SHOT,
    };
    for (const [name, value] of Object.entries(coinConstants)) {
      expect(Number.isFinite(value), `${name} must be finite`).toBe(true);
      expect(value, `${name} must be > 0`).toBeGreaterThan(0);
    }
  });

  // spec(T-004:AC-6)
  it('pays a loss less than a win, but still pays', () => {
    // PLAN.md: "losing never drops your rank and still pays a small purse".
    expect(COINS_LOSS_BASE).toBeLessThan(COINS_WIN_BASE);
    expect(COINS_LOSS_BASE).toBeGreaterThan(0);
  });

  // spec(T-004:AC-6)
  it('keeps a zero-answer loss payout a positive integer (T-009 AC-1 / AC-5)', () => {
    // [L-005 derived] T-009 AC-1 and AC-5 require `computeCoinPayout` to return "a finite
    // integer strictly greater than 0" for EVERY performance, including an abandoned duel
    // with zero answers. That payout is `round(COINS_LOSS_BASE + 0 + 0)`, so a legal
    // `COINS_LOSS_BASE` of 0.4 — finite and > 0, satisfying AC-6 exactly — rounds to 0 and
    // makes T-009's frozen AC-1 unsatisfiable. Assert the property, not the bound.
    const worstCasePayout = Math.round(
      COINS_LOSS_BASE + COINS_PER_ACCURACY_PERCENT * 0 + COINS_PER_PERFECT_SHOT * 0,
    );
    expect(worstCasePayout).toBeGreaterThan(0);
    expect(Number.isInteger(worstCasePayout)).toBe(true);
  });

  // spec(T-004:AC-6)
  it('makes accuracy and perfect shots move the payout by a whole coin (T-009 AC-3 / AC-4)', () => {
    // [L-006] AC-6 bounds the two performance rates only as `> 0`; a rate of 1e-9 satisfies
    // that while making "coins by performance" invisible after T-009's `Math.round`. T-009
    // AC-4 requires the payout to be STRICTLY INCREASING as perfectShots sweeps 0..8, which
    // is impossible unless one perfect shot is worth at least a whole coin.
    expect(COINS_PER_PERFECT_SHOT).toBeGreaterThanOrEqual(1);
    // T-009 AC-3 requires the payout at 10/10 correct to strictly exceed the payout at 0/10.
    const atFullAccuracy = Math.round(COINS_WIN_BASE + COINS_PER_ACCURACY_PERCENT * 100);
    const atZeroAccuracy = Math.round(COINS_WIN_BASE + COINS_PER_ACCURACY_PERCENT * 0);
    expect(atFullAccuracy).toBeGreaterThan(atZeroAccuracy);
  });
});

// =======================================================================================
describe('T-004 tuning — chest rarity', () => {
  // spec(T-004:AC-7)
  it('has exactly one weight per ChestRarity, typed against T-003 union', () => {
    const typed: Record<ChestRarity, number> = CHEST_RARITY_WEIGHTS;
    expect(Object.keys(typed).sort()).toEqual([...CHEST_RARITIES].sort());
    expect(Object.keys(typed)).toHaveLength(3);
  });

  // spec(T-004:AC-7)
  it('makes every weight positive and finite', () => {
    for (const rarity of CHEST_RARITIES) {
      const weight = CHEST_RARITY_WEIGHTS[rarity];
      expect(Number.isFinite(weight), `${rarity} weight must be finite`).toBe(true);
      expect(weight, `${rarity} weight must be > 0`).toBeGreaterThan(0);
    }
  });

  // spec(T-004:AC-7)
  it('sums the weights to 1 within 1e-9', () => {
    const total = CHEST_RARITIES.reduce((sum, rarity) => sum + CHEST_RARITY_WEIGHTS[rarity], 0);
    expect(Math.abs(total - 1)).toBeLessThanOrEqual(1e-9);
  });

  // spec(T-004:AC-7)
  it('orders the weights strictly common > uncommon > rare', () => {
    expect(CHEST_RARITY_WEIGHTS.common).toBeGreaterThan(CHEST_RARITY_WEIGHTS.uncommon);
    expect(CHEST_RARITY_WEIGHTS.uncommon).toBeGreaterThan(CHEST_RARITY_WEIGHTS.rare);
  });

  // spec(T-004:AC-7)
  it('keeps every rarity actually reachable from the real PRNG (T-009 AC-10)', () => {
    // [L-012] "positive, summing to 1, strictly decreasing" is an aggregate, and the weakest
    // implementation satisfying it is `{1 - 3e-9, 2e-9, 1e-9}` — three tiers on paper, one
    // tier in play. T-009 AC-10 requires the mean coins of the `rare` group to strictly exceed
    // the `uncommon` group's over 100,000 seeded rolls, which is `NaN` if a group is empty.
    // So reproduce T-009's exact preconditions (its seed, its roll count, T-001's real
    // `weightedPick`) and assert the mechanism, not the projection.
    const entries = CHEST_RARITIES.map((item) => ({ item, weight: CHEST_RARITY_WEIGHTS[item] }));
    const counts: Record<string, number> = { common: 0, uncommon: 0, rare: 0 };
    let rng = createRng(31337);
    for (let i = 0; i < 100_000; i += 1) {
      const [rarity, nextRng] = weightedPick(rng, entries);
      counts[rarity] = (counts[rarity] ?? 0) + 1;
      rng = nextRng;
    }
    for (const rarity of CHEST_RARITIES) {
      expect(counts[rarity], `${rarity} never dropped in 100,000 seeded rolls`).toBeGreaterThan(0);
    }
    // Observed frequency must track the declared weight (T-009 AC-8's 0.01 tolerance).
    for (const rarity of CHEST_RARITIES) {
      const observed = (counts[rarity] ?? 0) / 100_000;
      expect(Math.abs(observed - CHEST_RARITY_WEIGHTS[rarity]), `${rarity} frequency`).toBeLessThan(0.01);
    }
    expect(counts['common'] ?? 0).toBeGreaterThan(counts['uncommon'] ?? 0);
    expect(counts['uncommon'] ?? 0).toBeGreaterThan(counts['rare'] ?? 0);
  });

  // spec(T-004:AC-7)
  it('has exactly one coin range per ChestRarity, typed against T-003 union', () => {
    const typed: Record<ChestRarity, { readonly min: number; readonly max: number }> =
      CHEST_COIN_RANGE_BY_RARITY;
    expect(Object.keys(typed).sort()).toEqual([...CHEST_RARITIES].sort());
    expect(Object.keys(typed)).toHaveLength(3);
  });

  // spec(T-004:AC-7)
  it('gives every rarity an integer coin range with 0 < min <= max', () => {
    for (const rarity of CHEST_RARITIES) {
      const range = CHEST_COIN_RANGE_BY_RARITY[rarity];
      expect(Object.keys(range).sort(), `${rarity} range shape`).toEqual(['max', 'min']);
      expect(Number.isInteger(range.min), `${rarity} min must be an integer`).toBe(true);
      expect(Number.isInteger(range.max), `${rarity} max must be an integer`).toBe(true);
      expect(range.min, `${rarity} min must be > 0`).toBeGreaterThan(0);
      expect(range.max, `${rarity} max must be >= min`).toBeGreaterThanOrEqual(range.min);
    }
  });

  // spec(T-004:AC-7)
  it('increases both min and max strictly at every adjacent rarity pair', () => {
    // Both dimensions, both adjacent pairs (L-012 / L-017): `common.max < rare.max` alone is
    // satisfied by an `uncommon` band that dips below `common`.
    const order = ['common', 'uncommon', 'rare'] as const satisfies readonly ChestRarity[];
    expect([...order].sort()).toEqual([...CHEST_RARITIES].sort());
    for (let i = 1; i < order.length; i += 1) {
      const previous = CHEST_COIN_RANGE_BY_RARITY[order[i - 1] as ChestRarity];
      const current = CHEST_COIN_RANGE_BY_RARITY[order[i] as ChestRarity];
      expect(current.min, `${order[i]}.min must exceed ${order[i - 1]}.min`).toBeGreaterThan(previous.min);
      expect(current.max, `${order[i]}.max must exceed ${order[i - 1]}.max`).toBeGreaterThan(previous.max);
    }
  });

  // spec(T-004:AC-7)
  it('makes a rarer chest pay strictly better in expectation (T-009 AC-10)', () => {
    // T-009 AC-10 requires the MEAN coins per rarity to be strictly ordered. Recorded honestly:
    // this assertion is IMPLIED by the pairwise min/max ordering above — `(min+max)/2` is
    // monotone in both arguments, so no value can fail here while passing that test, and the
    // mutation sweep confirmed no live mutant kills it independently. It is kept as the
    // explicit statement of the downstream requirement, NOT as independent protection; if the
    // pairwise ordering test is ever weakened, this one must be re-derived rather than trusted.
    const meanCoins = (rarity: ChestRarity): number => {
      const range = CHEST_COIN_RANGE_BY_RARITY[rarity];
      return (range.min + range.max) / 2;
    };
    expect(meanCoins('rare')).toBeGreaterThan(meanCoins('uncommon'));
    expect(meanCoins('uncommon')).toBeGreaterThan(meanCoins('common'));
  });
});

// =======================================================================================
describe('A-033 harbor store price', () => {
  // spec(A-033:AC-1)
  it('spec(A-033:AC-1) pins HARBOR_CHEST_PRICE at 50 — above common chest drops, roughly one strong win', () => {
    expect(HARBOR_CHEST_PRICE).toBe(50);
    expect(Number.isInteger(HARBOR_CHEST_PRICE)).toBe(true);
    expect(HARBOR_CHEST_PRICE).toBeGreaterThan(CHEST_COIN_RANGE_BY_RARITY.common.max);
    expect(HARBOR_CHEST_PRICE).toBeGreaterThan(0);
  });
});

// =======================================================================================
describe('T-004 tuning — opponents and mercy', () => {
  // spec(T-004:AC-8)
  it('makes BOT_ACCURACY_WINDOW an integer of at least 1', () => {
    expect(Number.isInteger(BOT_ACCURACY_WINDOW)).toBe(true);
    expect(BOT_ACCURACY_WINDOW).toBeGreaterThanOrEqual(1);
  });

  // spec(T-004:AC-8)
  it('keeps the accuracy window wide enough for T-021 mercy tracking', () => {
    // [L-005 derived — TIGHTER THAN AC-8'S LITERAL TEXT, flagged to the orchestrator]
    // AC-8 states `>= 1`. T-021 AC-3 is frozen on "a history of 8 correct and 2 incorrect
    // answers (with BOT_ACCURACY_WINDOW >= 10) … returns 0.8". At the worst legal value of 1
    // the window keeps a single answer, `playerRecentAccuracy` returns 0 or 1 and never 0.8,
    // and T-021 AC-3 is unsatisfiable — while mercy rubber-banding (PLAN.md: "variance can't
    // convince a 6-year-old they're bad at math") degenerates into a coin flip on the last
    // answer. The intersection of `>= 1` and `>= 10` is non-empty, so nothing legal is lost.
    expect(BOT_ACCURACY_WINDOW).toBeGreaterThanOrEqual(10);
  });

  // spec(T-004:AC-8)
  it('bounds BOT_MERCY_MARGIN strictly inside (0, 1)', () => {
    expect(Number.isFinite(BOT_MERCY_MARGIN)).toBe(true);
    expect(BOT_MERCY_MARGIN).toBeGreaterThan(0);
    expect(BOT_MERCY_MARGIN).toBeLessThan(1);
  });

  // spec(T-004:AC-8)
  it('makes the mercy margin a perceptible handicap, not a rounding error', () => {
    // [L-006] `0 < m < 1` is passed by `m = 1e-9`, which makes T-021's
    // `clamp(playerAccuracy - BOT_MERCY_MARGIN, band.min, band.max)` indistinguishable from
    // no mercy at all. Mercy is a PLAN.md-level promise ("Mercy is built in, not hoped for"),
    // so the margin must move the bot by at least one answer out of the tracked window —
    // the smallest change a player can possibly perceive.
    expect(BOT_MERCY_MARGIN).toBeGreaterThanOrEqual(1 / BOT_ACCURACY_WINDOW);
    // …and it must not be so large that it drives every bot to its band floor, which would
    // delete the rubber-band (T-021 AC-4: "whenever p - margin lies inside the band the
    // result is strictly less than p" needs the inside-band case to be reachable).
    for (const band of GRADE_BANDS) {
      const { min, max } = BOT_ACCURACY_BAND_BY_GRADE[band];
      const reachable = 1 - BOT_MERCY_MARGIN;
      expect(
        reachable,
        `${band}: a perfect player must be able to lift the bot off its floor`,
      ).toBeGreaterThan(min);
      expect(max).toBeGreaterThan(min);
    }
  });

  // spec(T-004:AC-8)
  it('has exactly one accuracy band per GradeBand, typed against T-003 union', () => {
    const typed: Record<GradeBand, { readonly min: number; readonly max: number }> =
      BOT_ACCURACY_BAND_BY_GRADE;
    expect(Object.keys(typed).sort()).toEqual([...GRADE_BANDS].sort());
    expect(Object.keys(typed)).toHaveLength(3);
  });

  // spec(T-004:AC-8)
  it('bounds every band as 0 < min < max <= 1', () => {
    for (const band of GRADE_BANDS) {
      const entry = BOT_ACCURACY_BAND_BY_GRADE[band];
      expect(Object.keys(entry).sort(), `${band} band shape`).toEqual(['max', 'min']);
      expect(Number.isFinite(entry.min), `${band} min finite`).toBe(true);
      expect(Number.isFinite(entry.max), `${band} max finite`).toBe(true);
      expect(entry.min, `${band} min must be > 0`).toBeGreaterThan(0);
      expect(entry.max, `${band} max must exceed min`).toBeGreaterThan(entry.min);
      expect(entry.max, `${band} max must be <= 1`).toBeLessThanOrEqual(1);
    }
  });

  // spec(T-004:AC-8)
  it('never makes an older band easier than a younger one, at every adjacent pair', () => {
    // AC-8: reading `k_1, g2_3, g4_5` yields a non-decreasing sequence of BOTH `min` and
    // `max`. Asserted pairwise on both dimensions (L-012).
    const order = ['k_1', 'g2_3', 'g4_5'] as const satisfies readonly GradeBand[];
    expect([...order].sort()).toEqual([...GRADE_BANDS].sort());
    for (let i = 1; i < order.length; i += 1) {
      const previous = BOT_ACCURACY_BAND_BY_GRADE[order[i - 1] as GradeBand];
      const current = BOT_ACCURACY_BAND_BY_GRADE[order[i] as GradeBand];
      expect(current.min, `${order[i]}.min must not drop below ${order[i - 1]}.min`).toBeGreaterThanOrEqual(
        previous.min,
      );
      expect(current.max, `${order[i]}.max must not drop below ${order[i - 1]}.max`).toBeGreaterThanOrEqual(
        previous.max,
      );
    }
  });

  // spec(T-004:AC-8)
  it('makes clamp(p - margin, band) land inside the band for every band and every p', () => {
    // [L-005] Sweep the whole player-accuracy dimension against every band, so no combination
    // of the frozen margin and a frozen band can put T-021 AC-4's clamped result outside
    // `[band.min, band.max]` or produce NaN.
    for (const band of GRADE_BANDS) {
      const { min, max } = BOT_ACCURACY_BAND_BY_GRADE[band];
      for (let p = 0; p <= 1.0000001; p += 0.05) {
        const target = Math.min(Math.max(Math.min(p, 1) - BOT_MERCY_MARGIN, min), max);
        expect(Number.isFinite(target), `${band} @ p=${p}`).toBe(true);
        expect(target, `${band} @ p=${p}`).toBeGreaterThanOrEqual(min);
        expect(target, `${band} @ p=${p}`).toBeLessThanOrEqual(max);
      }
    }
  });

  // spec(T-004:AC-8)
  it('makes the loss-streak mercy trigger reachable inside one session', () => {
    // MERCY_LOSS_STREAK_TRIGGER and MERCY_FORCED_MISFIRES are exact (AC-1); this is the
    // relationship they exist to guarantee — T-021 AC-9's forced-misfire path must actually
    // fire, and must grant at least one free turn.
    expect(MERCY_LOSS_STREAK_TRIGGER).toBeGreaterThanOrEqual(1);
    expect(MERCY_FORCED_MISFIRES).toBeGreaterThanOrEqual(1);
  });
});

// =======================================================================================
describe('T-004 tuning — Double-Shot', () => {
  // spec(T-004:AC-11)
  it('bounds DOUBLE_SHOT_TIMER_FACTOR strictly inside (0, 1)', () => {
    expect(Number.isFinite(DOUBLE_SHOT_TIMER_FACTOR)).toBe(true);
    expect(DOUBLE_SHOT_TIMER_FACTOR).toBeGreaterThan(0);
    expect(DOUBLE_SHOT_TIMER_FACTOR).toBeLessThan(1);
  });

  // spec(T-004:AC-11)
  it('actually shortens every catalog timer after rounding (T-022 AC-2)', () => {
    // [L-005 derived] The worst legal value under `0 < f < 1` is `0.99999`. T-022 AC-2 is
    // frozen on `timerMs === Math.round(cannon.timerMs * DOUBLE_SHOT_TIMER_FACTOR)`, "which
    // is strictly less than cannon.timerMs". At the shortest catalog timer (12,000 ms)
    // `Math.round(12000 * 0.99999) === 12000` — the factor is legal under AC-11 and T-022
    // AC-2 is unsatisfiable. The bound protects a ROUNDED comparison, so assert the rounded
    // comparison, at every timer in the catalog.
    for (const timerMs of CANNON_TIMERS_MS) {
      const shortened = Math.round(timerMs * DOUBLE_SHOT_TIMER_FACTOR);
      expect(shortened, `timer ${timerMs} must shorten`).toBeLessThan(timerMs);
      expect(shortened, `timer ${timerMs} must stay positive`).toBeGreaterThan(0);
    }
  });

  // spec(T-004:AC-11)
  it('leaves a non-empty lost-Perfect-Shot window (T-022 AC-9)', () => {
    // [L-005 derived] T-022 AC-9 asserts that at any `elapsedMs` in
    // `[0.4 * shortened, 0.4 * 20000)` — a window that WOULD be a Perfect Shot under the full
    // timer — `perfectShot` is false. That window must contain at least one integer
    // millisecond or the criterion tests nothing. This is the whole point of Double-Shot
    // being "a harder variant": the Perfect Shot window must measurably shrink.
    const fullTimerMs = 20_000;
    const shortened = Math.round(fullTimerMs * DOUBLE_SHOT_TIMER_FACTOR);
    const windowStart = Math.ceil(PERFECT_SHOT_TIMER_FRACTION * shortened);
    const windowEnd = PERFECT_SHOT_TIMER_FRACTION * fullTimerMs;
    expect(windowStart).toBeLessThan(windowEnd);
    // …and the shortened timer must still leave a Perfect Shot window of its own.
    expect(windowStart).toBeGreaterThanOrEqual(1);
  });

  // spec(T-004:AC-11)
  it('makes DOUBLE_SHOT_VOLLEY_COUNT an integer of at least 2', () => {
    // PLAN.md §The armory: Double-Shot buys "a second volley".
    expect(Number.isInteger(DOUBLE_SHOT_VOLLEY_COUNT)).toBe(true);
    expect(DOUBLE_SHOT_VOLLEY_COUNT).toBeGreaterThanOrEqual(2);
  });
});

// =======================================================================================
describe('T-004 tuning — onboarding hull', () => {
  /** T-008's guaranteed floor damage for one correct Swivel volley, per AC-12's formula. */
  const swivelFloorVolley = Math.ceil(
    SWIVEL_DAMAGE_MIN + ANSWER_QUALITY_FLOOR * (SWIVEL_DAMAGE_MAX - SWIVEL_DAMAGE_MIN),
  );

  /**
   * The most damage one correct Swivel volley can ever deal: the top of the cannon's range
   * plus the Perfect Shot bonus. T-008 caps `rollDamage` at `damageMax` and adds
   * `PERFECT_SHOT_BONUS_DAMAGE` on top of it, so this is a hard ceiling on a single volley.
   *
   * This is the case a tutorial produces BY DEFAULT, not an outlier: the guided duel points at
   * the correct tap, so answering inside the first 40% of a 20-second timer is the normal
   * outcome, and every volley is a Perfect Shot.
   *
   * Derived from the constants rather than hardcoded — `PERFECT_SHOT_BONUS_DAMAGE` is read from
   * the module under test, so buffing the bonus (or the Swivel's `damageMax`) raises this floor
   * automatically instead of silently reopening the two-volley hole.
   */
  const swivelBestVolley = SWIVEL_DAMAGE_MAX + PERFECT_SHOT_BONUS_DAMAGE;

  // spec(T-004:AC-12)
  it('is a positive integer', () => {
    expect(Number.isInteger(ONBOARDING_ENEMY_HULL)).toBe(true);
    expect(ONBOARDING_ENEMY_HULL).toBeGreaterThan(0);
  });

  // spec(T-004:AC-12)
  it('sits strictly below the first island hull', () => {
    // The tutorial sloop is NOT the port_sumwich sloop: T-008 AC-13 tunes that one to a 4–6
    // volley duel, which is exactly what a "politely sinks in three volleys" tutorial must not
    // be. A separate named constant is the only way the onboarding wiring can avoid a bare
    // literal outside tuning.ts (ARCHITECTURE.md §4.3's one-constants-file rule).
    expect(ONBOARDING_ENEMY_HULL).toBeLessThan(ENEMY_HULL_BY_ISLAND.port_sumwich);
  });

  // spec(T-004:AC-12)
  it('sinks in NO MORE than three volleys at the Swivel Gun guaranteed FLOOR damage', () => {
    // The CEILING half of the window. AC-12's formula verbatim, with the Swivel's 8/12
    // hardcoded per the same-wave rule. The floor damage — not the mean — is the right bound
    // here: PLAN.md promises the tutorial sloop sinks in three volleys for every child,
    // including the slowest correct answer.
    expect(swivelFloorVolley).toBe(10);
    expect(ONBOARDING_ENEMY_HULL).toBeLessThanOrEqual(3 * swivelFloorVolley);
    expect(Math.ceil(ONBOARDING_ENEMY_HULL / swivelFloorVolley)).toBeLessThanOrEqual(3);
  });

  // spec(T-004:AC-12)
  it('sinks in NO FEWER than three volleys, Perfect Shot bonus included', () => {
    // The FLOOR half of the window — added after an independent code review found the shipped
    // value satisfied every other AC-12 assertion while sinking the tutorial sloop in TWO
    // volleys. L-005 in its purest form: AC-12 constrained only the ceiling, so the worst legal
    // value sat at the unconstrained end.
    //
    // PLAN.md:75 promises "a scripted pirate sloop that politely sinks in three volleys", and
    // "three" is the whole pedagogical point — the child must see choose → answer → fire cycle
    // three times before the tutorial resolves. A two-volley tutorial is not a shorter version
    // of that promise, it is a different one.
    //
    // The bound is derived, never hardcoded: the best a single Swivel volley can do is
    // `SWIVEL_DAMAGE_MAX + PERFECT_SHOT_BONUS_DAMAGE`, so two such volleys deal
    // `2 * swivelBestVolley`, and the hull must sit STRICTLY above that or a third volley is
    // never reached. A future edit to the Swivel's damage or the Perfect Shot bonus moves this
    // floor on its own — which is exactly what would have caught the original defect.
    expect(
      ONBOARDING_ENEMY_HULL,
      `two Perfect Shots deal ${2 * swivelBestVolley}; a hull of ${ONBOARDING_ENEMY_HULL} ` +
        `ends the tutorial one volley early`,
    ).toBeGreaterThan(2 * swivelBestVolley);
    // Stated the other way round, as the volley count PLAN.md actually promises: even when
    // every volley is a Perfect Shot at the top of the range, three are required.
    expect(Math.ceil(ONBOARDING_ENEMY_HULL / swivelBestVolley)).toBeGreaterThanOrEqual(3);
  });

  // spec(T-004:AC-12)
  it('leaves the three-volley window itself non-empty', () => {
    // Both ends are now derived from Swivel constants, so a future retune could in principle
    // close the window entirely — the floor `2 * (damageMax + bonus)` could cross the ceiling
    // `3 * ceil(damageMin + FLOOR * range)` — and every hull would fail with no legal value to
    // pick. That failure must read as "the window is empty", not as "your constant is wrong",
    // so assert the window's own existence rather than leaving an implementer to discover it.
    const floorExclusive = 2 * swivelBestVolley;
    const ceilingInclusive = 3 * swivelFloorVolley;
    expect(
      ceilingInclusive,
      `no legal ONBOARDING_ENEMY_HULL exists: floor > ${floorExclusive}, ceiling <= ${ceilingInclusive}`,
    ).toBeGreaterThan(floorExclusive);
    // …and the frozen constant must land inside it, at both ends.
    expect(ONBOARDING_ENEMY_HULL).toBeGreaterThan(floorExclusive);
    expect(ONBOARDING_ENEMY_HULL).toBeLessThanOrEqual(ceilingInclusive);
  });

  // spec(T-004:AC-12)
  it('takes strictly fewer volleys than the first real duel', () => {
    // The relationship the two constants exist to express, not just the two numbers. Even at
    // the worst legal combination (onboarding at its ceiling, port_sumwich at its floor of 40)
    // the tutorial must be visibly shorter than a real duel, or the "guided first duel" reads
    // as just another duel and PLAN.md's "first reward inside 90 seconds" is at risk.
    const onboardingVolleys = Math.ceil(ONBOARDING_ENEMY_HULL / swivelFloorVolley);
    const firstIslandVolleys = Math.ceil(ENEMY_HULL_BY_ISLAND.port_sumwich / swivelFloorVolley);
    expect(onboardingVolleys).toBeLessThan(firstIslandVolleys);
    // The lower end of the tutorial's length is owned by the "no fewer than three volleys"
    // test above, which supersedes the one-volley exclusion this test originally carried —
    // that assertion (`> SWIVEL_DAMAGE_MAX`) was the bound that stopped one volley short and
    // let a two-volley tutorial through. Kept here only as the cross-check that the two
    // constants still describe two different-length duels.
    expect(onboardingVolleys).toBeGreaterThanOrEqual(3);
  });

  // spec(T-004:AC-12)
  it('keeps the first REAL duel at 4–6 player volleys (T-008 AC-13)', () => {
    // [L-005] The counterpart relationship: T-008 AC-13 requires EVERY one of 1,000 seeded
    // simulations against `ENEMY_HULL_BY_ISLAND.port_sumwich` to land between 4 and 6 volleys
    // inclusive, with no tail tolerance. Firing the Swivel at `0.5 * timerMs`, T-008's roll is
    // bounded below by `rollLowerBound(8, 12, 0.5)` and above by 12, so the volley count is
    // bounded by the two extremes — checkable in closed form against the frozen hull.
    const lower = rollLowerBound(SWIVEL_DAMAGE_MIN, SWIVEL_DAMAGE_MAX, 0.5);
    const hull = ENEMY_HULL_BY_ISLAND.port_sumwich;
    const fastestVolleys = Math.ceil(hull / SWIVEL_DAMAGE_MAX);
    const slowestVolleys = Math.ceil(hull / lower);
    expect(fastestVolleys, `hull ${hull} sinks too fast`).toBeGreaterThanOrEqual(4);
    expect(slowestVolleys, `hull ${hull} drags`).toBeLessThanOrEqual(6);
  });
});

// =======================================================================================
describe('T-004 tuning — immutability and module purity', () => {
  const OBJECT_EXPORTS = {
    ENEMY_HULL_BY_ISLAND,
    CHEST_RARITY_WEIGHTS,
    CHEST_COIN_RANGE_BY_RARITY,
    BOT_ACCURACY_BAND_BY_GRADE,
  } as const;

  // spec(T-004:AC-9)
  it('freezes every object-valued export', () => {
    for (const [name, value] of Object.entries(OBJECT_EXPORTS)) {
      expect(Object.isFrozen(value), `${name} must be frozen`).toBe(true);
    }
  });

  // spec(T-004:AC-9)
  it('throws in strict mode when a key is mutated, deleted, or added', () => {
    // `Object.isFrozen` alone is the projection; the behaviour is what consumers rely on.
    // This module is ESM, so it is strict mode and a frozen write throws rather than
    // silently no-op'ing. All three mutation kinds are covered (L-017: the operation
    // dimension, not just assignment).
    for (const [name, value] of Object.entries(OBJECT_EXPORTS)) {
      const target = value as unknown as Record<string, unknown>;
      const firstKey = Object.keys(target)[0] as string;
      expect(() => {
        target[firstKey] = 999_999;
      }, `${name}: assigning an existing key must throw`).toThrow(TypeError);
      expect(() => {
        delete target[firstKey];
      }, `${name}: deleting a key must throw`).toThrow(TypeError);
      expect(() => {
        target['__injected__'] = 1;
      }, `${name}: adding a key must throw`).toThrow(TypeError);
    }
  });

  // spec(T-004:AC-9)
  it('freezes the NESTED range objects too', () => {
    // A shallow `Object.freeze` leaves `CHEST_COIN_RANGE_BY_RARITY.common.min = 999` working
    // — the record is frozen, the payload is not, and `as const` freezes nothing at runtime.
    // AC-9's "mutating a key throws" is only true of this module's actual value surface if
    // the nested `{min, max}` objects are frozen as well.
    for (const rarity of CHEST_RARITIES) {
      const range = CHEST_COIN_RANGE_BY_RARITY[rarity] as unknown as Record<string, unknown>;
      expect(Object.isFrozen(range), `CHEST_COIN_RANGE_BY_RARITY.${rarity} must be frozen`).toBe(true);
      expect(() => {
        range['min'] = 999_999;
      }).toThrow(TypeError);
    }
    for (const band of GRADE_BANDS) {
      const entry = BOT_ACCURACY_BAND_BY_GRADE[band] as unknown as Record<string, unknown>;
      expect(Object.isFrozen(entry), `BOT_ACCURACY_BAND_BY_GRADE.${band} must be frozen`).toBe(true);
      expect(() => {
        entry['min'] = 999_999;
      }).toThrow(TypeError);
    }
  });

  // spec(T-004:AC-9)
  it('returns the identical module instance on a repeat import', async () => {
    const reimported = await import('@engine/tuning');
    expect(reimported.PLAYER_HULL).toBe(PLAYER_HULL);
    expect(reimported.ENEMY_HULL_BY_ISLAND).toBe(ENEMY_HULL_BY_ISLAND);
    expect(reimported.CHEST_RARITY_WEIGHTS).toBe(CHEST_RARITY_WEIGHTS);
    expect(reimported.CHEST_COIN_RANGE_BY_RARITY).toBe(CHEST_COIN_RANGE_BY_RARITY);
    expect(reimported.BOT_ACCURACY_BAND_BY_GRADE).toBe(BOT_ACCURACY_BAND_BY_GRADE);
  });

  // spec(T-004:AC-9)
  it('produces identical values when the module is evaluated a SECOND time', async () => {
    // The meaningful half of AC-9. ESM caching makes a plain re-import trivially identical,
    // so it proves nothing about mutable state; resetting the module registry forces a fresh
    // evaluation. A module that derived any constant from a counter, a clock, or a random
    // draw would differ here — and every export is compared, not a sample (L-017).
    vi.resetModules();
    const freshA = await import('@engine/tuning');
    vi.resetModules();
    const freshB = await import('@engine/tuning');
    for (const name of REQUIRED_EXPORTS) {
      const a = (freshA as unknown as Record<string, unknown>)[name];
      const b = (freshB as unknown as Record<string, unknown>)[name];
      expect(a, `${name} differs between module evaluations`).toStrictEqual(b);
    }
    // And the fresh evaluation must still match the statically imported values.
    expect((freshA as unknown as Record<string, unknown>)['PLAYER_HULL']).toBe(PLAYER_HULL);
    expect((freshA as unknown as Record<string, unknown>)['ENEMY_HULL_BY_ISLAND']).toStrictEqual(
      ENEMY_HULL_BY_ISLAND,
    );
  });
});

// =======================================================================================
describe('T-004 tuning — numeric sanity across the whole surface', () => {
  // spec(T-004:AC-10)
  it('exports every constant the required surface names', () => {
    // Without this, AC-10's "every numeric export" sweep passes vacuously against a module
    // that exports nothing (L-017: a passing assertion over an unswept domain is no evidence).
    const namespace = tuningNamespace as unknown as Record<string, unknown>;
    for (const name of REQUIRED_EXPORTS) {
      expect(Object.hasOwn(namespace, name), `missing export ${name}`).toBe(true);
      expect(namespace[name], `${name} must not be undefined`).toBeDefined();
    }
    // 3 duel + 5 damage + 2 double-shot + 6 questions + 5 mastery + 7 economy + 5 opponents.
    expect(REQUIRED_EXPORTS).toHaveLength(33);
  });

  // spec(T-004:AC-10)
  it('has no NaN, Infinity, or -Infinity anywhere in the module', () => {
    // Walks the whole namespace, including nested record values, so a constant added later
    // without a dedicated test is still covered.
    const namespace = tuningNamespace as unknown as Record<string, unknown>;
    const leaves: { path: string; value: number }[] = [];
    for (const [key, value] of Object.entries(namespace)) {
      numericLeaves(value, key, leaves);
    }
    expect(leaves.length, 'the module must expose numeric constants').toBeGreaterThanOrEqual(
      REQUIRED_EXPORTS.length,
    );
    for (const leaf of leaves) {
      expect(Number.isNaN(leaf.value), `${leaf.path} is NaN`).toBe(false);
      expect(Number.isFinite(leaf.value), `${leaf.path} is not finite`).toBe(true);
    }
  });

  // spec(T-004:AC-10)
  it('makes every constant documented as an integer an actual integer', () => {
    const namespace = tuningNamespace as unknown as Record<string, unknown>;
    for (const name of INTEGER_CONSTANTS) {
      const value = namespace[name];
      expect(typeof value, `${name} must be a number`).toBe('number');
      expect(Number.isInteger(value as number), `${name} must be an integer`).toBe(true);
    }
    // The record-valued integer surfaces, entry by entry (L-017).
    for (const island of ISLAND_IDS) {
      expect(Number.isInteger(ENEMY_HULL_BY_ISLAND[island]), `${island} hull`).toBe(true);
    }
    for (const rarity of CHEST_RARITIES) {
      expect(Number.isInteger(CHEST_COIN_RANGE_BY_RARITY[rarity].min), `${rarity}.min`).toBe(true);
      expect(Number.isInteger(CHEST_COIN_RANGE_BY_RARITY[rarity].max), `${rarity}.max`).toBe(true);
    }
  });

  // spec(T-004:AC-10)
  it('keeps every fraction-valued constant a real fraction in its documented domain', () => {
    // The complement of INTEGER_CONSTANTS: constants that may legitimately be non-integers.
    // Asserting only "integers are integers" leaves this half of the surface unswept.
    const fractional: Record<string, number> = {
      ANSWER_QUALITY_FLOOR,
      PERFECT_SHOT_TIMER_FRACTION,
      QUALITY_WEIGHT,
      MASTERY_MIN_ACCURACY,
      MASTERY_RATE_RANGE,
      MASTERY_RATE_DUEL,
      DISTRACTOR_MAX_RATIO,
      DOUBLE_SHOT_TIMER_FACTOR,
      BOT_MERCY_MARGIN,
      COINS_WIN_BASE,
      COINS_LOSS_BASE,
      COINS_PER_ACCURACY_PERCENT,
      COINS_PER_PERFECT_SHOT,
    };
    for (const [name, value] of Object.entries(fractional)) {
      expect(typeof value, `${name} must be a number`).toBe('number');
      expect(Number.isFinite(value), `${name} must be finite`).toBe(true);
      expect(Number.isNaN(value), `${name} must not be NaN`).toBe(false);
      expect(Object.is(value, -0), `${name} must not be negative zero`).toBe(false);
    }
    // Every constant expressed as a [0,1] fraction, at both ends of its domain.
    for (const [name, value] of Object.entries({
      ANSWER_QUALITY_FLOOR,
      PERFECT_SHOT_TIMER_FRACTION,
      QUALITY_WEIGHT,
      MASTERY_MIN_ACCURACY,
      MASTERY_RATE_DUEL,
      DOUBLE_SHOT_TIMER_FACTOR,
      BOT_MERCY_MARGIN,
    })) {
      expect(value, `${name} must be > 0`).toBeGreaterThan(0);
      expect(value, `${name} must be <= 1`).toBeLessThanOrEqual(1);
    }
  });

  // spec(T-004:AC-10)
  it('exposes no mutable array export that a consumer could sort in place', () => {
    // Any array-valued export must be frozen for the same reason the records are; an
    // unfrozen array export is a shared mutable global in a module whose entire contract is
    // "these values never change".
    const namespace = tuningNamespace as unknown as Record<string, unknown>;
    for (const [name, value] of Object.entries(namespace)) {
      if (Array.isArray(value)) {
        expect(Object.isFrozen(value), `array export ${name} must be frozen`).toBe(true);
      }
    }
  });
});

// =======================================================================================
// T-031 — Perfect Shot semantics (doc + classification; no behaviour change)
// =======================================================================================
describe('T-031 Perfect Shot semantics', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const REPO_ROOT = join(HERE, '../..');
  const ARCH = readFileSync(join(REPO_ROOT, 'ARCHITECTURE.md'), 'utf8');
  const TUNING_SRC = readFileSync(join(REPO_ROOT, 'src/engine/tuning.ts'), 'utf8');

  // spec(T-031:AC-1)
  it('spec(T-031:AC-1) ARCHITECTURE §4.3 does not claim a Perfect Shot adds a damage-carrying ball', () => {
    expect(ARCH).not.toMatch(/\+1 bonus ball/);
    expect(ARCH).toMatch(/\+1 damage/);
    expect(ARCH.toLowerCase()).toMatch(/presentation/);
  });

  // spec(T-031:AC-2)
  it('spec(T-031:AC-2) BASE_BALLS_PER_VOLLEY is documented as a presentation constant', () => {
    const idx = TUNING_SRC.indexOf('export const BASE_BALLS_PER_VOLLEY');
    const block = TUNING_SRC.slice(Math.max(0, idx - 450), idx + 40);
    expect(block.toLowerCase()).toMatch(/presentation/);
  });

  // spec(T-031:AC-4)
  it('spec(T-031:AC-4) full suite contract — Perfect Shot semantics leave behaviour pins unchanged', () => {
    // Behaviour is pinned by existing T-004/T-008 suites; this ticket only retargets docs + bound.
    expect(PERFECT_SHOT_BONUS_DAMAGE).toBe(1);
    expect(QUALITY_WEIGHT).toBe(0.7);
    expect(BASE_BALLS_PER_VOLLEY).toBeGreaterThanOrEqual(1);
  });

  // spec(T-031:AC-8)
  it('spec(T-031:AC-8) tightened QUALITY_WEIGHT floor is consistent with T-008 AC-16 effect size', () => {
    // Verified against the same closed-form mean gap T-004 already checks for wide-range cannons.
    for (const cannon of WIDE_RANGE_CANNONS) {
      const range = cannon.damageMax - cannon.damageMin;
      const atFullSpeed = meanRollDamage(cannon.damageMin, cannon.damageMax, 1);
      const atFloor = meanRollDamage(cannon.damageMin, cannon.damageMax, ANSWER_QUALITY_FLOOR);
      expect(atFullSpeed - atFloor).toBeGreaterThanOrEqual(0.1 * range);
    }
  });

  // spec(T-031:AC-5)
  it('spec(T-031:AC-5) only duel/damage.ts (ballCount) reads BASE_BALLS_PER_VOLLEY outside tuning', () => {
    const engineRoot = join(REPO_ROOT, 'src/engine');
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        if (!name.endsWith('.ts') || name === 'tuning.ts') continue;
        const text = readFileSync(path, 'utf8');
        if (text.includes('BASE_BALLS_PER_VOLLEY') && !path.endsWith(`${sep}duel${sep}damage.ts`)) {
          hits.push(path);
        }
      }
    };
    walk(engineRoot);
    expect(hits).toEqual([]);
    const damage = readFileSync(join(engineRoot, 'duel/damage.ts'), 'utf8');
    expect(damage).toMatch(/PRESENTATION|presentation/);
  });

  it('dod(T-031:1) ARCHITECTURE §4.3 Perfect Shot wording is corrected', () => {
    expect(ARCH).toMatch(/\+1 damage/);
    expect(ARCH).not.toMatch(/\+1 bonus ball/);
  });

  it('dod(T-031:2) BASE_BALLS_PER_VOLLEY carries an in-code presentation classification', () => {
    expect(TUNING_SRC.toLowerCase()).toMatch(/presentation constant/);
  });

  it('dod(T-031:3) no behaviour retune — bonus damage and QUALITY_WEIGHT values unchanged', () => {
    expect(PERFECT_SHOT_BONUS_DAMAGE).toBe(1);
    expect(QUALITY_WEIGHT).toBe(0.7);
  });

  it('dod(T-031:4) T-008 brief records the +1 damage ruling', () => {
    const brief = readFileSync(join(REPO_ROOT, 'tickets/T-008.md'), 'utf8');
    expect(brief).toMatch(/T-031/);
    expect(brief.toLowerCase()).toMatch(/\+1 damage/);
  });
});
