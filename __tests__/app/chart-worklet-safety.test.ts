/**
 * A-018 — the chart's Reanimated callbacks execute on the UI runtime, where a call to a
 * JavaScript helper can crash the first device frame while remaining invisible on web.
 *
 * This is intentionally a source-structure regression: it inventories every direct
 * `useAnimatedStyle` invocation below src/components/chart and rejects CallExpressions from each
 * callback body. Layout work belongs on the JavaScript thread before the callback is created.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CHART_ROOT = join(REPO_ROOT, 'src/components/chart');

type WorkletCallback = ts.ArrowFunction | ts.FunctionExpression;

interface Worklet {
  readonly binding: string;
  readonly callback: WorkletCallback | undefined;
  readonly calls: readonly string[];
  readonly relativePath: string;
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

function callbackCalls(callback: WorkletCallback, sourceFile: ts.SourceFile): readonly string[] {
  const calls: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      calls.push(`${line + 1}:${character + 1} ${node.expression.getText(sourceFile)}`);
    }
    ts.forEachChild(node, visit);
  };

  // Start inside the callback so the useAnimatedStyle invocation itself is not counted.
  ts.forEachChild(callback, visit);
  return calls;
}

function bindingName(call: ts.CallExpression): string {
  const parent = call.parent;
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
  const worklets: Worklet[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'useAnimatedStyle'
    ) {
      const candidate = node.arguments[0];
      const callback =
        candidate !== undefined && (ts.isArrowFunction(candidate) || ts.isFunctionExpression(candidate))
          ? candidate
          : undefined;
      worklets.push({
        binding: bindingName(node),
        callback,
        calls: callback === undefined ? [] : callbackCalls(callback, sourceFile),
        relativePath,
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
const CURRENT_SHIPPED_WORKLETS = [
  'src/components/chart/ChartShip.tsx::bobStyle',
  'src/components/chart/Fog.tsx::driftStyle',
  'src/components/chart/Station.tsx::ringStyle',
  'src/components/chart/Station.tsx::riseStyle',
] as const;

describe('A-018 — chart Reanimated worklet safety', () => {
  it('spec(A-018:AC-1) inventories exactly the four currently shipped chart useAnimatedStyle callbacks', () => {
    const inventory = WORKLETS.map((worklet) => `${worklet.relativePath}::${worklet.binding}`);

    expect(inventory).toStrictEqual(CURRENT_SHIPPED_WORKLETS);
    expect(new Set(inventory).size).toBe(4);
  });

  describe.each(WORKLETS)('$relativePath::$binding', ({ callback, calls }) => {
    it('spec(A-018:AC-1) has a callback and makes no CallExpression from the UI runtime', () => {
      expect(callback).toBeDefined();
      if (callback === undefined) return;

      expect(calls).toStrictEqual([]);
    });
  });

  it('spec(A-018:AC-1) recognizes a helper CallExpression in a representative unsafe worklet', () => {
    const [unsafeWorklet] = workletsIn(
      'synthetic-chart-worklet.tsx',
      'const style = useAnimatedStyle(() => ({ opacity: helper() }));',
    );

    expect(unsafeWorklet?.binding).toBe('style');
    expect(unsafeWorklet?.calls).toEqual([expect.stringMatching(/^1:\d+ helper$/)]);
  });
});
