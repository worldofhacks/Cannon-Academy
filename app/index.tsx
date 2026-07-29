import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cannons } from '@content/index';
import { resolveShot } from '@engine/duel/damage';
import { computeCoinPayout } from '@engine/economy';
import { resolvePlacement } from '@engine/placement';
import { rankTierForWins } from '@engine/ranks';
import { createRng } from '@engine/rng';
import { color, radius, space, type } from '../src/theme/tokens';

/**
 * Shell verification screen — NOT the duel screen.
 *
 * Its only job is to prove the pure-TS engine runs unchanged inside React Native: same seeded
 * PRNG, same damage curve, same payout maths. If this renders correct numbers on a device, the
 * 1,229 engine tests mean something in the app rather than only in Node.
 *
 * Replaced by the real duel screen once T-013/T-020 land the state machine.
 */
export default function ShellCheck() {
  const insets = useSafeAreaInsets();

  const probe = useMemo(() => {
    const placement = resolvePlacement('k_1');
    const swivel = cannons.find((c) => c.id === 'swivel_gun');
    if (!swivel) throw new Error('swivel_gun missing from the catalog');

    // One fast answer and one slow-but-correct answer, from the same seed, so the
    // speed-aims-the-shot curve is visible rather than asserted.
    const [fast] = resolveShot({
      cannon: swivel,
      correct: true,
      elapsedMs: Math.round(swivel.timerMs * 0.1),
      rng: createRng(2026),
    });
    const [slow] = resolveShot({
      cannon: swivel,
      correct: true,
      elapsedMs: swivel.timerMs,
      rng: createRng(2026),
    });

    return {
      ownedCannons: placement.unlockedCannons.length,
      ownedIslands: placement.unlockedIslands.length,
      fast,
      slow,
      winCoins: computeCoinPayout({
        won: true,
        totalAnswers: 6,
        correctAnswers: 6,
        perfectShots: 4,
      }),
      lossCoins: computeCoinPayout({
        won: false,
        totalAnswers: 6,
        correctAnswers: 0,
        perfectShots: 0,
      }),
      tierAt10: rankTierForWins(10),
    };
  }, []);

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={[
        s.content,
        { paddingTop: insets.top + space[5], paddingBottom: insets.bottom + space[5] },
      ]}
    >
      <Text style={s.kicker}>Cannon Academy</Text>
      <Text style={s.title}>Engine is live in React Native</Text>
      <Text style={s.body}>
        Every number below came from the same pure-TypeScript engine the 1,229 tests cover — no
        reimplementation, no mock.
      </Text>

      <Row label="K-1 placement" value={`${probe.ownedCannons} cannons · ${probe.ownedIslands} island`} />
      <Row label="Rank at 10 wins" value={`tier ${probe.tierAt10}`} />
      <Row label="Win purse (6/6, 4 perfect)" value={`${probe.winCoins} coins`} />
      <Row label="Loss purse (0/6)" value={`${probe.lossCoins} coins — never zero`} />

      <Text style={s.section}>Swivel Gun, same seed, two answer speeds</Text>
      <Shot label="Fast (10% of timer)" outcome={probe.fast} />
      <Shot label="Slow but correct (100%)" outcome={probe.slow} />
      <Text style={s.foot}>
        The gap is the mechanic: answering faster aims the shot. The floor is why the slow answer still lands
        a respectable volley instead of punishing a child for thinking.
      </Text>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  );
}

function Shot({ label, outcome }: { label: string; outcome: { kind: string } }) {
  const o = outcome as { kind: string; damageToEnemy?: number; perfectShot?: boolean };
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>
        {o.damageToEnemy ?? '—'} dmg{o.perfectShot ? '  ★ perfect' : ''}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: space[5], gap: space[2] },
  kicker: { ...type.label, color: color.accent, letterSpacing: 1.5, textTransform: 'uppercase' },
  title: { ...type.display, color: color.ink, marginBottom: space[2] },
  body: { ...type.body, color: color.inkMuted, marginBottom: space[4], lineHeight: 22 },
  section: { ...type.title, color: color.ink, marginTop: space[5], marginBottom: space[2] },
  row: {
    backgroundColor: color.surfaceRaised,
    borderRadius: radius.md,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space[3],
  },
  label: { ...type.body, color: color.inkMuted, flexShrink: 1 },
  value: { ...type.body, color: color.ink, fontVariant: ['tabular-nums'] },
  foot: { ...type.label, color: color.inkMuted, marginTop: space[4], lineHeight: 19 },
});
