/**
 * T-015 — grade 2–3 question templates: `place_value_compare`, `two_step_add_sub`, `mult_facts`.
 *
 * Deliverable is hand-authored JSON under `src/content/templates/`. These tests are the
 * content contract: schema validity, id hygiene, word-problem gating, param/text consistency,
 * shape variety, curriculum bounds, the two-step non-negative intermediate guard, multiplication
 * factor/`×` rules, distractor hygiene, sampling headroom, and the ARCHITECTURE.md §9.1 golden
 * sweep.
 *
 * JSON files do not exist yet. Load via `readFileSync` + `JSON.parse`. Do **not** create
 * `templates/index.ts` (T-019).
 *
 * AC-11 pins hand-computed `(seed → text, answer)` literals for every required template id.
 * `REQUIRED_TEMPLATES` is the authoring contract that produces those literals — copy each
 * skill's slice into the matching JSON file.
 *
 * Traceability: every behavioural test cites a T-015 spec or dod tag that spec-lint can parse.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { getSkill } from '@content/index';
import { templateSchema } from '@content/schemas';
import type { SkillId, Template } from '@content/schemas';
import { describeDistractorSources } from '@engine/questions/distractors';
import { evaluateNumber, evaluatePredicate } from '@engine/questions/expr';
import { generateQuestion } from '@engine/questions/generator';
import { QuestionGenerationError } from '@engine/questions/types';
import { createRng } from '@engine/rng';

// =============================================================================================
// Paths & skill table
// =============================================================================================

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const TEMPLATES_DIR = fileURLToPath(new URL('../../../src/content/templates/', import.meta.url));
const OWN_SOURCE = readFileSync(fileURLToPath(new URL(import.meta.url)), 'utf8');
const TICKET_SOURCE = readFileSync(`${REPO_ROOT}tickets/T-015.md`, 'utf8');

const SKILLS = ['place_value_compare', 'two_step_add_sub', 'mult_facts'] as const;
type G23Skill = (typeof SKILLS)[number];

const SKILL_FILE: Record<G23Skill, string> = {
  place_value_compare: 'place_value_compare.json',
  two_step_add_sub: 'two_step_add_sub.json',
  mult_facts: 'mult_facts.json',
};

const DISPLAY_BOUND: Record<G23Skill, number> = {
  place_value_compare: 1000,
  two_step_add_sub: 100,
  mult_facts: 100,
};

const SWEEP_SEEDS = 1000;
const HEADROOM_SEEDS = 200;
const LADDER_CEILING = 250;
const WORD_PROBLEM_MAX_CHARS = 140;
const FACTOR_MAX = 10;

const PARAM_TOKEN = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const NUMERIC_TOKEN = /\d+/g;
const ALPHA_WORD = /[A-Za-z]+/g;

/**
 * Alphabetic tokens permitted on symbolic (non-word-problem) templates — comparison /
 * place-value operator vocabulary named by ticket Context shapes ("Which is greater…",
 * "`{a}` rounded to the nearest ten", "`{a}` is ? more than `{b}`").
 */
const SYMBOLIC_OPERATOR_WORDS = new Set([
  'which',
  'is',
  'greater',
  'less',
  'or',
  'more',
  'than',
  'rounded',
  'to',
  'the',
  'nearest',
  'ten',
]);

function nearMiss(answerExpr: string): readonly [string, string, string] {
  return [`(${answerExpr}) + 1`, `(${answerExpr}) - 1`, `(${answerExpr}) + 2`];
}

/**
 * Authoring contract for the three JSON files. Eight templates per skill, ≥5 distinct
 * skeletons each, word/symbolic mix, ranges wide enough for AC-13, distractors engineered
 * for AC-10. Spot-check literals below were hand-computed from these shapes via `createRng`
 * + pool-`pick` + rejection sampling — not by reading a generated question back as the
 * expected value.
 */
