/**
 * A-059 — the drills the range OFFERS never exceed the band picked at onboarding.
 *
 * A-058 proved the same thing for the duel and found a real leak doing it: the ceiling was carried
 * entirely by ACQUISITION gates, one of them forgot, and a K-1 captain who won a single duel could
 * be asked *"How many tens are in 807?"*. That was reproduced by DRIVING THE REAL PATH rather than
 * by reading the code, and this file applies the same standard to practice — because reading the
 * range's code is genuinely reassuring and reassurance is exactly what A-058 disproved.
 *
 * The range's leak surfaces are different from the duel's and each is probed on purpose:
 *
 *  1. **An island can teach a skill its own captain may not be asked.** Port Sumwich's
 *     `rangeSkills` are `[add_within_10, add_within_20, sub_within_20, two_step_add_sub]` and the
 *     last is `minGrade: 2`. It is the FIRST island, so every K-1 captain in the game stands on it,
 *     and an unfiltered `rangeSkills` read would put a grade-2 rack on their first screen. This is
 *     also the exact shape of A-051's other bug, where `chartNodes` measured `cleared` against all
 *     four and made the green check unreachable at K-1.
 *  2. **Mastery unlocks more range.** Clearing a rack can grant a cannon and lift an island's fog,
 *     and a newly-unfogged island brings its own `rangeSkills` with it. So the sweep does not test
 *     a fresh captain — it GRINDS every in-band rack to mastery, repeatedly, and re-enumerates.
 *  3. **A captain can have no band at all, or a corrupt one.** `engine/mastery.ts:121` reads an
 *     absent band as `POSITIVE_INFINITY`, the opposite of failing closed, and `persistence.ts`
 *     accepts any `typeof 'string'` as a band and passes it through `normalizeCaptain` untouched.
 *     Both are driven here, through `hydrate`, with a real serialised save.
 *  4. **"No out-of-band drill" is satisfied by offering nothing.** Every sweep carries non-vacuity
 *     counters: racks offered, distinct skills reached, questions actually generated.
 *  5. **Asserting the rack list is not asserting the question.** The thing in front of the child is
 *     a prompt. Every band assertion below reads the QUESTION a drill really produced — its skill
 *     and its rendered text — not the menu it came from.
 *
 * Nothing here renders a screen: vitest runs in node and React Native's entry point is Flow-typed.
 * The one clause that lives only in `app/range.tsx` — that the screen has no second path to a
 * question — is asserted against its source, the A-001 AC-7 pattern.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getIsland, getSkill, islands, skills } from '@content/index';
import type { GradeBand, IslandId, SkillId } from '@content/schemas';
import { GRADE_BANDS } from '@content/schemas';
import { answerDrill, type DrillSession } from '@engine/drill';
import { maxGradeForBand } from '@engine/placement';
import { createRng } from '@engine/rng';

import { commitGradeBand } from '../../src/services/onboarding';
import { hydrate, SCHEMA_VERSION, STORAGE_KEY } from '../../src/services/persistence';
import { openDrill, rangeSkills, skillInBand } from '../../src/services/range';
import { trainingCatalog } from '../../src/services/trainingCatalog';
import { createCaptainStore, type Captain, type CaptainStore } from '../../src/stores/player';

const BANDS: readonly GradeBand[] = GRADE_BANDS;
const SEEDS: readonly number[] = [11, 2_003, 65_521];

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relative}`, import.meta.url)), 'utf8');
}

/** A captain placed the way `app/onboarding.tsx` places one — through `commitGradeBand`. */
function onboarded(band: GradeBand): CaptainStore {
  const store = createCaptainStore();
  commitGradeBand(store, band);
  // Non-vacuity on the fixture itself: if onboarding ever stopped committing, every sweep below
  // would silently be measuring an empty captain.
  expect(store.getState().captain.gradeBand, `commitGradeBand(${band}) did not stick`).toBe(band);
  expect(store.getState().captain.unlockedIslands.length).toBeGreaterThan(0);
  return store;
}

