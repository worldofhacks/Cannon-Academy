/**
 * A-033 — Harbor store: spend coins on a game chest without buying past learning.
 *
 * The store delegates settlement to A-032's `settleStoreChest`; this suite owns catalog,
 * affordability, idempotent purchase handling, and the child-facing copy contracts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi, afterEach } from 'vitest';

import { cannons } from '@content/index';
import { purchaseReceiptKey } from '../../src/contracts/rewards';
import { CHEST_COIN_RANGE_BY_RARITY, HARBOR_CHEST_PRICE } from '@engine/tuning';

import { deckSlots } from '../../src/services/loadout';
import { hydrate, persist, type KeyValueStore } from '../../src/services/persistence';
import { settleStoreChest } from '../../src/services/rewardSettlement';
import { createCaptainStore, emptyCaptain, type Captain } from '../../src/stores/player';

const REPO_ROOT = join(import.meta.dirname, '../..');

async function loadHarborModule(): Promise<typeof import('../../src/services/harbor')> {
  let loaded: unknown;
  try {
    loaded = await import('../../src/services/harbor');
  } catch {
    loaded = undefined;
  }
  expect(loaded, 'A-033 is RED: src/services/harbor.ts must export the harbor store API').toBeDefined();
  return loaded as typeof import('../../src/services/harbor');
}

async function readSource(relative: string): Promise<string> {
  return readFileSync(join(REPO_ROOT, relative), 'utf8');
}

function fakeStorage(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
  };
}

const captain = (over: Partial<Captain> = {}): Captain => ({ ...emptyCaptain(), ...over });

describe('A-033 harbor store', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── AC-1 — catalog prices are named tuning values; coins are the only currency ───────────────

  it('spec(A-033:AC-1) lists every product with a positive price from engine tuning', async () => {
    const { harborCatalog } = await loadHarborModule();
    const products = harborCatalog();

    expect(products.length).toBeGreaterThan(0);
    for (const product of products) {
      expect(Number.isInteger(product.price), `${product.id} price must be an integer`).toBe(true);
      expect(product.price, `${product.id} price must be positive`).toBeGreaterThan(0);
      expect(product.price).toBe(HARBOR_CHEST_PRICE);
    }
  });

  it('spec(A-033:AC-1) exposes the captain coin balance as the only spendable currency', async () => {
    const { harborCoinBalance } = await loadHarborModule();
    expect(harborCoinBalance(captain({ coins: 37 }))).toBe(37);
    expect(harborCoinBalance(captain({ coins: 0 }))).toBe(0);
  });

  it('spec(A-033:AC-1) the demo inventory is exactly one repeatable game chest', async () => {
    const { harborCatalog } = await loadHarborModule();
    expect(harborCatalog()).toEqual([
      expect.objectContaining({ id: 'game_chest', kind: 'chest', price: HARBOR_CHEST_PRICE }),
    ]);
  });

  // ── AC-2 — sufficient coins debit once and settle through A-032 ─────────────────────────────

  it('spec(A-033:AC-2) buying debits once and passes sequence plus HARBOR_CHEST_PRICE to settleStoreChest', async () => {
    const { buyHarborChest } = await loadHarborModule();
    const store = createCaptainStore(captain({ coins: 100 }));
    const sequence = store.getState().captain.nextPurchaseSequence;

    const result = buyHarborChest(store);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.applied).toBe(true);
    expect(result.receipt).toBeDefined();
    expect(result.receipt?.source).toBe('purchase');
    expect(result.receipt?.key).toBe(purchaseReceiptKey(sequence));
    expect(store.getState().captain.coins).toBeLessThan(100);
    expect(store.getState().captain.nextPurchaseSequence).toBe(sequence + 1);
    expect(store.getState().captain.rewardReceipts[purchaseReceiptKey(sequence)]).toEqual(
      result.receipt,
    );
  });

  it('spec(A-033:AC-2) a successful purchase returns the persisted receipt from settlement', async () => {
    const { buyHarborChest } = await loadHarborModule();
    const store = createCaptainStore(captain({ coins: 80 }));
    const result = buyHarborChest(store);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const key = purchaseReceiptKey(store.getState().captain.nextPurchaseSequence - 1);
    expect(store.getState().captain.rewardReceipts[key]).toEqual(result.receipt);
  });

  // ── AC-3 — failures and replays leave state untouched and return actionable messages ───────

  it('spec(A-033:AC-3) insufficient coins refuse without changing balance or inventory', async () => {
    const { buyHarborChest } = await loadHarborModule();
    const store = createCaptainStore(captain({ coins: HARBOR_CHEST_PRICE - 1, ownedCannons: ['swivel_gun'] }));
    const before = structuredClone(store.getState().captain);

    const result = buyHarborChest(store);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('insufficient-coins');
    expect(result.message.length).toBeGreaterThan(0);
    expect(store.getState().captain).toEqual(before);
  });

  it('spec(A-033:AC-3) repeated taps reuse the committed sequence without another debit', async () => {
    const { buyHarborChest } = await loadHarborModule();
    const store = createCaptainStore(captain({ coins: 120 }));
    const first = buyHarborChest(store);
    expect(first.ok).toBe(true);
    const afterFirst = structuredClone(store.getState().captain);

    const second = buyHarborChest(store);
    expect(second.ok).toBe(true);
    if (!second.ok || !first.ok) return;
    expect(second.applied).toBe(false);
    expect(second.receipt).toEqual(first.receipt);
    expect(store.getState().captain).toEqual(afterFirst);
  });

  it('spec(A-033:AC-3) remount reads the retained receipt without settling again', async () => {
    const { buyHarborChest, harborLastReceipt } = await loadHarborModule();
    const store = createCaptainStore(captain({ coins: 90 }));
    const bought = buyHarborChest(store);
    expect(bought.ok).toBe(true);

    const io = fakeStorage();
    await persist(io, store.getState().captain);
    const reloaded = await hydrate(io);
    const remounted = createCaptainStore(reloaded.captain);

    const receipt = harborLastReceipt(remounted.getState().captain);
    expect(receipt).toEqual(bought.ok ? bought.receipt : null);

    const replaceSpy = vi.spyOn(remounted.getState(), 'replaceCaptain');
    const replay = buyHarborChest(remounted);
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.applied).toBe(false);
    expect(replay.receipt).toEqual(receipt);
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('spec(A-033:AC-3) injected settlement failure leaves Captain unchanged and returns a message', async () => {
    vi.resetModules();
    const settlement = await import('../../src/services/rewardSettlement');
    vi.spyOn(settlement, 'settleStoreChest').mockReturnValue({
      applied: false,
      receipt: null,
      coinsSpent: 0,
      coinsGranted: 0,
      unlockedCannons: [],
    });
    const { buyHarborChest } = await import('../../src/services/harbor');
    const store = createCaptainStore(captain({ coins: 100 }));
    const before = structuredClone(store.getState().captain);

    const result = buyHarborChest(store);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message.length).toBeGreaterThan(0);
    expect(store.getState().captain).toEqual(before);
    vi.resetModules();
  });

  // ── AC-4 — mastery cannons are not directly purchasable ─────────────────────────────────────

  it('spec(A-033:AC-4) no mastery-earned cannon is listed as a direct product', async () => {
    const { harborCatalog } = await loadHarborModule();
    const masteryIds = new Set(cannons.filter((c) => c.unlock.kind === 'range').map((c) => c.id));
    const products = harborCatalog();

    for (const product of products) {
      expect(product.kind).toBe('chest');
      expect(masteryIds.has(product.id as never)).toBe(false);
    }
    expect(products.every((p) => p.kind === 'chest')).toBe(true);
  });

  // ── AC-5 — purchases persist and new cannons badge on the gun deck ─────────────────────────

  it('spec(A-033:AC-5) spent coins and acquired cannons survive relaunch', async () => {
    const store = createCaptainStore(captain({ coins: 100, ownedCannons: ['swivel_gun', 'culverin'] }));
    const beforeCoins = store.getState().captain.coins;
    const outcome = settleStoreChest(store, {
      sequence: store.getState().captain.nextPurchaseSequence,
      price: HARBOR_CHEST_PRICE,
    });
    expect(outcome.applied).toBe(true);

    const io = fakeStorage();
    await persist(io, store.getState().captain);
    const reloaded = await hydrate(io);

    expect(reloaded.captain.coins).toBeLessThan(beforeCoins);
    expect(reloaded.captain.rewardReceipts).toEqual(store.getState().captain.rewardReceipts);
    if (outcome.unlockedCannons.length > 0) {
      for (const id of outcome.unlockedCannons) {
        expect(reloaded.captain.ownedCannons).toContain(id);
      }
    }
  });

  it('spec(A-033:AC-5) a chest-acquired cannon is marked new on the gun deck until seen', async () => {
    const { buyHarborChest } = await loadHarborModule();
    const store = createCaptainStore(
      captain({ coins: 200, ownedCannons: ['swivel_gun', 'culverin'], seenCannons: ['swivel_gun', 'culverin'] }),
    );
    const result = buyHarborChest(store);
    expect(result.ok).toBe(true);

    const unlocked = store.getState().captain.ownedCannons.filter(
      (id) => !['swivel_gun', 'culverin'].includes(id),
    );
    if (unlocked.length === 0) return;

    const fresh = unlocked[0]!;
    const slots = deckSlots(store.getState().captain);
    expect(slots.find((s) => s.cannon.id === fresh)?.isNew).toBe(true);
  });

  // ── AC-6 — child-facing copy and tap target ─────────────────────────────────────────────────

  it('spec(A-033:AC-6) purchase copy says coins and game chest with no real-money language', async () => {
    const presentation = await import('../../src/theme/harborPresentation');
    expect(presentation.harborPurchaseLabel.toLowerCase()).toContain('coins');
    expect(presentation.harborProductTitle.toLowerCase()).toContain('game chest');

    const src = await readSource('app/harbor.tsx');
    const forbidden = /\b(purchase|buy now|\$|USD|IAP|in-app|checkout|credit card|real money)\b/i;
    expect(src).not.toMatch(forbidden);
    expect(src.toLowerCase()).toContain('coins');
    expect(src.toLowerCase()).toContain('game chest');
  });

  it('spec(A-033:AC-6) the purchase control exposes a 64pt tap target', async () => {
    const presentation = await import('../../src/theme/harborPresentation');
    expect(presentation.HARBOR_PURCHASE_TARGET).toBe(64);

    const src = await readSource('app/harbor.tsx');
    expect(src).toMatch(/HARBOR_PURCHASE_TARGET|MIN_TAP_TARGET/);
  });

  // ── Definition of Done ──────────────────────────────────────────────────────────────────────

  it('dod(A-033:1) HARBOR_CHEST_PRICE is frozen at 50 before implementation', () => {
    expect(HARBOR_CHEST_PRICE).toBe(50);
    expect(HARBOR_CHEST_PRICE).toBeGreaterThan(CHEST_COIN_RANGE_BY_RARITY.common.max);
  });

  it('dod(A-033:2) harbor screen delegates settlement — it does not roll or grant rewards', async () => {
    const src = await readSource('app/harbor.tsx');
    expect(src).toMatch(/from '\.\.\/src\/services\/harbor'/);
    expect(src).not.toMatch(/\brollChest\b/);
    expect(src).not.toMatch(/settleStoreChest/);
  });

  it('dod(A-033:3) every acceptance criterion in the ticket is cited by a test in this file', async () => {
    const ticket = await readSource('tickets/app/A-033.md');
    const suite = await readSource('__tests__/app/harbor.test.ts');
    const acs = new Set([...ticket.matchAll(/\*\*(AC-\d+)\*\*/g)].map((m) => m[1]!));

    expect(acs.size).toBeGreaterThan(0);
    for (const ac of acs) {
      expect(suite, `${ac} has no test in harbor.test.ts`).toContain(`spec(A-033:${ac})`);
    }
  });
});
