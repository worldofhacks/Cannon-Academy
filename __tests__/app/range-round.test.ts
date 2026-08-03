/**
 * A-059 — the round: the beat the board reorders, and the six things that can be floating.
 *
 * Board 11a names the single change that matters most: *"Today the child reads a sum and then
 * something happens. If the target lands FIRST … the maths stops being the event and becomes the
 * trigger. It costs one state in the reducer."* That state is `incoming`, and the first block below
 * is the proof it exists and that nothing can be answered before it has run.
 *
 * Everything here is driven through the REAL `answerDrill`, never a hand-built session, because the
 * two counters this screen keeps — bottles smashed and shots taken — are only meaningfully
 * different if the engine is the thing producing them.
 *
 * ── The measurement that decided the rack ───────────────────────────────────────────────────────
 *
 * A filled slot is a bottle SMASHED, not a shot taken. That is read off the board's own `cleared`
 * table, `{pick:0, incoming:4, question:4, hit:5, streak:7, gull:7, bell:8, miss:4, end:10}` — a hit
 * moves it and a miss does not — and confirmed by its miss copy, *"Your rack still has 6. Nothing
 * was lost."* The ROUND is separately ten shots and always ends (board 11a: *"Ten shots is one
 * round, and a round always ends — no endless drilling"*). Both are pinned below, because reading
 * them the other way round produces a screen that looks right and lies about progress.
 */
import { describe, expect, it } from 'vitest';

import { getSkill } from '@content/index';
import type { GradeBand, SkillId } from '@content/schemas';
import { createRng, nextFloat, type Rng } from '@engine/rng';
import { CHOICE_COUNT } from '@engine/tuning';

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
  shotsTaken,
  type RangeRound,
} from '../../src/services/rangeRound';
import {
  afterShot,
  nextTarget,
  streakFrom,
  TARGET_ODDS,
  throwsHat,
  type StandingTarget,
} from '../../src/services/rangeTargets';
import { emptyCaptain, type Captain } from '../../src/stores/player';
import { CHIP_COPY } from '../../src/theme/rangeBoard';

const ISLAND = 'port_sumwich' as const;
const SKILL: SkillId = 'add_within_10';

function captain(over: Partial<Captain> = {}): Captain {
  return {
    ...emptyCaptain(),
    // Re-baselined 2026-08-03 under D-14 (OWNER-RULINGS.md; A-069's atlas): islands carry
    // per-band curricula now, and `add_within_10` is Port Sumwich's K-1 cell — a g2_3 captain's
    // Port Sumwich drills `place_value_compare`, so the old band is (rightly) refused at
    // `openDrill`'s curriculum door. Only the captain's band moves; the frozen skill/island
    // pair, every seed-hunted fixture, and the round machine under test are untouched — the
    // target stream draws from `targetRng` alone and the drill stream from `add_within_10`'s
    // frozen templates, neither of which reads the band.
    gradeBand: 'k_1' as GradeBand,
    unlockedIslands: [ISLAND],
    currentIsland: ISLAND,
    ...over,
  };
}

function open(seed = 101, length = RACK_SIZE): RangeRound {
  return openRound({
    islandId: ISLAND,
    skillId: SKILL,
    captain: captain(),
    drillRng: createRng(seed),
    targetRng: createRng(seed * 3 + 1),
    length,
  });
}

/** Answers the live question. `correct` picks the right choice; otherwise the next one along. */
function shoot(round: RangeRound, correct: boolean): RangeRound {
  const asked = round.asked;
  if (asked === null) throw new Error('range-round: nothing to shoot at');
  const index = correct ? asked.correctIndex : (asked.correctIndex + 1) % CHOICE_COUNT;
  return answerRound(round, index, 400);
}

/** One full beat: the toss lands, the child fires, the verdict clears. */
function beat(round: RangeRound, correct: boolean): RangeRound {
  return advanceRound(shoot(landTarget(round), correct));
}

