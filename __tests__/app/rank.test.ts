/**
 * A-012 — rank ladder and mastery progress.
 *
 * `ranks.json` ships five tiers and `rankTierForWins` is a complete engine function. Neither
 * reached a screen until this ticket. The logic lives in `src/services/rankView.ts` and is tested
 * headless; `app/rank.tsx` renders it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { islands, ranks, skills } from '@content/index';
import type { GradeBand, SkillId } from '@content/schemas';
import { applyAnswer, emptyMastery, isMastered, meterPercent } from '@engine/mastery';
import { maxGradeForBand } from '@engine/placement';
import { rankTierForWins } from '@engine/ranks';
import { MASTERY_THRESHOLD_CORRECT } from '@engine/tuning';

import {
  rankLadder as rankLadderUnderTest,
  skillProgress as skillProgressUnderTest,
  type RankLadderView,
  type SkillProgressRow,
} from '../../src/services/rankView';
import { createCaptainStore, emptyCaptain, type Captain } from '../../src/stores/player';
import {
  CAPTAIN_PAPERS,
  RANK_BOARD,
  RANK_METER_SEGMENTS,
  SKILL_GLYPH,
  rankGoalText,
  rankMasteredCount,
  rankShelfLabel,
  rankSkillRows,
  rankTrophies,
} from '../../src/theme/rankPresentation';
import { color } from '../../src/theme/tokens';

const rankLadder: (captain: Captain) => RankLadderView = rankLadderUnderTest;
const skillProgress: (captain: Captain) => readonly SkillProgressRow[] = skillProgressUnderTest;

const captain = (over: Partial<Captain> = {}): Captain => ({ ...emptyCaptain(), ...over });

async function readSource(relative: string): Promise<string> {
  const fs = await import('node:fs/promises');
  return fs.readFile(new URL(relative, import.meta.url), 'utf8');
}

function src(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relative}`, import.meta.url)), 'utf8');
}

/**
 * Source with its comments stripped.
 *
 * `app/rank.tsx` documents at length what it deliberately does NOT draw — the ladder, the rung
 * list, the grown-up toggle — so a grep for "THE LADDER" finds the explanation rather than a
 * regression. Comments are not evidence, in either direction.
 */
function code(relative: string): string {
  return src(relative)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}

/** WCAG relative luminance — the same arithmetic `text-contrast.test.ts` uses. */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const linear = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** A mastery that clears the engine gate, built by the engine rather than hand-assembled. */
function masteredMastery() {
  let m = emptyMastery;
  while (!isMastered(m)) m = applyAnswer(m, 'range', true);
  return m;
}

/**
 * A mastery whose METER is full but whose ACCURACY is not — the one shape that can make a row look
 * finished while the engine still says it is not.
 */
function fullMeterButNotMastered() {
  let m = masteredMastery();
  for (let i = 0; i < 40; i += 1) m = applyAnswer(m, 'range', false);
  return m;
}

function masteryFor(ids: readonly SkillId[], value: ReturnType<typeof masteredMastery>) {
  return Object.fromEntries(ids.map((id) => [id, value]));
}

/**
 * The skills a band is actually served, in catalog order — exactly what `skillProgress` rows.
 *
 * Derived rather than listed. A-060 added `repeated_addition` (grade 1) so K-1 is served FOUR
 * skills rather than three, and the assertions below are about the shape of the grouping, not
 * about a catalog census that goes stale every time the curriculum grows.
 */
function inBandSkillIds(band: GradeBand): readonly SkillId[] {
  const maxGrade = maxGradeForBand(band);
  return skills.filter((skill) => skill.minGrade <= maxGrade).map((skill) => skill.id);
}

/** The in-band skills that share one operation glyph — the skills one row is measured over. */
function rowSkillIds(band: GradeBand, glyph: string): readonly SkillId[] {
  return inBandSkillIds(band).filter((id) => SKILL_GLYPH[id] === glyph);
}

