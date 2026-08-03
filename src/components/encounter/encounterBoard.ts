/**
 * The island encounter, transcribed from its design board.
 *
 * Source: project `88888c12-22e4-4781-b76f-a28110506499`,
 * `Cannon Academy Island Encounter.dc.html` — five 375×667 states (Entry / Riddle / Right answer /
 * Gentle miss / Exit) plus the five-host roster. Every number below was READ OFF that file — an
 * inline style, a keyframe, or the `<script data-dc-script>` block at its foot. Where something is
 * a choice rather than a measurement, the comment says so, in the same voice as
 * `src/theme/rangeBoard.ts` and `src/components/chart/board.ts`.
 *
 * ── The two amber-card rules, which are law ────────────────────────────────────────────────────
 *
 * 1. **No wrong outcome.** *"The tile turns amber rather than red, the creature shrugs rather
 *    than droops, and the right number appears beside it with no 'try again' — the riddle is a
 *    hello, not a test."* Nothing in this module, or in the component it feeds, may name a red.
 *    The miss treatment is `TILE_MISS` (amberSoft) and the reveal is `TILE_CORRECT` (success with
 *    INK on it — white-on-success is a banned pair, measured 2.63).
 *
 * 2. **Entry and exit grow from the island's own position.** *"transform-origin 76% 34%, which is
 *    where the island sits behind the scrim — so the modal grows out of the place it is about."*
 *    The board's keyframes carry the equivalent translate (`translate(96px,150px) scale(.14)`),
 *    which is how React Native — which has no transform-origin — reproduces the same growth path:
 *    `GROW.from` is that keyframe's start state verbatim, and `ORIGIN` records the stated origin
 *    so a re-measure can rederive the translate if the card's berth ever moves.
 *
 * No React import: this file is data, asserted directly by `__tests__/app/encounter.test.ts`
 * (repo posture — the component renders headless-untestable RN, so the constants are the
 * testable surface).
 */
import type { IslandId } from '@content/schemas';

import { color } from '../../theme/tokens';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The five states
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** The board's own inventory, in its own order (tags A–E). */
export const ENCOUNTER_STATES = ['entry', 'riddle', 'right', 'gentleMiss', 'exit'] as const;
export type EncounterState = (typeof ENCOUNTER_STATES)[number];

/**
 * The board's stated transform-origin — where the island sits behind the scrim, as fractions of
 * the card. Recorded for re-derivation; the LIVE values the animation runs on are `GROW.from`.
 */
export const ORIGIN = { x: 0.76, y: 0.34 } as const;

/** `ie-grow`: `translate(96px,150px) scale(.14) opacity(0)` → identity, 340ms. */
export const GROW = {
  ms: 340,
  /** `cubic-bezier(.2,1.25,.4,1)` — overshoots, which is what makes the card land with a bounce. */
  bezier: [0.2, 1.25, 0.4, 1],
  from: { dx: 96, dy: 150, scale: 0.14 },
} as const;

/** `ie-tuck`: the exact reverse, 320ms, easing in — the card leaves faster than it arrived. */
export const TUCK = { ms: 320, bezier: [0.4, 0, 0.7, 1] } as const;

/** `ie-hop`: the host's win — up 14pt with a −8°/+6° wiggle, 620ms, once. */
export const HOP = { ms: 620, riseY: 14, tiltFromDeg: -8, tiltToDeg: 6 } as const;

/** `ie-shrug`: the host's miss — a −5°/+4° tilt with a 3pt lift, 520ms, once. Never a droop. */
export const SHRUG = { ms: 520, tiltFromDeg: -5, tiltToDeg: 4, riseY: 3 } as const;

/** `ie-bob`: every host's idle, −4pt at the midpoint. Period is per host — see `HOSTS`. */
export const BOB = { riseY: 4 } as const;

/** `ie-claw`: the crab's claws, −8° → 10°, 1.6s forever, the right claw 300ms behind. */
export const CLAW = { ms: 1600, fromDeg: -8, toDeg: 10, staggerMs: 300 } as const;

/**
 * `ie-coin`: three coins arc out of the sand, 900ms ease-out, 80ms apart. Offsets are each coin's
 * keyframe end (`--cx`/`--cy`), y negative meaning up in both CSS and RN. The middle coin is the
 * lighter `gold`; its flanks are `amber` — recorded so the burst reads as three objects.
 */
export const COIN_ARC = {
  ms: 900,
  staggerMs: 80,
  coinSize: 20,
  arcs: [
    { dx: -62, dy: -40, fill: color.amber },
    { dx: -8, dy: -58, fill: color.gold },
    { dx: 52, dy: -42, fill: color.amber },
  ],
} as const;

