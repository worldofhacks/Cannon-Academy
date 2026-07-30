/**
 * A-058 — the maths a duel asks never exceeds the band the child picked at onboarding.
 *
 * A-051 closed two places where the ceiling only *showed* — the gun-deck operator row and the
 * chart's green check. It did not touch the duel, and the duel is where the child is actually
 * asked. Nothing in the app checked the band at duel time at all: `duelContext.ts` validates island
 * access and never reads `gradeBand`, and `stores/duel.ts` handed the engine the whole equipped set.
 * The ceiling was carried entirely by ACQUISITION gates — placement, range unlocks, the rival's
 * loadout — and each of them had to remember.
 *
 * One did not. A rare chest grants the first chest-only cannon the captain does not own
 * (`chestSettlement.missingChestOnlyCannon`), with no band check anywhere on that path. That cannon
 * is `nine_pounder`, whose skill `place_value_compare` is `minGrade: 2`. So a K-1 captain who won a
 * single duel could put it on the deck — `commitLoadout` refuses only what is not OWNED — and be
 * asked *"How many tens are in 807?"*. Reproduced by driving the real path before the fix; this file
 * is the proof it stays closed.
 *
 * ── Traps deliberately closed ────────────────────────────────────────────────────────────────
 *
 *  1. **A placed captain is in band by construction.** `resolvePlacement` is band-gated, so a suite
 *     that only ever builds a freshly-onboarded captain measures PLACEMENT and would pass with no
 *     duel-time gate whatsoever — which is precisely the state this ticket found. Every band sweep
 *     below is therefore paired with fixtures that push an out-of-band gun into `equippedCannons`
 *     the way the app really can: through a chest, and through a save that already carries one.
 *  2. **Asserting the cannon list is not asserting the question.** The thing in front of the child
 *     is a prompt. Every assertion here reads the QUESTION the reducer produced — its skill and its
 *     rendered text — not the tray it came from.
 *  3. **A × / ÷ check alone misses the real bug.** `place_value_compare` is above the K-1 ceiling
 *     and contains no operator glyph at all. So the skill's `minGrade` is the primary assertion and
 *     the glyphs are the reported symptom, checked as well and never instead.
 *  4. **Both starters share `add_within_10`.** A K-1-only sweep is satisfied by a reducer with the
 *     skill hardcoded (L-020). The sweep runs every band, on every island that band has unlocked.
 *  5. **"No out-of-band question" is satisfied by asking nothing.** Every sweep carries non-vacuity
 *     counters: questions actually drawn, distinct skills reached, and — for the out-of-band
 *     fixtures — proof that the offending gun really was equipped and really was refused.
 *  6. **A filter is not allowed to substitute.** The surviving guns must be exactly the in-band
 *     subset of what the captain equipped, in the same order — not a placement set fetched fresh.
 *  7. **Filtering could break replay.** `templatePools.ts` warns that file order is part of the
 *     contract because the generator indexes into the pool it is handed. AC-5 pins that an in-band
 *     cannon at a given seed still draws exactly what `nextQuestion` — which reads the whole
 *     file-ordered pool — produces for the same rng and recency window.
 *
 * Nothing here renders a screen: vitest runs in node and React Native's entry point is Flow-typed.
 * The two clauses that live only in `app/duel.tsx` are asserted against its source (the A-001 AC-7
 * pattern), and everything else is driven through the same reducer the screen dispatches into.
 */
import { describe, expect, it } from 'vitest';

import { cannons, getCannon, getSkill, islands, skills } from '@content/index';
import type { Cannon, CannonId, GradeBand, IslandId, SkillId } from '@content/schemas';
import { GRADE_BANDS } from '@content/schemas';
import { maxGradeForBand } from '@engine/placement';
import { TRAY_CAPACITY } from '@engine/tuning';

import { resolveDuelContext } from '../../src/services/duelContext';
import { DESTINATIONS } from '../../src/services/flow';
import { openGuidedDuel } from '../../src/services/guidedDuel';
import { asksInBand, commitLoadout, inBandLoadout, trayCannons } from '../../src/services/loadout';
import { commitGradeBand } from '../../src/services/onboarding';
import { nextQuestion, type DuelQuestion } from '../../src/services/questions';
import { settleDuelRewards } from '../../src/services/rewardSettlement';
import { deriveRivalLoadout } from '../../src/services/rivalLoadout';
import { TEMPLATE_POOLS } from '../../src/services/templatePools';
import {
  duelReducer,
  initialDuelStateWithContext,
  type DuelState,
} from '../../src/stores/duel';
import { createCaptainStore, type Captain, type CaptainStore } from '../../src/stores/player';

