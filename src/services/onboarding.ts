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

import type { CaptainStore } from '../stores/player';

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
