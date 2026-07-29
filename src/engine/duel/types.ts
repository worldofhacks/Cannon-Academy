/**
 * Duel state vocabulary and initial-state construction (ARCHITECTURE.md §4.2).
 *
 * Transitions live in T-020 / A-039; this module owns the shapes those transitions move between.
 * Immutability is enforced by typing, not `Object.freeze` — see tickets/T-013.md locked decision.
 * Templates are deep-copied at construction so a caller-held config cannot rewrite a live duel.
 */
import { getCannon } from '@content/index';
import type { CannonId, IslandId, SkillId, Template } from '@content/schemas';
import type { ShotOutcome } from '@engine/duel/damage';
import type { Question } from '@engine/questions/types';
import { createRng, type Rng } from '@engine/rng';
import { ENEMY_HULL_BY_ISLAND, PLAYER_HULL } from '@engine/tuning';

export const DUEL_PHASES = [
  'countdown',
  'playerChoose',
  'reload',
  'resolvePlayer',
  'rivalTurn',
  'resolveRival',
  'victory',
  'defeat',
] as const;

export type DuelPhase = (typeof DUEL_PHASES)[number];

export interface ActionLogEntry {
  readonly actor: 'player' | 'rival';
  readonly cannonId: CannonId;
  readonly correct: boolean;
  readonly elapsedMs: number;
  /** Distinct timeout marker (A-039 / D-8). Omitted on ordinary hit/miss rows. */
  readonly result?: 'timeout';
  /** Replayable source event for timeout rows (A-039 AC-2). */
  readonly event?: { readonly type: 'TIMER_EXPIRED' };
}

export interface RivalAction {
  readonly cannonId: CannonId;
}

export interface RivalVolley {
  readonly cannonId: CannonId;
  readonly correct: boolean;
  readonly elapsedMs: number;
}

export interface RivalView {
  readonly volleyNumber: number;
  readonly playerHull: number;
  readonly enemyHull: number;
  readonly enemyMaxHull: number;
  readonly rivalLoadout: readonly CannonId[];
  readonly playerRecentCorrect: readonly boolean[];
}

export interface DuelTally {
  readonly correctAnswers: number;
  readonly totalAnswers: number;
  readonly perfectShots: number;
  readonly bySkill: Readonly<
    Partial<Record<SkillId, { readonly correct: number; readonly attempts: number }>>
  >;
}

export interface DuelResult {
  readonly won: boolean;
  readonly tally: DuelTally;
  readonly volleys: number;
}

export type DuelEvent =
  | { readonly type: 'CANNON_SELECTED'; readonly cannonId: CannonId }
  | { readonly type: 'ANSWER_CHOSEN'; readonly choiceIndex: number; readonly elapsedMs: number }
  | { readonly type: 'TIMER_EXPIRED' }
  | { readonly type: 'ANIMATION_DONE' }
  | { readonly type: 'RIVAL_ACTION'; readonly volley: RivalVolley };

export interface DuelConfig {
  readonly seed: number;
  readonly islandId: IslandId;
  readonly playerLoadout: readonly CannonId[];
  readonly rivalLoadout: readonly CannonId[];
  readonly templatesBySkill: Readonly<Partial<Record<SkillId, readonly Template[]>>>;
  readonly enemyMaxHull?: number;
  /** Stable duel identity for settlement / replay (A-039). */
  readonly duelId?: string;
  /** Guided-mode floor; omitted preserves a normal duel (floor 0). */
  readonly playerHullFloor?: number;
}

export interface DuelCore {
  readonly seed: number;
  readonly rng: Rng;
  readonly turnToken: number;
  readonly volleyNumber: number;
  readonly islandId: IslandId;
  readonly playerHull: number;
  readonly enemyHull: number;
  readonly enemyMaxHull: number;
  readonly playerLoadout: readonly CannonId[];
  readonly rivalLoadout: readonly CannonId[];
  readonly recentTemplateIds: readonly string[];
  readonly actionLog: readonly ActionLogEntry[];
  readonly tally: DuelTally;
  readonly templatesBySkill: Readonly<Partial<Record<SkillId, readonly Template[]>>>;
  /** Set by createDuelState; optional so hand-built fixtures keep compiling. */
  readonly duelId?: string;
  /** Set by createDuelState (default 0); optional for hand-built fixtures. */
  readonly playerHullFloor?: number;
}

export type DuelState =
  | (DuelCore & { readonly phase: 'countdown' })
  | (DuelCore & { readonly phase: 'playerChoose' })
  | (DuelCore & {
      readonly phase: 'reload';
      readonly cannonId: CannonId;
      readonly question: Question;
      readonly timerMs: number;
    })
  | (DuelCore & {
      readonly phase: 'resolvePlayer';
      readonly cannonId: CannonId;
      readonly outcome: ShotOutcome;
    })
  | (DuelCore & { readonly phase: 'rivalTurn' })
  | (DuelCore & {
      readonly phase: 'resolveRival';
      readonly volley: RivalVolley;
      readonly damageToPlayer: number;
    })
  | (DuelCore & { readonly phase: 'victory'; readonly result: DuelResult })
  | (DuelCore & { readonly phase: 'defeat'; readonly result: DuelResult });

