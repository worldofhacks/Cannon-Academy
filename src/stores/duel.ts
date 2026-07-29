/**
 * Thin presentation store over the canonical duel engine (A-039).
 *
 * Gameplay values are projected from `core`; this module owns beat timing and screen-facing
 * action names only.
 */
import { getCannon, cannons, getIsland } from '@content/index';
import type { Cannon, IslandId, SkillId } from '@content/schemas';
import {
  applyDefaultRivalAction,
  drawNextDuelSeed,
  duelReducer as coreDuelReducer,
} from '@engine/duel/reducer';
import {
  createDuelState,
  type DuelConfig,
  type DuelState as CoreDuelState,
} from '@engine/duel/types';

import {
  createAdapterState,
  reduceAdapter,
  reduceAdapterCore,
  type AdapterState,
} from '../services/duelAdapter';
import type { ValidDuelContext } from '../services/duelContext';
import { TEMPLATE_POOLS } from '../services/templatePools';

export type DuelPhase =
  | 'select'
  | 'question'
  | 'perfect'
  | 'fly'
  | 'impact'
  | 'miss'
  | 'timeout'
  | 'watch'
  | 'rivalFly'
  | 'rivalImpact'
  | 'victory'
  | 'defeat';

export type DuelSkillTally = Readonly<
  Partial<Record<SkillId, { readonly correct: number; readonly asked: number }>>
>;

type LegacyOutcome = Extract<CoreDuelState, { phase: 'resolvePlayer' }>['outcome'];

export type StoreAppState = {
  readonly core: CoreDuelState;
  readonly phase: DuelPhase;
  readonly beatToken: number;
  readonly rng: CoreDuelState['rng'];
  readonly question: {
    readonly text: string;
    readonly answer: number;
    readonly choices: readonly number[];
    readonly readAloud: boolean;
    readonly templateId: string;
  } | null;
  readonly outcome: LegacyOutcome | null;
  readonly playerHull: number;
  readonly rivalHull: number;
  readonly asked: number;
  readonly right: number;
  readonly perfects: number;
  readonly skillTally: DuelSkillTally;
  readonly actionLog: CoreDuelState['actionLog'];
  readonly result: unknown;
};

export type AppStore = {
  readonly getState: () => StoreAppState;
  readonly dispatch: (action: Record<string, unknown>) => StoreAppState;
  readonly subscribe: (listener: () => void) => () => void;
};

/** Legacy screen-facing state kept for `app/duel.tsx`. */
export interface DuelState {
  readonly phase: DuelPhase;
  readonly duelId: string;
  readonly islandId: IslandId;
  readonly islandName: string;
  readonly rng: CoreDuelState['rng'];
  readonly cannon: Cannon | null;
  readonly question: StoreAppState['question'];
  readonly picked: number | null;
  readonly playerHull: number;
  readonly rivalHull: number;
  readonly playerMax: number;
  readonly rivalMax: number;
  readonly turn: number;
  readonly outcome: LegacyOutcome | null;
  readonly rivalDamage: number;
  readonly asked: number;
  readonly right: number;
  readonly perfects: number;
  readonly skillTally: DuelSkillTally;
  readonly recentTemplateIds: readonly string[];
  readonly coins: number;
  readonly chestOpen: boolean;
}

const legacyAdapters = new WeakMap<DuelState, AdapterState>();

function legacyAdapter(state: DuelState): AdapterState | undefined {
  return legacyAdapters.get(state);
}

function requireLegacyAdapter(state: DuelState): AdapterState {
  const adapter = legacyAdapters.get(state);
  if (adapter === undefined) {
    throw new Error('duel store: missing adapter for legacy state');
  }
  return adapter;
}

export type DuelAction =
  | { readonly type: 'PICK_CANNON'; readonly cannon: Cannon }
  | { readonly type: 'ANSWER'; readonly value: number; readonly elapsedMs: number }
  | { readonly type: 'TIMEOUT' }
  | { readonly type: 'ADVANCE' }
  | { readonly type: 'OPEN_CHEST' }
  | { readonly type: 'RESET' };

export const PHASE_DURATION_MS: Partial<Record<DuelPhase, number>> = {
  perfect: 900,
  fly: 700,
  impact: 1500,
  miss: 2400,
  timeout: 2400,
  watch: 1300,
  rivalFly: 700,
  rivalImpact: 1400,
};

function legacyConfig(seed: number, islandId: IslandId = 'port_sumwich'): DuelConfig {
  return {
    seed,
    duelId: `duel-${(seed >>> 0).toString(36)}`,
    islandId,
    playerLoadout: cannons.map((cannon) => cannon.id),
    rivalLoadout: ['six_pounder'],
    templatesBySkill: TEMPLATE_POOLS,
  };
}

