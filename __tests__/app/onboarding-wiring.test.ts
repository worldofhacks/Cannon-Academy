/**
 * A-005 — onboarding wired to placement, and the root layout wired to the flow resolver.
 *
 * Board 1a already renders correctly. What is missing is everything behind the tap: the chosen
 * band goes into component state and the screen pushes to `/duel`, so `resolvePlacement` is never
 * called with it and the islands and starter cannons the whole placement design exists to grant
 * are never granted. These tests assert the wiring, not the pixels.
 *
 * **Why there is no rendering here.** vitest runs in a node environment and React Native's entry
 * point is Flow-typed, which the node parser cannot read — importing `app/onboarding.tsx` or
 * `app/_layout.tsx` fails to parse before a single assertion runs, and that failure would look
 * like RED while proving nothing. So the wiring is asserted where it belongs: against the captain
 * store, the flow resolver, and a PURE commit function the screen calls.
 *
 * **The module this ticket assumes.** `src/services/onboarding.ts`:
 *
 *     commitGradeBand(store: CaptainStore, band: GradeBand): Destination
 *
 * It writes the band through the store (which is what calls `resolvePlacement`) and returns the
 * destination the flow resolver gives for the captain that results. The return type is what stops
 * the screen inventing its own next route — the screen navigates to what it is handed.
 *
 * **Two source-text assertions** (`_layout.tsx`, `onboarding.tsx`) read the screens as TEXT rather
 * than importing them, so no RN module is parsed. There is precedent: `player-store.test.ts`
 * `spec(A-001:AC-7)` guards the store's import boundary the same way. They are the only mechanism
 * available for "and from nowhere else", which is a claim about what the file does NOT do and is
 * therefore invisible to any test of the function's output.
 *
 * **AC-4 is deliberately not tested here.** "Given a 360×640 screen, all three cards meet
 * `MIN_TAP_TARGET` and no content is clipped" is screen geometry under a real layout pass, and
 * `.tdd-swarm/posture.md` records the owner-approved, conditional deferral of component-level
 * frozen tests for `app/**`. AC-4 is held by mechanism (3) of that deferral — screenshot evidence
 * at 360×640 / 375 / 390×844 / 430×932, attached to the ticket and reviewed by a second agent. A
 * test asserting `MIN_TAP_TARGET >= 44` here would assert a constant this ticket does not change
 * and would report the criterion as covered when nothing had been measured. That is worse than an
 * honest gap, so it is left as an honest gap.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { cannons } from '../../src/content/index';
import { GRADE_BANDS, type CannonId } from '../../src/content/schemas';
import { resolvePlacement } from '../../src/engine/placement';
import { DESTINATIONS, resolveDestination } from '../../src/services/flow';
import { commitGradeBand } from '../../src/services/onboarding';
import { hydrate, persist, type KeyValueStore } from '../../src/services/persistence';
import { createCaptainStore, emptyCaptain, type CaptainStore } from '../../src/stores/player';

/** An in-memory stand-in for AsyncStorage, exactly as `persistence.test.ts` builds it. */
function fakeStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  const store: KeyValueStore = {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
  };
  return { store, data };
}

/**
 * The cannons placement is allowed to grant at a band, DERIVED from the live catalog and owner
 * rulings D-6 + D-9. Not a hand-copied id list: starters plus the two approved exceptions.
 */
function expectedPlacementCannons(band: (typeof GRADE_BANDS)[number]): CannonId[] {
  const placement = resolvePlacement(band);
  return [...placement.unlockedCannons].sort();
}

const sorted = (ids: readonly CannonId[]): CannonId[] => [...ids].sort();

const readSource = async (relative: string): Promise<string> => {
  const fs = await import('node:fs/promises');
  return fs.readFile(new URL(relative, import.meta.url), 'utf8');
};

let store: CaptainStore;
beforeEach(() => {
  store = createCaptainStore();
});

