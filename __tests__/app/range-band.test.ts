/** A-027 — a captain's grade band is a ceiling, never a suggestion. */
import { describe, expect, it } from 'vitest';

import { getSkill, islands } from '@content/index';
import type { GradeBand, IslandId, SkillId } from '@content/schemas';
import { answerDrill } from '@engine/drill';
import { createRng } from '@engine/rng';
import { openDrill, rangeSkills as rangeSkillsUnderTest } from '../../src/services/range';
import { emptyCaptain, type Captain } from '../../src/stores/player';

const MAX_GRADE_BY_BAND: Readonly<Record<GradeBand, number>> = { k_1: 1, g2_3: 3, g4_5: 5 };

// The public range query must accept the captain's selected band.  Keeping this signature pin
// local lets the RED suite exercise the required behaviour before the implementation changes it.
const rangeSkills = rangeSkillsUnderTest as unknown as (
  islandId: IslandId,
  band: GradeBand,
) => readonly SkillId[];

function captain(band: GradeBand | null): Captain {
  return {
    ...emptyCaptain(),
    gradeBand: band,
    unlockedIslands: ['port_sumwich'],
    currentIsland: 'port_sumwich',
  };
}

describe('A-027 band-safe gunnery range', () => {
  it('spec(A-027:AC-1) a timed-out range question changes neither counts, mastery, nor completion progress', () => {
    const session = openDrill({
      islandId: 'port_sumwich',
      skillId: 'add_within_10',
      captain: captain('k_1'),
      rng: createRng(27),
      length: 2,
    });
    const after = answerDrill(session, null, 1_000);

    expect(after.answered).toBe(session.answered);
    expect(after.correct).toBe(session.correct);
    expect(after.mastery).toEqual(session.mastery);
    expect(after.complete).toBe(session.complete);
    expect(after.current).toEqual(session.current);
  });

  it.each(['k_1', 'g2_3', 'g4_5'] as const)(
    'spec(A-027:AC-2) %s receives only catalog-ordered skills at or below its ceiling from every island',
    (band) => {
      const maxGrade = MAX_GRADE_BY_BAND[band];
      for (const island of islands) {
        const expected = island.rangeSkills.filter((skillId) => getSkill(skillId).minGrade <= maxGrade);
        const actual = rangeSkills(island.id, band);
        expect(actual, `${band}/${island.id} must preserve filtered catalog order`).toEqual(expected);
        for (const skillId of actual) {
          expect(getSkill(skillId).minGrade, `${band}/${island.id}/${skillId}`).toBeLessThanOrEqual(maxGrade);
        }
      }
    },
  );

  it.each([null, 'not_a_grade'] as const)(
    'spec(A-027:AC-5) refuses a drill when grade data is %s instead of defaulting upward',
    (gradeBand) => {
      expect(() =>
        openDrill({
          islandId: 'port_sumwich',
          skillId: 'add_within_10',
          captain: captain(gradeBand as GradeBand | null),
          rng: createRng(28),
          length: 1,
        }),
      ).toThrow(RangeError);
    },
  );

  it('spec(A-027:AC-5) synchronously refuses an explicitly requested skill above the K-1 ceiling', () => {
    const maxGrade = MAX_GRADE_BY_BAND.k_1;
    const island = islands.find((candidate) =>
      candidate.rangeSkills.some((skillId) => getSkill(skillId).minGrade > maxGrade),
    );
    const skillId = island?.rangeSkills.find((candidate) => getSkill(candidate).minGrade > maxGrade);
    expect(island, 'catalog must contain an island with content above the K-1 ceiling').toBeDefined();
    expect(skillId, 'catalog must contain a skill above the K-1 ceiling').toBeDefined();

    expect(() =>
      openDrill({
        islandId: island!.id,
        skillId: skillId!,
        captain: captain('k_1'),
        rng: createRng(29),
        length: 1,
      }),
    ).toThrow(RangeError);
  });
});
