/**
 * The coach bar — the one thing that is on screen for eighteen of the board's twenty beats.
 *
 * Transcribed from the board: an 18pt-radius `#14283C` slab, 12pt padding, a 48pt amber anchor
 * badge, the line at 17pt display / the sub at 11pt body, and a 48pt speaker on the right.
 *
 * ## Two places this deliberately departs from the drawing
 *
 * **The speaker's target is 64, not 48.** The board draws it at 48 and `tokens.ts` is explicit that
 * *"64 is the floor, not the target"*. The visual box has to stay 48 or the bar grows tall enough
 * to eat the answer grid on a 375×667 frame, so the ink stays 48 and `hitSlop` carries the target
 * out to 64×64 — the same split `flow.ts` documents for the chart's header pills, where the ink is
 * 52 and the model measures the hit box.
 *
 * **The speaker announces rather than speaks.** Board rule AUDIO wants every line spoken aloud on
 * entry, in every band, and calls it *"one of the few places I would spend a day of the five"* —
 * it is right, and it is also a text-to-speech dependency this repo does not have. What ships here
 * is the honest subset: the button re-announces the line through the platform's own screen reader,
 * which is real assistive behaviour on a device rather than a mute decoration. The auto-play half
 * of that rule is NOT implemented, and the button is not pretending otherwise.
 */
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';

import { Poly } from '../Poly';
import type { CoachLine } from './script';
import { COACH_BAND, coachBandHeight, type CoachBuild } from './coachBand';
import { color, radius, type, MIN_TAP_TARGET } from '../../theme/tokens';
import { useLayout } from '../../theme/useLayout';

