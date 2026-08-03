/**
 * The sea chart — the whole ocean, on the only chart screen there is (board 9a).
 *
 * Five islands, eleven waypoints, four dotted trails, a kraken and a compass, in one composition
 * contain-fitted into whatever the header and the dock leave. Everything unearned is under fog and
 * nothing is invisible.
 *
 * ── One view ───────────────────────────────────────────────────────────────────────────────────
 * There used to be a second, closer chart and a compass that zoomed between them. The owner cut it:
 * *"the zoomed in view does absolutely nothing but confuse the user"*, and the republished board
 * agrees — *"two views of the same sea meant two things to learn, two places for a node to drift,
 * and a zoom gesture a five-year-old has no reason to try."* So this file is the chart, and it
 * carries the close chart's full chrome: the header pill above it, the three-verb dock below.
 *
 * ── Nothing here is the board's captain ────────────────────────────────────────────────────────
 * The board draws one arrangement: a captain on Isla Products, three islands fogged, one trail
 * inked. Every one of those is derived here from `chartNodes`, and `board.ts` holds none of them.
 * The bug that made this necessary: `YOU ARE HERE` was transcribed onto island 1's tag AND set on
 * the live node, so two islands claimed the captain at once.
 *
 * Paint order is the board's DOM order and it is load-bearing: swells, lagoon, waypoints, kraken,
 * TRAILS, islands, labels, ship. A trail runs under the islands it connects, which is what makes it
 * read as a route arriving rather than a line stopping.
 */
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import type { IslandId } from '@content/schemas';

import {
  CeremonyMarker,
  CeremonyTrailGlow,
  FloodReveal,
  FOG_LIFT,
  type ArrivalBeat,
  type GlowDotSpec,
} from './ArrivalCeremony';
import { CompassRose } from './Compass';
import { IsleFog, IsleFogParting } from './Fog';
import { VoyageIsle } from './Isle';
import { Kraken } from './Kraken';
import { ChartShip } from './ChartShip';
import { Lagoon, Swells, TrailRun } from './Sea';
import { StationMarker, type MarkerLook } from './Station';
import { VoyageWaypoint } from './Waypoint';
import { Counter } from './Chips';
import {
  ISLE_TAG,
  PLACE_COUNT,
  SHIP,
  STATIONS,
  SWELL,
  TRAIL_LOOK,
  VOYAGE,
  VOYAGE_NODE,
  WAYPOINT_GATE,
  isleFog,
  nodeCentre,
  trailDots,
  type WaypointKind,
} from './board';
import {
  art,
  chromeInsetX,
  chromeY,
  mapX,
  mapY,
  stationState,
  type BoardSlack,
  type MapFrame,
} from './layout';
import { chart } from './palette';
import type { ChartNode } from '../../services/chart';

/** Board 9a's node sizes: a 52pt live ring, 38pt everywhere else. */
const LOOK: MarkerLook = {
  live: {
    ring: VOYAGE_NODE.live.ring,
    disc: VOYAGE_NODE.live.disc,
    discInset: VOYAGE_NODE.live.discInset,
    shadowDy: VOYAGE_NODE.live.shadowDy,
    glyphSize: VOYAGE_NODE.live.glyphSize,
  },
  cleared: {
    size: VOYAGE_NODE.flat.size,
    shadowDy: VOYAGE_NODE.flat.shadowDy,
    tickSize: VOYAGE_NODE.flat.tickSize,
  },
  locked: {
    size: VOYAGE_NODE.flat.size,
    shadowDy: VOYAGE_NODE.flat.shadowDy,
    glyphSize: VOYAGE_NODE.flat.glyphSize,
  },
  gap: VOYAGE_NODE.gap,
  chip: VOYAGE_NODE.chip,
  liveChipSize: VOYAGE_NODE.chip.size,
  sub: VOYAGE_NODE.sub,
  hit: 64,
};

