/**
 * A-015 — guided first duel.  This deliberately loads the not-yet-created boundary inside each
 * assertion: RED is eight behavioural failures, never a suite-collection error.
 */
import { describe, expect, it, vi } from 'vitest';

import { getCannon } from '@content/index';
import type { Opponent } from '@engine/opponents/types';
import {
  ENEMY_HULL_BY_ISLAND,
  ONBOARDING_ENEMY_HULL,
  PERFECT_SHOT_BONUS_DAMAGE,
  PLAYER_HULL,
} from '@engine/tuning';

import { applyDuelOutcome, type DuelRewardOutcome } from '../../src/services/duelRewards';
import { resolveDestination } from '../../src/services/flow';
import { hydrate, persist, type KeyValueStore } from '../../src/services/persistence';
import { duelReducer, initialDuelState, PHASE_DURATION_MS, type DuelState } from '../../src/stores/duel';
import { createCaptainStore, type CaptainStore } from '../../src/stores/player';

type GuidedApi = {
  readonly openGuidedDuel: (seed: number) => { readonly state: DuelState; readonly opponent: Opponent };
  readonly settleGuidedDuel: (store: CaptainStore, state: DuelState) => DuelRewardOutcome;
  /** The screen must use this controller rather than dispatching an early ADVANCE itself. */
  readonly createGuidedHold: (dispatch: (action: { readonly type: 'ADVANCE' }) => void) => {
    readonly hold: (phase: 'miss' | 'timeout') => void;
    readonly dispose: () => void;
  };
};

// Keep this non-literal import path so the absent A-015 module is a test failure, not a TS error.
const guidedPath = '../../src/services/' + 'guidedDuel';
async function guided(): Promise<GuidedApi> {
  vi.doUnmock('@engine/opponents/scripted');
  vi.resetModules();
  return (await import(guidedPath)) as GuidedApi;
}

const SWIVEL = getCannon('swivel_gun');
const SHORTEST_VICTORY_TURNS = Math.ceil(
  ONBOARDING_ENEMY_HULL / (SWIVEL.damageMax + PERFECT_SHOT_BONUS_DAMAGE),
);
const NON_WINNING_STRESS_TURNS = Math.ceil(PLAYER_HULL / 7) + 2;
const TRANSITION_CAP = 16;
type TurnKind = 'correct' | 'wrong' | 'timeout';

