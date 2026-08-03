/**
 * The arrival ceremony — fog lift, banner, and the spyglass iris (A-065).
 *
 * Source: `Cannon Academy Arrival.dc.html` (Claude Design project 88888c12). Four beats over the
 * existing 1.8s sail, then a handoff into the duel. The story a pre-reader reads is three things in
 * order: the ship moves, the island wakes up, the banner arrives. Nothing else on the chart moves
 * during the ceremony.
 *
 * ── Who owns what ──────────────────────────────────────────────────────────────────────────────
 * `app/chart.tsx` owns the STATE MACHINE — `ceremonyAdvance`/`ceremonyHoldMs` there are pure and
 * closure-free so `chart-sail.test.ts` lifts and drives them headless. This file owns the DRAWING:
 * every beat's one-shot animation, keyed on the `beat` prop the chart hands down. The timings and
 * geometry here are exported constants so the same suite asserts them directly.
 *
 * ── One glow per beat (the board's amber card, and AC-3) ───────────────────────────────────────
 * During SAILING the ship is the only lit thing and the destination marker is slate. During FOG
 * LIFT the marker takes the glow and the ship stops bobbing. During BANNER the banner is the newest
 * thing on screen but carries no ring — its gold spine is enough — and the dock's Fight button
 * takes the only gold ring, because that is the next tap. Never two rings. The `ringing` gate in
 * `CeremonyMarker` is the enforcement point and the frozen spec pins it by name.
 *
 * ── Worklet discipline (AC-6) ──────────────────────────────────────────────────────────────────
 * Every `useAnimatedStyle` below is inventoried by name in `chart-worklet-safety.test.ts`, and no
 * callback body calls a JavaScript closure — pixel values are hoisted to plain captured numbers,
 * exactly as `ChartShip.tsx` documents the crash that rule prevents.
 */
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { IslandId } from '@content/schemas';

import { RING, TRAIL_LOOK, type Isle } from './board';
import { art, mapX, mapY, type MapFrame } from './layout';
import { chart } from './palette';
import type { MarkerLook } from './Station';
import { font } from '../../theme/tokens';

/** The six stops of one arrival, in board order. `app/chart.tsx` walks them; this file draws them. */
export type ArrivalBeat = 'sailing' | 'fog-lift' | 'banner' | 'encounter' | 'iris' | 'battle';

/**
 * The board's beat boundaries, verbatim: sailing ends at 1800 (`SAIL_MS`), fog lift runs
 * 1800→3080, the banner 3080→4600, and the handoff closes the iris over 600ms with the banner's
 * tuck leading it by 80ms. `ceremonyHoldMs` (app/chart.tsx) turns these into the timer chain.
 */
export const CEREMONY = {
  /** Beat B — fog lift, board `1800 → 3080ms`. */
  fogLiftMs: 1280,
  /** Beat C — banner in + dwell, board `3080 → 4600ms`. The tuck belongs to the handoff. */
  bannerMs: 1520,
  /** Beat D — `translateX −30px + scale .86 + fade, 320ms ease-in, starting 80ms before the iris`. */
  tuckLeadMs: 80,
  tuckMs: 320,
  /** Beat D — `clip-path circle 140% → 0% at 50% 46%, 600ms cubic-bezier(.4,0,.7,1)`. */
  irisMs: 600,
} as const;

/**
 * The banner's frame geometry — board beat C: `left 12, right 66, top 96. Never overlaps header
 * (26–78), ship, or dock.` The 96 is the REFERENCE placement; `bannerTopPx` (app/chart.tsx) clamps
 * it against the live berth, because a contain-fitted map compresses art faster than type and on a
 * 320pt-class phone the board's own 96 would graze the resting hull (AC-2).
 */
