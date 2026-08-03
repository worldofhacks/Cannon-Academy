/**
 * The gunnery range, transcribed from its design board.
 *
 * Source: project `88888c12-22e4-4781-b76f-a28110506499`, `Cannon Academy Practice.dc.html`
 * (turn 11), screen `[data-screen-label="Practice"]`. Every number below was READ OFF that file —
 * from an element's inline style, or from the `<script data-dc-script>` block at the foot of it
 * that supplies every coordinate, hex and copy string. Nothing here was chosen; where something IS
 * a choice it says so, in the same voice as `src/components/chart/board.ts`.
 *
 * ── The shape of this board ────────────────────────────────────────────────────────────────────
 * It is ONE 375×667 frame carrying NINE STATES selected by an index, not nine screens. The board's
 * own `STATES` array is the inventory:
 *
 *   pick · incoming · question · hit · streak · gull · bell · miss · end
 *
 * Two of those are top-level branches (`isPick` / `isRound`) and the remaining seven are all the
 * ROUND, differing only in which target is floating and what the sheet is saying. That distinction
 * is the whole reason this file exists as data: `PHASES` below are the four the screen really has,
 * and `TargetKind` is an orthogonal axis over the question phase — exactly as board 11b says
 * ("The question band never changes. What changes is what is floating out there").
 *
 * ── Coordinate systems ─────────────────────────────────────────────────────────────────────────
 * Three spaces, and they are NOT interchangeable:
 *
 *   FRAME  — from the top of the 375×667 frame. The first 20pt are the status bar, which becomes
 *            `insets.top` on a device.
 *   STAGE  — from the BOTTOM-LEFT of the sea stage, because the board authors every scene element
 *            with `bottom:` and either `left:` or `right:`. A stage is 212pt tall in five states
 *            and 196pt in the two that need a taller sheet (`miss`, `end`). Vertical offsets are
 *            therefore stored as a FRACTION of 212 (see `STAGE.designHeight`) so a shorter stage
 *            moves the whole composition together instead of pushing the gull out of the sky.
 *   PART   — from the top-left of an art group's own box (the boat, the raft, one target).
 *
 * ── The three traps this board sets ────────────────────────────────────────────────────────────
 * 1. **Inline opacity is a lie wherever a keyframe animates opacity.** The swells are authored at
 *    `opacity:.6` and then run `pr-swell`, which animates opacity `.5 → .85 → .5`; in CSS the
 *    animation wins for its whole run, so `.6` never renders. The ANIMATED range is recorded here
 *    and the inline value is not. The sea chart set the identical trap — see `board.ts` trap 2.
 * 2. **`+35 COINS` is not implementable and must not be faked.** The board's round-end panel prints
 *    a coin payout. The range grants nothing but mastery (A-009 AC-5, and `harbor.test.ts` pins
 *    that `services/range.ts` never mentions a coin), so the third stat is the METER — see
 *    `ROUND_END.stats`, where the substitution is recorded rather than silently made.
 * 3. **The golden bell's `+3` decouples the rack from the drill.** Board 11b says the bell "pays
 *    three rack slots at once", but board 11c's METER note is that "the bar IS the bottles" — one
 *    question, one bottle. Paying three would mean a ten-bottle rack emptying in eight questions,
 *    and `commitDrill` only pays a COMPLETE drill. The bell is kept as a rare, loud, celebrated
 *    target worth one slot; see `TARGET_TABLE` and `rangeTargets.ts`.
 */
/**
 * A CSS `border-radius: a% b% c% d%` corner set, in TL, TR, BR, BL order.
 *
 * Declared here rather than imported from `src/components/chart/board.ts`, which carries an
 * identical pair. That module is owned by the chart track and is being rewritten in parallel; a
 * type import across a track boundary makes this file's build depend on the state of someone
 * else's, which it did — the range stopped typechecking mid-pass because a type alias moved. Two
 * three-word aliases are cheaper than that coupling.
 */
export type CornerPercents = readonly [number, number, number, number];

/** A CSS `clip-path: polygon(...)`, already in `Poly`'s `x,y x,y` point form. */
export type PolyPoints = string;

/** The frame the board is drawn at. Matches `REFERENCE` in `theme/responsive.ts`. */
export const FRAME = { width: 375, height: 667, statusBar: 20 } as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The nine states, collapsed onto the four phases the screen really has
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The board's own nine `STATES`, verbatim, in its own order.
 *
 * Kept as data rather than as prose so the fidelity test can assert the inventory was READ rather
 * than remembered, and so a re-measure that finds a tenth state fails a test instead of quietly
 * going unbuilt.
 */
export const BOARD_STATES = [
  'pick',
  'incoming',
  'question',
  'hit',
  'streak',
  'gull',
  'bell',
  'miss',
  'end',
] as const;
export type BoardState = (typeof BOARD_STATES)[number];

/**
 * The four phases the screen actually runs.
 *
 * `streak`, `gull` and `bell` are not phases — the board draws all three with `showQuestion` true
 * and only the floating target differs. Modelling them as phases would put the target table inside
 * the state machine, which is precisely the coupling board 11b says costs nothing to avoid.
 *
 * `incoming` IS a phase, and it is the board's headline change: *"the target arrives before the
 * question"*. It is one state in the reducer and it is what turns the sum from the event into the
 * trigger.
 */
export const PHASES = ['pick', 'incoming', 'question', 'verdict', 'end'] as const;
export type RangePhase = (typeof PHASES)[number];

/** How long the target flies before the question band replaces "Here it comes!". */
export const INCOMING_MS = 700;

/**
 * How long the ✓/✕ holds on the tapped answer before the next target is tossed.
 *
 * A screen-pacing number, not a tuning constant — nothing in the engine reads it. Carried over
 * from the previous range at 900ms, which is long enough to read the verdict and short enough that
 * ten shots is still one sitting.
 */
