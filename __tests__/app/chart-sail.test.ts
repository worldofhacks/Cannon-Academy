/**
 * A-063 — the ship sails to the island it just earned, and the next battle begins.
 *
 * The chart cannot render headless (importing a `.tsx` pulls in React Native's Flow entry point),
 * so this suite follows the repo's two established substitutes, both already precedented:
 *
 *   1. **Extract-and-execute** for the pure parts. `sailPointAt` (ChartShip.tsx) and `sailPlan`
 *      (app/chart.tsx) are exported top-level function declarations that reference nothing but
 *      their own parameters and `Math`. The TypeScript compiler API lifts each declaration out of
 *      its file, transpiles it, and evaluates it — so AC-2's curve equivalence and AC-3/AC-4's
 *      trigger decisions are asserted on the REAL shipped functions, numerically, with no
 *      component harness. (`chart-worklet-safety.test.ts` walks the same ASTs; this goes one step
 *      further only because these two functions are deliberately closure-free.)
 *
 *   2. **Source guards** for the wiring — which expression is passed where — exactly as
 *      `design-fidelity.test.ts` pins `rankTier={rankTierForWins(captain.wins)}`: the failure mode
 *      is the wiring, and a value test would pass while the wiring stayed wrong.
 *
 * The double-fire discipline being guarded is the settlement effect's own (`app/duel.tsx:139-151`):
 * an effect that can observe the same fact twice must consume it before acting on it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  CLOSE,
  FRAME,
  HEADER,
  SHIP,
  TRAIL,
  TRAIL_LOOK,
  VOYAGE,
  nodeCentre,
  trailDots,
} from '../../src/components/chart/board';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../../${relative}`, import.meta.url)), 'utf8');

/**
 * Lift a top-level `function name(...)` declaration out of a source file and evaluate it.
 *
 * Only legal for functions that are deliberately closure-free (parameters + `Math` and nothing
 * else) — which is itself part of A-063's contract: the curve must be computable anywhere,
 * including pre-sampled into the plain captured numbers a worklet is allowed to hold.
 *
 * The evaluated text is this repo's own checked-in source under `src/`/`app/` — the same trust
 * domain as importing the module — and `name` is a string literal in this file. No user or
 * network input can reach the constructor. (`no-new-func` guards `src/engine`/`src/content`,
 * where dynamic code would break replay; tests are deliberately outside that fence.)
 */
