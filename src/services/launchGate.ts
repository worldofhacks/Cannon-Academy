import type { Destination } from './flow';

export interface LaunchGate {
  readonly acknowledged: boolean;
  markReady(destination: Destination): void;
  start(navigate: (destination: Destination) => void): boolean;
}

/** A process-local, synchronous acknowledgement for the branded launch screen. */
export function createLaunchGate(): LaunchGate {
  let destination: Destination | null = null;
  let acknowledged = false;

  return {
    get acknowledged() {
      return acknowledged;
    },
    markReady(nextDestination) {
      if (!acknowledged) destination = nextDestination;
    },
    start(navigate) {
      if (destination === null || acknowledged) return false;
      acknowledged = true;
      navigate(destination);
      return true;
    },
  };
}
