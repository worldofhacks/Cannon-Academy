/**
 * The sea chart, transcribed from its design board.
 *
 * Source: project `88888c12-22e4-4781-b76f-a28110506499`,
 * `Cannon Academy Design Boards.dc.html`, `[data-screen-label="Sea chart"]` (board 3 · "Screens",
 * with the cold-entry ruling in 4f). Every number below was READ OFF the rendered board — either
 * from the element's resolved inline style or from its `getBoundingClientRect()` measured against
 * the 375×667 frame. Nothing here was chosen; where something IS a choice it says so.
 *
 * Why a data module rather than numbers at the call sites: the previous chart was an improvised
 * list because nobody had the board's geometry written down anywhere. Putting it in one file makes
 * a re-measure a diff, and makes "is this the design?" a question you can answer by reading.
 *
 * ── Coordinate system ──────────────────────────────────────────────────────────────────────────
 * The board is a 375×667 frame: a 20pt status bar, then chrome. Coordinates here are given in the
 * board's own pixels. Two spaces are used, and they are NOT interchangeable:
 *
 *   FRAME coordinates — measured from the top of the 375×667 frame. Used for the header pill.
 *   MAP coordinates   — measured from the top-left of the map area (`inset: 86px 0 126px`), so
 *                       `mapY = frameY - 86`. Used for everything on the chart itself.
 *
 * `MAP.width`/`MAP.height` are the map area's size at the reference frame. At runtime the map box
 * is whatever is left between the header and the dock, and positions are mapped PROPORTIONALLY
 * (`x/375`, `y/455`) while sizes scale by `L.a()`. That is the responsive rule from
 * `theme/responsive.ts` applied to a composition: the arrangement is preserved, the art grows.
 */
import type { IslandId } from '@content/schemas';

/** The frame the board is drawn at. Matches `REFERENCE` in `theme/responsive.ts`. */
export const FRAME = { width: 375, height: 667, statusBar: 20 } as const;

/** Header pill — `left/right: 12px; top: 26px; height: 52px; border-radius: 16px`. FRAME coords. */
export const HEADER = {
  inset: 12,
  /** From the frame top. The status bar occupies the 20pt above it, so it clears real insets by 6. */
  top: 26,
  height: 52,
  radius: 16,
  shadowDy: 3,
  paddingX: 12,
  gap: 10,
  pennant: { size: 34, radius: 10 },
  /** `clip-path: polygon(0 0, 100% 0, 72% 50%, 100% 100%, 0 100%)` in `Poly`'s point form. */
  pennantPoints: '0,0 100,0 72,50 100,100 0,100',
  nameSize: 16,
  subtitleSize: 11,
  subtitleTracking: 0.04,
  purse: {
    radius: 999,
    shadowDy: 2,
    gap: 5,
    padLeft: 6,
    padRight: 10,
    padY: 5,
    coin: 18,
    /** `box-shadow: inset 0 -3px 0 #B87309` — a lit rim, drawn as a bottom crescent. */
    coinRimDy: 3,
    countSize: 15,
  },
} as const;

/** Map area — `inset: 86px 0px 126px`. 375×455 at the reference frame. */
export const MAP = { top: 86, bottom: 126, width: 375, height: 455 } as const;

/** Grid-paper texture: 2pt white lines on a 30pt pitch, both axes, over `#B9E2F5`. */
export const GRID = { pitch: 30, line: 2 } as const;

/**
 * The one dashed route the board draws, transcribed literally:
 * `left:150; top:150; width:110; height:2; rotate(26deg); transform-origin: 0 50%; opacity:.45`
 * with `repeating-linear-gradient(90deg, #14283C 0 7px, transparent 7px 14px)`.
 *
 * It is a decorative fragment, not a connector — it is anchored to neither node's centre (node 0
 * sits at 119.8,108 and node 1 at 283.6,222, a 199pt chord at 35°). Drawing it as a connector
 * would be redrawing the design, so it is drawn where the board draws it. MAP coords.
 */
export const ROUTE = {
  x: 150,
  y: 150,
  length: 110,
  thickness: 2,
  angle: 26,
  dash: 7,
  opacity: 0.45,
} as const;

/** Fog bank — `inset: 312px 22px 0` inside the map area, i.e. it always reaches the map's bottom. */
export const FOG = {
  top: 312,
  insetX: 22,
  /** `inset: 0 -14px -10px` on the gradient overlay: it bleeds past the bank on three sides. */
  overlayBleedX: 14,
  overlayBleedY: 10,
  /** `animation: cb-fog 7s ease-in-out infinite` — `translateX(0 → 10px → 0)`. */
  driftX: 10,
  driftMs: 7000,
  /** Three soft banks at `opacity: .9`, MAP coords, `border-radius` as CSS percentage corners. */
  banks: [
    { x: 28, y: 320, w: 126, h: 56, radii: [48, 52, 44, 56] },
    { x: 229, y: 368, w: 116, h: 52, radii: [52, 44, 56, 48] },
    { x: 60, y: 403, w: 146, h: 48, radii: [46, 54, 50, 44] },
  ],
  opacity: 0.9,
  /** Vertical gradient over the bank. Stops are the board's own. */
  gradient: { stops: [0.55, 0.93, 0.97], at: [0, 0.34, 1] },
} as const;

