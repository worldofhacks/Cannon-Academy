/**
 * A-024 — chart presentation follows actual placement/mastery progress.
 *
 * The component suite has no React Native renderer, so the behavior contract is split at two
 * deterministic seams: `chartNodes`/`stationState` own progress state, and `stationAffordance`
 * owns the accessibility/tap contract consumed by `StationMarker`. Source checks use the
 * TypeScript AST so comments, dead strings, and renamed import aliases cannot satisfy them.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { islands } from '../../src/content';
import type { IslandId, SkillId } from '../../src/content/schemas';
import { applyAnswer, emptyMastery, isMastered, type SkillMastery } from '../../src/engine/mastery';
import { resolvePlacement } from '../../src/engine/placement';
import { STATIONS } from '../../src/components/chart/board';
import * as layout from '../../src/components/chart/layout';
import { stationState } from '../../src/components/chart/layout';
import { chartNodes, requirementText, type ChartNode } from '../../src/services/chart';
import { emptyCaptain, type Captain } from '../../src/stores/player';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FIVE_STATES = ['current', 'available', 'cleared', 'locked-near', 'far-silhouette'] as const;
type ExpectedStationState = (typeof FIVE_STATES)[number];

interface ProgressNode extends ChartNode {
  readonly cleared?: boolean;
}

interface StationAffordance {
  readonly accessibilityLabel: string;
  readonly tappable: boolean;
}

type StationAffordanceSelector = (
  node: ChartNode,
  state: ExpectedStationState,
  requirement: string | null,
) => StationAffordance;

const stationAffordance = (layout as unknown as { readonly stationAffordance?: StationAffordanceSelector })
  .stationAffordance;

function captain(overrides: Partial<Captain> = {}): Captain {
  return { ...emptyCaptain(), ...overrides };
}

function masteredRecord(): SkillMastery {
  let record = emptyMastery;
  while (!isMastered(record)) record = applyAnswer(record, 'range', true);
  return record;
}

function masteryFor(skillIds: readonly SkillId[]): Captain['mastery'] {
  return Object.fromEntries(skillIds.map((skillId) => [skillId, masteredRecord()])) as Captain['mastery'];
}

function nodeById(nodes: readonly ChartNode[], id: IslandId): ChartNode {
  const node = nodes.find((candidate) => candidate.island.id === id);
  if (node === undefined) throw new Error(`fixture: chart omitted ${id}`);
  return node;
}

function stateFor(nodes: readonly ChartNode[], id: IslandId, focus: boolean): unknown {
  const index = nodes.findIndex((node) => node.island.id === id);
  const station = STATIONS[index];
  if (index < 0 || station === undefined) throw new Error(`fixture: no board station for ${id}`);
  return stationState(nodes[index]!, station, focus);
}

function sourceFile(relativePath: string): ts.SourceFile {
  const absolutePath = join(REPO_ROOT, relativePath);
  return ts.createSourceFile(
    relativePath,
    readFileSync(absolutePath, 'utf8'),
    ts.ScriptTarget.ESNext,
    true,
    relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function visit(node: ts.Node, inspect: (candidate: ts.Node) => void): void {
  inspect(node);
  ts.forEachChild(node, (child) => visit(child, inspect));
}

function jsxTagParts(name: ts.JsxTagNameExpression): readonly string[] {
  if (ts.isIdentifier(name)) return [name.text];
  if (ts.isPropertyAccessExpression(name)) {
    const left = jsxTagParts(name.expression as ts.JsxTagNameExpression);
    return [...left, name.name.text];
  }
  return [name.getText()];
}

function importedJsxExports(
  file: ts.SourceFile,
  moduleName: string,
): {
  readonly named: ReadonlyMap<string, string>;
  readonly namespaces: ReadonlySet<string>;
} {
  const named = new Map<string, string>();
  const namespaces = new Set<string>();

  for (const statement of file.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== moduleName
    ) {
      continue;
    }

    const clause = statement.importClause;
    if (clause?.name !== undefined) named.set(clause.name.text, 'Svg');
    const bindings = clause?.namedBindings;
    if (bindings === undefined) continue;
    if (ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
    } else {
      for (const element of bindings.elements) {
        named.set(element.name.text, element.propertyName?.text ?? element.name.text);
      }
    }
  }
  return { named, namespaces };
}

function usedExports(file: ts.SourceFile, moduleName: string): readonly string[] {
  const imports = importedJsxExports(file, moduleName);
  const result: string[] = [];
  visit(file, (node) => {
    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return;
    const parts = jsxTagParts(node.tagName);
    const direct = parts.length === 1 ? imports.named.get(parts[0]!) : undefined;
    if (direct !== undefined) result.push(direct);
    if (parts.length === 2 && imports.namespaces.has(parts[0]!)) result.push(parts[1]!);
  });
  return result;
}

function requireAffordance(): StationAffordanceSelector | undefined {
  expect(
    stationAffordance,
    'layout.ts must export the pure stationAffordance seam used by StationMarker',
  ).toBeTypeOf('function');
  return stationAffordance;
}

describe('A-024 chart progress presentation', () => {
  it('spec(A-024:AC-1) grade 2–3 placement islands stay available and uncleared before mastery', () => {
    const placement = resolvePlacement('g2_3');
    const currentIsland = placement.unlockedIslands[0];
    if (currentIsland === undefined) throw new Error('fixture: grade 2–3 placement opened no island');

    const nodes = chartNodes(
      captain({
        gradeBand: 'g2_3',
        unlockedIslands: [...placement.unlockedIslands],
        currentIsland,
        mastery: {},
      }),
    ) as readonly ProgressNode[];
    const available = nodes.filter((node) => !node.fogged && !node.isCurrent);

    expect(available.length).toBeGreaterThan(0);
    expect(available.map((node) => node.island.id)).toEqual(
      placement.unlockedIslands.filter((id) => id !== currentIsland),
    );
    expect(available.every((node) => node.cleared === false)).toBe(true);
    expect(
      available.map((node) => stateFor(nodes, node.island.id, false)),
      'pre-unlocked is not synonymous with mastered',
    ).toEqual(available.map(() => 'available'));
  });

  it('spec(A-024:AC-2) only a noncurrent island with every real range skill mastered is cleared', () => {
    const placement = resolvePlacement('g2_3');
    const target = islands.find((island) => placement.unlockedIslands.includes(island.id));
    const currentIsland = placement.unlockedIslands.find((id) => id !== target?.id);
    if (target === undefined || currentIsland === undefined) {
      throw new Error('fixture: grade 2–3 placement needs two catalog islands');
    }

    const nodes = chartNodes(
      captain({
        gradeBand: 'g2_3',
        unlockedIslands: [...placement.unlockedIslands],
        currentIsland,
        mastery: masteryFor(target.rangeSkills),
      }),
    ) as readonly ProgressNode[];
    const openNoncurrent = nodes.filter((node) => !node.fogged && !node.isCurrent);

    expect(openNoncurrent.filter((node) => node.cleared).map((node) => node.island.id)).toEqual([target.id]);
    expect(stateFor(nodes, target.id, false)).toBe('cleared');
    expect(
      openNoncurrent
        .filter((node) => node.island.id !== target.id)
        .map((node) => stateFor(nodes, node.island.id, false)),
    ).toEqual(openNoncurrent.filter((node) => node.island.id !== target.id).map(() => 'available'));
  });

  it('spec(A-024:AC-2) current presentation wins even when that island is fully mastered', () => {
    const placement = resolvePlacement('g2_3');
    const id = placement.unlockedIslands[0];
    if (id === undefined) throw new Error('fixture: grade 2–3 placement opened no island');
    const island = islands.find((candidate) => candidate.id === id);
    if (island === undefined) throw new Error(`fixture: catalog omitted ${id}`);

    const nodes = chartNodes(
      captain({
        gradeBand: 'g2_3',
        unlockedIslands: [...placement.unlockedIslands],
        currentIsland: id,
        mastery: masteryFor(island.rangeSkills),
      }),
    );

    expect(stateFor(nodes, id, true)).toBe('current');
  });

  it('spec(A-024:AC-3) fog uses imported edge-free blobs without an Svg or Rect wash', () => {
    const fog = sourceFile('src/components/chart/Fog.tsx');
    const svgExports = usedExports(fog, 'react-native-svg');
    const blobExports = usedExports(fog, './Blob');

    expect(svgExports.filter((name) => name === 'Svg' || name === 'Rect')).toEqual([]);
    expect(blobExports.filter((name) => name === 'Blob').length).toBeGreaterThan(0);
  });

  it('spec(A-024:AC-3) fogged accessibility keeps the island name and readable requirement', () => {
    const selectAffordance = requireAffordance();
    if (selectAffordance === undefined) return;
    const nodes = chartNodes(captain({ unlockedIslands: ['port_sumwich'] }));
    const locked = nodeById(nodes, 'isla_products');
    const requirement = requirementText(locked);
    if (requirement === null) throw new Error('fixture: fogged island has no requirement');

    for (const state of ['locked-near', 'far-silhouette'] as const) {
      const affordance = selectAffordance(locked, state, requirement);
      expect(affordance.accessibilityLabel).toContain(locked.island.displayName);
      expect(affordance.accessibilityLabel).toContain(requirement);
    }
  });

  it('spec(A-024:AC-4) current, available, cleared, locked-near, and far states are exhaustive', () => {
    const unlocked = chartNodes(
      captain({ unlockedIslands: ['port_sumwich'], currentIsland: 'port_sumwich' }),
    );
    const cleared = chartNodes(
      captain({
        unlockedIslands: ['port_sumwich'],
        mastery: masteryFor(nodeById(unlocked, 'port_sumwich').island.rangeSkills),
      }),
    );

    const actual = [
      stateFor(unlocked, 'port_sumwich', true),
      stateFor(chartNodes(captain({ unlockedIslands: ['port_sumwich'] })), 'port_sumwich', false),
      stateFor(cleared, 'port_sumwich', false),
      stateFor(unlocked, 'isla_products', false),
      stateFor(unlocked, 'fraction_reef', false),
    ];

    expect(actual).toEqual(FIVE_STATES);
    expect(new Set(actual).size).toBe(FIVE_STATES.length);
  });

  it('spec(A-024:AC-4) every state has a distinct label and only unfogged states are tappable', () => {
    const selectAffordance = requireAffordance();
    if (selectAffordance === undefined) return;
    const node = nodeById(chartNodes(captain({ unlockedIslands: ['port_sumwich'] })), 'port_sumwich');
    const requirement = 'Train at Port Sumwich to lift the fog.';
    const presentations = FIVE_STATES.map((state) => selectAffordance(node, state, requirement));

    expect(new Set(presentations.map((item) => item.accessibilityLabel)).size).toBe(FIVE_STATES.length);
    expect(presentations.every((item) => item.accessibilityLabel.includes(node.island.displayName))).toBe(
      true,
    );
    expect(presentations.map((item) => item.tappable)).toEqual([true, true, true, false, false]);
  });

  it('spec(A-024:AC-4) StationMarker calls the accessibility/tappability seam it renders', () => {
    const station = sourceFile('src/components/chart/Station.tsx');
    const layoutImports = importedJsxExports(station, './layout');
    const localNames = [...layoutImports.named.entries()]
      .filter(([, imported]) => imported === 'stationAffordance')
      .map(([local]) => local);
    let marker: ts.FunctionDeclaration | undefined;

    for (const statement of station.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name?.text === 'StationMarker') {
        marker = statement;
      }
    }

    expect(marker, 'StationMarker must remain an inspectable named function').toBeDefined();
    let calls = 0;
    if (marker !== undefined) {
      visit(marker, (node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          localNames.includes(node.expression.text)
        ) {
          calls += 1;
        }
      });
    }

    expect(localNames, 'StationMarker must import stationAffordance from layout.ts').toHaveLength(1);
    expect(
      calls,
      'StationMarker must consume stationAffordance instead of leaving it as dead test code',
    ).toBe(1);
  });
});
