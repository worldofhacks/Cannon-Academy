/**
 * Harbor store presentation — child-facing copy and tap geometry (A-033).
 *
 * No real-money language: coins and game chest only.
 */
import { HARBOR_CHEST_PRICE } from '@engine/tuning';

import { MIN_TAP_TARGET } from './tokens';

/** Purchase control minimum size — matches the app-wide child tap floor. */
export const HARBOR_PURCHASE_TARGET = MIN_TAP_TARGET;

export const harborProductTitle = 'Game chest';

export const harborPurchaseLabel = `${HARBOR_CHEST_PRICE} coins`;

export function harborBalanceLabel(coins: number): string {
  return `${coins} coins`;
}

export function harborInsufficientMessage(price: number): string {
  return `You need ${price} coins for a game chest.`;
}
