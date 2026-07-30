/**
 * The question, the fuse, and four answers.
 *
 * The fuse is the mechanic made visible. Its gold section is exactly `PERFECT_SHOT_TIMER_FRACTION`
 * of the bar, imported rather than hardcoded, so if that constant moves on the dev slider the bar
 * moves with it — a timing cue that disagrees with the rule it is cueing is worse than no cue.
 *
 * Two labels sit under it and they are not decoration: `TAKE YOUR TIME` is the promise that a slow
 * answer still fires, `FAST = PERFECT SHOT ★` is the reward for speed. Both are true at once, and
 * a child who only reads the second one is not being misled.
 */
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { PERFECT_SHOT_TIMER_FRACTION } from '@engine/tuning';

import type { CannonLook } from '../../theme/cannonPresentation';
import { questionTypographyFor } from '../../theme/questionTypography';
import { color, radius, space, type } from '../../theme/tokens';
import type { DuelQuestion } from '../../services/questions';

/** RN 0.86 removed `StyleSheet.absoluteFillObject` from its types; this is the same thing. */
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

interface QuestionPanelProps {
  readonly question: DuelQuestion;
  readonly look: CannonLook;
  readonly cannonName: string;
  readonly timerMs: number;
  readonly picked: number | null;
  readonly onAnswer: (value: number) => void;
}