const BANDS: readonly GradeBand[] = GRADE_BANDS;

/** Fixed seeds. Everything below is a function of these. */
const SEEDS: readonly number[] = [7, 1_009, 65_537];

/** Enough steps for any duel at any island to reach a terminal phase. */
const STEP_CAP = 800;

/** Which skill authored a template id — so a question can be traced to its skill, not its cannon. */
const SKILL_BY_TEMPLATE_ID: ReadonlyMap<string, SkillId> = new Map(
  Object.entries(TEMPLATE_POOLS).flatMap(([skill, pool]) =>
    pool.map((template) => [template.id, skill as SkillId] as const),
  ),
);

/**
 * The lowest grade at which each operator glyph appears in AUTHORED TEXT — derived from the
 * template corpus, never a written-down 3. `×` reaches a child through `mult_facts`, `div_facts`'s
 * fact-family template and `multi_digit_order_ops`; `÷` only through `div_facts`. Deriving it means
 * a template file that starts using a glyph earlier moves this expectation with it.
 */
const GLYPH_MIN_GRADE: ReadonlyMap<string, number> = new Map(
  ['×', '÷'].map((glyph) => {
    const grades = Object.entries(TEMPLATE_POOLS)
      .filter(([, pool]) => pool.some((t) => t.text.includes(glyph)))
      .map(([skill]) => getSkill(skill as SkillId).minGrade);
    return [glyph, Math.min(...grades)] as const;
  }),
);

function skillOf(question: DuelQuestion): SkillId {
  const skill = SKILL_BY_TEMPLATE_ID.get(question.templateId);
  if (skill === undefined) {
    throw new Error(`grade-band-duel: template '${question.templateId}' belongs to no skill pool`);
  }
  return skill;
}

/** A captain placed the way `app/onboarding.tsx` places one — through `commitGradeBand`. */
function onboarded(band: GradeBand): CaptainStore {
  const store = createCaptainStore();
  const destination = commitGradeBand(store, band);
  // Non-vacuity on the fixture itself: if onboarding ever stopped committing, every sweep below
  // would silently be measuring an empty captain.
  expect(DESTINATIONS, `commitGradeBand(${band}) returned a non-destination`).toContain(destination);
  expect(store.getState().captain.gradeBand).toBe(band);
  expect(store.getState().captain.equippedCannons.length).toBeGreaterThan(0);
  return store;
}

/** The catalog cannons whose questions sit ABOVE a band's ceiling. */
function outOfBand(band: GradeBand): readonly Cannon[] {
  return cannons.filter((cannon) => !asksInBand(cannon, band));
}

interface Played {
  /** Every question the duel actually put on screen, in order. */
  readonly asked: readonly DuelQuestion[];
  /** Cannons that armed a question. */
  readonly fired: readonly CannonId[];
  /** Cannons the child tapped and the engine refused — the ceiling, observed. */
  readonly refused: readonly CannonId[];
  readonly terminal: DuelState['phase'];
}

/**
 * Plays one duel to a terminal phase, tapping every gun in the captain's RAW equipped set in turn.
 *
 * Raw, not band-filtered, on purpose: tapping the out-of-band gun is the whole experiment. A refusal
 * leaves the phase at `select` (the reducer returns the same state for a cannon outside
 * `playerLoadout`), so the loop records it and moves to the next gun rather than spinning.
 */
