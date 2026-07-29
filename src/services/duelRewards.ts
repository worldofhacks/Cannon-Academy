/**
 * What a finished duel is worth, applied to the captain exactly once.
 *
 * A-008 / A-039. Projection reads the canonical engine terminal; settlement remains a separate
 * ledgered apply step. This module prices nothing itself.
 */
import type { CannonId, IslandId, SkillId } from '@content/schemas';
import type { DuelState as EngineDuelState } from '@engine/duel/types';

import type { CaptainStore } from '../stores/player';
import type { DuelState } from '../stores/duel';

/** Everything the screen needs to announce, plus whether any of it actually happened. */
export interface DuelRewardOutcome {
  /** False when this duel was already paid for, or has not finished yet. */
  readonly applied: boolean;
  readonly won: boolean;
  /** Coins actually added to the captain; `0` when not applied. */
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

/**
 * Which duels each captain has already been paid for.
 *
 * Scoped PER STORE, not module-global: the question this answers is "has THIS captain been paid
 * for this duel", and a single shared set would rob a second captain of a duel the first was paid
 * for — while quietly making any suite that touches it order-dependent. `WeakMap` so a discarded
 * store takes its ledger with it.
 */
const settledDuels = new WeakMap<CaptainStore, Set<string>>();

function ledgerFor(store: CaptainStore): Set<string> {
  const existing = settledDuels.get(store);
  if (existing !== undefined) return existing;
  const fresh = new Set<string>();
  settledDuels.set(store, fresh);
  return fresh;
}

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

/** The ids present in `after` that were not in `before` — this application's own grants. */
function granted<T>(before: readonly T[], after: readonly T[]): readonly T[] {
  const already = new Set(before);
  return after.filter((id) => !already.has(id));
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
 * Applies a finished duel to the captain: coins, per-skill mastery, the win, and whatever those
 * unlocked. Safe to call on any state at any time — an unfinished duel and an already-settled one
 * both return `applied: false` and change nothing.
 */
export function applyDuelOutcome(store: CaptainStore, duel: DuelState): DuelRewardOutcome {
  const before = store.getState().captain;
  const won = duel.phase === 'victory';
  if (!won && duel.phase !== 'defeat') return noPayment(false, before.rankTier);

  const ledger = ledgerFor(store);
  if (ledger.has(duel.duelId)) return noPayment(won, before.rankTier);
  ledger.add(duel.duelId);

  const actions = store.getState();

  // Mastery first, so the unlocks it triggers are already applied when the delta is read below.
  for (const [skill, tally] of Object.entries(duel.skillTally)) {
    if (tally === undefined) continue;
    actions.recordDuelAnswers(skill as SkillId, tally);
  }

  // The purse the panel showed — never re-priced here.
  actions.addCoins(duel.coins);

  actions.recordDuelResult({ won });

  const after = store.getState().captain;
  return {
    applied: true,
    won,
    coins: after.coins - before.coins,
    unlockedCannons: granted(before.ownedCannons, after.ownedCannons),
    unlockedIslands: granted(before.unlockedIslands, after.unlockedIslands),
    rankTier: after.rankTier,
    rankedUp: after.rankTier > before.rankTier,
  };
}
