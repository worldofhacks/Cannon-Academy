/**
 * A-005 — beat 20's send-off fills the phone it is on, and rides its own water.
 *
 * The owner's report: *"the ready captain screen does not appear to fill the screen and also it
 * looks very ugly compared to the rest of the application."* Both halves are one cause and it is
 * arithmetic, not taste.
 *
 * The screen used to place every element with an absolute offset measured against the board's own
 * 667pt frame — `top: 96` for the headline, `bottom: 186` for the boat, `bottom: 120` for the
 * badges, a flat `150`pt sea. An offset from the bottom of a fixed frame is a constant *about that
 * frame*: on a 932pt phone it leaves 411pt of empty sky and floats the boat 41pt above the water it
 * is supposed to be sitting on; on a 640pt Android the same numbers crowd. `THE OLD SEND-OFF` below
 * reproduces that layout exactly and the counterexample block measures it, so this file cannot
 * become a test that would also have passed on the build being replaced.
 *
 * Asserted geometrically rather than by screenshot, and at four very different shapes, because the
 * failure is an interaction between three scales that no single viewport can show: ART sizes the
 * ship and the padding, TYPE sizes the headline's line box, and the elastic gaps take up whatever
 * the two leave. Three earlier layout bugs on this project reached a device because one screenshot
 * at one size looked fine.
 *
 * What this does NOT cover, said plainly: whether the composition is beautiful. It covers whether
 * it fits, whether anything overlaps anything, whether the boat is in the water rather than above
 * it, and whether the content grows with the box instead of sitting in the middle of a bigger one.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { intersects, type Rect } from '../../src/components/onboarding/coachBand';
import {
  READY,
  READY_MOTION,
  readySailDelay,
  readySceneLayout,
  readySettleMs,
} from '../../src/components/onboarding/readyLayout';
import { computeLayout, WORLD_BOARD_MAX_WIDTH } from '../../src/theme/responsive';
import { MIN_TAP_TARGET, motion } from '../../src/theme/tokens';

const source = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../../${relative}`, import.meta.url)), 'utf8');

/**
 * The four the ticket names, with the safe areas each of them really has. The tablet is included
 * because it is where a phone composition most easily degenerates into an island of content in the
 * middle of an ocean of nothing — which is the same defect as the one being fixed, one size up.
 */
const SHAPES = [
  { label: 'iPhone SE 375×667', w: 375, h: 667, top: 20, bottom: 0 },
  { label: 'iPhone 15 390×844', w: 390, h: 844, top: 59, bottom: 34 },
  { label: 'Pro Max 430×932', w: 430, h: 932, top: 59, bottom: 34 },
  { label: 'tablet 768×1024', w: 768, h: 1024, top: 24, bottom: 20 },
] as const;

const resolve = (shape: (typeof SHAPES)[number]) => {
  const L = computeLayout(shape.w, shape.h);
  return {
    L,
    layout: readySceneLayout({
      width: shape.w,
      height: shape.h,
      art: L.art,
      type: L.type,
      insetTop: shape.top,
      insetBottom: shape.bottom,
    }),
  };
};

/** The bands the component renders, in the order it renders them. */
const bandsOf = (
  layout: ReturnType<typeof readySceneLayout>,
  shape: { readonly top: number; readonly bottom: number },
): readonly (readonly [string, number])[] => [
  ['inset + top pad', shape.top + layout.topPad],
  ['headline', layout.headline.height],
  ['sky gap', layout.skyGap],
  ['ship', layout.ship.height],
  ['sea gap', layout.seaGap],
  ['badges', layout.badges.height],
  ['badges → Sail!', layout.badgesToSail],
  ['Sail!', layout.sail.height],
  ['bottom pad + inset', layout.bottomPad + shape.bottom],
];

