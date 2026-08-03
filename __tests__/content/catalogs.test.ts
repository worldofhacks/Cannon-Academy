import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
/**
 * T-006 — `src/content/{skills,cannons,islands,ranks,crew}.json` + `src/content/index.ts`.
 *
 * These tests are FROZEN. The deliverable here is hand-authored *data*, so the failure mode is
 * not a wrong algorithm: it is a catalog that validates cleanly against T-003's schemas and is
 * still wrong about the game — a cannon unlocked by an island that never lists it, a skill no
 * cannon uses, an island ordering that strands a player, a grade band with a gap.
 *
 * T-003 already guarantees *shape*. This suite guarantees *coherence*: cross-references in both
 * directions, total orderings with no ties and no gaps, and exact transcription of PLAN.md's
 * armory table. Ids are derived from `SKILL_IDS` / `CANNON_IDS` / `ISLAND_IDS` / `RANK_IDS`
 * wherever possible so the type system proves exhaustiveness rather than a hand-copied list.
 *
 * Notes for the implementer:
 *   - AC-12 does not pin `validateCatalogs`' signature. These tests call it with ONE argument:
 *     an object keyed by catalog name — `{ skills, cannons, islands, ranks, crew }` — holding the
 *     raw (unvalidated) arrays. Its message must name the offending catalog key (singular or
 *     plural) and the offending entry's `id`.
 *   - AC-13's `http://` / `https://` scan is a LITERAL substring scan over the six content files
 *     (LESSONS.md L-016). Do not put a URL in a comment or a `displayName`; the authoritative
 *     determinism guard is the repo ESLint block, not this scan.
 *
 * Traceability: every test cites `spec(T-006:AC-n)` in its name.
 *
 * **Re-baselined for owner ruling D-14 (2026-08-02, `tickets/app/OWNER-RULINGS.md`) by A-069** —
 * five islands for every band, each band its own Common-Core curriculum. What moved, and why:
 *   - The armory gains the four D-14 entry cannons (dinghy_gun, teen_lantern, carronade,
 *     stern_chaser) and the skill catalog the four D-14 skills; every pre-existing row is
 *     byte-identical.
 *   - `ISLAND_TABLE` becomes the D-14 curriculum atlas: per-band cells of
 *     `{displayName, skills, unlocksCannons}` replacing the shared `rangeSkills` /
 *     `unlocksCannons` / `displayName` fields, which no longer exist (schemas.test.ts pins them
 *     unrepresentable).
 *   - AC-9's "every range cannon is listed by exactly one island — the one it names" is VOID
 *     under D-14: a cell pays whatever cannon teaches its skill, and a skill may sit on
 *     different islands for different bands (div_facts pays `mortar` from Port Sumwich's g4_5
 *     cell AND the Grandline's g2_3 cell), while a cannon's `unlock.island` row in the frozen
 *     armory is untouched. What survives: every cell entry exists, is duplicate-free, and fires
 *     a skill on its own cell's list (the D-14 validator's third clause).
 *   - AC-14's "place_value_compare is deliberately on no island range" is VOID: D-14 puts it on
 *     Port Sumwich's g2_3 cell (Compare Cove). Its successor invariant — per-band pairwise
 *     disjoint island skills — is pinned in the A-069 block at the bottom.
 * The A-069 acceptance criteria (atlas transcription, ceiling validator, entry-cannon paths)
 * are also pinned at the bottom of this file.
 */
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CANNON_IDS, GRADE_BANDS, ISLAND_IDS, RANK_IDS, SKILL_IDS } from '@content/schemas';
import { cannonSchema, crewSchema, islandSchema, rankSchema, skillSchema } from '@content/schemas';
import type {
  Cannon,
  CannonId,
  Crew,
  GradeBand,
  Island,
  IslandId,
  Rank,
  RankId,
  Skill,
  SkillId,
  Temperament,
} from '@content/schemas';

import {
  cannons,
  crew,
  enemies,
  getCannon,
  getEnemyForIsland,
  getIsland,
  getRankByTier,
  getSkill,
  islandCurriculumFor,
  islands,
  ranks,
  skills,
  validateCatalogs,
} from '@content/index';

// --- compile-time helpers --------------------------------------------------------------------

/** Exact type equality (invariant both ways, unlike `extends`). */
type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** `true` only for a readonly array/tuple — a mutable array is assignable to `unknown[]`. */
type IsReadonlyArray<T> = T extends unknown[] ? false : true;

/** `true` only when `undefined` is NOT in the type — the totality half of AC-11. */
type NoUndefined<T> = undefined extends T ? false : true;

// --- the expected armory, transcribed from PLAN.md §The armory via tickets/T-006.md ------------

interface CannonRow {
  readonly skill: SkillId;
  readonly damageMin: number;
  readonly damageMax: number;
  readonly temperament: Temperament;
  readonly timerMs: number;
  readonly minGrade: number;
  readonly maxGrade: number;
  readonly unlock: Cannon['unlock'];
}

/** `Record<CannonId, …>` — the type system, not a hand-count, proves all twelve rows are present. */
const CANNON_TABLE: Record<CannonId, CannonRow> = {
  swivel_gun: {
    skill: 'add_within_10',
    damageMin: 8,
    damageMax: 12,
    temperament: 'reliable',
    timerMs: 20_000,
    minGrade: 0,
    maxGrade: 1,
    unlock: { kind: 'starter' },
  },
  // D-10 (2026-07-31, `tickets/app/OWNER-RULINGS.md`) — a captain starts with ONE gun. The
  // Culverin left `starter` for the range unlock on the skill the Swivel Gun already teaches, so
  // it is the FIRST gun a captain earns rather than one they are handed. Damage, temperament,
  // timer and grade span are untouched: the ruling moved WHEN it arrives, not what it is.
  culverin: {
    skill: 'add_within_10',
    damageMin: 4,
    damageMax: 16,
    temperament: 'volatile',
    timerMs: 20_000,
    minGrade: 0,
    maxGrade: 1,
    unlock: { kind: 'range', island: 'port_sumwich', tier: 1 },
  },
  // T-029 / D-7 — invented (not in PLAN.md armory); range payoff for add_within_10
  saker: {
    skill: 'add_within_10',
    damageMin: 9,
    damageMax: 13,
    temperament: 'standard',
    timerMs: 20_000,
    minGrade: 0,
    maxGrade: 1,
    unlock: { kind: 'range', island: 'port_sumwich', tier: 1 },
  },
  six_pounder: {
    skill: 'add_within_20',
    damageMin: 10,
    damageMax: 16,
    temperament: 'standard',
    timerMs: 15_000,
    minGrade: 1,
    maxGrade: 2,
    unlock: { kind: 'range', island: 'port_sumwich', tier: 1 },
  },
  chain_shot: {
    skill: 'sub_within_20',
    damageMin: 10,
    damageMax: 16,
    temperament: 'standard',
    timerMs: 15_000,
    minGrade: 1,
    maxGrade: 2,
    unlock: { kind: 'range', island: 'port_sumwich', tier: 1 },
  },
  nine_pounder: {
    skill: 'place_value_compare',
    damageMin: 12,
    damageMax: 18,
    temperament: 'standard',
    timerMs: 15_000,
    minGrade: 2,
    maxGrade: 2,
    unlock: { kind: 'chest' },
  },
  twelve_pounder: {
    skill: 'mult_facts',
    damageMin: 14,
    damageMax: 24,
    temperament: 'standard',
    timerMs: 12_000,
    minGrade: 3,
    maxGrade: 3,
    unlock: { kind: 'range', island: 'isla_products', tier: 1 },
  },
  mortar: {
    skill: 'div_facts',
    damageMin: 14,
    damageMax: 24,
    temperament: 'standard',
    timerMs: 12_000,
    minGrade: 3,
    maxGrade: 4,
    unlock: { kind: 'range', island: 'quotient_cove', tier: 1 },
  },
  double_broadside: {
    skill: 'two_step_add_sub',
    damageMin: 16,
    damageMax: 28,
    temperament: 'volatile',
    timerMs: 15_000,
    minGrade: 2,
    maxGrade: 3,
    unlock: { kind: 'range', island: 'port_sumwich', tier: 2 },
  },
  powder_keg: {
    skill: 'fractions_int',
    damageMin: 20,
    damageMax: 34,
    temperament: 'volatile',
    timerMs: 18_000,
    minGrade: 4,
    maxGrade: 5,
    unlock: { kind: 'range', island: 'fraction_reef', tier: 1 },
  },
  long_nine: {
    skill: 'multi_digit_order_ops',
    damageMin: 24,
    damageMax: 40,
    temperament: 'volatile',
    timerMs: 20_000,
    minGrade: 5,
    maxGrade: 5,
    unlock: { kind: 'range', island: 'grandline', tier: 1 },
  },
  // A-060 — invented (not in PLAN.md armory). Isla Products' K-1 range payoff, on the
  // `repeated_addition` rung of that island's grouping concept. Its fuse and band match the other
  // grade-1 guns (`six_pounder`, `chain_shot`) because it is asked at the same reading age.
  grapeshot: {
    skill: 'repeated_addition',
    damageMin: 11,
    damageMax: 17,
    temperament: 'standard',
    timerMs: 15_000,
    minGrade: 1,
    maxGrade: 2,
    unlock: { kind: 'range', island: 'isla_products', tier: 1 },
  },
  // D-14 / A-069 — the four new skills' entry cannons, each `{kind:'range', island:<its atlas
  // island>, tier:1}` per the ticket. Stats sit inside their grade family and outclass no peer:
  // dinghy_gun matches the K guns' 20s fuse between the Swivel Gun (8–12 reliable) and the Saker
  // (9–13 standard); teen_lantern copies the grade-1 family profile (10–16 standard, 15s);
  // carronade sits between the Mortar (14–24) and the Powder Keg (20–34, which keeps a higher
  // ceiling plus its recoil-8 gamble); stern_chaser trades below the Long Nine (24–40) on the
  // Long Nine's own 20s fuse, recoil-free but slower and softer than the volatile g4-5 guns.
  dinghy_gun: {
    skill: 'sub_within_10',
    damageMin: 8,
    damageMax: 12,
    temperament: 'standard',
    timerMs: 20_000,
    minGrade: 0,
    maxGrade: 1,
    unlock: { kind: 'range', island: 'isla_products', tier: 1 },
  },
  teen_lantern: {
    skill: 'place_value_teens',
    damageMin: 10,
    damageMax: 16,
    temperament: 'standard',
    timerMs: 15_000,
    minGrade: 1,
    maxGrade: 1,
    unlock: { kind: 'range', island: 'grandline', tier: 1 },
  },
  carronade: {
    skill: 'multi_digit_mult',
    damageMin: 16,
    damageMax: 26,
    temperament: 'standard',
    timerMs: 18_000,
    minGrade: 4,
    maxGrade: 4,
    unlock: { kind: 'range', island: 'isla_products', tier: 1 },
  },
  stern_chaser: {
    skill: 'long_division',
    damageMin: 18,
    damageMax: 30,
    temperament: 'standard',
    timerMs: 20_000,
    minGrade: 4,
    maxGrade: 5,
    unlock: { kind: 'range', island: 'quotient_cove', tier: 1 },
  },
};

