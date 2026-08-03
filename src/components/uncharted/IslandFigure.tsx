/**
 * The centre island — one generated island, drawn from its A-078 document (A-082 item 3).
 *
 * Everything visual is dealt data over board-published vocabulary: silhouette geometry from
 * `GEN_RECIPE_GEOMETRY` (the ISLANDS table rows, verbatim), palette from `GEN_MOODS[doc.mood]`
 * (six token substitutions — sand, grass and water are the only channels a mood touches here;
 * the marker, banner and chrome never shift), pieces from the kit rows (`PIECE_ART`), the
 * marker glyph derived as `SKILL_GLYPH[skills[0]]` (never a document field), and the name in a
 * 19pt Baloo pill that ellipsises and never wraps (the board's 24-character banner law).
 *
 * The three ticket-named animations live here: the arriving fog-part (620ms, the two halves),
 * the ready glow + marker rings, and nothing else — ambient sway is deferred with the wall's.
 * Every `useAnimatedStyle` body reads only shared values and hoisted numbers (A-018).
 */
import { useEffect } from 'react';
import { Image, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import {
  GEN_MOODS,
  GEN_RECIPE_GEOMETRY,
  type GenIslandDoc,
  type GenIslandMoodSpec,
  type GenIslandPiece,
  type GenIslandSlot,
} from '@content/genIsland';
import { getSkill } from '@content/index';

import { Blob } from '../chart/Blob';
import { Poly } from '../Poly';
import { sprite } from '../../theme/sprites';
import { SKILL_GLYPH } from '../../theme/rankPresentation';
import { color, font } from '../../theme/tokens';
import {
  BANNER_U,
  boardLiterals,
  CENTER,
  CENTER_FOG,
  FOG_PART_MS,
  ISLE_FEATURE,
  MARKER,
  PALM_FROND_POINTS,
  parseCornerPercents,
  PIECE_ANCHORS,
  PIECE_ART,
  SHIP_U,
  SUB_CHIP,
  unchartedTerrain,
  type PiecePart,
  type UnchartedStateSpec,
} from './unchartedBoard';

/** The sprite manifest's own 66×113 map boat, heeled at the board's −16°. */
const SHIP_ASPECT = 113 / 66;

interface IslandFigureProps {
  readonly doc: GenIslandDoc;
  readonly spec: UnchartedStateSpec;
  /** Uniform art scale over the 402-wide board space. */
  readonly art: number;
}

/**
 * Renders the whole centre band (402×352 board space): glow, isle, marker column, ship.
 * The parent positions and sizes the band; everything inside is board-coordinate × art.
 */
export function IslandFigure({ doc, spec, art }: IslandFigureProps) {
  const mood = GEN_MOODS[doc.mood];
  const geo = GEN_RECIPE_GEOMETRY[doc.recipe];
  const glyph = SKILL_GLYPH[doc.skills[0]!];
  const skillName = getSkill(doc.skills[0]!).displayName.toUpperCase();

  return (
    <View pointerEvents="none" style={{ width: 402 * art, height: CENTER.height * art }}>
      {spec.centerGlows ? <ReadyGlow art={art} /> : null}

      <View
        style={{
          position: 'absolute',
          left: CENTER.isle.left * art,
          top: CENTER.isle.top * art,
          width: CENTER.isle.w * art,
          height: CENTER.isle.h * art,
        }}
      >
        {/* Shallow ring — the mood's water channel, half opacity, the board's −18/−14 bleed. */}
        <Blob
          radii={parseCornerPercents(geo.shallowR)}
          width={(CENTER.isle.w + CENTER.shallow.bleedX * 2) * art}
          height={(CENTER.isle.h + CENTER.shallow.bleedY * 2) * art}
          fill={mood.water.hex}
          opacity={CENTER.shallow.opacity}
          style={{
            position: 'absolute',
            left: -CENTER.shallow.bleedX * art,
            top: -CENTER.shallow.bleedY * art,
          }}
        />
        {/* Sand, then grass, each with the board's inset band. */}
        <Blob
          radii={parseCornerPercents(geo.sandR)}
          width={CENTER.isle.w * art}
          height={CENTER.isle.h * art}
          fill={mood.sand.hex}
          innerShadow={{ color: mood.sandDeep.hex, dy: CENTER.sandInset * art }}
        >
          <Blob
            radii={parseCornerPercents(geo.grassR)}
            width={geo.grassW * art}
            height={geo.grassH * art}
            fill={mood.grass.hex}
            innerShadow={{ color: mood.grassDeep.hex, dy: CENTER.grassInset * art }}
            style={{ position: 'absolute', left: geo.grassL * art, top: geo.grassT * art }}
          />

          <RecipeFeature doc={doc} art={art} mood={mood} />

          {/* The recipe's own measured palms — the document's guaranteed shore palm cluster. */}
          {geo.palms.map((palm, i) => (
            <View key={i}>
              <View
                style={{
                  position: 'absolute',
                  left: palm.left * art,
                  top: palm.top * art,
                  width: ISLE_FEATURE.palm.trunkW * art,
                  height: palm.h * art,
                  borderRadius: ISLE_FEATURE.palm.trunkRadius * art,
                  backgroundColor: unchartedTerrain.trunk,
                }}
              />
              <Poly
                points={PALM_FROND_POINTS}
                width={ISLE_FEATURE.palm.frondW * art}
                height={ISLE_FEATURE.palm.frondH * art}
                fill={color.palmFrond}
                style={{ position: 'absolute', left: palm.fl * art, top: palm.ft * art }}
              />
            </View>
          ))}

          {geo.rocks.map((rock, i) => (
            <Poly
              key={i}
              points={ISLE_FEATURE.rockPoints}
              width={rock.w * art}
              height={rock.h * art}
              fill={color.driftRock}
              style={{ position: 'absolute', left: rock.left * art, top: rock.top * art }}
            />
          ))}

          <PlacedPieces doc={doc} art={art} mood={mood} />
        </Blob>

        {spec.centerFogged ? <FogCurtain art={art} /> : null}
      </View>

      {/* Marker, banner, skill chip — the mood may never touch these. */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: MARKER.top * art,
          alignItems: 'center',
          gap: MARKER.gap * art,
        }}
      >
        <View
          style={{
            width: MARKER.box * art,
            height: MARKER.box * art,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {spec.markerRings ? <MarkerRing art={art} /> : null}
          <View
            style={{
              width: MARKER.disc * art,
              height: (MARKER.disc + MARKER.shadowDy) * art,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                position: 'absolute',
                top: MARKER.shadowDy * art,
                width: MARKER.disc * art,
                height: MARKER.disc * art,
                borderRadius: 999,
                backgroundColor: spec.markerEdge,
              }}
            />
            <View
              style={{
                width: MARKER.disc * art,
                height: MARKER.disc * art,
                borderRadius: 999,
                backgroundColor: spec.markerBg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: font.displayBold,
                  fontSize: MARKER.glyphSize * art,
                  lineHeight: MARKER.glyphSize * art * 1.3,
                  color: color.inkDark,
                }}
              >
                {glyph}
              </Text>
            </View>
          </View>
        </View>

        {/* The name banner: one line, ellipsise, never wrap (the 24-character law). */}
        <View
          style={{
            maxWidth: BANNER_U.maxWidth * art,
            paddingHorizontal: BANNER_U.padX * art,
            paddingVertical: BANNER_U.padY * art,
            borderRadius: 999,
            backgroundColor: color.inkDark,
            borderBottomWidth: BANNER_U.shadowDy * art,
            borderBottomColor: boardLiterals.bannerShadow,
          }}
        >
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{
              fontFamily: font.displayBold,
              fontSize: BANNER_U.size * art,
              lineHeight: BANNER_U.size * art * 1.3,
              color: color.parchment,
            }}
          >
            {doc.displayName}
          </Text>
        </View>

        <View
          style={{
            paddingHorizontal: SUB_CHIP.padX * art,
            paddingVertical: SUB_CHIP.padY * art,
            borderRadius: 999,
            backgroundColor: spec.subBg,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              fontFamily: font.bodyBold,
              fontSize: SUB_CHIP.size * art,
              lineHeight: SUB_CHIP.size * art * 1.3,
              letterSpacing: SUB_CHIP.size * art * SUB_CHIP.tracking,
              color: spec.subInk,
            }}
          >
            {skillName}
          </Text>
        </View>
      </View>

      {/* The captain's ship, at the state's berth. */}
      <Image
        source={sprite.ship01}
        resizeMode="contain"
        style={{
          position: 'absolute',
          left: spec.shipLeft * art,
          top: spec.shipTop * art,
          width: SHIP_U.width * art,
          height: SHIP_U.width * art * SHIP_ASPECT,
          transform: [{ rotate: `${SHIP_U.rotateDeg}deg` }],
        }}
      />
    </View>
  );
}

/** The recipe's signature feature, mood-channelled exactly as the board's dawn screen colours it. */
function RecipeFeature({
  doc,
  art,
  mood,
}: {
  readonly doc: GenIslandDoc;
  readonly art: number;
  readonly mood: GenIslandMoodSpec;
}) {
  const geo = GEN_RECIPE_GEOMETRY[doc.recipe];

  if ('hasTwin' in geo) {
    // Two cones of unequal height, the taller capped. A volcano occupying the peak slot
    // suppresses the cap — the kit's own law: "Replaces the peak rather than sitting on it."
    const volcanoAtPeak = doc.pieces.some((entry) => entry.piece === 'volcano' && entry.slot === 'peak');
    return (
      <>
        <Poly
          points="50,0 100,100 0,100"
          width={geo.twinAW * art}
          height={geo.twinAH * art}
          fill={mood.grassDeep.hex}
          style={{ position: 'absolute', left: geo.twinAL * art, top: geo.twinAT * art }}
        />
        <Poly
          points="50,0 100,100 0,100"
          width={geo.twinBW * art}
          height={geo.twinBH * art}
          fill={unchartedTerrain.grassDeeper}
          style={{ position: 'absolute', left: geo.twinBL * art, top: geo.twinBT * art }}
        />
        {volcanoAtPeak ? null : (
          <Poly
            points="50,0 100,100 0,100"
            width={geo.twinCapW * art}
            height={geo.twinCapH * art}
            fill={unchartedTerrain.peakCap}
            style={{ position: 'absolute', left: geo.twinCapL * art, top: geo.twinAT * art }}
          />
        )}
      </>
    );
  }

  if ('hasRing' in geo) {
    // Water trapped inside the atoll: the board's `0 0 0 7px` sand rim and top-5 water inset.
    const pad = ISLE_FEATURE.ringPad;
    return (
      <>
        <Blob
          radii={[50, 50, 50, 50]}
          width={(geo.ringW + pad * 2) * art}
          height={(geo.ringH + pad * 2) * art}
          fill={mood.sand.hex}
          style={{ position: 'absolute', left: (geo.ringL - pad) * art, top: (geo.ringT - pad) * art }}
        />
        <Blob
          radii={[50, 50, 50, 50]}
          width={geo.ringW * art}
          height={geo.ringH * art}
          fill={mood.water.hex}
          innerShadow={{ color: boardLiterals.waterInset, dy: -ISLE_FEATURE.ringWaterInset * art }}
          style={{ position: 'absolute', left: geo.ringL * art, top: geo.ringT * art }}
        />
      </>
    );
  }

  if ('hasSpire' in geo) {
    return (
      <View
        style={{
          position: 'absolute',
          left: geo.spireL * art,
          top: geo.spireT * art,
          width: geo.spireW * art,
          height: geo.spireH * art,
          borderTopLeftRadius: ISLE_FEATURE.spireRadii[0] * art,
          borderTopRightRadius: ISLE_FEATURE.spireRadii[1] * art,
          borderBottomRightRadius: ISLE_FEATURE.spireRadii[2] * art,
          borderBottomLeftRadius: ISLE_FEATURE.spireRadii[3] * art,
          backgroundColor: color.driftRock,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: ISLE_FEATURE.spireShadeW * art,
            backgroundColor: boardLiterals.spireShade,
          }}
        />
      </View>
    );
  }

  if ('hasLagoon' in geo) {
    return (
      <Blob
        radii={[50, 50, 50, 50]}
        width={geo.lagW * art}
        height={geo.lagH * art}
        fill={mood.water.hex}
        innerShadow={{ color: boardLiterals.waterInset, dy: -ISLE_FEATURE.lagoonWaterInset * art }}
        style={{ position: 'absolute', left: geo.lagL * art, top: geo.lagT * art }}
      />
    );
  }

  return null;
}

/**
 * The document's placed pieces beyond its guaranteed first shore palms (which render at the
 * recipe's own measured positions above). Anchors are consumed per slot in `doc.pieces` order;
 * a piece past its slot's anchor list is skipped, never relocated — the lagoon law's renderer
 * half.
 */
function PlacedPieces({
  doc,
  art,
  mood,
}: {
  readonly doc: GenIslandDoc;
  readonly art: number;
  readonly mood: GenIslandMoodSpec;
}) {
  const anchors = PIECE_ANCHORS[doc.recipe];
  const used: Record<GenIslandSlot, number> = { peak: 0, ridge: 0, shore: 0, lagoon: 0 };
  const firstPalms = doc.pieces.findIndex((entry) => entry.piece === 'palms' && entry.slot === 'shore');

  return (
    <>
      {doc.pieces.map((entry, i) => {
        if (i === firstPalms) return null;
        const slotAnchors = anchors[entry.slot];
        const anchor = slotAnchors[used[entry.slot]];
        used[entry.slot] += 1;
        if (anchor === undefined) return null;
        return (
          <PieceFigure
            key={`${entry.piece}@${entry.slot}`}
            piece={entry.piece}
            art={art}
            mood={mood}
            x={anchor.x}
            y={anchor.y}
          />
        );
      })}
    </>
  );
}

/** One kit piece, drawn part for part from `PIECE_ART`'s bottom-anchored transcription. */
function PieceFigure({
  piece,
  art,
  mood,
  x,
  y,
}: {
  readonly piece: GenIslandPiece;
  readonly art: number;
  readonly mood: GenIslandMoodSpec;
  readonly x: number;
  readonly y: number;
}) {
  const spec = PIECE_ART[piece];
  return (
    <View
      style={{
        position: 'absolute',
        left: x * art,
        top: y * art,
        width: spec.w * art,
        height: spec.h * art,
      }}
    >
      {spec.parts.map((part, i) => (
        <PieceFigurePart key={i} part={part} boxH={spec.h} art={art} mood={mood} />
      ))}
    </View>
  );
}

function PieceFigurePart({
  part,
  boxH,
  art,
  mood,
}: {
  readonly part: PiecePart;
  readonly boxH: number;
  readonly art: number;
  readonly mood: GenIslandMoodSpec;
}) {
  const top = (boxH - part.bottom - part.h) * art;
  const fill = part.moodWater === true ? mood.water.hex : part.fill;
  const place = {
    position: 'absolute' as const,
    top,
    ...(part.left !== undefined ? { left: part.left * art } : {}),
    ...(part.right !== undefined ? { right: part.right * art } : {}),
    ...(part.opacity !== undefined ? { opacity: part.opacity } : {}),
    ...(part.rotateDeg !== undefined ? { transform: [{ rotate: `${part.rotateDeg}deg` }] } : {}),
  };

  if (part.points !== undefined) {
    return <Poly points={part.points} width={part.w * art} height={part.h * art} fill={fill} style={place} />;
  }

  if (part.ellipse === true) {
    return (
      <Blob
        radii={[50, 50, 50, 50]}
        width={part.w * art}
        height={part.h * art}
        fill={fill}
        innerShadow={
          part.waterTop !== undefined
            ? { color: boardLiterals.waterInset, dy: -part.waterTop * art }
            : undefined
        }
        style={place}
      />
    );
  }

  return (
    <View
      style={[
        place,
        {
          width: part.w * art,
          height: part.h * art,
          backgroundColor: fill,
          overflow: 'hidden',
          ...(part.radius !== undefined ? { borderRadius: part.radius * art } : {}),
          ...(part.radiusTop !== undefined
            ? {
                borderTopLeftRadius: part.radiusTop * art,
                borderTopRightRadius: part.radiusTop * art,
              }
            : {}),
        },
      ]}
    >
      {part.insetShadow === undefined ? null : (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: part.insetShadow.dy * art,
            backgroundColor: part.insetShadow.color,
          }}
        />
      )}
      {(part.bands ?? []).map((band, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: band.top * art,
            height: band.h * art,
            backgroundColor: band.fill,
          }}
        />
      ))}
    </View>
  );
}

