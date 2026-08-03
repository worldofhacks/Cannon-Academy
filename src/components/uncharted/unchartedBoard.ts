/**
 * The Uncharted Sea: **geometry, state table and rules — never one captain's state.**
 *
 * Source: project `88888c12-22e4-4781-b76f-a28110506499`, `Cannon Academy Uncharted Sea.dc.html`
 * — the three 402×874 state screens, the Doorway column, and the board's own palette
 * declaration. Every number and hex below was READ OFF that file (the inline styles and the
 * `<script data-dc-script>` data block); nothing here was chosen, and where something IS a
 * choice the comment says so. Same discipline as `src/components/chart/board.ts`.
 *
 * The board's ISLAND VOCABULARY (recipes, pieces, slots, moods) is NOT re-transcribed here —
 * A-078 already carries it in `src/content/genIsland.ts` (`GEN_RECIPE_GEOMETRY`, `GEN_MOODS`,
 * `GEN_PIECE_SLOTS`…), and two transcriptions of one table is how they drift. This file holds
 * what the SCREEN adds: chrome geometry, the storm wall, the marker/banner/tally metrics, the
 * three-state table, the dock doorway chip, and the pure per-captain rules.
 *
 * ── The board's own traps, handled the `board.ts` way ─────────────────────────────────────────
 * Inline opacity is a lie wherever a keyframe animates opacity: `us-ghost` animates .24→.46 and
 * `us-swell` .5→.85, so those ANIMATED ranges are recorded beside the elements. For the ghost
 * ship the ticket overrules the CSS accident — "ghost ship at state opacity" (A-082 item 2) —
 * so the state table's `aheadShip` is what renders and the keyframe range is documentation.
 *
 * ── Palette placement (deviation, reported) ───────────────────────────────────────────────────
 * The board declares a NEW THEME group (deep-sea, 7 hexes) and 4 terrain additions, and the
 * ticket routes them to `src/theme/tokens.ts` — which is outside this ticket's file scope. They
 * are declared HERE instead, grouped and named exactly as the board names them, on the
 * `chart/palette.ts` precedent ("promoting one-screen hexes into the global palette is a
 * design-system decision, not a transcription… grouped so that move is a rename rather than a
 * re-measure"). Pennant/label tones are CONTENT data and belong beside the board constants
 * regardless (ticket item 6).
 *
 * Pure TS, loadable by the node test runner: no react-native import on this module's graph.
 */
import type { GenIslandPiece, GenIslandRecipe, GenIslandSlot } from '@content/genIsland';
import { islandCurriculumFor, islands } from '@content/index';
import type { GradeBand, SkillId } from '@content/schemas';

import type { CornerPercents } from '../chart/board';
import { duelReceiptKey } from '../../contracts/rewards';
import { unchartedDuelId } from '../../services/uncharted/duel';
import type { Captain } from '../../stores/player';
import { SKILL_GLYPH } from '../../theme/rankPresentation';
import { color } from '../../theme/tokens';

// ── Frame ─────────────────────────────────────────────────────────────────────────────────────

/** The board's screen frame. 402×874, the first 20pt the status bar. */
export const UNCHARTED_FRAME = { width: 402, height: 874, statusBar: 20 } as const;

// ── Palette: the board's declared additions ───────────────────────────────────────────────────

/**
 * The board's NEW THEME group, verbatim: *"deep-sea — 7 hexes, wants to be a theme group. The
 * frontier sits in deeper water than the chart, so sea/sea-deep bottom out too early."* Wants to
 * live in `theme/tokens.ts`; parked here (see module docblock) so the promotion is a rename.
 */
export const deepSea = {
  /** `deep-1` — the sea gradient's bright centre. */
  deep1: '#2A6E92',
  /** `deep-2` — the gradient's mid stop. */
  deep2: '#175A7E',
  /** `deep-3` — the tally panel body and the header pills' plank shadow. */
  deep3: '#123A52',
  /** `deep-panel` — the header chip and title pill fill. */
  deepPanel: '#1B4A66',
  /** `deep-4` — the status bar, the gradient's edge, the tally chip well. */
  deep4: '#0A2A3C',
  /** `deep-ink` — the ghost ship and the ahead-label pill's ground. */
  deepInk: '#0A2033',
  /** `deep-label` — the depth label and the tally header. */
  deepLabel: '#7FB0CC',
} as const;

