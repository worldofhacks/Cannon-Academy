/**
 * A-009 — the gunnery range: the drill that makes mastery real.
 *
 * Written before the implementation. Two MVP checklist items sit at zero today — "run a practice
 * drill that fills a mastery meter" and "the meter unlocks the next cannon" — because mastery has
 * two fill rates and the app implements neither. `src/engine/drill.ts` (T-017) has been merged and
 * published to the app track for a full wave with **zero callers**. This file is the contract that
 * wires it up.
 *
 * PLAN.md sets the cut line: **reuse the duel question UI against a stationary target buoy — a
 * meter, not a new mode.** So there is no opponent here, no hull, no damage, no cannon. There is a
 * question, an answer, and a meter that moves at the FULL rate.
 *
 * Nothing here renders a screen. `app/range.tsx` imports React Native, whose entry point is
 * Flow-typed and unparseable by the node runner — so the rule the app track has followed since
 * A-001 applies again: the logic lives in a module the screen calls, and the module is tested
 * headless. The drill itself is driven through the real T-017 engine session, so these are the
 * states the screen will actually hand over, not hand-built fixtures.
 *
 * ── The contract these tests assume ──────────────────────────────────────────────────────────
 *
 * NEW MODULE — `src/services/range.ts`:
 *
 *   export interface RangeDrillOutcome {
 *     readonly applied: boolean;        // false when this session was already committed, or is unfinished
 *     readonly skillId: SkillId;
 *     readonly correct: number;         // raw corrects committed; 0 when not applied
 *     readonly asked: number;           // raw attempts committed; 0 when not applied
 *     readonly unlockedCannons: readonly CannonId[];  // newly granted BY THIS COMMIT
 *     readonly unlockedIslands: readonly IslandId[];  // fog newly lifted BY THIS COMMIT
 *     readonly meterPercent: number;    // the 0-100 meter AFTER the commit
 *     readonly mastered: boolean;       // whether the skill now clears both mastery gates
 *   }
 *
 *   export function rangeSkills(islandId: IslandId): readonly SkillId[];
 *
 *   export function openDrill(input: {
 *     readonly islandId: IslandId;
 *     readonly skillId: SkillId;
 *     readonly captain: Captain;
 *     readonly rng: Rng;
 *     readonly length?: number;
 *   }): DrillSession;
 *
 *   export function commitDrill(store: CaptainStore, session: DrillSession): RangeDrillOutcome;
 *
 * Why only three functions: the middle of a drill is already solved. `answerDrill` from
 * `@engine/drill` is published, pure, and folds mastery at `MASTERY_RATE_RANGE` itself — the
 * screen calls it directly, exactly as it calls the duel reducer. What the engine cannot do is
 * (a) decide WHICH skills an island lets you drill, (b) find that skill's authored template pool,
 * and (c) write the result onto the captain. Those three are this module, and that is the whole
 * of it. Anything more is the second duel screen PLAN.md cut.
 *
 * Why `openDrill` takes the whole `Captain`: the session's `mastery` must be SEEDED from the
 * captain's stored meter, not from zero. A drill that starts every session at an empty meter shows
 * a child a bar that resets each time they practise, and — worse — makes `commitDrill` and the
 * session disagree about where the meter ended up. Several tests below pin that agreement directly.
 *
 * Why `openDrill` needs no `templates` argument: T-019's registry is still backlog, so the pool has
 * to be resolved from the authored `src/content/templates/*.json` for the skill. That resolution is
 * this module's job — a drillable skill with no reachable pool throws `NO_TEMPLATE` out of T-007 on
 * open, which is a screen that cannot ask a question. AC-1's second test walks every island's
 * `rangeSkills` and demands a real question back, so the loader cannot be stubbed.
 *
 * Why commits are remembered PER STORE: same reason as A-008's duel ledger. React re-renders,
 * effects fire twice under StrictMode, and a completed session can be observed many times. Anything
 * applied per OBSERVATION double-fills the meter — and a meter that fills twice as fast as the
 * tuning says is exactly the bug AC-2 exists to prevent, arriving through the back door.
 *
 * NOT ASSERTED HERE (posture-gated, `.tdd-swarm/posture.md`): anything requiring `app/range.tsx` to
 * render. The buoy, the reused `QuestionPanel`, and the meter's visual fill are design-fidelity
 * checks, verified by screenshot against the named board — not frozen tests.
 */
