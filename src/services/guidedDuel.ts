/**
 * Guided first duel — canonical A-039 session with T-018 scripted rival (A-015).
 *
 * `openGuidedDuel` passes onboarding hull/floor overrides only here; the screen owns beat timing
 * through `createGuidedScreenController` and never re-derives damage or hull.
 */
import { getCannon, getIsland } from '@content/index';
import type { Cannon, IslandId } from '@content/schemas';
import type { DuelConfig, DuelState } from '@engine/duel/types';
import { createScriptedOpponent, type ScriptedStep } from '@engine/opponents/scripted';
import type { Opponent } from '@engine/opponents/types';
import { ONBOARDING_ENEMY_HULL } from '@engine/tuning';

import { createDuelAdapter, type AdapterController, type PresentationBeat } from './duelAdapter';
import type { DuelRewardOutcome } from './duelRewards';
import { settleDuelRewards } from './rewardSettlement';
import { TEMPLATE_POOLS } from './templatePools';
import { PHASE_DURATION_MS } from '../stores/duel';
import type { CaptainStore } from '../stores/player';

export type GuidedSession = AdapterController;

export type GuidedRewardOutcome = DuelRewardOutcome;

export type GuidedScreenView = {
  readonly phase: PresentationBeat;
  readonly beatToken: number;
  readonly duelId: string;
  readonly islandId: IslandId;
  readonly islandName: string;
  readonly turn: number;
  readonly turnToken: number;
  readonly cannon: Cannon | null;
  readonly question: {
    readonly text: string;
    readonly answer: number;
    readonly choices: readonly number[];
    readonly readAloud: boolean;
    readonly templateId: string;
  } | null;
  readonly playerHull: number;
  readonly rivalHull: number;
  readonly playerMax: number;
  readonly rivalMax: number;
  readonly outcome: Extract<DuelState, { phase: 'resolvePlayer' }>['outcome'] | null;
  readonly rivalDamage: number;
  readonly asked: number;
  readonly right: number;
  readonly perfects: number;
  readonly coins: number;
};

const GUIDED_ISLAND: IslandId = 'port_sumwich';

const ONBOARDING_RIVAL_SCRIPT: readonly ScriptedStep[] = [
  { cannonId: 'six_pounder', correct: false, elapsedMs: 900 },
  { cannonId: 'six_pounder', correct: false, elapsedMs: 1_100 },
  { cannonId: 'six_pounder', correct: false, elapsedMs: 1_400 },
];

function guidedConfig(seed: number): DuelConfig {
  return {
    seed,
    duelId: `duel-${(seed >>> 0).toString(36)}`,
    islandId: GUIDED_ISLAND,
    playerLoadout: ['swivel_gun'],
    rivalLoadout: ['six_pounder'],
    templatesBySkill: TEMPLATE_POOLS,
    enemyMaxHull: ONBOARDING_ENEMY_HULL,
    playerHullFloor: 1,
  };
}

function projectQuestion(core: DuelState): GuidedScreenView['question'] {
  const held =
    core.phase === 'reload'
      ? core.question
      : core.phase === 'resolvePlayer' && 'question' in core
        ? (core as Extract<DuelState, { phase: 'resolvePlayer' }> & {
            readonly question?: Extract<DuelState, { phase: 'reload' }>['question'];
          }).question
        : undefined;
  if (held === undefined) return null;
  return {
    text: held.text,
    answer: held.choices[held.correctIndex]?.value ?? 0,
    choices: held.choices.map((choice) => choice.value),
    readAloud: held.readAloud,
    templateId: held.templateId,
  };
}

function projectOutcome(core: DuelState): GuidedScreenView['outcome'] {
  return core.phase === 'resolvePlayer' ? core.outcome : null;
}

function projectRivalHull(
  core: DuelState,
  phase: PresentationBeat,
  outcome: GuidedScreenView['outcome'],
): number {
  if (
    core.phase === 'resolvePlayer' &&
    outcome !== null &&
    outcome.damageToEnemy > 0 &&
    (phase === 'perfect' || phase === 'fly')
  ) {
    return core.enemyHull + outcome.damageToEnemy;
  }
  return core.enemyHull;
}

