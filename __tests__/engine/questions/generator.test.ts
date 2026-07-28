/**
 * T-007 — `src/engine/questions/generator.ts`: template selection, rejection sampling, text
 * render, and four-choice assembly.
 *
 * Why this suite is written the way it is:
 *
 *  - **The mechanism, not a projection of it** (LESSONS.md L-012). The ticket specifies a
 *    seven-step algorithm over frozen primitives, so `composeExpected` below re-derives the
 *    whole result from `pick` / `nextInt` / `evaluatePredicate` / `evaluateNumber` /
 *    `buildDistractors` / `shuffle` and the suite asserts `toStrictEqual` against it. Every
 *    statistical band in here (AC-2's seed sensitivity, AC-13's slot histogram) sits ALONGSIDE
 *    a structural assertion that a cheat inside the band still fails — never instead of one.
 *  - **Aggregate assertions carry a discriminator.** AC-13's histogram is satisfied by an
 *    implementation that drops the answer into a uniformly-random slot and leaves the three
 *    distractors in declared order, so AC-13 also asserts that all 4! orderings of the four
 *    choice values are reached. AC-3's "no recent id was served" is satisfied by an
 *    implementation that excludes the WHOLE history, so AC-3 also pins the eligible set to
 *    exactly the templates outside the first `RECENT_TEMPLATE_WINDOW` entries.
 *  - **Coincidence is perturbed, not trusted** (LESSONS.md L-020). The ticket fixes parameter
 *    sampling in "lexicographically ascending" key order. A fixture whose keys happen to be
 *    declared in sorted order cannot tell that apart from `Object.keys` insertion order, so the
 *    ordering fixtures declare `b` before `a` and the assertion states which draw each name
 *    must receive.
 *  - **Every constant is imported** (`CHOICE_COUNT`, `MAX_PARAM_SAMPLE_ATTEMPTS`,
 *    `RECENT_TEMPLATE_WINDOW`), and where a hand-written expectation depends on a frozen value
 *    the test asserts that dependency first so it can never silently drift.
 *  - **Dimensions, not cases** (LESSONS.md L-017). `DIMENSION_MATRIX` varies parameter
 *    cardinality (1 · 2 · 3), key-declaration order, range shape (degenerate · positive ·
 *    negative · spanning zero · wide), constraint shape (absent key · empty array · one · two),
 *    answer domain (positive integer · zero · negative · non-integer · large), text shape
 *    (single token · repeated token · unused parameter · no token) and both boolean flags.
 *  - **Purity is proven behaviourally, not by source scan** (LESSONS.md L-013): AC-1 poisons
 *    `Math.random` before calling and asserts the generator still produces its answer.
 *  - **Bulk loops collect then assert once**, so a failure reports the aggregate rather than
 *    dying on the first sample.
 *
 * API surface, taken verbatim from the ticket's Context section:
 *
 *     generateQuestion({ templates, recentTemplateIds, rng }) -> readonly [Question, Rng]
 */
import { describe, expect, it } from 'vitest';

import { templateSchema } from '@content/schemas';
import type { SkillId, Template } from '@content/schemas';
import { createRng, nextInt, pick, shuffle } from '@engine/rng';
import type { Rng } from '@engine/rng';
import { buildDistractors } from '@engine/questions/distractors';
import { evaluateNumber, evaluatePredicate } from '@engine/questions/expr';
import { QuestionGenerationError, assertQuestion } from '@engine/questions/types';
import type { Choice, Question } from '@engine/questions/types';
import { CHOICE_COUNT, MAX_PARAM_SAMPLE_ATTEMPTS, RECENT_TEMPLATE_WINDOW } from '@engine/tuning';
import { generateQuestion as generateQuestionUnderTest } from '@engine/questions/generator';

// =============================================================================================
// Fixture construction
// =============================================================================================

type Params = Readonly<Record<string, number>>;
type ParamRange = readonly [number, number];

interface TemplateSpec {
  readonly id: string;
  readonly skill?: SkillId;
  readonly text?: string;
  /** Declaration order is preserved, so a fixture can declare `b` before `a` on purpose. */
  readonly params: Readonly<Record<string, ParamRange>>;
  readonly constraints?: readonly string[];
  readonly answerExpr: string;
  readonly distractors?: readonly [string, string, string];
  readonly isWordProblem?: boolean;
  readonly readAloud?: boolean;
}

/**
 * Three near-miss distractor expressions around any answer expression.
 *
 * Wrapped in parentheses so precedence cannot change the offset, and chosen as +1/-1/+2
 * because T-005's plausibility rule admits any candidate within `DISTRACTOR_ABS_FLOOR` of the
 * answer — which keeps every fixture in this file clear of `DISTRACTOR_FAILURE` regardless of
 * the answer's sign, magnitude or integrality. AC-16 is the one fixture that deliberately does
 * the opposite.
 */
function nearMissDistractors(answerExpr: string): readonly [string, string, string] {
  return [`(${answerExpr}) + 1`, `(${answerExpr}) - 1`, `(${answerExpr}) + 2`];
}

/**
 * Builds a fixture through `templateSchema.parse` rather than by cast, so every template in
 * this suite is one the content pipeline would actually accept — in particular it carries
 * exactly three distractors, so no fixture can drift away from the four-choice contract.
 *
 * Optional keys are attached only when the spec supplies them: AC-8 needs a template with no
 * `constraints` key AT ALL (not an empty array), and AC-15 needs one with neither flag key.
 */
function makeTemplate(spec: TemplateSpec): Template {
  const params: Record<string, [number, number]> = {};
  for (const [name, range] of Object.entries(spec.params)) {
    params[name] = [range[0], range[1]];
  }

  const raw: Record<string, unknown> = {
    id: spec.id,
    skill: spec.skill ?? 'add_within_10',
    text: spec.text ?? 'fixture',
    params,
    answerExpr: spec.answerExpr,
    distractors: [...(spec.distractors ?? nearMissDistractors(spec.answerExpr))],
  };
  if (spec.constraints !== undefined) {
    raw.constraints = [...spec.constraints];
  }
  if (spec.isWordProblem !== undefined) {
    raw.isWordProblem = spec.isWordProblem;
  }
  if (spec.readAloud !== undefined) {
    raw.readAloud = spec.readAloud;
  }

  return templateSchema.parse(raw);
}

/** Reads a declared range, failing loudly rather than leaking `undefined` into a draw. */
function rangeOf(template: Template, name: string): ParamRange {
  const range = template.params[name];
  if (range === undefined) {
    throw new Error(`fixture error: template "${template.id}" declares no parameter "${name}"`);
  }
  return range;
}

/** Reads a sampled value, failing loudly rather than comparing against `undefined`. */
function paramOf(params: Params, name: string): number {
  const value = params[name];
  if (value === undefined) {
    throw new Error(`expected a sampled value for parameter "${name}", got none`);
  }
  return value;
}

// =============================================================================================
// The expected-result oracle
// =============================================================================================

interface GeneratorInput {
  readonly templates: readonly Template[];
  readonly recentTemplateIds: readonly string[];
  readonly rng: Rng;
}

/**
 * The module under test, pinned to the signature the ticket's Context section declares.
 *
 * Annotating the import does two jobs. Once the module exists this assignment is a compile-time
 * assertion on the signature: a generator taking or returning a different shape cannot be
 * assigned here. And while the module is still absent it keeps the RED-state typecheck honest —
 * an unannotated `any` import infers every downstream callback parameter as `any`, so real
 * `noImplicitAny` errors in this file would hide behind the missing-module error and only surface
 * once an implementer was already bound by the frozen file (LESSONS.md L-024).
 */
const generateQuestion: (input: GeneratorInput) => readonly [Question, Rng] = generateQuestionUnderTest;

/**
 * Step 1 of the ticket's algorithm: exclude any template whose id appears in the first
 * `RECENT_TEMPLATE_WINDOW` entries of `recentTemplateIds`, degrading to the unfiltered pool
 * when that empties it.
 */
function eligiblePool(input: GeneratorInput): readonly Template[] {
  const window = input.recentTemplateIds.slice(0, RECENT_TEMPLATE_WINDOW);
  const filtered = input.templates.filter((template) => !window.includes(template.id));
  return filtered.length > 0 ? filtered : input.templates;
}

/**
 * Step 6: substitute every `{name}` token whose name is a declared parameter, then reject any
 * brace that survived. Global, so a token appearing twice is replaced twice.
 */
function renderText(text: string, params: Params): string {
  const rendered = text.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (token, name: string) => {
    const value = params[name];
    return value === undefined ? token : String(value);
  });
  if (rendered.includes('{') || rendered.includes('}')) {
    throw new QuestionGenerationError(`unrendered token in "${text}"`, 'INVALID_QUESTION');
  }
  return rendered;
}

/**
 * The ticket's seven steps composed out of the frozen primitives, independently of the module
 * under test. This is the suite's discriminating assertion (LESSONS.md L-012): it pins the
 * exact PRNG stream — one `pick` draw, then one `nextInt` per parameter per attempt in
 * lexicographically ascending key order, then `shuffle`'s `CHOICE_COUNT - 1` draws — so an
 * implementation that produces a plausible question from a different draw sequence, or that
 * orders the four choices by any other rule, cannot pass.
 *
 * Two orderings the ticket's prose leaves implicit are pinned here because replay (T-024)
 * cannot survive either being left free, and the ticket's own step sequence is the only
 * evidence available for both:
 *   - parameter keys are drawn in lexicographically ascending order (ticket step 3, verbatim);
 *   - the shuffle input is `[answer, ...distractors]`, because "Answer" is step 4 and
 *     "Distractors" is step 5.
 * Both are raised as proposed amendments in this ticket's test report.
 */