/**
 * The board's TERRAIN additions, verbatim: *"4 hexes the Sea Chart used but never declared"* —
 * trunk, the twin-peak second cone, the summit cap, and the wreck-hull driftwood. They belong
 * with the chart's terrain group (`chart/palette.ts`); parked here for the same rename.
 */
export const unchartedTerrain = {
  trunk: '#8B5A2B',
  grassDeeper: '#4F8F3D',
  peakCap: '#DDEBF4',
  driftwood: '#5C4A3A',
} as const;

/**
 * The board's CONTENT group, verbatim — *"pennant + label tones — 8 hexes, content not theme…
 * data rows exactly like the ship skins and the gem tiers."* Content data beside the board
 * constants, per ticket item 6.
 */
export const contentTones = {
  pennantSky: '#7FCDEC',
  pennantMint: '#8FE0AC',
  pennantRose: '#F26FB2',
  pennantBone: '#E8DCC4',
  labelCool: '#BFD8E8',
  subClaimed: '#DFF3E6',
  subFogged: '#DDE8F0',
  subInk: '#2E4560',
} as const;

/** The tally row's seven pennant fills, in the board data script's own order (`PENNANT_TONES`). */
export const PENNANT_TONES = [
  '#F5A623',
  '#2FB65E',
  '#7FCDEC',
  '#F26FB2',
  '#FFD23F',
  '#8FE0AC',
  '#C9AE7E',
] as const;

/**
 * Hexes the board DRAWS but does not list in its own palette declaration — measured off the
 * elements, kept together so the omission is visible rather than laundered into a "declared"
 * group. Reported to the integrator with the ticket's palette deviation.
 */
export const boardLiterals = {
  /** The name banner's plank shadow (`box-shadow: 0 4px 0 #06121D`). */
  bannerShadow: '#06121D',
  /** The `inset 0 Npx 0` shade on every water feature (atoll ring, lagoon, tide pools). */
  waterInset: '#2A8FBF',
  /** The cliff spire's inset right shade (`inset -6px 0 0`). */
  spireShade: '#46596B',
  /** The beach hut's roof. */
  hutRoof: '#B02418',
  /** The ship sprite's drop shadow ink (`rgba(6,26,40,.5)`). */
  shipShadow: '#061A28',
} as const;

// ── Header ────────────────────────────────────────────────────────────────────────────────────

export const HEADER_U = {
  /** Frame-coordinate top (26) and the band's height. */
  top: 26,
  height: 52,
  inset: 12,
  gap: 8,
  chip: { size: 52, radius: 16, shadowDy: 4 },
  /** The harbor planks icon inside the header chip (22×18). */
  chipIcon: { w: 22, h: 18, baseH: 6, baseTop: 6, baseRadius: 3, postW: 5, postH: 12, postInset: 3 },
  title: { radius: 16, shadowDy: 4, padX: 12, gap: 10, size: 17, subSize: 11, subTracking: 0.04 },
  /** The compass-and-question disc on the title pill (30pt). */
  compass: {
    disc: 30,
    needle: { left: 13, top: 3, w: 4, h: 10 },
    oval: { left: 9, top: 8, w: 12, h: 15, ring: 2, glyphSize: 11 },
  },
  coins: { height: 40, padLeft: 8, padRight: 10, gap: 8, disc: 22, discInset: 4, size: 16, shadowDy: 4 },
} as const;

// ── Storm wall ────────────────────────────────────────────────────────────────────────────────

export interface WallBlobSpec {
  /** Anchored edge offset: `left` XOR `right`, board px. */
  readonly left?: number;
  readonly right?: number;
  readonly top: number;
  readonly w: number;
  readonly h: number;
  readonly radii: CornerPercents;
  /** Which state colour channel fills it. */
  readonly fill: 'wallA' | 'wallB';
}

