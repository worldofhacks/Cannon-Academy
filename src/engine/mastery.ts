/**
 * Dual-rate mastery meters, the mastery threshold, and unlock resolution (T-010).
 *
 * Range drills and duel answers both fill a skill's meter at full rate. Crossing a threshold
 * (`MASTERY_THRESHOLD_CORRECT` weighted corrects at `>= MASTERY_MIN_ACCURACY` accuracy) unlocks
 * that skill's next cannon and lifts the fog on the next island.
 *
 * **The dual rate is retained as a mechanism and is currently 1:1** — PLAN.md's "duels fill at half
 * rate" was overruled by the owner on 2026-07-30 because it hid progress: at half rate, opening the
 * next island took ~20 correct duel answers and nothing on the chart moved in between. See
 * `MASTERY_RATE_DUEL` in `tuning.ts` for the full reasoning. `applyAnswer` still takes a source and
 * still reads two constants, so re-separating them is a one-line tuning change rather than a
 * refactor.
 *
 * ## One skill opens the next island; every skill earns the check
 *
 * These are deliberately different marks and `services/chart.ts` keeps them apart. `resolveUnlocks`
 * lifts the fog on island `I` as soon as **one** skill of its predecessor is mastered — that is the
 * gate, and it is meant to be reachable. `ChartNode.cleared` (the green tick) needs **every**
 * in-band skill the island teaches, and it is the completionist mark, not the gate. Loosening the
 * tick to match the gate would delete the only thing on the map that says "finished".
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
import { cannons, getCannon, getIsland, getSkill, islands } from '@content/index';
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
  /**
   * Weighted correct-answer total: range answers count `MASTERY_RATE_RANGE`, duel answers count
   * `MASTERY_RATE_DUEL`. Both are 1 today; the weighting survives so the rates stay tunable.
   */
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
 * - Cannons: every catalog cannon whose `unlock.kind === 'range'` and whose `skill` is mastered,
 *   PLUS one entry cannon for each island unlocked in this same delta (see below).
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

  /**
   * One cannon per island earned, and it is what closes the loop.
   *
   * `island.unlocksCannons` has been declared on all five islands since the catalog was written and
   * was consumed by NOTHING — `content/index.ts` only validated that the ids exist. So a cannon
   * could only ever be earned by mastering its own skill, which is circular at a new island: the
   * gun that teaches grouping arrived only once you had already mastered grouping. A captain
   * therefore reached Isla Products holding nothing that could ask its questions, and duelling
   * there taught them nothing new.
   *
   * Arriving now hands you the island's entry gun, so the loop reads: master a skill → the next
   * island opens AND its cannon arrives → its questions are new → mastery grows → the next island
   * opens. The range stops being a mandatory gate and goes back to being the accelerator it was
   * built as (full rate against the duel rate).
   *
   * **One, not all.** Port Sumwich alone lists four; granting every one would hand a fresh captain
   * five guns for three tray slots and leave nothing to earn on the island they are standing on.
   * The rest stay on the mastery path, which is the within-island progression.
   *
   * **The lowest in-band grade**, because that is the gun the island is teaching you WITH. An
   * out-of-band one would be a reward the duel then refuses to arm (A-058), which the gun deck
   * would have to explain away as "NOT YET" on the very screen celebrating it.
   *
   * Only for islands earned in this delta — placement has its own grant rule (starters plus the
   * D-9 exceptions) and pre-unlocks up to three islands at the top band, so folding these in there
   * would overfill the tray on the first launch.
   */
  const entryCannons = newIslands.flatMap((islandId) => {
    const granted = getIsland(islandId)
      .unlocksCannons.map((id) => getCannon(id))
      .filter(
        (c) => c.minGrade <= maxGrade && !alreadyCannons.has(c.id) && !newCannons.includes(c.id),
      )
      .sort((a, b) => a.minGrade - b.minGrade || a.id.localeCompare(b.id));
    const entry = granted[0];
    return entry === undefined ? [] : [entry.id];
  });

  return { cannons: [...newCannons, ...new Set(entryCannons)], islands: newIslands };
}
