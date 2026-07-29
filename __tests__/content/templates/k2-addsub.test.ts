/**
 * T-014 — K–2 addition/subtraction question templates (symbolic only).
 *
 * Deliverable is hand-authored JSON under `src/content/templates/`. These tests are the
 * content contract: schema validity, id hygiene, symbolic-only flags, param/text consistency,
 * shape variety, curriculum bounds, distractor hygiene, sampling headroom, and the
 * ARCHITECTURE.md §9.1 golden sweep (1,000 seeded generations per template).
 *
 * JSON files do not exist yet. Load via `readFileSync` + `JSON.parse` (same pattern as
 * `__tests__/content/catalogs.test.ts` AC-13). Do **not** create `templates/index.ts` (T-019).
 *
 * AC-8 pins hand-computed `(seed → text, answer)` literals for every required template id.
 * `REQUIRED_TEMPLATES` is the authoring contract that produces those literals — copy it into
 * the three skill files (one array per skill). An implementer who ships eight clones of
 * `{a} + {b} = ?`, word-problem prose, colliding distractors, or over-tight constraints fails
 * here even if the schema is happy.
 *
 * Traceability: every behavioural test cites `spec(T-014:AC-n)`; DoD items cite `dod(T-014:n)`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { templateSchema } from '@content/schemas';
import type { SkillId, Template } from '@content/schemas';
import { createRng } from '@engine/rng';
import { describeDistractorSources } from '@engine/questions/distractors';
import { evaluateNumber, evaluatePredicate } from '@engine/questions/expr';
import { generateQuestion } from '@engine/questions/generator';
import { QuestionGenerationError } from '@engine/questions/types';
import { CHOICE_COUNT, MAX_PARAM_SAMPLE_ATTEMPTS } from '@engine/tuning';

// --- paths & skill files ---------------------------------------------------------------------

const TEMPLATES_DIR = fileURLToPath(new URL('../../../src/content/templates/', import.meta.url));

const SKILL_FILES = [
  { skill: 'add_within_10' as const, file: 'add_within_10.json', answerMax: 10 },
  { skill: 'add_within_20' as const, file: 'add_within_20.json', answerMax: 20 },
  { skill: 'sub_within_20' as const, file: 'sub_within_20.json', answerMax: 20 },
] as const;

const PARAM_TOKEN = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const NUMERIC_TOKEN = /\d+/g;

/** Text skeleton: every `{…}` token replaced by `#` (AC-9). */
function skeletonOf(text: string): string {
  return text.replace(PARAM_TOKEN, '#');
}

/** Letters remaining after stripping param tokens — word-problem prose leaves residue (AC-3). */
function lettersOutsideParams(text: string): string {
  return text.replace(PARAM_TOKEN, '').replace(/[^A-Za-z]/g, '');
}

function nearMiss(answerExpr: string): readonly [string, string, string] {
  return [`(${answerExpr}) + 1`, `(${answerExpr}) - 1`, `(${answerExpr}) + 2`];
}

/**
 * Authoring contract for the three JSON files. Eight templates per skill, six distinct
 * skeletons each, ranges wide enough for AC-11, distractors engineered for AC-7.
 * Spot-check literals below were hand-computed from these shapes via `createRng` + `pick` +
 * rejection sampling — not by reading a generated question back as the expected value.
 */
