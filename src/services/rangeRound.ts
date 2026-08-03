/**
 * One round at the gunnery range — the state machine the board's nine states collapse onto.
 *
 * `app/range.tsx` renders this and owns nothing but the clock. Everything that decides WHAT the
 * screen is showing is here, for the reason the rest of this layer gives: vitest runs in node and
 * React Native's entry point is Flow-typed, so a state machine inside a component cannot be
 * frozen-tested. `range-round.test.ts` drives the real `answerDrill` through every phase.
 *
 * ── The beat, and why it is reordered ───────────────────────────────────────────────────────────
 *
 * Board 11a's headline, and the single change it says matters most: *"Today the child reads a sum
 * and then something happens. If the target lands FIRST — a bottle tossed onto the water, a gull
 * flapping across — the sum becomes the thing standing between them and hitting it."* So `incoming`
 * is a real phase, not a transition:
 *
 *     incoming ──(the toss lands)──▶ question ──(a tap)──▶ verdict ──▶ incoming …
 *                                                              └──(tenth shot)──▶ end
 *
 * It costs one state, exactly as the board predicts, and no other phase changed shape.
 *
 * ── The rack counts BOTTLES, not shots ─────────────────────────────────────────────────────────
 *
 * This is measured, not assumed. The board's own `cleared` table is
 * `{pick:0, incoming:4, question:4, hit:5, streak:7, gull:7, bell:8, miss:4, end:10}` — a hit moves
 * it and a MISS does not. Its miss copy agrees: *"Your rack still has 6. Nothing was lost — a miss
 * just means another go."* So a filled slot is a bottle smashed, `session.correct`, and the number
 * beside the rack is how many bottles are still standing.
 *
 * The ROUND, separately, is ten shots and always ends — board 11a: *"Ten shots is one round, and a
 * round always ends — no endless drilling."* That is `session.complete`, at `RANGE_DRILL_LENGTH`.
 * The two counters are different on purpose and a child can see why: you fire ten times, and the
 * bottles you hit leave the water.
 *
 * ── What is NOT here ───────────────────────────────────────────────────────────────────────────
 *
 * No timer, and its absence is a design decision rather than an omission. Board 11a: *"there is no
 * timer at any band"*, and board 11c lists it first under what was deliberately not added: *"No
 * timer, no score-per-second, no leaderboard… Every one of those makes practice more engaging for
 * an adult and less safe for a five-year-old."* The previous range ran the DUEL's fuse here and
 * passed a burnt one as a missed attempt; D-8 / T-036 had already made that free, so removing the
 * fuse removes a countdown a child could see and nothing a child could lose.
 *
 * No coin payout, no hull, no rank. There is nothing on this screen to lose (A-009 AC-5) because
 * there is nothing in the model to take.
 */
import type { IslandId, SkillId } from '@content/schemas';
import { answerDrill, type DrillSession } from '@engine/drill';
import type { Question } from '@engine/questions/types';
import type { Rng } from '@engine/rng';

import { openDrill, RANGE_DRILL_LENGTH } from './range';
import { afterShot, nextTarget, streakFrom, throwsHat, type StandingTarget } from './rangeTargets';

import type { Captain } from '../stores/player';

/** The four phases a round really has. `pick` is the absence of a round, so it is not one of them. */
export type RoundPhase = 'incoming' | 'question' | 'verdict' | 'end';

