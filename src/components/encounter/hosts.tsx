/**
 * The five island hosts — one chibi creature per island, drawn to the board's roster recipes.
 *
 * Source: `Cannon Academy Island Encounter.dc.html`, the roster column. Same chibi rules as the
 * captain: head near half the body, eyes low and wide, no outlines — and *"each is a different
 * animal so a child can tell which island they are on without reading its name"*. Which creature
 * appears is keyed by island id through `HOSTS` in `encounterBoard.ts`; this file only knows how
 * to draw them.
 *
 * Every offset below is the board's own `left`/`right`/`bottom` pair inside the host's box
 * (crab 58×44, parrot 46×52, turtle 64×40, octopus 50×50, gull 54×44), kept in `bottom`-anchored
 * form because RN's absolute positioning supports it directly. Shape budgets are the roster's
 * own annotations, recorded in `HOSTS[...].shapeBudget`.
 *
 * Every colour is a token. The crab and turtle hexes are A-066's own additions
 * (`crabShell`/`crabShellDeep`, `turtleShell`/`turtleShellDeep`); the octopus IS the kraken's
 * pink pair, the parrot is `success`/`successDeep` under a `sailStripe` bandana (the board's own
 * red — a costume, never a feedback colour), and the gull is parchment and `inkBright`. No raw
 * hex appears in this file, and the encounter test pins that.
 */
import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { IslandId } from '@content/schemas';

import { color } from '../../theme/tokens';
import { BOB, CLAW, HOSTS, type HostSpecies } from './encounterBoard';

/** Each species' drawn box, off the roster recipes. */
export const HOST_ART: Record<HostSpecies, { readonly w: number; readonly h: number }> = {
  crab: { w: 58, h: 44 },
  parrot: { w: 46, h: 52 },
  turtle: { w: 64, h: 40 },
  octopus: { w: 50, h: 50 },
  gull: { w: 54, h: 44 },
};

/**
 * A chibi eye: white round, dark pupil sitting LOW in it (the chibi rule). The gull skips the
 * white and keeps bare dark dots, per its recipe.
 */
function Eye({ x, bottom, w, h, right }: { x?: number; bottom: number; w: number; h: number; right?: number }) {
  const box: ViewStyle = {
    position: 'absolute',
    bottom,
    width: w,
    height: h,
    borderRadius: 999,
    backgroundColor: color.parchment,
    alignItems: 'center',
  };
  if (right !== undefined) box.right = right;
  else box.left = x ?? 0;
  return (
    <View style={box}>
      <View
        style={{
          marginTop: 2,
          width: Math.round(w * 0.55),
          height: Math.round(h * 0.6),
          borderRadius: 999,
          backgroundColor: color.inkDark,
        }}
      />
    </View>
  );
}