describe('A-005 the send-off fills its box', () => {
  it('spec(A-005:AC-3) the column’s bands sum to the measured box, at four viewports', () => {
    for (const shape of SHAPES) {
      const { layout } = resolve(shape);

      // The whole of the fix: there is no slack left over and nothing runs past the bottom, because
      // the two elastic gaps are defined as what is left rather than as measured constants.
      const total = bandsOf(layout, shape).reduce((sum, [, height]) => sum + height, 0);
      expect(total, `${shape.label}: the column does not fill the box`).toBeCloseTo(shape.h, 5);
      expect(layout.overflow, `${shape.label}: the composition overflows the box`).toBe(0);

      // And the last band really does end on the last point — the same fact from the other side, so
      // a sum that balanced by cancelling two errors would still be caught.
      expect(
        layout.sail.y + layout.sail.height + layout.bottomPad + shape.bottom,
        `${shape.label}: the Sail! button does not land on the bottom inset`,
      ).toBeCloseTo(shape.h, 5);
      // Nothing is pushed under a notch or a home indicator.
      expect(layout.headline.y).toBeGreaterThanOrEqual(shape.top);
      expect(layout.sail.y + layout.sail.height).toBeLessThanOrEqual(shape.h - shape.bottom + 0.001);
    }
  });

  it('spec(A-005:AC-3) the water is flush to the bottom and the boat is sitting in it', () => {
    for (const shape of SHAPES) {
      const { layout, L } = resolve(shape);

      expect(layout.sea.y + layout.sea.height, `${shape.label}: the sea is not bottom-anchored`).toBeCloseTo(
        shape.h,
        5,
      );
      expect(layout.sea.width).toBe(shape.w);

      // The horizon crosses the hull. Above the ship's bottom edge and below its top: a sea line
      // outside that range is either a boat in the sky or a boat under the sea, and the first is
      // exactly what the old offsets drew.
      expect(layout.sea.y, `${shape.label}: the horizon is above the ship`).toBeGreaterThan(layout.ship.y);
      expect(layout.sea.y, `${shape.label}: the boat floats above its own water`).toBeLessThan(
        layout.ship.y + layout.ship.height,
      );

      // And it crosses at the duel's own depth, so the send-off's boat sits in the water exactly as
      // deep as the boat in every duel the child has just fought.
      const dip = layout.ship.y + layout.ship.height - layout.sea.y;
      expect(dip / layout.ship.width, `${shape.label}: the hull rides at a depth the duel never draws`).toBeCloseTo(
        READY.ship.dip / READY.ship.grid.width,
        5,
      );

      // The headline is in the sky and the tally is on the water — the composition, as a claim.
      expect(layout.headline.y + layout.headline.height).toBeLessThanOrEqual(layout.sea.y);
      expect(layout.badges.y).toBeGreaterThanOrEqual(layout.sea.y);
      expect(layout.sail.y).toBeGreaterThanOrEqual(layout.sea.y);

      // The horizon lands in the same neighbourhood on every phone rather than drifting with the
      // frame. The old flat 150pt sea is 22% of an SE and 16% of a Pro Max.
      const share = layout.sea.height / shape.h;
      expect(share, `${shape.label}: the sea is ${(share * 100).toFixed(1)}% of the screen`).toBeGreaterThan(
        0.4,
      );
      expect(share, `${shape.label}: the sea is ${(share * 100).toFixed(1)}% of the screen`).toBeLessThan(
        0.55,
      );
      expect(L.art).toBeGreaterThan(0);
    }
  });

  it('spec(A-005:AC-3) no two bands overlap, and none of them leaves the frame', () => {
    for (const shape of SHAPES) {
      const { layout } = resolve(shape);
      const boxes: readonly (readonly [string, Rect])[] = [
        ['the headline', layout.headline],
        ['the ship', layout.ship],
        ['the badges', layout.badges],
        ['the Sail! button', layout.sail],
      ];

      for (let a = 0; a < boxes.length; a += 1) {
        for (let b = a + 1; b < boxes.length; b += 1) {
          expect(
            intersects(boxes[a]![1], boxes[b]![1]),
            `${shape.label}: ${boxes[a]![0]} overlaps ${boxes[b]![0]}`,
          ).toBe(false);
        }
      }

      for (const [name, rect] of boxes) {
        expect(rect.x, `${shape.label}: ${name} starts off the left edge`).toBeGreaterThanOrEqual(-0.001);
        expect(
          rect.x + rect.width,
          `${shape.label}: ${name} runs past the right edge`,
        ).toBeLessThanOrEqual(shape.w + 0.001);
        expect(rect.width, `${shape.label}: ${name} has no width`).toBeGreaterThan(0);
        expect(rect.height, `${shape.label}: ${name} has no height`).toBeGreaterThan(0);
      }

      // The elastic gaps keep their reserved air rather than collapsing to a hairline.
      const minGap = READY.minGap * computeLayout(shape.w, shape.h).art;
      expect(layout.skyGap, `${shape.label}: the sky gap collapsed`).toBeGreaterThanOrEqual(minGap);
      expect(layout.seaGap, `${shape.label}: the sea gap collapsed`).toBeGreaterThanOrEqual(minGap);
    }
  });

  it('spec(A-005:AC-3) the composition grows with the box instead of floating in a bigger one', () => {
    for (const shape of SHAPES) {
      const { layout } = resolve(shape);

      // "Fills" is not only "sums to the height" — a 3pt band and a 600pt gap sum too. The drawn
      // content has to keep its share of the screen as the screen grows, which is the difference
      // between a responsive composition and a phone screenshot centred on a tablet.
      const content =
        layout.headline.height + layout.ship.height + layout.badges.height + layout.sail.height;
      const share = content / shape.h;
      expect(
        share,
        `${shape.label}: the drawn content is only ${(share * 100).toFixed(1)}% of the screen`,
      ).toBeGreaterThanOrEqual(0.45);

      // The ship is the band that carries that growth, and it is capped so a tablet gets a
      // composition rather than a zoom.
      expect(layout.ship.width).toBeGreaterThanOrEqual(READY.ship.minWidth * 0.92);
      expect(layout.ship.width).toBeLessThanOrEqual(shape.w * READY.ship.widthFraction + 0.001);
      expect(layout.ship.height / layout.ship.width).toBeCloseTo(
        READY.ship.grid.height / READY.ship.grid.width,
        5,
      );
      // The reading column is capped by the app's existing world-board ceiling, not by a new one.
      expect(layout.sail.width).toBeLessThanOrEqual(WORLD_BOARD_MAX_WIDTH);
      expect(layout.headline.width).toBe(layout.sail.width);
    }
  });

  it('spec(A-005:AC-3) the Sail! button keeps the tap floor and the tally row keeps its gutters', () => {
    for (const shape of SHAPES) {
      const { layout } = resolve(shape);

      expect(
        layout.sail.height,
        `${shape.label}: Sail! is below the ${MIN_TAP_TARGET}pt floor`,
      ).toBeGreaterThanOrEqual(MIN_TAP_TARGET);

      // Four tiles and three gutters, centred, inside the frame — the row a screenshot at 375
      // cannot tell apart from one that clips at 360.
      expect(layout.badges.width).toBeCloseTo(
        layout.badge * READY.badgeCount + layout.badgeGap * (READY.badgeCount - 1),
        5,
      );
      expect(layout.badges.x).toBeGreaterThan(0);
      expect(layout.badges.x + layout.badges.width).toBeLessThan(shape.w);
    }
  });

  it('spec(A-005:AC-3) a box too short for the boat shrinks the boat, never the rest', () => {
    // Not a device — a deliberately short box, because the branch that makes "no overlap" true by
    // construction rather than by luck is the one that gives the ship's size up first. Without it a
    // short box would push the headline off the top, which is the failure mode the old absolute
    // offsets had in the other direction.
    const short = { width: 375, height: 460, art: 1, type: 1, insetTop: 0, insetBottom: 0 } as const;
    const layout = readySceneLayout(short);
    const roomy = readySceneLayout({ ...short, height: 667 });

    expect(layout.overflow).toBe(0);
    expect(layout.ship.height, 'the ship did not give up size for the short box').toBeLessThan(
      roomy.ship.height,
    );
    expect(layout.headline.y).toBe(roomy.headline.y);
    expect(layout.headline.height).toBe(roomy.headline.height);
    expect(layout.sail.height).toBe(roomy.sail.height);
    expect(layout.badges.height).toBe(roomy.badges.height);
    expect(layout.skyGap).toBeGreaterThanOrEqual(READY.minGap);
    expect(layout.seaGap).toBeGreaterThanOrEqual(READY.minGap);
    expect(
      layout.sail.y + layout.sail.height + layout.bottomPad,
      'the short box does not fill either',
    ).toBeCloseTo(short.height, 5);
  });
});

