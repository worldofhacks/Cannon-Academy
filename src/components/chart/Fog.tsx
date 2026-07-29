/**
 * The fog bank — three drifting blobs under one vertical wash.
 *
 * The fog is the promise that there is more map (`services/chart.ts` says the same thing about the
 * data), so it is drawn as weather rather than as a blanked-out region: the closed stations sit ON
 * it, visible and unreachable, exactly as the board draws them.
 *
 * Two pieces, both from `board.ts`: three soft banks at `opacity: .9` that drift 10pt sideways over
 * 7s, and a gradient overlay that bleeds 14pt past them left and right and 10pt past the bottom, so
 * the bank has no edge anywhere a child can see it.
 */
import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Blob } from './Blob';
import { FOG } from './board';
import { art, mapX, mapY, type MapFrame } from './layout';
import { chart } from './palette';

/** RN 0.86 removed `StyleSheet.absoluteFillObject` from its types; this is the same thing. */
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

const [STOP_TOP, STOP_MID, STOP_BOTTOM] = FOG.gradient.stops;
const [AT_TOP, AT_MID, AT_BOTTOM] = FOG.gradient.at;

export function Fog({ frame }: { frame: MapFrame }) {
  const drift = useSharedValue(0);

  useEffect(() => {
    drift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: FOG.driftMs / 2, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: FOG.driftMs / 2, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [drift]);

  // Hoisted OUT of the worklet on purpose. A `useAnimatedStyle` body runs on the UI runtime and
  // cannot synchronously call a JS closure — `art(frame, …)` inside it crashes on the first frame,
  // and react-native-web does not enforce the rule, so the tests would never notice.
  const driftX = art(frame, FOG.driftX);
  const driftStyle = useAnimatedStyle(() => ({ transform: [{ translateX: driftX * drift.value }] }));

  const insetX = mapX(frame, FOG.insetX);
  const bleedX = art(frame, FOG.overlayBleedX);
  const top = mapY(frame, FOG.top);
  const overlayWidth = frame.width - insetX * 2 + bleedX * 2;
  const overlayHeight = frame.height - top + art(frame, FOG.overlayBleedY);

  return (
    <Animated.View style={FILL} pointerEvents="none">
      <Animated.View style={[FILL, driftStyle]}>
        {FOG.banks.map((bank) => (
          <Blob
            key={`${bank.x}-${bank.y}`}
            radii={bank.radii}
            width={art(frame, bank.w)}
            height={art(frame, bank.h)}
            fill={chart.fog}
            style={{
              position: 'absolute',
              left: mapX(frame, bank.x),
              top: mapY(frame, bank.y),
              opacity: FOG.opacity,
            }}
          />
        ))}
      </Animated.View>

      <Svg
        width={overlayWidth}
        height={overlayHeight}
        style={{ position: 'absolute', left: insetX - bleedX, top }}
      >
        <Defs>
          <LinearGradient id="cbFog" x1="0" y1="0" x2="0" y2="1">
            <Stop offset={AT_TOP} stopColor={chart.fog} stopOpacity={STOP_TOP} />
            <Stop offset={AT_MID} stopColor={chart.fog} stopOpacity={STOP_MID} />
            <Stop offset={AT_BOTTOM} stopColor={chart.fog} stopOpacity={STOP_BOTTOM} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={overlayWidth} height={overlayHeight} fill="url(#cbFog)" />
      </Svg>
    </Animated.View>
  );
}
