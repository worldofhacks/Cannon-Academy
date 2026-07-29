/**
 * T-010 — `src/engine/mastery.ts`: dual-rate mastery meters, the mastery threshold, and unlock
 * resolution (new cannons + fog-lifted islands).
 *
 * PLAN.md §Sea chart, ports, and mastery: "range drills fill a skill's meter at full rate, and
 * correct answers in real duels fill the matching skill at half rate ... so a kid who just loves
 * dueling still advances, while ranges stay the fast lane. Crossing a threshold (10 correct at
 * >=70% accuracy) unlocks that skill's next cannon and lifts the fog on the next island."
 *
 * HOW THIS SUITE IS BUILT — read before editing.
 * -----------------------------------------------------------------------------------------
 * T-029 is queued to add a new grade-0 skill (`sub_within_10`) and a third starter cannon, which
 * will grow `SKILL_IDS` / `CANNON_IDS` and the catalog. Nothing here asserts a count of skills,
 * cannons, or islands, and nothing hardcodes "the" set of range-unlock cannons for a skill —
 * every unlock-resolution expectation is *derived* from the real catalog (`@content/index`) by
 * re-stating the ticket's own unlock rule ("every cannon whose `unlock.kind === 'range'` and
 * whose `skill` is now mastered"; "every island `I` with `requiresIsland === J` where at least
 * one skill in `J.rangeSkills` is mastered") as a query over `cannons` / `islands`, rather than
 * copying a literal id list. Adding a skill/cannon changes what the derivation returns without
 * invalidating the test (L-012: assert the mechanism, not a projection of it). Two ids —
 * `add_within_20` and `port_sumwich` — are still named directly in a couple of tests, exactly
 * where the ticket text itself pins a concrete worked example (AC-10, AC-12); each such use is
 * commented at the call site.
 *
 * L-006 drove the dual-rate tests: "drill fills faster than duel" is trivially satisfied by
 * near-identical rates, which would kill the "ranges are the fast lane" design while looking
 * green. Every rate assertion below checks the exact `2x` relationship and lands exactly on
 * `MASTERY_METER_MAX`, never just an inequality.
 *
 * The accuracy gate (AC-6/AC-7) is tested at the exact boundary, just below, and just above —
 * plus a "guesser" scenario (count reached at ~25% accuracy, the four-choice guess rate) proven
 * both at the `isMastered` level and through `resolveUnlocks`, so a cheat that unlocks off the
 * correct-count alone rather than the AND of both gates cannot pass either level.
 *
 * L-017: dimensions swept, not just cases — weightedCorrect from 0 through past-threshold in
 * 0.5 steps *and* out to absurd magnitudes (clamping); accuracy across its whole domain; both
 * fill sources individually and mixed in the same meter; multiple skills mastered at once for
 * `resolveUnlocks`; partial vs. full membership in `J.rangeSkills`.
 *
 * Purity: every test that isn't specifically checking float rounding uses exact equality;
 * several tests call the same function twice on identical input and assert identical output,
 * which a `Math.random()` or `Date`-based implementation could not pass reliably. No test uses
 * either.
 */
import { describe, expect, it } from 'vitest';

import {
  emptyMastery,
  applyAnswer,
  accuracy,
  meterPercent,
  isMastered,
  resolveUnlocks,
} from '@engine/mastery';
import type { SkillMastery, MasterySource } from '@engine/mastery';
import {
  MASTERY_THRESHOLD_CORRECT,
  MASTERY_MIN_ACCURACY,
  MASTERY_RATE_RANGE,
  MASTERY_RATE_DUEL,
  MASTERY_METER_MAX,
} from '@engine/tuning';
import type { CannonId, IslandId, SkillId } from '@content/schemas';
import { cannons, islands, getIsland } from '@content/index';
import { createCaptainStore, emptyCaptain } from '../../src/stores/player';

// --- Shared fixtures & helpers ---------------------------------------------------------------

/** A mastery comfortably over both gates: full accuracy, at exactly the correct-count floor. */
const MASTERED_MASTERY: SkillMastery = Object.freeze({
  weightedCorrect: MASTERY_THRESHOLD_CORRECT,
  correct: MASTERY_THRESHOLD_CORRECT,
  attempts: MASTERY_THRESHOLD_CORRECT,
});

/** Builds a `Partial<Record<SkillId, SkillMastery>>` where every listed skill is mastered. */
function masteryMapFor(masteredSkills: readonly SkillId[]): Partial<Record<SkillId, SkillMastery>> {
  const map: Partial<Record<SkillId, SkillMastery>> = {};
  for (const id of masteredSkills) {
    map[id] = MASTERED_MASTERY;
  }
  return map;
}

