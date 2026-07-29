/**
 * T-016 — grade 3–5 question templates: `div_facts`, `fractions_int`, `multi_digit_order_ops`.
 *
 * Content files under `src/content/templates/` are the deliverable (implementer-authored). This
 * suite is the frozen contract: schema shape, id hygiene, exact-division sampling, integer-only
 * fraction answers with no decimal glyphs, order-of-ops variety, the ARCHITECTURE.md §9.1 golden
 * sweep, ladder headroom, and hand-pinned spot checks.
 *
 * AC-12 pins hand-computed `(seed → text, answer)` literals for every required template id.
 * `REQUIRED_TEMPLATES` is the authoring contract that produces those literals — copy it into
 * the three skill files (one array per skill).
 *
 * Traceability: every test name cites a T-016 spec or dod tag that spec-lint can parse.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { templateSchema } from '@content/schemas';
import type { SkillId, Template } from '@content/schemas';
import { describeDistractorSources } from '@engine/questions/distractors';
import { ExprError, evaluateNumber, evaluatePredicate } from '@engine/questions/expr';
import { generateQuestion } from '@engine/questions/generator';
import { QuestionGenerationError } from '@engine/questions/types';
import { createRng } from '@engine/rng';

// =============================================================================================
// Paths & skill table
// =============================================================================================

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const TEMPLATES_DIR = fileURLToPath(new URL('../../../src/content/templates/', import.meta.url));
const OWN_SOURCE = readFileSync(fileURLToPath(new URL(import.meta.url)), 'utf8');
const TICKET_SOURCE = readFileSync(`${REPO_ROOT}tickets/T-016.md`, 'utf8');

const SKILLS = ['div_facts', 'fractions_int', 'multi_digit_order_ops'] as const;
type G35Skill = (typeof SKILLS)[number];

const SKILL_FILE: Record<G35Skill, string> = {
  div_facts: 'div_facts.json',
  fractions_int: 'fractions_int.json',
  multi_digit_order_ops: 'multi_digit_order_ops.json',
};

const SWEEP_SEEDS = 1000;
const HEADROOM_SEEDS = 200;
const LADDER_CEILING = 250;
const DISPLAY_BOUND = 1000;
const WORD_PROBLEM_MAX_CHARS = 160;

/** Alphabetic tokens permitted on symbolic (non-word-problem) templates in this band. */
const SYMBOLIC_UNIT_WORDS = new Set(['of', 'whole', 'wholes', 'ones', 'tens', 'hundreds', 'thousands']);

const PARAM_TOKEN = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const NUMERIC_TOKEN = /\d+/g;
const ALPHA_WORD = /[A-Za-z]+/g;
const IDENT = '[A-Za-z_][A-Za-z0-9_]*';

function nearMiss(answerExpr: string): readonly [string, string, string] {
  return [`(${answerExpr}) + 1`, `(${answerExpr}) - 1`, `(${answerExpr}) + 2`];
}

// =============================================================================================
// Authoring contract — REQUIRED_TEMPLATES + literal SPOT_CHECKS (AC-12)
// =============================================================================================

/**
 * Eight templates per skill (≥5 distinct skeletons), covering ticket Context shapes:
 * exact-division, integer-answerable fractions, no-paren / parenthesised precedence, and
 * multi-digit forms. Spot-check literals below were derived from these shapes via `createRng`
 * + rejection sampling — not by reading `answerExpr` back through an evaluator in the AC-12 test.
 */
