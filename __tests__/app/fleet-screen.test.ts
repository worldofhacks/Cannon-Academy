/**
 * A-067 — the fleet shelf's behaviour, and rivals met the honest way.
 *
 * Three surfaces under test:
 *
 *   1. `fleetShelfModel` (`src/services/rivalVariant.ts`) — the PURE met/unmet projection the
 *      shelf screen renders. RN components have no node harness (posture.md), so the screen's
 *      behavioural logic lives in this function and the specs drive it directly; `app/fleet.tsx`
 *      is then held to consuming it (and to the board's static, never-colour-only rules) on
 *      source text, the same split every other screen suite uses.
 *   2. `rivalVariantFor` — deterministic, kind-honest variant dealing (AC-3).
 *   3. `settleDuelRewards`'s met-union — win or lose marks met, inside the receipted commit,
 *      exactly once per duel however many times settlement replays (AC-3).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { getEnemyForIsland } from '@content/index';
import { ISLAND_IDS } from '@content/schemas';

import {
  FLEET_KIND_LABELS,
  FLEET_KINDS,
  generatedFleet,
  isMysteryShip,
} from '../../src/content/generatedFleet';
import { canonicalDuelSeed, settleDuelRewards } from '../../src/services/rewardSettlement';
import { fleetShelfModel, rivalVariantFor } from '../../src/services/rivalVariant';
import { createCaptainStore, type CaptainStore } from '../../src/stores/player';

const REPO_ROOT = join(import.meta.dirname, '../..');
const FLEET_SCREEN_PATH = 'app/fleet.tsx';

function screenSource(): string {
  return readFileSync(join(REPO_ROOT, FLEET_SCREEN_PATH), 'utf8');
}

/** A spread of well-formed duel ids — enough draws that every pool residue is certainly hit. */
const SAMPLE_DUEL_IDS: readonly string[] = Array.from({ length: 96 }, (_, i) => `duel-${i.toString(36)}`);