const REQUIRED_TEMPLATES: readonly Template[] = [
  // ---- add_within_10 ------------------------------------------------------------------------
  {
    id: 'add_within_10_basic',
    skill: 'add_within_10',
    text: '{a} + {b} = ?',
    params: { a: [0, 9], b: [0, 9] },
    constraints: ['a + b <= 10'],
    answerExpr: 'a + b',
    distractors: [...nearMiss('a + b')],
  },
  {
    id: 'add_within_10_missing_addend',
    skill: 'add_within_10',
    text: '{a} + ? = {c}',
    params: { a: [0, 9], c: [0, 10] },
    constraints: ['c >= a', 'c <= 10'],
    answerExpr: 'c - a',
    distractors: [...nearMiss('c - a')],
  },
  {
    id: 'add_within_10_missing_first',
    skill: 'add_within_10',
    text: '? + {b} = {c}',
    params: { b: [0, 9], c: [0, 10] },
    constraints: ['c >= b', 'c <= 10'],
    answerExpr: 'c - b',
    distractors: [...nearMiss('c - b')],
  },
  {
    id: 'add_within_10_doubles',
    skill: 'add_within_10',
    text: '{a} + {a} = ?',
    params: { a: [0, 5] },
    constraints: ['a + a <= 10'],
    answerExpr: 'a + a',
    distractors: [...nearMiss('a + a')],
  },
  {
    id: 'add_within_10_near_doubles',
    skill: 'add_within_10',
    text: '{a} + {b} = ?',
    params: { a: [0, 4], b: [1, 5] },
    constraints: ['b == a + 1', 'a + b <= 10'],
    answerExpr: 'a + b',
    // Under b == a + 1, a + a === a + b - 1, so the third distractor must NOT be a + a.
    distractors: ['a + b + 1', 'a + b - 1', 'a + b + 2'],
  },
  {
    id: 'add_within_10_make_ten',
    skill: 'add_within_10',
    text: '{a} + ? = 10',
    params: { a: [0, 10] },
    constraints: ['a <= 10'],
    answerExpr: '10 - a',
    distractors: [...nearMiss('10 - a')],
  },
  {
    id: 'add_within_10_three_term',
    skill: 'add_within_10',
    text: '{a} + {b} + {c} = ?',
    params: { a: [0, 5], b: [0, 5], c: [0, 5] },
    constraints: ['a + b + c <= 10'],
    answerExpr: 'a + b + c',
    distractors: [...nearMiss('a + b + c')],
  },
  {
    id: 'add_within_10_sum_first',
    skill: 'add_within_10',
    text: '? = {a} + {b}',
    params: { a: [0, 9], b: [0, 9] },
    constraints: ['a + b <= 10'],
    answerExpr: 'a + b',
    distractors: [...nearMiss('a + b')],
  },
  // ---- add_within_20 ------------------------------------------------------------------------
  {
    id: 'add_within_20_basic',
    skill: 'add_within_20',
    text: '{a} + {b} = ?',
    params: { a: [0, 20], b: [0, 20] },
    constraints: ['a + b <= 20'],
    answerExpr: 'a + b',
    distractors: [...nearMiss('a + b')],
  },
  {
    id: 'add_within_20_missing_addend',
    skill: 'add_within_20',
    text: '{a} + ? = {c}',
    params: { a: [0, 20], c: [0, 20] },
    constraints: ['c >= a'],
    answerExpr: 'c - a',
    distractors: [...nearMiss('c - a')],
  },
  {
    id: 'add_within_20_missing_first',
    skill: 'add_within_20',
    text: '? + {b} = {c}',
    params: { b: [0, 20], c: [0, 20] },
    constraints: ['c >= b'],
    answerExpr: 'c - b',
    distractors: [...nearMiss('c - b')],
  },
  {
    id: 'add_within_20_doubles',
    skill: 'add_within_20',
    text: '{a} + {a} = ?',
    params: { a: [0, 10] },
    constraints: ['a + a <= 20'],
    answerExpr: 'a + a',
    distractors: [...nearMiss('a + a')],
  },
  {
    id: 'add_within_20_near_doubles',
    skill: 'add_within_20',
    text: '{a} + {b} = ?',
    params: { a: [0, 9], b: [1, 10] },
    constraints: ['b == a + 1', 'a + b <= 20'],
    answerExpr: 'a + b',
    // Under b == a + 1, a + a === a + b - 1, so the third distractor must NOT be a + a.
    distractors: ['a + b + 1', 'a + b - 1', 'a + b + 2'],
  },
  {
    id: 'add_within_20_make_ten',
    skill: 'add_within_20',
    text: '{a} + ? = 10',
    params: { a: [0, 10] },
    constraints: ['a <= 10'],
    answerExpr: '10 - a',
    distractors: [...nearMiss('10 - a')],
  },
  {
    id: 'add_within_20_three_term',
    skill: 'add_within_20',
    text: '{a} + {b} + {c} = ?',
    params: { a: [0, 10], b: [0, 10], c: [0, 10] },
    constraints: ['a + b + c <= 20'],
    answerExpr: 'a + b + c',
    distractors: [...nearMiss('a + b + c')],
  },
  {
    id: 'add_within_20_sum_first',
    skill: 'add_within_20',
    text: '? = {a} + {b}',
    params: { a: [0, 20], b: [0, 20] },
    constraints: ['a + b <= 20'],
    answerExpr: 'a + b',
    distractors: [...nearMiss('a + b')],
  },
  // ---- sub_within_20 ------------------------------------------------------------------------
  {
    id: 'sub_within_20_basic',
    skill: 'sub_within_20',
    text: '{a} - {b} = ?',
    params: { a: [0, 20], b: [0, 20] },
    constraints: ['a >= b', 'a <= 20'],
    answerExpr: 'a - b',
    distractors: [...nearMiss('a - b')],
  },
  {
    id: 'sub_within_20_missing_subtrahend',
    skill: 'sub_within_20',
    text: '{a} - ? = {c}',
    params: { a: [0, 20], c: [0, 20] },
    constraints: ['a >= c', 'a <= 20'],
    answerExpr: 'a - c',
    distractors: [...nearMiss('a - c')],
  },
  {
    id: 'sub_within_20_missing_minuend',
    skill: 'sub_within_20',
    text: '? - {b} = {c}',
    params: { b: [0, 20], c: [0, 20] },
    constraints: ['b + c <= 20'],
    answerExpr: 'b + c',
    distractors: [...nearMiss('b + c')],
  },
  {
    id: 'sub_within_20_how_many_more',
    skill: 'sub_within_20',
    text: '{c} - {a} = ?',
    params: { a: [0, 20], c: [0, 20] },
    constraints: ['c >= a', 'c <= 20'],
    answerExpr: 'c - a',
    distractors: [...nearMiss('c - a')],
  },
  {
    id: 'sub_within_20_minus_zero',
    skill: 'sub_within_20',
    text: '{a} - 0 = ?',
    params: { a: [0, 20] },
    constraints: ['a <= 20'],
    answerExpr: 'a - 0',
    distractors: [...nearMiss('a - 0')],
  },
  {
    id: 'sub_within_20_doubles',
    skill: 'sub_within_20',
    text: '{a} - {a} = ?',
    params: { a: [0, 20] },
    answerExpr: '0',
    distractors: ['1', '2', '3'],
  },
  {
    id: 'sub_within_20_two_step',
    skill: 'sub_within_20',
    text: '{a} - {b} - {c} = ?',
    params: { a: [0, 20], b: [0, 10], c: [0, 10] },
    constraints: ['a >= b + c', 'a <= 20'],
    answerExpr: 'a - b - c',
    distractors: [...nearMiss('a - b - c')],
  },
  {
    id: 'sub_within_20_diff_first',
    skill: 'sub_within_20',
    text: '? = {a} - {b}',
    params: { a: [0, 20], b: [0, 20] },
    constraints: ['a >= b'],
    answerExpr: 'a - b',
    distractors: [...nearMiss('a - b')],
  },
].map((raw) => templateSchema.parse(raw));

