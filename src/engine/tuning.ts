/**
 * Central tuning constants — the single home for every magic number in the game.
 *
 * ARCHITECTURE.md §4.3 / §8: "All tuning constants live in one file, `engine/tuning.ts`",
 * exposed on the hidden dev slider screen (`app/dev.tsx`) so day-5 balance tuning needs no
 * rebuild. No other engine module may contain a literal feel-number — everything downstream
 * imports named constants from here.
 *
 * Per the ticket's honesty boundary: a constant whose value the design docs fix exactly equals
 * that documented value. A constant the docs leave open still exists with a name and a type;
 * its value here is one legal choice that satisfies every acceptance criterion governing its
 * *behaviour* (bounds, ordering, effect size) — the criteria are the contract, not this number.
 * Every export is deeply frozen: `as const` freezes nothing at runtime, so record- and
 * object-valued exports (and their nested payloads) are frozen via `deepFreeze` below.
 */
import type { ChestRarity, GradeBand, IslandId } from '@content/schemas';

/** Recursively freezes an object graph so nested payloads can't be mutated either. */
function deepFreeze<T>(value: T): T {
  Object.freeze(value);
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) {
      if (child !== null && typeof child === 'object' && !Object.isFrozen(child)) {
        deepFreeze(child);
      }
    }
  }
  return value;
}

// ============================================================================================
// Duel
// ============================================================================================

/** PLAN.md §The duel loop: "enemy sloops 40–50 vs the player's 100". */
export const PLAYER_HULL = 100;

const ENEMY_HULL_BY_ISLAND_RAW: Record<IslandId, number> = {
  // PLAN.md §The duel loop: "first pirate sloops carry 40–50 hull". ARCHITECTURE §4.3: the
  // day-1 "a duel you can win" resolves in 4–6 player volleys.
  port_sumwich: 45,
  // unspecified — pinned only by AC-2's monotonic-growth and 4*PLAYER_HULL ceiling.
  isla_products: 60,
  // unspecified — pinned only by AC-2's monotonic-growth and 4*PLAYER_HULL ceiling.
  quotient_cove: 75,
  // unspecified — pinned only by AC-2's monotonic-growth and 4*PLAYER_HULL ceiling.
  fraction_reef: 95,
  // unspecified — pinned only by AC-2's monotonic-growth and 4*PLAYER_HULL ceiling.
  grandline: 120,
};
/** Per-island enemy hull, strictly increasing by island order (AC-2). */
export const ENEMY_HULL_BY_ISLAND: Readonly<Record<IslandId, number>> = deepFreeze(ENEMY_HULL_BY_ISLAND_RAW);

/**
 * unspecified — PLAN.md:75's onboarding sloop "politely sinks in three volleys" (AC-12), pinned
 * against the Swivel Gun's guaranteed floor damage rather than invented as a bare literal.
 * Window is `[27, 30]`: the ceiling comes from the FLOOR volley (`3 * swivelFloorVolley`, the
 * same worst-case-correct-answer guarantee used everywhere else); the floor comes from the fact
 * that a guided tutorial pointing at the correct tap is a Perfect-Shot scenario BY
 * CONSTRUCTION, not an average one — every volley lands `SWIVEL_DAMAGE_MAX +
 * PERFECT_SHOT_BONUS_DAMAGE`, so the hull must clear twice that or the sloop sinks in two
 * volleys, not three (AC-12, corrected after review found the original value did exactly that).
 */
export const ONBOARDING_ENEMY_HULL = 28;

// ============================================================================================
// Damage
// ============================================================================================

/** ARCHITECTURE.md §4.3: "floored at 0.35 for any correct answer". */
export const ANSWER_QUALITY_FLOOR = 0.35;

/** ARCHITECTURE.md §4.3: perfectShot at "elapsed < 40% of timer". */
export const PERFECT_SHOT_TIMER_FRACTION = 0.4;

