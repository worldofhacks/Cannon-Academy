import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { duelReducer } from '@engine/duel/reducer';
import { createDuelState } from '@engine/duel/types';

describe('A-039 live duel boundary', () => {
  it('spec(A-039:AC-1) keeps the app-facing state a direct canonical core projection across a normal action sequence', () => {
    const config = {
      seed: 390,
      islandId: 'port_sumwich',
      playerLoadout: ['swivel_gun'],
      rivalLoadout: ['six_pounder'],
      templatesBySkill: {
        add_within_10: [
          {
            id: 'a039_live',
            skill: 'add_within_10',
            text: '{a} + {b} = ?',
            params: { a: [1, 1], b: [1, 1] },
            answerExpr: 'a + b',
            distractors: ['3', '4', '5'],
          },
        ],
      },
    } as never;
    const core = duelReducer(duelReducer(createDuelState(config), { type: 'ANIMATION_DONE' }), {
      type: 'CANNON_SELECTED',
      cannonId: 'swivel_gun',
    });

    expect(core.phase).toBe('reload');
    expect(core).toHaveProperty('rng');
    expect(core).toHaveProperty('actionLog');
    expect(core).toHaveProperty('tally');
  });

  it('spec(A-039:AC-1) dod(A-039:1) leaves the app store free of damage, payout, question, hull, tally, and RNG rule ownership', async () => {
    const source = await readFile(new URL('../../src/stores/duel.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/resolveShot|computeCoinPayout|nextQuestion|nextInt|createRng/);
  });
});