describe('A-005 onboarding wiring', () => {
  it('spec(A-005:AC-1) committing a band writes placement’s cannons and islands into the captain', () => {
    // Swept across every band rather than sampled: a wiring bug that only reaches `k_1` is a bug
    // that only a five-year-old finds.
    for (const band of GRADE_BANDS) {
      const fresh = createCaptainStore();
      commitGradeBand(fresh, band);

      const captain = fresh.getState().captain;
      const placement = resolvePlacement(band);

      expect(captain.gradeBand).toBe(band);
      expect(sorted(captain.ownedCannons)).toEqual(sorted(placement.unlockedCannons));
      expect([...captain.unlockedIslands].sort()).toEqual([...placement.unlockedIslands].sort());
    }
  });

  it('spec(A-005:AC-1) placement grants starters plus only D-9 exceptions, per owner rulings', () => {
    for (const band of GRADE_BANDS) {
      const fresh = createCaptainStore();
      commitGradeBand(fresh, band);

      const granted = fresh.getState().captain.ownedCannons;
      expect(sorted(granted)).toEqual(expectedPlacementCannons(band));

      for (const id of granted) {
        const cannon = cannons.find((c) => c.id === id);
        expect(cannon, `granted unknown cannon ${id}`).toBeDefined();
        const isStarter = cannon!.unlock.kind === 'starter';
        const isException =
          (id === 'six_pounder' && (band === 'g2_3' || band === 'g4_5')) ||
          (id === 'twelve_pounder' && band === 'g4_5');
        expect(isStarter || isException, `${id} is not an approved placement grant at ${band}`).toBe(
          true,
        );
      }
    }
  });

  it('spec(A-005:AC-1) the captain leaves the picker able to sail — a gun equipped, an island to sail to', () => {
    commitGradeBand(store, 'k_1');
    const c = store.getState().captain;

    // Not decoration: an empty loadout diverts to the gun deck (`spec(A-003:AC-6)`) and a null
    // island leaves the chart with nowhere to put the ship. Placement writing them is what makes
    // the next screen reachable at all.
    expect(c.equippedCannons.length).toBeGreaterThan(0);
    expect(c.equippedCannons.every((id) => c.ownedCannons.includes(id))).toBe(true);
    expect(c.currentIsland).not.toBeNull();
  });

  it('spec(A-005:AC-2) the committed band and its unlocks survive a persist/hydrate round-trip', async () => {
    const io = fakeStorage();
    commitGradeBand(store, 'g4_5');
    const written = store.getState().captain;

    await persist(io.store, written);
    const { captain: rehydrated } = await hydrate(io.store);

    expect(rehydrated).toEqual(written);
    expect(rehydrated.gradeBand).toBe('g4_5');
    expect(sorted(rehydrated.ownedCannons)).toEqual(sorted(written.ownedCannons));
    expect(rehydrated.unlockedIslands).toEqual(written.unlockedIslands);
  });

  it('spec(A-005:AC-2) a relaunch after committing never returns the captain to the grade picker', async () => {
    const io = fakeStorage();
    commitGradeBand(store, 'k_1');
    await persist(io.store, store.getState().captain);

    const { captain: rehydrated, recovered, migrated } = await hydrate(io.store);
    expect(recovered).toBe(false);
    expect(migrated).toBe(false);
    // The failure this exists to prevent: a returning captain shown onboarding, which looks to a
    // child exactly like their progress was erased.
    expect(resolveDestination(rehydrated)).not.toBe('onboarding');
  });

  it('spec(A-005:AC-3) a fresh captain resolves to the picker; a committed band moves on to name/flag', () => {
    expect(resolveDestination(emptyCaptain())).toBe('onboarding');

    commitGradeBand(store, 'k_1');
    expect(resolveDestination(store.getState().captain)).toBe('name-flag');
  });

  it('spec(A-005:AC-3) the commit hands back the resolver’s destination, never a route of its own', () => {
    for (const band of GRADE_BANDS) {
      const fresh = createCaptainStore();
      const returned = commitGradeBand(fresh, band);

      // The screen navigates to what it is handed. If this returned anything other than the
      // resolver's answer there would be two places deciding the flow, which is the exact defect
      // A-003 exists to remove.
      expect(returned).toBe(resolveDestination(fresh.getState().captain));
      expect(DESTINATIONS as readonly string[]).toContain(returned);
    }
  });

  it('spec(A-005:AC-3) the root layout asks the flow resolver and decides nothing itself', async () => {
    const src = await readSource('../../app/_layout.tsx');

    expect(src).toMatch(/resolveDestination/);
    expect(src).toMatch(/services\/flow/);

    // "From nowhere else" is a claim about what the file does NOT do, so it is asserted as an
    // absence: a layout that reads captain fields is re-deciding the flow beside the resolver,
    // and the second decision is the one that drifts.
    for (const field of [
      'gradeBand',
      'hasCompletedOnboarding',
      'hasFoughtGuidedDuel',
      'equippedCannons',
      'unlockedIslands',
    ]) {
      expect(src, `_layout.tsx branches on captain.${field} instead of delegating`).not.toMatch(
        new RegExp(field),
      );
    }
  });

  it('dod(A-005:3) the picker writes the band through the store and holds none of it in component state', async () => {
    const src = await readSource('../../app/onboarding.tsx');

    expect(src).toMatch(/commitGradeBand/);
    // The band held in `useState` is the whole defect: it dies with the component, so nothing is
    // ever placed and nothing is ever persisted.
    expect(src).not.toMatch(/useState<\s*GradeBand/);
    // Pushing straight to `/duel` is the hardcoded route that bypasses the resolver.
    expect(src).not.toMatch(/router\.(push|replace)\(\s*['"]\/duel['"]/);
  });
});
