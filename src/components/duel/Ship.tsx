/**
 * A ship — one pre-rendered hull sprite with cosmetic layers stacked at runtime.
 *
 * Board 5a: production ships are ONE pre-rendered sprite per hull; board 5b stacks the onboarding
 * flag as a pennant on top. Enemy encounter overlays (crossbones, skull, fin, ghost glow) stay
 * isolated props so A-031 kind-specific reads survive the sprite pass unchanged.
 */
import { useEffect } from 'react';
import { Image, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Poly } from '../Poly';
import type { EnemyPresentationKind } from '../../content/schemas';
import { DEFAULT_FLAG_ID } from '../../theme/flags';
import { flagSpriteForId, hullSpriteForKind } from '../../theme/sprites';
import { color, motion } from '../../theme/tokens';
import { Captain, type CaptainPose } from './Captain';

/** RN 0.86 removed `StyleSheet.absoluteFillObject` from its types; this is the same thing. */
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

export interface ShipCosmetics {
  readonly hull: string;
  readonly hullDeep: string;
  readonly sail: string;
  readonly trim: string;
  readonly pennant: string;
  readonly mast: string;
  readonly deck: string;
  /** Persisted onboarding flag id — drives the pennant sprite (board 5b). */
  readonly pennantFlagId?: string;
}

export const PLAYER_SHIP: ShipCosmetics = {
  hull: color.woodLight,
  hullDeep: color.woodDeep,
  sail: color.parchment,
  trim: color.amber,
  pennant: color.amber,
  mast: color.wood,
  deck: color.deck,
  pennantFlagId: DEFAULT_FLAG_ID,
};

export const RIVAL_SHIP: ShipCosmetics = {
  hull: '#4A3B5C',
  hullDeep: '#33284A',
  sail: '#8A6FE0',
  trim: '#6C4BD6',
  pennant: '#6C4BD6',
  mast: '#5C4A3A',
  deck: '#6B5A48',
};

interface ShipProps {
  readonly cosmetics: ShipCosmetics;
  /** Mirrors the hull so the rival faces the player. */
  readonly facing: 'right' | 'left';
  readonly width: number;
  /** Below 30% hull the ship burns. The boards' low-hull read — never hide it behind a cosmetic. */
  readonly burning?: boolean;
  /** The captain's pose, if this ship has one aboard. Only the player's does. */
  readonly captainPose?: CaptainPose;
  /** Island encounter identity — drives shape layers beyond palette alone (A-031). */
  readonly presentationKind?: EnemyPresentationKind;
  readonly ghostOpacity?: number;
  readonly ghostGlow?: string;
}

export function Ship({
  cosmetics: c,
  facing,
  width,
  burning = false,
  captainPose,
  presentationKind,
  ghostOpacity,
  ghostGlow,
}: ShipProps) {
  if (presentationKind === 'kraken') {
    return <KrakenForm facing={facing} width={width} burning={burning} />;
  }
  const bob = useSharedValue(0);
  const wake = useSharedValue(0);
  const luff = useSharedValue(0);

  useEffect(() => {
    const period = facing === 'right' ? 3600 : 4400;
    bob.value = withRepeat(
      withSequence(
        withTiming(1, { duration: period / 2, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: period / 2, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
    wake.value = withRepeat(
      withSequence(
        withTiming(1, { duration: motion.loop.wake / 2, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: motion.loop.wake / 2, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
    luff.value = withRepeat(
      withSequence(
        withTiming(1, { duration: motion.loop.luff / 2, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: motion.loop.luff / 2, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [bob, wake, luff, facing]);

  const s = width / 150;
  const hullHeight = 124 * s;
  const hullSource = hullSpriteForKind(presentationKind);

  const bobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -5 * bob.value },
      { rotate: `${-1.2 + 2.4 * bob.value}deg` },
      { scaleX: facing === 'left' ? -1 : 1 },
    ],
  }));
  const wakeStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + 0.3 * wake.value,
    transform: [{ translateX: -4 * wake.value }, { scaleX: 1 + 0.06 * wake.value }],
  }));
  const luffStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: 1 - 0.045 * luff.value }] }));

  const body = (
    <Animated.View style={[{ width, height: hullHeight }, bobStyle]}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 6 * s,
            bottom: -5 * s,
            width: 142 * s,
            height: 11 * s,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.6)',
          },
          wakeStyle,
        ]}
      />

      {hullSource !== null ? (
        <Image
          source={hullSource}
          style={{ position: 'absolute', left: 0, bottom: 0, width, height: hullHeight }}
          resizeMode="contain"
          accessibilityLabel="ship hull"
        />
      ) : null}

      {c.pennantFlagId !== undefined ? (
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 70 * s,
              bottom: 110 * s,
              width: 26 * s,
              height: 12 * s,
            },
            luffStyle,
          ]}
        >
          <Image
            source={flagSpriteForId(c.pennantFlagId)}
            style={{ width: 26 * s, height: 12 * s, tintColor: c.pennant }}
            resizeMode="contain"
            accessibilityLabel="ship pennant"
          />
        </Animated.View>
      ) : null}

      {presentationKind === 'pirate' ? <CrossbonesFlag scale={s} /> : null}
      {presentationKind === 'skeleton' ? <SkullSails scale={s} /> : null}

      {captainPose !== undefined ? (
        <View style={{ position: 'absolute', left: 40 * s, bottom: 44 * s }}>
          <Captain pose={captainPose} scale={s} />
        </View>
      ) : null}

      {burning ? <Flame style={{ left: 96 * s, bottom: 38 * s, width: 28 * s }} /> : null}
      {presentationKind === 'shark' ? <SharkFin scale={s} /> : null}
    </Animated.View>
  );

  if (presentationKind === 'ghost') {
    return (
      <View
        style={{ width, opacity: ghostOpacity ?? 0.58 }}
        accessibilityLabel="ghost ship with glow"
      >
        {ghostGlow !== undefined ? (
          <View
            style={{
              position: 'absolute',
              left: 8 * s,
              right: 8 * s,
              bottom: 20 * s,
              top: 8 * s,
              borderRadius: 999,
              backgroundColor: ghostGlow,
              opacity: 0.35,
            }}
          />
        ) : null}
        {body}
      </View>
    );
  }

  return body;
}