/**
 * AC-8 hand-computed spot checks. Literals are independent of `evaluateNumber` / the
 * generator's render path — they were derived from the REQUIRED_TEMPLATES ranges, constraints,
 * and mulberry32 draws (including the pool-`pick` consume) at the listed seed.
 */
const SPOT_CHECKS: readonly {
  readonly id: string;
  readonly seed: number;
  readonly text: string;
  readonly answer: number;
}[] = [
  { id: 'add_within_10_basic', seed: 14, text: '4 + 5 = ?', answer: 9 },
  { id: 'add_within_10_missing_addend', seed: 14, text: '4 + ? = 5', answer: 1 },
  { id: 'add_within_10_missing_first', seed: 14, text: '? + 4 = 5', answer: 1 },
  { id: 'add_within_10_doubles', seed: 5, text: '4 + 4 = ?', answer: 8 },
  { id: 'add_within_10_near_doubles', seed: 1, text: '4 + 5 = ?', answer: 9 },
  { id: 'add_within_10_make_ten', seed: 5, text: '8 + ? = 10', answer: 2 },
  { id: 'add_within_10_three_term', seed: 2, text: '1 + 1 + 3 = ?', answer: 5 },
  { id: 'add_within_10_sum_first', seed: 14, text: '? = 4 + 5', answer: 9 },
  { id: 'add_within_20_basic', seed: 5, text: '16 + 4 = ?', answer: 20 },
  { id: 'add_within_20_missing_addend', seed: 5, text: '12 + ? = 15', answer: 3 },
  { id: 'add_within_20_missing_first', seed: 5, text: '? + 12 = 15', answer: 3 },
  { id: 'add_within_20_doubles', seed: 5, text: '8 + 8 = ?', answer: 16 },
  { id: 'add_within_20_near_doubles', seed: 1, text: '9 + 10 = ?', answer: 19 },
  { id: 'add_within_20_make_ten', seed: 5, text: '8 + ? = 10', answer: 2 },
  { id: 'add_within_20_three_term', seed: 2, text: '3 + 3 + 5 = ?', answer: 11 },
  { id: 'add_within_20_sum_first', seed: 5, text: '? = 16 + 4', answer: 20 },
  { id: 'sub_within_20_basic', seed: 5, text: '16 - 4 = ?', answer: 12 },
  { id: 'sub_within_20_missing_subtrahend', seed: 5, text: '16 - ? = 4', answer: 12 },
  { id: 'sub_within_20_missing_minuend', seed: 5, text: '? - 16 = 4', answer: 20 },
  { id: 'sub_within_20_how_many_more', seed: 5, text: '15 - 12 = ?', answer: 3 },
  { id: 'sub_within_20_minus_zero', seed: 5, text: '16 - 0 = ?', answer: 16 },
  { id: 'sub_within_20_doubles', seed: 5, text: '16 - 16 = ?', answer: 0 },
  { id: 'sub_within_20_two_step', seed: 5, text: '16 - 2 - 6 = ?', answer: 8 },
  { id: 'sub_within_20_diff_first', seed: 5, text: '? = 16 - 4', answer: 12 },
];

