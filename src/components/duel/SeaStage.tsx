/**
 * The sea — the top 176pt of the duel screen, and the only part that is pure spectacle.
 *
 * Everything here is presentation under the T-031 ruling: no view in this file may read or alter a
 * damage number. It shows what the reducer already decided. That is why the shot arc takes
 * `damage` only to print it on a chip, and why the arc SHAPE comes from the cannon's look table
 * rather than from its damage band.
 */
import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ARC_PEAK, type CannonLook } from '../../theme/cannonPresentation';
import { REFERENCE } from '../../theme/responsive';
import { sprite } from '../../theme/sprites';
import { color, motion, radius, type } from '../../theme/tokens';
import type { DuelPhase } from '../../stores/duel';
import type { CaptainPose } from './Captain';
import { RIVAL_SHIP, Ship, type ShipCosmetics } from './Ship';

/** RN 0.86 removed `StyleSheet.absoluteFillObject` from its types; this is the same thing. */
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

/**
 * The board draws the stage at 176pt of a 667pt screen and the sea band at 58 of that 176 — a
 * third. Both are now proportions rather than constants, because the vertical range across the
 * phones we support is 640pt to 932pt and a flat 176 wastes a Pro Max while crowding an SE.
 */
const SEA_BAND_RATIO = 58 / 176;

/**
 * Horizontal board geometry at the 375pt reference. On tablet/desktop the world surface is far
 * wider (A-043), so these must be multiplied by `stageWidth / REFERENCE.width` or the ball lands
 * in open water while the ships stay edge-anchored.
 */
const BOARD = {
  travelX: 208,
  shotLeft: 128,
  incomingRight: 104,
  impactRight: 44,
  splashRight: 20,
  rivalBurstLeft: 34,
  puffLeft: 120,
  playerLeft: 4,
  rivalRight: 2,
  damageInset: 44,
  rivalArrowRight: 12,
} as const;

interface SeaStageProps {
  readonly phase: DuelPhase;
  readonly captainPose: CaptainPose;
  /** The player's ship colours, with the onboarding flag as its pennant (board 5b). */
  readonly playerShip: ShipCosmetics;
  /** Computed by `seaStageHeight()` from the real screen, not a constant. */
  readonly height: number;
  /** Illustration scale. Ships grow on a bigger phone; the HUD above them does not. */
  readonly art: number;
  readonly look: CannonLook;
  readonly playerHullPct: number;
  readonly rivalHullPct: number;
  readonly damageToRival: number | null;
  readonly damageToPlayer: number | null;
}

