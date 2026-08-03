/**
 * A-081 — gen settlement pays honestly, and the frontier advances by explicit action.
 *
 * Frozen contract for `src/services/uncharted/settlement.ts` and the additive `fleet` gate in
 * `src/services/rewardSettlement.ts`, under amended D-17 + `docs/ENDLESS-ARCHIPELAGO-DESIGN.md`
 * §2 S3/S4:
 *
 *   - AC-1: a settled gen win pays coins + the `duel:gduel_…` receipt + mastery exactly once
 *     (replay of the same duelId is a durable no-op), and the authored map — `currentIsland`,
 *     `unlockedIslands`, `chartProgress` — is byte-unchanged across win AND loss settlements.
 *   - AC-2: `fleet:'hold'` — the anchor island's authored ship is never marked met by a gen
 *     settlement; the doc's actually-fought rival is, on a win only. A loss marks nothing and
 *     advances nothing.
 *   - AC-3: `advanceUncharted` moves the frontier exactly one island per settled win, is a
 *     no-op without one (and on a double-tap), and is NEVER called from inside settlement.
 *
 * Every settlement here rides a REAL terminal core: the duel is booted through A-080's
 * `openUnchartedDuel` (the anchor mapping, real engine inside) and scripted to victory or
 * defeat — no fixture hand-writes a result. The captain is walked to the frontier's real entry
 * state first: the full authored chain settled, bus parked at the Grandline, `chartProgress`
 * at its pinned completion death.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import type { GenIslandDoc } from '../../src/content/genIsland';
import type { GradeBand, IslandId } from '../../src/content/schemas';
import { duelReceiptKey, type ChestReceipt } from '../../src/contracts/rewards';
import type { DuelState } from '../../src/engine/duel/types';
import { chartNodes, chartProgress } from '../../src/services/chart';
import { commitGradeBand } from '../../src/services/onboarding';
import { canonicalDuelSeed, settleDuelRewards } from '../../src/services/rewardSettlement';
import { rivalVariantFor } from '../../src/services/rivalVariant';
import { openUnchartedDuel, unchartedDuelId } from '../../src/services/uncharted/duel';
import { generateIsland } from '../../src/services/uncharted/generator';
import { advanceUncharted, settleUnchartedDuel } from '../../src/services/uncharted/settlement';
import { createCaptainStore, type Captain, type CaptainStore } from '../../src/stores/player';

const REPO_ROOT = join(import.meta.dirname, '../..');

type TerminalCore = Extract<DuelState, { phase: 'victory' | 'defeat' }>;

const CHAIN: readonly IslandId[] = [
  'port_sumwich',
  'isla_products',
  'quotient_cove',
  'fraction_reef',
  'grandline',
];

// ── Harness ──────────────────────────────────────────────────────────────────────────────────

/**
 * The frontier's REAL entry state: onboarded, the whole authored chain settled through the real
 * spine, bus parked at the Grandline, chart at its pinned completion death. With all five
 * islands open, the mastery lane can add cannons but never islands — which is what lets AC-1
 * assert the map byte-unchanged without faking anything.
 */