// --- loaders ---------------------------------------------------------------------------------

function filePath(file: string): string {
  return `${TEMPLATES_DIR}${file}`;
}

function loadSkillFile(file: string): Template[] {
  const path = filePath(file);
  expect(existsSync(path), `missing template file: src/content/templates/${file}`).toBe(true);
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const parsed = z.array(templateSchema).safeParse(raw);
  expect(
    parsed.success,
    parsed.success ? undefined : `src/content/templates/${file}: ${JSON.stringify(parsed.error.issues)}`,
  ).toBe(true);
  if (!parsed.success) {
    throw new Error(`unreachable: parse failed for ${file}`);
  }
  return parsed.data;
}

function loadAllTemplates(): Template[] {
  return SKILL_FILES.flatMap(({ file }) => loadSkillFile(file));
}

function answerMaxFor(skill: SkillId): number {
  const row = SKILL_FILES.find((s) => s.skill === skill);
  if (row === undefined) {
    throw new Error(`unexpected skill in K-2 suite: ${skill}`);
  }
  return row.answerMax;
}

// --- Authoring-contract preflight (does not need JSON files) ---------------------------------
// Proves SPOT_CHECKS / REQUIRED_TEMPLATES are consistent with the real generator so an
// implementer who copies the contract is not chasing a buggy expected literal.

// Property-suite timeout: heavy seeded sweeps exceed Vitest's 5s default when
// multiple worktrees run the suite concurrently (timeouts only — not assertion failures).

describe(
  'authoring contract preflight — REQUIRED_TEMPLATES ↔ SPOT_CHECKS ↔ generator',
  { timeout: 60000 },
  () => {
    it('every SPOT_CHECK literal matches generateQuestion on the required template at that seed', () => {
      for (const check of SPOT_CHECKS) {
        const template = REQUIRED_TEMPLATES.find((t) => t.id === check.id);
        expect(template, check.id).toBeDefined();
        if (template === undefined) continue;
        const [question] = generateQuestion({
          templates: [template],
          recentTemplateIds: [],
          rng: createRng(check.seed),
        });
        expect(question.text, check.id).toBe(check.text);
        expect(question.choices[question.correctIndex]?.value, check.id).toBe(check.answer);
      }
    });

    it('required templates survive seeds 1…200 without CONSTRAINTS_UNSATISFIED', () => {
      for (const template of REQUIRED_TEMPLATES) {
        for (let seed = 1; seed <= 200; seed += 1) {
          expect(() =>
            generateQuestion({
              templates: [template],
              recentTemplateIds: [],
              rng: createRng(seed),
            }),
          ).not.toThrow();
        }
      }
    });

    it('spec(T-014:AC-7) REQUIRED_TEMPLATES preflight: ladder fills on fewer than 250 of 1000 samples per template', () => {
      // Freezes the authoring contract against the AC-7 collision class (e.g. near_doubles
      // declaring both a+b-1 and a+a under b == a + 1) before JSON is ever copied.
      const failures: string[] = [];
      const rates: Record<string, number> = {};

      for (const template of REQUIRED_TEMPLATES) {
        let ladderHits = 0;
        for (let seed = 1; seed <= 1000; seed += 1) {
          const [question] = generateQuestion({
            templates: [template],
            recentTemplateIds: [],
            rng: createRng(seed),
          });
          const sources = describeDistractorSources(template, question.params);
          if (sources.includes('ladder')) {
            ladderHits += 1;
          }
        }
        rates[template.id] = ladderHits;
        if (ladderHits >= 250) {
          failures.push(`${template.id}: ladder ${ladderHits}/1000`);
        }
      }

      expect(failures, `ladder rates: ${JSON.stringify(rates)}\n${failures.join('\n')}`).toEqual([]);
    });
  },
);

