/**
 * A-045 — the ships are drawn, not photographed, and the only rasters we ship come from the boards.
 *
 * A-013 replaced the composed prototype ships with Kenney hull PNGs and froze that swap into this
 * file. It was the wrong direction twice over: the duel board's own footnote says "Ships are
 * grey-box stand-ins; cannonball, blast and fire are the real Kenney CC0 sprites", and the seven
 * hulls, six flags, two crew and two dinghies A-013 added appear in NEITHER design artifact. The
 * old tests passed because they asserted the swap rather than the design.
 *
 * So this file now enforces two rules, and they are deliberately mechanical — a future sprite pass
 * has to delete a test to undo the design, which is a reviewable act rather than a quiet one.
 *
 *   1. PROVENANCE. Every raster under `assets/sprites/` is byte-identical to an image embedded in
 *      one of the two artifacts. The allowlist below is not a style preference; each entry was
 *      matched by MD5 against the artifact bundles.
 *   2. COMPOSITION. `Ship.tsx` builds the hull, sails, masts and rigging out of `Poly`/`View` at
 *      the board's own coordinates, and never reaches for an `<Image>`.
 *
 * React Native's Flow-typed entry point cannot load duel components in the node runner, so the
 * composition half is enforced on `Ship.tsx` source text — the same pattern A-031 and A-034 use.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import fixture from '../../design/fixtures/ship-prototype.json';

const REPO_ROOT = join(import.meta.dirname, '../..');
const SPRITES_PATH = 'src/theme/sprites.ts';
const SHIP_PATH = 'src/components/duel/Ship.tsx';
const SHIP_COSMETICS_PATH = 'src/theme/shipCosmetics.ts';
const CHART_SHIP_PATH = 'src/components/chart/ChartShip.tsx';
const SPRITE_DIR = 'assets/sprites';

/**
 * Every raster the app is allowed to ship, keyed by filename, valued by the MD5 of the matching
 * image inside a design artifact. Verified 2026-07-29 by hashing every PNG in both artifact
 * bundles against every PNG in `assets/sprites/`.
 *
 * `ship-01.png` is on this list and that is not an oversight: the corrections board's Sea chart
 * screen draws exactly this file — a top-down map ship — at 42pt. It is the one ship raster the
 * boards actually contain, and the duel's side-view ships are not it.
 */
const ARTIFACT_RASTERS: Readonly<Record<string, string>> = {
  'ship-01.png': '382907f0456d23bf2dc98c4c44968699',
  'cannonball.png': '62fc69da4c5c462e32078820a81d7a9f',
  'cannon.png': 'cfc18c46596c1ea9f55b761580daa2cb',
  'cannon-mobile.png': '7a65bea346def4ba552b8b7c832ec2e2',
  'fire1.png': '8028c70e8175736b34e3eb368e5145b0',
  'explosion1.png': '89d3ec5d68329c59a53fcaa91db9f6f6',
  'explosion2.png': 'f60687bcdf419ad4e4d887458b2ccea2',
  'explosion3.png': 'e0923c9bb1da36e3657b5261ff20a838',
  'wood-1.png': '3b521e0aaccf7c909ad9e30321dbf381',
};

/** The families A-013 introduced. Named individually so the failure message says what came back. */
const BANNED_SPRITE_FAMILIES = [
  'ship-02',
  'ship-03',
  'ship-04',
  'ship-05',
  'ship-06',
  'ship-07',
  'ship-08',
  'flag-',
  'crew-',
  'dinghy-',
] as const;

function readRepo(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

function requirePaths(source: string): readonly string[] {
  return [...source.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]!);
}

function md5(absPath: string): string {
  return createHash('md5').update(readFileSync(absPath)).digest('hex');
}

/**
 * Assert an outline from the board appears in the source as a polygon literal.
 *
 * Matched as a quoted string rather than as `points="…"`, because the outlines are hoisted into
 * named constants (`HULL_POINTS`, `SAIL.tattered.mainsail`) and reused. What must not drift is the
 * coordinate list; where it is declared is the implementation's business.
 */