export function CoachBar({
  coach,
  /** Board `coachOuterBg` — parchment behind the setup and duel beats, transparent over the sea. */
  outerBackground = color.parchment,
  /**
   * `compact` trades 12pt of padding and 8pt of badge for the answer grid's tap targets. The caller
   * decides, from the space it actually has — see `coachBandFits`.
   */
  build = 'standard',
  /** Extra bottom padding for a bar that is the last thing on the screen (the chart tour). */
  insetBottom = 0,
}: {
  readonly coach: CoachLine;
  readonly outerBackground?: string;
  readonly build?: CoachBuild;
  readonly insetBottom?: number;
}) {
  const L = useLayout();
  const px = L.a;
  const tx = L.t;
  const box = COACH_BAND[build];

  // Always BOTH lines, whatever is drawn. The compact build hides the sub to save 5pt of sheet;
  // the speaker and the screen reader still get the whole beat, which is the channel board rule
  // AUDIO cares about.
  const spoken = coach.sub === '' ? coach.line : `${coach.line} ${coach.sub}`;
  // The ink stays as drawn and `hitSlop` carries the target out to 64 — the same split `flow.ts`
  // documents for the chart's header pills, and the reason the bar can stay 92pt tall at all.
  const slop = Math.max(0, Math.round((MIN_TAP_TARGET - px(box.badge)) / 2));

  return (
    <View
      style={{
        backgroundColor: outerBackground,
        // Exactly `coachBandHeight` by construction. The chart tour reserves that number in the
        // flex column, and a bar that measured differently from what was reserved would either
        // leave a seam of sea under it or clip its own speaker.
        height: coachBandHeight({ art: px, type: tx, hasSub: coach.sub !== '', build }) + insetBottom,
        paddingTop: px(box.outerTop),
        paddingHorizontal: px(12),
        paddingBottom: px(box.outerBottom) + insetBottom,
      }}
    >
      <View
        style={[
          s.slab,
          { flex: 1, borderRadius: px(radius.card), padding: px(box.slabPad), gap: px(12) },
        ]}
        // One region, so a screen reader reads the badge, the line and the sub as a single
        // utterance instead of three unlabelled fragments.
        accessible
        accessibilityRole="text"
        accessibilityLabel={spoken}
      >
        <AnchorBadge size={px(box.badge)} />

        <View style={{ flex: 1, minWidth: 0 }}>
          {/*
            One line, shrunk to fit rather than wrapped. The band's height is reserved in the chart's
            flex column before this text is measured, so a headline that wrapped to two lines would
            overflow the space that was set aside for it — and the board's own rule is one idea per
            beat, which is what keeps these strings short enough for the floor to never bite.
          */}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={[s.line, { fontSize: tx(17), lineHeight: tx(COACH_BAND.lineHeight) }]}
          >
            {coach.line}
          </Text>
          {coach.sub === '' || build === 'compact' ? null : (
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={[
                s.sub,
                {
                  fontSize: tx(11),
                  lineHeight: tx(COACH_BAND.subLineHeight),
                  marginTop: px(COACH_BAND.subGap),
                },
              ]}
            >
              {coach.sub}
            </Text>
          )}
        </View>

        <Pressable
          onPress={() => AccessibilityInfo.announceForAccessibility(spoken)}
          accessibilityRole="button"
          accessibilityLabel="Say it again"
          hitSlop={{ top: slop, bottom: slop, left: slop, right: slop }}
          style={({ pressed }) => [
            s.speaker,
            { width: px(box.badge), height: px(box.badge), borderRadius: px(radius.card) },
            pressed && { opacity: 0.75 },
          ]}
        >
          <SpeakerGlyph size={px(box.badge)} />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The board's badge, which is an anchor built from four rules: a ring, a shank, a stock and a
 * curved fluke. Composed rather than a glyph character, because `⚓` renders as a colour emoji on
 * iOS and as a missing box on some Android builds.
 */
function AnchorBadge({ size }: { readonly size: number }) {
  const u = size / 48;
  return (
    <View
      style={[
        s.badge,
        { width: size, height: size, borderRadius: 18 * u },
      ]}
    >
      <View
        style={{
          position: 'absolute',
          left: 19 * u,
          top: 6 * u,
          width: 10 * u,
          height: 10 * u,
          borderRadius: 999,
          borderWidth: 3 * u,
          borderColor: color.inkDark,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 22 * u,
          top: 9 * u,
          width: 4 * u,
          height: 26 * u,
          borderRadius: 2 * u,
          backgroundColor: color.inkDark,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 15 * u,
          top: 14 * u,
          width: 18 * u,
          height: 4 * u,
          borderRadius: 2 * u,
          backgroundColor: color.inkDark,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 11 * u,
          top: 26 * u,
          width: 26 * u,
          height: 13 * u,
          borderBottomWidth: 4 * u,
          borderLeftWidth: 4 * u,
          borderRightWidth: 4 * u,
          borderColor: color.inkDark,
          borderBottomLeftRadius: 999,
          borderBottomRightRadius: 999,
        }}
      />
    </View>
  );
}

/** The board's speaker: a box, a cone and two sound arcs of decreasing weight. */
function SpeakerGlyph({ size }: { readonly size: number }) {
  const u = size / 48;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          left: 12 * u,
          top: 19 * u,
          width: 8 * u,
          height: 10 * u,
          backgroundColor: color.parchment,
        }}
      />
      <Poly
        points="0,27 100,0 100,100 0,73"
        width={10 * u}
        height={22 * u}
        fill={color.parchment}
        style={{ position: 'absolute', left: 18 * u, top: 13 * u }}
      />
      <View
        style={{
          position: 'absolute',
          left: 31 * u,
          top: 17 * u,
          width: 6 * u,
          height: 14 * u,
          borderRightWidth: 3 * u,
          borderColor: color.parchment,
          borderTopRightRadius: 999,
          borderBottomRightRadius: 999,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 37 * u,
          top: 13 * u,
          width: 7 * u,
          height: 22 * u,
          borderRightWidth: 3 * u,
          borderColor: 'rgba(255,246,228,0.55)',
          borderTopRightRadius: 999,
          borderBottomRightRadius: 999,
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  slab: { backgroundColor: color.inkDark, flexDirection: 'row', alignItems: 'center' },
  line: { fontFamily: type.display.fontFamily, color: color.parchment },
  sub: { fontFamily: type.body.fontFamily, color: color.inkMuted },
  badge: { backgroundColor: color.amber },
  speaker: { backgroundColor: color.seaDeep, alignItems: 'center', justifyContent: 'center' },
});
