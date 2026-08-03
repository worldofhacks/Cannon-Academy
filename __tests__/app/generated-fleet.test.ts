/**
 * A-064 — a generated fleet: twenty golden ships from board-sanctioned primitives.
 *
 * Ruling D-12: generated ship art ships ONLY as data — enums and counts over the duel board's own
 * geometry, painted with named token swatches. The strict zod schema in
 * `src/content/generatedFleet.ts` is the provenance boundary, and these specs are what make it
 * load-bearing: free hex, duplicate rigging, raw coordinates and the player's red vertical stripe
 * on a rival must all be UNREPRESENTABLE, not merely absent.
 *
 * The frozen A-045/A-052/A-031 surfaces must not move: the ticket's verification command runs
 * `sprites.test.ts`, `ship-skins.test.ts` and `enemy-presentation.test.ts` alongside this file,
 * and AC-2/AC-5 below additionally pin `Ship.tsx`'s exact bytes and the raster inventory so this
 * file fails on its own if the fleet work leaks outside its fence.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  GENERATED_SWATCHES,
  generatedFleet,
  generatedShipSchema,
  generatedShipSvg,
  parseGeneratedFleet,
} from '../../src/content/generatedFleet';
import type { GeneratedShip } from '../../src/content/generatedFleet';
import generatedFleetRaw from '../../src/content/generatedFleet.json';

const REPO_ROOT = join(import.meta.dirname, '../..');
const SHIP_PATH = 'src/components/duel/Ship.tsx';
const GENERATED_SHIP_PATH = 'src/components/duel/GeneratedShip.tsx';
const FLEET_MODULE_PATH = 'src/content/generatedFleet.ts';
const FLEET_JSON_PATH = 'src/content/generatedFleet.json';
const PREVIEW_SCRIPT_PATH = 'scripts/fleet-preview.ts';
const PREVIEW_HTML_PATH = 'design/generated-fleet/preview.html';

/**
 * `Ship.tsx` exactly as it stood when A-064 started. The ticket's hard constraint: geometry is
 * lifted by COPYING, never by editing — so the file's bytes may not move at all. If this fails,
 * someone edited the frozen transcription, and the fix is to revert that edit, not this hash.
 */
const SHIP_TSX_MD5_BEFORE_A064 = 'ab4cd96a826db8a0d3fbba1b7f0f5f34';

