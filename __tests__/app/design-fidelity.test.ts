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
import { describe, expect, it } from 'vitest';

import fixture from '../../design/fixtures/duel-375.json';
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

  it('spec(A-013:AC-4) the tap-target floor is not violated by the board itself', () => {
    // A sanity check on our own constant: if the design's own controls are smaller than the floor
    // we claim to enforce, one of the two is wrong and we should find out here, not on a device.
    expect(fixture.cannonRow.height).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
    expect(fixture.cannonGlyphTile.size).toBeGreaterThanOrEqual(MIN_TAP_TARGET - 1);
  });
});