function extractFunction(relativePath: string, name: string): (...args: never[]) => unknown {
  const source = read(relativePath);
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.ESNext,
    true,
    relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  let text: string | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      text = node.getText(sourceFile);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (text === undefined) throw new Error(`${relativePath} does not declare function ${name}`);
  const js = ts.transpileModule(text.replace(/^export\s+/, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return new Function(`${js}; return ${name};`)() as (...args: never[]) => unknown;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

type SailPointAt = (leg: number, from: Point, to: Point, bow: number, t: number) => Point;

interface CaptainSnapshot {
  readonly currentIsland: string | null;
  readonly unlockedIslands: readonly string[];
}

type SailPlanFn = (
  prev: CaptainSnapshot,
  next: CaptainSnapshot,
) => { kind: 'travel' | 'arrival'; fromId: string; toId: string } | null;

const sailPointAt = extractFunction('src/components/chart/ChartShip.tsx', 'sailPointAt') as SailPointAt;
const sailPlan = extractFunction('app/chart.tsx', 'sailPlan') as SailPlanFn;

const shipSource = read('src/components/chart/ChartShip.tsx');
const voyageSource = read('src/components/chart/VoyageMap.tsx');
const chartSource = read('app/chart.tsx');

/**
 * The ship's berth centre, re-derived from `VOYAGE` exactly as `VoyageMap.shipLeft` documents it:
 * seaward of the island (the side facing the map's far edge), level with its middle. Re-derived
 * rather than imported because the renderer's copy lives in a `.tsx` — the same reason
 * `design-fidelity.test.ts` re-derives the trail legs.
 */
function berthCentre(isle: { x: number; y: number; w: number; h: number }): Point {
  const centre = isle.x + isle.w / 2;
  const seaward = centre < VOYAGE.map.width / 2 ? 1 : -1;
  const offset = isle.w / 2 + VOYAGE.ship.shallowBleedX + VOYAGE.ship.gap + VOYAGE.ship.width / 2;
  return { x: centre + seaward * offset, y: isle.y + isle.h / 2 };
}

describe('A-063 — the ship sails to the island it just earned, and the next battle begins', () => {
  it("spec(A-063:AC-2) the sail path reproduces trailDots' curve dot-for-dot on every printed leg", () => {
    // The same inputs trailDots gets — two node centres per chain link — sampled at each dot's own
    // t. If the interpolation, the sin bow, or the per-leg sign diverges by any amount, some dot
    // on some leg disagrees.
    const tags = VOYAGE.isleTags;
    for (let leg = 0; leg + 1 < tags.length; leg += 1) {
      const from = nodeCentre(tags[leg]!);
      const to = nodeCentre(tags[leg + 1]!);
      const dots = trailDots(leg, from, to, TRAIL_LOOK.sailed.size);
      expect(dots.length, `leg ${leg} printed no dots`).toBeGreaterThanOrEqual(TRAIL.minDots);
      dots.forEach((dot, i) => {
        const t = (i + 1) / (dots.length + 1);
        const point = sailPointAt(leg, from, to, TRAIL.bow, t);
        expect(point.x, `leg ${leg} dot ${i + 1} x`).toBeCloseTo(dot.x, 9);
        expect(point.y, `leg ${leg} dot ${i + 1} y`).toBeCloseTo(dot.y, 9);
      });
    }
  });

  it('spec(A-063:AC-2) the curve lands on both berths, bows opposite ways on consecutive legs, and survives a zero-length leg', () => {
    const from = { x: 100, y: 100 };
    const to = { x: 100, y: 300 };

    // trailDots never samples t=0 or t=1 (no dot lands on a node); the sail must, because the ship
    // really does start and end ON the berths — the closed form has to be exact there.
    expect(sailPointAt(0, from, to, TRAIL.bow, 0)).toEqual(from);
    const end = sailPointAt(0, from, to, TRAIL.bow, 1);
    expect(end.x).toBeCloseTo(to.x, 9);
    expect(end.y).toBeCloseTo(to.y, 9);

    // A straight-down leg has perpendicular (-1, 0): an even leg bows one way, an odd leg the
    // other — the alternating sign that stops two consecutive legs reading as one kinked line.
    const mid0 = sailPointAt(0, from, to, TRAIL.bow, 0.5);
    const mid1 = sailPointAt(1, from, to, TRAIL.bow, 0.5);
    expect(mid0.x).toBeCloseTo(100 - TRAIL.bow, 9);
    expect(mid1.x).toBeCloseTo(100 + TRAIL.bow, 9);
    expect(mid0.y).toBeCloseTo(200, 9);
    expect(mid1.y).toBeCloseTo(200, 9);

    // Zero-length leg: trailDots returns []; the point form returns the berth itself.
    expect(sailPointAt(2, from, from, TRAIL.bow, 0.5)).toEqual(from);
  });

  it('spec(A-063:AC-2) the shipped worklet is fed by that exact curve — pre-sampled via sailPointAt into plain numbers, interpolated over SAIL_STOPS', () => {
    // The worklet cannot call sailPointAt (a JS closure); the sanctioned shape is pre-sampling.
    // These pins are what make the numeric specs above be about the SHIPPED animation: the sample
    // arrays are produced by the tested function and the worklet reads only them.
    expect(shipSource).toMatch(/SAIL_MS = 1800/);
    expect(shipSource).toMatch(/sailPointAt\(sail\.leg,/);
    expect(shipSource).toMatch(/const sailStyle = useAnimatedStyle\(/);
    expect(shipSource).toMatch(/translateX: interpolate\(sailProgress\.value, SAIL_STOPS, xs\)/);
    expect(shipSource).toMatch(/translateY: interpolate\(sailProgress\.value, SAIL_STOPS, ys\)/);
    expect(shipSource).toMatch(/withTiming\(1, \{ duration: SAIL_MS, easing: Easing\.inOut\(Easing\.quad\) \}\)/);

    // And the worklet body itself holds no JS helper call — only the Reanimated primitive over the
    // captured arrays. (The exhaustive proof is spec(A-018:AC-1), which runs beside this suite.)
    const workletStart = shipSource.indexOf('const sailStyle = useAnimatedStyle(');
    const workletEnd = shipSource.indexOf('}));', workletStart);
    const worklet = shipSource.slice(workletStart, workletEnd);
    expect(workletStart).toBeGreaterThan(-1);
    expect(worklet).not.toMatch(/sailPointAt\(/);
    expect(worklet).not.toMatch(/\bart\(/);
  });

  it('spec(A-063:AC-1) the ship is anchored at the destination berth and the sail transform carries it — never a teleport', () => {
    // VoyageMap: while a sail is under way the anchor is the DESTINATION berth (during an arrival
    // the captain's currentIsland is still the old island until the sail completes), and the
    // departure berth, leg index and direction ride down as plain pixel numbers.
    expect(voyageSource).toMatch(/const berthIsle = sailing \? sailingTo : liveIsle;/);
    expect(voyageSource).toMatch(/left=\{shipLeft\(frame, berthIsle\)\}/);
    expect(voyageSource).toMatch(/top=\{shipTop\(frame, berthIsle\)\}/);
    expect(voyageSource).toMatch(/fromLeft: shipLeft\(frame, sailingFrom\)/);
    expect(voyageSource).toMatch(/fromTop: shipTop\(frame, sailingFrom\)/);
    // The printed trail's own naming: the leg between two isles is the lower catalog index, and
    // the bow sign belongs to that name whichever way the ship crosses it.
    expect(voyageSource).toMatch(/leg: Math\.min\(sail\.from, sail\.to\)/);
    expect(voyageSource).toMatch(/forward: sail\.from < sail\.to/);

    // ChartShip: the outer container carries the sail transform; the bob composes on top of it,
    // inside — so the hull bobs while it sails, and the cast shadow travels with the hull.
    expect(shipSource).toMatch(
      /<Animated\.View pointerEvents="none" style=\{\[\{ position: 'absolute', left, top, width: w, height: h \}, sailStyle\]\}>/,
    );
    expect(shipSource).toMatch(/\[FILL, bobStyle\]/);

    // And the chart hands the run down.
    expect(chartSource).toMatch(/sail=\{sailRun\}/);
  });

  it('spec(A-063:AC-1) a travel tap and an arrival both plan a sail between two real berths', () => {
    const travel = sailPlan(
      { currentIsland: 'port_sumwich', unlockedIslands: ['port_sumwich', 'isla_products'] },
      { currentIsland: 'isla_products', unlockedIslands: ['port_sumwich', 'isla_products'] },
    );
    expect(travel).toEqual({ kind: 'travel', fromId: 'port_sumwich', toId: 'isla_products' });

    // Sailing back up-chain is a travel too — AC-1's "between already-open islands".
    const back = sailPlan(
      { currentIsland: 'isla_products', unlockedIslands: ['port_sumwich', 'isla_products'] },
      { currentIsland: 'port_sumwich', unlockedIslands: ['port_sumwich', 'isla_products'] },
    );
    expect(back).toEqual({ kind: 'travel', fromId: 'isla_products', toId: 'port_sumwich' });

    const arrival = sailPlan(
      { currentIsland: 'port_sumwich', unlockedIslands: ['port_sumwich'] },
      { currentIsland: 'port_sumwich', unlockedIslands: ['port_sumwich', 'isla_products'] },
    );
    expect(arrival).toEqual({ kind: 'arrival', fromId: 'port_sumwich', toId: 'isla_products' });
  });

  it('spec(A-063:AC-1) no point of any sail carries the hull under the header pill or off the board', () => {
    // The ticket's bounds constraint, held as arithmetic: the header's ink ends at frame y 78, the
    // map box below the status bar is CLOSE.map, and the voyage composition maps into it
    // proportionally — so the safe line in VOYAGE board coordinates is that ratio.
    const shipW = VOYAGE.ship.width;
    const shipH = shipW * SHIP.aspect;
    const headerBottomBox = HEADER.top + HEADER.height - FRAME.statusBar;
    const headerSafeBoardY = (headerBottomBox / CLOSE.map.height) * VOYAGE.map.height;

    for (let leg = 0; leg + 1 < VOYAGE.isles.length; leg += 1) {
      const from = berthCentre(VOYAGE.isles[leg]!);
      const to = berthCentre(VOYAGE.isles[leg + 1]!);
      for (let s = 0; s <= 100; s += 1) {
        const p = sailPointAt(leg, from, to, TRAIL.bow, s / 100);
        expect(p.y - shipH / 2, `leg ${leg} t=${s / 100} under the header`).toBeGreaterThan(
          headerSafeBoardY,
        );
        expect(p.y + shipH / 2, `leg ${leg} t=${s / 100} below the board`).toBeLessThan(
          VOYAGE.map.height,
        );
        expect(p.x - shipW / 2, `leg ${leg} t=${s / 100} off the west edge`).toBeGreaterThanOrEqual(0);
        expect(p.x + shipW / 2, `leg ${leg} t=${s / 100} off the east edge`).toBeLessThanOrEqual(
          VOYAGE.map.width,
        );
      }
    }
  });

  it('spec(A-063:AC-3) a consumed arrival plans nothing again — StrictMode replay, remount, and the completion write are all no-ops', () => {
    const before = { currentIsland: 'port_sumwich', unlockedIslands: ['port_sumwich'] };
    const after = {
      currentIsland: 'port_sumwich',
      unlockedIslands: ['port_sumwich', 'isla_products'],
    };
    expect(sailPlan(before, after)?.kind).toBe('arrival');

    // The effect advances its snapshot to `next` BEFORE dispatching, so any replay — StrictMode's
    // double invocation, a re-render mid-sail — diffs next against next and plans nothing.
    expect(sailPlan(after, after)).toBeNull();

    // The completion write (the earned island becoming current) advances the snapshot first, so
    // the differ sees its own write already accounted for rather than a second travel tap.
    const landed = { currentIsland: 'isla_products', unlockedIslands: after.unlockedIslands };
    expect(sailPlan(landed, landed)).toBeNull();
  });

  it('spec(A-063:AC-3) the double-fire guard is real: the snapshot advances before any dispatch, and one key names one run', () => {
    // Deleting `seen.current = next;` — or moving it below the dispatch — is the mutation this
    // spec exists to turn red.
    const consumed = chartSource.indexOf('seen.current = next;');
    const dispatched = chartSource.indexOf('setSailRun(');
    expect(consumed, 'the trigger effect must consume the diff').toBeGreaterThan(-1);
    expect(dispatched, 'the trigger effect must dispatch a sail run').toBeGreaterThan(-1);
    expect(consumed, 'the diff must be consumed BEFORE it dispatches').toBeLessThan(dispatched);

    // The snapshot ref seeds from the LIVE captain, so a fresh mount has nothing to diff and a
    // remount replays no sail.
    expect(chartSource).toMatch(
      /useRef\(\{ currentIsland: captain\.currentIsland, unlockedIslands: captain\.unlockedIslands \}\)/,
    );

    // Idempotent dispatch: the same cause resolves to the same key, and the same key keeps the
    // same run object, so state cannot restart a sail it already started.
    expect(chartSource).toMatch(/current !== null && current\.key === key \? current :/);

    // And ChartShip's tween is keyed to exactly that run: a re-render mid-sail hands it the same
    // key, and the timing effect's deps are the key — so the tween cannot restart.
    expect(shipSource).toMatch(/\}, \[sailKey, sailProgress\]\);/);
  });

  it('spec(A-063:AC-4) no auto-battle without an arrival: losses, ceilings, placement floods and hydration plan nothing', () => {
    const held = {
      currentIsland: 'isla_products',
      unlockedIslands: ['port_sumwich', 'isla_products'],
    };
    // A loss — or a win at the band ceiling — changes neither field: nothing to sail, nothing to push.
    expect(sailPlan(held, held)).toBeNull();

    // Placement floods several islands at once; that is a hand of islands, not a voyage.
    expect(
      sailPlan(
        { currentIsland: null, unlockedIslands: [] },
        {
          currentIsland: 'port_sumwich',
          unlockedIslands: ['port_sumwich', 'isla_products', 'quotient_cove'],
        },
      ),
    ).toBeNull();

    // Hydration from an empty snapshot is a restore, not an arrival — even when it lands one island.
    expect(
      sailPlan(
        { currentIsland: null, unlockedIslands: [] },
        { currentIsland: 'port_sumwich', unlockedIslands: ['port_sumwich'] },
      ),
    ).toBeNull();
  });

  it('spec(A-063:AC-4) the auto-battle runs only down the arrival branch: sail completes, the island becomes current, one beat, then the push', () => {
    // The focus gate: a victory settles unlockedIslands while the duel screen is still on top of
    // the mounted chart. Unfocused, the chart must neither animate nor navigate — the diff stays
    // unconsumed until the captain actually returns.
    expect(chartSource).toMatch(/useIsFocused\(\)/);
    expect(chartSource).toMatch(/if \(!isFocused\) return;/);

    // Travel leaves the effect before any timer can be armed — a plain travel tap can never push.
    const travelGate = chartSource.indexOf("if (plan.kind !== 'arrival') return;");
    expect(travelGate, 'the arrival branch must be gated on plan.kind').toBeGreaterThan(-1);

    // The arrival chain, in order: SAIL_MS → the earned island becomes current → ARRIVAL_BEAT_MS
    // → the same push edge every other fight on this screen uses.
    const arrivalChain = chartSource.slice(travelGate);
    expect(arrivalChain).toMatch(
      /setTimeout\(\(\) => \{[\s\S]*?setCurrentIsland\(plan\.toId\);[\s\S]*?setTimeout\(\(\) => \{[\s\S]*?router\.push\('\/duel'\);[\s\S]*?\}, ARRIVAL_BEAT_MS\);[\s\S]*?\}, SAIL_MS\);/,
    );

    // The completion write advances the snapshot before it writes (AC-3's guard, at the second
    // place it matters).
    const advanced = arrivalChain.indexOf('seen.current = { currentIsland: plan.toId');
    const wrote = arrivalChain.indexOf('setCurrentIsland(plan.toId)');
    expect(advanced).toBeGreaterThan(-1);
    expect(advanced).toBeLessThan(wrote);

    // The beat is a beat, not a cut.
    expect(chartSource).toMatch(/ARRIVAL_BEAT_MS = 600/);
  });

  it('spec(A-063:AC-5) the sail is the sanctioned eighth worklet — inventoried by name, deliberately', () => {
    // The A-018 suite proves the inventory is exact and every callback is worklet-safe; this pins
    // only that the amendment happened by name, so the eighth worklet cannot slip in unlisted.
    const inventory = read('__tests__/app/chart-worklet-safety.test.ts');
    expect(inventory).toMatch(/'src\/components\/chart\/ChartShip\.tsx::sailStyle',/);

    // ChartShip ships exactly two useAnimatedStyle callbacks: the bob and the sail.
    expect(shipSource.match(/useAnimatedStyle\(/g)).toHaveLength(2);
  });
});