function composeExpected(input: GeneratorInput): readonly [Question, Rng] {
  const pool = eligiblePool(input);
  if (pool.length === 0) {
    throw new QuestionGenerationError('no template available', 'NO_TEMPLATE');
  }

  const [template, afterPick] = pick(input.rng, pool);
  let rng = afterPick;

  const keys = Object.keys(template.params).sort();
  const constraints = template.constraints ?? [];

  let params: Params | undefined;
  for (let attempt = 0; attempt < MAX_PARAM_SAMPLE_ATTEMPTS; attempt += 1) {
    const draw: Record<string, number> = {};
    for (const name of keys) {
      const [lo, hi] = rangeOf(template, name);
      const [value, next] = nextInt(rng, lo, hi);
      rng = next;
      draw[name] = value;
    }
    if (constraints.every((constraint) => evaluatePredicate(constraint, draw))) {
      params = draw;
      break;
    }
  }
  if (params === undefined) {
    throw new QuestionGenerationError(
      `template "${template.id}" exhausted ${MAX_PARAM_SAMPLE_ATTEMPTS} attempts`,
      'CONSTRAINTS_UNSATISFIED',
    );
  }

  const answer = evaluateNumber(template.answerExpr, params);
  const distractors = buildDistractors(template, params);
  const text = renderText(template.text, params);

  const built: readonly Choice[] = [answer, ...distractors].map((value) => ({
    value,
    label: String(value),
  }));
  const [choices, afterShuffle] = shuffle(rng, built);

  return [
    {
      templateId: template.id,
      skill: template.skill,
      text,
      params,
      choices,
      correctIndex: choices.findIndex((choice) => choice.value === answer),
      isWordProblem: template.isWordProblem ?? false,
      readAloud: template.readAloud ?? false,
    },
    afterShuffle,
  ];
}

/**
 * How many draws a successful single-template generation consumes, derived rather than
 * counted: one for `pick`, one per parameter per attempt, and `CHOICE_COUNT - 1` for
 * Fisher-Yates over the four choices.
 */
function rngAfterDraws(seed: number, template: Template, attempts: number): Rng {
  const [, afterPick] = pick(createRng(seed), [template]);
  let rng = afterPick;
  const keys = Object.keys(template.params).sort();
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    for (const name of keys) {
      const [lo, hi] = rangeOf(template, name);
      const [, next] = nextInt(rng, lo, hi);
      rng = next;
    }
  }
  const [, afterShuffle] = shuffle(
    rng,
    Array.from({ length: CHOICE_COUNT }, (_unused, index) => index),
  );
  return afterShuffle;
}

/**
 * The 1-based index of the first attempt whose draw satisfies every constraint, replaying the
 * generator's own stream (one `pick` draw first). `Infinity` when no attempt inside `limit`
 * qualifies. Used to locate the exact attempt-bound boundary at run time rather than baking in
 * a seed that would go stale if `MAX_PARAM_SAMPLE_ATTEMPTS` moved.
 */
function firstSatisfyingAttempt(seed: number, template: Template, limit: number): number {
  const [, afterPick] = pick(createRng(seed), [template]);
  let rng = afterPick;
  const keys = Object.keys(template.params).sort();
  const constraints = template.constraints ?? [];
  for (let attempt = 1; attempt <= limit; attempt += 1) {
    const draw: Record<string, number> = {};
    for (const name of keys) {
      const [lo, hi] = rangeOf(template, name);
      const [value, next] = nextInt(rng, lo, hi);
      rng = next;
      draw[name] = value;
    }
    if (constraints.every((constraint) => evaluatePredicate(constraint, draw))) {
      return attempt;
    }
  }
  return Number.POSITIVE_INFINITY;
}

/** Asserts the call throws `QuestionGenerationError` with `code`, and returns the error. */
function expectGenerationError(call: () => unknown, code: string): QuestionGenerationError {
  let thrown: unknown;
  try {
    call();
  } catch (error) {
    thrown = error;
  }
  expect(thrown, 'expected the call to throw, but it returned').toBeInstanceOf(QuestionGenerationError);
  const error = thrown as QuestionGenerationError;
  expect(error.code).toBe(code);
  return error;
}

/** Generates `count` questions, threading the returned `Rng` forward. */
function generateSequence(templates: readonly Template[], seed: number, count: number): readonly Question[] {
  let rng = createRng(seed);
  const questions: Question[] = [];
  for (let index = 0; index < count; index += 1) {
    const [question, next] = generateQuestion({ templates, recentTemplateIds: [], rng });
    rng = next;
    questions.push(question);
  }
  return questions;
}

// =============================================================================================
// Fixtures
// =============================================================================================

/** The ticket's own AC-6 fixture: two parameters and one constraint over both. */
const AC6_TEMPLATE = makeTemplate({
  id: 'ac6',
  text: '{a} + {b} = ?',
  params: { a: [1, 9], b: [1, 9] },
  constraints: ['a + b <= 10'],
  answerExpr: 'a + b',
});

/**
 * A second AC-6 fixture carrying TWO constraints. Without it, "evaluate every entry in
 * `constraints`" is only pinned by the composed-oracle assertion: an implementation that checks
 * `constraints[0]` and stops satisfies a single-constraint sweep completely.
 */
const AC6_TWO_CONSTRAINT_TEMPLATE = makeTemplate({
  id: 'ac6-two-constraints',
  text: '{a} + {b} = ?',
  params: { a: [1, 9], b: [1, 9] },
  constraints: ['a + b <= 10', 'a >= b'],
  answerExpr: 'a + b',
});

/** AC-9's degenerate range: one value, so the first sample can never be rejected. */
const AC9_TEMPLATE = makeTemplate({
  id: 'ac9',
  text: '{a} doubled',
  params: { a: [4, 4] },
  answerExpr: 'a * 2',
});

/**
 * The ordering fixture (LESSONS.md L-020). Keys are declared `b` then `a`, and their ranges are
 * disjoint, so lexicographic order and insertion order consume the two draws the other way
 * round and the resulting `params` differ for almost every seed.
 */
const ORDERING_TEMPLATE = makeTemplate({
  id: 'ordering',
  text: '{a} - {b}',
  params: { b: [1, 100], a: [1000, 1100] },
  answerExpr: 'a - b',
});

/** AC-7's exhaustion fixture, verbatim from the ticket. */
const UNSATISFIABLE_TEMPLATE = makeTemplate({
  id: 'unsatisfiable-tpl',
  params: { a: [1, 2] },
  constraints: ['a > 100'],
  answerExpr: 'a',
});

/**
 * AC-7's attempt-bound fixture: satisfiable with probability 1/100 per attempt, which maximises
 * the chance that a given seed's first satisfying attempt lands exactly on the bound.
 */
const BOUND_PROBE_TEMPLATE = makeTemplate({
  id: 'bound-probe',
  params: { a: [1, 100] },
  constraints: ['a == 7'],
  answerExpr: 'a',
});

/**
 * AC-16's fixture. `2 ** 1023` is an integer as far as `Number.isInteger` and the schema are
 * concerned, but the float spacing there exceeds every rung of T-005's near-miss ladder, so
 * `answer ± 1`, `± 2`, `± 3` and `± 10` all round back onto the answer and collide, while
 * `answer * 2` overflows to `Infinity` and fails the finiteness clause. The three declared
 * distractors collide for the same reason. Nothing survives screening, so `buildDistractors`
 * raises `DISTRACTOR_FAILURE` — measured, not argued (LESSONS.md L-015): the probe reports
 * "built 0, 12 candidates rejected".
 */
const SATURATED_ANSWER = 2 ** 1023;
const SATURATED_PARAMS: Params = { a: SATURATED_ANSWER };
const AC16_TEMPLATE = makeTemplate({
  id: 'saturated-tpl',
  text: '{a}',
  params: { a: [SATURATED_ANSWER, SATURATED_ANSWER] },
  answerExpr: 'a',
  distractors: ['a + 1', 'a + 2', 'a + 3'],
});

/** A pool of `size` interchangeable templates with ids `t1 … t{size}`. */
function makePool(size: number): readonly Template[] {
  return Array.from({ length: size }, (_unused, index) =>
    makeTemplate({
      id: `t${index + 1}`,
      text: `{a} + ${index + 1}`,
      params: { a: [1, 9] },
      answerExpr: `a + ${index + 1}`,
    }),
  );
}

/**
 * AC-2 and AC-3 both specify a pool of eight, which is also PLAN.md's "floor of 8 golden
 * parameterized shapes per skill". Derived as `max(8, w + 3)` so the recency window can never
 * swallow the whole pool if `RECENT_TEMPLATE_WINDOW` is retuned upward — at `w = 5` this is
 * exactly the eight the criteria name.
 */
const POOL_SIZE = Math.max(8, RECENT_TEMPLATE_WINDOW + 3);
const POOL = makePool(POOL_SIZE);

/**
 * The dimension sweep (LESSONS.md L-017). Every entry is a legal template; together they vary
 * parameter cardinality, key-declaration order, range sign and width, constraint shape, answer
 * domain, text shape and both boolean flags.
 */
