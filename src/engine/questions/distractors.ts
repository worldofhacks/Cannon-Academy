/**
 * T-005 — distractor construction, collision rejection, plausibility, and the near-miss ladder.
 *
 * A question is four taps: the answer plus three wrong ones. That format only measures knowledge
 * if the three wrong ones are *engineered* — never equal to the answer, never equal to each
 * other, and close enough to be tempting rather than free to eliminate (PLAN.md §The duel loop,
 * ARCHITECTURE.md §4.1). This module owns exactly that screening: it evaluates a template's
 * declared distractor expressions against the sampled params, drops every candidate that
 * collides or is implausible, and tops the list back up from a fixed near-miss ladder so one
 * unlucky parameter draw cannot starve a skill's question pool.
 *
 * **This module is pure and consumes no randomness.** It takes no `Rng`: shuffling the four
 * choices and assigning `correctIndex` is T-007's job, because the shuffle has to draw from the
 * same PRNG stream as parameter sampling. The same `(template, params)` pair therefore always
 * yields the same choice set, which is what makes T-019's golden suite and duel replay possible.
 *
 * Every threshold comes from `@engine/tuning`. The only bare numbers below are the fill ladder's
 * nine offsets — those *are* the ladder's definition, not tunable feel-numbers — and the `0`
 * comparisons that clauses 3 and 4 of the plausibility rule are literally stated in terms of
 * (a sign boundary and a division-by-zero guard, not thresholds).
 */
import type { Template } from '@content/schemas';
import { evaluateNumber } from '@engine/questions/expr';
import { QuestionGenerationError } from '@engine/questions/types';
import {
  CHOICE_COUNT,
  DISTRACTOR_ABS_FLOOR,
  DISTRACTOR_MAX_RATIO,
  MAX_DISTRACTOR_ATTEMPTS,
} from '@engine/tuning';

/** Template parameter name to sampled value — the same shape `evaluateNumber` evaluates against. */
type Params = Readonly<Record<string, number>>;

/** Where a returned distractor came from: the template's own list, or the fill ladder. */
type DistractorSource = 'declared' | 'ladder';

/** How many wrong answers a four-choice question needs. Derived, never a literal. */
const DISTRACTORS_NEEDED = CHOICE_COUNT - 1;

/**
 * The operational definition of "plausibly typed (same magnitude/sign)" from ARCHITECTURE.md
 * §4.1, as the ticket's four numbered clauses.
 *
 * Note what this deliberately does *not* do: it never checks `candidate !== answer`. Collision
 * rejection belongs to {@link buildDistractors}; keeping the two separable is what lets the
 * content tickets reuse this predicate on candidates they have not screened yet.
 */
export function isPlausibleDistractor(candidate: number, answer: number): boolean {
  // 1. A NaN or Infinity decoy is not a number a child can tap.
  if (!Number.isFinite(candidate)) {
    return false;
  }

  // 2. Same numeric type as the answer — an integer offered against 3.5 is free to eliminate.
  if (Number.isInteger(candidate) !== Number.isInteger(answer)) {
    return false;
  }

  // 3. No negative decoys for K-5 arithmetic when the answer itself is non-negative.
  if (answer >= 0 && candidate < 0) {
    return false;
  }

  // 4a. A near miss is always plausible.
  //
  // DISTRACTOR_ABS_FLOOR is dev-slider exposed, and TWO answers sit at zero headroom against it
  // — lower it by one and both starve, which surfaces as a rare DISTRACTOR_FAILURE mid-duel
  // rather than as a failing build:
  //
  //   x = 0   (a legal `sub_within_20` draw, a == b)  -> legal rungs exactly {1, 2, 3}
  //   x = 0.5 (a legal `fractions_int` draw, 1 / 2)   -> legal rungs exactly {1.5, 2.5, 3.5}
  //
  // The fraction case is the non-obvious one and is NOT just an example: sweeping a / b over
  // a in 0..12, b in 1..12, those two answers are the only draws that reach the minimum. It is
  // tight for a different reason than the zero case — the `x * 2` rung is 1, which clause 2
  // rejects for being an INTEGER against a non-integer answer, not for magnitude. So the floor
  // binds on fractions as well as on subtraction (AC-17).
  if (Math.abs(candidate - answer) <= DISTRACTOR_ABS_FLOOR) {
    return true;
  }

  // 4b. Otherwise it must sit in the same order of magnitude. At a zero answer this branch is
  // undefined (`|x| * RATIO` and `|x| / RATIO` are both 0), so it is SKIPPED rather than
  // divided through: writing it as `|x| / |d| <= RATIO` would collapse to `0 <= RATIO` here and
  // wave through arbitrarily large decoys. At x = 0 the near-miss window is the only branch.
  if (answer === 0) {
    return false;
  }

  return (
    Math.abs(candidate) <= Math.abs(answer) * DISTRACTOR_MAX_RATIO &&
    Math.abs(candidate) >= Math.abs(answer) / DISTRACTOR_MAX_RATIO
  );
}

/**
 * The near-miss fill ladder: nine rungs in this fixed order, capped at the tuning constant that
 * exists to admit all of them (`MAX_DISTRACTOR_ATTEMPTS >= 9`). Ordered rather than random so
 * the same draw always reproduces the same question.
 */
