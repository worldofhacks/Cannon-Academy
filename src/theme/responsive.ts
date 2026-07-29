/**
 * Responsive layout.
 *
 * The governing principle, and it is not "scale everything by width":
 *
 *   **Art scales with the screen. Type and touch targets do not.**
 *
 * A ship is a picture — it should fill more of a bigger phone, and scaling it linearly is right.
 * A child's fingertip is the same width on every device, and so is the distance their eye reads
 * comfortably. Scaling 34pt display type to 40pt on a Pro Max makes it *look* designed-for-a-tablet
 * without making it any more readable, and scaling it to 32pt on a 360pt Android makes it worse
 * than the design. So type gets a tightly clamped scale and touch targets get none at all.
 *
 * The design is drawn at 375×667 — the iPhone SE, and deliberately the tightest phone we support.
 * Note that 375 is NOT the floor: a very common Android class is 360pt wide, narrower than the
 * reference, which is why `TYPE_SCALE_MIN` is below 1 rather than clamped at it.
 *
 * Devices this is checked against:
 *   360×640  small Android (Galaxy A-series) — the true floor, narrower than the design
 *   360×800  common Android
 *   375×667  iPhone SE — the design reference
 *   390×844  iPhone 13/14/15/16
 *   393×852  iPhone 15/16 Pro
 *   402×874  iPhone 17 Pro
 *   430×932  iPhone Pro Max
 */
/** The frame the boards were drawn at. Ratios are measured against this, never against a device. */
export const REFERENCE = { width: 375, height: 667 } as const;

/**
 * How far type is allowed to drift from the design. ±8% is about the limit at which a reader
 * cannot tell the layout changed — past it, the composition visibly re-flows between devices.
 */
const TYPE_SCALE_MIN = 0.94;
const TYPE_SCALE_MAX = 1.08;

/** Art may grow considerably more, because a bigger picture on a bigger screen is simply better. */
const ART_SCALE_MIN = 0.92;
const ART_SCALE_MAX = 1.28;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface Layout {
  readonly width: number;
  readonly height: number;
  /** Multiply font sizes and text-adjacent spacing by this. Clamped hard. */
  readonly type: number;
  /** Multiply illustration dimensions by this. Allowed to roam. */
  readonly art: number;
  /** Horizontal page margin. Grows a little on wide screens so lines do not run edge to edge. */
  readonly gutter: number;
  /** True below 370pt wide — the small-Android class. Drop optional chrome here, never content. */
  readonly isNarrow: boolean;
  /** True below 700pt tall — the SE class. Vertical budget is the binding constraint. */
  readonly isShort: boolean;
  /** True at 850pt+ tall. There is room to let the art breathe. */
  readonly isTall: boolean;
  /**
   * Scales a design pixel by the ART factor. Use for anything drawn.
   * `a(156)` is "the 156pt ship from the board, at this screen's size".
   */
  readonly a: (designPx: number) => number;
  /** Scales a design pixel by the TYPE factor. Use for text and the boxes that hug text. */
  readonly t: (designPx: number) => number;
}

/**
 * The pure rule. Separated from the React hook ON PURPOSE: React Native's entry point is
 * Flow-typed, so any module importing `react-native` cannot be parsed by the node test runner.
 * Keeping the arithmetic here means the responsive rules are frozen-testable; `useLayout` in
 * `useLayout.ts` is the thin binding that supplies real screen dimensions.
 */
export function computeLayout(width: number, height: number): Layout {
  const raw = width / REFERENCE.width;
  const type = clamp(raw, TYPE_SCALE_MIN, TYPE_SCALE_MAX);
  const art = clamp(raw, ART_SCALE_MIN, ART_SCALE_MAX);

  return {
    width,
    height,
    type,
    art,
    gutter: width < 370 ? 10 : width < 400 ? 12 : 16,
    isNarrow: width < 370,
    isShort: height < 700,
    isTall: height >= 850,
    a: (designPx: number) => designPx * art,
    t: (designPx: number) => designPx * type,
  };
}

/**
 * The sea stage's height, which is the one place the vertical range really bites.
 *
 * The board draws it at 176pt of a 667pt screen — 26%. Holding 26% on a 932pt Pro Max gives 246pt
 * of sea and squeezes nothing; holding a flat 176pt there wastes the extra height on a sheet that
 * does not need it. But on a 640pt Android, 26% is 166pt and the cannon tray stops fitting, so the
 * proportion is floored rather than followed off a cliff.
 */
/** The board's exact ratio, not a rounded 0.26 — which lands on 173 and misses the design by 3pt. */
const SEA_STAGE_RATIO = 176 / 667;

export function seaStageHeight(l: Layout): number {
  const proportional = l.height * SEA_STAGE_RATIO;
  return Math.round(clamp(proportional, 150, 250));
}