function projectSkillTally(core: CoreDuelState): DuelSkillTally {
  const projected: Partial<Record<SkillId, { correct: number; asked: number }>> = {};
  for (const [skill, tally] of Object.entries(core.tally.bySkill)) {
    if (tally === undefined) continue;
    projected[skill as SkillId] = { correct: tally.correct, asked: tally.attempts };
  }
  return projected;
}

function projectQuestion(core: CoreDuelState): StoreAppState['question'] {
  type ReloadQuestion = Extract<CoreDuelState, { phase: 'reload' }>['question'];
  const held = (core as CoreDuelState & { readonly question?: ReloadQuestion }).question;
  if (held === undefined) return null;
  return {
    text: held.text,
    answer: held.choices[held.correctIndex]?.value ?? 0,
    choices: held.choices.map((choice) => choice.value),
    readAloud: held.readAloud,
    templateId: held.templateId,
  };
}

function readOutcome(core: CoreDuelState): LegacyOutcome | null {
  return core.phase === 'resolvePlayer' ? core.outcome : null;
}

function projectRivalHull(
  core: CoreDuelState,
  phase: DuelPhase,
  outcome: LegacyOutcome | null,
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

function projectAppState(adapter: AdapterState): StoreAppState {
  const core = adapter.core;
  const coreRecord = core as CoreDuelState & { readonly result?: unknown };

  return {
    core,
    phase: adapter.phase,
    beatToken: adapter.beatToken,
    rng: core.rng,
    question: projectQuestion(core),
    outcome: readOutcome(core),
    playerHull: core.playerHull,
    rivalHull: core.enemyHull,
    asked: core.tally.totalAnswers,
    right: core.tally.correctAnswers,
    perfects: core.tally.perfectShots,
    skillTally: projectSkillTally(core),
    actionLog: core.actionLog,
    result: coreRecord.result ?? null,
  };
}

function projectLegacy(adapter: AdapterState, previous?: DuelState): DuelState {
  const core = adapter.core;
  const app = projectAppState(adapter);
  const outcome = readOutcome(core);
  const coins =
    core.phase === 'victory' || core.phase === 'defeat'
      ? ((core.result as { readonly coins?: number }).coins ?? 0)
      : (previous?.coins ?? 0);
  const cannonId =
    core.phase === 'reload' || core.phase === 'resolvePlayer' ? core.cannonId : null;

  return {
    phase: adapter.phase,
    duelId: core.duelId ?? '',
    islandId: core.islandId,
    islandName: getIsland(core.islandId).displayName,
    rng: core.rng,
    cannon: cannonId === null ? null : getCannon(cannonId),
    question: app.question,
    picked: null,
    playerHull: core.playerHull,
    rivalHull: projectRivalHull(core, adapter.phase, outcome),
    playerMax: previous?.playerMax ?? core.playerHull,
    rivalMax: previous?.rivalMax ?? core.enemyMaxHull,
    turn: core.volleyNumber,
    outcome: readOutcome(core),
    rivalDamage: core.phase === 'resolveRival' ? core.damageToPlayer : 0,
    asked: core.tally.totalAnswers,
    right: core.tally.correctAnswers,
    perfects: core.tally.perfectShots,
    skillTally: projectSkillTally(core),
    recentTemplateIds: core.recentTemplateIds,
    coins,
    chestOpen: previous?.chestOpen ?? false,
  };
}

function attachLegacyState(adapter: AdapterState, previous?: DuelState): DuelState {
  const next = projectLegacy(adapter, previous);
  legacyAdapters.set(next, adapter);
  return next;
}

function bootAdapter(
  config: DuelConfig,
  reduceCore: typeof coreDuelReducer = coreDuelReducer,
): AdapterState {
  return createAdapterState(reduceCore(createDuelState(config), { type: 'ANIMATION_DONE' }));
}

function findChoiceIndex(core: CoreDuelState, value: number): number | null {
  if (core.phase !== 'reload') return null;
  const index = core.question.choices.findIndex((choice) => choice.value === value);
  return index >= 0 ? index : null;
}

function advanceLegacyAdapter(adapter: AdapterState): AdapterState {
  if (adapter.core.phase === 'rivalTurn' && adapter.phase === 'watch') {
    return { ...adapter, phase: 'rivalFly', beatToken: adapter.beatToken + 1 };
  }
  if (adapter.core.phase === 'rivalTurn' && adapter.phase === 'rivalFly') {
    const core = applyDefaultRivalAction(adapter.core);
    return {
      ...createAdapterState(core),
      phase: 'rivalImpact',
      beatToken: adapter.beatToken + 1,
      beatIndex: 2,
    };
  }
  return reduceAdapter(adapter, { type: 'ADVANCE', beatToken: adapter.beatToken }, coreDuelReducer);
}

function reduceLegacy(state: DuelState, action: DuelAction): DuelState {
  let adapter = legacyAdapter(state);

  switch (action.type) {
    case 'PICK_CANNON': {
      if (
        (state.phase !== 'select' && state.phase !== 'question') ||
        adapter === undefined
      ) {
        return state;
      }
      if (adapter.core.phase !== 'playerChoose' && adapter.core.phase !== 'reload') {
        return state;
      }
      const core = coreDuelReducer(adapter.core, {
        type: 'CANNON_SELECTED',
        cannonId: action.cannon.id,
      });
      adapter = reduceAdapterCore(adapter, core);
      break;
    }
    case 'ANSWER': {
      if (adapter === undefined) return state;
      const choiceIndex = findChoiceIndex(adapter.core, action.value);
      if (choiceIndex === null) return state;
      const core = coreDuelReducer(adapter.core, {
        type: 'ANSWER_CHOSEN',
        choiceIndex,
        elapsedMs: action.elapsedMs,
      });
      adapter = reduceAdapterCore(adapter, core);
      break;
    }
    case 'TIMEOUT': {
      if (state.phase !== 'question' || state.cannon === null) return state;
      if (adapter === undefined || adapter.core.phase !== 'reload') return state;
      const core = coreDuelReducer(adapter.core, { type: 'TIMER_EXPIRED' });
      adapter = reduceAdapterCore(adapter, core);
      break;
    }
    case 'ADVANCE': {
      if (adapter === undefined) return state;
      const next = advanceLegacyAdapter(adapter);
      if (next === adapter) return state;
      adapter = next;
      break;
    }
    case 'OPEN_CHEST': {
      if (adapter === undefined) return state;
      const next = { ...state, chestOpen: true };
      legacyAdapters.set(next, adapter);
      return next;
    }
    case 'RESET': {
      const live = requireLegacyAdapter(state);
      const [seed, nextRng] = drawNextDuelSeed(state.rng);
      adapter = bootAdapter(legacyConfig(seed, state.islandId));
      adapter = { ...adapter, core: { ...adapter.core, rng: nextRng } };
      void live;
      return attachLegacyState(adapter);
    }
    default:
      return state;
  }

  if (adapter === undefined) return state;
  const next = attachLegacyState(adapter, state);
  return next.phase === state.phase &&
    next.chestOpen === state.chestOpen &&
    adapter === legacyAdapter(state)
    ? state
    : next;
}

export function initialDuelState(seed: number): DuelState {
  return attachLegacyState(bootAdapter(legacyConfig(seed)));
}

/** Island-aware initializer for the live duel screen (A-029). */
export function initialDuelStateWithContext(context: ValidDuelContext, seed: number): DuelState {
  return attachLegacyState(bootAdapter(legacyConfig(seed, context.islandId)));
}

export function duelReducer(state: DuelState, action: DuelAction): DuelState {
  return reduceLegacy(state, action);
}

export function createDuelStore(
  config: DuelConfig,
  options: { readonly reduceCore?: typeof coreDuelReducer } = {},
): AppStore {
  const reduceCore = options.reduceCore ?? coreDuelReducer;
  let adapter = bootAdapter(config, reduceCore);
  let lastAppState = projectAppState(adapter);
  const listeners = new Set<() => void>();

  const emit = (): void => {
    for (const listener of listeners) listener();
  };

  return {
    getState: () => lastAppState,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch: (action) => {
      const before = adapter;
      let next = before;

      switch (action.type) {
        case 'PICK_CANNON': {
          const cannon = action.cannon as Cannon;
          const core = reduceCore(before.core, { type: 'CANNON_SELECTED', cannonId: cannon.id });
          next = reduceAdapterCore(before, core);
          break;
        }
        case 'ANSWER': {
          const choiceIndex = findChoiceIndex(before.core, action.value as number);
          if (choiceIndex === null) return lastAppState;
          const core = reduceCore(before.core, {
            type: 'ANSWER_CHOSEN',
            choiceIndex,
            elapsedMs: action.elapsedMs as number,
          });
          next = reduceAdapterCore(before, core);
          break;
        }
        case 'TIMEOUT': {
          const core = reduceCore(before.core, { type: 'TIMER_EXPIRED' });
          next = reduceAdapterCore(before, core);
          break;
        }
        case 'ADVANCE': {
          next = reduceAdapter(
            before,
            {
              type: 'ADVANCE',
              beatToken: (action.beatToken as number | undefined) ?? before.beatToken,
            },
            reduceCore,
          );
          break;
        }
        default:
          return lastAppState;
      }

      if (next === before) return lastAppState;
      adapter = next;
      lastAppState = projectAppState(adapter);
      emit();
      return lastAppState;
    },
  };
}
