/**
 * Engine-side question shapes. Unlike the content catalogs, these are *produced* (by T-007's
 * generator), not authored — so there is no zod schema here, only the types and the runtime
 * guard (`assertQuestion`) that T-007 calls after building a candidate question.
 *
 * Content imports stay `import type` from `@content/schemas` (no zod in the engine graph).
 * `CHOICE_COUNT` is the single tuning export (T-028) — not a second local literal.
 */
import type { SkillId } from '@content/schemas';
import { CHOICE_COUNT } from '@engine/tuning';

/** One of the four tappable answers rendered for a question. */
export interface Choice {
  readonly value: number;
  readonly label: string;
}

/** A fully-rendered, ready-to-render question — the generator's output shape. */
export interface Question {
  readonly templateId: string;
  readonly skill: SkillId;
  readonly text: string;
  readonly params: Readonly<Record<string, number>>;
  readonly choices: readonly Choice[];
  readonly correctIndex: number;
  readonly isWordProblem: boolean;
  readonly readAloud: boolean;
}

export type QuestionGenerationCode =
  'NO_TEMPLATE' | 'CONSTRAINTS_UNSATISFIED' | 'DISTRACTOR_FAILURE' | 'INVALID_QUESTION';

/** Thrown by the question generator (T-007) and by {@link assertQuestion}. */
export class QuestionGenerationError extends Error {
  readonly code: QuestionGenerationCode;

  constructor(message: string, code: QuestionGenerationCode) {
    super(message);
    this.name = 'QuestionGenerationError';
    this.code = code;
  }
}

/**
 * Guards the invariants a `Question` must hold before it reaches the UI: exactly
 * {@link CHOICE_COUNT} choices, and a `correctIndex` that actually indexes into them.
 */
export function assertQuestion(question: Question): void {
  if (question.choices.length !== CHOICE_COUNT) {
    throw new QuestionGenerationError(
      `expected exactly ${CHOICE_COUNT} choices, got ${question.choices.length}`,
      'INVALID_QUESTION',
    );
  }

  if (question.correctIndex < 0 || question.correctIndex > question.choices.length - 1) {
    throw new QuestionGenerationError(
      `correctIndex ${question.correctIndex} is out of range for ${question.choices.length} choices`,
      'INVALID_QUESTION',
    );
  }
}
