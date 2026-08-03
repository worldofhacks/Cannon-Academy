/**
 * A station — one island's place on the chart, in whichever of the five states it is in.
 *
 * The state is not decided here. `services/chart.ts` decides fog and order and has frozen tests;
 * `layout.ts` pairs its answer with the board's own per-position drawing. This file is the
 * renderer, and the only judgement it makes is which measured numbers to reach for.
 *
 * One marker serves both screens. The compositions differ (owner ruling 3) but a NODE is the same
 * object in both — a head, a name chip, sometimes a small chip under it — so the sizes arrive as a
 * `MarkerLook` from `board.ts` rather than being branched on a screen name.
 *
 * The requirement sentence is printed as `requirementText()` returns it. It deliberately names the
 * PLACE ("Train at Isla Products to lift the fog.") rather than a skill id, and a test asserts no
 * snake_case ever reaches a child — so it is rendered, never rephrased. The board's own chip reads
 * `MASTER ÷ TO LIFT THE FOG`, which is mock copy of the same class as its `VOYAGER` subtitle: it
 * names the operator hidden BY the fog rather than the island that lifts it, which is the one thing
 * a child cannot act on.
 */
import { useEffect, type ReactNode } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type { IslandId } from '@content/schemas';

import { RING } from './board';
import { stationPresentation, targetSlop, type StationState } from './layout';
import { chart } from './palette';
import type { ChartNode } from '../../services/chart';
import { font } from '../../theme/tokens';

/**
 * U+FE0E, the text-presentation selector.
 *
 * `✓` is emoji-capable. Left bare, iOS may draw it as a colour emoji, which ignores the `color`
 * prop entirely — a dark tick turns green-and-white on a green disc and disappears.
 */
const TEXT_PRESENTATION = '\uFE0E';

const RING_SPAN = RING.to - RING.from;

/** Every measured size a node needs, so one marker can draw both screens' geometry. */
export interface MarkerLook {
  readonly live: {
    readonly ring: number;
    readonly disc: number;
    readonly discInset: number;
    readonly shadowDy: number;
    readonly glyphSize: number;
  };
  readonly cleared: { readonly size: number; readonly shadowDy: number; readonly tickSize: number };
  readonly locked: { readonly size: number; readonly shadowDy: number; readonly glyphSize: number };
  readonly gap: number;
  readonly chip: {
    readonly padX: number;
    readonly padY: number;
    readonly size: number;
    readonly shadowDy: number;
  };
  readonly liveChipSize: number;
  readonly sub: {
    readonly padX: number;
    readonly padY: number;
    readonly size: number;
    readonly tracking: number;
  };
  readonly requirement?: {
    readonly padX: number;
    readonly padY: number;
    readonly size: number;
    readonly tracking: number;
  };
  /** Board 9b's transparent target around the drawn disc. */
  readonly hit: number;
}

interface MarkerProps {
  readonly node: ChartNode;
  readonly state: StationState;
  /** Absolute placement, computed by the screen that owns the coordinate space. */
  readonly position: ViewStyle;
  readonly look: MarkerLook;
  /** Type scale. Chips hug text, so they follow type rather than art (`theme/responsive.ts`). */
  readonly typeScale: number;
  /** The board prints one under two of its five islands. */
  readonly sub: string | null;
  /** Printed under the name chip when the board's fog group is drawing this node. */
  readonly requirement: string | null;
  readonly onSail: (id: IslandId) => void;
}

