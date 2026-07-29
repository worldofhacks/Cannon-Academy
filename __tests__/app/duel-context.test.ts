/**
 * A-029 — island-aware duel context.
 *
 * The chart persists `captain.currentIsland`, but the live duel must honor per-island hull tuning
 * and refuse fogged or missing placement. Pure resolution lives in `src/services/duelContext.ts`;
 * `app/duel.tsx` consumes it and never hardcodes Port Sumwich as a silent fallback.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { cannons, getCannon, getIsland, islands } from '@content/index';
import type { GradeBand, IslandId } from '@content/schemas';
import { ENEMY_HULL_BY_ISLAND } from '@engine/tuning';

import { emptyCaptain, type Captain } from '../../src/stores/player';
import {
  duelReducer,
  initialDuelState,
  type DuelState,
} from '../../src/stores/duel';

const REPO_ROOT = join(import.meta.dirname, '../..');
const DUEL_PATH = 'app/duel.tsx';
const DUEL_CONTEXT_MODULE = '../../src/services/duelContext.ts';
const DUEL_STORE_MODULE = '../../src/stores/duel.ts';

type ValidDuelContext = {
  readonly ok: true;
  readonly islandId: IslandId;
  readonly islandName: string;
  readonly enemyHull: number;
};

type InvalidDuelContext = {
  readonly ok: false;
  readonly reason: 'missing' | 'unknown' | 'fogged';
};

type DuelContext = ValidDuelContext | InvalidDuelContext;

type DuelContextApi = {
  readonly resolveDuelContext: (captain: Captain) => DuelContext;
};

type DuelStoreApi = {
  readonly initialDuelStateWithContext?: (context: ValidDuelContext, seed: number) => DuelState;
};

const RELIABLE_STARTER = getCannon('swivel_gun');

function bandForIsland(islandId: IslandId): GradeBand {
  const island = getIsland(islandId);
  const needed = cannons
    .filter((cannon) => island.rangeSkills.includes(cannon.skill))
    .reduce((max, cannon) => Math.max(max, cannon.minGrade), 0);
  if (needed >= 4) return 'g4_5';
  if (needed >= 2) return 'g2_3';
  return 'k_1';
}

function captain(over: Partial<Captain> = {}): Captain {
  const currentIsland = over.currentIsland ?? 'port_sumwich';
  let gradeBand = over.gradeBand;
  if (gradeBand === undefined) {
    if (currentIsland === null || !Object.hasOwn(ENEMY_HULL_BY_ISLAND, currentIsland)) {
      gradeBand = 'g2_3';
    } else {
      gradeBand = bandForIsland(currentIsland);
    }
  }
  return {
    ...emptyCaptain(),
    gradeBand,
    unlockedIslands: ['port_sumwich', 'isla_products', 'quotient_cove', 'fraction_reef', 'grandline'],
    equippedCannons: ['swivel_gun', 'six_pounder', 'culverin'],
    ownedCannons: ['swivel_gun', 'six_pounder', 'culverin'],
    currentIsland,
    hasCompletedOnboarding: true,
    ...over,
  };
}

async function loadDuelContext(): Promise<DuelContextApi> {
  let loaded: unknown;
  try {
    loaded = await import(/* @vite-ignore */ DUEL_CONTEXT_MODULE);
  } catch {
    loaded = undefined;
  }
  expect(loaded, 'A-029 is RED: src/services/duelContext.ts must export resolveDuelContext').toBeDefined();
  const candidate = loaded as { readonly resolveDuelContext?: unknown };
  expect(candidate.resolveDuelContext, 'resolveDuelContext must be a function').toBeTypeOf('function');
  return candidate as DuelContextApi;
}

async function loadDuelStore(): Promise<DuelStoreApi> {
  const loaded = (await import(DUEL_STORE_MODULE)) as DuelStoreApi;
  expect(
    loaded.initialDuelStateWithContext,
    'src/stores/duel.ts must export initialDuelStateWithContext',
  ).toBeTypeOf('function');
  return loaded;
}

