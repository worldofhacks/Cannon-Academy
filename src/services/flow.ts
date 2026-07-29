/**
 * Which screen a captain belongs on.
 *
 * A-003. One pure function, deliberately not a hook and not a component — so it can be tested
 * exhaustively, and so there is exactly ONE place that decides. Before this, three routes existed
 * and none guarded its preconditions: onboarding pushed straight into a duel because the chart did
 * not exist, a returning captain was shown the title again, and a duel entered without a grade
 * band silently defaulted to K-1.
 *
 * The order of the checks IS the onboarding sequence. Read top to bottom and you have the flow.
 */
import type { Captain } from '../stores/player';

/**
 * Every screen the resolver can send a captain to. Exported so the totality test can assert the
 * function never returns anything outside this set — a route that exists but is unreachable, or a
 * destination that exists but is not a route, are both caught here rather than on a device.
 */
export const DESTINATIONS = ['onboarding', 'name-flag', 'guided-duel', 'gun-deck', 'chart'] as const;

export type Destination = (typeof DESTINATIONS)[number];

export function resolveDestination(captain: Captain): Destination {
  // 1. No band means we do not know what maths to show. Nothing else can proceed.
  if (captain.gradeBand === null) return 'onboarding';

  // 2. The flag becomes the ship's pennant (board 5b), so this is not cosmetic bookkeeping —
  //    it is the step that makes the ship theirs before the first chest.
  if (captain.name.trim() === '' || captain.flag === null) return 'name-flag';

  // 3. The guided duel runs exactly once. `hasFoughtGuidedDuel` is the latch; without it a
  //    returning captain would be walked through the tutorial on every launch.
  if (!captain.hasFoughtGuidedDuel) return 'guided-duel';

  // 4. A captain with nothing equipped cannot duel. Diverting to the gun deck is the difference
  //    between "choose your guns" and a duel screen with an empty tray.
  if (captain.equippedCannons.length === 0) return 'gun-deck';

  // 5. The hub. Everything routes through here, including a cold start mid-duel — which is why
  //    the chart is the answer rather than a resumed duel (PLAN.md: "relaunch, land safely on
  //    the map with progress intact").
  return 'chart';
}
