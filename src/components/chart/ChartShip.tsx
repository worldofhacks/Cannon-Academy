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
 * The cast shadow sits OUTSIDE the bobbing view. A shadow that rises with the hull is not a
 * shadow; it is a second boat. It sits INSIDE the sailing view, because a hull that crosses the
 * map leaves its patch of shaded water with it.
 *
 * ── The sail (A-063) ───────────────────────────────────────────────────────────────────────────
 * The ship used to teleport: its berth was computed per render from the live island and a changed
 * island was simply a different constant. Now a `sail` prop names one voyage — from a departure
 * berth to this component's own `left`/`top` — and `sailProgress` runs it once, ~1800ms, along the
 * PRINTED trail's own curve: `sailPointAt` is `trailDots`' arithmetic (`board.ts:221-249`) as a
 * closed form, same interpolation, same `sin(t·π)·bow`, same alternating sign per leg.
 *
 * A worklet cannot call a JS closure (the bob's own comment below records the crash), so the curve
 * is PRE-SAMPLED here into two plain number arrays and the worklet only interpolates over them —
 * the sanctioned shape from `chart-worklet-safety.test.ts`, where this is the deliberate eighth
 * entry in the inventory.
 */
import { useEffect } from 'react';
import { Image, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { SHIP, TRAIL } from './board';
import { art, type MapFrame } from './layout';
import { chart } from './palette';
import { sprite } from '../../theme/sprites';

/** RN 0.86 removed `StyleSheet.absoluteFillObject` from its types; this is the same thing. */
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

const ROTATE = SHIP.bob.rotateDeg;

/**
 * The hull's lean while under way — arrival board beat A: *"rotate 18° along the tangent, +6° over
 * the resting bob. No bob loop while under way — a moving ship should not also be idling."* Signed
 * by direction of travel so sailing back up-chain leans the other way.
 */
export const SAIL_LEAN = 18;

/**
 * Beat A's wake: *"Three white lozenges behind the stern, each smaller and fainter: 22×7 at .8,
 * 17×6 at .5, 12×5 at .26. They scale down and slide back as the ship passes, 500ms each."*
 * Authored against the arrival board's own 52pt-wide hull box, so the sizes ride `width / 52`.
 */
export const WAKE = {
  ms: 500,
  boardShipW: 52,
  driftX: 14,
  lozenges: [
    { dx: 10, bottom: 11, w: 22, h: 7, opacity: 0.8 },
    { dx: 26, bottom: 8, w: 17, h: 6, opacity: 0.5 },
    { dx: 40, bottom: 6, w: 12, h: 5, opacity: 0.26 },
  ],
} as const;

/**
 * One sail, berth to berth. Long enough to read as a voyage, short enough that a child who tapped
 * an island is not waiting on scenery. `app/chart.tsx` times the arrival's auto-battle against it.
 */
export const SAIL_MS = 1800;

/**
 * The pre-sampling grid the worklet interpolates over — seventeen stops, because sixteen linear
 * segments hold a 26pt sine bow to within an eighth of a pixel, and because the grid must be a
 * plain captured array rather than anything computed on the UI runtime.
 */
const SAIL_SEGMENTS = 16;
export const SAIL_STOPS: readonly number[] = Array.from(
  { length: SAIL_SEGMENTS + 1 },
  (_, i) => i / SAIL_SEGMENTS,
);

/**
 * Where a sail is at progress `t` — `trailDots`' curve (`board.ts:221-249`) as a closed form.
 *
 * Same arithmetic, term for term: linear interpolation between the two points, pushed off the
 * straight line by `sin(t·π) · bow` along the perpendicular, with the bow's sign alternating per
 * leg so consecutive legs never read as one kinked line. `trailDots` evaluates this at
 * `t = i/(count+1)` to print dots; the ship evaluates it continuously to sail between them —
 * `chart-sail.test.ts` holds the two to each other dot for dot.
 *
 * Deliberately closure-free (parameters and `Math`, nothing else): the frozen test lifts this
 * declaration out of the file and executes it headless, and the component below pre-samples it
 * into the plain captured numbers a worklet is allowed to hold.
 */
export function sailPointAt(
  leg: number,
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
  bow: number,
  t: number,
): { readonly x: number; readonly y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: from.x, y: from.y };
  const px = -dy / len;
  const py = dx / len;
  const signed = leg % 2 === 0 ? bow : -bow;
  const curve = Math.sin(t * Math.PI) * signed;
  return { x: from.x + dx * t + px * curve, y: from.y + dy * t + py * curve };
}

/**
 * One voyage. A new `key` starts a new run; the SAME key never restarts one — that is the whole
 * contract, and it is what lets a re-render mid-sail pass through this component without the ship
 * snapping back to its departure berth (AC-3).
 */
export interface ChartSailRun {
  readonly key: string;
  /** The berth being left, in the same pixel space as `left`/`top` (the destination berth). */
  readonly fromLeft: number;
  readonly fromTop: number;
  /** The printed trail's own leg index — `min(fromIsle, toIsle)` — which names the bow's sign. */
  readonly leg: number;
  /** True when sailing down-chain; sailing back crosses the SAME printed bow, so `t` reverses. */
  readonly forward: boolean;
}

export function ChartShip({
  frame,
  left,
  top,
  width,
  sail,
}: {
  frame: MapFrame;
  /** Already resolved to pixels by the screen that owns the coordinate space. */
  left: number;
  top: number;
  /** The board's own sprite width in design points — 38 on the voyage map, 46 on the close chart. */
  width: number;
  /** The voyage under way (or just completed), or `null` when the ship is simply moored. */
  sail: ChartSailRun | null;
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

  // At 1 the ship sits exactly on `left`/`top`; a sail rewinds it to 0 (the departure berth) and
  // plays it forward once. Keyed on the run's identity, NOT on the progress or the geometry: the
  // same key re-rendering mid-sail must not touch the tween (AC-3).
  const sailProgress = useSharedValue(1);
  const sailKey = sail === null ? null : sail.key;
  useEffect(() => {
    if (sailKey === null) return;
    sailProgress.value = 0;
    sailProgress.value = withTiming(1, { duration: SAIL_MS, easing: Easing.inOut(Easing.quad) });
  }, [sailKey, sailProgress]);

  // Hoisted out of the worklet. `art()` is a JS closure and a `useAnimatedStyle` body runs on the
  // UI runtime, where calling one crashes the first frame — invisibly to react-native-web.
  const rise = art(frame, SHIP.bob.riseY);
  // A-065 beat A: while under way the hull LEANS and does not bob; at rest it bobs and does not
  // lean. `settle` blends the two over the sail's last 8% so the arrival reads as the ship easing
  // back into its idle — "the ship settles into its bob (stillness hands attention over)".
  const lean = sail === null || sail.forward ? SAIL_LEAN : -SAIL_LEAN;
  const bobStyle = useAnimatedStyle(() => {
    const p = sailProgress.value;
    const settle = p >= 1 ? 1 : p <= 0.92 ? 0 : (p - 0.92) / 0.08;
    const rest = -ROTATE + 2 * ROTATE * bob.value;
    return {
      transform: [
        { translateY: -rise * bob.value * settle },
        { rotate: `${lean * (1 - settle) + rest * settle}deg` },
      ],
    };
  });

  // The curve, pre-sampled into plain captured numbers — the worklet may hold arrays of numbers
  // and call Reanimated's own `interpolate`, and nothing else. The endpoints are canonicalised to
  // catalog order (a → b, lower isle first) because that is the direction the printed leg is
  // drawn in; sailing back up-chain runs the SAME bow with `t` reversed, so the ship retraces the
  // printed trail instead of mirroring it across the straight line.
  const xs: number[] = [];
  const ys: number[] = [];
  if (sail === null) {
    for (let i = 0; i < SAIL_STOPS.length; i += 1) {
      xs.push(0);
      ys.push(0);
    }
  } else {
    const a = sail.forward ? { x: sail.fromLeft, y: sail.fromTop } : { x: left, y: top };
    const b = sail.forward ? { x: left, y: top } : { x: sail.fromLeft, y: sail.fromTop };
    const bow = art(frame, TRAIL.bow);
    for (const stop of SAIL_STOPS) {
      const point = sailPointAt(sail.leg, a, b, bow, sail.forward ? stop : 1 - stop);
      xs.push(point.x - left);
      ys.push(point.y - top);
    }
  }
  const sailStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(sailProgress.value, SAIL_STOPS, xs) },
      { translateY: interpolate(sailProgress.value, SAIL_STOPS, ys) },
    ],
  }));

  // The wake's shared clock. It loops for pennies; each lozenge's own worklet gates its opacity on
  // `sailProgress < 1`, so at rest the wake simply is not there (beat A ships no idle spray).
  const wakePhase = useSharedValue(0);
  useEffect(() => {
    wakePhase.value = withRepeat(
      withTiming(1, { duration: WAKE.ms, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
  }, [wakePhase]);

  const wakeRatio = w / WAKE.boardShipW;
  const forward = sail === null || sail.forward;

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left, top, width: w, height: h }, sailStyle]}>
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
      {/* Behind the stern, INSIDE the sailing view — the wake travels with the hull, like the
          shadow, and mirrors when the ship sails back up-chain. */}
      {WAKE.lozenges.map((loz) => (
        <WakeLozenge
          key={loz.dx}
          left={forward ? -loz.dx * wakeRatio : w + loz.dx * wakeRatio - loz.w * wakeRatio}
          bottom={loz.bottom * wakeRatio}
          width={loz.w * wakeRatio}
          height={loz.h * wakeRatio}
          base={loz.opacity}
          drift={(forward ? -WAKE.driftX : WAKE.driftX) * wakeRatio}
          phase={wakePhase}
          sailProgress={sailProgress}
        />
      ))}
      <Animated.View style={[FILL, bobStyle]}>
        <Image source={sprite.ship01} style={{ width: w, height: h }} resizeMode="contain" />
      </Animated.View>
    </Animated.View>
  );
}

/** One white wake lozenge — `ar-wake`: scale 1 → .4, slide back, fade, 500ms, while under way. */
function WakeLozenge({
  left,
  bottom,
  width,
  height,
  base,
  drift,
  phase,
  sailProgress,
}: {
  left: number;
  bottom: number;
  width: number;
  height: number;
  base: number;
  drift: number;
  phase: SharedValue<number>;
  sailProgress: SharedValue<number>;
}) {
  const wakeStyle = useAnimatedStyle(() => {
    const t = phase.value;
    const underway = sailProgress.value < 1 ? 1 : 0;
    return {
      opacity: underway * base * (1 - t),
      transform: [{ translateX: drift * t }, { scale: 1 - 0.6 * t }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left, bottom, width, height, borderRadius: 999, backgroundColor: chart.white },
        wakeStyle,
      ]}
    />
  );
}