export const WALL = {
  height: 236,
  blobs: [
    { left: -16, top: -40, w: 190, h: 180, radii: [52, 48, 44, 56], fill: 'wallA' },
    { right: -30, top: -56, w: 210, h: 190, radii: [46, 54, 56, 44], fill: 'wallB' },
    { left: 66, top: 34, w: 250, h: 150, radii: [56, 44, 50, 50], fill: 'wallA' },
  ] as readonly WallBlobSpec[],
  /** The victorious drift blob (`us-stir` 5.2s: translateX 0→11, scale 1→1.05). */
  stir: { left: 40, top: 10, w: 300, h: 170, opacity: 0.5, driftX: 11, scaleTo: 1.05, ms: 5200 },
  /** The ghost ship ahead. `animOpacity` is `us-ghost`'s range — documentation; the STATE's `aheadShip` renders (ticket item 2). */
  ghost: {
    left: 168,
    top: 82,
    w: 66,
    h: 50,
    mast: { left: 30, bottom: 16, w: 4, h: 30 },
    sail: { left: 10, bottom: 24, w: 20, h: 19, points: '100,0 100,100 0,88 10,56 0,28' },
    hull: { left: 0, bottom: 8, w: 62, h: 15, points: '0,0 100,0 88,100 11,100' },
    animOpacity: [0.24, 0.46],
    driftX: 8,
  },
  bolts: [
    { left: 52, top: 52, w: 20, h: 38, opacity: 0.7 },
    { right: 60, top: 96, w: 16, h: 30, opacity: 0.55 },
  ] as readonly {
    readonly left?: number;
    readonly right?: number;
    readonly top: number;
    readonly w: number;
    readonly h: number;
    readonly opacity: number;
  }[],
  /** Both bolts share one clip polygon. */
  boltPoints: '52,0 20,54 46,54 26,100 80,42 50,42 74,0',
  /** The ahead-label pill: bottom 14, `rgba(10,32,51,.72)` ground (deep-ink at .72), label-cool ink. */
  aheadPill: { bottom: 14, padX: 14, padY: 5, size: 11, tracking: 0.08, groundOpacity: 0.72 },
} as const;

// ── Centre band ───────────────────────────────────────────────────────────────────────────────

export const CENTER = {
  top: 236,
  height: 352,
  /** The ready-state glow behind the island (`us-glow`: opacity .34→.62, scale 1→1.05, 3.6s). */
  glow: { left: 68, top: 14, w: 266, h: 202, opacity: [0.34, 0.62] as const, scaleTo: 1.05, ms: 3600 },
  isle: { left: 76, top: 30, w: 250, h: 170 },
  /** The shallow ring bleed (`inset -18px -14px` equivalent) at 50% opacity. */
  shallow: { bleedX: 18, bleedY: 14, opacity: 0.5 },
  /** Sand and grass wear the board's inset-shadow depths (12 / 10). */
  sandInset: 12,
  grassInset: 10,
} as const;

/**
 * The ISLANDS template's feature dressing — the values its markup carries outside the geometry
 * rows (which live verbatim in `GEN_RECIPE_GEOMETRY`): the atoll ring's 7px sand rim and 5px
 * water inset, the lagoon's 4px inset, the spire's corner set and 6px shade band, and the
 * recipe rows' palm/rock primitives.
 */
export const ISLE_FEATURE = {
  ringPad: 7,
  ringWaterInset: 5,
  lagoonWaterInset: 4,
  spireRadii: [6, 6, 2, 2] as const,
  spireShadeW: 6,
  palm: { trunkW: 5, trunkRadius: 3, frondW: 30, frondH: 17 },
  rockPoints: '0,100 22,24 48,60 70,8 100,100',
} as const;

/** The arriving fog curtain: two halves, `us-part-l/r` — 620ms ease-out, ±40px, .9→0, forwards. */
export const CENTER_FOG = {
  bleedX: 26,
  bleedY: 22,
  width: 186,
  shiftX: 40,
  fromOpacity: 0.9,
  /** `#C9D6E4` — the chart's fog, the board's arriving wall colour. */
  fill: '#C9D6E4',
  leftRadii: [50, 0, 0, 50] as CornerPercents,
  rightRadii: [0, 50, 50, 0] as CornerPercents,
} as const;

/** The one timing AC-1 turns on: fog parts in 620ms, and only then is there anything to commit to. */
export const FOG_PART_MS = 620;

export const MARKER = {
  /** Column top inside the centre band, and the 6pt column gap. */
  top: 208,
  gap: 6,
  box: 72,
  disc: 56,
  glyphSize: 26,
  shadowDy: 5,
  /** The ready pulse (`us-ring` 1.8s): scale .84→1.46, opacity .85→0. */
  ring: { size: 60, inset: 6, ms: 1800, scaleFrom: 0.84, scaleTo: 1.46, opacityFrom: 0.85 },
} as const;

/**
 * The name banner: 19px Baloo in a pill capped at 372, ellipsise never wrap — the board's own
 * law ("The name banner takes 24 characters and no more… anything longer must ellipsise rather
 * than wrap"). `GEN_NAME_MAX` (24) in `genIsland.ts` is the same law's write-side half.
 */
export const BANNER_U = {
  maxWidth: 372,
  padX: 18,
  padY: 6,
  size: 19,
  shadowDy: 4,
} as const;

