import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cannons, getIsland, getSkill, islands } from '@content/index';
import type { IslandId, SkillId } from '@content/schemas';
import { answerDrill, type DrillSession } from '@engine/drill';
import { emptyMastery, meterPercent } from '@engine/mastery';
import type { Question } from '@engine/questions/types';
import { createRng } from '@engine/rng';
import { MASTERY_METER_MAX } from '@engine/tuning';

import { QuestionPanel } from '../src/components/duel/QuestionPanel';
import { commitDrill, openDrill, rangeSkills, type RangeDrillOutcome } from '../src/services/range';
import type { DuelQuestion } from '../src/services/questions';
import { captainActions, captainStore, useCaptain } from '../src/stores/useCaptain';
import { cannonLook } from '../src/theme/cannonPresentation';
import { seaStageHeight } from '../src/theme/responsive';
import { useLayout } from '../src/theme/useLayout';
import { color, radius, space, type } from '../src/theme/tokens';

/**
 * The gunnery range.
 *
 * PLAN.md's day-2 cut line is the whole design brief: **reuse the duel question UI against a
 * stationary target buoy — a meter, not a new mode.** So `QuestionPanel` is imported from the duel
 * rather than reimplemented, the sea stage holds a buoy instead of a rival, and the one thing this
 * screen adds is the mastery meter, which is the point of coming here at all.
 *
 * Every rule lives elsewhere. `services/range.ts` decides what is drillable and what a finished
 * drill is worth; `answerDrill` (T-017) grades the answer and folds mastery at the full rate. This
 * file owns exactly what the engine cannot: WHEN a question ends, and how long the child took —
 * `elapsedMs` is measured here with a clock and handed over as data, which is what keeps the drill
 * replayable from `{seed, answers}`.
 *
 * There is no hull, no damage and no purse on this screen because there is none in the model: a
 * wrong answer at the range costs an attempt and nothing else. That is a promise made in the
 * ticket (AC-5) and it is kept by there being nothing here to lose.
 *
 * Fidelity note: the range has no transcribed board. This is built from the design system —
 * tokens, the shared question panel, the duel's sea proportions — not measured off a board, and
 * saying so is cheaper than implying otherwise.
 */

/**
 * How long the ✓/✕ on the tapped answer holds before the next question loads.
 *
 * A screen-pacing number, not a tuning constant: nothing in the engine reads it, and it changes
 * how long a child looks at the mark rather than what the mark means. Long enough to read the
 * verdict, short enough that ten questions is still one sitting.
 */
const REVEAL_MS = 900;

/** The island a captain lands on when they somehow reach the range without a current island. */
const FIRST_ISLAND: IslandId = firstIslandId();

function firstIslandId(): IslandId {
  const first = [...islands].sort((a, b) => a.order - b.order)[0];
  if (first === undefined) throw new Error('range: the island catalog is empty');
  return first.id;
}

/** What the drill is working toward — the gun this skill unlocks, for its glyph and its fuse. */
function gunForSkill(skillId: SkillId) {
  const gun = cannons.find((c) => c.unlock.kind === 'range' && c.skill === skillId) ?? cannons[0];
  if (gun === undefined) throw new Error('range: the cannon catalog is empty');
  return gun;
}

/**
 * The engine's `Question` in the shape the duel's panel renders.
 *
 * An adapter, deliberately, and not a second renderer: the panel is shared with the duel (this
 * ticket's Definition of Done), and the day `services/questions.ts` is deleted for T-007's real
 * generator this function is what disappears — not a copy of the UI.
 */
function asDuelQuestion(question: Question): DuelQuestion {
  const right = question.choices[question.correctIndex];
  if (right === undefined) throw new Error('range: question has no correct choice');
  return {
    text: question.text,
    answer: right.value,
    choices: question.choices.map((c) => c.value),
    readAloud: question.readAloud,
  };
}

interface Tap {
  readonly value: number;
  readonly index: number;
  readonly elapsedMs: number;
}

