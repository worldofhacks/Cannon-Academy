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
import { islands, getIsland } from '@content/index';
import type { Island } from '@content/schemas';

import type { Captain } from '../stores/player';

export interface ChartNode {
  readonly island: Island;
  /** True when the captain cannot enter. Fogged islands are shown, never hidden. */
  readonly fogged: boolean;
  /** The captain's ship is drawn here. */
  readonly isCurrent: boolean;
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
  return [...islands]
    .sort((a, b) => a.order - b.order)
    .map((island) => ({
      island,
      fogged: !unlocked.has(island.id),
      isCurrent: captain.currentIsland === island.id,
    }));
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
