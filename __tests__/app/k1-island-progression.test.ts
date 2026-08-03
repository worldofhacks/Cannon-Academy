/**
 * A-060 — a five-year-old can leave their first island.
 *
 * RE-BASELINED under owner ruling **D-14** (2026-08-02, `tickets/app/OWNER-RULINGS.md`, applied
 * by A-070): five islands for every band, each band its own curriculum.
 *
 * THE ORIGINAL COMPLAINT, VERBATIM: a `k_1` captain masters Port Sumwich and never unlocks
 * anything, ever. A-060's first cut fixed it by giving Isla Products ONE K-1 rung
 * (`repeated_addition`) and pinned the scope: "Quotient Cove still does NOT open". D-14 finishes
 * the model A-060 started — an island is a PLACE, not a difficulty tier — by giving EVERY island
 * a complete cell per band (`islandCurriculumFor`). So the old fixpoint "K-1 reach is exactly
 * two" becomes its five-island successor: every band's reach is exactly five, and the ceiling
 * moves from the map into the curriculum, where A-069's validator enforces it at import.
 *
 * What survives of A-060 unchanged, and is still asserted here:
 *
 *   - The FIRST win opens the next island (D-11), through the real services.
 *   - Nothing a K-1 captain is shown — chart glyph, drill, duel question — prints × or ÷.
 *   - An arrival lands a gun that can actually fire at its island (the anti-circularity rule).
 *
 * Every duel here is driven through `initialDuelStateWithContext` / `duelReducer` /
 * `applyDuelOutcome` — the same three calls `app/duel.tsx` makes — rather than by writing mastery
 * counters into a fixture. A fixture would have proved the arithmetic of `resolveUnlocks` and
 * nothing about whether a child can actually get there.
 */
import { describe, expect, it } from 'vitest';

import { cannons, getCannon, getSkill, islandCurriculumFor, islands } from '@content/index';
import type { GradeBand, IslandId, SkillId } from '@content/schemas';
import { answerDrill } from '@engine/drill';
import { resolveUnlocks, type SkillMastery } from '@engine/mastery';
import { maxGradeForBand, resolvePlacement } from '@engine/placement';
import { generateQuestion } from '@engine/questions/generator';
import { createRng } from '@engine/rng';
import { CHOICE_COUNT, MASTERY_THRESHOLD_CORRECT } from '@engine/tuning';

import { resolveDuelContext } from '../../src/services/duelContext';
import { applyDuelOutcome } from '../../src/services/duelRewards';
import { asksInBand, trayCannons } from '../../src/services/loadout';
import { commitGradeBand } from '../../src/services/onboarding';
import { commitDrill, openDrill, rangeSkills } from '../../src/services/range';
import { deriveRivalLoadout } from '../../src/services/rivalLoadout';
import { TEMPLATE_POOLS } from '../../src/services/templatePools';
import { duelReducer, initialDuelStateWithContext, type DuelState } from '../../src/stores/duel';
import { createCaptainStore, type Captain, type CaptainStore } from '../../src/stores/player';

/** K-1's own rung of island two under the atlas, and the entry gun its arrival pays (D-14). */
const K1_ISLAND_TWO_SKILL: SkillId = 'sub_within_10';
const K1_ISLAND_TWO_CANNON = 'dinghy_gun' as const;

/** A-060's authored skill and gun — still in the catalog, now Quotient Cove's g2_3 cell. */
const A060_SKILL: SkillId = 'repeated_addition';
const A060_CANNON = 'grapeshot' as const;

/** Enough reducer steps for any duel at any island to reach a terminal phase. */
const STEP_CAP = 800;

/** How many duels a five-year-old may be asked to win before the map moves. Small on purpose. */
const PATIENCE_DUELS = 6;

/** The full chain, the reach D-14 promises every band. */
const ALL_FIVE: readonly IslandId[] = [
  'port_sumwich',
  'isla_products',
  'quotient_cove',
  'fraction_reef',
  'grandline',
];

/**
 * The two ways multiplication can reach a child's screen: the glyphs, and the words.
 *
 * Both are checked because the id-prefix heuristic the older ceiling tests use (`startsWith
 * ('mult_')`) is exactly what a skill called `repeated_addition` walks straight past. A skill that
 * teaches multiplication under an innocent name has to fail on what it PRINTS.
 */
const OPERATOR_GLYPHS = /[×÷]/;
const OPERATOR_WORDS = /\b(multipl(y|ied|ies|ication)|times|divid(e|ed|es)|division)\b/i;

