/**
 * A-016 — what a duel IS.
 *
 * `src/stores/duel.ts` shipped without a ticket. A-008 says what a duel is *worth* afterwards;
 * nothing anywhere said what happens inside one. This file is that contract, written against the
 * criteria rather than against the code, so it can go red on the machine it describes.
 *
 * Nothing here renders a screen. `app/duel.tsx` imports React Native, whose entry point is
 * Flow-typed and unparseable by the node runner, so AC-1's clause about the tray is asserted
 * against the captain store and the pure `trayCannons` selector — the same module the screen calls.
 *
 * ── The traps deliberately closed ─────────────────────────────────────────────────────────────
 *
 *  1. **Both starters share one skill.** `swivel_gun` and `culverin` are both `add_within_10`, so
 *     a reducer with that skill hardcoded passes any starters-only test of AC-1. This is L-020's
 *     shape exactly — two things that agree today, and a test that measures the coincidence. The
 *     skill assertions therefore sweep the WHOLE catalog, where the nine skills genuinely differ.
 *  2. **Their damage bands nest.** `swivel_gun` is 8–12 and `culverin` is 4–16, so every legal
 *     swivel roll is also a legal culverin roll: "the damage is inside the picked gun's band"
 *     cannot catch a reducer that fired the culverin when the swivel was tapped. The band check
 *     runs in the discriminating direction (the narrow gun), and is backed by an identity pin on
 *     `state.cannon` and an equality pin against `resolveShot`'s own return.
 *  3. **Re-deriving the engine is not asserting delegation.** Recomputing the damage curve here
 *     would put the same rule in two places with two owners, and would pass a reducer that
 *     re-derived it too. AC-3 instead pins `state.outcome` and `state.rng` to exactly what
 *     `resolveShot` returns for the same inputs, and AC-6 pins `state.coins` to
 *     `computeCoinPayout`'s. If the engine's formula moves, these follow it; a copy would not.
 *  4. **"Unchanged state or a declared phase" is satisfied by `return s`.** A machine that never
 *     moves passes AC-5's literal wording. So the walk also proves every declared phase is
 *     REACHABLE and that every non-terminal phase has an exit, and the phase list itself is
 *     compiler-checked for completeness (`everyMemberOf`) rather than hand-maintained.
 *  5. **Monotonicity is not two sampled points.** AC-3 sweeps the whole answer window at 1/64
 *     resolution plus overruns past the fuse, and pairs the direction with an effect size
 *     (L-006): the fastest answer must be strictly better than the slowest, not merely not worse.
 *  6. **Sums over an empty tally are trivially equal.** AC-8's `0 === 0` is passed by a reducer
 *     that counts nothing, so every sum assertion is paired with a non-vacuity check that the
 *     corpus really fired two skills, timed out, missed and landed perfect shots.
 *  7. **A final-state replay check cannot see a clock read on turn two.** AC-7 compares EVERY
 *     intermediate state, whole-object, and additionally proves purity behaviourally by poisoning
 *     `Math.random`, `Date` and `performance.now` before driving a duel — the engine's lint ban is
 *     scoped to `src/engine/**` and does not cover this reducer at all (L-022).
 *  8. **`Math.max(0, …)` on one hull passes a test that watches the other.** AC-6's bounds are
 *     checked on both hulls, on every intermediate state of every generated trace, which is also
 *     what makes a `NaN` hull — "a fight that never ends" — observable.
 *
 * ── Deliberate scope boundaries ───────────────────────────────────────────────────────────────
 *
 * The AC-5 walk carries only WELL-FORMED durations (finite, `>= 0`, including overruns past the
 * fuse). `resolveShot` rejects `NaN`/`Infinity`/negative `elapsedMs` with a `RangeError` by design
 * — a silent `NaN` hull is the failure it exists to prevent — and the reducer propagates it. That
 * is input validation, not the soft-lock class AC-5 is about, so it is measured and reported
 * rather than pinned here.
 *
 * The timeout and misfire path belongs to A-017; `TIMEOUT` appears below only where AC-5 and AC-8
 * require it. Rewards belong to A-008, whose suite drives the same reducer — that file pins the
 * two-cannon exemplar of a per-skill tally, this one pins the invariant over generated logs.
 */
import { describe, expect, it } from 'vitest';

import { cannons } from '@content/index';
import type { Cannon, GradeBand, SkillId } from '@content/schemas';
import { GRADE_BANDS } from '@content/schemas';
import { resolveShot } from '@engine/duel/damage';
import { computeCoinPayout } from '@engine/economy';
import { createRng, nextFloat } from '@engine/rng';
import {
  CHOICE_COUNT,
  ENEMY_HULL_BY_ISLAND,
  PERFECT_SHOT_TIMER_FRACTION,
  PLAYER_HULL,
} from '@engine/tuning';

import { trayCannons } from '../../src/services/loadout';
import { nextQuestion, type DuelQuestion } from '../../src/services/questions';
import { TEMPLATE_POOLS } from '../../src/services/templatePools';
import {
  duelReducer,
  initialDuelState,
  PHASE_DURATION_MS,
  type DuelAction,
  type DuelPhase,
  type DuelState,
} from '../../src/stores/duel';
import { createCaptainStore } from '../../src/stores/player';

// ── The declared machine ─────────────────────────────────────────────────────────────────────

/**
 * A runtime list of a string union that the COMPILER refuses unless it is complete: when a member
 * is missing, `Exclude<…>` stops being `never`, the parameter type collapses to `never`, and the
 * call site fails `tsc`. So adding a phase to `DuelPhase` cannot silently shrink the AC-5 walk.
 */
function everyMemberOf<Union extends string>() {
  return <List extends readonly Union[]>(
    list: List & ([Exclude<Union, List[number]>] extends [never] ? unknown : never),
  ): readonly Union[] => list;
}

/** Every screen the duel can be showing. Completeness is enforced by the compiler, above. */
const DUEL_PHASES = everyMemberOf<DuelPhase>()([
  'select',
  'question',
  'perfect',
  'fly',
  'impact',
  'miss',
  'timeout',
  'watch',
  'rivalFly',
  'rivalImpact',
  'victory',
  'defeat',
] as const);

/** The two phases a duel is allowed to sit in forever. Everything else must have a way out. */
const TERMINAL_PHASES: readonly DuelPhase[] = ['victory', 'defeat'];

const isTerminal = (phase: DuelPhase): boolean => TERMINAL_PHASES.includes(phase);

/** Every action the screen can dispatch. Completeness enforced by the compiler, as above. */
const DUEL_ACTION_TYPES = everyMemberOf<DuelAction['type']>()([
  'PICK_CANNON',
  'ANSWER',
  'TIMEOUT',
  'ADVANCE',
  'OPEN_CHEST',
  'RESET',
] as const);

// ── Fixtures, all derived from the catalog and from tuning ───────────────────────────────────

