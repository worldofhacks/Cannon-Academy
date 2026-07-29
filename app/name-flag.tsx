import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { resolveDestination } from '../src/services/flow';
import { DEFAULT_CAPTAIN_NAME } from '../src/stores/player';
import { captainStore } from '../src/stores/useCaptain';
import { DEFAULT_FLAG_ID, FLAGS } from '../src/theme/flags';
import { color, radius, space, type, MIN_TAP_TARGET } from '../src/theme/tokens';
import { ResponsiveFrame } from '../src/components/ResponsiveFrame';
import { useLayout } from '../src/theme/useLayout';

/**
 * Board 5b — "Name your ship, choose your flag".
 *
 * The second onboarding step, and the one that makes the ship theirs: the flag chosen here becomes
 * the ship's pennant (`shipCosmeticsForCaptain`), so a child recognises their own ship before the
 * first chest ever drops. `flow.ts` routes any captain with a band but no name or no flag here, and
 * will not let them past — which is why every exit from this screen, including the skip, has to
 * commit through the store.
 *
 * ## Two things the frozen tests pin, and why the code looks like this
 *
 * **The flag state is never null.** It is seeded to `DEFAULT_FLAG_ID` rather than left empty until
 * a tap — a nullable flag would let a skip commit `flag: null`, which is exactly what `flow.ts`
 * refuses, and the child bounces straight back here forever. Seeding it also means the screen opens
 * with a flag already flying rather than with six inert swatches, which is the better read anyway.
 *
 * (The frozen test enforces this by reading the file as text, so it sees prose as well as code:
 * spelling the rejected null-seeded form out literally in this comment is enough to fail it. Hence
 * the description rather than the example.)
 *
 * **The blank name is not defaulted here.** `setNameAndFlag` substitutes `DEFAULT_CAPTAIN_NAME` for
 * an empty trimmed name (A-001), so this screen passes the raw text through and both the Save and
 * the Skip path go through the same commit. Doing it locally would be a second literal that drifts
 * — the constant is imported for the placeholder instead, which is the only place the screen needs
 * to *show* the default.
 *
 * Geometry follows `onboarding.tsx`: parchment ground, white cards, a 4pt bottom edge that the
 * press collapses to 1pt, every offset scaled off the board's 375pt reference by `useLayout`.
 */
export default function NameFlag() {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const px = L.a;
  const tx = L.t;

  const [name, setName] = useState('');
  // Seeded, never null — see the note above. This is the whole of AC-3's skip guarantee.
  const [flag, setFlag] = useState(DEFAULT_FLAG_ID);

  // One commit for both buttons. Skip is "commit what is on screen", which for an untouched screen
  // is a blank name (defaulted by the store) against the first flag.
  const commit = () => {
    captainStore.getState().setNameAndFlag(name, flag);
    // Never a hardcoded route: the resolver owns the sequence, so whatever comes after the name
    // screen changes in one place. `replace`, not `push` — onboarding is not a back stack.
    router.replace(`/${resolveDestination(captainStore.getState().captain)}`);
  };

  return (
    <ResponsiveFrame surface="reading">
      <View
        style={[
          s.screen,
          {
            paddingTop: insets.top + px(14),
            paddingBottom: insets.bottom + px(14),
            paddingHorizontal: L.gutter,
            gap: px(14),
          },
        ]}
      >
        <Text style={[s.title, { fontSize: tx(23), lineHeight: tx(26) }]}>Name your ship</Text>

        <View style={[s.card, { borderRadius: px(radius.card), padding: px(12), borderBottomWidth: px(4) }]}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={DEFAULT_CAPTAIN_NAME}
            placeholderTextColor={color.inkDarkMuted}
            accessibilityLabel="Your captain name"
            maxLength={20}
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={commit}
            style={[s.input, { fontSize: tx(22), lineHeight: tx(28), minHeight: px(MIN_TAP_TARGET) }]}
          />
        </View>

        <Text style={[s.eyebrow, { fontSize: tx(11), letterSpacing: tx(11) * 0.08 }]}>CHOOSE YOUR FLAG</Text>

        <View style={[s.flagRow, { gap: px(10) }]}>
          {FLAGS.map((f) => {
            const chosen = flag === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => setFlag(f.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: chosen }}
                accessibilityLabel={`${f.label} flag`}
                style={({ pressed }) => [
                  s.flagCard,
                  {
                    borderRadius: px(radius.tile),
                    padding: px(8),
                    gap: px(6),
                    minWidth: px(MIN_TAP_TARGET),
                    minHeight: px(MIN_TAP_TARGET),
                    borderBottomWidth: px(4),
                    borderBottomColor: chosen ? color.amber : color.parchmentEdge,
                  },
                  pressed && { transform: [{ translateY: px(3) }], borderBottomWidth: px(1) },
                ]}
              >
                {/* The pennant shape, not a square chip — the swatch is a small rehearsal of what
                  will be flying off the mast in the duel. */}
                <View
                  style={{
                    width: px(34),
                    height: px(22),
                    borderRadius: px(3),
                    backgroundColor: f.color,
                  }}
                />
                {/* Labelled, because six swatches alone are unusable to a colour-blind child. */}
                <Text style={[s.flagLabel, { fontSize: tx(10) }]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ flex: 1 }} />

        <Pressable
          onPress={commit}
          accessibilityRole="button"
          accessibilityLabel="Set sail"
          style={({ pressed }) => [
            s.primary,
            { height: px(MIN_TAP_TARGET), borderRadius: px(radius.card), borderBottomWidth: px(4) },
            pressed && { transform: [{ translateY: px(3) }], borderBottomWidth: px(1) },
          ]}
        >
          <Text style={[s.primaryText, { fontSize: tx(20), lineHeight: tx(24) }]}>Set sail</Text>
        </Pressable>

        {/* Skip commits too. A skip wired only to `router` would leave the captain unnamed and
          unflagged, and `flow.ts` would send them right back here — a button that does nothing. */}
        <Pressable
          onPress={commit}
          accessibilityRole="button"
          accessibilityLabel="Skip, choose for me"
          style={({ pressed }) => [s.skip, { minHeight: px(MIN_TAP_TARGET) }, pressed && { opacity: 0.6 }]}
        >
          <Text style={[s.skipText, { fontSize: tx(13) }]}>Skip — choose for me</Text>
        </Pressable>
      </View>
    </ResponsiveFrame>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.parchment },
  title: { fontFamily: type.display.fontFamily, color: color.inkDark },
  card: {
    backgroundColor: color.white,
    borderBottomColor: color.parchmentEdge,
  },
  input: { fontFamily: type.display.fontFamily, color: color.inkDark, padding: 0 },
  eyebrow: { fontFamily: type.eyebrow.fontFamily, color: color.inkDarkMuted },
  flagRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  flagCard: {
    flexGrow: 1,
    flexBasis: '28%',
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagLabel: { fontFamily: type.chip.fontFamily, color: color.inkDarkMuted },
  primary: {
    alignSelf: 'stretch',
    backgroundColor: color.amber,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomColor: color.goldDeep,
  },
  primaryText: { fontFamily: type.display.fontFamily, color: color.inkDark },
  skip: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  skipText: { fontFamily: type.body.fontFamily, color: color.inkDarkMuted, marginTop: space[1] },
});
