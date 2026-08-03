/**
 * Valid duel entry context from the captain's chart placement (A-029).
 *
 * Fog, missing placement, and unknown ids are rejected here — never in the screen — so every
 * caller agrees on when a duel may start and which island's tuning applies.
 */
import { islandCurriculumFor } from '@content/index';
import type { IslandId } from '@content/schemas';
import { ENEMY_HULL_BY_ISLAND } from '@engine/tuning';

import type { Captain } from '../stores/player';

export type ValidDuelContext = {
  readonly ok: true;
  readonly islandId: IslandId;
  readonly islandName: string;
  readonly enemyHull: number;
};

export type InvalidDuelContext = {
  readonly ok: false;
  readonly reason: 'missing' | 'unknown' | 'fogged';
};

export type DuelContext = ValidDuelContext | InvalidDuelContext;

/** Returns duel context when the captain may fight at their current island. */
export function resolveDuelContext(captain: Captain): DuelContext {
  const { currentIsland, unlockedIslands } = captain;
  if (currentIsland === null) {
    return { ok: false, reason: 'missing' };
  }
  if (!Object.hasOwn(ENEMY_HULL_BY_ISLAND, currentIsland)) {
    return { ok: false, reason: 'unknown' };
  }
  if (!unlockedIslands.includes(currentIsland)) {
    return { ok: false, reason: 'fogged' };
  }

  return {
    ok: true,
    islandId: currentIsland,
    // The island's name FOR THIS CAPTAIN'S BAND (D-14 — `islandCurriculumFor`): the duel header
    // must call the sea what the captain's own chart calls it. A `null` band takes the accessor's
    // documented `g4_5` reading — a name is display, not a safety gate, and every placed captain
    // (the only kind that can hold an unlocked island) carries a real band.
    islandName: islandCurriculumFor(currentIsland, captain.gradeBand).displayName,
    enemyHull: ENEMY_HULL_BY_ISLAND[currentIsland],
  };
}
