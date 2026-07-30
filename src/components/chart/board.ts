/**
 * The sea chart: **geometry and rules, never one captain's state.**
 *
 * Source: project `88888c12-22e4-4781-b76f-a28110506499`, `Cannon Academy Sea Chart.dc.html`
 * (turn 9), screen `[data-screen-label="Voyage map"]` (9a). Every number below was READ OFF that
 * file — from the element's inline style, or from the `<script data-dc-script>` block at the foot
 * of it that supplies every coordinate, hex and string. Nothing here was chosen; where something IS
 * a choice it says so.
 *
 * Why a data module rather than numbers at the call sites: a re-measure should be a diff, and
 * "is this the design?" should be a question you answer by reading rather than by squinting.
 *
 * ── One view, not two (OWNER RULING, 2026-07-30) ───────────────────────────────────────────────
 * The board draws two screens — a **voyage map** (9a, the whole ocean) and a **close chart** (9b,
 * one island stretch, captioned as the default screen) — joined by the compass as a zoom control.
 * The owner ships **only the voyage map**, with the close chart's full chrome (the header pill and
 * the three-button dock). The close chart *"does absolutely nothing but confuse the user"*: it drew
 * a second picture of the same sea at a scale that answered no question the first had not, and the
 * compass was a control whose only job was to undo it.
 *
 * So the surviving screen is 9a's composition in 9b's chrome. See `VOYAGE.map` for what that does
 * to the map box, and `CLOSE` for the one thing the close chart left behind.
 *
 * ── The rule this file exists to keep ──────────────────────────────────────────────────────────
 * A design board draws ONE captain. Its isle tags carry `sub: 'YOU ARE HERE'` on island 1 because
 * the drawing shows a captain standing there; three of its five isles carry a fog blob because
 * three of them were closed for that captain. Transcribing those literally ships the board's mock
 * state as the app's permanent state — which is exactly what happened: `YOU ARE HERE` appeared on
 * the live island AND on Isla Products at the same time, on every screen, forever.
 *
 * Every value here is therefore one of:
 *   • a MEASUREMENT — a size, a corner set, a colour, a period;
 *   • a RULE that produces per-captain values (`isleFog`, `VOYAGE.legs`, `islandGlyph`);
 * and never a captured state. If a constant answers "where is the captain?" it does not belong.
 *
 * ── Coordinate systems ─────────────────────────────────────────────────────────────────────────
 * The board is a 375×667 frame whose first 20pt are the status bar. Two spaces are in use and they
 * are NOT interchangeable:
 *
 *   FRAME coords   — from the top of the 375×667 frame. Used by `HEADER` and by `flow.ts`.
 *   VOYAGE coords  — from the top-left of the voyage composition, `VOYAGE.map` (375×555).
 *
 * At runtime the map box is whatever is left between the chrome, and `layout.ts` maps a position
 * PROPORTIONALLY (`x / width`, `y / height`) inside a letterboxed board while sizes scale by the
 * uniform art scale. `containWorldBoard` fits the board UNIFORMLY, so inside a fitted frame those
 * two multipliers are the same number — which is what makes the route arithmetic below exact.
 *
 * ── The two traps this board sets ──────────────────────────────────────────────────────────────
 * 1. **Authored rotation is a lie.** Both ships carry `transform: rotate(-24deg)` / `rotate(-18deg)`
 *    and then run `sc-bob`, which animates `transform` — and in CSS an animated `transform`
 *    REPLACES the authored one for the whole animation. The rendered ship oscillates at ±2°, which
 *    is what `SHIP.bob.rotateDeg` holds. The previous board set the same trap with 38deg; see
 *    A-045. Transcribing −24 would draw a ship the design never shows.
 * 2. **Inline opacity is a lie wherever a keyframe animates opacity.** The swells are authored at
 *    `opacity:.55` and then run `sc-swell`, which animates opacity `.5 → .85`; the live-island ring
 *    is authored at `opacity:.5` and runs `sc-ring`, which animates it `.9 → 0`. In both cases the
 *    animation wins, so the ANIMATED range is recorded here and the inline value is not.
 *    (`sc-drift` and `sc-hump` animate transform only, so the fog's authored opacity survives.)
 *
 * ── Declared-but-unused keyframes ──────────────────────────────────────────────────────────────
 * `sc-pulse`, `sc-spin` and `sc-rise` are declared in the board's `<style>` and never referenced by
 * any element on either screen. They are not implemented (owner ruling 11) — a motion nothing on
 * the board performs is not part of the design.
 */
import type { IslandId } from '@content/schemas';

/** The frame the board is drawn at. Matches `REFERENCE` in `theme/responsive.ts`. */
export const FRAME = { width: 375, height: 667, statusBar: 20 } as const;

/** A CSS `border-radius: a% b% c% d%` corner set, in TL, TR, BR, BL order. */
export type CornerPercents = readonly [number, number, number, number];

/** A CSS `clip-path: polygon(...)`, already in `Poly`'s `x,y x,y` point form. */
export type PolyPoints = string;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Shared vocabulary
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** The palm the board repeats on every island: a 3pt trunk under one frond polygon. */
export const PALM = {
  trunkWidth: 3,
  trunkRadius: 2,
  frond: { w: 15, h: 9 },
  /** `clip-path: polygon(50% 100%, 0 38%, 16% 18%, 50% 46%, 84% 18%, 100% 38%)`. */
  frondPoints: '50,100 0,38 16,18 50,46 84,18 100,38',
} as const;

/** `clip-path: polygon(50% 0, 100% 100%, 0 100%)` — every peak, roof and compass point north of it. */
export const TRIANGLE_UP: PolyPoints = '50,0 100,100 0,100';
/** `clip-path: polygon(50% 100%, 100% 0, 0 0)`. */
export const TRIANGLE_DOWN: PolyPoints = '50,100 100,0 0,0';

/**
 * One palm on a VOYAGE-map island, positioned against that island's own box.
 *
 * The close chart's palms are not these: it draws bigger fronds at bespoke sizes, so they are
 * ordinary `IslePart`s in that island's part list rather than entries here.
 */
