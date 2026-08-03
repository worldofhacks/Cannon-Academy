/**
 * A-051 — the curriculum ceiling holds everywhere, including where it only shows.
 *
 * RE-BASELINED under owner ruling **D-14** (2026-08-02, `tickets/app/OWNER-RULINGS.md`, applied
 * by A-070): the ceiling moved from the map into the curriculum. Every island now carries one
 * complete cell per band (`islandCurriculumFor`), the shared `rangeSkills` no longer exists, and
 * A-060's guarantee is restated, not weakened: no island may carry, for any band, a skill above
 * that band's ceiling. This file is where that guarantee LIVES at the consumer level — the
 * A-070 AC-2 sweep below walks all 15 band × island cells through every migrated door (drills,
 * rival guns, entry cannons, encounter skills, chart glyphs), so a single call site hardcoding
 * another band's cell fails here by name.
 *
 * A-051's original two bugs stay pinned, one cause: a grade band gates what a child is ASKED in
 * several places, and each of those places had to remember to apply it. Two forgot —
 * `app/gun-deck.tsx`'s flat operator row, and `chartNodes` measuring `cleared` against skills a
 * band is never served. Under the atlas `cleared` is measured against the band's own cell, so
 * the tick and the offer can no longer disagree.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getCannon, getSkill, islandCurriculumFor, islands, skills } from '../../src/content/index';
import type { GradeBand, IslandId, SkillId } from '../../src/content/schemas';
import { advanceOnWin } from '../../src/engine/mastery';
import { maxGradeForBand } from '../../src/engine/placement';
import { chartNodes } from '../../src/services/chart';
import { encounterSkillFor } from '../../src/services/encounter';
import { rangeSkills } from '../../src/services/range';
import { deriveRivalLoadout } from '../../src/services/rivalLoadout';
import { trainingCatalog } from '../../src/services/trainingCatalog';
import { TEMPLATE_POOLS } from '../../src/services/templatePools';
import { emptyCaptain } from '../../src/stores/player';
import type { Captain } from '../../src/stores/player';
import { MASTERY_THRESHOLD_CORRECT } from '../../src/engine/tuning';

const BANDS: readonly GradeBand[] = ['k_1', 'g2_3', 'g4_5'];

/** The chain, in `requiresIsland` order — used to drive entry-cannon grants per arrival. */
const CHAIN: readonly IslandId[] = [
  'port_sumwich',
  'isla_products',
  'quotient_cove',
  'fraction_reef',
  'grandline',
];

/** The two ways multiplication or division can reach a child: the glyph, and the word. */
const OPERATOR_GLYPHS = /[×÷]/;
const OPERATOR_WORDS = /\b(multipl(y|ied|ies|ication)|times|divid(e|ed|es)|division)\b/i;

/**
 * A captain at `band` with `mastered` fully mastered and everything else untouched.
 *
 * `isMastered` needs BOTH `weightedCorrect >= MASTERY_THRESHOLD_CORRECT` and accuracy above a floor,
 * so a fixture that only sets the weighted total silently fails the accuracy half — `correct` and
 * `attempts` are what accuracy divides. Set all three, perfectly, so the fixture cannot be the reason
 * a test goes red.
 */
function captainWith(band: GradeBand, mastered: readonly SkillId[]): Captain {
  const base = emptyCaptain();
  const n = MASTERY_THRESHOLD_CORRECT * 4;
  const mastery = Object.fromEntries(
    mastered.map((id) => [id, { weightedCorrect: n, correct: n, attempts: n }]),
  );
  return {
    ...base,
    gradeBand: band,
    // Every island open, so `cleared` is measured rather than masked by fog.
    unlockedIslands: islands.map((i) => i.id),
    currentIsland: 'port_sumwich',
    mastery: mastery as Captain['mastery'],
  };
}

/** The skills an island teaches THIS band (its cell), filtered by the ceiling tripwire. */
function inBandSkills(islandId: IslandId, band: GradeBand): readonly SkillId[] {
  const maxGrade = maxGradeForBand(band);
  return islandCurriculumFor(islandId, band).skills.filter((s) => getSkill(s).minGrade <= maxGrade);
}

