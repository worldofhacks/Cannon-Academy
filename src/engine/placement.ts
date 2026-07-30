/**
 * Grade-band placement — turns the onboarding grade picker's answer into a starting game state.
 *
 * One pure function, called once at onboarding (T-011 / T-032). It pre-unlocks a PREFIX OF THE
 * ISLAND CHAIN sized to the player's declared band, and starter cannons only (owner ruling D-6);
 * range/chest guns are earned through their declared unlocks. Sets a starting bot accuracy band so
 * a 5th grader begins at multiplication, not `3 + 4` (PLAN.md §Sea chart).
 *
 * ## What the band does and does not buy (OWNER RULE, 2026-07-30)
 *
 * It used to unlock every island whose maths was age-appropriate, which measured:
 *
 *   | band   | islands open at onboarding                                   |
 *   |--------|--------------------------------------------------------------|
 *   | `k_1`  | 1 — Port Sumwich                                             |
 *   | `g2_3` | 3 — Port Sumwich, Isla Products, Quotient Cove               |
 *   | `g4_5` | 5 — **the whole game**                                       |
 *
 * A 4th grader arrived at a map with nothing left to earn, and `requiresIsland` — which
 * `resolveUnlocks` honours at runtime — was never consulted at all. Two systems, one chain, one of
 * them ignoring it.
 *
 * The rule now: **the band sizes a chain prefix** (`PLACEMENT_ISLANDS_BY_BAND`) — 1 / 2 / 3 — and
 * the band governs question DIFFICULTY WITHIN an island rather than how much of the map is free.
 * Every band leaves at least two islands to sail for.
 *
 * Asymmetric stakes (ticket dispatch): placing a child too LOW is merely boring and recoverable.
 * Placing them too HIGH makes their first duel unwinnable. The eligibility rule below is
 * therefore "reachable at this band" (`cannon.minGrade <= maxGrade`) — the gun is *reachable* —
 * never "outgrown" (`cannon.maxGrade <= maxGrade`), which would deny a 5th grader every starter
 * cannon and leave them holding only the hardest guns in the game.
 *
 * Everything here is derived from `@content/index` (the T-003-validated catalog) and
 * `@engine/tuning`'s `BOT_ACCURACY_BAND_BY_GRADE` — no hardcoded cannon or island id list lives
 * in this module, so a catalog edit (e.g. T-029's new starter cannon) changes behaviour without
 * touching this file.
 */
import { cannons, getSkill, islands } from '@content/index';
import type { Cannon, CannonId, GradeBand, Island, IslandId } from '@content/schemas';
import { GRADE_BANDS } from '@content/schemas';
import { BOT_ACCURACY_BAND_BY_GRADE, PLACEMENT_ISLANDS_BY_BAND, TRAY_CAPACITY } from '@engine/tuning';

/** The starting game state produced from a single onboarding grade-band answer. */
export interface Placement {
  readonly maxGrade: number; // 1 | 3 | 5
  readonly unlockedCannons: readonly CannonId[]; // ascending by minGrade, then id
  /**
   * The subset of `unlockedCannons` a captain starts with in the tray — never more than
   * `TRAY_CAPACITY`.
   *
   * The defect: `stores/player.ts` equips `[...placement.unlockedCannons]` wholesale, and a `g4_5`
   * placement grants FOUR (two starters plus the two D-9 exceptions). The gun deck showed
   * "4 OF 3 SLOTS" and refused to save a loadout the app had assigned itself, on a captain's very
   * first visit. Fixed here rather than at the call site because placement is the thing that knows
   * how many guns it just handed out, and because `player.ts` belongs to another track.
   *
   * The first `TRAY_CAPACITY`, in the same `minGrade`-then-id order as `unlockedCannons` — the
   * easiest guns a captain of that band owns, which is the right tray to start on.
   */
  readonly equippedCannons: readonly CannonId[];
  readonly unlockedIslands: readonly IslandId[]; // ascending by island order
  readonly botAccuracyBand: { readonly min: number; readonly max: number };
}

/** Ticket AC-1: the top grade of each `GradeBand`, the ticket's own contract. */
const MAX_GRADE_BY_BAND: Readonly<Record<GradeBand, number>> = {
  k_1: 1,
  g2_3: 3,
  g4_5: 5,
};

/** Resolves the shared curriculum ceiling and rejects missing or corrupt persisted band data. */
export function maxGradeForBand(band: unknown): number {
  if (!(GRADE_BANDS as readonly unknown[]).includes(band)) {
    throw new RangeError(
      `maxGradeForBand: invalid GradeBand ${JSON.stringify(band)} — expected one of ${GRADE_BANDS.join(', ')}`,
    );
  }
  return MAX_GRADE_BY_BAND[band as GradeBand];
}

/**
 * D-9 — the only direct non-starter placement grants (OWNER-RULINGS). Every other range/chest gun
 * stays mastery-earned; these two retain their catalog `range` unlock as a second path.
 */
const PLACEMENT_EXCEPTIONS: Readonly<Partial<Record<CannonId, readonly GradeBand[]>>> = {
  six_pounder: ['g2_3', 'g4_5'],
  twelve_pounder: ['g4_5'],
};