export const SUB_CHIP = { padX: 10, padY: 2, size: 11, tracking: 0.05 } as const;

/** The ship sprite: the chart's own `ship-01` raster at 44pt, the board's −16° heel. */
export const SHIP_U = { width: 44, rotateDeg: -16 } as const;

// ── Ambience tables (positions measured; loops are documented ranges, rendered static) ────────

/** `[left, top, size]`, gold. `us-mote` animates opacity .35→.85; rendered at the range floor. */
export const MOTES = [
  [38, 96, 5],
  [112, 44, 4],
  [268, 68, 5],
  [332, 130, 4],
  [64, 210, 4],
  [296, 236, 5],
  [180, 26, 4],
] as const;
export const MOTE_OPACITY = 0.35;

/** `[left, top, width]`, sea-crest, 4pt tall. `us-swell` animates .5→.85; rendered at the floor. */
export const SWELLS = [
  [24, 300, 44],
  [292, 340, 36],
  [56, 520, 40],
  [268, 556, 32],
  [140, 604, 46],
  [36, 640, 30],
] as const;
export const SWELL_OPACITY = 0.5;
export const SWELL_FILL = '#43B4E0';

/** The full-bleed backdrop: `radial-gradient(130% 66% at 50% 44%, deep-1 0%, deep-2 34%, deep-4 82%)`. */
export const SEA_GRADIENT = {
  cx: 50,
  cy: 44,
  rx: 130,
  ry: 66,
  stops: [
    { offset: 0, color: deepSea.deep1 },
    { offset: 0.34, color: deepSea.deep2 },
    { offset: 0.82, color: deepSea.deep4 },
  ],
} as const;

// ── Tally panel ───────────────────────────────────────────────────────────────────────────────

export const TALLY_U = {
  inset: 12,
  pad: 12,
  radius: 20,
  shadowDy: 5,
  headerSize: 11,
  headerTracking: 0.06,
  chip: { padX: 9, padY: 2, iconW: 13, iconH: 16, size: 15 },
  pennant: { w: 26, h: 32, glyphSize: 13, padTop: 4 },
  gap: 7,
  rowTop: 10,
} as const;

/** The pennant silhouette, both sizes, both screens. */
export const PENNANT_POINTS = '0,0 100,0 100,66 50,100 0,66';

/** The new pennant lands gold, with the `us-land` spring. */
export const PENNANT_NEW_FILL = '#FFD23F';

/** `us-land` 460ms `cubic-bezier(.2,1.4,.4,1)`: −22pt/.4/0 → (60%) 0/1.18/1 → 1. */
export const PENNANT_LAND = {
  ms: 460,
  fromY: -22,
  fromScale: 0.4,
  midScale: 1.18,
  /** The 60% keyframe, in ms of the 460. */
  midMs: 276,
} as const;

// ── Bottom bar ────────────────────────────────────────────────────────────────────────────────

export const BOTTOM_U = {
  pad: 12,
  radius: 22,
  gap: 12,
  /** `box-shadow: 0 -4px 0 rgba(0,0,0,.08)` — the dock's own lip idiom. */
  lipDy: 4,
  lipInk: 'rgba(0,0,0,0.08)',
  harbor: {
    size: 64,
    radius: 18,
    shadowDy: 4,
    labelSize: 11,
    icon: { w: 24, h: 20, baseH: 7, baseTop: 7, baseRadius: 3, postW: 5, postH: 14, postInset: 3 },
  },
  sail: {
    height: 64,
    radius: 18,
    gap: 10,
    labelSize: 22,
    icon: {
      w: 30,
      h: 26,
      mast: { left: 12, top: 0, w: 4, h: 26, radius: 2 },
      sail: { left: 0, top: 3, w: 26, h: 20, points: '100,0 100,100 0,90 10,58 0,28' },
    },
    ring: { inset: 5, radius: 22, width: 4 },
  },
} as const;

// ── The dock doorway chip (board Doorway column) ──────────────────────────────────────────────

