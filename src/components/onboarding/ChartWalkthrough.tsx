/**
 * Beats 17–20 — the chart walkthrough, taught on the real chart.
 *
 * ## Why this is an overlay and not a screen
 *
 * Board rule SHOW REAL: *"Beats 17–19 spotlight the actual chart, the actual dock, the actual
 * header pills. Nothing is explained on an illustration a child will never see again — the thing
 * they learn on is the thing they will use."* A sixth destination would also cost a route file, and
 * `demo-navigation.test.ts` AC-1 asserts `app/`'s contents against an exact ten-file list.
 *
 * ## The integration contract
 *
 * One line, as the last child of the chart's screen `View`:
 *
 *     <ChartWalkthrough />
 *
 * No props, and no import from `app/chart.tsx` in either direction. Everything it needs it gets
 * from state the chart also reads (`useCaptain`) or derives for itself:
 *
 *  - it renders `null` the moment `hasCompletedOnboarding` is true, so the chart needs no branch;
 *  - it measures its own box with `onLayout` and re-derives the hub geometry from
 *    `chartHubControlLayout`, the same pure model the chart passes to its dock and header — so the
 *    rings land on the real controls without either file knowing the other's layout;
 *  - it advances and completes through the captain store directly.
 *
 * The measured box is the right coordinate space and the global viewport is not. An absolutely
 * positioned child is laid out against its parent's *padding* box, and the chart's screen `View`
 * carries `paddingTop: insets.top` — so this overlay's own `(0,0)` is exactly where the hub model's
 * `(0,0)` is, and both its header band and its dock band land where the chart actually drew them.
 * Feeding the model the window height instead would put every dock ring one safe-area inset low.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoachBar } from './CoachBar';
import { Spotlight } from './Spotlight';
import { chartTourBandHeight, ringRect } from './coachBand';
import {
  READY,
  READY_MOTION,
  readySailDelay,
  readySceneLayout,
  type ReadySceneLayout,
} from './readyLayout';
import { CHART_BEATS, clampChartBeat, readyHeadline } from './script';
// The dock's own measured height — the tour's band sits directly on top of it — and the chart's
// own water, so the send-off hands over to a sea the child is about to be dropped into.
import { DOCK, VOYAGE } from '../chart/board';
import { SeaWater } from '../chart/Sea';
import { Ship, type ShipCosmetics } from '../duel/Ship';
import { chartHubControlLayout, type HubControl } from '../../services/flow';
import { chartTourShowing } from '../../services/onboarding';
import { captainActions, useCaptain } from '../../stores/useCaptain';
import { REFERENCE } from '../../theme/responsive';
import { shipCosmeticsForCaptain } from '../../theme/shipCosmetics';
import { color, radius, type } from '../../theme/tokens';
import { useLayout } from '../../theme/useLayout';

/**
 * The height the chart must set aside for the coach bar during beats 17-19, or `0` once the tour is
 * over.
 *
 * This is the whole fix. The bar used to be painted into an `absoluteFill` overlay, which drew the
 * board's ink without the board's *layout*: on the board the bar is a flex sibling taking 92pt, so
 * the world body is `667 - 20 status - 92 coach = 555` and the map is COMPRESSED. Ours covered the
 * map instead, and what it covered was the fogged island's name pill and its requirement chip.
 *
 * Reserving the band is enough on its own. `closeChartColumns` already clamps every node column
 * against the live map box, so a box that genuinely got shorter lifts the labels by itself — there
 * is deliberately no second clamp here, and adding one would fight the chart's own model.
 *
 * The safe-area inset is folded in because the reserved band is the LAST thing in the column, so it
 * is what has to hold the home indicator. The chart hands `ChartDock` a zero inset while this is
 * non-zero, so the inset is paid once rather than twice.
 */
