/**
 * Mercy policy — pure, serialisable state that keeps a struggling child from facing
 * an unfair rival (PLAN.md §Questions / opponents; ARCHITECTURE.md §4.2).
 *
 * All thresholds come from `@engine/tuning`. No clocks, no ambient randomness.
 */
import {
  BOT_ACCURACY_WINDOW,
  BOT_MERCY_MARGIN,
  MERCY_FORCED_MISFIRES,
  MERCY_LOSS_STREAK_TRIGGER,
} from '@engine/tuning';

export interface MercyState {
  readonly recentPlayerCorrect: readonly boolean[];
  readonly consecutiveLosses: number;
  readonly forcedMisfiresRemaining: number;
}

export const emptyMercyState: MercyState = {
  recentPlayerCorrect: [],
  consecutiveLosses: 0,
  forcedMisfiresRemaining: 0,
};

export function recordPlayerAnswer(m: MercyState, correct: boolean): MercyState {
  const recentPlayerCorrect = [correct, ...m.recentPlayerCorrect].slice(0, BOT_ACCURACY_WINDOW);
  return {
    recentPlayerCorrect,
    consecutiveLosses: m.consecutiveLosses,
    forcedMisfiresRemaining: m.forcedMisfiresRemaining,
  };
}

export function recordDuelResult(m: MercyState, playerWon: boolean): MercyState {
  if (playerWon) {
    return {
      recentPlayerCorrect: m.recentPlayerCorrect,
      consecutiveLosses: 0,
      forcedMisfiresRemaining: m.forcedMisfiresRemaining,
    };
  }
  const consecutiveLosses = m.consecutiveLosses + 1;
  if (consecutiveLosses >= MERCY_LOSS_STREAK_TRIGGER) {
    return {
      recentPlayerCorrect: m.recentPlayerCorrect,
      consecutiveLosses: 0,
      forcedMisfiresRemaining: MERCY_FORCED_MISFIRES,
    };
  }
  return {
    recentPlayerCorrect: m.recentPlayerCorrect,
    consecutiveLosses,
    forcedMisfiresRemaining: m.forcedMisfiresRemaining,
  };
}

export function playerRecentAccuracy(m: MercyState): number {
  const n = m.recentPlayerCorrect.length;
  if (n === 0) return 0;
  let correct = 0;
  for (const c of m.recentPlayerCorrect) {
    if (c) correct += 1;
  }
  return correct / n;
}

export function targetBotAccuracy(
  m: MercyState,
  band: { readonly min: number; readonly max: number },
): number {
  if (m.recentPlayerCorrect.length === 0) {
    return band.min;
  }
  const raw = playerRecentAccuracy(m) - BOT_MERCY_MARGIN;
  if (raw < band.min) return band.min;
  if (raw > band.max) return band.max;
  return raw;
}

export function consumeForcedMisfire(m: MercyState): MercyState {
  const remaining = m.forcedMisfiresRemaining;
  return {
    recentPlayerCorrect: m.recentPlayerCorrect,
    consecutiveLosses: m.consecutiveLosses,
    forcedMisfiresRemaining: remaining > 0 ? remaining - 1 : 0,
  };
}
