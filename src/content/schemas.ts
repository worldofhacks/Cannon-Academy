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
  // The K-1 rung of Isla Products' grouping concept. Appended rather than filed beside the other
  // addition skills because SKILL_IDS is read as an ordered transcription by
  // `__tests__/content/schemas.test.ts`, and because `skills.json` order decides Rank-screen row
  // order — a late entry joins the existing `+` group instead of opening a new row.
  'repeated_addition',
  // D-14 / A-069 — the four skills that fill the honest gaps in the per-band curriculum atlas.
  // Appended in ticket order for the same ordered-transcription reason as `repeated_addition`.
  'sub_within_10', // K.OA.2 / 1.OA.6 — subtraction within 10, non-negative answers
  'place_value_teens', // 1.NBT.2 / 1.NBT.3 — teens as ten-and-ones, no symbol beyond +
  'multi_digit_mult', // 4.NBT.5 — 2–3-digit × 1-digit, and tens × tens
  'long_division', // 4.NBT.6 / 5.NBT.6 — 2–3-digit ÷ 1-digit, exact quotients
] as const;
export type SkillId = (typeof SKILL_IDS)[number];

export const CANNON_IDS = [
  'swivel_gun',
  'culverin',
  'saker', // T-029 / D-7 — invented range payoff for add_within_10 (not in PLAN armory table)
  'six_pounder',
  'chain_shot',
  'nine_pounder',
  'twelve_pounder',
  'mortar',
  'double_broadside',
  'powder_keg',
  'long_nine',
  // Isla Products' K-1 range payoff, on `repeated_addition`. Appended so the catalog order every
  // tray and rival loadout renders in is unchanged for the guns that were already there.
  'grapeshot',
  // D-14 / A-069 — one entry cannon per new skill, each a range unlock at its atlas island.
  'dinghy_gun', // sub_within_10, g0 — Isla Products' K-1 entry gun
  'teen_lantern', // place_value_teens, g1 — the Grandline's K-1 entry gun
  'carronade', // multi_digit_mult, g4 — Isla Products' G4-5 entry gun
  'stern_chaser', // long_division, g4 — Quotient Cove's G4-5 entry gun
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

export const ENEMY_PRESENTATION_KINDS = ['pirate', 'skeleton', 'ghost', 'shark', 'kraken'] as const;
export type EnemyPresentationKind = (typeof ENEMY_PRESENTATION_KINDS)[number];

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

// --- islandSchema (AC-11, reshaped by D-14 / A-069) ---------------------------------------------

/**
 * D-14: one band's view of one island — its display name, the skills it teaches that band (in
 * teaching order; the first is the island's headline, glyph source, and entry-cannon skill), and
 * the cannons it pays that band. Both lists are non-empty: an island with nothing to teach or
 * nothing to pay a band is an authoring error, not a valid cell.
 */
export const islandBandCurriculumSchema = z
  .object({
    displayName: z.string(),
    skills: z.array(z.enum(SKILL_IDS)).min(1),
    unlocksCannons: z.array(z.enum(CANNON_IDS)).min(1),
  })
  .strict();

export type IslandBandCurriculum = z.infer<typeof islandBandCurriculumSchema>;

/**
 * D-14 — five islands for every band, each band its own curriculum. Geometry and chain fields
 * (`id`, `order`, `requiresIsland`) stay band-neutral; everything TAUGHT lives under
 * `curriculum`, one complete cell per grade band. Deliberately, no shared `displayName` /
 * `rangeSkills` / `unlocksCannons` remain at the top level: a leftover shared field would let a
 * call site silently keep the old one-curriculum world instead of going through
 * `islandCurriculumFor` (content/index.ts), the single accessor A-070 migrates consumers onto.
 */
export const islandSchema = z
  .object({
    id: z.enum(ISLAND_IDS),
    order: z.number().int().min(0),
    curriculum: z
      .object({
        k_1: islandBandCurriculumSchema,
        g2_3: islandBandCurriculumSchema,
        g4_5: islandBandCurriculumSchema,
      })
      .strict(),
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

// --- enemySchema (A-031) ----------------------------------------------------------------------

export const enemySchema = z
  .object({
    id: z.string(),
    islandId: z.enum(ISLAND_IDS),
    displayName: z.string(),
    faction: z.string(),
    presentationKind: z.enum(ENEMY_PRESENTATION_KINDS),
    accessibilityLabel: z.string(),
  })
  .strict();

export type Enemy = z.infer<typeof enemySchema>;