const REQUIRED_TEMPLATES: readonly Template[] = [
  // ---- div_facts ----------------------------------------------------------------------------
  {
    id: 'div_facts_basic',
    skill: 'div_facts',
    text: '{a} ÷ {b} = ?',
    params: { a: [1, 100], b: [2, 10] },
    constraints: ['b != 0', 'a % b == 0'],
    answerExpr: 'a / b',
    distractors: [...nearMiss('a / b')],
  },
  {
    id: 'div_facts_missing_divisor',
    skill: 'div_facts',
    text: '{a} ÷ ? = {c}',
    params: { a: [1, 100], c: [1, 10] },
    constraints: ['c != 0', 'a % c == 0'],
    answerExpr: 'a / c',
    distractors: [...nearMiss('a / c')],
  },
  {
    id: 'div_facts_missing_dividend',
    skill: 'div_facts',
    text: '? ÷ {b} = {c}',
    params: { b: [2, 10], c: [1, 10] },
    constraints: ['b != 0'],
    answerExpr: 'b * c',
    distractors: [...nearMiss('b * c')],
  },
  {
    id: 'div_facts_same',
    skill: 'div_facts',
    text: '{a} ÷ {a} = ?',
    params: { a: [1, 20] },
    constraints: ['a != 0', 'a % a == 0'],
    answerExpr: 'a / a',
    // Answer is always 1; param `a` as a distractor is usually implausible (magnitude).
    distractors: ['0', '2', '3'],
  },
  {
    id: 'div_facts_quotient_first',
    skill: 'div_facts',
    text: '? = {a} ÷ {b}',
    params: { a: [1, 100], b: [2, 10] },
    constraints: ['b != 0', 'a % b == 0'],
    answerExpr: 'a / b',
    distractors: [...nearMiss('a / b')],
  },
  {
    id: 'div_facts_fact_family',
    skill: 'div_facts',
    text: '{b} × ? = {a}',
    params: { a: [2, 100], b: [2, 10] },
    constraints: ['b != 0', 'a % b == 0'],
    answerExpr: 'a / b',
    distractors: [...nearMiss('a / b')],
  },
  {
    id: 'div_facts_groups',
    skill: 'div_facts',
    text: 'How many groups of {b} make {a}?',
    params: { a: [1, 100], b: [2, 10] },
    constraints: ['b != 0', 'a % b == 0'],
    answerExpr: 'a / b',
    distractors: [...nearMiss('a / b')],
    isWordProblem: true,
  },
  {
    id: 'div_facts_divide_tens',
    skill: 'div_facts',
    text: '{a} ÷ {b} = ?',
    params: { a: [10, 100], b: [2, 5] },
    constraints: ['b != 0', 'a % b == 0', 'a >= 10'],
    answerExpr: 'a / b',
    distractors: [...nearMiss('a / b')],
  },
  // ---- fractions_int ------------------------------------------------------------------------
  {
    id: 'fractions_int_how_many_ths',
    skill: 'fractions_int',
    text: 'How many {d}ths make {n} wholes?',
    params: { d: [2, 10], n: [1, 10] },
    constraints: ['d != 0'],
    answerExpr: 'n * d',
    distractors: [...nearMiss('n * d')],
    isWordProblem: true,
  },
  {
    id: 'fractions_int_missing_numerator',
    skill: 'fractions_int',
    text: '{a}/{b} = ?/{d}',
    params: { a: [1, 10], b: [1, 10], d: [1, 20] },
    constraints: ['b != 0', 'd % b == 0'],
    answerExpr: 'a * (d / b)',
    distractors: [...nearMiss('a * (d / b)')],
  },
  {
    id: 'fractions_int_of_set',
    skill: 'fractions_int',
    text: '{a}/{b} of {c} = ?',
    params: { a: [1, 10], b: [1, 10], c: [1, 100] },
    constraints: ['b != 0', 'c % b == 0'],
    answerExpr: 'c / b * a',
    distractors: [...nearMiss('c / b * a')],
  },
  {
    id: 'fractions_int_add_like',
    skill: 'fractions_int',
    text: '{a}/{b} + {c}/{b} = ? wholes',
    params: { a: [1, 20], b: [2, 10], c: [1, 20] },
    constraints: ['b != 0', '(a + c) % b == 0'],
    answerExpr: '(a + c) / b',
    distractors: [...nearMiss('(a + c) / b')],
  },
  {
    id: 'fractions_int_simplify',
    skill: 'fractions_int',
    text: '{a}/{b} = ?',
    params: { a: [1, 100], b: [2, 10] },
    constraints: ['b != 0', 'a % b == 0'],
    answerExpr: 'a / b',
    distractors: [...nearMiss('a / b')],
  },
  {
    id: 'fractions_int_of_set_rev',
    skill: 'fractions_int',
    text: '? = {a}/{b} of {c}',
    params: { a: [1, 10], b: [1, 10], c: [1, 100] },
    constraints: ['b != 0', 'c % b == 0'],
    answerExpr: 'c / b * a',
    distractors: [...nearMiss('c / b * a')],
  },
  {
    id: 'fractions_int_unit_parts',
    skill: 'fractions_int',
    text: 'How many {d}ths make 1 whole?',
    params: { d: [2, 12] },
    constraints: ['d != 0'],
    answerExpr: 'd',
    distractors: [...nearMiss('d')],
    isWordProblem: true,
  },
  {
    id: 'fractions_int_add_like_qfirst',
    skill: 'fractions_int',
    text: '? wholes = {a}/{b} + {c}/{b}',
    params: { a: [1, 20], b: [2, 10], c: [1, 20] },
    constraints: ['b != 0', '(a + c) % b == 0'],
    answerExpr: '(a + c) / b',
    distractors: [...nearMiss('(a + c) / b')],
  },
  // ---- multi_digit_order_ops ----------------------------------------------------------------
  {
    id: 'multi_digit_order_ops_no_paren',
    skill: 'multi_digit_order_ops',
    text: '{a} + {b} × {c} = ?',
    params: { a: [1, 12], b: [2, 12], c: [2, 6] },
    // c>=2 keeps wrong-order ≠ answer; b>=a keeps (a+b)*c inside the plausibility band.
    constraints: ['a + b * c <= 1000', 'b >= a'],
    answerExpr: 'a + b * c',
    distractors: ['(a + b) * c', 'b * c', '(a + b * c) + 2'],
  },
  {
    id: 'multi_digit_order_ops_paren',
    skill: 'multi_digit_order_ops',
    text: '({a} + {b}) × {c} = ?',
    params: { a: [1, 15], b: [1, 15], c: [2, 4] },
    constraints: ['(a + b) * c <= 1000'],
    answerExpr: '(a + b) * c',
    distractors: ['a + b * c', '((a + b) * c) + 1', '((a + b) * c) - 1'],
  },
  {
    id: 'multi_digit_order_ops_add',
    skill: 'multi_digit_order_ops',
    text: '{a} + {b} = ?',
    params: { a: [10, 500], b: [10, 500] },
    constraints: ['a + b <= 1000'],
    answerExpr: 'a + b',
    distractors: [...nearMiss('a + b')],
  },
  {
    id: 'multi_digit_order_ops_sub',
    skill: 'multi_digit_order_ops',
    text: '{a} - {b} = ?',
    params: { a: [10, 999], b: [1, 500] },
    constraints: ['a >= b', 'a - b <= 1000'],
    answerExpr: 'a - b',
    distractors: [...nearMiss('a - b')],
  },
  {
    id: 'multi_digit_order_ops_two_by_one',
    skill: 'multi_digit_order_ops',
    text: '{a} × {b} = ?',
    params: { a: [10, 99], b: [2, 9] },
    constraints: ['a * b <= 1000'],
    answerExpr: 'a * b',
    distractors: [...nearMiss('a * b')],
  },
  {
    id: 'multi_digit_order_ops_times_minus',
    skill: 'multi_digit_order_ops',
    text: '{a} × {b} - {c} = ?',
    params: { a: [2, 20], b: [2, 20], c: [1, 50] },
    constraints: ['a * b >= c', 'a * b - c <= 1000'],
    answerExpr: 'a * b - c',
    // a*(b-c) is often negative under a*b>=c → implausible; use forgot-subtract instead.
    distractors: ['a * b', '(a * b - c) + 1', '(a * b - c) - 1'],
  },
  {
    id: 'multi_digit_order_ops_word_sum',
    skill: 'multi_digit_order_ops',
    text: 'What is {a} plus {b}?',
    params: { a: [10, 400], b: [10, 400] },
    constraints: ['a + b <= 1000'],
    answerExpr: 'a + b',
    distractors: [...nearMiss('a + b')],
    isWordProblem: true,
  },
  {
    id: 'multi_digit_order_ops_diff_first',
    skill: 'multi_digit_order_ops',
    text: '? = {a} - {b}',
    params: { a: [10, 999], b: [1, 500] },
    constraints: ['a >= b'],
    answerExpr: 'a - b',
    distractors: [...nearMiss('a - b')],
  },
].map((raw) => templateSchema.parse(raw));

