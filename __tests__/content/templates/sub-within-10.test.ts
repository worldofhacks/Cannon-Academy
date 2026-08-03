/**
 * A-069 / D-14 — `sub_within_10` golden suite (K.OA.2 / 1.OA.6): subtraction within 10,
 * non-negative answers, symbolic only.
 *
 * D-14 (`tickets/app/OWNER-RULINGS.md`) adds this skill as Take-Away Bay's K-1 curriculum —
 * `islands.json` `isla_products.curriculum.k_1` — paid by the `dinghy_gun`. This suite is the
 * content contract for `src/content/templates/sub_within_10.json`: schema validity, id hygiene,
 * the A-069 AC-3 golden sweep (30 seeds, zero CONSTRAINTS_UNSATISFIED, zero DISTRACTOR_FAILURE,
 * ladder fill < 25%), the K-1 print-safety sweep (no × / ÷ glyph, and — stricter, because the
 * skill is `symbolicOnly` — no alphabetic prose at all), curriculum bounds, and hand-verified
 * seed-pinned literals for frozen seed-replay.
 */
import { describe, expect, it } from 'vitest';

import { getSkill } from '@content/index';
import type { Template } from '@content/schemas';
import { describeDistractorSources } from '@engine/questions/distractors';
import { evaluateNumber, evaluatePredicate } from '@engine/questions/expr';
import { QuestionGenerationError } from '@engine/questions/types';

import {
  alphabeticWordsInTemplateText,
  generateOne,
  HEADROOM_SEEDS,
  LADDER_CEILING,
  loadTemplates,
  NUMERIC_TOKEN,
  paramIsLive,
  referencedNames,
  skeletonOf,
  SWEEP_SEEDS,
} from './a069.harness';
import type { SpotCheck } from './a069.harness';

const SKILL = 'sub_within_10' as const;
const FILE = 'sub_within_10.json';
const DISPLAY_BOUND = 10;

const EXPECTED_IDS = [
  'sub_within_10_basic',
  'sub_within_10_missing_subtrahend',
  'sub_within_10_missing_minuend',
  'sub_within_10_from_ten',
  'sub_within_10_minus_zero',
  'sub_within_10_doubles',
  'sub_within_10_two_step',
  'sub_within_10_diff_first',
] as const;

/**
 * Hand-verified arithmetic at pinned seeds (frozen seed-replay): e.g. `10 - 9 = 1`,
 * `? - 0 = 5 → 5`, `10 - 1 - 3 = 6`. The literals pin the render path AND the answer.
 */
const SPOT_CHECKS: readonly SpotCheck[] = [
  { id: 'sub_within_10_basic', seed: 1, text: '10 - 9 = ?', answer: 1 },
  { id: 'sub_within_10_basic', seed: 7, text: '7 - 5 = ?', answer: 2 },
  { id: 'sub_within_10_missing_subtrahend', seed: 1, text: '10 - ? = 9', answer: 1 },
  { id: 'sub_within_10_missing_minuend', seed: 1, text: '? - 0 = 5', answer: 5 },
  { id: 'sub_within_10_from_ten', seed: 1, text: '10 - 0 = ?', answer: 10 },
  { id: 'sub_within_10_minus_zero', seed: 1, text: '1 - 0 = ?', answer: 1 },
  { id: 'sub_within_10_doubles', seed: 1, text: '0 - 0 = ?', answer: 0 },
  { id: 'sub_within_10_two_step', seed: 1, text: '10 - 1 - 3 = ?', answer: 6 },
  { id: 'sub_within_10_two_step', seed: 7, text: '6 - 2 - 2 = ?', answer: 2 },
  { id: 'sub_within_10_diff_first', seed: 1, text: '? = 10 - 9', answer: 1 },
];

function templates(): Template[] {
  return loadTemplates(FILE);
}

describe('A-069 — sub_within_10 authoring contract', { timeout: 60000 }, () => {
  it('spec(A-069:AC-3) the file parses with exactly the eight expected template ids, in order', () => {
    const loaded = templates();
    expect(loaded.length).toBeGreaterThanOrEqual(8);
    expect(loaded.map((t) => t.id)).toEqual([...EXPECTED_IDS]);
    expect(new Set(loaded.map((t) => t.id)).size).toBe(loaded.length);
  });

  it('spec(A-069:AC-3) every template belongs to the skill and is prefixed with its id', () => {
    for (const template of templates()) {
      expect(template.skill, template.id).toBe(SKILL);
      expect(template.id.startsWith(`${SKILL}_`), `${template.id} must start with ${SKILL}_`).toBe(true);
    }
  });

  it('spec(A-069:AC-3) every {token} is a declared param and every param is live', () => {
    for (const template of templates()) {
      for (const name of referencedNames(template)) {
        expect(name in template.params, `${template.id}: {${name}} undeclared`).toBe(true);
      }
      for (const name of Object.keys(template.params)) {
        expect(paramIsLive(template, name), `${template.id}: dead param "${name}"`).toBe(true);
      }
    }
  });

  it('spec(A-069:AC-3) shape variety: at least 5 distinct text skeletons', () => {
    const skeletons = new Set(templates().map((t) => skeletonOf(t.text)));
    expect(skeletons.size, [...skeletons].join(' | ')).toBeGreaterThanOrEqual(5);
  });

  it('spec(A-069:AC-3) distractor hygiene: exactly three declared, unique, none equal to answerExpr', () => {
    for (const template of templates()) {
      expect(template.distractors, template.id).toHaveLength(3);
      expect(new Set(template.distractors).size, template.id).toBe(3);
      for (const distractor of template.distractors) {
        expect(distractor, template.id).not.toBe(template.answerExpr);
      }
    }
  });
});

