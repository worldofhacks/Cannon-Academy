/**
 * Durable reward receipts — the Captain ledger keys and shapes (A-041).
 *
 * A receipt key is exactly `duel:<duelId>` or `purchase:<non-negative sequence>`.
 * Persisted receipt presence means the transaction committed; there is no separate
 * `applied` flag or timestamp.
 */
import { CANNON_IDS, CHEST_RARITIES, type CannonId, type ChestRarity } from '@content/schemas';

export type CoinGrant = { readonly kind: 'coins'; readonly amount: number };
export type CannonGrant = { readonly kind: 'cannon'; readonly cannonId: CannonId };
export type ChestGrant = CoinGrant | CannonGrant;

export interface ChestReceipt {
  readonly key: string;
  readonly source: 'duel' | 'purchase';
  readonly seed: number;
  readonly rarity: ChestRarity;
  /** Unused coin payout retained on cannon grants so a replay can prove it did not reroll. */
  readonly coinFallback: number;
  readonly grant: ChestGrant;
}

export type RewardReceipts = Record<string, ChestReceipt>;

export function duelReceiptKey(duelId: string): string {
  return `duel:${duelId}`;
}

export function purchaseReceiptKey(sequence: number): string {
  return `purchase:${sequence}`;
}

/** Receipt keys are exactly `duel:<id>` or `purchase:<non-negative integer sequence>`. */
export function isRewardReceiptKey(key: string): boolean {
  if (key.startsWith('duel:')) return true;
  const match = /^purchase:(\d+)$/.exec(key);
  if (!match) return false;
  const sequence = Number(match[1]);
  return Number.isInteger(sequence) && sequence >= 0;
}

function isCoinGrant(value: unknown): value is CoinGrant {
  if (typeof value !== 'object' || value === null) return false;
  const g = value as Record<string, unknown>;
  return g.kind === 'coins' && typeof g.amount === 'number' && Number.isFinite(g.amount) && !('cannonId' in g);
}

function isCannonGrant(value: unknown): value is CannonGrant {
  if (typeof value !== 'object' || value === null) return false;
  const g = value as Record<string, unknown>;
  return (
    g.kind === 'cannon' &&
    typeof g.cannonId === 'string' &&
    (CANNON_IDS as readonly string[]).includes(g.cannonId) &&
    !('amount' in g)
  );
}

/** Shape-valid receipt with a key that matches its source discriminant. */
export function isChestReceipt(value: unknown): value is ChestReceipt {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  if (typeof r.key !== 'string' || !isRewardReceiptKey(r.key)) return false;
  if (r.source === 'duel') {
    if (!r.key.startsWith('duel:')) return false;
  } else if (r.source === 'purchase') {
    if (!r.key.startsWith('purchase:')) return false;
  } else {
    return false;
  }
  if (typeof r.seed !== 'number' || !Number.isFinite(r.seed)) return false;
  if (typeof r.rarity !== 'string' || !(CHEST_RARITIES as readonly string[]).includes(r.rarity)) return false;
  if (typeof r.coinFallback !== 'number' || !Number.isFinite(r.coinFallback)) return false;
  const grant = r.grant;
  if (!isCoinGrant(grant) && !isCannonGrant(grant)) return false;
  return true;
}

/**
 * Normalises persisted receipt entries to a map, dropping malformed keys, invalid receipts,
 * and every entry whose key appears more than once in the input.
 */
export function normalizeRewardReceipts(raw: unknown): Record<string, ChestReceipt> {
  const entries: ChestReceipt[] = [];

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (isChestReceipt(item)) entries.push(item);
    }
  } else if (typeof raw === 'object' && raw !== null) {
    for (const value of Object.values(raw)) {
      if (isChestReceipt(value)) entries.push(value);
    }
  }

  const keyCounts = new Map<string, number>();
  for (const receipt of entries) {
    keyCounts.set(receipt.key, (keyCounts.get(receipt.key) ?? 0) + 1);
  }

  const out: Record<string, ChestReceipt> = {};
  for (const receipt of entries) {
    if ((keyCounts.get(receipt.key) ?? 0) > 1) continue;
    out[receipt.key] = receipt;
  }
  return out;
}