/**
 * AC-12 hand-computed spot checks. Literals are independent of `evaluateNumber` / any
 * in-test re-implementation of `answerExpr` — they were derived from REQUIRED_TEMPLATES
 * ranges, constraints, and mulberry32 draws at the listed seed.
 */
const SPOT_CHECKS: readonly {
  readonly id: string;
  readonly seed: number;
  readonly text: string;
  readonly answer: number;
}[] = [
  { id: 'div_facts_basic', seed: 1, text: '20 ÷ 2 = ?', answer: 10 },
  { id: 'div_facts_missing_divisor', seed: 1, text: '100 ÷ ? = 5', answer: 20 },
  { id: 'div_facts_missing_dividend', seed: 1, text: '? ÷ 2 = 6', answer: 12 },
  { id: 'div_facts_same', seed: 1, text: '1 ÷ 1 = ?', answer: 1 },
  { id: 'div_facts_quotient_first', seed: 1, text: '? = 20 ÷ 2', answer: 10 },
  { id: 'div_facts_fact_family', seed: 1, text: '2 × ? = 20', answer: 10 },
  { id: 'div_facts_groups', seed: 1, text: 'How many groups of 2 make 20?', answer: 10 },
  { id: 'div_facts_divide_tens', seed: 1, text: '75 ÷ 3 = ?', answer: 25 },
  { id: 'fractions_int_how_many_ths', seed: 1, text: 'How many 2ths make 6 wholes?', answer: 12 },
  { id: 'fractions_int_missing_numerator', seed: 1, text: '8/5 = ?/20', answer: 32 },
  { id: 'fractions_int_of_set', seed: 1, text: '8/5 of 100 = ?', answer: 160 },
  { id: 'fractions_int_add_like', seed: 1, text: '15/5 + 20/5 = ? wholes', answer: 7 },
  { id: 'fractions_int_simplify', seed: 1, text: '20/2 = ?', answer: 10 },
  { id: 'fractions_int_of_set_rev', seed: 1, text: '? = 8/5 of 100', answer: 160 },
  { id: 'fractions_int_unit_parts', seed: 1, text: 'How many 2ths make 1 whole?', answer: 2 },
  { id: 'fractions_int_add_like_qfirst', seed: 1, text: '? wholes = 15/5 + 20/5', answer: 7 },
  { id: 'multi_digit_order_ops_no_paren', seed: 1, text: '1 + 7 × 6 = ?', answer: 43 },
  { id: 'multi_digit_order_ops_paren', seed: 1, text: '(1 + 8) × 4 = ?', answer: 36 },
  { id: 'multi_digit_order_ops_add', seed: 1, text: '11 + 268 = ?', answer: 279 },
  { id: 'multi_digit_order_ops_sub', seed: 1, text: '981 - 485 = ?', answer: 496 },
  { id: 'multi_digit_order_ops_two_by_one', seed: 1, text: '10 × 6 = ?', answer: 60 },
  { id: 'multi_digit_order_ops_times_minus', seed: 1, text: '20 × 7 - 31 = ?', answer: 109 },
  { id: 'multi_digit_order_ops_word_sum', seed: 1, text: 'What is 11 plus 216?', answer: 227 },
  { id: 'multi_digit_order_ops_diff_first', seed: 1, text: '? = 981 - 485', answer: 496 },
];

// =============================================================================================
// Loading — fail on missing content, never on path setup
// =============================================================================================

function skillPath(skill: G35Skill): string {
  return `${TEMPLATES_DIR}${SKILL_FILE[skill]}`;
}

function loadSkill(skill: G35Skill): Template[] {
  const path = skillPath(skill);
  expect(existsSync(path), `${SKILL_FILE[skill]} is missing from src/content/templates/`).toBe(true);
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const parsed = z.array(templateSchema).safeParse(raw);
  expect(
    parsed.success,
    `${SKILL_FILE[skill]} must parse as z.array(templateSchema): ${parsed.success ? '' : parsed.error.message}`,
  ).toBe(true);
  return parsed.data!;
}

function loadAll(): Record<G35Skill, Template[]> {
  return {
    div_facts: loadSkill('div_facts'),
    fractions_int: loadSkill('fractions_int'),
    multi_digit_order_ops: loadSkill('multi_digit_order_ops'),
  };
}

function loadAllTemplates(): Template[] {
  return SKILLS.flatMap((skill) => loadSkill(skill));
}

function allTemplates(
  bySkill: Record<G35Skill, Template[]>,
): readonly { skill: G35Skill; template: Template }[] {
  return SKILLS.flatMap((skill) => bySkill[skill].map((template) => ({ skill, template })));
}

function skeletonOf(text: string): string {
  return text.replace(PARAM_TOKEN, '#');
}

function paramIsLive(template: Template, name: string): boolean {
  if (template.text.includes(`{${name}}`)) return true;
  const word = new RegExp(`\\b${name}\\b`);
  if (word.test(template.answerExpr)) return true;
  return (template.constraints ?? []).some((constraint) => word.test(constraint));
}

function generateOne(template: Template, seed: number) {
  return generateQuestion({
    templates: [template],
    recentTemplateIds: [],
    rng: createRng(seed),
  });
}

function alphabeticWordsInTemplateText(text: string): string[] {
  const withoutTokens = text.replace(PARAM_TOKEN, ' ');
  return withoutTokens.match(ALPHA_WORD) ?? [];
}

function isNoParenPlusTimes(text: string): boolean {
  if (text.includes('(') || text.includes(')')) return false;
  const plus = text.indexOf('+');
  const times = text.indexOf('×');
  return plus >= 0 && times >= 0 && plus < times;
}

