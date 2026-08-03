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
import type { GradeBand, Island, IslandId } from '@content/schemas';
import { emptyMastery, isMastered } from '@engine/mastery';
import { maxGradeForBand } from '@engine/placement';

import { islandGlyph } from '../components/chart/board';
import type { Captain } from '../stores/player';
import { SKILL_GLYPH } from '../theme/rankPresentation';

export interface ChartNode {
  readonly island: Island;
  /**
   * The operator this captain will actually be asked here — see `islandGlyphForCaptain`. Carried on
   * the node rather than looked up at the call site so the chart cannot label a five-year-old's map
   * with a symbol their duel will never use.
   */
  readonly glyph: string;
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
        glyph: islandGlyphForCaptain(island.id, captain.gradeBand),
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// How close the next island is
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The captain's progress toward the next island — the thing a win has to visibly move.
 *
 * The defect this exists for: the owner won a duel and the chart looked identical. The mechanism
 * worked (`duel-outcome` AC-2/AC-3 pass), but nothing on the map was a function of it. The dock's
 * ten-cell meter is an AVERAGE across every skill an island teaches, so one duel's worth of answers
 * moved it by a fraction of one cell; and the next island's node said only its own name.
 *
 * **Wins-based since D-11 (A-062).** The count used to be answers-to-mastery arithmetic; D-11 made
 * one WIN open the next band-eligible island (`advanceOnWin`), so the arithmetic is vestigial and
 * the honest count is `1` whenever a next island exists at all. The caption plumbing survives
 * unchanged — the chip, the message and the voyage-complete hidden state all keep their shapes —
 * because the promise still has to sit on the fogged island a child is looking at:
 *
 *   what did I earn?         the island's meter fills, and the map itself moves on a win
 *   how close is the next?   `caption` — `1 DUEL TO OPEN`, on the fogged island itself
 *   what do I do next?       `requirementText` names the place; the dock's verbs are one tap away
 */
export interface ChartProgress {
  /** Catalog index of the nearest island still under fog, or `-1` when the chain is finished. */
  readonly nextIndex: number;
  readonly next: Island | null;
  /**
   * Void under D-11 — a WIN opens the island now, not a count of answers. Held at `0` because the
   * field is part of the shape screens consume; remove only with the screen half of A-063.
   */
  readonly answersToOpen: number;
  /** Whole duels to open `next` — `1` whenever a next band-eligible island exists (D-11). */
  readonly duelsToOpen: number;
  /** The gold chip under the fogged node. `null` when there is nothing left to promise. */
  readonly caption: string | null;
  /** The sentence a screen reader and the dock get. `null` when the chain is finished. */
  readonly message: string | null;
}

export function chartProgress(captain: Captain, nodes: readonly ChartNode[]): ChartProgress {
  const none: ChartProgress = {
    nextIndex: -1,
    next: null,
    answersToOpen: 0,
    duelsToOpen: 0,
    caption: null,
    message: null,
  };

  const maxGrade =
    captain.gradeBand === null ? Number.POSITIVE_INFINITY : maxGradeForBand(captain.gradeBand);

  // The nearest fogged island a WIN can actually open: its predecessor is already open (that is
  // the island the captain fights at), and it teaches something inside the band — the same
  // eligibility rule `advanceOnWin` and `resolveUnlocks` share, applied here so the chart never
  // promises an island the engine will refuse. Without the band check the old arithmetic promised
  // Quotient Cove to a K-1 captain forever — a caption that dead-ends is a promise the game breaks.
  const nextIndex = nodes.findIndex((node, i) => {
    if (!node.fogged) return false;
    const requires = node.island.requiresIsland;
    if (requires === undefined) return false;
    if (!node.island.rangeSkills.some((skill) => getSkill(skill).minGrade <= maxGrade)) return false;
    const predecessor = nodes.findIndex((n) => n.island.id === requires);
    return predecessor >= 0 && nodes[predecessor]?.fogged === false && i > predecessor;
  });
  if (nextIndex < 0) return none;

  const next = nodes[nextIndex]?.island;
  if (next === undefined) return none;

  // One win, one island (D-11). The register survives from the arithmetic era: whole units of a
  // thing the child does — and the singular copy is now simply always the true one.
  return {
    nextIndex,
    next,
    answersToOpen: 0,
    duelsToOpen: 1,
    caption: '1 DUEL TO OPEN',
    message: `${next.displayName} opens when you win one more duel.`,
  };
}

/**
 * The operator a captain will actually be asked at an island — not the island's headline operator.
 *
 * `board.ts`'s `islandGlyph` is the BOARD's label: Isla Products is `×` because that is what the
 * drawing says. That was true while an island taught one thing to everybody. It stopped being true
 * the moment islands started teaching the same concept at a level matched to the band: a `k_1`
 * captain now sails to Isla Products and is asked `2 + 2 + 2`, so labelling their map `×` shows a
 * five-year-old the one symbol A-051 exists to keep away from them, and promises maths the duel
 * will never actually ask.
 *
 * So the glyph is derived from the hardest skill the captain is ELIGIBLE for at that island —
 * hardest, because that is the one the island is really teaching them, and eligibility is the same
 * `maxGradeForBand` ceiling `asksInBand` uses at the point questions are chosen (A-058).
 *
 * Falls back to the board's own label when a captain has no band yet, which is the only state that
 * can reach here without one and is the state `resolveDestination` immediately routes away from.
 */
export function islandGlyphForCaptain(islandId: IslandId, band: GradeBand | null): string {
  if (band === null) return islandGlyph[islandId];
  const ceiling = maxGradeForBand(band);
  const inBand = getIsland(islandId)
    .rangeSkills.map((id) => getSkill(id))
    .filter((skill) => skill.minGrade <= ceiling)
    .sort((a, b) => b.minGrade - a.minGrade);
  const hardest = inBand[0];
  return hardest === undefined ? islandGlyph[islandId] : SKILL_GLYPH[hardest.id];
}
