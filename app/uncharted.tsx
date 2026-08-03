/**
 * The Uncharted Sea — a window on the endless frontier (A-082, amended D-17).
 *
 * One island at a time: storm wall ahead, the current generated island in the middle, pennant
 * tally behind, and two verbs at the bottom. Three states, board-transcribed
 * (`unchartedBoard.ts`): ARRIVING (fog parts, 620ms, nothing to commit to), READY (Set sail —
 * the only gold-ringed thing on the screen), VICTORIOUS (green marker, pennant lands, wall
 * thins, Sail on).
 *
 * State is derived, never routed: this screen reads NO route params (the no-route-params law).
 * The three phases come from `resolveUnchartedPhase` — VICTORIOUS is the settlement receipt
 * for the current island's duel (A-081's law: the receipt IS the settled-win fact; a loss
 * leaves none, so a loss returns here to READY with the tally unchanged, which is AC-1's
 * whole loss story). SET SAIL boots the gen duel through A-080's module flag
 * (`armUnchartedDuel`), never a param; Sail on runs A-081's explicit `advanceUncharted` and
 * the fog timer keys on the new island's id, so the next Arriving plays on its own.
 *
 * The frontier deals itself locally: an undealt (or normalizer-quarantined) slot regenerates
 * from `generateIsland(freshSeed(), 6 + clearedCount, band)` — A-078's offline generator, no
 * network, no LLM (AC-5). Minting the seed is this screen's job because the screen is the
 * impure edge (the `app/duel.tsx` `freshSeed` precedent); every deterministic module below it
 * takes the seed as data.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';

import { generateIsland } from '../src/services/uncharted/generator';
import { armUnchartedDuel } from '../src/services/uncharted/duel';
import { advanceUncharted } from '../src/services/uncharted/settlement';
import { chartNodes, chartProgress } from '../src/services/chart';
import { resolveDestination } from '../src/services/flow';
import { captainStore, useCaptain } from '../src/stores/useCaptain';
import { ResponsiveFrame, useResponsiveSurface } from '../src/components/ResponsiveFrame';
import { IslandFigure } from '../src/components/uncharted/IslandFigure';
import { DeepSeaBackdrop, StormWall } from '../src/components/uncharted/StormWall';
import { TallyPanel } from '../src/components/uncharted/TallyPanel';
import { UnchartedEncounter } from '../src/components/uncharted/UnchartedEncounter';
import {
  BOTTOM_U,
  CENTER,
  deepSea,
  FOG_PART_MS,
  HEADER_U,
  MOTES,
  MOTE_OPACITY,
  resolveUnchartedPhase,
  STATE_SPEC,
  SWELL_FILL,
  SWELL_OPACITY,
  SWELLS,
  TALLY_U,
  UNCHARTED_FRAME,
  unchartedDepthLabel,
  unchartedTallyCount,
} from '../src/components/uncharted/unchartedBoard';
import { SKILL_GLYPH } from '../src/theme/rankPresentation';
import { Poly } from '../src/components/Poly';
import { useLayout } from '../src/theme/useLayout';
import { color, font } from '../src/theme/tokens';

export default function UnchartedScreen() {
  return (
    <ResponsiveFrame surface="world">
      <UnchartedBody />
    </ResponsiveFrame>
  );
}

/** The world column caps a board at 560pt — the chart's own letterbox posture. */
const BOARD_CAP = 560;