export function StationMarker({
  node,
  state,
  position,
  look,
  typeScale,
  sub,
  requirement,
  onSail,
}: MarkerProps) {
  const presentation = stationPresentation(node, state, requirement);
  // The BAND-TRUE name, carried on the node exactly like `glyph` (D-14 / A-071): `chartNodes`
  // resolves the captain's band cell (`islandCurriculumFor`), so this marker cannot label a K-1
  // captain's map with another band's island name any more than it can with their operator.
  const label = node.displayName;
  const glyph = node.glyph;

  const head =
    presentation.markerHead === 'cleared' ? (
      <ClearedHead look={look} typeScale={typeScale} />
    ) : presentation.markerHead === 'live' ? (
      <LiveHead look={look} glyph={glyph} typeScale={typeScale} />
    ) : presentation.markerHead === 'available' ? (
      <AvailableHead look={look} glyph={glyph} typeScale={typeScale} />
    ) : (
      <LockedHead look={look} glyph={glyph} typeScale={typeScale} />
    );

  const live = presentation.markerHead === 'live';
  const locked = presentation.markerHead === 'locked' || presentation.markerHead === 'silhouette';
  const body = (
    <>
      {head}
      <NameChip label={label} live={live} locked={locked} look={look} typeScale={typeScale} />
      {sub === null ? null : <SubChip text={sub} look={look} typeScale={typeScale} />}
      {requirement === null || look.requirement === undefined ? null : (
        <RequirementChip text={requirement} look={look} typeScale={typeScale} />
      )}
    </>
  );

  const box: ViewStyle = { position: 'absolute', alignItems: 'center', gap: look.gap, ...position };

  if (!presentation.tappable) {
    // A fogged node is not tappable — it is a plain View, not a disabled Pressable, so there is no
    // control here to press at all. It still SPEAKS: the requirement is what a screen reader reads
    // out, which is why it is `accessible` rather than hidden.
    return (
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={presentation.accessibilityLabel}
        style={box}
      >
        {body}
      </View>
    );
  }

  const drawn = live ? look.live.ring : look.cleared.size;

  return (
    <Pressable
      onPress={() => onSail(node.island.id)}
      accessibilityRole="button"
      accessibilityLabel={presentation.accessibilityLabel}
      hitSlop={targetSlop(drawn, drawn, look.hit)}
      style={({ pressed }) => [box, pressed ? { transform: [{ translateY: 2 }] } : null]}
    >
      {body}
    </Pressable>
  );
}

/**
 * The live target: the board's only animation with a beat.
 *
 * `sc-ring` runs `scale(.82) opacity(.9) → scale(1.5) opacity(0)` over 1.8s. The element is
 * authored at `opacity:.5` and never renders at it, because the keyframe animates opacity too —
 * see `board.ts`, trap 2. Board 9d: *"A child's eye lands on the gold ring because it is the only
 * thing keeping time."*
 */
function LiveHead({ look, glyph, typeScale }: { look: MarkerLook; glyph: string; typeScale: number }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: RING.ms, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
  }, [pulse]);

  // `RING.from`/`RING_SPAN` are module constants captured by value. Nothing in this body calls a
  // JS closure — a `useAnimatedStyle` runs on the UI runtime and cannot, and the crash would only
  // ever show up on a device.
  const from = RING.from;
  const opacityFrom = RING.opacityFrom;
  const ringStyle = useAnimatedStyle(() => ({
    opacity: opacityFrom * (1 - pulse.value),
    transform: [{ scale: from + RING_SPAN * pulse.value }],
  }));

  return (
    <View style={{ width: look.live.ring, height: look.live.ring }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            top: 0,
            width: look.live.ring,
            height: look.live.ring,
            borderRadius: 999,
            backgroundColor: chart.live,
          },
          ringStyle,
        ]}
      />
      <Disc
        size={look.live.disc}
        left={look.live.discInset}
        top={look.live.discInset}
        fill={chart.live}
        shadow={chart.liveShadow}
        dy={look.live.shadowDy}
      >
        <Glyph text={glyph} size={look.live.glyphSize * typeScale} display />
      </Disc>
    </View>
  );
}

/** Cleared: a green disc, a tick, and the board's plank shadow — it is solid ground now. */
function ClearedHead({ look, typeScale }: { look: MarkerLook; typeScale: number }) {
  return (
    <Disc
      size={look.cleared.size}
      fill={chart.cleared}
      shadow={chart.clearedShadow}
      dy={look.cleared.shadowDy}
    >
      {/*
        `#14283C` on `#2FB65E`, which is the board's own pairing and measures 5.54. White on the
        same green is 2.63 and is one of the four project-banned pairs (A-054) — it was shipping
        here, invisible to `text-contrast.test.ts` because that file certifies PAIRS rather than
        call sites, so the ban itself never looked at this tick.
      */}
      <Glyph text={`✓${TEXT_PRESENTATION}`} size={look.cleared.tickSize * typeScale} />
    </Disc>
  );
}