/**
 * unspecified — the blend factor between the uniform roll and answer quality in T-008's damage
 * formula. Derived in closed form (AC-3 amendment / L-018) from T-008 AC-16: mean roll damage at
 * full speed must exceed the mean at the quality floor by >= 0.10 * range for every cannon with
 * `damageMax - damageMin >= 10` (the widest-range cannons, `culverin` / `double_broadside`).
 * That requires `QUALITY_WEIGHT > 7/12 ≈ 0.5833`; this value clears it with margin.
 */
export const QUALITY_WEIGHT = 0.7;

/** unspecified — ARCHITECTURE §4.3: damage "renders as N cannonball arcs" (AC-3: integer >= 1). */
export const BASE_BALLS_PER_VOLLEY = 1;

/** unspecified — ARCHITECTURE §4.3: a Perfect Shot is "+1 bonus ball" (AC-3: integer >= 1). */
export const PERFECT_SHOT_BONUS_DAMAGE = 1;

// ============================================================================================
// Double-Shot
// ============================================================================================

/**
 * unspecified — PLAN.md §The armory: Double-Shot buys "a harder variant of the same skill for a
 * second volley", modeled by T-022 as a shortened timer (AC-11: strictly inside (0,1), and must
 * still shorten every catalog timer after rounding).
 */
export const DOUBLE_SHOT_TIMER_FACTOR = 0.6;

/** unspecified — PLAN.md: Double-Shot grants "a second volley" (AC-11: integer >= 2). */
export const DOUBLE_SHOT_VOLLEY_COUNT = 2;

// ============================================================================================
// Questions
// ============================================================================================

/** ARCHITECTURE.md §4.1: parameterized-template rejection-sampling attempt cap. */
export const MAX_PARAM_SAMPLE_ATTEMPTS = 100;

/**
 * unspecified — ARCHITECTURE §4.1: "excluding recently served ids" (AC-4, corrected: must stay
 * strictly BELOW the >=8-templates-per-skill floor so a skill's pool can never be fully
 * excluded — at exactly 8 the recency feature becomes a permanent no-op).
 */
export const RECENT_TEMPLATE_WINDOW = 5;

/** PLAN.md §Questions: "four-choice output". */
export const CHOICE_COUNT = 4;

/**
 * unspecified — operationalises "plausibly typed (same magnitude/sign)" from ARCHITECTURE §4.1
 * (AC-5: finite, > 1). Must keep a same-magnitude declared distractor plausible (T-005 AC-1:
 * ratio 12/7) while rejecting a wildly out-of-magnitude one (T-005 AC-5: ratio 12000/7).
 */
export const DISTRACTOR_MAX_RATIO = 2;

/**
 * unspecified — derived, not chosen (AC-5): for a zero answer the magnitude-ratio branch is
 * undefined and negatives are excluded, so the only plausible distractors the fill ladder can
 * ever produce are {1, 2, 3}. A floor below 3 leaves fewer than the three distinct distractors a
 * four-choice question requires.
 */
export const DISTRACTOR_ABS_FLOOR = 3;

/**
 * unspecified — T-005's near-miss fill ladder has exactly 9 fixed rungs (AC-4: integer >= 9); a
 * smaller bound makes the later rungs unreachable, reintroducing zero-answer starvation.
 */
export const MAX_DISTRACTOR_ATTEMPTS = 9;

// ============================================================================================
// Mastery
// ============================================================================================

/** PLAN.md §Sea chart: "10 correct at ≥70% accuracy". */
export const MASTERY_THRESHOLD_CORRECT = 10;

/** PLAN.md §Sea chart: "10 correct at ≥70% accuracy". */
export const MASTERY_MIN_ACCURACY = 0.7;

/** PLAN.md §Sea chart: "range drills fill a skill's meter at full rate". */
export const MASTERY_RATE_RANGE = 1;

/** PLAN.md §Sea chart: "correct answers in real duels fill the matching skill at half rate". */
export const MASTERY_RATE_DUEL = 0.5;

/** ARCHITECTURE.md §5: Firestore field `mastery: {skillId: 0-100}`. */
export const MASTERY_METER_MAX = 100;

// ============================================================================================
// Economy
// ============================================================================================

/** unspecified — PLAN.md: "coins by performance (win, accuracy, perfects)" (AC-6: finite > 0). */
export const COINS_WIN_BASE = 20;

