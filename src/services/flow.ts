/**
 * Which screen a captain belongs on.
 *
 * A-003. One pure function, deliberately not a hook and not a component — so it can be tested
 * exhaustively, and so there is exactly ONE place that decides. Before this, three routes existed
 * and none guarded its preconditions: onboarding pushed straight into a duel because the chart did
 * not exist, a returning captain was shown the title again, and a duel entered without a grade
 * band silently defaulted to K-1.
 *
 * The order of the checks IS the onboarding sequence. Read top to bottom and you have the flow.
 *
 * A-038 adds the demo route graph and chart-hub control layout beside the boot resolver. The graph
 * is declared here so Vitest can prove every child-facing screen is reachable without a deep link.
 */
import { DOCK, FRAME, HEADER, MAP } from '../components/chart/board';
import { computeLayout } from '../theme/responsive';
import type { Captain } from '../stores/player';

/**
 * Every screen the resolver can send a captain to. Exported so the totality test can assert the
 * function never returns anything outside this set — a route that exists but is unreachable, or a
 * destination that exists but is not a route, are both caught here rather than on a device.
 */
export const DESTINATIONS = ['onboarding', 'name-flag', 'guided-duel', 'gun-deck', 'chart'] as const;

export type Destination = (typeof DESTINATIONS)[number];

/** Child-facing demo routes the chart hub must reach without a hidden URL. */
export type DemoRoute =
  | Destination
  | 'duel'
  | 'range'
  | 'gun-deck'
  | 'harbor'
  | 'rank';

export type RouteOrigin = DemoRoute | 'boot';

export type DemoActionKind = 'push' | 'replace' | 'back' | 'redirect';

export type DemoRouteAction = Readonly<{
  kind: DemoActionKind;
  href?: `/${DemoRoute}`;
}>;

export type DemoRouteEdge = Readonly<{
  id: string;
  from: RouteOrigin;
  to: DemoRoute;
  taps: number;
  action: DemoRouteAction;
}>;

export type HubRoute = 'harbor' | 'rank' | 'range' | 'gun-deck' | 'duel';

export type HubControlBounds = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type HubControl = HubControlBounds &
  Readonly<{
    id: HubRoute;
    edgeId: string;
    route: `/${HubRoute}`;
    label: string;
    accessibilityLabel: string;
  }>;

export type ChartHubLayout = Readonly<{
  viewport: HubControlBounds;
  mapBounds: HubControlBounds;
  controls: readonly HubControl[];
}>;

export type NavigationPort = Readonly<{
  push: (href: string) => void;
  replace: (href: string) => void;
  back: () => void;
  redirect: (href: string) => void;
}>;

const edge = (
  id: string,
  from: RouteOrigin,
  to: DemoRoute,
  taps: number,
  action: DemoRouteAction,
): DemoRouteEdge => ({ id, from, to, taps, action });

const push = (to: DemoRoute): DemoRouteAction => ({ kind: 'push', href: `/${to}` });
const replace = (to: DemoRoute): DemoRouteAction => ({ kind: 'replace', href: `/${to}` });
const redirect = (to: DemoRoute): DemoRouteAction => ({ kind: 'redirect', href: `/${to}` });
const backToChart = (): DemoRouteAction => ({ kind: 'back' });

/** Resolver destinations expanded into boot/name-flag/gun-deck replace edges. */
const resolverReplaceEdges = (from: RouteOrigin, idPrefix: string): readonly DemoRouteEdge[] =>
  DESTINATIONS.map((destination) =>
    edge(`${idPrefix}-${destination}`, from, destination, 0, replace(destination)),
  );

/**
 * The declared demo route graph. Each edge binds exactly once to executable route syntax or a chart
 * hub control — see `__tests__/app/demo-navigation.test.ts`.
 */
export const DEMO_ROUTE_EDGES: readonly DemoRouteEdge[] = [
  ...DESTINATIONS.map((destination) =>
    edge(`boot-${destination}`, 'boot', destination, 0, redirect(destination)),
  ),
  ...resolverReplaceEdges('name-flag', 'name-flag'),
  edge('guided-duel-chart-replace', 'guided-duel', 'chart', 0, replace('chart')),
  edge('guided-duel-chart-redirect', 'guided-duel', 'chart', 0, redirect('chart')),
  edge('guided-duel-gun-deck-redirect', 'guided-duel', 'gun-deck', 0, redirect('gun-deck')),
  edge('guided-duel-retry', 'guided-duel', 'guided-duel', 0, replace('guided-duel')),
  ...resolverReplaceEdges('gun-deck', 'gun-deck'),
  edge('duel-onboarding-redirect', 'duel', 'onboarding', 0, redirect('onboarding')),
  edge('duel-name-flag-redirect', 'duel', 'name-flag', 0, redirect('name-flag')),
  edge('duel-guided-duel-redirect', 'duel', 'guided-duel', 0, redirect('guided-duel')),
  edge('duel-gun-deck-redirect', 'duel', 'gun-deck', 0, redirect('gun-deck')),
  edge('duel-chart-back', 'duel', 'chart', 1, backToChart()),
  edge('harbor-chart-back', 'harbor', 'chart', 1, backToChart()),
  edge('rank-chart-back', 'rank', 'chart', 1, backToChart()),
  edge('range-chart-back', 'range', 'chart', 1, backToChart()),
  edge('chart-harbor', 'chart', 'harbor', 1, push('harbor')),
  edge('chart-rank', 'chart', 'rank', 1, push('rank')),
  edge('chart-range', 'chart', 'range', 1, push('range')),
  edge('chart-gun-deck', 'chart', 'gun-deck', 1, push('gun-deck')),
  edge('chart-duel', 'chart', 'duel', 1, push('duel')),
];