export const BANNER = {
  top: 96,
  left: 12,
  right: 66,
  padX: 14,
  padY: 12,
  radius: 18,
  /** `box-shadow: 0 5px 0 #C9AE7E` — the parchment plank shadow, drawn as a bottom border. */
  shadowDy: 5,
  /** The gold spine: `left 0; top/bottom 14; width 5; radius 0 3 3 0` — the banner's only gold. */
  spineW: 5,
  spineInsetY: 14,
  /** Island glyph plate left and the 44pt speaker slot right — the non-reader's two handles. */
  plate: 44,
  plateRadius: 14,
  nameSize: 20,
  copySize: 13,
  /** In 380ms with a slight overshoot (`70% { translateX(4px) }`), out via the handoff's tuck. */
  inMs: 380,
  overshootPx: 4,
  tuckDx: 30,
  tuckScale: 0.86,
  /** Minimum daylight kept between the banner and the header above / the berth below. */
  clearGap: 4,
} as const;

/** What the grown-up reads aloud — board beat C, verbatim. */
export const BANNER_COPY = 'New waters, Captain!';

/**
 * Beat B's three overlapping steps, board timings: fog parts 0–420ms, colour floods 300–780ms,
 * marker pops 480–860ms with its spark ring 480–1100ms — all inside the 1280ms fog lift.
 */
export const FOG_LIFT = {
  partMs: 420,
  partDx: 26,
  floodDelayMs: 300,
  floodMs: 480,
  /** `clip-path circle 6% → 150%` — RN has no clip-path; an expanding circular mask is sanctioned. */
  floodFromPct: 0.06,
  floodToPct: 1.5,
  popDelayMs: 480,
  /** `380ms cubic-bezier(.2,1.4,.4,1)` — the overshoot IS the easing, not a keyframe. */
  popMs: 380,
  popDropY: 16,
  sparkMs: 620,
  sparkFrom: 0.4,
  sparkTo: 2.2,
} as const;

/** The spyglass: aperture at `50% 46%`, brass rim tracking the edge, chrome fading to 35%. */
export const IRIS_LOOK = {
  cx: 0.5,
  cy: 0.46,
  /** `circle(140%)` — CSS resolves the percentage against `hypot(w, h) / √2`. */
  startPct: 1.4,
  rim: 6,
  innerGlow: 4,
  chromeFade: 0.35,
} as const;

/**
 * Header/dock opacity for the handoff — board beat D: `Header and dock fade to 35% as the iris
 * starts — they are not part of the place you are entering.` The chart applies the returned style
 * to both chrome bands; the worklet lives here so the inventory suite can see it.
 *
 * Declared before any component on purpose (`hook-order.test.ts` attributes hooks to the last
 * capitalised function above them — the same reason `Fog.tsx` leads with `useDrift`).
 */
export function useCeremonyChrome(beat: ArrivalBeat | null) {
  const dim = useSharedValue(0);

  useEffect(() => {
    dim.value = withTiming(beat === 'iris' ? 1 : 0, {
      duration: 240,
      easing: Easing.inOut(Easing.quad),
    });
  }, [beat, dim]);

  // `fadeSpan` is a number captured by value; nothing in the body calls a JS closure.
  const fadeSpan = 1 - IRIS_LOOK.chromeFade;
  const chromeStyle = useAnimatedStyle(() => ({ opacity: 1 - fadeSpan * dim.value }));
  return chromeStyle;
}

