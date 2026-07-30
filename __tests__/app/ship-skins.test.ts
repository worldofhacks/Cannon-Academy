/**
 * A-052 — ship skins: the catalog, the migration, and the one rule a purchase must not break.
 *
 * The migration is the dangerous half. `Captain` gained two fields after v2 saves were already on
 * real devices, and `persistence.ts` treats storage as untrusted — so the failure mode is not a
 * crash, it is a child launching the app and finding their progress silently reset because a
 * validator rejected a save that was perfectly good. Every hydrate case below exists for that.
 */
import { describe, expect, it } from 'vitest';

import { hydrate, persist, SCHEMA_VERSION } from '../../src/services/persistence';
import { emptyCaptain } from '../../src/stores/player';
import type { Captain } from '../../src/stores/player';
import { flagById } from '../../src/theme/flags';
import { shipCosmeticsForCaptain, shipCosmeticsForSkin } from '../../src/theme/shipCosmetics';
import {
  DEFAULT_SKIN_ID,
  purchasableSkins,
  SHIP_SKINS,
  skinById,
  skinOrDefault,
} from '../../src/theme/shipSkins';

/** An in-memory store, so the round trip is the real `persist`/`hydrate` pair. */
function memoryStore(seed?: string) {
  let value: string | null = seed ?? null;
  return {
    getItem: async (): Promise<string | null> => value,
    setItem: async (_k: string, v: string): Promise<void> => {
      value = v;
    },
    removeItem: async (): Promise<void> => {
      value = null;
    },
    read: () => value,
  };
}

/** A v2 save written BEFORE skins existed — the exact shape on a device today. */
function preSkinSave(overrides: Record<string, unknown> = {}): string {
  const { ownedSkins: _o, equippedSkin: _e, ...rest } = emptyCaptain() as unknown as Record<string, unknown>;
  return JSON.stringify({
    version: SCHEMA_VERSION,
    captain: { ...rest, name: 'Wren', coins: 120, ...overrides },
  });
}