const REQUIRED_TEMPLATES: readonly Template[] = [
  // ---- place_value_compare ------------------------------------------------------------------
  {
    id: 'place_value_compare_tens_value',
    skill: 'place_value_compare',
    text: 'What is the value of the tens digit in {a}?',
    params: { a: [10, 999] },
    constraints: ['a >= 10', 'floor(a / 10) % 10 >= 1'],
    answerExpr: '(floor(a / 10) % 10) * 10',
    distractors: [...nearMiss('(floor(a / 10) % 10) * 10')],
    isWordProblem: true,
  },
  {
    id: 'place_value_compare_round_ten',
    skill: 'place_value_compare',
    text: '{a} rounded to the nearest ten = ?',
    params: { a: [15, 990] },
    constraints: ['a % 10 != 0', 'floor((a + 5) / 10) * 10 >= 10'],
    answerExpr: 'floor((a + 5) / 10) * 10',
    distractors: [...nearMiss('floor((a + 5) / 10) * 10')],
    isWordProblem: false,
  },
  {
    id: 'place_value_compare_how_many_tens',
    skill: 'place_value_compare',
    text: 'How many tens are in {a}?',
    params: { a: [10, 1000] },
    constraints: ['a >= 10'],
    answerExpr: 'floor(a / 10)',
    distractors: [...nearMiss('floor(a / 10)')],
    isWordProblem: true,
  },
  {
    id: 'place_value_compare_which_greater',
    skill: 'place_value_compare',
    text: 'Which is greater, {a} or {b}?',
    params: { a: [1, 1000], b: [1, 1000] },
    constraints: ['a != b', 'max(a, b) >= 1'],
    answerExpr: 'max(a, b)',
    distractors: [...nearMiss('max(a, b)')],
    isWordProblem: false,
  },
  {
    id: 'place_value_compare_how_much_more',
    skill: 'place_value_compare',
    text: '{a} is ? more than {b}',
    params: { a: [1, 1000], b: [0, 999] },
    constraints: ['a > b'],
    answerExpr: 'a - b',
    distractors: [...nearMiss('a - b')],
    isWordProblem: false,
  },
  {
    id: 'place_value_compare_ones_digit',
    skill: 'place_value_compare',
    text: 'What is the ones digit in {a}?',
    params: { a: [0, 1000] },
    constraints: ['a % 10 >= 1', 'a % 10 <= 8'],
    answerExpr: 'a % 10',
    distractors: [...nearMiss('a % 10')],
    isWordProblem: true,
  },
  {
    id: 'place_value_compare_hundreds_value',
    skill: 'place_value_compare',
    text: 'What is the value of the hundreds digit in {a}?',
    params: { a: [100, 999] },
    constraints: ['a >= 100'],
    answerExpr: 'floor(a / 100) * 100',
    distractors: [...nearMiss('floor(a / 100) * 100')],
    isWordProblem: true,
  },
  {
    id: 'place_value_compare_ships_more',
    skill: 'place_value_compare',
    text: 'A ship has {a} balls and a fort has {b}. How many more on the ship?',
    params: { a: [1, 1000], b: [0, 999] },
    constraints: ['a > b'],
    answerExpr: 'a - b',
    distractors: [...nearMiss('a - b')],
    isWordProblem: true,
  },
  // ---- two_step_add_sub ---------------------------------------------------------------------
  {
    id: 'two_step_add_sub_plus_minus',
    skill: 'two_step_add_sub',
    text: '{a} + {b} - {c} = ?',
    params: { a: [1, 50], b: [1, 50], c: [1, 50] },
    constraints: ['a + b <= 100', 'a + b - c >= 1', 'a + b - c <= 100'],
    answerExpr: 'a + b - c',
    distractors: [...nearMiss('a + b - c')],
  },
  {
    id: 'two_step_add_sub_minus_plus',
    skill: 'two_step_add_sub',
    text: '{a} - {b} + {c} = ?',
    params: { a: [1, 100], b: [1, 50], c: [1, 50] },
    constraints: ['a >= b', 'a - b + c <= 100', 'a - b + c >= 1'],
    answerExpr: 'a - b + c',
    distractors: [...nearMiss('a - b + c')],
  },
  {
    id: 'two_step_add_sub_plus_plus',
    skill: 'two_step_add_sub',
    text: '{a} + {b} + {c} = ?',
    params: { a: [1, 40], b: [1, 40], c: [1, 40] },
    constraints: ['a + b + c <= 100', 'a + b <= 100'],
    answerExpr: 'a + b + c',
    distractors: [...nearMiss('a + b + c')],
  },
  {
    id: 'two_step_add_sub_paren_minus',
    skill: 'two_step_add_sub',
    text: '({a} + {b}) - {c} = ?',
    params: { a: [1, 50], b: [1, 50], c: [1, 50] },
    constraints: ['a + b <= 100', 'a + b > c'],
    answerExpr: '(a + b) - c',
    distractors: [...nearMiss('(a + b) - c')],
  },
  {
    id: 'two_step_add_sub_missing_last',
    skill: 'two_step_add_sub',
    text: '{a} + {b} - ? = {c}',
    params: { a: [1, 50], b: [1, 50], c: [1, 50] },
    constraints: ['a + b <= 100', 'a + b > c'],
    answerExpr: 'a + b - c',
    distractors: [...nearMiss('a + b - c')],
  },
  {
    id: 'two_step_add_sub_word_hold',
    skill: 'two_step_add_sub',
    text: 'A hold has {a} then gains {b} and loses {c}. How many left?',
    params: { a: [1, 50], b: [1, 50], c: [1, 50] },
    constraints: ['a + b <= 100', 'a + b > c'],
    answerExpr: 'a + b - c',
    distractors: [...nearMiss('a + b - c')],
    isWordProblem: true,
  },
  {
    id: 'two_step_add_sub_diff_then_sub',
    skill: 'two_step_add_sub',
    text: '{a} - {b} - {c} = ?',
    params: { a: [10, 100], b: [1, 40], c: [1, 40] },
    constraints: ['a >= b', 'a - b >= c', 'a - b - c >= 1'],
    answerExpr: 'a - b - c',
    distractors: [...nearMiss('a - b - c')],
  },
  {
    id: 'two_step_add_sub_start_missing',
    skill: 'two_step_add_sub',
    text: '? + {b} - {c} = {d}',
    params: { b: [1, 40], c: [1, 40], d: [1, 60] },
    constraints: ['d + c - b >= 1', 'd + c <= 100'],
    answerExpr: 'd + c - b',
    distractors: [...nearMiss('d + c - b')],
  },
  // ---- mult_facts ---------------------------------------------------------------------------
  {
    id: 'mult_facts_basic',
    skill: 'mult_facts',
    text: '{a} × {b} = ?',
    params: { a: [2, 10], b: [2, 10] },
    constraints: ['a * b <= 100'],
    answerExpr: 'a * b',
    distractors: [...nearMiss('a * b')],
  },
  {
    id: 'mult_facts_missing_factor',
    skill: 'mult_facts',
    text: '{a} × ? = {c}',
    params: { a: [2, 10], c: [4, 100] },
    constraints: ['c % a == 0', 'c / a >= 2', 'c / a <= 10'],
    answerExpr: 'c / a',
    distractors: [...nearMiss('c / a')],
  },
  {
    id: 'mult_facts_missing_first',
    skill: 'mult_facts',
    text: '? × {b} = {c}',
    params: { b: [2, 10], c: [4, 100] },
    constraints: ['c % b == 0', 'c / b >= 2', 'c / b <= 10'],
    answerExpr: 'c / b',
    distractors: [...nearMiss('c / b')],
  },
  {
    id: 'mult_facts_doubling',
    skill: 'mult_facts',
    text: '{a} × 2 = ?',
    params: { a: [2, 10] },
    answerExpr: 'a * 2',
    distractors: [...nearMiss('a * 2')],
  },
  {
    id: 'mult_facts_times_ten',
    skill: 'mult_facts',
    text: '{a} × 10 = ?',
    params: { a: [1, 10] },
    answerExpr: 'a * 10',
    distractors: [...nearMiss('a * 10')],
  },
  {
    id: 'mult_facts_array_word',
    skill: 'mult_facts',
    text: '{a} crates × {b} balls each. How many balls?',
    params: { a: [2, 10], b: [2, 10] },
    constraints: ['a * b <= 100'],
    answerExpr: 'a * b',
    distractors: [...nearMiss('a * b')],
    isWordProblem: true,
  },
  {
    id: 'mult_facts_groups_word',
    skill: 'mult_facts',
    text: '{a} rows × {b} guns. How many guns on deck?',
    params: { a: [2, 10], b: [2, 10] },
    constraints: ['a * b <= 100'],
    answerExpr: 'a * b',
    distractors: [...nearMiss('a * b')],
    isWordProblem: true,
  },
  {
    id: 'mult_facts_commute',
    skill: 'mult_facts',
    text: '{b} × {a} = ?',
    params: { a: [2, 10], b: [2, 10] },
    constraints: ['a * b <= 100'],
    answerExpr: 'a * b',
    distractors: [...nearMiss('a * b')],
  },
].map((raw) => templateSchema.parse(raw));

