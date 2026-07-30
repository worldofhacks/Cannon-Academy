import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { GradeBand } from '@content/schemas';

import { CoachBar } from '../src/components/onboarding/CoachBar';
import { SetupProgress } from '../src/components/onboarding/SetupProgress';
import { CAREGIVER_NOTE, GRADE_COACH, TOUR_SKIP } from '../src/components/onboarding/script';
import { Poly } from '../src/components/Poly';
import { ResponsiveFrame } from '../src/components/ResponsiveFrame';
import { commitGradeBand, commitTourSkip } from '../src/services/onboarding';
import { captainStore, useCaptain } from '../src/stores/useCaptain';
import { useLayout } from '../src/theme/useLayout';
import { color, radius, type, MIN_TAP_TARGET } from '../src/theme/tokens';

/**
 * The board's unfilled pip.
 *
 * TODO(tokens): four hexes the onboarding rebuild needs are still literals, because `tokens.ts`
 * belongs to another agent this wave. None is new to the app — each was already inlined somewhere
 * — but the rebuild multiplies the call sites, so they want names next time that file is open:
 *
 *   #E8DCC4  parchmentSunkEdge  — unfilled pip / unfilled difficulty dot (here, `SetupProgress`)
 *   #F0E2C8  parchmentSunk      — the recessed block inside a parchment card (here, `name-flag`,
 *                                 `guided-duel`, and four pre-existing sites in `Panels.tsx`)
 *   #C9AE7E  parchmentShadow    — the 3pt bottom edge under a parchment tile (`ChartWalkthrough`)
 *   #6C4BD6  rival              — the rival's purple, already inlined in `Panels`/`guided-duel`
 */
const PENDING_PIP = '#E8DCC4';

/**
 * The grown-up skip's ink box, and the slop that carries it to the 64pt floor.
 *
 * `40 + 12 + 12 = 64`. The ink is deliberately small — two quiet lines inside the caregiver block —
 * and unscaled, because this is chrome addressed to an adult rather than composition that has to
 * stay in proportion with the ships. Every point of the slop lands inside the caregiver card, where
 * nothing else is listening, so the whole target is real.
 */
const SKIP_INK_HEIGHT = 40;
const SKIP_SLOP = Math.round((MIN_TAP_TARGET - SKIP_INK_HEIGHT) / 2);

/**
 * Beat 2 of the onboarding board — "Which ship is yours?", the ship-size ladder.
 *
 * It never says "grade". It shows a sum and a ship, and the ship gets bigger as the sum gets
 * harder — so a child picks by reading a problem they can actually read, and the grade band is
 * inferred from that choice rather than asked for. The three amber pips are the only difficulty
 * signal, and they are for the grown-up standing behind them.
 *
 * Every offset below is the board's own resolved value at 375pt, scaled by the real screen width.
 *
 * ## Where this departs from the onboarding board, and why
 *
 * **The card copy stays `3 + 4` / `K–1`, not the board's `2 + 1` / `LITTLE`.** `launch-picker.test`
 * `spec(A-042:AC-5)` binds all six strings by exact literal and then binds each to the very `Text`
 * node that renders it, with its one-line fitting contract. Renaming the bands is a product change
 * that belongs in that ticket, not smuggled in behind a restyle — and `K–1` is also the label the
 * gun deck, the range and `maxGradeForBand` all speak.
 *
 * **The caregiver line is not the board's.** See `CAREGIVER_NOTE` for the measurement; the short
 * version is that the board promises the band moves on its own and our band is a fixed ceiling.
 */

interface Band {
  readonly band: GradeBand;
  readonly problem: string;
  readonly label: string;
  readonly pips: number;
  /** The board's ship widths — 80 / 100 / 124. The ladder IS the affordance. */
  readonly shipWidth: number;
  readonly shipHeight: number;
  readonly mastHeight: number;
}