const HUB_CONTROL_DEFS: readonly Readonly<{ id: HubRoute; label: string; accessibilityLabel: string }>[] =
  [
    { id: 'harbor', label: 'Harbor', accessibilityLabel: 'Harbor store' },
    { id: 'rank', label: 'Rank', accessibilityLabel: 'Rank ladder' },
    { id: 'range', label: 'Practice', accessibilityLabel: 'Training range' },
    { id: 'gun-deck', label: 'Guns', accessibilityLabel: 'Gun deck' },
    { id: 'duel', label: 'Fight', accessibilityLabel: 'Fight duel' },
  ];

const MIN_HUB_TARGET = 64;

export function resolveDestination(captain: Captain): Destination {
  // 1. No band means we do not know what maths to show. Nothing else can proceed.
  if (captain.gradeBand === null) return 'onboarding';

  // 2. The flag becomes the ship's pennant (board 5b), so this is not cosmetic bookkeeping —
  //    it is the step that makes the ship theirs before the first chest.
  if (captain.name.trim() === '' || captain.flag === null) return 'name-flag';

  // 3. The guided duel runs exactly once. `hasFoughtGuidedDuel` is the latch; without it a
  //    returning captain would be walked through the tutorial on every launch.
  if (!captain.hasFoughtGuidedDuel) return 'guided-duel';

  // 4. A captain with nothing equipped cannot duel. Diverting to the gun deck is the difference
  //    between "choose your guns" and a duel screen with an empty tray.
  if (captain.equippedCannons.length === 0) return 'gun-deck';

  // 5. The hub. Everything routes through here, including a cold start mid-duel — which is why
  //    the chart is the answer rather than a resumed duel (PLAN.md: "relaunch, land safely on
  //    the map with progress intact").
  return 'chart';
}

/** Executes one declared demo edge through an injected navigation port (test seam + chart hub). */
export function executeDemoRouteEdge(edgeId: string, navigator: NavigationPort): void {
  const routeEdge = DEMO_ROUTE_EDGES.find((candidate) => candidate.id === edgeId);
  if (routeEdge === undefined) throw new Error(`flow: unknown demo route edge ${edgeId}`);

  switch (routeEdge.action.kind) {
    case 'back':
      navigator.back();
      return;
    case 'push':
      navigator.push(routeEdge.action.href ?? '/chart');
      return;
    case 'replace':
      navigator.replace(routeEdge.action.href ?? '/chart');
      return;
    case 'redirect':
      navigator.redirect(routeEdge.action.href ?? '/chart');
      return;
  }
}

/**
 * Pure geometry for the five chart-hub controls at a phone viewport. Positions sit in header and
 * dock chrome — never over the island map — and honour the 64pt target floor from the boards.
 */
export function chartHubControlLayout(viewport: Readonly<{ width: number; height: number }>): ChartHubLayout {
  const layout = computeLayout(viewport.width, viewport.height);
  const type = layout.type;

  const statusSpacer = (HEADER.top - FRAME.statusBar) * type;
  const headerHeight = HEADER.height * type;
  const mapMargin = (MAP.top - HEADER.top - HEADER.height) * type;
  const mapTop = statusSpacer + headerHeight + mapMargin;
  const dockHeight = DOCK.height * type;
  const mapHeight = Math.max(0, viewport.height - mapTop - dockHeight);

  const mapBounds: HubControlBounds = {
    x: 0,
    y: mapTop,
    width: viewport.width,
    height: mapHeight,
  };

  const dockBandTop = mapTop + mapHeight;
  const inset = HEADER.inset * type;
  const target = Math.max(MIN_HUB_TARGET, DOCK.buttonHeight * type);
  const innerWidth = viewport.width - inset * 2;
  const gap =
    HUB_CONTROL_DEFS.length > 1
      ? Math.max(0, (innerWidth - HUB_CONTROL_DEFS.length * target) / (HUB_CONTROL_DEFS.length - 1))
      : 0;
  const rowStartX = inset;
  const rowY = dockBandTop + DOCK.padding * type + DOCK.headerHeight * type + DOCK.gap * type;

  const controls: HubControl[] = HUB_CONTROL_DEFS.map((def, index) => {
    const routeEdge = DEMO_ROUTE_EDGES.find(
      (candidate) => candidate.from === 'chart' && candidate.to === def.id,
    );
    if (routeEdge === undefined) throw new Error(`flow: chart hub missing edge for ${def.id}`);

    return {
      id: def.id,
      edgeId: routeEdge.id,
      route: `/${def.id}`,
      label: def.label,
      accessibilityLabel: def.accessibilityLabel,
      x: rowStartX + index * (target + gap),
      y: rowY,
      width: target,
      height: target,
    };
  });

  return {
    viewport: { x: 0, y: 0, width: viewport.width, height: viewport.height },
    mapBounds,
    controls,
  };
}