describe('A-069 — sub_within_10 golden sweep', { timeout: 60000 }, () => {
  it('spec(A-069:AC-3) 30-seed sweep: zero throws, valid params/constraints, 4 distinct choices, correct answer', () => {
    const failures: string[] = [];

    for (const template of templates()) {
      for (let seed = 1; seed <= SWEEP_SEEDS; seed += 1) {
        try {
          const question = generateOne(template, seed);
          for (const [name, range] of Object.entries(template.params)) {
            const value = question.params[name];
            if (value === undefined || value < range[0] || value > range[1]) {
              failures.push(`${template.id}@${seed}: param ${name}=${String(value)} out of range`);
            }
          }
          for (const constraint of template.constraints ?? []) {
            if (!evaluatePredicate(constraint, question.params)) {
              failures.push(`${template.id}@${seed}: constraint failed: ${constraint}`);
            }
          }
          if (question.text.includes('{') || question.text.includes('}')) {
            failures.push(`${template.id}@${seed}: unrendered brace in "${question.text}"`);
          }
          const values = question.choices.map((choice) => choice.value);
          if (values.length !== 4 || new Set(values).size !== 4) {
            failures.push(`${template.id}@${seed}: choices [${values.join(',')}]`);
          }
          const correct = question.choices[question.correctIndex]?.value;
          if (correct !== evaluateNumber(template.answerExpr, question.params)) {
            failures.push(`${template.id}@${seed}: wrong correct choice ${String(correct)}`);
          }
        } catch (error) {
          const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
          failures.push(`${template.id}@${seed}: threw ${detail}`);
        }
      }
    }

    expect(failures, `${failures.length} sweep failure(s)`).toEqual([]);
  });

  it('spec(A-069:AC-3) ladder fill stays under 25% of the 30-seed sweep for every template', () => {
    for (const template of templates()) {
      let ladderHits = 0;
      for (let seed = 1; seed <= SWEEP_SEEDS; seed += 1) {
        const question = generateOne(template, seed);
        if (describeDistractorSources(template, question.params).includes('ladder')) ladderHits += 1;
      }
      expect(ladderHits, `${template.id}: ladder ${ladderHits}/${SWEEP_SEEDS}`).toBeLessThan(LADDER_CEILING);
    }
  });

  it('spec(A-069:AC-3) K-1 print safety: no × or ÷ glyph in any authored or rendered prompt', () => {
    for (const template of templates()) {
      expect(template.text, template.id).not.toMatch(/[×÷]/);
      for (let seed = 1; seed <= SWEEP_SEEDS; seed += 1) {
        const question = generateOne(template, seed);
        expect(question.text, `${template.id}@${seed}`).not.toMatch(/[×÷]/);
      }
    }
  });

  it('spec(A-069:AC-3) symbolic only: no prose, no word-problem or read-aloud flags, catalog agrees', () => {
    expect(getSkill(SKILL).symbolicOnly).toBe(true);
    for (const template of templates()) {
      expect(alphabeticWordsInTemplateText(template.text), template.id).toEqual([]);
      expect(template.isWordProblem ?? false, template.id).toBe(false);
      expect(template.readAloud ?? false, template.id).toBe(false);
    }
  });

  it('spec(A-069:AC-3) answers and text numerals are non-negative integers within 10', () => {
    for (const template of templates()) {
      for (let seed = 1; seed <= SWEEP_SEEDS; seed += 1) {
        const question = generateOne(template, seed);
        const answer = question.choices[question.correctIndex]!.value;
        expect(Number.isInteger(answer), `${template.id}@${seed}`).toBe(true);
        expect(answer, `${template.id}@${seed}`).toBeGreaterThanOrEqual(0);
        expect(answer, `${template.id}@${seed}`).toBeLessThanOrEqual(DISPLAY_BOUND);
        for (const token of question.text.match(NUMERIC_TOKEN) ?? []) {
          expect(Number(token), `${template.id}@${seed}: token ${token}`).toBeLessThanOrEqual(DISPLAY_BOUND);
        }
      }
    }
  });

  it('spec(A-069:AC-3) sampling headroom: seeds 1..200 never raise CONSTRAINTS_UNSATISFIED', () => {
    for (const template of templates()) {
      for (let seed = 1; seed <= HEADROOM_SEEDS; seed += 1) {
        try {
          generateOne(template, seed);
        } catch (error) {
          if (error instanceof QuestionGenerationError && error.code === 'CONSTRAINTS_UNSATISFIED') {
            expect.fail(`${template.id}@${seed}: CONSTRAINTS_UNSATISFIED`);
          }
          throw error;
        }
      }
    }
  });

  it.each([...SPOT_CHECKS])(
    'spec(A-069:AC-3) $id at seed $seed renders "$text" with answer $answer',
    ({ id, seed, text, answer }) => {
      const template = templates().find((t) => t.id === id);
      expect(template, `missing template ${id}`).toBeDefined();
      const question = generateOne(template!, seed);
      expect(question.text).toBe(text);
      expect(question.choices[question.correctIndex]?.value).toBe(answer);
    },
  );
});