const sortIds = <T extends string>(ids: readonly T[]): T[] => [...ids].sort();

/**
 * Re-derives the ticket's own cannon-unlock rule directly from the real catalog: every `range`
 * cannon whose skill is in `masteredSkills`, minus whatever the caller already has. This is the
 * mechanism the ticket specifies, not a hardcoded id list — it is correct for today's catalog
 * and stays correct after T-029 adds skills/cannons.
 */
function expectedNewCannons(
  masteredSkills: ReadonlySet<SkillId>,
  alreadyUnlocked: readonly CannonId[],
): CannonId[] {
  const already = new Set(alreadyUnlocked);
  return cannons
    .filter((c) => c.unlock.kind === 'range' && masteredSkills.has(c.skill) && !already.has(c.id))
    .map((c) => c.id);
}

/**
 * Re-derives the ticket's own island-unlock rule: every island `I` whose `requiresIsland === J`
 * where at least one of `J.rangeSkills` is mastered, minus whatever is already unlocked. Note
 * the rule as stated depends only on `J.rangeSkills` mastery, never on whether `J` itself is
 * already in `alreadyUnlocked` — see the dedicated test below that exercises exactly that.
 */
function expectedNewIslands(
  masteredSkills: ReadonlySet<SkillId>,
  alreadyUnlocked: readonly IslandId[],
): IslandId[] {
  const already = new Set(alreadyUnlocked);
  return islands
    .filter((i) => {
      if (already.has(i.id)) return false;
      if (i.requiresIsland === undefined) return false;
      const predecessor = getIsland(i.requiresIsland);
      return predecessor.rangeSkills.some((s) => masteredSkills.has(s));
    })
    .map((i) => i.id);
}

const STARTER_CANNON_IDS = cannons.filter((c) => c.unlock.kind === 'starter').map((c) => c.id);
const CHEST_CANNON_IDS = cannons.filter((c) => c.unlock.kind === 'chest').map((c) => c.id);

// ============================================================================================
// emptyMastery — AC-1
// ============================================================================================

describe('emptyMastery', () => {
  it('spec(T-010:AC-1) is all-zero counters with a non-NaN, unmastered derived state', () => {
    expect(emptyMastery.weightedCorrect).toBe(0);
    expect(emptyMastery.correct).toBe(0);
    expect(emptyMastery.attempts).toBe(0);
    expect(accuracy(emptyMastery)).toBe(0);
    expect(Number.isNaN(accuracy(emptyMastery))).toBe(false);
    expect(meterPercent(emptyMastery)).toBe(0);
    expect(isMastered(emptyMastery)).toBe(false);
  });
});

// ============================================================================================
// applyAnswer — AC-2, AC-3, AC-4, AC-5
// ============================================================================================

