/**
 * A-038 — the demo route graph and chart-hub affordances.
 *
 * RN components deliberately have no node test harness (posture.md).  The pure navigation
 * contract is consequently exported from `services/flow`, while the two small source guards below
 * make sure the chart actually consumes it rather than leaving a truthful but disconnected map.
 * Screenshot/device evidence remains the authority for composition, clipping, and hit testing.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import * as flow from '../../src/services/flow';
import { emptyCaptain, type Captain } from '../../src/stores/player';

const ROOT = join(process.cwd());
const APP = join(ROOT, 'app');

const DEMO_ROUTES = [
  'onboarding',
  'name-flag',
  'guided-duel',
  'chart',
  'duel',
  'range',
  'gun-deck',
  'harbor',
  'rank',
] as const;

/** `index` is the intentional boot redirect, not a child-facing destination. */
const ROUTE_FILES = ['index', ...DEMO_ROUTES] as const;

type DemoRoute = (typeof DEMO_ROUTES)[number];
type RouteOrigin = DemoRoute | 'boot';
type ActionKind = 'push' | 'replace' | 'back' | 'redirect';
type Edge = Readonly<{
  id: string;
  from: RouteOrigin;
  to: DemoRoute;
  taps: number;
  action: Readonly<{ kind: ActionKind; href?: `/${DemoRoute}` }>;
}>;
type Bounds = Readonly<{ x: number; y: number; width: number; height: number }>;
type HubRoute = 'harbor' | 'rank' | 'range' | 'gun-deck' | 'duel';
type HubControl = Readonly<
  Bounds & {
    id: HubRoute;
    edgeId: string;
    route: `/${HubRoute}`;
    label: string;
    accessibilityLabel: string;
  }
>;
type HubLayout = Readonly<{
  viewport: Bounds;
  mapBounds: Bounds;
  controls: readonly HubControl[];
}>;
type NavigationPort = Readonly<{
  push: (href: string) => void;
  replace: (href: string) => void;
  back: () => void;
  redirect: (href: string) => void;
}>;
type ExecutableTransition = Readonly<{
  from: RouteOrigin;
  to: DemoRoute;
  kind: ActionKind;
}>;

const captain = (over: Partial<Captain> = {}): Captain => ({ ...emptyCaptain(), ...over });

const readyCaptain = (over: Partial<Captain> = {}): Captain =>
  captain({
    gradeBand: 'k_1',
    name: 'Ada',
    flag: 'flag-1',
    ownedCannons: ['swivel_gun'],
    equippedCannons: ['swivel_gun'],
    unlockedIslands: ['port_sumwich'],
    hasCompletedOnboarding: true,
    hasFoughtGuidedDuel: true,
    ...over,
  });

function appRoutes(): readonly string[] {
  return readdirSync(APP)
    .filter((file) => file.endsWith('.tsx') && !file.startsWith('_'))
    .map((file) => file.replace(/\.tsx$/, ''))
    .sort();
}

