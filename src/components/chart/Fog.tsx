/**
 * The fog — weather, on both screens, and never a blanked-out region.
 *
 * The fog is the promise that there is more map (`services/chart.ts` says the same thing about the
 * data), so the closed islands sit ON it: visible, named, and unreachable. Board 9a: *"Everything
 * unearned is under fog, but nothing is invisible… because anticipation is the whole point of a
 * map."*
 *
 * Two shapes, one keyframe. `sc-drift` moves both `translateX(0 → 14px → 0)`; the voyage map's
 * per-island circles run it on their own 7s/8s/9s periods so no two banks breathe together, and the
 * close chart's wash runs it at 8s.
 *
 * ── Why nothing here is a painted rectangle ────────────────────────────────────────────────────
 * `chart-progress-presentation.test.ts` AC-3 rejects any positioned `View` in this file that has
 * both extents and an opaque background, and rejects an opaque SVG `Rect`. That guard is not a
 * technicality — it is the memory of a version of this screen that covered the bottom third of the
 * sea with a flat grey box and called it weather. So the island fog is a `Blob` (an irregular SVG
 * silhouette) and the close chart's wash is an SVG `LinearGradient` whose top stop is fully
 * transparent: a fog that starts at nothing and thickens is the opposite of the shape the guard is
 * there to stop, and it is drawn on a `Path` rather than a `Rect` for exactly that reason.
 */
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { Blob } from './Blob';
import { FOG_BAND, type CornerPercents } from './board';
import { art, mapX, mapY, type BoardSlack, type MapFrame } from './layout';
import { chart } from './palette';

/**
 * `sc-drift`, shared by every fog shape on the chart.
 *
 * Declared before any component in this file on purpose: `hook-order.test.ts` attributes a hook to
 * the last capitalised `function` above it, and a lowercase helper does not reset that attribution.
 */
function useDrift(travel: number, ms: number) {
  const drift = useSharedValue(0);

  useEffect(() => {
    drift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: ms / 2, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: ms / 2, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [drift, ms]);

  // `travel` is a number captured by value. Nothing in the body below calls a JS closure — a
  // `useAnimatedStyle` runs on the UI runtime and cannot, and the crash would only show on a device.
  const driftStyle = useAnimatedStyle(() => ({ transform: [{ translateX: travel * drift.value }] }));
  return driftStyle;
}

/** A circle of `#C9D6E4` a little wider than the island it hides. `inset: -16px -14px`. */
const ISLE_FOG_BLEED = { x: 16, y: 14 } as const;
const CIRCLE: CornerPercents = [50, 50, 50, 50];

export function IsleFog({
  frame,
  isle,
  fog,
}: {
  frame: MapFrame;
  isle: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  fog: { readonly opacity: number; readonly ms: number };
}) {
  const driftStyle = useDrift(art(frame, FOG_BAND.driftX), fog.ms);
  const bleedX = art(frame, ISLE_FOG_BLEED.x);
  const bleedY = art(frame, ISLE_FOG_BLEED.y);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: mapX(frame, isle.x) - bleedX,
          top: mapY(frame, isle.y) - bleedY,
        },
        driftStyle,
      ]}
    >
      <Blob
        radii={CIRCLE}
        width={art(frame, isle.w) + bleedX * 2}
        height={art(frame, isle.h) + bleedY * 2}
        fill={chart.fog}
        opacity={fog.opacity}
      />
    </Animated.View>
  );
}

/** `border-radius: 50% 0 0 50%` — the left half-disc; mirrored for the right. */
const HALF_LEFT: CornerPercents = [50, 0, 0, 50];
const HALF_RIGHT: CornerPercents = [0, 50, 50, 0];

/**
 * One half of the parting fog disc — arrival board, fog-lift step 1: *"The single fog disc becomes
 * two half-discs that slide apart left and right. Splitting rather than fading is what makes it
 * read as curtains opening."* `420ms ease-out · translateX ±26px + fade`.
 */
function PartingHalf({
  left,
  top,
  width,
  height,
  radii,
  dx,
  ms,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  radii: CornerPercents;
  dx: number;
  ms: number;
}) {
  const part = useSharedValue(0);

  useEffect(() => {
    part.value = withTiming(1, { duration: ms, easing: Easing.out(Easing.quad) });
  }, [part, ms]);

  // `dx` is a number captured by value — the worklet calls nothing (see `useDrift` above).
  const partStyle = useAnimatedStyle(() => ({
    opacity: 0.9 * (1 - part.value),
    transform: [{ translateX: dx * part.value }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left, top }, partStyle]}>
      <Blob radii={radii} width={width} height={height} fill={chart.fog} opacity={1} />
    </Animated.View>
  );
}

