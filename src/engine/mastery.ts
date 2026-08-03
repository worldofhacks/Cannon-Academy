/**
 * Dual-rate mastery meters, the mastery threshold, and unlock resolution (T-010).
 *
 * Range drills and duel answers both fill a skill's meter at full rate. Crossing a threshold
 * (`MASTERY_THRESHOLD_CORRECT` weighted corrects at `>= MASTERY_MIN_ACCURACY` accuracy) unlocks
 * that skill's next cannon and lifts the fog on the next island.
 *
 * **D-11 (2026-08-02, A-062):** mastery is no longer the only road to the next island — winning a
 * duel advances the voyage directly (`advanceOnWin` below), through the SAME band-eligibility and
 * entry-cannon rules `resolveUnlocks` applies. Mastery keeps paying cannons; the band gate is not
 * negotiable on either path.
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
import { cannons, getCannon, getSkill, islandCurriculumFor, islands } from '@content/index';
import type { CannonId, GradeBand, Island, IslandId, SkillId } from '@content/schemas';
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
 * The band-eligibility rule, shared by `resolveUnlocks` and `advanceOnWin` so the two unlock
 * paths can never disagree about it: an island is eligible only when its cell for THE CAPTAIN'S
 * BAND (D-14 — `islandCurriculumFor`, the one door to island content) teaches something at or
 * under the captain's grade ceiling.
 *
 * Under the atlas every island is band-eligible BY CONSTRUCTION — A-069's `assertCurriculumLawful`
 * refuses a catalog whose cells violate the ceiling — but the gate STAYS (A-070 ticket): it is the
 * runtime tripwire that catches a future bad catalog after import-time validation is somehow
 * bypassed, not a check the happy path needs.
 */
function teachesInBand(island: Island, band: GradeBand, maxGrade: number): boolean {
  return islandCurriculumFor(island.id, band).skills.some(
    (skillId) => getSkill(skillId).minGrade <= maxGrade,
  );
}

/**
 * One entry cannon per island earned, and it is what closes the loop.
 *
 * The list read is THE BAND'S OWN (D-14): `islandCurriculumFor(islandId, band).unlocksCannons`,
 * the cell the arrival is actually teaching this captain — never a shared island-wide list, which
 * no longer exists. A-069's validator guarantees every cell cannon fires a skill on that cell's
 * own skill list, so the gun that lands is a gun whose questions the island asks THIS band.
 *
 * Arriving hands you the island's entry gun, so the loop reads: earn the next island → its
 * cannon arrives → its questions are new → mastery grows → the arsenal grows. Shared by
 * `resolveUnlocks` and `advanceOnWin` (D-11) so both paths pay the arrival gun identically.
 *
 * **One, not all.** A cell may list several guns; granting every one would overfill a three-slot
 * tray and leave nothing to earn on the island itself. The rest stay on the mastery path, which
 * is the within-island progression.
 *
 * **The lowest in-band grade**, because that is the gun the island is teaching you WITH. An
 * out-of-band one would be a reward the duel then refuses to arm (A-058), which the gun deck
 * would have to explain away as "NOT YET" on the very screen celebrating it. The `minGrade`
 * filter is the same runtime tripwire as `teachesInBand`: satisfied by construction under a
 * lawful catalog, kept so a future bad authoring edit fails closed here too.
 *
 * Only for islands earned in this delta — placement has its own grant rule (starters plus the
 * D-9 exceptions), so folding these in there would overfill the tray on the first launch.
 */
function entryCannonGrants(
  earnedIslands: readonly IslandId[],
  band: GradeBand,
  maxGrade: number,
  alreadyCannons: ReadonlySet<CannonId>,
  grantedInSameDelta: readonly CannonId[],
): readonly CannonId[] {
  const entries = earnedIslands.flatMap((islandId) => {
    const granted = islandCurriculumFor(islandId, band)
      .unlocksCannons.map((id) => getCannon(id))
      .filter(
        (c) =>
          c.minGrade <= maxGrade && !alreadyCannons.has(c.id) && !grantedInSameDelta.includes(c.id),
      )
      .sort((a, b) => a.minGrade - b.minGrade || a.id.localeCompare(b.id));
    const entry = granted[0];
    return entry === undefined ? [] : [entry.id];
  });
  return [...new Set(entries)];
}

