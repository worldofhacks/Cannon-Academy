/**
 * The frontier encounter card — Lumen asks the tally riddle (A-086, amended D-17).
 *
 * Board: `Cannon Academy Uncharted Host.dc.html`, the 402×874 encounter mock — the A-066 card
 * layout re-drawn for the one station with no land: deep-water vignette (dark seabed, drifting
 * gold motes, her lamp the only warm light), the FITTED speech bubble with the 44pt read-aloud
 * slot, the duel's own 2×2 answer tiles at 34px numerals, the coins-only reward strip, and the
 * amber-never-red shrug card. Chrome is copied INTO this scope from the A-066 posture — the
 * sealed authored card (the Tier A encounter component folder) is never imported, never edited.
 *
 * The flow (ticket law): Lumen GREETS on the first frontier visit ever (`uncharted.metLumen`,
 * latched at the Say-hello tap through A-079's action), then ASKS directly on every later
 * island's arriving→ready transition. Her riddle is the tally riddle — `tallyRiddleFor(doc,
 * clearedCount, band)`, a pure function of real state, so a re-render re-derives the same
 * question and a returning child gets a genuinely new one. A correct pick pays +8 coins ONCE
 * per island (`completeLumenRiddle` — receipt-idempotent, committed AT THE TAP so a double-tap
 * or an abandoned animation can never pay twice); a miss pays nothing, loses nothing, and the
 * very same island still pays if answered right on a return visit. Either way the card ends on
 * `onDone` and the screen is at ready — SET SAIL live.
 *
 * Self-contained behind `{ doc, onDone }` (the A-066 `{ islandId, onDone }` contract with the
 * gen document standing where the authored id stands): reads band and tally through the module
 * store, commits through the service, and never touches a route.
 *
 * Worklet discipline (A-018): every `useAnimatedStyle` body reads shared values and hoisted
 * module constants only.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { GenIslandDoc } from '@content/genIsland';

import {
  completeLumenRiddle,
  greetLumen,
  LUMEN,
  LUMEN_ACTION,
  LUMEN_ANIM,
  LUMEN_BUBBLE,
  LUMEN_CARD,
  LUMEN_COINS,
  LUMEN_COPY,
  LUMEN_RESOLVE_MS,
  LUMEN_REWARD,
  LUMEN_REWARD_MISS,
  LUMEN_REWARD_RIGHT,
  LUMEN_SCRIM,
  LUMEN_TILE,
  LUMEN_VIGNETTE,
  lumenCheerLine,
  lumenCloseLine,
  lumenRewardTitle,
  lumenStageFor,
  lumenTileLooks,
  tallyRiddleFor,
  type LumenPose,
} from '../../services/uncharted/encounter';
import { captainStore, useCaptain } from '../../stores/useCaptain';
import { color, font } from '../../theme/tokens';
import { Poly } from '../Poly';
import { LumenFigure } from './LumenFigure';
import { deepSea } from './unchartedBoard';

/** RN 0.86 removed `StyleSheet.absoluteFillObject` from its types; this is the same thing. */
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

// ── Hoisted for the worklets (A-018: a `useAnimatedStyle` body reads no JS closures) ──────────
const MOTE_RISE = LUMEN_ANIM.mote.riseY;
const MOTE_OPACITY_FROM = LUMEN_ANIM.mote.opacityFrom;
const MOTE_OPACITY_SPAN = LUMEN_ANIM.mote.opacityTo - LUMEN_ANIM.mote.opacityFrom;
const POP_FROM = LUMEN_ANIM.pop.fromScale;

type Phase = 'greeting' | 'riddle' | 'resolve' | 'reward' | 'farewell';

interface UnchartedEncounterProps {
  readonly doc: GenIslandDoc;
  readonly onDone: () => void;
}

/** Which of the board's five poses each phase draws (the POSES table's own mapping). */
function poseFor(phase: Phase, correct: boolean): LumenPose {
  if (phase === 'greeting') return 'greeting';
  if (phase === 'riddle') return 'asking';
  if (phase === 'farewell') return 'farewell';
  return correct ? 'celebrating' : 'shrugging';
}

