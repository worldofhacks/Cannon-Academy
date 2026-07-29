import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { GradeBand } from '@content/schemas';

import { Poly } from '../src/components/Poly';
import { commitGradeBand } from '../src/services/onboarding';
import { captainStore, useCaptain } from '../src/stores/useCaptain';
import { useLayout } from '../src/theme/useLayout';
import { color, space, type } from '../src/theme/tokens';

/**
 * Board 1a — "Which ship is yours?", the ship-size ladder. The board's recommended shape, over
 * 1b (problem-first cards) and 1c (harbour lineup).
 *
 * It never says "grade". It shows a sum and a ship, and the ship gets bigger as the sum gets
 * harder — so a child picks by reading a problem they can actually read, and the grade band is
 * inferred from that choice rather than asked for. The three amber pips are the only difficulty
 * signal, and they are for the grown-up standing behind them.
 *
 * Every offset below is the board's own resolved value at 375pt, scaled by the real screen width.
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

  return (
    <View
      style={[
        s.screen,
        {
          paddingTop: insets.top + px(14),
          paddingBottom: insets.bottom + px(14),
          paddingHorizontal: L.gutter,
        },
      ]}
    >
      <Text style={[s.title, { fontSize: tx(23), lineHeight: tx(26) }]}>Which ship is yours?</Text>

      {BANDS.map((b) => {
        const selected = chosen === b.band;
        return (
          <Pressable
            key={b.band}
            onPress={() => {
              // The commit writes the band through the store — which is what runs placement — and
              // hands back the flow resolver's answer. This screen navigates to what it is given;
              // it does not know, and must not decide, what comes after the picker.
              const destination = commitGradeBand(captainStore, b.band);
              router.replace(`/${destination}`);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${b.problem}, ${b.label}`}
            style={({ pressed }) => [
              s.card,
              {
                borderRadius: px(20),
                padding: px(12),
                gap: px(12),
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
              <Text style={[s.problem, { fontSize: tx(34), lineHeight: tx(34) }]}>{b.problem}</Text>
              <View style={[s.meta, { gap: px(6), marginTop: px(8) }]}>
                <View style={{ flexDirection: 'row', gap: px(3) }}>
                  {[0, 1, 2].map((i) => (
                    <View
                      key={i}
                      style={{
                        width: px(10),
                        height: px(10),
                        borderRadius: 999,
                        backgroundColor: i < b.pips ? color.amber : '#E8DCC4',
                      }}
                    />
                  ))}
                </View>
                <Text style={[s.bandLabel, { fontSize: tx(11), letterSpacing: tx(11) * 0.05 }]}>
                  {b.label}
                </Text>
              </View>
            </View>
          </Pressable>
        );
      })}

      {/* The board's note to the adult, not to the child. */}
      <Text style={[s.grownups, { fontSize: tx(12) }]}>Grown-ups: pick the hardest one they can read.</Text>
    </View>
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
  screen: { flex: 1, backgroundColor: color.parchment, gap: 10 },
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
  grownups: { ...type.caption, color: color.inkDarkMuted, textAlign: 'center', marginTop: space[1] },
});
