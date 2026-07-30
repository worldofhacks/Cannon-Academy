/**
 * The water both screens are drawn on: one radial gradient, drifting swells, and dashed routes.
 *
 * Board 9d, on why the gradient earns its keep: *"One radial gradient takes the sea from sea-crest
 * at the horizon to sea-deep at the edges… That single ring does more for believability than any
 * amount of texture: it says the island continues under the water."* React Native has no CSS
 * gradient, so it is one `<Svg>` with a `RadialGradient` — one draw call for the whole ocean.
 *
 * The swells and the routes are the board's ambient motion. Board 9d again: *"Only one thing moves
 * urgently"* — the live island's ring is the sole animation with a beat, and everything here drifts
 * on a staggered period so nothing pulses in time with anything else.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { SWELL, TRAIL, type Swell as BoardSwell, type TrailDot } from './board';
import { art, mapX, mapY, type MapFrame } from './layout';

/** RN 0.86 removed `StyleSheet.absoluteFillObject` from its types; this is the same thing. */
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

interface Water {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly stops: readonly { readonly offset: number; readonly color: string }[];
}

/**
 * `radial-gradient(rx ry at cx cy, …)`.
 *
 * CSS sizes the ending shape against the box — `120%` of the WIDTH across and `80%` of the HEIGHT
 * down — which is exactly what SVG's default `objectBoundingBox` gradient units mean, so the board's
 * percentages transcribe one for one. The final stop is repeated at 100% because CSS holds the last
 * colour out to the edge and SVG would otherwise stop painting there.
 *
 * Sized by the MEASURED BOX rather than by the letterboxed board, which is the one place the two
 * deliberately part company. Every other element belongs to the composition and letterboxes with it;
 * the water is the paper the composition is drawn on, and both boards paint it edge to edge under a
 * floating header. Contain-fitting the sea too would leave a slab of flat colour above and below the
 * ocean, and the header would float over the slab instead of over the water.
 */
export function SeaWater({ width, height, water }: { width: number; height: number; water: Water }) {
  const last = water.stops[water.stops.length - 1];
  const offsets = last === undefined ? water.stops : [...water.stops, { offset: 1, color: last.color }];

  return (
    <Svg width={width} height={height} style={FILL} pointerEvents="none">
      <Defs>
        <RadialGradient
          id="chart-sea"
          cx={`${water.cx * 100}%`}
          cy={`${water.cy * 100}%`}
          rx={`${water.rx * 100}%`}
          ry={`${water.ry * 100}%`}
        >
          {offsets.map((stop) => (
            <Stop key={stop.offset} offset={`${stop.offset * 100}%`} stopColor={stop.color} />
          ))}
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#chart-sea)" />
    </Svg>
  );
}

/** The voyage map's one big shallow: a 300×260 ellipse of sea-crest at 14%. */
export function Lagoon({
  frame,
  lagoon,
  fill,
}: {
  frame: MapFrame;
  lagoon: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
    readonly opacity: number;
  };
  fill: string;
}) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: mapX(frame, lagoon.x),
        top: mapY(frame, lagoon.y),
        width: art(frame, lagoon.w),
        height: art(frame, lagoon.h),
        borderRadius: 999,
        backgroundColor: fill,
        opacity: lagoon.opacity,
      }}
    />
  );
}

export function Swells({
  frame,
  swells,
  height,
  fill,
}: {
  frame: MapFrame;
  swells: readonly BoardSwell[];
  height: number;
  fill: string;
}) {
  return (
    <>
      {swells.map((swell) => (
        <Swell key={`${swell.x}-${swell.y}`} frame={frame} swell={swell} height={height} fill={fill} />
      ))}
    </>
  );
}

/**
 * One swell dash on `sc-swell`.
 *
 * The element is authored at `opacity:.55` and then animates opacity `.5 → .85`, and in CSS the
 * animation wins for its whole run — so the authored value never renders and the ANIMATED range is
 * what is drawn here (`board.ts` header, trap 2).
 */
