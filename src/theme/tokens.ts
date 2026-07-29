/**
 * Design tokens — transcribed from the Claude Design boards.
 *
 * Source: project 88888c12-22e4-4781-b76f-a28110506499, `Cannon Academy Design Boards.dc.html`.
 * Every hex here was read out of that file, not invented. Where I had to *choose* something the
 * boards do not state (a semantic name, a scale step nobody used yet) the comment says so, because
 * the difference between "measured" and "plausible" is the whole reason this file replaced a
 * placeholder rather than growing out of one.
 *
 * Naming is semantic, not literal (ARCHITECTURE.md §3.6): `surface`, `hullRemaining` — never
 * `blue500`. The boards use raw hexes inline; that is correct for a design artefact and wrong for
 * an app, so the mapping happens here, once.
 */

export const color = {
  // ── Ground. The whole app sits on deep sea. ────────────────────────────────
  /** Page background. */
  deepSea: '#0B1E2D',
  /** Sectioned panel on the page — one step up from `deepSea`. */
  surface: '#0E2233',
  /** Card sitting on `surface`. The boards' most common card fill. */
  surfaceRaised: '#12293B',
  /** Hairline between rows inside a card. */
  border: '#1C3648',
  /** Heavier inset ring the boards use on whole sections. */
  borderStrong: '#2A4256',

  // ── Ink on dark. ───────────────────────────────────────────────────────────
  /** Primary text on dark. */
  ink: '#E5EFF7',
  /** Secondary/body text on dark. */
  inkMuted: '#A9C0D2',
  /** Tertiary — captions, board annotations. */
  inkSoft: '#8AA0B4',
  /**
   * Section eyebrows. Measured 3.49:1 on `surface`, 3.21:1 on `surfaceRaised` — AA-large only,
   * and the boards only ever use it at 10pt/800 uppercase. Never use it for anything a child has
   * to read to play.
   */
  inkFaint: '#5C7793',
  /** Bright text that needs to out-rank `ink` (numbers, inline code). */
  inkBright: '#C9D6E4',

  // ── Ink on light. Used inside parchment/ice cards. ─────────────────────────
  inkDark: '#14283C',
  inkDarkMuted: '#4C637A',

  // ── Light surfaces. ────────────────────────────────────────────────────────
  /** Warm card — the paper the game is "printed" on. */
  parchment: '#FFF6E4',
  /** Edge/shadow for parchment. */
  parchmentEdge: '#D8CBB2',
  /** Cool card — the boards use this behind anything nautical-illustrative. */
  iceCard: '#DFF1FB',
  white: '#FFFFFF',

  // ── Brand accents. ─────────────────────────────────────────────────────────
  /** Primary accent. Gold is the game's "yes". */
  gold: '#FFD23F',
  /** Softer gold, used on smaller marks where #FFD23F vibrates. */
  goldLight: '#FFD24D',
  /** Secondary accent — trim, banded sails, pennants. */
  amber: '#F5A623',
  /**
   * Gold on light backgrounds. Measured: 3.56:1 on `parchment`, 3.30:1 on `iceCard` — that is
   * AA-large ONLY (≥18.66pt, or ≥14pt bold). Do not use it for body text on a light card.
   */
  goldDeep: '#B87309',
  /**
   * Gold for body text on light. 6.70:1 on `parchment`, 6.21:1 on `iceCard`.
   *
   * Measured, because the obvious choice is wrong: `gold` on `parchment` is **1.34:1** — two warm
   * near-whites. It is the one combination in the palette that is genuinely unreadable, and it is
   * also the one a person reaches for by instinct, since both colours are "the brand".
   */
  goldDeepest: '#7A4E00',

  // ── Semantic state. ────────────────────────────────────────────────────────
  success: '#2FB65E',
  /** Chip background for a cost/penalty. Paired with `dangerInk`. */
  dangerBg: '#4A1F1A',
  dangerInk: '#F09A92',
  /** Caution panel — the boards' "read this before you build it" callout. */
  cautionBg: '#3A2A0E',
  cautionInk: '#FFE9C7',
  /** Neutral chip — the boards' default label pill on dark. */
  chipBg: '#1E4A66',
  chipInk: '#BFD8E8',

  // ── Sea and sky. ───────────────────────────────────────────────────────────
  sea: '#1584B8',
  seaFoam: '#43B4E0',
  foam: '#D6F0FB',
  skyTop: '#A9E6FF',
  skyBottom: '#E3F7FF',

  // ── Ship materials. ────────────────────────────────────────────────────────
  wood: '#8B5A2B',
  woodLight: '#C9813C',
  woodDeep: '#A0631F',
  deck: '#E0AE6B',
  /** Gunports, boots, anything that should read as a hole. */
  gunport: '#3E2A12',
  /**
   * Player mainsail / topsail stripe — board 7a correction (`#D93A2E` on parchment `#FFF6E4`).
   * The jib stays plain parchment so the silhouette still reads at 26pt.
   */
  sailStripe: '#D93A2E',

  // ── Characters. ────────────────────────────────────────────────────────────
  /** The captain's coat — also the default of the four coat swatches. */
  captainCoat: '#1E5A8A',
  captainSkin: '#E8B98A',
  krakenPink: '#F26FB2',
  krakenDeep: '#B33E86',
  ghostGlow: '#8FE0AC',
  purple: '#4A2FA0',
  flame: '#FF7A18',
  iron: '#3E4A57',
  ironDeep: '#22303C',

  // ── Duel HUD. Semantic names on top of the palette above, so a re-skin ─────
  // touches one line each rather than every gauge.
  hullRemaining: '#2FB65E',
  hullLost: '#1C3648',
  hullCritical: '#F09A92',
  timerTrack: '#1C3648',
  timerFill: '#FFD23F',
} as const;

