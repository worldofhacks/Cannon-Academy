/**
 * T-011 / T-032 — `src/engine/placement.ts`: grade-band placement.
 *
 * One pure function, called once at onboarding, turning the grade picker's answer (`GradeBand`)
 * into a starting `Placement` — pre-unlocked cannons, pre-unlocked islands, and a starting bot
 * accuracy band. PLAN.md §Sea chart: "a 5th grader begins at multiplication, not 3+4."
 *
 * Owner ruling D-6 (2026-07-28): placement grants **starter cannons only**. Islands stay
 * band-scoped; every `range` / `chest` cannon is earned through its declared `unlock`. T-032
 * owns the suite rewrite for the amended T-011 AC-2 / AC-4 / AC-5 cannon rules.
 *
 * This module is asymmetric in its failure modes (ticket dispatch, and PLAN.md's mercy language):
 * placing a child too HIGH makes their first duel unwinnable — the exact "convince a six-year-old
 * they're bad at maths" outcome the whole game guards against. Placing them too LOW is merely
 * boring, and recoverable. The tests below weight accordingly: every band gets an explicit
 * "playable start" guarantee (AC-2/AC-4/AC-5), and the island/cannon membership rules are swept
 * across the WHOLE catalog rather than sampled (L-017), because an off-by-one here mis-places a
 * real child rather than merely failing a test.
 *
 * ---------------------------------------------------------------------------------------------
 * DERIVE, DO NOT HARDCODE — T-029 is queued to add a skill (`sub_within_10`) and a third starter
 * cannon. Any assertion of the shape "9 skills" or a hand-copied id list breaks the moment that
 * ticket lands; a derived one does not (L-012). So:
 *   - `expectedCannonIds` / `expectedIslandIds` below compute the expected set FROM the live
 *     catalog + the ticket's stated rule, never from a literal id list or a literal count.
 *   - The "Dimension sweep" describe blocks check the rule against EVERY `CannonId` / `IslandId`
 *     in the current union, for every band — so a catalog addition is exercised automatically,
 *     not silently skipped.
 *   - Where the ticket text itself names specific ids (AC-2, AC-5, AC-7), those literals are
 *     kept — they are the ticket's own authoritative examples, cited as such — but each is
 *     immediately re-checked against the catalog-derived expectation in a sibling test, so the
 *     literal and the derivation cannot silently drift apart.
 *
 * Traceability: every test cites `spec(T-011:AC-n)` and, where D-6 applies, `spec(T-032:AC-n)`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { resolvePlacement } from '@engine/placement';
import { CANNON_IDS, GRADE_BANDS, ISLAND_IDS } from '@content/schemas';
import type { Cannon, CannonId, GradeBand, Island, IslandId } from '@content/schemas';
import { cannons, getCannon, getIsland, getSkill, islands, skills } from '@content/index';
import { BOT_ACCURACY_BAND_BY_GRADE } from '@engine/tuning';

// -----------------------------------------------------------------------------------------------
// Catalog-derived oracles — transcribe the ticket's RULE, not its output, so the expected set is
// computed the same way for every band and stays correct as the catalog grows (T-029).
// -----------------------------------------------------------------------------------------------

/** Ticket AC-1: the top grade of each band, verbatim. */
const MAX_GRADE_BY_BAND: Record<GradeBand, number> = { k_1: 1, g2_3: 3, g4_5: 5 };

/**
 * D-6 / amended T-011 rule: every cannon whose unlock.kind is `starter` and
 * `minGrade <= maxGrade`. Range and chest cannons are never placement-eligible.
 */
function isCannonEligible(cannon: Cannon, maxGrade: number): boolean {
  return cannon.unlock.kind === 'starter' && cannon.minGrade <= maxGrade;
}

/** The full catalog-derived expectation for a given maxGrade, sorted for order-independent compares. */
function expectedCannonIds(maxGrade: number): CannonId[] {
  return cannons
    .filter((c) => isCannonEligible(c, maxGrade))
    .map((c) => c.id)
    .sort();
}

