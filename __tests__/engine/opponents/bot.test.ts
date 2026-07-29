/**
 * T-021 — Banded bot opponent (`bot.ts`).
 *
 * Pins PRNG-driven accuracy calibration, forced-misfire consumption, elapsedMs bounds,
 * loadout coverage, determinism, construction validation, and the secondary source scan
 * for clock/randomness leaks (ARCHITECTURE.md §4.2).
 *
 * Traceability: behavioural tests use `spec(T-021:AC-n)`; DoD items shared with mercy.test.ts.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getCannon } from '@content/index';
import { CANNON_IDS } from '@content/schemas';
import type { CannonId } from '@content/schemas';
import type { RivalAction, RivalView } from '@engine/duel/types';
import { createBotOpponent as createBotOpponentUnderTest } from '@engine/opponents/bot';
import type { Opponent, OpponentAnswer } from '@engine/opponents/types';
import type { Question } from '@engine/questions/types';
import { createRng, type Rng } from '@engine/rng';
import { ONBOARDING_ENEMY_HULL } from '@engine/tuning';

// =============================================================================================
// Signature pins (honest RED typecheck — LESSONS.md L-024)
// =============================================================================================

type CreateBotOpponentInput = {
  readonly id: string;
  readonly loadout: readonly CannonId[];
  readonly accuracy: number;
  readonly forcedMisfires: number;
  readonly rng: Rng;
};

const createBotOpponent: (input: CreateBotOpponentInput) => Opponent = createBotOpponentUnderTest;

/** Compile-time exact-type equality — invariant in both directions. */
type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// =============================================================================================
// Paths / suite meta
// =============================================================================================

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '../../..');
const SUITE_PATH = fileURLToPath(import.meta.url);
const BOT_SRC_PATH = join(REPO_ROOT, 'src/engine/opponents/bot.ts');
const MERCY_SRC_PATH = join(REPO_ROOT, 'src/engine/opponents/mercy.ts');

const OWN_SOURCE = readFileSync(SUITE_PATH, 'utf8');

/** AC-18 banned substrings — secondary defence; ESLint is authoritative. */
const BANNED_SOURCE_SUBSTRINGS = [
  'Date',
  'Math.random',
  'setTimeout',
  'setInterval',
  'performance.now',
] as const;

const THREE_CANNON_LOADOUT: readonly CannonId[] = ['swivel_gun', 'six_pounder', 'long_nine'];

for (const id of THREE_CANNON_LOADOUT) {
  expect(CANNON_IDS.includes(id), `${id} must be a catalog cannon`).toBe(true);
}

// =============================================================================================
// Fixtures
// =============================================================================================

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    templateId: 't021_fixture',
    skill: 'add_within_10',
    text: '2 + 3 = ?',
    params: { a: 2, b: 3 },
    choices: [
      { value: 5, label: '5' },
      { value: 6, label: '6' },
      { value: 4, label: '4' },
      { value: 7, label: '7' },
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
    rivalLoadout: [...THREE_CANNON_LOADOUT],
    playerRecentCorrect: [true, false],
    ...overrides,
  };
}

