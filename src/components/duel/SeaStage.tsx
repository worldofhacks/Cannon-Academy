/**
 * The sea — the top 176pt of the duel screen, and the only part that is pure spectacle.
 *
 * Everything here is presentation under the T-031 ruling: no view in this file may read or alter a
 * damage number. It shows what the reducer already decided. That is why the shot arc takes
 * `damage` only to print it on a chip, and why the arc SHAPE comes from the cannon's look table
 * rather than from its damage band.
 */
import { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ARC_PEAK, type CannonLook } from '../../theme/cannonPresentation';
import { sprite } from '../../theme/sprites';
import { color, motion, radius, type } from '../../theme/tokens';
import type { DuelPhase } from '../../stores/duel';
import type { CaptainPose } from './Captain';
import { PLAYER_SHIP, RIVAL_SHIP, Ship } from './Ship';

/** RN 0.86 removed `StyleSheet.absoluteFillObject` from its types; this is the same thing. */
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

const STAGE_HEIGHT = 176;
const SEA_HEIGHT = 58;

interface SeaStageProps {
  readonly phase: DuelPhase;
  readonly captainPose: CaptainPose;
  readonly look: CannonLook;
  readonly playerHullPct: number;
  readonly rivalHullPct: number;
  readonly damageToRival: number | null;
  readonly damageToPlayer: number | null;
}

export function SeaStage({
  phase,
  captainPose,
  look,
  playerHullPct,
  rivalHullPct,
  damageToRival,
  damageToPlayer,
}: SeaStageProps) {
  const rivalTurn = phase === 'watch' || phase === 'rivalFly' || phase === 'rivalImpact';

  return (
    <View style={s.stage}>
      <View style={s.sky} />
      <View style={[s.cloud, { left: 32, top: 16, width: 58, height: 16, opacity: 0.85 }]} />
      <View style={[s.cloud, { left: 52, top: 8, width: 34, height: 14, opacity: 0.85 }]} />
      <View style={[s.cloud, { right: 26, top: 30, width: 44, height: 13, opacity: 0.7 }]} />
      <View style={s.sea} />

      <View style={s.playerSlot}>
        <Ship
          cosmetics={PLAYER_SHIP}
          facing="right"
          width={150}
          burning={playerHullPct <= 0.3}
          captainPose={captainPose}
        />
      </View>
      <View style={s.rivalSlot}>
        <Ship
          cosmetics={RIVAL_SHIP}
          facing="left"
          width={126}
          burning={rivalHullPct > 0 && rivalHullPct <= 0.3}
        />
      </View>

      {phase === 'fly' ? <Projectile look={look} /> : null}
      {phase === 'rivalFly' ? <IncomingShot /> : null}
      {phase === 'impact' ? <Impact look={look} /> : null}
      {phase === 'rivalImpact' ? (
        <Burst source={sprite.explosionMid} style={{ left: 34, bottom: 48, width: 82 }} />
      ) : null}
      {phase === 'miss' ? <Splash /> : null}
      {phase === 'timeout' ? <MisfirePuff /> : null}

      {damageToRival !== null ? <DamageChip value={damageToRival} side="right" /> : null}
      {damageToPlayer !== null ? <DamageChip value={damageToPlayer} side="left" /> : null}

      {rivalTurn ? (
        <>
          {/* A wash, not a curtain. The child must still see their own ship taking the hit. */}
          <View style={s.rivalWash} pointerEvents="none" />
          <View style={s.rivalArrow}>
            <Text style={s.rivalArrowText}>▼</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

/** The player's shot, arcing left to right. Arc height is the cannon's identity (board 5c). */
function Projectile({ look }: { look: CannonLook }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, {
      duration: motion.beat.shot,
      easing: Easing.bezier(0.4, 0.1, 0.7, 0.9),
    });
  }, [t]);

  const peak = ARC_PEAK[look.arc];
  const animated = useAnimatedStyle(() => ({
    // A parabola, not two linear legs: 4·t·(1−t) peaks at t=0.5 and lands flat, which is what
    // makes a lobbed Mortar read differently from a snapped Long Nine.
    transform: [
      { translateX: 208 * t.value },
      { translateY: -peak * 4 * t.value * (1 - t.value) + 6 * t.value },
      { scale: 0.7 + 0.3 * Math.min(1, t.value * 2) },
    ],
  }));

  return (
    <Animated.View style={[s.shotOrigin, animated]}>
      {look.projectile === 'chain' ? <ChainShot /> : null}
      {look.projectile === 'bolt' ? <Bolt /> : null}
      {look.projectile === 'fire' ? <FireBarrel /> : null}
      {look.projectile === 'tentacle' ? <KrakenBall /> : null}
      {(look.projectile === 'iron' || look.projectile === 'wobble') && (
        <Image source={sprite.cannonball} style={{ width: 24, height: 24 }} />
      )}
    </Animated.View>
  );
}

function ChainShot() {
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 340, easing: Easing.linear }), -1);
  }, [spin]);
  const animated = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  return (
    <Animated.View style={[{ width: 24, height: 24 }, animated]}>
      <View style={s.chainBar} />
      <View style={[s.chainBall, { left: -4 }]} />
      <View style={[s.chainBall, { right: -4 }]} />
    </Animated.View>
  );
}

