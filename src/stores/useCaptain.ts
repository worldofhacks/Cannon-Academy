/**
 * The React binding for the captain store.
 *
 * Separate from `player.ts` for the same reason `useLayout.ts` is separate from `responsive.ts`:
 * this file imports React, and keeping it out of the store is what lets every rule in the store be
 * frozen-tested headless. The store is the logic; this is the subscription.
 *
 * One module-level instance, because there is one captain. Tests build their own with
 * `createCaptainStore()` and never touch this.
 */
import { useStore } from 'zustand';

import { createCaptainStore, type CaptainState } from './player';

export const captainStore = createCaptainStore();

export function useCaptain<T>(selector: (state: CaptainState) => T): T {
  return useStore(captainStore, selector);
}

/** Imperative access for callbacks and effects, where a subscription would be wrong. */
export const captainActions = () => captainStore.getState();