function sourceFile(relativePath: string): ts.SourceFile {
  return ts.createSourceFile(
    relativePath,
    readFileSync(join(REPO_ROOT, relativePath), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function descendants(root: ts.Node): readonly ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

function namedFunction(
  file: ts.SourceFile,
  name: string,
): ts.FunctionDeclaration & { readonly body: ts.Block } {
  const match = descendants(file).find(
    (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  expect(match?.body, `${file.fileName}: expected function ${name}`).toBeDefined();
  return match as ts.FunctionDeclaration & { readonly body: ts.Block };
}

function withoutIslandHull(state: DuelState): unknown {
  const { rivalHull, rivalMax, islandId, islandName, ...rest } = state as DuelState & {
    readonly islandId?: IslandId;
    readonly islandName?: string;
  };
  return { ...rest, rng: null, duelId: null };
}

function askedOnce(state: DuelState): DuelState {
  const armed = duelReducer(state, { type: 'PICK_CANNON', cannon: RELIABLE_STARTER });
  return duelReducer(armed, {
    type: 'ANSWER',
    value: armed.question!.answer,
    elapsedMs: 200,
  });
}

describe('A-029 island-aware duel context', () => {
  it('spec(A-029:AC-1) each catalog island initializes rival hull to ENEMY_HULL_BY_ISLAND', async () => {
    const { resolveDuelContext } = await loadDuelContext();
    const { initialDuelStateWithContext } = await loadDuelStore();

    for (const island of islands) {
      const ctx = resolveDuelContext(
        captain({ currentIsland: island.id, unlockedIslands: [island.id] }),
      );
      expect(ctx.ok, `${island.id} must resolve`).toBe(true);
      if (!ctx.ok) continue;

      const state = initialDuelStateWithContext!(ctx, 2900 + island.order);
      const expected = ENEMY_HULL_BY_ISLAND[island.id];
      expect(state.rivalHull).toBe(expected);
      expect(state.rivalMax).toBe(expected);
      expect(state.islandId).toBe(island.id);
    }
  });

  it('spec(A-029:AC-2) same seed and actions match everywhere except tuned hull fields', async () => {
    const { resolveDuelContext } = await loadDuelContext();
    const { initialDuelStateWithContext } = await loadDuelStore();
    const seed = 9029;

    const first = resolveDuelContext(captain({ currentIsland: 'port_sumwich' }));
    const fifth = resolveDuelContext(captain({ currentIsland: 'grandline' }));
    expect(first.ok && fifth.ok).toBe(true);
    if (!first.ok || !fifth.ok) return;

    const a = askedOnce(initialDuelStateWithContext!(first, seed));
    const b = askedOnce(initialDuelStateWithContext!(fifth, seed));

    expect(withoutIslandHull(a)).toEqual(withoutIslandHull(b));
    expect(a.rivalHull).toBe(ENEMY_HULL_BY_ISLAND.port_sumwich);
    expect(b.rivalHull).toBe(ENEMY_HULL_BY_ISLAND.grandline);
    expect(a.rivalHull).not.toBe(b.rivalHull);
  });

  it('spec(A-029:AC-3) missing, unknown, and fogged captains fail context resolution', async () => {
    const { resolveDuelContext } = await loadDuelContext();

    expect(resolveDuelContext(captain({ currentIsland: null }))).toEqual({
      ok: false,
      reason: 'missing',
    });

    expect(
      resolveDuelContext(
        captain({ currentIsland: 'not_an_island' as IslandId, unlockedIslands: ['port_sumwich'] }),
      ),
    ).toEqual({ ok: false, reason: 'unknown' });

    expect(
      resolveDuelContext(
        captain({ currentIsland: 'grandline', unlockedIslands: ['port_sumwich', 'isla_products'] }),
      ),
    ).toEqual({ ok: false, reason: 'fogged' });
  });

  it('spec(A-029:AC-3) duel.tsx redirects to the chart and never starts a Port Sumwich fallback duel', () => {
    const file = sourceFile(DUEL_PATH);
    const body = namedFunction(file, 'DuelBody').body.getText(file);

    expect(body).toMatch(/resolveDuelContext/);
    expect(body).toMatch(/Redirect[^]*?\/chart/s);
    expect(body).not.toMatch(/initialDuelState\s*\(\s*freshSeed\s*\(\s*\)\s*\)/);
    expect(body).not.toMatch(/port_sumwich/);
    expect(body).not.toMatch(/ENEMY_HULL_BY_ISLAND\s*\[\s*['"]port_sumwich['"]\s*\]/);
  });

  it('spec(A-029:AC-4) valid context exposes the current island display name', async () => {
    const { resolveDuelContext } = await loadDuelContext();
    const ctx = resolveDuelContext(captain({ currentIsland: 'fraction_reef' }));
    expect(ctx.ok).toBe(true);
    if (!ctx.ok) return;
    expect(ctx.islandName).toBe(getIsland('fraction_reef').displayName);
    expect(ctx.islandName).not.toBe(getIsland('port_sumwich').displayName);
  });

  it('spec(A-029:AC-4) duel.tsx HUD and intro copy name the current island', () => {
    const file = sourceFile(DUEL_PATH);
    const body = namedFunction(file, 'DuelBody').body.getText(file);

    // Island name stays in the turn bar (intro / whose-turn copy). A-031 owns the rival
    // HullCard label via enemy presentation — not a generic "Rival" and not the island name.
    expect(body).toMatch(/islandName/);
    expect(body).toMatch(/HullCard[^]*rival\.displayName/s);
    expect(body).not.toMatch(/name="Rival"/);
    expect(body).toMatch(/turnLabel\s*\([^)]*islandName/);
  });

  it('spec(A-029:AC-5) RESET keeps island context and mints a fresh duel id and seed', async () => {
    const { resolveDuelContext } = await loadDuelContext();
    const { initialDuelStateWithContext } = await loadDuelStore();
    const ctx = resolveDuelContext(captain({ currentIsland: 'quotient_cove' }));
    expect(ctx.ok).toBe(true);
    if (!ctx.ok) return;

    const started = initialDuelStateWithContext!(ctx, 5029);
    const mid = askedOnce(started);
    const again = duelReducer(mid, { type: 'RESET' });

    expect(again.islandId).toBe('quotient_cove');
    expect(again.islandName).toBe(getIsland('quotient_cove').displayName);
    expect(again.rivalHull).toBe(ENEMY_HULL_BY_ISLAND.quotient_cove);
    expect(again.rivalMax).toBe(ENEMY_HULL_BY_ISLAND.quotient_cove);
    expect(again.duelId).not.toBe(started.duelId);
    expect(again.rng).not.toEqual(started.rng);
    expect(again.phase).toBe('select');
  });

  it('spec(A-029:AC-1) legacy initialDuelState(seed) stays backward-compatible for frozen A-016 tests', () => {
    const legacy = initialDuelState(1616);
    expect(legacy.rivalHull).toBe(ENEMY_HULL_BY_ISLAND.port_sumwich);
    expect(legacy.rivalMax).toBe(ENEMY_HULL_BY_ISLAND.port_sumwich);
  });
});
