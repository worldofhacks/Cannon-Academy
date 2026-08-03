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
  /**
   * The artifact's `success-deep`. Certified both ways: white ON it is 5.04, and it AS text is 5.04
   * on white and 4.69 on parchment — so it is the green that may carry a word, where `success`
   * itself may not (white on it is 2.63, a board-banned pair). See A-054.
   */
  successDeep: '#1E7F41',
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
  /**
   * The artifact's `sea` token.
   *
   * **Never put text on this.** White on it measures 4.18 and ink on it 3.59 — both below AA, and
   * the app's chip text is 10–11px, so "large only" does not rescue either. Use it as water and as
   * secondary chrome; when something on it has to be read, use `seaDeep` (A-054).
   */
  sea: '#1584B8',
  /**
   * The artifact's `sea-deep` — the status bar and HUD backdrop, and the readable blue.
   *
   * White on it is 7.09, certified in the board's own contrast table. This was inlined as `#0C5E86`
   * in five places before it had a name, which is how the temperament badge ended up using the
   * lighter `sea` behind a white glyph at 4.18.
   */
  seaDeep: '#0C5E86',
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

  // ── Light-surface planks. ──────────────────────────────────────────────────
  /**
   * Sunk parchment — the boards' quiet/empty card ground. Inlined as `#F0E2C8` in
   * `app/rank.tsx` and `app/harbor.tsx` since A-012 (both carry a TODO pointing here); named now
   * because the rival-fleet board uses it twice more (unmet card fill, PIRATE/BONE badge fill —
   * `Cannon Academy Rival Fleet.dc.html` 3a/3b, A-067).
   */
  surfaceSunk: '#F0E2C8',
  /**
   * The plank shadow under a parchment pill or disc (`box-shadow: 0 Npx 0 #C9AE7E` on the
   * boards). Fleet board 3a: the coin pill's plank and the unmet card's cream “?” disc shadow,
   * and the BONE legend chip's rim (A-067).
   */
  parchmentPlank: '#C9AE7E',

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

  // ── The rival fleet (A-067). ───────────────────────────────────────────────
  // Board: `Cannon Academy Rival Fleet.dc.html` (project 88888c12…), sections 3a/3b — the
  // `HULLS` `[hull, hullDeep]` and `SAIL_FILL` tables plus the KINDS legend chips, transcribed
  // hex-for-hex. Five kind families paint every generated rival; the shared timber mast and the
  // card grounds ride along. None of these is, or may ever alias, `sailStripe` — the red
  // vertical stripe stays the player's alone (D-12).
  /** HULLS.pirate[0]. */
  fleetPirateHull: '#4A3B5C',
  /** HULLS.pirate[1]. */
  fleetPirateHullDeep: '#33284A',
  /** SAIL_FILL.pirate. */
  fleetPirateSail: '#6C4BD6',
  /** HULLS.skeleton[0]. */
  fleetBoneHull: '#C9BCA0',
  /** HULLS.skeleton[1] — also the skeleton ship's mast, per the board's `build()`. */
  fleetBoneHullDeep: '#A2957C',
  /** SAIL_FILL.skeleton. */
  fleetBoneSail: '#EDE4CE',
  /** HULLS.ghost[0]. */
  fleetGhostHull: '#5A7A72',
  /** HULLS.ghost[1]. */
  fleetGhostHullDeep: '#3E5A54',
  /** SAIL_FILL.ghost. */
  fleetGhostSail: '#BFE8D4',
  /** HULLS.shark[0]. */
  fleetSharkHull: '#3F6B86',
  /** HULLS.shark[1]. */
  fleetSharkHullDeep: '#2A4C61',
  /** SAIL_FILL.shark. */
  fleetSharkSail: '#9FD4EC',
  /** HULLS.kraken[0]. */
  fleetKrakenHull: '#7A3F8F',
  /** HULLS.kraken[1]. */
  fleetKrakenHullDeep: '#5E2A6E',
  /** SAIL_FILL.kraken. */
  fleetKrakenSail: '#F5A9D2',
  /** The non-skeleton mast timber — board `build()`: `kind === 'skeleton' ? … : '#5C4A3A'`. */
  fleetMast: '#5C4A3A',
  /** KINDS.shark legend chip — the one legend hex with no earlier token name. */
  fleetSharkChip: '#7FCDEC',
  /** 3a met-card sea plate (also the crew reference's sky, board 3c). */
  fleetCardSea: '#B9E2F5',
  /** 3a unmet-card sea plate — greyed water for a rival not yet met. */
  fleetCardSeaUnmet: '#DDE5EC',
  /** KINDS.ghost badge fill. */
  fleetGhostBadge: '#DFF3E6',
  /** KINDS.shark badge fill. */
  fleetSharkBadge: '#DCEEF8',
  /** KINDS.kraken badge fill. */
  fleetKrakenBadge: '#FBDDEC',

  // ── Locked terrain. ────────────────────────────────────────────────────────
  /**
   * The desaturated palette a still-fogged island wears on `Cannon Academy Arrival.dc.html`
   * (beat A's destination, and fog-lift step 1's "from" state before colour floods in). Measured
   * off that board's `destSand/destGrass/destTrunk/destFrond` group; the deep sand partner is the
   * board's `#D8CBB2`, which already lives above as `parchmentEdge` and is not duplicated here.
   * Decorative terrain only — never behind text. Named per the boards' own terrain-group note so
   * the chart's locked-island drawing can adopt them without a re-measure.
   */
  lockedSand: '#EFE3CB',
  lockedGrass: '#9FC79C',
  lockedGrassDeep: '#7FA57D',
  lockedTrunk: '#9A8468',
  lockedFrond: '#8FB08C',

  // ── Duel HUD. Semantic names on top of the palette above, so a re-skin ─────
  // touches one line each rather than every gauge.
  hullRemaining: '#2FB65E',
  hullLost: '#1C3648',
  hullCritical: '#F09A92',
  timerTrack: '#1C3648',
  timerFill: '#FFD23F',

  // ── The island encounter (A-066). ──────────────────────────────────────────
  // Source: `Cannon Academy Island Encounter.dc.html`, same project as above. Only hexes the
  // boards had never used before enter here; the encounter's octopus is `krakenPink`/`krakenDeep`,
  // its parrot is `success`/`successDeep` with a `sailStripe` bandana, and its gull is
  // `parchment`/`white`/`inkBright` — all referenced by their existing names, not re-added.
  /** Nipper the crab — body and claws (board host recipe). */
  crabShell: '#E8613C',
  /** The crab body's `inset 0 -6px 0` underside shade. */
  crabShellDeep: '#B8462A',
  /** Tumble the turtle — the shell. */
  turtleShell: '#2E7D6B',
  /** The shell's inset shade. */
  turtleShellDeep: '#1E5A4C',
  /** The encounter vignette's little sky, behind every host. */
  hostSky: '#B9E2F5',
  /** Beach sand — the vignette's ground and the scrimmed island's ring. */
  sand: '#F2E1B8',
  /** Island grass mounds (also the turtle's head and flippers, per the board). */
  islandGrass: '#7ED07A',
  /** The mounds' `inset 0 -6px 0` shade. */
  islandGrassDeep: '#5FA149',
  /** Palm fronds — deeper than `islandGrass` so a palm separates from its mound. */
  palmFrond: '#2F9E5C',
  /** The distant rock silhouette in the encounter scene. */
  driftRock: '#5A7288',
  /** The encounter card's 8pt drop — parchment's deeper edge (`box-shadow 0 8px 0`). */
  parchmentShadow: '#C9AE7E',
  /** Sunken parchment — inset panels on parchment. Inlined app-wide before it had a name. */
  parchmentSunk: '#F0E2C8',
  /**
   * The gentle-miss amber — the board's `~` tile fill, one step warmer than `amber`. The
   * encounter's "no wrong outcome" rule hangs on this: a missed riddle turns THIS colour,
   * never a red.
   */
  amberSoft: '#F0A315',
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

