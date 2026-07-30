/**
 * The sea chart's state — which islands a captain may enter, and why the rest are closed.
 *
 * A-007's logic half. `islands.json` ships five islands with a `requiresIsland` chain and nothing
 * rendered them; without the chart there is no loop, only a duel you can replay.
 *
 * Fog is decided HERE rather than in the component for two reasons. It is a pure function of
 * captain state plus the catalog, so it is exhaustively testable; and a fog rule buried in JSX is
 * a rule that gets duplicated the first time a second screen needs to ask the same question.
 *
 * The chart shows every island always — fogged, not absent. A five-island map that renders as one
 * node tells a child the game is one island long. The fog IS the promise that there is more.
 */
import { islands, getIsland, getSkill } from '@content/index';
import type { Island } from '@content/schemas';
import { emptyMastery, isMastered } from '@engine/mastery';
import { maxGradeForBand } from '@engine/placement';

import type { Captain } from '../stores/player';

export interface ChartNode {
  readonly island: Island;
  /** True when the captain cannot enter. Fogged islands are shown, never hidden. */
  readonly fogged: boolean;
  /** The captain's ship is drawn here. */
  readonly isCurrent: boolean;
  /** True only after every practice skill taught by this island is mastered. */
  readonly cleared?: boolean;
}

/**
 * Every island, in catalog order, with its fog state.
 *
 * Order comes from the catalog rather than from the captain's unlock list, so the map never
 * reshuffles as islands open — a child navigates by position, and a map that rearranges itself
 * is a map they have to relearn.
 */
export function chartNodes(captain: Captain): readonly ChartNode[] {
  const unlocked = new Set(captain.unlockedIslands);
  /**
   * The curriculum ceiling. `cleared` is measured against the skills this captain will actually be
   * ASKED, not against every skill the island teaches at every age.
   *
   * Without this, the green tick was unreachable for the youngest band and the bug was invisible in
   * any test that did not pick a band: Port Sumwich teaches four skills, and one of them —
   * `two_step_add_sub` — is `minGrade: 2`. A K-1 captain is never served it (`range.ts` refuses a
   * drill above the band), so `every` could never be satisfied, so their first island never earned
   * its check no matter how completely they finished it.
   *
   * This is the same filter `resolveUnlocks` already applies when deciding whether an island is even
   * eligible at a band, so the two now agree about what "done with this island" means (A-051).
   */
  const maxGrade = captain.gradeBand === null ? Number.POSITIVE_INFINITY : maxGradeForBand(captain.gradeBand);
  return [...islands]
    .sort((a, b) => a.order - b.order)
    .map((island) => {
      const fogged = !unlocked.has(island.id);
      const inBand = island.rangeSkills.filter((skill) => getSkill(skill).minGrade <= maxGrade);
      return {
        island,
        fogged,
        isCurrent: captain.currentIsland === island.id,
        // An island with nothing age-appropriate to teach is not "cleared" by vacuous truth —
        // `every` on an empty list is `true`, which would tick every island above the band.
        cleared:
          inBand.length > 0 && inBand.every((skill) => isMastered(captain.mastery[skill] ?? emptyMastery)),
      };
    });
}

/**
 * Why a fogged island is closed, in words a child can read — or `null` when it is open.
 *
 * It names the PLACE they have to clear, never a skill id and never an island id. "Master a skill
 * at Port Sumwich" is actionable; "requires port_sumwich" is a database row.
 */
export function requirementText(node: ChartNode): string | null {
  if (!node.fogged) return null;

  const requires = node.island.requiresIsland;
  if (requires === undefined) {
    // The first island, still fogged: the captain has not been placed yet. This is reachable
    // before onboarding writes placement, so it needs a real sentence rather than an empty string.
    return 'Choose your ship to set sail.';
  }

  return `Train at ${getIsland(requires).displayName} to lift the fog.`;
}
