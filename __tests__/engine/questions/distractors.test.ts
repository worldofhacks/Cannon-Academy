/**
 * T-005 — `src/engine/questions/distractors.ts`: distractor construction, collision rejection,
 * the plausibility rule, and the deterministic near-miss fill ladder.
 *
 * Why this suite is written the way it is:
 *
 *  - **Both directions of distinctness.** A suite that only checks "no distractor equals the
 *    answer" is passed by an implementation emitting three identical wrong answers, so every
 *    fixture asserts pairwise distinctness AND the four-way `CHOICE_COUNT` invariant.
 *  - **Plausibility is two-sided** (LESSONS.md L-005). Each boundary is probed on both sides:
 *    the near-miss ceiling, the ratio ceiling, and the ratio *floor* — a one-sided assertion is
 *    satisfied by the worst value on the other side.
 *  - **Dimensions, not cases** (LESSONS.md L-017). `ANSWER_SWEEP` varies answer magnitude
 *    (0 · 1 · 2 · 3 · 7 · 100 · 12,345 · 1e12 · 1e15), sign, and integrality, crossed with three
 *    shapes of declared-distractor list. A defect visible only at one magnitude is exactly what
 *    a single-value fixture misses.
 *  - **Thresholds come from `@engine/tuning`, never from literals** where the criterion is about
 *    the threshold (AC-6 explicitly forbids baking an arithmetic offset into its assertion).
 *    Hand-computed expectations that *depend* on the frozen value of a constant assert that
 *    dependency explicitly first (see AC-13), so the test cannot silently drift.
 *  - **Purity is proven behaviourally, not by source scan** (LESSONS.md L-013): AC-10 poisons
 *    `Math.random` before calling and asserts the module still produces its answer.
 *
 * Assumed API surface, taken from the ticket's AC text and Definition of Done:
 *
 *     buildDistractors(template, params)          -> readonly number[]            (length 3)
 *     describeDistractorSources(template, params) -> readonly ('declared'|'ladder')[]
 *     isPlausibleDistractor(candidate, answer)    -> boolean
 *
 * `buildDistractors` derives the answer itself from `template.answerExpr` — AC-13 speaks of "a
 * template whose `answerExpr` evaluates to 0 for the sampled params", and AC-10 pins the input
 * as "the same `(template, params)` pair". There is no `Rng` parameter (Definition of Done).
 */
import { describe, expect, it } from 'vitest';

import { templateSchema } from '@content/schemas';
import type { SkillId, Template } from '@content/schemas';
import { ExprError, evaluateNumber } from '@engine/questions/expr';
import { QuestionGenerationError } from '@engine/questions/types';
import {
  CHOICE_COUNT,
  DISTRACTOR_ABS_FLOOR,
  DISTRACTOR_MAX_RATIO,
  MAX_DISTRACTOR_ATTEMPTS,
} from '@engine/tuning';
import {
  buildDistractors,
  describeDistractorSources,
  isPlausibleDistractor,
} from '@engine/questions/distractors';

// =============================================================================================
// Helpers
// =============================================================================================

/** Compile-time exact-type equality (invariant in both directions, unlike `extends`). */
type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** How many distractors a four-choice question needs. Derived, never a literal. */
const NEEDED = CHOICE_COUNT - 1;

type Params = Readonly<Record<string, number>>;

/**
 * Builds a schema-valid `Template`. Going through `templateSchema.parse` rather than a cast
 * means every fixture is a template the content pipeline would actually accept — in particular
 * it carries exactly three distractors (T-026's `.length(3)`), so no fixture can silently drift
 * away from the four-choice contract this module exists to uphold.
 */
function makeTemplate(options: {
  readonly id: string;
  readonly skill?: SkillId;
  readonly answerExpr: string;
  readonly distractors: readonly [string, string, string];
  readonly params: Params;
}): Template {
  const ranges: Record<string, [number, number]> = {};
  for (const [name, value] of Object.entries(options.params)) {
    ranges[name] = [value, value];
  }

  return templateSchema.parse({
    id: options.id,
    skill: options.skill ?? 'add_within_10',
    text: 'fixture',
    params: ranges,
    answerExpr: options.answerExpr,
    distractors: [...options.distractors],
  });
}

/**
 * The plausibility rule, transcribed independently from the ticket's four numbered clauses.
 *
 * This exists so the suite never certifies a returned value using only the module's own
 * `isPlausibleDistractor` — a function that unconditionally returns `true` would satisfy that
 * (LESSONS.md L-012: an assertion must not be checkable by the thing it is checking). Every
 * sweep case asserts the returned values against *this* predicate and asserts that the module's
 * exported predicate agrees with it.
 */
function satisfiesPlausibilityRule(candidate: number, answer: number): boolean {
  // 1. finite
  if (!Number.isFinite(candidate)) return false;
  // 2. same numeric type as the answer
  if (Number.isInteger(candidate) !== Number.isInteger(answer)) return false;
  // 3. no negative decoys when the answer is non-negative
  if (answer >= 0 && candidate < 0) return false;
  // 4a. near miss
  if (Math.abs(candidate - answer) <= DISTRACTOR_ABS_FLOOR) return true;
  // 4b. same order of magnitude — undefined at a zero answer, so that branch is skipped
  if (answer === 0) return false;
  return (
    Math.abs(candidate) <= Math.abs(answer) * DISTRACTOR_MAX_RATIO &&
    Math.abs(candidate) >= Math.abs(answer) / DISTRACTOR_MAX_RATIO
  );
}

/**
 * The near-miss fill ladder exactly as the ticket defines it: nine rungs, this fixed order.
 * `x + 1, x - 1, x + 2, x - 2, x + 10, x - 10, x * 2, x + 3, x - 3`.
 */
function ladderRungs(answer: number): readonly number[] {
  return [
    answer + 1,
    answer - 1,
    answer + 2,
    answer - 2,
    answer + 10,
    answer - 10,
    answer * 2,
    answer + 3,
    answer - 3,
  ];
}

/** The ladder values that are legal for this answer, in ladder order (first plausible wins). */
function legalLadderValues(answer: number): readonly number[] {
  const seen: number[] = [];
  for (const rung of ladderRungs(answer)) {
    if (rung === answer) continue;
    if (seen.includes(rung)) continue;
    if (!satisfiesPlausibilityRule(rung, answer)) continue;
    seen.push(rung);
  }
  return seen;
}

/**
 * Every invariant that must hold for *any* successful call, asserted together so no sweep case
 * can accidentally check a weaker set than another. Returns the result for further assertions.
 */
function expectValidDistractorSet(template: Template, params: Params): readonly number[] {
  const answer = evaluateNumber(template.answerExpr, params);
  const result = buildDistractors(template, params);

  expect(Array.isArray(result)).toBe(true);
  expect(result).toHaveLength(NEEDED);

  result.forEach((value: number, index: number) => {
    expect(typeof value, `distractor ${index} is a number`).toBe('number');
    expect(Number.isNaN(value), `distractor ${index} (${value}) is NaN`).toBe(false);
    expect(Number.isFinite(value), `distractor ${index} (${value}) is not finite`).toBe(true);
    // `===` rather than `not.toBe` so that -0 is caught as a collision with a 0 answer.
    expect(value === answer, `distractor ${index} (${value}) equals the answer`).toBe(false);
    expect(
      satisfiesPlausibilityRule(value, answer),
      `distractor ${index} (${value}) violates the plausibility rule against ${answer}`,
    ).toBe(true);
    expect(
      isPlausibleDistractor(value, answer),
      `isPlausibleDistractor(${value}, ${answer}) disagrees with the rule`,
    ).toBe(true);
  });

  // Both directions of distinctness: pairwise among distractors, and against the answer.
  expect(new Set(result).size, 'distractors are not pairwise distinct').toBe(NEEDED);
  expect(new Set([answer, ...result]).size, 'the four choices are not pairwise distinct').toBe(CHOICE_COUNT);

  return result;
}