function expectOutline(source: string, points: string, label: string): void {
  expect(source, `${label} outline "${points}" is missing or has drifted from the board`).toMatch(
    new RegExp(`['"\`]${points.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`),
  );
}

describe('A-045 sprite provenance — only what the design artifacts contain', () => {
  it('spec(A-045:AC-1) every shipped raster is byte-identical to an image inside a design artifact', () => {
    const files = readdirSync(join(REPO_ROOT, SPRITE_DIR)).filter((f) => f.endsWith('.png'));

    for (const file of files) {
      const expected = ARTIFACT_RASTERS[file];
      expect(
        expected,
        `${file} is not in either design artifact. The boards are the only source of art (A-045); ` +
          `delete it, or prove its provenance and add its MD5 to ARTIFACT_RASTERS.`,
      ).toBeDefined();
      expect(md5(join(REPO_ROOT, SPRITE_DIR, file)), `${file} does not match the artifact's copy`).toBe(
        expected,
      );
    }
  });

  it('spec(A-045:AC-1) the ship, flag, crew and dinghy rasters A-013 added are gone from disk', () => {
    const files = readdirSync(join(REPO_ROOT, SPRITE_DIR));

    for (const family of BANNED_SPRITE_FAMILIES) {
      const found = files.filter((f) => f.startsWith(family));
      expect(found, `${family}* is Kenney pack material that appears in neither artifact`).toEqual([]);
    }
  });

  it('spec(A-045:AC-1) the manifest lists exactly the allowed rasters, all resolving on disk', () => {
    const source = readRepo(SPRITES_PATH);
    const required = requirePaths(source);

    for (const rel of required) {
      const abs = join(REPO_ROOT, rel.replace(/^\.\.\/\.\.\//, ''));
      expect(existsSync(abs), `manifest points at a missing file: ${rel}`).toBe(true);
    }

    const names = required.map((rel) => rel.split('/').pop()!).sort();
    expect(names).toEqual(Object.keys(ARTIFACT_RASTERS).sort());
  });

  it('spec(A-045:AC-1) the manifest keeps static require() paths so a missing file fails at bundle time', () => {
    const source = readRepo(SPRITES_PATH);
    expect(source).not.toMatch(/require\s*\(\s*[a-zA-Z_$]/);
    expect(source).not.toMatch(/`\$\{/);
  });

  it('spec(A-045:AC-1) no hull- or flag-resolver survives to reintroduce a ship raster', () => {
    const source = readRepo(SPRITES_PATH);
    expect(source).not.toMatch(/hullSpriteForKind/);
    expect(source).not.toMatch(/flagSpriteForId/);
  });
});

describe('A-045 ship composition — the duel ships are built, not blitted', () => {
  it("spec(A-045:AC-2) the only raster Ship.tsx may touch is the board's fire sprite", () => {
    const ship = readRepo(SHIP_PATH);

    // The board composes every part of the ship EXCEPT the burning-hull flame, which it draws as
    // `<img>` at `fire1.png` under `ca-flame`. So this is not a blanket ban on `<Image>` — it is a
    // ban on any raster that is not that one, which is what A-013 reintroduced.
    expect(ship).not.toMatch(/hullSpriteForKind|flagSpriteForId/);

    const spriteRefs = [...ship.matchAll(/sprite\.(\w+)/g)].map((m) => m[1]!);
    expect([...new Set(spriteRefs)].sort(), 'the hull and pennant must be drawn, not blitted').toEqual([
      'fire',
    ]);
  });

  it("spec(A-045:AC-2) the hull is the board's own polygon, with trim, waterline and three gunports", () => {
    const ship = readRepo(SHIP_PATH);
    const hull = fixture.player.hull;

    expectOutline(ship, hull.points, 'hull');
    expect(ship).toMatch(/color\.gunport/);

    for (const x of hull.gunports.x) {
      expect(ship, `gunport at x=${x} is missing`).toMatch(new RegExp(`\\b${x}\\b`));
    }
    expect(hull.gunports.x).toHaveLength(3);
  });

  it('spec(A-045:AC-3) topsail and mainsail carry the red vertical stripe; the jib stays plain', () => {
    const ship = readRepo(SHIP_PATH);

    // Board 7a. The stripe is a cosmetic channel so enemies can opt out — see `sailStripe`.
    expect(ship).toMatch(/sailStripe/);
    expect(fixture.sailStripe.stripe).toBe('#D93A2E');
    expect(fixture.sailStripe.surface).toBe('#FFF6E4');
    expect(fixture.player.topsail.striped).toBe(true);
    expect(fixture.player.mainsail.striped).toBe(true);
    expect(fixture.player.jib.striped).toBe(false);

    expectOutline(ship, fixture.player.topsail.points, 'topsail');
    expectOutline(ship, fixture.player.mainsail.points, 'mainsail');
    expectOutline(ship, fixture.player.jib.points, 'jib');

    // The rival's ragged edges are the same channel, opted into by `tattered`.
    expectOutline(ship, fixture.rival.topsail.points, 'tattered topsail');
    expectOutline(ship, fixture.rival.mainsail.points, 'tattered mainsail');
  });

  it('spec(A-045:AC-2) masts, yard, deck rail, stern castle and bowsprit are all present', () => {
    const ship = readRepo(SHIP_PATH);

    for (const part of ['mainMast', 'yard', 'foreMast', 'deckRail', 'sternCastle', 'bowsprit', 'railPosts']) {
      expect(ship, `${part} is missing from the composed ship`).toMatch(new RegExp(part, 'i'));
    }
  });

  it('spec(A-045:AC-5) the pennant is a shaped flag tinted by the onboarding flag colour', () => {
    const ship = readRepo(SHIP_PATH);
    const cosmetics = readRepo(SHIP_COSMETICS_PATH);

    expectOutline(ship, fixture.player.pennant.points, 'pennant');
    expectOutline(ship, fixture.rival.pennant.points, 'jagged pennant');
    expect(ship).toMatch(/c\.pennant/);

    // The flag becomes a COLOUR, never a raster id. `pennantFlagId` was A-013's sprite hook.
    expect(cosmetics).toMatch(/pennant:/);
    expect(cosmetics).not.toMatch(/pennantFlagId/);
    expect(cosmetics).not.toMatch(/sprite/i);
  });

  it('spec(A-045:AC-4) A-031 enemy overlays still ride on the composed ship', () => {
    const ship = readRepo(SHIP_PATH);

    for (const kind of ['pirate', 'skeleton', 'ghost', 'shark']) {
      expect(ship, `${kind} overlay lost`).toMatch(new RegExp(`presentationKind === '${kind}'`));
    }
    expect(ship).toMatch(/KrakenForm|presentationKind === 'kraken'/);
  });

  it("spec(A-045:AC-6) bob, wake and luff loops survive at the board's timings", () => {
    const ship = readRepo(SHIP_PATH);
    const m = fixture.motion;

    expect(ship).toMatch(/useAnimatedStyle/);
    expect(ship).toMatch(/withRepeat/);
    expect(ship, 'bob rotation amplitude').toContain(String(m.bob.rotateDeg));
    expect(ship, 'bob rise').toContain(String(m.bob.riseY));
    expect(ship, 'wake x-shift').toContain(String(Math.abs(m.wake.shiftX)));
    expect(m.luff.scaleXTo).toBe(0.955);
  });
});

describe('A-045 chart ship — the one raster the boards do draw', () => {
  it("spec(A-045:AC-1) the sea chart keeps the board's own top-down ship image", () => {
    const chartShip = readRepo(CHART_SHIP_PATH);

    // The corrections board's Sea chart screen authors `<img … width:42px>` pointing at this exact
    // file. Composing a side-view ship here would be a divergence FROM the design, not toward it.
    expect(chartShip).toMatch(/sprite\.ship01/);
    expect(md5(join(REPO_ROOT, SPRITE_DIR, 'ship-01.png'))).toBe(ARTIFACT_RASTERS['ship-01.png']);
  });
});
