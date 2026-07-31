import { router } from 'expo-router';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { ClipPath, Defs, G, Polygon, Rect } from 'react-native-svg';

import { cannons, getIsland, getSkill, islands } from '@content/index';
import type { CannonId, IslandId, SkillId } from '@content/schemas';
import { type DrillSession } from '@engine/drill';
import { emptyMastery, isMastered, meterPercent } from '@engine/mastery';
import { createRng } from '@engine/rng';
import { MASTERY_METER_MAX } from '@engine/tuning';

import { Poly } from '../src/components/Poly';
import { ResponsiveFrame, useResponsiveSurface } from '../src/components/ResponsiveFrame';
import { commitDrill, openDrill, type RangeDrillOutcome } from '../src/services/range';
import {
  advanceRound,
  answerRound,
  bottlesSmashed,
  bottlesStanding,
  hatThrown,
  landTarget,
  openRound,
  RACK_SIZE,
  roundEndCopy,
  type RangeRound,
} from '../src/services/rangeRound';
import type { StandingTarget } from '../src/services/rangeTargets';
import { trainingCatalog } from '../src/services/trainingCatalog';
import { captainActions, captainStore, useCaptain } from '../src/stores/useCaptain';
import { cannonLook } from '../src/theme/cannonPresentation';
import { difficultyPresentation } from '../src/theme/difficultyPresentation';
import { questionTypographyFor } from '../src/theme/questionTypography';
import {
  BARREL,
  BELL,
  BOAT,
  BOB,
  BOTTLE,
  CHIP_COPY,
  DRIFT_OFF,
  FLOAT,
  GULL,
  HEADER,
  HEADER_HEIGHT,
  HIT_MARK,
  INCOMING,
  INCOMING_MS,
  MISS,
  MISS_MS,
  PICK,
  QUESTION,
  RACK_BAR,
  RAFT,
  rangeColor,
  rangeStageHeight,
  sceneScale,
  ROUND_END,
  SHATTER,
  SHEET,
  STAGE,
  STAGE_CHIP,
  stageFraction,
  STREAK_CHIP,
  SWELL,
  SWELLS,
  TARGET_ART,
  TARGET_BERTH,
  TARGET_NOUN,
  TOSS,
  VERDICT_MS,
  type TargetKind,
} from '../src/theme/rangeBoard';
import { sprite } from '../src/theme/sprites';
import { color, MIN_TAP_TARGET, radius, space, type } from '../src/theme/tokens';
import { useLayout, type Layout } from '../src/theme/useLayout';

/**
 * The gunnery range, rebuilt as a game.
 *
 * Source: project `88888c12-22e4-4781-b76f-a28110506499`, `Cannon Academy Practice.dc.html`
 * (turn 11), screen `[data-screen-label="Practice"]`. Every coordinate, hex and copy string is in
 * `src/theme/rangeBoard.ts`, transcribed off that file's `<script data-dc-script>` block; this file
 * is the arrangement, not the measurements. A re-measure is a diff there, not a hunt here — the
 * same split `src/components/chart/board.ts` set for the sea chart.
 *
 * The board diagnoses the screen it replaces in three lines (11c), and the rebuild answers each:
 *
 *   ORDER   — the question came first, so the maths was the event. Now the TARGET lands first and
 *             the sum is what stands between a child and hitting it. One extra phase
 *             (`rangeRound.ts`'s `incoming`), and it is the change the board says matters most.
 *   TARGET  — the buoy was anchored furniture. Now Pim throws six kinds of thing, one of which
 *             flies and one of which is a golden bell.
 *   METER   — ten abstract blocks became ten bottles, so the bar IS the thing being shot at.
 *
 * Everything the screen KNOWS lives elsewhere and is frozen-tested headless: `services/range.ts`
 * decides what is drillable and what a finished drill is worth, `services/rangeRound.ts` is the
 * phase machine, `services/rangeTargets.ts` is the target table. This file owns the two things a
 * node test cannot hold — when a beat elapses, and how long a child took.
 *
 * ── Band safety ────────────────────────────────────────────────────────────────────────────────
 *
 * Every drill on this screen comes from `trainingCatalog`, which filters through `skillInBand`, and
 * every drill that opens goes through `openDrill`, which REFUSES anything the same rule rejects.
 * One rule, two gates, and neither can be reached around: there is no other path from this file to
 * a question. Port Sumwich teaches `two_step_add_sub` at `minGrade: 2`, so a K-1 captain standing
 * on their own first island is offered three of its four racks and never that one.
 *
 * ── Tap targets ────────────────────────────────────────────────────────────────────────────────
 *
 * The board draws a 44pt back tile, which is under the 64pt floor. Its INK stays 44 and its TARGET
 * is padded to 64 with `hitSlop` — the split the chart's header pills already use. Everything else
 * on the board is already at or over 64.
 */

/**
 * `pr-bob`: the boat and the raft ride the same keyframe at different periods.
 *
 * Declared HERE, above every component, and that placement is load-bearing rather than stylistic:
 * `hook-order.test.ts` attributes a lowercase helper's hooks to the last CAPITALISED function it
 * saw, so a hook helper sitting after a component that ends in a single-line `return <…/>` reads as
 * four hooks below an early return. Above the first component there is nothing to attribute them to.
 */
function useBob(ms: number) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: ms, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [t, ms]);

  const riseY = BOB.riseY;
  const rotateDeg = BOB.rotateDeg;
  return useAnimatedStyle(() => ({
    transform: [
      { translateY: -riseY * t.value },
      { rotate: `${-rotateDeg + 2 * rotateDeg * t.value}deg` },
    ],
  }));
}

/** The island a captain lands on when they somehow reach the range without a current island. */
const FIRST_ISLAND: IslandId = firstIslandId();

function firstIslandId(): IslandId {
  const first = [...islands].sort((a, b) => a.order - b.order)[0];
  if (first === undefined) throw new Error('range: the island catalog is empty');
  return first.id;
}

/** What a rack is working toward — the gun this skill unlocks, for its glyph. */
function gunForSkill(skillId: SkillId) {
  const gun = cannons.find((c) => c.unlock.kind === 'range' && c.skill === skillId) ?? cannons[0];
  if (gun === undefined) throw new Error('range: the cannon catalog is empty');
  return gun;
}

