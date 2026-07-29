import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IslandId } from '@content/schemas';

import { ChartDock } from '../src/components/chart/Dock';
import { ChartShip } from '../src/components/chart/ChartShip';
import { Fog } from '../src/components/chart/Fog';
import { HeaderPill } from '../src/components/chart/HeaderPill';
import { Route, Sea } from '../src/components/chart/Sea';
import { IslandLand, StationMarker } from '../src/components/chart/Station';
import { FRAME, HEADER, MAP, STATIONS } from '../src/components/chart/board';
import { focusIndex, requirementIndex, stationState, type MapFrame } from '../src/components/chart/layout';
import { chart } from '../src/components/chart/palette';
import { ResponsiveFrame } from '../src/components/ResponsiveFrame';
import { chartNodes, requirementText } from '../src/services/chart';
import { chartHubControlLayout, executeDemoRouteEdge } from '../src/services/flow';
import { captainActions, useCaptain } from '../src/stores/useCaptain';
import { containWorldBoard } from '../src/theme/responsive';
import { useLayout } from '../src/theme/useLayout';

/**
 * The sea chart — the hub, drawn from the board.
 *
 * Every path runs through here: onboarding ends on it, duels start and end on it, the gunnery
 * range hangs off an island. Before this screen the app had a duel you could replay; a loop needs
 * somewhere to return to.
 *
 * Three bands, and each one lives in a different coordinate space, which is the single thing to
 * keep straight while reading this file:
 *
 *   header — FRAME coords (measured from the top of the 375×667 board), scaled by TYPE
 *   map    — MAP coords inside a letterboxed board contained in the measured map box
 *   dock   — a fixed 126pt band whose four measured pieces sum to exactly 126, scaled by TYPE
 *
 * On tablet/desktop the world column is wider than the phone board. Stretching positions and art
 * to that width reads as a zoom; stretching positions alone leaves sparse islands. The map box
 * stays full-bleed for the sea paper, and `containWorldBoard` centers a board-faithful composition
 * inside it. Type stays on the clamped scale.
 *
 * All fog and ordering decisions come from `services/chart.ts`, which is exhaustively tested. This
 * file renders that decision, positions it, and owns nothing else.
 */
export default function Chart() {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const captain = useCaptain((s) => s.captain);
  const nodes = chartNodes(captain);

  // The live map box. Measured rather than computed: it is whatever is left between the header and
  // the dock on this device, and `board.ts`'s proportional mapping is defined against exactly that.
  // Measured map box uses `w`/`h` so source guards do not treat local layout as global viewport width.
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onMapLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: nextW, height: nextH } = e.nativeEvent.layout;
    setBox((prev) => (prev.w === nextW && prev.h === nextH ? prev : { w: nextW, h: nextH }));
  }, []);

  const sail = useCallback((id: IslandId) => {
    // Sailing IS setting the current island — the ship parks there next time this screen is seen,
    // and the range reads the same field to know what it is drilling.
    captainActions().setCurrentIsland(id);
    router.push('/duel');
  }, []);

  const live = focusIndex(nodes);
  const focusIslandId = nodes[live]?.island.id;

  const hubLayout = chartHubControlLayout({ width: L.width, height: L.height });

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

  const focus = nodes[live];
  // After every hook, so the hook order cannot depend on it. An empty catalog is unrenderable and
  // should say so rather than draw an ocean with nothing in it.
  if (focus === undefined) throw new Error('chart: the island catalog is empty');

  const needsRequirement = requirementIndex(nodes, STATIONS);

  const board = containWorldBoard(box.w, box.h, MAP.width, MAP.height);
  const frame: MapFrame = {
    width: board.width,
    height: board.height,
    art: board.scale,
  };
  const anchor = STATIONS[live] ?? STATIONS[0];
  const mapReady = Boolean(box.w && board.width);

  return (
    <ResponsiveFrame surface="world">
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <View style={{ height: (HEADER.top - FRAME.statusBar) * L.type }} />
        <HeaderPill name={captain.name} flag={captain.flag} coins={captain.coins} typeScale={L.type} />

        {/*
        The board's map starts 8pt below the pill (`86 − 26 − 52`) and ends where the dock begins.
        At the reference frame that leaves 667 − 20 − 6 − 52 − 8 − 126 = 455 — `MAP.height` exactly,
        which is the arithmetic that makes the proportional mapping identity-true at 375×667.
      */}
        <View
          style={[s.map, { marginTop: (MAP.top - HEADER.top - HEADER.height) * L.type }]}
          onLayout={onMapLayout}
        >
          {mapReady ? (
            <View
              style={{
                position: 'absolute',
                width: board.width,
                height: board.height,
                left: (box.w - board.width) / 2,
                top: (box.h - board.height) / 2,
              }}
            >
              <Sea frame={frame} />
              <Route frame={frame} />
              {STATIONS.map((station, i) => (
                <IslandLand key={`land-${i}`} station={station} frame={frame} />
              ))}
              <Fog frame={frame} />
              {nodes.map((node, i) => {
                const station = STATIONS[i];
                if (station === undefined) return null;
                return (
                  <StationMarker
                    key={node.island.id}
                    index={i}
                    node={node}
                    state={stationState(node, station, i === live)}
                    frame={frame}
                    typeScale={L.type}
                    requirement={i === needsRequirement ? requirementText(node) : null}
                    onSail={sail}
                  />
                );
              })}
              {anchor === undefined ? null : (
                <ChartShip station={anchor} frame={frame} typeScale={L.type} showHere={!focus.fogged} />
              )}
            </View>
          ) : null}
        </View>

        <ChartDock
          island={focus.island}
          mastery={captain.mastery}
          fogged={focus.fogged}
          insetBottom={insets.bottom}
          typeScale={L.type}
          controls={hubLayout.controls}
          onDemoRouteEdge={onDemoRouteEdge}
        />
      </View>
    </ResponsiveFrame>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: chart.frame },
  // `overflow: hidden` so the grid paper and the fog stop at the map's edges rather than running
  // under the header pill — the board's map is a window, not a background.
  map: { flex: 1, backgroundColor: chart.gridSea, overflow: 'hidden' },
});
