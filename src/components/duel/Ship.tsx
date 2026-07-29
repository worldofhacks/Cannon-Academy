/**
 * A ship, built from flat blocks.
 *
 * Board 5a specifies 14 layers, four of them cosmetic, and says production ships are ONE
 * pre-rendered sprite per hull with the cosmetic layers baked as separate transparent PNGs. Those
 * bakes don't exist yet, so this composes the same layer list out of Views — same silhouette, same
 * palette, same wake and luff timings, and the same four layers isolated as props. When the bakes
 * arrive this file becomes four `<Image>`s and nothing above it changes.
 *
 * No `clip-path` in React Native, so the hull's taper is a border trapezoid and the sails are
 * rectangles with a slight scale — at 150pt wide on a 375pt screen the difference is invisible,
 * and the shapes that actually carry the read (three gunports, a banded mainsail, a pennant that
 * moves) are all here.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { color, motion } from '../../theme/tokens';

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
}

export const PLAYER_SHIP: ShipCosmetics = {
  hull: color.woodLight,
  hullDeep: color.woodDeep,
  sail: color.parchment,
  trim: color.amber,
  pennant: color.amber,
  mast: color.wood,
  deck: color.deck,
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
}

export function Ship({ cosmetics: c, facing, width, burning = false }: ShipProps) {
  const bob = useSharedValue(0);
  const wake = useSharedValue(0);
  const luff = useSharedValue(0);

  useEffect(() => {
    // Slightly different periods per ship so two ships on screen never pulse in lockstep — the
    // thing that makes a scene read as a loop rather than as water.
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

  const s = width / 150; // the boards drew the player ship at 150pt; everything scales off that.

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

  return (
    <Animated.View style={[{ width, height: 124 * s }, bobStyle]}>
      {/* wake */}
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

      {/* masts */}
      <View
        style={{
          position: 'absolute',
          left: 67 * s,
          bottom: 44 * s,
          width: 7 * s,
          height: 68 * s,
          borderRadius: 4,
          backgroundColor: c.mast,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 107 * s,
          bottom: 44 * s,
          width: 5 * s,
          height: 44 * s,
          borderRadius: 3,
          backgroundColor: c.mast,
        }}
      />

      {/* pennant — the flag chosen at onboarding becomes this colour (board 5b) */}
      <View
        style={{
          position: 'absolute',
          left: 70 * s,
          bottom: 110 * s,
          width: 26 * s,
          height: 12 * s,
          backgroundColor: c.pennant,
          borderTopRightRadius: 2,
          borderBottomRightRadius: 2,
        }}
      />

      {/* sails: topsail, banded mainsail, jib */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 32 * s,
            bottom: 88 * s,
            width: 34 * s,
            height: 22 * s,
            backgroundColor: c.sail,
            borderRadius: 2,
          },
          luffStyle,
        ]}
      />
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 22 * s,
            bottom: 52 * s,
            width: 45 * s,
            height: 34 * s,
            backgroundColor: c.sail,
            borderRadius: 2,
            overflow: 'hidden',
          },
          luffStyle,
        ]}
      >
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 12 * s,
            height: 7 * s,
            backgroundColor: c.trim,
          }}
        />
      </Animated.View>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 88 * s,
            bottom: 46 * s,
            width: 26 * s,
            height: 32 * s,
            backgroundColor: c.sail,
            borderTopRightRadius: 2,
          },
          luffStyle,
        ]}
      />

      {/* deck rail */}
      <View
        style={{
          position: 'absolute',
          left: 10 * s,
          bottom: 38 * s,
          width: 130 * s,
          height: 7 * s,
          borderRadius: 4,
          backgroundColor: c.deck,
        }}
      />

      {/* hull — trapezoid via borders, with the trim band and three gunports */}
      <View style={{ position: 'absolute', left: 0, bottom: 0, width, height: 39 * s }}>
        {/* The border trick draws a TRIANGLE at width:0 and a trapezoid only when the centre has
            width. `width - 2*inset` is that centre; getting this wrong renders a dinghy. */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            width: width - 28 * s,
            height: 0,
            borderBottomWidth: 39 * s,
            borderBottomColor: c.hull,
            borderLeftWidth: 14 * s,
            borderRightWidth: 14 * s,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: 5 * s,
            right: 5 * s,
            top: 5 * s,
            height: 7 * s,
            backgroundColor: c.trim,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: 12 * s,
            right: 12 * s,
            bottom: 0,
            height: 12 * s,
            backgroundColor: c.hullDeep,
          }}
        />
        {[28, 64, 100].map((x) => (
          <View
            key={x}
            style={{
              position: 'absolute',
              left: x * s,
              top: 17 * s,
              width: 11 * s,
              height: 11 * s,
              borderRadius: 999,
              backgroundColor: color.gunport,
              borderWidth: 2,
              borderColor: c.deck,
            }}
          />
        ))}
      </View>

      {burning ? <Flame style={{ left: 96 * s, bottom: 38 * s, width: 28 * s }} /> : null}
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
