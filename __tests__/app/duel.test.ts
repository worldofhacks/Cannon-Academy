import { readFile } from 'node:fs/promises';

import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

import { getCannon } from '@content/index';
import { templateSchema, type SkillId, type Template } from '@content/schemas';
import { duelReducer } from '@engine/duel/reducer';
import { type DuelConfig, type DuelState } from '@engine/duel/types';

const STORE_PATH = '../../src/stores/' + 'duel';

type AppState = {
  readonly core: DuelState;
  readonly phase: string;
  readonly beatToken: number;
  readonly rng: DuelState['rng'];
  readonly question: unknown;
  readonly outcome: unknown;
  readonly playerHull: number;
  readonly rivalHull: number;
  readonly asked: number;
  readonly right: number;
  readonly perfects: number;
  readonly skillTally: Readonly<
    Partial<Record<SkillId, { readonly correct: number; readonly asked: number }>>
  >;
  readonly actionLog: DuelState['actionLog'];
  readonly result: unknown;
};

type AppStore = {
  readonly getState: () => AppState;
  readonly dispatch: (action: Record<string, unknown>) => AppState;
  readonly subscribe: (listener: () => void) => () => void;
};

type StoreApi = {
  readonly createDuelStore?: (
    config: DuelConfig,
    options?: { readonly reduceCore?: typeof duelReducer },
  ) => AppStore;
};

const TEMPLATE: Template = templateSchema.parse({
  id: 'a039_live_add',
  skill: 'add_within_10',
  text: '{a} + {b} = ?',
  params: { a: [1, 3], b: [1, 3] },
  answerExpr: 'a + b',
  distractors: ['a + b + 1', 'a + b + 2', 'a + b + 3'],
});

function config(): DuelConfig {
  return {
    seed: 3900,
    duelId: 'a039-live-store',
    islandId: 'port_sumwich',
    playerLoadout: ['swivel_gun'],
    rivalLoadout: ['six_pounder'],
    templatesBySkill: { add_within_10: [TEMPLATE] },
  } as DuelConfig;
}

