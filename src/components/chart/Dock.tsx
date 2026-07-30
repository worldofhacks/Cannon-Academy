/**
 * The bottom dock — what the live island is, how far along it the captain is, and the two ways in.
 *
 * `board.ts` measures the band exactly: 126pt tall, 12pt of padding, a 27.5pt header row, a 10pt
 * gap and a 64.5pt button row. Those four add up to the 126, which is why the dock is a fixed band
 * rather than a flexed one — the arithmetic IS the design, and letting it flex would let the
 * buttons eat the meter on a short screen.
 *
 * The mastery meter's ten cells are the island's own progress: the mean of `meterPercent` across
 * everything its range teaches. The engine owns the percentage; this only decides how many boxes
 * that fills, which is a drawing decision and belongs here.
 */
import { Pressable, Text, View } from 'react-native';

import type { Island, SkillId } from '@content/schemas';
import { emptyMastery, meterPercent, type SkillMastery } from '@engine/mastery';

import type { HubControl } from '../../services/flow';
import { DOCK, islandGlyph } from './board';
import { chart } from './palette';
import { font } from '../../theme/tokens';

/**
 * The two ways off this screen. The board draws icons, not words, in these slots; `⚔` is
 * emoji-capable and needs U+FE0E or iOS repaints it in colour and ignores `color`.
 */
const FIGHT_ICON = '\u2694\uFE0E';
const RANGE_ICON = '\u25CE';

interface DockProps {
  readonly island: Island;
  readonly mastery: Partial<Record<SkillId, SkillMastery>>;
  /** A closed island can still be described. It just cannot be sailed to. */
  readonly fogged: boolean;
  readonly insetBottom: number;
  readonly typeScale: number;
  readonly controls: readonly HubControl[];
  readonly onDemoRouteEdge: (edgeId: string) => void;
}