export interface Palm {
  readonly trunkX: number;
  readonly trunkY: number;
  readonly trunkH: number;
  readonly frondX: number;
  readonly frondY: number;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Voyage map (board 9a) — "the whole ocean at once"
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** A drifting swell dash. `left/top/width`, and the period/phase its `sc-swell` runs on. */
export interface Swell {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly ms: number;
  readonly delayMs: number;
}

/**
 * `sc-swell`: `translateX(0 → −10px → 0)` with `opacity .5 → .85 → .5`, ease-in-out, forever.
 * The opacity is the animation's, not the element's — see the header.
 */
export const SWELL = {
  height: 3,
  travelX: -10,
  opacityFrom: 0.5,
  opacityTo: 0.85,
} as const;

/** `[left, top, width]`, the shape both screens author their swell tables in. */
type SwellRow = readonly [number, number, number];

const swellsFrom = (
  rows: readonly SwellRow[],
  period: (index: number) => number,
  stagger: number,
): readonly Swell[] => rows.map(([x, y, w], i) => ({ x, y, w, ms: period(i) * 1000, delayMs: i * stagger }));

/** The board's own `swells` array, `dur = 3.4 + (i % 4) × .6`, `delay = i × .35`. */
const voyageSwells = swellsFrom(
  [
    [18, 96, 46],
    [232, 74, 34],
    [92, 150, 30],
    [286, 168, 42],
    [40, 262, 38],
    [258, 300, 30],
    [130, 372, 44],
    [30, 430, 34],
    [244, 466, 40],
  ],
  (i) => 3.4 + (i % 4) * 0.6,
  350,
);

/**
 * A dot on a shipping trail — the board's `trails` list (turn 9, republished single view).
 *
 * The rebuilt board threw the rotated dashed bars away and replaced them with runs of pulsing dots,
 * and says why in 9d: *"Routes are dotted trails, not lines: each dot is positioned from the two
 * island centres it runs between, with a sine bow so the leg reads as a sailed curve. Because the
 * geometry is derived, a route can never disagree with where its islands actually sit — which is
 * exactly how the old rotated bars ended up crossing each other."*
 *
 * That is the owner's complaint answered at the source: the old four bars differed in colour,
 * opacity, length, rotation and period for no stated reason, and one of them ended in open water.
 * A trail cannot: it starts at a node centre and ends at a node centre by construction.
 */
export interface TrailDot {
  /** Which chain link this dot belongs to — 0 is Port Sumwich → Isla Products. */
  readonly leg: number;
  readonly index: number;
  /** The dot's CENTRE, in board coordinates. */
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly delayMs: number;
}

/**
 * The board's own trail arithmetic, lifted verbatim from its `<script>` block.
 *
 * `count = max(3, round(len / 34) − 1)` dots, evenly spaced strictly BETWEEN the two node centres
 * (`t = i / (count + 1)`, so no dot lands on a node), pushed off the straight line by
 * `sin(t·π) · bow` along the perpendicular. `bow` alternates sign per leg, which is what stops two
 * consecutive legs reading as one kinked line.
 */
export const TRAIL = {
  spacing: 34,
  minDots: 3,
  bow: 26,
  /** `animation: sc-pulse 2.6s`, `delay = leg × .5 + i × .16`. */
  ms: 2600,
  legDelayMs: 500,
  dotDelayMs: 160,
} as const;

/**
 * How a leg is drawn, and it is the ONE thing about a trail that is state.
 *
 * The board authors four fixed looks — `#FFF6E4/6pt/.95` then `#C9D6E4` at 5, 5 and 4pt fading
 * `.5 → .36 → .26`. Read literally that is the board's own captain again: the leg they have sailed
 * is inked, the rest are rumour, and the fade is how much rumour. Derived, it says the same thing
 * for everyone — a leg whose far island is open is water you have charted; beyond the frontier it
 * fades with distance, which is the board's own gradient arrived at by meaning it.
 */
export const TRAIL_LOOK = {
  sailed: { color: '#FFF6E4', size: 6, opacity: 0.95 },
  unknown: { color: '#C9D6E4', size: 5, sizeFar: 4, opacity: [0.5, 0.36, 0.26] as readonly number[] },
} as const;

/**
 * Every dot of one leg, from two node centres.
 *
 * Exported because the fidelity test has to re-derive it: the whole promise of a trail is that both
 * ends land on real nodes and that no leg crosses another, and neither is checkable against a table
 * of transcribed coordinates.
 */
export function trailDots(
  leg: number,
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
  size: number,
): readonly TrailDot[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [];
  const count = Math.max(TRAIL.minDots, Math.round(len / TRAIL.spacing) - 1);
  const px = -dy / len;
  const py = dx / len;
  const bow = leg % 2 === 0 ? TRAIL.bow : -TRAIL.bow;
  const dots: TrailDot[] = [];
  for (let i = 1; i <= count; i += 1) {
    const t = i / (count + 1);
    const curve = Math.sin(t * Math.PI) * bow;
    dots.push({
      leg,
      index: i,
      x: from.x + dx * t + px * curve,
      y: from.y + dy * t + py * curve,
      size,
      delayMs: leg * TRAIL.legDelayMs + i * TRAIL.dotDelayMs,
    });
  }
  return dots;
}

/** An island as the voyage map draws it: sand blob, shallow ring, grass, palms, and the extras. */
export interface Isle {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly radii: CornerPercents;
  readonly grass: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
    readonly radii: CornerPercents;
    readonly fill: string;
    readonly deep: string;
  };
  readonly palms: readonly Palm[];
  readonly peak?: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
    readonly fill: string;
  };
  /** `right:-9; bottom:8` plank plus a `right:-6; bottom:3` piling, converted to left/top. */
  readonly dock?: {
    readonly plank: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
    readonly piling: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  };
}

/**
 * The `inset: -16px -14px` fog circle over a CLOSED island — a rule, not a per-isle field.
 *
 * The board gives isles 2, 3 and 4 a `fogged: true` blob at `.62/.72/.82` opacity on 7s/8s/9s
 * periods, and gives isles 0 and 1 none. That is not a property of those islands, it is a snapshot
 * of the board's own captain — and transcribed as an optional `fog` field it became a real defect:
 * `VoyageMap` drew a blob only where the field existed, so **Port Sumwich and Isla Products could
 * never be fogged on screen no matter what the captain's save said.** Under the corrected placement
 * a fresh `k_1` captain has Isla Products closed, and it rendered wide open.
 *
 * The board's own progression is the rule: thicker and slower the further out you look, because
 * distance is the thing the fog is drawing. Islands beyond the fifth reuse the last step rather
 * than fading past opaque.
 */
const ISLE_FOG_STEPS = [
  { opacity: 0.62, ms: 7000 },
  { opacity: 0.72, ms: 8000 },
  { opacity: 0.82, ms: 9000 },
] as const;

export const isleFog = (index: number): { readonly opacity: number; readonly ms: number } => {
  const step = Math.min(Math.max(index - 2, 0), ISLE_FOG_STEPS.length - 1);
  return ISLE_FOG_STEPS[step] as (typeof ISLE_FOG_STEPS)[number];
};

