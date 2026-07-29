import { describe, expect, it } from 'vitest';

import { ISLAND_IDS, templateSchema, type IslandId, type Template } from '@content/schemas';
import { duelReducer } from '@engine/duel/reducer';
import {
  toRivalView,
  createDuelState,
  type DuelConfig,
  type DuelEvent,
  type DuelState,
} from '@engine/duel/types';
import { ENEMY_HULL_BY_ISLAND, PLAYER_HULL } from '@engine/tuning';

const TEMPLATE: Template = templateSchema.parse({
  id: 'a039_add',
  skill: 'add_within_10',
  text: '{a} + {b} = ?',
  params: { a: [1, 3], b: [1, 3] },
  answerExpr: 'a + b',
  distractors: ['a + b + 1', 'a + b + 2', 'a + b + 3'],
});

type CanonicalConfig = DuelConfig & {
  readonly duelId: string;
  readonly playerHullFloor?: number;
};

function config(
  overrides: Partial<{
    seed: number;
    duelId: string;
    islandId: IslandId;
    enemyMaxHull: number;
    playerHullFloor: number;
  }> = {},
): CanonicalConfig {
  return {
    seed: overrides.seed ?? 39,
    duelId: overrides.duelId ?? 'a039-duel',
    islandId: overrides.islandId ?? 'port_sumwich',
    playerLoadout: ['swivel_gun'],
    rivalLoadout: ['six_pounder'],
    templatesBySkill: { add_within_10: [TEMPLATE] },
    ...(overrides.enemyMaxHull === undefined ? {} : { enemyMaxHull: overrides.enemyMaxHull }),
    ...(overrides.playerHullFloor === undefined ? {} : { playerHullFloor: overrides.playerHullFloor }),
  } as CanonicalConfig;
}

function reduce(state: DuelState, event: Record<string, unknown>): DuelState {
  return duelReducer(state, event as DuelEvent);
}

function reload(input: CanonicalConfig = config()): Extract<DuelState, { phase: 'reload' }> {
  let state = reduce(createDuelState(input), { type: 'ANIMATION_DONE' });
  state = reduce(state, { type: 'CANNON_SELECTED', cannonId: 'swivel_gun' });
  if (state.phase !== 'reload') throw new Error(`A-039 fixture expected reload, received ${state.phase}`);
  return state;
}

function recordOf(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object') throw new Error('A-039 expected an object');
  return value as Record<string, unknown>;
}

function mercyProjection(state: DuelState): readonly boolean[] {
  return toRivalView(state).playerRecentCorrect;
}

function masteryProjection(state: DuelState): DuelState['tally']['bySkill'] {
  return state.tally.bySkill;
}

