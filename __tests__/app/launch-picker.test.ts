/**
 * A-042 launch behavior and source contracts.
 *
 * The launch controller is pure and exercised directly. React Native screens remain source-read
 * because Vitest's node environment cannot parse RN's Flow entry point; TypeScript's TSX parser
 * binds source assertions to exact JSX nodes without pretending this is a native render.
 */
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

import type { Destination } from '../../src/services/flow';
import { resolveDestination } from '../../src/services/flow';
import { hydrate, persist, type KeyValueStore } from '../../src/services/persistence';
import { emptyCaptain } from '../../src/stores/player';

interface LaunchGate {
  readonly acknowledged: boolean;
  markReady(destination: Destination): void;
  start(navigate: (destination: Destination) => void): boolean;
}

interface LaunchGateModule {
  createLaunchGate(): LaunchGate;
}

// Kept non-literal so RED-state typecheck remains useful while the new production module is absent.
const launchGateModulePath: string = '../../src/services/launchGate';
const loadLaunchGate = async (): Promise<LaunchGateModule> =>
  (await import(launchGateModulePath)) as LaunchGateModule;

const readSource = async (relative: string): Promise<string> => {
  const fs = await import('node:fs/promises');
  return fs.readFile(new URL(relative, import.meta.url), 'utf8');
};

const layoutSource = () => readSource('../../app/_layout.tsx');
const splashSource = () => readSource('../../src/components/Splash.tsx');
const pickerSource = () => readSource('../../app/onboarding.tsx');

const parseTsx = (source: string, name: string): ts.SourceFile =>
  ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function descendants<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  const visit = (node: ts.Node): void => {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

function namedFunction(ast: ts.SourceFile, name: string): ts.FunctionDeclaration {
  const fn = ast.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
  expect(fn, `expected function ${name}`).toBeDefined();
  if (!fn) throw new Error(`missing function ${name}`);
  return fn;
}

function jsxTag(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): string {
  return node.tagName.getText();
}

function textNodeForExpression(ast: ts.SourceFile, expression: string): ts.JsxElement {
  const nodes = descendants(
    ast,
    (node): node is ts.JsxElement =>
      ts.isJsxElement(node) &&
      jsxTag(node.openingElement) === 'Text' &&
      node.children.some(
        (child) => ts.isJsxExpression(child) && child.expression?.getText(ast) === expression,
      ),
  );
  expect(nodes, `expected one Text whose child is {${expression}}`).toHaveLength(1);
  const node = nodes[0];
  if (!node) throw new Error(`missing Text for ${expression}`);
  return node;
}

function jsxAttribute(node: ts.JsxElement, name: string): ts.JsxAttribute | undefined {
  return node.openingElement.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText() === name,
  );
}

function numericJsxAttribute(node: ts.JsxElement, name: string): number {
  const attribute = jsxAttribute(node, name);
  expect(attribute, `expected ${name} on exact ${node.getText().slice(0, 100)} node`).toBeDefined();
  const initializer = attribute?.initializer;
  expect(initializer && ts.isJsxExpression(initializer), `${name} must be a JSX expression`).toBe(true);
  if (!initializer || !ts.isJsxExpression(initializer) || !initializer.expression) return NaN;
  return Number(initializer.expression.getText());
}

function typographyNumber(node: ts.JsxElement, property: 'fontSize' | 'lineHeight'): number {
  const style = jsxAttribute(node, 'style')?.initializer?.getText() ?? '';
  const match = style.match(new RegExp(`${property}:\\s*tx\\((\\d+(?:\\.\\d+)?)\\)`));
  expect(match, `expected ${property}: tx(number) on exact Text node ${node.getText()}`).not.toBeNull();
  return Number(match?.[1]);
}

function fakeStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  const store: KeyValueStore = {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
  };
  return { store, data };
}