/** The guns placement actually grants (owner ruling D-6). Derived — never a written-down pair. */
const STARTERS: readonly Cannon[] = cannons.filter((c) => c.unlock.kind === 'starter');

/** The reliable starter: the narrow band, and therefore the discriminating one. */
const RELIABLE_STARTER = requireCannon(
  STARTERS.find((c) => c.temperament === 'reliable'),
  'a reliable starter',
);

/** The volatile starter: the wide band that nests the reliable one. */
const VOLATILE_STARTER = requireCannon(
  STARTERS.find((c) => c.temperament === 'volatile'),
  'a volatile starter',
);

/**
 * The only gun in the catalog whose recoil path is live. `culverin` ships `recoilDamage: 0`, so
 * `damageToSelf` is dead at K-1 and a starters-only AC-4 could never observe it.
 */
const RECOIL_GUN = requireCannon(
  cannons.find((c) => c.temperament === 'volatile' && c.recoilDamage > 0),
  'a volatile cannon that bites its own deck',
);

/** Template ids per skill, so "drawn for that cannon's skill" is checkable against the pools. */
const TEMPLATE_IDS_BY_SKILL: ReadonlyMap<SkillId, ReadonlySet<string>> = new Map(
  Object.entries(TEMPLATE_POOLS).map(([skill, pool]) => [
    skill as SkillId,
    new Set(pool.map((t) => t.id)),
  ]),
);

/** Fixed seeds. Everything in this file is a function of these and of `elapsedMs`. */
const CATALOG_SEEDS: readonly number[] = [7, 1_009, 65_537];
const LOG_SEEDS: readonly number[] = Array.from({ length: 24 }, (_, i) => 2_016 + i * 101);
const WALK_SEEDS: readonly number[] = [3, 4, 8, 10, 41];

/** How many questions AC-1 draws in a row, so the recency window it checks against is not empty. */
const RECENT_DRAWS = 3;

/** How finely AC-3 samples the answer window, and how far past the fuse it keeps going. */
const SPEED_SAMPLES = 64;
const OVERRUN_FACTORS: readonly number[] = [1.5, 3];

/** Trace policy weights — properties of this harness, not of the game. */
const TIMEOUT_SHARE = 0.15;
const CORRECT_SHARE = 0.6;
const TRACE_STEP_CAP = 600;

function requireCannon(found: Cannon | undefined, what: string): Cannon {
  if (found === undefined) throw new Error(`duel-core fixtures: the catalog has no ${what}`);
  return found;
}

function requireQuestion(state: DuelState): DuelQuestion {
  if (state.question === null) throw new Error(`duel-core: phase '${state.phase}' carries no question`);
  return state.question;
}

function requireCannonOf(state: DuelState): Cannon {
  if (state.cannon === null) throw new Error(`duel-core: phase '${state.phase}' carries no cannon`);
  return state.cannon;
}

function wrongChoice(question: DuelQuestion): number {
  const wrong = question.choices.find((c) => c !== question.answer);
  if (wrong === undefined) throw new Error('duel-core: question offered no wrong choice');
  return wrong;
}

function askedWith(seed: number, cannon: Cannon): DuelState {
  return duelReducer(initialDuelState(seed), { type: 'PICK_CANNON', cannon });
}

/** Every `elapsedMs` AC-3 prices a shot at, ascending, including overruns past the fuse. */
function answerWindow(cannon: Cannon): readonly number[] {
  const points: number[] = [];
  for (let i = 0; i <= SPEED_SAMPLES; i += 1) {
    points.push(Math.round((i / SPEED_SAMPLES) * cannon.timerMs));
  }
  for (const factor of OVERRUN_FACTORS) points.push(Math.round(cannon.timerMs * factor));
  return points;
}

/** Reads a source file as text. The A-001 AC-7 pattern: some rules are only visible in the source. */
async function readSource(relative: string): Promise<string> {
  const fs = await import('node:fs/promises');
  return fs.readFile(new URL(relative, import.meta.url), 'utf8');
}

// ── Generated action logs ────────────────────────────────────────────────────────────────────

interface Trace {
  readonly seed: number;
  readonly log: readonly DuelAction[];
  /** `states[0]` is the initial state; `states[i + 1]` is `reduce(states[i], log[i])`. */
  readonly states: readonly DuelState[];
}

const TRACE_GUNS: readonly Cannon[] = [RELIABLE_STARTER, VOLATILE_STARTER, RECOIL_GUN];

/**
 * Plays one duel to a terminal phase under a seeded policy, recording every action and every
 * intermediate state. The policy draws from its OWN stream so the duel's stream is not the thing
 * choosing the duel's inputs — otherwise the replay property would be testing a fixed script.
 */
function generateTrace(seed: number): Trace {
  const log: DuelAction[] = [];
  let policy = createRng(seed);
  let state = initialDuelState(seed);
  const states: DuelState[] = [state];

  const draw = (): number => {
    const [value, next] = nextFloat(policy);
    policy = next;
    return value;
  };

  for (let step = 0; step < TRACE_STEP_CAP && !isTerminal(state.phase); step += 1) {
    const roll = draw();
    let action: DuelAction;

    if (state.phase === 'select') {
      const gun = TRACE_GUNS[Math.min(TRACE_GUNS.length - 1, Math.floor(roll * TRACE_GUNS.length))];
      if (gun === undefined) throw new Error('duel-core: trace has no gun to pick');
      action = { type: 'PICK_CANNON', cannon: gun };
    } else if (state.phase === 'question') {
      const question = requireQuestion(state);
      const speed = draw();
      action =
        roll < TIMEOUT_SHARE
          ? { type: 'TIMEOUT' }
          : {
              type: 'ANSWER',
              value: roll < CORRECT_SHARE ? question.answer : wrongChoice(question),
              elapsedMs: Math.floor(speed * requireCannonOf(state).timerMs),
            };
    } else {
      action = { type: 'ADVANCE' };
    }

    log.push(action);
    state = duelReducer(state, action);
    states.push(state);
  }

  if (!isTerminal(state.phase)) {
    throw new Error(`duel-core: trace ${seed} never terminated — stuck in phase '${state.phase}'`);
  }
  return { seed, log, states };
}

/** Replays a log from scratch, so "same seed, same log" can be compared state by state. */
function replay(trace: Trace): readonly DuelState[] {
  let state = initialDuelState(trace.seed);
  const states: DuelState[] = [state];
  for (const action of trace.log) {
    state = duelReducer(state, action);
    states.push(state);
  }
  return states;
}

const TRACES: readonly Trace[] = LOG_SEEDS.map(generateTrace);
const EVERY_STATE: readonly DuelState[] = TRACES.flatMap((t) => t.states);