// ── Animations (hoisted numbers only — A-018's worklet law) ──────────────────────────────────

const FOG_FROM_OPACITY = CENTER_FOG.fromOpacity;
const FOG_SHIFT = CENTER_FOG.shiftX;
const GLOW_FROM = CENTER.glow.opacity[0];
const GLOW_SPAN = CENTER.glow.opacity[1] - CENTER.glow.opacity[0];
const GLOW_SCALE_SPAN = CENTER.glow.scaleTo - 1;
const RING_SCALE_FROM = MARKER.ring.scaleFrom;
const RING_SCALE_SPAN = MARKER.ring.scaleTo - MARKER.ring.scaleFrom;
const RING_OPACITY_FROM = MARKER.ring.opacityFrom;

/** The arriving curtain: both halves slide apart over 620ms and fade out — `us-part-l/r`. */
function FogCurtain({ art }: { readonly art: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: FOG_PART_MS, easing: Easing.out(Easing.quad) });
  }, [progress]);

  const shift = FOG_SHIFT * art;
  const leftStyle = useAnimatedStyle(() => ({
    opacity: FOG_FROM_OPACITY * (1 - progress.value),
    transform: [{ translateX: -shift * progress.value }],
  }));
  const rightStyle = useAnimatedStyle(() => ({
    opacity: FOG_FROM_OPACITY * (1 - progress.value),
    transform: [{ translateX: shift * progress.value }],
  }));

  const height = (CENTER.isle.h + CENTER_FOG.bleedY * 2) * art;
  return (
    <>
      <Animated.View
        style={[{ position: 'absolute', left: -CENTER_FOG.bleedX * art, top: -CENTER_FOG.bleedY * art }, leftStyle]}
      >
        <Blob radii={CENTER_FOG.leftRadii} width={CENTER_FOG.width * art} height={height} fill={CENTER_FOG.fill} />
      </Animated.View>
      <Animated.View
        style={[{ position: 'absolute', right: -CENTER_FOG.bleedX * art, top: -CENTER_FOG.bleedY * art }, rightStyle]}
      >
        <Blob radii={CENTER_FOG.rightRadii} width={CENTER_FOG.width * art} height={height} fill={CENTER_FOG.fill} />
      </Animated.View>
    </>
  );
}

