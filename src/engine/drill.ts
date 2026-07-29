/**
 * Gunnery-range drill session — full-rate mastery practice loop (T-017).
 *
 * PLAN.md §Sea chart: each island has a gunnery range; range drills fill a skill's meter at
 * full rate. This is "a meter, not a new mode": no opponent, hull, damage, or cannon — just a
 * fixed-length question loop that folds answers through `applyAnswer(..., 'range', ...)`.
 *
 * Pure functions of their inputs: every draw goes through the seeded Rng; wall-clock time is
 * never read. The session is plain JSON so a drill can be interrupted and restored. Templates
 * are carried on the session (as in T-013's duel) so `answerDrill` can generate the next
 * question without a content-registry dependency.
 */
import type { SkillId, Template } from '@content/schemas';
import { applyAnswer, type SkillMastery } from '@engine/mastery';
import { generateQuestion } from '@engine/questions/generator';
import type { Question } from '@engine/questions/types';
import type { Rng } from '@engine/rng';
import { CHOICE_COUNT } from '@engine/tuning';

export interface DrillAnswer {
  readonly templateId: string;
  /** `null` means the timer expired — D-8: charges neither mastery attempts nor correct. */
  readonly choiceIndex: number | null;
  readonly correct: boolean;
  readonly elapsedMs: number;
}

export interface DrillSession {
  readonly skillId: SkillId;
  readonly rng: Rng;
  readonly length: number;
  readonly answered: number;
  readonly correct: number;
  readonly recentTemplateIds: readonly string[];
  readonly mastery: SkillMastery;
  readonly current: Question | null;
  readonly complete: boolean;
  readonly log: readonly DrillAnswer[];
  /** Injected pool retained for subsequent `generateQuestion` calls / restore. */
  readonly templates: readonly Template[];
}

function copyParams(
  params: Readonly<Record<string, readonly [number, number]>>,
): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const key of Object.keys(params)) {
    const range = params[key]!;
    out[key] = [range[0], range[1]];
  }
  return out;
}

/** Deep-copies a Template so the session never aliases the caller's arrays. */
function copyTemplate(template: Template): Template {
  return {
    id: template.id,
    skill: template.skill,
    text: template.text,
    params: copyParams(template.params),
    answerExpr: template.answerExpr,
    distractors: [...template.distractors],
    ...(template.constraints !== undefined ? { constraints: [...template.constraints] } : {}),
    ...(template.isWordProblem !== undefined ? { isWordProblem: template.isWordProblem } : {}),
    ...(template.readAloud !== undefined ? { readAloud: template.readAloud } : {}),
    ...(template.difficulty !== undefined ? { difficulty: template.difficulty } : {}),
  };
}

function copyTemplates(templates: readonly Template[]): readonly Template[] {
  return templates.map(copyTemplate);
}

function copyMastery(mastery: SkillMastery): SkillMastery {
  return {
    weightedCorrect: mastery.weightedCorrect,
    correct: mastery.correct,
    attempts: mastery.attempts,
  };
}

function assertValidLength(length: number): void {
  if (!Number.isInteger(length) || length < 1) {
    throw new RangeError(`startDrill: length must be an integer >= 1, got ${String(length)}`);
  }
}

function assertValidAnswer(choiceIndex: number | null, elapsedMs: number): void {
  if (!(typeof elapsedMs === 'number') || !Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError(`answerDrill: elapsedMs must be a finite number >= 0, got ${String(elapsedMs)}`);
  }
  if (choiceIndex === null) return;
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= CHOICE_COUNT) {
    throw new RangeError(
      `answerDrill: choiceIndex must be null or an integer in [0, ${CHOICE_COUNT}), got ${String(choiceIndex)}`,
    );
  }
}

/**
 * Opens a live drill: validates `length`, generates the first question from the injected
 * template pool (empty pool → T-007 `NO_TEMPLATE`), and returns an unstarted session.
 */
export function startDrill(input: {
  readonly skillId: SkillId;
  readonly templates: readonly Template[];
  readonly mastery: SkillMastery;
  readonly rng: Rng;
  readonly length: number;
}): DrillSession {
  assertValidLength(input.length);

  const templates = copyTemplates(input.templates);
  const [current, rng] = generateQuestion({
    templates,
    recentTemplateIds: [],
    rng: input.rng,
  });

  return {
    skillId: input.skillId,
    rng,
    length: input.length,
    answered: 0,
    correct: 0,
    recentTemplateIds: [],
    mastery: copyMastery(input.mastery),
    current,
    complete: false,
    log: [],
    templates,
  };
}

/**
 * Grades one answer against `session.current`. Real choices apply full-rate range mastery and
 * advance the session; a timeout (`choiceIndex === null`) is D-8 free — logged only, same question
 * kept for retry.
 */
export function answerDrill(
  session: DrillSession,
  choiceIndex: number | null,
  elapsedMs: number,
): DrillSession {
  if (session.complete || session.current === null) {
    throw new Error('answerDrill: session is already complete');
  }

  assertValidAnswer(choiceIndex, elapsedMs);

  const current = session.current;

  // D-8 / T-036: a burned fuse charges nothing and burns no drill slot — retry the same question.
  if (choiceIndex === null) {
    return {
      skillId: session.skillId,
      rng: session.rng,
      length: session.length,
      answered: session.answered,
      correct: session.correct,
      recentTemplateIds: session.recentTemplateIds,
      mastery: copyMastery(session.mastery),
      current,
      complete: false,
      log: [...session.log, { templateId: current.templateId, choiceIndex: null, correct: false, elapsedMs }],
      templates: session.templates,
    };
  }

  const correct = choiceIndex === current.correctIndex;
  const mastery = applyAnswer(session.mastery, 'range', correct);
  const answered = session.answered + 1;
  const log = [...session.log, { templateId: current.templateId, choiceIndex, correct, elapsedMs }];
  // Most-recent-first: newest id at index 0 (T-007 / generateQuestion window contract).
  const recentTemplateIds = [current.templateId, ...session.recentTemplateIds];

  if (answered >= session.length) {
    return {
      skillId: session.skillId,
      rng: session.rng,
      length: session.length,
      answered,
      correct: session.correct + (correct ? 1 : 0),
      recentTemplateIds,
      mastery,
      current: null,
      complete: true,
      log,
      templates: session.templates,
    };
  }

  const [nextQuestion, nextRng] = generateQuestion({
    templates: session.templates,
    recentTemplateIds,
    rng: session.rng,
  });

  return {
    skillId: session.skillId,
    rng: nextRng,
    length: session.length,
    answered,
    correct: session.correct + (correct ? 1 : 0),
    recentTemplateIds,
    mastery,
    current: nextQuestion,
    complete: false,
    log,
    templates: session.templates,
  };
}
