/**
 * A-024 — chart presentation follows actual placement/mastery progress.
 *
 * The component suite has no React Native renderer, so the behavior contract is split at two
 * deterministic seams: `chartNodes`/`stationState` own progress state, and `stationPresentation`
 * owns the marker/accessibility/tap contract consumed by `StationMarker`. Source checks use the
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

interface StationPresentation {
  readonly accessibilityLabel: string;
  readonly markerHead: 'live' | 'available' | 'cleared' | 'locked' | 'silhouette';
  readonly tappable: boolean;
}

type StationPresentationSelector = (
  node: ChartNode,
  state: ExpectedStationState,
  requirement: string | null,
) => StationPresentation;

const stationPresentation = (
  layout as unknown as { readonly stationPresentation?: StationPresentationSelector }
).stationPresentation;

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

type JsxElementStart = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

function jsxAttribute(element: JsxElementStart, name: string): ts.JsxAttribute | undefined {
  return element.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText() === name,
  );
}

function attributeExpression(attribute: ts.JsxAttribute | undefined): ts.Expression | undefined {
  const initializer = attribute?.initializer;
  if (initializer === undefined) return undefined;
  if (ts.isStringLiteral(initializer)) return initializer;
  return ts.isJsxExpression(initializer) ? initializer.expression : undefined;
}

function isZero(expression: ts.Expression | undefined): boolean {
  return (
    expression !== undefined &&
    ((ts.isNumericLiteral(expression) && Number(expression.text) === 0) ||
      (ts.isStringLiteral(expression) && Number(expression.text) === 0))
  );
}

function isTransparentPaint(expression: ts.Expression | undefined): boolean {
  if (expression === undefined || !ts.isStringLiteral(expression)) return false;
  const paint = expression.text.replace(/\s/g, '').toLowerCase();
  return (
    paint === 'none' ||
    paint === 'transparent' ||
    /rgba\([^)]*,0(?:\.0*)?\)$/.test(paint) ||
    /#[0-9a-f]{6}00$/.test(paint)
  );
}

function opaqueSvgRectangles(file: ts.SourceFile): number {
  const imports = importedJsxExports(file, 'react-native-svg');
  let count = 0;
  visit(file, (node) => {
    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return;
    const parts = jsxTagParts(node.tagName);
    const exported =
      parts.length === 1
        ? imports.named.get(parts[0]!)
        : parts.length === 2 && imports.namespaces.has(parts[0]!)
          ? parts[1]
          : undefined;
    if (exported !== 'Rect') return;

    const fill = attributeExpression(jsxAttribute(node, 'fill'));
    const opacity =
      attributeExpression(jsxAttribute(node, 'fillOpacity')) ??
      attributeExpression(jsxAttribute(node, 'opacity'));
    if (!isTransparentPaint(fill) && !isZero(opacity)) count += 1;
  });
  return count;
}

function allInitializers(file: ts.SourceFile): ReadonlyMap<string, ts.Expression> {
  const result = new Map<string, ts.Expression>();
  visit(file, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
      result.set(node.name.text, node.initializer);
    }
  });
  return result;
}

function styleProperties(
  expression: ts.Expression | undefined,
  initializers: ReadonlyMap<string, ts.Expression>,
  seen = new Set<string>(),
): Map<string, ts.Expression | undefined> {
  const properties = new Map<string, ts.Expression | undefined>();
  if (expression === undefined) return properties;
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  ) {
    return styleProperties(expression.expression, initializers, seen);
  }
  if (ts.isArrayLiteralExpression(expression)) {
    for (const element of expression.elements) {
      if (ts.isSpreadElement(element)) continue;
      for (const [name, value] of styleProperties(element, initializers, seen)) {
        properties.set(name, value);
      }
    }
    return properties;
  }
  if (ts.isIdentifier(expression)) {
    if (seen.has(expression.text)) return properties;
    const initializer = initializers.get(expression.text);
    if (initializer === undefined) return properties;
    return styleProperties(initializer, initializers, new Set([...seen, expression.text]));
  }
  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    const owner = initializers.get(expression.expression.text);
    if (
      owner !== undefined &&
      ts.isCallExpression(owner) &&
      ts.isPropertyAccessExpression(owner.expression) &&
      owner.expression.name.text === 'create'
    ) {
      const sheet = owner.arguments[0];
      if (sheet !== undefined && ts.isObjectLiteralExpression(sheet)) {
        const entry = sheet.properties.find(
          (property): property is ts.PropertyAssignment =>
            ts.isPropertyAssignment(property) &&
            (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
            property.name.text === expression.name.text,
        );
        if (entry !== undefined) return styleProperties(entry.initializer, initializers, seen);
      }
    }
  }
  if (ts.isPropertyAccessExpression(expression) && expression.name.text === 'absoluteFillObject') {
    for (const name of ['position', 'top', 'right', 'bottom', 'left']) properties.set(name, undefined);
    return properties;
  }
  if (!ts.isObjectLiteralExpression(expression)) return properties;

  for (const property of expression.properties) {
    if (ts.isSpreadAssignment(property)) {
      for (const [name, value] of styleProperties(property.expression, initializers, seen)) {
        properties.set(name, value);
      }
    } else if (ts.isPropertyAssignment(property)) {
      const name =
        ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
          ? property.name.text
          : property.name.getText();
      properties.set(name, property.initializer);
    } else if (ts.isShorthandPropertyAssignment(property)) {
      properties.set(property.name.text, undefined);
    }
  }
  return properties;
}

function opaqueAbsoluteViewWashes(file: ts.SourceFile): number {
  const nativeImports = importedJsxExports(file, 'react-native');
  const initializers = allInitializers(file);
  const animatedDefaults = new Set<string>();
  for (const statement of file.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === 'react-native-reanimated' &&
      statement.importClause?.name !== undefined
    ) {
      animatedDefaults.add(statement.importClause.name.text);
    }
  }

  let count = 0;
  visit(file, (node) => {
    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return;
    const parts = jsxTagParts(node.tagName);
    const nativeView =
      (parts.length === 1 && nativeImports.named.get(parts[0]!) === 'View') ||
      (parts.length === 2 && nativeImports.namespaces.has(parts[0]!) && parts[1] === 'View');
    const animatedView = parts.length === 2 && animatedDefaults.has(parts[0]!) && parts[1] === 'View';
    if (!nativeView && !animatedView) return;

    const style = attributeExpression(jsxAttribute(node, 'style'));
    const properties = styleProperties(style, initializers);
    const horizontal = (properties.has('left') && properties.has('right')) || properties.has('width');
    const vertical = (properties.has('top') && properties.has('bottom')) || properties.has('height');
    const background = properties.get('backgroundColor');
    const opacity = properties.get('opacity');
    if (
      properties.has('position') &&
      horizontal &&
      vertical &&
      properties.has('backgroundColor') &&
      !isTransparentPaint(background) &&
      !isZero(opacity)
    ) {
      count += 1;
    }
  });
  return count;
}

function requirePresentation(): StationPresentationSelector | undefined {
  expect(
    stationPresentation,
    'layout.ts must export the pure stationPresentation seam used by StationMarker',
  ).toBeTypeOf('function');
  return stationPresentation;
}

function namedFunction(file: ts.SourceFile, name: string): ts.FunctionDeclaration | undefined {
  return file.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
}

function resultBindingForCall(
  fn: ts.FunctionDeclaration,
  calleeNames: readonly string[],
): string | undefined {
  let result: string | undefined;
  visit(fn, (node) => {
    if (
      result === undefined &&
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      calleeNames.includes(node.expression.text) &&
      ts.isVariableDeclaration(node.parent) &&
      node.parent.initializer === node &&
      ts.isIdentifier(node.parent.name)
    ) {
      result = node.parent.name.text;
    }
  });
  return result;
}

function usesResultProperty(node: ts.Node, resultName: string, propertyName: string): boolean {
  let found = false;
  visit(node, (candidate) => {
    if (
      ts.isPropertyAccessExpression(candidate) &&
      ts.isIdentifier(candidate.expression) &&
      candidate.expression.text === resultName &&
      candidate.name.text === propertyName
    ) {
      found = true;
    }
    if (
      ts.isElementAccessExpression(candidate) &&
      ts.isIdentifier(candidate.expression) &&
      candidate.expression.text === resultName &&
      candidate.argumentExpression !== undefined &&
      ts.isStringLiteral(candidate.argumentExpression) &&
      candidate.argumentExpression.text === propertyName
    ) {
      found = true;
    }
  });
  return found;
}

function countJsxTags(node: ts.Node, tag: string): number {
  let count = 0;
  visit(node, (candidate) => {
    if (
      (ts.isJsxOpeningElement(candidate) || ts.isJsxSelfClosingElement(candidate)) &&
      jsxTagParts(candidate.tagName).at(-1) === tag
    ) {
      count += 1;
    }
  });
  return count;
}

function propertyTruth(
  expression: ts.Expression,
  resultName: string,
  propertyName: string,
): boolean | undefined {
  if (usesResultProperty(expression, resultName, propertyName)) {
    if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.ExclamationToken) {
      return false;
    }
    if (
      ts.isPropertyAccessExpression(expression) ||
      ts.isElementAccessExpression(expression) ||
      ts.isParenthesizedExpression(expression)
    ) {
      return true;
    }
  }
  return undefined;
}

function stringComparisonTruth(
  expression: ts.Expression,
  resultName: string,
  propertyName: string,
  value: string,
): boolean | undefined {
  if (!ts.isBinaryExpression(expression) || !usesResultProperty(expression, resultName, propertyName)) {
    return undefined;
  }
  const literal = ts.isStringLiteral(expression.left)
    ? expression.left
    : ts.isStringLiteral(expression.right)
      ? expression.right
      : undefined;
  if (literal?.text !== value) return undefined;
  if (
    expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
    expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken
  ) {
    return true;
  }
  if (
    expression.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
    expression.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken
  ) {
    return false;
  }
  return undefined;
}

interface MarkerBindingFacts {
  readonly accessibilityFlows: boolean;
  readonly clearedHeadExclusive: boolean;
  readonly pressabilityExact: boolean;
}

function markerBindingFacts(station: ts.SourceFile): MarkerBindingFacts {
  const layoutImports = importedJsxExports(station, './layout');
  const localNames = [...layoutImports.named.entries()]
    .filter(([, imported]) => imported === 'stationPresentation')
    .map(([local]) => local);
  const marker = namedFunction(station, 'StationMarker');
  if (marker === undefined || localNames.length !== 1) {
    return { accessibilityFlows: false, clearedHeadExclusive: false, pressabilityExact: false };
  }
  const resultName = resultBindingForCall(marker, localNames);
  if (resultName === undefined) {
    return { accessibilityFlows: false, clearedHeadExclusive: false, pressabilityExact: false };
  }

  let accessibilityFlows = false;
  let controlledPressables = 0;
  let controlledClearedHeads = 0;
  visit(marker, (node) => {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText() === 'accessibilityLabel' &&
      usesResultProperty(node, resultName, 'accessibilityLabel')
    ) {
      accessibilityFlows = true;
    }
    if (ts.isConditionalExpression(node)) {
      const tapTruth = propertyTruth(node.condition, resultName, 'tappable');
      if (tapTruth !== undefined) {
        const pressBranch = tapTruth ? node.whenTrue : node.whenFalse;
        const plainBranch = tapTruth ? node.whenFalse : node.whenTrue;
        if (countJsxTags(plainBranch, 'Pressable') === 0) {
          controlledPressables += countJsxTags(pressBranch, 'Pressable');
        }
      }
      const clearTruth = stringComparisonTruth(node.condition, resultName, 'markerHead', 'cleared');
      if (clearTruth !== undefined) {
        const clearBranch = clearTruth ? node.whenTrue : node.whenFalse;
        const otherBranch = clearTruth ? node.whenFalse : node.whenTrue;
        if (countJsxTags(otherBranch, 'ClearedHead') === 0) {
          controlledClearedHeads += countJsxTags(clearBranch, 'ClearedHead');
        }
      }
    }
  });

  const statements = marker.body?.statements ?? [];
  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index];
    if (statement === undefined || !ts.isIfStatement(statement)) continue;
    const truth = propertyTruth(statement.expression, resultName, 'tappable');
    if (truth === undefined) continue;
    const next = statements.slice(index + 1).find((candidate) => ts.isReturnStatement(candidate));
    if (next === undefined) continue;
    const trueBranch = statement.thenStatement;
    const falseBranch = statement.elseStatement ?? next;
    const pressBranch = truth ? trueBranch : falseBranch;
    const plainBranch = truth ? falseBranch : trueBranch;
    if (countJsxTags(plainBranch, 'Pressable') === 0) {
      controlledPressables += countJsxTags(pressBranch, 'Pressable');
    }
  }

  const totalPressables = countJsxTags(marker, 'Pressable');
  const totalClearedHeads = countJsxTags(marker, 'ClearedHead');
  return {
    accessibilityFlows,
    pressabilityExact: totalPressables > 0 && controlledPressables === totalPressables,
    clearedHeadExclusive: totalClearedHeads > 0 && controlledClearedHeads === totalClearedHeads,
  };
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

  it('spec(A-024:AC-2) mastering every range skill except one is still available, never cleared', () => {
    const placement = resolvePlacement('g2_3');
    const target = islands.find(
      (island) => placement.unlockedIslands.includes(island.id) && island.rangeSkills.length > 1,
    );
    const currentIsland = placement.unlockedIslands.find((id) => id !== target?.id);
    if (target === undefined || currentIsland === undefined) {
      throw new Error('fixture: placement needs a multi-skill noncurrent island');
    }
    const masteredSubset = target.rangeSkills.slice(0, -1);
    expect(masteredSubset.length).toBe(target.rangeSkills.length - 1);

    const nodes = chartNodes(
      captain({
        gradeBand: 'g2_3',
        unlockedIslands: [...placement.unlockedIslands],
        currentIsland,
        mastery: masteryFor(masteredSubset),
      }),
    ) as readonly ProgressNode[];
    const targetNode = nodeById(nodes, target.id) as ProgressNode;

    expect(targetNode.cleared).toBe(false);
    expect(stateFor(nodes, target.id, false)).toBe('available');
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

  it('spec(A-024:AC-3) fog has irregular weather but no opaque rectangular bottom wash', () => {
    const fog = sourceFile('src/components/chart/Fog.tsx');
    const blobExports = usedExports(fog, './Blob');

    expect(opaqueSvgRectangles(fog)).toBe(0);
    expect(opaqueAbsoluteViewWashes(fog)).toBe(0);
    expect(blobExports.filter((name) => name === 'Blob').length).toBeGreaterThan(0);
  });

  it('spec(A-024:AC-3) the fog guard allows irregular SVG but rejects an absolute painted View', () => {
    const irregularSvg = ts.createSourceFile(
      'Irregular.tsx',
      `import Svg, { Path } from 'react-native-svg';
       export const Fog = () => <Svg><Path d="M0 8 C 10 0 20 16 30 8" fill="#fff" /></Svg>;`,
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.TSX,
    );
    const rectangularView = ts.createSourceFile(
      'Rectangle.tsx',
      `import { StyleSheet, View as Wash } from 'react-native';
       const styles = StyleSheet.create({ wash: {
         position: 'absolute', left: 0, right: 0, top: 10, bottom: 0,
         backgroundColor: '#aabbcc'
       }});
       export function Fog() {
         const local = {
           position: 'absolute', left: 0, right: 0, top: 10, bottom: 0,
           backgroundColor: '#aabbcc'
         };
         return <>
           <Wash style={{ position: 'absolute', left: 0, right: 0, top: 10, bottom: 0,
             backgroundColor: '#aabbcc' }} />
           <Wash style={local} />
           <Wash style={styles.wash} />
         </>;
       }`,
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.TSX,
    );

    expect(opaqueSvgRectangles(irregularSvg)).toBe(0);
    expect(opaqueAbsoluteViewWashes(irregularSvg)).toBe(0);
    expect(opaqueAbsoluteViewWashes(rectangularView)).toBe(3);
  });

  it('spec(A-024:AC-3) fogged accessibility keeps the island name and readable requirement', () => {
    const selectPresentation = requirePresentation();
    if (selectPresentation === undefined) return;
    const nodes = chartNodes(captain({ unlockedIslands: ['port_sumwich'] }));
    const rows = [
      { node: nodeById(nodes, 'isla_products'), state: 'locked-near' },
      { node: nodeById(nodes, 'fraction_reef'), state: 'far-silhouette' },
    ] as const;

    for (const row of rows) {
      const requirement = requirementText(row.node);
      if (requirement === null) throw new Error('fixture: fogged island has no requirement');
      const presentation = selectPresentation(row.node, row.state, requirement);
      expect(presentation.accessibilityLabel).toContain(row.node.island.displayName);
      expect(presentation.accessibilityLabel).toContain(requirement);
    }
  });

  it('spec(A-024:AC-4) five real states are exhaustive and fog wins over stale current/focus data', () => {
    const placement = resolvePlacement('g2_3');
    const first = placement.unlockedIslands[0];
    const second = placement.unlockedIslands[1];
    if (first === undefined || second === undefined) {
      throw new Error('fixture: grade 2–3 placement needs two islands');
    }
    const firstIsland = islands.find((island) => island.id === first);
    if (firstIsland === undefined) throw new Error(`fixture: catalog omitted ${first}`);

    const current = chartNodes(captain({ unlockedIslands: [first], currentIsland: first }));
    const available = chartNodes(
      captain({ unlockedIslands: [...placement.unlockedIslands], currentIsland: first }),
    );
    const cleared = chartNodes(
      captain({ unlockedIslands: [first], mastery: masteryFor(firstIsland.rangeSkills) }),
    );
    const staleNear = chartNodes(captain({ unlockedIslands: [first], currentIsland: 'isla_products' }));
    const staleFar = chartNodes(captain({ unlockedIslands: [first], currentIsland: 'fraction_reef' }));
    const foggedMasteredIsland = islands.find((island) => island.id === 'isla_products');
    if (foggedMasteredIsland === undefined) throw new Error('fixture: catalog omitted isla_products');
    const foggedMastered = chartNodes(
      captain({ unlockedIslands: [first], mastery: masteryFor(foggedMasteredIsland.rangeSkills) }),
    );

    const actual = [
      stateFor(current, first, true),
      stateFor(available, second, false),
      stateFor(cleared, first, false),
      stateFor(current, 'isla_products', false),
      stateFor(current, 'fraction_reef', false),
    ];
    expect(actual).toEqual(FIVE_STATES);
    expect(new Set(actual).size).toBe(FIVE_STATES.length);

    expect(nodeById(staleNear, 'isla_products')).toMatchObject({ fogged: true, isCurrent: true });
    expect(stateFor(staleNear, 'isla_products', true)).toBe('locked-near');
    expect(nodeById(staleFar, 'fraction_reef')).toMatchObject({ fogged: true, isCurrent: true });
    expect(stateFor(staleFar, 'fraction_reef', true)).toBe('far-silhouette');
    expect(stateFor(foggedMastered, 'isla_products', false)).toBe('locked-near');
  });

  it('spec(A-024:AC-4) possible states have distinct labels/heads and only unfogged nodes tap', () => {
    const selectPresentation = requirePresentation();
    if (selectPresentation === undefined) return;
    const placement = resolvePlacement('g2_3');
    const first = placement.unlockedIslands[0];
    const second = placement.unlockedIslands[1];
    if (first === undefined || second === undefined) {
      throw new Error('fixture: grade 2–3 placement needs two islands');
    }
    const firstIsland = islands.find((island) => island.id === first);
    if (firstIsland === undefined) throw new Error(`fixture: catalog omitted ${first}`);

    const currentNodes = chartNodes(captain({ unlockedIslands: [first], currentIsland: first }));
    const availableNodes = chartNodes(
      captain({ unlockedIslands: [...placement.unlockedIslands], currentIsland: first }),
    );
    const clearedNodes = chartNodes(
      captain({ unlockedIslands: [first], mastery: masteryFor(firstIsland.rangeSkills) }),
    );
    const rows: readonly {
      readonly node: ChartNode;
      readonly state: ExpectedStationState;
      readonly requirement: string | null;
    }[] = [
      { node: nodeById(currentNodes, first), state: 'current', requirement: null },
      { node: nodeById(availableNodes, second), state: 'available', requirement: null },
      { node: nodeById(clearedNodes, first), state: 'cleared', requirement: null },
      {
        node: nodeById(currentNodes, 'isla_products'),
        state: 'locked-near',
        requirement: requirementText(nodeById(currentNodes, 'isla_products')),
      },
      {
        node: nodeById(currentNodes, 'fraction_reef'),
        state: 'far-silhouette',
        requirement: requirementText(nodeById(currentNodes, 'fraction_reef')),
      },
    ];
    const presentations = rows.map((row) => selectPresentation(row.node, row.state, row.requirement));
    const normalizedLabels = presentations.map((presentation, index) => {
      const row = rows[index]!;
      return presentation.accessibilityLabel
        .replace(row.node.island.displayName, '<island>')
        .replace(row.requirement ?? '', row.requirement === null ? '' : '<requirement>');
    });

    expect(
      presentations.every((presentation, index) =>
        presentation.accessibilityLabel.includes(rows[index]!.node.island.displayName),
      ),
    ).toBe(true);
    expect(new Set(normalizedLabels).size).toBe(FIVE_STATES.length);
    expect(presentations.map((presentation) => presentation.markerHead)).toEqual([
      'live',
      'available',
      'cleared',
      'locked',
      'silhouette',
    ]);
    expect(presentations.map((presentation) => presentation.tappable)).toEqual(
      rows.map((row) => !row.node.fogged),
    );
    expect(presentations[1]?.markerHead).not.toBe('cleared');
    expect(presentations[2]?.markerHead).toBe('cleared');
  });

  it('spec(A-024:AC-4) StationMarker dataflows presentation into label, tap branch, and tick head', () => {
    expect(markerBindingFacts(sourceFile('src/components/chart/Station.tsx'))).toEqual({
      accessibilityFlows: true,
      pressabilityExact: true,
      clearedHeadExclusive: true,
    });
  });

  it('spec(A-024:AC-4) marker guard rejects dead tap checks and duplicate available green ticks', () => {
    const deadTapCheck = ts.createSourceFile(
      'Dead.tsx',
      `import { stationPresentation } from './layout';
       export function StationMarker({ node, state, requirement, onSail }) {
         const p = stationPresentation(node, state, requirement);
         if (p.tappable) {}
         return <Pressable accessibilityLabel={p.accessibilityLabel} onPress={onSail} />;
       }`,
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.TSX,
    );
    const duplicateTick = ts.createSourceFile(
      'Duplicate.tsx',
      `import { stationPresentation } from './layout';
       export function StationMarker({ node, state, requirement, onSail }) {
         const p = stationPresentation(node, state, requirement);
         const head = p.markerHead === 'cleared' ? <ClearedHead /> : <View />;
         const leak = p.markerHead === 'available' ? <ClearedHead /> : null;
         return p.tappable
           ? <Pressable accessibilityLabel={p.accessibilityLabel} onPress={onSail}>{head}{leak}</Pressable>
           : <View accessible accessibilityLabel={p.accessibilityLabel}>{head}</View>;
       }`,
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.TSX,
    );

    expect(markerBindingFacts(deadTapCheck).pressabilityExact).toBe(false);
    expect(markerBindingFacts(duplicateTick)).toMatchObject({
      accessibilityFlows: true,
      pressabilityExact: true,
      clearedHeadExclusive: false,
    });
  });
});