describe('A-012 rank ladder', () => {
  it('spec(A-012:AC-1) the current tier is derived from wins via rankTierForWins, never a stored label', () => {
    for (const wins of [0, 5, 10, 24, 25, 49, 50, 99, 100, 200]) {
      const view = rankLadder(captain({ wins, rankTier: 0 }));
      expect(view.currentTier, `wins=${wins}`).toBe(rankTierForWins(wins));
    }
  });

  it('spec(A-012:AC-1) every catalog rank appears on the ladder in tier order', () => {
    const view = rankLadder(captain({ wins: 12 }));
    expect(view.rungs.map((r) => r.rank.id)).toEqual([...ranks].sort((a, b) => a.tier - b.tier).map((r) => r.id));
    expect(view.rungs).toHaveLength(5);
  });

  it('spec(A-012:AC-1) exactly one rung is marked current at the derived tier', () => {
    const view = rankLadder(captain({ wins: 26 }));
    expect(view.rungs.filter((r) => r.isCurrent)).toHaveLength(1);
    expect(view.rungs.find((r) => r.isCurrent)?.rank.tier).toBe(rankTierForWins(26));
  });

  it('spec(A-012:AC-1) the next tier requirement names the target rank and wins still needed', () => {
    const view = rankLadder(captain({ wins: 5 }));
    expect(view.nextRequirement).toContain('Ensign');
    expect(view.nextRequirement).toMatch(/5/);
    expect(view.nextRequirement?.toLowerCase()).toMatch(/win/);
  });

  it('spec(A-012:AC-1) at the top rank there is no next requirement', () => {
    const view = rankLadder(captain({ wins: 150 }));
    expect(view.currentTier).toBe(4);
    expect(view.nextRequirement).toBeNull();
  });

  it('spec(A-012:AC-2) a loss leaves wins and the displayed tier unchanged', () => {
    const store = createCaptainStore(captain({ wins: 30, rankTier: rankTierForWins(30) }));
    const before = rankLadder(store.getState().captain);

    store.getState().recordDuelResult({ won: false });

    const after = rankLadder(store.getState().captain);
    expect(store.getState().captain.wins).toBe(30);
    expect(after.currentTier).toBe(before.currentTier);
    expect(after.rungs.find((r) => r.isCurrent)?.rank.id).toBe(before.rungs.find((r) => r.isCurrent)?.rank.id);
  });

  it('spec(A-012:AC-2) the ladder ignores a stale stored rankTier and reads wins only', () => {
    const view = rankLadder(captain({ wins: 60, rankTier: 0 }));
    expect(view.currentTier).toBe(rankTierForWins(60));
    expect(view.rungs.find((r) => r.isCurrent)?.rank.id).toBe('commodore');
  });

  it('spec(A-012:AC-3) each eligible skill shows meter percent from stored mastery', () => {
    let m = emptyMastery;
    for (let i = 0; i < 4; i += 1) m = applyAnswer(m, 'range', true);

    const rows = skillProgress(
      captain({ gradeBand: 'g2_3', mastery: { mult_facts: m } }),
    );
    const row = rows.find((r) => r.skillId === 'mult_facts');
    expect(row).toBeDefined();
    expect(row!.meterPercent).toBe(meterPercent(m));
    expect(row!.weightedCorrect).toBe(m.weightedCorrect);
  });

  it('spec(A-012:AC-3) each skill row carries the unlock threshold from tuning', () => {
    const rows = skillProgress(captain({ gradeBand: 'g4_5' }));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.thresholdCorrect).toBe(MASTERY_THRESHOLD_CORRECT);
    }
  });

  it('spec(A-012:AC-3) mastered flag matches the engine gate on stored counters', () => {
    let mastered = emptyMastery;
    while (!isMastered(mastered)) mastered = applyAnswer(mastered, 'range', true);

    const rows = skillProgress(
      captain({ gradeBand: 'g2_3', mastery: { mult_facts: mastered } }),
    );
    expect(rows.find((r) => r.skillId === 'mult_facts')?.mastered).toBe(true);

    const partial = applyAnswer(emptyMastery, 'range', true);
    const partialRows = skillProgress(
      captain({ gradeBand: 'g2_3', mastery: { mult_facts: partial } }),
    );
    expect(partialRows.find((r) => r.skillId === 'mult_facts')?.mastered).toBe(false);
  });

  it('spec(A-012:AC-3) only grade-band-eligible skills appear, in catalog order', () => {
    const rows = skillProgress(captain({ gradeBand: 'k_1' }));
    const maxGrade = maxGradeForBand('k_1');
    const expected = skills.filter((s) => s.minGrade <= maxGrade).map((s) => s.id);
    expect(rows.map((r) => r.skillId)).toEqual(expected);
  });

  it('dod(A-012:1) every acceptance criterion in the ticket is cited by a test in this file', async () => {
    const ticket = await readSource('../../tickets/app/A-012.md');
    const suite = await readSource('./rank.test.ts');
    const acs = new Set([...ticket.matchAll(/\*\*(AC-\d+)\*\*/g)].map((m) => m[1]!));

    expect(acs.size).toBeGreaterThan(0);
    for (const ac of acs) {
      expect(suite, `${ac} has no test in rank.test.ts`).toContain(`spec(A-012:${ac})`);
    }
  });

  it('dod(A-012:3) rankView derives tier from rankTierForWins, not captain.rankTier', async () => {
    const service = await readSource('../../src/services/rankView.ts');
    expect(service).toMatch(/rankTierForWins/);
    expect(service).not.toMatch(/captain\.rankTier/);
  });

  it('dod(A-012:3) the screen reads the ladder from rankView rather than re-deriving tiers', async () => {
    const screen = await readSource('../../app/rank.tsx');
    expect(screen).toMatch(/rankView/);
    expect(screen).toMatch(/rankLadder/);
    expect(screen).not.toMatch(/rankTierForWins/);
  });
});