/** Ticket rule: "at least one rangeSkills entry has skill.minGrade <= maxGrade". */
function isIslandEligible(island: Island, maxGrade: number): boolean {
  return island.rangeSkills.some((skillId) => getSkill(skillId).minGrade <= maxGrade);
}

/** Catalog-derived expectation, in island `order` — the shape AC-6's prefix property requires. */
function expectedIslandIds(maxGrade: number): IslandId[] {
  return [...islands]
    .filter((i) => isIslandEligible(i, maxGrade))
    .sort((a, b) => a.order - b.order)
    .map((i) => i.id);
}

const sorted = <T extends string>(xs: readonly T[]): T[] => [...xs].sort();

/** Range + chest ids the ticket names as never placement-granted (T-032 AC-3). */
const NON_STARTER_RANGE_AND_CHEST: readonly CannonId[] = [
  'six_pounder',
  'chain_shot',
  'twelve_pounder',
  'mortar',
  'double_broadside',
  'powder_keg',
  'long_nine',
  'nine_pounder',
];

// =================================================================================================
describe('AC-1 — maxGrade resolves per grade band', () => {
  it('spec(T-011:AC-1) k_1 resolves maxGrade 1', () => {
    expect(resolvePlacement('k_1').maxGrade).toBe(1);
  });

  it('spec(T-011:AC-1) g2_3 resolves maxGrade 3', () => {
    expect(resolvePlacement('g2_3').maxGrade).toBe(3);
  });

  it('spec(T-011:AC-1) g4_5 resolves maxGrade 5', () => {
    expect(resolvePlacement('g4_5').maxGrade).toBe(5);
  });

  it.each([...GRADE_BANDS])('spec(T-011:AC-1) %s leaves no declared GradeBand unmapped', (band) => {
    // Every entry of the union, not a sample (L-017) — a band silently falling through to
    // `undefined` would slip past the three literal tests above if a fourth band were ever added.
    expect(resolvePlacement(band).maxGrade).toBe(MAX_GRADE_BY_BAND[band]);
  });
});

// =================================================================================================
describe('AC-2 — k_1 unlocks exactly the two starter cannons (D-6)', () => {
  it('spec(T-011:AC-2) spec(T-032:AC-2) unlockedCannons is exactly swivel_gun and culverin', () => {
    // Ticket's own named example — kept literal because AC-2 states it explicitly.
    // Range guns (six_pounder, chain_shot, …) are earned through mastery, not placement.
    const placement = resolvePlacement('k_1');
    expect(sorted(placement.unlockedCannons)).toEqual(sorted(['swivel_gun', 'culverin'] as CannonId[]));
  });

  it('spec(T-011:AC-2) spec(T-032:AC-2) the literal set agrees with the catalog-derived expectation for maxGrade 1', () => {
    // Re-derives the same set from the rule rather than the literal, so the two cannot drift
    // apart the moment T-029 adds a new grade-0 starter.
    const placement = resolvePlacement('k_1');
    expect(sorted(placement.unlockedCannons)).toEqual(expectedCannonIds(1));
  });

  it('spec(T-011:AC-2) spec(T-032:AC-2) has no duplicate cannon ids', () => {
    const placement = resolvePlacement('k_1');
    expect(new Set(placement.unlockedCannons).size).toBe(placement.unlockedCannons.length);
  });

  it('spec(T-011:AC-2) spec(T-032:AC-2) excludes every range and chest cannon at k_1', () => {
    const placement = resolvePlacement('k_1');
    for (const id of NON_STARTER_RANGE_AND_CHEST) {
      expect(placement.unlockedCannons, `k_1 must not pre-grant '${id}'`).not.toContain(id);
    }
  });
});

