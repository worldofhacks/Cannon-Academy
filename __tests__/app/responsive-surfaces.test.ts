/**
 * A-043's component contract is deliberately inspected as TSX source plus pure geometry.
 * Vitest cannot parse React Native's Flow entry point here, so this is not (and must never claim
 * to be) rendered-native or screenshot evidence. The ticket's iPad/web screenshots remain a
 * separate release gate for clipping and visual centering.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import * as responsive from '../../src/theme/responsive';
import { MIN_TAP_TARGET } from '../../src/theme/tokens';

type Surface = 'reading' | 'world';
type ViewportClass = 'compact' | 'tablet' | 'desktop';

interface SurfaceLayout {
  readonly viewport: ViewportClass;
  readonly contentWidth: number;
  readonly gutter: number;
  readonly left: number;
  readonly right: number;
}

interface RouteContract {
  readonly importsFrame: boolean;
  readonly frameCount: number;
  readonly bypassReturnCount: number;
  readonly rootIsFrame: boolean;
  readonly rootRole: string | null;
  readonly rootHasRenderedContent: boolean;
}

type ResolveSurface = (width: number, surface: Surface) => SurfaceLayout;

const routeRoles = {
  'app/onboarding.tsx': 'reading',
  'app/name-flag.tsx': 'reading',
  'app/gun-deck.tsx': 'reading',
  'app/range.tsx': 'reading',
  'app/chart.tsx': 'world',
  'app/duel.tsx': 'world',
  'app/guided-duel.tsx': 'world',
} as const;

function resolveSurface(width: number, surface: Surface): SurfaceLayout {
  const candidate = (responsive as { resolveResponsiveSurface?: unknown }).resolveResponsiveSurface;
  expect(candidate, 'responsive.ts must export the shared pure surface resolver').toBeTypeOf('function');
  return (candidate as ResolveSurface)(width, surface);
}

function parseTsx(path: string, source: string): ts.SourceFile {
  return ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function walk(node: ts.Node, visit: (candidate: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function defaultComponent(sourceFile: ts.SourceFile): ts.FunctionLikeDeclaration {
  const declaration = sourceFile.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) === true,
  );
  expect(declaration, `${sourceFile.fileName} must default-export a route component function`).toBeDefined();
  return declaration!;
}

function componentReturns(component: ts.FunctionLikeDeclaration): ts.ReturnStatement[] {
  const returns: ts.ReturnStatement[] = [];
  const body = component.body;
  if (body === undefined) return returns;

  const visit = (node: ts.Node): void => {
    if (node !== body && ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node)) {
      returns.push(node);
      return;
    }
    node.forEachChild(visit);
  };
  visit(body);
  return returns;
}

function jsxTagName(node: ts.JsxOpeningLikeElement): string {
  return node.tagName.getText();
}

function literalSurface(node: ts.JsxOpeningLikeElement): string | null {
  const attribute = node.attributes.properties.find(
    (candidate): candidate is ts.JsxAttribute =>
      ts.isJsxAttribute(candidate) && candidate.name.getText() === 'surface',
  );
  if (attribute?.initializer === undefined) return null;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  if (
    ts.isJsxExpression(attribute.initializer) &&
    attribute.initializer.expression !== undefined &&
    ts.isStringLiteral(attribute.initializer.expression)
  ) {
    return attribute.initializer.expression.text;
  }
  return null;
}

function hasRenderedChild(node: ts.JsxElement): boolean {
  return node.children.some((child) => {
    if (ts.isJsxText(child)) return child.getText().trim().length > 0;
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) return true;
    return (
      ts.isJsxExpression(child) &&
      child.expression !== undefined &&
      child.expression.kind !== ts.SyntaxKind.NullKeyword &&
      child.expression.kind !== ts.SyntaxKind.FalseKeyword
    );
  });
}

function inspectRoute(path: string, source: string): RouteContract {
  const sourceFile = parseTsx(path, source);
  const component = defaultComponent(sourceFile);
  const returns = componentReturns(component);
  const primaryReturn = returns.at(-1);
  const root =
    primaryReturn?.expression === undefined ? undefined : unwrapExpression(primaryReturn.expression);
  const rootElement = root !== undefined && ts.isJsxElement(root) ? root : undefined;
  const bypassReturnCount = returns.filter((statement) => {
    if (statement.expression === undefined) return true;
    const expression = unwrapExpression(statement.expression);
    if (ts.isJsxElement(expression)) {
      return jsxTagName(expression.openingElement) !== 'ResponsiveFrame';
    }
    if (ts.isJsxSelfClosingElement(expression)) {
      return jsxTagName(expression) !== 'Redirect';
    }
    return true;
  }).length;

  let frameCount = 0;
  walk(sourceFile, (node) => {
    if (
      (ts.isJsxElement(node) && jsxTagName(node.openingElement) === 'ResponsiveFrame') ||
      (ts.isJsxSelfClosingElement(node) && jsxTagName(node) === 'ResponsiveFrame')
    ) {
      frameCount += 1;
    }
  });

  const importsFrame = sourceFile.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.endsWith('ResponsiveFrame') &&
      statement.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(statement.importClause.namedBindings) &&
      statement.importClause.namedBindings.elements.some(
        (element) => element.name.text === 'ResponsiveFrame',
      ),
  );

  const rootIsFrame =
    rootElement !== undefined && jsxTagName(rootElement.openingElement) === 'ResponsiveFrame';
  return {
    importsFrame,
    frameCount,
    bypassReturnCount,
    rootIsFrame,
    rootRole: rootIsFrame ? literalSurface(rootElement.openingElement) : null,
    rootHasRenderedContent: rootIsFrame ? hasRenderedChild(rootElement) : false,
  };
}

function isCallNamed(node: ts.Node | undefined, name: string): boolean {
  return (
    node !== undefined &&
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === name
  );
}

function globalWidthViolations(path: string, source: string): string[] {
  const sourceFile = parseTsx(path, source);
  const layoutAliases = new Set<string>();

  // Follow straightforward aliases so `const viewport = L; viewport.width` cannot evade the guard.
  let changed = true;
  while (changed) {
    changed = false;
    walk(sourceFile, (node) => {
      if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name)) return;
      const initializer = node.initializer;
      if (
        isCallNamed(initializer, 'useLayout') ||
        (initializer !== undefined && ts.isIdentifier(initializer) && layoutAliases.has(initializer.text))
      ) {
        if (!layoutAliases.has(node.name.text)) {
          layoutAliases.add(node.name.text);
          changed = true;
        }
      }
    });
  }

  const violations: string[] = [];
  walk(sourceFile, (node) => {
    if (ts.isIdentifier(node) && ['Platform', 'Dimensions', 'useWindowDimensions'].includes(node.text)) {
      violations.push(node.text);
    }

    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === 'innerWidth' &&
      ts.isIdentifier(node.expression) &&
      ['window', 'globalThis'].includes(node.expression.text)
    ) {
      violations.push(node.getText());
    }

    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === 'width' &&
      ((ts.isIdentifier(node.expression) && layoutAliases.has(node.expression.text)) ||
        isCallNamed(node.expression, 'useLayout'))
    ) {
      violations.push(node.getText());
    }

    if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteral(node.argumentExpression) &&
      node.argumentExpression.text === 'width' &&
      ts.isIdentifier(node.expression) &&
      layoutAliases.has(node.expression.text)
    ) {
      violations.push(node.getText());
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      (isCallNamed(node.initializer, 'useLayout') ||
        (node.initializer !== undefined &&
          ts.isIdentifier(node.initializer) &&
          layoutAliases.has(node.initializer.text))) &&
      node.name.elements.some((element) => (element.propertyName ?? element.name).getText() === 'width')
    ) {
      violations.push(node.getText());
    }

    if (
      ts.isBinaryExpression(node) &&
      [
        ts.SyntaxKind.LessThanToken,
        ts.SyntaxKind.LessThanEqualsToken,
        ts.SyntaxKind.GreaterThanToken,
        ts.SyntaxKind.GreaterThanEqualsToken,
      ].includes(node.operatorToken.kind) &&
      [node.left, node.right].some((operand) => ts.isNumericLiteral(operand)) &&
      [node.left, node.right].some((operand) => /\b\w*width\w*\b/i.test(operand.getText()))
    ) {
      violations.push(node.getText());
    }
  });
  return [...new Set(violations)];
}

function gunDeckCardWidthUsesCappedOrLocalWidth(source: string): boolean {
  const sourceFile = parseTsx('app/gun-deck.tsx', source);
  let initializer: ts.Expression | undefined;
  walk(sourceFile, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'cardWidth') {
      initializer = node.initializer;
    }
  });
  if (initializer === undefined) return false;
  let hasLocalWidth = false;
  walk(initializer, (node) => {
    if (
      (ts.isIdentifier(node) &&
        /^(?:contentWidth|frameWidth|availableWidth|containerWidth)$/.test(node.text)) ||
      (ts.isPropertyAccessExpression(node) && node.name.text === 'width') ||
      (ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        /^useResponsive/.test(node.expression.text))
    ) {
      hasLocalWidth = true;
    }
  });
  return hasLocalWidth;
}

function emptyMountEffectBypassesGuidedDuel(source: string): string[] {
  const sourceFile = parseTsx('app/guided-duel.tsx', source);
  const bypasses: string[] = [];
  walk(sourceFile, (node) => {
    if (
      !ts.isCallExpression(node) ||
      !ts.isIdentifier(node.expression) ||
      node.expression.text !== 'useEffect' ||
      node.arguments.length < 2
    ) {
      return;
    }
    const dependencies = node.arguments[1];
    const effect = node.arguments[0];
    if (
      dependencies === undefined ||
      effect === undefined ||
      !ts.isArrayLiteralExpression(dependencies) ||
      dependencies.elements.length !== 0
    ) {
      return;
    }
    walk(effect, (effectNode) => {
      if (
        ts.isCallExpression(effectNode) &&
        ((ts.isPropertyAccessExpression(effectNode.expression) &&
          ['replace', 'push', 'markGuidedDuelFought'].includes(effectNode.expression.name.text)) ||
          (ts.isIdentifier(effectNode.expression) && effectNode.expression.text === 'markGuidedDuelFought'))
      ) {
        bypasses.push(effectNode.expression.getText());
      }
    });
  });
  return bypasses;
}

function frameConsumesResolvedContent(source: string): boolean {
  const sourceFile = parseTsx('src/components/ResponsiveFrame.tsx', source);
  let component: ts.FunctionLikeDeclaration | undefined;
  walk(sourceFile, (node) => {
    if (
      (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) &&
      node.name !== undefined &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'ResponsiveFrame'
    ) {
      if (ts.isFunctionDeclaration(node)) component = node;
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer !== undefined &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
      ) {
        component = node.initializer;
      }
    }
  });
  if (component?.body === undefined) return false;

  let callsResolver = false;
  let consumesContentWidth = false;
  let rendersChildren = false;
  walk(component.body, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'resolveResponsiveSurface' &&
      node.arguments.length === 2 &&
      node.arguments[1]?.getText() === 'surface'
    ) {
      callsResolver = true;
    }
    if (
      (ts.isPropertyAccessExpression(node) && node.name.text === 'contentWidth') ||
      (ts.isBindingElement(node) && (node.propertyName ?? node.name).getText() === 'contentWidth')
    ) {
      consumesContentWidth = true;
    }
    if (ts.isIdentifier(node) && node.text === 'children') rendersChildren = true;
  });
  return callsResolver && consumesContentWidth && rendersChildren;
}

function expectedGeometry(width: number, surface: Surface) {
  const viewport: ViewportClass = width < 600 ? 'compact' : width < 1024 ? 'tablet' : 'desktop';
  const gutter =
    viewport === 'compact' ? responsive.computeLayout(width, 667).gutter : viewport === 'tablet' ? 24 : 32;
  const cap = surface === 'reading' ? 760 : 1180;
  const available = width - 2 * gutter;
  const contentWidth = viewport === 'compact' ? available : Math.min(cap, available);
  const edge = (width - contentWidth) / 2;
  return { viewport, gutter, contentWidth, left: edge, right: edge };
}

function expectExactGeometry(width: number, surface: Surface): void {
  const layout = resolveSurface(width, surface);
  const expected = expectedGeometry(width, surface);
  expect(layout).toMatchObject(expected);
  for (const value of [layout.contentWidth, layout.gutter, layout.left, layout.right]) {
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
  }
  expect(layout.contentWidth).toBeGreaterThan(0);
}

const routeSource = (path: keyof typeof routeRoles) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('responsive tablet and desktop surfaces', () => {
  it('spec(A-043:AC-1) classifies and resolves exact 599/600/1023/1024 boundaries from width alone', () => {
    for (const width of [599, 600, 1023, 1024]) {
      for (const surface of ['reading', 'world'] as const) {
        expectExactGeometry(width, surface);
      }
    }
    for (const width of [320, 599, 600, 1023, 1024, 3840]) {
      expect(resolveSurface(width, 'world').viewport).toBe(resolveSurface(width, 'reading').viewport);
    }
  });

  it('spec(A-043:AC-2) preserves every compact width and its existing compact gutter', () => {
    for (let width = 320; width < 600; width += 1) {
      for (const surface of ['reading', 'world'] as const) {
        expectExactGeometry(width, surface);
      }
    }
  });

  it('spec(A-043:AC-3) gives reading surfaces the exact positive centered width capped at 760', () => {
    for (const width of new Set([600, 601, 759, 760, 807, 808, 1023, 1024, 10_000])) {
      expectExactGeometry(width, 'reading');
    }
    for (let width = 600; width <= 10_000; width += 7) {
      expectExactGeometry(width, 'reading');
    }
  });

  it('spec(A-043:AC-4) gives world surfaces the exact positive centered width capped at 1180', () => {
    for (const width of new Set([600, 601, 1023, 1024, 1243, 1244, 10_000])) {
      expectExactGeometry(width, 'world');
    }
    for (let width = 600; width <= 10_000; width += 7) {
      expectExactGeometry(width, 'world');
    }
  });

  it('scales world art with the measured content width past the phone clamp', () => {
    const scale = (responsive as { worldArtScale?: (w: number) => number }).worldArtScale;
    expect(scale, 'responsive.ts must export worldArtScale for chart/duel composition').toBeTypeOf(
      'function',
    );
    expect(scale!(375)).toBeCloseTo(1);
    expect(scale!(351)).toBeGreaterThanOrEqual(0.92);
    expect(scale!(1180)).toBeCloseTo(1180 / 375);
    expect(scale!(1180)).toBeGreaterThan(1.28);
  });

  it('spec(A-043:AC-5) makes the actual returned root of every child route its one role-correct frame', () => {
    for (const [path, surface] of Object.entries(routeRoles) as [keyof typeof routeRoles, Surface][]) {
      const source = routeSource(path);
      expect(inspectRoute(path, source), path).toEqual({
        importsFrame: true,
        frameCount: 1,
        bypassReturnCount: 0,
        rootIsFrame: true,
        rootRole: surface,
        rootHasRenderedContent: true,
      });
    }
  });

  it('spec(A-043:AC-5) derives route layout from capped/local content width, never the global viewport', () => {
    for (const path of Object.keys(routeRoles) as (keyof typeof routeRoles)[]) {
      expect(globalWidthViolations(path, routeSource(path)), path).toEqual([]);
    }
    const gunDeck = routeSource('app/gun-deck.tsx');
    expect(
      gunDeckCardWidthUsesCappedOrLocalWidth(gunDeck),
      'gun-deck cardWidth must derive from frame/content width or a locally measured container',
    ).toBe(true);
  });

  it('spec(A-043:AC-5) prevents the guided-duel null stub from bypassing its world surface', () => {
    const guided = routeSource('app/guided-duel.tsx');
    const contract = inspectRoute('app/guided-duel.tsx', guided);
    expect(contract.rootIsFrame).toBe(true);
    expect(contract.rootRole).toBe('world');
    expect(contract.rootHasRenderedContent).toBe(true);
    expect(
      emptyMountEffectBypassesGuidedDuel(guided),
      'guided-duel must render its world surface instead of completing/navigating on mount',
    ).toEqual([]);
  });

  it('spec(A-043:AC-5) rejects wrapper tokens, sibling content, and aliased global widths', () => {
    const wrapperTokenOnly = `
      import { ResponsiveFrame } from '../src/components/ResponsiveFrame';
      export default function Route() {
        const token = <ResponsiveFrame surface="reading"><View /></ResponsiveFrame>;
        return <View>{token && null}</View>;
      }
    `;
    expect(inspectRoute('synthetic.tsx', wrapperTokenOnly)).toMatchObject({
      frameCount: 1,
      bypassReturnCount: 1,
      rootIsFrame: false,
    });

    const emptyRoot = `
      import { ResponsiveFrame } from '../src/components/ResponsiveFrame';
      export default function Route() {
        return <ResponsiveFrame surface="reading">{null}</ResponsiveFrame>;
      }
    `;
    expect(inspectRoute('synthetic.tsx', emptyRoot).rootHasRenderedContent).toBe(false);

    const aliasedViewport = `
      export default function Route() {
        const L = useLayout();
        const viewport = L;
        const cardWidth = viewport.width / 2;
        return <View style={{ width: cardWidth }} />;
      }
    `;
    expect(globalWidthViolations('synthetic.tsx', aliasedViewport)).toContain('viewport.width');

    const guidedBypass = `
      export default function Guided() {
        useEffect(() => {
          captainStore.getState().markGuidedDuelFought();
          router.replace('/chart');
        }, []);
        return null;
      }
    `;
    expect(emptyMountEffectBypassesGuidedDuel(guidedBypass)).toEqual([
      'captainStore.getState().markGuidedDuelFought',
      'router.replace',
    ]);
  });

  it('spec(A-043:AC-6) freezes measurable non-clipping proxies while screenshots remain process evidence', () => {
    expect(MIN_TAP_TARGET).toBeGreaterThanOrEqual(64);
    const frameSource = readFileSync(resolve(process.cwd(), 'src/components/ResponsiveFrame.tsx'), 'utf8');
    expect(
      frameConsumesResolvedContent(frameSource),
      'ResponsiveFrame must resolve its role and consume contentWidth while rendering children',
    ).toBe(true);

    // These are the release-evidence widths, not a claim that Node rendered their RN heights.
    for (const width of [768, 1024, 1366, 1440]) {
      for (const surface of ['reading', 'world'] as const) {
        expectExactGeometry(width, surface);
        expect(resolveSurface(width, surface).contentWidth).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
      }
    }
  });
});
