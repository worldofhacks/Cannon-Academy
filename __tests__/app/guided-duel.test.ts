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

  for (const node of file.statements) {
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
  }

  expect(importedLocal).not.toBeNull();

  function isDisposeCall(node: ts.Node, variable: string): boolean {
    return (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === variable &&
      node.expression.name.text === 'dispose' &&
      node.arguments.length === 0
    );
  }

  function cleanupDirectlyDisposes(
    cleanup: ts.ArrowFunction | ts.FunctionExpression,
    variable: string,
  ): boolean {
    if (!ts.isBlock(cleanup.body)) return isDisposeCall(cleanup.body, variable);
    return cleanup.body.statements.some(
      (statement) => ts.isExpressionStatement(statement) && isDisposeCall(statement.expression, variable),
    );
  }

  function effectOwnsController(node: ts.Node): boolean {
    if (
      !ts.isCallExpression(node) ||
      !ts.isIdentifier(node.expression) ||
      node.expression.text !== 'useEffect'
    ) {
      return false;
    }
    const effect = node.arguments[0];
    if (
      effect === undefined ||
      (!ts.isArrowFunction(effect) && !ts.isFunctionExpression(effect)) ||
      !ts.isBlock(effect.body)
    ) {
      return false;
    }

    for (const statement of effect.body.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (
          !ts.isIdentifier(declaration.name) ||
          declaration.initializer === undefined ||
          !ts.isCallExpression(declaration.initializer) ||
          !ts.isIdentifier(declaration.initializer.expression) ||
          declaration.initializer.expression.text !== importedLocal ||
          !declaration.initializer.arguments.some((argument) => /\bsession\b/.test(argument.getText(file)))
        ) {
          continue;
        }
        const controller = declaration.name.text;
        const cleanupReturns = effect.body.statements.filter(ts.isReturnStatement);
        const ownsCleanup = cleanupReturns.some((returned) => {
          const cleanup = returned.expression;
          return (
            cleanup !== undefined &&
            (ts.isArrowFunction(cleanup) || ts.isFunctionExpression(cleanup)) &&
            cleanupDirectlyDisposes(cleanup, controller)
          );
        });
        if (!ownsCleanup) continue;

        // A same-named dispose elsewhere in the effect cannot masquerade as lifecycle cleanup.
        const hasImmediateDispose = effect.body.statements.some(
          (candidate) =>
            candidate !== statement &&
            !ts.isReturnStatement(candidate) &&
            ts.isExpressionStatement(candidate) &&
            isDisposeCall(candidate.expression, controller),
        );
        if (!hasImmediateDispose) return true;
      }
    }
    return false;
  }

  let lifecycleBound = false;
  let manualAdvanceLiteral = false;
  function visit(node: ts.Node): void {
    if (effectOwnsController(node)) lifecycleBound = true;
    if (ts.isStringLiteralLike(node) && node.text === 'ADVANCE') manualAdvanceLiteral = true;
    ts.forEachChild(node, visit);
  }
  visit(file);

  expect(lifecycleBound).toBe(true);
  expect(manualAdvanceLiteral).toBe(false);
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
    // Re-baselined 2026-08-02 under D-11 / spec(A-062:AC-7): the tutorial delegates with the
    // voyage HELD — a choreographed victory pays coins and receipts but never spends the
    // captain's arrival. Still exactly one observation, still the A-032 seam.
    expect(settlement).toHaveBeenCalledWith(store, terminal.core, { voyage: 'hold' });
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

/**
 * A-015 — replaying the walkthrough must not pay for it twice.
 *
 * The Rank screen's "Captain's papers" pushes `/guided-duel?replay=1`, so a captain can walk the
 * tutorial as often as they like. Three things make that safe, and each one is a way to damage a
 * real save if it is missed:
 *
 *   1. settlement is skipped entirely — see the property below for why idempotence does not cover
 *      it, which is the non-obvious half;
 *   2. `hasFoughtGuidedDuel` is never written `false`, because clearing the latch re-gates the
 *      captain into the tutorial on the next cold start (`resolveDestination` step 3);
 *   3. the victory sheet has its own branch, because skipping settlement leaves `appliedReward`
 *      null and the ordinary panel is gated on it.
 *
 * The screen half is asserted through TypeScript's AST rather than by rendering, for the reason
 * stated at the top of this file. Comments are absent from the AST, so no claim below can be met
 * by a sentence promising it.
 */
