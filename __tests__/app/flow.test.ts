/**
 * A-003 — the flow resolver.
 *
 * One pure function decides which screen a captain belongs on. It is deliberately not a hook and
 * not a component: that is what makes it exhaustively testable, and what guarantees there is
 * exactly ONE place that decides. Three routes existed before this and none guarded anything.
 */
import { describe, expect, it } from 'vitest';

import { emptyCaptain, type Captain } from '../../src/stores/player';
import { DESTINATIONS, resolveDestination } from '../../src/services/flow';

const captain = (over: Partial<Captain> = {}): Captain => ({ ...emptyCaptain(), ...over });

/** A captain who has finished onboarding and the guided duel. */
const settled = (over: Partial<Captain> = {}): Captain =>
  captain({
    gradeBand: 'k_1',
    name: 'Ada',
    flag: 'flag-1',
    ownedCannons: ['swivel_gun'],
    equippedCannons: ['swivel_gun'],
    unlockedIslands: ['port_sumwich'],
    hasCompletedOnboarding: true,
    hasFoughtGuidedDuel: true,
    ...over,
  });

describe('A-003 flow resolver', () => {
  it('spec(A-003:AC-1) a captain with no band goes to the grade picker', () => {
    expect(resolveDestination(captain())).toBe('onboarding');
  });

  it('spec(A-003:AC-2) a band but no name goes to name/flag', () => {
    expect(resolveDestination(captain({ gradeBand: 'k_1' }))).toBe('name-flag');
  });

  it('spec(A-003:AC-4) a named captain who has not fought the guided duel goes to it, once', () => {
    // Equipped from the start: placement equips what it grants, so a captain reaching this point
    // always has a gun. Omitting it made the follow-up assertion land on `gun-deck` — correctly,
    // which is the loadout guard doing its job on a fixture that had no business being empty.
    const fresh = captain({
      gradeBand: 'k_1',
      name: 'Ada',
      flag: 'flag-1',
      ownedCannons: ['swivel_gun'],
      equippedCannons: ['swivel_gun'],
    });
    expect(resolveDestination(fresh)).toBe('guided-duel');
    expect(resolveDestination({ ...fresh, hasFoughtGuidedDuel: true })).toBe('chart');
  });

  it('spec(A-003:AC-3) a returning captain goes to the chart — never the title, never onboarding', () => {
    const d = resolveDestination(settled());
    expect(d).toBe('chart');
    expect(d).not.toBe('onboarding');
    expect(d).not.toBe('title');
  });

  it('spec(A-003:AC-6) an empty loadout diverts to the gun deck rather than an unplayable duel', () => {
    expect(resolveDestination(settled({ equippedCannons: [] }))).toBe('gun-deck');
  });

  it('spec(A-003:AC-5) the function is total across every combination of captain flags', () => {
    const bools = [false, true];
    const valid = new Set<string>(DESTINATIONS);
    for (const hasBand of bools)
      for (const hasName of bools)
        for (const hasFlag of bools)
          for (const onboarded of bools)
            for (const guided of bools)
              for (const hasCannon of bools) {
                const c = captain({
                  gradeBand: hasBand ? 'k_1' : null,
                  name: hasName ? 'Ada' : '',
                  flag: hasFlag ? 'flag-1' : null,
                  hasCompletedOnboarding: onboarded,
                  hasFoughtGuidedDuel: guided,
                  ownedCannons: hasCannon ? ['swivel_gun'] : [],
                  equippedCannons: hasCannon ? ['swivel_gun'] : [],
                  unlockedIslands: ['port_sumwich'],
                });
                const d = resolveDestination(c);
                expect(valid.has(d), `unhandled state produced "${d}"`).toBe(true);
              }
  });
});
