/**
 * A-063 — the ship sails to the island it just earned, and the next battle begins.
 * A-065 — the arrival ceremony: fog lift, banner, and the spyglass iris over that same sail.
 *
 * The chart cannot render headless (importing a `.tsx` pulls in React Native's Flow entry point),
 * so this suite follows the repo's two established substitutes, both already precedented:
 *
 *   1. **Extract-and-execute** for the pure parts. `sailPointAt` (ChartShip.tsx), `sailPlan`,
 *      `ceremonyAdvance`, `ceremonyHoldMs` and `bannerTopPx` (app/chart.tsx) are exported
 *      top-level function declarations that reference nothing but their own parameters and
 *      `Math`. The TypeScript compiler API lifts each declaration out of its file, transpiles it,
 *      and evaluates it — so AC-2's curve equivalence, the trigger decisions, and the whole
 *      ceremony state machine are asserted on the REAL shipped functions, numerically, with no
 *      component harness. `extractConst` extends the same technique to the ceremony's timing and
 *      geometry tables (`CEREMONY`, `BANNER`, `FOG_LIFT` in ArrivalCeremony.tsx), which are
 *      literal objects and therefore equally liftable.
 *
 *   2. **Source guards** for the wiring — which expression is passed where — exactly as
 *      `design-fidelity.test.ts` pins `rankTier={rankTierForWins(captain.wins)}`: the failure mode
 *      is the wiring, and a value test would pass while the wiring stayed wrong.
 *
 * The double-fire discipline being guarded is the settlement effect's own (`app/duel.tsx:139-151`):
 * an effect that can observe the same fact twice must consume it before acting on it.
 *
 * ── Re-baselines, sanctioned by A-065 ──────────────────────────────────────────────────────────
 * `tickets/app/A-065.md`: *"The A-063 chain (sail → set current → 600ms → push duel) is the
 * skeleton this ceremony replaces the tail of."* Two frozen specs changed shape under that ruling
 * and ONLY under it, each marked at its body:
 *
 *   spec(A-063:AC-4) — the arrival tail is no longer `set current → ARRIVAL_BEAT_MS → push`; it
 *                      is the ceremony walk, with the completion write at the fog lift and the
 *                      push at the final beat. What the spec protects is unchanged: travel never
 *                      pushes, the snapshot advances before the write, one push per arrival.
 *   spec(A-063:AC-5) — ChartShip's exact worklet count grew 2 → 3: beat A's stern wake, added to
 *                      the inventory by name in the same change.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  CLOSE,
  DOCK,
  FRAME,
  HEADER,
  SHIP,
  TRAIL,
  TRAIL_LOOK,
  VOYAGE,
  nodeCentre,
  trailDots,
} from '../../src/components/chart/board';
import { computeLayout, containWorldBoard } from '../../src/theme/responsive';

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

/**
 * The same lift, for a top-level `const NAME = { … } as const` literal — the ceremony's timing
 * and geometry tables. Same trust domain, same "must be self-contained" rule: a table that
 * referenced anything but literals would fail to evaluate here, which is itself the contract.
 */