/** Asserts the source labels are length-3, well-typed, and index-aligned with the values. */
function expectSourcesAligned(template: Template, params: Params): readonly string[] {
  const answer = evaluateNumber(template.answerExpr, params);
  const values = buildDistractors(template, params);
  const sources = describeDistractorSources(template, params);

  expect(Array.isArray(sources)).toBe(true);
  expect(sources).toHaveLength(NEEDED);

  const declaredValues = template.distractors.map((expr) => evaluateNumber(expr, params));
  const rungs = ladderRungs(answer);

  sources.forEach((source: string, index: number) => {
    expect(['declared', 'ladder']).toContain(source);
    const value = values[index] as number;
    if (source === 'declared') {
      expect(declaredValues, `value ${value} labelled 'declared' is not a declared value`).toContain(value);
    } else {
      expect(rungs, `value ${value} labelled 'ladder' is not a ladder rung`).toContain(value);
    }
  });

  return sources;
}

/** Extracts a thrown value without letting a non-throwing call pass silently. */
function captureThrow(run: () => unknown): unknown {
  let thrown: unknown;
  let threw = false;
  try {
    run();
  } catch (error) {
    threw = true;
    thrown = error;
  }
  expect(threw, 'expected the call to throw, but it returned').toBe(true);
  return thrown;
}

// =============================================================================================
// AC-1 — the happy path, in declared order
// =============================================================================================

const AC1_PARAMS: Params = { a: 3, b: 4 };
const ac1Template = makeTemplate({
  id: 'add_within_10__a_plus_b',
  answerExpr: 'a + b',
  distractors: ['a + b + 1', 'a + b - 1', 'a * b'],
  params: AC1_PARAMS,
});

describe('buildDistractors — declared distractors, no collisions (AC-1)', () => {
  it('spec(T-005:AC-1) returns exactly [8, 6, 12] for the ticket fixture', () => {
    expect(buildDistractors(ac1Template, AC1_PARAMS)).toEqual([8, 6, 12]);
  });

  it('spec(T-005:AC-1) returns exactly CHOICE_COUNT - 1 values', () => {
    expect(buildDistractors(ac1Template, AC1_PARAMS)).toHaveLength(NEEDED);
  });

  it('spec(T-005:AC-1) preserves the template order rather than any sorted order', () => {
    const result = buildDistractors(ac1Template, AC1_PARAMS);

    // [8, 6, 12] is neither ascending nor descending, so an implementation that sorts —
    // or that shuffles, which is T-007's job and not this module's — cannot pass this.
    expect([...result]).not.toEqual([...result].sort((x, y) => x - y));
    expect([...result]).not.toEqual([...result].sort((x, y) => y - x));
  });

  it('spec(T-005:AC-1) holds every general invariant on the clean case', () => {
    expectValidDistractorSet(ac1Template, AC1_PARAMS);
  });

  it('spec(T-005:AC-1) keeps a same-magnitude declared distractor (12 against 7) rather than replacing it', () => {
    // 12/7 is inside DISTRACTOR_MAX_RATIO, so the ratio branch must admit it: an
    // implementation applying only the near-miss branch would drop it (|12 - 7| = 5 > 3).
    expect(buildDistractors(ac1Template, AC1_PARAMS)).toContain(12);
    expect(describeDistractorSources(ac1Template, AC1_PARAMS)).toEqual(['declared', 'declared', 'declared']);
  });
});

// =============================================================================================
// AC-2 — a candidate equal to the answer
// =============================================================================================

const AC2_PARAMS: Params = { a: 2, b: 2 };
const ac2Template = makeTemplate({
  id: 'add_within_10__collides_with_answer',
  answerExpr: 'a + b',
  distractors: ['a + b + 1', 'a + b - 1', 'a * b'],
  params: AC2_PARAMS,
});

describe('buildDistractors — a candidate equal to the answer (AC-2)', () => {
  it('spec(T-005:AC-2) drops "a * b" when a = b = 2 makes it equal the answer', () => {
    // answer 4; declared -> 5, 3, 4. The colliding 4 is replaced from the ladder by 4 + 2 = 6
    // (4 + 1 and 4 - 1 are already taken by the kept declared values).
    expect(buildDistractors(ac2Template, AC2_PARAMS)).toEqual([5, 3, 6]);
  });

  it('spec(T-005:AC-2) still returns exactly 3 values after the rejection', () => {
    expect(buildDistractors(ac2Template, AC2_PARAMS)).toHaveLength(NEEDED);
  });

  it('spec(T-005:AC-2) returns no value equal to the answer', () => {
    const answer = evaluateNumber(ac2Template.answerExpr, AC2_PARAMS);

    expect(answer).toBe(4);
    for (const value of buildDistractors(ac2Template, AC2_PARAMS)) {
      expect(value === answer).toBe(false);
    }
  });

  it('spec(T-005:AC-2) rejects a collision that sits at the FRONT of the declared list too', () => {
    const template = makeTemplate({
      id: 'add_within_10__collision_first',
      answerExpr: 'a + b',
      distractors: ['a * b', 'a + b + 1', 'a + b - 1'],
      params: AC2_PARAMS,
    });

    const result = expectValidDistractorSet(template, AC2_PARAMS);

    expect(result).toContain(5);
    expect(result).toContain(3);
    expect(result).not.toContain(4);
  });

  it('spec(T-005:AC-2) holds every general invariant when a declared value collides', () => {
    expectValidDistractorSet(ac2Template, AC2_PARAMS);
  });
});

// =============================================================================================
// AC-3 — two declared distractors equal to each other
// =============================================================================================

const AC3_PARAMS: Params = { a: 3, b: 4 };
const ac3Template = makeTemplate({
  id: 'add_within_10__duplicate_declared',
  answerExpr: 'a + b',
  // "a + b + 1" and "b + a + 1" are different expressions with the same value for every draw.
  distractors: ['a + b + 1', 'a * b', 'b + a + 1'],
  params: AC3_PARAMS,
});

describe('buildDistractors — two declared distractors with the same value (AC-3)', () => {
  it('spec(T-005:AC-3) returns pairwise distinct values', () => {
    const result = buildDistractors(ac3Template, AC3_PARAMS);

    expect(new Set(result).size).toBe(NEEDED);
  });

  it('spec(T-005:AC-3) keeps the first occurrence and fills the duplicate slot from the ladder', () => {
    // answer 7; declared -> 8, 12, 8. The second 8 is a duplicate, replaced by 7 - 1 = 6
    // (7 + 1 = 8 is already taken).
    expect(buildDistractors(ac3Template, AC3_PARAMS)).toEqual([8, 12, 6]);
    expect(describeDistractorSources(ac3Template, AC3_PARAMS)).toEqual(['declared', 'declared', 'ladder']);
  });

  it('spec(T-005:AC-3) stays distinct when the duplicate is in the MIDDLE of the declared list', () => {
    // Order is deliberately not asserted here: the ticket does not say whether a fill lands in
    // the rejected slot or is appended, and both readings satisfy every stated criterion.
    const template = makeTemplate({
      id: 'add_within_10__duplicate_middle',
      answerExpr: 'a + b',
      distractors: ['a + b + 1', 'b + a + 1', 'a * b'],
      params: AC3_PARAMS,
    });

    const result = expectValidDistractorSet(template, AC3_PARAMS);

    expect(result).toContain(8);
    expect(result).toContain(12);
  });

  it('spec(T-005:AC-3) stays distinct when ALL THREE declared distractors share one value', () => {
    const template = makeTemplate({
      id: 'add_within_10__triplicate_declared',
      answerExpr: 'a + b',
      distractors: ['a + b + 1', 'b + a + 1', '1 + a + b'],
      params: AC3_PARAMS,
    });

    // A module that only checked "not equal to the answer" would emit [8, 8, 8] here.
    const result = expectValidDistractorSet(template, AC3_PARAMS);

    expect(result.filter((value) => value === 8)).toHaveLength(1);
  });

  it('spec(T-005:AC-3) holds every general invariant when declared values duplicate', () => {
    expectValidDistractorSet(ac3Template, AC3_PARAMS);
  });
});

