/**
 * A-080 — the anchor-mapped gen duel boot: the engine never learns gen ids.
 *
 * Frozen contract for `src/services/uncharted/duel.ts` and the `app/duel.tsx` gen branch,
 * under amended D-17 + `docs/ENDLESS-ARCHIPELAGO-DESIGN.md` §2 S1/S2 and D-15:
 *
 *   - AC-1: `unchartedConfig` output boots the REAL engine (`createDuelState` — `validateConfig`
 *     runs inside it) for every 30-seed × 3-band sweep of A-078 docs; the built core's
 *     `enemyMaxHull` is `doc.hull`, never the anchor's table row; same doc + same seed → the
 *     identical question sequence (determinism retained as test infrastructure per D-15).
 *   - AC-2: the ceiling holds in the tray — every player gun and every rival gun sits at or
 *     under the band's ceiling; a k_1 gen duel never renders ×/÷ (the A-060 restatement).
 *   - AC-3: the screen never leaks the anchor — the projected HUD name is `doc.displayName`
 *     and never the Grandline's band name; rival identity/paint/crew come from the doc's dealt
 *     fleet ship, never an island lookup (source-guard + behavioral).
 *   - AC-4: the authored path is untouched — the gen branch is keyed on the module boot flag
 *     (never a route param), `DuelBody` and the pinned boot modules never learn the namespace,
 *     and a captain without the armed flag cannot reach the branch.
 *
 * `app/duel.tsx` imports React Native, so the screen clauses are asserted against its source
 * via the TypeScript AST (the A-001 AC-7 pattern) while everything numeric drives the real
 * adapter session headless.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';
import { beforeEach, describe, expect, it } from 'vitest';

import { genIslandSchema, type GenIslandDoc } from '../../src/content/genIsland';
import { generatedFleet, isMysteryShip } from '../../src/content/generatedFleet';
import { enemies, getCannon, getSkill, islandCurriculumFor } from '../../src/content/index';
import { GRADE_BANDS, type GradeBand, type SkillId } from '../../src/content/schemas';
import { createDuelState } from '../../src/engine/duel/types';
import { maxGradeForBand } from '../../src/engine/placement';
import { ENEMY_HULL_BY_ISLAND, PLAYER_HULL } from '../../src/engine/tuning';
import { asksInBand, inBandLoadout } from '../../src/services/loadout';
import { rivalVariantFor } from '../../src/services/rivalVariant';
import { generateIsland } from '../../src/services/uncharted/generator';
import {
  armUnchartedDuel,
  armedUnchartedDoc,
  disarmUnchartedDuel,
  openUnchartedDuel,
  projectUnchartedView,
  unchartedConfig,
  unchartedCrewFor,
  unchartedDuelId,
  unchartedFleetDoc,
  unchartedRivalLoadout,
  unchartedRivalPresentation,
  UNCHARTED_ANCHOR_ISLAND,
} from '../../src/services/uncharted/duel';
import { cannons } from '../../src/content/index';
import { crewFor } from '../../src/theme/crewPresentation';
import { enemyPresentationFor } from '../../src/theme/enemyPresentation';
import { createCaptainStore, type Captain } from '../../src/stores/player';

const REPO_ROOT = join(import.meta.dirname, '../..');
const DUEL_PATH = 'app/duel.tsx';

// ── Harness ──────────────────────────────────────────────────────────────────────────────────

/** The exact ban set A-078's ceiling sweep uses — the A-060 restatement's ×/÷ family. */
const MUL_DIV_SKILLS: ReadonlySet<SkillId> = new Set([
  'mult_facts',
  'div_facts',
  'multi_digit_mult',
  'long_division',
]);

const SWEEP_SEEDS = Array.from({ length: 30 }, (_, i) => 1000 + i * 7919);

/** A captain the real onboarding would produce: placement islands + band-lawful guns (D-6/D-9/D-10). */
function onboarded(band: GradeBand): Captain {
  const store = createCaptainStore();
  store.getState().setGradeBand(band);
  return store.getState().captain;
}