function playDuel(captain: Captain, islandId: IslandId, seed: number): Played {
  const sailing: Captain = { ...captain, currentIsland: islandId };
  const context = resolveDuelContext(sailing);
  if (!context.ok) {
    throw new Error(`grade-band-duel: ${islandId} is not enterable (${context.reason})`);
  }

  const tray = trayCannons(sailing);
  if (tray.length === 0) throw new Error('grade-band-duel: fixture equipped nothing');

  const asked: DuelQuestion[] = [];
  const fired: CannonId[] = [];
  const refused: CannonId[] = [];
  let state = initialDuelStateWithContext(context, seed, sailing);
  let cursor = 0;

  for (let step = 0; step < STEP_CAP; step += 1) {
    if (state.phase === 'victory' || state.phase === 'defeat') break;

    if (state.phase === 'select') {
      const gun = tray[cursor % tray.length]!;
      cursor += 1;
      const next = duelReducer(state, { type: 'PICK_CANNON', cannon: gun });
      if (next.phase === 'select') {
        if (!refused.includes(gun.id)) refused.push(gun.id);
        // Every gun refused means the duel can never leave `select`; bail rather than spin.
        if (refused.length >= tray.length) break;
        continue;
      }
      fired.push(gun.id);
      state = next;
      continue;
    }

    if (state.phase === 'question') {
      const question = state.question;
      if (question === null) throw new Error('grade-band-duel: question phase without a question');
      asked.push(question);
      state = duelReducer(state, { type: 'ANSWER', value: question.answer, elapsedMs: 0 });
      continue;
    }

    state = duelReducer(state, { type: 'ADVANCE' });
  }

  return { asked, fired, refused, terminal: state.phase };
}

/** Asserts one question is inside `band`, by skill and by the glyphs it renders. */
function expectInBand(question: DuelQuestion, band: GradeBand, where: string): void {
  const maxGrade = maxGradeForBand(band);
  const skill = skillOf(question);
  expect(
    getSkill(skill).minGrade,
    `${where}: asked '${question.text}' (${skill}, minGrade ${getSkill(skill).minGrade}) ` +
      `to a ${band} captain whose ceiling is grade ${maxGrade}`,
  ).toBeLessThanOrEqual(maxGrade);

  for (const [glyph, minGrade] of GLYPH_MIN_GRADE) {
    if (minGrade <= maxGrade) continue;
    expect(
      question.text.includes(glyph),
      `${where}: showed '${glyph}' to a ${band} captain — the catalog introduces it at grade ${minGrade}`,
    ).toBe(false);
  }
}

/** Reads a source file as text. The A-001 AC-7 pattern: some rules are only visible in the source. */
async function readSource(relative: string): Promise<string> {
  const fs = await import('node:fs/promises');
  return fs.readFile(new URL(relative, import.meta.url), 'utf8');
}

