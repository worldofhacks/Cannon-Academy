/**
 * Design fidelity, as a frozen test.
 *
 * The owner approved deferring component-level screen tests ON CONDITION that pixel fidelity is
 * held by some other mechanism. This is that mechanism, and it is deliberately not a screenshot
 * eyeball: the design's own **computed geometry** is captured into `design/fixtures/*.json` by
 * measuring the rendered board, and the app's style constants are asserted against it here — in
 * node, under the vitest setup that already exists, with no component harness at all.
 *
 * What this catches that a screenshot review does not: a 2pt radius drift that no human notices
 * per-screen but which makes the whole app feel subtly unlike the design. It caught exactly two on
 * the first run — the glyph tile radius (14 vs the design's 16) and the sheet's top radius (20 vs
 * 22) — both of which had survived a visual review.
 *
 * What it does NOT catch, stated plainly so nobody over-trusts it: layout that is correct in
 * constants and wrong in composition. A card with the right radius in the wrong place passes here.
 * That is what the screenshot diff in each ticket's DoD is for. The two are complements.
 *
 * When the board changes, re-measure (see `design/extract-fixture.md`) and review the fixture diff.
 * A fixture edited to make a test pass is the same failure as editing a frozen test.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import fixture from '../../design/fixtures/duel-375.json';
import {
  CLOSE,
  CLOSE_NODE,
  DOCK,
  FOG_BAND,
  FRAME,
  PLACE_COUNT,
  ISLE_TAG,
  SHIP,
  TRAIL_LOOK,
  VOYAGE,
  WAYPOINT_ART,
  WAYPOINT_GATE,
  WAYPOINT_ROUTE,
  islandGlyph,
  nodeCentre,
  trailDots,
} from '../../src/components/chart/board';
import {
  closeChartColumns,
  closeChartSlots,
  focusIndex,
  targetSlop,
} from '../../src/components/chart/layout';
import { islands } from '../../src/content';
import { chartNodes } from '../../src/services/chart';
import { emptyCaptain } from '../../src/stores/player';
import { chartHubControlLayout } from '../../src/services/flow';
import { DAMAGE_BAND_SEGMENTS } from '../../src/theme/cannonPresentation';
import { REFERENCE, seaStageHeight } from '../../src/theme/responsive';
// Namespace import on purpose: the tokens module exports a member literally named `type`, which
// collides with TypeScript's inline `import { type X }` modifier and fails to parse as a named
// import here. Worth renaming that export eventually — it is a footgun at every call site.
import * as tokens from '../../src/theme/tokens';

const { MIN_TAP_TARGET, radius, type } = tokens;

describe('design fidelity — duel screen vs the measured board', () => {
  it('spec(A-013:AC-4) uses the board reference frame', () => {
    expect(REFERENCE.width).toBe(fixture.frame.width);
    expect(REFERENCE.height).toBe(fixture.frame.height);
  });

  it('spec(A-013:AC-4) the sea stage matches the board at the reference height', () => {
    const layout = {
      width: fixture.frame.width,
      height: fixture.frame.height,
      type: 1,
      art: 1,
      gutter: 12,
      isNarrow: false,
      isShort: true,
      isTall: false,
      a: (n: number) => n,
      t: (n: number) => n,
    };
    // The stage is a proportion of height, so at the reference frame it must reproduce the
    // board's own 176pt — a responsive rule that does not agree with the design at the design's
    // own size is not responsive, it is different.
    expect(seaStageHeight(layout)).toBe(fixture.seaStage.height);
  });

  it('spec(A-013:AC-4) radii match the board', () => {
    expect(radius.card).toBe(fixture.cannonRow.radius);
    expect(radius.cardInner).toBe(fixture.turnBar.radius);
    expect(radius.tileLarge).toBe(fixture.cannonGlyphTile.radius);
    expect(radius.sheet).toBe(fixture.sheet.radiusTop);
  });

  it('spec(A-013:AC-4) the damage band is segmented as drawn', () => {
    expect(DAMAGE_BAND_SEGMENTS).toBe(fixture.cannonBandTrack.segments);
  });

  it('spec(A-013:AC-4) every board type size exists in the token scale', () => {
    const tokenSizes = new Set(Object.values(type).map((t) => ('fontSize' in t ? t.fontSize : 0)));
    // The board uses sizes the tokens must be able to express. A size on the board with no token
    // is a size someone will hardcode at a call site.
    for (const size of [...fixture.type.display.sizes, ...fixture.type.body.sizes]) {
      const covered = [...tokenSizes].some((s) => Math.abs(s - size) <= 1);
      expect(covered, `no token within 1pt of the board's ${size}pt`).toBe(true);
    }
  });

  /**
   * Every display step clears its own face's line box (2026-07-31).
   *
   * A captain reported the cannon name in `CannonTray` shearing off at the top. The four Baloo
   * steps were on 1.20–1.31 ratios, carried over from the HTML boards (this very file transcribes
   * the boards' chips at `size * 1.3`, line 150) — ratios a browser fallback face survives and this
   * one does not. `includeFontPadding` is Android-only; on iOS the fix is the line box.
   *
   * The threshold is `UIFont.lineHeight` = `(ascender - descender + lineGap) / unitsPerEm`, which
   * is 1.6020 em for Baloo 2 ExtraBold — an enormous ascent for Latin because Baloo 2 is a
   * multi-script family and reserves headroom for Devanagari. It is also the exact branch condition
   * in React Native's own `Libraries/Text/Text/RCTTextShadowView.mm`:
   *
   *     if (maximumLineHeight < maximumFontLineHeight) { return; }
   *     CGFloat baseLineOffset = maximumLineHeight / 2.0 - maximumFontLineHeight / 2.0;
   *
   * At or above it RN centers the face's own box inside the line and no ink can fall outside;
   * below it RN skips centering entirely and correctness depends on which glyphs are in the word.
   *
   * **Read from the shipped TTF, not transcribed.** A hardcoded 1.602 would be a copy of the font
   * that stops being true the first time the font package is bumped — the same L-012 failure the
   * fixture-derived assertions above exist to avoid.
   */
  it('spec(A-013:AC-4) every type step clears its own font’s line box', () => {
    const metrics = fontLineBoxEm();
    const short: string[] = [];
    for (const [name, step] of Object.entries(type)) {
      if (!('fontFamily' in step) || !('lineHeight' in step)) continue;
      const em = metrics.get(step.fontFamily);
      // Only the faces this repo ships are measurable; a step on an unshipped family is a
      // different bug and `app/_layout.tsx` is where it would be caught.
      if (em === undefined) continue;
      const required = Math.ceil(step.fontSize * em);
      if (step.lineHeight < required) {
        short.push(name);
        continue;
      }
      expect(
        step.lineHeight,
        `type.${name} (${step.fontFamily} ${step.fontSize}pt) needs lineHeight >= ${required} ` +
          `(${em.toFixed(4)} em) or React Native stops centering the glyph run`,
      ).toBeGreaterThanOrEqual(required);
    }
    // The exemption is named and bounded rather than absent, so a third short step cannot join
    // quietly and a fixed one cannot leave this list stale. See the docblock above.
    expect(short.sort()).toEqual(['chip', 'eyebrow']);
  });

  /**
   * The two exempt steps, bounded.
   *
   * `chip` and `eyebrow` are Nunito at 10/13 — 1.300 against that face's 1.3640 em box, short by
   * 0.64pt. Left alone deliberately when the display steps were fixed: no clipping was reported on
   * them, they are body family rather than the Baloo family the report was about, and a point on
   * every chip moves pill geometry on every screen in the app. Bounded here so the exemption is a
   * measured 0.64pt rather than an open door — anything shorter has to come back through review.
   */
  it('spec(A-013:AC-4) the two exempt steps are short by under a point, not by a design', () => {
    const metrics = fontLineBoxEm();
    for (const name of ['chip', 'eyebrow'] as const) {
      const step = type[name];
      const em = metrics.get(step.fontFamily);
      if (em === undefined) continue;
      const shortfall = step.fontSize * em - step.lineHeight;
      expect(shortfall, `type.${name} shortfall`).toBeGreaterThan(0);
      expect(shortfall, `type.${name} shortfall`).toBeLessThan(1);
    }
  });

  it('spec(A-013:AC-4) the tap-target floor is not violated by the board itself', () => {
    // A sanity check on our own constant: if the design's own controls are smaller than the floor
    // we claim to enforce, one of the two is wrong and we should find out here, not on a device.
    expect(fixture.cannonRow.height).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
    expect(fixture.cannonGlyphTile.size).toBeGreaterThanOrEqual(MIN_TAP_TARGET - 1);
  });
});