export default function RangeScreen() {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const captain = useCaptain((s) => s.captain);
  const islandId = captain.currentIsland ?? captain.unlockedIslands[0] ?? FIRST_ISLAND;

  const [session, setSession] = useState<DrillSession | null>(null);
  const [tap, setTap] = useState<Tap | null>(null);
  const [outcome, setOutcome] = useState<RangeDrillOutcome | null>(null);
  const askedAt = useRef(0);
  // Which session has already been handed to `commitDrill`. The commit itself is idempotent per
  // session, so a second call is harmless to the captain — but it returns `applied: false` with
  // zeroed counters, and letting that overwrite the summary would show a child "0 correct" after
  // a perfect drill. StrictMode's double-invoke makes that the NORMAL path in development.
  const settled = useRef<DrillSession | null>(null);

  const live = session !== null && !session.complete ? session : null;
  const question = live?.current ?? null;
  const gun = session === null ? null : gunForSkill(session.skillId);

  const advance = useCallback((choiceIndex: number | null, elapsedMs: number) => {
    setSession((s) => (s === null || s.complete ? s : answerDrill(s, choiceIndex, elapsedMs)));
    setTap(null);
  }, []);

  const begin = useCallback(
    (skillId: SkillId) => {
      setTap(null);
      setOutcome(null);
      // Read the captain imperatively rather than from the render subscription: drilling again
      // must seed from the mastery the previous drill just committed, not from the snapshot this
      // render closed over.
      setSession(
        openDrill({
          islandId,
          skillId,
          captain: captainActions().captain,
          rng: createRng(Date.now() >>> 0),
        }),
      );
    },
    [islandId],
  );

  // The fuse. It is the duel's fuse because it is the duel's panel — so it has to mean the same
  // thing here: when it burns out the question passes as a missed attempt, which at the range
  // costs an attempt and nothing else.
  useEffect(() => {
    if (live === null || question === null || tap !== null || gun === null) return;
    askedAt.current = Date.now();
    const id = setTimeout(() => advance(null, gun.timerMs), gun.timerMs);
    return () => clearTimeout(id);
  }, [live, question, tap, gun, advance]);

  // The reveal beat: the panel marks the tap, then the next question loads.
  useEffect(() => {
    if (tap === null) return;
    const id = setTimeout(() => advance(tap.index, tap.elapsedMs), REVEAL_MS);
    return () => clearTimeout(id);
  }, [tap, advance]);

  // Where the loop closes: the mastery a child just earned does not exist until it is written to
  // the captain, and the unlocks it fires are read back out of the same commit.
  useEffect(() => {
    if (session === null || !session.complete) return;
    if (settled.current === session) return;
    settled.current = session;
    setOutcome(commitDrill(captainStore, session));
  }, [session]);

  const onAnswer = (value: number) => {
    if (tap !== null || question === null) return;
    const index = question.choices.findIndex((c) => c.value === value);
    setTap({
      value,
      index: index < 0 ? question.correctIndex : index,
      elapsedMs: Date.now() - askedAt.current,
    });
  };

  const struck = tap !== null && question !== null && tap.index === question.correctIndex;
  // Drawn from the LIVE session, not from the captain: the session is seeded from the captain's
  // stored meter, so it is the same number one answer ahead — which is what makes the bar move
  // while a child is drilling rather than only after the summary.
  const meter = session === null ? 0 : meterPercent(session.mastery);

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={[s.header, { paddingHorizontal: L.gutter }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.kicker}>GUNNERY RANGE</Text>
          <Text style={s.islandName} numberOfLines={1}>
            {getIsland(islandId).displayName}
          </Text>
        </View>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Leave the range"
          style={({ pressed }) => [s.leave, pressed && s.pressed]}
        >
          <Text style={s.leaveText}>LEAVE</Text>
        </Pressable>
      </View>

      <TargetBuoy height={seaStageHeight(L)} art={L.art} struck={struck} firing={live !== null} />

      {session !== null ? (
        <View style={[s.meterWrap, { paddingHorizontal: L.gutter }]}>
          <View style={s.meterHead}>
            <Text style={s.meterLabel}>{getSkill(session.skillId).displayName.toUpperCase()}</Text>
            <Text style={s.meterValue}>
              {meter}/{MASTERY_METER_MAX}
            </Text>
          </View>
          <View style={s.meterTrack}>
            <View style={[s.meterFill, { width: `${meter}%` }]} />
          </View>
        </View>
      ) : null}

      <View style={[s.sheet, { paddingBottom: insets.bottom }]}>
        {session === null ? <SkillPicker islandId={islandId} onPick={begin} /> : null}

        {live !== null && question !== null && gun !== null ? (
          <QuestionPanel
            question={asDuelQuestion(question)}
            look={cannonLook[gun.id]}
            // The panel's label slot carries the SKILL here, not a gun: at the range the child is
            // practising multiplication, not firing the Twelve-Pounder.
            cannonName={getSkill(live.skillId).displayName}
            timerMs={gun.timerMs}
            picked={tap?.value ?? null}
            onAnswer={onAnswer}
          />
        ) : null}

        {session !== null && session.complete ? (
          <DrillSummary
            session={session}
            outcome={outcome}
            onAgain={() => begin(session.skillId)}
            onLeave={() => router.back()}
          />
        ) : null}
      </View>
    </View>
  );
}