// =============================================================================================
// AC-4 — the four-way distinctness invariant
// =============================================================================================

interface SweepCase {
  readonly name: string;
  readonly skill: SkillId;
  readonly answerExpr: string;
  readonly params: Params;
  readonly answer: number;
}

/**
 * The answer-side dimension sweep (LESSONS.md L-017): magnitude from 0 through 1e15, both
 * signs, and both integrality classes — including the two answers with ZERO headroom
 * (0 and 0.5, each of which has exactly three legal ladder values and no more).
 */
const ANSWER_SWEEP: readonly SweepCase[] = [
  { name: 'zero', skill: 'sub_within_20', answerExpr: 'a - b', params: { a: 5, b: 5 }, answer: 0 },
  { name: 'one', skill: 'sub_within_20', answerExpr: 'a - b', params: { a: 6, b: 5 }, answer: 1 },
  { name: 'two', skill: 'sub_within_20', answerExpr: 'a - b', params: { a: 7, b: 5 }, answer: 2 },
  {
    name: 'exactly the abs floor',
    skill: 'sub_within_20',
    answerExpr: 'a - b',
    params: { a: 8, b: 5 },
    answer: 3,
  },
  { name: 'small', skill: 'add_within_10', answerExpr: 'a + b', params: { a: 3, b: 4 }, answer: 7 },
  {
    name: 'hundred',
    skill: 'mult_facts',
    answerExpr: 'a * b',
    params: { a: 10, b: 10 },
    answer: 100,
  },
  {
    name: 'five digits',
    skill: 'multi_digit_order_ops',
    answerExpr: 'a * b',
    params: { a: 5, b: 2469 },
    answer: 12345,
  },
  {
    name: 'very large (1e12)',
    skill: 'multi_digit_order_ops',
    answerExpr: 'a * b',
    params: { a: 1000000, b: 1000000 },
    answer: 1e12,
  },
  {
    name: 'very large (1e15)',
    skill: 'multi_digit_order_ops',
    answerExpr: 'a * b',
    params: { a: 1000000, b: 1000000000 },
    answer: 1e15,
  },
  {
    name: 'negative one',
    skill: 'sub_within_20',
    answerExpr: 'a - b',
    params: { a: 5, b: 6 },
    answer: -1,
  },
  {
    name: 'negative small',
    skill: 'sub_within_20',
    answerExpr: 'a - b',
    params: { a: 2, b: 7 },
    answer: -5,
  },
  {
    name: 'negative large',
    skill: 'multi_digit_order_ops',
    answerExpr: 'a - b',
    params: { a: 0, b: 1000000 },
    answer: -1000000,
  },
  {
    name: 'non-integer (3.5)',
    skill: 'fractions_int',
    answerExpr: 'a / b',
    params: { a: 7, b: 2 },
    answer: 3.5,
  },
  {
    name: 'non-integer near zero (0.5)',
    skill: 'fractions_int',
    answerExpr: 'a / b',
    params: { a: 1, b: 2 },
    answer: 0.5,
  },
  {
    name: 'non-integer near zero (0.25)',
    skill: 'fractions_int',
    answerExpr: 'a / b',
    params: { a: 1, b: 4 },
    answer: 0.25,
  },
  {
    name: 'non-integer negative (-2.5)',
    skill: 'fractions_int',
    answerExpr: '(a - b) / c',
    params: { a: 0, b: 5, c: 2 },
    answer: -2.5,
  },
  {
    name: 'non-integer large (1234.5)',
    skill: 'fractions_int',
    answerExpr: 'a / b',
    params: { a: 2469, b: 2 },
    answer: 1234.5,
  },
];

/**
 * The declared-list dimension, crossed with every answer above.
 *
 * `mixed` is the interesting one: index 0 survives, index 1 collides with the answer and index 2
 * is wildly out of magnitude, so exactly one declared value and two ladder fills are expected —
 * and because the two rejects are the LAST two entries, the expected order is the same under
 * either reading of where a fill lands.
 */
const DECLARED_SHAPES: readonly {
  readonly name: string;
  readonly of: (answerExpr: string) => readonly [string, string, string];
}[] = [
  {
    name: 'all colliding with the answer',
    of: (e) => [e, `(${e}) + 0`, `(${e}) * 1`],
  },
  {
    name: 'near misses',
    of: (e) => [`(${e}) + 1`, `(${e}) - 1`, `(${e}) + 2`],
  },
  {
    name: 'mixed: one usable, one colliding, one wildly out of magnitude',
    of: (e) => [`(${e}) + 1`, e, `(${e}) * 1000 + 7`],
  },
];

describe('buildDistractors — four-way distinctness across the answer sweep (AC-4)', () => {
  for (const sweep of ANSWER_SWEEP) {
    for (const shape of DECLARED_SHAPES) {
      it(`spec(T-005:AC-4) answer ${sweep.name} (${sweep.answer}) with declared ${shape.name}`, () => {
        const template = makeTemplate({
          id: `sweep__${sweep.name}`,
          skill: sweep.skill,
          answerExpr: sweep.answerExpr,
          distractors: shape.of(sweep.answerExpr),
          params: sweep.params,
        });

        // Guards the sweep table itself: a mistyped expected answer would otherwise make every
        // downstream assertion in this case measure something other than what it claims.
        expect(evaluateNumber(sweep.answerExpr, sweep.params)).toBe(sweep.answer);

        const result = expectValidDistractorSet(template, sweep.params);
        expectSourcesAligned(template, sweep.params);

        // Restated locally so this criterion is asserted in its own right, not only inside the
        // shared helper: prepending the answer must give CHOICE_COUNT distinct values.
        expect(new Set([sweep.answer, ...result]).size).toBe(CHOICE_COUNT);
      });
    }
  }

  it('spec(T-005:AC-4) the sweep actually varies magnitude, sign and integrality', () => {
    // LESSONS.md L-017: a passing assertion over an unswept domain is no evidence at all.
    const answers = ANSWER_SWEEP.map((sweep) => sweep.answer);

    expect(answers).toContain(0);
    expect(answers.some((x) => x < 0)).toBe(true);
    expect(answers.some((x) => x > 0)).toBe(true);
    expect(answers.some((x) => !Number.isInteger(x))).toBe(true);
    expect(answers.some((x) => !Number.isInteger(x) && x < 0)).toBe(true);
    expect(Math.max(...answers.map((x) => Math.abs(x)))).toBeGreaterThanOrEqual(1e15);
  });
});

// =============================================================================================
// AC-5 — an implausible declared distractor is replaced
// =============================================================================================

const AC5_PARAMS: Params = { a: 3, b: 4 };
const ac5Template = makeTemplate({
  id: 'add_within_10__wild_distractor',
  answerExpr: 'a + b',
  distractors: ['a + b + 1', 'a + b - 1', 'a * b * 1000'],
  params: AC5_PARAMS,
});