import { describe, expect, it } from 'vitest';

import { cannons, islands } from '@content/index';
import type { CannonId, IslandId, SkillId } from '@content/schemas';
import { answerDrill, type DrillSession } from '@engine/drill';
import { applyAnswer, emptyMastery, meterPercent } from '@engine/mastery';
import type { Question } from '@engine/questions/types';
import { createRng, type Rng } from '@engine/rng';
import {
  CHOICE_COUNT,
  MASTERY_METER_MAX,
  MASTERY_MIN_ACCURACY,
  MASTERY_RATE_DUEL,
  MASTERY_RATE_RANGE,
  MASTERY_THRESHOLD_CORRECT,
} from '@engine/tuning';

import { chartNodes } from '../../src/services/chart';
import {
  commitDrill as commitDrillUnderTest,
  openDrill as openDrillUnderTest,
  rangeSkills as rangeSkillsUnderTest,
  type RangeDrillOutcome,
} from '../../src/services/range';
import { createCaptainStore, emptyCaptain, type Captain, type CaptainStore } from '../../src/stores/player';

// =============================================================================================
// Signature pins (honest RED typecheck — LESSONS.md L-024)
//
// A test that only calls the module can go green against a function with the wrong arity or the
// wrong argument order. Pinning the signatures to explicitly-typed consts makes the typecheck part
// of the contract, so a mismatched implementation fails `tsc` as well as vitest.
// =============================================================================================

const rangeSkills: (islandId: IslandId) => readonly SkillId[] = rangeSkillsUnderTest;

const openDrill: (input: {
  readonly islandId: IslandId;
  readonly skillId: SkillId;
  readonly captain: Captain;
  readonly rng: Rng;
  readonly length?: number;
}) => DrillSession = openDrillUnderTest;

const commitDrill: (store: CaptainStore, session: DrillSession) => RangeDrillOutcome = commitDrillUnderTest;

// =============================================================================================
// Fixtures — every number derived from tuning or the catalog, never invented
// =============================================================================================

/** Isla Products trains exactly one skill, so its unlock chain is unambiguous (see below). */
const ISLAND: IslandId = 'isla_products';
const SKILL: SkillId = 'mult_facts';
const SEED = 9_009;
const ELAPSED_MS = 1_000;

/** Correct answers needed to cross the mastery threshold at the RANGE rate. Derived, not typed in. */
const NEEDED = Math.ceil(MASTERY_THRESHOLD_CORRECT / MASTERY_RATE_RANGE);

/** A short drill that cannot cross the threshold — for rate assertions free of unlock side effects. */
const SHORT = Math.max(1, Math.floor(NEEDED / 2));

/** The cannon `SKILL` unlocks at the range, and the island whose fog `ISLAND` lifts. Both derived. */
const UNLOCKED_CANNON: CannonId = cannons.find((c) => c.unlock.kind === 'range' && c.skill === SKILL)!.id;
const NEXT_ISLAND: IslandId = islands.find((i) => i.requiresIsland === ISLAND)!.id;

type AnswerPlan = (question: Question, index: number) => number | null;

const allCorrect: AnswerPlan = (q) => q.correctIndex;
const allWrong: AnswerPlan = (q) => (q.correctIndex + 1) % CHOICE_COUNT;
const firstNCorrect =
  (n: number): AnswerPlan =>
  (q, i) =>
    i < n ? q.correctIndex : (q.correctIndex + 1) % CHOICE_COUNT;