/** Sample states per phase, harvested from the corpus — the inputs to the AC-5 product walk. */
const SAMPLES_PER_PHASE = 8;
const PHASE_SAMPLES: ReadonlyMap<DuelPhase, readonly DuelState[]> = (() => {
  const byPhase = new Map<DuelPhase, DuelState[]>();
  for (const state of EVERY_STATE) {
    const bucket = byPhase.get(state.phase) ?? [];
    if (bucket.length < SAMPLES_PER_PHASE) bucket.push(state);
    byPhase.set(state.phase, bucket);
  }
  return byPhase;
})();

/** Every well-formed action worth applying to `state` in the AC-5 walk, by action type. */
function walkActions(state: DuelState): readonly DuelAction[] {
  const cannon = state.cannon ?? RELIABLE_STARTER;
  const answer = state.question?.answer ?? 0;
  const miss = state.question === null ? answer + 1 : wrongChoice(state.question);
  const durations = [0, Math.round(cannon.timerMs / 2), cannon.timerMs, cannon.timerMs * 2];
  return [
    ...TRACE_GUNS.map((gun): DuelAction => ({ type: 'PICK_CANNON', cannon: gun })),
    ...durations.flatMap((elapsedMs): DuelAction[] => [
      { type: 'ANSWER', value: answer, elapsedMs },
      { type: 'ANSWER', value: miss, elapsedMs },
    ]),
    { type: 'TIMEOUT' },
    { type: 'ADVANCE' },
    { type: 'OPEN_CHEST' },
    { type: 'RESET' },
  ];
}

/**
 * The actions a CHILD can actually produce while a given phase is on screen — the honest reading of
 * AC-5's "a player input that leaves it".
 *
 * This is not the whole action union, and the difference is the whole point. `PICK_CANNON`,
 * `OPEN_CHEST` and `RESET` carry no phase guard in the reducer, so accepting any of them as an exit
 * would make EVERY phase escapable by construction and turn the soft-lock criterion into a
 * tautology — a lock is still a lock if the only key is an action the screen never offers. The
 * gating asserted here is `app/duel.tsx`'s own (the tray renders under `select`, the question panel
 * under `question`, and every other phase shows a panel with no control on it but "leave"), and the
 * test below re-reads that source so this map cannot drift away from the screen it describes.
 */
function screenActions(state: DuelState): readonly DuelAction[] {
  if (state.phase === 'select') {
    return TRACE_GUNS.map((gun): DuelAction => ({ type: 'PICK_CANNON', cannon: gun }));
  }
  if (state.phase === 'question') {
    const question = requireQuestion(state);
    const cannon = requireCannonOf(state);
    return [
      { type: 'ANSWER', value: question.answer, elapsedMs: 0 },
      { type: 'ANSWER', value: question.answer, elapsedMs: cannon.timerMs },
      { type: 'ANSWER', value: wrongChoice(question), elapsedMs: 0 },
      { type: 'TIMEOUT' },
    ];
  }
  return [];
}

/**
 * Poisons every ambient source of nondeterminism, runs `body`, and restores them. Behavioural,
 * not a lint claim: `no-restricted-globals`/`no-restricted-properties` are scoped to
 * `src/engine/**` and `src/content/**` and do not cover `src/stores/duel.ts` at all (L-022).
 */
function withoutAmbientSources<T>(body: () => T): T {
  const realRandom = Math.random;
  const realDate = globalThis.Date;
  const realNow = globalThis.performance.now;
  const boom = (what: string) => (): never => {
    throw new Error(`duel-core: the reducer reached ${what}`);
  };
  const PoisonedDate = boom('new Date()') as unknown as DateConstructor;
  (PoisonedDate as unknown as { now: () => number }).now = boom('Date.now()');

  Math.random = boom('Math.random()') as unknown as () => number;
  globalThis.Date = PoisonedDate;
  globalThis.performance.now = boom('performance.now()') as unknown as () => number;
  try {
    return body();
  } finally {
    Math.random = realRandom;
    globalThis.Date = realDate;
    globalThis.performance.now = realNow;
  }
}

// ── AC-1 — the gun you tapped is the gun that fires ──────────────────────────────────────────

