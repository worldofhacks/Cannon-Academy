/**
 * The island encounter — shown once, the first time a captain lands somewhere they earned.
 *
 * Board: `Cannon Academy Island Encounter.dc.html` (five states, A–E). A chibi host asks ONE
 * riddle whose answer is a number, and **there is no wrong outcome**: right pays +8 coins with a
 * hop, two stars and a three-coin arc; wrong pays a shrug, the true answer plainly in amber and
 * green, and the identical `Onward!`. Then it never plays again for that island.
 *
 * Self-contained behind `{ islandId, onDone }` (A-065 mounts it between banner-out and iris and
 * knows nothing else about it): the card reads the captain's band and writes the latch through
 * the module store itself. All behaviour lives in `services/encounter.ts` —
 * `encounterSkillFor` picks the band-adjusted skill (or `null`, and then the encounter asks
 * nothing and completes latch-only), `riddleFor` runs the real generator over the riddle pools,
 * and `completeEncounter` commits latch + coins in one `replaceCaptain`. This file is the
 * choreography; `encounterBoard.ts` is the measurements; the test drives the services and pins
 * this file's wiring by source.
 *
 * Phases: `entry → riddle → resolve → reward → exit`. `resolve` and `reward` are both the
 * board's state C or D — the tap's animation window (marked tiles, hop/shrug, coin arc) and the
 * settled strip it lands on at +900ms. The latch is committed AT THE TAP, so an abandoned
 * animation still counts as seen and a replayed effect cannot pay twice (the latch is the
 * idempotency — see the service).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { IslandId } from '@content/schemas';
import { createRng } from '@engine/rng';

import { completeEncounter, ENCOUNTER_COINS, encounterSkillFor, riddleFor } from '../../services/encounter';
import { captainStore, useCaptain } from '../../stores/useCaptain';
import { color, font } from '../../theme/tokens';
import { Poly } from '../Poly';
import {
  ACTION_BUTTON,
  BUBBLE,
  CARD,
  COIN_ARC,
  COPY,
  GROW,
  HOP,
  HOSTS,
  missBubbleFor,
  REWARD_MISS,
  REWARD_POP,
  REWARD_RIGHT,
  REWARD_STRIP,
  RING_BURST,
  rightBubbleFor,
  rewardTitleFor,
  SCENE,
  SCRIM,
  SHRUG,
  STAR_CHEERS,
  STAR_POINTS,
  tileLooks,
  TILE,
  TUCK,
  type EncounterState,
} from './encounterBoard';
import { HostFigure } from './hosts';

/** RN 0.86 removed `StyleSheet.absoluteFillObject` from its types; this is the same thing. */
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

type Phase = 'entry' | 'riddle' | 'resolve' | 'reward' | 'exit';

interface EncounterCardProps {
  readonly islandId: IslandId;
  readonly onDone: () => void;
}

/** Which board state a live phase draws — resolve and reward share C/D (see file header). */
function boardStateFor(phase: Phase, correct: boolean): EncounterState {
  if (phase === 'resolve' || phase === 'reward') return correct ? 'right' : 'gentleMiss';
  return phase;
}