/** A mastery over both gates — the shape `isMastered` accepts. */
const MASTERED: SkillMastery = Object.freeze({
  weightedCorrect: MASTERY_THRESHOLD_CORRECT,
  correct: MASTERY_THRESHOLD_CORRECT,
  attempts: MASTERY_THRESHOLD_CORRECT,
});

/** A captain placed the way `app/onboarding.tsx` places one — through `commitGradeBand`. */
function onboarded(band: GradeBand): CaptainStore {
  const store = createCaptainStore();
  commitGradeBand(store, band);
  const captain = store.getState().captain;
  // Non-vacuity on the fixture: a sweep over an unplaced captain would prove nothing at all.
  expect(captain.gradeBand).toBe(band);
  expect(captain.equippedCannons.length).toBeGreaterThan(0);
  expect(captain.unlockedIslands.length).toBeGreaterThan(0);
  return store;
}

function sailTo(store: CaptainStore, islandId: IslandId): void {
  store.getState().replaceCaptain({ ...store.getState().captain, currentIsland: islandId });
}

interface Fought {
  /** Every prompt the duel actually put on screen, in order. */
  readonly asked: readonly { readonly text: string; readonly templateId: string }[];
  readonly won: boolean;
  readonly islandsOpened: readonly IslandId[];
  readonly cannonsWon: readonly string[];
}

/**
 * Fights one duel to a terminal phase answering everything correctly, then settles it into the
 * captain through `applyDuelOutcome` — the screen's own path, receipts and all.
 *
 * The tray is the captain's real one, narrowed by the same band filter the duel applies, so a gun
 * the ceiling would refuse never gets tapped and a refusal here is a genuine failure rather than
 * the fixture arguing with A-058.
 */
function fightAndSettle(store: CaptainStore, seed: number): Fought {
  const captain = store.getState().captain;
  const context = resolveDuelContext(captain);
  if (!context.ok) {
    throw new Error(`k1-progression: ${String(captain.currentIsland)} is not enterable (${context.reason})`);
  }

  const tray = trayCannons(captain).filter((c) => asksInBand(c, captain.gradeBand));
  if (tray.length === 0) throw new Error('k1-progression: the captain has no gun that can sail');

  const asked: { text: string; templateId: string }[] = [];
  let state: DuelState = initialDuelStateWithContext(context, seed, captain);
  let cursor = 0;

  for (let step = 0; step < STEP_CAP; step += 1) {
    if (state.phase === 'victory' || state.phase === 'defeat') break;

    if (state.phase === 'select') {
      const gun = tray[cursor % tray.length]!;
      cursor += 1;
      const next = duelReducer(state, { type: 'PICK_CANNON', cannon: gun });
      if (next.phase === 'select') {
        throw new Error(`k1-progression: the duel refused ${gun.id}, which the band allows`);
      }
      state = next;
      continue;
    }

    if (state.phase === 'question') {
      const question = state.question;
      if (question === null) throw new Error('k1-progression: question phase without a question');
      asked.push({ text: question.text, templateId: question.templateId });
      state = duelReducer(state, { type: 'ANSWER', value: question.answer, elapsedMs: 0 });
      continue;
    }

    state = duelReducer(state, { type: 'ADVANCE' });
  }

  if (state.phase !== 'victory' && state.phase !== 'defeat') {
    throw new Error(`k1-progression: duel never finished (stuck at ${state.phase})`);
  }

  const outcome = applyDuelOutcome(store, state);
  return {
    asked,
    won: state.phase === 'victory',
    islandsOpened: outcome.unlockedIslands,
    cannonsWon: [...outcome.unlockedCannons],
  };
}

/**
 * Every island a band can reach by mastering everything it is offered, to a fixpoint.
 *
 * This is the shape of the complaint: "what can this child EVER open". It masters only in-band
 * skills FROM THE BAND'S OWN CELLS (D-14 — `islandCurriculumFor`), so it can never overstate a
 * band's reach, and it runs `resolveUnlocks` with the band so the ceiling is applied exactly as
 * the app applies it.
 */
function everReachableIslands(band: GradeBand): readonly IslandId[] {
  const maxGrade = maxGradeForBand(band);
  const mastery: Partial<Record<SkillId, SkillMastery>> = {};
  let unlocked: IslandId[] = [...resolvePlacement(band).unlockedIslands];

  for (let pass = 0; pass <= islands.length; pass += 1) {
    for (const id of unlocked) {
      for (const skill of islandCurriculumFor(id, band).skills) {
        if (getSkill(skill).minGrade <= maxGrade) mastery[skill] = MASTERED;
      }
    }
    const next = resolveUnlocks({
      gradeBand: band,
      mastery,
      unlockedCannons: [],
      unlockedIslands: unlocked,
    });
    if (next.islands.length === 0) break;
    unlocked = [...unlocked, ...next.islands];
  }

  return unlocked;
}