export const DOORWAY = {
  /** The parchment plate the chip card sits on. */
  plate: { pad: 12, radius: 18 },
  chip: { height: 64, radius: 18, padX: 12, gap: 12, shadowDy: 5 },
  disc: {
    size: 40,
    rim: 2,
    needle: { edge: 4, mid: 18, w: 5, h: 13, sideW: 13, sideH: 5, sideOpacity: 0.45 },
    oval: { left: 11, top: 9, w: 18, h: 22, ring: 2, glyphSize: 15 },
  },
  lineSize: 18,
  subSize: 11,
  subTracking: 0.04,
  tallyChip: { padX: 9, padY: 3, iconW: 12, iconH: 15, size: 14, shadowDy: 3 },
  ring: { inset: 5, radius: 22, width: 4 },
  line: 'The Uncharted Sea',
  openSub: 'SAIL PAST THE EDGE',
  returningSub: 'SAIL AGAIN',
} as const;

// ── The ten-piece kit, as the board's kit rows draw them ──────────────────────────────────────

/**
 * One drawn part of a kit piece. Coordinates are the kit row's own, bottom-anchored exactly as
 * the board authors them (`bottom: Npx`), in the piece's art box. `points` parts render through
 * `Poly`, `ellipse` through `Blob`'s all-50 corner set, the rest as plain boxes.
 */
export interface PiecePart {
  readonly left?: number;
  readonly right?: number;
  readonly bottom: number;
  readonly w: number;
  readonly h: number;
  readonly points?: string;
  readonly radius?: number;
  /** CSS `border-radius: A B 0 0` — the lighthouse lamp's top-rounded cap. */
  readonly radiusTop?: number;
  readonly ellipse?: boolean;
  readonly fill: string;
  readonly opacity?: number;
  readonly rotateDeg?: number;
  /** `box-shadow: inset 0 -dy 0` — the board's bottom-band shade. */
  readonly insetShadow?: { readonly color: string; readonly dy: number };
  /** `box-shadow: inset 0 +dy 0` — the top band every water feature wears (`waterInset`). */
  readonly waterTop?: number;
  /** The fill rides the island mood's WATER channel (tide pools are water; moods may touch water). */
  readonly moodWater?: boolean;
  /** Horizontal stripes inside the part (the lighthouse's red bands), top-based within the part. */
  readonly bands?: readonly { readonly top: number; readonly h: number; readonly fill: string }[];
}

export interface PieceArt {
  readonly w: number;
  readonly h: number;
  readonly parts: readonly PiecePart[];
}

/** The palm frond polygon — the board draws the same six points everywhere a frond appears. */
export const PALM_FROND_POINTS = '50,100 0,34 16,14 50,44 84,14 100,34';

/**
 * The kit rows' drawings, transcribed part for part — MINUS each plate's ground strip, which is
 * scaffolding for the 78×56 thumbnail (the island under a placed piece is the island itself).
 * Colours are the plates' own, referenced through their declared names.
 */
