/**
 * T-013 — `src/engine/duel/types.ts`: the duel state machine's vocabulary and its constructor.
 *
 * This file is FROZEN and five later tickets import what it pins (T-018 opponents, T-020
 * `duelReducer`, T-022 Double-Shot, T-024 invariants + replay). Three consequences shape how it
 * is written:
 *
 * 1. **Phases and events are enumerated as literal arrays declared HERE**, never read back out
 *    of `DUEL_PHASES` or `keyof DuelEvent`. A derived enumeration is a tautology: it agrees with
 *    whatever the implementation exports. The ticket's DoD requires the literal form precisely so
 *    that T-022's additions fail these tests loudly and land as a reviewed patch instead of
 *    silently changing what they mean.
 * 2. **Type-level claims get compile-time probes.** Most of T-013 is a type contract, and a
 *    runtime assertion cannot see it — a lazy implementation that widened every id field to
 *    `string` would satisfy every `expect()` in this file. `Exact<>` equality and
 *    `@ts-expect-error` are therefore load-bearing, and the `Exact` helper carries its own
 *    negative control so the probes cannot pass vacuously (LESSONS.md L-014).
 * 3. **Constants are imported, never retyped.** Hulls come from `@engine/tuning`, cannons and
 *    islands from the catalogs, and `ShotOutcome` from the real `@engine/duel/damage`, so no
 *    number here can drift from the module that owns it.
 * 4. **Whole-interface probes, not indexed ones, for modifiers and for closed shapes.** An
 *    indexed access DISCARDS property modifiers (LESSONS.md L-012), so `Exact<DuelState['seed'],
 *    number>` is blind to a mutable `seed` — verified: removing `readonly` from `DuelCore.seed`
 *    typechecked clean and passed this suite 100/100 before AC-14 existed. Likewise, constraining
 *    `DuelEvent['type']` and the keys of hand-written fixture values cannot see an extra
 *    OPTIONAL field on one variant — verified the same way. The remedy in both cases is a probe
 *    over the whole type: `IsFullyReadonly<T>` for AC-14, and
 *    `Exact<Extract<DuelEvent, {type: …}>, {…}>` per variant for AC-13.
 *
 * A Perfect Shot is `+PERFECT_SHOT_BONUS_DAMAGE` **damage**; `ballCount` is presentation the
 * engine ignores. Nothing below reads `ballCount` as damage — the one `ShotOutcome` fixture is
 * produced by calling the frozen T-008 `resolveShot`, so this file cannot encode the stale
 * "+1 bonus ball" reading of ARCHITECTURE.md:202 at all (T-031 carries that correction).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { getCannon } from '@content/index';
import { ISLAND_IDS, templateSchema } from '@content/schemas';
import type { CannonId, IslandId, SkillId, Template } from '@content/schemas';
import { resolveShot, type ShotOutcome } from '@engine/duel/damage';
import { assertQuestion, type Question } from '@engine/questions/types';
import { createRng, type Rng } from '@engine/rng';
import {
  BOT_ACCURACY_WINDOW,
  ENEMY_HULL_BY_ISLAND,
  ONBOARDING_ENEMY_HULL,
  PLAYER_HULL,
} from '@engine/tuning';

import { DUEL_PHASES, createDuelState, isTerminalPhase, toRivalView } from '@engine/duel/types';
import type {
  ActionLogEntry,
  DuelConfig,
  DuelEvent,
  DuelPhase,
  DuelResult,
  DuelState,
  DuelTally,
  RivalAction,
  RivalView,
  RivalVolley,
} from '@engine/duel/types';

// ============================================================================================
// The type-probe apparatus, and its negative control
// ============================================================================================

/** Compile-time exact-type equality — invariant in both directions, unlike `extends`. */
type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/**
 * Every `Exact<...> = true` below is evidence only if `Exact` can also report `false`. These two
 * lines are the negative control for the whole apparatus: if `Exact` ever degraded into
 * `true`-for-everything, the second stops compiling and the failure is loud instead of silent.
 */
const exactAcceptsAMatch: Exact<'player', 'player'> = true;
const exactRejectsAWidening: Exact<'player', string> = false;

/**
 * Homomorphic identity. Preserves `readonly` and `?` exactly as declared, but FLATTENS an
 * intersection into a single object type — which is why the readonly probe below is built on it
 * rather than comparing `Readonly<T>` against a bare `T`.
 *
 * `DuelState`'s variants are intersections (`DuelCore & {phase: …}`), and `Readonly<A & B>` is a
 * flattened mapped type while `A & B` is not. `Exact` is invariant, so it reports those two as
 * DIFFERENT even when every property is already readonly — a false negative that would have made
 * AC-14 unsatisfiable. Mapping both sides through the same homomorphism removes the difference in
 * representation and leaves only the difference in modifiers, which is the thing being measured.
 */
type Flatten<T> = { [K in keyof T]: T[K] };

/** `true` only when every property of `T` already carries `readonly`. AC-14's mechanism. */
type IsFullyReadonly<T> = Exact<Flatten<T>, Readonly<T>>;

// ============================================================================================
// Literal enumerations — declared here, NOT derived from the module under test
// ============================================================================================

/** ARCHITECTURE.md §4.2's state list, in order. T-022 adds its phase by patching this line. */
const EXPECTED_PHASES = [
  'countdown',
  'playerChoose',
  'reload',
  'resolvePlayer',
  'rivalTurn',
  'resolveRival',
  'victory',
  'defeat',
] as const;

/**
 * `isTerminalPhase`'s full truth table, written out rather than computed from a terminal-phase
 * list, so the expectation cannot share a bug with the predicate it checks.
 */
const TERMINAL_BY_PHASE = {
  countdown: false,
  playerChoose: false,
  reload: false,
  resolvePlayer: false,
  rivalTurn: false,
  resolveRival: false,
  victory: true,
  defeat: true,
} as const;

/** ARCHITECTURE.md §4.2's five events. T-022 adds `DOUBLE_SHOT_SELECTED` by patching this line. */
const EXPECTED_EVENT_TYPES = [
  'CANNON_SELECTED',
  'ANSWER_CHOSEN',
  'TIMER_EXPIRED',
  'ANIMATION_DONE',
  'RIVAL_ACTION',
] as const;

const EXPECTED_RIVAL_VIEW_KEYS = [
  'volleyNumber',
  'playerHull',
  'enemyHull',
  'enemyMaxHull',
  'rivalLoadout',
  'playerRecentCorrect',
] as const;

/** ARCHITECTURE.md §4.2's action-log fields, verbatim. The **required** set, not the closed set. */
const REQUIRED_ACTION_LOG_FIELDS = ['actor', 'cannonId', 'correct', 'elapsedMs'] as const;

const EXPECTED_DUEL_CONFIG_FIELDS = [
  'seed',
  'islandId',
  'playerLoadout',
  'rivalLoadout',
  'templatesBySkill',
] as const;

// ============================================================================================
// Fixtures
// ============================================================================================

/**
 * Read from the catalog rather than retyped, so a sixth island is swept automatically instead of
 * quietly escaping the per-island assertions below. This is content, not the module under test —
 * the DoD's no-derivation rule is about `DUEL_PHASES` and `DuelEvent`, which are pinned above.
 */
const ALL_ISLAND_IDS: readonly IslandId[] = ISLAND_IDS;

/**
 * Two templates, built through the real T-003 schema rather than hand-typed, so the pool carried
 * in `DuelState` is genuinely schema-valid and its optional fields are absent the way zod leaves
 * them (which is what AC-6's exact round-trip depends on).
 */
const FIXTURE_TEMPLATES: Readonly<Partial<Record<SkillId, readonly Template[]>>> = {
  add_within_10: [
    templateSchema.parse({
      id: 'add_within_10__a_plus_b',
      skill: 'add_within_10',
      text: '{a} + {b} = ?',
      params: { a: [1, 5], b: [1, 5] },
      answerExpr: 'a + b',
      distractors: ['a + b + 1', 'a + b - 1', 'a * b'],
    }),
    templateSchema.parse({
      id: 'add_within_10__b_plus_a',
      skill: 'add_within_10',
      text: '{b} + {a} = ?',
      params: { a: [1, 4], b: [1, 4] },
      answerExpr: 'b + a',
      distractors: ['b + a + 2', 'b + a - 1', 'b * a'],
    }),
  ],
};

const FIXTURE_QUESTION: Question = {
  templateId: 'add_within_10__a_plus_b',
  skill: 'add_within_10',
  text: '3 + 4 = ?',
  params: { a: 3, b: 4 },
  choices: [
    { value: 7, label: '7' },
    { value: 8, label: '8' },
    { value: 6, label: '6' },
    { value: 12, label: '12' },
  ],
  correctIndex: 0,
  isWordProblem: false,
  readAloud: false,
};

/**
 * A real `ShotOutcome` from the frozen T-008 module — never a hand-written literal. 1 000 ms
 * against the Swivel Gun's 20 000 ms timer is inside the Perfect Shot window, so this fixture
 * carries the `+PERFECT_SHOT_BONUS_DAMAGE` path without this file ever naming a damage number.
 */
const FIXTURE_OUTCOME: ShotOutcome = resolveShot({
  cannon: getCannon('swivel_gun'),
  correct: true,
  elapsedMs: 1000,
  rng: createRng(7),
})[0];

const FIXTURE_VOLLEY: RivalVolley = {
  cannonId: 'six_pounder',
  correct: true,
  elapsedMs: 850,
};

/**
 * Interleaved player and rival entries, chosen so that all four plausible readings of AC-9 give
 * different answers (LESSONS.md L-020 — a fixture whose orderings coincide measures the
 * coincidence, not the contract):
 *
 * | reading                        | result                          |
 * | ------------------------------ | ------------------------------- |
 * | player only, most-recent-first | `[false, false, true]` ← AC-9   |
 * | player only, chronological     | `[true, false, false]`          |
 * | unfiltered, most-recent-first  | `[true, false, false, true, true]` |
 * | unfiltered, chronological      | `[true, true, false, false, true]` |
 */
const FIXTURE_LOG: readonly ActionLogEntry[] = Object.freeze([
  Object.freeze<ActionLogEntry>({ actor: 'player', cannonId: 'swivel_gun', correct: true, elapsedMs: 1200 }),
  Object.freeze<ActionLogEntry>({ actor: 'rival', cannonId: 'six_pounder', correct: true, elapsedMs: 800 }),
  Object.freeze<ActionLogEntry>({ actor: 'player', cannonId: 'culverin', correct: false, elapsedMs: 4300 }),
  Object.freeze<ActionLogEntry>({
    actor: 'player',
    cannonId: 'swivel_gun',
    correct: false,
    elapsedMs: 15000,
  }),
  Object.freeze<ActionLogEntry>({ actor: 'rival', cannonId: 'mortar', correct: true, elapsedMs: 900 }),
]);

const FIXTURE_TALLY: DuelTally = {
  correctAnswers: 3,
  totalAnswers: 5,
  perfectShots: 1,
  bySkill: {
    add_within_10: { correct: 2, attempts: 3 },
    add_within_20: { correct: 1, attempts: 2 },
  },
};

/**
 * The shared fixtures are frozen on purpose. AC-12's probes are `@ts-expect-error`-guarded at
 * COMPILE time but still execute at RUNTIME — `readonly` erases — so an unfrozen shared array
 * would let those probes quietly corrupt fixtures that later tests depend on. Freezing turns that
 * into an immediate `TypeError` instead of a silent order-dependent pass.
 */
const FIXTURE_PLAYER_LOADOUT: readonly CannonId[] = Object.freeze<CannonId[]>(['swivel_gun', 'culverin']);
/** Deliberately different from the player's, in length AND membership, so a swap cannot pass. */
const FIXTURE_RIVAL_LOADOUT: readonly CannonId[] = Object.freeze<CannonId[]>([
  'six_pounder',
  'mortar',
  'long_nine',
]);

function configFor(islandId: IslandId, seed: number): DuelConfig {
  return {
    seed,
    islandId,
    playerLoadout: FIXTURE_PLAYER_LOADOUT,
    rivalLoadout: FIXTURE_RIVAL_LOADOUT,
    templatesBySkill: FIXTURE_TEMPLATES,
  };
}

/**
 * A config carrying AC-2's optional `enemyMaxHull` override. Kept as a separate builder rather
 * than an optional parameter on `configFor` because `exactOptionalPropertyTypes` is on: spreading
 * a `number | undefined` into the field is itself a type error, so the override must only ever be
 * present or absent, never present-and-undefined. That is the same distinction AC-11 makes about
 * optional action-log fields, enforced here on the config side.
 */
function configWithHullOverride(islandId: IslandId, seed: number, enemyMaxHull: number): DuelConfig {
  return { ...configFor(islandId, seed), enemyMaxHull };
}

/**
 * A mid-duel core. Every numeric field holds a DIFFERENT value (`volleyNumber` 2, `playerHull`
 * 71, `enemyHull` 34, `enemyMaxHull` 75, `turnToken` 3) so that a projection which reads the
 * wrong field, or returns a constant, cannot coincide with the right answer.
 *
 * `turnToken: 3` is deliberate: T-013 only ever constructs token `0`, so a non-zero token has to
 * appear in a hand-built state or nothing in this ticket proves the field is a live counter
 * rather than the constant `0` the driver would then compare uselessly against.
 */