function isParenAdditionTimes(text: string): boolean {
  return /\([^)]*\+[^)]*\)/.test(text) && text.includes('×');
}

function compactExpr(expr: string): string {
  return expr.replace(/\s+/g, '');
}

function isWrongOrderDistractor(answerExpr: string, distractor: string): boolean {
  const answer = compactExpr(answerExpr);
  const decoy = compactExpr(distractor);
  if (/^[a-zA-Z_][a-zA-Z0-9_]*\+[a-zA-Z_][a-zA-Z0-9_]*\*[a-zA-Z_][a-zA-Z0-9_]*$/.test(answer)) {
    return /^\([a-zA-Z_][a-zA-Z0-9_]*\+[a-zA-Z_][a-zA-Z0-9_]*\)\*[a-zA-Z_][a-zA-Z0-9_]*$/.test(decoy);
  }
  if (/^[a-zA-Z_][a-zA-Z0-9_]*\*[a-zA-Z_][a-zA-Z0-9_]*\+[a-zA-Z_][a-zA-Z0-9_]*$/.test(answer)) {
    return /^\([a-zA-Z_][a-zA-Z0-9_]*\*[a-zA-Z_][a-zA-Z0-9_]*\+[a-zA-Z_][a-zA-Z0-9_]*\)$/.test(decoy);
  }
  return false;
}

interface DivPair {
  readonly dividend: string;
  readonly divisor: string;
}

/** `dividend / divisor` identifier pairs in an answerExpr. */
function divisionPairsInAnswerExpr(answerExpr: string): readonly DivPair[] {
  const pairs: DivPair[] = [];
  const re = new RegExp(`\\b(${IDENT})\\s*/\\s*(${IDENT})\\b`, 'g');
  for (const match of answerExpr.matchAll(re)) {
    pairs.push({ dividend: match[1]!, divisor: match[2]! });
  }
  return pairs;
}

/** `{a} ÷ {b}` pairs in template text (both operands present as params). */
function divisionPairsInText(text: string): readonly DivPair[] {
  const pairs: DivPair[] = [];
  const re = /\{([A-Za-z_][A-Za-z0-9_]*)\}\s*÷\s*\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  for (const match of text.matchAll(re)) {
    pairs.push({ dividend: match[1]!, divisor: match[2]! });
  }
  return pairs;
}

function hasExactDivisibilityConstraint(
  constraints: readonly string[],
  dividend: string,
  divisor: string,
): boolean {
  const re = new RegExp(`\\b${dividend}\\s*%\\s*${divisor}\\s*==\\s*0\\b`);
  return constraints.some((constraint) => re.test(constraint));
}

function hasNonZeroDivisorConstraint(constraints: readonly string[], divisor: string): boolean {
  const ne = new RegExp(`\\b${divisor}\\s*!=\\s*0\\b`);
  const gt = new RegExp(`\\b${divisor}\\s*>\\s*0\\b`);
  return constraints.some((constraint) => ne.test(constraint) || gt.test(constraint));
}

/** Structural exact-division authoring rule for every `/` or `{a}÷{b}` pair. */
function assertDeclaredDivConstraints(template: Template): void {
  const constraints = template.constraints ?? [];
  const seen = new Map<string, DivPair>();
  for (const pair of [
    ...divisionPairsInAnswerExpr(template.answerExpr),
    ...divisionPairsInText(template.text),
  ]) {
    seen.set(`${pair.dividend}/${pair.divisor}`, pair);
  }

  if (template.answerExpr.includes('/')) {
    const answerPairs = divisionPairsInAnswerExpr(template.answerExpr);
    expect(
      answerPairs.length,
      `${template.id}: answerExpr uses / but has no ident/ident division pair to constrain`,
    ).toBeGreaterThan(0);
  }

  for (const pair of seen.values()) {
    expect(
      hasExactDivisibilityConstraint(constraints, pair.dividend, pair.divisor),
      `${template.id}: must declare "${pair.dividend} % ${pair.divisor} == 0" (exact division)`,
    ).toBe(true);
    expect(
      hasNonZeroDivisorConstraint(constraints, pair.divisor),
      `${template.id}: must declare "${pair.divisor} != 0" or "${pair.divisor} > 0"`,
    ).toBe(true);
  }
}

function repoText(relative: string): string {
  return readFileSync(`${REPO_ROOT}${relative}`, 'utf8');
}

// =============================================================================================
// Authoring-contract preflight (does not need JSON files)
// =============================================================================================

// Property-suite timeout: heavy seeded sweeps exceed Vitest's 5s default when
// multiple worktrees run the suite concurrently (timeouts only — not assertion failures).