/**
 * Exactly what `app/range.tsx`'s picker puts on screen, for a given captain.
 *
 * Deliberately built from `trainingCatalog` with the captain's OWN fields, in the same shape the
 * screen calls it — a helper that took a hand-picked island list would be measuring this test's
 * imagination rather than the screen's behaviour.
 */
function racksOffered(captain: Captain): readonly { islandId: IslandId; skillId: SkillId }[] {
  return trainingCatalog({
    unlockedIslands: captain.unlockedIslands,
    currentIsland: captain.currentIsland,
    gradeBand: captain.gradeBand,
  }).flatMap((group) => group.entries.map((entry) => ({ ...entry })));
}

/** Every question one drill really generates, driven to completion through the real engine. */
function questionsAsked(session: DrillSession): readonly { text: string; skill: SkillId }[] {
  const asked: { text: string; skill: SkillId }[] = [];
  let live = session;
  let guard = 0;
  while (!live.complete && guard < 200) {
    const current = live.current;
    if (current === null) throw new Error('range-band-drills: a live drill carried no question');
    asked.push({ text: current.text, skill: current.skill });
    live = answerDrill(live, current.correctIndex, 500);
    guard += 1;
  }
  return asked;
}

/** Asserts one question is inside `band`, by its skill's minGrade and by the glyphs it renders. */
function expectInBand(
  question: { readonly text: string; readonly skill: SkillId },
  band: GradeBand,
  where: string,
): void {
  const ceiling = maxGradeForBand(band);
  expect(
    getSkill(question.skill).minGrade,
    `${where}: asked '${question.text}' (${question.skill}, minGrade ` +
      `${getSkill(question.skill).minGrade}) to a ${band} captain whose ceiling is grade ${ceiling}`,
  ).toBeLessThanOrEqual(ceiling);

  // The glyphs are the reported SYMPTOM, checked as well and never instead: `two_step_add_sub` is
  // above the K-1 ceiling and contains no operator glyph at all, so a × / ÷ check alone would miss
  // the exact leak this file exists to close.
  for (const [glyph, minGrade] of GLYPH_MIN_GRADE) {
    if (minGrade <= ceiling) continue;
    expect(
      question.text.includes(glyph),
      `${where}: showed '${glyph}' to a ${band} captain — the curriculum introduces it at grade ${minGrade}`,
    ).toBe(false);
  }
}

/**
 * The lowest grade at which each operator glyph can appear, DERIVED from the skill catalog rather
 * than written down. A catalog edit that introduced `×` earlier moves this expectation with it.
 */
const GLYPH_MIN_GRADE: ReadonlyMap<string, number> = new Map([
  ['×', Math.min(...skills.filter((s) => s.id.startsWith('mult_')).map((s) => s.minGrade))],
  ['÷', Math.min(...skills.filter((s) => s.id.startsWith('div_')).map((s) => s.minGrade))],
]);

/** Grinds every rack a captain is offered, to mastery, `rounds` times over — unlocks and all. */
function grind(store: CaptainStore, rounds: number): void {
  for (let round = 0; round < rounds; round += 1) {
    for (const rack of racksOffered(store.getState().captain)) {
      let live = openDrill({
        islandId: rack.islandId,
        skillId: rack.skillId,
        captain: store.getState().captain,
        rng: createRng(round * 7919 + 13),
        length: 10,
      });
      while (!live.complete) live = answerDrill(live, live.current!.correctIndex, 400);
      store.getState().recordRangeAnswers(rack.skillId, { correct: live.correct, asked: live.answered });
    }
  }
}

