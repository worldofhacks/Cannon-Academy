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
import type { MercyState } from '@engine/opponents/mercy';
import { applyAnswer, emptyMastery, resolveUnlocks, type SkillMastery } from '@engine/mastery';
import { resolvePlacement } from '@engine/placement';
import { rankTierForWins } from '@engine/ranks';

import type { RewardReceipts } from '../contracts/rewards';
import { DEFAULT_SKIN_ID } from '../theme/shipSkins';

/** Fresh mercy container — never alias `emptyMercyState` (shared nested array). */
function freshMercyState(): MercyState {
  return {
    recentPlayerCorrect: [],
    consecutiveLosses: 0,
    forcedMisfiresRemaining: 0,
  };
}

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
  /** Owned cannons the captain has inspected on the gun deck — drives the "new" badge (A-011). */
  seenCannons: CannonId[];
  unlockedIslands: IslandId[];
  /**
   * Ship skins the captain owns. Paint only — a skin can never reach damage, mastery or unlocks
   * (`theme/shipSkins.ts`). Always contains the starter, so this is never empty on a live captain.
   */
  ownedSkins: string[];
  /** The skin currently sailing. `null` means the starter, so an untouched save needs no migration. */
  equippedSkin: string | null;
  /**
   * Islands whose first-landing encounter (A-066) has played. A latch, not a receipt: it is both
   * the shown-once guard and the coin-payout idempotency, because `duel:`/`purchase:` are the only
   * receipt key kinds A-041 admits. Tolerated-as-absent — same ruling as `seenCannons`.
   */
  seenEncounters: IslandId[];
  /** Generated-fleet ship ids the captain has actually fought (A-067) — drives the shelf's MET count. */
  metRivals: string[];
  rankTier: number;
  wins: number;
  currentIsland: IslandId | null;
  hasCompletedOnboarding: boolean;
  hasFoughtGuidedDuel: boolean;
  /**
   * Which beat of the chart walkthrough the captain is on (onboarding board rule RESUME).
   *
   * *"Children are interrupted constantly. The beat index persists, so a closed app reopens on the
   * same beat with the same line spoken again — never at the start, and never skipped forward."*
   *
   * Only the chart beats (17–20) need this. Every earlier beat is already resumable because its
   * position is a fact about the captain — no band means the picker, no name means the name screen,
   * no latch means the guided duel — and `resolveDestination` reads all three. The chart
   * walkthrough is the one stretch with nothing else to derive its position from.
   *
   * Tolerated as absent by `persistence.ts` and deliberately NOT part of `isBaseCaptain`; see the
   * note there before adding it to the structural check.
   */
  onboardingBeat: number;
  /**
   * A tour replay is running — the Rank screen's "Watch the tour again", walked a second time.
   *
   * This exists because the two things that gate the tour on a first run are LATCHES, and latches
   * are the one kind of state a replay must not touch. `hasCompletedOnboarding` and
   * `hasFoughtGuidedDuel` are written `true` exactly once and never back to `false`: clearing
   * either to "let them replay" re-gates a returning captain into the tutorial on the next cold
   * start (`resolveDestination` step 3, frozen by `demo-navigation.test.ts` AC-3), which to a child
   * is indistinguishable from the game deleting their progress.
   *
   * So the replay gets its own bit, and the chart walkthrough shows when
   * `!hasCompletedOnboarding || replayingTour` — see `chartTourShowing`.
   *
   * **It is session state wearing a persisted field's clothes.** It is written into the save
   * because the whole captain is, but `persistence.ts` reads it back as `false` on every launch,
   * always. That is what clears an ABANDONED replay: a captain who force-quits halfway through one
   * relaunches onto their chart, not into a tour they walked away from. A resume index is worth
   * restoring (board rule RESUME); an unfinished second viewing of a tutorial the captain has
   * already completed is not.
   *
   * Tolerated as absent by `persistence.ts` and deliberately NOT part of `isBaseCaptain`, exactly
   * like `onboardingBeat` and `seenCannons`.
   */
  replayingTour: boolean;
  /** Durable rival-mercy ledger (A-041). Survives relaunch for A-030. */
  mercyState: MercyState;
  /** Committed reward receipts keyed by `duel:<id>` / `purchase:<seq>` (A-041). */
  rewardReceipts: RewardReceipts;
  /** Next Harbor purchase sequence; starts at zero (A-041). */
  nextPurchaseSequence: number;
}

export interface CaptainState {
  captain: Captain;

  /** Placement: pre-unlocks islands to band and STARTER cannons only (owner ruling D-6). */
  setGradeBand: (band: GradeBand) => void;
  setNameAndFlag: (name: string, flag: string) => void;
  /** Ends the tour: latches completion and disarms any replay. Never writes a latch `false`. */
  completeOnboarding: () => void;
  markGuidedDuelFought: () => void;
  /**
   * Arms the chart half of a tour replay, from its first beat.
   *
   * Called at the replay duel's send-off, not when the Rank row is tapped — see the note on the
   * action itself. Touches nothing but `replayingTour` and the beat index: a replay pays nothing
   * and owes nothing (A-015).
   */
  beginTourReplay: () => void;
  /** Records the chart-walkthrough beat so a relaunch resumes on it (board rule RESUME). */
  setOnboardingBeat: (beat: number) => void;

  addCoins: (amount: number) => void;
  /** Returns false and changes nothing when the captain cannot afford it. */
  spendCoins: (amount: number) => boolean;