/** One trail dot's overlay: where it sits (px), and how far along the sail it lights (0–1). */
export interface GlowDotSpec {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

/**
 * One dot of the lighting trail — beat A: `cream .45 → perfect gold at full opacity with an 8px
 * glow, and grow 6→7px. Each lights as the hull reaches it` — lit behind, never ahead, because
 * `lit` compares the shared sail progress against this dot's own `t`.
 */
function GlowDot({
  x,
  y,
  size,
  t,
  progress,
}: {
  x: number;
  y: number;
  size: number;
  t: number;
  progress: SharedValue<number>;
}) {
  // Hoisted: the worklet may hold plain numbers and strings, and call nothing but intrinsics.
  const grow = 7 / 6 - 1;
  const cream = chart.parchment;
  const gold = chart.gold;
  const glowDotStyle = useAnimatedStyle(() => {
    const lit = Math.min(1, Math.max(0, (progress.value - t) * 24));
    return {
      opacity: 0.45 + 0.55 * lit,
      backgroundColor: interpolateColor(lit, [0, 1], [cream, gold]),
      shadowOpacity: 0.55 * lit,
      transform: [{ scale: 1 + grow * lit }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: x - size / 2,
          top: y - size / 2,
          width: size,
          height: size,
          borderRadius: 999,
          shadowColor: chart.gold,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 0 },
        },
        glowDotStyle,
      ]}
    />
  );
}

/** The whole lit trail for the leg being sailed. Stays mounted — and gold — for the ceremony. */
export function CeremonyTrailGlow({
  frame,
  dots,
  progress,
}: {
  frame: MapFrame;
  dots: readonly GlowDotSpec[];
  progress: SharedValue<number>;
}) {
  const size = art(frame, TRAIL_LOOK.sailed.size);
  return (
    <>
      {dots.map((dot) => (
        <GlowDot key={`${dot.x}-${dot.y}`} x={dot.x} y={dot.y} size={size} t={dot.t} progress={progress} />
      ))}
    </>
  );
}

/**
 * The colour flood — fog-lift step 2. RN has no `clip-path`, so the open island is drawn again
 * inside a circular `overflow: hidden` view whose disc expands from the island centre; the child
 * counter-translates so the copy never moves, only the reveal does. One animated value drives both
 * styles, which is the board's own "it is also one animatable property" rationale kept honest.
 */