/** 4pt base. Every gap in the UI is a multiple of this. */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 32, 8: 44 } as const;

/**
 * Radii, named by what they wrap. The boards use eleven distinct values; these are the ten that
 * appear more than once, collapsed onto the shapes they actually belong to.
 */
export const radius = {
  /** Fully round — chips, pills, gauges, the timer track. */
  pill: 999,
  /** Outermost section. */
  board: 26,
  /** Panel inside a board. */
  panel: 20,
  /** The duel's parchment sheet. Measured at 22 on the board; was 20. */
  sheet: 22,
  /** Standard card. */
  card: 18,
  /** Card sitting inside a card. */
  cardInner: 14,
  /** The cannon tray's glyph tile. Measured off the board at 16 — this was 14 until the design
   *  fixture caught it, and a 2pt radius drift is exactly the kind of thing a visual review misses
   *  per-screen while making the whole app feel subtly unlike the design. */
  tileLarge: 16,
  /** Swatches and small square tiles. */
  tile: 11,
  /** Inner note blocks. */
  note: 10,
  /** Smallest — crates, barrels, nubs. */
  nub: 7,
} as const;

/**
 * Type. Two families, both loaded via `@expo-google-fonts`:
 *   Baloo 2 — display/headline, weights 500–800.
 *   Nunito  — body/label, weights 600–800.
 *
 * React Native does not synthesise weights for custom fonts: `fontWeight` on a named family is
 * ignored on Android and unreliable on iOS. So each step names the *exact* loaded face, and the
 * face name is the contract with `useFonts()` in `app/_layout.tsx`.
 */
export const font = {
  displayBold: 'Baloo2_800ExtraBold',
  displaySemi: 'Baloo2_600SemiBold',
  displayMedium: 'Baloo2_500Medium',
  bodyBold: 'Nunito_800ExtraBold',
  bodySemi: 'Nunito_700Bold',
  bodyMedium: 'Nunito_600SemiBold',
} as const;

export const type = {
  /** Screen title. */
  display: { fontFamily: font.displayBold, fontSize: 30, lineHeight: 36 },
  /**
   * The cannon tray's operator glyph, and the largest single character in the game. Measured at
   * 32 on the board. It existed only as a hardcoded `fontSize: 32` at the call site until the
   * design fixture noticed there was no token within 1pt of it.
   */
  glyph: { fontFamily: font.displayBold, fontSize: 32, lineHeight: 40 },
  /** Card headline. */
  title: { fontFamily: font.displayBold, fontSize: 19, lineHeight: 24 },
  /** Sub-headline inside a card. */
  subtitle: { fontFamily: font.displayBold, fontSize: 16, lineHeight: 21 },
  /** Default reading size. */
  body: { fontFamily: font.bodySemi, fontSize: 13, lineHeight: 21 },
  /** Small print — board annotations, helper text. */
  caption: { fontFamily: font.bodySemi, fontSize: 12, lineHeight: 19 },
  /** Chips and pills. */
  chip: { fontFamily: font.bodyBold, fontSize: 10, lineHeight: 13, letterSpacing: 0.5 },
  /** Section eyebrow. Always uppercase at the call site. */
  eyebrow: { fontFamily: font.bodyBold, fontSize: 10, lineHeight: 13, letterSpacing: 0.8 },
  /**
   * Numerals that must not reflow as they change — damage, coins, the timer.
   * Platform mono, not a webfont: one less file, and tabular figures are the point.
   */
  numeric: { fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] as const },
} as const;

/**
 * Motion. Durations are the boards' own keyframe timings, not guesses.
 *
 * Ambient loops run forever and must stay cheap; beats fire once per event. The Perfect Shot beat
 * is 450ms across three tweens per board 3b — and per T-031 it celebrates the damage curve the fast
 * answer already earned. It does not add a ball, and nothing here may read as if it does.
 */
export const motion = {
  /** Ambient, looping. */
  loop: {
    /** Pennant flutter. */
    pennant: 1800,
    /** Sail luff — staggered 200ms per sail on the same ship. */
    luff: 3400,
    luffStagger: 200,
    /** Bow wake. */
    wake: 2600,
    /** Chain-shot tumble. */
    spin: 1200,
    /** Barrel/flame wobble. */
    wobble: 950,
    /** Slow attention pulse (enemy glow). */
    pulseSlow: 2200,
    /** Fast pulse (live bolt). */
    pulseFast: 500,
  },
  /** One-shot beats. */
  beat: {
    /** Tap acknowledgement. */
    tap: 120,
    /** Chip/label swap. */
    swap: 200,
    /** Screen transition. */
    screen: 280,
    /** Perfect Shot celebration — board 3b, in place, three tweens. */
    perfectShot: 450,
    /** Shot arc, launch to impact. */
    shot: 700,
  },
} as const;

/**
 * Minimum interactive target. PLAN.md's audience constraint: small hands, imprecise taps.
 * Nothing tappable may be smaller than this in any direction.
 *
 * The boards' cannon-select rows (option 2a) are 74pt, comfortably over. 64 is the floor, not
 * the target — do not design down to it.
 */
export const MIN_TAP_TARGET = 64;

/**
 * The reference frame everything is laid out against. The design boards were drawn at 375×667
 * (iPhone SE, the tightest phone we support) so that anything fitting here fits everywhere.
 */
export const REFERENCE_VIEWPORT = { width: 375, height: 667 } as const;