describe('A-051 grade-band ceiling', () => {
  it('spec(A-051:AC-1) the green check is REACHABLE for every band on every island it can teach', () => {
    // The regression, stated as the property it violated: if a band can be taught an island at all,
    // then mastering everything that band is offered there must clear it.
    for (const band of BANDS) {
      for (const island of islands) {
        const reachable = inBandSkills(island.id, band);
        if (reachable.length === 0) continue;

        const node = chartNodes(captainWith(band, reachable)).find((n) => n.island.id === island.id);
        expect(
          node?.cleared,
          `${island.id} is unclearable at ${band}: mastered all ${reachable.length} in-band ` +
            `skill(s) [${reachable.join(', ')}] and it still did not tick. The island's ${band} ` +
            `cell teaches [${islandCurriculumFor(island.id, band).skills.join(', ')}].`,
        ).toBe(true);
      }
    }
  });

  it('spec(A-051:AC-1) K-1 clears Port Sumwich without the out-of-band two_step_add_sub', () => {
    // The exact reported case, pinned as its own test so the failure message names the child.
    const reachable = inBandSkills('port_sumwich', 'k_1');
    expect(reachable).not.toContain('two_step_add_sub');
    expect(getSkill('two_step_add_sub').minGrade).toBeGreaterThan(maxGradeForBand('k_1'));

    const node = chartNodes(captainWith('k_1', reachable)).find((n) => n.island.id === 'port_sumwich');
    expect(node?.cleared).toBe(true);
  });

  it('spec(A-070:AC-2) no cell is empty at any band — the vacuous-truth guard has nothing left to bite on', () => {
    // Pre-D-14 this test drove `[].every(...) === true` through quotient_cove@k_1, an island with
    // nothing in band. Under the atlas that STATE no longer exists — every island teaches every
    // band at least one in-ceiling skill (A-069's validator law) — so the successor pins the law
    // at the consumer: 15 cells, none empty, and none ticked without mastery. The guard survives
    // in `chartNodes` for the corrupt-catalog case the validator cannot see at runtime.
    for (const band of BANDS) {
      for (const island of islands) {
        expect(inBandSkills(island.id, band).length, `${island.id}@${band} cell is empty`).toBeGreaterThan(0);
      }
      const node = chartNodes(captainWith(band, [])).find((n) => n.island.id === 'quotient_cove');
      expect(node?.cleared, `${band} ticked quotient_cove with no mastery`).toBe(false);
    }
  });

  it('spec(A-051:AC-2) mastering nothing clears nothing, at every band', () => {
    for (const band of BANDS) {
      const cleared = chartNodes(captainWith(band, [])).filter((n) => n.cleared);
      expect(
        cleared.map((n) => n.island.id),
        `${band} ticked an island with no mastery`,
      ).toEqual([]);
    }
  });

  it('spec(A-051:AC-3) the gun deck operator row is gated by band, and its grades match the catalog', () => {
    const source = fileURLToPath(new URL('../../app/gun-deck.tsx', import.meta.url));
    const text = readFileSync(source, 'utf8');

    // It must not be a flat literal any more, and it must consult the band.
    expect(text).not.toMatch(/const OPERATIONS[^=]*=\s*\['\+', '−', '×', '÷'\]/);
    expect(text).toMatch(/maxGradeForBand/);
    expect(text).toMatch(/OPERATION_MIN_GRADE/);

    // The grade each operator claims must be the lowest minGrade of a catalog skill using it — so
    // the chip appears exactly when the curriculum does, rather than at a hand-picked number.
    const declared = [...text.matchAll(/\{\s*glyph:\s*'(.)',\s*minGrade:\s*(\d+)\s*\}/g)].map(
      (m) => [m[1]!, Number(m[2])] as const,
    );
    expect(declared.length).toBeGreaterThanOrEqual(4);

    const lowestFor = (test: (id: SkillId) => boolean): number =>
      Math.min(...skills.filter((s) => test(s.id)).map((s) => s.minGrade));

    const expected: Readonly<Record<string, number>> = {
      '+': lowestFor((id) => id.startsWith('add_')),
      '−': lowestFor((id) => id.startsWith('sub_')),
      '×': lowestFor((id) => id.startsWith('mult_')),
      '÷': lowestFor((id) => id.startsWith('div_')),
    };

    for (const [glyph, grade] of declared) {
      const want = expected[glyph];
      if (want === undefined) continue;
      expect(grade, `${glyph} is declared at grade ${grade}; the catalog introduces it at ${want}`).toBe(
        want,
      );
    }
  });

  it('spec(A-051:AC-3) K-1 sees no multiplication or division anywhere it is offered a choice', () => {
    // Belt and braces on the thing the owner actually reported: at K-1 the reachable curriculum
    // contains no × or ÷ skill at all, so any surface showing one is showing it from a literal.
    const maxGrade = maxGradeForBand('k_1');
    const reachable = skills.filter((s) => s.minGrade <= maxGrade).map((s) => s.id);
    expect(reachable.some((id) => id.startsWith('mult_'))).toBe(false);
    expect(reachable.some((id) => id.startsWith('div_'))).toBe(false);
  });

  it('spec(A-051:AC-3) spec(A-060:AC-2) no K-1 template PRINTS multiplication, whatever its skill is called', () => {
    // The test above measures skill IDS. That is a NAMING CONVENTION, not a guarantee, and A-060
    // is the case that proves it: `repeated_addition` is grade-1 grouping content — the K-1 rung of
    // Isla Products — and it walks straight past a `startsWith('mult_')` check. Multiplication
    // arriving early under an innocent id would be invisible to every assertion in this file.
    //
    // So the same claim is made again over the authored CORPUS, where it is a statement about what
    // a five-year-old actually sees on the glass rather than about how a skill was named.
    const maxGrade = maxGradeForBand('k_1');
    const reachable = skills.filter((s) => s.minGrade <= maxGrade);
    expect(reachable.length, 'K-1 is served no curriculum at all').toBeGreaterThan(1);

    let inspected = 0;
    for (const skill of reachable) {
      const pool = TEMPLATE_POOLS[skill.id];
      expect(pool.length, `${skill.id} is offered at K-1 with no authored templates`).toBeGreaterThan(0);
      expect(skill.displayName, `${skill.id}'s own name shows an operator`).not.toMatch(OPERATOR_GLYPHS);
      expect(skill.displayName, `${skill.id}'s own name says multiply/divide/times`).not.toMatch(
        OPERATOR_WORDS,
      );
      for (const template of pool) {
        expect(
          template.text,
          `${skill.id}/${template.id} prints an operator the K-1 curriculum has not introduced`,
        ).not.toMatch(OPERATOR_GLYPHS);
        expect(
          template.text,
          `${skill.id}/${template.id} names multiplication or division in words`,
        ).not.toMatch(OPERATOR_WORDS);
        inspected += 1;
      }
    }
    expect(inspected, 'no template was inspected').toBeGreaterThan(reachable.length);

    // Non-vacuity, and the reason this is a CEILING rather than a corpus that happens to be clean:
    // the glyphs really are in the corpus, and every file carrying one sits above the K-1 ceiling.
    const carriers = skills.filter((s) => TEMPLATE_POOLS[s.id].some((t) => OPERATOR_GLYPHS.test(t.text)));
    expect(carriers.length, 'no template anywhere prints × or ÷ — this test measures nothing').toBeGreaterThan(
      0,
    );
    for (const skill of carriers) expect(skill.minGrade).toBeGreaterThan(maxGrade);
  });

  it('spec(A-051:AC-1) spec(A-060:AC-1) Isla Products is reachable at K-1, and clearable there', () => {
    // The A-060 complaint, in this file's own vocabulary. `inBandSkills` returning `[]` here is
    // exactly the state that made `resolveUnlocks` return `[]` forever: an island whose whole
    // curriculum sits above the band is an island the band can never be granted.
    const reachable = inBandSkills('isla_products', 'k_1');
    expect(
      reachable.length,
      'Isla Products teaches a k_1 captain nothing — there is no content between grade 1 and grade 3',
    ).toBeGreaterThan(0);
    // ...and it is reachable because a LOWER rung was authored, not because the ceiling moved.
    expect(reachable).not.toContain('mult_facts');
    for (const id of reachable) expect(getSkill(id).minGrade).toBeLessThanOrEqual(maxGradeForBand('k_1'));

    const node = chartNodes(captainWith('k_1', reachable)).find((n) => n.island.id === 'isla_products');
    expect(node?.cleared).toBe(true);

    // D-14 finished what A-060 started: the island AFTER it now teaches K-1 its own cell too —
    // the old `[]` here was the scoped first cut, and the atlas closed the gap.
    expect(inBandSkills('quotient_cove', 'k_1').length).toBeGreaterThan(0);
  });
});