/** Plays a whole round from a plan of hits and misses. */
function play(round: RangeRound, plan: readonly boolean[]): RangeRound {
  let live = round;
  for (const correct of plan) {
    if (live.phase === 'end') break;
    live = beat(live, correct);
  }
  return live;
}

describe('A-059 the range round — the beat is reordered', () => {
  it('spec(A-059:AC-9) a round opens on `incoming`, with a target already chosen', () => {
    // The board's headline change, as a property: the target EXISTS before the question is asked.
    // A machine that opened on `question` and animated the toss underneath would look identical for
    // 700ms and mean the opposite thing.
    const round = open();
    expect(round.phase).toBe('incoming');
    expect(round.target.kind).toBeTypeOf('string');
    expect(round.target.remaining).toBeGreaterThan(0);
    // ...and the question exists too — it is just not what the child is looking at yet.
    expect(round.asked).not.toBeNull();
    expect(round.asked?.skill).toBe(SKILL);
    expect(round.picked).toBeNull();
    expect(round.wasCorrect).toBeNull();
  });

  it('spec(A-059:AC-9) nothing can be answered until the toss has landed', () => {
    // The screen drives `landTarget` from a timer. A tap that arrived during the toss — a child
    // hammering the sheet, or a stale press — must not grade a question they have not been shown.
    const round = open();
    const early = answerRound(round, 0, 100);
    expect(early).toBe(round);
    expect(shotsTaken(early)).toBe(0);

    const landed = landTarget(round);
    expect(landed.phase).toBe('question');
    // The toss lands once. A second timer firing after a fast tap must not drag a settled round
    // back to its question.
    const answered = shoot(landed, true);
    expect(answered.phase).toBe('verdict');
    expect(landTarget(answered)).toBe(answered);
  });

  it('spec(A-059:AC-9) the phases cycle incoming → question → verdict → incoming, and end on the tenth shot', () => {
    let round = open();
    const seen: string[] = [];

    for (let shot = 0; shot < RACK_SIZE; shot += 1) {
      expect(round.phase).toBe('incoming');
      round = landTarget(round);
      expect(round.phase).toBe('question');
      round = shoot(round, shot % 2 === 0);
      expect(round.phase).toBe('verdict');
      seen.push('beat');
      round = advanceRound(round);
    }

    expect(seen).toHaveLength(RACK_SIZE);
    expect(round.phase).toBe('end');
    expect(shotsTaken(round)).toBe(RACK_SIZE);
    expect(round.session.complete).toBe(true);
    // A round always ends. `advanceRound` on a finished round is a no-op, not another shot.
    expect(advanceRound(round)).toBe(round);
  });

  it('spec(A-059:AC-9) the verdict panel reads the question that was ASKED, not the next one', () => {
    // `answerDrill` returns a session whose `current` is already the NEXT question, so a miss panel
    // reading `session.current` would print the answer to a question nobody has been asked — which
    // is the most confusing thing this screen could possibly do to a child who just got it wrong.
    const round = landTarget(open());
    const asked = round.asked;
    expect(asked).not.toBeNull();

    const verdict = shoot(round, false);
    expect(verdict.asked).toBe(asked);
    expect(verdict.asked?.text).toBe(asked!.text);
    expect(verdict.session.current).not.toBe(asked);
    expect(verdict.wasCorrect).toBe(false);
  });
});