const CORE = {
  seed: 4242,
  rng: createRng(4242),
  turnToken: 3,
  volleyNumber: 2,
  islandId: 'quotient_cove' as IslandId,
  playerHull: 71,
  enemyHull: 34,
  enemyMaxHull: ENEMY_HULL_BY_ISLAND.quotient_cove,
  playerLoadout: FIXTURE_PLAYER_LOADOUT,
  rivalLoadout: FIXTURE_RIVAL_LOADOUT,
  recentTemplateIds: ['add_within_10__a_plus_b'] as readonly string[],
  actionLog: FIXTURE_LOG,
  tally: FIXTURE_TALLY,
  templatesBySkill: FIXTURE_TEMPLATES,
};

/**
 * One state per phase. Keyed off this file's own literal phase list, so `tsc` fails if a phase
 * goes uncovered — and so the T-022 patch is "add one entry", not "rewrite the fixture".
 */
const STATE_BY_PHASE: Readonly<Record<(typeof EXPECTED_PHASES)[number], DuelState>> = {
  countdown: { ...CORE, phase: 'countdown' },
  playerChoose: { ...CORE, phase: 'playerChoose' },
  reload: {
    ...CORE,
    phase: 'reload',
    cannonId: 'swivel_gun',
    question: FIXTURE_QUESTION,
    timerMs: getCannon('swivel_gun').timerMs,
  },
  resolvePlayer: { ...CORE, phase: 'resolvePlayer', cannonId: 'swivel_gun', outcome: FIXTURE_OUTCOME },
  rivalTurn: { ...CORE, phase: 'rivalTurn' },
  resolveRival: { ...CORE, phase: 'resolveRival', volley: FIXTURE_VOLLEY, damageToPlayer: 9 },
  victory: { ...CORE, phase: 'victory', result: { won: true, tally: FIXTURE_TALLY, volleys: 5 } },
  defeat: { ...CORE, phase: 'defeat', result: { won: false, tally: FIXTURE_TALLY, volleys: 6 } },
};

const ALL_PHASE_STATES: readonly DuelState[] = EXPECTED_PHASES.map((phase) => STATE_BY_PHASE[phase]);

// ============================================================================================
// Helpers
// ============================================================================================

/**
 * Asserts a value is plain JSON all the way down: no functions, no `Map`/`Set`, no class
 * instances, no `undefined`-valued keys, no non-finite numbers. This is the MECHANISM behind
 * AC-6; the round-trip comparison beside it is only a projection of it (LESSONS.md L-012).
 */
function expectPlainJsonValue(value: unknown, path: string): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `${path} must be a finite number`).toBe(true);
    return;
  }

  expect(typeof value, `${path} must be a JSON value, not a ${typeof value}`).toBe('object');

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      expect(entry, `${path}[${index}] must not be undefined`).not.toBeUndefined();
      expectPlainJsonValue(entry, `${path}[${index}]`);
    });
    return;
  }

  expect(
    Object.getPrototypeOf(value),
    `${path} must be a plain object, not a class instance or Map/Set`,
  ).toBe(Object.prototype);

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    expect(child, `${path}.${key} must be omitted rather than set to undefined`).not.toBeUndefined();
    expectPlainJsonValue(child, `${path}.${key}`);
  }
}

