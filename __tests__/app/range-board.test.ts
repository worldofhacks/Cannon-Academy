/**
 * A-059 — the gunnery range is the board, at every size, with nothing unreadable and nothing
 * overlapping.
 *
 * Source: project `88888c12-22e4-4781-b76f-a28110506499`, `Cannon Academy Practice.dc.html`
 * (turn 11), screen `[data-screen-label="Practice"]`.
 *
 * Three kinds of assertion, and they are deliberately different:
 *
 *  1. **Inventory.** The board is ONE frame carrying NINE states selected by an index, not nine
 *     screens. Getting that wrong is how a transcription silently ships two thirds of a design, so
 *     the state list is pinned as data and the collapse onto four real phases is pinned beside it.
 *  2. **Geometry, arithmetically, at three viewports.** `design-fidelity.test.ts` AC-9 exists
 *     because the sea chart shipped an overlap that a screenshot at one size did not show: the
 *     board draws ONE arrangement and the app has to draw all of them. Every band and every scene
 *     element here is checked by arithmetic at 375×667, 768×1024 and 1280×800, plus the 360×640
 *     small-Android floor that `responsive.ts` names as the true narrow case.
 *  3. **Contrast, measured.** `text-contrast.test.ts` measures the app's own pairs; this measures
 *     the ones this board introduces, so a hex read off the design cannot arrive below AA just
 *     because the designer wrote it down.
 *
 * What is NOT asserted here: that decorative scene layers never touch. They do, on purpose — the
 * board draws the bottle leaving Pim's hand, so the two silhouettes overlap by two points, and the
 * `+1` rises over the shards of the thing it is celebrating. Overlap is a defect for TEXT and for
 * TAP TARGETS; for a scene it is composition. The properties below say which is which.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { computeLayout, resolveResponsiveSurface } from '../../src/theme/responsive';
import {
  BOARD_STATES,
  BOAT,
  FRAME,
  GULL,
  HEADER,
  HEADER_HEIGHT,
  HIT_MARK,
  PHASES,
  PICK,
  QUESTION,
  RACK_BAR,
  RAFT,
  ROUND_END,
  rangeColor,
  rangeStageHeight,
  sceneScale,
  SHEET,
  SHEET_MIN_HEIGHT,
  STAGE,
  STAGE_CHIP,
  stageFraction,
  STREAK_CHIP,
  TARGET_ART,
  TARGET_BERTH,
  TARGET_KINDS,
  TARGET_TABLE,
} from '../../src/theme/rangeBoard';
import { color, MIN_TAP_TARGET } from '../../src/theme/tokens';

// ── contrast, the same arithmetic `text-contrast.test.ts` uses ────────────────────────────────

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const linear = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const AA_SMALL = 4.5;

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relative}`, import.meta.url)), 'utf8');
}

// ── the viewports this pass is judged at ──────────────────────────────────────────────────────

interface Viewport {
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

const VIEWPORTS: readonly Viewport[] = [
  { label: 'phone 375×667 (the board)', width: 375, height: 667 },
  { label: 'small Android 360×640', width: 360, height: 640 },
  { label: 'tablet 768×1024', width: 768, height: 1024 },
  { label: 'desktop 1280×800', width: 1280, height: 800 },
  // The shape that makes `rangeStageHeight`'s clamp load-bearing. Below roughly 416pt of frame
  // height the board's own 212/667 proportion no longer fits beside a question band, and a
  // landscape phone is 375. Without this row the clamp could be deleted and every assertion above
  // would still pass — which is a test measuring nothing, and how the last overlap shipped.
  { label: 'landscape phone 667×375', width: 667, height: 375 },
];

/** What `app/range.tsx` actually lays out inside: the `reading` surface's centred column. */
function frameFor(viewport: Viewport) {
  const surface = resolveResponsiveSurface(viewport.width, 'reading');
  const layout = computeLayout(viewport.width, viewport.height);
  const stage = rangeStageHeight(viewport.height, 0);
  return {
    contentWidth: surface.contentWidth,
    // The SCENE's scale, not the layout's — see `sceneScale`. Using `layout.art` here would be
    // asserting against a number the screen does not draw with.
    art: sceneScale(stage, surface.contentWidth, layout.art),
    layoutArt: layout.art,
    stage,
    header: HEADER_HEIGHT,
    sheet: viewport.height - HEADER_HEIGHT - stage,
  };
}

