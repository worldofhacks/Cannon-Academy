/**
 * Rank — "Your log". The board's frame 8b, transcribed (A-012).
 *
 * Source: `Cannon Academy Harbor and Rank.dc.html`, frame 8b. The board calls it *"a trophy shelf,
 * not a scoreboard"*, and the whole screen is built on one rule stated in its own sidebar:
 *
 * > "Nothing on this screen counts losses, and no rung can ever be taken back."
 *
 * ## What was cut, and by whom
 *
 * The tier ladder, its rung list, the "NEXT RANK" card and the grown-up opt-in strip are **cut** —
 * not deferred. The board's own cut list closes it at item 9 (*"Agreed and closed. K–3 never sees
 * it, there is no gate to hang it on, and the private shelf is a complete screen without it"*) and
 * the owner confirmed. Its states survive in the artifact as documentation of a deferred feature.
 * The `NEXT UP` goal card is what replaces it: private progress only, never a comparison.
 *
 * `rankLadder()` is still the source of the tier badge — the ladder *model* is load-bearing even
 * with the ladder *list* gone, because the badge's numeral, name and pip count all derive from it.
 */
import { skills } from '@content/index';
import type { SkillId } from '@content/schemas';

import { chartNodes, requirementText } from '../services/chart';
import type { SkillProgressRow } from '../services/rankView';
import type { Captain } from '../stores/player';
import { MIN_TAP_TARGET } from './tokens';

/** The board's header word for this screen. Not "Rank ladder" — the ladder is cut. */
export const rankTitle = 'Your log';

export const rankRatingLabel = 'YOUR RATING';
export const rankSkillsLabel = 'WHAT YOU CAN DO';
export const rankGoalLabel = 'NEXT UP';
export const rankPapersLabel = "CAPTAIN'S PAPERS";

/**
 * The shelf heading. "JUST STARTED" is not an apology — the board's own note on the empty trophy
 * tile is *"Empty state is sunk, not accusing"*, and the same tone governs the heading above them.
 */
export function rankShelfLabel(masteredCount: number): string {
  return masteredCount === 0 ? 'YOUR SHELF — JUST STARTED' : 'YOUR SHELF';
}

// ── Trophy tiles ──────────────────────────────────────────────────────────────────────────────

export interface TrophyTile {
  readonly id: 'cannons' | 'islands' | 'ships' | 'skills';
  readonly glyph: string;
  readonly count: number;
  readonly label: string;
  /** Sunk rather than raised. A tile is empty when the count is zero, and never otherwise. */
  readonly empty: boolean;
  readonly accessibilityLabel: string;
}

/**
 * The four tiles, counted from the captain.
 *
 * `empty` is `count === 0` and nothing else. The board's data carries a hand-written `filled` flag
 * beside each tile which nothing in its markup ever reads — and which is set `true` on the CANNONS
 * tile unconditionally, so a genuine zero would render as a filled tile. Ignored on purpose.
 *
 * The flag glyph carries U+FE0E. `⚑` has an emoji presentation on some platforms, and a trophy
 * shelf that renders one tile as a colour emoji beside three flat glyphs looks broken rather than
 * decorated — the same fix `Hud.tsx` already applies to its anchor.
 */
export function rankTrophies(captain: Captain, masteredCount: number): readonly TrophyTile[] {
  const tiles = [
    { id: 'cannons', glyph: '+', count: captain.ownedCannons.length, label: 'CANNONS', noun: 'cannons' },
    { id: 'islands', glyph: '⚑︎', count: captain.unlockedIslands.length, label: 'ISLANDS', noun: 'islands open' },
    { id: 'ships', glyph: '★', count: captain.ownedSkins.length, label: 'SHIPS', noun: 'ships' },
    { id: 'skills', glyph: '✓', count: masteredCount, label: 'MASTERED', noun: 'skills mastered' },
  ] as const;

  return tiles.map((tile) => ({
    id: tile.id,
    glyph: tile.glyph,
    count: tile.count,
    label: tile.label,
    empty: tile.count === 0,
    accessibilityLabel: `${tile.count} ${tile.noun}`,
  }));
}