/**
 * AC-11 hand-computed spot checks. Literals are independent of `evaluateNumber` / the
 * generator's render path — they were derived from the REQUIRED_TEMPLATES ranges, constraints,
 * and mulberry32 draws (including the pool-`pick` consume) at the listed seed.
 */
const SPOT_CHECKS: readonly {
  readonly id: string;
  readonly seed: number;
  readonly text: string;
  readonly answer: number;
}[] = [
  {
    id: 'place_value_compare_tens_value',
    seed: 1,
    text: 'What is the value of the tens digit in 12?',
    answer: 10,
  },
  { id: 'place_value_compare_round_ten', seed: 1, text: '17 rounded to the nearest ten = ?', answer: 20 },
  { id: 'place_value_compare_how_many_tens', seed: 1, text: 'How many tens are in 12?', answer: 1 },
  { id: 'place_value_compare_which_greater', seed: 1, text: 'Which is greater, 3 or 528?', answer: 528 },
  { id: 'place_value_compare_how_much_more', seed: 1, text: '982 is ? more than 968', answer: 14 },
  { id: 'place_value_compare_ones_digit', seed: 1, text: 'What is the ones digit in 2?', answer: 2 },
  {
    id: 'place_value_compare_hundreds_value',
    seed: 1,
    text: 'What is the value of the hundreds digit in 102?',
    answer: 100,
  },
  {
    id: 'place_value_compare_ships_more',
    seed: 1,
    text: 'A ship has 982 balls and a fort has 968. How many more on the ship?',
    answer: 14,
  },
  { id: 'two_step_add_sub_plus_minus', seed: 1, text: '49 + 15 - 31 = ?', answer: 33 },
  { id: 'two_step_add_sub_minus_plus', seed: 1, text: '46 - 25 + 7 = ?', answer: 28 },
  { id: 'two_step_add_sub_plus_plus', seed: 1, text: '1 + 22 + 40 = ?', answer: 63 },
  { id: 'two_step_add_sub_paren_minus', seed: 1, text: '(49 + 15) - 31 = ?', answer: 33 },
  { id: 'two_step_add_sub_missing_last', seed: 1, text: '49 + 15 - ? = 31', answer: 33 },
  {
    id: 'two_step_add_sub_word_hold',
    seed: 1,
    text: 'A hold has 49 then gains 15 and loses 31. How many left?',
    answer: 33,
  },
  { id: 'two_step_add_sub_diff_then_sub', seed: 1, text: '98 - 12 - 25 = ?', answer: 61 },
  { id: 'two_step_add_sub_start_missing', seed: 1, text: '? + 1 - 22 = 59', answer: 80 },
  { id: 'mult_facts_basic', seed: 1, text: '2 × 6 = ?', answer: 12 },
  { id: 'mult_facts_missing_factor', seed: 1, text: '9 × ? = 27', answer: 3 },
  { id: 'mult_facts_missing_first', seed: 1, text: '? × 9 = 27', answer: 3 },
  { id: 'mult_facts_doubling', seed: 1, text: '2 × 2 = ?', answer: 4 },
  { id: 'mult_facts_times_ten', seed: 1, text: '1 × 10 = ?', answer: 10 },
  { id: 'mult_facts_array_word', seed: 1, text: '2 crates × 6 balls each. How many balls?', answer: 12 },
  { id: 'mult_facts_groups_word', seed: 1, text: '2 rows × 6 guns. How many guns on deck?', answer: 12 },
  { id: 'mult_facts_commute', seed: 1, text: '6 × 2 = ?', answer: 12 },
];