export function EncounterCard({ islandId, onDone }: EncounterCardProps) {
  const band = useCaptain((state) => state.captain.gradeBand);
  // One seed per mount: the riddle is stable across re-renders, fresh across landings.
  const [seed] = useState(() => Date.now() >>> 0);
  const question = useMemo(() => {
    const skill = encounterSkillFor(islandId, band);
    return skill === null ? null : riddleFor(skill, createRng(seed))[0];
  }, [islandId, band, seed]);

  const [phase, setPhase] = useState<Phase>('entry');
  const [picked, setPicked] = useState<number | null>(null);

  // Entry/exit growth. `t` runs 0 → 1 on mount along the board's own keyframe (translate + scale
  // carrying the 76%/34% origin — see encounterBoard.ts), and back to 0 on the tuck.
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, {
      duration: GROW.ms,
      easing: Easing.bezier(GROW.bezier[0], GROW.bezier[1], GROW.bezier[2], GROW.bezier[3]),
    });
  }, [t]);
  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, t.value / 0.55),
    transform: [
      { translateX: GROW.from.dx * (1 - t.value) },
      { translateY: GROW.from.dy * (1 - t.value) },
      { scale: GROW.from.scale + (1 - GROW.from.scale) * t.value },
    ],
  }));

  const doneRef = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const host = HOSTS[islandId];
  const answer = question === null ? 0 : (question.choices[question.correctIndex]?.value ?? 0);
  const correct = picked !== null && question !== null && picked === question.correctIndex;
  const state = boardStateFor(phase, correct);

  const fireDone = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  const goExit = () => {
    setPhase('exit');
    t.value = withTiming(0, {
      duration: TUCK.ms,
      easing: Easing.bezier(TUCK.bezier[0], TUCK.bezier[1], TUCK.bezier[2], TUCK.bezier[3]),
    });
    timers.current.push(setTimeout(fireDone, TUCK.ms));
  };

  const onSayHello = () => {
    if (phase !== 'entry') return;
    if (question === null) {
      // Fail-closed band: nothing to ask. Latch (no payout) and tuck away — never a red box.
      completeEncounter(captainStore, islandId, false);
      goExit();
      return;
    }
    setPhase('riddle');
  };

  const onPickTile = (index: number) => {
    if (phase !== 'riddle' || picked !== null || question === null) return;
    setPicked(index);
    // Committed at the tap: the latch is the idempotency, so nothing after this can pay twice.
    completeEncounter(captainStore, islandId, index === question.correctIndex);
    setPhase('resolve');
    timers.current.push(setTimeout(() => setPhase('reward'), COIN_ARC.ms));
  };

  const onOnward = () => {
    if (phase !== 'reward') return;
    goExit();
  };

  const bubbleText =
    phase === 'entry'
      ? COPY.greeting
      : phase === 'exit'
        ? COPY.farewell
        : phase === 'riddle'
          ? (question?.text ?? COPY.greeting)
          : correct
            ? rightBubbleFor(answer)
            : missBubbleFor(answer);
  const bubbleSize = phase === 'entry' || phase === 'exit' ? BUBBLE.greetingSize : BUBBLE.riddleSize;
  const looks = question === null ? [] : tileLooks(question.choices.length, picked, question.correctIndex);
  const showTiles = (phase === 'riddle' || phase === 'resolve') && question !== null;
  const showReward = phase === 'reward';
  const reward = correct ? REWARD_RIGHT : REWARD_MISS;

  return (
    <View style={FILL}>
      <View style={s.scrim} />
      <Animated.View style={[s.card, { top: CARD.top[state] }, cardStyle]}>
        {/* The vignette scene: sky, sand, water, mounds, palms, rock — and the host. */}
        <View style={s.scene}>
          <View style={s.sand} />
          <View style={s.water} />
          <View style={[s.mound, { left: -14, bottom: 26, width: 110, height: 52 }]} />
          <View style={[s.mound, { right: -18, bottom: 30, width: 120, height: 58 }]} />
          <View style={[s.trunk, { left: 36, bottom: 64, width: 6, height: 34 }]} />
          <Poly
            points="50,100 0,34 16,14 50,44 84,14 100,34"
            width={34}
            height={16}
            fill={color.palmFrond}
            style={{ position: 'absolute', left: 22, bottom: 92 }}
          />
          <View style={[s.trunk, { right: 44, bottom: 60, width: 5, height: 26 }]} />
          <Poly
            points="50,100 0,34 16,14 50,44 84,14 100,34"
            width={30}
            height={14}
            fill={color.palmFrond}
            style={{ position: 'absolute', right: 32, bottom: 82 }}
          />
          <Poly
            points="0,100 20,24 46,58 68,8 100,100"
            width={34}
            height={18}
            fill={color.driftRock}
            style={{ position: 'absolute', left: 96, bottom: 44 }}
          />

          <View style={{ position: 'absolute', left: SCENE.host.x, bottom: SCENE.host.bottom }}>
            <HostMood mood={phase === 'resolve' ? (correct ? 'hop' : 'shrug') : 'idle'}>
              <HostFigure islandId={islandId} />
              {phase === 'resolve' && correct ? (
                <>
                  <Poly
                    points={STAR_POINTS}
                    width={STAR_CHEERS[0].size}
                    height={STAR_CHEERS[0].size}
                    fill={color.gold}
                    style={{ position: 'absolute', left: STAR_CHEERS[0].dx, bottom: STAR_CHEERS[0].bottom }}
                  />
                  <Poly
                    points={STAR_POINTS}
                    width={STAR_CHEERS[1].size}
                    height={STAR_CHEERS[1].size}
                    fill={color.gold}
                    style={{ position: 'absolute', right: STAR_CHEERS[1].dxRight, bottom: STAR_CHEERS[1].bottom }}
                  />
                </>
              ) : null}
            </HostMood>
          </View>

          {(phase === 'resolve' || phase === 'reward') && correct ? <CoinBurst /> : null}
        </View>

        {/* The speech bubble, with the 44pt speaker slot for the grown-up reading aloud. */}
        <View style={s.bubble}>
          <View style={s.bubbleTail} />
          <View style={s.bubbleRow}>
            <Text
              style={[s.bubbleText, { fontSize: bubbleSize, lineHeight: Math.ceil(bubbleSize * 1.602) }]}
              accessibilityRole="header"
              accessibilityLabel={bubbleText}
            >
              {bubbleText}
            </Text>
            <View style={s.speakerSlot} accessibilityLabel="Read aloud">
              <SpeakerGlyph />
            </View>
          </View>
        </View>

        {/* Four numbers, 2×2 — the duel's own learned tiles. No tile is pre-ringed. */}
        {showTiles ? (
          <View style={s.grid}>
            {[0, 1].map((row) => (
              <View key={row} style={s.gridRow}>
                {(question?.choices ?? []).slice(row * 2, row * 2 + 2).map((choice, column) => {
                  const index = row * 2 + column;
                  const look = looks[index];
                  return (
                    <Pressable
                      key={`${index}-${choice.value}`}
                      onPress={() => onPickTile(index)}
                      disabled={phase !== 'riddle'}
                      accessibilityRole="button"
                      accessibilityLabel={choice.label}
                      style={[
                        s.tile,
                        { backgroundColor: look?.bg ?? color.white, borderBottomColor: look?.shadow ?? color.parchmentEdge },
                      ]}
                    >
                      {look?.mark !== undefined ? <Text style={s.tileMark}>{look.mark}</Text> : null}
                      <Text style={[s.tileValue, { color: look?.ink ?? color.inkDark }]}>{choice.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        ) : null}

        {/* The strip both outcomes land on — gold `+8 coins`, or parchment `No harm done`. */}
        {showReward ? (
          <RewardStrip bg={reward.bg}>
            <View style={[s.rewardPlate, { backgroundColor: reward.plate }]}>
              {correct ? <View style={s.rewardCoin} /> : <ShrugGlyph />}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.rewardTitle}>{correct ? rewardTitleFor(ENCOUNTER_COINS) : COPY.noHarm}</Text>
              <Text style={[s.rewardSub, { color: reward.subInk }]}>
                {correct ? host.rewardSub : host.missSub}
              </Text>
            </View>
            <View style={[s.speakerSlot, { backgroundColor: reward.plate }]} accessibilityLabel="Read aloud">
              <SpeakerGlyph />
            </View>
          </RewardStrip>
        ) : null}

        {/* The one ringed button: Say hello / Onward! / Bye! — always the same next tap. */}
        {phase === 'entry' || phase === 'exit' ? (
          <ActionButton
            label={phase === 'entry' ? COPY.sayHello : COPY.bye}
            chevron
            onPress={onSayHello}
          />
        ) : null}
        {showReward ? <ActionButton label={COPY.onward} onPress={onOnward} /> : null}
      </Animated.View>
    </View>
  );
}

/** The host's answer to a tap: `ie-hop` on a win, `ie-shrug` on a miss, still while idle. */
function HostMood({ mood, children }: { mood: 'idle' | 'hop' | 'shrug'; children: ReactNode }) {
  const rise = useSharedValue(0);
  const tilt = useSharedValue(0);
  useEffect(() => {
    if (mood === 'hop') {
      rise.value = withSequence(
        withTiming(-HOP.riseY, { duration: HOP.ms * 0.3, easing: Easing.out(Easing.ease) }),
        withTiming(-3, { duration: HOP.ms * 0.3 }),
        withTiming(0, { duration: HOP.ms * 0.4 }),
      );
      tilt.value = withSequence(
        withTiming(HOP.tiltFromDeg, { duration: HOP.ms * 0.3 }),
        withTiming(HOP.tiltToDeg, { duration: HOP.ms * 0.3 }),
        withTiming(0, { duration: HOP.ms * 0.4 }),
      );
    }
    if (mood === 'shrug') {
      rise.value = withSequence(
        withTiming(-SHRUG.riseY, { duration: SHRUG.ms * 0.4, easing: Easing.out(Easing.ease) }),
        withTiming(0, { duration: SHRUG.ms * 0.6 }),
      );
      tilt.value = withSequence(
        withTiming(SHRUG.tiltFromDeg, { duration: SHRUG.ms * 0.4 }),
        withTiming(SHRUG.tiltToDeg, { duration: SHRUG.ms * 0.3 }),
        withTiming(0, { duration: SHRUG.ms * 0.3 }),
      );
    }
  }, [mood, rise, tilt]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: rise.value }, { rotate: `${tilt.value}deg` }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** Three coins out of the sand (900ms, 80ms apart) over one 620ms burst ring. */
function CoinBurst() {
  const ring = useSharedValue(0);
  useEffect(() => {
    ring.value = withTiming(1, { duration: RING_BURST.ms, easing: Easing.out(Easing.ease) });
  }, [ring]);
  const ringStyle = useAnimatedStyle(() => ({
    opacity: RING_BURST.fromOpacity * (1 - ring.value),
    transform: [{ scale: RING_BURST.fromScale + (RING_BURST.toScale - RING_BURST.fromScale) * ring.value }],
  }));

  return (
    <View style={{ position: 'absolute', left: SCENE.coinBurst.x, bottom: SCENE.coinBurst.bottom, width: 16, height: 16 }}>
      <Animated.View style={[s.burstRing, ringStyle]} />
      {COIN_ARC.arcs.map((arc, index) => (
        <ArcCoin key={index} dx={arc.dx} dy={arc.dy} fill={arc.fill} delayMs={index * COIN_ARC.staggerMs} />
      ))}
    </View>
  );
}

/** One coin of the arc: in by 25%, out by the end, riding its keyframe's own `--cx`/`--cy`. */
function ArcCoin({ dx, dy, fill, delayMs }: { dx: number; dy: number; fill: string; delayMs: number }) {
  const local = useSharedValue(0);
  useEffect(() => {
    local.value = withDelay(delayMs, withTiming(1, { duration: COIN_ARC.ms, easing: Easing.out(Easing.ease) }));
  }, [local, delayMs]);
  const style = useAnimatedStyle(() => ({
    opacity: local.value < 0.25 ? local.value / 0.25 : 1 - (local.value - 0.25) / 0.75,
    transform: [
      { translateX: dx * local.value },
      { translateY: dy * local.value },
      { scale: 0.5 + 0.5 * local.value },
    ],
  }));
  return <Animated.View style={[s.coin, { backgroundColor: fill }, style]} />;
}

/** The reward strip's 220ms pop — scale .72 → 1.04 at 60% → 1, both outcomes alike. */
function RewardStrip({ bg, children }: { bg: string; children: ReactNode }) {
  const pop = useSharedValue<number>(REWARD_POP.fromScale);
  useEffect(() => {
    pop.value = withSequence(
      withTiming(REWARD_POP.overshootScale, { duration: REWARD_POP.ms * 0.6, easing: Easing.out(Easing.ease) }),
      withTiming(1, { duration: REWARD_POP.ms * 0.4 }),
    );
  }, [pop]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, (pop.value - REWARD_POP.fromScale) / (1 - REWARD_POP.fromScale) + 0.2),
    transform: [{ scale: pop.value }],
  }));
  return <Animated.View style={[s.rewardStrip, { backgroundColor: bg }, style]}>{children}</Animated.View>;
}

/** The big amber button with the single gold ring — the only ringed thing on screen. */
function ActionButton({ label, chevron = false, onPress }: { label: string; chevron?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={s.action}>
      <Text style={s.actionLabel}>{label}</Text>
      {chevron ? (
        <View style={s.actionChevron}>
          <Text style={s.actionChevronGlyph}>›</Text>
        </View>
      ) : null}
      <View style={s.actionRing} pointerEvents="none" />
    </Pressable>
  );
}

/** The board's little speaker, four ink-muted shapes in a 22×16 box. */
function SpeakerGlyph() {
  return (
    <View style={{ width: 22, height: 16 }}>
      <View style={[s.spk, { left: 0, top: 3, width: 8, height: 10 }]} />
      <Poly
        points="0,22 100,0 100,100 0,78"
        width={8}
        height={16}
        fill={color.inkDarkMuted}
        style={{ position: 'absolute', left: 6, top: 0 }}
      />
      <View style={[s.spk, { right: 1, top: 2, width: 5, height: 5, borderTopLeftRadius: 999, borderTopRightRadius: 999, transform: [{ rotate: '24deg' }] }]} />
      <View style={[s.spk, { right: 0, top: 9, width: 6, height: 6, borderTopRightRadius: 999, borderBottomRightRadius: 999 }]} />
    </View>
  );
}

/** The shrug — head, shoulders, two hands, all ink-muted, per the board's reward plate. */
function ShrugGlyph() {
  return (
    <View style={{ width: 26, height: 26 }}>
      <View style={[s.spk, { left: 9, top: 0, width: 8, height: 8, borderRadius: 999 }]} />
      <View style={[s.spk, { left: 4, top: 11, width: 18, height: 7, borderRadius: 999 }]} />
      <View style={[s.spk, { left: 0, top: 9, width: 6, height: 6, borderRadius: 999 }]} />
      <View style={[s.spk, { right: 0, top: 9, width: 6, height: 6, borderRadius: 999 }]} />
    </View>
  );
}

const s = StyleSheet.create({
  scrim: {
    ...FILL,
    backgroundColor: color.inkDark,
    opacity: SCRIM.opacity,
  },
  card: {
    position: 'absolute',
    left: CARD.marginX,
    right: CARD.marginX,
    borderRadius: CARD.radius,
    backgroundColor: color.parchment,
    padding: CARD.padding,
    borderBottomWidth: CARD.shadowDy,
    borderBottomColor: color.parchmentShadow,
  },

  scene: {
    height: SCENE.height,
    borderRadius: SCENE.radius,
    backgroundColor: color.hostSky,
    overflow: 'hidden',
  },
  sand: { position: 'absolute', left: 0, right: 0, bottom: 0, height: SCENE.sandHeight, backgroundColor: color.sand },
  water: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: SCENE.water.bottom,
    height: SCENE.water.height,
    backgroundColor: color.seaFoam,
    opacity: SCENE.water.opacity,
  },
  mound: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: color.islandGrass,
    borderBottomWidth: 6,
    borderBottomColor: color.islandGrassDeep,
  },
  trunk: { position: 'absolute', borderRadius: 3, backgroundColor: color.wood },

  bubble: {
    marginTop: 14,
    borderRadius: BUBBLE.radius,
    backgroundColor: color.white,
    paddingHorizontal: BUBBLE.padX,
    paddingVertical: BUBBLE.padY,
    borderBottomWidth: BUBBLE.shadowDy,
    borderBottomColor: color.parchmentEdge,
  },
  bubbleTail: {
    position: 'absolute',
    left: BUBBLE.tail.x,
    top: -6,
    width: 12,
    height: 12,
    backgroundColor: color.white,
    transform: [{ rotate: '45deg' }],
  },
  bubbleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bubbleText: { flex: 1, minWidth: 0, fontFamily: font.displayBold, color: color.inkDark },
  speakerSlot: {
    width: BUBBLE.speakerSlot.size,
    height: BUBBLE.speakerSlot.size,
    borderRadius: BUBBLE.speakerSlot.radius,
    backgroundColor: color.parchmentSunk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spk: { position: 'absolute', backgroundColor: color.inkDarkMuted },

  grid: { marginTop: TILE.gap, gap: TILE.gap },
  gridRow: { flexDirection: 'row', gap: TILE.gap },
  tile: {
    flex: 1,
    height: TILE.height,
    borderRadius: TILE.radius,
    borderBottomWidth: TILE.shadowDy,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tileMark: { fontFamily: font.displayBold, fontSize: TILE.markSize, lineHeight: 42, color: color.inkDark },
  tileValue: { fontFamily: font.displayBold, fontSize: TILE.numeralSize, lineHeight: 55 },

  rewardStrip: {
    marginTop: 12,
    padding: REWARD_STRIP.padding,
    borderRadius: REWARD_STRIP.radius,
    flexDirection: 'row',
    alignItems: 'center',
    gap: REWARD_STRIP.gap,
  },
  rewardPlate: {
    width: REWARD_STRIP.plate,
    height: REWARD_STRIP.plate,
    borderRadius: REWARD_STRIP.plateRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardCoin: {
    width: REWARD_STRIP.coinSize,
    height: REWARD_STRIP.coinSize,
    borderRadius: 999,
    backgroundColor: color.amber,
    borderBottomWidth: 5,
    borderBottomColor: color.goldDeep,
  },
  rewardTitle: { fontFamily: font.displayBold, fontSize: REWARD_STRIP.titleSize, lineHeight: 33, color: color.inkDark },
  rewardSub: { fontFamily: font.bodySemi, fontSize: REWARD_STRIP.subSize, lineHeight: 21, marginTop: 2 },

  action: {
    marginTop: 12,
    height: ACTION_BUTTON.height,
    borderRadius: ACTION_BUTTON.radius,
    backgroundColor: color.amber,
    borderBottomWidth: ACTION_BUTTON.shadowDy,
    borderBottomColor: color.goldDeep,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  actionLabel: { fontFamily: font.displayBold, fontSize: ACTION_BUTTON.labelSize, lineHeight: 33, color: color.inkDark },
  actionChevron: {
    width: ACTION_BUTTON.chevron.size,
    height: ACTION_BUTTON.chevron.size,
    borderRadius: 999,
    backgroundColor: color.parchment,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionChevronGlyph: { fontFamily: font.bodyBold, fontSize: ACTION_BUTTON.chevron.glyphSize, color: color.goldDeep },
  actionRing: {
    position: 'absolute',
    left: -ACTION_BUTTON.ring.inset,
    right: -ACTION_BUTTON.ring.inset,
    top: -ACTION_BUTTON.ring.inset,
    bottom: -ACTION_BUTTON.ring.inset,
    borderRadius: ACTION_BUTTON.ring.radius,
    borderWidth: ACTION_BUTTON.ring.width,
    borderColor: color.gold,
  },

  burstRing: {
    position: 'absolute',
    left: -30,
    top: -30,
    width: RING_BURST.size,
    height: RING_BURST.size,
    borderRadius: 999,
    backgroundColor: color.gold,
  },
  coin: {
    position: 'absolute',
    width: COIN_ARC.coinSize,
    height: COIN_ARC.coinSize,
    borderRadius: 999,
    borderBottomWidth: 4,
    borderBottomColor: color.goldDeep,
  },
});
