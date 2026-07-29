import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { resolvePlacement } from '@engine/placement';

import { color, radius, space, type } from '../src/theme/tokens';

/**
 * Title screen — a launcher, not the game.
 *
 * The sea chart, onboarding and the loadout are still to build; until they exist this is the
 * shortest path from a cold start to the duel, which is the only screen worth demoing.
 */
export default function Title() {
  const insets = useSafeAreaInsets();

  // Counted, not written down. This line said "Swivel Gun and Culverin aboard" while the tray one
  // tap later showed four guns — a hardcoded claim the app itself contradicts. Deriving it means
  // the copy cannot drift from placement, including when T-032 changes what placement grants.
  const armed = useMemo(() => resolvePlacement('k_1').unlockedCannons.length, []);

  return (
    <View style={[s.screen, { paddingTop: insets.top + space[7], paddingBottom: insets.bottom + space[6] }]}>
      <View style={s.crest}>
        <Text style={s.crestGlyph}>⚓</Text>
      </View>

      <Text style={s.kicker}>MATH ON THE HIGH SEAS</Text>
      <Text style={s.title}>Cannon Academy</Text>
      <Text style={s.body}>
        Every shot is a question. Answer fast and the shot flies truer — answer slowly and it still fires.
      </Text>

      <View style={{ flex: 1 }} />

      {/* `Link asChild` clones the child and replaces its `style` prop, which silently drops a
          function-valued style — the button rendered with no fill at all. An imperative push keeps
          the pressed state working. */}
      <Pressable
        onPress={() => router.push('/duel')}
        accessibilityRole="button"
        style={({ pressed }) => [s.primary, pressed && s.pressed]}
      >
        <Text style={s.primaryText}>Sail into a duel</Text>
      </Pressable>
      <Text style={s.foot}>
        Port Sumwich · {armed} cannon{armed === 1 ? '' : 's'} aboard
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.deepSea, paddingHorizontal: space[5], alignItems: 'center' },
  crest: {
    width: 88,
    height: 88,
    borderRadius: radius.panel,
    backgroundColor: color.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space[5],
  },
  crestGlyph: { fontSize: 44, color: color.gold },
  kicker: { ...type.eyebrow, color: color.amber },
  title: { ...type.display, color: color.parchment, marginTop: space[2], textAlign: 'center' },
  body: {
    ...type.body,
    color: color.inkMuted,
    textAlign: 'center',
    marginTop: space[3],
    maxWidth: 300,
  },
  primary: {
    alignSelf: 'stretch',
    height: 64,
    borderRadius: radius.card,
    backgroundColor: color.amber,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 4,
    borderBottomColor: color.goldDeep,
  },
  pressed: { transform: [{ translateY: 3 }], borderBottomWidth: 1 },
  primaryText: { ...type.display, fontSize: 20, lineHeight: 24, color: color.inkDark },
  foot: { ...type.caption, color: color.inkSoft, marginTop: space[3] },
});