// ── Skill rows, grouped by operation ──────────────────────────────────────────────────────────

/**
 * The operation a child would point at, one per catalog skill.
 *
 * This table exists to satisfy a rule the board states and the catalog contradicts:
 *
 * > "At K–1 the skill list is two rows, **+ and − only**: no third tile, no silhouette, no lock."
 *
 * `skillProgress()` returns **three** rows at K–1 — `add_within_10`, `add_within_20` and
 * `sub_within_20` — because the catalog splits addition by range. Grouping by operation resolves it
 * without touching the service: the `+` row aggregates both addition skills, `−` is subtraction,
 * and K–1 lands on exactly two rows. It generalises upward for free, and the grade-band ceiling
 * already applied by `skillProgress` guarantees a K–1 child can never be shown `×` or `÷`.
 *
 * `Record<SkillId, …>` rather than a lookup with a fallback, so adding a skill to the catalog is a
 * compile error here rather than a row that silently renders a blank tile.
 *
 * Two choices worth defending:
 *
 *   `two_step_add_sub` gets `+−`, not `+`. It exercises both operations, and folding it into the
 *   addition row would let the `+` meter claim progress a child made on subtraction. Two glyphs in
 *   one tile is the honest read of "two-step addition and subtraction".
 *
 *   `place_value_compare` gets `<`. It is not an arithmetic operation, but it *is* a symbol a child
 *   meets in exactly this shape on the page, and the alternative — filing comparison under `+` —
 *   would be worse for the same reason.
 */
export const SKILL_GLYPH: Readonly<Record<SkillId, string>> = {
  add_within_10: '+',
  add_within_20: '+',
  sub_within_20: '−',
  place_value_compare: '<',
  two_step_add_sub: '+−',
  mult_facts: '×',
  div_facts: '÷',
  fractions_int: '½',
  multi_digit_order_ops: '( )',
  // `+`, and it is the whole point: repeated addition is grouping written as addition, so it joins
  // the existing `+` row rather than opening a third one. A K-1 captain who has started Isla
  // Products still sees exactly two rows on the Rank screen.
  repeated_addition: '+',
  // D-14's four new rungs (A-071) — each new skill "arrives the full way … glyph". The two K-1
  // rungs stay inside the print-safety fence (no × or ÷ before grade 2, A-051), and inside the
  // board rule this whole table exists to satisfy — K-1 is two rows, `+` and `−`, still:
  //
  //   `sub_within_10` joins `sub_within_20`'s `−` row exactly as the two addition ranges share
  //   `+` — same operation, split by range, one honest meter.
  //
  //   `place_value_teens` is `+` — teens-as-ten-and-ones is authored as "10 + {a}" and "1 ten
  //   and {a} ones", addition-shaped by A-069's own definition ("no symbol beyond +"), so it
  //   joins the `+` row the way repeated addition did: grouping written as addition.
  sub_within_10: '−',
  place_value_teens: '+',
  // The two G4-5 rungs join their fact-family rows the way the range-split addition skills do:
  // multi-digit multiplication is still `×`, long division is still `÷`.
  multi_digit_mult: '×',
  long_division: '÷',
};

/** Ten segments, matching the harbor's coin meter and the board's own Rank meters. */
export const RANK_METER_SEGMENTS = 10;

export interface SkillRow {
  /** Stable across renders and unique per row — the glyph is the group. */
  readonly glyph: string;
  readonly skillIds: readonly SkillId[];
  /** Mean meter percent across the group, 0–100. */
  readonly meterPercent: number;
  /** Cells lit, `0…RANK_METER_SEGMENTS`. */
  readonly filled: number;
  /** True only when every skill under this glyph is mastered. */
  readonly mastered: boolean;
  readonly badge: string;
  readonly accessibilityLabel: string;
}

