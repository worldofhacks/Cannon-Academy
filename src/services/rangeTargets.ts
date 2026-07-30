/**
 * What is floating out there — the range's six targets, as a pure rule.
 *
 * Board 11b: *"The question band never changes. What changes is what is floating out there — which
 * is the whole trick, because variety in the REWARD costs nothing in the MECHANIC."* That sentence
 * is this module's entire justification for existing: the target axis is orthogonal to the drill,
 * so it lives beside `services/range.ts` rather than inside it, and it never touches mastery,
 * accuracy, the meter, or what a drill is worth.
 *
 * Everything here is a pure function of its inputs and threads `Rng` the way the engine does. No
 * wall clock, no module state — so a round is replayable from `{seed, answers}` exactly as a drill
 * is, and `range-targets.test.ts` can sweep thousands of rounds instead of eyeballing one.
 *
 * ── The one rule the board states that is NOT implemented ───────────────────────────────────────
 *
 * Board 11b gives the golden bell *"pays three rack slots at once"*. It is not implemented, and the
 * reason is board 11c's own METER note: *"the meter is made of the thing you are shooting: clear a
 * bottle from the water and a bottle leaves the rack"*. A rack slot IS a question. Paying three
 * would empty a ten-slot rack on the eighth question, and `commitDrill` pays nothing for a drill
 * that is not COMPLETE — so a child who rang the bell twice would finish a shorter round and be
 * credited with less mastery than one who never saw it. The rarest, most exciting event in the mode
 * cannot be the one that quietly pays worst. The bell keeps its 1-in-12 rarity, its ring, its glow
 * and its own hit mark, and is worth one slot like everything else.
 *
 * The crate stack, by contrast, IS implemented as authored, because its span is exactly two
 * questions and therefore exactly two slots: *"the only target that spans questions — introduces
 * persistence without introducing risk."*
 */
import { nextFloat, type Rng } from '@engine/rng';

import { STREAK_CHIP, TARGET_ART, type TargetKind } from '../theme/rangeBoard';

/**
 * A target standing in the water.
 *
 * `remaining` is 1 for five of the six kinds and 2 for a fresh crate stack — the only thing on this
 * board that survives an answer. It is the reason this is a state rather than a lookup.
 */
export interface StandingTarget {
  readonly kind: TargetKind;
  /** Shots still needed to clear it. Only a crate stack is ever above 1. */
  readonly remaining: number;
}

/**
 * The board's own trigger column, as numbers.
 *
 * `gull` and `bell` are the board's literal `1 IN 5` and `1 IN 12`. `crate` has no rate on the
 * board — only `RACK 6+` — so 1-in-4-once-eligible is a CHOICE, and a conservative one: it puts
 * roughly one crate stack in the back half of a rack, which is what "introduces persistence"
 * without turning the last four shots into a different game.
 */
export const TARGET_ODDS = {
  gullOneIn: 5,
  bellOneIn: 12,
  crateOneIn: 4,
  /** Board 11b: `RACK 6+`. Six slots cleared, so the crate can only start on shot 7 or later. */
  crateFromCleared: 6,
  /** Board 11b: `STREAK ×3`. Mirrored from the chip that announces it, never re-typed. */
  barrelAtStreak: STREAK_CHIP.barrelAt,
} as const;

/**
 * Picks the target for the next shot.
 *
 * Precedence, and every step of it is a design decision rather than an accident of ordering:
 *
 *  1. **A standing crate continues.** It is the only target that spans questions; re-rolling it
 *     away mid-stack would make the promise "answer twice and both crates go" a lie.
 *  2. **The bell outranks everything.** It is the board's *"only unpredictable reward and the
 *     reason to start a second round"*. A bell suppressed because a streak happened to be running
 *     would make the rarest event rarer still, at exactly the moment a child is doing well.
 *  3. **A crate stack starts.** Gated on `RACK 6+`, and never on the LAST shot of a rack — a stack
 *     that cannot be finished is a target a child is shown and then denied.
 *  4. **The barrel, at streak ×3.** Board 11b: *"the reward for doing well is that it gets easier
 *     to feel good."*
 *  5. **The gull, 1 in 5.**
 *  6. **The bottle**, which is the baseline and the thing the rack is made of.
 *
 * Exactly ONE `nextFloat` draw is taken per candidate rule, in a fixed order, so the stream stays
 * stable whatever the rule chooses — the same discipline `nextInt` documents.
 */