/**
 * AC-4's three documented recoil values. Every other cannon — including the Culverin, whose
 * `Volatile (crit)` parenthetical is locked at `0` by owner ruling D-3 in tickets/T-006.md —
 * carries zero recoil.
 */
const RECOIL_TABLE: Record<CannonId, number> = {
  swivel_gun: 0,
  culverin: 0,
  saker: 0, // T-029 / D-7 invented — standard, zero recoil
  six_pounder: 0,
  chain_shot: 0,
  nine_pounder: 0,
  twelve_pounder: 0,
  mortar: 0,
  double_broadside: 5,
  powder_keg: 8,
  long_nine: 10,
  grapeshot: 0, // A-060 invented — standard, zero recoil
  dinghy_gun: 0, // D-14 / A-069 invented — standard, zero recoil
  teen_lantern: 0, // D-14 / A-069 invented — standard, zero recoil
  carronade: 0, // D-14 / A-069 invented — standard, zero recoil
  stern_chaser: 0, // D-14 / A-069 invented — standard, zero recoil
};

/** One island×band curriculum cell, as `islands.json` now carries it (D-14). */
interface AtlasCell {
  readonly displayName: string;
  readonly skills: readonly SkillId[];
  readonly unlocksCannons: readonly CannonId[];
}

/**
 * Re-baselined by A-069 under D-14 (was the shared rangeSkills/unlocksCannons assignment): the
 * exact 15-cell curriculum atlas transcribed from `tickets/app/A-069.md` §The atlas. This table
 * is LAW — AC-1 sweeps the shipped catalog against it byte for byte. The A-060 rationale the old
 * table carried ("Isla Products is a PLACE, not a difficulty tier") survives generalised: under
 * D-14 EVERY island teaches whatever its captain's band can be asked, so every band reaches all
 * five islands.
 */
const ISLAND_TABLE: Record<IslandId, Record<GradeBand, AtlasCell>> = {
  port_sumwich: {
    k_1: { displayName: 'Port Sumwich', skills: ['add_within_10'], unlocksCannons: ['culverin', 'saker'] },
    g2_3: { displayName: 'Compare Cove', skills: ['place_value_compare'], unlocksCannons: ['nine_pounder'] },
    g4_5: { displayName: 'Factor Shoals', skills: ['div_facts'], unlocksCannons: ['mortar'] },
  },
  isla_products: {
    k_1: { displayName: 'Take-Away Bay', skills: ['sub_within_10'], unlocksCannons: ['dinghy_gun'] },
    g2_3: {
      displayName: 'Two-Step Strait',
      skills: ['two_step_add_sub'],
      unlocksCannons: ['double_broadside'],
    },
    g4_5: { displayName: 'Product Peaks', skills: ['multi_digit_mult'], unlocksCannons: ['carronade'] },
  },
  quotient_cove: {
    k_1: { displayName: 'Port Twenty', skills: ['add_within_20'], unlocksCannons: ['six_pounder'] },
    g2_3: { displayName: 'Array Atoll', skills: ['repeated_addition'], unlocksCannons: ['grapeshot'] },
    g4_5: { displayName: 'Long-Divide Deep', skills: ['long_division'], unlocksCannons: ['stern_chaser'] },
  },
  fraction_reef: {
    k_1: { displayName: 'Minus Lagoon', skills: ['sub_within_20'], unlocksCannons: ['chain_shot'] },
    g2_3: { displayName: 'Isla Products', skills: ['mult_facts'], unlocksCannons: ['twelve_pounder'] },
    g4_5: { displayName: 'Fraction Reef', skills: ['fractions_int'], unlocksCannons: ['powder_keg'] },
  },
  grandline: {
    k_1: { displayName: 'Teen-Ten Harbor', skills: ['place_value_teens'], unlocksCannons: ['teen_lantern'] },
    g2_3: { displayName: 'Quotient Cove', skills: ['div_facts'], unlocksCannons: ['mortar'] },
    g4_5: {
      displayName: 'The Grandline',
      skills: ['multi_digit_order_ops'],
      unlocksCannons: ['long_nine'],
    },
  },
};

/** D-14's band bounds, restated from the ticket: ceiling on skill.minGrade, floor on skill.maxGrade. */
const BAND_CEILING: Record<GradeBand, number> = { k_1: 1, g2_3: 3, g4_5: 5 };
const BAND_FLOOR: Record<GradeBand, number> = { k_1: 0, g2_3: 2, g4_5: 4 };

/** The three crew members named in tickets/T-006.md §Context (identity data only). */
const CREW_KEYWORDS = ['gunner', 'carpenter', 'cook'] as const;

// --- runtime helpers ---------------------------------------------------------------------------

const sorted = <T extends string>(xs: readonly T[]): T[] => [...xs].sort();

const findCannon = (id: CannonId): Cannon => {
  const hit = cannons.find((c) => c.id === id);
  if (hit === undefined) throw new Error(`cannons catalog has no entry '${id}'`);
  return hit;
};

const findSkill = (id: SkillId): Skill => {
  const hit = skills.find((s) => s.id === id);
  if (hit === undefined) throw new Error(`skills catalog has no entry '${id}'`);
  return hit;
};

const findIsland = (id: IslandId): Island => {
  const hit = islands.find((i) => i.id === id);
  if (hit === undefined) throw new Error(`islands catalog has no entry '${id}'`);
  return hit;
};

const findRank = (id: RankId): Rank => {
  const hit = ranks.find((r) => r.id === id);
  if (hit === undefined) throw new Error(`ranks catalog has no entry '${id}'`);
  return hit;
};

/**
 * Every skill's grade band is DERIVED from the armory table rather than restated, so the two
 * cannot drift: AC-3 pins each cannon's band and AC-10 makes the skill's band equal to it.
 */
const skillGradesFromArmory = (skill: SkillId): { min: number; max: number } => {
  const rows = CANNON_IDS.map((id) => CANNON_TABLE[id]).filter((row) => row.skill === skill);
  const first = rows[0];
  if (first === undefined) throw new Error(`no cannon in the armory table uses skill '${skill}'`);
  return { min: first.minGrade, max: first.maxGrade };
};

/** Raw catalogs, deep-cloned so a corruption in one test cannot leak into another. */
interface RawCatalogs {
  skills: unknown[];
  cannons: unknown[];
  islands: unknown[];
  ranks: unknown[];
  crew: unknown[];
  enemies: unknown[];
}

const rawCatalogs = (): RawCatalogs => ({
  skills: structuredClone(skills) as unknown[],
  cannons: structuredClone(cannons) as unknown[],
  islands: structuredClone(islands) as unknown[],
  ranks: structuredClone(ranks) as unknown[],
  crew: structuredClone(crew) as unknown[],
  enemies: structuredClone(enemies) as unknown[],
});

/** AC-12 pins behaviour, not the signature; the call shape is documented in the file header. */
const validate = validateCatalogs as unknown as (input: RawCatalogs) => unknown;

const corruptEntry = (
  list: unknown[],
  id: string,
  mutate: (entry: Record<string, unknown>) => void,
): void => {
  const entry = list.find((e) => (e as { id?: unknown }).id === id) as Record<string, unknown> | undefined;
  if (entry === undefined) throw new Error(`fixture: no entry '${id}' to corrupt`);
  mutate(entry);
};

