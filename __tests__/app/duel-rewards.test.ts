import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import { templateSchema, type Template } from '@content/schemas';
import { duelReducer } from '@engine/duel/reducer';
import { createDuelState, type DuelConfig, type DuelEvent, type DuelState } from '@engine/duel/types';

const REWARDS_PATH = '../../src/services/' + 'duelRewards';

type RewardProjection = {
  readonly won: boolean;
  readonly coins: number;
  readonly skillTally: DuelState['tally']['bySkill'];
  readonly rankInput: { readonly won: boolean };
};

type RewardsApi = {
  readonly projectDuelRewards?: (terminal: DuelState) => RewardProjection;
  readonly applyDuelOutcome?: (...args: unknown[]) => unknown;
};

const TEMPLATE: Template = templateSchema.parse({
  id: 'a039_reward_add',
  skill: 'add_within_10',
  text: '{a} + {b} = ?',
  params: { a: [1, 3], b: [1, 3] },
  answerExpr: 'a + b',
  distractors: ['a + b + 1', 'a + b + 2', 'a + b + 3'],
});

function config(won: boolean): DuelConfig {
  return {
    seed: won ? 3_907 : 3_908,
    duelId: won ? 'a039-real-victory' : 'a039-real-defeat',
    islandId: 'port_sumwich',
    playerLoadout: ['swivel_gun'],
    rivalLoadout: ['six_pounder'],
    templatesBySkill: { add_within_10: [TEMPLATE] },
  } as DuelConfig;
}

function reduce(state: DuelState, event: Record<string, unknown>): DuelState {
  return duelReducer(state, event as DuelEvent);
}

function playTerminal(won: boolean): Extract<DuelState, { phase: 'victory' | 'defeat' }> {
  let state = createDuelState(config(won));
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
  throw new Error(`terminal reward fixture did not finish; phase=${state.phase}`);
}

async function rewardApi(): Promise<RewardsApi> {
  return (await import(REWARDS_PATH)) as RewardsApi;
}

function projector(api: RewardsApi): NonNullable<RewardsApi['projectDuelRewards']> {
  expect(api.projectDuelRewards, 'duelRewards must export projectDuelRewards').toBeTypeOf('function');
  if (api.projectDuelRewards === undefined) throw new Error('projectDuelRewards missing');
  return api.projectDuelRewards;
}

describe('A-039 canonical reward projection', () => {
  it.each([
    ['victory', true],
    ['defeat', false],
  ] as const)(
    'spec(A-039:AC-7) projects an actual engine %s terminal without repricing',
    async (_label, won) => {
      const api = await rewardApi();
      const project = projector(api);
      const terminal = playTerminal(won);
      const result = terminal.result as typeof terminal.result & { readonly coins: number };
      const projected = project(terminal);

      expect(terminal.phase).toBe(won ? 'victory' : 'defeat');
      expect(projected.won).toBe(result.won);
      expect(projected.coins).toBe(result.coins);
      expect(projected.skillTally).toBe(result.tally.bySkill);
      expect(projected.rankInput).toEqual({ won: result.won });
    },
  );

  it('spec(A-039:AC-7) dod(A-039:5) repeated observation mutates neither terminal nor settlement ledger', async () => {
    const api = await rewardApi();
    const project = projector(api);
    const terminal = playTerminal(true);
    const terminalReference = terminal;
    const before = JSON.stringify(terminal);
    const applyHolder = api as {
      applyDuelOutcome?: (...args: unknown[]) => unknown;
    };
    const settlementSpy =
      applyHolder.applyDuelOutcome === undefined ? null : vi.spyOn(applyHolder, 'applyDuelOutcome');

    const first = project(terminal);
    const second = project(terminal);

    expect(second).toEqual(first);
    expect(terminal).toBe(terminalReference);
    expect(JSON.stringify(terminal)).toBe(before);
    expect(settlementSpy).not.toHaveBeenCalled();
  });

  it('spec(A-039:AC-7) keeps reward projection free of economy and ledger ownership', async () => {
    const source = await readFile(new URL('../../src/services/duelRewards.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from\s+['"]@engine\/economy['"]/);
    const projectionBody = source.match(
      /(?:export\s+)?function\s+projectDuelRewards[\s\S]*?(?=\n(?:export\s+)?function|\nexport\s+(?:interface|type)|\z)/,
    )?.[0];
    expect(projectionBody, 'duelRewards must declare projectDuelRewards').toBeDefined();
    if (projectionBody === undefined) throw new Error('projectDuelRewards declaration missing');
    expect(projectionBody).not.toMatch(/settledDuels|ledgerFor|addCoins|recordDuelAnswers|recordDuelResult/);
  });
});