export const PIECE_ART: Readonly<Record<GenIslandPiece, PieceArt>> = {
  palms: {
    w: 62,
    h: 46,
    parts: [
      { left: 22, bottom: 0, w: 4, h: 26, radius: 2, fill: unchartedTerrain.trunk },
      { left: 10, bottom: 22, w: 28, h: 14, points: PALM_FROND_POINTS, fill: color.palmFrond },
      { left: 46, bottom: 0, w: 3, h: 19, radius: 2, fill: unchartedTerrain.trunk },
      { left: 36, bottom: 15, w: 23, h: 12, points: PALM_FROND_POINTS, fill: color.palmFrond },
    ],
  },
  waterfall: {
    w: 66,
    h: 46,
    parts: [
      { left: 16, bottom: 16, w: 34, h: 30, points: '0,100 0,20 100,0 100,100', fill: color.driftRock },
      { left: 28, bottom: 4, w: 11, h: 30, fill: color.skyBottom, opacity: 0.9 },
      { left: 24, bottom: 0, w: 19, h: 9, ellipse: true, fill: color.white, opacity: 0.85 },
    ],
  },
  shipwreck: {
    w: 66,
    h: 40,
    parts: [
      { left: 38, bottom: 12, w: 4, h: 24, fill: unchartedTerrain.driftwood, rotateDeg: 20 },
      { left: 14, bottom: 14, w: 17, h: 13, points: '100,0 100,100 0,78', fill: color.inkSoft },
      { left: 10, bottom: 0, w: 52, h: 16, points: '0,0 100,22 88,100 10,100', fill: unchartedTerrain.driftwood },
    ],
  },
  volcano: {
    w: 64,
    h: 48,
    parts: [
      { left: 14, bottom: 0, w: 50, h: 36, points: '34,0 66,0 100,100 0,100', fill: color.driftRock },
      { left: 30, bottom: 32, w: 18, h: 7, radius: 999, fill: color.sailStripe },
      { left: 33, bottom: 37, w: 12, h: 9, radius: 999, fill: color.amberSoft },
    ],
  },
  lighthouse: {
    w: 58,
    h: 44,
    parts: [
      {
        left: 30,
        bottom: 0,
        w: 18,
        h: 34,
        radius: 3,
        fill: color.parchment,
        bands: [
          { top: 8, h: 6, fill: color.sailStripe },
          { top: 20, h: 6, fill: color.sailStripe },
        ],
      },
      { left: 27, bottom: 32, w: 24, h: 9, radiusTop: 3, fill: color.gold },
    ],
  },
  arch: {
    w: 62,
    h: 40,
    parts: [
      {
        left: 16,
        bottom: 0,
        w: 46,
        h: 38,
        points: '0,100 0,22 22,0 78,0 100,22 100,100 72,100 72,46 28,46 28,100',
        fill: color.driftRock,
      },
    ],
  },
  tide_pools: {
    w: 71,
    h: 26,
    parts: [
      { left: 10, bottom: 2, w: 22, h: 12, ellipse: true, moodWater: true, fill: color.seaFoam, waterTop: 2 },
      { left: 38, bottom: 12, w: 16, h: 9, ellipse: true, moodWater: true, fill: color.seaFoam, waterTop: 2 },
      { left: 52, bottom: 0, w: 19, h: 10, ellipse: true, moodWater: true, fill: color.seaFoam, waterTop: 2 },
    ],
  },
  bone_gate: {
    w: 62,
    h: 46,
    parts: [
      { left: 16, bottom: 0, w: 9, h: 36, radius: 4, fill: contentTones.pennantBone, rotateDeg: -7 },
      { right: 16, bottom: 0, w: 9, h: 36, radius: 4, fill: contentTones.pennantBone, rotateDeg: 7 },
      { left: 20, bottom: 30, w: 38, h: 8, radius: 4, fill: color.parchmentEdge },
    ],
  },
  beach_hut: {
    w: 62,
    h: 38,
    parts: [
      { left: 24, bottom: 0, w: 30, h: 18, fill: color.woodLight, insetShadow: { color: color.woodDeep, dy: 4 } },
      { left: 18, bottom: 16, w: 42, h: 14, points: '50,0 100,100 0,100', fill: boardLiterals.hutRoof },
    ],
  },
  ice_floe: {
    w: 66,
    h: 36,
    parts: [
      { left: 12, bottom: 0, w: 54, h: 34, points: '0,100 18,34 42,58 62,6 100,100', fill: unchartedTerrain.peakCap },
      { left: 20, bottom: 0, w: 34, h: 12, fill: contentTones.labelCool, opacity: 0.7 },
    ],
  },
} as const;

/**
 * Where a placed piece STANDS on each silhouette, isle-local (250×170) top-left anchors, one
 * list per exposed slot, consumed in `doc.pieces` order. **The one thing the board leaves
 * unstated**: it publishes pieces and the slots they may occupy, and the demo screens place
 * only the recipes' own palms and rocks — so these anchors are renderer placement over each
 * recipe's measured negative space (on land, clear of the measured palms/rocks/features), not a
 * transcription. Documented here so a future board revision can replace them with measurements.
 * The FIRST `palms@shore` entry (every document's guaranteed opener) renders at the recipe's
 * own measured palm positions instead, so the board's demo islands reproduce exactly.
 */
export const PIECE_ANCHORS: Readonly<
  Record<GenIslandRecipe, Readonly<Record<GenIslandSlot, readonly { x: number; y: number }[]>>>
> = {
  twin: {
    peak: [{ x: 72, y: -34 }],
    ridge: [
      { x: 148, y: 8 },
      { x: 20, y: 24 },
    ],
    shore: [
      { x: 132, y: 96 },
      { x: 52, y: 108 },
      { x: 178, y: 118 },
    ],
    lagoon: [],
  },
  atoll: {
    peak: [],
    ridge: [],
    shore: [
      { x: 84, y: 2 },
      { x: 150, y: 112 },
      { x: 28, y: 108 },
    ],
    lagoon: [
      { x: 74, y: 52 },
      { x: 104, y: 62 },
    ],
  },
  cliff: {
    peak: [{ x: 94, y: -40 }],
    ridge: [
      { x: 42, y: 24 },
      { x: 152, y: 34 },
    ],
    shore: [
      { x: 88, y: 112 },
      { x: 18, y: 82 },
      { x: 164, y: 104 },
    ],
    lagoon: [],
  },
  crescent: {
    peak: [],
    ridge: [
      { x: 40, y: 12 },
      { x: 96, y: 4 },
    ],
    shore: [
      { x: 22, y: 92 },
      { x: 84, y: 112 },
      { x: 134, y: 4 },
    ],
    lagoon: [
      { x: 136, y: 62 },
      { x: 172, y: 84 },
    ],
  },
} as const;

