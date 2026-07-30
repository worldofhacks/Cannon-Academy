/**
 * A-018 — chart worklets execute on the UI runtime, where calling a captured JavaScript helper can
 * crash the first device frame while remaining invisible on web.
 *
 * This source-structure regression resolves `useAnimatedStyle` calls back to
 * `react-native-reanimated`, including named-import aliases and namespace/default qualification.
 * It inspects inline callbacks and locally resolvable extracted callbacks. Calls to Reanimated
 * primitives and unshadowed worklet-safe ECMAScript intrinsics are allowed; calls to captured,
 * imported-from-elsewhere, or unresolved JavaScript helpers are rejected.
 *
 * ── Amendment, turn 9: four callbacks became seven ─────────────────────────────────────────────
 * The inventory below is an EXACT list on purpose — a new animation must be added deliberately and
 * reviewed for worklet safety, never appear because someone slipped one in. So a rebuild that adds
 * motion has to amend it in the same change, with the reason written down. This is that amendment.
 *
 * `Cannon Academy Sea Chart.dc.html` replaced the chart with two views, and its stylesheet declares
 * nine keyframes where the previous board had four. The delta, one line each:
 *
 *   + `Sea.tsx::swellStyle`     `sc-swell` — sixteen drifting swell dashes across the two screens.
 *   + `Sea.tsx::dashStyle`      `sc-dash`  — the five crawling route dashes.
 *   + `Kraken.tsx::humpStyle`   `sc-hump`  — the sea monster between the two fogged islands.
 *   + `Waypoint.tsx::bobStyle`  `sc-bob`   — the chests and the rival sails, on the ship's keyframe.
 *   − `Station.tsx::riseStyle`  the `SAIL HERE ▸` chip is gone; the new board says `YOU ARE HERE`
 *                               in a static gold chip under the live island's name, and its
 *                               `sc-rise` keyframe is declared but applied to nothing on either
 *                               screen (owner ruling 11), so nothing rose to replace it.
 *
 * Each entry is a CALL SITE, not an instance: `swellStyle` is one `useAnimatedStyle` inside one
 * `Swell` component that renders sixteen times. Every one of the seven was written with its pixel
 * values hoisted out of the worklet body, which is what the per-callback tests below then prove
 * rather than assume.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CHART_ROOT = join(REPO_ROOT, 'src/components/chart');
const REANIMATED_MODULE = 'react-native-reanimated';
const WORKLET_SAFE_REANIMATED_CALLS = new Set([
  'Easing.back',
  'Easing.bezier',
  'Easing.bezierFn',
  'Easing.bounce',
  'Easing.circle',
  'Easing.cubic',
  'Easing.ease',
  'Easing.elastic',
  'Easing.exp',
  'Easing.in',
  'Easing.inOut',
  'Easing.linear',
  'Easing.out',
  'Easing.poly',
  'Easing.quad',
  'Easing.sin',
  'Easing.steps',
  'clamp',
  'interpolate',
  'interpolateColor',
  'withClamp',
  'withDecay',
  'withDelay',
  'withRepeat',
  'withSequence',
  'withSpring',
  'withTiming',
]);
const WORKLET_SAFE_GLOBAL_FUNCTIONS = new Set(['isFinite', 'isNaN', 'parseFloat', 'parseInt']);
const WORKLET_SAFE_GLOBAL_OBJECTS = new Set([
  'Array',
  'Boolean',
  'JSON',
  'Math',
  'Number',
  'Object',
  'String',
]);

type FunctionNode = ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration;

interface Binding {
  readonly declaration: ts.Node;
  readonly functionValue: FunctionNode | undefined;
  readonly name: string;
  readonly scope: ts.Node;
}

interface ReanimatedImports {
  readonly hookDeclarations: ReadonlySet<ts.Node>;
  readonly namespaceDeclarations: ReadonlySet<ts.Node>;
  readonly valueDeclarations: ReadonlyMap<ts.Node, string>;
}

interface SourceContext {
  readonly bindings: readonly Binding[];
  readonly imports: ReanimatedImports;
  readonly sourceFile: ts.SourceFile;
}

interface Worklet {
  readonly binding: string;
  readonly inspectionError: string | undefined;
  readonly relativePath: string;
  readonly safeCalls: readonly string[];
  readonly unsafeCalls: readonly string[];
}

function chartSourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return chartSourceFiles(path);
      return /\.tsx?$/.test(entry.name) && statSync(path).isFile() ? [path] : [];
    })
    .sort();
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function lexicalScope(node: ts.Node, sourceFile: ts.SourceFile): ts.Node {
  let current = node.parent;
  while (current !== undefined) {
    if (
      ts.isSourceFile(current) ||
      ts.isBlock(current) ||
      ts.isCaseBlock(current) ||
      ts.isModuleBlock(current) ||
      ts.isArrowFunction(current) ||
      ts.isFunctionExpression(current) ||
      ts.isFunctionDeclaration(current) ||
      ts.isMethodDeclaration(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return sourceFile;
}

function functionValue(expression: ts.Expression | undefined): FunctionNode | undefined {
  if (expression === undefined) return undefined;
  const unwrapped = unwrapExpression(expression);
  return ts.isArrowFunction(unwrapped) || ts.isFunctionExpression(unwrapped) ? unwrapped : undefined;
}

function bindingNames(name: ts.BindingName): readonly ts.Identifier[] {
  if (ts.isIdentifier(name)) return [name];
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : bindingNames(element.name),
  );
}

function collectBindings(sourceFile: ts.SourceFile): readonly Binding[] {
  const bindings: Binding[] = [];
  const add = (
    name: ts.Identifier,
    declaration: ts.Node,
    scope: ts.Node,
    value: FunctionNode | undefined,
  ): void => {
    bindings.push({ declaration, functionValue: value, name: name.text, scope });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node)) {
      const identifiers = bindingNames(node.name);
      const value = ts.isIdentifier(node.name) ? functionValue(node.initializer) : undefined;
      for (const identifier of identifiers) {
        add(identifier, node, lexicalScope(node, sourceFile), value);
      }
    } else if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
      add(node.name, node, lexicalScope(node, sourceFile), node);
    } else if (ts.isFunctionExpression(node) && node.name !== undefined) {
      add(node.name, node, node, node);
    } else if (ts.isParameter(node)) {
      for (const identifier of bindingNames(node.name)) {
        add(identifier, node, node.parent, undefined);
      }
    } else if (ts.isClassDeclaration(node) && node.name !== undefined) {
      add(node.name, node, lexicalScope(node, sourceFile), undefined);
    } else if (ts.isImportClause(node) && node.name !== undefined) {
      add(node.name, node, sourceFile, undefined);
    } else if (ts.isImportSpecifier(node) || ts.isNamespaceImport(node)) {
      add(node.name, node, sourceFile, undefined);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return bindings;
}

function collectReanimatedImports(sourceFile: ts.SourceFile): ReanimatedImports {
  const hookDeclarations = new Set<ts.Node>();
  const namespaceDeclarations = new Set<ts.Node>();
  const valueDeclarations = new Map<ts.Node, string>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== REANIMATED_MODULE
    ) {
      continue;
    }

    const clause = statement.importClause;
    if (clause === undefined) continue;
    if (clause.name !== undefined) {
      namespaceDeclarations.add(clause);
    }

    const namedBindings = clause.namedBindings;
    if (namedBindings === undefined) continue;
    if (ts.isNamespaceImport(namedBindings)) {
      namespaceDeclarations.add(namedBindings);
      continue;
    }

    for (const element of namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      valueDeclarations.set(element, importedName);
      if (importedName === 'useAnimatedStyle') {
        hookDeclarations.add(element);
      }
    }
  }

  return { hookDeclarations, namespaceDeclarations, valueDeclarations };
}

function scopeContains(scope: ts.Node, node: ts.Node, sourceFile: ts.SourceFile): boolean {
  return scope.getStart(sourceFile, false) <= node.getStart(sourceFile, false) && scope.end >= node.end;
}

function resolveBinding(identifier: ts.Identifier, context: SourceContext): Binding | undefined {
  const candidates = context.bindings
    .filter(
      (binding) =>
        binding.name === identifier.text && scopeContains(binding.scope, identifier, context.sourceFile),
    )
    .sort((left, right) => {
      const leftSpan = left.scope.end - left.scope.getStart(context.sourceFile, false);
      const rightSpan = right.scope.end - right.scope.getStart(context.sourceFile, false);
      if (leftSpan !== rightSpan) return leftSpan - rightSpan;

      const leftDistance = Math.abs(
        identifier.getStart(context.sourceFile, false) - left.declaration.getStart(context.sourceFile, false),
      );
      const rightDistance = Math.abs(
        identifier.getStart(context.sourceFile, false) -
          right.declaration.getStart(context.sourceFile, false),
      );
      return leftDistance - rightDistance;
    });
  return candidates[0];
}

function memberPath(expression: ts.Expression): readonly string[] | undefined {
  const unwrapped = unwrapExpression(expression);
  if (ts.isIdentifier(unwrapped)) return [];
  if (ts.isPropertyAccessExpression(unwrapped)) {
    const base = memberPath(unwrapped.expression);
    return base === undefined ? undefined : [...base, unwrapped.name.text];
  }
  if (!ts.isElementAccessExpression(unwrapped)) return undefined;

  const argument = unwrapped.argumentExpression;
  const key =
    argument !== undefined && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
      ? argument.text
      : undefined;
  const base = memberPath(unwrapped.expression);
  return base === undefined || key === undefined ? undefined : [...base, key];
}

function memberRoot(expression: ts.Expression): ts.Identifier | undefined {
  let current = unwrapExpression(expression);
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    current = unwrapExpression(current.expression);
  }
  return ts.isIdentifier(current) ? current : undefined;
}

function isReanimatedHookCall(expression: ts.Expression, context: SourceContext): boolean {
  const unwrapped = unwrapExpression(expression);
  if (ts.isIdentifier(unwrapped)) {
    const binding = resolveBinding(unwrapped, context);
    return binding !== undefined && context.imports.hookDeclarations.has(binding.declaration);
  }

  const root = memberRoot(unwrapped);
  const path = memberPath(unwrapped);
  return (
    root !== undefined &&
    context.imports.namespaceDeclarations.has(resolveBinding(root, context)?.declaration ?? root) &&
    path?.length === 1 &&
    path[0] === 'useAnimatedStyle'
  );
}

function isReanimatedRuntimeCall(expression: ts.Expression, context: SourceContext): boolean {
  const unwrapped = unwrapExpression(expression);
  if (ts.isIdentifier(unwrapped)) {
    const binding = resolveBinding(unwrapped, context);
    const importedName =
      binding === undefined ? undefined : context.imports.valueDeclarations.get(binding.declaration);
    return importedName !== undefined && WORKLET_SAFE_REANIMATED_CALLS.has(importedName);
  }

  const root = memberRoot(unwrapped);
  if (root === undefined) return false;
  const declaration = resolveBinding(root, context)?.declaration;
  const path = memberPath(unwrapped);
  if (declaration === undefined || path === undefined) return false;

  if (context.imports.namespaceDeclarations.has(declaration)) {
    return WORKLET_SAFE_REANIMATED_CALLS.has(path.join('.'));
  }

  const importedRoot = context.imports.valueDeclarations.get(declaration);
  return importedRoot !== undefined && WORKLET_SAFE_REANIMATED_CALLS.has([importedRoot, ...path].join('.'));
}

function isUnshadowedWorkletIntrinsic(expression: ts.Expression, context: SourceContext): boolean {
  const unwrapped = unwrapExpression(expression);
  if (ts.isIdentifier(unwrapped)) {
    return (
      WORKLET_SAFE_GLOBAL_FUNCTIONS.has(unwrapped.text) && resolveBinding(unwrapped, context) === undefined
    );
  }

  const root = memberRoot(unwrapped);
  return (
    root !== undefined &&
    WORKLET_SAFE_GLOBAL_OBJECTS.has(root.text) &&
    resolveBinding(root, context) === undefined
  );
}

function functionIsInside(candidate: FunctionNode, callback: FunctionNode): boolean {
  return candidate.pos >= callback.pos && candidate.end <= callback.end;
}

function callDescription(call: ts.CallExpression, sourceFile: ts.SourceFile): string {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(call.getStart(sourceFile, false));
  return `${line + 1}:${character + 1} ${call.expression.getText(sourceFile)}`;
}

function analyzeCallback(
  callback: FunctionNode,
  context: SourceContext,
): Pick<Worklet, 'safeCalls' | 'unsafeCalls'> {
  const safeCalls: string[] = [];
  const unsafeCalls: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const description = callDescription(node, context.sourceFile);
      const callee = unwrapExpression(node.expression);

      if (isReanimatedRuntimeCall(callee, context)) {
        safeCalls.push(`${description}: Reanimated UI-runtime primitive`);
      } else if (isUnshadowedWorkletIntrinsic(callee, context)) {
        safeCalls.push(`${description}: unshadowed worklet-safe intrinsic`);
      } else if (ts.isIdentifier(callee)) {
        const binding = resolveBinding(callee, context);
        if (binding?.functionValue !== undefined && functionIsInside(binding.functionValue, callback)) {
          safeCalls.push(`${description}: function declared inside the worklet`);
        } else {
          unsafeCalls.push(`${description}: captured or unresolved JavaScript helper`);
        }
      } else if (ts.isArrowFunction(callee) || ts.isFunctionExpression(callee)) {
        safeCalls.push(`${description}: function declared inside the worklet`);
      } else {
        unsafeCalls.push(`${description}: captured or unresolved JavaScript helper`);
      }
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(callback, visit);
  return { safeCalls, unsafeCalls };
}

function resolveCallback(
  candidate: ts.Expression | undefined,
  context: SourceContext,
): FunctionNode | undefined {
  if (candidate === undefined) return undefined;
  const unwrapped = unwrapExpression(candidate);
  if (ts.isArrowFunction(unwrapped) || ts.isFunctionExpression(unwrapped)) return unwrapped;
  if (!ts.isIdentifier(unwrapped)) return undefined;
  return resolveBinding(unwrapped, context)?.functionValue;
}

function bindingName(call: ts.CallExpression): string {
  let current: ts.Node = call;
  while (
    ts.isParenthesizedExpression(current.parent) ||
    ts.isAsExpression(current.parent) ||
    ts.isSatisfiesExpression(current.parent) ||
    ts.isNonNullExpression(current.parent)
  ) {
    current = current.parent;
  }
  const parent = current.parent;
  return ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name) ? parent.name.text : '<unbound>';
}

function workletsIn(relativePath: string, text: string): readonly Worklet[] {
  const sourceFile = ts.createSourceFile(
    relativePath,
    text,
    ts.ScriptTarget.ESNext,
    true,
    relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const context: SourceContext = {
    bindings: collectBindings(sourceFile),
    imports: collectReanimatedImports(sourceFile),
    sourceFile,
  };
  const worklets: Worklet[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isReanimatedHookCall(node.expression, context)) {
      const callback = resolveCallback(node.arguments[0], context);
      const analysis =
        callback === undefined ? { safeCalls: [], unsafeCalls: [] } : analyzeCallback(callback, context);
      worklets.push({
        binding: bindingName(node),
        inspectionError:
          callback === undefined
            ? 'useAnimatedStyle callback is not an inline or locally resolvable function'
            : undefined,
        relativePath,
        ...analysis,
      });
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return worklets;
}

const WORKLETS = chartSourceFiles(CHART_ROOT).flatMap((path) =>
  workletsIn(relative(REPO_ROOT, path), readFileSync(path, 'utf8')),
);
/** Sorted by file path, then by source order within the file — see `chartSourceFiles`/`workletsIn`. */
const CURRENT_SHIPPED_WORKLETS = [
  'src/components/chart/ChartShip.tsx::bobStyle',
  'src/components/chart/Fog.tsx::driftStyle',
  'src/components/chart/Kraken.tsx::humpStyle',
  'src/components/chart/Sea.tsx::swellStyle',
  'src/components/chart/Sea.tsx::dashStyle',
  'src/components/chart/Station.tsx::ringStyle',
  'src/components/chart/Waypoint.tsx::bobStyle',
] as const;