/**
 * The board's frame 8b, as shipped. "A trophy shelf, not a scoreboard" — so everything below is
 * about the screen showing a captain their own progress and comparing them to nobody.
 */
describe('A-012 the rating badge', () => {
  it('spec(A-012:AC-1) the numeral, the name and the pip count all come from the ladder', () => {
    for (const wins of [0, 10, 25, 50, 100]) {
      const view = rankLadder(captain({ wins }));
      const current = view.rungs.find((rung) => rung.isCurrent);

      // The badge draws `tier + 1`, so a five-year-old reads "2" rather than "tier 1".
      expect(view.currentTier + 1).toBeGreaterThanOrEqual(1);
      expect(current?.rank.displayName).toBeTypeOf('string');
      // One pip per real rung, filled up to and including the current tier.
      expect(view.rungs).toHaveLength(ranks.length);
      expect(view.rungs.filter((_, index) => index <= view.currentTier)).toHaveLength(view.currentTier + 1);
    }
  });

  it('spec(A-012:AC-1) the tier-3 name is the catalog’s, not the board’s literal', () => {
    // The board renames tier 3 to "Voyager" because the salutation "Captain" is addressed to the
    // child everywhere else. `src/content/ranks.json` is engine-track and still says "Captain", so
    // hardcoding the board's word here would make this badge the only place in the app that
    // disagrees with the engine. It reads `displayName` and will change by itself.
    const tierThree = ranks.find((rank) => rank.tier === 2);
    expect(rankLadder(captain({ wins: 25 })).rungs.find((r) => r.isCurrent)?.rank.displayName).toBe(
      tierThree?.displayName,
    );
    expect(code('app/rank.tsx')).not.toContain('Voyager');
  });

  it('spec(A-012:AC-1) the ladder, its next-rank card and the grown-up toggle are cut', () => {
    // The board's cut list closes this at item 9 and the owner confirmed. K–3 never sees a ladder,
    // there is no grown-up gate in the app to hang one on, and the private shelf is complete
    // without it. What replaces it is the NEXT UP goal card.
    const screen = code('app/rank.tsx');
    expect(screen).not.toContain('THE LADDER');
    expect(screen).not.toContain('NEXT RANK');
    expect(screen).not.toContain('GROWN-UPS');
    expect(screen).not.toContain('nextRequirement');
    expect(screen).not.toMatch(/rungs\.map[\s\S]{0,80}rank\.minWins/);
    // Non-vacuous: the stripper still sees the code, and the goal card that replaces it is present.
    expect(screen).toContain('rankGoalText');
    expect(screen).toContain('rankLadder');
  });
});

