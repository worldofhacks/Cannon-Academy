/**
 * The coach bar's geometry — how tall it is, and what has to move out of its way.
 *
 * Pure, and separated from `CoachBar.tsx` for the usual reason: RN's entry point is Flow-typed and
 * the node runner cannot parse it, so a number that lives in a component is a number no test can
 * check. Every value below is asserted in `onboarding-wiring.test.ts`.
 *
 * ## The defect this file exists to close
 *
 * The chart walkthrough drew its coach bar into an `absoluteFill` overlay. That reproduces the
 * board's ink and not its effect: on the board the coach bar is a **flex sibling** that takes 92pt
 * of layout, which is exactly why the world beats' body is 555pt — `667 − 20 status − 92 coach`.
 * The map is *compressed*, not covered. Ours covered it, and the fogged island's name pill and its
 * requirement chip — the only copy on the screen telling a child what to do next — went under the
 * bar's top edge at 375×667.
 *
 * The fix is to reserve the band in layout and let the chart's own model do the rest:
 * `closeChartColumns` already clamps every node column against the live map box, so a genuinely
 * shorter box lifts the labels on its own. There is no second clamp here, and there must not be.
 */
import { MIN_TAP_TARGET } from '../../theme/tokens';

/** A rectangle in screen points, origin top-left. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
  );
}

/**
 * The bar's two builds, measured off the board.
 *
 * `standard` is the board's own: 8pt above, 12pt below, a 12pt slab pad either side of a 48pt
 * badge. It resolves to exactly 92 at the reference frame, with or without a sub line — the sub
 * costs nothing because the badge is taller than the text stack until well past two lines.
 *
 * `compact` is not on the board, and it is not a style choice. See `coachBandFits`.
 */
export const COACH_BAND = {
  standard: { outerTop: 8, outerBottom: 12, slabPad: 12, badge: 48 },
  compact: { outerTop: 4, outerBottom: 4, slabPad: 6, badge: 36 },
  /** The headline's line box at 17pt display. One line — see `CoachBar`'s fit-to-width note. */
  lineHeight: 21,
  subGap: 4,
  /** The sub at 11pt body. */
  subLineHeight: 16,
} as const;

export type CoachBuild = 'standard' | 'compact';

export interface CoachBandInput {
  /** `L.a` — art scale. Padding and the badge are drawn, so they follow art. */
  readonly art: (designPx: number) => number;
  /** `L.t` — type scale. Line boxes hug text, so they follow type. */
  readonly type: (designPx: number) => number;
  readonly hasSub: boolean;
  readonly build: CoachBuild;
}

/**
 * The bar's drawn height.
 *
 * Art and type are taken separately rather than collapsed into one scale, because that divergence
 * is the whole reason this is arithmetic and not a constant: on a short viewport the drawn badge
 * shrinks with `art` while the text stack stays near `type`, and which of the two wins the `max`
 * changes with it.
 */
export function coachBandHeight({ art, type, hasSub, build }: CoachBandInput): number {
  const box = COACH_BAND[build];
  // The compact build has no sub line, and dropping it is not an aesthetic call. With the sub, the
  // text stack — not the badge — becomes the binding term, and the bar cannot get under 58.6pt on a
  // 360×640 sheet, which leaves the answer grid 0.4pt of margin. Nothing survives a rounding change
  // at 0.4pt. Without it the same bar is 53.8 and the margin is 5.2.
  //
  // The sub is not lost: `CoachBar` still announces the whole line, headline and sub, through the
  // speaker and through the screen reader — which on this bar is the primary channel anyway.
  const showsSub = hasSub && build === 'standard';
  const text =
    type(COACH_BAND.lineHeight) +
    (showsSub ? art(COACH_BAND.subGap) + type(COACH_BAND.subLineHeight) : 0);
  return (
    art(box.outerTop) + art(box.outerBottom) + art(box.slabPad) * 2 + Math.max(art(box.badge), text)
  );
}

/**
 * The grown-up skip row above the chart tour's coach bar, in design points.
 *
 * It is the tap floor, not the ink. The pill drawn inside it is 24pt of quiet 11pt text; the row is
 * `MIN_TAP_TARGET` because that is what the target has to be, and because every point of that
 * target has to live INSIDE the reserved band. Slop spent upward would steal advancing taps from
 * the dock band, and slop spent downward is dead on arrival — the coach bar is painted after the
 * skip and its speaker button owns those points.
 *
 * Reserved rather than floated for exactly the reason the coach bar is. The chart's only two spare
 * surfaces are the header band and the dock, and beats 18 and 19 ring controls in both: a floated
 * skip would sit on top of the Fight button or the purse, which is the defect `coachBandHeight`
 * exists to prevent, reintroduced one row higher. It also keeps the tour's chrome out of the map
 * entirely, which matters while the chart itself is being reworked beside this.
 *
 * The guided duel does NOT get a reserved row. Its sheet has 5.2pt of slack at 360×640 before the
 * answer grid loses its 64pt targets (see `coachBandFits`), so its skip is drawn over the sea
 * band's own chrome instead and costs the layout nothing.
 */
