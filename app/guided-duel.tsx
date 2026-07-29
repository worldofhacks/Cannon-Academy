import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ResponsiveFrame } from '../src/components/ResponsiveFrame';
import { captainStore } from '../src/stores/useCaptain';
import { useLayout } from '../src/theme/useLayout';
import { color, type } from '../src/theme/tokens';

/**
 * Guided first duel — interim teaching gate (full scripted duel is A-015).
 *
 * Must render a world ResponsiveFrame (A-043). Completing / navigating on mount is forbidden so
 * tablet/desktop reviewers actually see a surface; the captain continues via the button.
 */
export default function GuidedDuelGate() {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const tx = L.t;

  const continueToChart = () => {
    captainStore.getState().markGuidedDuelFought();
    router.replace('/chart');
  };

  return (
    <ResponsiveFrame surface="world">
      <View
        style={[
          s.screen,
          {
            paddingTop: insets.top + L.t(24),
            paddingBottom: insets.bottom + L.t(24),
            paddingHorizontal: L.gutter,
          },
        ]}
      >
        <Text style={[s.kicker, { fontSize: tx(14), lineHeight: tx(18) }]}>FIRST VOYAGE</Text>
        <Text style={[s.title, { fontSize: tx(28), lineHeight: tx(34) }]}>Cannons fire when you answer.</Text>
        <Text style={[s.body, { fontSize: tx(16), lineHeight: tx(22) }]}>
          Pick a cannon, solve the math before the fuse burns out, and a correct answer aims the shot. Faster
          answers hit harder. Practice at the range when you want a calmer drill.
        </Text>
        <View style={s.spacer} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Continue to the sea chart"
          onPress={continueToChart}
          style={({ pressed }) => [s.cta, { minHeight: L.t(64) }, pressed && s.ctaPressed]}
        >
          <Text style={[s.ctaLabel, { fontSize: tx(18), lineHeight: tx(24) }]}>Set sail</Text>
        </Pressable>
      </View>
    </ResponsiveFrame>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.parchment, justifyContent: 'flex-start' },
  kicker: { fontFamily: type.chip.fontFamily, color: color.inkDarkMuted, letterSpacing: 1.2 },
  title: { fontFamily: type.display.fontFamily, color: color.inkDark, marginTop: 12 },
  body: { fontFamily: type.body.fontFamily, color: color.inkDarkMuted, marginTop: 16 },
  spacer: { flex: 1 },
  cta: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 32,
    backgroundColor: color.amber,
    borderBottomWidth: 4,
    borderBottomColor: color.woodDeep,
  },
  ctaPressed: { transform: [{ translateY: 3 }], borderBottomWidth: 1 },
  ctaLabel: { fontFamily: type.display.fontFamily, color: color.inkDark },
});