/** The ready-state glow behind the island — `us-glow`, 3.6s, yoyo. */
function ReadyGlow({ art }: { readonly art: number }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: CENTER.glow.ms / 2, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: GLOW_FROM + GLOW_SPAN * pulse.value,
    transform: [{ scale: 1 + GLOW_SCALE_SPAN * pulse.value }],
  }));

  return (
    <Animated.View
      style={[{ position: 'absolute', left: CENTER.glow.left * art, top: CENTER.glow.top * art }, glowStyle]}
    >
      <Blob radii={[50, 50, 50, 50]} width={CENTER.glow.w * art} height={CENTER.glow.h * art} fill={color.amber} />
    </Animated.View>
  );
}

/** The live marker's pulse — `us-ring`, 1.8s, out-easing, restarting. */
function MarkerRing({ art }: { readonly art: number }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: MARKER.ring.ms, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
  }, [pulse]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: RING_OPACITY_FROM * (1 - pulse.value),
    transform: [{ scale: RING_SCALE_FROM + RING_SCALE_SPAN * pulse.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: MARKER.ring.inset * art,
          top: MARKER.ring.inset * art,
          width: MARKER.ring.size * art,
          height: MARKER.ring.size * art,
          borderRadius: 999,
          backgroundColor: color.amber,
        },
        ringStyle,
      ]}
    />
  );
}
