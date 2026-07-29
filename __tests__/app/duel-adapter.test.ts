import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import { templateSchema, type Template } from '@content/schemas';
import { duelReducer } from '@engine/duel/reducer';
import { createDuelState, type DuelConfig, type DuelEvent, type DuelState } from '@engine/duel/types';

const ADAPTER_PATH = '../../src/services/' + 'duelAdapter';

type Beat =
  | 'select'
  | 'question'
  | 'perfect'
  | 'fly'
  | 'impact'
  | 'miss'
  | 'timeout'
  | 'watch'
  | 'rivalFly'
  | 'rivalImpact'
  | 'victory'
  | 'defeat';

type AdapterState = {
  readonly core: DuelState;
  readonly phase: Beat;
  readonly beatToken: number;
};

type AdapterController = {
  readonly getState: () => AdapterState;
  readonly dispatch: (action: Record<string, unknown>) => AdapterState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly reset: (config: DuelConfig) => AdapterState;
  readonly dispose: () => void;
};

type AdapterApi = {
  readonly presentationBeatsForCore?: (core: DuelState) => readonly Beat[];
  readonly projectPresentation?: (core: DuelState) => unknown;
  readonly replayDuelPresentation?: (record: {
    readonly config: DuelConfig;
    readonly eventLog: readonly DuelEvent[];
  }) => { readonly core: DuelState; readonly presentation: unknown };
  readonly createDuelAdapter?: (
    config: DuelConfig,
    options?: {
      readonly initialCore?: DuelState;
      readonly reduceCore?: typeof duelReducer;
      readonly onReward?: (terminal: DuelState) => void;
    },
  ) => AdapterController;
};

const TEMPLATE: Template = templateSchema.parse({
  id: 'a039_adapter_add',
  skill: 'add_within_10',
  text: '{a} + {b} = ?',
  params: { a: [1, 3], b: [1, 3] },
  answerExpr: 'a + b',
  distractors: ['a + b + 1', 'a + b + 2', 'a + b + 3'],
});

function config(seed = 390, duelId = `a039-${seed}`): DuelConfig {
  return {
    seed,
    duelId,
    islandId: 'port_sumwich',
    playerLoadout: ['swivel_gun'],
    rivalLoadout: ['six_pounder'],
    templatesBySkill: { add_within_10: [TEMPLATE] },
  } as DuelConfig;
}

function reduce(state: DuelState, event: Record<string, unknown>): DuelState {
  return duelReducer(state, event as DuelEvent);
}

async function adapterApi(): Promise<AdapterApi> {
  try {
    return (await import(ADAPTER_PATH)) as AdapterApi;
  } catch {
    expect.fail('A-039 requires src/services/duelAdapter.ts');
  }
}

function requiredFunction<T>(candidate: T | undefined, name: string): T {
  expect(candidate, `duelAdapter must export ${name}`).toBeTypeOf('function');
  if (candidate === undefined) throw new Error(`${name} missing`);
  return candidate;
}

function reload(input = config()): Extract<DuelState, { phase: 'reload' }> {
  let state = reduce(createDuelState(input), { type: 'ANIMATION_DONE' });
  state = reduce(state, { type: 'CANNON_SELECTED', cannonId: 'swivel_gun' });
  if (state.phase !== 'reload') throw new Error(`expected reload, received ${state.phase}`);
  return state;
}

function answered(correct: boolean, perfect: boolean): DuelState {
  const start = reload(config(perfect ? 391 : correct ? 392 : 393));
  const wrongIndex = start.question.choices.findIndex((_, index) => index !== start.question.correctIndex);
  return reduce(start, {
    type: 'ANSWER_CHOSEN',
    choiceIndex: correct ? start.question.correctIndex : wrongIndex,
    elapsedMs: perfect ? 0 : start.timerMs,
  });
}

function timedOut(): DuelState {
  return reduce(reload(config(394)), { type: 'TIMER_EXPIRED' });
}

function rivalResult(correct: boolean): DuelState {
  const rivalTurn = reduce(timedOut(), { type: 'ANIMATION_DONE' });
  if (rivalTurn.phase !== 'rivalTurn') throw new Error(`expected rivalTurn, received ${rivalTurn.phase}`);
  return reduce(rivalTurn, {
    type: 'RIVAL_ACTION',
    turnToken: rivalTurn.turnToken,
    volley: { cannonId: 'six_pounder', correct, elapsedMs: 500 },
  });
}

