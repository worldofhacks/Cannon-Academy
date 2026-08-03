/**
 * Lumen the lanternfish — the frontier's host, drawn (A-086).
 *
 * Board: `Cannon Academy Uncharted Host.dc.html`, the encounter figure at 110×96. Nine shapes,
 * the same chibi rules as the five beach hosts — head near half the body, eyes low and wide, no
 * outlines — and two hard bans off the board's red card, both pinned by the suite:
 *
 *   - The mouth ships as ONE solid ink shape with NO interior detail, ever; at this size a
 *     mouth with anything inside it reads as a maw. (The AC-1 scan holds this file to the hard
 *     form — the banned feature's name appears in no spelling at all.)
 *   - The lamp NEVER crosses the face. It hangs OUT TO THE SIDE on a rod she is visibly
 *     holding — a night watchman's pole, not an anglerfish lure (`LUMEN_FIGURE`'s numbers ARE
 *     the law: lamp right edge 22 < body left 30 < eye left 40).
 *
 * Every measurement and every color comes from `services/uncharted/encounter.ts` — the
 * node-pure transcription this file renders and the suite deep-equals. Poses swap only the
 * mouth, the driving keyframe and the stars; the lamp pulse, rod sway and fin paddling loop
 * through all five ("every variant is the same nine shapes").
 *
 * Worklet discipline (A-018's rule, applied here by choice): every `useAnimatedStyle` body
 * reads shared values and hoisted numeric constants only — no captured helper is ever called.
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

import {
  LUMEN_ANIM,
  LUMEN_FIGURE,
  LUMEN_MOUTH,
  LUMEN_POSES,
  LUMEN_STAR_POINTS,
  lumenSkin,
  type LumenPose,
} from '../../services/uncharted/encounter';
import { color } from '../../theme/tokens';
import { Blob } from '../chart/Blob';
import { Poly } from '../Poly';

// ── Hoisted for the worklets — a `useAnimatedStyle` body may read no JS closures (A-018) ──────
const BOB_RISE = LUMEN_ANIM.bob.riseY;
const LAMP_OPACITY_FROM = LUMEN_ANIM.lamp.opacityFrom;
const LAMP_OPACITY_SPAN = 1 - LUMEN_ANIM.lamp.opacityFrom;
const LAMP_SCALE_SPAN = LUMEN_ANIM.lamp.scaleTo - 1;
const ROD_BASE_DEG = LUMEN_ANIM.sway.rodBaseDeg;
const SWAY_DEG = LUMEN_ANIM.sway.deg;
const FIN_TOP_FROM = LUMEN_ANIM.finTop.fromDeg;
const FIN_TOP_SPAN = LUMEN_ANIM.finTop.toDeg - LUMEN_ANIM.finTop.fromDeg;
const FIN_BOTTOM_FROM = LUMEN_ANIM.finBottom.fromDeg;
const FIN_BOTTOM_SPAN = LUMEN_ANIM.finBottom.toDeg - LUMEN_ANIM.finBottom.fromDeg;

interface LumenFigureProps {
  readonly pose: LumenPose;
}

export function LumenFigure({ pose }: LumenFigureProps) {
  const spec = LUMEN_POSES[pose];
  const mouth = LUMEN_MOUTH[spec.mouth];
  const F = LUMEN_FIGURE;

  // The whole-figure drive: the resting bob loops; hop and shrug run once and settle (the
  // board's `ease-out both`), exactly the HostMood split the authored card uses.
  const rise = useSharedValue(0);
  const tilt = useSharedValue(0);
  useEffect(() => {
    if (spec.anim === 'hop') {
      rise.value = withSequence(
        withTiming(-LUMEN_ANIM.hop.riseY, { duration: LUMEN_ANIM.hop.ms * 0.3, easing: Easing.out(Easing.ease) }),
        withTiming(-LUMEN_ANIM.hop.midRiseY, { duration: LUMEN_ANIM.hop.ms * 0.3 }),
        withTiming(0, { duration: LUMEN_ANIM.hop.ms * 0.4 }),
      );
      tilt.value = withSequence(
        withTiming(LUMEN_ANIM.hop.tiltFromDeg, { duration: LUMEN_ANIM.hop.ms * 0.3 }),
        withTiming(LUMEN_ANIM.hop.tiltToDeg, { duration: LUMEN_ANIM.hop.ms * 0.3 }),
        withTiming(0, { duration: LUMEN_ANIM.hop.ms * 0.4 }),
      );
      return;
    }
    if (spec.anim === 'shrug') {
      rise.value = withSequence(
        withTiming(-LUMEN_ANIM.shrug.riseY, { duration: LUMEN_ANIM.shrug.ms * 0.4, easing: Easing.out(Easing.ease) }),
        withTiming(0, { duration: LUMEN_ANIM.shrug.ms * 0.6 }),
      );
      tilt.value = withSequence(
        withTiming(LUMEN_ANIM.shrug.tiltFromDeg, { duration: LUMEN_ANIM.shrug.ms * 0.4 }),
        withTiming(LUMEN_ANIM.shrug.tiltToDeg, { duration: LUMEN_ANIM.shrug.ms * 0.3 }),
        withTiming(0, { duration: LUMEN_ANIM.shrug.ms * 0.3 }),
      );
      return;
    }
    tilt.value = withTiming(0, { duration: 160 });
    rise.value = withRepeat(
      withTiming(-BOB_RISE, { duration: LUMEN_ANIM.bob.ms / 2, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [spec.anim, rise, tilt]);
  const figureStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: rise.value }, { rotate: `${tilt.value}deg` }],
  }));

  // The three ambient loops — lamp breath, rod sway, fin paddling — run in every pose.
  const lampT = useSharedValue(0);
  const swayT = useSharedValue(0);
  const finT = useSharedValue(0);
  useEffect(() => {
    lampT.value = withRepeat(
      withTiming(1, { duration: LUMEN_ANIM.lamp.ms / 2, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    swayT.value = withRepeat(
      withTiming(1, { duration: LUMEN_ANIM.sway.ms / 2, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    finT.value = withRepeat(
      withTiming(1, { duration: LUMEN_ANIM.finTop.ms / 2, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [lampT, swayT, finT]);

  const lampStyle = useAnimatedStyle(() => ({
    opacity: LAMP_OPACITY_FROM + LAMP_OPACITY_SPAN * lampT.value,
    transform: [{ scale: 1 + LAMP_SCALE_SPAN * lampT.value }],
  }));
  const rodStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${ROD_BASE_DEG + SWAY_DEG * (2 * swayT.value - 1)}deg` }],
  }));
  const finTopStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${FIN_TOP_FROM + FIN_TOP_SPAN * finT.value}deg` }],
  }));
  const finBottomStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${FIN_BOTTOM_FROM + FIN_BOTTOM_SPAN * finT.value}deg` }],
  }));

  return (
    <Animated.View style={[{ width: F.box.w, height: F.box.h }, figureStyle]} pointerEvents="none">
      {/* 8/9 — the carried lamp, OUT TO THE SIDE: glow halo (flat disc, never a blur), disc, highlight. */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: F.lamp.left - F.lamp.glow.spread,
            bottom: F.lamp.bottom - F.lamp.glow.spread,
            width: F.lamp.size + F.lamp.glow.spread * 2,
            height: F.lamp.size + F.lamp.glow.spread * 2,
            alignItems: 'center',
            justifyContent: 'center',
          },
          lampStyle,
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
            backgroundColor: color.gold,
            opacity: F.lamp.glow.opacity,
          }}
        />
        <View
          style={{
            width: F.lamp.size,
            height: F.lamp.size,
            borderRadius: 999,
            backgroundColor: color.gold,
          }}
        >
          <View
            style={{
              position: 'absolute',
              left: F.lamp.highlight.left,
              top: F.lamp.highlight.top,
              width: F.lamp.highlight.w,
              height: F.lamp.highlight.h,
              borderRadius: 999,
              backgroundColor: color.parchment,
              opacity: F.lamp.highlight.opacity,
            }}
          />
        </View>
      </Animated.View>

      {/* 9/9 — the rod she is visibly holding: pivot dot + the held pole at 32°, swaying. */}
      <View
        style={{
          position: 'absolute',
          left: F.rodTip.left,
          bottom: F.rodTip.bottom,
          width: F.rodTip.size,
          height: F.rodTip.size,
          borderRadius: 999,
          backgroundColor: lumenSkin.rod,
        }}
      />
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: F.rod.left,
            bottom: F.rod.bottom,
            width: F.rod.w,
            height: F.rod.h,
            borderRadius: F.rod.radius,
            backgroundColor: lumenSkin.rod,
          },
          rodStyle,
        ]}
      />

      {/* 3/9 — the top fin (`uh-arm-a`). */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: F.finTop.left,
            bottom: F.finTop.bottom,
            width: F.finTop.w,
            height: F.finTop.h,
            borderTopLeftRadius: 999,
            borderTopRightRadius: 999,
            backgroundColor: lumenSkin.fin,
          },
          finTopStyle,
        ]}
      />

      {/* 1/9 — the body blob: `52% 48% 46% 54%` quarter-ellipse corners, belly inset, back sheen. */}
      <Blob
        radii={F.body.radii}
        width={F.body.w}
        height={F.body.h}
        fill={lumenSkin.body}
        innerShadow={{ color: lumenSkin.bodyDeep, dy: F.body.insetDy }}
        style={{ position: 'absolute', left: F.body.left, bottom: F.body.bottom }}
      >
        <View
          style={{
            position: 'absolute',
            left: F.sheen.left,
            top: F.sheen.top,
            width: F.sheen.w,
            height: F.sheen.h,
            borderRadius: 999,
            backgroundColor: lumenSkin.sheen,
            opacity: F.sheen.opacity,
          }}
        />
      </Blob>

      {/* 2/9 — the tail. */}
      <Poly
        points={F.tail.points}
        width={F.tail.w}
        height={F.tail.h}
        fill={lumenSkin.body}
        style={{ position: 'absolute', right: F.tail.right, bottom: F.tail.bottom }}
      />

      {/* 4/9 — the bottom fin (`uh-arm-b`). */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: F.finBottom.left,
            bottom: F.finBottom.bottom,
            width: F.finBottom.w,
            height: F.finBottom.h,
            borderBottomLeftRadius: 999,
            borderBottomRightRadius: 999,
            backgroundColor: lumenSkin.fin,
          },
          finBottomStyle,
        ]}
      />

      {/* 5/9 and 6/9 — the eyes, low and wide; the pupils are the eyes' own interior. */}
      {F.eyes.lefts.map((left) => (
        <View
          key={left}
          style={{
            position: 'absolute',
            left,
            bottom: F.eyes.bottom,
            width: F.eyes.w,
            height: F.eyes.h,
            borderRadius: 999,
            backgroundColor: color.parchment,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              marginTop: F.eyes.pupil.marginTop,
              width: F.eyes.pupil.w,
              height: F.eyes.pupil.h,
              borderRadius: 999,
              backgroundColor: color.inkDark,
            }}
          />
        </View>
      ))}

      {/* 7/9 — the mouth: ONE solid ink shape, no interior detail ever (the board red card's maw rule). */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: mouth.left,
          bottom: mouth.bottom,
          width: mouth.w,
          height: mouth.h,
          backgroundColor: color.inkDark,
          ...(mouth.radius === '999px'
            ? { borderRadius: 999 }
            : { borderBottomLeftRadius: 999, borderBottomRightRadius: 999 }),
        }}
      />

      {/* The two gold stars — celebrating only; offsets and sizes off the board. */}
      {spec.stars ? (
        <>
          <Poly
            points={LUMEN_STAR_POINTS}
            width={F.stars[0].size}
            height={F.stars[0].size}
            fill={color.gold}
            style={{ position: 'absolute', left: F.stars[0].left, bottom: F.stars[0].bottom }}
          />
          <Poly
            points={LUMEN_STAR_POINTS}
            width={F.stars[1].size}
            height={F.stars[1].size}
            fill={color.gold}
            style={{ position: 'absolute', right: F.stars[1].right, bottom: F.stars[1].bottom }}
          />
        </>
      ) : null}
    </Animated.View>
  );
}