function source(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

function overlaps(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function routeFromHref(value: string): DemoRoute | null {
  const route = value.replace(/^\//, '');
  return (DEMO_ROUTES as readonly string[]).includes(route) ? (route as DemoRoute) : null;
}

function containsCall(node: ts.Node, name: string): boolean {
  let found = false;
  const visit = (child: ts.Node) => {
    if (ts.isCallExpression(child) && ts.isIdentifier(child.expression) && child.expression.text === name) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function literalHref(node: ts.Node): DemoRoute | null {
  if (ts.isStringLiteralLike(node)) return routeFromHref(node.text);
  if (ts.isNoSubstitutionTemplateLiteral(node)) return routeFromHref(node.text);
  return null;
}

/**
 * Derives transitions from executable syntax only. TypeScript's AST drops comments, so route names
 * in prose cannot satisfy this evidence. Resolver calls expand to their finite declared outputs;
 * `back()` is chart-safe because these child routes are entered only from the chart contract.
 */
function executableTransitions(): readonly ExecutableTransition[] {
  const found = new Map<string, ExecutableTransition>();
  for (const file of appRoutes()) {
    const origin: RouteOrigin = file === 'index' ? 'boot' : (file as DemoRoute);
    const parsed = ts.createSourceFile(
      `${file}.tsx`,
      source(`app/${file}.tsx`),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    const record = (to: DemoRoute, kind: ActionKind) => {
      const transition = { from: origin, to, kind } as const;
      found.set(`${origin}:${to}:${kind}`, transition);
    };

    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'router'
      ) {
        const method = node.expression.name.text;
        if (method === 'back') {
          if (origin !== 'boot') record('chart', 'back');
        } else if (method === 'push' || method === 'replace') {
          const argument = node.arguments[0];
          const exact = argument === undefined ? null : literalHref(argument);
          if (exact !== null) record(exact, method);
          else if (argument !== undefined && containsCall(argument, 'resolveDestination')) {
            for (const destination of flow.DESTINATIONS) record(destination, method);
          }
        }
      }

      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(parsed) === 'Redirect') {
        const href = node.attributes.properties.find(
          (property): property is ts.JsxAttribute =>
            ts.isJsxAttribute(property) && property.name.getText(parsed) === 'href',
        );
        const initializer = href?.initializer;
        if (initializer !== undefined) {
          const exact =
            ts.isStringLiteral(initializer) || ts.isJsxExpression(initializer)
              ? literalHref(
                  ts.isJsxExpression(initializer) ? (initializer.expression ?? initializer) : initializer,
                )
              : null;
          if (exact !== null) record(exact, 'redirect');
          else if (containsCall(initializer, 'resolveDestination')) {
            for (const destination of flow.DESTINATIONS) record(destination, 'redirect');
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(parsed);
  }
  return [...found.values()];
}

function importedLocalName(parsed: ts.SourceFile, exported: string): string | null {
  for (const statement of parsed.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.moduleSpecifier.text.endsWith('/services/flow')
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const member = bindings.elements.find(
      (element) => (element.propertyName ?? element.name).text === exported,
    );
    if (member !== undefined) return member.name.text;
  }
  return null;
}

function callExpressions(parsed: ts.SourceFile, localName: string): readonly ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === localName) {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return calls;
}

/**
 * Proves the layout helper's return value crosses the React boundary into a rendered chart child.
 * This is intentionally narrower than claiming native hit-testing: the screenshot/device gate owns
 * composition, while this guard prevents an unused helper or a comment from turning the unit green.
 */
function chartConsumesLayoutModel(): boolean {
  const parsed = ts.createSourceFile(
    'chart.tsx',
    source('app/chart.tsx'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const localName = importedLocalName(parsed, 'chartHubControlLayout');
  if (localName === null) return false;
  const calls = callExpressions(parsed, localName);
  if (calls.length === 0) return false;

  const boundNames = new Set<string>();
  for (const call of calls) {
    if (ts.isVariableDeclaration(call.parent) && ts.isIdentifier(call.parent.name)) {
      boundNames.add(call.parent.name.text);
    }
    let cursor: ts.Node | undefined = call.parent;
    while (cursor !== undefined) {
      if (ts.isJsxExpression(cursor)) return true;
      cursor = cursor.parent;
    }
  }

  let consumed = false;
  const visit = (node: ts.Node) => {
    const initializer = ts.isJsxAttribute(node) ? node.initializer : undefined;
    if (
      ts.isJsxAttribute(node) &&
      initializer !== undefined &&
      ts.isJsxExpression(initializer) &&
      initializer.expression !== undefined &&
      ts.isIdentifier(initializer.expression) &&
      boundNames.has(initializer.expression.text)
    ) {
      const opening = node.parent.parent;
      const tag =
        ts.isJsxOpeningElement(opening) || ts.isJsxSelfClosingElement(opening)
          ? opening.tagName.getText(parsed)
          : '';
      if (tag === 'ChartDock' || tag === 'HeaderPill') consumed = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return consumed;
}

function chartCallsEdgeExecutor(): boolean {
  for (const file of [
    'app/chart.tsx',
    'src/components/chart/Dock.tsx',
    'src/components/chart/HeaderPill.tsx',
  ]) {
    const parsed = ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const localName = importedLocalName(parsed, 'executeDemoRouteEdge');
    if (localName !== null && callExpressions(parsed, localName).length > 0) return true;
  }
  return false;
}

describe('A-038 demo navigation', () => {
  it('spec(A-038:AC-1) inventories every child-facing route and gives each a real inbound edge or boot destination', () => {
    // A route file that is not in this list is not allowed to silently become an unreviewed demo
    // screen.  Conversely, a promised route must exist as a file — deep-link-only wishful thinking
    // is not an inbound edge.
    expect(appRoutes()).toEqual([...ROUTE_FILES].sort());

    const edges = (flow as { DEMO_ROUTE_EDGES?: readonly Edge[] }).DEMO_ROUTE_EDGES;
    expect(edges).toBeDefined();
    expect(edges?.length).toBeGreaterThan(0);
    expect(new Set(edges?.map((edge) => edge.id)).size).toBe(edges?.length);

    for (const route of DEMO_ROUTES) {
      expect(
        edges?.some((edge) => edge.to === route),
        `${route} has no declared inbound edge`,
      ).toBe(true);
    }

    // The declaration is not enough by itself: a route edge must name a real route file, and
    // deep-link strings must occur at one of the actual app/chart hub owners (not in a comment in
    // the registry).  `boot` is the intentional entry route, never a child-facing destination.
    for (const edge of edges ?? []) {
      expect(DEMO_ROUTES).toContain(edge.to);
      expect(existsSync(join(APP, `${edge.to}.tsx`))).toBe(true);
      expect(Number.isInteger(edge.taps) && edge.taps >= 0).toBe(true);
      expect(edge.action.kind).toMatch(/^(push|replace|back|redirect)$/);
      if (edge.action.kind === 'back') expect(edge.action.href).toBeUndefined();
      else expect(edge.action.href).toBe(`/${edge.to}`);
    }

    const transitions = executableTransitions();
    const layout = (
      flow as {
        chartHubControlLayout?: (viewport: Readonly<{ width: number; height: number }>) => HubLayout;
      }
    ).chartHubControlLayout;
    const chartControls = layout?.({ width: 360, height: 640 }).controls ?? [];
    for (const edge of edges ?? []) {
      const sourceBindings = transitions.filter(
        (transition) =>
          transition.from === edge.from && transition.to === edge.to && transition.kind === edge.action.kind,
      );
      // Chart exits bind through the consumed hub-control model in AC-2/AC-5. Every other edge,
      // including boot redirects and child returns, must derive from executable route syntax.
      const controlBindings =
        edge.from === 'chart' ? chartControls.filter((control) => control.edgeId === edge.id) : [];
      expect(
        edge.from === 'chart' ? controlBindings : sourceBindings,
        `${edge.id} is not bound exactly once to executable route/control syntax`,
      ).toHaveLength(1);
    }
  });

  it('spec(A-038:AC-2) reaches Harbor, rank, training, gun deck, and fight from the chart in at most two taps and each return is chart-safe', () => {
    const edges = (flow as { DEMO_ROUTE_EDGES?: readonly Edge[] }).DEMO_ROUTE_EDGES ?? [];
    const required: readonly HubRoute[] = ['harbor', 'rank', 'range', 'gun-deck', 'duel'];

    for (const destination of required) {
      const outbound = edges.filter((edge) => edge.from === 'chart' && edge.to === destination);
      expect(outbound, `chart cannot reach ${destination}`).toHaveLength(1);
      expect(outbound[0]?.taps, `${destination} takes more than two taps`).toBeLessThanOrEqual(2);

      const returnEdge = edges.filter((edge) => edge.from === destination && edge.to === 'chart');
      expect(returnEdge, `${destination} has no valid return to chart`).toHaveLength(1);
    }

    const execute = (
      flow as {
        executeDemoRouteEdge?: (edgeId: string, navigator: NavigationPort) => void;
      }
    ).executeDemoRouteEdge;
    expect(execute).toBeTypeOf('function');

    for (const edge of edges) {
      const calls: string[] = [];
      const navigator: NavigationPort = {
        push: (href) => calls.push(`push:${href}`),
        replace: (href) => calls.push(`replace:${href}`),
        back: () => calls.push('back'),
        redirect: (href) => calls.push(`redirect:${href}`),
      };
      execute?.(edge.id, navigator);
      const expected = edge.action.kind === 'back' ? 'back' : `${edge.action.kind}:${edge.action.href ?? ''}`;
      expect(calls, `${edge.id} does not execute its declared transition`).toEqual([expected]);
    }
  });

  it('spec(A-038:AC-3) keeps the guided duel ahead of normal navigation exactly until its latch is complete', () => {
    const fresh = readyCaptain({ hasFoughtGuidedDuel: false });
    expect(flow.resolveDestination(fresh)).toBe('guided-duel');
    expect(flow.resolveDestination({ ...fresh, hasFoughtGuidedDuel: true })).toBe('chart');
    expect(flow.resolveDestination(readyCaptain({ hasFoughtGuidedDuel: true, equippedCannons: [] }))).toBe(
      'gun-deck',
    );
  });

  it('spec(A-038:AC-4) sends a completed-guidance legacy save with no equipped cannon to repair before chart navigation', () => {
    const corruptLoadout = readyCaptain({ equippedCannons: [] });
    expect(flow.resolveDestination(corruptLoadout)).toBe('gun-deck');
    // Guidance remains the one intentional earlier gate; once completed, the loadout repair must
    // not be bypassed by a chart default just because the captain still owns a cannon.
    expect(corruptLoadout.ownedCannons).not.toHaveLength(0);
  });

  it('spec(A-038:AC-5) lays out five labeled chart controls safely at 360pt with 64pt targets and no overlap', () => {
    const layout = (
      flow as {
        chartHubControlLayout?: (viewport: Readonly<{ width: number; height: number }>) => HubLayout;
      }
    ).chartHubControlLayout;
    expect(layout).toBeTypeOf('function');

    const hub = layout?.({ width: 360, height: 640 });
    const controls = hub?.controls ?? [];
    const required: readonly HubRoute[] = ['harbor', 'rank', 'range', 'gun-deck', 'duel'];
    expect(controls.map((control) => control.id).sort()).toEqual([...required].sort());
    expect(new Set(controls.map((control) => control.route)).size).toBe(required.length);
    expect(new Set(controls.map((control) => control.edgeId)).size).toBe(required.length);
    expect(new Set(controls.map((control) => control.accessibilityLabel)).size).toBe(required.length);

    const edges = (flow as { DEMO_ROUTE_EDGES?: readonly Edge[] }).DEMO_ROUTE_EDGES ?? [];
    for (const destination of required) {
      const control = controls.find((candidate) => candidate.id === destination);
      expect(control?.route).toBe(`/${destination}`);
      expect(control?.label.trim(), `${destination} has no visible label`).not.toBe('');
      expect(control?.accessibilityLabel.trim(), `${destination} has no accessible label`).not.toBe('');
      expect(
        edges.filter(
          (edge) => edge.id === control?.edgeId && edge.from === 'chart' && edge.to === destination,
        ),
        `${destination} control is not bound one-to-one to its route edge`,
      ).toHaveLength(1);
    }

    expect(hub?.viewport).toEqual({ x: 0, y: 0, width: 360, height: 640 });
    expect(hub?.mapBounds.width).toBeGreaterThan(0);
    expect(hub?.mapBounds.height).toBeGreaterThan(0);
    expect(hub?.mapBounds.x).toBeGreaterThanOrEqual(0);
    expect(hub?.mapBounds.y).toBeGreaterThanOrEqual(0);
    expect((hub?.mapBounds.x ?? 361) + (hub?.mapBounds.width ?? 0)).toBeLessThanOrEqual(360);
    expect((hub?.mapBounds.y ?? 641) + (hub?.mapBounds.height ?? 0)).toBeLessThanOrEqual(640);
    for (const control of controls) {
      expect(control.label.trim(), `${control.id} has no visible label/accessibility copy`).not.toBe('');
      expect(control.width, `${control.id} target width`).toBeGreaterThanOrEqual(64);
      expect(control.height, `${control.id} target height`).toBeGreaterThanOrEqual(64);
      expect(control.x, `${control.id} begins offscreen`).toBeGreaterThanOrEqual(0);
      expect(control.y, `${control.id} begins above the hub`).toBeGreaterThanOrEqual(0);
      expect(control.x + control.width, `${control.id} clips at 360pt`).toBeLessThanOrEqual(360);
      expect(control.y + control.height, `${control.id} clips below 640pt`).toBeLessThanOrEqual(640);
      expect(
        overlaps(control, hub?.mapBounds ?? control),
        `${control.id} covers the chart map and therefore an island station`,
      ).toBe(false);
    }
    for (let index = 0; index < controls.length; index += 1) {
      for (let other = index + 1; other < controls.length; other += 1) {
        const a = controls[index];
        const b = controls[other];
        if (a !== undefined && b !== undefined) expect(overlaps(a, b), `${a.id} covers ${b.id}`).toBe(false);
      }
    }

    // This does not claim to prove visual clipping: native screenshots do that. TypeScript AST
    // checks ignore comments and require the actual helper result to cross into a rendered chart
    // child, plus an executable call of the edge dispatcher somewhere in the hub owners.
    expect(chartConsumesLayoutModel()).toBe(true);
    expect(chartCallsEdgeExecutor()).toBe(true);
  });
});