export function SeaStage({
  phase,
  captainPose,
  playerShip,
  height,
  art,
  look,
  playerHullPct,
  rivalHullPct,
  damageToRival,
  damageToPlayer,
}: SeaStageProps) {
  const rivalTurn = phase === 'watch' || phase === 'rivalFly' || phase === 'rivalImpact';
  const seaHeight = Math.round(height * SEA_BAND_RATIO);
  const [stageWidth, setStageWidth] = useState<number>(REFERENCE.width);
  const onStageLayout = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    setStageWidth((prev) => (prev === next ? prev : next));
  };
  // Prefer the measured stage so the arc tracks A-043's world column; fall back to the art factor
  // (phone) when layout has not fired yet.
  const boardScale = stageWidth > 0 ? stageWidth / REFERENCE.width : art;
  const travelX = BOARD.travelX * boardScale;
  const x = (designPx: number) => designPx * boardScale;

  return (
    <View style={[s.stage, { height }]} onLayout={onStageLayout}>
      <View style={[s.sky, { bottom: seaHeight }]} />
      <View style={[s.cloud, { left: x(32), top: 16, width: x(58), height: 16, opacity: 0.85 }]} />
      <View style={[s.cloud, { left: x(52), top: 8, width: x(34), height: 14, opacity: 0.85 }]} />
      <View style={[s.cloud, { right: x(26), top: 30, width: x(44), height: 13, opacity: 0.7 }]} />
      <View style={[s.sea, { height: seaHeight }]} />

      <View style={[s.playerSlot, { left: x(BOARD.playerLeft) }]}>
        <Ship
          cosmetics={playerShip}
          facing="right"
          width={150 * art}
          burning={playerHullPct <= 0.3}
          captainPose={captainPose}
        />
      </View>
      <View style={[s.rivalSlot, { right: x(BOARD.rivalRight) }]}>
        <Ship
          cosmetics={RIVAL_SHIP}
          facing="left"
          width={126 * art}
          burning={rivalHullPct > 0 && rivalHullPct <= 0.3}
        />
      </View>

      {phase === 'fly' ? <Projectile look={look} travelX={travelX} originLeft={x(BOARD.shotLeft)} /> : null}
      {phase === 'rivalFly' ? <IncomingShot travelX={travelX} originRight={x(BOARD.incomingRight)} /> : null}
      {phase === 'impact' ? <Impact look={look} insetRight={x(BOARD.impactRight)} /> : null}
      {phase === 'rivalImpact' ? (
        <Burst
          source={sprite.explosionMid}
          style={{ left: x(BOARD.rivalBurstLeft), bottom: 48, width: x(82) }}
        />
      ) : null}
      {phase === 'miss' ? <Splash insetRight={x(BOARD.splashRight)} width={x(56)} /> : null}
      {phase === 'timeout' ? <MisfirePuff left={x(BOARD.puffLeft)} /> : null}

      {damageToRival !== null ? (
        <DamageChip value={damageToRival} side="right" inset={x(BOARD.damageInset)} />
      ) : null}
      {damageToPlayer !== null ? (
        <DamageChip value={damageToPlayer} side="left" inset={x(BOARD.damageInset)} />
      ) : null}

      {rivalTurn ? (
        <>
          {/* A wash, not a curtain. The child must still see their own ship taking the hit. */}
          <View style={s.rivalWash} pointerEvents="none" />
          <View style={[s.rivalArrow, { right: x(BOARD.rivalArrowRight) }]}>
            <Text style={s.rivalArrowText}>▼</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

/** The player's shot, arcing left to right. Arc height is the cannon's identity (board 5c). */
function Projectile({
  look,
  travelX,
  originLeft,
}: {
  look: CannonLook;
  travelX: number;
  originLeft: number;
}) {
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
      { translateX: travelX * t.value },
      { translateY: -peak * 4 * t.value * (1 - t.value) + 6 * t.value },
      { scale: 0.7 + 0.3 * Math.min(1, t.value * 2) },
    ],
  }));

  return (
    <Animated.View style={[s.shotOrigin, { left: originLeft }, animated]}>
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
function IncomingShot({ travelX, originRight }: { travelX: number; originRight: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, {
      duration: motion.beat.shot,
      easing: Easing.bezier(0.4, 0.1, 0.7, 0.9),
    });
  }, [t]);
  const animated = useAnimatedStyle(() => ({
    transform: [
      { translateX: -travelX * t.value },
      { translateY: -56 * 4 * t.value * (1 - t.value) + 6 * t.value },
    ],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', right: originRight, bottom: 60 }, animated]}>
      <Image source={sprite.cannonball} style={{ width: 22, height: 22 }} />
    </Animated.View>
  );
}

/** Blast size tracks the shot's spectacle, not its damage. Board 5c. */
function Impact({ look, insetRight }: { look: CannonLook; insetRight: number }) {
  const big = look.projectile === 'bolt' || look.projectile === 'fire' || look.projectile === 'tentacle';
  const source = big
    ? sprite.explosionBig
    : look.projectile === 'chain'
      ? sprite.explosionMid
      : sprite.explosionSmall;
  return (
    <>
      <Burst source={source} style={{ right: insetRight, bottom: 52, width: big ? 74 : 48 }} />
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
function Splash({ insetRight, width }: { insetRight: number; width: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) });
  }, [t]);
  const animated = useAnimatedStyle(() => ({
    opacity: t.value < 0.4 ? t.value / 0.4 : 1 - (t.value - 0.4) / 0.6,
    transform: [{ translateY: 10 - 20 * Math.min(1, t.value / 0.4) }, { scaleY: 0.3 + 0.7 * t.value }],
  }));
  return <Animated.View style={[s.splash, { right: insetRight, width }, animated]} />;
}

function MisfirePuff({ left }: { left: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) });
  }, [t]);
  const animated = useAnimatedStyle(() => ({
    opacity: 0.75 * (1 - t.value),
    transform: [{ translateY: -26 * t.value }, { scale: 0.6 + 0.9 * t.value }],
  }));
  return <Animated.View style={[s.puff, { left }, animated]} />;
}

/**
 * The number the whole turn was for.
 *
 * It animates its OFFSET, never its opacity. A chip whose only source of visibility is an
 * animation is invisible whenever that animation does not run — and a damage number that
 * sometimes fails to appear is worse than one that never moves, because the volley silently
 * stops explaining itself.
 */
function DamageChip({ value, side, inset }: { value: number; side: 'left' | 'right'; inset: number }) {
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
          ? { right: inset, backgroundColor: color.inkDark }
          : { left: inset, backgroundColor: color.purple },
        animated,
      ]}
    >
      <Text style={s.damageChipText}>−{value}</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  stage: { overflow: 'hidden' },
  sky: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: color.skyTop },
  cloud: { position: 'absolute', borderRadius: 999, backgroundColor: color.white },
  sea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.sea,
    borderTopWidth: 5,
    borderTopColor: color.seaFoam,
  },
  playerSlot: { position: 'absolute', bottom: 26 },
  rivalSlot: { position: 'absolute', bottom: 32 },
  shotOrigin: { position: 'absolute', bottom: 68, width: 26, height: 30 },

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
    bottom: 44,
    height: 40,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: '#B7E6FA',
  },
  puff: {
    position: 'absolute',
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