const DIMENSION_MATRIX: readonly Template[] = [
  AC6_TEMPLATE,
  AC9_TEMPLATE,
  ORDERING_TEMPLATE,
  makeTemplate({
    id: 'dim-empty-constraints',
    text: '{a} + 1',
    params: { a: [1, 9] },
    constraints: [],
    answerExpr: 'a + 1',
  }),
  AC6_TWO_CONSTRAINT_TEMPLATE,
  makeTemplate({
    id: 'dim-three-params-unsorted',
    text: '{c} then {a} then {b}',
    params: { c: [1, 3], a: [1, 3], b: [1, 3] },
    answerExpr: 'a + b + c',
  }),
  makeTemplate({
    id: 'dim-zero-answer',
    text: '{a} - {b}',
    params: { a: [3, 3], b: [3, 3] },
    answerExpr: 'a - b',
  }),
  makeTemplate({
    id: 'dim-negative-answer',
    text: '{a} - {b}',
    params: { a: [1, 2], b: [5, 6] },
    answerExpr: 'a - b',
  }),
  makeTemplate({
    id: 'dim-spanning-zero-range',
    text: 'double {a}',
    params: { a: [-3, 3] },
    answerExpr: 'a * 2',
  }),
  makeTemplate({
    id: 'dim-non-integer-answer',
    text: '{a} / {b}',
    params: { a: [1, 1], b: [2, 2] },
    answerExpr: 'a / b',
    skill: 'fractions_int',
  }),
  makeTemplate({
    id: 'dim-wide-range',
    text: 'what is {a}',
    params: { a: [1, 1000] },
    answerExpr: 'a',
  }),
  makeTemplate({
    id: 'dim-repeated-token',
    text: '{a} + {a} = ?',
    params: { a: [1, 9] },
    answerExpr: 'a + a',
  }),
  makeTemplate({
    id: 'dim-unused-param',
    text: 'only {a} is shown',
    params: { a: [1, 9], c: [1, 9] },
    answerExpr: 'a',
  }),
  makeTemplate({
    id: 'dim-no-token',
    text: 'no tokens at all',
    params: { a: [1, 9] },
    answerExpr: 'a',
  }),
  makeTemplate({
    id: 'dim-both-flags',
    text: 'a word problem about {a}',
    params: { a: [1, 9] },
    answerExpr: 'a',
    isWordProblem: true,
    readAloud: true,
    skill: 'two_step_add_sub',
  }),
];

/** Seeds used by every sweep. Spread across the 32-bit space, not a run of small integers. */
const SWEEP_SEEDS: readonly number[] = [
  1, 2, 3, 7, 42, 99, 256, 1023, 4096, 20260728, 123456789, 999999937, 0x7fffffff, 0xfffffffe,
];

// =============================================================================================
// AC-1 — determinism and purity
// =============================================================================================

describe('generateQuestion — determinism (AC-1)', () => {
  const recentTemplateIds: readonly string[] = ['unrelated-a', 'unrelated-b'];

  it('spec(T-007:AC-1) returns 50 deeply-equal Questions and 50 equal Rngs for one input', () => {
    const templates = [AC6_TEMPLATE];
    const rng = createRng(20260728);

    const results = Array.from({ length: 50 }, () => generateQuestion({ templates, recentTemplateIds, rng }));
    const [firstQuestion, firstRng] = results[0] ?? [];

    const differingQuestions = results.filter(
      ([question]) => JSON.stringify(question) !== JSON.stringify(firstQuestion),
    );
    const differingRngs = results.filter(([, next]) => next.state !== firstRng?.state);

    expect(results).toHaveLength(50);
    expect(differingQuestions).toHaveLength(0);
    expect(differingRngs).toHaveLength(0);
    for (const [question, next] of results) {
      expect(question).toStrictEqual(firstQuestion);
      expect(next).toStrictEqual(firstRng);
    }
  });

  it('spec(T-007:AC-1) reproduces the identical question after a JSON round trip', () => {
    // The Question crosses a persistence boundary (ARCHITECTURE.md §4.2 carries it inside
    // DuelState), so structural identity has to survive serialisation. This also catches a
    // field set to `undefined` rather than a real value: JSON.stringify drops those keys.
    const failures: string[] = [];
    for (const template of DIMENSION_MATRIX) {
      for (const seed of SWEEP_SEEDS) {
        const [question] = generateQuestion({
          templates: [template],
          recentTemplateIds: [],
          rng: createRng(seed),
        });
        const roundTripped: Question = JSON.parse(JSON.stringify(question)) as Question;
        if (JSON.stringify(roundTripped) !== JSON.stringify(question)) {
          failures.push(`${template.id}@${seed}`);
        }
        expect(roundTripped, `${template.id}@${seed}`).toStrictEqual(question);
      }
    }
    expect(failures).toStrictEqual([]);
  });

  it('spec(T-007:AC-1) equals the frozen primitives composed by the ticket algorithm', () => {
    // The discriminating assertion (LESSONS.md L-012). A distribution or an invariant check is
    // satisfied by many wrong implementations; the exact composed value is satisfied by one.
    const mismatches: string[] = [];
    for (const template of DIMENSION_MATRIX) {
      for (const seed of SWEEP_SEEDS) {
        const input: GeneratorInput = {
          templates: [template],
          recentTemplateIds: [],
          rng: createRng(seed),
        };
        const actual = generateQuestion(input);
        const expected = composeExpected(input);
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          mismatches.push(`${template.id}@${seed}`);
        }
        expect(actual, `${template.id}@${seed}`).toStrictEqual(expected);
      }
    }
    expect(mismatches).toStrictEqual([]);
  });

  it('spec(T-007:AC-1) matches the composed expectation when the pool has many templates', () => {
    // Composition over a multi-template pool also pins `pick`'s single draw and the eligible
    // pool's ORDER: `pick` indexes into the filtered array, so an implementation that filters
    // by rebuilding the pool in another order lands on a different template.
    const mismatches: string[] = [];
    for (const seed of SWEEP_SEEDS) {
      for (const recent of [[], ['t1'], ['t3', 't1'], POOL.map((template) => template.id)]) {
        const input: GeneratorInput = {
          templates: POOL,
          recentTemplateIds: recent,
          rng: createRng(seed),
        };
        const actual = generateQuestion(input);
        const expected = composeExpected(input);
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          mismatches.push(`${seed}/[${recent.join(',')}]`);
        }
        expect(actual, `${seed}/[${recent.join(',')}]`).toStrictEqual(expected);
      }
    }
    expect(mismatches).toStrictEqual([]);
  });

  it('spec(T-007:AC-1) never reaches Math.random', () => {
    // Behavioural proof, not a source scan (LESSONS.md L-013). The determinism lint rule is
    // scoped to src/**, so it cannot be this suite's authority on the module's purity.
    const original = Math.random;
    const poisoned = (): number => {
      throw new Error('Math.random() was called — every draw must go through the seeded Rng');
    };
    try {
      Math.random = poisoned;
      const input: GeneratorInput = {
        templates: DIMENSION_MATRIX,
        recentTemplateIds: [],
        rng: createRng(4096),
      };
      expect(generateQuestion(input)).toStrictEqual(composeExpected(input));
    } finally {
      Math.random = original;
    }
  });

  it('spec(T-007:AC-1) does not mutate the arrays it is given', () => {
    // Both arrays are passed in DESCENDING order deliberately. `POOL`'s ids are already
    // ascending, so a fixture in its natural order cannot tell "leaves the caller's array
    // alone" apart from "normalises it in place first" — the two coincide, and a test that
    // measures a coincidence measures nothing (LESSONS.md L-020). Verified: with the pool in
    // natural order an implementation that sorts `input.templates` in place survived this
    // suite; reversed, it dies here.
    const templates = [...POOL].reverse();
    const recent = ['t8', 't1', 't5'];
    const templatesBefore = templates.map((template) => template.id);
    const recentBefore = [...recent];

    expect(templatesBefore).not.toStrictEqual([...templatesBefore].sort());
    expect(recentBefore).not.toStrictEqual([...recentBefore].sort());

    generateQuestion({ templates, recentTemplateIds: recent, rng: createRng(7) });

    expect(templates.map((template) => template.id)).toStrictEqual(templatesBefore);
    expect(recent).toStrictEqual(recentBefore);
  });
});

// =============================================================================================
// AC-2 — seed sensitivity
// =============================================================================================

