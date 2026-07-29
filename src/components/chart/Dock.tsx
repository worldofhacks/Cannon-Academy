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
  readonly onFight: () => void;
  readonly onRange: () => void;
  readonly onGunDeck: () => void;
}

export function ChartDock({
  island,
  mastery,
  fogged,
  insetBottom,
  typeScale,
  onFight,
  onRange,
  onGunDeck,
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

        <View style={{ flexDirection: 'row', gap: DOCK.gap * typeScale, marginTop: DOCK.gap * typeScale }}>
          <DockButton
            label="Fight"
            icon={FIGHT_ICON}
            textSize={DOCK.primaryTextSize}
            iconSize={DOCK.primaryIconSize}
            fill={chart.gold}
            edge={chart.liveShadow}
            ink={chart.ink}
            disabled={fogged}
            onPress={onFight}
            typeScale={typeScale}
          />
          <DockButton
            label="Practice"
            icon={RANGE_ICON}
            textSize={DOCK.secondaryTextSize}
            iconSize={DOCK.secondaryIconSize}
            fill={chart.white}
            edge={chart.purseShadow}
            ink={chart.inkMuted}
            disabled={fogged}
            onPress={onRange}
            typeScale={typeScale}
          />
          <GunDeckButton onPress={onGunDeck} typeScale={typeScale} />
        </View>
      </View>
      {/* The dock is the last thing on the screen, so it is what has to hold the home indicator. */}
      <View style={{ height: insetBottom, backgroundColor: chart.parchment }} />
    </View>
  );
}

/**
 * The way to the gun deck — the one control on this screen the board does not draw.
 *
 * DEPARTURE, stated plainly. Board 4f is a single static frame and has no gun-deck affordance on
 * it, but `/gun-deck` has no other inbound edge in the whole app: `flow.ts` only routes there when
 * a captain has zero equipped cannons, and `stores/player.ts` auto-equips at placement so that
 * never fires. Without this button a cannon won earned at the range can never be equipped.
 *
 * It is added in the board's own idiom rather than a new one: the same 64.5pt height, 18pt radius
 * and 4pt hard edge as the two measured buttons, and the same white-on-parchment treatment as the
 * secondary — so gold stays the screen's single primary. It is square and icon-only so the two
 * buttons the board DOES draw keep their labels and their proportion.
 *
 * It is never disabled. A captain's loadout is theirs whether or not the island ahead is fogged.
 */
function GunDeckButton({ onPress, typeScale }: { onPress: () => void; typeScale: number }) {
  const side = DOCK.buttonHeight * typeScale;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Gun deck"
      style={({ pressed }) => [
        {
          width: side,
          height: side,
          borderRadius: DOCK.buttonRadius * typeScale,
          backgroundColor: chart.white,
          borderBottomWidth: DOCK.buttonShadowDy * typeScale,
          borderBottomColor: chart.purseShadow,
          alignItems: 'center',
          justifyContent: 'center',
        },
        pressed ? { transform: [{ translateY: 2 }], borderBottomWidth: 1 } : null,
      ]}
    >
      <CannonMark size={DOCK.primaryIconSize * typeScale} ink={chart.inkMuted} />
    </Pressable>
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

interface DockButtonProps {
  readonly label: string;
  readonly icon: string;
  readonly textSize: number;
  readonly iconSize: number;
  readonly fill: string;
  readonly edge: string;
  readonly ink: string;
  readonly disabled: boolean;
  readonly onPress: () => void;
  readonly typeScale: number;
}

function DockButton({
  label,
  icon,
  textSize,
  iconSize,
  fill,
  edge,
  ink,
  disabled,
  onPress,
  typeScale,
}: DockButtonProps) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        {
          flex: 1,
          height: DOCK.buttonHeight * typeScale,
          borderRadius: DOCK.buttonRadius * typeScale,
          backgroundColor: fill,
          borderBottomWidth: DOCK.buttonShadowDy * typeScale,
          borderBottomColor: edge,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6 * typeScale,
          opacity: disabled ? 0.45 : 1,
        },
        pressed ? { transform: [{ translateY: 2 }], borderBottomWidth: 1 } : null,
      ]}
    >
      <Text style={{ fontSize: iconSize * typeScale, lineHeight: iconSize * typeScale * 1.2, color: ink }}>
        {icon}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          fontFamily: font.displayBold,
          fontSize: textSize * typeScale,
          lineHeight: textSize * typeScale * 1.2,
          color: ink,
        }}
      >
        {label}
      </Text>
    </Pressable>
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
