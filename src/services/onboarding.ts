/**
 * Committing the grade picker's answer.
 *
 * A-005. Board 1a rendered correctly and then threw the answer away: the chosen band went into
 * component state and the screen pushed to `/duel`, so `resolvePlacement` was never called with it
 * and the islands and starter cannons the whole placement design exists to grant were never
 * granted. This is the one function that closes that gap.
 *
 * Two properties, and both are load-bearing:
 *
 *  1. **The band is written THROUGH the store.** `setGradeBand` is what calls `resolvePlacement`
 *     and applies owner ruling D-6 (islands to the band, starter cannons only). Writing the field
 *     directly — or re-deriving placement here — would put a second copy of the placement rules
 *     beside the store's, and the second copy is the one that drifts.
 *  2. **It RETURNS the destination rather than navigating.** The screen navigates to what it is
 *     handed, so the flow resolver stays the single place that decides where a captain goes
 *     (A-003). A `void` version of this function would leave the screen inventing its own next
 *     route, which is the exact defect A-003 exists to remove.
 *
 * It lives here rather than in `app/onboarding.tsx` for the reason the rest of this layer does:
 * vitest runs in node and React Native's entry point is Flow-typed, so anything inside a screen
 * cannot be frozen-tested. Logic in a service, rendering in the screen.
 */
import type { GradeBand } from '@content/schemas';

import { emptyCaptain, type Captain, type CaptainStore } from '../stores/player';

import { resolveDestination, type Destination } from './flow';

/**
 * Commits a chosen grade band and reports where the captain goes next.
 *
 * Takes the store rather than reading the module-level singleton so it can be driven by a fresh
 * `createCaptainStore()` in tests — the same seam `persistence.ts` uses for storage.
 */
export function commitGradeBand(store: CaptainStore, band: GradeBand): Destination {
  store.getState().setGradeBand(band);
  return resolveDestination(store.getState().captain);
}

/**
 * Whether the chart walkthrough is on screen for this captain.
 *
 * A pure predicate rather than an expression inside the overlay, because it is the one line that
 * decides whether beats 17–20 can ever be seen again — and a component's internals cannot be
 * frozen-tested under this runner (RN's entry point is Flow-typed; node cannot parse it).
 *
 * The `||` is the whole of decision 1. Gating on `!hasCompletedOnboarding` alone is what made the
 * chart tour unreachable after the first run: the flag is set once and never cleared, so the Rank
 * screen's "Watch the tour again" could only ever replay the duel half.
 */
export function chartTourShowing(
  captain: Pick<Captain, 'hasCompletedOnboarding' | 'replayingTour'>,
): boolean {
  return !captain.hasCompletedOnboarding || captain.replayingTour;
}

// ── Start over ────────────────────────────────────────────────────────────────────────────────

/**
 * The copy for the "start over" sheet, held here rather than in a screen for one reason: it has to
 * stay in step with what the reset actually clears, and a test can only check that if both are
 * reachable from node. `spec(A-005:AC-3)` reads the two together.
 *
 * Tone is the Harbor's "Not yet, Captain" sheet — warm, plain, never blaming, and never an error.
 * It states the loss in the child's own nouns (coins, ships, islands, skills) because those are the
 * things on the screen the grown-up is standing in front of.
 */
export const START_OVER = {
  /** The Rank row. Quiet, and worded as a thing you do, not a setting you toggle. */
  rowTitle: 'Start over',
  rowDetail: 'Clear this captain and begin again.',
  rowAccessibilityLabel: 'Start over, clear this captain and begin again',
  /** The sheet. A question, asked once, with the answer that keeps everything as the easy one. */
  sheetTitle: 'Start over, Captain?',
  sheetBody:
    'This clears everything this captain has — their coins, their ships, the islands they opened and the skills they filled — and begins again at the very first screen.',
  sheetNote: 'For grown-ups. There is no way to undo it.',
  keepLabel: 'No, keep my captain',
  confirmLabel: 'Yes, clear and start over',
} as const;

/**
 * Clears the captain and reports where a brand-new one belongs.
 *
 * **Nothing is preserved.** The whole point is a state indistinguishable from a first install — the
 * demo path this closes was "delete the app's Documents directory from a terminal", and a reset
 * that quietly kept a field would leave the next launch subtly unlike the thing being demoed. So it
 * is `emptyCaptain()` exactly: no band, no name, no flag, no coins, no mastery, no skins, no
 * receipts, and both tour latches back at their fresh-install `false`.
 *
 * That is the ONE place either latch is written `false`, and it is not a regression of the
 * monotonicity rule — it is the construction of a different captain. The rule protects a captain's
 * progress from being re-gated behind them; here there is deliberately no progress left to protect.
 *
 * It goes through `replaceCaptain`, which means the root layout's store subscription persists it
 * like any other change. A reset that only cleared memory would come back on the next launch, and a
 * demo that unfixes itself is worse than no reset at all.
 */
export function commitStartOver(store: CaptainStore): Destination {
  store.getState().replaceCaptain(emptyCaptain());
  return resolveDestination(store.getState().captain);
}
