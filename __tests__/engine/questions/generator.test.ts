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
 *  - **A sweep says what threw, never just that something did** (LESSONS.md L-034). The first
 *    draft's AC-7 and AC-11 sweeps caught bare and asserted an empty survivor list, and a
 *    cross-model review walked through both with an implementation returning the typed error at
 *    the one directly-tested seed and a bare `RangeError` at every other. Every error sweep now
 *    classifies each seed by error TYPE, `code`, and whether the message names the template,
 *    and compares the whole profile at once.
 *
 * Amended 2026-07-28, after that review: AC-7 and AC-11 hardened as above, AC-16's sweep
 * hardened alongside them (it checked `code` but not type), AC-12's `skill`/`templateId`/`label`
 * assertions promoted into the criterion, AC-14's statistical draw-inequality test replaced by
 * the reset comparison the rewritten criterion asks for, and AC-17 (both replay-critical
 * orderings), AC-18 (zero-parameter templates) and AC-19 (the identifier grammar) added.
 *
 * Round 3 (2026-07-28): AC-20 wraps `ExprError` at every evaluated site; AC-5 gains its negative
 * half (`NO_TEMPLATE` never fires on a usable non-empty pool); AC-21 pins earliest-step
 * failure precedence. Do not spy on `assertQuestion` — output validity only (locked-decision).
 *
 * API surface, taken verbatim from the ticket's Context section:
 *
 *     generateQuestion({ templates, recentTemplateIds, rng }) -> readonly [Question, Rng]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { templateSchema } from '@content/schemas';
import type { SkillId, Template } from '@content/schemas';
import { createRng, nextInt, pick, shuffle } from '@engine/rng';
import type { Rng } from '@engine/rng';
import { buildDistractors } from '@engine/questions/distractors';
import { evaluateNumber, evaluatePredicate, ExprError } from '@engine/questions/expr';
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

/**
 * Classifies what `call` did at each seed, as one comparable string per seed.
 *
 * AC-7 and AC-11 require the error **type and `code`** on every seed swept, not merely that
 * something was thrown. A sweep that catches bare and asserts an empty survivor list certifies
 * only that the call did not return — an implementation throwing `RangeError` at every seed but
 * one passes it (LESSONS.md L-034). Returning a profile rather than asserting in the loop keeps
 * the bulk-loop contract: one comparison at the end reports every deviant seed and what it threw.
 */
function errorProfileOverSeeds(
  seeds: readonly number[],
  call: (seed: number) => unknown,
  /** The id the message must name, or `null` for the `NO_TEMPLATE` carve-out. */
  templateId: string | null,
): readonly string[] {
  return seeds.map((seed) => {
    let thrown: unknown;
    let returned = false;
    try {
      call(seed);
      returned = true;
    } catch (error) {
      thrown = error;
    }
    if (returned) {
      return `${seed}: returned normally`;
    }
    if (!(thrown instanceof QuestionGenerationError)) {
      const name = thrown instanceof Error ? thrown.constructor.name : typeof thrown;
      return `${seed}: ${name} (not a QuestionGenerationError)`;
    }
    let idPart: string;
    if (templateId === null) {
      idPart = thrown.message.trim().length > 0 ? 'no-id-required' : 'EMPTY-MESSAGE';
    } else {
      idPart = thrown.message.includes(templateId) ? 'names-id' : 'NO-ID-IN-MESSAGE';
    }
    return `${seed}: QuestionGenerationError/${thrown.code}/${idPart}`;
  });
}

/**
 * Replays the generator's stream up to the point where step 7 shuffles: one `pick` draw, then
 * one `nextInt` per parameter in lexicographically ascending order. Only valid for templates
 * whose first attempt always satisfies their constraints, which is why AC-17's fixture declares
 * none.
 */
function streamBeforeShuffle(seed: number, template: Template): readonly [Params, Rng] {
  return drawInKeyOrder(seed, template, Object.keys(template.params).sort());
}

/**
 * The draw a single attempt produces if the parameter keys are consumed in `keys` order, with
 * the Rng left where that attempt ended. Taking the order as an argument is what lets AC-17
 * state the two competing readings side by side and show they disagree.
 */