/**
 * The five isles, in catalog order — index 0 is `islands[0]`.
 *
 * **Index-fixed on purpose.** `services/chart.ts` orders nodes by the catalog "so the map never
 * reshuffles as islands open — a child navigates by position". An isle table that re-assigned
 * positions by role would undo exactly that. Which STATE each one renders is decided entirely by
 * `chartNodes` + `stationState`: nothing below knows whether its island is open.
 */
const voyageIsles: readonly Isle[] = [
  {
    x: 20,
    y: 110,
    w: 96,
    h: 62,
    radii: [56, 44, 50, 50],
    grass: { x: 14, y: 10, w: 68, h: 40, radii: [52, 48, 46, 54], fill: '#7ED07A', deep: '#5FA149' },
    palms: [
      { trunkX: 30, trunkY: 18, trunkH: 13, frondX: 24, frondY: 11 },
      { trunkX: 52, trunkY: 26, trunkH: 11, frondX: 46, frondY: 20 },
    ],
    // `right:-9; bottom:8; 20×5` → x = 96 − 20 + 9; y = 62 − 8 − 5.
    dock: { plank: { x: 85, y: 49, w: 20, h: 5 }, piling: { x: 99, y: 53, w: 3, h: 6 } },
  },
  {
    x: 212,
    y: 198,
    w: 112,
    h: 74,
    radii: [46, 54, 52, 48],
    grass: { x: 16, y: 12, w: 80, h: 48, radii: [48, 52, 54, 46], fill: '#7ED07A', deep: '#5FA149' },
    palms: [{ trunkX: 78, trunkY: 36, trunkH: 14, frondX: 72, frondY: 28 }],
    peak: { x: 30, y: 14, w: 40, h: 28, fill: '#5FA149' },
  },
  {
    x: 24,
    y: 330,
    w: 104,
    h: 66,
    radii: [50, 50, 44, 56],
    grass: { x: 14, y: 10, w: 76, h: 44, radii: [46, 54, 52, 48], fill: '#6FBF6C', deep: '#54924A' },
    palms: [{ trunkX: 34, trunkY: 20, trunkH: 12, frondX: 28, frondY: 13 }],
  },
  {
    x: 238,
    y: 378,
    w: 110,
    h: 58,
    radii: [44, 56, 50, 50],
    grass: { x: 18, y: 9, w: 74, h: 38, radii: [52, 48, 46, 54], fill: '#6FBF6C', deep: '#54924A' },
    palms: [{ trunkX: 40, trunkY: 16, trunkH: 11, frondX: 34, frondY: 9 }],
  },
  {
    x: 78,
    y: 498,
    w: 150,
    h: 74,
    radii: [48, 52, 56, 44],
    grass: { x: 22, y: 12, w: 110, h: 48, radii: [50, 50, 48, 52], fill: '#6FBF6C', deep: '#54924A' },
    palms: [{ trunkX: 118, trunkY: 30, trunkH: 13, frondX: 112, frondY: 23 }],
    peak: { x: 48, y: 6, w: 54, h: 38, fill: '#54924A' },
  },
];

/**
 * The label column under an isle — DERIVED from the isle, never transcribed.
 *
 * The board authors five `left/top/width` triples, and four of the five are already
 * `isleCentre − width/2` to within 2pt: the rule was always "centre the column under its island",
 * and the table was the rule typed out by hand. Derived, an island cannot be moved without its name
 * following it — which is the failure the last pass had to hunt down by eye.
 *
 * There is no `sub` field, and that absence is the point. The board writes `sub: 'YOU ARE HERE'` on
 * island 1 and `sub: 'THE LAST SEA'` on island 4, because the drawing depicts a captain standing on
 * Isla Products. Transcribed, the first of those shipped as a permanent second "you are here" marker
 * beside the real one, on every screen, for every captain. A caption that answers "where is the
 * captain?" is state; `VoyageMap` derives it (see `SubCaption` there).
 */
export interface IsleTag {
  readonly x: number;
  readonly y: number;
  readonly w: number;
}

/** Every column is this wide, and its head disc overlaps the island's bottom edge by this much. */
export const ISLE_TAG = { width: 108, overlap: 12 } as const;

const voyageIsleTags: readonly IsleTag[] = voyageIsles.map((isle) => ({
  x: isle.x + isle.w / 2 - ISLE_TAG.width / 2,
  y: isle.y + isle.h - ISLE_TAG.overlap,
  w: ISLE_TAG.width,
}));

/**
 * The centre of a station's HEAD — the point a trail anchors to, and the only "node centre" on this
 * map that means anything to a child, because it is the disc they tap.
 *
 * Measured against the LIVE ring (52pt) at every station rather than the head each one happens to be
 * drawing (52 live, 38 otherwise). A trail that shifted 7pt every time an island changed state would
 * be a map that moves under the captain, and the whole complaint being answered here is that the
 * lines did not make sense.
 */
export const nodeCentre = (tag: IsleTag): { readonly x: number; readonly y: number } => ({
  x: tag.x + tag.w / 2,
  y: tag.y + VOYAGE_NODE_HEAD / 2,
});

/** The live ring's diameter. Declared before `VOYAGE_NODE` so `nodeCentre` can be pure data. */
const VOYAGE_NODE_HEAD = 52;

/** The eight kinds of place the board's node-state legend (9c) enumerates. */
export type WaypointKind = 'buoy' | 'chest' | 'wreck' | 'rival' | 'rock';

export interface Waypoint {
  readonly kind: WaypointKind;
  readonly x: number;
  readonly y: number;
  /** The board prints a label under two of the eleven. */
  readonly label?: string;
}

/**
 * The drawn size of each waypoint silhouette, from the board's own `sc-if` blocks.
 *
 * Sizes matter beyond drawing: every TAPPABLE node gets a transparent 64×64 target around its
 * picture (board 9b: *"the disc is the picture, the column is the target"*), and the slop that
 * produces is `(64 − size) / 2` per edge. The voyage map omits the wrapper the close chart draws;
 * it is added here for all of them, because a 26×16 rock-sized target is not a target for a
 * five-year-old.
 */
export const WAYPOINT_ART: Record<WaypointKind, { readonly w: number; readonly h: number }> = {
  buoy: { w: 26, h: 32 },
  chest: { w: 28, h: 22 },
  wreck: { w: 34, h: 24 },
  rival: { w: 30, h: 26 },
  rock: { w: 26, h: 16 },
};

