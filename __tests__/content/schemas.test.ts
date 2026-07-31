/**
 * T-003 — `src/content/schemas.ts`: content zod schemas + the id unions.
 *
 * These tests are FROZEN. Five later tickets (T-005, T-006, T-007, T-009, T-019) import the
 * vocabulary pinned here, so both directions are proven for every schema: valid fixtures parse
 * and produce the expected typed output, and each invalid fixture is rejected for exactly one
 * reason per test.
 *
 * Traceability: every test cites `spec(T-003:AC-n)` in its name.
 *
 * T-034 appends the param-key identifier-grammar narrowing below (same file per
 * `test_scopes`). Do not weaken the frozen T-003 / T-026 cases above the T-034 divider.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  ENEMY_PRESENTATION_KINDS,
  enemySchema,
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
  Enemy,
  EnemyPresentationKind,
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
import { evaluateNumber } from '@engine/questions/expr';

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

const VALID_ENEMY: Record<string, unknown> = {
  id: 'pirate_patrol',
  islandId: 'port_sumwich',
  displayName: 'Pirate Patrol',
  faction: 'pirate',
  presentationKind: 'pirate',
  accessibilityLabel: 'Pirate crew on a wooden sloop with a black flag',
};

// --- AC-1: the id sets ---------------------------------------------------------------------

describe('id unions', () => {
  it('spec(T-003:AC-1) SKILL_IDS lists the ten skill ids in ticket order with no duplicates', () => {
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
      'repeated_addition', // A-060 — the K-1 grouping rung of Isla Products
    ]);
    expect(new Set(SKILL_IDS).size).toBe(SKILL_IDS.length);
    const unionMatchesArray: Exact<SkillId, (typeof SKILL_IDS)[number]> = true;
    expect(unionMatchesArray).toBe(true);
  });

  it('spec(T-003:AC-1) CANNON_IDS lists the twelve cannon ids in ticket order with no duplicates', () => {
    expect(CANNON_IDS).toEqual([
      'swivel_gun',
      'culverin',
      'saker', // T-029 / D-7 — invented range payoff for add_within_10
      'six_pounder',
      'chain_shot',
      'nine_pounder',
      'twelve_pounder',
      'mortar',
      'double_broadside',
      'powder_keg',
      'long_nine',
      'grapeshot', // A-060 — invented range payoff for repeated_addition, at Isla Products
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

// --- AC-1 (continued): the schemas must actually CONSUME those id unions ---------------------
// Declaring the arrays is half the criterion; a schema using `z.string()` for an id field
// satisfies every happy-path test while making the `z.infer`-derived type resolve to `string`
// everywhere downstream (T-007 `SkillId`, T-009 `RankId`, T-013). No AC names these fields
// individually — the required-shapes block does — so they are tagged to AC-1, the criterion
// that owns the id vocabulary. `unlock.island` is covered under AC-12, which owns that union.

describe('id unions in schema fields', () => {
  it('spec(T-003:AC-1) skillSchema rejects an id outside SkillId', () => {
    expect(skillSchema.safeParse(withOverrides(VALID_SKILL, { id: 'algebra_ii' })).success).toBe(false);
  });

  it('spec(T-003:AC-1) cannonSchema rejects an id outside CannonId', () => {
    expect(cannonSchema.safeParse(withOverrides(VALID_CANNON, { id: 'trebuchet' })).success).toBe(false);
  });

  it('spec(T-003:AC-1) cannonSchema rejects a skill outside SkillId', () => {
    expect(cannonSchema.safeParse(withOverrides(VALID_CANNON, { skill: 'algebra_ii' })).success).toBe(false);
  });

  it('spec(T-003:AC-1) cannonSchema rejects a temperament outside Temperament', () => {
    expect(cannonSchema.safeParse(withOverrides(VALID_CANNON, { temperament: 'spicy' })).success).toBe(false);
  });

  it('spec(T-003:AC-1) islandSchema rejects an id outside IslandId', () => {
    expect(islandSchema.safeParse(withOverrides(VALID_ISLAND, { id: 'atlantis' })).success).toBe(false);
  });

  it('spec(T-003:AC-1) islandSchema rejects a rangeSkills entry outside SkillId', () => {
    expect(islandSchema.safeParse(withOverrides(VALID_ISLAND, { rangeSkills: ['algebra_ii'] })).success).toBe(
      false,
    );
  });

  it('spec(T-003:AC-1) islandSchema rejects an unlocksCannons entry outside CannonId', () => {
    expect(
      islandSchema.safeParse(withOverrides(VALID_ISLAND, { unlocksCannons: ['trebuchet'] })).success,
    ).toBe(false);
  });

  it('spec(T-003:AC-1) islandSchema rejects a requiresIsland outside IslandId', () => {
    expect(islandSchema.safeParse(withOverrides(VALID_ISLAND, { requiresIsland: 'atlantis' })).success).toBe(
      false,
    );
  });

  it('spec(T-003:AC-1) islandSchema accepts and preserves an optional requiresIsland predecessor', () => {
    const result = islandSchema.safeParse(
      withOverrides(VALID_ISLAND, { id: 'isla_products', order: 1, requiresIsland: 'port_sumwich' }),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requiresIsland).toBe('port_sumwich');
    }
  });

  it('spec(T-003:AC-1) rankSchema rejects an id outside RankId', () => {
    expect(rankSchema.safeParse(withOverrides(VALID_RANK, { id: 'admiral' })).success).toBe(false);
  });

  it('spec(T-003:AC-1) derives every id-typed field as its union, never as string', () => {
    const skillId: Exact<Skill['id'], SkillId> = true;
    const templateSkill: Exact<Template['skill'], SkillId> = true;
    const cannonId: Exact<Cannon['id'], CannonId> = true;
    const cannonSkill: Exact<Cannon['skill'], SkillId> = true;
    const cannonTemperament: Exact<Cannon['temperament'], Temperament> = true;
    const islandId: Exact<Island['id'], IslandId> = true;
    const rangeSkill: Exact<Island['rangeSkills'][number], SkillId> = true;
    const unlocksCannon: Exact<Island['unlocksCannons'][number], CannonId> = true;
    const requiresIsland: Exact<Island['requiresIsland'], IslandId | undefined> = true;
    const rankId: Exact<Rank['id'], RankId> = true;

    expect([
      skillId,
      templateSkill,
      cannonId,
      cannonSkill,
      cannonTemperament,
      islandId,
      rangeSkill,
      unlocksCannon,
      requiresIsland,
      rankId,
    ]).toEqual([true, true, true, true, true, true, true, true, true, true]);
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

  it('spec(T-003:AC-4) rejects distractors that are not expression strings', () => {
    const result = templateSchema.safeParse(withOverrides(MINIMAL_TEMPLATE, { distractors: [1, 2, 3] }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-4) types distractors as strings so T-007 can evaluate them', () => {
    const distractorsAreStrings: Exact<Template['distractors'][number], string> = true;

    expect(distractorsAreStrings).toBe(true);
  });

  it('spec(T-003:AC-2) rejects constraints that are not expression strings', () => {
    const result = templateSchema.safeParse(withOverrides(MINIMAL_TEMPLATE, { constraints: [7] }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-2) types constraints as strings', () => {
    const constraintsAreStrings: Exact<NonNullable<Template['constraints']>[number], string> = true;

    expect(constraintsAreStrings).toBe(true);
  });

  it('spec(T-003:AC-4) accepts a template carrying exactly three distractors', () => {
    const result = templateSchema.safeParse(
      withOverrides(MINIMAL_TEMPLATE, { distractors: ['a + b + 1', 'a + b - 1', 'a * b'] }),
    );

    expect(result.success).toBe(true);
  });

  // T-026 tightens the distractor count from "at least three" (T-003 AC-4, superseded) to
  // "exactly three" — ARCHITECTURE.md §4.1 is four-choice universally, and a four-distractor
  // template used to validate here only to be rejected later, far away, by assertQuestion's
  // CHOICE_COUNT === 4 guard. This pins the located, immediate rejection instead.
  //
  // Note on provenance: T-003's frozen suite never actually contained an assertion that a
  // four-distractor template parses successfully (verified: no such fixture exists in any
  // revision of this file, and the only "accepts" case above uses exactly three). The
  // over-permissive behaviour lived in `templateSchema`'s `.min(3)` alone — confirmed by a
  // throwaway probe against the merged module before this edit — not in a frozen test that
  // needed inverting. Nothing above this comment is touched; AC-1/AC-3/AC-4 below are added
  // (not inverted) purely to give this ticket its own citations per spec-lint, alongside the
  // pre-existing T-003 coverage that already establishes the same facts.
  it('spec(T-026:AC-1) accepts a template carrying exactly three distractors', () => {
    const result = templateSchema.safeParse(
      withOverrides(MINIMAL_TEMPLATE, { distractors: ['a + b + 1', 'a + b - 1', 'a * b'] }),
    );

    expect(result.success).toBe(true);
  });

  it('spec(T-026:AC-2) rejects a template carrying four distractors, with the issue at path ["distractors"]', () => {
    const result = templateSchema.safeParse(
      withOverrides(MINIMAL_TEMPLATE, {
        distractors: ['a + b + 1', 'a + b - 1', 'a * b', 'a - b'],
      }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue: SchemaIssue) => issue.path)).toContainEqual(['distractors']);
    }
  });

  it('spec(T-026:AC-3) rejects a template carrying only two distractors (lower bound unchanged)', () => {
    const result = templateSchema.safeParse(
      withOverrides(MINIMAL_TEMPLATE, { distractors: ['a + b + 1', 'a + b - 1'] }),
    );

    expect(result.success).toBe(false);
  });

  it('spec(T-026:AC-4) keeps distractors typed as string[] with element type string', () => {
    const distractorsAreStrings: Exact<Template['distractors'][number], string> = true;

    expect(distractorsAreStrings).toBe(true);
  });

  // A scoped regression sentinel, not a re-verification of the whole 90-test suite (that is
  // `npx vitest run` itself, per the ticket's own gate) — this pins that tightening the
  // distractor count did not perturb any sibling field on templateSchema or leak into any
  // other schema in this module.
  it('spec(T-026:AC-5) leaves every other templateSchema field and every other schema unaffected', () => {
    const parsed = templateSchema.parse(FULL_TEMPLATE);
    expect(parsed).toEqual(FULL_TEMPLATE);

    expect(skillSchema.safeParse(VALID_SKILL).success).toBe(true);
    expect(cannonSchema.safeParse(VALID_CANNON).success).toBe(true);
    expect(islandSchema.safeParse(VALID_ISLAND).success).toBe(true);
    expect(rankSchema.safeParse(VALID_RANK).success).toBe(true);
    expect(crewSchema.safeParse(VALID_CREW).success).toBe(true);
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

  // Bounded is not enumerated: `z.number().min(1).max(3)` would accept 2.5 and infer `number`,
  // defeating the field's purpose as a stable escape hatch for open question 2.10.
  it('spec(T-003:AC-17) rejects a difficulty between the permitted literals', () => {
    const result = templateSchema.safeParse(withOverrides(MINIMAL_TEMPLATE, { difficulty: 2.5 }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-17) types difficulty as the literal union 1 | 2 | 3, not number', () => {
    const difficultyIsALiteralUnion: Exact<Template['difficulty'], 1 | 2 | 3 | undefined> = true;

    expect(difficultyIsALiteralUnion).toBe(true);
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

  // The equality boundary: without it a `maxGrade > minGrade` refinement passes every other
  // test here, and T-006 authors single-grade skills against a frozen file it cannot edit.
  it('spec(T-003:AC-10) accepts a single-grade skill whose maxGrade equals its minGrade', () => {
    const result = skillSchema.safeParse(withOverrides(VALID_SKILL, { minGrade: 4, maxGrade: 4 }));

    expect(result.success).toBe(true);
  });

  it('spec(T-003:AC-10) rejects a skill whose minGrade is not an integer', () => {
    const result = skillSchema.safeParse(withOverrides(VALID_SKILL, { minGrade: 0.5 }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-10) rejects a skill whose maxGrade is not an integer', () => {
    const result = skillSchema.safeParse(withOverrides(VALID_SKILL, { maxGrade: 1.5 }));

    expect(result.success).toBe(false);
  });
});

// --- AC-7 … AC-9, AC-12: cannonSchema ------------------------------------------------------

describe('cannonSchema', () => {
  it('spec(T-003:AC-7) accepts a cannon whose damage range is well ordered', () => {
    const parsed: Cannon = cannonSchema.parse(VALID_CANNON);

    expect(parsed.damageMin).toBe(10);
    expect(parsed.damageMax).toBe(16);
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

  it('spec(T-003:AC-7) rejects a cannon whose damageMin is not an integer', () => {
    const result = cannonSchema.safeParse(withOverrides(VALID_CANNON, { damageMin: 10.5 }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-7) rejects a cannon whose damageMax is not an integer', () => {
    const result = cannonSchema.safeParse(withOverrides(VALID_CANNON, { damageMax: 16.5 }));

    expect(result.success).toBe(false);
  });

  // Cannon grade bounds: transcribed from the required-shapes block (`minGrade: 0..5;
  // maxGrade: 0..5`), which no AC restates. T-006 AC-11 pins each cannon's pair to its skill's.
  it('spec(T-003:AC-7) rejects a cannon whose minGrade is below grade 0', () => {
    const result = cannonSchema.safeParse(withOverrides(VALID_CANNON, { minGrade: -1 }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-7) rejects a cannon whose maxGrade is above grade 5', () => {
    const result = cannonSchema.safeParse(withOverrides(VALID_CANNON, { maxGrade: 6 }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-7) rejects a cannon whose minGrade is not an integer', () => {
    const result = cannonSchema.safeParse(withOverrides(VALID_CANNON, { minGrade: 1.5 }));

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

  it('spec(T-003:AC-8) rejects a cannon whose recoilDamage is not an integer', () => {
    const result = cannonSchema.safeParse(
      withOverrides(VALID_CANNON, { temperament: 'volatile', recoilDamage: 5.5 }),
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

  it('spec(T-003:AC-12) rejects a range unlock whose tier is not an integer', () => {
    const result = cannonSchema.safeParse(
      withOverrides(VALID_CANNON, { unlock: { kind: 'range', island: 'port_sumwich', tier: 1.5 } }),
    );

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-12) rejects a range unlock whose island is outside IslandId', () => {
    const result = cannonSchema.safeParse(
      withOverrides(VALID_CANNON, { unlock: { kind: 'range', island: 'atlantis', tier: 1 } }),
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
  it('spec(T-003:AC-11) accepts the first island at order 0', () => {
    const parsed: Island = islandSchema.parse(VALID_ISLAND);

    expect(parsed.order).toBe(0);
  });

  it('spec(T-003:AC-11) rejects an island whose order is negative', () => {
    const result = islandSchema.safeParse(withOverrides(VALID_ISLAND, { order: -1 }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-11) rejects an island whose order is not an integer', () => {
    const result = islandSchema.safeParse(withOverrides(VALID_ISLAND, { order: 1.5 }));

    expect(result.success).toBe(false);
  });
});

describe('rankSchema', () => {
  it('spec(T-003:AC-11) accepts the first rank at tier 0 with zero required wins', () => {
    const parsed: Rank = rankSchema.parse(VALID_RANK);

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

  it('spec(T-003:AC-11) rejects a rank whose tier is not an integer', () => {
    const result = rankSchema.safeParse(withOverrides(VALID_RANK, { tier: 1.5 }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-11) rejects a rank whose minWins is not an integer', () => {
    const result = rankSchema.safeParse(withOverrides(VALID_RANK, { minWins: 2.5 }));

    expect(result.success).toBe(false);
  });
});

// --- AC-18: crewSchema ---------------------------------------------------------------------

describe('crewSchema', () => {
  it('spec(T-003:AC-18) round-trips a crew member carrying id, displayName, and role', () => {
    const parsed: Crew = crewSchema.parse(VALID_CREW);

    expect(parsed.id).toBe('gunner');
    expect(parsed.displayName).toBe('Gunner');
    expect(parsed.role).toBe('gunner');
  });

  it('spec(T-003:AC-18) rejects a crew member with no role', () => {
    const result = crewSchema.safeParse({ id: 'cook', displayName: 'Cook' });

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-18) rejects a crew member whose role is not a string', () => {
    const result = crewSchema.safeParse(withOverrides(VALID_CREW, { role: 7 }));

    expect(result.success).toBe(false);
  });
});

// --- AC-19: unknown keys are rejected, never silently stripped -------------------------------
// zod strips unknown keys by default, so a typo'd OPTIONAL field in a catalog would validate
// cleanly and vanish. Each fixture below is otherwise valid and differs only by one extra key,
// so these tests fail for exactly one reason: the schema is not strict.

describe('unknown keys', () => {
  it('spec(T-003:AC-19) templateSchema rejects a template carrying an unknown key', () => {
    const result = templateSchema.safeParse(withOverrides(MINIMAL_TEMPLATE, { readAlound: true }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-19) cannonSchema rejects a cannon carrying an unknown key', () => {
    const result = cannonSchema.safeParse(withOverrides(VALID_CANNON, { recoilDmg: 3 }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-19) skillSchema rejects a skill carrying an unknown key', () => {
    const result = skillSchema.safeParse(withOverrides(VALID_SKILL, { symbolicOnyl: true }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-19) islandSchema rejects an island carrying an unknown key', () => {
    const result = islandSchema.safeParse(withOverrides(VALID_ISLAND, { requiresIsand: 'grandline' }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-19) rankSchema rejects a rank carrying an unknown key', () => {
    const result = rankSchema.safeParse(withOverrides(VALID_RANK, { minWin: 3 }));

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-19) crewSchema rejects a crew member carrying an unknown key', () => {
    const result = crewSchema.safeParse(withOverrides(VALID_CREW, { roles: 'gunner' }));

    expect(result.success).toBe(false);
  });
});

// --- AC-20: strictness reaches inside the nested unlock union --------------------------------
// `unlock` is the most typo-prone shape in the catalog (`teir`/`tier`, `iland`/`island`), and
// top-level strictness alone does not cover it. Every variant is covered so an implementation
// that strictens only the `range` branch is caught.

describe('unknown keys inside the unlock union', () => {
  it('spec(T-003:AC-20) rejects a range unlock carrying an unknown key', () => {
    const result = cannonSchema.safeParse(
      withOverrides(VALID_CANNON, {
        unlock: { kind: 'range', island: 'port_sumwich', tier: 2, teir: 2 },
      }),
    );

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-20) rejects a starter unlock carrying an unknown key', () => {
    const result = cannonSchema.safeParse(
      withOverrides(VALID_CANNON, { unlock: { kind: 'starter', island: 'port_sumwich' } }),
    );

    expect(result.success).toBe(false);
  });

  it('spec(T-003:AC-20) rejects a chest unlock carrying an unknown key', () => {
    const result = cannonSchema.safeParse(
      withOverrides(VALID_CANNON, { unlock: { kind: 'chest', tier: 1 } }),
    );

    expect(result.success).toBe(false);
  });
});

// =============================================================================================
// T-034 — narrow template param keys to T-002's IDENT grammar
// =============================================================================================
//
// Locked decision: keys must match IDENT := [A-Za-z_][A-Za-z0-9_]* (T-002). Today's
// `z.record(paramRangeSchema)` accepts any string — these cases stay RED until schemas.ts
// narrows the key side. AC-4 measures agreement against the live evaluator so a schema-only
// regex cannot drift from the grammar that consumes the keys.

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '../..');
const SCHEMAS_SRC_PATH = join(REPO_ROOT, 'src/content/schemas.ts');
const EXPR_SRC_PATH = join(REPO_ROOT, 'src/engine/questions/expr.ts');
const TEMPLATES_DIR = join(REPO_ROOT, 'src/content/templates');
const OWN_SOURCE = readFileSync(fileURLToPath(import.meta.url), 'utf8');
const TICKET_SOURCE = readFileSync(join(REPO_ROOT, 'tickets/T-034.md'), 'utf8');

/** Keys spanning the full IDENT grammar (same shape as T-007 AC-19's fixture). */
const LEGAL_PARAM_KEYS = ['_x', 'Total', 'a1', 'A_1b2', 'z_', 'a', 'n'] as const;