export function QuestionPanel({ question, look, cannonName, timerMs, picked, onAnswer }: QuestionPanelProps) {
  const questionTypography = questionTypographyFor(question.text);
  const burn = useSharedValue(0);
  useEffect(() => {
    burn.value = 0;
    burn.value = withTiming(1, { duration: timerMs, easing: Easing.linear });
  }, [burn, timerMs, question.text]);

  const burnStyle = useAnimatedStyle(() => ({ width: `${burn.value * 100}%` }));

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <View style={s.glyphTile}>
          <Text style={s.glyph}>{look.glyph}</Text>
        </View>
        <Text style={s.cannonName}>{cannonName}</Text>
        <View style={{ flex: 1 }} />
        <FastChip goldMs={timerMs * PERFECT_SHOT_TIMER_FRACTION} />
      </View>

      <View style={s.questionRow}>
        <Text
          style={[s.question, questionTypography.style]}
          accessibilityRole="header"
          accessibilityLabel={question.text}
          numberOfLines={questionTypography.numberOfLines}
          adjustsFontSizeToFit={questionTypography.adjustsFontSizeToFit}
          minimumFontScale={questionTypography.minimumFontScale}
        >
          {question.text}
        </Text>
      </View>

      {/* The fuse. Gold on the right burns first, so "gold left" and "still perfect" are the
          same fact rendered once. */}
      <View style={s.fuseTrack}>
        <View style={[s.fuseSpent, { flex: 1 - PERFECT_SHOT_TIMER_FRACTION }]} />
        <View style={[s.fuseGold, { flex: PERFECT_SHOT_TIMER_FRACTION }]} />
        <Animated.View style={[s.fuseBurn, burnStyle]}>
          <View style={s.ember} />
        </Animated.View>
      </View>
      <View style={s.fuseLabels}>
        <Text style={s.takeYourTime}>TAKE YOUR TIME</Text>
        <Text style={s.fastIsPerfect}>FAST = PERFECT SHOT ★</Text>
      </View>

      {/* Explicit rows, not a wrapping flex list. A wrapped list sizes each cell to its content
          and leaves the rest of the sheet empty; two rows of `flex: 1` fill it, which is what
          makes every answer a big target instead of a small one near the top. */}
      <View style={s.grid}>
        {[question.choices.slice(0, 2), question.choices.slice(2, 4)].map((row, rowIndex) => (
          <View key={rowIndex} style={s.gridRow}>
            {row.map((value) => (
              <Choice
                key={value}
                value={value}
                isRight={picked !== null && value === question.answer}
                isWrong={picked === value && value !== question.answer}
                disabled={picked !== null}
                onPress={() => onAnswer(value)}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * The FAST chip. It pulses while the perfect window is open and dims when it closes — so the
 * window has an end a child can see, not just a bar that keeps shrinking.
 */
function FastChip({ goldMs }: { goldMs: number }) {
  const pulse = useSharedValue(0);
  const alive = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 300 }), withTiming(0, { duration: 300 })),
      -1,
    );
    alive.value = withTiming(0.28, { duration: 1, easing: Easing.linear });
    alive.value = withSequence(withTiming(1, { duration: goldMs }), withTiming(0.28, { duration: 180 }));
  }, [pulse, alive, goldMs]);

  const animated = useAnimatedStyle(() => ({
    opacity: alive.value,
    transform: [{ scale: 1 + 0.14 * pulse.value * alive.value }],
  }));

  return (
    <Animated.View style={[s.fastChip, animated]}>
      <Text style={s.fastStar}>★</Text>
      <Text style={s.fastText}>FAST</Text>
    </Animated.View>
  );
}

function Choice({
  value,
  isRight,
  isWrong,
  disabled,
  onPress,
}: {
  value: number;
  isRight: boolean;
  isWrong: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const shake = useSharedValue(0);
  useEffect(() => {
    if (!isWrong) return;
    shake.value = withSequence(
      withTiming(-7, { duration: 64 }),
      withTiming(6, { duration: 64 }),
      withTiming(-4, { duration: 64 }),
      withTiming(3, { duration: 64 }),
      withTiming(0, { duration: 64 }),
    );
  }, [isWrong, shake]);
  const animated = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  return (
    <Animated.View style={[s.choiceCell, animated]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={String(value)}
        style={({ pressed }) => [s.choice, pressed && s.choicePressed]}
      >
        <Text style={s.choiceText}>{value}</Text>
        {isRight ? (
          <View style={[s.verdict, { backgroundColor: color.success }]}>
            <Text style={s.verdictMark}>✓</Text>
            <Text style={s.verdictValue}>{value}</Text>
          </View>
        ) : null}
        {isWrong ? (
          <View style={[s.verdict, { backgroundColor: '#D93A2E' }]}>
            <Text style={s.verdictMark}>✕</Text>
            <Text style={s.verdictValue}>{value}</Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: space[3], paddingTop: 10, paddingBottom: space[3] },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  glyphTile: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#F0E2C8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { ...type.subtitle, color: color.inkDark },
  cannonName: { ...type.body, fontFamily: type.subtitle.fontFamily, color: color.inkDarkMuted },

  fastChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    backgroundColor: '#FFF9D6',
  },
  fastStar: { color: color.amber, fontSize: 13 },
  fastText: { ...type.chip, fontSize: 11, color: color.inkDark },

  questionRow: { minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  question: { ...type.display, color: color.inkDark, textAlign: 'center' },

  fuseTrack: {
    height: 18,
    borderRadius: 9,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: '#C9AE7E',
  },
  fuseSpent: { backgroundColor: '#C9AE7E' },
  fuseGold: { backgroundColor: color.gold },
  fuseBurn: { position: 'absolute', top: 0, right: 0, bottom: 0, backgroundColor: color.inkDarkMuted },
  ember: {
    position: 'absolute',
    left: -7,
    top: -1,
    bottom: -1,
    width: 12,
    borderRadius: 6,
    backgroundColor: color.flame,
  },
  fuseLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4, paddingHorizontal: 2 },
  takeYourTime: { ...type.chip, color: color.inkDarkMuted },
  fastIsPerfect: { ...type.chip, color: color.goldDeepest },

  grid: { flex: 1, marginTop: space[2], gap: 10 },
  gridRow: { flex: 1, flexDirection: 'row', gap: 10 },
  choiceCell: { flex: 1, minHeight: 64 },
  choice: {
    flex: 1,
    borderRadius: radius.card,
    backgroundColor: color.white,
    borderBottomWidth: 4,
    borderBottomColor: color.parchmentEdge,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  choicePressed: { transform: [{ translateY: 3 }], borderBottomWidth: 1 },
  choiceText: { ...type.display, fontSize: 40, lineHeight: 46, color: color.inkDark },
  verdict: {
    ...FILL,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
  },
  verdictMark: { fontSize: 30, fontWeight: '800', color: color.white },
  verdictValue: { ...type.display, fontSize: 34, lineHeight: 40, color: color.white },
});
