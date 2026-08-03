/**
 * A-082 — the Uncharted Sea screen: three board states, transcription fidelity, and the
 * offline whole loop.
 *
 * RN components have no node render harness (posture.md), so the contract splits at the same
 * seams every chart suite uses: the PURE model (`unchartedBoard.ts` — state table, rules,
 * measured constants) is exercised directly against real services, and the render half is
 * pinned by source scans that AST-free regexes can't be argued with. Screenshot evidence stays
 * the authority for composition.
 *
 *   - AC-1: the state machine — arriving→ready on the 620ms curtain, SET SAIL dead while
 *     arriving, win→victorious (receipt-derived), Sail on→next island arriving, a loss returns
 *     to ready with the tally unchanged. No streak counter, no best run (board red-flag rule).
 *   - AC-2: transcription fidelity — the state table, palette groups, marker/banner geometry
 *     and pennant tones equal the board's measured values EXACTLY (frozen pins); the banner
 *     ellipsises and never wraps; components carry no hex literal of their own.
 *   - AC-4: the authored chart is untouched — no gen vocabulary in any chart service/surface.
 *   - AC-5: offline whole loop — arrive→duel→win→advance→arrive twice, headless, local
 *     generator only (no network, no LLM: nothing here can even name a transport).
 *
 * (AC-3, the dock doorway chip, lives in `chart-progress-presentation.test.ts` beside the
 * frozen containment slice it protects.)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GEN_MOODS, GEN_NAME_MAX, type GenIslandDoc } from '../../src/content/genIsland';
import { GRADE_BANDS, type GradeBand, type IslandId } from '../../src/content/schemas';
import { duelReceiptKey } from '../../src/contracts/rewards';
import type { DuelState } from '../../src/engine/duel/types';
import { chartNodes, chartProgress } from '../../src/services/chart';
import { DEMO_ROUTE_EDGES, executeDemoRouteEdge } from '../../src/services/flow';
import { commitGradeBand } from '../../src/services/onboarding';
import { settleDuelRewards } from '../../src/services/rewardSettlement';
import { openUnchartedDuel, unchartedDuelId } from '../../src/services/uncharted/duel';
import {
  GEN_NAME_ADJECTIVES,
  GEN_NAME_NOUNS,
  generateIsland,
} from '../../src/services/uncharted/generator';
import { advanceUncharted, settleUnchartedDuel } from '../../src/services/uncharted/settlement';
import {
  BANNER_U,
  boardLiterals,
  bandSkillLadder,
  CENTER,
  contentTones,
  deepSea,
  DOORWAY,
  FOG_PART_MS,
  MARKER,
  parseCornerPercents,
  PENNANT_LAND,
  PENNANT_TONES,
  pennantGlyphs,
  pennantTone,
  resolveUnchartedPhase,
  STATE_SPEC,
  SUB_CHIP,
  UNCHARTED_FRAME,
  unchartedDepthLabel,
  unchartedTallyCount,
  unchartedTerrain,
  WALL,
} from '../../src/components/uncharted/unchartedBoard';
import { createCaptainStore, type Captain, type CaptainStore } from '../../src/stores/player';
import { SKILL_GLYPH } from '../../src/theme/rankPresentation';

const REPO_ROOT = join(import.meta.dirname, '../..');

const read = (relativePath: string): string => readFileSync(join(REPO_ROOT, relativePath), 'utf8');

const SCREEN = 'app/uncharted.tsx';
const RENDER_FILES = [
  SCREEN,
  'src/components/uncharted/IslandFigure.tsx',
  'src/components/uncharted/StormWall.tsx',
  'src/components/uncharted/TallyPanel.tsx',
] as const;

// ── Harness (the A-081 suite's own, so the walk rides real services end to end) ──────────────

type TerminalCore = Extract<DuelState, { phase: 'victory' | 'defeat' }>;

const CHAIN: readonly IslandId[] = [
  'port_sumwich',
  'isla_products',
  'quotient_cove',
  'fraction_reef',
  'grandline',
];

/** The frontier's REAL entry state: chain settled, bus parked at the Grandline, chart complete. */
function frontierStore(band: GradeBand): CaptainStore {
  const store = createCaptainStore();
  commitGradeBand(store, band);
  for (let step = 0; step < CHAIN.length - 1; step += 1) {
    const duelId = `duel-a82fx${band}${step}`;
    store.getState().setCurrentIsland(CHAIN[step]!);
    settleDuelRewards(store, {
      duelId,
      seed: parseInt(duelId.slice('duel-'.length), 36) >>> 0,
      won: true,
      purseCoins: 5,
      skillTally: { add_within_10: { correct: 1, asked: 2 } },
    });
  }
  store.getState().setCurrentIsland('grandline');
  store.getState().beginUncharted();
  const captain = store.getState().captain;
  expect(captain.unlockedIslands).toHaveLength(5);
  expect(chartProgress(captain, chartNodes(captain)).nextIndex).toBe(-1);
  return store;
}