function makeBot(overrides: Partial<CreateBotOpponentInput> = {}): Opponent {
  return createBotOpponent({
    id: 'banded_bot',
    loadout: THREE_CANNON_LOADOUT,
    accuracy: 0.6,
    forcedMisfires: 0,
    rng: createRng(0x021_beef),
    ...overrides,
  });
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

// =============================================================================================
// AC-11 — accuracy calibration over a fixed seed
// =============================================================================================

describe('AC-11 — bot accuracy calibration', { timeout: 60000 }, () => {
  it('spec(T-021:AC-11) 10,000 answers at accuracy 0.6 land in [0.58, 0.62] with exact answer keys', async () => {
    const opponent = makeBot({ accuracy: 0.6, forcedMisfires: 0, rng: createRng(42_021) });
    const turns = await driveTurns(opponent, 10_000);
    const correctCount = turns.filter(({ answer }) => answer.correct).length;
    const rate = correctCount / turns.length;

    expect(rate).toBeGreaterThanOrEqual(0.58);
    expect(rate).toBeLessThanOrEqual(0.62);
    for (const { answer } of turns) {
      expect(Object.keys(answer).sort()).toEqual(['correct', 'elapsedMs']);
    }
  });
});

// =============================================================================================
// AC-12 — forced misfires consume before PRNG accuracy
// =============================================================================================

describe('AC-12 — forced misfires apply to the next answers only', { timeout: 60000 }, () => {
  it('spec(T-021:AC-12) accuracy 1.0 with forcedMisfires 2 yields two wrong then two right', async () => {
    const opponent = makeBot({ accuracy: 1.0, forcedMisfires: 2, rng: createRng(12_021) });
    const turns = await driveTurns(opponent, 4);
    expect(turns.map(({ answer }) => answer.correct)).toEqual([false, false, true, true]);
  });
});

// =============================================================================================
// AC-13 — degenerate accuracy bounds
// =============================================================================================

describe('AC-13 — degenerate accuracies', { timeout: 60000 }, () => {
  it('spec(T-021:AC-13) accuracy 0.0 always wrong; accuracy 1.0 with no misfires always right', async () => {
    const alwaysWrong = makeBot({ accuracy: 0.0, forcedMisfires: 0, rng: createRng(130_021) });
    const wrongTurns = await driveTurns(alwaysWrong, 100);
    expect(wrongTurns.every(({ answer }) => answer.correct === false)).toBe(true);

    const alwaysRight = makeBot({ accuracy: 1.0, forcedMisfires: 0, rng: createRng(131_021) });
    const rightTurns = await driveTurns(alwaysRight, 100);
    expect(rightTurns.every(({ answer }) => answer.correct === true)).toBe(true);
  });
});

// =============================================================================================
// AC-14 — elapsedMs is PRNG-drawn within cannon timer
// =============================================================================================

describe('AC-14 — elapsedMs bounds follow the chosen cannon timer', { timeout: 60000 }, () => {
  it('spec(T-021:AC-14) every elapsedMs is an integer in [0, getCannon(cannonId).timerMs]', async () => {
    const opponent = makeBot({ rng: createRng(14_021) });
    const turns = await driveTurns(opponent, 1_000);

    for (const { action, answer } of turns) {
      const timerMs = getCannon(action.cannonId).timerMs;
      expect(Number.isInteger(answer.elapsedMs)).toBe(true);
      expect(answer.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(answer.elapsedMs).toBeLessThanOrEqual(timerMs);
    }
  });
});

// =============================================================================================
// AC-15 — loadout coverage via pick
// =============================================================================================

describe('AC-15 — chooseAction picks uniformly from the loadout', { timeout: 60000 }, () => {
  it('spec(T-021:AC-15) three-cannon loadout: every id appears ≥800 times in 3,000 picks', async () => {
    const opponent = makeBot({ loadout: THREE_CANNON_LOADOUT, rng: createRng(15_021) });
    const counts = new Map<CannonId, number>(THREE_CANNON_LOADOUT.map((id) => [id, 0]));

    for (let i = 0; i < 3_000; i += 1) {
      const action = await opponent.chooseAction(makeRivalView());
      expect(THREE_CANNON_LOADOUT).toContain(action.cannonId);
      counts.set(action.cannonId, (counts.get(action.cannonId) ?? 0) + 1);
    }

    for (const id of THREE_CANNON_LOADOUT) {
      expect(counts.get(id) ?? 0).toBeGreaterThanOrEqual(800);
    }
  });
});

// =============================================================================================
// AC-16 — determinism from seed
// =============================================================================================

describe('AC-16 — identical seeds produce identical triples', { timeout: 60000 }, () => {
  it('spec(T-021:AC-16) same inputs → identical 200-turn sequences; different seed → different', async () => {
    const sharedRng = createRng(16_021);
    const input = {
      id: 'determinism_a',
      loadout: THREE_CANNON_LOADOUT,
      accuracy: 0.55,
      forcedMisfires: 0,
      rng: sharedRng,
    } as const;

    const botA = createBotOpponent({ ...input, id: 'bot_a' });
    const botB = createBotOpponent({ ...input, id: 'bot_b' });
    const botOther = createBotOpponent({ ...input, id: 'bot_other', rng: createRng(16_022) });

    const turnsA = await driveTurns(botA, 200);
    const turnsB = await driveTurns(botB, 200);
    const turnsOther = await driveTurns(botOther, 200);

    expect(turnsA.map(({ action, answer }) => tripleOf(action, answer))).toEqual(
      turnsB.map(({ action, answer }) => tripleOf(action, answer)),
    );
    expect(turnsA.map(({ action, answer }) => tripleOf(action, answer))).not.toEqual(
      turnsOther.map(({ action, answer }) => tripleOf(action, answer)),
    );
  });
});

// =============================================================================================
// AC-17 — construction validation
// =============================================================================================

describe('AC-17 — invalid construction throws RangeError or Error naming the field', () => {
  it('spec(T-021:AC-17) empty loadout throws RangeError or Error naming loadout', () => {
    expect(() =>
      createBotOpponent({
        id: 'bad',
        loadout: [],
        accuracy: 0.5,
        forcedMisfires: 0,
        rng: createRng(17_001),
      }),
    ).toThrow(/loadout|RangeError/);
  });

  it('spec(T-021:AC-17) accuracy outside [0, 1] throws RangeError or Error naming accuracy', () => {
    for (const accuracy of [-0.1, 1.1, Number.NaN]) {
      expect(() =>
        createBotOpponent({
          id: 'bad_accuracy',
          loadout: THREE_CANNON_LOADOUT,
          accuracy,
          forcedMisfires: 0,
          rng: createRng(17_002),
        }),
      ).toThrow(/accuracy|RangeError/);
    }
  });

  it('spec(T-021:AC-17) negative forcedMisfires throws RangeError or Error naming forcedMisfires', () => {
    expect(() =>
      createBotOpponent({
        id: 'bad_misfires',
        loadout: THREE_CANNON_LOADOUT,
        accuracy: 0.5,
        forcedMisfires: -1,
        rng: createRng(17_003),
      }),
    ).toThrow(/forcedMisfires|RangeError/);
  });

  it('spec(T-021:AC-17) loadout cannon absent from catalog throws Error naming the cannon', () => {
    const bogus = 'not_a_real_cannon' as CannonId;
    expect(CANNON_IDS.includes(bogus)).toBe(false);
    expect(() =>
      createBotOpponent({
        id: 'bad_cannon',
        loadout: [bogus],
        accuracy: 0.5,
        forcedMisfires: 0,
        rng: createRng(17_004),
      }),
    ).toThrow(Error);
    expect(() =>
      createBotOpponent({
        id: 'bad_cannon',
        loadout: [bogus],
        accuracy: 0.5,
        forcedMisfires: 0,
        rng: createRng(17_004),
      }),
    ).toThrow(/not_a_real_cannon|cannon|loadout/i);
  });
});

// =============================================================================================
// AC-18 — source scan for clock / randomness leaks
// =============================================================================================

describe('AC-18 — bot.ts and mercy.ts contain no clock or randomness APIs', () => {
  it('spec(T-021:AC-18) mercy.ts and bot.ts avoid banned substrings', () => {
    expect(existsSync(BOT_SRC_PATH), 'implementer must create src/engine/opponents/bot.ts').toBe(true);
    expect(existsSync(MERCY_SRC_PATH), 'implementer must create src/engine/opponents/mercy.ts').toBe(true);

    for (const path of [BOT_SRC_PATH, MERCY_SRC_PATH]) {
      const text = readFileSync(path, 'utf8');
      for (const banned of BANNED_SOURCE_SUBSTRINGS) {
        expect(text, `${path} must not contain "${banned}"`).not.toContain(banned);
      }
    }
  });
});

// =============================================================================================
// Definition of Done (bot-specific pins; mercy.test.ts covers the shared items)
// =============================================================================================

describe('T-021 bot — Definition of Done', { timeout: 60000 }, () => {
  it('dod(T-021:4) createBotOpponent satisfies Opponent without modifying types.ts', () => {
    const opponent = makeBot();
    expect(typeof opponent.id).toBe('string');
    expect(typeof opponent.chooseAction).toBe('function');
    expect(typeof opponent.produceAnswer).toBe('function');

    type OpponentKeys = keyof Opponent;
    const keysAreExact: Exact<OpponentKeys, 'id' | 'chooseAction' | 'produceAnswer'> = true;
    const chooseReturnsPromise: Exact<ReturnType<Opponent['chooseAction']>, Promise<RivalAction>> = true;
    const produceReturnsPromise: Exact<ReturnType<Opponent['produceAnswer']>, Promise<OpponentAnswer>> = true;
    expect([keysAreExact, chooseReturnsPromise, produceReturnsPromise]).toEqual([true, true, true]);
    expect(opponent.chooseAction(makeRivalView())).toBeInstanceOf(Promise);
    expect(opponent.produceAnswer(makeQuestion())).toBeInstanceOf(Promise);
  });

  it('dod(T-021:6) bot mutable state is only the internal Rng cursor and misfire counter', async () => {
    const opponent = makeBot({ accuracy: 1.0, forcedMisfires: 2, rng: createRng(60_021) });
    const loadoutSnapshot = [...THREE_CANNON_LOADOUT];
    Object.freeze(loadoutSnapshot);

    await driveTurns(opponent, 4);
    expect(loadoutSnapshot).toEqual([...THREE_CANNON_LOADOUT]);
    expect(Object.isFrozen(loadoutSnapshot)).toBe(true);
  });

  it('dod(T-021:7) production scope includes bot.ts alongside mercy.ts', () => {
    expect(existsSync(BOT_SRC_PATH)).toBe(true);
    expect(existsSync(MERCY_SRC_PATH)).toBe(true);
    expect(OWN_SOURCE).toContain('@engine/opponents/bot');
  });
});
