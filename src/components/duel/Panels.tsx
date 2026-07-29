/**
 * Every non-interactive beat of the duel: the shot in the air, the rival's turn, the resolve
 * banner, the Perfect Shot, and the two endings.
 *
 * The resolve banner carries the game's whole pedagogy in four sentences. A wrong tap is
 * "Splash — short of the mark. No harm done." and then it *shows the correct answer*. A burned
 * fuse is "Damp powder. Nothing lost." A loss is "Good shooting, Captain" with the hull already
 * patched. None of these is softness for its own sake: a child who believes being wrong costs
 * them something stops guessing, and a child who stops guessing stops practising.
 */
import { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { ChestReceipt } from '../../contracts/rewards';
import type { VictoryRewardProjection } from '../../services/victoryRewards';
import { chestRarityLook, projectChestCeremony } from '../../theme/chestRarity';
import { sprite } from '../../theme/sprites';
import { color, radius, space, type } from '../../theme/tokens';

export { projectChestCeremony } from '../../theme/chestRarity';
export type { ChestCeremonyProjection } from '../../theme/chestRarity';

// ── Waiting beats ────────────────────────────────────────────────────────────────────────────

/** The rival's turn. Deliberately has no buttons, and says so. */
export function WatchPanel() {
  return (
    <View style={[s.wrap, { backgroundColor: '#EFE6F7' }]}>
      <View style={s.rivalBanner}>
        <View style={s.rivalIcon}>
          {/* U+FE0E — see Hud.tsx. White-on-purple depends on `color` surviving. */}
          <Text style={s.rivalIconText}>◀︎</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.bannerTitleLight}>The rival is firing</Text>
          <Text style={s.bannerBodyLight}>Hands off the wheel — just watch.</Text>
        </View>
      </View>
      <View style={s.dashedBox}>
        <Dots colors={['#6C4BD6', '#8A6FE0', '#C3B2E8']} />
        <Text style={s.dashedNote}>No buttons here on purpose.</Text>
      </View>
    </View>
  );
}

/** The player's shot is in the air. */
export function FlyingPanel({ glyph, spectacle }: { glyph: string; spectacle: string | null }) {
  const line =
    spectacle === null
      ? 'Shot away — watch it land'
      : `${spectacle.charAt(0)}${spectacle.slice(1).toLowerCase()} away — watch it land`;
  return (
    <View style={s.wrap}>
      <View style={[s.banner, { backgroundColor: color.inkDark }]}>
        <View style={[s.bannerIcon, { backgroundColor: color.amber }]}>
          <Text style={[s.bannerIconText, { color: color.inkDark }]}>{glyph}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.bannerTitleLight}>Fire in the hole!</Text>
          <Text style={[s.bannerBodyLight, { color: color.inkMuted }]}>{line}</Text>
        </View>
      </View>
      <View style={s.sandBox}>
        <Dots colors={[color.amber, color.amber, color.amber]} />
      </View>
    </View>
  );
}

// ── Resolve ──────────────────────────────────────────────────────────────────────────────────

export interface ResolveCopy {
  readonly background: string;
  readonly icon: string;
  readonly title: string;
  readonly body: string;
  readonly hint: string;
}

export function ResolvePanel({
  copy,
  correction,
}: {
  copy: ResolveCopy;
  /** The question with its answer filled in. Shown after a wrong tap or a burned fuse. */
  correction: string | null;
}) {
  return (
    <View style={s.wrap}>
      <View style={[s.banner, { backgroundColor: copy.background }]}>
        <View style={[s.bannerIcon, { backgroundColor: 'rgba(255,255,255,0.28)' }]}>
          <Text style={s.bannerIconText}>{copy.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.bannerTitleLight}>{copy.title}</Text>
          <Text style={s.bannerBodyLight}>{copy.body}</Text>
        </View>
      </View>

      {correction !== null ? (
        <View style={s.correction}>
          <View style={s.correctionTick}>
            <Text style={s.correctionTickText}>✓</Text>
          </View>
          <Text style={s.correctionText}>{correction}</Text>
        </View>
      ) : null}

      <View style={s.hintBox}>
        <Image source={sprite.cannon} style={{ width: 40, height: 40 }} resizeMode="contain" />
        <Text style={s.hintText}>{copy.hint}</Text>
      </View>
    </View>
  );
}

// ── Perfect Shot ─────────────────────────────────────────────────────────────────────────────