/** A dealable (non-mystery) shipped fleet ship of the given kind — dealt dynamically, never hardcoded. */
function shippedShipOfKind(kind: GenIslandDoc['presentationKind']): string {
  const ship = generatedFleet.find((doc) => doc.kind === kind && !isMysteryShip(doc));
  if (ship === undefined) throw new Error(`no dealable shipped ship of kind '${kind}'`);
  return ship.id;
}

/** A schema-legal hand-built doc — the hostile-input channel (band is NOT a schema field). */
function legalDoc(over: Partial<GenIslandDoc> = {}): GenIslandDoc {
  const kind = over.presentationKind ?? 'pirate';
  return genIslandSchema.parse({
    id: 'gen_isle_6',
    index: 6,
    seed: 4242,
    displayName: 'The Gilded Reach',
    skills: ['add_within_10'],
    recipe: 'twin',
    pieces: [{ piece: 'palms', slot: 'shore' }],
    mood: 'dawn_gold',
    presentationKind: kind,
    rivalDocId: shippedShipOfKind(kind),
    hull: 150,
    ...over,
  });
}

/**
 * Drives a fresh session through `volleys` player questions with a fixed script — correct
 * answer, 1000 ms, rival always misses — recording each question. Pure of the clock: every
 * elapsedMs is data, so two walks of the same doc are the D-15 determinism claim itself.
 */
function walkQuestions(doc: GenIslandDoc, captain: Captain, volleys: number): string[] {
  const session = openUnchartedDuel(doc, captain);
  const questions: string[] = [];

  for (let guard = 0; guard < 600 && questions.length < volleys; guard += 1) {
    const state = session.getState();
    const core = state.core;
    if (core.phase === 'victory' || core.phase === 'defeat') break;

    if (state.phase === 'select' && core.phase === 'playerChoose') {
      session.dispatch({ type: 'CANNON_SELECTED', cannonId: core.playerLoadout[0]! });
      continue;
    }
    if (state.phase === 'question' && core.phase === 'reload') {
      questions.push(
        `${core.question.templateId}|${core.question.text}|${core.question.choices
          .map((choice) => choice.value)
          .join(',')}`,
      );
      session.dispatch({
        type: 'ANSWER_CHOSEN',
        choiceIndex: core.question.correctIndex,
        elapsedMs: 1000,
      });
      continue;
    }
    if (core.phase === 'rivalTurn' && state.phase === 'watch') {
      session.dispatch({
        type: 'RIVAL_RESULT',
        turnToken: core.turnToken,
        volley: { cannonId: core.rivalLoadout[0]!, correct: false, elapsedMs: 900 },
      });
      continue;
    }
    session.dispatch({ type: 'ADVANCE', beatToken: state.beatToken });
  }

  return questions;
}

// ── AST helpers (the duel-context suite's pattern) ───────────────────────────────────────────

