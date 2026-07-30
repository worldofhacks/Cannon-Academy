/**
 * The close chart's header band — FRAME coordinates, the only band on this screen that uses them.
 *
 * `left/right: 12; top: 26; height: 52; z-index: 3`, floating over a full-bleed sea. The board puts
 * it 6pt below a 20pt status bar, so on a real device the 6 survives and the 20 becomes
 * `insets.top`.
 *
 * Both halves are hub controls, and that split is the designer's rule rather than a layout
 * convenience: **the dock is for doing, the header is for having.** Practice/Guns/Fight are verbs
 * and live in the dock; rank and coins are nouns — things you *have* — and live up here. The board
 * draws the `›` on both to say so.
 *
 * Their INK is 52pt and 40pt tall and their TARGETS are 64, padded invisibly. `flow.ts` measures
 * the band by `max(ink, 64)` for exactly that reason, and the arithmetic does not close any other
 * way at a 360pt phone.
 *
 * ── On visible labels ──────────────────────────────────────────────────────────────────────────
 * A-038 froze a visible-label contract on hub controls so a demo viewer can see where each one
 * goes. The dock honours it literally. Up here the board draws no words for them: the rank control
 * shows the captain's name and rank, and the purse shows the balance — each control is *a picture
 * of what you get*, which is the same argument board 9d makes for the compass. Printing "Rank" and
 * "Harbor" over the top would be redrawing the design, so `control.label` reaches the accessibility
 * layer and the ink stays the board's.
 */
import { Pressable, Text, View } from 'react-native';

import type { HubControl } from '../../services/flow';
import { HEADER } from './board';
import { chart } from './palette';
import { Poly } from '../Poly';
import { color, font } from '../../theme/tokens';

interface HeaderPillProps {
  readonly name: string;
  /** The captain's real rank, from the ladder. The board's `VOYAGER` is mock copy. */
  readonly rankName: string;
  readonly rankTier: number;
  readonly coins: number;
  /** Type scale. The pill hugs text, so it follows type rather than art. */
  readonly typeScale: number;
  readonly controls: readonly HubControl[];
  readonly onDemoRouteEdge: (edgeId: string) => void;
}

export function HeaderPill({
  name,
  rankName,
  rankTier,
  coins,
  typeScale,
  controls,
  onDemoRouteEdge,
}: HeaderPillProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: HEADER.gap * typeScale,
        height: HEADER.height * typeScale,
      }}
    >
      {controls.map((control) => {
        if (control.surface !== 'header') return null;

        if (control.id === 'harbor') {
          return (
            <Pressable
              key={control.id}
              accessibilityRole="button"
              accessibilityLabel={control.accessibilityLabel}
              onPress={() => onDemoRouteEdge(control.edgeId)}
              style={({ pressed }) => [
                {
                  flexGrow: 0,
                  flexShrink: 0,
                  height: HEADER.purse.height * typeScale,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: HEADER.purse.gap * typeScale,
                  paddingHorizontal: HEADER.purse.padX * typeScale,
                  borderRadius: 999,
                  backgroundColor: chart.white,
                  borderBottomWidth: HEADER.purse.shadowDy * typeScale,
                  borderBottomColor: chart.parchmentShadow,
                },
                pressed ? { transform: [{ translateY: 2 }], borderBottomWidth: 1 } : null,
              ]}
            >
              <Coin typeScale={typeScale} />
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
              <Chevron typeScale={typeScale} />
            </Pressable>
          );
        }

        return (
          <Pressable
            key={control.id}
            accessibilityRole="button"
            accessibilityLabel={control.accessibilityLabel}
            onPress={() => onDemoRouteEdge(control.edgeId)}
            style={({ pressed }) => [
              {
                flex: 1,
                minWidth: 0,
                height: HEADER.height * typeScale,
                flexDirection: 'row',
                alignItems: 'center',
                gap: HEADER.gap * typeScale,
                paddingHorizontal: HEADER.paddingX * typeScale,
                borderRadius: HEADER.radius * typeScale,
                backgroundColor: chart.parchment,
                borderBottomWidth: HEADER.shadowDy * typeScale,
                borderBottomColor: chart.parchmentShadow,
              },
              pressed ? { transform: [{ translateY: 2 }], borderBottomWidth: 1 } : null,
            ]}
          >
            <Crest tier={rankTier} typeScale={typeScale} />
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
                {rankName.toUpperCase()}
              </Text>
            </View>
            <Chevron typeScale={typeScale} />
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The rank crest: the board's hexagon twice, the inner one 4pt in, with the tier number in it.
 *
 * `clip-path: polygon(50% 0, 100% 16%, 100% 66%, 50% 100%, 0 66%, 0 16%)`.
 *
 * **`tier` is the engine's ZERO-based tier and the crest draws `tier + 1`.** The board numbers the
 * rungs 1–5 for the child; the engine counts 0–4, and `rankTierForWins` is the only source either
 * screen should use. Rendering the raw value put a `0` on a Cadet's chart while `app/rank.tsx` —
 * which already did the `+ 1` — showed `1` for the same captain on the next screen over.
 */
function Crest({ tier, typeScale }: { tier: number; typeScale: number }) {
  const w = HEADER.crest.w * typeScale;
  const h = HEADER.crest.h * typeScale;

  return (
    <View style={{ width: w, height: h }}>
      <Poly points={HEADER.crestPoints} width={w} height={h} fill={chart.live} />
      <View
        style={{
          position: 'absolute',
          left: HEADER.crest.inset * typeScale,
          top: HEADER.crest.inset * typeScale,
          width: HEADER.crest.innerW * typeScale,
          height: HEADER.crest.innerH * typeScale,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Poly
          points={HEADER.crestPoints}
          width={HEADER.crest.innerW * typeScale}
          height={HEADER.crest.innerH * typeScale}
          fill={chart.parchment}
          style={{ position: 'absolute', left: 0, top: 0 }}
        />
        <Text
          style={{
            fontFamily: font.displayBold,
            fontSize: HEADER.crest.tierSize * typeScale,
            lineHeight: HEADER.crest.tierSize * typeScale * 1.2,
            color: chart.ink,
          }}
        >
          {tier + 1}
        </Text>
      </View>
    </View>
  );
}

/** The purse's coin. `box-shadow: inset 0 -3px 0 #B87309` — a lit rim, drawn as a bottom crescent. */
function Coin({ typeScale }: { typeScale: number }) {
  const size = HEADER.purse.coin * typeScale;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        backgroundColor: chart.live,
        overflow: 'hidden',
        justifyContent: 'flex-end',
      }}
    >
      {/* Clipped by the circle above, so a straight bar reads as the crescent the inset shadow
          draws. A ring would be the wrong shape: the board lights the bottom edge only. */}
      <View style={{ height: HEADER.purse.coinRimDy * typeScale, backgroundColor: color.goldDeep }} />
    </View>
  );
}

/** The `›` well the board puts on both halves — the affordance that says "this opens something". */
function Chevron({ typeScale }: { typeScale: number }) {
  const size = HEADER.chevron.size * typeScale;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        backgroundColor: chart.chevronWell,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontFamily: font.bodyBold,
          fontSize: HEADER.chevron.glyphSize * typeScale,
          lineHeight: HEADER.chevron.glyphSize * typeScale * 1.2,
          color: chart.inkMuted,
        }}
      >
        ›
      </Text>
    </View>
  );
}
