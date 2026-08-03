/**
 * Island- and band-aware rival cannon loadout (A-030).
 *
 * Catalog order, skills belonging to the current island, and `minGrade` within the captain's band.
 * Empty or invalid context fails closed — no generic fallback loadout.
 */
import { cannons, islandCurriculumFor } from '@content/index';
import type { CannonId, IslandId } from '@content/schemas';
import { maxGradeForBand } from '@engine/placement';

import type { Captain } from '../stores/player';

/** Stable catalog-order rival loadout for the current island and captain band. */
export function deriveRivalLoadout(captain: Captain, islandId: IslandId): readonly CannonId[] {
  const band = captain.gradeBand;
  if (band === null) {
    // Fail closed (A-070 AC-5): a band-less captain gets NO rival gun, loudly — the throw is the
    // existing posture and the screen never reaches it (`resolveDuelContext` gates entry).
    throw new RangeError('deriveRivalLoadout: captain.gradeBand is required');
  }

  // The island's skills FOR THIS BAND (D-14 — `islandCurriculumFor`): the rival asks the same
  // mathematics the island is teaching this captain, never another band's.
  // `maxGradeForBand` throws for the corrupt band strings a save can carry, before the cell read.
  const maxGrade = maxGradeForBand(band);
  const islandSkills = new Set(islandCurriculumFor(islandId, band).skills);
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