/** The look, with every DRAWN size taken to this screen's art scale. Chip type stays on `type`. */
function scaledLook(frame: MapFrame): MarkerLook {
  return {
    live: {
      ring: art(frame, LOOK.live.ring),
      disc: art(frame, LOOK.live.disc),
      discInset: art(frame, LOOK.live.discInset),
      shadowDy: art(frame, LOOK.live.shadowDy),
      glyphSize: LOOK.live.glyphSize,
    },
    cleared: {
      size: art(frame, LOOK.cleared.size),
      shadowDy: art(frame, LOOK.cleared.shadowDy),
      tickSize: LOOK.cleared.tickSize,
    },
    locked: {
      size: art(frame, LOOK.locked.size),
      shadowDy: art(frame, LOOK.locked.shadowDy),
      glyphSize: LOOK.locked.glyphSize,
    },
    gap: art(frame, LOOK.gap),
    chip: LOOK.chip,
    liveChipSize: LOOK.liveChipSize,
    sub: LOOK.sub,
    hit: art(frame, LOOK.hit),
  };
}

/**
 * The four chain legs, each with the look its own state earns.
 *
 * A leg is `sailed` when both its islands are open — water this captain has charted. Past the
 * frontier it fades with distance, which is the board's own `.5 / .36 / .26` gradient recovered as
 * a rule instead of four fixed values that happened to describe one save file.
 */
function legsFor(nodes: readonly ChartNode[]) {
  const tags = VOYAGE.isleTags;
  const legs: {
    key: number;
    dots: ReturnType<typeof trailDots>;
    color: string;
    opacity: number;
  }[] = [];

  let beyond = 0;
  for (let i = 0; i + 1 < tags.length; i += 1) {
    const from = tags[i];
    const to = tags[i + 1];
    // A leg whose destination is not drawn is not drawn either. Both are always drawn today —
    // every island is on the chart, fogged or not — so this is a guard, not a branch a captain hits.
    if (from === undefined || to === undefined) continue;
    const open = nodes[i]?.fogged === false && nodes[i + 1]?.fogged === false;
    const fade = TRAIL_LOOK.unknown.opacity;
    const step = Math.min(beyond, fade.length - 1);
    const size = open
      ? TRAIL_LOOK.sailed.size
      : step >= fade.length - 1
        ? TRAIL_LOOK.unknown.sizeFar
        : TRAIL_LOOK.unknown.size;
    legs.push({
      key: i,
      dots: trailDots(i, nodeCentre(from), nodeCentre(to), size),
      color: open ? TRAIL_LOOK.sailed.color : TRAIL_LOOK.unknown.color,
      opacity: open ? TRAIL_LOOK.sailed.opacity : (fade[step] ?? 0.26),
    });
    if (!open) beyond += 1;
  }
  return legs;
}