describe('A-012 the trophy shelf', () => {
  it('spec(A-012:AC-2) every tile counts something the captain actually has', () => {
    const c = captain({
      ownedCannons: ['swivel_gun', 'saker'],
      unlockedIslands: ['port_sumwich'],
      ownedSkins: ['oak', 'seaglass', 'sunset'],
    });
    const tiles = rankTrophies(c, 4);

    expect(tiles.map((t) => t.id)).toEqual(['cannons', 'islands', 'ships', 'skills']);
    expect(tiles.map((t) => t.count)).toEqual([2, 1, 3, 4]);
  });

  it('spec(A-012:AC-2) a tile is empty if and only if its count is zero', () => {
    // The board's data carries a hand-written `filled` flag that nothing in its markup reads, and
    // which is set true on CANNONS unconditionally — so a genuine zero would render as filled.
    const none = rankTrophies(captain({ ownedSkins: [] }), 0);
    for (const tile of none) {
      expect(tile.empty, `${tile.id} with count ${tile.count}`).toBe(tile.count === 0);
    }

    const some = rankTrophies(
      captain({ ownedCannons: ['swivel_gun'], unlockedIslands: ['port_sumwich'], ownedSkins: ['oak'] }),
      1,
    );
    expect(some.every((tile) => !tile.empty)).toBe(true);
  });

  it('spec(A-012:AC-2) the flag glyph carries a text-presentation selector', () => {
    // `⚑` has an emoji presentation on some platforms. One colour-emoji tile beside three flat
    // glyphs reads as broken rather than decorated — the same fix `Hud.tsx` applies to its anchor.
    const flag = rankTrophies(captain(), 0).find((tile) => tile.id === 'islands');
    expect(flag?.glyph).toContain('︎');
  });

  it('spec(A-012:AC-2) the shelf heading softens before anything is mastered, and never accuses', () => {
    expect(rankShelfLabel(0)).toContain('JUST STARTED');
    expect(rankShelfLabel(1)).toBe('YOUR SHELF');
    for (const count of [0, 1, 5]) {
      expect(rankShelfLabel(count).toLowerCase()).not.toMatch(/no |none|empty|zero/);
    }
  });
});

