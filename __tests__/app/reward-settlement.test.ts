/**
 * A-032 — durable chest settlement and acquisition paths.
 *
 * Written before the implementation. Settlement consumes T-009's seeded chest roll, persists
 * A-041 receipts, and grants the missing chest-only cannon on rare before coin fallback.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cannons, getCannon } from '../../src/content/index';
import type { Cannon, CannonId, GradeBand, SkillId } from '../../src/content/schemas';
import { CANNON_IDS, GRADE_BANDS } from '../../src/content/schemas';
import { rollChest } from '../../src/engine/economy';
import { maxGradeForBand, resolvePlacement } from '../../src/engine/placement';
import { createRng } from '../../src/engine/rng';
import {
  duelReceiptKey,
  purchaseReceiptKey,
  type ChestReceipt,
} from '../../src/contracts/rewards';
import { hashReceiptKey, missingChestOnlyCannon, rollChestSettlement } from '../../src/services/chestSettlement';
import {
  auditCannonAcquisitionPaths,
  settleDuelRewards,
  settleStoreChest,
  type DuelSettlementInput,
} from '../../src/services/rewardSettlement';
import { applyDuelOutcome } from '../../src/services/duelRewards';
import { duelReducer, initialDuelState, type DuelState } from '../../src/stores/duel';
import { applyCaptainTally, createCaptainStore, type Captain, type CaptainStore } from '../../src/stores/player';
import { hydrate, persist, type KeyValueStore } from '../../src/services/persistence';

const SWIVEL = getCannon('swivel_gun');

function findSeed(predicate: (seed: number) => boolean, limit = 200_000): number {
  for (let seed = 0; seed < limit; seed += 1) {
    if (predicate(seed)) return seed;
  }
  throw new Error(`no seed found within ${limit}`);
}

function findRareSeed(): number {
  return findSeed((seed) => rollChest(createRng(seed))[0].rarity === 'rare');
}

function findNonRareSeed(): number {
  return findSeed((seed) => rollChest(createRng(seed))[0].rarity !== 'rare');
}

interface Plan {
  readonly cannonForTurn: (turn: number) => Cannon;
  readonly correctOnTurn: (turn: number) => boolean;
}

function playDuel(seed: number, plan: Plan): DuelState {
  let s = initialDuelState(seed);
  for (let step = 0; step < 2000; step += 1) {
    if (s.phase === 'victory' || s.phase === 'defeat') return s;
    if (s.phase === 'select') {
      s = duelReducer(s, { type: 'PICK_CANNON', cannon: plan.cannonForTurn(s.turn) });
      continue;
    }
    if (s.phase === 'question') {
      const question = s.question;
      const cannon = s.cannon;
      if (question === null || cannon === null) throw new Error('question phase with no question');
      const correct = plan.correctOnTurn(s.turn);
      const value = correct ? question.answer : question.choices.find((c) => c !== question.answer)!;
      s = duelReducer(s, { type: 'ANSWER', value, elapsedMs: cannon.timerMs });
      continue;
    }
    s = duelReducer(s, { type: 'ADVANCE' });
  }
  throw new Error(`duel never terminated — phase=${s.phase}`);
}

const win = (cannon: Cannon = SWIVEL): Plan => ({
  cannonForTurn: () => cannon,
  correctOnTurn: () => true,
});

const lose = (cannon: Cannon = SWIVEL): Plan => ({
  cannonForTurn: () => cannon,
  correctOnTurn: (turn) => turn <= 2,
});

function duelInput(state: DuelState): DuelSettlementInput {
  return {
    duelId: state.duelId,
    seed: state.rng.state,
    won: state.phase === 'victory',
    purseCoins: state.coins,
    skillTally: state.skillTally,
  };
}

function fakeStorage(): { store: KeyValueStore; data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    store: {
      getItem: async (k) => data.get(k) ?? null,
      setItem: async (k, v) => {
        data.set(k, v);
      },
    },
  };
}

function captainDeepEqual(a: Captain, b: Captain): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

let store: CaptainStore;
beforeEach(() => {
  store = createCaptainStore();
  store.getState().setGradeBand('k_1');
});

describe('A-032 chest settlement', () => {
  it('spec(A-032:AC-1) a winning duel commits one chest roll and receipt with purse in one replaceCaptain', () => {
    const state = playDuel(91001, win());
    expect(state.phase).toBe('victory');

    const replaceSpy = vi.spyOn(store.getState(), 'replaceCaptain');
    const before = structuredClone(store.getState().captain);
    const outcome = settleDuelRewards(store, duelInput(state));

    expect(outcome.applied).toBe(true);
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    const committed = replaceSpy.mock.calls[0]?.[0] as Captain;
    const key = duelReceiptKey(state.duelId);
    expect(committed.rewardReceipts[key]).toBeDefined();
    expect(committed.rewardReceipts[key]?.source).toBe('duel');
    expect(committed.rewardReceipts[key]?.seed).toBe(state.rng.state);
    expect(committed.coins).toBe(before.coins + state.coins + outcome.chestCoins);
    expect(committed.wins).toBe(before.wins + 1);
    expect(committed.mastery).not.toEqual(before.mastery);
  });

  it('spec(A-032:AC-2) replaying settlement with the same seed and ownership yields identical chest and no second grant', () => {
    const rareSeed = findRareSeed();
    const state = playDuel(rareSeed, win());
    const input = duelInput(state);

    const first = settleDuelRewards(store, input);
    const afterFirst = structuredClone(store.getState().captain);
    const second = settleDuelRewards(store, input);

    expect(second.applied).toBe(false);
    expect(second.chestReceipt).toEqual(first.chestReceipt);
    expect(store.getState().captain).toEqual(afterFirst);
  });

  it('spec(A-032:AC-3) a rare roll with a missing chest-only cannon grants it unseen once', () => {
    const rareSeed = findRareSeed();
    expect(store.getState().captain.ownedCannons).not.toContain('nine_pounder');

    const state = playDuel(rareSeed, win());
    const outcome = settleDuelRewards(store, duelInput(state));
    const receipt = store.getState().captain.rewardReceipts[duelReceiptKey(state.duelId)];

    expect(receipt?.rarity).toBe('rare');
    expect(receipt?.grant).toEqual({ kind: 'cannon', cannonId: 'nine_pounder' });
    expect(receipt?.coinFallback).toBeGreaterThan(0);
    expect(store.getState().captain.ownedCannons).toContain('nine_pounder');
    expect(store.getState().captain.seenCannons).not.toContain('nine_pounder');
    expect(outcome.unlockedCannons).toContain('nine_pounder');
    expect(outcome.chestCoins).toBe(0);
  });

  it('spec(A-032:AC-4) when no chest-only cannon is missing, rare degrades to exact tuned coin drop', () => {
    const rareSeed = findRareSeed();
    store.getState().replaceCaptain({
      ...store.getState().captain,
      ownedCannons: [...store.getState().captain.ownedCannons, 'nine_pounder'],
    });

    const state = playDuel(rareSeed, win());
    const expected = rollChestSettlement(state.rng.state, store.getState().captain.ownedCannons);
    const outcome = settleDuelRewards(store, duelInput(state));
    const receipt = store.getState().captain.rewardReceipts[duelReceiptKey(state.duelId)];

    expect(receipt?.grant.kind).toBe('coins');
    if (receipt?.grant.kind === 'coins') {
      expect(receipt.grant.amount).toBe(expected.coinFallback);
    }
    expect(outcome.chestCoins).toBe(expected.coinFallback);
    expect(store.getState().captain.ownedCannons.filter((id) => id === 'nine_pounder')).toHaveLength(1);
  });

  it('spec(A-032:AC-5) every catalog cannon has an attainable path per band with only D-9 multi-path exceptions', () => {
    const audit = auditCannonAcquisitionPaths();
    expect(audit.violations).toEqual([]);

    const multiPath = audit.multiplePaths.filter(
      (entry) => entry.cannonId === 'six_pounder' || entry.cannonId === 'twelve_pounder',
    );
    expect(multiPath.length).toBeGreaterThan(0);
    for (const cannonId of CANNON_IDS) {
      if (cannonId === 'six_pounder' || cannonId === 'twelve_pounder') continue;
      const paths = audit.multiplePaths.filter((entry) => entry.cannonId === cannonId);
      expect(paths, `${cannonId} must not have multiple paths`).toEqual([]);
    }
  });

  it('spec(A-032:AC-6) defeat pays the purse but rolls no victory chest', () => {
    const state = playDuel(91006, lose());
    expect(state.phase).toBe('defeat');

    const before = store.getState().captain.coins;
    const outcome = settleDuelRewards(store, duelInput(state));

    expect(outcome.applied).toBe(true);
    expect(outcome.chestReceipt).toBeNull();
    expect(outcome.chestCoins).toBe(0);
    expect(store.getState().captain.coins - before).toBe(state.coins);
    expect(store.getState().captain.rewardReceipts[duelReceiptKey(state.duelId)]).toBeUndefined();
  });

  it('spec(A-032:AC-7) store chest debits, increments sequence, and replays old sequence without reroll', () => {
    store.getState().replaceCaptain({ ...store.getState().captain, coins: 100 });
    const sequence = store.getState().captain.nextPurchaseSequence;
    const price = 50;

    const replaceSpy = vi.spyOn(store.getState(), 'replaceCaptain');
    const first = settleStoreChest(store, { sequence, price });
    expect(first.applied).toBe(true);
    expect(replaceSpy).toHaveBeenCalledTimes(1);

    const afterFirst = structuredClone(store.getState().captain);
    expect(afterFirst.coins).toBe(100 - price);
    expect(afterFirst.nextPurchaseSequence).toBe(sequence + 1);
    const receipt = afterFirst.rewardReceipts[purchaseReceiptKey(sequence)];
    expect(receipt).toBeDefined();
    expect(receipt?.source).toBe('purchase');
    expect(receipt?.seed).toBe(hashReceiptKey(purchaseReceiptKey(sequence)));

    const replay = settleStoreChest(store, { sequence, price });
    expect(replay.applied).toBe(false);
    expect(replay.receipt).toEqual(receipt);
    expect(store.getState().captain).toEqual(afterFirst);
  });

  it('spec(A-032:AC-8) store settlement failures leave Captain deeply unchanged and create no receipt', () => {
    const snapshot = structuredClone(store.getState().captain);
    const cases = [
      { label: 'insufficient coins', input: { sequence: 0, price: 50 } },
      { label: 'stale sequence', input: { sequence: 99, price: 50 } },
      { label: 'invalid price', input: { sequence: 0, price: -1 } },
    ] as const;

    for (const { label, input } of cases) {
      const local = createCaptainStore(snapshot);
      const result = settleStoreChest(local, input);
      expect(result.applied, label).toBe(false);
      expect(local.getState().captain.rewardReceipts).toEqual({});
      expect(captainDeepEqual(local.getState().captain, snapshot)).toBe(true);
    }

    const rollFail = createCaptainStore({ ...snapshot, coins: 100 });
    const injected = settleStoreChest(rollFail, { sequence: 0, price: 50 }, {
      rollChest: () => {
        throw new Error('injected roll failure');
      },
    });
    expect(injected.applied).toBe(false);
    expect(captainDeepEqual(rollFail.getState().captain, { ...snapshot, coins: 100 })).toBe(true);
  });

  it('spec(A-032:AC-9) committed receipts survive relaunch and replay byte-equivalently', async () => {
    const rareSeed = findRareSeed();
    const state = playDuel(rareSeed, win());
    settleDuelRewards(store, duelInput(state));
    const written = store.getState().captain;

    const io = fakeStorage();
    await persist(io.store, written);
    const { captain: reloaded } = await hydrate(io.store);

    const replayStore = createCaptainStore(reloaded);
    const replay = settleDuelRewards(replayStore, duelInput(state));
    expect(replay.applied).toBe(false);
    expect(replay.chestReceipt).toEqual(written.rewardReceipts[duelReceiptKey(state.duelId)]);
    expect(replayStore.getState().captain).toEqual(reloaded);
  });
});

describe('A-032 integration with duelRewards', () => {
  it('applyDuelOutcome delegates to durable receipt settlement without WeakMap ledger', () => {
    const state = playDuel(92001, win());
    applyDuelOutcome(store, state);
    expect(store.getState().captain.rewardReceipts[duelReceiptKey(state.duelId)]).toBeDefined();

    const second = applyDuelOutcome(store, state);
    expect(second.applied).toBe(false);
  });
});

describe('A-032 chestSettlement primitives', () => {
  it('purchase receipt keys hash deterministically', () => {
    const key = purchaseReceiptKey(3);
    expect(hashReceiptKey(key)).toBe(hashReceiptKey(key));
    expect(hashReceiptKey(key)).not.toBe(hashReceiptKey(purchaseReceiptKey(4)));
  });

  it('missingChestOnlyCannon returns nine_pounder until owned', () => {
    expect(missingChestOnlyCannon([])).toBe('nine_pounder');
    expect(missingChestOnlyCannon(['nine_pounder'])).toBeNull();
  });
});