function terminal(won: boolean, input = config(won ? 395 : 396)): DuelState {
  let state = createDuelState(input);
  for (let step = 0; step < 300; step += 1) {
    if (state.phase === 'victory' || state.phase === 'defeat') return state;
    switch (state.phase) {
      case 'countdown':
      case 'resolvePlayer':
      case 'resolveRival':
        state = reduce(state, { type: 'ANIMATION_DONE' });
        break;
      case 'playerChoose':
        state = reduce(state, { type: 'CANNON_SELECTED', cannonId: 'swivel_gun' });
        break;
      case 'reload': {
        const reloadState = state;
        const wrongIndex = reloadState.question.choices.findIndex(
          (_, index) => index !== reloadState.question.correctIndex,
        );
        state = reduce(state, {
          type: 'ANSWER_CHOSEN',
          choiceIndex: won ? reloadState.question.correctIndex : wrongIndex,
          elapsedMs: won ? 0 : reloadState.timerMs,
        });
        break;
      }
      case 'rivalTurn':
        state = reduce(state, {
          type: 'RIVAL_ACTION',
          turnToken: state.turnToken,
          volley: { cannonId: 'six_pounder', correct: !won, elapsedMs: 0 },
        });
        break;
    }
  }
  throw new Error(`terminal fixture did not finish; phase=${state.phase}`);
}

function liveRivalTurn(): Extract<DuelState, { phase: 'rivalTurn' }> {
  const state = reduce(timedOut(), { type: 'ANIMATION_DONE' });
  if (state.phase !== 'rivalTurn') throw new Error(`expected rivalTurn, received ${state.phase}`);
  return state;
}

function captureTerminalReplay(): {
  readonly config: DuelConfig;
  readonly eventLog: readonly DuelEvent[];
  readonly terminal: DuelState;
} {
  const replayConfig = config(397, 'a039-replay');
  const events: DuelEvent[] = [];
  let state = createDuelState(replayConfig);
  let playerTurns = 0;
  let rivalTurns = 0;

  const apply = (event: Record<string, unknown>): void => {
    events.push(event as DuelEvent);
    state = reduce(state, event);
  };

  for (let step = 0; step < 300; step += 1) {
    if (state.phase === 'victory') {
      expect(events.some((event) => event.type === 'TIMER_EXPIRED')).toBe(true);
      const rivalEvents = events.filter(
        (event): event is Extract<DuelEvent, { type: 'RIVAL_ACTION' }> => event.type === 'RIVAL_ACTION',
      );
      expect(rivalEvents.some((event) => event.volley.correct)).toBe(true);
      expect(rivalEvents.some((event) => !event.volley.correct)).toBe(true);
      return { config: replayConfig, eventLog: events, terminal: state };
    }

    switch (state.phase) {
      case 'countdown':
      case 'resolvePlayer':
      case 'resolveRival':
        apply({ type: 'ANIMATION_DONE' });
        break;
      case 'playerChoose':
        apply({ type: 'CANNON_SELECTED', cannonId: 'swivel_gun' });
        break;
      case 'reload':
        if (playerTurns === 0) {
          apply({ type: 'TIMER_EXPIRED' });
        } else {
          apply({
            type: 'ANSWER_CHOSEN',
            choiceIndex: state.question.correctIndex,
            elapsedMs: 0,
          });
        }
        playerTurns += 1;
        break;
      case 'rivalTurn': {
        const hit = rivalTurns % 2 === 1;
        apply({
          type: 'RIVAL_ACTION',
          turnToken: state.turnToken,
          volley: { cannonId: 'six_pounder', correct: hit, elapsedMs: 500 },
        });
        rivalTurns += 1;
        break;
      }
      case 'defeat':
        throw new Error('victory replay fixture unexpectedly lost');
    }
  }
  throw new Error(`replay fixture did not finish; phase=${state.phase}`);
}

