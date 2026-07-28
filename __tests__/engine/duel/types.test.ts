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
 *
 * A Perfect Shot is `+PERFECT_SHOT_BONUS_DAMAGE` **damage**; `ballCount` is presentation the
 * engine ignores. Nothing below reads `ballCount` as damage — the one `ShotOutcome` fixture is
 * produced by calling the frozen T-008 `resolveShot`, so this file cannot encode the stale
 * "+1 bonus ball" reading of ARCHITECTURE.md:202 at all (T-031 carries that correction).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getCannon } from '@content/index';
import { ISLAND_IDS, templateSchema } from '@content/schemas';
import type { CannonId, IslandId, SkillId, Template } from '@content/schemas';
import { resolveShot, type ShotOutcome } from '@engine/duel/damage';
import { assertQuestion, type Question } from '@engine/questions/types';
import { createRng, type Rng } from '@engine/rng';
import { BOT_ACCURACY_WINDOW, ENEMY_HULL_BY_ISLAND, PLAYER_HULL } from '@engine/tuning';

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

  // Pins DuelConfig FIELD TYPES without pinning `keyof DuelConfig`, so an optional field (an
  // `enemyMaxHull` override for the scripted onboarding sloop, say) can still be added additively.
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
   * Confined to `[0, 0xffffffff]` on purpose. `createRng` boxes `seed >>> 0`, which is the
   * identity on that range but folds negatives onto it — so `-1` and `0xffffffff` are two
   * DISTINCT legal seeds that produce the same `Rng`. AC-4 as written is universally quantified
   * over "two configs differing only in seed" and is therefore false for that pair; the report
   * carries the arithmetic and the proposed amendment. Nothing here encodes either reading.
   */
  it('spec(T-013:AC-4) gives different rng values to different seeds', () => {
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
   * AC-5 does not mention the seed, and the report proposes an amendment for that. What is NOT
   * open is that these must not be accepted silently: the ticket's own wave-1 contract note says
   * `createRng` throws rather than truncating, precisely because `NaN`, `-0.5` and `2 ** 33` all
   * mask to `0` under `>>> 0` and alias three seeds onto one stream in the module whose only job
   * is replay-from-seed. This asserts only that SOMETHING throws — a `RangeError` straight
   * out of `createRng` and a field-naming `Error` are both legal readings, and choosing between
   * them is the orchestrator's call, not this file's.
   */
  it('spec(T-013:AC-5) refuses to silently accept a seed createRng would reject', () => {
    for (const seed of [Number.NaN, 0.5, -0.5, 2 ** 33, -(2 ** 33), Number.POSITIVE_INFINITY]) {
      expect(() => createDuelState(configFor('port_sumwich', seed)), `seed ${seed}`).toThrow(Error);
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

  it('spec(T-013:AC-6) holds no function, Map, Set, class instance or undefined-valued key', () => {
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
    const everyFieldIsReadonly: Exact<Readonly<ActionLogEntry>, ActionLogEntry> = true;

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
// The event union and the remaining rival shapes
//
// NO ACCEPTANCE CRITERION COVERS ANY OF THIS, which is a defect in the ticket rather than a
// judgement about importance. The five-event union is a `traces_to` entry and a Definition-of-Done
// line ("Exactly the five ARCHITECTURE.md §4.2 event types"), and `RivalAction`, `RivalVolley` and
// `DuelResult` are specified in the ticket body only — so `spec-lint`, which reads `**AC-n**` and
// nothing else, cannot see any of them, and without the tests below nothing would require them to
// be covered at all. Five later tickets import these shapes and this file freezes today, so they
// are tested here and tagged `dod(T-013:…)` rather than mis-cited against an unrelated `AC-n`.
// `.tdd-swarm/reports/T-013-tests.md` proposes AC-13 … AC-16 so the gate can see them too.
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

  it('dod(T-013:events) is constructible for exactly the five ARCHITECTURE.md §4.2 event types', () => {
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
  it('dod(T-013:events) declares the event discriminant as exactly those five literals', () => {
    const eventTypesAreExact: Exact<
      DuelEvent['type'],
      'CANNON_SELECTED' | 'ANSWER_CHOSEN' | 'TIMER_EXPIRED' | 'ANIMATION_DONE' | 'RIVAL_ACTION'
    > = true;

    expect(eventTypesAreExact).toBe(true);
  });

  it('dod(T-013:events) carries the payload each event type declares, and no other key', () => {
    expect(Object.keys(cannonSelected).sort()).toEqual(['cannonId', 'type']);
    expect(Object.keys(answerChosen).sort()).toEqual(['choiceIndex', 'elapsedMs', 'type']);
    expect(Object.keys(timerExpired)).toEqual(['type']);
    expect(Object.keys(animationDone)).toEqual(['type']);
    expect(Object.keys(rivalAction).sort()).toEqual(['type', 'volley']);
  });

  it('dod(T-013:events) round-trips every event through JSON as plain data', () => {
    for (const event of events) {
      expectPlainJsonValue(event, `event(${event.type})`);
      expect(JSON.parse(JSON.stringify(event))).toStrictEqual(event);
    }
  });

  it('dod(T-013:events) narrows RIVAL_ACTION to a RivalVolley payload', () => {
    let volley: RivalVolley | null = null;

    if (rivalAction.type === 'RIVAL_ACTION') {
      volley = rivalAction.volley;
    }

    expect(volley).toStrictEqual(FIXTURE_VOLLEY);
  });

  it('dod(T-013:events) narrows ANSWER_CHOSEN to a choiceIndex and an elapsedMs', () => {
    let payload: readonly [number, number] | null = null;

    if (answerChosen.type === 'ANSWER_CHOSEN') {
      payload = [answerChosen.choiceIndex, answerChosen.elapsedMs];
    }

    expect(payload).toEqual([2, 1500]);
  });

  it('dod(T-013:events) makes cannonId inaccessible on a TIMER_EXPIRED event', () => {
    let seen: unknown = 'unset';

    if (timerExpired.type === 'TIMER_EXPIRED') {
      // @ts-expect-error TIMER_EXPIRED carries no payload.
      seen = timerExpired.cannonId;
    }

    expect(seen).toBeUndefined();
  });

  // Uses a name no ticket will ever add, so this probe cannot turn into an unused directive the
  // day a real sixth event arrives.
  it('dod(T-013:events) rejects an event type outside the union', () => {
    // @ts-expect-error 'NOT_A_DUEL_EVENT' is not a DuelEvent type.
    const event: DuelEvent = { type: 'NOT_A_DUEL_EVENT' };

    expect(event.type).toBe('NOT_A_DUEL_EVENT');
  });
});

describe('RivalAction, RivalVolley and DuelResult', () => {
  it('dod(T-013:rival-shapes) declares RivalAction as a cannon choice and nothing more', () => {
    const action: RivalAction = { cannonId: 'mortar' };
    const keysAreExact: Exact<keyof RivalAction, 'cannonId'> = true;
    const cannonIdIsCannonId: Exact<RivalAction['cannonId'], CannonId> = true;

    expect(Object.keys(action)).toEqual(['cannonId']);
    expect([keysAreExact, cannonIdIsCannonId]).toEqual([true, true]);
  });

  it('dod(T-013:rival-shapes) does not let a RivalAction smuggle correctness or timing', () => {
    const action: RivalAction = {
      cannonId: 'mortar',
      // @ts-expect-error correctness comes from `produceAnswer`, never from `chooseAction`.
      correct: true,
    };

    expect(action.cannonId).toBe('mortar');
  });

  it('dod(T-013:rival-shapes) declares RivalVolley as exactly the three RIVAL_ACTION fields', () => {
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

  it('dod(T-013:rival-shapes) declares DuelResult as exactly won, tally and volleys', () => {
    const result: DuelResult = { won: true, tally: FIXTURE_TALLY, volleys: 4 };
    const keysAreExact: Exact<keyof DuelResult, 'won' | 'tally' | 'volleys'> = true;
    const wonIsBoolean: Exact<DuelResult['won'], boolean> = true;
    const tallyIsDuelTally: Exact<DuelResult['tally'], DuelTally> = true;
    const volleysIsNumber: Exact<DuelResult['volleys'], number> = true;

    expect(Object.keys(result).sort()).toEqual(['tally', 'volleys', 'won']);
    expect([keysAreExact, wonIsBoolean, tallyIsDuelTally, volleysIsNumber]).toEqual([true, true, true, true]);
  });

  it('dod(T-013:rival-shapes) declares every rival and result field readonly', () => {
    const actionIsReadonly: Exact<Readonly<RivalAction>, RivalAction> = true;
    const volleyIsReadonly: Exact<Readonly<RivalVolley>, RivalVolley> = true;
    const resultIsReadonly: Exact<Readonly<DuelResult>, DuelResult> = true;
    const viewIsReadonly: Exact<Readonly<RivalView>, RivalView> = true;
    const tallyIsReadonly: Exact<Readonly<DuelTally>, DuelTally> = true;

    expect([actionIsReadonly, volleyIsReadonly, resultIsReadonly, viewIsReadonly, tallyIsReadonly]).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
  });
});
