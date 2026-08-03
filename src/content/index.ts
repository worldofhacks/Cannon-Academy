/**
 * The single module that reads bundled catalog JSON, validates every entry against its T-003
 * zod schema, and re-exports typed readonly arrays plus total lookup helpers.
 *
 * Validation happens at import time and throws — a malformed catalog must fail a test, never
 * reach a device (ARCHITECTURE.md §2, §4.4). No other module reads the catalog JSON directly;
 * this is the only one, and it is the only place that needs `resolveJsonModule`.
 */
import type { z } from 'zod';

import cannonsRaw from './cannons.json';
import crewRaw from './crew.json';
import enemiesRaw from './enemies.json';
import islandsRaw from './islands.json';
import ranksRaw from './ranks.json';
import {
  cannonSchema,
  crewSchema,
  enemySchema,
  GRADE_BANDS,
  islandSchema,
  rankSchema,
  skillSchema,
} from './schemas';
import type {
  Cannon,
  CannonId,
  Crew,
  Enemy,
  GradeBand,
  Island,
  IslandBandCurriculum,
  IslandId,
  Rank,
  Skill,
  SkillId,
} from './schemas';
import skillsRaw from './skills.json';

type CatalogName = 'skills' | 'cannons' | 'islands' | 'ranks' | 'crew' | 'enemies';

/**
 * The ratified `validateCatalogs` input shape: raw, unvalidated arrays keyed by catalog name.
 * Callers pass authored-but-unchecked data (e.g. a corrupted catalog in a test) here.
 */
interface RawCatalogs {
  skills: readonly unknown[];
  cannons: readonly unknown[];
  islands: readonly unknown[];
  ranks: readonly unknown[];
  crew: readonly unknown[];
  enemies: readonly unknown[];
}

/** Best-effort id extraction from an unvalidated entry, so a thrown message can name it. */
const entryId = (entry: unknown): string => {
  if (typeof entry === 'object' && entry !== null && 'id' in entry) {
    const id = (entry as { id: unknown }).id;
    if (typeof id === 'string') return id;
  }
  return '<unknown id>';
};

/**
 * Parses every entry of one catalog through its schema, throwing on the first invalid entry.
 * The thrown message names the catalog and the offending entry's id (AC-12).
 */
function parseCatalog<T>(name: CatalogName, schema: z.ZodType<T>, entries: readonly unknown[]): T[] {
  return entries.map((entry) => {
    const result = schema.safeParse(entry);
    if (!result.success) {
      throw new Error(
        `content/${name}.json: entry '${entryId(entry)}' failed validation — ${result.error.message}`,
      );
    }
    return result.data;
  });
}

function assertUniqueIds(catalog: CatalogName, entries: readonly { readonly id: string }[]): void {
  const seen = new Map<string, number>();
  for (const entry of entries) {
    const prior = seen.get(entry.id);
    if (prior !== undefined) {
      throw new Error(`content/${catalog}.json: duplicate id '${entry.id}' (entries collide across the set)`);
    }
    seen.set(entry.id, 1);
  }
}

function assertNoRankTierClash(ranks: readonly Rank[]): void {
  const byTier = new Map<number, string>();
  for (const rank of ranks) {
    const prior = byTier.get(rank.tier);
    if (prior !== undefined) {
      throw new Error(`content/ranks.json: duplicate tier ${rank.tier} on ranks '${prior}' and '${rank.id}'`);
    }
    byTier.set(rank.tier, rank.id);
  }
}

/** D-14: the highest skill `minGrade` a band's islands may carry — the band's Common-Core ceiling. */
const BAND_CEILING: Readonly<Record<GradeBand, number>> = { k_1: 1, g2_3: 3, g4_5: 5 };

/**
 * D-14's dual bound: every island must teach a band at least one skill NOT outgrown by that
 * band, i.e. one skill whose `maxGrade` reaches the band's floor grade — so a grade-5 captain is
 * never sent to an island of pure kindergarten review.
 */
const BAND_FLOOR: Readonly<Record<GradeBand, number>> = { k_1: 0, g2_3: 2, g4_5: 4 };

/**
 * The D-14 ceiling law over the per-band curriculum, enforced at import (below) and inside
 * `validateCatalogs`, so a bad authoring edit fails before it can reach a child:
 *
 *   1. Every curriculum skill exists, and no island may carry, for any band, a skill whose
 *      `minGrade` exceeds that band's ceiling (k_1→1, g2_3→3, g4_5→5).
 *   2. The not-outgrown dual: every band's every island teaches at least one skill with
 *      `maxGrade >=` the band's floor (0, 2, 4 respectively).
 *   3. Every `unlocksCannons` entry exists and fires a skill on that island-band's skill list.
 *
 * Every throw names the island, the band, and the offending skill or cannon.
 */
