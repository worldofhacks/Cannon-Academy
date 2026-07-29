/**
 * Pure turn-based duel state machine (ARCHITECTURE.md §4.2).
 *
 * `duelReducer(state, event): DuelState` — synchronous, total on well-formed pairs, and free of
 * wall-clock / ambient randomness. Out-of-phase and invalid-payload events return the identical
 * state reference (`===`). Damage always flows through `@engine/duel/damage`.
 */
import { getCannon } from '@content/index';
import type { CannonId, SkillId } from '@content/schemas';
import { resolveShot } from '@engine/duel/damage';
import type {
  ActionLogEntry,
  DuelEvent,
  DuelResult,
  DuelState,
  DuelTally,
  RivalVolley,
} from '@engine/duel/types';
import { generateQuestion } from '@engine/questions/generator';

/** Core fields shared by every phase — strips phase-specific extras when rebuilding. */
function coreOf(state: DuelState) {
  return {
    seed: state.seed,
    rng: state.rng,
    turnToken: state.turnToken,
    volleyNumber: state.volleyNumber,
    islandId: state.islandId,
    playerHull: state.playerHull,
    enemyHull: state.enemyHull,
    enemyMaxHull: state.enemyMaxHull,
    playerLoadout: state.playerLoadout,
    rivalLoadout: state.rivalLoadout,
    recentTemplateIds: state.recentTemplateIds,
    actionLog: state.actionLog,
    tally: state.tally,
    templatesBySkill: state.templatesBySkill,
  };
}

function clampHull(hull: number): number {
  return hull < 0 ? 0 : hull;
}

function updatePlayerTally(
  tally: DuelTally,
  skill: SkillId,
  correct: boolean,
  perfectShot: boolean,
): DuelTally {
  const prev = tally.bySkill[skill];
  return {
    correctAnswers: tally.correctAnswers + (correct ? 1 : 0),
    totalAnswers: tally.totalAnswers + 1,
    perfectShots: tally.perfectShots + (perfectShot ? 1 : 0),
    bySkill: {
      ...tally.bySkill,
      [skill]: {
        correct: (prev?.correct ?? 0) + (correct ? 1 : 0),
        attempts: (prev?.attempts ?? 0) + 1,
      },
    },
  };
}

function makeResult(state: DuelState, won: boolean): DuelResult {
  return {
    won,
    tally: state.tally,
    volleys: state.volleyNumber,
  };
}

/** Terminal check: enemy hull first (victory), else player hull (defeat). */
function checkTerminal(state: DuelState): Extract<DuelState, { phase: 'victory' | 'defeat' }> | null {
  if (state.enemyHull <= 0) {
    return { ...coreOf(state), phase: 'victory', result: makeResult(state, true) };
  }
  if (state.playerHull <= 0) {
    return { ...coreOf(state), phase: 'defeat', result: makeResult(state, false) };
  }
  return null;
}

function selectCannon(state: Extract<DuelState, { phase: 'playerChoose' }>, cannonId: CannonId): DuelState {
  if (!state.playerLoadout.includes(cannonId)) {
    return state;
  }

  const cannon = getCannon(cannonId);
  const templates = state.templatesBySkill[cannon.skill] ?? [];
  const [question, nextRng] = generateQuestion({
    templates,
    recentTemplateIds: state.recentTemplateIds,
    rng: state.rng,
  });

  return {
    ...coreOf(state),
    phase: 'reload',
    rng: nextRng,
    cannonId,
    question,
    timerMs: cannon.timerMs,
    recentTemplateIds: [question.templateId, ...state.recentTemplateIds],
  };
}

function resolvePlayerAnswer(
  state: Extract<DuelState, { phase: 'reload' }>,
  correct: boolean,
  elapsedMs: number,
): DuelState {
  const cannon = getCannon(state.cannonId);
  const [outcome, nextRng] = resolveShot({
    cannon,
    correct,
    elapsedMs,
    rng: state.rng,
  });

  const enemyHull = clampHull(state.enemyHull - outcome.damageToEnemy);
  const playerHull = clampHull(state.playerHull - outcome.damageToSelf);
  const tally = updatePlayerTally(state.tally, state.question.skill, correct, outcome.perfectShot);
  const entry: ActionLogEntry = {
    actor: 'player',
    cannonId: state.cannonId,
    correct,
    elapsedMs,
  };

  return {
    ...coreOf(state),
    phase: 'resolvePlayer',
    rng: nextRng,
    playerHull,
    enemyHull,
    tally,
    actionLog: [...state.actionLog, entry],
    cannonId: state.cannonId,
    outcome,
  };
}

