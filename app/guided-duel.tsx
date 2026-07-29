import { router } from 'expo-router';
import { useEffect } from 'react';

import { captainStore } from '../src/stores/useCaptain';

/**
 * The guided first duel — STUB.
 *
 * `flow.ts` routes a captain here before their first real duel, so this route must exist or the
 * resolver sends them to a screen that isn't there. That is a crash, not a missing feature, which
 * is why a stub lands ahead of the ticket.
 *
 * The real screen is A-006's guided duel: the scripted rival from T-018 (which the engine track has
 * now landed) and `ONBOARDING_ENEMY_HULL`, on a duel the player cannot lose. Until then this marks
 * the step complete and moves on, so the flow is walkable end to end.
 */
export default function GuidedDuelStub() {
  useEffect(() => {
    captainStore.getState().markGuidedDuelFought();
    router.replace('/chart');
  }, []);
  return null;
}
