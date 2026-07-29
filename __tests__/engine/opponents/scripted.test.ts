/**
 * T-018 — Opponent interface + scripted onboarding rival.
 *
 * One Promise-returning actor interface; the reducer never knows which implementation
 * it faces (ARCHITECTURE.md §4.2). This suite pins `createScriptedOpponent`: scripted
 * playback, last-step exhaustion, construction validation, no wall-clock, and the
 * three-volley onboarding arithmetic against `ONBOARDING_ENEMY_HULL` (T-004 AC-12).
 *
 * Production modules are intentionally absent in the RED phase
 * (`src/engine/opponents/{types,scripted}.ts`).
 *
 * Traceability: behavioural tests use spec tags of the form T-018 AC-<number>;
 * Definition of Done uses numbered dod tags for T-018 items 1 through 7 (see below).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { CANNON_IDS } from '@content/schemas';
import type { CannonId } from '@content/schemas';
import type { RivalAction, RivalView } from '@engine/duel/types';
import type { Question } from '@engine/questions/types';
import { ANSWER_QUALITY_FLOOR, ONBOARDING_ENEMY_HULL } from '@engine/tuning';
import {
  createScriptedOpponent as createScriptedOpponentUnderTest,
  type ScriptedStep,
} from '@engine/opponents/scripted';
import type { Opponent, OpponentAnswer } from '@engine/opponents/types';

// =============================================================================================
// Signature pins (honest RED typecheck — LESSONS.md L-024)
// =============================================================================================

type CreateScriptedOpponentInput = {
  readonly id: string;
  readonly script: readonly ScriptedStep[];
};

const createScriptedOpponent: (input: CreateScriptedOpponentInput) => Opponent =
  createScriptedOpponentUnderTest;

/** Compile-time exact-type equality — invariant in both directions. */
type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const exactAcceptsAMatch: Exact<'player', 'player'> = true;
const exactRejectsAWidening: Exact<'player', string> = false;
void exactAcceptsAMatch;
void exactRejectsAWidening;

// =============================================================================================
// Paths / suite meta
// =============================================================================================

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '../../..');
const TICKET_PATH = join(REPO_ROOT, 'tickets/T-018.md');
const SUITE_PATH = fileURLToPath(import.meta.url);
const OPPONENTS_DIR = join(REPO_ROOT, 'src/engine/opponents');
const TYPES_SRC_PATH = join(OPPONENTS_DIR, 'types.ts');
const SCRIPTED_SRC_PATH = join(OPPONENTS_DIR, 'scripted.ts');

const TICKET_SOURCE = readFileSync(TICKET_PATH, 'utf8');
const OWN_SOURCE = readFileSync(SUITE_PATH, 'utf8');

const DEFERRED_WORK_MARKERS = [['TO', 'DO'].join(''), ['FIX', 'ME'].join(''), ['HA', 'CK'].join('')];
const FOCUSED_TEST_PATTERN = new RegExp(
  ['\\b(it|test|describe)\\.(', 'sk', 'ip|on', 'ly)\\b|\\b', 'x', '(it|describe)\\b'].join(''),
);

/** AC-9 banned substrings — secondary defence; ESLint is authoritative. */
const BANNED_SOURCE_SUBSTRINGS = [
  'Date',
  'Math.random',
  'setTimeout',
  'setInterval',
  'performance.now',
] as const;

// =============================================================================================
// Fixtures
// =============================================================================================

const THREE_STEP_SCRIPT: readonly ScriptedStep[] = [
  { cannonId: 'swivel_gun', correct: false, elapsedMs: 1_200 },
  { cannonId: 'culverin', correct: true, elapsedMs: 800 },
  { cannonId: 'swivel_gun', correct: false, elapsedMs: 2_500 },
];