/** Captures the thrown value so a test can assert both its class and its message. */
function captureThrow(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

// ============================================================================================
// Harness self-check
// ============================================================================================

describe('T-013 test harness', () => {
  it('spec(T-013:AC-1) has a live Exact<> probe that reports both true and false', () => {
    expect([exactAcceptsAMatch, exactRejectsAWidening]).toEqual([true, false]);
  });

  it('spec(T-013:AC-6) builds its Question fixture as a legal T-003 Question', () => {
    expect(() => {
      assertQuestion(FIXTURE_QUESTION);
    }).not.toThrow();
  });

  it('spec(T-013:AC-6) covers every phase in its own literal list with a fixture', () => {
    expect(ALL_PHASE_STATES.map((state) => state.phase)).toEqual([
      'countdown',
      'playerChoose',
      'reload',
      'resolvePlayer',
      'rivalTurn',
      'resolveRival',
      'victory',
      'defeat',
    ]);
  });
});

// ============================================================================================
// AC-1 — the phase list
// ============================================================================================

describe('DUEL_PHASES', () => {
  it('spec(T-013:AC-1) is exactly the eight ARCHITECTURE.md §4.2 phases, in that order', () => {
    expect(DUEL_PHASES).toEqual([
      'countdown',
      'playerChoose',
      'reload',
      'resolvePlayer',
      'rivalTurn',
      'resolveRival',
      'victory',
      'defeat',
    ]);
  });

  it('spec(T-013:AC-1) holds eight entries with no duplicates', () => {
    expect(DUEL_PHASES).toHaveLength(8);
    expect(new Set(DUEL_PHASES).size).toBe(8);
  });

  // The runtime check above passes against `const DUEL_PHASES: string[]`, which would collapse
  // `DuelPhase` to `string` and let T-020 dispatch on a typo. These pin the TYPE.
  it('spec(T-013:AC-1) declares DuelPhase as exactly those eight literals', () => {
    const phaseUnionIsExact: Exact<
      DuelPhase,
      | 'countdown'
      | 'playerChoose'
      | 'reload'
      | 'resolvePlayer'
      | 'rivalTurn'
      | 'resolveRival'
      | 'victory'
      | 'defeat'
    > = true;

    expect(phaseUnionIsExact).toBe(true);
  });

  it('spec(T-013:AC-1) declares DUEL_PHASES as a readonly tuple of literals, not string[]', () => {
    const elementsAreLiterals: Exact<
      (typeof DUEL_PHASES)[number],
      | 'countdown'
      | 'playerChoose'
      | 'reload'
      | 'resolvePlayer'
      | 'rivalTurn'
      | 'resolveRival'
      | 'victory'
      | 'defeat'
    > = true;

    expect(elementsAreLiterals).toBe(true);
  });

  it('spec(T-013:AC-1) does not accept a phase name outside the union', () => {
    // @ts-expect-error 'reloading' is not a DuelPhase; the union is closed in this ticket.
    const phase: DuelPhase = 'reloading';

    expect(phase).toBe('reloading');
  });
});

// ============================================================================================
// AC-2 — initial-state construction
// ============================================================================================

describe('createDuelState — initial state', () => {
  // Only the retuned-PLAYER_HULL test below mocks anything, and `vi.doMock` affects nothing that
  // was already statically imported — but leaving a module mock in the registry is the kind of
  // cross-test leak that shows up later as an unexplained failure, so it is torn down here.
  afterEach(() => {
    vi.doUnmock('@engine/tuning');
    vi.resetModules();
  });

  it('spec(T-013:AC-2) starts in the countdown phase', () => {
    expect(createDuelState(configFor('port_sumwich', 1)).phase).toBe('countdown');
  });

  // Swept across every island so a hardcoded starter-sloop hull dies, and read from
  // `@engine/tuning` so no number in this file can drift from the module that owns it.
  it('spec(T-013:AC-2) sets both enemy hulls from ENEMY_HULL_BY_ISLAND, per island', () => {
    for (const islandId of ALL_ISLAND_IDS) {
      const state = createDuelState(configFor(islandId, 11));

      expect(state.enemyHull, `enemyHull on ${islandId}`).toBe(ENEMY_HULL_BY_ISLAND[islandId]);
      expect(state.enemyMaxHull, `enemyMaxHull on ${islandId}`).toBe(ENEMY_HULL_BY_ISLAND[islandId]);
    }
  });

  it('spec(T-013:AC-2) starts player hull at PLAYER_HULL for every island', () => {
    for (const islandId of ALL_ISLAND_IDS) {
      expect(createDuelState(configFor(islandId, 11)).playerHull, islandId).toBe(PLAYER_HULL);
    }
  });

  /**
   * AC-2's `enemyMaxHull` override, added 2026-07-28. Swept across every island so the override
   * is shown to BEAT the per-island value rather than merely agreeing with it somewhere: the
   * probe value is `ENEMY_HULL_BY_ISLAND[island] + 13`, which is per-island distinct and never
   * equal to the value it replaces, so an implementation that ignored the override would fail on
   * all five islands rather than slipping through on the one where they coincide.
   */
  it('spec(T-013:AC-2) lets an enemyMaxHull override replace the per-island hull, per island', () => {
    for (const islandId of ALL_ISLAND_IDS) {
      const override = ENEMY_HULL_BY_ISLAND[islandId] + 13;
      const state = createDuelState(configWithHullOverride(islandId, 11, override));

      expect(state.enemyMaxHull, `enemyMaxHull on ${islandId}`).toBe(override);
      expect(state.enemyHull, `enemyHull on ${islandId}`).toBe(override);
      expect(state.enemyMaxHull, `override must beat the island default on ${islandId}`).not.toBe(
        ENEMY_HULL_BY_ISLAND[islandId],
      );
    }
  });

  /**
   * The reason the override exists, asserted against the frozen constant rather than the literal
   * 28. `ONBOARDING_ENEMY_HULL` was dead code before this amendment: AC-2 otherwise pinned
   * `port_sumwich` to 45, and PLAN.md's onboarding sloop "politely sinks in three volleys" is
   * unreachable at 45 — `swivel_gun.damageMax + PERFECT_SHOT_BONUS_DAMAGE` is the most a volley
   * can land, so 45 needs four volleys even played perfectly. This test fails if a future edit
   * re-severs the constant from the constructor.
   */
  it('spec(T-013:AC-2) can construct the scripted onboarding duel at ONBOARDING_ENEMY_HULL', () => {
    const state = createDuelState(configWithHullOverride('port_sumwich', 1, ONBOARDING_ENEMY_HULL));

    expect(state.enemyHull).toBe(ONBOARDING_ENEMY_HULL);
    expect(state.enemyMaxHull).toBe(ONBOARDING_ENEMY_HULL);
    expect(state.enemyMaxHull).not.toBe(ENEMY_HULL_BY_ISLAND.port_sumwich);
  });

  // The override is OPTIONAL: omitting it must leave the per-island default untouched. Without
  // this, an implementation defaulting to a constant would satisfy the override test above.
  it('spec(T-013:AC-2) falls back to the per-island hull when no override is supplied', () => {
    for (const islandId of ALL_ISLAND_IDS) {
      const state = createDuelState(configFor(islandId, 11));

      expect(state.enemyMaxHull, `default enemyMaxHull on ${islandId}`).toBe(ENEMY_HULL_BY_ISLAND[islandId]);
    }
  });

  /**
   * The assertion above cannot tell `PLAYER_HULL` from the literal `100`, because they agree today
   * — the exact coincidence LESSONS.md L-020 is about, and a mutation run confirmed a hardcoded
   * `100` survived every other test in this file. The remedy L-020 prescribes is to perturb the
   * source: re-import the module with a `PLAYER_HULL` that is deliberately NOT 100 and require the
   * constructor to follow it. `enemyHull` needs no equivalent because the per-island sweep already
   * spans five distinct values, so no single literal can satisfy it.
   */
  it('spec(T-013:AC-2) reads PLAYER_HULL from tuning instead of hardcoding its current value', async () => {
    const shifted = PLAYER_HULL + 7;

    vi.resetModules();
    vi.doMock('@engine/tuning', async () => {
      const actual = await vi.importActual<typeof import('@engine/tuning')>('@engine/tuning');
      return { ...actual, PLAYER_HULL: shifted };
    });

    const retuned = await import('@engine/duel/types');
    const state = retuned.createDuelState(configFor('port_sumwich', 1));

    expect(state.playerHull).toBe(shifted);
    expect(state.playerHull).not.toBe(PLAYER_HULL);
  });

  it('spec(T-013:AC-2) starts volleyNumber at 1 and turnToken at 0', () => {
    const state = createDuelState(configFor('port_sumwich', 1));

    expect(state.volleyNumber).toBe(1);
    expect(state.turnToken).toBe(0);
  });

  it('spec(T-013:AC-2) starts with an empty action log and no recent template ids', () => {
    const state = createDuelState(configFor('port_sumwich', 1));

    expect(state.actionLog).toEqual([]);
    expect(state.recentTemplateIds).toEqual([]);
  });

  it('spec(T-013:AC-2) starts every tally counter at zero with an empty bySkill', () => {
    expect(createDuelState(configFor('port_sumwich', 1)).tally).toStrictEqual({
      correctAnswers: 0,
      totalAnswers: 0,
      perfectShots: 0,
      bySkill: {},
    });
  });

  // AC-2 does not enumerate the carried-through fields (see the report's proposed amendment), but
  // a state that dropped its loadouts or island is unplayable and would break AC-8 downstream.
  it('spec(T-013:AC-2) carries seed, islandId, loadouts and template pool from the config', () => {
    const config = configFor('fraction_reef', 987);
    const state = createDuelState(config);

    expect(state.seed).toBe(config.seed);
    expect(state.islandId).toBe(config.islandId);
    expect(state.playerLoadout).toEqual(config.playerLoadout);
    expect(state.rivalLoadout).toEqual(config.rivalLoadout);
    expect(state.templatesBySkill).toStrictEqual(config.templatesBySkill);
  });

  it('spec(T-013:AC-2) does not confuse the player loadout with the rival loadout', () => {
    const state = createDuelState(configFor('port_sumwich', 1));

    expect(state.playerLoadout).toEqual(['swivel_gun', 'culverin']);
    expect(state.rivalLoadout).toEqual(['six_pounder', 'mortar', 'long_nine']);
  });

  it('spec(T-013:AC-2) declares the createDuelState signature the ticket specifies', () => {
    const takesADuelConfig: Exact<Parameters<typeof createDuelState>[0], DuelConfig> = true;
    const returnsADuelState: Exact<ReturnType<typeof createDuelState>, DuelState> = true;

    expect([takesADuelConfig, returnsADuelState]).toEqual([true, true]);
  });

  it('spec(T-013:AC-2) requires exactly the five DuelConfig fields to be supplied', () => {
    expect(Object.keys(configFor('port_sumwich', 1)).sort()).toEqual([...EXPECTED_DUEL_CONFIG_FIELDS].sort());
  });

  // Pins DuelConfig FIELD TYPES without pinning `keyof DuelConfig` — AC-2 and AC-11 both require
  // that, so T-022 can still add optional fields additively in wave 6.
  it('spec(T-013:AC-2) types every DuelConfig field as the ticket specifies', () => {
    const seedIsNumber: Exact<DuelConfig['seed'], number> = true;
    const islandIsIslandId: Exact<DuelConfig['islandId'], IslandId> = true;
    const playerLoadoutIsCannonIds: Exact<DuelConfig['playerLoadout'], readonly CannonId[]> = true;
    const rivalLoadoutIsCannonIds: Exact<DuelConfig['rivalLoadout'], readonly CannonId[]> = true;
    const templatesArePartialBySkill: Exact<
      DuelConfig['templatesBySkill'],
      Readonly<Partial<Record<SkillId, readonly Template[]>>>
    > = true;

    expect([
      seedIsNumber,
      islandIsIslandId,
      playerLoadoutIsCannonIds,
      rivalLoadoutIsCannonIds,
      templatesArePartialBySkill,
    ]).toEqual([true, true, true, true, true]);
  });

  /**
   * The override must be OPTIONAL, not required — that is what makes AC-2's amendment additive.
   * Under `exactOptionalPropertyTypes` an optional `enemyMaxHull?: number` indexes to
   * `number | undefined`, so the first probe pins the type and the second pins the optionality by
   * requiring a config that omits the field to remain assignable. A required field fails the
   * second; a field typed `number | undefined` but still required also fails it.
   */
  it('spec(T-013:AC-2) declares enemyMaxHull as an optional numeric override', () => {
    const overrideIsOptionalNumber: Exact<DuelConfig['enemyMaxHull'], number | undefined> = true;
    const omittingItStillTypechecks: DuelConfig = configFor('port_sumwich', 1);
    const supplyingItStillTypechecks: DuelConfig = configWithHullOverride('port_sumwich', 1, 28);

    expect(overrideIsOptionalNumber).toBe(true);
    expect('enemyMaxHull' in omittingItStillTypechecks).toBe(false);
    expect(supplyingItStillTypechecks.enemyMaxHull).toBe(28);
  });

  /**
   * The core's field TYPES, which no runtime assertion can see. `turnToken` is the one that
   * matters most and is the one T-013 can least prove behaviourally: this ticket only ever emits
   * token `0`, so if the type narrowed to the literal `0` the driver's staleness comparison would
   * be against a constant and T-020 could not increment it.
   */
  it('spec(T-013:AC-2) types every DuelCore field as the ticket specifies', () => {
    const seedIsNumber: Exact<DuelState['seed'], number> = true;
    const rngIsAnRng: Exact<DuelState['rng'], Rng> = true;
    const turnTokenIsNumber: Exact<DuelState['turnToken'], number> = true;
    const volleyNumberIsNumber: Exact<DuelState['volleyNumber'], number> = true;
    const islandIsIslandId: Exact<DuelState['islandId'], IslandId> = true;
    const playerHullIsNumber: Exact<DuelState['playerHull'], number> = true;
    const enemyHullIsNumber: Exact<DuelState['enemyHull'], number> = true;
    const enemyMaxHullIsNumber: Exact<DuelState['enemyMaxHull'], number> = true;
    const playerLoadoutIsCannonIds: Exact<DuelState['playerLoadout'], readonly CannonId[]> = true;
    const rivalLoadoutIsCannonIds: Exact<DuelState['rivalLoadout'], readonly CannonId[]> = true;
    const recentTemplateIdsAreStrings: Exact<DuelState['recentTemplateIds'], readonly string[]> = true;
    const actionLogIsEntries: Exact<DuelState['actionLog'], readonly ActionLogEntry[]> = true;
    const tallyIsDuelTally: Exact<DuelState['tally'], DuelTally> = true;
    const templatesArePartialBySkill: Exact<
      DuelState['templatesBySkill'],
      Readonly<Partial<Record<SkillId, readonly Template[]>>>
    > = true;

    expect([
      seedIsNumber,
      rngIsAnRng,
      turnTokenIsNumber,
      volleyNumberIsNumber,
      islandIsIslandId,
      playerHullIsNumber,
      enemyHullIsNumber,
      enemyMaxHullIsNumber,
      playerLoadoutIsCannonIds,
      rivalLoadoutIsCannonIds,
      recentTemplateIdsAreStrings,
      actionLogIsEntries,
      tallyIsDuelTally,
      templatesArePartialBySkill,
    ]).toEqual(Array.from({ length: 14 }, () => true));
  });

  it('spec(T-013:AC-2) types DuelTally as exactly the four ticket fields', () => {
    const keysAreExact: Exact<
      keyof DuelTally,
      'correctAnswers' | 'totalAnswers' | 'perfectShots' | 'bySkill'
    > = true;
    const correctIsNumber: Exact<DuelTally['correctAnswers'], number> = true;
    const totalIsNumber: Exact<DuelTally['totalAnswers'], number> = true;
    const perfectsAreNumber: Exact<DuelTally['perfectShots'], number> = true;
    const bySkillIsPartial: Exact<
      DuelTally['bySkill'],
      Readonly<Partial<Record<SkillId, { readonly correct: number; readonly attempts: number }>>>
    > = true;

    expect([keysAreExact, correctIsNumber, totalIsNumber, perfectsAreNumber, bySkillIsPartial]).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
  });
});

// ============================================================================================
// AC-3 — seed determinism
// ============================================================================================

describe('createDuelState — determinism', () => {
  it('spec(T-013:AC-3) returns deeply equal states for the same config, twice', () => {
    for (const seed of [0, 1, -1, 12345, 0xffffffff, -0xffffffff]) {
      const config = configFor('isla_products', seed);

      expect(createDuelState(config)).toStrictEqual(createDuelState(config));
    }
  });

  /**
   * Deep equality alone admits a memoising constructor that returns one cached object for a
   * repeated config. Every field is readonly, so that is confusion rather than corruption — and
   * it is still wrong: two constructions are two states. The clause was added 2026-07-28.
   */
  it('spec(T-013:AC-3) returns distinct object references for the same config, twice', () => {
    const config = configFor('isla_products', 4242);
    const first = createDuelState(config);
    const second = createDuelState(config);

    expect(first).toStrictEqual(second);
    expect(first).not.toBe(second);
  });

  /**
   * Top-level `not.toBe` alone admits `{ ...cachedCore, phase }` — distinct wrappers over a
   * shared interior. Pushing onto `first.playerLoadout` or writing through
   * `first.templatesBySkill` must not rewrite `second`. Independence is a graph property.
   */
  it('spec(T-013:AC-3) keeps two constructions as independent state graphs', () => {
    const templates: Template[] = [
      templateSchema.parse({
        id: 'add_within_10__a_plus_b',
        skill: 'add_within_10',
        text: '{a} + {b} = ?',
        params: { a: [1, 5], b: [1, 5] },
        answerExpr: 'a + b',
        distractors: ['a + b + 1', 'a + b - 1', 'a * b'],
      }),
    ];
    const config: DuelConfig = {
      ...configFor('isla_products', 4242),
      templatesBySkill: { add_within_10: templates },
    };
    const first = createDuelState(config);
    const second = createDuelState(config);

    expect(first).toStrictEqual(second);
    expect(first).not.toBe(second);

    (first.playerLoadout as CannonId[]).push('mortar');
    expect(second.playerLoadout).toEqual(['swivel_gun', 'culverin']);
    expect(second.playerLoadout).toHaveLength(2);

    (first.templatesBySkill.add_within_10 as Template[])[0]!.text = 'TAMPERED VIA FIRST';
    expect(second.templatesBySkill.add_within_10![0]!.text).toBe('{a} + {b} = ?');
  });

  it('spec(T-013:AC-3) produces an rng deeply equal across two constructions', () => {
    const config = configFor('port_sumwich', 90210);

    expect(createDuelState(config).rng).toStrictEqual(createDuelState(config).rng);
  });

  /**
   * "Derived SOLELY from `config.seed`" is the mechanism, and same-config-twice is only a
   * projection of it: an implementation seeding from `seed + playerLoadout.length` passes that
   * and fails this. Every other config field is varied while the seed is held fixed.
   */
  it('spec(T-013:AC-3) derives rng from the seed alone, ignoring every other config field', () => {
    const baseline = createDuelState(configFor('port_sumwich', 555)).rng;

    const variants: readonly DuelConfig[] = [
      { ...configFor('grandline', 555) },
      { ...configFor('port_sumwich', 555), playerLoadout: ['mortar'] },
      { ...configFor('port_sumwich', 555), rivalLoadout: ['powder_keg', 'long_nine'] },
      { ...configFor('port_sumwich', 555), templatesBySkill: {} },
    ];

    for (const config of variants) {
      expect(createDuelState(config).rng).toStrictEqual(baseline);
    }
  });
});

// ============================================================================================
// AC-4 — seed sensitivity
// ============================================================================================

describe('createDuelState — seed sensitivity', () => {
  /**
   * Every pair here is distinct MODULO 2³², which is the quantifier AC-4 carries after the
   * 2026-07-28 amendment. `createRng` boxes `seed >>> 0`, so congruent seeds are indistinguishable
   * by construction and the original universally-quantified wording was false; the companion test
   * below pins that boundary from the other side.
   */
  it('spec(T-013:AC-4) gives different rng values to seeds distinct modulo 2**32', () => {
    const pairs: readonly (readonly [number, number])[] = [
      [0, 1],
      [1, 2],
      [7, 4242],
      [0, 0xffffffff],
      [0xfffffffe, 0xffffffff],
    ];

    for (const [left, right] of pairs) {
      expect(createDuelState(configFor('port_sumwich', left)).rng).not.toStrictEqual(
        createDuelState(configFor('port_sumwich', right)).rng,
      );
    }
  });

  it('spec(T-013:AC-4) produces a distinct rng for each of many distinct seeds', () => {
    const seeds = Array.from({ length: 64 }, (_, index) => index * 7919);
    const states = seeds.map((seed) => JSON.stringify(createDuelState(configFor('grandline', seed)).rng));

    expect(new Set(states).size).toBe(seeds.length);
  });

  /**
   * The other side of AC-4's quantifier, and the reason the amendment was needed. `-n` and
   * `2³² − n` are two DISTINCT seeds both legal under `createRng`'s `[-0xffffffff, 0xffffffff]`
   * range, and both box to the same `state` — so a duel replayed from either reconstructs
   * identically. This is a property of the frozen T-001 code, not a defect this ticket may fix;
   * pinning it here stops a later reader from "correcting" AC-4 back to the false universal
   * form, and documents that `seed` is not a unique replay key over the signed domain.
   */
  it('spec(T-013:AC-4) gives congruent seeds the same rng, which is why AC-4 says modulo 2**32', () => {
    const congruentPairs: readonly (readonly [number, number])[] = [
      [-1, 0xffffffff],
      [-2, 0xfffffffe],
      [-0xffffffff, 1],
    ];

    for (const [negative, positive] of congruentPairs) {
      expect(negative >>> 0 === positive, `${negative} and ${positive} must be congruent`).toBe(true);
      expect(
        createDuelState(configFor('port_sumwich', negative)).rng,
        `seeds ${negative} and ${positive}`,
      ).toStrictEqual(createDuelState(configFor('port_sumwich', positive)).rng);
    }
  });
});

// ============================================================================================
// AC-5 — config validation
// ============================================================================================

describe('createDuelState — config validation', () => {
  it('spec(T-013:AC-5) accepts a valid config without throwing', () => {
    expect(() => createDuelState(configFor('port_sumwich', 1))).not.toThrow();
  });

  /**
   * Each case asserts the message names the OFFENDING field and does NOT name its sibling. A
   * single generic message listing every field name would satisfy a bare `/playerLoadout/`
   * match on all five cases at once (LESSONS.md L-012), so the negative half is what gives these
   * teeth.
   */
  it('spec(T-013:AC-5) rejects an empty playerLoadout, naming that field and not the other', () => {
    const thrown = captureThrow(() =>
      createDuelState({ ...configFor('port_sumwich', 1), playerLoadout: [] }),
    );

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/playerLoadout/);
    expect((thrown as Error).message).not.toMatch(/rivalLoadout/);
  });

  it('spec(T-013:AC-5) rejects an empty rivalLoadout, naming that field and not the other', () => {
    const thrown = captureThrow(() => createDuelState({ ...configFor('port_sumwich', 1), rivalLoadout: [] }));

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/rivalLoadout/);
    expect((thrown as Error).message).not.toMatch(/playerLoadout/);
  });

  /**
   * Every member of `CannonId` IS in the catalog and every member of `IslandId` HAS an
   * `ENEMY_HULL_BY_ISLAND` entry, so these two branches are unreachable through the typed API.
   * That does not make them dead: a duel doc reloaded after a mid-duel kill (PLAN.md's MVP
   * checklist) arrives as untyped JSON, which is exactly this shape. Per LESSONS.md L-015 the
   * claim gets a probe rather than an argument — the double cast is the probe, and it is
   * confined to these three tests.
   */
  it('spec(T-013:AC-5) rejects a playerLoadout naming a cannon absent from the catalog', () => {
    const thrown = captureThrow(() =>
      createDuelState({
        ...configFor('port_sumwich', 1),
        playerLoadout: ['swivel_gun', 'brass_monkey' as unknown as CannonId],
      }),
    );

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/playerLoadout/);
    expect((thrown as Error).message).not.toMatch(/rivalLoadout/);
  });

  it('spec(T-013:AC-5) rejects a rivalLoadout naming a cannon absent from the catalog', () => {
    const thrown = captureThrow(() =>
      createDuelState({
        ...configFor('port_sumwich', 1),
        rivalLoadout: ['brass_monkey' as unknown as CannonId],
      }),
    );

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/rivalLoadout/);
    expect((thrown as Error).message).not.toMatch(/playerLoadout/);
  });

  it('spec(T-013:AC-5) rejects an islandId with no ENEMY_HULL_BY_ISLAND entry, naming that field', () => {
    const thrown = captureThrow(() => createDuelState(configFor('atlantis' as unknown as IslandId, 1)));

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/islandId/);
    expect((thrown as Error).message).not.toMatch(/Loadout/);
  });

  /**
   * AC-5's seed clause, explicit since the 2026-07-28 amendment. `DuelConfig.seed` is a
   * caller-supplied REPLAY KEY, so the wave-1 contract note's "mask with `>>> 0` before calling
   * `createRng`" must not be applied to it: masking maps `NaN`, `-0.5` and `2 ** 33` all onto
   * seed `0`, aliasing three rejected seeds onto one live stream in the one module whose entire
   * purpose is replay-from-seed. Validate and throw; never mask.
   *
   * The message assertion is satisfied by both legal implementations — a `RangeError` raised by
   * `createRng` itself carries "seed" in its text, and so does a field-naming `Error` thrown by
   * `createDuelState` — so this pins the contract without choosing the mechanism.
   */
  it('spec(T-013:AC-5) rejects a seed outside createRng range, naming that field and no other', () => {
    for (const seed of [Number.NaN, 0.5, -0.5, 2 ** 33, -(2 ** 33), Number.POSITIVE_INFINITY]) {
      const thrown = captureThrow(() => createDuelState(configFor('port_sumwich', seed)));

      expect(thrown, `seed ${seed}`).toBeInstanceOf(Error);
      expect((thrown as Error).message, `seed ${seed}`).toMatch(/seed/i);
      expect((thrown as Error).message, `seed ${seed}`).not.toMatch(/Loadout|islandId/);
    }
  });

  /**
   * The masking cheat, caught behaviourally rather than by reading the implementation. Under
   * `rawSeed >>> 0` every seed below collapses to `0`, which is a VALID seed — so a masking
   * implementation returns a perfectly well-formed duel whose stream is indistinguishable from
   * `seed: 0`'s. Asserting the throw above already kills that, but this states the consequence
   * directly so the next reader sees why the clause exists rather than deleting it as redundant.
   */
  it('spec(T-013:AC-5) does not mask a rejected seed onto the legal seed 0', () => {
    const fromZero = createDuelState(configFor('port_sumwich', 0));

    for (const masked of [Number.NaN, 2 ** 33, -0.5]) {
      expect(masked >>> 0, `${masked} masks to 0`).toBe(0);
      expect(
        () => createDuelState(configFor('port_sumwich', masked)),
        `seed ${masked} must not become seed 0`,
      ).toThrow(Error);
    }

    expect(fromZero.seed).toBe(0);
  });

  // The seed boundary from the accepting side. Without this, an implementation that rejected
  // EVERY seed would satisfy every rejection test above.
  it('spec(T-013:AC-5) accepts the extremes of the legal seed range', () => {
    for (const seed of [0, 1, -1, 0xffffffff, -0xffffffff]) {
      expect(() => createDuelState(configFor('port_sumwich', seed)), `seed ${seed}`).not.toThrow();
    }
  });
});

