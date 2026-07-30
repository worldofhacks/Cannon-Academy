/**
 * Thin presentation store over the canonical duel engine (A-039).
 *
 * Gameplay values are projected from `core`; this module owns beat timing and screen-facing
 * action names only.
 */
import { getCannon, cannons, getIsland, islands } from '@content/index';
import type { Cannon, GradeBand, IslandId, SkillId } from '@content/schemas';
import { GRADE_BANDS } from '@content/schemas';
import { drawNextDuelSeed, duelReducer as coreDuelReducer } from '@engine/duel/reducer';
import {
  createDuelState,
  type DuelConfig,
  type DuelEvent,
  type DuelState as CoreDuelState,
  type RivalVolley,
} from '@engine/duel/types';

import {
  createAdapterState,
  reduceAdapter,
  reduceAdapterCore,
  type AdapterState,
} from '../services/duelAdapter';
import type { ValidDuelContext } from '../services/duelContext';
import { inBandLoadout } from '../services/loadout';
import { deriveRivalLoadout } from '../services/rivalLoadout';
import { planRivalVolleySync } from '../services/rivalDriver';
import { TEMPLATE_POOLS } from '../services/templatePools';
import { emptyCaptain, type Captain } from './player';

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
  readonly turnToken: number;
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

type LegacyBundle = {
  readonly adapter: AdapterState;
  readonly captain: Captain;
};

const legacyBundles = new WeakMap<DuelState, LegacyBundle>();

function legacyBundle(state: DuelState): LegacyBundle | undefined {
  return legacyBundles.get(state);
}

function requireLegacyBundle(state: DuelState): LegacyBundle {
  const bundle = legacyBundles.get(state);
  if (bundle === undefined) {
    throw new Error('duel store: missing legacy bundle');
  }
  return bundle;
}

export type DuelAction =
  | { readonly type: 'PICK_CANNON'; readonly cannon: Cannon }
  | { readonly type: 'ANSWER'; readonly value: number; readonly elapsedMs: number }
  | { readonly type: 'TIMEOUT' }
  | { readonly type: 'ADVANCE' }
  | {
      readonly type: 'RIVAL_RESULT';
      readonly turnToken: number;
      readonly volley: RivalVolley;
    }
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

/** The widest band the catalog declares — read from `GRADE_BANDS`, never written down again. */
const TOP_GRADE_BAND: GradeBand = GRADE_BANDS[GRADE_BANDS.length - 1] ?? 'g4_5';

/**
 * The omniscient fallback captain: every cannon, every island, no real placement behind it.
 *
 * Its band is the TOP band rather than one derived from the island, and that is load-bearing now
 * that `legacyConfig` applies the ceiling (A-058). This captain equips the whole catalog, so the top
 * band is the only band consistent with the guns it is holding — deriving a narrower one from the
 * island produced a captain whose declared band contradicted its own loadout, which is exactly the
 * contradiction the ceiling exists to resolve, and the ceiling would have resolved it by silently
 * deleting six cannons from a fixture whose whole purpose is to hold all eleven.
 *
 * It reaches no child. `app/duel.tsx` builds its state from this only on the `!duelContext.ok`
 * branch, and that branch renders `<Redirect href="/chart" />` instead of the duel.
 */
function defaultLegacyCaptain(islandId: IslandId = 'port_sumwich'): Captain {
  return {
    ...emptyCaptain(),
    gradeBand: TOP_GRADE_BAND,
    equippedCannons: cannons.map((cannon) => cannon.id),
    ownedCannons: cannons.map((cannon) => cannon.id),
    unlockedIslands: islands.map((island) => island.id),
    currentIsland: islandId,
    hasCompletedOnboarding: true,
  };
}

/**
 * The one place a duel's questions are chosen, and therefore the one place the band ceiling has to
 * hold (A-058).
 *
 * `playerLoadout` is what the engine will accept a `CANNON_SELECTED` for, and the question it draws
 * is the picked cannon's own skill — so filtering here is filtering the questions themselves.
 * `app/duel.tsx` applies the same rule to the tray it renders, or the screen would offer a tile the
 * engine silently refuses.
 *
 * `templatesBySkill` is handed over WHOLE and unfiltered, on purpose. `templatePools.ts` warns that
 * file order is part of the replay contract because the generator indexes into the array it is
 * given; subsetting a skill's pool would change which question a seed produces. Dropping whole
 * CANNONS changes which pool is indexed, never the indexing, so an in-band gun at a given seed draws
 * the same question it always did.
 */