function drawInKeyOrder(seed: number, template: Template, keys: readonly string[]): readonly [Params, Rng] {
  const [, afterPick] = pick(createRng(seed), [template]);
  let rng = afterPick;
  const draw: Record<string, number> = {};
  for (const name of keys) {
    const [lo, hi] = rangeOf(template, name);
    const [value, next] = nextInt(rng, lo, hi);
    rng = next;
    draw[name] = value;
  }
  return [draw, rng];
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

/**
 * Seeds for the error sweeps (AC-7, AC-11, AC-16): the spread-out set above plus a contiguous
 * run of 100, deduplicated. The contiguous run is not padding. The implementation these sweeps
 * exist to reject special-cases the seeds the direct fixtures use, and those are small integers,
 * so a sweep sampling only sparse large seeds could be satisfied by a lookup table.
 */
const ERROR_SWEEP_SEEDS: readonly number[] = [
  ...SWEEP_SEEDS,
  ...Array.from({ length: 100 }, (_unused, index) => index + 1),
].filter((seed, index, all) => all.indexOf(seed) === index);

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

  it('spec(T-007:AC-5) never throws NO_TEMPLATE when the pool is non-empty', () => {
    // Negative half (amended 2026-07-28). The positive half alone was satisfied by an
    // implementation that threw NO_TEMPLATE whenever recency filtering emptied the eligible
    // pool — a criterion that names only the failure case constrains nothing about the success
    // case (LESSONS.md L-038). Step 1 falls back; NO_TEMPLATE is reserved for the empty pool.
    const alone = makeTemplate({
      id: 'ac5-alone',
      text: '{a}',
      params: { a: [1, 1] },
      answerExpr: 'a',
    });
    const histories: readonly (readonly string[])[] = [
      [],
      [alone.id],
      [alone.id, alone.id, alone.id, alone.id, alone.id],
      POOL.map((template) => template.id),
    ];
    const wrong: string[] = [];
    for (const recentTemplateIds of histories) {
      for (const seed of SWEEP_SEEDS) {
        let thrown: unknown;
        try {
          generateQuestion({ templates: [alone], recentTemplateIds, rng: createRng(seed) });
        } catch (error) {
          thrown = error;
        }
        if (thrown instanceof QuestionGenerationError && thrown.code === 'NO_TEMPLATE') {
          wrong.push(`history=${JSON.stringify(recentTemplateIds)} seed=${seed}: NO_TEMPLATE`);
        } else if (thrown !== undefined) {
          const name = thrown instanceof Error ? thrown.constructor.name : typeof thrown;
          const code = thrown instanceof QuestionGenerationError ? thrown.code : 'no-code';
          wrong.push(`history=${JSON.stringify(recentTemplateIds)} seed=${seed}: ${name}/${code}`);
        }
      }
    }
    expect(wrong).toStrictEqual([]);
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

  it('spec(T-007:AC-7) throws the same typed error and code at every seed swept', () => {
    // AC-7, verbatim: "This must hold for every seed swept, asserting the error type and `code`
    // on each — not merely that something was thrown."
    //
    // The first draft of this test wrote `catch {}` and asserted only that the survivor list
    // was empty, which proves SOMETHING threw and nothing about what. A cross-model review
    // walked straight through the gap with an implementation returning the typed error only at
    // the one seed this block tests directly and a bare `RangeError` everywhere else; it passed
    // all 57 tests (LESSONS.md L-034). Every seed is now classified and the whole classification
    // compared at once, so a failure names the seeds and what they threw instead of dying on the
    // first one.
    const classified = errorProfileOverSeeds(
      ERROR_SWEEP_SEEDS,
      (seed) =>
        generateQuestion({
          templates: [UNSATISFIABLE_TEMPLATE],
          recentTemplateIds: [],
          rng: createRng(seed),
        }),
      UNSATISFIABLE_TEMPLATE.id,
    );
    const expected = ERROR_SWEEP_SEEDS.map(
      (seed) => `${seed}: QuestionGenerationError/CONSTRAINTS_UNSATISFIED/names-id`,
    );
    expect(classified).toStrictEqual(expected);
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

  it('spec(T-007:AC-11) throws the same typed error and code at every seed swept', () => {
    // AC-11: "As with AC-7, the error type and `code` must be asserted on every seed swept, not
    // just at one fixture." Same correction as AC-7's sweep and for the same reason — the first
    // draft caught bare here too, and the cross-model review's second live mutant was exactly
    // this one wearing a different code (LESSONS.md L-034).
    const template = makeTemplate({
      id: 'undeclared-every-seed',
      text: '{a} + {z} = ?',
      params: { a: [1, 9] },
      answerExpr: 'a',
    });
    const classified = errorProfileOverSeeds(
      ERROR_SWEEP_SEEDS,
      (seed) => generateQuestion({ templates: [template], recentTemplateIds: [], rng: createRng(seed) }),
      template.id,
    );
    const expected = ERROR_SWEEP_SEEDS.map(
      (seed) => `${seed}: QuestionGenerationError/INVALID_QUESTION/names-id`,
    );
    expect(classified).toStrictEqual(expected);
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

  it('spec(T-007:AC-14) the chained result differs from a reset to the original seed', () => {
    // The amended AC-14's second clause: the chained call's result must "differ from what a
    // reset to the original seed would produce".
    //
    // This replaces a statistical test the amendment made unsound. The earlier version bounded
    // how OFTEN two consecutive parameter draws coincide, which was the only defensible reading
    // of the old wording ("produces a different parameter draw") — but the old wording is gone
    // precisely because draw inequality is not a property of a correct implementation, and the
    // amendment now says never to assert it. The reset comparison below carries the same
    // discriminating power with none of the chance: a reset implementation returns the FIRST
    // call's exact result from the second call, and the returned `Rng` state alone makes that
    // categorical rather than probabilistic, so no seed can coincide its way past this.
    const identical: string[] = [];
    for (const seed of SWEEP_SEEDS) {
      const first = generateQuestion({
        templates: [TWO_PARAM_TEMPLATE],
        recentTemplateIds: [],
        rng: createRng(seed),
      });
      const chained = generateQuestion({
        templates: [TWO_PARAM_TEMPLATE],
        recentTemplateIds: [],
        rng: first[1],
      });
      const reset = generateQuestion({
        templates: [TWO_PARAM_TEMPLATE],
        recentTemplateIds: [],
        rng: createRng(seed),
      });
      if (JSON.stringify(chained) === JSON.stringify(reset)) {
        identical.push(`seed ${seed}: the chained call reproduced the reset result`);
      }
      // And the reset really is a reset — same input, same output — so the comparison above is
      // between two live results rather than against an accidentally-unreachable value.
      if (JSON.stringify(reset) !== JSON.stringify(first)) {
        identical.push(`seed ${seed}: re-running from the original seed was not reproducible`);
      }
    }
    expect(identical).toStrictEqual([]);
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

  it('spec(T-007:AC-16) propagates the same typed error and code at every seed swept', () => {
    // Hardened alongside AC-7 and AC-11. This sweep already checked `code`, which a bare
    // `RangeError` fails on (it carries no `code`), but it never checked the TYPE — so a plain
    // `Error` with a `code` property bolted on would have satisfied it while breaking every
    // `instanceof` call site downstream. The review found the shape in the other two sweeps;
    // this is the third instance of it, found by auditing the class rather than the report.
    const classified = errorProfileOverSeeds(
      ERROR_SWEEP_SEEDS,
      (seed) =>
        generateQuestion({
          templates: [AC16_TEMPLATE],
          recentTemplateIds: [],
          rng: createRng(seed),
        }),
      AC16_TEMPLATE.id,
    );
    const expected = ERROR_SWEEP_SEEDS.map(
      (seed) => `${seed}: QuestionGenerationError/DISTRACTOR_FAILURE/names-id`,
    );
    expect(classified).toStrictEqual(expected);
  });
});

// =============================================================================================
// AC-17 — the two orderings T-024's replay proof depends on
// =============================================================================================

describe('generateQuestion — parameter order and pre-shuffle order (AC-17)', () => {
  /** A template whose four choice values are distinct and whose single draw is unconstrained. */
  const ORDER_TEMPLATE = makeTemplate({
    id: 'preshuffle-order',
    text: '{a} + 1 = ?',
    params: { a: [1, 9] },
    answerExpr: 'a + 1',
  });

  it('spec(T-007:AC-17) draws parameters in lexicographically ascending key order', () => {
    // Retagged from AC-6 by the 2026-07-28 amendment, which gave this behaviour its own
    // criterion. The test itself is unchanged: it was written before any criterion required it,
    // because replay cannot survive the order being left free.
    //
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

  /**
   * A second ordering fixture, in mixed case. AC-17's original fixture uses `b` and `a`, and
   * every key in the real template catalog is a lowercase single letter — a set on which
   * `Array.sort()` (UTF-16 code point order) and `String.localeCompare` (locale collation)
   * agree completely. AC-19 has just made `Total` and `_x` legal keys, and on those the two
   * disagree: code point order is `["A_1b2", "Total", "_x", "a1", "z_"]` where collation gives
   * `["_x", "A_1b2", "a1", "Total", "z_"]`. Measured, not argued (LESSONS.md L-015): an
   * implementation sorting by `localeCompare` passed all 71 tests before this fixture existed.
   *
   * Declared `a` first so that collation order and declaration order coincide, which makes the
   * one assertion below discriminate against both competing readings at once.
   */
  const MIXED_CASE_TEMPLATE = makeTemplate({
    id: 'ordering-mixed-case',
    text: '{B} - {a}',
    params: { a: [1, 100], B: [1000, 1100] },
    answerExpr: 'B - a',
  });

  it('spec(T-007:AC-17) orders keys by code point, not by locale collation', () => {
    const declared = Object.keys(MIXED_CASE_TEMPLATE.params);
    const codePoint = [...declared].sort();
    const collation = [...declared].sort((left, right) => left.localeCompare(right));

    // The premise: on this fixture the three candidate orders are genuinely different, so the
    // assertion that follows distinguishes them instead of measuring a coincidence.
    expect(codePoint).toStrictEqual(['B', 'a']);
    expect(collation).toStrictEqual(['a', 'B']);
    expect(declared).toStrictEqual(collation);

    // Compared by name-to-value, not by JSON: which key a value landed on is the behaviour under
    // test, while the insertion order of the returned object is not something the ticket fixes.
    const byName = (params: Params): string =>
      Object.keys(params)
        .sort()
        .map((name) => `${name}=${paramOf(params, name)}`)
        .join(',');

    const wrong: string[] = [];
    for (const seed of SWEEP_SEEDS) {
      const [byCodePoint] = drawInKeyOrder(seed, MIXED_CASE_TEMPLATE, codePoint);
      const [byCollation] = drawInKeyOrder(seed, MIXED_CASE_TEMPLATE, collation);
      if (byName(byCodePoint) === byName(byCollation)) {
        wrong.push(`seed ${seed}: the two orders happen to agree, so this seed proves nothing`);
      }
      const [question] = generateQuestion({
        templates: [MIXED_CASE_TEMPLATE],
        recentTemplateIds: [],
        rng: createRng(seed),
      });
      if (byName(question.params) !== byName(byCodePoint)) {
        wrong.push(
          `seed ${seed}: drew ${byName(question.params)}; code point order requires ` +
            `${byName(byCodePoint)}, locale collation would give ${byName(byCollation)}`,
        );
      }
    }
    expect(wrong).toStrictEqual([]);
  });

  it('spec(T-007:AC-17) hands shuffle the array answer-first, not distractors-first', () => {
    // The ticket's second new ordering, asserted directly against the frozen `shuffle` rather
    // than only through the composed oracle. Both readings are "a shuffle of the four choices"
    // and both produce a legal Question, so nothing but this pins which one a given seed
    // yields — and the owner ruled `[answer, ...distractors]`.
    const wrong: string[] = [];
    let discriminating = 0;

    for (const seed of SWEEP_SEEDS) {
      const [params, beforeShuffle] = streamBeforeShuffle(seed, ORDER_TEMPLATE);
      const answer = evaluateNumber(ORDER_TEMPLATE.answerExpr, params);
      const distractors = buildDistractors(ORDER_TEMPLATE, params);

      const [answerFirst] = shuffle(beforeShuffle, [answer, ...distractors]);
      const [distractorsFirst] = shuffle(beforeShuffle, [...distractors, answer]);
      if (answerFirst.indexOf(answer) !== distractorsFirst.indexOf(answer)) {
        discriminating += 1;
      }

      const [question] = generateQuestion({
        templates: [ORDER_TEMPLATE],
        recentTemplateIds: [],
        rng: createRng(seed),
      });
      const actual = question.choices.map((choice) => choice.value);
      if (JSON.stringify(actual) !== JSON.stringify(answerFirst)) {
        wrong.push(
          `seed ${seed}: choices ${JSON.stringify(actual)}; answer-first gives ` +
            `${JSON.stringify(answerFirst)}, distractors-first ${JSON.stringify(distractorsFirst)}`,
        );
      }
      // "so `correctIndex` is the post-shuffle position of that element".
      if (question.correctIndex !== answerFirst.indexOf(answer)) {
        wrong.push(
          `seed ${seed}: correctIndex ${question.correctIndex}, answer sits at ` +
            `${answerFirst.indexOf(answer)}`,
        );
      }
    }

    // The two readings must actually disagree, or the assertion above proves nothing about
    // which one the implementation used (LESSONS.md L-020).
    expect(discriminating).toBe(SWEEP_SEEDS.length);
    expect(wrong).toStrictEqual([]);
  });
});

// =============================================================================================
// AC-18 — a zero-parameter template is legal and must succeed
// =============================================================================================

describe('generateQuestion — zero-parameter templates (AC-18)', () => {
  const ZERO_PARAM_TEMPLATE = makeTemplate({
    id: 'zero-param',
    text: 'what is seven',
    params: {},
    answerExpr: '7',
    distractors: ['8', '6', '9'],
  });

  it('spec(T-007:AC-18) the fixture really is schema-valid with no parameters', () => {
    // The branch existed and no fixture reached it, which is why an implementation rejecting it
    // as INVALID_QUESTION passed the first draft of this suite (LESSONS.md L-034). The premise
    // is therefore asserted rather than assumed: the schema accepts it, and every frozen
    // primitive downstream tolerates an empty environment.
    expect(Object.keys(ZERO_PARAM_TEMPLATE.params)).toStrictEqual([]);
    expect(evaluateNumber(ZERO_PARAM_TEMPLATE.answerExpr, {})).toBe(7);
    expect(buildDistractors(ZERO_PARAM_TEMPLATE, {})).toHaveLength(CHOICE_COUNT - 1);
  });

  it('spec(T-007:AC-18) succeeds and returns an empty params object', () => {
    const failures: string[] = [];
    for (const seed of SWEEP_SEEDS) {
      const input: GeneratorInput = {
        templates: [ZERO_PARAM_TEMPLATE],
        recentTemplateIds: [],
        rng: createRng(seed),
      };
      const [question] = generateQuestion(input);
      if (JSON.stringify(question.params) !== '{}') {
        failures.push(`seed ${seed}: params ${JSON.stringify(question.params)}`);
      }
      if (question.text !== ZERO_PARAM_TEMPLATE.text) {
        failures.push(`seed ${seed}: text ${JSON.stringify(question.text)}`);
      }
      if (question.choices.length !== CHOICE_COUNT) {
        failures.push(`seed ${seed}: ${question.choices.length} choices`);
      }
      const correct = question.choices[question.correctIndex];
      if (correct === undefined || correct.value !== 7) {
        failures.push(`seed ${seed}: correct choice ${JSON.stringify(correct)}`);
      }
    }
    expect(failures).toStrictEqual([]);
  });

  it('spec(T-007:AC-18) performs zero nextInt draws, so steps 4-7 run on the pick state', () => {
    // "step 3 performs zero `nextInt` draws". Asserted on the PRNG stream rather than on the
    // params object, because an implementation could return `{}` while still burning a draw —
    // and a burnt draw silently changes every subsequent question in a replayed session.
    const drifted: string[] = [];
    for (const seed of SWEEP_SEEDS) {
      const [, afterPick] = pick(createRng(seed), [ZERO_PARAM_TEMPLATE]);
      const [, expectedAfter] = shuffle(
        afterPick,
        Array.from({ length: CHOICE_COUNT }, (_unused, index) => index),
      );
      const [, actualAfter] = generateQuestion({
        templates: [ZERO_PARAM_TEMPLATE],
        recentTemplateIds: [],
        rng: createRng(seed),
      });
      if (actualAfter.state !== expectedAfter.state) {
        drifted.push(`seed ${seed}: returned ${actualAfter.state}, expected ${expectedAfter.state}`);
      }
    }
    expect(drifted).toStrictEqual([]);
  });
});

// =============================================================================================
// AC-19 — the parameter-key grammar, and substitution of every declared token
// =============================================================================================

describe('generateQuestion — parameter keys are expression identifiers (AC-19)', () => {
  /** T-002's grammar, verbatim: `IDENT := [A-Za-z_][A-Za-z0-9_]*`. */
  const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

  /**
   * Keys spanning the whole grammar: a leading underscore, a capital, a trailing digit, mixed
   * case with an embedded underscore and digits, and a trailing underscore. Every range is
   * degenerate, so this fixture tests substitution alone and stays independent of AC-17's
   * draw-order rule.
   */
  const GRAMMAR_KEYS = ['_x', 'Total', 'a1', 'A_1b2', 'z_'] as const;
  const GRAMMAR_ANSWER_EXPR = GRAMMAR_KEYS.join(' + ');
  const GRAMMAR_TEMPLATE = makeTemplate({
    id: 'grammar-keys',
    text: GRAMMAR_KEYS.map((key) => `{${key}}`).join(' and '),
    params: Object.fromEntries(GRAMMAR_KEYS.map((key, index) => [key, [index + 1, index + 1] as ParamRange])),
    answerExpr: GRAMMAR_ANSWER_EXPR,
  });

  it('spec(T-007:AC-19) every parameter key in this suite matches the identifier grammar', () => {
    const offenders: string[] = [];
    for (const template of [...DIMENSION_MATRIX, ...POOL, GRAMMAR_TEMPLATE, AC16_TEMPLATE]) {
      for (const key of Object.keys(template.params)) {
        if (!IDENT.test(key)) {
          offenders.push(`${template.id}: ${JSON.stringify(key)}`);
        }
      }
    }
    expect(offenders).toStrictEqual([]);
  });

  it('spec(T-007:AC-19) the grammar is T-002s, so every legal key is a usable variable', () => {
    // The criterion's rationale is that a param key IS an expression variable. That is a claim
    // about T-002, so it is measured against T-002 rather than restated: each key resolves in
    // both an arithmetic and a predicate context.
    const env: Record<string, number> = {};
    GRAMMAR_KEYS.forEach((key, index) => {
      env[key] = index + 1;
    });
    expect(GRAMMAR_KEYS.every((key) => IDENT.test(key))).toBe(true);
    expect(evaluateNumber(GRAMMAR_ANSWER_EXPR, env)).toBe(1 + 2 + 3 + 4 + 5);
    expect(evaluatePredicate(`${GRAMMAR_KEYS[0]} < ${GRAMMAR_KEYS[1]}`, env)).toBe(true);
  });

  it('spec(T-007:AC-19) substitutes tokens across the whole grammar, not a narrower one', () => {
    // The discriminator. A renderer written as `\{([a-z]+)\}` — the shape a K-5 template
    // catalog's lowercase single-letter keys would never punish — matches NONE of these five,
    // so it leaves every token standing and the call throws INVALID_QUESTION instead.
    const narrow = /^[a-z]+$/;
    expect(GRAMMAR_KEYS.filter((key) => narrow.test(key))).toStrictEqual([]);

    const [question] = generateQuestion({
      templates: [GRAMMAR_TEMPLATE],
      recentTemplateIds: [],
      rng: createRng(7),
    });
    expect(question.text).toBe('1 and 2 and 3 and 4 and 5');
    expect(question.params).toStrictEqual({ _x: 1, Total: 2, a1: 3, A_1b2: 4, z_: 5 });
  });

  it('spec(T-007:AC-19) leaves no declared token unsubstituted in any fixture', () => {
    const leftovers: string[] = [];
    for (const template of [...DIMENSION_MATRIX, GRAMMAR_TEMPLATE]) {
      for (const seed of SWEEP_SEEDS) {
        const [question] = generateQuestion({
          templates: [template],
          recentTemplateIds: [],
          rng: createRng(seed),
        });
        for (const key of Object.keys(template.params)) {
          const token = `{${key}}`;
          if (!template.text.includes(token)) {
            continue;
          }
          if (question.text.includes(token)) {
            leftovers.push(`${template.id}@${seed}: ${token} survived in ${question.text}`);
          }
          if (!question.text.includes(String(paramOf(question.params, key)))) {
            leftovers.push(`${template.id}@${seed}: ${token} was removed without inserting its value`);
          }
        }
      }
    }
    expect(leftovers).toStrictEqual([]);
  });
});

// =============================================================================================
// AC-20 — ExprError at any evaluated site becomes INVALID_QUESTION
// =============================================================================================

/** Schema-valid but unevaluable — the shape that passed every round-2 fixture (LESSONS.md L-038). */
const MALFORMED_EXPR = 'a +';

const AC20_CONSTRAINT_TEMPLATE = makeTemplate({
  id: 'ac20-bad-constraint',
  text: '{a}',
  params: { a: [1, 1] },
  constraints: [MALFORMED_EXPR],
  answerExpr: 'a',
});

const AC20_ANSWER_TEMPLATE = makeTemplate({
  id: 'ac20-bad-answer',
  text: '{a}',
  params: { a: [1, 1] },
  answerExpr: MALFORMED_EXPR,
  distractors: ['a + 1', 'a - 1', 'a + 2'],
});

const AC20_DISTRACTOR_TEMPLATE = makeTemplate({
  id: 'ac20-bad-distractor',
  text: '{a}',
  params: { a: [1, 1] },
  answerExpr: 'a',
  distractors: [MALFORMED_EXPR, 'a + 1', 'a - 1'],
});

/** Asserts INVALID_QUESTION naming the template and carrying an ExprError as `cause`. */
function expectInvalidQuestionFromExpr(call: () => unknown, templateId: string): QuestionGenerationError {
  const error = expectGenerationError(call, 'INVALID_QUESTION');
  expect(error.message).toContain(templateId);
  expect(error.cause, 'ExprError must be attached as cause').toBeInstanceOf(ExprError);
  return error;
}

describe('generateQuestion — malformed expressions become INVALID_QUESTION (AC-20)', () => {
  it('spec(T-007:AC-20) the three fixtures are schema-valid and each site throws ExprError directly', () => {
    // Reachability first (LESSONS.md L-014/L-015): `"a +"` is admitted by `templateSchema`
    // (`answerExpr`/`constraints`/`distractors` are plain strings), and each frozen evaluator
    // raises `ExprError` on it. Without both, the generator's translation is untestable.
    expect(AC20_CONSTRAINT_TEMPLATE.constraints).toStrictEqual([MALFORMED_EXPR]);
    expect(AC20_ANSWER_TEMPLATE.answerExpr).toBe(MALFORMED_EXPR);
    expect(AC20_DISTRACTOR_TEMPLATE.distractors[0]).toBe(MALFORMED_EXPR);

    expect(() => evaluatePredicate(MALFORMED_EXPR, { a: 1 })).toThrow(ExprError);
    expect(() => evaluateNumber(MALFORMED_EXPR, { a: 1 })).toThrow(ExprError);
    expect(() => buildDistractors(AC20_DISTRACTOR_TEMPLATE, { a: 1 })).toThrow(ExprError);
  });

  it('spec(T-007:AC-20) wraps a malformed constraints entry as INVALID_QUESTION with ExprError cause', () => {
    expectInvalidQuestionFromExpr(
      () =>
        generateQuestion({
          templates: [AC20_CONSTRAINT_TEMPLATE],
          recentTemplateIds: [],
          rng: createRng(7),
        }),
      AC20_CONSTRAINT_TEMPLATE.id,
    );
  });

  it('spec(T-007:AC-20) wraps a malformed answerExpr as INVALID_QUESTION with ExprError cause', () => {
    expectInvalidQuestionFromExpr(
      () =>
        generateQuestion({
          templates: [AC20_ANSWER_TEMPLATE],
          recentTemplateIds: [],
          rng: createRng(7),
        }),
      AC20_ANSWER_TEMPLATE.id,
    );
  });

  it('spec(T-007:AC-20) wraps a malformed declared distractor as INVALID_QUESTION with ExprError cause', () => {
    // `buildDistractors` documents `@throws {ExprError} unchanged` and is frozen outside this
    // ticket's file_scopes. The translation is the generator's job at its own boundary.
    expectInvalidQuestionFromExpr(
      () =>
        generateQuestion({
          templates: [AC20_DISTRACTOR_TEMPLATE],
          recentTemplateIds: [],
          rng: createRng(7),
        }),
      AC20_DISTRACTOR_TEMPLATE.id,
    );
  });

  it('spec(T-007:AC-20) never lets ExprError escape from any of the three sites, at every seed', () => {
    const sites: readonly (readonly [string, Template])[] = [
      ['constraints', AC20_CONSTRAINT_TEMPLATE],
      ['answerExpr', AC20_ANSWER_TEMPLATE],
      ['distractors', AC20_DISTRACTOR_TEMPLATE],
    ];
    const wrong: string[] = [];
    for (const [site, template] of sites) {
      for (const seed of ERROR_SWEEP_SEEDS) {
        let thrown: unknown;
        let returned = false;
        try {
          generateQuestion({ templates: [template], recentTemplateIds: [], rng: createRng(seed) });
          returned = true;
        } catch (error) {
          thrown = error;
        }
        if (returned) {
          wrong.push(`${site}@${seed}: returned normally`);
          continue;
        }
        if (thrown instanceof ExprError) {
          wrong.push(`${site}@${seed}: ExprError escaped (${thrown.code})`);
          continue;
        }
        if (!(thrown instanceof QuestionGenerationError)) {
          const name = thrown instanceof Error ? thrown.constructor.name : typeof thrown;
          wrong.push(`${site}@${seed}: ${name}`);
          continue;
        }
        if (thrown.code !== 'INVALID_QUESTION') {
          wrong.push(`${site}@${seed}: code ${thrown.code}`);
        }
        if (!thrown.message.includes(template.id)) {
          wrong.push(`${site}@${seed}: message omits template id`);
        }
        if (!(thrown.cause instanceof ExprError)) {
          wrong.push(`${site}@${seed}: cause is not ExprError`);
        }
      }
    }
    expect(wrong).toStrictEqual([]);
  });
});

// =============================================================================================
// AC-21 — earliest-step failure wins when a template fails at two steps
// =============================================================================================

describe('generateQuestion — earliest-step failure precedence (AC-21)', () => {
  /**
   * Step 3 fails (unsatisfiable constraint) AND step 4 would fail (malformed answerExpr).
   * The documented order reports CONSTRAINTS_UNSATISFIED — never the answerExpr diagnosis.
   */
  const STEP3_BEFORE_4 = makeTemplate({
    id: 'ac21-step3-before-4',
    text: '{a}',
    params: { a: [1, 2] },
    constraints: ['a > 100'],
    answerExpr: MALFORMED_EXPR,
    distractors: ['1', '2', '3'],
  });

  /**
   * Step 5 fails (malformed distractor → ExprError) AND step 6 would fail (undeclared token).
   * Both surface as INVALID_QUESTION; the step-5 diagnosis carries an ExprError cause, the
   * step-6 render diagnosis does not.
   */
  const STEP5_BEFORE_6 = makeTemplate({
    id: 'ac21-step5-before-6',
    text: '{a} + {z}',
    params: { a: [1, 1] },
    answerExpr: 'a',
    distractors: [MALFORMED_EXPR, 'a + 1', 'a - 1'],
  });

  it('spec(T-007:AC-21) the dual-failure fixtures really fail at both named steps', () => {
    // Premises measured independently (LESSONS.md L-014): without both failures live, an
    // "earliest wins" assertion cannot discriminate an out-of-order implementation.
    expect(evaluatePredicate('a > 100', { a: 1 })).toBe(false);
    expect(evaluatePredicate('a > 100', { a: 2 })).toBe(false);
    expect(() => evaluateNumber(STEP3_BEFORE_4.answerExpr, { a: 1 })).toThrow(ExprError);

    expect(() => buildDistractors(STEP5_BEFORE_6, { a: 1 })).toThrow(ExprError);
    // The render failure is what AC-11 already pins: undeclared `{z}` leaves a brace behind.
    expect(STEP5_BEFORE_6.text).toContain('{z}');
    expect(Object.keys(STEP5_BEFORE_6.params)).toStrictEqual(['a']);
  });

  it('spec(T-007:AC-21) unsatisfiable constraints beat a malformed answerExpr', () => {
    const wrong: string[] = [];
    for (const seed of ERROR_SWEEP_SEEDS) {
      let thrown: unknown;
      try {
        generateQuestion({
          templates: [STEP3_BEFORE_4],
          recentTemplateIds: [],
          rng: createRng(seed),
        });
        wrong.push(`${seed}: returned normally`);
        continue;
      } catch (error) {
        thrown = error;
      }
      if (!(thrown instanceof QuestionGenerationError)) {
        const name = thrown instanceof Error ? thrown.constructor.name : typeof thrown;
        wrong.push(`${seed}: ${name}`);
        continue;
      }
      if (thrown.code !== 'CONSTRAINTS_UNSATISFIED') {
        wrong.push(`${seed}: code ${thrown.code} (answerExpr diagnosis would be INVALID_QUESTION)`);
      }
      if (!thrown.message.includes(STEP3_BEFORE_4.id)) {
        wrong.push(`${seed}: message omits template id`);
      }
    }
    expect(wrong).toStrictEqual([]);
  });

  it('spec(T-007:AC-21) a malformed distractor beats an unrenderable text token', () => {
    // Both failures carry INVALID_QUESTION, so the code alone cannot separate them — distinguish
    // by `cause`: ExprError for step 5, absent for step 6.
    const wrong: string[] = [];
    for (const seed of ERROR_SWEEP_SEEDS) {
      let thrown: unknown;
      try {
        generateQuestion({
          templates: [STEP5_BEFORE_6],
          recentTemplateIds: [],
          rng: createRng(seed),
        });
        wrong.push(`${seed}: returned normally`);
        continue;
      } catch (error) {
        thrown = error;
      }
      if (!(thrown instanceof QuestionGenerationError)) {
        const name = thrown instanceof Error ? thrown.constructor.name : typeof thrown;
        wrong.push(`${seed}: ${name}`);
        continue;
      }
      if (thrown.code !== 'INVALID_QUESTION') {
        wrong.push(`${seed}: code ${thrown.code}`);
        continue;
      }
      if (!(thrown.cause instanceof ExprError)) {
        wrong.push(
          `${seed}: cause is ${thrown.cause === undefined ? 'absent' : typeof thrown.cause}` +
            ' — render-first would omit ExprError cause',
        );
      }
      if (!thrown.message.includes(STEP5_BEFORE_6.id)) {
        wrong.push(`${seed}: message omits template id`);
      }
    }
    expect(wrong).toStrictEqual([]);
  });
});

// =============================================================================================
// Definition of Done
//
// `spec-lint` harvests DoD checkboxes as well as criteria and numbers them in file order
// (LESSONS.md L-036), so each behavioural item is carried by a test tagged `dod(T-007:n)`.
// Items 1 and 3 are the traceability contract, 2 is the local gate script, 4 to 6 are
// behavioural. Item 7 is marked `[process]` and SKIP'd by the gate — leave it alone.
// =============================================================================================

const TICKET_PATH = fileURLToPath(new URL('../../../tickets/T-007.md', import.meta.url));
const SUITE_PATH = fileURLToPath(import.meta.url);

/** DoD items with no behavioural content a test of this module could assert. */
const NON_BEHAVIOURAL_DOD: readonly number[] = [7];

describe('generateQuestion — Definition of Done', () => {
  it('dod(T-007:1) dod(T-007:3) cites every criterion the ticket declares, and no other', () => {
    // Both items state the same contract from opposite ends: item 1 that every AC has a tagged
    // test, item 3 that `spec-lint` — whose entire job is that mapping — is green.
    //
    // This is not a re-implementation of the gate. `spec-lint` checks the forward direction per
    // criterion and the reverse direction per FILE, so a tag citing a criterion that does not
    // exist is invisible to it: retiring an AC leaves its test tagged and still counted. The
    // set equality below closes that, and it runs on every `vitest run` rather than only when
    // someone invokes the gate.
    const ticket = readFileSync(TICKET_PATH, 'utf8');
    const suite = readFileSync(SUITE_PATH, 'utf8');

    const declared = [...ticket.matchAll(/\*\*AC-(\d+)\*\*/g)].map((match) => Number(match[1]));
    const cited = [...suite.matchAll(/spec\(T-007:AC-(\d+)\)/g)].map((match) => Number(match[1]));
    const unique = (values: readonly number[]): readonly number[] =>
      [...new Set(values)].sort((left, right) => left - right);

    expect(declared.length, 'the ticket declares no criteria — wrong path?').toBeGreaterThan(0);
    expect(unique(cited)).toStrictEqual(unique(declared));
  });

  it('dod(T-007:1) dod(T-007:3) cites every Definition-of-Done item the gate numbers', () => {
    // The same contract for DoD items, minus the ones with no behavioural content. Written as
    // an explicit carve-out rather than a loose bound so that a NEW DoD item appearing in the
    // ticket fails here until it is either tagged or classified.
    const ticket = readFileSync(TICKET_PATH, 'utf8');
    const suite = readFileSync(SUITE_PATH, 'utf8');

    // Mirrors spec-lint's own harvest: the Definition-of-Done section up to the next heading,
    // counting checkbox lines. Verified against the gate — both see the same number.
    const section = ticket.split('## Definition of Done')[1] ?? '';
    const body = section.split('\n## ')[0] ?? section;
    const count = body.split('\n').filter((line) => /^- \[[ x]\]/.test(line)).length;
    const cited = [...new Set([...suite.matchAll(/dod\(T-007:(\d+)\)/g)].map((m) => Number(m[1])))];

    expect(count, 'no Definition-of-Done checkboxes found — wrong path?').toBeGreaterThan(0);
    const expected = Array.from({ length: count }, (_unused, index) => index + 1).filter(
      (item) => !NON_BEHAVIOURAL_DOD.includes(item),
    );
    expect([...cited].sort((left, right) => left - right)).toStrictEqual(expected);
  });

  it('dod(T-007:2) contains no skipped or focused test, which would hide a gap silently', () => {
    // One of the eight checks `run-local-gates.sh` performs, and the only one whose failure
    // would quietly shrink THIS file's coverage while every other gate stayed green. The other
    // seven — prettier, eslint, tsc, vitest itself, no-TODO markers, engine purity, and the
    // frozen-test commit check — cannot be asserted from inside a vitest run without either
    // recursion or reaching for git, so the script remains their authority.
    const suite = readFileSync(SUITE_PATH, 'utf8');
    const focused = [...suite.matchAll(/\b(?:it|test|describe)\.(?:skip|only)\b|\bx(?:it|describe)\b/g)];
    expect(focused.map((match) => match[0])).toStrictEqual([]);
  });

  it('dod(T-007:4) reaches neither Math.random nor Date, and returns the advanced Rng', () => {
    // Behavioural, not a source scan (LESSONS.md L-013): the determinism lint rule is scoped to
    // `src/**`, so it cannot be this suite's authority on the module's purity. Both globals are
    // replaced with throwing stubs, the work is done inside that window, and the comparison
    // happens after they are restored so a failure inside `expect` cannot be mistaken for the
    // module reaching a clock.
    const originalRandom = Math.random;
    const originalDate = globalThis.Date;
    class PoisonedDate {
      constructor() {
        throw new Error('new Date() — the generator must be a pure function of its inputs');
      }
      static now(): number {
        throw new Error('Date.now() — the generator must be a pure function of its inputs');
      }
    }

    const input: GeneratorInput = {
      templates: DIMENSION_MATRIX,
      recentTemplateIds: [],
      rng: createRng(4096),
    };
    let actual: readonly [Question, Rng] | undefined;
    let expected: readonly [Question, Rng] | undefined;
    let escaped: unknown;
    try {
      Math.random = (): number => {
        throw new Error('Math.random() — every draw must go through the seeded Rng');
      };
      globalThis.Date = PoisonedDate as unknown as DateConstructor;
      actual = generateQuestion(input);
      expected = composeExpected(input);
    } catch (error) {
      escaped = error;
    } finally {
      Math.random = originalRandom;
      globalThis.Date = originalDate;
    }

    expect(escaped, `a global was reached: ${String(escaped)}`).toBeUndefined();
    // Equality with the composed stream is the second half of the item: every draw went through
    // the Rng passed in, in the order the ticket specifies, and the advanced Rng came back.
    expect(actual).toStrictEqual(expected);
  });

  it('dod(T-007:5) throws a typed error with a code on every failure path', () => {
    // "with the template id except for NO_TEMPLATE" — the carve-out this suite proposed and the
    // amendment accepted. It is asserted as a carve-out, not skipped: NO_TEMPLATE must still be
    // typed, still carry its code, and still say something.
    //
    // Round 3: the three ExprError translation sites (AC-20) are failure paths too. A generator
    // that lets `ExprError` escape passed every earlier path check while breaking this DoD.
    const undeclared = makeTemplate({
      id: 'dod5-undeclared',
      text: '{a} + {z}',
      params: { a: [1, 9] },
      answerExpr: 'a',
    });
    const paths: readonly (readonly [string, () => unknown, string | null])[] = [
      [
        'NO_TEMPLATE',
        () => generateQuestion({ templates: [], recentTemplateIds: [], rng: createRng(1) }),
        null,
      ],
      [
        'CONSTRAINTS_UNSATISFIED',
        () =>
          generateQuestion({
            templates: [UNSATISFIABLE_TEMPLATE],
            recentTemplateIds: [],
            rng: createRng(1),
          }),
        UNSATISFIABLE_TEMPLATE.id,
      ],
      [
        'INVALID_QUESTION/render',
        () => generateQuestion({ templates: [undeclared], recentTemplateIds: [], rng: createRng(1) }),
        undeclared.id,
      ],
      [
        'INVALID_QUESTION/bad-constraint',
        () =>
          generateQuestion({
            templates: [AC20_CONSTRAINT_TEMPLATE],
            recentTemplateIds: [],
            rng: createRng(1),
          }),
        AC20_CONSTRAINT_TEMPLATE.id,
      ],
      [
        'INVALID_QUESTION/bad-answerExpr',
        () =>
          generateQuestion({
            templates: [AC20_ANSWER_TEMPLATE],
            recentTemplateIds: [],
            rng: createRng(1),
          }),
        AC20_ANSWER_TEMPLATE.id,
      ],
      [
        'INVALID_QUESTION/bad-distractor',
        () =>
          generateQuestion({
            templates: [AC20_DISTRACTOR_TEMPLATE],
            recentTemplateIds: [],
            rng: createRng(1),
          }),
        AC20_DISTRACTOR_TEMPLATE.id,
      ],
      [
        'DISTRACTOR_FAILURE',
        () => generateQuestion({ templates: [AC16_TEMPLATE], recentTemplateIds: [], rng: createRng(1) }),
        AC16_TEMPLATE.id,
      ],
    ];

    const profile = paths.map(([code, call, expectedId]) => {
      const [classified] = errorProfileOverSeeds([0], () => call(), expectedId);
      return `${code} -> ${String(classified).replace('0: ', '')}`;
    });
    expect(profile).toStrictEqual([
      'NO_TEMPLATE -> QuestionGenerationError/NO_TEMPLATE/no-id-required',
      'CONSTRAINTS_UNSATISFIED -> QuestionGenerationError/CONSTRAINTS_UNSATISFIED/names-id',
      'INVALID_QUESTION/render -> QuestionGenerationError/INVALID_QUESTION/names-id',
      'INVALID_QUESTION/bad-constraint -> QuestionGenerationError/INVALID_QUESTION/names-id',
      'INVALID_QUESTION/bad-answerExpr -> QuestionGenerationError/INVALID_QUESTION/names-id',
      'INVALID_QUESTION/bad-distractor -> QuestionGenerationError/INVALID_QUESTION/names-id',
      'DISTRACTOR_FAILURE -> QuestionGenerationError/DISTRACTOR_FAILURE/names-id',
    ]);
  });

  it('dod(T-007:6) behaviour tracks the three tuning constants, not three literals', () => {
    // What is observable from outside is that the module behaves as the CURRENT values require.
    // A literal equal to today's value is behaviourally identical to the import and no
    // black-box test can separate them — that limit is recorded in the report rather than
    // papered over. What this does catch is the module drifting away from a retuned constant.

    // CHOICE_COUNT: the assembled question carries exactly that many choices.
    const [question] = generateQuestion({
      templates: [AC9_TEMPLATE],
      recentTemplateIds: [],
      rng: createRng(11),
    });
    expect(question.choices).toHaveLength(CHOICE_COUNT);

    // RECENT_TEMPLATE_WINDOW: with a pool of exactly w + 1 and a history of w distinct ids, one
    // template is eligible and its id is forced. A window of w - 1 or w + 1 serves a different
    // id or degrades to the whole pool, and either shows up here.
    const window = RECENT_TEMPLATE_WINDOW;
    const pool = makePool(window + 1);
    const history = pool.slice(0, window).map((template) => template.id);
    const forced = pool[window];
    expect(forced, 'fixture error: pool smaller than the window').toBeDefined();
    const served = new Set<string>();
    for (const seed of SWEEP_SEEDS) {
      const [only] = generateQuestion({
        templates: pool,
        recentTemplateIds: history,
        rng: createRng(seed),
      });
      served.add(only.templateId);
    }
    expect([...served]).toStrictEqual([forced?.id]);

    // MAX_PARAM_SAMPLE_ATTEMPTS is pinned by AC-7's boundary test, which locates the seed whose
    // first satisfying draw lands exactly on the bound at run time rather than baking one in.
    expect(firstSatisfyingAttempt(1, UNSATISFIABLE_TEMPLATE, MAX_PARAM_SAMPLE_ATTEMPTS)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });
});
