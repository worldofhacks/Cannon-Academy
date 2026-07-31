/**
 * Beat 20's geometry — the send-off, as arithmetic.
 *
 * Pure, and separated from `ChartWalkthrough.tsx` for the same reason `coachBand.ts` is: RN's entry
 * point is Flow-typed and the node runner cannot parse it, so a number that lives in a component is
 * a number no test can check. Every value below is swept across four viewports by
 * `__tests__/app/ready-scene.test.ts`.
 *
 * ## The defect this file exists to close
 *
 * The send-off used to position everything with absolute offsets measured against the board's own
 * 667pt frame — `bottom: 186` for the ship, `bottom: 120` for the badges, `top: 96` for the
 * headline, a flat `150` of sea. Offsets like that are constants *about one screen height*. On a
 * 932pt phone they left 411pt of empty sky between the headline and a boat floating 41pt above its
 * own water; on a 640pt Android the same numbers crowd. The owner's report — *"does not appear to
 * fill the screen"* — is exactly that arithmetic.
 *
 * So nothing here is measured from the bottom of a 667pt frame. The column is:
 *
 *     insetTop · topPad · headline · SKY GAP · ship · SEA GAP · badges · gap · Sail! · botPad · insetBottom
 *
 * every fixed term is content-sized, and the two elastic gaps absorb whatever height is left, 3:2.
 * `readySceneLayout` returns the resolved band for each, and the component renders those bands as a
 * flex column — so the sum is the box height by construction rather than by coincidence, and
 * `spec(A-005:AC-3) the send-off fills its box` can assert it at 375×667 through 768×1024.
 *
 * ## Why the sea is derived and not declared
 *
 * The horizon is not an independent number: it is *where the ship's hull meets the water*. Declaring
 * both is what let the board's boat float. So the sea's top is `ship bottom − dip`, and `dip` is the
 * duel's own relationship — `SeaStage` draws a 150pt ship whose box bottom sits 32pt below the sea's
 * top edge, and that ratio is reproduced here at any ship size. The send-off's water therefore sits
 * on a ship exactly the way every duel's does.
 */
import { WORLD_BOARD_MAX_WIDTH } from '../../theme/responsive';
import { MIN_TAP_TARGET, motion } from '../../theme/tokens';
import type { Rect } from './coachBand';

/**
 * The send-off's design points, at the 375×667 board.
 *
 * `headlineLine`, `headlineLines` and nothing else follow TYPE; every other term is drawn and
 * follows ART. That split is `responsive.ts`'s governing rule, and it is the reason this is
 * arithmetic rather than a table: on a short viewport the drawn ship shrinks with `art` while the
 * headline's line box stays near `type`, and the gaps between them have to take up the difference.
 */
export const READY = {
  /** Page inset for the headline and the `Sail!` button. */
  sidePad: 20,
  topPad: 24,
  bottomPad: 24,
  /** `type.display` at the send-off's 26pt, whose line box is 32. */
  headlineLine: 32,
  /** `readyHeadline` wraps at two lines — "Ready, Captain Bartholomew!" on a 360pt Android. */
  headlineLines: 2,
  /** The board's four 56pt tiles, and the 12pt gutter between them. */
  badge: 56,
  badgeGap: 12,
  badgeCount: 4,
  badgesToSail: 16,
  /** The board's `Sail!` slab. Floored at `MIN_TAP_TARGET` by `readySceneLayout`, never below it. */
  sail: 76,
  ship: {
    /**
     * The ship grows with the phone and then stops. Past ~240pt the send-off stops reading as a
     * composition and starts reading as a zoom — the same judgement `WORLD_BOARD_MAX_WIDTH` makes
     * for the chart's board.
     */
    maxWidth: 240,
    /** …but never more than this share of the box, so a narrow phone does not get a clipped hull. */
    widthFraction: 0.62,
    /** The floor. Below this the rigging stops resolving and it is a smudge with a flag. */
    minWidth: 120,
    /** `Ship.tsx`'s own design grid: a 150pt ship is 124pt tall, pennant to keel. */
    grid: { width: 150, height: 124 },
    /**
     * How far the hull sits below the horizon, in the same 150-grid.
     *
     * `SeaStage` puts the player's box bottom at `bottom: 26` of a stage whose sea band is 58 tall,
     * so the hull bottom is `58 − 26 = 32` below the water's top edge at a 150pt ship. Borrowed
     * rather than invented: the send-off's boat should sit in the water exactly as deep as the boat
     * in every duel the child has just fought.
     */
    dip: 32,
  },
  /**
   * How the leftover height is split between the two elastic gaps: 3 above the ship, 2 below it.
   *
   * Not 1:1. The sky is the band the headline breathes in and the sea band below the ship already
   * carries the badges and the button, so an even split reads bottom-heavy — the boat sinks toward
   * its own tally instead of sitting on the horizon.
   */
  skyWeight: 3,
  seaWeight: 2,
  /** The least air either elastic gap may be squeezed to before the ship gives up size instead. */
  minGap: 8,
} as const;

