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
  | 'rank'
  | 'fleet';

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

/**
 * Which band of the chart a control is drawn in (A-057).
 *
 * The designer's rule, and the reason this axis exists at all: **"the dock is for doing, the header
 * is for having."** Practice/Guns/Fight are verbs and stay in the dock; rank and coins are nouns —
 * things you *have* — and move up to the header pill. That also dissolves A-048/A-049's whole
 * five-controls-don't-fit problem: three buttons across 351pt is comfortable where five was
 * negative-slack.
 */
export type HubSurface = 'dock' | 'header';

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
    surface: HubSurface;
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
const popBack = (): DemoRouteAction => ({ kind: 'back' });

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
  edge('duel-chart-back', 'duel', 'chart', 1, popBack()),
  edge('harbor-chart-back', 'harbor', 'chart', 1, popBack()),
  // The empty purse is a place to visit, not an error (Harbor board 8c) — so it offers the two ways
  // to fill it rather than a dead end. "Go and earn" on the not-yet sheet lands on the same edge.
  edge('harbor-duel', 'harbor', 'duel', 1, push('duel')),
  edge('harbor-range', 'harbor', 'range', 1, push('range')),
  edge('rank-chart-back', 'rank', 'chart', 1, popBack()),
  // A-067: the fleet shelf hangs off the Rank screen — push in from the Rival Fleet row, pop
  // back out. The back edge lands on Rank, not the chart, because `fleet` is only ever pushed
  // from Rank; `back` is a stack pop, and Rank is what is under it by construction.
  edge('rank-fleet', 'rank', 'fleet', 1, push('fleet')),
  edge('fleet-rank-back', 'fleet', 'rank', 1, popBack()),
  edge('range-chart-back', 'range', 'chart', 1, popBack()),
  edge('chart-harbor', 'chart', 'harbor', 1, push('harbor')),
  edge('chart-rank', 'chart', 'rank', 1, push('rank')),
  edge('chart-range', 'chart', 'range', 1, push('range')),
  edge('chart-gun-deck', 'chart', 'gun-deck', 1, push('gun-deck')),
  edge('chart-duel', 'chart', 'duel', 1, push('duel')),
];

/**
 * The five hub controls, split across the two surfaces (A-057).
 *
 * Dock order is the board's own: Practice, Guns, Fight. `weight` is the board's flex ratio — Fight
 * is `1.2` because it is the primary verb and the board gives it the amber fill and the extra width.
 * Header controls have no weight; they are laid out as "the rest of the row" plus a fixed purse.
 */
const HUB_CONTROL_DEFS: readonly Readonly<{
  id: HubRoute;
  label: string;
  accessibilityLabel: string;
  surface: HubSurface;
  weight: number;
}>[] = [
  { id: 'range', label: 'Practice', accessibilityLabel: 'Training range', surface: 'dock', weight: 1 },
  { id: 'gun-deck', label: 'Guns', accessibilityLabel: 'Gun deck', surface: 'dock', weight: 1 },
  { id: 'duel', label: 'Fight', accessibilityLabel: 'Fight duel', surface: 'dock', weight: 1.2 },
  { id: 'rank', label: 'Rank', accessibilityLabel: 'Your log and rank', surface: 'header', weight: 0 },
  { id: 'harbor', label: 'Harbor', accessibilityLabel: 'Harbor store', surface: 'header', weight: 0 },
];

const MIN_HUB_TARGET = 64;

/**
 * The purse's width at the reference frame, summed from the board's own pieces:
 * `padding 8 + coin 22 + gap 8 + count ~36 + gap 8 + chevron 18 + padding 8`.
 *
 * It lives here rather than in `board.ts` because it is a *layout* input to the pure hub model, and
 * the model has to be computable without importing a component. The count is sized for four digits,
 * which is more coins than the economy can currently produce — a purse that reflows as the balance
 * crosses 1000 would shift the rank pill beside it.
 */
