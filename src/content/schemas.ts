/**
 * Zod schemas for every bundled content catalog, plus the id unions they are built from.
 *
 * This is the single type vocabulary for the whole swarm: every catalog type is derived from
 * its schema via `z.infer` so there is exactly one source of truth. Catalogs are hand-authored
 * JSON with no compile-time types, which is precisely why runtime validation is the contract
 * (ARCHITECTURE.md §4.4). Every schema here is strict — unknown keys are rejected, including
 * inside the nested `unlock` discriminated union — so a typo'd field in authored content fails
 * loudly instead of being silently stripped (see .tdd-swarm/LESSONS.md L-009).
 */
import { IDENT_PATTERN } from '@engine/questions/expr';
import { z } from 'zod';

// --- Id unions, each with a companion `as const` array -------------------------------------

export const SKILL_IDS = [
  'add_within_10',
  'add_within_20',
  'sub_within_20',
  'place_value_compare',
  'mult_facts',
  'two_step_add_sub',
  'div_facts',
  'fractions_int',
  'multi_digit_order_ops',
] as const;
export type SkillId = (typeof SKILL_IDS)[number];

export const CANNON_IDS = [
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
] as const;
export type CannonId = (typeof CANNON_IDS)[number];

export const ISLAND_IDS = [
  'port_sumwich',
  'isla_products',
  'quotient_cove',
  'fraction_reef',
  'grandline',
] as const;
export type IslandId = (typeof ISLAND_IDS)[number];

export const RANK_IDS = ['cadet', 'ensign', 'captain', 'commodore', 'fleet_legend'] as const;
export type RankId = (typeof RANK_IDS)[number];

export const GRADE_BANDS = ['k_1', 'g2_3', 'g4_5'] as const;
export type GradeBand = (typeof GRADE_BANDS)[number];

export const TEMPERAMENTS = ['reliable', 'standard', 'volatile'] as const;
export type Temperament = (typeof TEMPERAMENTS)[number];

export const CHEST_RARITIES = ['common', 'uncommon', 'rare'] as const;
export type ChestRarity = (typeof CHEST_RARITIES)[number];

// --- Shared field schemas -------------------------------------------------------------------

/** Numeric school grade: K is 0, grades 1-5 are 1-5. */
const gradeSchema = z.number().int().min(0).max(5);

/** A template's inclusive integer sampling range, e.g. `[1, 5]`. */
const paramRangeSchema = z.tuple([z.number().int(), z.number().int()]);

/**
 * Param keys must be T-002 identifiers so `{name}` / `answerExpr` / constraints can reference
 * them. Pattern is imported from the evaluator grammar — not re-stated here (T-034 / L-009).
 */
const paramKeySchema = z.string().regex(IDENT_PATTERN, {
  message: 'param key must be an expression identifier',
});

// --- templateSchema (AC-2 .. AC-6, AC-17) ---------------------------------------------------

export const templateSchema = z
  .object({
    id: z.string(),
    skill: z.enum(SKILL_IDS),
    text: z.string(),
    params: z.record(paramKeySchema, paramRangeSchema),
    constraints: z.array(z.string()).optional(),
    answerExpr: z.string(),
    distractors: z.array(z.string()).length(3),
    isWordProblem: z.boolean().optional(),
    readAloud: z.boolean().optional(),
    // Insurance for open question 2.10 — nothing in this swarm reads or writes it yet.
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  })
  .strict();

export type Template = z.infer<typeof templateSchema>;

// --- skillSchema (AC-10) ---------------------------------------------------------------------

export const skillSchema = z
  .object({
    id: z.enum(SKILL_IDS),
    displayName: z.string(),
    minGrade: gradeSchema,
    maxGrade: gradeSchema,
    symbolicOnly: z.boolean(),
  })
  .strict()
  .superRefine((skill, ctx) => {
    if (skill.maxGrade < skill.minGrade) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxGrade'],
        message: 'maxGrade must be >= minGrade',
      });
    }
  });

export type Skill = z.infer<typeof skillSchema>;

// --- cannonSchema (AC-7, AC-8, AC-9, AC-12) --------------------------------------------------

const cannonUnlockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('starter') }).strict(),
  z
    .object({
      kind: z.literal('range'),
      island: z.enum(ISLAND_IDS),
      tier: z.number().int().min(1),
    })
    .strict(),
  z.object({ kind: z.literal('chest') }).strict(),
]);

export const cannonSchema = z
  .object({
    id: z.enum(CANNON_IDS),
    displayName: z.string(),
    skill: z.enum(SKILL_IDS),
    damageMin: z.number().int().positive(),
    damageMax: z.number().int().positive(),
    temperament: z.enum(TEMPERAMENTS),
    recoilDamage: z.number().int().min(0),
    timerMs: z.number().int().positive(),
    minGrade: gradeSchema,
    maxGrade: gradeSchema,
    unlock: cannonUnlockSchema,
  })
  .strict()
  .superRefine((cannon, ctx) => {
    if (cannon.damageMax < cannon.damageMin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['damageMax'],
        message: 'damageMax must be >= damageMin',
      });
    }
    if (cannon.temperament === 'reliable' && cannon.recoilDamage !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recoilDamage'],
        message: 'a reliable cannon must carry zero recoil damage',
      });
    }
  });

export type Cannon = z.infer<typeof cannonSchema>;

// --- islandSchema (AC-11) ---------------------------------------------------------------------

export const islandSchema = z
  .object({
    id: z.enum(ISLAND_IDS),
    displayName: z.string(),
    order: z.number().int().min(0),
    rangeSkills: z.array(z.enum(SKILL_IDS)),
    unlocksCannons: z.array(z.enum(CANNON_IDS)),
    requiresIsland: z.enum(ISLAND_IDS).optional(),
  })
  .strict();

export type Island = z.infer<typeof islandSchema>;

// --- rankSchema (AC-11) -----------------------------------------------------------------------

export const rankSchema = z
  .object({
    id: z.enum(RANK_IDS),
    displayName: z.string(),
    tier: z.number().int().min(0),
    minWins: z.number().int().min(0),
  })
  .strict();

export type Rank = z.infer<typeof rankSchema>;

// --- crewSchema (AC-18) -----------------------------------------------------------------------

export const crewSchema = z
  .object({
    id: z.string(),
    displayName: z.string(),
    role: z.string(),
  })
  .strict();

export type Crew = z.infer<typeof crewSchema>;
