/**
 * Lumen the lanternfish — the frontier's one host, and her tally riddle (A-086, amended D-17).
 *
 * Source: project `88888c12-22e4-4781-b76f-a28110506499`,
 * `Cannon Academy Uncharted Host.dc.html` — the roster card, the 402×874 encounter mock, and the
 * five-pose set with its `MOUTH`/`POSES` data script. Every number below was READ OFF that file;
 * where something is a choice rather than a measurement, the comment says so (the
 * `encounterBoard.ts` voice). This module is the NODE-PURE surface — the A-066 posture ("the
 * constants are the testable surface") with the board tables parked in the service because this
 * ticket's file scopes hold no board module; `LumenFigure.tsx` and `UnchartedEncounter.tsx` are
 * thin callers that the suite pins by source.
 *
 * ── The two D-13 overrides (ticket law — the board mock predates D-13's enforcement) ──────────
 *
 * 1. The board's adult bypass row under the card ("…the island chats") DOES NOT SHIP — D-13
 *    part one removed that affordance everywhere. No such control exists in any uncharted
 *    component (AC-2 source-sweeps the folder for the banned markers; this file deliberately
 *    never spells the row's own words, so the sweep can be a hard one).
 * 2. The board's asking line ("I lit 4 lamps, then 3 more. How many?") is an elliptical tail
 *    and DOES NOT SHIP. The live riddle composes from the board's OWN repeat-visit template
 *    ("I lit N lamps last time and N more tonight.") and closes with the full restated
 *    question — "How many lamps did I light?" — the same clarity predicate the authored
 *    riddles pass (spec(A-066:AC-7)).
 *
 * ── Tier B discipline ──────────────────────────────────────────────────────────────────────────
 *
 * Lumen is the whole region's host (board supersession of the design doc's species-cycling
 * note) and she lives entirely in the gen namespace: the authored `HOSTS` record, the authored
 * `RIDDLE_POOLS`, and `src/services/encounter.ts` never learn her name (AC-4). Her riddle is
 * not drawn from any pool — it is TEMPLATED ON REAL STATE, deterministic from
 * `(clearedCount, island seed)`, numbers that grow with progress and never breach the captain's
 * band ceiling (AC-3). Her coin strip is receipted through the A-041 ledger so it pays exactly
 * once per island, relaunch-proof (AC-4).
 *
 * No React import, no react-native import — loadable by the node test runner, like
 * `unchartedBoard.ts` beside it on the graph.
 */
import { genIslandSchema, type GenIslandDoc } from '@content/genIsland';
import { GRADE_BANDS, type GradeBand } from '@content/schemas';

import { duelReceiptKey, type ChestReceipt } from '../../contracts/rewards';
import type { Captain, CaptainStore } from '../../stores/player';
import { color } from '../../theme/tokens';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The host
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The roster row, verbatim: `9 shapes · body, tail, 2 fins, 2 eyes, mouth, lamp, rod`. A
 * HostSpec-shaped record that is deliberately NOT a `HOSTS` entry — Lumen never joins the
 * authored record, whose five keys are frozen (spec(A-066)/design §1 Tier A).
 */
export const LUMEN = {
  name: 'Lumen the lanternfish',
  species: 'lanternfish',
  shapeBudget: 9,
  /** The roster tank's own `uh-bob 3.4s`. */
  bobMs: 3400,
  /** The celebrating strip's sub-line, board verbatim. */
  rewardSub: 'Lumen found them in the deep.',
  /** The shrug strip's sub-line, board verbatim — always "nothing lost", always still glad. */
  missSub: 'Nothing lost. Lumen is glad you came.',
} as const;

/**
 * What a right answer pays, once, ever, per generated island — the board's own `+8 coins`
 * strip. A local literal by the `ENCOUNTER_COINS` precedent (a ceremony number, not tuning),
 * and deliberately NOT imported from the sealed `services/encounter.ts` — Tier B copies in its
 * scope rather than coupling to the authored world.
 */