const ALL_INCORRECT_SCRIPT: readonly ScriptedStep[] = [
  { cannonId: 'swivel_gun', correct: false, elapsedMs: 900 },
  { cannonId: 'swivel_gun', correct: false, elapsedMs: 1_100 },
  { cannonId: 'swivel_gun', correct: false, elapsedMs: 1_400 },
];

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    templateId: 't018_fixture',
    skill: 'add_within_10',
    text: '1 + 1 = ?',
    params: { a: 1, b: 1 },
    choices: [
      { value: 2, label: '2' },
      { value: 3, label: '3' },
      { value: 0, label: '0' },
      { value: 1, label: '1' },
    ],
    correctIndex: 0,
    isWordProblem: false,
    readAloud: true,
    ...overrides,
  };
}

function makeRivalView(overrides: Partial<RivalView> = {}): RivalView {
  return {
    volleyNumber: 1,
    playerHull: 100,
    enemyHull: ONBOARDING_ENEMY_HULL,
    enemyMaxHull: ONBOARDING_ENEMY_HULL,
    rivalLoadout: ['swivel_gun', 'culverin'],
    playerRecentCorrect: [true, false],
    ...overrides,
  };
}

async function driveTurn(
  opponent: Opponent,
  view: RivalView = makeRivalView(),
  question: Question = makeQuestion(),
): Promise<{ readonly action: RivalAction; readonly answer: OpponentAnswer }> {
  const action = await opponent.chooseAction(view);
  const answer = await opponent.produceAnswer(question);
  return { action, answer };
}

async function driveTurns(
  opponent: Opponent,
  count: number,
  view: RivalView = makeRivalView(),
  question: Question = makeQuestion(),
): Promise<readonly { readonly action: RivalAction; readonly answer: OpponentAnswer }[]> {
  const results: { readonly action: RivalAction; readonly answer: OpponentAnswer }[] = [];
  for (let i = 0; i < count; i += 1) {
    results.push(await driveTurn(opponent, view, question));
  }
  return results;
}

function tripleOf(
  action: RivalAction,
  answer: OpponentAnswer,
): { readonly cannonId: CannonId; readonly correct: boolean; readonly elapsedMs: number } {
  return { cannonId: action.cannonId, correct: answer.correct, elapsedMs: answer.elapsedMs };
}

function listOpponentSources(): readonly string[] {
  expect(existsSync(OPPONENTS_DIR), 'src/engine/opponents/ must exist').toBe(true);
  return readdirSync(OPPONENTS_DIR)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => join(OPPONENTS_DIR, name))
    .sort();
}

// =============================================================================================
// AC-1 — interface conformance + id
// =============================================================================================

describe('AC-1 — createScriptedOpponent satisfies Opponent', () => {
  it('spec(T-018:AC-1) returns id, chooseAction, and produceAnswer matching the interface', () => {
    const opponent = createScriptedOpponent({ id: 'onboarding_sloop', script: THREE_STEP_SCRIPT });

    expect(typeof opponent.id).toBe('string');
    expect(opponent.id).toBe('onboarding_sloop');
    expect(typeof opponent.chooseAction).toBe('function');
    expect(typeof opponent.produceAnswer).toBe('function');

    // Ticket pins an `id` on Opponent (ARCHITECTURE.md §4.2 omits it — see report ambiguities).
    type OpponentKeys = keyof Opponent;
    const keysAreExact: Exact<OpponentKeys, 'id' | 'chooseAction' | 'produceAnswer'> = true;
    const idIsString: Exact<Opponent['id'], string> = true;
    expect([keysAreExact, idIsString]).toEqual([true, true]);
  });
});

// =============================================================================================
// AC-2 — ordered script playback
// =============================================================================================

describe('AC-2 — chooseAction → produceAnswer walks the script in order', () => {
  it('spec(T-018:AC-2) three turns emit the three script triples in order', async () => {
    const opponent = createScriptedOpponent({ id: 'sloop', script: THREE_STEP_SCRIPT });
    const turns = await driveTurns(opponent, 3);

    expect(turns.map(({ action, answer }) => tripleOf(action, answer))).toEqual([
      { cannonId: 'swivel_gun', correct: false, elapsedMs: 1_200 },
      { cannonId: 'culverin', correct: true, elapsedMs: 800 },
      { cannonId: 'swivel_gun', correct: false, elapsedMs: 2_500 },
    ]);
  });
});

// =============================================================================================
// AC-3 — exhaustion repeats the final step
// =============================================================================================