describe('generateQuestion — different seeds diverge (AC-2)', () => {
  const SEQUENCE_LENGTH = 200;

  it('spec(T-007:AC-2) the pool is the eight shapes the criterion is stated against', () => {
    // The effect-size floor below is computed from the pool size, so the premise is asserted
    // rather than assumed: at RECENT_TEMPLATE_WINDOW = 5 the derived pool is exactly eight.
    expect(POOL_SIZE).toBe(8);
    expect(POOL).toHaveLength(8);
    expect(RECENT_TEMPLATE_WINDOW).toBeLessThan(POOL_SIZE);
  });

  it('spec(T-007:AC-2) produces two non-identical templateId sequences from two seeds', () => {
    const first = generateSequence(POOL, 11, SEQUENCE_LENGTH).map((question) => question.templateId);
    const second = generateSequence(POOL, 22, SEQUENCE_LENGTH).map((question) => question.templateId);

    expect(first).toHaveLength(SEQUENCE_LENGTH);
    expect(second).toHaveLength(SEQUENCE_LENGTH);
    expect(first).not.toStrictEqual(second);
  });

  it('spec(T-007:AC-2) each sequence reaches every template in the pool', () => {
    // The discriminator for the criterion above (LESSONS.md L-006/L-012): "the two sequences
    // are not identical" is satisfied by an implementation that picks one template per seed and
    // repeats it 200 times, which deletes template variety — the thing recency exists to serve.
    const shortfalls: string[] = [];
    for (const seed of [11, 22, 20260728, 999999937]) {
      const ids = new Set(
        generateSequence(POOL, seed, SEQUENCE_LENGTH).map((question) => question.templateId),
      );
      if (ids.size !== POOL_SIZE) {
        shortfalls.push(`seed ${seed} reached ${ids.size} of ${POOL_SIZE}`);
      }
    }
    expect(shortfalls).toStrictEqual([]);
  });

  it('spec(T-007:AC-2) disagrees position-by-position at the rate independent streams imply', () => {
    // Direction without magnitude is the L-006 failure: an implementation whose sequences differ
    // in one position out of 200 satisfies "not identical" while being effectively seed-blind.
    //
    // Closed-form floor. Two independent uniform draws over POOL_SIZE templates agree with
    // probability 1/POOL_SIZE, so the per-position disagreement rate is p = (n-1)/n = 0.875 and
    // the count over N = 200 positions is Binomial(N, p) with sd = sqrt(N·p·(1-p)) ≈ 4.677,
    // i.e. sd/N ≈ 0.0234 as a rate. The floor is set six sd below the mean — 0.7347 at n = 8 —
    // which leaves visible margin over the measured worst case of 0.83 across 60 seed pairs
    // (LESSONS.md L-021: prefer a derived bound with slack to one at the knife edge).
    const p = (POOL_SIZE - 1) / POOL_SIZE;
    const sd = Math.sqrt((p * (1 - p)) / SEQUENCE_LENGTH);
    const floor = p - 6 * sd;

    const belowFloor: string[] = [];
    for (let pair = 0; pair < 40; pair += 1) {
      const left = generateSequence(POOL, 1000 + pair, SEQUENCE_LENGTH).map((q) => q.templateId);
      const right = generateSequence(POOL, 5000 + pair, SEQUENCE_LENGTH).map((q) => q.templateId);
      let differing = 0;
      for (let index = 0; index < SEQUENCE_LENGTH; index += 1) {
        if (left[index] !== right[index]) {
          differing += 1;
        }
      }
      const rate = differing / SEQUENCE_LENGTH;
      if (rate < floor) {
        belowFloor.push(`pair ${pair}: ${rate.toFixed(4)} < ${floor.toFixed(4)}`);
      }
    }

    expect(floor).toBeGreaterThan(0.7);
    expect(belowFloor).toStrictEqual([]);
  });
});

// =============================================================================================
// AC-3 — the recency window
// =============================================================================================

describe('generateQuestion — recency window (AC-3)', () => {
  it('spec(T-007:AC-3) never serves an id inside the first RECENT_TEMPLATE_WINDOW entries', () => {
    let recentTemplateIds: readonly string[] = POOL.slice(0, RECENT_TEMPLATE_WINDOW).map(
      (template) => template.id,
    );
    let rng = createRng(20260728);

    const violations: string[] = [];
    const served: string[] = [];
    for (let call = 0; call < 500; call += 1) {
      const window = recentTemplateIds.slice(0, RECENT_TEMPLATE_WINDOW);
      const [question, next] = generateQuestion({ templates: POOL, recentTemplateIds, rng });
      rng = next;
      if (window.includes(question.templateId)) {
        violations.push(`call ${call}: served ${question.templateId} from [${window.join(',')}]`);
      }
      served.push(question.templateId);
      recentTemplateIds = [question.templateId, ...recentTemplateIds];
    }

    expect(served).toHaveLength(500);
    expect(violations).toStrictEqual([]);
    // The history grew to 505 entries, so an implementation that reads the whole list rather
    // than the first w would have emptied the pool and fallen back — and then served a
    // recent id, which the assertion above would have caught.
    expect(recentTemplateIds).toHaveLength(500 + RECENT_TEMPLATE_WINDOW);
  });

  it('spec(T-007:AC-3) every template is still reachable across the run', () => {
    let recentTemplateIds: readonly string[] = POOL.slice(0, RECENT_TEMPLATE_WINDOW).map(
      (template) => template.id,
    );
    let rng = createRng(4242);

    const seen = new Set<string>();
    for (let call = 0; call < 500; call += 1) {
      const [question, next] = generateQuestion({ templates: POOL, recentTemplateIds, rng });
      rng = next;
      seen.add(question.templateId);
      recentTemplateIds = [question.templateId, ...recentTemplateIds];
    }

    // A window that permanently excluded part of the pool would starve a skill of variety.
    expect([...seen].sort()).toStrictEqual(POOL.map((template) => template.id).sort());
  });

  it('spec(T-007:AC-3) the eligible set is exactly the pool minus the first w entries', () => {
    // The discriminator (LESSONS.md L-012). "No recent id was served" is also satisfied by an
    // implementation that excludes the WHOLE history, or w+1 entries, or w-1. Passing the full
    // pool as history makes the boundary observable: with w = RECENT_TEMPLATE_WINDOW the
    // eligible set must be exactly the templates at positions w and beyond.
    const history = POOL.map((template) => template.id);
    const expectedEligible = history.slice(RECENT_TEMPLATE_WINDOW).sort();

    const served = new Set<string>();
    for (let seed = 1; seed <= 400; seed += 1) {
      const [question] = generateQuestion({
        templates: POOL,
        recentTemplateIds: history,
        rng: createRng(seed),
      });
      served.add(question.templateId);
    }

    expect(expectedEligible.length).toBeGreaterThan(0);
    expect([...served].sort()).toStrictEqual(expectedEligible);
  });

  it('spec(T-007:AC-3) ignores entries beyond the window even when they are in the pool', () => {
    // Same boundary from the other side: an id that sits at position w must be eligible, so a
    // history that repeats the same w ids and then names every other template must still be
    // able to serve those later templates.
    const inWindow = POOL.slice(0, RECENT_TEMPLATE_WINDOW).map((template) => template.id);
    const beyondWindow = POOL.slice(RECENT_TEMPLATE_WINDOW).map((template) => template.id);
    const history = [...inWindow, ...beyondWindow];

    const served = new Set<string>();
    for (let seed = 1; seed <= 400; seed += 1) {
      const [question] = generateQuestion({
        templates: POOL,
        recentTemplateIds: history,
        rng: createRng(seed),
      });
      served.add(question.templateId);
    }

    expect([...served].sort()).toStrictEqual([...beyondWindow].sort());
    for (const id of inWindow) {
      expect(served.has(id)).toBe(false);
    }
  });
});

// =============================================================================================
// AC-4 — the recency filter degrades to the unfiltered pool
// =============================================================================================

describe('generateQuestion — recency degrades rather than throwing (AC-4)', () => {
  it('spec(T-007:AC-4) serves the only template even when it is the most recent id', () => {
    const [question, next] = generateQuestion({
      templates: [AC9_TEMPLATE],
      recentTemplateIds: [AC9_TEMPLATE.id],
      rng: createRng(9),
    });

    expect(question.templateId).toBe(AC9_TEMPLATE.id);
    expect(question.choices).toHaveLength(CHOICE_COUNT);
    expect(next.state).not.toBe(createRng(9).state);
  });

  it('spec(T-007:AC-4) degrades to the whole unfiltered pool, not to one arbitrary member', () => {
    // The discriminator: "it returned something rather than throwing" is satisfied by an
    // implementation that falls back to `templates[0]`. Every excluded template must come back.
    const pool = makePool(3);
    const history = pool.map((template) => template.id);

    const served = new Set<string>();
    for (let seed = 1; seed <= 400; seed += 1) {
      const [question] = generateQuestion({
        templates: pool,
        recentTemplateIds: history,
        rng: createRng(seed),
      });
      served.add(question.templateId);
    }

    expect([...served].sort()).toStrictEqual([...history].sort());
  });

  it('spec(T-007:AC-4) still degrades when the history is longer than the window', () => {
    const pool = makePool(2);
    const history = [...pool, ...pool, ...pool].map((template) => template.id);
    expect(history.length).toBeGreaterThan(RECENT_TEMPLATE_WINDOW);

    const served = new Set<string>();
    for (let seed = 1; seed <= 200; seed += 1) {
      const [question] = generateQuestion({
        templates: pool,
        recentTemplateIds: history,
        rng: createRng(seed),
      });
      served.add(question.templateId);
    }

    expect([...served].sort()).toStrictEqual(pool.map((template) => template.id).sort());
  });
});

// =============================================================================================
// AC-5 — the empty pool
// =============================================================================================

describe('generateQuestion — empty pool (AC-5)', () => {
  it('spec(T-007:AC-5) throws QuestionGenerationError with code NO_TEMPLATE', () => {
    const error = expectGenerationError(
      () => generateQuestion({ templates: [], recentTemplateIds: [], rng: createRng(1) }),
      'NO_TEMPLATE',
    );
    expect(error.name).toBe('QuestionGenerationError');
    expect(error.message.length).toBeGreaterThan(0);
  });

  it('spec(T-007:AC-5) throws NO_TEMPLATE whatever the history contains', () => {
    const histories: readonly (readonly string[])[] = [[], ['t1'], POOL.map((template) => template.id)];
    for (const recentTemplateIds of histories) {
      expectGenerationError(
        () => generateQuestion({ templates: [], recentTemplateIds, rng: createRng(2) }),
        'NO_TEMPLATE',
      );
    }
  });
});

// =============================================================================================
// AC-6 — rejection sampling
// =============================================================================================

