/**
 * A-041 — durable captain contract (mercy + reward receipts).
 *
 * Freezes the shared Captain ledger shape before opponent/chest consumers invent
 * incompatible persisted fields.
 */
import { describe, expect, it } from 'vitest';

import { CANNON_IDS, CHEST_RARITIES } from '../../src/content/schemas';
import { emptyMercyState } from '../../src/engine/opponents/mercy';
import { MASTERY_RATE_DUEL } from '../../src/engine/tuning';
import {
  duelReceiptKey,
  isRewardReceiptKey,
  purchaseReceiptKey,
  type ChestReceipt,
} from '../../src/contracts/rewards';
import {
  applyCaptainTally,
  createCaptainStore,
  emptyCaptain,
  type Captain,
} from '../../src/stores/player';

function sampleDuelReceipt(over: Partial<ChestReceipt> = {}): ChestReceipt {
  const base: ChestReceipt = {
    key: duelReceiptKey('duel-abc'),
    source: 'duel',
    seed: 0xdeadbeef,
    rarity: 'uncommon',
    coinFallback: 42,
    grant: { kind: 'coins', amount: 42 },
  };
  return { ...base, ...over, key: over.key ?? base.key };
}

function samplePurchaseReceipt(sequence = 0, over: Partial<ChestReceipt> = {}): ChestReceipt {
  const base: ChestReceipt = {
    key: purchaseReceiptKey(sequence),
    source: 'purchase',
    seed: 0xc0ffee,
    rarity: 'rare',
    coinFallback: 90,
    grant: { kind: 'cannon', cannonId: 'nine_pounder' },
  };
  return { ...base, ...over, key: over.key ?? base.key };
}

describe('A-041 durable captain contract', () => {
  it('spec(A-041:AC-1) a fresh Captain starts with empty mercy, empty receipts, and sequence zero', () => {
    const c = emptyCaptain();
    expect(c.mercyState).toEqual(emptyMercyState);
    expect(c.rewardReceipts).toEqual({});
    expect(c.nextPurchaseSequence).toBe(0);
  });

  it('spec(A-041:AC-1) fresh Captain containers are not aliased across emptyCaptain calls', () => {
    const a = emptyCaptain();
    const b = emptyCaptain();
    expect(a.mercyState).not.toBe(b.mercyState);
    expect(a.mercyState.recentPlayerCorrect).not.toBe(b.mercyState.recentPlayerCorrect);
    expect(a.rewardReceipts).not.toBe(b.rewardReceipts);
    // Mutating one must not leak into the other (shared emptyMercyState constant trap).
    (a.mercyState.recentPlayerCorrect as boolean[]).push(true);
    a.rewardReceipts['duel:x'] = sampleDuelReceipt({ key: 'duel:x' });
    expect(b.mercyState.recentPlayerCorrect).toEqual([]);
    expect(b.rewardReceipts).toEqual({});
  });

  it('spec(A-041:AC-3) receipt keys accept only duel:<id> and purchase:<non-negative sequence>', () => {
    expect(isRewardReceiptKey('duel:abc')).toBe(true);
    expect(isRewardReceiptKey('duel:')).toBe(true);
    expect(isRewardReceiptKey(duelReceiptKey('match-1'))).toBe(true);
    expect(isRewardReceiptKey(purchaseReceiptKey(0))).toBe(true);
    expect(isRewardReceiptKey(purchaseReceiptKey(12))).toBe(true);
    expect(isRewardReceiptKey('purchase:0')).toBe(true);

    expect(isRewardReceiptKey('purchase:-1')).toBe(false);
    expect(isRewardReceiptKey('purchase:1.5')).toBe(false);
    expect(isRewardReceiptKey('purchase:')).toBe(false);
    expect(isRewardReceiptKey('duel')).toBe(false);
    expect(isRewardReceiptKey('store:1')).toBe(false);
    expect(isRewardReceiptKey('')).toBe(false);
  });

  it('spec(A-041:AC-3) ChestReceipt records source, seed, rarity, coin fallback, and exactly one grant', () => {
    const coins = sampleDuelReceipt();
    expect(coins.source).toBe('duel');
    expect(coins.seed).toBe(0xdeadbeef);
    expect(CHEST_RARITIES).toContain(coins.rarity);
    expect(coins.coinFallback).toBe(42);
    expect(coins.grant).toEqual({ kind: 'coins', amount: 42 });

    const cannon = samplePurchaseReceipt(3);
    expect(cannon.source).toBe('purchase');
    expect(cannon.key).toBe('purchase:3');
    expect(cannon.grant).toEqual({ kind: 'cannon', cannonId: 'nine_pounder' });
    // Cannon grant retains the unused coin fallback so a replay can prove it did not reroll.
    expect(cannon.coinFallback).toBe(90);
    expect(CANNON_IDS).toContain(cannon.grant.kind === 'cannon' ? cannon.grant.cannonId : '');
  });

  it('spec(A-041:AC-5) applyCaptainTally matches store mastery/unlocks without mutating the input', () => {
    const store = createCaptainStore();
    store.getState().setGradeBand('k_1');
    const before: Captain = structuredClone(store.getState().captain);
    const input: Captain = structuredClone(before);

    const next = applyCaptainTally(input, 'add_within_10', 'duel', { correct: 4, asked: 4 });

    expect(input).toEqual(before);
    expect(next).not.toBe(input);
    expect(next.mastery.add_within_10?.weightedCorrect).toBeCloseTo(4 * MASTERY_RATE_DUEL, 5);

    store.getState().recordDuelAnswers('add_within_10', { correct: 4, asked: 4 });
    const viaStore = store.getState().captain;
    expect(next.mastery).toEqual(viaStore.mastery);
    expect(next.ownedCannons).toEqual(viaStore.ownedCannons);
    expect(next.unlockedIslands).toEqual(viaStore.unlockedIslands);
  });

  it('spec(A-041:AC-5) a later settlement can commit a tally via one replaceCaptain', () => {
    const store = createCaptainStore();
    store.getState().setGradeBand('k_1');
    const snapshot = store.getState().captain;
    const tallied = applyCaptainTally(snapshot, 'add_within_10', 'duel', { correct: 2, asked: 2 });
    store.getState().replaceCaptain(tallied);
    expect(store.getState().captain).toEqual(tallied);
    expect(store.getState().captain.mastery.add_within_10?.correct).toBe(2);
  });

  it('spec(A-041:AC-6) replaceCaptain retains mercyState, rewardReceipts, and nextPurchaseSequence exactly', () => {
    const store = createCaptainStore();
    const duel = sampleDuelReceipt();
    const purchase = samplePurchaseReceipt(1);
    const next: Captain = {
      ...emptyCaptain(),
      coins: 11,
      mercyState: {
        recentPlayerCorrect: [true, false],
        consecutiveLosses: 1,
        forcedMisfiresRemaining: 2,
      },
      rewardReceipts: {
        [duel.key]: duel,
        [purchase.key]: purchase,
      },
      nextPurchaseSequence: 2,
    };

    store.getState().replaceCaptain(next);
    const held = store.getState().captain;
    expect(held.mercyState).toEqual(next.mercyState);
    expect(held.rewardReceipts).toEqual(next.rewardReceipts);
    expect(held.nextPurchaseSequence).toBe(2);
  });
});