function frontierStore(band: GradeBand): CaptainStore {
  const store = createCaptainStore();
  commitGradeBand(store, band);
  for (let step = 0; step < CHAIN.length - 1; step += 1) {
    const duelId = `duel-a81fx${band}${step}`;
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

  // Non-vacuity: this really is the S6 entry state — five open, the dock promise dead.
  const captain = store.getState().captain;
  expect(captain.unlockedIslands).toHaveLength(5);
  expect(captain.currentIsland).toBe('grandline');
  expect(chartProgress(captain, chartNodes(captain)).nextIndex).toBe(-1);
  return store;
}

/**
 * A frontier doc whose dealt rival is distinct from the anchor's dealt ship AND new to this
 * captain's shelf — the non-vacuity AC-2 needs. Deterministic: first qualifying seed wins.
 */
function pickDoc(band: GradeBand, captain: Captain, index = 6): GenIslandDoc {
  for (let seed = 1000; seed < 1600; seed += 1) {
    const doc = generateIsland(seed, index, band);
    const anchorShip = rivalVariantFor('grandline', unchartedDuelId(doc)).shipId;
    if (
      doc.rivalDocId !== anchorShip &&
      !captain.metRivals.includes(doc.rivalDocId) &&
      !captain.metRivals.includes(anchorShip)
    ) {
      return doc;
    }
  }
  throw new Error(`pickDoc: no qualifying frontier doc for ${band} in 600 seeds`);
}

/**
 * Drives a real gen session to a terminal core. `win`: every answer correct, the rival always
 * misses. `lose`: every answer wrong, the rival always hits. Pure of the clock — every
 * elapsedMs is data.
 */
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

function captainJson(store: CaptainStore): string {
  return JSON.stringify(store.getState().captain);
}

// ── AST helpers (the A-080 suite's pattern) ──────────────────────────────────────────────────

function sourceFile(relativePath: string): ts.SourceFile {
  const source = readFileSync(join(REPO_ROOT, relativePath), 'utf8');
  return ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function namedFunction(file: ts.SourceFile, name: string): ts.FunctionDeclaration & { body: ts.Block } {
  const matches: ts.FunctionDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  const match = matches[0];
  if (matches.length !== 1 || match?.body === undefined) {
    throw new Error(`${file.fileName}: expected exactly one function ${name}`);
  }
  return match as ts.FunctionDeclaration & { body: ts.Block };
}

// ── AC-1: paid exactly once, and the authored map never moves ────────────────────────────────

describe('A-081 AC-1 — a settled gen win pays honestly, exactly once', () => {
  it('spec(A-081:AC-1) coins, the duel:gduel receipt, chest and mastery land once — replay of the same duelId is a durable no-op', () => {
    const store = frontierStore('g2_3');
    const doc = pickDoc('g2_3', store.getState().captain);
    store.getState().setUnchartedIslands(doc, null);
    const core = finishGenDuel(doc, store.getState().captain, 'win');
    expect(core.phase).toBe('victory');
    const purse = (core.result as typeof core.result & { readonly coins: number }).coins;

    const before = structuredClone(store.getState().captain);
    const outcome = settleUnchartedDuel(store, core, doc);

    expect(outcome.applied).toBe(true);
    expect(outcome.won).toBe(true);
    const after = store.getState().captain;
    const key = duelReceiptKey(unchartedDuelId(doc));
    expect(key).toBe(`duel:gduel_${doc.index}_${(doc.seed >>> 0).toString(36)}`);
    const receipt = after.rewardReceipts[key];
    expect(receipt).toBeDefined();
    expect(receipt?.source).toBe('duel');
    // The receipt's seed is the doc's own — the gduel grammar rides `canonicalDuelSeed` whole.
    expect(receipt?.seed).toBe(doc.seed >>> 0);
    expect(after.coins).toBe(before.coins + purse + outcome.chestCoins);
    expect(after.wins).toBe(before.wins + 1);
    expect(after.mastery).not.toEqual(before.mastery);
    expect(outcome.chestReceipt).not.toBeNull();

    // Replay: applied false, zero coins, and the captain does not move a byte.
    const settled = captainJson(store);
    const replay = settleUnchartedDuel(store, core, doc);
    expect(replay.applied).toBe(false);
    expect(replay.coins).toBe(0);
    expect(replay.chestCoins).toBe(0);
    expect(captainJson(store)).toBe(settled);
  });

  it('spec(A-081:AC-1) the authored map is byte-unchanged — currentIsland, unlockedIslands, chartProgress deep-equal across win AND loss', () => {
    for (const mode of ['win', 'lose'] as const) {
      const store = frontierStore('k_1');
      const doc = pickDoc('k_1', store.getState().captain);
      store.getState().setUnchartedIslands(doc, null);
      const core = finishGenDuel(doc, store.getState().captain, mode);
      expect(core.phase).toBe(mode === 'win' ? 'victory' : 'defeat');

      const before = store.getState().captain;
      const islandsBefore = structuredClone(before.unlockedIslands);
      const progressBefore = JSON.stringify(chartProgress(before, chartNodes(before)));

      const outcome = settleUnchartedDuel(store, core, doc);
      expect(outcome.applied).toBe(true);
      expect(outcome.unlockedIslands).toEqual([]);

      const after = store.getState().captain;
      expect(after.currentIsland, mode).toBe('grandline');
      expect(after.unlockedIslands, mode).toEqual(islandsBefore);
      expect(JSON.stringify(chartProgress(after, chartNodes(after))), mode).toBe(progressBefore);
    }
  });

  it('spec(A-081:AC-1) canonicalDuelSeed reads the gduel grammar and leaves the authored grammar byte-identical', () => {
    expect(canonicalDuelSeed('duel-zzz')).toBe(parseInt('zzz', 36) >>> 0);
    const doc = generateIsland(777, 9, 'k_1');
    expect(canonicalDuelSeed(unchartedDuelId(doc))).toBe(777 >>> 0);
    expect(() => canonicalDuelSeed('range-1')).toThrow(RangeError);
    expect(() => canonicalDuelSeed('gduel_x_12')).toThrow(RangeError);
    expect(() => canonicalDuelSeed('gduel_6_')).toThrow(RangeError);
  });
});

// ── AC-2: the shelf never lies ───────────────────────────────────────────────────────────────

describe("A-081 AC-2 — fleet:'hold' and the honest mark", () => {
  it("spec(A-081:AC-2) a gen win marks the doc's actually-fought rival and NEVER the anchor island's authored ship", () => {
    const store = frontierStore('g4_5');
    const doc = pickDoc('g4_5', store.getState().captain);
    store.getState().setUnchartedIslands(doc, null);
    const core = finishGenDuel(doc, store.getState().captain, 'win');

    const anchorShip = rivalVariantFor('grandline', unchartedDuelId(doc)).shipId;
    const beforeMet = [...store.getState().captain.metRivals];
    // Non-vacuity, pinned by pickDoc: the two ships are distinct and both new to this shelf.
    expect(anchorShip).not.toBe(doc.rivalDocId);
    expect(beforeMet).not.toContain(doc.rivalDocId);
    expect(beforeMet).not.toContain(anchorShip);

    settleUnchartedDuel(store, core, doc);

    const met = store.getState().captain.metRivals;
    expect(met).toEqual([...beforeMet, doc.rivalDocId]);
    expect(met).not.toContain(anchorShip);
  });

  it('spec(A-081:AC-2) a frontier loss banks its purse but marks nothing and advances nothing', () => {
    const store = frontierStore('g2_3');
    const doc = pickDoc('g2_3', store.getState().captain);
    const next = generateIsland(4321, 7, 'g2_3');
    store.getState().setUnchartedIslands(doc, next);
    const core = finishGenDuel(doc, store.getState().captain, 'lose');
    expect(core.phase).toBe('defeat');

    const before = store.getState().captain;
    const metBefore = structuredClone(before.metRivals);
    const unchartedBefore = structuredClone(before.uncharted);

    const outcome = settleUnchartedDuel(store, core, doc);
    expect(outcome.applied).toBe(true);
    expect(outcome.won).toBe(false);

    const after = store.getState().captain;
    expect(after.metRivals).toEqual(metBefore);
    expect(after.uncharted).toEqual(unchartedBefore);
    // No receipt for a defeat — so the explicit advance refuses too.
    expect(after.rewardReceipts[duelReceiptKey(unchartedDuelId(doc))]).toBeUndefined();
    const frozen = captainJson(store);
    const advance = advanceUncharted(store, 999);
    expect(advance.advanced).toBe(false);
    expect(captainJson(store)).toBe(frozen);
  });

  it("spec(A-081:AC-2) a core that is not the doc's own duel is refused before anything commits", () => {
    const store = frontierStore('k_1');
    const docA = pickDoc('k_1', store.getState().captain);
    const docB = generateIsland(docA.seed + 1, 7, 'k_1');
    store.getState().setUnchartedIslands(docA, null);
    const coreA = finishGenDuel(docA, store.getState().captain, 'win');
    expect(unchartedDuelId(docB)).not.toBe(coreA.duelId);

    const frozen = captainJson(store);
    expect(() => settleUnchartedDuel(store, coreA, docB)).toThrow(RangeError);
    expect(captainJson(store)).toBe(frozen);
    expect(store.getState().captain.rewardReceipts[duelReceiptKey(unchartedDuelId(docA))]).toBeUndefined();
    expect(store.getState().captain.rewardReceipts[duelReceiptKey(unchartedDuelId(docB))]).toBeUndefined();
  });

  it("spec(A-081:AC-2) the metRivals block is gated on fleet === 'mark' at source — the two-line gate", () => {
    const reward = readFileSync(join(REPO_ROOT, 'src/services/rewardSettlement.ts'), 'utf8');
    expect(reward).toMatch(/const fleet = options\?\.fleet \?\? 'mark';/);
    expect(reward).toMatch(/if \(fleet === 'mark' && next\.currentIsland !== null\) \{/);
  });
});

// ── AC-3: the frontier advances by explicit action only ─────────────────────────────────────

describe('A-081 AC-3 — advanceUncharted is explicit, single-step, and double-tap safe', () => {
  it('spec(A-081:AC-3) settlement never moves the frontier; the explicit advance then moves it exactly one island', () => {
    const store = frontierStore('g2_3');
    const doc6 = pickDoc('g2_3', store.getState().captain);
    const doc7 = generateIsland(9002, 7, 'g2_3');
    store.getState().setUnchartedIslands(doc6, doc7);
    const core = finishGenDuel(doc6, store.getState().captain, 'win');

    const unchartedBefore = structuredClone(store.getState().captain.uncharted);
    settleUnchartedDuel(store, core, doc6);
    // The settlement banked everything — and the frontier did not move (S4's whole point).
    expect(store.getState().captain.uncharted).toEqual(unchartedBefore);

    const out = advanceUncharted(store, 4242);
    expect(out.advanced).toBe(true);
    const u = store.getState().captain.uncharted!;
    expect(u.clearedCount).toBe(1);
    expect(u.current).toEqual(doc7);
    // The new next is A-078's own deal, deep-equal — generated, never invented.
    expect(u.next).toEqual(generateIsland(4242, 8, 'g2_3'));
    expect(out.current).toEqual(doc7);
    expect(out.next).toEqual(generateIsland(4242, 8, 'g2_3'));

    // The bus law survives the advance: the authored map is exactly where it was parked.
    expect(store.getState().captain.currentIsland).toBe('grandline');
    expect(store.getState().captain.unlockedIslands).toHaveLength(5);

    // Double-tap: the promoted island holds no receipt, so the second tap is a durable no-op.
    const frozen = captainJson(store);
    const again = advanceUncharted(store, 5150);
    expect(again.advanced).toBe(false);
    expect(captainJson(store)).toBe(frozen);
  });

  it('spec(A-081:AC-3) with no settled win at all the advance is a no-op — nothing generated, nothing counted', () => {
    const store = frontierStore('k_1');
    const doc6 = generateIsland(11, 6, 'k_1');
    const doc7 = generateIsland(12, 7, 'k_1');
    store.getState().setUnchartedIslands(doc6, doc7);

    const frozen = captainJson(store);
    const out = advanceUncharted(store, 77);
    expect(out.advanced).toBe(false);
    expect(out.clearedCount).toBe(0);
    expect(captainJson(store)).toBe(frozen);
  });

  it('spec(A-081:AC-3) a missing next slot regenerates locally — a win never promotes a hole into current', () => {
    const store = frontierStore('g4_5');
    const doc6 = pickDoc('g4_5', store.getState().captain);
    store.getState().setUnchartedIslands(doc6, null);
    const core = finishGenDuel(doc6, store.getState().captain, 'win');
    settleUnchartedDuel(store, core, doc6);

    const out = advanceUncharted(store, 8080);
    expect(out.advanced).toBe(true);
    const u = store.getState().captain.uncharted!;
    expect(u.clearedCount).toBe(1);
    expect(u.current).toEqual(generateIsland(8080, 7, 'g4_5'));
    expect(u.next).toEqual(generateIsland(8080, 8, 'g4_5'));
  });

  it('spec(A-081:AC-3) an unplaced captain fails closed — a forged receipt on a null band generates nothing', () => {
    const store = createCaptainStore();
    const doc = generateIsland(31, 6, 'k_1');
    store.getState().beginUncharted();
    store.getState().setUnchartedIslands(doc, null);
    const key = duelReceiptKey(unchartedDuelId(doc));
    const captain = store.getState().captain;
    const forged: ChestReceipt = {
      key,
      source: 'duel',
      seed: doc.seed >>> 0,
      rarity: 'common',
      coinFallback: 0,
      grant: { kind: 'coins', amount: 0 },
    };
    store.getState().replaceCaptain({
      ...captain,
      rewardReceipts: { ...captain.rewardReceipts, [key]: forged },
    });
    expect(store.getState().captain.gradeBand).toBeNull();

    const frozen = captainJson(store);
    const out = advanceUncharted(store, 55);
    expect(out.advanced).toBe(false);
    expect(captainJson(store)).toBe(frozen);
  });

  it('spec(A-081:AC-3) advance is never called from inside settlement — source-pinned at both modules', () => {
    const reward = readFileSync(join(REPO_ROOT, 'src/services/rewardSettlement.ts'), 'utf8');
    expect(reward).not.toMatch(/advanceUncharted/);
    expect(reward).not.toMatch(/settleUnchartedDuel/);
    expect(reward).not.toMatch(/from '\.\/uncharted\//);

    const file = sourceFile('src/services/uncharted/settlement.ts');
    const settleBody = namedFunction(file, 'settleUnchartedDuel').body.getText(file);
    expect(settleBody).not.toMatch(/advanceUncharted/);
    // The delegation itself is pinned — both island-keyed blocks held, always, in one call.
    expect(settleBody).toMatch(
      /settleDuelRewards\(\s*store,\s*core,\s*\{\s*voyage:\s*'hold',\s*fleet:\s*'hold'\s*\}\s*\)/,
    );
  });
});