// =================================================================================================
describe('AC-3 — chest-drop cannons are never pre-unlocked, at every band', () => {
  it.each([...GRADE_BANDS])('spec(T-011:AC-3) %s never contains nine_pounder', (band) => {
    expect(resolvePlacement(band).unlockedCannons).not.toContain('nine_pounder');
  });

  it.each([...GRADE_BANDS])('spec(T-011:AC-3) %s never contains ANY chest-kind cannon', (band) => {
    // Behavioural, not a single named id (L-013 in spirit): sweeps every cannon the catalog
    // currently marks `unlock.kind === 'chest'`, so a future second chest cannon is covered too.
    const chestIds = cannons.filter((c) => c.unlock.kind === 'chest').map((c) => c.id);
    expect(chestIds.length, 'fixture sanity: catalog must have >=1 chest cannon').toBeGreaterThan(0);
    const placement = resolvePlacement(band);
    for (const id of chestIds) {
      expect(placement.unlockedCannons, `${band} must exclude chest cannon '${id}'`).not.toContain(id);
    }
  });
});

// =================================================================================================
describe('AC-4 — g4_5 unlocks every starter cannon and every island (D-6)', () => {
  it('spec(T-011:AC-4) spec(T-032:AC-3) unlockedCannons equals every starter with minGrade <= 5', () => {
    // Derived, not a literal count: the shape changes the instant T-029 lands a third starter.
    // Range guns stay earnable via mastery — they must NOT appear here.
    const placement = resolvePlacement('g4_5');
    const expected = cannons.filter((c) => c.unlock.kind === 'starter' && c.minGrade <= 5).map((c) => c.id);
    expect(expected.length).toBeGreaterThan(0);
    expect(sorted(placement.unlockedCannons)).toEqual(sorted(expected));
    expect(sorted(placement.unlockedCannons)).toEqual(expectedCannonIds(5));
  });

  it('spec(T-011:AC-4) spec(T-032:AC-3) g4_5 excludes every named range and chest cannon', () => {
    const placement = resolvePlacement('g4_5');
    for (const id of NON_STARTER_RANGE_AND_CHEST) {
      expect(placement.unlockedCannons, `g4_5 must not pre-grant '${id}'`).not.toContain(id);
    }
  });

  it('spec(T-011:AC-4) spec(T-032:AC-4) unlockedIslands equals every island in the catalog', () => {
    const placement = resolvePlacement('g4_5');
    expect(sorted(placement.unlockedIslands)).toEqual(sorted(ISLAND_IDS));
    expect(placement.unlockedIslands).toHaveLength(ISLAND_IDS.length);
    expect(sorted(placement.unlockedIslands)).toEqual(sorted(expectedIslandIds(5)));
  });
});

// =================================================================================================
describe('AC-5 — g2_3 unlocks starters only; range and chest stay locked (D-6)', () => {
  it('spec(T-011:AC-5) spec(T-032:AC-3) unlockedCannons equals the starter set for maxGrade 3', () => {
    const placement = resolvePlacement('g2_3');
    expect(sorted(placement.unlockedCannons)).toEqual(expectedCannonIds(3));
    // Today that is the same two starters as k_1 — pinned so a silent range-grant fails loudly.
    expect(sorted(placement.unlockedCannons)).toEqual(sorted(['swivel_gun', 'culverin'] as CannonId[]));
  });

  it('spec(T-011:AC-5) spec(T-032:AC-3) excludes every named range and chest cannon', () => {
    const placement = resolvePlacement('g2_3');
    for (const id of NON_STARTER_RANGE_AND_CHEST) {
      expect(placement.unlockedCannons, `g2_3 must not pre-grant '${id}'`).not.toContain(id);
    }
  });

  it('spec(T-011:AC-5) excludes twelve_pounder, mortar, double_broadside, powder_keg, and long_nine', () => {
    // Amended T-011 AC-5 still names these as exclusions (formerly: include grade-3, exclude 4/5).
    const placement = resolvePlacement('g2_3');
    expect(placement.unlockedCannons).not.toContain('twelve_pounder');
    expect(placement.unlockedCannons).not.toContain('mortar');
    expect(placement.unlockedCannons).not.toContain('double_broadside');
    expect(placement.unlockedCannons).not.toContain('powder_keg');
    expect(placement.unlockedCannons).not.toContain('long_nine');
  });
});