/**
 * The layout being replaced, transcribed from the file it was deleted from.
 *
 * A no-overlap-and-fills test that would ALSO have passed on the broken build proves nothing, so
 * the defect is measured here rather than described. These are the four offsets that shipped:
 * headline `top: 96`, ship `bottom: 186` at 140×112, badges `bottom: 120` at 56, sea `height: 150`,
 * `Sail!` `bottom: 32` at 76 — every one of them art-scaled off a 667pt frame.
 */
const THE_OLD_SEND_OFF = (shape: (typeof SHAPES)[number]) => {
  const art = computeLayout(shape.w, shape.h).art;
  const type = computeLayout(shape.w, shape.h).type;
  const px = (n: number) => n * art;
  const headline = { x: 0, y: px(96), width: shape.w, height: 2 * 32 * type };
  const ship = { x: 0, y: shape.h - px(186) - px(112), width: px(140), height: px(112) };
  const badges = { x: 0, y: shape.h - px(120) - px(56), width: shape.w, height: px(56) };
  const sea = { x: 0, y: shape.h - px(150), width: shape.w, height: px(150) };
  return { headline, ship, badges, sea };
};

describe('A-005 the send-off that shipped really was broken', () => {
  it('spec(A-005:AC-3) the old offsets float the boat above the water on every phone', () => {
    for (const shape of SHAPES) {
      const old = THE_OLD_SEND_OFF(shape);
      const gap = old.sea.y - (old.ship.y + old.ship.height);

      // The whole hull is above the sea's top edge — the boat is in the sky. This is the assertion
      // the rebuilt layout passes and the old one cannot, and it is why `sea.y` is now derived from
      // the ship's own keel instead of declared beside it.
      expect(gap, `${shape.label}: the old boat was already in the water, so this proves nothing`).toBeGreaterThan(
        0,
      );
    }
  });

  it('spec(A-005:AC-3) the old offsets leave a quarter of a tall phone empty', () => {
    for (const shape of SHAPES) {
      const old = THE_OLD_SEND_OFF(shape);
      const dead = old.ship.y - (old.headline.y + old.headline.height);
      const share = dead / shape.h;

      // The owner's "does not appear to fill the screen", as a number. The taller the phone the
      // worse it gets, because every offset is measured from an end of a 667pt frame and the extra
      // height all lands in the middle.
      expect(
        share,
        `${shape.label}: only ${(share * 100).toFixed(1)}% dead sky, so the counterexample is too weak`,
      ).toBeGreaterThan(0.25);

      // And the sea never grows with the phone the way the rebuilt one does.
      expect(old.sea.height / shape.h).toBeLessThan(0.3);
    }
  });

  it('spec(A-005:AC-3) the rebuilt layout fixes exactly those two things at the same viewports', () => {
    for (const shape of SHAPES) {
      const { layout } = resolve(shape);
      const dead = layout.ship.y - (layout.headline.y + layout.headline.height);
      expect(dead / shape.h, `${shape.label}: the rebuild kept the dead sky`).toBeLessThan(0.25);
      expect(layout.sea.height / shape.h).toBeGreaterThan(0.3);
    }
  });
});