/** Exactly the screen's own deal: `6 + clearedCount`, both slots from one fresh seed. */
function dealFrontier(store: CaptainStore, seed: number): GenIslandDoc {
  const cap = store.getState().captain;
  const band = cap.gradeBand as GradeBand;
  const base = 6 + (cap.uncharted?.clearedCount ?? 0);
  store.getState().beginUncharted();
  store
    .getState()
    .setUnchartedIslands(generateIsland(seed, base, band), generateIsland(seed, base + 1, band));
  return store.getState().captain.uncharted?.current as GenIslandDoc;
}

/** Drives a real gen session to a terminal core — no fixture hand-writes a result. */
function finishGenDuel(doc: GenIslandDoc, captain: Captain, mode: 'win' | 'lose'): TerminalCore {
  const session = openUnchartedDuel(doc, captain);
  for (let guard = 0; guard < 6000; guard += 1) {
    const state = session.getState();
    const core = state.core;
    if (core.phase === 'victory' || core.phase === 'defeat') return core;
    if (state.phase === 'select' && core.phase === 'playerChoose') {
      session.dispatch({ type: 'CANNON_SELECTED', cannonId: core.playerLoadout[0]! });
      continue;
    }
    if (state.phase === 'question' && core.phase === 'reload') {
      const wrong = (core.question.correctIndex + 1) % core.question.choices.length;
      session.dispatch({
        type: 'ANSWER_CHOSEN',
        choiceIndex: mode === 'win' ? core.question.correctIndex : wrong,
        elapsedMs: 1000,
      });
      continue;
    }
    if (core.phase === 'rivalTurn' && state.phase === 'watch') {
      session.dispatch({
        type: 'RIVAL_RESULT',
        turnToken: core.turnToken,
        volley: { cannonId: core.rivalLoadout[0]!, correct: mode === 'lose', elapsedMs: 900 },
      });
      continue;
    }
    session.dispatch({ type: 'ADVANCE', beatToken: state.beatToken });
  }
  throw new Error('finishGenDuel: duel never terminated');
}

// ── AC-1: the state machine ───────────────────────────────────────────────────────────────────

