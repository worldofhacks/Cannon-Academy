/**
 * A-015 — the guided first duel.
 *
 * The exhaustive prefix bound is the shortest physically possible Swivel Gun victory:
 * ceil(onboarding hull / (maximum Swivel damage + Perfect Shot bonus)). At the shipped tuning
 * that is three turns, so all 1 + 3 + 9 + 27 prefixes are cheap to enumerate. Long all-wrong and
 * all-timeout traces separately prove that "unlosable" is not merely true for those three turns.
 */
import { describe, expect, it } from 'vitest';

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
import {
  openGuidedDuel as openGuidedDuelUnderTest,
  settleGuidedDuel as settleGuidedDuelUnderTest,
} from '../../src/services/guidedDuel';
import { hydrate, persist, type KeyValueStore } from '../../src/services/persistence';
import { duelReducer, initialDuelState, PHASE_DURATION_MS, type DuelState } from '../../src/stores/duel';
import { createCaptainStore, type CaptainStore } from '../../src/stores/player';

type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type GuidedOptions = { readonly rivalHull?: number; readonly hullFloor?: number };
type OpenedGuidedDuel = { readonly state: DuelState; readonly opponent: Opponent };

const openGuidedDuel: (seed: number) => OpenedGuidedDuel = openGuidedDuelUnderTest;
const settleGuidedDuel: (store: CaptainStore, state: DuelState) => DuelRewardOutcome =
  settleGuidedDuelUnderTest;

const exactOpenParameters: Exact<Parameters<typeof openGuidedDuelUnderTest>, [seed: number]> = true;
const exactOpenReturn: Exact<ReturnType<typeof openGuidedDuelUnderTest>, OpenedGuidedDuel> = true;
const exactSettleParameters: Exact<
  Parameters<typeof settleGuidedDuelUnderTest>,
  [store: CaptainStore, state: DuelState]
> = true;
const exactSettleReturn: Exact<ReturnType<typeof settleGuidedDuelUnderTest>, DuelRewardOutcome> = true;
const exactInitialParameters: Exact<
  Parameters<typeof initialDuelState>,
  [seed: number, options?: GuidedOptions]
> = true;
void [exactOpenParameters, exactOpenReturn, exactSettleParameters, exactSettleReturn, exactInitialParameters];

const SWIVEL = getCannon('swivel_gun');
const SHORTEST_VICTORY_TURNS = Math.ceil(
  ONBOARDING_ENEMY_HULL / (SWIVEL.damageMax + PERFECT_SHOT_BONUS_DAMAGE),
);
const NON_WINNING_STRESS_TURNS = Math.ceil(PLAYER_HULL / 7) + 2;
const TRANSITION_CAP = 16;

type TurnKind = 'correct' | 'wrong' | 'timeout';

function requireQuestion(state: DuelState): NonNullable<DuelState['question']> {
  if (state.question === null) throw new Error(`guided-duel harness: '${state.phase}' has no question`);
  return state.question;
}

function wrongChoice(state: DuelState): number {
  const question = requireQuestion(state);
  const wrong = question.choices.find((choice) => choice !== question.answer);
  if (wrong === undefined) throw new Error('guided-duel harness: question offered no wrong choice');
  return wrong;
}

function assertSafe(state: DuelState): void {
  expect(state.playerHull).toBeGreaterThan(0);
  expect(state.phase).not.toBe('defeat');
}

/** Drives one complete player+rival turn and checks safety after every reducer transition. */
function runTurn(start: DuelState, kind: TurnKind, requireSafety = true): DuelState {
  let state = start;
  const apply = (next: DuelState): void => {
    state = next;
    if (requireSafety) assertSafe(state);
  };

  if (state.phase !== 'select') throw new Error(`guided-duel turn started in '${state.phase}'`);
  apply(duelReducer(state, { type: 'PICK_CANNON', cannon: SWIVEL }));
  if (kind === 'timeout') {
    apply(duelReducer(state, { type: 'TIMEOUT' }));
  } else {
    const question = requireQuestion(state);
    apply(
      duelReducer(state, {
        type: 'ANSWER',
        value: kind === 'correct' ? question.answer : wrongChoice(state),
        elapsedMs: 0,
      }),
    );
  }

  for (let step = 0; step < TRANSITION_CAP; step += 1) {
    if (state.phase === 'select' || state.phase === 'victory' || state.phase === 'defeat') return state;
    apply(duelReducer(state, { type: 'ADVANCE' }));
  }
  throw new Error(`guided-duel turn did not settle from '${kind}'`);
}

function finishWithCorrectAnswers(start: DuelState): DuelState {
  let state = start;
  for (let turn = 0; turn < SHORTEST_VICTORY_TURNS + 1; turn += 1) {
    if (state.phase === 'victory') return state;
    state = runTurn(state, 'correct');
  }
  throw new Error(`guided duel did not end in ${SHORTEST_VICTORY_TURNS} correct volleys`);
}