export function VoyageMap({
  frame,
  slack,
  nodes,
  live,
  nextIsland,
  nextCaption,
  typeScale,
  sail,
  ceremony,
  onTravel,
  onWaypoint,
}: {
  frame: MapFrame;
  /** Where the contain-fitted composition sits inside the measured box — see `chromeY`. */
  slack: BoardSlack;
  nodes: readonly ChartNode[];
  /** Index of the island the ship is berthed at. */
  live: number;
  /** Index of the nearest island still under fog, or `-1` when the chain is finished. */
  nextIsland: number;
  /** What that island's gold chip says — how far off it is, in whole duels. */
  nextCaption: string | null;
  typeScale: number;
  /** The voyage under way (or last completed): one key naming one run, and its two isle indices. */
  sail: { readonly key: string; readonly from: number; readonly to: number } | null;
  /**
   * The arrival ceremony's map-space beats (A-065), or `null` for every ordinary render. While it
   * runs, the arrival island is HELD asleep through the sail (fog whole, marker slate — the store
   * already opened it, but the screen has not earned the reveal yet), then wakes on the board's
   * own three fog-lift steps. `progress` is the chart's shared sail clock, for the trail lighting.
   */
  ceremony: {
    readonly islandIndex: number;
    readonly beat: ArrivalBeat;
    readonly progress: SharedValue<number>;
  } | null;
  /** Sails the captain to an island. It does NOT start a fight — see `app/chart.tsx`. */
  onTravel: (id: IslandId) => void;
  onWaypoint: (kind: WaypointKind, island: IslandId) => void;
}) {
  const look = scaledLook(frame);
  const openPlaces = countOpen(nodes);
  const liveIsle = VOYAGE.isles[live] ?? VOYAGE.isles[0];
  const legs = legsFor(nodes);
  const last = nodes.length - 1;

  // ── The arrival ceremony's map beats (A-065) ─────────────────────────────────────────────────
  // The store opens the island the moment it is earned; the SCREEN holds it asleep until the fog
  // lift — through the sail the destination keeps its whole fog and its slate marker, so the one
  // bright thing on the map is the ship (the amber card's "one glow per beat").
  const arrivalIsle = ceremony === null ? undefined : VOYAGE.isles[ceremony.islandIndex];
  const sleepIndex =
    ceremony !== null && (ceremony.beat === 'sailing' || ceremony.beat === 'fog-lift')
      ? ceremony.islandIndex
      : -1;
  const fogWholeIndex = ceremony !== null && ceremony.beat === 'sailing' ? ceremony.islandIndex : -1;
  const fogPartIndex = ceremony !== null && ceremony.beat === 'fog-lift' ? ceremony.islandIndex : -1;
  // The trail lights gold dot by dot as the hull passes — lit behind, never ahead, because each
  // dot's own `t` is compared against the shared sail clock. Sailing back up-chain crosses the
  // printed leg with `t` reversed, exactly as the ship itself does.
  const glow = (() => {
    if (ceremony === null || sail === null || sail.from === sail.to) return null;
    const fromTag = VOYAGE.isleTags[sail.from];
    const toTag = VOYAGE.isleTags[sail.to];
    if (fromTag === undefined || toTag === undefined) return null;
    const leg = Math.min(sail.from, sail.to);
    const forward = sail.from < sail.to;
    const a = nodeCentre(forward ? fromTag : toTag);
    const b = nodeCentre(forward ? toTag : fromTag);
    const dots: GlowDotSpec[] = trailDots(leg, a, b, TRAIL_LOOK.sailed.size).map((dot, i, all) => {
      const t = (i + 1) / (all.length + 1);
      return { x: mapX(frame, dot.x), y: mapY(frame, dot.y), t: forward ? t : 1 - t };
    });
    return { dots, progress: ceremony.progress };
  })();

  // The ship's anchor is the DESTINATION berth whenever a sail names one — not the live island.
  // During an arrival the captain's `currentIsland` is still the island they are leaving (it
  // becomes current only when the sail completes — `app/chart.tsx`), so anchoring on `live` would
  // aim the voyage at its own departure berth. The sail transform inside `ChartShip` carries the
  // hull back to the berth it left and plays it forward from there — never a teleport.
  const sailingFrom = sail === null ? undefined : VOYAGE.isles[sail.from];
  const sailingTo = sail === null ? undefined : VOYAGE.isles[sail.to];
  const sailing =
    sail !== null && sail.from !== sail.to && sailingFrom !== undefined && sailingTo !== undefined;
  const berthIsle = sailing ? sailingTo : liveIsle;

  return (
    <>
      <Swells frame={frame} swells={VOYAGE.swells} height={SWELL.height} fill={chart.seaCrest} />
      <Lagoon frame={frame} lagoon={VOYAGE.lagoon} fill={chart.seaCrest} />

      {VOYAGE.waypoints.map((waypoint, i) => {
        const gate = WAYPOINT_GATE[i] ?? 0;
        const gateNode = nodes[gate];
        return (
          <VoyageWaypoint
            key={`${waypoint.kind}-${waypoint.x}-${waypoint.y}`}
            waypoint={waypoint}
            frame={frame}
            typeScale={typeScale}
            reachable={gateNode !== undefined && !gateNode.fogged}
            onOpen={(kind) => {
              if (gateNode !== undefined) onWaypoint(kind, gateNode.island.id);
            }}
          />
        );
      })}

      <Kraken frame={frame} />

      {legs.map((leg) => (
        <TrailRun key={leg.key} frame={frame} dots={leg.dots} color={leg.color} opacity={leg.opacity} />
      ))}
      {glow === null ? null : (
        <CeremonyTrailGlow frame={frame} dots={glow.dots} progress={glow.progress} />
      )}

      {VOYAGE.isles.map((isle, i) => (
        <VoyageIsle
          key={isle.x}
          isle={isle}
          frame={frame}
          locked={nodes[i]?.fogged === true || i === sleepIndex}
        />
      ))}
      {/*
        Fog-lift step 2: colour floods the arrival island through an expanding circular reveal —
        the OPEN drawing, clipped, over the sleeping one underneath. From the banner beat on the
        island simply renders open above, so the flood's end state and the plain render agree.
      */}
      {ceremony !== null && ceremony.beat === 'fog-lift' && arrivalIsle !== undefined ? (
        <FloodReveal frame={frame} isle={arrivalIsle}>
          <VoyageIsle isle={arrivalIsle} frame={frame} locked={false} />
        </FloodReveal>
      ) : null}
      {/*
        Fog is drawn wherever a node is fogged, at a thickness derived from how far out the island
        is. The board hangs a `fogged` flag on three of its five isles — its own captain's state —
        and transcribed as an optional field it meant Port Sumwich and Isla Products could never
        draw fog at all, which is precisely the state a fresh K-1 captain is in.
      */}
      {VOYAGE.isles.map((isle, i) => {
        // The ceremony's arrival island keeps its WHOLE fog through the sail, then parts it as two
        // half-discs at the fog lift (step 1). Every other island's weather is untouched.
        if (i === fogPartIndex) {
          return (
            <IsleFogParting
              key={`fog-${isle.x}`}
              frame={frame}
              isle={isle}
              splitDx={FOG_LIFT.partDx}
              ms={FOG_LIFT.partMs}
            />
          );
        }
        if (nodes[i]?.fogged !== true && i !== fogWholeIndex) return null;
        return <IsleFog key={`fog-${isle.x}`} frame={frame} isle={isle} fog={isleFog(i)} />;
      })}

      {nodes.map((node, i) => {
        const tag = VOYAGE.isleTags[i];
        if (tag === undefined) return null;
        // The ceremony owns the arrival island's marker for ALL its beats — slate through the
        // sail, the gold pop + spark + standing pulse at the fog lift, and gold with NO ring from
        // the banner beat on, when the Fight button holds the only glow (AC-3). The real
        // `StationMarker` would pulse whenever the island reads `current`, which is exactly the
        // second ring the amber card bans.
        if (ceremony !== null && i === ceremony.islandIndex) {
          return (
            <CeremonyMarker
              key={node.island.id}
              beat={ceremony.beat}
              glyph={node.glyph}
              name={node.displayName}
              look={look}
              typeScale={typeScale}
              position={{
                left: mapX(frame, tag.x + tag.w / 2),
                top: mapY(frame, tag.y),
                transform: [{ translateX: '-50%' }],
                maxWidth: art(frame, ISLE_TAG.maxWidth),
              }}
            />
          );
        }
        // Beat A's other half: while the ship is under way it is the one bright thing, so the
        // departure island's live ring stands down for the length of the sail.
        const baseState = stationState(node, STATIONS[i] ?? { silhouette: false }, i === live);
        const state =
          ceremony !== null && ceremony.beat === 'sailing' && baseState === 'current'
            ? node.cleared
              ? 'cleared'
              : 'available'
            : baseState;
        return (
          <StationMarker
            key={node.island.id}
            node={node}
            state={state}
            // Centred on the tag column, with NO fixed width.
            //
            // `tag.w` is the board's 108pt column, measured against the board's own placeholder
            // text. The real island names are 12–13 characters and need ~128pt, so a fixed column
            // truncated every one of them — "Port Su…", "Quotie…", "Fractio…" — along with the
            // captions beneath. A map a child navigates by name has to say the names.
            //
            // The model keeps `tag.x`/`tag.w` (and `design-fidelity` keeps asserting the column is
            // centred on its island); only the DRAWING stops being clamped by it. The pill sizes to
            // its text and is centred on the column's midpoint, bounded so it can never exceed the
            // board and run off the water.
            position={{
              left: mapX(frame, tag.x + tag.w / 2),
              top: mapY(frame, tag.y),
              transform: [{ translateX: '-50%' }],
              maxWidth: art(frame, ISLE_TAG.maxWidth),
            }}
            look={look}
            typeScale={typeScale}
            sub={subCaption({ index: i, live, nextIsland, nextCaption, last, fogged: node.fogged })}
            requirement={null}
            onSail={onTravel}
          />
        );
      })}

      {berthIsle === undefined ? null : (
        <ChartShip
          frame={frame}
          left={shipLeft(frame, berthIsle)}
          top={shipTop(frame, berthIsle)}
          width={VOYAGE.ship.width}
          sail={
            !sailing || sail === null || sailingFrom === undefined
              ? null
              : {
                  key: sail.key,
                  fromLeft: shipLeft(frame, sailingFrom),
                  fromTop: shipTop(frame, sailingFrom),
                  // The printed trail's own naming: the leg between two isles is the LOWER catalog
                  // index, and the bow's alternating sign belongs to that name whichever way the
                  // ship crosses it — sailing back runs the same bow with `t` reversed.
                  leg: Math.min(sail.from, sail.to),
                  forward: sail.from < sail.to,
                }
          }
        />
      )}

      {/*
        Scenery, and deliberately not a control: `pointerEvents="none"`, no `Pressable`, no
        accessibility role. Its board job — "tap the compass to see the whole sea" — died with the
        second view, and a picture that looks tappable and is not is the defect being fixed here.
      */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: chromeInsetX(frame, VOYAGE.compass.right, slack),
          top: chromeY(frame, VOYAGE.compass.y, slack),
        }}
      >
        <CompassRose frame={frame} />
      </View>

      <Counter frame={frame} slack={slack} typeScale={typeScale} text={`${openPlaces} OF ${PLACE_COUNT} OPEN`} />
    </>
  );
}