export function FloodReveal({
  frame,
  isle,
  children,
}: {
  frame: MapFrame;
  isle: Isle;
  children: ReactNode;
}) {
  const flood = useSharedValue(0);

  useEffect(() => {
    flood.value = 0;
    flood.value = withDelay(
      FOG_LIFT.floodDelayMs,
      withTiming(1, { duration: FOG_LIFT.floodMs, easing: Easing.out(Easing.quad) }),
    );
  }, [flood]);

  const left = mapX(frame, isle.x);
  const top = mapY(frame, isle.y);
  const w = art(frame, isle.w);
  const h = art(frame, isle.h);
  // The board's `circle(6% at 50% 60%)`: centre low on the island, radii against its half-diagonal.
  const cx = left + w / 2;
  const cy = top + h * 0.6;
  const ref = Math.hypot(w, h) / 2;
  const r0 = ref * FOG_LIFT.floodFromPct;
  const r1 = ref * FOG_LIFT.floodToPct;

  const floodClipStyle = useAnimatedStyle(() => {
    const r = r0 + (r1 - r0) * flood.value;
    return { left: cx - r, top: cy - r, width: 2 * r, height: 2 * r };
  });
  const floodArtStyle = useAnimatedStyle(() => {
    const r = r0 + (r1 - r0) * flood.value;
    return { left: r - cx, top: r - cy };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', borderRadius: 999, overflow: 'hidden' }, floodClipStyle]}
    >
      <Animated.View
        style={[{ position: 'absolute', width: frame.width, height: frame.height }, floodArtStyle]}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}

/** The standing 1.8s pulse — `Station.tsx`'s own `sc-ring`, on the ceremony's marker. */
function CeremonyPulse({ size }: { size: number }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: RING.ms, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
  }, [pulse]);

  const from = RING.from;
  const span = RING.to - RING.from;
  const opacityFrom = RING.opacityFrom;
  const ringStyle = useAnimatedStyle(() => ({
    opacity: opacityFrom * (1 - pulse.value),
    transform: [{ scale: from + span * pulse.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: size,
          height: size,
          borderRadius: 999,
          backgroundColor: chart.live,
        },
        ringStyle,
      ]}
    />
  );
}

/**
 * The arrival island's marker for the WHOLE ceremony — `VoyageMap` swaps the real `StationMarker`
 * out for this so beat discipline is enforceable: slate while sailing (destination stays asleep),
 * gold pop + spark + standing pulse during the fog lift, and gold WITHOUT any ring from the banner
 * beat on, when the Fight button holds the only glow. Deliberately not tappable: mid-ceremony the
 * one tap that means anything is the skip.
 */
export function CeremonyMarker({
  beat,
  glyph,
  name,
  look,
  typeScale,
  position,
}: {
  beat: ArrivalBeat;
  glyph: string;
  name: string;
  look: MarkerLook;
  typeScale: number;
  position: ViewStyle;
}) {
  const pop = useSharedValue(0);
  const spark = useSharedValue(0);

  useEffect(() => {
    if (beat === 'sailing') {
      pop.value = 0;
      spark.value = 0;
      return;
    }
    if (beat === 'fog-lift') {
      pop.value = 0;
      spark.value = 0;
      pop.value = withDelay(
        FOG_LIFT.popDelayMs,
        withTiming(1, { duration: FOG_LIFT.popMs, easing: Easing.bezier(0.2, 1.4, 0.4, 1) }),
      );
      spark.value = withDelay(
        FOG_LIFT.popDelayMs,
        withTiming(1, { duration: FOG_LIFT.sparkMs, easing: Easing.out(Easing.quad) }),
      );
      return;
    }
    // Banner onward: the pop has landed. Snapping to 1 makes a skip and a replay both idempotent.
    pop.value = 1;
    spark.value = 1;
  }, [beat, pop, spark]);

  const dropY = FOG_LIFT.popDropY;
  const popStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 2.5),
    transform: [
      { translateY: -dropY * (1 - Math.min(pop.value, 1)) },
      { scale: 0.4 + 0.6 * pop.value },
    ],
  }));

  const sparkFrom = FOG_LIFT.sparkFrom;
  const sparkSpan = FOG_LIFT.sparkTo - FOG_LIFT.sparkFrom;
  const sparkStyle = useAnimatedStyle(() => ({
    opacity: 0.9 * (1 - spark.value),
    transform: [{ scale: sparkFrom + sparkSpan * spark.value }],
  }));

  const box: ViewStyle = { position: 'absolute', alignItems: 'center', gap: look.gap, ...position };
  const chipSize = look.chip.size * typeScale;

  if (beat === 'sailing') {
    // Beat A: the destination is still asleep — slate disc, translucent chip, exactly as a locked
    // node draws, so the one bright thing on the map is the ship.
    return (
      <View pointerEvents="none" style={box}>
        <View style={{ width: look.locked.size, height: look.locked.size }}>
          <View
            style={{
              position: 'absolute',
              top: look.locked.shadowDy,
              width: look.locked.size,
              height: look.locked.size,
              borderRadius: 999,
              backgroundColor: chart.lockedShadow,
            }}
          />
          <View
            style={{
              width: look.locked.size,
              height: look.locked.size,
              borderRadius: 999,
              backgroundColor: chart.locked,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: font.displayBold,
                fontSize: look.locked.glyphSize * typeScale,
                lineHeight: look.locked.glyphSize * typeScale * 1.15,
                color: chart.ink,
              }}
            >
              {glyph}
            </Text>
          </View>
        </View>
        <View
          style={{
            paddingHorizontal: look.chip.padX * typeScale,
            paddingVertical: look.chip.padY * typeScale,
            borderRadius: 999,
            backgroundColor: chart.lockedChip,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              fontFamily: font.displayBold,
              fontSize: chipSize,
              lineHeight: chipSize * 1.3,
              color: chart.parchment,
            }}
          >
            {name}
          </Text>
        </View>
      </View>
    );
  }

  // One glow per beat: the standing pulse and the spark belong to the fog lift ALONE — from the
  // banner beat on, the Fight button carries the only ring (the amber card's law, and AC-3).
  const ringing = beat === 'fog-lift';
  const ring = look.live.ring;
  const disc = look.live.disc;
  const inset = look.live.discInset;
  const liveChip = look.liveChipSize * typeScale;

  return (
    <View pointerEvents="none" style={box}>
      <Animated.View style={[{ width: ring, height: ring }, popStyle]}>
        {ringing ? <CeremonyPulse size={ring} /> : null}
        <View style={{ position: 'absolute', left: inset, top: inset, width: disc, height: disc }}>
          <View
            style={{
              position: 'absolute',
              top: look.live.shadowDy,
              width: disc,
              height: disc,
              borderRadius: 999,
              backgroundColor: chart.liveShadow,
            }}
          />
          <View
            style={{
              width: disc,
              height: disc,
              borderRadius: 999,
              backgroundColor: chart.live,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: font.displayBold,
                fontSize: look.live.glyphSize * typeScale,
                lineHeight: look.live.glyphSize * typeScale * 1.15,
                color: chart.ink,
              }}
            >
              {glyph}
            </Text>
          </View>
        </View>
        {ringing ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: 0,
                top: 0,
                width: ring,
                height: ring,
                borderRadius: 999,
                backgroundColor: chart.gold,
              },
              sparkStyle,
            ]}
          />
        ) : null}
      </Animated.View>
      <View
        style={{
          paddingHorizontal: look.chip.padX * typeScale,
          paddingVertical: look.chip.padY * typeScale,
          borderRadius: 999,
          backgroundColor: chart.darkChip,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            fontFamily: font.displayBold,
            fontSize: liveChip,
            lineHeight: liveChip * 1.3,
            color: chart.parchment,
          }}
        >
          {name}
        </Text>
      </View>
    </View>
  );
}