function Bolt() {
  const flick = useSharedValue(1);
  useEffect(() => {
    flick.value = withRepeat(
      withSequence(withTiming(0.35, { duration: 110 }), withTiming(1, { duration: 110 })),
      -1,
    );
  }, [flick]);
  const animated = useAnimatedStyle(() => ({ opacity: flick.value }));
  return (
    <Animated.View style={[s.bolt, animated]}>
      <View style={s.boltCore} />
    </Animated.View>
  );
}

function FireBarrel() {
  return (
    <View style={{ width: 26, height: 30 }}>
      <View style={s.emberTrail} />
      <View style={s.barrel} />
      <Image
        source={sprite.fire}
        style={{ position: 'absolute', left: 4, top: -14, width: 20, height: 20 }}
      />
    </View>
  );
}

function KrakenBall() {
  return <View style={s.krakenBall} />;
}

/** The rival's shot, arcing right to left. */
function IncomingShot() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, {
      duration: motion.beat.shot,
      easing: Easing.bezier(0.4, 0.1, 0.7, 0.9),
    });
  }, [t]);
  const animated = useAnimatedStyle(() => ({
    transform: [
      { translateX: -208 * t.value },
      { translateY: -56 * 4 * t.value * (1 - t.value) + 6 * t.value },
    ],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', right: 104, bottom: 60 }, animated]}>
      <Image source={sprite.cannonball} style={{ width: 22, height: 22 }} />
    </Animated.View>
  );
}

/** Blast size tracks the shot's spectacle, not its damage. Board 5c. */
function Impact({ look }: { look: CannonLook }) {
  const big = look.projectile === 'bolt' || look.projectile === 'fire' || look.projectile === 'tentacle';
  const source = big
    ? sprite.explosionBig
    : look.projectile === 'chain'
      ? sprite.explosionMid
      : sprite.explosionSmall;
  return (
    <>
      <Burst source={source} style={{ right: 44, bottom: 52, width: big ? 74 : 48 }} />
      {look.projectile === 'bolt' ? <Flash /> : null}
    </>
  );
}

function Burst({
  source,
  style,
}: {
  source: number;
  style: { width: number; bottom: number; left?: number; right?: number };
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) });
  }, [t]);
  const animated = useAnimatedStyle(() => ({
    opacity: t.value < 0.3 ? t.value / 0.3 : 1 - (t.value - 0.3) / 0.7,
    transform: [{ scale: 0.3 + 1.2 * t.value }],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', ...style, height: style.width }, animated]}>
      <Image source={source} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
    </Animated.View>
  );
}

function Flash() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withSequence(withTiming(0.9, { duration: 40 }), withTiming(0, { duration: 220 }));
  }, [t]);
  const animated = useAnimatedStyle(() => ({ opacity: t.value }));
  return <Animated.View style={[FILL, { backgroundColor: '#FFF' }, animated]} />;
}

/**
 * A wrong answer splashes short of the rival. It is a MISS, not a punishment — the shot still
 * fires and still looks like a shot, because the alternative teaches a child that being wrong
 * means nothing happens.
 */
