import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IslandId } from '@content/schemas';
import { rankForWins, rankTierForWins } from '@engine/ranks';

import { ChartDock } from '../src/components/chart/Dock';
import { HeaderPill } from '../src/components/chart/HeaderPill';
import { SeaWater } from '../src/components/chart/Sea';
import { VoyageMap } from '../src/components/chart/VoyageMap';
import { FRAME, HEADER, VOYAGE, type WaypointKind } from '../src/components/chart/board';
import { focusIndex, type MapFrame } from '../src/components/chart/layout';
import { chart } from '../src/components/chart/palette';
import { ChartWalkthrough, useChartTourBand } from '../src/components/onboarding/ChartWalkthrough';
import { ResponsiveFrame } from '../src/components/ResponsiveFrame';
import { chartNodes, chartProgress } from '../src/services/chart';
import { chartHubControlLayout, executeDemoRouteEdge } from '../src/services/flow';
import { captainActions, useCaptain } from '../src/stores/useCaptain';
import { containWorldBoard } from '../src/theme/responsive';
import { useLayout } from '../src/theme/useLayout';

/**
 * The sea chart — the hub, drawn from board 9.
 *
 * Every path runs through here: onboarding ends on it, duels start and end on it, the gunnery range
 * hangs off an island. Before this screen the app had a duel you could replay; a loop needs
 * somewhere to return to.
 *
 * ── One view (OWNER RULING, 2026-07-30) ────────────────────────────────────────────────────────
 * There were two: a voyage map and a closer chart, with `zoomedOut` as local state and the compass
 * as the control between them. The owner cut the close one — *"the zoomed in view does absolutely
 * nothing but confuse the user"* — and the republished board agrees. There is no zoom state in this
 * file any more, and nothing the close chart could do was lost with it:
 *
 *   header pill (rank → /rank, purse → /harbor)   kept, and now always drawn
 *   dock: Practice / Guns / Fight                  kept, and now always drawn
 *   island name + mastery meter                    kept in the dock header
 *   "what do I do next"                            the dock's `NEXT ISLE: n DUELS` chip, plus the
 *                                                  gold chip on the fogged island itself
 *   "you are here"                                 derived, exactly one, `VoyageMap.subCaption`
 *   tappable island nodes                          kept — and they now TRAVEL rather than fight
 *   tappable waypoints (buoy → range, rival/wreck → duel)  kept
 *   the ship's berth                               kept, derived from the live island
 *   the compass                                    kept as scenery; it has no job left, so it is
 *                                                  not a `Pressable` and has no tap target
 *
 * ── Travelling is not fighting ─────────────────────────────────────────────────────────────────
 * Tapping an island used to `router.push('/duel')`, so on a map with several open islands there was
 * no way to go anywhere without a fight — the chart was a menu of duels wearing a map's clothes.
 * Now a tap on an island MOVES the captain: the ship sails there, the dock retitles to that island
 * and its meter, and the three verbs act on it. The map moves you; the dock does things.
 *
 * ── Bands, and the coordinate space each one lives in ──────────────────────────────────────────
 *   header — FRAME coords, floating over the sea at `z-index: 3`, scaled by TYPE.
 *   map    — VOYAGE coords inside a letterboxed board contained in the measured map box.
 *   dock   — a fixed 134pt band whose measured pieces sum exactly, scaled by TYPE.
 *
 * On tablet/desktop the world column is wider than the phone board. Stretching positions and art to
 * that width reads as a zoom; stretching positions alone leaves sparse islands. The map box stays
 * full-bleed for the sea, and `containWorldBoard` centres a board-faithful composition inside it.
 * Type stays on the clamped scale.
 *
 * All fog and ordering decisions come from `services/chart.ts`, which is exhaustively tested. This
 * file renders that decision, positions it, and owns nothing else.
 */
