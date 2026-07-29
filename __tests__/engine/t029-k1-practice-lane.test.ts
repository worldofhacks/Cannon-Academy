/**
 * T-029 / D-7 — K-1 practice lane: add_within_10 on Port Sumwich pays via saker.
 *
 * Fog decision (named in tickets/T-029.md): early Isla Products fog lift is accepted as
 * harmless; band-gating still governs served content. Predecessor rule unchanged.
 */
import { describe, expect, it } from 'vitest';

import { resolvePlacement } from '@engine/placement';
import { resolveUnlocks, type SkillMastery } from '@engine/mastery';
import { MASTERY_THRESHOLD_CORRECT } from '@engine/tuning';
import type { SkillId } from '@content/schemas';
import { getCannon, getIsland } from '@content/index';

const AT_THRESHOLD: SkillMastery = Object.freeze({
  weightedCorrect: MASTERY_THRESHOLD_CORRECT,
  correct: MASTERY_THRESHOLD_CORRECT,
  attempts: MASTERY_THRESHOLD_CORRECT,
});

function masteryMapFor(masteredSkills: readonly SkillId[]): Partial<Record<SkillId, SkillMastery>> {
  const map: Partial<Record<SkillId, SkillMastery>> = {};
  for (const id of masteredSkills) {
    map[id] = AT_THRESHOLD;
  }
  return map;
}

describe('T-029 / D-7 — K-1 practice lane pays', () => {
  it('spec(T-029:AC-1) port_sumwich.rangeSkills includes add_within_10', () => {
    expect(getIsland('port_sumwich').rangeSkills).toContain('add_within_10');
  });

  it('spec(T-029:AC-2,AC-3) saker is a range unlock on add_within_10 at port_sumwich', () => {
    const saker = getCannon('saker');
    expect(saker.skill).toBe('add_within_10');
    expect(saker.unlock).toEqual({ kind: 'range', island: 'port_sumwich', tier: 1 });
    expect(getIsland('port_sumwich').unlocksCannons).toContain('saker');
  });

  it('spec(T-029:AC-4) mastering only add_within_10 unlocks saker, not starters or chests', () => {
    const P = resolvePlacement('k_1');
    const { cannons: newlyUnlocked } = resolveUnlocks({
      mastery: masteryMapFor(['add_within_10']),
      unlockedCannons: P.unlockedCannons,
      unlockedIslands: P.unlockedIslands,
    });

    expect(newlyUnlocked).toContain('saker');
    expect(newlyUnlocked).not.toContain('swivel_gun');
    expect(newlyUnlocked).not.toContain('culverin');
    expect(newlyUnlocked).not.toContain('nine_pounder');
    expect(newlyUnlocked).not.toContain('six_pounder');
  });

  it('spec(T-029:AC-5) mastering add_within_10 still lifts Isla Products fog (accepted; band-gating governs content)', () => {
    const { islands: newlyUnlocked } = resolveUnlocks({
      mastery: masteryMapFor(['add_within_10']),
      unlockedCannons: [],
      unlockedIslands: ['port_sumwich'],
    });
    expect(newlyUnlocked).toContain('isla_products');
  });

  it('spec(T-029:AC-6) resolvePlacement(k_1) does not pre-grant saker', () => {
    const P = resolvePlacement('k_1');
    expect(P.unlockedCannons).not.toContain('saker');
    expect([...P.unlockedCannons].sort()).toEqual(['culverin', 'swivel_gun']);
  });
});
