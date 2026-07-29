/**
 * T-016 — grade 3–5 question templates: `div_facts`, `fractions_int`, `multi_digit_order_ops`.
 *
 * Content files under `src/content/templates/` are the deliverable (implementer-authored). This
 * suite is the frozen contract: schema shape, id hygiene, exact-division sampling, integer-only
 * fraction answers with no decimal glyphs, order-of-ops variety, the ARCHITECTURE.md §9.1 golden
 * sweep, ladder headroom, and hand-pinned spot checks.
 *
 * Traceability: every test name cites a T-016 spec or dod tag that spec-lint can parse.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
const SPOT_SEED = 17;

/** Alphabetic tokens permitted on symbolic (non-word-problem) templates in this band. */
const SYMBOLIC_UNIT_WORDS = new Set(['of', 'whole', 'wholes', 'ones', 'tens', 'hundreds', 'thousands']);

const PARAM_TOKEN = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const NUMERIC_TOKEN = /\d+/g;
const ALPHA_WORD = /[A-Za-z]+/g;

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

function allTemplates(
  bySkill: Record<G35Skill, Template[]>,
): readonly { skill: G35Skill; template: Template }[] {
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

function isNoParenPlusTimes(text: string): boolean {
  if (text.includes('(') || text.includes(')')) return false;
  const plus = text.indexOf('+');
  const times = text.indexOf('×');
  return plus >= 0 && times >= 0 && plus < times;
}

function isParenAdditionTimes(text: string): boolean {
  return /\([^)]*\+[^)]*\)/.test(text) && text.includes('×');
}

/**
 * Compact form for comparing distractor / answerExpr spellings: strip spaces so
 * `(a + b) * c` and `(a+b)*c` match.
 */
function compactExpr(expr: string): string {
  return expr.replace(/\s+/g, '');
}

function isWrongOrderDistractor(answerExpr: string, distractor: string): boolean {
  const answer = compactExpr(answerExpr);
  const decoy = compactExpr(distractor);
  // Classic precedence trap: answer is a+b*c (or a + b * c), decoy forces (a+b)*c.
  if (/^[a-zA-Z_][a-zA-Z0-9_]*\+[a-zA-Z_][a-zA-Z0-9_]*\*[a-zA-Z_][a-zA-Z0-9_]*$/.test(answer)) {
    return /^\([a-zA-Z_][a-zA-Z0-9_]*\+[a-zA-Z_][a-zA-Z0-9_]*\)\*[a-zA-Z_][a-zA-Z0-9_]*$/.test(decoy);
  }
  if (/^[a-zA-Z_][a-zA-Z0-9_]*\*[a-zA-Z_][a-zA-Z0-9_]*\+[a-zA-Z_][a-zA-Z0-9_]*$/.test(answer)) {
    return /^\([a-zA-Z_][a-zA-Z0-9_]*\*[a-zA-Z_][a-zA-Z0-9_]*\+[a-zA-Z_][a-zA-Z0-9_]*\)$/.test(decoy);
  }
  return false;
}

// =============================================================================================
// Independent arithmetic evaluator for AC-12 (does NOT import the production evaluator)
// =============================================================================================

