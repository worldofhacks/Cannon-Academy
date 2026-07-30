import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoachBar } from '../src/components/onboarding/CoachBar';
import { FlagBadge } from '../src/components/onboarding/FlagBadge';
import { SetupProgress } from '../src/components/onboarding/SetupProgress';
import {
  FLAG_COACH,
  isUnnamedCaptain,
  NAME_CHIPS,
  NAME_COACH,
} from '../src/components/onboarding/script';
import { ResponsiveFrame } from '../src/components/ResponsiveFrame';
import { resolveDestination } from '../src/services/flow';
import { captainStore, useCaptain } from '../src/stores/useCaptain';
import { DEFAULT_FLAG_ID, FLAGS } from '../src/theme/flags';
import { color, radius, type, MIN_TAP_TARGET } from '../src/theme/tokens';
import { useLayout } from '../src/theme/useLayout';

/**
 * Beats 3 and 4 — "Pick a name" and "Pick your flag" — and, on the same route, the captain's
 * papers: the rename a grown-up can reach forever after.
 *
 * The flag chosen here becomes the ship's pennant (`shipCosmeticsForCaptain`), so a child
 * recognises their own ship before the first chest ever drops. `flow.ts` routes any captain with a
 * band but no name or no flag here and will not let them past — which is why every exit from this
 * screen, including the skip, has to commit through the store.
 *
 * ## Two beats, one route — deliberately
 *
 * The board draws `name` and `flag` as separate beats and they are separate *panels* here, with the
 * setup pips advancing between them. They are NOT separate routes: `flow.test.ts` AC-2 pins
 * `resolveDestination` to the single string `'name-flag'`, and a second route file would break
 * `demo-navigation.test.ts` AC-1, which asserts `app/`'s contents against an exact ten-file list.
 * A panel is a `useState`; a route is a contract.
 *
 * ## Two modes
 *
 * `/name-flag` is the first run. `/name-flag?mode=edit` is the same screen reached from the Rank
 * screen's "Captain's papers", and it differs in exactly three ways, each of which is a bug if it
 * is missed:
 *
 *  1. **The fields are seeded from the captain, not from empty.** This screen used to open with
 *     `useState('')` and `useState(DEFAULT_FLAG_ID)` unconditionally. In edit mode that is silent
 *     data loss: a captain named "Wren" who opens the sheet, changes nothing and saves is renamed
 *     to "Captain", and a captain flying `flag-4` is quietly reflagged to `flag-1`. Seeding from
 *     the store costs one expression and is the whole fix.
 *  2. **The exit is `router.back()`, not a resolver replace.** In edit mode the captain already has
 *     a destination — the screen they came from. Replacing would strip their back stack.
 *  3. **The skip is hidden.** "Skip — choose for me" means "pick defaults for a child who has not
 *     chosen yet". Beside an existing name it reads as "discard my name", which is the opposite.
 *
 * ## Two things the frozen tests pin, and why the code looks like this
 *
 * **The flag state is never null.** It is seeded to the captain's flag or `DEFAULT_FLAG_ID` rather
 * than left empty until a tap — a nullable flag would let a skip commit a flag that is not there,
 * which is exactly what `flow.ts` refuses, and the child bounces straight back here forever.
 * Seeding it also means the screen opens with a flag already flying rather than with six inert
 * swatches, which is the better read anyway.
 *
 * (The frozen test enforces this by reading the file as text, so it sees prose as well as code:
 * spelling the rejected null-seeded form out literally in this comment is enough to fail it. Hence
 * the description rather than the example.)
 *
 * **The blank name is not defaulted here.** `setNameAndFlag` substitutes `DEFAULT_CAPTAIN_NAME` for
 * an empty trimmed name (A-001), so this screen passes the raw text through and every path — chip,
 * typed name, Save and Skip — goes through the same commit. Doing it locally would be a second
 * literal that drifts, and it would also make it structurally possible to write an empty name,
 * which routes the captain back to this screen forever.
 */
export default function NameFlag() {
  return (
    <ResponsiveFrame surface="reading">
      <NameFlagBody />
    </ResponsiveFrame>
  );
}

