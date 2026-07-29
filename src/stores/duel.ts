/**
 * The duel's PRESENTATION state machine.
 *
 * This is not T-013/T-020. Those own the canonical `DuelState` on the engine track, and when they
 * land this reducer collapses into a thin adapter — phases and timings are a screen concern and
 * stay here either way. What matters is that nothing below re-implements a rule the engine already
 * owns: damage comes from `resolveShot`, payout from `computeCoinPayout`, hull from `tuning`. The
 * reducer decides *what is on screen and for how long*, and nothing else.
 *
 * Pure and seeded, for the same reason the engine is. `Rng` is threaded through every transition
 * and `Date.now()` never appears — `elapsedMs` arrives as part of the `ANSWER` action, measured by
 * the screen. That keeps a duel replayable from `{seed, action log}` and keeps this file testable
 * without a clock.
 */
import type { Cannon } from '@content/schemas';
import { resolveShot, type ShotOutcome } from '@engine/duel/damage';
import { computeCoinPayout } from '@engine/economy';
import { createRng, nextInt, type Rng } from '@engine/rng';
import { ENEMY_HULL_BY_ISLAND, PLAYER_HULL } from '@engine/tuning';

import { nextQuestion, type DuelQuestion } from '../services/questions';

/**
 * Every screen the duel can be showing.
 *
 * `perfect` sits between `question` and `fly` rather than replacing either: board 3b's celebration
 * is 450ms in place, and per T-031 it celebrates the damage the fast answer already earned. It
 * does not add a ball and it does not branch the shot.
 */
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

export interface DuelState {
  readonly phase: DuelPhase;
  readonly rng: Rng;
  readonly cannon: Cannon | null;
  readonly question: DuelQuestion | null;
  /** The option the player tapped, or `null` for an unanswered or timed-out question. */
  readonly picked: number | null;
  readonly playerHull: number;
  readonly rivalHull: number;
  readonly playerMax: number;
  readonly rivalMax: number;
  readonly turn: number;
  /** The last resolved volley, kept so the resolve banner can explain the number it shows. */
  readonly outcome: ShotOutcome | null;
  readonly rivalDamage: number;
  readonly asked: number;
  readonly right: number;
  readonly perfects: number;
  readonly coins: number;
  readonly chestOpen: boolean;
}

export type DuelAction =
  | { readonly type: 'PICK_CANNON'; readonly cannon: Cannon }
  | { readonly type: 'ANSWER'; readonly value: number; readonly elapsedMs: number }
  | { readonly type: 'TIMEOUT' }
  /** The screen's "the current beat has played out" tick. One action, so timing lives in one place. */
  | { readonly type: 'ADVANCE' }
  | { readonly type: 'OPEN_CHEST' }
  | { readonly type: 'RESET' };

/**
 * Rival damage — PROVISIONAL, like `services/questions`. T-021 owns bot behaviour (accuracy bands,
 * mercy tracking, forced misfires); until it lands the rival hits for a flat band so the duel can
 * be played end to end. Seeded, so replacing it changes the numbers, not the replay property.
 */
const RIVAL_DAMAGE_MIN = 7;
const RIVAL_DAMAGE_MAX = 12;

export function initialDuelState(seed: number): DuelState {
  return {
    phase: 'select',
    rng: createRng(seed),
    cannon: null,
    question: null,
    picked: null,
    playerHull: PLAYER_HULL,
    rivalHull: ENEMY_HULL_BY_ISLAND.port_sumwich,
    playerMax: PLAYER_HULL,
    rivalMax: ENEMY_HULL_BY_ISLAND.port_sumwich,
    turn: 1,
    outcome: null,
    rivalDamage: 0,
    asked: 0,
    right: 0,
    perfects: 0,
    coins: 0,
    chestOpen: false,
  };
}

/** The rival fires. Shared by every path that hands the turn over. */
function rivalVolley(s: DuelState): DuelState {
  const [damage, rng] = nextInt(s.rng, RIVAL_DAMAGE_MIN, RIVAL_DAMAGE_MAX);
  const playerHull = Math.max(0, s.playerHull - damage);
  return { ...s, rng, phase: 'rivalImpact', rivalDamage: damage, playerHull };
}

