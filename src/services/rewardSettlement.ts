/**
 * Durable duel and store chest settlement — one replaceCaptain per commit (A-032).
 */
import { cannons } from '@content/index';
import type { CannonId, GradeBand } from '@content/schemas';
import { GRADE_BANDS } from '@content/schemas';
import { rollChest } from '@engine/economy';
import { maxGradeForBand } from '@engine/placement';
import { rankTierForWins } from '@engine/ranks';

import {
  duelReceiptKey,
  purchaseReceiptKey,
  type ChestReceipt,
} from '../contracts/rewards';
import { applyCaptainTally, type Captain, type CaptainStore } from '../stores/player';
import type { SkillId } from '@content/schemas';

import { hashReceiptKey, rollChestSettlement, type RollChestFn } from './chestSettlement';
import type { DuelRewardOutcome } from './duelRewards';

/** In-session idempotency for defeats, which commit no chest receipt (AC-6). */
const settledDefeatDuels = new WeakMap<CaptainStore, Set<string>>();

function defeatLedgerFor(store: CaptainStore): Set<string> {
  const existing = settledDefeatDuels.get(store);
  if (existing !== undefined) return existing;
  const fresh = new Set<string>();
  settledDefeatDuels.set(store, fresh);
  return fresh;
}

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
  readonly unlockedCannons: readonly CannonId[];
}

export interface AcquisitionAudit {
  readonly violations: readonly string[];
  readonly multiplePaths: readonly {
    readonly cannonId: CannonId;
    readonly gradeBand: GradeBand;
    readonly paths: readonly string[];
  }[];
}

/** D-9 placement exceptions — the only cannons with two intentional acquisition paths. */
const PLACEMENT_EXCEPTIONS: Readonly<
  Partial<Record<CannonId, readonly GradeBand[]>>
> = {
  six_pounder: ['g2_3', 'g4_5'],
  twelve_pounder: ['g4_5'],
};

function granted<T>(before: readonly T[], after: readonly T[]): readonly T[] {
  const already = new Set(before);
  return after.filter((id) => !already.has(id));
}

function noPayment(
  won: boolean,
  rankTier: number,
  receipt: ChestReceipt | null = null,
): DuelSettlementOutcome {
  return {
    applied: false,
    won,
    coins: 0,
    unlockedCannons: [],
    unlockedIslands: [],
    rankTier,
    rankedUp: false,
    chestReceipt: receipt,
    chestCoins: 0,
  };
}

function applyChestGrant(captain: Captain, roll: ReturnType<typeof rollChestSettlement>): Captain {
  if (roll.grant.kind === 'cannon') {
    const owned = captain.ownedCannons.includes(roll.grant.cannonId)
      ? captain.ownedCannons
      : [...captain.ownedCannons, roll.grant.cannonId];
    return {
      ...captain,
      coins: captain.coins + roll.chestCoins,
      ownedCannons: owned,
    };
  }
  return { ...captain, coins: captain.coins + roll.chestCoins };
}

function applySkillTallies(captain: Captain, skillTally: DuelSettlementInput['skillTally']): Captain {
  let next = captain;
  for (const [skill, tally] of Object.entries(skillTally)) {
    if (tally === undefined) continue;
    next = applyCaptainTally(next, skill as SkillId, 'duel', tally);
  }
  return next;
}

function recordWin(captain: Captain, won: boolean): Captain {
  const wins = captain.wins + (won ? 1 : 0);
  return { ...captain, wins, rankTier: rankTierForWins(wins) };
}

function outcomeFromCaptain(
  before: Captain,
  after: Captain,
  won: boolean,
  purseCoins: number,
  chestReceipt: ChestReceipt | null,
  chestCoins: number,
  applied: boolean,
): DuelSettlementOutcome {
  return {
    applied,
    won,
    coins: applied ? purseCoins : 0,
    unlockedCannons: granted(before.ownedCannons, after.ownedCannons),
    unlockedIslands: granted(before.unlockedIslands, after.unlockedIslands),
    rankTier: after.rankTier,
    rankedUp: after.rankTier > before.rankTier,
    chestReceipt,
    chestCoins: applied ? chestCoins : 0,
  };
}

function pathsForCannon(cannon: (typeof cannons)[number], band: GradeBand): readonly string[] {
  const maxGrade = maxGradeForBand(band);
  if (cannon.minGrade > maxGrade) return [];

  const paths: string[] = [];
  if (cannon.unlock.kind === 'starter' && cannon.minGrade <= maxGrade) {
    paths.push('starter');
  }
  if (cannon.unlock.kind === 'range') {
    paths.push('range');
    const exceptions = PLACEMENT_EXCEPTIONS[cannon.id];
    if (exceptions?.includes(band)) paths.push('placement-exception');
  }
  if (cannon.unlock.kind === 'chest') {
    paths.push('chest');
  }
  return paths;
}