export const LUMEN_COINS = 8;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Palette — the five hexes the board draws Lumen with and declares nowhere else
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Lumen's own skin, hex-verbatim off the figure markup. Wants to live in `theme/tokens.ts`
 * beside `crabShell`/`turtleShell`; parked here so the promotion is a rename (the A-082 palette
 * deviation, same integrator note). Everything else she wears is an existing token: lamp/motes
 * `gold`, eyes `parchment`, pupils/mouth `inkDark`, and her vignette is the deep-sea group
 * (`deepSea.deep3/deep4/deepPanel` — the board's #123A52/#0A2A3C/#1B4A66 are those very hexes).
 */
export const lumenSkin = {
  /** Body fill. */
  body: '#4C7C9E',
  /** The body's `inset 0 -8px 0` belly shade, and the roster tank's `-5px` variant. */
  bodyDeep: '#2F5C7C',
  /** Both fins. */
  fin: '#3F6B8A',
  /** The 30×8 back sheen pill (opacity .55). */
  sheen: '#6FA0C2',
  /** The lamp rod and its pivot dot — a night watchman's pole, never a lure. */
  rod: '#6B7F93',
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The five poses — the board's MOUTH and POSES tables, transcribed
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export const LUMEN_POSE_IDS = ['greeting', 'asking', 'celebrating', 'shrugging', 'farewell'] as const;
export type LumenPose = (typeof LUMEN_POSE_IDS)[number];

export type LumenMouthShape = 'smile' | 'open' | 'wide' | 'flat';

export interface LumenMouthSpec {
  readonly left: number;
  readonly bottom: number;
  readonly w: number;
  readonly h: number;
  /** The board's border-radius string, verbatim — `0 0 999px 999px` is a dome, `999px` a pill. */
  readonly radius: string;
}

/**
 * The data script's `MOUTH` table, big-figure keys (`mouthL/B/W/H/R`), px stripped to numbers.
 * One solid ink shape per variant — NO interior detail ever (board red card: "at 66px a mouth
 * with any interior detail reads as a maw"). The flat mouth is the shrug — never a frown.
 */
export const LUMEN_MOUTH: Readonly<Record<LumenMouthShape, LumenMouthSpec>> = {
  smile: { left: 52, bottom: 15, w: 14, h: 7, radius: '0 0 999px 999px' },
  open: { left: 54, bottom: 13, w: 12, h: 12, radius: '999px' },
  wide: { left: 50, bottom: 13, w: 18, h: 11, radius: '0 0 999px 999px' },
  flat: { left: 54, bottom: 17, w: 13, h: 4, radius: '999px' },
} as const;

/**
 * The same table's small keys (`mL/mB/mW/mH/mR`) — the pose-set THUMBNAIL's mouth, 62×54 scale.
 * Transcribed for completeness (the ticket pins the board's mouth tables exactly); the shipped
 * figure renders at the encounter scale and reads `LUMEN_MOUTH` only.
 */
export const LUMEN_MOUTH_THUMB: Readonly<Record<LumenMouthShape, LumenMouthSpec>> = {
  smile: { left: 28, bottom: 9, w: 10, h: 5, radius: '0 0 999px 999px' },
  open: { left: 29, bottom: 8, w: 8, h: 8, radius: '999px' },
  wide: { left: 26, bottom: 8, w: 13, h: 8, radius: '0 0 999px 999px' },
  flat: { left: 29, bottom: 11, w: 9, h: 3, radius: '999px' },
} as const;

/**
 * The board's keyframes, values verbatim. `hop`/`shrug` run ONCE (`ease-out both`); everything
 * else loops. The rod's `uh-sway` is recorded here and rendered ADDED to the rod's static 32°
 * (the board's CSS keyframe would OVERRIDE the inline rotate to a −6°..6° wave around zero —
 * the `board.ts` "inline transform is a lie" trap; the drawn intent, a held rod that sways, is
 * what ships, and this note is the record).
 */
export const LUMEN_ANIM = {
  /** `uh-bob`: −5pt at the midpoint, 3.4s, every resting pose. */
  bob: { ms: 3400, riseY: 5 },
  /** `uh-hop`: 30% → up 15 / −7°, 60% → up 4 / +5°, settle. 620ms, once. */
  hop: { ms: 620, riseY: 15, tiltFromDeg: -7, tiltToDeg: 5, midRiseY: 4 },
  /** `uh-shrug`: 40% → −5° / up 3, 70% → +4°, settle. 520ms, once. A rock, never a droop. */
  shrug: { ms: 520, tiltFromDeg: -5, tiltToDeg: 4, riseY: 3 },
  /** `uh-lamp`: opacity .55 → 1, scale → 1.1, 2.6s — the light breathes in every pose. */
  lamp: { ms: 2600, opacityFrom: 0.55, scaleTo: 1.1 },
  /** `uh-sway` on the rod: ±6°, 4.2s (see the docblock's trap note — added to the 32° hold). */
  sway: { ms: 4200, deg: 6, rodBaseDeg: 32 },
  /** `uh-arm-a` on the top fin: −7° → 8°, 3.6s. */
  finTop: { ms: 3600, fromDeg: -7, toDeg: 8 },
  /** `uh-arm-b` on the bottom fin: 6° → −9°, 4s. */
  finBottom: { ms: 4000, fromDeg: 6, toDeg: -9 },
  /** `uh-mote`: up 8pt, opacity .35 → .8 — the vignette's drifting gold. */
  mote: { riseY: 8, opacityFrom: 0.35, opacityTo: 0.8 },
  /** `uh-pop` on the reward strip: scale .72 → 1.04 at 60% → 1, 220ms. */
  pop: { ms: 220, fromScale: 0.72, overshootScale: 1.04 },
} as const;

export interface LumenPoseSpec {
  /** Which keyframe drives the whole figure in this pose. */
  readonly anim: 'bob' | 'hop' | 'shrug';
  readonly mouth: LumenMouthShape;
  /** The two gold stars — celebrating only. */
  readonly stars: boolean;
  /** The pose-set panel's monospace annotation, board verbatim (the transcription witness). */
  readonly spec: string;
}

/**
 * The data script's `POSES` table — anim/mouth/stars exactly. The board's LINES ride separately
 * (`LUMEN_COPY` and the tally riddle) because two of them are D-13 overrides and two carry the
 * live answer; the shapes never change: *"only the mouth shape, the arm pose and the stars
 * change, so every variant is the same nine shapes."*
 */
export const LUMEN_POSES: Readonly<Record<LumenPose, LumenPoseSpec>> = {
  greeting: { anim: 'bob', mouth: 'smile', stars: false, spec: 'uh-bob 3.4s · mouth smile' },
  asking: { anim: 'bob', mouth: 'open', stars: false, spec: 'uh-bob 3.4s · mouth open' },
  celebrating: { anim: 'hop', mouth: 'wide', stars: true, spec: 'uh-hop 620ms · mouth wide · 2 stars' },
  shrugging: { anim: 'shrug', mouth: 'flat', stars: false, spec: 'uh-shrug 520ms · mouth flat' },
  farewell: { anim: 'bob', mouth: 'smile', stars: false, spec: 'uh-bob 3.4s · mouth smile' },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The figure — nine shapes in a 110×96 box (the encounter card's own scale)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Board figure markup, offsets verbatim. THE LAMP LAW lives in these numbers and is pinned by
 * AC-1: the lamp (left 2..22) sits wholly LEFT of the body (left 30) and the face (eyes from
 * left 40) — out to the side on a rod she is visibly holding, never a lure over the eyes,
 * which is "the exact silhouette that makes real anglerfish frightening" (board red card).
 */
export const LUMEN_FIGURE = {
  box: { w: 110, h: 96 },
  /** Shape 8/9 — the carried lamp: 20pt disc, gold, with its soft glow and a cream highlight. */
  lamp: {
    left: 2,
    bottom: 56,
    size: 20,
    /** `box-shadow: 0 0 18px 8px rgba(255,210,63,.45)` — rendered as a flat halo disc at the
     * spread size (`size + 2×spread`), never a blur (the Blob idiom: flat is the art). */
    glow: { spread: 8, opacity: 0.45 },
    highlight: { left: 5, top: 4, w: 10, h: 12, opacity: 0.8 },
  },
  /** Shape 9/9 — the rod: pivot dot + the held pole (32°, swaying — see LUMEN_ANIM.sway). */
  rod: { left: 14, bottom: 44, w: 26, h: 7, radius: 3 },
  rodTip: { left: 0, bottom: 52, size: 6 },
  /** Shape 1/9 — the body blob: `border-radius: 52% 48% 46% 54%`, belly inset 8. */
  body: { left: 30, bottom: 4, w: 66, h: 56, radii: [52, 48, 46, 54] as const, insetDy: 8 },
  /** The body's back sheen — interior detail of shape 1, not a tenth shape. */
  sheen: { left: 8, top: 12, w: 30, h: 8, opacity: 0.55 },
  /** Shape 2/9 — the tail: `clip-path: polygon(100% 0, 0 50%, 100% 100%)`. */
  tail: { right: 0, bottom: 14, w: 24, h: 30, points: '100,0 0,50 100,100' },
  /** Shape 3/9 — the top fin (`uh-arm-a`, origin 50% 100%). */
  finTop: { left: 44, bottom: 52, w: 16, h: 10 },
  /** Shape 4/9 — the bottom fin (`uh-arm-b`, origin 50% 0). */
  finBottom: { left: 52, bottom: 0, w: 18, h: 11 },
  /** Shapes 5/9 and 6/9 — the eyes, low and wide per the chibi rules; pupils are interior. */
  eyes: {
    lefts: [40, 62] as const,
    bottom: 24,
    w: 17,
    h: 19,
    pupil: { w: 9, h: 11, marginTop: 4 },
  },
  /** The celebrating stars — the boards' shared five-point polygon, two sizes. */
  stars: [
    { left: 14, bottom: 74, size: 14 },
    { right: 2, bottom: 66, size: 10 },
  ] as const,
} as const;

/** The boards' shared five-point star polygon — the same ten points every board draws. */
export const LUMEN_STAR_POINTS = '50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The deep vignette — her tank has no land
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The encounter card's scene, board verbatim: 168pt of deep water (`deepSea.deep3`), a dark
 * seabed (`deep4`), a `deepPanel` sediment band, two rock silhouettes, two kelp pillars, six
 * drifting gold motes, and her own lamp as the only warm light. *"Her vignette is the
 * exception, and deliberately so"* — no sky, no sand, no palms; a pre-reader sees instantly
 * that this place is not like the other five.
 */
export const LUMEN_VIGNETTE = {
  height: 168,
  radius: 18,
  seabedHeight: 34,
  band: { bottom: 30, h: 5 },
  /** Six motes; durations are the script's own computation `2.4 + (i % 3) * 0.6`s, delay `i * 0.5`s. */
  motes: [
    { left: 34, top: 26, size: 5 },
    { left: 92, top: 14, size: 4 },
    { left: 196, top: 30, size: 5 },
    { left: 268, top: 18, size: 4 },
    { left: 312, top: 52, size: 5 },
    { left: 146, top: 54, size: 4 },
  ] as const,
  moteTiming: { durBaseMs: 2400, durStepMs: 600, durMod: 3, delayStepMs: 500 },
  rocks: [
    { left: 24, bottom: 26, w: 44, h: 30, points: '0,100 22,26 48,60 70,10 100,100' },
    { right: 18, bottom: 26, w: 36, h: 24, points: '0,100 26,18 54,56 78,14 100,100' },
  ] as const,
  kelp: [
    { left: 96, bottom: 30, w: 26, h: 44 },
    { right: 80, bottom: 30, w: 20, h: 34 },
  ] as const,
  /** Where Lumen swims: `left:146; bottom:34`, the 110×96 figure box. */
  figure: { left: 146, bottom: 34 },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Card chrome — the A-066 layout, copied into this scope (the sealed card is never edited)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** `left/right:16, top:150, radius 22, padding 14, box-shadow 0 8px 0` — one top for all poses. */
export const LUMEN_CARD = { top: 150, marginX: 16, radius: 22, padding: 14, shadowDy: 8 } as const;

/** `rgba(20,40,60,.62)` — rgb(20,40,60) IS `inkDark`; only the alpha is the scrim's own. */
export const LUMEN_SCRIM = { opacity: 0.62 } as const;

/**
 * The FITTED bubble: the A-066 speech bubble (19px riddle face, tail at 44, 44pt speaker slot)
 * carrying the duel's fitted discipline — 3 bounded lines, native shrink to the 0.75 floor.
 * `maxChars` is the derived cap the AC-2 sweep enforces: the card's line box is 402 − 2·16
 * (margins) − 2·14 (card pad) − 2·14 (bubble pad) − 44 − 10 (speaker + gap) = 260pt; at the
 * full 19px Baloo face ≈ 26 chars fit a line, ×3 lines ≈ 78 — 76 keeps every riddle at FULL
 * size with room, before the native shrink is even needed.
 */
export const LUMEN_BUBBLE = {
  radius: 18,
  padX: 14,
  padY: 12,
  shadowDy: 4,
  greetingSize: 19,
  riddleSize: 19,
  maxLines: 3,
  minFontScale: 0.75,
  maxChars: 76,
  tail: { x: 44, w: 18, h: 10 },
  speakerSlot: { size: 44, radius: 14 },
} as const;

/** The 2×2 answer grid — the duel's own learned tiles at the board's 76pt height, 34px numerals. */
export const LUMEN_TILE = {
  height: 76,
  radius: 18,
  numeralSize: 34,
  markSize: 26,
  gap: 12,
  columns: 2,
  shadowDy: 4,
} as const;

/** The reward strip: 48pt plate, 20px title, 13px sub, 28pt coin, the 220ms pop. */
export const LUMEN_REWARD = {
  radius: 18,
  padding: 14,
  gap: 12,
  plate: 48,
  plateRadius: 14,
  titleSize: 20,
  subSize: 13,
  coinSize: 28,
  coinInset: 5,
} as const;

/**
 * How long the marked tiles stay on screen after a tap before the reward strip lands — a CHOICE,
 * not a measurement: the board's celebrating/shrugging frames are settled states with no window
 * of their own, so the A-066 card's resolve window (its coin arc's 900ms) is copied in scope, the
 * same way the tile treatments are.
 */
export const LUMEN_RESOLVE_MS = 900;

/** Say hello / Onward! / Bye! — the one amber button with the single gold ring. */
export const LUMEN_ACTION = {
  height: 64,
  radius: 18,
  shadowDy: 5,
  labelSize: 20,
  chevron: { size: 20, glyphSize: 13 },
  ring: { inset: 5, width: 4, radius: 22 },
} as const;

// ── Tile treatments — the A-066 `tiles()` semantics, copied in scope ───────────────────────────

export interface LumenTileLook {
  readonly bg: string;
  readonly shadow: string;
  readonly ink: string;
  readonly mark?: '✓' | '~';
}

/** White card, parchment edge, dark ink — the tile the child already knows from the duel. */
export const LUMEN_TILE_IDLE: LumenTileLook = {
  bg: color.white,
  shadow: color.parchmentEdge,
  ink: color.inkDark,
};

/** The true answer, tapped or revealed — INK on success (white-on-success is a banned pair). */
export const LUMEN_TILE_CORRECT: LumenTileLook = {
  bg: color.success,
  shadow: color.successDeep,
  ink: color.inkDark,
  mark: '✓',
};

/** The gentle miss: AMBER, NEVER RED — red belongs to a wrong duel answer and a critical hull. */
export const LUMEN_TILE_MISS: LumenTileLook = {
  bg: color.amberSoft,
  shadow: color.goldDeep,
  ink: color.inkDark,
  mark: '~',
};

/** Before a pick everything idles (no tile pre-ringed); after it, truth goes green, the miss amber. */
export function lumenTileLooks(
  count: number,
  picked: number | null,
  correctIndex: number,
): readonly LumenTileLook[] {
  return Array.from({ length: count }, (_, i) => {
    if (picked === null) return LUMEN_TILE_IDLE;
    if (i === correctIndex) return LUMEN_TILE_CORRECT;
    if (i === picked) return LUMEN_TILE_MISS;
    return LUMEN_TILE_IDLE;
  });
}

/** Gold strip, parchment plate, `goldDeepest` sub — the board's celebrating card, token for hex. */
export const LUMEN_REWARD_RIGHT = {
  bg: color.gold,
  plate: color.parchment,
  subInk: color.goldDeepest,
} as const;

/** Sunken parchment, muted ink — amber-never-red; `No harm done` is calm, not a consolation prize. */
export const LUMEN_REWARD_MISS = {
  bg: color.parchmentSunk,
  plate: color.parchment,
  subInk: color.inkDarkMuted,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Copy
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** The board's fixed lines, verbatim — the two answer lines carry the live NUMERAL (the A-066
 * rule: a pre-reader reads `7` more reliably than `seven`; the board's "Seven lamps!" is demo
 * copy for one specific riddle). */
export const LUMEN_COPY = {
  greeting: 'Hello! I keep the lamps out here.',
  sayHello: 'Say hello',
  onward: 'Onward!',
  bye: 'Bye!',
  farewell: 'Come back any time. I will be here.',
  noHarm: 'No harm done',
} as const;

export function lumenCheerLine(answer: number): string {
  return `${answer} lamps! You have sharp eyes.`;
}

export function lumenCloseLine(answer: number): string {
  return `Close! It was ${answer}. Lamps are tricky.`;
}

export function lumenRewardTitle(coins: number): string {
  return `+${coins} coins`;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The tally riddle — templated on real state, growing with progress, never breaching the band
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Each band's numeric ceiling for the tally riddle — the largest number the riddle may ASK or
 * ANSWER. Anchored on the band's own curriculum magnitudes, not invented: k_1's atlas tops out
 * at numbers within 20 (`sub_within_20`, `place_value_teens` — CCSS 1.OA/1.NBT); g2_3 adds
 * within 100 (2.NBT.5); g4_5 scales — the 12×12 times-table bound (`mult_facts`' own square).
 */
export const TALLY_CEILING: Readonly<Record<GradeBand, number>> = {
  k_1: 20,
  g2_3: 100,
  g4_5: 144,
} as const;

export interface TallyRiddle {
  /** The whole question — D-13: the closing sentence restates the action in full. */
  readonly text: string;
  /** The board's template operands: lamps last time / tonight, or lamps-each / nights. */
  readonly a: number;
  readonly b: number;
  /** k_1 and g2_3 sum; g4_5 may scale (the ticket's own words). */
  readonly op: 'add' | 'mult';
  readonly answer: number;
  /** Four DISTINCT tiles, the answer among them exactly once. */
  readonly choices: readonly number[];
  readonly correctIndex: number;
}

/** Stable 32-bit FNV-1a — the same mixing the local generator and chest receipts deal from. */
function fnv1a(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * The tally riddle — a pure function of `(island seed, clearedCount, band)`, per the ticket.
 * Same island, same tally, same riddle, forever; no `Date.now()`, no `Math.random()`.
 *
 * The GROWTH lives in the progress-bound operand (lamps-last-time, or nights), monotone
 * non-decreasing in `clearedCount` and clamped so the answer sits under `TALLY_CEILING[band]`
 * BY CONSTRUCTION, at any tally, forever — swept by AC-3 across every band × clearedCount:
 *
 *   k_1   `a = min(3 + cleared, 12)`, `b = 1 + deal % min(7, 20 − a)`        → answer ≤ 19
 *   g2_3  `a = min(9 + 2·cleared, 79)`, `b = 2 + deal % min(19, 99 − a)`     → answer ≤ 99
 *   g4_5  `nights = min(3 + ⌊cleared/2⌋, 12)`, `each = 3 + deal % 10`        → answer ≤ 144
 *
 * Distractors are the answer's near misses (±1..3), clamped to [1, ceiling] — the filtered
 * pool always holds at least three values (the answer is never under 4 or over the ceiling),
 * so four distinct tiles exist for every deal.
 */
export function tallyRiddleFor(
  doc: GenIslandDoc,
  clearedCount: number,
  band: GradeBand,
): TallyRiddle {
  if (!(GRADE_BANDS as readonly unknown[]).includes(band)) {
    throw new RangeError(
      `tallyRiddleFor: invalid GradeBand ${JSON.stringify(band)} — expected one of ${GRADE_BANDS.join(', ')}`,
    );
  }
  // Store-clamp posture: a corrupt tally must not reach a child as a broken riddle.
  const cleared = Number.isFinite(clearedCount) ? Math.max(0, Math.floor(clearedCount)) : 0;
  const deal = (facet: string): number => fnv1a(`lumen:${doc.seed}:${cleared}:${facet}`);
  const ceiling = TALLY_CEILING[band];

  let a: number;
  let b: number;
  let op: 'add' | 'mult';
  let text: string;

  if (band === 'g4_5') {
    // "g4_5 may scale" — lamps each night × nights, the one host whose maths multiplies.
    op = 'mult';
    b = Math.min(3 + Math.floor(cleared / 2), 12);
    a = 3 + (deal('each') % 10);
    text = `I lit ${a} lamps on each of ${b} nights. How many lamps did I light in all?`;
  } else {
    // The board's own repeat-visit template: "I lit N lamps last time and N more tonight."
    // — closed with the WHOLE question (D-13 override 2; the elliptical board line never ships).
    op = 'add';
    a = band === 'k_1' ? Math.min(3 + cleared, 12) : Math.min(9 + 2 * cleared, 79);
    const room = band === 'k_1' ? Math.min(7, ceiling - a) : Math.min(19, ceiling - a - 1);
    b = (band === 'k_1' ? 1 : 2) + (deal('tonight') % room);
    text = `I lit ${a} lamps last time and ${b} more tonight. How many lamps did I light?`;
  }

  const answer = op === 'add' ? a + b : a * b;

  // Near-miss distractors, clamped to the band's own world — three seeded picks, distinct by
  // construction (the pool holds distinct values, consecutive picks off a rotation).
  const pool: number[] = [];
  for (const delta of [-3, -2, -1, 1, 2, 3]) {
    const value = answer + delta;
    if (value >= 1 && value <= ceiling) pool.push(value);
  }
  const offset = deal('spread') % pool.length;
  const distractors = [0, 1, 2].map((i) => pool[(offset + i) % pool.length] as number);

  const correctIndex = deal('slot') % 4;
  const choices: number[] = [];
  let taken = 0;
  for (let i = 0; i < 4; i += 1) {
    if (i === correctIndex) {
      choices.push(answer);
    } else {
      choices.push(distractors[taken] as number);
      taken += 1;
    }
  }

  return { text, a, b, op, answer, choices, correctIndex };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The flow — greet once ever, ask every arrival, pay once per island
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type LumenStage = 'greeting' | 'asking';

/**
 * Which face the card opens on: Lumen GREETS on the first frontier visit ever (the
 * `uncharted.metLumen` latch, A-079's action), then goes straight to ASKING on every generated
 * island's arriving→ready transition after that — she is the repeat-visit host; re-asking is
 * her design, and the riddle is new because the tally moved.
 */
export function lumenStageFor(captain: Captain): LumenStage {
  return captain.uncharted?.metLumen === true ? 'asking' : 'greeting';
}

/** Latches the host as met — A-079's `markLumenMet`, idempotent by the store's own law. */
export function greetLumen(store: CaptainStore): void {
  store.getState().markLumenMet();
}

/**
 * `genc_<index>_<seed36>` — the encounter's stable identity, the `gduel_` grammar's sibling.
 * A DIFFERENT prefix on the same coordinates, so the encounter's receipt can never collide
 * with the island's own duel receipt (`unchartedDuelId` → `gduel_…`) or any authored
 * `duel-<seed36>`.
 */
export function lumenEncounterId(doc: GenIslandDoc): string {
  return `genc_${doc.index}_${(doc.seed >>> 0).toString(36)}`;
}

/** The A-041 ledger key the coin strip commits under. */
export function lumenReceiptKey(doc: GenIslandDoc): string {
  return duelReceiptKey(lumenEncounterId(doc));
}

/** What one completion did — `applied: false` means the ledger did not move a byte. */
export interface LumenRiddleOutcome {
  readonly applied: boolean;
  /** Coins THIS call paid: `LUMEN_COINS` for the island's first correct answer, `0` otherwise. */
  readonly coinsPaid: number;
}

/**
 * Ends one asked riddle on the captain — the encounter-reward pattern with the A-041 receipt
 * standing where the authored latch stands (`seenEncounters` is `IslandId[]` and may never
 * hold a gen id — the bus law; the gen world's idempotency is its ledger, exactly as
 * settlement's is).
 *
 * A CORRECT first answer commits ONE `replaceCaptain`: the coin union (clamped like `addCoins`
 * clamps) and the receipt land together, so there is no interleaving in which the +8 pays
 * twice or pays without its receipt. The receipt's presence is then the guard: a replay — a
 * double-tap, a re-mounted card, a relaunch on the same island — finds it and pays nothing.
 * The receipt VALUE is the ledger's one shape (`ChestReceipt`, A-041): a coins grant at the
 * floor rarity, `source: 'duel'` per its `duel:`-key law — the PRESENCE is the fact, the same
 * way settlement reads it.
 *
 * A WRONG answer writes NOTHING — no coins, no receipt, no latch: nothing lost, and the same
 * island may be answered right later (or on a return visit) and still pay. The shrug is amber,
 * never red, and never a debt.
 */
export function completeLumenRiddle(
  store: CaptainStore,
  doc: GenIslandDoc,
  correct: boolean,
): LumenRiddleOutcome {
  // The trust boundary, the A-080 arm precedent: a hostile document commits nothing.
  const parsed = genIslandSchema.parse(doc);

  if (!correct) return { applied: false, coinsPaid: 0 };

  const state = store.getState();
  const captain = state.captain;
  const key = lumenReceiptKey(parsed);

  // The receipt IS the idempotency — checked before any write, so a second correct completion
  // cannot pay, cannot re-write, cannot even emit a store notification.
  if (captain.rewardReceipts[key] !== undefined) {
    return { applied: false, coinsPaid: 0 };
  }

  const receipt: ChestReceipt = {
    key,
    source: 'duel',
    seed: parsed.seed,
    rarity: 'common',
    coinFallback: LUMEN_COINS,
    grant: { kind: 'coins', amount: LUMEN_COINS },
  };

  state.replaceCaptain({
    ...captain,
    coins: Math.max(0, captain.coins + LUMEN_COINS),
    rewardReceipts: { ...captain.rewardReceipts, [key]: receipt },
  });

  return { applied: true, coinsPaid: LUMEN_COINS };
}