// =================================================================================================
describe('AC-6 — unlocked islands form a contiguous prefix, with port_sumwich always present', () => {
  it.each([...GRADE_BANDS])(
    'spec(T-011:AC-6) spec(T-032:AC-4) %s island orders are exactly [0..n-1] — no gap',
    (band) => {
      const placement = resolvePlacement(band);
      const orders = placement.unlockedIslands.map((id) => getIsland(id).order).sort((a, b) => a - b);
      expect(new Set(orders).size, 'duplicate island in unlockedIslands').toBe(orders.length);
      expect(orders.length, `${band}: a band that unlocks nothing is a soft lock`).toBeGreaterThanOrEqual(1);
      expect(orders).toEqual(Array.from({ length: orders.length }, (_, i) => i));
    },
  );

  it.each([...GRADE_BANDS])('spec(T-011:AC-6) spec(T-032:AC-4) %s includes port_sumwich', (band) => {
    expect(resolvePlacement(band).unlockedIslands).toContain('port_sumwich');
  });

  it.each([...GRADE_BANDS])(
    'spec(T-011:AC-6) spec(T-032:AC-4) %s unlockedIslands agrees with the catalog-derived expectation',
    (band) => {
      const placement = resolvePlacement(band);
      expect(sorted(placement.unlockedIslands)).toEqual(sorted(expectedIslandIds(MAX_GRADE_BY_BAND[band])));
    },
  );
});

// =================================================================================================
describe('AC-7 — k_1 unlocks only the first island', () => {
  it('spec(T-011:AC-7) spec(T-032:AC-4) unlockedIslands is exactly [port_sumwich]', () => {
    const placement = resolvePlacement('k_1');
    expect([...placement.unlockedIslands]).toEqual(['port_sumwich']);
  });

  it('spec(T-011:AC-7) spec(T-032:AC-4) agrees with the catalog-derived expectation for maxGrade 1', () => {
    const placement = resolvePlacement('k_1');
    expect(sorted(placement.unlockedIslands)).toEqual(expectedIslandIds(1));
  });
});

// =================================================================================================
describe('AC-8 — starting bot difficulty matches the tuned band, at every band', () => {
  it.each([...GRADE_BANDS])(
    'spec(T-011:AC-8) %s botAccuracyBand deep-equals BOT_ACCURACY_BAND_BY_GRADE',
    (band) => {
      expect(resolvePlacement(band).botAccuracyBand).toEqual(BOT_ACCURACY_BAND_BY_GRADE[band]);
    },
  );

  it.each([...GRADE_BANDS])('spec(T-011:AC-8) %s keeps 0 < min < max <= 1', (band) => {
    const { min, max } = resolvePlacement(band).botAccuracyBand;
    expect(min).toBeGreaterThan(0);
    expect(max).toBeGreaterThan(min);
    expect(max).toBeLessThanOrEqual(1);
  });
});

// =================================================================================================
describe('AC-9 — resolvePlacement is pure, deterministic, and its outputs are safe to mutate', () => {
  it.each([...GRADE_BANDS])('spec(T-011:AC-9) %s returns deeply equal results across 100 calls', (band) => {
    const first = resolvePlacement(band);
    for (let i = 0; i < 100; i += 1) {
      expect(resolvePlacement(band)).toEqual(first);
    }
  });

  it.each([...GRADE_BANDS])(
    'spec(T-011:AC-9) %s: mutating a returned array never affects a later call',
    (band) => {
      // The weak version of this test only checks the FIRST call's shape; the real property is
      // that mutating what a caller was handed cannot corrupt what the NEXT caller receives
      // (L-012 — an aggregate/shape check alone would miss a shared-reference cheat).
      const first = resolvePlacement(band);
      const originalCannonCount = first.unlockedCannons.length;
      const originalIslandCount = first.unlockedIslands.length;

      const attemptMutate = (arr: readonly unknown[], bogus: unknown): void => {
        try {
          (arr as unknown[]).push(bogus);
        } catch {
          // A frozen array rejects the push outright — that trivially protects later calls too.
        }
      };
      attemptMutate(first.unlockedCannons, 'BOGUS_CANNON');
      attemptMutate(first.unlockedIslands, 'BOGUS_ISLAND');

      const second = resolvePlacement(band);
      expect(second.unlockedCannons).toHaveLength(originalCannonCount);
      expect(second.unlockedIslands).toHaveLength(originalIslandCount);
      expect(second.unlockedCannons).not.toContain('BOGUS_CANNON');
      expect(second.unlockedIslands).not.toContain('BOGUS_ISLAND');
    },
  );
});