/**
 * Reject set enumerated by T-034 AC-2 — not sampled. Each is authorable today under
 * `z.record` and unusable as an expression identifier.
 */
const ILLEGAL_PARAM_KEYS = ['a-b', '2x', '', 'a b', 'a.b'] as const;

/**
 * Shared drift corpus for AC-4: legal + illegal + a few near-misses so neither side can
 * quietly widen or narrow without the other noticing. Digit-only strings (`"7"`, `"0"`) are
 * NUMBER literals in T-002 — not IDENT — and must be rejected by both sides (I-1).
 */
const IDENT_DRIFT_CORPUS: readonly string[] = [
  ...LEGAL_PARAM_KEYS,
  ...ILLEGAL_PARAM_KEYS,
  'x-y',
  '1a',
  '7',
  '0',
  'a/b',
  'a+b',
  'foo.bar',
  'a\tb',
  '__proto__',
  'constructor',
  'abs',
  '_',
  'Z',
  'camelCase',
  'snake_case_1',
];

function templateWithParamKey(key: string): unknown {
  return withOverrides(MINIMAL_TEMPLATE, {
    id: `param-key-${key === '' ? 'empty' : key}`,
    params: { [key]: [1, 5] },
    answerExpr: key === '' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? '1' : key,
  });
}