describe('A-051 the chart labels an island with what THIS captain will be asked', () => {
  it('spec(A-051:AC-4) a K-1 captain never sees × or ÷ on the map, even on an island that teaches them', async () => {
    const { chartNodes, islandGlyphForCaptain } = await import('../../src/services/chart');
    const { commitGradeBand } = await import('../../src/services/onboarding');
    const { createCaptainStore } = await import('../../src/stores/player');

    // The hole this closes. `board.ts`'s `islandGlyph` is the BOARD's label — Isla Products is `×`
    // because the drawing says so, and that was true while an island taught one thing to everybody.
    // Once it started teaching repeated addition at K-1, a five-year-old could sail to an island the
    // chart captioned with the one symbol A-051 exists to keep away from them.
    const store = createCaptainStore();
    commitGradeBand(store, 'k_1');
    const captain = { ...store.getState().captain, unlockedIslands: ['port_sumwich', 'isla_products'] as const };

    const nodes = chartNodes({ ...captain, unlockedIslands: [...captain.unlockedIslands] });

    // EVERY node, fogged included — RE-BASELINED under D-14. The pre-atlas rule kept the board's
    // own glyph on fogged nodes ("anticipation is the whole point of a map"), which left `÷` on a
    // K-1 captain's Quotient Cove. Under the atlas the anticipation IS band-true: the fogged node
    // promises the island's OWN K-1 cell (Port Twenty, `+`), so no node on a five-year-old's map —
    // reachable or promised — ever shows the symbol A-051 exists to keep away from them.
    expect(nodes.filter((node) => !node.fogged).length, 'nothing enterable — the sweep would pass vacuously').toBeGreaterThan(1);
    for (const node of nodes) {
      expect(node.glyph, `${node.island.id} shows ${node.glyph} on a K-1 map`).not.toMatch(/[×÷]/);
    }

    // The fogged successor now carries ITS band-true promise — the `+` of add_within_20, never
    // the board's `÷`.
    expect(nodes.find((n) => n.island.id === 'quotient_cove')?.glyph).toBe('+');

    // Non-vacuous: the same chart position really does show ×/÷ to a band that will be asked it —
    // the glyph is the cell's FIRST skill (D-14: the headline, the glyph source, the entry-cannon
    // skill) — so this is measuring the band, not an absence of glyphs everywhere.
    expect(islandGlyphForCaptain('isla_products', 'k_1')).toBe('−');
    expect(islandGlyphForCaptain('isla_products', 'g4_5')).toBe('×');
    expect(islandGlyphForCaptain('quotient_cove', 'g4_5')).toBe('÷');
  });
});