/** Drives a live session to completion through the real engine, one answer per question. */
function runDrill(session: DrillSession, plan: AnswerPlan): DrillSession {
  let s = session;
  let i = 0;
  while (!s.complete) {
    expect(s.current, 'a live drill must always carry a question').not.toBeNull();
    s = answerDrill(s, plan(s.current!, i), ELAPSED_MS);
    i += 1;
  }
  return s;
}

function open(captain: Captain, length: number, over: { islandId?: IslandId; skillId?: SkillId } = {}) {
  return openDrill({
    islandId: over.islandId ?? ISLAND,
    skillId: over.skillId ?? SKILL,
    captain,
    rng: createRng(SEED),
    length,
  });
}

/** A captain already standing on `ISLAND` — the state the range screen is entered from. */
function atIsland(over: Partial<Captain> = {}): Captain {
  return {
    ...emptyCaptain(),
    // A-027: openDrill refuses null/corrupt gradeBand. Isla Products' mult_facts needs ≤ band max 3.
    gradeBand: 'g2_3',
    unlockedIslands: ['port_sumwich', ISLAND],
    currentIsland: ISLAND,
    ...over,
  };
}

/** Folds `n` correct answers at the DUEL rate — the comparison baseline AC-2 is measured against. */
function duelFold(n: number) {
  let m = emptyMastery;
  for (let i = 0; i < n; i += 1) m = applyAnswer(m, 'duel', true);
  return m;
}

// =============================================================================================
// AC-1 — an island's `rangeSkills` are exactly what is drillable there
// =============================================================================================

describe('A-009 gunnery range — what is drillable', () => {
  it('spec(A-009:AC-1) the drillable skills of an island are exactly its catalog rangeSkills', () => {
    for (const island of islands) {
      // Exact set equality, in catalog order: a superset lets a child grind a skill the island does
      // not teach, and a subset silently strands the cannon that skill unlocks.
      expect([...rangeSkills(island.id)], `island ${island.id}`).toEqual([...island.rangeSkills]);
    }
  });

  it('spec(A-009:AC-1) every drillable skill on every island opens a real question of that skill', () => {
    // A-027 ceilings openDrill by gradeBand; use the top band so every catalog skill is eligible.
    const captain = { ...emptyCaptain(), gradeBand: 'g4_5' as const };
    for (const island of islands) {
      for (const skill of island.rangeSkills) {
        const session = open(captain, 3, { islandId: island.id, skillId: skill });
        expect(session.skillId, `${island.id}/${skill}`).toBe(skill);
        // A skill listed as drillable whose template pool cannot be reached throws NO_TEMPLATE out
        // of T-007 on open — a range screen with nothing to ask. This is the loader's frozen test.
        expect(session.current, `${island.id}/${skill} produced no question`).not.toBeNull();
        expect(session.current?.skill).toBe(skill);
        expect(session.current?.choices).toHaveLength(CHOICE_COUNT);
      }
    }
  });

  it('spec(A-009:AC-1) a skill this island does not train is refused, not quietly drilled', () => {
    // `mult_facts` is real, and drillable — at Isla Products, not at Port Sumwich.
    expect(rangeSkills('port_sumwich')).not.toContain(SKILL);
    expect(() => open(atIsland(), SHORT, { islandId: 'port_sumwich', skillId: SKILL })).toThrow(/mult_facts/);
  });
});

// =============================================================================================
// AC-2 — the full rate, and its declared relationship to the duel rate
//
// Re-baselined 2026-08-02: the owner's 2026-07-30 ruling (recorded on MASTERY_RATE_DUEL,
// src/engine/tuning.ts:189-191) set duel answers to the FULL rate — range:duel is now 1:1.
// The range's edge is focus, not arithmetic: ten reps on ONE chosen skill. What these specs
// protect is unchanged — the range may not invent its own rate, and the meter must agree with
// the store. An assertion that merely says "mastery went up" would still pass the single most
// likely wrong implementation, so every test here still pins the RELATIONSHIP.
// =============================================================================================

