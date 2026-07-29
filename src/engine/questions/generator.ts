/**
 * T-007 — question generator: template selection, rejection sampling, text render, and
 * four-choice assembly.
 *
 * Pure function of `(templates, recentTemplateIds, rng)`. Every random draw goes through the
 * seeded PRNG; the advanced state is returned alongside the question. Failure paths throw a
 * typed `QuestionGenerationError` — `ExprError` from constraints / answerExpr / distractors is
 * wrapped as `INVALID_QUESTION` with the real error as `cause`; `DISTRACTOR_FAILURE` and render
 * failures are not re-coded.
 */
import type { Template } from '@content/schemas';
import { nextInt, pick, shuffle } from '@engine/rng';
import type { Rng } from '@engine/rng';
import { buildDistractors } from '@engine/questions/distractors';
import { evaluateNumber, evaluatePredicate, ExprError } from '@engine/questions/expr';
import { QuestionGenerationError } from '@engine/questions/types';
import type { Choice, Question } from '@engine/questions/types';
import { CHOICE_COUNT, MAX_PARAM_SAMPLE_ATTEMPTS, RECENT_TEMPLATE_WINDOW } from '@engine/tuning';

type Params = Readonly<Record<string, number>>;

/**
 * Wraps an `ExprError` from a frozen evaluator as `INVALID_QUESTION`, attaching the real error
 * as `cause` so content-authoring bugs stay diagnosable (AC-20). The frozen
 * `QuestionGenerationError` constructor does not forward `ErrorOptions`, so `cause` is set on
 * the instance after construction.
 */
function invalidQuestionFromExpr(templateId: string, cause: ExprError): QuestionGenerationError {
  const error = new QuestionGenerationError(
    `template "${templateId}" has an invalid expression`,
    'INVALID_QUESTION',
  );
  error.cause = cause;
  return error;
}

/** Step 1: recency window, degrading to the unfiltered pool when filtering empties it. */
function eligiblePool(
  templates: readonly Template[],
  recentTemplateIds: readonly string[],
): readonly Template[] {
  const window = recentTemplateIds.slice(0, RECENT_TEMPLATE_WINDOW);
  const filtered = templates.filter((template) => !window.includes(template.id));
  return filtered.length > 0 ? filtered : templates;
}

/**
 * Step 6: substitute every `{name}` token naming a declared param, then reject any brace that
 * survived. Global, so a repeated token is replaced twice. Render failures carry no `cause`.
 */
function renderText(template: Template, params: Params): string {
  const rendered = template.text.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (token, name: string) => {
    const value = params[name];
    return value === undefined ? token : String(value);
  });
  if (rendered.includes('{') || rendered.includes('}')) {
    throw new QuestionGenerationError(
      `template "${template.id}" has an unrendered token in "${template.text}"`,
      'INVALID_QUESTION',
    );
  }
  return rendered;
}

/**
 * Evaluates every constraint; wraps a site `ExprError` as `INVALID_QUESTION` at this boundary.
 */
function constraintsPass(constraints: readonly string[], params: Params, templateId: string): boolean {
  try {
    return constraints.every((constraint) => evaluatePredicate(constraint, params));
  } catch (error) {
    if (error instanceof ExprError) {
      throw invalidQuestionFromExpr(templateId, error);
    }
    throw error;
  }
}

/**
 * Turns a skill-filtered template pool plus a seeded PRNG into one rendered four-choice
 * `Question` and the advanced PRNG state.
 */
export function generateQuestion(input: {
  readonly templates: readonly Template[];
  readonly recentTemplateIds: readonly string[];
  readonly rng: Rng;
}): readonly [Question, Rng] {
  const pool = eligiblePool(input.templates, input.recentTemplateIds);
  if (pool.length === 0) {
    throw new QuestionGenerationError('no template available', 'NO_TEMPLATE');
  }

  // Step 2 — pick.
  const [template, afterPick] = pick(input.rng, pool);
  let rng = afterPick;

  // Step 3 — rejection-sample params (keys in ascending code-point order).
  const keys = Object.keys(template.params).sort();
  const constraints = template.constraints ?? [];

  let params: Params | undefined;
  for (let attempt = 0; attempt < MAX_PARAM_SAMPLE_ATTEMPTS; attempt += 1) {
    const draw: Record<string, number> = {};
    for (const name of keys) {
      const range = template.params[name];
      if (range === undefined) {
        throw new QuestionGenerationError(
          `template "${template.id}" missing range for "${name}"`,
          'INVALID_QUESTION',
        );
      }
      const [lo, hi] = range;
      const [value, next] = nextInt(rng, lo, hi);
      rng = next;
      draw[name] = value;
    }
    if (constraintsPass(constraints, draw, template.id)) {
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

  // Step 4 — answer.
  let answer: number;
  try {
    answer = evaluateNumber(template.answerExpr, params);
  } catch (error) {
    if (error instanceof ExprError) {
      throw invalidQuestionFromExpr(template.id, error);
    }
    throw error;
  }

  // Step 5 — distractors. `DISTRACTOR_FAILURE` propagates unchanged; `ExprError` is wrapped.
  let distractors: readonly number[];
  try {
    distractors = buildDistractors(template, params);
  } catch (error) {
    if (error instanceof ExprError) {
      throw invalidQuestionFromExpr(template.id, error);
    }
    throw error;
  }

  // Step 6 — render (after distractors so dual-failure precedence is earliest-step).
  const text = renderText(template, params);

  // Step 7 — assemble [answer, ...distractors] and shuffle.
  const values = [answer, ...distractors];
  if (values.length !== CHOICE_COUNT) {
    throw new QuestionGenerationError(
      `template "${template.id}" produced ${values.length} choices, expected ${CHOICE_COUNT}`,
      'INVALID_QUESTION',
    );
  }
  const built: readonly Choice[] = values.map((value) => ({
    value,
    label: String(value),
  }));
  const [choices, afterShuffle] = shuffle(rng, built);

  const question: Question = {
    templateId: template.id,
    skill: template.skill,
    text,
    params,
    choices,
    correctIndex: choices.findIndex((choice) => choice.value === answer),
    isWordProblem: template.isWordProblem ?? false,
    readAloud: template.readAloud ?? false,
  };

  return [question, afterShuffle];
}