/**
 * A-057 — the sea chart, rebuilt from `Cannon Academy Sea Chart.dc.html` (turn 9).
 *
 * The same argument as the block above, applied to a screen with no fixture file: the board is two
 * 375×667 compositions plus a `<script>` block of coordinates, and `board.ts` is the transcription.
 * What is asserted here is deliberately NOT "every number equals the board" — a table that only
 * repeats itself proves nothing. It is the arithmetic that has to CLOSE for the transcription to be
 * a design rather than a pile of measurements, plus the four places where the board contradicts
 * itself and the owner ruled.
 *
 * Composition is still screenshot evidence. These are the failures a screenshot cannot see: a dash
 * that lands 4px out of phase, a chip clipped by 16pt, a rock inside a duel's tap target.
 */
const chartSource = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../../${relative}`, import.meta.url)), 'utf8');

/** WCAG relative luminance — the same arithmetic `text-contrast.test.ts` certifies pairs with. */
function contrast(fg: string, bg: string): number {
  const luminance = (hex: string): number => {
    const h = hex.replace('#', '');
    const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const linear = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
  };
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Board 9b draws every node column with `gap: 4` and its chips at `line-height ≈ 1.3 × size`. */
const chipHeight = (size: number, padY: number): number => padY * 2 + size * 1.3;

describe('design fidelity — the sea chart vs board 9', () => {
  it('spec(A-057:AC-1) one chart, and its composition contain-fits the box the chrome leaves', () => {
    // The owner cut the close chart, so there is one map box and it is what the header and the dock
    // leave: `667 - 20 status - 134 dock`. `CLOSE.map` still records that number and nothing else.
    expect(FRAME.statusBar + CLOSE.map.height + DOCK.height).toBe(FRAME.height);

    // The composition is DECLARED at its own extent rather than clipped to the box — the board lays
    // content out past its own `overflow:hidden` map layer, which would hide the last island and
    // four waypoints. Contain-fitting instead puts the whole chain on screen, which is the entire
    // point of having one view.
    const bottom = Math.max(
      ...VOYAGE.isles.map((isle) => isle.y + isle.h + 8),
      ...VOYAGE.isleTags.map((tag) => tag.y + 52 + 4 + chipHeight(13, 4) + 4 + chipHeight(11, 2)),
      ...VOYAGE.waypoints.map((w) => w.y + WAYPOINT_ART[w.kind].h + (w.label === undefined ? 0 : 4 + chipHeight(11, 2))),
    );
    expect(VOYAGE.map.width).toBe(FRAME.width);
    expect(VOYAGE.map.height).toBeGreaterThanOrEqual(bottom);
    expect(VOYAGE.map.height).toBeLessThan(bottom + 8);
    // And it really is taller than the box, so the contain-fit is doing work rather than decorating.
    expect(VOYAGE.map.height).toBeGreaterThan(CLOSE.map.height);
  });

  it('spec(A-057:AC-1) the dock band is its four measured pieces, and flow.ts derives the same row', () => {
    // `12 padding + 26 header + 12 gap + row + 12 padding = 134`, which pins the row at 72.
    const row = DOCK.height - DOCK.padding * 2 - DOCK.headerHeight - DOCK.gap;
    expect(row).toBe(72);
    expect(row).toBeGreaterThanOrEqual(MIN_TAP_TARGET);

    const dock = chartHubControlLayout(REFERENCE).controls.filter((c) => c.surface === 'dock');
    expect(dock.map((c) => c.id)).toEqual(['range', 'gun-deck', 'duel']);
    for (const control of dock) expect(control.height).toBeCloseTo(row, 5);

    // The board's `flex: 1 / 1 / 1.2` — Fight is the primary verb and the board gives it the width.
    const [practice, guns, fight] = dock;
    expect(practice!.width).toBeCloseTo(guns!.width, 5);
    expect(fight!.width / practice!.width).toBeCloseTo(1.2, 5);

    // The row fits its band: three buttons plus two 16pt gaps inside a 12pt inset.
    const spent = dock.reduce((sum, c) => sum + c.width, 0) + DOCK.controlGap * 2;
    expect(spent).toBeCloseTo(REFERENCE.width - DOCK.padding * 2, 5);
  });

  it('spec(A-057:AC-2) every trail runs between two real node centres and none ends in open water', () => {
    // The owner's complaint, as arithmetic: *"the lines between the islands dont make any sense and
    // overlap and arent consistent."* The old board drew four rotated dashed bars with independent
    // `left/top/width/rotation`, one of which ended at (44, 280) — open water, no node, no shore.
    //
    // A trail cannot do that: every dot is computed from the two node centres it runs between, so
    // the geometry and the map are the same fact. Asserted by re-deriving it here rather than by
    // reading a table, because a table of transcribed coordinates is exactly what failed.
    const tags = VOYAGE.isleTags;
    expect(tags).toHaveLength(VOYAGE.isles.length);

    const legs = tags.slice(0, -1).map((tag, i) => {
      const from = nodeCentre(tag);
      const to = nodeCentre(tags[i + 1]!);
      return { i, from, to, dots: trailDots(i, from, to, TRAIL_LOOK.sailed.size) };
    });
    // One leg per link in the `requiresIsland` chain. Four islands' worth of links, no extras.
    expect(legs).toHaveLength(4);

    for (const leg of legs) {
      expect(leg.dots.length, `leg ${leg.i} has no dots`).toBeGreaterThanOrEqual(3);
      // Every dot lies strictly BETWEEN its two nodes — none on a node, none past one. `t` runs
      // `1/(n+1) … n/(n+1)`, so the projection onto the leg is inside (0, 1) for all of them.
      const dx = leg.to.x - leg.from.x;
      const dy = leg.to.y - leg.from.y;
      const lengthSquared = dx * dx + dy * dy;
      for (const dot of leg.dots) {
        const t = ((dot.x - leg.from.x) * dx + (dot.y - leg.from.y) * dy) / lengthSquared;
        expect(t, `leg ${leg.i} dot ${dot.index} is not between its nodes`).toBeGreaterThan(0);
        expect(t, `leg ${leg.i} dot ${dot.index} is not between its nodes`).toBeLessThan(1);
      }
      // The end a route walks toward IS a node, to the point. This is the assertion the old
      // `x/y/length/angle` table could not make about itself.
      const head = leg.dots[0]!;
      const tail = leg.dots[leg.dots.length - 1]!;
      expect(Math.hypot(head.x - leg.from.x, head.y - leg.from.y)).toBeLessThan(
        Math.hypot(dx, dy) / 2 + 26,
      );
      expect(Math.hypot(tail.x - leg.to.x, tail.y - leg.to.y)).toBeLessThan(Math.hypot(dx, dy) / 2 + 26);
    }

    // No two legs cross. Segment-vs-segment over the whole bowed polyline, at every pair — the old
    // bars crossed because nothing ever asked.
    const polyline = (leg: (typeof legs)[number]) => [leg.from, ...leg.dots, leg.to];
    const crosses = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }) => {
      const side = (p: typeof a, q: typeof a, r: typeof a) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
      return side(c, d, a) > 0 !== side(c, d, b) > 0 && side(a, b, c) > 0 !== side(a, b, d) > 0;
    };
    for (let a = 0; a < legs.length; a += 1) {
      for (let b = a + 1; b < legs.length; b += 1) {
        const A = polyline(legs[a]!);
        const B = polyline(legs[b]!);
        for (let i = 0; i < A.length - 1; i += 1) {
          for (let j = 0; j < B.length - 1; j += 1) {
            // Consecutive legs share a node, which is a touch and not a crossing.
            if (b === a + 1 && i === A.length - 2 && j === 0) continue;
            expect(crosses(A[i]!, A[i + 1]!, B[j]!, B[j + 1]!), `leg ${a} crosses leg ${b}`).toBe(false);
          }
        }
      }
    }

    // No trail dot lands on a tappable silhouette — a dot on a rival reads as part of the rival.
    for (const leg of legs) {
      for (const dot of leg.dots) {
        for (const waypoint of VOYAGE.waypoints) {
          if (WAYPOINT_ROUTE[waypoint.kind] === undefined) continue;
          const box = WAYPOINT_ART[waypoint.kind];
          const inside =
            dot.x + dot.size / 2 > waypoint.x &&
            dot.x - dot.size / 2 < waypoint.x + box.w &&
            dot.y + dot.size / 2 > waypoint.y &&
            dot.y - dot.size / 2 < waypoint.y + box.h;
          expect(inside, `leg ${leg.i} dot ${dot.index} sits on a ${waypoint.kind}`).toBe(false);
        }
      }
    }
  });

  it('spec(A-057:AC-2) every label column is centred under its own island', () => {
    // Derived, not transcribed. The board authors five `left/top` pairs and four of them are
    // already `isleCentre - width/2`; typed out by hand, an island cannot be moved without someone
    // remembering to move its name too.
    VOYAGE.isles.forEach((isle, i) => {
      const tag = VOYAGE.isleTags[i]!;
      expect(tag.w).toBe(ISLE_TAG.width);
      expect(tag.x + tag.w / 2).toBeCloseTo(isle.x + isle.w / 2, 5);
      expect(tag.y).toBe(isle.y + isle.h - ISLE_TAG.overlap);
    });
  });

  it('spec(A-057:AC-2) the fog band holds its requirement chip at the board\u2019s own height', () => {
    // The board's band is 108 with `overflow: hidden` and clips `MASTER … TO LIFT THE FOG` — the
    // only thing on the screen that says why the fog is there. It clips because the board lays the
    // group out around a 64pt TARGET box; the app draws the 44pt picture and pads the target with
    // `hitSlop`, which is what board 9d says that box is for, and the 20pt of nothing it recovers
    // is what the group was over by.
    //
    // Measured from the head the RENDERER draws. An earlier version of this test summed
    // `CLOSE_NODE.hit` instead — a box no component builds — concluded the band was 18pt short, and
    // passed a raise to 125 that pulled the fog group up into the live island's label stack. A
    // fidelity test that measures a component nobody wrote is worse than no test, because it
    // certifies the fix as well as the bug.
    const group =
      CLOSE_NODE.locked.size +
      CLOSE_NODE.gap +
      chipHeight(CLOSE_NODE.chip.size, CLOSE_NODE.chip.padY) +
      CLOSE_NODE.gap +
      chipHeight(CLOSE_NODE.smallChip.size, CLOSE_NODE.smallChip.padY);

    expect(FOG_BAND.group.top + group).toBeLessThanOrEqual(FOG_BAND.height);
    // The board's own number, unchanged — the weather is where it was measured.
    expect(FOG_BAND.height).toBe(108);
    // The band still fits inside the map it hangs off.
    expect(FOG_BAND.height).toBeLessThan(CLOSE.map.height);
  });

  it('spec(A-057:AC-9) no node column reaches the fog band, at any focus position', () => {
    // The defect this pins: the board draws ONE arrangement of the close chart and the app has to
    // draw five. In the board's own, the live island's label stack ends 8pt BELOW the fog band's
    // node and survives only by missing it sideways by about 3pt — the live column is right-
    // anchored, the fog group is centred, and the two strings happen to fit. That is a coincidence,
    // and on a fresh captain (focus 0) it stopped being one: three labels intersected.
    //
    // Asserted on the VERTICAL axis on purpose. A chip's height is arithmetic; its width is a font
    // metric neither this test nor the renderer can measure, so a horizontal rule could be written
    // but never checked. `closeChartColumns` clamps each column's top so its stack ends clear of
    // the fog group, and this holds it to that at every focus and at two very different scales.
    const frames = [
      { label: 'reference 375\u00d7667', width: 375, height: CLOSE.map.height, art: 1, type: 1 },
      // A short viewport: the composition contain-fits well under 1 while the chips inside it stay
      // near it, so every label stack swells against a layout that shrank. This is the divergence
      // that turns the board's 3pt of sideways luck into an overlap.
      { label: 'short viewport', width: 320, height: 380, art: 320 / 375 / 1.15, type: 0.94 },
    ] as const;

    for (const shape of frames) {
      const frame = {
        width: shape.width,
        height: shape.height,
        boardWidth: CLOSE.map.width,
        boardHeight: CLOSE.map.height,
        art: shape.art,
      };
      const columns = closeChartColumns(frame, shape.type);

      for (const [name, column] of [
        ['cleared', columns.cleared],
        ['live', columns.live],
      ] as const) {
        expect(
          column.top + column.height,
          `${shape.label}: the ${name} column's label stack runs into the fog band's node`,
        ).toBeLessThanOrEqual(columns.fogGroupTop - CLOSE_NODE.fogClearance * shape.art + 0.001);
      }

      // The fog band's own group still fits, both inside the band and inside the map it hangs off.
      expect(columns.ahead.top + columns.ahead.height).toBeLessThanOrEqual(shape.height + 0.001);
      expect(columns.fogBandHeight).toBeGreaterThanOrEqual(
        FOG_BAND.group.top * shape.art + columns.ahead.height - 0.001,
      );

      // The ship is berthed AT the live node — the board puts its hull at y 238 and the node at
      // 310 — so it has to travel with whatever the clamp does to that node. Left behind, the gold
      // disc slides down over the boat, which is how this was caught on a device.
      const berth = (CLOSE.nodeLive.y - CLOSE.ship.y) * (shape.height / CLOSE.map.height);
      expect(
        columns.live.top - columns.shipTop,
        `${shape.label}: the ship did not move with the node it is moored to`,
      ).toBeCloseTo(berth, 5);
    }
  });

  it('spec(A-057:AC-9) all five focus positions fill the three slots without repeating an island', () => {
    // The slots are `behind` / `here` / `ahead`, and `ahead` is the nearest island the fog has not
    // lifted from rather than `focus + 1` — an already-open island in the fog band would fog a
    // place the captain can sail to. Walked across the whole chain, which is the part a screenshot
    // at one captain state cannot cover.
    for (let focus = 0; focus < islands.length; focus += 1) {
      const unlocked = islands
        .slice()
        .sort((a, b) => a.order - b.order)
        .slice(0, focus + 1)
        .map((island) => island.id);
      const nodes = chartNodes({
        ...emptyCaptain(),
        gradeBand: 'g2_3',
        unlockedIslands: unlocked,
        currentIsland: unlocked[focus] ?? null,
      });
      const live = focusIndex(nodes);
      expect(live, `focus ${focus} did not settle on the captain's own island`).toBe(focus);

      const slots = closeChartSlots(nodes, live);
      expect(slots.here).toBe(focus);
      expect(slots.behind).toBe(focus === 0 ? undefined : focus - 1);
      // Every island after the focus is still fogged here, so the band holds the next one — except
      // at the end of the chain, where there is no more sea and the band holds weather alone.
      expect(slots.ahead).toBe(focus === islands.length - 1 ? undefined : focus + 1);

      const filled = [slots.behind, slots.here, slots.ahead].filter((slot) => slot !== undefined);
      expect(new Set(filled).size, `focus ${focus} put one island in two slots`).toBe(filled.length);
    }
  });

  it('spec(A-057:AC-3) the ship rides the rendered bob, never the authored rotation', () => {
    // Both sprites are authored `rotate(-24deg)` / `rotate(-18deg)` and then run `sc-bob`, which
    // animates `transform` — and a CSS animation REPLACES an authored transform for its whole run.
    // Neither angle ever renders. Transcribing one would draw a ship the design never shows.
    expect(SHIP.bob.rotateDeg).toBe(2);
    const ship = chartSource('src/components/chart/ChartShip.tsx');
    expect(ship).toMatch(/SHIP\.bob\.rotateDeg/);
    // The trap is RECORDED rather than silently dropped: both authored angles are written down in
    // `board.ts` beside the reason neither of them renders, so the next re-measure meets it first.
    const board = chartSource('src/components/chart/board.ts');
    expect(board).toMatch(/rotate\(-24deg\)/);
    expect(board).toMatch(/rotate\(-18deg\)/);
    // The one raster the board really does author as an `<img>`.
    expect(ship).toMatch(/sprite\.ship01/);
  });

  it('spec(A-057:AC-4) no scenery silhouette is aimed at from inside a tappable target', () => {
    // The board authors rock #5 at (116, 272) with its whole silhouette inside rival #4's 64pt
    // target — a child aiming at the rock would start a duel. Stated as the property rather than as
    // the new coordinate, so moving a waypoint later cannot quietly re-create the collision.
    //
    // The property is about the CENTRE, which is where a thumb lands. Targets on a map this dense
    // graze each other's edges by a point or two and the board draws them that way; what may never
    // happen is that the place you would aim at a rock belongs to a duel.
    const centreOf = (w: (typeof VOYAGE.waypoints)[number]) => ({
      x: w.x + WAYPOINT_ART[w.kind].w / 2,
      y: w.y + WAYPOINT_ART[w.kind].h / 2,
    });

    for (const scenery of VOYAGE.waypoints) {
      if (WAYPOINT_ROUTE[scenery.kind] !== undefined) continue;
      const aim = centreOf(scenery);
      for (const tappable of VOYAGE.waypoints) {
        if (WAYPOINT_ROUTE[tappable.kind] === undefined) continue;
        const centre = centreOf(tappable);
        const inside =
          Math.abs(aim.x - centre.x) < MIN_TAP_TARGET / 2 && Math.abs(aim.y - centre.y) < MIN_TAP_TARGET / 2;
        expect(
          inside,
          `${scenery.kind} at (${scenery.x}, ${scenery.y}) is aimed at from inside the ` +
            `${tappable.kind} target at (${tappable.x}, ${tappable.y}) — tapping the scenery ` +
            'would open its screen',
        ).toBe(false);
      }
    }
  });

  it('spec(A-057:AC-4) every tappable waypoint reaches the 64pt floor, and rocks are never tappable', () => {
    for (const waypoint of VOYAGE.waypoints) {
      const artBox = WAYPOINT_ART[waypoint.kind];
      if (WAYPOINT_ROUTE[waypoint.kind] === undefined) continue;
      const slop = targetSlop(artBox.w, artBox.h, MIN_TAP_TARGET);
      expect(artBox.w + slop.left + slop.right).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
      expect(artBox.h + slop.top + slop.bottom).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
    }
    expect(WAYPOINT_ROUTE.rock).toBeUndefined();
    // Chests render and are not tappable: there is no reward entry point outside a duel result and
    // no per-waypoint looted latch, both engine-track. Routing one anywhere would be a lie.
    expect(WAYPOINT_ROUTE.chest).toBeUndefined();
    expect(chartSource('src/components/chart/Waypoint.tsx')).toMatch(/TODO\(engine\)/);
  });

  it('spec(A-057:AC-5) every waypoint is gated by a real island, and the sixteen places add up', () => {
    expect(PLACE_COUNT).toBe(VOYAGE.isles.length + VOYAGE.waypoints.length);
    expect(PLACE_COUNT).toBe(16);
    expect(WAYPOINT_GATE).toHaveLength(VOYAGE.waypoints.length);
    for (const gate of WAYPOINT_GATE) {
      expect(Number.isInteger(gate)).toBe(true);
      expect(VOYAGE.isles[gate]).toBeDefined();
    }
    // The board draws five isles, five tags and five stations — one per catalog island, index-fixed
    // so the map never reshuffles as islands open.
    expect(VOYAGE.isleTags).toHaveLength(VOYAGE.isles.length);
  });

  it('spec(A-057:AC-6) the cleared tick is the board’s readable ink, not the banned white-on-green', () => {
    // 5.54 for the board's `#14283C`; white on the same green is 2.63 and is one of the four
    // project-banned pairs. `text-contrast.test.ts` certifies the PAIR and so never looked at this
    // call site, which is how white shipped here.
    expect(contrast('#14283C', tokens.color.success)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokens.color.white, tokens.color.success)).toBeLessThan(4.5);
    const station = chartSource('src/components/chart/Station.tsx');
    expect(station).not.toMatch(/chart\.white/);
  });

  it('spec(A-057:AC-6) the header subtitle is the captain’s real rank, never the board’s mock copy', () => {
    const header = chartSource('src/components/chart/HeaderPill.tsx');
    const route = chartSource('app/chart.tsx');
    expect(header).not.toMatch(/'VOYAGER'|"VOYAGER"|>VOYAGER</);
    expect(header).toMatch(/rankName/);
    expect(route).toMatch(/rankForWins/);
  });

  it('spec(A-057:AC-6) The Grandline wears the board’s own glyph', () => {
    expect(islandGlyph.grandline).toBe('( )');
    expect(islandGlyph.isla_products).toBe('×');
    expect(islandGlyph.quotient_cove).toBe('÷');
    expect(islandGlyph.fraction_reef).toBe('½');
  });

  it('spec(A-057:AC-7) the compass is scenery, and nothing on the chart is tappable-looking for nothing', () => {
    // Board 9d gave it two jobs: anchoring the chart, and zooming out. The second died with the
    // close chart, and the owner's rule is that a control which looks tappable and does nothing is
    // the exact defect being fixed. So it is drawn, and it is not a control.
    const voyage = chartSource('src/components/chart/VoyageMap.tsx');
    const compass = chartSource('src/components/chart/Compass.tsx');
    expect(voyage).toMatch(/<CompassRose/);
    // The executable forms, not the word — the file's own docblock explains why there is no
    // pressable wrapper, and a prose mention is evidence for the rule rather than against it.
    expect(compass).not.toMatch(/<Pressable/);
    expect(compass).not.toMatch(/from 'react-native';[\s\S]*?\bPressable\b/);
    expect(compass).not.toMatch(/accessibilityRole=/);
    expect(compass).not.toMatch(/onPress/);
    // The close chart is gone, not hidden.
    expect(existsSync(join(process.cwd(), 'src/components/chart/CloseChart.tsx'))).toBe(false);
    // It sits below the header band, whose ink ends at frame y 78 → map y 58.
    expect(VOYAGE.compass.y).toBeGreaterThan(78 - FRAME.statusBar);
    expect(VOYAGE.counter.y).toBeGreaterThan(78 - FRAME.statusBar);
  });

  it('spec(A-057:AC-8) one badge, one source: the crest numeral and the rank name both derive from wins', () => {
    // Caught on a device, not here. The pill showed a `0` beside "CADET" for two independent
    // reasons, and each is the kind of bug a screenshot review reports as "the number looks wrong":
    //
    //   1. The board numbers the rungs 1–5 for the child; the engine counts tiers 0–4. `app/rank.tsx`
    //      already rendered `currentTier + 1`, so the SAME captain read `1` on Rank and `0` on the
    //      chart — the two screens disagreed about the captain's own rank.
    //   2. The chart took the NAME from `rankForWins(captain.wins)` but the NUMERAL from the stored
    //      `captain.rankTier`. Two sources for two halves of one badge: once `wins` advances and the
    //      stored tier has not been rewritten, the badge reads a name and a number that contradict.
    //
    // Asserted at the source, because the failure is which expression is passed, and a value test
    // would pass while the wiring stayed wrong.
    const chart = chartSource('app/chart.tsx');
    const pill = chartSource('src/components/chart/HeaderPill.tsx');

    expect(chart).toMatch(/rankTier=\{rankTierForWins\(captain\.wins\)\}/);
    expect(chart, 'the crest must not read the separately-stored tier').not.toMatch(
      /rankTier=\{captain\.rankTier\}/,
    );
    // Both halves resolve through the same helper: `rankForWins` calls `rankTierForWins` internally,
    // so agreeing on the input is enough to make them agree on the output.
    expect(chart).toMatch(/rankForWins\(captain\.wins\)/);
    expect(pill).toMatch(/\{tier \+ 1\}/);
  });
});