/**
 * True when a Zod failure names `key` — either as a path segment (preferred) or inside the
 * issue message. Empty-string keys can only be named via the path.
 */
function issuesNameKey(
  issues: readonly { readonly path: readonly (string | number)[]; readonly message: string }[],
  key: string,
): boolean {
  return issues.some((issue) => {
    if (issue.path.some((segment) => segment === key)) return true;
    return key.length > 0 && issue.message.includes(key);
  });
}

/**
 * T-002 IDENT membership via the live evaluator — without mistaking NUMBER literals for idents.
 *
 * A pure digit string like `"7"` evaluates successfully with an empty env (NUMBER token). An
 * IDENT never does: it needs a binding. So: empty-env success ⇒ not IDENT; empty-env failure +
 * bound-env success returning the sentinel ⇒ single IDENT that resolves. Null-prototype env so
 * `__proto__` / `constructor` probe the grammar, not Object.prototype.
 *
 * Once DoD-5 lands, prefer the shared `IDENT_PATTERN` / Ident helper export from expr.
 */
function isT002Ident(key: string): boolean {
  const emptyEnv = Object.create(null) as Record<string, number>;
  try {
    evaluateNumber(key, emptyEnv);
    // Env-free success ⇒ NUMBER (or other non-IDENT primary), not an identifier.
    return false;
  } catch {
    // fall through — candidates must fail without a binding
  }

  const env = Object.create(null) as Record<string, number>;
  env[key] = 7;
  try {
    return evaluateNumber(key, env) === 7;
  } catch {
    return false;
  }
}

