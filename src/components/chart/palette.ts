/**
 * The sea chart's colours.
 *
 * Most of the board's chart palette is already in `theme/tokens.ts` and is re-exported by name
 * here so a call site reads as one palette rather than two. The rest are hexes the board uses on
 * this screen and nowhere else yet — sand, foliage, fog, the hard-shadow edges under the sand and
 * the parchment pill.
 *
 * They live here rather than in `tokens.ts` because `tokens.ts` is shared across every screen and
 * this is a fidelity fix on one of them: promoting five one-screen hexes into the global palette
 * is a design-system decision, not a transcription. When a second screen needs sand, that is the
 * moment to move them up — and it will be a rename, not a re-measure.
 *
 * `#C9D6E4` deserves a note: `tokens.color.inkBright` is the same hex, but it means "bright text
 * on dark". Reusing it for fog would make a later readability change to text silently repaint the
 * weather, so the fog gets its own name.
 */
import { color } from '../../theme/tokens';

export const chart = {
  /** Frame background, under the grid layer. `#DFF1FB`. */
  frame: color.iceCard,
  /** The grid paper's own ground — this is what is actually visible. */
  gridSea: '#B9E2F5',
  gridLine: 'rgba(255, 255, 255, 0.35)',

  /** Header pill and name chips. */
  parchment: color.parchment,
  /** Hard shadow under parchment on this screen. Deeper than `parchmentEdge`. */
  parchmentShadow: '#C9AE7E',
  purseShadow: color.parchmentEdge,
  white: color.white,

  /** Island sand and the hard shadow it casts. */
  sand: '#F2E1B8',
  sandShadow: '#D9C293',
  foliage: '#7ED07A',
  hut: color.woodLight,

  /** Cleared node. */
  cleared: color.success,
  clearedShadow: '#1E7F41',
  clearedRing: 'rgba(47, 182, 94, 0.28)',

  /** Live target. */
  live: color.amber,
  liveShadow: color.goldDeep,
  liveRing: 'rgba(245, 166, 35, 0.45)',

  /** Fog, and everything under it. */
  fog: '#C9D6E4',
  fogRgb: '201, 214, 228',
  lockedNode: '#A8BACD',
  lockedChip: 'rgba(20, 40, 60, 0.6)',
  silhouetteLabel: '#3E5670',
  requirementChip: 'rgba(255, 246, 228, 0.85)',
  requirementInk: '#2E4560',

  /** Ink. */
  ink: color.inkDark,
  inkMuted: color.inkDarkMuted,
  gold: color.gold,

  /** Dock. */
  dockShadow: 'rgba(0, 0, 0, 0.08)',
  meterFilled: color.success,
  meterEmpty: '#E8DCC4',
} as const;
