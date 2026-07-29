/**
 * Presentation-beat adapter over the canonical duel engine (A-039).
 *
 * The engine owns every gameplay rule; this module maps core phases to screen beats and forwards
 * user input as engine events — never re-deriving damage, tally, hull, or payout.
 */
import { duelReducer } from '@engine/duel/reducer';
import {
  createDuelState,
  type DuelConfig,
  type DuelEvent,
  type DuelResult,
  type DuelState,
} from '@engine/duel/types';

export type PresentationBeat =
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

export type AdapterState = {
  readonly core: DuelState;
  readonly phase: PresentationBeat;
  readonly beatToken: number;
  readonly beatIndex: number;
};

type RivalVolley = Extract<DuelEvent, { type: 'RIVAL_ACTION' }>['volley'];

type AdapterAction =
  | { readonly type: 'ADVANCE'; readonly beatToken: number }
  | {
      readonly type: 'RIVAL_RESULT';
      readonly turnToken: number;
      readonly volley: RivalVolley;
    }
  | { readonly type: 'CANNON_SELECTED'; readonly cannonId: RivalVolley['cannonId'] }
  | { readonly type: 'ANSWER_CHOSEN'; readonly choiceIndex: number; readonly elapsedMs: number }
  | { readonly type: 'TIMER_EXPIRED' };

export type AdapterController = {
  readonly getState: () => AdapterState;
  readonly dispatch: (action: Record<string, unknown>) => AdapterState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly reset: (config: DuelConfig) => AdapterState;
  readonly dispose: () => void;
};

function isTimeoutResolve(core: DuelState): boolean {
  if (core.phase !== 'resolvePlayer') return false;
  const last = core.actionLog.at(-1);
  return last?.result === 'timeout';
}

/** Ordered presentation beats for the current core phase (A-039 AC-3). */
export function presentationBeatsForCore(core: DuelState): readonly PresentationBeat[] {
  switch (core.phase) {
    case 'countdown':
    case 'playerChoose':
      return ['select'];
    case 'reload':
      return ['question'];
    case 'resolvePlayer': {
      if (isTimeoutResolve(core)) return ['timeout'];
      if (core.outcome.perfectShot) return ['perfect', 'fly', 'impact'];
      if (core.outcome.kind === 'volley') return ['fly', 'impact'];
      return ['miss'];
    }
    case 'rivalTurn':
      return ['watch'];
    case 'resolveRival':
      return ['watch', 'rivalFly', 'rivalImpact'];
    case 'victory':
      return ['victory'];
    case 'defeat':
      return ['defeat'];
  }
}

function initialBeatForCore(core: DuelState): PresentationBeat {
  return presentationBeatsForCore(core)[0] ?? 'select';
}

export function createAdapterState(core: DuelState, beatToken = 0): AdapterState {
  return {
    core,
    phase: initialBeatForCore(core),
    beatToken,
    beatIndex: 0,
  };
}

function advanceCore(core: DuelState, reduceCore: typeof duelReducer): DuelState {
  return reduceCore(core, { type: 'ANIMATION_DONE' });
}

function applyCoreEvent(
  state: AdapterState,
  event: DuelEvent,
  reduceCore: typeof duelReducer,
): AdapterState {
  const core = reduceCore(state.core, event);
  if (core === state.core) return state;
  return createAdapterState(core, state.beatToken + 1);
}

function rivalActionEvent(turnToken: number, volley: RivalVolley): DuelEvent {
  // turnToken is carried on the wire for A-039; kept off the declared T-013 Exact shape.
  return { type: 'RIVAL_ACTION', volley, ...{ turnToken } } as DuelEvent;
}