export default function Chart() {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const captain = useCaptain((s) => s.captain);
  const nodes = chartNodes(captain);

  // Measured rather than derived from the window. `responsive-surfaces.test.ts` AC-5 forbids a
  // route reading the global viewport width — the hub's geometry has to come from the column
  // `ResponsiveFrame` actually gave it, which on a desktop is capped well below the window. Both
  // boxes use `w`/`h` so the source guard cannot mistake a local measurement for a global one.
  const [screen, setScreen] = useState({ w: 0, h: 0 });
  const onScreenLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: nextW, height: nextH } = e.nativeEvent.layout;
    setScreen((prev) => (prev.w === nextW && prev.h === nextH ? prev : { w: nextW, h: nextH }));
  }, []);

  const [box, setBox] = useState({ w: 0, h: 0 });
  const onMapLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: nextW, height: nextH } = e.nativeEvent.layout;
    setBox((prev) => (prev.w === nextW && prev.h === nextH ? prev : { w: nextW, h: nextH }));
  }, []);

  // Sailing IS setting the current island — the ship parks there, the dock retitles, and the range
  // and the duel both read the same field to know where they are. It stays on the chart on purpose:
  // a map you cannot move around without starting a fight is a fight menu (owner ruling).
  const travel = useCallback((id: IslandId) => {
    captainActions().setCurrentIsland(id);
  }, []);

  const sail = useCallback((id: IslandId) => {
    captainActions().setCurrentIsland(id);
    router.push('/duel');
  }, []);

  const drill = useCallback((id: IslandId) => {
    captainActions().setCurrentIsland(id);
    router.push('/range');
  }, []);

  // A waypoint is not a route parameter — this app has none anywhere — so it does exactly what
  // `sail` does: name the island it belongs to, then open the screen it promises. A wreck opens a
  // plain duel; board 9c's "bigger chest and no rank consequence" needs `rewardSettlement` changes
  // outside this file's ownership, and a duel that quietly lacks them is honest where a fake one
  // would not be (owner ruling 5).
  const openWaypoint = useCallback(
    (kind: WaypointKind, id: IslandId) => {
      if (kind === 'buoy') {
        drill(id);
        return;
      }
      sail(id);
    },
    [drill, sail],
  );

  const live = focusIndex(nodes);
  const focusIslandId = nodes[live]?.island.id;

  // How far the next island is, in whole duels. The one number on this screen that is a function of
  // the last duel's answers, so a win cannot leave the chart looking identical.
  const progress = useMemo(() => chartProgress(captain, nodes), [captain, nodes]);

  // `chartHubControlLayout` wants the viewport the hub is laid out in. Before the first layout pass
  // that is the board's own frame, which keeps the dock from flashing at its 64pt floor for a frame.
  const hubLayout = chartHubControlLayout({
    width: screen.w || FRAME.width,
    height: screen.h || FRAME.height,
  });

  const onDemoRouteEdge = useCallback(
    (edgeId: string) => {
      if ((edgeId === 'chart-duel' || edgeId === 'chart-range') && focusIslandId !== undefined) {
        captainActions().setCurrentIsland(focusIslandId);
      }
      executeDemoRouteEdge(edgeId, {
        push: (href) => router.push(href as '/duel'),
        replace: (href) => router.replace(href as '/chart'),
        back: () => router.back(),
        redirect: (href) => router.replace(href as '/chart'),
      });
    },
    [focusIslandId],
  );

  /**
   * How much of the column onboarding's coach bar is holding, and `0` for every captain who has
   * finished. The bar is a flex BAND rather than an overlay — the board's world beats are
   * `667 - 20 status - 92 coach = 555`, so the map is compressed and not covered. Reserved here
   * because the map is `flex: 1`: it is the thing that has to give, and `closeChartColumns` lifts
   * the node labels off a shorter box on its own.
   */
  const tourBand = useChartTourBand();

  const focus = nodes[live];
  // After every hook, so the hook order cannot depend on it. An empty catalog is unrenderable and
  // should say so rather than draw an ocean with nothing in it.
  if (focus === undefined) throw new Error('chart: the island catalog is empty');

  const design = VOYAGE.map;
  const board = containWorldBoard(box.w, box.h, design.width, design.height);
  const frame: MapFrame = {
    width: board.width,
    height: board.height,
    boardWidth: design.width,
    boardHeight: design.height,
    art: board.scale,
  };
  const mapReady = Boolean(box.w && board.width);
  // Where the contain-fitted composition sits inside the measured box. Chrome subtracts it back out
  // so the compass, the counter chip and the fog band stay against the screen rather than the board.
  const slack = { x: Math.max(0, (box.w - board.width) / 2), y: Math.max(0, box.h - board.height) };
  const rank = rankForWins(captain.wins);

  return (
    <ResponsiveFrame surface="world">
      <View style={s.screen} onLayout={onScreenLayout}>
        <View style={{ height: insets.top, backgroundColor: chart.frame }} />

        <View style={s.map} onLayout={onMapLayout}>
          {/*
            The ocean is full-bleed on both boards and the composition is letterboxed inside it —
            see `SeaWater`. Drawn against the measured box so a tall phone gets more water rather
            than two bands of flat colour, and so the header really does float over the sea.
          */}
          <SeaWater width={box.w} height={box.h} water={VOYAGE.water} />
          {mapReady ? (
            <View
              style={{
                position: 'absolute',
                width: board.width,
                height: board.height,
                left: slack.x,
                // Bottom-anchored, not centred. A phone taller than the 667pt reference leaves the
                // contain-fit board short of its box, and where that slack goes is a design
                // decision: at the bottom it would float the fog band off the dock and leave a
                // seam of open water under it, which is the one place on this screen the weather
                // has to meet the chrome. At the top it becomes more horizon — exactly what the
                // gradient's light centre is already drawing, and what the header floats over.
                top: slack.y,
              }}
            >
              <VoyageMap
                frame={frame}
                slack={slack}
                nodes={nodes}
                live={live}
                nextIsland={progress.nextIndex}
                nextCaption={progress.caption}
                typeScale={L.type}
                onTravel={travel}
                onWaypoint={openWaypoint}
              />
            </View>
          ) : null}
        </View>

        {/*
          The tour's coach bar is reserved ABOVE the dock, not below it.

          Below, it left the dock floating in the middle of the screen with a band of open water
          beneath — the dock read as content rather than as the footer, which is exactly what it is.
          The board stacks the coach bar last only because its world beats have no dock; ours does,
          and the bottom of the screen belongs to it.
        */}
        {tourBand > 0 ? <View style={{ height: tourBand }} /> : null}

        <ChartDock
          island={focus.island}
          glyph={focus.glyph}
          mastery={captain.mastery}
          fogged={focus.fogged}
          nextIslandCount={progress.nextIndex < 0 ? null : progress.duelsToOpen}
          insetBottom={insets.bottom}
          typeScale={L.type}
          controls={hubLayout.controls}
          onDemoRouteEdge={onDemoRouteEdge}
        />
        {/* The dock is the footer again, so it keeps the home indicator. */}

        {/*
          The header floats over the sea rather than sitting above it — the board gives the close
          chart a full-bleed map and puts the pill on top at `z-index: 3`. Drawn last so it paints
          over the water without needing a z-index React Native does not have.
        */}
        <View
          style={{
            position: 'absolute',
            left: HEADER.inset * L.type,
            right: HEADER.inset * L.type,
            top: insets.top + (HEADER.top - FRAME.statusBar) * L.type,
          }}
        >
          <HeaderPill
              name={captain.name}
              rankName={rank.displayName}
              // Derived from `wins`, NOT the persisted `captain.rankTier` — the pill's name comes
              // from `rankForWins(captain.wins)` two lines up, and feeding the numeral from a
              // separately-stored field lets the two halves of one badge disagree: a captain whose
              // wins have advanced but whose stored tier has not would read "ENSIGN" beside a 1.
              rankTier={rankTierForWins(captain.wins)}
              coins={captain.coins}
              typeScale={L.type}
              controls={hubLayout.controls}
            onDemoRouteEdge={onDemoRouteEdge}
          />
        </View>

        {/*
          Onboarding beats 17–20 — the coached tour of this screen, and the last thing onboarding
          does before a captain is free.

          It is drawn on the REAL chart rather than an illustration of one, which is the board's own
          rule, and it is a child of this padded screen `View` on purpose: that puts its origin
          exactly where `chartHubControlLayout`'s origin is, so the rings it draws around the dock
          and header controls land on the controls themselves. Handing it `L.width`/`L.height`
          instead would sit every dock ring one safe-area inset low.

          No props: it reads the captain itself and renders `null` once `hasCompletedOnboarding` is
          true, so the finished case costs one store read and nothing else. Its coach bar paints
          into the `tourBand` spacer above, which is why that spacer is the last flex child.
        */}
        <ChartWalkthrough />
      </View>
    </ResponsiveFrame>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: chart.frame },
  // `overflow: hidden` so the sea and the fog stop at the map's edges rather than running under the
  // dock — the board's map is a window, not a background.
  map: { flex: 1, backgroundColor: chart.frame, overflow: 'hidden' },
});