function answerChosen(
  state: Extract<DuelState, { phase: 'reload' }>,
  choiceIndex: number,
  elapsedMs: number,
): DuelState {
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex > 3) {
    return state;
  }
  if (elapsedMs < 0) {
    return state;
  }
  const correct = choiceIndex === state.question.correctIndex;
  return resolvePlayerAnswer(state, correct, elapsedMs);
}

function timerExpired(state: Extract<DuelState, { phase: 'reload' }>): DuelState {
  // Graded as a wrong answer with elapsedMs = timerMs (planning decision / AC-7).
  return resolvePlayerAnswer(state, false, state.timerMs);
}

function afterResolvePlayer(state: Extract<DuelState, { phase: 'resolvePlayer' }>): DuelState {
  const terminal = checkTerminal(state);
  if (terminal !== null) {
    return terminal;
  }
  return {
    ...coreOf(state),
    phase: 'rivalTurn',
    turnToken: state.turnToken + 1,
  };
}

function rivalAction(state: Extract<DuelState, { phase: 'rivalTurn' }>, volley: RivalVolley): DuelState {
  if (!state.rivalLoadout.includes(volley.cannonId)) {
    return state;
  }

  const cannon = getCannon(volley.cannonId);
  const [outcome, nextRng] = resolveShot({
    cannon,
    correct: volley.correct,
    elapsedMs: volley.elapsedMs,
    rng: state.rng,
  });

  // Rival fires at the player (`damageToEnemy` from the rival's POV); volatile recoil hits enemyHull.
  const damageToPlayer = outcome.damageToEnemy;
  const playerHull = clampHull(state.playerHull - damageToPlayer);
  const enemyHull = clampHull(state.enemyHull - outcome.damageToSelf);
  const entry: ActionLogEntry = {
    actor: 'rival',
    cannonId: volley.cannonId,
    correct: volley.correct,
    elapsedMs: volley.elapsedMs,
  };

  return {
    ...coreOf(state),
    phase: 'resolveRival',
    rng: nextRng,
    playerHull,
    enemyHull,
    actionLog: [...state.actionLog, entry],
    volley,
    damageToPlayer,
  };
}

function afterResolveRival(state: Extract<DuelState, { phase: 'resolveRival' }>): DuelState {
  const terminal = checkTerminal(state);
  if (terminal !== null) {
    return terminal;
  }
  return {
    ...coreOf(state),
    phase: 'playerChoose',
    volleyNumber: state.volleyNumber + 1,
    turnToken: state.turnToken + 1,
  };
}

/** Pure duel state machine. Out-of-phase events return `state` by reference. */
export function duelReducer(state: DuelState, event: DuelEvent): DuelState {
  switch (state.phase) {
    case 'countdown':
      if (event.type !== 'ANIMATION_DONE') {
        return state;
      }
      return {
        ...coreOf(state),
        phase: 'playerChoose',
        turnToken: state.turnToken + 1,
      };

    case 'playerChoose':
      if (event.type !== 'CANNON_SELECTED') {
        return state;
      }
      return selectCannon(state, event.cannonId);

    case 'reload':
      if (event.type === 'ANSWER_CHOSEN') {
        return answerChosen(state, event.choiceIndex, event.elapsedMs);
      }
      if (event.type === 'TIMER_EXPIRED') {
        return timerExpired(state);
      }
      return state;

    case 'resolvePlayer':
      if (event.type !== 'ANIMATION_DONE') {
        return state;
      }
      return afterResolvePlayer(state);

    case 'rivalTurn':
      if (event.type !== 'RIVAL_ACTION') {
        return state;
      }
      return rivalAction(state, event.volley);

    case 'resolveRival':
      if (event.type !== 'ANIMATION_DONE') {
        return state;
      }
      return afterResolveRival(state);

    case 'victory':
    case 'defeat':
      return state;
  }
}