/** Available: open and tappable, but deliberately has no success-green tick. */
function AvailableHead({ look, glyph, typeScale }: { look: MarkerLook; glyph: string; typeScale: number }) {
  return (
    <Disc size={look.cleared.size} fill={chart.live} shadow={chart.liveShadow} dy={look.cleared.shadowDy}>
      <Glyph text={glyph} size={look.locked.glyphSize * typeScale} display />
    </Disc>
  );
}

/**
 * Locked — near or far, drawn the same.
 *
 * Board 9a: *"Everything unearned is under fog, but nothing is invisible: a silhouette, a name and
 * a skill glyph survive the fog on every locked node, because anticipation is the whole point of a
 * map."* So there is no padlock any more and no shrunken far-end variant; the two locked states
 * differ in what a screen reader says, not in what is drawn.
 */
function LockedHead({ look, glyph, typeScale }: { look: MarkerLook; glyph: string; typeScale: number }) {
  return (
    <Disc size={look.locked.size} fill={chart.locked} shadow={chart.lockedShadow} dy={look.locked.shadowDy}>
      <Glyph text={glyph} size={look.locked.glyphSize * typeScale} display />
    </Disc>
  );
}

/** A disc with the board's hard offset shadow — the same circle again, `dy` points lower. */
function Disc({
  size,
  left,
  top,
  fill,
  shadow,
  dy,
  children,
}: {
  size: number;
  left?: number;
  top?: number;
  fill: string;
  shadow: string;
  dy: number;
  children: ReactNode;
}) {
  const placed = left === undefined ? undefined : ({ position: 'absolute', left, top } as const);

  return (
    <View style={[{ width: size, height: size }, placed]}>
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

function Glyph({ text, size, display }: { text: string; size: number; display?: boolean }) {
  return (
    <Text
      style={{
        fontFamily: display === true ? font.displayBold : font.bodyBold,
        fontSize: size,
        lineHeight: size * 1.15,
        color: chart.ink,
      }}
    >
      {text}
    </Text>
  );
}

function NameChip({
  label,
  live,
  locked,
  look,
  typeScale,
}: {
  label: string;
  live: boolean;
  locked: boolean;
  look: MarkerLook;
  typeScale: number;
}) {
  const size = (live ? look.liveChipSize : look.chip.size) * typeScale;
  const dark = live || locked;

  return (
    <View
      style={{
        paddingHorizontal: look.chip.padX * typeScale,
        paddingVertical: look.chip.padY * typeScale,
        borderRadius: 999,
        backgroundColor: live ? chart.darkChip : locked ? chart.lockedChip : chart.parchment,
        borderBottomWidth: dark ? 0 : look.chip.shadowDy * typeScale,
        borderBottomColor: chart.parchmentShadow,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          fontFamily: font.displayBold,
          fontSize: size,
          lineHeight: size * 1.3,
          color: dark ? chart.parchment : chart.ink,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/** `YOU ARE HERE` and `THE LAST SEA` — the board's two gold sub-chips. */
function SubChip({ text, look, typeScale }: { text: string; look: MarkerLook; typeScale: number }) {
  const size = look.sub.size * typeScale;

  return (
    <View
      style={{
        paddingHorizontal: look.sub.padX * typeScale,
        paddingVertical: look.sub.padY * typeScale,
        borderRadius: 999,
        backgroundColor: chart.gold,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          fontFamily: font.bodyBold,
          fontSize: size,
          lineHeight: size * 1.3,
          letterSpacing: size * look.sub.tracking,
          color: chart.ink,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

/** Why the fogged island is closed, in the words `requirementText()` chose. */
function RequirementChip({ text, look, typeScale }: { text: string; look: MarkerLook; typeScale: number }) {
  const spec = look.requirement;
  if (spec === undefined) return null;
  const size = spec.size * typeScale;

  return (
    <View
      style={{
        paddingHorizontal: spec.padX * typeScale,
        paddingVertical: spec.padY * typeScale,
        borderRadius: 999,
        backgroundColor: chart.parchment,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          fontFamily: font.bodyBold,
          fontSize: size,
          lineHeight: size * 1.3,
          letterSpacing: size * spec.tracking,
          color: chart.requirementInk,
        }}
      >
        {text}
      </Text>
    </View>
  );
}