export function nextTarget(input: {
  /** Slots already cleared — equivalently, questions already answered. */
  readonly cleared: number;
  /** Slots in the rack, which is the drill's length. */
  readonly rackSize: number;
  readonly streak: number;
  /** A crate stack that survived the last shot, or `null`. */
  readonly standing: StandingTarget | null;
  readonly rng: Rng;
}): readonly [StandingTarget, Rng] {
  const standing = input.standing;
  if (standing !== null && standing.remaining > 0) {
    return [standing, input.rng];
  }

  let rng = input.rng;

  const [bellRoll, afterBell] = nextFloat(rng);
  rng = afterBell;
  if (bellRoll < 1 / TARGET_ODDS.bellOneIn) {
    return [{ kind: 'bell', remaining: 1 }, rng];
  }

  const [crateRoll, afterCrate] = nextFloat(rng);
  rng = afterCrate;
  // `shotsLeft` counts THIS shot, so a stack needs two of them — the guard is `>= 2`, and it is
  // what stops the tenth bottle of a rack being an unfinishable pair of crates.
  const shotsLeft = input.rackSize - input.cleared;
  if (
    input.cleared >= TARGET_ODDS.crateFromCleared &&
    shotsLeft >= 2 &&
    crateRoll < 1 / TARGET_ODDS.crateOneIn
  ) {
    return [{ kind: 'crate', remaining: 2 }, rng];
  }

  if (input.streak >= TARGET_ODDS.barrelAtStreak) {
    return [{ kind: 'barrel', remaining: 1 }, rng];
  }

  const [gullRoll, afterGull] = nextFloat(rng);
  rng = afterGull;
  if (gullRoll < 1 / TARGET_ODDS.gullOneIn) {
    return [{ kind: 'gull', remaining: 1 }, rng];
  }

  return [{ kind: 'bottle', remaining: 1 }, rng];
}

/**
 * What is left of a target after a shot.
 *
 * A hit takes one off `remaining`; a crate stack with one crate left therefore stands for the next
 * question, which is the board's *"needs two correct answers in a row"*. A MISS clears the stack
 * outright — the board's own miss copy is *"It floated away"*, and a stack that survived a miss
 * would make "in a row" meaningless.
 */
export function afterShot(target: StandingTarget, correct: boolean): StandingTarget | null {
  if (!correct) return null;
  const remaining = target.remaining - 1;
  return remaining > 0 ? { ...target, remaining } : null;
}

/**
 * The streak, and the best streak, read off a drill's own log.
 *
 * Derived rather than tracked, deliberately. The screen already holds a `DrillSession` whose `log`
 * is the authoritative record of every answer; a second counter kept in component state is a second
 * source of truth for the same fact, and the one that drifts when a re-render replays an effect.
 *
 * Timeouts (`choiceIndex === null`) are SKIPPED rather than counted as misses. D-8 / T-036 made a
 * burned fuse charge nothing — not mastery, not an attempt, not a drill slot — and a streak the
 * clock can break would quietly re-introduce the cost that ruling removed.
 */
export function streakFrom(
  log: readonly { readonly choiceIndex: number | null; readonly correct: boolean }[],
): { readonly streak: number; readonly best: number } {
  let streak = 0;
  let best = 0;
  for (const answer of log) {
    if (answer.choiceIndex === null) continue;
    streak = answer.correct ? streak + 1 : 0;
    if (streak > best) best = streak;
  }
  return { streak, best };
}

/**
 * Whether Pim throws his own hat — board 11b's sixth target, `10/10 ONLY`.
 *
 * *"Pure ceremony, zero mechanics, and the kind of thing a child tells someone about."* It is not a
 * shot target and never appears in `nextTarget`; it is a round-end flourish, which is why it is a
 * predicate here rather than a branch there.
 */
export function throwsHat(correct: number, asked: number): boolean {
  return asked > 0 && correct === asked;
}

/** The board's chip copy for a target, as `STAGE_CHIP` renders it before the question lands. */
export function targetHeight(kind: TargetKind): number {
  return TARGET_ART[kind].h;
}
