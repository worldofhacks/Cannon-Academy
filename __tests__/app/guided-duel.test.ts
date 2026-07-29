/**
 * A-015 — the guided first duel, bound to A-039's canonical engine/adapter boundary.
 *
 * The short property enumerates all 40 prefixes through the three-volley victory bound. Three
 * deterministic long wrong/timeout patterns then exercise more turns than an ordinary hull can
 * survive without the guided floor, including alternating and non-periodic mixtures.
 */
import { readFile } from 'node:fs/promises';

import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getCannon } from '@content/index';
import type { IslandId } from '@content/schemas';
import { duelReducer } from '@engine/duel/reducer';
import {
  createDuelState,
  toRivalView,
  type DuelConfig,
  type DuelEvent,
  type DuelState,
} from '@engine/duel/types';
import type { Opponent } from '@engine/opponents/types';
import {
  ENEMY_HULL_BY_ISLAND,
  ONBOARDING_ENEMY_HULL,
  PERFECT_SHOT_BONUS_DAMAGE,
  PLAYER_HULL,
} from '@engine/tuning';

import { resolveDestination } from '../../src/services/flow';
import { hydrate, persist, type KeyValueStore } from '../../src/services/persistence';
import { PHASE_DURATION_MS } from '../../src/stores/duel';
import { createCaptainStore, type CaptainStore } from '../../src/stores/player';

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

type CanonicalConfig = DuelConfig & {
  readonly duelId: string;
  readonly playerHullFloor?: number;
};

type SessionState = {
  readonly core: DuelState;
  readonly phase: Beat;
  readonly beatToken: number;
};

type SessionAction = DuelEvent | { readonly type: 'ADVANCE'; readonly beatToken: number };

type GuidedSession = {
  readonly getState: () => SessionState;
  readonly dispatch: (action: SessionAction) => SessionState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly dispose: () => void;
};

type GuidedOutcome = {
  readonly applied: boolean;
  readonly won: boolean;
  readonly coins: number;
  readonly [key: string]: unknown;
};

type GuidedApi = {
  readonly openGuidedDuel: (seed: number) => {
    readonly session: GuidedSession;
    readonly opponent: Opponent;
  };
  readonly settleGuidedDuel: (store: CaptainStore, session: GuidedSession) => GuidedOutcome;
  readonly createGuidedScreenController: (session: GuidedSession) => {
    readonly dispose: () => void;
  };
};

type HarnessSession = GuidedSession & {
  readonly dispatched: SessionAction[];
};

const GUIDED_PATH = '../../src/services/' + 'guidedDuel';
const ADAPTER_PATH = '../../src/services/' + 'duelAdapter';
const SETTLEMENT_PATH = '../../src/services/' + 'rewardSettlement';
const SCRIPTED_PATH = '@engine/opponents/' + 'scripted';

const SWIVEL = getCannon('swivel_gun');
const SHORTEST_VICTORY_TURNS = Math.ceil(
  ONBOARDING_ENEMY_HULL / (SWIVEL.damageMax + PERFECT_SHOT_BONUS_DAMAGE),
);
const NON_WINNING_STRESS_TURNS = Math.ceil(PLAYER_HULL / 7) + 2;
type TurnKind = 'correct' | 'wrong' | 'timeout';

const ALWAYS_HITS: Opponent = {
  id: 'onboarding_sloop',
  chooseAction: async () => ({ cannonId: 'six_pounder' }),
  produceAnswer: async () => ({ correct: true, elapsedMs: 0 }),
};