// =================================================================================================
describe('AC-10 — resolvePlacement is total over GradeBand and loud outside it', () => {
  const BAD_BAND_STRINGS = ['k1', 'K_1', ' k_1', 'g2-3', 'g6_7', 'kindergarten'];

  it.each(BAD_BAND_STRINGS)('spec(T-011:AC-10) rejects the string "%s" with an Error naming it', (bad) => {
    expect(() => resolvePlacement(bad as GradeBand)).toThrow(Error);
    const escaped = bad.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(() => resolvePlacement(bad as GradeBand)).toThrow(new RegExp(escaped));
  });

  it.each([null, undefined, 0, 42, '', {}, [], [...GRADE_BANDS]])(
    'spec(T-011:AC-10) rejects out-of-domain input %p with an Error',
    (bad) => {
      // Dimensions beyond "wrong string" (L-017): wrong type entirely, empty string, and the
      // whole union passed as a single (wrong-shaped) value.
      expect(() => resolvePlacement(bad as unknown as GradeBand)).toThrow(Error);
    },
  );

  it('spec(T-011:AC-10) never returns a Placement for an invalid band — it throws, not undefined', () => {
    let result: unknown = 'not-called';
    try {
      result = resolvePlacement('nope' as GradeBand);
    } catch {
      result = 'threw';
    }
    expect(result).toBe('threw');
  });
});

// =================================================================================================
describe('AC-11 — placement ids are real catalog ids, with no duplicates, at every band', () => {
  it.each([...GRADE_BANDS])('spec(T-011:AC-11) %s unlockedCannons are all real, unique CannonIds', (band) => {
    const placement = resolvePlacement(band);
    const known = new Set(CANNON_IDS);
    for (const id of placement.unlockedCannons) {
      expect(known.has(id), `'${id}' is not a real CannonId`).toBe(true);
    }
    expect(new Set(placement.unlockedCannons).size).toBe(placement.unlockedCannons.length);
  });

  it.each([...GRADE_BANDS])('spec(T-011:AC-11) %s unlockedIslands are all real, unique IslandIds', (band) => {
    const placement = resolvePlacement(band);
    const known = new Set(ISLAND_IDS);
    for (const id of placement.unlockedIslands) {
      expect(known.has(id), `'${id}' is not a real IslandId`).toBe(true);
    }
    expect(new Set(placement.unlockedIslands).size).toBe(placement.unlockedIslands.length);
  });
});

// =================================================================================================
// T-032 D-6 pins — starters-only across every band, plus AC-7 proof that old expectations are gone.
// =================================================================================================

describe('T-032 AC-1 — every unlocked cannon is unlock.kind === starter', () => {
  it.each([...GRADE_BANDS])(
    'spec(T-032:AC-1) %s unlockedCannons are all starters; no range or chest id appears',
    (band) => {
      const placement = resolvePlacement(band);
      expect(placement.unlockedCannons.length, `${band}: soft-lock if zero starters`).toBeGreaterThan(0);
      for (const id of placement.unlockedCannons) {
        const cannon = getCannon(id);
        expect(cannon.unlock.kind, `${band}: '${id}' must be starter`).toBe('starter');
      }
      const nonStarters = cannons.filter((c) => c.unlock.kind !== 'starter').map((c) => c.id);
      for (const id of nonStarters) {
        expect(placement.unlockedCannons, `${band} must exclude non-starter '${id}'`).not.toContain(id);
      }
    },
  );
});

