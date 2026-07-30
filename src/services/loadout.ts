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
import { cannons, getCannon, getSkill } from '@content/index';
import type { Cannon, CannonId, GradeBand } from '@content/schemas';
import { maxGradeForBand } from '@engine/placement';
import { TRAY_CAPACITY } from '@engine/tuning';

import type { Captain } from '../stores/player';

export interface DeckSlot {
  readonly cannon: Cannon;
  readonly equipped: boolean;
  readonly isNew: boolean;
  /**
   * Whether this owned gun can actually sail — `asksInBand` at the captain's own band.
   *
   * `false` is the state a child can genuinely reach: a chest grants `nine_pounder` to a K-1
   * captain (`missingChestOnlyCannon` has no band check), so they OWN a gun whose questions the
   * duel will refuse to ask. The row still exists — the reward was earned and the deck is where
   * rewards live — but it may not take a slot, because the slot count is a promise about the duel
   * and the duel counts `inBandLoadout`.
   */
  readonly sails: boolean;
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

/**
 * Every owned cannon as a deck row, in catalog order. Optional draft marks the in-hand selection.
 *
 * Owned is the filter, and deliberately still is: an out-of-band gun is present with `sails: false`
 * rather than absent. Dropping the row is the easy fix and the wrong one — the child won that gun
 * from a chest, and a reward that vanishes from the one screen where rewards live reads as the game
 * taking it back. The chart keeps a locked island's name and glyph under fog for the same reason.
 */
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
      sails: asksInBand(cannon, captain.gradeBand),
    }));
}

/**
 * The selection the gun deck opens with: what the captain equipped, narrowed to what can sail.
 *
 * Three filters, in this order and for three different reasons:
 *
 *  - **catalog** — `getCannon` throws on an unknown id, and storage is untrusted (`persistence.ts`).
 *  - **owned** — a save naming a gun that was never earned would otherwise show a slot occupied and
 *    refuse the next tap as if the deck were full. `commitLoadout` still refuses `not-owned`; this
 *    keeps that refusal unreachable from the screen.
 *  - **band** — the ceiling. This is the one that makes the deck's slot count honest, because the
 *    duel builds its loadout with exactly this rule (`stores/duel.ts` `legacyConfig`), and a deck
 *    reporting three slots against a duel that arms two is the seam A-058 left behind.
 *
 * Order is the player's, untouched — `commitLoadout` persists what it is handed and only the duel
 * tray re-sorts (`trayCannons`). This removes; it never reorders and never substitutes.
 *
 * Because it narrows, opening and leaving the deck HEALS a save that carries an out-of-band gun:
 * the gun stays owned and keeps its row, and `equippedCannons` comes back agreeing with the duel.
 */
export function deckDraft(captain: Captain): readonly CannonId[] {
  const inCatalog = new Set(cannons.map((c) => c.id));
  const owned = new Set(captain.ownedCannons);
  return inBandLoadout(
    captain.equippedCannons.filter((id) => inCatalog.has(id) && owned.has(id)),
    captain.gradeBand,
  );
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

/**
 * Validate a loadout before writing it. Pure — a refusal leaves the captain untouched.
 *
 * **Ownership, capacity and duplicates only — deliberately NOT the band.** The band ceiling belongs
 * to `deckDraft`, one layer up, so that an out-of-band gun never gets INTO a draft rather than being
 * rejected on the way out. Two reasons it must not move here:
 *
 *  1. This is the last gate a stale save passes through. `grade-band-duel.test.ts` builds captains
 *     that really do carry an over-grade gun in `equippedCannons` and asserts this function would
 *     have accepted them — that is what makes A-058's "the ceiling holds HOWEVER the gun got
 *     equipped" a statement about the duel rather than about this validator. Refusing here would
 *     make the duel's guarantee untestable through the real path.
 *  2. A refusal a child cannot act on is not a refusal. `refusalText` names the way out of every
 *     branch; there is no way out of "this gun is above your band" except growing older, so the
 *     deck says that on the card instead — see `CANNON_NOT_YET_MESSAGE`.
 */
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

// ── The curriculum ceiling, at the one place a duel's questions are chosen (A-058) ────────────
//
// A duel asks `getCannon(pick).skill`'s templates and nothing else — `selectCannon` in
// `src/engine/duel/reducer.ts` reads the skill straight off the gun the child tapped. So the set of
// questions a duel can produce IS the set of skills in its `playerLoadout`, and the band ceiling is
// enforceable in exactly one place: which cannons the duel is handed.
//
// It was NOT enforced there. The band gated only ACQUISITION — placement, range unlocks, the rival's
// loadout — and every one of those had to remember. One forgot: a rare chest grants the first
// chest-only cannon the captain does not own (`chestSettlement.missingChestOnlyCannon`), which is
// `nine_pounder`, whose skill `place_value_compare` is `minGrade: 2`. A K-1 captain who won one duel
// could put it on the deck (`commitLoadout` refuses only what is not OWNED) and be asked
// "How many tens are in 807?" — verified by driving the real path, not by reading it.
//
// Gating here rather than at each grant site is the point: a grant path added tomorrow inherits the
// ceiling without knowing it exists.

/**
 * Whether the questions this cannon fires are inside `band`'s ceiling.
 *
 * Measured on the SKILL's `minGrade`, not the cannon's, because the skill is what decides the maths
 * on the screen — `cannon.minGrade` is an acquisition property and the two are free to diverge in a
 * later catalog edit. They agree across the catalog today, and `grade-band-duel.test.ts` pins that
 * the acquisition gate is never looser than this one so the divergence cannot arrive unnoticed.
 *
 * A missing or corrupt band fails CLOSED — no band, no guns — rather than defaulting to a ceiling.
 * `engine/mastery.ts:121` reads an absent band as `POSITIVE_INFINITY`, which is safe there only
 * because a skill has to be mastered before it can unlock anything; the same reading here would hand
 * a bandless captain the whole catalog, division included.
 */
export function asksInBand(cannon: Cannon, band: GradeBand | null): boolean {
  if (band === null) return false;
  return getSkill(cannon.skill).minGrade <= maxGradeForBand(band);
}

/**
 * The subset of a loadout whose questions this band may be asked, order preserved.
 *
 * Order matters and is deliberately untouched: the duel tray renders in catalog order and the
 * persisted loadout keeps the player's own, so this filter must never be the thing that reorders
 * either. It also never REPLACES a gun with a substitute — a captain holding nothing in band gets an
 * empty list, and the caller decides what that means.
 */
export function inBandLoadout(
  ids: readonly CannonId[],
  band: GradeBand | null,
): readonly CannonId[] {
  return ids.filter((id) => asksInBand(getCannon(id), band));
}
