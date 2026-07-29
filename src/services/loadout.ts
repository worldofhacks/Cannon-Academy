/**
 * Gun-deck loadout rules — which owned cannons sail, and how the tray renders them.
 *
 * A-011. The engine owns `TRAY_CAPACITY`; this module is the app-side selector the screen and the
 * duel both read. Nothing here writes to the captain — commit validation is pure, and the store's
 * `equipCannons` / `markCannonsSeen` are what persist a choice.
 *
 * Two orderings, on purpose (see `__tests__/app/gun-deck.test.ts`):
 *   - the **persisted loadout** keeps the player's chosen order
 *   - the **duel tray** always renders in catalog order
 */
import { cannons, getCannon } from '@content/index';
import type { Cannon, CannonId } from '@content/schemas';
import { TRAY_CAPACITY } from '@engine/tuning';

import type { Captain } from '../stores/player';

export interface DeckSlot {
  readonly cannon: Cannon;
  readonly equipped: boolean;
  readonly isNew: boolean;
}

export type SelectResult =
  | { readonly kind: 'selected'; readonly selection: readonly CannonId[] }
  | { readonly kind: 'deselected'; readonly selection: readonly CannonId[] }
  | { readonly kind: 'full'; readonly incoming: CannonId; readonly occupants: readonly CannonId[] };

export type CommitResult =
  | { readonly ok: true; readonly loadout: readonly CannonId[] }
  | {
      readonly ok: false;
      readonly refusal:
        | { readonly reason: 'empty' }
        | { readonly reason: 'not-owned'; readonly offending: CannonId }
        | { readonly reason: 'duplicate'; readonly offending: CannonId }
        | { readonly reason: 'over-capacity'; readonly count: number };
    };

/** Every owned cannon as a deck row, in catalog order. Optional draft marks the in-hand selection. */
export function deckSlots(captain: Captain, draft?: readonly CannonId[]): readonly DeckSlot[] {
  const equipped = new Set(draft ?? captain.equippedCannons);
  const seen = new Set(captain.seenCannons);
  const owned = new Set(captain.ownedCannons);
  return cannons
    .filter((c) => owned.has(c.id))
    .map((cannon) => ({
      cannon,
      equipped: equipped.has(cannon.id),
      isNew: !seen.has(cannon.id),
    }));
}

/**
 * Tap a cannon on the deck. Below capacity → add (or deselect if already in). At capacity → refuse
 * with the occupants that must be displaced — never silently drop a choice.
 */
export function selectCannon(selection: readonly CannonId[], incoming: CannonId): SelectResult {
  if (selection.includes(incoming)) {
    return { kind: 'deselected', selection: selection.filter((id) => id !== incoming) };
  }
  if (selection.length < TRAY_CAPACITY) {
    return { kind: 'selected', selection: [...selection, incoming] };
  }
  return { kind: 'full', incoming, occupants: [...selection] };
}

/** Swap `outgoing` for `incoming` in place — the tray does not reshuffle under a child's finger. */
export function displaceCannon(
  selection: readonly CannonId[],
  outgoing: CannonId,
  incoming: CannonId,
): readonly CannonId[] {
  return selection.map((id) => (id === outgoing ? incoming : id));
}

/** Validate a loadout before writing it. Pure — a refusal leaves the captain untouched. */
export function commitLoadout(captain: Captain, ids: readonly CannonId[]): CommitResult {
  if (ids.length === 0) {
    return { ok: false, refusal: { reason: 'empty' } };
  }
  if (ids.length > TRAY_CAPACITY) {
    return { ok: false, refusal: { reason: 'over-capacity', count: ids.length } };
  }
  const seen = new Set<CannonId>();
  for (const id of ids) {
    if (!captain.ownedCannons.includes(id)) {
      return { ok: false, refusal: { reason: 'not-owned', offending: id } };
    }
    if (seen.has(id)) {
      return { ok: false, refusal: { reason: 'duplicate', offending: id } };
    }
    seen.add(id);
  }
  return { ok: true, loadout: [...ids] };
}

/** The duel tray: exactly the equipped set, rendered in catalog order. */
export function trayCannons(captain: Captain): readonly Cannon[] {
  const equipped = new Set(captain.equippedCannons);
  return cannons.filter((c) => equipped.has(c.id)).map((c) => getCannon(c.id));
}
