import { describe, expect, it } from 'vitest';

import { duelReducer } from '@engine/duel/reducer';
import { createDuelState } from '@engine/duel/types';

const templates = {
  add_within_10: [
    {
      id: 'a039_add',
      skill: 'add_within_10',
      text: '{a} + {b} = ?',
      params: { a: [1, 2], b: [1, 2] },
      answerExpr: 'a + b',
      distractors: ['a + b + 1', 'a + b + 2', 'a + b + 3'],
    },
  ],
} as const;

function config(overrides: Record<string, unknown> = {}) {
  return {
    seed: 39,
    islandId: 'port_sumwich',
    playerLoadout: ['swivel_gun'],
    rivalLoadout: ['six_pounder'],
    templatesBySkill: templates,
    ...overrides,
  } as never;
}

function reload() {
  let state = duelReducer(createDuelState(config()), { type: 'ANIMATION_DONE' });
  state = duelReducer(state, { type: 'CANNON_SELECTED', cannonId: 'swivel_gun' });
  if (state.phase !== 'reload') throw new Error('A-039 fixture did not reach reload');
  return state;
}

describe('A-039 canonical engine rules', () => {
  it('spec(A-039:AC-2) dod(A-039:4) records a timeout distinctly while preserving all answer, skill, mastery, hull, and mercy inputs', () => {
    const before = reload();
    const after = duelReducer(before, { type: 'TIMER_EXPIRED' });

    expect(after.phase).toBe('resolvePlayer');
    expect(after.playerHull).toBe(before.playerHull);
    expect(after.enemyHull).toBe(before.enemyHull);
    expect(after.tally).toEqual(before.tally);
    expect(after.actionLog).toHaveLength(before.actionLog.length + 1);
    expect((after.actionLog.at(-1) as unknown as Record<string, unknown>).result).toBe('timeout');
    expect((after.actionLog.at(-1) as unknown as Record<string, unknown>).actor).toBe('player');

    const rivalTurn = duelReducer(after, { type: 'ANIMATION_DONE' });
    expect(rivalTurn.phase).toBe('rivalTurn');
  });

  it('spec(A-039:AC-4) replays a timeout and tokened rival event to an identical terminal projection', () => {
    const events: readonly Record<string, unknown>[] = [
      { type: 'ANIMATION_DONE' },
      { type: 'CANNON_SELECTED', cannonId: 'swivel_gun' },
      { type: 'TIMER_EXPIRED' },
      { type: 'ANIMATION_DONE' },
      {
        type: 'RIVAL_ACTION',
        turnToken: 2,
        volley: { cannonId: 'six_pounder', correct: false, elapsedMs: 1000 },
      },
    ];
    const play = () => events.reduce((state, event) => duelReducer(state, event as never), createDuelState(config()));

    expect(play()).toEqual(play());
    expect((play().actionLog[0] as unknown as Record<string, unknown>).result).toBe('timeout');
  });

  it('spec(A-039:AC-5) retains the exact state reference for an old rival turn token', () => {
    const afterTimeout = duelReducer(reload(), { type: 'TIMER_EXPIRED' });
    const rivalTurn = duelReducer(afterTimeout, { type: 'ANIMATION_DONE' });
    expect(rivalTurn.phase).toBe('rivalTurn');

    const stale = duelReducer(rivalTurn, {
      type: 'RIVAL_ACTION',
      turnToken: (rivalTurn as unknown as { turnToken: number }).turnToken - 1,
      volley: { cannonId: 'six_pounder', correct: true, elapsedMs: 1 },
    } as never);
    expect(stale).toBe(rivalTurn);
  });

  it('spec(A-039:AC-6) retains explicit duel identity, both loadouts, island tuning, guided hull floor, and normal defaults', () => {
    const guided = createDuelState(
      config({ duelId: 'guided-a039', enemyMaxHull: 9, playerHullFloor: 17, playerHull: 17 }),
    ) as unknown as Record<string, unknown>;
    const normal = createDuelState(config()) as unknown as Record<string, unknown>;

    expect(guided.duelId).toBe('guided-a039');
    expect(guided.playerLoadout).toEqual(['swivel_gun']);
    expect(guided.rivalLoadout).toEqual(['six_pounder']);
    expect(guided.enemyHull).toBe(9);
    expect(guided.playerHullFloor).toBe(17);
    expect(normal.playerHullFloor).toBe(0);
    expect(normal.enemyHull).not.toBe(9);
  });
});