export const TOUR_SKIP_ROW = 64;

/**
 * The band the chart must set aside for the tour: the coach bar, the grown-up skip row above it
 * when there is one, and the home indicator underneath both.
 *
 * One function so the screen and its viewport sweep cannot disagree about the number — the whole
 * no-overlap argument in `onboarding-wiring.test.ts` is only as true as the reservation the chart
 * actually makes.
 */
export function chartTourBandHeight(
  input: CoachBandInput & { readonly insetBottom: number; readonly hasSkip: boolean },
): number {
  // `max`, not the scaled value: the row IS the tap target, and a target that shrank with the art
  // scale on a small phone would drop under the floor on exactly the devices that need it most.
  const skip = input.hasSkip ? Math.max(MIN_TAP_TARGET, input.art(TOUR_SKIP_ROW)) : 0;
  return coachBandHeight(input) + skip + input.insetBottom;
}

/**
 * The floor the guided duel's answer grid needs, in points.
 *
 * Summed from `QuestionPanel`'s own styles: `wrap` 10 top + 12 bottom, the 18pt fuse track, the
 * 56pt `questionRow`, the grid's 8pt `marginTop`, and two `gridRow`s of `choiceCell.minHeight` 64
 * with the grid's 10pt gap between them. Two rows because four choices is the shape the engine
 * serves; one row would be a floor that only holds for the easy case.
 *
 * These are borrowed numbers and they are pinned by a source assertion in the test, so a change to
 * `QuestionPanel.tsx` — which is not ours — announces itself here rather than silently invalidating
 * the budget.
 */
export const DUEL_PANEL_FLOOR = 10 + 12 + 18 + 56 + 8 + 64 * 2 + 10;

/**
 * The guided duel's HUD band, in points.
 *
 * `s.hud` is 4 top + 8 bottom with an 8pt gap, over a 44pt `TurnBar` and an 82pt `HullCard`
 * (7 + 21 head + 5 + 16 pips + 4 + 21 foot + 8). Static styles, so no scale applies.
 *
 * Also pinned by source assertion, for the same reason.
 */
export const DUEL_HUD_HEIGHT = 4 + 44 + 8 + 82 + 8;

/**
 * Whether the standard bar leaves the answer grid its 64pt targets.
 *
 * The guided duel's chrome is ~80pt heavier than the board's — the board's duel beats have no turn
 * bar — so the board's 92pt coach bar does not fit under it on a real phone. At 375×667 with a
 * 20pt status inset the sheet has 325pt and the grid needs 242, which leaves 83: eight points short
 * of the bar the board drew.
 *
 * Something has to give, and it is not the tap target. `MIN_TAP_TARGET` is a floor the whole app is
 * built on and a five-year-old's thumb is the reason for it; the coach bar losing padding costs
 * nothing a child can name. The badge shrinks to 36 and the speaker's `hitSlop` grows to keep its
 * target at 64 — the same ink-versus-target split `flow.ts` documents for the chart's header pills,
 * where the ink is 52 and 40 and both are padded out to the floor.
 *
 * The tightest supported case is a 360×640 Android with a 24pt status inset: 301pt of sheet against
 * a 242pt grid leaves 59, and the compact bar is 53.8. That 5pt is the whole margin — do not spend
 * it on padding without re-running `spec(A-005:AC-3)`'s viewport sweep.
 */
export function coachBandFits(sheetHeight: number, standardHeight: number): boolean {
  return sheetHeight - standardHeight >= DUEL_PANEL_FLOOR;
}

/**
 * Where the walkthrough's ring goes for one hub control.
 *
 * `chartHubControlLayout` models a viewport with no safe area: its header sits at the board's
 * `statusSpacer` and its dock band is flush to the bottom. The chart renders neither of those
 * literally — it puts a spacer of `insets.top` above everything and floats the header pill below
 * it, and `ChartDock` hangs an `insetBottom` spacer under its own 134pt band. So the model and the
 * screen disagree by one inset in each direction, and a ring drawn straight off the model sits a
 * notch high on the pills and a home-indicator low on the dock.
 *
 * Both corrections are zero on a viewport with no insets, which is the arrangement the rings were
 * confirmed correct on — so this cannot regress that, and it fixes every device that has a notch.
 */
export function ringRect(
  control: Rect & { readonly surface: 'dock' | 'header' },
  insets: { readonly top: number; readonly bottom: number },
): Rect {
  const dy = control.surface === 'header' ? insets.top : -insets.bottom;
  return { x: control.x, y: control.y + dy, width: control.width, height: control.height };
}
