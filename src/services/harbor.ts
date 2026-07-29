/**
 * Harbor store — catalog and purchase handler (A-033).
 *
 * Spending buys a chest through A-032 durable settlement; mastery cannons are never sold
 * directly. The handler captures one purchase sequence per intent and replays committed
 * receipts on repeated taps or remount without another debit.
 */
import { HARBOR_CHEST_PRICE } from '@engine/tuning';

import type { ChestReceipt } from '../contracts/rewards';
import { purchaseReceiptKey } from '../contracts/rewards';
import type { Captain, CaptainStore } from '../stores/player';

import { settleStoreChest } from './rewardSettlement';

export type HarborProductKind = 'chest';

export interface HarborProduct {
  readonly id: 'game_chest';
  readonly kind: HarborProductKind;
  readonly price: number;
  readonly label: string;
}

export type HarborPurchaseResult =
  | {
      readonly ok: true;
      readonly applied: boolean;
      readonly receipt: ChestReceipt;
      readonly message: string | null;
    }
  | {
      readonly ok: false;
      readonly reason: 'insufficient-coins' | 'failed';
      readonly message: string;
    };

/** In-session sequence capture so repeated taps replay the same committed receipt. */
const purchaseIntent = new WeakMap<CaptainStore, number>();

/** Owner-approved demo catalog — one repeatable game chest. */
export function harborCatalog(): readonly HarborProduct[] {
  return [
    {
      id: 'game_chest',
      kind: 'chest',
      price: HARBOR_CHEST_PRICE,
      label: 'Game chest',
    },
  ];
}

/** The captain's coin balance — the only currency the harbor accepts. */
export function harborCoinBalance(captain: Captain): number {
  return captain.coins;
}

/** Most recent committed store receipt, if any. Observation only — no settlement. */
export function harborLastReceipt(captain: Captain): ChestReceipt | null {
  const sequence = captain.nextPurchaseSequence;
  if (sequence === 0) return null;
  return captain.rewardReceipts[purchaseReceiptKey(sequence - 1)] ?? null;
}

function replay(receipt: ChestReceipt): HarborPurchaseResult {
  return { ok: true, applied: false, receipt, message: null };
}

/**
 * Attempt to buy the harbor game chest. Captures the purchase sequence once per intent, then
 * delegates debits, rolls, and receipts to A-032. Repeated taps or remounts replay the persisted
 * receipt without another debit.
 */
export function buyHarborChest(store: CaptainStore): HarborPurchaseResult {
  const captain = store.getState().captain;
  const price = HARBOR_CHEST_PRICE;

  let sequence = purchaseIntent.get(store);
  if (sequence === undefined) {
    const retained = harborLastReceipt(captain);
    if (retained !== null) {
      sequence = captain.nextPurchaseSequence - 1;
      purchaseIntent.set(store, sequence);
      return replay(retained);
    }
    sequence = captain.nextPurchaseSequence;
    purchaseIntent.set(store, sequence);
  }

  const existing = captain.rewardReceipts[purchaseReceiptKey(sequence)];
  if (existing != null) {
    return replay(existing);
  }

  if (captain.coins < price) {
    return {
      ok: false,
      reason: 'insufficient-coins',
      message: `You need ${price} coins for a game chest.`,
    };
  }

  const outcome = settleStoreChest(store, { sequence, price });

  if (outcome.receipt === null) {
    return {
      ok: false,
      reason: 'failed',
      message: 'Could not buy the game chest. Try again.',
    };
  }

  return {
    ok: true,
    applied: outcome.applied,
    receipt: outcome.receipt,
    message: null,
  };
}
