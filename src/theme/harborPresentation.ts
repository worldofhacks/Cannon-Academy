/**
 * Harbor — child-facing copy, derived numbers, and the board's measured geometry (A-055).
 *
 * Source: `Cannon Academy Harbor and Rank.dc.html`, frame 8a. Every number in `HARBOR_BOARD` was
 * read off that markup; where this file departs from it, the comment says which ruling moved it and
 * why. Nothing here is a plausible-looking guess.
 *
 * No real-money language anywhere: coins only. Every refusal names the way forward rather than the
 * "no" — the board's sheet is titled *"Not yet, Captain"*, never "you can't afford this".
 *
 * ## Why a presentation module reads the economy
 *
 * `HARBOR_DUEL_COIN_RANGE` imports two `@engine/tuning` constants. That is deliberate and it is the
 * opposite of the rule `shipSkins.ts` follows (a skin must never reach the engine, because a skin is
 * paint). This is the mirror case: the empty-purse screen *promises a payout*, so it must track the
 * payout formula or it becomes a lie the first time anyone tunes the economy. The board hardcodes
 * "20–40 COINS"; that number is derived here instead.
 */
import { COINS_PER_ACCURACY_PERCENT, COINS_WIN_BASE } from '@engine/tuning';

import type { ShelfItem } from '../services/harbor';
import type { Captain } from '../stores/player';
import { skinOrDefault, type ShipSkin } from './shipSkins';
import { MIN_TAP_TARGET } from './tokens';

/** Purchase control minimum size — matches the app-wide child tap floor. */
export const HARBOR_PURCHASE_TARGET = MIN_TAP_TARGET;

// ── Copy ─────────────────────────────────────────────────────────────────────────────────────

/** The board's header word. Not "The harbor" — the frame is one word wide at 24pt Baloo. */
export const harborTitle = 'Harbor';

/** The board's own footer line, and the reason the screen is safe for a five-year-old. */
export const harborSubtitle = 'Every ship here is paint only. None of them shoot harder.';

