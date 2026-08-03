/**
 * A-030 — real rival bridge: seeded bot, mercy, async turn tokens, island loadouts.
 *
 * RE-BASELINED under owner ruling **D-14** (2026-08-02, `tickets/app/OWNER-RULINGS.md`, applied
 * by A-070): a rival's island loadout derives from the island's cell FOR THE CAPTAIN'S BAND
 * (`islandCurriculumFor`) — the shared `rangeSkills` no longer exists, so the loadout oracle and
 * the AC-7 sweep read cells. The bridge mechanics (mercy, tokens, determinism) are unchanged.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { cannons, getCannon, islandCurriculumFor, islands } from '@content/index';
import type { CannonId, GradeBand, IslandId } from '@content/schemas';
import { GRADE_BANDS } from '@content/schemas';
import { duelReducer as coreDuelReducer } from '@engine/duel/reducer';
import {
  createDuelState,
  toRivalView,
  type DuelConfig,
  type DuelEvent,
  type DuelState,
} from '@engine/duel/types';
import { createBotOpponent } from '@engine/opponents/bot';
import {
  emptyMercyState,
  recordDuelResult,
  targetBotAccuracy,
} from '@engine/opponents/mercy';
import { maxGradeForBand } from '@engine/placement';
import { createRng } from '@engine/rng';
import { BOT_ACCURACY_BAND_BY_GRADE, MERCY_FORCED_MISFIRES } from '@engine/tuning';

import { resolveDuelContext } from '../../src/services/duelContext';
import { TEMPLATE_POOLS } from '../../src/services/templatePools';
import { emptyCaptain, type Captain } from '../../src/stores/player';
import {
  duelReducer,
  initialDuelStateWithContext,
  type DuelState as StoreDuelState,
} from '../../src/stores/duel';

const REPO_ROOT = join(import.meta.dirname, '../..');
const DUEL_PATH = 'app/duel.tsx';
const DUEL_STORE_PATH = 'src/stores/duel.ts';
const RIVAL_LOADOUT_MODULE = '../../src/services/rivalLoadout.ts';
const RIVAL_DRIVER_MODULE = '../../src/services/rivalDriver.ts';

const MAX_GRADE_BY_BAND: Readonly<Record<GradeBand, number>> = { k_1: 1, g2_3: 3, g4_5: 5 };

type RivalLoadoutApi = {
  readonly deriveRivalLoadout: (captain: Captain, islandId: IslandId) => readonly CannonId[];
};

type RivalDriverApi = {
  readonly createRivalBot: (input: {
    readonly captain: Captain;
    readonly loadout: readonly CannonId[];
    readonly rng: ReturnType<typeof createRng>;
  }) => ReturnType<typeof createBotOpponent>;
  readonly resolveRivalVolley: (input: {
    readonly opponent: ReturnType<typeof createBotOpponent>;
    readonly core: Extract<DuelState, { phase: 'rivalTurn' }>;
  }) => Promise<{ readonly cannonId: CannonId; readonly correct: boolean; readonly elapsedMs: number }>;
  readonly planRivalVolleySync: (input: {
    readonly captain: Captain;
    readonly loadout: readonly CannonId[];
    readonly core: Extract<DuelState, { phase: 'rivalTurn' }>;
  }) => { readonly cannonId: CannonId; readonly correct: boolean; readonly elapsedMs: number };
  readonly driveRivalTurn: (input: {
    readonly turnToken: number;
    readonly expectedTurnToken: number;
    readonly alive: () => boolean;
    readonly resolve: () => Promise<{ readonly cannonId: CannonId; readonly correct: boolean; readonly elapsedMs: number }>;
    readonly onResult: (result: {
      readonly turnToken: number;
      readonly volley: { readonly cannonId: CannonId; readonly correct: boolean; readonly elapsedMs: number };
    }) => void;
  }) => () => void;
};

function captain(over: Partial<Captain> = {}): Captain {
  return {
    ...emptyCaptain(),
    gradeBand: 'g2_3',
    unlockedIslands: islands.map((i) => i.id),
    equippedCannons: ['swivel_gun', 'six_pounder', 'culverin'],
    ownedCannons: ['swivel_gun', 'six_pounder', 'culverin'],
    currentIsland: 'port_sumwich',
    hasCompletedOnboarding: true,
    ...over,
  };
}

async function loadRivalLoadout(): Promise<RivalLoadoutApi> {
  const loaded = await import(RIVAL_LOADOUT_MODULE).catch(() => undefined);
  expect(loaded, 'A-030 requires src/services/rivalLoadout.ts').toBeDefined();
  expect(loaded!.deriveRivalLoadout, 'deriveRivalLoadout must be exported').toBeTypeOf('function');
  return loaded as RivalLoadoutApi;
}

async function loadRivalDriver(): Promise<RivalDriverApi> {
  const loaded = await import(RIVAL_DRIVER_MODULE).catch(() => undefined);
  expect(loaded, 'A-030 requires src/services/rivalDriver.ts').toBeDefined();
  for (const name of [
    'createRivalBot',
    'resolveRivalVolley',
    'planRivalVolleySync',
    'driveRivalTurn',
  ] as const) {
    expect(loaded![name], `${name} must be exported`).toBeTypeOf('function');
  }
  return loaded as RivalDriverApi;
}

function duelConfigForCaptain(islandId: IslandId, seed: number, cap: Captain): DuelConfig {
  const loadout = expectedIslandLoadout(islandId, cap.gradeBand ?? 'g2_3');
  return {
    seed,
    duelId: `a030-${seed.toString(36)}`,
    islandId,
    playerLoadout: ['swivel_gun'],
    rivalLoadout: loadout,
    templatesBySkill: TEMPLATE_POOLS,
  };
}

function expectedIslandLoadout(islandId: IslandId, band: GradeBand): readonly CannonId[] {
  // The island's cell FOR THIS BAND (D-14 — `islandCurriculumFor`), never a shared list.
  const skills = new Set(islandCurriculumFor(islandId, band).skills);
  const maxGrade = maxGradeForBand(band);
  return cannons
    .filter((c) => skills.has(c.skill) && c.minGrade <= maxGrade)
    .map((c) => c.id);
}

function atWatchAfterTimeout(cap: Captain, seed = 3030): StoreDuelState {
  const ctx = resolveDuelContext(cap);
  expect(ctx.ok).toBe(true);
  if (!ctx.ok) throw new Error('invalid duel context');

  let state = initialDuelStateWithContext(ctx, seed, cap);
  state = duelReducer(state, { type: 'PICK_CANNON', cannon: getCannon('swivel_gun') });
  state = duelReducer(state, { type: 'TIMEOUT' });
  for (let step = 0; step < 8 && state.phase !== 'watch'; step += 1) {
    state = duelReducer(state, { type: 'ADVANCE' });
  }
  expect(state.phase).toBe('watch');
  return state;
}

function reachRivalTurnCore(cap: Captain, seed = 3031): Extract<DuelState, { phase: 'rivalTurn' }> {
  const ctx = resolveDuelContext(cap);
  if (!ctx.ok) throw new Error('invalid context');
  let core = coreDuelReducer(createDuelState(duelConfigForCaptain(ctx.islandId, seed, cap)), {
    type: 'ANIMATION_DONE',
  });
  core = coreDuelReducer(core, { type: 'CANNON_SELECTED', cannonId: 'swivel_gun' });
  core = coreDuelReducer(core, { type: 'TIMER_EXPIRED' });
  core = coreDuelReducer(core, { type: 'ANIMATION_DONE' });
  if (core.phase !== 'rivalTurn') throw new Error(`expected rivalTurn, got ${core.phase}`);
  return core;
}

describe('A-030 opponent bridge', () => {
  it('spec(A-030:AC-1) rival bot accuracy and forced misfires follow mercy, band, and tuning', async () => {
    const { deriveRivalLoadout } = await loadRivalLoadout();
    const { createRivalBot } = await loadRivalDriver();
    const cap = captain({
      mercyState: {
        recentPlayerCorrect: [true, true, true, true, true, true, true, true, true, true],
        consecutiveLosses: 0,
        forcedMisfiresRemaining: MERCY_FORCED_MISFIRES,
      },
    });
    const loadout = deriveRivalLoadout(cap, 'port_sumwich');
    const band = BOT_ACCURACY_BAND_BY_GRADE.g2_3;
    const expectedAccuracy = targetBotAccuracy(cap.mercyState, band);

    const bot = createRivalBot({ captain: cap, loadout, rng: createRng(3032) });
    const answers: boolean[] = [];
    for (let i = 0; i < 4; i += 1) {
      await bot.chooseAction(toRivalView(reachRivalTurnCore(cap, 3033)));
      const answer = await bot.produceAnswer({
        templateId: 'fixture',
        skill: 'add_within_10',
        text: '1 + 1 = ?',
        params: { a: 1, b: 1 },
        choices: [{ value: 2, label: '2' }],
        correctIndex: 0,
        isWordProblem: false,
        readAloud: true,
      });
      answers.push(answer.correct);
    }

    expect(expectedAccuracy).toBeGreaterThanOrEqual(band.min);
    expect(expectedAccuracy).toBeLessThanOrEqual(band.max);
    expect(answers.slice(0, MERCY_FORCED_MISFIRES)).toEqual(Array(MERCY_FORCED_MISFIRES).fill(false));
    expect(answers[MERCY_FORCED_MISFIRES]).toBe(true);
  });

  it('spec(A-030:AC-2) same seed, loadout, and mercy produce replayable rival volleys', async () => {
    const { deriveRivalLoadout } = await loadRivalLoadout();
    const { createRivalBot, resolveRivalVolley, planRivalVolleySync } = await loadRivalDriver();
    const cap = captain();
    const ctx = resolveDuelContext(cap);
    expect(ctx.ok).toBe(true);
    if (!ctx.ok) return;
    const loadout = deriveRivalLoadout(cap, ctx.islandId);
    const core = reachRivalTurnCore(cap, 3040);

    const botA = createRivalBot({ captain: cap, loadout, rng: core.rng });
    const botB = createRivalBot({ captain: cap, loadout, rng: core.rng });
    const volleyA = await resolveRivalVolley({ opponent: botA, core });
    const volleyB = await resolveRivalVolley({ opponent: botB, core });
    const volleySync = planRivalVolleySync({ captain: cap, loadout, core });

    expect(volleyB).toEqual(volleyA);
    expect(volleySync).toEqual(volleyA);

    const after = coreDuelReducer(core, {
      type: 'RIVAL_ACTION',
      turnToken: core.turnToken,
      volley: volleyA,
    } as DuelEvent);
    expect(after.phase).toBe('resolveRival');
    if (after.phase !== 'resolveRival') return;
    expect(after.damageToPlayer).toBeGreaterThanOrEqual(0);
    if (volleyA.correct) {
      expect(after.damageToPlayer).toBeGreaterThan(0);
    } else {
      expect(after.damageToPlayer).toBe(0);
    }
  });

  it('spec(A-030:AC-3) stale rival turn tokens produce no store transition or damage', async () => {
    await loadRivalDriver();
    const cap = captain();
    const ctx = resolveDuelContext(cap);
    expect(ctx.ok).toBe(true);
    if (!ctx.ok) return;
    let state = initialDuelStateWithContext(ctx, 3050, cap);
    state = atWatchAfterTimeout(cap, 3050);
    expect(state.phase).toBe('watch');

    const before = state;
    const stale = duelReducer(state, {
      type: 'RIVAL_RESULT',
      turnToken: before.turnToken - 1,
      volley: { cannonId: 'six_pounder', correct: true, elapsedMs: 100 },
    });
    expect(stale).toBe(before);
    expect(stale.playerHull).toBe(before.playerHull);
    expect(stale.rivalDamage).toBe(0);
  });

  it('spec(A-030:AC-4) two consecutive losses arm forced misfires; a win resets the loss streak', async () => {
    const { createRivalBot } = await loadRivalDriver();
    const { deriveRivalLoadout } = await loadRivalLoadout();
    let mercy = emptyMercyState;
    mercy = recordDuelResult(mercy, false);
    expect(mercy.consecutiveLosses).toBe(1);
    expect(mercy.forcedMisfiresRemaining).toBe(0);

    mercy = recordDuelResult(mercy, false);
    expect(mercy.consecutiveLosses).toBe(0);
    expect(mercy.forcedMisfiresRemaining).toBe(MERCY_FORCED_MISFIRES);

    const armedCap = captain({ mercyState: mercy });
    const loadout = deriveRivalLoadout(armedCap, 'port_sumwich');
    const core = reachRivalTurnCore(armedCap, 3060);
    const bot = createRivalBot({ captain: armedCap, loadout, rng: core.rng });
    await bot.chooseAction(toRivalView(core));
    const first = await bot.produceAnswer({
      templateId: 'fixture',
      skill: 'add_within_10',
      text: '1 + 1 = ?',
      params: { a: 1, b: 1 },
      choices: [{ value: 2, label: '2' }],
      correctIndex: 0,
      isWordProblem: false,
      readAloud: true,
    });
    expect(first.correct).toBe(false);

    mercy = recordDuelResult(mercy, true);
    expect(mercy.consecutiveLosses).toBe(0);
    expect(mercy.forcedMisfiresRemaining).toBe(MERCY_FORCED_MISFIRES);
  });

  it('spec(A-030:AC-5) a rival miss leaves player hull unchanged and reports a miss', async () => {
    const { planRivalVolleySync } = await loadRivalDriver();
    const cap = captain();
    const ctx = resolveDuelContext(cap);
    expect(ctx.ok).toBe(true);
    if (!ctx.ok) return;
    const core = reachRivalTurnCore(cap, 3070);
    const loadout = expectedIslandLoadout(ctx.islandId, cap.gradeBand!);
    const volley = planRivalVolleySync({
      captain: captain({ mercyState: { ...emptyMercyState, forcedMisfiresRemaining: 1 } }),
      loadout,
      core,
    });
    expect(volley.correct).toBe(false);

    let state = initialDuelStateWithContext(ctx, 3071, cap);
    state = atWatchAfterTimeout(cap, 3071);
    const hullBefore = state.playerHull;
    state = duelReducer(state, {
      type: 'RIVAL_RESULT',
      turnToken: state.turnToken,
      volley,
    });
    expect(state.playerHull).toBe(hullBefore);
    expect(state.rivalDamage).toBe(0);

    const duelSource = readFileSync(join(REPO_ROOT, DUEL_PATH), 'utf8');
    expect(duelSource).toMatch(/rivalDamage\s*>\s*0/);
    expect(duelSource).toMatch(/Splash — they missed/);
  });

  it('spec(A-030:AC-6) disposed rival callbacks do not update listeners', async () => {
    const { driveRivalTurn } = await loadRivalDriver();
    const listener = vi.fn();
    let alive = true;
    const cancel = driveRivalTurn({
      turnToken: 7,
      expectedTurnToken: 7,
      alive: () => alive,
      resolve: () => Promise.resolve({ cannonId: 'six_pounder', correct: true, elapsedMs: 50 }),
      onResult: listener,
    });
    alive = false;
    cancel();
    await Promise.resolve();
    await Promise.resolve();
    expect(listener).not.toHaveBeenCalled();
  });

  it('spec(A-030:AC-7) every band-safe unlocked island yields a deterministic age-eligible rival loadout', async () => {
    const { deriveRivalLoadout } = await loadRivalLoadout();
    for (const band of GRADE_BANDS) {
      const maxGrade = MAX_GRADE_BY_BAND[band];
      for (const island of islands) {
        // The band's own cell (D-14) — the only skills the rival may ask at this island.
        const cellSkills = islandCurriculumFor(island.id, band).skills;
        const eligibleCannons = cannons.filter(
          (c) => cellSkills.includes(c.skill) && c.minGrade <= maxGrade,
        );
        if (eligibleCannons.length === 0) continue;

        const cap = captain({
          gradeBand: band,
          unlockedIslands: [island.id],
          currentIsland: island.id,
        });
        const loadout = deriveRivalLoadout(cap, island.id);
        expect(loadout.length, `${band}/${island.id}`).toBeGreaterThan(0);
        expect(loadout, `${band}/${island.id} order`).toEqual(expectedIslandLoadout(island.id, band));
        for (const id of loadout) {
          const cannon = getCannon(id);
          expect(cellSkills, `${band}/${island.id}/${id}`).toContain(cannon.skill);
          expect(cannon.minGrade, `${band}/${island.id}/${id}`).toBeLessThanOrEqual(maxGrade);
        }

        const ctx = resolveDuelContext(cap);
        expect(ctx.ok, `${band}/${island.id}`).toBe(true);
        if (!ctx.ok) continue;
        const booted = initialDuelStateWithContext(ctx, 3080 + island.order, cap);
        expect(booted.islandId).toBe(island.id);
        void booted;
      }
    }
  });

  it('spec(A-030:AC-3) out-of-order rival completion after a newer token is ignored', async () => {
    const cap = captain();
    const ctx = resolveDuelContext(cap);
    expect(ctx.ok).toBe(true);
    if (!ctx.ok) return;
    let state = atWatchAfterTimeout(cap, 3090);
    const token = state.turnToken;

    state = duelReducer(state, {
      type: 'RIVAL_RESULT',
      turnToken: token,
      volley: { cannonId: 'six_pounder', correct: false, elapsedMs: 10 },
    });
    const afterFirst = state;
    const stale = duelReducer(afterFirst, {
      type: 'RIVAL_RESULT',
      turnToken: token,
      volley: { cannonId: 'six_pounder', correct: true, elapsedMs: 10 },
    });
    expect(stale.playerHull).toBe(afterFirst.playerHull);
  });

  it('spec(A-030:AC-1) live store and screen drop provisional default rival damage', () => {
    const storeSource = readFileSync(join(REPO_ROOT, DUEL_STORE_PATH), 'utf8');
    const duelSource = readFileSync(join(REPO_ROOT, DUEL_PATH), 'utf8');
    expect(storeSource).not.toMatch(/applyDefaultRivalAction/);
    expect(storeSource).toMatch(/rivalLoadout|deriveRivalLoadout/);
    expect(duelSource).toMatch(/rivalDriver|driveRivalTurn/);
    expect(duelSource).not.toMatch(/nextInt\([^)]*,\s*7\s*,\s*12\)/);
  });
});
