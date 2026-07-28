/**
 * T-003 — `src/content/schemas.ts`: content zod schemas + the id unions.
 *
 * These tests are FROZEN. Five later tickets (T-005, T-006, T-007, T-009, T-019) import the
 * vocabulary pinned here, so both directions are proven for every schema: valid fixtures parse
 * and produce the expected typed output, and each invalid fixture is rejected for exactly one
 * reason per test.
 *
 * Traceability: every test cites `spec(T-003:AC-n)` in its name.
 */
import { describe, expect, it } from 'vitest';

import {
  CANNON_IDS,
  CHEST_RARITIES,
  GRADE_BANDS,
  ISLAND_IDS,
  RANK_IDS,
  SKILL_IDS,
  TEMPERAMENTS,
  cannonSchema,
  crewSchema,
  islandSchema,
  rankSchema,
  skillSchema,
  templateSchema,
} from '@content/schemas';
import type {
  Cannon,
  CannonId,
  ChestRarity,
  Crew,
  GradeBand,
  Island,
  IslandId,
  Rank,
  RankId,
  Skill,
  SkillId,
  Template,
  Temperament,
} from '@content/schemas';

/** Compile-time exact-type equality (invariant in both directions, unlike `extends`). */
type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** `true` only for a readonly array/tuple — a mutable array is assignable to `unknown[]`. */
type IsReadonlyArray<T> = T extends unknown[] ? false : true;

/**
 * The one part of a zod issue AC-3 reads. Annotated locally so the callback has no implicit
 * `any` while `@content/schemas` is still absent; `z.ZodIssue` satisfies it.
 */
interface SchemaIssue {
  readonly path: readonly (string | number)[];
}

/**
 * Builds an invalid-by-one-field variant of a fixture. Typed `unknown` on the way out because
 * every variant is deliberately off-contract and is only ever fed to `safeParse`.
 */
function withOverrides(base: Record<string, unknown>, overrides: Record<string, unknown>): unknown {
  return { ...base, ...overrides };
}

// --- Fixtures (shaped after the catalog data T-006/T-014 will author) ----------------------

const MINIMAL_TEMPLATE: Record<string, unknown> = {
  id: 'add_within_10__a_plus_b',
  skill: 'add_within_10',
  text: '{a} + {b} = ?',
  params: { a: [1, 5], b: [1, 5] },
  answerExpr: 'a + b',
  distractors: ['a + b + 1', 'a + b - 1', 'a * b'],
};

const FULL_TEMPLATE: Record<string, unknown> = {
  ...MINIMAL_TEMPLATE,
  constraints: ['a + b <= 10'],
  isWordProblem: false,
  readAloud: false,
  difficulty: 2,
};

const VALID_SKILL: Record<string, unknown> = {
  id: 'add_within_10',
  displayName: 'Add within 10',
  minGrade: 0,
  maxGrade: 1,
  symbolicOnly: true,
};

const VALID_CANNON: Record<string, unknown> = {
  id: 'six_pounder',
  displayName: 'Six Pounder',
  skill: 'add_within_20',
  damageMin: 10,
  damageMax: 16,
  temperament: 'standard',
  recoilDamage: 0,
  timerMs: 15000,
  minGrade: 1,
  maxGrade: 2,
  unlock: { kind: 'range', island: 'port_sumwich', tier: 1 },
};

const VALID_ISLAND: Record<string, unknown> = {
  id: 'port_sumwich',
  displayName: 'Port Sumwich',
  order: 0,
  rangeSkills: ['add_within_10', 'add_within_20'],
  unlocksCannons: ['six_pounder', 'chain_shot'],
};

const VALID_RANK: Record<string, unknown> = {
  id: 'cadet',
  displayName: 'Cadet',
  tier: 0,
  minWins: 0,
};

const VALID_CREW: Record<string, unknown> = {
  id: 'gunner',
  displayName: 'Gunner',
  role: 'gunner',
};

// --- AC-1: the id sets ---------------------------------------------------------------------

