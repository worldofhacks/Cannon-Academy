/**
 * Cross-island training catalog — every age-eligible skill from unlocked islands.
 *
 * A-028. The range picker used to list only the current island's `rangeSkills`, which stranded
 * captains on later islands with a single hard option. This module unions eligible skills across
 * all unlocked islands (band-filtered), preserves catalog order, and de-duplicates by skill id.
 */
import { islands } from '@content/index';
import type { GradeBand, IslandId, SkillId } from '@content/schemas';

import { skillInBand } from './range';

export interface TrainingEntry {
  readonly islandId: IslandId;
  readonly skillId: SkillId;
}

export interface TrainingGroup {
  readonly islandId: IslandId;
  readonly isCurrentIsland: boolean;
  readonly entries: readonly TrainingEntry[];
}

/**
 * Every drillable skill from unlocked islands, grouped by island and filtered to the captain band.
 *
 * `gradeBand` is typed WIDER than `GradeBand` on purpose. This is the function that decides what a
 * child is offered, and it is called with `captain.gradeBand`, which is `GradeBand | null` in the
 * store and — through `persistence.ts` — can be an arbitrary string in a save: `isBaseCaptain`
 * accepts any `typeof 'string'` and `normalizeCaptain` passes it through untouched, so a band an
 * older build spelled differently survives hydration intact. Under the previous signature that
 * reached `maxGradeForBand` and THREW, and the throw landed on the range screen as a crash rather
 * than as the empty state the screen already knows how to draw.
 *
 * So the band is resolved through `skillInBand`, which fails closed: an unrecognised band offers
 * NOTHING. That is the safe direction, and it is the one `engine/mastery.ts:121` gets backwards by
 * reading an absent band as `POSITIVE_INFINITY`.
 */
export function trainingCatalog(input: {
  readonly unlockedIslands: readonly IslandId[];
  readonly currentIsland: IslandId | null;
  readonly gradeBand: GradeBand | null | undefined;
}): readonly TrainingGroup[] {
  const unlocked = new Set(input.unlockedIslands);
  const seen = new Set<SkillId>();
  const groups: TrainingGroup[] = [];

  for (const island of [...islands].sort((a, b) => a.order - b.order)) {
    if (!unlocked.has(island.id)) continue;

    const entries: TrainingEntry[] = [];
    for (const skillId of island.rangeSkills) {
      if (seen.has(skillId)) continue;
      // The ceiling, and the ONLY place this module applies one — the same `skillInBand` the drill
      // itself refuses on, so the menu and the door cannot disagree about what is offerable.
      if (!skillInBand(skillId, input.gradeBand)) continue;
      seen.add(skillId);
      entries.push({ islandId: island.id, skillId });
    }

    if (entries.length > 0) {
      groups.push({
        islandId: island.id,
        isCurrentIsland: input.currentIsland === island.id,
        entries,
      });
    }
  }

  return groups;
}