/**
 * Skill progress folded onto operation rows, in catalog order.
 *
 * `mastered` is `every`, never `some`: the `+` row is a promise about addition, and a row that ticks
 * itself once one of its two skills is done would tell a child they had finished something they had
 * not. The meter is the mean of the group's percents, so a half-done pair reads as half a row.
 *
 * Cells are floored, and a partial row is capped one cell short of full for the same reason the
 * harbor's meter is: a row showing ten lit cells beside a "keep going" badge is a contradiction a
 * non-reader resolves in favour of the picture.
 */
export function rankSkillRows(progress: readonly SkillProgressRow[]): readonly SkillRow[] {
  const order: string[] = [];
  const groups = new Map<string, SkillProgressRow[]>();

  for (const skill of skills) {
    const row = progress.find((candidate) => candidate.skillId === skill.id);
    if (row === undefined) continue;
    const glyph = SKILL_GLYPH[skill.id];
    const bucket = groups.get(glyph);
    if (bucket === undefined) {
      order.push(glyph);
      groups.set(glyph, [row]);
    } else {
      bucket.push(row);
    }
  }

  return order.map((glyph) => {
    const rows = groups.get(glyph) ?? [];
    const mastered = rows.length > 0 && rows.every((row) => row.mastered);
    const meterPercent =
      rows.length === 0 ? 0 : Math.round(rows.reduce((sum, row) => sum + row.meterPercent, 0) / rows.length);
    const filled = mastered
      ? RANK_METER_SEGMENTS
      : Math.max(0, Math.min(RANK_METER_SEGMENTS - 1, Math.floor((meterPercent * RANK_METER_SEGMENTS) / 100)));

    return {
      glyph,
      skillIds: rows.map((row) => row.skillId),
      meterPercent,
      filled,
      mastered,
      badge: mastered ? '✓' : '↗',
      accessibilityLabel: mastered
        ? `${rows.map((row) => row.displayName).join(', ')} — mastered`
        : `${rows.map((row) => row.displayName).join(', ')} — ${meterPercent} percent`,
    };
  });
}

/** How many grade-eligible skills clear the engine's mastery gate. Feeds the MASTERED tile. */
export function rankMasteredCount(progress: readonly SkillProgressRow[]): number {
  return progress.filter((row) => row.mastered).length;
}

// ── The goal card ─────────────────────────────────────────────────────────────────────────────

/**
 * One sentence naming the next thing to do — the card that replaces the cut ladder.
 *
 * It reads the chart rather than restating it. `requirementText` is already the app's one answer to
 * "why is that island closed", and a second sentence written here would be the first step toward
 * two screens disagreeing about the same fact. It also means the goal always names a *place*, never
 * a skill id and never a number of wins, which is what keeps this screen non-comparative.
 */
export function rankGoalText(captain: Captain): string {
  const nodes = chartNodes(captain);

  // A captain who has never won has one job, and it is not fog. The board's own early-state copy.
  if (captain.wins === 0) {
    const here = nodes.find((node) => node.isCurrent && !node.fogged) ?? nodes.find((node) => !node.fogged);
    // `here.displayName`, the node's band-true name (D-14 / A-070): the goal must name the place
    // as the captain's own chart names it, never another band's word for the same water.
    if (here !== undefined) return `Win a duel at ${here.displayName} to sail on.`;
  }

  const fogged = nodes.find((node) => node.fogged);
  if (fogged !== undefined) return requirementText(fogged) ?? '';

  // Every island open. The board's top-of-ladder line, which survives the ladder being cut.
  return 'Every island is open — keep sailing for ships and gems.';
}

// ── Captain's papers ──────────────────────────────────────────────────────────────────────────

/**
 * The two grown-up affordances, and the only rows on this screen that leave it.
 *
 * They live here because "Your log" is the identity screen: it is where the captain's name, rank and
 * record already are, so it is where changing the name and replaying the walkthrough belong. The
 * chart header pill is the Rank button now and has no room for either.
 *
 * Both are plain re-entries into an existing route with a query parameter — the same screen in a
 * different mode, not a new destination — so neither is a `flow.ts` graph edge and neither routes
 * through `executeDemoRouteEdge`.
 *
 * The copy is pitched at an adult reading over a child's shoulder. It is the one place on either
 * screen where that is the right register, and it is why these rows are worded as instructions
 * rather than as invitations.
 */