/**
 * The arrival, in milliseconds.
 *
 * Three beats and no more. Board rule ONE THING applies to motion as much as to spotlights: a
 * screen where everything moves has nothing to look at. So the ship arrives, the four badges count
 * themselves in, and the button settles last — which is what makes the last frame read as *now go*
 * rather than as a screen that happens to have a button on it. The headline, the sea and the clouds
 * never move; the ship's own bob, luff and wake loops are `Ship.tsx`'s and are left alone.
 *
 * Every duration below is a curve the app has already published:
 *
 *   `shipArrive`   `motion.beat.screen` — the app's screen-transition beat.
 *   `pop`          the Harbor's `hr-pop`, 220ms as 132 up + 88 settle, unchanged.
 *   `badgeStagger` the Harbor's `hr-coin-in` stagger, 80ms, unchanged.
 *
 * `badgeLead` is the one number with no board of its own, and it is DERIVED rather than chosen: the
 * whole arrival is budgeted to land inside `motion.beat.shot` (700ms), the app's longest one-shot
 * beat, so the lead is whatever is left once the stagger and the button's own pop are subtracted.
 * At the current values that is 160ms — the first badge starts while the ship is still arriving,
 * which is what keeps the three beats reading as one gesture instead of three.
 */
const POP = { up: 132, settle: 88 } as const;
const POP_MS = POP.up + POP.settle;
const BADGE_STAGGER = 80;

export const READY_MOTION = {
  shipArrive: motion.beat.screen,
  /** Design px the ship rises through as it arrives — a swell's worth, not an entrance. */
  shipRise: 28,
  pop: POP,
  badgeStagger: BADGE_STAGGER,
  badgeLead: motion.beat.shot - POP_MS - BADGE_STAGGER * READY.badgeCount,
  /**
   * The scale the `Sail!` button waits at, and the reason it is `.92` rather than `hr-pop`'s `.72`.
   *
   * `hr-pop` hides its subject until its delay elapses — `opacity: scale < .8 ? 0 : 1` — which is
   * right for a badge and unacceptable for this button. `Sail!` is the app's ONLY caller of the
   * store's `completeOnboarding` action — the call itself lives in `ChartWalkthrough.tsx` and is
   * asserted to live nowhere else — so a frame in which the button is not drawn is a frame in which
   * a child has no way out of onboarding, and an animation that never runs makes that permanent.
   * A backgrounded tab throttling `requestAnimationFrame` is enough to reproduce it, and it was.
   *
   * So the button never animates opacity. It is on screen, tappable, from the first frame, and the
   * delayed beat only settles the last 8% of its size — the same curve, spent where failing open
   * costs nothing.
   */
  settleFrom: 0.92,
} as const;

/** When the `Sail!` button begins its own pop: after the last badge has started. */
export const readySailDelay = READY_MOTION.badgeLead + READY_MOTION.badgeStagger * READY.badgeCount;

/** When the last thing on the screen stops moving. Budgeted to `motion.beat.shot`. */
export const readySettleMs = readySailDelay + POP_MS;

export interface ReadySceneInput {
  /** The MEASURED box, not the window — the overlay is a child of the chart's own column. */
  readonly width: number;
  readonly height: number;
  /** `L.art` and `L.type`, taken separately. See `READY`. */
  readonly art: number;
  readonly type: number;
  readonly insetTop: number;
  readonly insetBottom: number;
}

export interface ReadySceneLayout {
  readonly headline: Rect;
  readonly ship: Rect;
  readonly badges: Rect;
  /** One tile's side, and the gutter between two of them. */
  readonly badge: number;
  readonly badgeGap: number;
  readonly sail: Rect;
  /** The water, always flush to the bottom of the box. */
  readonly sea: Rect;
  /** The resolved elastic gaps — the numbers the flex column actually renders. */
  readonly skyGap: number;
  readonly seaGap: number;
  /** Fixed bands, exported so the column and this model cannot disagree about them. */
  readonly topPad: number;
  readonly badgesToSail: number;
  readonly bottomPad: number;
  /**
   * Points the composition could not fit. Zero on every viewport the app supports; non-zero is the
   * honest report of a box too short for the content, not a silently overlapping screen.
   */
  readonly overflow: number;
}