function guidedScreenAst(source: string): ts.SourceFile {
  return ts.createSourceFile('guided-duel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/** Every `useEffect` whose body contains a call to `name`, with that body's statements. */
function effectsCalling(file: ts.SourceFile, name: string): readonly ts.Statement[][] {
  const bodies: ts.Statement[][] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'useEffect'
    ) {
      const effect = node.arguments[0];
      if (
        effect !== undefined &&
        (ts.isArrowFunction(effect) || ts.isFunctionExpression(effect)) &&
        ts.isBlock(effect.body)
      ) {
        const statements = [...effect.body.statements];
        const callsIt = statements.some((statement) => {
          let hit = false;
          const look = (child: ts.Node): void => {
            if (ts.isCallExpression(child) && child.expression.getText(file).includes(name)) hit = true;
            ts.forEachChild(child, look);
          };
          look(statement);
          return hit;
        });
        if (callsIt) bodies.push(statements);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return bodies;
}

function countCalls(file: ts.SourceFile, name: string): number {
  let total = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.getText(file) === name) total += 1;
    ts.forEachChild(node, visit);
  };
  visit(file);
  return total;
}

describe('A-015 guided duel replay', () => {
  it('spec(A-015:AC-5) a fresh mount mints a NEW duel id, so receipts cannot make a replay free', async () => {
    // This is the property the whole guard exists for, and it is the counter-intuitive one:
    // `spec(A-015:AC-5)` above proves that settling the SAME duel twice is a durable no-op, which
    // makes it tempting to assume a replay is harmless. It is not. `openGuidedDuel(freshSeed())`
    // produces a different `duelId` on every mount, so the A-032 receipt has nothing to match and
    // settlement applies in full — coins, mastery and the rank tally, once per replay, forever.
    const { api } = await loadWithHarness({ realSettlement: true });
    const store = readyStore();

    const first = api.openGuidedDuel(15_701);
    await finish(first);
    const firstOutcome = api.settleGuidedDuel(store, first.session);
    expect(firstOutcome.applied).toBe(true);
    const afterFirst = store.getState().captain.coins;
    expect(afterFirst).toBeGreaterThan(0);

    const second = api.openGuidedDuel(15_702);
    await finish(second);
    const secondOutcome = api.settleGuidedDuel(store, second.session);

    // If this ever goes red because the second settlement stopped applying, the screen guard below
    // may be redundant — but delete the guard only after re-reading `canonicalDuelSeed`, never
    // because this test changed shape.
    expect(secondOutcome.applied).toBe(true);
    expect(store.getState().captain.coins).toBeGreaterThan(afterFirst);
  });

  it('spec(A-015:AC-5) the screen skips settlement on replay, in the effect, before the call', async () => {
    const source = await readFile(new URL('../../app/guided-duel.tsx', import.meta.url), 'utf8');
    const file = guidedScreenAst(source);

    expect(countCalls(file, 'settleGuidedDuel'), 'settlement must have exactly one call site').toBe(1);

    const bodies = effectsCalling(file, 'settleGuidedDuel');
    expect(bodies, 'settlement is not owned by a useEffect').toHaveLength(1);
    const statements = bodies[0] ?? [];

    const settlementIndex = statements.findIndex((statement) =>
      statement.getText(file).includes('settleGuidedDuel'),
    );
    const guardIndex = statements.findIndex(
      (statement) =>
        ts.isIfStatement(statement) &&
        /\breplay\b/.test(statement.expression.getText(file)) &&
        statement.thenStatement.getText(file).includes('return'),
    );

    expect(guardIndex, 'no `if (replay) return` guard in the settlement effect').toBeGreaterThanOrEqual(0);
    expect(
      guardIndex,
      'the replay guard sits AFTER the settlement call, which pays out before it bails',
    ).toBeLessThan(settlementIndex);
  });

  it('spec(A-015:AC-5) the screen never clears the latch and never latches it itself', async () => {
    const source = await readFile(new URL('../../app/guided-duel.tsx', import.meta.url), 'utf8');

    // `markGuidedDuelFought` belongs to `settleGuidedDuel` alone. A screen that called it directly
    // would latch a replay, which is harmless — and would also latch a duel that was never settled,
    // which strands the captain's first-run rewards.
    expect(source, 'the screen calls markGuidedDuelFought itself').not.toMatch(/markGuidedDuelFought/);

    // Clearing the latch to "let them replay" is the tempting fix and the destructive one: on the
    // next cold start `resolveDestination` sends the captain back into the tutorial instead of the
    // chart, and `demo-navigation.test.ts` AC-3 freezes that behaviour.
    expect(source, 'the screen writes hasFoughtGuidedDuel = false').not.toMatch(
      /hasFoughtGuidedDuel\s*[:=]\s*false/,
    );
  });

  it('spec(A-015:AC-5) replay gets past the latch redirect and gets its own ending', async () => {
    const source = await readFile(new URL('../../app/guided-duel.tsx', import.meta.url), 'utf8');
    const file = guidedScreenAst(source);

    // The `/chart` redirect turns away any captain who has already fought. Without a replay branch
    // the Rank screen's "walk me through it again" is a button that bounces straight back.
    const redirectGuard = source.match(/if\s*\(([^)]*)\)\s*return\s*<Redirect href="\/chart"/);
    expect(redirectGuard?.[1], 'the /chart redirect is not mode-aware').toMatch(/\breplay\b/);

    // Skipping settlement leaves `appliedReward` null forever, and the ordinary victory panel is
    // gated on it — so without this branch a replay ends on a blank parchment sheet.
    expect(source, 'no replay-specific victory branch').toMatch(
      /view\.phase === 'victory' && replay/,
    );
    expect(countCalls(file, 'router.back'), 'replay does not return where it came from').toBeGreaterThan(
      0,
    );
  });
});

