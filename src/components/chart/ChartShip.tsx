/**
 * The player's ship, parked at the live station.
 *
 * `board.ts` records the trap this file would otherwise walk into: the board authors
 * `transform: rotate(38deg)` on the sprite and then animates `transform`, which in CSS REPLACES
 * it — so the ship the board actually renders sits at ±1.2°, not 38°. `SHIP.bob.rotateDeg` holds
 * the rendered value and that is what is used here. Transcribing the 38 would draw a ship the
 * design never shows.
 *
 * The cast shadow sits OUTSIDE the animated view. A shadow that rises with the hull is not a
 * shadow; it is a second boat.
 */
import { useEffect } from 'react';
import { Image, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { SHIP, type Station } from './board';
import { art, mapX, mapY, type MapFrame } from './layout';
import { chart } from './palette';
import { sprite } from '../../theme/sprites';
import { font } from '../../theme/tokens';

/** RN 0.86 removed `StyleSheet.absoluteFillObject` from its types; this is the same thing. */
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

/**
 * The board's own sprite, at the size the board draws it (66×113 natural, 42pt wide).
 * Referenced through the typed manifest so a missing file is a compile error.
 */
const ROTATE = SHIP.bob.rotateDeg;

export function ChartShip({
  station,
  frame,
  typeScale,
  showHere,
}: {
  station: Station;
  frame: MapFrame;
  typeScale: number;
  /**
   * Whether the chip may say YOU ARE HERE. The ship is always drawn — a chart with no ship on it
   * asks a child "where am I?" and answers nothing — but a captain the fog has not let ashore
   * anywhere is not standing on an island, and the chip must not claim they are.
   */
  showHere: boolean;
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

  const width = art(frame, SHIP.width);
  const height = width * SHIP.aspect;

  // Hoisted out of the worklet. `art()` is a JS closure and a `useAnimatedStyle` body runs on the
  // UI runtime, where calling one crashes the first frame — invisibly to react-native-web.
  const rise = art(frame, SHIP.bob.riseY);
  const bobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -rise * bob.value }, { rotate: `${-ROTATE + 2 * ROTATE * bob.value}deg` }],
  }));

  return (
    <>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: mapX(frame, station.ship.cx) - width / 2,
          top: mapY(frame, station.ship.cy) - height / 2,
          width,
          height,
        }}
      >
        {/* No blur in React Native, so the board's `0 4px 6px rgba(0,0,0,.25)` becomes the flat
            ellipse the rest of this screen's shadows already are. */}
        <View
          style={{
            position: 'absolute',
            alignSelf: 'center',
            bottom: -art(frame, SHIP.shadow.dy),
            width: width * 0.62,
            height: art(frame, SHIP.shadow.radius),
            borderRadius: 999,
            backgroundColor: `rgba(20, 40, 60, ${SHIP.shadow.opacity})`,
          }}
        />
        <Animated.View style={[FILL, bobStyle]}>
          <Image source={sprite.ship01} style={{ width, height }} resizeMode="contain" />
        </Animated.View>
      </View>

      {!showHere ? null : (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: mapX(frame, station.hereChip.x),
            top: mapY(frame, station.hereChip.y),
            paddingHorizontal: SHIP.hereChip.padX * typeScale,
            paddingVertical: SHIP.hereChip.padY * typeScale,
            borderRadius: 999,
            backgroundColor: chart.parchment,
          }}
        >
          <Text
            style={{
              fontFamily: font.bodyBold,
              fontSize: SHIP.hereChip.size * typeScale,
              lineHeight: SHIP.hereChip.size * typeScale * 1.3,
              letterSpacing: SHIP.hereChip.size * SHIP.hereChip.tracking * typeScale,
              color: chart.ink,
            }}
          >
            YOU ARE HERE
          </Text>
        </View>
      )}
    </>
  );
}