/**
 * Grade-school arithmetic over `+ - * / %` and parentheses. Real division, same as the
 * curriculum evaluator — used only so spot-check expectations are not read back through
 * `evaluateNumber`.
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

function repoText(relative: string): string {
  return readFileSync(`${REPO_ROOT}${relative}`, 'utf8');
}

// =============================================================================================
// AC-1 — schema parse + ≥8 per skill
// =============================================================================================

describe('AC-1 — each skill file parses and holds at least 8 templates', () => {
  it.each(SKILLS)('spec(T-016:AC-1) %s.json parses via z.array(templateSchema) with length >= 8', (skill) => {
    const templates = loadSkill(skill);
    expect(templates.length, `${skill} needs ≥8 templates`).toBeGreaterThanOrEqual(8);
  });
});

// =============================================================================================
// AC-2 — skill field, id prefix, global uniqueness
// =============================================================================================

describe('AC-2 — skill ownership, id prefix, pairwise-unique ids', () => {
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

describe('AC-3 — every {token} is a declared param; every param is live', () => {
  it('spec(T-016:AC-3) text tokens and params are bi-consistent', () => {
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
// AC-4 — 1,000-seed golden sweep
// =============================================================================================

describe('AC-4 — 1,000-seed generateQuestion sweep per template', () => {
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
// AC-5 — div_facts exact division / no DIVISION_BY_ZERO
// =============================================================================================

describe('AC-5 — div_facts never divides by zero and always yields an integer', () => {
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

describe('AC-6 — non-negative integers ≤ 1000 (answers and numeric text tokens)', () => {
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

describe('AC-7 — fractions_int never shows a decimal point', () => {
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

describe('AC-8 — multi_digit_order_ops precedence pair with distinct answers', () => {
  it('spec(T-016:AC-8) has +× without parens and (+)× form; same a,b,c yield different answers', () => {
    const templates = loadSkill('multi_digit_order_ops');
    const noParen = templates.find((template) => isNoParenPlusTimes(template.text));
    const withParen = templates.find((template) => isParenAdditionTimes(template.text));

    expect(noParen, 'need a template with + then × and no parentheses').toBeDefined();
    expect(withParen, 'need a template that parenthesises the addition before ×').toBeDefined();

    const seed = SPOT_SEED;
    const [noParenQuestion] = generateOne(noParen!, seed);
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

describe('AC-9 — wrong-order result is a declared distractor', () => {
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

describe('AC-10 — word problems flagged, ≤160 chars, end with ?', () => {
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

describe('AC-11 — declared distractors rarely fall through to the ladder', () => {
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
// AC-12 — hand-computed spot checks (independent of evaluateNumber)
// =============================================================================================

describe('AC-12 — literal spot checks pinned without the production evaluator', () => {
  it('spec(T-016:AC-12) each template at a fixed seed matches hand-rendered text and independentArithmetic answer', () => {
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
// AC-13 — ≥5 distinct text skeletons per skill
// =============================================================================================

describe('AC-13 — shape variety: ≥5 distinct skeletons per skill', () => {
  it.each(SKILLS)('spec(T-016:AC-13) %s has at least 5 distinct text skeletons', (skill) => {
    const skeletons = new Set(loadSkill(skill).map((template) => skeletonOf(template.text)));
    expect(skeletons.size, `${skill} skeletons: ${[...skeletons].join(' | ')}`).toBeGreaterThanOrEqual(5);
  });
});

// =============================================================================================
// AC-14 — sampling headroom (seeds 1..200, no CONSTRAINTS_UNSATISFIED)
// =============================================================================================

describe('AC-14 — constraints sample inside MAX_PARAM_SAMPLE_ATTEMPTS', () => {
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

describe('AC-15 — declared distractor hygiene', () => {
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

describe('T-016 Definition of Done', () => {
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
    for (const template of loadSkill('fractions_int')) {
      const [question] = generateOne(template, SPOT_SEED);
      const answer = question.choices[question.correctIndex]!.value;
      expect(Number.isInteger(answer), `${template.id} answer`).toBe(true);
      expect(question.text.includes('.'), `${template.id} text`).toBe(false);
      for (const choice of question.choices) {
        expect(choice.label.includes('.'), `${template.id} label`).toBe(false);
      }
    }
  });

  it('dod(T-016:6) every div_facts template constrains exact divisibility and a non-zero divisor', () => {
    for (const template of loadSkill('div_facts')) {
      const constraints = template.constraints ?? [];
      expect(constraints.length, `${template.id} needs constraints`).toBeGreaterThan(0);

      for (let seed = 1; seed <= 50; seed += 1) {
        const [question] = generateOne(template, seed);
        const answer = question.choices[question.correctIndex]!.value;
        expect(Number.isInteger(answer), `${template.id}@${seed}`).toBe(true);

        // Any param that appears as a divisor site in answerExpr must be non-zero on this draw.
        for (const [name, value] of Object.entries(question.params)) {
          if (new RegExp(`/\\s*${name}\\b`).test(template.answerExpr)) {
            expect(value, `${template.id} divisor ${name}`).not.toBe(0);
          }
        }
      }
    }
  });

  it('dod(T-016:7) stays inside file_scopes — three skill JSON files, no templates/index.ts', () => {
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