/**
 * The fog lift's opening move (A-065 beat B): the island's whole fog circle, re-drawn as two
 * halves sliding apart. Mounted by `VoyageMap` for exactly the fog-lift beat — the standing
 * `IsleFog` above renders every OTHER fogged island untouched, and by the time these halves have
 * faded the beat still owns the screen, so nothing pops back.
 */
export function IsleFogParting({
  frame,
  isle,
  splitDx,
  ms,
}: {
  frame: MapFrame;
  isle: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  /** ±26 board px — `FOG_LIFT.partDx`, handed down so the timing table stays in one file. */
  splitDx: number;
  ms: number;
}) {
  const bleedX = art(frame, ISLE_FOG_BLEED.x);
  const bleedY = art(frame, ISLE_FOG_BLEED.y);
  const left = mapX(frame, isle.x) - bleedX;
  const top = mapY(frame, isle.y) - bleedY;
  const w = art(frame, isle.w) + bleedX * 2;
  const h = art(frame, isle.h) + bleedY * 2;
  // The board's halves overlap the split line a little (78 of 148), so no seam shows at frame one.
  const halfW = w * 0.53;
  const dx = art(frame, splitDx);

  return (
    <>
      <PartingHalf left={left} top={top} width={halfW} height={h} radii={HALF_LEFT} dx={-dx} ms={ms} />
      <PartingHalf
        left={left + w - halfW}
        top={top}
        width={halfW}
        height={h}
        radii={HALF_RIGHT}
        dx={dx}
        ms={ms}
      />
    </>
  );
}

/**
 * The close chart's fog bank: two soft banks, a gradient wash, and whatever node sits in it.
 *
 * The board authors the band at `height: 108; overflow: hidden` and clips its own requirement chip
 * — the one chip that says why the fog is there (owner ruling 10). `board.ts` explains why the band
 * is not what needed fixing: the board lays its locked node out around a 64pt TARGET box, and a
 * target is `hitSlop`, not layout. Drawn at the picture's own size the group is 96.5pt and the
 * board's measured 108 holds it, so every number here is the board's.
 */
export function FogBand({
  frame,
  slack,
  height,
  children,
}: {
  frame: MapFrame;
  /** The composition's gutters. The weather is the one map element that bleeds past them. */
  slack: BoardSlack;
  /** From `closeChartColumns` — the board's 108, unless this band's own node needs more. */
  height: number;
  children?: ReactNode;
}) {
  const driftStyle = useDrift(art(frame, FOG_BAND.driftX), FOG_BAND.driftMs);
  const bleed = art(frame, FOG_BAND.washBleedX);
  const washWidth = frame.width + slack.x * 2 + bleed * 2;

  return (
    // The band bleeds out to the measured box on both sides. Everything else in the composition
    // letterboxes, but the dock it meets does not — leaving the weather short of the screen edge
    // would put two wedges of open sea in the bottom corners of a tablet, under the fog.
    <View
      style={{
        position: 'absolute',
        left: -slack.x,
        right: -slack.x,
        bottom: 0,
        height,
        overflow: 'hidden',
      }}
    >
      {FOG_BAND.banks.map((bank, i) => (
        <Blob
          key={i}
          radii={bank.radii}
          width={art(frame, bank.w)}
          height={art(frame, bank.h)}
          fill={chart.fogBank}
          opacity={bank.opacity}
          style={{
            position: 'absolute',
            left: bank.x === undefined ? undefined : art(frame, bank.x),
            right: bank.right === undefined ? undefined : art(frame, bank.right),
            bottom: art(frame, bank.bottom),
          }}
        />
      ))}

      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', left: -bleed, top: 0 }, driftStyle]}
      >
        <Svg width={washWidth} height={height} viewBox="0 0 100 100" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="chart-fog-wash" x1="0" y1="0" x2="0" y2="1">
              {FOG_BAND.wash.map((stop) => (
                <Stop
                  key={stop.offset}
                  offset={`${stop.offset * 100}%`}
                  stopColor={chart.fog}
                  stopOpacity={stop.opacity}
                />
              ))}
            </LinearGradient>
          </Defs>
          <Path d="M0 0 H100 V100 H0 Z" fill="url(#chart-fog-wash)" />
        </Svg>
      </Animated.View>

      {children}
    </View>
  );
}
