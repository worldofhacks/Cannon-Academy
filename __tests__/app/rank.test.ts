/**
 * A-012 — rank ladder and mastery progress.
 *
 * `ranks.json` ships five tiers and `rankTierForWins` is a complete engine function. Neither
 * reached a screen until this ticket. The logic lives in `src/services/rankView.ts` and is tested
 * headless; `app/rank.tsx` renders it.
 */
import { describe, expect, it } from 'vitest';

import { ranks, skills } from '@content/index';
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

const rankLadder: (captain: Captain) => RankLadderView = rankLadderUnderTest;
const skillProgress: (captain: Captain) => readonly SkillProgressRow[] = skillProgressUnderTest;

const captain = (over: Partial<Captain> = {}): Captain => ({ ...emptyCaptain(), ...over });

async function readSource(relative: string): Promise<string> {
  const fs = await import('node:fs/promises');
  return fs.readFile(new URL(relative, import.meta.url), 'utf8');
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
