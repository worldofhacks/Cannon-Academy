import { router } from 'expo-router';
import { useEffect } from 'react';

import { captainStore, useCaptain } from '../src/stores/useCaptain';

/**
 * The gun deck — STUB.
 *
 * `flow.ts` diverts a captain with nothing equipped here rather than into an unplayable duel, so
 * the route must exist. A-011 builds the real screen (board 4d, 6 owned / 3 slots) and is currently
 * blocked on `TRAY_CAPACITY` landing in the engine track's `tuning.ts`.
 *
 * Until then this equips everything owned and returns to the chart — which is exactly the behaviour
 * the app had before a loadout existed, so nothing regresses while the real screen is waiting.
 */
export default function GunDeckStub() {
  const owned = useCaptain((s) => s.captain.ownedCannons);
  useEffect(() => {
    captainStore.getState().equipCannons(owned);
    router.replace('/chart');
  }, [owned]);
  return null;
}
