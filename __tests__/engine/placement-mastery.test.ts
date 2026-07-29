/**
 * T-032 — composition of `resolvePlacement` + `resolveUnlocks` under owner ruling D-6.
 *
 * Placement grants starter cannons only. Range guns must still arrive through mastery:
 * a fully-mastered g4_5 captain earns every `unlock.kind === 'range'` cannon via
 * `resolveUnlocks`, and a k_1 captain who masters `add_within_20` + `sub_within_20` earns
 * `six_pounder` and `chain_shot` without re-listing the starters.
 *
 * Lives in a dedicated file so `__tests__/engine/mastery.test.ts` (T-010) stays frozen.
 *
 * Threshold constant: ticket text says `MASTERY_THRESHOLD`; the engine exports
 * `MASTERY_THRESHOLD_CORRECT` (T-004 / T-010). Tests use the exported name.
 */
import { describe, expect, it } from 'vitest';

import { resolvePlacement } from '@engine/placement';
import { resolveUnlocks, type SkillMastery } from '@engine/mastery';
import { MASTERY_THRESHOLD_CORRECT } from '@engine/tuning';
import type { CannonId, SkillId } from '@content/schemas';
import { SKILL_IDS } from '@content/schemas';
import { cannons } from '@content/index';

/** A mastery at exactly the threshold with perfect accuracy — clears both mastery gates. */
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

const sorted = <T extends string>(xs: readonly T[]): T[] => [...xs].sort();

/** Catalog-derived: every range-unlock cannon (today eight — includes T-029 saker). */
function allRangeCannonIds(): CannonId[] {
  return cannons.filter((c) => c.unlock.kind === 'range').map((c) => c.id);
}

describe('T-032 AC-5 — fully-mastered g4_5 earns every range gun through resolveUnlocks', () => {
  it('spec(T-032:AC-5) dod(T-032:6) resolveUnlocks returns all eight range cannons from a starters-only placement', () => {
    const P = resolvePlacement('g4_5');

    // Sanity: placement itself must not already own range guns (else the delta is empty — the bug).
    for (const id of allRangeCannonIds()) {
      expect(P.unlockedCannons, `placement must leave '${id}' for mastery`).not.toContain(id);
    }

    const mastery = masteryMapFor([...SKILL_IDS]);
    const { cannons: newlyUnlocked } = resolveUnlocks({
      mastery,
      unlockedCannons: P.unlockedCannons,
      unlockedIslands: P.unlockedIslands,
    });

    const expected = allRangeCannonIds();
    expect(expected.length, 'fixture sanity: catalog must have range cannons').toBe(8);
    expect(sorted(newlyUnlocked)).toEqual(sorted(expected));
  });

  it('spec(T-032:AC-5) returned cannons are all unlock.kind === range, cover every range id, and never re-list starters', () => {
    const P = resolvePlacement('g4_5');
    const { cannons: newlyUnlocked } = resolveUnlocks({
      mastery: masteryMapFor([...SKILL_IDS]),
      unlockedCannons: P.unlockedCannons,
      unlockedIslands: P.unlockedIslands,
    });

    const expected = allRangeCannonIds();
    expect(sorted(newlyUnlocked)).toEqual(sorted(expected));
    for (const id of newlyUnlocked) {
      const cannon = cannons.find((c) => c.id === id);
      expect(cannon, `'${id}' must be a real catalog cannon`).toBeDefined();
      expect(cannon!.unlock.kind).toBe('range');
    }
    for (const starter of P.unlockedCannons) {
      expect(newlyUnlocked, `must not re-list starter '${starter}'`).not.toContain(starter);
    }
  });
});

describe('T-032 AC-6 — k_1 mastery of add_within_20 + sub_within_20 unlocks the two grade-1 range guns', () => {
  it('spec(T-032:AC-6) resolveUnlocks includes six_pounder and chain_shot and does not re-list starters', () => {
    const P = resolvePlacement('k_1');

    // Placement must leave these for mastery — otherwise the delta is empty (the wave-3 bug).
    expect(P.unlockedCannons).not.toContain('six_pounder');
    expect(P.unlockedCannons).not.toContain('chain_shot');

    const { cannons: newlyUnlocked } = resolveUnlocks({
      mastery: masteryMapFor(['add_within_20', 'sub_within_20']),
      unlockedCannons: P.unlockedCannons,
      unlockedIslands: P.unlockedIslands,
    });

    expect(newlyUnlocked).toContain('six_pounder');
    expect(newlyUnlocked).toContain('chain_shot');
    expect(newlyUnlocked).not.toContain('swivel_gun');
    expect(newlyUnlocked).not.toContain('culverin');
  });

  it('spec(T-032:AC-6) empty mastery yields no cannon delta from a starters-only k_1 placement', () => {
    const P = resolvePlacement('k_1');
    const { cannons: newlyUnlocked } = resolveUnlocks({
      mastery: {},
      unlockedCannons: P.unlockedCannons,
      unlockedIslands: P.unlockedIslands,
    });
    expect(newlyUnlocked).toEqual([]);
  });
});
