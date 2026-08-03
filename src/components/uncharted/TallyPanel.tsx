/**
 * ISLANDS BEHIND YOU — the tally panel (A-082 item 4).
 *
 * The pennant row only grows — the board's red-flag rule for this screen: *"an endless mode
 * with a personal best turns a loss into losing something,"* so this panel counts upward and
 * holds no other number. Settled pennants cycle the board's seven content tones; their glyphs are
 * dealt from the band's own skill ladder (band-safe by construction — see
 * `unchartedBoard.pennantGlyphs` for why the literal cleared-doc glyph is unrecoverable). On the
 * victorious screen the just-claimed island's pennant lands GOLD, carrying that island's own
 * first-skill glyph, with the `us-land` spring (460ms, overshoot to 1.18).
 */
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { GradeBand } from '@content/schemas';

import { Poly } from '../Poly';
import { color, font } from '../../theme/tokens';
import {
  deepSea,
  PENNANT_LAND,
  PENNANT_NEW_FILL,
  PENNANT_POINTS,
  pennantGlyphs,
  pennantTone,
  TALLY_U,
} from './unchartedBoard';

interface TallyPanelProps {
  /** Settled cleared count — the store's own number; the landing pennant is drawn beside it. */
  readonly clearedCount: number;
  /** The tally chip's display count (`unchartedTallyCount` — includes the landing pennant). */
  readonly tallyCount: number;
  /** Whether the new gold pennant is landing (victorious only). */
  readonly pennantNew: boolean;
  /** The landing pennant's glyph — the claimed island's own first skill. */
  readonly newGlyph: string;
  readonly band: GradeBand;
  readonly typeScale: number;
}

export function TallyPanel({
  clearedCount,
  tallyCount,
  pennantNew,
  newGlyph,
  band,
  typeScale: t,
}: TallyPanelProps) {
  const glyphs = pennantGlyphs(band, clearedCount);

  return (
    <View
      style={{
        padding: TALLY_U.pad * t,
        borderRadius: TALLY_U.radius * t,
        backgroundColor: deepSea.deep3,
        borderBottomWidth: TALLY_U.shadowDy * t,
        borderBottomColor: deepSea.deep4,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 * t }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: font.bodyBold,
            fontSize: TALLY_U.headerSize * t,
            lineHeight: TALLY_U.headerSize * t * 1.3,
            letterSpacing: TALLY_U.headerSize * t * TALLY_U.headerTracking,
            color: deepSea.deepLabel,
          }}
        >
          ISLANDS BEHIND YOU
        </Text>
        <View style={{ flex: 1 }} />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5 * t,
            paddingHorizontal: TALLY_U.chip.padX * t,
            paddingVertical: TALLY_U.chip.padY * t,
            borderRadius: 999,
            backgroundColor: deepSea.deep4,
          }}
        >
          <Poly
            points={PENNANT_POINTS}
            width={TALLY_U.chip.iconW * t}
            height={TALLY_U.chip.iconH * t}
            fill={color.amber}
          />
          <Text
            style={{
              fontFamily: font.displayBold,
              fontSize: TALLY_U.chip.size * t,
              lineHeight: TALLY_U.chip.size * t * 1.3,
              color: color.parchment,
            }}
          >
            ×{tallyCount}
          </Text>
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: TALLY_U.gap * t,
          marginTop: TALLY_U.rowTop * t,
        }}
      >
        {glyphs.map((glyph, i) => (
          <Pennant key={i} fill={pennantTone(i)} glyph={glyph} typeScale={t} />
        ))}
        {pennantNew ? <LandingPennant glyph={newGlyph} typeScale={t} /> : null}
      </View>
    </View>
  );
}

function Pennant({
  fill,
  glyph,
  typeScale: t,
}: {
  readonly fill: string;
  readonly glyph: string;
  readonly typeScale: number;
}) {
  return (
    <View
      style={{
        width: TALLY_U.pennant.w * t,
        height: TALLY_U.pennant.h * t,
        alignItems: 'center',
      }}
    >
      <Poly
        points={PENNANT_POINTS}
        width={TALLY_U.pennant.w * t}
        height={TALLY_U.pennant.h * t}
        fill={fill}
        style={{ position: 'absolute', left: 0, top: 0 }}
      />
      <Text
        style={{
          marginTop: TALLY_U.pennant.padTop * t,
          fontFamily: font.displayBold,
          fontSize: TALLY_U.pennant.glyphSize * t,
          lineHeight: TALLY_U.pennant.glyphSize * t * 1.3,
          color: color.inkDark,
        }}
      >
        {glyph}
      </Text>
    </View>
  );
}

// Hoisted for the worklet (A-018): a `useAnimatedStyle` body reads no JS closures.
const LAND_FROM_Y = PENNANT_LAND.fromY;

/** `us-land`: −22pt / scale .4 / transparent → (60%) settled / 1.18 / opaque → 1. */
function LandingPennant({ glyph, typeScale: t }: { readonly glyph: string; readonly typeScale: number }) {
  const drop = useSharedValue(0);
  const settle = useSharedValue<number>(PENNANT_LAND.fromScale);

  useEffect(() => {
    drop.value = withTiming(1, { duration: PENNANT_LAND.midMs, easing: Easing.out(Easing.quad) });
    settle.value = withSequence(
      withTiming(PENNANT_LAND.midScale, { duration: PENNANT_LAND.midMs, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: PENNANT_LAND.ms - PENNANT_LAND.midMs, easing: Easing.inOut(Easing.quad) }),
    );
  }, [drop, settle]);

  const landStyle = useAnimatedStyle(() => ({
    opacity: drop.value,
    transform: [{ translateY: LAND_FROM_Y * (1 - drop.value) }, { scale: settle.value }],
  }));

  return (
    <Animated.View style={landStyle}>
      <Pennant fill={PENNANT_NEW_FILL} glyph={glyph} typeScale={t} />
    </Animated.View>
  );
}