// =============================================================================================
// Loading — fail on missing content, never on path setup
// =============================================================================================

function skillPath(skill: G23Skill): string {
  return `${TEMPLATES_DIR}${SKILL_FILE[skill]}`;
}

function loadSkill(skill: G23Skill): Template[] {
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

function loadAll(): Record<G23Skill, Template[]> {
  return {
    place_value_compare: loadSkill('place_value_compare'),
    two_step_add_sub: loadSkill('two_step_add_sub'),
    mult_facts: loadSkill('mult_facts'),
  };
}

function loadAllTemplates(): Template[] {
  return SKILLS.flatMap((skill) => loadSkill(skill));
}

function allTemplates(
  bySkill: Record<G23Skill, Template[]>,
): readonly { skill: G23Skill; template: Template }[] {
  return SKILLS.flatMap((skill) => bySkill[skill].map((template) => ({ skill, template })));
}

function skeletonOf(text: string): string {
  return text.replace(PARAM_TOKEN, '#');
}

function referencedNames(template: Template): Set<string> {
  const names = new Set<string>();
  for (const match of template.text.matchAll(PARAM_TOKEN)) {
    names.add(match[1]!);
  }
  return names;
}

function paramIsLive(template: Template, name: string): boolean {
  if (template.text.includes(`{${name}}`)) return true;
  const boundary = new RegExp(`\\b${name}\\b`);
  if (boundary.test(template.answerExpr)) return true;
  return (template.constraints ?? []).some((constraint) => boundary.test(constraint));
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

function repoText(relative: string): string {
  return readFileSync(`${REPO_ROOT}${relative}`, 'utf8');
}

/**
 * Intermediate after the first top-level left-associative `+` / `-` in `answerExpr`.
 * For `a + b - c` → `a + b`; for `(a + b) - c` → `a + b`.
 */
function firstAddSubIntermediate(answerExpr: string, params: Readonly<Record<string, number>>): number {
  const s = answerExpr.trim();
  let depth = 0;
  let splitAt = -1;
  let splitOp: '+' | '-' | null = null;

  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]!;
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (depth === 0 && (ch === '+' || ch === '-')) {
      const prev = s.slice(0, i).trimEnd();
      const prevCh = prev[prev.length - 1];
      const unary =
        prev.length === 0 ||
        prevCh === '(' ||
        prevCh === '+' ||
        prevCh === '-' ||
        prevCh === '*' ||
        prevCh === '/' ||
        prevCh === '%';
      if (!unary) {
        splitAt = i;
        splitOp = ch;
        break;
      }
    }
  }

  if (splitAt < 0 || splitOp === null) {
    return evaluateNumber(answerExpr, params);
  }

  const left = evaluateNumber(s.slice(0, splitAt), params);
  let rhsEnd = s.length;
  depth = 0;
  for (let i = splitAt + 1; i < s.length; i += 1) {
    const ch = s[i]!;
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (depth === 0 && (ch === '+' || ch === '-')) {
      const prev = s.slice(splitAt + 1, i).trimEnd();
      const prevCh = prev[prev.length - 1];
      const unary =
        prev.length === 0 ||
        prevCh === '(' ||
        prevCh === '+' ||
        prevCh === '-' ||
        prevCh === '*' ||
        prevCh === '/' ||
        prevCh === '%';
      if (!unary) {
        rhsEnd = i;
        break;
      }
    }
  }
  const right = evaluateNumber(s.slice(splitAt + 1, rhsEnd), params);
  return splitOp === '+' ? left + right : left - right;
}

