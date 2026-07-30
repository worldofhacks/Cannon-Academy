/**
 * Harbor store — child-facing copy and tap geometry (A-055, superseding A-033).
 *
 * No real-money language anywhere: coins only. Every refusal names the way forward rather than the
 * "no" — the board's "not yet" sheet is titled *"Not yet, Captain"*, never "you can't afford this".
 */
import { MIN_TAP_TARGET } from './tokens';

/** Purchase control minimum size — matches the app-wide child tap floor. */
export const HARBOR_PURCHASE_TARGET = MIN_TAP_TARGET;

export const harborTitle = 'The harbor';

/** The board's own line, and the reason the screen is safe for a five-year-old. */
export const harborSubtitle = 'Every ship here is paint only. None of them shoot harder.';

export function harborBalanceLabel(coins: number): string {
  return `${coins} coins`;
}

export function harborPriceLabel(price: number): string {
  return `${price}`;
}

/**
 * The "not yet" line. Converts a shortfall into duels, which is far kinder than a number a child
 * has to subtract — and it is deliberately computed from the payout floor upstream, so the estimate
 * errs toward arriving sooner than promised.
 */
export function harborShortfallMessage(duelsAway: number): string {
  if (duelsAway <= 0) return '';
  return duelsAway === 1 ? 'About one more duel.' : `About ${duelsAway} more duels.`;
}

/** Why the shelf is still worth visiting with an empty purse. */
export const harborEarnHint = 'Every duel pays coins — even the ones you lose.';

export const harborOwnedLabel = 'YOURS';
export const harborEquippedLabel = 'FLYING NOW';