describe('A-059 the range offers only in-band drills', () => {
  // ── AC-1 — the menu ─────────────────────────────────────────────────────────────────────────

  it('spec(A-059:AC-1) every rack a real captain is offered is inside their band, at every band', () => {
    let offered = 0;
    const skillsSeen = new Set<SkillId>();

    for (const band of BANDS) {
      const captain = onboarded(band).getState().captain;
      const racks = racksOffered(captain);
      expect(racks.length, `${band} was offered nothing to practise`).toBeGreaterThan(0);

      for (const rack of racks) {
        expect(
          getSkill(rack.skillId).minGrade,
          `${band} was offered ${rack.skillId} (minGrade ${getSkill(rack.skillId).minGrade}) at ` +
            `${rack.islandId}, above its grade ${maxGradeForBand(band)} ceiling`,
        ).toBeLessThanOrEqual(maxGradeForBand(band));
        // ...and the island really does teach it. A band filter that also widened the menu would
        // pass the line above and still put a rack on an island that does not run it.
        expect(getIsland(rack.islandId).rangeSkills).toContain(rack.skillId);
        skillsSeen.add(rack.skillId);
        offered += 1;
      }
    }

    // Non-vacuity: the sweep really reached more than one skill and more than one band's worth.
    expect(offered).toBeGreaterThan(BANDS.length);
    expect(skillsSeen.size).toBeGreaterThan(1);
  });

  it('spec(A-059:AC-1) a K-1 captain is never offered the grade-2 rack their own first island teaches', () => {
    // The reported shape, pinned on its own so a failure names the child rather than a sweep.
    // Port Sumwich is where every captain starts and one of the four skills it teaches is above
    // the K-1 ceiling — the same asymmetry that made A-051's green check unreachable.
    const island = getIsland('port_sumwich');
    expect(island.rangeSkills).toContain('two_step_add_sub');
    expect(getSkill('two_step_add_sub').minGrade).toBeGreaterThan(maxGradeForBand('k_1'));

    const captain = onboarded('k_1').getState().captain;
    expect(captain.unlockedIslands).toContain('port_sumwich');

    const racks = racksOffered(captain);
    expect(racks.map((r) => r.skillId)).not.toContain('two_step_add_sub');
    // ...and the three that remain really are the island's other three, so the filter removed one
    // thing rather than everything.
    expect(racks.map((r) => r.skillId)).toEqual(['add_within_10', 'add_within_20', 'sub_within_20']);
  });

  it('spec(A-059:AC-1) a K-1 captain is never offered multiplication or division, from any island', () => {
    const captain = onboarded('k_1').getState().captain;
    for (const rack of racksOffered(captain)) {
      expect(rack.skillId.startsWith('mult_')).toBe(false);
      expect(rack.skillId.startsWith('div_')).toBe(false);
    }
    // ...and the ceiling is the reason, not an accident of what K-1 happens to have unlocked: the
    // catalog HAS × and ÷ skills and they all sit above grade 1.
    const beyond = skills.filter((s) => s.id.startsWith('mult_') || s.id.startsWith('div_'));
    expect(beyond.length).toBeGreaterThan(0);
    for (const skill of beyond) expect(skill.minGrade).toBeGreaterThan(maxGradeForBand('k_1'));
  });

  // ── AC-2 — the question, not the menu ───────────────────────────────────────────────────────

  it('spec(A-059:AC-2) every question every offered rack really generates is inside the band', () => {
    let asked = 0;
    const skillsSeen = new Set<SkillId>();

    for (const band of BANDS) {
      const captain = onboarded(band).getState().captain;
      for (const rack of racksOffered(captain)) {
        for (const seed of SEEDS) {
          const session = openDrill({
            islandId: rack.islandId,
            skillId: rack.skillId,
            captain,
            rng: createRng(seed),
            length: 6,
          });
          const questions = questionsAsked(session);
          expect(questions.length, `${band}/${rack.skillId} asked nothing`).toBeGreaterThan(0);
          for (const question of questions) {
            expectInBand(question, band, `${band}@${rack.islandId}`);
            // The question really came from the rack that was tapped — a generator reaching a
            // neighbouring pool would be in band by luck rather than by rule.
            expect(question.skill).toBe(rack.skillId);
            skillsSeen.add(question.skill);
            asked += 1;
          }
        }
      }
    }

    expect(asked).toBeGreaterThan(BANDS.length * SEEDS.length);
    expect(skillsSeen.size).toBeGreaterThan(1);
  });

  // ── AC-3 — mastery opens more range, and the ceiling travels with it ─────────────────────────

  it('spec(A-059:AC-3) grinding every rack to mastery never opens an out-of-band one', () => {
    // A fresh captain is in band BY CONSTRUCTION — `resolvePlacement` is band-gated — so a suite
    // that only ever measures one would be measuring placement and would pass with no range gate
    // whatsoever. This is the A-058 trap, restated for practice: the captain has to have EARNED
    // their way forward before the menu is worth reading.
    for (const band of BANDS) {
      const store = onboarded(band);
      const before = racksOffered(store.getState().captain).length;

      grind(store, 4);

      const after = store.getState().captain;
      const racks = racksOffered(after);
      for (const rack of racks) {
        expect(
          getSkill(rack.skillId).minGrade,
          `${band} ground its way to ${rack.skillId} at ${rack.islandId}`,
        ).toBeLessThanOrEqual(maxGradeForBand(band));
      }
      // ...and every island the grind unfogged is one this band can actually train at, so the
      // sweep is not passing because nothing opened.
      for (const islandId of after.unlockedIslands) {
        const inBand = getIsland(islandId).rangeSkills.filter((s) => skillInBand(s, band));
        expect(
          inBand.length,
          `${band} unlocked ${islandId}, which teaches it nothing it may be asked`,
        ).toBeGreaterThan(0);
      }
      expect(racks.length).toBeGreaterThanOrEqual(before);
      expect(after.ownedCannons.length).toBeGreaterThan(0);
    }
  });

  it('spec(A-059:AC-3) a K-1 captain who masters everything they can still never reaches × or ÷', () => {
    const store = onboarded('k_1');
    grind(store, 6);
    const captain = store.getState().captain;

    let asked = 0;
    for (const rack of racksOffered(captain)) {
      const session = openDrill({
        islandId: rack.islandId,
        skillId: rack.skillId,
        captain,
        rng: createRng(SEEDS[0]!),
        length: 8,
      });
      for (const question of questionsAsked(session)) {
        expect(question.text).not.toMatch(/[×÷]/);
        expectInBand(question, 'k_1', 'k_1 after grinding');
        asked += 1;
      }
    }
    expect(asked).toBeGreaterThan(0);
    // Every cannon a K-1 grind can earn is one whose own skill K-1 may be asked — a range unlock
    // that granted an over-grade gun would put it on the deck, which is A-058's territory.
    for (const cannonId of captain.ownedCannons) {
      expect(captain.ownedCannons.filter((id) => id === cannonId).length).toBe(1);
    }
  });

  // ── AC-4 — no band, and a corrupt one ───────────────────────────────────────────────────────

  it('spec(A-059:AC-4) a captain with no band is offered nothing, rather than everything', () => {
    // `engine/mastery.ts:121` reads an absent band as `POSITIVE_INFINITY`, which is safe THERE only
    // because a skill must be mastered before it unlocks anything. The same reading in the menu is
    // the whole catalog, division included, in front of a child the app has not placed yet. So the
    // decision made here is explicit: no band, no drills — and the screen answers that with its
    // "No drills ready" panel and the way back to the chart, which is a state a child can act on.
    const bandless: Captain = {
      ...onboarded('g4_5').getState().captain,
      gradeBand: null,
    };
    expect(bandless.unlockedIslands.length).toBeGreaterThan(1);
    expect(racksOffered(bandless)).toEqual([]);

    for (const skill of skills) {
      expect(skillInBand(skill.id, null)).toBe(false);
      expect(skillInBand(skill.id, undefined)).toBe(false);
    }
  });

  it('spec(A-059:AC-4) a save carrying a band name this build does not know offers nothing, and does not crash', () => {
    // Reachable, and driven through the REAL storage path rather than asserted about it:
    // `isBaseCaptain` accepts any `typeof 'string'` as a band and `normalizeCaptain` passes it
    // through untouched, so a band an older build spelled differently survives hydration intact.
    // Before this ticket that value reached `maxGradeForBand`, which THROWS — and the throw landed
    // on the range screen as a crash rather than as the empty state it already knows how to draw.
    return (async () => {
      const placed = onboarded('g4_5').getState().captain;
      const legacy = { ...placed, gradeBand: 'kindergarten' } as unknown as Captain;
      const stored = new Map<string, string>([
        [STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, captain: legacy })],
      ]);
      const result = await hydrate({
        getItem: async (key) => stored.get(key) ?? null,
        setItem: async (key, value) => void stored.set(key, value),
      });

      // The fixture is honest: hydration really did keep the strange band rather than discarding
      // the save, which is what makes the assertion below about the RANGE and not about storage.
      expect(result.recovered).toBe(false);
      expect(result.captain.gradeBand).toBe('kindergarten');
      expect(result.captain.unlockedIslands.length).toBeGreaterThan(1);

      expect(() => racksOffered(result.captain)).not.toThrow();
      expect(racksOffered(result.captain)).toEqual([]);
    })();
  });

  // ── AC-5 — the door refuses whatever the menu missed ─────────────────────────────────────────

  it('spec(A-059:AC-5) openDrill refuses every out-of-band skill, at every band and island', () => {
    // The generalisation of the whole ticket: it does not matter HOW an out-of-band skill reached
    // a caller — a stale menu, a deep link, a dev screen. `openDrill` is what refuses it, so a fix
    // that only tightened `trainingCatalog` fails here.
    let refused = 0;

    for (const band of BANDS) {
      const captain = onboarded(band).getState().captain;
      for (const island of islands) {
        for (const skillId of island.rangeSkills) {
          if (skillInBand(skillId, band)) continue;
          // Asserting `toThrow(RangeError)` alone is NOT enough, and finding that out is the reason
          // this reads the message. `openDrill` has a second refusal — "is not trained at this
          // island" — which is itself band-filtered, so deleting the ceiling check entirely leaves
          // the call still throwing a RangeError for the wrong reason. The message is what proves
          // the CEILING refused rather than the island.
          expect(() =>
            openDrill({ islandId: island.id, skillId, captain, rng: createRng(3), length: 2 }),
          ).toThrow(/grade ceiling/);
          refused += 1;
        }
      }
    }

    // Non-vacuity: there really are out-of-band skills to refuse. If the catalog ever put every
    // skill inside every band this test would be measuring nothing, and would say so.
    expect(refused).toBeGreaterThan(0);
  });

  it('spec(A-059:AC-5) the menu and the door apply the SAME rule, on every skill and band', () => {
    // Two gates that agree today and drift tomorrow are one gate. Stated as the equality rather
    // than as two separate filters, so a change to either side has to move the other.
    for (const band of BANDS) {
      const captain = onboarded(band).getState().captain;
      for (const island of islands) {
        const offered = new Set(
          racksOffered(captain)
            .filter((r) => r.islandId === island.id)
            .map((r) => r.skillId),
        );
        for (const skillId of island.rangeSkills) {
          const opens = (() => {
            try {
              openDrill({ islandId: island.id, skillId, captain, rng: createRng(5), length: 1 });
              return true;
            } catch {
              return false;
            }
          })();
          // A skill can be un-offered because its island is fogged and still be legal to drill, so
          // the implication runs one way: anything OFFERED must open.
          if (offered.has(skillId)) {
            expect(opens, `${band} was offered ${skillId} at ${island.id} and the door refused it`).toBe(
              true,
            );
          }
          if (!skillInBand(skillId, band)) {
            expect(offered.has(skillId)).toBe(false);
            expect(opens).toBe(false);
          }
        }
      }
    }
  });

  it('spec(A-059:AC-5) rangeSkills filters when handed a band and fails closed on a bad one', () => {
    for (const island of islands) {
      for (const band of BANDS) {
        const filtered = rangeSkills(island.id, band);
        expect(filtered).toEqual(island.rangeSkills.filter((s) => skillInBand(s, band)));
      }
      // A null band answers with nothing rather than throwing or with everything.
      expect(rangeSkills(island.id, null)).toEqual([]);
      // ...while the catalog query — no band at all — is still the island's whole authored list.
      expect([...rangeSkills(island.id)]).toEqual([...island.rangeSkills]);
    }
  });

  // ── The screen ──────────────────────────────────────────────────────────────────────────────

  it('spec(A-059:AC-1) the range screen has exactly one path from a tap to a question', () => {
    // The seam A-058 found was a screen going AROUND the one gate. `openDrill` is that gate here,
    // and the guarantee is only worth as much as the claim that nothing else on the screen opens a
    // drill. The screen cannot be rendered under the node runner, so this is asserted against its
    // source (the A-001 AC-7 pattern).
    const src = source('app/range.tsx');

    // Every rack on screen comes from the band-filtered catalog...
    expect(src).toMatch(/trainingCatalog\(\{/);
    // ...and the unfiltered catalog query is never called from the screen at all.
    expect(src).not.toMatch(/\brangeSkills\s*\(/);
    // Exactly one `openDrill(` call site, and it names the pressed entry's own island and skill.
    expect(src.match(/\bopenDrill\s*\(/g) ?? []).toHaveLength(1);
    expect(src).toMatch(/openDrill\(\{\s*islandId:\s*entry\.islandId,\s*skillId:\s*entry\.skillId/s);
    // ...and it hands over the REAL captain, untouched. A call site that spread a forged band into
    // the argument would satisfy every line above while telling the one gate a different story —
    // which is the shape of the seam A-058 found, so it is closed here explicitly.
    expect(src).toMatch(/openDrill\(\{[^}]*captain:\s*captainActions\(\)\.captain,/s);
    expect(src).not.toMatch(/captain:\s*\{\s*\.\.\.captainActions\(\)\.captain/);
    expect(src).not.toMatch(/gradeBand:\s*['"]/);
    // No literal skill id anywhere — a hardcoded fallback is how a gate gets bypassed by accident.
    for (const skill of skills) {
      expect(src, `range.tsx names the skill '${skill.id}' literally`).not.toMatch(
        new RegExp(`['"]${skill.id}['"]`),
      );
    }
  });

  it('spec(A-059:AC-4) the catalog is total over every band value a save can really carry', () => {
    // Typed as the property rather than as three cases: `trainingCatalog` must never throw, for any
    // input, because the only thing above it is a screen.
    const captain = onboarded('g4_5').getState().captain;
    const hostile: readonly unknown[] = [null, undefined, '', 'k1', 'kindergarten', 'K_1', 0, {}, []];
    for (const gradeBand of hostile) {
      expect(() =>
        trainingCatalog({
          unlockedIslands: captain.unlockedIslands,
          currentIsland: captain.currentIsland,
          gradeBand: gradeBand as GradeBand,
        }),
      ).not.toThrow();
      expect(
        trainingCatalog({
          unlockedIslands: captain.unlockedIslands,
          currentIsland: captain.currentIsland,
          gradeBand: gradeBand as GradeBand,
        }),
      ).toEqual([]);
    }
    // ...and the three real bands still return something, so "never throws" is not "always empty".
    for (const band of BANDS) {
      expect(
        trainingCatalog({
          unlockedIslands: captain.unlockedIslands,
          currentIsland: captain.currentIsland,
          gradeBand: band,
        }).length,
      ).toBeGreaterThan(0);
    }
  });
});
