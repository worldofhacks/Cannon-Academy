/**
 * A station — one island's place on the chart, in whichever of the four states it is in.
 *
 * The state is not decided here. `services/chart.ts` decides fog and order and has frozen tests;
 * `layout.ts` pairs its answer with the board's own per-position drawing. This file is the
 * renderer, and the only judgement it makes is which measured numbers to reach for.
 *
 * The requirement sentence is likewise printed as `requirementText()` returns it. It deliberately
 * names the PLACE ("Train at Port Sumwich to lift the fog.") rather than a skill id, and a test
 * asserts no snake_case ever reaches a child — so it is rendered, never rephrased.
 */
import { useEffect, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type { IslandId } from '@content/schemas';

import { Blob } from './Blob';
import { NODE, STATIONS, islandGlyph, type Station as BoardStation } from './board';
import { art, mapX, mapY, stationPresentation, type MapFrame, type StationState } from './layout';
import { chart } from './palette';
import type { ChartNode } from '../../services/chart';
import { font, MIN_TAP_TARGET } from '../../theme/tokens';

/**
 * The board does not record a shadow offset for the sand, only its colour. 4pt is the offset every
 * hard shadow on this screen that IS recorded uses — the cleared node, the live node, the dock —
 * so the islands cast the same one rather than a second, invented depth.
 */
const SAND_SHADOW_DY = 4;

/**
 * How wide a marker's label column is allowed to be, in design points.
 *
 * A node is anchored by its horizontal CENTRE, and React Native centres a child on a box rather
 * than on a point — so the column is a fixed width the chips centre inside. 160 is the widest that
 * still keeps the outermost node (cx 283.6) clear of the screen edge at the 360pt floor.
 */
const LABEL_COLUMN = 160;

/**
 * U+FE0E, the text-presentation selector.
 *
 * `▸` and `✓` are emoji-capable. Left bare, iOS may draw them as colour emoji, which ignores the
 * `color` prop entirely — a white tick turns green-and-white on a green disc and disappears.
 */
const TEXT_PRESENTATION = '\uFE0E';

const RING_FROM = NODE.live.ringFrom;
const RING_SPAN = NODE.live.ringTo - NODE.live.ringFrom;

/** The sand, its foliage and — at Port Sumwich only — its hut. Drawn under the fog and the nodes. */
export function IslandLand({ station, frame }: { station: BoardStation; frame: MapFrame }) {
  const land = station.land;
  if (land === undefined) return null;

  const width = art(frame, land.w);
  const height = art(frame, land.h);
  const hut = land.hut;

  return (
    <Blob
      radii={land.radii}
      width={width}
      height={height}
      fill={chart.sand}
      shadow={{ color: chart.sandShadow, dy: art(frame, SAND_SHADOW_DY) }}
      style={{
        position: 'absolute',
        left: mapX(frame, land.cx) - width / 2,
        top: mapY(frame, land.cy) - height / 2,
      }}
    >
      <Blob
        radii={land.foliage.radii}
        width={art(frame, land.foliage.w)}
        height={art(frame, land.foliage.h)}
        fill={chart.foliage}
        style={{
          position: 'absolute',
          left: art(frame, land.foliage.dx),
          top: art(frame, land.foliage.dy),
        }}
      />
      {hut === undefined ? null : (
        <View
          style={{
            position: 'absolute',
            right: art(frame, hut.right),
            top: art(frame, hut.dy),
            width: art(frame, hut.w),
            height: art(frame, hut.h),
            borderRadius: art(frame, hut.radius),
            backgroundColor: chart.hut,
          }}
        />
      )}
    </Blob>
  );
}

interface MarkerProps {
  readonly index: number;
  readonly node: ChartNode;
  readonly state: StationState;
  readonly frame: MapFrame;
  /** Type scale. Chips hug text, so they follow type rather than art (`theme/responsive.ts`). */
  readonly typeScale: number;
  readonly requirement: string | null;
  readonly onSail: (id: IslandId) => void;
}

export function StationMarker({ index, node, state, frame, typeScale, requirement, onSail }: MarkerProps) {
  const station = STATIONS[index];
  if (station === undefined) return null;

  const label = node.island.displayName;
  const presentation = stationPresentation(node, state, requirement);
  const column = LABEL_COLUMN * typeScale;
  const gap = index === 0 ? NODE.chipGap : NODE.chipGapTight;

  const head =
    presentation.markerHead === 'silhouette' ? (
      <SilhouetteHead size={art(frame, station.lockedSize)} label={label} typeScale={typeScale} />
    ) : presentation.markerHead === 'locked' ? (
      <LockedHead size={art(frame, station.lockedSize)} frame={frame} />
    ) : presentation.markerHead === 'live' ? (
      <LiveHead frame={frame} glyph={islandGlyph[node.island.id]} typeScale={typeScale} />
    ) : presentation.markerHead === 'cleared' ? (
      <ClearedHead frame={frame} typeScale={typeScale} />
    ) : (
      <AvailableHead frame={frame} glyph={islandGlyph[node.island.id]} typeScale={typeScale} />
    );

  const body = (
    <View style={{ alignItems: 'center' }}>
      {head}
      {presentation.markerHead === 'silhouette' ? null : (
        <View style={{ marginTop: gap * typeScale, alignItems: 'center' }}>
          <NameChip label={label} locked={presentation.markerHead === 'locked'} typeScale={typeScale} />
          {state === 'current' ? <SailChip typeScale={typeScale} /> : null}
        </View>
      )}
    </View>
  );

  const left = mapX(frame, station.node.cx) - column / 2;
  const top = mapY(frame, station.node.top);
  const box = { position: 'absolute', left, top, width: column, alignItems: 'center' } as const;

  if (!presentation.tappable) {
    // A fogged node is not tappable — it is a plain View, not a disabled Pressable, so there is no
    // control here to press at all. It still SPEAKS: the requirement is what a screen reader reads
    // out, which is why it is `accessible` rather than hidden.
    return (
      <>
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={presentation.accessibilityLabel}
          style={box}
        >
          {body}
        </View>
        {requirement === null ? null : (
          <RequirementChip frame={frame} typeScale={typeScale} text={requirement} />
        )}
      </>
    );
  }

  const disc = art(frame, state === 'current' ? NODE.live.size : NODE.cleared.size);
  const slop = Math.max(0, (MIN_TAP_TARGET - disc) / 2);

  return (
    <Pressable
      onPress={() => onSail(node.island.id)}
      accessibilityRole="button"
      accessibilityLabel={presentation.accessibilityLabel}
      hitSlop={{ top: slop, bottom: slop, left: 0, right: 0 }}
      style={({ pressed }) => [box, pressed ? { transform: [{ translateY: 2 }] } : null]}
    >
      {body}
    </Pressable>
  );
}

/** Available: open and tappable, but deliberately has no success-green tick. */
function AvailableHead({ frame, glyph, typeScale }: { frame: MapFrame; glyph: string; typeScale: number }) {
  const size = art(frame, NODE.cleared.size);
  return (
    <Disc size={size} fill={chart.live} shadow={chart.liveShadow} dy={art(frame, NODE.live.shadowDy)}>
      <Text
        style={{
          fontFamily: font.displayBold,
          fontSize: NODE.live.glyphSize * typeScale,
          lineHeight: NODE.live.glyphSize * typeScale * 1.15,
          color: chart.ink,
        }}
      >
        {glyph}
      </Text>
    </Disc>
  );
}

/** Cleared: the board's 52pt disc, its 4pt hard shadow and the 5pt spread ring around both. */
function ClearedHead({ frame, typeScale }: { frame: MapFrame; typeScale: number }) {
  const size = art(frame, NODE.cleared.size);
  const spread = art(frame, NODE.cleared.ringSpread);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          left: -spread,
          top: -spread,
          width: size + spread * 2,
          height: size + spread * 2,
          borderRadius: 999,
          backgroundColor: chart.clearedRing,
        }}
      />
      <Disc
        size={size}
        fill={chart.cleared}
        shadow={chart.clearedShadow}
        dy={art(frame, NODE.cleared.shadowDy)}
      >
        <Text
          style={{
            fontFamily: font.displayBold,
            fontSize: NODE.cleared.tickSize * typeScale,
            lineHeight: NODE.cleared.tickSize * typeScale * 1.15,
            color: chart.white,
          }}
        >
          {`✓${TEXT_PRESENTATION}`}
        </Text>
      </Disc>
    </View>
  );
}