describe('A-009 gunnery range — the full fill rate', () => {
  it('spec(A-009:AC-2) the range rate equals the duel rate, exactly as tuning declares', () => {
    // Pinned so a tuning retune that silently reintroduces a rate split reopens this ruling
    // deliberately rather than as a mysterious pacing regression three screens away.
    expect(MASTERY_RATE_RANGE).toBeCloseTo(MASTERY_RATE_DUEL, 10);
    expect(MASTERY_RATE_DUEL).toBeGreaterThan(0);
  });

  it('spec(A-009:AC-2) each correct answer moves the live meter by the full rate, never the duel rate', () => {
    let session = open(atIsland(), SHORT, {});
    for (let k = 1; k <= SHORT; k += 1) {
      session = answerDrill(session, session.current!.correctIndex, ELAPSED_MS);
      expect(session.mastery.weightedCorrect, `after ${k} correct`).toBeCloseTo(k * MASTERY_RATE_RANGE, 10);
      // Same k answers taken in a duel are worth exactly the same since the 2026-07-30 ruling.
      // Stated as the comparison, not a literal, so the test says what the rates say.
      expect(session.mastery.weightedCorrect).toBeCloseTo(duelFold(k).weightedCorrect, 10);
      expect(session.mastery.correct).toBe(k);
      expect(session.mastery.attempts).toBe(k);
    }
  });

  it('spec(A-009:AC-2) a committed range drill is worth exactly the same answers duelled', () => {
    const rangeStore = createCaptainStore(atIsland());
    const duelStore = createCaptainStore(atIsland());

    const session = runDrill(open(rangeStore.getState().captain, SHORT), allCorrect);
    commitDrill(rangeStore, session);
    // The identical answer record, taken in a duel instead of at the range.
    duelStore.getState().recordDuelAnswers(SKILL, { correct: SHORT, asked: SHORT });

    const ranged = rangeStore.getState().captain.mastery[SKILL];
    const duelled = duelStore.getState().captain.mastery[SKILL];
    expect(ranged).toBeDefined();
    expect(duelled).toBeDefined();

    // 1:1 with the duel since the 2026-07-30 ruling (tuning.ts:189-191).
    expect(ranged!.weightedCorrect).toBeCloseTo(duelled!.weightedCorrect, 10);
    expect(ranged!.weightedCorrect).toBeCloseTo(SHORT * MASTERY_RATE_RANGE, 10);
    // The raw counters are the SAME answers — only the weighting differs. If these drift, the
    // range is inflating accuracy rather than fill rate, which hollows out the mastery gate.
    expect(ranged!.correct).toBe(duelled!.correct);
    expect(ranged!.attempts).toBe(duelled!.attempts);
  });

  it('spec(A-009:AC-2) the rendered 0-100 meter moves exactly as far as the duelled one', () => {
    const rangeStore = createCaptainStore(atIsland());
    const duelStore = createCaptainStore(atIsland());

    const session = runDrill(open(rangeStore.getState().captain, SHORT), allCorrect);
    const outcome = commitDrill(rangeStore, session);
    duelStore.getState().recordDuelAnswers(SKILL, { correct: SHORT, asked: SHORT });

    const rangedPercent = meterPercent(rangeStore.getState().captain.mastery[SKILL]!);
    const duelledPercent = meterPercent(duelStore.getState().captain.mastery[SKILL]!);
    // Guard the comparison: at the clamp both would read 100 and the 2:1 test would pass on a
    // duel-rate implementation. `SHORT` is half the threshold, so neither reaches the ceiling.
    expect(rangedPercent).toBeLessThan(MASTERY_METER_MAX);
    // 1:1 with the duel since the 2026-07-30 ruling (tuning.ts:189-191).
    expect(rangedPercent).toBe(duelledPercent);
    // The screen draws the meter from the outcome; it must agree with the store it just wrote.
    expect(outcome.meterPercent).toBe(rangedPercent);
  });
});

// =============================================================================================
// AC-3 — the mastery gained persists
// =============================================================================================

