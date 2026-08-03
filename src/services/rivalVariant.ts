/**
 * Which fleet ship a duel's rival actually is — met the honest way (A-067).
 *
 * Two pure exports live here:
 *
 *   - `rivalVariantFor(islandId, duelId)` deterministically deals one catalog ship whose `kind`
 *     matches the island's `presentationKind` (A-031's island→kind mapping, read from the enemy
 *     catalog — never re-declared here). Seeded off the duelId, so a replayed duel deals the same
 *     ship every time and settlement can union its id without a coin flip.
 *   - `fleetShelfModel(metRivals)` projects the catalog against the captain's met ledger for the
 *     shelf screen (`app/fleet.tsx`), which keeps the screen's behaviour drivable by a node test.
 *
 * The variant is PRESENTATION data only: a paint overlay in the `enemyPresentation` layer's own
 * `ShipCosmetics` shape, plus the flag emblem. It carries no hull tuning, no damage, no engine
 * meaning — and it never disturbs the frozen enemy-presentation pins: the island→kind mapping is
 * consumed, not changed; the five shape channels stay where they are; ghost opacity stays
 * `enemyPresentation.ts`'s; and a kraken variant carries `cosmetics: null` (kraken-has-no-
 * cosmetics), so a kraken duel simply marks a kraken fleet entry met with no hull repaint.
 */
import { getEnemyForIsland } from '@content/index';
import type { EnemyPresentationKind, IslandId } from '@content/schemas';

import type { ShipCosmetics } from '../components/duel/Ship';
import {
  FLEET_KIND_LABELS,
  FLEET_KINDS,
  fleetKindPaint,
  generatedFleet,
  isMysteryShip,
  type FleetEmblem,
  type FleetKind,
  type GeneratedShip,
} from '../content/generatedFleet';

import { hashReceiptKey } from './chestSettlement';

/**
 * One dealt rival variant. **Stable contract — A-068 consumes this shape.**
 */
export interface RivalVariant {
  /** Catalog id (`gen_ship_*`) — the value settlement unions into `captain.metRivals`. */
  readonly shipId: string;
  /** The board roster name, for HUD copy that wants the ship rather than the faction. */
  readonly displayName: string;
  /** Always equal to the island's `presentationKind`. */
  readonly kind: FleetKind;
  /** The full validated document, for renderers that want the counts (strakes/ports/sails). */
  readonly doc: GeneratedShip;
  /**
   * enemyPresentation-layer paint overlay for the duel rival — the same `ShipCosmetics` shape
   * `RivalPresentation.cosmetics` carries, built from the kind's named fleet tokens. `null` on
   * kraken (the frozen kraken-has-no-cosmetics pin): the entry is marked met, nothing repaints.
   * Never carries `sailStripe` — the red vertical stripe stays the player's alone (D-12).
   */
  readonly cosmetics: ShipCosmetics | null;
  /** The variant's flag emblem, for the pennant channel. */
  readonly flagEmblem: FleetEmblem;
}

/** The dealable pool per kind: every catalog ship of that kind except the `???` mystery row. */
function dealablePool(kind: EnemyPresentationKind): readonly GeneratedShip[] {
  return generatedFleet.filter((doc) => doc.kind === kind && !isMysteryShip(doc));
}

function cosmeticsFor(doc: GeneratedShip): ShipCosmetics | null {
  if (doc.kind === 'kraken') return null;
  const paint = fleetKindPaint(doc.kind);
  return {
    hull: paint.hull,
    hullDeep: paint.hullDeep,
    sail: paint.sail,
    // Board `build()`: the first strake band paints in the kind's sail fill…
    trim: paint.sail,
    // …and the flag ground is the deep hull.
    pennant: paint.hullDeep,
    mast: paint.mast,
    deck: paint.hullDeep,
    // Tattered sails carry the difficulty, not colour (board 3b): third strake, notched hem.
    tattered: doc.hull.strakes >= 3,
  };
}

/**
 * Deterministically deal the duel's rival variant.
 *
 * Same `duelId` → same variant, always (the seed is a pure FNV-1a hash of the id — the receipts'
 * own hash — so a replayed or re-settled duel can never deal a different ship). Every ship the
 * pool holds is reachable, because the index is the hash modulo the pool.
 *
 * @param islandId the island the duel is fought at (`captain.currentIsland`, via duel context)
 * @param duelId   the duel's own id (`duel-<base36>`), hashed — never parsed — so any stable
 *                 string deals stably
 */
export function rivalVariantFor(islandId: IslandId, duelId: string): RivalVariant {
  const kind = getEnemyForIsland(islandId).presentationKind;
  const pool = dealablePool(kind);
  if (pool.length === 0) {
    // Unreachable with the shipped catalog (every kind holds ≥3 dealable ships); kept as a
    // throw so a future catalog edit fails a test instead of dealing `undefined`.
    throw new Error(`rivalVariantFor: no dealable fleet ship of kind '${kind}'`);
  }
  const doc = pool[hashReceiptKey(duelId) % pool.length] as GeneratedShip;
  return {
    shipId: doc.id,
    displayName: doc.displayName,
    kind: doc.kind,
    doc,
    cosmetics: cosmeticsFor(doc),
    flagEmblem: doc.emblem,
  };
}

// --- The shelf projection (board 3a) -------------------------------------------------------------

export interface FleetShelfCard {
  readonly id: string;
  readonly displayName: string;
  readonly kind: FleetKind;
  /** Met = the id is in `captain.metRivals`. Unmet renders the grey silhouette and the `?` disc. */
  readonly met: boolean;
}

export interface FleetShelfModel {
  readonly total: number;
  /** `|metRivals ∩ catalog|` — an unknown id in the ledger can never inflate the count. */
  readonly metCount: number;
  /** The board's count line, e.g. `17 OF 20 MET`. */
  readonly countLabel: string;
  /** The five kinds as colour-key WORDS — the legend is never colour-only. */
  readonly legend: readonly { readonly kind: FleetKind; readonly label: string }[];
  /** All twenty cards in roster order. */
  readonly cards: readonly FleetShelfCard[];
}

/** Pure met/unmet projection of the catalog for the shelf screen. */
export function fleetShelfModel(metRivals: readonly string[]): FleetShelfModel {
  const met = new Set(metRivals);
  const cards = generatedFleet.map((doc) => ({
    id: doc.id,
    displayName: doc.displayName,
    kind: doc.kind,
    met: met.has(doc.id),
  }));
  const metCount = cards.filter((card) => card.met).length;
  return {
    total: cards.length,
    metCount,
    countLabel: `${metCount} OF ${cards.length} MET`,
    legend: FLEET_KINDS.map((kind) => ({ kind, label: FLEET_KIND_LABELS[kind] })),
    cards,
  };
}