describe('A-039 canonical engine rules', () => {
  it('spec(A-039:AC-2) dod(A-039:4) makes timeout a replayable free result through the completed rival turn', () => {
    const before = reload();
    const beforeQuestion = before.question;
    const beforeRng = before.rng;
    const beforeTally = before.tally;
    const beforeMastery = masteryProjection(before);
    const beforeMercy = mercyProjection(before);
    const beforePlayerHull = before.playerHull;
    const beforeEnemyHull = before.enemyHull;
    const beforeVolley = before.volleyNumber;

    const timeout = reduce(before, { type: 'TIMER_EXPIRED' });
    const timeoutRecord = recordOf(timeout);
    const timeoutOutcome = recordOf(timeoutRecord.outcome ?? {});
    const timeoutLog = recordOf(timeout.actionLog.at(-1));

    expect(timeout.phase).toBe('resolvePlayer');
    expect(timeout.rng).toEqual(beforeRng);
    expect(timeout.playerHull).toBe(beforePlayerHull);
    expect(timeout.enemyHull).toBe(beforeEnemyHull);
    expect(timeoutOutcome.damageToSelf ?? 0).toBe(0);
    expect(timeout.tally).toBe(beforeTally);
    expect(masteryProjection(timeout)).toBe(beforeMastery);
    expect(mercyProjection(timeout)).toEqual(beforeMercy);
    expect(timeoutRecord.question).toBe(beforeQuestion);
    expect(timeoutLog).toMatchObject({
      actor: 'player',
      result: 'timeout',
      event: { type: 'TIMER_EXPIRED' },
    });

    const rivalTurn = reduce(timeout, { type: 'ANIMATION_DONE' });
    expect(rivalTurn.phase).toBe('rivalTurn');
    const rivalMiss = reduce(rivalTurn, {
      type: 'RIVAL_ACTION',
      turnToken: rivalTurn.turnToken,
      volley: { cannonId: 'six_pounder', correct: false, elapsedMs: 700 },
    });
    expect(rivalMiss.phase).toBe('resolveRival');
    const nextTurn = reduce(rivalMiss, { type: 'ANIMATION_DONE' });
    expect(nextTurn.phase).toBe('playerChoose');
    expect(nextTurn.volleyNumber).toBe(beforeVolley + 1);
    expect(nextTurn.playerHull).toBe(beforePlayerHull);
    expect(nextTurn.enemyHull).toBe(beforeEnemyHull);
    expect(nextTurn.tally).toBe(beforeTally);
    expect(masteryProjection(nextTurn)).toBe(beforeMastery);
    expect(mercyProjection(nextTurn)).toEqual(beforeMercy);
  });

  it('spec(A-039:AC-5) accepts the live token but keeps exact reference for an old rival token', () => {
    const timeout = reduce(reload(), { type: 'TIMER_EXPIRED' });
    const rivalTurn = reduce(timeout, { type: 'ANIMATION_DONE' });
    expect(rivalTurn.phase).toBe('rivalTurn');

    const stale = reduce(rivalTurn, {
      type: 'RIVAL_ACTION',
      turnToken: rivalTurn.turnToken - 1,
      volley: { cannonId: 'six_pounder', correct: true, elapsedMs: 1 },
    });
    expect(stale).toBe(rivalTurn);

    const accepted = reduce(rivalTurn, {
      type: 'RIVAL_ACTION',
      turnToken: rivalTurn.turnToken,
      volley: { cannonId: 'six_pounder', correct: true, elapsedMs: 1 },
    });
    expect(accepted).not.toBe(rivalTurn);
    expect(accepted.phase).toBe('resolveRival');
    expect(accepted.playerHull).toBeLessThan(rivalTurn.playerHull);
    expect(accepted.actionLog).toHaveLength(rivalTurn.actionLog.length + 1);
  });

  it.each(ISLAND_IDS)('spec(A-039:AC-6) retains normal defaults and tuned enemy hull for %s', (islandId) => {
    const state = createDuelState(config({ islandId, duelId: `normal-${islandId}` }));
    const canonical = recordOf(state);

    expect(canonical.duelId).toBe(`normal-${islandId}`);
    expect(state.islandId).toBe(islandId);
    expect(state.playerLoadout).toEqual(['swivel_gun']);
    expect(state.rivalLoadout).toEqual(['six_pounder']);
    expect(state.playerHull).toBe(PLAYER_HULL);
    expect(state.enemyHull).toBe(ENEMY_HULL_BY_ISLAND[islandId]);
    expect(state.enemyMaxHull).toBe(ENEMY_HULL_BY_ISLAND[islandId]);
    expect(canonical.playerHullFloor).toBe(0);
  });

  it('spec(A-039:AC-6) applies explicit enemy hull and prevents rival damage below the guided player floor', () => {
    const guidedConfig = config({
      duelId: 'guided-a039',
      enemyMaxHull: 28,
      playerHullFloor: PLAYER_HULL - 1,
    });
    const start = createDuelState(guidedConfig);
    const canonicalStart = recordOf(start);
    expect(canonicalStart.duelId).toBe('guided-a039');
    expect(start.enemyHull).toBe(28);
    expect(canonicalStart.playerHullFloor).toBe(PLAYER_HULL - 1);

    const timeout = reduce(reload(guidedConfig), { type: 'TIMER_EXPIRED' });
    const rivalTurn = reduce(timeout, { type: 'ANIMATION_DONE' });
    const hit = reduce(rivalTurn, {
      type: 'RIVAL_ACTION',
      turnToken: rivalTurn.turnToken,
      volley: { cannonId: 'six_pounder', correct: true, elapsedMs: 0 },
    });

    expect(hit.phase).toBe('resolveRival');
    expect(hit.playerHull).toBe(PLAYER_HULL - 1);
    expect(hit.playerHull).toBeGreaterThanOrEqual(recordOf(hit).playerHullFloor as number);
  });
});