describe('A-012 skill rows are operations, not catalog rows', () => {
  it('spec(A-012:AC-3) K–1 shows exactly two rows, + and −', () => {
    // The board: "at K–1 the skill list is two rows, + and − only: no third tile, no silhouette, no
    // lock." `skillProgress` returns THREE rows there, because the catalog splits addition by
    // range. Grouping by operation satisfies the board without a service change.
    const progress = skillProgress(captain({ gradeBand: 'k_1' }));
    // Every K-1 catalog skill gets a progress ROW; the board's rule is about the two rendered
    // GROUPS, and that is what the grouping has to deliver however many skills feed it. A-060's
    // `repeated_addition` is the case that separates the two claims: it is a fourth K-1 skill and
    // it must not become a third tile.
    expect(progress.map((row) => row.skillId)).toEqual([...inBandSkillIds('k_1')]);
    expect(progress.length).toBeGreaterThan(2);

    const rows = rankSkillRows(progress);
    expect(rows.map((row) => row.glyph)).toEqual(['+', '−']);
    expect(rows[0]?.skillIds).toEqual([...rowSkillIds('k_1', '+')]);
    expect(rows[1]?.skillIds).toEqual([...rowSkillIds('k_1', '−')]);
    // Non-vacuity: the `+` row really is aggregating, which is the whole reason it exists.
    expect(rows[0]?.skillIds.length).toBeGreaterThan(1);
  });

  it('spec(A-012:AC-3) the grade-band ceiling survives the grouping', () => {
    // A K–1 child must never see × or ÷. That is guaranteed upstream by `skillProgress`, and the
    // grouping must not reintroduce a glyph for a skill that never reached it.
    const k1 = rankSkillRows(skillProgress(captain({ gradeBand: 'k_1' }))).map((row) => row.glyph);
    expect(k1).not.toContain('×');
    expect(k1).not.toContain('÷');

    const g23 = rankSkillRows(skillProgress(captain({ gradeBand: 'g2_3' }))).map((row) => row.glyph);
    expect(g23).toContain('×');
    expect(g23).toContain('÷');
    expect(g23.slice(0, 2)).toEqual(['+', '−']);

    // And every band's rows are drawn only from skills that band is actually served.
    for (const band of ['k_1', 'g2_3', 'g4_5'] as const) {
      const maxGrade = maxGradeForBand(band);
      for (const row of rankSkillRows(skillProgress(captain({ gradeBand: band })))) {
        for (const id of row.skillIds) {
          expect(skills.find((skill) => skill.id === id)?.minGrade).toBeLessThanOrEqual(maxGrade);
        }
      }
    }
  });

  it('spec(A-012:AC-3) every catalog skill has a glyph, so no row can render blank', () => {
    for (const skill of skills) {
      expect(SKILL_GLYPH[skill.id], `${skill.id} has no operation glyph`).toBeTruthy();
    }
    // Rows are keyed by glyph, so two skills sharing one is the whole point — but a glyph must
    // never be empty, and the two addition skills must genuinely share.
    expect(SKILL_GLYPH.add_within_10).toBe(SKILL_GLYPH.add_within_20);
    expect(SKILL_GLYPH.sub_within_20).not.toBe(SKILL_GLYPH.add_within_10);
  });

  it('spec(A-012:AC-3) a row is mastered only when every skill under it is', () => {
    // `some` would let the + row tick itself the moment addition-within-10 was done, telling a
    // child they had finished something they had not.
    const plus = rowSkillIds('k_1', '+');
    expect(plus.length, 'the + row must aggregate to have anything to prove').toBeGreaterThan(1);

    const half = captain({
      gradeBand: 'k_1',
      // Every skill under the row but one — so `some` ticks and `every` does not, whatever the
      // catalog's addition skills happen to be today.
      mastery: masteryFor(plus.slice(0, -1), masteredMastery()),
    });
    const halfRow = rankSkillRows(skillProgress(half)).find((row) => row.glyph === '+');
    expect(halfRow?.mastered).toBe(false);
    expect(halfRow?.badge).toBe('↗');

    const whole = captain({
      gradeBand: 'k_1',
      mastery: masteryFor(plus, masteredMastery()),
    });
    const wholeRow = rankSkillRows(skillProgress(whole)).find((row) => row.glyph === '+');
    expect(wholeRow?.mastered).toBe(true);
    expect(wholeRow?.badge).toBe('✓');
    expect(wholeRow?.filled).toBe(RANK_METER_SEGMENTS);
  });

  it('spec(A-012:AC-3) a row that is not mastered never shows a full meter', () => {
    // A 100% meter beside a "keep going" badge is a contradiction a non-reader resolves in favour
    // of the picture. This is the exact shape that produces one: the meter counts weighted
    // corrects, mastery also gates on accuracy, so the two can disagree.
    const full = fullMeterButNotMastered();
    expect(meterPercent(full)).toBe(100);
    expect(isMastered(full)).toBe(false);

    const c = captain({ gradeBand: 'k_1', mastery: masteryFor(rowSkillIds('k_1', '+'), full) });
    const row = rankSkillRows(skillProgress(c)).find((r) => r.glyph === '+');
    expect(row?.meterPercent).toBe(100);
    expect(row?.mastered).toBe(false);
    expect(row?.filled).toBe(RANK_METER_SEGMENTS - 1);
  });

  it('spec(A-012:AC-3) rows are ten countable cells, never a percentage width', () => {
    expect(RANK_METER_SEGMENTS).toBe(10);
    for (const row of rankSkillRows(skillProgress(captain({ gradeBand: 'g4_5' })))) {
      expect(Number.isInteger(row.filled)).toBe(true);
      expect(row.filled).toBeGreaterThanOrEqual(0);
      expect(row.filled).toBeLessThanOrEqual(RANK_METER_SEGMENTS);
    }
  });

  it('spec(A-012:AC-3) the MASTERED tile counts the same skills the rows do', () => {
    const c = captain({
      gradeBand: 'k_1',
      mastery: masteryFor(['add_within_10', 'sub_within_20'], masteredMastery()),
    });
    const progress = skillProgress(c);
    expect(rankMasteredCount(progress)).toBe(2);
    expect(rankTrophies(c, rankMasteredCount(progress)).find((t) => t.id === 'skills')?.count).toBe(2);
  });
});

