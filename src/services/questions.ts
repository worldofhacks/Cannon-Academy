/**
 * The duel's question source — an ADAPTER over the engine's generator.
 *
 * A-014. What stood here before was a stopgap written so the duel screen had something to ask
 * while T-007 was in flight: it drew its own operands, assembled its own prompt strings and
 * hand-built its own near-miss ladder. Its own header said it had no template pool, no recency
 * window and no distractor plausibility rules, and that it must not reach a child. T-007 and the
 * nine authored template files are done, so all of that is deleted rather than deprecated —
 * nothing below computes a number.
 *
 * The whole of this module is now a PROJECTION. `generateQuestion` produces the engine's
 * `Question`; this file narrows it to the app-facing `DuelQuestion` that the duel panel and the
 * gunnery range already render, and hands back the advanced `Rng` untouched.
 *
 * Why the app-facing shape survives instead of re-exporting the engine's `Question`:
 * `src/components/duel/QuestionPanel.tsx` reads `choices` as bare numbers and compares them to
 * `answer`, and A-008's frozen duel-outcome suite does the same. Adopting the engine's richer
 * choice records would rewrite a component and a frozen test for no behavioural gain. The swap
 * was always meant to change WHICH questions appear, not whether anything moves.
 *
 * Why the recency window is a parameter and not module state. The window has to exclude what was
 * just served; replay-from-seed has to give the same question forever. A module-level history
 * satisfies the first and destroys the second — the second draw at a given seed would differ
 * from the first, and a duel would stop replaying from `{seed, action log}`. So the history is
 * THREADED, exactly as the engine threads it, and `src/stores/duel.ts` carries it on
 * `DuelState`. The parameter is optional so existing two-argument calls still compile.
 */
import type { SkillId } from '@content/schemas';
import { generateQuestion } from '@engine/questions/generator';
import type { Rng } from '@engine/rng';

import { templatesForSkill } from './templatePools';

export interface DuelQuestion {
  /** The prompt exactly as it renders — the template's own sentence, tokens filled in. */
  readonly text: string;
  /** The value the engine marked correct, projected out of its choice set. */
  readonly answer: number;
  /** Exactly `CHOICE_COUNT` options, shuffled, containing `answer` once. */
  readonly choices: readonly number[];
  /** Whether the prompt needs a read-aloud button — the template's own flag, via the engine. */
  readonly readAloud: boolean;
  /** Which authored template produced this question; the handle the recency window reads. */
  readonly templateId: string;
}

/**
 * Draws the next question for a skill.
 *
 * `recentTemplateIds` is most-recent-first; the engine excludes its leading
 * `RECENT_TEMPLATE_WINDOW` entries and degrades to the full pool rather than starving.
 */
export function nextQuestion(
  skill: SkillId,
  rng: Rng,
  recentTemplateIds: readonly string[] = [],
): readonly [DuelQuestion, Rng] {
  const [question, next] = generateQuestion({
    templates: templatesForSkill(skill),
    recentTemplateIds,
    rng,
  });

  const correct = question.choices[question.correctIndex];
  if (correct === undefined) {
    throw new Error(`nextQuestion: no correct choice was marked for template '${question.templateId}'`);
  }

  return [
    {
      text: question.text,
      answer: correct.value,
      choices: question.choices.map((choice) => choice.value),
      readAloud: question.readAloud,
      templateId: question.templateId,
    },
    next,
  ];
}