/**
 * The one gold chip under a node, and **exactly one node may say `YOU ARE HERE`**.
 *
 * The three captions in priority order, because two of them can fall on the same island:
 *
 *   1. `YOU ARE HERE` — the live node, and only the live node. `live` is a single index, so this
 *      is one chip by construction rather than by convention. The board set the same string as a
 *      `sub` field on island 1 as well; that is the bug this ordering exists to make impossible.
 *   2. The next island's countdown — `2 DUELS TO OPEN`. It is the only thing on the map that moves
 *      after a win, and it moves every time.
 *   3. `THE LAST SEA` — derived from "the last island in the chain, while it is still fogged",
 *      never hand-placed on index 4. Once a captain reaches it, rule 1 wins and it reads
 *      `YOU ARE HERE`, which is the correct thing for a place you are standing on to say.
 */
function subCaption(input: {
  index: number;
  live: number;
  nextIsland: number;
  nextCaption: string | null;
  last: number;
  fogged: boolean;
}): string | null {
  if (input.index === input.live) return 'YOU ARE HERE';
  if (input.index === input.nextIsland && input.nextCaption !== null) return input.nextCaption;
  if (input.index === input.last && input.fogged) return 'THE LAST SEA';
  return null;
}

/**
 * The ship's berth: seaward of the live island, level with its middle.
 *
 * "Seaward" is the side facing the far edge of the map, so an island in the left half berths on its
 * right and vice versa — the boat is never half off screen and never on top of the island's own
 * name chip. `board.ts` holds the gap; this decides the side, because the side is a fact about
 * where the island sits and not about how wide the gap is.
 */