/** Screen-facing projection of the canonical adapter session. */
export function projectGuidedView(adapter: ReturnType<AdapterController['getState']>): GuidedScreenView {
  const core = adapter.core;
  const outcome = projectOutcome(core);
  const coins =
    core.phase === 'victory' || core.phase === 'defeat'
      ? ((core.result as { readonly coins?: number }).coins ?? 0)
      : 0;
  const cannonId =
    core.phase === 'reload' || core.phase === 'resolvePlayer' ? core.cannonId : null;

  return {
    phase: adapter.phase,
    beatToken: adapter.beatToken,
    duelId: core.duelId ?? '',
    islandId: core.islandId,
    islandName: getIsland(core.islandId).displayName,
    turn: core.volleyNumber,
    turnToken: core.turnToken,
    cannon: cannonId === null ? null : getCannon(cannonId),
    question: projectQuestion(core),
    playerHull: core.playerHull,
    rivalHull: projectRivalHull(core, adapter.phase, outcome),
    playerMax: core.enemyMaxHull,
    rivalMax: core.enemyMaxHull,
    outcome,
    rivalDamage: core.phase === 'resolveRival' ? core.damageToPlayer : 0,
    asked: core.tally.totalAnswers,
    right: core.tally.correctAnswers,
    perfects: core.tally.perfectShots,
    coins,
  };
}

/** Opens the unlosable guided duel on A-039's adapter with T-018's scripted rival. */
export function openGuidedDuel(seed: number): { readonly session: GuidedSession; readonly opponent: Opponent } {
  const session = createDuelAdapter(guidedConfig(seed));
  const opponent = createScriptedOpponent({
    id: 'onboarding_sloop',
    script: ONBOARDING_RIVAL_SCRIPT,
  });
  return { session, opponent };
}

/** Advances presentation beats and the question fuse — the screen's only timing owner. */
export function createGuidedScreenController(session: GuidedSession): { readonly dispose: () => void } {
  let alive = true;
  let beatTimer: ReturnType<typeof setTimeout> | null = null;
  let fuseTimer: ReturnType<typeof setTimeout> | null = null;
  let armedBeat: number | null = null;

  const clearBeatTimer = (): void => {
    if (beatTimer !== null) {
      clearTimeout(beatTimer);
      beatTimer = null;
    }
  };

  const clearFuseTimer = (): void => {
    if (fuseTimer !== null) {
      clearTimeout(fuseTimer);
      fuseTimer = null;
    }
  };

  const scheduleBeat = (): void => {
    if (!alive) return;
    const { phase, beatToken } = session.getState();
    const duration = PHASE_DURATION_MS[phase];
    if (duration === undefined) {
      clearBeatTimer();
      armedBeat = null;
      return;
    }
    if (armedBeat === beatToken) return;
    clearBeatTimer();
    armedBeat = beatToken;
    beatTimer = setTimeout(() => {
      if (!alive) return;
      const current = session.getState();
      if (current.beatToken !== armedBeat) return;
      session.dispatch({ type: 'ADVANCE', beatToken: current.beatToken });
    }, duration);
  };

  const scheduleFuse = (): void => {
    if (!alive) return;
    const adapter = session.getState();
    if (adapter.phase !== 'question' || adapter.core.phase !== 'reload') {
      clearFuseTimer();
      return;
    }
    clearFuseTimer();
    fuseTimer = setTimeout(() => {
      if (!alive) return;
      const current = session.getState();
      if (current.phase !== 'question' || current.core.phase !== 'reload') return;
      session.dispatch({ type: 'TIMER_EXPIRED' });
    }, adapter.core.timerMs);
  };

  const tick = (): void => {
    scheduleBeat();
    scheduleFuse();
  };

  const unsubscribe = session.subscribe(tick);
  tick();

  return {
    dispose: () => {
      alive = false;
      clearBeatTimer();
      clearFuseTimer();
      unsubscribe();
    },
  };
}

/** Settles a finished guided victory through A-032 and latches onboarding exactly once. */
export function settleGuidedDuel(store: CaptainStore, session: GuidedSession): GuidedRewardOutcome {
  const core = session.getState().core;
  if (core.phase !== 'victory') {
    const rankTier = store.getState().captain.rankTier;
    return {
      applied: false,
      won: false,
      coins: 0,
      unlockedCannons: [],
      unlockedIslands: [],
      rankTier,
      rankedUp: false,
    };
  }

  const outcome = settleDuelRewards(store, core);
  if (outcome.applied && outcome.won) {
    store.getState().markGuidedDuelFought();
  }

  return outcome;
}
