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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { COINS_PER_ACCURACY_PERCENT, COINS_WIN_BASE } from '@engine/tuning';

import { buySkin, duelsToAfford, equipSkin, harborCoinBalance, harborShelf } from '../../src/services/harbor';
import { createCaptainStore, emptyCaptain, type Captain } from '../../src/stores/player';
import {
  harborBalanceLabel,
  harborCellLabel,
  harborCoinMeter,
  harborDuelPayoutLabel,
  harborShelfCells,
  harborShipWidth,
  harborShortfallMessage,
  HARBOR_BOARD,
  HARBOR_DUEL_COIN_RANGE,
  HARBOR_METER_SEGMENTS,
  HARBOR_PURCHASE_TARGET,
} from '../../src/theme/harborPresentation';
import { color } from '../../src/theme/tokens';
import { DEFAULT_SKIN_ID, SHIP_SKINS, skinById } from '../../src/theme/shipSkins';

function captainWith(over: Partial<Captain> = {}): Captain {
  return { ...emptyCaptain(), ...over };
}

function storeWith(over: Partial<Captain> = {}) {
  return createCaptainStore(captainWith(over));
}

function src(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relative}`, import.meta.url)), 'utf8');
}

/**
 * Source with its comments stripped.
 *
 * These files document what they deliberately do NOT draw — *"the board prints 5 PER DRILL"*, *"the
 * board draws 200 to go"* — so a bare grep for one of those strings finds the explanation rather
 * than a regression, and passes only while nobody explains themselves. `demo-navigation.test.ts`
 * draws the same line by parsing a TypeScript AST, which discards comments outright: prose is not
 * evidence, in either direction.
 */
function code(relative: string): string {
  return src(relative)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}

/** WCAG relative luminance — the same arithmetic `text-contrast.test.ts` uses. */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const linear = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
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

/**
 * The board draws FOUR cards; `harborShelf()` sells THREE. Both are right, and the seam between
 * them is `harborShelfCells` — which is what these assertions pin, so nobody later "fixes" the
 * discrepancy by putting the starter back into the service and breaking AC-1 above.
 */
describe('A-055 the shelf as the board draws it', () => {
  it('spec(A-055:AC-1) composes four cards from a three-item shelf, starter first', () => {
    const captain = captainWith();
    const cells = harborShelfCells(captain, harborShelf(captain));

    expect(cells.map((c) => c.skin.id)).toEqual(['oak', 'seaglass', 'sunset', 'deepink']);
    expect(cells).toHaveLength(SHIP_SKINS.length);
    // The service is untouched by the composition — the frozen list above still holds.
    expect(harborShelf(captain).map((i) => i.skin.id)).toEqual(['seaglass', 'sunset', 'deepink']);
  });

  it('spec(A-055:AC-1) the starter cell is never for sale', () => {
    const [starter] = harborShelfCells(captainWith(), harborShelf(captainWith()));
    expect(starter?.starter).toBe(true);
    expect(starter?.skin.price).toBe(0);
    expect(starter?.affordable).toBe(true);
    expect(starter?.shortfall).toBe(0);
    expect(starter?.duelsAway).toBe(0);
    // Everything else on the shelf costs something, so `starter` is the only cell with no price tab.
    expect(harborShelfCells(captainWith(), harborShelf(captainWith())).filter((c) => c.starter)).toHaveLength(1);
  });

  it('spec(A-055:AC-1) an untouched save reads its starter as flying, not merely owned', () => {
    // `equippedSkin: null` means "the starter" so a fresh install needs no migration. A card that
    // compared ids naively would show a brand-new captain's actual ship as sitting in the hold.
    const fresh = captainWith();
    expect(fresh.equippedSkin).toBeNull();

    const [starter] = harborShelfCells(fresh, harborShelf(fresh));
    expect(starter?.owned).toBe(true);
    expect(starter?.equipped).toBe(true);
    expect(harborCellLabel(starter!)).toContain('flying now');
  });

  it('spec(A-055:AC-1) an owned-but-stowed skin offers the one action it has left', () => {
    const captain = captainWith({ coins: 0, ownedSkins: [DEFAULT_SKIN_ID, 'deepink'], equippedSkin: 'deepink' });
    const cells = harborShelfCells(captain, harborShelf(captain));
    const oak = cells.find((c) => c.skin.id === 'oak');
    const ink = cells.find((c) => c.skin.id === 'deepink');

    expect(oak?.equipped).toBe(false);
    expect(harborCellLabel(oak!)).toContain('tap to fly it');
    expect(harborCellLabel(ink!)).toContain('flying now');
  });

  it('spec(A-055:AC-1) an empty purse never strands a captain who owns everything', () => {
    // The board switches to the earn screen on `balance === 0` alone, which is right in every case
    // it drew and wrong in one it did not: a captain who spent their last coin on the last ship
    // would lose the shelf, and with it the only way to change which ship they sail. The screen
    // therefore also asks whether anything is left to want.
    const everything = captainWith({ coins: 0, ownedSkins: SHIP_SKINS.map((skin) => skin.id) });
    expect(harborShelf(everything).every((item) => item.owned)).toBe(true);

    const cells = harborShelfCells(everything, harborShelf(everything));
    expect(cells).toHaveLength(SHIP_SKINS.length);
    expect(cells.every((cell) => cell.owned)).toBe(true);
    // Every card still offers its one remaining action, so the shelf is worth showing.
    for (const cell of cells.filter((c) => !c.equipped)) {
      expect(harborCellLabel(cell)).toContain('tap to fly it');
    }

    // …and a broke captain who is still missing a ship does get sent out to earn.
    expect(harborShelf(captainWith({ coins: 0 })).some((item) => !item.owned)).toBe(true);
    expect(code('app/harbor.tsx')).toContain('nothingLeftToBuy');
  });

  it('spec(A-055:AC-1) the keepsakes row is cut, because nothing counts gems', () => {
    // The board's own cut list marks it TRIM. The decisive fact is that `Captain` has no gem
    // counter at all, so the row could only ever have rendered three tiles of fiction.
    expect(Object.keys(emptyCaptain())).not.toContain('gems');
    expect(Object.keys(emptyCaptain())).not.toContain('keepsakes');
    expect(code('app/harbor.tsx')).not.toContain('KEEPSAKES');
    // The stripper has to be shown non-vacuous, or every absence assertion above passes for free.
    expect(code('app/harbor.tsx')).toContain('harborShelfCells');
    expect(code('app/harbor.tsx')).not.toContain('the board prints');
  });
});

describe('A-055 the coin meter is a countable length', () => {
  it('spec(A-055:AC-2) is ten discrete cells, never a continuous fill', () => {
    // The board's own accessibility rule: the third affordability channel is "a COUNTABLE length".
    // A percentage width is a length nobody can count, which is why the shelf card's 12pt bar loses
    // to the board's own segmented Rank meters.
    expect(HARBOR_METER_SEGMENTS).toBe(10);
    for (let balance = 0; balance <= 260; balance += 1) {
      const meter = harborCoinMeter(balance, 260);
      expect(Number.isInteger(meter.filled)).toBe(true);
      expect(meter.filled).toBeGreaterThanOrEqual(0);
      expect(meter.filled).toBeLessThanOrEqual(HARBOR_METER_SEGMENTS);
    }
  });

  it('spec(A-055:AC-2) a partial meter never shows a full one', () => {
    // One coin short is still short. A meter that rounds up to ten cells beside a "not yet" refusal
    // is the single lie this component must not tell, and a non-reader resolves it in favour of the
    // picture every time.
    expect(harborCoinMeter(259, 260).filled).toBe(HARBOR_METER_SEGMENTS - 1);
    expect(harborCoinMeter(259, 260).step).not.toBe('full');
    expect(harborCoinMeter(260, 260).filled).toBe(HARBOR_METER_SEGMENTS);
    expect(harborCoinMeter(999, 260).filled).toBe(HARBOR_METER_SEGMENTS);
  });

  it('spec(A-055:AC-2) the step word is read off the cells, so it cannot contradict the picture', () => {
    // Cut points sit on cell boundaries — 4 and 7 — so two meters showing the same number of cells
    // can never show different words.
    expect(harborCoinMeter(30, 100).filled).toBe(3);
    expect(harborCoinMeter(30, 100).step).toBe('part');
    expect(harborCoinMeter(40, 100).step).toBe('half');
    expect(harborCoinMeter(60, 100).step).toBe('half');
    expect(harborCoinMeter(70, 100).step).toBe('nearly');
    expect(harborCoinMeter(90, 100).step).toBe('nearly');
    expect(harborCoinMeter(100, 100).step).toBe('full');
  });

  it("spec(A-055:AC-2) the board's own worked example reads HALF WAY", () => {
    // The board draws 128 of 260 — 49% — and labels it "HALF WAY". The table has to agree with the
    // one example the designer actually rendered.
    const meter = harborCoinMeter(128, 260);
    expect(meter.filled).toBe(4);
    expect(meter.step).toBe('half');
    expect(meter.label).toBe('HALF WAY');
  });

  it('spec(A-055:AC-2) an empty meter carries no word', () => {
    // The board writes the step label INSIDE the fill. With no fill there is nowhere to put it, and
    // "STARTED" over an untouched purse would be false besides.
    expect(harborCoinMeter(0, 260).filled).toBe(0);
    expect(harborCoinMeter(0, 260).label).toBe('');
  });

  it('spec(A-055:AC-2) a free skin has a complete meter rather than a divide-by-zero', () => {
    expect(harborCoinMeter(0, 0).filled).toBe(HARBOR_METER_SEGMENTS);
    expect(harborCoinMeter(0, 0).step).toBe('full');
  });
});

describe('A-055 what the screen promises', () => {
  it('spec(A-055:AC-6) the duel payout band is derived from tuning, not transcribed', () => {
    // The board hardcodes "20–40 COINS". Both ends come from the payout formula instead, so a
    // balance pass on the economy cannot leave a stale promise on a child's button.
    expect(HARBOR_DUEL_COIN_RANGE.min).toBe(COINS_WIN_BASE);
    expect(HARBOR_DUEL_COIN_RANGE.max).toBe(Math.round(COINS_WIN_BASE + COINS_PER_ACCURACY_PERCENT * 100));
    expect(harborDuelPayoutLabel).toBe(`${HARBOR_DUEL_COIN_RANGE.min}–${HARBOR_DUEL_COIN_RANGE.max} COINS`);
    expect(code('app/harbor.tsx')).not.toContain('20–40');
  });

  it('spec(A-055:AC-6) the advertised band under-promises rather than over-promises', () => {
    // Perfect shots pay on top of the accuracy ceiling and their count is bounded by nothing in
    // tuning, so the printed ceiling is a FLOOR of the true one. That is the same direction of
    // error the designer demanded of the duel estimate.
    expect(HARBOR_DUEL_COIN_RANGE.max).toBeGreaterThan(HARBOR_DUEL_COIN_RANGE.min);
    expect(HARBOR_DUEL_COIN_RANGE.min).toBe(duelsToAfford(COINS_WIN_BASE) * COINS_WIN_BASE);
  });

  it('spec(A-055:AC-6) the Range button advertises no coin rate, because the range pays none', () => {
    // The board prints "5 PER DRILL". `services/range.ts` awards no coins at all, so the label
    // would be a promise the game never keeps. Adding a payout to make it true is a game-economy
    // decision, not a screen decision.
    expect(code('src/services/range.ts')).not.toMatch(/coin/i);
    expect(code('app/harbor.tsx')).not.toMatch(/PER DRILL/i);
  });

  it('spec(A-055:AC-6) the shelf card counts duels; only the confirm modal does coin arithmetic', () => {
    const captain = captainWith({ coins: 100 });
    const deepink = harborShelfCells(captain, harborShelf(captain)).find((c) => c.skin.id === 'deepink');

    // The board draws a raw `price − balance` ("160 to go") on the card. A five-year-old should not
    // have to subtract to learn they cannot afford something.
    expect(harborCellLabel(deepink!)).toContain(harborShortfallMessage(deepink!.duelsAway));
    expect(harborCellLabel(deepink!)).not.toContain('to go');
    expect(code('app/harbor.tsx')).not.toContain('to go');
    // …and the confirm modal keeps it, because that screen is ABOUT the arithmetic.
    expect(code('app/harbor.tsx')).toContain('balance - price');
  });
});

describe('A-055 the chrome the board got wrong', () => {
  it('spec(A-055:AC-6) every control clears the 64pt child tap floor', () => {
    // The board draws the back button at 44 and "Not now" at 56. Both are raised.
    expect(HARBOR_PURCHASE_TARGET).toBeGreaterThanOrEqual(64);
    expect(HARBOR_BOARD.confirm.button.height).toBeGreaterThanOrEqual(64);
    expect(HARBOR_BOARD.sheet.button.height).toBeGreaterThanOrEqual(64);
    expect(HARBOR_BOARD.bought.button.height).toBeGreaterThanOrEqual(64);
  });

  it('spec(A-055:AC-6) the board-sanctioned small boxes keep their measured size', () => {
    // The purse is a READOUT here, not a control — the tappable purse is the chart's. The floor
    // governs targets, so 40pt is correct and raising it would break the header composition.
    expect(HARBOR_BOARD.purse.height).toBe(40);
  });

  it('spec(A-055:AC-6) no text on the board’s `sea`, on either the back tile or anywhere else', () => {
    // White on `sea` measures 4.18 and ink on it 3.59 — `tokens.ts` says never put text on it. The
    // board draws a white arrow on exactly that blue.
    expect(contrast(color.white, color.sea)).toBeLessThan(4.5);
    expect(HARBOR_BOARD.backGround).not.toBe(color.sea);
    expect(contrast(color.white, HARBOR_BOARD.backGround)).toBeGreaterThanOrEqual(4.5);
  });

  it('spec(A-055:AC-6) every text pair this screen renders clears AA', () => {
    // Enumerated by hand from the call sites, because a colour is only wrong in the context it is
    // used. `#F0E2C8` is the board's sunken parchment and `#14283C` its ink; neither has a token.
    const SUNK = '#F0E2C8';
    const pairs: readonly { readonly where: string; readonly fg: string; readonly bg: string }[] = [
      { where: 'header title on sea-deep', fg: color.white, bg: color.seaDeep },
      { where: 'back arrow on the darkened tile', fg: color.white, bg: HARBOR_BOARD.backGround },
      { where: 'purse count on parchment', fg: color.inkDark, bg: color.parchment },
      { where: 'card name on a raised card', fg: color.inkDark, bg: color.white },
      { where: 'card name on a sunk card', fg: color.inkDark, bg: SUNK },
      { where: 'price on the gold tab', fg: color.inkDark, bg: color.amber },
      { where: 'check glyph on the green badge', fg: color.inkDark, bg: color.success },
      { where: 'owned tag on the sunk pill', fg: color.inkDarkMuted, bg: SUNK },
      { where: '"About N more duels" on a sunk card', fg: color.inkDarkMuted, bg: SUNK },
      { where: 'footer note on the sunk strip', fg: color.inkDarkMuted, bg: SUNK },
      { where: 'sheet body on white', fg: color.inkDarkMuted, bg: color.white },
      { where: '"of 260" on white', fg: color.inkDarkMuted, bg: color.white },
      { where: '"Not now" on the sunk button', fg: color.inkDarkMuted, bg: SUNK },
      { where: 'empty-purse subtitle on parchment', fg: color.inkDarkMuted, bg: color.parchment },
      { where: 'reveal count on the celebration ground', fg: color.parchment, bg: HARBOR_BOARD.bought.ground },
      { where: '"LEFT" on the celebration ground', fg: color.inkBright, bg: HARBOR_BOARD.bought.ground },
    ];

    for (const { where, fg, bg } of pairs) {
      const ratio = contrast(fg, bg);
      expect(ratio, `${where}: ${fg} on ${bg} measures ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('spec(A-055:AC-6) every ship preview fits the stage the board measured', () => {
    // `Ship` is the duel rig on a 150×124 grid; the board's mini ship is a squatter 90×56. Sizing
    // by the height the stage allows is what keeps the card at the board's 152pt instead of growing
    // it by 12 and pushing the footer note off a 640pt screen.
    const stages = [
      HARBOR_BOARD.card.stage,
      HARBOR_BOARD.confirm.stage,
      { height: HARBOR_BOARD.bought.stage.height, shipBottom: HARBOR_BOARD.bought.stage.shipBottom },
      { height: HARBOR_BOARD.sheet.mini.height, shipBottom: 8 },
    ];

    for (const stage of stages) {
      const width = harborShipWidth(stage.height, stage.shipBottom);
      const shipHeight = (width * 124) / 150;
      // Keel above the stage floor, masthead at or below the stage ceiling.
      expect(shipHeight + stage.shipBottom).toBeLessThanOrEqual(stage.height + 0.001);
      expect(width).toBeGreaterThan(0);
    }
    // …and the sheet's mini ship still fits its 76pt-wide window.
    expect(harborShipWidth(HARBOR_BOARD.sheet.mini.height, 8)).toBeLessThanOrEqual(HARBOR_BOARD.sheet.mini.width);
  });

  it('spec(A-055:AC-6) the preview flies the child’s flag everywhere, including the sheet', () => {
    // The board omits the flag and the bob on the "not yet" sheet's mini ship. That is an oversight:
    // the same preview appears three other places on the same board with both, and the designer's
    // own ruling is that for a non-reader the picture IS the contract.
    const screen = src('app/harbor.tsx');
    expect(screen).toContain('shipCosmeticsForSkin');
    // One shared stage renders every preview, so the sheet cannot drift away from the other three.
    expect(screen.match(/<ShipStage/g) ?? []).toHaveLength(4);
  });
});