/**
 * Which kinds a child may press, and where they go.
 *
 *   buoy   → `/range`, drilling the island whose water it sits in.
 *   rival  → `/duel`, at that same island.
 *   wreck  → `/duel`. Board 9c promises *"a bigger chest and no rank consequence"* and neither
 *            exists: both need `rewardSettlement` changes outside the chart's ownership. A plain
 *            duel is the honest subset — the differentiation is deferred, not faked (owner ruling 5).
 *   chest  → absent. There is no reward entry point outside a duel result and no per-waypoint
 *            looted latch, both engine-track; see the TODO in `Waypoint.tsx` (owner ruling 4).
 *   rock   → absent, and no target either. Board 9c: *"Pure scenery — a map needs places that are
 *            not tasks, or every glance is a to-do list."*
 *
 * Here rather than in the component because it is the pure half — what a waypoint MEANS — and the
 * fidelity tests read it in node, where importing a `.tsx` pulls in React Native's Flow entry point.
 */
export const WAYPOINT_ROUTE: Partial<Record<WaypointKind, 'range' | 'duel'>> = {
  buoy: 'range',
  rival: 'duel',
  wreck: 'duel',
};

/**
 * How each of the five silhouettes is drawn, part by part.
 *
 * Board 9c's rule, and the reason these are shapes rather than icons: *"Shape before colour,
 * everywhere. A circle is a place you can go, a square-ish plate is loot, a sail is a fight, a
 * ring-and-post is practice… a child who sees none of it can still tell a buoy from a chest from a
 * rival, because no two silhouettes are alike."*
 *
 * `bottom` offsets are the board's own; the wreck and the rival are both built from the waterline
 * up, which is what makes them sit IN the sea rather than on it.
 */
export const WAYPOINT_PARTS = {
  /** The gunnery range's own float, so the shape is already learned. */
  buoy: { ring: 20, ringInset: 4, post: { w: 7, h: 8 }, base: { w: 20, h: 5 } },
  /** `border-radius: 5px 5px 3px 3px` with `inset 0 -6px 0`, a gold band and a dark lock. */
  chest: {
    radiusTop: 5,
    radiusBottom: 3,
    insetDy: 6,
    band: { y: 7, h: 4 },
    lock: { x: 11, y: 9, w: 6, h: 8, radius: 2 },
  },
  wreck: {
    hull: { w: 34, h: 11, points: '0,0 100,24 88,100 10,100' },
    mast: { x: 20, bottom: 8, w: 4, h: 16, angle: 18 },
    sail: { x: 5, bottom: 9, w: 12, h: 9, points: '100,0 100,100 0,80' },
  },
  rival: {
    mast: { x: 12, bottom: 8, w: 4, h: 18 },
    sail: { x: 0, bottom: 12, w: 12, h: 12, points: '100,0 100,100 0,88 12,56 0,30' },
    hull: { x: 0, bottom: 0, w: 30, h: 10, points: '0,0 100,0 88,100 10,100' },
  },
  /** `clip-path: polygon(0 100%, 22% 22%, 44% 56%, 66% 0, 100% 100%)` — two peaks and a saddle. */
  rock: { points: '0,100 22,22 44,56 66,0 100,100' },
} as const;

/**
 * The eleven waypoints.
 *
 * Seven are the board's own coordinates unchanged. Four are moved, and all four for the same
 * reason: the board draws waypoints, islands, labels and trails independently and never checks them
 * against each other, so it authors a rock inside a duel's tap target, a rival buried under an
 * island, and a wreck sitting on the Products→Cove trail.
 *
 *   chest #1   (184,182) → (177,165)   clear of Isla Products' shallow ring
 *   rival #3   (96,302)  → (129,293)   off the kraken and out of Quotient Cove's shallows
 *   rock  #4   (116,324) → (141,331)   its centre was inside rival #3's 64pt target, so a child
 *                                      aiming at scenery would have started a duel (owner ruling 7,
 *                                      re-earned: the republished board reverted the old fix)
 *   wreck #5   (152,352) → (180,368)   off the trail between Isla Products and Quotient Cove
 *   buoy  #6   (168,402) → (148,405)   clear of the same trail's bow
 *   chest #8   (250,522) → (255,531)   clear of Fraction Reef's label column
 *   rock  #9   (320,520) → (325,531)   same
 *
 * The property, not the coordinates, is what `design-fidelity.test.ts` holds: no tappable target
 * overlaps another, no scenery is aimed at from inside a tappable one, and no trail dot lands on a
 * tappable silhouette. Move one of these later and the test re-derives the answer.
 */
const voyageWaypoints: readonly Waypoint[] = [
  { kind: 'buoy', x: 142, y: 136, label: 'DRILL' },
  { kind: 'chest', x: 177, y: 165 },
  { kind: 'rock', x: 326, y: 156 },
  { kind: 'rival', x: 129, y: 293 },
  { kind: 'rock', x: 141, y: 331 },
  { kind: 'wreck', x: 180, y: 368, label: 'WRECK' },
  { kind: 'buoy', x: 148, y: 405 },
  { kind: 'rival', x: 33, y: 491 },
  { kind: 'chest', x: 255, y: 531 },
  { kind: 'rock', x: 325, y: 531 },
  { kind: 'wreck', x: 256, y: 564 },
];

/**
 * Which island's fog gates each waypoint, by index into `voyageIsles`.
 *
 * The board states the rule it wants — *"only the islands gate progress; the waypoints are
 * optional, repeatable and cheap"* — but never says which waypoint belongs to which island, and
 * there is no such field in the catalog. Inventing one would be inventing content, so the gate is
 * DERIVED from the geometry the board does give: a waypoint belongs to the island whose blob centre
 * is nearest its own. That is mechanical, reviewable, and it is also what a child reads off the
 * picture — the buoy beside Port Sumwich is Port Sumwich's buoy.
 *
 * It matters twice: a waypoint under an island's fog is not tappable (tapping it would set
 * `currentIsland` to a locked island), and the `N OF 16 FOUND` counter counts the ones that are.
 */
const nearestIsle = (w: Waypoint): number => {
  const art = WAYPOINT_ART[w.kind];
  const cx = w.x + art.w / 2;
  const cy = w.y + art.h / 2;
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  voyageIsles.forEach((isle, i) => {
    const dx = isle.x + isle.w / 2 - cx;
    const dy = isle.y + isle.h / 2 - cy;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  });
  return best;
};

export const WAYPOINT_GATE: readonly number[] = voyageWaypoints.map(nearestIsle);

/** Total places on the chart — the board's own count, and the subject of `N OF 16 FOUND`. */
export const PLACE_COUNT = voyageIsles.length + voyageWaypoints.length;