describe('id unions', () => {
  it('spec(T-003:AC-1) SKILL_IDS lists the nine skill ids in ticket order with no duplicates', () => {
    expect(SKILL_IDS).toEqual([
      'add_within_10',
      'add_within_20',
      'sub_within_20',
      'place_value_compare',
      'mult_facts',
      'two_step_add_sub',
      'div_facts',
      'fractions_int',
      'multi_digit_order_ops',
    ]);
    expect(new Set(SKILL_IDS).size).toBe(SKILL_IDS.length);
    const unionMatchesArray: Exact<SkillId, (typeof SKILL_IDS)[number]> = true;
    expect(unionMatchesArray).toBe(true);
  });

  it('spec(T-003:AC-1) CANNON_IDS lists the ten cannon ids in ticket order with no duplicates', () => {
    expect(CANNON_IDS).toEqual([
      'swivel_gun',
      'culverin',
      'six_pounder',
      'chain_shot',
      'nine_pounder',
      'twelve_pounder',
      'mortar',
      'double_broadside',
      'powder_keg',
      'long_nine',
    ]);
    expect(new Set(CANNON_IDS).size).toBe(CANNON_IDS.length);
    const unionMatchesArray: Exact<CannonId, (typeof CANNON_IDS)[number]> = true;
    expect(unionMatchesArray).toBe(true);
  });

  it('spec(T-003:AC-1) ISLAND_IDS lists the five island ids in ticket order with no duplicates', () => {
    expect(ISLAND_IDS).toEqual([
      'port_sumwich',
      'isla_products',
      'quotient_cove',
      'fraction_reef',
      'grandline',
    ]);
    expect(new Set(ISLAND_IDS).size).toBe(ISLAND_IDS.length);
    const unionMatchesArray: Exact<IslandId, (typeof ISLAND_IDS)[number]> = true;
    expect(unionMatchesArray).toBe(true);
  });

  it('spec(T-003:AC-1) RANK_IDS lists the five rank ids in ladder order with no duplicates', () => {
    expect(RANK_IDS).toEqual(['cadet', 'ensign', 'captain', 'commodore', 'fleet_legend']);
    expect(new Set(RANK_IDS).size).toBe(RANK_IDS.length);
    const unionMatchesArray: Exact<RankId, (typeof RANK_IDS)[number]> = true;
    expect(unionMatchesArray).toBe(true);
  });

  it('spec(T-003:AC-1) GRADE_BANDS lists the three bands in picker order with no duplicates', () => {
    expect(GRADE_BANDS).toEqual(['k_1', 'g2_3', 'g4_5']);
    expect(new Set(GRADE_BANDS).size).toBe(GRADE_BANDS.length);
    const unionMatchesArray: Exact<GradeBand, (typeof GRADE_BANDS)[number]> = true;
    expect(unionMatchesArray).toBe(true);
  });

  it('spec(T-003:AC-1) TEMPERAMENTS lists the three temperaments in ticket order with no duplicates', () => {
    expect(TEMPERAMENTS).toEqual(['reliable', 'standard', 'volatile']);
    expect(new Set(TEMPERAMENTS).size).toBe(TEMPERAMENTS.length);
    const unionMatchesArray: Exact<Temperament, (typeof TEMPERAMENTS)[number]> = true;
    expect(unionMatchesArray).toBe(true);
  });

  it('spec(T-003:AC-1) CHEST_RARITIES lists the three rarities in ascending order with no duplicates', () => {
    expect(CHEST_RARITIES).toEqual(['common', 'uncommon', 'rare']);
    expect(new Set(CHEST_RARITIES).size).toBe(CHEST_RARITIES.length);
    const unionMatchesArray: Exact<ChestRarity, (typeof CHEST_RARITIES)[number]> = true;
    expect(unionMatchesArray).toBe(true);
  });

  it('spec(T-003:AC-1) exports every id array as a readonly (`as const`) array', () => {
    const skillIdsAreReadonly: IsReadonlyArray<typeof SKILL_IDS> = true;
    const cannonIdsAreReadonly: IsReadonlyArray<typeof CANNON_IDS> = true;
    const islandIdsAreReadonly: IsReadonlyArray<typeof ISLAND_IDS> = true;
    const rankIdsAreReadonly: IsReadonlyArray<typeof RANK_IDS> = true;
    const gradeBandsAreReadonly: IsReadonlyArray<typeof GRADE_BANDS> = true;
    const temperamentsAreReadonly: IsReadonlyArray<typeof TEMPERAMENTS> = true;
    const chestRaritiesAreReadonly: IsReadonlyArray<typeof CHEST_RARITIES> = true;

    expect([
      skillIdsAreReadonly,
      cannonIdsAreReadonly,
      islandIdsAreReadonly,
      rankIdsAreReadonly,
      gradeBandsAreReadonly,
      temperamentsAreReadonly,
      chestRaritiesAreReadonly,
    ]).toEqual([true, true, true, true, true, true, true]);
  });
});

