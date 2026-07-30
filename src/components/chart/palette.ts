/**
 * The sea chart's colours.
 *
 * Most of this screen's palette is already in `theme/tokens.ts` and is re-exported by name here so
 * a call site reads as one palette rather than two. The rest are hexes the board uses on the chart
 * and nowhere else yet — the terrain group below, and the handful of translucent chip grounds.
 *
 * They live here rather than in `tokens.ts` because `tokens.ts` is shared across every screen and
 * promoting one-screen hexes into the global palette is a design-system decision, not a
 * transcription. Board 9d asks for exactly that promotion eventually — *"these fills want to be a
 * terrain group in theme/ … it appears on every screen with a map, so it should be named once"* —
 * and it is grouped as `terrain` here so that move is a rename rather than a re-measure.
 *
 * `#C9D6E4` deserves a note: `tokens.color.inkBright` is the same hex, but it means "bright text on
 * dark". Reusing it for fog would make a later readability change to text silently repaint the
 * weather, so the fog gets its own name.
 *
 * ── Contrast ───────────────────────────────────────────────────────────────────────────────────
 * Four pairs are banned project-wide (A-054): white on `success`, white on `amber`, ink on `sea`,
 * `goldDeep` on parchment. Every ink below sits on a ground certified against it:
 *
 *   `#14283C` on `#2FB65E` (cleared tick)          5.54   the board's own choice
 *   `#14283C` on `#F5A623` (live glyph)            6.90
 *   `#14283C` on `#8AA0B4` (locked glyph)          5.42
 *   `#14283C` on `#FFD23F` (YOU ARE HERE)          9.85
 *   `#FFFFFF` on `rgba(12,94,134,.78)` over sea    ≥7.09  `seaDeep` at .78 over `sea`/`seaFoam`
 *   `#2E4560` on `#FFF6E4` (requirement chip)      8.40
 */
import { color } from '../../theme/tokens';

/**
 * Terrain — the seven decorative fills board 9d enumerates, none of them behind text.
 * Sand and grass each carry a deep partner, which is the inset shadow along their bottom edge.
 */
export const terrain = {
  sand: '#F2E1B8',
  sandDeep: '#DCC49A',
  /** The grass an OPEN island wears. */
  grass: '#7ED07A',
  grassDeep: '#5FA149',
  /** The grass under fog is a step cooler, so the weather reads as weather and not as a filter. */
  grassLocked: '#6FBF6C',
  grassLockedDeep: '#54924A',
  frond: '#2F9E5C',
  trunk: color.wood,
  rock: '#5A7288',
  /** Slate — every locked node, and the fog banks. Already in use elsewhere. */
  slate: '#8AA0B4',
  slateDeep: '#5A7288',
} as const;

export const chart = {
  /** The frame behind everything. Both screens paint sea-deep edge to edge. */
  frame: color.seaDeep,
  seaDeep: color.seaDeep,
  seaMid: color.sea,
  seaCrest: color.seaFoam,

  /** Parchment chrome — the header pill, the dock, every cream name chip. */
  parchment: color.parchment,
  /** The hard shadow under parchment on this screen. Deeper than `parchmentEdge`. */
  parchmentShadow: '#C9AE7E',
  /** The shadow under a white card in the dock. */
  whiteShadow: color.parchmentEdge,
  /** The chevron wells on the header pill and the purse. */
  chevronWell: '#F0E2C8',
  white: color.white,

  /** Cleared node. */
  cleared: color.success,
  clearedShadow: color.successDeep,

  /** Live target, and the ring that keeps time around it. */
  live: color.amber,
  liveShadow: color.goldDeep,

  /** Locked node. */
  locked: terrain.slate,
  lockedShadow: terrain.slateDeep,

  /** Fog. */
  fog: '#C9D6E4',
  fogRgb: '201, 214, 228',
  fogBank: terrain.slate,

  /** Chip grounds. The board writes these as `rgba()` over the water, so they stay `rgba()` here. */
  waterChip: 'rgba(12, 94, 134, 0.8)',
  waterChipSoft: 'rgba(12, 94, 134, 0.78)',
  waterChipFirm: 'rgba(12, 94, 134, 0.82)',
  lockedChip: 'rgba(20, 40, 60, 0.62)',
  darkChip: '#14283C',
  requirementInk: '#2E4560',

  /** Ink. */
  ink: color.inkDark,
  inkMuted: color.inkDarkMuted,
  gold: color.gold,

  /** Buoy — the ring-and-post silhouette taken straight from the gunnery range. */
  buoyRing: color.parchment,
  buoyBand: color.sailStripe,
  buoyPost: '#F0A315',
  buoyWater: color.seaDeep,

  /** Treasure. */
  chest: color.woodLight,
  chestDeep: color.woodDeep,
  chestBand: color.amber,
  chestLock: color.goldDeep,

  /** A rival at sea. Purple only ever means "not you". */
  rivalSail: '#6C4BD6',
  rivalMast: color.purple,
  rivalHull: '#4A3B5C',

  /** A half-sunk hull. */
  wreck: '#5C4A3A',
  wreckSail: terrain.slate,

  /** The kraken, and the compass rose. */
  krakenDeep: color.krakenDeep,
  kraken: color.krakenPink,
  compassFace: 'rgba(255, 246, 228, 0.9)',
  compassRing: '#C9AE7E',
  compassNorth: color.sailStripe,
  compassSouth: color.inkDark,
  compassHub: color.amber,

  /** Dock. */
  dockShadow: 'rgba(0, 0, 0, 0.08)',
  meterFilled: color.success,
  meterEmpty: '#E8DCC4',
  huts: color.woodLight,
} as const;