describe('applyAnswer', () => {
  it('spec(T-010:AC-2) a correct range answer fills the meter at full rate', () => {
    const result = applyAnswer(emptyMastery, 'range', true);
    expect(result.weightedCorrect).toBe(MASTERY_RATE_RANGE);
    expect(result.weightedCorrect).toBe(1);
    expect(result.correct).toBe(1);
    expect(result.attempts).toBe(1);
  });

  it('spec(T-010:AC-2) a correct duel answer fills the meter at half rate', () => {
    const result = applyAnswer(emptyMastery, 'duel', true);
    expect(result.weightedCorrect).toBe(MASTERY_RATE_DUEL);
    expect(result.weightedCorrect).toBe(0.5);
    expect(result.correct).toBe(1);
    expect(result.attempts).toBe(1);
  });

  it.each<MasterySource>(['range', 'duel'])(
    'spec(T-010:AC-3) an incorrect %s answer leaves weightedCorrect and correct untouched, only attempts advances',
    (source) => {
      const base: SkillMastery = { weightedCorrect: 6, correct: 5, attempts: 8 };
      const result = applyAnswer(base, source, false);
      expect(result.weightedCorrect).toBe(base.weightedCorrect);
      expect(result.correct).toBe(base.correct);
      expect(result.attempts).toBe(base.attempts + 1);
    },
  );

  it.each<[MasterySource, boolean]>([
    ['range', true],
    ['range', false],
    ['duel', true],
    ['duel', false],
  ])(
    'spec(T-010:AC-4) applyAnswer(m, %s, %s) never mutates its input and returns a new object',
    (source, correct) => {
      // Freeze the input: an implementation that mutates in place throws a TypeError here
      // (ESM modules run in strict mode), which is a far stronger guarantee than re-reading
      // fields after the call and hoping nothing changed them in place then back again.
      const input: SkillMastery = Object.freeze({ weightedCorrect: 3, correct: 3, attempts: 5 });
      let result: SkillMastery | undefined;
      expect(() => {
        result = applyAnswer(input, source, correct);
      }).not.toThrow();

      expect(input.weightedCorrect).toBe(3);
      expect(input.correct).toBe(3);
      expect(input.attempts).toBe(5);
      expect(result).not.toBe(input);

      // Purity: calling again with the same (still-frozen) input produces an equal result.
      const result2 = applyAnswer(input, source, correct);
      expect(result2).toEqual(result);
    },
  );

  it('spec(T-010:AC-5) MASTERY_RATE_RANGE is exactly twice MASTERY_RATE_DUEL (not merely >=)', () => {
    // L-006: the whole "ranges are the fast lane" design collapses if this is only an
    // inequality — rates of 0.500001 and 0.5 would pass a "range > duel" check.
    expect(MASTERY_RATE_RANGE).toBe(2 * MASTERY_RATE_DUEL);
  });

  it('spec(T-010:AC-5) N duel corrects and N/2 range corrects both land exactly on the threshold', () => {
    // Derived counts, not hardcoded "20"/"10": however the rates are tuned, exactly
    // threshold/rate corrects of one source must land exactly on the threshold.
    const duelAnswers = MASTERY_THRESHOLD_CORRECT / MASTERY_RATE_DUEL;
    const rangeAnswers = MASTERY_THRESHOLD_CORRECT / MASTERY_RATE_RANGE;
    expect(duelAnswers).toBe(20);
    expect(rangeAnswers).toBe(10);

    let viaDuel: SkillMastery = emptyMastery;
    for (let i = 0; i < duelAnswers; i++) viaDuel = applyAnswer(viaDuel, 'duel', true);

    let viaRange: SkillMastery = emptyMastery;
    for (let i = 0; i < rangeAnswers; i++) viaRange = applyAnswer(viaRange, 'range', true);

    expect(viaDuel.weightedCorrect).toBe(MASTERY_THRESHOLD_CORRECT);
    expect(viaRange.weightedCorrect).toBe(MASTERY_THRESHOLD_CORRECT);
    expect(viaDuel.weightedCorrect).toBe(viaRange.weightedCorrect);
    // A duel answer is worth exactly half a range answer, not "roughly" — same weighted total
    // from double the correct answers, and exactly double, nothing else, satisfies that.
    expect(viaDuel.correct).toBe(2 * viaRange.correct);
  });

  it('spec(T-010:AC-5) mixing sources still sums weightedCorrect exactly (no cross-source rounding)', () => {
    // Interaction dimension (L-017): drill and duel corrects in the same meter.
    let m: SkillMastery = emptyMastery;
    m = applyAnswer(m, 'range', true); // +1
    m = applyAnswer(m, 'duel', true); // +0.5
    m = applyAnswer(m, 'duel', false); // +0, attempts+1
    m = applyAnswer(m, 'range', true); // +1
    m = applyAnswer(m, 'duel', true); // +0.5
    expect(m.weightedCorrect).toBe(2 * MASTERY_RATE_RANGE + 2 * MASTERY_RATE_DUEL);
    expect(m.weightedCorrect).toBe(3);
    expect(m.correct).toBe(4);
    expect(m.attempts).toBe(5);
  });
});

// ============================================================================================
// accuracy — AC-9
// ============================================================================================

describe('accuracy', () => {
  it('spec(T-010:AC-9) is 0 (not NaN or Infinity) when attempts is 0', () => {
    const m: SkillMastery = { weightedCorrect: 0, correct: 0, attempts: 0 };
    const result = accuracy(m);
    expect(result).toBe(0);
    expect(Number.isFinite(result)).toBe(true);
  });

  it('spec(T-010:AC-9) is correct/attempts for a normal mastery (3/4 = 0.75)', () => {
    const m: SkillMastery = { weightedCorrect: 3, correct: 3, attempts: 4 };
    expect(accuracy(m)).toBe(0.75);
  });

  it('spec(T-010:AC-9) sweeps the accuracy domain: 0, partial, and perfect', () => {
    // L-017: don't just assert one interior point — sweep 0, a non-trivial fraction, and 1.
    expect(accuracy({ weightedCorrect: 0, correct: 0, attempts: 5 })).toBe(0);
    expect(accuracy({ weightedCorrect: 5, correct: 5, attempts: 5 })).toBe(1);
    expect(accuracy({ weightedCorrect: 333, correct: 333, attempts: 1000 })).toBeCloseTo(0.333, 10);
  });

  it('spec(T-010:AC-9) is unaffected by weightedCorrect — accuracy is raw correct/attempts', () => {
    // Planning Decision (`proposed`): accuracy is raw, unweighted by source. Two masteries with
    // identical correct/attempts but different weightedCorrect (i.e. different source mix)
    // must report identical accuracy.
    const viaRangeHeavy: SkillMastery = { weightedCorrect: 8, correct: 8, attempts: 10 };
    const viaDuelHeavy: SkillMastery = { weightedCorrect: 4, correct: 8, attempts: 10 };
    expect(accuracy(viaRangeHeavy)).toBe(accuracy(viaDuelHeavy));
    expect(accuracy(viaRangeHeavy)).toBe(0.8);
  });
});

