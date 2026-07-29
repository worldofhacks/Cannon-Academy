/**
 * Durable duel and store chest settlement — one replaceCaptain per commit (A-032).
 */
import type { SkillId } from '@content/schemas';

import type { ChestReceipt } from '../contracts/rewards';
import type { DuelRewardOutcome } from './duelRewards';
import type { CaptainStore } from '../stores/player';

export interface DuelSettlementInput {
  readonly duelId: string;
  readonly seed: number;
  readonly won: boolean;
  readonly purseCoins: number;
  readonly skillTally: Readonly<
    Partial<Record<SkillId, { readonly correct: number; readonly asked: number }>>
  >;
}

export interface DuelSettlementOutcome extends DuelRewardOutcome {
  readonly chestReceipt: ChestReceipt | null;
  readonly chestCoins: number;
}

export interface StoreChestSettlementInput {
  readonly sequence: number;
  readonly price: number;
}

export interface StoreChestOutcome {
  readonly applied: boolean;
  readonly receipt: ChestReceipt | null;
  readonly coinsSpent: number;
  readonly coinsGranted: number;
  readonly unlockedCannons: readonly import('@content/schemas').CannonId[];
}

export interface AcquisitionAudit {
  readonly violations: readonly string[];
  readonly multiplePaths: readonly { readonly cannonId: import('@content/schemas').CannonId; readonly gradeBand: GradeBand; readonly paths: readonly string[] }[];
}

import type { GradeBand } from '@content/schemas';

export function auditCannonAcquisitionPaths(): AcquisitionAudit {
  throw new Error('auditCannonAcquisitionPaths not implemented');
}

export function settleDuelRewards(
  _store: CaptainStore,
  _input: DuelSettlementInput,
): DuelSettlementOutcome {
  throw new Error('settleDuelRewards not implemented');
}

export function settleStoreChest(
  _store: CaptainStore,
  _input: StoreChestSettlementInput,
  _deps?: { readonly rollChest?: import('./chestSettlement').RollChestFn },
): StoreChestOutcome {
  throw new Error('settleStoreChest not implemented');
}