/** Board: the name chips are 64 on the drawing. `tokens.ts`: *"64 is the floor, not the target."* */
const CHIP_HEIGHT = 68;

function NameFlagBody() {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const px = L.a;
  const tx = L.t;

  const params = useLocalSearchParams<{ mode?: string }>();
  const editing = params.mode === 'edit';

  const captain = useCaptain((s) => s.captain);
  // Seeded from the captain, which is the whole of the rename fix. On a first run these are `''`
  // and `null`, so the fresh-captain behaviour is byte-identical to what it always was.
  const [name, setName] = useState(captain.name);
  // Never null — see the note above. This is the whole of AC-3's skip guarantee.
  const [flag, setFlag] = useState(captain.flag ?? DEFAULT_FLAG_ID);
  const [panel, setPanel] = useState<'name' | 'flag'>('name');

  // One commit for every button. Skip is "commit what is on screen", which for an untouched
  // first-run screen is a blank name (defaulted by the store) against the first flag.
  const commit = (chosenName: string, chosenFlag: string) => {
    captainStore.getState().setNameAndFlag(chosenName, chosenFlag);
    if (editing) {
      // The captain came from somewhere and is going back to it. `resolveDestination` would answer
      // `chart` here and throw away the Rank screen they opened this from.
      //
      // `canGoBack` is not defensive padding: `/name-flag?mode=edit` has to work standalone, and a
      // cold launch straight onto it (a deep link, a reload in the web build) has an empty stack —
      // where `back()` is a no-op and Save would look broken.
      if (router.canGoBack()) router.back();
      else router.replace('/chart');
      return;
    }
    // Never a hardcoded route: the resolver owns the sequence, so whatever comes after the name
    // screen changes in one place. `replace`, not `push` — onboarding is not a back stack.
    router.replace(`/${resolveDestination(captainStore.getState().captain)}`);
  };

  // The banner echoes the name the child just CHOSE. Until they have chosen one there is nothing to
  // echo, and the salutation beside it already says the word — see `isUnnamedCaptain`, which exists
  // because rendering the stored default here printed "Captain Captain" on the most common path.
  const banner = isUnnamedCaptain(name) ? '' : name.trim();

  return (
    <View style={[s.screen, { paddingTop: insets.top + px(8) }]}>
      <View style={{ paddingHorizontal: L.gutter, paddingBottom: px(8) }}>
        <SetupProgress step={panel} scale={px} />
      </View>

      <View style={[s.body, { paddingHorizontal: L.gutter, gap: px(8) }]}>
        {panel === 'name' ? (
          <>
            <Text style={[s.title, { fontSize: tx(23), lineHeight: tx(30) }]}>
              {editing ? 'Change your name' : 'Pick a name'}
            </Text>

            {/*
              The board's banner, and the reason it exists: the chosen name echoes back at 26pt so
              a child who cannot read the chip they just tapped still sees that the tap did
              something. It is confirmation, not decoration.
            */}
            <View
              style={[
                s.banner,
                {
                  height: px(CHIP_HEIGHT),
                  borderRadius: px(radius.card),
                  gap: px(8),
                  borderBottomWidth: px(4),
                },
              ]}
            >
              <Text
                style={[
                  banner === '' ? s.bannerName : s.bannerRank,
                  banner === ''
                    ? { fontSize: tx(26), lineHeight: tx(32) }
                    : { fontSize: tx(19), lineHeight: tx(24) },
                ]}
              >
                Captain
              </Text>
              {banner === '' ? null : (
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                  style={[s.bannerName, { fontSize: tx(26), lineHeight: tx(32), maxWidth: '62%' }]}
                >
                  {banner}
                </Text>
              )}
            </View>

            <View style={[s.chipGrid, { gap: px(8) }]}>
              {NAME_CHIPS.map((chip) => {
                const chosen = name.trim() === chip;
                return (
                  <Pressable
                    key={chip}
                    onPress={() => {
                      // Rule NEVER BLOCK: the tap both chooses and advances. A chip that only
                      // selected would leave a five-year-old hunting for a second control.
                      setName(chip);
                      setPanel('flag');
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: chosen }}
                    accessibilityLabel={`Captain ${chip}`}
                    style={({ pressed }) => [
                      s.chip,
                      {
                        height: px(CHIP_HEIGHT),
                        borderRadius: px(radius.card),
                        borderBottomWidth: px(4),
                        backgroundColor: chosen ? color.gold : color.white,
                        borderBottomColor: chosen ? color.goldDeep : color.parchmentEdge,
                      },
                      pressed && { transform: [{ translateY: px(3) }], borderBottomWidth: px(1) },
                    ]}
                  >
                    <Text style={[s.chipLabel, { fontSize: tx(19), lineHeight: tx(24) }]}>{chip}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/*
              "Type your own — for older captains and grown-ups."

              The board draws this row as an inert `div` with a drawn keyboard beside it. It ships as
              a real `TextInput`, because the app already has a working one and deleting a function
              to match a drawing is not fidelity. The board's row STYLING is adopted; its inertness
              is not. The board also draws the row 60pt tall, under the 64 floor — the ink stays as
              drawn and the field's own `minHeight` carries the target.
            */}
            <View
              style={[
                s.typeRow,
                { borderRadius: px(radius.cardInner), padding: px(8), gap: px(8) },
              ]}
            >
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Type your own"
                placeholderTextColor={color.inkDarkMuted}
                accessibilityLabel="Type your own captain name"
                maxLength={20}
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => setPanel('flag')}
                style={[
                  s.input,
                  {
                    fontSize: tx(19),
                    lineHeight: tx(26),
                    minHeight: px(MIN_TAP_TARGET),
                    borderRadius: px(radius.tile),
                    paddingHorizontal: px(12),
                  },
                ]}
              />
              <Text style={[s.typeHint, { fontSize: tx(11), lineHeight: tx(15) }]}>
                For older captains and grown-ups.
              </Text>
            </View>

            <View style={{ flex: 1, minHeight: px(8) }} />
          </>
        ) : (
          <>
            <View style={[s.flagHead, { gap: px(8) }]}>
              <Pressable
                onPress={() => setPanel('name')}
                accessibilityRole="button"
                accessibilityLabel="Back to the name"
                hitSlop={16}
                style={({ pressed }) => [s.back, { minHeight: px(32) }, pressed && { opacity: 0.6 }]}
              >
                <Text style={[s.backText, { fontSize: tx(15), lineHeight: tx(20) }]}>‹</Text>
              </Pressable>
              <Text style={[s.title, { fontSize: tx(23), lineHeight: tx(30) }]}>Pick your flag</Text>
            </View>

            <View style={[s.flagGrid, { gap: px(12) }]}>
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
                        borderRadius: px(radius.card),
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
                    {/* Shape and mark, not colour alone — see `FlagBadge`. */}
                    <FlagBadge flag={f} width={px(64)} />
                    {/* Labelled, because six swatches alone are unusable to a colour-blind child. */}
                    <Text style={[s.flagLabel, { fontSize: tx(11), lineHeight: tx(15) }]}>{f.label}</Text>

                    {chosen ? (
                      <View
                        style={[
                          s.tick,
                          { width: px(26), height: px(26), right: px(8), top: px(8) },
                        ]}
                      >
                        <Text style={[s.tickMark, { fontSize: tx(15), lineHeight: tx(19) }]}>✓</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <View style={{ flex: 1, minHeight: px(8) }} />
          </>
        )}
      </View>

      {/*
        BOTH panels's commit controls are PINNED here, outside the scrolling body, and that
        placement is load-bearing rather than stylistic.

        Six flag cards wrap to three rows and size themselves from their content, so on a tall phone
        the grid plus the title plus the pips can exceed the body's height. React Native does not
        clip an overflowing column by default — it just lets the children run past the bottom. That
        pushed "Set sail" and "Skip" underneath the coach bar and off the frame, and since tapping a
        flag only SELECTS, the screen became a dead end with no way forward at all.

        Clipping a flag card is recoverable; clipping the only exit is not. So the exit is pinned to
        the bottom of the screen with the coach bar, and the grid takes whatever is left.
      */}
      <View style={{ paddingBottom: insets.bottom }}>
        {panel === 'name' ? (
          <View style={{ paddingHorizontal: L.gutter, paddingBottom: px(8) }}>
            <Pressable
              onPress={() => setPanel('flag')}
              accessibilityRole="button"
              accessibilityLabel="Next, pick your flag"
              style={({ pressed }) => [
                s.primary,
                {
                  height: px(MIN_TAP_TARGET),
                  borderRadius: px(radius.card),
                  borderBottomWidth: px(4),
                },
                pressed && { transform: [{ translateY: px(3) }], borderBottomWidth: px(1) },
              ]}
            >
              <Text style={[s.primaryText, { fontSize: tx(20), lineHeight: tx(24) }]}>Next</Text>
            </Pressable>
          </View>
        ) : null}

        {panel === 'flag' ? (
          <View style={{ paddingHorizontal: L.gutter, paddingBottom: px(8), gap: px(4) }}>
            <Pressable
              onPress={() => commit(name, flag)}
              accessibilityRole="button"
              accessibilityLabel={editing ? 'Save' : 'Set sail'}
              style={({ pressed }) => [
                s.primary,
                { height: px(MIN_TAP_TARGET), borderRadius: px(radius.card), borderBottomWidth: px(4) },
                pressed && { transform: [{ translateY: px(3) }], borderBottomWidth: px(1) },
              ]}
            >
              <Text style={[s.primaryText, { fontSize: tx(20), lineHeight: tx(24) }]}>
                {editing ? 'Save' : 'Set sail'}
              </Text>
            </Pressable>

            {/*
              Skip commits too. A skip wired only to `router` would leave the captain unnamed and
              unflagged, and `flow.ts` would send them right back here — a button that does nothing.

              Hidden in edit mode: beside a name the captain already has, "choose for me" is a
              discard button wearing a helpful label.
            */}
            {editing ? null : (
              <Pressable
                onPress={() => commit(name, flag)}
                accessibilityRole="button"
                accessibilityLabel="Skip, choose for me"
                style={({ pressed }) => [
                  s.skip,
                  { minHeight: px(MIN_TAP_TARGET) },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Text style={[s.skipText, { fontSize: tx(13), lineHeight: tx(18) }]}>
                  Skip — choose for me
                </Text>
              </Pressable>
            )}
          </View>
        ) : null}

        <CoachBar coach={panel === 'name' ? NAME_COACH : FLAG_COACH} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.parchment },
  body: { flex: 1 },
  title: { fontFamily: type.display.fontFamily, color: color.inkDark },

  banner: {
    backgroundColor: color.gold,
    borderBottomColor: color.goldDeep,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerRank: { fontFamily: type.display.fontFamily, color: color.inkDark },
  bannerName: { fontFamily: type.display.fontFamily, color: color.inkDark },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    flexGrow: 1,
    flexBasis: '46%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLabel: { fontFamily: type.display.fontFamily, color: color.inkDark },

  typeRow: { backgroundColor: '#F0E2C8' },
  input: { fontFamily: type.display.fontFamily, color: color.inkDark, backgroundColor: color.parchment },
  typeHint: { fontFamily: type.body.fontFamily, color: color.inkDarkMuted },

  flagHead: { flexDirection: 'row', alignItems: 'center' },
  back: { justifyContent: 'center' },
  backText: { fontFamily: type.display.fontFamily, color: color.inkDarkMuted },
  flagGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  flagCard: {
    flexGrow: 1,
    flexBasis: '44%',
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagLabel: { fontFamily: type.chip.fontFamily, color: color.inkDarkMuted },
  tick: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: color.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Ink on `success`, measured 6.05 — white on it is the board's own banned pair at 2.63. */
  tickMark: { fontFamily: type.body.fontFamily, color: color.inkDark },

  primary: {
    alignSelf: 'stretch',
    backgroundColor: color.amber,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomColor: color.goldDeep,
  },
  primaryText: { fontFamily: type.display.fontFamily, color: color.inkDark },
  skip: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  skipText: { fontFamily: type.body.fontFamily, color: color.inkDarkMuted },
});
