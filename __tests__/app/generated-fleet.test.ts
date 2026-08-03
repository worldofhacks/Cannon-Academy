/**
 * The rival fleet catalog — the board's twenty ships, D-12's walls intact.
 *
 * **Re-baselined by A-067** (sanctioned in `tickets/app/A-067.md`, "the A-064 suite is
 * re-baselined to the new catalog citing this ticket in its header"): the catalog is rebuilt to
 * the exact 20-row `FLEET` table of `Cannon Academy Rival Fleet.dc.html` §3b, the schema's
 * parameter set is now the board's own columns (kind, strakes, gunports, castle, sail count,
 * emblem), and paint derives from kind through named tokens instead of per-document palette
 * slots. Every D-12 check A-064 froze is PRESERVED in its new shape:
 *
 *   - **free hex** — a document has no colour field at all; hex anywhere in a document fails the
 *     strict parse, and neither the JSON nor the module may contain a `#` colour literal;
 *   - **slot/rig abuse** — the old duplicate-sail-slot rejection becomes: rigging is a bounded
 *     COUNT, and a document carrying a `sails` array (or any stripe field) is rejected outright;
 *   - **the player's stripe** — there is no stripe channel left to smuggle it through: the module
 *     never touches `sailStripe`, and the emitted SVG never contains its red.
 *
 * The frozen A-045/A-052/A-031 surfaces still must not move: the ticket's verification command
 * runs `sprites.test.ts`, `ship-skins.test.ts` and `enemy-presentation.test.ts` alongside this
 * file, and the specs below additionally pin `Ship.tsx`'s exact bytes and the raster inventory.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  FLEET_KIND_PAINT,
  FLEET_KINDS,
  MYSTERY_NAME,
  generatedFleet,
  generatedShipSchema,
  generatedShipSvg,
  isMysteryShip,
  parseGeneratedFleet,
} from '../../src/content/generatedFleet';
import type { GeneratedShip } from '../../src/content/generatedFleet';
import generatedFleetRaw from '../../src/content/generatedFleet.json';
import { color } from '../../src/theme/tokens';

const REPO_ROOT = join(import.meta.dirname, '../..');
const SHIP_PATH = 'src/components/duel/Ship.tsx';
const GENERATED_SHIP_PATH = 'src/components/duel/GeneratedShip.tsx';
const FLEET_MODULE_PATH = 'src/content/generatedFleet.ts';
const FLEET_JSON_PATH = 'src/content/generatedFleet.json';
const PREVIEW_SCRIPT_PATH = 'scripts/fleet-preview.ts';
const PREVIEW_HTML_PATH = 'design/generated-fleet/preview.html';

/**
 * `Ship.tsx` exactly as it stood when A-064 started, and A-067 after it. The hard constraint both
 * tickets share: geometry is lifted by COPYING, never by editing — so the file's bytes may not
 * move at all. If this fails, someone edited the frozen transcription; the fix is to revert that
 * edit, not this hash.
 */
const SHIP_TSX_MD5_BEFORE_A064 = 'ab4cd96a826db8a0d3fbba1b7f0f5f34';

/**
 * The board's `FLEET` table, `Cannon Academy Rival Fleet.dc.html` §3b, row for row:
 * [name, kind, strakes, gunports, sailCount, sternCastle, emblem]. This is the design authority
 * the shipped catalog must match byte-for-byte and column-for-column (A-067 AC-1) — a catalog row
 * drifting from it fails here BY NAME.
 */
const BOARD_FLEET: readonly (readonly [
  string,
  GeneratedShip['kind'],
  number,
  number,
  number,
  boolean,
  GeneratedShip['emblem'],
])[] = [
  ['Bone Biscuit', 'skeleton', 2, 2, 2, false, 'bones'],
  ['Soggy Doom', 'pirate', 3, 3, 2, true, 'skull'],
  ['The Grumbling Gull', 'pirate', 2, 1, 1, false, 'star'],
  ['Puddle Menace', 'ghost', 1, 0, 1, false, 'star'],
  ['Captain Crumb', 'pirate', 2, 2, 2, false, 'bones'],
  ['Rusty Kettle', 'skeleton', 3, 2, 2, true, 'skull'],
  ['Wet Sock', 'ghost', 1, 1, 1, false, 'fish'],
  ['Toothy Nibbler', 'shark', 2, 2, 2, false, 'fish'],
  ['The Damp Terror', 'ghost', 2, 1, 2, true, 'skull'],
  ['Barnacle Betty', 'pirate', 3, 3, 3, true, 'bones'],
  ['Sir Snaps', 'shark', 2, 3, 2, false, 'fish'],
  ['Old Mopbucket', 'skeleton', 2, 1, 1, false, 'bones'],
  ['Squid Pickle', 'kraken', 3, 2, 2, true, 'fish'],
  ['The Cranky Crumpet', 'pirate', 2, 2, 2, false, 'star'],
  ['Grim Gravy', 'skeleton', 3, 3, 3, true, 'skull'],
  ['Foggy Fright', 'ghost', 2, 0, 2, false, 'star'],
  ['Chomp Muffin', 'shark', 3, 2, 3, true, 'fish'],
  ['Tentacle Trouble', 'kraken', 3, 3, 3, true, 'skull'],
  ['The Last Grumble', 'kraken', 3, 3, 3, true, 'bones'],
  ['???', 'pirate', 2, 2, 2, false, 'star'],
];