function recordOf(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function expectedSkillTally(core: DuelState): AppState['skillTally'] {
  const projected: Partial<Record<SkillId, { correct: number; asked: number }>> = {};
  for (const [skill, tally] of Object.entries(core.tally.bySkill)) {
    if (tally === undefined) continue;
    projected[skill as SkillId] = { correct: tally.correct, asked: tally.attempts };
  }
  return projected;
}

function expectCanonicalProjection(app: AppState): void {
  const core = app.core;
  const coreRecord = recordOf(core);
  expect(app.rng).toBe(core.rng);
  expect(app.playerHull).toBe(core.playerHull);
  expect(app.rivalHull).toBe(core.enemyHull);
  const coreQuestion = coreRecord.question as
    | {
        readonly text: string;
        readonly choices: readonly { readonly value: number }[];
        readonly correctIndex: number;
        readonly readAloud: boolean;
        readonly templateId: string;
      }
    | undefined;
  expect(app.question).toEqual(
    coreQuestion === undefined
      ? null
      : {
          text: coreQuestion.text,
          answer: coreQuestion.choices[coreQuestion.correctIndex]?.value,
          choices: coreQuestion.choices.map((choice) => choice.value),
          readAloud: coreQuestion.readAloud,
          templateId: coreQuestion.templateId,
        },
  );
  expect(app.outcome).toBe(coreRecord.outcome ?? null);
  expect(app.asked).toBe(core.tally.totalAnswers);
  expect(app.right).toBe(core.tally.correctAnswers);
  expect(app.perfects).toBe(core.tally.perfectShots);
  expect(app.skillTally).toEqual(expectedSkillTally(core));
  expect(app.actionLog).toBe(core.actionLog);
  expect(app.result).toBe(coreRecord.result ?? null);
}

async function storeApi(): Promise<StoreApi> {
  return (await import(STORE_PATH)) as StoreApi;
}

function requireStore(api: StoreApi): NonNullable<StoreApi['createDuelStore']> {
  expect(api.createDuelStore, 'src/stores/duel.ts must export createDuelStore').toBeTypeOf('function');
  if (api.createDuelStore === undefined) throw new Error('createDuelStore missing');
  return api.createDuelStore;
}

describe('A-039 live duel boundary', () => {
  it('spec(A-039:AC-1) projects the real engine state at every app transition and consumes each action once', async () => {
    const createStore = requireStore(await storeApi());
    const reduceCore = vi.fn(duelReducer);
    const listener = vi.fn();
    const store = createStore(config(), { reduceCore });
    store.subscribe(listener);

    const initial = store.getState();
    expect(initial.core.phase).toBe('playerChoose');
    expect(initial.phase).toBe('select');
    expect(reduceCore).toHaveBeenCalledTimes(1);
    expect(reduceCore.mock.calls[0]?.[1]).toEqual({ type: 'ANIMATION_DONE' });
    expect(initial.core).toBe(reduceCore.mock.results[0]?.value);
    expectCanonicalProjection(initial);

    let calls = reduceCore.mock.calls.length;
    const question = store.dispatch({ type: 'PICK_CANNON', cannon: getCannon('swivel_gun') });
    expect(reduceCore).toHaveBeenCalledTimes(calls + 1);
    expect(reduceCore.mock.calls.at(-1)?.[1]).toEqual({
      type: 'CANNON_SELECTED',
      cannonId: 'swivel_gun',
    });
    expect(question.core).toBe(reduceCore.mock.results.at(-1)?.value);
    expect(question.core.phase).toBe('reload');
    expect(question.phase).toBe('question');
    expectCanonicalProjection(question);

    const coreQuestion = recordOf(question.core).question as
      | {
          readonly correctIndex: number;
          readonly choices: readonly { readonly value: number }[];
        }
      | undefined;
    if (coreQuestion === undefined) throw new Error('reload state carries no question');
    const correctValue = coreQuestion.choices[coreQuestion.correctIndex]?.value;
    if (correctValue === undefined) throw new Error('reload state carries no correct choice');
    calls = reduceCore.mock.calls.length;
    const resolved = store.dispatch({
      type: 'ANSWER',
      value: correctValue,
      elapsedMs: getCannon('swivel_gun').timerMs,
    });
    expect(reduceCore).toHaveBeenCalledTimes(calls + 1);
    expect(reduceCore.mock.calls.at(-1)?.[1]).toEqual({
      type: 'ANSWER_CHOSEN',
      choiceIndex: coreQuestion.correctIndex,
      elapsedMs: getCannon('swivel_gun').timerMs,
    });
    expect(resolved.core).toBe(reduceCore.mock.results.at(-1)?.value);
    expect(resolved.core.phase).toBe('resolvePlayer');
    expectCanonicalProjection(resolved);

    let animationEvents = 0;
    for (let tick = 0; tick < 6 && store.getState().core.phase !== 'rivalTurn'; tick += 1) {
      const beforeTick = store.getState();
      const coreCallsBefore = reduceCore.mock.calls.length;
      const notificationsBefore = listener.mock.calls.length;
      const action = { type: 'ADVANCE', beatToken: beforeTick.beatToken };
      const afterFirst = store.dispatch(action);
      expectCanonicalProjection(afterFirst);
      const callsAfterFirst = reduceCore.mock.calls.length;
      expect(callsAfterFirst - coreCallsBefore).toBeLessThanOrEqual(1);
      if (callsAfterFirst === coreCallsBefore + 1) {
        animationEvents += 1;
        expect(reduceCore.mock.calls.at(-1)?.[1]).toEqual({ type: 'ANIMATION_DONE' });
        expect(afterFirst.core).toBe(reduceCore.mock.results.at(-1)?.value);
      } else {
        expect(afterFirst.core).toBe(beforeTick.core);
      }

      const notificationsAfterFirst = listener.mock.calls.length;
      const afterDuplicate = store.dispatch(action);
      expect(afterDuplicate).toBe(afterFirst);
      expect(reduceCore).toHaveBeenCalledTimes(callsAfterFirst);
      expect(listener).toHaveBeenCalledTimes(notificationsAfterFirst);
      expect(notificationsAfterFirst - notificationsBefore).toBeLessThanOrEqual(1);
    }

    expect(store.getState().core.phase).toBe('rivalTurn');
    expect(store.getState().phase).toBe('watch');
    expect(animationEvents).toBe(1);
    expectCanonicalProjection(store.getState());
  });

  it('spec(A-039:AC-1) dod(A-039:1) structurally bars gameplay imports and app-side arithmetic ownership', async () => {
    const source = await readFile(new URL('../../src/stores/duel.ts', import.meta.url), 'utf8');
    const file = ts.createSourceFile('duel.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const prohibitedImports = new Set([
      '@engine/duel/damage',
      '@engine/economy',
      '@engine/rng',
      '@engine/tuning',
      '../services/questions',
    ]);
    const badImports: string[] = [];
    const gameplayArithmetic: string[] = [];

    function visit(node: ts.Node): void {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        prohibitedImports.has(node.moduleSpecifier.text)
      ) {
        badImports.push(node.moduleSpecifier.text);
      }
      if (
        ts.isBinaryExpression(node) &&
        [
          ts.SyntaxKind.PlusToken,
          ts.SyntaxKind.MinusToken,
          ts.SyntaxKind.AsteriskToken,
          ts.SyntaxKind.SlashToken,
        ].includes(node.operatorToken.kind) &&
        /\b(?:Hull|hull|damage|tally|asked|right|perfect|coins|rng)\b/.test(node.getText(file))
      ) {
        gameplayArithmetic.push(node.getText(file));
      }
      ts.forEachChild(node, visit);
    }
    visit(file);

    expect(badImports).toEqual([]);
    expect(gameplayArithmetic).toEqual([]);
    expect(source).toMatch(/from\s+['"]\.\.\/services\/duelAdapter['"]/);
  });
});
