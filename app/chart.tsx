import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { chartNodes, requirementText, type ChartNode } from '../src/services/chart';
import { useCaptain } from '../src/stores/useCaptain';
import { useLayout } from '../src/theme/useLayout';
import { color, radius, space, type } from '../src/theme/tokens';

/**
 * The sea chart — the hub.
 *
 * Every path runs through here: onboarding ends on it, duels start and end on it, the gunnery
 * range hangs off an island node. Before this screen the app had a duel you could replay; a loop
 * needs somewhere to return to.
 *
 * All fog and ordering decisions come from `services/chart.ts`, which is exhaustively tested. This
 * file renders that decision and owns nothing else.
 *
 * Fidelity note: board 4f's exact geometry has not been transcribed yet — this is built from the
 * design system (tokens, `Poly`, the ship silhouette) rather than measured off the board. A-013's
 * fixture pass covers the duel screen today; the chart needs the same treatment before it can be
 * called pixel-accurate, and saying so is cheaper than implying otherwise.
 */
export default function Chart() {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const captain = useCaptain((s) => s.captain);
  const nodes = chartNodes(captain);

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={[s.header, { paddingHorizontal: L.gutter }]}>
        <View>
          <Text style={s.kicker}>THE SEA CHART</Text>
          <Text style={s.captainName}>{captain.name === '' ? 'Captain' : captain.name}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={s.purse}>
          <View style={s.coin} />
          <Text style={s.purseCount}>{captain.coins}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          s.list,
          { paddingHorizontal: L.gutter, paddingBottom: insets.bottom + space[4] },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {nodes.map((node) => (
          <IslandCard key={node.island.id} node={node} art={L.art} />
        ))}
      </ScrollView>
    </View>
  );
}

function IslandCard({ node, art }: { node: ChartNode; art: number }) {
  const { island, fogged, isCurrent } = node;
  const requirement = requirementText(node);

  return (
    <Pressable
      // A fogged island is still tappable — it has something to say. What it must not do is
      // navigate. Silence on tap reads as a broken button to a child.
      onPress={() => {
        if (!fogged) router.push('/duel');
      }}
      accessibilityRole="button"
      accessibilityState={{ disabled: fogged }}
      accessibilityLabel={fogged ? `${island.displayName}, locked. ${requirement ?? ''}` : island.displayName}
      style={({ pressed }) => [
        s.card,
        fogged && s.cardFogged,
        isCurrent && s.cardCurrent,
        pressed && !fogged && s.cardPressed,
      ]}
    >
      <View style={[s.islandMark, { width: 56 * art, height: 56 * art }]}>
        <Text style={[s.islandOrder, fogged && s.inkFogged]}>{island.order + 1}</Text>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.titleRow}>
          <Text style={[s.islandName, fogged && s.inkFogged]} numberOfLines={1}>
            {island.displayName}
          </Text>
          {isCurrent ? (
            <View style={s.hereChip}>
              <Text style={s.hereChipText}>YOU ARE HERE</Text>
            </View>
          ) : null}
        </View>

        {fogged ? (
          <Text style={s.requirement}>{requirement}</Text>
        ) : (
          <Text style={s.skills}>{island.rangeSkills.length} skills to master</Text>
        )}
      </View>

      <Text style={[s.chevron, fogged && s.inkFogged]}>{fogged ? '🔒' : '›'}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.deepSea },
  header: { flexDirection: 'row', alignItems: 'center', paddingVertical: space[3] },
  kicker: { ...type.eyebrow, color: color.amber },
  captainName: { ...type.title, color: color.parchment },
  purse: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceRaised,
  },
  coin: { width: 16, height: 16, borderRadius: 999, backgroundColor: color.amber },
  purseCount: { ...type.subtitle, color: color.parchment },

  list: { gap: space[2], paddingTop: space[1] },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: 84,
    padding: space[3],
    borderRadius: radius.card,
    backgroundColor: color.surfaceRaised,
    borderBottomWidth: 4,
    borderBottomColor: color.border,
  },
  // Fog dims, it does not hide. A five-island map rendering as one node tells a child the game is
  // one island long; the fog is the promise that there is more.
  cardFogged: { opacity: 0.55 },
  cardCurrent: { borderBottomColor: color.amber },
  cardPressed: { transform: [{ translateY: 3 }], borderBottomWidth: 1 },

  islandMark: {
    borderRadius: radius.cardInner,
    backgroundColor: color.sea,
    alignItems: 'center',
    justifyContent: 'center',
  },
  islandOrder: { ...type.display, fontSize: 24, lineHeight: 28, color: color.parchment },
  inkFogged: { color: color.inkSoft },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  islandName: { ...type.subtitle, color: color.parchment, flexShrink: 1 },
  hereChip: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
    backgroundColor: color.amber,
  },
  hereChipText: { ...type.chip, fontSize: 9, color: color.inkDark },
  requirement: { ...type.caption, color: color.inkSoft, marginTop: 3 },
  skills: { ...type.caption, color: color.inkMuted, marginTop: 3 },
  chevron: { ...type.title, color: color.inkMuted },
});