export function ChartDock({
  island,
  mastery,
  fogged,
  insetBottom,
  typeScale,
  controls,
  onDemoRouteEdge,
}: DockProps) {
  const pad = DOCK.padding * typeScale;
  const filled = filledCells(island, mastery);

  return (
    <View style={{ marginTop: -DOCK.shadowDy * typeScale, paddingTop: DOCK.shadowDy * typeScale }}>
      {/*
        `box-shadow: 0 -4px 0 rgba(0,0,0,.08)` sits ABOVE the dock, so it is a lip behind it rather
        than a border inside it — and a CSS box-shadow occupies no layout. The negative margin
        cancels the padding that makes room for it, so the lip paints over the map's last 4pt and
        the dock still occupies exactly the 126 the board's `inset: … 126px` reserves for it.
      */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          backgroundColor: chart.dockShadow,
          borderTopLeftRadius: DOCK.radius * typeScale,
          borderTopRightRadius: DOCK.radius * typeScale,
        }}
      />
      <View
        style={{
          height: DOCK.height * typeScale,
          paddingHorizontal: pad,
          paddingTop: pad,
          paddingBottom: pad,
          borderTopLeftRadius: DOCK.radius * typeScale,
          borderTopRightRadius: DOCK.radius * typeScale,
          backgroundColor: chart.parchment,
        }}
      >
        <View
          style={{
            height: DOCK.headerHeight * typeScale,
            flexDirection: 'row',
            alignItems: 'center',
            gap: DOCK.gap * typeScale,
          }}
        >
          <View
            style={{
              width: DOCK.glyphTile.size * typeScale,
              height: DOCK.glyphTile.size * typeScale,
              borderRadius: DOCK.glyphTile.radius * typeScale,
              backgroundColor: chart.live,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: font.displayBold,
                fontSize: DOCK.glyphTile.glyphSize * typeScale,
                lineHeight: DOCK.glyphTile.glyphSize * typeScale * 1.2,
                color: chart.ink,
              }}
            >
              {islandGlyph[island.id]}
            </Text>
          </View>

          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              minWidth: 0,
              fontFamily: font.displayBold,
              fontSize: DOCK.titleSize * typeScale,
              lineHeight: DOCK.titleSize * typeScale * 1.25,
              color: chart.ink,
            }}
          >
            {island.displayName}
          </Text>

          <View style={{ flexDirection: 'row', gap: DOCK.meter.gap * typeScale }}>
            {Array.from({ length: DOCK.meter.cells }, (_, i) => (
              <View
                key={i}
                style={{
                  width: DOCK.meter.size * typeScale,
                  height: DOCK.meter.size * typeScale,
                  borderRadius: DOCK.meter.radius * typeScale,
                  backgroundColor: i < filled ? chart.meterFilled : chart.meterEmpty,
                }}
              />
            ))}
          </View>
        </View>

        {/*
          Five square targets, at the geometry `flow.ts` already computed — NOT `flex: 1` with a
          `minWidth`, which is what overflowed the band.

          The arithmetic: the 64pt tap-target floor across five controls needs 322.5pt, and a 375pt
          phone leaves 351 inside the dock's 12pt inset. That fits with 7.1pt gaps — which is
          precisely what `chartHubControlLayout` derives — but the row was drawn with `DOCK.gap`
          (10), needing 362.5, and `minWidth` stops flex from shrinking anything. So the last button
          hung off the screen and every label truncated to "Har…", "G…", "Fi…".

          Every computed gap here has been wrong, so the row no longer computes one. `flow.ts` derives
          spacing from `viewport.width − 2 × 12` — 351 at a 375pt phone — but the rendered row
          measures **327**: a second 12pt inset sits between the screen and this row that the pure
          geometry cannot see. Four gaps × the 6pt difference is 24pt of overflow, which pinned Fight
          flush to x=375 with no right padding while Harbor kept its 24 on the left. Reading the gap
          back off `control.x` reproduced the same error, because those x values come from the same
          351 assumption.

          Measuring showed the deeper problem: five targets at the 64pt floor are **320pt of button**,
          and a 320pt iPhone SE leaves ~272pt of row. No gap arithmetic fixes that — the buttons
          themselves do not fit, and `space-between` has no slack to distribute, so they simply
          overran the edge.

          So `control.width` is now a CEILING, not a fixed size: `flex: 1` with `maxWidth` lets flex
          divide whatever row actually exists, equally, and clamps at the board's 64pt on a screen wide
          enough to grant it. Never `minWidth` — that was the original overflow, because it forbids
          the shrinking that keeps the last button on screen.

          **Documented trade-off:** at 375pt this yields ~62pt targets rather than 64, and narrower
          phones go lower. The boards set 64 as a floor for small hands, so five controls in this band
          is a demo affordance in tension with that floor at phone widths — the honest fixes are two
          rows (the dock must then grow past the board's 126) or the board's own two controls. Flagged
          for the owner in A-049 rather than silently clipped.

          The labels STAY. A-038 froze a visible-label contract on these buttons — a demo viewer has
          to see where each one goes — so the fix is to stack the label under the icon instead of
          beside it. Side by side, an icon plus "Practice" needs well over 64pt and truncates; in a
          column both fit inside the square with room to spare (A-048).
        */}
        <View
          style={{
            flexDirection: 'row',
            // Centred, not left-packed. `maxWidth` caps each target, so on a tablet or desktop the
            // group stops growing well before the column does — 365pt of buttons in a 1154pt band —
            // and the leftover has to go somewhere. Left-packed it looked like a rendering error.
            // On a phone there is no leftover, so this is a no-op there (A-050).
            justifyContent: 'center',
            gap: DOCK.controlGap * typeScale,
            marginTop: DOCK.gap * typeScale,
          }}
        >
          {controls.map((control) => {
            const disabled = fogged && control.id === 'duel';
            const primary = control.id === 'duel';
            return (
              <Pressable
                key={control.id}
                onPress={disabled ? undefined : () => onDemoRouteEdge(control.edgeId)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityState={{ disabled }}
                accessibilityLabel={control.accessibilityLabel}
                style={({ pressed }) => [
                  {
                    flex: 1,
                    maxWidth: control.width,
                    height: control.height,
                    borderRadius: DOCK.buttonRadius * typeScale,
                    backgroundColor: primary ? chart.gold : chart.white,
                    borderBottomWidth: DOCK.buttonShadowDy * typeScale,
                    borderBottomColor: primary ? chart.liveShadow : chart.purseShadow,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2 * typeScale,
                    opacity: disabled ? 0.45 : 1,
                    paddingHorizontal: 2 * typeScale,
                  },
                  pressed ? { transform: [{ translateY: 2 }], borderBottomWidth: 1 } : null,
                ]}
              >
                <DockIcon id={control.id} primary={primary} typeScale={typeScale} />
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{
                    fontFamily: font.displayBold,
                    fontSize: DOCK.controlLabelSize * typeScale,
                    lineHeight: DOCK.controlLabelSize * typeScale * 1.15,
                    color: primary ? chart.ink : chart.inkMuted,
                  }}
                >
                  {control.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {/* The dock is the last thing on the screen, so it is what has to hold the home indicator. */}
      <View style={{ height: insetBottom, backgroundColor: chart.parchment }} />
    </View>
  );
}

/**
 * The mark on a dock button. Icons, not words — see the row above.
 *
 * `harbor` and `rank` previously had no branch here at all, so they rendered as empty tiles once the
 * labels came off. Both are drawn from Views for the same reason `CannonMark` is: every glyph that
 * reads as "coins" or "ladder" is emoji-capable, and an emoji ignores `color` on iOS, so a muted
 * mark would come back full-colour and out of palette.
 */
function DockIcon({
  id,
  primary,
  typeScale,
}: {
  readonly id: HubControl['id'];
  readonly primary: boolean;
  readonly typeScale: number;
}) {
  const ink = primary ? chart.ink : chart.inkMuted;
  const size = (primary ? DOCK.primaryIconSize : DOCK.secondaryIconSize) * typeScale;

  switch (id) {
    case 'duel':
      return <Text style={{ fontSize: size, lineHeight: size * 1.2, color: ink }}>{FIGHT_ICON}</Text>;
    case 'range':
      return <Text style={{ fontSize: size, lineHeight: size * 1.2, color: ink }}>{RANGE_ICON}</Text>;
    case 'gun-deck':
      return <CannonMark size={size} ink={ink} />;
    case 'harbor':
      return <CoinStackMark size={size} ink={ink} />;
    case 'rank':
      return <LadderMark size={size} ink={ink} />;
  }
}

/** Three stacked coins — the harbour is where coins are spent. */
function CoinStackMark({ size, ink }: { size: number; ink: string }) {
  const coin = size * 0.32;
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            width: size * (0.9 - i * 0.12),
            height: coin,
            borderRadius: 999,
            backgroundColor: ink,
            marginTop: i === 0 ? 0 : -coin * 0.34,
            opacity: 1 - i * 0.18,
          }}
        />
      ))}
    </View>
  );
}