describe('A-012 the goal card', () => {
  it('spec(A-012:AC-1) a captain who has never won is pointed at a duel, by place', () => {
    const c = captain({
      gradeBand: 'k_1',
      wins: 0,
      unlockedIslands: ['port_sumwich'],
      currentIsland: 'port_sumwich',
    });
    expect(rankGoalText(c)).toBe('Win a duel at Port Sumwich to sail on.');
  });

  it('spec(A-012:AC-1) after a win the goal is the fog, in the chart’s own words', () => {
    const c = captain({ gradeBand: 'g2_3', wins: 3, unlockedIslands: ['port_sumwich'], currentIsland: 'port_sumwich' });
    expect(rankGoalText(c)).toBe('Train at Port Sumwich to lift the fog.');
  });

  it('spec(A-012:AC-1) with every island open the goal stops asking for anything', () => {
    const c = captain({
      gradeBand: 'g4_5',
      wins: 12,
      unlockedIslands: islands.map((island) => island.id),
      currentIsland: 'grandline',
    });
    expect(rankGoalText(c)).toContain('Every island is open');
  });

  it('spec(A-012:AC-1) the goal never names a skill id, a rung or a number of wins', () => {
    // This screen shows private progress only. A goal phrased as "3 more wins to reach Commodore"
    // would reintroduce the ladder in a sentence after the ladder was cut.
    const cases = [
      captain({ gradeBand: 'k_1', wins: 0, unlockedIslands: ['port_sumwich'], currentIsland: 'port_sumwich' }),
      captain({ gradeBand: 'k_1', wins: 9, unlockedIslands: ['port_sumwich'] }),
      captain({ gradeBand: 'g4_5', wins: 99, unlockedIslands: islands.map((i) => i.id) }),
      captain(),
    ];

    for (const c of cases) {
      const text = rankGoalText(c);
      expect(text, 'the goal card is never blank').not.toBe('');
      expect(text).not.toMatch(/\d/);
      for (const skill of skills) expect(text).not.toContain(skill.id);
      for (const rank of ranks) expect(text).not.toContain(rank.displayName);
    }
  });
});

