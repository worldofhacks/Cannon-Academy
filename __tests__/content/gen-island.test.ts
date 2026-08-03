/**
 * A-078 — the gen-island namespace: `genIslandSchema` + board vocabulary + local deterministic
 * generator.
 *
 * These tests are FROZEN. They pin Tier B's foundation under the amended D-17 ruling and the
 * two-tier law of `docs/ENDLESS-ARCHIPELAGO-DESIGN.md` §1:
 *
 *   - AC-1: the schema is strict — every degenerate island the ticket names is unrepresentable,
 *     each proven by a rejected fixture.
 *   - AC-2: the local generator is deterministic (30 seeds × 3 bands × indices {6,7,12,40}),
 *     every generated document parses its own schema, and every skill sits at or under
 *     `maxGradeForBand(band)` — a k_1 document never carries a ×/÷ skill.
 *   - AC-3: vocabulary fidelity — recipes/slots/pieces/moods equal the Uncharted Sea board's
 *     data-script tables EXACTLY (frozen toEqual pins, hexes verbatim), plus the board's two
 *     mood laws and the 24-char name law.
 *   - AC-4: `IslandId` untouched — the authored world never imports this namespace
 *     (source scan over `src/content/index.ts`, `src/engine/*`, and the four named services).
 *
 * Traceability: every test cites `spec(A-078:AC-n)` in its name.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getSkill } from '@content/index';
import { GRADE_BANDS, SKILL_IDS, type GradeBand, type SkillId } from '@content/schemas';
import { generatedFleet } from '@content/generatedFleet';
import {
  GEN_HULL_MAX,
  GEN_HULL_MIN,
  GEN_ISLAND_ID_PATTERN,
  GEN_MOOD_IDS,
  GEN_MOODS,
  GEN_NAME_MAX,
  GEN_PIECE_IDS,
  GEN_PIECE_SLOTS,
  GEN_RECIPE_GEOMETRY,
  GEN_RECIPE_IDS,
  GEN_RECIPE_SLOTS,
  GEN_SLOT_CAPS,
  GEN_SLOT_IDS,
  genIslandSchema,
  type GenIslandDoc,
} from '@content/genIsland';
import { ENEMY_HULL_BY_ISLAND, PLAYER_HULL } from '@engine/tuning';
import { maxGradeForBand } from '@engine/placement';

import {
  GEN_NAME_ADJECTIVES,
  GEN_NAME_NOUNS,
  generateIsland,
} from '../../src/services/uncharted/generator';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// --- A hand-built valid document every AC-1 rejection mutates from --------------------------------

/** Valid by construction: atoll exposes lagoon+shore; wet_sock is a shipped, known ghost. */
const validDoc = {
  id: 'gen_isle_6',
  index: 6,
  seed: 42,
  displayName: 'The Gilded Haven',
  skills: ['add_within_10'],
  recipe: 'atoll',
  pieces: [
    { piece: 'palms', slot: 'shore' },
    { piece: 'tide_pools', slot: 'lagoon' },
  ],
  mood: 'dawn_gold',
  presentationKind: 'ghost',
  hull: 135,
  rivalDocId: 'gen_ship_wet_sock',
} as const;