function loadShippedTemplates(): Template[] {
  const files = readdirSync(TEMPLATES_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();
  expect(files.length, 'shipped template catalog must not be empty').toBeGreaterThan(0);

  const loaded: Template[] = [];
  for (const file of files) {
    const raw: unknown = JSON.parse(readFileSync(join(TEMPLATES_DIR, file), 'utf8'));
    expect(Array.isArray(raw), `${file} must be a JSON array`).toBe(true);
    for (const entry of raw as unknown[]) {
      const parsed = templateSchema.safeParse(entry);
      expect(
        parsed.success,
        parsed.success ? undefined : `${file}: ${JSON.stringify(parsed.error.issues)}`,
      ).toBe(true);
      if (parsed.success) loaded.push(parsed.data);
    }
  }
  return loaded;
}

describe('T-034 — template param keys match the expression-identifier grammar', () => {
  it('spec(T-034:AC-1) accepts identifier-shaped param keys and preserves them unchanged', () => {
    const params = Object.fromEntries(LEGAL_PARAM_KEYS.map((key, index) => [key, [index, index + 1]]));
    const result = templateSchema.safeParse(
      withOverrides(MINIMAL_TEMPLATE, {
        id: 'legal-param-keys',
        text: LEGAL_PARAM_KEYS.map((key) => `{${key}}`).join(' '),
        params,
        answerExpr: LEGAL_PARAM_KEYS.join(' + '),
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(Object.keys(result.data.params)).toEqual([...LEGAL_PARAM_KEYS]);
    expect(result.data.params).toEqual(params);
  });

  it.each([...ILLEGAL_PARAM_KEYS])(
    'spec(T-034:AC-2) rejects param key %j and names it in the error',
    (key) => {
      const result = templateSchema.safeParse(templateWithParamKey(key));

      expect(result.success, `key ${JSON.stringify(key)} must fail under the narrowed schema`).toBe(false);
      if (result.success) return;
      expect(
        issuesNameKey(result.error.issues, key),
        `Zod issues must name the offending key ${JSON.stringify(key)}: ${JSON.stringify(result.error.issues)}`,
      ).toBe(true);
    },
  );

  it('spec(T-034:AC-3) every shipped template still parses under the narrowed schema', () => {
    const templates = loadShippedTemplates();
    expect(templates.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const template of templates) {
      for (const key of Object.keys(template.params)) {
        if (!isT002Ident(key)) {
          offenders.push(`${template.id}: ${JSON.stringify(key)}`);
        }
      }
    }
    expect(offenders, 'shipped catalogs must already satisfy IDENT — content bug if not').toEqual([]);
  });

  it('spec(T-034:AC-4) schema key acceptance matches T-002 IDENT over a shared corpus', () => {
    const drift: string[] = [];
    for (const key of IDENT_DRIFT_CORPUS) {
      const schemaAccepts = templateSchema.safeParse(templateWithParamKey(key)).success;
      const exprAccepts = isT002Ident(key);
      if (schemaAccepts !== exprAccepts) {
        drift.push(
          `${JSON.stringify(key)}: schema=${String(schemaAccepts)} exprIdent=${String(exprAccepts)}`,
        );
      }
    }
    expect(drift).toEqual([]);
  });
});

describe('T-034 Definition of Done', () => {
  it('dod(T-034:1) tags a test against every acceptance criterion the ticket declares', () => {
    const declared = [...TICKET_SOURCE.matchAll(/\*\*(AC-\d+)\*\*/g)].map((match) => match[1]);
    const unique = [...new Set(declared)];
    const untagged = unique.filter((ac) => !OWN_SOURCE.includes(`spec(T-034:${ac})`));

    expect(unique.length).toBe(4);
    expect(untagged).toEqual([]);
  });

  it('dod(T-034:2) keeps local gates wired and this suite free of skip/only markers', () => {
    const gates = readFileSync(join(REPO_ROOT, '.tdd-swarm/run-local-gates.sh'), 'utf8');
    for (const command of ['prettier --check', 'eslint . --max-warnings 0', 'tsc --noEmit', 'vitest run']) {
      expect(gates, `run-local-gates.sh must still run: ${command}`).toContain(command);
    }
    expect(/\b(it|test|describe)\.(skip|only)\b|\bx(it|describe)\b/.test(OWN_SOURCE)).toBe(false);
  });

  it('dod(T-034:3) numbers every dod tag so spec-lint covers all six DoD items', () => {
    const dodCount = (TICKET_SOURCE.match(/^- \[[ x]\] /gm) ?? []).length;
    // Only count concrete numeric tags in `it('dod(T-034:N) …')` titles — not prose mentions.
    const tagged = [...OWN_SOURCE.matchAll(/\bit\('dod\(T-034:(\d+)\)/g)].map((match) => Number(match[1]));
    const covered = new Set(tagged);
    const missing = Array.from({ length: dodCount }, (_, i) => i + 1).filter((n) => !covered.has(n));

    expect(dodCount).toBe(6);
    expect(missing).toEqual([]);
    expect(OWN_SOURCE).toContain('spec(T-034:AC-');
  });

  it('dod(T-034:4) every DoD checkbox has a corresponding numbered dod tag in this suite', () => {
    expect(OWN_SOURCE).toContain("it('dod(T-034:1)");
    expect(OWN_SOURCE).toContain("it('dod(T-034:2)");
    expect(OWN_SOURCE).toContain("it('dod(T-034:3)");
    expect(OWN_SOURCE).toContain("it('dod(T-034:4)");
    expect(OWN_SOURCE).toContain("it('dod(T-034:5)");
    expect(OWN_SOURCE).toContain("it('dod(T-034:6)");
  });

  it('dod(T-034:5) the IDENT pattern is imported from T-002, not re-stated as a literal in schemas.ts', () => {
    expect(existsSync(SCHEMAS_SRC_PATH)).toBe(true);
    expect(existsSync(EXPR_SRC_PATH)).toBe(true);
    const schemasSrc = readFileSync(SCHEMAS_SRC_PATH, 'utf8');
    const exprSrc = readFileSync(EXPR_SRC_PATH, 'utf8');

    // Locked decision: schemas consumes the grammar; it does not re-derive the character class.
    expect(schemasSrc).toMatch(/from\s+['"]@engine\/questions\/expr['"]/);
    expect(schemasSrc).not.toMatch(/\[A-Za-z_\]\[A-Za-z0-9_\]\*/);

    // file_scopes includes expr.ts for a pure IDENT export (orchestrator adjudication).
    // Preferred names: IDENT_PATTERN, isIdent, isIdentifier — symbol must contain
    // Ident / IDENT / Identifier (PARAM_KEY_PATTERN alone is not enough).
    expect(exprSrc).toMatch(
      /export\s+(?:const|function)\s+[A-Za-z0-9_]*?(?:Ident|IDENT|Identifier)[A-Za-z0-9_]*/,
    );
  });

  it('dod(T-034:6) production scope for the narrowing is src/content/schemas.ts', () => {
    expect(existsSync(SCHEMAS_SRC_PATH)).toBe(true);
    const schemasSrc = readFileSync(SCHEMAS_SRC_PATH, 'utf8');
    expect(schemasSrc).toContain('export const templateSchema');

    // Do not split the key grammar into a sibling content module — file_scopes is schemas.ts.
    const contentTs = readdirSync(join(REPO_ROOT, 'src/content')).filter((name) => name.endsWith('.ts'));
    expect(contentTs.filter((name) => /param|ident/i.test(name))).toEqual([]);
  });
});

// --- A-031: enemySchema ----------------------------------------------------------------------

describe('A-031 enemySchema', () => {
  it('spec(A-031:AC-1) ENEMY_PRESENTATION_KINDS lists the five encounter kinds in island order', () => {
    expect(ENEMY_PRESENTATION_KINDS).toEqual(['pirate', 'skeleton', 'ghost', 'shark', 'kraken']);
    const unionMatchesArray: Exact<EnemyPresentationKind, (typeof ENEMY_PRESENTATION_KINDS)[number]> = true;
    expect(unionMatchesArray).toBe(true);
  });

  it('spec(A-031:AC-1) round-trips a valid enemy entry unchanged', () => {
    const parsed: Enemy = enemySchema.parse(VALID_ENEMY);
    expect(parsed).toEqual(VALID_ENEMY);
  });

  it('spec(A-031:AC-5) rejects an islandId outside IslandId', () => {
    expect(enemySchema.safeParse(withOverrides(VALID_ENEMY, { islandId: 'atlantis' })).success).toBe(false);
  });

  it('spec(A-031:AC-5) rejects a presentationKind outside the union', () => {
    expect(enemySchema.safeParse(withOverrides(VALID_ENEMY, { presentationKind: 'rival' })).success).toBe(
      false,
    );
  });

  it('spec(A-031:AC-5) rejects an enemy carrying an unknown key', () => {
    expect(enemySchema.safeParse(withOverrides(VALID_ENEMY, { rivalKind: 'generic' })).success).toBe(false);
  });
});
