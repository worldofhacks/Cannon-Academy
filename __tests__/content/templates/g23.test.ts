/**
 * T-015 — grade 2–3 question templates: `place_value_compare`, `two_step_add_sub`, `mult_facts`.
 *
 * Content files under `src/content/templates/` are the deliverable (implementer-authored). This
 * suite is the frozen contract: schema shape, id hygiene, word-problem gating (the first band
 * where prose is legal), the two-step non-negative intermediate guard, multiplication factor
 * bounds and `×` glyph, the ARCHITECTURE.md §9.1 golden sweep, ladder headroom, and
 * hand-pinned spot checks.
 *
 * Traceability: every test name cites a T-015 spec or dod tag that spec-lint can parse.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
const SPOT_SEED = 17;

const PARAM_TOKEN = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const NUMERIC_TOKEN = /\d+/g;
const ALPHA_WORD = /[A-Za-z]+/g;

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
  if (template.answerExpr.includes(name)) return true;
  return (template.constraints ?? []).some((constraint) => constraint.includes(name));
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

// =============================================================================================
// Independent arithmetic (AC-11) — does NOT call evaluateNumber
// =============================================================================================

/**
 * Grade-school arithmetic over `+ - * / %` and parentheses. Used only so spot-check
 * expectations are not read back through the production evaluator.
 */
