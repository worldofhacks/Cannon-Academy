/**
 * Harbor store — the shelf, and buying what is on it (A-055, superseding A-033).
 *
 * ## The chest is gone, by owner ruling
 *
 * A-033 sold one repeatable game chest. That shipped a contradiction: a purchased chest could grant
 * a **cannon** (`chestSettlement` grants one when a chest-only gun is missing), on a screen whose own
 * copy read *"Earn cannons by learning — not by buying them."* Coins bought capability.
 *
 * The designer's rule on the Harbor board is absolute:
 *
 * > "Never put a cannon, a timer bonus, or a hull upgrade on this shelf. The moment coins buy power,
 * > cut the screen."
 *
 * So the shelf now holds ship skins and nothing else — paint, with no engine meaning at all. Chests
 * remain, unchanged, as a **victory** reward through `settleDuelRewards`, which is where the one
 * chest-exclusive cannon is still earned. Nothing was orphaned by the removal.
 *
 * ## Why there are no receipts here
 *
 * A-033 needed the `purchase:<sequence>` receipt ledger because a chest's outcome was **random** — a
 * replay had to prove it had not rerolled. A skin purchase is deterministic: pay the price, get that
 * skin. So **ownership is the receipt.** A second tap finds the skin already owned and returns
 * without debiting, which is idempotence by construction rather than by bookkeeping, and it cannot
 * drift out of step with a ledger because there is no ledger.
 */
import { COINS_WIN_BASE } from '@engine/tuning';

import type { Captain, CaptainStore } from '../stores/player';
import { purchasableSkins, skinById, type ShipSkin } from '../theme/shipSkins';

/** A shelf card: the skin, its price, and everything the card needs to render itself. */
export interface ShelfItem {
  readonly skin: ShipSkin;
  readonly owned: boolean;
  readonly equipped: boolean;
  /** Affordable right now. Never the ONLY affordability channel — the board uses three. */
  readonly affordable: boolean;
  /** Coins still needed, or 0 when affordable or owned. */
  readonly shortfall: number;
  /**
   * Whole duels the shortfall is worth, computed from the payout FLOOR.
   *
   * The designer was explicit about which way the error must lean:
   *
   * > "Duel payout is a range, so the estimate can be wrong in the direction that disappoints.
   * > Compute it from the floor of the payout range, never the average, so the child always arrives
   * > sooner than promised."
   *
   * `COINS_WIN_BASE` is that floor — a win with no accuracy bonus and no perfect shots.
   */
  readonly duelsAway: number;
}

export type SkinPurchase =
  | { readonly ok: true; readonly applied: boolean; readonly skin: ShipSkin }
  | { readonly ok: false; readonly reason: 'unknown-skin' }
  | {
      readonly ok: false;
      readonly reason: 'insufficient-coins';
      readonly shortfall: number;
      readonly duelsAway: number;
    };

/** Whole duels needed to close a gap, at the worst payout a win can produce. */
export function duelsToAfford(shortfall: number): number {
  if (shortfall <= 0) return 0;
  return Math.ceil(shortfall / COINS_WIN_BASE);
}

/** The captain's coin balance — the only currency the harbor accepts. */
export function harborCoinBalance(captain: Captain): number {
  return captain.coins;
}

/**
 * The shelf, in catalog order.
 *
 * The starter is excluded: it is owned from the first launch and was never for sale, so a card
 * offering it would be a shelf slot that can never do anything.
 */
export function harborShelf(captain: Captain): readonly ShelfItem[] {
  const owned = new Set(captain.ownedSkins);
  return purchasableSkins().map((skin) => {
    const isOwned = owned.has(skin.id);
    const shortfall = isOwned ? 0 : Math.max(0, skin.price - captain.coins);
    return {
      skin,
      owned: isOwned,
      equipped: captain.equippedSkin === skin.id,
      affordable: isOwned || captain.coins >= skin.price,
      shortfall,
      duelsAway: duelsToAfford(shortfall),
    };
  });
}

/**
 * Buy a skin, and wear it.
 *
 * Equipping on purchase is deliberate: the child just chose this ship and watched it appear, and
 * making them hunt for a second control to actually sail it would break the promise the reveal
 * makes. They can switch back whenever they like — every owned skin stays on the shelf.
 */
export function buySkin(store: CaptainStore, skinId: string): SkinPurchase {
  const skin = skinById(skinId);
  if (skin === undefined) return { ok: false, reason: 'unknown-skin' };

  const captain = store.getState().captain;

  // Ownership IS the receipt. A second tap is a no-op, not a second debit.
  if (captain.ownedSkins.includes(skin.id)) {
    if (captain.equippedSkin !== skin.id) {
      store.getState().replaceCaptain({ ...captain, equippedSkin: skin.id });
    }
    return { ok: true, applied: false, skin };
  }

  if (captain.coins < skin.price) {
    const shortfall = skin.price - captain.coins;
    return {
      ok: false,
      reason: 'insufficient-coins',
      shortfall,
      duelsAway: duelsToAfford(shortfall),
    };
  }

  store.getState().replaceCaptain({
    ...captain,
    coins: captain.coins - skin.price,
    ownedSkins: [...captain.ownedSkins, skin.id],
    equippedSkin: skin.id,
  });

  return { ok: true, applied: true, skin };
}

/** Wear a skin already owned. Refuses one that is not — the shelf is the only way to acquire. */
export function equipSkin(store: CaptainStore, skinId: string): boolean {
  const captain = store.getState().captain;
  if (!captain.ownedSkins.includes(skinId) || skinById(skinId) === undefined) return false;
  if (captain.equippedSkin === skinId) return true;
  store.getState().replaceCaptain({ ...captain, equippedSkin: skinId });
  return true;
}