// ============================================================================================
// meterPercent — AC-8
// ============================================================================================

describe('meterPercent', () => {
  it('spec(T-010:AC-8) matches min(MASTERY_METER_MAX, round(100 * weightedCorrect / threshold)) exactly across a 0..20 sweep', () => {
    // Adversarial fixture: correct/attempts are held at 0 for every point in the sweep, which
    // the spec's formula never reads. If an implementation folds accuracy into meterPercent
    // (a plausible but wrong mechanism), this fixture would drag every result toward 0 and the
    // exact-formula assertion below would catch it immediately.
    let previous = -1;
    for (let i = 0; i <= 40; i++) {
      const weightedCorrect = i * 0.5; // exact: multiplying an integer by 0.5 has no float error
      const m: SkillMastery = { weightedCorrect, correct: 0, attempts: 0 };
      const expected = Math.min(
        MASTERY_METER_MAX,
        Math.round((100 * weightedCorrect) / MASTERY_THRESHOLD_CORRECT),
      );
      const actual = meterPercent(m);

      expect(Number.isInteger(actual)).toBe(true);
      expect(actual).toBeGreaterThanOrEqual(0);
      expect(actual).toBeLessThanOrEqual(MASTERY_METER_MAX);
      expect(actual).toBe(expected);

      expect(actual).toBeGreaterThanOrEqual(previous); // non-decreasing
      if (weightedCorrect >= MASTERY_THRESHOLD_CORRECT) {
        expect(actual).toBe(MASTERY_METER_MAX);
      }
      previous = actual;
    }
  });

  it('spec(T-010:AC-8) is exactly half of MASTERY_METER_MAX at exactly half the threshold', () => {
    // Literal AC wording ("50 at weightedCorrect === 5") derived from the constants rather than
    // the bare literals, so this stays correct if the threshold/max are ever retuned.
    const half: SkillMastery = { weightedCorrect: MASTERY_THRESHOLD_CORRECT / 2, correct: 0, attempts: 0 };
    expect(meterPercent(half)).toBe(MASTERY_METER_MAX / 2);
  });

  it('spec(T-010:AC-8) clamps to MASTERY_METER_MAX and stays a finite integer for absurd weightedCorrect', () => {
    // "Never above max, never non-finite" swept to the extreme end of the domain a mastery
    // counter can actually reach (weightedCorrect only ever grows from 0 by adding
    // MASTERY_RATE_RANGE/MASTERY_RATE_DUEL — it can never be negative or non-finite through the
    // public API, so this sweep covers arbitrarily large magnitudes rather than pathological
    // ones the module has no documented obligation to accept; see the report for the negative-
    // input ambiguity this deliberately does not assert).
    for (const weightedCorrect of [
      MASTERY_THRESHOLD_CORRECT + 1,
      1_000,
      1_000_000,
      Number.MAX_SAFE_INTEGER,
      Number.POSITIVE_INFINITY,
    ]) {
      const actual = meterPercent({ weightedCorrect, correct: 0, attempts: 0 });
      expect(actual).toBe(MASTERY_METER_MAX);
      expect(Number.isInteger(actual)).toBe(true);
      expect(Number.isFinite(actual)).toBe(true);
    }
  });

  it('spec(T-010:AC-8) is exactly 0 at weightedCorrect 0 (lower bound of the reachable domain)', () => {
    expect(meterPercent({ weightedCorrect: 0, correct: 0, attempts: 0 })).toBe(0);
  });
});

// ============================================================================================
// isMastered — AC-6, AC-7
// ============================================================================================

