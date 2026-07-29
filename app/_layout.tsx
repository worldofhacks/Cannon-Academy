import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

/**
 * Root layout.
 *
 * ARCHITECTURE.md §8 calls for the hydration gate to live here: AsyncStorage rehydration is
 * async, and an ungated redirect fires against empty state (README "traps already identified").
 * The gate lands with the player store; until then there is nothing persisted to wait on.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
