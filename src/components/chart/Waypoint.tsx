/**
 * The eleven waypoints — the places between the islands.
 *
 * Board 9d's argument for their existence: *"only the islands gate progress; the waypoints are
 * optional, repeatable and cheap, which is what makes the map feel like a place rather than a
 * menu."* Five silhouettes, no two alike (9c), so a child can read one without reading a word.
 *
 * ── What each one does when tapped ─────────────────────────────────────────────────────────────
 *   buoy   → `/range`, drilling the island whose water it sits in.
 *   rival  → `/duel`, at that same island.
 *   wreck  → `/duel`. Board 9c promises *"a bigger chest and no rank consequence"*, and neither
 *            exists: both need `rewardSettlement` changes outside the chart's ownership. A plain
 *            duel is the honest subset — the differentiation is deferred, not faked (owner ruling 5).
 *   chest  → nothing. See the TODO below.
 *   rock   → nothing, and no target either. Board 9c: *"Pure scenery — a map needs places that are
 *            not tasks, or every glance is a to-do list."*
 *
 * A waypoint whose island is still fogged is drawn and not tappable: sailing to it would set
 * `currentIsland` to a locked island, which is the one thing the fog exists to prevent.
 */
import { useEffect, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import {
  SHIP,
  VOYAGE_NODE,
  WAYPOINT_ART,
  WAYPOINT_BOB,
  WAYPOINT_PARTS,
  WAYPOINT_ROUTE,
  type Waypoint as BoardWaypoint,
  type WaypointKind,
} from './board';
import { art, mapX, mapY, targetSlop, type MapFrame } from './layout';
import { chart, terrain } from './palette';
import { Poly } from '../Poly';
import { font } from '../../theme/tokens';

/** What a screen reader says. The board labels only two of eleven, so these carry the rest. */
const SPOKEN: Record<WaypointKind, string> = {
  buoy: 'Practice buoy. Drill here',
  chest: 'A treasure chest, adrift',
  wreck: 'A wreck. Fight here',
  rival: 'A rival ship. Fight here',
  rock: 'Rocks',
};

export function VoyageWaypoint({
  waypoint,
  frame,
  typeScale,
  reachable,
  onOpen,
}: {
  waypoint: BoardWaypoint;
  frame: MapFrame;
  typeScale: number;
  /** False while the island this waypoint sits beside is still under fog. */
  reachable: boolean;
  onOpen: (kind: WaypointKind) => void;
}) {
  const size = WAYPOINT_ART[waypoint.kind];
  const w = art(frame, size.w);
  const h = art(frame, size.h);
  const destination = WAYPOINT_ROUTE[waypoint.kind];
  const mark = <WaypointMark kind={waypoint.kind} width={w} height={h} />;

  const column = {
    position: 'absolute',
    left: mapX(frame, waypoint.x),
    top: mapY(frame, waypoint.y),
    alignItems: 'center',
    gap: art(frame, VOYAGE_NODE.gap),
  } as const;

  const label =
    waypoint.label === undefined ? null : <WaypointLabel text={waypoint.label} typeScale={typeScale} />;

  if (destination === undefined || !reachable) {
    return (
      <View
        accessible={waypoint.kind !== 'rock'}
        accessibilityRole="image"
        accessibilityLabel={SPOKEN[waypoint.kind]}
        pointerEvents="none"
        style={column}
      >
        {mark}
        {label}
      </View>
    );
  }

  return (
    <View style={column}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={SPOKEN[waypoint.kind]}
        hitSlop={targetSlop(w, h, art(frame, 64))}
        onPress={() => onOpen(waypoint.kind)}
        style={({ pressed }) => (pressed ? { transform: [{ translateY: 2 }] } : null)}
      >
        {mark}
      </Pressable>
      {label}
    </View>
  );
}

/** `DRILL` / `WRECK` — the two labels the board prints on the voyage map. */
function WaypointLabel({ text, typeScale }: { text: string; typeScale: number }) {
  const size = VOYAGE_NODE.waypointChip.size * typeScale;

  return (
    <View
      style={{
        paddingHorizontal: VOYAGE_NODE.waypointChip.padX * typeScale,
        paddingVertical: VOYAGE_NODE.waypointChip.padY * typeScale,
        borderRadius: 999,
        backgroundColor: chart.waterChipSoft,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          fontFamily: font.bodyBold,
          fontSize: size,
          lineHeight: size * 1.3,
          letterSpacing: size * VOYAGE_NODE.waypointChip.tracking,
          color: chart.white,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

/** The silhouette itself, at whatever size it is asked for. */
export function WaypointMark({ kind, width, height }: { kind: WaypointKind; width: number; height: number }) {
  switch (kind) {
    case 'buoy':
      return <BuoyMark width={width} height={height} />;
    case 'chest':
      return <ChestMark width={width} height={height} />;
    case 'wreck':
      return <WreckMark width={width} height={height} />;
    case 'rival':
      return <RivalMark width={width} height={height} />;
    case 'rock':
      return <Poly points={WAYPOINT_PARTS.rock.points} width={width} height={height} fill={terrain.rock} />;
  }
}

/**
 * The ring-and-post float, proportionally.
 *
 * The board draws it twice at two sizes (20/7×8/20×5 in a 26×32 box on the voyage map, 24/8×9/24×6
 * in a 30×38 box on the close chart) and both are the same figure scaled, so it is derived from the
 * asked-for box rather than tabled twice. The 4pt `inset 0 0 0 4px` ring is a real `borderWidth`:
 * CSS's spread-only inset shadow paints INSIDE the box, which is also where RN paints a border.
 */
export function BuoyMark({ width, height }: { width: number; height: number }) {
  const base = WAYPOINT_ART.buoy;
  const scale = width / base.w;
  const ring = WAYPOINT_PARTS.buoy.ring * scale;

  return (
    <View style={{ width, height, alignItems: 'center' }}>
      <View
        style={{
          width: ring,
          height: ring,
          borderRadius: 999,
          backgroundColor: chart.buoyRing,
          borderWidth: WAYPOINT_PARTS.buoy.ringInset * scale,
          borderColor: chart.buoyBand,
        }}
      />
      <View
        style={{
          width: WAYPOINT_PARTS.buoy.post.w * scale,
          height: WAYPOINT_PARTS.buoy.post.h * scale,
          backgroundColor: chart.buoyPost,
        }}
      />
      <View
        style={{
          width: WAYPOINT_PARTS.buoy.base.w * scale,
          height: WAYPOINT_PARTS.buoy.base.h * scale,
          borderRadius: 999,
          backgroundColor: chart.buoyWater,
        }}
      />
    </View>
  );
}

/**
 * The chest, bobbing.
 *
 * TODO(engine): tapping a chest does nothing yet, and it is drawn as scenery.
 * Board 9c wants it to be *"Same object as the victory reveal, so tapping it promises exactly what
 * it delivers"* — which needs two things the app does not have: a reward entry point that can
 * settle a chest from OUTSIDE a duel (today `rewardSettlement` only runs on a duel result), and a
 * per-waypoint looted latch on the captain so a chest cannot be re-opened forever. Both are
 * engine-track. Until they exist, routing a chest to `/harbor` would be the exact lie the board's
 * own sentence forbids, so it stays a picture (owner ruling 4).
 */
function ChestMark({ width, height }: { width: number; height: number }) {
  const scale = width / WAYPOINT_ART.chest.w;
  const spec = WAYPOINT_PARTS.chest;

  return (
    <Bobbing ms={WAYPOINT_BOB.chestMs} rise={SHIP.bob.riseY * scale} width={width} height={height}>
      <View
        style={{
          width,
          height,
          borderTopLeftRadius: spec.radiusTop * scale,
          borderTopRightRadius: spec.radiusTop * scale,
          borderBottomLeftRadius: spec.radiusBottom * scale,
          borderBottomRightRadius: spec.radiusBottom * scale,
          backgroundColor: chart.chestDeep,
          overflow: 'hidden',
        }}
      >
        <View style={{ height: height - spec.insetDy * scale, backgroundColor: chart.chest }} />
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: spec.band.y * scale,
            height: spec.band.h * scale,
            backgroundColor: chart.chestBand,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: spec.lock.x * scale,
            top: spec.lock.y * scale,
            width: spec.lock.w * scale,
            height: spec.lock.h * scale,
            borderRadius: spec.lock.radius * scale,
            backgroundColor: chart.chestLock,
          }}
        />
      </View>
    </Bobbing>
  );
}

/** A half-sunk hull with one grey sail still up. Still. The board gives the wreck no motion. */
function WreckMark({ width, height }: { width: number; height: number }) {
  const scale = width / WAYPOINT_ART.wreck.w;
  const spec = WAYPOINT_PARTS.wreck;

  return (
    <View style={{ width, height }}>
      <Poly
        points={spec.hull.points}
        width={spec.hull.w * scale}
        height={spec.hull.h * scale}
        fill={chart.wreck}
        style={{ position: 'absolute', left: 0, bottom: 0 }}
      />
      <View
        style={{
          position: 'absolute',
          left: spec.mast.x * scale,
          bottom: spec.mast.bottom * scale,
          width: spec.mast.w * scale,
          height: spec.mast.h * scale,
          backgroundColor: chart.wreck,
          transform: [{ rotate: `${spec.mast.angle}deg` }],
        }}
      />
      <Poly
        points={spec.sail.points}
        width={spec.sail.w * scale}
        height={spec.sail.h * scale}
        fill={chart.wreckSail}
        style={{ position: 'absolute', left: spec.sail.x * scale, bottom: spec.sail.bottom * scale }}
      />
    </View>
  );
}

/** A purple sail. Board 9c: *"Purple only ever means 'not you'."* */
function RivalMark({ width, height }: { width: number; height: number }) {
  const scale = width / WAYPOINT_ART.rival.w;
  const spec = WAYPOINT_PARTS.rival;

  return (
    <Bobbing ms={WAYPOINT_BOB.rivalMs} rise={SHIP.bob.riseY * scale} width={width} height={height}>
      <View
        style={{
          position: 'absolute',
          left: spec.mast.x * scale,
          bottom: spec.mast.bottom * scale,
          width: spec.mast.w * scale,
          height: spec.mast.h * scale,
          backgroundColor: chart.rivalMast,
        }}
      />
      <Poly
        points={spec.sail.points}
        width={spec.sail.w * scale}
        height={spec.sail.h * scale}
        fill={chart.rivalSail}
        style={{ position: 'absolute', left: spec.sail.x * scale, bottom: spec.sail.bottom * scale }}
      />
      <Poly
        points={spec.hull.points}
        width={spec.hull.w * scale}
        height={spec.hull.h * scale}
        fill={chart.rivalHull}
        style={{ position: 'absolute', left: spec.hull.x * scale, bottom: spec.hull.bottom * scale }}
      />
    </Bobbing>
  );
}

/**
 * `sc-bob`, shared by the chest and the rival — the same keyframe the ship rides.
 *
 * `translateY(0 → −4px → 0)` with `rotate(−2deg → 2deg)`. Nothing else on the map is authored with
 * a competing transform, so unlike the ship there is no lie to unpick here; the values are simply
 * the keyframe's.
 */
function Bobbing({
  ms,
  rise,
  width,
  height,
  children,
}: {
  ms: number;
  /** `translateY` travel in pixels, already scaled by the caller's art factor. */
  rise: number;
  width: number;
  height: number;
  children: ReactNode;
}) {
  const bob = useSharedValue(0);

  useEffect(() => {
    bob.value = withRepeat(
      withSequence(
        withTiming(1, { duration: ms / 2, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: ms / 2, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [bob, ms]);

  // Hoisted out of the worklet: a `useAnimatedStyle` body runs on the UI runtime and may not call
  // a captured JS closure, so every number it reads is resolved on this side of the boundary.
  const travel = rise;
  const tilt = SHIP.bob.rotateDeg;
  const bobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -travel * bob.value }, { rotate: `${-tilt + 2 * tilt * bob.value}deg` }],
  }));

  return <Animated.View style={[{ width, height }, bobStyle]}>{children}</Animated.View>;
}