export interface RangeRound {
  readonly session: DrillSession;
  /** The island whose range this is — the picked entry's, never the chart's (A-028 AC-4). */
  readonly islandId: IslandId;
  readonly skillId: SkillId;
  readonly phase: RoundPhase;
  /** What is floating out there right now. Across the verdict beat: what was SHOT AT. */
  readonly target: StandingTarget;
  /**
   * What is STILL STANDING after the shot — `afterShot`'s raw verdict, `null` allowed.
   *
   * Kept apart from `target`, which holds the shot-at object so the verdict has something to
   * shatter. Coalescing the two (`afterShot(...) ?? target`) was the A-061 bug: it resurrected a
   * destroyed crate, `advanceRound` re-derived "standing" from the corpse, and the same crate
   * was re-thrown after every later hit — and a stack could survive a miss, contradicting
   * `afterShot`'s own "never survives a miss" contract.
   */
  readonly survivor: StandingTarget | null;
  /**
   * Whether `target` is a carried survivor rather than a fresh toss (A-061 AC-4). The screen
   * skips the toss animation and the `PIM TOSSES` chip for a target already in the water.
   */
  readonly carried: boolean;
  /** The target rng, threaded separately from the drill's so a retune cannot move a question. */
  readonly rng: Rng;
  /**
   * The question the child is looking at — held across the verdict beat.
   *
   * `answerDrill` returns a session whose `current` is already the NEXT question, so a verdict
   * panel reading `session.current` would print the answer to a question nobody has been asked.
   */
  readonly asked: Question | null;
  /** The value tapped, or `null` while the question is still open. */
  readonly picked: number | null;
  /** Whether that tap was right. `null` until there is one. */
  readonly wasCorrect: boolean | null;
  readonly streak: number;
  readonly bestStreak: number;
  /** The rack slot that just sparked, or `-1`. Board: `pr-spark` fires on the slot a hit cleared. */
  readonly sparkedSlot: number;
}

/** The rack is the drill: one slot per shot. */
export const RACK_SIZE = RANGE_DRILL_LENGTH;

/** Bottles smashed — the filled slots. */
export function bottlesSmashed(round: RangeRound): number {
  return round.session.correct;
}

/** Bottles still standing. The number the board prints beside the rack. */
export function bottlesStanding(round: RangeRound): number {
  return RACK_SIZE - round.session.correct;
}

/** Shots taken of the ten. Distinct from the rack, and the thing that ends the round. */
export function shotsTaken(round: RangeRound): number {
  return round.session.answered;
}

/**
 * Opens a round.
 *
 * `openDrill` applies the band ceiling and THROWS an out-of-band skill rather than drilling it, so
 * this function inherits that refusal without restating it — one rule, one place. It runs here when
 * `session` is absent, and at the picker's own tap handler when it is not: A-028 AC-4 pins that the
 * ISLAND reaching `openDrill` is the one on the card a child pressed rather than the one the chart
 * happens to be showing, and the cheapest way to keep that true is for the tap site to be the thing
 * that names it. Either way exactly one drill is opened and this function never opens a second.
 */
export function openRound(input: {
  readonly islandId: IslandId;
  readonly skillId: SkillId;
  readonly captain: Captain;
  readonly drillRng: Rng;
  readonly targetRng: Rng;
  readonly length?: number;
  /** A drill the caller already opened for this exact island/skill pair. */
  readonly session?: DrillSession;
}): RangeRound {
  const session =
    input.session ??
    openDrill({
      islandId: input.islandId,
      skillId: input.skillId,
      captain: input.captain,
      rng: input.drillRng,
      length: input.length ?? RACK_SIZE,
    });

  if (session.skillId !== input.skillId) {
    throw new RangeError(
      `openRound: handed a '${session.skillId}' drill for a '${input.skillId}' rack`,
    );
  }

  const [target, rng] = nextTarget({
    cleared: 0,
    rackSize: session.length,
    streak: 0,
    standing: null,
    rng: input.targetRng,
  });

  return {
    session,
    islandId: input.islandId,
    skillId: input.skillId,
    phase: 'incoming',
    target,
    survivor: null,
    carried: false,
    rng,
    asked: session.current,
    picked: null,
    wasCorrect: null,
    streak: 0,
    bestStreak: 0,
    sparkedSlot: -1,
  };
}

/**
 * The toss lands. `incoming → question`, and nothing else moves.
 *
 * Idempotent for every other phase: the screen drives this from a `setTimeout`, and a timer that
 * fires once more after a fast tap must not drag a settled round back to its question.
 */
export function landTarget(round: RangeRound): RangeRound {
  if (round.phase !== 'incoming') return round;
  return { ...round, phase: 'question' };
}

