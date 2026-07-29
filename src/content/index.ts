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
import islandsRaw from './islands.json';
import ranksRaw from './ranks.json';
import { cannonSchema, crewSchema, islandSchema, rankSchema, skillSchema } from './schemas';
import type { Cannon, CannonId, Crew, Island, IslandId, Rank, Skill, SkillId } from './schemas';
import skillsRaw from './skills.json';

type CatalogName = 'skills' | 'cannons' | 'islands' | 'ranks' | 'crew';

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

  assertUniqueIds('skills', skills);
  assertUniqueIds('cannons', cannons);
  assertUniqueIds('islands', islands);
  assertUniqueIds('ranks', ranks);
  assertUniqueIds('crew', crew);
  assertNoRankTierClash(ranks);

  const skillIds = new Set(skills.map((s) => s.id));
  const cannonIds = new Set(cannons.map((c) => c.id));
  const islandIds = new Set(islands.map((i) => i.id));

  for (const cannon of cannons) {
    if (cannon.unlock.kind === 'range' && !islandIds.has(cannon.unlock.island)) {
      throw new Error(
        `content/cannons.json: cannon '${cannon.id}' unlock.island '${cannon.unlock.island}' is absent from islands`,
      );
    }
  }

  for (const island of islands) {
    for (const skillId of island.rangeSkills) {
      if (!skillIds.has(skillId)) {
        throw new Error(
          `content/islands.json: island '${island.id}' rangeSkills entry '${skillId}' is absent from skills`,
        );
      }
    }
    for (const cannonId of island.unlocksCannons) {
      if (!cannonIds.has(cannonId)) {
        throw new Error(
          `content/islands.json: island '${island.id}' unlocksCannons entry '${cannonId}' is absent from cannons`,
        );
      }
    }
  }

  assertIslandGraphAcyclic(islands);
}

export const skills: readonly Skill[] = parseCatalog('skills', skillSchema, skillsRaw);
export const cannons: readonly Cannon[] = parseCatalog('cannons', cannonSchema, cannonsRaw);
export const islands: readonly Island[] = parseCatalog('islands', islandSchema, islandsRaw);
export const ranks: readonly Rank[] = parseCatalog('ranks', rankSchema, ranksRaw);
export const crew: readonly Crew[] = parseCatalog('crew', crewSchema, crewRaw);

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

export function getRankByTier(tier: number): Rank {
  const found = ranks.find((r) => r.tier === tier);
  if (found === undefined) throw new Error(`getRankByTier: no rank with tier ${tier}`);
  return found;
}
