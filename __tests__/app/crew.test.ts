/**
 * A-068 — deck crew: a sailor on every rival deck, built from nine shapes.
 *
 * Board: `Cannon Academy Rival Fleet.dc.html` section 3c (project 88888c12…) — three reference
 * figures with exact recipes, and two red-card rules held here as law: no skull on a crew face,
 * and never more than two accessories.
 *
 * The model half runs REAL code in node: `crewFor` / `rivalCrewFor` are pure, so determinism,
 * the accessory cap, the closed palette and the kraken exception are all executed, not grepped.
 * The mount half is enforced on source text — the same pattern A-031/A-045 use, because React
 * Native's Flow-typed entry point cannot load duel components in this runner — and `Ship.tsx`
 * stays byte-identical, pinned by MD5 exactly as `generated-fleet.test.ts` pins it.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getEnemyForIsland } from '@content/index';
import { ISLAND_IDS, type IslandId } from '@content/schemas';

import { generatedFleet, isMysteryShip } from '../../src/content/generatedFleet';
import { rivalVariantFor } from '../../src/services/rivalVariant';
import {
  CREW_ACCESSORY_KINDS,
  CREW_COATS,
  CREW_COAT_RED,
  CREW_HAT_FILLS,
  CREW_HAT_KINDS,
  CREW_SKINS,
  CREW_SKIN_FAIR,
  CREW_SKIN_TAN,
  MAX_CREW_ACCESSORIES,
  crewFor,
  rivalCrewFor,
} from '../../src/theme/crewPresentation';

const REPO_ROOT = join(import.meta.dirname, '../..');
const SEA_STAGE_PATH = 'src/components/duel/SeaStage.tsx';
const PIRATE_PATH = 'src/components/duel/GeneratedPirate.tsx';
const CREW_MODULE_PATH = 'src/theme/crewPresentation.ts';
const SHIP_PATH = 'src/components/duel/Ship.tsx';

/**
 * `Ship.tsx` exactly as A-064 froze it and A-067 left it — the same hash
 * `generated-fleet.test.ts` pins. A-068's sailor mounts through `SeaStage`'s composition layer,
 * so if this fails, the fix is reverting the `Ship.tsx` edit, not this hash.
 */
const SHIP_TSX_MD5 = 'ab4cd96a826db8a0d3fbba1b7f0f5f34';

const readRepo = (relativePath: string): string =>
  readFileSync(join(REPO_ROOT, relativePath), 'utf8');

/** Every catalog ship a duel can actually deal — the `???` mystery row never sails. */
const dealableIds = generatedFleet.filter((doc) => !isMysteryShip(doc)).map((doc) => doc.id);

/** Enough duel ids that, with ≤5 ships per island pool, same-ship collisions are guaranteed. */
const duelIds = Array.from({ length: 120 }, (_, i) => `duel-${i.toString(36)}`);

const KRAKEN_ISLANDS = ISLAND_IDS.filter(
  (id) => getEnemyForIsland(id).presentationKind === 'kraken',
);
const CREWED_ISLANDS = ISLAND_IDS.filter(
  (id) => getEnemyForIsland(id).presentationKind !== 'kraken',
);