/** The board's speaker mark, at plate scale — a box, a cone and two arcs in the banner's muted ink. */
function SpeakerMark({ size }: { size: number }) {
  const u = size / 22;
  return (
    <View style={{ width: 22 * u, height: 16 * u }}>
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 3 * u,
          width: 6 * u,
          height: 10 * u,
          backgroundColor: chart.inkMuted,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 5 * u,
          top: 0,
          width: 9 * u,
          height: 16 * u,
          backgroundColor: chart.inkMuted,
          borderTopRightRadius: 3 * u,
          borderBottomRightRadius: 3 * u,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: 3 * u,
          top: 2 * u,
          width: 5 * u,
          height: 5 * u,
          borderRightWidth: 2 * u,
          borderColor: chart.inkMuted,
          borderTopRightRadius: 999,
          borderBottomRightRadius: 999,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: 0,
          top: 5 * u,
          width: 6 * u,
          height: 7 * u,
          borderRightWidth: 2 * u,
          borderColor: chart.inkMuted,
          borderTopRightRadius: 999,
          borderBottomRightRadius: 999,
        }}
      />
    </View>
  );
}

/**
 * The parchment banner — beat C. Slides in from the left edge with the board's own two-keyframe
 * overshoot, dwells, and tucks back out when the beat moves on (naturally or by skip). Gold spine,
 * NO ring — the banner announces, the Fight button invites.
 */
