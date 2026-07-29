/**
 * The captain — the one place a player exists.
 *
 * A-001. Before this file, the app had three screens and nothing between them: the duel reset on
 * every mount, `computeCoinPayout` returned a number that was rendered once and discarded, and
 * onboarding pushed into a duel that did not know which grade band had been chosen. That is what
 * made the build a demo rather than a product.
 *
 * Two rules govern everything here:
 *
 *  1. **It stores what the engine models.** Mastery is the engine's `SkillMastery` record, not a
 *     flattened number; rank is derived by `rankTierForWins`, never assigned. No rate, threshold
 *     or payout literal appears in this file. The store's job is to *hold* state and enforce the
 *     invariants of holding it — not to re-decide the rules.
 *  2. **It holds only what must survive relaunch.** A duel in progress lives in the duel reducer.
 *     Persisting a half-finished turn is how you resume into an unreachable phase.
 *
 * The shape mirrors the Firestore captain document in ARCHITECTURE.md §5, so the later sync ticket
 * is a write rather than a translation.
 *
 * No React import, no component import — the store is pure TypeScript over engine functions, which
 * is what lets the whole spine be frozen-tested headless with no component harness.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { CannonId, GradeBand, IslandId, SkillId } from '@content/schemas';
import { applyAnswer, emptyMastery, resolveUnlocks, type SkillMastery } from '@engine/mastery';
import { resolvePlacement } from '@engine/placement';
import { rankTierForWins } from '@engine/ranks';

/** The persisted captain. Every field here survives relaunch; nothing else does. */
export interface Captain {
  gradeBand: GradeBand | null;
  name: string;
  /** One of the six onboarding flags. Becomes the ship's pennant (board 5b). */
  flag: string | null;
  coins: number;
  mastery: Partial<Record<SkillId, SkillMastery>>;
  ownedCannons: CannonId[];
  /** The subset that sails with you. A-011 manages this; the duel tray renders it. */
  equippedCannons: CannonId[];
  unlockedIslands: IslandId[];
  rankTier: number;
  wins: number;
  currentIsland: IslandId | null;
  hasCompletedOnboarding: boolean;
  hasFoughtGuidedDuel: boolean;
}

export interface CaptainState {
  captain: Captain;

  /** Placement: pre-unlocks islands to band and STARTER cannons only (owner ruling D-6). */
  setGradeBand: (band: GradeBand) => void;
  setNameAndFlag: (name: string, flag: string) => void;
  completeOnboarding: () => void;
  markGuidedDuelFought: () => void;

  addCoins: (amount: number) => void;
  /** Returns false and changes nothing when the captain cannot afford it. */
  spendCoins: (amount: number) => boolean;

  /** Duel answers fill mastery at the DUEL rate — half the range rate. */
  recordDuelAnswers: (skill: SkillId, tally: { correct: number; asked: number }) => void;
  /** Range drills fill at the FULL rate. A-009 calls this. */
  recordRangeAnswers: (skill: SkillId, tally: { correct: number; asked: number }) => void;

  recordDuelResult: (result: { won: boolean }) => void;
  equipCannons: (ids: readonly CannonId[]) => void;
  setCurrentIsland: (id: IslandId) => void;

  /** Replaces the whole captain — used by rehydration (A-002) and by the dev screen. */
  replaceCaptain: (captain: Captain) => void;
}

export type CaptainStore = StoreApi<CaptainState>;

/**
 * A fresh captain. A FUNCTION, not a frozen constant: a shared nested object would leak one
 * captain's mastery into the next fresh install, and that is invisible until someone reinstalls.
 */
export function emptyCaptain(): Captain {
  return {
    gradeBand: null,
    name: '',
    flag: null,
    coins: 0,
    mastery: {},
    ownedCannons: [],
    equippedCannons: [],
    unlockedIslands: [],
    rankTier: 0,
    wins: 0,
    currentIsland: null,
    hasCompletedOnboarding: false,
    hasFoughtGuidedDuel: false,
  };
}