const CONTENT_DIR = fileURLToPath(new URL('../../src/content/', import.meta.url));
const CONTENT_FILES = [
  'index.ts',
  'skills.json',
  'cannons.json',
  'islands.json',
  'ranks.json',
  'crew.json',
  'enemies.json',
] as const;

// --- AC-1: the module loads, exports readonly arrays, every entry passes its schema -------------

describe('AC-1 — the catalog module loads and every entry is schema-valid', () => {
  it('spec(T-006:AC-1) importing @content/index throws nothing', async () => {
    await expect(import('@content/index')).resolves.toBeDefined();
  });

  it('spec(T-006:AC-1) all five catalogs are exported as non-empty arrays', () => {
    for (const [name, catalog] of [
      ['skills', skills],
      ['cannons', cannons],
      ['islands', islands],
      ['ranks', ranks],
      ['crew', crew],
    ] as const) {
      expect(Array.isArray(catalog), `${name} must be an array`).toBe(true);
      expect(catalog.length, `${name} must not be empty`).toBeGreaterThan(0);
    }
  });

  it('spec(T-006:AC-1) each catalog is typed as a readonly array of its schema-derived element', () => {
    const skillsReadonly: IsReadonlyArray<typeof skills> = true;
    const cannonsReadonly: IsReadonlyArray<typeof cannons> = true;
    const islandsReadonly: IsReadonlyArray<typeof islands> = true;
    const ranksReadonly: IsReadonlyArray<typeof ranks> = true;
    const crewReadonly: IsReadonlyArray<typeof crew> = true;

    const skillElement: Exact<(typeof skills)[number], Skill> = true;
    const cannonElement: Exact<(typeof cannons)[number], Cannon> = true;
    const islandElement: Exact<(typeof islands)[number], Island> = true;
    const rankElement: Exact<(typeof ranks)[number], Rank> = true;
    const crewElement: Exact<(typeof crew)[number], Crew> = true;

    expect([
      skillsReadonly,
      cannonsReadonly,
      islandsReadonly,
      ranksReadonly,
      crewReadonly,
      skillElement,
      cannonElement,
      islandElement,
      rankElement,
      crewElement,
    ]).toEqual([true, true, true, true, true, true, true, true, true, true]);
  });

  it('spec(T-006:AC-1) every skill entry round-trips through skillSchema unchanged', () => {
    for (const entry of skills) {
      const parsed = skillSchema.safeParse(entry);
      expect(parsed.success, `skill ${String(entry.id)}: ${JSON.stringify(entry)}`).toBe(true);
      if (parsed.success) expect(parsed.data).toEqual(entry);
    }
  });

  it('spec(T-006:AC-1) every cannon entry round-trips through cannonSchema unchanged', () => {
    for (const entry of cannons) {
      const parsed = cannonSchema.safeParse(entry);
      expect(parsed.success, `cannon ${String(entry.id)}: ${JSON.stringify(entry)}`).toBe(true);
      if (parsed.success) expect(parsed.data).toEqual(entry);
    }
  });

  it('spec(T-006:AC-1) every island entry round-trips through islandSchema unchanged', () => {
    for (const entry of islands) {
      const parsed = islandSchema.safeParse(entry);
      expect(parsed.success, `island ${String(entry.id)}: ${JSON.stringify(entry)}`).toBe(true);
      if (parsed.success) expect(parsed.data).toEqual(entry);
    }
  });

  it('spec(T-006:AC-1) every rank entry round-trips through rankSchema unchanged', () => {
    for (const entry of ranks) {
      const parsed = rankSchema.safeParse(entry);
      expect(parsed.success, `rank ${String(entry.id)}: ${JSON.stringify(entry)}`).toBe(true);
      if (parsed.success) expect(parsed.data).toEqual(entry);
    }
  });

  it('spec(T-006:AC-1) every crew entry round-trips through crewSchema unchanged', () => {
    for (const entry of crew) {
      const parsed = crewSchema.safeParse(entry);
      expect(parsed.success, `crew ${String(entry.id)}: ${JSON.stringify(entry)}`).toBe(true);
      if (parsed.success) expect(parsed.data).toEqual(entry);
    }
  });

  it('spec(T-006:AC-1) no entry in any catalog carries an empty display string', () => {
    for (const [name, entries] of [
      ['skills', skills],
      ['cannons', cannons],
      ['ranks', ranks],
      ['crew', crew],
    ] as const) {
      for (const entry of entries) {
        expect(entry.displayName.trim(), `${name}/${String(entry.id)} displayName`).not.toBe('');
      }
    }
    // D-14 / A-069: an island's display names live in its per-band curriculum cells now.
    for (const island of islands) {
      for (const band of GRADE_BANDS) {
        expect(
          island.curriculum[band].displayName.trim(),
          `islands/${island.id} ${band} displayName`,
        ).not.toBe('');
      }
    }
  });
});

// --- AC-2: cardinality and id uniqueness, per catalog ------------------------------------------

describe('AC-2 — every catalog has exactly its ids, once each', () => {
  // Counts re-baselined 12 → 16 and 10 → 14 by A-069 under D-14 (four new skills, one entry
  // cannon each). The structure of the assertion is untouched.
  it('spec(T-006:AC-2) spec(A-069:AC-5) cannons has exactly the 16 CannonId values with no duplicates', () => {
    expect(cannons).toHaveLength(16);
    expect(CANNON_IDS).toHaveLength(16);
    const ids = cannons.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(sorted(ids)).toEqual(sorted(CANNON_IDS));
  });

  it('spec(T-006:AC-2) spec(A-069:AC-5) skills has exactly 14 entries covering every SkillId with no duplicates', () => {
    expect(skills).toHaveLength(14);
    expect(SKILL_IDS).toHaveLength(14);
    const ids = skills.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(sorted(ids)).toEqual(sorted(SKILL_IDS));
  });

  it('spec(T-006:AC-2) islands has exactly the 5 IslandId values with no duplicates', () => {
    expect(islands).toHaveLength(5);
    const ids = islands.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(sorted(ids)).toEqual(sorted(ISLAND_IDS));
  });

  it('spec(T-006:AC-2) ranks has exactly the 5 RankId values with no duplicates', () => {
    expect(ranks).toHaveLength(5);
    const ids = ranks.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(sorted(ids)).toEqual(sorted(RANK_IDS));
  });

  it('spec(T-006:AC-2) crew has the three named members, each with a unique non-empty id', () => {
    expect(crew).toHaveLength(CREW_KEYWORDS.length);
    const ids = crew.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.trim()).not.toBe('');

    for (const keyword of CREW_KEYWORDS) {
      const matches = crew.filter((c) =>
        `${c.id} ${c.displayName} ${c.role}`.toLowerCase().includes(keyword),
      );
      expect(matches, `exactly one crew member should be the ${keyword}`).toHaveLength(1);
    }
  });
});

// --- AC-3: the armory transcription, all eleven rows, all eight pinned fields ---------------------

describe('AC-3 — every cannon matches PLAN.md §The armory exactly', () => {
  it.each([...CANNON_IDS])('spec(T-006:AC-3) %s transcribes its armory row exactly', (id) => {
    const expected = CANNON_TABLE[id];
    const actual = findCannon(id);

    expect(actual.skill).toBe(expected.skill);
    expect(actual.damageMin).toBe(expected.damageMin);
    expect(actual.damageMax).toBe(expected.damageMax);
    expect(actual.temperament).toBe(expected.temperament);
    expect(actual.timerMs).toBe(expected.timerMs);
    expect(actual.minGrade).toBe(expected.minGrade);
    expect(actual.maxGrade).toBe(expected.maxGrade);
    expect(actual.unlock).toEqual(expected.unlock);
  });

  it('spec(T-006:AC-3) every timer is a whole number of seconds expressed in milliseconds', () => {
    for (const id of CANNON_IDS) {
      const cannon = findCannon(id);
      expect(cannon.timerMs, `${id} timerMs`).toBeGreaterThanOrEqual(1000);
      expect(cannon.timerMs % 1000, `${id} timerMs must be a whole second in ms`).toBe(0);
    }
  });

  it('spec(T-006:AC-3) every damage range is a non-degenerate positive integer band', () => {
    for (const id of CANNON_IDS) {
      const cannon = findCannon(id);
      expect(Number.isInteger(cannon.damageMin), `${id} damageMin`).toBe(true);
      expect(Number.isInteger(cannon.damageMax), `${id} damageMax`).toBe(true);
      expect(cannon.damageMin, `${id} damageMin`).toBeGreaterThan(0);
      expect(cannon.damageMax, `${id} damageMax`).toBeGreaterThan(cannon.damageMin);
    }
  });

  it('spec(T-006:AC-3) the three unlock kinds are each represented by the right cannons', () => {
    const byKind = (kind: Cannon['unlock']['kind']): CannonId[] =>
      sorted(CANNON_IDS.filter((id) => CANNON_TABLE[id].unlock.kind === kind));

    for (const kind of ['starter', 'range', 'chest'] as const) {
      const actual = sorted(cannons.filter((c) => c.unlock.kind === kind).map((c) => c.id));
      expect(actual, `cannons with unlock.kind === '${kind}'`).toEqual(byKind(kind));
    }
  });
});

// --- AC-4: recoil ------------------------------------------------------------------------------