function assertCurriculumLawful(
  islands: readonly Island[],
  skills: readonly Skill[],
  cannons: readonly Cannon[],
): void {
  const skillById = new Map<SkillId, Skill>(skills.map((skill) => [skill.id, skill]));
  const cannonById = new Map<CannonId, Cannon>(cannons.map((cannon) => [cannon.id, cannon]));

  for (const island of islands) {
    for (const band of GRADE_BANDS) {
      const cell = island.curriculum[band];

      for (const skillId of cell.skills) {
        const skill = skillById.get(skillId);
        if (skill === undefined) {
          throw new Error(
            `content/islands.json: island '${island.id}' band '${band}' skills entry '${skillId}' is absent from skills`,
          );
        }
        if (skill.minGrade > BAND_CEILING[band]) {
          throw new Error(
            `content/islands.json: island '${island.id}' band '${band}' carries skill '${skillId}' ` +
              `(minGrade ${skill.minGrade}) above the band ceiling of grade ${BAND_CEILING[band]} (D-14)`,
          );
        }
      }

      const notOutgrown = cell.skills.some((skillId) => {
        const skill = skillById.get(skillId);
        return skill !== undefined && skill.maxGrade >= BAND_FLOOR[band];
      });
      if (!notOutgrown) {
        throw new Error(
          `content/islands.json: island '${island.id}' band '${band}' teaches only outgrown skills ` +
            `[${cell.skills.join(', ')}] — no skill reaches the band floor of grade ${BAND_FLOOR[band]} (D-14)`,
        );
      }

      for (const cannonId of cell.unlocksCannons) {
        const cannon = cannonById.get(cannonId);
        if (cannon === undefined) {
          throw new Error(
            `content/islands.json: island '${island.id}' band '${band}' unlocksCannons entry '${cannonId}' is absent from cannons`,
          );
        }
        if (!cell.skills.includes(cannon.skill)) {
          throw new Error(
            `content/islands.json: island '${island.id}' band '${band}' pays cannon '${cannonId}' ` +
              `whose skill '${cannon.skill}' is not on that island-band's skill list (D-14)`,
          );
        }
      }
    }
  }
}

function assertIslandGraphAcyclic(islands: readonly Island[]): void {
  const byId = new Map<string, Island>(islands.map((island) => [island.id, island]));
  for (const island of islands) {
    if (island.requiresIsland === undefined) continue;
    if (!byId.has(island.requiresIsland)) {
      throw new Error(
        `content/islands.json: island '${island.id}' requiresIsland '${island.requiresIsland}' which is absent from islands`,
      );
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string, trail: string[]): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      const cycleStart = trail.indexOf(id);
      const cycle = [...trail.slice(cycleStart), id].join(' -> ');
      throw new Error(`content/islands.json: requiresIsland cycle involving ${cycle}`);
    }
    visiting.add(id);
    const island = byId.get(id);
    if (island?.requiresIsland !== undefined) {
      visit(island.requiresIsland, [...trail, id]);
    }
    visiting.delete(id);
    visited.add(id);
  };

  for (const island of islands) {
    visit(island.id, []);
  }
}

/**
 * Validates a raw catalog object against every T-003 schema **and** set-level invariants
 * (unique ids, cross-catalog references, rank tiers, island requiresIsland DAG). Throws an
 * Error naming the catalog and offending id(s). Exported for tests and for any future editor
 * / runtime loader that validates authored content before it reaches `src/content/*.json`.
 */