// ── The three states ──────────────────────────────────────────────────────────────────────────

export type UnchartedPhase = 'arriving' | 'ready' | 'victorious';

export interface UnchartedStateSpec {
  /** The depth label's second word: `ISLAND {n} · {depthWord}`. */
  readonly depthWord: string;
  readonly wallA: string;
  readonly wallB: string;
  readonly wallOpacity: number;
  readonly wallStirs: boolean;
  readonly aheadShip: number;
  readonly aheadLabel: string;
  readonly centerFogged: boolean;
  readonly centerGlows: boolean;
  readonly markerRings: boolean;
  readonly markerBg: string;
  readonly markerEdge: string;
  readonly subBg: string;
  readonly subInk: string;
  readonly shipLeft: number;
  readonly shipTop: number;
  readonly pennantNew: boolean;
  readonly sailBg: string;
  readonly sailEdge: string;
  readonly sailInk: number;
  readonly sailLabel: string;
  readonly sailRing: boolean;
  /**
   * Whether SET SAIL is actionable. A RULE, not a board field: the board draws arriving's button
   * flat, dimmed and ringless, and its note says why — *"there is nothing to commit to until the
   * child can see what they are committing to"* (AC-1: disabled while arriving).
   */
  readonly sailEnabled: boolean;
}

/** The board's `states` table, transcribed screen for screen. */
export const STATE_SPEC: Readonly<Record<UnchartedPhase, UnchartedStateSpec>> = {
  arriving: {
    depthWord: 'FOG PARTING',
    wallA: '#C9D6E4',
    wallB: '#C9D6E4',
    wallOpacity: 0.96,
    wallStirs: false,
    aheadShip: 0.16,
    aheadLabel: 'SOMETHING IS OUT THERE',
    centerFogged: true,
    centerGlows: false,
    markerRings: false,
    markerBg: '#8AA0B4',
    markerEdge: '#5A7288',
    subBg: '#DDE8F0',
    subInk: '#2E4560',
    shipLeft: 20,
    shipTop: 132,
    pennantNew: false,
    sailBg: '#E8DCC4',
    sailEdge: '#D8CBB2',
    sailInk: 0.42,
    sailLabel: 'Looking…',
    sailRing: false,
    sailEnabled: false,
  },
  ready: {
    depthWord: 'UNCLAIMED',
    wallA: '#8AA0B4',
    wallB: '#C9D6E4',
    wallOpacity: 0.72,
    wallStirs: false,
    aheadShip: 0.3,
    aheadLabel: 'NEXT ISLAND — NOT YET',
    centerFogged: false,
    centerGlows: true,
    markerRings: true,
    markerBg: '#F5A623',
    markerEdge: '#B87309',
    subBg: '#FFD23F',
    subInk: '#14283C',
    shipLeft: 332,
    shipTop: 150,
    pennantNew: false,
    sailBg: '#F5A623',
    sailEdge: '#B87309',
    sailInk: 1,
    sailLabel: 'Set sail',
    sailRing: true,
    sailEnabled: true,
  },
  victorious: {
    depthWord: 'CLAIMED',
    wallA: '#8AA0B4',
    wallB: '#8AA0B4',
    wallOpacity: 0.46,
    wallStirs: true,
    aheadShip: 0.44,
    aheadLabel: 'THE FOG IS STIRRING',
    centerFogged: false,
    centerGlows: false,
    markerRings: false,
    markerBg: '#2FB65E',
    markerEdge: '#1E7F41',
    subBg: '#DFF3E6',
    subInk: '#14283C',
    shipLeft: 330,
    shipTop: 196,
    pennantNew: true,
    sailBg: '#F5A623',
    sailEdge: '#B87309',
    sailInk: 1,
    sailLabel: 'Sail on',
    sailRing: true,
    sailEnabled: true,
  },
} as const;

// ── CSS transcription helper ──────────────────────────────────────────────────────────────────

/**
 * A CSS `border-radius` percentage shorthand → `Blob`'s corner tuple. The board (and
 * `GEN_RECIPE_GEOMETRY`, which keeps the board's exact strings) writes one value or four, in
 * TL TR BR BL order — CSS's own single-radius expansion.
 */
