import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ResponsiveFrame } from '../src/components/ResponsiveFrame';
import { rankLadder, skillProgress } from '../src/services/rankView';
import { useCaptain } from '../src/stores/useCaptain';
import { color, font, MIN_TAP_TARGET, radius, space } from '../src/theme/tokens';
import { useLayout } from '../src/theme/useLayout';

/**
 * Rank ladder — the competitive frame PLAN.md describes.
 *
 * Tier comes from duel wins through `rankView.rankLadder`, never from a label stored on the
 * captain. Mastery meters beside it show every grade-eligible skill's progress toward the unlock
 * threshold that lifts fog and grants cannons.
 */
export default function RankScreen() {
  return (
    <ResponsiveFrame surface="reading">
      <RankBody />
    </ResponsiveFrame>
  );
}

function RankBody() {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const tx = L.t;
  const captain = useCaptain((s) => s.captain);
  const ladder = rankLadder(captain);
  const progress = skillProgress(captain);

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + tx(space[4]), paddingBottom: insets.bottom + tx(space[4]) },
      ]}
    >
      <View
        style={[
          styles.header,
          { paddingHorizontal: tx(space[5]), gap: tx(space[3]), marginBottom: tx(space[4]) },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => [
            styles.back,
            {
              minWidth: MIN_TAP_TARGET,
              minHeight: MIN_TAP_TARGET,
              borderRadius: tx(radius.card),
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={[styles.backLabel, { fontSize: tx(18) }]}>←</Text>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[styles.title, { fontSize: tx(19), lineHeight: tx(24) }]}>
            {captain.name === '' ? 'Captain' : captain.name}
          </Text>
          <Text style={[styles.subtitle, { fontSize: tx(10), letterSpacing: 0.8 }]}>RANK LADDER</Text>
        </View>
        <Text style={[styles.wins, { fontSize: tx(13) }]}>
          {captain.wins} win{captain.wins === 1 ? '' : 's'}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: tx(space[5]),
          paddingBottom: tx(space[7]),
          gap: tx(space[5]),
        }}
        showsVerticalScrollIndicator={false}
      >
        {ladder.nextRequirement !== null ? (
          <View style={[styles.card, { borderRadius: tx(radius.card), padding: tx(space[4]) }]}>
            <Text style={[styles.eyebrow, { fontSize: tx(10), marginBottom: tx(space[2]) }]}>NEXT RANK</Text>
            <Text style={[styles.nextText, { fontSize: tx(16), lineHeight: tx(21) }]}>
              {ladder.nextRequirement}
            </Text>
          </View>
        ) : null}

        <View
          style={[styles.card, { borderRadius: tx(radius.card), padding: tx(space[4]), gap: tx(space[3]) }]}
        >
          <Text style={[styles.eyebrow, { fontSize: tx(10) }]}>SEA CHART RANKS</Text>
          {ladder.rungs.map((rung) => (
            <View
              key={rung.rank.id}
              style={[
                styles.rung,
                {
                  borderRadius: tx(radius.cardInner),
                  paddingVertical: tx(space[3]),
                  paddingHorizontal: tx(space[4]),
                  backgroundColor: rung.isCurrent
                    ? color.gold
                    : rung.isAchieved
                      ? color.parchment
                      : color.surfaceRaised,
                  borderBottomWidth: tx(rung.isCurrent ? 4 : 2),
                  borderBottomColor: rung.isCurrent ? color.goldDeep : color.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.rungName,
                  {
                    fontSize: tx(16),
                    lineHeight: tx(21),
                    color: rung.isCurrent || rung.isAchieved ? color.inkDark : color.ink,
                  },
                ]}
              >
                {rung.rank.displayName}
              </Text>
              <Text
                style={[
                  styles.rungReq,
                  {
                    fontSize: tx(12),
                    color: rung.isCurrent || rung.isAchieved ? color.inkDarkMuted : color.inkMuted,
                  },
                ]}
              >
                {rung.rank.minWins === 0 ? 'Starting rank' : `${rung.rank.minWins} wins`}
              </Text>
            </View>
          ))}
        </View>

        {progress.length > 0 ? (
          <View
            style={[styles.card, { borderRadius: tx(radius.card), padding: tx(space[4]), gap: tx(space[4]) }]}
          >
            <Text style={[styles.eyebrow, { fontSize: tx(10) }]}>SKILL MASTERY</Text>
            {progress.map((row) => (
              <View key={row.skillId} style={{ gap: tx(space[2]) }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: tx(space[3]),
                  }}
                >
                  <Text
                    numberOfLines={2}
                    style={[styles.skillName, { flex: 1, fontSize: tx(13), lineHeight: tx(21) }]}
                  >
                    {row.displayName}
                  </Text>
                  <Text style={[styles.skillPct, { fontSize: tx(12) }]}>
                    {row.mastered ? 'Mastered' : `${row.meterPercent}%`}
                  </Text>
                </View>
                <View style={[styles.track, { height: tx(10), borderRadius: tx(radius.nub) }]}>
                  <View
                    style={{
                      width: `${row.meterPercent}%`,
                      height: '100%',
                      borderRadius: tx(radius.nub),
                      backgroundColor: row.mastered ? color.success : color.gold,
                    }}
                  />
                </View>
                <Text style={[styles.threshold, { fontSize: tx(12) }]}>
                  {row.weightedCorrect} / {row.thresholdCorrect} weighted correct
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.deepSea,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  back: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surfaceRaised,
  },
  backLabel: {
    color: color.ink,
    fontFamily: font.bodySemi,
  },
  title: {
    color: color.ink,
    fontFamily: font.displayBold,
  },
  subtitle: {
    color: color.inkSoft,
    fontFamily: font.bodyBold,
    textTransform: 'uppercase',
  },
  wins: {
    color: color.gold,
    fontFamily: font.bodyBold,
  },
  card: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  eyebrow: {
    color: color.inkSoft,
    fontFamily: font.bodyBold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  nextText: {
    color: color.ink,
    fontFamily: font.bodySemi,
  },
  rung: {
    gap: 2,
  },
  rungName: {
    fontFamily: font.displayBold,
  },
  rungReq: {
    fontFamily: font.bodyMedium,
  },
  skillName: {
    color: color.ink,
    fontFamily: font.bodyMedium,
  },
  skillPct: {
    color: color.gold,
    fontFamily: font.bodyBold,
  },
  track: {
    backgroundColor: color.borderStrong,
    overflow: 'hidden',
  },
  threshold: {
    color: color.inkSoft,
    fontFamily: font.bodyMedium,
  },
});
