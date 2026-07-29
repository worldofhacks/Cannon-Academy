import {
  Baloo2_500Medium,
  Baloo2_600SemiBold,
  Baloo2_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/baloo-2';
import { Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Splash } from '../src/components/Splash';
import { resolveDestination, type Destination } from '../src/services/flow';
import { createLaunchGate } from '../src/services/launchGate';
import { hydrate, persist } from '../src/services/persistence';
import { captainStore } from '../src/stores/useCaptain';

const ignorePendingStart = () => undefined;

function PendingLaunchShell({ ready, fontsLoaded }: { ready: boolean; fontsLoaded: boolean }) {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Splash ready={ready} fontsLoaded={fontsLoaded} onStart={ignorePendingStart} />
    </SafeAreaProvider>
  );
}

/**
 * Root layout.
 *
 * ARCHITECTURE.md §8 calls for the hydration gate to live here: AsyncStorage rehydration is
 * async, and an ungated redirect fires against empty state (README "traps already identified").
 * That gate is now real — the splash holds the first frame until the stored captain has been read,
 * because a redirect decided before the read lands is a decision made against a blank captain, and
 * to a child that looks exactly like their progress was erased.
 *
 * **Where the captain goes is not decided here.** This file reads storage and then asks
 * `resolveDestination` (A-003), which is the single place that decides. A layout that inspected
 * the captain's own fields would be a second decision sitting beside the resolver, and the second
 * decision is the one that drifts out of step.
 *
 * Saving is also wired here, once, rather than in each screen: this is the app edge where the real
 * AsyncStorage is supplied, which is the arrangement `persistence.ts` is built for.
 *
 * Fonts are the other async gate, and they land now. The six faces below are exactly the six
 * named in `src/theme/tokens.ts` — React Native will not synthesise a weight for a custom family,
 * so every weight the design uses has to be loaded as its own face or it silently renders as the
 * nearest one that *was* loaded. Rendering before they resolve gives a system-font flash on every
 * cold start, which on a 375pt phone reflows the whole HUD.
 */
export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Baloo2_500Medium,
    Baloo2_600SemiBold,
    Baloo2_800ExtraBold,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  // `null` means "not read yet", which is what the splash waits on. It is deliberately not
  // seeded with a default: a default would be a routing decision taken before the read.
  const [destination, setDestination] = useState<Destination | null>(null);
  const [launchGate] = useState(createLaunchGate);
  const [launchAcknowledged, setLaunchAcknowledged] = useState(launchGate.acknowledged);

  useEffect(() => {
    let live = true;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      // `hydrate` never throws and never hangs — a corrupt or absent payload still resolves to a
      // playable captain (A-002), so there is no path here that leaves the splash up forever.
      const { captain } = await hydrate(AsyncStorage);
      if (!live) return;

      captainStore.getState().replaceCaptain(captain);
      // Subscribed AFTER the read, so the blank starting captain can never overwrite a real save.
      unsubscribe = captainStore.subscribe((s) => {
        void persist(AsyncStorage, s.captain);
      });
      const resolvedDestination = resolveDestination(captain);
      setDestination(resolvedDestination);
    })();

    return () => {
      live = false;
      unsubscribe?.();
    };
  }, []);

  // Board 4a: the hold is either a white rectangle or it is the splash. `useWindowDimensions`
  // rather than a constant, because the splash scales off the design's 375pt reference width.
  if (!fontsLoaded || destination === null)
    return <PendingLaunchShell ready={fontsLoaded && destination !== null} fontsLoaded={fontsLoaded} />;
  launchGate.markReady(destination);
  if (!launchAcknowledged) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Splash
          ready={fontsLoaded && destination !== null}
          fontsLoaded={fontsLoaded}
          onStart={() => {
            if (launchGate.start((resolvedDestination) => router.replace(`/${resolvedDestination}`))) {
              setLaunchAcknowledged(launchGate.acknowledged);
            }
          }}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