/**
 * A cannon is placement-eligible when it is a starter reachable at this band, or one of the two
 * D-9 exceptions for this band. Chest and all other range guns stay mastery-earned (D-6).
 */
function isCannonEligible(cannon: Cannon, maxGrade: number, band: GradeBand): boolean {
  if (cannon.minGrade > maxGrade) return false;
  if (cannon.unlock.kind === 'starter') return true;
  return PLACEMENT_EXCEPTIONS[cannon.id]?.includes(band) === true;
}

/**
 * An island has something to teach at this band when ANY of its range skills is age-appropriate —
 * the minimum grade among its `rangeSkills`, not every one of them.
 *
 * This is no longer the unlock RULE (see `chainPrefix`); it is the safety stop on the prefix. An
 * island opened with nothing in-band to drill is an island a child can sail to and find empty.
 */
function isIslandEligible(island: Island, maxGrade: number): boolean {
  return island.rangeSkills.some((skillId) => getSkill(skillId).minGrade <= maxGrade);
}

/**
 * The islands in `requiresIsland` order — the chain, not the `order` field.
 *
 * `order` and the chain agree in today's catalog, and that agreement is exactly the kind of thing
 * that stops being true the first time someone inserts an island. The chain is what
 * `resolveUnlocks` walks at runtime, so it is what placement must walk too, or the two systems
 * disagree about which island is "next" — which is the class of bug this whole change is fixing.
 *
 * Built by following `requiresIsland` forward from the single root (the island that requires
 * nothing). Anything not reachable that way is not on the chain and is never pre-unlocked: an
 * unreachable island is a content bug, and quietly granting it would hide the bug.
 */
function islandChain(): readonly Island[] {
  const byRequirement = new Map<IslandId | undefined, Island>();
  for (const island of islands) {
    // A second island requiring the same predecessor means the chain forks and "the next island"
    // has no answer. Loud rather than arbitrary — a silent pick would ship a half-open map.
    if (byRequirement.has(island.requiresIsland)) {
      throw new Error(
        `placement: the island chain forks at ${String(island.requiresIsland)} — ` +
          `${byRequirement.get(island.requiresIsland)?.id} and ${island.id} both require it`,
      );
    }
    byRequirement.set(island.requiresIsland, island);
  }

  const chain: Island[] = [];
  let next = byRequirement.get(undefined);
  while (next !== undefined && chain.length <= islands.length) {
    chain.push(next);
    next = byRequirement.get(next.id);
  }
  return chain;
}

/**
 * The prefix of the chain a band's placement opens (OWNER RULE, 2026-07-30).
 *
 * The count comes from `PLACEMENT_ISLANDS_BY_BAND`; the ORDER comes from the chain. The prefix
 * stops early at the first island with nothing age-appropriate to teach, so the count is a ceiling
 * rather than a promise — placement can never open a door onto an empty room.
 *
 * What this replaces: `islands.filter(isIslandEligible)`, which unlocked by grade alone and ignored
 * `requiresIsland` entirely. It gave `g4_5` all five islands at onboarding — the whole game, before
 * the first duel — while `resolveUnlocks` was busy honouring a chain nobody was walking.
 */
function chainPrefix(band: GradeBand, maxGrade: number): readonly Island[] {
  const chain = islandChain();
  const budget = Math.min(PLACEMENT_ISLANDS_BY_BAND[band], chain.length);
  const prefix: Island[] = [];
  for (let i = 0; i < budget; i += 1) {
    const island = chain[i];
    if (island === undefined || !isIslandEligible(island, maxGrade)) break;
    prefix.push(island);
  }
  return prefix;
}

/** Ascending by `minGrade`, then by id — a stable, deterministic ordering for cannons. */
function sortCannons(list: readonly Cannon[]): CannonId[] {
  return list
    .slice()
    .sort((a, b) => a.minGrade - b.minGrade || a.id.localeCompare(b.id))
    .map((c) => c.id);
}

/** Ascending by island `order`. */
function sortIslands(list: readonly Island[]): IslandId[] {
  return list
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((i) => i.id);
}

/**
 * Resolves a `GradeBand` into its starting `Placement`. Throws for any value outside the
 * declared `GradeBand` union — the function is total over its declared domain and loud outside
 * it, never silently defaulting.
 *
 * Always builds fresh arrays and a fresh band object from the catalog and `tuning.ts` on every
 * call: no module-level cache is shared across calls, so mutating a caller's returned array can
 * never leak into a later invocation's result.
 */
export function resolvePlacement(band: GradeBand): Placement {
  const maxGrade = maxGradeForBand(band);

  const unlockedCannons = sortCannons(cannons.filter((c) => isCannonEligible(c, maxGrade, band)));
  // Sorted by `order` for the caller's stable contract, but SELECTED by the chain — the two are
  // different questions and only one of them is about where a node is drawn.
  const unlockedIslands = sortIslands(chainPrefix(band, maxGrade));
  const tunedBand = BOT_ACCURACY_BAND_BY_GRADE[band];

  return {
    maxGrade,
    unlockedCannons,
    equippedCannons: unlockedCannons.slice(0, TRAY_CAPACITY),
    unlockedIslands,
    botAccuracyBand: { min: tunedBand.min, max: tunedBand.max },
  };
}