function question(state: DuelState): NonNullable<DuelState['question']> {
  if (state.question === null) throw new Error(`no question in '${state.phase}'`);
  return state.question;
}
function wrongChoice(state: DuelState): number {
  const wrong = question(state).choices.find((choice) => choice !== question(state).answer);
  if (wrong === undefined) throw new Error('fixture question has no wrong choice');
  return wrong;
}
function assertSafe(state: DuelState): void {
  expect(state.playerHull).toBeGreaterThan(0);
  expect(state.phase).not.toBe('defeat');
}
function runTurn(start: DuelState, kind: TurnKind, safe = true): DuelState {
  let state = start;
  const apply = (next: DuelState): void => {
    state = next;
    if (safe) assertSafe(state);
  };
  if (state.phase !== 'select') throw new Error(`turn started in '${state.phase}'`);
  apply(duelReducer(state, { type: 'PICK_CANNON', cannon: SWIVEL }));
  apply(
    kind === 'timeout'
      ? duelReducer(state, { type: 'TIMEOUT' })
      : duelReducer(state, {
          type: 'ANSWER',
          value: kind === 'correct' ? question(state).answer : wrongChoice(state),
          elapsedMs: 0,
        }),
  );
  for (let step = 0; step < TRANSITION_CAP; step += 1) {
    if (state.phase === 'select' || state.phase === 'victory' || state.phase === 'defeat') return state;
    apply(duelReducer(state, { type: 'ADVANCE' }));
  }
  throw new Error(`turn '${kind}' did not settle`);
}
function finish(start: DuelState): DuelState {
  let state = start;
  for (let turn = 0; turn <= SHORTEST_VICTORY_TURNS; turn += 1) {
    if (state.phase === 'victory') return state;
    state = runTurn(state, 'correct');
  }
  throw new Error('guided duel did not win');
}
function prefixes(max: number): readonly (readonly TurnKind[])[] {
  const alphabet: readonly TurnKind[] = ['correct', 'wrong', 'timeout'];
  const result: TurnKind[][] = [[]];
  let frontier: TurnKind[][] = [[]];
  for (let n = 1; n <= max; n += 1) {
    frontier = frontier.flatMap((prefix) => alphabet.map((kind) => [...prefix, kind]));
    result.push(...frontier);
  }
  return result;
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

describe('A-015 guided first duel', () => {
  it('spec(A-015:AC-1) returns the exact T-018 factory result at engine-tuned onboarding hull', async () => {
    const factoryResult: Opponent = {
      id: 'factory-sentinel',
      chooseAction: async () => ({ cannonId: 'swivel_gun' }),
      produceAnswer: async () => ({ correct: true, elapsedMs: 0 }),
    };
    const factory = vi.fn(() => factoryResult);
    vi.resetModules();
    vi.doMock('@engine/opponents/scripted', () => ({ createScriptedOpponent: factory }));
    const api = (await import(guidedPath)) as GuidedApi;
    const opened = api.openGuidedDuel(15_001);

    expect(factory).toHaveBeenCalledOnce();
    expect(opened.opponent).toBe(factoryResult);
    expect(opened.state.rivalHull).toBe(ONBOARDING_ENEMY_HULL);
    expect(opened.state.rivalMax).toBe(ONBOARDING_ENEMY_HULL);
    vi.doUnmock('@engine/opponents/scripted');
  });

  it('spec(A-015:AC-2) exhausts every finite correct/wrong/timeout prefix through shortest victory', async () => {
    const { openGuidedDuel } = await guided();
    expect(SHORTEST_VICTORY_TURNS).toBe(3);
    const corpus = prefixes(SHORTEST_VICTORY_TURNS);
    expect(corpus).toHaveLength(40);
    corpus.forEach((prefix, index) => {
      let state = openGuidedDuel(15_100 + index).state;
      for (const kind of prefix) state = runTurn(state, kind);
      assertSafe(state);
    });
  });

  it.each(['wrong', 'timeout'] as const)(
    'spec(A-015:AC-2) an indefinitely %s child remains afloat then can win',
    async (kind) => {
      const { openGuidedDuel } = await guided();
      let state = openGuidedDuel(kind === 'wrong' ? 15_201 : 15_202).state;
      for (let turn = 0; turn < NON_WINNING_STRESS_TURNS; turn += 1) state = runTurn(state, kind);
      expect(state.phase).toBe('select');
      expect(finish(state).phase).toBe('victory');
    },
  );

  it('spec(A-015:AC-2) enough correct volleys have victory as their only terminal', async () => {
    const { openGuidedDuel } = await guided();
    const victory = finish(openGuidedDuel(15_203).state);
    expect(victory).toMatchObject({ phase: 'victory', rivalHull: 0 });
    expect(victory.playerHull).toBeGreaterThan(0);
  });

  it('spec(A-015:AC-3) only a finished victory latches, persists, and relaunches to chart', async () => {
    const { openGuidedDuel, settleGuidedDuel } = await guided();
    const store = readyStore();
    const before = structuredClone(store.getState().captain);
    const unfinished = settleGuidedDuel(store, openGuidedDuel(15_300).state);
    expect(unfinished.applied).toBe(false);
    expect(store.getState().captain).toEqual(before);

    settleGuidedDuel(store, finish(openGuidedDuel(15_301).state));
    expect(store.getState().captain.hasFoughtGuidedDuel).toBe(true);
    const storage = memoryStorage();
    expect(await persist(storage, store.getState().captain)).toBe(true);
    const relaunched = await hydrate(storage);
    expect(resolveDestination(relaunched.captain)).toBe('chart');
  });

  it.each(['miss', 'timeout'] as const)(
    'spec(A-015:AC-4) %s cannot dispatch ADVANCE before its exact full teaching hold',
    async (phase) => {
      vi.useFakeTimers();
      const { createGuidedHold } = await guided();
      let state = initialDuelState(15_400 + (phase === 'miss' ? 1 : 2));
      state = duelReducer(state, { type: 'PICK_CANNON', cannon: SWIVEL });
      const correctAnswer = question(state).answer;
      state =
        phase === 'miss'
          ? duelReducer(state, { type: 'ANSWER', value: wrongChoice(state), elapsedMs: 0 })
          : duelReducer(state, { type: 'TIMEOUT' });
      expect(state.phase).toBe(phase);
      expect(state.question?.answer).toBe(correctAnswer);
      const dispatch = vi.fn();
      const hold = createGuidedHold(dispatch);
      const duration = PHASE_DURATION_MS[phase];
      expect(duration).toBeTypeOf('number');
      hold.hold(phase);
      expect(dispatch).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(duration! - 1);
      expect(dispatch).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: 'ADVANCE' });
      hold.dispose();
      vi.useRealTimers();
    },
  );

  it('spec(A-015:AC-5) applies the real reward exactly once for a guided duelId', async () => {
    const { openGuidedDuel, settleGuidedDuel } = await guided();
    const victory = finish(openGuidedDuel(15_501).state);
    const actual = readyStore();
    const reference = readyStore();
    const expected = applyDuelOutcome(reference, victory);
    reference.getState().markGuidedDuelFought();
    const first = settleGuidedDuel(actual, victory);
    const afterFirst = structuredClone(actual.getState().captain);
    const second = settleGuidedDuel(actual, victory);
    expect(first).toEqual(expected);
    expect(first).toMatchObject({ applied: true, won: true });
    expect(actual.getState().captain).toEqual(reference.getState().captain);
    expect(second).toMatchObject({ applied: false, coins: 0 });
    expect(actual.getState().captain).toEqual(afterFirst);
  });

  it('dod(A-015:5) A-039 normal defaults stay unchanged while guided options reach the canonical boundary', async () => {
    const { openGuidedDuel } = await guided();
    const seed = 15_601;
    const normal = initialDuelState(seed);
    const guidedState = openGuidedDuel(seed).state;
    expect(normal).toMatchObject({ playerHull: PLAYER_HULL, rivalHull: ENEMY_HULL_BY_ISLAND.port_sumwich });
    expect(guidedState).toMatchObject({ playerHull: expect.any(Number), rivalHull: ONBOARDING_ENEMY_HULL });
    expect(guidedState.playerHull).toBeGreaterThan(0);
  });
});