function CeremonyBanner({
  beat,
  glyph,
  name,
  typeScale,
  top,
  screenW,
}: {
  beat: ArrivalBeat;
  glyph: string;
  name: string;
  typeScale: number;
  top: number;
  screenW: number;
}) {
  const slide = useSharedValue(-screenW);
  const tuck = useSharedValue(0);
  const tucking = beat !== 'banner';

  useEffect(() => {
    // `ar-banner`: −110% → +4px at 70% → 0 — the overshoot is the board's own middle keyframe.
    slide.value = -screenW;
    slide.value = withSequence(
      withTiming(BANNER.overshootPx * typeScale, {
        duration: BANNER.inMs * 0.7,
        easing: Easing.out(Easing.quad),
      }),
      withTiming(0, { duration: BANNER.inMs * 0.3, easing: Easing.inOut(Easing.quad) }),
    );
    // Mount-only on purpose: the banner mounts when its beat begins, and a re-render mid-dwell
    // must not replay the entrance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide]);

  useEffect(() => {
    if (!tucking) return;
    tuck.value = withTiming(1, { duration: CEREMONY.tuckMs, easing: Easing.in(Easing.quad) });
  }, [tucking, tuck]);

  const tuckDx = BANNER.tuckDx * typeScale;
  const tuckShrink = 1 - BANNER.tuckScale;
  const bannerStyle = useAnimatedStyle(() => ({
    opacity: 1 - tuck.value,
    transform: [
      { translateX: slide.value - tuckDx * tuck.value },
      { scale: 1 - tuckShrink * tuck.value },
    ],
  }));

  const t = typeScale;
  const nameSize = BANNER.nameSize * t;
  const copySize = BANNER.copySize * t;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: BANNER.left * t, right: BANNER.right * t, top },
        bannerStyle,
      ]}
    >
      <View
        style={{
          borderRadius: BANNER.radius * t,
          backgroundColor: chart.parchment,
          borderBottomWidth: BANNER.shadowDy * t,
          borderBottomColor: chart.parchmentShadow,
          paddingHorizontal: BANNER.padX * t,
          paddingVertical: BANNER.padY * t,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10 * t,
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: BANNER.spineInsetY * t,
            bottom: BANNER.spineInsetY * t,
            width: BANNER.spineW * t,
            borderTopRightRadius: 3 * t,
            borderBottomRightRadius: 3 * t,
            backgroundColor: chart.live,
          }}
        />
        <View
          style={{
            width: BANNER.plate * t,
            height: BANNER.plate * t,
            borderRadius: BANNER.plateRadius * t,
            backgroundColor: chart.chevronWell,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: font.displayBold,
              fontSize: 22 * t,
              lineHeight: 22 * t * 1.15,
              color: chart.ink,
            }}
          >
            {glyph}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: font.displayBold,
              fontSize: nameSize,
              lineHeight: nameSize * 1.25,
              color: chart.ink,
            }}
          >
            {name}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: font.bodySemi,
              fontSize: copySize,
              lineHeight: copySize * 1.3,
              color: chart.inkMuted,
              marginTop: 2 * t,
            }}
          >
            {BANNER_COPY}
          </Text>
        </View>
        <View
          style={{
            width: BANNER.plate * t,
            height: BANNER.plate * t,
            borderRadius: BANNER.plateRadius * t,
            backgroundColor: chart.chevronWell,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <SpeakerMark size={22 * t} />
        </View>
      </View>
    </Animated.View>
  );
}

/**
 * The spyglass iris — beat D. One dark surround with a circular aperture: in RN the huge-border
 * circle view is the standard trick, so the scene stays visible THROUGH the hole and the aperture
 * is the only animated value. The brass rim is a second circle tracking the same value, with the
 * board's faint cream inner ring as its static child.
 */