describe('A-059 the practice board, transcribed', () => {
  // ── The inventory ────────────────────────────────────────────────────────────────────────────

  it('spec(A-059:AC-6) the board is one frame of nine states, and they are the nine that were read', () => {
    // The board's own `STATES` array, in its own order. This is the shape check the header names:
    // some boards in this project draw many screens, this one draws one frame and indexes states,
    // and assuming the wrong shape is how a transcription ships a third of a design.
    expect([...BOARD_STATES]).toEqual([
      'pick',
      'incoming',
      'question',
      'hit',
      'streak',
      'gull',
      'bell',
      'miss',
      'end',
    ]);

    // Five of those nine differ ONLY in what is floating: `hit`/`streak`/`gull`/`bell` all draw the
    // question band. So the screen runs four phases plus the picker, and the target is an
    // orthogonal axis over the question — board 11b's *"variety in the reward costs nothing in the
    // mechanic"*, stated as a type.
    expect([...PHASES]).toEqual(['pick', 'incoming', 'question', 'verdict', 'end']);
    expect(PHASES.length).toBeLessThan(BOARD_STATES.length);
  });

  it('spec(A-059:AC-6) all six of the board’s targets exist, with the board’s own trigger column', () => {
    expect([...TARGET_KINDS]).toEqual(['bottle', 'barrel', 'gull', 'bell', 'crate', 'hat']);
    expect(TARGET_TABLE.map((t) => t.kind)).toEqual([...TARGET_KINDS]);
    expect(TARGET_TABLE.map((t) => t.when)).toEqual([
      'ALWAYS',
      'STREAK ×3',
      '1 IN 5',
      '1 IN 12',
      'RACK 6+',
      '10/10 ONLY',
    ]);
    // Every kind has drawable art with a berth on the board's own 212pt stage.
    for (const kind of TARGET_KINDS) {
      expect(TARGET_ART[kind].w, `${kind} has no width`).toBeGreaterThan(0);
      expect(TARGET_ART[kind].h, `${kind} has no height`).toBeGreaterThan(0);
      expect(TARGET_ART[kind].bottom).toBeGreaterThan(0);
    }
  });

  it('spec(A-059:AC-6) the board’s two unbuildable promises are recorded, not silently dropped', () => {
    // A board detail that cannot be built has to leave a trace, or the next re-measure re-discovers
    // it as a bug. Both live in `rangeBoard.ts` beside the reason.
    const board = source('src/theme/rangeBoard.ts');
    // The bell's `+3` — it would end a ten-question drill early, and `commitDrill` pays nothing for
    // an incomplete one.
    expect(TARGET_TABLE.find((t) => t.kind === 'bell')?.note).toMatch(/NOT implemented/);
    expect(board).toMatch(/three rack slots/);
    // The `+35 COINS` stat — the range grants nothing but mastery.
    expect(board).toMatch(/\+35 COINS/);
    // The board's own labels are kept beside the substituted ones, so the swap is reviewable
    // rather than merely absent.
    expect([...ROUND_END.stats.boardLabels]).toEqual(['SMASHED', 'BEST STREAK', 'COINS']);
    expect([...ROUND_END.stats.labels]).toEqual(['SMASHED', 'BEST STREAK', 'METER']);
    // ...and the screen really does print the meter rather than a payout it cannot make. Matched
    // as a QUOTED literal: the reason for the substitution is written in a comment there, and a
    // bare /COINS/ would be satisfied by the explanation instead of by the behaviour.
    const screen = source('app/range.tsx');
    expect(screen).not.toMatch(/['"`]COINS['"`]/);
    expect(screen).toMatch(/ROUND_END\.stats\.labels\[2\]/);
  });

  // ── Geometry ────────────────────────────────────────────────────────────────────────────────

  it('spec(A-059:AC-7) the three bands tile the frame with no overlap, at every viewport', () => {
    // The defect this pins is the one `design-fidelity.test.ts` AC-9 was written for: the board
    // draws ONE arrangement and the app draws four. A screenshot at 375 is exactly what let the
    // last overlap through, so this is arithmetic at four shapes instead.
    for (const viewport of VIEWPORTS) {
      const f = frameFor(viewport);

      // Header, stage and sheet are laid out in a column, so non-overlap IS the sum fitting.
      expect(
        f.header + f.stage + f.sheet,
        `${viewport.label}: the three bands do not tile the frame`,
      ).toBeCloseTo(viewport.height, 5);

      // ...and the sheet keeps its minimum, which is what stops the stage eating the answers.
      expect(
        f.sheet,
        `${viewport.label}: the sheet is ${f.sheet}pt, under the ${SHEET_MIN_HEIGHT}pt a question band needs`,
      ).toBeGreaterThanOrEqual(SHEET_MIN_HEIGHT);

      // The stage is never taller than the board's own proportion allows on a tall screen, and
      // never so short the composition collapses.
      expect(f.stage).toBeGreaterThan(0);
      expect(f.stage).toBeLessThanOrEqual(300);
    }
  });

  it('spec(A-059:AC-7) the sheet holds a question row and two rows of 64pt answers, at every viewport', () => {
    // Stated as the arithmetic the layout actually performs, so a padding edit that stopped the
    // grid fitting fails here rather than as a clipped fourth answer on a device.
    const needed =
      SHEET.padding * 2 +
      QUESTION.rowHeight +
      SHEET.gap +
      QUESTION.answer.minHeight * 2 +
      QUESTION.grid.gap;
    expect(needed).toBe(SHEET_MIN_HEIGHT);

    for (const viewport of VIEWPORTS) {
      const f = frameFor(viewport);
      const spare = f.sheet - needed;
      expect(spare, `${viewport.label}: the answer grid does not fit the sheet`).toBeGreaterThanOrEqual(0);

      // Two answers per row across the content column, with a 12pt gutter, each still over the
      // tap floor on its narrow axis.
      const answerWidth = (f.contentWidth - SHEET.padding * 2 - QUESTION.grid.gap) / QUESTION.grid.columns;
      expect(
        answerWidth,
        `${viewport.label}: an answer tile is ${answerWidth.toFixed(1)}pt wide`,
      ).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
    }
  });

  it('spec(A-059:AC-7) every scene element stays inside the stage, at every viewport', () => {
    // Containment, not separation: the boat and the raft are a composition and the board lets the
    // bottle overlap Pim's hand. What may never happen is a mast growing through the sky's ceiling
    // or a raft hanging below the waterline — which is exactly what a raw 212pt offset on a 203pt
    // stage would do, and the reason `stageFraction` exists.
    for (const viewport of VIEWPORTS) {
      const f = frameFor(viewport);
      const a = (n: number) => n * f.art;

      const parts: readonly {
        readonly name: string;
        readonly left: number;
        readonly width: number;
        readonly bottom: number;
        readonly height: number;
      }[] = [
        {
          name: 'gun boat',
          left: a(BOAT.x),
          width: a(BOAT.w),
          bottom: f.stage * stageFraction(BOAT.bottom),
          height: a(BOAT.h),
        },
        {
          name: "Pim's raft",
          left: f.contentWidth - a(RAFT.right) - a(RAFT.w),
          width: a(RAFT.w),
          bottom: f.stage * stageFraction(RAFT.bottom),
          height: a(RAFT.h),
        },
        ...TARGET_KINDS.map((kind) => ({
          name: `target: ${kind}`,
          left: f.contentWidth - a(TARGET_BERTH.right) - a(TARGET_ART[kind].w),
          width: a(TARGET_ART[kind].w),
          bottom: f.stage * stageFraction(TARGET_ART[kind].bottom),
          height: a(TARGET_ART[kind].h),
        })),
      ];

      for (const part of parts) {
        const where = `${viewport.label}: ${part.name}`;
        expect(part.left, `${where} runs off the left edge`).toBeGreaterThanOrEqual(0);
        expect(part.left + part.width, `${where} runs off the right edge`).toBeLessThanOrEqual(
          f.contentWidth + 0.001,
        );
        expect(part.bottom, `${where} hangs below the stage`).toBeGreaterThanOrEqual(0);
        expect(part.bottom + part.height, `${where} grows through the top of the stage`).toBeLessThanOrEqual(
          f.stage + 0.001,
        );
      }

      // The gull travels 190 design-points left on `pr-fly` and must still be on screen at the end
      // of its loop — the one element whose extent is an animation rather than a layout.
      const gullLeft = f.contentWidth - a(TARGET_BERTH.right) - a(TARGET_ART.gull.w);
      expect(
        gullLeft + a(GULL.fly.travelX),
        `${viewport.label}: the gull flies off the left edge`,
      ).toBeGreaterThanOrEqual(0);

      // The hit mark rises inside the stage rather than over the sheet's rounded shoulder. It is a
      // TEXT chip, so its own height does not scale with the art — only its berth does, which is
      // exactly why it needs asserting separately from the drawn parts above.
      const hitBottom = f.stage * stageFraction(HIT_MARK.bottom);
      expect(
        hitBottom + HIT_MARK.height,
        `${viewport.label}: the hit mark leaves the stage`,
      ).toBeLessThanOrEqual(f.stage + 0.001);
      expect(
        f.contentWidth - HIT_MARK.right * f.art,
        `${viewport.label}: the hit mark is berthed off the left edge`,
      ).toBeGreaterThan(0);
    }
  });

  it('spec(A-059:AC-7) the two stage chips never collide, at every viewport', () => {
    // These ARE text, so this one is a real non-overlap rule rather than a containment one. The
    // board anchors one from the left and one from the right and never draws them at their widest
    // at the same time; the app does, because the chip copy is generated from the target.
    for (const viewport of VIEWPORTS) {
      const f = frameFor(viewport);
      // The screen caps the left chip at 62% of the column; the streak chip is its own content.
      const leftChipRight = STAGE_CHIP.x + f.contentWidth * 0.62;
      const streakWidth =
        STREAK_CHIP.padX * 2 + STREAK_CHIP.star + STREAK_CHIP.gap + STREAK_CHIP.textSize * 2;
      const streakLeft = f.contentWidth - STREAK_CHIP.x - streakWidth;
      expect(
        leftChipRight,
        `${viewport.label}: the target chip runs into the streak chip`,
      ).toBeLessThanOrEqual(streakLeft);
    }
  });

  it('spec(A-059:AC-7) the rack bar fits ten countable bottles beside the back tile, at every viewport', () => {
    for (const viewport of VIEWPORTS) {
      const f = frameFor(viewport);
      const barWidth = f.contentWidth - HEADER.padX * 2 - HEADER.back.size - HEADER.gap;
      const slotsWidth =
        barWidth - RACK_BAR.padX * 2 - RACK_BAR.op.size - RACK_BAR.gap * 3 - RACK_BAR.countSize;
      const perSlot = (slotsWidth - RACK_BAR.slot.gap * (RACK_BAR.slot.count - 1)) / RACK_BAR.slot.count;
      expect(
        perSlot,
        `${viewport.label}: a rack slot is ${perSlot.toFixed(1)}pt — too narrow to count`,
      ).toBeGreaterThanOrEqual(3);
      expect(RACK_BAR.slot.count).toBe(10);
      expect(PICK.rack.count).toBe(10);
    }
  });

  // ── Tap targets ─────────────────────────────────────────────────────────────────────────────

  it('spec(A-059:AC-8) every tappable thing clears the 64pt floor, by ink or by slop', () => {
    // The board draws a 44pt back tile. Growing it would break the header's proportion, so the ink
    // stays 44 and the target is padded — the split the chart's header pills already use, sanctioned
    // and arithmetic rather than a magic number.
    const slop = (MIN_TAP_TARGET - HEADER.back.size) / 2;
    expect(HEADER.back.size + slop * 2).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
    expect(slop).toBeGreaterThan(0);

    // Everything else is at or over the floor in its own right.
    expect(PICK.row.minHeight).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
    expect(PICK.play.size).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
    expect(QUESTION.answer.minHeight).toBeGreaterThanOrEqual(MIN_TAP_TARGET);

    // ...and the screen really applies the slop rather than merely declaring it.
    const screen = source('app/range.tsx');
    expect(screen).toMatch(/hitSlop=\{\{/);
    // The stage is decoration and must never eat a tap meant for the header's 64pt target, which
    // bleeds two points into it.
    expect(screen).toMatch(/<View style=\{\[s\.stage[^\]]*\]\} pointerEvents="none">/);
  });

  // ── Contrast ────────────────────────────────────────────────────────────────────────────────

  it('spec(A-059:AC-8) every text/ground pair this board introduces clears AA', () => {
    // Enumerated by hand from the call sites, because a colour is only wrong in the context it is
    // used — the same hex is fine as a fill and illegal as text.
    const pairs: readonly { readonly where: string; readonly fg: string; readonly bg: string }[] = [
      { where: 'header title on the readable blue', fg: color.white, bg: color.seaDeep },
      // The board's own `#1584B8` here is white on `sea` at 4.18 — a banned pair, corrected to
      // `seaPlate`. Asserting the CORRECTED colour is what stops the board's value coming back.
      { where: 'back glyph on the back tile', fg: color.white, bg: rangeColor.seaPlate },
      { where: 'rack count on parchment', fg: color.inkDark, bg: color.parchment },
      { where: 'the operator tile on amber', fg: color.inkDark, bg: color.amber },
      { where: 'SMASHED! chip on success', fg: color.inkDark, bg: color.success },
      { where: 'IT GOT AWAY chip on sea-deep', fg: color.white, bg: color.seaDeep },
      { where: 'THE GOLDEN BELL chip on gold', fg: color.inkDark, bg: color.gold },
      { where: 'streak count on ink', fg: color.gold, bg: color.inkDark },
      { where: 'the hit mark on success', fg: color.inkDark, bg: color.success },
      { where: 'an answer tile', fg: color.inkDark, bg: color.white },
      { where: 'the answer mark on success', fg: color.inkDark, bg: color.success },
      { where: 'the miss title on sea-deep', fg: color.white, bg: color.seaDeep },
      { where: 'the miss subtitle on sea-deep', fg: rangeColor.missInk, bg: color.seaDeep },
      { where: 'the miss note on sunken parchment', fg: color.inkDarkMuted, bg: rangeColor.parchmentSunk },
      { where: 'the SMASHED stat on white', fg: '#1E7F41', bg: color.white },
      { where: 'a stat label on white', fg: color.inkDarkMuted, bg: color.white },
      { where: 'the reward kicker on gold', fg: color.inkDark, bg: color.gold },
      { where: 'Another rack on amber', fg: color.inkDark, bg: color.amber },
      { where: 'the rack note on sunken parchment', fg: color.inkDarkMuted, bg: rangeColor.parchmentSunk },
      { where: 'a rack name on white', fg: color.inkDark, bg: color.white },
      { where: 'a rack glyph on sunken parchment', fg: color.inkDark, bg: rangeColor.parchmentSunk },
      { where: 'the done tick on success', fg: color.inkDark, bg: color.success },
    ];

    for (const { where, fg, bg } of pairs) {
      const ratio = contrast(fg, bg);
      expect(
        ratio,
        `${where}: ${fg} on ${bg} measures ${ratio.toFixed(2)}, below AA ${AA_SMALL}`,
      ).toBeGreaterThanOrEqual(AA_SMALL);
    }
  });

  it('spec(A-059:AC-8) none of the four banned pairs is anywhere on this screen', () => {
    // The board did not reach for any of them — its `SMASHED!` chip carries INK on `#2FB65E` and
    // its SMASHED stat is already `#1E7F41` — so there was nothing to correct. Pinned anyway, so a
    // later re-tint of a chip cannot introduce one quietly.
    const screen = source('app/range.tsx');
    const board = source('src/theme/rangeBoard.ts');

    // White on `success` (2.63) and white on `amber` (2.03) — the board's own bans.
    expect(contrast(color.white, color.success)).toBeLessThan(AA_SMALL);
    expect(contrast(color.white, color.amber)).toBeLessThan(AA_SMALL);
    // `goldDeep` on parchment (3.56) and ink on `sea` (3.59).
    expect(contrast(color.goldDeep, color.parchment)).toBeLessThan(AA_SMALL);
    expect(contrast(color.inkDark, color.sea)).toBeLessThan(AA_SMALL);

    for (const file of [screen, board]) {
      expect(file).not.toMatch(/color:\s*color\.goldDeep\b/);
      expect(file).not.toMatch(/color:\s*color\.inkFaint\b/);
    }
    // `goldDeep` survives as a FILL — it is the plank shadow under the amber buttons, which is what
    // it was always for.
    expect(screen).toMatch(/borderBottomColor:\s*color\.goldDeep/);
  });

  // ── The measurements themselves ──────────────────────────────────────────────────────────────

  it('spec(A-059:AC-6) the transcription is the board’s own numbers', () => {
    expect(FRAME).toEqual({ width: 375, height: 667, statusBar: 20 });
    expect(STAGE.designHeight).toBe(212);
    expect(STAGE.tallSheetHeight).toBe(196);
    expect(STAGE.water.height).toBe(62);
    expect(HEADER_HEIGHT).toBe(60);
    expect(BOAT.w).toBe(132);
    expect(BOAT.h).toBe(106);
    expect(RAFT.w).toBe(96);
    expect(TARGET_BERTH.right).toBe(96);
    // The board's `targetBottom` table: 132 for the gull, 118 for the bell, 70 for everything else.
    expect(TARGET_ART.gull.bottom).toBe(132);
    expect(TARGET_ART.bell.bottom).toBe(118);
    expect(TARGET_ART.bottle.bottom).toBe(70);
    expect(TARGET_ART.barrel.bottom).toBe(70);
  });
});
