/**
 * Deck crew — the crew document a rival sailor is built from (A-068).
 *
 * Source of truth: `Cannon Academy Rival Fleet.dc.html` (Claude Design project 88888c12…),
 * section 3c — three reference figures (Bosun, Gunner, Powder monkey) on a rival deck, plus two
 * red-card rules that are law here:
 *
 *   - **Never a skull on a crew face.** The flag emblem reads as "pirate"; on a face it is a
 *     corpse. So the accessory enum below simply has no skull member — a skull face is
 *     unrepresentable by construction, not banned by review.
 *   - **Never more than two accessories.** "A third turns the silhouette to mush at this size,
 *     which is the lesson the shoulder parrot taught." The sets below are the board's own three
 *     kits, every one of them ≤ 2, and the document's tuple type cannot even spell a third.
 *
 * The derivation is PURE and keyed off the fleet variant, never off the duel: `crewFor(variantId)`
 * hashes the `gen_ship_*` id (the receipts' own FNV-1a, the same idiom `rivalVariantFor` uses), so
 * the same catalog ship always sails with the same sailor, and two duels that deal the same ship
 * show the same face. `rivalCrewFor` is the composed read the duel stage consumes.
 */
import type { IslandId } from '@content/schemas';

import { hashReceiptKey } from '../services/chestSettlement';
import { rivalVariantFor } from '../services/rivalVariant';

import { color } from './tokens';

// --- The board 3c palette ------------------------------------------------------------------------

/**
 * Board 3c, Bosun coat. This hex is already the app's inline board red (Captain.tsx bandana knot,
 * Hud.tsx low-hull tone) but has no token name; named here because the crew coat pool must be
 * closed, citable data. (tokens.ts is A-067's scope, not this ticket's — same pattern as
 * `enemyPresentation.ts` carrying its board palettes.)
 */
export const CREW_COAT_RED = '#B02418';
/** Board 3c, Gunner skin — the middle of the three board skin tones. New hex, board-cited. */
export const CREW_SKIN_TAN = '#B5794A';
/** Board 3c, Powder monkey skin — the fairest of the three board skin tones. New hex, board-cited. */
export const CREW_SKIN_FAIR = '#F2D0AE';

/**
 * The crew coat pool — board 3c's three coats, verbatim: `#B02418`, `#1E7F41`, `#1E5A8A`. The
 * second and third already have token names (`successDeep`, `captainCoat` — the default of the
 * four captain swatches, which is the "existing swatches where reused" overlap), so they are
 * referenced, not re-declared.
 */
export const CREW_COATS: readonly string[] = [CREW_COAT_RED, color.successDeep, color.captainCoat];

/** The three board skin tones. `captainSkin` is the Bosun's — the captain's own `#E8B98A`. */
export const CREW_SKINS: readonly string[] = [color.captainSkin, CREW_SKIN_TAN, CREW_SKIN_FAIR];

/** The three hat-bar looks the board figures wear, as KINDS — the renderer resolves the paint. */
export const CREW_HAT_KINDS = ['ink', 'violet', 'bandana'] as const;
export type CrewHatKind = (typeof CREW_HAT_KINDS)[number];

/**
 * Hat kind → fill. Board 3c bars, in figure order: Bosun `#14283C` (ink), Gunner `#6C4BD6` (the
 * fleet's pirate sail violet), Powder monkey `#D93A2E`. That last one is the bandana red the
 * player captain's own Bandana wears — a HAT colour, not a sail: the banned red-and-white STRIPE
 * is a sail channel (`sailStripe` on `ShipCosmetics`), and no crew document can reach a sail.
 */
export const CREW_HAT_FILLS: Readonly<Record<CrewHatKind, string>> = {
  ink: color.inkDark,
  violet: color.fleetPirateSail,
  bandana: color.sailStripe,
};

// --- Accessories — drawn ON existing shapes, never added as new ones -----------------------------

/**
 * The closed accessory enum. Eyepatch = one band across the head circle (+ the enlarged dark
 * eye), hook = the grey J replacing a hand dot, beard = the rounded block under the face,
 * earring = the 4px gold dot on the head's edge. There is no skull member and never will be.
 */
export const CREW_ACCESSORY_KINDS = ['eyepatch', 'hook', 'beard', 'earring'] as const;
export type CrewAccessory = (typeof CREW_ACCESSORY_KINDS)[number];

/** Two is the cap — board 3c red card. The tuple type below cannot represent a third. */
export const MAX_CREW_ACCESSORIES = 2;

export type CrewAccessories =
  | readonly []
  | readonly [CrewAccessory]
  | readonly [CrewAccessory, CrewAccessory];

/**
 * The board's own three kits, verbatim from the reference figures: Bosun (eyepatch + hook),
 * Gunner (beard + earring — "hook and eyepatch deliberately withheld, two is the cap"), Powder
 * monkey (earring only — "the youngest crew member reads as young because he carries the least").
 */
const ACCESSORY_SETS: readonly CrewAccessories[] = [
  ['eyepatch', 'hook'],
  ['beard', 'earring'],
  ['earring'],
];

// --- The document and its derivation --------------------------------------------------------------

export interface CrewDocument {
  /** One of `CREW_COATS` — board 3c's coat pool, nothing else. */
  readonly coat: string;
  /** One of `CREW_SKINS` — the three board skin tones. */
  readonly skin: string;
  /** Which hat bar the figure wears. Paint resolves through `CREW_HAT_FILLS`. */
  readonly hat: CrewHatKind;
  /** At most two, by type and by data. */
  readonly accessories: CrewAccessories;
}

/** Deterministic pool pick — FNV-1a of a salted key, modulo the pool. Every entry is reachable. */
function deal<T>(pool: readonly T[], key: string): T {
  return pool[hashReceiptKey(key) % pool.length] as T;
}

/**
 * The one sailor a fleet variant ships with. **Pure and deterministic per variant id** — the
 * channels hash independently (distinct salts over the same id), so the nineteen dealable ships
 * spread across the full coat × skin × hat × kit space while any one ship's sailor never changes.
 *
 * Keyed off the VARIANT id (`gen_ship_*`), never the duel id: the sailor belongs to the ship, so
 * every duel that deals Bone Biscuit meets Bone Biscuit's own bosun.
 */
export function crewFor(variantId: string): CrewDocument {
  return {
    coat: deal(CREW_COATS, `crew-coat:${variantId}`),
    skin: deal(CREW_SKINS, `crew-skin:${variantId}`),
    hat: deal(CREW_HAT_KINDS, `crew-hat:${variantId}`),
    accessories: deal(ACCESSORY_SETS, `crew-kit:${variantId}`),
  };
}

/**
 * The duel stage's read: the sailor standing on THIS duel's rival deck.
 *
 * Deals the variant through `rivalVariantFor(islandId, duelId)` (A-067's service — the same deal
 * settlement records into `metRivals`), then derives the crew from the variant's own id. Returns
 * `null` exactly when the variant carries no cosmetics — the frozen kraken-has-no-cosmetics pin:
 * a kraken has no deck, so it fields no sailor.
 */
export function rivalCrewFor(islandId: IslandId, duelId: string): CrewDocument | null {
  const variant = rivalVariantFor(islandId, duelId);
  if (variant.cosmetics === null) return null;
  return crewFor(variant.shipId);
}