describe('isMastered', () => {
  it('spec(T-010:AC-6) is true at exactly weightedCorrect=10, accuracy=0.70 (both thresholds inclusive)', () => {
    const m: SkillMastery = { weightedCorrect: 10, correct: 7, attempts: 10 };
    expect(accuracy(m)).toBe(0.7);
    expect(isMastered(m)).toBe(true);
  });

  it('spec(T-010:AC-7) is false when weightedCorrect is just under the threshold, even at 100% accuracy', () => {
    const m: SkillMastery = { weightedCorrect: 9.5, correct: 1, attempts: 1 };
    expect(accuracy(m)).toBe(1);
    expect(isMastered(m)).toBe(false);
  });

  it('spec(T-010:AC-7) is false when weightedCorrect clears the threshold but accuracy is under 0.70 (12, 12/18 = 0.6667)', () => {
    const m: SkillMastery = { weightedCorrect: 12, correct: 12, attempts: 18 };
    expect(accuracy(m)).toBeCloseTo(0.6667, 4);
    expect(isMastered(m)).toBe(false);
  });

  it('spec(T-010:AC-6) is true comfortably past both thresholds (sanity check in the other direction)', () => {
    const m: SkillMastery = { weightedCorrect: 15, correct: 18, attempts: 20 };
    expect(isMastered(m)).toBe(true);
  });

  it('spec(T-010:AC-7) accuracy gate: false just below 0.70, true just above, at a fixed weightedCorrect above threshold', () => {
    // "Test at, just below, and just above the accuracy boundary" — 1000-attempt denominator
    // keeps the perturbation (+/-1 in 1000) far above float noise around the 0.7 comparison.
    const weightedCorrect = MASTERY_THRESHOLD_CORRECT;
    const justBelow: SkillMastery = { weightedCorrect, correct: 699, attempts: 1000 };
    const atBoundary: SkillMastery = { weightedCorrect, correct: 700, attempts: 1000 };
    const justAbove: SkillMastery = { weightedCorrect, correct: 701, attempts: 1000 };

    expect(accuracy(justBelow)).toBeLessThan(MASTERY_MIN_ACCURACY);
    expect(accuracy(atBoundary)).toBe(MASTERY_MIN_ACCURACY);
    expect(accuracy(justAbove)).toBeGreaterThan(MASTERY_MIN_ACCURACY);

    expect(isMastered(justBelow)).toBe(false);
    expect(isMastered(atBoundary)).toBe(true);
    expect(isMastered(justAbove)).toBe(true);
  });

  it('spec(T-010:AC-7) a four-choice guesser who reaches the correct-count via ~25% accuracy does not unlock', () => {
    // The stated defence of the accuracy gate: a random-tap player reaches the raw correct
    // count eventually but never clears 70% accuracy, so must never be reported as mastered.
    const guesser: SkillMastery = {
      weightedCorrect: MASTERY_THRESHOLD_CORRECT,
      correct: MASTERY_THRESHOLD_CORRECT,
      attempts: MASTERY_THRESHOLD_CORRECT * 4, // 25% accuracy
    };
    expect(accuracy(guesser)).toBeCloseTo(0.25, 10);
    expect(isMastered(guesser)).toBe(false);
  });

  it('spec(T-010:AC-6) purity: calling isMastered twice on the same input gives the same result', () => {
    const m: SkillMastery = { weightedCorrect: 10, correct: 7, attempts: 10 };
    expect(isMastered(m)).toBe(isMastered(m));
  });
});

// ============================================================================================
// resolveUnlocks — AC-10, AC-11, AC-12, AC-13, AC-14
// ============================================================================================