describe('A-009 gunnery range — the gain persists', () => {
  it('spec(A-009:AC-3) the committed captain mastery equals the finished session exactly', () => {
    const store = createCaptainStore(atIsland());
    // Prior duel practice on the same skill: the drill must be SEEDED from it and must add to it,
    // not replace it and not double-count it.
    store.getState().recordDuelAnswers(SKILL, { correct: 3, asked: 4 });
    const seeded = store.getState().captain.mastery[SKILL]!;

    const session = runDrill(open(store.getState().captain, SHORT), allCorrect);
    expect(session.mastery.weightedCorrect).toBeCloseTo(
      seeded.weightedCorrect + SHORT * MASTERY_RATE_RANGE,
      10,
    );

    const outcome = commitDrill(store, session);
    expect(outcome.applied).toBe(true);
    expect(outcome.skillId).toBe(SKILL);
    expect(outcome.correct).toBe(SHORT);
    expect(outcome.asked).toBe(SHORT);

    // The single strongest statement of this AC: what the meter showed at the last question is what
    // the captain is left holding. A mismatch means the screen lied about the drill just finished.
    expect(store.getState().captain.mastery[SKILL]).toEqual(session.mastery);
  });

  it('spec(A-009:AC-3) the gain survives serialisation into a fresh store', () => {
    const store = createCaptainStore(atIsland());
    const session = runDrill(open(store.getState().captain, SHORT), allCorrect);
    commitDrill(store, session);

    // Mastery is persisted as part of the captain document (ARCHITECTURE.md §5). A gain that cannot
    // round-trip through JSON is a gain the child loses on relaunch — which is no gain at all.
    const revived = JSON.parse(JSON.stringify(store.getState().captain)) as Captain;
    const fresh = createCaptainStore(revived);
    expect(fresh.getState().captain.mastery[SKILL]).toEqual(session.mastery);
  });

  it('spec(A-009:AC-3) a finished session is committed exactly once, however often it is observed', () => {
    const store = createCaptainStore(atIsland());
    const session = runDrill(open(store.getState().captain, SHORT), allCorrect);

    const first = commitDrill(store, session);
    expect(first.applied).toBe(true);
    const after = store.getState().captain.mastery[SKILL];

    // A re-render, a StrictMode double-effect, a back-navigation onto the summary — all of these
    // hand the same finished session over again. None of them may fill the meter a second time.
    const second = commitDrill(store, session);
    expect(second.applied).toBe(false);
    expect(second.correct).toBe(0);
    expect(second.asked).toBe(0);
    expect(store.getState().captain.mastery[SKILL]).toEqual(after);
  });

  it('spec(A-009:AC-3) an unfinished drill commits nothing and does not consume its one commit', () => {
    const store = createCaptainStore(atIsland());
    const live = open(store.getState().captain, SHORT);
    expect(live.complete).toBe(false);

    const early = commitDrill(store, live);
    expect(early.applied).toBe(false);
    expect(store.getState().captain.mastery[SKILL]).toBeUndefined();

    // The screen will observe the session mid-drill. Burning the commit there would mean the drill
    // finishes and pays nothing — the A-008 failure mode, in a new place.
    const finished = runDrill(live, allCorrect);
    const outcome = commitDrill(store, finished);
    expect(outcome.applied).toBe(true);
    expect(store.getState().captain.mastery[SKILL]).toEqual(finished.mastery);
  });
});

// =============================================================================================
// AC-4 — crossing the threshold unlocks the cannon AND lifts the next island's fog
// =============================================================================================

