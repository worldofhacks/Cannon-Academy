/**
 * Dual-rate mastery meters, the mastery threshold, and unlock resolution (T-010).
 *
 * PLAN.md §Sea chart, ports, and mastery: range drills fill a skill's meter at full rate;
 * correct answers in real duels fill the matching skill at half rate — so a duel-only player
 * still advances, just more slowly. Crossing a threshold (`MASTERY_THRESHOLD_CORRECT` weighted
 * corrects at `>= MASTERY_MIN_ACCURACY` accuracy) unlocks that skill's next cannon and lifts the
 * fog on the next island.
 *
 * Mastery is stored as raw counters (`weightedCorrect`, `correct`, `attempts`); the 0-100 meter
 * and the boolean threshold check are both derived from those counters, never stored themselves
 * (ARCHITECTURE.md §5 persists the derived 0-100 percentage; deriving it here keeps the
 * threshold check exact).
 *
 * `resolveUnlocks`'s island rule is deliberately literal (ticket's pre-freeze note): it reads
 * `unlockedIslands` only to exclude already-unlocked candidates from the returned delta, never
 * as a precondition that the predecessor island itself is unlocked. Do not add that precondition
 * — a frozen test pins the literal reading.
 */
import { cannons, getIsland, getSkill, islands } from '@content/index';
import type { CannonId, GradeBand, IslandId, SkillId } from '@content/schemas';
import { maxGradeForBand } from '@engine/placement';
import {
  MASTERY_METER_MAX,
  MASTERY_MIN_ACCURACY,
  MASTERY_RATE_DUEL,
  MASTERY_RATE_RANGE,
  MASTERY_THRESHOLD_CORRECT,
} from '@engine/tuning';

/** A single skill's mastery counters. Plain and serialisable — no methods, no derived fields. */
export interface SkillMastery {
  /** Weighted correct-answer total: range answers count `MASTERY_RATE_RANGE`, duel answers count `MASTERY_RATE_DUEL`. */
  readonly weightedCorrect: number;
  /** Raw correct-answer count, for accuracy. */
  readonly correct: number;
  /** Raw attempt count, for accuracy. */
  readonly attempts: number;
}

/** Where an answer feeding `applyAnswer` came from. */
export type MasterySource = 'range' | 'duel';

/** The zero-state mastery for a skill nothing has been attempted on yet. Frozen: never mutate. */
export const emptyMastery: SkillMastery = Object.freeze({
  weightedCorrect: 0,
  correct: 0,
  attempts: 0,
});

/**
 * Folds one answer into a mastery, returning a new `SkillMastery` — never mutates `m`.
 * `attempts` always increments; `correct` increments only when `correct` is true;
 * `weightedCorrect` gains the source's rate only when `correct` is true.
 */
export function applyAnswer(m: SkillMastery, source: MasterySource, correct: boolean): SkillMastery {
  if (!correct) {
    return {
      weightedCorrect: m.weightedCorrect,
      correct: m.correct,
      attempts: m.attempts + 1,
    };
  }
  const rate = source === 'range' ? MASTERY_RATE_RANGE : MASTERY_RATE_DUEL;
  return {
    weightedCorrect: m.weightedCorrect + rate,
    correct: m.correct + 1,
    attempts: m.attempts + 1,
  };
}

/** Raw accuracy, `correct / attempts`, unweighted by source. `0` (never `NaN`) at zero attempts. */
export function accuracy(m: SkillMastery): number {
  if (m.attempts === 0) return 0;
  return m.correct / m.attempts;
}

/** The 0-100 meter percentage, derived from `weightedCorrect` alone, clamped to `MASTERY_METER_MAX`. */
export function meterPercent(m: SkillMastery): number {
  const raw = Math.round((100 * m.weightedCorrect) / MASTERY_THRESHOLD_CORRECT);
  return Math.min(MASTERY_METER_MAX, raw);
}

/** True when both mastery gates clear: enough weighted corrects AND high enough raw accuracy. */
export function isMastered(m: SkillMastery): boolean {
  return m.weightedCorrect >= MASTERY_THRESHOLD_CORRECT && accuracy(m) >= MASTERY_MIN_ACCURACY;
}

/** Every skill id in `mastery` whose recorded `SkillMastery` clears `isMastered`. */
function masteredSkillIds(mastery: Readonly<Partial<Record<SkillId, SkillMastery>>>): ReadonlySet<SkillId> {
  const result = new Set<SkillId>();
  for (const skillId of Object.keys(mastery) as SkillId[]) {
    const entry = mastery[skillId];
    if (entry !== undefined && isMastered(entry)) {
      result.add(skillId);
    }
  }
  return result;
}

/**
 * Resolves newly-unlocked cannons and islands from a mastery map, returning only ids not already
 * present in the corresponding input list (idempotent delta semantics — safe to apply after
 * every answer without duplicating unlocks).
 *
 * - Cannons: every catalog cannon whose `unlock.kind === 'range'` and whose `skill` is mastered.
 * - Islands: every catalog island `I` with `requiresIsland === J` where at least one skill in
 *   `J.rangeSkills` is mastered. This reads `unlockedIslands` only to exclude `I` itself from the
 *   delta — never as a precondition that `J` is unlocked (see module docs above).
 */
export function resolveUnlocks(input: {
  readonly gradeBand?: GradeBand;
  readonly mastery: Readonly<Partial<Record<SkillId, SkillMastery>>>;
  readonly unlockedCannons: readonly CannonId[];
  readonly unlockedIslands: readonly IslandId[];
}): { readonly cannons: readonly CannonId[]; readonly islands: readonly IslandId[] } {
  const mastered = masteredSkillIds(input.mastery);
  const alreadyCannons = new Set(input.unlockedCannons);
  const alreadyIslands = new Set(input.unlockedIslands);
  const maxGrade =
    input.gradeBand === undefined ? Number.POSITIVE_INFINITY : maxGradeForBand(input.gradeBand);

  const newCannons = cannons
    .filter((c) => c.unlock.kind === 'range' && mastered.has(c.skill) && !alreadyCannons.has(c.id))
    .map((c) => c.id);

  const newIslands = islands
    .filter((i) => {
      if (alreadyIslands.has(i.id)) return false;
      if (i.requiresIsland === undefined) return false;
      if (!i.rangeSkills.some((skillId) => getSkill(skillId).minGrade <= maxGrade)) return false;
      const predecessor = getIsland(i.requiresIsland);
      return predecessor.rangeSkills.some((s) => mastered.has(s));
    })
    .map((i) => i.id);

  return { cannons: newCannons, islands: newIslands };
}