/**
 * Board 3b, and the ruling that shaped it. The chip says PERFECT — it does not say "+1 ball",
 * because per T-031 the reward IS the damage curve the fast answer already earned. One spark,
 * one star, 450ms, in place. Two balls would imply a summing that only Double-Shot does.
 */
export function PerfectShotPanel() {
  const star = useSharedValue(0);
  const spark = useSharedValue(0);
  useEffect(() => {
    star.value = withTiming(1, {
      duration: 380,
      easing: Easing.bezier(0.2, 1.4, 0.4, 1),
    });
    spark.value = withTiming(1, { duration: 620, easing: Easing.out(Easing.quad) });
  }, [star, spark]);

  const starStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, star.value * 2.5),
    transform: [{ scale: 0.2 + 1.05 * star.value }, { rotate: `${-30 + 30 * star.value}deg` }],
  }));
  const sparkStyle = useAnimatedStyle(() => ({
    opacity: 0.9 * (1 - spark.value),
    transform: [{ scale: 0.4 + 1.9 * spark.value }],
  }));

  return (
    <View style={[s.wrap, s.perfect]}>
      <Animated.View style={[s.spark, sparkStyle]} />
      <Animated.View style={[s.star, starStyle]}>
        <Text style={s.starGlyph}>★</Text>
      </Animated.View>
      <Rise delay={90}>
        <Text style={s.perfectTitle}>PERFECT SHOT</Text>
      </Rise>
      <Rise delay={160}>
        <Text style={s.perfectSub}>Fast powder, true shot ★</Text>
      </Rise>
    </View>
  );
}

// ── Endings ──────────────────────────────────────────────────────────────────────────────────

interface VictoryProps {
  readonly right: number;
  readonly asked: number;
  readonly perfects: number;
  readonly rewards: VictoryRewardProjection;
  readonly chestReceipt?: ChestReceipt | null;
  readonly chestOpen: boolean;
  readonly onOpenChest: () => void;
  readonly onLeave: () => void;
}