describe('generateQuestion — rejection sampling (AC-6)', () => {
  const SAMPLE_COUNT = 1000;

  /** Every (a, b) pair the declared ranges admit, and the subset the constraint admits. */
  function legalPairs(): { readonly all: number; readonly satisfying: readonly string[] } {
    const [aLo, aHi] = rangeOf(AC6_TEMPLATE, 'a');
    const [bLo, bHi] = rangeOf(AC6_TEMPLATE, 'b');
    const satisfying: string[] = [];
    let all = 0;
    for (let a = aLo; a <= aHi; a += 1) {
      for (let b = bLo; b <= bHi; b += 1) {
        all += 1;
        if ((AC6_TEMPLATE.constraints ?? []).every((c) => evaluatePredicate(c, { a, b }))) {
          satisfying.push(`${a},${b}`);
        }
      }
    }
    return { all, satisfying };
  }

  it('spec(T-007:AC-6) the constraint is load-bearing over the declared ranges', () => {
    // Guards against a vacuous pass (LESSONS.md L-020): if every pair in range satisfied the
    // constraint, the sweep below would prove nothing about rejection sampling at all.
    const { all, satisfying } = legalPairs();
    expect(all).toBe(81);
    expect(satisfying).toHaveLength(45);
    expect(satisfying.length).toBeLessThan(all);
  });

  it('spec(T-007:AC-6) keeps every draw in range and constraint-satisfying over 1,000 questions', () => {
    let rng = createRng(20260728);
    const outOfRange: string[] = [];
    const nonInteger: string[] = [];
    const violating: string[] = [];

    const [aLo, aHi] = rangeOf(AC6_TEMPLATE, 'a');
    const [bLo, bHi] = rangeOf(AC6_TEMPLATE, 'b');

    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      const [question, next] = generateQuestion({
        templates: [AC6_TEMPLATE],
        recentTemplateIds: [],
        rng,
      });
      rng = next;
      const a = paramOf(question.params, 'a');
      const b = paramOf(question.params, 'b');
      if (!Number.isInteger(a) || !Number.isInteger(b)) {
        nonInteger.push(`${index}: a=${a} b=${b}`);
      }
      if (a < aLo || a > aHi || b < bLo || b > bHi) {
        outOfRange.push(`${index}: a=${a} b=${b}`);
      }
      if (!(AC6_TEMPLATE.constraints ?? []).every((c) => evaluatePredicate(c, question.params))) {
        violating.push(`${index}: a=${a} b=${b}`);
      }
    }

    expect(nonInteger).toStrictEqual([]);
    expect(outOfRange).toStrictEqual([]);
    expect(violating).toStrictEqual([]);
  });

  it('spec(T-007:AC-6) samples across the whole satisfying region, not one fixed pair', () => {
    // The discriminator: "every pair satisfies a + b <= 10" is satisfied by an implementation
    // that returns (1, 1) forever. Over 1,000 draws of 45 equally-likely satisfying pairs the
    // chance of missing any single one is 45·(44/45)^1000 ≈ 1e-8, so a shortfall of more than
    // three is a real defect rather than variance.
    const { satisfying } = legalPairs();
    let rng = createRng(31337);
    const observed = new Set<string>();
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      const [question, next] = generateQuestion({
        templates: [AC6_TEMPLATE],
        recentTemplateIds: [],
        rng,
      });
      rng = next;
      observed.add(`${paramOf(question.params, 'a')},${paramOf(question.params, 'b')}`);
    }

    expect(observed.size).toBeGreaterThanOrEqual(satisfying.length - 3);
    for (const pair of observed) {
      expect(satisfying).toContain(pair);
    }
  });

  it('spec(T-007:AC-6) evaluates every entry in constraints, not just the first', () => {
    // The ticket: "Evaluate every entry in `constraints`; if any is false, discard the whole
    // draw". A single-constraint fixture cannot tell that apart from checking `constraints[0]`
    // and stopping, so the premise is asserted first: there really are draws that pass the first
    // constraint and fail the second, which is what makes the sweep below discriminating.
    const constraints = AC6_TWO_CONSTRAINT_TEMPLATE.constraints ?? [];
    expect(constraints).toHaveLength(2);

    const firstOnly: string[] = [];
    const bothHold: string[] = [];
    for (let a = 1; a <= 9; a += 1) {
      for (let b = 1; b <= 9; b += 1) {
        const passes = constraints.map((constraint) => evaluatePredicate(constraint, { a, b }));
        if (passes[0] === true && passes[1] === false) {
          firstOnly.push(`${a},${b}`);
        }
        if (passes.every((passed) => passed)) {
          bothHold.push(`${a},${b}`);
        }
      }
    }
    expect(firstOnly.length).toBeGreaterThan(0);
    expect(bothHold.length).toBeGreaterThan(0);

    let rng = createRng(60606);
    const violations: string[] = [];
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      const [question, next] = generateQuestion({
        templates: [AC6_TWO_CONSTRAINT_TEMPLATE],
        recentTemplateIds: [],
        rng,
      });
      rng = next;
      const failed = constraints.filter((constraint) => !evaluatePredicate(constraint, question.params));
      if (failed.length > 0) {
        violations.push(
          `${index}: {${Object.entries(question.params)
            .map(([name, value]) => `${name}=${value}`)
            .join(', ')}} fails ${failed.join(' & ')}`,
        );
      }
    }
    expect(violations).toStrictEqual([]);
  });

  it('spec(T-007:AC-6) draws parameters in lexicographically ascending key order', () => {
    // LESSONS.md L-020: a fixture whose keys are declared in sorted order cannot distinguish
    // the ticket's rule from `Object.keys` insertion order, because the two coincide.
    // ORDERING_TEMPLATE declares `b` before `a` with disjoint ranges, so the two readings assign
    // the two draws the other way round.
    expect(Object.keys(ORDERING_TEMPLATE.params)).toStrictEqual(['b', 'a']);

    const wrong: string[] = [];
    let discriminating = 0;
    const seeds = 200;

    for (let seed = 1; seed <= seeds; seed += 1) {
      const [, afterPick] = pick(createRng(seed), [ORDERING_TEMPLATE]);
      const [aRangeLo, aRangeHi] = rangeOf(ORDERING_TEMPLATE, 'a');
      const [bRangeLo, bRangeHi] = rangeOf(ORDERING_TEMPLATE, 'b');

      // Lexicographic order: `a` consumes the first draw, `b` the second.
      const [sortedA, afterFirst] = nextInt(afterPick, aRangeLo, aRangeHi);
      const [sortedB] = nextInt(afterFirst, bRangeLo, bRangeHi);
      // Declaration order: `b` consumes the first draw, `a` the second.
      const [insertionB, afterFirstInsertion] = nextInt(afterPick, bRangeLo, bRangeHi);
      const [insertionA] = nextInt(afterFirstInsertion, aRangeLo, aRangeHi);

      if (sortedA !== insertionA || sortedB !== insertionB) {
        discriminating += 1;
      }

      const [question] = generateQuestion({
        templates: [ORDERING_TEMPLATE],
        recentTemplateIds: [],
        rng: createRng(seed),
      });
      if (paramOf(question.params, 'a') !== sortedA || paramOf(question.params, 'b') !== sortedB) {
        wrong.push(
          `seed ${seed}: got a=${paramOf(question.params, 'a')} b=${paramOf(question.params, 'b')}` +
            `, lexicographic order requires a=${sortedA} b=${sortedB}`,
        );
      }
    }

    // Proving the assertion above is not vacuous: for almost every seed the two readings
    // genuinely disagree, so passing it is evidence rather than coincidence.
    expect(discriminating).toBeGreaterThanOrEqual(seeds - 5);
    expect(wrong).toStrictEqual([]);
  });
});

// =============================================================================================
// AC-7 — exhausting the attempt bound
// =============================================================================================

describe('generateQuestion — unsatisfiable constraints (AC-7)', () => {
  it('spec(T-007:AC-7) throws CONSTRAINTS_UNSATISFIED naming the template id', () => {
    const error = expectGenerationError(
      () =>
        generateQuestion({
          templates: [UNSATISFIABLE_TEMPLATE],
          recentTemplateIds: [],
          rng: createRng(5),
        }),
      'CONSTRAINTS_UNSATISFIED',
    );
    expect(error.message).toContain(UNSATISFIABLE_TEMPLATE.id);
  });

  it('spec(T-007:AC-7) throws for every seed, not just an unlucky one', () => {
    const survivors: number[] = [];
    for (const seed of SWEEP_SEEDS) {
      try {
        generateQuestion({
          templates: [UNSATISFIABLE_TEMPLATE],
          recentTemplateIds: [],
          rng: createRng(seed),
        });
        survivors.push(seed);
      } catch {
        // expected
      }
    }
    expect(survivors).toStrictEqual([]);
  });

  it('spec(T-007:AC-7) the bound is exactly MAX_PARAM_SAMPLE_ATTEMPTS attempts', () => {
    // The ticket: "Up to `MAX_PARAM_SAMPLE_ATTEMPTS` (100) attempts; on exhaustion throw",
    // and ARCHITECTURE.md §4.1: "a template that fails 100 samples throws in tests". So the
    // first sample counts as attempt 1 and there are MAX attempts in total.
    //
    // Both boundary seeds are located at run time from the frozen `nextInt` stream rather than
    // written in as literals, so the test tracks MAX_PARAM_SAMPLE_ATTEMPTS if it is retuned
    // instead of going stale against it.
    const max = MAX_PARAM_SAMPLE_ATTEMPTS;
    let seedAtBound = -1;
    let seedPastBound = -1;
    for (let seed = 1; seed <= 50000 && (seedAtBound < 0 || seedPastBound < 0); seed += 1) {
      const attempt = firstSatisfyingAttempt(seed, BOUND_PROBE_TEMPLATE, max + 1);
      if (attempt === max && seedAtBound < 0) {
        seedAtBound = seed;
      }
      if (attempt === max + 1 && seedPastBound < 0) {
        seedPastBound = seed;
      }
    }

    expect(seedAtBound, 'no seed found whose first satisfying attempt is exactly the bound').toBeGreaterThan(
      0,
    );
    expect(
      seedPastBound,
      'no seed found whose first satisfying attempt is one past the bound',
    ).toBeGreaterThan(0);

    // Succeeds only if the implementation takes all MAX attempts — a bound of MAX - 1 throws.
    const [question] = generateQuestion({
      templates: [BOUND_PROBE_TEMPLATE],
      recentTemplateIds: [],
      rng: createRng(seedAtBound),
    });
    expect(paramOf(question.params, 'a')).toBe(7);

    // Throws only if the implementation stops at MAX — a bound of MAX + 1 succeeds here.
    const error = expectGenerationError(
      () =>
        generateQuestion({
          templates: [BOUND_PROBE_TEMPLATE],
          recentTemplateIds: [],
          rng: createRng(seedPastBound),
        }),
      'CONSTRAINTS_UNSATISFIED',
    );
    expect(error.message).toContain(BOUND_PROBE_TEMPLATE.id);
  });
});