describe('A-009 gunnery range — the meter unlocks the next cannon', () => {
  it('spec(A-009:AC-4) crossing the threshold at full accuracy fires the cannon unlock and lifts the fog', () => {
    const store = createCaptainStore(atIsland());

    const before = chartNodes(store.getState().captain);
    expect(before.find((n) => n.island.id === NEXT_ISLAND)?.fogged).toBe(true);
    expect(store.getState().captain.ownedCannons).not.toContain(UNLOCKED_CANNON);

    const session = runDrill(open(store.getState().captain, NEEDED), allCorrect);
    const outcome = commitDrill(store, session);

    // Both halves of the checklist item, in one assertion set — the cannon a child can now fire,
    // and the island they can now sail to. Either one alone is half a reward.
    expect(outcome.applied).toBe(true);
    expect(outcome.mastered).toBe(true);
    expect(outcome.unlockedCannons).toContain(UNLOCKED_CANNON);
    expect(outcome.unlockedIslands).toContain(NEXT_ISLAND);

    const captain = store.getState().captain;
    expect(captain.ownedCannons).toContain(UNLOCKED_CANNON);
    expect(captain.unlockedIslands).toContain(NEXT_ISLAND);

    const after = chartNodes(captain);
    expect(after.find((n) => n.island.id === NEXT_ISLAND)?.fogged).toBe(false);
  });

  it('spec(A-009:AC-4) the threshold reached BELOW the accuracy floor unlocks nothing', () => {
    // Enough weighted corrects, deliberately sloppy: `NEEDED` right out of `2 * NEEDED` asked is
    // 50% accuracy. Derived guard — the fixture only means what it says while the floor is above a
    // coin flip.
    expect(0.5).toBeLessThan(MASTERY_MIN_ACCURACY);

    const store = createCaptainStore(atIsland());
    const session = runDrill(open(store.getState().captain, NEEDED * 2), firstNCorrect(NEEDED));
    expect(session.correct).toBe(NEEDED);

    const outcome = commitDrill(store, session);
    expect(store.getState().captain.mastery[SKILL]!.weightedCorrect).toBeGreaterThanOrEqual(
      MASTERY_THRESHOLD_CORRECT,
    );
    expect(outcome.mastered).toBe(false);
    expect(outcome.unlockedCannons).toEqual([]);
    expect(outcome.unlockedIslands).toEqual([]);
    expect(store.getState().captain.ownedCannons).not.toContain(UNLOCKED_CANNON);
    expect(chartNodes(store.getState().captain).find((n) => n.island.id === NEXT_ISLAND)?.fogged).toBe(true);
  });

  it('spec(A-009:AC-4) a drill short of the threshold unlocks nothing, and re-crossing grants nothing twice', () => {
    const store = createCaptainStore(atIsland());

    const partial = runDrill(open(store.getState().captain, SHORT), allCorrect);
    const first = commitDrill(store, partial);
    expect(first.mastered).toBe(false);
    expect(first.unlockedCannons).toEqual([]);
    expect(first.unlockedIslands).toEqual([]);

    const crossing = runDrill(open(store.getState().captain, NEEDED), allCorrect);
    const second = commitDrill(store, crossing);
    expect(second.unlockedCannons).toContain(UNLOCKED_CANNON);

    // Drilling on past mastery is a thing children do. The delta must go empty, and the owned list
    // must not grow — otherwise every extra drill re-grants the same gun.
    const owned = [...store.getState().captain.ownedCannons];
    const again = runDrill(open(store.getState().captain, NEEDED), allCorrect);
    const third = commitDrill(store, again);
    expect(third.applied).toBe(true);
    expect(third.unlockedCannons).toEqual([]);
    expect(third.unlockedIslands).toEqual([]);
    expect(store.getState().captain.ownedCannons).toEqual(owned);
    expect(new Set(owned).size).toBe(owned.length);
  });
});

// =============================================================================================
// AC-5 — practice cannot cost anything
//
// This is a pedagogy guarantee, not a nicety. A child who is told the range is safe and then loses
// a rank for guessing has been lied to by the software. The whole captain is diffed here: a violation
// names the exact field that moved.
// =============================================================================================