describe('genIslandSchema strictness (A-078 AC-1)', () => {
  it('spec(A-078:AC-1) the baseline fixture parses, and its typed output round-trips every field', () => {
    const parsed: GenIslandDoc = genIslandSchema.parse(validDoc);
    expect(parsed).toEqual(validDoc);
  });

  it('spec(A-078:AC-1) an unknown field dies at parse — including a smuggled glyph, which is derived, never a field', () => {
    expect(genIslandSchema.safeParse({ ...validDoc, glyph: '+' }).success).toBe(false);
    expect(genIslandSchema.safeParse({ ...validDoc, sneaky: true }).success).toBe(false);
  });

  it('spec(A-078:AC-1) a lagoon piece on twin or cliff is unrepresentable — skipped elsewhere, never relocated', () => {
    for (const recipe of ['twin', 'cliff'] as const) {
      const result = genIslandSchema.safeParse({
        ...validDoc,
        recipe,
        pieces: [
          { piece: 'palms', slot: 'shore' },
          { piece: 'tide_pools', slot: 'lagoon' },
        ],
      });
      expect(result.success).toBe(false);
    }
  });

  it('spec(A-078:AC-1) a second peak piece is unrepresentable — one summit maximum', () => {
    const result = genIslandSchema.safeParse({
      ...validDoc,
      recipe: 'twin',
      pieces: [
        { piece: 'palms', slot: 'shore' },
        { piece: 'volcano', slot: 'peak' },
        { piece: 'waterfall', slot: 'peak' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('spec(A-078:AC-1) a piece never sits in a slot it does not name — no lighthouse in a lagoon, no volcano on the shore', () => {
    expect(
      genIslandSchema.safeParse({
        ...validDoc,
        pieces: [
          { piece: 'palms', slot: 'shore' },
          { piece: 'lighthouse', slot: 'lagoon' },
        ],
      }).success,
    ).toBe(false);
    expect(
      genIslandSchema.safeParse({
        ...validDoc,
        pieces: [{ piece: 'volcano', slot: 'shore' }],
      }).success,
    ).toBe(false);
  });

  it('spec(A-078:AC-1) the same piece never occupies the same slot twice', () => {
    expect(
      genIslandSchema.safeParse({
        ...validDoc,
        pieces: [
          { piece: 'palms', slot: 'shore' },
          { piece: 'palms', slot: 'shore' },
        ],
      }).success,
    ).toBe(false);
  });

  it('spec(A-078:AC-1) the 24-char banner law: a 24-char name parses, a 25-char name is hard-rejected', () => {
    expect(genIslandSchema.safeParse({ ...validDoc, displayName: 'A'.repeat(GEN_NAME_MAX) }).success).toBe(true);
    expect(genIslandSchema.safeParse({ ...validDoc, displayName: 'A'.repeat(25) }).success).toBe(false);
    expect(genIslandSchema.safeParse({ ...validDoc, displayName: '' }).success).toBe(false);
  });

  it('spec(A-078:AC-1) a skill outside SKILL_IDS is rejected, and skills may not be empty', () => {
    expect(genIslandSchema.safeParse({ ...validDoc, skills: ['calculus'] }).success).toBe(false);
    expect(genIslandSchema.safeParse({ ...validDoc, skills: [] }).success).toBe(false);
  });

  it("spec(A-078:AC-1) an id outside /^gen_isle_[1-9][0-9]*$/ is rejected — and it can never collide with an authored IslandId's shape", () => {
    for (const bad of ['gen_isle_0', 'gen_isle_06', 'gen_isle_', 'gen_isle_6a', 'port_sumwich', 'gen_ship_6', 'GEN_ISLE_6']) {
      expect(genIslandSchema.safeParse({ ...validDoc, id: bad }).success).toBe(false);
    }
    expect(GEN_ISLAND_ID_PATTERN.test('gen_isle_6')).toBe(true);
  });

  it('spec(A-078:AC-1) index below 6 is rejected — the authored chain owns 1..5', () => {
    expect(genIslandSchema.safeParse({ ...validDoc, index: 5 }).success).toBe(false);
    expect(genIslandSchema.safeParse({ ...validDoc, index: 6.5 }).success).toBe(false);
  });

  it('spec(A-078:AC-1) hull is a bounded int: never at or below the Grandline, never above the tuning ceiling', () => {
    expect(GEN_HULL_MIN).toBe(ENEMY_HULL_BY_ISLAND.grandline + 1);
    expect(GEN_HULL_MAX).toBe(4 * PLAYER_HULL);
    expect(genIslandSchema.safeParse({ ...validDoc, hull: ENEMY_HULL_BY_ISLAND.grandline }).success).toBe(false);
    expect(genIslandSchema.safeParse({ ...validDoc, hull: GEN_HULL_MAX + 1 }).success).toBe(false);
    expect(genIslandSchema.safeParse({ ...validDoc, hull: GEN_HULL_MIN }).success).toBe(true);
  });

  it('spec(A-078:AC-1) rivalDocId must be a shipped fleet doc: known (never the ??? mystery row) and of the claimed kind', () => {
    expect(genIslandSchema.safeParse({ ...validDoc, rivalDocId: 'gen_ship_invented' }).success).toBe(false);
    expect(
      genIslandSchema.safeParse({ ...validDoc, presentationKind: 'pirate', rivalDocId: 'gen_ship_mystery' }).success,
    ).toBe(false);
    // Kind mismatch: wet_sock is a ghost, the doc claims pirate.
    expect(genIslandSchema.safeParse({ ...validDoc, presentationKind: 'pirate' }).success).toBe(false);
  });
});

// --- AC-2: determinism, schema closure, and the band ceiling ---------------------------------------

const SWEEP_INDICES = [6, 7, 12, 40] as const;
const SWEEP_SEEDS = Array.from({ length: 30 }, (_, i) => i);
/** The print-safety fence: no multiplication or division symbol before grade 2 (A-051 / D-14). */
const MUL_DIV_SKILLS: ReadonlySet<SkillId> = new Set([
  'mult_facts',
  'div_facts',
  'multi_digit_mult',
  'long_division',
]);

describe('generateIsland determinism and ceiling (A-078 AC-2)', () => {
  it('spec(A-078:AC-2) same (seed,index,band) → deep-equal document, 30 seeds × 3 bands × indices {6,7,12,40}', () => {
    for (const band of GRADE_BANDS) {
      for (const index of SWEEP_INDICES) {
        for (const seed of SWEEP_SEEDS) {
          const first = generateIsland(seed, index, band);
          const second = generateIsland(seed, index, band);
          expect(second).toEqual(first);
          expect(second).not.toBe(first); // a fresh document each call, not a shared reference
        }
      }
    }
  });

  it('spec(A-078:AC-2) every generated document parses its own schema, swept', () => {
    for (const band of GRADE_BANDS) {
      for (const index of SWEEP_INDICES) {
        for (const seed of SWEEP_SEEDS) {
          const doc = generateIsland(seed, index, band);
          const result = genIslandSchema.safeParse(doc);
          expect(result.success).toBe(true);
          expect(doc.id).toBe(`gen_isle_${index}`);
          expect(doc.index).toBe(index);
          expect(doc.seed).toBe(seed);
        }
      }
    }
  });

  it('spec(A-078:AC-2) every skill sits at or under maxGradeForBand(band) — the ceiling sweep', () => {
    for (const band of GRADE_BANDS) {
      const ceiling = maxGradeForBand(band);
      for (const index of SWEEP_INDICES) {
        for (const seed of SWEEP_SEEDS) {
          const doc = generateIsland(seed, index, band);
          expect(doc.skills.length).toBeGreaterThan(0);
          for (const skillId of doc.skills) {
            expect(getSkill(skillId).minGrade).toBeLessThanOrEqual(ceiling);
          }
        }
      }
    }
  });

  it('spec(A-078:AC-2) a k_1 document never contains a ×/÷ skill, swept', () => {
    for (const index of SWEEP_INDICES) {
      for (const seed of SWEEP_SEEDS) {
        const doc = generateIsland(seed, index, 'k_1');
        for (const skillId of doc.skills) {
          expect(MUL_DIV_SKILLS.has(skillId)).toBe(false);
        }
      }
    }
  });

  it('spec(A-078:AC-2) the seed actually steers the deal — 30 seeds at one coordinate do not collapse to one island', () => {
    const shapes = new Set(
      SWEEP_SEEDS.map((seed) => {
        const doc = generateIsland(seed, 6, 'k_1');
        return `${doc.displayName}|${doc.recipe}|${doc.mood}|${doc.rivalDocId}`;
      }),
    );
    expect(shapes.size).toBeGreaterThan(1);
  });

  it('spec(A-078:AC-2) garbage inputs throw instead of dealing: non-integer seed, index under 6, unknown band', () => {
    expect(() => generateIsland(0.5, 6, 'k_1')).toThrow(RangeError);
    expect(() => generateIsland(1, 5, 'k_1')).toThrow(RangeError);
    expect(() => generateIsland(1, 6, 'grade_9' as GradeBand)).toThrow(RangeError);
  });

  it('spec(A-078:AC-2) the hull ramp grows with index above the Grandline and clamps at the ceiling', () => {
    const at6 = generateIsland(0, 6, 'g4_5').hull;
    const at12 = generateIsland(0, 12, 'g4_5').hull;
    const at40 = generateIsland(0, 40, 'g4_5').hull;
    expect(at6).toBeGreaterThan(ENEMY_HULL_BY_ISLAND.grandline);
    expect(at12).toBeGreaterThan(at6);
    expect(at40).toBe(GEN_HULL_MAX);
  });
});

// --- AC-3: vocabulary fidelity — the board tables, pinned exact ------------------------------------

/** Rec. 709 luma — enough to order a light sand against a dark water, which is the board's law. */
const luminance = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * ((n >> 16) & 0xff) + 0.7152 * ((n >> 8) & 0xff) + 0.0722 * (n & 0xff);
};

describe('board vocabulary fidelity (A-078 AC-3)', () => {
  it('spec(A-078:AC-3) the four recipes, four slots, ten pieces and four moods — ids exact, board order', () => {
    expect(GEN_RECIPE_IDS).toEqual(['twin', 'atoll', 'cliff', 'crescent']);
    expect(GEN_SLOT_IDS).toEqual(['peak', 'ridge', 'shore', 'lagoon']);
    expect(GEN_PIECE_IDS).toEqual([
      'palms',
      'waterfall',
      'shipwreck',
      'volcano',
      'lighthouse',
      'arch',
      'tide_pools',
      'bone_gate',
      'beach_hut',
      'ice_floe',
    ]);
    expect(GEN_MOOD_IDS).toEqual(['dawn_gold', 'storm_slate', 'jungle_emerald', 'dusk_violet']);
  });

  it('spec(A-078:AC-3) slot caps: peak 1, ridge 2, shore 3 (board verbatim); lagoon 2 (the closure of its two water pieces)', () => {
    expect(GEN_SLOT_CAPS).toEqual({ peak: 1, ridge: 2, shore: 3, lagoon: 2 });
    // The lagoon cap's derivation, kept honest: exactly two pieces name the lagoon.
    const lagoonPieces = GEN_PIECE_IDS.filter((piece) => GEN_PIECE_SLOTS[piece].includes('lagoon'));
    expect(lagoonPieces).toEqual(['tide_pools', 'ice_floe']);
  });

  it('spec(A-078:AC-3) recipe→slots exactly as the board spec lines declare them', () => {
    expect(GEN_RECIPE_SLOTS).toEqual({
      twin: ['peak', 'ridge', 'shore'],
      atoll: ['lagoon', 'shore'],
      cliff: ['peak', 'ridge', 'shore'],
      crescent: ['lagoon', 'shore', 'ridge'],
    });
  });

  it("spec(A-078:AC-3) piece→slots exactly as the board's ten rows declare them, in each row's own order", () => {
    expect(GEN_PIECE_SLOTS).toEqual({
      palms: ['shore', 'ridge'],
      waterfall: ['peak', 'ridge'],
      shipwreck: ['shore'],
      volcano: ['peak'],
      lighthouse: ['ridge', 'shore'],
      arch: ['shore', 'ridge'],
      tide_pools: ['shore', 'lagoon'],
      bone_gate: ['shore', 'ridge'],
      beach_hut: ['shore'],
      ice_floe: ['shore', 'lagoon'],
    });
  });

  it('spec(A-078:AC-3) the four moods — exactly six named token substitutions each, hexes verbatim from the board chips', () => {
    expect(GEN_MOODS).toEqual({
      dawn_gold: {
        sky: { token: 'sky-low', hex: '#E3F7FF' },
        water: { token: 'sea-crest', hex: '#43B4E0' },
        sand: { token: 'sand', hex: '#F2E1B8' },
        sandDeep: { token: 'sand-deep', hex: '#DCC49A' },
        grass: { token: 'grass', hex: '#7ED07A' },
        grassDeep: { token: 'grass-deep', hex: '#5FA149' },
      },
      storm_slate: {
        sky: { token: 'fog', hex: '#C9D6E4' },
        water: { token: 'sea-deep', hex: '#0C5E86' },
        sand: { token: 'edge', hex: '#D8CBB2' },
        sandDeep: { token: 'edge-deep', hex: '#C9AE7E' },
        grass: { token: 'slate-locked', hex: '#8AA0B4' },
        grassDeep: { token: 'rock', hex: '#5A7288' },
      },
      jungle_emerald: {
        sky: { token: 'sky-top', hex: '#A9E6FF' },
        water: { token: 'sea', hex: '#1584B8' },
        sand: { token: 'surface-sunk', hex: '#F0E2C8' },
        sandDeep: { token: 'edge-deep', hex: '#C9AE7E' },
        grass: { token: 'hull-remaining', hex: '#2FB65E' },
        grassDeep: { token: 'success-deep', hex: '#1E7F41' },
      },
      dusk_violet: {
        sky: { token: 'rival', hex: '#6C4BD6' },
        water: { token: 'rival-deep', hex: '#4A2FA0' },
        sand: { token: 'surface-sunk', hex: '#F0E2C8' },
        sandDeep: { token: 'edge-deep', hex: '#C9AE7E' },
        grass: { token: 'frond', hex: '#2F9E5C' },
        grassDeep: { token: 'rock', hex: '#5A7288' },
      },
    });
  });

  it("spec(A-078:AC-3) the board's mood law: every mood's sand is lighter than its water", () => {
    for (const mood of GEN_MOOD_IDS) {
      const spec = GEN_MOODS[mood];
      expect(luminance(spec.sand.hex)).toBeGreaterThan(luminance(spec.water.hex));
    }
  });

  it("spec(A-078:AC-3) the ISLANDS table geometry rows, transcribed exact — shallowR, sandR, grass box, feature boxes, palms, rocks", () => {
    expect(GEN_RECIPE_GEOMETRY).toEqual({
      twin: {
        shallowR: '52% 48% 44% 56%',
        sandR: '52% 48% 44% 56%',
        grassL: 32, grassT: 24, grassW: 186, grassH: 110,
        grassR: '50% 50% 46% 54%',
        hasTwin: true,
        twinAL: 58, twinAT: 12, twinAW: 86, twinAH: 82,
        twinCapL: 84, twinCapW: 34, twinCapH: 30,
        twinBL: 128, twinBT: 30, twinBW: 68, twinBH: 64,
        palms: [
          { left: 40, top: 96, h: 30, fl: 27, ft: 84 },
          { left: 198, top: 110, h: 26, fl: 185, ft: 99 },
        ],
        rocks: [{ left: 16, top: 132, w: 34, h: 20 }],
      },
      atoll: {
        shallowR: '56% 44% 50% 50%',
        sandR: '50%',
        grassL: 26, grassT: 20, grassW: 198, grassH: 120,
        grassR: '50%',
        hasRing: true,
        ringL: 62, ringT: 44, ringW: 126, ringH: 74,
        palms: [
          { left: 34, top: 84, h: 32, fl: 21, ft: 70 },
          { left: 210, top: 92, h: 28, fl: 197, ft: 80 },
          { left: 120, top: 132, h: 22, fl: 107, ft: 123 },
        ],
        rocks: [],
      },
      cliff: {
        shallowR: '48% 52% 56% 44%',
        sandR: '48% 52% 56% 44%',
        grassL: 30, grassT: 26, grassW: 180, grassH: 104,
        grassR: '46% 54% 52% 48%',
        hasSpire: true,
        spireL: 104, spireT: 2, spireW: 44, spireH: 96,
        palms: [
          { left: 46, top: 104, h: 28, fl: 33, ft: 93 },
          { left: 186, top: 110, h: 24, fl: 173, ft: 100 },
        ],
        rocks: [
          { left: 20, top: 126, w: 32, h: 20 },
          { left: 204, top: 134, w: 28, h: 18 },
        ],
      },
      crescent: {
        shallowR: '60% 40% 44% 56%',
        sandR: '62% 38% 40% 60%',
        grassL: 20, grassT: 18, grassW: 156, grassH: 98,
        grassR: '64% 36% 40% 60%',
        hasLagoon: true,
        lagL: 128, lagT: 58, lagW: 116, lagH: 86,
        palms: [
          { left: 38, top: 88, h: 30, fl: 25, ft: 75 },
          { left: 86, top: 110, h: 24, fl: 73, ft: 100 },
        ],
        rocks: [{ left: 206, top: 30, w: 32, h: 20 }],
      },
    });
  });

  it('spec(A-078:AC-3) the name law: the cap is 24 and every adjective×noun composition fits it', () => {
    expect(GEN_NAME_MAX).toBe(24);
    for (const adjective of GEN_NAME_ADJECTIVES) {
      for (const noun of GEN_NAME_NOUNS) {
        const name = `The ${adjective} ${noun}`;
        expect(name.length).toBeGreaterThanOrEqual(1);
        expect(name.length).toBeLessThanOrEqual(GEN_NAME_MAX);
      }
    }
  });

  it('spec(A-078:AC-3) skills stay the catalog vocabulary and rivals stay the shipped pool — no parallel id space is declared here', () => {
    // The schema's skill enum IS SKILL_IDS and its rival pool IS the shipped fleet: sampled
    // through parses rather than re-pinned, so this suite never forks those catalogs' own pins.
    expect(SKILL_IDS.length).toBeGreaterThan(0);
    expect(generatedFleet.length).toBe(20);
  });
});

// --- AC-4: the authored world never imports this namespace ----------------------------------------

/** Every .ts source under a directory, recursively — mirrors the repo's other source scans. */
function tsFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...tsFilesUnder(full));
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

const FORBIDDEN_IMPORT = /from\s+['"][^'"]*(genIsland|uncharted)[^'"]*['"]/;

describe('the two-tier boundary holds (A-078 AC-4)', () => {
  it('spec(A-078:AC-4) src/content/index.ts never imports the gen-island namespace', () => {
    const source = readFileSync(join(REPO_ROOT, 'src', 'content', 'index.ts'), 'utf8');
    expect(FORBIDDEN_IMPORT.test(source)).toBe(false);
  });

  it('spec(A-078:AC-4) no module under src/engine imports the gen-island namespace', () => {
    for (const file of tsFilesUnder(join(REPO_ROOT, 'src', 'engine'))) {
      expect(FORBIDDEN_IMPORT.test(readFileSync(file, 'utf8')), file).toBe(false);
    }
  });

  it('spec(A-078:AC-4) chart, duelContext, rewardSettlement and encounter never import the gen-island namespace', () => {
    for (const name of ['chart.ts', 'duelContext.ts', 'rewardSettlement.ts', 'encounter.ts']) {
      const source = readFileSync(join(REPO_ROOT, 'src', 'services', name), 'utf8');
      expect(FORBIDDEN_IMPORT.test(source), name).toBe(false);
    }
  });

  it('spec(A-078:AC-4) GenIslandId is never unioned with IslandId: no authored id shape passes the gen pattern', () => {
    // The pattern itself guarantees disjointness — an authored id ('port_sumwich', …) can never
    // match /^gen_isle_/, and the schema build proves ISLAND_IDS stays its own closed enum
    // (schemas.test.ts, untouched). Sample the boundary from this side:
    for (const authored of ['port_sumwich', 'isla_products', 'quotient_cove', 'fraction_reef', 'grandline']) {
      expect(GEN_ISLAND_ID_PATTERN.test(authored)).toBe(false);
    }
  });
});
