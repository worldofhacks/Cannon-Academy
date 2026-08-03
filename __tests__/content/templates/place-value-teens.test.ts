/**
 * A-069 / D-14 — `place_value_teens` golden suite (1.NBT.2 / 1.NBT.3): teens as ten-and-ones.
 *
 * D-14 (`tickets/app/OWNER-RULINGS.md`) adds this skill as Teen-Ten Harbor's K-1 curriculum —
 * `islands.json` `grandline.curriculum.k_1` — paid by the `teen_lantern`. The ticketed forms are
 * "1 ten and {a} ones", "10 + {a}", and "how many ones in 1{a}" (the `1{a}` token composes the
 * teen numeral at render time): integer answers, **no symbol beyond +**.
 *
 * The skill is `symbolicOnly` (minGrade 1), so no template may carry a word-problem or
 * read-aloud flag; the prose these forms need is a CLOSED place-value operator vocabulary,
 * pinned here the same way T-015 allowlists "Which is greater" for `place_value_compare`.
 * Everything else matches the sibling suites: the A-069 AC-3 golden sweep (30 seeds, zero
 * CONSTRAINTS_UNSATISFIED, zero DISTRACTOR_FAILURE, ladder fill < 25%), the K-1 print-safety
 * sweep (no × / ÷), curriculum bounds, and hand-verified seed-pinned literals.
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

const SKILL = 'place_value_teens' as const;
const FILE = 'place_value_teens.json';

/** Teens live in 0..19; every rendered numeral (10, a teen, or a ones digit) fits under it. */
const DISPLAY_BOUND = 19;

/**
 * The closed place-value vocabulary the ticketed forms need — operator words, not prose. A new
 * word in this skill's templates must be added HERE deliberately, or the suite fails.
 */
const PLACE_VALUE_WORDS = new Set(['ten', 'tens', 'ones', 'and', 'how', 'many', 'are', 'in']);

const EXPECTED_IDS = [
  'place_value_teens_ten_and_ones',
  'place_value_teens_ten_plus',
  'place_value_teens_ones_in_teen',
  'place_value_teens_tens_in_teen',
  'place_value_teens_make_teen',
  'place_value_teens_ten_part',
  'place_value_teens_ones_and_ten',
  'place_value_teens_sum_first',
] as const;

/**
 * Hand-verified arithmetic at pinned seeds (frozen seed-replay): 1 ten and 2 ones is 12; 11 has
 * 1 one and 1 ten; `11 = 10 + ?` → 1; `11 = ? + 1` → 10.
 */
const SPOT_CHECKS: readonly SpotCheck[] = [
  { id: 'place_value_teens_ten_and_ones', seed: 1, text: '1 ten and 2 ones = ?', answer: 12 },
  { id: 'place_value_teens_ten_plus', seed: 1, text: '10 + 0 = ?', answer: 10 },
  { id: 'place_value_teens_ones_in_teen', seed: 1, text: 'How many ones are in 11?', answer: 1 },
  { id: 'place_value_teens_tens_in_teen', seed: 1, text: 'How many tens are in 11?', answer: 1 },
  { id: 'place_value_teens_make_teen', seed: 1, text: '11 = 10 + ?', answer: 1 },
  { id: 'place_value_teens_ten_part', seed: 1, text: '11 = ? + 1', answer: 10 },
  { id: 'place_value_teens_ones_and_ten', seed: 1, text: '2 ones and 1 ten = ?', answer: 12 },
  { id: 'place_value_teens_sum_first', seed: 1, text: '? = 10 + 1', answer: 11 },
];

function templates(): Template[] {
  return loadTemplates(FILE);
}

describe('A-069 — place_value_teens authoring contract', { timeout: 60000 }, () => {
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

  it('spec(A-069:AC-3) no symbol beyond + : the ticketed forms never print -, ×, ÷, or /', () => {
    for (const template of templates()) {
      expect(template.text, template.id).not.toMatch(/[-−×÷/*]/);
    }
  });

  it('spec(A-069:AC-3) prose stays inside the closed place-value vocabulary; flags stay symbolic', () => {
    expect(getSkill(SKILL).symbolicOnly).toBe(true);
    for (const template of templates()) {
      const offWords = alphabeticWordsInTemplateText(template.text).filter(
        (word) => !PLACE_VALUE_WORDS.has(word.toLowerCase()),
      );
      expect(offWords, `${template.id}: words outside the closed vocabulary`).toEqual([]);
      expect(template.isWordProblem ?? false, template.id).toBe(false);
      expect(template.readAloud ?? false, template.id).toBe(false);
    }
  });

  it('spec(A-069:AC-3) every question form asks its whole question (D-13-adjacent clarity)', () => {
    // A "How many …" form must name WHAT is being counted and WHERE — never an elliptical tail.
    for (const template of templates()) {
      if (!template.text.toLowerCase().startsWith('how many')) continue;
      expect(template.text, template.id).toMatch(/^How many (ones|tens) are in 1\{a\}\?$/);
    }
  });
});

describe('A-069 — place_value_teens golden sweep', { timeout: 60000 }, () => {
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

  it('spec(A-069:AC-3) answers and text numerals are non-negative integers within the teen bound', () => {
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