describe('A-052 ship skin catalog', () => {
  it('spec(A-052:AC-1) the catalog matches the board — ids, prices and rarity', () => {
    expect(SHIP_SKINS.map((s) => s.id)).toEqual(['oak', 'seaglass', 'sunset', 'deepink']);
    expect(SHIP_SKINS.map((s) => s.price)).toEqual([0, 60, 140, 260]);
    expect(SHIP_SKINS.map((s) => s.rarity)).toEqual([1, 1, 2, 3]);

    /**
     * The designer's one number not to "tidy":
     *
     * > "If a skin costs exactly two duels, the shop becomes a chore list. Slight misalignment — 60
     * > when a duel pays 20–40 — means the child sometimes gets there in two wins and sometimes
     * > three, and arriving early feels like luck rather than arithmetic."
     *
     * The property is NOT "indivisible by the base payout" — 60, 140 and 260 are all multiples of
     * 20, and asserting otherwise fails on prices the designer chose deliberately. What must hold is
     * that the WIN COUNT VARIES with how well the child played: a duel pays `COINS_WIN_BASE` 20 at
     * worst and about 40 at best (base + the accuracy bonus at 100%), so the number of wins needed
     * at the ceiling must be strictly fewer than at the floor. That is what makes arriving early
     * feel like luck instead of arithmetic.
     */
    const WORST_WIN = 20;
    const BEST_WIN = 40;
    for (const skin of purchasableSkins()) {
      const atWorst = Math.ceil(skin.price / WORST_WIN);
      const atBest = Math.ceil(skin.price / BEST_WIN);
      expect(
        atBest,
        `${skin.name} at ${skin.price} always takes exactly ${atWorst} wins — a fixed price is a chore list`,
      ).toBeLessThan(atWorst);
    }
  });

  it('spec(A-052:AC-1) the starter is free and is the default; everything else costs', () => {
    expect(skinOrDefault(null).id).toBe(DEFAULT_SKIN_ID);
    expect(skinById(DEFAULT_SKIN_ID)?.price).toBe(0);
    expect(purchasableSkins().map((s) => s.id)).toEqual(['seaglass', 'sunset', 'deepink']);
  });

  it('spec(A-052:AC-1) an unknown or renamed skin id falls back to the starter, never to nothing', () => {
    expect(skinById('from-a-future-build')).toBeUndefined();
    expect(skinOrDefault('from-a-future-build').id).toBe(DEFAULT_SKIN_ID);
    expect(skinOrDefault(undefined).id).toBe(DEFAULT_SKIN_ID);
  });

  it('spec(A-052:AC-2) a skin carries no engine meaning — paint only', async () => {
    // The designer's hard rule: "the moment coins buy power, cut the screen". A skin has no field
    // that could reach damage, mastery, fuse length or an unlock, and this asserts the SHAPE so a
    // future "+2 damage" cannot be added without deleting a test.
    const allowed = new Set([
      'id',
      'name',
      'hull',
      'hullDeep',
      'trim',
      'deck',
      'sail',
      'pennant',
      'rarity',
      'price',
    ]);
    for (const skin of SHIP_SKINS) {
      for (const key of Object.keys(skin)) {
        expect(allowed.has(key), `skin "${skin.id}" carries a non-cosmetic field: ${key}`).toBe(true);
      }
    }

    // And the module must not reach into the engine or the content catalog at all.
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(fileURLToPath(new URL('../../src/theme/shipSkins.ts', import.meta.url)), 'utf8');
    expect(src).not.toMatch(/from '@engine/);
    expect(src).not.toMatch(/from '@content/);
  });
});

describe('A-052 the equipped skin reaches the ship', () => {
  it('spec(A-052:AC-3) the duel ship wears the equipped skin', () => {
    const deepInk = skinById('deepink')!;
    const captain: Captain = { ...emptyCaptain(), ownedSkins: ['oak', 'deepink'], equippedSkin: 'deepink' };
    const cosmetics = shipCosmeticsForCaptain(captain);

    expect(cosmetics.hull).toBe(deepInk.hull);
    expect(cosmetics.hullDeep).toBe(deepInk.hullDeep);
    expect(cosmetics.sail).toBe(deepInk.sail);
    expect(cosmetics.trim).toBe(deepInk.trim);
    expect(cosmetics.deck).toBe(deepInk.deck);
  });

  it('spec(A-052:AC-4) the onboarding FLAG beats the skin for the pennant', () => {
    // Board 5b: the flag is the mark a child recognises as theirs. A purchase must not overwrite it.
    const deepInk = skinById('deepink')!;
    const captain: Captain = {
      ...emptyCaptain(),
      flag: 'flag-3',
      ownedSkins: ['oak', 'deepink'],
      equippedSkin: 'deepink',
    };

    const cosmetics = shipCosmeticsForCaptain(captain);
    expect(cosmetics.pennant).toBe(flagById('flag-3')?.color);
    expect(cosmetics.pennant).not.toBe(deepInk.pennant);

    // …and so does every PREVIEW. The designer overturned my first ruling here, correctly: for a
    // non-reader the picture is the contract, so a card that flies a pennant the purchase then
    // changes is a broken promise. The cards differ on hull, stripe, deck and sails instead.
    expect(shipCosmeticsForSkin(deepInk, captain).pennant).toBe(flagById('flag-3')?.color);
    expect(shipCosmeticsForSkin(deepInk, captain).pennant).not.toBe(deepInk.pennant);

    // The skin's own pennant hex stays on the record — it is what a flag shelf would sell later.
    expect(deepInk.pennant).toBeTruthy();
  });

  it('spec(A-052:AC-3) an equipped skin the captain does not own still renders something', () => {
    const captain: Captain = { ...emptyCaptain(), ownedSkins: ['oak'], equippedSkin: 'nonexistent' };
    expect(() => shipCosmeticsForCaptain(captain)).not.toThrow();
    expect(shipCosmeticsForCaptain(captain).hull).toBe(skinById(DEFAULT_SKIN_ID)?.hull);
  });
});

describe('A-052 migration — a save written before skins existed', () => {
  it('spec(A-052:AC-5) hydrates without loss and grants the starter', async () => {
    const store = memoryStore(preSkinSave());
    const { captain, recovered } = await hydrate(store);

    // The whole point: an old save is NOT treated as corrupt.
    expect(recovered, 'a valid pre-skin save was reported as recovered — progress would look reset').toBe(
      false,
    );
    expect(captain.name).toBe('Wren');
    expect(captain.coins).toBe(120);
    expect(captain.ownedSkins).toEqual([DEFAULT_SKIN_ID]);
    expect(captain.equippedSkin).toBeNull();
  });

  it('spec(A-052:AC-5) the starter is always owned, even if a stored list omits it', async () => {
    // Otherwise `skinOrDefault` would resolve a captain to a skin they do not own.
    const store = memoryStore(preSkinSave({ ownedSkins: ['deepink'] }));
    const { captain } = await hydrate(store);
    expect(captain.ownedSkins).toContain(DEFAULT_SKIN_ID);
    expect(captain.ownedSkins).toContain('deepink');
  });

  it('spec(A-052:AC-5) an equipped skin that is not owned is dropped, not trusted', async () => {
    const store = memoryStore(preSkinSave({ ownedSkins: ['oak'], equippedSkin: 'deepink' }));
    const { captain } = await hydrate(store);
    expect(captain.equippedSkin).toBeNull();
  });

  it('spec(A-052:AC-5) skins survive a full persist -> hydrate round trip', async () => {
    const store = memoryStore();
    const saved: Captain = { ...emptyCaptain(), ownedSkins: ['oak', 'sunset'], equippedSkin: 'sunset' };
    await persist(store, saved);
    const { captain } = await hydrate(store);

    expect(captain.ownedSkins).toEqual(['oak', 'sunset']);
    expect(captain.equippedSkin).toBe('sunset');
  });

  it('spec(A-052:AC-5) garbage in the skin fields degrades to the starter rather than throwing', async () => {
    const store = memoryStore(preSkinSave({ ownedSkins: 'not-an-array', equippedSkin: 42 }));
    const { captain } = await hydrate(store);
    expect(captain.ownedSkins).toEqual([DEFAULT_SKIN_ID]);
    expect(captain.equippedSkin).toBeNull();
  });
});