function sourceFile(relativePath: string): ts.SourceFile {
  const source = readFileSync(join(REPO_ROOT, relativePath), 'utf8');
  return ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
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

function functionBody(name: string): string {
  const file = sourceFile(DUEL_PATH);
  return namedFunction(file, name).body.getText(file);
}

beforeEach(() => {
  disarmUnchartedDuel();
});

// ── AC-1: a legal engine boot, anchored, hull-overridden, deterministic ──────────────────────

describe('A-080 AC-1 — the anchor mapping boots the frozen engine', () => {
  it('spec(A-080:AC-1) unchartedConfig passes the real validateConfig for a 30-seed × 3-band sweep of A-078 docs', () => {
    for (const band of GRADE_BANDS) {
      const captain = onboarded(band);
      for (const seed of SWEEP_SEEDS) {
        const doc = generateIsland(seed, 6, band);
        const config = unchartedConfig(doc, captain);

        // `createDuelState` runs `validateConfig` before building — not throwing IS the proof.
        const state = createDuelState(config);
        expect(state.phase).toBe('countdown');
        expect(state.islandId).toBe(UNCHARTED_ANCHOR_ISLAND);
        expect(state.duelId).toBe(`gduel_6_${(seed >>> 0).toString(36)}`);
        expect(state.playerHull).toBe(PLAYER_HULL);
        expect(state.playerHullFloor).toBe(0);
      }
    }
  });

  it("spec(A-080:AC-1) the built core's enemyMaxHull is doc.hull — the anchor's own table row is never read", () => {
    for (const band of GRADE_BANDS) {
      const captain = onboarded(band);
      for (const index of [6, 12, 40]) {
        const doc = generateIsland(2026, index, band);
        const state = createDuelState(unchartedConfig(doc, captain));
        expect(state.enemyHull).toBe(doc.hull);
        expect(state.enemyMaxHull).toBe(doc.hull);
        // The override is observable: every frontier hull sits strictly above the Grandline's.
        expect(doc.hull).toBeGreaterThan(ENEMY_HULL_BY_ISLAND.grandline);
        expect(state.enemyMaxHull).not.toBe(ENEMY_HULL_BY_ISLAND[UNCHARTED_ANCHOR_ISLAND]);
      }
    }
  });

  it("spec(A-080:AC-1) the player filter is the real boot's own rule — inBandLoadout over equipped, catalog fallback through the same ceiling", () => {
    for (const band of GRADE_BANDS) {
      const captain = onboarded(band);
      const doc = generateIsland(7, 6, band);
      expect(unchartedConfig(doc, captain).playerLoadout).toEqual([
        ...inBandLoadout(captain.equippedCannons, band),
      ]);

      const bare: Captain = { ...captain, equippedCannons: [] };
      expect(unchartedConfig(doc, bare).playerLoadout).toEqual([
        ...inBandLoadout(cannons.map((cannon) => cannon.id), band),
      ]);
    }
  });

  it('spec(A-080:AC-1) same doc + same seed → the identical question sequence (D-15: determinism as test infrastructure)', () => {
    for (const band of GRADE_BANDS) {
      const captain = onboarded(band);
      const doc = generateIsland(31337, 6, band);
      const first = walkQuestions(doc, captain, 4);
      const second = walkQuestions(doc, captain, 4);
      expect(first.length).toBeGreaterThanOrEqual(3);
      expect(second).toEqual(first);
    }
  });

  it('spec(A-080:AC-1) gduel ids are their own grammar and never collide across the frontier', () => {
    const ids = new Set<string>();
    for (const seed of SWEEP_SEEDS.slice(0, 10)) {
      for (const index of [6, 7, 12]) {
        const doc = generateIsland(seed, index, 'g2_3');
        const id = unchartedDuelId(doc);
        expect(id).toMatch(/^gduel_[0-9]+_[0-9a-z]+$/);
        // Never the authored `duel-<seed36>` grammar — a settlement receipt cannot collide.
        expect(id.startsWith('duel-')).toBe(false);
        ids.add(id);
      }
    }
    expect(ids.size).toBe(30);
  });
});

// ── AC-2: the ceiling holds in the tray ──────────────────────────────────────────────────────

describe('A-080 AC-2 — the band ceiling holds on both decks', () => {
  it('spec(A-080:AC-2) every player gun and every rival gun sits at or under the band ceiling, all bands swept', () => {
    for (const band of GRADE_BANDS) {
      const captain = onboarded(band);
      for (const seed of SWEEP_SEEDS.slice(0, 12)) {
        const doc = generateIsland(seed, 6, band);
        const config = unchartedConfig(doc, captain);
        const docSkills = new Set<SkillId>(doc.skills);

        expect(config.playerLoadout.length).toBeGreaterThan(0);
        expect(config.rivalLoadout.length).toBeGreaterThan(0);
        for (const id of [...config.playerLoadout, ...config.rivalLoadout]) {
          expect(asksInBand(getCannon(id), band), `${id} at ${band}`).toBe(true);
        }
        // The rival asks the doc's own mathematics, nothing else.
        for (const id of config.rivalLoadout) {
          expect(docSkills.has(getCannon(id).skill)).toBe(true);
        }
      }
    }
  });

  it('spec(A-080:AC-2) a k_1 gen duel never renders ×/÷ — the A-060 restatement, swept', () => {
    const captain = onboarded('k_1');
    for (const seed of SWEEP_SEEDS) {
      const doc = generateIsland(seed, 6, 'k_1');
      const config = unchartedConfig(doc, captain);
      for (const id of [...config.playerLoadout, ...config.rivalLoadout]) {
        expect(MUL_DIV_SKILLS.has(getCannon(id).skill)).toBe(false);
        expect(getSkill(getCannon(id).skill).minGrade).toBeLessThanOrEqual(maxGradeForBand('k_1'));
      }
    }
  });

  it('spec(A-080:AC-2) a hostile doc claiming over-band mathematics loses exactly those guns at the last gate', () => {
    // Schema-legal (a schema has no band) — the band clause here is the only wall left.
    const mixed = legalDoc({ skills: ['add_within_10', 'mult_facts'] });
    const loadout = unchartedRivalLoadout(mixed, 'k_1');
    expect(loadout.length).toBeGreaterThan(0);
    for (const id of loadout) {
      expect(getCannon(id).skill).toBe('add_within_10');
    }
    expect(loadout.some((id) => getCannon(id).skill === 'mult_facts')).toBe(false);

    // Every skill over the band → no guns → fail CLOSED, never a silent fallback duel.
    const hostile = legalDoc({ skills: ['mult_facts', 'div_facts'] });
    expect(() => unchartedRivalLoadout(hostile, 'k_1')).toThrow(RangeError);
    expect(() => unchartedConfig(hostile, onboarded('k_1'))).toThrow(RangeError);

    // No band, no guns — the deriveRivalLoadout posture exactly.
    expect(() => unchartedRivalLoadout(mixed, null)).toThrow(RangeError);
  });

  it("spec(A-080:AC-2) a hostile save's over-band gun never sails on the player deck", () => {
    const doc = generateIsland(99, 6, 'k_1');
    const captain = onboarded('k_1');

    const smuggled: Captain = { ...captain, equippedCannons: [...captain.equippedCannons, 'mortar'] };
    const config = unchartedConfig(doc, smuggled);
    expect(config.playerLoadout).not.toContain('mortar');
    expect(config.playerLoadout).toContain('swivel_gun');

    // ONLY out-of-band equipped → the catalog fallback, through the same ceiling.
    const stranded: Captain = { ...captain, equippedCannons: ['mortar'] };
    const fallback = unchartedConfig(doc, stranded);
    expect(fallback.playerLoadout).toEqual([...inBandLoadout(cannons.map((c) => c.id), 'k_1')]);
    expect(fallback.playerLoadout).not.toContain('mortar');
  });
});

// ── AC-3: the anchor never reaches a child's eyes ────────────────────────────────────────────

describe('A-080 AC-3 — the screen never leaks the anchor', () => {
  it("spec(A-080:AC-3) the projected HUD name is doc.displayName and never the Grandline's band name", () => {
    for (const band of GRADE_BANDS) {
      const captain = onboarded(band);
      for (const seed of SWEEP_SEEDS.slice(0, 10)) {
        const doc = generateIsland(seed, 6, band);
        const view = projectUnchartedView(openUnchartedDuel(doc, captain).getState(), doc);
        expect(view.islandName).toBe(doc.displayName);
        for (const anyBand of GRADE_BANDS) {
          expect(view.islandName).not.toBe(
            islandCurriculumFor(UNCHARTED_ANCHOR_ISLAND, anyBand).displayName,
          );
        }
      }
    }
  });

  it('spec(A-080:AC-3) the gen view carries no island id at all — pinned key set', () => {
    const captain = onboarded('g2_3');
    const doc = generateIsland(5, 6, 'g2_3');
    const view = projectUnchartedView(openUnchartedDuel(doc, captain).getState(), doc);
    expect('islandId' in view).toBe(false);
    expect(Object.keys(view).sort()).toEqual([
      'asked',
      'beatToken',
      'cannon',
      'coins',
      'duelId',
      'islandName',
      'outcome',
      'perfects',
      'phase',
      'playerHull',
      'playerMax',
      'question',
      'right',
      'rivalDamage',
      'rivalHull',
      'rivalMax',
      'turn',
      'turnToken',
    ]);
    expect(view.duelId).toBe(unchartedDuelId(doc));
    expect(view.rivalMax).toBe(doc.hull);
    expect(view.playerMax).toBe(PLAYER_HULL);
  });

  it("spec(A-080:AC-3) rival identity is the doc's dealt fleet ship wearing the kind's frozen channels", () => {
    for (const kind of ['pirate', 'skeleton', 'ghost', 'shark', 'kraken'] as const) {
      const doc = legalDoc({ presentationKind: kind });
      const ship = unchartedFleetDoc(doc);
      const presentation = unchartedRivalPresentation(doc);
      const enemyRow = enemies.find((enemy) => enemy.presentationKind === kind)!;
      const base = enemyPresentationFor(enemyRow);

      expect(ship.id).toBe(doc.rivalDocId);
      expect(presentation.kind).toBe(kind);
      expect(presentation.displayName).toBe(ship.displayName);
      expect(presentation.textChannel.startsWith(`${ship.displayName} · `)).toBe(true);
      // The kind's frozen shape/accent channels ride through untouched.
      expect(presentation.shapeChannel).toBe(base.shapeChannel);
      expect(presentation.accent).toBe(base.accent);
      if (kind === 'ghost') {
        expect(presentation.ghostOpacity).toBe(base.ghostOpacity);
        expect(presentation.ghostGlow).toBe(base.ghostGlow);
      }
      if (kind === 'kraken') {
        // The frozen kraken-has-no-cosmetics pin holds on the gen path too.
        expect(presentation.cosmetics).toBeNull();
      } else {
        expect(presentation.cosmetics).not.toBeNull();
        expect(presentation.cosmetics).not.toHaveProperty('sailStripe');
      }
    }
  });

  it("spec(A-080:AC-3) the doc-path paint deep-equals the authored variant dealer's for the same ship — no silent drift", () => {
    for (const kind of ['pirate', 'skeleton', 'ghost', 'shark'] as const) {
      const doc = legalDoc({ presentationKind: kind });
      const ship = unchartedFleetDoc(doc);
      const islandId = enemies.find((enemy) => enemy.presentationKind === kind)!.islandId;

      // Probe duel ids until the authored dealer deals exactly this ship (pools are ≤5 wide).
      let matched = null;
      for (let probe = 0; probe < 500 && matched === null; probe += 1) {
        const variant = rivalVariantFor(islandId, `probe-${probe}`);
        if (variant.shipId === ship.id) matched = variant;
      }
      expect(matched, `no probe dealt ${ship.id} at ${islandId}`).not.toBeNull();
      expect(unchartedRivalPresentation(doc).cosmetics).toEqual(matched!.cosmetics);
    }
  });

  it("spec(A-080:AC-3) crew is the ship's own sailor — crewFor(doc.rivalDocId) — and a kraken fields none", () => {
    for (const kind of ['pirate', 'skeleton', 'ghost', 'shark'] as const) {
      const doc = legalDoc({ presentationKind: kind });
      expect(unchartedCrewFor(doc)).toEqual(crewFor(doc.rivalDocId));
    }
    expect(unchartedCrewFor(legalDoc({ presentationKind: 'kraken' }))).toBeNull();
  });

  it('spec(A-080:AC-3) the gen body wires the doc name into the turn bar and consults no island lookup', () => {
    const body = functionBody('UnchartedDuelBody');

    expect(body).toMatch(/projectUnchartedView/);
    expect(body).toMatch(/turnLabel\(view\.phase, view\.islandName\)/);
    expect(body).toMatch(/unchartedRivalPresentation/);
    // The rival's per-turn guns are the session core's doc-derived loadout.
    expect(body).toMatch(/loadout: core\.rivalLoadout/);

    // Every island-keyed authored lookup is absent — they throw on gen ids or mint the anchor.
    expect(body).not.toMatch(/state\.islandName/);
    expect(body).not.toMatch(/islandCurriculumFor/);
    expect(body).not.toMatch(/getEnemyForIsland/);
    expect(body).not.toMatch(/rivalVariantFor/);
    expect(body).not.toMatch(/deriveRivalLoadout/);
    expect(body).not.toMatch(/resolveDuelContext/);
    expect(body).not.toMatch(/initialDuelState/);
    expect(body).not.toMatch(/grandline/);
  });
});

// ── AC-4: the authored path is untouched and the branch has one door ─────────────────────────

describe('A-080 AC-4 — the authored path stays byte-identical and the flag is the only door', () => {
  it('spec(A-080:AC-4) the boot flag: dark by default, armed by parse, consumed by disarm, hostile arm leaves it dark', () => {
    expect(armedUnchartedDoc()).toBeNull();

    const doc = legalDoc();
    const armed = armUnchartedDuel(doc);
    expect(armed).toEqual(doc);
    expect(armedUnchartedDoc()).toEqual(doc);

    disarmUnchartedDuel();
    expect(armedUnchartedDoc()).toBeNull();

    // A hostile document cannot arm — and a FAILED arm never leaves a stale island armed.
    armUnchartedDuel(doc);
    expect(() => armUnchartedDuel({ ...doc, glyph: '×' })).toThrow();
    expect(armedUnchartedDoc()).toBeNull();
    expect(() => armUnchartedDuel('banana')).toThrow();
    expect(armedUnchartedDoc()).toBeNull();
  });

  it('spec(A-080:AC-4) the screen branches on the armed flag and reads no route params — the no-route-params law', () => {
    const source = readFileSync(join(REPO_ROOT, DUEL_PATH), 'utf8');
    expect(source).not.toMatch(/useLocalSearchParams|useGlobalSearchParams|useSearchParams/);

    const screen = functionBody('DuelScreen');
    expect(screen).toMatch(/armedUnchartedDoc/);
    expect(screen).toMatch(/genDoc === null \? <DuelBody \/> : <UnchartedDuelBody doc=\{genDoc\} \/>/);

    // The gen body consumes the flag, so an unarmed (re-)entry can only be authored.
    expect(functionBody('UnchartedDuelBody')).toMatch(/disarmUnchartedDuel\(\)/);
  });

  it('spec(A-080:AC-4) the authored body never learns the namespace and keeps its own gate', () => {
    const body = functionBody('DuelBody');
    expect(body).not.toMatch(/[Uu]ncharted/);
    expect(body).not.toMatch(/gen_isle|gduel/);
    expect(body).toMatch(/resolveDuelContext/);
    expect(body).toMatch(/Redirect[^]*?\/chart/s);
  });

  it('spec(A-080:AC-4) the pinned boot modules never import the gen namespace', () => {
    for (const pinned of ['src/stores/duel.ts', 'src/services/duelContext.ts']) {
      const source = readFileSync(join(REPO_ROOT, pinned), 'utf8');
      expect(source).not.toMatch(/from\s+['"][^'"]*(genIsland|uncharted)/);
      expect(source).not.toMatch(/gen_isle|gduel_/);
    }
  });

  it("spec(A-080:AC-4) the gen branch never settles through the authored path — A-081's door stays shut", () => {
    // Settling from the gen body would run `settleDuelRewards` off the PARKED bus island and
    // mark an authored ship met (design §2 S3, the shelf lie). Until A-081's `fleet:'hold'`
    // lands, the gen body touches the mercy ledger only.
    const body = functionBody('UnchartedDuelBody');
    expect(body).not.toMatch(/applyDuelOutcome/);
    expect(body).not.toMatch(/settleDuelRewards/);
    expect(body).toMatch(/recordDuelResult/);
  });
});