describe(
  'authoring contract preflight — REQUIRED_TEMPLATES ↔ SPOT_CHECKS ↔ generator',
  { timeout: 60000 },
  () => {
    it('every SPOT_CHECK literal matches generateQuestion on the required template at that seed', () => {
      for (const check of SPOT_CHECKS) {
        const template = REQUIRED_TEMPLATES.find((row) => row.id === check.id);
        expect(template, check.id).toBeDefined();
        if (template === undefined) continue;
        const [question] = generateOne(template, check.seed);
        expect(question.text, check.id).toBe(check.text);
        expect(question.choices[question.correctIndex]?.value, check.id).toBe(check.answer);
      }
    });

    it('required div_facts templates declare structural exact-divisibility constraints', () => {
      for (const template of REQUIRED_TEMPLATES.filter((row) => row.skill === 'div_facts')) {
        assertDeclaredDivConstraints(template);
      }
    });

    it('required templates survive seeds 1…200 without CONSTRAINTS_UNSATISFIED', () => {
      const failures: string[] = [];
      for (const template of REQUIRED_TEMPLATES) {
        for (let seed = 1; seed <= HEADROOM_SEEDS; seed += 1) {
          try {
            generateOne(template, seed);
          } catch (error) {
            const detail =
              error instanceof QuestionGenerationError
                ? `${error.code}: ${error.message}`
                : error instanceof Error
                  ? error.message
                  : String(error);
            failures.push(`${template.id}@${seed}: ${detail}`);
            break;
          }
        }
      }
      expect(failures, failures.join('\n')).toEqual([]);
    });

    it('spec(T-016:AC-11) REQUIRED_TEMPLATES preflight: ladder fills on fewer than 250 of 1000 samples per template', () => {
      // Freezes the authoring contract against the AC-11 collision class before JSON is copied
      // (same failure mode as T-014 near_doubles / this ticket's div_facts_same & order-ops rows).
      const failures: string[] = [];
      const rates: Record<string, number> = {};

      for (const template of REQUIRED_TEMPLATES) {
        let ladderHits = 0;
        for (let seed = 1; seed <= SWEEP_SEEDS; seed += 1) {
          const [question] = generateOne(template, seed);
          const sources = describeDistractorSources(template, question.params);
          if (sources.includes('ladder')) {
            ladderHits += 1;
          }
        }
        rates[template.id] = ladderHits;
        if (ladderHits >= LADDER_CEILING) {
          failures.push(`${template.id}: ladder ${ladderHits}/1000`);
        }
      }

      expect(failures, `ladder rates: ${JSON.stringify(rates)}\n${failures.join('\n')}`).toEqual([]);
    });
  },
);

// =============================================================================================
// AC-1 — schema parse + ≥8 per skill + authoring contract
// =============================================================================================

describe('AC-1 — each skill file parses and holds at least 8 templates', { timeout: 60000 }, () => {
  it.each(SKILLS)('spec(T-016:AC-1) %s.json parses via z.array(templateSchema) with length >= 8', (skill) => {
    const templates = loadSkill(skill);
    expect(templates.length, `${skill} needs ≥8 templates`).toBeGreaterThanOrEqual(8);
  });

  it('spec(T-016:AC-1) loaded content includes every REQUIRED_TEMPLATES row verbatim', () => {
    const byId = new Map(loadAllTemplates().map((template) => [template.id, template]));
    for (const required of REQUIRED_TEMPLATES) {
      expect(byId.get(required.id), `missing required template id '${required.id}'`).toEqual(required);
    }
  });
});

// =============================================================================================
// AC-2 — skill field, id prefix, global uniqueness
// =============================================================================================

describe('AC-2 — skill ownership, id prefix, pairwise-unique ids', { timeout: 60000 }, () => {
  it('spec(T-016:AC-2) every template.skill matches its file and every id is prefixed and unique', () => {
    const bySkill = loadAll();
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const skill of SKILLS) {
      for (const template of bySkill[skill]) {
        expect(template.skill, `${template.id} skill field`).toBe(skill as SkillId);
        expect(template.id.startsWith(`${skill}_`), `${template.id} must start with ${skill}_`).toBe(true);
        if (seen.has(template.id)) duplicates.push(template.id);
        seen.add(template.id);
      }
    }

    expect(duplicates, 'ids must be pairwise unique across the three files').toEqual([]);
  });
});

// =============================================================================================
// AC-3 — param / text hygiene (no dead params, no unknown tokens)
// =============================================================================================

describe('AC-3 — every {token} is a declared param; every param is live', { timeout: 60000 }, () => {
  it('spec(T-016:AC-3) text tokens and params are bi-consistent', () => {
    const problems: string[] = [];

    for (const { template } of allTemplates(loadAll())) {
      for (const match of template.text.matchAll(PARAM_TOKEN)) {
        const name = match[1]!;
        if (!(name in template.params)) {
          problems.push(`${template.id}: text token {${name}} is not in params`);
        }
      }
      for (const name of Object.keys(template.params)) {
        if (!paramIsLive(template, name)) {
          problems.push(`${template.id}: dead param "${name}"`);
        }
      }
    }

    expect(problems).toEqual([]);
  });
});

// =============================================================================================
// AC-4 — 1,000-seed golden sweep
// =============================================================================================

describe('AC-4 — 1,000-seed generateQuestion sweep per template', { timeout: 60000 }, () => {
  it('spec(T-016:AC-4) every seed succeeds with in-range params, true constraints, rendered text, 4 distinct choices, correct answer', () => {
    const failures: string[] = [];

    for (const { template } of allTemplates(loadAll())) {
      for (let seed = 1; seed <= SWEEP_SEEDS; seed += 1) {
        try {
          const [question] = generateOne(template, seed);
          const { params } = question;

          for (const [name, range] of Object.entries(template.params)) {
            const value = params[name];
            if (value === undefined || value < range[0] || value > range[1]) {
              failures.push(
                `${template.id}@${seed}: param ${name}=${String(value)} outside [${range[0]}, ${range[1]}]`,
              );
            }
          }

          for (const constraint of template.constraints ?? []) {
            if (!evaluatePredicate(constraint, params)) {
              failures.push(`${template.id}@${seed}: constraint failed: ${constraint}`);
            }
          }

          if (question.text.includes('{') || question.text.includes('}')) {
            failures.push(`${template.id}@${seed}: braces remain in "${question.text}"`);
          }

          if (question.choices.length !== 4) {
            failures.push(`${template.id}@${seed}: choices.length=${question.choices.length}`);
          }

          const values = question.choices.map((choice) => choice.value);
          if (new Set(values).size !== values.length) {
            failures.push(`${template.id}@${seed}: duplicate choices ${values.join(',')}`);
          }

          const correct = question.choices[question.correctIndex]?.value;
          const expected = evaluateNumber(template.answerExpr, params);
          if (correct !== expected) {
            failures.push(`${template.id}@${seed}: correct=${String(correct)} expected=${expected}`);
          }
        } catch (error) {
          const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
          failures.push(`${template.id}@${seed}: threw ${detail}`);
        }
      }
    }

    expect(failures.slice(0, 20), `${failures.length} sweep failure(s)`).toEqual([]);
  });
});

// =============================================================================================
// AC-5 — div_facts exact division / no DIVISION_BY_ZERO + structural constraints
// =============================================================================================