describe('A-067 AC-2 — the shelf projection is pure and honest', () => {
  it('spec(A-067:AC-2) the MET count equals metRivals ∩ catalog — unknown ids and duplicates cannot inflate it', () => {
    const empty = fleetShelfModel([]);
    expect(empty.total).toBe(20);
    expect(empty.metCount).toBe(0);
    expect(empty.countLabel).toBe('0 OF 20 MET');
    expect(empty.cards.every((card) => !card.met)).toBe(true);

    const someIds = [generatedFleet[0]?.id, generatedFleet[7]?.id, generatedFleet[12]?.id] as string[];
    const ledger = [...someIds, 'gen_ship_never_shipped', 'not_even_a_ship', ...someIds];
    const some = fleetShelfModel(ledger);
    expect(some.metCount).toBe(3);
    expect(some.countLabel).toBe('3 OF 20 MET');
    for (const card of some.cards) {
      expect(card.met).toBe(someIds.includes(card.id));
    }

    const all = fleetShelfModel(generatedFleet.map((doc) => doc.id));
    expect(all.metCount).toBe(20);
    expect(all.countLabel).toBe('20 OF 20 MET');
  });

  it('spec(A-067:AC-2) cards come in roster order, one per catalog ship, carrying name and kind', () => {
    const model = fleetShelfModel([]);
    expect(model.cards.map((card) => card.id)).toEqual(generatedFleet.map((doc) => doc.id));
    expect(model.cards.map((card) => card.displayName)).toEqual(generatedFleet.map((doc) => doc.displayName));
    expect(model.cards.map((card) => card.kind)).toEqual(generatedFleet.map((doc) => doc.kind));
  });

  it('spec(A-067:AC-2) the legend is five kinds as WORDS — never colour-only', () => {
    const { legend } = fleetShelfModel([]);
    expect(legend.map((entry) => entry.kind)).toEqual([...FLEET_KINDS]);
    for (const entry of legend) {
      expect(entry.label, `${entry.kind} legend entry has no word`).toMatch(/^[A-Z]+$/);
      expect(entry.label).toBe(FLEET_KIND_LABELS[entry.kind]);
    }
    expect(new Set(legend.map((entry) => entry.label)).size).toBe(FLEET_KINDS.length);
  });

  it('spec(A-067:AC-2) the screen consumes the pure model and renders both card states per board 3a', () => {
    // Same harness split as every screen suite: behaviour above is executed for real; the RN
    // component is held to consuming it on source text.
    const source = screenSource();
    expect(source).toMatch(/from '\.\.\/src\/services\/rivalVariant'/);
    expect(source).toMatch(/fleetShelfModel\(/);

    // Met cards render the real ship; unmet cards render the mystery state — silhouette, cream
    // “?” disc, "Not met yet" — and NO kind badge reaches the unmet branch: the badge renders
    // exclusively inside the `card.met` arm of the ternary.
    expect(source).toMatch(/<GeneratedShip /);
    expect(source).toContain("'Not met yet'");
    expect(source).toContain("{'?'}");
    // The card footer is one ternary on `card.met`; the badge lives in its met arm ONLY. The
    // else arm — from the footer's `) : (` to its closing `)}` — carries the "Not met yet" line
    // and nothing badge-shaped, so no low-contrast badge ink can reach the sunk ground.
    const footerStart = source.indexOf('card.met ? (');
    expect(footerStart).toBeGreaterThan(-1);
    const elseStart = source.lastIndexOf(') : (');
    expect(elseStart).toBeGreaterThan(footerStart);
    const metArm = source.slice(footerStart, elseStart);
    expect(metArm).toMatch(/s\.badge/);
    const unmetArm = source.slice(elseStart, source.indexOf(')}', elseStart));
    expect(unmetArm).toContain("'Not met yet'");
    expect(unmetArm).not.toMatch(/badge/i);

    // The legend renders the word beside the swatch, from the model's own entries.
    expect(source).toMatch(/\{entry\.label\}/);

    // Header is the Rank screen's pattern: its board constants, the 64pt back tile, a pop back.
    expect(source).toMatch(/RANK_BOARD/);
    expect(source).toMatch(/width: MIN_TAP_TARGET, height: MIN_TAP_TARGET/);
    expect(source).toMatch(/router\.back\(\)/);
  });

  it('spec(A-067:AC-2) nothing on the shelf animates — twenty looping cards would be the most expensive screen in the app', () => {
    const source = screenSource();
    expect(source).not.toMatch(/\bAnimated\b/);
    expect(source).not.toMatch(/reanimated/);
    expect(source).not.toMatch(/motion\.loop/);
    expect(source).not.toMatch(/requestAnimationFrame|setInterval/);
  });
});

describe('A-067 AC-3 — variant dealing is deterministic and kind-honest', () => {
  it('spec(A-067:AC-3) the same duelId always yields the same variant', () => {
    for (const islandId of ISLAND_IDS) {
      for (const duelId of SAMPLE_DUEL_IDS.slice(0, 12)) {
        const first = rivalVariantFor(islandId, duelId);
        const again = rivalVariantFor(islandId, duelId);
        expect(again.shipId).toBe(first.shipId);
        expect(again).toEqual(first);
      }
    }
  });

  it("spec(A-067:AC-3) every variant a duel can pick has the island's kind, and kraken picks carry no cosmetics", () => {
    for (const islandId of ISLAND_IDS) {
      const islandKind = getEnemyForIsland(islandId).presentationKind;
      for (const duelId of SAMPLE_DUEL_IDS) {
        const variant = rivalVariantFor(islandId, duelId);
        expect(variant.kind, `${islandId} dealt a ${variant.kind}`).toBe(islandKind);
        expect(variant.doc.kind).toBe(islandKind);
        expect(generatedFleet.some((doc) => doc.id === variant.shipId)).toBe(true);
        expect(isMysteryShip(variant.doc), 'the ??? row was dealt').toBe(false);

        if (islandKind === 'kraken') {
          // Frozen pin honoured: kraken has no ship cosmetics — met is marked, nothing repaints.
          expect(variant.cosmetics).toBeNull();
        } else {
          expect(variant.cosmetics).not.toBeNull();
          expect(variant.cosmetics?.hull).toMatch(/^#/);
          expect(variant.cosmetics?.tattered).toBe(variant.doc.hull.strakes >= 3);
          // D-12: the overlay can never carry the player's stripe channel, even as undefined.
          expect(variant.cosmetics !== null && 'sailStripe' in variant.cosmetics).toBe(false);
        }
      }
    }
  });

  it('spec(A-067:AC-3) across the five islands every catalog ship except the ??? row is reachable', () => {
    const dealt = new Set<string>();
    for (const islandId of ISLAND_IDS) {
      for (const duelId of SAMPLE_DUEL_IDS) {
        dealt.add(rivalVariantFor(islandId, duelId).shipId);
      }
    }
    const reachable = generatedFleet.filter((doc) => !isMysteryShip(doc)).map((doc) => doc.id);
    expect([...dealt].sort()).toEqual([...reachable].sort());
  });
});

describe('A-067 AC-3 — settlement marks met, win or lose, exactly once', () => {
  let store: CaptainStore;

  beforeEach(() => {
    store = createCaptainStore();
    store.getState().setGradeBand('k_1');
  });

  const settle = (duelId: string, won: boolean) =>
    settleDuelRewards(store, {
      duelId,
      seed: canonicalDuelSeed(duelId),
      won,
      purseCoins: won ? 10 : 0,
      skillTally: {},
    });

  it('spec(A-067:AC-3) a won duel unions exactly the dealt variant id, and replay marks nothing twice', () => {
    const islandId = store.getState().captain.currentIsland;
    expect(islandId).not.toBeNull();
    if (islandId === null) return;
    const duelId = 'duel-2s';
    const expected = rivalVariantFor(islandId, duelId).shipId;

    const outcome = settle(duelId, true);
    expect(outcome.applied).toBe(true);
    expect(store.getState().captain.metRivals).toEqual([expected]);

    // Settlement replay of one duelId marks exactly one ship met exactly once: the receipt guard
    // returns before the union can run again, and the union itself refuses duplicates.
    const replay = settle(duelId, true);
    expect(replay.applied).toBe(false);
    expect(store.getState().captain.metRivals).toEqual([expected]);
  });

  it('spec(A-067:AC-3) a LOST duel marks met too — fought is met — inside the same commit as its tallies', () => {
    const islandId = store.getState().captain.currentIsland;
    expect(islandId).not.toBeNull();
    if (islandId === null) return;
    const duelId = 'duel-3t';
    const expected = rivalVariantFor(islandId, duelId).shipId;

    const outcome = settle(duelId, false);
    expect(outcome.applied).toBe(true);
    expect(outcome.won).toBe(false);
    expect(store.getState().captain.metRivals).toEqual([expected]);

    // Defeat replay is a no-op through the defeat ledger — still exactly one entry.
    const replay = settle(duelId, false);
    expect(replay.applied).toBe(false);
    expect(store.getState().captain.metRivals).toEqual([expected]);
  });

  it('spec(A-067:AC-3) two different duels can meet two different ships, and re-meeting one adds nothing', () => {
    const islandId = store.getState().captain.currentIsland;
    expect(islandId).not.toBeNull();
    if (islandId === null) return;

    // Pick two duel ids deterministically dealt DIFFERENT ships, so the union is observable.
    const pool = SAMPLE_DUEL_IDS.map((id) => ({
      id,
      ship: rivalVariantFor(islandId, id).shipId,
    }));
    const first = pool[0] as (typeof pool)[number];
    const second = pool.find((candidate) => candidate.ship !== first.ship) as (typeof pool)[number];
    expect(second).toBeDefined();

    settle(first.id, true);
    settle(second.id, false);
    expect([...store.getState().captain.metRivals].sort()).toEqual([first.ship, second.ship].sort());

    // A third duel that deals a ship already met unions nothing new.
    const repeat = pool.find((candidate) => candidate.id !== first.id && candidate.ship === first.ship);
    if (repeat !== undefined) {
      settle(repeat.id, true);
      expect(store.getState().captain.metRivals).toHaveLength(2);
    }
  });
});