function cannonName(id: CannonId): string {
  return cannons.find((c) => c.id === id)?.displayName ?? 'A new gun';
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The screen
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export default function RangeScreen() {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const captain = useCaptain((s) => s.captain);
  const islandId = captain.currentIsland ?? captain.unlockedIslands[0] ?? FIRST_ISLAND;

  const [round, setRound] = useState<RangeRound | null>(null);
  const [outcome, setOutcome] = useState<RangeDrillOutcome | null>(null);
  const askedAt = useRef(0);
  // Which session has already been handed to `commitDrill`. The commit is idempotent per session,
  // so a second call is harmless to the captain — but it returns `applied: false` with zeroed
  // counters, and letting that overwrite the summary would show a child "0 correct" after a perfect
  // round. StrictMode's double-invoke makes that the NORMAL path in development.
  const settled = useRef<unknown>(null);

  const begin = useCallback((pickIslandId: IslandId, skillId: SkillId, next?: DrillSession) => {
    setOutcome(null);
    setRound(
      openRound({
        islandId: pickIslandId,
        skillId,
        captain: captainActions().captain,
        drillRng: createRng(Date.now() >>> 0),
        // A second stream so a target retune can never move a question. `templatePools.ts` warns
        // that the generator INDEXES into the pool it is handed; sharing one rng between the two
        // would make "which bottle" and "which sum" the same draw.
        targetRng: createRng((Date.now() ^ 0x5f3759df) >>> 0),
        ...(next === undefined ? {} : { session: next }),
      }),
    );
  }, []);

  // The toss. Board 11a's whole thesis is this beat existing at all.
  const phase = round?.phase ?? null;
  useEffect(() => {
    if (phase !== 'incoming') return;
    const id = setTimeout(() => {
      askedAt.current = Date.now();
      setRound((r) => (r === null ? r : landTarget(r)));
    }, INCOMING_MS);
    return () => clearTimeout(id);
  }, [phase, round?.session.answered]);

  // The verdict beat: the tapped answer holds its mark, then the next target is tossed. A miss
  // holds longer — a hit is self-evident, a miss has three things to say.
  const wasCorrect = round?.wasCorrect ?? null;
  useEffect(() => {
    if (phase !== 'verdict') return;
    const id = setTimeout(
      () => setRound((r) => (r === null ? r : advanceRound(r))),
      wasCorrect === false ? MISS_MS : VERDICT_MS,
    );
    return () => clearTimeout(id);
  }, [phase, wasCorrect, round?.session.answered]);

  // Where the loop closes: the mastery a child just earned does not exist until it is written to
  // the captain, and the unlocks it fires are read back out of the same commit.
  const session = round?.session ?? null;
  useEffect(() => {
    if (session === null || !session.complete) return;
    if (settled.current === session) return;
    settled.current = session;
    setOutcome(commitDrill(captainStore, session));
  }, [session]);

  const onAnswer = useCallback((value: number) => {
    const elapsedMs = Math.max(0, Date.now() - askedAt.current);
    setRound((r) => {
      if (r === null || r.phase !== 'question' || r.asked === null) return r;
      const index = r.asked.choices.findIndex((c) => c.value === value);
      return answerRound(r, index < 0 ? r.asked.correctIndex : index, elapsedMs);
    });
  }, []);

  const stageHeight = rangeStageHeight(L.height, insets.top);

  return (
    <ResponsiveFrame surface="reading">
      <View style={[s.screen, { paddingTop: insets.top }]}>
        {round === null ? (
          <PickBranch islandId={islandId} onPick={begin} />
        ) : (
          <RoundBranch
            round={round}
            outcome={outcome}
            stageHeight={stageHeight}
            L={L}
            bottomInset={insets.bottom}
            onAnswer={onAnswer}
            onAgain={() => begin(round.islandId, round.skillId)}
            onLeave={() => setRound(null)}
          />
        )}
      </View>
    </ResponsiveFrame>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Shared chrome
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** The 64pt floor from `tokens.ts`, restated locally so `BackTile`'s arithmetic reads in one place. */
const MIN_TAP = MIN_TAP_TARGET;

/**
 * The back tile. 44pt of ink inside a 64pt target — see the header note.
 *
 * The slop is arithmetic rather than a number: `(64 − 44) / 2` per edge, so growing the ink in a
 * re-measure cannot silently shrink the target below the floor.
 */
function BackTile({ label, onPress }: { readonly label: string; readonly onPress: () => void }) {
  const slop = (MIN_TAP / 2 - HEADER.back.size / 2) | 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: slop, bottom: slop, left: slop, right: slop }}
      style={({ pressed }) => [s.backTile, pressed && s.pressed]}
    >
      <Text style={s.backGlyph}>←</Text>
    </Pressable>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The pick branch — "What shall we shoot?"
// ═══════════════════════════════════════════════════════════════════════════════════════════════

function PickBranch({
  islandId,
  onPick,
}: {
  readonly islandId: IslandId;
  readonly onPick: (pickIslandId: IslandId, skill: SkillId, session?: DrillSession) => void;
}) {
  return (
    <View style={s.branch}>
      <View style={s.header}>
        <BackTile label="Leave the range" onPress={() => router.back()} />
        <Text style={s.headerTitle} numberOfLines={1}>
          {PICK.heading}
        </Text>
      </View>
      <SkillPicker islandId={islandId} onPick={onPick} />
    </View>
  );
}

/**
 * The rack chooser — every eligible drill across unlocked islands (A-028), band-filtered.
 *
 * Board 11c's AGENCY note: *"Three racks, one per skill, with their progress visible — so practice
 * is a choice rather than an assignment. Locked racks show what opens them."* The board draws
 * exactly three rows and makes the third a locked `÷ facts`; neither the count nor the `÷` is a
 * rule. Rows come from `trainingCatalog`, which is band-filtered, so a K-1 captain never sees a
 * division rack — not even a locked one. A locked row naming `÷` in front of a five-year-old is
 * A-051's gun-deck operator bug in a new place.
 *
 * A row is LOCKED when its island is not yet unlocked, DONE when the skill is mastered, and
 * playable otherwise. All three states are the board's own art.
 */
function SkillPicker({
  islandId,
  onPick,
}: {
  readonly islandId: IslandId;
  readonly onPick: (pickIslandId: IslandId, skill: SkillId, session?: DrillSession) => void;
}) {
  const captain = useCaptain((c) => c.captain);
  const gradeBand = captain.gradeBand;
  // `trainingCatalog` is total over a null, missing or corrupt band and answers with an empty
  // catalog rather than throwing — the empty state below is what a bandless captain sees, and it
  // is a state they can act on.
  const groups = trainingCatalog({
    unlockedIslands: captain.unlockedIslands,
    currentIsland: islandId,
    gradeBand,
  });
  const hasEntries = groups.some((group) => group.entries.length > 0);

  if (!hasEntries) {
    return (
      <View style={s.pickBody}>
        <Text style={s.pickTitle}>No drills ready</Text>
        <Text style={s.pickBodyText}>
          Sail back to the chart and unlock more practice for your grade.
        </Text>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back to the chart"
          style={({ pressed }) => [s.primary, pressed && s.pressed]}
        >
          <Text style={s.primaryText}>Back to the chart</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.pickBody} showsVerticalScrollIndicator={false}>
      <Text style={s.pickTitle}>{PICK.title}</Text>
      {groups.map((group) => (
        <View key={group.islandId} style={s.pickGroup}>
          <Text style={s.pickGroupTitle}>
            {getIsland(group.islandId).displayName}
            {group.isCurrentIsland ? ' · you are here' : ''}
          </Text>
          {group.entries.map((entry) => {
            const mastery = captain.mastery[entry.skillId] ?? emptyMastery;
            const filled = meterPercent(mastery);
            // The rack is the meter, in tenths — the same countable-blocks contract the dock keeps.
            const smashed = Math.round((filled / MASTERY_METER_MAX) * PICK.rack.count);
            const done = isMastered(mastery);
            const difficulty =
              gradeBand === null || gradeBand === undefined
                ? {
                    label: 'Practice',
                    accessibilityDescription: `Drill ${getSkill(entry.skillId).displayName}`,
                  }
                : difficultyPresentation({ skillId: entry.skillId, gradeBand });
            return (
              <Pressable
                key={`${entry.islandId}:${entry.skillId}`}
                // The drill is opened at the TAP, with the pressed card's own island — never the
                // chart's. `openDrill` is also where the band ceiling refuses, so the offer and the
                // door are checked by the same rule within one statement of each other.
                onPress={() =>
                  onPick(
                    entry.islandId,
                    entry.skillId,
                    openDrill({
                      islandId: entry.islandId,
                      skillId: entry.skillId,
                      captain: captainActions().captain,
                      rng: createRng(Date.now() >>> 0),
                    }),
                  )
                }
                accessibilityRole="button"
                accessibilityLabel={`${difficulty.accessibilityDescription} at ${
                  getIsland(entry.islandId).displayName
                }, ${smashed} of ${PICK.rack.count} bottles smashed`}
                style={({ pressed }) => [s.rackRow, done && s.rackRowDone, pressed && s.pressed]}
              >
                <View style={s.rackGlyph}>
                  <Text style={s.rackGlyphText}>{cannonLook[gunForSkill(entry.skillId).id].glyph}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.rackName} numberOfLines={1}>
                    {getSkill(entry.skillId).displayName}
                  </Text>
                  <Text style={s.rackDifficulty}>{difficulty.label}</Text>
                  <MiniRack smashed={smashed} />
                </View>
                {done ? <DoneBadge /> : <PlayButton />}
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={s.pickNote}>
        <View style={s.pickNoteTile}>
          <Image source={sprite.cannon} style={s.pickNoteSprite} resizeMode="contain" />
        </View>
        <Text style={s.pickNoteText}>{PICK.note.text}</Text>
      </View>
    </ScrollView>
  );
}

/** A rack row's ten bottles: `12×16`, 3pt apart, cleared ones green. */
function MiniRack({ smashed }: { readonly smashed: number }) {
  return (
    <View style={s.miniRack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: PICK.rack.count }, (_, i) => (
        <View key={i} style={[s.miniSlot, i < smashed ? s.miniSlotFull : s.miniSlotEmpty]} />
      ))}
    </View>
  );
}

/** `40×40; border-radius:999; background:#2FB65E` — ink on green, 5.70, never white on it. */
function DoneBadge() {
  return (
    <View style={s.doneBadge}>
      <Text style={s.doneGlyph}>✓</Text>
    </View>
  );
}

/**
 * The board's play button, drawn as an affordance rather than as the control.
 *
 * The board puts its `onClick` on this 64pt square alone. The whole row is the Pressable here and
 * the button is decoration inside it, because the row is already over 64pt tall and a bigger target
 * is strictly better for the hands this is built for. The picture is unchanged.
 */
function PlayButton() {
  return (
    <View style={s.playButton} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Poly
        width={PICK.play.triangle.w}
        height={PICK.play.triangle.h}
        points="0,0 100,50 0,100"
        fill={color.inkDark}
      />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The round branch
// ═══════════════════════════════════════════════════════════════════════════════════════════════

function RoundBranch({
  round,
  outcome,
  stageHeight,
  L,
  bottomInset,
  onAnswer,
  onAgain,
  onLeave,
}: {
  readonly round: RangeRound;
  readonly outcome: RangeDrillOutcome | null;
  readonly stageHeight: number;
  readonly L: Layout;
  readonly bottomInset: number;
  readonly onAnswer: (value: number) => void;
  readonly onAgain: () => void;
  readonly onLeave: () => void;
}) {
  const standing = bottlesStanding(round);
  const smashed = bottlesSmashed(round);

  return (
    <View style={s.branch}>
      <View style={s.header}>
        <BackTile label="Leave the range" onPress={onLeave} />
        <RackBar
          glyph={cannonLook[gunForSkill(round.skillId).id].glyph}
          smashed={smashed}
          sparkedSlot={round.sparkedSlot}
          standing={standing}
        />
      </View>

      <Stage round={round} height={stageHeight} L={L} />

      <View style={[s.sheet, { paddingBottom: SHEET.padding + bottomInset }]}>
        {round.phase === 'incoming' ? <IncomingPanel /> : null}
        {round.phase === 'question' || round.phase === 'verdict' ? (
          round.phase === 'verdict' && round.wasCorrect === false ? (
            <MissPanel round={round} standing={standing} />
          ) : (
            <QuestionPanel round={round} onAnswer={onAnswer} />
          )
        ) : null}
        {round.phase === 'end' ? (
          <RoundEndPanel round={round} outcome={outcome} onAgain={onAgain} onLeave={onLeave} />
        ) : null}
      </View>
    </View>
  );
}

/**
 * The rack bar. Ten bottles and the number still standing, in the slot the title had.
 *
 * Board 11c: *"A five-year-old does not have to learn that the bar represents progress — the bar IS
 * the bottles."* The accessibility label carries the same fact in words, because the shape carries
 * it only for a child who can see it.
 */
function RackBar({
  glyph,
  smashed,
  sparkedSlot,
  standing,
}: {
  readonly glyph: string;
  readonly smashed: number;
  readonly sparkedSlot: number;
  readonly standing: number;
}) {
  return (
    <View
      style={s.rackBar}
      accessibilityRole="progressbar"
      accessibilityLabel={`${smashed} of ${RACK_SIZE} bottles smashed, ${standing} still standing`}
    >
      <View style={s.rackBarOp}>
        <Text style={s.rackBarOpText}>{glyph}</Text>
      </View>
      <View style={s.rackBarSlots}>
        {Array.from({ length: RACK_SIZE }, (_, i) => (
          <RackSlot key={i} filled={i < smashed} sparked={i === sparkedSlot} />
        ))}
      </View>
      <Text style={s.rackBarCount}>{standing}</Text>
    </View>
  );
}

/** One bottle in the bar: a body and a neck, and a `pr-spark` burst on the one just cleared. */
function RackSlot({ filled, sparked }: { readonly filled: boolean; readonly sparked: boolean }) {
  const spark = useSharedValue(0);
  useEffect(() => {
    if (!sparked) return;
    spark.value = 0;
    spark.value = withTiming(1, { duration: RACK_BAR.slot.spark.ms, easing: Easing.out(Easing.quad) });
  }, [spark, sparked]);

  const from = RACK_BAR.slot.spark.from;
  const to = RACK_BAR.slot.spark.to;
  const opacityFrom = RACK_BAR.slot.spark.opacityFrom;
  const sparkStyle = useAnimatedStyle(() => ({
    opacity: sparked ? opacityFrom * (1 - spark.value) : 0,
    transform: [{ scale: from + (to - from) * spark.value }],
  }));

  return (
    <View style={s.rackSlot}>
      <View style={[s.rackSlotBody, filled ? s.rackSlotBodyFull : s.rackSlotBodyEmpty]} />
      <View style={[s.rackSlotNeck, filled ? s.rackSlotNeckFull : s.rackSlotNeckEmpty]} />
      <Animated.View style={[s.rackSlotSpark, sparkStyle]} pointerEvents="none" />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The sea stage
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The scene: sky, water, the child's gun boat, Pim on his raft, and whatever is floating.
 *
 * Vertical positions are FRACTIONS of the board's 212pt stage rather than raw points — a gull
 * berthed at a literal 132 on a 169pt stage flies through the sky's ceiling. Horizontal positions
 * and every drawn size scale by ART. That is `theme/responsive.ts`'s rule applied to a composition:
 * the arrangement is preserved, the art grows.
 */
function Stage({ round, height, L }: { readonly round: RangeRound; readonly height: number; readonly L: Layout }) {
  const surface = useResponsiveSurface();
  // NOT `L.art`. The layout's art scale tracks the frame's width alone, and this stage's height is
  // clamped against the sheet's minimum — so a short frame hands the scene a wide scale and a short
  // box, and the boat's rigging grows through the sky. `sceneScale` takes the smaller of the two.
  const art = sceneScale(height, surface.contentWidth, L.art);
  const waterHeight = Math.round(height * stageFraction(STAGE.water.height));
  const hot = round.streak >= STREAK_CHIP.barrelAt;
  const chip = chipFor(round);

  return (
    <View style={[s.stage, { height }]} pointerEvents="none">
      <View style={[s.sky, { bottom: waterHeight }]} />
      <View style={[s.water, { height: waterHeight }]}>
        <View style={s.waterRim} />
      </View>

      {SWELLS.map((swell, i) => (
        <Swell
          key={i}
          x={swell.x * art}
          bottom={height * stageFraction(swell.bottom)}
          w={swell.w * art}
          ms={swell.ms}
          delayMs={swell.delayMs}
        />
      ))}

      <GunBoat art={art} stageHeight={height} hot={hot} />
      <Raft art={art} stageHeight={height} hatThrown={hatThrown(round)} />

      {round.phase === 'end' ? null : (
        <Target
          target={round.target}
          phase={round.phase}
          wasCorrect={round.wasCorrect}
          art={art}
          stageHeight={height}
        />
      )}

      {chip === null ? null : <StageChip text={chip.text} bg={chip.bg} ink={chip.ink} />}
      {round.streak >= STREAK_CHIP.showFrom ? <StreakChip streak={round.streak} hot={hot} /> : null}
      {round.phase === 'verdict' && round.wasCorrect === true ? (
        <HitMark bell={round.target.kind === 'bell'} art={art} stageHeight={height} />
      ) : null}
    </View>
  );
}

/** The board's chip table, generalised over the six targets — see `TARGET_NOUN`. */
function chipFor(round: RangeRound): { readonly text: string; readonly bg: string; readonly ink: string } | null {
  const noun = TARGET_NOUN[round.target.kind];
  if (round.phase === 'incoming') {
    return { text: `PIM TOSSES ${noun}`, bg: color.parchment, ink: color.inkDark };
  }
  if (round.phase === 'verdict') {
    return round.wasCorrect === true
      ? { text: CHIP_COPY.hit, bg: color.success, ink: color.inkDark }
      : { text: CHIP_COPY.miss, bg: color.seaDeep, ink: color.white };
  }
  if (round.phase !== 'question') return null;
  if (round.target.kind === 'bell') {
    return { text: CHIP_COPY.bell, bg: color.gold, ink: color.inkDark };
  }
  if (round.target.kind === 'gull') {
    return { text: CHIP_COPY.moving, bg: color.parchment, ink: color.inkDark };
  }
  if (round.target.kind === 'barrel') {
    return { text: CHIP_COPY.streak, bg: color.amber, ink: color.inkDark };
  }
  return { text: `HIT ${noun}`, bg: color.parchment, ink: color.inkDark };
}

/** `pr-swell`: drifts 10pt left and back, breathing between .5 and .85 opacity. */
function Swell({
  x,
  bottom,
  w,
  ms,
  delayMs,
}: {
  readonly x: number;
  readonly bottom: number;
  readonly w: number;
  readonly ms: number;
  readonly delayMs: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      delayMs,
      withRepeat(withTiming(1, { duration: ms, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
  }, [t, ms, delayMs]);

  const travelX = SWELL.travelX;
  const from = SWELL.opacityFrom;
  const to = SWELL.opacityTo;
  const style = useAnimatedStyle(() => ({
    opacity: from + (to - from) * t.value,
    transform: [{ translateX: travelX * t.value }],
  }));

  return (
    <Animated.View style={[s.swell, { left: x, bottom, width: w }, style]} />
  );
}

/** The child's gun boat: `left:4; bottom:30; 132×106`, drawn part by part off the board. */
function GunBoat({
  art,
  stageHeight,
  hot,
}: {
  readonly art: number;
  readonly stageHeight: number;
  readonly hot: boolean;
}) {
  const bob = useBob(BOB.boatMs);
  const a = (n: number) => n * art;

  return (
    <Animated.View
      style={[
        s.scenePart,
        { left: a(BOAT.x), bottom: stageHeight * stageFraction(BOAT.bottom), width: a(BOAT.w), height: a(BOAT.h) },
        bob,
      ]}
    >
      <View style={{ position: 'absolute', left: a(BOAT.pennant.x), top: a(BOAT.pennant.y) }}>
        <Poly width={a(BOAT.pennant.w)} height={a(BOAT.pennant.h)} points={BOAT.pennant.points} fill={color.amber} />
      </View>
      <View
        style={[
          s.mast,
          { left: a(BOAT.mast.x), top: a(BOAT.mast.y), width: a(BOAT.mast.w), height: a(BOAT.mast.h), borderRadius: a(BOAT.mast.radius) },
        ]}
      />
      <Sail
        x={a(BOAT.topsail.x)}
        y={a(BOAT.topsail.y)}
        w={a(BOAT.topsail.w)}
        h={a(BOAT.topsail.h)}
        points={BOAT.topsail.points}
        designWidth={BOAT.topsail.w}
      />
      <Sail
        x={a(BOAT.mainsail.x)}
        y={a(BOAT.mainsail.y)}
        w={a(BOAT.mainsail.w)}
        h={a(BOAT.mainsail.h)}
        points={BOAT.mainsail.points}
        designWidth={BOAT.mainsail.w}
      />
      <View
        style={[
          s.rail,
          { left: a(BOAT.rail.x), top: a(BOAT.rail.y), width: a(BOAT.rail.w), height: a(BOAT.rail.h), borderRadius: a(BOAT.rail.radius) },
        ]}
      />
      <View style={{ position: 'absolute', left: a(BOAT.hull.x), top: a(BOAT.hull.y) }}>
        <Poly width={a(BOAT.hull.w)} height={a(BOAT.hull.h)} points={BOAT.hull.points} fill={color.woodLight} />
        <View
          style={[
            s.hullStripe,
            { left: a(BOAT.hull.stripe.x), top: a(BOAT.hull.stripe.y), right: a(BOAT.hull.stripe.x), height: a(BOAT.hull.stripe.h) },
          ]}
        />
        <View style={{ position: 'absolute', left: 0, top: a(BOAT.hull.h - BOAT.hull.keel.h) }}>
          <Poly width={a(BOAT.hull.w)} height={a(BOAT.hull.keel.h)} points={BOAT.hull.points} fill={color.woodDeep} />
        </View>
      </View>
      <View style={{ position: 'absolute', left: a(BOAT.gun.x), top: a(BOAT.gun.y), width: a(BOAT.gun.w), height: a(BOAT.gun.h) }}>
        <View
          style={[
            s.gunCarriage,
            { left: a(BOAT.gun.carriage.x), top: a(BOAT.gun.carriage.y), width: a(BOAT.gun.carriage.w), height: a(BOAT.gun.carriage.h), borderRadius: a(BOAT.gun.carriage.radius) },
          ]}
        />
        <View
          style={[
            s.gunBarrel,
            { left: a(BOAT.gun.barrel.x), top: a(BOAT.gun.barrel.y), width: a(BOAT.gun.barrel.w), height: a(BOAT.gun.barrel.h), borderRadius: a(BOAT.gun.barrel.radius) },
          ]}
        />
        {hot ? <Muzzle art={art} /> : null}
      </View>
    </Animated.View>
  );
}

/**
 * A banded sail.
 *
 * The board authors `repeating-linear-gradient(90deg, #FFF6E4 0 7px, #D93A2E 7px 14px)` under a
 * `clip-path`. RN has neither, and the stripes CANNOT be `View`s under `overflow: 'hidden'` — RN
 * clips to the BOX and a sail is a polygon, so the bands would run past the leech. So they are
 * `Rect`s inside an SVG `ClipPath` of the board's own outline: the same construction
 * `duel/Ship.tsx` uses for the player's canvas, restated here because that one is not exported.
 *
 * `designWidth` is the sail's width in the BOARD's points. The viewBox is 0–100 stretched to the
 * rendered width, so a 7-design-pt band is `7 / designWidth * 100` viewBox units — which is what
 * keeps the bands 7pt wide on the 38pt topsail and the 46pt mainsail alike, instead of scaling with
 * the sail the way a percentage would.
 */
function Sail({
  x,
  y,
  w,
  h,
  points,
  designWidth,
}: {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly points: string;
  readonly designWidth: number;
}) {
  const clipId = `range-sail-${useId().replace(/:/g, '')}`;
  const period = (STRIPE_PERIOD / designWidth) * 100;
  const band = (STRIPE_BAND / designWidth) * 100;
  const bands: number[] = [];
  for (let at = band; at < 100; at += period) bands.push(at);

  return (
    <View style={{ position: 'absolute', left: x, top: y }}>
      <Svg width={w} height={h} viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <ClipPath id={clipId}>
            <Polygon points={points} />
          </ClipPath>
        </Defs>
        <G clipPath={`url(#${clipId})`}>
          <Rect x={0} y={0} width={100} height={100} fill={color.parchment} />
          {bands.map((at) => (
            <Rect key={at} x={at} y={0} width={Math.min(band, 100 - at)} height={100} fill={color.sailStripe} />
          ))}
        </G>
      </Svg>
    </View>
  );
}

/** The board's own gradient stops: a 7pt red band inside a 14pt tile. */
const STRIPE_BAND = BOAT.stripe.width;
const STRIPE_PERIOD = BOAT.stripe.width * 2;

/** `sprites/fire1.png` at the muzzle while the cannon is hot, on `pr-flame`. */
function Muzzle({ art }: { readonly art: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: BOAT.flame.ms, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [t]);

  const scale = BOAT.flame.scale;
  const riseY = BOAT.flame.riseY;
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (scale - 1) * t.value }, { translateY: -riseY * t.value }],
  }));

  const w = BOAT.gun.muzzle.w * art;
  return (
    <Animated.View style={[{ position: 'absolute', left: BOAT.gun.muzzle.x * art, top: 0 }, style]}>
      <Image source={sprite.fire} style={{ width: w, height: w }} resizeMode="contain" />
    </Animated.View>
  );
}

/** Pim's raft: `right:2; bottom:34; 96×80`. He is the crew chibi the Perfect Shot cheer already uses. */
function Raft({
  art,
  stageHeight,
  hatThrown: threw,
}: {
  readonly art: number;
  readonly stageHeight: number;
  readonly hatThrown: boolean;
}) {
  const bob = useBob(BOB.raftMs);
  const a = (n: number) => n * art;
  const p = RAFT.pim;

  return (
    <Animated.View
      style={[
        s.scenePart,
        { right: a(RAFT.right), bottom: stageHeight * stageFraction(RAFT.bottom), width: a(RAFT.w), height: a(RAFT.h) },
        bob,
      ]}
    >
      <View
        style={[
          s.raftDeck,
          { left: a(RAFT.deck.x), top: a(RAFT.deck.y), width: a(RAFT.deck.w), height: a(RAFT.deck.h), borderRadius: a(RAFT.deck.radius) },
        ]}
      >
        <View style={[s.insetShade, { height: a(RAFT.deck.insetDy) }]} />
      </View>
      <View
        style={[
          s.raftCrate,
          { left: a(RAFT.crate.x), top: a(RAFT.crate.y), width: a(RAFT.crate.w), height: a(RAFT.crate.h), borderRadius: a(RAFT.crate.radius) },
        ]}
      >
        <View style={[s.crateBand, { top: a(RAFT.crate.band.y), height: a(RAFT.crate.band.h) }]} />
        <View style={[s.insetShade, { height: a(RAFT.crate.insetDy) }]} />
      </View>

      <View style={{ position: 'absolute', left: a(p.x), top: a(p.y), width: a(p.w), height: a(p.h) }}>
        {p.boots.map((boot, i) => (
          <View
            key={i}
            style={[s.boot, { left: a(boot.x), top: a(boot.y), width: a(boot.w), height: a(boot.h), borderRadius: a(boot.radius) }]}
          />
        ))}
        <View
          style={[
            s.pimBody,
            {
              left: a(p.body.x),
              top: a(p.body.y),
              width: a(p.body.w),
              height: a(p.body.h),
              borderTopLeftRadius: a(p.body.radiusTop),
              borderTopRightRadius: a(p.body.radiusTop),
              borderBottomLeftRadius: a(p.body.radiusBottom),
              borderBottomRightRadius: a(p.body.radiusBottom),
            },
          ]}
        >
          <View style={[s.pimSash, { top: a(p.body.sash.y), height: a(p.body.sash.h) }]} />
        </View>
        <View
          style={[
            s.pimArm,
            {
              left: a(p.arm.x),
              top: a(p.arm.y),
              width: a(p.arm.w),
              height: a(p.arm.h),
              borderRadius: a(p.arm.radius),
              transform: [{ rotate: `${p.arm.angle}deg` }],
            },
          ]}
        />
        <View
          style={[
            s.pimHead,
            { left: a(p.head.x), top: a(p.head.y), width: a(p.head.size), height: a(p.head.height) },
          ]}
        >
          <View style={[s.pimEye, { left: a(p.head.eye.inset), top: a(p.head.eye.y), width: a(p.head.eye.w), height: a(p.head.eye.h) }]} />
          <View style={[s.pimEye, { right: a(p.head.eye.inset), top: a(p.head.eye.y), width: a(p.head.eye.w), height: a(p.head.eye.h) }]} />
          <View style={[s.pimMouth, { left: a(p.head.mouth.x), top: a(p.head.mouth.y), width: a(p.head.mouth.w), height: a(p.head.mouth.h) }]} />
        </View>
        {threw ? null : (
          <View
            style={[
              s.pimHat,
              {
                left: a(p.hat.x),
                top: a(p.hat.y),
                width: a(p.hat.w),
                height: a(p.hat.h),
                borderTopLeftRadius: a(p.hat.radiusTop),
                borderTopRightRadius: a(p.hat.radiusTop),
                borderBottomLeftRadius: a(p.hat.radiusBottom),
                borderBottomRightRadius: a(p.hat.radiusBottom),
              },
            ]}
          />
        )}
      </View>
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The six targets
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Whatever Pim has just thrown.
 *
 * Four animations, chosen by phase and kind exactly as the board's `targetAnim` chooses them:
 * `pr-toss` on arrival, `pr-fly` for the gull, `pr-drift-off` on a miss, `pr-float` otherwise. The
 * shattering shards replace the bottle on a hit.
 */
function Target({
  target,
  phase,
  wasCorrect,
  art,
  stageHeight,
}: {
  readonly target: StandingTarget;
  readonly phase: string;
  readonly wasCorrect: boolean | null;
  readonly art: number;
  readonly stageHeight: number;
}) {
  const shattered = phase === 'verdict' && wasCorrect === true;
  const drifting = phase === 'verdict' && wasCorrect === false;
  const kind = target.kind;
  const berth = TARGET_ART[kind];

  const toss = useSharedValue(phase === 'incoming' ? 0 : 1);
  const float = useSharedValue(0);
  const exit = useSharedValue(0);

  useEffect(() => {
    if (phase !== 'incoming') return;
    toss.value = 0;
    toss.value = withTiming(1, { duration: TOSS.ms, easing: Easing.bezier(0.3, 0.8, 0.4, 1) });
  }, [toss, phase]);

  useEffect(() => {
    if (kind === 'gull') {
      float.value = 0;
      float.value = withRepeat(withTiming(1, { duration: GULL.fly.ms, easing: Easing.linear }), -1, false);
      return;
    }
    float.value = withRepeat(
      withTiming(1, { duration: FLOAT.ms, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [float, kind]);

  useEffect(() => {
    exit.value = 0;
    if (!drifting) return;
    exit.value = withTiming(1, { duration: DRIFT_OFF.ms, easing: Easing.out(Easing.ease) });
  }, [exit, drifting]);

  const isGull = kind === 'gull';
  const tossPeakX = TOSS.peak.dx * art;
  const tossPeakY = TOSS.peak.dy * art;
  const tossEndX = TOSS.end.dx * art;
  const tossFrom = TOSS.fromScale;
  const tossPeakAt = TOSS.peakAt;
  const flyX = GULL.fly.travelX * art;
  const floatRise = FLOAT.riseY * art;
  const floatRot = FLOAT.rotateDeg;
  const driftX = DRIFT_OFF.dx * art;
  const driftRot = DRIFT_OFF.rotateDeg;
  const driftOpacity = DRIFT_OFF.opacityTo;
  const arriving = phase === 'incoming';

  const style = useAnimatedStyle(() => {
    if (arriving) {
      const t = toss.value;
      // Two legs: `0 → 45%` rises to the peak, `45% → 100%` falls to the berth.
      const rising = t < tossPeakAt;
      const leg = rising ? t / tossPeakAt : (t - tossPeakAt) / (1 - tossPeakAt);
      const x = rising ? tossPeakX * leg : tossPeakX + (tossEndX - tossPeakX) * leg;
      const y = rising ? tossPeakY * leg : tossPeakY * (1 - leg);
      return {
        opacity: Math.min(1, t / tossPeakAt),
        transform: [{ translateX: x }, { translateY: y }, { scale: tossFrom + (1 - tossFrom) * Math.min(1, t / tossPeakAt) }],
      };
    }
    if (isGull) {
      return { opacity: 1, transform: [{ translateX: flyX * float.value }, { translateY: 0 }, { scale: 1 }] };
    }
    const drift = exit.value;
    return {
      opacity: 1 - (1 - driftOpacity) * drift,
      transform: [
        { translateX: driftX * drift },
        { translateY: -floatRise * float.value },
        { rotate: `${-floatRot + 2 * floatRot * float.value + driftRot * drift}deg` },
        { scale: 1 },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        s.scenePart,
        {
          right: TARGET_BERTH.right * art,
          bottom: stageHeight * stageFraction(berth.bottom),
          width: berth.w * art,
          height: berth.h * art,
        },
        style,
      ]}
    >
      {shattered && (kind === 'bottle' || kind === 'crate') ? (
        <Shards art={art} />
      ) : (
        <TargetArtwork kind={kind} remaining={target.remaining} art={art} />
      )}
    </Animated.View>
  );
}

function TargetArtwork({
  kind,
  remaining,
  art,
}: {
  readonly kind: TargetKind;
  readonly remaining: number;
  readonly art: number;
}) {
  if (kind === 'barrel') return <BarrelArt art={art} />;
  if (kind === 'gull') return <GullArt art={art} />;
  if (kind === 'bell') return <BellArt art={art} />;
  if (kind === 'crate') return <CrateStackArt art={art} remaining={remaining} />;
  if (kind === 'hat') return <View />;
  return <BottleArt art={art} />;
}

/** The green bottle: body, neck, cork, paper label. */
function BottleArt({ art }: { readonly art: number }) {
  const a = (n: number) => n * art;
  return (
    <View style={{ width: a(TARGET_ART.bottle.w), height: a(TARGET_ART.bottle.h) }}>
      <View
        style={[
          s.bottleBody,
          {
            left: a(BOTTLE.body.x),
            top: a(BOTTLE.body.y),
            width: a(BOTTLE.body.w),
            height: a(BOTTLE.body.h),
            borderTopLeftRadius: a(BOTTLE.body.radiusTop),
            borderTopRightRadius: a(BOTTLE.body.radiusTop),
            borderBottomLeftRadius: a(BOTTLE.body.radiusBottom),
            borderBottomRightRadius: a(BOTTLE.body.radiusBottom),
          },
        ]}
      >
        <View style={[s.bottleShade, { width: a(BOTTLE.body.shadeW), opacity: BOTTLE.body.shadeOpacity }]} />
      </View>
      <View
        style={[s.bottleNeck, { left: a(BOTTLE.neck.x), top: a(BOTTLE.neck.y), width: a(BOTTLE.neck.w), height: a(BOTTLE.neck.h), borderRadius: a(BOTTLE.neck.radius) }]}
      />
      <View
        style={[s.bottleCork, { left: a(BOTTLE.cork.x), top: a(BOTTLE.cork.y), width: a(BOTTLE.cork.w), height: a(BOTTLE.cork.h), borderRadius: a(BOTTLE.cork.radius) }]}
      />
      <View
        style={[s.bottleLabel, { left: a(BOTTLE.label.x), top: a(BOTTLE.label.y), width: a(BOTTLE.label.w), height: a(BOTTLE.label.h), borderRadius: a(BOTTLE.label.radius) }]}
      />
    </View>
  );
}

/** The barrel — the streak reward. Board 11b: the reward for doing well is a bigger target. */
function BarrelArt({ art }: { readonly art: number }) {
  const a = (n: number) => n * art;
  return (
    <View
      style={[
        s.barrel,
        { width: a(TARGET_ART.barrel.w), height: a(TARGET_ART.barrel.h), borderRadius: a(BARREL.radius) },
      ]}
    >
      {BARREL.hoops.map((hoop, i) => (
        <View key={i} style={[s.barrelHoop, { top: a(hoop.y), height: a(hoop.h) }]} />
      ))}
      <View style={[s.bottleShade, { width: a(BARREL.shadeW), opacity: BARREL.shadeOpacity }]} />
    </View>
  );
}

/** Two barrels stacked — the crate. The top one is gone once a correct answer has taken it. */
function CrateStackArt({ art, remaining }: { readonly art: number; readonly remaining: number }) {
  const a = (n: number) => n * art;
  const unit = a(TARGET_ART.barrel.h);
  return (
    <View style={{ width: a(TARGET_ART.crate.w), height: a(TARGET_ART.crate.h) }}>
      {remaining > 1 ? (
        <View style={{ position: 'absolute', left: 0, top: 0 }}>
          <BarrelArt art={art} />
        </View>
      ) : null}
      <View style={{ position: 'absolute', left: 0, top: unit + a(2) }}>
        <BarrelArt art={art} />
      </View>
    </View>
  );
}

/** The gull with a stolen hat — the only target that moves. One keyframe, per board 11b. */
function GullArt({ art }: { readonly art: number }) {
  const a = (n: number) => n * art;
  return (
    <View style={{ width: a(TARGET_ART.gull.w), height: a(TARGET_ART.gull.h) }}>
      <View style={[s.gullBody, { left: a(GULL.body.x), top: a(GULL.body.y), width: a(GULL.body.w), height: a(GULL.body.h) }]}>
        <View style={[s.insetShade, { height: a(GULL.body.insetDy), backgroundColor: color.parchmentEdge }]} />
      </View>
      <View style={[s.gullHead, { left: a(GULL.head.x), top: a(GULL.head.y), width: a(GULL.head.w), height: a(GULL.head.h) }]} />
      <View style={{ position: 'absolute', left: a(GULL.beak.x), top: a(GULL.beak.y) }}>
        <Poly width={a(GULL.beak.w)} height={a(GULL.beak.h)} points={GULL.beak.points} fill={rangeColor.beak} />
      </View>
      <View style={[s.gullEye, { left: a(GULL.eye.x), top: a(GULL.eye.y), width: a(GULL.eye.w), height: a(GULL.eye.h) }]} />
      <View style={{ position: 'absolute', left: a(GULL.wing.x), top: a(GULL.wing.y) }}>
        <Poly width={a(GULL.wing.w)} height={a(GULL.wing.h)} points={GULL.wing.points} fill={rangeColor.lockPlate} />
      </View>
    </View>
  );
}

/** The golden bell. Rare, ringing, glowing — and worth exactly one slot; see `rangeTargets.ts`. */
function BellArt({ art }: { readonly art: number }) {
  const a = (n: number) => n * art;
  const swing = useSharedValue(0);
  const ring = useSharedValue(0);

  useEffect(() => {
    swing.value = withRepeat(
      withTiming(1, { duration: BELL.swing.ms, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    ring.value = withRepeat(withTiming(1, { duration: BELL.ring.ms, easing: Easing.out(Easing.ease) }), -1, false);
  }, [swing, ring]);

  const deg = BELL.swing.deg;
  const ringFrom = BELL.ring.from;
  const ringTo = BELL.ring.to;
  const ringOpacity = BELL.ring.opacityFrom * BELL.ring.baseOpacity;

  const swingStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-deg + 2 * deg * swing.value}deg` }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity * (1 - ring.value),
    transform: [{ scale: ringFrom + (ringTo - ringFrom) * ring.value }],
  }));

  return (
    <Animated.View style={[{ width: a(TARGET_ART.bell.w), height: a(TARGET_ART.bell.h) }, swingStyle]}>
      <Animated.View
        style={[s.bellRing, { width: a(TARGET_ART.bell.w), height: a(TARGET_ART.bell.h) }, ringStyle]}
      />
      <View
        style={[
          s.bellCrown,
          { left: a(BELL.crown.x), top: a(BELL.crown.y), width: a(BELL.crown.w), height: a(BELL.crown.h), borderWidth: a(3) },
        ]}
      />
      <View
        style={[
          s.bellBody,
          {
            left: a(BELL.body.x),
            top: a(BELL.body.y),
            width: a(BELL.body.w),
            height: a(BELL.body.h),
            borderTopLeftRadius: a(BELL.body.radiusTop),
            borderTopRightRadius: a(BELL.body.radiusTop),
            borderBottomLeftRadius: a(BELL.body.radiusBottom),
            borderBottomRightRadius: a(BELL.body.radiusBottom),
          },
        ]}
      >
        <View style={[s.bellShade, { width: a(BELL.body.shadeW) }]} />
      </View>
      <View style={[s.bellLip, { left: a(BELL.lip.x), top: a(BELL.lip.y), width: a(BELL.lip.w), height: a(BELL.lip.h), borderRadius: a(BELL.lip.radius) }]} />
      <View style={[s.bellClapper, { left: a(BELL.clapper.x), top: a(BELL.clapper.y), width: a(BELL.clapper.w), height: a(BELL.clapper.h) }]} />
    </Animated.View>
  );
}

/** Three spinning shards, `pr-shatter-a/b/c`. The reason a hit reads as an event, not a tick. */
function Shards({ art }: { readonly art: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    t.value = withTiming(1, { duration: SHATTER.ms, easing: Easing.out(Easing.quad) });
  }, [t]);

  return (
    <View style={{ width: art * TARGET_ART.bottle.w, height: art * TARGET_ART.bottle.h }}>
      {SHATTER.shards.map((shard, i) => (
        <Shard key={i} shard={shard} art={art} progress={t} />
      ))}
    </View>
  );
}

function Shard({
  shard,
  art,
  progress,
}: {
  readonly shard: (typeof SHATTER.shards)[number];
  readonly art: number;
  readonly progress: { value: number };
}) {
  const dx = shard.dx * art;
  const dy = shard.dy * art;
  const spin = shard.spin;
  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: dx * progress.value },
      { translateY: dy * progress.value },
      { rotate: `${spin * progress.value}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: shard.x * art,
          bottom: shard.bottom * art,
          width: shard.size * art,
          height: shard.size * art,
          borderRadius: shard.radius * art,
          backgroundColor: shard.fill,
        },
        style,
      ]}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The stage's floating chips
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** `pr-rise` — the chip that names what is out there. Every pair here was measured; see `rangeBoard.ts`. */
function StageChip({ text, bg, ink }: { readonly text: string; readonly bg: string; readonly ink: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    t.value = withTiming(1, { duration: STAGE_CHIP.rise.ms, easing: Easing.out(Easing.ease) });
  }, [t, text]);

  const fromY = STAGE_CHIP.rise.fromY;
  const style = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: fromY * (1 - t.value) }],
  }));

  return (
    <Animated.View style={[s.stageChip, { backgroundColor: bg }, style]}>
      <Text style={[s.stageChipText, { color: ink }]} numberOfLines={1}>
        {text}
      </Text>
    </Animated.View>
  );
}

/**
 * `×N`, with `pr-heat` once the cannon is hot.
 *
 * The board spreads a box-shadow to make the chip glow. RN has no spreading shadow, so it is a
 * sibling ring that scales and fades — the substitution `chart/Station.tsx` already makes for
 * `sc-ring`, recorded here so the next re-measure does not read the CSS as unimplemented.
 */
function StreakChip({ streak, hot }: { readonly streak: number; readonly hot: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!hot) return;
    t.value = withRepeat(
      withTiming(1, { duration: STREAK_CHIP.heat.ms, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [t, hot]);

  const spread = STREAK_CHIP.heat.spread;
  const heatOpacity = STREAK_CHIP.heat.opacity;
  const style = useAnimatedStyle(() => ({
    opacity: hot ? heatOpacity * t.value : 0,
    transform: [{ scale: 1 + (spread / 40) * t.value }],
  }));

  return (
    <View style={s.streakChipWrap} accessibilityLabel={`Streak of ${streak}`}>
      <Animated.View style={[s.streakHeat, style]} pointerEvents="none" />
      <View style={s.streakChip}>
        <Poly
          width={STREAK_CHIP.star}
          height={STREAK_CHIP.star}
          points={STREAK_CHIP.starPoints}
          fill={color.gold}
        />
        <Text style={s.streakText}>×{streak}</Text>
      </View>
    </View>
  );
}

/**
 * The `+1` (or a star for the bell) that rises off a hit. Ink on green, never white on it.
 *
 * Berthed by STAGE FRACTION like every other scene element, not by the board's raw `bottom: 96`.
 * A literal 96 on the 91pt stage a landscape phone produces puts the whole chip outside the box —
 * the same trap the gull sets, caught by the same viewport.
 */
function HitMark({
  bell,
  art,
  stageHeight,
}: {
  readonly bell: boolean;
  readonly art: number;
  readonly stageHeight: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    t.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.ease) });
  }, [t]);

  const style = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: STAGE_CHIP.rise.fromY * (1 - t.value) }],
  }));

  return (
    <Animated.View
      style={[
        s.hitMark,
        { right: HIT_MARK.right * art, bottom: stageHeight * stageFraction(HIT_MARK.bottom) },
        style,
      ]}
    >
      <Text style={s.hitMarkText}>+1</Text>
      {bell ? (
        <Poly width={HIT_MARK.star} height={HIT_MARK.star} points={STREAK_CHIP.starPoints} fill={color.inkDark} />
      ) : null}
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The sheet's four panels
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** "Here it comes!" — the beat where the target exists and the question does not yet. */
function IncomingPanel() {
  return (
    <View style={s.incoming}>
      <Text style={s.incomingLine} accessibilityRole="header">
        {INCOMING.line}
      </Text>
      <View style={s.incomingDots}>
        {Array.from({ length: INCOMING.dot.count }, (_, i) => (
          <IncomingDot key={i} delayMs={i * INCOMING.dot.staggerMs} />
        ))}
      </View>
    </View>
  );
}

function IncomingDot({ delayMs }: { readonly delayMs: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(1, { duration: INCOMING.pop.ms / 2, easing: Easing.out(Easing.ease) }),
          withTiming(0, { duration: INCOMING.pop.ms / 2, easing: Easing.in(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
  }, [t, delayMs]);

  const from = INCOMING.pop.from;
  const overshoot = INCOMING.pop.overshoot;
  const style = useAnimatedStyle(() => ({
    opacity: 0.4 + 0.6 * t.value,
    transform: [{ scale: from + (overshoot - from) * t.value }],
  }));

  return (
    <Animated.View style={[s.incomingDot, style]} />
  );
}

/**
 * The question and its four answers.
 *
 * NOT the duel's `QuestionPanel`, and that is a deliberate departure from A-009's "reuse the duel
 * question UI" cut line: this board redraws the band. It has no fuse (board 11a: *"there is no
 * timer at any band"*), no cannon name (a child at the range is practising a skill, not firing a
 * gun) and no `FAST = PERFECT SHOT` chip (there is no perfect shot here to earn). What IS shared is
 * the thing that had to be — `questionTypographyFor`, A-023's rule that keeps a word problem
 * readable at 375pt, scaled onto this board's 40pt band by `QUESTION.sizeRatio`.
 */
function QuestionPanel({
  round,
  onAnswer,
}: {
  readonly round: RangeRound;
  readonly onAnswer: (value: number) => void;
}) {
  const asked = round.asked;
  const typography = useMemo(() => questionTypographyFor(asked?.text ?? ''), [asked?.text]);
  if (asked === null) return <View style={s.questionWrap} />;

  const rows = [asked.choices.slice(0, 2), asked.choices.slice(2, 4)];

  return (
    <View style={s.questionWrap}>
      <View style={s.questionRow}>
        <Text
          style={[
            s.questionText,
            {
              fontSize: typography.style.fontSize * QUESTION.sizeRatio,
              lineHeight: typography.style.lineHeight * QUESTION.sizeRatio,
            },
          ]}
          accessibilityRole="header"
          accessibilityLabel={asked.text}
          numberOfLines={typography.numberOfLines}
          adjustsFontSizeToFit={typography.adjustsFontSizeToFit}
          minimumFontScale={typography.minimumFontScale}
        >
          {asked.text}
        </Text>
      </View>

      {/* Explicit rows, not a wrapping list: two rows of `flex: 1` fill the sheet, which is what
          makes every answer a big target instead of a small one near the top. */}
      <View style={s.answerGrid}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={s.answerRow}>
            {row.map((choice, columnIndex) => {
              const index = rowIndex * 2 + columnIndex;
              const marked = round.picked !== null && round.picked === choice.value;
              const isRight = index === asked.correctIndex;
              return (
                <Pressable
                  key={`${choice.value}:${index}`}
                  onPress={() => onAnswer(choice.value)}
                  disabled={round.phase !== 'question'}
                  accessibilityRole="button"
                  accessibilityLabel={`Answer ${choice.value}`}
                  style={({ pressed }) => [s.answer, pressed && s.answerPressed]}
                >
                  <Text style={s.answerText}>{choice.value}</Text>
                  {marked ? (
                    <View style={[s.answerMark, { backgroundColor: isRight ? color.success : color.dangerInk }]}>
                      <Text style={s.answerMarkGlyph}>{isRight ? '✓' : '✕'}</Text>
                      <Text style={s.answerMarkValue}>{choice.value}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * The miss panel — three stacked promises.
 *
 * The whole reason the range exists is that it is the one place in the game where nothing can go
 * wrong (board 11c), and this is where that is said out loud: the target floated away, here is the
 * answer it wanted, and your rack still has N. Nothing was lost.
 */
function MissPanel({ round, standing }: { readonly round: RangeRound; readonly standing: number }) {
  const asked = round.asked;
  const right = asked === null ? null : asked.choices[asked.correctIndex]?.value ?? null;

  return (
    <View style={s.missWrap}>
      <View style={s.missBanner}>
        <View style={s.missBannerTile}>
          <Text style={s.missBannerTileText}>~</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.missTitle}>{MISS.title}</Text>
          <Text style={s.missSub}>{MISS.subtitle}</Text>
        </View>
      </View>

      <View style={s.missAnswer}>
        <View style={s.missAnswerTile}>
          <Text style={s.missAnswerTileText}>✓</Text>
        </View>
        <Text style={s.missAnswerText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
          {asked === null || right === null ? '' : `${asked.text.replace(/\s*[=?]+\s*$/, '')} = ${right}`}
        </Text>
      </View>

      <View style={s.missNote}>
        <View style={s.missNoteTile}>
          <Text style={s.missNoteTileText}>{standing}</Text>
        </View>
        <Text style={s.missNoteText}>{MISS.line(standing)}</Text>
      </View>
    </View>
  );
}

/**
 * The payout. Board 11c's END note: *"a rack that empties has a beginning and an end a child can
 * hold in their head."*
 *
 * The third stat is the METER, not the board's `+35 COINS`. The range grants nothing but mastery
 * (A-009 AC-5) and `harbor.test.ts` pins that `services/range.ts` never so much as says the word,
 * because the harbor board once printed a payout the range does not make. Printing a number the
 * purse will not show is the same lie in a new place; the meter is the true one, and it is also the
 * answer to "why did I come here".
 */
function RoundEndPanel({
  round,
  outcome,
  onAgain,
  onLeave,
}: {
  readonly round: RangeRound;
  readonly outcome: RangeDrillOutcome | null;
  readonly onAgain: () => void;
  readonly onLeave: () => void;
}) {
  const copy = roundEndCopy(round);
  const smashed = bottlesSmashed(round);
  const meter = outcome?.meterPercent ?? meterPercent(round.session.mastery);
  const unlockedCannons = outcome?.unlockedCannons ?? [];
  const unlockedIslands = outcome?.unlockedIslands ?? [];

  const stats: readonly { readonly n: string; readonly label: string; readonly ink: string }[] = [
    { n: `${smashed}`, label: ROUND_END.stats.labels[0], ink: ROUND_END.stats.smashedInk },
    { n: `${round.bestStreak}`, label: ROUND_END.stats.labels[1], ink: color.inkDark },
    { n: `${meter}%`, label: ROUND_END.stats.labels[2], ink: color.inkDark },
  ];

  return (
    <ScrollView contentContainerStyle={s.endWrap} showsVerticalScrollIndicator={false}>
      <View style={s.endHead}>
        <View style={s.endTile}>
          <Text style={s.endTileGlyph}>✓</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.endTitle} accessibilityRole="header">
            {copy.title}
          </Text>
          <Text style={s.endSub}>{copy.sub}</Text>
        </View>
      </View>

      <View style={s.endStats}>
        {stats.map((stat) => (
          <View key={stat.label} style={s.endStat} accessibilityLabel={`${stat.n} ${stat.label}`}>
            <Text style={[s.endStatNumber, { color: stat.ink }]}>{stat.n}</Text>
            <Text style={s.endStatLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {hatThrown(round) ? (
        <View style={s.hatCard}>
          <Text style={s.hatText}>Pim threw his own hat in the water. Ten out of ten.</Text>
        </View>
      ) : null}

      {unlockedCannons.map((id) => (
        <View key={id} style={s.rewardCard}>
          <View style={s.rewardTile}>
            <Image source={sprite.cannonMobile} style={s.rewardSprite} resizeMode="contain" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.rewardKicker}>NEW CANNON</Text>
            <Text style={s.rewardName}>{cannonName(id)}</Text>
          </View>
        </View>
      ))}

      {unlockedIslands.map((id) => (
        <View key={id} style={s.fogCard}>
          <Text style={s.rewardKicker}>THE FOG LIFTS</Text>
          <Text style={s.rewardName}>{getIsland(id).displayName} is on the chart.</Text>
        </View>
      ))}

      {outcome?.mastered === true && unlockedCannons.length === 0 && unlockedIslands.length === 0 ? (
        <Text style={s.endNote}>This skill is mastered. Every rack from here is practice.</Text>
      ) : null}

      <Pressable
        onPress={onAgain}
        accessibilityRole="button"
        accessibilityLabel={ROUND_END.again.label}
        style={({ pressed }) => [s.primary, pressed && s.pressed]}
      >
        <Text style={s.primaryText}>{ROUND_END.again.label}</Text>
      </Pressable>
      <Pressable
        onPress={onLeave}
        accessibilityRole="button"
        accessibilityLabel="Pick another rack"
        style={({ pressed }) => [s.secondary, pressed && s.pressed]}
      >
        <Text style={s.secondaryText}>Pick another rack</Text>
      </Pressable>
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Styles — every value from `rangeBoard.ts` or `tokens.ts`, none invented here
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.seaDeep },
  branch: { flex: 1 },
  pressed: { transform: [{ translateY: 2 }], opacity: 0.9 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: HEADER.gap,
    paddingHorizontal: HEADER.padX,
    paddingVertical: HEADER.padY,
    backgroundColor: color.seaDeep,
    height: HEADER_HEIGHT,
  },
  backTile: {
    width: HEADER.back.size,
    height: HEADER.back.size,
    borderRadius: HEADER.back.radius,
    // NOT the board's `#1584B8`. That is white on `sea` at 4.18 — a banned pair, and the same one
    // A-054 took off the temperament badge. See `rangeColor.seaPlate` for the measurement.
    backgroundColor: rangeColor.seaPlate,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: {
    ...type.display,
    fontSize: HEADER.back.glyphSize,
    lineHeight: HEADER.back.glyphSize + 4,
    color: color.white,
  },
  headerTitle: {
    ...type.display,
    flex: 1,
    fontSize: HEADER.titleSize,
    lineHeight: HEADER.titleSize + 5,
    color: color.white,
  },

  // ── The rack bar ───────────────────────────────────────────────────────────
  rackBar: {
    flex: 1,
    minWidth: 0,
    height: RACK_BAR.height,
    borderRadius: RACK_BAR.radius,
    backgroundColor: color.parchment,
    borderBottomWidth: RACK_BAR.shadowDy,
    borderBottomColor: rangeColor.rackEmptyNeck,
    flexDirection: 'row',
    alignItems: 'center',
    gap: RACK_BAR.gap,
    paddingHorizontal: RACK_BAR.padX,
  },
  rackBarOp: {
    width: RACK_BAR.op.size,
    height: RACK_BAR.op.size,
    borderRadius: RACK_BAR.op.radius,
    backgroundColor: color.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rackBarOpText: {
    ...type.display,
    fontSize: RACK_BAR.op.glyphSize,
    lineHeight: RACK_BAR.op.glyphSize + 4,
    color: color.inkDark,
  },
  rackBarSlots: { flex: 1, minWidth: 0, flexDirection: 'row', gap: RACK_BAR.slot.gap },
  rackBarCount: {
    ...type.display,
    fontSize: RACK_BAR.countSize,
    lineHeight: RACK_BAR.countSize + 4,
    color: color.inkDark,
  },
  rackSlot: { flex: 1, height: RACK_BAR.slot.boxHeight },
  rackSlotBody: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: RACK_BAR.slot.body.height,
    borderTopLeftRadius: RACK_BAR.slot.body.radiusTop,
    borderTopRightRadius: RACK_BAR.slot.body.radiusTop,
    borderBottomLeftRadius: RACK_BAR.slot.body.radiusBottom,
    borderBottomRightRadius: RACK_BAR.slot.body.radiusBottom,
  },
  rackSlotBodyFull: { backgroundColor: rangeColor.bottleGlass },
  rackSlotBodyEmpty: { backgroundColor: color.parchmentEdge },
  rackSlotNeck: {
    position: 'absolute',
    left: `${RACK_BAR.slot.neck.insetPercent}%`,
    right: `${RACK_BAR.slot.neck.insetPercent}%`,
    top: 0,
    height: RACK_BAR.slot.neck.height,
    borderRadius: RACK_BAR.slot.neck.radius,
  },
  rackSlotNeckFull: { backgroundColor: rangeColor.bottleNeck },
  rackSlotNeckEmpty: { backgroundColor: rangeColor.rackEmptyNeck },
  rackSlotSpark: {
    position: 'absolute',
    left: -RACK_BAR.slot.spark.inset,
    right: -RACK_BAR.slot.spark.inset,
    top: -RACK_BAR.slot.spark.inset,
    bottom: -RACK_BAR.slot.spark.inset,
    borderRadius: RACK_BAR.slot.spark.radius,
    backgroundColor: color.gold,
  },

  // ── The pick branch ────────────────────────────────────────────────────────
  pickBody: { flexGrow: 1, backgroundColor: color.parchment, padding: PICK.padding, gap: PICK.gap },
  pickTitle: { ...type.display, fontSize: PICK.titleSize, lineHeight: PICK.titleSize + 5, color: color.inkDark },
  pickBodyText: { ...type.caption, color: color.inkDarkMuted },
  pickGroup: { gap: PICK.gap },
  pickGroupTitle: { ...type.eyebrow, color: color.inkDarkMuted },
  rackRow: {
    minHeight: 64,
    borderRadius: PICK.row.radius,
    backgroundColor: color.white,
    borderBottomWidth: PICK.row.shadowDy,
    borderBottomColor: color.parchmentEdge,
    padding: PICK.row.padding,
    flexDirection: 'row',
    alignItems: 'center',
    gap: PICK.row.gap,
  },
  rackRowDone: { backgroundColor: rangeColor.parchmentSunk, borderBottomColor: rangeColor.rackEmptyNeck },
  rackGlyph: {
    width: PICK.glyph.size,
    height: PICK.glyph.size,
    borderRadius: PICK.glyph.radius,
    backgroundColor: rangeColor.parchmentSunk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rackGlyphText: {
    ...type.display,
    fontSize: PICK.glyph.textSize,
    lineHeight: PICK.glyph.textSize + 4,
    color: color.inkDark,
  },
  // The only `type` spread on this screen that did not carry its own line box. `title`'s 31 is
  // sized for 19pt; at `PICK.nameSize` it has to come down with it (`theme/tokens.ts` ratio note).
  rackName: {
    ...type.title,
    fontSize: PICK.nameSize,
    lineHeight: Math.ceil(PICK.nameSize * 1.602),
    color: color.inkDark,
  },
  rackDifficulty: { ...type.chip, color: color.inkDarkMuted, marginTop: 2 },
  miniRack: { flexDirection: 'row', gap: PICK.rack.gap, marginTop: 6 },
  miniSlot: {
    width: PICK.rack.w,
    height: PICK.rack.h,
    borderTopLeftRadius: PICK.rack.radiusTop,
    borderTopRightRadius: PICK.rack.radiusTop,
    borderBottomLeftRadius: PICK.rack.radiusBottom,
    borderBottomRightRadius: PICK.rack.radiusBottom,
  },
  miniSlotFull: { backgroundColor: rangeColor.bottleGlass },
  miniSlotEmpty: { backgroundColor: color.parchmentEdge },
  doneBadge: {
    width: PICK.done.size,
    height: PICK.done.size,
    borderRadius: radius.pill,
    backgroundColor: color.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneGlyph: {
    ...type.display,
    fontSize: PICK.done.glyphSize,
    lineHeight: PICK.done.glyphSize + 4,
    color: color.inkDark,
  },
  playButton: {
    width: PICK.play.size,
    height: PICK.play.size,
    borderRadius: PICK.play.radius,
    backgroundColor: color.amber,
    borderBottomWidth: PICK.play.shadowDy,
    borderBottomColor: color.goldDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickNote: {
    borderRadius: PICK.note.radius,
    backgroundColor: rangeColor.parchmentSunk,
    padding: PICK.note.padding,
    flexDirection: 'row',
    alignItems: 'center',
    gap: PICK.note.gap,
  },
  pickNoteTile: {
    width: PICK.note.tile,
    height: PICK.note.tile,
    borderRadius: PICK.note.tileRadius,
    backgroundColor: color.parchment,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickNoteSprite: { width: PICK.note.spriteW, height: PICK.note.spriteW },
  pickNoteText: { ...type.body, flex: 1, fontSize: PICK.note.textSize, color: color.inkDarkMuted },

  // ── The stage ──────────────────────────────────────────────────────────────
  stage: { position: 'relative', overflow: 'hidden', backgroundColor: STAGE.sky.to },
  sky: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: STAGE.sky.from, opacity: 0.85 },
  water: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: color.sea },
  waterRim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: STAGE.water.rimHeight,
    backgroundColor: color.seaFoam,
  },
  swell: { position: 'absolute', height: SWELL.height, borderRadius: radius.pill, backgroundColor: color.seaFoam },
  scenePart: { position: 'absolute' },
  mast: { position: 'absolute', backgroundColor: color.wood },
  rail: { position: 'absolute', backgroundColor: color.deck },
  hullStripe: { position: 'absolute', backgroundColor: color.amber },
  gunCarriage: { position: 'absolute', backgroundColor: color.iron },
  gunBarrel: { position: 'absolute', backgroundColor: color.ironDeep },
  raftDeck: { position: 'absolute', backgroundColor: color.woodLight, overflow: 'hidden' },
  raftCrate: { position: 'absolute', backgroundColor: color.woodLight, overflow: 'hidden' },
  crateBand: { position: 'absolute', left: 0, right: 0, backgroundColor: color.deck },
  insetShade: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: color.woodDeep },
  boot: { position: 'absolute', backgroundColor: color.gunport },
  pimBody: { position: 'absolute', backgroundColor: rangeColor.crewLinen, overflow: 'hidden' },
  pimSash: { position: 'absolute', left: 0, right: 0, backgroundColor: color.sailStripe },
  pimArm: { position: 'absolute', backgroundColor: rangeColor.crewLinen },
  pimHead: { position: 'absolute', borderRadius: radius.pill, backgroundColor: color.captainSkin },
  pimEye: { position: 'absolute', borderRadius: radius.pill, backgroundColor: color.inkDark },
  pimMouth: {
    position: 'absolute',
    borderBottomLeftRadius: radius.pill,
    borderBottomRightRadius: radius.pill,
    backgroundColor: color.inkDark,
  },
  pimHat: { position: 'absolute', backgroundColor: color.sailStripe },

  // ── The targets ────────────────────────────────────────────────────────────
  bottleBody: { position: 'absolute', backgroundColor: rangeColor.bottleGlass, overflow: 'hidden' },
  bottleShade: { position: 'absolute', right: 0, top: 0, bottom: 0, backgroundColor: color.gunport },
  bottleNeck: { position: 'absolute', backgroundColor: rangeColor.bottleGlass },
  bottleCork: { position: 'absolute', backgroundColor: color.woodLight },
  bottleLabel: { position: 'absolute', backgroundColor: color.parchment },
  barrel: { backgroundColor: color.woodLight, overflow: 'hidden' },
  barrelHoop: { position: 'absolute', left: 0, right: 0, backgroundColor: color.deck },
  gullBody: { position: 'absolute', borderRadius: radius.pill, backgroundColor: color.parchment, overflow: 'hidden' },
  gullHead: { position: 'absolute', borderRadius: radius.pill, backgroundColor: color.parchment },
  gullEye: { position: 'absolute', borderRadius: radius.pill, backgroundColor: color.inkDark },
  bellRing: { position: 'absolute', left: 0, top: 0, borderRadius: radius.pill, backgroundColor: color.gold },
  bellCrown: {
    position: 'absolute',
    borderTopLeftRadius: radius.pill,
    borderTopRightRadius: radius.pill,
    borderColor: color.goldDeep,
    borderBottomWidth: 0,
  },
  bellBody: { position: 'absolute', backgroundColor: color.amber, overflow: 'hidden' },
  bellShade: { position: 'absolute', right: 0, top: 0, bottom: 0, backgroundColor: color.goldDeep },
  bellLip: { position: 'absolute', backgroundColor: color.gold },
  bellClapper: {
    position: 'absolute',
    borderBottomLeftRadius: radius.pill,
    borderBottomRightRadius: radius.pill,
    backgroundColor: color.goldDeep,
  },

  // ── The stage chips ────────────────────────────────────────────────────────
  stageChip: {
    position: 'absolute',
    left: STAGE_CHIP.x,
    top: STAGE_CHIP.y,
    maxWidth: '62%',
    paddingHorizontal: STAGE_CHIP.padX,
    paddingVertical: STAGE_CHIP.padY,
    borderRadius: radius.pill,
  },
  stageChipText: { ...type.chip, fontSize: STAGE_CHIP.size, letterSpacing: STAGE_CHIP.size * STAGE_CHIP.tracking },
  streakChipWrap: { position: 'absolute', right: STREAK_CHIP.x, top: STREAK_CHIP.y },
  streakHeat: {
    position: 'absolute',
    left: -STREAK_CHIP.heat.spread,
    right: -STREAK_CHIP.heat.spread,
    top: -STREAK_CHIP.heat.spread,
    bottom: -STREAK_CHIP.heat.spread,
    borderRadius: radius.pill,
    backgroundColor: STREAK_CHIP.heat.color,
  },
  streakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: STREAK_CHIP.gap,
    paddingHorizontal: STREAK_CHIP.padX,
    paddingVertical: STREAK_CHIP.padY,
    borderRadius: radius.pill,
    backgroundColor: color.inkDark,
  },
  streakText: {
    ...type.display,
    fontSize: STREAK_CHIP.textSize,
    lineHeight: STREAK_CHIP.textSize + 4,
    color: color.gold,
  },
  hitMark: {
    position: 'absolute',
    height: HIT_MARK.height,
    paddingHorizontal: HIT_MARK.padX,
    borderRadius: radius.pill,
    backgroundColor: color.success,
    flexDirection: 'row',
    alignItems: 'center',
    gap: HIT_MARK.gap,
  },
  hitMarkText: {
    ...type.display,
    fontSize: HIT_MARK.textSize,
    lineHeight: HIT_MARK.textSize + 4,
    color: color.inkDark,
  },

  // ── The sheet ──────────────────────────────────────────────────────────────
  sheet: {
    flex: 1,
    backgroundColor: color.parchment,
    borderTopLeftRadius: SHEET.radius,
    borderTopRightRadius: SHEET.radius,
    padding: SHEET.padding,
    gap: SHEET.gap,
  },

  incoming: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: INCOMING.gap },
  incomingLine: {
    ...type.display,
    fontSize: INCOMING.lineSize,
    lineHeight: INCOMING.lineSize + 6,
    color: color.inkDark,
  },
  incomingDots: { flexDirection: 'row', gap: INCOMING.dot.gap },
  incomingDot: {
    width: INCOMING.dot.size,
    height: INCOMING.dot.size,
    borderRadius: radius.pill,
    backgroundColor: color.amber,
  },

  questionWrap: { flex: 1, gap: SHEET.gap },
  questionRow: { height: QUESTION.rowHeight, alignItems: 'center', justifyContent: 'center' },
  questionText: { ...type.display, color: color.inkDark, textAlign: 'center' },
  answerGrid: { flex: 1, gap: QUESTION.grid.gap },
  answerRow: { flex: 1, flexDirection: 'row', gap: QUESTION.grid.gap },
  answer: {
    flex: 1,
    minWidth: 0,
    minHeight: QUESTION.answer.minHeight,
    borderRadius: QUESTION.answer.radius,
    backgroundColor: color.white,
    borderBottomWidth: QUESTION.answer.shadowDy,
    borderBottomColor: color.parchmentEdge,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  answerPressed: { transform: [{ translateY: 3 }] },
  answerText: {
    ...type.display,
    fontSize: QUESTION.answer.textSize,
    lineHeight: QUESTION.answer.textSize + 6,
    color: color.inkDark,
  },
  answerMark: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    borderRadius: QUESTION.answer.radius,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
  },
  answerMarkGlyph: {
    ...type.display,
    fontSize: QUESTION.mark.glyphSize,
    lineHeight: QUESTION.mark.glyphSize + 4,
    color: color.inkDark,
  },
  answerMarkValue: {
    ...type.display,
    fontSize: QUESTION.mark.valueSize,
    lineHeight: QUESTION.mark.valueSize + 4,
    color: color.inkDark,
  },

  missWrap: { flex: 1, gap: 10 },
  missBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: MISS.banner.gap,
    padding: MISS.banner.padding,
    borderRadius: MISS.banner.radius,
    backgroundColor: color.seaDeep,
  },
  missBannerTile: {
    width: MISS.banner.tile,
    height: MISS.banner.tile,
    borderRadius: MISS.banner.tileRadius,
    backgroundColor: color.parchment,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missBannerTileText: { ...type.display, fontSize: 22, lineHeight: 26, color: color.inkDark },
  missTitle: {
    ...type.display,
    fontSize: MISS.banner.titleSize,
    lineHeight: MISS.banner.titleSize + 4,
    color: color.white,
  },
  missSub: { ...type.caption, fontSize: MISS.banner.subSize, color: rangeColor.missInk },
  missAnswer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: MISS.answer.gap,
    padding: MISS.answer.padding,
    borderRadius: MISS.answer.radius,
    backgroundColor: color.white,
    borderBottomWidth: MISS.answer.shadowDy,
    borderBottomColor: color.parchmentEdge,
  },
  missAnswerTile: {
    width: MISS.answer.tile,
    height: MISS.answer.tile,
    borderRadius: MISS.answer.tileRadius,
    backgroundColor: color.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missAnswerTileText: { ...type.display, fontSize: 19, lineHeight: 23, color: color.inkDark },
  missAnswerText: {
    ...type.display,
    flex: 1,
    fontSize: MISS.answer.textSize,
    lineHeight: MISS.answer.textSize + 5,
    color: color.inkDark,
  },
  missNote: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: MISS.note.gap,
    padding: MISS.note.padding,
    borderRadius: MISS.note.radius,
    backgroundColor: rangeColor.parchmentSunk,
  },
  missNoteTile: {
    width: MISS.note.tile,
    height: MISS.note.tile,
    borderRadius: MISS.note.tileRadius,
    backgroundColor: color.parchment,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missNoteTileText: { ...type.display, fontSize: 22, lineHeight: 26, color: color.inkDark },
  missNoteText: { ...type.body, flex: 1, fontSize: MISS.note.textSize, color: color.inkDarkMuted },

  endWrap: { flexGrow: 1, gap: 10 },
  endHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  endTile: {
    width: ROUND_END.tile.size,
    height: ROUND_END.tile.size,
    borderRadius: ROUND_END.tile.radius,
    backgroundColor: color.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endTileGlyph: {
    ...type.display,
    fontSize: ROUND_END.tile.glyphSize,
    lineHeight: ROUND_END.tile.glyphSize + 4,
    color: color.inkDark,
  },
  endTitle: {
    ...type.display,
    fontSize: ROUND_END.titleSize,
    lineHeight: ROUND_END.titleSize + 3,
    color: color.inkDark,
  },
  endSub: { ...type.body, fontSize: ROUND_END.subSize, color: color.inkDarkMuted },
  endStats: { flexDirection: 'row', gap: 10 },
  endStat: {
    flex: 1,
    minWidth: 0,
    padding: ROUND_END.stats.padding,
    borderRadius: ROUND_END.stats.radius,
    backgroundColor: color.white,
    borderBottomWidth: ROUND_END.stats.shadowDy,
    borderBottomColor: color.parchmentEdge,
    alignItems: 'center',
  },
  endStatNumber: {
    ...type.display,
    fontSize: ROUND_END.stats.numberSize,
    lineHeight: ROUND_END.stats.numberSize + 4,
  },
  endStatLabel: {
    ...type.eyebrow,
    fontSize: ROUND_END.stats.labelSize,
    letterSpacing: ROUND_END.stats.labelSize * ROUND_END.stats.tracking,
    color: color.inkDarkMuted,
  },
  hatCard: {
    borderRadius: ROUND_END.reward.radius,
    backgroundColor: rangeColor.parchmentSunk,
    padding: ROUND_END.reward.padding,
  },
  hatText: { ...type.body, color: color.inkDarkMuted },
  rewardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROUND_END.reward.gap,
    padding: ROUND_END.reward.padding,
    borderRadius: ROUND_END.reward.radius,
    backgroundColor: color.gold,
  },
  rewardTile: {
    width: ROUND_END.reward.tile,
    height: ROUND_END.reward.tile,
    borderRadius: ROUND_END.reward.tileRadius,
    backgroundColor: color.parchment,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardSprite: { width: ROUND_END.reward.spriteW, height: ROUND_END.reward.spriteW },
  rewardKicker: { ...type.eyebrow, fontSize: ROUND_END.reward.kickerSize, color: color.inkDark },
  rewardName: {
    ...type.display,
    fontSize: ROUND_END.reward.nameSize,
    lineHeight: ROUND_END.reward.nameSize + 4,
    color: color.inkDark,
  },
  fogCard: {
    padding: ROUND_END.reward.padding,
    borderRadius: ROUND_END.reward.radius,
    backgroundColor: color.iceCard,
    gap: 2,
  },
  endNote: { ...type.caption, color: color.inkDarkMuted },

  primary: {
    minHeight: ROUND_END.again.height,
    borderRadius: ROUND_END.again.radius,
    backgroundColor: color.amber,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: ROUND_END.again.shadowDy,
    borderBottomColor: color.goldDeep,
    marginTop: space[2],
  },
  primaryText: {
    ...type.display,
    fontSize: ROUND_END.again.textSize,
    lineHeight: ROUND_END.again.textSize + 4,
    color: color.inkDark,
  },
  secondary: {
    minHeight: 64,
    borderRadius: ROUND_END.again.radius,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: ROUND_END.again.shadowDy,
    borderBottomColor: color.parchmentEdge,
  },
  secondaryText: { ...type.subtitle, color: color.inkDarkMuted },
});