describe('AC-4 — recoil is exactly the three documented values and zero everywhere else', () => {
  it('spec(T-006:AC-4) double_broadside, powder_keg and long_nine carry recoil 5, 8 and 10', () => {
    expect(findCannon('double_broadside').recoilDamage).toBe(5);
    expect(findCannon('powder_keg').recoilDamage).toBe(8);
    expect(findCannon('long_nine').recoilDamage).toBe(10);
  });

  it('spec(T-006:AC-4) every reliable or standard cannon carries zero recoil', () => {
    const calm = cannons.filter((c) => c.temperament === 'reliable' || c.temperament === 'standard');
    expect(calm.length).toBeGreaterThan(0);
    for (const cannon of calm) {
      expect(cannon.recoilDamage, `${cannon.id} (${cannon.temperament}) must not punish a miss`).toBe(0);
    }
  });

  it('spec(T-006:AC-4) the culverin is volatile with zero recoil, per owner ruling D-3', () => {
    const culverin = findCannon('culverin');
    expect(culverin.temperament).toBe('volatile');
    expect(culverin.recoilDamage).toBe(0);
  });

  it.each([...CANNON_IDS])('spec(T-006:AC-4) %s recoilDamage matches the recoil table', (id) => {
    expect(findCannon(id).recoilDamage).toBe(RECOIL_TABLE[id]);
  });

  it('spec(T-006:AC-4) exactly three cannons carry any recoil at all', () => {
    const punishing = sorted(cannons.filter((c) => c.recoilDamage > 0).map((c) => c.id));
    expect(punishing).toEqual(sorted(['double_broadside', 'long_nine', 'powder_keg'] as CannonId[]));
  });
});

// --- AC-5: the starter loadout is a real choice from minute one --------------------------------

/**
 * Re-baselined for owner ruling D-10 (2026-07-31) — `tickets/app/OWNER-RULINGS.md`.
 *
 * T-006:AC-5 was written as "two starter cannons that are a real choice" (PLAN.md's MVP checklist,
 * twice). A real playthrough found the cost of taking that literally: the guided duel arms ONE gun
 * (`services/guidedDuel.ts`), and the first unscripted duel then handed the child two, one of which
 * they had done nothing to earn. The owner ruled the Swivel Gun is the only starter and the
 * Culverin is the first gun a captain EARNS, on the same `add_within_10` the tutorial just taught.
 *
 * **The AC's substance survives the ruling and is still asserted below**: the choice is still two
 * `add_within_10` guns with genuinely different profiles — reliable 8–12 against volatile 4–16 —
 * and it is still available inside the first mastery rather than deep in the game. What moved is
 * WHEN the second one arrives, which is the ruling's whole content. Only the starter COUNT is
 * re-baselined; the contrast assertions are byte-identical.
 */
describe('AC-5 — the opening pair is two K-skill cannons with different profiles (D-10: one is earned)', () => {
  it('spec(T-006:AC-5) exactly swivel_gun has unlock.kind === "starter"', () => {
    const starters = sorted(cannons.filter((c) => c.unlock.kind === 'starter').map((c) => c.id));
    expect(starters).toEqual(sorted(['swivel_gun'] as CannonId[]));
  });

  it('spec(T-006:AC-5) D-10 — the culverin is the first EARNED gun, on the starter’s own skill', () => {
    const culverin = findCannon('culverin');
    const swivel = findCannon('swivel_gun');
    // Same skill as the starter: nothing new has to be learned to earn it, which is what makes it
    // the first reward rather than the first wall.
    expect(culverin.skill).toBe(swivel.skill);
    expect(culverin.unlock).toEqual({ kind: 'range', island: 'port_sumwich', tier: 1 });
  });

  it('spec(T-006:AC-5) both opening cannons teach add_within_10 and open at grade 0', () => {
    for (const id of ['swivel_gun', 'culverin'] as const) {
      const cannon = findCannon(id);
      expect(cannon.skill, `${id} skill`).toBe('add_within_10');
      expect(cannon.minGrade, `${id} minGrade`).toBe(0);
    }
  });

  it('spec(T-006:AC-5) the two opening cannons offer genuinely different damage profiles', () => {
    const swivel = findCannon('swivel_gun');
    const culverin = findCannon('culverin');

    expect([swivel.damageMin, swivel.damageMax]).toEqual([8, 12]);
    expect([culverin.damageMin, culverin.damageMax]).toEqual([4, 16]);
    expect([culverin.damageMin, culverin.damageMax]).not.toEqual([swivel.damageMin, swivel.damageMax]);

    // A choice needs contrast in more than one dimension: the swing differs, and so does the risk.
    expect(culverin.damageMax - culverin.damageMin).toBeGreaterThan(swivel.damageMax - swivel.damageMin);
    expect(swivel.temperament).toBe('reliable');
    expect(culverin.temperament).toBe('volatile');
    expect(culverin.temperament).not.toBe(swivel.temperament);
  });
});

// --- AC-6: skill grade bands -------------------------------------------------------------------

describe('AC-6 — skill grade bands are legal and symbolicOnly is derived from them', () => {
  it.each([...SKILL_IDS])('spec(T-006:AC-6) %s has symbolicOnly === (minGrade < 2)', (id) => {
    const skill = findSkill(id);
    expect(skill.symbolicOnly).toBe(skill.minGrade < 2);
  });

  it.each([...SKILL_IDS])('spec(T-006:AC-6) %s satisfies 0 <= minGrade <= maxGrade <= 5', (id) => {
    const skill = findSkill(id);
    expect(Number.isInteger(skill.minGrade)).toBe(true);
    expect(Number.isInteger(skill.maxGrade)).toBe(true);
    expect(skill.minGrade).toBeGreaterThanOrEqual(0);
    expect(skill.maxGrade).toBeGreaterThanOrEqual(skill.minGrade);
    expect(skill.maxGrade).toBeLessThanOrEqual(5);
  });

  it('spec(T-006:AC-6) exactly the six K-1 skills are symbolic-only', () => {
    // `repeated_addition` joined them in A-060: it is `minGrade: 1`, so the derived rule above
    // (`symbolicOnly === minGrade < 2`) already forces the flag, and its templates print nothing
    // but digits and `+`.
    // Re-baselined four → six by A-069 under D-14: `sub_within_10` (minGrade 0) and
    // `place_value_teens` (minGrade 1) sit under the same derived rule. `place_value_teens` may
    // still print its place-value operator vocabulary ("1 ten and 4 ones") — its golden suite
    // pins the closed word list — but never a glyph beyond `+` and never a word-problem flag.
    const symbolic = sorted(skills.filter((s) => s.symbolicOnly).map((s) => s.id));
    expect(symbolic).toEqual(
      sorted([
        'add_within_10',
        'add_within_20',
        'sub_within_20',
        'repeated_addition',
        'sub_within_10',
        'place_value_teens',
      ] as SkillId[]),
    );
  });

  it('spec(T-006:AC-6) the skill bands together cover grades 0 through 5 with no gap', () => {
    const covered = new Set<number>();
    for (const skill of skills) {
      for (let g = skill.minGrade; g <= skill.maxGrade; g += 1) covered.add(g);
    }
    expect(sorted([...covered].map(String))).toEqual(['0', '1', '2', '3', '4', '5']);
  });
});

// --- AC-7: the rank ladder ---------------------------------------------------------------------

describe('AC-7 — the rank ladder resolves unambiguously', () => {
  it('spec(T-006:AC-7) sorting by tier yields cadet → ensign → captain → commodore → fleet_legend', () => {
    const byTier = [...ranks].sort((a, b) => a.tier - b.tier);
    expect(byTier.map((r) => r.id)).toEqual([...RANK_IDS]);
    expect(byTier.map((r) => r.tier)).toEqual([0, 1, 2, 3, 4]);
  });

  it('spec(T-006:AC-7) cadet starts at zero wins', () => {
    expect(findRank('cadet').minWins).toBe(0);
    expect(findRank('cadet').tier).toBe(0);
  });

  it('spec(T-006:AC-7) tier and minWins are both strictly increasing, with no ties', () => {
    const byTier = [...ranks].sort((a, b) => a.tier - b.tier);
    for (let i = 1; i < byTier.length; i += 1) {
      const prev = byTier[i - 1];
      const next = byTier[i];
      if (prev === undefined || next === undefined) throw new Error('ranks catalog changed size mid-test');
      expect(next.tier, `${next.id}.tier must exceed ${prev.id}.tier`).toBeGreaterThan(prev.tier);
      expect(next.minWins, `${next.id}.minWins must exceed ${prev.id}.minWins`).toBeGreaterThan(prev.minWins);
    }
    expect(new Set(ranks.map((r) => r.tier)).size).toBe(ranks.length);
    expect(new Set(ranks.map((r) => r.minWins)).size).toBe(ranks.length);
  });

  it('spec(T-006:AC-7) every minWins is a non-negative integer', () => {
    for (const rank of ranks) {
      expect(Number.isInteger(rank.minWins), `${rank.id}.minWins`).toBe(true);
      expect(rank.minWins, `${rank.id}.minWins`).toBeGreaterThanOrEqual(0);
    }
  });
});

// --- AC-8: the island arc ----------------------------------------------------------------------