/**
 * Resolves newly-unlocked cannons and islands from a mastery map, returning only ids not already
 * present in the corresponding input list (idempotent delta semantics — safe to apply after
 * every answer without duplicating unlocks).
 *
 * - Cannons: every catalog cannon whose `unlock.kind === 'range'` and whose `skill` is mastered,
 *   PLUS one entry cannon for each island unlocked in this same delta (see below).
 * - Islands: every catalog island `I` with `requiresIsland === J` where at least one skill in
 *   `J`'s cell for the captain's band (D-14 — `islandCurriculumFor`) is mastered. This reads
 *   `unlockedIslands` only to exclude `I` itself from the delta — never as a precondition that
 *   `J` is unlocked (see module docs above).
 *
 * **No band, no island** (D-14 / A-070 AC-5): with `gradeBand` omitted there is no cell to read,
 * so the island delta and its entry cannons are empty — fail closed, never "no ceiling". The old
 * `POSITIVE_INFINITY` reading opened a band-less save onto whichever curriculum happened to be
 * shared; under the atlas there is no shared curriculum to fall back to. Mastery-earned cannons
 * are unaffected: they hang off the captain's own mastered skills, not off island content, and
 * A-058's `asksInBand` still refuses to arm anything above a real band at the point of fire.
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

  const newCannons = cannons
    .filter((c) => c.unlock.kind === 'range' && mastered.has(c.skill) && !alreadyCannons.has(c.id))
    .map((c) => c.id);

  const band = input.gradeBand;
  if (band === undefined) {
    return { cannons: newCannons, islands: [] };
  }
  const maxGrade = maxGradeForBand(band);

  const newIslands = islands
    .filter((i) => {
      if (alreadyIslands.has(i.id)) return false;
      if (i.requiresIsland === undefined) return false;
      if (!teachesInBand(i, band, maxGrade)) return false;
      return islandCurriculumFor(i.requiresIsland, band).skills.some((s) => mastered.has(s));
    })
    .map((i) => i.id);

  // See `entryCannonGrants` — the arrival gun, shared with `advanceOnWin` so both paths pay it
  // identically. Mastery-granted cannons from this same delta are excluded so a gun is never
  // reported twice in one resolution.
  const entryCannons = entryCannonGrants(newIslands, band, maxGrade, alreadyCannons, newCannons);

  return { cannons: [...newCannons, ...entryCannons], islands: newIslands };
}

/**
 * D-11 (implemented by A-062): winning a duel on an island immediately opens the next
 * band-eligible island in the chain — one win, one new island, and the voyage moves.
 *
 * Pure delta, same shape and same semantics as `resolveUnlocks`: it returns only ids not already
 * present in the inputs, so applying it after every win never duplicates an unlock. The two
 * load-bearing safety properties are REUSED from the mastery path rather than re-implemented:
 *
 * - **Band eligibility** (`teachesInBand`): a win never opens an island that teaches nothing
 *   inside the captain's band. This is never a bare next-in-chain unlock — a naive one would
 *   sail a K-1 captain into Quotient Cove's division, the exact failure A-060 exists to prevent.
 * - **Entry-cannon grant** (`entryCannonGrants`): a newly opened island grants exactly one
 *   in-band entry cannon, or the captain arrives with no gun that asks the island's questions.
 *
 * Narrow supersession: this replaces mastery as the gate for island FOG only. `resolveUnlocks`
 * keeps paying cannons (and still lifts fog on mastery, which is now the slower of the two
 * roads); the band gate is not negotiable in either.
 *
 * `band` is `null` for a captain who was never placed — and under D-14 that FAILS CLOSED: no
 * cell to read means no island opens and no gun lands, matching `resolveUnlocks` with
 * `gradeBand` omitted (A-070 AC-5). The old reading — `null` as "no ceiling" — opened the shared
 * chain that no longer exists; a captain the app never placed has no curriculum to advance
 * through, and a win from that state must not invent one.
 */
export function advanceOnWin(
  islandId: IslandId,
  band: GradeBand | null,
  unlockedIslands: readonly IslandId[],
  unlockedCannons: readonly CannonId[],
): { readonly islands: readonly IslandId[]; readonly cannons: readonly CannonId[] } {
  if (band === null) {
    return { islands: [], cannons: [] };
  }

  const alreadyIslands = new Set(unlockedIslands);
  const alreadyCannons = new Set(unlockedCannons);
  const maxGrade = maxGradeForBand(band);

  const newIslands = islands
    .filter(
      (i) =>
        i.requiresIsland === islandId && !alreadyIslands.has(i.id) && teachesInBand(i, band, maxGrade),
    )
    .map((i) => i.id);

  return {
    islands: newIslands,
    cannons: entryCannonGrants(newIslands, band, maxGrade, alreadyCannons, []),
  };
}