describe('buildDistractors — implausible declared distractors (AC-5)', () => {
  it('spec(T-005:AC-5) excludes 12000 offered against an answer of 7', () => {
    expect(evaluateNumber('a * b * 1000', AC5_PARAMS)).toBe(12000);
    expect(buildDistractors(ac5Template, AC5_PARAMS)).not.toContain(12000);
  });

  it('spec(T-005:AC-5) replaces it from the fill ladder', () => {
    // answer 7; 8 and 6 survive from the declared list, so the first free ladder rung is 7 + 2.
    expect(buildDistractors(ac5Template, AC5_PARAMS)).toEqual([8, 6, 9]);
    expect(describeDistractorSources(ac5Template, AC5_PARAMS)).toEqual(['declared', 'declared', 'ladder']);
  });

  it('spec(T-005:AC-5) every returned value satisfies the plausibility rule', () => {
    expectValidDistractorSet(ac5Template, AC5_PARAMS);
  });

  it('spec(T-005:AC-5) rejects a declared distractor that is too SMALL, not only too large', () => {
    // L-005: a one-sided check on the ratio branch is passed by the worst value on the other
    // side. Answer 100; 1 is 1/100 of it, far below |x| / DISTRACTOR_MAX_RATIO.
    const template = makeTemplate({
      id: 'mult_facts__too_small_distractor',
      skill: 'mult_facts',
      answerExpr: 'a * b',
      distractors: ['a * b + 1', 'a * b - 1', 'a / b'],
      params: { a: 10, b: 10 },
    });

    expect(evaluateNumber('a / b', { a: 10, b: 10 })).toBe(1);

    const result = expectValidDistractorSet(template, { a: 10, b: 10 });

    expect(result).not.toContain(1);
    expect(result).toEqual([101, 99, 102]);
  });

  it('spec(T-005:AC-5) keeps a declared distractor sitting exactly ON the ratio ceiling', () => {
    // The counterweight to the two rejections above: the bound is inclusive, so a module that
    // rejects everything outside the near-miss window would fail here.
    const params: Params = { a: 10, b: 10 };
    const template = makeTemplate({
      id: 'mult_facts__on_the_ratio_ceiling',
      skill: 'mult_facts',
      answerExpr: 'a * b',
      distractors: ['a * b * 2', 'a * b + 1', 'a * b - 1'],
      params,
    });

    expect(DISTRACTOR_MAX_RATIO).toBe(2);
    expect(buildDistractors(template, params)).toEqual([200, 101, 99]);
    expect(describeDistractorSources(template, params)).toEqual(['declared', 'declared', 'declared']);
  });
});

// =============================================================================================
// AC-6 — a zero answer
// =============================================================================================

const ZERO_PARAMS: Params = { a: 5, b: 5 };
const zeroTemplate = makeTemplate({
  id: 'sub_within_20__a_minus_b',
  skill: 'sub_within_20',
  answerExpr: 'a - b',
  distractors: ['a - b + 1', 'a - b - 1', 'a - b + 2'],
  params: ZERO_PARAMS,
});

