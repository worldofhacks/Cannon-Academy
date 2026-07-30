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
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoachBar } from './CoachBar';
import { Spotlight } from './Spotlight';
import { chartTourBandHeight, ringRect, TOUR_SKIP_ROW } from './coachBand';
import { CHART_BEATS, clampChartBeat, readyHeadline, TOUR_SKIP } from './script';
import { Poly } from '../Poly';
// The dock's own measured height — the tour's band sits directly on top of it.
import { DOCK } from '../chart/board';
import { chartHubControlLayout, type HubControl } from '../../services/flow';
import { chartTourShowing } from '../../services/onboarding';
import { captainActions, useCaptain } from '../../stores/useCaptain';
import { color, radius, type, MIN_TAP_TARGET } from '../../theme/tokens';
import { useLayout } from '../../theme/useLayout';

/** The last beat — the send-off, and the tour's own single exit. */
const FINAL_BEAT = CHART_BEATS.length - 1;

/** The skip pill's ink: quiet, and a third of the 64pt row that carries its touch target. */
const SKIP_PILL_HEIGHT = 24;

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
    hasSkip: true,
  });
}

export function ChartWalkthrough() {
  const L = useLayout();
  const insets = useSafeAreaInsets();
  const reserved = useChartTourBand();
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
  /**
   * The grown-up's skip, and the one place a skip does not ask the resolver.
   *
   * It jumps to the send-off rather than ending the tour where it stands, which keeps two rules
   * intact at once. Forward-only: every tap on this overlay advances, and a skip that unwound the
   * overlay mid-sentence would be the one control on it that goes sideways. And `completeOnboarding`
   * keeps its single caller — the `Sail!` button below — so the tour has exactly one ending however
   * it is reached, rather than two paths that can drift apart.
   *
   * It needs no destination because it never leaves this screen: the captain is standing on the
   * chart already, and the only reason the other two skips route through `resolveDestination` is
   * that they are somewhere the resolver would move them from.
   */
  const skip = useCallback(() => {
    captainActions().setOnboardingBeat(FINAL_BEAT);
  }, []);

  // ── Every hook has run. Conditional returns are legal from here down (A-047). ──

  if (!chartTourShowing(captain)) return null;

  const beat = CHART_BEATS[beatIndex] ?? CHART_BEATS[0];
  if (beat === undefined) return null;

  // The chart under this is still perfectly usable while the box is unmeasured — one frame with no
  // ring is better than a ring drawn at (0,0) and then jumping.
  const measured = box.w > 0 && box.h > 0;
  // `box.h - reserved` is the column the hub actually lays out in now that the coach band takes the
  // bottom of it: the dock has moved up by exactly that much, and the header has not moved at all.
  // Feeding the model the untrimmed height would put every dock ring one coach bar low.
  const controls = measured
    ? chartHubControlLayout({ width: box.w, height: box.h - reserved }).controls
    : [];

  if (beat.id === 'done') {
    return (
      <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
        <ReadyScene
          captainName={captain.name}
          cannons={captain.ownedCannons.length}
          islands={captain.unlockedIslands.length}
          ships={captain.ownedSkins.length}
          coins={captain.coins}
          artScale={L.a(1)}
          typeScale={L.t(1)}
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
        <TourSkip onSkip={skip} scale={L.a} typeScale={L.t} />
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
function TourSkip({
  onSkip,
  scale,
  typeScale,
}: {
  readonly onSkip: () => void;
  readonly scale: (n: number) => number;
  readonly typeScale: (n: number) => number;
}) {
  const px = scale;
  const tx = typeScale;
  // The row is the target and it never scales below the floor: a 64pt button that shrank to 58 on a
  // small phone would be exactly the failure the floor exists to prevent, and this row is chrome
  // rather than composition, so it has no drawing to stay in proportion with.
  const row = Math.max(MIN_TAP_TARGET, px(TOUR_SKIP_ROW));

  // `box-none` so only the button takes a touch: rule NEVER BLOCK means the rest of this row still
  // advances the beat like every other point on the screen, rather than swallowing the tap.
  return (
    <View pointerEvents="box-none" style={{ height: row, alignItems: 'flex-end' }}>
      <Pressable
        onPress={onSkip}
        accessibilityRole="button"
        accessibilityLabel={TOUR_SKIP.accessibilityLabel}
        style={({ pressed }) => [
          s.skipTarget,
          { height: row, paddingHorizontal: px(12) },
          pressed && { opacity: 0.7 },
        ]}
      >
        {/* Ink well under the target — the same split the chart's own header pills document. */}
        <View
          style={[
            s.skipPill,
            { height: px(SKIP_PILL_HEIGHT), paddingHorizontal: px(10), borderRadius: px(radius.pill) },
          ]}
        >
          <Text style={[s.skipLabel, { fontSize: tx(11), lineHeight: tx(15) }]}>
            {TOUR_SKIP.label}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

/**
 * The dock buttons are cards and the header controls are pills, so a single radius would ring one
 * of them wrong. Matched to the surface rather than to the id, so a control that moves band keeps
 * the right ring.
 */
function ringRadiusFor(control: HubControl): number {
  return control.surface === 'dock' ? 22 : radius.pill;
}

/**
 * Beat 20.
 *
 * `Sail!` is `completeOnboarding()` and nothing else. On the board it is wired to the prototype's
 * `restart`, which resets `state.i` to zero — that is canvas navigation for a designer stepping the
 * frame, not a product behaviour. Implementing it literally would drop a child who has just
 * finished the tour back onto beat one, forever.
 *
 * `completeOnboarding()` is called from exactly here and nowhere else in the app; before this beat
 * existed the action had no caller outside two test fixtures.
 */
function ReadyScene({
  captainName,
  cannons,
  islands,
  ships,
  coins,
  artScale,
  typeScale,
  onSail,
}: {
  readonly captainName: string;
  readonly cannons: number;
  readonly islands: number;
  readonly ships: number;
  readonly coins: number;
  readonly artScale: number;
  readonly typeScale: number;
  readonly onSail: () => void;
}) {
  const px = (n: number) => n * artScale;
  const tx = (n: number) => n * typeScale;

  return (
    <View style={s.done}>
      <View style={[s.doneSea, { height: px(150), borderTopWidth: px(5) }]} />

      <View style={[s.doneTitle, { top: px(96) }]}>
        <Text
          numberOfLines={2}
          style={[s.doneHeadline, { fontSize: tx(26), lineHeight: tx(32) }]}
        >
          {readyHeadline(captainName)}
        </Text>
      </View>

      <View
        style={{
          position: 'absolute',
          left: '50%',
          marginLeft: -px(70),
          bottom: px(186),
          width: px(140),
          height: px(112),
        }}
      >
        <ReadyShip width={px(140)} height={px(112)} />
      </View>

      <View style={[s.doneBadges, { bottom: px(120), gap: px(12) }]}>
        <ReadyBadge count={cannons} label="GUNS" scale={artScale} typeScale={typeScale} />
        <ReadyBadge count={islands} label="ISLES" scale={artScale} typeScale={typeScale} />
        <ReadyBadge count={ships} label="SHIPS" scale={artScale} typeScale={typeScale} />
        <ReadyBadge count={coins} label="COINS" scale={artScale} typeScale={typeScale} />
      </View>

      <View style={{ position: 'absolute', left: px(12), right: px(12), bottom: px(32) }}>
        <Pressable
          onPress={onSail}
          accessibilityRole="button"
          accessibilityLabel="Sail, finish the tour"
          style={({ pressed }) => [
            s.sail,
            { height: Math.max(px(76), 64), borderRadius: px(22), borderBottomWidth: px(6) },
            pressed && { transform: [{ translateY: px(4) }], borderBottomWidth: px(2) },
          ]}
        >
          <Text style={[s.sailLabel, { fontSize: tx(24), lineHeight: tx(30) }]}>Sail!</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The board's four 56pt tiles. Its counts are drawn literals (`1 / 1 / 1 / 0`); ours are read off
 * the captain, because a tally screen that says "1 gun" to a child holding two is the first thing
 * the game tells them that is not true.
 */
function ReadyBadge({
  count,
  label,
  scale,
  typeScale,
}: {
  readonly count: number;
  readonly label: string;
  readonly scale: number;
  readonly typeScale: number;
}) {
  return (
    <View
      style={[
        s.badge,
        { width: scale * 56, height: scale * 56, borderRadius: scale * 18, borderBottomWidth: scale * 3 },
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

/** The board's ship, at its own vertex coordinates. Composed — `sprites.test.ts` allows no new raster. */
function ReadyShip({ width, height }: { readonly width: number; readonly height: number }) {
  const u = width / 140;
  return (
    <View style={{ width, height }}>
      <Poly
        points="0,0 100,0 68,50 100,100 0,100"
        width={24 * u}
        height={12 * u}
        fill={color.amber}
        style={{ position: 'absolute', left: 66 * u, bottom: 100 * u }}
      />
      <View
        style={{
          position: 'absolute',
          left: 64 * u,
          bottom: 40 * u,
          width: 6 * u,
          height: 62 * u,
          borderRadius: 3 * u,
          backgroundColor: color.wood,
        }}
      />
      <Poly
        points="100,0 100,100 0,88 0,12"
        width={40 * u}
        height={24 * u}
        fill={color.parchment}
        style={{ position: 'absolute', left: 24 * u, bottom: 76 * u }}
      />
      <Poly
        points="100,0 100,100 0,92 0,8"
        width={48 * u}
        height={32 * u}
        fill={color.white}
        style={{ position: 'absolute', left: 16 * u, bottom: 44 * u }}
      />
      <View
        style={{
          position: 'absolute',
          left: 8 * u,
          bottom: 34 * u,
          width: 122 * u,
          height: 7 * u,
          borderRadius: 4 * u,
          backgroundColor: color.deck,
        }}
      />
      <Poly
        points="0,0 100,0 90,100 9,100"
        width={140 * u}
        height={36 * u}
        fill={color.woodLight}
        style={{ position: 'absolute', left: 0, bottom: 0 }}
      />
      <Poly
        points="0,0 100,0 90,100 9,100"
        width={140 * u}
        height={11 * u}
        fill={color.woodDeep}
        style={{ position: 'absolute', left: 0, bottom: 0 }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  skipTarget: { justifyContent: 'center' },
  /** The coach slab's own pair — `parchment` on `inkDark` — so the pill certifies itself rather
      than depending on whatever the chart happens to paint behind the reserved band. */
  skipPill: { backgroundColor: color.inkDark, alignItems: 'center', justifyContent: 'center' },
  skipLabel: { fontFamily: type.body.fontFamily, color: color.parchment },

  done: { flex: 1, backgroundColor: color.seaFoam, overflow: 'hidden' },
  doneSea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.sea,
    borderTopColor: color.seaFoam,
  },
  doneTitle: { position: 'absolute', left: 0, right: 0, paddingHorizontal: 16 },
  doneHeadline: { fontFamily: type.display.fontFamily, color: color.inkDark, textAlign: 'center' },
  doneBadges: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center' },
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
