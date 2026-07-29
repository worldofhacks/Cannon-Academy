/**
 * Grade-band placement — turns the onboarding grade picker's answer into a starting game state.
 *
 * One pure function, called once at onboarding (T-011). It pre-unlocks the islands and cannons
 * up to the player's declared band and sets a starting bot accuracy band, so a 5th grader begins
 * at multiplication, not `3 + 4` (PLAN.md §Sea chart).
 *
 * Asymmetric stakes (ticket dispatch): placing a child too LOW is merely boring and recoverable.
 * Placing them too HIGH makes their first duel unwinnable. The eligibility rule below is
 * therefore "reachable at this band" (`cannon.minGrade <= maxGrade`) — the gun is *reachable* —
 * never "outgrown" (`cannon.maxGrade <= maxGrade`), which would deny a 5th grader every starter
 * cannon and leave them holding only the hardest guns in the game.
 *
 * Everything here is derived from `@content/index` (the T-003-validated catalog) and
 * `@engine/tuning`'s `BOT_ACCURACY_BAND_BY_GRADE` — no hardcoded cannon or island id list lives
 * in this module, so a catalog edit (e.g. T-029's new starter cannon) changes behaviour without
 * touching this file.
 */
import { cannons, getSkill, islands } from '@content/index';
import type { Cannon, CannonId, GradeBand, Island, IslandId } from '@content/schemas';
import { GRADE_BANDS } from '@content/schemas';
import { BOT_ACCURACY_BAND_BY_GRADE } from '@engine/tuning';

/** The starting game state produced from a single onboarding grade-band answer. */
export interface Placement {
  readonly maxGrade: number; // 1 | 3 | 5
  readonly unlockedCannons: readonly CannonId[]; // ascending by minGrade, then id
  readonly unlockedIslands: readonly IslandId[]; // ascending by island order
  readonly botAccuracyBand: { readonly min: number; readonly max: number };
}

/** Ticket AC-1: the top grade of each `GradeBand`, the ticket's own contract. */
const MAX_GRADE_BY_BAND: Readonly<Record<GradeBand, number>> = {
  k_1: 1,
  g2_3: 3,
  g4_5: 5,
};

/**
 * A cannon is placement-eligible when its `unlock.kind` is `starter` or `range` (never `chest` —
 * the Nine-Pounder stays a reward, ticket Planning Decisions) and it is reachable at this band
 * (`minGrade <= maxGrade`), not "outgrown".
 */
function isCannonEligible(cannon: Cannon, maxGrade: number): boolean {
  return cannon.unlock.kind !== 'chest' && cannon.minGrade <= maxGrade;
}

/**
 * An island is placement-eligible as soon as ANY of its range skills is age-appropriate at this
 * band — the minimum grade among its `rangeSkills`, not every one of them.
 */
function isIslandEligible(island: Island, maxGrade: number): boolean {
  return island.rangeSkills.some((skillId) => getSkill(skillId).minGrade <= maxGrade);
}

/** Ascending by `minGrade`, then by id — a stable, deterministic ordering for cannons. */
function sortCannons(list: readonly Cannon[]): CannonId[] {
  return list
    .slice()
    .sort((a, b) => a.minGrade - b.minGrade || a.id.localeCompare(b.id))
    .map((c) => c.id);
}

/** Ascending by island `order`. */
function sortIslands(list: readonly Island[]): IslandId[] {
  return list
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((i) => i.id);
}

/**
 * Resolves a `GradeBand` into its starting `Placement`. Throws for any value outside the
 * declared `GradeBand` union — the function is total over its declared domain and loud outside
 * it, never silently defaulting.
 *
 * Always builds fresh arrays and a fresh band object from the catalog and `tuning.ts` on every
 * call: no module-level cache is shared across calls, so mutating a caller's returned array can
 * never leak into a later invocation's result.
 */
export function resolvePlacement(band: GradeBand): Placement {
  if (!(GRADE_BANDS as readonly string[]).includes(band)) {
    throw new Error(
      `resolvePlacement: invalid GradeBand ${JSON.stringify(band)} — expected one of ${GRADE_BANDS.join(', ')}`,
    );
  }

  const maxGrade = MAX_GRADE_BY_BAND[band];

  const unlockedCannons = sortCannons(cannons.filter((c) => isCannonEligible(c, maxGrade)));
  const unlockedIslands = sortIslands(islands.filter((i) => isIslandEligible(i, maxGrade)));
  const tunedBand = BOT_ACCURACY_BAND_BY_GRADE[band];

  return {
    maxGrade,
    unlockedCannons,
    unlockedIslands,
    botAccuracyBand: { min: tunedBand.min, max: tunedBand.max },
  };
}
