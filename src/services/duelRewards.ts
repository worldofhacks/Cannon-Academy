/**
 * What a finished duel is worth, applied to the captain exactly once.
 *
 * A-008 / A-039 / A-032. Projection reads the canonical engine terminal; settlement persists
 * durable chest receipts and applies purse, mastery, win/rank in one replaceCaptain.
 */
import type { CannonId, IslandId, SkillId } from '@content/schemas';
import type { DuelState as EngineDuelState } from '@engine/duel/types';

import type { CaptainStore } from '../stores/player';
import type { DuelState } from '../stores/duel';
import { settleDuelRewards, canonicalDuelSeed } from './rewardSettlement';

/** Everything the screen needs to announce, plus whether any of it actually happened. */
export interface DuelRewardOutcome {
  /** False when this duel was already paid for, or has not finished yet. */
  readonly applied: boolean;
  readonly won: boolean;
  /** Purse coins actually added to the captain; `0` when not applied. Chest coins are separate. */
  readonly coins: number;
  /** Cannons newly granted BY THIS APPLICATION — a grant the player is never told about is a reward that did not happen. */
  readonly unlockedCannons: readonly CannonId[];
  readonly unlockedIslands: readonly IslandId[];
  readonly rankTier: number;
  readonly rankedUp: boolean;
}

export type DuelRewardProjection = {
  readonly won: boolean;
  readonly coins: number;
  readonly skillTally: EngineDuelState['tally']['bySkill'];
  readonly rankInput: { readonly won: boolean };
};

/** Settlement view projected by the live store / adapter. */
export type DuelSettlementView = {
  readonly phase: string;
  readonly duelId: string;
  readonly coins: number;
  readonly skillTally: Readonly<
    Partial<Record<SkillId, { readonly correct: number; readonly asked: number }>>
  >;
};

/** The outcome for a duel that pays nothing — unfinished, or already settled. */
function noPayment(won: boolean, rankTier: number): DuelRewardOutcome {
  return {
    applied: false,
    won,
    coins: 0,
    unlockedCannons: [],
    unlockedIslands: [],
    rankTier,
    rankedUp: false,
  };
}

/**
 * Pure projection of a canonical engine terminal (A-039 AC-7). Observation-only: never settles.
 */
export function projectDuelRewards(terminal: EngineDuelState): DuelRewardProjection {
  if (terminal.phase !== 'victory' && terminal.phase !== 'defeat') {
    throw new Error(`projectDuelRewards: expected terminal phase, received ${terminal.phase}`);
  }
  const result = terminal.result as typeof terminal.result & { readonly coins: number };
  return {
    won: result.won,
    coins: result.coins,
    skillTally: result.tally.bySkill,
    rankInput: { won: result.won },
  };
}

/**
 * Applies a finished duel to the captain: coins, per-skill mastery, the win, and a victory chest
 * when applicable. Safe to call on any state at any time — an unfinished duel and an
 * already-settled one both return `applied: false` and change nothing.
 */
export function applyDuelOutcome(store: CaptainStore, duel: DuelState): DuelRewardOutcome {
  const before = store.getState().captain;
  const won = duel.phase === 'victory';
  if (!won && duel.phase !== 'defeat') return noPayment(false, before.rankTier);

  const outcome = settleDuelRewards(store, {
    duelId: duel.duelId,
    seed: canonicalDuelSeed(duel.duelId),
    won,
    purseCoins: duel.coins,
    skillTally: duel.skillTally,
  });

  return {
    applied: outcome.applied,
    won: outcome.won,
    coins: outcome.coins,
    unlockedCannons: outcome.unlockedCannons,
    unlockedIslands: outcome.unlockedIslands,
    rankTier: outcome.rankTier,
    rankedUp: outcome.rankedUp,
  };
}