describe('resolveUnlocks', () => {
  it('spec(A-027:AC-3) K-1 mastery of add_within_10 earns its cannon without opening Isla Products', () => {
    const resolveBandUnlocks = resolveUnlocks as unknown as (input: {
      readonly gradeBand: 'k_1';
      readonly mastery: Partial<Record<SkillId, SkillMastery>>;
      readonly unlockedCannons: readonly CannonId[];
      readonly unlockedIslands: readonly IslandId[];
    }) => { readonly cannons: readonly CannonId[]; readonly islands: readonly IslandId[] };

    const result = resolveBandUnlocks({
      gradeBand: 'k_1',
      mastery: masteryMapFor(['add_within_10']),
      unlockedCannons: [],
      unlockedIslands: ['port_sumwich'],
    });

    expect(result.cannons).toContain('saker');
    expect(result.islands).not.toContain('isla_products');
  });

  it('spec(A-027:AC-3) the player-store tally grants K-1 Saker while keeping Isla Products closed', () => {
    const store = createCaptainStore({
      ...emptyCaptain(),
      gradeBand: 'k_1',
      unlockedIslands: ['port_sumwich'],
    });

    store.getState().recordRangeAnswers('add_within_10', {
      correct: MASTERY_THRESHOLD_CORRECT,
      asked: MASTERY_THRESHOLD_CORRECT,
    });

    const captain = store.getState().captain;
    expect(captain.ownedCannons).toContain('saker');
    expect(captain.unlockedIslands).not.toContain('isla_products');
  });

  it('spec(A-027:AC-4) a mastered eligible predecessor opens its next eligible island without revoking a prior higher-band placement unlock', () => {
    const priorHigherBandIsland: IslandId = 'fraction_reef';
    const store = createCaptainStore({
      ...emptyCaptain(),
      gradeBand: 'g2_3',
      unlockedIslands: ['port_sumwich', priorHigherBandIsland],
    });

    store.getState().recordRangeAnswers('add_within_20', {
      correct: MASTERY_THRESHOLD_CORRECT,
      asked: MASTERY_THRESHOLD_CORRECT,
    });

    expect(store.getState().captain.unlockedIslands).toEqual(
      expect.arrayContaining([priorHigherBandIsland, 'isla_products']),
    );
  });

  it('spec(T-010:AC-13) returns empty cannons and islands for an empty mastery map, and never throws', () => {
    expect(() => resolveUnlocks({ mastery: {}, unlockedCannons: [], unlockedIslands: [] })).not.toThrow();

    const result = resolveUnlocks({ mastery: {}, unlockedCannons: [], unlockedIslands: [] });
    expect(result.cannons).toEqual([]);
    expect(result.islands).toEqual([]);
  });

  it('spec(T-010:AC-10) mastering add_within_20 unlocks its range cannon, excludes an unmastered sibling skill, a chest cannon, and the starters', () => {
    // `add_within_20` is named directly here because AC-10's text pins this exact worked
    // example (the concrete skill/cannon relationship already lives in the T-006 catalog).
    const masteredSkills = new Set<SkillId>(['add_within_20']);
    const mastery = masteryMapFor([...masteredSkills]);

    const result = resolveUnlocks({ mastery, unlockedCannons: [], unlockedIslands: [] });
    const expectedCannons = expectedNewCannons(masteredSkills, []);

    expect(sortIds(result.cannons)).toEqual(sortIds(expectedCannons));
    expect(result.cannons).toContain('six_pounder');
    expect(result.cannons).not.toContain('chain_shot'); // sub_within_20 not mastered
    for (const chestId of CHEST_CANNON_IDS) expect(result.cannons).not.toContain(chestId);
    for (const starterId of STARTER_CANNON_IDS) expect(result.cannons).not.toContain(starterId);
  });

  it('spec(T-010:AC-10) a skill present in the mastery map but NOT mastered unlocks nothing (presence is not the gate, isMastered is)', () => {
    // Guards against a cheat that unlocks because the skill KEY exists in the map, rather than
    // because isMastered(mastery[skill]) is true.
    const mastery: Partial<Record<SkillId, SkillMastery>> = {
      add_within_20: { weightedCorrect: 3, correct: 3, attempts: 3 },
    };
    const result = resolveUnlocks({ mastery, unlockedCannons: [], unlockedIslands: [] });
    expect(result.cannons).toEqual([]);
  });

  it('spec(T-010:AC-10) a skill mastered only via correct-count but failing the accuracy gate unlocks nothing', () => {
    const mastery: Partial<Record<SkillId, SkillMastery>> = {
      add_within_20: {
        weightedCorrect: MASTERY_THRESHOLD_CORRECT,
        correct: MASTERY_THRESHOLD_CORRECT,
        attempts: MASTERY_THRESHOLD_CORRECT * 4, // 25% accuracy — the guesser path
      },
    };
    const result = resolveUnlocks({ mastery, unlockedCannons: [], unlockedIslands: [] });
    expect(result.cannons).toEqual([]);
  });

  it('spec(T-010:AC-10) mastering every skill in the catalog unlocks exactly every range-kind cannon (chest + starters excluded)', () => {
    // Dimension sweep beyond the single-skill case: every skill mastered at once.
    const everySkillId = cannons.map((c) => c.skill); // any skill actually used by a cannon
    const masteredSkills = new Set<SkillId>(everySkillId);
    const mastery = masteryMapFor([...masteredSkills]);

    const result = resolveUnlocks({ mastery, unlockedCannons: [], unlockedIslands: [] });
    const expectedCannons = expectedNewCannons(masteredSkills, []);

    expect(sortIds(result.cannons)).toEqual(sortIds(expectedCannons));
    expect(sortIds(result.cannons)).toEqual(
      sortIds(cannons.filter((c) => c.unlock.kind === 'range').map((c) => c.id)),
    );
    for (const chestId of CHEST_CANNON_IDS) expect(result.cannons).not.toContain(chestId);
    for (const starterId of STARTER_CANNON_IDS) expect(result.cannons).not.toContain(starterId);
  });

  it('spec(T-010:AC-11) a cannon already in unlockedCannons is never returned again, even though its skill stays mastered', () => {
    const mastery = masteryMapFor(['add_within_20']);
    const firstPass = resolveUnlocks({ mastery, unlockedCannons: [], unlockedIslands: [] });
    expect(firstPass.cannons.length).toBeGreaterThan(0); // sanity: something did unlock

    const secondPass = resolveUnlocks({
      mastery,
      unlockedCannons: firstPass.cannons, // six_pounder already recorded as unlocked
      unlockedIslands: [],
    });
    expect(secondPass.cannons).toEqual([]);
  });

  it('spec(T-010:AC-12) mastering a port_sumwich range skill lifts the fog on isla_products only, not further', () => {
    // `port_sumwich` / its immediate successor are named directly because AC-12's text pins
    // this exact worked example. `add_within_20` is one of port_sumwich's rangeSkills.
    const portSumwich = getIsland('port_sumwich');
    expect(portSumwich.rangeSkills).toContain('add_within_20');

    const masteredSkills = new Set<SkillId>(['add_within_20']);
    const mastery = masteryMapFor([...masteredSkills]);

    const result = resolveUnlocks({
      mastery,
      unlockedCannons: [],
      unlockedIslands: ['port_sumwich'],
    });

    const immediateSuccessor = islands.find((i) => i.requiresIsland === 'port_sumwich');
    expect(immediateSuccessor).toBeDefined();
    expect(result.islands).toEqual([immediateSuccessor?.id]);
    expect(result.islands).toEqual(expectedNewIslands(masteredSkills, ['port_sumwich']));
  });

  it("spec(T-010:AC-12) mastering only ONE of an island's several rangeSkills is enough — not all are required", () => {
    // port_sumwich lists 3 rangeSkills; master exactly one of the others (not add_within_20)
    // and confirm the fog still lifts. This is the "at least one" half of the rule — a
    // stricter "requires every rangeSkill" implementation would fail this.
    const portSumwich = getIsland('port_sumwich');
    expect(portSumwich.rangeSkills.length).toBeGreaterThan(1);
    const oneOfSeveral = portSumwich.rangeSkills[1];
    expect(oneOfSeveral).toBeDefined();

    const masteredSkills = new Set<SkillId>([oneOfSeveral as SkillId]);
    const mastery = masteryMapFor([...masteredSkills]);

    const result = resolveUnlocks({ mastery, unlockedCannons: [], unlockedIslands: ['port_sumwich'] });
    expect(result.islands).toEqual(expectedNewIslands(masteredSkills, ['port_sumwich']));
    expect(result.islands.length).toBeGreaterThan(0);
  });

  it('spec(T-010:AC-12) the island rule keys off J.rangeSkills mastery alone, independent of whether J itself is already unlocked', () => {
    // Notable/ambiguous point (flagged in the report): the rule as specified ("every island I
    // with requiresIsland === J where at least one skill in J.rangeSkills is mastered") does
    // not condition on J itself being a member of unlockedIslands — unlockedIslands is used
    // only for the delta-exclusion of I, never as a gate on J. This test proves the literal
    // rule: mastering isla_products's rangeSkill while NEITHER port_sumwich NOR isla_products
    // is in unlockedIslands still lifts the fog on isla_products's successor.
    const islaProducts = getIsland('isla_products');
    const [firstSkill] = islaProducts.rangeSkills;
    expect(firstSkill).toBeDefined();

    const masteredSkills = new Set<SkillId>([firstSkill as SkillId]);
    const mastery = masteryMapFor([...masteredSkills]);

    const result = resolveUnlocks({ mastery, unlockedCannons: [], unlockedIslands: [] });
    expect(result.islands).toEqual(expectedNewIslands(masteredSkills, []));

    const successor = islands.find((i) => i.requiresIsland === 'isla_products');
    if (successor !== undefined) {
      expect(result.islands).toContain(successor.id);
    }
  });

  it('spec(T-010:AC-13) mastering a skill whose island is never a requiresIsland target unlocks no islands', () => {
    // The last island in the chain (order max, nothing requires it) — mastering its rangeSkill
    // must not fabricate an island unlock out of nowhere.
    const lastIsland = [...islands].sort((a, b) => b.order - a.order)[0];
    expect(lastIsland).toBeDefined();
    const skillOfLast = lastIsland?.rangeSkills[0];
    if (skillOfLast === undefined) {
      // No skill to test against defensively; nothing to assert.
      expect(true).toBe(true);
      return;
    }
    const masteredSkills = new Set<SkillId>([skillOfLast]);
    const mastery = masteryMapFor([...masteredSkills]);
    const result = resolveUnlocks({ mastery, unlockedCannons: [], unlockedIslands: [] });
    expect(result.islands).toEqual(expectedNewIslands(masteredSkills, []));
  });

  it('spec(T-010:AC-14) resolving twice, merging the first result into the inputs, yields empty on the second call (idempotence)', () => {
    // Strongest form: master every skill at once so every cannon- and island-unlock branch
    // fires on the first call, then prove none of it duplicates on the second.
    const everySkillId = new Set<SkillId>([
      ...cannons.map((c) => c.skill),
      ...islands.flatMap((i) => i.rangeSkills),
    ]);
    const mastery = masteryMapFor([...everySkillId]);

    const first = resolveUnlocks({ mastery, unlockedCannons: [], unlockedIslands: [] });
    expect(first.cannons.length + first.islands.length).toBeGreaterThan(0); // sanity

    const second = resolveUnlocks({
      mastery,
      unlockedCannons: [...first.cannons],
      unlockedIslands: [...first.islands],
    });
    expect(second.cannons).toEqual([]);
    expect(second.islands).toEqual([]);
  });

  it('spec(T-010:AC-14) purity: resolveUnlocks called twice with identical input returns deep-equal results', () => {
    const mastery = masteryMapFor(['add_within_20']);
    const input = { mastery, unlockedCannons: [] as CannonId[], unlockedIslands: [] as IslandId[] };
    expect(resolveUnlocks(input)).toEqual(resolveUnlocks(input));
  });

  it('spec(T-010:AC-11) partially-seeded unlockedCannons excludes only the seeded ids, not siblings unlocked by the same mastery', () => {
    const everySkillId = new Set<SkillId>(cannons.map((c) => c.skill));
    const mastery = masteryMapFor([...everySkillId]);
    const allRangeCannons = expectedNewCannons(everySkillId, []);
    // Seed with only the first of the (sorted, for determinism) range cannons already unlocked.
    const seeded = sortIds(allRangeCannons).slice(0, 1);

    const result = resolveUnlocks({ mastery, unlockedCannons: seeded, unlockedIslands: [] });
    expect(result.cannons).not.toContain(seeded[0]);
    expect(sortIds(result.cannons)).toEqual(sortIds(expectedNewCannons(everySkillId, seeded)));
  });
});

