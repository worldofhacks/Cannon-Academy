/**
 * Banded mercy bot — an `Opponent` driven by seeded PRNG accuracy and forced misfires.
 *
 * Delays are PRNG-drawn inside `[0, cannon.timerMs]`, never wall-clock
 * (ARCHITECTURE.md §4.2). All feel numbers come from the caller / tuning — none here.
 */
import { getCannon } from '@content/index';
import { CANNON_IDS, type CannonId } from '@content/schemas';
import type { RivalAction, RivalView } from '@engine/duel/types';
import type { Opponent, OpponentAnswer } from '@engine/opponents/types';
import type { Question } from '@engine/questions/types';
import { nextFloat, nextInt, pick, type Rng } from '@engine/rng';

export function createBotOpponent(input: {
  readonly id: string;
  readonly loadout: readonly CannonId[];
  readonly accuracy: number;
  readonly forcedMisfires: number;
  readonly rng: Rng;
}): Opponent {
  const { id, loadout, accuracy, forcedMisfires } = input;

  if (loadout.length === 0) {
    throw new RangeError('createBotOpponent: loadout must contain at least one cannon');
  }
  if (!(typeof accuracy === 'number') || Number.isNaN(accuracy) || accuracy < 0 || accuracy > 1) {
    throw new RangeError('createBotOpponent: accuracy must be a number in [0, 1]');
  }
  if (!Number.isInteger(forcedMisfires) || forcedMisfires < 0) {
    throw new RangeError('createBotOpponent: forcedMisfires must be a non-negative integer');
  }
  for (const cannonId of loadout) {
    if (!(CANNON_IDS as readonly string[]).includes(cannonId)) {
      throw new Error(`createBotOpponent: loadout names unknown cannon '${cannonId}'`);
    }
  }

  let rng: Rng = input.rng;
  let misfiresLeft = forcedMisfires;
  let selectedCannonId: CannonId = loadout[0]!;

  return {
    id,
    chooseAction(view: RivalView): Promise<RivalAction> {
      void view;
      const [cannonId, nextRng] = pick(rng, loadout);
      rng = nextRng;
      selectedCannonId = cannonId;
      return Promise.resolve({ cannonId });
    },
    produceAnswer(question: Question): Promise<OpponentAnswer> {
      void question;
      let correct: boolean;
      if (misfiresLeft > 0) {
        correct = false;
        misfiresLeft -= 1;
      } else {
        const [draw, nextRng] = nextFloat(rng);
        rng = nextRng;
        correct = draw < accuracy;
      }
      const cannon = getCannon(selectedCannonId);
      const [elapsedMs, afterElapsed] = nextInt(rng, 0, cannon.timerMs);
      rng = afterElapsed;
      return Promise.resolve({ correct, elapsedMs });
    },
  };
}