  /** Duel answers fill mastery at the DUEL rate — half the range rate. */
  recordDuelAnswers: (skill: SkillId, tally: { correct: number; asked: number }) => void;
  /** Range drills fill at the FULL rate. A-009 calls this. */
  recordRangeAnswers: (skill: SkillId, tally: { correct: number; asked: number }) => void;

  recordDuelResult: (result: { won: boolean }) => void;
  equipCannons: (ids: readonly CannonId[]) => void;
  /** Union into `seenCannons` — opening the deck marks what is on it, without replacing prior seen. */
  markCannonsSeen: (ids: readonly CannonId[]) => void;
  setCurrentIsland: (id: IslandId) => void;

  /** Replaces the whole captain — used by rehydration (A-002) and by the dev screen. */
  replaceCaptain: (captain: Captain) => void;
}

export type CaptainStore = StoreApi<CaptainState>;

/**
 * The name a captain sails under when they skip the name screen.
 *
 * Applied at COMMIT, never in `emptyCaptain()`. `flow.ts` reads an empty name as "not yet asked"
 * and routes to the name screen — so defaulting at construction would make that screen permanently
 * unreachable, and leaving the bare `.trim()` would make "skip" produce `''`, which routes straight
 * back to the same screen. Commit-time substitution is the only placement that satisfies both.
 */
export const DEFAULT_CAPTAIN_NAME = 'Captain';

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
    seenCannons: [],
    unlockedIslands: [],
    ownedSkins: [DEFAULT_SKIN_ID],
    equippedSkin: null,
    seenEncounters: [],
    metRivals: [],
    rankTier: 0,
    wins: 0,
    currentIsland: null,
    hasCompletedOnboarding: false,
    hasFoughtGuidedDuel: false,
    onboardingBeat: 0,
    replayingTour: false,
    mercyState: freshMercyState(),
    rewardReceipts: {},
    nextPurchaseSequence: 0,
  };
}

/**
 * Pure captain-tally transition (A-041).
 *
 * Produces the next Captain snapshot (mastery + unlocks) without mutating `captain`, so a later
 * reward settlement can compute one snapshot and call `replaceCaptain` once.
 */
export function applyCaptainTally(
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
    ...(captain.gradeBand === null ? {} : { gradeBand: captain.gradeBand }),
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
            // Equip what they own, CAPPED AT THE TRAY. A-011 lets them change it; until then a
            // captain is never stranded on a duel screen with no gun.
            //
            // `equippedCannons`, not `unlockedCannons`: placement can grant more guns than the tray
            // can carry (a `g4_5` captain gets four against a capacity of three, via
            // `PLACEMENT_EXCEPTIONS`). Equipping all of them made the gun deck report "4 OF 3 SLOTS"
            // and then refuse to Save a loadout the app had assigned itself.
            equippedCannons: [...placement.equippedCannons],
            currentIsland: s.captain.currentIsland ?? placement.unlockedIslands[0] ?? null,
          },
        };
      }),

    setNameAndFlag: (name, flag) =>
      set((s) => ({
        captain: { ...s.captain, name: name.trim() || DEFAULT_CAPTAIN_NAME, flag },
      })),

    // `Sail!`, and the end of a replay as well as of a first run. Setting the latch is idempotent
    // on a captain who already had it; clearing `replayingTour` is what makes the sheet the end of
    // the SECOND viewing too, rather than a tour that never switches itself off.
    completeOnboarding: () =>
      set((s) => ({
        captain: { ...s.captain, hasCompletedOnboarding: true, replayingTour: false },
      })),

    markGuidedDuelFought: () => set((s) => ({ captain: { ...s.captain, hasFoughtGuidedDuel: true } })),

    /*
     * Armed at the replay duel's send-off rather than when the Rank row is tapped, and that is the
     * whole answer to "what clears an abandoned replay".
     *
     * A captain who opens the replay and leaves the duel halfway never armed anything, so there is
     * nothing to clear — the flag only exists between the duel's ending and the chart tour's. From
     * there the one way out clears it: `Sail!` (completion). Anything else is a force-quit, and
     * `persistence.ts` reads the flag back as `false` on the next launch.
     *
     * The beat index goes back to the first chart beat because the walkthrough resumes from it
     * (board rule RESUME) and a finished captain's index is parked on `done` — without this, a
     * replay would open on the send-off it just came from.
     */
    beginTourReplay: () =>
      set((s) => ({ captain: { ...s.captain, replayingTour: true, onboardingBeat: 0 } })),

    // Clamped and floored here rather than at the screen, for the same reason `addCoins` clamps:
    // the store is the last place that can stop a bad index reaching a child's save. A negative or
    // fractional beat would persist and resume into a walkthrough state that does not exist.
    setOnboardingBeat: (beat) =>
      set((s) => ({
        captain: {
          ...s.captain,
          onboardingBeat: Number.isFinite(beat) ? Math.max(0, Math.floor(beat)) : 0,
        },
      })),

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
      set((s) => ({ captain: applyCaptainTally(s.captain, skill, 'duel', tally) })),

    recordRangeAnswers: (skill, tally) =>
      set((s) => ({ captain: applyCaptainTally(s.captain, skill, 'range', tally) })),

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

    markCannonsSeen: (ids) =>
      set((s) => ({
        captain: {
          ...s.captain,
          seenCannons: [...new Set([...s.captain.seenCannons, ...ids])],
        },
      })),

    setCurrentIsland: (id) => set((s) => ({ captain: { ...s.captain, currentIsland: id } })),

    replaceCaptain: (captain) => set({ captain }),
  }));
}