describe('A-068 AC-1 — the crew document: pure, capped, and skull-proof', () => {
  it('spec(A-068:AC-1) crewFor is deterministic per variant id, with every channel from its pool', () => {
    for (const id of dealableIds) {
      const crew = crewFor(id);
      expect(crewFor(id), `${id} dealt two different sailors`).toEqual(crew);
      expect(CREW_COATS, `${id}: coat off the board palette`).toContain(crew.coat);
      expect(CREW_SKINS, `${id}: skin off the board palette`).toContain(crew.skin);
      expect(CREW_HAT_KINDS, `${id}: unknown hat kind`).toContain(crew.hat);
    }
  });

  it('spec(A-068:AC-1) accessories never exceed two — on catalog ids and two hundred fuzzed ids', () => {
    expect(MAX_CREW_ACCESSORIES).toBe(2);
    for (const id of [...dealableIds, ...duelIds]) {
      const { accessories } = crewFor(id);
      expect(accessories.length, `${id} carries ${accessories.length} accessories`).toBeLessThanOrEqual(
        MAX_CREW_ACCESSORIES,
      );
      expect(new Set(accessories).size, `${id} wears one accessory twice`).toBe(accessories.length);
      for (const accessory of accessories) {
        expect(CREW_ACCESSORY_KINDS).toContain(accessory);
      }
    }
  });

  it('spec(A-068:AC-1) a skull face is unrepresentable by construction', () => {
    // The accessory enum is closed — there is no member a skull could ride in on.
    expect([...CREW_ACCESSORY_KINDS]).toEqual(['eyepatch', 'hook', 'beard', 'earring']);
    for (const id of [...dealableIds, ...duelIds]) {
      expect(JSON.stringify(crewFor(id))).not.toMatch(/skull/i);
    }
    // And the renderer composes shapes — it never blits a raster and never borrows the ship's
    // skull-sail geometry, so no code path can put the pack's skeleton art on a face.
    const pirate = readRepo(PIRATE_PATH);
    expect(pirate).not.toMatch(/SkullSails|sprite\.|<Image/);
  });

  it('spec(A-068:AC-1) coats, skins and hat fills are board 3c hexes, verbatim', () => {
    expect(CREW_COAT_RED).toBe('#B02418');
    expect(CREW_SKIN_TAN).toBe('#B5794A');
    expect(CREW_SKIN_FAIR).toBe('#F2D0AE');
    expect([...CREW_COATS]).toEqual(['#B02418', '#1E7F41', '#1E5A8A']);
    expect([...CREW_SKINS]).toEqual(['#E8B98A', '#B5794A', '#F2D0AE']);
    expect(CREW_HAT_FILLS).toEqual({ ink: '#14283C', violet: '#6C4BD6', bandana: '#D93A2E' });
  });

  it('spec(A-068:AC-1) GeneratedPirate keeps the captain body plan, accessories drawn on existing shapes', () => {
    const pirate = readRepo(PIRATE_PATH);

    // The nine-shape body plan, by part — same mechanical presence check as sprites.test.ts.
    for (const part of ['boot', 'torso', 'sleeve', 'hand', 'head', 'hat', 'eyepatch', 'hook', 'beard', 'earring']) {
      expect(pirate, `${part} is missing from the composed sailor`).toMatch(new RegExp(part, 'i'));
    }

    // The board's own 34×54 grid.
    expect(pirate).toMatch(/px\(34\)/);
    expect(pirate).toMatch(/px\(54\)/);

    // Accessories gate ON existing shapes: the hook stands in for a hand dot, the beard replaces
    // the mouth, the patch and earring ride the head circle.
    for (const accessory of CREW_ACCESSORY_KINDS) {
      expect(pirate, `${accessory} must be conditional on the document`).toMatch(
        new RegExp(`has\\('${accessory}'\\)`),
      );
    }
  });
});