/** Three ascending bars — the rank ladder climbs. */
function LadderMark({ size, ink }: { size: number; ink: string }) {
  const bar = size * 0.24;
  return (
    <View
      style={{
        width: size,
        height: size,
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
      }}
    >
      {[0.45, 0.72, 1].map((h) => (
        <View
          key={h}
          style={{ width: bar, height: size * h, borderRadius: bar * 0.35, backgroundColor: ink }}
        />
      ))}
    </View>
  );
}

/**
 * A cannon, drawn from two blocks rather than typed.
 *
 * Every glyph that reads as a cannon is emoji-capable, and an emoji ignores `color` on iOS — so a
 * muted icon would come back full-colour and out of palette. Two Views cost less than that risk,
 * and they are the same flat-block vocabulary `duel/Ship.tsx` already builds a whole ship from.
 */
function CannonMark({ size, ink }: { size: number; ink: string }) {
  return (
    <View style={{ width: size, height: size, justifyContent: 'flex-end' }}>
      <View
        style={{
          width: size,
          height: size * 0.34,
          borderRadius: size * 0.1,
          backgroundColor: ink,
          marginBottom: size * 0.06,
        }}
      />
      <View
        style={{
          width: size * 0.34,
          height: size * 0.34,
          borderRadius: 999,
          backgroundColor: ink,
          marginLeft: size * 0.16,
        }}
      />
    </View>
  );
}

/**
 * How many of the ten cells this island has earned.
 *
 * The mean across everything its range teaches, not the best skill: Port Sumwich teaches four, and
 * a meter that filled on the strongest one would tell a child they had finished an island they had
 * barely started.
 */
function filledCells(island: Island, mastery: Partial<Record<SkillId, SkillMastery>>): number {
  if (island.rangeSkills.length === 0) return 0;
  const total = island.rangeSkills.reduce((sum, id) => sum + meterPercent(mastery[id] ?? emptyMastery), 0);
  const mean = total / island.rangeSkills.length;
  return Math.min(DOCK.meter.cells, Math.round((mean / 100) * DOCK.meter.cells));
}