function independentArithmetic(source: string, env: Readonly<Record<string, number>>): number {
  let i = 0;
  const s = source.trim();

  const peek = (): string => s[i] ?? '';
  const bump = (): string => s[i++] ?? '';

  const skipSpaces = (): void => {
    while (peek() === ' ') i += 1;
  };

  const parsePrimary = (): number => {
    skipSpaces();
    if (peek() === '(') {
      bump();
      const value = parseSum();
      skipSpaces();
      if (bump() !== ')') {
        throw new Error(`independentArithmetic: expected ')' in "${source}"`);
      }
      return value;
    }
    if (/[A-Za-z_]/.test(peek())) {
      let name = '';
      while (/[A-Za-z0-9_]/.test(peek())) name += bump();
      const value = env[name];
      if (value === undefined) {
        throw new Error(`independentArithmetic: unknown identifier "${name}"`);
      }
      return value;
    }
    if (/[0-9]/.test(peek()) || (peek() === '.' && /[0-9]/.test(s[i + 1] ?? ''))) {
      let lit = '';
      while (/[0-9.]/.test(peek())) lit += bump();
      const value = Number(lit);
      if (!Number.isFinite(value)) {
        throw new Error(`independentArithmetic: bad number "${lit}"`);
      }
      return value;
    }
    throw new Error(`independentArithmetic: unexpected "${peek()}" in "${source}"`);
  };

  const parseUnary = (): number => {
    skipSpaces();
    if (peek() === '-') {
      bump();
      return -parseUnary();
    }
    return parsePrimary();
  };

  const parseProduct = (): number => {
    let value = parseUnary();
    for (;;) {
      skipSpaces();
      const op = peek();
      if (op !== '*' && op !== '/' && op !== '%') break;
      bump();
      const rhs = parseUnary();
      if (op === '*') value *= rhs;
      else if (op === '/') {
        if (rhs === 0) throw new Error('independentArithmetic: division by zero');
        value /= rhs;
      } else {
        if (rhs === 0) throw new Error('independentArithmetic: remainder by zero');
        value %= rhs;
      }
    }
    return value;
  };

  const parseSum = (): number => {
    let value = parseProduct();
    for (;;) {
      skipSpaces();
      const op = peek();
      if (op !== '+' && op !== '-') break;
      bump();
      const rhs = parseProduct();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  };

  const result = parseSum();
  skipSpaces();
  if (i !== s.length) {
    throw new Error(`independentArithmetic: trailing input in "${source}"`);
  }
  return result;
}

/**
 * Intermediate after the first top-level left-associative `+` / `-` in `answerExpr`.
 * For `a + b - c` → `a + b`; for `a - b + c` → `a - b`; for `(a + b) - c` → `a + b`.
 * A single-op (or single-term) expression returns that value (still must be ≥ 0).
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
      // Skip a unary minus (start of expr, or after another operator / open paren).
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
    return independentArithmetic(answerExpr, params);
  }

  const left = independentArithmetic(s.slice(0, splitAt), params);
  // Only the first RHS product-term — stop before the next top-level +/−.
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
  const right = independentArithmetic(s.slice(splitAt + 1, rhsEnd), params);
  return splitOp === '+' ? left + right : left - right;
}

/** Factors appearing as `×` operands in rendered text, plus `*` operands in answerExpr. */
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

  // Identifiers that are multiplicands in answerExpr (a * b, a*b, etc.).
  const compact = template.answerExpr.replace(/\s+/g, '');
  for (const match of compact.matchAll(
    /([A-Za-z_][A-Za-z0-9_]*)\*([A-Za-z_][A-Za-z0-9_]*|\d+)|\d+\*([A-Za-z_][A-Za-z0-9_]*)/g,
  )) {
    for (const group of [match[1], match[2], match[3]]) {
      if (group === undefined) continue;
      if (/^\d+$/.test(group)) {
        factors.push(Number(group));
      } else {
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
// AC-1 — schema parse + ≥8 per skill
// =============================================================================================

describe('AC-1 — each skill file parses and holds at least 8 templates', () => {
  it.each(SKILLS)('spec(T-015:AC-1) %s.json parses via z.array(templateSchema) with length >= 8', (skill) => {
    const templates = loadSkill(skill);
    expect(templates.length, `${skill} needs ≥8 templates`).toBeGreaterThanOrEqual(8);
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
// AC-3 — word-problem flag ↔ alphabetic prose; catalog symbolicOnly
// =============================================================================================

describe('AC-3 — word-problem flag matches alphabetic prose; catalog allows word problems', () => {
  it('spec(T-015:AC-3) alphabetic prose requires isWordProblem; word problems require symbolicOnly === false', () => {
    const failures: string[] = [];

    for (const { skill, template } of allTemplates(loadAll())) {
      const words = alphabeticWordsInTemplateText(template.text);
      if (words.length > 0 && template.isWordProblem !== true) {
        failures.push(`${template.id}: alphabetic words [${words.join(', ')}] require isWordProblem: true`);
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
  it('spec(T-015:AC-4) text tokens and params are bi-consistent', () => {
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
// AC-11 — hand-computed spot checks (independent of evaluateNumber)
// =============================================================================================

describe('AC-11 — literal spot checks pinned without the production evaluator', () => {
  it('spec(T-015:AC-11) each template at a fixed seed matches hand-rendered text and independentArithmetic answer', () => {
    const failures: string[] = [];

    for (const { template } of allTemplates(loadAll())) {
      const [question] = generateOne(template, SPOT_SEED);
      let expectedText = template.text;
      for (const [name, value] of Object.entries(question.params)) {
        expectedText = expectedText.split(`{${name}}`).join(String(value));
      }

      const expectedAnswer = independentArithmetic(template.answerExpr, question.params);
      const actualAnswer = question.choices[question.correctIndex]!.value;

      // Literals materialised in the test body — not read back through evaluateNumber.
      expect(question.text).toBe(expectedText);
      expect(actualAnswer).toBe(expectedAnswer);

      if (question.text !== expectedText) {
        failures.push(`${template.id}: text want "${expectedText}" got "${question.text}"`);
      }
      if (actualAnswer !== expectedAnswer) {
        failures.push(`${template.id}: answer want ${expectedAnswer} got ${actualAnswer}`);
      }
    }

    expect(failures).toEqual([]);
  });
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
    expect(existsSync(`${TEMPLATES_DIR}index.ts`), 'do not create templates/index.ts').toBe(false);

    for (const skill of SKILLS) {
      expect(existsSync(skillPath(skill)), `${SKILL_FILE[skill]} is in file_scopes`).toBe(true);
    }

    if (existsSync(TEMPLATES_DIR)) {
      const jsonFiles = readdirSync(TEMPLATES_DIR).filter((name) => name.endsWith('.json'));
      const allowed = new Set(Object.values(SKILL_FILE));
      const unexpected = jsonFiles.filter((name) => !allowed.has(name));
      expect(unexpected, 'only the three scoped skill files belong here').toEqual([]);
    }
  });
});
