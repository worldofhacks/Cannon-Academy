/**
 * Cross-island training catalog — every age-eligible skill from unlocked islands.
 *
 * A-028. The range picker used to list only the current island's `rangeSkills`, which stranded
 * captains on later islands with a single hard option. This module unions eligible skills across
 * all unlocked islands (band-filtered), preserves catalog order, and de-duplicates by skill id.
 */
import { getSkill, islands } from '@content/index';
import type { GradeBand, IslandId, SkillId } from '@content/schemas';
import { maxGradeForBand } from '@engine/placement';

export interface TrainingEntry {
  readonly islandId: IslandId;
  readonly skillId: SkillId;
}

export interface TrainingGroup {
  readonly islandId: IslandId;
  readonly isCurrentIsland: boolean;
  readonly entries: readonly TrainingEntry[];
}

/** Every drillable skill from unlocked islands, grouped by island and filtered to the captain band. */
export function trainingCatalog(input: {
  readonly unlockedIslands: readonly IslandId[];
  readonly currentIsland: IslandId | null;
  readonly gradeBand: GradeBand;
}): readonly TrainingGroup[] {
  const maxGrade = maxGradeForBand(input.gradeBand);
  const unlocked = new Set(input.unlockedIslands);
  const seen = new Set<SkillId>();
  const groups: TrainingGroup[] = [];

  for (const island of [...islands].sort((a, b) => a.order - b.order)) {
    if (!unlocked.has(island.id)) continue;

    const entries: TrainingEntry[] = [];
    for (const skillId of island.rangeSkills) {
      if (seen.has(skillId)) continue;
      if (getSkill(skillId).minGrade > maxGrade) continue;
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
