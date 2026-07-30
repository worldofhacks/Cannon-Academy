/**
 * The kraken — three pink humps, a fluke and a waterline, drifting in open water.
 *
 * Board 9d, in full, because it is the whole reason this file exists: *"It is not a node and it is
 * not tappable. It exists so that the fog is hiding something specific, and so that a child asks a
 * question the game can answer four islands later. The single cheapest piece of narrative in the
 * build."* So it is `pointerEvents: none` and it speaks to nobody — a screen reader announcing "sea
 * monster" would turn a rumour into a label.
 *
 * `sc-hump`: `translateY(0 → −3px → 0)`, 3.2s, ease-in-out. It moves as one body, which is what
 * separates a creature from three decorative arches.
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

import { KRAKEN } from './board';
import { art, mapX, mapY, type MapFrame } from './layout';
import { chart } from './palette';
import { Poly } from '../Poly';

export function Kraken({ frame }: { frame: MapFrame }) {
  const swim = useSharedValue(0);

  useEffect(() => {
    swim.value = withRepeat(
      withSequence(
        withTiming(1, { duration: KRAKEN.ms / 2, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: KRAKEN.ms / 2, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [swim]);

  // Hoisted out of the worklet — `art()` is a JS closure and a `useAnimatedStyle` body runs on the
  // UI runtime, where calling one crashes the first frame, invisibly to react-native-web.
  const rise = art(frame, KRAKEN.riseY);
  const humpStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -rise * swim.value }] }));

  const w = art(frame, KRAKEN.w);
  const h = art(frame, KRAKEN.h);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: mapX(frame, KRAKEN.x),
          top: mapY(frame, KRAKEN.y),
          width: w,
          height: h,
        },
        humpStyle,
      ]}
    >
      {KRAKEN.humps.map((hump) => (
        <View
          key={hump.x}
          style={{
            position: 'absolute',
            left: art(frame, hump.x),
            bottom: art(frame, hump.bottom),
            width: art(frame, hump.w),
            height: art(frame, hump.h),
            // `border-radius: 999px 999px 0 0` — a dome breaking the surface.
            borderTopLeftRadius: 999,
            borderTopRightRadius: 999,
            backgroundColor: hump.fill,
          }}
        />
      ))}
      <Poly
        points={KRAKEN.fluke.points}
        width={art(frame, KRAKEN.fluke.w)}
        height={art(frame, KRAKEN.fluke.h)}
        fill={KRAKEN.fluke.fill}
        style={{
          position: 'absolute',
          left: art(frame, KRAKEN.fluke.x),
          bottom: art(frame, KRAKEN.fluke.bottom),
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: art(frame, KRAKEN.water.w),
          height: art(frame, KRAKEN.water.h),
          borderRadius: 999,
          backgroundColor: chart.seaCrest,
          opacity: KRAKEN.water.opacity,
        }}
      />
    </Animated.View>
  );
}