function readRepo(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

/** A valid document to mutate from — mirrors the golden shape without depending on the catalog. */
function validDoc(): Record<string, unknown> {
  return {
    id: 'gen_ship_spec_probe',
    displayName: 'Spec Probe',
    role: 'showcase',
    palette: {
      hull: 'woodLight',
      hullDeep: 'woodDeep',
      sail: 'parchment',
      trim: 'amber',
      pennant: 'gold',
      mast: 'wood',
      deck: 'deck',
    },
    hull: { strakes: 2, gunports: 3, sternCastle: true },
    sails: [
      { slot: 'topsail', shape: 'clean', stripe: 'vertical' },
      { slot: 'mainsail', shape: 'clean', stripe: 'band' },
      { slot: 'jib', shape: 'tattered', stripe: 'none' },
    ],
    flag: { shape: 'pennant', emblem: 'star' },
  };
}

describe('A-064 AC-1 — the schema is closed', () => {
  it('spec(A-064:AC-1) a well-formed document strict-parses; unknown keys are rejected at every level', () => {
    expect(generatedShipSchema.safeParse(validDoc()).success).toBe(true);

    const withTopLevel = { ...validDoc(), damage: 4 };
    expect(generatedShipSchema.safeParse(withTopLevel).success).toBe(false);

    const doc = validDoc();
    (doc['palette'] as Record<string, unknown>)['glow'] = 'gold';
    expect(generatedShipSchema.safeParse(doc).success).toBe(false);

    const doc2 = validDoc();
    (doc2['hull'] as Record<string, unknown>)['height'] = 40;
    expect(generatedShipSchema.safeParse(doc2).success).toBe(false);

    const doc3 = validDoc();
    ((doc3['sails'] as Record<string, unknown>[])[0] as Record<string, unknown>)['width'] = 34;
    expect(generatedShipSchema.safeParse(doc3).success).toBe(false);

    const doc4 = validDoc();
    (doc4['flag'] as Record<string, unknown>)['color'] = 'gold';
    expect(generatedShipSchema.safeParse(doc4).success).toBe(false);
  });

  it('spec(A-064:AC-1) free hex is unrepresentable — every palette value is a named token swatch', () => {
    for (const slot of ['hull', 'hullDeep', 'sail', 'trim', 'pennant', 'mast', 'deck']) {
      const doc = validDoc();
      (doc['palette'] as Record<string, unknown>)[slot] = '#FF0000';
      expect(generatedShipSchema.safeParse(doc).success, `palette.${slot} accepted a hex literal`).toBe(
        false,
      );
    }

    // The curated list itself: names only, drawn from the token file, and the player's red
    // vertical stripe colour is NOT on the shelf (D-12 — player identity stays the player's).
    for (const swatch of GENERATED_SWATCHES) {
      expect(swatch).not.toMatch(/#/);
    }
    expect(GENERATED_SWATCHES).not.toContain('sailStripe');
  });

  it('spec(A-064:AC-1) duplicate sail slots are rejected', () => {
    const doc = validDoc();
    (doc['sails'] as { slot: string }[])[1]!.slot = 'topsail';
    const result = generatedShipSchema.safeParse(doc);
    expect(result.success).toBe(false);
  });

  it("spec(A-064:AC-1) a vertical stripe on a rival-role document is rejected; a showcase's parses", () => {
    const rival = validDoc();
    rival['role'] = 'rival';
    expect(
      generatedShipSchema.safeParse(rival).success,
      'a rival-role document carried the vertical stripe',
    ).toBe(false);

    // Same rigging, showcase role: representable. The stripe is role-fenced, not banned.
    expect(validDoc()['role']).toBe('showcase');
    expect(generatedShipSchema.safeParse(validDoc()).success).toBe(true);

    // A rival without vertical stripes parses fine — the fence is the stripe, not the role.
    const plainRival = validDoc();
    plainRival['role'] = 'rival';
    (plainRival['sails'] as { stripe: string }[])[0]!.stripe = 'band';
    expect(generatedShipSchema.safeParse(plainRival).success).toBe(true);
  });

  it("spec(A-064:AC-1) ids are constrained to 'gen_ship_*'", () => {
    for (const bad of ['ship_1', 'gen_ship_', 'GEN_SHIP_LOUD', 'gen_shipx', 'gen_ship_Bad-Name', '']) {
      const doc = validDoc();
      doc['id'] = bad;
      expect(generatedShipSchema.safeParse(doc).success, `id '${bad}' should not parse`).toBe(false);
    }
    const doc = validDoc();
    doc['id'] = 'gen_ship_ok_123';
    expect(generatedShipSchema.safeParse(doc).success).toBe(true);
  });

  it('spec(A-064:AC-1) no field can carry raw coordinates — counts are the only numbers, both bounded ints', () => {
    // Strict schemas reject coordinate-shaped fields wherever they are attached.
    for (const key of ['points', 'x', 'y', 'left', 'bottom', 'anchor']) {
      const doc = validDoc();
      doc[key] = '0,0 100,100';
      expect(generatedShipSchema.safeParse(doc).success, `top-level '${key}' accepted`).toBe(false);
      const doc2 = validDoc();
      ((doc2['sails'] as Record<string, unknown>[])[0] as Record<string, unknown>)[key] = 12;
      expect(generatedShipSchema.safeParse(doc2).success, `sail '${key}' accepted`).toBe(false);
    }

    // Counts stay counts: out-of-range and non-integer values fail.
    for (const [field, value] of [
      ['strakes', 0],
      ['strakes', 4],
      ['gunports', -1],
      ['gunports', 4],
      ['gunports', 1.5],
    ] as const) {
      const doc = validDoc();
      (doc['hull'] as Record<string, unknown>)[field] = value;
      expect(generatedShipSchema.safeParse(doc).success, `hull.${field}=${value} accepted`).toBe(false);
    }

    // And the schema source has exactly two numeric fields, both bounded integers — a future
    // `z.number()` coordinate channel cannot arrive without deleting this spec.
    const source = readRepo(FLEET_MODULE_PATH);
    const numberSites = source.match(/z\.number\(\)/g) ?? [];
    expect(numberSites).toHaveLength(2);
    const boundedIntSites = source.match(/z\.number\(\)\.int\(\)\.min\(\d+\)\.max\(\d+\)/g) ?? [];
    expect(boundedIntSites).toHaveLength(2);
  });

  it('spec(A-064:AC-1) every shipped golden respects the closed schema — no hex, no duplicate slots, no rival vertical stripe', () => {
    // Re-parse the RAW file entry by entry, so a hand-edited golden fails here by name even if
    // some future refactor made the module's import-time validation lazier.
    const raw = generatedFleetRaw as readonly unknown[];
    for (const entry of raw) {
      const result = generatedShipSchema.safeParse(entry);
      expect(
        result.success,
        `golden failed strict parse: ${JSON.stringify(entry).slice(0, 120)}…`,
      ).toBe(true);
    }

    // No '#' anywhere in the committed catalog: hex cannot even be WRITTEN there, parsed or not.
    expect(readRepo(FLEET_JSON_PATH)).not.toMatch(/#/);
  });
});

describe('A-064 AC-2 — any valid document renders, and Ship.tsx never moved', () => {
  it('spec(A-064:AC-2) every golden renders to plain SVG without throwing', () => {
    for (const doc of generatedFleet) {
      const svg = generatedShipSvg(doc);
      expect(svg.startsWith('<svg ')).toBe(true);
      expect(svg).toContain('viewBox="0 0 150 124"');
      expect(svg).toContain('<polygon'); // the hull is always a polygon
      expect(svg).not.toMatch(/NaN|undefined|null/);
      expect(svg).toContain(`aria-label="${doc.displayName}"`);
    }
  });

  it('spec(A-064:AC-2) Ship.tsx is byte-identical to before this ticket', () => {
    const bytes = readFileSync(join(REPO_ROOT, SHIP_PATH));
    expect(createHash('md5').update(bytes).digest('hex')).toBe(SHIP_TSX_MD5_BEFORE_A064);
    // And the frozen file knows nothing of the generated fleet — no re-export, no back-door.
    expect(bytes.toString('utf8')).not.toMatch(/GeneratedShip|generatedFleet/);
  });

  it('spec(A-064:AC-2) GeneratedShip renders through Poly/View/Svg only — no raster, no hex, no reach into Ship.tsx', () => {
    // Same harness pattern as A-045's composition specs: React Native's Flow-typed entry point
    // cannot load duel components in the node runner, so the renderer half is enforced on source
    // text while the shared layer plan is executed for real above.
    const source = readRepo(GENERATED_SHIP_PATH);
    expect(source).toMatch(/from '\.\.\/Poly'/);
    expect(source).toMatch(/buildGeneratedShipLayers/);
    expect(source).not.toMatch(/<Image|sprite\./);
    expect(source).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/); // paint arrives via named swatches only
    expect(source).not.toMatch(/from '\.\/Ship'/); // lifted by copying, never re-exported

    // The schema module resolves colour exclusively from the token file — no literals of its own.
    const fleetModule = readRepo(FLEET_MODULE_PATH);
    expect(fleetModule).toMatch(/from '\.\.\/theme\/tokens\.ts'/);
    expect(fleetModule).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
  });
});

describe('A-064 AC-3 — exactly twenty goldens ship', () => {
  it('spec(A-064:AC-3) the catalog holds exactly 20 strict-parsed goldens with unique ids and no two identical', () => {
    expect(generatedFleet).toHaveLength(20);
    expect((generatedFleetRaw as readonly unknown[]).length).toBe(20);

    const ids = generatedFleet.map((doc) => doc.id);
    expect(new Set(ids).size).toBe(20);
    for (const id of ids) {
      expect(id).toMatch(/^gen_ship_[a-z0-9_]+$/);
    }

    const shapes = generatedFleet.map((doc) => JSON.stringify(doc));
    expect(new Set(shapes).size).toBe(20);

    // The set exercises the schema's whole vocabulary, so the goldens stay a usable few-shot
    // base for future generation rather than twenty near-copies.
    expect(new Set(generatedFleet.map((doc) => doc.role)).size).toBe(2);
    expect(new Set(generatedFleet.map((doc) => doc.flag.emblem)).size).toBe(5);
    expect(new Set(generatedFleet.map((doc) => doc.sails.length)).size).toBe(3);
    expect(new Set(generatedFleet.map((doc) => doc.hull.strakes)).size).toBe(3);
    expect(new Set(generatedFleet.map((doc) => doc.hull.gunports)).size).toBe(4);
  });

  it('spec(A-064:AC-3) every displayName reads for a five-year-old — short, playful, no realistic menace', () => {
    // The real review is the committed eyeball grid; this is the mechanical floor under it.
    const menace = /(blood|death|dead|kill|murder|hell|demon|corpse|knife|slaughter|terror)/i;
    const names = new Set<string>();
    for (const doc of generatedFleet) {
      expect(doc.displayName.length).toBeGreaterThan(0);
      expect(doc.displayName.length).toBeLessThanOrEqual(24);
      expect(doc.displayName.trim()).toBe(doc.displayName);
      expect(doc.displayName, `'${doc.displayName}' reads as realistic menace`).not.toMatch(menace);
      names.add(doc.displayName);
    }
    expect(names.size).toBe(20);
  });

  it('spec(A-064:AC-3) the catalog is validated at import, and a corrupt entry throws naming file and id', () => {
    // The exported catalog IS the parse of the raw file — import-time validation, like enemies.
    expect(generatedFleet).toEqual(parseGeneratedFleet(generatedFleetRaw as readonly unknown[]));
    const moduleSource = readRepo(FLEET_MODULE_PATH);
    expect(moduleSource).toMatch(/generatedFleet[^]*=\s*parseGeneratedFleet\(generatedFleetRaw\)/);

    const bad = validDoc();
    bad['id'] = 'gen_ship_bad_probe';
    (bad['palette'] as Record<string, unknown>)['hull'] = '#123456';
    expect(() => parseGeneratedFleet([bad])).toThrow(/content\/generatedFleet\.json/);
    expect(() => parseGeneratedFleet([bad])).toThrow(/gen_ship_bad_probe/);

    // Duplicate ids across the set collide even when each entry parses alone.
    expect(() => parseGeneratedFleet([validDoc(), validDoc()])).toThrow(/duplicate id/);
  });
});

describe('A-064 AC-4 — the preview grid regenerates byte-for-byte', () => {
  it('spec(A-064:AC-4) running fleet-preview.ts reproduces the committed page and shows all 20 with ids and names', () => {
    const committed = readRepo(PREVIEW_HTML_PATH);

    const scratch = mkdtempSync(join(tmpdir(), 'a064-fleet-preview-'));
    try {
      execFileSync(process.execPath, [join(REPO_ROOT, PREVIEW_SCRIPT_PATH), join(scratch, 'preview.html')], {
        cwd: REPO_ROOT,
        stdio: 'pipe',
      });
      const regenerated = readFileSync(join(scratch, 'preview.html'), 'utf8');
      expect(
        regenerated === committed,
        'design/generated-fleet/preview.html is stale — run `node scripts/fleet-preview.ts` and commit the result',
      ).toBe(true);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }

    for (const doc of generatedFleet) {
      expect(committed).toContain(doc.id);
      expect(committed).toContain(doc.displayName);
    }
    expect(committed.match(/<svg /g)).toHaveLength(20);

    // The page is vector documents only — a raster sneaking into the review grid is the exact
    // failure mode D-12 exists to prevent.
    expect(committed).not.toMatch(/<img|data:image/);
  }, 30_000);
});

describe('A-064 AC-5 — no frozen surface moved', () => {
  it('spec(A-064:AC-5) the raster inventory is untouched: sprites match the A-045 allowlist and no image exists on any authored surface', () => {
    const spriteFiles = readdirSync(join(REPO_ROOT, 'assets/sprites')).filter((f) => f.endsWith('.png'));
    expect(spriteFiles.sort()).toEqual([
      'cannon-mobile.png',
      'cannon.png',
      'cannonball.png',
      'explosion1.png',
      'explosion2.png',
      'explosion3.png',
      'fire1.png',
      'ship-01.png',
      'wood-1.png',
    ]);

    // No raster anywhere the fleet work could have put one. (`assets/source` holds the
    // pre-existing Kenney source packs and `ios/` native icons; both predate this ticket and
    // are outside the authored surfaces a generated ship could ship through.)
    const raster = /\.(png|jpe?g|gif|webp|bmp|avif)$/i;
    const walk = (dir: string): string[] =>
      readdirSync(join(REPO_ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
        const rel = join(dir, entry.name);
        if (entry.isDirectory()) return walk(rel);
        return raster.test(entry.name) ? [rel] : [];
      });
    for (const surface of ['src', 'app', 'design', 'scripts', '__tests__']) {
      expect(walk(surface), `a raster appeared under ${surface}/`).toEqual([]);
    }
  });

  it('spec(A-064:AC-5) generated ships are not ownable: no captain field, no persistence, no skin-catalog reach', () => {
    // Mirrors the A-052 shape lock: paint and silhouette only, no engine meaning, nothing saved.
    for (const path of ['src/stores/player.ts', 'src/services/persistence.ts', 'src/theme/shipSkins.ts']) {
      const source = readRepo(path);
      expect(source, `${path} mentions the generated fleet`).not.toMatch(
        /generatedFleet|GeneratedShip|gen_ship/,
      );
    }

    // And the fleet module reaches neither the engine nor the store layer.
    const fleetModule = readRepo(FLEET_MODULE_PATH);
    expect(fleetModule).not.toMatch(/@engine\//);
    expect(fleetModule).not.toMatch(/stores\//);
    expect(fleetModule).not.toMatch(/damageMin|damageMax|timerMs|unlock/);
  });
});

/** The type-level contract stays honest: a golden is assignable to the inferred document type. */
const _typeProbe: GeneratedShip | undefined = generatedFleet[0];
void _typeProbe;