/**
 * ## Why every Baloo step is `ceil(fontSize × 1.602)` (2026-07-31)
 *
 * A captain reported the cannon name in `CannonTray` shearing off at the top. The four display
 * steps were 1.20–1.31 — ratios that are unremarkable for a normal Latin face and wrong for this
 * one. `includeFontPadding` is Android-only; on iOS the fix is the line box.
 *
 * **Measured, from the shipped `Baloo2_800ExtraBold.ttf` and from React Native's own source —
 * not chosen for being round.** `unitsPerEm 1000`, `hhea.ascender 1078`, `hhea.descender −524`,
 * `lineGap 0`. So `UIFont.lineHeight` for this face is exactly **1.6020 em**. That ascent is
 * enormous for Latin because Baloo 2 is a multi-script family — the headroom is reserved for
 * Devanagari matras, and every Latin-only consumer inherits the bill.
 *
 * Two thresholds fall out, and the tokens now clear the second rather than gambling on the first:
 *
 *  1. **1.235 em — where ink starts being lost.** Below `UIFont.lineHeight`, RN skips its
 *     centering pass entirely (`RCTTextShadowView.mm:161`, `if (maximumLineHeight <
 *     maximumFontLineHeight) return;`) and TextKit anchors the baseline at `lineHeight − descent`.
 *     The tallest ink this app renders is 0.711 em (the dot of `i`; caps reach 0.602), so ink
 *     survives only while `lineHeight ≥ 0.711 + 0.524 = 1.235 em`. Laid out through TextKit
 *     against the real face, the old tokens measured:
 *
 *       | step       | was    | ratio | ink clearance at the top |
 *       |------------|--------|-------|--------------------------|
 *       | `display`  | 30/36  | 1.200 | **−1.33pt — clipped**    |
 *       | `glyph`    | 32/40  | 1.250 | +5.91pt (operators only) |
 *       | `title`    | 19/24  | 1.263 | +0.49pt                  |
 *       | `subtitle` | 16/21  | 1.313 | +1.62pt                  |
 *
 *     `display` was already cutting ink. `title` and `subtitle` were inside the threshold by less
 *     than two points — a margin that depends on which glyphs are in the word and on how the
 *     rasteriser rounds the baseline, and that any call site lowering `fontSize` under an
 *     inherited absolute `lineHeight` destroys outright (`gun-deck.tsx` was rendering 20pt text
 *     in this file's 21pt box: 1.05).
 *
 *  2. **1.602 em — where clipping stops being possible.** At or above `UIFont.lineHeight` RN
 *     applies `baseLineOffset = (lineHeight − fontLineHeight) / 2` and centers the face's own box
 *     inside the line. There is no ink outside that box, on either platform, for any string.
 *
 * The tokens take (2). A design token that is correct by half a point is the bug, not the fix.
 *
 * **The rule this creates:** a call site that overrides `fontSize` on a display step MUST override
 * `lineHeight` with it — `ceil(size × 1.602)` — because these are absolute points, not multiples.
 * That was already true and already violated; the sites are fixed alongside this change.
 *
 * Nunito's box is 1.3640 em (`hhea` 1011 / −353). `body` (1.615) and `caption` (1.583) clear it;
 * `chip` and `eyebrow` sit at 1.300, 0.64pt short at 10pt. Left alone deliberately: they are body
 * family, no clipping was reported on them, and raising them moves chip geometry on every screen.
 * `src/components/chart/*` and `src/theme/questionTypography.ts` set their own line heights from
 * `font.displayBold` without reading this scale and are still on 1.15–1.30 ratios; both are
 * out of scope here and neither is reachable from this file.
 */
export const type = {
  /** Screen title. */
  display: { fontFamily: font.displayBold, fontSize: 30, lineHeight: 49 },
  /**
   * The cannon tray's operator glyph, and the largest single character in the game. Measured at
   * 32 on the board. It existed only as a hardcoded `fontSize: 32` at the call site until the
   * design fixture noticed there was no token within 1pt of it.
   */
  glyph: { fontFamily: font.displayBold, fontSize: 32, lineHeight: 52 },
  /** Card headline. */
  title: { fontFamily: font.displayBold, fontSize: 19, lineHeight: 31 },
  /** Sub-headline inside a card. */
  subtitle: { fontFamily: font.displayBold, fontSize: 16, lineHeight: 26 },
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