export function UnchartedEncounter({ doc, onDone }: UnchartedEncounterProps) {
  const band = useCaptain((state) => state.captain.gradeBand);
  const clearedCount = useCaptain((state) => state.captain.uncharted?.clearedCount ?? 0);

  // Greeting is decided ONCE, at mount: latching mid-card must not snap the open card forward.
  const [phase, setPhase] = useState<Phase>(() =>
    lumenStageFor(captainStore.getState().captain) === 'greeting' ? 'greeting' : 'riddle',
  );
  const [picked, setPicked] = useState<number | null>(null);

  // Pure derivation from durable state — same doc, same tally, same band, same riddle, so a
  // re-render mid-answer cannot shuffle the tiles. Band-null is fail-closed: ask nothing.
  const riddle = useMemo(
    () => (band === null ? null : tallyRiddleFor(doc, clearedCount, band)),
    [doc, clearedCount, band],
  );

  const doneRef = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const correct = picked !== null && riddle !== null && picked === riddle.correctIndex;
  const pose = poseFor(phase, correct);

  const fireDone = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  const onSayHello = () => {
    if (phase !== 'greeting') return;
    // The meeting is the tap: A-079's latch, idempotent, never written back to false.
    greetLumen(captainStore);
    if (riddle === null) {
      // No band on the captain — nothing in-band to ask. Close without asking or paying.
      fireDone();
      return;
    }
    setPhase('riddle');
  };

  const onPickTile = (index: number) => {
    if (phase !== 'riddle' || picked !== null || riddle === null) return;
    setPicked(index);
    // Committed AT THE TAP — the receipt is the idempotency, so nothing after this (double-tap,
    // re-mount, relaunch) can pay twice, and a wrong pick commits nothing at all.
    completeLumenRiddle(captainStore, doc, index === riddle.correctIndex);
    setPhase('resolve');
    timers.current.push(setTimeout(() => setPhase('reward'), LUMEN_RESOLVE_MS));
  };

  const onOnward = () => {
    if (phase !== 'reward') return;
    setPhase('farewell');
  };

  const onBye = () => {
    if (phase !== 'farewell') return;
    fireDone();
  };

  const bubbleText =
    phase === 'greeting'
      ? LUMEN_COPY.greeting
      : phase === 'farewell'
        ? LUMEN_COPY.farewell
        : phase === 'riddle'
          ? (riddle?.text ?? LUMEN_COPY.greeting)
          : correct
            ? lumenCheerLine(riddle?.answer ?? 0)
            : lumenCloseLine(riddle?.answer ?? 0);
  const looks = riddle === null ? [] : lumenTileLooks(riddle.choices.length, picked, riddle.correctIndex);
  const showTiles = (phase === 'riddle' || phase === 'resolve') && riddle !== null;
  const showReward = phase === 'reward';
  const reward = correct ? LUMEN_REWARD_RIGHT : LUMEN_REWARD_MISS;

  return (
    <View style={FILL}>
      <View style={s.scrim} />
      <View style={s.card}>
        {/* The deep vignette — her tank has no land: seabed, sediment band, rocks, kelp, motes. */}
        <View style={s.scene}>
          <View style={s.seabed} />
          <View style={s.sedimentBand} />
          {LUMEN_VIGNETTE.motes.map((mote, index) => (
            <Mote key={`mote-${index}`} left={mote.left} top={mote.top} size={mote.size} index={index} />
          ))}
          <Poly
            points={LUMEN_VIGNETTE.rocks[0].points}
            width={LUMEN_VIGNETTE.rocks[0].w}
            height={LUMEN_VIGNETTE.rocks[0].h}
            fill={deepSea.deep4}
            style={{ position: 'absolute', left: LUMEN_VIGNETTE.rocks[0].left, bottom: LUMEN_VIGNETTE.rocks[0].bottom }}
          />
          <Poly
            points={LUMEN_VIGNETTE.rocks[1].points}
            width={LUMEN_VIGNETTE.rocks[1].w}
            height={LUMEN_VIGNETTE.rocks[1].h}
            fill={deepSea.deep4}
            style={{ position: 'absolute', right: LUMEN_VIGNETTE.rocks[1].right, bottom: LUMEN_VIGNETTE.rocks[1].bottom }}
          />
          <View style={[s.kelp, { left: LUMEN_VIGNETTE.kelp[0].left, width: LUMEN_VIGNETTE.kelp[0].w, height: LUMEN_VIGNETTE.kelp[0].h, borderBottomLeftRadius: Math.round(LUMEN_VIGNETTE.kelp[0].w * 0.4), borderBottomRightRadius: Math.round(LUMEN_VIGNETTE.kelp[0].w * 0.4) }]} />
          <View style={[s.kelp, { right: LUMEN_VIGNETTE.kelp[1].right, width: LUMEN_VIGNETTE.kelp[1].w, height: LUMEN_VIGNETTE.kelp[1].h, borderBottomLeftRadius: Math.round(LUMEN_VIGNETTE.kelp[1].w * 0.4), borderBottomRightRadius: Math.round(LUMEN_VIGNETTE.kelp[1].w * 0.4) }]} />

          <View style={{ position: 'absolute', left: LUMEN_VIGNETTE.figure.left, bottom: LUMEN_VIGNETTE.figure.bottom }}>
            <LumenFigure pose={pose} />
          </View>
        </View>

        {/* The FITTED bubble, with the 44pt speaker slot for the adult reading aloud. */}
        <View style={s.bubble}>
          <View style={s.bubbleTail} />
          <View style={s.bubbleRow}>
            <Text
              style={s.bubbleText}
              numberOfLines={LUMEN_BUBBLE.maxLines}
              adjustsFontSizeToFit
              minimumFontScale={LUMEN_BUBBLE.minFontScale}
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
                {(riddle?.choices ?? []).slice(row * 2, row * 2 + 2).map((choice, column) => {
                  const index = row * 2 + column;
                  const look = looks[index];
                  return (
                    <Pressable
                      key={`${index}-${choice}`}
                      onPress={() => onPickTile(index)}
                      disabled={phase !== 'riddle'}
                      accessibilityRole="button"
                      accessibilityLabel={String(choice)}
                      style={[
                        s.tile,
                        { backgroundColor: look?.bg ?? color.white, borderBottomColor: look?.shadow ?? color.parchmentEdge },
                      ]}
                    >
                      {look?.mark !== undefined ? <Text style={s.tileMark}>{look.mark}</Text> : null}
                      <Text style={[s.tileValue, { color: look?.ink ?? color.inkDark }]}>{choice}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        ) : null}

        {/* The strip both outcomes land on — gold `+8 coins`, or sunken-parchment `No harm done`. */}
        {showReward ? (
          <RewardStrip bg={reward.bg}>
            <View style={[s.rewardPlate, { backgroundColor: reward.plate }]}>
              {correct ? <View style={s.rewardCoin} /> : <ShrugGlyph />}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.rewardTitle}>{correct ? lumenRewardTitle(LUMEN_COINS) : LUMEN_COPY.noHarm}</Text>
              <Text style={[s.rewardSub, { color: reward.subInk }]}>
                {correct ? LUMEN.rewardSub : LUMEN.missSub}
              </Text>
            </View>
          </RewardStrip>
        ) : null}

        {/* The one ringed button: Say hello / Onward! / Bye! — always the same next tap. */}
        {phase === 'greeting' ? (
          <ActionButton label={LUMEN_COPY.sayHello} chevron onPress={onSayHello} />
        ) : null}
        {showReward ? <ActionButton label={LUMEN_COPY.onward} onPress={onOnward} /> : null}
        {phase === 'farewell' ? <ActionButton label={LUMEN_COPY.bye} chevron onPress={onBye} /> : null}
      </View>
    </View>
  );
}

/** One drifting gold mote — `uh-mote`: up 8pt, opacity .35 → .8, the board's own timing table. */
function Mote({ left, top, size, index }: { left: number; top: number; size: number; index: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    const { durBaseMs, durStepMs, durMod, delayStepMs } = LUMEN_VIGNETTE.moteTiming;
    const duration = (durBaseMs + (index % durMod) * durStepMs) / 2;
    t.value = withDelay(
      index * delayStepMs,
      withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.quad) }), -1, true),
    );
  }, [t, index]);
  const style = useAnimatedStyle(() => ({
    opacity: MOTE_OPACITY_FROM + MOTE_OPACITY_SPAN * t.value,
    transform: [{ translateY: -MOTE_RISE * t.value }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left, top, width: size, height: size, borderRadius: 999, backgroundColor: color.gold }, style]}
    />
  );
}

