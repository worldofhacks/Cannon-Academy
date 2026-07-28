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

/**
 * Validates a raw catalog object against every T-003 schema, throwing an Error naming the
 * offending catalog and entry id on the first invalid entry. Exported for tests and for any
 * caller wanting to validate authored content before it reaches `src/content/*.json`.
 */
export function validateCatalogs(input: RawCatalogs): void {
  parseCatalog('skills', skillSchema, input.skills);
  parseCatalog('cannons', cannonSchema, input.cannons);
  parseCatalog('islands', islandSchema, input.islands);
  parseCatalog('ranks', rankSchema, input.ranks);
  parseCatalog('crew', crewSchema, input.crew);
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