function UnchartedBody() {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const { contentWidth } = useResponsiveSurface();
  const captain = useCaptain((s) => s.captain);
  const [fogParted, setFogParted] = useState(false);
  const [seaBox, setSeaBox] = useState({ w: 0, h: 0 });
  const [tallyHeight, setTallyHeight] = useState(0);
  // Lumen asks once per island reveal (A-086): local latch, reset with the fog on each new
  // island — payout idempotency is receipt-side, so this is presentation state only.
  const [chatDone, setChatDone] = useState(false);

  const band = captain.gradeBand;
  const current = captain.uncharted?.current ?? null;
  const clearedCount = captain.uncharted?.clearedCount ?? 0;
  const currentId = current?.id ?? null;
  const dealt = current !== null;

  const nodes = useMemo(() => chartNodes(captain), [captain]);
  const progress = useMemo(() => chartProgress(captain, nodes), [captain, nodes]);

  // Deal (or re-deal) the frontier pair. Corrupt slots arrive here as null — persistence's
  // normalizer already quarantined them — so "current is null" is the whole precondition.
  useEffect(() => {
    const state = captainStore.getState();
    const cap = state.captain;
    if (cap.gradeBand === null) return;
    if (cap.uncharted?.current != null) return;
    const seed = freshSeed();
    const base = 6 + (cap.uncharted?.clearedCount ?? 0);
    state.beginUncharted();
    captainStore
      .getState()
      .setUnchartedIslands(
        generateIsland(seed, base, cap.gradeBand),
        generateIsland(seed, base + 1, cap.gradeBand),
      );
  }, [dealt]);

  // The arriving curtain: 620ms per island, keyed on the island itself — a Sail-on advance
  // swaps `currentId` and the next Arriving plays with no extra wiring (AC-1).
  useEffect(() => {
    setFogParted(false);
    setChatDone(false);
    if (currentId === null) return;
    const timer = setTimeout(() => setFogParted(true), FOG_PART_MS);
    return () => clearTimeout(timer);
  }, [currentId]);

  const onSeaLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSeaBox({ w: width, h: height });
  }, []);

  const onTallyLayout = useCallback((event: LayoutChangeEvent) => {
    setTallyHeight(event.nativeEvent.layout.height);
  }, []);

  const leave = useCallback(() => router.back(), []);

  // One button, two verbs (the board's own relabel): READY boots the gen duel through the
  // A-080 flag; VICTORIOUS advances the frontier — the explicit action, never a settlement
  // side effect (A-081) — and the new island arrives on the fog timer above.
  const onSail = useCallback(() => {
    const cap = captainStore.getState().captain;
    const doc = cap.uncharted?.current ?? null;
    if (doc === null) return;
    if (resolveUnchartedPhase(cap, true) === 'victorious') {
      advanceUncharted(captainStore, freshSeed());
      return;
    }
    armUnchartedDuel(doc);
    router.push('/duel');
  }, []);

  // ── Every hook has now run. Conditional returns are legal from here down. ──

  // The resolver owns "where does this captain belong"; the chip is the only door in, and it
  // renders only on a finished chain — so an unfinished chain landing here walks back to the
  // chart rather than past the Grandline (D-13: no skips of any kind, including URL-shaped).
  const destination = resolveDestination(captain);
  if (destination !== 'chart' || band === null) return <Redirect href={`/${destination}`} />;
  if (progress.nextIndex >= 0) return <Redirect href="/chart" />;

  const t = L.type;
  const art = Math.min(contentWidth, BOARD_CAP) / UNCHARTED_FRAME.width;
  const phase = resolveUnchartedPhase(captain, fogParted);
  const spec = STATE_SPEC[phase];
  const depthLabel = unchartedDepthLabel(current?.index ?? clearedCount + 6, phase);
  const tallyCount = unchartedTallyCount(clearedCount, phase);
  const newGlyph = current === null ? '' : SKILL_GLYPH[current.skills[0]!];

  // Where the centre band sits: the board's own 236 when the sea is tall enough, lifted just
  // enough to clear the tally panel when it is not (SE heights). The wall is weather behind it.
  const tallyBand = tallyHeight + TALLY_U.inset * t + 8 * t;
  const bandTop = Math.max(
    120 * art,
    Math.min(CENTER.top * art, seaBox.h - tallyBand - CENTER.height * art),
  );

  return (
    <View style={{ flex: 1, backgroundColor: deepSea.deep4 }}>
      <View style={{ height: insets.top, backgroundColor: deepSea.deep4 }} />

      <View style={{ flex: 1, overflow: 'hidden' }} onLayout={onSeaLayout}>
        <DeepSeaBackdrop width={seaBox.w} height={seaBox.h} />

        {MOTES.map(([x, y, size], i) => (
          <View
            key={`mote-${i}`}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: x * art,
              top: y * art,
              width: size * art,
              height: size * art,
              borderRadius: 999,
              backgroundColor: color.gold,
              opacity: MOTE_OPACITY,
            }}
          />
        ))}
        {SWELLS.map(([x, y, w], i) => (
          <View
            key={`swell-${i}`}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: x * art,
              top: y * art,
              width: w * art,
              height: 4 * art,
              borderRadius: 999,
              backgroundColor: SWELL_FILL,
              opacity: SWELL_OPACITY,
            }}
          />
        ))}

        <StormWall spec={spec} art={art} width={seaBox.w} />

        {current === null ? null : (
          <View style={{ position: 'absolute', left: 0, right: 0, top: bandTop, alignItems: 'center' }}>
            <IslandFigure doc={current} spec={spec} art={art} />
          </View>
        )}

        <View
          onLayout={onTallyLayout}
          style={{
            position: 'absolute',
            left: TALLY_U.inset * t,
            right: TALLY_U.inset * t,
            bottom: TALLY_U.inset * t,
          }}
        >
          <TallyPanel
            clearedCount={clearedCount}
            tallyCount={tallyCount}
            pennantNew={spec.pennantNew && current !== null}
            newGlyph={newGlyph}
            band={band}
            typeScale={t}
          />
        </View>

        {/* The header floats over the weather, the board's own z-order. */}
        <View
          style={{
            position: 'absolute',
            left: HEADER_U.inset * t,
            right: HEADER_U.inset * t,
            top: (HEADER_U.top - UNCHARTED_FRAME.statusBar) * t,
            height: HEADER_U.chip.size * t,
            flexDirection: 'row',
            alignItems: 'center',
            gap: HEADER_U.gap * t,
            zIndex: 5,
          }}
        >
          <Pressable
            onPress={leave}
            accessibilityRole="button"
            accessibilityLabel="Back to the sea chart"
            style={({ pressed }) => [
              {
                width: HEADER_U.chip.size * t,
                height: HEADER_U.chip.size * t,
                borderRadius: HEADER_U.chip.radius * t,
                backgroundColor: deepSea.deepPanel,
                borderBottomWidth: HEADER_U.chip.shadowDy * t,
                borderBottomColor: deepSea.deep3,
                alignItems: 'center',
                justifyContent: 'center',
              },
              pressed ? { transform: [{ translateY: 2 }] } : null,
            ]}
          >
            <HarborIcon
              w={HEADER_U.chipIcon.w * t}
              h={HEADER_U.chipIcon.h * t}
              baseH={HEADER_U.chipIcon.baseH * t}
              baseTop={HEADER_U.chipIcon.baseTop * t}
              baseRadius={HEADER_U.chipIcon.baseRadius * t}
              postW={HEADER_U.chipIcon.postW * t}
              postH={HEADER_U.chipIcon.postH * t}
              postInset={HEADER_U.chipIcon.postInset * t}
            />
          </Pressable>

          <View
            style={{
              flex: 1,
              minWidth: 0,
              height: HEADER_U.chip.size * t,
              borderRadius: HEADER_U.title.radius * t,
              backgroundColor: deepSea.deepPanel,
              borderBottomWidth: HEADER_U.title.shadowDy * t,
              borderBottomColor: deepSea.deep3,
              flexDirection: 'row',
              alignItems: 'center',
              gap: HEADER_U.title.gap * t,
              paddingHorizontal: HEADER_U.title.padX * t,
            }}
          >
            <CompassDisc typeScale={t} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: font.displayBold,
                  fontSize: HEADER_U.title.size * t,
                  lineHeight: HEADER_U.title.size * t * 1.3,
                  color: color.parchment,
                }}
              >
                The Uncharted Sea
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: font.bodyBold,
                  fontSize: HEADER_U.title.subSize * t,
                  lineHeight: HEADER_U.title.subSize * t * 1.3,
                  letterSpacing: HEADER_U.title.subSize * t * HEADER_U.title.subTracking,
                  color: deepSea.deepLabel,
                }}
              >
                {depthLabel}
              </Text>
            </View>
          </View>

          <View
            style={{
              height: HEADER_U.coins.height * t,
              flexDirection: 'row',
              alignItems: 'center',
              gap: HEADER_U.coins.gap * t,
              paddingLeft: HEADER_U.coins.padLeft * t,
              paddingRight: HEADER_U.coins.padRight * t,
              borderRadius: 999,
              backgroundColor: color.parchment,
              borderBottomWidth: HEADER_U.coins.shadowDy * t,
              borderBottomColor: color.parchmentPlank,
            }}
          >
            <View
              style={{
                width: HEADER_U.coins.disc * t,
                height: HEADER_U.coins.disc * t,
                borderRadius: 999,
                backgroundColor: color.amber,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: HEADER_U.coins.discInset * t,
                  backgroundColor: color.goldDeep,
                }}
              />
            </View>
            <Text
              style={{
                fontFamily: font.displayBold,
                fontSize: HEADER_U.coins.size * t,
                lineHeight: HEADER_U.coins.size * t * 1.3,
                color: color.inkDark,
              }}
            >
              {captain.coins}
            </Text>
          </View>
        </View>
      </View>

      {/* The bottom bar: Harbor stays quiet white, SET SAIL carries the screen's only ring. */}
      <View style={{ backgroundColor: deepSea.deep4 }}>
        <View
          style={{
            borderTopLeftRadius: BOTTOM_U.radius * t,
            borderTopRightRadius: BOTTOM_U.radius * t,
            backgroundColor: color.parchment,
            padding: BOTTOM_U.pad * t,
            flexDirection: 'row',
            alignItems: 'center',
            gap: BOTTOM_U.gap * t,
          }}
        >
          <Pressable
            onPress={leave}
            accessibilityRole="button"
            accessibilityLabel="Back to the sea chart"
            style={({ pressed }) => [
              {
                width: BOTTOM_U.harbor.size * t,
                height: BOTTOM_U.harbor.size * t,
                borderRadius: BOTTOM_U.harbor.radius * t,
                backgroundColor: color.white,
                borderBottomWidth: BOTTOM_U.harbor.shadowDy * t,
                borderBottomColor: color.parchmentEdge,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3 * t,
              },
              pressed ? { transform: [{ translateY: 2 }] } : null,
            ]}
          >
            <HarborIcon
              w={BOTTOM_U.harbor.icon.w * t}
              h={BOTTOM_U.harbor.icon.h * t}
              baseH={BOTTOM_U.harbor.icon.baseH * t}
              baseTop={BOTTOM_U.harbor.icon.baseTop * t}
              baseRadius={BOTTOM_U.harbor.icon.baseRadius * t}
              postW={BOTTOM_U.harbor.icon.postW * t}
              postH={BOTTOM_U.harbor.icon.postH * t}
              postInset={BOTTOM_U.harbor.icon.postInset * t}
            />
            <Text
              style={{
                fontFamily: font.bodyBold,
                fontSize: BOTTOM_U.harbor.labelSize * t,
                lineHeight: BOTTOM_U.harbor.labelSize * t * 1.3,
                color: color.inkDarkMuted,
              }}
            >
              Harbor
            </Text>
          </Pressable>

          <Pressable
            onPress={onSail}
            disabled={!spec.sailEnabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: !spec.sailEnabled }}
            accessibilityLabel={spec.sailLabel}
            style={({ pressed }) => [
              {
                flex: 1,
                minWidth: 0,
                height: BOTTOM_U.sail.height * t,
                borderRadius: BOTTOM_U.sail.radius * t,
                backgroundColor: spec.sailBg,
                borderBottomWidth: 5 * t,
                borderBottomColor: spec.sailEdge,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: BOTTOM_U.sail.gap * t,
              },
              pressed && spec.sailEnabled ? { transform: [{ translateY: 2 }] } : null,
            ]}
          >
            {spec.sailRing ? (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: -BOTTOM_U.sail.ring.inset * t,
                  top: -BOTTOM_U.sail.ring.inset * t,
                  right: -BOTTOM_U.sail.ring.inset * t,
                  bottom: -BOTTOM_U.sail.ring.inset * t,
                  borderRadius: BOTTOM_U.sail.ring.radius * t,
                  borderWidth: BOTTOM_U.sail.ring.width * t,
                  borderColor: color.gold,
                }}
              />
            ) : null}
            <View
              style={{
                width: BOTTOM_U.sail.icon.w * t,
                height: BOTTOM_U.sail.icon.h * t,
                opacity: spec.sailInk,
              }}
            >
              <View
                style={{
                  position: 'absolute',
                  left: BOTTOM_U.sail.icon.mast.left * t,
                  top: BOTTOM_U.sail.icon.mast.top * t,
                  width: BOTTOM_U.sail.icon.mast.w * t,
                  height: BOTTOM_U.sail.icon.mast.h * t,
                  borderRadius: BOTTOM_U.sail.icon.mast.radius * t,
                  backgroundColor: color.inkDark,
                }}
              />
              <Poly
                points={BOTTOM_U.sail.icon.sail.points}
                width={BOTTOM_U.sail.icon.sail.w * t}
                height={BOTTOM_U.sail.icon.sail.h * t}
                fill={color.inkDark}
                style={{
                  position: 'absolute',
                  left: BOTTOM_U.sail.icon.sail.left * t,
                  top: BOTTOM_U.sail.icon.sail.top * t,
                }}
              />
            </View>
            <Text
              style={{
                fontFamily: font.displayBold,
                fontSize: BOTTOM_U.sail.labelSize * t,
                lineHeight: BOTTOM_U.sail.labelSize * t * 1.3,
                color: color.inkDark,
                opacity: spec.sailInk,
              }}
            >
              {spec.sailLabel}
            </Text>
          </Pressable>
        </View>
        <View style={{ height: insets.bottom, backgroundColor: color.parchment }} />
      </View>

      {/* Lumen greets the frontier and asks on each island's reveal (A-086). The card is
          self-contained — its payout is receipt-idempotent — and READY is the only phase it
          overlays, so a duel or an advance can never race it. */}
      {phase === 'ready' && !chatDone && current !== null ? (
        <UnchartedEncounter doc={current} onDone={() => setChatDone(true)} />
      ) : null}
    </View>
  );
}