export function reduceAdapter(
  state: AdapterState,
  action: AdapterAction,
  reduceCore: typeof duelReducer,
  alive: () => boolean = () => true,
): AdapterState {
  if (!alive()) return state;
  switch (action.type) {
    case 'RIVAL_RESULT': {
      // Stale / wrong-phase results must not touch the core reducer (A-039 AC-5).
      if (state.core.phase !== 'rivalTurn' || action.turnToken !== state.core.turnToken) {
        return state;
      }
      return applyCoreEvent(state, rivalActionEvent(action.turnToken, action.volley), reduceCore);
    }

    case 'CANNON_SELECTED':
      return applyCoreEvent(
        state,
        { type: 'CANNON_SELECTED', cannonId: action.cannonId },
        reduceCore,
      );

    case 'ANSWER_CHOSEN':
      return applyCoreEvent(
        state,
        {
          type: 'ANSWER_CHOSEN',
          choiceIndex: action.choiceIndex,
          elapsedMs: action.elapsedMs,
        },
        reduceCore,
      );

    case 'TIMER_EXPIRED':
      return applyCoreEvent(state, { type: 'TIMER_EXPIRED' }, reduceCore);

    case 'ADVANCE': {
      if (action.beatToken !== state.beatToken) return state;

      const beats = presentationBeatsForCore(state.core);
      const nextIndex = state.beatIndex + 1;

      if (nextIndex < beats.length) {
        return {
          ...state,
          phase: beats[nextIndex]!,
          beatToken: state.beatToken + 1,
          beatIndex: nextIndex,
        };
      }

      if (
        state.core.phase !== 'countdown' &&
        state.core.phase !== 'resolvePlayer' &&
        state.core.phase !== 'resolveRival'
      ) {
        return state;
      }

      const advancedCore = advanceCore(state.core, reduceCore);
      if (advancedCore === state.core) return state;
      return createAdapterState(advancedCore, state.beatToken + 1);
    }
  }
}

export function reduceAdapterCore(
  state: AdapterState,
  core: DuelState,
  _reduceCore: typeof duelReducer = duelReducer,
): AdapterState {
  void _reduceCore;
  if (core === state.core) return state;
  return createAdapterState(core, state.beatToken + 1);
}

/** Serializable presentation snapshot for a terminal or in-flight core state. */
export function projectPresentation(core: DuelState): {
  readonly phase: PresentationBeat;
  readonly beats: readonly PresentationBeat[];
  readonly duelId: string | undefined;
  readonly playerHull: number;
  readonly enemyHull: number;
  readonly won: boolean | null;
  readonly coins: number | null;
} {
  const beats = presentationBeatsForCore(core);
  const won = core.phase === 'victory' ? true : core.phase === 'defeat' ? false : null;
  const coins =
    core.phase === 'victory' || core.phase === 'defeat'
      ? (core.result as DuelResult & { readonly coins: number }).coins
      : null;

  return {
    phase: beats[0] ?? initialBeatForCore(core),
    beats,
    duelId: core.duelId,
    playerHull: core.playerHull,
    enemyHull: core.enemyHull,
    won,
    coins,
  };
}

export function replayDuelPresentation(record: {
  readonly config: DuelConfig;
  readonly eventLog: readonly DuelEvent[];
}): { readonly core: DuelState; readonly presentation: ReturnType<typeof projectPresentation> } {
  let core = createDuelState(record.config);
  for (const event of record.eventLog) {
    core = duelReducer(core, event);
  }
  return { core, presentation: projectPresentation(core) };
}

export function createDuelAdapter(
  config: DuelConfig,
  options: {
    readonly initialCore?: DuelState;
    readonly reduceCore?: typeof duelReducer;
    readonly onReward?: (terminal: DuelState) => void;
  } = {},
): AdapterController {
  const reduceCore = options.reduceCore ?? duelReducer;
  let alive = true;
  let rewardedId: string | null = null;
  let state = createAdapterState(
    options.initialCore ?? advanceCore(createDuelState(config), reduceCore),
  );
  const listeners = new Set<() => void>();

  const maybeReward = (core: DuelState): void => {
    if (options.onReward === undefined) return;
    if (core.phase !== 'victory' && core.phase !== 'defeat') return;
    const id = core.duelId ?? '';
    if (rewardedId === id) return;
    rewardedId = id;
    options.onReward(core);
  };

  const setState = (next: AdapterState): AdapterState => {
    if (next === state) return state;
    state = next;
    maybeReward(next.core);
    for (const listener of listeners) listener();
    return state;
  };

  return {
    getState: () => state,
    dispatch: (action) => {
      if (!alive) return state;
      const next = reduceAdapter(state, action as AdapterAction, reduceCore);
      if (next === state) return state;
      return setState(next);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset: (nextConfig) => {
      if (!alive) return state;
      rewardedId = null;
      return setState(createAdapterState(advanceCore(createDuelState(nextConfig), reduceCore)));
    },
    dispose: () => {
      alive = false;
      listeners.clear();
    },
  };
}
