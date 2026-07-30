/**
 * The captain's ship, in colours — A-006.
 *
 * Board 5b: the flag chosen at onboarding *becomes the ship's pennant*. This is the one function
 * that closes that promise, and it is pure TypeScript on purpose. `Ship.tsx` imports
 * `react-native`, whose Flow-typed entry point the node runner cannot parse, so a resolver living
 * inside the component would be untestable — the same constraint that shaped A-001/A-002/A-003,
 * with the same answer: put the decision in a pure module, test the decision, let the component be
 * a thin renderer.
 *
 * The type is imported from `Ship.tsx` rather than redeclared. `import type` is erased at compile
 * time, so this does not pull `react-native` into the module graph at runtime, and a seventh
 * cosmetic layer added to the ship becomes a type error here instead of a transparent sail.
 *
 * Only `pennant` follows the flag. `PLAYER_SHIP` stays the no-captain default in `Ship.tsx` and the
 * hull, sails, trim, mast and deck are spelled out below as the same wood-and-parchment read the
 * boards fix — a flag that repainted the hull would quietly break that.
 */
import type { ShipCosmetics } from '../components/duel/Ship';
import type { Captain } from '../stores/player';
import { flagById } from './flags';
import { skinOrDefault, type ShipSkin } from './shipSkins';
import { color } from './tokens';

/**
 * The pennant a captain flies when their flag is missing or unknown.
 *
 * Amber is board 5b's default and today's `PLAYER_SHIP.pennant`. `Ship.tsx` writes the pennant
 * straight into `backgroundColor`, where `undefined` is an invisible pennant on a real device and
 * nothing at all in a test — so this fallback is load-bearing, not defensive decoration.
 */
const DEFAULT_PENNANT: string = color.amber;

/**
 * The mast, which no skin and no flag repaints.
 *
 * Every other hull layer now comes from the equipped skin. The mast does not, because none of the
 * four board palettes names one — they specify hull, hullDeep, trim, deck, sail and pennant, and a
 * mast invented per skin would be a colour with no provenance.
 */
const RIGGING = {
  mast: color.wood,
  /** Board 7a's red vertical stripe. The player is the only ship that flies it, on any skin. */
  sailStripe: color.sailStripe,
} as const;

/**
 * A complete, renderable cosmetics set for any captain — including one who has not chosen yet.
 *
 * Resolved from stored IDs on every read rather than from stored colours: that is what lets the
 * palette be retuned without rewriting every persisted captain. Storage is untrusted input (see
 * `persistence.ts`), so an id from a build that renamed a flag or a skin resolves to the default
 * rather than to a broken screen.
 *
 * ## The flag beats the skin, on purpose
 *
 * Every skin carries its own `pennant`, and it is deliberately NOT used here. Board 5b makes the
 * onboarding flag the ship's pennant — it is the mark a child recognises as *theirs* on a moving
 * ship — and a cosmetic purchase must not overwrite the one thing they chose about themselves. The
 * skin's pennant exists for the Harbor shelf preview, where there is no captain and therefore no
 * flag to fly (A-052).
 */
export function shipCosmeticsForCaptain(captain: Captain): ShipCosmetics {
  const skin = skinOrDefault(captain.equippedSkin);
  return {
    ...RIGGING,
    hull: skin.hull,
    hullDeep: skin.hullDeep,
    sail: skin.sail,
    trim: skin.trim,
    deck: skin.deck,
    pennant: flagById(captain.flag)?.color ?? DEFAULT_PENNANT,
  };
}

/**
 * A skin rendered as a ship, for every preview: shelf card, confirm modal, reveal card.
 *
 * It flies the CAPTAIN'S flag, not the skin's own pennant — the designer's ruling, and a better
 * argument than the one it replaced:
 *
 * > "The version where only the shelf preview flies the skin's pennant makes the picture a promise
 * > the purchase then breaks — and for a non-reader the picture is the contract."
 *
 * My first pass flew `skin.pennant` here, reasoning that four cards would otherwise look alike. That
 * was wrong on the thing that matters: a five-year-old cannot read the name on the card, so the
 * picture IS the offer, and an offer that changes on delivery is a broken promise. The cards still
 * differ on hull, sheer stripe, deck and sails — four channels — and the pennant was never carrying
 * that load.
 *
 * `skin.pennant` is deliberately kept on the record even though nothing renders it: it is exactly
 * what a flag shelf would sell if flags ever become their own cheap tier (A-053).
 */
export function shipCosmeticsForSkin(skin: ShipSkin, captain: Captain): ShipCosmetics {
  return {
    ...RIGGING,
    hull: skin.hull,
    hullDeep: skin.hullDeep,
    sail: skin.sail,
    trim: skin.trim,
    deck: skin.deck,
    pennant: flagById(captain.flag)?.color ?? DEFAULT_PENNANT,
  };
}