export function validateCatalogs(input: RawCatalogs): void {
  const skills = parseCatalog('skills', skillSchema, input.skills);
  const cannons = parseCatalog('cannons', cannonSchema, input.cannons);
  const islands = parseCatalog('islands', islandSchema, input.islands);
  const ranks = parseCatalog('ranks', rankSchema, input.ranks);
  const crew = parseCatalog('crew', crewSchema, input.crew);
  const enemies = parseCatalog('enemies', enemySchema, input.enemies);

  assertUniqueIds('skills', skills);
  assertUniqueIds('cannons', cannons);
  assertUniqueIds('islands', islands);
  assertUniqueIds('ranks', ranks);
  assertUniqueIds('crew', crew);
  assertUniqueIds('enemies', enemies);
  assertNoRankTierClash(ranks);

  const islandIds = new Set(islands.map((i) => i.id));

  for (const cannon of cannons) {
    if (cannon.unlock.kind === 'range' && !islandIds.has(cannon.unlock.island)) {
      throw new Error(
        `content/cannons.json: cannon '${cannon.id}' unlock.island '${cannon.unlock.island}' is absent from islands`,
      );
    }
  }

  const enemyByIsland = new Map<IslandId, Enemy>();
  for (const enemy of enemies) {
    if (enemyByIsland.has(enemy.islandId)) {
      throw new Error(
        `content/enemies.json: duplicate islandId '${enemy.islandId}' on enemies '${enemyByIsland.get(enemy.islandId)!.id}' and '${enemy.id}'`,
      );
    }
    if (!islandIds.has(enemy.islandId)) {
      throw new Error(
        `content/enemies.json: enemy '${enemy.id}' islandId '${enemy.islandId}' is absent from islands`,
      );
    }
    enemyByIsland.set(enemy.islandId, enemy);
  }

  for (const island of islands) {
    if (!enemyByIsland.has(island.id)) {
      throw new Error(`content/enemies.json: island '${island.id}' has no enemy encounter`);
    }
  }

  // D-14 — the per-band curriculum ceiling law replaces the old shared rangeSkills /
  // unlocksCannons reference checks (its clauses subsume them: every entry must exist).
  assertCurriculumLawful(islands, skills, cannons);

  assertIslandGraphAcyclic(islands);
}

export const skills: readonly Skill[] = parseCatalog('skills', skillSchema, skillsRaw);
export const cannons: readonly Cannon[] = parseCatalog('cannons', cannonSchema, cannonsRaw);
export const islands: readonly Island[] = parseCatalog('islands', islandSchema, islandsRaw);
export const ranks: readonly Rank[] = parseCatalog('ranks', rankSchema, ranksRaw);
export const crew: readonly Crew[] = parseCatalog('crew', crewSchema, crewRaw);
export const enemies: readonly Enemy[] = parseCatalog('enemies', enemySchema, enemiesRaw);

// D-14 — the ceiling law is enforced AT IMPORT, not only inside `validateCatalogs`: an island
// carrying an over-ceiling skill for any band must fail a test the moment anything imports the
// content layer, never reach a device.
assertCurriculumLawful(islands, skills, cannons);

// --- Total lookup helpers: an entry or a thrown Error, never `undefined` --------------------

export function getCannon(id: CannonId): Cannon {
  const found = cannons.find((c) => c.id === id);
  if (found === undefined) throw new Error(`getCannon: no cannon with id '${id}'`);
  return found;
}

export function getSkill(id: SkillId): Skill {
  const found = skills.find((s) => s.id === id);
  if (found === undefined) throw new Error(`getSkill: no skill with id '${id}'`);
  return found;
}

export function getIsland(id: IslandId): Island {
  const found = islands.find((i) => i.id === id);
  if (found === undefined) throw new Error(`getIsland: no island with id '${id}'`);
  return found;
}

export function getEnemyForIsland(id: IslandId): Enemy {
  const found = enemies.find((enemy) => enemy.islandId === id);
  if (found === undefined) throw new Error(`getEnemyForIsland: no enemy for island '${id}'`);
  return found;
}

export function getRankByTier(tier: number): Rank {
  const found = ranks.find((r) => r.tier === tier);
  if (found === undefined) throw new Error(`getRankByTier: no rank with tier ${tier}`);
  return found;
}

/**
 * D-14 / A-069 — THE door to an island's taught content. Every consumer that used to read the
 * shared `island.rangeSkills` / `island.displayName` / `island.unlocksCannons` goes through
 * here instead (A-070 migrates them), so what an island teaches is always a function of the
 * captain's band.
 *
 * **Null-band fallback**: `band === null` returns the `g4_5` cell. Legacy and fixture callers
 * that predate banded profiles (or run before a band is chosen) get the full top-of-school
 * curriculum view — the same "no ceiling" reading those call sites had under the shared-field
 * world — rather than a throw or an empty cell. Callers with a real captain must pass the
 * captain's band.
 *
 * Throws (via `getIsland`) for an unknown island id; total otherwise — every island document
 * carries all three band cells by schema.
 */
export function islandCurriculumFor(islandId: IslandId, band: GradeBand | null): IslandBandCurriculum {
  return getIsland(islandId).curriculum[band ?? 'g4_5'];
}