/** A CSS `border-radius: a% b% c% d%` corner set, in TL, TR, BR, BL order. */
export type CornerPercents = readonly [number, number, number, number];

interface Land {
  /** Blob centre in MAP coords, and its size. */
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
  readonly radii: CornerPercents;
  /** The green foliage blob, offset from the land blob's top-left. */
  readonly foliage: { dx: number; dy: number; w: number; h: number; radii: CornerPercents };
  /** The hut, offset from the land blob's top-RIGHT. Only Port Sumwich has one. */
  readonly hut?: { right: number; dy: number; w: number; h: number; radius: number };
}

export interface Station {
  /** Drawn land, for the two stations in open water. Fog stations have none. */
  readonly land?: Land;
  /** Node marker: horizontal centre and top edge, MAP coords. */
  readonly node: { cx: number; top: number };
  /** Where the player's ship parks when this station is the live target, MAP coords (its centre). */
  readonly ship: { cx: number; cy: number };
  /** Top-left of the YOU ARE HERE chip that rides with the ship, MAP coords. */
  readonly hereChip: { x: number; y: number };
  /** Marker diameter when this station is fogged — the board draws two sizes under the fog. */
  readonly lockedSize: number;
  /** Fogged stations at the far end are silhouettes: smaller, dimmer, unlabelled by a chip. */
  readonly silhouette: boolean;
}

/**
 * The five stations, in catalog order — index 0 is `islands[0]`.
 *
 * **Stations are index-fixed on purpose.** `services/chart.ts` orders nodes by the catalog "so the
 * map never reshuffles as islands open — a child navigates by position". A station table that
 * re-assigned positions by role would undo exactly that.
 *
 * Which of the four states a station RENDERS (cleared / live target / locked / far silhouette) is
 * decided entirely by `chartNodes()`. The board's caption calls those "four node states in one
 * glance", and the board happens to draw the state a captain sees after clearing Port Sumwich.
 *
 * Provenance of each field:
 *   - Stations 0 and 1: every number measured off the board.
 *   - Stations 2, 3 and 4: measured off the board too — the fog bank is NOT an empty region, it
 *     contains Quotient Cove at 46pt with a name chip and a requirement chip, plus Fraction Reef
 *     and The Grandline as 30pt silhouettes in a `space-around` row. Their flex-resolved positions
 *     are transcribed here as absolute MAP coordinates so the ship can anchor to them.
 *   - `ship`/`hereChip` for stations 1–4: DERIVED, not measured. The board only ever draws the ship
 *     once, beside station 0, at `(+53.2, −24)` from that node's centre with the chip `(+25, −28)`
 *     from the ship. That same offset is reused, mirrored to the other side where the screen edge
 *     would otherwise cut the chip off (stations 1 and 4).
 */
export const STATIONS: readonly Station[] = [
  {
    land: {
      cx: 97,
      cy: 66,
      w: 126,
      h: 88,
      radii: [52, 40, 58, 44],
      foliage: { dx: 22, dy: 18, w: 54, h: 34, radii: [50, 46, 42, 52] },
      hut: { right: 20, dy: 12, w: 20, h: 26, radius: 8 },
    },
    node: { cx: 119.8, top: 82 },
    ship: { cx: 173, cy: 84 },
    hereChip: { x: 198, y: 56 },
    lockedSize: 46,
    silhouette: false,
  },
  {
    land: {
      cx: 290,
      cy: 191,
      w: 118,
      h: 82,
      radii: [44, 56, 40, 52],
      foliage: { dx: 26, dy: 16, w: 48, h: 30, radii: [52, 44, 50, 46] },
    },
    node: { cx: 283.6, top: 192 },
    // Mirrored to the blob's left edge: the board's +53.2 would push a 42pt ship to x 383.
    ship: { cx: 218, cy: 209 },
    hereChip: { x: 95, y: 181 },
    lockedSize: 46,
    silhouette: false,
  },
  {
    node: { cx: 187.5, top: 318 },
    ship: { cx: 240.7, cy: 317 },
    hereChip: { x: 265.7, y: 289 },
    lockedSize: 46,
    silhouette: false,
  },
  {
    node: { cx: 103.6, top: 410.5 },
    ship: { cx: 156.8, cy: 401.5 },
    hereChip: { x: 181.8, y: 373.5 },
    lockedSize: 30,
    silhouette: true,
  },
  {
    node: { cx: 269.1, top: 410.5 },
    ship: { cx: 322.3, cy: 401.5 },
    // Mirrored: +25 would put a 97pt chip at x 444.
    hereChip: { x: 199.8, y: 373.5 },
    lockedSize: 30,
    silhouette: true,
  },
];