// ============================================================================================
// AC-6 — the state is plain JSON (the mid-duel relaunch test)
// ============================================================================================

describe('DuelState serialisation', () => {
  it('spec(T-013:AC-6) round-trips a state in every phase through JSON, exactly', () => {
    for (const state of ALL_PHASE_STATES) {
      expect(JSON.parse(JSON.stringify(state)), `phase ${state.phase}`).toStrictEqual(state);
    }
  });

  /**
   * The action log is a WIRE FORMAT. Structural equality tolerates a re-ordered or re-keyed
   * encoding; byte identity of the serialised form does not, and that is what a persisted duel
   * doc actually has to survive.
   */
  it('spec(T-013:AC-6) is byte-identical when re-serialised after a round-trip, in every phase', () => {
    for (const state of ALL_PHASE_STATES) {
      const wire = JSON.stringify(state);

      expect(JSON.stringify(JSON.parse(wire)), `phase ${state.phase}`).toBe(wire);
    }
  });

  it('spec(T-013:AC-6) dod(T-013:5) holds no function, Map, Set, class instance or undefined-valued key', () => {
    for (const state of ALL_PHASE_STATES) {
      expectPlainJsonValue(state, `state(${state.phase})`);
    }
  });

  it('spec(T-013:AC-6) round-trips the freshly-constructed state for every island', () => {
    for (const islandId of ALL_ISLAND_IDS) {
      const state = createDuelState(configFor(islandId, 31337));

      expectPlainJsonValue(state, `createDuelState(${islandId})`);
      expect(JSON.parse(JSON.stringify(state))).toStrictEqual(state);
      expect(JSON.stringify(JSON.parse(JSON.stringify(state)))).toBe(JSON.stringify(state));
    }
  });

  it('spec(T-013:AC-6) carries a non-zero turnToken through serialisation unchanged', () => {
    const state = STATE_BY_PHASE.resolveRival;

    expect(state.turnToken).toBe(3);
    expect(JSON.parse(JSON.stringify(state)).turnToken).toBe(3);
  });

  // The compile-time half of "no undefined-valued keys": `Partial<Record<...>>` under
  // `exactOptionalPropertyTypes` rejects an explicit `undefined`, so the hole cannot be opened by
  // typing the pool as `Record<SkillId, readonly Template[] | undefined>` instead.
  it('spec(T-013:AC-6) does not accept an explicitly undefined template-pool entry', () => {
    const config: DuelConfig = {
      ...configFor('port_sumwich', 1),
      // @ts-expect-error an absent skill must be OMITTED, never present with an undefined value.
      templatesBySkill: { add_within_10: undefined },
    };

    expect(config.seed).toBe(1);
  });
});

// ============================================================================================
// AC-7 — the terminal-phase predicate
// ============================================================================================

describe('isTerminalPhase', () => {
  it('spec(T-013:AC-7) returns true for victory and defeat only, over all eight phases', () => {
    expect({
      countdown: isTerminalPhase('countdown'),
      playerChoose: isTerminalPhase('playerChoose'),
      reload: isTerminalPhase('reload'),
      resolvePlayer: isTerminalPhase('resolvePlayer'),
      rivalTurn: isTerminalPhase('rivalTurn'),
      resolveRival: isTerminalPhase('resolveRival'),
      victory: isTerminalPhase('victory'),
      defeat: isTerminalPhase('defeat'),
    }).toStrictEqual(TERMINAL_BY_PHASE);
  });

  it('spec(T-013:AC-7) reports exactly two terminal phases, not more and not fewer', () => {
    const terminal = EXPECTED_PHASES.filter((phase) => isTerminalPhase(phase));

    expect(terminal).toEqual(['victory', 'defeat']);
  });

  it('spec(T-013:AC-7) declares the isTerminalPhase signature the ticket specifies', () => {
    const takesADuelPhase: Exact<Parameters<typeof isTerminalPhase>[0], DuelPhase> = true;
    const returnsBoolean: Exact<ReturnType<typeof isTerminalPhase>, boolean> = true;

    expect([takesADuelPhase, returnsBoolean]).toEqual([true, true]);
  });

  it('spec(T-013:AC-7) does not accept a non-phase argument', () => {
    // @ts-expect-error 'reloading' is not a DuelPhase — the parameter must not widen to string.
    const result = isTerminalPhase('reloading');

    expect(typeof result).toBe('boolean');
  });
});

// ============================================================================================
// AC-8 — the rival projection and its information hiding
// ============================================================================================

describe('toRivalView', () => {
  it('spec(T-013:AC-8) returns exactly the six RivalView keys', () => {
    const view = toRivalView(STATE_BY_PHASE.reload);

    expect(Object.keys(view).sort()).toEqual([...EXPECTED_RIVAL_VIEW_KEYS].sort());
  });

  /**
   * Projected FROM a `reload` state on purpose. AC-8 requires the view to carry no `question`,
   * and a countdown state has none to leak — checking there would pass vacuously whatever the
   * implementation did (LESSONS.md L-014).
   */
  it('spec(T-013:AC-8) leaks no rng, seed, question or actionLog out of a reload state', () => {
    const view = toRivalView(STATE_BY_PHASE.reload);

    expect('rng' in view).toBe(false);
    expect('seed' in view).toBe(false);
    expect('question' in view).toBe(false);
    expect('actionLog' in view).toBe(false);
  });

  it('spec(T-013:AC-8) leaks nothing in any phase, including the phase discriminant itself', () => {
    for (const state of ALL_PHASE_STATES) {
      const view = toRivalView(state);

      expect(Object.keys(view).sort(), `phase ${state.phase}`).toEqual([...EXPECTED_RIVAL_VIEW_KEYS].sort());
      for (const hidden of ['rng', 'seed', 'question', 'actionLog', 'phase', 'templatesBySkill', 'tally']) {
        expect(hidden in view, `phase ${state.phase} must not expose ${hidden}`).toBe(false);
      }
    }
  });

  // The key set alone is satisfied by a projection returning six zeros. The fixture gives every
  // numeric field a different value so a constant, or a read of the wrong field, cannot pass.
  it('spec(T-013:AC-8) copies each value from its matching state field', () => {
    const state = STATE_BY_PHASE.reload;
    const view = toRivalView(state);

    expect(view.volleyNumber).toBe(state.volleyNumber);
    expect(view.playerHull).toBe(state.playerHull);
    expect(view.enemyHull).toBe(state.enemyHull);
    expect(view.enemyMaxHull).toBe(state.enemyMaxHull);
  });

  it('spec(T-013:AC-8) exposes the rival loadout, never the player loadout', () => {
    const view = toRivalView(STATE_BY_PHASE.reload);

    expect(view.rivalLoadout).toEqual(['six_pounder', 'mortar', 'long_nine']);
    expect(view.rivalLoadout).not.toEqual(FIXTURE_PLAYER_LOADOUT);
  });

  it('spec(T-013:AC-8) declares RivalView as exactly the six ticket fields, correctly typed', () => {
    const keysAreExact: Exact<
      keyof RivalView,
      'volleyNumber' | 'playerHull' | 'enemyHull' | 'enemyMaxHull' | 'rivalLoadout' | 'playerRecentCorrect'
    > = true;
    const volleyNumberIsNumber: Exact<RivalView['volleyNumber'], number> = true;
    const playerHullIsNumber: Exact<RivalView['playerHull'], number> = true;
    const enemyHullIsNumber: Exact<RivalView['enemyHull'], number> = true;
    const enemyMaxHullIsNumber: Exact<RivalView['enemyMaxHull'], number> = true;
    const loadoutIsCannonIds: Exact<RivalView['rivalLoadout'], readonly CannonId[]> = true;
    const recentCorrectIsBooleans: Exact<RivalView['playerRecentCorrect'], readonly boolean[]> = true;

    expect([
      keysAreExact,
      volleyNumberIsNumber,
      playerHullIsNumber,
      enemyHullIsNumber,
      enemyMaxHullIsNumber,
      loadoutIsCannonIds,
      recentCorrectIsBooleans,
    ]).toEqual(Array.from({ length: 7 }, () => true));
  });

  it('spec(T-013:AC-8) declares the toRivalView signature the ticket specifies', () => {
    const takesADuelState: Exact<Parameters<typeof toRivalView>[0], DuelState> = true;
    const returnsARivalView: Exact<ReturnType<typeof toRivalView>, RivalView> = true;

    expect([takesADuelState, returnsARivalView]).toEqual([true, true]);
  });

  it('spec(T-013:AC-8) does not expose the seed on the returned view, even to a cast-free read', () => {
    const view = toRivalView(STATE_BY_PHASE.victory);

    // @ts-expect-error `seed` is deliberately absent from RivalView — an opponent must not see it.
    const leaked = view.seed;

    expect(leaked).toBeUndefined();
  });
});