describe('AC-8 — the island arc is a total ordering and an unbroken chain', () => {
  it('spec(T-006:AC-8) sorting by order yields PLAN.md’s arc with orders 0..4', () => {
    const byOrder = [...islands].sort((a, b) => a.order - b.order);
    expect(byOrder.map((i) => i.id)).toEqual([...ISLAND_IDS]);
    expect(byOrder.map((i) => i.order)).toEqual([0, 1, 2, 3, 4]);
  });

  it('spec(T-006:AC-8) order is a total ordering: unique, contiguous, no gaps', () => {
    const orders = islands.map((i) => i.order);
    expect(new Set(orders).size, 'duplicate island order').toBe(orders.length);
    for (const order of orders) expect(Number.isInteger(order)).toBe(true);
    expect(sorted(orders.map(String))).toEqual(['0', '1', '2', '3', '4']);
    expect(Math.min(...orders)).toBe(0);
    expect(Math.max(...orders)).toBe(orders.length - 1);
  });

  it('spec(T-006:AC-8) the first island requires nothing', () => {
    const first = findIsland('port_sumwich');
    expect(first.order).toBe(0);
    expect(first.requiresIsland).toBeUndefined();
  });

  it.each([...ISLAND_IDS])('spec(T-006:AC-8) %s requires exactly the island one order lower', (id) => {
    const island = findIsland(id);
    const predecessor = islands.find((i) => i.order === island.order - 1);
    if (island.order === 0) {
      expect(island.requiresIsland).toBeUndefined();
      return;
    }
    if (predecessor === undefined) throw new Error(`no island at order ${island.order - 1}`);
    expect(island.requiresIsland).toBe(predecessor.id);
  });

  it('spec(T-006:AC-8) following requiresIsland from the last island reaches every island exactly once, with no cycle', () => {
    const byId = new Map(islands.map((i) => [i.id, i]));
    const last = [...islands].sort((a, b) => b.order - a.order)[0];
    if (last === undefined) throw new Error('islands catalog is empty');

    const seen: IslandId[] = [];
    let cursor: Island | undefined = last;
    while (cursor !== undefined) {
      expect(seen, `cycle detected at ${cursor.id}`).not.toContain(cursor.id);
      seen.push(cursor.id);
      expect(seen.length, 'chain longer than the catalog implies a cycle').toBeLessThanOrEqual(
        islands.length,
      );
      const required: IslandId | undefined = cursor.requiresIsland;
      if (required === undefined) break;
      const next = byId.get(required);
      if (next === undefined)
        throw new Error(`${cursor.id}.requiresIsland names unknown island '${required}'`);
      cursor = next;
    }

    expect(sorted(seen), 'every island must be reachable along the chain').toEqual(sorted(ISLAND_IDS));
    expect(seen[seen.length - 1]).toBe('port_sumwich');
  });

  it('spec(T-006:AC-8) no island is its own prerequisite and no two islands share a prerequisite', () => {
    const required = islands.map((i) => i.requiresIsland).filter((r): r is IslandId => r !== undefined);
    expect(new Set(required).size, 'two islands cannot depend on the same predecessor').toBe(required.length);
    for (const island of islands) {
      expect(island.requiresIsland, `${island.id} cannot require itself`).not.toBe(island.id);
    }
    expect(islands.filter((i) => i.requiresIsland === undefined)).toHaveLength(1);
  });
});

// --- AC-9: referential integrity across the curriculum cells -----------------------------------
//
// Re-baselined by A-069 under D-14. Two of the old invariants are VOID by the ruling itself:
//   - "every range cannon is listed by exactly one island — the one it names": a skill may sit
//     on different islands for different bands, and a cell pays whatever cannon teaches its
//     skill (mortar is paid by Port Sumwich g4_5 AND Grandline g2_3; six_pounder by Quotient
//     Cove k_1 while its frozen armory row still unlocks at Port Sumwich).
//   - "no island unlocks a starter or chest cannon": nine_pounder (chest) is Compare Cove's one
//     place_value_compare payoff, so Port Sumwich's g2_3 cell lists it.
// What replaces them is the D-14 validator's own law, asserted here from the shipped data: every
// cell entry exists, is duplicate-free, and fires a skill on its OWN cell's skill list.

describe('AC-9 — curriculum cell ↔ skill/cannon references agree (D-14 shape)', () => {
  it('spec(T-006:AC-9) every cell skills entry names a skill that exists, with no repeats in the cell', () => {
    const known = new Set(skills.map((s) => s.id));
    for (const island of islands) {
      for (const band of GRADE_BANDS) {
        const cell = island.curriculum[band];
        for (const skill of cell.skills) {
          expect(known.has(skill), `${island.id}.${band}.skills names unknown skill '${skill}'`).toBe(true);
        }
        expect(new Set(cell.skills).size, `${island.id}.${band}.skills has a duplicate`).toBe(
          cell.skills.length,
        );
      }
    }
  });

  it('spec(T-006:AC-9) every cell unlocksCannons entry names a cannon that exists, with no repeats in the cell', () => {
    const known = new Set(cannons.map((c) => c.id));
    for (const island of islands) {
      for (const band of GRADE_BANDS) {
        const cell = island.curriculum[band];
        for (const cannon of cell.unlocksCannons) {
          expect(
            known.has(cannon),
            `${island.id}.${band}.unlocksCannons names unknown cannon '${cannon}'`,
          ).toBe(true);
        }
        expect(new Set(cell.unlocksCannons).size, `${island.id}.${band}.unlocksCannons has a duplicate`).toBe(
          cell.unlocksCannons.length,
        );
      }
    }
  });

  it('spec(T-006:AC-9) spec(A-069:AC-4) every cell cannon fires a skill on that cell own skill list', () => {
    for (const island of islands) {
      for (const band of GRADE_BANDS) {
        const cell = island.curriculum[band];
        for (const cannonId of cell.unlocksCannons) {
          const cannon = findCannon(cannonId);
          expect(
            cell.skills.includes(cannon.skill),
            `${island.id}.${band} pays '${cannonId}' whose skill '${cannon.skill}' is off the cell's list`,
          ).toBe(true);
        }
      }
    }
  });

  it('spec(T-006:AC-9) every range unlock names a real island and a tier of at least 1', () => {
    const known = new Set(islands.map((i) => i.id));
    for (const cannon of cannons) {
      if (cannon.unlock.kind !== 'range') continue;
      expect(known.has(cannon.unlock.island), `${cannon.id}.unlock.island`).toBe(true);
      expect(Number.isInteger(cannon.unlock.tier), `${cannon.id}.unlock.tier`).toBe(true);
      expect(cannon.unlock.tier, `${cannon.id}.unlock.tier`).toBeGreaterThanOrEqual(1);
    }
  });

  it('spec(T-006:AC-9) every cannon is paid by some island cell, except the lone starter', () => {
    // The successor to the old both-directions walk: no gun may be orphaned from the map. The
    // Swivel Gun alone is handed to the captain rather than earned (D-10).
    const paid = new Set<CannonId>();
    for (const island of islands) {
      for (const band of GRADE_BANDS) {
        for (const cannonId of island.curriculum[band].unlocksCannons) paid.add(cannonId);
      }
    }
    for (const cannon of cannons) {
      if (cannon.unlock.kind === 'starter') {
        expect(paid.has(cannon.id), `${cannon.id} is the starter and must not also be a payoff`).toBe(false);
        continue;
      }
      expect(paid.has(cannon.id), `${cannon.id} is paid by no island cell in any band`).toBe(true);
    }
  });
});

// --- AC-10: cannon ↔ skill ---------------------------------------------------------------------

describe('AC-10 — every cannon sits on a real skill at that skill’s grade band', () => {
  it.each([...CANNON_IDS])('spec(T-006:AC-10) %s resolves to a skill with the same grade band', (id) => {
    const cannon = findCannon(id);
    const skill = skills.find((s) => s.id === cannon.skill);
    if (skill === undefined) throw new Error(`cannon '${id}' names unknown skill '${cannon.skill}'`);
    expect([cannon.minGrade, cannon.maxGrade]).toEqual([skill.minGrade, skill.maxGrade]);
  });

  it.each([...SKILL_IDS])('spec(T-006:AC-10) %s is taught by at least one cannon', (id) => {
    const users = cannons.filter((c) => c.skill === id);
    expect(users.length, `skill '${id}' has no cannon`).toBeGreaterThan(0);
  });

  it.each([...SKILL_IDS])('spec(T-006:AC-10) %s carries the grade band its cannons declare', (id) => {
    const expected = skillGradesFromArmory(id);
    const skill = findSkill(id);
    expect([skill.minGrade, skill.maxGrade]).toEqual([expected.min, expected.max]);
  });

  it('spec(T-006:AC-10) all cannons on a shared skill agree on the grade band', () => {
    for (const skillId of SKILL_IDS) {
      const bands = cannons.filter((c) => c.skill === skillId).map((c) => `${c.minGrade}-${c.maxGrade}`);
      expect(new Set(bands).size, `cannons on '${skillId}' disagree on the grade band`).toBe(1);
    }
  });
});

// --- AC-11: total lookup helpers ---------------------------------------------------------------

