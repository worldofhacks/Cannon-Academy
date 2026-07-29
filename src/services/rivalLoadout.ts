/**
 * Island- and band-aware rival cannon loadout (A-030).
 *
 * Catalog order, skills belonging to the current island, and `minGrade` within the captain's band.
 * Empty or invalid context fails closed — no generic fallback loadout.
 */
import { cannons, getIsland } from '@content/index';
import type { CannonId, IslandId } from '@content/schemas';
import { maxGradeForBand } from '@engine/placement';

import type { Captain } from '../stores/player';

/** Stable catalog-order rival loadout for the current island and captain band. */
export function deriveRivalLoadout(captain: Captain, islandId: IslandId): readonly CannonId[] {
  const band = captain.gradeBand;
  if (band === null) {
    throw new RangeError('deriveRivalLoadout: captain.gradeBand is required');
  }

  const islandSkills = new Set(getIsland(islandId).rangeSkills);
  const maxGrade = maxGradeForBand(band);
  const loadout = cannons
    .filter((cannon) => islandSkills.has(cannon.skill) && cannon.minGrade <= maxGrade)
    .map((cannon) => cannon.id);

  if (loadout.length === 0) {
    throw new RangeError(
      `deriveRivalLoadout: no age-eligible cannons for island '${islandId}' at band '${band}'`,
    );
  }

  return loadout;
}