/** The harbor planks mark — the board draws the same icon on the header chip and the button. */
function HarborIcon({
  w,
  h,
  baseH,
  baseTop,
  baseRadius,
  postW,
  postH,
  postInset,
}: {
  readonly w: number;
  readonly h: number;
  readonly baseH: number;
  readonly baseTop: number;
  readonly baseRadius: number;
  readonly postW: number;
  readonly postH: number;
  readonly postInset: number;
}) {
  return (
    <View style={{ width: w, height: h }}>
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: baseTop,
          width: w,
          height: baseH,
          borderRadius: baseRadius,
          backgroundColor: color.woodLight,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: postInset,
          top: 0,
          width: postW,
          height: postH,
          backgroundColor: color.woodDeep,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: postInset,
          top: 0,
          width: postW,
          height: postH,
          backgroundColor: color.woodDeep,
        }}
      />
    </View>
  );
}

/** The compass-and-question disc — the doorway chip's glyph, repeated on the screen's own header. */
function CompassDisc({ typeScale: t }: { readonly typeScale: number }) {
  const c = HEADER_U.compass;
  return (
    <View style={{ width: c.disc * t, height: c.disc * t, borderRadius: 999, backgroundColor: color.amber }}>
      <Poly
        points="50,0 100,100 0,100"
        width={c.needle.w * t}
        height={c.needle.h * t}
        fill={color.inkDark}
        style={{ position: 'absolute', left: c.needle.left * t, top: c.needle.top * t }}
      />
      <View
        style={{
          position: 'absolute',
          left: c.oval.left * t,
          top: c.oval.top * t,
          width: c.oval.w * t,
          height: c.oval.h * t,
          borderRadius: 999,
          backgroundColor: color.amber,
          borderWidth: c.oval.ring * t,
          borderColor: color.inkDark,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontFamily: font.displayBold,
            fontSize: c.oval.glyphSize * t,
            lineHeight: c.oval.glyphSize * t * 1.2,
            color: color.inkDark,
          }}
        >
          ?
        </Text>
      </View>
    </View>
  );
}

/**
 * A fresh seed for each deal and each advance — the frontier's per-visit freshness (A-081's
 * seed policy is the caller's). The screen is the impure edge; `Date` is banned below it.
 */
function freshSeed(): number {
  return Date.now() >>> 0;
}
