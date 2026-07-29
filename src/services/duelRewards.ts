/**
 * What a finished duel is worth, applied to the captain exactly once.
 *
 * A-008. Before this file, `computeCoinPayout` ran at the end of every duel, `VictoryPanel`
 * rendered the number, the screen unmounted, and the number was gone. Mastery was never touched
 * and wins were never counted. This module is the join between the duel reducer and the captain
 * store — the thing that turns the duel from a demo into a loop.
 *
 * Two rules govern it:
 *
 *  1. **It prices nothing itself.** Coins come from `state.coins`, which the reducer got from
 *     `computeCoinPayout`; the mastery rate comes from the store's `recordDuelAnswers`; the rank
 *     tier comes from `recordDuelResult` via `rankTierForWins`. No rate, threshold or payout
 *     literal appears below. A captain credited a different number than the one a child just read
 *     off the victory screen is the worst possible version of this bug, and taking the screen's
 *     own number is what makes that unrepresentable.
 *  2. **It pays exactly once per duel** (AC-6). React re-renders, effects fire twice under
 *     StrictMode, and a terminal phase can be observed many times — anything applied per
 *     OBSERVATION pays repeatedly. See the ledger note below for why the identity is `duelId` and
 *     why the ledger is scoped to the store.
 *
 * No React import: this is the logic, and it is frozen-tested headless. `app/duel.tsx` is one
 * effect calling `applyDuelOutcome`.
 */
import type { CannonId, IslandId, SkillId } from '@content/schemas';

import type { DuelState } from '../stores/duel';
import type { CaptainStore } from '../stores/player';

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
 * Applies a finished duel to the captain: coins, per-skill mastery, the win, and whatever those
 * unlocked. Safe to call on any state at any time — an unfinished duel and an already-settled one
 * both return `applied: false` and change nothing.
 *
 * An unfinished duel is NOT recorded as settled: the screen may well observe a duel mid-flight,
 * and consuming the duel's one payment there would mean it finishes and pays nothing.
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
  // Practice counts whether or not the duel was won, and `asked` carries the wrong answers with
  // it — crediting only the corrects would inflate accuracy and hollow out the mastery gate.
  for (const [skill, tally] of Object.entries(duel.skillTally)) {
    if (tally === undefined) continue;
    actions.recordDuelAnswers(skill as SkillId, tally);
  }

  // The purse the panel showed. `settle()` priced it with `computeCoinPayout`; re-pricing it here
  // is how the screen and the wallet start disagreeing.
  actions.addCoins(duel.coins);

  // A loss still goes through here: `recordDuelResult` re-derives the tier from the win count,
  // and since wins never decrease, a loss cannot drop a rank.
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