function factorValues(
  template: Template,
  renderedText: string,
  params: Readonly<Record<string, number>>,
): number[] {
  const factors: number[] = [];

  for (const match of renderedText.matchAll(/(\d+)\s*×\s*(\d+)/g)) {
    factors.push(Number(match[1]), Number(match[2]));
  }
  for (const match of renderedText.matchAll(/(\d+)\s*×\s*\?/g)) {
    factors.push(Number(match[1]));
  }
  for (const match of renderedText.matchAll(/\?\s*×\s*(\d+)/g)) {
    factors.push(Number(match[1]));
  }

  const compact = template.answerExpr.replace(/\s+/g, '');
  for (const match of compact.matchAll(
    /([A-Za-z_][A-Za-z0-9_]*)\*([A-Za-z_][A-Za-z0-9_]*|\d+)|\d+\*([A-Za-z_][A-Za-z0-9_]*)/g,
  )) {
    for (const group of [match[1], match[2], match[3]]) {
      if (group === undefined) continue;
      if (/^\d+$/.test(group)) factors.push(Number(group));
      else {
        const value = params[group];
        if (value !== undefined) factors.push(value);
      }
    }
  }

  return factors;
}

function usesLowercaseXAsOperator(text: string): boolean {
  return /\d\s*x\s*[\d?]|[\d?]\s*x\s*\d/.test(text);
}

// =============================================================================================
// Authoring-contract preflight (does not need JSON files)
// =============================================================================================

describe('authoring contract preflight — REQUIRED_TEMPLATES ↔ SPOT_CHECKS ↔ generator', () => {
  it('every SPOT_CHECK literal matches generateQuestion on the required template at that seed', () => {
    for (const check of SPOT_CHECKS) {
      const template = REQUIRED_TEMPLATES.find((t) => t.id === check.id);
      expect(template, check.id).toBeDefined();
      if (template === undefined) continue;
      const [question] = generateOne(template, check.seed);
      expect(question.text, check.id).toBe(check.text);
      expect(question.choices[question.correctIndex]?.value, check.id).toBe(check.answer);
    }
  });

  it('required templates survive seeds 1…200 without CONSTRAINTS_UNSATISFIED', () => {
    for (const template of REQUIRED_TEMPLATES) {
      for (let seed = 1; seed <= HEADROOM_SEEDS; seed += 1) {
        expect(() => generateOne(template, seed)).not.toThrow();
      }
    }
  });

  it('spec(T-015:AC-10) REQUIRED_TEMPLATES preflight: ladder fills on fewer than 250 of 1000 samples', () => {
    const failures: string[] = [];
    const rates: Record<string, number> = {};

    for (const template of REQUIRED_TEMPLATES) {
      let ladderHits = 0;
      for (let seed = 1; seed <= SWEEP_SEEDS; seed += 1) {
        const [question] = generateOne(template, seed);
        const sources = describeDistractorSources(template, question.params);
        if (sources.includes('ladder')) ladderHits += 1;
      }
      rates[template.id] = ladderHits;
      if (ladderHits >= LADDER_CEILING) {
        failures.push(`${template.id}: ladder ${ladderHits}/1000`);
      }
    }

    expect(failures, `ladder rates: ${JSON.stringify(rates)}\n${failures.join('\n')}`).toEqual([]);
  });
});

// =============================================================================================
// AC-1 — schema parse + ≥8 per skill + authoring contract
// =============================================================================================

describe('AC-1 — each skill file parses and holds at least 8 templates', () => {
  it.each(SKILLS)('spec(T-015:AC-1) %s.json parses via z.array(templateSchema) with length >= 8', (skill) => {
    const templates = loadSkill(skill);
    expect(templates.length, `${skill} needs ≥8 templates`).toBeGreaterThanOrEqual(8);
  });

  it('spec(T-015:AC-1) the three files together match the required authoring contract', () => {
    const loaded = loadAllTemplates();
    const byId = new Map(loaded.map((t) => [t.id, t]));
    expect(loaded).toHaveLength(REQUIRED_TEMPLATES.length);
    expect(new Set(loaded.map((t) => t.id)).size).toBe(REQUIRED_TEMPLATES.length);

    for (const required of REQUIRED_TEMPLATES) {
      const actual = byId.get(required.id);
      expect(actual, `missing required template id '${required.id}'`).toEqual(required);
    }
  });
});

