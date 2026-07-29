import { describe, expect, it } from 'vitest';

const rewardsPath = '../../src/services/' + 'duelRewards';
type RewardsApi = Record<string, (...args: unknown[]) => unknown>;

async function rewards(): Promise<RewardsApi> {
  return (await import(rewardsPath)) as RewardsApi;
}

describe('A-039 canonical reward projection', () => {
  it('spec(A-039:AC-7) reads coins, win/loss, per-skill tallies, and rank inputs from the terminal core state without repricing', async () => {
    const api = await rewards();
    const projectDuelRewards = api.projectDuelRewards;
    expect(projectDuelRewards).toBeTypeOf('function');
    if (projectDuelRewards === undefined) throw new Error('projectDuelRewards missing');
    const terminal = {
      phase: 'victory',
      result: { won: true, coins: 42, tally: { bySkill: { add_within_10: { correct: 2, attempts: 3 } } } },
      coins: 42,
    };
    const projected = projectDuelRewards(terminal) as Record<string, unknown>;

    expect(projected).toMatchObject({ won: true, coins: 42, skillTally: terminal.result.tally.bySkill });
    expect(projected.rankInput).toEqual(terminal.result);
  });

  it('spec(A-039:AC-7) dod(A-039:5) is an idempotent observation until the durable receipt owns settlement', async () => {
    const api = await rewards();
    const terminal = { phase: 'defeat', result: { won: false, coins: 0, tally: { bySkill: {} } }, coins: 0 };
    const projectDuelRewards = api.projectDuelRewards;
    expect(projectDuelRewards).toBeTypeOf('function');
    if (projectDuelRewards === undefined) throw new Error('projectDuelRewards missing');
    expect(projectDuelRewards(terminal)).toEqual(projectDuelRewards(terminal));
  });
});