/** Node marker geometry, all four states. Sizes and shadows are the board's. */
export const NODE = {
  /** Cleared: 52pt `#2FB65E`, `0 4px 0 #1E7F41`, plus a 5pt `rgba(47,182,94,.28)` spread ring. */
  cleared: { size: 52, shadowDy: 4, ringSpread: 5, tickSize: 26 },
  /** Live target: a 54pt disc inside a 60pt pulsing ring. `cb-ring` 1.6s ease-out, `.8 → 1.9`. */
  live: { size: 54, ring: 60, shadowDy: 4, glyphSize: 26, ringMs: 1600, ringFrom: 0.8, ringTo: 1.9 },
  /** Gap between the marker and its name chip. 5 at station 0, 4 everywhere else. */
  chipGap: 5,
  chipGapTight: 4,
  /** Name chip: `padding: 3px 9px; border-radius: 999px`, Baloo 2 13/800. */
  chip: { padX: 9, padY: 3, size: 13, shadowDy: 2 },
  /** `SAIL HERE ▸`: `padding: 2px 8px`, 10/800, `letter-spacing: .06em`. */
  sailChip: { padX: 8, padY: 2, size: 10, tracking: 0.06 },
  /** Board 4f: the chip animates in on cold entry, 240ms, "the same rise as everything else". */
  sailRiseMs: 240,
  sailRisePx: 8,
  /** Locked: a flat disc with a padlock, and a translucent name chip. */
  locked: { lockSize: 21, chipPadX: 10, chipPadY: 2, chipSize: 13 },
  /** Far silhouettes: 30pt disc, a 10/800 label 2pt under it, the whole group at `opacity: .75`. */
  silhouette: { size: 30, gap: 2, labelSize: 10, opacity: 0.75 },
  /** The requirement chip under the fog's first locked node: `rgba(255,246,228,.85)`, 10/800. */
  requirementChip: { top: 393, padX: 8, padY: 2, size: 10, tracking: 0.04 },
} as const;

/** The player's ship: `sprites/ship-01.png` at 42pt wide, `cb-bob` 3.4s. */
export const SHIP = {
  width: 42,
  /** 66×113 natural, so 42pt wide is 72pt tall. */
  aspect: 113 / 66,
  /**
   * The board authors `transform: rotate(38deg)` on the img — and then `cb-bob` animates
   * `transform`, which in CSS REPLACES it. The board's own measured bounding box (43.5×72.8 for a
   * 42×72 image) proves the ship renders at ±1.2°, not 38°. Transcribing the 38 literally would
   * draw a ship the board never shows, so the rendered value is the one that is kept.
   */
  bob: { ms: 3400, riseY: 5, rotateDeg: 1.2 },
  shadow: { dy: 4, radius: 6, opacity: 0.25 },
  hereChip: { padX: 8, padY: 2, size: 10, tracking: 0.06 },
} as const;

/** Bottom dock — `height: 126; border-radius: 22px 22px 0 0; box-shadow: 0 -4px 0 rgba(0,0,0,.08)`. */
export const DOCK = {
  height: 126,
  radius: 22,
  padding: 12,
  gap: 10,
  shadowDy: 4,
  headerHeight: 27.5,
  glyphTile: { size: 26, radius: 8, glyphSize: 15 },
  titleSize: 17,
  /** Ten mastery cells, 12pt square, radius 3, 3pt apart. */
  meter: { cells: 10, size: 12, radius: 3, gap: 3 },
  buttonHeight: 64.5,
  buttonRadius: 18,
  buttonShadowDy: 4,
  primaryTextSize: 19,
  primaryIconSize: 20,
  secondaryTextSize: 18,
  secondaryIconSize: 19,
  /**
   * Label size on a hub control — NOT a board measurement, and the only value in this file that is
   * not one.
   *
   * The board's dock carries two wide buttons and sets their labels at 19/18pt beside an icon. A-038
   * put FIVE controls in that row for demo reachability, and five 64pt targets consume the whole
   * 351pt inner width, so an icon-beside-19pt-label cannot fit and truncated to "Har…" / "Fi…".
   * Stacking the label under the icon fits, at the size below — chosen so the longest label
   * ("Practice") clears the square with margin. If the dock ever returns to the board's two
   * controls, delete this and use `primaryTextSize`/`secondaryTextSize` again (A-048).
   */
  controlLabelSize: 10.5,
  /**
   * Gap between hub controls. Small on purpose: with five controls the row's whole slack budget is
   * `rowWidth − 5 × 64`, which is ~7pt at a 375pt phone and NEGATIVE below ~350. Every point spent
   * here is taken off a tap target, so this is the least the row can look like a row (A-049).
   */
  controlGap: 4,
} as const;

/**
 * The operator each island teaches, as one glyph.
 *
 * The board draws `×` on Isla Products' node and on the dock's tile, so the glyph is part of the
 * design — but the board only shows one island, so the other four are a CHOICE, made from each
 * island's `rangeSkills` using the same glyph vocabulary as `theme/cannonPresentation.ts`. Typed
 * as a total `Record<IslandId, …>` so adding an island stops this file compiling until it has one.
 */
export const islandGlyph: Record<IslandId, string> = {
  port_sumwich: '+',
  isla_products: '×',
  quotient_cove: '÷',
  fraction_reef: '½',
  grandline: '±',
};