// --- AC-2 … AC-6, AC-17: templateSchema ----------------------------------------------------

describe('templateSchema', () => {
  it('spec(T-003:AC-2) preserves every authored field of a fully-populated template', () => {
    const parsed: Template = templateSchema.parse(FULL_TEMPLATE);

    expect(parsed.id).toBe('add_within_10__a_plus_b');
    expect(parsed.skill).toBe('add_within_10');
    expect(parsed.text).toBe('{a} + {b} = ?');
    expect(parsed.params).toEqual({ a: [1, 5], b: [1, 5] });
    expect(parsed.constraints).toEqual(['a + b <= 10']);
    expect(parsed.answerExpr).toBe('a + b');
    expect(parsed.distractors).toEqual(['a + b + 1', 'a + b - 1', 'a * b']);
    // Nothing is invented on the way out either.
    expect(parsed).toEqual(FULL_TEMPLATE);
  });

  it('spec(T-003:AC-3) rejects a skill outside SkillId and reports the issue at path ["skill"]', () => {
    const result = templateSchema.safeParse(withOverrides(MINIMAL_TEMPLATE, { skill: 'algebra_ii' }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue: SchemaIssue) => issue.path)).toContainEqual(['skill']);
    }
  });

  it('spec(T-003:AC-4) rejects a template carrying only two distractors', () => {
    const result = templateSchema.safeParse(
      withOverrides(MINIMAL_TEMPLATE, { distractors: ['a + b + 1', 'a + b - 1'] }),
    );

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-4) rejects a template carrying no distractors at all', () => {
    const result = templateSchema.safeParse(withOverrides(MINIMAL_TEMPLATE, { distractors: [] }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-4) accepts a template carrying exactly three distractors', () => {
    const result = templateSchema.safeParse(
      withOverrides(MINIMAL_TEMPLATE, { distractors: ['a + b + 1', 'a + b - 1', 'a * b'] }),
    );

    expect(result.success).toBe(true);
  });

  it('spec(T-003:AC-5) rejects a param range with a single bound', () => {
    const result = templateSchema.safeParse(
      withOverrides(MINIMAL_TEMPLATE, { params: { a: [3], b: [1, 5] } }),
    );

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-5) rejects a param range with three bounds', () => {
    const result = templateSchema.safeParse(
      withOverrides(MINIMAL_TEMPLATE, { params: { a: [1, 2, 3], b: [1, 5] } }),
    );

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-5) rejects a param range with a non-integer bound', () => {
    const result = templateSchema.safeParse(
      withOverrides(MINIMAL_TEMPLATE, { params: { a: [1.5, 4], b: [1, 5] } }),
    );

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-6) omits absent optional keys rather than setting them to undefined', () => {
    const result = templateSchema.safeParse(MINIMAL_TEMPLATE);

    expect(result.success).toBe(true);
    if (result.success) {
      const keys = Object.keys(result.data);
      expect(keys).not.toContain('constraints');
      expect(keys).not.toContain('isWordProblem');
      expect(keys).not.toContain('readAloud');
      expect(Object.prototype.hasOwnProperty.call(result.data, 'constraints')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(result.data, 'isWordProblem')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(result.data, 'readAloud')).toBe(false);
    }
  });

  it('spec(T-003:AC-17) accepts the dormant difficulty field at 2 and preserves the value', () => {
    const result = templateSchema.safeParse(withOverrides(MINIMAL_TEMPLATE, { difficulty: 2 }));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.difficulty).toBe(2);
    }
  });

  it('spec(T-003:AC-17) rejects a difficulty below the 1..3 range', () => {
    const result = templateSchema.safeParse(withOverrides(MINIMAL_TEMPLATE, { difficulty: 0 }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-17) rejects a difficulty above the 1..3 range', () => {
    const result = templateSchema.safeParse(withOverrides(MINIMAL_TEMPLATE, { difficulty: 4 }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-17) omits difficulty entirely when the key is absent', () => {
    const result = templateSchema.safeParse(MINIMAL_TEMPLATE);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data)).not.toContain('difficulty');
      expect(Object.prototype.hasOwnProperty.call(result.data, 'difficulty')).toBe(false);
    }
  });
});

