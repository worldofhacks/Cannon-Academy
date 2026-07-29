import {
  Baloo2_500Medium,
  Baloo2_600SemiBold,
  Baloo2_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/baloo-2';
import { Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { Stack } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Splash } from '../src/components/Splash';

/**
 * Root layout.
 *
 * ARCHITECTURE.md §8 calls for the hydration gate to live here: AsyncStorage rehydration is
 * async, and an ungated redirect fires against empty state (README "traps already identified").
 * The gate lands with the player store; until then there is nothing persisted to wait on.
 *
 * Fonts are the other async gate, and they land now. The six faces below are exactly the six
 * named in `src/theme/tokens.ts` — React Native will not synthesise a weight for a custom family,
 * so every weight the design uses has to be loaded as its own face or it silently renders as the
 * nearest one that *was* loaded. Rendering before they resolve gives a system-font flash on every
 * cold start, which on a 375pt phone reflows the whole HUD.
 */
export default function RootLayout() {
  const { width } = useWindowDimensions();
  const [fontsLoaded] = useFonts({
    Baloo2_500Medium,
    Baloo2_600SemiBold,
    Baloo2_800ExtraBold,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  // Board 4a: the hold is either a white rectangle or it is the splash. `useWindowDimensions`
  // rather than a constant, because the splash scales off the design's 375pt reference width.
  if (!fontsLoaded) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Splash width={width} />
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