// ============================================================================================
// AC-9 — playerRecentCorrect
// ============================================================================================

describe('toRivalView — playerRecentCorrect', () => {
  /**
   * The expected value is written as a literal, not computed by re-implementing filter+reverse
   * in the test, so the expectation cannot share a bug with the code it checks. See FIXTURE_LOG
   * for the four readings this fixture separates.
   */
  it('spec(T-013:AC-9) lists the player entries only, most-recent-first', () => {
    expect(toRivalView(STATE_BY_PHASE.reload).playerRecentCorrect).toEqual([false, false, true]);
  });

  it('spec(T-013:AC-9) is neither the chronological order nor the unfiltered list', () => {
    const recent = toRivalView(STATE_BY_PHASE.reload).playerRecentCorrect;

    expect(recent).not.toEqual([true, false, false]);
    expect(recent).not.toEqual([true, false, false, true, true]);
    expect(recent).not.toEqual([true, true, false, false, true]);
  });

  it('spec(T-013:AC-9) is empty for a duel that has logged nothing yet', () => {
    expect(toRivalView(createDuelState(configFor('port_sumwich', 1))).playerRecentCorrect).toEqual([]);
  });

  it('spec(T-013:AC-9) drops rival entries even when every rival answer was correct', () => {
    const rivalOnly: DuelState = {
      ...CORE,
      phase: 'rivalTurn',
      actionLog: [
        { actor: 'rival', cannonId: 'mortar', correct: true, elapsedMs: 700 },
        { actor: 'rival', cannonId: 'long_nine', correct: true, elapsedMs: 900 },
      ],
    };

    expect(toRivalView(rivalOnly).playerRecentCorrect).toEqual([]);
  });

  /**
   * Length is an input dimension nothing else here varies (LESSONS.md L-017), and it is the
   * dimension a hidden `slice(0, BOT_ACCURACY_WINDOW)` would hide in. The count is derived from
   * the tuning constant a truncation would most plausibly use, so this cannot go stale if that
   * window is retuned.
   */
  it('spec(T-013:AC-9) truncates nothing, even past BOT_ACCURACY_WINDOW entries', () => {
    const count = BOT_ACCURACY_WINDOW + 3;
    // Correct for the first half of the duel, wrong for the second — a shape whose reverse is
    // never equal to itself for count > 1.
    const chronological = Array.from({ length: count }, (_, index) => index * 2 < count);
    const state: DuelState = {
      ...CORE,
      phase: 'playerChoose',
      actionLog: chronological.map((correct, index) => ({
        actor: 'player' as const,
        cannonId: 'swivel_gun' as const,
        correct,
        elapsedMs: 1000 + index,
      })),
    };

    /**
     * Fixture precondition, asserted rather than assumed (LESSONS.md L-020). A palindromic pattern
     * makes reversal a no-op, and every assertion below would then pass just as happily against an
     * implementation that never reverses at all. The first draft of this test used `index % 3 !== 0`
     * over 13 entries, which IS a palindrome — the probe run caught it, this line keeps it caught.
     */
    expect(chronological, 'fixture must not be palindromic').not.toEqual([...chronological].reverse());

    const recent = toRivalView(state).playerRecentCorrect;

    expect(recent).toHaveLength(count);
    expect(recent).toEqual([...chronological].reverse());
    expect(recent).not.toEqual(chronological);
  });
});

// ============================================================================================
// AC-10 — the union actually discriminates
// ============================================================================================

/**
 * Reads the `reload` extras with NO cast anywhere in the narrowed block. The annotated return
 * type pins their types too, so a `question: unknown` would fail here rather than silently
 * pushing the cast into T-020.
 *
 * This is also the POSITIVE control for the `@ts-expect-error` probes below: those directives are
 * satisfied by any error at all, so on their own they would also be satisfied by a `DuelState`
 * that had no `question` field in any phase. This function failing to compile is what rules that
 * out.
 */
function readReloadExtras(
  state: DuelState,
): { readonly cannonId: CannonId; readonly question: Question; readonly timerMs: number } | null {
  if (state.phase === 'reload') {
    return { cannonId: state.cannonId, question: state.question, timerMs: state.timerMs };
  }
  return null;
}

function readResolvePlayerExtras(
  state: DuelState,
): { readonly cannonId: CannonId; readonly outcome: ShotOutcome } | null {
  if (state.phase === 'resolvePlayer') {
    return { cannonId: state.cannonId, outcome: state.outcome };
  }
  return null;
}

function readTerminalResult(state: DuelState): DuelResult | null {
  if (state.phase === 'victory' || state.phase === 'defeat') {
    return state.result;
  }
  return null;
}

function readResolveRivalExtras(
  state: DuelState,
): { readonly volley: RivalVolley; readonly damageToPlayer: number } | null {
  if (state.phase === 'resolveRival') {
    return { volley: state.volley, damageToPlayer: state.damageToPlayer };
  }
  return null;
}

describe('DuelState discrimination', () => {
  it('spec(T-013:AC-10) exposes cannonId, question and timerMs once narrowed to reload', () => {
    const extras = readReloadExtras(STATE_BY_PHASE.reload);

    expect(extras).not.toBeNull();
    expect(extras?.cannonId).toBe('swivel_gun');
    expect(extras?.question).toStrictEqual(FIXTURE_QUESTION);
    expect(extras?.timerMs).toBe(getCannon('swivel_gun').timerMs);
  });

  it('spec(T-013:AC-10) exposes cannonId and outcome once narrowed to resolvePlayer', () => {
    const extras = readResolvePlayerExtras(STATE_BY_PHASE.resolvePlayer);

    expect(extras).not.toBeNull();
    expect(extras?.cannonId).toBe('swivel_gun');
    expect(extras?.outcome).toStrictEqual(FIXTURE_OUTCOME);
  });

  it('spec(T-013:AC-10) exposes volley and damageToPlayer once narrowed to resolveRival', () => {
    const extras = readResolveRivalExtras(STATE_BY_PHASE.resolveRival);

    expect(extras).not.toBeNull();
    expect(extras?.volley).toStrictEqual(FIXTURE_VOLLEY);
    expect(extras?.damageToPlayer).toBe(9);
  });

  it('spec(T-013:AC-10) exposes result once narrowed to victory or defeat', () => {
    expect(readTerminalResult(STATE_BY_PHASE.victory)).toStrictEqual({
      won: true,
      tally: FIXTURE_TALLY,
      volleys: 5,
    });
    expect(readTerminalResult(STATE_BY_PHASE.defeat)).toStrictEqual({
      won: false,
      tally: FIXTURE_TALLY,
      volleys: 6,
    });
  });

  it('spec(T-013:AC-10) yields no extras for the three phases that add none', () => {
    expect(readReloadExtras(STATE_BY_PHASE.countdown)).toBeNull();
    expect(readReloadExtras(STATE_BY_PHASE.playerChoose)).toBeNull();
    expect(readReloadExtras(STATE_BY_PHASE.rivalTurn)).toBeNull();
    expect(readResolvePlayerExtras(STATE_BY_PHASE.rivalTurn)).toBeNull();
    expect(readTerminalResult(STATE_BY_PHASE.countdown)).toBeNull();
  });

  it('spec(T-013:AC-10) makes question inaccessible on a state narrowed to playerChoose', () => {
    const state: DuelState = STATE_BY_PHASE.playerChoose;
    let seen: unknown = 'unset';

    if (state.phase === 'playerChoose') {
      // @ts-expect-error `question` belongs to the reload variant only — this must not compile.
      seen = state.question;
    }

    expect(seen).toBeUndefined();
  });

  it('spec(T-013:AC-10) makes question inaccessible on a state narrowed to resolvePlayer', () => {
    const state: DuelState = STATE_BY_PHASE.resolvePlayer;
    let seen: unknown = 'unset';

    if (state.phase === 'resolvePlayer') {
      // @ts-expect-error `question` belongs to the reload variant only — this must not compile.
      seen = state.question;
    }

    expect(seen).toBeUndefined();
  });

  it('spec(T-013:AC-10) makes result inaccessible on a state narrowed to countdown', () => {
    const state: DuelState = STATE_BY_PHASE.countdown;
    let seen: unknown = 'unset';

    if (state.phase === 'countdown') {
      // @ts-expect-error `result` belongs to victory/defeat only — this must not compile.
      seen = state.result;
    }

    expect(seen).toBeUndefined();
  });

  it('spec(T-013:AC-10) makes outcome inaccessible on a state narrowed to reload', () => {
    const state: DuelState = STATE_BY_PHASE.reload;
    let seen: unknown = 'unset';

    if (state.phase === 'reload') {
      // @ts-expect-error `outcome` belongs to the resolvePlayer variant only.
      seen = state.outcome;
    }

    expect(seen).toBeUndefined();
  });

  it('spec(T-013:AC-10) rejects a reload state built without its question', () => {
    // @ts-expect-error the reload variant requires cannonId, question and timerMs.
    const state: DuelState = { ...CORE, phase: 'reload', cannonId: 'swivel_gun', timerMs: 20000 };

    expect(state.phase).toBe('reload');
  });

  it('spec(T-013:AC-10) rejects extras attached to a phase that declares none', () => {
    const state: DuelState = {
      ...CORE,
      phase: 'countdown',
      // @ts-expect-error countdown adds nothing; a stray question must not typecheck.
      question: FIXTURE_QUESTION,
    };

    expect(state.phase).toBe('countdown');
  });
});

// ============================================================================================
// AC-11 — the action-log wire shape
// ============================================================================================