describe('A-059 the range round — the rack counts bottles, the round counts shots', () => {
  it('spec(A-059:AC-10) a hit clears a slot and a miss does not, exactly as the board’s table says', () => {
    let round = open();
    expect(bottlesSmashed(round)).toBe(0);
    expect(bottlesStanding(round)).toBe(RACK_SIZE);

    round = beat(round, true);
    expect(bottlesSmashed(round)).toBe(1);
    expect(shotsTaken(round)).toBe(1);

    round = beat(round, false);
    // The board holds `cleared` at 4 across `question` and `miss`, and prints "Your rack still
    // has 6" — a miss costs a shot and no bottle.
    expect(bottlesSmashed(round)).toBe(1);
    expect(shotsTaken(round)).toBe(2);
    expect(bottlesStanding(round)).toBe(RACK_SIZE - 1);
  });

  it('spec(A-059:AC-10) the two counters really are different — a sloppy round ends with bottles standing', () => {
    // If the rack counted shots, `bottlesStanding` would be zero at the end of every round and the
    // miss copy would be meaningless. Half right is the case that separates the two readings.
    const plan = Array.from({ length: RACK_SIZE }, (_, i) => i % 2 === 0);
    const round = play(open(), plan);

    expect(round.phase).toBe('end');
    expect(shotsTaken(round)).toBe(RACK_SIZE);
    expect(bottlesSmashed(round)).toBe(RACK_SIZE / 2);
    expect(bottlesStanding(round)).toBe(RACK_SIZE / 2);
    expect(bottlesSmashed(round)).not.toBe(shotsTaken(round));
  });

  it('spec(A-059:AC-10) the spark fires on the slot a hit just cleared, and never on a miss', () => {
    let round = landTarget(open());
    const hit = shoot(round, true);
    expect(hit.sparkedSlot).toBe(0);

    round = advanceRound(hit);
    const miss = shoot(landTarget(round), false);
    expect(miss.sparkedSlot).toBe(-1);

    // The spark is cleared as soon as the verdict does, so a re-render mid-`incoming` cannot
    // re-fire it on a slot that was cleared two shots ago.
    expect(advanceRound(miss).sparkedSlot).toBe(-1);
  });

  it('spec(A-059:AC-10) a perfect rack says the board’s line, and an imperfect one says something true', () => {
    const perfect = play(open(), Array.from({ length: RACK_SIZE }, () => true));
    expect(roundEndCopy(perfect)).toEqual({
      title: 'Rack cleared!',
      sub: 'Ten out of ten bottles.',
    });
    expect(hatThrown(perfect)).toBe(true);

    // The board only ever draws the perfect case; this is the common one, and the copy has to be
    // honest without being a telling-off.
    const scrappy = play(open(202), [true, false, true, true, false, true, true, false, true, true]);
    expect(roundEndCopy(scrappy).title).toBe('Round over!');
    expect(roundEndCopy(scrappy).sub).toContain(`${bottlesSmashed(scrappy)} of ${RACK_SIZE}`);
    expect(hatThrown(scrappy)).toBe(false);

    const rough = play(open(303), Array.from({ length: RACK_SIZE }, () => false));
    expect(roundEndCopy(rough).sub).toBe('Every shot fills the meter a little.');
  });

  it('spec(A-059:AC-10) the streak is derived from the drill’s own log, never counted twice', () => {
    const round = play(open(404), [true, true, true, false, true, true, true, true, false, true]);
    expect(round.bestStreak).toBe(4);
    // Derived, not tracked: the same answer record read again gives the same number, which is what
    // makes a re-render incapable of inflating it.
    expect(streakFrom(round.session.log)).toEqual({ streak: 1, best: 4 });
  });

  it('spec(A-059:AC-10) a timed-out question breaks nothing — D-8 charges no shot, no bottle, no streak', () => {
    // The board removes the timer entirely, but `answerDrill` still accepts a `null` choice and
    // D-8/T-036 made that free. A streak the clock could break would quietly re-introduce the cost
    // that ruling removed, so it is pinned here rather than trusted.
    const log = [
      { choiceIndex: 0, correct: true },
      { choiceIndex: null, correct: false },
      { choiceIndex: 1, correct: true },
    ];
    expect(streakFrom(log)).toEqual({ streak: 2, best: 2 });
  });
});