export function VictoryPanel({
  right,
  asked,
  perfects,
  rewards,
  chestReceipt = null,
  chestOpen,
  onOpenChest,
  onLeave,
}: VictoryProps) {
  const receipt = chestReceipt;
  const ceremony =
    chestOpen && receipt !== null ? projectChestCeremony(receipt, rewards) : null;

  return (
    <View style={s.wrap}>
      <View style={s.endHead}>
        <View style={[s.endIcon, { backgroundColor: color.success }]}>
          <Text style={s.endIconText}>✓</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.endTitle}>The sea is yours</Text>
          <Text style={s.endSub}>
            {right} of {Math.max(1, asked)} right · {perfects} perfect
          </Text>
        </View>
      </View>

      <Pressable onPress={onOpenChest} disabled={chestOpen} style={s.chestBox}>
        {ceremony !== null && receipt !== null ? (
          <View style={s.chestReveal}>
            <View
              style={[
                s.rarityBadge,
                {
                  backgroundColor: chestRarityLook[receipt.rarity].fill,
                  borderColor: chestRarityLook[receipt.rarity].border,
                },
              ]}
            >
              <Text
                style={[
                  s.rarityLabel,
                  { color: chestRarityLook[receipt.rarity].label },
                ]}
              >
                {ceremony.label}
              </Text>
            </View>
            {ceremony.grant.kind === 'cannon' ? (
              <View style={s.rewardCard}>
                <View style={s.rewardIcon}>
                  <Image
                    source={sprite.cannonMobile}
                    style={{ width: 40, height: 40 }}
                    resizeMode="contain"
                  />
                </View>
                <Text style={s.rewardName}>{ceremony.grant.displayName}</Text>
                <Text style={s.rewardTag}>NEW CANNON</Text>
              </View>
            ) : null}
            {ceremony.grant.kind === 'coins' ? (
              <View style={s.coinRow}>
                <View style={s.coin} />
                <Text style={s.coinCount}>+{ceremony.grant.amount}</Text>
              </View>
            ) : null}
            {ceremony.purseCoins > 0 ? (
              <View style={s.coinRow}>
                <View style={s.coin} />
                <Text style={s.purseCoinCount}>+{ceremony.purseCoins} from the duel</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <>
            <Chest />
            <Text style={s.chestPrompt}>Tap to open</Text>
          </>
        )}
      </Pressable>

      <Pressable onPress={onLeave} style={({ pressed }) => [s.primaryButton, pressed && s.buttonPressed]}>
        <Text style={s.primaryButtonText}>Back to the chart</Text>
      </Pressable>
    </View>
  );
}

interface DefeatProps {
  readonly right: number;
  readonly asked: number;
  readonly perfects: number;
  readonly coins: number;
  readonly onAgain: () => void;
  readonly onLeave: () => void;
}

export function DefeatPanel({ right, asked, perfects, coins, onAgain, onLeave }: DefeatProps) {
  return (
    <View style={s.wrap}>
      <View style={s.endHead}>
        <View style={[s.endIcon, { backgroundColor: color.sea }]}>
          <Text style={s.endIconText}>★</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.endTitle}>Good shooting, Captain</Text>
          <Text style={s.endSub}>Your hull is patched and ready.</Text>
        </View>
      </View>

      <View style={s.statRow}>
        <Stat value={`${right}/${asked}`} label="RIGHT ANSWERS" tone={color.success} />
        <Stat value={String(perfects)} label="PERFECT SHOTS" tone={color.goldDeep} />
        <Stat value={String(coins)} label="COINS KEPT" tone={color.inkDark} />
      </View>

      <View style={s.hintBox}>
        <View style={s.plankIcon}>
          <Image source={sprite.wood} style={{ width: 38, height: 38 }} resizeMode="contain" />
        </View>
        <Text style={s.hintText}>
          Rank untouched. Nothing lost. The crew is already hammering new planks on.
        </Text>
      </View>

      <View style={s.endButtons}>
        <Pressable
          onPress={onAgain}
          style={({ pressed }) => [s.primaryButton, { flex: 2 }, pressed && s.buttonPressed]}
        >
          <Text style={s.primaryButtonText}>Sail again</Text>
        </Pressable>
        <Pressable
          onPress={onLeave}
          style={({ pressed }) => [s.secondaryButton, { flex: 1 }, pressed && s.buttonPressed]}
        >
          <Text style={s.secondaryButtonText}>Chart</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Small shared pieces ──────────────────────────────────────────────────────────────────────

function Stat({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statValue, { color: tone }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function Dots({ colors }: { colors: readonly string[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: space[2] }}>
      {colors.map((c, i) => (
        <Dot key={i} color={c} delay={i * 130} />
      ))}
    </View>
  );
}

function Dot({ color: c, delay }: { color: string; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(1, { duration: 350 }), withTiming(0, { duration: 350 })), -1),
    );
  }, [t, delay]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.14 * t.value }] }));
  return (
    <Animated.View style={[{ width: 14, height: 14, borderRadius: 999, backgroundColor: c }, animated]} />
  );
}

function Chest() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withSequence(withTiming(1, { duration: 450 }), withTiming(-1, { duration: 450 })),
      -1,
      true,
    );
  }, [t]);
  const animated = useAnimatedStyle(() => ({
    transform: [{ rotate: `${5 * t.value}deg` }, { translateY: -3 * Math.abs(t.value) }],
  }));
  return (
    <Animated.View style={[s.chest, animated]}>
      <View style={s.chestBand} />
      <View style={s.chestLock} />
    </Animated.View>
  );
}

function Rise({ delay, children }: { delay: number; children: React.ReactNode }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) }));
  }, [t, delay]);
  const animated = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: 14 * (1 - t.value) }],
  }));
  return <Animated.View style={animated}>{children}</Animated.View>;
}

