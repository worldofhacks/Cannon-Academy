/**
 * The player's ship — the position marker on both screens.
 *
 * One of only two rasters the board uses (`sprites/ship-01.png` and `cannon.png`); everything else
 * on the chart is composed geometry. Board 9d: *"The only images on the screen are two of the nine
 * PNGs already in the project."*
 *
 * `board.ts` records the trap this file would otherwise walk into: the board authors
 * `transform: rotate(-24deg)` on the voyage sprite and `rotate(-18deg)` on the close one, then runs
 * `sc-bob`, which animates `transform` — and in CSS an animated transform REPLACES the authored one
 * for its whole run. So neither angle ever renders; both ships oscillate at ±2°, and that is what
 * `SHIP.bob.rotateDeg` holds. The previous board set the identical trap at 38deg (A-045), which is
 * how it is recognisable at all.
 *
 * The cast shadow sits OUTSIDE the animated view. A shadow that rises with the hull is not a
 * shadow; it is a second boat.
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

import { SHIP } from './board';
import { art, type MapFrame } from './layout';
import { sprite } from '../../theme/sprites';

/** RN 0.86 removed `StyleSheet.absoluteFillObject` from its types; this is the same thing. */
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

const ROTATE = SHIP.bob.rotateDeg;

export function ChartShip({
  frame,
  left,
  top,
  width,
}: {
  frame: MapFrame;
  /** Already resolved to pixels by the screen that owns the coordinate space. */
  left: number;
  top: number;
  /** The board's own sprite width in design points — 38 on the voyage map, 46 on the close chart. */
  width: number;
}) {
  const bob = useSharedValue(0);

  useEffect(() => {
    bob.value = withRepeat(
      withSequence(
        withTiming(1, { duration: SHIP.bob.ms / 2, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: SHIP.bob.ms / 2, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [bob]);

  const w = art(frame, width);
  const h = w * SHIP.aspect;

  // Hoisted out of the worklet. `art()` is a JS closure and a `useAnimatedStyle` body runs on the
  // UI runtime, where calling one crashes the first frame — invisibly to react-native-web.
  const rise = art(frame, SHIP.bob.riseY);
  const bobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -rise * bob.value }, { rotate: `${-ROTATE + 2 * ROTATE * bob.value}deg` }],
  }));

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left, top, width: w, height: h }}>
      {/* No blur in React Native, so the board's `drop-shadow(0 4px 5px …)` becomes the flat
          ellipse the rest of this screen's shadows already are. */}
      <View
        style={{
          position: 'absolute',
          alignSelf: 'center',
          bottom: -art(frame, SHIP.shadow.dy),
          width: w * 0.62,
          height: art(frame, SHIP.shadow.radius),
          borderRadius: 999,
          backgroundColor: `rgba(20, 40, 60, ${SHIP.shadow.opacity})`,
        }}
      />
      <Animated.View style={[FILL, bobStyle]}>
        <Image source={sprite.ship01} style={{ width: w, height: h }} resizeMode="contain" />
      </Animated.View>
    </View>
  );
}