export function useChartTourBand(): number {
  const L = useLayout();
  const insets = useSafeAreaInsets();
  const captain = useCaptain((s) => s.captain);

  // Not `hasCompletedOnboarding` alone: a replay is a captain who HAS completed it, deliberately
  // walking the same four beats again, and the band has to come back for them or the coach bar
  // paints over the chart it is explaining. See `chartTourShowing`.
  if (!chartTourShowing(captain)) return 0;
  const beat = CHART_BEATS[clampChartBeat(captain.onboardingBeat)];
  // Beat 20 is a full-bleed takeover with no bar of its own, so it reserves nothing.
  if (beat === undefined || beat.id === 'done') return 0;
  return chartTourBandHeight({
    art: L.a,
    type: L.t,
    hasSub: beat.coach.sub !== '',
    build: 'standard',
    insetBottom: insets.bottom,
    hasSkip: false,
  });
}

export function ChartWalkthrough() {
  const L = useLayout();
  const insets = useSafeAreaInsets();
  const captain = useCaptain((s) => s.captain);
  const [box, setBox] = useState({ w: 0, h: 0 });

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: nextW, height: nextH } = e.nativeEvent.layout;
    setBox((prev) => (prev.w === nextW && prev.h === nextH ? prev : { w: nextW, h: nextH }));
  }, []);

  const beatIndex = clampChartBeat(captain.onboardingBeat);
  const advance = useCallback(() => {
    captainActions().setOnboardingBeat(clampChartBeat(captainActions().captain.onboardingBeat) + 1);
  }, []);

  // ── Every hook has run. Conditional returns are legal from here down (A-047). ──

  if (!chartTourShowing(captain)) return null;

  const beat = CHART_BEATS[beatIndex] ?? CHART_BEATS[0];
  if (beat === undefined) return null;

  // The chart under this is still perfectly usable while the box is unmeasured — one frame with no
  // ring is better than a ring drawn at (0,0) and then jumping.
  const measured = box.w > 0 && box.h > 0;
  // The FULL measured height, deliberately — not `box.h - reserved`.
  //
  // The reserved coach band sits ABOVE the dock, and the map is the flex child, so reserving it
  // shortens the MAP and leaves the dock exactly where it was. Trimming the model's frame by the
  // band therefore lifted every modelled dock control by ~150pt, which is how beat 18's ring ended
  // up drawing a box around open water in the bottom-right corner.
  //
  // (It was correct while the band sat below the dock, which is what it was written against. Moving
  // the band is what invalidated it — a good reminder that a correction term is only as true as the
  // layout it was measured in.)
  const controls = measured ? chartHubControlLayout({ width: box.w, height: box.h }).controls : [];

  if (beat.id === 'done') {
    return (
      <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
        <ReadyScene
          captainName={captain.name}
          // The captain's OWN ship — the equipped skin's palette flying the flag they chose at
          // beat 4. This is the one moment in the app where "this is *your* ship" lands hardest,
          // and a generic boat here spends it (board 5b).
          cosmetics={shipCosmeticsForCaptain(captain)}
          cannons={captain.ownedCannons.length}
          islands={captain.unlockedIslands.length}
          ships={captain.ownedSkins.length}
          coins={captain.coins}
          box={box}
          artScale={L.a(1)}
          typeScale={L.t(1)}
          insetTop={insets.top}
          insetBottom={insets.bottom}
          onSail={() => captainActions().completeOnboarding()}
        />
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={onLayout}>
      {/*
        Rule NEVER BLOCK: *"a tutorial that refuses a tap teaches a child that the screen is
        broken; one that accepts every tap teaches that the screen is safe."* So the whole frame
        advances, rather than only the ringed control — and the ringed control is not armed, because
        a child who taps Fight on beat 18 must not be dropped into a duel mid-sentence.
      */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={advance}
        accessibilityRole="button"
        accessibilityLabel={`${beat.coach.line} Tap to continue.`}
      />

      {controls
        .filter((control) => (beat.spotlights as readonly string[]).includes(control.id))
        .map((control) => (
          <Spotlight
            key={control.id}
            rect={ringRect(control, insets)}
            cornerRadius={ringRadiusFor(control)}
            hand={beat.spotlights.length === 1}
          />
        ))}

      {/*
        Anchored to the top of the DOCK, because the chart now reserves the tour's band above the
        dock rather than below it — the dock is the footer, and a band beneath it left the dock
        stranded mid-screen over open water.

        `dockHeight` is the same arithmetic the chart lays the dock out with (`DOCK.height` at the
        art scale, plus the home indicator it now owns again), so the bar lands exactly in the
        reserved gap. It paints after the tap catcher, which is what keeps the speaker button
        reachable while every other tap advances the beat.
      */}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: L.a(DOCK.height) + insets.bottom }}
      >
        <CoachBar coach={beat.coach} outerBackground="transparent" insetBottom={0} />
      </View>
    </View>
  );
}

