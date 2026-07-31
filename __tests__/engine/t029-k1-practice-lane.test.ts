/**
 * T-029 / D-7 — K-1 practice lane: add_within_10 on Port Sumwich pays via saker.
 *
 * Fog decision (named in tickets/T-029.md): early Isla Products fog lift is accepted as
 * harmless; band-gating still governs served content. Predecessor rule unchanged.
 *
 * ## Re-baselined for owner ruling D-10 (2026-07-31) — two assertions, not the ticket
 *
 * D-10 (`tickets/app/OWNER-RULINGS.md`): **a captain starts with ONE gun**, and the Culverin is
 * the first gun a captain EARNS. Reported from a real playthrough — the guided duel arms one gun
 * and the first real duel handed the child two. `culverin` therefore left `unlock.kind: "starter"`
 * for `{ kind: "range", island: "port_sumwich", tier: 1 }` on `add_within_10`, the same skill the
 * Swivel Gun teaches.
 *
 * T-029's own contract is untouched: the K-1 practice lane still pays, and it still pays via the
 * Saker (AC-1/2/3/5 are byte-identical). Two assertions below described the CULVERIN's old
 * position and had to move with the ruling, deliberately and not silently:
 *
 *  - **AC-4** asserted `not.toContain('culverin')` — true only while the Culverin was a starter.
 *    It now asserts the opposite, because under D-10 the first mastery is exactly where the
 *    Culverin arrives. The assertion's PURPOSE is unchanged: it still pins that mastery pays a
 *    range gun and pays neither a starter nor a chest gun, so `swivel_gun` and `nine_pounder`
 *    stay in the negative list.
 *  - **AC-6** asserted `resolvePlacement('k_1').unlockedCannons` is `['culverin','swivel_gun']`.
 *    The AC is about the SAKER not being pre-granted; the two-starter literal beside it was
 *    incidental and is now `['swivel_gun']`.
 *
 * D-10's known consequence is asserted at the foot of this file rather than left to a reviewer to
 * discover: the first mastery pays three guns at K-1.
 */
import { describe, expect, it } from 'vitest';

import { resolvePlacement } from '@engine/placement';
import { resolveUnlocks, type SkillMastery } from '@engine/mastery';
import { MASTERY_THRESHOLD_CORRECT, TRAY_CAPACITY } from '@engine/tuning';
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
    // D-10: the Culverin is now the FIRST gun a captain earns, on this same skill. This line read
    // `not.toContain` while it was a starter; the AC is about mastery paying a RANGE gun and
    // paying no starter and no chest gun, and both of those still hold below.
    expect(newlyUnlocked).toContain('culverin');
    expect(newlyUnlocked).not.toContain('swivel_gun');
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
    // D-10: one starter, not two. The Culverin moved from this list to the mastery payout above.
    expect([...P.unlockedCannons].sort()).toEqual(['swivel_gun']);
  });

  /**
   * D-10's cost, asserted rather than left for a reviewer to find.
   *
   * At `k_1` the first mastery pays THREE guns against a three-slot tray, on a captain who owns
   * one: `culverin` and `saker` both hang off `add_within_10` (D-7 put the Saker there), and
   * mastering it also opens Isla Products, whose entry cannon `grapeshot` comes with the island
   * (`resolveUnlocks`' "one cannon per island earned"). Grant ORDER is catalog order, so the
   * Culverin — the gun the ruling is about — reads first on the victory panel.
   *
   * `g2_3` and `g4_5` already hold Isla Products from placement, so they receive two.
   *
   * If this count needs to come down, the change is the Saker's SKILL, not the Culverin's unlock
   * and not `unlock.tier` (which no engine code reads). See D-10 in `tickets/app/OWNER-RULINGS.md`.
   */
  it('spec(T-029:AC-4) D-10 — the first mastery pays culverin first, then saker, then the island gun', () => {
    const P = resolvePlacement('k_1');
    const { cannons: newlyUnlocked, islands: newIslands } = resolveUnlocks({
      gradeBand: 'k_1',
      mastery: masteryMapFor(['add_within_10']),
      unlockedCannons: P.unlockedCannons,
      unlockedIslands: P.unlockedIslands,
    });

    expect(newlyUnlocked).toEqual(['culverin', 'saker', 'grapeshot']);
    expect(newIslands).toEqual(['isla_products']);
    expect(newlyUnlocked[0]).toBe('culverin');
    expect(newlyUnlocked.length).toBeGreaterThan(TRAY_CAPACITY - P.unlockedCannons.length);
  });
});