describe('ActionLogEntry', () => {
  const entry: ActionLogEntry = {
    actor: 'player',
    cannonId: 'culverin',
    correct: false,
    elapsedMs: 4300,
  };

  it('spec(T-013:AC-11) is constructible from exactly the four required fields', () => {
    expect(Object.keys(entry).sort()).toEqual([...REQUIRED_ACTION_LOG_FIELDS].sort());
  });

  it('spec(T-013:AC-11) carries each required field with the value it was given', () => {
    expect(entry.actor).toBe('player');
    expect(entry.cannonId).toBe('culverin');
    expect(entry.correct).toBe(false);
    expect(entry.elapsedMs).toBe(4300);
  });

  it('spec(T-013:AC-11) round-trips a four-field entry through JSON unchanged', () => {
    expect(JSON.parse(JSON.stringify(entry))).toStrictEqual(entry);
    expect(JSON.stringify(JSON.parse(JSON.stringify(entry)))).toBe(JSON.stringify(entry));
  });

  /**
   * The omission-not-undefined guarantee, written so it does not need to name the field T-022
   * will add. A key present with value `undefined` survives `Object.keys` and vanishes from the
   * JSON, so comparing the key sets ACROSS the round-trip is what detects it — `toEqual` alone
   * would not, because it treats an undefined-valued key as absent.
   */
  it('spec(T-013:AC-11) keeps its key set identical across serialisation, with no undefined values', () => {
    for (const logged of [...FIXTURE_LOG, entry]) {
      const revived = JSON.parse(JSON.stringify(logged)) as Record<string, unknown>;

      expect(Object.keys(revived).sort()).toEqual(Object.keys(logged).sort());
      expect(Object.values(logged).every((value) => value !== undefined)).toBe(true);
      expectPlainJsonValue(logged, 'actionLogEntry');
    }
  });

  it('spec(T-013:AC-11) round-trips a whole action log in field order', () => {
    const wire = JSON.stringify(FIXTURE_LOG);

    expect(JSON.parse(wire)).toStrictEqual(FIXTURE_LOG);
    expect(JSON.stringify(JSON.parse(wire))).toBe(wire);
  });

  /**
   * The four field TYPES. A lazy implementation typing `actor` and `cannonId` as `string` keeps
   * every runtime assertion in this file green while handing T-020 and T-024 a log they cannot
   * dispatch on — the exact shape of the ten-`z.string()`-fields defect in LESSONS.md L-012.
   *
   * Deliberately NOT `Exact<keyof ActionLogEntry, ...>`: AC-11 specifies a required set that
   * tolerates documented optional additions, and a closedness assertion here would pre-break
   * T-022's `doubleShot?` in wave 6.
   */
  it('spec(T-013:AC-11) types the four required fields, none of them widened to string', () => {
    const actorIsTheTwoActors: Exact<ActionLogEntry['actor'], 'player' | 'rival'> = true;
    const cannonIdIsCannonId: Exact<ActionLogEntry['cannonId'], CannonId> = true;
    const correctIsBoolean: Exact<ActionLogEntry['correct'], boolean> = true;
    const elapsedMsIsNumber: Exact<ActionLogEntry['elapsedMs'], number> = true;

    expect([actorIsTheTwoActors, cannonIdIsCannonId, correctIsBoolean, elapsedMsIsNumber]).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it('spec(T-013:AC-11) declares every field readonly', () => {
    const everyFieldIsReadonly: IsFullyReadonly<ActionLogEntry> = true;

    expect(everyFieldIsReadonly).toBe(true);
  });

  it('spec(T-013:AC-11) requires actor', () => {
    // @ts-expect-error `actor` is required.
    const missing: ActionLogEntry = { cannonId: 'culverin', correct: false, elapsedMs: 4300 };

    expect(missing.cannonId).toBe('culverin');
  });

  it('spec(T-013:AC-11) requires cannonId', () => {
    // @ts-expect-error `cannonId` is required.
    const missing: ActionLogEntry = { actor: 'player', correct: false, elapsedMs: 4300 };

    expect(missing.actor).toBe('player');
  });

  it('spec(T-013:AC-11) requires correct', () => {
    // @ts-expect-error `correct` is required.
    const missing: ActionLogEntry = { actor: 'player', cannonId: 'culverin', elapsedMs: 4300 };

    expect(missing.actor).toBe('player');
  });

  it('spec(T-013:AC-11) requires elapsedMs', () => {
    // @ts-expect-error `elapsedMs` is required.
    const missing: ActionLogEntry = { actor: 'player', cannonId: 'culverin', correct: false };

    expect(missing.actor).toBe('player');
  });

  it('spec(T-013:AC-11) rejects an actor outside player | rival', () => {
    const bad: ActionLogEntry = {
      // @ts-expect-error only 'player' and 'rival' act in a duel.
      actor: 'kraken',
      cannonId: 'culverin',
      correct: false,
      elapsedMs: 4300,
    };

    expect(bad.cannonId).toBe('culverin');
  });

  it('spec(T-013:AC-11) rejects a cannonId absent from the catalog union', () => {
    const bad: ActionLogEntry = {
      actor: 'player',
      // @ts-expect-error `cannonId` must be a CannonId, never an arbitrary string.
      cannonId: 'brass_monkey',
      correct: false,
      elapsedMs: 4300,
    };

    expect(bad.actor).toBe('player');
  });
});

// ============================================================================================
// AC-12 — the state is immutable by contract
// ============================================================================================

/**
 * A throwaway state whose arrays are fresh, unfrozen copies. `readonly` is erased at runtime, so
 * the `@ts-expect-error` probes below DO execute their assignments; the probe run proved they
 * corrupted the shared fixture and made a later assertion order-dependent. Each probe gets its own
 * state, and the shared fixtures are frozen, so neither route is open any more.
 */
function disposableState(): DuelState {
  return {
    ...CORE,
    phase: 'playerChoose',
    actionLog: FIXTURE_LOG.map((entry) => ({ ...entry })),
    playerLoadout: [...FIXTURE_PLAYER_LOADOUT],
  };
}

describe('DuelState immutability', () => {
  it('spec(T-013:AC-12) types actionLog and playerLoadout as readonly arrays', () => {
    const actionLogIsReadonly: Exact<DuelState['actionLog'], readonly ActionLogEntry[]> = true;
    const playerLoadoutIsReadonly: Exact<DuelState['playerLoadout'], readonly CannonId[]> = true;

    expect([actionLogIsReadonly, playerLoadoutIsReadonly]).toEqual([true, true]);
  });

  it('spec(T-013:AC-12) refuses to reassign actionLog or playerLoadout', () => {
    const state = disposableState();

    // @ts-expect-error `actionLog` is a readonly property.
    state.actionLog = [];
    // @ts-expect-error `playerLoadout` is a readonly property.
    state.playerLoadout = [];

    expect(state.phase).toBe('playerChoose');
  });

  it('spec(T-013:AC-12) refuses to push onto actionLog or playerLoadout', () => {
    const state = disposableState();

    // @ts-expect-error a readonly array has no `push`.
    state.actionLog.push({ actor: 'rival', cannonId: 'mortar', correct: true, elapsedMs: 1 });
    // @ts-expect-error a readonly array has no `push`.
    state.playerLoadout.push('mortar');

    expect(state.phase).toBe('playerChoose');
  });

  it('spec(T-013:AC-12) refuses to assign into an actionLog or playerLoadout index', () => {
    const state = disposableState();

    // @ts-expect-error a readonly array index is not assignable.
    state.actionLog[0] = { actor: 'rival', cannonId: 'mortar', correct: true, elapsedMs: 1 };
    // @ts-expect-error a readonly array index is not assignable.
    state.playerLoadout[0] = 'mortar';

    expect(state.phase).toBe('playerChoose');
  });

  /**
   * The negative control for the three probes above. Every `@ts-expect-error` is satisfied by ANY
   * error on its line, so without this they would also be satisfied by a `push` that fails for an
   * unrelated reason (a wrong element type, say). Copying into a mutable array and pushing the
   * SAME values must compile cleanly — which localises the failures above to readonly-ness.
   */
  it('spec(T-013:AC-12) still allows reading, and allows push on a mutable copy', () => {
    const state = disposableState();
    const logCopy: ActionLogEntry[] = [...state.actionLog];
    const loadoutCopy: CannonId[] = [...state.playerLoadout];

    logCopy.push({ actor: 'rival', cannonId: 'mortar', correct: true, elapsedMs: 1 });
    loadoutCopy.push('mortar');

    expect(state.actionLog).toHaveLength(FIXTURE_LOG.length);
    expect(logCopy).toHaveLength(FIXTURE_LOG.length + 1);
    expect(state.playerLoadout).toHaveLength(FIXTURE_PLAYER_LOADOUT.length);
    expect(loadoutCopy).toHaveLength(FIXTURE_PLAYER_LOADOUT.length + 1);
  });

  /**
   * Integrity check on the shared fixtures themselves. If any probe in this file ever mutates them,
   * this fails loudly here rather than as a confusing order-dependent failure somewhere else.
   */
  it('spec(T-013:AC-12) leaves the shared fixtures untouched by every probe above', () => {
    expect(FIXTURE_LOG).toHaveLength(5);
    expect(FIXTURE_LOG.map((entry) => entry.actor)).toEqual(['player', 'rival', 'player', 'player', 'rival']);
    expect(FIXTURE_PLAYER_LOADOUT).toEqual(['swivel_gun', 'culverin']);
    expect(Object.isFrozen(FIXTURE_LOG)).toBe(true);
    expect(Object.isFrozen(FIXTURE_PLAYER_LOADOUT)).toBe(true);
  });
});

// ============================================================================================
// AC-13 — the event union, per variant
//
// Covered by a numbered criterion since the 2026-07-28 amendment. Before it, these assertions
// carried a NAMED dod tag, which spec-lint cannot parse — it reads a bold AC id and a NUMBERED
// dod tag and nothing else, so the ticket's most-imported shape was enforced by tests no gate
// could see (LESSONS.md L-032, L-036). Tag ids are written only where they are meant to count;
// prose in this file deliberately spells them out longhand instead, because a tag-shaped string
// in a comment inflates every downstream count that greps for it.
// ============================================================================================

describe('DuelEvent', () => {
  const cannonSelected: DuelEvent = { type: 'CANNON_SELECTED', cannonId: 'swivel_gun' };
  const answerChosen: DuelEvent = { type: 'ANSWER_CHOSEN', choiceIndex: 2, elapsedMs: 1500 };
  const timerExpired: DuelEvent = { type: 'TIMER_EXPIRED' };
  const animationDone: DuelEvent = { type: 'ANIMATION_DONE' };
  const rivalAction: DuelEvent = { type: 'RIVAL_ACTION', volley: FIXTURE_VOLLEY };
  const events: readonly DuelEvent[] = [
    cannonSelected,
    answerChosen,
    timerExpired,
    animationDone,
    rivalAction,
  ];

  it('spec(T-013:AC-13) is constructible for exactly the five ARCHITECTURE.md §4.2 event types', () => {
    expect(events.map((event) => event.type)).toEqual([
      'CANNON_SELECTED',
      'ANSWER_CHOSEN',
      'TIMER_EXPIRED',
      'ANIMATION_DONE',
      'RIVAL_ACTION',
    ]);
    expect(events).toHaveLength(EXPECTED_EVENT_TYPES.length);
  });

  // T-022 adds `DOUBLE_SHOT_SELECTED` in wave 6 and this assertion is DESIGNED to go red when it
  // does — the ticket's DoD asks for exactly that, so the sixth event lands as a reviewed patch to
  // this line rather than silently widening what the frozen suite means.
  it('spec(T-013:AC-13) dod(T-013:6) declares the event discriminant as exactly those five literals', () => {
    const eventTypesAreExact: Exact<
      DuelEvent['type'],
      'CANNON_SELECTED' | 'ANSWER_CHOSEN' | 'TIMER_EXPIRED' | 'ANIMATION_DONE' | 'RIVAL_ACTION'
    > = true;

    expect(eventTypesAreExact).toBe(true);
  });

  /**
   * The assertion the first draft of this suite was missing, and the reason AC-13 exists.
   *
   * Constraining `DuelEvent['type']` (above) and the runtime keys of hand-written fixture values
   * (below) are BOTH blind to an extra OPTIONAL field on a single variant: the discriminant is
   * unchanged, and a fixture simply omits the optional key. Adding `readonly debug?: string` to
   * the `CANNON_SELECTED` variant typechecked clean and passed this file 100/100 — independently
   * reproduced here before this test was written.
   *
   * `Exact<Extract<DuelEvent, {type: …}>, {…}>` closes it, because `Exact` is invariant and an
   * optional property makes the two sides structurally different. The negative control in the
   * AC-13/AC-14 apparatus block proves this probe can still report `false`.
   */
  it('spec(T-013:AC-13) declares each variant with exactly its documented payload and no other', () => {
    const cannonSelectedIsExact: Exact<
      Extract<DuelEvent, { type: 'CANNON_SELECTED' }>,
      { readonly type: 'CANNON_SELECTED'; readonly cannonId: CannonId }
    > = true;
    const answerChosenIsExact: Exact<
      Extract<DuelEvent, { type: 'ANSWER_CHOSEN' }>,
      { readonly type: 'ANSWER_CHOSEN'; readonly choiceIndex: number; readonly elapsedMs: number }
    > = true;
    const timerExpiredIsExact: Exact<
      Extract<DuelEvent, { type: 'TIMER_EXPIRED' }>,
      { readonly type: 'TIMER_EXPIRED' }
    > = true;
    const animationDoneIsExact: Exact<
      Extract<DuelEvent, { type: 'ANIMATION_DONE' }>,
      { readonly type: 'ANIMATION_DONE' }
    > = true;
    const rivalActionIsExact: Exact<
      Extract<DuelEvent, { type: 'RIVAL_ACTION' }>,
      { readonly type: 'RIVAL_ACTION'; readonly volley: RivalVolley }
    > = true;

    expect([
      cannonSelectedIsExact,
      answerChosenIsExact,
      timerExpiredIsExact,
      animationDoneIsExact,
      rivalActionIsExact,
    ]).toEqual([true, true, true, true, true]);
  });

  // Every variant is `readonly` throughout, not just present. Same L-012 gap as AC-14: the
  // per-variant `Exact<>` above WOULD catch a mutable field, but only because the right-hand
  // literals spell `readonly` — this states the property directly so it survives a future edit.
  it('spec(T-013:AC-13) declares every event payload field readonly', () => {
    const eventIsReadonly: IsFullyReadonly<DuelEvent> = true;

    expect(eventIsReadonly).toBe(true);
  });

  it('spec(T-013:AC-13) carries the payload each event type declares, and no other key', () => {
    expect(Object.keys(cannonSelected).sort()).toEqual(['cannonId', 'type']);
    expect(Object.keys(answerChosen).sort()).toEqual(['choiceIndex', 'elapsedMs', 'type']);
    expect(Object.keys(timerExpired)).toEqual(['type']);
    expect(Object.keys(animationDone)).toEqual(['type']);
    expect(Object.keys(rivalAction).sort()).toEqual(['type', 'volley']);
  });

  it('spec(T-013:AC-13) round-trips every event through JSON as plain data', () => {
    for (const event of events) {
      expectPlainJsonValue(event, `event(${event.type})`);
      expect(JSON.parse(JSON.stringify(event))).toStrictEqual(event);
    }
  });

  it('spec(T-013:AC-13) narrows RIVAL_ACTION to a RivalVolley payload', () => {
    let volley: RivalVolley | null = null;

    if (rivalAction.type === 'RIVAL_ACTION') {
      volley = rivalAction.volley;
    }

    expect(volley).toStrictEqual(FIXTURE_VOLLEY);
  });

  it('spec(T-013:AC-13) narrows ANSWER_CHOSEN to a choiceIndex and an elapsedMs', () => {
    let payload: readonly [number, number] | null = null;

    if (answerChosen.type === 'ANSWER_CHOSEN') {
      payload = [answerChosen.choiceIndex, answerChosen.elapsedMs];
    }

    expect(payload).toEqual([2, 1500]);
  });

  it('spec(T-013:AC-13) makes cannonId inaccessible on a TIMER_EXPIRED event', () => {
    let seen: unknown = 'unset';

    if (timerExpired.type === 'TIMER_EXPIRED') {
      // @ts-expect-error TIMER_EXPIRED carries no payload.
      seen = timerExpired.cannonId;
    }

    expect(seen).toBeUndefined();
  });

  // Uses a name no ticket will ever add, so this probe cannot turn into an unused directive the
  // day a real sixth event arrives.
  it('spec(T-013:AC-13) rejects an event type outside the union', () => {
    // @ts-expect-error 'NOT_A_DUEL_EVENT' is not a DuelEvent type.
    const event: DuelEvent = { type: 'NOT_A_DUEL_EVENT' };

    expect(event.type).toBe('NOT_A_DUEL_EVENT');
  });
});

// ============================================================================================
// AC-15 — the closed rival and result shapes
//
// Unlike `ActionLogEntry`, which AC-11 deliberately leaves open for T-022's `doubleShot?`, these
// three are CLOSED by design: whole-interface `Exact<>` here means a rival Double-Shot has to
// arrive as a reviewed patch to this criterion. That is the intended fail-loud behaviour, upheld
// on review, not an oversight.
//
// The AC-15 that shipped is the orchestrator's rewrite of a proposal this file's author drafted
// wrongly: the draft required `RivalVolley`'s "actions" to be ordered, and `RivalVolley` has no
// `actions` field — it is one volley (`{cannonId, correct, elapsedMs}`), not a collection. The
// shipped wording is correct and is what these tests assert.
// ============================================================================================

describe('RivalAction, RivalVolley and DuelResult', () => {
  /**
   * Whole-interface exactness, which is what AC-15 asks for. The per-field and `keyof` probes
   * below are kept because they localise a failure to the offending field, but they are not what
   * closes the shape: `keyof` cannot see an added OPTIONAL property (it widens the key union, but
   * a `keyof` assertion listing the old keys then simply fails for the right reason only by luck)
   * and per-field probes cannot see an extra field at all. These three do.
   */
  it('spec(T-013:AC-15) declares all three shapes exactly, field for field, with no extras', () => {
    const rivalActionIsExact: Exact<RivalAction, { readonly cannonId: CannonId }> = true;
    const rivalVolleyIsExact: Exact<
      RivalVolley,
      { readonly cannonId: CannonId; readonly correct: boolean; readonly elapsedMs: number }
    > = true;
    const duelResultIsExact: Exact<
      DuelResult,
      { readonly won: boolean; readonly tally: DuelTally; readonly volleys: number }
    > = true;

    expect([rivalActionIsExact, rivalVolleyIsExact, duelResultIsExact]).toEqual([true, true, true]);
  });

  it('spec(T-013:AC-15) declares RivalAction as a cannon choice and nothing more', () => {
    const action: RivalAction = { cannonId: 'mortar' };
    const keysAreExact: Exact<keyof RivalAction, 'cannonId'> = true;
    const cannonIdIsCannonId: Exact<RivalAction['cannonId'], CannonId> = true;

    expect(Object.keys(action)).toEqual(['cannonId']);
    expect([keysAreExact, cannonIdIsCannonId]).toEqual([true, true]);
  });

  it('spec(T-013:AC-15) does not let a RivalAction smuggle correctness or timing', () => {
    const action: RivalAction = {
      cannonId: 'mortar',
      // @ts-expect-error correctness comes from `produceAnswer`, never from `chooseAction`.
      correct: true,
    };

    expect(action.cannonId).toBe('mortar');
  });

  it('spec(T-013:AC-15) declares RivalVolley as exactly the three RIVAL_ACTION fields', () => {
    const keysAreExact: Exact<keyof RivalVolley, 'cannonId' | 'correct' | 'elapsedMs'> = true;
    const cannonIdIsCannonId: Exact<RivalVolley['cannonId'], CannonId> = true;
    const correctIsBoolean: Exact<RivalVolley['correct'], boolean> = true;
    const elapsedMsIsNumber: Exact<RivalVolley['elapsedMs'], number> = true;

    expect(Object.keys(FIXTURE_VOLLEY).sort()).toEqual(['cannonId', 'correct', 'elapsedMs']);
    expect([keysAreExact, cannonIdIsCannonId, correctIsBoolean, elapsedMsIsNumber]).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it('spec(T-013:AC-15) declares DuelResult as exactly won, tally and volleys', () => {
    const result: DuelResult = { won: true, tally: FIXTURE_TALLY, volleys: 4 };
    const keysAreExact: Exact<keyof DuelResult, 'won' | 'tally' | 'volleys'> = true;
    const wonIsBoolean: Exact<DuelResult['won'], boolean> = true;
    const tallyIsDuelTally: Exact<DuelResult['tally'], DuelTally> = true;
    const volleysIsNumber: Exact<DuelResult['volleys'], number> = true;

    expect(Object.keys(result).sort()).toEqual(['tally', 'volleys', 'won']);
    expect([keysAreExact, wonIsBoolean, tallyIsDuelTally, volleysIsNumber]).toEqual([true, true, true, true]);
  });

  it('spec(T-013:AC-15) declares every rival and result field readonly', () => {
    const actionIsReadonly: IsFullyReadonly<RivalAction> = true;
    const volleyIsReadonly: IsFullyReadonly<RivalVolley> = true;
    const resultIsReadonly: IsFullyReadonly<DuelResult> = true;
    const viewIsReadonly: IsFullyReadonly<RivalView> = true;
    const tallyIsReadonly: IsFullyReadonly<DuelTally> = true;

    expect([actionIsReadonly, volleyIsReadonly, resultIsReadonly, viewIsReadonly, tallyIsReadonly]).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
  });
});

// ============================================================================================
// AC-14 — `readonly` throughout, on whole interfaces
//
// The hole this criterion closes: an indexed access DISCARDS property modifiers, so
// `Exact<DuelState['seed'], number>` is `true` whether or not `seed` is readonly (LESSONS.md
// L-012). AC-12's two array probes are real but cover only `actionLog` and `playerLoadout`, and
// removing `readonly` from `DuelCore.seed` therefore typechecked clean and passed this file
// 100/100 — independently reproduced before this block was written, and it contradicted the
// ticket's own Definition of Done the whole time.
//
// `IsFullyReadonly<T>` is the probe that can see it: `Readonly<T>` is identical to `T` only
// when every property already carries the modifier. It is SHALLOW, so nested object types get
// their own line rather than being assumed covered by their parent.
// ============================================================================================

/** The mutable/readonly pair the AC-14 probes are calibrated against. */
type ReadonlyProbeMutable = { a: number; readonly b: string };
type ReadonlyProbeFrozen = { readonly a: number; readonly b: string };

/** One per-phase readonly probe, spelled out so a failure names the offending variant. */
type VariantIsReadonly<P extends (typeof EXPECTED_PHASES)[number]> = IsFullyReadonly<
  Extract<DuelState, { phase: P }>
>;

describe('DuelState readonly-ness', () => {
  /**
   * The negative control for this whole block (LESSONS.md L-014). If `IsFullyReadonly<T>` ever
   * degraded into true-for-everything, every assertion below would pass vacuously and the AC-14
   * hole would silently reopen. The first line must report `false` for a type with ONE mutable
   * property; the second must report `true` for its fully-readonly twin.
   */
  it('spec(T-013:AC-14) has a readonly probe that distinguishes mutable from readonly', () => {
    const detectsAMutableProperty: IsFullyReadonly<ReadonlyProbeMutable> = false;
    const acceptsAFullyReadonlyType: IsFullyReadonly<ReadonlyProbeFrozen> = true;

    expect([detectsAMutableProperty, acceptsAFullyReadonlyType]).toEqual([false, true]);
  });

  /**
   * Every one of the eight variants, which covers every `DuelCore` field transitively — the core
   * is spread into all eight, so a single mutable core property fails all eight lines at once.
   * `DuelCore` is not asserted by name because the ticket does not export it.
   */
  it('spec(T-013:AC-14) dod(T-013:4) declares every field of every phase variant readonly', () => {
    const countdownIsReadonly: VariantIsReadonly<'countdown'> = true;
    const playerChooseIsReadonly: VariantIsReadonly<'playerChoose'> = true;
    const reloadIsReadonly: VariantIsReadonly<'reload'> = true;
    const resolvePlayerIsReadonly: VariantIsReadonly<'resolvePlayer'> = true;
    const rivalTurnIsReadonly: VariantIsReadonly<'rivalTurn'> = true;
    const resolveRivalIsReadonly: VariantIsReadonly<'resolveRival'> = true;
    const victoryIsReadonly: VariantIsReadonly<'victory'> = true;
    const defeatIsReadonly: VariantIsReadonly<'defeat'> = true;

    expect([
      countdownIsReadonly,
      playerChooseIsReadonly,
      reloadIsReadonly,
      resolvePlayerIsReadonly,
      rivalTurnIsReadonly,
      resolveRivalIsReadonly,
      victoryIsReadonly,
      defeatIsReadonly,
    ]).toEqual(Array.from({ length: EXPECTED_PHASES.length }, () => true));
  });

  // The union as a whole. `Readonly<>` is homomorphic and so distributes, making this a single
  // statement of the same property — kept because it is the form a reader checks first, and it
  // stays correct without edit when T-022 adds a ninth variant.
  it('spec(T-013:AC-14) declares the DuelState union readonly however it is narrowed', () => {
    const unionIsReadonly: IsFullyReadonly<DuelState> = true;

    expect(unionIsReadonly).toBe(true);
  });

  /**
   * `Readonly<>` is shallow, so the nested shapes reached THROUGH the state need their own lines
   * or a mutable `bySkill` counter would sail past the eight probes above. `ActionLogEntry` is
   * included here rather than in AC-11 because this is a modifier claim, not a key-set claim —
   * it stays true when T-022 adds an optional field, so it does not pre-break wave 6.
   */
  it('spec(T-013:AC-14) declares the shapes nested inside the state readonly too', () => {
    const entryIsReadonly: IsFullyReadonly<ActionLogEntry> = true;
    const tallyIsReadonly: IsFullyReadonly<DuelTally> = true;
    const bySkillCounterIsReadonly: Exact<
      NonNullable<DuelTally['bySkill'][SkillId]>,
      { readonly correct: number; readonly attempts: number }
    > = true;
    const configIsReadonly: IsFullyReadonly<DuelConfig> = true;
    const resultIsReadonly: IsFullyReadonly<DuelResult> = true;

    expect([
      entryIsReadonly,
      tallyIsReadonly,
      bySkillCounterIsReadonly,
      configIsReadonly,
      resultIsReadonly,
    ]).toEqual([true, true, true, true, true]);
  });

  /**
   * The behavioural half. AC-12 already refuses `push` and index assignment on the two arrays;
   * these refuse whole-field reassignment on the SCALAR core fields, which is the shape of the
   * mutation a reducer written in the wrong style would attempt. `seed` leads deliberately — it
   * is the exact field the review found unprotected.
   */
  it('spec(T-013:AC-14) refuses to reassign the scalar core fields', () => {
    const state = disposableState();

    // @ts-expect-error `seed` is a readonly property.
    state.seed = 99;
    // @ts-expect-error `turnToken` is a readonly property.
    state.turnToken = 99;
    // @ts-expect-error `volleyNumber` is a readonly property.
    state.volleyNumber = 99;
    // @ts-expect-error `playerHull` is a readonly property.
    state.playerHull = 99;
    // @ts-expect-error `enemyHull` is a readonly property.
    state.enemyHull = 99;
    // @ts-expect-error `enemyMaxHull` is a readonly property.
    state.enemyMaxHull = 99;
    // @ts-expect-error `islandId` is a readonly property.
    state.islandId = 'grandline';
    // @ts-expect-error `rng` is a readonly property.
    state.rng = createRng(1);
    // @ts-expect-error `phase` is a readonly property.
    state.phase = 'victory';

    expect(state.seed).toBe(99);
  });

  /**
   * The negative control for the nine directives above: a mutable copy carrying the SAME
   * assignments must compile cleanly. Without it, each `@ts-expect-error` would also be satisfied
   * by an unrelated error on its line — a wrong value type, say — and would stop being evidence
   * about readonly-ness specifically.
   */
  it('spec(T-013:AC-14) allows those same assignments on a deliberately mutable copy', () => {
    const mutable: { seed: number; turnToken: number; islandId: IslandId; rng: Rng } = {
      seed: CORE.seed,
      turnToken: CORE.turnToken,
      islandId: CORE.islandId,
      rng: CORE.rng,
    };

    mutable.seed = 99;
    mutable.turnToken = 99;
    mutable.islandId = 'grandline';
    mutable.rng = createRng(1);

    expect([mutable.seed, mutable.turnToken, mutable.islandId]).toEqual([99, 99, 'grandline']);
  });
});

// ============================================================================================
// AC-16 — construction deep-copies array inputs; it does not alias them
//
// Runtime, not type-level: `readonly` on the config and on the state cannot stop a caller who
// still holds a mutable `CannonId[]` (or a `Template`) from mutating it after construction. That
// rewrite then silently lands inside a duel already in progress, and — because the state is the
// replay input — makes the recorded duel unreproducible from its own seed. Cover every array the
// config carries, every nested `Template[]` under `templatesBySkill`, each `Template` object, and
// that object's own `distractors` / `params` / `constraints`. Copying containers while sharing
// element objects is the plausible half-fix.
// ============================================================================================

describe('createDuelState — input aliasing', () => {
  it('spec(T-013:AC-16) copies playerLoadout so a later caller mutation cannot rewrite the state', () => {
    const playerLoadout: CannonId[] = ['swivel_gun', 'culverin'];
    const config: DuelConfig = { ...configFor('port_sumwich', 7), playerLoadout };
    const state = createDuelState(config);

    expect(state.playerLoadout).not.toBe(playerLoadout);
    expect(state.playerLoadout).toEqual(['swivel_gun', 'culverin']);

    playerLoadout.push('mortar');
    playerLoadout[0] = 'long_nine';

    expect(state.playerLoadout).toEqual(['swivel_gun', 'culverin']);
  });

  it('spec(T-013:AC-16) copies rivalLoadout so a later caller mutation cannot rewrite the state', () => {
    const rivalLoadout: CannonId[] = ['mortar', 'powder_keg'];
    const config: DuelConfig = { ...configFor('port_sumwich', 7), rivalLoadout };
    const state = createDuelState(config);

    expect(state.rivalLoadout).not.toBe(rivalLoadout);
    expect(state.rivalLoadout).toEqual(['mortar', 'powder_keg']);

    rivalLoadout.push('culverin');
    rivalLoadout[0] = 'swivel_gun';

    expect(state.rivalLoadout).toEqual(['mortar', 'powder_keg']);
  });

  /**
   * `templatesBySkill` is not itself an array, but every value it holds is. An implementation that
   * only spreads `{ ...config.templatesBySkill }` leaves each skill's `Template[]` as a live
   * caller reference — the half-fix a test written only against the outer object misses.
   */
  it('spec(T-013:AC-16) copies templatesBySkill and every nested Template array', () => {
    const templates: Template[] = [...(FIXTURE_TEMPLATES.add_within_10 as readonly Template[])];
    const templatesBySkill: Partial<Record<SkillId, Template[]>> = { add_within_10: templates };
    const config: DuelConfig = { ...configFor('port_sumwich', 7), templatesBySkill };
    const state = createDuelState(config);

    expect(state.templatesBySkill).not.toBe(templatesBySkill);
    expect(state.templatesBySkill.add_within_10).not.toBe(templates);
    expect(state.templatesBySkill.add_within_10).toHaveLength(2);

    templates.pop();
    templatesBySkill.add_within_10 = [];

    expect(state.templatesBySkill.add_within_10).toHaveLength(2);
    expect(state.templatesBySkill).not.toBe(templatesBySkill);
  });

  /**
   * `[...templates]` still shares every `Template` object with the caller. Mutating
   * `template.text` — or a nested `params` / `distractors` / `constraints` slot — after
   * construction must leave the state alone, and no `Template` in the state may be `===` one
   * in the config. Round 3 measured only the container layer above this.
   */
  it('spec(T-013:AC-16) deep-copies every Template and its nested params, distractors, constraints', () => {
    const template: Template = templateSchema.parse({
      id: 'add_within_10__a_plus_b',
      skill: 'add_within_10',
      text: '{a} + {b} = ?',
      params: { a: [1, 5], b: [1, 5] },
      constraints: ['a + b <= 10'],
      answerExpr: 'a + b',
      distractors: ['a + b + 1', 'a + b - 1', 'a * b'],
    });
    const templates: Template[] = [template];
    const templatesBySkill: Partial<Record<SkillId, Template[]>> = { add_within_10: templates };
    const config: DuelConfig = { ...configFor('port_sumwich', 7), templatesBySkill };
    const state = createDuelState(config);
    const stateTemplate = state.templatesBySkill.add_within_10![0]!;

    expect(stateTemplate).not.toBe(template);
    expect(stateTemplate.distractors).not.toBe(template.distractors);
    expect(stateTemplate.params).not.toBe(template.params);
    expect(stateTemplate.params.a).not.toBe(template.params.a);
    expect(stateTemplate.constraints).not.toBe(template.constraints);

    template.text = 'TAMPERED BY CALLER';
    template.distractors[0] = 'TAMPERED_DISTRACTOR';
    const callerParamA = template.params.a as [number, number];
    callerParamA[0] = 9;
    template.constraints![0] = 'TAMPERED_CONSTRAINT';

    expect(stateTemplate.text).toBe('{a} + {b} = ?');
    expect(stateTemplate.distractors).toEqual(['a + b + 1', 'a + b - 1', 'a * b']);
    expect(stateTemplate.params).toEqual({ a: [1, 5], b: [1, 5] });
    expect(stateTemplate.constraints).toEqual(['a + b <= 10']);
  });
});

// ============================================================================================
// Definition of Done — the ticket's nine unnumbered requirements
//
// spec-lint harvests DoD checkboxes and numbers them in ticket order, and an uncovered one is now
// a FAIL rather than a silent pass (LESSONS.md L-036: the previous revision printed PASS with all
// nine of this ticket's items uncovered). Four of the nine are claims about this repository and
// this file rather than about `DuelState`, so they are asserted by reading the tree — a hollow
// `expect(true).toBe(true)` under a tag would satisfy the gate while enforcing nothing, which is
// the exact failure the gate was rebuilt to stop.
//
// Items 4, 5 and 6 are asserted where their real evidence already lives, so their tags sit on the
// AC-14, AC-6 and AC-13 tests rather than being restated weakly here.
//
// Items 2 and 3 are only PARTLY assertable and say so in their test names: a test cannot report
// that the gate suite is green, because vitest is one of the gates and spec-lint's subject is
// this file. Each asserts the part that is real — that the gate still checks what it claims to,
// and that this file's own tags parse — and the report states the residue plainly.
// ============================================================================================

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function repoText(relativePath: string): string {
  return readFileSync(`${REPO_ROOT}${relativePath}`, 'utf8');
}

/** This file's own source, for the four DoD items that are claims about the test suite. */
const OWN_SOURCE = repoText('__tests__/engine/duel/types.test.ts');
const TICKET_SOURCE = repoText('tickets/T-013.md');

/**
 * Needles that `run-local-gates.sh` itself greps for across `__tests__`. They are assembled from
 * fragments on purpose: writing `TO` + `DO` as one literal here would make this very file trip the
 * gate it is checking. Same reason the focused-test pattern below is built rather than written.
 */
const DEFERRED_WORK_MARKERS = [['TO', 'DO'].join(''), ['FIX', 'ME'].join(''), ['HA', 'CK'].join('')];
const FOCUSED_TEST_PATTERN = new RegExp(
  ['\\b(it|test|describe)\\.(', 'sk', 'ip|on', 'ly)\\b|\\b', 'x', '(it|describe)\\b'].join(''),
);

describe('T-013 Definition of Done', () => {
  it('dod(T-013:1) tags a test against every acceptance criterion the ticket declares', () => {
    const declared = [...TICKET_SOURCE.matchAll(/\*\*(AC-\d+)\*\*/g)].map((match) => match[1]);
    const unique = [...new Set(declared)];
    const untagged = unique.filter((ac) => !OWN_SOURCE.includes(`spec(T-013:${ac})`));

    expect(unique.length, 'the ticket must declare criteria at all').toBeGreaterThan(0);
    expect(untagged, 'every declared AC needs at least one tagged test').toEqual([]);
  });

  /**
   * Partial by construction — see this block's header. What IS assertable is that the gate script
   * still runs every check the report claims it ran; a gate quietly reduced to three commands
   * would otherwise keep printing PASS while enforcing less (LESSONS.md L-036).
   */
  it('dod(T-013:2) keeps every local gate wired up, and adds no marker or focused test that would break one', () => {
    const gates = repoText('.tdd-swarm/run-local-gates.sh');

    for (const command of ['prettier --check', 'eslint . --max-warnings 0', 'tsc --noEmit', 'vitest run']) {
      expect(gates, `run-local-gates.sh must still run: ${command}`).toContain(command);
    }
    for (const marker of DEFERRED_WORK_MARKERS) {
      expect(OWN_SOURCE.includes(marker), `this file must contain no ${marker} marker`).toBe(false);
    }
    expect(FOCUSED_TEST_PATTERN.test(OWN_SOURCE), 'this file must contain no focused or skipped test').toBe(
      false,
    );
  });

  /**
   * Partial by construction — a test cannot report its own gate's exit code. What it CAN do is
   * enforce the tag grammar that gate parses, which is the specific thing this suite got wrong:
   * its dod tags were originally NAMED, and spec-lint silently matched none of them.
   */
  it('dod(T-013:3) numbers every dod tag in this file so spec-lint can parse it, covering all nine', () => {
    const dodCount = (TICKET_SOURCE.match(/^- \[[ x]\] /gm) ?? []).length;
    const tagged = [...OWN_SOURCE.matchAll(/dod\(T-013:([^)]*)\)/g)].map((match) => match[1] ?? '');
    const unparseable = tagged.filter((id) => !/^\d+$/.test(id));
    const covered = new Set(tagged.filter((id) => /^\d+$/.test(id)).map(Number));
    const missing = Array.from({ length: dodCount }, (_, i) => i + 1).filter((n) => !covered.has(n));

    expect(dodCount, 'the ticket must declare DoD items').toBeGreaterThan(0);
    expect(unparseable, 'a named dod tag matches nothing in spec-lint').toEqual([]);
    expect(missing, 'every DoD item needs a numbered tag').toEqual([]);
    expect(OWN_SOURCE, 'the reverse spec-lint direction').toContain('spec(T-013:AC-');
  });

  /**
   * The literal-enumeration rule, asserted against this file's SOURCE rather than its behaviour,
   * because behaviour cannot tell a literal from a derivation. The declarations must be arrays of
   * quoted strings: the moment someone "simplifies" one into a spread of `DUEL_PHASES` or a
   * `keyof` of the event union, these tests would start agreeing with the implementation whatever
   * it said, and T-022 would extend the union without anything going red.
   */
  it('dod(T-013:7) declares the phase and event enumerations as literal arrays, not derivations', () => {
    const literalBlock = (name: string): readonly string[] => {
      const match = new RegExp(`const ${name} = \\[([^\\]]*)\\] as const;`).exec(OWN_SOURCE);
      expect(
        match,
        `${name} must be declared as an inline array literal ending in "as const"`,
      ).not.toBeNull();
      return (match?.[1] ?? '')
        .split(',')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    };

    const phaseEntries = literalBlock('EXPECTED_PHASES');
    const eventEntries = literalBlock('EXPECTED_EVENT_TYPES');

    for (const entry of [...phaseEntries, ...eventEntries]) {
      expect(entry, 'every enumeration entry must be a quoted string literal').toMatch(/^'[A-Za-z_]+'$/);
    }
    expect(phaseEntries.map((entry) => entry.slice(1, -1))).toEqual([...EXPECTED_PHASES]);
    expect(eventEntries.map((entry) => entry.slice(1, -1))).toEqual([...EXPECTED_EVENT_TYPES]);
  });

  /**
   * Behavioural, not lexical: the module under test does not exist yet, so its source cannot be
   * scanned. Moving the system clock by decades between two constructions catches any `Date`
   * reaching a state field, and repeating the construction catches `Math.random()`. The tuning
   * half is the AC-2 mock test, which requires the constructor to follow a perturbed
   * `PLAYER_HULL` rather than agreeing with today's value by coincidence.
   */
  it('dod(T-013:8) builds a state that no wall clock and no unseeded randomness can perturb', () => {
    const reference = createDuelState(configFor('port_sumwich', 5));

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2031-06-01T00:00:00Z'));
      expect(createDuelState(configFor('port_sumwich', 5))).toStrictEqual(reference);
      vi.setSystemTime(new Date('1999-01-01T00:00:00Z'));
      expect(createDuelState(configFor('port_sumwich', 5))).toStrictEqual(reference);
    } finally {
      vi.useRealTimers();
    }

    for (let attempt = 0; attempt < 25; attempt += 1) {
      expect(createDuelState(configFor('port_sumwich', 5)), `attempt ${attempt}`).toStrictEqual(reference);
    }
  });

  /**
   * The file-scope rule, narrowed to the part a test can actually observe: T-013 declares exactly
   * one production file, and `damage.ts` is T-008's frozen module. A third file appearing in this
   * directory means the implementer spread the ticket across a scope it was not granted, which no
   * other assertion in this suite would notice.
   */
  it('dod(T-013:9) keeps src/engine/duel to this ticket file scope plus the frozen T-008 module', () => {
    const permitted = ['damage.ts', 'types.ts'];
    const present = readdirSync(`${REPO_ROOT}src/engine/duel`).filter((name) => name.endsWith('.ts'));
    const unexpected = present.filter((name) => !permitted.includes(name));

    expect(unexpected, 'T-013 declares only src/engine/duel/types.ts in its file_scopes').toEqual([]);
    expect(present, 'the frozen T-008 module must still be there').toContain('damage.ts');
  });
});
