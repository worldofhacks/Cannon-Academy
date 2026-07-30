/**
 * A-051 — the curriculum ceiling holds everywhere, including where it only shows.
 *
 * Two bugs, one cause: a grade band gates what a child is ASKED in several places, and each of those
 * places had to remember to apply it. Two forgot.
 *
 *   1. `app/gun-deck.tsx` drew a flat `['+', '−', '×', '÷']` operator row, so a kindergartner saw
 *      multiplication and division on their own deck — dulled, as things not yet earned, three years
 *      before the curriculum introduces them.
 *   2. `chartNodes` measured `cleared` against EVERY skill an island teaches. Port Sumwich teaches
 *      four and one of them, `two_step_add_sub`, is `minGrade: 2`. A K-1 captain is never served it,
 *      so `every` could never be satisfied and their first island could never earn its green check
 *      however completely they finished it.
 *
 * The second is the more interesting failure: the tick was unreachable, not merely wrong, and no
 * existing test caught it because none of them picked a band and then mastered everything reachable.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getIsland, getSkill, islands, skills } from '../../src/content/index';
import type { GradeBand, IslandId, SkillId } from '../../src/content/schemas';
import { maxGradeForBand } from '../../src/engine/placement';
import { chartNodes } from '../../src/services/chart';
import { emptyCaptain } from '../../src/stores/player';
import type { Captain } from '../../src/stores/player';
import { MASTERY_THRESHOLD_CORRECT } from '../../src/engine/tuning';

const BANDS: readonly GradeBand[] = ['k_1', 'g2_3', 'g4_5'];

/**
 * A captain at `band` with `mastered` fully mastered and everything else untouched.
 *
 * `isMastered` needs BOTH `weightedCorrect >= MASTERY_THRESHOLD_CORRECT` and accuracy above a floor,
 * so a fixture that only sets the weighted total silently fails the accuracy half — `correct` and
 * `attempts` are what accuracy divides. Set all three, perfectly, so the fixture cannot be the reason
 * a test goes red.
 */
function captainWith(band: GradeBand, mastered: readonly SkillId[]): Captain {
  const base = emptyCaptain();
  const n = MASTERY_THRESHOLD_CORRECT * 4;
  const mastery = Object.fromEntries(
    mastered.map((id) => [id, { weightedCorrect: n, correct: n, attempts: n }]),
  );
  return {
    ...base,
    gradeBand: band,
    // Every island open, so `cleared` is measured rather than masked by fog.
    unlockedIslands: islands.map((i) => i.id),
    currentIsland: 'port_sumwich',
    mastery: mastery as Captain['mastery'],
  };
}

/** The skills an island teaches that this band will actually be asked. */
function inBandSkills(islandId: IslandId, band: GradeBand): readonly SkillId[] {
  const maxGrade = maxGradeForBand(band);
  return getIsland(islandId).rangeSkills.filter((s) => getSkill(s).minGrade <= maxGrade);
}

describe('A-051 grade-band ceiling', () => {
  it('spec(A-051:AC-1) the green check is REACHABLE for every band on every island it can teach', () => {
    // The regression, stated as the property it violated: if a band can be taught an island at all,
    // then mastering everything that band is offered there must clear it.
    for (const band of BANDS) {
      for (const island of islands) {
        const reachable = inBandSkills(island.id, band);
        if (reachable.length === 0) continue;

        const node = chartNodes(captainWith(band, reachable)).find((n) => n.island.id === island.id);
        expect(
          node?.cleared,
          `${island.id} is unclearable at ${band}: mastered all ${reachable.length} in-band ` +
            `skill(s) [${reachable.join(', ')}] and it still did not tick. The island teaches ` +
            `[${island.rangeSkills.join(', ')}].`,
        ).toBe(true);
      }
    }
  });

  it('spec(A-051:AC-1) K-1 clears Port Sumwich without the out-of-band two_step_add_sub', () => {
    // The exact reported case, pinned as its own test so the failure message names the child.
    const reachable = inBandSkills('port_sumwich', 'k_1');
    expect(reachable).not.toContain('two_step_add_sub');
    expect(getSkill('two_step_add_sub').minGrade).toBeGreaterThan(maxGradeForBand('k_1'));

    const node = chartNodes(captainWith('k_1', reachable)).find((n) => n.island.id === 'port_sumwich');
    expect(node?.cleared).toBe(true);
  });

  it('spec(A-051:AC-1) an island with nothing in band is NOT ticked by vacuous truth', () => {
    // `[].every(...)` is `true`. Without a length guard this would tick every island above the band,
    // which is worse than the bug it replaced.
    const node = chartNodes(captainWith('k_1', [])).find((n) => n.island.id === 'quotient_cove');
    expect(inBandSkills('quotient_cove', 'k_1')).toEqual([]);
    expect(node?.cleared).toBe(false);
  });

  it('spec(A-051:AC-2) mastering nothing clears nothing, at every band', () => {
    for (const band of BANDS) {
      const cleared = chartNodes(captainWith(band, [])).filter((n) => n.cleared);
      expect(
        cleared.map((n) => n.island.id),
        `${band} ticked an island with no mastery`,
      ).toEqual([]);
    }
  });

  it('spec(A-051:AC-3) the gun deck operator row is gated by band, and its grades match the catalog', () => {
    const source = fileURLToPath(new URL('../../app/gun-deck.tsx', import.meta.url));
    const text = readFileSync(source, 'utf8');

    // It must not be a flat literal any more, and it must consult the band.
    expect(text).not.toMatch(/const OPERATIONS[^=]*=\s*\['\+', '−', '×', '÷'\]/);
    expect(text).toMatch(/maxGradeForBand/);
    expect(text).toMatch(/OPERATION_MIN_GRADE/);

    // The grade each operator claims must be the lowest minGrade of a catalog skill using it — so
    // the chip appears exactly when the curriculum does, rather than at a hand-picked number.
    const declared = [...text.matchAll(/\{\s*glyph:\s*'(.)',\s*minGrade:\s*(\d+)\s*\}/g)].map(
      (m) => [m[1]!, Number(m[2])] as const,
    );
    expect(declared.length).toBeGreaterThanOrEqual(4);

    const lowestFor = (test: (id: SkillId) => boolean): number =>
      Math.min(...skills.filter((s) => test(s.id)).map((s) => s.minGrade));

    const expected: Readonly<Record<string, number>> = {
      '+': lowestFor((id) => id.startsWith('add_')),
      '−': lowestFor((id) => id.startsWith('sub_')),
      '×': lowestFor((id) => id.startsWith('mult_')),
      '÷': lowestFor((id) => id.startsWith('div_')),
    };

    for (const [glyph, grade] of declared) {
      const want = expected[glyph];
      if (want === undefined) continue;
      expect(grade, `${glyph} is declared at grade ${grade}; the catalog introduces it at ${want}`).toBe(
        want,
      );
    }
  });

  it('spec(A-051:AC-3) K-1 sees no multiplication or division anywhere it is offered a choice', () => {
    // Belt and braces on the thing the owner actually reported: at K-1 the reachable curriculum
    // contains no × or ÷ skill at all, so any surface showing one is showing it from a literal.
    const maxGrade = maxGradeForBand('k_1');
    const reachable = skills.filter((s) => s.minGrade <= maxGrade).map((s) => s.id);
    expect(reachable.some((id) => id.startsWith('mult_'))).toBe(false);
    expect(reachable.some((id) => id.startsWith('div_'))).toBe(false);
  });
});