function assertLoadout(loadout: readonly CannonId[], field: 'playerLoadout' | 'rivalLoadout'): void {
  if (loadout.length === 0) {
    throw new Error(`createDuelState: ${field} must contain at least one cannon`);
  }
  for (const id of loadout) {
    try {
      getCannon(id);
    } catch {
      throw new Error(`createDuelState: ${field} names unknown cannon '${id}'`);
    }
  }
}

function validateConfig(config: DuelConfig): void {
  // Replay key: validate and throw; never mask with `>>> 0` (AC-5).
  if (!Number.isInteger(config.seed) || config.seed < -0xffffffff || config.seed > 0xffffffff) {
    throw new Error(`createDuelState: seed must be a finite integer in [-0xffffffff, 0xffffffff]`);
  }
  assertLoadout(config.playerLoadout, 'playerLoadout');
  assertLoadout(config.rivalLoadout, 'rivalLoadout');
  if (!Object.hasOwn(ENEMY_HULL_BY_ISLAND, config.islandId)) {
    throw new Error(`createDuelState: islandId '${config.islandId}' has no enemy hull entry`);
  }
}

/** Deep-copies every params range array so no key aliases the caller's (AC-16). */
function copyParams(
  params: Readonly<Record<string, readonly [number, number]>>,
): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const key of Object.keys(params)) {
    const range = params[key]!;
    out[key] = [range[0], range[1]];
  }
  return out;
}

/**
 * Deep-copies a Template including distractors, every params range, and constraints.
 * Optional fields are omitted when absent (exactOptionalPropertyTypes / AC-6).
 */
function copyTemplate(template: Template): Template {
  return {
    id: template.id,
    skill: template.skill,
    text: template.text,
    params: copyParams(template.params),
    answerExpr: template.answerExpr,
    distractors: [...template.distractors],
    ...(template.constraints !== undefined ? { constraints: [...template.constraints] } : {}),
    ...(template.isWordProblem !== undefined ? { isWordProblem: template.isWordProblem } : {}),
    ...(template.readAloud !== undefined ? { readAloud: template.readAloud } : {}),
    ...(template.difficulty !== undefined ? { difficulty: template.difficulty } : {}),
  };
}

function copyTemplatesBySkill(
  source: Readonly<Partial<Record<SkillId, readonly Template[]>>>,
): Partial<Record<SkillId, readonly Template[]>> {
  const out: Partial<Record<SkillId, readonly Template[]>> = {};
  for (const [skill, templates] of Object.entries(source) as [SkillId, readonly Template[] | undefined][]) {
    if (templates === undefined) continue;
    out[skill] = templates.map((t) => copyTemplate(t));
  }
  return out;
}

function duelIdFor(config: DuelConfig): string {
  if (config.duelId !== undefined) return config.duelId;
  return `duel-${(config.seed >>> 0).toString(36)}`;
}

function buildCore(config: DuelConfig): DuelCore {
  const enemyHull = config.enemyMaxHull ?? ENEMY_HULL_BY_ISLAND[config.islandId];

  return {
    seed: config.seed,
    rng: createRng(config.seed),
    turnToken: 0,
    volleyNumber: 1,
    islandId: config.islandId,
    playerHull: PLAYER_HULL,
    enemyHull,
    enemyMaxHull: enemyHull,
    playerLoadout: [...config.playerLoadout],
    rivalLoadout: [...config.rivalLoadout],
    recentTemplateIds: [],
    actionLog: [],
    tally: {
      correctAnswers: 0,
      totalAnswers: 0,
      perfectShots: 0,
      bySkill: {},
    },
    templatesBySkill: copyTemplatesBySkill(config.templatesBySkill),
    duelId: duelIdFor(config),
    playerHullFloor: config.playerHullFloor ?? 0,
  };
}

/** Constructs the initial countdown state from a validated config. */
export function createDuelState(config: DuelConfig): DuelState {
  validateConfig(config);
  return { ...buildCore(config), phase: 'countdown' };
}

/** True exactly for the two terminal phases. */
export function isTerminalPhase(phase: DuelPhase): boolean {
  return phase === 'victory' || phase === 'defeat';
}

/**
 * Projects the information an Opponent may see — hulls, volley, own loadout, and the
 * player's recent correctness (most-recent-first). Hides seed, rng, question, and actionLog.
 * Timeouts are excluded from mercy accuracy (A-039 / D-8).
 */
export function toRivalView(state: DuelState): RivalView {
  const playerRecentCorrect = state.actionLog
    .filter(
      (entry): entry is ActionLogEntry & { actor: 'player' } =>
        entry.actor === 'player' && entry.result !== 'timeout',
    )
    .map((entry) => entry.correct)
    .reverse();

  return {
    volleyNumber: state.volleyNumber,
    playerHull: state.playerHull,
    enemyHull: state.enemyHull,
    enemyMaxHull: state.enemyMaxHull,
    rivalLoadout: state.rivalLoadout,
    playerRecentCorrect,
  };
}
