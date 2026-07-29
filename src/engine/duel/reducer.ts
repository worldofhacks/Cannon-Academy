/**
 * Pure turn-based duel state machine (ARCHITECTURE.md §4.2).
 *
 * `duelReducer(state, event): DuelState` — synchronous, total on well-formed pairs, and free of
 * wall-clock / ambient randomness. Out-of-phase and invalid-payload events return the identical
 * state reference (`===`). Damage always flows through `@engine/duel/damage`.
 */
import { getCannon } from '@content/index';
import type { CannonId, SkillId } from '@content/schemas';
import { resolveShot, type ShotOutcome } from '@engine/duel/damage';
import { computeCoinPayout } from '@engine/economy';
import type {
  ActionLogEntry,
  DuelCore,
  DuelEvent,
  DuelResult,
  DuelState,
  DuelTally,
} from '@engine/duel/types';
import { generateQuestion } from '@engine/questions/generator';
import { nextInt, pick, type Rng } from '@engine/rng';

const MAX_DUEL_SEED = 0xffffffff;

/** Core fields shared by every phase — strips phase-specific extras when rebuilding. */
function coreOf(state: DuelState): DuelCore {
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
    duelId: state.duelId ?? `duel-${(state.seed >>> 0).toString(36)}`,
    playerHullFloor: state.playerHullFloor ?? 0,
  };
}

function clampHull(hull: number): number {
  return hull < 0 ? 0 : hull;
}

function applyPlayerHull(state: DuelState, hull: number): number {
  const floor = state.playerHullFloor ?? 0;
  return Math.max(floor, clampHull(hull));
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
  const tally = state.tally;
  return {
    won,
    tally,
    volleys: state.volleyNumber,
    coins: computeCoinPayout({
      won,
      correctAnswers: tally.correctAnswers,
      totalAnswers: tally.totalAnswers,
      perfectShots: tally.perfectShots,
    }),
  } as DuelResult;
}

const TIMEOUT_OUTCOME: ShotOutcome = {
  kind: 'misfire',
  answerQuality: 0,
  rollDamage: 0,
  bonusDamage: 0,
  damageToEnemy: 0,
  damageToSelf: 0,
  ballCount: 0,
  perfectShot: false,
};

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

function selectCannon(
  state: Extract<DuelState, { phase: 'playerChoose' | 'reload' }>,
  cannonId: CannonId,
): DuelState {
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
  const playerHull = applyPlayerHull(state, state.playerHull - outcome.damageToSelf);
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
  const entry: ActionLogEntry = {
    actor: 'player',
    cannonId: state.cannonId,
    correct: false,
    elapsedMs: state.timerMs,
    result: 'timeout',
    event: { type: 'TIMER_EXPIRED' },
  };

  return {
    ...coreOf(state),
    phase: 'resolvePlayer',
    cannonId: state.cannonId,
    outcome: TIMEOUT_OUTCOME,
    actionLog: [...state.actionLog, entry],
    question: state.question,
  } as Extract<DuelState, { phase: 'resolvePlayer' }>;
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

function rivalAction(
  state: Extract<DuelState, { phase: 'rivalTurn' }>,
  event: Extract<DuelEvent, { type: 'RIVAL_ACTION' }>,
): DuelState {
  // A-039 carries turnToken on the wire; T-013 Exact keeps it off the declared variant.
  const token = (event as { readonly turnToken?: number }).turnToken;
  if (token !== undefined && token !== state.turnToken) {
    return state;
  }
  const volley = event.volley;
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

  const damageToPlayer = outcome.damageToEnemy;
  const playerHull = applyPlayerHull(state, state.playerHull - damageToPlayer);
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

/** Draws the next duel seed from a live stream without mutating duel state (legacy RESET). */
export function drawNextDuelSeed(rng: Rng): readonly [number, Rng] {
  return nextInt(rng, 0, MAX_DUEL_SEED);
}

/** Seeded default rival volley for presentation-only clients (legacy app store). */
export function applyDefaultRivalAction(
  state: Extract<DuelState, { phase: 'rivalTurn' }>,
): DuelState {
  const [cannonId, rngAfterPick] = pick(state.rng, state.rivalLoadout);
  const cannon = getCannon(cannonId);
  const [elapsedMs, rngAfterElapsed] = nextInt(rngAfterPick, 0, cannon.timerMs);
  return duelReducer(
    { ...coreOf(state), rng: rngAfterElapsed, phase: 'rivalTurn' },
    {
      type: 'RIVAL_ACTION',
      volley: { cannonId, correct: true, elapsedMs },
      ...{ turnToken: state.turnToken },
    } as DuelEvent,
  );
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
      if (event.type === 'CANNON_SELECTED') {
        return selectCannon(state, event.cannonId);
      }
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
      return rivalAction(state, event);

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