/** The live target: a 54pt disc inside a 60pt ring that pulses `.8 → 1.9` every 1.6s. */
function LiveHead({ frame, glyph, typeScale }: { frame: MapFrame; glyph: string; typeScale: number }) {
  const size = art(frame, NODE.live.size);
  const ring = art(frame, NODE.live.ring);
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: NODE.live.ringMs, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
  }, [pulse]);

  // `RING_FROM`/`RING_SPAN` are module constants captured by value. Nothing in this body calls a
  // JS closure — a `useAnimatedStyle` runs on the UI runtime and cannot, and the crash would only
  // ever show up on a device.
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 1 - pulse.value,
    transform: [{ scale: RING_FROM + RING_SPAN * pulse.value }],
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: (size - ring) / 2,
            top: (size - ring) / 2,
            width: ring,
            height: ring,
            borderRadius: 999,
            backgroundColor: chart.liveRing,
          },
          ringStyle,
        ]}
      />
      <Disc size={size} fill={chart.live} shadow={chart.liveShadow} dy={art(frame, NODE.live.shadowDy)}>
        <Text
          style={{
            fontFamily: font.displayBold,
            fontSize: NODE.live.glyphSize * typeScale,
            lineHeight: NODE.live.glyphSize * typeScale * 1.15,
            color: chart.ink,
          }}
        >
          {glyph}
        </Text>
      </Disc>
    </View>
  );
}