/**
 * The buoy. A target that does not shoot back — which is the entire difference between this screen
 * and the duel, and the reason a wrong answer here cannot cost anything.
 */
function TargetBuoy({
  height,
  art,
  struck,
  firing,
}: {
  height: number;
  art: number;
  struck: boolean;
  firing: boolean;
}) {
  return (
    <View style={[s.stage, { height }]}>
      <View style={[s.buoy, { width: 74 * art, height: 74 * art, borderRadius: 999 }]}>
        <View style={[s.buoyBand, { height: 16 * art }]} />
        {struck ? (
          <View style={s.hitRing}>
            <Text style={s.hitMark}>✓</Text>
          </View>
        ) : null}
      </View>
      <View style={[s.buoyPole, { height: 26 * art }]} />
      <View style={[s.wake, { width: 108 * art }]} />
      <Text style={s.stageCaption}>{firing ? 'Fire when ready' : 'A target that does not shoot back'}</Text>
    </View>
  );
}

/** What this island's range trains — nothing more, which is AC-1 made visible. */
function SkillPicker({ islandId, onPick }: { islandId: IslandId; onPick: (skill: SkillId) => void }) {
  const captain = useCaptain((c) => c.captain);
  const skills = rangeSkills(islandId);

  return (
    <ScrollView contentContainerStyle={s.picker} showsVerticalScrollIndicator={false}>
      <Text style={s.pickerTitle}>Choose your drill</Text>
      <Text style={s.pickerBody}>
        Practice fills the meter twice as fast as a duel, and nothing here can be lost.
      </Text>
      {skills.map((skill) => {
        const filled = meterPercent(captain.mastery[skill] ?? emptyMastery);
        return (
          <Pressable
            key={skill}
            onPress={() => onPick(skill)}
            accessibilityRole="button"
            accessibilityLabel={`Drill ${getSkill(skill).displayName}, meter ${filled} of ${MASTERY_METER_MAX}`}
            style={({ pressed }) => [s.pickerRow, pressed && s.pressed]}
          >
            <View style={s.pickerGlyph}>
              <Text style={s.pickerGlyphText}>{cannonLook[gunForSkill(skill).id].glyph}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.pickerSkill} numberOfLines={1}>
                {getSkill(skill).displayName}
              </Text>
              <View style={s.pickerTrack}>
                <View style={[s.pickerFill, { width: `${filled}%` }]} />
              </View>
            </View>
            <Text style={s.pickerPercent}>{filled}%</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** What the drill was worth — read off the commit, so the screen cannot claim more than was written. */
function DrillSummary({
  session,
  outcome,
  onAgain,
  onLeave,
}: {
  session: DrillSession;
  outcome: RangeDrillOutcome | null;
  onAgain: () => void;
  onLeave: () => void;
}) {
  const unlockedCannons = outcome?.unlockedCannons ?? [];
  const unlockedIslands = outcome?.unlockedIslands ?? [];

  return (
    <ScrollView contentContainerStyle={s.summary} showsVerticalScrollIndicator={false}>
      <Text style={s.summaryTitle}>Drill complete</Text>
      <Text style={s.summaryScore}>
        {session.correct} of {session.answered} on the mark
      </Text>

      {unlockedCannons.map((id) => (
        <View key={id} style={[s.reward, { backgroundColor: color.gold }]}>
          <Text style={s.rewardKicker}>NEW CANNON</Text>
          <Text style={s.rewardText}>
            {cannonLook[id].glyph} {cannonName(id)} is yours.
          </Text>
        </View>
      ))}

      {unlockedIslands.map((id) => (
        <View key={id} style={[s.reward, { backgroundColor: color.iceCard }]}>
          <Text style={s.rewardKicker}>THE FOG LIFTS</Text>
          <Text style={s.rewardText}>{getIsland(id).displayName} is on the chart.</Text>
        </View>
      ))}

      {outcome?.mastered === true && unlockedCannons.length === 0 && unlockedIslands.length === 0 ? (
        <Text style={s.summaryNote}>This skill is mastered. Every drill from here is practice.</Text>
      ) : null}

      <Pressable
        onPress={onAgain}
        accessibilityRole="button"
        style={({ pressed }) => [s.primary, pressed && s.pressed]}
      >
        <Text style={s.primaryText}>Drill again</Text>
      </Pressable>
      <Pressable
        onPress={onLeave}
        accessibilityRole="button"
        style={({ pressed }) => [s.secondary, pressed && s.pressed]}
      >
        <Text style={s.secondaryText}>Back to the chart</Text>
      </Pressable>
    </ScrollView>
  );
}

function cannonName(id: (typeof cannons)[number]['id']): string {
  return cannons.find((c) => c.id === id)?.displayName ?? 'A new gun';
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.deepSea },
  header: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: space[3] },
  kicker: { ...type.eyebrow, color: color.amber },
  islandName: { ...type.title, color: color.parchment },
  leave: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceRaised,
  },
  leaveText: { ...type.chip, color: color.inkMuted },
  pressed: { transform: [{ translateY: 2 }], opacity: 0.9 },

  stage: { backgroundColor: color.sea, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  buoy: {
    backgroundColor: color.parchment,
    borderWidth: 4,
    borderColor: color.woodDeep,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  buoyBand: { alignSelf: 'stretch', backgroundColor: '#D93A2E' },
  buoyPole: { width: 6, backgroundColor: color.wood },
  wake: { height: 8, borderRadius: 999, backgroundColor: color.foam, opacity: 0.7, marginTop: 2 },
  hitRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.success,
  },
  hitMark: { fontSize: 34, fontWeight: '800', color: color.white },
  stageCaption: { ...type.chip, color: color.foam, position: 'absolute', bottom: space[2] },

  meterWrap: { paddingVertical: space[2], gap: 5 },
  meterHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meterLabel: { ...type.eyebrow, color: color.inkSoft, flexShrink: 1 },
  meterValue: { ...type.chip, color: color.gold },
  meterTrack: { height: 12, borderRadius: 999, backgroundColor: color.hullLost, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 999, backgroundColor: color.gold },

  sheet: {
    flex: 1,
    backgroundColor: color.parchment,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    overflow: 'hidden',
  },

  picker: { padding: space[3], gap: space[2] },
  pickerTitle: { ...type.title, color: color.inkDark },
  pickerBody: { ...type.caption, color: color.inkDarkMuted },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: 72,
    padding: space[3],
    borderRadius: radius.card,
    backgroundColor: color.white,
    borderBottomWidth: 4,
    borderBottomColor: color.parchmentEdge,
  },
  pickerGlyph: {
    width: 44,
    height: 44,
    borderRadius: radius.tileLarge,
    backgroundColor: '#F0E2C8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerGlyphText: { ...type.glyph, fontSize: 26, lineHeight: 30, color: color.inkDark },
  pickerSkill: { ...type.subtitle, color: color.inkDark },
  pickerTrack: {
    height: 8,
    marginTop: 6,
    borderRadius: 999,
    backgroundColor: color.parchmentEdge,
    overflow: 'hidden',
  },
  pickerFill: { height: '100%', borderRadius: 999, backgroundColor: color.goldDeep },
  pickerPercent: { ...type.chip, color: color.inkDarkMuted },

  summary: { padding: space[3], gap: space[2] },
  summaryTitle: { ...type.display, fontSize: 28, lineHeight: 34, color: color.inkDark },
  summaryScore: { ...type.subtitle, color: color.inkDarkMuted },
  summaryNote: { ...type.caption, color: color.inkDarkMuted },
  reward: { borderRadius: radius.cardInner, padding: space[3], gap: 2 },
  rewardKicker: { ...type.eyebrow, color: color.inkDark },
  rewardText: { ...type.subtitle, color: color.inkDark },

  primary: {
    minHeight: 56,
    borderRadius: radius.card,
    backgroundColor: color.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 4,
    borderBottomColor: color.goldDeep,
    marginTop: space[2],
  },
  primaryText: { ...type.title, color: color.inkDark },
  secondary: {
    minHeight: 52,
    borderRadius: radius.card,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 4,
    borderBottomColor: color.parchmentEdge,
  },
  secondaryText: { ...type.subtitle, color: color.inkDarkMuted },
});