/**
 * `(ascender - descender + lineGap) / unitsPerEm` for every face `theme/tokens.ts` names, read out
 * of the shipped `.ttf` — the same number iOS reports as `UIFont.lineHeight`.
 *
 * Hand-rolled rather than a dependency: this needs two tables out of the TrueType directory (`head`
 * for `unitsPerEm`, `hhea` for the vertical metrics) and adding a font-parsing package to run one
 * assertion would be the larger change.
 */
function fontLineBoxEm(): ReadonlyMap<string, number> {
  const roots = [
    ['Baloo2_800ExtraBold', '@expo-google-fonts/baloo-2/800ExtraBold/Baloo2_800ExtraBold.ttf'],
    ['Baloo2_600SemiBold', '@expo-google-fonts/baloo-2/600SemiBold/Baloo2_600SemiBold.ttf'],
    ['Baloo2_500Medium', '@expo-google-fonts/baloo-2/500Medium/Baloo2_500Medium.ttf'],
    ['Nunito_800ExtraBold', '@expo-google-fonts/nunito/800ExtraBold/Nunito_800ExtraBold.ttf'],
    ['Nunito_700Bold', '@expo-google-fonts/nunito/700Bold/Nunito_700Bold.ttf'],
    ['Nunito_600SemiBold', '@expo-google-fonts/nunito/600SemiBold/Nunito_600SemiBold.ttf'],
  ] as const;

  const out = new Map<string, number>();
  for (const [family, relative] of roots) {
    const path = fileURLToPath(new URL(`../../node_modules/${relative}`, import.meta.url));
    if (!existsSync(path)) continue;
    const buffer = readFileSync(path);
    const tables = new Map<string, number>();
    const tableCount = buffer.readUInt16BE(4);
    for (let i = 0; i < tableCount; i += 1) {
      const entry = 12 + i * 16;
      tables.set(buffer.toString('ascii', entry, entry + 4), buffer.readUInt32BE(entry + 8));
    }
    const head = tables.get('head');
    const hhea = tables.get('hhea');
    if (head === undefined || hhea === undefined) continue;
    const unitsPerEm = buffer.readUInt16BE(head + 18);
    const ascender = buffer.readInt16BE(hhea + 4);
    const descender = buffer.readInt16BE(hhea + 6);
    const lineGap = buffer.readInt16BE(hhea + 8);
    out.set(family, (ascender - descender + lineGap) / unitsPerEm);
  }
  return out;
}