describe('A-082 — the three states resolve from durable facts (AC-1)', () => {
  it('spec(A-082:AC-1) phase truth table: undealt→arriving, curtain→ready, receipt→victorious', () => {
    const store = frontierStore('g2_3');
    // Undealt: arriving regardless of the curtain — there is no island to look at yet.
    expect(resolveUnchartedPhase(store.getState().captain, false)).toBe('arriving');
    expect(resolveUnchartedPhase(store.getState().captain, true)).toBe('arriving');

    const doc = dealFrontier(store, 4821);
    expect(resolveUnchartedPhase(store.getState().captain, false)).toBe('arriving');
    expect(resolveUnchartedPhase(store.getState().captain, true)).toBe('ready');

    // The receipt IS the settled-win fact (A-081): victorious, curtain irrelevant.
    const core = finishGenDuel(doc, store.getState().captain, 'win');
    settleUnchartedDuel(store, core, doc);
    expect(store.getState().captain.rewardReceipts[duelReceiptKey(unchartedDuelId(doc))]).toBeDefined();
    expect(resolveUnchartedPhase(store.getState().captain, false)).toBe('victorious');
    expect(resolveUnchartedPhase(store.getState().captain, true)).toBe('victorious');
  });

  it('spec(A-082:AC-1) a loss returns to ready with the tally unchanged — nothing is taken away', () => {
    const store = frontierStore('k_1');
    const doc = dealFrontier(store, 913);
    const before = store.getState().captain.uncharted;

    const core = finishGenDuel(doc, store.getState().captain, 'lose');
    const outcome = settleUnchartedDuel(store, core, doc);
    expect(outcome.won).toBe(false);

    const captain = store.getState().captain;
    expect(captain.rewardReceipts[duelReceiptKey(unchartedDuelId(doc))]).toBeUndefined();
    expect(resolveUnchartedPhase(captain, true)).toBe('ready');
    expect(captain.uncharted).toEqual(before);
    expect(unchartedTallyCount(captain.uncharted?.clearedCount ?? 0, 'ready')).toBe(0);
    // And the frontier refuses to move without the settled win.
    expect(advanceUncharted(store, 999).advanced).toBe(false);
  });

  it('spec(A-082:AC-1) the curtain and the spring are the board’s own timings, and arriving cannot sail', () => {
    expect(FOG_PART_MS).toBe(620);
    expect(PENNANT_LAND.ms).toBe(460);
    expect(STATE_SPEC.arriving.sailEnabled).toBe(false);
    expect(STATE_SPEC.ready.sailEnabled).toBe(true);
    expect(STATE_SPEC.victorious.sailEnabled).toBe(true);

    const screen = read(SCREEN);
    // The SET SAIL pressable is dead exactly when the spec says so, and the curtain timer is
    // keyed on the island itself, so a Sail-on advance replays Arriving with no extra wiring.
    expect(screen).toContain('disabled={!spec.sailEnabled}');
    expect(screen).toContain('setTimeout(() => setFogParted(true), FOG_PART_MS)');
    expect(screen).toContain('}, [currentId]);');
    expect(screen).toContain('setFogParted(false);');
  });

  it('spec(A-082:AC-1) the screen’s verbs: arm-then-push for SET SAIL, explicit advance for Sail on, no params, no skips', () => {
    const screen = read(SCREEN);
    // SET SAIL boots the gen duel through A-080's module flag — never a route param.
    expect(screen).toContain('armUnchartedDuel(doc);');
    expect(screen.split("router.push('/duel')").length - 1).toBe(1);
    expect(screen).not.toMatch(/useLocalSearchParams|useGlobalSearchParams|useSearchParams/);
    // Sail on runs A-081's explicit advance — settlement never moves the frontier.
    expect(screen).toContain('advanceUncharted(captainStore, freshSeed());');
    expect(screen).not.toContain('settleUnchartedDuel');
    // The board's red-flag rule: no streak counter, no best run — on any of this feature's surfaces.
    for (const file of [...RENDER_FILES, 'src/components/uncharted/unchartedBoard.ts']) {
      const source = read(file);
      expect(source, file).not.toMatch(/streak/i);
      expect(source, file).not.toMatch(/best[\s_-]?run/i);
    }
  });
});

// ── AC-2: transcription fidelity (frozen exact pins) ─────────────────────────────────────────