describe('A-060 K-1 progression — the first island is not the last one (re-baselined to D-14)', () => {
  // ── AC-1 — the owner's complaint, as an executable sentence ──────────────────────────────────

  it('spec(A-060:AC-1) a fresh K-1 captain opens Isla Products by duelling — the FIRST win does it', () => {
    // RE-BASELINED 2026-08-02 under owner ruling D-11 (`tickets/app/OWNER-RULINGS.md`, implemented
    // by A-062): winning a duel on an island immediately opens the next band-eligible island —
    // "we should remove the need to play the same island multiple times". This spec used to
    // tolerate up to 3 wins and asserted the fog lifted BECAUSE a skill was mastered; both of
    // those pinned mastery-gated fog, which D-11 retires for island fog only.
    const store = onboarded('k_1');
    expect(store.getState().captain.unlockedIslands).toEqual(['port_sumwich']);
    expect(store.getState().captain.currentIsland).toBe('port_sumwich');

    let wins = 0;
    let opened = -1;
    for (let duel = 0; duel < PATIENCE_DUELS && opened < 0; duel += 1) {
      // A fresh seed per duel, exactly as `app/duel.tsx` mints one: `settleDuelRewards` is
      // idempotent per `duelId`, so replaying a seed would pay nothing and this loop would stall.
      const fought = fightAndSettle(store, 4_100 + duel);
      if (fought.won) wins += 1;
      if (store.getState().captain.unlockedIslands.includes('isla_products')) opened = wins;
    }

    expect(
      opened,
      `a k_1 captain won ${wins} duel(s) in ${PATIENCE_DUELS} and Isla Products never opened`,
    ).toBeGreaterThan(0);
    // D-11's whole point, pinned exactly: ONE win, and the island is not replayed to open the
    // next. A `2` here means the win-advance path silently regressed to pacing by repetition.
    expect(opened, 'a win must open the next island immediately (D-11)').toBe(1);
  });

  it('spec(A-070:AC-1) the K-1 reach is ALL FIVE islands — and each cell it sails is its own, inside the ceiling', () => {
    // D-14's successor to the old "the ceiling still shuts Quotient Cove" fixpoint: the ceiling
    // no longer closes islands, because every island now carries a K-1 cell inside the ceiling.
    const ceiling = maxGradeForBand('k_1');
    for (const islandId of ALL_FIVE) {
      const cell = islandCurriculumFor(islandId, 'k_1');
      expect(cell.skills.length, `${islandId} teaches k_1 something`).toBeGreaterThan(0);
      for (const skill of cell.skills) {
        expect(getSkill(skill).minGrade, `${islandId} k_1 cell skill ${skill}`).toBeLessThanOrEqual(ceiling);
      }
      expect(cell.skills, `${islandId} k_1 cell must not teach multiplication`).not.toContain('mult_facts');
      expect(cell.skills, `${islandId} k_1 cell must not teach division`).not.toContain('div_facts');
    }

    // The fixpoint itself: what a K-1 captain can EVER open is the whole map now.
    expect([...everReachableIslands('k_1')].sort()).toEqual([...ALL_FIVE].sort());
  });

  // ── AC-2 — the authored content a five-year-old is actually shown ────────────────────────────

  it('spec(A-060:AC-2) every repeated_addition template asks addition a K-1 child can reach', () => {
    const pool = TEMPLATE_POOLS[A060_SKILL];
    expect(pool.length, 'the pool must be big enough to vary').toBeGreaterThanOrEqual(6);

    let generated = 0;
    const skeletons = new Set<string>();

    for (const template of pool) {
      // The glyphs and the words, on the AUTHORED text — before any parameter is substituted, so a
      // literal `×` cannot hide behind a draw that never happens to be sampled.
      expect(template.text, `${template.id} prints an operator glyph`).not.toMatch(OPERATOR_GLYPHS);
      expect(template.text, `${template.id} says multiply/divide/times`).not.toMatch(OPERATOR_WORDS);
      expect(template.text, `${template.id} does not read as addition`).toContain('+');
      skeletons.add(template.text.replace(/\{[A-Za-z_][A-Za-z0-9_]*\}/g, '#'));

      // A golden sweep, not a spot check: the rendered question is what a child sees, and the
      // bound that matters is the ANSWER, which only exists once params are drawn.
      for (let seed = 1; seed <= 200; seed += 1) {
        const [question] = generateQuestion({
          templates: [template],
          recentTemplateIds: [],
          rng: createRng(seed * 7 + 1),
        });
        const answer = question.choices[question.correctIndex]?.value;

        expect(question.text, `${template.id}@${seed}`).not.toMatch(OPERATOR_GLYPHS);
        expect(question.text, `${template.id}@${seed}`).not.toMatch(OPERATOR_WORDS);
        expect(Number.isInteger(answer), `${template.id}@${seed} answer ${String(answer)}`).toBe(true);
        expect(answer, `${template.id}@${seed} asked for a negative answer`).toBeGreaterThanOrEqual(0);
        expect(answer, `${template.id}@${seed} answer ${String(answer)} is beyond 20`).toBeLessThanOrEqual(20);

        // Four taps, all distinct, exactly one right — the 2x2 grid contract.
        expect(question.choices).toHaveLength(CHOICE_COUNT);
        expect(new Set(question.choices.map((c) => c.value)).size).toBe(CHOICE_COUNT);
        for (const choice of question.choices) {
          expect(choice.value, `${template.id}@${seed} offered a negative tap`).toBeGreaterThanOrEqual(0);
        }
        generated += 1;
      }
    }

    expect(generated).toBe(pool.length * 200);
    // Variety: eight clones of one skeleton is a pool that teaches one trick.
    expect(skeletons.size, 'the pool repeats itself').toBeGreaterThanOrEqual(5);
  });

  it('spec(A-060:AC-2) the skill reads as addition everywhere it is named, not as multiplication', () => {
    const skill = getSkill(A060_SKILL);
    expect(skill.minGrade).toBeLessThanOrEqual(maxGradeForBand('k_1'));
    expect(skill.displayName).not.toMatch(OPERATOR_WORDS);
    expect(skill.displayName).not.toMatch(OPERATOR_GLYPHS);
    expect(getCannon(A060_CANNON).displayName).not.toMatch(OPERATOR_WORDS);
  });

  // ── AC-3 — the gun, because an island with nothing to fire is still a wall ───────────────────

  it('spec(A-060:AC-3) a K-1 captain arrives at island two holding its entry gun, drills its own skill, and fires it there', () => {
    const store = onboarded('k_1');

    // Get to the island the honest way first.
    let opened = false;
    for (let duel = 0; duel < PATIENCE_DUELS && !opened; duel += 1) {
      fightAndSettle(store, 8_200 + duel);
      opened = store.getState().captain.unlockedIslands.includes('isla_products');
    }
    expect(opened, 'AC-1 is the precondition for this test and it did not hold').toBe(true);

    // D-14: the arrival landed the K-1 cell's entry gun — subtraction within 10, the island's own
    // K-1 teaching — so the captain holds a gun that asks the island's questions the moment the
    // fog lifts (the anti-circularity rule A-062 introduced, now per band).
    expect(store.getState().captain.ownedCannons).toContain(K1_ISLAND_TWO_CANNON);

    // The range there offers the band's cell — and only that.
    const drillable = rangeSkills('isla_products', 'k_1');
    expect(drillable).toEqual([K1_ISLAND_TWO_SKILL]);

    sailTo(store, 'isla_products');
    let session = openDrill({
      islandId: 'isla_products',
      skillId: K1_ISLAND_TWO_SKILL,
      captain: store.getState().captain,
      rng: createRng(5_150),
    });
    while (!session.complete) {
      const current = session.current;
      if (current === null) throw new Error('k1-progression: a live drill lost its question');
      expect(current.text).not.toMatch(OPERATOR_GLYPHS);
      session = answerDrill(session, current.correctIndex, 1_000);
    }
    const outcome = commitDrill(store, session);
    expect(outcome.applied).toBe(true);
    expect(outcome.mastered, 'a perfect drill from empty must master the skill').toBe(true);
    // The drill pays no NEW cannon here, and that is correct: the entry gun already landed with
    // the arrival (see above) — the old acquisition path was circular, and this is its absence.

    // Owned, in band, and on the deck.
    const won = store.getState().captain;
    expect(won.ownedCannons).toContain(K1_ISLAND_TWO_CANNON);
    expect(asksInBand(getCannon(K1_ISLAND_TWO_CANNON), 'k_1')).toBe(true);

    store.getState().equipCannons([K1_ISLAND_TWO_CANNON]);
    expect(trayCannons(store.getState().captain).map((c) => c.id)).toEqual([K1_ISLAND_TWO_CANNON]);

    // ...and it fires, at the island it arrived with, asking maths inside the ceiling.
    const fought = fightAndSettle(store, 5_151);
    expect(fought.asked.length, 'the duel at Isla Products asked a K-1 captain nothing').toBeGreaterThan(0);
    for (const question of fought.asked) {
      expect(question.text, `Isla Products showed a k_1 captain '${question.text}'`).not.toMatch(
        OPERATOR_GLYPHS,
      );
      expect(question.text).not.toMatch(OPERATOR_WORDS);
      expect(TEMPLATE_POOLS[K1_ISLAND_TWO_SKILL].map((t) => t.id)).toContain(question.templateId);
    }
  });

  it('spec(A-060:AC-3) the island has a rival a K-1 captain can meet, which is what used to throw', () => {
    // `deriveRivalLoadout` fails CLOSED — before A-060 it threw `no age-eligible cannons for
    // island 'isla_products' at band 'k_1'`, so even a hand-unlocked island was a crash rather
    // than a duel. This is that call, at that band — now against the K-1 cell (D-14).
    const captain: Captain = {
      ...onboarded('k_1').getState().captain,
      unlockedIslands: ['port_sumwich', 'isla_products'],
    };
    const rival = deriveRivalLoadout(captain, 'isla_products');
    expect(rival.length).toBeGreaterThan(0);
    for (const id of rival) {
      expect(asksInBand(getCannon(id), 'k_1'), `the k_1 rival at Isla Products carries ${id}`).toBe(true);
    }
  });

  // ── AC-4 — the older bands sail their own seas, whole (D-14) ─────────────────────────────────

  it('spec(A-070:AC-1) g2_3 and g4_5 each reach ALL FIVE islands — their own curriculum, the same map', () => {
    // D-14's successor to "g2_3 walks to Quotient Cove and stops": no band stops anywhere now.
    expect([...everReachableIslands('g2_3')].sort()).toEqual([...ALL_FIVE].sort());
    expect([...everReachableIslands('g4_5')].sort()).toEqual([...ALL_FIVE].sort());

    // Each band drills its OWN cell at island two — the same island, three different rungs.
    expect(rangeSkills('isla_products', 'k_1')).toEqual(['sub_within_10']);
    expect(rangeSkills('isla_products', 'g2_3')).toEqual(['two_step_add_sub']);
    expect(rangeSkills('isla_products', 'g4_5')).toEqual(['multi_digit_mult']);

    // Mastery still pays the mastered skill's range gun, and mastering a predecessor's cell
    // still lifts the successor's fog — the mastery lane survives D-11/D-14 intact.
    for (const band of ['g2_3', 'g4_5'] as const) {
      const unlocked = resolveUnlocks({
        gradeBand: band,
        mastery: { mult_facts: MASTERED },
        unlockedCannons: [],
        unlockedIslands: [],
      });
      expect(unlocked.cannons).toContain('twelve_pounder');
    }
    // g2_3's fraction_reef cell teaches mult_facts; mastering it opens grandline for g2_3.
    const viaMastery = resolveUnlocks({
      gradeBand: 'g2_3',
      mastery: { mult_facts: MASTERED },
      unlockedCannons: [],
      unlockedIslands: ['port_sumwich', 'isla_products', 'quotient_cove', 'fraction_reef'],
    });
    expect(viaMastery.islands).toContain('grandline');

    // Placement opens island one ONLY, at every band (D-14: the voyage is won, never granted).
    for (const band of ['k_1', 'g2_3', 'g4_5'] as const) {
      expect(resolvePlacement(band).unlockedIslands, band).toEqual(['port_sumwich']);
    }
  });

  it('spec(A-060:AC-4) the A-060 gun is acquirable at exactly the band its questions are legible at', () => {
    const gun = getCannon(A060_CANNON);
    expect(gun.skill).toBe(A060_SKILL);
    expect(gun.unlock).toEqual({ kind: 'range', island: 'isla_products', tier: 1 });
    // The catalog invariant A-058 pins, restated for the row: a gun may never be acquirable
    // before its own skill is legible.
    expect(getSkill(gun.skill).minGrade).toBeLessThanOrEqual(gun.minGrade);
    expect([gun.minGrade, gun.maxGrade]).toEqual([getSkill(gun.skill).minGrade, getSkill(gun.skill).maxGrade]);
    // It is a RANGE unlock, which is what makes `resolveUnlocks` grant it — a chest or starter
    // unlock would leave mastering the skill paying nothing.
    expect(cannons.filter((c) => c.skill === A060_SKILL).map((c) => c.id)).toEqual([A060_CANNON]);
  });
});