function recordOf(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function firstAdapterConfig(spy: ReturnType<typeof vi.fn>): CanonicalConfig {
  const calls = spy.mock.calls as unknown as readonly (readonly unknown[])[];
  const config = calls[0]?.[0];
  expect(config).toEqual(expect.any(Object));
  return config as CanonicalConfig;
}

function phaseFor(core: DuelState, action: SessionAction): Beat {
  switch (core.phase) {
    case 'countdown':
    case 'playerChoose':
      return 'select';
    case 'reload':
      return 'question';
    case 'resolvePlayer': {
      if (action.type === 'TIMER_EXPIRED') return 'timeout';
      const outcome = recordOf(core).outcome;
      if (recordOf(outcome).kind === 'misfire') return 'miss';
      return recordOf(outcome).perfectShot === true ? 'perfect' : 'fly';
    }
    case 'rivalTurn':
      return 'watch';
    case 'resolveRival':
      return 'rivalImpact';
    case 'victory':
    case 'defeat':
      return core.phase;
  }
}

/**
 * A narrow reference adapter used as the injected A-039 seam. A-015 code never gets the reducer:
 * it must create and return this adapter session, while every test action uses canonical events.
 */
function canonicalSession(config: CanonicalConfig): HarnessSession {
  let state: SessionState = {
    core: createDuelState(config),
    phase: 'select',
    beatToken: 0,
  };
  let disposed = false;
  const listeners = new Set<() => void>();
  const dispatched: SessionAction[] = [];

  const session: HarnessSession = {
    dispatched,
    getState: () => state,
    dispatch: (action) => {
      if (disposed) return state;
      dispatched.push(action);
      const event: DuelEvent =
        action.type === 'ADVANCE' ? ({ type: 'ANIMATION_DONE' } as DuelEvent) : (action as DuelEvent);
      if (action.type === 'ADVANCE' && action.beatToken !== state.beatToken) return state;
      const nextCore = duelReducer(state.core, event);
      if (nextCore === state.core) return state;
      state = {
        core: nextCore,
        phase: phaseFor(nextCore, action),
        beatToken: state.beatToken + 1,
      };
      listeners.forEach((listener) => listener());
      return state;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: () => {
      disposed = true;
      listeners.clear();
    },
  };
  return session;
}

function noPayment(): GuidedOutcome {
  return { applied: false, won: false, coins: 0 };
}

async function loadWithHarness(options?: {
  readonly opponent?: Opponent;
  readonly settlement?: (...args: unknown[]) => GuidedOutcome;
  readonly realSettlement?: boolean;
}): Promise<{
  readonly api: GuidedApi;
  readonly adapterFactory: ReturnType<typeof vi.fn>;
  readonly opponentFactory: ReturnType<typeof vi.fn>;
  readonly settlement: ReturnType<typeof vi.fn> | null;
}> {
  vi.resetModules();
  const adapterFactory = vi.fn((config: CanonicalConfig) => canonicalSession(config));
  const opponentFactory = vi.fn(() => options?.opponent ?? ALWAYS_HITS);
  vi.doMock(ADAPTER_PATH, () => ({ createDuelAdapter: adapterFactory }));
  vi.doMock(SCRIPTED_PATH, () => ({ createScriptedOpponent: opponentFactory }));

  let settlement: ReturnType<typeof vi.fn> | null = null;
  if (options?.realSettlement === true) {
    vi.doUnmock(SETTLEMENT_PATH);
  } else {
    settlement = vi.fn(options?.settlement ?? noPayment);
    vi.doMock(SETTLEMENT_PATH, () => ({ settleDuelRewards: settlement }));
  }

  return {
    api: (await import(GUIDED_PATH)) as GuidedApi,
    adapterFactory,
    opponentFactory,
    settlement,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock(ADAPTER_PATH);
  vi.doUnmock(SCRIPTED_PATH);
  vi.doUnmock(SETTLEMENT_PATH);
  vi.resetModules();
});

function assertSafe(state: SessionState): void {
  expect(state.core.playerHull).toBeGreaterThan(0);
  expect(state.core.phase).not.toBe('defeat');
}

function dispatch(session: GuidedSession, event: Record<string, unknown>): SessionState {
  const state = session.dispatch(event as SessionAction);
  assertSafe(state);
  return state;
}

function ready(session: GuidedSession): SessionState {
  let state = session.getState();
  if (state.core.phase === 'countdown') state = dispatch(session, { type: 'ANIMATION_DONE' });
  if (state.core.phase !== 'playerChoose') {
    throw new Error(`guided fixture expected playerChoose, received ${state.core.phase}`);
  }
  return state;
}

async function runTurn(
  opened: { readonly session: GuidedSession; readonly opponent: Opponent },
  kind: TurnKind,
): Promise<SessionState> {
  const { session, opponent } = opened;
  ready(session);
  let state = dispatch(session, { type: 'CANNON_SELECTED', cannonId: 'swivel_gun' });
  if (state.core.phase !== 'reload') throw new Error(`expected reload, received ${state.core.phase}`);
  const reload = state.core;

  if (kind === 'timeout') {
    state = dispatch(session, { type: 'TIMER_EXPIRED' });
  } else {
    const wrongIndex = reload.question.choices.findIndex(
      (_, index) => index !== reload.question.correctIndex,
    );
    state = dispatch(session, {
      type: 'ANSWER_CHOSEN',
      choiceIndex: kind === 'correct' ? reload.question.correctIndex : wrongIndex,
      elapsedMs: 0,
    });
  }

  if (state.core.phase !== 'resolvePlayer') {
    throw new Error(`expected resolvePlayer, received ${state.core.phase}`);
  }
  if (kind !== 'correct') {
    const retained = recordOf(state.core).question;
    expect(recordOf(retained).correctIndex).toBe(reload.question.correctIndex);
    expect(recordOf(retained).choices).toEqual(reload.question.choices);
  }

  state = dispatch(session, { type: 'ANIMATION_DONE' });
  if (state.core.phase === 'victory') return state;
  if (state.core.phase !== 'rivalTurn') throw new Error(`expected rivalTurn, received ${state.core.phase}`);

  const action = await opponent.chooseAction(toRivalView(state.core));
  const answer = await opponent.produceAnswer(reload.question);
  state = dispatch(session, {
    type: 'RIVAL_ACTION',
    turnToken: state.core.turnToken,
    volley: { cannonId: action.cannonId, ...answer },
  });
  if (state.core.phase !== 'resolveRival') {
    throw new Error(`expected resolveRival, received ${state.core.phase}`);
  }
  return dispatch(session, { type: 'ANIMATION_DONE' });
}

async function finish(opened: {
  readonly session: GuidedSession;
  readonly opponent: Opponent;
}): Promise<SessionState> {
  for (let turn = 0; turn <= SHORTEST_VICTORY_TURNS; turn += 1) {
    const state = opened.session.getState();
    if (state.core.phase === 'victory') return state;
    await runTurn(opened, 'correct');
  }
  throw new Error(`guided duel did not win in ${SHORTEST_VICTORY_TURNS} correct volleys`);
}

function prefixes(maxLength: number): readonly (readonly TurnKind[])[] {
  const alphabet: readonly TurnKind[] = ['correct', 'wrong', 'timeout'];
  const result: TurnKind[][] = [[]];
  let frontier: TurnKind[][] = [[]];
  for (let length = 1; length <= maxLength; length += 1) {
    frontier = frontier.flatMap((prefix) => alphabet.map((kind) => [...prefix, kind]));
    result.push(...frontier);
  }
  return result;
}

function mixedStressPatterns(): readonly (readonly Exclude<TurnKind, 'correct'>[])[] {
  const alternating = Array.from(
    { length: NON_WINNING_STRESS_TURNS },
    (_, index): Exclude<TurnKind, 'correct'> => (index % 2 === 0 ? 'wrong' : 'timeout'),
  );
  const blocks = Array.from({ length: NON_WINNING_STRESS_TURNS }, (_, index): Exclude<TurnKind, 'correct'> =>
    index % 5 < 3 ? 'timeout' : 'wrong',
  );
  let seed = 0x15a039;
  const seeded = Array.from({ length: NON_WINNING_STRESS_TURNS }, () => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return (seed & 1) === 0 ? ('wrong' as const) : ('timeout' as const);
  });
  return [alternating, blocks, seeded];
}

function readyStore(): CaptainStore {
  const store = createCaptainStore();
  store.getState().setGradeBand('k_1');
  store.getState().setNameAndFlag('Test Captain', 'blue');
  store.getState().completeOnboarding();
  return store;
}

function memoryStorage(): KeyValueStore {
  const values = new Map<string, string>();
  return {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
  };
}

function assertScreenOwnsController(source: string): void {
  const file = ts.createSourceFile(
    'guided-duel.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let importedLocal: string | null = null;
  const controllerVariables = new Set<string>();
  const disposedVariables = new Set<string>();

  function visit(node: ts.Node): void {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === '../src/services/guidedDuel' &&
      node.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      for (const element of node.importClause.namedBindings.elements) {
        if ((element.propertyName?.text ?? element.name.text) === 'createGuidedScreenController') {
          importedLocal = element.name.text;
        }
      }
    }
    if (
      importedLocal !== null &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === importedLocal &&
      node.initializer.arguments.some((argument) => /\bsession\b/.test(argument.getText(file)))
    ) {
      controllerVariables.add(node.name.text);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.name.text === 'dispose'
    ) {
      disposedVariables.add(node.expression.expression.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);

  expect(importedLocal).not.toBeNull();
  expect(controllerVariables.size).toBeGreaterThan(0);
  expect([...controllerVariables].some((name) => disposedVariables.has(name))).toBe(true);
  expect(source).not.toMatch(/\bsetTimeout\s*\(/);
  expect(source).not.toMatch(/from\s+['"]\.\.\/src\/stores\/duel['"]/);
}

describe('A-015 guided first duel', () => {
  it('spec(A-015:AC-1) creates one canonical A-039 session and returns T-018’s exact opponent', async () => {
    const session = canonicalSession({
      seed: 15_001,
      duelId: 'sentinel',
      islandId: 'port_sumwich',
      playerLoadout: ['swivel_gun'],
      rivalLoadout: ['six_pounder'],
      templatesBySkill: {},
      enemyMaxHull: ONBOARDING_ENEMY_HULL,
      playerHullFloor: 1,
    } as CanonicalConfig);
    const factoryOpponent = { ...ALWAYS_HITS, id: 'factory-sentinel' };
    vi.resetModules();
    const adapterFactory = vi.fn(() => session);
    const opponentFactory = vi.fn(() => factoryOpponent);
    vi.doMock(ADAPTER_PATH, () => ({ createDuelAdapter: adapterFactory }));
    vi.doMock(SCRIPTED_PATH, () => ({ createScriptedOpponent: opponentFactory }));
    vi.doMock(SETTLEMENT_PATH, () => ({ settleDuelRewards: vi.fn(noPayment) }));
    const api = (await import(GUIDED_PATH)) as GuidedApi;
    const opened = api.openGuidedDuel(15_001);

    expect(adapterFactory).toHaveBeenCalledOnce();
    const config = firstAdapterConfig(adapterFactory);
    expect(config).toMatchObject({
      seed: 15_001,
      enemyMaxHull: ONBOARDING_ENEMY_HULL,
      playerHullFloor: 1,
    });
    expect(config.duelId).toEqual(expect.any(String));
    expect(config.duelId.length).toBeGreaterThan(0);
    expect(opened.session).toBe(session);
    expect(opponentFactory).toHaveBeenCalledOnce();
    expect(opened.opponent).toBe(factoryOpponent);
  });

  it('spec(A-015:AC-2) exhausts every canonical correct/wrong/timeout prefix through shortest victory', async () => {
    expect(SHORTEST_VICTORY_TURNS).toBe(3);
    const corpus = prefixes(SHORTEST_VICTORY_TURNS);
    expect(corpus).toHaveLength(40);
    for (const [index, prefix] of corpus.entries()) {
      const { api } = await loadWithHarness();
      const opened = api.openGuidedDuel(15_100 + index);
      assertSafe(opened.session.getState());
      for (const kind of prefix) await runTurn(opened, kind);
      assertSafe(opened.session.getState());
    }
  });

  it('spec(A-015:AC-2) survives deterministic long mixed wrong/timeout traces then reaches victory', async () => {
    for (const [index, pattern] of mixedStressPatterns().entries()) {
      expect(pattern).toHaveLength(NON_WINNING_STRESS_TURNS);
      expect(new Set(pattern)).toEqual(new Set(['wrong', 'timeout']));
      const { api } = await loadWithHarness();
      const opened = api.openGuidedDuel(15_200 + index);
      for (const kind of pattern) await runTurn(opened, kind);
      expect(opened.session.getState().core.phase).toBe('playerChoose');
      expect((await finish(opened)).core.phase).toBe('victory');
    }
  });

  it('spec(A-015:AC-2) correct-only canonical volleys terminate only in victory', async () => {
    const { api } = await loadWithHarness();
    const terminal = await finish(api.openGuidedDuel(15_203));
    expect(terminal.core.phase).toBe('victory');
    expect(terminal.core.enemyHull).toBe(0);
    expect(terminal.core.playerHull).toBeGreaterThan(0);
  });

  it('spec(A-015:AC-3) unfinished settlement is inert; victory latch persists and relaunches to chart', async () => {
    const reward: GuidedOutcome = { applied: true, won: true, coins: 12 };
    const { api, settlement } = await loadWithHarness({ settlement: () => reward });
    const store = readyStore();
    const unfinished = api.openGuidedDuel(15_300);
    const before = structuredClone(store.getState().captain);
    expect(api.settleGuidedDuel(store, unfinished.session).applied).toBe(false);
    expect(store.getState().captain).toEqual(before);
    expect(settlement).not.toHaveBeenCalled();

    const victory = api.openGuidedDuel(15_301);
    await finish(victory);
    api.settleGuidedDuel(store, victory.session);
    expect(store.getState().captain.hasFoughtGuidedDuel).toBe(true);
    const storage = memoryStorage();
    expect(await persist(storage, store.getState().captain)).toBe(true);
    const relaunched = await hydrate(storage);
    expect(relaunched.captain.hasFoughtGuidedDuel).toBe(true);
    expect(resolveDestination(relaunched.captain)).toBe('chart');
  });

  it.each(['miss', 'timeout'] as const)(
    'spec(A-015:AC-4) the actual guided controller holds %s exactly once and cancels on unmount',
    async (phase) => {
      vi.useFakeTimers();
      const { api } = await loadWithHarness();
      const opened = api.openGuidedDuel(phase === 'miss' ? 15_401 : 15_402);
      const controller = api.createGuidedScreenController(opened.session);
      ready(opened.session);
      let state = dispatch(opened.session, { type: 'CANNON_SELECTED', cannonId: 'swivel_gun' });
      if (state.core.phase !== 'reload') throw new Error('AC-4 fixture did not reach reload');
      const reload = state.core;
      state =
        phase === 'timeout'
          ? dispatch(opened.session, { type: 'TIMER_EXPIRED' })
          : dispatch(opened.session, {
              type: 'ANSWER_CHOSEN',
              choiceIndex: reload.question.choices.findIndex(
                (_, index) => index !== reload.question.correctIndex,
              ),
              elapsedMs: 0,
            });
      expect(state.phase).toBe(phase);
      expect(recordOf(recordOf(state.core).question).correctIndex).toBe(reload.question.correctIndex);
      const duration = PHASE_DURATION_MS[phase];
      expect(duration).toBeTypeOf('number');
      const harness = opened.session as HarnessSession;

      await vi.advanceTimersByTimeAsync(duration! - 1);
      expect(harness.dispatched.filter((action) => action.type === 'ADVANCE')).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(harness.dispatched.filter((action) => action.type === 'ADVANCE')).toEqual([
        { type: 'ADVANCE', beatToken: state.beatToken },
      ]);

      const cancelled = api.openGuidedDuel(phase === 'miss' ? 15_411 : 15_412);
      const cancelledController = api.createGuidedScreenController(cancelled.session);
      ready(cancelled.session);
      const question = dispatch(cancelled.session, {
        type: 'CANNON_SELECTED',
        cannonId: 'swivel_gun',
      }).core;
      if (question.phase !== 'reload') throw new Error('cancel fixture did not reach reload');
      if (phase === 'timeout') {
        dispatch(cancelled.session, { type: 'TIMER_EXPIRED' });
      } else {
        dispatch(cancelled.session, {
          type: 'ANSWER_CHOSEN',
          choiceIndex: question.question.choices.findIndex(
            (_, index) => index !== question.question.correctIndex,
          ),
          elapsedMs: 0,
        });
      }
      await vi.advanceTimersByTimeAsync(duration! - 1);
      cancelledController.dispose();
      await vi.advanceTimersByTimeAsync(1);
      expect(
        (cancelled.session as HarnessSession).dispatched.filter((action) => action.type === 'ADVANCE'),
      ).toEqual([]);
      controller.dispose();

      const source = await readFile(new URL('../../app/guided-duel.tsx', import.meta.url), 'utf8');
      assertScreenOwnsController(source);
    },
  );

  it('spec(A-015:AC-5) delegates one terminal observation exactly once to A-032 settlement', async () => {
    const reward: GuidedOutcome = { applied: true, won: true, coins: 12 };
    const { api, settlement } = await loadWithHarness({ settlement: () => reward });
    const opened = api.openGuidedDuel(15_501);
    const terminal = await finish(opened);
    const store = readyStore();
    expect(api.settleGuidedDuel(store, opened.session)).toBe(reward);
    expect(settlement).toHaveBeenCalledOnce();
    expect(settlement).toHaveBeenCalledWith(store, terminal.core);
  });

  it('spec(A-015:AC-5) the A-032 receipt survives relaunch and makes the same duel a durable no-op', async () => {
    const { api } = await loadWithHarness({ realSettlement: true });
    const seed = 15_502;
    const firstOpened = api.openGuidedDuel(seed);
    const firstTerminal = await finish(firstOpened);
    const duelId = recordOf(firstTerminal.core).duelId;
    expect(duelId).toEqual(expect.any(String));
    const firstStore = readyStore();
    const first = api.settleGuidedDuel(firstStore, firstOpened.session);
    expect(first.applied).toBe(true);
    const receiptsBefore = JSON.stringify(recordOf(firstStore.getState().captain).rewardReceipts);
    expect(receiptsBefore).toContain(`duel:${String(duelId)}`);

    const storage = memoryStorage();
    expect(await persist(storage, firstStore.getState().captain)).toBe(true);
    const hydrated = await hydrate(storage);
    const relaunchedStore = createCaptainStore(hydrated.captain);
    const beforeReplay = structuredClone(relaunchedStore.getState().captain);
    const replayed = api.openGuidedDuel(seed);
    await finish(replayed);
    const second = api.settleGuidedDuel(relaunchedStore, replayed.session);
    expect(second).toMatchObject({ applied: false, coins: 0 });
    expect(relaunchedStore.getState().captain).toEqual(beforeReplay);
    expect(JSON.stringify(recordOf(relaunchedStore.getState().captain).rewardReceipts)).toBe(receiptsBefore);
  });

  it('dod(A-015:5) guided overrides reach canonical config while ordinary A-039 defaults stay unchanged', async () => {
    const { api, adapterFactory } = await loadWithHarness();
    const opened = api.openGuidedDuel(15_601);
    const guidedConfig = firstAdapterConfig(adapterFactory);
    const normalConfig: CanonicalConfig = {
      seed: guidedConfig.seed,
      duelId: 'ordinary-a015-control',
      islandId: 'port_sumwich' as IslandId,
      playerLoadout: guidedConfig.playerLoadout,
      rivalLoadout: guidedConfig.rivalLoadout,
      templatesBySkill: guidedConfig.templatesBySkill,
    };
    const normal = createDuelState(normalConfig);
    const guided = opened.session.getState().core;

    expect(normal.enemyHull).toBe(ENEMY_HULL_BY_ISLAND.port_sumwich);
    expect(recordOf(normal).playerHullFloor).toBe(0);
    expect(guided.enemyHull).toBe(ONBOARDING_ENEMY_HULL);
    expect(recordOf(guided).playerHullFloor).toBe(1);
    expect(guidedConfig).toMatchObject({
      enemyMaxHull: ONBOARDING_ENEMY_HULL,
      playerHullFloor: 1,
    });
  });
});
