/**
 * The dock — the chart's one band of verbs, and the only bottom bar there is.
 *
 * The voyage map used to get a different, smaller bar with a single "Zoom in" button, because it
 * was the secondary view. It is the only view now, so it carries the full dock: the island's name
 * and meter, and Practice / Guns / Fight. Nothing the close chart could do was dropped.
 *
 * `board.ts` measures the dock exactly: 134pt tall, 12pt of padding, a 26pt header row, a 12pt gap
 * and a 72pt button row. Those four add up to the 134, which is why the dock is a fixed band rather
 * than a flexed one — the arithmetic IS the design, and letting it flex would let the buttons eat
 * the meter on a short screen. `chartHubControlLayout` derives its button row from the same four
 * numbers, so the pure model and the rendered band cannot drift apart.
 *
 * Three controls, not five. The designer's split moved rank and coins into the header (*"the dock
 * is for doing, the header is for having"*), which dissolves the whole A-048/A-049 squeeze: three
 * buttons across 351pt is comfortable where five was negative-slack, so the labels are back at the
 * board's own 16/18pt beside a real icon instead of shrunk to 10.5 under one.
 *
 * The mastery meter's ten cells are the island's own progress: the mean of `meterPercent` across
 * everything its range teaches. The engine owns the percentage; this only decides how many boxes
 * that fills, which is a drawing decision and belongs here.
 */
import { useEffect } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type { GradeBand, Island, SkillId } from '@content/schemas';
import { getSkill, islandCurriculumFor } from '@content/index';
import { emptyMastery, meterPercent, type SkillMastery } from '@engine/mastery';
import { maxGradeForBand } from '@engine/placement';

import type { HubControl } from '../../services/flow';
import { DOCK, RING, WAYPOINT_PARTS } from './board';
import { chart } from './palette';
import { Poly } from '../Poly';
import { sprite } from '../../theme/sprites';
import { font } from '../../theme/tokens';

interface DockProps {
  readonly island: Island;
  /** The operator THIS captain meets here (`ChartNode.glyph`), not the board's fixed label. */
  readonly glyph: string;
  /** The captain's band — the meter averages only what they can be asked. */
  readonly gradeBand: GradeBand | null;
  readonly mastery: Partial<Record<SkillId, SkillMastery>>;
  /** A closed island can still be described. It just cannot be fought at. */
  readonly fogged: boolean;
  /**
   * How far the next island is, in whole duels — or `null` once the chain is finished.
   *
   * It rides in the header row's own line, beside the meter, because the two say different things
   * and a child needs both: the meter is the COMPLETIONIST mark (every in-band skill of this island
   * mastered, which is what earns the green tick), while this is the GATE — and since D-11 (A-062)
   * the gate is ONE WIN, so `chartProgress` hands this a `1` whenever a next band-eligible island
   * exists and the chip below always reads `NEXT: 1 DUEL`. Ten cells that fill at a fifth of the
   * speed of the thing they appear to be measuring is how "I won and nothing happened" happens.
   */
  readonly nextIslandCount: number | null;
  readonly insetBottom: number;
  readonly typeScale: number;
  readonly controls: readonly HubControl[];
  readonly onDemoRouteEdge: (edgeId: string) => void;
  /**
   * The arrival ceremony's beat-C handoff (A-065): from the banner beat on, the Fight button takes
   * the ONLY gold ring on the screen — *"the banner says where you are, the dock says what to do
   * next, and only that button glows."* The one prop this ticket may add to the dock.
   */
  readonly highlightFight?: boolean;
}