function Swell({
  frame,
  swell,
  height,
  fill,
}: {
  frame: MapFrame;
  swell: BoardSwell;
  height: number;
  fill: string;
}) {
  const wave = useSharedValue(0);

  useEffect(() => {
    wave.value = withDelay(
      swell.delayMs,
      withRepeat(
        withSequence(
          withTiming(1, { duration: swell.ms / 2, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: swell.ms / 2, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      ),
    );
  }, [wave, swell.delayMs, swell.ms]);

  // Hoisted OUT of the worklet on purpose. A `useAnimatedStyle` body runs on the UI runtime and
  // cannot synchronously call a JS closure — `art(frame, …)` inside it crashes on the first frame,
  // and react-native-web does not enforce the rule, so the tests would never notice.
  const travel = art(frame, SWELL.travelX);
  const from = SWELL.opacityFrom;
  const span = SWELL.opacityTo - SWELL.opacityFrom;
  const swellStyle = useAnimatedStyle(() => ({
    opacity: from + span * wave.value,
    transform: [{ translateX: travel * wave.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: mapX(frame, swell.x),
          top: mapY(frame, swell.y),
          width: art(frame, swell.w),
          height: art(frame, height),
          borderRadius: 999,
          backgroundColor: fill,
        },
        swellStyle,
      ]}
    />
  );
}

/**
 * One leg of a shipping trail — a run of pulsing dots between two node centres.
 *
 * This replaces the board's old rotated dashed bars wholesale, and the replacement is the board's
 * own (turn 9, republished). Those bars were `transform: rotate()` about `transform-origin: 0 50%`
 * with a hand-authored `left/top/width/rotation` each, which React Native cannot express directly
 * and which — because every value was independent — let one route end in open water and two others
 * cross. A dot cannot: its position is computed from the two node centres it runs between, so the
 * geometry and the map are the same fact.
 *
 * `sc-pulse` is `scale(1 → 1.08 → 1)`, 2.6s, staggered per dot. It is the only keyframe on the old
 * board that was declared and never used; the new one uses it here.
 */
export function TrailRun({
  frame,
  dots,
  color,
  opacity,
}: {
  frame: MapFrame;
  dots: readonly TrailDot[];
  color: string;
  opacity: number;
}) {
  return (
    <>
      {dots.map((dot) => (
        <TrailBead key={`${dot.leg}-${dot.index}`} frame={frame} dot={dot} color={color} opacity={opacity} />
      ))}
    </>
  );
}

function TrailBead({
  frame,
  dot,
  color,
  opacity,
}: {
  frame: MapFrame;
  dot: TrailDot;
  color: string;
  opacity: number;
}) {
  const beat = useSharedValue(0);

  useEffect(() => {
    beat.value = withDelay(
      dot.delayMs,
      withRepeat(
        withSequence(
          withTiming(1, { duration: TRAIL.ms / 2, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: TRAIL.ms / 2, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      ),
    );
  }, [beat, dot.delayMs]);

  // Hoisted out of the worklet: a `useAnimatedStyle` body runs on the UI runtime and cannot call a
  // JS closure, and react-native-web does not enforce that, so the crash would only show on device.
  const swell = PULSE_SCALE - 1;
  const beadStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + swell * beat.value }] }));

  const size = art(frame, dot.size);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          // `dot.x`/`dot.y` are the dot's CENTRE, so the box is placed back by half its own size.
          // Mapping the centre rather than a corner is what makes the endpoint arithmetic in
          // `design-fidelity.test.ts` exact at every scale.
          left: mapX(frame, dot.x) - size / 2,
          top: mapY(frame, dot.y) - size / 2,
          width: size,
          height: size,
          borderRadius: 999,
          backgroundColor: color,
          opacity,
        },
        beadStyle,
      ]}
    />
  );
}

/** `@keyframes sc-pulse { 50% { transform: scale(1.08) } }`. */
const PULSE_SCALE = 1.08;