/**
 * The child taps. `question → verdict`.
 *
 * `choiceIndex` is an index into the live question's choices; the screen resolves it from the value
 * tapped so a duplicated distractor cannot mark the wrong tile. A tap outside the `question` phase
 * is ignored rather than queued — double-taps on a 64pt target are the normal case, not an edge one.
 */
export function answerRound(round: RangeRound, choiceIndex: number, elapsedMs: number): RangeRound {
  if (round.phase !== 'question' || round.asked === null) return round;

  const asked = round.asked;
  const correct = choiceIndex === asked.correctIndex;
  const session = answerDrill(round.session, choiceIndex, elapsedMs);
  const { streak, best } = streakFrom(session.log);

  return {
    ...round,
    session,
    phase: 'verdict',
    // `target` keeps what was SHOT AT, so the verdict has something to shatter or drift off.
    // What is left standing is recorded raw — null on a miss, null on the final crate,
    // `{crate, 1}` on the first hit. No coalesce: resurrecting the dead object here is the
    // A-061 bug, and `advanceRound` reads THIS field, never the display.
    survivor: afterShot(round.target, correct),
    asked,
    picked: asked.choices[choiceIndex]?.value ?? null,
    wasCorrect: correct,
    streak,
    bestStreak: best,
    // Slots fill left to right, so the one that just lit is the last filled index.
    sparkedSlot: correct ? session.correct - 1 : -1,
  };
}

/**
 * The verdict clears. `verdict → incoming`, or `verdict → end` on the tenth shot.
 *
 * The next target is drawn HERE rather than at the start of `incoming` so that the toss animation
 * and the target it is tossing are decided in the same tick — a target chosen a frame after the
 * animation starts is a bottle that turns into a gull mid-air.
 */
export function advanceRound(round: RangeRound): RangeRound {
  if (round.phase !== 'verdict') return round;

  if (round.session.complete) {
    return { ...round, phase: 'end', picked: null, sparkedSlot: -1 };
  }

  // What is standing is the FACT the shot recorded, never re-derived from the verdict display —
  // re-deriving it from `target` is how a smashed crate came back (A-061).
  const standing = round.survivor;
  const [target, rng] = nextTarget({
    cleared: round.session.correct,
    rackSize: round.session.length,
    streak: round.streak,
    standing,
    rng: round.rng,
  });

  return {
    ...round,
    phase: 'incoming',
    target,
    // A non-null survivor IS the next target (`nextTarget`'s no-re-roll short-circuit), so the
    // screen must not animate a fresh throw of an object already in the water.
    carried: standing !== null,
    survivor: null,
    rng,
    asked: round.session.current,
    picked: null,
    wasCorrect: null,
    sparkedSlot: -1,
  };
}

/** Board 11b's sixth target: Pim throws his own hat, `10/10 ONLY`. */
export function hatThrown(round: RangeRound): boolean {
  return round.phase === 'end' && throwsHat(round.session.correct, round.session.answered);
}

/**
 * The round-end headline.
 *
 * The board only ever draws the perfect case — its `end` state is `10 SMASHED` out of ten — and
 * says nothing about a round with misses in it, which is the common case and the one a child who
 * needs practice will see most. Inventing praise for it would be dishonest and inventing
 * disappointment would break the mode's one promise, so the copy states the fact and the fact is
 * good news: the round is over and every bottle hit is on the meter. `missLine`'s *"Nothing was
 * lost"* is the register.
 */
export function roundEndCopy(round: RangeRound): { readonly title: string; readonly sub: string } {
  const smashed = round.session.correct;
  const shots = round.session.answered;
  if (smashed === shots && shots > 0) {
    // The board's own line, verbatim at ten: "Ten out of ten bottles." — leading capital, then not.
    return {
      title: 'Rack cleared!',
      sub: `${wordFor(shots)} out of ${wordFor(shots).toLowerCase()} bottles.`,
    };
  }
  return {
    title: 'Round over!',
    sub: smashed === 0 ? 'Every shot fills the meter a little.' : `${smashed} of ${shots} bottles smashed.`,
  };
}

/** The board writes "Ten out of ten bottles" in words, not digits. Ten is as high as a rack goes. */
const NUMBER_WORDS = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
] as const;

function wordFor(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}