/**
 * The grown-up's skip, drawn into the row the chart reserved for it.
 *
 * Quiet on purpose: an 11pt pill in the corner of a band a child has no reason to look at, worded
 * for the adult holding the phone. The ink stays small and the TARGET is the whole 64pt row — the
 * same ink-versus-target split the chart's own header pills document, and the only way to honour
 * the board's "10px affordance" without breaking the floor.
 *
 * `hitSlop` is deliberately not used here, and that is a measurement rather than a preference: slop
 * spent upward would steal advancing taps from the dock band, and slop spent downward is dead —
 * the coach bar is painted after this row, so its speaker owns those points whatever this view
 * claims. Every point of a target has to be somewhere nothing else is listening.
 *
 * It sits ABOVE the coach bar rather than beside it because the bar is measured to the point: its
 * height is what the chart reserved, and a control tucked inside it would either squeeze the line
 * or overhang the band.
 */
/**
 * The dock buttons are cards and the header controls are pills, so a single radius would ring one
 * of them wrong. Matched to the surface rather than to the id, so a control that moves band keeps
 * the right ring.
 */
function ringRadiusFor(control: HubControl): number {
  return control.surface === 'dock' ? 22 : radius.pill;
}
/**
 * Beat 20 — the send-off, and the moment the game is handed over.
 *
 * `Sail!` is `completeOnboarding()` and nothing else. On the board it is wired to the prototype's
 * `restart`, which resets `state.i` to zero — that is canvas navigation for a designer stepping the
 * frame, not a product behaviour. Implementing it literally would drop a child who has just
 * finished the tour back onto beat one, forever.
 *
 * `completeOnboarding()` is called from exactly here and nowhere else in the app; before this beat
 * existed the action had no caller outside two test fixtures.
 *
 * ## What it is made of, and why none of it is drawn here
 *
 * Nothing on this screen is a one-off. The ship is `duel/Ship.tsx` — the app's real 14-layer rig,
 * hull and sheer stripe and keel and striped sails and the child's own pennant — wearing
 * `shipCosmeticsForCaptain`, so the boat that sails out of onboarding is the boat that sails into
 * every duel. The water is `chart/Sea.tsx`'s `SeaWater`, so the send-off's horizon is the chart's
 * own radial gradient rather than a flat band of `sea`, and the handover reads as one place. The
 * sky and its clouds are `duel/SeaStage.tsx`'s, at the same tokens.
 *
 * There *was* a `ReadyShip` here: a seven-shape boat with a plain parchment sail and no keel,
 * transcribed from the board's own simplified thumbnail. It is deleted. A composition drawn once
 * for one screen is exactly what makes that screen look unlike the app around it, and the owner
 * reported it in those words.
 *
 * ## Filling the box
 *
 * Every offset this screen used to position itself with — `bottom: 186`, `bottom: 120`, `top: 96`,
 * a `150`pt sea — was a constant about a 667pt frame. The layout is now a FLEX COLUMN whose bands
 * come from `readySceneLayout`, which is pure and swept across four viewports by
 * `ready-scene.test.ts`. The only absolutely positioned things left are the backdrop — sky, clouds
 * and water — because a backdrop is not a band.
 */
