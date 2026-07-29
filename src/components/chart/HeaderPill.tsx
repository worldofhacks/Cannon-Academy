/**
 * The header pill — FRAME coordinates, the only band on this screen that uses them.
 *
 * The board puts it at `top: 26` of a 375×667 frame whose first 20pt are the status bar, so it
 * clears the bar by 6. On a real device the bar is whatever the notch says it is, so the 6 is what
 * survives and the 20 is replaced by `insets.top` — the same substitution `board.ts` describes.
 *
 * The pennant chip's `clip-path` is already in `Poly` point form on `HEADER.pennantPoints`; the
 * chip's own `border-radius: 10` still applies underneath it, and CSS intersects the two, so the
 * polygon is drawn inside a rounded, clipping box rather than instead of one.
 */
import { Text, View } from 'react-native';

import { HEADER } from './board';
import { chart } from './palette';
import { Poly } from '../Poly';
import { flagById } from '../../theme/flags';
import { color, font } from '../../theme/tokens';

interface HeaderPillProps {
  readonly name: string;
  readonly flag: string | null;
  readonly coins: number;
  /** Type scale. The pill hugs text, so it follows type rather than art. */
  readonly typeScale: number;
}

/** What the pill says under the name. The board records the type, not the words. */
const SUBTITLE = 'THE SEA CHART';

export function HeaderPill({ name, flag, coins, typeScale }: HeaderPillProps) {
  const pennant = HEADER.pennant.size * typeScale;

  return (
    <View
      style={{
        marginHorizontal: HEADER.inset * typeScale,
        height: HEADER.height * typeScale,
        borderRadius: HEADER.radius * typeScale,
        backgroundColor: chart.parchment,
        borderBottomWidth: HEADER.shadowDy * typeScale,
        borderBottomColor: chart.parchmentShadow,
        paddingHorizontal: HEADER.paddingX * typeScale,
        flexDirection: 'row',
        alignItems: 'center',
        gap: HEADER.gap * typeScale,
      }}
    >
      <View
        style={{
          width: pennant,
          height: pennant,
          borderRadius: HEADER.pennant.radius * typeScale,
          overflow: 'hidden',
        }}
      >
        <Poly
          points={HEADER.pennantPoints}
          width={pennant}
          height={pennant}
          fill={flagById(flag)?.color ?? color.amber}
        />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: font.displayBold,
            fontSize: HEADER.nameSize * typeScale,
            lineHeight: HEADER.nameSize * typeScale * 1.25,
            color: chart.ink,
          }}
        >
          {name === '' ? 'Captain' : name}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: font.bodyBold,
            fontSize: HEADER.subtitleSize * typeScale,
            lineHeight: HEADER.subtitleSize * typeScale * 1.25,
            letterSpacing: HEADER.subtitleSize * HEADER.subtitleTracking * typeScale,
            color: chart.inkMuted,
          }}
        >
          {SUBTITLE}
        </Text>
      </View>

      <Purse coins={coins} typeScale={typeScale} />
    </View>
  );
}

/** The coin purse. Its coin carries `box-shadow: inset 0 -3px 0 #B87309` — a lit rim, as a crescent. */
function Purse({ coins, typeScale }: { coins: number; typeScale: number }) {
  const coin = HEADER.purse.coin * typeScale;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: HEADER.purse.gap * typeScale,
        paddingLeft: HEADER.purse.padLeft * typeScale,
        paddingRight: HEADER.purse.padRight * typeScale,
        paddingVertical: HEADER.purse.padY * typeScale,
        borderRadius: HEADER.purse.radius,
        backgroundColor: chart.white,
        borderBottomWidth: HEADER.purse.shadowDy * typeScale,
        borderBottomColor: chart.purseShadow,
      }}
    >
      <View
        style={{
          width: coin,
          height: coin,
          borderRadius: 999,
          backgroundColor: chart.gold,
          overflow: 'hidden',
          justifyContent: 'flex-end',
        }}
      >
        {/* Clipped by the circle above, so a straight bar reads as the crescent the inset shadow
            draws. A ring would be the wrong shape: the board lights the bottom edge only. */}
        <View style={{ height: HEADER.purse.coinRimDy * typeScale, backgroundColor: color.goldDeep }} />
      </View>
      <Text
        style={{
          fontFamily: font.displayBold,
          fontSize: HEADER.purse.countSize * typeScale,
          lineHeight: HEADER.purse.countSize * typeScale * 1.2,
          color: chart.ink,
        }}
      >
        {coins}
      </Text>
    </View>
  );
}
