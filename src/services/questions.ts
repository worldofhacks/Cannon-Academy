/**
 * Question source for the duel screen — PROVISIONAL.
 *
 * T-007 is the real generator: templates per skill, rejection sampling, a recency window, and
 * T-005's distractor ladder. It is mid-flight on the engine track and this file must be deleted
 * the day it lands. Until then the duel screen needs *something* to ask, and a screen built
 * against a shape that never existed is a rewrite, not a swap.
 *
 * Two rules keep this from becoming permanent by accident:
 *
 *  1. **It threads the engine `Rng`, never `Math.random()`.** The design prototype uses
 *     `Math.random()` — correct for a prototype, fatal here, because a duel that cannot replay
 *     from `{seed, action log}` breaks the property the whole engine is built around. Every draw
 *     below goes through `@engine/rng`, so this stopgap is already deterministic and swapping in
 *     T-007 changes which questions appear, not whether the duel replays.
 *  2. **The signature is T-007's.** `(skill, rng) -> [question, rng]`. When the real generator
 *     lands, `nextQuestion` becomes a re-export and nothing in `src/components` or `app/` moves.
 *
 * What this is NOT: it has no template pool, no recency window, and no distractor plausibility
 * rules. Do not measure question quality against it, and do not let it reach a child.
 */
import type { SkillId } from '@content/schemas';
import { nextInt, shuffle, type Rng } from '@engine/rng';
import { CHOICE_COUNT } from '@engine/tuning';

export interface DuelQuestion {
  /** The prompt exactly as it renders, e.g. `7 + 5 = ?`. */
  readonly text: string;
  readonly answer: number;
  /** Exactly `CHOICE_COUNT` options, shuffled, containing `answer` once. */
  readonly choices: readonly number[];
  /** Whether the prompt needs a read-aloud button (K-1 word problems). Always false here. */
  readonly readAloud: boolean;
}

/** Builds the choice set: the answer plus near-misses, deduped and shuffled. */
function withChoices(
  text: string,
  answer: number,
  candidates: readonly number[],
  rng: Rng,
): readonly [DuelQuestion, Rng] {
  const pool = new Set<number>([answer]);
  for (const c of candidates) {
    if (pool.size >= CHOICE_COUNT) break;
    if (c >= 0 && !pool.has(c)) pool.add(c);
  }
  // A ladder, not a loop-until-lucky: for a small answer the near-misses collide fast, and an
  // unbounded search on a bad draw is a hang on a child's phone.
  for (let step = 2; pool.size < CHOICE_COUNT; step += 1) {
    if (!pool.has(answer + step)) pool.add(answer + step);
  }

  const [choices, next] = shuffle(rng, [...pool]);
  return [{ text, answer, choices, readAloud: false }, next];
}

export function nextQuestion(skill: SkillId, rng: Rng): readonly [DuelQuestion, Rng] {
  switch (skill) {
    case 'add_within_10':
    case 'add_within_20': {
      const cap = skill === 'add_within_10' ? 10 : 20;
      const [a, r1] = nextInt(rng, 2, Math.floor(cap / 2));
      const [b, r2] = nextInt(r1, 1, cap - a);
      const answer = a + b;
      return withChoices(`${a} + ${b} = ?`, answer, [answer + 1, answer - 1, answer + 2], r2);
    }

    case 'sub_within_20': {
      const [total, r1] = nextInt(rng, 6, 20);
      const [take, r2] = nextInt(r1, 1, total - 1);
      const answer = total - take;
      return withChoices(`${total} − ${take} = ?`, answer, [answer + 1, answer - 1, total], r2);
    }

    case 'place_value_compare': {
      const [a, r1] = nextInt(rng, 11, 99);
      const [b, r2] = nextInt(r1, 11, 99);
      const answer = Math.max(a, b);
      return withChoices(`Which is bigger: ${a} or ${b}?`, answer, [Math.min(a, b)], r2);
    }

    case 'mult_facts': {
      const [a, r1] = nextInt(rng, 2, 9);
      const [b, r2] = nextInt(r1, 2, 9);
      const answer = a * b;
      return withChoices(`${a} × ${b} = ?`, answer, [answer + a, answer - a, a + b], r2);
    }

    case 'div_facts': {
      const [b, r1] = nextInt(rng, 2, 9);
      const [q, r2] = nextInt(r1, 2, 9);
      const answer = q;
      return withChoices(`${b * q} ÷ ${b} = ?`, answer, [answer + 1, answer - 1, b], r2);
    }

    case 'two_step_add_sub': {
      const [a, r1] = nextInt(rng, 5, 12);
      const [b, r2] = nextInt(r1, 3, 8);
      const [c, r3] = nextInt(r2, 2, 5);
      const answer = a + b - c;
      return withChoices(`${a} + ${b} − ${c} = ?`, answer, [answer + 1, answer - 1, a + b], r3);
    }

    case 'fractions_int': {
      const [half, r1] = nextInt(rng, 4, 10);
      const whole = half * 2;
      return withChoices(`½ of ${whole} = ?`, half, [half + 2, half - 2, whole], r1);
    }

    case 'multi_digit_order_ops': {
      const [a, r1] = nextInt(rng, 2, 6);
      const [b, r2] = nextInt(r1, 1, 6);
      const [c, r3] = nextInt(r2, 1, 6);
      const answer = a * (b + c);
      return withChoices(`${a} × (${b} + ${c}) = ?`, answer, [a * b + c, answer + a, answer - a], r3);
    }
  }
}
