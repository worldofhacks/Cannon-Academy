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
import type { Island, SkillId } from '@content/schemas';
import { emptyMastery, isMastered, type SkillMastery } from '@engine/mastery';
import { maxGradeForBand } from '@engine/placement';
import {
  DUEL_VOLLEY_FLOOR,
  MASTERY_MIN_ACCURACY,
  MASTERY_RATE_DUEL,
  MASTERY_THRESHOLD_CORRECT,
} from '@engine/tuning';

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
 * So the map now carries a number that steps down after every duel and reaches zero exactly when
 * the fog lifts. Three questions, answered without a manual:
 *
 *   what did I earn?         the island's meter fills, and this countdown drops
 *   how close is the next?   `caption` — `2 DUELS TO OPEN`, on the fogged island itself
 *   what do I do next?       `requirementText` names the place; the dock's verbs are one tap away
 *
 * ## Why duels and not a raw counter
 *
 * `harborShortfallMessage` set the register: *"About four more duels."* — whole units of a thing
 * the child does, never `7.5 / 10`. The same discipline applies to the estimate itself: it is
 * computed at `DUEL_VOLLEY_FLOOR`, the FEWEST questions a duel can ask, so the count errs long and
 * the island arrives sooner than the chart promised rather than later.
 */
export interface ChartProgress {
  /** Catalog index of the nearest island still under fog, or `-1` when the chain is finished. */
  readonly nextIndex: number;
  readonly next: Island | null;
  /** Correct answers still needed on the FASTEST in-band skill of `next`'s predecessor. */
  readonly answersToOpen: number;
  /** Those answers as whole duels, at the engine's guaranteed floor of questions per duel. */
  readonly duelsToOpen: number;
  /** The gold chip under the fogged node. `null` when there is nothing left to promise. */
  readonly caption: string | null;
  /** The sentence a screen reader and the dock get. `null` when the chain is finished. */
  readonly message: string | null;
}

/**
 * How many more correct answers make this skill mastered.
 *
 * Both gates, not just the count. `isMastered` needs `weightedCorrect >= MASTERY_THRESHOLD_CORRECT`
 * AND `correct / attempts >= MASTERY_MIN_ACCURACY`, and a captain who has been guessing can clear
 * the first and still be short on the second. Every further correct answer raises accuracy too, so
 * `(correct + n) / (attempts + n) >= floor` solves to `n >= (floor·attempts − correct) / (1 − floor)`
 * and the answer is whichever gate needs more.
 */
function answersToMaster(m: SkillMastery): number {
  const byCount = Math.ceil(
    Math.max(0, MASTERY_THRESHOLD_CORRECT - m.weightedCorrect) / MASTERY_RATE_DUEL,
  );
  const byAccuracy = Math.ceil(
    Math.max(0, MASTERY_MIN_ACCURACY * m.attempts - m.correct) / (1 - MASTERY_MIN_ACCURACY),
  );
  return Math.max(byCount, byAccuracy);
}

/** `1` → "one", up to twelve; past that the numeral, which is the register harbor copy uses. */
const WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
] as const;
const spell = (n: number): string => WORDS[n] ?? String(n);

export function chartProgress(captain: Captain, nodes: readonly ChartNode[]): ChartProgress {
  const none: ChartProgress = {
    nextIndex: -1,
    next: null,
    answersToOpen: 0,
    duelsToOpen: 0,
    caption: null,
    message: null,
  };

  // The nearest fogged island whose predecessor is already open — the one the captain can actually
  // reach next. Anything further out is gated behind this one and promising a count for it would be
  // a number the child cannot act on.
  const nextIndex = nodes.findIndex((node, i) => {
    if (!node.fogged) return false;
    const requires = node.island.requiresIsland;
    if (requires === undefined) return false;
    const predecessor = nodes.findIndex((n) => n.island.id === requires);
    return predecessor >= 0 && nodes[predecessor]?.fogged === false && i > predecessor;
  });
  if (nextIndex < 0) return none;

  const next = nodes[nextIndex]?.island;
  const requires = next?.requiresIsland;
  if (next === undefined || requires === undefined) return none;

  const maxGrade =
    captain.gradeBand === null ? Number.POSITIVE_INFINITY : maxGradeForBand(captain.gradeBand);
  // The gate is ONE skill of the predecessor, not all of them — that distinction is the whole
  // difference between the fog lifting and the green tick, and the shortest road is what a captain
  // is actually on. `Infinity` when the predecessor teaches nothing in band, which the corrected
  // placement makes unreachable but which is a real save-file shape.
  const inBand = getIsland(requires).rangeSkills.filter((skill) => getSkill(skill).minGrade <= maxGrade);
  const answersToOpen = inBand.reduce(
    (best: number, skill: SkillId) =>
      Math.min(best, answersToMaster(captain.mastery[skill] ?? emptyMastery)),
    Number.POSITIVE_INFINITY,
  );
  if (!Number.isFinite(answersToOpen)) return none;

  const duelsToOpen = Math.max(1, Math.ceil(answersToOpen / DUEL_VOLLEY_FLOOR));
  return {
    nextIndex,
    next,
    answersToOpen,
    duelsToOpen,
    caption: duelsToOpen === 1 ? '1 DUEL TO OPEN' : `${duelsToOpen} DUELS TO OPEN`,
    message:
      duelsToOpen === 1
        ? `${next.displayName} opens after about one more duel.`
        : `${next.displayName} opens after about ${spell(duelsToOpen)} more duels.`,
  };
}