describe('A-039 duel presentation adapter', () => {
  it('spec(A-039:AC-1) dod(A-039:2) dod(A-039:3) has a focused source boundary around engine-owned rules', async () => {
    await adapterApi();
    const source = await readFile(new URL('../../src/services/duelAdapter.ts', import.meta.url), 'utf8');
    const storeSource = await readFile(new URL('../../src/stores/duel.ts', import.meta.url), 'utf8');
    const prohibitedImports =
      /from\s+['"](?:@engine\/duel\/damage|@engine\/economy|@engine\/rng|@engine\/tuning|\.\.\/services\/questions)['"]/;

    expect(source).not.toMatch(prohibitedImports);
    expect(storeSource).not.toMatch(prohibitedImports);
    expect(storeSource).toMatch(/from\s+['"]\.\.\/services\/duelAdapter['"]/);
  });

  const beatCases: readonly [string, () => DuelState, readonly Beat[]][] = [
    ['correct', () => answered(true, false), ['fly', 'impact']],
    ['wrong', () => answered(false, false), ['miss']],
    ['perfect', () => answered(true, true), ['perfect', 'fly', 'impact']],
    ['timeout', timedOut, ['timeout']],
    ['rival hit', () => rivalResult(true), ['watch', 'rivalFly', 'rivalImpact']],
    ['rival miss', () => rivalResult(false), ['watch', 'rivalFly', 'rivalImpact']],
    ['victory', () => terminal(true), ['victory']],
    ['defeat', () => terminal(false), ['defeat']],
  ];

  it.each(beatCases)(
    'spec(A-039:AC-3) projects the complete ordered presentation beats for genuine %s core state',
    async (_label, makeState, expected) => {
      const api = await adapterApi();
      const beatsFor = requiredFunction(api.presentationBeatsForCore, 'presentationBeatsForCore');
      const core = makeState();

      expect(beatsFor(core)).toEqual(expected);
    },
  );

  it('spec(A-039:AC-4) JSON-round-trips a produced complete terminal trace into identical core and presentation', async () => {
    const api = await adapterApi();
    const replay = requiredFunction(api.replayDuelPresentation, 'replayDuelPresentation');
    const project = requiredFunction(api.projectPresentation, 'projectPresentation');
    const observed = captureTerminalReplay();
    const roundTripped = JSON.parse(
      JSON.stringify({ config: observed.config, eventLog: observed.eventLog }),
    ) as { config: DuelConfig; eventLog: DuelEvent[] };

    const replayed = replay(roundTripped);
    expect(replayed.core).toEqual(observed.terminal);
    expect(replayed.core.phase).toBe('victory');
    expect(replayed.presentation).toEqual(project(observed.terminal));
  });

  it('spec(A-039:AC-5) accepts a matching live rival token exactly once', async () => {
    const api = await adapterApi();
    const create = requiredFunction(api.createDuelAdapter, 'createDuelAdapter');
    const core = liveRivalTurn();
    const reduceCore = vi.fn(duelReducer);
    const controller = create(config(398), { initialCore: core, reduceCore });
    const before = controller.getState();

    const after = controller.dispatch({
      type: 'RIVAL_RESULT',
      turnToken: core.turnToken,
      volley: { cannonId: 'six_pounder', correct: true, elapsedMs: 1 },
    });

    expect(after).not.toBe(before);
    expect(after.core.phase).toBe('resolveRival');
    expect(reduceCore).toHaveBeenCalledTimes(1);
    expect(reduceCore.mock.calls[0]?.[1]).toMatchObject({
      type: 'RIVAL_ACTION',
      turnToken: core.turnToken,
    });
  });

  it('spec(A-039:AC-5) makes an old in-flight rival callback inert after reset and after dispose', async () => {
    const api = await adapterApi();
    const create = requiredFunction(api.createDuelAdapter, 'createDuelAdapter');
    const oldCore = liveRivalTurn();
    const staleResult = {
      type: 'RIVAL_RESULT',
      turnToken: oldCore.turnToken,
      volley: { cannonId: 'six_pounder', correct: true, elapsedMs: 1 },
    };

    const resetReward = vi.fn();
    const resetListener = vi.fn();
    const resetReduce = vi.fn(duelReducer);
    const resetController = create(config(399), {
      initialCore: oldCore,
      reduceCore: resetReduce,
      onReward: resetReward,
    });
    resetController.subscribe(resetListener);
    resetController.reset(config(400, 'a039-after-reset'));
    resetListener.mockClear();
    resetReward.mockClear();
    resetReduce.mockClear();
    const afterReset = resetController.getState();
    expect(resetController.dispatch(staleResult)).toBe(afterReset);
    expect(resetController.getState()).toBe(afterReset);
    expect(resetReduce).not.toHaveBeenCalled();
    expect(resetListener).not.toHaveBeenCalled();
    expect(resetReward).not.toHaveBeenCalled();

    const disposeReward = vi.fn();
    const disposeListener = vi.fn();
    const disposeReduce = vi.fn(duelReducer);
    const disposeController = create(config(401), {
      initialCore: oldCore,
      reduceCore: disposeReduce,
      onReward: disposeReward,
    });
    disposeController.subscribe(disposeListener);
    const beforeDispose = disposeController.getState();
    disposeController.dispose();
    expect(disposeController.dispatch(staleResult)).toBe(beforeDispose);
    expect(disposeController.getState()).toBe(beforeDispose);
    expect(disposeReduce).not.toHaveBeenCalled();
    expect(disposeListener).not.toHaveBeenCalled();
    expect(disposeReward).not.toHaveBeenCalled();
  });
});