function ReadyScene({
  captainName,
  cosmetics,
  cannons,
  islands,
  ships,
  coins,
  box,
  artScale,
  typeScale,
  insetTop,
  insetBottom,
  onSail,
}: {
  readonly captainName: string;
  /** Resolved by the caller, so this component reads no store and stays a pure renderer. */
  readonly cosmetics: ShipCosmetics;
  readonly cannons: number;
  readonly islands: number;
  readonly ships: number;
  readonly coins: number;
  readonly box: { readonly w: number; readonly h: number };
  readonly artScale: number;
  readonly typeScale: number;
  readonly insetTop: number;
  readonly insetBottom: number;
  readonly onSail: () => void;
}) {
  const tx = (n: number) => n * typeScale;

  // Before the first layout pass the overlay has no box, and a full-bleed takeover that renders
  // blank for a frame is worse than one drawn at the board's own frame and corrected a frame later.
  // `app/chart.tsx` falls back to `FRAME` for exactly this reason.
  const layout = readySceneLayout({
    width: box.w || REFERENCE.width,
    height: box.h || REFERENCE.height,
    art: artScale,
    type: typeScale,
    insetTop,
    insetBottom,
  });

  const tally: readonly { readonly label: string; readonly count: number }[] = [
    { label: 'GUNS', count: cannons },
    { label: 'ISLES', count: islands },
    { label: 'SHIPS', count: ships },
    { label: 'COINS', count: coins },
  ];

  return (
    <View style={s.done}>
      <ReadySky layout={layout} art={artScale} />

      {/*
        The water, flush to the bottom and topped exactly where the hull meets it — `layout.sea.y`
        is derived from the ship's own keel, which is what stops the boat floating above its sea the
        way the board's offsets did.
      */}
      <View
        style={[
          s.doneSea,
          { top: layout.sea.y, borderTopWidth: artScale * SEA_CREST },
        ]}
      >
        <SeaWater
          width={layout.sea.width}
          height={Math.max(0, layout.sea.height - artScale * SEA_CREST)}
          water={VOYAGE.water}
        />
      </View>

      {/*
        The column. Every height below comes from `readySceneLayout`, and they sum to the measured
        box by construction — see that module's header.
      */}
      <View style={s.doneColumn}>
        <View style={{ height: insetTop + layout.topPad }} />

        <Text
          numberOfLines={READY.headlineLines}
          style={[
            s.doneHeadline,
            {
              width: layout.headline.width,
              height: layout.headline.height,
              fontSize: tx(26),
              lineHeight: tx(READY.headlineLine),
            },
          ]}
        >
          {readyHeadline(captainName)}
        </Text>

        <View style={{ height: layout.skyGap }} />

        {/*
          The arrival. One beat, `motion.beat.screen`: the ship rises a swell's worth and fades in,
          and then it is `Ship.tsx`'s own ambient bob, luff and wake from there.

          The captain is aboard and cheering, which is the same figure the guided duel put on the
          deck four beats ago — the send-off is a curtain call, not an introduction.
        */}
        <ShipArrival height={layout.ship.height} rise={artScale * READY_MOTION.shipRise}>
          <Ship cosmetics={cosmetics} facing="right" width={layout.ship.width} captainPose="cheer" />
        </ShipArrival>

        <View style={{ height: layout.seaGap }} />

        <View style={[s.doneBadges, { height: layout.badges.height, gap: layout.badgeGap }]}>
          {tally.map((entry, index) => (
            <Pop
              key={entry.label}
              delay={READY_MOTION.badgeLead + index * READY_MOTION.badgeStagger}
            >
              <ReadyBadge
                count={entry.count}
                label={entry.label}
                size={layout.badge}
                artScale={artScale}
                typeScale={typeScale}
              />
            </Pop>
          ))}
        </View>

        <View style={{ height: layout.badgesToSail }} />

        {/* Last to settle, so the final movement on the screen is the one that says "now go". */}
        <Settle delay={readySailDelay}>
          <Pressable
            onPress={onSail}
            accessibilityRole="button"
            accessibilityLabel="Sail, finish the tour"
            style={({ pressed }) => [
              s.sail,
              {
                width: layout.sail.width,
                height: layout.sail.height,
                borderRadius: artScale * 22,
                borderBottomWidth: artScale * 6,
              },
              pressed && { transform: [{ translateY: artScale * 4 }], borderBottomWidth: artScale * 2 },
            ]}
          >
            <Text style={[s.sailLabel, { fontSize: tx(24), lineHeight: tx(30) }]}>Sail!</Text>
          </Pressable>
        </Settle>

        <View style={{ height: layout.bottomPad + insetBottom }} />
      </View>
    </View>
  );
}