// --- AC-1: files parse, ≥8 each --------------------------------------------------------------

describe('AC-1 — each skill file parses and holds at least 8 templates', { timeout: 60000 }, () => {
  it.each([...SKILL_FILES])(
    'spec(T-014:AC-1) dod(T-014:4) $file exists, parses with z.array(templateSchema), and has ≥8 entries',
    ({ file }) => {
      const templates = loadSkillFile(file);
      expect(templates.length, `${file} must ship at least 8 templates`).toBeGreaterThanOrEqual(8);
    },
  );

  it('spec(T-014:AC-1) the three files together match the required authoring contract (no lazy stubs)', () => {
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

// --- AC-2: skill / id hygiene ----------------------------------------------------------------

describe('AC-2 — skill matches file, ids are prefixed and globally unique', { timeout: 60000 }, () => {
  it.each([...SKILL_FILES])(
    'spec(T-014:AC-2) every template in $file has skill === $skill and id starting with $skill_',
    ({ file, skill }) => {
      for (const template of loadSkillFile(file)) {
        expect(template.skill, `${template.id}.skill`).toBe(skill);
        expect(template.id.startsWith(`${skill}_`), `${template.id} must start with '${skill}_'`).toBe(true);
      }
    },
  );

  it('spec(T-014:AC-2) all ids across the three files are pairwise unique', () => {
    const ids = loadAllTemplates().map((t) => t.id);
    expect(new Set(ids).size, `duplicate template ids: ${ids.join(', ')}`).toBe(ids.length);
  });
});

// --- AC-3: symbolic only ---------------------------------------------------------------------

describe(
  'AC-3 — symbolic-only: no word problems, no read-aloud, no prose residue',
  { timeout: 60000 },
  () => {
    it('spec(T-014:AC-3) dod(T-014:5) isWordProblem and readAloud are absent or false on every template', () => {
      for (const template of loadAllTemplates()) {
        expect(template.isWordProblem ?? false, `${template.id}.isWordProblem`).toBe(false);
        expect(template.readAloud ?? false, `${template.id}.readAloud`).toBe(false);
      }
    });

    it('spec(T-014:AC-3) template text has no alphabetic prose outside {param} tokens', () => {
      // Blocks "Tom has {a} apples" while still allowing `{a} + {b} = ?` and literal `?`.
      for (const template of loadAllTemplates()) {
        expect(
          lettersOutsideParams(template.text),
          `${template.id} text must be symbolic (no letters outside param tokens): "${template.text}"`,
        ).toBe('');
      }
    });
  },
);

// --- AC-4: param / text consistency ----------------------------------------------------------

describe('AC-4 — every {name} is a declared param; no dead parameters', { timeout: 60000 }, () => {
  it('spec(T-014:AC-4) every {name} token names a key in params', () => {
    for (const template of loadAllTemplates()) {
      const names = [...template.text.matchAll(PARAM_TOKEN)].map((m) => m[1]);
      for (const name of names) {
        expect(
          name !== undefined && Object.hasOwn(template.params, name),
          `${template.id}: text token {${name}} is not in params`,
        ).toBe(true);
      }
    }
  });

  it('spec(T-014:AC-4) every params key unused in text appears in answerExpr or a constraint', () => {
    for (const template of loadAllTemplates()) {
      const usedInText = new Set([...template.text.matchAll(PARAM_TOKEN)].map((m) => m[1]));
      const constraints = template.constraints ?? [];
      for (const key of Object.keys(template.params)) {
        if (usedInText.has(key)) continue;
        const inAnswer = new RegExp(`\\b${key}\\b`).test(template.answerExpr);
        const inConstraint = constraints.some((c) => new RegExp(`\\b${key}\\b`).test(c));
        expect(
          inAnswer || inConstraint,
          `${template.id}: param '${key}' is dead (not in text, answerExpr, or constraints)`,
        ).toBe(true);
      }
    }
  });
});

// --- AC-5 / AC-6 / AC-7: 1,000-sample golden sweep -------------------------------------------

describe(
  'AC-5/6/7 — 1,000 seeded generations per template (ARCHITECTURE.md §9.1)',
  { timeout: 60000 },
  () => {
    it('spec(T-014:AC-5) dod(T-014:6) every seed 1…1000 succeeds with in-range params, true constraints, rendered text, and 4 distinct choices matching evaluateNumber', () => {
      const failures: string[] = [];

      for (const template of loadAllTemplates()) {
        for (let seed = 1; seed <= 1000; seed += 1) {
          let question;
          try {
            [question] = generateQuestion({
              templates: [template],
              recentTemplateIds: [],
              rng: createRng(seed),
            });
          } catch (error) {
            failures.push(`${template.id} seed=${seed}: threw ${String(error)}`);
            continue;
          }

          for (const [name, range] of Object.entries(template.params)) {
            const value = question.params[name];
            if (value === undefined) {
              failures.push(`${template.id} seed=${seed}: missing param '${name}'`);
              continue;
            }
            const [lo, hi] = range;
            if (value < lo || value > hi) {
              failures.push(`${template.id} seed=${seed}: param '${name}'=${value} outside [${lo}, ${hi}]`);
            }
          }

          for (const constraint of template.constraints ?? []) {
            if (!evaluatePredicate(constraint, question.params)) {
              failures.push(
                `${template.id} seed=${seed}: constraint "${constraint}" is false for ${JSON.stringify(question.params)}`,
              );
            }
          }

          if (question.text.includes('{') || question.text.includes('}')) {
            failures.push(`${template.id} seed=${seed}: rendered text still has braces: "${question.text}"`);
          }

          if (question.choices.length !== CHOICE_COUNT) {
            failures.push(
              `${template.id} seed=${seed}: choices.length=${question.choices.length}, want ${CHOICE_COUNT}`,
            );
          }

          const values = question.choices.map((c) => c.value);
          if (new Set(values).size !== values.length) {
            failures.push(`${template.id} seed=${seed}: duplicate choices ${JSON.stringify(values)}`);
          }

          const expected = evaluateNumber(template.answerExpr, question.params);
          const actual = question.choices[question.correctIndex]?.value;
          if (actual !== expected) {
            failures.push(
              `${template.id} seed=${seed}: correct choice ${String(actual)} !== evaluateNumber(${template.answerExpr})=${expected}`,
            );
          }
        }
      }

      expect(failures, failures.slice(0, 20).join('\n')).toEqual([]);
    });

    it('spec(T-014:AC-6) dod(T-014:5) every correct answer is a non-negative integer inside the skill bound; every numeric token in text is ≥0 and ≤20', () => {
      const failures: string[] = [];

      for (const template of loadAllTemplates()) {
        const answerMax = answerMaxFor(template.skill);
        for (let seed = 1; seed <= 1000; seed += 1) {
          const [question] = generateQuestion({
            templates: [template],
            recentTemplateIds: [],
            rng: createRng(seed),
          });
          const answer = question.choices[question.correctIndex]?.value;
          if (answer === undefined) {
            failures.push(`${template.id} seed=${seed}: missing correct choice`);
            continue;
          }
          if (!Number.isInteger(answer) || answer < 0 || answer > answerMax) {
            failures.push(
              `${template.id} seed=${seed}: answer ${answer} not in 0…${answerMax} for ${template.skill}`,
            );
          }

          const nums = question.text.match(NUMERIC_TOKEN) ?? [];
          for (const token of nums) {
            const n = Number(token);
            if (!Number.isInteger(n) || n < 0 || n > 20) {
              failures.push(
                `${template.id} seed=${seed}: text token '${token}' not a non-negative integer ≤20 in "${question.text}"`,
              );
            }
          }
        }
      }

      expect(failures, failures.slice(0, 20).join('\n')).toEqual([]);
    });

    it("spec(T-014:AC-7) describeDistractorSources reports 'ladder' on fewer than 250 of 1000 samples per template", () => {
      const failures: string[] = [];

      for (const template of loadAllTemplates()) {
        let ladderHits = 0;
        for (let seed = 1; seed <= 1000; seed += 1) {
          const [question] = generateQuestion({
            templates: [template],
            recentTemplateIds: [],
            rng: createRng(seed),
          });
          const sources = describeDistractorSources(template, question.params);
          if (sources.includes('ladder')) {
            ladderHits += 1;
          }
        }
        if (ladderHits >= 250) {
          failures.push(
            `${template.id}: ladder used on ${ladderHits}/1000 samples (declared distractors collide too often)`,
          );
        }
      }

      expect(failures, failures.join('\n')).toEqual([]);
    });
  },
);

// --- AC-8: hand-computed spot checks ---------------------------------------------------------

describe(
  'AC-8 — hand-computed spot checks pin arithmetic independently of the evaluator',
  { timeout: 60000 },
  () => {
    it('spec(T-014:AC-8) every required template has a literal spot check, and no shipped template is missing one', () => {
      const loadedIds = loadAllTemplates()
        .map((t) => t.id)
        .sort();
      const checkIds = SPOT_CHECKS.map((c) => c.id).sort();
      expect(loadedIds).toEqual(checkIds);
      expect(SPOT_CHECKS).toHaveLength(REQUIRED_TEMPLATES.length);
    });

    it.each([...SPOT_CHECKS])(
      'spec(T-014:AC-8) $id at seed $seed renders "$text" with answer $answer',
      ({ id, seed, text, answer }) => {
        const template = loadAllTemplates().find((t) => t.id === id);
        expect(template, `spot-check target '${id}' missing from content`).toBeDefined();
        if (template === undefined) return;

        const [question] = generateQuestion({
          templates: [template],
          recentTemplateIds: [],
          rng: createRng(seed),
        });

        expect(question.text).toBe(text);
        expect(question.choices[question.correctIndex]?.value).toBe(answer);
      },
    );
  },
);

// --- AC-9: shape variety ---------------------------------------------------------------------

describe('AC-9 — ≥5 distinct text skeletons per skill', { timeout: 60000 }, () => {
  it.each([...SKILL_FILES])(
    'spec(T-014:AC-9) dod(T-014:4) $skill has at least 5 distinct skeletons',
    ({ file, skill }) => {
      const skeletons = new Set(loadSkillFile(file).map((t) => skeletonOf(t.text)));
      expect(
        skeletons.size,
        `${skill} only has ${skeletons.size} skeleton(s): ${[...skeletons].join(' | ')} — eight rewordings of one shape do not count`,
      ).toBeGreaterThanOrEqual(5);
    },
  );
});

// --- AC-10: declared distractor hygiene ------------------------------------------------------

describe(
  'AC-10 — at least three distinct distractor expressions, none equal to answerExpr',
  { timeout: 60000 },
  () => {
    it('spec(T-014:AC-10) every template declares ≥3 distractors, all textually distinct from answerExpr and each other', () => {
      for (const template of loadAllTemplates()) {
        expect(
          template.distractors.length,
          `${template.id} must declare at least 3 distractors`,
        ).toBeGreaterThanOrEqual(3);

        const unique = new Set(template.distractors);
        expect(
          unique.size,
          `${template.id} has duplicate distractor expressions: ${JSON.stringify(template.distractors)}`,
        ).toBe(template.distractors.length);

        for (const distractor of template.distractors) {
          expect(
            distractor,
            `${template.id}: distractor "${distractor}" is textually identical to answerExpr`,
          ).not.toBe(template.answerExpr);
        }
      }
    });
  },
);

// --- AC-11: sampling headroom ----------------------------------------------------------------

describe('AC-11 — constraints are not so tight that rejection sampling exhausts', { timeout: 60000 }, () => {
  it('spec(T-014:AC-11) seeds 1…200 never raise CONSTRAINTS_UNSATISFIED (bound = MAX_PARAM_SAMPLE_ATTEMPTS)', () => {
    expect(MAX_PARAM_SAMPLE_ATTEMPTS).toBeGreaterThan(0);
    const failures: string[] = [];

    for (const template of loadAllTemplates()) {
      for (let seed = 1; seed <= 200; seed += 1) {
        try {
          generateQuestion({
            templates: [template],
            recentTemplateIds: [],
            rng: createRng(seed),
          });
        } catch (error) {
          if (error instanceof QuestionGenerationError && error.code === 'CONSTRAINTS_UNSATISFIED') {
            failures.push(`${template.id} seed=${seed}: ${error.message}`);
          } else {
            failures.push(`${template.id} seed=${seed}: unexpected ${String(error)}`);
          }
        }
      }
    }

    expect(failures, failures.slice(0, 20).join('\n')).toEqual([]);
  });
});

// --- Definition of Done ----------------------------------------------------------------------
// DoD-2/3/7 are orchestrator/process claims on a branch that cannot also edit tickets/ to mark
// them `[process]` (write guard). These tests assert the nearest unit-visible reading.

describe('Definition of Done — traceability and content floors', { timeout: 60000 }, () => {
  it('dod(T-014:1) every acceptance criterion AC-1…AC-11 is cited by at least one spec tag in this file', () => {
    const source = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    for (let n = 1; n <= 11; n += 1) {
      expect(source.includes(`spec(T-014:AC-${n})`), `missing spec(T-014:AC-${n})`).toBe(true);
    }
  });

  it('dod(T-014:2) local gate script is present and executable as a file the orchestrator will run', () => {
    const gate = fileURLToPath(new URL('../../../.tdd-swarm/run-local-gates.sh', import.meta.url));
    expect(existsSync(gate)).toBe(true);
  });

  it('dod(T-014:3) spec-lint script is present so AC↔test coverage stays enforceable', () => {
    const lint = fileURLToPath(new URL('../../../.tdd-swarm/spec-lint.sh', import.meta.url));
    expect(existsSync(lint)).toBe(true);
  });

  it('dod(T-014:4) each skill file meets the ≥8 templates / ≥5 skeletons floor', () => {
    for (const { file, skill } of SKILL_FILES) {
      const templates = loadSkillFile(file);
      expect(templates.length, skill).toBeGreaterThanOrEqual(8);
      expect(new Set(templates.map((t) => skeletonOf(t.text))).size, skill).toBeGreaterThanOrEqual(5);
    }
  });

  it('dod(T-014:5) zero word-problem flags and every spot-check answer sits inside its skill bound', () => {
    for (const template of loadAllTemplates()) {
      expect(template.isWordProblem ?? false).toBe(false);
      expect(template.readAloud ?? false).toBe(false);
    }
    for (const check of SPOT_CHECKS) {
      const template = REQUIRED_TEMPLATES.find((t) => t.id === check.id);
      expect(template).toBeDefined();
      if (template === undefined) continue;
      expect(check.answer).toBeGreaterThanOrEqual(0);
      expect(check.answer).toBeLessThanOrEqual(answerMaxFor(template.skill));
    }
  });

  it('dod(T-014:6) the AC-5 sweep contract is wired (1,000 seeds, four distinct choices)', () => {
    const source = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    expect(source.includes('seed <= 1000')).toBe(true);
    expect(source.includes('spec(T-014:AC-5)')).toBe(true);
    expect(CHOICE_COUNT).toBe(4);
  });

  it('dod(T-014:7) template scope is the three skill JSON files only — no templates/index.ts', () => {
    // Nearest unit-visible reading of the file_scopes claim: the registry belongs to T-019.
    expect(existsSync(`${TEMPLATES_DIR}index.ts`)).toBe(false);
    for (const { file } of SKILL_FILES) {
      // Content is still absent in the RED phase; the path contract is that THESE are the
      // only filenames the suite loads, and index.ts must stay uncreated.
      expect(file.endsWith('.json')).toBe(true);
    }
    expect(SKILL_FILES.map((s) => s.file).sort()).toEqual([
      'add_within_10.json',
      'add_within_20.json',
      'sub_within_20.json',
    ]);
  });
});
