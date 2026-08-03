/**
 * A-028 — cross-island training catalog and exact drill selection.
 *
 * The range picker must surface every age-eligible skill from every unlocked island, not only the
 * current island's list. Pure catalog logic lives in `src/services/trainingCatalog.ts`;
 * `app/range.tsx` consumes it and passes the chosen island/skill pair to `openDrill`.
 *
 * RE-BASELINED under owner ruling **D-14** (2026-08-02, `tickets/app/OWNER-RULINGS.md`, applied
 * by A-070): an island's drillable skills are its CELL for the captain's band
 * (`islandCurriculumFor`) — the shared `rangeSkills` no longer exists. The oracle below reads
 * cells; the g2_3 fixtures name the cell skills (Port Sumwich trains `place_value_compare`,
 * Isla Products `two_step_add_sub`); and the old "an island with nothing in-band yields an
 * empty catalog" case is unrepresentable — every cell teaches every band (A-069's validator) —
 * so the empty state is reached the way a captain can really reach it: no islands unlocked.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { getSkill, islandCurriculumFor, islands } from '@content/index';
import type { GradeBand, IslandId, SkillId } from '@content/schemas';
import { answerDrill } from '@engine/drill';
import { maxGradeForBand } from '@engine/placement';
import { createRng } from '@engine/rng';
import { commitDrill, openDrill } from '../../src/services/range';
import { createCaptainStore, emptyCaptain, type Captain } from '../../src/stores/player';

const REPO_ROOT = join(import.meta.dirname, '../..');
const RANGE_PATH = 'app/range.tsx';
const TRAINING_CATALOG_MODULE = '../../src/services/trainingCatalog.ts';

const MAX_GRADE_BY_BAND: Readonly<Record<GradeBand, number>> = { k_1: 1, g2_3: 3, g4_5: 5 };

interface TrainingEntry {
  readonly islandId: IslandId;
  readonly skillId: SkillId;
}

interface TrainingGroup {
  readonly islandId: IslandId;
  readonly isCurrentIsland: boolean;
  readonly entries: readonly TrainingEntry[];
}

type TrainingCatalog = (input: {
  readonly unlockedIslands: readonly IslandId[];
  readonly currentIsland: IslandId | null;
  readonly gradeBand: GradeBand;
}) => readonly TrainingGroup[];

async function loadTrainingCatalog(): Promise<{ readonly trainingCatalog: TrainingCatalog }> {
  let loaded: unknown;
  try {
    loaded = await import(/* @vite-ignore */ TRAINING_CATALOG_MODULE);
  } catch {
    loaded = undefined;
  }
  expect(loaded, 'A-028 is RED: src/services/trainingCatalog.ts must export trainingCatalog').toBeDefined();
  const candidate = loaded as { readonly trainingCatalog?: unknown };
  expect(candidate.trainingCatalog, 'trainingCatalog must be a function').toBeTypeOf('function');
  return candidate as { readonly trainingCatalog: TrainingCatalog };
}

function expectedEntries(
  unlockedIslands: readonly IslandId[],
  band: GradeBand,
): readonly TrainingEntry[] {
  const maxGrade = MAX_GRADE_BY_BAND[band];
  const unlocked = new Set(unlockedIslands);
  const seen = new Set<SkillId>();
  const entries: TrainingEntry[] = [];

  for (const island of [...islands].sort((a, b) => a.order - b.order)) {
    if (!unlocked.has(island.id)) continue;
    // The band's own cell (D-14) — never a shared island-wide list, which no longer exists.
    for (const skillId of islandCurriculumFor(island.id, band).skills) {
      if (seen.has(skillId)) continue;
      if (getSkill(skillId).minGrade > maxGrade) continue;
      seen.add(skillId);
      entries.push({ islandId: island.id, skillId });
    }
  }
  return entries;
}