describe('T-032 AC-7 — old four-cannon / nine-cannon / range-inclusion expectations are gone', () => {
  const OWN_SOURCE = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  // Forbidden phrases are assembled at runtime so this describe cannot self-match (L-012).
  const oldFourCannon = ['swivel_gun', 'culverin', 'six_pounder', 'chain_shot'].join(', ');
  const oldG23Includes = ['includes', 'twelve_pounder,', 'mortar,', 'and', 'double_broadside'].join(' ');
  const oldStarterOrRange = ['unlock.kind', 'is', 'starter', 'or', 'range'].join(' ');
  const oldNonChestFilter = ["filter((c) => c.unlock.kind !== '", "chest')"].join('');

  it('spec(T-032:AC-7) this suite no longer expects the pre-D-6 four-cannon k_1 set', () => {
    expect(OWN_SOURCE.includes(oldFourCannon), `must not contain literal [${oldFourCannon}]`).toBe(false);
  });

  it('spec(T-032:AC-7) this suite no longer asserts positive g2_3 range-gun inclusions', () => {
    // Old positive-inclusion wording — exclusions via `.not.toContain` are still allowed.
    expect(OWN_SOURCE.includes(oldG23Includes)).toBe(false);
    expect(OWN_SOURCE).not.toMatch(/expect\(placement\.unlockedCannons\)\.toContain\('twelve_pounder'\)/);
    expect(OWN_SOURCE).not.toMatch(/expect\(placement\.unlockedCannons\)\.toContain\('mortar'\)/);
    expect(OWN_SOURCE).not.toMatch(/expect\(placement\.unlockedCannons\)\.toContain\('double_broadside'\)/);
  });

  it('spec(T-032:AC-7) this suite no longer equates g4_5 cannons with every non-chest cannon', () => {
    expect(OWN_SOURCE.includes(oldStarterOrRange)).toBe(false);
    expect(OWN_SOURCE.includes(oldNonChestFilter)).toBe(false);
  });
});

// =================================================================================================
// Structural invariants beyond the bare ACs — dimension sweeps, monotonicity, and the "playable
// start" guarantee the dispatch calls out as the module's highest-stakes property. Each test still
// cites the AC(s) it strengthens, per spec-lint's reverse-direction check.
// =================================================================================================

describe('Dimension sweep — every cannon x every band agrees with the starters-only rule (L-017)', () => {
  const CASES = GRADE_BANDS.flatMap((band) => CANNON_IDS.map((id) => [band, id] as const));

  it.each(CASES)(
    'spec(T-011:AC-2) spec(T-011:AC-4) spec(T-011:AC-5) spec(T-032:AC-1) band=%s cannon=%s membership matches the rule',
    (band, id) => {
      const placement = resolvePlacement(band);
      const cannon = getCannon(id);
      const maxGrade = MAX_GRADE_BY_BAND[band];
      const shouldBeUnlocked = cannon.unlock.kind === 'starter' && cannon.minGrade <= maxGrade;
      expect(placement.unlockedCannons.includes(id)).toBe(shouldBeUnlocked);
    },
  );
});

describe('Dimension sweep — every island x every band agrees with the ticket rule (L-017)', () => {
  const CASES = GRADE_BANDS.flatMap((band) => ISLAND_IDS.map((id) => [band, id] as const));

  it.each(CASES)(
    'spec(T-011:AC-6) spec(T-011:AC-7) spec(T-032:AC-4) band=%s island=%s membership matches the rule',
    (band, id) => {
      const placement = resolvePlacement(band);
      const island = getIsland(id);
      const maxGrade = MAX_GRADE_BY_BAND[band];
      const shouldBeUnlocked = island.rangeSkills.some((s) => getSkill(s).minGrade <= maxGrade);
      expect(placement.unlockedIslands.includes(id)).toBe(shouldBeUnlocked);
    },
  );
});