function legacyConfig(seed: number, islandId: IslandId, captain: Captain): DuelConfig {
  const band = captain.gradeBand;
  const equipped = inBandLoadout(captain.equippedCannons, band);
  // An empty equipped set is a legacy or half-written save, not a choice. It falls back to the
  // catalog — through the same ceiling, because the untethered version of this line handed a
  // kindergartner every gun in the game including multiplication and division.
  const playerLoadout =
    equipped.length > 0 ? [...equipped] : inBandLoadout(cannons.map((cannon) => cannon.id), band);

  return {
    seed,
    duelId: `duel-${(seed >>> 0).toString(36)}`,
    islandId,
    playerLoadout,
    rivalLoadout: [...deriveRivalLoadout(captain, islandId)],
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
    turnToken: core.turnToken,
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

function attachLegacyState(adapter: AdapterState, captain: Captain, previous?: DuelState): DuelState {
  const next = projectLegacy(adapter, previous);
  legacyBundles.set(next, { adapter, captain });
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

function applyRivalVolleyResult(
  adapter: AdapterState,
  turnToken: number,
  volley: RivalVolley,
): AdapterState {
  if (adapter.core.phase !== 'rivalTurn' || adapter.core.turnToken !== turnToken) {
    return adapter;
  }
  const core = coreDuelReducer(adapter.core, {
    type: 'RIVAL_ACTION',
    volley,
    turnToken,
  } as DuelEvent);
  if (core === adapter.core) return adapter;
  return {
    ...adapter,
    core,
    phase: 'rivalImpact',
    beatToken: adapter.beatToken + 1,
    beatIndex: 2,
  };
}

function advanceLegacyAdapter(bundle: LegacyBundle): AdapterState {
  const { adapter, captain } = bundle;

  if (adapter.core.phase === 'resolveRival' && adapter.phase === 'rivalFly') {
    return {
      ...adapter,
      phase: 'rivalImpact',
      beatToken: adapter.beatToken + 1,
      beatIndex: 2,
    };
  }
  if (adapter.core.phase === 'rivalTurn' && adapter.phase === 'watch') {
    return { ...adapter, phase: 'rivalFly', beatToken: adapter.beatToken + 1 };
  }
  if (adapter.core.phase === 'rivalTurn' && adapter.phase === 'rivalFly') {
    const volley = planRivalVolleySync({
      captain,
      loadout: adapter.core.rivalLoadout,
      core: adapter.core,
    });
    return applyRivalVolleyResult(adapter, adapter.core.turnToken, volley);
  }
  return reduceAdapter(adapter, { type: 'ADVANCE', beatToken: adapter.beatToken }, coreDuelReducer);
}

function reduceLegacy(state: DuelState, action: DuelAction): DuelState {
  let bundle = legacyBundle(state);
  let adapter = bundle?.adapter;

  switch (action.type) {
    case 'PICK_CANNON': {
      if (
        (state.phase !== 'select' && state.phase !== 'question') ||
        adapter === undefined ||
        bundle === undefined
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
      if (adapter === undefined || bundle === undefined) return state;
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
      if (adapter === undefined || bundle === undefined || adapter.core.phase !== 'reload') {
        return state;
      }
      const core = coreDuelReducer(adapter.core, { type: 'TIMER_EXPIRED' });
      adapter = reduceAdapterCore(adapter, core);
      break;
    }
    case 'RIVAL_RESULT': {
      if (adapter === undefined || bundle === undefined) return state;
      const nextAdapter = applyRivalVolleyResult(adapter, action.turnToken, action.volley);
      if (nextAdapter === adapter) return state;
      adapter = nextAdapter;
      break;
    }
    case 'ADVANCE': {
      if (adapter === undefined || bundle === undefined) return state;
      const next = advanceLegacyAdapter(bundle);
      if (next === adapter) return state;
      adapter = next;
      break;
    }
    case 'OPEN_CHEST': {
      if (adapter === undefined || bundle === undefined) return state;
      const next = { ...state, chestOpen: true };
      legacyBundles.set(next, bundle);
      return next;
    }
    case 'RESET': {
      const live = requireLegacyBundle(state);
      const [seed, nextRng] = drawNextDuelSeed(state.rng);
      adapter = bootAdapter(legacyConfig(seed, state.islandId, live.captain));
      adapter = { ...adapter, core: { ...adapter.core, rng: nextRng } };
      bundle = { adapter, captain: live.captain };
      void live;
      return attachLegacyState(adapter, bundle.captain);
    }
    default:
      return state;
  }

  if (adapter === undefined || bundle === undefined) return state;
  const next = attachLegacyState(adapter, bundle.captain, state);
  return next.phase === state.phase &&
    next.chestOpen === state.chestOpen &&
    next.playerHull === state.playerHull &&
    next.rivalDamage === state.rivalDamage &&
    adapter === bundle.adapter
    ? state
    : next;
}

export function initialDuelState(seed: number): DuelState {
  const cap = defaultLegacyCaptain();
  const adapter = bootAdapter(legacyConfig(seed, 'port_sumwich', cap));
  return attachLegacyState(adapter, cap);
}

/** Island-aware initializer for the live duel screen (A-029 / A-030). */
export function initialDuelStateWithContext(
  context: ValidDuelContext,
  seed: number,
  captain: Captain = defaultLegacyCaptain(context.islandId),
): DuelState {
  const adapter = bootAdapter(legacyConfig(seed, context.islandId, captain));
  return attachLegacyState(adapter, captain);
}

export function duelReducer(state: DuelState, action: DuelAction): DuelState {
  return reduceLegacy(state, action);
}

/** Live rival-turn core snapshot for the async screen driver (A-030). */
export function legacyCoreForRival(
  state: DuelState,
): Extract<CoreDuelState, { phase: 'rivalTurn' }> | null {
  const bundle = legacyBundles.get(state);
  if (bundle === undefined || bundle.adapter.core.phase !== 'rivalTurn') return null;
  return bundle.adapter.core;
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