/**
 * A-015 — the HUD shows the child their own hull.
 *
 * `projectGuidedView` fed `core.enemyMaxHull` into BOTH hull cards, so the first duel a child ever
 * plays printed "100 / 28" over their own ship. The number was the smallest part of it: `HullCard`
 * derives its ten pips and its hull word from `hp / max`, so a ratio of 3.57 clamped every pip full
 * and pinned the word to SOUND for the whole tutorial, and `SeaStage` was handed the same 3.57 for
 * the ship's damage state. The one thing beat 12 exists to teach — that a hit takes blocks off a
 * hull — could not be seen happening.
 *
 * Asserted against the ENGINE's own starting hull rather than against the literal 100, so the day
 * `PLAYER_HULL` moves this follows it instead of freezing a number the duel no longer uses.
 */
describe('A-015 the guided duel’s hull readout', () => {
  it('spec(A-015:AC-5) the player’s max is the player’s own starting hull, never the rival’s', async () => {
    type HudView = {
      readonly playerHull: number;
      readonly playerMax: number;
      readonly rivalMax: number;
    };
    const { api } = await loadWithHarness();
    const project = (api as unknown as {
      readonly projectGuidedView: (state: SessionState) => HudView;
    }).projectGuidedView;
    expect(project, 'guidedDuel must export projectGuidedView').toBeTypeOf('function');

    const opened = api.openGuidedDuel(15_801);
    const start = opened.session.getState();
    const first = project(start);

    // The engine's own number, and the projection's, have to be the same number.
    expect(first.playerMax).toBe(start.core.playerHull);
    expect(first.playerMax).toBe(PLAYER_HULL);
    expect(first.rivalMax).toBe(ONBOARDING_ENEMY_HULL);
    expect(
      first.playerMax,
      'the player card is reading the enemy’s hull — this is the "100 / 28" defect',
    ).not.toBe(first.rivalMax);

    // The ratio every derived thing hangs off: pips, hull word, and the ship's damage state. Over
    // 1 it clamps, and a clamped bar cannot show a child that anything happened.
    expect(first.playerHull / first.playerMax).toBe(1);

    // And it has to MOVE. `ALWAYS_HITS` is the default opponent, so one wrong answer costs hull.
    await runTurn(opened, 'wrong');
    const hit = project(opened.session.getState());
    expect(hit.playerHull, 'the rival never landed one, so this proves nothing').toBeLessThan(
      PLAYER_HULL,
    );
    expect(hit.playerMax).toBe(PLAYER_HULL);
    expect(hit.playerHull / hit.playerMax).toBeLessThan(1);
  });
});