describe("A-068 AC-2 — the sailor is the variant's, dealt by the duel", () => {
  it('spec(A-068:AC-2) determinism: duels dealing the same ship show the same sailor — the variant, never the raw duelId', () => {
    for (const islandId of CREWED_ISLANDS) {
      const byShip = new Map<string, string[]>();
      for (const duelId of duelIds) {
        const shipId = rivalVariantFor(islandId, duelId).shipId;
        byShip.set(shipId, [...(byShip.get(shipId) ?? []), duelId]);
      }

      // With ≤5 dealable ships per kind and 120 ids, every pool ship collides many times over.
      const collisions = [...byShip.values()].filter((ids) => ids.length >= 2);
      expect(collisions.length, `${islandId}: no same-ship deals to compare`).toBeGreaterThan(0);

      for (const [shipId, ids] of byShip) {
        const expected = crewFor(shipId);
        for (const duelId of ids) {
          expect(
            rivalCrewFor(islandId, duelId),
            `${islandId}/${duelId}: sailor is not ${shipId}'s own`,
          ).toEqual(expected);
        }
      }
    }
  });

  it('spec(A-068:AC-2) a rematch of the same duelId shows the same sailor', () => {
    for (const islandId of CREWED_ISLANDS) {
      for (const duelId of duelIds.slice(0, 30)) {
        expect(rivalCrewFor(islandId, duelId)).toEqual(rivalCrewFor(islandId, duelId));
      }
    }
  });

  it("spec(A-068:AC-2) SeaStage mounts exactly one sailor on the rival deck, through A-067's real service", () => {
    const sea = readRepo(SEA_STAGE_PATH);
    const crewModule = readRepo(CREW_MODULE_PATH);

    // The real import chain: SeaStage → crewPresentation → services/rivalVariant. A stub in a
    // test may fake the service; the shipped wiring may not.
    expect(crewModule).toContain("from '../services/rivalVariant'");
    expect(crewModule).toContain('rivalVariantFor(islandId, duelId)');
    expect(crewModule).toContain('crewFor(variant.shipId)');
    expect(sea).toContain("from '../../theme/crewPresentation'");
    expect(sea).toContain('rivalCrewFor(islandId, duelId ?? islandId)');

    // Exactly one sailor, and he stands in the rival slot — after the rival ship, never on the
    // player's deck (whose captain mount is unchanged).
    const mounts = sea.match(/<GeneratedPirate/g) ?? [];
    expect(mounts).toHaveLength(1);
    expect(sea.indexOf('<GeneratedPirate')).toBeGreaterThan(sea.indexOf('s.rivalSlot'));
    expect(sea).toContain('captainPose={captainPose}');
  });

  it('spec(A-068:AC-3) Ship.tsx is byte-identical — the sailor never touched it', () => {
    const bytes = readFileSync(join(REPO_ROOT, SHIP_PATH));
    expect(createHash('md5').update(bytes).digest('hex')).toBe(SHIP_TSX_MD5);
    expect(bytes.toString('utf8')).not.toMatch(/GeneratedPirate|crewPresentation/);
  });
});

describe('A-068 AC-4 — the kind exceptions hold', () => {
  it('spec(A-068:AC-4) the kraken fields no sailor; every crewed kind fields exactly one', () => {
    expect(KRAKEN_ISLANDS.length).toBeGreaterThan(0);
    for (const islandId of KRAKEN_ISLANDS) {
      for (const duelId of duelIds.slice(0, 40)) {
        expect(rivalCrewFor(islandId, duelId), `${islandId} dealt a sailor with no deck`).toBeNull();
      }
    }
    for (const islandId of CREWED_ISLANDS) {
      expect(rivalCrewFor(islandId, 'duel-rematch'), `${islandId} sails crewless`).not.toBeNull();
    }
  });

  it("spec(A-068:AC-4) the ghost's sailor renders inside the ghost's opacity treatment", () => {
    const ghostIslands = ISLAND_IDS.filter(
      (id: IslandId) => getEnemyForIsland(id).presentationKind === 'ghost',
    );
    expect(ghostIslands.length).toBeGreaterThan(0);
    for (const islandId of ghostIslands) {
      expect(rivalCrewFor(islandId, 'duel-rematch')).not.toBeNull();
    }

    // The hull's wash is applied inside Ship, where a sibling cannot inherit it — so the sailor's
    // wrapper takes the ghost's own documented opacity, single-sourced from enemyPresentation.
    const sea = readRepo(SEA_STAGE_PATH);
    expect(sea).toContain('ghostOpacity ?? GHOST_HULL_OPACITY');
    expect(sea).toMatch(/kind === 'ghost'/);
  });
});