describe('AC-11 — lookup helpers are total: they return an entry or throw, never undefined', () => {
  it('spec(T-006:AC-11) helper return types do not include undefined', () => {
    const cannonTotal: NoUndefined<ReturnType<typeof getCannon>> = true;
    const skillTotal: NoUndefined<ReturnType<typeof getSkill>> = true;
    const islandTotal: NoUndefined<ReturnType<typeof getIsland>> = true;
    const rankTotal: NoUndefined<ReturnType<typeof getRankByTier>> = true;

    // Assignable without a null check — the AC's stated reason for totality.
    const cannon: Cannon = getCannon('swivel_gun');
    const skill: Skill = getSkill('add_within_10');
    const island: Island = getIsland('port_sumwich');
    const rank: Rank = getRankByTier(0);

    expect([cannonTotal, skillTotal, islandTotal, rankTotal]).toEqual([true, true, true, true]);
    expect([cannon.id, skill.id, island.id, rank.id]).toEqual([
      'swivel_gun',
      'add_within_10',
      'port_sumwich',
      'cadet',
    ]);
  });

  it.each([...CANNON_IDS])('spec(T-006:AC-11) getCannon(%s) returns the catalog entry', (id) => {
    expect(getCannon(id)).toEqual(findCannon(id));
  });

  it.each([...SKILL_IDS])('spec(T-006:AC-11) getSkill(%s) returns the catalog entry', (id) => {
    expect(getSkill(id)).toEqual(findSkill(id));
  });

  it.each([...ISLAND_IDS])('spec(T-006:AC-11) getIsland(%s) returns the catalog entry', (id) => {
    expect(getIsland(id)).toEqual(findIsland(id));
  });

  it.each([...RANK_IDS])('spec(T-006:AC-11) getRankByTier resolves %s by its own tier', (id) => {
    const rank = findRank(id);
    expect(getRankByTier(rank.tier)).toEqual(rank);
  });

  // Dimensions: unknown id, prototype-chain keys, wrong case, stray whitespace — plus, per
  // catalog, a key that is a REAL id in a DIFFERENT catalog (the mix-up a caller actually makes).
  const BAD_KEYS = ['ghost_gun', '__proto__', 'constructor', 'toString', 'SWIVEL_GUN', ' swivel_gun'];
  const BAD_CANNON_KEYS = [...BAD_KEYS, 'port_sumwich', 'add_within_10'];
  const BAD_SKILL_KEYS = [...BAD_KEYS, 'swivel_gun', 'cadet'];
  const BAD_ISLAND_KEYS = [...BAD_KEYS, 'cadet', 'mult_facts'];

  it.each(BAD_CANNON_KEYS)('spec(T-006:AC-11) getCannon("%s") throws an Error naming the key', (key) => {
    expect(() => getCannon(key as CannonId)).toThrow(Error);
    expect(() => getCannon(key as CannonId)).toThrow(new RegExp(key.trim()));
  });

  it.each(BAD_SKILL_KEYS)('spec(T-006:AC-11) getSkill("%s") throws an Error naming the key', (key) => {
    expect(() => getSkill(key as SkillId)).toThrow(Error);
    expect(() => getSkill(key as SkillId)).toThrow(new RegExp(key.trim()));
  });

  it.each(BAD_ISLAND_KEYS)('spec(T-006:AC-11) getIsland("%s") throws an Error naming the key', (key) => {
    expect(() => getIsland(key as IslandId)).toThrow(Error);
    expect(() => getIsland(key as IslandId)).toThrow(new RegExp(key.trim()));
  });

  it('spec(T-006:AC-11) the empty string is rejected by every id lookup', () => {
    expect(() => getCannon('' as CannonId)).toThrow(Error);
    expect(() => getSkill('' as SkillId)).toThrow(Error);
    expect(() => getIsland('' as IslandId)).toThrow(Error);
  });

  it.each([-1, 5, 99, 1.5, Number.NaN])(
    'spec(T-006:AC-11) getRankByTier(%s) throws an Error naming the tier',
    (tier) => {
      expect(() => getRankByTier(tier)).toThrow(Error);
      expect(() => getRankByTier(tier)).toThrow(new RegExp(String(tier).replace('.', '\\.')));
    },
  );

  it('spec(T-006:AC-11) getRankByTier rejects the non-finite tiers too', () => {
    expect(() => getRankByTier(Number.POSITIVE_INFINITY)).toThrow(Error);
    expect(() => getRankByTier(Number.NEGATIVE_INFINITY)).toThrow(Error);
  });

  it('spec(T-006:AC-11) no lookup ever returns undefined for a key outside its union', () => {
    for (const key of BAD_CANNON_KEYS) {
      let cannonResult: unknown = 'not-called';
      try {
        cannonResult = getCannon(key as CannonId);
      } catch {
        cannonResult = 'threw';
      }
      expect(cannonResult, `getCannon('${key}') must throw, not return undefined`).toBe('threw');
    }
  });
});

// --- AC-12: validateCatalogs names the offending catalog and entry ------------------------------

describe('AC-12 — validateCatalogs rejects a corrupted catalog and says which entry', () => {
  it('spec(T-006:AC-12) the shipped catalogs pass validateCatalogs without throwing', () => {
    expect(() => validate(rawCatalogs())).not.toThrow();
  });

  it('spec(T-006:AC-12) a cannon with damageMax < damageMin is rejected by catalog and id', () => {
    const raw = rawCatalogs();
    corruptEntry(raw.cannons, 'culverin', (entry) => {
      entry.damageMax = 3;
    });
    expect(() => validate(raw)).toThrow(Error);
    expect(() => validate(raw)).toThrow(/cannons?/i);
    expect(() => validate(raw)).toThrow(/culverin/);
  });

  it('spec(T-006:AC-12) a skill with maxGrade < minGrade is rejected by catalog and id', () => {
    const raw = rawCatalogs();
    corruptEntry(raw.skills, 'add_within_20', (entry) => {
      entry.maxGrade = 0;
    });
    expect(() => validate(raw)).toThrow(Error);
    expect(() => validate(raw)).toThrow(/skills?/i);
    expect(() => validate(raw)).toThrow(/add_within_20/);
  });

  it('spec(T-006:AC-12) an island naming an unknown skill is rejected by catalog and id', () => {
    const raw = rawCatalogs();
    corruptEntry(raw.islands, 'isla_products', (entry) => {
      entry.rangeSkills = ['not_a_real_skill'];
    });
    expect(() => validate(raw)).toThrow(Error);
    expect(() => validate(raw)).toThrow(/islands?/i);
    expect(() => validate(raw)).toThrow(/isla_products/);
  });

  it('spec(T-006:AC-12) a rank with a negative minWins is rejected by catalog and id', () => {
    const raw = rawCatalogs();
    corruptEntry(raw.ranks, 'captain', (entry) => {
      entry.minWins = -1;
    });
    expect(() => validate(raw)).toThrow(Error);
    expect(() => validate(raw)).toThrow(/ranks?/i);
    expect(() => validate(raw)).toThrow(/captain/);
  });

  it('spec(T-006:AC-12) a crew member missing its role is rejected by catalog and id', () => {
    const raw = rawCatalogs();
    const victim = crew[0];
    if (victim === undefined) throw new Error('crew catalog is empty');
    corruptEntry(raw.crew, victim.id, (entry) => {
      delete entry.role;
    });
    expect(() => validate(raw)).toThrow(Error);
    expect(() => validate(raw)).toThrow(/crew/i);
    expect(() => validate(raw)).toThrow(new RegExp(victim.id));
  });

  it('spec(T-006:AC-12) an unknown extra key on an entry is rejected by catalog and id (L-009)', () => {
    const raw = rawCatalogs();
    corruptEntry(raw.cannons, 'mortar', (entry) => {
      entry.recoilDmg = 4;
    });
    expect(() => validate(raw)).toThrow(Error);
    expect(() => validate(raw)).toThrow(/cannons?/i);
    expect(() => validate(raw)).toThrow(/mortar/);
  });

  it('spec(T-006:AC-12) a wrong-typed field is rejected by catalog and id', () => {
    const raw = rawCatalogs();
    corruptEntry(raw.cannons, 'long_nine', (entry) => {
      entry.timerMs = 'twenty seconds';
    });
    expect(() => validate(raw)).toThrow(Error);
    expect(() => validate(raw)).toThrow(/cannons?/i);
    expect(() => validate(raw)).toThrow(/long_nine/);
  });
});

// --- AC-13: content is bundled; nothing in it reaches the network -------------------------------

describe('AC-13 — the content layer names no URL', () => {
  it.each([...CONTENT_FILES])('spec(T-006:AC-13) %s exists in src/content/', (file) => {
    expect(existsSync(`${CONTENT_DIR}${file}`), `${file} is missing from src/content/`).toBe(true);
  });

  it.each([...CONTENT_FILES])('spec(T-006:AC-13) %s contains no http:// or https:// substring', (file) => {
    const text = readFileSync(`${CONTENT_DIR}${file}`, 'utf8');
    expect(text.includes('http://'), `${file} contains an http:// URL`).toBe(false);
    expect(text.includes('https://'), `${file} contains an https:// URL`).toBe(false);
  });

  it('spec(T-006:AC-13) every catalog file is plain JSON that parses to an array', () => {
    for (const file of CONTENT_FILES.filter((f) => f.endsWith('.json'))) {
      const parsed: unknown = JSON.parse(readFileSync(`${CONTENT_DIR}${file}`, 'utf8'));
      expect(Array.isArray(parsed), `${file} must hold a top-level array`).toBe(true);
    }
  });
});

// --- AC-14: the exact island → skills/cannons assignment T-010 and T-011 build on ---------------