/** The foam line where sky meets water, in design points — `SeaStage`'s own crest. */
const SEA_CREST = 5;

/**
 * The sky's three clouds, at `SeaStage`'s tokens and opacities.
 *
 * Placed as fractions of the resolved sky gap rather than at fixed tops, so they drift down a tall
 * phone with the horizon instead of clustering under the headline. Skipped entirely when the gap is
 * too shallow to hold them — on a short viewport the sky is the band that gave up its air, and a
 * cloud pressed against the headline is worse than no cloud.
 */
function ReadySky({ layout, art }: { readonly layout: ReadySceneLayout; readonly art: number }) {
  if (layout.skyGap < art * 72) return null;

  const top = layout.headline.y + layout.headline.height;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={[
          s.cloud,
          {
            left: art * 18,
            top: top + layout.skyGap * 0.2,
            width: art * 74,
            height: art * 18,
            opacity: 0.85,
          },
        ]}
      />
      <View
        style={[
          s.cloud,
          {
            left: art * 46,
            top: top + layout.skyGap * 0.1,
            width: art * 44,
            height: art * 15,
            opacity: 0.85,
          },
        ]}
      />
      <View
        style={[
          s.cloud,
          {
            right: art * 22,
            top: top + layout.skyGap * 0.44,
            width: art * 56,
            height: art * 15,
            opacity: 0.7,
          },
        ]}
      />
    </View>
  );
}

/**
 * The ship's arrival — `motion.beat.screen`, once.
 *
 * `rise` and `height` are hoisted out of the worklet on purpose: a `useAnimatedStyle` body runs on
 * the UI runtime and cannot synchronously call a JS closure, and react-native-web does not enforce
 * that, so the crash would only ever show on a device (`Sea.tsx` documents the same trap).
 */
function ShipArrival({
  height,
  rise,
  children,
}: {
  readonly height: number;
  readonly rise: number;
  readonly children: ReactNode;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withTiming(1, { duration: READY_MOTION.shipArrive, easing: Easing.out(Easing.quad) });
  }, [t]);

  const travel = rise;
  const style = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: travel * (1 - t.value) }],
  }));

  return <Animated.View style={[{ height, alignSelf: 'center' }, style]}>{children}</Animated.View>;
}

/**
 * The Harbor's `hr-pop`, unchanged: 220ms, `.72 → 1.04 → 1`.
 *
 * The same curve the purchase reveal uses, because a child meeting it here and again on their first
 * skin should recognise it — the app's motion vocabulary is small on purpose.
 */
function Pop({ delay, children }: { readonly delay: number; readonly children: ReactNode }) {
  const t = useSharedValue(0.72);

  useEffect(() => {
    t.value = withDelay(
      delay,
      withSequence(
        withTiming(1.04, { duration: READY_MOTION.pop.up, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: READY_MOTION.pop.settle, easing: Easing.out(Easing.quad) }),
      ),
    );
  }, [t, delay]);

  // `.72` is also the "not yet" value, so the element is invisible until its own delay elapses
  // rather than sitting on screen at three-quarter size waiting its turn.
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.8 ? 0 : 1,
    transform: [{ scale: t.value }],
  }));

  return <Animated.View style={[{ alignSelf: 'center' }, style]}>{children}</Animated.View>;
}

