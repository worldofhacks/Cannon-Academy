/**
 * A-055 — the Harbor sells paint. **This file supersedes A-033's suite.**
 *
 * ## Why a frozen suite was replaced rather than amended
 *
 * A-033 froze fourteen tests around one repeatable game chest. An owner ruling on 2026-07-29 removed
 * the chest from the shelf, and that ruling postdates the tests — the same adjudication the project
 * made for D-8: an owner decision that comes after a test supersedes it. Amending them one at a time
 * was not possible, because the product they describe no longer exists; `harborCatalog` and
 * `buyHarborChest` are gone, not changed.
 *
 * The ruling was not arbitrary. The shipped screen contradicted itself: it sold a chest that
 * `chestSettlement` can fill with a **cannon**, under copy reading *"Earn cannons by learning — not
 * by buying them."* Coins bought capability, which the Harbor board forbids outright:
 *
 * > "Never put a cannon, a timer bonus, or a hull upgrade on this shelf. The moment coins buy power,
 * > cut the screen."
 *
 * **What A-033 protected and is still protected here:** no real-money language, a 64pt purchase
 * target, no cannon on the shelf, purchases idempotent under repeated taps, and the balance being
 * the captain's coins and nothing else. Those assertions live on below against the new product.
 *
 * **What is deliberately not carried over:** anything describing a chest, a rarity roll or a purchase
 * receipt. Chests are a victory reward now and are tested where they are settled.
 */
import { describe, expect, it } from 'vitest';

import { COINS_WIN_BASE } from '@engine/tuning';

import { buySkin, duelsToAfford, equipSkin, harborCoinBalance, harborShelf } from '../../src/services/harbor';
import { createCaptainStore, emptyCaptain, type Captain } from '../../src/stores/player';
import {
  harborBalanceLabel,
  harborShortfallMessage,
  HARBOR_PURCHASE_TARGET,
} from '../../src/theme/harborPresentation';
import { DEFAULT_SKIN_ID, SHIP_SKINS, skinById } from '../../src/theme/shipSkins';

function captainWith(over: Partial<Captain> = {}): Captain {
  return { ...emptyCaptain(), ...over };
}

function storeWith(over: Partial<Captain> = {}) {
  return createCaptainStore(captainWith(over));
}

describe('A-055 the shelf', () => {
  it('spec(A-055:AC-1) sells every skin with a price, and never the starter', () => {
    const shelf = harborShelf(captainWith());
    expect(shelf.map((i) => i.skin.id)).toEqual(['seaglass', 'sunset', 'deepink']);
    expect(shelf.every((i) => i.skin.price > 0)).toBe(true);
    expect(shelf.some((i) => i.skin.id === DEFAULT_SKIN_ID)).toBe(false);
  });

  it('spec(A-055:AC-1) nothing on the shelf can buy power', () => {
    // The board's hard rule, asserted as a property of the goods rather than as a promise in copy.
    // `hull` is allowed because on a skin it is a COLOUR — so it is checked for type, not absence.
    const forbidden = ['cannonId', 'damage', 'timerMs', 'unlock', 'skill', 'minGrade'];
    for (const item of harborShelf(captainWith())) {
      const record = item.skin as unknown as Record<string, unknown>;
      expect(typeof record.hull).toBe('string');
      for (const key of forbidden) {
        expect(record[key], `a shelf item exposes ${key}`).toBeUndefined();
      }
    }
  });

  it('spec(A-055:AC-2) affordability, shortfall and the duel estimate agree', () => {
    const shelf = harborShelf(captainWith({ coins: 100 }));
    const seaglass = shelf.find((i) => i.skin.id === 'seaglass')!; // 60
    const deepink = shelf.find((i) => i.skin.id === 'deepink')!; // 260

    expect(seaglass.affordable).toBe(true);
    expect(seaglass.shortfall).toBe(0);
    expect(seaglass.duelsAway).toBe(0);

    expect(deepink.affordable).toBe(false);
    expect(deepink.shortfall).toBe(160);
    expect(deepink.duelsAway).toBe(Math.ceil(160 / COINS_WIN_BASE));
  });

  it('spec(A-055:AC-2) the duel estimate uses the payout FLOOR, so it errs toward arriving early', () => {
    // The designer: "compute it from the floor of the payout range, never the average, so the child
    // always arrives sooner than promised." An average would promise fewer duels than the worst case
    // delivers, which is the direction that disappoints.
    expect(duelsToAfford(COINS_WIN_BASE)).toBe(1);
    expect(duelsToAfford(COINS_WIN_BASE + 1)).toBe(2);
    expect(duelsToAfford(0)).toBe(0);
    expect(duelsToAfford(-5)).toBe(0);

    // A generous payout of 40 would say 4 duels for 160; the floor says 8. The floor must win.
    expect(duelsToAfford(160)).toBeGreaterThan(Math.ceil(160 / 40));
  });

  it('spec(A-055:AC-2) an owned skin is never shown as unaffordable', () => {
    const shelf = harborShelf(captainWith({ coins: 0, ownedSkins: [DEFAULT_SKIN_ID, 'deepink'] }));
    const deepink = shelf.find((i) => i.skin.id === 'deepink')!;
    expect(deepink.owned).toBe(true);
    expect(deepink.affordable).toBe(true);
    expect(deepink.shortfall).toBe(0);
  });
});