describe('AC-5 — div_facts never divides by zero and always yields an integer', { timeout: 60000 }, () => {
  it('spec(T-016:AC-5) every div_facts template declares exact-divisibility and non-zero-divisor constraints', () => {
    for (const template of loadSkill('div_facts')) {
      assertDeclaredDivConstraints(template);
    }
  });

  it('spec(T-016:AC-5) 1,000 samples per div_facts template: no DIVISION_BY_ZERO, integer answers', () => {
    const failures: string[] = [];

    for (const template of loadSkill('div_facts')) {
      for (let seed = 1; seed <= SWEEP_SEEDS; seed += 1) {
        try {
          const [question] = generateOne(template, seed);
          const answer = question.choices[question.correctIndex]!.value;
          if (!Number.isInteger(answer)) {
            failures.push(`${template.id}@${seed}: non-integer answer ${answer}`);
          }
        } catch (error) {
          const cause = error instanceof QuestionGenerationError ? error.cause : undefined;
          if (cause instanceof ExprError && cause.code === 'DIVISION_BY_ZERO') {
            failures.push(`${template.id}@${seed}: DIVISION_BY_ZERO`);
          } else if (error instanceof ExprError && error.code === 'DIVISION_BY_ZERO') {
            failures.push(`${template.id}@${seed}: DIVISION_BY_ZERO`);
          } else {
            const detail = error instanceof Error ? error.message : String(error);
            failures.push(`${template.id}@${seed}: ${detail}`);
          }
        }
      }
    }

    expect(failures.slice(0, 20), `${failures.length} div_facts failure(s)`).toEqual([]);
  });
});

// =============================================================================================
// AC-6 — display bound ≤ 1000; fractions_int answers are integers
// =============================================================================================

describe('AC-6 — non-negative integers ≤ 1000 (answers and numeric text tokens)', { timeout: 60000 }, () => {
  it('spec(T-016:AC-6) every answer and every numeric token in rendered text is a non-negative integer ≤ 1000', () => {
    const failures: string[] = [];

    for (const { skill, template } of allTemplates(loadAll())) {
      for (let seed = 1; seed <= SWEEP_SEEDS; seed += 1) {
        const [question] = generateOne(template, seed);
        const answer = question.choices[question.correctIndex]!.value;

        if (!Number.isInteger(answer) || answer < 0 || answer > DISPLAY_BOUND) {
          failures.push(`${template.id}@${seed}: answer ${answer} outside 0..${DISPLAY_BOUND}`);
        }
        if (skill === 'fractions_int' && !Number.isInteger(answer)) {
          failures.push(`${template.id}@${seed}: fractions_int answer not integer`);
        }

        for (const token of question.text.match(NUMERIC_TOKEN) ?? []) {
          const value = Number(token);
          if (!Number.isInteger(value) || value < 0 || value > DISPLAY_BOUND) {
            failures.push(`${template.id}@${seed}: text token ${token} outside bounds`);
          }
        }
      }
    }

    expect(failures.slice(0, 20), `${failures.length} bound failure(s)`).toEqual([]);
  });
});

// =============================================================================================
// AC-7 — fractions_int: no decimal point in text or choice labels
// =============================================================================================

describe('AC-7 — fractions_int never shows a decimal point', { timeout: 60000 }, () => {
  it('spec(T-016:AC-7) no rendered text and no choice label contains "."', () => {
    const failures: string[] = [];

    for (const template of loadSkill('fractions_int')) {
      for (let seed = 1; seed <= SWEEP_SEEDS; seed += 1) {
        const [question] = generateOne(template, seed);
        if (question.text.includes('.')) {
          failures.push(`${template.id}@${seed}: text has decimal: "${question.text}"`);
        }
        for (const choice of question.choices) {
          if (choice.label.includes('.')) {
            failures.push(`${template.id}@${seed}: label has decimal: "${choice.label}"`);
          }
        }
      }
    }

    expect(failures.slice(0, 20), `${failures.length} decimal failure(s)`).toEqual([]);
  });
});

// =============================================================================================
// AC-8 — order-of-ops variety (no-paren vs parenthesised addition)
// =============================================================================================

describe('AC-8 — multi_digit_order_ops precedence pair with distinct answers', { timeout: 60000 }, () => {
  it('spec(T-016:AC-8) has +× without parens and (+)× form; same a,b,c yield different answers', () => {
    const templates = loadSkill('multi_digit_order_ops');
    const noParen = templates.find((template) => isNoParenPlusTimes(template.text));
    const withParen = templates.find((template) => isParenAdditionTimes(template.text));

    expect(noParen, 'need a template with + then × and no parentheses').toBeDefined();
    expect(withParen, 'need a template that parenthesises the addition before ×').toBeDefined();

    const [noParenQuestion] = generateOne(noParen!, 1);
    const { a, b, c } = noParenQuestion.params;
    expect(a, 'no-paren template must sample a').toBeTypeOf('number');
    expect(b, 'no-paren template must sample b').toBeTypeOf('number');
    expect(c, 'no-paren template must sample c').toBeTypeOf('number');

    const shared = { a: a!, b: b!, c: c! };
    const answerNoParen = evaluateNumber(noParen!.answerExpr, shared);
    const answerWithParen = evaluateNumber(withParen!.answerExpr, shared);

    expect(
      answerNoParen,
      `same a,b,c=${JSON.stringify(shared)} must disagree: no-paren=${answerNoParen} paren=${answerWithParen}`,
    ).not.toBe(answerWithParen);
  });
});

// =============================================================================================
// AC-9 — declared wrong-order distractor on a no-paren precedence template
// =============================================================================================

describe('AC-9 — wrong-order result is a declared distractor', { timeout: 60000 }, () => {
  it('spec(T-016:AC-9) at least one no-paren precedence template declares an (a+b)*c-style distractor', () => {
    const templates = loadSkill('multi_digit_order_ops');
    const candidates = templates.filter((template) => isNoParenPlusTimes(template.text));
    expect(candidates.length, 'need at least one no-paren +× template').toBeGreaterThan(0);

    const withWrongOrder = candidates.find((template) =>
      template.distractors.some((distractor) => isWrongOrderDistractor(template.answerExpr, distractor)),
    );

    expect(
      withWrongOrder,
      'a no-paren precedence template must declare a wrong-order distractor like "(a + b) * c"',
    ).toBeDefined();
  });
});