describe('A-058 the duel obeys the band picked at onboarding', () => {
  // ── AC-1 — a captain placed through real onboarding is only ever asked in-band maths ────────

  it('spec(A-058:AC-1) every question a real duel asks is inside the band, at every band and island', () => {
    let asked = 0;
    const skillsSeen = new Set<SkillId>();
    const islandsPlayed = new Set<IslandId>();

    for (const band of BANDS) {
      const captain = onboarded(band).getState().captain;

      for (const islandId of captain.unlockedIslands) {
        for (const seed of SEEDS) {
          const played = playDuel(captain, islandId, seed);
          expect(
            played.asked.length,
            `${band}@${islandId} seed ${seed} finished without asking anything`,
          ).toBeGreaterThan(0);
          expect(['victory', 'defeat']).toContain(played.terminal);

          for (const question of played.asked) {
            expectInBand(question, band, `${band}@${islandId}`);
            skillsSeen.add(skillOf(question));
            asked += 1;
          }
          islandsPlayed.add(islandId);
        }
      }
    }

    // Non-vacuity. Both starters are `add_within_10`, so a corpus that only ever reached one skill
    // would be satisfied by a reducer with that skill written into it.
    expect(asked).toBeGreaterThan(BANDS.length * SEEDS.length);
    expect(skillsSeen.size).toBeGreaterThan(1);
    expect(islandsPlayed.size).toBeGreaterThan(1);
  });

  it('spec(A-058:AC-1) a K-1 duel never renders × or ÷, and never reaches a multiplication skill', () => {
    // The owner's sentence, pinned on its own so a failure names the child rather than a sweep.
    const captain = onboarded('k_1').getState().captain;
    let asked = 0;

    for (const islandId of captain.unlockedIslands) {
      for (const seed of SEEDS) {
        for (const question of playDuel(captain, islandId, seed).asked) {
          expect(question.text).not.toMatch(/[×÷]/);
          expect(skillOf(question).startsWith('mult_')).toBe(false);
          expect(skillOf(question).startsWith('div_')).toBe(false);
          asked += 1;
        }
      }
    }

    expect(asked).toBeGreaterThan(0);
    // ...and the ceiling is the reason, not an accident of what K-1 happens to own: the catalog has
    // × and ÷ skills, and they all sit above grade 1.
    const beyond = skills.filter((s) => s.id.startsWith('mult_') || s.id.startsWith('div_'));
    expect(beyond.length).toBeGreaterThan(0);
    for (const skill of beyond) expect(skill.minGrade).toBeGreaterThan(maxGradeForBand('k_1'));
  });

  // ── AC-2 — the ceiling holds however the gun got equipped ───────────────────────────────────

  it('spec(A-058:AC-2) an out-of-band cannon on the deck is refused by the duel, at every band', () => {
    // The generalisation of the chest bug: it does not matter HOW an over-grade gun reached
    // `equippedCannons` — a chest, a save written by an older build, a dev screen. The duel is what
    // refuses it. Sweeping every out-of-band cannon means a fix that special-cased `nine_pounder`
    // fails here.
    let probed = 0;

    for (const band of BANDS) {
      const captain = onboarded(band).getState().captain;
      // A real deck holds `TRAY_CAPACITY`, so the stranger DISPLACES a placed gun rather than
      // being appended past the slot count — otherwise `commitLoadout` refuses for over-capacity
      // and the fixture never gets to prove anything about the band.
      const placed = captain.equippedCannons.slice(0, TRAY_CAPACITY - 1);
      expect(placed.length).toBeGreaterThan(0);

      for (const stranger of outOfBand(band)) {
        const carrying: Captain = {
          ...captain,
          ownedCannons: [...new Set([...captain.ownedCannons, stranger.id])],
          equippedCannons: [...placed, stranger.id],
        };
        // The fixture is honest: the gun really is owned, really is equipped, and `commitLoadout`
        // really would have accepted it — ownership is the only thing it checks.
        expect(commitLoadout(carrying, carrying.equippedCannons).ok).toBe(true);

        const played = playDuel(carrying, captain.unlockedIslands[0]!, SEEDS[0]!);
        expect(
          played.refused,
          `${stranger.id} was allowed to fire at ${band}`,
        ).toContain(stranger.id);
        expect(played.fired).not.toContain(stranger.id);
        for (const question of played.asked) {
          expectInBand(question, band, `${band} carrying ${stranger.id}`);
        }
        // The placed guns are untouched — the ceiling removes, it never disarms the whole tray.
        expect(played.fired.length).toBeGreaterThan(0);
        probed += 1;
      }
    }

    // Non-vacuity: there really are out-of-band cannons to probe. If the catalog ever put every
    // cannon inside every band this test would be measuring nothing, and would say so.
    expect(probed).toBeGreaterThan(0);
  });

  it('spec(A-058:AC-2) the chest cannon a K-1 captain can really win never reaches their questions', () => {
    // The reported path, driven end to end rather than simulated: place at K-1, win a duel, take
    // whatever the chest gives, put it on the deck, sail.
    const store = onboarded('k_1');
    const before = store.getState().captain;

    // Which duel id rolls a cannon is a property of the seeded chest table, so it is SEARCHED for
    // rather than written down — a retune of `rollChest` moves the id, not the guarantee.
    let winner: string | null = null;
    let prize: CannonId | null = null;
    for (let n = 0; n < 512 && winner === null; n += 1) {
      const probe = onboarded('k_1');
      const duelId = `duel-${n.toString(36)}`;
      const outcome = settleDuelRewards(probe, {
        duelId,
        seed: n,
        won: true,
        purseCoins: 0,
        skillTally: {},
      });
      if (outcome.unlockedCannons.length > 0) {
        winner = duelId;
        prize = outcome.unlockedCannons[0]!;
      }
    }

    expect(winner, 'no chest in 512 duels granted a cannon — the fixture found nothing to test').not.toBeNull();
    expect(prize).not.toBeNull();
    // The prize really is above the K-1 ceiling; otherwise this test proves nothing about the band.
    expect(asksInBand(getCannon(prize!), 'k_1')).toBe(false);

    settleDuelRewards(store, {
      duelId: winner!,
      seed: 0,
      won: true,
      purseCoins: 0,
      skillTally: {},
    });
    const won = store.getState().captain;
    expect(won.ownedCannons).toContain(prize!);
    expect(won.ownedCannons.length).toBeGreaterThan(before.ownedCannons.length);

    // The gun deck would let them equip it — ownership is the only gate `commitLoadout` applies.
    const deck = [...before.equippedCannons, prize!];
    const commit = commitLoadout(won, deck);
    expect(commit.ok).toBe(true);
    store.getState().equipCannons(deck);
    expect(store.getState().captain.equippedCannons).toContain(prize!);

    const played = playDuel(store.getState().captain, 'port_sumwich', SEEDS[1]!);
    expect(played.refused).toContain(prize!);
    expect(played.asked.length).toBeGreaterThan(0);
    for (const question of played.asked) expectInBand(question, 'k_1', 'k_1 after a chest');
  });

  it('spec(A-058:AC-2) the surviving guns are exactly the in-band subset, in the order the captain chose', () => {
    // A filter that "helpfully" fell back to `resolvePlacement(band)` would keep every question in
    // band and still be wrong: it would hand a child guns they never chose, and would reorder the
    // deck they arranged. Removal only.
    for (const band of BANDS) {
      const captain = onboarded(band).getState().captain;
      const strangers = outOfBand(band).map((c) => c.id);
      const mixed = [...captain.equippedCannons].reverse();
      const withStrangers = [mixed[0]!, ...strangers, ...mixed.slice(1)];

      expect(inBandLoadout(withStrangers, band)).toEqual(mixed);
      // ...and a captain whose whole deck is out of band gets nothing back, rather than a
      // substitute set. `app/duel.tsx` answers an empty tray with a redirect (A-011).
      if (strangers.length > 0) expect(inBandLoadout(strangers, band)).toEqual([]);
    }
  });

  it('spec(A-058:AC-2) a captain with no band at all is handed no guns — never the whole catalog', () => {
    // `engine/mastery.ts` reads an absent band as `POSITIVE_INFINITY`, which is safe there only
    // because a skill must be mastered before it unlocks anything. The same reading at duel time is
    // the catalog, division included, in front of a child the app has not placed yet.
    const everyId = cannons.map((c) => c.id);
    expect(inBandLoadout(everyId, null)).toEqual([]);
    for (const cannon of cannons) expect(asksInBand(cannon, null)).toBe(false);
  });

  // ── AC-3 — the first duel a child ever sees ─────────────────────────────────────────────────

  it('spec(A-058:AC-3) the guided first duel asks in-band maths for every band', () => {
    // The guided duel has its own loadout path — `guidedConfig`'s `playerLoadout`, not the gun deck
    // — so the band sweep above cannot see it. It is also the ONE duel that runs before a captain
    // has ever chosen a gun, which is why it is pinned separately rather than trusted.
    for (const band of BANDS) {
      for (const seed of SEEDS) {
        const { session } = openGuidedDuel(seed);
        const core = session.getState().core;

        expect(core.playerLoadout.length).toBeGreaterThan(0);
        for (const id of core.playerLoadout) {
          expect(
            asksInBand(getCannon(id), band),
            `the guided duel arms ${id}, which is above the ${band} ceiling`,
          ).toBe(true);
        }

        for (const id of core.playerLoadout) {
          session.dispatch({ type: 'CANNON_SELECTED', cannonId: id });
          const armed = session.getState().core;
          if (armed.phase !== 'reload') throw new Error(`guided duel did not arm ${id}`);
          expectInBand(
            {
              text: armed.question.text,
              answer: 0,
              choices: [],
              readAloud: armed.question.readAloud,
              templateId: armed.question.templateId,
            },
            band,
            `guided duel @ ${band}`,
          );
        }
        session.dispose();
      }
    }
  });

  it('spec(A-058:AC-3) an out-of-band gun on a captain arriving at the guided duel cannot fire', () => {
    // A save carrying an over-grade gun reaches the guided duel too (a replay, or a captain whose
    // latch was never written). The screen intersects its tray with the session loadout, but the
    // guarantee is the ENGINE's: `selectCannon` returns the same state for anything outside it.
    const { session } = openGuidedDuel(SEEDS[0]!);
    const permitted = new Set(session.getState().core.playerLoadout);
    const stranger = outOfBand('k_1').find((c) => !permitted.has(c.id));
    if (stranger === undefined) throw new Error('grade-band-duel: no out-of-band gun to try');

    const before = session.getState();
    session.dispatch({ type: 'CANNON_SELECTED', cannonId: stranger.id });
    expect(session.getState().core).toBe(before.core);
    expect(session.getState().core.phase).not.toBe('reload');
    session.dispose();
  });

  // ── AC-4 — the rival ────────────────────────────────────────────────────────────────────────

  it('spec(A-058:AC-4) the rival is band-gated, and its volleys never put a question on screen', () => {
    // `deriveRivalLoadout` already filters by band; what matters more is that a rival volley is a
    // `RivalVolley` carrying a boolean, not a question — `rivalAction` never calls the generator. So
    // even an over-grade rival gun could not show a child anything. Both halves are pinned, because
    // a future rival that DID ask would silently reintroduce the whole bug.
    for (const band of BANDS) {
      const captain = onboarded(band).getState().captain;
      for (const islandId of captain.unlockedIslands) {
        const loadout = deriveRivalLoadout(captain, islandId);
        expect(loadout.length).toBeGreaterThan(0);
        for (const id of loadout) {
          expect(
            asksInBand(getCannon(id), band),
            `the ${band} rival at ${islandId} carries ${id}`,
          ).toBe(true);
        }
      }

      // Every question in a full duel came from a gun the PLAYER fired. A rival-sourced question
      // would show up here as a skill no player cannon in the duel could produce.
      const played = playDuel(captain, captain.unlockedIslands[0]!, SEEDS[2]!);
      const playerSkills = new Set(played.fired.map((id) => getCannon(id).skill));
      expect(played.asked.length).toBeGreaterThan(0);
      for (const question of played.asked) expect(playerSkills).toContain(skillOf(question));
    }
  });

  // ── AC-5 — the ceiling costs nothing in replay ──────────────────────────────────────────────

  it('spec(A-058:AC-5) an in-band cannon at a given seed draws exactly the question it always did', () => {
    // The replay hazard `templatePools.ts` names: the generator INDEXES into the pool it is handed,
    // so subsetting or reordering a skill's templates changes which question a seed produces.
    // `nextQuestion` reads the whole file-ordered pool via `templatesForSkill`, so equality against
    // it is the proof that the duel was handed that same array — the ceiling drops whole CANNONS and
    // never touches a pool.
    let compared = 0;

    for (const band of BANDS) {
      const captain = onboarded(band).getState().captain;
      const context = resolveDuelContext(captain);
      if (!context.ok) throw new Error('grade-band-duel: a placed captain cannot enter a duel');

      for (const gun of trayCannons(captain)) {
        for (const seed of SEEDS) {
          let before = initialDuelStateWithContext(context, seed, captain);
          // Three draws, not one: a fresh duel's recency window is empty, so a pool substitution is
          // invisible on the opening question and only diverges once the window has something in it.
          for (let draw = 0; draw < 3; draw += 1) {
            const armed = duelReducer(before, { type: 'PICK_CANNON', cannon: gun });
            const [expected, rng] = nextQuestion(gun.skill, before.rng, before.recentTemplateIds);

            expect(armed.question).toEqual(expected);
            expect(armed.rng).toEqual(rng);
            compared += 1;
            before = armed;
          }
        }
      }
    }

    expect(compared).toBeGreaterThan(BANDS.length * SEEDS.length);
  });

  it('spec(A-058:AC-5) the duel is still handed every authored pool, whole and in file order', () => {
    // Stated as the property the fix must NOT have used: no skill was dropped from the table and no
    // pool was re-ordered. Both are observable through `nextQuestion`, which is the same table the
    // reducer is given.
    for (const [skill, pool] of Object.entries(TEMPLATE_POOLS)) {
      expect(pool.length).toBeGreaterThan(0);
      const [drawn] = nextQuestion(skill as SkillId, { state: 12_345 }, []);
      expect(pool.map((t) => t.id)).toContain(drawn.templateId);
    }
    expect(Object.keys(TEMPLATE_POOLS).sort()).toEqual(skills.map((s) => s.id).sort());
  });

  // ── The catalog invariant the ceiling reads ─────────────────────────────────────────────────

  it('spec(A-058:AC-5) no cannon can be acquired at a band whose skill that band may not be asked', () => {
    // The ceiling measures `getSkill(cannon.skill).minGrade`, because the SKILL is what decides the
    // maths on the screen. Every other band gate in the app measures `cannon.minGrade`. They agree
    // across the catalog today; this pins the direction that matters, so a content edit that made a
    // gun acquirable before its own skill is legible fails here rather than in front of a child.
    for (const cannon of cannons) {
      expect(
        getSkill(cannon.skill).minGrade,
        `${cannon.id} is acquirable at grade ${cannon.minGrade} but asks ${cannon.skill}, ` +
          `which the curriculum introduces at grade ${getSkill(cannon.skill).minGrade}`,
      ).toBeLessThanOrEqual(cannon.minGrade);
    }
  });

  it('spec(A-058:AC-5) every band can still fight — the ceiling never empties a placed captain', () => {
    // The over-correction: a filter tight enough to leave a child with no gun is a duel screen that
    // redirects forever. Every band, on every island it has unlocked, must keep something to fire.
    for (const band of BANDS) {
      const captain = onboarded(band).getState().captain;
      const sailing = inBandLoadout(captain.equippedCannons, band);
      expect(sailing.length, `${band} was left with no cannon`).toBeGreaterThan(0);
      expect(sailing).toEqual([...captain.equippedCannons]);

      for (const islandId of captain.unlockedIslands) {
        const played = playDuel(captain, islandId, SEEDS[0]!);
        expect(played.refused, `${band}@${islandId} refused a placed gun`).toEqual([]);
        expect(played.fired.length).toBeGreaterThan(0);
      }

      // The boundary itself, which placement alone cannot reach: a gun whose skill sits EXACTLY on
      // the ceiling is in band and must still fire. A K-1 captain earns `six_pounder` this way —
      // `add_within_20` is `minGrade: 1`, drillable at their own range, and unlocking it is the
      // reward the range exists for. An off-by-one in the ceiling would silently take it back.
      const atCeiling = cannons.filter(
        (c) => getSkill(c.skill).minGrade === maxGradeForBand(band),
      );
      expect(atCeiling.length, `no catalog cannon sits on the ${band} ceiling`).toBeGreaterThan(0);
      for (const gun of atCeiling) {
        expect(asksInBand(gun, band), `${gun.id} sits on the ${band} ceiling and was refused`).toBe(
          true,
        );
        const earned: Captain = {
          ...captain,
          ownedCannons: [...new Set([...captain.ownedCannons, gun.id])],
          equippedCannons: [gun.id],
        };
        const played = playDuel(earned, captain.unlockedIslands[0]!, SEEDS[1]!);
        expect(played.refused).toEqual([]);
        expect(played.fired).toContain(gun.id);
        expect(played.asked.length).toBeGreaterThan(0);
        for (const question of played.asked) {
          expectInBand(question, band, `${band} firing ${gun.id} at its own ceiling`);
        }
      }
    }
  });

  // ── The screen ──────────────────────────────────────────────────────────────────────────────

  it('spec(A-058:AC-1) the duel screen applies the same ceiling to the tray it renders', async () => {
    // `selectCannon` returns the SAME STATE for a cannon outside `playerLoadout`, so a tile the
    // ceiling dropped from the duel but not from the tray is a dead button in `select` — a phase
    // whose only other exit is leaving the screen. The screen cannot be rendered under the node
    // runner, so the wiring is asserted against its source (the A-001 AC-7 pattern).
    const src = await readSource('../../app/duel.tsx');

    expect(src).toMatch(/trayCannons\(captain\)/);
    expect(src).toMatch(/asksInBand\(c, captain\.gradeBand\)/);
    // ...and it must still be the captain's own set that is being filtered, not a band lookup.
    expect(src).not.toMatch(/resolvePlacement/);
    expect(src).toMatch(/cannons=\{tray\}/);
  });

  it('spec(A-058:AC-1) the duel config applies the ceiling before the engine ever sees a loadout', async () => {
    const src = await readSource('../../src/stores/duel.ts');

    expect(src).toMatch(/inBandLoadout\(captain\.equippedCannons/);
    // The empty-equipped fallback is the other door into the same room: it used to hand over the
    // whole catalog unconditionally.
    expect(src).toMatch(/inBandLoadout\(cannons\.map/);
    // The pools are handed over whole — the replay contract in `templatePools.ts`.
    expect(src).toMatch(/templatesBySkill: TEMPLATE_POOLS/);
  });

  it('dod(A-058:1) every island in the catalog is reachable by at least one band, and playable', () => {
    // Guards the shape of the sweep itself: if a band could unlock an island it may not be asked
    // anything at, AC-1 would be looping over a duel that cannot start.
    const covered = new Set<IslandId>();
    for (const band of BANDS) {
      for (const islandId of onboarded(band).getState().captain.unlockedIslands) covered.add(islandId);
    }
    expect([...covered].sort()).toEqual(islands.map((i) => i.id).sort());
  });
});
