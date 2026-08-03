/**
 * A-069 / D-14 — `long_division` golden suite (4.NBT.6 / 5.NBT.6): 2–3-digit ÷ 1-digit with
 * exact (integer) quotients.
 *
 * D-14 (`tickets/app/OWNER-RULINGS.md`) adds this skill as Long-Divide Deep's G4-5 curriculum —
 * `islands.json` `quotient_cove.curriculum.g4_5` — paid by the `stern_chaser`. This suite is the
 * content contract for `src/content/templates/long_division.json`: schema validity, id hygiene,
 * the A-069 AC-3 golden sweep (30 seeds, zero CONSTRAINTS_UNSATISFIED, zero DISTRACTOR_FAILURE,
 * ladder fill < 25%), the ÷ glyph rule (division renders as ÷, never `/` — the g35 div_facts
 * convention, with the one `×` fact-family form allowed exactly as div_facts allows it),
 * exact-quotient integrality, word-problem readability, and hand-verified seed-pinned literals.
 *
 * The `{a}0` / `{a}00` text tokens compose the tens/hundreds dividends at render time; the
 * divisibility constraints (`a % b == 0` and friends) are what make every quotient exact.
 */
import { describe, expect, it } from 'vitest';

import { getSkill } from '@content/index';
import type { Template } from '@content/schemas';
import { describeDistractorSources } from '@engine/questions/distractors';
import { evaluateNumber, evaluatePredicate } from '@engine/questions/expr';
import { QuestionGenerationError } from '@engine/questions/types';

import {
  generateOne,
  HEADROOM_SEEDS,
  LADDER_CEILING,
  loadTemplates,
  NUMERIC_TOKEN,
  paramIsLive,
  referencedNames,
  skeletonOf,
  SWEEP_SEEDS,
  WORD_PROBLEM_MAX_CHARS,
} from './a069.harness';
import type { SpotCheck } from './a069.harness';

const SKILL = 'long_division' as const;
const FILE = 'long_division.json';

/** Dividends stay 2–3-digit, so no rendered numeral or answer exceeds 999. */
const DISPLAY_BOUND = 999;

const EXPECTED_IDS = [
  'long_division_two_by_one',
  'long_division_three_by_one',
  'long_division_quotient_first',
  'long_division_missing_dividend',
  'long_division_tens',
  'long_division_hundreds',
  'long_division_word_coins',
  'long_division_fact_family',
] as const;

/**
 * Hand-verified arithmetic at pinned seeds (frozen seed-replay): 36 ÷ 6 = 6, 102 ÷ 6 = 17,
 * 2 × 57 = 114 (the missing dividend), 900 ÷ 9 = 100, 228 ÷ 3 = 76.
 */
const SPOT_CHECKS: readonly SpotCheck[] = [
  { id: 'long_division_two_by_one', seed: 1, text: '36 ÷ 6 = ?', answer: 6 },
  { id: 'long_division_two_by_one', seed: 7, text: '72 ÷ 6 = ?', answer: 12 },
  { id: 'long_division_three_by_one', seed: 1, text: '102 ÷ 6 = ?', answer: 17 },
  { id: 'long_division_three_by_one', seed: 7, text: '756 ÷ 4 = ?', answer: 189 },
  { id: 'long_division_quotient_first', seed: 1, text: '? = 102 ÷ 6', answer: 17 },
  { id: 'long_division_missing_dividend', seed: 1, text: '? ÷ 2 = 57', answer: 114 },
  { id: 'long_division_tens', seed: 1, text: '90 ÷ 9 = ?', answer: 10 },
  { id: 'long_division_hundreds', seed: 1, text: '900 ÷ 9 = ?', answer: 100 },
  { id: 'long_division_hundreds', seed: 7, text: '400 ÷ 5 = ?', answer: 80 },
  {
    id: 'long_division_word_coins',
    seed: 7,
    text: 'The crew shares 228 gold coins fairly among 3 pirates. How many coins does each pirate get?',
    answer: 76,
  },
  { id: 'long_division_fact_family', seed: 1, text: '6 × ? = 102', answer: 17 },
];

function templates(): Template[] {
  return loadTemplates(FILE);
}

describe('A-069 — long_division authoring contract', { timeout: 60000 }, () => {
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

  it('spec(A-069:AC-3) shape variety: at least 5 distinct skeletons plus a word/symbolic mix', () => {
    const loaded = templates();
    const skeletons = new Set(loaded.map((t) => skeletonOf(t.text)));
    expect(skeletons.size, [...skeletons].join(' | ')).toBeGreaterThanOrEqual(5);
    expect(loaded.some((t) => t.isWordProblem === true)).toBe(true);
    expect(loaded.some((t) => t.isWordProblem !== true)).toBe(true);
    expect(getSkill(SKILL).symbolicOnly, 'word problems require symbolicOnly false').toBe(false);
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

  it('spec(A-069:AC-3) division renders as ÷, never a bare slash; × appears only in the fact family', () => {
    for (const template of templates()) {
      expect(template.text, `${template.id}: no / in display text`).not.toContain('/');
      if (template.id === 'long_division_fact_family') {
        expect(template.text).toContain('×');
      } else if (template.isWordProblem !== true) {
        expect(template.text, template.id).toContain('÷');
      }
    }
  });
});

describe('A-069 — long_division golden sweep', { timeout: 60000 }, () => {
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

  it('spec(A-069:AC-3) every quotient is exact: integer answers, never a fraction, across the sweep', () => {
    for (const template of templates()) {
      for (let seed = 1; seed <= SWEEP_SEEDS; seed += 1) {
        const question = generateOne(template, seed);
        const answer = question.choices[question.correctIndex]!.value;
        expect(Number.isInteger(answer), `${template.id}@${seed}: non-integer answer ${answer}`).toBe(true);
        expect(answer, `${template.id}@${seed}`).toBeGreaterThanOrEqual(0);
        expect(answer, `${template.id}@${seed}`).toBeLessThanOrEqual(DISPLAY_BOUND);
        for (const token of question.text.match(NUMERIC_TOKEN) ?? []) {
          expect(Number(token), `${template.id}@${seed}: token ${token}`).toBeLessThanOrEqual(DISPLAY_BOUND);
        }
      }
    }
  });

  it('spec(A-069:AC-3) word problems stay under 140 chars, end with ?, and ask their whole question', () => {
    for (const template of templates()) {
      if (template.isWordProblem !== true) continue;
      // D-13-adjacent: the closing question names WHAT is asked, never an elliptical tail.
      expect(template.text, template.id).toMatch(/How many [a-z ]+ does each [a-z]+ get\?$/);
      for (let seed = 1; seed <= SWEEP_SEEDS; seed += 1) {
        const question = generateOne(template, seed);
        expect(question.text.length, `${template.id}@${seed}`).toBeLessThanOrEqual(WORD_PROBLEM_MAX_CHARS);
        expect(question.text.endsWith('?'), `${template.id}@${seed}: "${question.text}"`).toBe(true);
        expect((question.text.match(NUMERIC_TOKEN) ?? []).length, `${template.id}@${seed}`).toBeGreaterThan(
          0,
        );
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