/** Audits every catalog cannon has at least one path per eligible grade band (AC-5). */
export function auditCannonAcquisitionPaths(): AcquisitionAudit {
  const violations: string[] = [];
  const multiplePaths: Array<{
    cannonId: CannonId;
    gradeBand: GradeBand;
    paths: readonly string[];
  }> = [];

  for (const band of GRADE_BANDS) {
    for (const cannon of cannons) {
      const paths = pathsForCannon(cannon, band);
      if (cannon.minGrade > maxGradeForBand(band)) continue;
      if (paths.length === 0) {
        violations.push(`${cannon.id}@${band} has no acquisition path`);
      }
      if (paths.length > 1) {
        multiplePaths.push({ cannonId: cannon.id, gradeBand: band, paths });
      }
    }
  }

  return { violations, multiplePaths };
}

/** Canonical config seed encoded in `duel-<base36>` ids (A-032). */
export function canonicalDuelSeed(duelId: string): number {
  if (!duelId.startsWith('duel-')) {
    throw new RangeError(`canonicalDuelSeed: expected duel:<id> key, received ${duelId}`);
  }
  return parseInt(duelId.slice('duel-'.length), 36) >>> 0;
}

export function settleDuelRewards(
  store: CaptainStore,
  input: DuelSettlementInput,
): DuelSettlementOutcome {
  const before = store.getState().captain;
  const key = duelReceiptKey(input.duelId);
  const existing = before.rewardReceipts[key];
  if (existing !== undefined) {
    return noPayment(input.won, before.rankTier, existing);
  }

  if (!input.won) {
    const ledger = defeatLedgerFor(store);
    if (ledger.has(input.duelId)) return noPayment(false, before.rankTier);
  }

  let next = applySkillTallies(before, input.skillTally);
  next = { ...next, coins: next.coins + input.purseCoins };
  next = recordWin(next, input.won);

  let chestReceipt: ChestReceipt | null = null;
  let chestCoins = 0;

  if (input.won) {
    const chestSeed = canonicalDuelSeed(input.duelId);
    const roll = rollChestSettlement(chestSeed, next.ownedCannons);
    chestReceipt = {
      key,
      source: 'duel',
      seed: chestSeed,
      rarity: roll.rarity,
      coinFallback: roll.coinFallback,
      grant: roll.grant,
    };
    chestCoins = roll.chestCoins;
    next = applyChestGrant(next, roll);
    next = {
      ...next,
      rewardReceipts: { ...next.rewardReceipts, [key]: chestReceipt },
    };
  } else {
    defeatLedgerFor(store).add(input.duelId);
  }

  store.getState().replaceCaptain(next);
  return outcomeFromCaptain(before, next, input.won, input.purseCoins, chestReceipt, chestCoins, true);
}

export function settleStoreChest(
  store: CaptainStore,
  input: StoreChestSettlementInput,
  deps?: { readonly rollChest?: RollChestFn },
): StoreChestOutcome {
  const before = store.getState().captain;
  const key = purchaseReceiptKey(input.sequence);
  const existing = before.rewardReceipts[key];
  if (existing !== undefined) {
    const coinsGranted = existing.grant.kind === 'coins' ? existing.grant.amount : 0;
    return {
      applied: false,
      receipt: existing,
      coinsSpent: 0,
      coinsGranted,
      unlockedCannons: [],
    };
  }

  if (
    input.price < 0 ||
    !Number.isFinite(input.price) ||
    input.sequence !== before.nextPurchaseSequence ||
    before.coins < input.price
  ) {
    return { applied: false, receipt: null, coinsSpent: 0, coinsGranted: 0, unlockedCannons: [] };
  }

  const seed = hashReceiptKey(key);
  let roll: ReturnType<typeof rollChestSettlement>;
  try {
    roll = rollChestSettlement(seed, before.ownedCannons, deps?.rollChest ?? rollChest);
  } catch {
    return { applied: false, receipt: null, coinsSpent: 0, coinsGranted: 0, unlockedCannons: [] };
  }

  const receipt: ChestReceipt = {
    key,
    source: 'purchase',
    seed,
    rarity: roll.rarity,
    coinFallback: roll.coinFallback,
    grant: roll.grant,
  };

  let next: Captain = {
    ...before,
    coins: before.coins - input.price,
    nextPurchaseSequence: before.nextPurchaseSequence + 1,
    rewardReceipts: { ...before.rewardReceipts, [key]: receipt },
  };
  next = applyChestGrant(next, roll);

  store.getState().replaceCaptain(next);
  const coinsGranted = roll.grant.kind === 'coins' ? roll.grant.amount : 0;
  const unlocked = roll.grant.kind === 'cannon' ? [roll.grant.cannonId] : [];

  return {
    applied: true,
    receipt,
    coinsSpent: input.price,
    coinsGranted,
    unlockedCannons: unlocked,
  };
}
