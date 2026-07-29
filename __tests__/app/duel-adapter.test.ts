import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const adapterPath = '../../src/services/' + 'duelAdapter';
type AdapterApi = Record<string, (...args: unknown[]) => unknown>;

async function adapter(): Promise<AdapterApi | null> {
  try {
    return (await import(adapterPath)) as AdapterApi;
  } catch {
    return null;
  }
}

async function requireAdapter(): Promise<AdapterApi> {
  const found = await adapter();
  expect(found, 'A-039 requires src/services/duelAdapter.ts').not.toBeNull();
  if (found === null) throw new Error('canonical duel adapter missing');
  return found;
}

describe('A-039 duel presentation adapter', () => {
  it('spec(A-039:AC-1) dod(A-039:2) dod(A-039:3) projects canonical state rather than importing or recalculating gameplay rules', async () => {
    await requireAdapter();
    const source = await readFile(new URL('../../src/services/duelAdapter.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/resolveShot|computeCoinPayout|generateQuestion|Math\.random/);
    expect(source).toMatch(/engine\/duel/);
  });

  it('spec(A-039:AC-3) maps every resolved core outcome to ordered beats exactly once, even when animation ticks duplicate', async () => {
    const projectPresentation = (await requireAdapter()).projectPresentation;
    expect(projectPresentation).toBeTypeOf('function');
    if (projectPresentation === undefined) throw new Error('projectPresentation missing');
    const terminal = { phase: 'victory', turnToken: 8, result: { won: true }, actionLog: [] };
    const first = projectPresentation(terminal, { type: 'ANIMATION_DONE' } as never) as Record<string, unknown>;
    const duplicate = projectPresentation(first, { type: 'ANIMATION_DONE' } as never);

    expect(first.beats).toEqual(['resolvePlayer', 'victory']);
    expect(duplicate).toBe(first);
  });

  it('spec(A-039:AC-5) drops callbacks after reset or unmount without any visible update', async () => {
    const createDuelAdapter = (await requireAdapter()).createDuelAdapter;
    expect(createDuelAdapter).toBeTypeOf('function');
    if (createDuelAdapter === undefined) throw new Error('createDuelAdapter missing');
    const instance = createDuelAdapter({ seed: 39 } as never) as Record<string, (...args: never[]) => unknown>;
    const getState = instance.getState;
    const dispose = instance.dispose;
    const dispatch = instance.dispatch;
    expect(getState).toBeTypeOf('function');
    expect(dispose).toBeTypeOf('function');
    expect(dispatch).toBeTypeOf('function');
    if (getState === undefined || dispose === undefined || dispatch === undefined) throw new Error('adapter lifecycle missing');
    const before = getState();
    dispose();
    const after = dispatch({ type: 'RIVAL_ACTION', turnToken: 1 } as never);
    expect(after).toBe(before);
  });

  it('spec(A-039:AC-4) gives replay the same core-derived presentation projection', async () => {
    const replayDuelPresentation = (await requireAdapter()).replayDuelPresentation;
    expect(replayDuelPresentation).toBeTypeOf('function');
    if (replayDuelPresentation === undefined) throw new Error('replayDuelPresentation missing');
    const log = [{ type: 'TIMER_EXPIRED' }, { type: 'RIVAL_ACTION', turnToken: 2 }];
    expect(replayDuelPresentation({ seed: 39, events: log } as never)).toEqual(
      replayDuelPresentation({ seed: 39, events: log } as never),
    );
  });
});