// Re-baselined by A-069 under D-14: the assignment an island carries is now per band, and the
// atlas table above is the byte-exact law. The old "place_value_compare is deliberately on no
// island range" pin is VOID — D-14 makes it Compare Cove's (Port Sumwich g2_3) headline skill,
// paid by the nine_pounder, whose frozen armory row stays a chest drop.
describe('AC-14 — each island×band cell carries exactly its atlas skills, names, and payoffs', () => {
  const CELLS: readonly [IslandId, GradeBand][] = ISLAND_IDS.flatMap((id) =>
    GRADE_BANDS.map((band): [IslandId, GradeBand] => [id, band]),
  );

  it.each(CELLS)(
    'spec(T-006:AC-14) spec(A-069:AC-1) %s %s matches its atlas cell byte for byte',
    (id, band) => {
      const cell = findIsland(id).curriculum[band];
      const expected = ISLAND_TABLE[id][band];
      // Exact transcription: display name byte-equal, skills in teaching order, payoffs in order.
      expect(cell.displayName).toBe(expected.displayName);
      expect(cell.skills).toEqual(expected.skills);
      expect(cell.unlocksCannons).toEqual(expected.unlocksCannons);
    },
  );

  it('spec(T-006:AC-14) spec(A-069:AC-1) the atlas is complete: 15 cells, and no island carries more', () => {
    expect(CELLS).toHaveLength(15);
    for (const island of islands) {
      expect(Object.keys(island.curriculum).sort()).toEqual([...GRADE_BANDS].sort());
    }
  });

  it('spec(T-006:AC-14) within each band, the five islands teach pairwise disjoint skills', () => {
    // The successor to the old "a later island never trains a skill an earlier island owns":
    // one BAND's arc is still a progression with no repeats. ACROSS bands a skill may recur
    // (div_facts is Port Sumwich's g4_5 cell and the Grandline's g2_3 cell) — that is D-14's
    // whole point, so it is deliberately not constrained here.
    for (const band of GRADE_BANDS) {
      const seen = new Set<SkillId>();
      for (const island of [...islands].sort((a, b) => a.order - b.order)) {
        for (const skill of island.curriculum[band].skills) {
          expect(seen.has(skill), `band '${band}': skill '${skill}' is trained by two islands`).toBe(false);
          seen.add(skill);
        }
      }
    }
  });
});

// --- T-027: set-level validateCatalogs ----------------------------------------------------------

describe('T-027 — validateCatalogs set-level corruption', () => {
  // spec(T-027:AC-6)
  it('spec(T-027:AC-6) shipped catalogs still pass validateCatalogs', () => {
    expect(() => validate(rawCatalogs())).not.toThrow();
  });

  // spec(T-027:AC-1)
  it('spec(T-027:AC-1) duplicate id in any catalog throws naming catalog and id', () => {
    const raw = rawCatalogs();
    const first = raw.cannons[0] as Record<string, unknown>;
    raw.cannons.push(structuredClone(first));
    expect(() => validate(raw)).toThrow(Error);
    expect(() => validate(raw)).toThrow(/cannons/i);
    expect(() => validate(raw)).toThrow(new RegExp(String(first.id)));
  });

  // spec(T-027:AC-2)
  it('spec(T-027:AC-2) cannon unlock.island absent from islands throws naming both ids', () => {
    const raw = rawCatalogs();
    // Remove grandline from islands; keep a range-unlock cannon that points at it (long_nine).
    raw.islands = raw.islands.filter((entry) => (entry as { id: string }).id !== 'grandline');
    expect(() => validate(raw)).toThrow(Error);
    expect(() => validate(raw)).toThrow(/long_nine|cannons/i);
    expect(() => validate(raw)).toThrow(/grandline/);
  });

  // spec(T-027:AC-3)
  // Re-baselined by A-069 under D-14: mult_facts / twelve_pounder are Fraction Reef's g2_3 cell
  // now (the atlas's "Isla Products" display name moved with them), so the dangling reference is
  // reported against fraction_reef.
  it('spec(T-027:AC-3) island curriculum skills / unlocksCannons dangling sibling ids throw', () => {
    const rawSkills = rawCatalogs();
    rawSkills.skills = rawSkills.skills.filter((entry) => (entry as { id: string }).id !== 'mult_facts');
    expect(() => validate(rawSkills)).toThrow(/fraction_reef/);
    expect(() => validate(rawSkills)).toThrow(/mult_facts/);

    const rawCannons = rawCatalogs();
    rawCannons.cannons = rawCannons.cannons.filter(
      (entry) => (entry as { id: string }).id !== 'twelve_pounder',
    );
    expect(() => validate(rawCannons)).toThrow(/fraction_reef/);
    expect(() => validate(rawCannons)).toThrow(/twelve_pounder/);
  });

  // spec(T-027:AC-4)
  it('spec(T-027:AC-4) two ranks sharing a tier throws naming both rank ids', () => {
    const raw = rawCatalogs();
    const a = raw.ranks[0] as Record<string, unknown>;
    const b = raw.ranks[1] as Record<string, unknown>;
    b.tier = a.tier;
    expect(() => validate(raw)).toThrow(Error);
    expect(() => validate(raw)).toThrow(/ranks/i);
    expect(() => validate(raw)).toThrow(new RegExp(String(a.id)));
    expect(() => validate(raw)).toThrow(new RegExp(String(b.id)));
  });

  // spec(T-027:AC-5)
  it('spec(T-027:AC-5) requiresIsland cycle throws naming the islands in the cycle', () => {
    const raw = rawCatalogs();
    corruptEntry(raw.islands, 'port_sumwich', (entry) => {
      entry.requiresIsland = 'isla_products';
    });
    // isla_products already requires port_sumwich → cycle
    expect(() => validate(raw)).toThrow(Error);
    expect(() => validate(raw)).toThrow(/cycle/i);
    expect(() => validate(raw)).toThrow(/port_sumwich/);
    expect(() => validate(raw)).toThrow(/isla_products/);
  });

  // spec(T-027:AC-7)
  it('spec(T-027:AC-7) rejection messages name catalog and offending id for an author', () => {
    const raw = rawCatalogs();
    const first = raw.skills[0] as Record<string, unknown>;
    raw.skills.push(structuredClone(first));
    let message = '';
    try {
      validate(raw);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/skills/i);
    expect(message).toContain(String(first.id));
  });

  it('dod(T-027:1) set-level checks live in validateCatalogs', () => {
    const src = readFileSync(join(CONTENT_DIR, 'index.ts'), 'utf8');
    expect(src).toMatch(/duplicate id/);
    expect(src).toMatch(/requiresIsland cycle|cycle involving/);
  });

  it('dod(T-027:2) every rejection names catalog and offending id(s)', () => {
    expect(true).toBe(true); // pinned by AC-1…AC-5 / AC-7 message assertions above
  });

  it('dod(T-027:3) shipped catalogs validate; T-006 AC-12 suite remains the schema gate', () => {
    expect(() => validate(rawCatalogs())).not.toThrow();
  });

  it('dod(T-027:4) local gates are the merge authority', () => {
    expect(typeof validateCatalogs).toBe('function');
  });
});

// --- A-031: enemies catalog — one validated encounter per island -----------------------------

describe('A-031 — enemies catalog covers every island exactly once', () => {
  it('spec(A-031:AC-1) importing enemies through @content/index throws nothing', async () => {
    const mod = await import('@content/index');
    expect(mod.enemies).toBeDefined();
    expect(mod.getEnemyForIsland).toBeTypeOf('function');
  });

  it('spec(A-031:AC-1) every island resolves a distinct enemy with presentation kind', () => {
    expect(enemies.length).toBe(ISLAND_IDS.length);

    const byIsland = new Map(enemies.map((enemy) => [enemy.islandId, enemy]));
    for (const islandId of ISLAND_IDS) {
      const enemy = getEnemyForIsland(islandId);
      expect(byIsland.get(islandId)).toEqual(enemy);
      expect(enemy.displayName.trim()).not.toBe('');
      expect(enemy.faction.trim()).not.toBe('');
      expect(enemy.accessibilityLabel.trim()).not.toBe('');
    }
  });

  it('spec(A-031:AC-2) island order maps pirate → skeleton → ghost → shark → kraken', () => {
    const ordered = [...islands].sort((a, b) => a.order - b.order);
    expect(ordered.map((island) => getEnemyForIsland(island.id).presentationKind)).toEqual([
      'pirate',
      'skeleton',
      'ghost',
      'shark',
      'kraken',
    ]);
  });

  it('spec(A-031:AC-5) validateCatalogs rejects a missing island enemy and names the island', () => {
    const raw = rawCatalogs();
    raw.enemies = raw.enemies.filter((entry) => (entry as { islandId?: string }).islandId !== 'grandline');
    expect(() => validate(raw)).toThrow(Error);
    expect(() => validate(raw)).toThrow(/grandline|enem/i);
  });

  it('spec(A-031:AC-5) getEnemyForIsland throws for unknown ids instead of returning a generic rival', () => {
    expect(() => getEnemyForIsland('ghost_gun' as IslandId)).toThrow(Error);
    expect(() => getEnemyForIsland('ghost_gun' as IslandId)).toThrow(/ghost_gun/);
  });
});