// =============================================================================================
// AC-10 — word-problem flagging and readability
// =============================================================================================

describe('AC-10 — word problems flagged, ≤160 chars, end with ?', { timeout: 60000 }, () => {
  it('spec(T-016:AC-10) isWordProblem templates stay short and end with ?; prose shapes are flagged', () => {
    const failures: string[] = [];

    for (const { template } of allTemplates(loadAll())) {
      const words = alphabeticWordsInTemplateText(template.text);
      const proseWords = words.filter((word) => !SYMBOLIC_UNIT_WORDS.has(word.toLowerCase()));
      if (proseWords.length > 0 && template.isWordProblem !== true) {
        failures.push(`${template.id}: prose words [${proseWords.join(', ')}] require isWordProblem: true`);
      }

      if (template.isWordProblem === true) {
        for (let seed = 1; seed <= SWEEP_SEEDS; seed += 1) {
          const [question] = generateOne(template, seed);
          if (question.text.length > WORD_PROBLEM_MAX_CHARS) {
            failures.push(
              `${template.id}@${seed}: length ${question.text.length} > ${WORD_PROBLEM_MAX_CHARS}`,
            );
          }
          if (!question.text.endsWith('?')) {
            failures.push(`${template.id}@${seed}: does not end with ?: "${question.text}"`);
          }
        }
      }
    }

    expect(failures.slice(0, 20), `${failures.length} word-problem failure(s)`).toEqual([]);
  });
});

// =============================================================================================
// AC-11 — ladder source < 250 / 1000
// =============================================================================================

describe('AC-11 — declared distractors rarely fall through to the ladder', { timeout: 60000 }, () => {
  it('spec(T-016:AC-11) ladder-sourced samples are fewer than 250 of 1000 per template', () => {
    const failures: string[] = [];

    for (const { template } of allTemplates(loadAll())) {
      let ladderSamples = 0;
      for (let seed = 1; seed <= SWEEP_SEEDS; seed += 1) {
        const [question] = generateOne(template, seed);
        const sources = describeDistractorSources(template, question.params);
        if (sources.includes('ladder')) ladderSamples += 1;
      }
      if (ladderSamples >= LADDER_CEILING) {
        failures.push(`${template.id}: ladder samples ${ladderSamples} >= ${LADDER_CEILING}`);
      }
    }

    expect(failures, 'ladder headroom').toEqual([]);
  });
});

// =============================================================================================
// AC-12 — hand-computed spot checks (literals, not derived from answerExpr)
// =============================================================================================

describe(
  'AC-12 — hand-computed spot checks pin arithmetic independently of the evaluator',
  { timeout: 60000 },
  () => {
    it('spec(T-016:AC-12) every required template has a literal spot check, and every loaded id is covered', () => {
      const loadedIds = loadAllTemplates()
        .map((template) => template.id)
        .sort();
      const checkIds = SPOT_CHECKS.map((check) => check.id).sort();
      const requiredIds = REQUIRED_TEMPLATES.map((template) => template.id).sort();

      expect(checkIds).toEqual(requiredIds);
      for (const id of requiredIds) {
        expect(loadedIds, `missing required id ${id}`).toContain(id);
      }
      for (const id of loadedIds) {
        expect(checkIds, `loaded template ${id} needs a SPOT_CHECK row`).toContain(id);
      }
    });

    it.each([...SPOT_CHECKS])(
      'spec(T-016:AC-12) $id at seed $seed renders "$text" with answer $answer',
      ({ id, seed, text, answer }) => {
        const template = loadAllTemplates().find((row) => row.id === id);
        expect(template, `spot-check target '${id}' missing from content`).toBeDefined();
        if (template === undefined) return;

        const [question] = generateOne(template, seed);
        expect(question.text).toBe(text);
        expect(question.choices[question.correctIndex]?.value).toBe(answer);
      },
    );
  },
);

// =============================================================================================
// AC-13 — ≥5 distinct text skeletons per skill
// =============================================================================================

describe('AC-13 — shape variety: ≥5 distinct skeletons per skill', { timeout: 60000 }, () => {
  it.each(SKILLS)('spec(T-016:AC-13) %s has at least 5 distinct text skeletons', (skill) => {
    const skeletons = new Set(loadSkill(skill).map((template) => skeletonOf(template.text)));
    expect(skeletons.size, `${skill} skeletons: ${[...skeletons].join(' | ')}`).toBeGreaterThanOrEqual(5);
  });
});

// =============================================================================================
// AC-14 — sampling headroom (seeds 1..200, no CONSTRAINTS_UNSATISFIED)
// =============================================================================================

describe('AC-14 — constraints sample inside MAX_PARAM_SAMPLE_ATTEMPTS', { timeout: 60000 }, () => {
  it('spec(T-016:AC-14) seeds 1..200 never raise CONSTRAINTS_UNSATISFIED', () => {
    const failures: string[] = [];

    for (const { template } of allTemplates(loadAll())) {
      for (let seed = 1; seed <= HEADROOM_SEEDS; seed += 1) {
        try {
          generateOne(template, seed);
        } catch (error) {
          if (error instanceof QuestionGenerationError && error.code === 'CONSTRAINTS_UNSATISFIED') {
            failures.push(`${template.id}@${seed}: CONSTRAINTS_UNSATISFIED`);
          } else {
            const detail = error instanceof Error ? error.message : String(error);
            failures.push(`${template.id}@${seed}: ${detail}`);
          }
        }
      }
    }

    expect(failures.slice(0, 20), `${failures.length} headroom failure(s)`).toEqual([]);
  });
});

// =============================================================================================
// AC-15 — ≥3 distractors, none equal to answerExpr or a sibling
// =============================================================================================