// =============================================================================================
// AC-2 — skill field, id prefix, global uniqueness
// =============================================================================================

describe('AC-2 — skill ownership, id prefix, pairwise-unique ids', () => {
  it('spec(T-015:AC-2) every template.skill matches its file and every id is prefixed and unique', () => {
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
// AC-3 — word-problem flag ↔ alphabetic prose (minus operator allowlist); catalog symbolicOnly
// =============================================================================================

describe('AC-3 — word-problem flag matches alphabetic prose; catalog allows word problems', () => {
  it('spec(T-015:AC-3) prose beyond operator words requires isWordProblem; word problems require symbolicOnly === false', () => {
    const failures: string[] = [];

    for (const { skill, template } of allTemplates(loadAll())) {
      const words = alphabeticWordsInTemplateText(template.text);
      const proseWords = words.filter((word) => !SYMBOLIC_OPERATOR_WORDS.has(word.toLowerCase()));
      if (proseWords.length > 0 && template.isWordProblem !== true) {
        failures.push(`${template.id}: prose words [${proseWords.join(', ')}] require isWordProblem: true`);
      }

      if (template.isWordProblem === true) {
        const catalogSkill = getSkill(skill);
        if (catalogSkill.symbolicOnly !== false) {
          failures.push(
            `${template.id}: isWordProblem true but ${skill}.symbolicOnly is ${String(catalogSkill.symbolicOnly)}`,
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });
});

// =============================================================================================
// AC-4 — param / text hygiene
// =============================================================================================

describe('AC-4 — every {token} is a declared param; every param is live', () => {
  it('spec(T-015:AC-4) text tokens and params are bi-consistent (word-boundary live check)', () => {
    const problems: string[] = [];

    for (const { template } of allTemplates(loadAll())) {
      const inText = referencedNames(template);
      for (const name of inText) {
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
// AC-5 — 1,000-seed golden sweep
// =============================================================================================

describe('AC-5 — 1,000-seed generateQuestion sweep per template', () => {
  it('spec(T-015:AC-5) every seed succeeds with in-range params, true constraints, rendered text, 4 distinct choices, correct answer', () => {
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
// AC-6 — curriculum display bounds
// =============================================================================================

describe('AC-6 — non-negative integers within per-skill display bounds', () => {
  it('spec(T-015:AC-6) answers and numeric text tokens stay non-negative and inside the skill bound', () => {
    const failures: string[] = [];

    for (const { skill, template } of allTemplates(loadAll())) {
      const bound = DISPLAY_BOUND[skill];
      for (let seed = 1; seed <= SWEEP_SEEDS; seed += 1) {
        const [question] = generateOne(template, seed);
        const answer = question.choices[question.correctIndex]!.value;

        if (!Number.isInteger(answer) || answer < 0 || answer > bound) {
          failures.push(`${template.id}@${seed}: answer ${answer} outside 0..${bound}`);
        }

        for (const token of question.text.match(NUMERIC_TOKEN) ?? []) {
          const value = Number(token);
          if (!Number.isInteger(value) || value < 0 || value > bound) {
            failures.push(`${template.id}@${seed}: text token ${token} outside 0..${bound}`);
          }
        }
      }
    }

    expect(failures.slice(0, 20), `${failures.length} bound failure(s)`).toEqual([]);
  });
});

// =============================================================================================
// AC-7 — two_step intermediate never negative
// =============================================================================================

describe('AC-7 — two_step_add_sub intermediate of the first operation is never negative', () => {
  it('spec(T-015:AC-7) 1,000 samples per two_step template: first-op intermediate >= 0', () => {
    const failures: string[] = [];

    for (const template of loadSkill('two_step_add_sub')) {
      for (let seed = 1; seed <= SWEEP_SEEDS; seed += 1) {
        const [question] = generateOne(template, seed);
        let intermediate: number;
        try {
          intermediate = firstAddSubIntermediate(template.answerExpr, question.params);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          failures.push(`${template.id}@${seed}: could not compute intermediate: ${detail}`);
          continue;
        }
        if (intermediate < 0) {
          failures.push(
            `${template.id}@${seed}: intermediate ${intermediate} < 0 (params=${JSON.stringify(question.params)})`,
          );
        }
      }
    }

    expect(failures.slice(0, 20), `${failures.length} intermediate failure(s)`).toEqual([]);
  });
});

// =============================================================================================
// AC-8 — mult_facts factors 0..10 and × glyph
// =============================================================================================

describe('AC-8 — mult_facts factors in [0, 10] and display uses ×', () => {
  it('spec(T-015:AC-8) every text uses × (never * or lowercase x); every factor is in 0..10', () => {
    const failures: string[] = [];

    for (const template of loadSkill('mult_facts')) {
      if (!template.text.includes('×')) {
        failures.push(`${template.id}: text must contain ×`);
      }
      if (template.text.includes('*')) {
        failures.push(`${template.id}: text must not contain *`);
      }
      if (usesLowercaseXAsOperator(template.text)) {
        failures.push(`${template.id}: text uses lowercase x as an operator`);
      }

      for (let seed = 1; seed <= SWEEP_SEEDS; seed += 1) {
        const [question] = generateOne(template, seed);
        if (!question.text.includes('×')) {
          failures.push(`${template.id}@${seed}: rendered text missing ×`);
        }
        if (question.text.includes('*') || usesLowercaseXAsOperator(question.text)) {
          failures.push(`${template.id}@${seed}: rendered text uses * or x as operator`);
        }

        for (const factor of factorValues(template, question.text, question.params)) {
          if (!Number.isInteger(factor) || factor < 0 || factor > FACTOR_MAX) {
            failures.push(`${template.id}@${seed}: factor ${factor} outside 0..${FACTOR_MAX}`);
          }
        }
      }
    }

    expect(failures.slice(0, 20), `${failures.length} mult_facts failure(s)`).toEqual([]);
  });
});

// =============================================================================================
// AC-9 — word-problem readability
// =============================================================================================

describe('AC-9 — word problems ≤140 chars, end with ?, contain a substituted numeral', () => {
  it('spec(T-015:AC-9) every isWordProblem template meets length, ?, and numeral rules over the sweep', () => {
    const failures: string[] = [];

    for (const { template } of allTemplates(loadAll())) {
      if (template.isWordProblem !== true) continue;

      for (let seed = 1; seed <= SWEEP_SEEDS; seed += 1) {
        const [question] = generateOne(template, seed);
        if (question.text.length > WORD_PROBLEM_MAX_CHARS) {
          failures.push(`${template.id}@${seed}: length ${question.text.length} > ${WORD_PROBLEM_MAX_CHARS}`);
        }
        if (!question.text.endsWith('?')) {
          failures.push(`${template.id}@${seed}: does not end with ?: "${question.text}"`);
        }
        const hasNumeral = (question.text.match(NUMERIC_TOKEN) ?? []).length > 0;
        if (!hasNumeral) {
          failures.push(`${template.id}@${seed}: no substituted numeral in "${question.text}"`);
        }
      }
    }

    expect(failures.slice(0, 20), `${failures.length} word-problem failure(s)`).toEqual([]);
  });
});

// =============================================================================================
// AC-10 — ladder source < 250 / 1000
// =============================================================================================

describe('AC-10 — declared distractors rarely fall through to the ladder', () => {
  it('spec(T-015:AC-10) ladder-sourced samples are fewer than 250 of 1000 per template', () => {
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
// AC-11 — hand-computed literal spot checks (independent of evaluateNumber / answerExpr)
// =============================================================================================

describe('AC-11 — hand-computed spot checks pin arithmetic independently of the evaluator', () => {
  it('spec(T-015:AC-11) every required template has a literal spot check, and no shipped template is missing one', () => {
    const requiredIds = REQUIRED_TEMPLATES.map((t) => t.id).sort();
    const checkIds = SPOT_CHECKS.map((c) => c.id).sort();
    expect(checkIds).toEqual(requiredIds);
    expect(SPOT_CHECKS).toHaveLength(REQUIRED_TEMPLATES.length);

    const loaded = loadAllTemplates();
    for (const template of loaded) {
      expect(
        SPOT_CHECKS.some((c) => c.id === template.id),
        `shipped template ${template.id} needs a SPOT_CHECKS row`,
      ).toBe(true);
    }
  });

  it.each([...SPOT_CHECKS])(
    'spec(T-015:AC-11) $id at seed $seed renders "$text" with answer $answer',
    ({ id, seed, text, answer }) => {
      const loaded = loadAllTemplates();
      const template = loaded.find((t) => t.id === id);
      expect(template, `missing shipped template ${id}`).toBeDefined();
      const [question] = generateOne(template!, seed);
      expect(question.text).toBe(text);
      expect(question.choices[question.correctIndex]?.value).toBe(answer);
    },
  );
});

// =============================================================================================
// AC-12 — ≥5 skeletons + symbolic/word mix per skill
// =============================================================================================

describe('AC-12 — shape variety and symbolic/word-problem mix', () => {
  it.each(SKILLS)(
    'spec(T-015:AC-12) %s has ≥5 skeletons plus at least one word and one symbolic template',
    (skill) => {
      const templates = loadSkill(skill);
      const skeletons = new Set(templates.map((template) => skeletonOf(template.text)));
      expect(skeletons.size, `${skill} skeletons: ${[...skeletons].join(' | ')}`).toBeGreaterThanOrEqual(5);

      const word = templates.filter((template) => template.isWordProblem === true);
      const symbolic = templates.filter((template) => template.isWordProblem !== true);
      expect(word.length, `${skill} needs ≥1 isWordProblem: true`).toBeGreaterThanOrEqual(1);
      expect(symbolic.length, `${skill} needs ≥1 symbolic template`).toBeGreaterThanOrEqual(1);
    },
  );
});

// =============================================================================================
// AC-13 — sampling headroom (seeds 1..200, no CONSTRAINTS_UNSATISFIED)
// =============================================================================================

describe('AC-13 — constraints sample inside MAX_PARAM_SAMPLE_ATTEMPTS', () => {
  it('spec(T-015:AC-13) seeds 1..200 never raise CONSTRAINTS_UNSATISFIED', () => {
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
// AC-14 — ≥3 distractors, none equal to answerExpr or a sibling
// =============================================================================================

describe('AC-14 — declared distractor hygiene', () => {
  it('spec(T-015:AC-14) every template declares ≥3 distractors, unique and distinct from answerExpr', () => {
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

describe('T-015 Definition of Done', () => {
  it('dod(T-015:1) tags a test against every acceptance criterion the ticket declares', () => {
    const declared = [...TICKET_SOURCE.matchAll(/\*\*(AC-\d+)\*\*/g)].map((match) => match[1]);
    const unique = [...new Set(declared)];
    const untagged = unique.filter((ac) => !OWN_SOURCE.includes(`spec(T-015:${ac})`));

    expect(unique.length).toBeGreaterThan(0);
    expect(untagged, 'every declared AC needs at least one tagged test').toEqual([]);
  });

  it('dod(T-015:2) keeps every local gate wired up, and adds no marker or focused test', () => {
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

  it('dod(T-015:3) numbers every dod tag so spec-lint can parse coverage of all seven items', () => {
    const dodCount = (TICKET_SOURCE.match(/^- \[[ x]\] /gm) ?? []).length;
    const tagged = [...OWN_SOURCE.matchAll(/dod\(T-015:([^)]*)\)/g)].map((match) => match[1] ?? '');
    const unparseable = tagged.filter((id) => !/^\d+$/.test(id));
    const covered = new Set(tagged.filter((id) => /^\d+$/.test(id)).map(Number));
    const missing = Array.from({ length: dodCount }, (_, i) => i + 1).filter((n) => !covered.has(n));

    expect(dodCount).toBe(7);
    expect(unparseable).toEqual([]);
    expect(missing).toEqual([]);
    expect(OWN_SOURCE).toContain('spec(T-015:AC-');
  });

  it('dod(T-015:4) each skill file holds ≥8 templates, ≥5 skeletons, and a word/symbolic mix', () => {
    for (const skill of SKILLS) {
      const templates = loadSkill(skill);
      const skeletons = new Set(templates.map((template) => skeletonOf(template.text)));
      expect(templates.length, `${skill} template floor`).toBeGreaterThanOrEqual(8);
      expect(skeletons.size, `${skill} skeleton floor`).toBeGreaterThanOrEqual(5);
      expect(
        templates.some((template) => template.isWordProblem === true),
        `${skill} word-problem mix`,
      ).toBe(true);
      expect(
        templates.some((template) => template.isWordProblem !== true),
        `${skill} symbolic mix`,
      ).toBe(true);
    }
  });

  it('dod(T-015:5) no two_step_add_sub sample produces a negative intermediate or final answer', () => {
    for (const template of loadSkill('two_step_add_sub')) {
      for (let seed = 1; seed <= 100; seed += 1) {
        const [question] = generateOne(template, seed);
        const answer = question.choices[question.correctIndex]!.value;
        const intermediate = firstAddSubIntermediate(template.answerExpr, question.params);
        expect(intermediate, `${template.id}@${seed} intermediate`).toBeGreaterThanOrEqual(0);
        expect(answer, `${template.id}@${seed} final`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('dod(T-015:6) every template survives 1,000 seeded generations with distinct choices', () => {
    for (const { template } of allTemplates(loadAll())) {
      for (let seed = 1; seed <= SWEEP_SEEDS; seed += 1) {
        const [question] = generateOne(template, seed);
        expect(question.choices).toHaveLength(4);
        const values = question.choices.map((choice) => choice.value);
        expect(new Set(values).size, `${template.id}@${seed}`).toBe(4);
      }
    }
  });

  it('dod(T-015:7) stays inside file_scopes — three skill JSON files, no templates/index.ts', () => {
    // Nearest unit-visible reading of the file_scopes claim: this ticket owns these three
    // skill files; sibling tickets (T-014/T-016) share `templates/`. The registry is T-019.
    expect(existsSync(`${TEMPLATES_DIR}index.ts`), 'do not create templates/index.ts').toBe(false);
    for (const skill of SKILLS) {
      expect(existsSync(skillPath(skill)), `${SKILL_FILE[skill]} is in file_scopes`).toBe(true);
      expect(SKILL_FILE[skill].endsWith('.json')).toBe(true);
    }
    expect(Object.values(SKILL_FILE).sort()).toEqual([
      'mult_facts.json',
      'place_value_compare.json',
      'two_step_add_sub.json',
    ]);
  });
});