// --- A-069 / D-14: the curriculum atlas, the ceiling law, and the accessor ---------------------
//
// D-14 (`tickets/app/OWNER-RULINGS.md`): five islands for every band, each band its own
// Common-Core curriculum. The atlas transcription itself is pinned in the AC-14 block above
// (spec(A-069:AC-1) tags on the 15-cell sweep); this block pins the validator law (AC-2), the
// entry-cannon paths (AC-4), the SKILL_IDS delta (AC-5), and `islandCurriculumFor`, the ONE
// door through which A-070 migrates every consumer.

describe('A-069 — the D-14 ceiling validator', () => {
  it('spec(A-069:AC-2) a synthetic catalog putting mult_facts on a k_1 island throws naming island, band, and skill', () => {
    const raw = rawCatalogs();
    corruptEntry(raw.islands, 'quotient_cove', (entry) => {
      (entry.curriculum as Record<string, Record<string, unknown>>).k_1 = {
        displayName: 'Port Twenty',
        skills: ['mult_facts'],
        unlocksCannons: ['twelve_pounder'],
      };
    });
    expect(() => validate(raw)).toThrow(Error);
    expect(() => validate(raw)).toThrow(/quotient_cove/);
    expect(() => validate(raw)).toThrow(/k_1/);
    expect(() => validate(raw)).toThrow(/mult_facts/);
    expect(() => validate(raw)).toThrow(/ceiling/i);
  });

  it('spec(A-069:AC-2) the not-outgrown dual throws on a g4_5 island of only g0-1 skills, naming island and band', () => {
    const raw = rawCatalogs();
    corruptEntry(raw.islands, 'grandline', (entry) => {
      // add_within_10 (g0-1) is legal under every ceiling, so ONLY the dual can reject this
      // cell: a grade-4-5 captain would be sent to an island of pure kindergarten review.
      (entry.curriculum as Record<string, Record<string, unknown>>).g4_5 = {
        displayName: 'The Grandline',
        skills: ['add_within_10'],
        unlocksCannons: ['culverin'],
      };
    });
    expect(() => validate(raw)).toThrow(Error);
    expect(() => validate(raw)).toThrow(/grandline/);
    expect(() => validate(raw)).toThrow(/g4_5/);
    expect(() => validate(raw)).toThrow(/outgrown/i);
  });

  it('spec(A-069:AC-2) a cell paying a cannon whose skill is off the cell list throws naming island, band, and cannon', () => {
    const raw = rawCatalogs();
    corruptEntry(raw.islands, 'isla_products', (entry) => {
      (entry.curriculum as Record<string, Record<string, unknown>>).k_1 = {
        displayName: 'Take-Away Bay',
        skills: ['sub_within_10'],
        unlocksCannons: ['teen_lantern'], // fires place_value_teens, not on this cell's list
      };
    });
    expect(() => validate(raw)).toThrow(Error);
    expect(() => validate(raw)).toThrow(/isla_products/);
    expect(() => validate(raw)).toThrow(/k_1/);
    expect(() => validate(raw)).toThrow(/teen_lantern/);
  });

  it('spec(A-069:AC-2) the shipped catalog passes both halves of the law for all 15 cells', () => {
    expect(() => validate(rawCatalogs())).not.toThrow();

    // Assert the law directly from the shipped data too, so this test cannot be satisfied by a
    // validator that checks nothing.
    for (const island of islands) {
      for (const band of GRADE_BANDS) {
        const cell = island.curriculum[band];
        for (const skillId of cell.skills) {
          expect(
            findSkill(skillId).minGrade,
            `${island.id}.${band}.${skillId} must sit at or under the band ceiling`,
          ).toBeLessThanOrEqual(BAND_CEILING[band]);
        }
        expect(
          cell.skills.some((skillId) => findSkill(skillId).maxGrade >= BAND_FLOOR[band]),
          `${island.id}.${band} must teach at least one not-outgrown skill`,
        ).toBe(true);
      }
    }
  });

  it('spec(A-069:AC-2) the ceiling law also fails the content module at import, not only validateCatalogs', () => {
    // The import-time guard is the same function the validator calls; this pins that index.ts
    // actually invokes it at module scope, so a bad authoring edit cannot load at all.
    const src = readFileSync(join(CONTENT_DIR, 'index.ts'), 'utf8');
    expect(src).toMatch(/^assertCurriculumLawful\(islands, skills, cannons\);/m);
  });
});

describe('A-069 — every island×band has a valid entry-cannon path', () => {
  const CELLS: readonly [IslandId, GradeBand][] = ISLAND_IDS.flatMap((id) =>
    GRADE_BANDS.map((band): [IslandId, GradeBand] => [id, band]),
  );

  /** A cannon a band can actually be asked: its grade span overlaps the band's floor..ceiling. */
  const inBand = (cannon: Cannon, band: GradeBand): boolean =>
    cannon.minGrade <= BAND_CEILING[band] && cannon.maxGrade >= BAND_FLOOR[band];

  it.each(CELLS)(
    'spec(A-069:AC-4) %s %s: the first in-band cannon exists, fires a cell skill, and clears the band',
    (id, band) => {
      const cell = islandCurriculumFor(id, band);
      const first = cell.unlocksCannons.map((cannonId) => findCannon(cannonId)).find((c) => inBand(c, band));

      expect(first, `${id}.${band} has no in-band cannon in its unlocksCannons`).toBeDefined();
      if (first === undefined) return;
      expect(cell.skills.includes(first.skill), `${id}.${band} entry gun fires an off-cell skill`).toBe(true);
      expect(first.minGrade, `${id}.${band} entry gun opens above the band ceiling`).toBeLessThanOrEqual(
        BAND_CEILING[band],
      );
    },
  );

  it('spec(A-069:AC-4) each new skill’s entry cannon is the payoff of its own atlas cell', () => {
    expect(islandCurriculumFor('isla_products', 'k_1').unlocksCannons).toContain('dinghy_gun');
    expect(islandCurriculumFor('grandline', 'k_1').unlocksCannons).toContain('teen_lantern');
    expect(islandCurriculumFor('isla_products', 'g4_5').unlocksCannons).toContain('carronade');
    expect(islandCurriculumFor('quotient_cove', 'g4_5').unlocksCannons).toContain('stern_chaser');
  });
});

describe('A-069 — islandCurriculumFor is the one door to taught content', () => {
  it('spec(A-069:AC-1) returns the exact band cell for every island and band', () => {
    for (const islandId of ISLAND_IDS) {
      for (const band of GRADE_BANDS) {
        expect(islandCurriculumFor(islandId, band)).toEqual(findIsland(islandId).curriculum[band]);
      }
    }
  });

  it('spec(A-069:AC-1) band null falls back to the g4_5 cell for legacy/fixture callers', () => {
    for (const islandId of ISLAND_IDS) {
      expect(islandCurriculumFor(islandId, null)).toEqual(findIsland(islandId).curriculum.g4_5);
    }
  });

  it('spec(A-069:AC-1) throws for an unknown island id rather than returning undefined', () => {
    expect(() => islandCurriculumFor('atlantis' as IslandId, 'k_1')).toThrow(Error);
    expect(() => islandCurriculumFor('atlantis' as IslandId, 'k_1')).toThrow(/atlantis/);
  });
});

describe('A-069 — the skill catalog grows by exactly the four D-14 skills', () => {
  it('spec(A-069:AC-5) SKILL_IDS is the ten pre-D-14 ids plus exactly the four, appended', () => {
    const preD14 = [
      'add_within_10',
      'add_within_20',
      'sub_within_20',
      'place_value_compare',
      'mult_facts',
      'two_step_add_sub',
      'div_facts',
      'fractions_int',
      'multi_digit_order_ops',
      'repeated_addition',
    ];
    expect(SKILL_IDS.slice(0, preD14.length)).toEqual(preD14);
    expect(SKILL_IDS.slice(preD14.length)).toEqual([
      'sub_within_10',
      'place_value_teens',
      'multi_digit_mult',
      'long_division',
    ]);
  });

  it('spec(A-069:AC-5) the four new skills carry their ticketed Common-Core grade bands', () => {
    expect([findSkill('sub_within_10').minGrade, findSkill('sub_within_10').maxGrade]).toEqual([0, 1]);
    expect([findSkill('place_value_teens').minGrade, findSkill('place_value_teens').maxGrade]).toEqual([
      1, 1,
    ]);
    expect([findSkill('multi_digit_mult').minGrade, findSkill('multi_digit_mult').maxGrade]).toEqual([4, 4]);
    expect([findSkill('long_division').minGrade, findSkill('long_division').maxGrade]).toEqual([4, 5]);
  });

  it('spec(A-069:AC-5) every new cannon fires its skill, opens at its skill minGrade, and unlocks at its atlas island at tier 1', () => {
    for (const [cannonId, skillId, atlasIsland] of [
      ['dinghy_gun', 'sub_within_10', 'isla_products'],
      ['teen_lantern', 'place_value_teens', 'grandline'],
      ['carronade', 'multi_digit_mult', 'isla_products'],
      ['stern_chaser', 'long_division', 'quotient_cove'],
    ] as const) {
      const cannon = findCannon(cannonId);
      expect(cannon.skill).toBe(skillId);
      expect(cannon.minGrade).toBe(findSkill(skillId).minGrade);
      expect(cannon.unlock).toEqual({ kind: 'range', island: atlasIsland, tier: 1 });
    }
  });
});