describe('A-055 buying', () => {
  it('spec(A-055:AC-3) a purchase debits once, grants the skin, and wears it', () => {
    const store = storeWith({ coins: 100 });
    const result = buySkin(store, 'seaglass');

    expect(result).toMatchObject({ ok: true, applied: true });
    const after = store.getState().captain;
    expect(after.coins).toBe(40);
    expect(after.ownedSkins).toContain('seaglass');
    expect(after.equippedSkin).toBe('seaglass');
  });

  it('spec(A-055:AC-3) a second tap does not debit again — ownership is the receipt', () => {
    // A-033 needed a receipt ledger because a chest outcome was random. A skin is deterministic, so
    // owning it IS proof the purchase happened, and a repeat tap cannot double-charge.
    const store = storeWith({ coins: 100 });
    buySkin(store, 'seaglass');
    const afterFirst = store.getState().captain.coins;

    const second = buySkin(store, 'seaglass');
    expect(second).toMatchObject({ ok: true, applied: false });
    expect(store.getState().captain.coins).toBe(afterFirst);
    expect(store.getState().captain.ownedSkins.filter((s) => s === 'seaglass')).toHaveLength(1);
  });

  it('spec(A-055:AC-4) insufficient coins refuses without changing anything, and says how far', () => {
    const store = storeWith({ coins: 10 });
    const before = store.getState().captain;

    const result = buySkin(store, 'deepink'); // 260
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === 'insufficient-coins') {
      expect(result.shortfall).toBe(250);
      expect(result.duelsAway).toBe(duelsToAfford(250));
    } else {
      throw new Error('expected an insufficient-coins refusal');
    }

    expect(store.getState().captain).toEqual(before);
  });

  it('spec(A-055:AC-4) an unknown skin id refuses rather than throwing', () => {
    const store = storeWith({ coins: 9999 });
    const before = store.getState().captain;
    expect(buySkin(store, 'not-a-skin')).toEqual({ ok: false, reason: 'unknown-skin' });
    expect(store.getState().captain).toEqual(before);
  });

  it('spec(A-055:AC-5) equipping is limited to skins actually owned', () => {
    const store = storeWith({ coins: 0, ownedSkins: [DEFAULT_SKIN_ID] });
    expect(equipSkin(store, 'deepink')).toBe(false);
    expect(store.getState().captain.equippedSkin).toBeNull();

    expect(equipSkin(store, DEFAULT_SKIN_ID)).toBe(true);
    expect(store.getState().captain.equippedSkin).toBe(DEFAULT_SKIN_ID);
  });

  it('spec(A-055:AC-5) buying one skin never removes another', () => {
    const store = storeWith({ coins: 500, ownedSkins: [DEFAULT_SKIN_ID, 'seaglass'] });
    buySkin(store, 'sunset');
    const owned = store.getState().captain.ownedSkins;
    expect(owned).toContain(DEFAULT_SKIN_ID);
    expect(owned).toContain('seaglass');
    expect(owned).toContain('sunset');
  });
});

describe('A-055 copy — carried over from A-033', () => {
  it('spec(A-055:AC-6) no real-money language anywhere in the harbor copy', () => {
    const strings = [
      harborBalanceLabel(120),
      harborShortfallMessage(1),
      harborShortfallMessage(4),
      ...SHIP_SKINS.map((s) => s.name),
    ].join(' ');

    for (const banned of ['$', '£', '€', 'buy coins', 'real money', 'usd']) {
      expect(strings.toLowerCase()).not.toContain(banned.toLowerCase());
    }
    expect(strings).toContain('coins');
  });

  it('spec(A-055:AC-6) the shortfall line counts duels, not coins the child must subtract', () => {
    expect(harborShortfallMessage(1)).toBe('About one more duel.');
    expect(harborShortfallMessage(4)).toBe('About 4 more duels.');
    expect(harborShortfallMessage(0)).toBe('');
  });

  it('spec(A-055:AC-6) the purchase control keeps the 64pt child tap floor', () => {
    expect(HARBOR_PURCHASE_TARGET).toBeGreaterThanOrEqual(64);
  });

  it('spec(A-055:AC-6) the balance is the captain coin count and nothing else', () => {
    expect(harborCoinBalance(captainWith({ coins: 77 }))).toBe(77);
  });

  it('spec(A-055:AC-1) every shelf price is a real catalog price', () => {
    for (const item of harborShelf(captainWith())) {
      expect(skinById(item.skin.id)?.price).toBe(item.skin.price);
    }
  });
});