/** Win/lose bookkeeping, or back to the tray for another turn. */
function settle(s: DuelState): DuelState {
  if (s.rivalHull <= 0) {
    return {
      ...s,
      phase: 'victory',
      chestOpen: false,
      coins: computeCoinPayout({
        won: true,
        totalAnswers: s.asked,
        correctAnswers: s.right,
        perfectShots: s.perfects,
      }),
    };
  }
  if (s.playerHull <= 0) {
    return {
      ...s,
      phase: 'defeat',
      coins: computeCoinPayout({
        won: false,
        totalAnswers: s.asked,
        correctAnswers: s.right,
        perfectShots: s.perfects,
      }),
    };
  }
  return { ...s, phase: 'select', turn: s.turn + 1, cannon: null, question: null, picked: null };
}

export function duelReducer(s: DuelState, action: DuelAction): DuelState {
  switch (action.type) {
    case 'PICK_CANNON': {
      const [question, rng] = nextQuestion(action.cannon.skill, s.rng);
      return { ...s, rng, phase: 'question', cannon: action.cannon, question, picked: null };
    }

    case 'ANSWER': {
      if (s.phase !== 'question' || s.cannon === null || s.question === null) return s;
      const correct = action.value === s.question.answer;
      const [outcome, rng] = resolveShot({
        cannon: s.cannon,
        correct,
        elapsedMs: action.elapsedMs,
        rng: s.rng,
      });

      const base: DuelState = {
        ...s,
        rng,
        outcome,
        picked: action.value,
        asked: s.asked + 1,
        right: s.right + (correct ? 1 : 0),
        perfects: s.perfects + (outcome.perfectShot ? 1 : 0),
        // Recoil is the engine's, not the screen's: a volatile gun bites its own deck on a wrong
        // answer and `damageToSelf` is where that lives.
        playerHull: Math.max(0, s.playerHull - outcome.damageToSelf),
      };

      if (!correct) return { ...base, phase: 'miss' };
      return { ...base, phase: outcome.perfectShot ? 'perfect' : 'fly' };
    }

    case 'TIMEOUT': {
      if (s.phase !== 'question') return s;
      // A burned fuse costs nothing but the turn. It counts as asked so accuracy stays honest,
      // and it is not a wrong answer, so no recoil — the gun never fired.
      return { ...s, phase: 'timeout', picked: null, asked: s.asked + 1 };
    }

    case 'ADVANCE': {
      switch (s.phase) {
        case 'perfect':
          return { ...s, phase: 'fly' };
        case 'fly': {
          const damage = s.outcome?.damageToEnemy ?? 0;
          return { ...s, phase: 'impact', rivalHull: Math.max(0, s.rivalHull - damage) };
        }
        case 'impact':
          // A sunk rival ends it here; there is no rival turn after the shot that sank them.
          return s.rivalHull <= 0 ? settle(s) : { ...s, phase: 'watch' };
        case 'miss':
        case 'timeout':
          // Recoil can sink the player on their own turn. Check before handing over.
          return s.playerHull <= 0 ? settle(s) : { ...s, phase: 'watch' };
        case 'watch':
          return { ...s, phase: 'rivalFly' };
        case 'rivalFly':
          return rivalVolley(s);
        case 'rivalImpact':
          return settle(s);
        default:
          return s;
      }
    }

    case 'OPEN_CHEST':
      return { ...s, chestOpen: true };

    case 'RESET':
      // A fresh duel, but NOT a fresh seed — the rng carries forward, so replaying the session
      // from its seed replays every duel in it, not just the first.
      return { ...initialDuelState(0), rng: s.rng };
  }
}

/**
 * How long each phase holds before `ADVANCE`. Durations are the design boards' own, and the ones
 * that look generous are deliberate: `impact` and `miss` are where a child reads what happened,
 * and `miss`/`timeout` also carry the correct answer, which is the only teaching moment in the
 * whole loop. `question` is absent because it ends on a tap or the cannon's own timer.
 */
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