// =============================================================================================
// AC-8 — no constraints key
// =============================================================================================

describe('generateQuestion — templates without constraints (AC-8)', () => {
  const NO_CONSTRAINTS_TEMPLATE = makeTemplate({
    id: 'no-constraints',
    text: '{a} + {b}',
    params: { a: [2, 8], b: [-4, 4] },
    answerExpr: 'a + b',
  });

  it('spec(T-007:AC-8) the fixture really omits the key rather than carrying an empty array', () => {
    // Otherwise this criterion would be indistinguishable from the empty-array case and an
    // implementation reading `template.constraints.length` would pass while crashing on the
    // shape the criterion is actually about.
    expect(Object.hasOwn(NO_CONSTRAINTS_TEMPLATE, 'constraints')).toBe(false);
    expect(NO_CONSTRAINTS_TEMPLATE.constraints).toBeUndefined();
  });

  it('spec(T-007:AC-8) succeeds with every parameter inside its declared inclusive range', () => {
    const outOfRange: string[] = [];
    const observedA = new Set<number>();
    const observedB = new Set<number>();
    let rng = createRng(20260728);

    for (let index = 0; index < 500; index += 1) {
      const [question, next] = generateQuestion({
        templates: [NO_CONSTRAINTS_TEMPLATE],
        recentTemplateIds: [],
        rng,
      });
      rng = next;
      for (const name of Object.keys(NO_CONSTRAINTS_TEMPLATE.params)) {
        const [lo, hi] = rangeOf(NO_CONSTRAINTS_TEMPLATE, name);
        const value = paramOf(question.params, name);
        if (!Number.isInteger(value) || value < lo || value > hi) {
          outOfRange.push(`${index}: ${name}=${value} outside [${lo}, ${hi}]`);
        }
      }
      observedA.add(paramOf(question.params, 'a'));
      observedB.add(paramOf(question.params, 'b'));
    }

    expect(outOfRange).toStrictEqual([]);
    // Inclusive means inclusive at BOTH ends: a one-sided range check is satisfied by an
    // implementation that never reaches a boundary value at all.
    expect([...observedA].sort((x, y) => x - y)).toStrictEqual([2, 3, 4, 5, 6, 7, 8]);
    expect([...observedB].sort((x, y) => x - y)).toStrictEqual([-4, -3, -2, -1, 0, 1, 2, 3, 4]);
  });

  it('spec(T-007:AC-8) succeeds for a template carrying an empty constraints array', () => {
    const emptyConstraints = makeTemplate({
      id: 'empty-constraints',
      text: '{a}',
      params: { a: [1, 9] },
      constraints: [],
      answerExpr: 'a',
    });
    const [question] = generateQuestion({
      templates: [emptyConstraints],
      recentTemplateIds: [],
      rng: createRng(77),
    });
    expect(question.templateId).toBe('empty-constraints');
    expect(paramOf(question.params, 'a')).toBeGreaterThanOrEqual(1);
    expect(paramOf(question.params, 'a')).toBeLessThanOrEqual(9);
  });
});

// =============================================================================================
// AC-9 — the degenerate single-value range
// =============================================================================================

describe('generateQuestion — degenerate parameter range (AC-9)', () => {
  it('spec(T-007:AC-9) yields the single legal value on every attempt', () => {
    const wrong: string[] = [];
    for (const seed of SWEEP_SEEDS) {
      const [question] = generateQuestion({
        templates: [AC9_TEMPLATE],
        recentTemplateIds: [],
        rng: createRng(seed),
      });
      const a = paramOf(question.params, 'a');
      if (a !== 4) {
        wrong.push(`seed ${seed}: a=${a}`);
      }
    }
    expect(wrong).toStrictEqual([]);
  });

  it('spec(T-007:AC-9) succeeds on the first sample, consuming exactly one draw per parameter', () => {
    // "Succeeds on the first sample" is observable through the returned Rng: a correct call
    // consumes 1 draw for `pick`, one per parameter for the single attempt, and CHOICE_COUNT - 1
    // for the shuffle. An implementation that re-sampled would return a further-advanced state.
    const drift: string[] = [];
    for (const seed of SWEEP_SEEDS) {
      const [, next] = generateQuestion({
        templates: [AC9_TEMPLATE],
        recentTemplateIds: [],
        rng: createRng(seed),
      });
      const expected = rngAfterDraws(seed, AC9_TEMPLATE, 1);
      if (next.state !== expected.state) {
        drift.push(`seed ${seed}: got state ${next.state}, one attempt gives ${expected.state}`);
      }
      expect(next).toStrictEqual(expected);
    }
    expect(drift).toStrictEqual([]);

    // And the two-attempt state is genuinely different, so the assertion above discriminates.
    expect(rngAfterDraws(1, AC9_TEMPLATE, 2).state).not.toBe(rngAfterDraws(1, AC9_TEMPLATE, 1).state);
  });
});

// =============================================================================================
// AC-10 — text rendering
// =============================================================================================

describe('generateQuestion — text rendering (AC-10)', () => {
  it('spec(T-007:AC-10) renders "{a} + {b} = ?" with a=3, b=5 as exactly "3 + 5 = ?"', () => {
    const template = makeTemplate({
      id: 'render-ac10',
      text: '{a} + {b} = ?',
      params: { a: [3, 3], b: [5, 5] },
      answerExpr: 'a + b',
    });
    const [question] = generateQuestion({
      templates: [template],
      recentTemplateIds: [],
      rng: createRng(1),
    });

    expect(question.params).toStrictEqual({ a: 3, b: 5 });
    expect(question.text).toBe('3 + 5 = ?');
    expect(question.text).not.toContain('{');
    expect(question.text).not.toContain('}');
  });

  it('spec(T-007:AC-10) replaces every occurrence of a repeated token', () => {
    // "Replace every `{name}` token" — a non-global replacement leaves the second `{a}` behind,
    // which would then have to throw INVALID_QUESTION instead of rendering.
    const template = makeTemplate({
      id: 'render-repeated',
      text: '{a} + {a} = ? ({a} twice)',
      params: { a: [6, 6] },
      answerExpr: 'a + a',
    });
    const [question] = generateQuestion({
      templates: [template],
      recentTemplateIds: [],
      rng: createRng(2),
    });
    expect(question.text).toBe('6 + 6 = ? (6 twice)');
  });

  it('spec(T-007:AC-10) leaves no brace behind for any fixture in the dimension sweep', () => {
    const withBraces: string[] = [];
    for (const template of DIMENSION_MATRIX) {
      for (const seed of SWEEP_SEEDS) {
        const [question] = generateQuestion({
          templates: [template],
          recentTemplateIds: [],
          rng: createRng(seed),
        });
        if (question.text.includes('{') || question.text.includes('}')) {
          withBraces.push(`${template.id}@${seed}: ${question.text}`);
        }
      }
    }
    expect(withBraces).toStrictEqual([]);
  });

  it('spec(T-007:AC-10) accepts a declared parameter the text never uses', () => {
    // "every param need not be used" — the unused parameter must still be sampled and reported.
    const template = makeTemplate({
      id: 'render-unused',
      text: 'only {a} appears',
      params: { a: [7, 7], c: [2, 2] },
      answerExpr: 'a + c',
    });
    const [question] = generateQuestion({
      templates: [template],
      recentTemplateIds: [],
      rng: createRng(3),
    });

    expect(question.text).toBe('only 7 appears');
    expect(question.params).toStrictEqual({ a: 7, c: 2 });
  });

  it('spec(T-007:AC-10) renders a text with no tokens unchanged', () => {
    const template = makeTemplate({
      id: 'render-no-token',
      text: 'How many barrels?',
      params: { a: [1, 9] },
      answerExpr: 'a',
    });
    const [question] = generateQuestion({
      templates: [template],
      recentTemplateIds: [],
      rng: createRng(4),
    });
    expect(question.text).toBe('How many barrels?');
  });
});

// =============================================================================================
// AC-11 — an unrenderable text
// =============================================================================================