function Splash() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) });
  }, [t]);
  const animated = useAnimatedStyle(() => ({
    opacity: t.value < 0.4 ? t.value / 0.4 : 1 - (t.value - 0.4) / 0.6,
    transform: [{ translateY: 10 - 20 * Math.min(1, t.value / 0.4) }, { scaleY: 0.3 + 0.7 * t.value }],
  }));
  return <Animated.View style={[s.splash, animated]} />;
}

function MisfirePuff() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) });
  }, [t]);
  const animated = useAnimatedStyle(() => ({
    opacity: 0.75 * (1 - t.value),
    transform: [{ translateY: -26 * t.value }, { scale: 0.6 + 0.9 * t.value }],
  }));
  return <Animated.View style={[s.puff, animated]} />;
}

/**
 * The number the whole turn was for.
 *
 * It animates its OFFSET, never its opacity. A chip whose only source of visibility is an
 * animation is invisible whenever that animation does not run — and a damage number that
 * sometimes fails to appear is worse than one that never moves, because the volley silently
 * stops explaining itself.
 */
function DamageChip({ value, side }: { value: number; side: 'left' | 'right' }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) });
  }, [t]);
  const animated = useAnimatedStyle(() => ({ transform: [{ translateY: 14 * (1 - t.value) }] }));
  return (
    <Animated.View
      style={[
        s.damageChip,
        side === 'right'
          ? { right: 44, backgroundColor: color.inkDark }
          : { left: 44, backgroundColor: color.purple },
        animated,
      ]}
    >
      <Text style={s.damageChipText}>−{value}</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  stage: { height: STAGE_HEIGHT, overflow: 'hidden' },
  sky: { position: 'absolute', left: 0, right: 0, top: 0, bottom: SEA_HEIGHT, backgroundColor: color.skyTop },
  cloud: { position: 'absolute', borderRadius: 999, backgroundColor: color.white },
  sea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SEA_HEIGHT,
    backgroundColor: color.sea,
    borderTopWidth: 5,
    borderTopColor: color.seaFoam,
  },
  playerSlot: { position: 'absolute', left: 4, bottom: 26 },
  rivalSlot: { position: 'absolute', right: 2, bottom: 32 },
  shotOrigin: { position: 'absolute', left: 128, bottom: 68, width: 26, height: 30 },

  chainBar: { position: 'absolute', left: 0, top: 9, width: 24, height: 5, backgroundColor: color.inkSoft },
  chainBall: {
    position: 'absolute',
    top: 5,
    width: 13,
    height: 13,
    borderRadius: 999,
    backgroundColor: color.iron,
  },
  bolt: { width: 40, height: 20, borderRadius: 3, backgroundColor: color.gold, justifyContent: 'center' },
  boltCore: { marginHorizontal: 6, height: 8, borderRadius: 2, backgroundColor: color.white },
  emberTrail: {
    position: 'absolute',
    left: -18,
    top: 8,
    width: 20,
    height: 12,
    borderRadius: 999,
    backgroundColor: color.flame,
    opacity: 0.8,
  },
  barrel: {
    position: 'absolute',
    left: 2,
    top: 4,
    width: 22,
    height: 26,
    borderRadius: radius.nub,
    backgroundColor: color.woodLight,
    borderWidth: 3,
    borderColor: color.woodDeep,
  },
  krakenBall: { width: 26, height: 26, borderRadius: 999, backgroundColor: color.krakenPink },

  splash: {
    position: 'absolute',
    right: 20,
    bottom: 44,
    width: 56,
    height: 40,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: '#B7E6FA',
  },
  puff: {
    position: 'absolute',
    left: 120,
    bottom: 62,
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: '#B9C7D3',
  },

  damageChip: {
    position: 'absolute',
    top: 14,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
  },
  damageChipText: { ...type.title, color: color.parchment },

  rivalWash: { ...FILL, backgroundColor: 'rgba(76,47,160,0.16)' },
  rivalArrow: {
    position: 'absolute',
    right: 12,
    top: 52,
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#6C4BD6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rivalArrowText: { color: color.white, fontSize: 15, fontWeight: '800' },
});