describe('A-082 — the board transcribed, value for value (AC-2)', () => {
  it('spec(A-082:AC-2) the three-state table equals the board’s states, hex for hex, field for field', () => {
    expect(STATE_SPEC).toEqual({
      arriving: {
        depthWord: 'FOG PARTING',
        wallA: '#C9D6E4',
        wallB: '#C9D6E4',
        wallOpacity: 0.96,
        wallStirs: false,
        aheadShip: 0.16,
        aheadLabel: 'SOMETHING IS OUT THERE',
        centerFogged: true,
        centerGlows: false,
        markerRings: false,
        markerBg: '#8AA0B4',
        markerEdge: '#5A7288',
        subBg: '#DDE8F0',
        subInk: '#2E4560',
        shipLeft: 20,
        shipTop: 132,
        pennantNew: false,
        sailBg: '#E8DCC4',
        sailEdge: '#D8CBB2',
        sailInk: 0.42,
        sailLabel: 'Looking…',
        sailRing: false,
        sailEnabled: false,
      },
      ready: {
        depthWord: 'UNCLAIMED',
        wallA: '#8AA0B4',
        wallB: '#C9D6E4',
        wallOpacity: 0.72,
        wallStirs: false,
        aheadShip: 0.3,
        aheadLabel: 'NEXT ISLAND — NOT YET',
        centerFogged: false,
        centerGlows: true,
        markerRings: true,
        markerBg: '#F5A623',
        markerEdge: '#B87309',
        subBg: '#FFD23F',
        subInk: '#14283C',
        shipLeft: 332,
        shipTop: 150,
        pennantNew: false,
        sailBg: '#F5A623',
        sailEdge: '#B87309',
        sailInk: 1,
        sailLabel: 'Set sail',
        sailRing: true,
        sailEnabled: true,
      },
      victorious: {
        depthWord: 'CLAIMED',
        wallA: '#8AA0B4',
        wallB: '#8AA0B4',
        wallOpacity: 0.46,
        wallStirs: true,
        aheadShip: 0.44,
        aheadLabel: 'THE FOG IS STIRRING',
        centerFogged: false,
        centerGlows: false,
        markerRings: false,
        markerBg: '#2FB65E',
        markerEdge: '#1E7F41',
        subBg: '#DFF3E6',
        subInk: '#14283C',
        shipLeft: 330,
        shipTop: 196,
        pennantNew: true,
        sailBg: '#F5A623',
        sailEdge: '#B87309',
        sailInk: 1,
        sailLabel: 'Sail on',
        sailRing: true,
        sailEnabled: true,
      },
    });
  });

  it('spec(A-082:AC-2) the declared palette groups are the board’s, verbatim', () => {
    expect(deepSea).toEqual({
      deep1: '#2A6E92',
      deep2: '#175A7E',
      deep3: '#123A52',
      deepPanel: '#1B4A66',
      deep4: '#0A2A3C',
      deepInk: '#0A2033',
      deepLabel: '#7FB0CC',
    });
    expect(unchartedTerrain).toEqual({
      trunk: '#8B5A2B',
      grassDeeper: '#4F8F3D',
      peakCap: '#DDEBF4',
      driftwood: '#5C4A3A',
    });
    expect(contentTones).toEqual({
      pennantSky: '#7FCDEC',
      pennantMint: '#8FE0AC',
      pennantRose: '#F26FB2',
      pennantBone: '#E8DCC4',
      labelCool: '#BFD8E8',
      subClaimed: '#DFF3E6',
      subFogged: '#DDE8F0',
      subInk: '#2E4560',
    });
    expect(PENNANT_TONES).toEqual([
      '#F5A623',
      '#2FB65E',
      '#7FCDEC',
      '#F26FB2',
      '#FFD23F',
      '#8FE0AC',
      '#C9AE7E',
    ]);
    expect(boardLiterals).toEqual({
      bannerShadow: '#06121D',
      waterInset: '#2A8FBF',
      spireShade: '#46596B',
      hutRoof: '#B02418',
      shipShadow: '#061A28',
    });
  });

  it('spec(A-082:AC-2) the mood table renders the board’s chips exactly — six token substitutions per mood', () => {
    // Duplicated from the board (not from A-078's file) on purpose: this is the render path's
    // own pin, so swapping any mood hex reddens THIS suite whatever the content suite is doing.
    const chips = (mood: keyof typeof GEN_MOODS) =>
      Object.fromEntries(
        Object.entries(GEN_MOODS[mood]).map(([channel, swatch]) => [channel, swatch.hex]),
      );
    expect(chips('dawn_gold')).toEqual({
      sky: '#E3F7FF',
      water: '#43B4E0',
      sand: '#F2E1B8',
      sandDeep: '#DCC49A',
      grass: '#7ED07A',
      grassDeep: '#5FA149',
    });
    expect(chips('storm_slate')).toEqual({
      sky: '#C9D6E4',
      water: '#0C5E86',
      sand: '#D8CBB2',
      sandDeep: '#C9AE7E',
      grass: '#8AA0B4',
      grassDeep: '#5A7288',
    });
    expect(chips('jungle_emerald')).toEqual({
      sky: '#A9E6FF',
      water: '#1584B8',
      sand: '#F0E2C8',
      sandDeep: '#C9AE7E',
      grass: '#2FB65E',
      grassDeep: '#1E7F41',
    });
    expect(chips('dusk_violet')).toEqual({
      sky: '#6C4BD6',
      water: '#4A2FA0',
      sand: '#F0E2C8',
      sandDeep: '#C9AE7E',
      grass: '#2F9E5C',
      grassDeep: '#5A7288',
    });
  });

  it('spec(A-082:AC-2) marker, banner, wall and doorway geometry are the board’s measurements', () => {
    expect(UNCHARTED_FRAME).toEqual({ width: 402, height: 874, statusBar: 20 });
    expect(WALL.height).toBe(236);
    expect(CENTER).toMatchObject({
      top: 236,
      height: 352,
      isle: { left: 76, top: 30, w: 250, h: 170 },
    });
    expect(MARKER).toMatchObject({
      top: 208,
      gap: 6,
      box: 72,
      disc: 56,
      glyphSize: 26,
      shadowDy: 5,
      ring: { size: 60, inset: 6, ms: 1800 },
    });
    expect(BANNER_U).toEqual({ maxWidth: 372, padX: 18, padY: 6, size: 19, shadowDy: 4 });
    expect(SUB_CHIP).toEqual({ padX: 10, padY: 2, size: 11, tracking: 0.05 });
    expect(DOORWAY).toMatchObject({
      chip: { height: 64, radius: 18, padX: 12, gap: 12, shadowDy: 5 },
      disc: { size: 40, rim: 2 },
      lineSize: 18,
      subSize: 11,
      line: 'The Uncharted Sea',
      openSub: 'SAIL PAST THE EDGE',
      returningSub: 'SAIL AGAIN',
      ring: { inset: 5, radius: 22, width: 4 },
    });
    expect(PENNANT_LAND).toEqual({ ms: 460, fromY: -22, fromScale: 0.4, midScale: 1.18, midMs: 276 });
  });

  it('spec(A-082:AC-2) corner shorthands parse as CSS does — one value or four, TL TR BR BL', () => {
    expect(parseCornerPercents('52% 48% 44% 56%')).toEqual([52, 48, 44, 56]);
    expect(parseCornerPercents('50%')).toEqual([50, 50, 50, 50]);
    expect(() => parseCornerPercents('50% 50%')).toThrow();
    expect(() => parseCornerPercents('banana')).toThrow();
  });

  it('spec(A-082:AC-2) render files carry no hex of their own — every colour arrives through a declared name', () => {
    for (const file of RENDER_FILES) {
      const hexes = read(file).match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      expect(hexes, `${file} carries raw hex literals: ${hexes.join(', ')}`).toEqual([]);
    }
  });

  it('spec(A-082:AC-2) the island renders the doc’s own vocabulary: recipe geometry, mood channels, derived glyph', () => {
    const figure = read('src/components/uncharted/IslandFigure.tsx');
    expect(figure).toContain('GEN_RECIPE_GEOMETRY[doc.recipe]');
    expect(figure).toContain('GEN_MOODS[doc.mood]');
    expect(figure).toContain('SKILL_GLYPH[doc.skills[0]!]');
    expect(figure).toContain('parseCornerPercents(geo.shallowR)');
    expect(figure).toContain('parseCornerPercents(geo.sandR)');
    expect(figure).toContain('parseCornerPercents(geo.grassR)');
    // The mood may never touch the marker or banner: their fills come from the state spec and
    // the ink tokens, and the mood object is never read inside the marker column block.
    const markerBlock = figure.slice(
      figure.indexOf('{/* Marker, banner, skill chip'),
      figure.indexOf("The captain's ship"),
    );
    expect(markerBlock.length).toBeGreaterThan(0);
    expect(markerBlock).not.toContain('mood.');
  });

  it('spec(A-082:AC-2) the name banner is one line that ellipsises inside the board bound — never wraps', () => {
    const figure = read('src/components/uncharted/IslandFigure.tsx');
    const banner = figure.slice(figure.indexOf('The name banner'), figure.indexOf('SUB_CHIP.padX'));
    expect(banner.length).toBeGreaterThan(0);
    expect(banner).toContain('numberOfLines={1}');
    expect(banner).toContain('ellipsizeMode="tail"');
    expect(banner).toContain('maxWidth: BANNER_U.maxWidth * art');
    expect(banner).not.toContain('flexWrap');
    // The write side of the same law: names cap at 24 and the longest composable name hits it.
    expect(GEN_NAME_MAX).toBe(24);
    const longest = GEN_NAME_ADJECTIVES.flatMap((adjective) =>
      GEN_NAME_NOUNS.map((noun) => `The ${adjective} ${noun}`),
    ).reduce((a, b) => (b.length > a.length ? b : a));
    expect(longest.length).toBe(GEN_NAME_MAX);
    // And the pill bound sits inside the frame, so a capped name can never leave the screen.
    expect(BANNER_U.maxWidth).toBeLessThan(UNCHARTED_FRAME.width);
  });
});