describe('generateQuestion — unrendered tokens (AC-11)', () => {
  it('spec(T-007:AC-11) throws INVALID_QUESTION for a token naming no declared param', () => {
    const template = makeTemplate({
      id: 'undeclared-token-tpl',
      text: '{a} + {z} = ?',
      params: { a: [1, 9] },
      answerExpr: 'a',
    });
    const error = expectGenerationError(
      () => generateQuestion({ templates: [template], recentTemplateIds: [], rng: createRng(1) }),
      'INVALID_QUESTION',
    );
    // Definition of Done: "Every failure path throws a typed QuestionGenerationError with a
    // code and the template id."
    expect(error.message).toContain(template.id);
  });

  it('spec(T-007:AC-11) throws INVALID_QUESTION for a stray brace of either kind', () => {
    const strays: readonly (readonly [string, string])[] = [
      ['stray-open', '{a} + {'],
      ['stray-close', '{a} + }'],
      ['unclosed-name', '{a} + {b = ?'],
      ['bare-braces', '{a} {}'],
    ];
    for (const [id, text] of strays) {
      const template = makeTemplate({ id, text, params: { a: [1, 9] }, answerExpr: 'a' });
      const error = expectGenerationError(
        () => generateQuestion({ templates: [template], recentTemplateIds: [], rng: createRng(1) }),
        'INVALID_QUESTION',
      );
      expect(error.message, id).toContain(id);
    }
  });

  it('spec(T-007:AC-11) throws for every seed, so the check is not draw-dependent', () => {
    const template = makeTemplate({
      id: 'undeclared-every-seed',
      text: '{a} + {z} = ?',
      params: { a: [1, 9] },
      answerExpr: 'a',
    });
    const survivors: number[] = [];
    for (const seed of SWEEP_SEEDS) {
      try {
        generateQuestion({ templates: [template], recentTemplateIds: [], rng: createRng(seed) });
        survivors.push(seed);
      } catch {
        // expected
      }
    }
    expect(survivors).toStrictEqual([]);
  });

  it('spec(T-007:AC-11) does not reject a text whose every token is declared', () => {
    // The discriminator: an implementation that throws INVALID_QUESTION whenever the text
    // contains a brace at all would pass every assertion above. Braces are legal input; only
    // braces that SURVIVE substitution are not.
    const template = makeTemplate({
      id: 'all-declared',
      text: '{a} and {b} and {a}',
      params: { a: [1, 1], b: [2, 2] },
      answerExpr: 'a + b',
    });
    const [question] = generateQuestion({
      templates: [template],
      recentTemplateIds: [],
      rng: createRng(1),
    });
    expect(question.text).toBe('1 and 2 and 1');
  });
});

// =============================================================================================
// AC-12 — four-choice assembly
// =============================================================================================

describe('generateQuestion — four-choice assembly (AC-12)', () => {
  it('spec(T-007:AC-12) CHOICE_COUNT is the four the criterion is stated against', () => {
    expect(CHOICE_COUNT).toBe(4);
  });

  it('spec(T-007:AC-12) holds every assembly invariant across the whole dimension sweep', () => {
    const failures: string[] = [];

    for (const template of DIMENSION_MATRIX) {
      for (const seed of SWEEP_SEEDS) {
        const label = `${template.id}@${seed}`;
        const [question] = generateQuestion({
          templates: [template],
          recentTemplateIds: [],
          rng: createRng(seed),
        });

        if (question.choices.length !== CHOICE_COUNT) {
          failures.push(`${label}: ${question.choices.length} choices`);
        }
        if (!Number.isInteger(question.correctIndex)) {
          failures.push(`${label}: correctIndex ${question.correctIndex} is not an integer`);
        }
        if (question.correctIndex < 0 || question.correctIndex > CHOICE_COUNT - 1) {
          failures.push(`${label}: correctIndex ${question.correctIndex} out of range`);
        }

        const answer = evaluateNumber(template.answerExpr, question.params);
        const correct = question.choices[question.correctIndex];
        if (correct === undefined || correct.value !== answer) {
          failures.push(`${label}: choices[${question.correctIndex}] is not the answer ${answer}`);
        }

        const values = question.choices.map((choice) => choice.value);
        if (new Set(values).size !== values.length) {
          failures.push(`${label}: duplicate values ${JSON.stringify(values)}`);
        }
        if (values.filter((value) => value === answer).length !== 1) {
          failures.push(`${label}: the answer appears ${values.filter((v) => v === answer).length} times`);
        }
        for (const choice of question.choices) {
          if (choice.label !== String(choice.value)) {
            failures.push(`${label}: label ${JSON.stringify(choice.label)} for value ${choice.value}`);
          }
          if (!Number.isFinite(choice.value)) {
            failures.push(`${label}: non-finite choice value ${choice.value}`);
          }
        }

        if (question.templateId !== template.id) {
          failures.push(`${label}: templateId ${question.templateId}`);
        }
        if (question.skill !== template.skill) {
          failures.push(`${label}: skill ${question.skill} but template declares ${template.skill}`);
        }
      }
    }

    expect(failures).toStrictEqual([]);
  });

  it('spec(T-007:AC-12) produces a Question that satisfies T-003 assertQuestion', () => {
    // The frozen runtime guard on the shape the UI consumes. Independent of the checks above,
    // so a disagreement between this suite and T-003's contract surfaces here.
    const rejected: string[] = [];
    for (const template of DIMENSION_MATRIX) {
      const [question] = generateQuestion({
        templates: [template],
        recentTemplateIds: [],
        rng: createRng(20260728),
      });
      try {
        assertQuestion(question);
      } catch (error) {
        rejected.push(`${template.id}: ${(error as Error).message}`);
      }
    }
    expect(rejected).toStrictEqual([]);
  });

  it('spec(T-007:AC-12) offers the three distractors T-005 builds for the same draw', () => {
    // The discriminator for "all four values are pairwise distinct": an implementation that
    // invented its own three wrong answers would satisfy distinctness while bypassing T-005's
    // plausibility screening entirely.
    const mismatches: string[] = [];
    for (const template of DIMENSION_MATRIX) {
      for (const seed of SWEEP_SEEDS) {
        const [question] = generateQuestion({
          templates: [template],
          recentTemplateIds: [],
          rng: createRng(seed),
        });
        const answer = evaluateNumber(template.answerExpr, question.params);
        const expectedWrong = [...buildDistractors(template, question.params)].sort((x, y) => x - y);
        const actualWrong = question.choices
          .map((choice) => choice.value)
          .filter((value) => value !== answer)
          .sort((x, y) => x - y);
        if (JSON.stringify(actualWrong) !== JSON.stringify(expectedWrong)) {
          mismatches.push(
            `${template.id}@${seed}: ${JSON.stringify(actualWrong)} vs ${JSON.stringify(expectedWrong)}`,
          );
        }
      }
    }
    expect(mismatches).toStrictEqual([]);
  });
});

// =============================================================================================
// AC-13 — the correct answer is not biased toward a slot
// =============================================================================================

describe('generateQuestion — shuffle fairness (AC-13)', () => {
  const TRIALS = 2000;
  const LOWER = 350;
  const UPPER = 650;

  /** The four choice-value tuples produced across `TRIALS` incrementing seeds. */
  function sweep(): { readonly indices: readonly number[]; readonly orderings: ReadonlySet<string> } {
    const indices: number[] = [];
    const orderings = new Set<string>();
    for (let seed = 1; seed <= TRIALS; seed += 1) {
      const [question] = generateQuestion({
        templates: [AC9_TEMPLATE],
        recentTemplateIds: [],
        rng: createRng(seed),
      });
      indices.push(question.correctIndex);
      orderings.add(question.choices.map((choice) => choice.value).join('|'));
    }
    return { indices, orderings };
  }

  it('spec(T-007:AC-13) each of the four slots holds the answer between 350 and 650 times', () => {
    const { indices } = sweep();
    const counts = Array.from({ length: CHOICE_COUNT }, () => 0);
    for (const index of indices) {
      counts[index] = (counts[index] ?? 0) + 1;
    }

    expect(indices).toHaveLength(TRIALS);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(TRIALS);
    const outside = counts
      .map((count, index) => ({ count, index }))
      .filter(({ count }) => count < LOWER || count > UPPER);
    expect(outside).toStrictEqual([]);
  });

  it('spec(T-007:AC-13) reaches every one of the 4! orderings of the four choices', () => {
    // The discriminator (LESSONS.md L-012). A uniform histogram over `correctIndex` is a
    // projection: it is satisfied exactly by an implementation that draws one index and swaps
    // the answer into it, leaving the three distractors in declared order — which reaches only
    // CHOICE_COUNT orderings out of CHOICE_COUNT!. The ticket specifies `shuffle(rng, choices)`,
    // a full permutation, so all of them must be reachable.
    const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
    const { orderings } = sweep();

    // The premise: AC9_TEMPLATE has a degenerate range, so all four values are identical across
    // seeds and an ordering really is a permutation of one fixed tuple.
    const valueSets = new Set([...orderings].map((ordering) => ordering.split('|').sort().join('|')));
    expect(valueSets.size).toBe(1);

    expect(orderings.size).toBe(factorial(CHOICE_COUNT));
  });
});

// =============================================================================================
// AC-14 — the PRNG stream advances and is not reset
// =============================================================================================