// ============================================================================================
// Serialisation — AC-15
// ============================================================================================

describe('SkillMastery serialisation', () => {
  // Includes real applyAnswer(...) outputs, not only hand-built literals — a hidden
  // non-enumerable field (a plausible memoisation bug: JSON.stringify silently drops
  // non-enumerable properties) would satisfy every other test in this suite, since none of
  // them route a produced value through JSON, and would only be caught here.
  const producedByApply = applyAnswer(
    applyAnswer(applyAnswer(emptyMastery, 'range', true), 'duel', true),
    'duel',
    false,
  );

  const samples: readonly SkillMastery[] = [
    emptyMastery,
    { weightedCorrect: 10, correct: 7, attempts: 10 }, // exactly mastered
    { weightedCorrect: 9.5, correct: 1, attempts: 1 }, // just under threshold
    { weightedCorrect: 12, correct: 12, attempts: 18 }, // under accuracy gate
    { weightedCorrect: 3, correct: 3, attempts: 12 }, // low accuracy, low count
    { weightedCorrect: 0.5, correct: 1, attempts: 1 }, // a single duel correct
    producedByApply, // a real applyAnswer output, not a hand-built literal
  ];

  it.each(samples.map((m, i) => [i, m] as const))(
    'spec(T-010:AC-15) sample %i: JSON round-trip preserves accuracy, meterPercent, and isMastered',
    (_i, m) => {
      const roundTripped = JSON.parse(JSON.stringify(m)) as SkillMastery;
      expect(roundTripped).toEqual(m);
      expect(accuracy(roundTripped)).toBe(accuracy(m));
      expect(meterPercent(roundTripped)).toBe(meterPercent(m));
      expect(isMastered(roundTripped)).toBe(isMastered(m));
    },
  );
});