function captain(over: Partial<Captain> = {}): Captain {
  return {
    ...emptyCaptain(),
    gradeBand: 'g2_3',
    unlockedIslands: ['port_sumwich', 'isla_products'],
    currentIsland: 'isla_products',
    ...over,
  };
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

function flattenGroups(groups: readonly TrainingGroup[]): readonly TrainingEntry[] {
  return groups.flatMap((group) => group.entries);
}

describe('A-028 training catalog', () => {
  it('spec(A-028:AC-1) every distinct eligible skill from unlocked islands appears exactly once with its island', async () => {
    const { trainingCatalog } = await loadTrainingCatalog();
    const unlocked: readonly IslandId[] = ['port_sumwich', 'isla_products', 'quotient_cove'];
    const band: GradeBand = 'g2_3';

    const groups = trainingCatalog({
      unlockedIslands: unlocked,
      currentIsland: 'isla_products',
      gradeBand: band,
    });
    const actual = flattenGroups(groups);
    const expected = expectedEntries(unlocked, band);

    expect(actual).toEqual(expected);
    expect(new Set(actual.map((entry) => entry.skillId)).size).toBe(actual.length);
    for (const entry of actual) {
      expect(getSkill(entry.skillId).minGrade).toBeLessThanOrEqual(MAX_GRADE_BY_BAND[band]);
    }
  });

  it('spec(A-028:AC-2) a later island captain still sees an earlier warm-up skill without changing islands', async () => {
    const { trainingCatalog } = await loadTrainingCatalog();
    const groups = trainingCatalog({
      unlockedIslands: ['port_sumwich', 'isla_products'],
      currentIsland: 'isla_products',
      gradeBand: 'g2_3',
    });
    const entries = flattenGroups(groups);

    // The g2_3 cells (D-14): Port Sumwich trains `place_value_compare`, Isla Products
    // `two_step_add_sub` — the earlier island's rack stays on the menu after sailing on.
    expect(
      entries.some((entry) => entry.islandId === 'port_sumwich' && entry.skillId === 'place_value_compare'),
    ).toBe(true);
    expect(
      entries.some((entry) => entry.islandId === 'isla_products' && entry.skillId === 'two_step_add_sub'),
    ).toBe(true);
    expect(groups.find((group) => group.islandId === 'isla_products')?.isCurrentIsland).toBe(true);
    expect(groups.find((group) => group.islandId === 'port_sumwich')?.isCurrentIsland).toBe(false);
  });

  it('spec(A-028:AC-4) the selected card opens a drill with that exact island and skill pair', async () => {
    const { trainingCatalog } = await loadTrainingCatalog();
    const store = createCaptainStore(captain());
    const groups = trainingCatalog({
      unlockedIslands: store.getState().captain.unlockedIslands,
      currentIsland: 'isla_products',
      gradeBand: 'g2_3',
    });
    // The earlier island's g2_3 warm-up (D-14): Port Sumwich's cell trains `place_value_compare`.
    const warmUp = flattenGroups(groups).find(
      (entry) => entry.islandId === 'port_sumwich' && entry.skillId === 'place_value_compare',
    );
    expect(warmUp, 'fixture must include port_sumwich/place_value_compare').toBeDefined();

    const session = openDrill({
      islandId: warmUp!.islandId,
      skillId: warmUp!.skillId,
      captain: store.getState().captain,
      rng: createRng(28),
      length: 2,
    });
    expect(session.skillId).toBe('place_value_compare');

    let live = session;
    while (!live.complete) {
      live = answerDrill(live, live.current!.correctIndex, 500);
    }
    const outcome = commitDrill(store, live);
    expect(outcome.applied).toBe(true);
    expect(outcome.skillId).toBe('place_value_compare');
    expect(store.getState().captain.currentIsland).toBe('isla_products');
  });

  it('spec(A-028:AC-4) range.tsx passes the picked entry island into openDrill, not the chart island', () => {
    const file = sourceFile(RANGE_PATH);
    const picker = namedFunction(file, 'SkillPicker');
    const source = picker.body.getText(file);

    expect(source).toMatch(/trainingCatalog/);
    expect(source).not.toMatch(/rangeSkills\s*\(/);
    expect(source).toMatch(/openDrill\s*\(\s*\{[^}]*islandId\s*:/s);
    expect(source).not.toMatch(/openDrill\s*\(\s*\{[^}]*islandId\s*,\s*skillId\s*,\s*captain[^}]*\}\s*\)/);
  });

  it('spec(A-028:AC-5) no eligible entries yields an empty catalog', async () => {
    // D-14 re-baseline: the old fixture ("grandline at k_1") relied on an island that taught a
    // band nothing — a state A-069's validator now forbids (every cell teaches every band). The
    // empty state a captain can really reach is holding no islands at all.
    const { trainingCatalog } = await loadTrainingCatalog();
    const groups = trainingCatalog({
      unlockedIslands: [],
      currentIsland: null,
      gradeBand: 'k_1',
    });
    expect(flattenGroups(groups)).toEqual([]);
  });

  it('spec(A-028:AC-5) an empty catalog shows a safe return to the chart and never silently drills a fallback skill', () => {
    const file = sourceFile(RANGE_PATH);
    const picker = namedFunction(file, 'SkillPicker');
    const source = picker.body.getText(file);

    expect(source).toMatch(/trainingCatalog/);
    expect(source).toMatch(/router\.back\s*\(\s*\)/);
    expect(source).not.toMatch(/swivel_gun/);
    expect(source).not.toMatch(/openDrill\s*\(\s*\{[^}]*skillId\s*:\s*['"]/);
  });

  it('spec(A-028:AC-1) never offers a skill above the captain band ceiling', async () => {
    const { trainingCatalog } = await loadTrainingCatalog();
    const groups = trainingCatalog({
      unlockedIslands: ['port_sumwich', 'isla_products', 'quotient_cove', 'fraction_reef', 'grandline'],
      currentIsland: 'grandline',
      gradeBand: 'k_1',
    });
    const maxGrade = maxGradeForBand('k_1');
    for (const entry of flattenGroups(groups)) {
      expect(getSkill(entry.skillId).minGrade).toBeLessThanOrEqual(maxGrade);
    }
  });
});