export function parseCornerPercents(shorthand: string): CornerPercents {
  const parts = shorthand
    .trim()
    .split(/\s+/)
    .map((part) => Number.parseFloat(part.replace('%', '')));
  if (parts.some((value) => !Number.isFinite(value))) {
    throw new Error(`unchartedBoard: unreadable corner shorthand '${shorthand}'`);
  }
  if (parts.length === 1) {
    const all = parts[0] as number;
    return [all, all, all, all];
  }
  if (parts.length === 4) {
    return [parts[0] as number, parts[1] as number, parts[2] as number, parts[3] as number];
  }
  throw new Error(`unchartedBoard: corner shorthand '${shorthand}' is neither 1 nor 4 values`);
}

// ── Per-captain rules ─────────────────────────────────────────────────────────────────────────

/**
 * Which of the three board states the screen is in.
 *
 * VICTORIOUS is a durable fact, not component state: A-081's settlement commits the
 * `duel:gduel_…` receipt exactly on a settled win and never on a loss, so "the current island
 * is claimed" is precisely "its duel's receipt exists". A loss leaves no receipt — the screen
 * returns to READY with the tally unchanged (AC-1) with no bookkeeping at all. ARRIVING is the
 * fog curtain's 620ms, held by the screen (`fogParted`); an undealt frontier is also arriving,
 * because the island is literally not visible yet.
 */
export function resolveUnchartedPhase(captain: Captain, fogParted: boolean): UnchartedPhase {
  const current = captain.uncharted?.current ?? null;
  if (current === null) return 'arriving';
  if (captain.rewardReceipts[duelReceiptKey(unchartedDuelId(current))] !== undefined) {
    return 'victorious';
  }
  return fogParted ? 'ready' : 'arriving';
}

/**
 * `ISLAND {n} · {state word}` — the header's depth label. `n` is the island's frontier ordinal
 * (`index − 5`: the authored chain ends at 5, so `gen_isle_6` is ISLAND 1 of the uncharted sea…
 * and the board's own demo agrees: seven pennants behind you, `ISLAND 8` ahead).
 */
export function unchartedDepthLabel(index: number, phase: UnchartedPhase): string {
  return `ISLAND ${index - 5} · ${STATE_SPEC[phase].depthWord}`;
}

/**
 * The tally chip's count. On the victorious screen the just-claimed island is already IN the
 * tally (the board shows ×8 over seven settled pennants plus the landing one) even though
 * `clearedCount` does not move until the explicit Sail-on advance (A-081's law).
 */
export function unchartedTallyCount(clearedCount: number, phase: UnchartedPhase): number {
  return clearedCount + (phase === 'victorious' ? 1 : 0);
}

/**
 * The band's whole skill ladder — every atlas cell's skills for this band, in island-chain
 * order, first occurrence wins. The same derivation `generator.ts`'s `bandLadder` deals
 * frontier skills from (not exported there; duplicated under its law, pinned by AC-2's sweep).
 */
export function bandSkillLadder(band: GradeBand): readonly SkillId[] {
  const ladder: SkillId[] = [];
  for (const island of islands) {
    for (const skillId of islandCurriculumFor(island.id, band).skills) {
      if (!ladder.includes(skillId)) ladder.push(skillId);
    }
  }
  return ladder;
}

/**
 * Glyphs for the settled pennant row, oldest first.
 *
 * The ticket asks for "that cleared island's first-skill glyph", but the captain's envelope
 * deliberately keeps no cleared docs (A-079: `{clearedCount, current, next}` — cleared islands
 * are regenerable in principle but their per-visit seeds are not stored), so the literal
 * derivation is unimplementable without widening the envelope — reported. What ships is the
 * property that sentence exists for: every glyph is dealt from the band's OWN ladder in
 * rotation, so the row is band-safe by construction (a k_1 row can never show × or ÷). The
 * LANDING pennant does know its island and carries `SKILL_GLYPH[current.skills[0]]`.
 */
export function pennantGlyphs(band: GradeBand, count: number): readonly string[] {
  const ladder = bandSkillLadder(band);
  return Array.from({ length: count }, (_, i) => SKILL_GLYPH[ladder[i % ladder.length] as SkillId]);
}

/** The settled row's fills: the board's own `PENNANT_TONES[i % 7]` cycle. */
export function pennantTone(index: number): string {
  return PENNANT_TONES[index % PENNANT_TONES.length] as string;
}
