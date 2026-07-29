/**
 * Opponent actor interface (ARCHITECTURE.md §4.2).
 *
 * One Promise-returning seam so scripted, bot, and future ghost captains share a shape.
 * The reducer never knows which implementation it faces.
 */
import type { RivalAction, RivalView } from '@engine/duel/types';
import type { Question } from '@engine/questions/types';

export interface OpponentAnswer {
  readonly correct: boolean;
  readonly elapsedMs: number;
}

export interface Opponent {
  readonly id: string;
  chooseAction(view: RivalView): Promise<RivalAction>;
  produceAnswer(question: Question): Promise<OpponentAnswer>;
}