// --- AC-10: skillSchema --------------------------------------------------------------------

describe('skillSchema', () => {
  it('spec(T-003:AC-10) accepts a skill spanning minGrade 0 to maxGrade 1', () => {
    const parsed: Skill = skillSchema.parse(VALID_SKILL);

    expect(parsed.id).toBe('add_within_10');
    expect(parsed.displayName).toBe('Add within 10');
    expect(parsed.minGrade).toBe(0);
    expect(parsed.maxGrade).toBe(1);
    expect(parsed.symbolicOnly).toBe(true);
  });

  it('spec(T-003:AC-10) rejects a skill whose maxGrade is below its minGrade', () => {
    const result = skillSchema.safeParse(withOverrides(VALID_SKILL, { minGrade: 3, maxGrade: 2 }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-10) rejects a skill whose minGrade is below grade 0', () => {
    const result = skillSchema.safeParse(withOverrides(VALID_SKILL, { minGrade: -1 }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-10) rejects a skill whose maxGrade is above grade 5', () => {
    const result = skillSchema.safeParse(withOverrides(VALID_SKILL, { maxGrade: 6 }));

    expect(result.success).toBe(false);
  });
});

// --- AC-7 … AC-9, AC-12: cannonSchema ------------------------------------------------------

describe('cannonSchema', () => {
  it('spec(T-003:AC-7) accepts a cannon whose damage range is well ordered', () => {
    const parsed: Cannon = cannonSchema.parse(VALID_CANNON);

    expect(parsed.id).toBe('six_pounder');
    expect(parsed.skill).toBe('add_within_20');
    expect(parsed.damageMin).toBe(10);
    expect(parsed.damageMax).toBe(16);
    expect(parsed.temperament).toBe('standard');
    expect(parsed.recoilDamage).toBe(0);
    expect(parsed.timerMs).toBe(15000);
  });

  it('spec(T-003:AC-7) rejects a cannon whose damageMax is below its damageMin', () => {
    const result = cannonSchema.safeParse(withOverrides(VALID_CANNON, { damageMin: 16, damageMax: 10 }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-7) accepts a cannon whose damageMax equals its damageMin', () => {
    const result = cannonSchema.safeParse(withOverrides(VALID_CANNON, { damageMin: 12, damageMax: 12 }));

    expect(result.success).toBe(true);
  });

  it('spec(T-003:AC-7) rejects a cannon whose damageMin is zero', () => {
    const result = cannonSchema.safeParse(withOverrides(VALID_CANNON, { damageMin: 0 }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-8) rejects a reliable cannon that carries recoil damage', () => {
    const result = cannonSchema.safeParse(
      withOverrides(VALID_CANNON, { temperament: 'reliable', recoilDamage: 3 }),
    );

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-8) accepts a reliable cannon with zero recoil damage', () => {
    const result = cannonSchema.safeParse(
      withOverrides(VALID_CANNON, { temperament: 'reliable', recoilDamage: 0 }),
    );

    expect(result.success).toBe(true);
  });

  it('spec(T-003:AC-8) accepts a volatile cannon that carries recoil damage', () => {
    const result = cannonSchema.safeParse(
      withOverrides(VALID_CANNON, { temperament: 'volatile', recoilDamage: 5 }),
    );

    expect(result.success).toBe(true);
  });

  it('spec(T-003:AC-8) rejects a cannon with negative recoil damage', () => {
    const result = cannonSchema.safeParse(
      withOverrides(VALID_CANNON, { temperament: 'volatile', recoilDamage: -1 }),
    );

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-9) rejects a cannon whose timerMs is zero', () => {
    const result = cannonSchema.safeParse(withOverrides(VALID_CANNON, { timerMs: 0 }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-9) rejects a cannon whose timerMs is negative', () => {
    const result = cannonSchema.safeParse(withOverrides(VALID_CANNON, { timerMs: -15000 }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-9) rejects a cannon whose timerMs is not an integer', () => {
    const result = cannonSchema.safeParse(withOverrides(VALID_CANNON, { timerMs: 15000.5 }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-12) rejects a range unlock with no island', () => {
    const result = cannonSchema.safeParse(
      withOverrides(VALID_CANNON, { unlock: { kind: 'range', tier: 1 } }),
    );

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-12) accepts a starter unlock', () => {
    const result = cannonSchema.safeParse(withOverrides(VALID_CANNON, { unlock: { kind: 'starter' } }));

    expect(result.success).toBe(true);
  });

  it('spec(T-003:AC-12) accepts a chest unlock', () => {
    const result = cannonSchema.safeParse(withOverrides(VALID_CANNON, { unlock: { kind: 'chest' } }));

    expect(result.success).toBe(true);
  });

  it('spec(T-003:AC-12) accepts a range unlock naming an island and a tier', () => {
    const result = cannonSchema.safeParse(
      withOverrides(VALID_CANNON, { unlock: { kind: 'range', island: 'isla_products', tier: 2 } }),
    );

    expect(result.success).toBe(true);
    if (result.success && result.data.unlock.kind === 'range') {
      expect(result.data.unlock.island).toBe('isla_products');
      expect(result.data.unlock.tier).toBe(2);
    }
  });

  it('spec(T-003:AC-12) rejects a range unlock whose tier is below 1', () => {
    const result = cannonSchema.safeParse(
      withOverrides(VALID_CANNON, { unlock: { kind: 'range', island: 'port_sumwich', tier: 0 } }),
    );

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-12) rejects an unlock whose kind is outside the union', () => {
    const result = cannonSchema.safeParse(withOverrides(VALID_CANNON, { unlock: { kind: 'purchase' } }));

    expect(result.success).toBe(false);
  });
});

// --- AC-11: islandSchema / rankSchema ------------------------------------------------------

describe('islandSchema', () => {
  it('spec(T-003:AC-11) accepts the first island at order 0 and preserves its id lists', () => {
    const parsed: Island = islandSchema.parse(VALID_ISLAND);

    expect(parsed.id).toBe('port_sumwich');
    expect(parsed.order).toBe(0);
    expect(parsed.rangeSkills).toEqual(['add_within_10', 'add_within_20']);
    expect(parsed.unlocksCannons).toEqual(['six_pounder', 'chain_shot']);
  });

  it('spec(T-003:AC-11) rejects an island whose order is negative', () => {
    const result = islandSchema.safeParse(withOverrides(VALID_ISLAND, { order: -1 }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-11) accepts and preserves an optional requiresIsland predecessor', () => {
    const result = islandSchema.safeParse(
      withOverrides(VALID_ISLAND, { id: 'isla_products', order: 1, requiresIsland: 'port_sumwich' }),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requiresIsland).toBe('port_sumwich');
    }
  });
});

describe('rankSchema', () => {
  it('spec(T-003:AC-11) accepts the first rank at tier 0 with zero required wins', () => {
    const parsed: Rank = rankSchema.parse(VALID_RANK);

    expect(parsed.id).toBe('cadet');
    expect(parsed.tier).toBe(0);
    expect(parsed.minWins).toBe(0);
  });

  it('spec(T-003:AC-11) rejects a rank whose tier is negative', () => {
    const result = rankSchema.safeParse(withOverrides(VALID_RANK, { tier: -1 }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-11) rejects a rank whose minWins is negative', () => {
    const result = rankSchema.safeParse(withOverrides(VALID_RANK, { minWins: -1 }));

    expect(result.success).toBe(false);
  });
});

// --- crewSchema ----------------------------------------------------------------------------
// NOTE: `crewSchema { id: string; displayName: string; role: string }` is listed in T-003's
// "Required shapes" block but is covered by NO acceptance criterion. It is exercised here
// because T-006 authors `crew.json` against it and cannot edit this frozen file. These two
// tests are deliberately left untagged rather than mis-attributed to an unrelated AC; the gap
// is reported back to the orchestrator.

describe('crewSchema', () => {
  it('parses a crew member carrying id, displayName, and role', () => {
    const parsed: Crew = crewSchema.parse(VALID_CREW);

    expect(parsed.id).toBe('gunner');
    expect(parsed.displayName).toBe('Gunner');
    expect(parsed.role).toBe('gunner');
  });

  it('rejects a crew member with no role', () => {
    const result = crewSchema.safeParse({ id: 'cook', displayName: 'Cook' });

    expect(result.success).toBe(false);
  });
});