/**
 * The kraken: three humps, a fluke and a waterline, drifting on `sc-hump`
 * (`translateY(0 → −3px → 0)`, 3.2s). Board 9d: *"It is not a node and it is not tappable. It
 * exists so that the fog is hiding something specific."*
 *
 * `y` is 272 rather than the board's 248: at 248 it sits under Port Sumwich's own label column
 * whenever that island is the live one — the board never draws that state, and it is the state
 * every new captain starts in.
 */
export const KRAKEN = {
  x: 16,
  y: 272,
  w: 110,
  h: 44,
  ms: 3200,
  riseY: 3,
  /** `border-radius: 999px 999px 0 0` — a dome. Offsets are `left` / `bottom` in the box. */
  humps: [
    { x: 0, bottom: 6, w: 36, h: 18, fill: '#B33E86' },
    { x: 34, bottom: 6, w: 32, h: 24, fill: '#F26FB2' },
    { x: 66, bottom: 6, w: 26, h: 14, fill: '#B33E86' },
  ],
  /** `right:0; bottom:4; 22×20`, `polygon(0 100%, 100% 0, 72% 54%, 100% 100%)`. */
  fluke: { x: 88, bottom: 4, w: 22, h: 20, fill: '#F26FB2', points: '0,100 100,0 72,54 100,100' },
  water: { w: 110, h: 8, fill: '#43B4E0', opacity: 0.8 },
} as const;

/**
 * The compass rose. 58pt, cream on the water, red north.
 *
 * **Scenery, and not a control.** Board 9d still claims *"it doubles as the zoom-out button — tap
 * the compass to see the whole sea"*, and that job died with the second view: there is nothing left
 * to zoom out to. The owner's rule is that a control which looks tappable and is not is the exact
 * defect being complained about, so the rose is drawn `pointerEvents="none"` with no `Pressable`
 * around it and no accessibility role. It keeps the job 9d gives it first — *"it anchors the map as
 * a chart rather than a level select"* — which needs no tap.
 *
 * The republished board moves it from `top:14` to `top:88`, out from under the header pill it now
 * shares the screen with. That is the board's own correction and it is transcribed.
 */
export const COMPASS = {
  size: 58,
  opacity: 0.92,
  ringWidth: 3,
  /** Each arm is a triangle in a box, exactly as the board clips it. */
  north: { x: 25, y: 5, w: 8, h: 24, fill: '#D93A2E', points: TRIANGLE_UP },
  south: { x: 25, y: 29, w: 8, h: 24, fill: '#14283C', points: TRIANGLE_DOWN },
  west: { x: 5, y: 25, w: 24, h: 8, fill: '#C9AE7E', points: '0,50 100,0 100,100' },
  east: { x: 29, y: 25, w: 24, h: 8, fill: '#C9AE7E', points: '100,50 0,0 0,100' },
  hub: { x: 24, y: 24, size: 10 },
} as const;

export const VOYAGE = {
  /**
   * The composition's own size — **not** "what is left after the chrome".
   *
   * The board draws its map layer inside `667 − 20 status − 134 dock = 513` and then lays content
   * out to y 663, so its own last island and every waypoint past it are clipped by `overflow:hidden`.
   * Rather than reproduce that, the composition is declared at its true extent and
   * `containWorldBoard` contain-fits it into whatever the chrome leaves — 0.777 at the reference
   * frame, so the whole chain is on screen at once, which is the entire point of one view.
   *
   * 664 is the content extent plus a point of air; `design-fidelity.test.ts` re-derives it from the
   * isles, labels, waypoints and kraken and fails if anything grows past it.
   */
  map: { width: 375, height: 664 },
  /** `radial-gradient(120% 80% at 50% 8%, #43B4E0 0, #1584B8 34%, #0C5E86 78%)`. */
  water: {
    cx: 0.5,
    cy: 0.08,
    rx: 1.2,
    ry: 0.8,
    stops: [
      { offset: 0, color: '#43B4E0' },
      { offset: 0.34, color: '#1584B8' },
      { offset: 0.78, color: '#0C5E86' },
    ],
  },
  /** The one big shallow: `left:26; top:248; 300×260; border-radius:50%; opacity:.14`. */
  lagoon: { x: 26, y: 248, w: 300, h: 260, opacity: 0.14 },
  swells: voyageSwells,
  isles: voyageIsles,
  isleTags: voyageIsleTags,
  waypoints: voyageWaypoints,
  /**
   * The ship's berth, beside the LIVE island — seaward, level with its middle.
   *
   * The board draws the ship once, at `left:176; top:224`, beside Isla Products, because that is
   * where its mock captain is standing. A literal 176/224 parks the boat next to an island the
   * player may have left, which is the one thing a position marker may not do.
   *
   * The rule instead: the ship's centre sits `gap` clear of the island's shallow ring, on whichever
   * side faces open water (the map's far edge), at the island's own vertical centre. The previous
   * `(−73, +73.5)` offset reproduced the board exactly and put the boat squarely on the island's
   * name chip once the labels were derived — an offset copied from one arrangement is a constant
   * about that arrangement.
   */
  ship: { gap: 12, shallowBleedX: 10, width: 38 },
  /** Scenery only — see `COMPASS`. The board's republished `right:16; top:88`, under the header. */
  compass: { right: 16, y: 88 },
  /** The board's `left:12; top:88` chip, under the header pill. */
  counter: { x: 12, y: 88, padX: 10, padY: 4, size: 11, tracking: 0.06 },
} as const;