describe('A-059 the six targets', () => {
  it('spec(A-059:AC-11) a crate stack survives one hit and falls to the second — and never survives a miss', () => {
    // Board 11b: *"Two crates, needs two correct answers in a row to clear both. The only target
    // that spans questions."* Two questions, two slots — which is what keeps it compatible with a
    // rack whose slots are answers.
    const stack: StandingTarget = { kind: 'crate', remaining: 2 };
    const half = afterShot(stack, true);
    expect(half).toEqual({ kind: 'crate', remaining: 1 });
    expect(afterShot(half!, true)).toBeNull();
    // "In a row" is the whole point: a miss takes the stack with it.
    expect(afterShot(stack, false)).toBeNull();
  });

  it('spec(A-059:AC-11) a standing crate is never re-rolled away mid-stack', () => {
    const standing: StandingTarget = { kind: 'crate', remaining: 1 };
    for (let seed = 0; seed < 50; seed += 1) {
      const [target, rng] = nextTarget({
        cleared: 7,
        rackSize: RACK_SIZE,
        streak: 5,
        standing,
        rng: createRng(seed),
      });
      expect(target).toBe(standing);
      // ...and it costs no draw, so a continued stack cannot shift the target stream.
      expect(rng).toEqual(createRng(seed));
    }
  });

  it('spec(A-059:AC-11) a crate stack never starts on the last shot of a rack', () => {
    // A stack that cannot be finished is a target a child is shown and then denied. Swept across
    // every rng seed rather than argued about.
    for (let seed = 0; seed < 400; seed += 1) {
      const [target] = nextTarget({
        cleared: RACK_SIZE - 1,
        rackSize: RACK_SIZE,
        streak: 0,
        standing: null,
        rng: createRng(seed),
      });
      expect(target.kind, `seed ${seed} started a stack with one shot left`).not.toBe('crate');
    }
  });

  it('spec(A-059:AC-11) a crate never appears before the board’s RACK 6+ gate', () => {
    for (let cleared = 0; cleared < TARGET_ODDS.crateFromCleared; cleared += 1) {
      for (let seed = 0; seed < 200; seed += 1) {
        const [target] = nextTarget({
          cleared,
          rackSize: RACK_SIZE,
          streak: 0,
          standing: null,
          rng: createRng(seed),
        });
        expect(target.kind, `a crate appeared at ${cleared} cleared`).not.toBe('crate');
      }
    }
  });

  it('spec(A-059:AC-11) the barrel appears at streak ×3 and not before', () => {
    // Board 11b: *"A larger target as a reward for accuracy is backwards from adult games and
    // exactly right here — the reward for doing well is that it gets easier to feel good."*
    let barrelsBelow = 0;
    let barrelsAt = 0;
    for (let seed = 0; seed < 400; seed += 1) {
      const below = nextTarget({ cleared: 2, rackSize: RACK_SIZE, streak: 2, standing: null, rng: createRng(seed) })[0];
      if (below.kind === 'barrel') barrelsBelow += 1;
      const at = nextTarget({
        cleared: 2,
        rackSize: RACK_SIZE,
        streak: TARGET_ODDS.barrelAtStreak,
        standing: null,
        rng: createRng(seed),
      })[0];
      if (at.kind === 'barrel') barrelsAt += 1;
    }
    expect(barrelsBelow).toBe(0);
    // Non-vacuity: at the threshold it is the common case, not an occasional one — only the rarer
    // bell outranks it.
    expect(barrelsAt).toBeGreaterThan(300);
  });

  it('spec(A-059:AC-11) the gull and the bell land near the board’s own 1-in-5 and 1-in-12', () => {
    // Rates rather than a single draw: the board's column IS the spec, and a distribution is the
    // only honest way to assert one. Bounds are loose enough that mulberry32's own variance over
    // 6000 draws cannot fail them, and tight enough that a swapped constant does.
    const trials = 6_000;
    let rng: Rng = createRng(20_260_730);
    const counts: Record<string, number> = {};
    for (let i = 0; i < trials; i += 1) {
      const [target, next] = nextTarget({
        cleared: 2,
        rackSize: RACK_SIZE,
        streak: 0,
        standing: null,
        rng,
      });
      rng = next;
      counts[target.kind] = (counts[target.kind] ?? 0) + 1;
      // Keep the stream moving even when a rule short-circuits before every draw.
      rng = nextFloat(rng)[1];
    }

    const bell = (counts.bell ?? 0) / trials;
    const gull = (counts.gull ?? 0) / trials;
    const bottle = (counts.bottle ?? 0) / trials;

    expect(bell).toBeGreaterThan(1 / TARGET_ODDS.bellOneIn - 0.03);
    expect(bell).toBeLessThan(1 / TARGET_ODDS.bellOneIn + 0.03);
    expect(gull).toBeGreaterThan(0.1);
    expect(gull).toBeLessThan(0.25);
    // The bottle is still the baseline — board 11b's `ALWAYS`, and the thing the rack is made of.
    expect(bottle).toBeGreaterThan(0.6);
  });

  it('spec(A-059:AC-11) target selection is pure and replayable from its seed', () => {
    // A round is replayable from `{seed, answers}` exactly as a drill is, which is what lets this
    // file sweep thousands of rounds instead of eyeballing one.
    for (let seed = 0; seed < 25; seed += 1) {
      const input = { cleared: 6, rackSize: RACK_SIZE, streak: 1, standing: null, rng: createRng(seed) };
      expect(nextTarget(input)).toEqual(nextTarget(input));
    }
    // ...and two rounds at the same pair of seeds draw the same targets.
    const a = play(open(555), [true, true, false, true]);
    const b = play(open(555), [true, true, false, true]);
    expect(a.target).toEqual(b.target);
    expect(a.rng).toEqual(b.rng);
  });

  it('spec(A-059:AC-11) Pim throws his hat at 10/10 only', () => {
    expect(throwsHat(10, 10)).toBe(true);
    expect(throwsHat(9, 10)).toBe(false);
    // Zero of zero is not a perfect round, it is no round — the guard that stops the ceremony
    // firing on an empty session.
    expect(throwsHat(0, 0)).toBe(false);
  });

  it('spec(A-059:AC-11) every target a whole round produces is one of the six', () => {
    const kinds = new Set<string>();
    for (let seed = 0; seed < 60; seed += 1) {
      let round = open(seed + 1);
      for (let shot = 0; shot < RACK_SIZE && round.phase !== 'end'; shot += 1) {
        kinds.add(round.target.kind);
        round = beat(round, true);
      }
    }
    for (const kind of kinds) {
      expect(['bottle', 'barrel', 'gull', 'bell', 'crate']).toContain(kind);
    }
    // Non-vacuity: an all-perfect sweep really does reach the streak reward and the rare ones, so
    // this is not passing because only bottles ever appear.
    expect(kinds.size).toBeGreaterThan(2);
    expect(kinds).toContain('bottle');
    expect(kinds).toContain('barrel');
  });
});

