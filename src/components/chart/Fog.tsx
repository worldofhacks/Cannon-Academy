/**
 * The fog bank — three drifting, irregular weather blobs.
 *
 * The fog is the promise that there is more map (`services/chart.ts` says the same thing about the
 * data), so it is drawn as weather rather than as a blanked-out region: the closed stations sit ON
 * it, visible and unreachable, exactly as the board draws them.
 *
 * Three soft banks from `board.ts` drift 10pt sideways over 7s. Their overlapping irregular
 * silhouettes preserve the fog without laying a rectangular wash over the sea or dock boundary.
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
import { Blob } from './Blob';
import { FOG } from './board';
import { art, mapX, mapY, type MapFrame } from './layout';
import { chart } from './palette';

/** RN 0.86 removed `StyleSheet.absoluteFillObject` from its types; this is the same thing. */
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

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

  return (
    <Animated.View style={[FILL, { pointerEvents: 'none' }]}>
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
    </Animated.View>
  );
}