/**
 * The send-off's bands, resolved for one measured box.
 *
 * Bottom-up would be the natural way to write this and it is deliberately not: the ship is the only
 * band that may change SIZE to make the composition fit, so the fixed terms are summed first, the
 * ship takes what is left up to its natural size, and only then is the remainder shared out. Written
 * the other way round, a short box pushes the headline off the top instead of drawing a smaller boat.
 */
export function readySceneLayout(input: ReadySceneInput): ReadySceneLayout {
  const a = (designPx: number): number => designPx * input.art;
  const t = (designPx: number): number => designPx * input.type;

  const width = Math.max(0, input.width);
  const height = Math.max(0, input.height);

  // The headline and the button share one column, capped so a tablet gets a composition rather than
  // a 700pt-wide slab. `WORLD_BOARD_MAX_WIDTH` is the app's existing "do not stretch the phone
  // board past this" number, used unscaled because it is already a ceiling.
  const side = a(READY.sidePad);
  const contentWidth = Math.max(0, Math.min(width - side * 2, WORLD_BOARD_MAX_WIDTH));
  const contentX = (width - contentWidth) / 2;

  const topPad = a(READY.topPad);
  const bottomPad = a(READY.bottomPad);
  const badgesToSail = a(READY.badgesToSail);
  const headlineHeight = READY.headlineLines * t(READY.headlineLine);
  const badge = a(READY.badge);
  const badgeGap = a(READY.badgeGap);
  const badgesWidth = badge * READY.badgeCount + badgeGap * (READY.badgeCount - 1);
  // `max`, not the scaled value: the button IS the tap target, and a target that shrank with the art
  // scale on a small phone would drop under the floor on exactly the devices that need it most.
  const sailHeight = Math.max(a(READY.sail), MIN_TAP_TARGET);

  const fixed =
    input.insetTop +
    topPad +
    headlineHeight +
    badge +
    badgesToSail +
    sailHeight +
    bottomPad +
    input.insetBottom;

  const aspect = READY.ship.grid.height / READY.ship.grid.width;
  const natural = Math.min(width * READY.ship.widthFraction, a(READY.ship.maxWidth));
  // What is left for the boat once the fixed bands and the two gaps' minimum air are spoken for.
  //
  // Reserving `2 × minGap` is NOT enough, and the arithmetic is the sort that is wrong by exactly
  // one term: the leftover is shared 3:2, so the SMALLER share is two fifths of it, and reserving
  // 16 for a 3:2 split hands the sea gap 6.4. What has to be reserved is whatever makes the
  // smaller share reach the floor — `minGap × totalWeight / smallerWeight`.
  const weight = READY.skyWeight + READY.seaWeight;
  const gapReserve = (a(READY.minGap) * weight) / Math.min(READY.skyWeight, READY.seaWeight);
  const room = height - fixed - gapReserve;
  const shipWidth = Math.max(
    // The floor cannot exceed the natural size, or a narrow phone would be handed a ship wider than
    // the box it has to fit in.
    Math.min(natural, a(READY.ship.minWidth)),
    Math.min(natural, Math.max(0, room) / aspect),
  );
  const shipHeight = shipWidth * aspect;

  const slack = height - fixed - shipHeight;
  const free = Math.max(0, slack);
  const skyGap = (free * READY.skyWeight) / weight;
  const seaGap = free - skyGap;

  const headlineY = input.insetTop + topPad;
  const shipY = headlineY + headlineHeight + skyGap;
  const badgesY = shipY + shipHeight + seaGap;
  const sailY = badgesY + badge + badgesToSail;

  // The horizon, derived from the hull rather than declared beside it — see the header.
  const seaY = shipY + shipHeight - (shipWidth * READY.ship.dip) / READY.ship.grid.width;

  return {
    headline: { x: contentX, y: headlineY, width: contentWidth, height: headlineHeight },
    ship: { x: (width - shipWidth) / 2, y: shipY, width: shipWidth, height: shipHeight },
    badges: { x: (width - badgesWidth) / 2, y: badgesY, width: badgesWidth, height: badge },
    badge,
    badgeGap,
    sail: { x: contentX, y: sailY, width: contentWidth, height: sailHeight },
    sea: { x: 0, y: seaY, width, height: Math.max(0, height - seaY) },
    skyGap,
    seaGap,
    topPad,
    badgesToSail,
    bottomPad,
    overflow: Math.max(0, -slack),
  };
}