describe('A-009 gunnery range — practice costs nothing', () => {
  /** Every captain field except `mastery` that differs between two snapshots. */
  function changedFields(before: Captain, after: Captain): string[] {
    return (Object.keys(after) as (keyof Captain)[])
      .filter((key) => JSON.stringify(after[key]) !== JSON.stringify(before[key]))
      .map((key) => String(key));
  }

  /** A captain with something to lose: coins in the purse, wins and a rank on the books. */
  const wealthy = () => atIsland({ coins: 50, wins: 3, rankTier: 2, ownedCannons: ['swivel_gun'] });

  it('spec(A-009:AC-5) a drill answered entirely wrong touches nothing but the mastery record', () => {
    const store = createCaptainStore(wealthy());
    const before = store.getState().captain;

    const session = runDrill(open(before, NEEDED), allWrong);
    expect(session.correct).toBe(0);
    const outcome = commitDrill(store, session);
    expect(outcome.applied).toBe(true);

    const after = store.getState().captain;
    // Named explicitly so a regression reads as the promise it broke, not as a diff.
    expect(after.coins, 'a wrong answer at the range cost coins').toBe(before.coins);
    expect(after.wins, 'a wrong answer at the range changed the win count').toBe(before.wins);
    expect(after.rankTier, 'a wrong answer at the range cost rank').toBe(before.rankTier);
    expect(after.ownedCannons, 'a wrong answer at the range took a cannon').toEqual(before.ownedCannons);
    expect(after.unlockedIslands).toEqual(before.unlockedIslands);

    // And nothing else moved either — the catch-all, so a field added later is covered by default.
    expect(changedFields(before, after)).toEqual(['mastery']);

    // No hull, anywhere. The range is a buoy: there is nothing shooting back, so there is nothing
    // for a wrong answer to damage.
    expect(session).not.toHaveProperty('hull');
    expect(session).not.toHaveProperty('enemyHull');

    // The meter must not go BACKWARDS either. A wrong answer costs an attempt, never a fill.
    const m = after.mastery[SKILL]!;
    expect(m.weightedCorrect).toBe(0);
    expect(m.correct).toBe(0);
    expect(m.attempts).toBe(NEEDED);
  });

  it('spec(A-009:AC-5) a timed-out answer is free under D-8 / T-036 (does not complete the drill)', () => {
    const store = createCaptainStore(wealthy());
    const before = store.getState().captain;
    let session = open(before, SHORT);
    const questionBefore = session.current;

    // Timeouts no longer advance `answered`, so runDrill(allTimedOut) would loop forever.
    for (let i = 0; i < SHORT; i += 1) {
      session = answerDrill(session, null, ELAPSED_MS);
    }

    expect(session.complete).toBe(false);
    expect(session.answered).toBe(0);
    expect(session.correct).toBe(0);
    expect(session.current).toEqual(questionBefore);

    const outcome = commitDrill(store, session);
    expect(outcome.applied).toBe(false);

    const after = store.getState().captain;
    expect(after.coins).toBe(before.coins);
    expect(after.wins).toBe(before.wins);
    expect(after.rankTier).toBe(before.rankTier);
    expect(changedFields(before, after)).toEqual([]);
    expect(after.mastery[SKILL]).toEqual(before.mastery[SKILL]);
  });

  it('spec(A-009:AC-5) wrong answers mixed into a good drill subtract nothing from what was earned', () => {
    const store = createCaptainStore(wealthy());
    const before = store.getState().captain;

    const length = SHORT * 2;
    const session = runDrill(open(before, length), firstNCorrect(SHORT));
    commitDrill(store, session);

    const after = store.getState().captain;
    expect(after.coins).toBe(before.coins);
    expect(after.wins).toBe(before.wins);
    expect(after.rankTier).toBe(before.rankTier);
    expect(changedFields(before, after)).toEqual(['mastery']);

    // The corrects are worth full rate; the misses cost attempts and nothing else.
    const m = after.mastery[SKILL]!;
    expect(m.weightedCorrect).toBeCloseTo(SHORT * MASTERY_RATE_RANGE, 10);
    expect(m.correct).toBe(SHORT);
    expect(m.attempts).toBe(length);
  });
});