/**
 * Folds a tally of answers into one skill's mastery, then applies whatever that unlocked.
 *
 * Unlock application is a set union against what is already owned, which is what makes re-crossing
 * the threshold a no-op. Without that, every duel after the first re-grants the same cannon and
 * `ownedCannons` grows without bound.
 */
function applyTally(
  captain: Captain,
  skill: SkillId,
  source: 'duel' | 'range',
  tally: { correct: number; asked: number },
): Captain {
  let m = captain.mastery[skill] ?? emptyMastery;
  const wrong = Math.max(0, tally.asked - tally.correct);
  for (let i = 0; i < tally.correct; i += 1) m = applyAnswer(m, source, true);
  for (let i = 0; i < wrong; i += 1) m = applyAnswer(m, source, false);

  const mastery = { ...captain.mastery, [skill]: m };
  const unlocked = resolveUnlocks({
    mastery,
    unlockedCannons: captain.ownedCannons,
    unlockedIslands: captain.unlockedIslands,
  });

  return {
    ...captain,
    mastery,
    ownedCannons: [...new Set([...captain.ownedCannons, ...unlocked.cannons])],
    unlockedIslands: [...new Set([...captain.unlockedIslands, ...unlocked.islands])],
  };
}

export function createCaptainStore(initial?: Captain): CaptainStore {
  return createStore<CaptainState>((set, get) => ({
    captain: initial ?? emptyCaptain(),

    setGradeBand: (band) =>
      set((s) => {
        const placement = resolvePlacement(band);
        return {
          captain: {
            ...s.captain,
            gradeBand: band,
            // D-6: placement grants islands to band and starters only. Everything else is earned.
            ownedCannons: [...new Set([...s.captain.ownedCannons, ...placement.unlockedCannons])],
            unlockedIslands: [...new Set([...s.captain.unlockedIslands, ...placement.unlockedIslands])],
            // Equip what they own. A-011 lets them change it; until then a captain is never
            // stranded on a duel screen with no gun.
            equippedCannons: [...placement.unlockedCannons],
            currentIsland: s.captain.currentIsland ?? placement.unlockedIslands[0] ?? null,
          },
        };
      }),

    setNameAndFlag: (name, flag) => set((s) => ({ captain: { ...s.captain, name: name.trim(), flag } })),

    completeOnboarding: () => set((s) => ({ captain: { ...s.captain, hasCompletedOnboarding: true } })),

    markGuidedDuelFought: () => set((s) => ({ captain: { ...s.captain, hasFoughtGuidedDuel: true } })),

    // Clamped at zero rather than trusted: a negative payout is a bug somewhere upstream, and the
    // store is the last place that can stop it becoming a negative balance on a child's screen.
    addCoins: (amount) =>
      set((s) => ({ captain: { ...s.captain, coins: Math.max(0, s.captain.coins + amount) } })),

    spendCoins: (amount) => {
      const { coins } = get().captain;
      if (amount < 0 || amount > coins) return false;
      set((s) => ({ captain: { ...s.captain, coins: s.captain.coins - amount } }));
      return true;
    },

    recordDuelAnswers: (skill, tally) =>
      set((s) => ({ captain: applyTally(s.captain, skill, 'duel', tally) })),

    recordRangeAnswers: (skill, tally) =>
      set((s) => ({ captain: applyTally(s.captain, skill, 'range', tally) })),

    recordDuelResult: ({ won }) =>
      set((s) => {
        const wins = s.captain.wins + (won ? 1 : 0);
        // Derived, and ratcheted: `rankTierForWins` is monotonic in wins and wins never decrease,
        // so a loss cannot lower the tier. Max() would hide a regression rather than prevent one.
        return { captain: { ...s.captain, wins, rankTier: rankTierForWins(wins) } };
      }),

    equipCannons: (ids) =>
      set((s) => ({
        captain: {
          ...s.captain,
          // Owning is the precondition for equipping. Filtering here rather than trusting the
          // caller means no screen can equip a gun the captain has not earned.
          equippedCannons: ids.filter((id) => s.captain.ownedCannons.includes(id)),
        },
      })),

    setCurrentIsland: (id) => set((s) => ({ captain: { ...s.captain, currentIsland: id } })),

    replaceCaptain: (captain) => set({ captain }),
  }));
}
