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
import { DEFAULT_FLAG_ID, flagById } from './flags';
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
 * The six layers a flag never touches. Kept here rather than spread from `PLAYER_SHIP` so that
 * this module stays free of a runtime import of `Ship.tsx` (and therefore of `react-native`).
 */
const HULL_AND_RIGGING = {
  hull: color.woodLight,
  hullDeep: color.woodDeep,
  sail: color.parchment,
  trim: color.amber,
  mast: color.wood,
  deck: color.deck,
} as const;

/**
 * A complete, renderable cosmetics set for any captain — including one who has not chosen yet.
 *
 * Resolved from the stored id on every read rather than from a stored colour: that is what lets the
 * palette be retuned without rewriting every persisted captain. Storage is untrusted input (see
 * `persistence.ts`), so an id from a build that renamed the flags resolves to the default rather
 * than to a broken screen.
 */
export function shipCosmeticsForCaptain(captain: Captain): ShipCosmetics {
  const flag = flagById(captain.flag);
  return {
    ...HULL_AND_RIGGING,
    pennant: flag?.color ?? DEFAULT_PENNANT,
    pennantFlagId: flag?.id ?? DEFAULT_FLAG_ID,
  };
}