describe('AC-15 — declared distractor hygiene', { timeout: 60000 }, () => {
  it('spec(T-016:AC-15) every template declares ≥3 distractors, unique and distinct from answerExpr', () => {
    const failures: string[] = [];

    for (const { template } of allTemplates(loadAll())) {
      if (template.distractors.length < 3) {
        failures.push(`${template.id}: only ${template.distractors.length} distractors`);
      }
      const seen = new Set<string>();
      for (const distractor of template.distractors) {
        if (distractor === template.answerExpr) {
          failures.push(`${template.id}: distractor equals answerExpr ("${distractor}")`);
        }
        if (seen.has(distractor)) {
          failures.push(`${template.id}: duplicate distractor "${distractor}"`);
        }
        seen.add(distractor);
      }
    }

    expect(failures).toEqual([]);
  });
});

// =============================================================================================
// Definition of Done
// =============================================================================================

const DEFERRED_WORK_MARKERS = [['TO', 'DO'].join(''), ['FIX', 'ME'].join(''), ['HA', 'CK'].join('')];
const FOCUSED_TEST_PATTERN = new RegExp(
  ['\\b(it|test|describe)\\.(', 'sk', 'ip|on', 'ly)\\b|\\b', 'x', '(it|describe)\\b'].join(''),
);

describe('T-016 Definition of Done', { timeout: 60000 }, () => {
  it('dod(T-016:1) tags a test against every acceptance criterion the ticket declares', () => {
    const declared = [...TICKET_SOURCE.matchAll(/\*\*(AC-\d+)\*\*/g)].map((match) => match[1]);
    const unique = [...new Set(declared)];
    const untagged = unique.filter((ac) => !OWN_SOURCE.includes(`spec(T-016:${ac})`));

    expect(unique.length).toBeGreaterThan(0);
    expect(untagged, 'every declared AC needs at least one tagged test').toEqual([]);
  });

  it('dod(T-016:2) keeps every local gate wired up, and adds no marker or focused test', () => {
    const gates = repoText('.tdd-swarm/run-local-gates.sh');
    for (const command of ['prettier --check', 'eslint . --max-warnings 0', 'tsc --noEmit', 'vitest run']) {
      expect(gates, `run-local-gates.sh must still run: ${command}`).toContain(command);
    }
    for (const marker of DEFERRED_WORK_MARKERS) {
      expect(OWN_SOURCE.includes(marker), `this file must contain no ${marker} marker`).toBe(false);
    }
    expect(FOCUSED_TEST_PATTERN.test(OWN_SOURCE), 'this file must contain no focused or skipped test').toBe(
      false,
    );
  });

  it('dod(T-016:3) numbers every dod tag so spec-lint can parse coverage of all seven items', () => {
    const dodCount = (TICKET_SOURCE.match(/^- \[[ x]\] /gm) ?? []).length;
    const tagged = [...OWN_SOURCE.matchAll(/dod\(T-016:([^)]*)\)/g)].map((match) => match[1] ?? '');
    const unparseable = tagged.filter((id) => !/^\d+$/.test(id));
    const covered = new Set(tagged.filter((id) => /^\d+$/.test(id)).map(Number));
    const missing = Array.from({ length: dodCount }, (_, i) => i + 1).filter((n) => !covered.has(n));

    expect(dodCount).toBe(7);
    expect(unparseable).toEqual([]);
    expect(missing).toEqual([]);
    expect(OWN_SOURCE).toContain('spec(T-016:AC-');
  });

  it('dod(T-016:4) each skill file holds ≥8 templates with ≥5 distinct skeletons', () => {
    for (const skill of SKILLS) {
      const templates = loadSkill(skill);
      const skeletons = new Set(templates.map((template) => skeletonOf(template.text)));
      expect(templates.length, `${skill} template floor`).toBeGreaterThanOrEqual(8);
      expect(skeletons.size, `${skill} skeleton floor`).toBeGreaterThanOrEqual(5);
    }
  });

  it('dod(T-016:5) every fractions_int answer is a whole number and no decimal point appears', () => {
    for (const check of SPOT_CHECKS.filter((row) => row.id.startsWith('fractions_int_'))) {
      const template = loadSkill('fractions_int').find((row) => row.id === check.id);
      expect(template, check.id).toBeDefined();
      if (template === undefined) continue;
      const [question] = generateOne(template, check.seed);
      const answer = question.choices[question.correctIndex]!.value;
      expect(Number.isInteger(answer), `${template.id} answer`).toBe(true);
      expect(answer).toBe(check.answer);
      expect(question.text.includes('.'), `${template.id} text`).toBe(false);
      for (const choice of question.choices) {
        expect(choice.label.includes('.'), `${template.id} label`).toBe(false);
      }
    }
  });

  it('dod(T-016:6) every div_facts template constrains exact divisibility and a non-zero divisor', () => {
    for (const template of loadSkill('div_facts')) {
      assertDeclaredDivConstraints(template);

      for (let seed = 1; seed <= 50; seed += 1) {
        const [question] = generateOne(template, seed);
        const answer = question.choices[question.correctIndex]!.value;
        expect(Number.isInteger(answer), `${template.id}@${seed}`).toBe(true);
      }
    }
  });

  it('dod(T-016:7) stays inside file_scopes — three skill JSON files, no templates/index.ts', () => {
    // Nearest unit-visible reading of the file_scopes claim: this ticket owns these three
    // skill files; sibling tickets (T-014/T-015) share `templates/`. The registry is T-019.
    expect(existsSync(`${TEMPLATES_DIR}index.ts`), 'do not create templates/index.ts').toBe(false);
    for (const skill of SKILLS) {
      expect(existsSync(skillPath(skill)), `${SKILL_FILE[skill]} is in file_scopes`).toBe(true);
      expect(SKILL_FILE[skill].endsWith('.json')).toBe(true);
    }
    expect(Object.values(SKILL_FILE).sort()).toEqual([
      'div_facts.json',
      'fractions_int.json',
      'multi_digit_order_ops.json',
    ]);
  });
});