/** Node geometry on the voyage map: a 52pt live disc-and-ring, 38pt for everything else. */
export const VOYAGE_NODE = {
  live: { ring: 52, disc: 46, discInset: 3, shadowDy: 4, glyphSize: 22 },
  flat: { size: 38, shadowDy: 3, glyphSize: 18, tickSize: 19 },
  gap: 4,
  chip: { padX: 12, padY: 4, size: 13, shadowDy: 3 },
  sub: { padX: 8, padY: 2, size: 11, tracking: 0.05 },
  /** The waypoint label pill, e.g. `DRILL`. */
  waypointChip: { padX: 8, padY: 2, size: 11, tracking: 0.04 },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Close chart (board 9b) — CUT FROM THE APP, RETAINED AS A MODEL
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// The close chart is gone: `CloseChart.tsx` is deleted, no route renders it, and the republished
// board no longer draws it ("A second zoomed-in chart was cut… one screen at one scale").
//
// What survives below, and exactly why:
//
//   `FOG_BAND.driftX` / `driftMs`  — `sc-drift`, which the per-island fog blobs still run.
//   `CLOSE.map`, `CLOSE.node*`, `CLOSE.ship`, `CLOSE_NODE`, `FOG_BAND`, `closeChartColumns`
//                                  — `__tests__/app/onboarding-wiring.test.ts` (A-005, owned by the
//                                    onboarding agent) measures the coach band against this column
//                                    model. Deleting it would break a test in another agent's
//                                    surface mid-flight.
//
// **This is scaffolding, not design.** It describes a screen no captain can reach. It should be
// deleted the moment A-005's geometry is retargeted at the voyage map's own station columns — which
// `design-fidelity.test.ts` already asserts directly, at every focus position, so the coverage
// exists and only the coach-band case still points here. Nothing new may depend on it.

/**
 * A drawn part of a close-chart island, in the island box's own coordinates.
 *
 * The close chart's two islands are not the voyage map's generic recipe at a bigger scale — they
 * are hand-composed, with a hut, a jetty, a snow cap. Board 9d claims *"the same map layer at two
 * scales, not two drawings"*, and that claim does not survive measurement: no single transform
 * carries one composition onto the other. The coordinates are the design and the prose is
 * commentary, so both views are transcribed literally (owner ruling 3).
 */
export type IslePart =
  | {
      readonly kind: 'blob';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly radii: CornerPercents;
      readonly fill: string;
      readonly innerShadow?: { readonly color: string; readonly dy: number };
    }
  | {
      readonly kind: 'rect';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly radius?: number;
      readonly fill: string;
      readonly innerShadow?: { readonly color: string; readonly dy: number };
    }
  | {
      readonly kind: 'poly';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly points: PolyPoints;
      readonly fill: string;
    };

export interface CloseIsle {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** The shallow ring is `inset: -14px -12px` with the sand's own corner set. */
  readonly radii: CornerPercents;
  readonly parts: readonly IslePart[];
}

/** The cleared island, `left:-34; top:46; 220×150`. Port Sumwich in the board's own state. */
const closeIsleCleared: CloseIsle = {
  x: -34,
  y: 46,
  w: 220,
  h: 150,
  radii: [56, 44, 50, 50],
  parts: [
    {
      kind: 'blob',
      x: 0,
      y: 0,
      w: 220,
      h: 150,
      radii: [56, 44, 50, 50],
      fill: '#F2E1B8',
      innerShadow: { color: '#DCC49A', dy: 8 },
    },
    {
      kind: 'blob',
      x: 26,
      y: 22,
      w: 160,
      h: 104,
      radii: [52, 48, 46, 54],
      fill: '#7ED07A',
      innerShadow: { color: '#5FA149', dy: 8 },
    },
    { kind: 'poly', x: 96, y: 34, w: 56, h: 38, points: TRIANGLE_UP, fill: '#5FA149' },
    { kind: 'rect', x: 118, y: 78, w: 26, h: 18, fill: '#C9813C', innerShadow: { color: '#A0631F', dy: 4 } },
    { kind: 'poly', x: 114, y: 70, w: 34, h: 10, points: TRIANGLE_UP, fill: '#B02418' },
    { kind: 'rect', x: 60, y: 66, w: 4, h: 22, radius: 2, fill: '#8B5A2B' },
    { kind: 'poly', x: 52, y: 58, w: 20, h: 12, points: PALM.frondPoints, fill: '#2F9E5C' },
    { kind: 'rect', x: 80, y: 96, w: 4, h: 18, radius: 2, fill: '#8B5A2B' },
    { kind: 'poly', x: 73, y: 88, w: 18, h: 11, points: PALM.frondPoints, fill: '#2F9E5C' },
    // `right:-16; top:104; 34×6` → x = 220 − 34 + 16.
    { kind: 'rect', x: 202, y: 104, w: 34, h: 6, radius: 3, fill: '#C9813C' },
    { kind: 'rect', x: 226, y: 108, w: 4, h: 12, fill: '#A0631F' },
    { kind: 'rect', x: 214, y: 108, w: 4, h: 12, fill: '#A0631F' },
  ],
};

/** The live island, `right:-20; top:244; 196×150` → x = 375 − 196 + 20. */
const closeIsleLive: CloseIsle = {
  x: 199,
  y: 244,
  w: 196,
  h: 150,
  radii: [46, 54, 52, 48],
  parts: [
    {
      kind: 'blob',
      x: 0,
      y: 0,
      w: 196,
      h: 150,
      radii: [46, 54, 52, 48],
      fill: '#F2E1B8',
      innerShadow: { color: '#DCC49A', dy: 8 },
    },
    {
      kind: 'blob',
      x: 22,
      y: 20,
      w: 146,
      h: 104,
      radii: [48, 52, 54, 46],
      fill: '#7ED07A',
      innerShadow: { color: '#5FA149', dy: 8 },
    },
    { kind: 'poly', x: 36, y: 30, w: 70, h: 44, points: TRIANGLE_UP, fill: '#5FA149' },
    { kind: 'poly', x: 60, y: 26, w: 22, h: 14, points: TRIANGLE_UP, fill: '#8AA0B4' },
    { kind: 'rect', x: 112, y: 62, w: 4, h: 24, radius: 2, fill: '#8B5A2B' },
    { kind: 'poly', x: 104, y: 54, w: 20, h: 12, points: PALM.frondPoints, fill: '#2F9E5C' },
    { kind: 'rect', x: 134, y: 82, w: 4, h: 20, radius: 2, fill: '#8B5A2B' },
    { kind: 'poly', x: 127, y: 74, w: 18, h: 11, points: PALM.frondPoints, fill: '#2F9E5C' },
  ],
};

/** `dur = 3.2 + (i % 3) × .7`, `delay = i × .4`. */
const closeSwells = swellsFrom(
  [
    [206, 92, 46],
    [40, 172, 34],
    [250, 232, 40],
    [22, 330, 30],
    [280, 350, 36],
    [86, 424, 42],
    [220, 480, 30],
  ],
  (i) => 3.2 + (i % 3) * 0.7,
  400,
);

export const CLOSE = {
  /** 375 × (667 − 20 status bar − 134 dock). The header pill floats over the top of this. */
  map: { width: 375, height: 513 },
  /** `radial-gradient(130% 70% at 40% 22%, #43B4E0 0, #1584B8 40%, #0C5E86 88%)`. */
  water: {
    cx: 0.4,
    cy: 0.22,
    rx: 1.3,
    ry: 0.7,
    stops: [
      { offset: 0, color: '#43B4E0' },
      { offset: 0.4, color: '#1584B8' },
      { offset: 0.88, color: '#0C5E86' },
    ],
  },
  swells: closeSwells,
  swellHeight: 4,
  isleCleared: closeIsleCleared,
  isleLive: closeIsleLive,
  /**
   * The one dashed route: `left:150; top:172; 112×5; rotate(24deg)`, 11pt dash in a 19pt tile.
   *
   * `travel` is NOT the board's 34. `sc-dash` moves the pattern 34px over a 19px tile, which is
   * 1.79 tiles — so every loop ends 4px out of phase and the dash visibly jumps. 38 is two whole
   * tiles and is what the board plainly meant (owner ruling 9).
   */
  route: {
    x: 150,
    y: 172,
    length: 112,
    angle: 24,
    thickness: 5,
    dash: 11,
    tile: 19,
    travel: 38,
    opacity: 0.85,
    ms: 1600,
  },
  /** Node columns: `left/top` for the two on open sea, and the fog group's own centred column. */
  nodeCleared: { x: 76, y: 186 },
  /** The practice buoy that belongs to the live island's own waters. */
  buoy: { x: 64, y: 296, w: 30, h: 38, label: 'PRACTICE BUOY' },
  /** `right:52; top:310` — the live island's node. Positioned from the right, as authored. */
  nodeLive: { right: 52, y: 310 },
  /** `right:118; top:238; width:46`. */
  ship: { right: 118, y: 238, width: 46 },
  /** Under the header band, which occupies the board's own `right:14 / top:14` slot. */
  compass: { right: 14, y: 66 },
} as const;

/** One soft bank in the fog band. The board anchors one from the left and one from the right. */
export interface FogBank {
  readonly x?: number;
  readonly right?: number;
  readonly bottom: number;
  readonly w: number;
  readonly h: number;
  readonly radii: CornerPercents;
  readonly opacity: number;
}

/**
 * The fog band at the bottom of the close chart.
 *
 * The board authors `height: 108; overflow: hidden` and then stacks its locked node inside it from
 * `top: 8` — and clips its own `MASTER ÷ TO LIFT THE FOG` requirement chip, which is the only thing
 * on the screen that says WHY the fog is there (owner ruling 10).
 *
 * **The band is not the thing that is wrong.** The board wraps that node's 44pt disc in a 64pt
 * `<div>` and lays the group out around the wrapper, which costs 20pt of nothing — and 20pt is very
 * nearly the 18 the group overruns by. Board 9d says what that box is actually for: *"a transparent
 * 64×64 box around every drawn disc, so the picture and the target are sized independently."* A
 * target is `hitSlop`, not layout. `StationMarker` draws the picture at its own size and pads the
 * target invisibly, so the group measures 96.5pt and the board's own 108 holds it with room spare.
 *
 * So `height` is the board's number and the wash is the board's box. An earlier pass raised this to
 * 125 with the gradient inset to compensate — a correct-looking fix to a mis-stated problem, and it
 * cost 17pt of headroom that the live island's label stack needed. See `CLOSE_NODE.fogClearance`.
 */
export const FOG_BAND = {
  height: 108,
  /** `linear-gradient(180deg, rgba(201,214,228,0) 0, rgba(201,214,228,.86) 42%, rgba(201,214,228,.97) 100%)`. */
  wash: [
    { offset: 0, opacity: 0 },
    { offset: 0.42, opacity: 0.86 },
    { offset: 1, opacity: 0.97 },
  ],
  /** `sc-drift`: `translateX(0 → 14px → 0)`, 8s. The wash bleeds 20pt past each edge to cover it. */
  driftX: 14,
  driftMs: 8000,
  washBleedX: 20,
  /** Two soft banks, anchored to the band's BOTTOM, exactly as the board authors them. */
  banks: [
    { x: 22, bottom: 26, w: 150, h: 64, radii: [50, 50, 46, 54], opacity: 0.7 },
    { right: 16, bottom: 8, w: 120, h: 52, radii: [52, 48, 50, 50], opacity: 0.6 },
  ] as readonly FogBank[],
  /** The locked node's column: `left:0; right:0; top:8`, centred. */
  group: { top: 8, gap: 4 },
} as const;

/**
 * Node geometry on the close chart.
 *
 * `hit` is the board's 64pt target and is spent as `hitSlop` around whatever the head actually
 * draws — never as a layout box. Board 9d: *"the disc is the picture, the column is the target."*
 */
export const CLOSE_NODE = {
  hit: 64,
  live: { ring: 66, disc: 60, discInset: 3, shadowDy: 5, glyphSize: 28 },
  cleared: { size: 42, shadowDy: 4, tickSize: 21 },
  locked: { size: 44, shadowDy: 3, glyphSize: 20 },
  gap: 4,
  chip: { padX: 12, padY: 4, size: 14, shadowDy: 3 },
  liveChip: { padX: 12, padY: 4, size: 15 },
  sub: { padX: 8, padY: 2, size: 11, tracking: 0.06 },
  /**
   * The gap a node's label stack must keep above the fog band's own node.
   *
   * The board draws ONE arrangement and threads it: its live node's stack runs to y 431 while the
   * fog band's disc starts at 423, and the two survive only because they miss each other SIDEWAYS
   * by about 3pt — the live column is right-anchored at `right: 52`, the fog group is centred, and
   * the strings happen to be `YOU ARE HERE` and a 44pt disc. Three points is a coincidence, not a
   * design: it does not survive a longer island name, nor a short viewport, where the composition
   * contain-fits smaller while the chips inside it stay on the barely-moving TYPE scale and the
   * stacks swell against a layout that shrank.
   *
   * So the two stacks are separated on the axis whose sizes are actually KNOWN. A chip's height is
   * arithmetic; its width is a font metric this code cannot measure, so no width-based rule could
   * be asserted in a test at all. `layout.ts`'s `closeChartColumns` clamps every node's top so its
   * stack ends this far above the fog group, at whatever scale the two are being drawn.
   */
  fogClearance: 8,
  /** `PRACTICE BUOY` and the requirement chip use the same small pill. */
  smallChip: { padX: 8, padY: 2, size: 11, tracking: 0.05 },
  /** The buoy: a ringed float, a post, and a shadow of water under it. */
  buoy: { ring: 24, ringInset: 5, post: { w: 8, h: 9 }, base: { w: 24, h: 6 } },
} as const;

/** `sc-ring`: `scale(.82) opacity(.9)` → `scale(1.5) opacity(0)`, ease-out, 1.8s, forever. */
export const RING = { ms: 1800, from: 0.82, to: 1.5, opacityFrom: 0.9 } as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Chrome shared by the close chart
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The header band — FRAME coordinates, the only band on this screen that uses them.
 *
 * `left/right: 12; top: 26; height: 52; z-index: 3`, a flexed rank pill plus a fixed purse. The
 * board puts it 6pt below a 20pt status bar, so on a real device the 6 survives and the 20 becomes
 * `insets.top`.
 *
 * Both halves are hub controls (`flow.ts`, surface `header`): *"the dock is for doing, the header
 * is for having."* Their INK is 52pt and 40pt tall; their targets are padded to 64 invisibly, which
 * is why `chartHubControlLayout` measures the band by `max(ink, 64)`.
 */
export const HEADER = {
  inset: 12,
  top: 26,
  height: 52,
  radius: 18,
  shadowDy: 3,
  paddingX: 8,
  gap: 8,
  /** The rank crest: `polygon(50% 0, 100% 16%, 100% 66%, 50% 100%, 0 66%, 0 16%)`, twice. */
  crest: { w: 34, h: 38, inset: 4, innerW: 26, innerH: 30, tierSize: 15 },
  crestPoints: '50,0 100,16 100,66 50,100 0,66 0,16',
  nameSize: 16,
  subtitleSize: 11,
  subtitleTracking: 0.04,
  /** The `›` affordance the board puts on both halves. */
  chevron: { size: 18, glyphSize: 11 },
  purse: {
    height: 40,
    padX: 8,
    gap: 8,
    coin: 22,
    /** `box-shadow: inset 0 -3px 0 #B87309` — a lit rim, drawn as a bottom crescent. */
    coinRimDy: 3,
    countSize: 16,
    shadowDy: 3,
  },
} as const;

/**
 * The station-safe band `flow.ts` measures the hub against.
 *
 * On the rebuilt close chart the sea is full-bleed and the header floats over it, so this is NOT
 * the painted map box — `CLOSE.map` is. It is the region in which an island node may be placed,
 * which is what the hub's no-overlap rule has always actually been protecting: a control on open
 * water above the first island covers nothing a child needs to tap. The board agrees by
 * construction — its northernmost close-chart node sits at frame y 206, far below `top`.
 */
export const MAP = { top: 86, bottom: 134, width: 375, height: 447 } as const;

/**
 * The bottom dock — `height: 134; border-radius: 22px 22px 0 0; box-shadow: 0 -4px 0 rgba(0,0,0,.08)`.
 *
 * The band's arithmetic IS the design and it is exact: `12 padding + 26 header row + 12 gap +
 * 72 button row + 12 padding = 134`. `chartHubControlLayout` derives the button row from those same
 * four numbers, so the pure model and the rendered dock cannot drift.
 */
export const DOCK = {
  height: 134,
  radius: 22,
  padding: 12,
  gap: 12,
  shadowDy: 4,
  headerHeight: 26,
  glyphTile: { size: 26, radius: 8, glyphSize: 15 },
  titleSize: 17,
  /** Ten mastery cells, 12pt square, radius 3, 4pt apart. */
  meter: { cells: 10, size: 12, radius: 3, gap: 4 },
  /**
   * The `NEXT ISLE: 2 DUELS` chip, in the same header row as the name and the meter.
   *
   * Not the board's — the board has nothing that says how close the next island is, which is why a
   * captain could win a duel and see the screen unchanged. It uses the board's own small-pill
   * metrics so the row keeps its 26pt height and the dock's `12 + 26 + 12 + 72 + 12 = 134`
   * arithmetic — which `flow.ts` derives the button row from — is untouched.
   */
  nextChip: { padX: 8, padY: 2, size: 11, tracking: 0.04 },
  buttonRadius: 18,
  buttonShadowDy: 4,
  controlGap: 16,
  /** Fight is `flex: 1.2` and 18/800; Practice and Guns are `flex: 1` and 16/700. */
  primaryTextSize: 18,
  secondaryTextSize: 16,
  /** The board draws each mark in a 26pt-tall box. */
  iconBox: 26,
} as const;

/**
 * The player's ship: `sprites/ship-01.png`, 66×113 natural.
 *
 * `bob` is `sc-bob`: `translateY(0 → −4px → 0)` with `rotate(−2deg → 2deg → −2deg)`, 3.6s. The
 * rotate is the RENDERED value — see the header's trap 1.
 */
export const SHIP = {
  aspect: 113 / 66,
  bob: { ms: 3600, riseY: 4, rotateDeg: 2 },
  /** `filter: drop-shadow(0 4px 5px …)` — no blur in RN, so the flat ellipse the rest of the screen uses. */
  shadow: { dy: 4, radius: 6, opacity: 0.25 },
} as const;

/** `sc-bob` also drives the chest (2.8s) and the rival's sail (3.4s). Same keyframe, same values. */
export const WAYPOINT_BOB = { chestMs: 2800, rivalMs: 3400 } as const;

/**
 * The operator each island teaches, as one glyph.
 *
 * The board draws `×` on Isla Products, `÷` on Quotient Cove, `½` on Fraction Reef and `( )` on The
 * Grandline, so four of the five are the design's own; Port Sumwich's `+` is the one CHOICE, made
 * from its `rangeSkills` with the same vocabulary as `theme/cannonPresentation.ts`. Typed as a
 * total `Record<IslandId, …>` so adding an island stops this file compiling until it has one.
 *
 * Not gated by grade band. `grade-band-ceiling.test.ts` gates the gun deck's OPERATOR ROW — a menu
 * of things to equip — where showing `÷` to a kindergartner offers a lesson three years early. A
 * locked island's glyph is the opposite: board 9a is explicit that *"a silhouette, a name and a
 * skill glyph survive the fog on every locked node, because anticipation is the whole point of a
 * map"*. It names a place, it does not offer a drill.
 */
export const islandGlyph: Record<IslandId, string> = {
  port_sumwich: '+',
  isla_products: '×',
  quotient_cove: '÷',
  fraction_reef: '½',
  grandline: '( )',
};

/**
 * The five stations, in catalog order.
 *
 * All that survives of the old per-station geometry table: `silhouette` marks the far end of the
 * map, which `stationState` reads to tell `locked-near` from `far-silhouette`. Every locked island
 * is DRAWN the same way — the board gives them all the same slate disc, name and glyph — but the
 * STATES stay distinct because the accessibility copy does ("locked in the fog" versus "far beyond
 * the fog"), and `chart-progress-presentation.test.ts` pins that seam.
 *
 * `VoyageMap` used to pass a hardcoded `{ silhouette: false }` at every node, so `far-silhouette`
 * was unreachable on the only surviving screen and two of the five documented states collapsed into
 * one. It reads this table now.
 */
export interface Station {
  readonly silhouette: boolean;
}

export const STATIONS: readonly Station[] = [
  { silhouette: false },
  { silhouette: false },
  { silhouette: false },
  { silhouette: true },
  { silhouette: true },
];