/**
 * unspecified — PLAN.md: "losing ... still pays a small purse" (AC-6: finite > 0, strictly less
 * than COINS_WIN_BASE, and the base of a zero-answer payout must round to a positive integer).
 */
export const COINS_LOSS_BASE = 5;

/** unspecified — PLAN.md: "coins by performance ... accuracy" (AC-6: finite > 0). */
export const COINS_PER_ACCURACY_PERCENT = 0.2;

/**
 * unspecified — PLAN.md: "coins by performance ... perfects" (AC-6: finite > 0; T-009 AC-4
 * requires perfect shots to move the payout by a whole coin after rounding, so this is >= 1).
 */
export const COINS_PER_PERFECT_SHOT = 1;

const CHEST_RARITY_WEIGHTS_RAW: Record<ChestRarity, number> = {
  // unspecified — PLAN.md names no tiers or weights (AC-7: positive, sums to 1, strictly
  // decreasing common > uncommon > rare, every tier reachable under 100,000 seeded draws).
  common: 0.6,
  uncommon: 0.3,
  rare: 0.1,
};
/** Chest rarity roll weights (AC-7). */
export const CHEST_RARITY_WEIGHTS: Readonly<Record<ChestRarity, number>> =
  deepFreeze(CHEST_RARITY_WEIGHTS_RAW);

const CHEST_COIN_RANGE_BY_RARITY_RAW: Record<ChestRarity, { min: number; max: number }> = {
  // unspecified — PLAN.md gives no numbers (AC-7: integer, 0 < min <= max, strictly increasing
  // min and max across common -> uncommon -> rare).
  common: { min: 10, max: 30 },
  uncommon: { min: 25, max: 60 },
  rare: { min: 50, max: 120 },
};
/** Chest coin payout range per rarity (AC-7). */
export const CHEST_COIN_RANGE_BY_RARITY: Readonly<
  Record<ChestRarity, { readonly min: number; readonly max: number }>
> = deepFreeze(CHEST_COIN_RANGE_BY_RARITY_RAW);

// ============================================================================================
// Opponents
// ============================================================================================

/**
 * unspecified — PLAN.md: "bot accuracy tracks the player's recent accuracy" (AC-8, corrected:
 * >= 10 so T-021's mercy tracking has a real history to average rather than degenerating to a
 * coin flip on the last answer).
 */
export const BOT_ACCURACY_WINDOW = 10;

/**
 * unspecified — PLAN.md: bot accuracy tracks the player's "minus a margin" (AC-8: strictly
 * inside (0,1), and large enough to move the bot by at least one answer out of the tracked
 * window — the smallest perceptible change).
 */
export const BOT_MERCY_MARGIN = 0.15;

const BOT_ACCURACY_BAND_BY_GRADE_RAW: Record<GradeBand, { min: number; max: number }> = {
  // unspecified — PLAN.md: grade-banded bot accuracy, no numbers given (AC-8: 0 < min < max <=
  // 1, non-decreasing min and max across k_1 -> g2_3 -> g4_5 — an older band's bot is never
  // easier than a younger band's).
  k_1: { min: 0.5, max: 0.7 },
  g2_3: { min: 0.55, max: 0.75 },
  g4_5: { min: 0.6, max: 0.8 },
};
/** Bot accuracy band per grade band (AC-8). */
export const BOT_ACCURACY_BAND_BY_GRADE: Readonly<
  Record<GradeBand, { readonly min: number; readonly max: number }>
> = deepFreeze(BOT_ACCURACY_BAND_BY_GRADE_RAW);

/** PLAN.md §Questions/opponents: "after two straight losses the next rival misfires twice". */
export const MERCY_LOSS_STREAK_TRIGGER = 2;

/** PLAN.md §Questions/opponents: "the next rival misfires twice". */
export const MERCY_FORCED_MISFIRES = 2;

// ============================================================================================
// Loadout / tray
// ============================================================================================

/**
 * PLAN.md §The armory — the duel tray shows a subset of owned cannons.
 * Design / T-030 Context: tray capacity is 3 (gun deck board 4d; A-011).
 */
export const TRAY_CAPACITY = 3;