/**
 * The `Sail!` button's arrival — `hr-pop`'s curve with the fade deliberately removed.
 *
 * This is the app's only caller of `completeOnboarding()`, and `Pop` hides its subject until its
 * delay elapses. A button that is not drawn is a child with no way out of onboarding, and a stalled
 * animation makes that permanent — a backgrounded tab throttling `requestAnimationFrame` is enough,
 * and it reproduced on web. So this one never touches opacity: it is on screen and tappable from
 * the first frame at `READY_MOTION.settleFrom`, and the delayed beat settles the last 8%.
 *
 * The reason to spend a whole component on the difference rather than a boolean is that the
 * difference is a safety property, not a style — see `readyLayout.ts`'s note on `settleFrom`.
 */
function Settle({ delay, children }: { readonly delay: number; readonly children: ReactNode }) {
  const t = useSharedValue<number>(READY_MOTION.settleFrom);

  useEffect(() => {
    t.value = withDelay(
      delay,
      withSequence(
        withTiming(1.04, { duration: READY_MOTION.pop.up, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: READY_MOTION.pop.settle, easing: Easing.out(Easing.quad) }),
      ),
    );
  }, [t, delay]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: t.value }] }));

  return <Animated.View style={[{ alignSelf: 'center' }, style]}>{children}</Animated.View>;
}

/**
 * The board's four 56pt tiles. Its counts are drawn literals (`1 / 1 / 1 / 0`); ours are read off
 * the captain, because a tally screen that says "1 gun" to a child holding two is the first thing
 * the game tells them that is not true.
 *
 * `size` is the resolved tile from `readySceneLayout` rather than a scale multiplied here, so the
 * row the model measured and the row the screen draws are the same row.
 */
function ReadyBadge({
  count,
  label,
  size,
  artScale,
  typeScale,
}: {
  readonly count: number;
  readonly label: string;
  readonly size: number;
  readonly artScale: number;
  readonly typeScale: number;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${count} ${label.toLowerCase()}`}
      style={[
        s.badge,
        {
          width: size,
          height: size,
          borderRadius: artScale * 18,
          borderBottomWidth: artScale * 3,
        },
      ]}
    >
      <Text style={[s.badgeCount, { fontSize: typeScale * 20, lineHeight: typeScale * 24 }]}>
        {count}
      </Text>
      <Text style={[s.badgeLabel, { fontSize: typeScale * 9, lineHeight: typeScale * 12 }]}>
        {label}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  skipTarget: { justifyContent: 'center' },
  /** The coach slab's own pair — `parchment` on `inkDark` — so the pill certifies itself rather
      than depending on whatever the chart happens to paint behind the reserved band. */
  skipPill: { backgroundColor: color.inkDark, alignItems: 'center', justifyContent: 'center' },
  skipLabel: { fontFamily: type.body.fontFamily, color: color.parchment },

  /**
   * The sky, at `SeaStage`'s own token rather than the board's `seaFoam`.
   *
   * The board paints the whole send-off `#43B4E0` and stands the headline on it at 6.25 — legal,
   * but it is the SEA's colour, so a screen whose entire point is a boat on water had the same
   * blue above and below the horizon. `skyTop` is what every duel's sky is, and it carries
   * `inkDark` at 10.9.
   */
  done: { flex: 1, backgroundColor: color.skyTop, overflow: 'hidden' },
  doneSea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // A ground under the gradient, so a frame drawn before the SVG lands is water and not sky.
    backgroundColor: color.sea,
    borderTopColor: color.foam,
    overflow: 'hidden',
  },
  cloud: { position: 'absolute', borderRadius: radius.pill, backgroundColor: color.white },
  doneColumn: { flex: 1 },
  doneHeadline: {
    fontFamily: type.display.fontFamily,
    color: color.inkDark,
    textAlign: 'center',
    alignSelf: 'center',
  },
  doneBadges: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center' },
  badge: {
    backgroundColor: color.parchment,
    borderBottomColor: '#C9AE7E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCount: { fontFamily: type.display.fontFamily, color: color.inkDark },
  badgeLabel: { fontFamily: type.chip.fontFamily, color: color.inkDarkMuted },
  sail: {
    backgroundColor: color.amber,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomColor: color.goldDeep,
  },
  sailLabel: { fontFamily: type.display.fontFamily, color: color.inkDark },
});