export function ChartDock({
  island,
  glyph,
  gradeBand,
  mastery,
  fogged,
  nextIslandCount,
  insetBottom,
  typeScale,
  controls,
  onDemoRouteEdge,
  highlightFight = false,
}: DockProps) {
  const pad = DOCK.padding * typeScale;
  const filled = filledCells(island, mastery, gradeBand);

  return (
    <View style={{ marginTop: -DOCK.shadowDy * typeScale, paddingTop: DOCK.shadowDy * typeScale }}>
      {/*
        `box-shadow: 0 -4px 0 rgba(0,0,0,.08)` sits ABOVE the dock, so it is a lip behind it rather
        than a border inside it — and a CSS box-shadow occupies no layout. The negative margin
        cancels the padding that makes room for it, so the lip paints over the map's last 4pt and
        the dock still occupies exactly the 134 the board reserves for it.
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
          padding: pad,
          gap: DOCK.gap * typeScale,
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
            gap: 8 * typeScale,
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
              {glyph}
            </Text>
          </View>

          {/*
            The name yields the whole row while the chip is up.

            Three fixed-width things do not fit this row at a phone width: the glyph tile, the
            "NEXT ISLE" chip and the ten-cell meter. The name already collapsed to zero pixels
            whenever the chip appeared — it was `flex: 1` against two rigid neighbours — so
            rendering it was buying a gap and nothing else. Dropping it reclaims that gap for the
            chip, which is the thing a child can act on. The island's name is on its own node on
            the map directly above, and its glyph is still in this row.
          */}
          {nextIslandCount === null ? (
            <Text
              numberOfLines={1}
              // The D-14 name table's longest cells — `Long-Divide Deep`, `Teen-Ten Harbor` — run
              // three characters past the old longest name, and this row also holds the glyph tile
              // and the non-negotiable ten-cell meter at a phone width. The title shrinks a step
              // rather than ellipsizing (the dock buttons' own posture): a name a child navigates
              // by has to read in full, at SE width too.
              adjustsFontSizeToFit
              style={{
                flex: 1,
                minWidth: 0,
                fontFamily: font.displayBold,
                fontSize: DOCK.titleSize * typeScale,
                lineHeight: DOCK.titleSize * typeScale * 1.25,
                color: chart.ink,
              }}
            >
              {/* The BAND'S OWN name for this island (D-14): the accessor is the only door. */}
              {islandCurriculumFor(island.id, gradeBand).displayName}
            </Text>
          ) : (
            <View style={{ flex: 1, minWidth: 0 }} />
          )}

          {nextIslandCount === null ? null : (
            <View
              style={{
                // Shrinks before the meter does. The meter is a COUNT — a clipped tenth cell is a
                // lie about how far the island is done — whereas this chip degrades to an ellipsis
                // and stays honest.
                flexShrink: 1,
                minWidth: 0,
                paddingHorizontal: DOCK.nextChip.padX * typeScale,
                paddingVertical: DOCK.nextChip.padY * typeScale,
                borderRadius: 999,
                backgroundColor: chart.live,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: font.bodyBold,
                  fontSize: DOCK.nextChip.size * typeScale,
                  lineHeight: DOCK.nextChip.size * typeScale * 1.3,
                  letterSpacing: DOCK.nextChip.size * DOCK.nextChip.tracking * typeScale,
                  // Ink on amber is 6.90. White on amber is one of the four project-banned pairs.
                  color: chart.ink,
                }}
              >
                {/*
                  "NEXT" rather than "NEXT ISLE": the row has to hold this chip AND ten meter cells
                  at a phone width, and the longer form truncated to "NEXT ISLE: 2 D…". A chip that
                  degrades to an ellipsis is a chip a child cannot read, and the meter beside it is
                  not negotiable — so the copy gets shorter rather than the count getting clipped.

                  Since D-11 the count is always 1 while a next island exists (`NEXT: 1 DUEL`); the
                  plural branch stays because the prop's contract is a number, not a boolean, and a
                  chip that printed a wrong plural would be worse than one that can.
                */}
                {nextIslandCount === 1 ? 'NEXT: 1 DUEL' : `NEXT: ${nextIslandCount} DUELS`}
              </Text>
            </View>
          )}

          {/* `flexShrink: 0`: ten cells or none. A clipped meter miscounts the island. */}
          <View style={{ flexShrink: 0, flexDirection: 'row', gap: DOCK.meter.gap * typeScale }}>
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
          The board's own `flex: 1 / 1 / 1.2` row. `control.width` already encodes that ratio —
          `flow.ts` derives it from the same weights and the same 12pt inset — so it is used as the
          flex GROW factor rather than as a fixed width. That way the row always fills the band
          exactly, and on a phone too narrow to grant every control its 64pt floor the ratios
          flatten toward equal instead of the last button hanging off the screen, which is the
          failure mode `minWidth` produced in A-049.
        */}
        <View style={{ flex: 1, flexDirection: 'row', gap: DOCK.controlGap * typeScale }}>
          {controls.map((control) => {
            if (control.surface !== 'dock') return null;
            const primary = control.id === 'duel';
            const disabled = fogged && primary;
            const labelSize = (primary ? DOCK.primaryTextSize : DOCK.secondaryTextSize) * typeScale;

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
                    flexGrow: control.width,
                    flexShrink: 1,
                    flexBasis: 0,
                    borderRadius: DOCK.buttonRadius * typeScale,
                    backgroundColor: primary ? chart.live : chart.white,
                    borderBottomWidth: DOCK.buttonShadowDy * typeScale,
                    borderBottomColor: primary ? chart.liveShadow : chart.whiteShadow,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4 * typeScale,
                    opacity: disabled ? 0.45 : 1,
                    paddingHorizontal: 4 * typeScale,
                  },
                  pressed ? { transform: [{ translateY: 2 }], borderBottomWidth: 1 } : null,
                ]}
              >
                {primary && highlightFight ? (
                  <FightRing radius={DOCK.buttonRadius * typeScale} />
                ) : null}
                <DockIcon id={control.id} typeScale={typeScale} />
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{
                    fontFamily: font.displayBold,
                    fontSize: labelSize,
                    lineHeight: labelSize * 1.15,
                    color: chart.ink,
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

/** How far the Fight ring swells past the button — a rectangle at the marker's 1.5× would leave the dock. */
const FIGHT_RING = { from: 0.96, to: 1.1 } as const;

/**
 * Beat C's only glow (A-065): a gold ring pulsing on the Fight button, on the marker ring's own
 * `sc-ring` clock (`RING.ms`), with the swell tamed for a rectangle. Rendered only while the
 * ceremony says so, so the resting dock is exactly yesterday's dock.
 */
function FightRing({ radius }: { readonly radius: number }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: RING.ms, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
  }, [pulse]);

  // Hoisted numbers only — a `useAnimatedStyle` body runs on the UI runtime and calls no closures.
  const from = FIGHT_RING.from;
  const span = FIGHT_RING.to - FIGHT_RING.from;
  const opacityFrom = RING.opacityFrom;
  const fightRingStyle = useAnimatedStyle(() => ({
    opacity: opacityFrom * (1 - pulse.value),
    transform: [{ scale: from + span * pulse.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          borderRadius: radius,
          borderWidth: 3,
          borderColor: chart.gold,
        },
        fightRingStyle,
      ]}
    />
  );
}

/**
 * The mark on a dock button, in a 26pt-tall box — the board's own three.
 *
 * Practice reuses the gunnery range's buoy ring, Guns is one of the two rasters the board permits,
 * and Fight is the rival's purple sail with a shot beside it. Not glyphs: every character that
 * reads as "cannon" or "duel" is emoji-capable, and an emoji ignores `color` on iOS, so a muted
 * mark would come back full-colour and out of palette.
 */
function DockIcon({ id, typeScale }: { readonly id: HubControl['id']; readonly typeScale: number }) {
  const box = DOCK.iconBox * typeScale;

  if (id === 'gun-deck') {
    return (
      <View style={{ height: box, justifyContent: 'center' }}>
        <Image source={sprite.cannon} style={{ width: 28 * typeScale, height: box }} resizeMode="contain" />
      </View>
    );
  }

  if (id === 'duel') {
    return (
      <View style={{ height: box, flexDirection: 'row', alignItems: 'flex-end', gap: 4 * typeScale }}>
        <Poly
          points={WAYPOINT_PARTS.rival.sail.points}
          width={20 * typeScale}
          height={24 * typeScale}
          fill={chart.rivalMast}
        />
        <View
          style={{
            width: 8 * typeScale,
            height: 8 * typeScale,
            borderRadius: 999,
            backgroundColor: chart.ink,
            marginBottom: 8 * typeScale,
          }}
        />
      </View>
    );
  }

  return (
    <View
      style={{
        width: box,
        height: box,
        borderRadius: 999,
        backgroundColor: chart.buoyRing,
        borderWidth: 5 * typeScale,
        borderColor: chart.buoyBand,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 8 * typeScale,
          height: 8 * typeScale,
          borderRadius: 999,
          backgroundColor: chart.buoyBand,
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
function filledCells(
  island: Island,
  mastery: Partial<Record<SkillId, SkillMastery>>,
  band: GradeBand | null,
): number {
  // Averaged over the BAND'S OWN curriculum for this island (D-14): `islandCurriculumFor` is the
  // only door to what an island teaches, and the cell it returns is already the set this captain
  // can be asked. The ceiling clamp STAYS even though A-069's validator guarantees every shipped
  // cell is in-band — it is the same runtime tripwire `encounterSkillFor` keeps, so a bad future
  // catalog fills no meter instead of measuring a child against maths above their band (the A-051
  // posture, restated for the atlas). A null band reads the accessor's documented g4_5 fallback.
  const ceiling = band === null ? Number.POSITIVE_INFINITY : maxGradeForBand(band);
  const inBand = islandCurriculumFor(island.id, band).skills.filter(
    (id) => getSkill(id).minGrade <= ceiling,
  );
  // Empty means nothing here is age-appropriate at all: no bar rather than a full one. `every` on an
  // empty list is `true`, which is exactly how the sibling bug ticked islands above the band.
  if (inBand.length === 0) return 0;
  const total = inBand.reduce((sum, id) => sum + meterPercent(mastery[id] ?? emptyMastery), 0);
  const mean = total / inBand.length;
  return Math.min(DOCK.meter.cells, Math.round((mean / 100) * DOCK.meter.cells));
}