const BANDS: readonly Band[] = [
  { band: 'k_1', problem: '3 + 4', label: 'K–1', pips: 1, shipWidth: 80, shipHeight: 62, mastHeight: 30 },
  {
    band: 'g2_3',
    problem: '14 − 6',
    label: 'GRADE 2–3',
    pips: 2,
    shipWidth: 100,
    shipHeight: 78,
    mastHeight: 38,
  },
  {
    band: 'g4_5',
    problem: '12 × 7',
    label: 'GRADE 4–5',
    pips: 3,
    shipWidth: 124,
    shipHeight: 96,
    mastHeight: 46,
  },
];

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const px = L.a;
  const tx = L.t;

  // Read from the store, not held here. A band in component state dies with the component, so
  // nothing is ever placed and nothing is ever persisted — that was the defect this ticket closes.
  const chosen = useCaptain((s) => s.captain.gradeBand);
  // Also from the store, for the same reason: the skip's acknowledgement has to survive the
  // resolver replacing this screen with itself (see the skip row below).
  const tourSkipped = useCaptain((s) => s.captain.hasFoughtGuidedDuel);

  return (
    <ResponsiveFrame surface="reading">
      <View style={[s.screen, { paddingTop: insets.top + px(8) }]}>
        {/* Board: the pips sit above the parchment card stack, on this beat and the next two. */}
        <View style={{ paddingHorizontal: L.gutter, paddingBottom: px(8) }}>
          <SetupProgress step="grade" scale={px} />
        </View>

        <View style={[s.body, { paddingHorizontal: L.gutter, gap: px(8) }]}>
          <Text style={[s.title, { fontSize: tx(23), lineHeight: tx(30) }]}>Which ship is yours?</Text>

          {BANDS.map((b) => {
            const selected = chosen === b.band;
            return (
              <Pressable
                key={b.band}
                onPress={() => {
                  // The commit writes the band through the store — which is what runs placement —
                  // and hands back the flow resolver's answer. This screen navigates to what it is
                  // given; it does not know, and must not decide, what comes after the picker.
                  const destination = commitGradeBand(captainStore, b.band);
                  router.replace(`/${destination}`);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${b.problem}, ${b.label}`}
                style={({ pressed }) => [
                  s.card,
                  {
                    borderRadius: px(radius.card),
                    padding: px(12),
                    gap: px(12),
                    minHeight: px(MIN_TAP_TARGET),
                    borderBottomWidth: px(4),
                    borderBottomColor: selected ? color.amber : color.parchmentEdge,
                  },
                  pressed && { transform: [{ translateY: px(3) }], borderBottomWidth: px(1) },
                ]}
              >
                <View style={{ width: px(b.shipWidth), alignItems: 'center', justifyContent: 'flex-end' }}>
                  <LadderShip width={px(b.shipWidth)} height={px(b.shipHeight)} mast={px(b.mastHeight)} />
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    style={[s.problem, { fontSize: tx(34), lineHeight: tx(40) }]}
                  >
                    {b.problem}
                  </Text>
                  <View style={[s.meta, { gap: px(6), marginTop: px(8) }]}>
                    <View style={{ flexDirection: 'row', gap: px(3) }}>
                      {[0, 1, 2].map((i) => (
                        <View
                          key={i}
                          style={{
                            width: px(10),
                            height: px(10),
                            borderRadius: 999,
                            backgroundColor: i < b.pips ? color.amber : PENDING_PIP,
                          }}
                        />
                      ))}
                    </View>
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                      style={[
                        s.bandLabel,
                        { fontSize: tx(11), lineHeight: tx(15), letterSpacing: tx(11) * 0.05 },
                      ]}
                    >
                      {b.label}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}

          {/*
            The note to the adult, not to the child — and the one place the board deliberately
            breaks its own reading rule: 11pt prose a five-year-old cannot read, because it is not
            addressed to them. Kept at 12 rather than the board's 11 because grown-ups over forty
            are also users, and nothing else on this screen competes for the space.
          */}
          <View
            style={[
              s.caregiver,
              { borderRadius: px(radius.cardInner), padding: px(12), marginBottom: px(4) },
            ]}
          >
            <Text style={[s.grownups, { fontSize: tx(12), lineHeight: tx(18) }]}>{CAREGIVER_NOTE}</Text>

            {/*
              The board's ADULTS rule: *"from the grade picker only — a 10px 'skip the tour'
              affordance on that one screen."* The intent is adopted; the 10px is not, because a
              10pt target is a sixth of the floor this app is built on. The ink stays quiet inside
              the caregiver block — the one place on this screen already addressed to a grown-up —
              and `hitSlop` carries the target past 64.

              **It skips the tour, and it cannot skip the setup.** `commitTourSkip` writes the two
              tour latches and then asks `resolveDestination` where this captain belongs; with no
              band chosen the answer is this very screen, so the skip lands where it started and
              says so. That is the resolver refusing to let a skip outrun the band, not a dead
              control — the ship cards are still the way on, and after the skip they lead to the
              name screen and then straight to the chart.
            */}
            {tourSkipped ? (
              <Text
                style={[s.grownups, { fontSize: tx(12), lineHeight: tx(18), marginTop: px(8) }]}
              >
                {TOUR_SKIP.armed}
              </Text>
            ) : (
              <Pressable
                onPress={() => router.replace(`/${commitTourSkip(captainStore)}`)}
                accessibilityRole="button"
                accessibilityLabel={TOUR_SKIP.accessibilityLabel}
                hitSlop={SKIP_SLOP}
                style={({ pressed }) => [
                  s.skip,
                  { minHeight: SKIP_INK_HEIGHT, marginTop: px(8) },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Text style={[s.skipLabel, { fontSize: tx(12), lineHeight: tx(18) }]}>
                  {TOUR_SKIP.label}
                </Text>
                <Text style={[s.grownups, { fontSize: tx(11), lineHeight: tx(15) }]}>
                  {TOUR_SKIP.reason}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={{ paddingBottom: insets.bottom }}>
          <CoachBar coach={GRADE_COACH} />
        </View>
      </View>
    </ResponsiveFrame>
  );
}


/** The ladder ship. Same silhouette at all three sizes — only the scale carries the meaning. */
function LadderShip({ width, height, mast }: { width: number; height: number; mast: number }) {
  return (
    <View style={{ width, height }}>
      <View
        style={{
          position: 'absolute',
          left: '44%',
          bottom: '30%',
          width: width * 0.0625,
          height: mast,
          borderRadius: 3,
          backgroundColor: color.wood,
        }}
      />
      <Poly
        points="0,0 100,0 72,50 100,100 0,100"
        width={width * 0.2}
        height={height * 0.18}
        fill={color.amber}
        style={{ position: 'absolute', left: '48%', bottom: '58%' }}
      />
      <Poly
        points="100,0 100,100 0,90 0,10"
        width={width * 0.38}
        height={height * 0.34}
        fill="#F0E2C8"
        style={{ position: 'absolute', left: '8%', bottom: '40%' }}
      />
      <View
        style={{
          position: 'absolute',
          left: '6%',
          bottom: '34%',
          width: '88%',
          height: 5,
          borderRadius: 3,
          backgroundColor: color.deck,
        }}
      />
      <Poly
        points="0,0 100,0 88,100 10,100"
        width={width}
        height={height * 0.34}
        fill={color.woodLight}
        style={{ position: 'absolute', left: 0, bottom: 0 }}
      />
      <Poly
        points="0,0 100,0 88,100 10,100"
        width={width}
        height={height * 0.34 * 0.32}
        fill={color.woodDeep}
        style={{ position: 'absolute', left: 0, bottom: 0 }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.parchment },
  /** The card stack takes the slack; the pips and the coach bar are `flex: none` bands around it. */
  body: { flex: 1 },
  title: { fontFamily: type.display.fontFamily, color: color.inkDark },
  card: {
    flex: 1,
    backgroundColor: color.white,
    flexDirection: 'row',
    alignItems: 'center',
  },
  problem: { fontFamily: type.display.fontFamily, color: color.inkDark },
  meta: { flexDirection: 'row', alignItems: 'center' },
  bandLabel: { fontFamily: type.chip.fontFamily, color: color.inkDarkMuted },
  /** Board: the caregiver note sits in a sunken parchment block, not loose on the page. */
  caregiver: { backgroundColor: '#F0E2C8' },
  grownups: { ...type.caption, color: color.inkDarkMuted, textAlign: 'center' },
  skip: { alignItems: 'center', justifyContent: 'center' },
  /** `inkDark` on the sunken block, not `goldDeep` — the board's own banned pair on parchment. */
  skipLabel: { ...type.caption, color: color.inkDark, textAlign: 'center' },
});