/** `ie-ring`: the burst ring under the coins — 76pt, scale .86 → 1.5 with opacity .85 → 0, 620ms. */
export const RING_BURST = { ms: 620, size: 76, fromScale: 0.86, toScale: 1.5, fromOpacity: 0.85 } as const;

/** `ie-pop` on the reward strip: scale .72 → 1.04 at 60% → 1, 220ms. */
export const REWARD_POP = { ms: 220, fromScale: 0.72, overshootScale: 1.04 } as const;

/** The two gold stars beside a cheering host — offsets from the host box, sizes off the board. */
export const STAR_CHEERS = [
  { size: 12, dx: -16, bottom: 44 },
  { size: 9, dxRight: -14, bottom: 52 },
] as const;

/** The boards' five-point star, in `Poly` point form (same polygon as the streak chip's). */
export const STAR_POINTS = '50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Geometry
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** `rgba(20,40,60,.62)` — and rgb(20,40,60) IS `inkDark` (#14283C), so only the alpha is new. */
export const SCRIM = { opacity: 0.62 } as const;

/**
 * The parchment card: `left/right:16`, `border-radius:22`, `padding:14`,
 * `box-shadow: 0 8px 0 parchmentShadow`. The reward states sit 20pt higher because they carry a
 * fourth panel — the board authors `top:110px` on A/B/E and `90px` on C/D.
 */
export const CARD = {
  marginX: 16,
  radius: 22,
  padding: 14,
  shadowDy: 8,
  top: { entry: 110, riddle: 110, right: 90, gentleMiss: 90, exit: 110 } as Record<EncounterState, number>,
} as const;

/**
 * The vignette scene at the card's top: 132pt of sky, sand, water band, two grass mounds, two
 * palms, a distant rock, and the host. Offsets are the board's own `left`/`bottom` pairs.
 */
export const SCENE = {
  height: 132,
  radius: 18,
  sandHeight: 56,
  water: { bottom: 44, height: 14, opacity: 0.75 },
  host: { x: 150, bottom: 36 },
  coinBurst: { x: 180, bottom: 70 },
} as const;

/**
 * The speech bubble: white card, `border-radius:18`, `box-shadow 0 4px 0`, a tail at `left:44`,
 * and the 44pt speaker slot beside the text for the grown-up reading it aloud. Greeting lines
 * (`Hello, Captain!` / `Come back soon!`) run 22px; the riddle itself runs 19px.
 */
export const BUBBLE = {
  radius: 18,
  padX: 14,
  padY: 12,
  shadowDy: 4,
  greetingSize: 22,
  riddleSize: 19,
  tail: { x: 44, w: 18, h: 10 },
  speakerSlot: { size: 44, radius: 14 },
} as const;

/** Four answers in a 2×2 grid: 72pt tiles, 34px numerals, 26px marks, 12pt gaps. */
export const TILE = {
  height: 72,
  radius: 18,
  numeralSize: 34,
  markSize: 26,
  gap: 12,
  columns: 2,
  shadowDy: 4,
} as const;

/**
 * `Say hello` / `Onward!` / `Bye!` — the one big amber button, and the single gold ring that
 * marks the next tap. 64pt tall, which is exactly the `MIN_TAP_TARGET` floor.
 */
export const ACTION_BUTTON = {
  height: 64,
  radius: 18,
  shadowDy: 5,
  labelSize: 20,
  chevron: { size: 20, glyphSize: 13 },
  ring: { inset: 5, width: 4, radius: 22 },
} as const;

/** The reward strip: 48pt plate, 20px title, 13px sub, 44pt speaker slot on the right. */
export const REWARD_STRIP = {
  radius: 18,
  padding: 14,
  gap: 12,
  plate: 48,
  plateRadius: 14,
  titleSize: 20,
  subSize: 13,
  coinSize: 28,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Tile treatments — the board's own `tiles()` helper, as data plus one pure function
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface TileLook {
  readonly bg: string;
  readonly shadow: string;
  readonly ink: string;
  /** `✓` on the true answer, `~` on an amber miss, absent on an idle tile. */
  readonly mark?: '✓' | '~';
}

/** White card, parchment edge, dark ink — the duel's own answer tile, already learned. */
export const TILE_IDLE: TileLook = { bg: color.white, shadow: color.parchmentEdge, ink: color.inkDark };

/**
 * The true answer, tapped or revealed. INK on success, per the board — white on `#2FB65E` is
 * 2.63 and banned by name; ink on it is 5.70.
 */
export const TILE_CORRECT: TileLook = {
  bg: color.success,
  shadow: color.successDeep,
  ink: color.inkDark,
  mark: '✓',
};

/** The gentle miss: amber, `~`, and nothing else. Red is reserved for duels and critical hulls. */
export const TILE_MISS: TileLook = {
  bg: color.amberSoft,
  shadow: color.goldDeep,
  ink: color.inkDark,
  mark: '~',
};

/**
 * The board's `tiles()` helper, verbatim in semantics: before a pick everything idles (and in the
 * shipped build NO tile is pre-ringed — the board says so in its own note); after a pick the true
 * index goes green whether or not it was chosen, and a wrongly chosen index goes amber. Pure, so
 * the test can drive the whole treatment table without a renderer.
 */
export function tileLooks(
  count: number,
  picked: number | null,
  correctIndex: number,
): readonly TileLook[] {
  return Array.from({ length: count }, (_, i) => {
    if (picked === null) return TILE_IDLE;
    if (i === correctIndex) return TILE_CORRECT;
    if (i === picked) return TILE_MISS;
    return TILE_IDLE;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The reward strips
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Gold strip, parchment plates, `goldDeepest` sub — the certified gold-on-light body ink. */
export const REWARD_RIGHT = {
  bg: color.gold,
  plate: color.parchment,
  subInk: color.goldDeepest,
} as const;

/** Sunken parchment, muted ink — `No harm done` is calm, not a consolation prize. */
export const REWARD_MISS = {
  bg: color.parchmentSunk,
  plate: color.parchment,
  subInk: color.inkDarkMuted,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Copy
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** The board's fixed lines, verbatim. */
export const COPY = {
  greeting: 'Hello, Captain!',
  sayHello: 'Say hello',
  onward: 'Onward!',
  bye: 'Bye!',
  farewell: 'Come back soon!',
  noHarm: 'No harm done',
} as const;

/** `+8 coins`, with the amount owned by `services/encounter.ts` rather than restated here. */
export function rewardTitleFor(coins: number): string {
  return `+${coins} coins`;
}

/**
 * The host's win and miss lines carry the ANSWER as a numeral, not a number-word — the board's
 * `Five shells!` is authored for one specific riddle, and a pre-reader reads `5` more reliably
 * than `five` (the tiles they just tapped are numerals for the same reason).
 */
export function rightBubbleFor(answer: number): string {
  return `${answer}! Thank you, Captain.`;
}

export function missBubbleFor(answer: number): string {
  return `Close! It was ${answer}.`;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The hosts — one per island (board roster, right column)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type HostSpecies = 'crab' | 'parrot' | 'turtle' | 'octopus' | 'gull';

export interface HostSpec {
  readonly name: string;
  readonly species: HostSpecies;
  /** The board's own `N shapes ·` budget line — the roster's monospace annotation, verbatim. */
  readonly shapeBudget: number;
  /** The roster's `ie-bob` period for this host. */
  readonly bobMs: number;
  /** The reward strip's sub-line, in the host's voice (the board authors Nipper's). */
  readonly rewardSub: string;
  /** The miss strip's sub-line — always "nothing lost", always still glad. */
  readonly missSub: string;
}

/**
 * Keyed by island id, because *"each is a different animal so a child can tell which island they
 * are on without reading its name"* — the keying IS the feature.
 */
export const HOSTS: Record<IslandId, HostSpec> = {
  port_sumwich: {
    name: 'Nipper the crab',
    species: 'crab',
    shapeBudget: 5,
    bobMs: 2800,
    rewardSub: 'Nipper found them in the sand.',
    missSub: 'Nothing lost. Nipper is still glad you came.',
  },
  isla_products: {
    name: 'Pip the parrot',
    species: 'parrot',
    shapeBudget: 6,
    bobMs: 3200,
    rewardSub: 'Pip kept them under one wing.',
    missSub: 'Nothing lost. Pip is still glad you came.',
  },
  quotient_cove: {
    name: 'Tumble the turtle',
    species: 'turtle',
    shapeBudget: 6,
    bobMs: 3600,
    rewardSub: 'Tumble dug them out of the cove.',
    missSub: 'Nothing lost. Tumble is still glad you came.',
  },
  fraction_reef: {
    name: 'Ollie the octopus',
    species: 'octopus',
    shapeBudget: 6,
    bobMs: 3000,
    rewardSub: 'Ollie held them in three arms.',
    missSub: 'Nothing lost. Ollie is still glad you came.',
  },
  grandline: {
    name: 'Gale the gull',
    species: 'gull',
    shapeBudget: 5,
    bobMs: 3400,
    rewardSub: 'Gale spotted them from the sky.',
    missSub: 'Nothing lost. Gale is still glad you came.',
  },
};