describe('buildDistractors — a zero answer (AC-6)', () => {
  it('spec(T-005:AC-6) the fixture really does produce a zero answer', () => {
    expect(evaluateNumber(zeroTemplate.answerExpr, ZERO_PARAMS)).toBe(0);
  });

  it('spec(T-005:AC-6) returns no negative value', () => {
    for (const value of buildDistractors(zeroTemplate, ZERO_PARAMS)) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it('spec(T-005:AC-6) every returned value satisfies 1 <= d <= DISTRACTOR_ABS_FLOOR', () => {
    // Asserted against the constant itself, with no arithmetic offset baked in (AC-6).
    for (const value of buildDistractors(zeroTemplate, ZERO_PARAMS)) {
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(DISTRACTOR_ABS_FLOOR);
    }
  });

  it('spec(T-005:AC-6) returns only finite, non-NaN values at a zero answer', () => {
    // The observable consequence of skipping the magnitude-ratio branch rather than dividing
    // through by |x|: nothing in the output may be NaN or Infinity.
    for (const value of buildDistractors(zeroTemplate, ZERO_PARAMS)) {
      expect(Number.isNaN(value)).toBe(false);
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('spec(T-005:AC-6) isPlausibleDistractor does not divide through by a zero answer', () => {
    // A ratio branch written as |x| / |d| <= RATIO evaluates to 0 <= RATIO at x = 0 and would
    // wave through arbitrarily large decoys. The near-miss window is the ONLY branch at x = 0.
    expect(isPlausibleDistractor(DISTRACTOR_ABS_FLOOR, 0)).toBe(true);
    expect(isPlausibleDistractor(DISTRACTOR_ABS_FLOOR + 1, 0)).toBe(false);
    expect(isPlausibleDistractor(10, 0)).toBe(false);
    expect(isPlausibleDistractor(1000, 0)).toBe(false);
  });

  it('spec(T-005:AC-6) rejects negative candidates against a zero answer', () => {
    expect(isPlausibleDistractor(-1, 0)).toBe(false);
    expect(isPlausibleDistractor(-DISTRACTOR_ABS_FLOOR, 0)).toBe(false);
  });

  it('spec(T-005:AC-6) holds every general invariant at a zero answer', () => {
    expectValidDistractorSet(zeroTemplate, ZERO_PARAMS);
  });
});

// =============================================================================================
// AC-7 — the fill ladder engaged in full
// =============================================================================================

const AC7_PARAMS: Params = { a: 3, b: 4 };
const ac7Template = makeTemplate({
  id: 'add_within_10__all_declared_rejected',
  answerExpr: 'a + b',
  // 7 (collides), 7 (collides), 12000 (implausible) — nothing declared survives.
  distractors: ['a + b', 'b + a', 'a * b * 1000'],
  params: AC7_PARAMS,
});

describe('buildDistractors — every declared distractor rejected (AC-7)', () => {
  it('spec(T-005:AC-7) returns 3 values drawn from the ladder in ladder order', () => {
    // answer 7 -> x+1, x-1, x+2 are the first three legal rungs.
    expect(buildDistractors(ac7Template, AC7_PARAMS)).toEqual([8, 6, 9]);
  });

  it('spec(T-005:AC-7) labels all three as ladder fills', () => {
    expect(describeDistractorSources(ac7Template, AC7_PARAMS)).toEqual(['ladder', 'ladder', 'ladder']);
  });

  it('spec(T-005:AC-7) the returned order is the ladder order, not a sorted or reversed one', () => {
    const result = buildDistractors(ac7Template, AC7_PARAMS);

    expect([...result]).not.toEqual([...result].sort((x, y) => x - y));
    expect([...result]).not.toEqual([...result].sort((x, y) => y - x));
    // x + 1 must precede x - 1: the ladder is ordered, not a set.
    expect(result.indexOf(8)).toBeLessThan(result.indexOf(6));
  });

  it('spec(T-005:AC-7) all three ladder values are distinct and plausible', () => {
    expectValidDistractorSet(ac7Template, AC7_PARAMS);
  });

  it('spec(T-005:AC-7) never emits a value that is not one of the nine ladder rungs', () => {
    // Structural pin on the ladder's definition: an implementation that invented its own
    // offsets (x + 5, x * 3, ...) would satisfy every distinctness and plausibility check but
    // fail here, and would break the reproducible-replay guarantee T-019 relies on.
    for (const sweep of ANSWER_SWEEP) {
      const template = makeTemplate({
        id: `ladder_only__${sweep.name}`,
        skill: sweep.skill,
        answerExpr: sweep.answerExpr,
        distractors: [sweep.answerExpr, `(${sweep.answerExpr}) + 0`, `(${sweep.answerExpr}) * 1`] as const,
        params: sweep.params,
      });

      const result = buildDistractors(template, sweep.params);
      const rungs = ladderRungs(sweep.answer);

      for (const value of result) {
        expect(rungs, `answer ${sweep.answer}: ${value} is not a ladder rung`).toContain(value);
      }
      // And they must be the FIRST legal rungs, in order — not an arbitrary subset.
      expect(result, `answer ${sweep.answer}`).toEqual(legalLadderValues(sweep.answer).slice(0, NEEDED));
    }
  });

  it('spec(T-005:AC-7) reaches the x * 2 rung when the earlier rungs are unavailable', () => {
    // answer 0.25: x+1 and x+2 are legal, x-1/x-2/x-10 are negative, x+10 is out of magnitude,
    // and x*2 = 0.5 is the third legal rung. Proves the ladder is walked past rung 4.
    const params: Params = { a: 1, b: 4 };
    const template = makeTemplate({
      id: 'fractions_int__reaches_the_double_rung',
      skill: 'fractions_int',
      answerExpr: 'a / b',
      distractors: ['a / b', '(a / b) + 0', '(a / b) * 1'],
      params,
    });

    expect(buildDistractors(template, params)).toEqual([1.25, 2.25, 0.5]);
  });
});

// =============================================================================================
// AC-8 — exhaustion raises a typed error
// =============================================================================================

/**
 * The one route to genuine ladder exhaustion under the frozen constants: an answer large enough
 * that the whole near-miss window collapses onto the answer in IEEE-754. At 2e17 the spacing
 * between representable doubles is 32, so `x±1`, `x±2`, `x±3` and `x±10` all round back to `x`
 * and collide with the answer. Only `x * 2` survives — one value where three are needed.
 */
const EXHAUSTION_ANSWER = 2e17;
const EXHAUSTION_PARAMS: Params = { a: 500000000, b: 400000000 };
const exhaustionTemplate = makeTemplate({
  id: 'multi_digit_order_ops__ladder_exhausted',
  skill: 'multi_digit_order_ops',
  answerExpr: 'a * b',
  distractors: ['a * b + 1', 'a * b - 1', 'a * b + 2'],
  params: EXHAUSTION_PARAMS,
});

describe('buildDistractors — the ladder cannot supply three values (AC-8)', () => {
  it('spec(T-005:AC-8) the fixture really is exhausting (the premise, not the conclusion)', () => {
    // L-014 / L-015: prove the degenerate case is live before trusting what it demonstrates.
    expect(evaluateNumber(exhaustionTemplate.answerExpr, EXHAUSTION_PARAMS)).toBe(EXHAUSTION_ANSWER);
    for (const expr of exhaustionTemplate.distractors) {
      expect(evaluateNumber(expr, EXHAUSTION_PARAMS)).toBe(EXHAUSTION_ANSWER);
    }
    expect(legalLadderValues(EXHAUSTION_ANSWER)).toEqual([EXHAUSTION_ANSWER * 2]);
    expect(legalLadderValues(EXHAUSTION_ANSWER).length).toBeLessThan(NEEDED);
  });

  it('spec(T-005:AC-8) throws a QuestionGenerationError', () => {
    const thrown = captureThrow(() => buildDistractors(exhaustionTemplate, EXHAUSTION_PARAMS));

    expect(thrown).toBeInstanceOf(QuestionGenerationError);
  });

  it('spec(T-005:AC-8) the error carries code DISTRACTOR_FAILURE', () => {
    const thrown = captureThrow(() => buildDistractors(exhaustionTemplate, EXHAUSTION_PARAMS));

    expect((thrown as QuestionGenerationError).code).toBe('DISTRACTOR_FAILURE');
  });

  it('spec(T-005:AC-8) the error names the template id', () => {
    const thrown = captureThrow(() => buildDistractors(exhaustionTemplate, EXHAUSTION_PARAMS));

    expect((thrown as Error).message).toContain(exhaustionTemplate.id);
  });

  it('spec(T-005:AC-8) it never returns a short list, a duplicate, or the answer instead', () => {
    let returned: readonly number[] | undefined;
    try {
      returned = buildDistractors(exhaustionTemplate, EXHAUSTION_PARAMS);
    } catch {
      returned = undefined;
    }

    // The degrade-instead-of-throw failure modes, each named explicitly by AC-8.
    expect(returned).toBeUndefined();
  });

  it('spec(T-005:AC-8) tries the whole ladder before giving up', () => {
    // MAX_DISTRACTOR_ATTEMPTS must admit all nine rungs, or later rungs are unreachable and
    // the zero-answer case (AC-13) starves. Asserted here because this is the criterion that
    // would otherwise be satisfied by an implementation that gave up early.
    expect(MAX_DISTRACTOR_ATTEMPTS).toBeGreaterThanOrEqual(ladderRungs(0).length);
  });
});

// =============================================================================================
// AC-9 — ExprError propagates unchanged
// =============================================================================================

describe('buildDistractors — authoring errors in distractor expressions (AC-9)', () => {
  const params: Params = { a: 3, b: 4 };

  const BAD_EXPRESSIONS: readonly { readonly name: string; readonly expr: string }[] = [
    { name: 'unknown identifier', expr: 'a + zzz' },
    { name: 'unknown function', expr: 'wobble(a)' },
    { name: 'syntax error', expr: 'a +' },
  ];

  for (const bad of BAD_EXPRESSIONS) {
    for (const index of [0, 1, 2]) {
      it(`spec(T-005:AC-9) an ${bad.name} at declared index ${index} propagates as ExprError`, () => {
        const distractors: [string, string, string] = ['a + b + 1', 'a + b - 1', 'a + b + 2'];
        distractors[index] = bad.expr;

        const template = makeTemplate({
          id: 'add_within_10__authoring_bug',
          answerExpr: 'a + b',
          distractors,
          params,
        });

        const thrown = captureThrow(() => buildDistractors(template, params));

        expect(thrown).toBeInstanceOf(ExprError);
      });
    }
  }

  it('spec(T-005:AC-9) the ExprError is NOT converted into a QuestionGenerationError', () => {
    // The whole point of the criterion: swallowing this into the fill ladder would let a
    // content authoring bug ship silently instead of failing the T-019 golden suite loudly.
    const template = makeTemplate({
      id: 'add_within_10__authoring_bug_not_swallowed',
      answerExpr: 'a + b',
      distractors: ['a + b + 1', 'a + b - 1', 'a + zzz'],
      params,
    });

    const thrown = captureThrow(() => buildDistractors(template, params));

    expect(thrown).not.toBeInstanceOf(QuestionGenerationError);
    expect((thrown as ExprError).code).toBe('UNKNOWN_IDENTIFIER');
  });

  it('spec(T-005:AC-9) the error message is passed through unchanged, not re-wrapped', () => {
    const template = makeTemplate({
      id: 'add_within_10__authoring_bug_message',
      answerExpr: 'a + b',
      distractors: ['a + b + 1', 'a + b - 1', 'a + zzz'],
      params,
    });

    let expected: unknown;
    try {
      evaluateNumber('a + zzz', params);
    } catch (error) {
      expected = error;
    }
    const thrown = captureThrow(() => buildDistractors(template, params));

    expect((thrown as Error).name).toBe((expected as Error).name);
    expect((thrown as Error).message).toBe((expected as Error).message);
  });

  it('spec(T-005:AC-9) an ExprError from the answerExpr propagates too', () => {
    const template = makeTemplate({
      id: 'add_within_10__bad_answer_expr',
      answerExpr: 'a + nope',
      distractors: ['a + b + 1', 'a + b - 1', 'a + b + 2'],
      params,
    });

    expect(captureThrow(() => buildDistractors(template, params))).toBeInstanceOf(ExprError);
  });

  it('spec(T-005:AC-9) describeDistractorSources propagates the same ExprError', () => {
    const template = makeTemplate({
      id: 'add_within_10__authoring_bug_sources',
      answerExpr: 'a + b',
      distractors: ['a + b + 1', 'a + b - 1', 'a + zzz'],
      params,
    });

    expect(captureThrow(() => describeDistractorSources(template, params))).toBeInstanceOf(ExprError);
  });
});

// =============================================================================================
// AC-10 — purity and determinism
// =============================================================================================

describe('buildDistractors — purity (AC-10)', () => {
  it('spec(T-005:AC-10) 100 calls on the same (template, params) are element-wise identical', () => {
    const first = buildDistractors(ac2Template, AC2_PARAMS);

    for (let call = 0; call < 100; call += 1) {
      const again = buildDistractors(ac2Template, AC2_PARAMS);

      expect(again).toHaveLength(first.length);
      again.forEach((value: number, index: number) => {
        expect(value).toBe(first[index]);
      });
    }
  });

  it('spec(T-005:AC-10) every sweep case is element-wise stable across repeated calls', () => {
    for (const sweep of ANSWER_SWEEP) {
      const template = makeTemplate({
        id: `purity__${sweep.name}`,
        skill: sweep.skill,
        answerExpr: sweep.answerExpr,
        distractors: [`(${sweep.answerExpr}) + 1`, sweep.answerExpr, `(${sweep.answerExpr}) * 1000 + 7`],
        params: sweep.params,
      });

      const firstValues = buildDistractors(template, sweep.params);
      const firstSources = describeDistractorSources(template, sweep.params);

      for (let call = 0; call < 5; call += 1) {
        expect(buildDistractors(template, sweep.params), `answer ${sweep.answer}`).toEqual([...firstValues]);
        expect(describeDistractorSources(template, sweep.params), `answer ${sweep.answer}`).toEqual([
          ...firstSources,
        ]);
      }
    }
  });

  it('spec(T-005:AC-10) an equal-but-distinct params object yields the same result', () => {
    // Pins purity on the VALUES, not on object identity — a module memoising by reference
    // would pass the repeat-call test above and fail this one.
    const a = buildDistractors(ac1Template, { a: 3, b: 4 });
    const b = buildDistractors(ac1Template, { a: 3, b: 4 });

    expect(b).toEqual([...a]);
  });

  it('spec(T-005:AC-10) consumes no randomness even when Math.random is poisoned', () => {
    // LESSONS.md L-013: guard the behaviour, not the spelling. A source scan for "Math.random"
    // is a denylist; making the capability throw is an observation.
    const realRandom = Math.random;
    let touched = 0;
    Math.random = (): number => {
      touched += 1;
      throw new Error('Math.random() must not be reachable from the distractor module');
    };

    try {
      for (const sweep of ANSWER_SWEEP) {
        const template = makeTemplate({
          id: `no_random__${sweep.name}`,
          skill: sweep.skill,
          answerExpr: sweep.answerExpr,
          distractors: [sweep.answerExpr, `(${sweep.answerExpr}) + 0`, `(${sweep.answerExpr}) * 1`] as const,
          params: sweep.params,
        });

        expect(buildDistractors(template, sweep.params)).toHaveLength(NEEDED);
        expect(describeDistractorSources(template, sweep.params)).toHaveLength(NEEDED);
      }
    } finally {
      Math.random = realRandom;
    }

    expect(touched).toBe(0);
  });

  it('spec(T-005:AC-10) takes exactly (template, params) — there is no Rng parameter', () => {
    // Definition of Done: "the module takes no `Rng` parameter at all". Shuffling the four
    // choices is T-007's job precisely because it must share the parameter-sampling stream.
    expect(buildDistractors).toHaveLength(2);
    expect(describeDistractorSources).toHaveLength(2);
    expect(isPlausibleDistractor).toHaveLength(2);
  });

  it('spec(T-005:AC-10) does not mutate the template or the params it is given', () => {
    const params = { a: 3, b: 4 };
    const declaredBefore = [...ac1Template.distractors];

    buildDistractors(ac1Template, params);
    describeDistractorSources(ac1Template, params);

    expect(params).toEqual({ a: 3, b: 4 });
    expect(ac1Template.distractors).toEqual(declaredBefore);
  });
});

// =============================================================================================
// AC-11 — numeric type matches the answer
// =============================================================================================

describe('buildDistractors — integrality matches the answer (AC-11)', () => {
  const NON_INTEGER_PARAMS: Params = { a: 7, b: 2 };
  const nonIntegerTemplate = makeTemplate({
    id: 'fractions_int__a_over_b',
    skill: 'fractions_int',
    answerExpr: 'a / b',
    distractors: ['a / b + 1', 'a / b - 1', 'a * b'],
    params: NON_INTEGER_PARAMS,
  });

  it('spec(T-005:AC-11) the fixture answer is 3.5, a non-integer', () => {
    expect(evaluateNumber('a / b', NON_INTEGER_PARAMS)).toBe(3.5);
    expect(Number.isInteger(3.5)).toBe(false);
  });

  it('spec(T-005:AC-11) every returned value is non-integer when the answer is', () => {
    for (const value of buildDistractors(nonIntegerTemplate, NON_INTEGER_PARAMS)) {
      expect(Number.isInteger(value)).toBe(false);
    }
  });

  it('spec(T-005:AC-11) the integer declared distractor 14 is excluded and replaced', () => {
    expect(evaluateNumber('a * b', NON_INTEGER_PARAMS)).toBe(14);
    expect(buildDistractors(nonIntegerTemplate, NON_INTEGER_PARAMS)).toEqual([4.5, 2.5, 5.5]);
    expect(describeDistractorSources(nonIntegerTemplate, NON_INTEGER_PARAMS)).toEqual([
      'declared',
      'declared',
      'ladder',
    ]);
  });

  it('spec(T-005:AC-11) skips the integer x * 2 rung for a non-integer answer', () => {
    // answer 0.5: the only legal rungs are 1.5, 2.5 and 3.5 — x * 2 = 1 is an INTEGER and must
    // be rejected on clause 2, which is the difference between success and DISTRACTOR_FAILURE.
    const params: Params = { a: 1, b: 2 };
    const template = makeTemplate({
      id: 'fractions_int__half',
      skill: 'fractions_int',
      answerExpr: 'a / b',
      distractors: ['a / b', '(a / b) + 0', '(a / b) * 1'],
      params,
    });

    expect(buildDistractors(template, params)).toEqual([1.5, 2.5, 3.5]);
  });

  it('spec(T-005:AC-11) every returned value is an integer when the answer is', () => {
    for (const sweep of ANSWER_SWEEP.filter((s) => Number.isInteger(s.answer))) {
      const template = makeTemplate({
        id: `integrality__${sweep.name}`,
        skill: sweep.skill,
        answerExpr: sweep.answerExpr,
        distractors: [
          `(${sweep.answerExpr}) + 1`,
          sweep.answerExpr,
          `(${sweep.answerExpr}) * 1000 + 7`,
        ] as const,
        params: sweep.params,
      });

      for (const value of buildDistractors(template, sweep.params)) {
        expect(Number.isInteger(value), `answer ${sweep.answer}: ${value} is not an integer`).toBe(true);
      }
    }
  });

  it('spec(T-005:AC-11) every returned value is non-integer for every non-integer sweep answer', () => {
    for (const sweep of ANSWER_SWEEP.filter((s) => !Number.isInteger(s.answer))) {
      const template = makeTemplate({
        id: `integrality__${sweep.name}`,
        skill: sweep.skill,
        answerExpr: sweep.answerExpr,
        distractors: [
          `(${sweep.answerExpr}) + 1`,
          sweep.answerExpr,
          `(${sweep.answerExpr}) * 1000 + 7`,
        ] as const,
        params: sweep.params,
      });

      for (const value of buildDistractors(template, sweep.params)) {
        expect(Number.isInteger(value), `answer ${sweep.answer}: ${value} is an integer`).toBe(false);
      }
    }
  });
});

// =============================================================================================
// AC-12 — isPlausibleDistractor, exported for reuse
// =============================================================================================

describe('isPlausibleDistractor (AC-12)', () => {
  it('spec(T-005:AC-12) returns false for NaN as the candidate', () => {
    expect(isPlausibleDistractor(Number.NaN, 7)).toBe(false);
  });

  it('spec(T-005:AC-12) returns false for Infinity and -Infinity as the candidate', () => {
    expect(isPlausibleDistractor(Number.POSITIVE_INFINITY, 7)).toBe(false);
    expect(isPlausibleDistractor(Number.NEGATIVE_INFINITY, 7)).toBe(false);
  });

  it('spec(T-005:AC-12) returns false for a non-finite candidate against every sweep answer', () => {
    for (const sweep of ANSWER_SWEEP) {
      for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        expect(isPlausibleDistractor(bad, sweep.answer)).toBe(false);
      }
    }
  });

  it('spec(T-005:AC-12) returns false when the ANSWER is non-finite', () => {
    // Follows from the rule as written: clause 2 or clause 4 fails for every candidate.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(isPlausibleDistractor(7, bad)).toBe(false);
      expect(isPlausibleDistractor(7.5, bad)).toBe(false);
      expect(isPlausibleDistractor(0, bad)).toBe(false);
    }
  });

  it('spec(T-005:AC-12) accepts an ordinary near miss (the true case, so the rule is not "always false")', () => {
    expect(isPlausibleDistractor(8, 7)).toBe(true);
    expect(isPlausibleDistractor(6, 7)).toBe(true);
    expect(isPlausibleDistractor(12, 7)).toBe(true);
  });

  it('spec(T-005:AC-12) clause 4a — the near-miss window is inclusive at DISTRACTOR_ABS_FLOOR', () => {
    // Answer 2: the ratio branch only reaches [1, 4], so this isolates the near-miss branch.
    expect(isPlausibleDistractor(2 + DISTRACTOR_ABS_FLOOR, 2)).toBe(true);
    expect(isPlausibleDistractor(2 + DISTRACTOR_ABS_FLOOR + 1, 2)).toBe(false);
  });

  it('spec(T-005:AC-12) clause 4b — the ratio ceiling is inclusive and is enforced above it', () => {
    const answer = 100;

    expect(isPlausibleDistractor(answer * DISTRACTOR_MAX_RATIO, answer)).toBe(true);
    expect(isPlausibleDistractor(answer * DISTRACTOR_MAX_RATIO + 1, answer)).toBe(false);
  });

  it('spec(T-005:AC-12) clause 4b — the ratio FLOOR is inclusive and is enforced below it', () => {
    // L-005: the two-sided bound. A rule keeping only the upper bound would accept 1 here.
    const answer = 100;

    expect(isPlausibleDistractor(answer / DISTRACTOR_MAX_RATIO, answer)).toBe(true);
    expect(isPlausibleDistractor(answer / DISTRACTOR_MAX_RATIO - 1, answer)).toBe(false);
    expect(isPlausibleDistractor(1, answer)).toBe(false);
  });

  it('spec(T-005:AC-12) clause 3 — no negative candidate against a non-negative answer', () => {
    // Answer 1 and candidate -1 is a NEAR MISS (|−1 − 1| = 2 <= 3), so only clause 3 can
    // reject it — the case that isolates the sign rule from the magnitude rules.
    expect(isPlausibleDistractor(-1, 1)).toBe(false);
    expect(isPlausibleDistractor(-1, 2)).toBe(false);
    expect(isPlausibleDistractor(-1, 0)).toBe(false);
  });

  it('spec(T-005:AC-12) clause 3 is conditional — negatives ARE allowed against a negative answer', () => {
    // The other side of the same clause: "d >= 0 whenever x >= 0" says nothing about x < 0.
    expect(isPlausibleDistractor(-4, -5)).toBe(true);
    expect(isPlausibleDistractor(-6, -5)).toBe(true);
    expect(isPlausibleDistractor(-2, -1)).toBe(true);
  });

  it('spec(T-005:AC-12) clause 2 — a non-integer candidate is rejected against an integer answer', () => {
    // 7.5 is well inside the near-miss window of 7; only clause 2 can reject it.
    expect(isPlausibleDistractor(7.5, 7)).toBe(false);
    expect(isPlausibleDistractor(0.5, 0)).toBe(false);
  });

  it('spec(T-005:AC-12) clause 2 — an integer candidate is rejected against a non-integer answer', () => {
    expect(isPlausibleDistractor(4, 3.5)).toBe(false);
    expect(isPlausibleDistractor(1, 0.5)).toBe(false);
  });

  it('spec(T-005:AC-12) it tests plausibility only — collision with the answer is not its job', () => {
    // The ticket's rule has exactly four clauses and none of them is "d !== x"; rejecting the
    // answer itself belongs to buildDistractors (AC-2). Keeping the two separable is what lets
    // T-014 / T-015 / T-016 reuse this predicate on candidates they have not yet screened.
    expect(isPlausibleDistractor(7, 7)).toBe(true);
    expect(isPlausibleDistractor(0, 0)).toBe(true);
    expect(isPlausibleDistractor(-5, -5)).toBe(true);
  });

  it('spec(T-005:AC-12) agrees with the plausibility rule across a swept candidate grid', () => {
    for (const sweep of ANSWER_SWEEP) {
      const candidates = [
        ...ladderRungs(sweep.answer),
        sweep.answer,
        0,
        1,
        -1,
        sweep.answer * 1000 + 7,
        sweep.answer / 1000,
        sweep.answer + 0.5,
        sweep.answer * DISTRACTOR_MAX_RATIO,
        sweep.answer * DISTRACTOR_MAX_RATIO + 1,
        sweep.answer / DISTRACTOR_MAX_RATIO,
        Number.NaN,
        Number.POSITIVE_INFINITY,
      ];

      for (const candidate of candidates) {
        expect(
          isPlausibleDistractor(candidate, sweep.answer),
          `isPlausibleDistractor(${candidate}, ${sweep.answer})`,
        ).toBe(satisfiesPlausibilityRule(candidate, sweep.answer));
      }
    }
  });

  it('spec(T-005:AC-12) is not a constant function in either direction', () => {
    // Guards the grid above from being satisfied by `() => true` or `() => false`.
    const answers = ANSWER_SWEEP.map((sweep) => sweep.answer);
    const trues = answers.filter((x) => isPlausibleDistractor(x + 1, x));
    const falses = answers.filter((x) => isPlausibleDistractor(x * 1000 + 7, x));

    expect(trues.length).toBeGreaterThan(0);
    expect(falses).toHaveLength(0);
  });
});

// =============================================================================================
// AC-13 — the zero answer, end to end
// =============================================================================================

describe('buildDistractors — the zero answer is buildable (AC-13)', () => {
  const params: Params = { a: 5, b: 5 };
  const template = makeTemplate({
    id: 'sub_within_20__equal_operands',
    skill: 'sub_within_20',
    answerExpr: 'a - b',
    distractors: ['a - b + 1', 'a - b - 1', 'a * b'],
    params,
  });

  it('spec(T-005:AC-13) the frozen constants are the ones this criterion is stated against', () => {
    // AC-13 says the returned set is exactly {1, 2, 3} "when DISTRACTOR_ABS_FLOOR === 3".
    // Asserting the premise means the literal expectations below can never silently drift:
    // if the floor ever moves, this test fails first and names the reason.
    expect(DISTRACTOR_ABS_FLOOR).toBe(3);
    expect(MAX_DISTRACTOR_ATTEMPTS).toBeGreaterThanOrEqual(ladderRungs(0).length);
  });

  it('spec(T-005:AC-13) DISTRACTOR_ABS_FLOOR has exactly zero headroom at a zero answer', () => {
    // The reason the floor cannot go below 3: {1, 2, 3} is the COMPLETE set of values the
    // ladder can ever yield for a zero answer, and all three are needed.
    expect(legalLadderValues(0)).toEqual([1, 2, 3]);
    expect(legalLadderValues(0)).toHaveLength(NEEDED);
  });

  it('spec(T-005:AC-13) returns exactly {1, 2, 3}', () => {
    expect(buildDistractors(template, params)).toEqual([1, 2, 3]);
  });

  it('spec(T-005:AC-13) returns exactly 3 distinct values, none equal to 0', () => {
    const result = buildDistractors(template, params);

    expect(result).toHaveLength(NEEDED);
    expect(new Set(result).size).toBe(NEEDED);
    for (const value of result) {
      expect(value === 0).toBe(false);
    }
  });

  it('spec(T-005:AC-13) does NOT throw DISTRACTOR_FAILURE', () => {
    expect(() => buildDistractors(template, params)).not.toThrow();
    expect(() => describeDistractorSources(template, params)).not.toThrow();
  });

  it('spec(T-005:AC-13) succeeds however the declared distractors are shaped', () => {
    // The zero answer is reachable from real sub_within_20 content whatever a template author
    // wrote, so every declared shape must land on the same three values.
    for (const shape of DECLARED_SHAPES) {
      const shaped = makeTemplate({
        id: `sub_within_20__zero__${shape.name.replace(/[^a-z]+/gi, '_')}`,
        skill: 'sub_within_20',
        answerExpr: 'a - b',
        distractors: shape.of('a - b'),
        params,
      });

      // Order is not asserted across shapes: with a rejected distractor in the MIDDLE of the
      // declared list the ticket does not say whether the fill lands in that slot or is
      // appended. The SET is fully determined either way, and that is what AC-13 states.
      const result = expectValidDistractorSet(shaped, params);

      expect(
        [...result].sort((x, y) => x - y),
        shape.name,
      ).toEqual([1, 2, 3]);
    }
  });

  it('spec(T-005:AC-13) succeeds for every a == b draw a sub_within_20 template can make', () => {
    // Not one hand-picked draw: the whole legal diagonal, since the ticket's point is that this
    // case is reachable from real content rather than exotic.
    for (let value = 0; value <= 20; value += 1) {
      const drawn: Params = { a: value, b: value };
      const diagonal = makeTemplate({
        id: 'sub_within_20__diagonal',
        skill: 'sub_within_20',
        answerExpr: 'a - b',
        distractors: ['a - b + 1', 'a - b - 1', 'a * b'],
        params: drawn,
      });

      expect(evaluateNumber('a - b', drawn)).toBe(0);
      expect(buildDistractors(diagonal, drawn), `a = b = ${value}`).toEqual([1, 2, 3]);
    }
  });
});

// =============================================================================================
// AC-14 — describeDistractorSources
// =============================================================================================

describe('describeDistractorSources (AC-14)', () => {
  it('spec(T-005:AC-14) returns a length-3 array of source labels', () => {
    const sources = describeDistractorSources(ac1Template, AC1_PARAMS);

    expect(Array.isArray(sources)).toBe(true);
    expect(sources).toHaveLength(NEEDED);
    for (const source of sources) {
      expect(['declared', 'ladder']).toContain(source);
    }
  });

  it("spec(T-005:AC-14) is typed as readonly ('declared' | 'ladder')[], the exact type AC-14 names", () => {
    // A type-level guarantee with no compile-time test is not a guarantee: `string[]` would
    // satisfy every runtime assertion in this file while giving T-014 / T-015 / T-016 nothing
    // to switch on. `Exact` is invariant in both directions, unlike `extends`.
    const isExactSourceArray: Exact<
      ReturnType<typeof describeDistractorSources>,
      readonly ('declared' | 'ladder')[]
    > = true;

    expect(isExactSourceArray).toBe(true);
  });

  it("spec(T-005:AC-14) marks AC-1's clean case as three 'declared' entries", () => {
    expect(describeDistractorSources(ac1Template, AC1_PARAMS)).toEqual(['declared', 'declared', 'declared']);
  });

  it("spec(T-005:AC-14) marks AC-7's total-collision case as three 'ladder' entries", () => {
    expect(describeDistractorSources(ac7Template, AC7_PARAMS)).toEqual(['ladder', 'ladder', 'ladder']);
  });

  it('spec(T-005:AC-14) is aligned index-for-index with the values buildDistractors returns', () => {
    for (const sweep of ANSWER_SWEEP) {
      for (const shape of DECLARED_SHAPES) {
        const template = makeTemplate({
          id: `sources__${sweep.name}`,
          skill: sweep.skill,
          answerExpr: sweep.answerExpr,
          distractors: shape.of(sweep.answerExpr),
          params: sweep.params,
        });

        expectSourcesAligned(template, sweep.params);
      }
    }
  });

  it('spec(T-005:AC-14) reports a mixed provenance rather than collapsing to one label', () => {
    // A helper that always answered 'declared' would pass AC-1's case, and one that always
    // answered 'ladder' would pass AC-7's. The counting T-014 / T-015 / T-016 need is the
    // number of LADDER SUBSTITUTIONS, so the mixed case is the one that has to be right.
    expect(describeDistractorSources(ac2Template, AC2_PARAMS)).toEqual(['declared', 'declared', 'ladder']);
    expect(describeDistractorSources(ac5Template, AC5_PARAMS)).toEqual(['declared', 'declared', 'ladder']);
  });

  it('spec(T-005:AC-14) counts ladder substitutions consistently with the values returned', () => {
    for (const sweep of ANSWER_SWEEP) {
      const template = makeTemplate({
        id: `substitution_count__${sweep.name}`,
        skill: sweep.skill,
        answerExpr: sweep.answerExpr,
        // One survivor, one collision, one wildly-out-of-magnitude: exactly two substitutions.
        distractors: [
          `(${sweep.answerExpr}) + 1`,
          sweep.answerExpr,
          `(${sweep.answerExpr}) * 1000 + 7`,
        ] as const,
        params: sweep.params,
      });

      const sources = describeDistractorSources(template, sweep.params);

      expect(
        sources.filter((source: string) => source === 'ladder'),
        `answer ${sweep.answer}`,
      ).toHaveLength(2);
    }
  });

  it('spec(T-005:AC-14) is deterministic across repeated calls', () => {
    const first = describeDistractorSources(ac2Template, AC2_PARAMS);

    for (let call = 0; call < 20; call += 1) {
      expect(describeDistractorSources(ac2Template, AC2_PARAMS)).toEqual([...first]);
    }
  });
});