describe('AC-3 — exhausted script repeats its final step', () => {
  it('spec(T-018:AC-3) fourth and fifth turns both return the third step', async () => {
    const opponent = createScriptedOpponent({ id: 'sloop', script: THREE_STEP_SCRIPT });
    const turns = await driveTurns(opponent, 5);
    const last = THREE_STEP_SCRIPT[2]!;

    expect(tripleOf(turns[3]!.action, turns[3]!.answer)).toEqual({
      cannonId: last.cannonId,
      correct: last.correct,
      elapsedMs: last.elapsedMs,
    });
    expect(tripleOf(turns[4]!.action, turns[4]!.answer)).toEqual({
      cannonId: last.cannonId,
      correct: last.correct,
      elapsedMs: last.elapsedMs,
    });
  });

  it('spec(T-018:AC-3) exhaustion does not throw or return undefined fields', async () => {
    const opponent = createScriptedOpponent({ id: 'sloop', script: THREE_STEP_SCRIPT });
    await driveTurns(opponent, 3);

    await expect(driveTurn(opponent)).resolves.toMatchObject({
      action: { cannonId: 'swivel_gun' },
      answer: { correct: false, elapsedMs: 2_500 },
    });
  });
});

// =============================================================================================
// AC-4 — script-driven answers ignore the Question
// =============================================================================================

describe('AC-4 — produceAnswer ignores the question content', () => {
  it('spec(T-018:AC-4) incorrect script steps stay false regardless of correctIndex/choices', async () => {
    const script: readonly ScriptedStep[] = [{ cannonId: 'swivel_gun', correct: false, elapsedMs: 333 }];
    const opponent = createScriptedOpponent({ id: 'stubborn', script });

    await opponent.chooseAction(makeRivalView());
    const answer = await opponent.produceAnswer(
      makeQuestion({
        correctIndex: 2,
        choices: [
          { value: 99, label: '99' },
          { value: 98, label: '98' },
          { value: 97, label: '97' },
          { value: 96, label: '96' },
        ],
      }),
    );

    expect(answer.correct).toBe(false);
    expect(answer.elapsedMs).toBe(333);
  });
});

// =============================================================================================
// AC-5 — empty script rejected
// =============================================================================================

describe('AC-5 — empty script is a RangeError', () => {
  it('spec(T-018:AC-5) createScriptedOpponent([]) throws RangeError', () => {
    expect(() => createScriptedOpponent({ id: 'empty', script: [] })).toThrow(RangeError);
  });
});

// =============================================================================================
// AC-6 — step validation at construction
// =============================================================================================

describe('AC-6 — invalid steps throw Error naming the step index', () => {
  it('spec(T-018:AC-6) negative elapsedMs throws Error naming the offending index', () => {
    const script: readonly ScriptedStep[] = [
      { cannonId: 'swivel_gun', correct: true, elapsedMs: 100 },
      { cannonId: 'culverin', correct: false, elapsedMs: -1 },
    ];

    expect(() => createScriptedOpponent({ id: 'bad_elapsed', script })).toThrow(Error);
    expect(() => createScriptedOpponent({ id: 'bad_elapsed', script })).toThrow(/1/);
    expect(() => createScriptedOpponent({ id: 'bad_elapsed', script })).not.toThrow(RangeError);
  });

  it('spec(T-018:AC-6) cannonId absent from the catalog throws Error naming the offending index', () => {
    const script: readonly ScriptedStep[] = [
      { cannonId: 'not_a_real_cannon' as CannonId, correct: false, elapsedMs: 50 },
    ];

    expect(CANNON_IDS.includes('not_a_real_cannon' as CannonId)).toBe(false);
    expect(() => createScriptedOpponent({ id: 'bad_cannon', script })).toThrow(Error);
    expect(() => createScriptedOpponent({ id: 'bad_cannon', script })).toThrow(/0/);
  });
});

// =============================================================================================
// AC-7 — no hidden nondeterminism across instances
// =============================================================================================