describe('A-016 the duel itself', () => {
  it('spec(A-016:AC-1) the tray is the captain’s own equipped set, at every grade band', () => {
    // The bug this ticket exists to make impossible: `app/duel.tsx` shipped reading
    // `resolvePlacement('k_1')`, so grade 4–5 players were handed K-1 cannons. Sweeping every
    // band is the assertion a hardcoded band cannot survive.
    for (const band of GRADE_BANDS as readonly GradeBand[]) {
      const store = createCaptainStore();
      store.getState().setGradeBand(band);
      const captain = store.getState().captain;
      const tray = trayCannons(captain);

      expect(tray.map((c) => c.id)).toEqual(
        cannons.filter((c) => captain.equippedCannons.includes(c.id)).map((c) => c.id),
      );
      // "Two starter cannons that are a real choice" (PLAN.md checklist item 5) has to be true at
      // every band, not only the youngest one.
      expect(tray.length).toBeGreaterThanOrEqual(2);
      expect(new Set(tray.map((c) => c.id)).size).toBe(tray.length);
      for (const gun of tray) expect(gun.unlock.kind).toBe('starter');
    }
  });

  it('spec(A-016:AC-1) picking a tray gun arms exactly that gun — never a substitute', () => {
    const store = createCaptainStore();
    store.getState().setGradeBand('k_1');
    const tray = trayCannons(store.getState().captain);

    for (const gun of tray) {
      for (const seed of CATALOG_SEEDS) {
        const armed = askedWith(seed, gun);
        // Identity, not equality: a lookup that rebuilt an equal-looking cannon from a hardcoded
        // band would still be reading something other than what the child tapped.
        expect(armed.cannon).toBe(gun);
        expect(armed.phase).toBe('question');
      }
    }
  });

  it('spec(A-016:AC-1) the screen’s tray is fed from the captain’s loadout and from nothing else', async () => {
    // `app/duel.tsx` imports React Native, so it cannot be rendered under the node runner; the
    // source text is where this clause is observable (the A-001 AC-7 pattern). `gun-deck.test.ts`
    // pins the ABSENCE of the old `resolvePlacement('k_1')` read; this pins the positive wiring —
    // the tray the screen hands to `CannonTray` is the one `trayCannons` built from the captain.
    const src = await readSource('../../app/duel.tsx');
    expect(src).toMatch(/trayCannons\(captain\)/);
    expect(src).toMatch(/cannons=\{tray\}/);
    expect(src).toMatch(/dispatch\(\{ type: 'PICK_CANNON', cannon: picked \}\)/);
  });

  it('spec(A-016:AC-1) the question is drawn for the picked cannon’s own skill — swept across the catalog', () => {
    // Both starters are `add_within_10`, so a hardcoded skill passes any starters-only check
    // (L-020: a test whose subject and expectation agree by coincidence measures the coincidence).
    // The catalog sweep is where the nine skills actually differ.
    const skillsSeen = new Set<SkillId>();

    for (const cannon of cannons) {
      const ownPool = TEMPLATE_IDS_BY_SKILL.get(cannon.skill);
      if (ownPool === undefined) throw new Error(`duel-core: no template pool for '${cannon.skill}'`);
      skillsSeen.add(cannon.skill);

      for (const seed of CATALOG_SEEDS) {
        let before = initialDuelState(seed);

        // Three successive draws, not one. A fresh duel's recency window is EMPTY, so a reducer
        // that passed `[]` instead of `s.recentTemplateIds` is indistinguishable on the opening
        // question and only diverges once the window has something in it — L-020's coincidence,
        // and a survivor in the first mutation run of this file until the loop was added.
        for (let draw = 0; draw < RECENT_DRAWS; draw += 1) {
          const armed = duelReducer(before, { type: 'PICK_CANNON', cannon });
          const question = requireQuestion(armed);

          expect(ownPool.has(question.templateId)).toBe(true);
          for (const [skill, pool] of TEMPLATE_IDS_BY_SKILL) {
            if (skill === cannon.skill) continue;
            expect(pool.has(question.templateId), `${question.templateId} also lives in ${skill}`).toBe(
              false,
            );
          }

          // Delegation, not resemblance: the reducer must hand the picked cannon's skill and its
          // own recency window to the question adapter and keep what comes back, untouched.
          const [expected, rng] = nextQuestion(cannon.skill, before.rng, before.recentTemplateIds);
          expect(armed.question).toEqual(expected);
          expect(armed.rng).toEqual(rng);
          expect(armed.recentTemplateIds).toEqual([expected.templateId, ...before.recentTemplateIds]);
          before = armed;
        }

        expect(before.recentTemplateIds).toHaveLength(RECENT_DRAWS);
      }
    }

    // Non-vacuity: the sweep really did span more than one skill.
    expect(skillsSeen.size).toBeGreaterThan(1);
  });

  it('spec(A-016:AC-1) the volley is priced inside the picked cannon’s own damage band', () => {
    let narrowRolls = 0;
    let outsideNarrowBand = 0;

    for (const cannon of cannons) {
      for (const seed of CATALOG_SEEDS) {
        const armed = askedWith(seed, cannon);
        const question = requireQuestion(armed);
        for (const elapsedMs of answerWindow(cannon)) {
          const fired = duelReducer(armed, { type: 'ANSWER', value: question.answer, elapsedMs });
          const outcome = fired.outcome;
          if (outcome === null) throw new Error('duel-core: a resolved volley carries no outcome');

          expect(outcome.rollDamage).toBeGreaterThanOrEqual(cannon.damageMin);
          expect(outcome.rollDamage).toBeLessThanOrEqual(cannon.damageMax);

          if (cannon.id === RELIABLE_STARTER.id) narrowRolls += 1;
          if (
            cannon.id === VOLATILE_STARTER.id &&
            (outcome.rollDamage < RELIABLE_STARTER.damageMin ||
              outcome.rollDamage > RELIABLE_STARTER.damageMax)
          ) {
            outsideNarrowBand += 1;
          }
        }
      }
    }

    // The bands NEST — every legal swivel roll is also a legal culverin roll — so containment alone
    // cannot tell the two guns apart. These two counters prove the fixture discriminates in the one
    // direction that can: the wide gun really does roll outside the narrow gun's band.
    expect(narrowRolls).toBeGreaterThan(0);
    expect(outsideNarrowBand).toBeGreaterThan(0);
    expect(VOLATILE_STARTER.damageMin).toBeLessThan(RELIABLE_STARTER.damageMin);
    expect(VOLATILE_STARTER.damageMax).toBeGreaterThan(RELIABLE_STARTER.damageMax);
  });

  // ── AC-2 — four choices, the answer among them exactly once ────────────────────────────────

  it('spec(A-016:AC-2) every entry into ‘question’ carries exactly CHOICE_COUNT distinct choices', () => {
    // `CHOICE_COUNT`, never a literal 4 — a hardcoded count is the same bug the tray's hardcoded
    // slot count was in A-011, and it makes this file lie the day tuning changes.
    const seen = new Set<string>();

    const check = (state: DuelState): void => {
      expect(state.phase).toBe('question');
      const question = requireQuestion(state);
      expect(question.choices).toHaveLength(CHOICE_COUNT);
      expect(new Set(question.choices).size).toBe(CHOICE_COUNT);
      expect(question.choices.filter((c) => c === question.answer)).toHaveLength(1);
      for (const choice of question.choices) expect(Number.isFinite(choice)).toBe(true);
      expect(state.picked).toBeNull();
      seen.add(question.text);
    };

    for (const cannon of cannons) {
      for (const seed of CATALOG_SEEDS) {
        // The first entry, a later entry in the same duel, and the first entry after RESET —
        // "any transition into the question phase" is not only the opening one.
        const first = askedWith(seed, cannon);
        check(first);
        const second = duelReducer(first, { type: 'PICK_CANNON', cannon });
        check(second);
        check(duelReducer(duelReducer(second, { type: 'RESET' }), { type: 'PICK_CANNON', cannon }));
      }
    }

    // Non-vacuity: the assertions above ran against many DIFFERENT questions, not one constant.
    expect(seen.size).toBeGreaterThan(1);
  });

  it('spec(A-016:AC-2) no state anywhere in a generated log sits in ‘question’ without one', () => {
    let asked = 0;
    for (const state of EVERY_STATE) {
      if (state.phase !== 'question') continue;
      asked += 1;
      const question = requireQuestion(state);
      expect(question.choices).toHaveLength(CHOICE_COUNT);
      expect(question.choices.filter((c) => c === question.answer)).toHaveLength(1);
      expect(question.text.length).toBeGreaterThan(0);
      expect(question.templateId.length).toBeGreaterThan(0);
    }
    // Without this the loop above is satisfied by a corpus that never reaches `question` at all.
    expect(asked).toBeGreaterThan(TRACES.length);
  });

  // ── AC-3 — speed aims the shot, and the engine prices it ───────────────────────────────────

  it('spec(A-016:AC-3) a faster answer is never priced lower, across the whole answer window', () => {
    for (const cannon of cannons) {
      for (const seed of CATALOG_SEEDS) {
        const armed = askedWith(seed, cannon);
        const question = requireQuestion(armed);
        const window = answerWindow(cannon);

        let previous = Number.POSITIVE_INFINITY;
        for (const elapsedMs of window) {
          const fired = duelReducer(armed, { type: 'ANSWER', value: question.answer, elapsedMs });
          const damage = fired.outcome?.damageToEnemy ?? Number.NaN;
          // Same seed, same cannon, same answer: the only thing moving is the clock, so a later
          // answer must never buy MORE damage. Two sampled points cannot see a dip in between.
          expect(damage, `${cannon.id} dipped upward at ${elapsedMs}ms`).toBeLessThanOrEqual(previous);
          previous = damage;
        }

        // Direction is not the requirement — effect size is (L-006). A weight small enough to make
        // speed statistically invisible would satisfy monotonicity and fail this line.
        const fastest = duelReducer(armed, { type: 'ANSWER', value: question.answer, elapsedMs: 0 });
        const slowest = duelReducer(armed, {
          type: 'ANSWER',
          value: question.answer,
          elapsedMs: cannon.timerMs,
        });
        expect(fastest.outcome?.damageToEnemy).toBeGreaterThan(slowest.outcome?.damageToEnemy ?? 0);
      }
    }
  });

  it('spec(A-016:AC-3) an answer inside PERFECT_SHOT_TIMER_FRACTION of the fuse is a Perfect Shot', () => {
    for (const cannon of cannons) {
      const armed = askedWith(CATALOG_SEEDS[0] ?? 1, cannon);
      const question = requireQuestion(armed);
      const edge = PERFECT_SHOT_TIMER_FRACTION * cannon.timerMs;

      const inside = duelReducer(armed, { type: 'ANSWER', value: question.answer, elapsedMs: edge - 1 });
      const atEdge = duelReducer(armed, { type: 'ANSWER', value: question.answer, elapsedMs: edge });
      const missedFast = duelReducer(armed, {
        type: 'ANSWER',
        value: wrongChoice(question),
        elapsedMs: 0,
      });

      expect(inside.outcome?.perfectShot).toBe(true);
      expect(inside.phase).toBe('perfect');
      expect(inside.perfects).toBe(armed.perfects + 1);

      // The window is a fraction of the fuse, not a fixed number of milliseconds, and the boundary
      // itself is outside it.
      expect(atEdge.outcome?.perfectShot).toBe(false);
      expect(atEdge.phase).toBe('fly');
      expect(atEdge.perfects).toBe(armed.perfects);

      // Fast and wrong is not a Perfect Shot. Speed aims a shot; it does not replace the answer.
      expect(missedFast.outcome?.perfectShot).toBe(false);
      expect(missedFast.perfects).toBe(armed.perfects);
    }
  });

  it('spec(A-016:AC-3) every number in the volley is resolveShot’s, not this layer’s', () => {
    for (const cannon of cannons) {
      for (const seed of CATALOG_SEEDS) {
        const armed = askedWith(seed, cannon);
        const question = requireQuestion(armed);

        for (const correct of [true, false]) {
          const value = correct ? question.answer : wrongChoice(question);
          for (const elapsedMs of answerWindow(cannon)) {
            const fired = duelReducer(armed, { type: 'ANSWER', value, elapsedMs });
            const [outcome, rng] = resolveShot({ cannon, correct, elapsedMs, rng: armed.rng });

            // Whole-object equality against the engine's own return, rather than a re-derivation
            // of the damage curve here. A copy of the formula in this file would agree with the
            // reducer today and stop agreeing the moment T-031 retunes it — two owners, one rule.
            expect(fired.outcome).toEqual(outcome);
            // The advanced stream too: a reducer that priced the shot correctly and then threw
            // away the engine's `Rng` would desynchronise every later draw in the duel.
            expect(fired.rng).toEqual(rng);
          }
        }

        // ...and the hull the reducer takes off the rival is that same number, unmodified.
        const fired = duelReducer(armed, { type: 'ANSWER', value: question.answer, elapsedMs: 0 });
        const flying = fired.phase === 'perfect' ? duelReducer(fired, { type: 'ADVANCE' }) : fired;
        const landed = duelReducer(flying, { type: 'ADVANCE' });
        expect(landed.phase).toBe('impact');
        expect(landed.rivalHull).toBe(
          Math.max(0, flying.rivalHull - (fired.outcome?.damageToEnemy ?? Number.NaN)),
        );
      }
    }
  });

  // ── AC-4 — being wrong costs the turn, never permission to play ─────────────────────────────

  it('spec(A-016:AC-4) a wrong answer leaves the rival’s hull untouched, right through their reply', () => {
    for (const cannon of cannons) {
      const armed = askedWith(CATALOG_SEEDS[1] ?? 1, cannon);
      const question = requireQuestion(armed);
      const missed = duelReducer(armed, { type: 'ANSWER', value: wrongChoice(question), elapsedMs: 0 });

      expect(missed.phase).toBe('miss');
      expect(missed.outcome?.kind).toBe('misfire');
      expect(missed.outcome?.damageToEnemy).toBe(0);
      expect(missed.outcome?.perfectShot).toBe(false);

      // Not just at the moment of the miss: all the way through the rival's answering volley, which
      // is where a reducer that applied `rollDamage` on the wrong branch would show up.
      let state = missed;
      for (let step = 0; step < DUEL_PHASES.length && !isTerminal(state.phase); step += 1) {
        state = duelReducer(state, { type: 'ADVANCE' });
        expect(state.rivalHull, `${cannon.id} lost rival hull on a miss`).toBe(armed.rivalHull);
        if (state.phase === 'select') break;
      }
      expect(state.rivalHull).toBe(armed.rivalHull);
    }
  });

  it('spec(A-016:AC-4) the only damage a wrong answer does to the player is the engine’s damageToSelf', () => {
    for (const cannon of cannons) {
      const armed = askedWith(CATALOG_SEEDS[2] ?? 1, cannon);
      const question = requireQuestion(armed);
      const missed = duelReducer(armed, { type: 'ANSWER', value: wrongChoice(question), elapsedMs: 0 });
      const recoil = missed.outcome?.damageToSelf ?? Number.NaN;

      // Exactly the engine's number — not a rounded, doubled or floored version of it, and not a
      // recoil this layer decided to apply on its own.
      expect(missed.playerHull).toBe(Math.max(0, armed.playerHull - recoil));
      expect(recoil).toBe(cannon.temperament === 'volatile' ? cannon.recoilDamage : 0);
      // The rival's damage is a separate field and must not have been conflated with it.
      expect(missed.rivalDamage).toBe(armed.rivalDamage);
    }

    // Asserted on the one gun in the catalog whose recoil path is actually live, or the check above
    // is satisfied by every cannon carrying a zero.
    expect(RECOIL_GUN.recoilDamage).toBeGreaterThan(0);
    const armed = askedWith(WALK_SEEDS[0] ?? 1, RECOIL_GUN);
    const bitten = duelReducer(armed, {
      type: 'ANSWER',
      value: wrongChoice(requireQuestion(armed)),
      elapsedMs: 0,
    });
    expect(bitten.playerHull).toBe(armed.playerHull - RECOIL_GUN.recoilDamage);
  });

  it('spec(A-016:AC-4) being wrong costs the turn and hands back a fresh one — never the game', () => {
    const cannon = RELIABLE_STARTER;
    const armed = askedWith(CATALOG_SEEDS[0] ?? 1, cannon);
    const missed = duelReducer(armed, {
      type: 'ANSWER',
      value: wrongChoice(requireQuestion(armed)),
      elapsedMs: 0,
    });

    const visited: DuelPhase[] = [];
    let state = missed;
    for (let step = 0; step < DUEL_PHASES.length * 2 && state.phase !== 'select'; step += 1) {
      state = duelReducer(state, { type: 'ADVANCE' });
      visited.push(state.phase);
      if (isTerminal(state.phase)) break;
    }

    // The turn passes to the rival — and comes back.
    expect(visited).toContain('watch');
    expect(visited).toContain('rivalFly');
    expect(visited).toContain('rivalImpact');
    expect(state.phase).toBe('select');
    expect(state.turn).toBe(armed.turn + 1);
    // A fresh turn means a fresh choice of gun: nothing about the wrong answer is carried over.
    expect(state.cannon).toBeNull();
    expect(state.question).toBeNull();
    expect(state.picked).toBeNull();
    expect(state.playerHull).toBeGreaterThan(0);
  });

  // ── AC-5 — the machine cannot lock (ARCHITECTURE §9) ────────────────────────────────────────

  it('spec(A-016:AC-5) dod(A-016:4) every declared DuelPhase is reachable from ‘select’', () => {
    // "Declared" is the compiler's list, not a hand-written one: `DUEL_PHASES` fails `tsc` if it
    // omits a member of the union. A phase nothing can reach is dead UI; a phase list that
    // quietly shrank would hide one.
    const reached = new Set<DuelPhase>(EVERY_STATE.map((s) => s.phase));
    for (const seed of WALK_SEEDS) {
      for (const cannon of TRACE_GUNS) {
        for (const mode of ['fast', 'slow', 'wrong', 'timeout'] as const) {
          let state = initialDuelState(seed);
          for (let step = 0; step < TRACE_STEP_CAP && !isTerminal(state.phase); step += 1) {
            reached.add(state.phase);
            if (state.phase === 'select') {
              state = duelReducer(state, { type: 'PICK_CANNON', cannon });
            } else if (state.phase === 'question') {
              const question = requireQuestion(state);
              state =
                mode === 'timeout'
                  ? duelReducer(state, { type: 'TIMEOUT' })
                  : duelReducer(state, {
                      type: 'ANSWER',
                      value: mode === 'wrong' ? wrongChoice(question) : question.answer,
                      elapsedMs: mode === 'slow' ? cannon.timerMs : 0,
                    });
            } else {
              state = duelReducer(state, { type: 'ADVANCE' });
            }
          }
          reached.add(state.phase);
        }
      }
    }
    expect([...DUEL_PHASES].filter((p) => !reached.has(p))).toEqual([]);
  });

  it('spec(A-016:AC-5) every (phase × action) pair lands on a declared phase', () => {
    // Exhaustive over the product, not a reading of the switch. Every action type is applied to a
    // real state of every phase, and the coverage counters below are what stop this passing
    // vacuously if a phase never got sampled.
    const phasesCovered = new Set<DuelPhase>();
    const actionsCovered = new Set<DuelAction['type']>();
    let pairs = 0;

    for (const phase of DUEL_PHASES) {
      const samples = PHASE_SAMPLES.get(phase) ?? [];
      expect(samples.length, `no sample state was ever observed in phase '${phase}'`).toBeGreaterThan(0);
      phasesCovered.add(phase);

      for (const sample of samples) {
        for (const action of walkActions(sample)) {
          const next = duelReducer(sample, action);
          actionsCovered.add(action.type);
          pairs += 1;
          expect(DUEL_PHASES, `${phase} + ${action.type} left the union`).toContain(next.phase);
          // A reducer that mutated its input in place would pass a phase check and corrupt replay.
          expect(sample.phase).toBe(phase);
        }
      }
    }

    expect([...phasesCovered].sort()).toEqual([...DUEL_PHASES].sort());
    expect([...actionsCovered].sort()).toEqual([...DUEL_ACTION_TYPES].sort());
    expect(pairs).toBeGreaterThan(DUEL_PHASES.length * DUEL_ACTION_TYPES.length);
  });

  it('spec(A-016:AC-5) dod(A-016:4) no phase but victory and defeat is inescapable', () => {
    // The soft-lock catastrophe class. `return s` for everything satisfies the criterion's first
    // half, so this is the half that has teeth: each non-terminal phase must be left either by its
    // own PHASE_DURATION_MS beat or by something a child can tap.
    const timerDriven: DuelPhase[] = [];
    const inputDriven: DuelPhase[] = [];

    for (const phase of DUEL_PHASES) {
      const samples = PHASE_SAMPLES.get(phase) ?? [];
      const sample = samples[0];
      if (sample === undefined) throw new Error(`duel-core: no sample state in phase '${phase}'`);

      const beat = PHASE_DURATION_MS[phase];
      if (beat !== undefined) {
        // A beat that exists must actually end the phase, and must be a duration a screen can wait
        // on — a zero or a NaN is a timer that never fires.
        expect(Number.isFinite(beat)).toBe(true);
        expect(beat).toBeGreaterThan(0);
        expect(duelReducer(sample, { type: 'ADVANCE' }).phase).not.toBe(phase);
        timerDriven.push(phase);
        continue;
      }

      if (isTerminal(phase)) continue;

      // No beat: something the child can actually tap must leave it. Only `screenActions` counts —
      // the unguarded `PICK_CANNON`/`OPEN_CHEST`/`RESET` would otherwise escape every phase and
      // make this criterion unfailable.
      const escapes = screenActions(sample).filter((a) => duelReducer(sample, a).phase !== phase);
      expect(escapes.length, `phase '${phase}' has no beat and no input that leaves it`).toBeGreaterThan(
        0,
      );
      inputDriven.push(phase);
    }

    // The partition is the criterion: every non-terminal phase is in exactly one of the two lists.
    expect([...timerDriven, ...inputDriven].sort()).toEqual(
      [...DUEL_PHASES].filter((p) => !isTerminal(p)).sort(),
    );
    // And a terminal phase must not carry a beat — a timer on a finished duel keeps ticking it.
    for (const phase of TERMINAL_PHASES) expect(PHASE_DURATION_MS[phase]).toBeUndefined();
  });

  it('spec(A-016:AC-5) the phase and action unions this walk covers are the ones the reducer declares', async () => {
    // Secondary cross-check only — the compiler-enforced `everyMemberOf` above is the authority.
    // This exists so a union rewritten in the source is visible here as drift rather than as a
    // silently narrower sweep.
    const src = await readSource('../../src/stores/duel.ts');
    const declared = (marker: string): readonly string[] => {
      const from = src.indexOf(marker);
      expect(from, `'${marker}' not found in src/stores/duel.ts`).toBeGreaterThan(-1);
      const block = src.slice(from, src.indexOf('\n\n', from));
      return [...block.matchAll(/'([a-zA-Z_]+)'/g)].map((m) => m[1] ?? '');
    };

    expect([...declared('export type DuelPhase =')].sort()).toEqual([...DUEL_PHASES].sort());
    expect([...declared('export type DuelAction =')].sort()).toEqual([...DUEL_ACTION_TYPES].sort());
  });

  it('spec(A-016:AC-5) the screen offers a control in exactly the two phases this walk treats as interactive', async () => {
    // What makes the escapability test above non-vacuous. vitest runs in node and React Native's
    // entry point is Flow-typed, so the screen cannot be rendered here (the A-001 AC-7 pattern) —
    // the source text is the only place the gating is observable. Secondary to the behavioural
    // walk, and deliberately loose: it asks which phase gates each control, not how it is spelled.
    const src = await readSource('../../app/duel.tsx');

    expect(src).toMatch(/phase === 'select' \?\s*<CannonTray/);
    expect(src).toMatch(/phase === 'question'[\s\S]{0,80}<QuestionPanel/);
    // The fuse is the other input in `question`, and it is the only place TIMEOUT is dispatched.
    expect(src).toMatch(/phase !== 'question'[\s\S]{0,200}TIMEOUT/);
    // Every other phase advances on its own beat, read from the reducer's own table.
    expect(src).toMatch(/PHASE_DURATION_MS\[state\.phase\]/);
    expect(src).toMatch(/ADVANCE/);
  });

  // ── AC-6 — how a duel ends, and the arithmetic that gets it there ───────────────────────────

  it('spec(A-016:AC-6) the shot that sinks the rival ends it — no counter-volley after it', () => {
    let sinkings = 0;

    for (const trace of TRACES) {
      const sinking = trace.states.findIndex((s) => s.phase === 'impact' && s.rivalHull === 0);
      if (sinking === -1) continue;
      sinkings += 1;

      const after = trace.states[sinking + 1];
      const before = trace.states[sinking];
      if (after === undefined || before === undefined) throw new Error('duel-core: truncated trace');

      expect(after.phase).toBe('victory');
      // The player takes nothing after the sinking shot. A rival volley that fired and only then
      // conceded would still read as `victory` at the end of the log.
      expect(after.playerHull).toBe(before.playerHull);
      expect(sinking + 1).toBe(trace.states.length - 1);
      for (const state of trace.states) {
        if (state.rivalHull > 0) continue;
        expect(['impact', 'victory']).toContain(state.phase);
      }
    }

    expect(sinkings).toBeGreaterThan(0);
  });

  it('spec(A-016:AC-6) a hull at zero decides the duel, and the terminal phase names which one', () => {
    let victories = 0;
    let defeats = 0;

    for (const trace of TRACES) {
      const last = trace.states[trace.states.length - 1];
      if (last === undefined) throw new Error('duel-core: empty trace');

      if (last.phase === 'victory') {
        victories += 1;
        expect(last.rivalHull).toBe(0);
        expect(last.playerHull).toBeGreaterThan(0);
      } else {
        defeats += 1;
        expect(last.phase).toBe('defeat');
        expect(last.playerHull).toBe(0);
        expect(last.rivalHull).toBeGreaterThan(0);
      }
      // A hull reaching zero anywhere in the log must be the reason the duel stopped.
      if (trace.states.some((s) => s.playerHull === 0)) expect(last.phase).toBe('defeat');
      if (trace.states.some((s) => s.rivalHull === 0)) expect(last.phase).toBe('victory');
    }

    // Both endings are actually represented, or half of this test never ran.
    expect(victories).toBeGreaterThan(0);
    expect(defeats).toBeGreaterThan(0);
  });

  it('spec(A-016:AC-6) recoil can sink the player on their own turn, and that is a defeat too', () => {
    // The other route to zero. A settle that only ran after the rival's volley would leave a player
    // sunk by their own gun sitting in `miss` forever — the soft-lock, arrived at by arithmetic.
    let found = 0;
    for (const seed of WALK_SEEDS) {
      let state = initialDuelState(seed);
      for (let step = 0; step < TRACE_STEP_CAP && !isTerminal(state.phase); step += 1) {
        const before = state;
        if (state.phase === 'select') {
          state = duelReducer(state, { type: 'PICK_CANNON', cannon: RECOIL_GUN });
        } else if (state.phase === 'question') {
          state = duelReducer(state, {
            type: 'ANSWER',
            value: wrongChoice(requireQuestion(state)),
            elapsedMs: 0,
          });
        } else {
          state = duelReducer(state, { type: 'ADVANCE' });
        }
        if (before.phase === 'miss' && before.playerHull === 0) {
          found += 1;
          expect(state.phase).toBe('defeat');
          expect(state.rivalDamage).toBe(before.rivalDamage);
        }
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it('spec(A-016:AC-6) neither hull is ever negative at any point in any action log', () => {
    // A property, not a case: one chosen duel cannot cover a hull arithmetic bug, and a `NaN` hull
    // — the thing that makes a fight never end — fails `>= 0` without ever looking like a number.
    let playerFloored = 0;
    let rivalFloored = 0;

    for (const state of EVERY_STATE) {
      expect(Number.isInteger(state.playerHull)).toBe(true);
      expect(Number.isInteger(state.rivalHull)).toBe(true);
      expect(state.playerHull).toBeGreaterThanOrEqual(0);
      expect(state.rivalHull).toBeGreaterThanOrEqual(0);
      expect(state.playerHull).toBeLessThanOrEqual(state.playerMax);
      expect(state.rivalHull).toBeLessThanOrEqual(state.rivalMax);
      expect(state.playerMax).toBe(PLAYER_HULL);
      expect(state.rivalMax).toBe(ENEMY_HULL_BY_ISLAND.port_sumwich);
      if (state.playerHull === 0) playerFloored += 1;
      if (state.rivalHull === 0) rivalFloored += 1;
    }

    // Both floors were exercised; `Math.max(0, …)` on only one of the two hulls would survive a
    // corpus that never drove the other to zero.
    expect(playerFloored).toBeGreaterThan(0);
    expect(rivalFloored).toBeGreaterThan(0);
  });

  it('spec(A-016:AC-6) the purse a finished duel carries is computeCoinPayout’s, not this layer’s', () => {
    for (const trace of TRACES) {
      const last = trace.states[trace.states.length - 1];
      if (last === undefined) throw new Error('duel-core: empty trace');
      expect(last.coins).toBe(
        computeCoinPayout({
          won: last.phase === 'victory',
          totalAnswers: last.asked,
          correctAnswers: last.right,
          perfectShots: last.perfects,
        }),
      );
      // ...and no coins are minted before the duel is over.
      for (const state of trace.states.slice(0, -1)) expect(state.coins).toBe(0);
    }
  });

  // ── AC-7 — a duel replays from {seed, action log} ───────────────────────────────────────────

  it('spec(A-016:AC-7) the same seed and the same log replay to deeply equal INTERMEDIATE states', () => {
    for (const trace of TRACES) {
      // Every state, whole-object — rng, question, recency window and all. Comparing only the
      // terminal state passes a reducer that reads a clock on turn two and happens to converge.
      expect(replay(trace)).toEqual([...trace.states]);
      // A third run, to catch state that leaks between runs rather than between calls.
      expect(replay(trace)).toEqual([...trace.states]);
      expect(trace.states.length).toBeGreaterThan(DUEL_PHASES.length);
    }
  });

  it('spec(A-016:AC-7) the reducer reads no clock and no ambient randomness', () => {
    // Behavioural, not a lint claim: `no-restricted-globals` is scoped to `src/engine/**` and does
    // not cover this reducer, so the only honest proof is to poison every route and drive a duel.
    const trace = TRACES[0];
    if (trace === undefined) throw new Error('duel-core: no traces');

    const replayed = withoutAmbientSources(() => replay(trace));
    expect(replayed).toEqual([...trace.states]);
  });

  it('spec(A-016:AC-7) elapsedMs arrives as data — the same seed and log price differently at a different clock', () => {
    // The other half of replayability. If the reducer measured the time itself, changing the
    // action's `elapsedMs` would change nothing, and every duel would replay to the same numbers
    // by accident rather than by construction.
    const cannon = RELIABLE_STARTER;
    const armed = askedWith(CATALOG_SEEDS[0] ?? 1, cannon);
    const question = requireQuestion(armed);
    const fast = duelReducer(armed, { type: 'ANSWER', value: question.answer, elapsedMs: 0 });
    const slow = duelReducer(armed, {
      type: 'ANSWER',
      value: question.answer,
      elapsedMs: cannon.timerMs,
    });

    expect(fast.outcome).not.toEqual(slow.outcome);
    // ...while the stream itself advances identically, because `resolveShot` draws exactly once
    // whatever the clock said.
    expect(fast.rng).toEqual(slow.rng);
  });

  // ── AC-8 — the mastery meter and the scoreboard tell one story ──────────────────────────────

  it('spec(A-016:AC-8) the per-skill tally sums to the scoreboard on every state of every log', () => {
    for (const trace of TRACES) {
      for (const state of trace.states) {
        const entries = Object.values(state.skillTally).filter((t) => t !== undefined);
        expect(entries.reduce((n, t) => n + t.asked, 0)).toBe(state.asked);
        expect(entries.reduce((n, t) => n + t.correct, 0)).toBe(state.right);
        expect(state.right).toBeLessThanOrEqual(state.asked);
        expect(state.perfects).toBeLessThanOrEqual(state.right);
      }
    }

    // `0 === 0` is passed by a reducer that counts nothing at all, so the corpus has to be shown
    // to contain the things that could make the two totals drift.
    const finals = TRACES.map((t) => t.states[t.states.length - 1]).filter((s) => s !== undefined);
    expect(finals.reduce((n, s) => n + s.asked, 0)).toBeGreaterThan(0);
    expect(finals.reduce((n, s) => n + s.right, 0)).toBeGreaterThan(0);
    expect(finals.reduce((n, s) => n + s.perfects, 0)).toBeGreaterThan(0);
    // At least one duel fired two different guns on two different skills — the exact case aggregate
    // counters cannot describe.
    expect(Math.max(...finals.map((s) => Object.keys(s.skillTally).length))).toBeGreaterThan(0);
    // And at least one duel asked more than it got right, so the two sums are not the same number.
    expect(finals.some((s) => s.asked > s.right)).toBe(true);
  });

  it('spec(A-016:AC-8) a burned fuse counts as asked in both places and correct in neither', () => {
    // The narrowest way the two totals can diverge: a path that touches one counter and not the
    // other. `TIMEOUT` is that path — it is asked, and it is not wrong.
    for (const cannon of [RELIABLE_STARTER, VOLATILE_STARTER, RECOIL_GUN]) {
      const armed = askedWith(WALK_SEEDS[1] ?? 1, cannon);
      const burned = duelReducer(armed, { type: 'TIMEOUT' });
      const entry = burned.skillTally[cannon.skill];

      expect(burned.asked).toBe(armed.asked + 1);
      expect(burned.right).toBe(armed.right);
      expect(entry?.asked).toBe((armed.skillTally[cannon.skill]?.asked ?? 0) + 1);
      expect(entry?.correct).toBe(armed.skillTally[cannon.skill]?.correct ?? 0);

      const entries = Object.values(burned.skillTally).filter((t) => t !== undefined);
      expect(entries.reduce((n, t) => n + t.asked, 0)).toBe(burned.asked);
      expect(entries.reduce((n, t) => n + t.correct, 0)).toBe(burned.right);
    }
  });

  // ── AC-9 — "fight again" is a duel the ledger has not settled ────────────────────────────────

  it('spec(A-016:AC-9) RESET yields a fresh duel: new id, both hulls full, every counter zeroed', () => {
    for (const trace of TRACES.slice(0, 4)) {
      const finished = trace.states[trace.states.length - 1];
      if (finished === undefined) throw new Error('duel-core: empty trace');
      const again = duelReducer(finished, { type: 'RESET' });

      expect(again.duelId).not.toBe(finished.duelId);
      expect(again.playerHull).toBe(PLAYER_HULL);
      expect(again.rivalHull).toBe(ENEMY_HULL_BY_ISLAND.port_sumwich);
      expect(again.playerHull).toBe(again.playerMax);
      expect(again.rivalHull).toBe(again.rivalMax);
      expect(again.phase).toBe('select');

      // Whole-object, against a genuinely fresh duel: listing the fields by hand is how a stale
      // `perfects` or a carried-over `recentTemplateIds` survives a "hulls are full" test.
      const fresh = initialDuelState(trace.seed);
      const ignoringIdentity = (s: DuelState): unknown => ({ ...s, rng: null, duelId: null });
      expect(ignoringIdentity(again)).toEqual(ignoringIdentity(fresh));
    }
  });

  it('spec(A-016:AC-9) the rng stream is carried forward, not restarted', () => {
    for (const seed of WALK_SEEDS) {
      const midDuel = askedWith(seed, VOLATILE_STARTER);
      const again = duelReducer(midDuel, { type: 'RESET' });

      // The next duel's seed is DRAWN from the stream the last one left behind — exactly one step
      // of it. A `createRng(freshSeed)` would satisfy "new id, full hulls" and quietly make the
      // whole session unreplayable past its first duel.
      expect(again.rng).toEqual(nextFloat(midDuel.rng)[1]);
      expect(again.rng).not.toEqual(midDuel.rng);
      expect(again.rng).not.toEqual(initialDuelState(seed).rng);

      // Two resets from different points of the same duel are different duels — which is what the
      // reward ledger keys on (A-008 AC-6). A fixed seed here pays for the first duel only.
      const later = duelReducer(duelReducer(midDuel, { type: 'OPEN_CHEST' }), { type: 'RESET' });
      const twice = duelReducer(again, { type: 'RESET' });
      expect(later.duelId).toBe(again.duelId);
      expect(twice.duelId).not.toBe(again.duelId);
      expect(new Set([midDuel.duelId, again.duelId, twice.duelId]).size).toBe(3);
    }
  });
});