describe("A-012 the captain's papers", () => {
  it('spec(A-012:AC-1) two rows, both above the child tap floor', () => {
    expect(CAPTAIN_PAPERS).toHaveLength(2);
    expect(CAPTAIN_PAPERS.map((paper) => paper.id)).toEqual(['name', 'tour']);
    expect(RANK_BOARD.papers.height).toBeGreaterThanOrEqual(64);
    for (const paper of CAPTAIN_PAPERS) {
      expect(paper.title.trim()).not.toBe('');
      expect(paper.accessibilityLabel.trim()).not.toBe('');
    }
  });

  it('spec(A-012:AC-1) each row pushes its own URL, as a literal', () => {
    expect(CAPTAIN_PAPERS.find((p) => p.id === 'name')?.href).toBe('/name-flag?mode=edit');
    expect(CAPTAIN_PAPERS.find((p) => p.id === 'tour')?.href).toBe('/guided-duel?replay=1');

    const screen = code('app/rank.tsx');
    expect(screen).toContain("router.push('/name-flag?mode=edit')");
    expect(screen).toContain("router.push('/guided-duel?replay=1')");
  });

  it('spec(A-012:AC-1) neither row is a demo-graph edge', () => {
    // Both are re-entries into a route the graph already declares, in a different mode. Routing
    // them through the executor would claim the graph had grown a destination it has not, and
    // `demo-navigation.test.ts` walks edges to sources — never the reverse.
    expect(code('app/rank.tsx')).not.toContain('executeDemoRouteEdge');
    for (const paper of CAPTAIN_PAPERS) expect(paper.href).toContain('?');
  });
});

describe('A-012 rank contrast', () => {
  it('spec(A-012:AC-1) every text pair this screen renders clears AA', () => {
    const SUNK = '#F0E2C8';
    const pairs: readonly { readonly where: string; readonly fg: string; readonly bg: string }[] = [
      { where: 'header title on sea-deep', fg: color.white, bg: color.seaDeep },
      { where: 'back arrow on the darkened tile', fg: color.white, bg: RANK_BOARD.backGround },
      { where: 'tier numeral on the parchment plate', fg: color.inkDark, bg: color.parchment },
      { where: 'tier name on the white card', fg: color.inkDark, bg: color.white },
      { where: 'eyebrow on parchment', fg: color.inkDarkMuted, bg: color.parchment },
      { where: 'trophy count on a filled tile', fg: color.inkDark, bg: color.white },
      { where: 'trophy count on an empty tile', fg: color.inkDarkMuted, bg: SUNK },
      { where: 'trophy caption on a filled tile', fg: color.inkDarkMuted, bg: color.white },
      { where: 'trophy caption on an empty tile', fg: color.inkDarkMuted, bg: SUNK },
      { where: 'trophy glyph on the gold plate', fg: color.inkDark, bg: color.amber },
      { where: 'trophy glyph on the empty plate', fg: color.inkDark, bg: color.parchmentEdge },
      { where: 'skill glyph on the sunk tile', fg: color.inkDark, bg: SUNK },
      { where: 'mastered badge on green', fg: color.inkDark, bg: color.success },
      { where: 'in-progress badge on the sunk tile', fg: color.inkDarkMuted, bg: SUNK },
      { where: 'paper title on white', fg: color.inkDark, bg: color.white },
      { where: 'paper detail on white', fg: color.inkDarkMuted, bg: color.white },
      { where: 'NEXT UP eyebrow on gold', fg: color.inkDark, bg: color.gold },
      { where: 'goal text on gold', fg: color.inkDark, bg: color.gold },
    ];

    for (const { where, fg, bg } of pairs) {
      const ratio = contrast(fg, bg);
      expect(ratio, `${where}: ${fg} on ${bg} measures ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('spec(A-012:AC-1) the board’s dimmed empty-tile glyph would have failed, and is not used', () => {
    // The board sets the empty tile's glyph to #4C637A on its #D8CBB2 plate — 3.87, below AA at
    // 16pt. The tile still reads as empty through its sunk ground and grey plate, neither of which
    // is the ink, so darkening the glyph costs the design nothing.
    expect(contrast(color.inkDarkMuted, color.parchmentEdge)).toBeLessThan(4.5);
    expect(contrast(color.inkDark, color.parchmentEdge)).toBeGreaterThanOrEqual(4.5);
  });
});