function ladderRungs(answer: number): readonly number[] {
  const rungs = [
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

  return rungs.slice(0, MAX_DISTRACTOR_ATTEMPTS);
}

/** Renders a draw as `name=value` pairs so a `DISTRACTOR_FAILURE` can be replayed (AC-15). */
function describeParams(params: Params): string {
  return Object.entries(params)
    .map(([name, value]) => `${name}=${value}`)
    .join(', ');
}

interface BuiltDistractors {
  readonly values: readonly number[];
  readonly sources: readonly DistractorSource[];
}

/**
 * The single derivation behind both exports, so the values and their provenance labels can never
 * disagree about which slot came from where.
 */
function buildInternal(template: Template, params: Params): BuiltDistractors {
  const answer = evaluateNumber(template.answerExpr, params);

  // Every declared expression is evaluated up front, even once enough candidates have been
  // accepted. An `ExprError` is a content authoring bug and must fail the golden suite loudly
  // rather than being silently absorbed by the fill ladder, and that has to hold for a bad
  // expression in ANY slot — including one the screening loop would otherwise never reach.
  const declared = template.distractors.map((expr) => evaluateNumber(expr, params));

  const values: number[] = [];
  const sources: DistractorSource[] = [];
  /** Candidates screened and turned away — declared and ladder alike (AC-15). */
  let rejected = 0;

  /** A candidate is usable when it is not the answer, not already taken, and plausible. */
  const isUsable = (candidate: number): boolean =>
    candidate !== answer && !values.includes(candidate) && isPlausibleDistractor(candidate, answer);

  const accept = (value: number, source: DistractorSource): void => {
    values.push(value);
    sources.push(source);
  };

  // The quota cap. A template carrying more than `DISTRACTORS_NEEDED` declared distractors is
  // type-legal — `Template['distractors']` is `string[]`, and only `templateSchema`'s
  // `.length(3)` holds the line at the content boundary — so without this cap the loop returns
  // one value per usable declared entry and the four-choice contract breaks.
  //
  // Measured on this file, four usable declared entries (`a + b + 1 .. + 4`, answer 7):
  //   with the cap                -> [8, 9, 10]      (3 values)
  //   with the cap removed        -> [8, 9, 10, 11]  (4 values)
  // `>=` and `===` are behaviourally IDENTICAL here, verified over declared lengths 1..12:
  // `values` grows by exactly one per iteration with the guard before every push, so its length
  // can never step past the quota and an exact-equality test can never be missed. `>=` is
  // defensive only. (An earlier version of this comment claimed eight values and an overshoot
  // risk; both came from a mutant that had also degraded the ladder cap below to `===`, which
  // is a measurement of the two caps together and says nothing about this one — AC-16.)
  for (const value of declared) {
    if (values.length >= DISTRACTORS_NEEDED) {
      break;
    }
    if (isUsable(value)) {
      accept(value, 'declared');
    } else {
      rejected += 1;
    }
  }

  for (const rung of ladderRungs(answer)) {
    if (values.length >= DISTRACTORS_NEEDED) {
      break;
    }
    if (isUsable(rung)) {
      accept(rung, 'ladder');
    } else {
      rejected += 1;
    }
  }

  // Never degrade: a short list, a duplicate, or the answer itself would each break the 2x2
  // answer grid contract (ARCHITECTURE.md §3.6). Failing loudly is the locked decision.
  //
  // The message is the whole forensic record (AC-15). This failure fires only on specific
  // sampled values, and the ladder's behaviour is entirely a function of the answer, which is a
  // function of the draw — so the id alone leaves a catalog author unable to reproduce it. Two
  // different draws of one template that both exhaust must read differently, which is why
  // `params` is carried verbatim rather than summarised.
  if (values.length < DISTRACTORS_NEEDED) {
    throw new QuestionGenerationError(
      `template "${template.id}" could not build ${DISTRACTORS_NEEDED} distinct plausible ` +
        `distractors for answer ${answer} (built ${values.length}, ` +
        `${rejected} candidates rejected) from params {${describeParams(params)}}`,
      'DISTRACTOR_FAILURE',
    );
  }

  return { values, sources };
}

/**
 * Builds the three wrong answers for `template` under `params`, in declared order with ladder
 * fills appended. Every returned value is finite, distinct from the answer and from its
 * siblings, and plausible against the answer.
 *
 * @throws {QuestionGenerationError} code `DISTRACTOR_FAILURE` when neither the declared list nor
 *   the ladder can supply three distinct plausible values.
 * @throws {ExprError} unchanged, when `answerExpr` or any declared distractor fails to evaluate.
 */
export function buildDistractors(template: Template, params: Params): readonly number[] {
  return buildInternal(template, params).values;
}

/**
 * Marks each value {@link buildDistractors} returns by where it came from, aligned
 * index-for-index. Exported so the content tickets can count ladder substitutions — a template
 * that leans on the ladder is a template whose declared distractors need rewriting — instead of
 * each re-deriving the screening rules and drifting apart.
 */
export function describeDistractorSources(template: Template, params: Params): readonly DistractorSource[] {
  return buildInternal(template, params).sources;
}