/** Locked but near: a flat disc with a padlock. No shadow — the board draws it flat under the fog. */
function LockedHead({ size, frame }: { size: number; frame: MapFrame }) {
  return (
    <Disc size={size} fill={chart.lockedNode} shadow={chart.lockedNode} dy={0}>
      <Padlock size={art(frame, NODE.locked.lockSize)} ink={chart.frame} />
    </Disc>
  );
}

/** The far end of the map: a 30pt disc, a small label 2pt under it, the whole group at .75. */
function SilhouetteHead({ size, label, typeScale }: { size: number; label: string; typeScale: number }) {
  return (
    <View style={{ alignItems: 'center', opacity: NODE.silhouette.opacity }}>
      <View style={{ width: size, height: size, borderRadius: 999, backgroundColor: chart.lockedNode }} />
      <Text
        numberOfLines={1}
        style={{
          marginTop: NODE.silhouette.gap * typeScale,
          fontFamily: font.bodyBold,
          fontSize: NODE.silhouette.labelSize * typeScale,
          lineHeight: NODE.silhouette.labelSize * typeScale * 1.3,
          color: chart.silhouetteLabel,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/** A disc with the board's hard offset shadow — the same circle again, `dy` points lower. */
function Disc({
  size,
  fill,
  shadow,
  dy,
  children,
}: {
  size: number;
  fill: string;
  shadow: string;
  dy: number;
  children: ReactNode;
}) {
  return (
    <View style={{ width: size, height: size }}>
      {dy <= 0 ? null : (
        <View
          style={{
            position: 'absolute',
            top: dy,
            width: size,
            height: size,
            borderRadius: 999,
            backgroundColor: shadow,
          }}
        />
      )}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          backgroundColor: fill,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </View>
    </View>
  );
}

/** A padlock, drawn rather than typed: `🔒` is a colour emoji on iOS and ignores `color`. */
function Padlock({ size, ink }: { size: number; ink: string }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end' }}>
      <View
        style={{
          position: 'absolute',
          top: size * 0.06,
          width: size * 0.52,
          height: size * 0.52,
          borderWidth: Math.max(1.5, size * 0.11),
          borderBottomWidth: 0,
          borderColor: ink,
          borderTopLeftRadius: 999,
          borderTopRightRadius: 999,
        }}
      />
      <View
        style={{
          width: size * 0.78,
          height: size * 0.5,
          borderRadius: size * 0.14,
          backgroundColor: ink,
          marginBottom: size * 0.1,
        }}
      />
    </View>
  );
}

function NameChip({ label, locked, typeScale }: { label: string; locked: boolean; typeScale: number }) {
  return (
    <View
      style={{
        paddingHorizontal: (locked ? NODE.locked.chipPadX : NODE.chip.padX) * typeScale,
        paddingVertical: (locked ? NODE.locked.chipPadY : NODE.chip.padY) * typeScale,
        borderRadius: 999,
        backgroundColor: locked ? chart.lockedChip : chart.parchment,
        borderBottomWidth: locked ? 0 : NODE.chip.shadowDy * typeScale,
        borderBottomColor: chart.parchmentShadow,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          fontFamily: font.displayBold,
          fontSize: (locked ? NODE.locked.chipSize : NODE.chip.size) * typeScale,
          lineHeight: (locked ? NODE.locked.chipSize : NODE.chip.size) * typeScale * 1.3,
          color: locked ? chart.parchment : chart.ink,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/** `SAIL HERE ▸` — board 4f rises it in over 240ms on cold entry, "the same rise as everything else". */
function SailChip({ typeScale }: { typeScale: number }) {
  const rise = useSharedValue(0);

  useEffect(() => {
    rise.value = withTiming(1, { duration: NODE.sailRiseMs, easing: Easing.out(Easing.quad) });
  }, [rise]);

  // Hoisted out of the worklet: the body below may not call a JS closure.
  const travel = NODE.sailRisePx * typeScale;
  const riseStyle = useAnimatedStyle(() => ({
    opacity: rise.value,
    transform: [{ translateY: travel * (1 - rise.value) }],
  }));

  return (
    <Animated.View
      style={[
        {
          marginTop: NODE.chipGapTight * typeScale,
          paddingHorizontal: NODE.sailChip.padX * typeScale,
          paddingVertical: NODE.sailChip.padY * typeScale,
          borderRadius: 999,
          backgroundColor: chart.gold,
        },
        riseStyle,
      ]}
    >
      <Text
        style={{
          fontFamily: font.bodyBold,
          fontSize: NODE.sailChip.size * typeScale,
          lineHeight: NODE.sailChip.size * typeScale * 1.3,
          letterSpacing: NODE.sailChip.size * NODE.sailChip.tracking * typeScale,
          color: chart.ink,
        }}
      >
        {`SAIL HERE ▸${TEXT_PRESENTATION}`}
      </Text>
    </Animated.View>
  );
}

/**
 * Why the nearest closed island is closed, in the words `requirementText()` chose.
 *
 * The board pins this at a fixed MAP y (393) rather than hanging it off a node, and that 393 is
 * not arbitrary: station 2's marker ends at 364, its name chip runs 368→389, and 4pt of
 * `chipGapTight` below that is 393. So the constant IS "just under the first locked node" for the
 * captain the board draws.
 *
 * It is still rendered at the recorded y, centred on the map, rather than re-derived per node.
 * 187.5 — the cx the board's own chip hangs under — is the map's exact centre, so this reproduces
 * the board at the board's own state; and it is the only placement that keeps a 38-character
 * sentence on one line and on screen when the nearest closed island is the one at cx 283.6, which
 * is what an early captain actually sees.
 */
function RequirementChip({ frame, typeScale, text }: { frame: MapFrame; typeScale: number; text: string }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: mapY(frame, NODE.requirementChip.top),
        alignItems: 'center',
      }}
    >
      <View
        style={{
          paddingHorizontal: NODE.requirementChip.padX * typeScale,
          paddingVertical: NODE.requirementChip.padY * typeScale,
          borderRadius: 999,
          backgroundColor: chart.requirementChip,
        }}
      >
        <Text
          style={{
            fontFamily: font.bodyBold,
            fontSize: NODE.requirementChip.size * typeScale,
            lineHeight: NODE.requirementChip.size * typeScale * 1.35,
            letterSpacing: NODE.requirementChip.size * NODE.requirementChip.tracking * typeScale,
            color: chart.requirementInk,
          }}
        >
          {text}
        </Text>
      </View>
    </View>
  );
}