describe('A-059 the round refuses what the band refuses', () => {
  it('spec(A-059:AC-12) opening a round on an out-of-band skill throws rather than drilling it', () => {
    // The ceiling is `openDrill`'s, and `openRound` inherits it rather than restating it — one
    // rule, one place. `two_step_add_sub` is minGrade 2, above the k_1 ceiling (since D-14 it
    // lives on g2_3's Isla Products cell, not on any k_1 island — either door refuses it here).
    expect(getSkill('two_step_add_sub').minGrade).toBe(2);
    expect(() =>
      openRound({
        islandId: ISLAND,
        skillId: 'two_step_add_sub',
        captain: captain({ gradeBand: 'k_1' }),
        drillRng: createRng(1),
        targetRng: createRng(2),
      }),
    ).toThrow(RangeError);
  });

  it('spec(A-059:AC-12) a round handed a drill for a different rack refuses it', () => {
    // The picker opens the drill and this function accepts it, so the two could disagree. A round
    // whose bar says `+` and whose questions are `×` is the exact failure that would produce.
    const session = openRound({
      islandId: ISLAND,
      skillId: SKILL,
      captain: captain(),
      drillRng: createRng(9),
      targetRng: createRng(10),
    }).session;

    expect(() =>
      openRound({
        islandId: ISLAND,
        skillId: 'sub_within_20',
        captain: captain(),
        drillRng: createRng(9),
        targetRng: createRng(10),
        session,
      }),
    ).toThrow(RangeError);
  });

  it('spec(A-059:AC-12) a round opened with a pre-opened drill uses that exact drill', () => {
    const round = open();
    const reused = openRound({
      islandId: ISLAND,
      skillId: SKILL,
      captain: captain(),
      drillRng: createRng(1),
      targetRng: createRng(2),
      session: round.session,
    });
    expect(reused.session).toBe(round.session);
    expect(reused.phase).toBe('incoming');
  });
});