function SpyglassIris({ width, height }: { width: number; height: number }) {
  const iris = useSharedValue(0);

  useEffect(() => {
    iris.value = 0;
    iris.value = withDelay(
      CEREMONY.tuckLeadMs,
      withTiming(1, { duration: CEREMONY.irisMs, easing: Easing.bezier(0.4, 0, 0.7, 1) }),
    );
  }, [iris]);

  const cx = width * IRIS_LOOK.cx;
  const cy = height * IRIS_LOOK.cy;
  const r0 = (Math.hypot(width, height) / Math.SQRT2) * IRIS_LOOK.startPct;

  const apertureStyle = useAnimatedStyle(() => ({ borderWidth: r0 * iris.value }));
  const rim = IRIS_LOOK.rim;
  const rimStyle = useAnimatedStyle(() => {
    const r = r0 * (1 - iris.value) + rim;
    return { left: cx - r, top: cy - r, width: 2 * r, height: 2 * r };
  });

  return (
    <View
      style={{ position: 'absolute', left: 0, top: 0, width, height, overflow: 'hidden' }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: cx - r0,
            top: cy - r0,
            width: 2 * r0,
            height: 2 * r0,
            borderRadius: r0,
            borderColor: chart.darkChip,
          },
          apertureStyle,
        ]}
      />
      <Animated.View
        style={[
          { position: 'absolute', borderRadius: 999, borderWidth: rim, borderColor: chart.parchmentShadow },
          rimStyle,
        ]}
      >
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            borderRadius: 999,
            borderWidth: IRIS_LOOK.innerGlow,
            borderColor: 'rgba(255, 246, 228, 0.28)',
          }}
        />
      </Animated.View>
    </View>
  );
}

/** A-066's public contract: `EncounterCard({ islandId, onDone })`, self-contained. */
export type EncounterComponent = ComponentType<{
  readonly islandId: IslandId;
  readonly onDone: () => void;
}>;

/**
 * A-066 builds `src/components/encounter/**` in the same wave, so the card is loaded defensively:
 * the require runs only when an unseen encounter actually mounts (it is guarded by the
 * `seenEncounters` latch upstream), and a build where the card is not on disk yet resolves to
 * `null` and the slot passes straight through to the iris instead of crashing or hanging.
 */
function loadEncounterCard(): EncounterComponent | null {
  try {
    const mod = require('../encounter/EncounterCard') as { EncounterCard?: EncounterComponent };
    return typeof mod.EncounterCard === 'function' ? mod.EncounterCard : null;
  } catch {
    return null;
  }
}

/** The encounter slot — between banner-out and iris, and only for a first landing (AC-5). */
function EncounterSlot({ islandId, onDone }: { islandId: IslandId; onDone: () => void }) {
  const [Card] = useState<EncounterComponent | null>(loadEncounterCard);

  useEffect(() => {
    if (Card === null) onDone();
  }, [Card, onDone]);

  if (Card === null) return null;
  return <Card islandId={islandId} onDone={onDone} />;
}

/**
 * The ceremony's screen-space layer: banner, encounter slot, iris, and the skip surface. The map
 * beats (trail glow, fog part, flood, marker) render inside `VoyageMap`, in map space; this overlay
 * only exists from the banner beat on.
 */
export function ArrivalCeremonyOverlay({
  beat,
  islandId,
  islandName,
  glyph,
  typeScale,
  width,
  height,
  bannerTop,
  onSkip,
  onEncounterDone,
}: {
  beat: ArrivalBeat;
  islandId: IslandId;
  islandName: string;
  glyph: string;
  typeScale: number;
  width: number;
  height: number;
  /** Pre-clamped by `bannerTopPx` in the chart, which knows the live berth (AC-2). */
  bannerTop: number;
  onSkip: () => void;
  onEncounterDone: () => void;
}) {
  if (beat === 'sailing' || beat === 'fog-lift' || beat === 'battle') return null;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, top: 0, width, height }}>
      <CeremonyBanner
        beat={beat}
        glyph={glyph}
        name={islandName}
        typeScale={typeScale}
        top={bannerTop}
        screenW={width}
      />
      {beat === 'encounter' ? <EncounterSlot islandId={islandId} onDone={onEncounterDone} /> : null}
      {beat === 'iris' ? <SpyglassIris width={width} height={height} /> : null}
      {beat === 'banner' ? (
        // Beat C's own dwell card: "Tapping anywhere skips to the handoff." One surface, the whole
        // screen, so a five-year-old cannot miss it (AC-4).
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Continue"
          onPress={onSkip}
          style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
        />
      ) : null}
    </View>
  );
}
