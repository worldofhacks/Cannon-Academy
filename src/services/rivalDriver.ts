/**
 * Async rival turn driver — bridges T-021 bots into the live duel screen (A-030).
 *
 * The screen owns timing and turn tokens; this module plans volleys from mercy, band, and seed.
 */
import { getCannon } from '@content/index';
import type { CannonId } from '@content/schemas';
import { generateQuestion } from '@engine/questions/generator';
import { createBotOpponent } from '@engine/opponents/bot';
import { targetBotAccuracy } from '@engine/opponents/mercy';
import type { Opponent } from '@engine/opponents/types';
import { toRivalView, type DuelState, type RivalVolley } from '@engine/duel/types';
import { nextFloat, nextInt, pick, type Rng } from '@engine/rng';
import { BOT_ACCURACY_BAND_BY_GRADE } from '@engine/tuning';

import type { Captain } from '../stores/player';

export function createRivalBot(input: {
  readonly captain: Captain;
  readonly loadout: readonly CannonId[];
  readonly rng: Rng;
}): Opponent {
  const band = input.captain.gradeBand;
  if (band === null) {
    throw new RangeError('createRivalBot: captain.gradeBand is required');
  }

  const mercy = input.captain.mercyState;
  return createBotOpponent({
    id: `rival-${input.captain.currentIsland ?? 'unknown'}`,
    loadout: input.loadout,
    accuracy: targetBotAccuracy(mercy, BOT_ACCURACY_BAND_BY_GRADE[band]),
    forcedMisfires: mercy.forcedMisfiresRemaining,
    rng: input.rng,
  });
}

export async function resolveRivalVolley(input: {
  readonly opponent: Opponent;
  readonly core: Extract<DuelState, { phase: 'rivalTurn' }>;
}): Promise<RivalVolley> {
  const view = toRivalView(input.core);
  const action = await input.opponent.chooseAction(view);
  const cannon = getCannon(action.cannonId);
  const templates = input.core.templatesBySkill[cannon.skill];
  if (templates === undefined || templates.length === 0) {
    throw new Error(`resolveRivalVolley: no templates for skill '${cannon.skill}'`);
  }
  const [question] = generateQuestion({
    templates,
    recentTemplateIds: input.core.recentTemplateIds,
    rng: input.core.rng,
  });
  const answer = await input.opponent.produceAnswer(question);
  return { cannonId: action.cannonId, correct: answer.correct, elapsedMs: answer.elapsedMs };
}

/**
 * Synchronous volley planning for the legacy store reducer.
 *
 * Mirrors `createBotOpponent` behaviour without awaiting — the bot uses immediate promises, but
 * reducers cannot await; this keeps headless duel tests deterministic.
 */
export function planRivalVolleySync(input: {
  readonly captain: Captain;
  readonly loadout: readonly CannonId[];
  readonly core: Extract<DuelState, { phase: 'rivalTurn' }>;
}): RivalVolley {
  const band = input.captain.gradeBand;
  if (band === null) {
    throw new RangeError('planRivalVolleySync: captain.gradeBand is required');
  }

  const mercy = input.captain.mercyState;
  const accuracy = targetBotAccuracy(mercy, BOT_ACCURACY_BAND_BY_GRADE[band]);
  let misfiresLeft = mercy.forcedMisfiresRemaining;
  let rng = input.core.rng;

  const [cannonId, afterPick] = pick(rng, input.loadout);
  rng = afterPick;

  let correct: boolean;
  if (misfiresLeft > 0) {
    correct = false;
    misfiresLeft -= 1;
  } else {
    const [draw, afterDraw] = nextFloat(rng);
    rng = afterDraw;
    correct = draw < accuracy;
  }

  const cannon = getCannon(cannonId);
  const [elapsedMs] = nextInt(rng, 0, cannon.timerMs);
  void misfiresLeft;
  return { cannonId, correct, elapsedMs };
}

/** Screen-owned async rival dispatch with turn-token and alive guards (A-030 AC-3/AC-6). */
export function driveRivalTurn(input: {
  readonly turnToken: number;
  readonly expectedTurnToken: number;
  readonly alive: () => boolean;
  readonly resolve: () => Promise<RivalVolley>;
  readonly onResult: (result: { readonly turnToken: number; readonly volley: RivalVolley }) => void;
}): () => void {
  let cancelled = false;
  void input.resolve().then((volley) => {
    if (cancelled || !input.alive()) return;
    if (input.turnToken !== input.expectedTurnToken) return;
    input.onResult({ turnToken: input.turnToken, volley });
  });
  return () => {
    cancelled = true;
  };
}