/**
 * A-015 — the replay's hand-off into the chart tour.
 *
 * The Rank row says "watch the tour again", and the tour is twenty beats: the duel is beats 5–16
 * and the chart walkthrough is 17–20. A replay that ended on this screen ended on the half the row
 * does not name — and the other half was unreachable by construction, because `ChartWalkthrough`
 * rendered `null` the moment `hasCompletedOnboarding` latched.
 *
 * Two properties, and the second is the one that keeps a captain safe:
 *
 *   1. the send-off arms the chart half and goes there, rather than dropping the captain back;
 *   2. it is armed ONLY there — so a captain who abandons the duel halfway has armed nothing, and
 *      there is no state for them to be stuck inside.
 */
describe('A-015 replay continues into the chart tour', () => {
  it('spec(A-015:AC-5) the replay send-off arms the chart tour and lands on the chart', async () => {
    const source = await readFile(new URL('../../app/guided-duel.tsx', import.meta.url), 'utf8');

    const handOff = source.match(/const continueTour = \(\) => \{([\s\S]*?)\n {2}\};/);
    expect(handOff?.[1], 'no replay hand-off').toBeDefined();
    expect(handOff?.[1], 'the hand-off does not arm the chart tour').toMatch(/beginTourReplay\(\)/);
    expect(handOff?.[1], 'the hand-off does not go to the chart').toMatch(
      /router\.replace\('\/chart'\)/,
    );
    // The replay ending is wired to it, rather than to the abandon path.
    expect(source).toMatch(/<ReplayVictoryPanel[\s\S]{0,120}onContinue=\{continueTour\}/);
  });

  it('spec(A-015:AC-5) an abandoned replay arms nothing — the flag is set at the send-off alone', async () => {
    const source = await readFile(new URL('../../app/guided-duel.tsx', import.meta.url), 'utf8');
    const file = guidedScreenAst(source);

    expect(countCalls(file, 'captainStore.getState().beginTourReplay')).toBe(1);

    // `leave` is every other way off this screen — the turn bar, the defeat panel. If it armed the
    // tour, a captain who walked away mid-duel would meet the chart walkthrough on their next visit
    // to the chart with no idea why.
    const leave = source.match(/const leave = \(\) => \{([\s\S]*?)\n {2}\};/);
    expect(leave?.[1], 'no leave handler').toBeDefined();
    expect(leave?.[1], 'the abandon path arms a replay').not.toMatch(/beginTourReplay/);
  });

  it('spec(A-015:AC-5) the grown-up skip goes through the resolver, never to a route of its own', async () => {
    const source = await readFile(new URL('../../app/guided-duel.tsx', import.meta.url), 'utf8');

    // Skipping writes `hasFoughtGuidedDuel`, but writes nothing about the band, the name or the
    // flag — so where it lands has to be the resolver's answer. A hardcoded `/chart` would strand a
    // captain who reached this screen without a name: `resolveDestination` would send them back to
    // the name screen on the next launch, and the skip would look like it had done nothing.
    expect(source).toMatch(/const skipTour = \(\) => router\.replace\(`\/\$\{commitTourSkip\(captainStore\)\}`\)/);
    expect(source, 'the screen writes hasFoughtGuidedDuel = false').not.toMatch(
      /hasFoughtGuidedDuel\s*[:=]\s*false/,
    );
  });
});