/**
 * A-005 — the send-off's motion, which is three beats and deliberately not more.
 *
 * Restraint is the specification here, not an aesthetic note: this is the last frame of onboarding
 * and a screen where everything moves has nothing to look at. So the budget is asserted rather than
 * described, and it is spent inside a beat the app has already published.
 */
describe('A-005 the send-off’s arrival', () => {
  it('spec(A-005:AC-3) the whole arrival settles inside one published beat, in order', () => {
    // Ship, then badges, then the button — and the last thing to move is the one that says "go".
    expect(READY_MOTION.badgeLead).toBeGreaterThan(0);
    expect(
      READY_MOTION.badgeLead,
      'the first badge waits for the ship to finish, so the three beats read as three screens',
    ).toBeLessThan(READY_MOTION.shipArrive);

    const badgeDelays = Array.from(
      { length: READY.badgeCount },
      (_, i) => READY_MOTION.badgeLead + i * READY_MOTION.badgeStagger,
    );
    for (let i = 1; i < badgeDelays.length; i += 1) {
      expect(badgeDelays[i]!).toBeGreaterThan(badgeDelays[i - 1]!);
    }
    expect(readySailDelay).toBeGreaterThan(badgeDelays[badgeDelays.length - 1]!);

    // The budget: nothing on this screen is still moving after `motion.beat.shot`, the app's
    // longest one-shot beat. `badgeLead` is derived from that ceiling rather than chosen, which is
    // what keeps it from being a magic number.
    expect(readySettleMs).toBe(motion.beat.shot);
    expect(READY_MOTION.shipArrive).toBe(motion.beat.screen);
    expect(READY_MOTION.pop.up + READY_MOTION.pop.settle, 'this is no longer hr-pop').toBe(220);
    expect(READY_MOTION.badgeStagger, 'this is no longer hr-coin-in’s stagger').toBe(80);
  });
});