const HEADER_PURSE_WIDTH = 108;

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
 * dock chrome — never over an island station — and honour the 64pt target floor from the boards.
 *
 * ## Why the header band is measured by its HIT box, not its ink
 *
 * The board draws the rank pill 52pt tall and the purse 40pt, and says so deliberately: the purse
 * *"has to read as tappable without growing tall enough to break the chart header"*, so the visual
 * box stays small and **the touch target is padded to 64×64 invisibly**. That split is the whole
 * reason both fit up there.
 *
 * The pure model has to describe the target, because the target is what a child's thumb hits and
 * what `MIN_HUB_TARGET` is about. So `headerBand` below is `max(ink, 64)`, and the map starts
 * beneath *that* — not beneath the 52pt ink. Without this the arithmetic is genuinely impossible:
 * at 360pt the header ink runs y 5.8→55.7 while the map would start at 63.4, leaving 57.6pt of
 * clearance for a control that must be 64. Six points short, and no amount of nudging fixes it.
 *
 * ## `mapBounds` is the station-safe region, not the painted sea
 *
 * On the rebuilt close chart the sea is full-bleed and the header pill floats over it at `z-index:3`,
 * so "the map" as *pixels* starts under the status bar. `mapBounds` is not that. It is the region
 * where an island station may be placed — which is what the no-overlap rule has always actually
 * been protecting. A control that sits on open water above the first island covers nothing a child
 * needs to tap; a control over a station covers the game. The board agrees by construction: its
 * northernmost station sits at frame y 206, far below this boundary.
 */
export function chartHubControlLayout(viewport: Readonly<{ width: number; height: number }>): ChartHubLayout {
  const layout = computeLayout(viewport.width, viewport.height);
  const type = layout.type;
  const inset = HEADER.inset * type;

  const statusSpacer = (HEADER.top - FRAME.statusBar) * type;
  const headerBand = Math.max(HEADER.height * type, MIN_HUB_TARGET);
  const mapMargin = (MAP.top - HEADER.top - HEADER.height) * type;
  const mapTop = statusSpacer + headerBand + mapMargin;
  const dockHeight = DOCK.height * type;
  const mapHeight = Math.max(0, viewport.height - mapTop - dockHeight);

  const mapBounds: HubControlBounds = {
    x: 0,
    y: mapTop,
    width: viewport.width,
    height: mapHeight,
  };

  // ── Header band: the rank pill takes the slack, the purse is fixed. ────────────────────────────
  const headerGap = HEADER.gap * type;
  const purseWidth = Math.max(MIN_HUB_TARGET, HEADER_PURSE_WIDTH * type);
  const rankWidth = Math.max(MIN_HUB_TARGET, viewport.width - inset * 2 - headerGap - purseWidth);
  const headerBounds: Record<string, HubControlBounds> = {
    rank: { x: inset, y: statusSpacer, width: rankWidth, height: headerBand },
    harbor: {
      x: Math.max(inset + rankWidth + headerGap, viewport.width - inset - purseWidth),
      y: statusSpacer,
      width: purseWidth,
      height: headerBand,
    },
  };

  // ── Dock band: three weighted buttons, the board's 16pt gap. ───────────────────────────────────
  const dockDefs = HUB_CONTROL_DEFS.filter((def) => def.surface === 'dock');
  const dockBandTop = mapTop + mapHeight;
  const dockGap = DOCK.controlGap * type;
  const innerWidth = viewport.width - inset * 2;
  const weightTotal = dockDefs.reduce((sum, def) => sum + def.weight, 0);
  const spendable = Math.max(0, innerWidth - dockGap * Math.max(0, dockDefs.length - 1));
  // The button row is whatever the dock has left once its own header row and padding are taken.
  // Clamped to the tap floor so a short dock shrinks the map rather than the target.
  const rowHeight = Math.max(
    MIN_HUB_TARGET,
    (DOCK.height - DOCK.padding * 2 - DOCK.headerHeight - DOCK.gap) * type,
  );
  const rowY = dockBandTop + DOCK.padding * type + DOCK.headerHeight * type + DOCK.gap * type;

  let cursorX = inset;
  const dockBounds = new Map<string, HubControlBounds>();
  for (const def of dockDefs) {
    const width = Math.max(MIN_HUB_TARGET, weightTotal > 0 ? (spendable * def.weight) / weightTotal : 0);
    dockBounds.set(def.id, { x: cursorX, y: rowY, width, height: rowHeight });
    cursorX += width + dockGap;
  }

  const controls: HubControl[] = HUB_CONTROL_DEFS.map((def) => {
    const routeEdge = DEMO_ROUTE_EDGES.find(
      (candidate) => candidate.from === 'chart' && candidate.to === def.id,
    );
    if (routeEdge === undefined) throw new Error(`flow: chart hub missing edge for ${def.id}`);

    const bounds = def.surface === 'dock' ? dockBounds.get(def.id) : headerBounds[def.id];
    if (bounds === undefined) throw new Error(`flow: chart hub missing bounds for ${def.id}`);

    return {
      id: def.id,
      edgeId: routeEdge.id,
      route: `/${def.id}`,
      label: def.label,
      accessibilityLabel: def.accessibilityLabel,
      surface: def.surface,
      ...bounds,
    };
  });

  return {
    viewport: { x: 0, y: 0, width: viewport.width, height: viewport.height },
    mapBounds,
    controls,
  };
}