const ALIASED_UNSAFE_FIXTURES = [
  {
    binding: 'aliasedStyle',
    label: 'named-import alias',
    source: `
      import { useAnimatedStyle as animatedStyle } from 'react-native-reanimated';
      const jsLayout = () => 1;
      const aliasedStyle = animatedStyle(() => ({ opacity: jsLayout() }));
    `,
  },
  {
    binding: 'namespaceStyle',
    label: 'namespace-qualified hook',
    source: `
      import * as Reanimated from 'react-native-reanimated';
      const jsLayout = () => 1;
      const namespaceStyle = Reanimated.useAnimatedStyle(() => ({ opacity: jsLayout() }));
    `,
  },
  {
    binding: 'defaultStyle',
    label: 'default-qualified hook',
    source: `
      import Reanimated from 'react-native-reanimated';
      const jsLayout = () => 1;
      const defaultStyle = Reanimated['useAnimatedStyle'](() => ({ opacity: jsLayout() }));
    `,
  },
] as const;

const JS_THREAD_REANIMATED_FIXTURES = [
  {
    label: 'named useSharedValue import',
    source: `
      import { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
      const style = useAnimatedStyle(() => ({ opacity: useSharedValue(1).value }));
    `,
  },
  {
    label: 'namespace-qualified useSharedValue',
    source: `
      import * as Reanimated from 'react-native-reanimated';
      const style = Reanimated.useAnimatedStyle(
        () => ({ opacity: Reanimated.useSharedValue(1).value }),
      );
    `,
  },
] as const;