// ── Route wiring ──────────────────────────────────────────────────────────────────────────────

describe('A-082 — the doorway rides the declared flow graph, no route params', () => {
  it('spec(A-082:AC-3) the three uncharted edges are declared and execute their transitions', () => {
    const chartIn = DEMO_ROUTE_EDGES.filter((edge) => edge.id === 'chart-uncharted');
    expect(chartIn).toHaveLength(1);
    expect(chartIn[0]).toMatchObject({
      from: 'chart',
      to: 'uncharted',
      action: { kind: 'push', href: '/uncharted' },
    });
    const back = DEMO_ROUTE_EDGES.filter((edge) => edge.id === 'uncharted-chart-back');
    expect(back[0]).toMatchObject({ from: 'uncharted', to: 'chart', action: { kind: 'back' } });
    const toDuel = DEMO_ROUTE_EDGES.filter((edge) => edge.id === 'uncharted-duel');
    expect(toDuel[0]).toMatchObject({
      from: 'uncharted',
      to: 'duel',
      action: { kind: 'push', href: '/duel' },
    });

    for (const edge of [...chartIn, ...back, ...toDuel]) {
      const calls: string[] = [];
      executeDemoRouteEdge(edge!.id, {
        push: (href) => calls.push(`push:${href}`),
        replace: (href) => calls.push(`replace:${href}`),
        back: () => calls.push('back'),
        redirect: (href) => calls.push(`redirect:${href}`),
      });
      const expected =
        edge!.action.kind === 'back' ? 'back' : `${edge!.action.kind}:${edge!.action.href ?? ''}`;
      expect(calls).toEqual([expected]);
    }
  });

  it('spec(A-082:AC-4) no gen vocabulary reaches any authored chart surface', () => {
    for (const file of [
      'app/chart.tsx',
      'src/services/chart.ts',
      'src/components/chart/VoyageMap.tsx',
      'src/components/chart/board.ts',
    ]) {
      const source = read(file);
      expect(source, file).not.toMatch(/[Uu]ncharted|gen_isle|gduel/);
    }
  });
});