function extractConst(relativePath: string, name: string): unknown {
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
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
          text = node.getText(sourceFile);
        }
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (text === undefined) throw new Error(`${relativePath} does not declare const ${name}`);
  const js = ts.transpileModule(text.replace(/^export\s+/, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return new Function(`${js}; return ${name};`)();
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

type ArrivalBeat = 'sailing' | 'fog-lift' | 'banner' | 'encounter' | 'iris' | 'battle';
type CeremonyEvent = 'timer' | 'tap' | 'encounter-done';

interface CeremonyTable {
  readonly fogLiftMs: number;
  readonly bannerMs: number;
  readonly tuckLeadMs: number;
  readonly tuckMs: number;
  readonly irisMs: number;
}

interface HoldTable extends CeremonyTable {
  readonly sailMs: number;
}

interface BannerTable {
  readonly top: number;
  readonly left: number;
  readonly right: number;
  readonly padX: number;
  readonly padY: number;
  readonly radius: number;
  readonly shadowDy: number;
  readonly spineW: number;
  readonly spineInsetY: number;
  readonly plate: number;
  readonly plateRadius: number;
  readonly nameSize: number;
  readonly copySize: number;
  readonly inMs: number;
  readonly overshootPx: number;
  readonly tuckDx: number;
  readonly tuckScale: number;
  readonly clearGap: number;
}

interface FogLiftTable {
  readonly partMs: number;
  readonly partDx: number;
  readonly floodDelayMs: number;
  readonly floodMs: number;
  readonly floodFromPct: number;
  readonly floodToPct: number;
  readonly popDelayMs: number;
  readonly popMs: number;
  readonly popDropY: number;
  readonly sparkMs: number;
  readonly sparkFrom: number;
  readonly sparkTo: number;
}

type CeremonyAdvance = (beat: ArrivalBeat, event: CeremonyEvent, encounterSeen: boolean) => ArrivalBeat | null;
type CeremonyHoldMs = (beat: ArrivalBeat, t: HoldTable) => number | null;
type BannerTopPx = (
  baseTopPx: number,
  heightPx: number,
  headerBottomPx: number,
  berthTopPx: number,
  gapPx: number,
) => number;

const sailPointAt = extractFunction('src/components/chart/ChartShip.tsx', 'sailPointAt') as SailPointAt;
const sailPlan = extractFunction('app/chart.tsx', 'sailPlan') as SailPlanFn;
const ceremonyAdvance = extractFunction('app/chart.tsx', 'ceremonyAdvance') as CeremonyAdvance;
const ceremonyHoldMs = extractFunction('app/chart.tsx', 'ceremonyHoldMs') as CeremonyHoldMs;
const bannerTopPx = extractFunction('app/chart.tsx', 'bannerTopPx') as BannerTopPx;

const CEREMONY = extractConst('src/components/chart/ArrivalCeremony.tsx', 'CEREMONY') as CeremonyTable;
const BANNER = extractConst('src/components/chart/ArrivalCeremony.tsx', 'BANNER') as BannerTable;
const FOG_LIFT = extractConst('src/components/chart/ArrivalCeremony.tsx', 'FOG_LIFT') as FogLiftTable;
/** The full hold table the chart hands `ceremonyHoldMs` — `{ sailMs: SAIL_MS, ...CEREMONY }`. */
const HOLDS: HoldTable = { sailMs: 1800, ...CEREMONY };

const shipSource = read('src/components/chart/ChartShip.tsx');
const voyageSource = read('src/components/chart/VoyageMap.tsx');
const chartSource = read('app/chart.tsx');
const ceremonySource = read('src/components/chart/ArrivalCeremony.tsx');
const dockSource = read('src/components/chart/Dock.tsx');
const fogSource = read('src/components/chart/Fog.tsx');

const BEATS: readonly ArrivalBeat[] = ['sailing', 'fog-lift', 'banner', 'encounter', 'iris', 'battle'];
const EVENTS: readonly CeremonyEvent[] = ['timer', 'tap', 'encounter-done'];

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

  it('spec(A-063:AC-4) the auto-battle runs only down the arrival branch — re-baselined by A-065, which replaces the tail with the ceremony walk', () => {
    // RE-BASELINED under A-065's explicit sanction (`tickets/app/A-065.md`: "The A-063 chain
    // (sail → set current → 600ms → push duel) is the skeleton this ceremony replaces the tail
    // of"). What this spec protects is UNCHANGED: travel never pushes, the completion write
    // advances the snapshot first, and the push is the same chart→duel edge — only the tail's
    // shape moved, from `set current → ARRIVAL_BEAT_MS → push` to the four-beat ceremony.

    // The focus gate: a victory settles unlockedIslands while the duel screen is still on top of
    // the mounted chart. Unfocused, the chart must neither animate nor navigate — the diff stays
    // unconsumed until the captain actually returns.
    expect(chartSource).toMatch(/useIsFocused\(\)/);
    expect(chartSource).toMatch(/if \(!isFocused\) return;/);

    // Travel leaves the effect before any beat can be entered — a plain travel tap can never push.
    const travelGate = chartSource.indexOf("if (plan.kind !== 'arrival') return;");
    expect(travelGate, 'the arrival branch must be gated on plan.kind').toBeGreaterThan(-1);

    // The arrival branch enters the ceremony at its first beat; the beats walk `ceremonyAdvance`
    // (asserted numerically in the A-065 block below) and only the final beat pushes.
    const arrivalChain = chartSource.slice(travelGate);
    expect(arrivalChain).toMatch(/enterBeat\(\{ islandId: plan\.toId, islandIndex: to \}, 'sailing'\)/);

    // The completion write moved to the fog lift — the dock's name and meter swap the moment the
    // island wakes — and it still advances the snapshot before it writes (AC-3's guard, at the
    // second place it matters).
    expect(chartSource).toMatch(/if \(beat === 'fog-lift'\) \{[\s\S]*?setCurrentIsland\(run\.islandId\);/);
    const advanced = chartSource.indexOf('seen.current = { currentIsland: run.islandId');
    const wrote = chartSource.indexOf('setCurrentIsland(run.islandId)');
    expect(advanced).toBeGreaterThan(-1);
    expect(advanced).toBeLessThan(wrote);

    // The push happens at the final beat and nowhere else in the ceremony.
    expect(chartSource).toMatch(
      /if \(beat === 'battle'\) \{[\s\S]*?setCeremony\(null\);\s*router\.push\('\/duel'\);\s*return;\s*\}/,
    );
  });

  it('spec(A-063:AC-5) the sail is the sanctioned eighth worklet — inventoried by name, deliberately', () => {
    // The A-018 suite proves the inventory is exact and every callback is worklet-safe; this pins
    // only that the amendment happened by name, so the eighth worklet cannot slip in unlisted.
    const inventory = read('__tests__/app/chart-worklet-safety.test.ts');
    expect(inventory).toMatch(/'src\/components\/chart\/ChartShip\.tsx::sailStyle',/);

    // RE-BASELINED by A-065 (beat A): ChartShip ships exactly THREE useAnimatedStyle callbacks —
    // the bob (now lean-aware), the sail, and the stern wake, the last added to the inventory by
    // name in the same change, which is the amendment discipline both suites exist to enforce.
    expect(inventory).toMatch(/'src\/components\/chart\/ChartShip\.tsx::wakeStyle',/);
    expect(shipSource.match(/useAnimatedStyle\(/g)).toHaveLength(3);
  });
});

describe('A-065 — the arrival ceremony: fog lift, banner, and the spyglass iris', () => {
  it('spec(A-065:AC-1) the four beats advance in board order on timers, with the board timings as the boundaries', () => {
    // The walk itself, on the real shipped state machine. The seen-latch cannot bend the first
    // two edges — only the banner's exit forks on it.
    for (const seen of [true, false]) {
      expect(ceremonyAdvance('sailing', 'timer', seen)).toBe('fog-lift');
      expect(ceremonyAdvance('fog-lift', 'timer', seen)).toBe('banner');
      expect(ceremonyAdvance('iris', 'timer', seen)).toBe('battle');
    }
    expect(ceremonyAdvance('banner', 'timer', true)).toBe('iris');
    expect(ceremonyAdvance('battle', 'timer', true)).toBeNull();

    // The board's own boundaries: sailing 0→1800, fog lift 1800→3080, banner 3080→4600, then the
    // handoff — tuck 320ms leading the 600ms iris by 80.
    expect(HOLDS.sailMs).toBe(1800);
    expect(HOLDS.sailMs + CEREMONY.fogLiftMs).toBe(3080);
    expect(HOLDS.sailMs + CEREMONY.fogLiftMs + CEREMONY.bannerMs).toBe(4600);
    expect(CEREMONY.tuckLeadMs).toBe(80);
    expect(CEREMONY.tuckMs).toBe(320);
    expect(CEREMONY.irisMs).toBe(600);

    // The hold table is what actually arms the timers, beat for beat.
    expect(ceremonyHoldMs('sailing', HOLDS)).toBe(1800);
    expect(ceremonyHoldMs('fog-lift', HOLDS)).toBe(CEREMONY.fogLiftMs);
    expect(ceremonyHoldMs('banner', HOLDS)).toBe(CEREMONY.bannerMs);
    expect(ceremonyHoldMs('encounter', HOLDS)).toBeNull();
    expect(ceremonyHoldMs('iris', HOLDS)).toBe(CEREMONY.tuckLeadMs + CEREMONY.irisMs);
    expect(ceremonyHoldMs('battle', HOLDS)).toBeNull();

    // Beat B's three overlapping steps, inside the 1280: fog parts 0–420, colour floods 300–780,
    // marker pops 480–860, spark 480–1100.
    expect(FOG_LIFT.partMs).toBe(420);
    expect(FOG_LIFT.partDx).toBe(26);
    expect(FOG_LIFT.floodDelayMs + FOG_LIFT.floodMs).toBe(780);
    expect(FOG_LIFT.popDelayMs + FOG_LIFT.popMs).toBe(860);
    expect(FOG_LIFT.popDelayMs + FOG_LIFT.sparkMs).toBe(1100);
    expect(FOG_LIFT.popDelayMs + FOG_LIFT.sparkMs).toBeLessThanOrEqual(CEREMONY.fogLiftMs);
    // The flood is the board's `clip-path circle 6% → 150%`, as the sanctioned expanding mask.
    expect(FOG_LIFT.floodFromPct).toBe(0.06);
    expect(FOG_LIFT.floodToPct).toBe(1.5);

    // Beat C's entrance: in 380ms with the board's own +4px overshoot keyframe.
    expect(BANNER.inMs).toBe(380);
    expect(BANNER.overshootPx).toBe(4);

    // And the ceremony rides the REAL sail: the chart's shared progress clock runs SAIL_MS on the
    // sail's own easing, so the trail lights exactly where the hull is.
    expect(chartSource).toMatch(/ceremonyProgress\.value = withTiming\(1, \{\s*duration: SAIL_MS,/);
  });

  it('spec(A-065:AC-1) a plain travel tap keeps today\'s bare sail — the ceremony exists only past the arrival gate', () => {
    // The frozen A-063 specs above already prove a travel plans a travel and no timer chain runs;
    // this pins the A-065 half: entering a beat is unreachable before the arrival gate, and any
    // new voyage retires a ceremony mid-flight before it dispatches.
    const travelGate = chartSource.indexOf("if (plan.kind !== 'arrival') return;");
    const ceremonyEntry = chartSource.indexOf("enterBeat({ islandId: plan.toId, islandIndex: to }, 'sailing')");
    expect(travelGate).toBeGreaterThan(-1);
    expect(ceremonyEntry).toBeGreaterThan(travelGate);

    const effect = chartSource.slice(chartSource.indexOf('if (!isFocused) return;'));
    const superseded = effect.indexOf('setCeremony(null);');
    const dispatched = effect.indexOf('setSailRun(');
    expect(superseded, 'a new voyage must retire the ceremony').toBeGreaterThan(-1);
    expect(superseded).toBeLessThan(dispatched);
  });

  it('spec(A-065:AC-2) the banner never overlaps the header pill, the ship berth, or the dock — at SE-class, the reference frame, and Pro Max', () => {
    // The board's own constraint ("left 12, right 66, top 96 … never overlaps header (26–78),
    // ship, or dock"), held as arithmetic the way A-063's bounds spec holds the sail: the shipped
    // `bannerTopPx` clamp is driven with the same inputs the chart computes, at three real
    // viewports. The map contain-fits (art compresses faster than type), which is exactly why the
    // clamp exists — at 320×568 the board's raw 96 would graze the resting hull beside the
    // first-arrival island, and dropping the clamp is the mutation this spec turns red on.
    expect(BANNER.top).toBe(96);
    expect(BANNER.left).toBe(12);
    expect(BANNER.right).toBe(66);

    const viewports = [
      [320, 568],
      [375, 667],
      [430, 932],
    ] as const;

    for (const [w, h] of viewports) {
      const t = computeLayout(w, h).type;
      const mapBoxH = h - FRAME.statusBar - DOCK.height * t;
      const fit = containWorldBoard(w, mapBoxH, VOYAGE.map.width, VOYAGE.map.height);
      const slackY = Math.max(0, mapBoxH - fit.height);
      const bannerHeight = (BANNER.padY * 2 + BANNER.plate + BANNER.shadowDy) * t;
      const headerBottom = (HEADER.top - FRAME.statusBar + HEADER.height + HEADER.shadowDy) * t;
      const baseTop = (BANNER.top - FRAME.statusBar) * t;
      const gap = BANNER.clearGap * t;

      // Every island an arrival can land on (index 0 is placement's own starting island — an
      // arrival is one NEW island on a captain already standing somewhere, so it starts at 1).
      for (let i = 1; i < VOYAGE.isles.length; i += 1) {
        const isle = VOYAGE.isles[i]!;
        const berthTop =
          slackY +
          ((isle.y + isle.h / 2) / VOYAGE.map.height) * fit.height -
          (VOYAGE.ship.width * fit.scale * SHIP.aspect) / 2;
        const top = bannerTopPx(baseTop, bannerHeight, headerBottom, berthTop, gap);

        // Flush against the header's edge is allowed (it is not overlap); inside it is not.
        expect(top, `${w}×${h} isle ${i}: banner under the header`).toBeGreaterThanOrEqual(headerBottom);
        expect(top + bannerHeight, `${w}×${h} isle ${i}: banner on the berth`).toBeLessThan(berthTop);
        expect(top + bannerHeight, `${w}×${h} isle ${i}: banner on the dock`).toBeLessThan(mapBoxH);
      }

      // On the reference frame the board's own 96 survives unclamped — the clamp is a `min` that
      // bites only where the board's arrangement does not fit the screen in front of it.
      if (w === 375) {
        const isle = VOYAGE.isles[1]!;
        const berthTop =
          slackY +
          ((isle.y + isle.h / 2) / VOYAGE.map.height) * fit.height -
          (VOYAGE.ship.width * fit.scale * SHIP.aspect) / 2;
        expect(bannerTopPx(baseTop, bannerHeight, headerBottom, berthTop, gap)).toBe(baseTop);
      }
    }

    // And the shipped wiring feeds the overlay through exactly this clamp.
    expect(chartSource).toMatch(/bannerTopPx\(baseTop, bannerHeight, headerBottom, berthTop, BANNER\.clearGap \* L\.type\)/);
    expect(chartSource).toMatch(/bannerTop=\{ceremonyBannerTop\}/);
  });

  it('spec(A-065:AC-3) one glow per beat: the ship sails ringless and bob-less, the marker pulses only at the fog lift, the Fight button rings only from the banner on', () => {
    // Beat A — the hull: no bob loop while under way, no lean at rest. `settle` is the whole
    // gate: 0 through the sail's body (pure lean, zero bob) and 1 at rest (pure bob, zero lean).
    expect(shipSource).toMatch(/SAIL_LEAN = 18/);
    expect(shipSource).toMatch(/const settle = p >= 1 \? 1 : p <= 0\.92 \? 0 : \(p - 0\.92\) \/ 0\.08;/);
    expect(shipSource).toMatch(/translateY: -rise \* bob\.value \* settle/);
    expect(shipSource).toMatch(/rotate: `\$\{lean \* \(1 - settle\) \+ rest \* settle\}deg`/);
    // The wake exists only under way — its worklet multiplies by the same `sailProgress < 1` gate.
    expect(shipSource).toMatch(/const underway = sailProgress\.value < 1 \? 1 : 0;/);

    // Beat A — the map: the departure island's live ring stands down while the ship is the one
    // bright thing, and the arrival island's marker belongs to the ceremony for every beat.
    expect(voyageSource).toMatch(/ceremony !== null && ceremony\.beat === 'sailing' && baseState === 'current'/);
    expect(voyageSource).toMatch(/if \(ceremony !== null && i === ceremony\.islandIndex\)/);
    expect(voyageSource).toMatch(/<CeremonyMarker/);

    // Beat B — the marker's pulse and spark are gated on the fog lift ALONE. Letting beat C keep
    // the ring too is the mutation this line turns red on.
    expect(ceremonySource).toMatch(/const ringing = beat === 'fog-lift';/);
    expect(ceremonySource.match(/\{ringing \? /g), 'both the pulse and the spark ride the gate').toHaveLength(2);

    // Beat C — the banner carries NO ring (its gold spine is enough): no pulse component and no
    // loop of any kind inside the banner's body.
    const bannerBody = ceremonySource.slice(
      ceremonySource.indexOf('function CeremonyBanner'),
      ceremonySource.indexOf('function SpyglassIris'),
    );
    expect(bannerBody.length).toBeGreaterThan(0);
    expect(bannerBody).not.toMatch(/CeremonyPulse/);
    expect(bannerBody).not.toMatch(/withRepeat/);

    // Beat C — the Fight button takes the only ring, exactly while the ceremony says so.
    expect(chartSource).toMatch(
      /ceremony\.beat === 'banner' \|\| ceremony\.beat === 'encounter' \|\| ceremony\.beat === 'iris'/,
    );
    expect(chartSource).toMatch(/highlightFight=\{ceremonyFightGold\}/);
    expect(dockSource).toMatch(/highlightFight = false/);
    expect(dockSource).toMatch(/\{primary && highlightFight \? \(\s*<FightRing/);

    // Beat B's curtain: the fog split is the two half-discs, in Fog.tsx, on the board's numbers.
    expect(fogSource).toMatch(/function PartingHalf/);
    expect(fogSource).toMatch(/export function IsleFogParting/);
    expect(voyageSource).toMatch(/<IsleFogParting/);
  });

  it('spec(A-065:AC-4) a tap from beat C onward skips to the handoff, and both paths end in exactly one battle push', () => {
    // The tap table, exhaustively: beat C is the ONLY tap edge. The sail and fog lift are not
    // skippable, the encounter is its own interactive surface, and the iris is already the
    // handoff. Removing the skip handler (or widening the tap edge) turns this red.
    expect(ceremonyAdvance('banner', 'tap', true)).toBe('iris');
    expect(ceremonyAdvance('banner', 'tap', false)).toBe('encounter');
    for (const beat of BEATS) {
      if (beat === 'banner') continue;
      for (const seen of [true, false]) {
        expect(ceremonyAdvance(beat, 'tap', seen), `tap during ${beat}`).toBeNull();
      }
    }

    // 'battle' is reachable from exactly one edge: the iris timer. One edge, one push.
    const battleEdges: string[] = [];
    for (const beat of BEATS) {
      for (const event of EVENTS) {
        for (const seen of [true, false]) {
          if (ceremonyAdvance(beat, event, seen) === 'battle') {
            battleEdges.push(`${beat}:${event}:${seen}`);
          }
        }
      }
    }
    expect(battleEdges).toStrictEqual(['iris:timer:true', 'iris:timer:false']);

    // The wiring: the overlay's beat-C surface calls the skip handler, the skip handler walks the
    // machine with a 'tap', and EVERY door into a beat first clears the pending clock — which is
    // what makes the skip path and the natural path the same single-push path.
    expect(chartSource).toMatch(/onSkip=\{skipCeremony\}/);
    expect(chartSource).toMatch(/ceremonyAdvance\(ceremony\.beat, 'tap', met\)/);
    expect(chartSource).toMatch(
      /function step\(run: \{ islandId: IslandId; islandIndex: number \}, beat: ArrivalBeat\): void \{\s*[\s\S]{0,400}?if \(arrivalTimer\.current !== null\) \{\s*clearTimeout\(arrivalTimer\.current\);/,
    );
    // Two executable `/duel` pushes in the whole file (the semicolon keeps prose mentions out):
    // the dock/waypoint `sail()` callback, and the ceremony's final beat. The old
    // ARRIVAL_BEAT_MS tail is gone, not duplicated.
    expect(chartSource.match(/router\.push\('\/duel'\);/g)).toHaveLength(2);
    expect(chartSource).not.toMatch(/ARRIVAL_BEAT_MS/);
    // And the beat-C surface exists to be tapped: a full-screen pressable, only on the banner.
    expect(ceremonySource).toMatch(/\{beat === 'banner' \? \(/);
    expect(ceremonySource).toMatch(/onPress=\{onSkip\}/);
  });

  it('spec(A-065:AC-5) the encounter slot sits between banner-out and the iris, gated on the seen-latch, and its exit leads into the iris', () => {
    // The machine: a first landing (latch unset) meets the encounter from either banner exit; a
    // return visit goes straight to the iris. The encounter holds no timer — its card's `onDone`
    // is the only way forward, and it leads into the iris and nowhere else.
    expect(ceremonyAdvance('banner', 'timer', false)).toBe('encounter');
    expect(ceremonyAdvance('banner', 'tap', false)).toBe('encounter');
    expect(ceremonyAdvance('banner', 'timer', true)).toBe('iris');
    expect(ceremonyAdvance('encounter', 'encounter-done', false)).toBe('iris');
    expect(ceremonyAdvance('encounter', 'encounter-done', true)).toBe('iris');
    expect(ceremonyAdvance('encounter', 'timer', false)).toBeNull();
    expect(ceremonyHoldMs('encounter', HOLDS)).toBeNull();
    // 'encounter-done' means nothing anywhere else — a stray call cannot move the ceremony.
    for (const beat of BEATS) {
      if (beat === 'encounter') continue;
      expect(ceremonyAdvance(beat, 'encounter-done', true), `done during ${beat}`).toBeNull();
    }

    // The latch is the captain's own field, read at transition time — A-066's card sets it while
    // the encounter is up, so reading it early would replay the chat.
    expect(chartSource).toMatch(/captainActions\(\)\.captain\.seenEncounters\.includes\(run\.islandId\)/);

    // A-066 ships in the same wave: the card is loaded defensively behind the latch-gated beat —
    // a guarded require, and a missing card resolves to a pass-through instead of a hang.
    expect(ceremonySource).toMatch(/try \{\s*const mod = require\('\.\.\/encounter\/EncounterCard'\)/);
    expect(ceremonySource).toMatch(/if \(Card === null\) onDone\(\);/);
    // The public contract, exactly: `EncounterCard({ islandId, onDone })`.
    expect(ceremonySource).toMatch(/readonly islandId: IslandId;\s*readonly onDone: \(\) => void;/);
    // Mounted between banner-out and iris, and only there.
    expect(ceremonySource).toMatch(
      /\{beat === 'encounter' \? <EncounterSlot islandId=\{islandId\} onDone=\{onEncounterDone\} \/> : null\}/,
    );

    // The onboarding walkthrough overlay is untouched either way: still rendered by the chart,
    // never referenced by the ceremony.
    expect(chartSource).toMatch(/<ChartWalkthrough \/>/);
    expect(ceremonySource).not.toMatch(/onboarding|Walkthrough/);
  });

  it('spec(A-065:AC-6) worklet discipline: every new callback is inventoried by name, and the ceremony is shared values + timeouts in the chart screen', () => {
    // The A-018 suite proves the inventory is EXACT and every callback worklet-safe; this pins
    // that the thirteen ceremony call sites were added by name, so none slipped in unlisted.
    const inventory = read('__tests__/app/chart-worklet-safety.test.ts');
    for (const worklet of [
      'src/components/chart/ArrivalCeremony.tsx::chromeStyle',
      'src/components/chart/ArrivalCeremony.tsx::glowDotStyle',
      'src/components/chart/ArrivalCeremony.tsx::floodClipStyle',
      'src/components/chart/ArrivalCeremony.tsx::floodArtStyle',
      'src/components/chart/ArrivalCeremony.tsx::ringStyle',
      'src/components/chart/ArrivalCeremony.tsx::popStyle',
      'src/components/chart/ArrivalCeremony.tsx::sparkStyle',
      'src/components/chart/ArrivalCeremony.tsx::bannerStyle',
      'src/components/chart/ArrivalCeremony.tsx::apertureStyle',
      'src/components/chart/ArrivalCeremony.tsx::rimStyle',
      'src/components/chart/ChartShip.tsx::wakeStyle',
      'src/components/chart/Dock.tsx::fightRingStyle',
      'src/components/chart/Fog.tsx::partStyle',
    ]) {
      expect(inventory, `${worklet} must be inventoried by name`).toContain(`'${worklet}',`);
    }

    // The driver: one state, one shared clock, every timer through the one ref the unmount
    // cleanup and the new-voyage supersede both retire — StrictMode's replay diffs an advanced
    // snapshot (frozen above) and the timers cannot leak.
    expect(chartSource).toMatch(/const ceremonyProgress = useSharedValue\(1\);/);
    expect(chartSource).toMatch(/const hold = ceremonyHoldMs\(beat, \{ sailMs: SAIL_MS, \.\.\.CEREMONY \}\);/);
    expect(chartSource).toMatch(/arrivalTimer\.current = setTimeout\(/);
    expect(chartSource).toMatch(/if \(arrivalTimer\.current !== null\) clearTimeout\(arrivalTimer\.current\);/);

    // No worklet in the ceremony file reaches back into JavaScript: the A-018 analyzer executes
    // beside this suite and would name the call site; here we pin only that the file keeps the
    // repo's hoisting idiom for every animated pixel.
    expect(ceremonySource).not.toMatch(/useAnimatedStyle\(\(\) => \{?[^}]*\bart\(/);
  });
});