/** One crab claw, running the board's `ie-claw` wave (−8° → 10°, 1.6s, right claw 300ms late). */
function Claw({ side }: { side: 'left' | 'right' }) {
  const wave = useSharedValue(0);
  useEffect(() => {
    wave.value = withDelay(
      side === 'right' ? CLAW.staggerMs : 0,
      withRepeat(
        withSequence(
          withTiming(1, { duration: CLAW.ms / 2, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: CLAW.ms / 2, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      ),
    );
  }, [wave, side]);
  const swing = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${CLAW.fromDeg + (CLAW.toDeg - CLAW.fromDeg) * wave.value}deg` },
    ],
  }));

  const base: ViewStyle =
    side === 'left'
      ? { left: 0, borderTopLeftRadius: 999, borderBottomLeftRadius: 999, borderBottomRightRadius: 999 }
      : { right: 0, borderTopRightRadius: 999, borderBottomLeftRadius: 999, borderBottomRightRadius: 999 };

  return (
    <Animated.View
      style={[
        { position: 'absolute', bottom: 17, width: 16, height: 13, backgroundColor: color.crabShell },
        base,
        swing,
      ]}
    />
  );
}

/** Nipper — body, two waving claws, two eyes (the 5-shape budget), and the small ink smile. */
function CrabFigure() {
  return (
    <View style={{ width: HOST_ART.crab.w, height: HOST_ART.crab.h }}>
      <View style={[s.abs, { left: 6, bottom: 0, width: 46, height: 27, backgroundColor: color.crabShell, borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, borderBottomWidth: 5, borderBottomColor: color.crabShellDeep }]} />
      <Claw side="left" />
      <Claw side="right" />
      <Eye x={15} bottom={20} w={11} h={11} />
      <Eye right={15} bottom={20} w={11} h={11} />
      <View style={[s.abs, { left: 24, bottom: 12, width: 10, height: 5, backgroundColor: color.inkDark, borderBottomLeftRadius: 999, borderBottomRightRadius: 999 }]} />
    </View>
  );
}

/** Pip — body, head, beak, wing, bandana (the 6-shape budget) with the low wide eyes. */
function ParrotFigure() {
  return (
    <View style={{ width: HOST_ART.parrot.w, height: HOST_ART.parrot.h }}>
      <View style={[s.abs, { left: 8, bottom: 0, width: 26, height: 30, backgroundColor: color.success, borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomLeftRadius: 10, borderBottomRightRadius: 10 }]} />
      <View style={[s.abs, { left: 6, bottom: 24, width: 28, height: 26, borderRadius: 999, backgroundColor: color.success }]} />
      <Eye x={12} bottom={34} w={9} h={10} />
      <Eye x={24} bottom={34} w={9} h={10} />
      <View style={[s.abs, { left: 30, bottom: 28, width: 11, height: 9, backgroundColor: color.amber, borderTopLeftRadius: 2, borderBottomLeftRadius: 2, borderTopRightRadius: 999, borderBottomRightRadius: 999 }]} />
      <View style={[s.abs, { left: 0, bottom: 8, width: 14, height: 18, backgroundColor: color.successDeep, borderTopLeftRadius: 999, borderBottomLeftRadius: 999 }]} />
      {/* The bandana — board-recipe red, a costume rather than a verdict (see file header). */}
      <View style={[s.abs, { left: 14, bottom: 44, width: 14, height: 8, borderRadius: 999, backgroundColor: color.sailStripe, transform: [{ rotate: '-22deg' }] }]} />
    </View>
  );
}

/** Tumble — shell, two scutes, head, two flippers (the 6-shape budget). */
function TurtleFigure() {
  return (
    <View style={{ width: HOST_ART.turtle.w, height: HOST_ART.turtle.h }}>
      <View style={[s.abs, { left: 10, bottom: 0, width: 44, height: 26, backgroundColor: color.turtleShell, borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, borderBottomWidth: 5, borderBottomColor: color.turtleShellDeep }]} />
      <View style={[s.abs, { left: 18, bottom: 8, width: 12, height: 10, borderRadius: 4, backgroundColor: color.ghostGlow }]} />
      <View style={[s.abs, { left: 32, bottom: 8, width: 12, height: 10, borderRadius: 4, backgroundColor: color.ghostGlow }]} />
      <View style={[s.abs, { right: 0, bottom: 2, width: 22, height: 20, borderRadius: 999, backgroundColor: color.islandGrass }]} />
      <Eye right={12} bottom={12} w={8} h={9} />
      <Eye right={1} bottom={12} w={8} h={9} />
      <View style={[s.abs, { left: 2, bottom: 0, width: 12, height: 7, backgroundColor: color.islandGrass, borderTopLeftRadius: 999, borderBottomLeftRadius: 999 }]} />
    </View>
  );
}

/** Ollie — head, two eyes, three arms (the 6-shape budget), pink over deep-pink. */
function OctopusFigure() {
  return (
    <View style={{ width: HOST_ART.octopus.w, height: HOST_ART.octopus.h }}>
      <View style={[s.abs, { left: 6, bottom: 14, width: 38, height: 34, backgroundColor: color.krakenPink, borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, overflow: 'hidden' }]}>
        {/* The recipe's `inset -6px 0` side shade, as a strip the head clips. */}
        <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, backgroundColor: color.krakenDeep, opacity: 0.28 }} />
      </View>
      <Eye x={12} bottom={32} w={10} h={11} />
      <Eye right={12} bottom={32} w={10} h={11} />
      <View style={[s.abs, { left: 20, bottom: 26, width: 10, height: 5, backgroundColor: color.inkDark, borderBottomLeftRadius: 999, borderBottomRightRadius: 999 }]} />
      <View style={[s.abs, { left: 2, bottom: 0, width: 12, height: 18, backgroundColor: color.krakenPink, borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: 11, borderBottomRightRadius: 11 }]} />
      <View style={[s.abs, { left: 18, bottom: 0, width: 12, height: 16, backgroundColor: color.krakenDeep, borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: 10, borderBottomRightRadius: 10 }]} />
      <View style={[s.abs, { right: 2, bottom: 0, width: 12, height: 18, backgroundColor: color.krakenPink, borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: 11, borderBottomRightRadius: 11 }]} />
    </View>
  );
}

/** Gale — body, head, beak, wing (the 5-shape budget), the eyes bare dark dots per the recipe. */
function GullFigure() {
  return (
    <View style={{ width: HOST_ART.gull.w, height: HOST_ART.gull.h }}>
      <View style={[s.abs, { left: 10, bottom: 0, width: 32, height: 26, backgroundColor: color.parchment, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, borderBottomWidth: 5, borderBottomColor: color.parchmentEdge }]} />
      <View style={[s.abs, { left: 14, bottom: 20, width: 24, height: 22, borderRadius: 999, backgroundColor: color.white }]} />
      <View style={[s.abs, { left: 18, bottom: 28, width: 8, height: 9, borderRadius: 999, backgroundColor: color.inkDark }]} />
      <View style={[s.abs, { left: 29, bottom: 28, width: 8, height: 9, borderRadius: 999, backgroundColor: color.inkDark }]} />
      <View style={[s.abs, { left: 34, bottom: 22, width: 12, height: 7, backgroundColor: color.amber, borderTopLeftRadius: 2, borderBottomLeftRadius: 2, borderTopRightRadius: 999, borderBottomRightRadius: 999 }]} />
      <View style={[s.abs, { left: 0, bottom: 10, width: 16, height: 12, backgroundColor: color.inkBright, borderTopLeftRadius: 999, borderBottomLeftRadius: 999 }]} />
    </View>
  );
}

/**
 * The host for an island, idling on its own `ie-bob` — each species at the roster's own period,
 * −4pt at the midpoint, forever. Hop and shrug belong to the CARD (they are answers to a tap,
 * not idle states), which wraps this in its own mood view.
 */
export function HostFigure({ islandId }: { islandId: IslandId }) {
  const spec = HOSTS[islandId];
  const bob = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(
      withSequence(
        withTiming(-BOB.riseY, { duration: spec.bobMs / 2, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: spec.bobMs / 2, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
  }, [bob, spec.bobMs]);
  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));

  return (
    <Animated.View style={bobStyle} accessibilityLabel={spec.name}>
      {spec.species === 'crab' ? <CrabFigure /> : null}
      {spec.species === 'parrot' ? <ParrotFigure /> : null}
      {spec.species === 'turtle' ? <TurtleFigure /> : null}
      {spec.species === 'octopus' ? <OctopusFigure /> : null}
      {spec.species === 'gull' ? <GullFigure /> : null}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  abs: { position: 'absolute' },
});