function readRepo(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

/** A valid document to mutate from — mirrors the roster shape without depending on the catalog. */
function validDoc(): Record<string, unknown> {
  return {
    id: 'gen_ship_spec_probe',
    displayName: 'Spec Probe',
    kind: 'pirate',
    hull: { strakes: 2, gunports: 3, sternCastle: true },
    sailCount: 2,
    emblem: 'star',
  };
}

describe('A-064 AC-1 — the schema is closed (re-baselined to the A-067 parameter set)', () => {
  it('spec(A-064:AC-1) a well-formed document strict-parses; unknown keys are rejected at every level', () => {
    expect(generatedShipSchema.safeParse(validDoc()).success).toBe(true);

    const withTopLevel = { ...validDoc(), damage: 4 };
    expect(generatedShipSchema.safeParse(withTopLevel).success).toBe(false);

    const doc = validDoc();
    (doc['hull'] as Record<string, unknown>)['height'] = 40;
    expect(generatedShipSchema.safeParse(doc).success).toBe(false);

    const doc2 = validDoc();
    doc2['palette'] = { hull: 'gold' };
    expect(generatedShipSchema.safeParse(doc2).success).toBe(false);

    const doc3 = validDoc();
    doc3['flag'] = { shape: 'pennant', emblem: 'star' };
    expect(generatedShipSchema.safeParse(doc3).success).toBe(false);
  });

  it('spec(A-064:AC-1) free hex is unrepresentable — no document field carries colour, and kind paint is named tokens only', () => {
    // A hex literal fails wherever it is attached: the schema has no colour-shaped field at all.
    for (const key of ['hull', 'sail', 'trim', 'paint', 'colour', 'color']) {
      const doc = validDoc();
      doc[key] = '#FF0000';
      expect(generatedShipSchema.safeParse(doc).success, `'${key}' accepted a hex literal`).toBe(false);
    }
    const kindHex = validDoc();
    kindHex['kind'] = '#FF0000';
    expect(generatedShipSchema.safeParse(kindHex).success).toBe(false);

    // The kind→paint table is token NAMES resolving through tokens.ts — and the player's red
    // vertical stripe colour is not on the shelf (D-12: player identity stays the player's).
    for (const kind of FLEET_KINDS) {
      const names = FLEET_KIND_PAINT[kind];
      for (const name of [names.hull, names.hullDeep, names.sail]) {
        expect(name).not.toMatch(/#/);
        expect(name).not.toBe('sailStripe');
        expect(color[name], `paint name '${name}' is not a token`).toMatch(/^#[0-9A-F]{6}$/i);
      }
    }
  });

  it('spec(A-064:AC-1) rig abuse is rejected — sails are a bounded count, and the old slot/stripe channels are unrepresentable', () => {
    // The stripe rejection, in its A-067 shape: there is no sail-object channel left at all. A
    // document trying to carry one — striped, duplicated, or otherwise — fails the strict parse.
    const withSails = validDoc();
    withSails['sails'] = [{ slot: 'topsail', shape: 'clean', stripe: 'vertical' }];
    expect(generatedShipSchema.safeParse(withSails).success).toBe(false);

    const withStripe = validDoc();
    withStripe['stripe'] = 'vertical';
    expect(generatedShipSchema.safeParse(withStripe).success).toBe(false);

    for (const bad of [0, 4, 1.5, -1]) {
      const doc = validDoc();
      doc['sailCount'] = bad;
      expect(generatedShipSchema.safeParse(doc).success, `sailCount=${bad} accepted`).toBe(false);
    }
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

  it('spec(A-064:AC-1) no field can carry raw coordinates — counts are the only numbers, all bounded ints', () => {
    // Strict schemas reject coordinate-shaped fields wherever they are attached.
    for (const key of ['points', 'x', 'y', 'left', 'bottom', 'anchor']) {
      const doc = validDoc();
      doc[key] = '0,0 100,100';
      expect(generatedShipSchema.safeParse(doc).success, `top-level '${key}' accepted`).toBe(false);
      const doc2 = validDoc();
      (doc2['hull'] as Record<string, unknown>)[key] = 12;
      expect(generatedShipSchema.safeParse(doc2).success, `hull '${key}' accepted`).toBe(false);
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

    // And the schema source has exactly three numeric fields (strakes, gunports, sailCount), all
    // bounded integers — a future `z.number()` coordinate channel cannot arrive without deleting
    // this spec. (Was two under A-064; the third is the board's SAIL column. A-067.)
    const source = readRepo(FLEET_MODULE_PATH);
    const numberSites = source.match(/z\.number\(\)/g) ?? [];
    expect(numberSites).toHaveLength(3);
    const boundedIntSites = source.match(/z\.number\(\)\.int\(\)\.min\(\d+\)\.max\(\d+\)/g) ?? [];
    expect(boundedIntSites).toHaveLength(3);
  });

  it('spec(A-064:AC-1) every shipped row respects the closed schema, and hex cannot even be written in the file', () => {
    // Re-parse the RAW file entry by entry, so a hand-edited row fails here by name even if some
    // future refactor made the module's import-time validation lazier.
    const raw = generatedFleetRaw as readonly unknown[];
    for (const entry of raw) {
      const result = generatedShipSchema.safeParse(entry);
      expect(
        result.success,
        `roster row failed strict parse: ${JSON.stringify(entry).slice(0, 120)}…`,
      ).toBe(true);
    }

    // No '#' colour anywhere in the committed catalog… except the one board-authored name that IS
    // three question marks, which is why this is a hex check and not a character ban.
    expect(readRepo(FLEET_JSON_PATH)).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(readRepo(FLEET_JSON_PATH)).not.toMatch(/"#/);
  });
});

describe('A-067 AC-1 — the catalog IS the board roster', () => {
  it('spec(A-067:AC-1) twenty documents, names byte-equal, every parameter column matching board 3b', () => {
    expect(generatedFleet).toHaveLength(BOARD_FLEET.length);
    for (let index = 0; index < BOARD_FLEET.length; index += 1) {
      const [name, kind, strakes, gunports, sailCount, sternCastle, emblem] = BOARD_FLEET[
        index
      ] as (typeof BOARD_FLEET)[number];
      const doc = generatedFleet[index] as GeneratedShip;
      expect(doc.displayName, `row ${index} name`).toBe(name);
      expect(doc.kind, `${name} kind`).toBe(kind);
      expect(doc.hull.strakes, `${name} strakes`).toBe(strakes);
      expect(doc.hull.gunports, `${name} gunports`).toBe(gunports);
      expect(doc.sailCount, `${name} sailCount`).toBe(sailCount);
      expect(doc.hull.sternCastle, `${name} castle`).toBe(sternCastle);
      expect(doc.emblem, `${name} emblem`).toBe(emblem);
    }
  });

  it('spec(A-067:AC-1) the ??? row is real data — one mystery ship, last on the shelf, never two', () => {
    const mysteries = generatedFleet.filter(isMysteryShip);
    expect(mysteries).toHaveLength(1);
    expect(mysteries[0]?.displayName).toBe(MYSTERY_NAME);
    expect(generatedFleet[generatedFleet.length - 1]?.displayName).toBe(MYSTERY_NAME);
  });
});

describe('A-064 AC-2 — any valid document renders, and Ship.tsx never moved', () => {
  it('spec(A-064:AC-2) every roster row renders to plain SVG without throwing, and never in the player stripe red', () => {
    for (const doc of generatedFleet) {
      const svg = generatedShipSvg(doc);
      expect(svg.startsWith('<svg ')).toBe(true);
      expect(svg).toContain('viewBox="0 0 150 124"');
      expect(svg).toContain('<polygon'); // the hull is always a polygon
      expect(svg).not.toMatch(/NaN|undefined|null/);
      expect(svg).toContain(`aria-label="${doc.displayName}"`);
      // D-12's stripe wall, verified on the OUTPUT: the player's red never paints a rival.
      expect(svg.toUpperCase()).not.toContain(color.sailStripe.toUpperCase());
    }
  });

  it('spec(A-064:AC-2) Ship.tsx is byte-identical to before this ticket', () => {
    const bytes = readFileSync(join(REPO_ROOT, SHIP_PATH));
    expect(createHash('md5').update(bytes).digest('hex')).toBe(SHIP_TSX_MD5_BEFORE_A064);
    // And the frozen file knows nothing of the generated fleet — no re-export, no back-door.
    expect(bytes.toString('utf8')).not.toMatch(/GeneratedShip|generatedFleet/);
  });

  it('spec(A-064:AC-2) GeneratedShip renders through Poly/View only — no raster, no hex, no stripe, no reach into Ship.tsx', () => {
    // Same harness pattern as A-045's composition specs: React Native's Flow-typed entry point
    // cannot load duel components in the node runner, so the renderer half is enforced on source
    // text while the shared layer plan is executed for real above.
    const source = readRepo(GENERATED_SHIP_PATH);
    expect(source).toMatch(/from '\.\.\/Poly'/);
    expect(source).toMatch(/buildGeneratedShipLayers/);
    expect(source).not.toMatch(/<Image|sprite\./);
    expect(source).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/); // paint arrives via named tokens only
    expect(source).not.toMatch(/from '\.\/Ship'/); // lifted by copying, never re-exported
    expect(source).not.toMatch(/sailStripe|stripedPoly/); // A-067: no stripe path exists at all

    // The schema module resolves colour exclusively from the token file — no literals of its own.
    // Its ONE legal mention of the player's stripe is the type-level ban: the paint-name type
    // excludes `sailStripe`, so writing it into the kind table is a compile error, and the module
    // never actually reads it.
    const fleetModule = readRepo(FLEET_MODULE_PATH);
    expect(fleetModule).toMatch(/from '\.\.\/theme\/tokens\.ts'/);
    expect(fleetModule).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(fleetModule).toMatch(/Exclude<keyof typeof color, 'sailStripe'>/);
    expect(fleetModule).not.toMatch(/color\.sailStripe|sailStripe:/);
  });
});

describe('A-064 AC-3 — exactly twenty ships ship', () => {
  it('spec(A-064:AC-3) the catalog holds exactly 20 strict-parsed rows with unique ids and names, no two identical', () => {
    expect(generatedFleet).toHaveLength(20);
    expect((generatedFleetRaw as readonly unknown[]).length).toBe(20);

    const ids = generatedFleet.map((doc) => doc.id);
    expect(new Set(ids).size).toBe(20);
    for (const id of ids) {
      expect(id).toMatch(/^gen_ship_[a-z0-9_]+$/);
    }

    const shapes = generatedFleet.map((doc) => JSON.stringify(doc));
    expect(new Set(shapes).size).toBe(20);

    // The set exercises the schema's whole vocabulary — every kind, every emblem, every count.
    // (Re-baselined from A-064's spread: roles are gone, emblems are the board's four. A-067.)
    expect(new Set(generatedFleet.map((doc) => doc.kind)).size).toBe(5);
    expect(new Set(generatedFleet.map((doc) => doc.emblem)).size).toBe(4);
    expect(new Set(generatedFleet.map((doc) => doc.sailCount)).size).toBe(3);
    expect(new Set(generatedFleet.map((doc) => doc.hull.strakes)).size).toBe(3);
    expect(new Set(generatedFleet.map((doc) => doc.hull.gunports)).size).toBe(4);
  });

  it('spec(A-064:AC-3) every displayName reads for a five-year-old — short, playful, menace collapsed by pairing', () => {
    // The real review is the committed eyeball grid plus the board's own naming note: "a menacing
    // word next to a domestic one, so the pairing collapses the threat". The board authors 'Soggy
    // Doom' and 'The Damp Terror' under that rule, so this floor bans REALISTIC menace only.
    // (Re-baselined by A-067: 'terror' left the ban list because the board shipped it, damp.)
    const menace = /(blood|death|dead|kill|murder|hell|demon|corpse|knife|slaughter)/i;
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
    bad['kind'] = 'dragon';
    expect(() => parseGeneratedFleet([bad])).toThrow(/content\/generatedFleet\.json/);
    expect(() => parseGeneratedFleet([bad])).toThrow(/gen_ship_bad_probe/);

    // Duplicate ids across the set collide even when each entry parses alone.
    expect(() => parseGeneratedFleet([validDoc(), validDoc()])).toThrow(/duplicate/);
  });
});

describe('A-064 AC-4 — the preview grid regenerates byte-for-byte', () => {
  it('spec(A-064:AC-4) running fleet-preview.ts reproduces the committed page and shows all 20 with ids and names', () => {
    const committed = readRepo(PREVIEW_HTML_PATH);

    const scratch = mkdtempSync(join(tmpdir(), 'a067-fleet-preview-'));
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

  it('spec(A-064:AC-5) fleet ships are not ownable: no captain field, no persistence import, no skin-catalog reach', () => {
    // Mirrors the A-052 shape lock: paint and silhouette only, no engine meaning, nothing OWNED.
    // `captain.metRivals` (A-067) is a met LEDGER, not ownership — the ids reach it as opaque
    // strings through settlement, so the store, persistence and skin layers still never import
    // the catalog or name its types.
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

/** The type-level contract stays honest: a roster row is assignable to the inferred document type. */
const _typeProbe: GeneratedShip | undefined = generatedFleet[0];
void _typeProbe;