describe('A-042 launch gate and ship picker', () => {
  it('spec(A-042:AC-1) pending gate rejects every action and Splash’s loader returns before any action node', async () => {
    const [{ createLaunchGate }, layout, splash] = await Promise.all([
      loadLaunchGate(),
      layoutSource(),
      splashSource(),
    ]);
    const navigate = vi.fn();
    const gate = createLaunchGate();

    // This is the action-path guarantee, not a render-time `disabled` approximation: even direct
    // or repeated calls while either prerequisite is pending cannot navigate or acknowledge.
    expect([gate.start(navigate), gate.start(navigate), gate.start(navigate)]).toEqual([false, false, false]);
    expect(navigate).not.toHaveBeenCalled();
    expect(gate.acknowledged).toBe(false);

    // The root may arm the controller only after BOTH prerequisites. The same predicate is passed
    // to Splash, so a destination captured while fonts remain pending does not expose an action.
    expect(layout).toMatch(
      /if\s*\(\s*!fontsLoaded\s*\|\|\s*destination\s*===\s*null\s*\)\s*return[\s\S]{0,180}launchGate\.markReady\(destination\)/,
    );
    expect(layout).toMatch(/<Splash\s+ready=\{fontsLoaded\s*&&\s*destination\s*!==\s*null\}/);

    const ast = parseTsx(splash, 'Splash.tsx');
    const fn = namedFunction(ast, 'Splash');
    const pendingIf = fn.body?.statements.find(
      (statement): statement is ts.IfStatement =>
        ts.isIfStatement(statement) && statement.expression.getText(ast).replace(/\s/g, '') === '!ready',
    );
    expect(pendingIf, 'Splash must early-return its pending branch on !ready').toBeDefined();
    expect(
      pendingIf &&
        descendants(pendingIf.thenStatement, (node): node is ts.ReturnStatement =>
          ts.isReturnStatement(node),
        ),
      'the !ready branch must terminate before ready controls',
    ).toHaveLength(1);
    expect(pendingIf?.thenStatement.getText(ast)).toContain('[0, 180, 360]');
    expect(pendingIf?.thenStatement.getText(ast)).toContain('HOISTING THE SAILS');
    expect(pendingIf?.thenStatement.getText(ast)).not.toContain('Pressable');
  });

  it('spec(A-042:AC-2) ready state remains unacknowledged with one accessible SET SAIL and no navigation', async () => {
    const [{ createLaunchGate }, splash] = await Promise.all([loadLaunchGate(), splashSource()]);
    const navigate = vi.fn();
    const gate = createLaunchGate();
    gate.markReady('onboarding');

    expect(gate.acknowledged).toBe(false);
    expect(navigate).not.toHaveBeenCalled();

    const ast = parseTsx(splash, 'Splash.tsx');
    const pressables = descendants(
      namedFunction(ast, 'Splash'),
      (node): node is ts.JsxElement => ts.isJsxElement(node) && jsxTag(node.openingElement) === 'Pressable',
    );
    expect(pressables, 'Splash must contain exactly one start action total').toHaveLength(1);
    const action = pressables[0];
    if (!action) throw new Error('missing SET SAIL action');
    expect(jsxAttribute(action, 'accessibilityRole')?.initializer?.getText()).toBe('"button"');
    expect(jsxAttribute(action, 'accessibilityLabel')?.initializer?.getText()).toBe('"SET SAIL"');
    expect(jsxAttribute(action, 'onPress')?.initializer?.getText()).toBe('{onStart}');
    expect(action.getText(ast).match(/SET SAIL/g)).toHaveLength(1);
  });

  it('spec(A-042:AC-3) synchronous double start navigates once to the captured resolver result', async () => {
    const [{ createLaunchGate }, layout] = await Promise.all([loadLaunchGate(), layoutSource()]);
    const gate = createLaunchGate();
    const savedDestination = resolveDestination(emptyCaptain());
    const navigate = vi.fn();

    gate.markReady(savedDestination);
    // Same event turn: React has no opportunity to rerender or apply a disabled prop between calls.
    expect(gate.start(navigate)).toBe(true);
    expect(gate.start(navigate)).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(savedDestination);
    expect(gate.acknowledged).toBe(true);

    // Hydration resolves once, saves that exact value, and passes the saved value to the gate.
    expect(layout).toMatch(
      /const\s+resolvedDestination\s*=\s*resolveDestination\(captain\)\s*;\s*setDestination\(resolvedDestination\)/,
    );
    expect(layout).toMatch(/launchGate\.markReady\(destination\)/);

    // The start handler receives only the captured destination from the controller. It has no
    // captain or resolver input with which to re-resolve, and no hard-coded destination.
    expect(layout).toMatch(
      /launchGate\.start\(\(resolvedDestination\)\s*=>\s*router\.replace\(`\/\$\{resolvedDestination\}`\)\)/,
    );
    expect(layout.match(/router\.replace\s*\(/g) ?? []).toHaveLength(1);
    const onStart = layout.match(/onStart=\{\(\)\s*=>\s*\{([\s\S]*?)\n\s*}\}/)?.[1] ?? '';
    expect(onStart).not.toMatch(
      /resolveDestination|captain\.|['"]\/(?:onboarding|name-flag|chart|gun-deck|duel)['"]/,
    );
  });

  it('spec(A-042:AC-4) fresh gate resets acknowledgement while persisted captain resolves identically', async () => {
    const { createLaunchGate } = await loadLaunchGate();
    const io = fakeStorage();
    const captain = emptyCaptain();
    await persist(io.store, captain);

    const firstDestination = resolveDestination(captain);
    const first = createLaunchGate();
    first.markReady(firstDestination);
    expect(first.start(vi.fn())).toBe(true);
    expect(first.acknowledged).toBe(true);

    const { captain: relaunchedCaptain } = await hydrate(io.store);
    const relaunchedDestination = resolveDestination(relaunchedCaptain);
    const freshProcess = createLaunchGate();
    expect(freshProcess.acknowledged).toBe(false);
    expect(relaunchedDestination).toBe(firstDestination);

    const navigate = vi.fn();
    freshProcess.markReady(relaunchedDestination);
    expect(freshProcess.start(navigate)).toBe(true);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(firstDestination);
  });

  it('spec(A-042:AC-4) root display acknowledgement is initialized from and updated by its process-local gate', async () => {
    const layout = await layoutSource();

    expect(layout).toMatch(/const\s+\[launchGate]\s*=\s*useState\(createLaunchGate\)/);
    expect(layout).toMatch(
      /const\s+\[launchAcknowledged,\s*setLaunchAcknowledged]\s*=\s*useState\(launchGate\.acknowledged\)/,
    );
    expect(layout).toMatch(/if\s*\(\s*!launchAcknowledged\s*\)[\s\S]{0,500}<Splash/);
    expect(layout).toMatch(
      /if\s*\(\s*launchGate\.start\([\s\S]{0,180}\)\s*\)\s*\{?\s*setLaunchAcknowledged\(launchGate\.acknowledged\)/,
    );
    expect(layout).not.toMatch(/AsyncStorage\.(?:getItem|setItem)\([^)]*launch/i);
    expect(layout).not.toMatch(/persist\([^)]*launch/i);
  });

  it('spec(A-042:AC-5) binds exact copy and bounded one-line fit to each visible Text node', async () => {
    const picker = await pickerSource();
    const expected = [
      ['3 + 4', 'K–1'],
      ['14 − 6', 'GRADE 2–3'],
      ['12 × 7', 'GRADE 4–5'],
    ];
    for (const [problem, label] of expected) {
      expect(picker).toContain(`problem: '${problem}'`);
      expect(picker).toContain(`label: '${label}'`);
    }

    const ast = parseTsx(picker, 'onboarding.tsx');
    const problem = textNodeForExpression(ast, 'b.problem');
    const label = textNodeForExpression(ast, 'b.label');

    for (const [name, node] of [
      ['problem', problem],
      ['label', label],
    ] as const) {
      expect(numericJsxAttribute(node, 'numberOfLines'), `${name} stays single-line`).toBe(1);
      const fitting = jsxAttribute(node, 'adjustsFontSizeToFit');
      expect(fitting, `${name} exact Text opts into native fitting`).toBeDefined();
      const fittingValue = fitting?.initializer?.getText() ?? 'true';
      expect(fittingValue, `${name} fitting must be true/bare, never false`).toMatch(
        /^(?:true|\{\s*true\s*})$/,
      );
      const floor = numericJsxAttribute(node, 'minimumFontScale');
      expect(floor, `${name} shrink floor remains readable`).toBeGreaterThanOrEqual(0.8);
      expect(floor).toBeLessThan(1);
    }

    expect(typographyNumber(problem, 'lineHeight')).toBeGreaterThan(typographyNumber(problem, 'fontSize'));
  });
});