function shipLeft(frame: MapFrame, isle: { x: number; w: number }): number {
  const centre = isle.x + isle.w / 2;
  const seaward = centre < VOYAGE.map.width / 2 ? 1 : -1;
  const offset = isle.w / 2 + VOYAGE.ship.shallowBleedX + VOYAGE.ship.gap + VOYAGE.ship.width / 2;
  return mapX(frame, centre + seaward * offset) - art(frame, VOYAGE.ship.width) / 2;
}

/** The berth's other half: the hull box seated so its middle is the island's own middle. */
function shipTop(frame: MapFrame, isle: { y: number; h: number }): number {
  return mapY(frame, isle.y + isle.h / 2) - (art(frame, VOYAGE.ship.width) * SHIP.aspect) / 2;
}

/**
 * `N OF 16 OPEN`.
 *
 * The board prints `4 OF 16 FOUND` beside a chart with two open islands, and no arithmetic over its
 * own data produces a 4 — mock copy, the same class as the `VOYAGER` subtitle. What was shipped
 * instead counted the same thing but kept the board's WORD, and "found" was a lie in both
 * directions: nothing is ever discovered here (there is no per-waypoint visited latch, and building
 * one is engine-track), and a `g4_5` captain used to read `16 OF 16 FOUND` before their first duel
 * because placement handed them the whole map.
 *
 * So the counter says what it measures: places the fog has lifted from. An island counts when it is
 * open; a waypoint counts when the island whose water it sits in is open, which is the same gate
 * that decides whether it can be tapped. With the corrected placement it starts at 3 for a K-1
 * captain and climbs every time an island opens — a number that moves when the captain moves.
 */
function countOpen(nodes: readonly ChartNode[]): number {
  const open = nodes.map((node) => !node.fogged);
  const islands = open.filter(Boolean).length;
  const waypoints = WAYPOINT_GATE.filter((gate) => open[gate] === true).length;
  return islands + waypoints;
}