export const VERDICT_MS = 900;

/**
 * The miss panel holds longer than a hit, on purpose.
 *
 * A hit is self-evident — the bottle shattered. A miss has to say three things (it floated away,
 * here is the right answer, nothing was lost) and a child has to read them.
 */
export const MISS_MS = 2_200;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Palette — every hex on this board, named by what it IS on this board
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Colours the board uses that `theme/tokens.ts` does not already carry.
 *
 * `tokens.ts` is owned by another track this pass, so nothing is added there. Each entry names the
 * token it would become.
 */
export const rangeColor = {
  // TODO(tokens): `bottleGlass` — the practice bottle's body, and the cleared rack slot. The board
  // reuses `#8FE0AC`, which tokens.ts already carries as `ghostGlow`; it is the same hex doing a
  // different job, and naming it here is what keeps a future ghost re-tint from re-colouring the
  // rack.
  bottleGlass: '#8FE0AC',
  // TODO(tokens): `bottleGlassLight` — the third shatter shard, lighter so the burst reads as more
  // than one object.
  bottleShardLight: '#BFE8D4',
  // TODO(tokens): `bottleNeck` — the cleared rack slot's neck. Board's `#5FA149`, which is the sea
  // chart's `grass.deep`.
  bottleNeck: '#5FA149',
  // TODO(tokens): `rackEmptyNeck` — the un-cleared slot's neck, one step darker than
  // `parchmentEdge` so an empty slot still reads as a bottle-shaped thing.
  rackEmptyNeck: '#C9AE7E',
  // TODO(tokens): `lockPlate` / `lockBody` — the locked rack's padlock. Board's `#C9D6E4` plate is
  // the sea chart's fog grey.
  lockPlate: '#C9D6E4',
  lockBody: '#4C637A',
  // TODO(tokens): `crewLinen` — Pim's shirt and sleeve.
  crewLinen: '#E8DCC4',
  // TODO(tokens): `beak` — the gull's beak, a warmer amber than `amber` so it separates from the
  // sail it flies past.
  beak: '#F0A315',
  // TODO(tokens): `missInk` — the miss banner's subtitle on `seaDeep`. Measured 4.80 on `#0C5E86`,
  // which clears AA for small text; `inkMuted` would be 6.05 but reads cold against the warm panel.
  missInk: '#BFD8E8',
  /** The sunken parchment the board uses for inset notes. Already inlined app-wide as `#F0E2C8`. */
  parchmentSunk: '#F0E2C8',
  /**
   * TODO(tokens): `seaPlate` — the back tile, and a CORRECTION to the board rather than a
   * transcription of it.
   *
   * The board authors `background:#1584B8` under a white 22/800 `←`. That is white on `sea`, which
   * measures **4.18** and is one of the four pairs this project bans by name — the same pair A-054
   * removed from the temperament badge, where it was also a white glyph on a blue plate. `tokens.ts`
   * says it outright: *"Never put text on this."*
   *
   * `seaDeep` is the sanctioned replacement, but the tile SITS on `seaDeep` (the header band is
   * `#0C5E86`), so using it would make the control vanish into its own background. So the fill is
   * moved just far enough down the same ramp to clear AA and no further: `#137CAE` is 80% of the way
   * from `seaDeep` to `sea`, measures **4.64** against white, and still separates from the band at
   * 1.53 against the board's own 1.70. The arrow becomes legible and the header still reads as the
   * board draws it.
   */
  seaPlate: '#137CAE',
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Chrome
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The header band, identical on both branches: `padding: 8px 12px`, `background: #0C5E86`.
 *
 * The back tile's INK is 44pt, which is under the 64pt floor. It is padded to 64 with `hitSlop`
 * rather than grown — the split the chart's header pills already use, and the board's own
 * proportion is what makes the title fit beside it.
 */
export const HEADER = {
  padX: 12,
  padY: 8,
  gap: 8,
  /** `44×44; border-radius:14; background:#1584B8` with a white 22/800 `←`. */
  back: { size: 44, radius: 14, glyphSize: 22 },
  /** `Baloo 2` 24/800, white, on `seaDeep`. Measured 7.09 — the readable blue, not `sea`. */
  titleSize: 24,
} as const;

/**
 * The rack bar that replaces the title during a round: `height:44; border-radius:14;
 * background:#FFF6E4; box-shadow:0 3px 0 #C9AE7E; padding:0 8; gap:6`.
 *
 * Board 11c's METER note is the reason this is not ten abstract cells: *"the meter is made of the
 * thing you are shooting"*. Ten slots, one per question, and the same countable-blocks
 * accessibility contract the dock's mastery meter already keeps.
 */
export const RACK_BAR = {
  height: 44,
  radius: 14,
  padX: 8,
  gap: 6,
  shadowDy: 3,
  /** The operator tile: `28×28; border-radius:8; background:#F5A623`, Baloo 16/800 ink. */
  op: { size: 28, radius: 8, glyphSize: 16 },
  countSize: 16,
  /** Ten slots, each `flex:1` in a 26pt-tall box. */
  slot: {
    count: 10,
    boxHeight: 26,
    gap: 3,
    /** `bottom:0; height:20; border-radius:3px 3px 5px 5px` — the bottle's body. */
    body: { height: 20, radiusTop: 3, radiusBottom: 5 },
    /** `left:32%; right:32%; top:0; height:8; border-radius:2` — its neck. */
    neck: { insetPercent: 32, height: 8, radius: 2 },
    /** `pr-spark`: `scale(.4) opacity(.95)` → `scale(2.4) opacity(0)`, 620ms, on the slot just cleared. */
    spark: { ms: 620, from: 0.4, to: 2.4, opacityFrom: 0.95, inset: 3, radius: 8 },
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The sea stage
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The stage box.
 *
 * The board authors `height: 212px` in five states and `196px` in `miss` and `end`, which is a
 * SHEET decision wearing a stage's clothes: those two states carry three stacked panels and need
 * the 16pt. Rather than animate the stage, the sheet's own content is what changes — see
 * `STAGE.tallSheetHeight`, kept so the 16pt delta is recorded rather than lost.
 */
export const STAGE = {
  designHeight: 212,
  tallSheetHeight: 196,
  /** `bottom:0; height:62; background:#1584B8; border-top:5px solid #43B4E0`. */
  water: { height: 62, rimHeight: 5 },
  /** `linear-gradient(#A9E6FF, #E3F7FF)` over everything above the water. */
  sky: { from: '#A9E6FF', to: '#E3F7FF' },
} as const;

/** A drifting swell dash. `left`/`bottom`/`width`, and the period and phase its `pr-swell` runs on. */
export interface Swell {
  readonly x: number;
  readonly bottom: number;
  readonly w: number;
  readonly ms: number;
  readonly delayMs: number;
}

/**
 * `pr-swell`: `translateX(0 → −10px → 0)` with `opacity .5 → .85 → .5`, ease-in-out, forever.
 * The opacity is the ANIMATION's, never the element's `.6` — see trap 1 in the header.
 */
export const SWELL = { height: 3, travelX: -10, opacityFrom: 0.5, opacityTo: 0.85 } as const;

/** The board's own table, `dur = 3.2 + i × .5`, `delay = i × .4`. */
export const SWELLS: readonly Swell[] = (
  [
    [24, 20, 44],
    [180, 34, 32],
    [96, 12, 38],
    [260, 24, 30],
  ] as const
).map(([x, bottom, w], i) => ({
  x,
  bottom,
  w,
  ms: (3.2 + i * 0.5) * 1000,
  delayMs: i * 400,
}));

/**
 * `pr-bob`: `translateY(0 → −5px → 0)` with `rotate(−1.6deg → 1.6deg → −1.6deg)`,
 * `transform-origin: 50% 92%`. The boat runs it at 3.6s, the raft at 4.2s.
 *
 * Unlike the sea chart's ships there is no authored rotation underneath for the keyframe to
 * replace, so ±1.6° is both the authored and the rendered value.
 */
export const BOB = { riseY: 5, rotateDeg: 1.6, originY: 0.92, boatMs: 3600, raftMs: 4200 } as const;

/**
 * The player's gun boat: `left:4; bottom:30; 132×106`.
 *
 * Drawn, not blitted — the same ruling as the duel's hulls. Offsets inside `parts` are PART coords
 * measured from the group's top-left, converted from the board's own `left`/`bottom` pairs, because
 * React Native has no `bottom`-anchored absolute child inside an unmeasured box.
 */
export const BOAT = {
  x: 4,
  bottom: 30,
  w: 132,
  h: 106,
  /** `left:62; bottom:94; 24×12`, `polygon(0 0,100% 0,68% 50%,100% 100%,0 100%)` — a swallowtail. */
  pennant: { x: 62, y: 0, w: 24, h: 12, points: '0,0 100,0 68,50 100,100 0,100' as PolyPoints },
  /** `left:60; bottom:38; 6×58; border-radius:3`. */
  mast: { x: 60, y: 10, w: 6, h: 58, radius: 3 },
  /**
   * Both sails are `repeating-linear-gradient(90deg, #FFF6E4 0 7px, #D93A2E 7px 14px)` under a
   * clip. RN has no repeating gradient, so they are drawn as 7pt stripe columns inside a clipped
   * box — the same technique `duel/Ship.tsx` already uses for the player's banded canvas.
   */
  stripe: { width: 7 },
  /** `left:22; bottom:72; 38×23`, `polygon(100% 0,100% 100%,0 88%,0 12%)`. */
  topsail: { x: 22, y: 11, w: 38, h: 23, points: '100,0 100,100 0,88 0,12' as PolyPoints },
  /** `left:14; bottom:42; 46×30`, `polygon(100% 0,100% 100%,0 92%,0 8%)`. */
  mainsail: { x: 14, y: 34, w: 46, h: 30, points: '100,0 100,100 0,92 0,8' as PolyPoints },
  /** `left:8; bottom:32; 116×7; border-radius:4`. */
  rail: { x: 8, y: 67, w: 116, h: 7, radius: 4 },
  /** `left:0; bottom:0; 132×34`, `polygon(0 0,100% 0,90% 100%,9% 100%)`. */
  hull: {
    x: 0,
    y: 72,
    w: 132,
    h: 34,
    points: '0,0 100,0 90,100 9,100' as PolyPoints,
    /** `left:5; right:5; top:5; height:7; background:#F5A623`. */
    stripe: { x: 5, y: 5, h: 7 },
    /** `bottom:0; height:11`, the hull polygon again in `#A0631F`. */
    keel: { h: 11 },
  },
  /** `left:96; bottom:36; 30×20` — the deck gun the child is firing. */
  gun: {
    x: 96,
    y: 50,
    w: 30,
    h: 20,
    carriage: { x: 0, y: 9, w: 30, h: 11, radius: 5 },
    barrel: { x: 4, y: 4, w: 16, h: 7, radius: 4 },
    /** `sprites/fire1.png` at `left:20; bottom:6; width:18`, running `pr-flame`. Vendored already. */
    muzzle: { x: 20, y: 6, w: 18 },
  },
  /** `pr-flame`: `scale(1) translateY(0)` → `scale(1.16) translateY(-3px)` → back, 600ms. */
  flame: { ms: 600, scale: 1.16, riseY: 3 },
} as const;

/**
 * Pim's raft: `right:2; bottom:34; 96×80`.
 *
 * Board 11b is explicit about why he is here rather than a buoy: *"A crew member on a raft tossing
 * bottles is a person doing something for you; a buoy anchored in the water is furniture."* Same
 * geometry budget as the buoy it replaces.
 */
export const RAFT = {
  right: 2,
  bottom: 34,
  w: 96,
  h: 80,
  /** `left:0; bottom:0; 96×12; border-radius:4`, `inset 0 -4px 0 #A0631F`. */
  deck: { x: 0, y: 68, w: 96, h: 12, radius: 4, insetDy: 4 },
  /** `right:6; bottom:12; 26×22; border-radius:5`, `inset 0 -6px 0`, band `top:7; height:4`. */
  crate: { x: 64, y: 46, w: 26, h: 22, radius: 5, insetDy: 6, band: { y: 7, h: 4 } },
  /** `left:18; bottom:12; 26×36` — Pim himself, in his own box. */
  pim: {
    x: 18,
    y: 32,
    w: 26,
    h: 36,
    boots: [
      { x: 8, y: 31, w: 6, h: 5, radius: 3 },
      { x: 15, y: 31, w: 6, h: 5, radius: 3 },
    ],
    /** `left:5; bottom:4; 16×11; border-radius:7px 7px 4px 4px`, with a `#D93A2E` sash. */
    body: { x: 5, y: 21, w: 16, h: 11, radiusTop: 7, radiusBottom: 4, sash: { y: 4, h: 3 } },
    /** `left:0; bottom:11; 5×9; border-radius:3; rotate(-116deg)`, origin `50% 15%` — mid-throw. */
    arm: { x: 0, y: 16, w: 5, h: 9, radius: 3, angle: -116, originY: 0.15 },
    /** `left:4; bottom:13; 18×17; border-radius:999`. */
    head: {
      x: 4,
      y: 6,
      size: 18,
      height: 17,
      eye: { w: 3, h: 4, y: 6, inset: 4 },
      mouth: { x: 7, y: 11, w: 5, h: 3 },
    },
    /** `left:3; bottom:27; 20×6; border-radius:6px 6px 2px 2px` — the hat he throws at 10/10. */
    hat: { x: 3, y: 3, w: 20, h: 6, radiusTop: 6, radiusBottom: 2 },
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The six targets (board 11b)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export const TARGET_KINDS = ['bottle', 'barrel', 'gull', 'bell', 'crate', 'hat'] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

/**
 * Board 11b's table, verbatim — the six kinds, when each appears, and the note that justifies it.
 *
 * `when` is the board's own right-hand column and is the SPEC that `services/rangeTargets.ts`
 * implements; keeping the prose beside the rule is what makes a retune reviewable.
 */
export interface TargetRow {
  readonly kind: TargetKind;
  readonly name: string;
  readonly when: string;
  readonly plate: string;
  /** Implemented as authored, or the reason it is not. */
  readonly note: string;
}

export const TARGET_TABLE: readonly TargetRow[] = [
  {
    kind: 'bottle',
    name: 'Green bottle',
    when: 'ALWAYS',
    plate: rangeColor.bottleGlass,
    note: 'The baseline, and the rack is made of them — the meter and the target are one object.',
  },
  {
    kind: 'barrel',
    name: 'Barrel',
    when: 'STREAK ×3',
    plate: '#C9813C',
    note: 'Bigger, at three in a row. A larger target as a reward for accuracy is backwards from an adult game and exactly right here.',
  },
  {
    kind: 'gull',
    name: 'Gull with a stolen hat',
    when: '1 IN 5',
    plate: '#FFF6E4',
    note: 'Crosses the sky on a 4s loop. Nothing about the maths changes — the motion is the whole novelty.',
  },
  {
    kind: 'bell',
    name: 'Golden bell',
    when: '1 IN 12',
    plate: '#FFD23F',
    note: "Rings and glows. The board pays it three rack slots; that is NOT implemented — a rack slot is a question, and paying three would end a ten-question drill early, which `commitDrill` refuses to pay for. It keeps the rarity and the ceremony and is worth one slot.",
  },
  {
    kind: 'crate',
    name: 'Crate stack',
    when: 'RACK 6+',
    plate: '#E0AE6B',
    note: 'Two crates, two consecutive corrects. The only target that spans questions — and it spans exactly two, so it stays one slot per answer.',
  },
  {
    kind: 'hat',
    name: "Pim's hat",
    when: '10/10 ONLY',
    plate: '#D93A2E',
    note: 'He throws it himself after a perfect rack. Pure ceremony, zero mechanics.',
  },
];

/**
 * The drawn size and vertical berth of each target.
 *
 * `bottom` is the board's own STAGE offset, in the 212pt design stage — `stageFraction` below is
 * what carries it onto a shorter one. `right: 96` is shared by every kind: the target floats
 * between the boat's muzzle and Pim's raft, which is the only place all six read clearly.
 */
export const TARGET_BERTH = { right: 96 } as const;

export interface TargetArt {
  readonly w: number;
  readonly h: number;
  /** The board's `targetBottom`, in the 212pt design stage. */
  readonly bottom: number;
}

export const TARGET_ART: Record<TargetKind, TargetArt> = {
  bottle: { w: 26, h: 44, bottom: 70 },
  barrel: { w: 36, h: 40, bottom: 70 },
  gull: { w: 44, h: 26, bottom: 132 },
  bell: { w: 40, h: 46, bottom: 118 },
  /** Not on the board as art — two of the board's own 36×40 barrels, stacked with a 2pt seat. */
  crate: { w: 36, h: 82, bottom: 70 },
  /** Pim's own hat, thrown: the 20×6 from `RAFT.pim.hat`, at the bottle's berth. */
  hat: { w: 20, h: 6, bottom: 70 },
};

/** The green bottle, in PART coords. Board's `26×44`. */
export const BOTTLE = {
  /** `left:2; bottom:0; 22×30; border-radius:6px 6px 8px 8px`, `inset -5px 0 rgba(20,60,44,.22)`. */
  body: { x: 2, y: 14, w: 22, h: 30, radiusTop: 6, radiusBottom: 8, shadeW: 5, shadeOpacity: 0.22 },
  /** `left:9; bottom:28; 8×12; border-radius:2`. */
  neck: { x: 9, y: 4, w: 8, h: 12, radius: 2 },
  /** `left:8; bottom:38; 10×6; border-radius:2`. */
  cork: { x: 8, y: 0, w: 10, h: 6, radius: 2 },
  /** `left:5; bottom:8; 16×8; border-radius:2` — the paper label. */
  label: { x: 5, y: 28, w: 16, h: 8, radius: 2 },
} as const;

/** The barrel. Board's `36×40`, `border-radius:10`, two `#E0AE6B` hoops. */
export const BARREL = {
  radius: 10,
  shadeW: 6,
  shadeOpacity: 0.26,
  hoops: [
    { y: 9, h: 5 },
    { y: 26, h: 5 },
  ],
} as const;

/** The gull. Board's `44×26`, in PART coords converted from `bottom:`. */
export const GULL = {
  /** `left:10; bottom:6; 24×13; border-radius:999`, `inset 0 -4px 0 #D8CBB2`. */
  body: { x: 10, y: 7, w: 24, h: 13, insetDy: 4 },
  /** `left:30; bottom:12; 12×11; border-radius:999`. */
  head: { x: 30, y: 3, w: 12, h: 11 },
  /** `left:40; bottom:15; 5×4`, `polygon(0 0,100% 50%,0 100%)`. */
  beak: { x: 40, y: 7, w: 5, h: 4, points: '0,0 100,50 0,100' as PolyPoints },
  /** `left:36; bottom:18; 3×3; border-radius:999`. */
  eye: { x: 36, y: 5, w: 3, h: 3 },
  /** `left:4; bottom:14; 22×11`, `polygon(0 0,100% 60%,72% 100%)`. */
  wing: { x: 4, y: 1, w: 22, h: 11, points: '0,0 100,60 72,100' as PolyPoints },
  /** `pr-fly`: `translateX(0 → −190px)`, 4s linear, forever. */
  fly: { ms: 4000, travelX: -190 },
} as const;

/** The golden bell. Board's `40×46`, authored top-down, so these are already PART coords. */
export const BELL = {
  /** `pr-bell`: `rotate(−9deg → 9deg → −9deg)`, 1.2s, origin `50% 8%`. */
  swing: { ms: 1200, deg: 9, originY: 0.08 },
  /** `pr-ring`: `scale(.8) opacity(.9)` → `scale(1.7) opacity(0)`, 1.6s, forever. Authored `.4`. */
  ring: { ms: 1600, from: 0.8, to: 1.7, opacityFrom: 0.9, baseOpacity: 0.4 },
  /** `left:14; top:0; 12×8; border-radius:999px 999px 0 0` — the crown loop. */
  crown: { x: 14, y: 0, w: 12, h: 8 },
  /** `left:6; top:7; 28×26; border-radius:14px 14px 4px 4px`, `inset -5px 0 0 #B87309`. */
  body: { x: 6, y: 7, w: 28, h: 26, radiusTop: 14, radiusBottom: 4, shadeW: 5 },
  /** `left:2; top:31; 36×7; border-radius:4`. */
  lip: { x: 2, y: 31, w: 36, h: 7, radius: 4 },
  /** `left:17; top:36; 6×7; border-radius:0 0 999px 999px`. */
  clapper: { x: 17, y: 36, w: 6, h: 7 },
} as const;

/**
 * The three shards a bottle bursts into. `pr-shatter-a/b/c`, 520ms, ease-out, forwards.
 *
 * Offsets are the board's own `left`/`bottom` inside the target's box; `dx`/`dy`/`spin` are the
 * keyframe's end state, and `dy` is negated from the board's CSS because CSS `translate(-30px,-22px)`
 * is up and RN's Y axis agrees — recorded so the sign is not re-derived at the call site.
 */
export const SHATTER = {
  ms: 520,
  shards: [
    { x: 0, bottom: 6, size: 12, radius: 4, fill: rangeColor.bottleGlass, dx: -30, dy: -22, spin: -120 },
    { x: 12, bottom: 10, size: 10, radius: 3, fill: rangeColor.bottleGlass, dx: 28, dy: -18, spin: 140 },
    { x: 6, bottom: 0, size: 9, radius: 3, fill: rangeColor.bottleShardLight, dx: 4, dy: 26, spin: 60 },
  ],
} as const;

/**
 * `pr-toss` — Pim's throw, and the beat the whole board is built around.
 *
 * `translate(0,0) scale(.6) opacity(0)` → 45% `translate(-96px,-46px) scale(1) opacity(1)` →
 * `translate(-176px,0)`. 700ms on `cubic-bezier(.3,.8,.4,1)`. The arc peaks at 46pt, which is why
 * the stage needs its full height even in the states that shorten the sheet.
 */
export const TOSS = {
  ms: INCOMING_MS,
  peakAt: 0.45,
  peak: { dx: -96, dy: -46 },
  end: { dx: -176, dy: 0 },
  fromScale: 0.6,
} as const;

/** `pr-float`: `translateY(0 → −7px → 0)` with `rotate(−4deg → 4deg → −4deg)`, 2.8s, forever. */
export const FLOAT = { ms: 2800, riseY: 7, rotateDeg: 4 } as const;

/** `pr-drift-off`: `translateX(0 → −64px)` with `rotate(0 → −14deg)` and `opacity 1 → .25`, 900ms. */
export const DRIFT_OFF = { ms: 900, dx: -64, rotateDeg: -14, opacityTo: 0.25 } as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The stage's floating chips
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The board's `chip` table, keyed by its own state id.
 *
 * Every one of these is a text/ground pair and every one was measured: ink on parchment 13.98, ink
 * on `success` 5.70, ink on `amber` 7.41, ink on `gold` 10.40, white on `seaDeep` 7.09. The board's
 * designer avoided both banned greens — `SMASHED!` carries INK on `#2FB65E`, never white — so there
 * was nothing here to correct.
 */
export interface StageChip {
  readonly text: string;
  readonly bg: string;
  readonly ink: string;
}

export const STAGE_CHIP = {
  padX: 12,
  padY: 5,
  size: 11,
  tracking: 0.05,
  x: 12,
  y: 10,
  /** `pr-rise`: `translateY(14px) opacity(0)` → `translateY(0) opacity(1)`, 240ms, ease-out. */
  rise: { ms: 240, fromY: 14 },
} as const;

/**
 * The board's own copy, verbatim, with the two target-specific lines generalised.
 *
 * `PIM TOSSES A BOTTLE` and `HIT THE BOTTLE` are authored for the bottle state; the board draws a
 * barrel, a gull and a bell in the same slot and never says what those chips read. The noun is
 * therefore taken from `TARGET_NOUN` rather than hardcoded — a chip that says "bottle" over a gull
 * is worse than no chip.
 */
export const TARGET_NOUN: Record<TargetKind, string> = {
  bottle: 'A BOTTLE',
  barrel: 'A BARREL',
  gull: 'A GULL',
  bell: 'THE GOLDEN BELL',
  crate: 'TWO CRATES',
  hat: 'HIS HAT',
};

/** The board's fixed chip copy for the states whose text does not name a target. */
export const CHIP_COPY = {
  hit: 'SMASHED!',
  streak: 'CANNON IS HOT — BIG TARGET',
  moving: 'IT MOVES!',
  bell: 'THE GOLDEN BELL',
  miss: 'IT GOT AWAY',
  /**
   * Not on the board — the board's `incoming` chip is authored only for a fresh toss, and it
   * never draws the carried beat. Announcing `PIM TOSSES` over a crate that is already in the
   * water is the visible half of A-061, so a carried target gets continuation copy instead. The
   * crate stack is the only target that ever carries (`rangeTargets.afterShot` — every other
   * kind is `remaining: 1`), so the copy can name it. Same parchment/ink pair as the toss chip,
   * measured 13.98.
   */
  carry: 'ONE CRATE LEFT!',
} as const;

/**
 * The streak chip: `right:10; top:10`, `padding:5px 10px`, `border-radius:999`, `background:#14283C`,
 * a 16pt gold star and a Baloo 16/800 gold `×N`.
 *
 * `pr-heat` (`box-shadow 0 0 0 0 → 0 0 0 6px rgba(255,122,24,.4)`, 1.2s) runs only at the streak
 * state. RN has no spreading box-shadow, so it is drawn as a sibling ring that scales — the same
 * substitution `chart/Station.tsx` makes for `sc-ring`.
 */
export const STREAK_CHIP = {
  x: 10,
  y: 10,
  padX: 10,
  padY: 5,
  gap: 6,
  star: 16,
  textSize: 16,
  /** `polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)`. */
  starPoints: '50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35' as PolyPoints,
  heat: { ms: 1200, spread: 6, opacity: 0.4, color: '#FF7A18' },
  /** The board shows the chip from the first hit — `streak > 0`. */
  showFrom: 1,
  /** `STREAK ×3` is what promotes the target to a barrel. Board 11b's own trigger. */
  barrelAt: 3,
} as const;

/** The hit mark: `right:88; bottom:96; height:32; padding:0 12; border-radius:999; background:#2FB65E`. */
export const HIT_MARK = {
  right: 88,
  bottom: 96,
  height: 32,
  padX: 12,
  gap: 6,
  textSize: 19,
  star: 16,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The parchment sheet
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** `border-radius: 22px 22px 0 0; box-shadow: 0 -4px 0 rgba(0,0,0,.08); padding: 12; gap: 8`. */
export const SHEET = { radius: 22, padding: 12, gap: 8, shadowDy: 4, shadowOpacity: 0.08 } as const;

/** The `incoming` state: one Baloo 24/800 line and three bouncing dots. */
export const INCOMING = {
  line: 'Here it comes!',
  lineSize: 24,
  gap: 12,
  dot: { size: 14, gap: 8, count: 3, staggerMs: 120 },
  /** `pr-pop`: `scale(.7) opacity(0)` → 60% `scale(1.06)` → `scale(1)`, 700ms on the dots. */
  pop: { ms: 700, from: 0.7, overshoot: 1.06 },
} as const;

/**
 * The question band: a 52pt row above a 2×2 grid with 12pt gaps.
 *
 * The board sets the question at Baloo 40/800 and `white-space: nowrap`. The duel's band is 44 and
 * `questionTypographyFor` is the shared rule that keeps a word problem from overflowing at 375 —
 * A-023's whole point. So the treatment comes from that function and this ratio scales it onto the
 * board's smaller band, rather than a second fitting rule being written here.
 */
export const QUESTION = {
  rowHeight: 52,
  /** 40 (this board) ÷ 44 (the duel band `questionTypographyFor` is calibrated against). */
  sizeRatio: 40 / 44,
  grid: { gap: 12, columns: 2 },
  /** `min-height:64; border-radius:18; background:#FFFFFF; box-shadow:0 4px 0 #D8CBB2`. */
  answer: { minHeight: 64, radius: 18, shadowDy: 4, textSize: 40 },
  /** The mark overlay: `pr-pop` 220ms, `background:#2FB65E`, a 30pt glyph and the 32pt value. */
  mark: { ms: 220, glyphSize: 30, valueSize: 32 },
} as const;

/** The `miss` state's three stacked panels. */
export const MISS = {
  title: 'It floated away',
  subtitle: 'Pim will toss another one.',
  banner: { radius: 18, padding: 12, gap: 12, tile: 44, tileRadius: 14, titleSize: 19, subSize: 12 },
  answer: { radius: 18, padding: 12, gap: 10, tile: 38, tileRadius: 12, textSize: 24, shadowDy: 3 },
  note: { radius: 18, padding: 12, gap: 12, tile: 44, tileRadius: 14, textSize: 13 },
  /** The board's own line, with the count interpolated. */
  line: (left: number): string =>
    `Your rack still has ${left}. Nothing was lost — a miss just means another go.`,
} as const;

/**
 * The `end` state.
 *
 * `stats` is where trap 2 lives. The board's third tile is `+35 COINS`; the range awards no coins
 * and `harbor.test.ts` pins that `services/range.ts` never even says the word, because the harbor
 * board once printed a payout the range does not make. The METER is the honest third number and it
 * is also the one that answers "why did I come here" — so the SUBSTITUTION is recorded, not hidden.
 */
export const ROUND_END = {
  title: 'Rack cleared!',
  tile: { size: 52, radius: 18, glyphSize: 26 },
  titleSize: 24,
  subSize: 13,
  stats: {
    padding: 10,
    radius: 16,
    shadowDy: 3,
    numberSize: 26,
    labelSize: 11,
    tracking: 0.05,
    /** `#1E7F41` is `successDeep` — the board already reached for the readable green here. */
    smashedInk: '#1E7F41',
    /** Board: `SMASHED` · `BEST STREAK` · `COINS`. The third is the substitution above. */
    labels: ['SMASHED', 'BEST STREAK', 'METER'] as const,
    boardLabels: ['SMASHED', 'BEST STREAK', 'COINS'] as const,
  },
  /** The reward card: `border-radius:18; background:#FFD23F`, a 60pt tile and `pr-pop` 260ms. */
  reward: { radius: 18, padding: 12, gap: 12, tile: 60, tileRadius: 18, spriteW: 44, kickerSize: 11, nameSize: 21 },
  /** `height:64; border-radius:18; background:#F5A623; box-shadow:0 4px 0 #B87309`. */
  again: { height: 64, radius: 18, shadowDy: 4, textSize: 20, label: 'Another rack' },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The pick screen
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The rack chooser.
 *
 * Board 11c's AGENCY note: *"The old range was entered from the dock and told you what to drill.
 * Three racks, one per skill, with their progress visible — so practice is a choice rather than an
 * assignment. Locked racks show what opens them."*
 *
 * The board draws exactly three rows, the third being a locked `÷ facts`. THREE IS NOT A RULE and
 * `÷` IS NOT ALWAYS ALLOWED: the rows come from `trainingCatalog`, which is band-filtered, so a
 * K-1 captain sees only what K-1 may be asked. A locked row naming `÷ facts` in front of a
 * five-year-old is the gun deck's A-051 operator-row bug in a new place — that board drew a flat
 * `['+','−','×','÷']` and showed a kindergartner division three years early. The LOCK state is
 * transcribed and used for an in-band skill that is not yet reachable; the out-of-band skill is
 * absent, not locked.
 */
export const PICK = {
  title: 'What shall we shoot?',
  titleSize: 19,
  padding: 12,
  gap: 12,
  /** `min-height:64; border-radius:18; padding:12; gap:12`. */
  row: { minHeight: 64, radius: 18, padding: 12, gap: 12, shadowDy: 4 },
  /** `56×56; border-radius:18; background:#F0E2C8`, Baloo 28/800 ink. */
  glyph: { size: 56, radius: 18, textSize: 28 },
  nameSize: 17,
  /** The row's own ten-slot rack: `12×16; border-radius:3px 3px 4px 4px`, 3pt apart. */
  rack: { count: 10, w: 12, h: 16, gap: 3, radiusTop: 3, radiusBottom: 4 },
  /** `40×40; border-radius:14; background:#C9D6E4` with a `#4C637A` padlock. */
  lock: {
    size: 40,
    radius: 14,
    shackle: { w: 12, h: 7, stroke: 3 },
    body: { w: 16, h: 12, radius: 2, hole: 4 },
  },
  /** `40×40; border-radius:999; background:#2FB65E`, a 20/800 ink tick. */
  done: { size: 40, glyphSize: 20 },
  /** `64×64; border-radius:18; background:#F5A623; box-shadow:0 4px 0 #B87309`, an ink triangle. */
  play: { size: 64, radius: 18, shadowDy: 4, triangle: { w: 16, h: 22 } },
  /** The footer note: `padding:12; border-radius:16; background:#F0E2C8`, a 38pt tile at 26pt sprite. */
  note: {
    text: 'Clear a rack to earn its cannon.',
    radius: 16,
    padding: 12,
    gap: 10,
    tile: 38,
    tileRadius: 14,
    spriteW: 26,
    textSize: 13,
  },
  /** The board's own header copy on this branch. */
  heading: 'Target range',
} as const;

/** A rack row's ten slots, filled to `cleared`. Shared by the pick screen and the round's bar. */
export function rackSlots(
  cleared: number,
  justCleared = -1,
): readonly {
  readonly filled: boolean;
  readonly sparked: boolean;
}[] {
  return Array.from({ length: RACK_BAR.slot.count }, (_, i) => ({
    filled: i < cleared,
    sparked: i === justCleared,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Geometry the screen needs and the board only implies
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** The header band's full measured height: `8 + 44 + 8`. */
export const HEADER_HEIGHT = HEADER.padY * 2 + HEADER.back.size;

/**
 * The least a sheet can be and still hold a question band.
 *
 * `12 padding + 52 question row + 8 gap + (64 + 12 + 64) answer grid + 12 padding`. This is the
 * number the stage is not allowed to eat, and it is arithmetic rather than a guess — which is what
 * lets `range-layout.test.ts` assert non-overlap at three viewports instead of screenshotting one.
 */
export const SHEET_MIN_HEIGHT =
  SHEET.padding * 2 +
  QUESTION.rowHeight +
  SHEET.gap +
  QUESTION.answer.minHeight * 2 +
  QUESTION.grid.gap;

/** The board's stage as a fraction of its frame — 212 / 667. */
export const STAGE_RATIO = STAGE.designHeight / FRAME.height;

/** Below this the boat's rigging starts colliding with the waterline. */
const STAGE_MIN = 168;
/**
 * Above this a tall tablet turns the stage into the screen.
 *
 * A choice, and the reason is `responsive.ts`'s own: art scales, composition does not. 300 is the
 * board's 212 at the art scale's own 1.28 ceiling plus the 28pt the toss arc needs; past it the
 * sheet stops being the thing a child is looking at.
 */
const STAGE_MAX = 300;

/**
 * The sea stage's height at a given frame.
 *
 * Proportional to the board, then floored, then CLAMPED AGAINST WHAT IS LEFT — the sheet's minimum
 * and the header win, always. `theme/responsive.ts` owns `seaStageHeight` for the duel's 176/667
 * band and is owned by another track this pass; this is the practice board's own 212/667 and lives
 * with the rest of its measurements.
 */
export function rangeStageHeight(frameHeight: number, insetTop = 0): number {
  const available = frameHeight - insetTop - HEADER_HEIGHT - SHEET_MIN_HEIGHT;
  const proportional = frameHeight * STAGE_RATIO;
  const capped = Math.min(proportional, STAGE_MAX, available);
  return Math.round(Math.max(Math.min(STAGE_MIN, available), capped));
}

/**
 * The scale the SCENE is drawn at, which is not the same as the layout's art scale.
 *
 * `responsive.ts`'s rule is "art scales with the screen", and it means the screen's WIDTH — every
 * scale in that file is `width / REFERENCE.width`. That is right for a picture whose box grows with
 * it, and wrong for this one: the stage's height is clamped against the sheet's minimum, so a short
 * frame (a landscape phone, a short browser window) gets a WIDE art scale and a SHORT stage, and the
 * boat's 106pt of rigging grows through the sky it is supposed to be sailing under.
 *
 * That is a real shape, not a hypothetical: the clamp in `rangeStageHeight` starts biting below
 * about 416pt of frame height, and a 667×375 landscape phone is 375.
 *
 * So the scene takes the SMALLER of the art scale and what the box can actually hold, on both axes:
 *
 *   - vertically, every part must satisfy `stageH × (bottom / 212) + partHeight × scale ≤ stageH`,
 *     which rearranges to `scale ≤ stageH × (1 − bottom/212) / partHeight`. The boat binds at every
 *     size, being the tallest thing closest to the waterline.
 *   - horizontally, the boat and the raft are anchored to opposite edges and must not meet:
 *     `(BOAT.x + BOAT.w + RAFT.right + RAFT.w) × scale ≤ contentWidth`.
 *
 * It only ever REDUCES. On the board's own 375×667 the binding vertical limit is 1.72 and the art
 * scale is 1.00, so the composition is untouched — which is the property that makes this a safety
 * net rather than a second design.
 */
export function sceneScale(stageHeight: number, contentWidth: number, art: number): number {
  if (stageHeight <= 0 || contentWidth <= 0) return 0;

  const vertical = SCENE_PARTS.reduce((limit, part) => {
    const headroom = (stageHeight * (1 - stageFraction(part.bottom))) / part.height;
    return Math.min(limit, headroom);
  }, Number.POSITIVE_INFINITY);

  const horizontal = contentWidth / (BOAT.x + BOAT.w + RAFT.right + RAFT.w);

  return Math.min(art, vertical, horizontal);
}

/** Every scene element that has to fit inside the stage, by its board berth and drawn height. */
const SCENE_PARTS: readonly { readonly bottom: number; readonly height: number }[] = [
  { bottom: BOAT.bottom, height: BOAT.h },
  { bottom: RAFT.bottom, height: RAFT.h },
  ...TARGET_KINDS.map((kind) => ({ bottom: TARGET_ART[kind].bottom, height: TARGET_ART[kind].h })),
];

/**
 * Maps a board STAGE offset onto a live stage.
 *
 * Vertical positions inside the scene are fractions of the board's 212pt stage, never raw points:
 * the gull is berthed 132pt up a 212pt stage and a raw 132 on a 169pt stage would put it through
 * the sky's ceiling. Horizontal positions scale by ART, because the stage is always full-width and
 * the boat is a picture. This is `board.ts`'s "the arrangement is preserved, the art grows", applied
 * to one scene.
 */
export function stageFraction(designBottom: number): number {
  return designBottom / STAGE.designHeight;
}

/** A `CornerPercents`-shaped helper for the rack slot, whose corners differ top and bottom. */
export const RACK_SLOT_RADII: CornerPercents = [
  RACK_BAR.slot.body.radiusTop,
  RACK_BAR.slot.body.radiusTop,
  RACK_BAR.slot.body.radiusBottom,
  RACK_BAR.slot.body.radiusBottom,
];