describe('A-018 — chart Reanimated worklet safety', () => {
  it('spec(A-018:AC-1) inventories exactly the seven currently shipped chart useAnimatedStyle callbacks', () => {
    const inventory = WORKLETS.map((worklet) => `${worklet.relativePath}::${worklet.binding}`);

    expect(inventory).toStrictEqual(CURRENT_SHIPPED_WORKLETS);
    expect(new Set(inventory).size).toBe(CURRENT_SHIPPED_WORKLETS.length);
  });

  describe.each(WORKLETS)('$relativePath::$binding', ({ inspectionError, unsafeCalls }) => {
    it('spec(A-018:AC-1) is inspectable and calls no captured JavaScript helper', () => {
      expect(inspectionError).toBeUndefined();
      expect(unsafeCalls).toStrictEqual([]);
    });
  });

  it.each(ALIASED_UNSAFE_FIXTURES)(
    'spec(A-018:AC-1) inventories and rejects an unsafe $label',
    ({ binding, source }) => {
      const found = workletsIn('synthetic-chart-worklet.tsx', source);

      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({
        binding,
        inspectionError: undefined,
        unsafeCalls: [expect.stringContaining('jsLayout')],
      });
    },
  );

  it.each(JS_THREAD_REANIMATED_FIXTURES)(
    'spec(A-018:AC-1) rejects the JS-thread Reanimated API in a $label callback',
    ({ source }) => {
      const found = workletsIn('synthetic-js-thread-reanimated.tsx', source);

      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({
        binding: 'style',
        inspectionError: undefined,
        unsafeCalls: [expect.stringContaining('useSharedValue')],
      });
    },
  );

  it('spec(A-018:AC-1) inspects an extracted callback and rejects its captured local helper', () => {
    const found = workletsIn(
      'synthetic-extracted-worklet.tsx',
      `
        import { useAnimatedStyle } from 'react-native-reanimated';
        function jsLayout() { return 1; }
        function extractedStyle() {
          'worklet';
          return { opacity: jsLayout() };
        }
        const style = useAnimatedStyle(extractedStyle);
      `,
    );

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      binding: 'style',
      inspectionError: undefined,
      unsafeCalls: [expect.stringContaining('jsLayout')],
    });
  });

  it('spec(A-018:AC-1) rejects a local helper shadowing a worklet-safe Reanimated import', () => {
    const found = workletsIn(
      'synthetic-shadowed-import.tsx',
      `
        import { interpolate, useAnimatedStyle } from 'react-native-reanimated';
        const jsLayout = () => 1;
        function ChartNode() {
          const interpolate = jsLayout;
          return useAnimatedStyle(() => ({ opacity: interpolate() }));
        }
      `,
    );

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      inspectionError: undefined,
      unsafeCalls: [expect.stringContaining('interpolate')],
    });
  });

  it('spec(A-018:AC-1) fails closed when a hook callback body cannot be resolved', () => {
    const found = workletsIn(
      'synthetic-unresolved-worklet.tsx',
      `
        import { useAnimatedStyle as animatedStyle } from 'react-native-reanimated';
        const style = animatedStyle(callbackFromProps);
      `,
    );

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      binding: 'style',
      inspectionError: expect.stringContaining('not an inline or locally resolvable function'),
    });
  });

  it('spec(A-018:AC-1) allows calls proven safe on the UI runtime in an extracted callback', () => {
    const found = workletsIn(
      'synthetic-safe-worklet.tsx',
      `
        import { interpolate, useAnimatedStyle as animatedStyle } from 'react-native-reanimated';
        function extractedStyle() {
          'worklet';
          return { opacity: Math.max(0, interpolate(progress.value, [0, 1], [0, 1])) };
        }
        const style = animatedStyle(extractedStyle);
      `,
    );

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      binding: 'style',
      inspectionError: undefined,
      unsafeCalls: [],
    });
    expect(found[0]?.safeCalls).toEqual([
      expect.stringContaining('Math.max'),
      expect.stringContaining('interpolate'),
    ]);
  });
});