describe('AC-7 — two opponents from the same script emit identical triples', () => {
  it('spec(T-018:AC-7) five-turn sequences are element-wise identical', async () => {
    const a = createScriptedOpponent({ id: 'a', script: THREE_STEP_SCRIPT });
    const b = createScriptedOpponent({ id: 'b', script: THREE_STEP_SCRIPT });

    const turnsA = await driveTurns(a, 5);
    const turnsB = await driveTurns(b, 5);

    expect(turnsA.map(({ action, answer }) => tripleOf(action, answer))).toEqual(
      turnsB.map(({ action, answer }) => tripleOf(action, answer)),
    );
  });
});

// =============================================================================================
// AC-8 — promises resolve immediately (no scheduled time)
// =============================================================================================

describe('AC-8 — no real time; promises resolve in one tick', () => {
  it('spec(T-018:AC-8) three turns complete without advancing fake timers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    try {
      const opponent = createScriptedOpponent({ id: 'instant', script: THREE_STEP_SCRIPT });
      const turnsPromise = driveTurns(opponent, 3);
      // Do not call vi.advanceTimersByTime / runAllTimers — AC-8 requires completion without it.
      const turns = await turnsPromise;
      expect(turns).toHaveLength(3);
      expect(turns.every((t) => typeof t.action.cannonId === 'string')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

// =============================================================================================
// AC-9 — source scan for clock / randomness leaks
// =============================================================================================

describe('AC-9 — opponents sources contain no clock or randomness APIs', () => {
  it('spec(T-018:AC-9) every .ts under src/engine/opponents/ avoids banned substrings', () => {
    const sources = listOpponentSources();
    expect(sources.length, 'expected at least types.ts and scripted.ts').toBeGreaterThanOrEqual(2);

    for (const path of sources) {
      const text = readFileSync(path, 'utf8');
      for (const banned of BANNED_SOURCE_SUBSTRINGS) {
        expect(text, `${path} must not contain "${banned}"`).not.toContain(banned);
      }
    }
  });
});

// =============================================================================================
// AC-10 — OpponentAnswer shape
// =============================================================================================

describe('AC-10 — produceAnswer returns exactly { correct, elapsedMs }', () => {
  it('spec(T-018:AC-10) elapsedMs is finite non-negative; keys are exactly correct + elapsedMs', async () => {
    const opponent = createScriptedOpponent({
      id: 'shape',
      script: [{ cannonId: 'swivel_gun', correct: true, elapsedMs: 0 }],
    });
    await opponent.chooseAction(makeRivalView());
    const answer = await opponent.produceAnswer(makeQuestion());

    expect(Number.isFinite(answer.elapsedMs)).toBe(true);
    expect(answer.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(Object.keys(answer).sort()).toEqual(['correct', 'elapsedMs']);

    type AnswerKeys = keyof OpponentAnswer;
    const keysExact: Exact<AnswerKeys, 'correct' | 'elapsedMs'> = true;
    expect(keysExact).toBe(true);
  });
});

// =============================================================================================
// AC-11 — RivalAction shape + loadout membership when applicable
// =============================================================================================

describe('AC-11 — chooseAction returns exactly { cannonId } in the loadout when scripted there', () => {
  it('spec(T-018:AC-11) RivalAction has only cannonId, and it is in rivalLoadout when scripted in it', async () => {
    const opponent = createScriptedOpponent({
      id: 'loadout',
      script: [{ cannonId: 'swivel_gun', correct: false, elapsedMs: 10 }],
    });
    const view = makeRivalView({ rivalLoadout: ['swivel_gun', 'mortar'] });
    const action = await opponent.chooseAction(view);

    expect(Object.keys(action)).toEqual(['cannonId']);
    expect(view.rivalLoadout).toContain(action.cannonId);
    expect(action.cannonId).toBe('swivel_gun');

    type ActionKeys = keyof RivalAction;
    const keysExact: Exact<ActionKeys, 'cannonId'> = true;
    expect(keysExact).toBe(true);
  });
});

// =============================================================================================
// AC-12 — RivalView does not affect scripted outcomes
// =============================================================================================

describe('AC-12 — scripted results ignore RivalView contents', () => {
  it('spec(T-018:AC-12) two different views yield identical all-incorrect results', async () => {
    const script = ALL_INCORRECT_SCRIPT;
    const a = createScriptedOpponent({ id: 'view_a', script });
    const b = createScriptedOpponent({ id: 'view_b', script });

    const viewA = makeRivalView({
      volleyNumber: 1,
      playerHull: 10,
      enemyHull: 28,
      rivalLoadout: ['swivel_gun'],
      playerRecentCorrect: [true, true, true],
    });
    const viewB = makeRivalView({
      volleyNumber: 9,
      playerHull: 1,
      enemyHull: 1,
      rivalLoadout: ['culverin', 'long_nine'],
      playerRecentCorrect: [false],
    });

    const turnsA = await driveTurns(a, script.length, viewA);
    const turnsB = await driveTurns(b, script.length, viewB);

    expect(turnsA.map(({ action, answer }) => tripleOf(action, answer))).toEqual(
      turnsB.map(({ action, answer }) => tripleOf(action, answer)),
    );
    expect(turnsA.every(({ answer }) => answer.correct === false)).toBe(true);
  });
});

// =============================================================================================
// AC-13 — onboarding three-volley arithmetic against ONBOARDING_ENEMY_HULL
// =============================================================================================

describe('AC-13 — three Swivel floor volleys sink ONBOARDING_ENEMY_HULL on the third', () => {
  it('spec(T-018:AC-13) hull reaches <= 0 on volley 3 and not on volley 2', () => {
    // Ticket formula: ceil(8 + ANSWER_QUALITY_FLOOR * 4) — Swivel 8–12, range 4.
    const floorVolley = Math.ceil(8 + ANSWER_QUALITY_FLOOR * 4);
    expect(floorVolley).toBe(10);

    let hull = ONBOARDING_ENEMY_HULL;
    hull -= floorVolley;
    expect(hull, 'still afloat after volley 1').toBeGreaterThan(0);
    hull -= floorVolley;
    expect(hull, 'still afloat after volley 2 — must need a third').toBeGreaterThan(0);
    hull -= floorVolley;
    expect(hull, 'sunk on volley 3').toBeLessThanOrEqual(0);

    // Mechanism fixture: an all-incorrect three-step script is the shape PLAN.md describes;
    // the arithmetic above is what pins the T-004 constant (caller assembles the duel).
    expect(ALL_INCORRECT_SCRIPT).toHaveLength(3);
    expect(ALL_INCORRECT_SCRIPT.every((step) => step.correct === false)).toBe(true);
  });
});

// =============================================================================================
// Definition of Done
// =============================================================================================

describe('T-018 Definition of Done', () => {
  it('dod(T-018:1) tags a test against every acceptance criterion the ticket declares', () => {
    const declared = [...TICKET_SOURCE.matchAll(/\*\*(AC-\d+)\*\*/g)].map((match) => match[1]);
    const unique = [...new Set(declared)];
    const untagged = unique.filter((ac) => !OWN_SOURCE.includes(`spec(T-018:${ac})`));

    expect(unique.length).toBe(13);
    expect(untagged).toEqual([]);
  });

  it('dod(T-018:2) keeps local gates wired and this suite free of skip/only markers', () => {
    const gates = readFileSync(join(REPO_ROOT, '.tdd-swarm/run-local-gates.sh'), 'utf8');
    for (const command of ['prettier --check', 'eslint . --max-warnings 0', 'tsc --noEmit', 'vitest run']) {
      expect(gates, `run-local-gates.sh must still run: ${command}`).toContain(command);
    }
    for (const marker of DEFERRED_WORK_MARKERS) {
      expect(OWN_SOURCE.includes(marker), `suite must not contain ${marker}`).toBe(false);
    }
    expect(FOCUSED_TEST_PATTERN.test(OWN_SOURCE)).toBe(false);
  });

  it('dod(T-018:3) numbers every dod tag so spec-lint covers all seven DoD items', () => {
    const dodCount = (TICKET_SOURCE.match(/^- \[[ x]\] /gm) ?? []).length;
    const tagged = [...OWN_SOURCE.matchAll(/dod\(T-018:([^)]*)\)/g)].map((match) => match[1] ?? '');
    const unparseable = tagged.filter((id) => !/^\d+$/.test(id));
    const covered = new Set(tagged.filter((id) => /^\d+$/.test(id)).map(Number));
    const missing = Array.from({ length: dodCount }, (_, i) => i + 1).filter((n) => !covered.has(n));

    expect(dodCount).toBe(7);
    expect(unparseable).toEqual([]);
    expect(missing).toEqual([]);
    expect(OWN_SOURCE).toContain('spec(T-018:AC-');
  });

  it('dod(T-018:4) Opponent matches ARCHITECTURE §4.2 two-method Promise shape (+ ticket id)', () => {
    type ChooseParams = Parameters<Opponent['chooseAction']>;
    type ProduceParams = Parameters<Opponent['produceAnswer']>;

    const chooseTakesRivalView: Exact<ChooseParams, [RivalView]> = true;
    const produceTakesQuestion: Exact<ProduceParams, [Question]> = true;
    const chooseReturnsPromise: Exact<ReturnType<Opponent['chooseAction']>, Promise<RivalAction>> = true;
    const produceReturnsPromise: Exact<ReturnType<Opponent['produceAnswer']>, Promise<OpponentAnswer>> = true;
    const answerShape: Exact<OpponentAnswer, { readonly correct: boolean; readonly elapsedMs: number }> =
      true;

    expect([
      chooseTakesRivalView,
      produceTakesQuestion,
      chooseReturnsPromise,
      produceReturnsPromise,
      answerShape,
    ]).toEqual([true, true, true, true, true]);

    // Behavioural confirmation once the factory exists.
    const opponent = createScriptedOpponent({ id: 'shape_check', script: THREE_STEP_SCRIPT });
    expect(opponent.chooseAction(makeRivalView())).toBeInstanceOf(Promise);
    expect(opponent.produceAnswer(makeQuestion())).toBeInstanceOf(Promise);
  });

  it('dod(T-018:5) no clock, timers, or Math.random in src/engine/opponents/', () => {
    const sources = listOpponentSources();
    for (const path of sources) {
      const text = readFileSync(path, 'utf8');
      expect(text).not.toMatch(/\bMath\.random\b/);
      expect(text).not.toMatch(/\bDate\b/);
      expect(text).not.toMatch(/\bsetTimeout\b/);
      expect(text).not.toMatch(/\bsetInterval\b/);
      expect(text).not.toMatch(/\bperformance\.now\b/);
    }
  });

  it('dod(T-018:6) only mutable state is the cursor; input script is never mutated', async () => {
    const steps: ScriptedStep[] = [
      { cannonId: 'swivel_gun', correct: false, elapsedMs: 100 },
      { cannonId: 'culverin', correct: true, elapsedMs: 200 },
    ];
    const scriptSnapshot = structuredClone(steps);
    Object.freeze(steps);
    for (const step of steps) Object.freeze(step);

    const opponent = createScriptedOpponent({ id: 'immutable_input', script: steps });
    await driveTurns(opponent, 4);

    expect(steps).toEqual(scriptSnapshot);
    expect(Object.isFrozen(steps)).toBe(true);
  });

  it('dod(T-018:7) production scope includes types.ts + scripted.ts under opponents/', () => {
    expect(existsSync(TYPES_SRC_PATH), 'implementer must create src/engine/opponents/types.ts').toBe(true);
    expect(existsSync(SCRIPTED_SRC_PATH), 'implementer must create src/engine/opponents/scripted.ts').toBe(
      true,
    );

    // T-018 shipped the interface + scripted rival. Later tickets (T-021 mercy/bot) add
    // sibling modules in the same folder — require the T-018 pair, allow the known set.
    const present = readdirSync(OPPONENTS_DIR)
      .filter((name) => name.endsWith('.ts'))
      .sort();
    expect(present).toContain('scripted.ts');
    expect(present).toContain('types.ts');
    for (const name of present) {
      expect(['bot.ts', 'mercy.ts', 'scripted.ts', 'types.ts']).toContain(name);
    }
  });
});