export const harborShelfLabel = 'SHIPS ON THE SHELF';
export const harborRarerLabel = 'RARER';

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
 *
 * This is also what the *shelf card* says. The board draws a raw `price − balance` there ("200 to
 * go"), which asks a five-year-old to do the subtraction the whole screen exists to avoid; the
 * owner ruled the duel phrasing wins on the card. The coin arithmetic survives on the confirm
 * modal, which is the one screen that is *about* the arithmetic.
 */
export function harborShortfallMessage(duelsAway: number): string {
  if (duelsAway <= 0) return '';
  return duelsAway === 1 ? 'About one more duel.' : `About ${duelsAway} more duels.`;
}

/** Why the shelf is still worth visiting with an empty purse. */
export const harborEarnHint = 'Every duel pays coins — even the ones you lose.';

/**
 * The two owned states, as the board words them.
 *
 * "IN THE HOLD" and "FLYING" are a pair a non-reader learns by position: the same pill, one of two
 * words, and only one ship is ever flying. The reveal screen gets the long form because it has the
 * room and because it is the sentence the purchase just earned.
 */
export const harborOwnedLabel = 'IN THE HOLD';
export const harborEquippedLabel = 'FLYING';
export const harborRevealOwnedLabel = 'YOURS — FLYING NOW';

export const harborEmptyTitle = 'Sail out and fill it';
export const harborEmptyBubble = 'Purse is empty!';
export const harborPeekLabel = 'WAITING ON THE SHELF';
export const harborDuelButtonLabel = 'Duel';
export const harborRangeButtonLabel = 'Range';

export const harborNotYetTitle = 'Not yet, Captain';
export function harborSavingUpMessage(name: string): string {
  return `${name} is still saving up.`;
}
export const harborGoEarnLabel = 'Go and earn ⚔︎';
export const harborKeepLookingLabel = 'Keep looking';

export function harborConfirmTitle(name: string): string {
  return `Buy ${name}?`;
}
export const harborKeepLabel = 'COINS YOU KEEP';
export const harborBuyLabel = 'Yes — buy it';
export const harborNotNowLabel = 'Not now';

export const harborLeftLabel = 'LEFT';
export const harborBackToShelfLabel = 'Back to the harbor';

// ── What a duel pays, derived rather than transcribed ─────────────────────────────────────────

/**
 * The coin band the empty-purse "Duel" button advertises.
 *
 * `computeCoinPayout` on a win is `COINS_WIN_BASE + COINS_PER_ACCURACY_PERCENT × accuracy% +
 * COINS_PER_PERFECT_SHOT × perfectShots`, rounded. So:
 *
 *   floor    a win with nothing else going right      = `COINS_WIN_BASE`                     → 20
 *   ceiling  the same win at 100% accuracy            = `+ COINS_PER_ACCURACY_PERCENT × 100` → 40
 *
 * Perfect shots sit **above** that ceiling and are deliberately left out: their count is bounded by
 * the number of volleys a duel happens to take, which no constant fixes, so there is no honest
 * closed-form maximum to print. Leaving them out makes the printed band a floor of the true one —
 * the child is never promised more than they can get, which is the same direction of error the
 * designer demanded for the duel estimate ("so the child always arrives sooner than promised").
 *
 * `Math.round` because `COINS_PER_ACCURACY_PERCENT` is a decimal and 0.2 × 100 is not a number
 * anybody wants rendered raw onto a button.
 */
export const HARBOR_DUEL_COIN_RANGE = {
  min: COINS_WIN_BASE,
  max: Math.round(COINS_WIN_BASE + COINS_PER_ACCURACY_PERCENT * 100),
} as const;

/** "20–40 COINS", built from the constants above. En dash, as the board draws it. */
export const harborDuelPayoutLabel = `${HARBOR_DUEL_COIN_RANGE.min}–${HARBOR_DUEL_COIN_RANGE.max} COINS`;

// ── The coin meter ────────────────────────────────────────────────────────────────────────────

/**
 * Ten cells, never a continuous bar.
 *
 * The board's own accessibility rule for this screen is that affordability rests on three channels
 * and none of them is hue — the third being that *"the coin meter is a countable length"*. A
 * continuous fill is a length you cannot count; ten cells is one you can, and the board draws its
 * Rank meters exactly this way. The shelf card's 12pt continuous bar is the outlier, not the rule.
 */
export const HARBOR_METER_SEGMENTS = 10;

export type CoinMeterStep = 'part' | 'half' | 'nearly' | 'full';

export interface CoinMeter {
  /** Cells lit, `0…HARBOR_METER_SEGMENTS`. */
  readonly filled: number;
  readonly step: CoinMeterStep;
  /** The word drawn inside the fill, or `''` when there is no fill to write it on. */
  readonly label: string;
}

/**
 * The board never states where "HALF WAY" starts, so the cut points are declared here.
 *
 * Two properties drive the choice, and both are about a word never contradicting the picture:
 *
 *  1. **The step is read off the cells, not off the ratio.** A meter showing four lit cells says
 *     "HALF WAY" because four of ten *is* about half. Deriving the word from the raw fraction lets
 *     a 39% meter round to four cells and still say "STARTED", which is the exact disagreement the
 *     countable-length rule exists to prevent.
 *  2. **The cut points land on cell boundaries** — 4 and 7 — so every meter that shows the same
 *     number of cells shows the same word, on every device and at every price.
 *
 * The board's own worked example agrees: 128 of 260 is 49%, four cells, and it labels it "HALF WAY".
 *
 * `full` is reserved for an actual complete meter. A partial meter is capped at nine cells rather
 * than allowed to round up to ten, because a full-looking meter over an unaffordable card is the
 * one lie this component must never tell.
 */
const METER_STEP_FLOORS: readonly { readonly atLeast: number; readonly step: CoinMeterStep }[] = [
  { atLeast: 10, step: 'full' },
  { atLeast: 7, step: 'nearly' },
  { atLeast: 4, step: 'half' },
  { atLeast: 1, step: 'part' },
];

const METER_LABELS: Readonly<Record<CoinMeterStep, string>> = {
  part: 'STARTED',
  half: 'HALF WAY',
  nearly: 'NEARLY THERE',
  full: 'ENOUGH',
};

export function harborCoinMeter(balance: number, price: number): CoinMeter {
  const complete = price <= 0 || balance >= price;
  const filled = complete
    ? HARBOR_METER_SEGMENTS
    : Math.max(0, Math.min(HARBOR_METER_SEGMENTS - 1, Math.floor((HARBOR_METER_SEGMENTS * balance) / price)));

  const step = METER_STEP_FLOORS.find((candidate) => filled >= candidate.atLeast)?.step ?? 'part';
  // Nothing saved yet means no fill, and the board draws the word *inside* the fill. An empty
  // meter therefore carries no word at all — the "About N more duels" line beside it does that job.
  return { filled, step, label: filled === 0 ? '' : METER_LABELS[step] };
}

// ── The shelf, as four cards ──────────────────────────────────────────────────────────────────

/**
 * One cell on the board's 2×2 shelf.
 *
 * Structurally a `ShelfItem` plus a `starter` flag, because the board draws **four** ships and
 * `harborShelf()` deliberately returns **three**: the service excludes the starter, since a card
 * offering a skin every captain already owns can never do anything, and `harbor.test.ts` AC-1
 * freezes that list. The fourth cell is therefore composed here at the presentation layer, which is
 * the right seam — "the starter has a card on the shelf" is a layout fact, not a commerce fact.
 */
export interface ShelfCell {
  readonly skin: ShipSkin;
  readonly owned: boolean;
  readonly equipped: boolean;
  readonly affordable: boolean;
  readonly shortfall: number;
  readonly duelsAway: number;
  /** The starter. Never for sale, so it can only ever be worn. */
  readonly starter: boolean;
}

/**
 * The board's four cards, in the board's own order: starter first, then the shelf as the service
 * returns it.
 *
 * The starter's `owned` is read from `captain.ownedSkins` rather than assumed. `emptyCaptain()`
 * seeds it, so it is true in practice — but storage is untrusted (`persistence.ts`), and a card
 * that claims ownership the store does not agree with would offer a "tap to fly it" that silently
 * does nothing.
 */
export function harborShelfCells(captain: Captain, shelf: readonly ShelfItem[]): readonly ShelfCell[] {
  const starter = skinOrDefault(null);
  const starterOwned = captain.ownedSkins.includes(starter.id);

  return [
    {
      skin: starter,
      owned: starterOwned,
      // `equippedSkin: null` means "the starter", so an untouched save needs no migration — see
      // `Captain.equippedSkin`. The card has to honour that or a fresh captain's flying ship shows
      // as merely owned.
      equipped: captain.equippedSkin === null || captain.equippedSkin === starter.id,
      affordable: true,
      shortfall: 0,
      duelsAway: 0,
      starter: true,
    },
    ...shelf.map((item) => ({
      skin: item.skin,
      owned: item.owned,
      equipped: item.equipped,
      affordable: item.affordable,
      shortfall: item.shortfall,
      duelsAway: item.duelsAway,
      starter: false,
    })),
  ];
}

/** What a shelf card announces to a screen reader — the whole card, in one sentence. */
export function harborCellLabel(cell: ShelfCell): string {
  if (cell.owned) {
    return `${cell.skin.name}, ${cell.equipped ? 'flying now' : 'in the hold — tap to fly it'}`;
  }
  if (cell.affordable) return `${cell.skin.name}, ${cell.skin.price} coins, tap to buy`;
  return `${cell.skin.name}, ${cell.skin.price} coins, ${harborShortfallMessage(cell.duelsAway)}`;
}

// ── Measured geometry ─────────────────────────────────────────────────────────────────────────

/**
 * Frame 8a at 375×667, transcribed.
 *
 * Two departures from the markup, both owner rulings:
 *
 *   `back`  the board draws a 44pt tile, under the 64pt child tap floor. Raised. Its ground is the
 *           board's `#1584B8` (`sea`), which carries a white arrow at 4.18 — below AA, and
 *           `tokens.ts` says never to put text on it. Held at the app's `#0A4E70` instead.
 *   `notNow` the board draws 56pt. Raised to the same floor. The board's *sanctioned* small boxes —
 *           the 40pt purse and the 52pt identity pill — keep their visual size and pad the touch
 *           target instead; this button is not one of those.
 */
export const HARBOR_BOARD = {
  /** White arrow on this, not on the board's `sea`. See the note above. */
  backGround: '#0A4E70',
  header: { padTop: 8, padBottom: 12, padX: 12, gap: 12, backRadius: 14, titleSize: 24 },
  purse: { height: 40, padLeft: 8, padRight: 16, gap: 8, coin: 24, coinRim: 4, countSize: 19 },
  page: { pad: 12, gap: 8 },
  eyebrow: { size: 11, tracking: 0.06 },
  legendGem: { width: 12, height: 15, gap: 4 },
  card: {
    height: 152,
    radius: 18,
    pad: 8,
    gap: 4,
    gridGap: 12,
    stage: { height: 66, radius: 14, sea: 18, seaCrest: 3, shipBottom: 10 },
    nameSize: 14,
    gem: { width: 9, height: 12, gap: 2 },
    action: { height: 30, coin: 18, priceSize: 16, checkSize: 18, tagSize: 11 },
    meter: { height: 12, gap: 2, dot: 12, needSize: 11 },
  },
  note: { pad: 12, radius: 14, tile: 26, tileRadius: 8, size: 13 },
  empty: {
    scene: 186,
    sea: { height: 56, crest: 5 },
    plank: { bottom: 44, height: 16, underside: 4 },
    post: { width: 14, height: 26, bottom: 20, left: 26, right: 52 },
    master: { width: 34, height: 54, left: 150, bottom: 60 },
    bubble: { left: 194, bottom: 88, padX: 12, padY: 8, radius: 14, size: 16 },
    body: { padTop: 16, padX: 12, padBottom: 12, gap: 12 },
    titleSize: 24,
    subSize: 13,
    button: { height: 96, radius: 18, gap: 12, glyphSize: 30, labelSize: 19, rateSize: 11 },
    peek: { radius: 18, pad: 12, gap: 8, cellRadius: 14, hull: { width: 44, height: 12 }, sail: { width: 30, height: 14 }, gem: { width: 8, height: 10 } },
  },
  sheet: {
    radius: 22,
    pad: 16,
    handle: { width: 44, height: 5 },
    mini: { width: 76, height: 60, radius: 14, sea: 14 },
    titleSize: 24,
    subSize: 13,
    gem: { width: 14, height: 18, gap: 2 },
    card: { pad: 12, radius: 18, shadow: 3 },
    coin: 22,
    balanceSize: 24,
    ofSize: 19,
    meter: { height: 22, gap: 3, labelSize: 11 },
    hint: { tile: 26, tileRadius: 8, size: 13 },
    button: { height: MIN_TAP_TARGET, radius: 18, gap: 12, primarySize: 20, secondarySize: 17 },
  },
  confirm: {
    inset: 14,
    top: 96,
    radius: 22,
    pad: 16,
    titleSize: 24,
    stage: { height: 104, radius: 18, sea: 26, seaCrest: 4, shipBottom: 16 },
    sum: { padX: 12, padY: 16, radius: 18, gap: 8, coin: 26, size: 32 },
    keepSize: 11,
    /** The board's 56 is under the tap floor; both buttons sit at it. */
    button: { height: MIN_TAP_TARGET, radius: 18, buySize: 21, notNowSize: 17 },
  },
  bought: {
    ground: '#14283C',
    burst: 240,
    star: { size: 56, top: 112 },
    card: { width: 226, pad: 16, radius: 22, shadow: 6, gap: 8 },
    stage: { width: 170, height: 80, radius: 14, sea: 20, seaCrest: 3, shipBottom: 12 },
    nameSize: 21,
    check: 18,
    tagSize: 11,
    purse: { coin: 24, countSize: 26, leftSize: 11 },
    button: { height: MIN_TAP_TARGET, padX: 32, radius: 18, size: 20 },
  },
} as const;

/**
 * The board's mini-ship boxes are wider than they are tall in a way our `Ship` is not.
 *
 * The board draws its shelf preview at 90×56 — a 1.61 aspect — while `Ship.tsx` is the real duel
 * rig on a 150×124 grid, 1.21. Matching the board's *width* would make the ship 74pt tall in a 66pt
 * stage, which grows every card past the measured 152 and pushes the footer note off a 640pt
 * screen. Matching its *height* keeps the card, the stage and the waterline exactly where the board
 * puts them, and the ship simply reads a little narrower than the board's simplified rig.
 *
 * So: the ship is sized by the height it is allowed to occupy, never by the width of its box.
 */
export function harborShipWidth(stageHeight: number, bottomOffset: number): number {
  return ((stageHeight - bottomOffset) * 150) / 124;
}