function CrossbonesFlag({ scale: s }: { scale: number }) {
  return (
    <View style={{ position: 'absolute', left: 74 * s, bottom: 112 * s, width: 18 * s, height: 18 * s }}>
      <View
        style={{
          position: 'absolute',
          left: 7 * s,
          top: 0,
          width: 4 * s,
          height: 18 * s,
          borderRadius: 2,
          backgroundColor: color.parchment,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 7 * s,
          width: 18 * s,
          height: 4 * s,
          borderRadius: 2,
          backgroundColor: color.parchment,
        }}
      />
    </View>
  );
}

function SkullSails({ scale: s }: { scale: number }) {
  return (
    <View style={{ position: 'absolute', left: 48 * s, bottom: 72 * s, width: 16 * s, height: 16 * s }}>
      <View
        style={{
          width: 16 * s,
          height: 14 * s,
          borderRadius: 999,
          backgroundColor: color.parchment,
        }}
      />
      <View style={{ position: 'absolute', left: 4 * s, top: 5 * s, width: 3 * s, height: 3 * s, borderRadius: 999, backgroundColor: color.inkDark }} />
      <View style={{ position: 'absolute', right: 4 * s, top: 5 * s, width: 3 * s, height: 3 * s, borderRadius: 999, backgroundColor: color.inkDark }} />
      <View style={{ position: 'absolute', left: 6 * s, bottom: 2 * s, width: 4 * s, height: 2 * s, borderRadius: 2, backgroundColor: color.inkDark }} />
    </View>
  );
}

function SharkFin({ scale: s }: { scale: number }) {
  return (
    <Poly
      points="50,0 100,100 0,100"
      width={34 * s}
      height={22 * s}
      fill="#607888"
      style={{ position: 'absolute', left: 8 * s, bottom: 52 * s }}
    />
  );
}

function KrakenForm({
  facing,
  width,
  burning,
}: {
  facing: 'right' | 'left';
  width: number;
  burning?: boolean;
}) {
  const bob = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [bob]);

  const s = width / 150;
  const bobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -4 * bob.value },
      { scaleX: facing === 'left' ? -1 : 1 },
    ],
  }));

  return (
    <Animated.View style={[{ width, height: 124 * s }, bobStyle]} accessibilityLabel="kraken tentacles">
      {[18, 52, 86].map((x, index) => (
        <View
          key={x}
          style={{
            position: 'absolute',
            left: x * s,
            bottom: 0,
            width: 18 * s,
            height: (48 + index * 8) * s,
            borderTopLeftRadius: 999,
            borderTopRightRadius: 999,
            backgroundColor: index === 1 ? color.krakenDeep : color.krakenPink,
          }}
        />
      ))}
      <View
        style={{
          position: 'absolute',
          left: 34 * s,
          bottom: 36 * s,
          width: 52 * s,
          height: 52 * s,
          borderRadius: 999,
          backgroundColor: color.krakenPink,
          borderWidth: 4 * s,
          borderColor: color.krakenDeep,
        }}
      />
      {burning ? <Flame style={{ left: 70 * s, bottom: 48 * s, width: 24 * s }} /> : null}
    </Animated.View>
  );
}

/** A licking flame. Used on a burning hull and as the Powder Keg's impact. */
export function Flame({ style }: { style: { left: number; bottom: number; width: number } }) {
  const f = useSharedValue(0);
  useEffect(() => {
    f.value = withRepeat(
      withSequence(withTiming(1, { duration: 350 }), withTiming(0, { duration: 350 })),
      -1,
    );
  }, [f]);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.16 * f.value }, { translateY: -3 * f.value }],
  }));
  return (
    <Animated.View style={[FILL, { ...style, height: style.width }, animated]}>
      <View
        style={{
          flex: 1,
          borderRadius: 999,
          backgroundColor: color.flame,
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <View
          style={{
            width: '55%',
            height: '55%',
            borderRadius: 999,
            backgroundColor: color.gold,
            marginBottom: 2,
          }}
        />
      </View>
    </Animated.View>
  );
}