// ── AC-5: the offline whole loop ──────────────────────────────────────────────────────────────

describe('A-082 — arrive→duel→win→advance→arrive, twice, fully offline (AC-5)', () => {
  it('spec(A-082:AC-5) the whole loop walks twice on the local generator, and the authored map never moves', () => {
    const store = frontierStore('g4_5');
    const mapBefore = {
      currentIsland: store.getState().captain.currentIsland,
      unlockedIslands: [...store.getState().captain.unlockedIslands],
    };

    let expectedIndex = 6;
    for (const seed of [11_001, 22_002]) {
      // Arrive: the screen's own deal, then the curtain.
      const doc = dealFrontier(store, seed);
      expect(doc.index).toBe(expectedIndex);
      expect(resolveUnchartedPhase(store.getState().captain, false)).toBe('arriving');
      expect(resolveUnchartedPhase(store.getState().captain, true)).toBe('ready');
      expect(unchartedDepthLabel(doc.index, 'ready')).toBe(
        `ISLAND ${expectedIndex - 5} · UNCLAIMED`,
      );

      // Duel and win — the real anchor-mapped session, scripted, no network anywhere.
      const core = finishGenDuel(doc, store.getState().captain, 'win');
      const outcome = settleUnchartedDuel(store, core, doc);
      expect(outcome.won).toBe(true);

      // Victorious: pennant lands (display tally +1), the state table thins the wall.
      const cleared = store.getState().captain.uncharted?.clearedCount ?? 0;
      expect(resolveUnchartedPhase(store.getState().captain, true)).toBe('victorious');
      expect(unchartedTallyCount(cleared, 'victorious')).toBe(cleared + 1);
      expect(unchartedDepthLabel(doc.index, 'victorious')).toBe(
        `ISLAND ${expectedIndex - 5} · CLAIMED`,
      );
      expect(STATE_SPEC.victorious.wallOpacity).toBeLessThan(STATE_SPEC.ready.wallOpacity);

      // Sail on: the explicit advance, then the NEXT island's arriving.
      const advanced = advanceUncharted(store, seed + 7);
      expect(advanced.advanced).toBe(true);
      expectedIndex += 1;
      const next = store.getState().captain.uncharted?.current;
      expect(next?.index).toBe(expectedIndex);
      expect(resolveUnchartedPhase(store.getState().captain, false)).toBe('arriving');

      // The bus law, every lap: the authored chart is byte-still.
      const captain = store.getState().captain;
      expect(captain.currentIsland).toBe(mapBefore.currentIsland);
      expect(captain.unlockedIslands).toEqual(mapBefore.unlockedIslands);
      expect(chartProgress(captain, chartNodes(captain)).nextIndex).toBe(-1);
    }

    expect(store.getState().captain.uncharted?.clearedCount).toBe(2);
  });

  it('spec(A-082:AC-5) pennant glyphs are dealt from the band’s own ladder — band-safe by construction', () => {
    for (const band of GRADE_BANDS) {
      const ladder = bandSkillLadder(band);
      expect(ladder.length).toBeGreaterThan(0);
      const glyphs = pennantGlyphs(band, 20);
      expect(glyphs).toHaveLength(20);
      glyphs.forEach((glyph, i) => {
        expect(glyph, `${band} pennant ${i}`).toBe(SKILL_GLYPH[ladder[i % ladder.length]!]);
        expect(glyph, `${band} pennant ${i} has no glyph`).toBeTruthy();
      });
      if (band === 'k_1') {
        for (const glyph of glyphs) expect(glyph).not.toMatch(/[×÷]/);
      }
    }
    // Tones cycle the board's seven, in order.
    for (let i = 0; i < 15; i += 1) {
      expect(pennantTone(i)).toBe(PENNANT_TONES[i % PENNANT_TONES.length]);
    }
  });
});