const s = StyleSheet.create({
  wrap: { flex: 1, padding: space[4], gap: 10 },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: space[3],
    borderRadius: radius.card,
  },
  rivalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: space[3],
    borderRadius: radius.card,
    backgroundColor: '#6C4BD6',
  },
  rivalIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.cardInner,
    backgroundColor: color.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rivalIconText: { color: color.white, fontSize: 22, fontWeight: '800' },
  bannerIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.cardInner,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerIconText: { ...type.title, color: color.white },
  bannerTitleLight: { ...type.title, color: color.white },
  bannerBodyLight: { ...type.caption, color: 'rgba(255,255,255,0.92)' },

  dashedBox: {
    flex: 1,
    borderRadius: radius.card,
    borderWidth: 3,
    borderStyle: 'dashed',
    borderColor: '#C3B2E8',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  dashedNote: { ...type.body, color: '#5A4A7A' },
  sandBox: {
    flex: 1,
    borderRadius: radius.card,
    backgroundColor: '#F0E2C8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  correction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: space[3],
    borderRadius: radius.cardInner,
    backgroundColor: color.white,
    borderBottomWidth: 3,
    borderBottomColor: color.parchmentEdge,
  },
  correctionTick: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: color.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  correctionTickText: { color: color.white, fontSize: 20, fontWeight: '800' },
  correctionText: { ...type.display, fontSize: 24, lineHeight: 30, color: color.inkDark },

  hintBox: {
    flex: 1,
    borderRadius: radius.card,
    backgroundColor: '#F0E2C8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
    padding: space[3],
  },
  hintText: { ...type.body, color: color.inkDarkMuted, maxWidth: 190 },
  plankIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.cardInner,
    backgroundColor: color.parchment,
    alignItems: 'center',
    justifyContent: 'center',
  },

  perfect: { backgroundColor: color.gold, alignItems: 'center', justifyContent: 'center', gap: 6 },
  spark: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  star: { alignItems: 'center', justifyContent: 'center' },
  starGlyph: { fontSize: 78, lineHeight: 86, color: color.inkDark },
  perfectTitle: { ...type.display, fontSize: 34, lineHeight: 40, color: color.inkDark },
  perfectSub: { ...type.chip, fontSize: 15, color: color.goldDeepest },

  endHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  endIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.cardInner,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endIconText: { color: color.white, fontSize: 24, fontWeight: '800' },
  endTitle: { ...type.display, fontSize: 24, lineHeight: 28, color: color.inkDark },
  endSub: { ...type.body, color: color.inkDarkMuted },

  chestBox: {
    flex: 1,
    minHeight: 64,
    borderRadius: radius.panel,
    backgroundColor: '#F0E2C8',
    borderWidth: 3,
    borderColor: color.parchmentEdge,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
  },
  chest: {
    width: 104,
    height: 76,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: color.woodLight,
    borderBottomWidth: 12,
    borderBottomColor: color.woodDeep,
  },
  chestBand: { position: 'absolute', left: 0, right: 0, top: 24, height: 12, backgroundColor: color.amber },
  chestLock: {
    position: 'absolute',
    left: 44,
    top: 28,
    width: 16,
    height: 20,
    borderRadius: 4,
    backgroundColor: color.goldDeep,
  },
  chestPrompt: { ...type.title, color: color.inkDark },
  chestReveal: { alignItems: 'center', gap: space[2] },
  rarityBadge: {
    paddingVertical: 6,
    paddingHorizontal: space[3],
    borderRadius: radius.pill,
    borderWidth: 2,
  },
  rarityLabel: { ...type.chip, fontSize: 11, letterSpacing: 1 },
  purseCoinCount: { ...type.body, color: color.inkDarkMuted },
  rewardCard: {
    width: 150,
    padding: space[3],
    borderRadius: radius.card,
    backgroundColor: color.white,
    alignItems: 'center',
    gap: 6,
    borderBottomWidth: 4,
    borderBottomColor: color.parchmentEdge,
  },
  rewardIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.cardInner,
    backgroundColor: '#F0E2C8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardName: { ...type.subtitle, color: color.inkDark },
  rewardTag: { ...type.chip, color: color.goldDeep },
  coinRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coin: { width: 22, height: 22, borderRadius: 999, backgroundColor: color.amber },
  coinCount: { ...type.display, fontSize: 20, lineHeight: 24, color: color.inkDark },

  statRow: { flexDirection: 'row', gap: space[2] },
  stat: {
    flex: 1,
    padding: 10,
    borderRadius: radius.cardInner,
    backgroundColor: color.white,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: color.parchmentEdge,
  },
  statValue: { ...type.display, fontSize: 26, lineHeight: 30 },
  statLabel: { ...type.chip, color: color.inkDarkMuted },

  endButtons: { flexDirection: 'row', gap: 10 },
  primaryButton: {
    height: 64,
    borderRadius: radius.card,
    backgroundColor: color.amber,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 4,
    borderBottomColor: color.goldDeep,
  },
  primaryButtonText: { ...type.display, fontSize: 20, lineHeight: 24, color: color.inkDark },
  secondaryButton: {
    height: 64,
    borderRadius: radius.card,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 4,
    borderBottomColor: color.parchmentEdge,
  },
  secondaryButtonText: { ...type.subtitle, color: color.inkDark },
  buttonPressed: { transform: [{ translateY: 3 }], borderBottomWidth: 1 },
});