describe('A-051 the game loop hands you a gun for the island it opens', () => {
  it('spec(A-051:AC-5) earning an island grants one in-band cannon that can ask its questions', async () => {
    const { applyCaptainTally, createCaptainStore } = await import('../../src/stores/player');
    const { commitGradeBand } = await import('../../src/services/onboarding');
    const { asksInBand } = await import('../../src/services/loadout');

    // Driven through `applyCaptainTally`, which is what a real win goes through — it applies the
    // unlock delta itself, so this measures the captain the game actually produces rather than a
    // delta computed beside it.
    const store = createCaptainStore();
    commitGradeBand(store, 'k_1');
    let captain = store.getState().captain;
    const before = new Set(captain.ownedCannons);
    expect(captain.unlockedIslands).toEqual(['port_sumwich']);

    let wins = 0;
    while (wins < 8 && !captain.unlockedIslands.includes('isla_products')) {
      captain = applyCaptainTally(captain, 'add_within_10', 'duel', { correct: 4, asked: 4 });
      wins += 1;
    }

    expect(captain.unlockedIslands, 'the second island never opened').toContain('isla_products');
    expect(wins, 'a five-year-old should not grind for this').toBeLessThanOrEqual(4);

    // D-14: the entry list read is the BAND'S OWN CELL (`islandCurriculumFor`) — the shared
    // `island.unlocksCannons` no longer exists, and the gun that lands is the one the island
    // pays THIS band, whose skill the island teaches THIS band.
    const cell = islandCurriculumFor('isla_products', 'k_1');
    const gained = captain.ownedCannons.filter((id) => !before.has(id));
    const entry = gained.filter((id) => cell.unlocksCannons.includes(id));
    expect(entry, 'earning the island granted no cannon of its own, or granted several').toHaveLength(1);

    // It must be a gun the duel will actually arm. An out-of-band grant is a reward the tray
    // refuses (A-058) — celebrated on one screen and denied on the next.
    const gun = getCannon(entry[0]!);
    expect(asksInBand(gun, 'k_1'), `${gun.id} cannot be fired at k_1`).toBe(true);
    expect(cell.skills).toContain(gun.skill);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A-070 AC-2 — the ceiling holds everywhere it used to, restated: the living 15-cell sweep
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// D-14 moved the ceiling from the map into the curriculum; this sweep is the A-060 tripwire
// reborn. For every band × island (15 cells), every migrated door is opened with the CAPTAIN'S
// band and everything that comes through it is measured against the band's ceiling. One call
// site hardcoding another band's cell — the exact mutation A-070's verification demands go red —
// fails below with the cell named.

describe('A-070 AC-2 — the 15-cell ceiling sweep', () => {
  /** A placed captain shaped like the app produces, holding the whole map open. */
  function placedCaptain(band: GradeBand): Captain {
    return {
      ...emptyCaptain(),
      gradeBand: band,
      unlockedIslands: islands.map((i) => i.id),
      currentIsland: 'port_sumwich',
    };
  }

  it('spec(A-070:AC-2) every drill skill, rival gun, entry-cannon grant, and encounter skill sits at or under the band ceiling — all 15 cells', () => {
    for (const band of BANDS) {
      const ceiling = maxGradeForBand(band);
      const captain = placedCaptain(band);

      for (const island of islands) {
        const at = `${island.id}@${band}`;

        // Drills: the range offers the band's cell, whole and in-ceiling.
        const drills = rangeSkills(island.id, band);
        expect(drills.length, `${at}: no drills`).toBeGreaterThan(0);
        expect(drills, at).toEqual([...islandCurriculumFor(island.id, band).skills]);
        for (const skill of drills) {
          expect(getSkill(skill).minGrade, `${at} drill ${skill}`).toBeLessThanOrEqual(ceiling);
        }

        // The rival's tray: guns whose skills the island teaches THIS band, all in band.
        const rival = deriveRivalLoadout(captain, island.id);
        expect(rival.length, `${at}: rival has no gun`).toBeGreaterThan(0);
        for (const id of rival) {
          const gun = getCannon(id);
          expect(gun.minGrade, `${at} rival gun ${id}`).toBeLessThanOrEqual(ceiling);
          expect(islandCurriculumFor(island.id, band).skills, `${at} rival gun ${id} skill`).toContain(
            gun.skill,
          );
        }

        // The encounter's greeting: the band's own cell, never above the ceiling.
        const greeting = encounterSkillFor(island.id, band);
        expect(greeting, `${at}: the host has no riddle`).not.toBeNull();
        expect(getSkill(greeting!).minGrade, `${at} encounter ${greeting}`).toBeLessThanOrEqual(ceiling);
        expect(islandCurriculumFor(island.id, band).skills, at).toContain(greeting);
      }

      // Entry-cannon grants: each of the four arrivals, one in-band gun from the band's cell.
      for (let step = 0; step < CHAIN.length - 1; step += 1) {
        const at = CHAIN[step]!;
        const opens = CHAIN[step + 1]!;
        const delta = advanceOnWin(at, band, CHAIN.slice(0, step + 1), []);
        expect(delta.islands, `${band} win at ${at}`).toEqual([opens]);
        expect(delta.cannons, `${band} arrival ${opens}`).toHaveLength(1);
        const gun = getCannon(delta.cannons[0]!);
        expect(gun.minGrade, `${band} entry gun ${gun.id} at ${opens}`).toBeLessThanOrEqual(ceiling);
        expect(islandCurriculumFor(opens, band).unlocksCannons).toContain(gun.id);
      }

      // The training menu unions exactly the band's cells across unlocked islands — nothing more.
      const offered = trainingCatalog({
        unlockedIslands: captain.unlockedIslands,
        currentIsland: captain.currentIsland,
        gradeBand: band,
      }).flatMap((group) => group.entries.map((entry) => entry.skillId));
      for (const skill of offered) {
        expect(getSkill(skill).minGrade, `${band} menu offers ${skill}`).toBeLessThanOrEqual(ceiling);
      }
    }
  });

  it("spec(A-070:AC-2) a K-1 captain's rendered questions never contain × or ÷ — proven on ALL FIVE islands", () => {
    // The symbol ban, measured on what the glass would show: every template of every skill any
    // K-1 door can serve (drill, rival gun, encounter), across the whole map.
    const askable = new Set<SkillId>();
    const captain = placedCaptain('k_1');
    for (const island of islands) {
      for (const skill of rangeSkills(island.id, 'k_1')) askable.add(skill);
      for (const id of deriveRivalLoadout(captain, island.id)) askable.add(getCannon(id).skill);
      const greeting = encounterSkillFor(island.id, 'k_1');
      if (greeting !== null) askable.add(greeting);
    }
    expect(askable.size, 'no K-1 skill is askable anywhere — vacuous').toBeGreaterThan(2);

    for (const skill of askable) {
      for (const template of TEMPLATE_POOLS[skill]) {
        expect(template.text, `${skill}/${template.id} on a K-1 island`).not.toMatch(OPERATOR_GLYPHS);
        expect(template.text, `${skill}/${template.id} on a K-1 island`).not.toMatch(OPERATOR_WORDS);
      }
    }
  });

  it('spec(A-070:AC-5) null and corrupt bands fail closed at every migrated door — no drill, no menu, no encounter skill, no rival gun, no unlock', () => {
    const nullish: readonly (null | undefined)[] = [null, undefined];
    for (const band of nullish) {
      expect(rangeSkills('port_sumwich', band)).toEqual([]);
      expect(encounterSkillFor('port_sumwich', band)).toBeNull();
      expect(
        trainingCatalog({ unlockedIslands: ['port_sumwich'], currentIsland: 'port_sumwich', gradeBand: band }),
      ).toEqual([]);
    }
    // Corrupt band strings a save can carry: same closed answers, never a throw on the offer path.
    const corrupt = 'grade_9' as unknown as GradeBand;
    expect(rangeSkills('port_sumwich', corrupt)).toEqual([]);
    expect(encounterSkillFor('port_sumwich', corrupt)).toBeNull();
    expect(
      trainingCatalog({ unlockedIslands: ['port_sumwich'], currentIsland: 'port_sumwich', gradeBand: corrupt }),
    ).toEqual([]);

    // The rival gun and the win-advance fail closed too — loudly and emptily respectively, both
    // the postures their modules document.
    expect(() =>
      deriveRivalLoadout({ ...emptyCaptain(), gradeBand: null }, 'port_sumwich'),
    ).toThrowError(RangeError);
    expect(advanceOnWin('port_sumwich', null, ['port_sumwich'], [])).toEqual({ islands: [], cannons: [] });
  });
});
