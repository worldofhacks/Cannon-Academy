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
type Edge = Readonly<{ from: DemoRoute | 'boot'; to: DemoRoute; taps: number }>;
type Rect = Readonly<{ id: DemoRoute; x: number; y: number; width: number; height: number; label: string }>;

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

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

describe('A-038 demo navigation', () => {
  it('spec(A-038:AC-1) inventories every child-facing route and gives each a real inbound edge or boot destination', () => {
    // A route file that is not in this list is not allowed to silently become an unreviewed demo
    // screen.  Conversely, a promised route must exist as a file — deep-link-only wishful thinking
    // is not an inbound edge.
    expect(appRoutes()).toEqual([...ROUTE_FILES].sort());

    const edges = (flow as { DEMO_ROUTE_EDGES?: readonly Edge[] }).DEMO_ROUTE_EDGES;
    expect(edges).toBeDefined();
    expect(edges).toHaveLength(expect.any(Number));

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
    }
  });

  it('spec(A-038:AC-2) reaches Harbor, rank, training, gun deck, and fight from the chart in at most two taps and each return is chart-safe', () => {
    const edges = (flow as { DEMO_ROUTE_EDGES?: readonly Edge[] }).DEMO_ROUTE_EDGES ?? [];
    const required: readonly DemoRoute[] = ['harbor', 'rank', 'range', 'gun-deck', 'duel'];

    for (const destination of required) {
      const outbound = edges.filter((edge) => edge.from === 'chart' && edge.to === destination);
      expect(outbound, `chart cannot reach ${destination}`).toHaveLength(1);
      expect(outbound[0]?.taps, `${destination} takes more than two taps`).toBeLessThanOrEqual(2);

      const returnEdge = edges.filter((edge) => edge.from === destination && edge.to === 'chart');
      expect(returnEdge, `${destination} has no valid return to chart`).toHaveLength(1);
    }

    // Require the concrete chart-side route calls as well as the pure graph.  This remains a light
    // source contract: implementers may put controls in the dock, header, or a compact hub sheet.
    const chartSource = source('app/chart.tsx');
    const dockSource = source('src/components/chart/Dock.tsx');
    for (const destination of required) {
      const target = `/${destination}`;
      expect(
        chartSource.includes(target) || dockSource.includes(target),
        `${target} is declared but no chart-hub owner wires it`,
      ).toBe(true);
    }
  });

  it('spec(A-038:AC-3) keeps the guided duel ahead of normal navigation exactly until its latch is complete', () => {
    const fresh = readyCaptain({ hasFoughtGuidedDuel: false });
    expect(flow.resolveDestination(fresh)).toBe('guided-duel');
    expect(flow.resolveDestination({ ...fresh, hasFoughtGuidedDuel: true })).toBe('chart');
  });

  it('spec(A-038:AC-4) sends a completed-guidance legacy save with no equipped cannon to repair before chart navigation', () => {
    const corruptLoadout = readyCaptain({ equippedCannons: [] });
    expect(flow.resolveDestination(corruptLoadout)).toBe('gun-deck');
    // Guidance remains the one intentional earlier gate; once completed, the loadout repair must
    // not be bypassed by a chart default just because the captain still owns a cannon.
    expect(corruptLoadout.ownedCannons).not.toHaveLength(0);
  });

  it('spec(A-038:AC-5) lays out five labeled chart controls safely at 360pt with 64pt targets and no overlap', () => {
    const layout = (flow as { chartHubControlLayout?: (width: number) => readonly Rect[] })
      .chartHubControlLayout;
    expect(layout).toBeTypeOf('function');

    const controls = layout?.(360) ?? [];
    const required: readonly DemoRoute[] = ['harbor', 'rank', 'range', 'gun-deck', 'duel'];
    expect(controls.map((control) => control.id).sort()).toEqual([...required].sort());

    for (const control of controls) {
      expect(control.label.trim(), `${control.id} has no visible label/accessibility copy`).not.toBe('');
      expect(control.width, `${control.id} target width`).toBeGreaterThanOrEqual(64);
      expect(control.height, `${control.id} target height`).toBeGreaterThanOrEqual(64);
      expect(control.x, `${control.id} begins offscreen`).toBeGreaterThanOrEqual(0);
      expect(control.y, `${control.id} begins above the hub`).toBeGreaterThanOrEqual(0);
      expect(control.x + control.width, `${control.id} clips at 360pt`).toBeLessThanOrEqual(360);
    }
    for (let index = 0; index < controls.length; index += 1) {
      for (let other = index + 1; other < controls.length; other += 1) {
        const a = controls[index];
        const b = controls[other];
        if (a !== undefined && b !== undefined) expect(overlaps(a, b), `${a.id} covers ${b.id}`).toBe(false);
      }
    }

    // This does not claim to prove visual clipping: native screenshots do that.  It does prevent a
    // pure layout helper from being added but never consumed by the actual hub.
    const hubSources = [
      source('app/chart.tsx'),
      source('src/components/chart/Dock.tsx'),
      source('src/components/chart/HeaderPill.tsx'),
    ].join('\n');
    expect(hubSources).toContain('chartHubControlLayout');
  });
});