describe('Monotonicity — a higher band is a strict superset of a lower band (L-012)', () => {
  it('spec(T-011:AC-2) spec(T-011:AC-5) g2_3 cannons are a superset of k_1 cannons', () => {
    const lower = resolvePlacement('k_1').unlockedCannons;
    const higher = resolvePlacement('g2_3').unlockedCannons;
    for (const id of lower) expect(higher, `g2_3 must still own ${id}`).toContain(id);
  });

  it('spec(T-011:AC-4) g4_5 cannons are a superset of g2_3 cannons', () => {
    const lower = resolvePlacement('g2_3').unlockedCannons;
    const higher = resolvePlacement('g4_5').unlockedCannons;
    for (const id of lower) expect(higher, `g4_5 must still own ${id}`).toContain(id);
  });

  it('spec(T-011:AC-6) spec(T-032:AC-4) g2_3 islands are a superset of k_1 islands', () => {
    const lower = resolvePlacement('k_1').unlockedIslands;
    const higher = resolvePlacement('g2_3').unlockedIslands;
    for (const id of lower) expect(higher, `g2_3 must still have island ${id}`).toContain(id);
  });

  it('spec(T-011:AC-6) spec(T-032:AC-4) g4_5 islands are a superset of g2_3 islands', () => {
    const lower = resolvePlacement('g2_3').unlockedIslands;
    const higher = resolvePlacement('g4_5').unlockedIslands;
    for (const id of lower) expect(higher, `g4_5 must still have island ${id}`).toContain(id);
  });

  it('spec(T-011:AC-8) bot accuracy band is non-decreasing from k_1 to g2_3 to g4_5', () => {
    const orderedBands: readonly GradeBand[] = ['k_1', 'g2_3', 'g4_5'];
    for (let i = 1; i < orderedBands.length; i += 1) {
      const prevBand = orderedBands[i - 1] as GradeBand;
      const currBand = orderedBands[i] as GradeBand;
      const prev = resolvePlacement(prevBand).botAccuracyBand;
      const curr = resolvePlacement(currBand).botAccuracyBand;
      expect(curr.min, `${currBand}.min must not drop below ${prevBand}.min`).toBeGreaterThanOrEqual(
        prev.min,
      );
      expect(curr.max, `${currBand}.max must not drop below ${prevBand}.max`).toBeGreaterThanOrEqual(
        prev.max,
      );
    }
  });
});

describe('Playable start — every band yields at least one owned cannon on a reachable skill', () => {
  // The asymmetric-risk guarantee from the dispatch: a band that pre-unlocks nothing, or unlocks
  // cannons whose skill is out of reach, is a soft-locked child. Tested at three levels of
  // strength: cannons exist, skills are reachable, and — the property that actually matters —
  // at least one OWNED cannon teaches a REACHABLE skill.
  it.each([...GRADE_BANDS])('spec(T-011:AC-2) %s unlocks at least one cannon', (band) => {
    expect(resolvePlacement(band).unlockedCannons.length).toBeGreaterThanOrEqual(1);
  });

  it.each([...GRADE_BANDS])('spec(T-011:AC-2) %s has at least one skill within reach of maxGrade', (band) => {
    const maxGrade = MAX_GRADE_BY_BAND[band];
    const reachable = skills.filter((s) => s.minGrade <= maxGrade);
    expect(reachable.length, `${band}: no skill reachable at maxGrade ${maxGrade}`).toBeGreaterThanOrEqual(1);
  });

  it.each([...GRADE_BANDS])(
    'spec(T-011:AC-2) spec(T-011:AC-4) spec(T-011:AC-5) %s owns a cannon whose OWN skill is reachable',
    (band) => {
      const placement = resolvePlacement(band);
      const maxGrade = MAX_GRADE_BY_BAND[band];
      const playable = placement.unlockedCannons.some((id) => {
        const cannon = getCannon(id);
        const skill = getSkill(cannon.skill);
        return skill.minGrade <= maxGrade;
      });
      expect(playable, `${band}: owns no cannon whose skill is reachable — a soft lock`).toBe(true);
    },
  );
});

