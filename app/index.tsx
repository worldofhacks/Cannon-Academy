import { Redirect } from 'expo-router';

import { resolveDestination } from '../src/services/flow';
import { useCaptain } from '../src/stores/useCaptain';

/**
 * The entry route. It is a REDIRECT, not a screen.
 *
 * This used to be a title screen with a "Sail into a duel" button that pushed straight to
 * `/duel`. That was written before the flow resolver existed, and it survived it — so a fresh
 * captain could reach the duel with no grade band, no cannons and no name, and the duel's own
 * guard threw `placement granted no cannons` on a red screen. The launcher had become a hole
 * straight through the onboarding flow.
 *
 * `resolveDestination` is the single place that decides where a captain belongs (A-003). Having
 * a second, hardcoded opinion about it here is exactly the class of bug that resolver exists to
 * prevent, so this route now has no opinion at all.
 */
export default function Index() {
  const captain = useCaptain((s) => s.captain);
  return <Redirect href={`/${resolveDestination(captain)}`} />;
}