/** The reward strip's 220ms `uh-pop` — scale .72 → 1.04 at 60% → 1, both outcomes alike. */
function RewardStrip({ bg, children }: { bg: string; children: ReactNode }) {
  const pop = useSharedValue<number>(LUMEN_ANIM.pop.fromScale);
  useEffect(() => {
    pop.value = withSequence(
      withTiming(LUMEN_ANIM.pop.overshootScale, { duration: LUMEN_ANIM.pop.ms * 0.6, easing: Easing.out(Easing.ease) }),
      withTiming(1, { duration: LUMEN_ANIM.pop.ms * 0.4 }),
    );
  }, [pop]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, (pop.value - POP_FROM) / (1 - POP_FROM) + 0.2),
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
    opacity: LUMEN_SCRIM.opacity,
  },
  card: {
    position: 'absolute',
    top: LUMEN_CARD.top,
    left: LUMEN_CARD.marginX,
    right: LUMEN_CARD.marginX,
    borderRadius: LUMEN_CARD.radius,
    backgroundColor: color.parchment,
    padding: LUMEN_CARD.padding,
    borderBottomWidth: LUMEN_CARD.shadowDy,
    borderBottomColor: color.parchmentShadow,
  },

  scene: {
    height: LUMEN_VIGNETTE.height,
    borderRadius: LUMEN_VIGNETTE.radius,
    backgroundColor: deepSea.deep3,
    overflow: 'hidden',
  },
  seabed: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: LUMEN_VIGNETTE.seabedHeight,
    backgroundColor: deepSea.deep4,
  },
  sedimentBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: LUMEN_VIGNETTE.band.bottom,
    height: LUMEN_VIGNETTE.band.h,
    backgroundColor: deepSea.deepPanel,
  },
  kelp: {
    position: 'absolute',
    bottom: LUMEN_VIGNETTE.kelp[0].bottom,
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    backgroundColor: deepSea.deepPanel,
  },

  bubble: {
    marginTop: 14,
    borderRadius: LUMEN_BUBBLE.radius,
    backgroundColor: color.white,
    paddingHorizontal: LUMEN_BUBBLE.padX,
    paddingVertical: LUMEN_BUBBLE.padY,
    borderBottomWidth: LUMEN_BUBBLE.shadowDy,
    borderBottomColor: color.parchmentEdge,
  },
  bubbleTail: {
    position: 'absolute',
    left: LUMEN_BUBBLE.tail.x,
    top: -6,
    width: 12,
    height: 12,
    backgroundColor: color.white,
    transform: [{ rotate: '45deg' }],
  },
  bubbleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bubbleText: {
    flex: 1,
    minWidth: 0,
    fontFamily: font.displayBold,
    fontSize: LUMEN_BUBBLE.riddleSize,
    lineHeight: Math.ceil(LUMEN_BUBBLE.riddleSize * 1.602),
    color: color.inkDark,
  },
  speakerSlot: {
    width: LUMEN_BUBBLE.speakerSlot.size,
    height: LUMEN_BUBBLE.speakerSlot.size,
    borderRadius: LUMEN_BUBBLE.speakerSlot.radius,
    backgroundColor: color.parchmentSunk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spk: { position: 'absolute', backgroundColor: color.inkDarkMuted },

  grid: { marginTop: LUMEN_TILE.gap, gap: LUMEN_TILE.gap },
  gridRow: { flexDirection: 'row', gap: LUMEN_TILE.gap },
  tile: {
    flex: 1,
    height: LUMEN_TILE.height,
    borderRadius: LUMEN_TILE.radius,
    borderBottomWidth: LUMEN_TILE.shadowDy,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tileMark: { fontFamily: font.displayBold, fontSize: LUMEN_TILE.markSize, lineHeight: 42, color: color.inkDark },
  tileValue: { fontFamily: font.displayBold, fontSize: LUMEN_TILE.numeralSize, lineHeight: 55 },

  rewardStrip: {
    marginTop: 12,
    padding: LUMEN_REWARD.padding,
    borderRadius: LUMEN_REWARD.radius,
    flexDirection: 'row',
    alignItems: 'center',
    gap: LUMEN_REWARD.gap,
  },
  rewardPlate: {
    width: LUMEN_REWARD.plate,
    height: LUMEN_REWARD.plate,
    borderRadius: LUMEN_REWARD.plateRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardCoin: {
    width: LUMEN_REWARD.coinSize,
    height: LUMEN_REWARD.coinSize,
    borderRadius: 999,
    backgroundColor: color.amber,
    borderBottomWidth: LUMEN_REWARD.coinInset,
    borderBottomColor: color.goldDeep,
  },
  rewardTitle: { fontFamily: font.displayBold, fontSize: LUMEN_REWARD.titleSize, lineHeight: 33, color: color.inkDark },
  rewardSub: { fontFamily: font.bodySemi, fontSize: LUMEN_REWARD.subSize, lineHeight: 21, marginTop: 2 },

  action: {
    marginTop: 12,
    height: LUMEN_ACTION.height,
    borderRadius: LUMEN_ACTION.radius,
    backgroundColor: color.amber,
    borderBottomWidth: LUMEN_ACTION.shadowDy,
    borderBottomColor: color.goldDeep,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  actionLabel: { fontFamily: font.displayBold, fontSize: LUMEN_ACTION.labelSize, lineHeight: 33, color: color.inkDark },
  actionChevron: {
    width: LUMEN_ACTION.chevron.size,
    height: LUMEN_ACTION.chevron.size,
    borderRadius: 999,
    backgroundColor: color.parchment,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionChevronGlyph: { fontFamily: font.bodyBold, fontSize: LUMEN_ACTION.chevron.glyphSize, color: color.goldDeep },
  actionRing: {
    position: 'absolute',
    left: -LUMEN_ACTION.ring.inset,
    right: -LUMEN_ACTION.ring.inset,
    top: -LUMEN_ACTION.ring.inset,
    bottom: -LUMEN_ACTION.ring.inset,
    borderRadius: LUMEN_ACTION.ring.radius,
    borderWidth: LUMEN_ACTION.ring.width,
    borderColor: color.gold,
  },
});