function prefixes(alphabet: readonly TurnKind[], maxLength: number): readonly (readonly TurnKind[])[] {
  const out: TurnKind[][] = [[]];
  let frontier: TurnKind[][] = [[]];
  for (let length = 1; length <= maxLength; length += 1) {
    frontier = frontier.flatMap((prefix) => alphabet.map((kind) => [...prefix, kind]));
    out.push(...frontier);
  }
  return out;
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
  it('spec(A-015:AC-1) opens at engine-tuned onboarding hull with T-018’s scripted rival', async () => {
    const opened = openGuidedDuel(15_001);

    expect(opened.state.rivalHull).toBe(ONBOARDING_ENEMY_HULL);
    expect(opened.state.rivalMax).toBe(ONBOARDING_ENEMY_HULL);
    expect(opened.opponent.id).toBe('onboarding_sloop');
    expect(opened.opponent.chooseAction).toBeTypeOf('function');
    expect(opened.opponent.produceAnswer).toBeTypeOf('function');

    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../../src/services/guidedDuel.ts', import.meta.url), 'utf8'),
    );
    expect(source).toMatch(/\bcreateScriptedOpponent\s*\(/);
  });

  it('spec(A-015:AC-2) exhausts every correct/wrong/timeout prefix through the shortest victory', () => {
    expect(SHORTEST_VICTORY_TURNS).toBe(3);
    const corpus = prefixes(['correct', 'wrong', 'timeout'], SHORTEST_VICTORY_TURNS);
    expect(corpus).toHaveLength(40);

    corpus.forEach((prefix, index) => {
      let state = openGuidedDuel(15_100 + index).state;
      assertSafe(state);
      for (const kind of prefix) state = runTurn(state, kind);
      assertSafe(state);
      expect(state.phase).not.toBe('defeat');
    });
  });

  it.each(['wrong', 'timeout'] as const)(
    'spec(A-015:AC-2) an indefinitely %s child remains afloat and can still win',
    (kind) => {
      let state = openGuidedDuel(kind === 'wrong' ? 15_201 : 15_202).state;
      for (let turn = 0; turn < NON_WINNING_STRESS_TURNS; turn += 1) {
        state = runTurn(state, kind);
      }

      expect(state.phase).toBe('select');
      expect(state.playerHull).toBeGreaterThan(0);
      expect(finishWithCorrectAnswers(state).phase).toBe('victory');
    },
  );

  it('spec(A-015:AC-2) enough correct-only volleys terminate only in victory', () => {
    const victory = finishWithCorrectAnswers(openGuidedDuel(15_203).state);

    expect(victory.phase).toBe('victory');
    expect(victory.rivalHull).toBe(0);
    expect(victory.playerHull).toBeGreaterThan(0);
  });

  it('spec(A-015:AC-3) settling victory persists the latch and resolves next launch to chart', async () => {
    const store = readyStore();
    const victory = finishWithCorrectAnswers(openGuidedDuel(15_301).state);

    settleGuidedDuel(store, victory);
    expect(store.getState().captain.hasFoughtGuidedDuel).toBe(true);
    expect(resolveDestination(store.getState().captain)).toBe('chart');

    const storage = memoryStorage();
    expect(await persist(storage, store.getState().captain)).toBe(true);
    const relaunched = await hydrate(storage);
    expect(relaunched.captain.hasFoughtGuidedDuel).toBe(true);
    expect(resolveDestination(relaunched.captain)).toBe('chart');
  });

  it.each(['wrong', 'timeout'] as const)(
    'spec(A-015:AC-4) a %s resolution keeps the correct answer for its full teaching beat',
    (kind) => {
      let state = openGuidedDuel(kind === 'wrong' ? 15_401 : 15_402).state;
      state = duelReducer(state, { type: 'PICK_CANNON', cannon: SWIVEL });
      const correctAnswer = requireQuestion(state).answer;
      state =
        kind === 'timeout'
          ? duelReducer(state, { type: 'TIMEOUT' })
          : duelReducer(state, { type: 'ANSWER', value: wrongChoice(state), elapsedMs: 0 });

      expect(state.phase).toBe(kind === 'wrong' ? 'miss' : 'timeout');
      expect(state.question?.answer).toBe(correctAnswer);
      expect(PHASE_DURATION_MS[state.phase]).toBeGreaterThan(0);
    },
  );

  it('spec(A-015:AC-5) settlement matches real duel rewards and is idempotent per duelId', () => {
    const victory = finishWithCorrectAnswers(openGuidedDuel(15_501).state);
    const actualStore = readyStore();
    const referenceStore = readyStore();

    const expected = applyDuelOutcome(referenceStore, victory);
    referenceStore.getState().markGuidedDuelFought();
    const first = settleGuidedDuel(actualStore, victory);
    const afterFirst = actualStore.getState().captain;
    const second = settleGuidedDuel(actualStore, victory);

    expect(first).toEqual(expected);
    expect(first.applied).toBe(true);
    expect(first.coins).toBeGreaterThan(0);
    expect(afterFirst).toEqual(referenceStore.getState().captain);
    expect(afterFirst.wins).toBe(1);
    expect(afterFirst.mastery.add_within_10?.attempts).toBeGreaterThan(0);
    expect(second.applied).toBe(false);
    expect(second.coins).toBe(0);
    expect(actualStore.getState().captain).toEqual(afterFirst);
  });

  it('dod(A-015:5) omitted initial-state options preserve the existing duel defaults', () => {
    const seed = 15_601;
    const implicit = initialDuelState(seed);
    const explicitEmpty = initialDuelState(seed, {});

    expect(implicit).toEqual(explicitEmpty);
    expect(implicit.playerHull).toBe(PLAYER_HULL);
    expect(implicit.rivalHull).toBe(ENEMY_HULL_BY_ISLAND.port_sumwich);
    expect(implicit.rivalMax).toBe(ENEMY_HULL_BY_ISLAND.port_sumwich);

    let ordinary = implicit;
    for (let turn = 0; turn < NON_WINNING_STRESS_TURNS && ordinary.phase !== 'defeat'; turn += 1) {
      ordinary = runTurn(ordinary, 'timeout', false);
    }
    expect(ordinary.phase).toBe('defeat');
    expect(ordinary.playerHull).toBe(0);
  });
});
