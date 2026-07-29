/**
 * Scripted onboarding rival — walks a fixed script of (cannon, correctness, elapsedMs).
 *
 * Exhaustion repeats the final step forever. Promises resolve immediately; no wall-clock.
 */
import { CANNON_IDS, type CannonId } from '@content/schemas';
import type { RivalAction, RivalView } from '@engine/duel/types';
import type { Question } from '@engine/questions/types';
import type { Opponent, OpponentAnswer } from '@engine/opponents/types';

export interface ScriptedStep {
  readonly cannonId: CannonId;
  readonly correct: boolean;
  readonly elapsedMs: number;
}

export function createScriptedOpponent(input: {
  readonly id: string;
  readonly script: readonly ScriptedStep[];
}): Opponent {
  const { id, script } = input;

  if (script.length === 0) {
    throw new RangeError('createScriptedOpponent: script must contain at least one step');
  }

  for (let i = 0; i < script.length; i += 1) {
    const step = script[i]!;
    if (step.elapsedMs < 0) {
      throw new Error(`createScriptedOpponent: script step ${i} has negative elapsedMs`);
    }
    if (!(CANNON_IDS as readonly string[]).includes(step.cannonId)) {
      throw new Error(`createScriptedOpponent: script step ${i} names unknown cannon '${step.cannonId}'`);
    }
  }

  // Cursor into the script; chooseAction advances it, produceAnswer reads the selected step.
  let cursor = 0;
  let selected: ScriptedStep = script[0]!;

  return {
    id,
    chooseAction(view: RivalView): Promise<RivalAction> {
      void view;
      const index = cursor < script.length ? cursor : script.length - 1;
      selected = script[index]!;
      cursor += 1;
      return Promise.resolve({ cannonId: selected.cannonId });
    },
    produceAnswer(question: Question): Promise<OpponentAnswer> {
      void question;
      return Promise.resolve({ correct: selected.correct, elapsedMs: selected.elapsedMs });
    },
  };
}