describe('A-061 the range never re-throws a target that is already dead or already carried', () => {
  /**
   * Seed-hunted, never hand-built: the crate stack is the only target that spans questions, so
   * every spec here needs a REAL round that reaches one. The hunt plays perfect racks until a
   * fresh two-crate stack is the incoming target early enough (`shotsTaken ≤ 7`) that the whole
   * stack — and the shot after its death — still fits inside the round. Everything up to that
   * beat is identical before and after the A-061 fix (the state conflation only diverges once a
   * stack dies or is missed), so the hunt cannot mask the bug it exists to expose.
   */
  function huntFreshCrate(): { readonly seed: number; readonly round: RangeRound } {
    for (let seed = 1; seed <= 500; seed += 1) {
      let live = open(seed);
      for (let shot = 0; shot < RACK_SIZE && live.phase === 'incoming'; shot += 1) {
        if (live.target.kind === 'crate' && live.target.remaining === 2 && shotsTaken(live) <= 7) {
          return { seed, round: live };
        }
        live = beat(live, true);
      }
    }
    throw new Error('range-round: no seed under 500 reached a fresh crate stack by shot 8');
  }

  /**
   * Lazy and memoised, deliberately: a broken engine (the mutation check restores the coalesce,
   * under which the FIRST target of every round sticks forever and no crate is ever drawn) must
   * redden the named specs below, not the file's collection step.
   */
  let hunted: { readonly seed: number; readonly round: RangeRound } | null = null;
  function freshCrate(): { readonly seed: number; readonly round: RangeRound } {
    hunted = hunted ?? huntFreshCrate();
    return hunted;
  }

  it('spec(A-061:AC-1) clearing the LAST crate of a stack draws a fresh target — never the corpse', () => {
    const { round: atCrate } = freshCrate();
    // The designed first half: one hit leaves one crate standing. (The carry itself is frozen
    // spec(A-059:AC-11) behaviour, held at round level by spec(A-061:AC-3).)
    const carriedBeat = beat(atCrate, true);
    expect(carriedBeat.phase).toBe('incoming');
    expect(carriedBeat.target).toEqual({ kind: 'crate', remaining: 1 });

    // The kill. `answerRound`'s old `?? round.target` coalesce resurrected the smashed crate so
    // the verdict had something to shatter, `advanceRound` re-derived the corpse as "standing",
    // and Pim visibly re-threw the identical object after every later hit. A fresh stack is
    // ALWAYS `{remaining: 2}`, so a `{crate, remaining: 1}` here can only be the corpse coming
    // back.
    const killVerdict = shoot(landTarget(carriedBeat), true);
    expect(killVerdict.wasCorrect).toBe(true);
    const after = advanceRound(killVerdict);
    expect(after.phase).toBe('incoming');
    expect(after.target).not.toEqual({ kind: 'crate', remaining: 1 });
    // ...and the toss was a REAL draw: a carried stack costs no rng, a fresh target always does.
    expect(after.rng).not.toEqual(killVerdict.rng);
  });

  it('spec(A-061:AC-2) a crate stack never survives a miss — the round holds the module contract', () => {
    // `afterShot` states it outright: "never survives a miss" (`rangeTargets.ts`). The old
    // coalesce contradicted it at round level — `null ?? round.target` handed the missed stack
    // back to `advanceRound`, which re-derived it as standing and threw it again.
    const { round: atCrate } = freshCrate();
    const missVerdict = shoot(landTarget(atCrate), false);
    expect(missVerdict.wasCorrect).toBe(false);
    // The verdict display still shows the stack that floated away...
    expect(missVerdict.target).toEqual({ kind: 'crate', remaining: 2 });

    const after = advanceRound(missVerdict);
    expect(after.phase).toBe('incoming');
    // ...but what follows is a FRESH draw: rng was consumed (a carried stack costs none), and
    // the incoming target is a new object, never the stack the miss just cleared.
    expect(after.rng).not.toEqual(missVerdict.rng);
    expect(after.target).not.toBe(atCrate.target);
    expect(after.carried).toBe(false);
  });

  it('spec(A-061:AC-3) the designed one-crate carry is preserved — {crate,1} stands and costs no draw', () => {
    const { round: atCrate } = freshCrate();
    const hitVerdict = shoot(landTarget(atCrate), true);
    // The verdict shows what was SHOT AT — the screen needs the full stack to shatter.
    expect(hitVerdict.target).toEqual({ kind: 'crate', remaining: 2 });
    // What actually survived is recorded raw beside it.
    expect(hitVerdict.survivor).toEqual({ kind: 'crate', remaining: 1 });

    const after = advanceRound(hitVerdict);
    // The board's promise: "answer twice and both crates go". The half-cleared stack stands...
    expect(after.target).toEqual({ kind: 'crate', remaining: 1 });
    // ...and `nextTarget`'s no-re-roll short-circuit held at round level: the continuation cost
    // not one rng draw, exactly as frozen spec(A-059:AC-11) pins for the module.
    expect(after.rng).toEqual(hitVerdict.rng);
  });

  it('spec(A-061:AC-4) `carried` marks exactly the continuation beat, and the screen has copy for it', () => {
    // A freshly opened round is a real toss, and so is a freshly drawn stack.
    const { round: atCrate } = freshCrate();
    expect(open().carried).toBe(false);
    expect(atCrate.carried).toBe(false);

    // The half-cleared stack is the ONLY continuation: `carried` is what the screen keys the
    // skipped toss animation and the continuation chip on, instead of the bare `incoming` phase
    // that re-animated a throw of an object already in the water.
    const carriedBeat = beat(atCrate, true);
    expect(carriedBeat.phase).toBe('incoming');
    expect(carriedBeat.carried).toBe(true);

    // Once the stack dies, the next beat is a genuine toss again.
    const afterKill = beat(carriedBeat, true);
    expect(afterKill.carried).toBe(false);

    // The continuation copy the chip prints in place of `PIM TOSSES …` when `carried` is true.
    expect(CHIP_COPY.carry).toBe('ONE CRATE LEFT!');
  });

  it('spec(A-061:AC-5) replay is untouched — {seed, answers} reproduce every target, through the stack and past its death', () => {
    // The fix moved a fact into state; it must not have moved a draw. Two identical perfect
    // racks at the crate seed cross the stack, kill it, and keep drawing — and see the same
    // water shot for shot.
    const { seed: crateSeed } = freshCrate();
    const plan = Array.from({ length: RACK_SIZE }, () => true);
    const trail = (round: RangeRound): readonly (readonly [StandingTarget, boolean])[] => {
      const seen: (readonly [StandingTarget, boolean])[] = [];
      let live = round;
      for (const correct of plan) {
        if (live.phase === 'end') break;
        seen.push([live.target, live.carried] as const);
        live = beat(live, correct);
      }
      return seen;
    };

    const a = trail(open(crateSeed));
    const b = trail(open(crateSeed));
    expect(a).toEqual(b);
    // Non-vacuity: the sweep really crossed a stack and really carried it once.
    expect(a.some(([target]) => target.kind === 'crate')).toBe(true);
    expect(a.some(([, carried]) => carried)).toBe(true);

    const endA = play(open(crateSeed), plan);
    const endB = play(open(crateSeed), plan);
    expect(endA.phase).toBe('end');
    expect(endA.target).toEqual(endB.target);
    expect(endA.rng).toEqual(endB.rng);
  });
});