/**
 * A-005 — and the screen really is built from the model and the app's own parts.
 *
 * The geometry above is only worth anything if the component renders it. These read the source for
 * the same reason `design-fidelity.test.ts` does: what is being asserted is *which expression is
 * passed*, and a value test would pass while the wiring stayed wrong.
 */
describe('A-005 the send-off is built from the app, not for itself', () => {
  const overlay = () => source('src/components/onboarding/ChartWalkthrough.tsx');

  it('spec(A-005:AC-3) it flies the captain’s own ship, on the chart’s own water', () => {
    const src = overlay();

    // The app's real 14-layer rig, not a screen-local boat.
    expect(src).toMatch(/import \{ Ship, type ShipCosmetics \} from '\.\.\/duel\/Ship'/);
    expect(src).toMatch(/<Ship\b/);
    // Wearing the equipped skin and the flag chosen at beat 4 — board 5b's promise, closed here.
    expect(src).toMatch(/shipCosmeticsForCaptain\(captain\)/);
    // The chart's radial gradient, so the send-off hands over to the sea it is handing over to.
    expect(src).toMatch(/import \{ SeaWater \} from '\.\.\/chart\/Sea'/);
    expect(src).toMatch(/<SeaWater\b/);

    // The simplified boat is gone, not merely unused. The EXECUTABLE forms, not the word — the
    // file's own docblock explains why it was deleted, and a prose mention is evidence for the
    // rule rather than against it (the same distinction `design-fidelity.test.ts` draws about the
    // compass).
    expect(src, 'ReadyShip is still declared').not.toMatch(/function ReadyShip/);
    expect(src, 'ReadyShip is still rendered').not.toMatch(/<ReadyShip/);
    expect(src, 'the Poly import outlived the shape that needed it').not.toMatch(/from '\.\.\/Poly'/);
  });

  it('spec(A-005:AC-3) the send-off lays itself out from the model, never from frame offsets', () => {
    const src = overlay();

    expect(src).toMatch(/readySceneLayout\(/);
    // The four offsets that caused the defect, asserted as absences. A screen that still measured
    // itself from the bottom of a 667pt frame would satisfy every arithmetic test in this file and
    // still not fill a Pro Max.
    for (const offset of ['px(186)', 'px(120)', 'px(96)', 'px(150)']) {
      expect(src, `the send-off still positions with ${offset}`).not.toContain(offset);
    }
    expect(src, 'the send-off still has its own px() frame scaler').not.toMatch(
      /const px = \(n: number\) => n \* artScale/,
    );
  });

  it('spec(A-005:AC-3) Sail! is still the app’s only way out of onboarding', () => {
    const src = overlay();
    // Guarded here as well as in `onboarding-wiring.test.ts`, because a rebuild of this screen is
    // exactly when a second exit gets added by accident. The CALL, not the word — the docblocks
    // above and below `ReadyScene` both name the action, and they are the reason it stays single.
    expect(src.match(/captainActions\(\)\.completeOnboarding\(\)/g)).toHaveLength(1);
    expect(src).toMatch(/accessibilityLabel="Sail, finish the tour"/);
  });

  it('spec(A-005:AC-3) and its arrival can never leave it undrawn', () => {
    const src = overlay();

    // Found on web, and it is the failure this whole screen cannot afford: `hr-pop` hides its
    // subject until its delay elapses (`opacity: scale < .8 ? 0 : 1`), so an animation that stalls
    // — a backgrounded tab throttling rAF is enough — leaves a child at the end of onboarding with
    // no visible way out. Fine for a badge; not for the app's single exit.
    const settle = src.slice(src.indexOf('function Settle'));
    expect(settle.length, 'the Sail! button no longer has its own arrival').toBeGreaterThan(0);
    const body = settle.slice(0, settle.indexOf('\n}\n'));
    expect(body, 'the Sail! button’s arrival animates opacity again').not.toMatch(/opacity/);

    // It waits visible rather than invisible, and 8% is the whole distance it can be wrong by.
    expect(READY_MOTION.settleFrom).toBeGreaterThanOrEqual(0.9);
    expect(READY_MOTION.settleFrom).toBeLessThan(1);
    expect(src).toMatch(/<Settle delay=\{readySailDelay\}>/);
    // The badges keep the fade — nothing is lost if one of them never arrives.
    expect(src).toMatch(/opacity: t\.value < 0\.8 \? 0 : 1/);
  });
});