// =================================================================================================
// Definition of Done — numbered tags for spec-lint (T-032 is not grandfathered).
// =================================================================================================

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '../..');
const ticketText = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8');
const OWN_SOURCE = readFileSync(fileURLToPath(import.meta.url), 'utf8');
const COMPOSITION_SOURCE = readFileSync(join(HERE, 'placement-mastery.test.ts'), 'utf8');
const COMBINED_SUITE = `${OWN_SOURCE}\n${COMPOSITION_SOURCE}`;

describe('T-032 Definition of Done', () => {
  it('dod(T-032:1) tags a test against every acceptance criterion T-032 declares', () => {
    const ticket = ticketText('tickets/T-032.md');
    const declared = [...ticket.matchAll(/\*\*(AC-\d+)\*\*/g)].map((m) => m[1]);
    const unique = [...new Set(declared)];
    const untagged = unique.filter((ac) => !COMBINED_SUITE.includes(`spec(T-032:${ac})`));
    expect(unique.length).toBeGreaterThan(0);
    expect(untagged, 'every declared AC needs at least one tagged test').toEqual([]);
  });

  it('dod(T-032:2) amended T-011 cannon criteria AC-2/AC-4/AC-5 still carry spec(T-011:…) tags', () => {
    for (const ac of ['AC-2', 'AC-4', 'AC-5'] as const) {
      expect(OWN_SOURCE, `placement suite must retain spec(T-011:${ac})`).toContain(`spec(T-011:${ac})`);
    }
  });

  it('dod(T-032:3) keeps every local gate wired up, and adds no focused/skipped test', () => {
    const gates = ticketText('.tdd-swarm/run-local-gates.sh');
    for (const command of ['prettier --check', 'eslint . --max-warnings 0', 'tsc --noEmit', 'vitest run']) {
      expect(gates, `run-local-gates.sh must still run: ${command}`).toContain(command);
    }
    expect(/\b(it|test|describe)\.(skip|only)\b|\bx(it|describe)\b/.test(COMBINED_SUITE)).toBe(false);
  });

  it('dod(T-032:4) numbers every dod tag so spec-lint can parse T-032 DoD coverage', () => {
    const ticket = ticketText('tickets/T-032.md');
    const dodCount = (ticket.match(/^- \[[ x]\] /gm) ?? []).length;
    const tagged = [...COMBINED_SUITE.matchAll(/dod\(T-032:([^)]*)\)/g)].map((m) => m[1] ?? '');
    const unparseable = tagged.filter((id) => !/^\d+$/.test(id));
    const covered = new Set(tagged.filter((id) => /^\d+$/.test(id)).map(Number));
    // DoD-7 is [process] and skipped by the gate; still tag 1–6 and 8 so the grammar stays honest.
    const required = [1, 2, 3, 4, 5, 6, 8];
    const missing = required.filter((n) => !covered.has(n));
    expect(dodCount).toBeGreaterThan(0);
    expect(unparseable).toEqual([]);
    expect(missing).toEqual([]);
  });

  it('dod(T-032:5) resolvePlacement(k_1).unlockedCannons is exactly the two starters', () => {
    expect(sorted(resolvePlacement('k_1').unlockedCannons)).toEqual(
      sorted(['swivel_gun', 'culverin'] as CannonId[]),
    );
  });

  it('dod(T-032:8) composition coverage lives outside the frozen T-010 mastery suite', () => {
    const masterySuite = ticketText('__tests__/engine/mastery.test.ts');
    expect(masterySuite).not.toContain('spec(T-032:');
    expect(COMPOSITION_SOURCE).toContain('spec(T-032:AC-5)');
    expect(COMPOSITION_SOURCE).toContain('spec(T-032:AC-6)');
  });
});