export interface CaptainPaper {
  readonly id: 'name' | 'tour';
  readonly glyph: string;
  readonly title: string;
  readonly detail: string;
  readonly href: string;
  readonly accessibilityLabel: string;
}

export const CAPTAIN_PAPERS: readonly CaptainPaper[] = [
  {
    id: 'name',
    glyph: '✎︎',
    title: 'Change your name',
    detail: 'Pick a new name and flag.',
    href: '/name-flag?mode=edit',
    accessibilityLabel: 'Change your name and flag',
  },
  {
    id: 'tour',
    glyph: '▶︎',
    title: 'Watch the tour again',
    // The row says "the tour", so it replays the tour: the duel, then the map walkthrough, ending
    // on the same `Sail!` a first run does. It used to say "the walkthrough duel" because that is
    // all it could do — the chart beats were unreachable once `hasCompletedOnboarding` latched, and
    // the part of the app literally named the tour was the part this row did not replay.
    detail: 'The duel, then the map.',
    href: '/guided-duel?replay=1',
    accessibilityLabel: 'Watch the whole tour again, the duel and then the map',
  },
];

// ── Measured geometry ─────────────────────────────────────────────────────────────────────────

/**
 * Frame 8b at 375×667, transcribed.
 *
 * The same two rulings that moved the harbor's chrome apply here: the back tile is raised from the
 * board's 44 to the 64pt child tap floor, and it keeps `#0A4E70` rather than the board's `#1584B8`,
 * which carries white text at 4.18.
 */
export const RANK_BOARD = {
  backGround: '#0A4E70',
  header: { padTop: 8, padBottom: 12, padX: 12, gap: 12, backRadius: 14, titleSize: 24 },
  purse: { height: 40, padLeft: 8, padRight: 16, gap: 8, coin: 24, coinRim: 4, countSize: 19 },
  page: { pad: 12, gap: 12 },
  eyebrow: { size: 11, tracking: 0.06 },
  rating: {
    pad: 12,
    radius: 18,
    shadow: 4,
    gap: 12,
    badge: { width: 58, height: 64, innerWidth: 46, innerHeight: 50, innerLeft: 6, innerTop: 7, numeralSize: 24 },
    nameSize: 24,
    pip: { height: 10, gap: 4, top: 8 },
  },
  trophy: { height: 88, radius: 18, pad: 8, gap: 8, innerGap: 4, shadow: 3, tile: 30, tileRadius: 8, glyphSize: 16, countSize: 20, labelSize: 10 },
  skill: {
    rowGap: 8,
    padX: 12,
    padY: 8,
    radius: 14,
    shadow: 3,
    tile: 30,
    tileRadius: 8,
    glyphSize: 17,
    seg: { height: 14, radius: 4, gap: 4 },
    badge: { size: 26, radius: 8, glyphSize: 14 },
  },
  papers: {
    /** The board draws no such row; it is sized to the child tap floor, like every other control. */
    height: MIN_TAP_TARGET,
    padX: 12,
    padY: 8,
    radius: 14,
    shadow: 3,
    gap: 8,
    tile: 30,
    tileRadius: 8,
    glyphSize: 15,
    titleSize: 15,
    detailSize: 11,
    chevronSize: 14,
  },
  goal: { pad: 12, radius: 18, gap: 12, tile: 44, tileRadius: 14, tileGlyphSize: 22, textSize: 19 },
} as const;

/**
 * The hexagon plate behind the tier numeral, in `Poly` point form.
 *
 * The board's own `clip-path: polygon(50% 0,100% 16%,100% 66%,50% 100%,0 66%,0 16%)` — a pointed-
 * bottom hex, not a regular one, which is what makes it read as a plate rather than a honeycomb.
 * The badge carries a numeral so the rank is legible before the word is: *"a hexagon plate with a
 * numeral, so the rank reads without the word"*.
 */
export const TIER_BADGE_POINTS = '50,0 100,16 100,66 50,100 0,66 0,16';