describe('generateQuestion — the Rng advances (AC-14)', () => {
  const TWO_PARAM_TEMPLATE = makeTemplate({
    id: 'stream-advance',
    text: '{a} x {b}',
    params: { a: [1, 12], b: [1, 12] },
    answerExpr: 'a * b',
    skill: 'mult_facts',
  });

  it('spec(T-007:AC-14) returns an Rng whose state differs from the input', () => {
    // Always true for a correct implementation: mulberry32 advances its state by
    // k * 0x6d2b79f5 (mod 2^32) after k draws, and 0x6d2b79f5 is odd, so the state can only
    // return to itself after a multiple of 2^32 draws — far more than any single call makes.
    const unchanged: string[] = [];
    for (const seed of SWEEP_SEEDS) {
      const input = createRng(seed);
      const [, next] = generateQuestion({
        templates: [TWO_PARAM_TEMPLATE],
        recentTemplateIds: [],
        rng: input,
      });
      if (next.state === input.state) {
        unchanged.push(`seed ${seed}: state ${next.state}`);
      }
    }
    expect(unchanged).toStrictEqual([]);
  });

  it('spec(T-007:AC-14) does not reset: chaining the returned Rng advances it again', () => {
    // The exact, seed-independent form of "the PRNG stream advances and is not reset". An
    // implementation that ignored the incoming Rng — or restarted from a fixed seed — would
    // return the same Rng from both calls.
    const resets: string[] = [];
    for (const seed of SWEEP_SEEDS) {
      const [, afterFirst] = generateQuestion({
        templates: [TWO_PARAM_TEMPLATE],
        recentTemplateIds: [],
        rng: createRng(seed),
      });
      const [, afterSecond] = generateQuestion({
        templates: [TWO_PARAM_TEMPLATE],
        recentTemplateIds: [],
        rng: afterFirst,
      });
      if (afterSecond.state === afterFirst.state) {
        resets.push(`seed ${seed}: both calls returned state ${afterFirst.state}`);
      }
    }
    expect(resets).toStrictEqual([]);
  });

  it('spec(T-007:AC-14) the chained call continues the same stream the first call left', () => {
    // Stronger than the two checks above and independent of any statistic: the second call's
    // whole result is what the frozen primitives produce from the advanced state. An
    // implementation that advanced the returned Rng correctly while sampling parameters from the
    // ORIGINAL state passes both checks above and fails this one.
    const mismatches: string[] = [];
    for (const seed of SWEEP_SEEDS) {
      const [, afterFirst] = generateQuestion({
        templates: [TWO_PARAM_TEMPLATE],
        recentTemplateIds: [],
        rng: createRng(seed),
      });
      const chained: GeneratorInput = {
        templates: [TWO_PARAM_TEMPLATE],
        recentTemplateIds: [],
        rng: afterFirst,
      };
      const actual = generateQuestion(chained);
      const expected = composeExpected(chained);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        mismatches.push(`seed ${seed}`);
      }
      expect(actual, `seed ${seed}`).toStrictEqual(expected);
    }
    expect(mismatches).toStrictEqual([]);
  });

  it('spec(T-007:AC-14) a chained call almost never repeats the previous parameter draw', () => {
    // AC-14 also asks for "a different parameter draw than the first call". Two legal draws CAN
    // coincide, so the sound form of that claim is a rate rather than a per-seed guarantee:
    // with two parameters over [1, 12] the collision probability is 1/144, so over N = 500 seeds
    // the expected number of repeats is 500/144 = 3.47 with sd = sqrt(500 * (1/144) * (143/144))
    // = 1.86. The ceiling below sits about twenty sd above the mean, while an implementation that
    // reset the stream would score the full 500 — the discrimination is between 3 and 500, not
    // between 3 and 4.
    const trials = 500;
    let repeats = 0;
    for (let seed = 1; seed <= trials; seed += 1) {
      const [first, afterFirst] = generateQuestion({
        templates: [TWO_PARAM_TEMPLATE],
        recentTemplateIds: [],
        rng: createRng(seed),
      });
      const [second] = generateQuestion({
        templates: [TWO_PARAM_TEMPLATE],
        recentTemplateIds: [],
        rng: afterFirst,
      });
      if (JSON.stringify(first.params) === JSON.stringify(second.params)) {
        repeats += 1;
      }
    }

    const expectedRepeats = trials / 144;
    const sd = Math.sqrt(trials * (1 / 144) * (143 / 144));
    expect(repeats).toBeLessThanOrEqual(Math.ceil(expectedRepeats + 20 * sd));
    expect(repeats).toBeLessThan(trials);
  });
});

// =============================================================================================
// AC-15 — word-problem and read-aloud flags
// =============================================================================================

describe('generateQuestion — flags normalise to booleans (AC-15)', () => {
  const FLAG_CASES: readonly {
    readonly id: string;
    readonly spec: TemplateSpec;
    readonly isWordProblem: boolean;
    readonly readAloud: boolean;
  }[] = [
    {
      id: 'both-true',
      spec: {
        id: 'flags-both-true',
        params: { a: [1, 9] },
        answerExpr: 'a',
        isWordProblem: true,
        readAloud: true,
      },
      isWordProblem: true,
      readAloud: true,
    },
    {
      id: 'both-absent',
      spec: { id: 'flags-both-absent', params: { a: [1, 9] }, answerExpr: 'a' },
      isWordProblem: false,
      readAloud: false,
    },
    {
      id: 'word-only',
      spec: {
        id: 'flags-word-only',
        params: { a: [1, 9] },
        answerExpr: 'a',
        isWordProblem: true,
      },
      isWordProblem: true,
      readAloud: false,
    },
    {
      id: 'aloud-only',
      spec: { id: 'flags-aloud-only', params: { a: [1, 9] }, answerExpr: 'a', readAloud: true },
      isWordProblem: false,
      readAloud: true,
    },
    {
      id: 'both-explicit-false',
      spec: {
        id: 'flags-explicit-false',
        params: { a: [1, 9] },
        answerExpr: 'a',
        isWordProblem: false,
        readAloud: false,
      },
      isWordProblem: false,
      readAloud: false,
    },
  ];

  it('spec(T-007:AC-15) the absent-key fixture really omits both keys', () => {
    const absent = makeTemplate({ id: 'premise-absent', params: { a: [1, 9] }, answerExpr: 'a' });
    expect(Object.hasOwn(absent, 'isWordProblem')).toBe(false);
    expect(Object.hasOwn(absent, 'readAloud')).toBe(false);
  });

  it('spec(T-007:AC-15) carries each flag through as a real boolean', () => {
    const wrong: string[] = [];
    for (const testCase of FLAG_CASES) {
      const template = makeTemplate(testCase.spec);
      const [question] = generateQuestion({
        templates: [template],
        recentTemplateIds: [],
        rng: createRng(15),
      });
      if (!Object.is(question.isWordProblem, testCase.isWordProblem)) {
        wrong.push(`${testCase.id}: isWordProblem ${String(question.isWordProblem)}`);
      }
      if (!Object.is(question.readAloud, testCase.readAloud)) {
        wrong.push(`${testCase.id}: readAloud ${String(question.readAloud)}`);
      }
      if (typeof question.isWordProblem !== 'boolean' || typeof question.readAloud !== 'boolean') {
        wrong.push(`${testCase.id}: a flag is not of type boolean`);
      }
    }
    expect(wrong).toStrictEqual([]);
  });

  it('spec(T-007:AC-15) absent means false, never undefined and never a missing key', () => {
    // `undefined` and `false` are both falsy, so a truthiness assertion cannot tell them apart.
    // The JSON round trip is the boundary check: `JSON.stringify` drops an undefined-valued key
    // entirely, so a question carrying `isWordProblem: undefined` fails to round-trip.
    const template = makeTemplate({ id: 'flags-absent', params: { a: [1, 9] }, answerExpr: 'a' });
    const [question] = generateQuestion({
      templates: [template],
      recentTemplateIds: [],
      rng: createRng(16),
    });

    expect(Object.hasOwn(question, 'isWordProblem')).toBe(true);
    expect(Object.hasOwn(question, 'readAloud')).toBe(true);
    expect(question.isWordProblem).toBe(false);
    expect(question.readAloud).toBe(false);
    expect(Object.is(question.isWordProblem, undefined)).toBe(false);
    expect(Object.is(question.readAloud, undefined)).toBe(false);

    const roundTripped = JSON.parse(JSON.stringify(question)) as Question;
    expect(roundTripped).toStrictEqual(question);
    expect(Object.hasOwn(roundTripped, 'isWordProblem')).toBe(true);
    expect(Object.hasOwn(roundTripped, 'readAloud')).toBe(true);
  });
});

// =============================================================================================
// AC-16 — a DISTRACTOR_FAILURE propagates unchanged
// =============================================================================================

describe('generateQuestion — distractor failure propagates (AC-16)', () => {
  it('spec(T-007:AC-16) the fixture really does starve T-005, measured not assumed', () => {
    // LESSONS.md L-014/L-015: the mutant — here, the failing input — is proven live on its own
    // terms before the generator's behaviour on it means anything.
    const direct = expectGenerationError(
      () => buildDistractors(AC16_TEMPLATE, SATURATED_PARAMS),
      'DISTRACTOR_FAILURE',
    );
    expect(direct.message).toContain(AC16_TEMPLATE.id);
    // The template's single parameter is degenerate, so this IS the draw the generator makes.
    expect(rangeOf(AC16_TEMPLATE, 'a')).toStrictEqual([SATURATED_ANSWER, SATURATED_ANSWER]);
    expect(evaluateNumber(AC16_TEMPLATE.answerExpr, SATURATED_PARAMS)).toBe(SATURATED_ANSWER);
  });

  it('spec(T-007:AC-16) propagates the T-005 error unchanged, message included', () => {
    const direct = expectGenerationError(
      () => buildDistractors(AC16_TEMPLATE, SATURATED_PARAMS),
      'DISTRACTOR_FAILURE',
    );
    const propagated = expectGenerationError(
      () =>
        generateQuestion({
          templates: [AC16_TEMPLATE],
          recentTemplateIds: [],
          rng: createRng(20260728),
        }),
      'DISTRACTOR_FAILURE',
    );

    // "Unchanged" — not re-wrapped, not re-coded, not re-worded.
    expect(propagated.message).toBe(direct.message);
    expect(propagated.name).toBe(direct.name);
  });

  it('spec(T-007:AC-16) propagates for every seed rather than only an unlucky draw', () => {
    const survivors: number[] = [];
    for (const seed of SWEEP_SEEDS) {
      try {
        generateQuestion({
          templates: [AC16_TEMPLATE],
          recentTemplateIds: [],
          rng: createRng(seed),
        });
        survivors.push(seed);
      } catch (error) {
        expect((error as QuestionGenerationError).code, `seed ${seed}`).toBe('DISTRACTOR_FAILURE');
      }
    }
    expect(survivors).toStrictEqual([]);
  });
});
