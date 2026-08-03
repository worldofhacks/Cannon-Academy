/**
 * A-066 — the island encounter: one riddle, no wrong outcome, adjusted to the band.
 *
 * Board: `Cannon Academy Island Encounter.dc.html` (project 88888c12-22e4-4781-b76f-a28110506499).
 * The component renders headless-untestable RN, so — repo posture — every behavioural AC is
 * driven through `services/encounter.ts` and `content/riddles.ts`, the board numbers are
 * asserted directly on `components/encounter/encounterBoard.ts`, and the component's wiring is
 * pinned by source guards.
 *
 * The two amber-card rules are law here:
 *   * no wrong outcome — right pays +8 once (the latch IS the idempotency), wrong pays a shrug,
 *     both set the latch, and nothing in the encounter may name a red;
 *   * entry/exit grow from the island's own position (origin 76%/34%, board keyframe verbatim).
 *
 * Traceability: every behavioural test cites `spec(A-066:AC-n)`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getSkill } from '@content/index';
import { GRADE_BANDS, ISLAND_IDS } from '@content/schemas';
import type { GradeBand, IslandId, SkillId } from '@content/schemas';
import { maxGradeForBand } from '@engine/placement';
import { describeDistractorSources } from '@engine/questions/distractors';
import { evaluateNumber } from '@engine/questions/expr';
import { generateQuestion } from '@engine/questions/generator';
import { createRng } from '@engine/rng';
import { CHOICE_COUNT } from '@engine/tuning';

import { RIDDLE_POOLS, riddleTemplatesFor } from '../../src/content/riddles';
import {
  completeEncounter,
  ENCOUNTER_COINS,
  encounterSkillFor,
  riddleFor,
} from '../../src/services/encounter';
import { TEMPLATE_POOLS } from '../../src/services/templatePools';
import { createCaptainStore, emptyCaptain } from '../../src/stores/player';
import { color } from '../../src/theme/tokens';
import {
  ACTION_BUTTON,
  BUBBLE,
  CARD,
  COIN_ARC,
  COPY,
  ENCOUNTER_STATES,
  GROW,
  HOP,
  HOSTS,
  missBubbleFor,
  ORIGIN,
  REWARD_MISS,
  REWARD_POP,
  REWARD_RIGHT,
  rewardTitleFor,
  rightBubbleFor,
  RING_BURST,
  SCRIM,
  SHRUG,
  TILE,
  TILE_CORRECT,
  TILE_IDLE,
  TILE_MISS,
  tileLooks,
  TUCK,
} from '../../src/components/encounter/encounterBoard';

const REPO_ROOT = join(import.meta.dirname, '../..');

function src(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

const CARD_SOURCE = 'src/components/encounter/EncounterCard.tsx';
const HOSTS_SOURCE = 'src/components/encounter/hosts.tsx';
const BOARD_SOURCE = 'src/components/encounter/encounterBoard.ts';

function bandedStore(band: GradeBand | null, coins = 40) {
  const captain = { ...emptyCaptain(), gradeBand: band, coins };
  return createCaptainStore(captain);
}

/**
 * THE ENUMERATION — the ticket's own demand, written out as data so a new island rung fails
 * loudly instead of silently having no riddles. Derived from the band rule (ceiling shared with
 * the entry cannon, floor from the band's own first grade — see `services/encounter.ts`) over
 * the catalog's `rangeSkills`, and pinned against the ticket's stated examples: K-1 at Isla
 * Products is asked repeated addition; g4_5 at the same island gets multiplication; a band whose
 * ceiling clears NOTHING an island teaches is asked nothing at all.
 */
const EXPECTED_SKILL: Record<IslandId, Record<GradeBand, SkillId | null>> = {
  port_sumwich: { k_1: 'add_within_10', g2_3: 'add_within_20', g4_5: 'two_step_add_sub' },
  isla_products: { k_1: 'repeated_addition', g2_3: 'repeated_addition', g4_5: 'mult_facts' },
  quotient_cove: { k_1: null, g2_3: 'div_facts', g4_5: 'div_facts' },
  fraction_reef: { k_1: null, g2_3: null, g4_5: 'fractions_int' },
  grandline: { k_1: null, g2_3: null, g4_5: 'multi_digit_order_ops' },
};

const ENUMERATED: readonly { island: IslandId; band: GradeBand; skill: SkillId | null }[] =
  ISLAND_IDS.flatMap((island) =>
    GRADE_BANDS.map((band) => ({ island, band, skill: EXPECTED_SKILL[island][band] })),
  );

/** Every skill any arrival can ask today — the coverage floor for the authored riddle pools. */
const ASKED_SKILLS: readonly SkillId[] = [
  ...new Set(ENUMERATED.flatMap(({ skill }) => (skill === null ? [] : [skill]))),
];

// ── AC-3: band adjustment — the point of the ticket ────────────────────────────────────────────

describe('AC-3 — the asked skill is the island’s band-adjusted rangeSkill, failing closed', () => {
  it.each(ENUMERATED)(
    'spec(A-066:AC-3) $island asks $band exactly $skill',
    ({ island, band, skill }) => {
      expect(encounterSkillFor(island, band)).toBe(skill);
    },
  );

  it('spec(A-066:AC-3) nothing asked ever sits above the band ceiling — the entry cannon’s own rule', () => {
    for (const { island, band } of ENUMERATED) {
      const asked = encounterSkillFor(island, band);
      if (asked === null) continue;
      expect(
        getSkill(asked).minGrade,
        `${island} asks ${band} '${asked}' above maxGradeForBand`,
      ).toBeLessThanOrEqual(maxGradeForBand(band));
    }
  });

  it('spec(A-066:AC-3) a null, undefined or corrupt band asks nothing on every island', () => {
    for (const island of ISLAND_IDS) {
      expect(encounterSkillFor(island, null)).toBeNull();
      expect(encounterSkillFor(island, undefined)).toBeNull();
      expect(encounterSkillFor(island, 'grade_9' as GradeBand)).toBeNull();
      expect(encounterSkillFor(island, 'K1' as GradeBand)).toBeNull();
      expect(encounterSkillFor(island, '' as GradeBand)).toBeNull();
    }
  });

  it('spec(A-066:AC-3) a k_1 captain is never asked a skill past grade 1, on ANY island a save could name', () => {
    // This is the mutation target: drop the band filter in `encounterSkillFor` and a corrupt
    // save standing at Quotient Cove asks a five-year-old division.
    for (const island of ISLAND_IDS) {
      const asked = encounterSkillFor(island, 'k_1');
      if (asked === null) continue;
      expect(getSkill(asked).minGrade, `${island} asked k_1 '${asked}'`).toBeLessThanOrEqual(1);
    }
  });

  it('spec(A-066:AC-3) rendered riddle text never contains × or ÷ for a k_1 captain', () => {
    for (const island of ISLAND_IDS) {
      const asked = encounterSkillFor(island, 'k_1');
      if (asked === null) continue;
      for (let seed = 1; seed <= 30; seed += 1) {
        const [question] = riddleFor(asked, createRng(seed));
        expect(question.text, `${island}/${asked} seed=${seed}`).not.toMatch(/[×÷]/);
      }
    }
  });

  it('spec(A-066:AC-3) every skill an arrival can ask has an AUTHORED riddle pool of at least 2', () => {
    // A new island rung must fail HERE, not fall silently onto the duel fallback.
    expect(ASKED_SKILLS.length).toBeGreaterThan(0);
    for (const skill of ASKED_SKILLS) {
      const pool = RIDDLE_POOLS[skill];
      expect(pool, `src/content/riddles/${skill}.json is missing`).toBeDefined();
      expect(pool?.length ?? 0, `riddle pool for '${skill}' needs >= 2 riddles`).toBeGreaterThanOrEqual(2);
    }
  });
});

// ── Riddle content: a separate source, generated by the real engine ────────────────────────────

describe('riddle pools — real generator, separate source, duel pools untouched', () => {
  it('spec(A-066:AC-3) riddleFor serves the authored pool: riddle_-prefixed, word-problem, read-aloud', () => {
    for (const skill of ASKED_SKILLS) {
      for (let seed = 1; seed <= 10; seed += 1) {
        const [question] = riddleFor(skill, createRng(seed));
        expect(question.skill).toBe(skill);
        expect(question.templateId.startsWith('riddle_'), `${skill} seed=${seed} got ${question.templateId}`).toBe(true);
        expect(question.isWordProblem).toBe(true);
        expect(question.readAloud).toBe(true);
      }
    }
  });

  it('spec(A-066:AC-3) a skill with no riddle file falls back to its plain duel templates — a LOCAL copy, never the shared pool object', () => {
    for (const skill of ['sub_within_20', 'place_value_compare'] as const) {
      expect(RIDDLE_POOLS[skill]).toBeUndefined();
      const fallback = riddleTemplatesFor(skill);
      expect(fallback.length).toBeGreaterThan(0);
      // Same content on disk, DIFFERENT array in memory — the frozen seed-replay contracts pin
      // the duel's pool object and the encounter must never hold a reference to it.
      expect(fallback).not.toBe(TEMPLATE_POOLS[skill]);
      expect(fallback.map((t) => t.id)).toEqual(TEMPLATE_POOLS[skill].map((t) => t.id));
      const [question] = riddleFor(skill, createRng(7));
      expect(question.skill).toBe(skill);
    }
  });

  it('spec(A-066:AC-3) riddle ids are riddle_-prefixed and disjoint from every duel template id', () => {
    const duelIds = new Set(
      (Object.values(TEMPLATE_POOLS) as (readonly { id: string }[])[]).flatMap((pool) =>
        pool.map((t) => t.id),
      ),
    );
    for (const [skill, pool] of Object.entries(RIDDLE_POOLS)) {
      for (const template of pool ?? []) {
        expect(template.id.startsWith('riddle_'), `${skill}/${template.id}`).toBe(true);
        expect(duelIds.has(template.id), `${template.id} collides with a duel template`).toBe(false);
      }
    }
  });

  it('spec(A-066:AC-3) neither the riddle source nor the service imports the shared duel pool module', () => {
    for (const file of ['src/content/riddles.ts', 'src/services/encounter.ts']) {
      const source = src(file);
      expect(source.includes('templatePools'), `${file} must not import services/templatePools`).toBe(false);
      expect(source.includes('TEMPLATE_POOLS'), `${file} must not touch TEMPLATE_POOLS`).toBe(false);
    }
  });

  it('spec(A-066:AC-3) 30-seed sweep per riddle template: no throws, 4 distinct true choices, ladder fill < 25%', { timeout: 60000 }, () => {
    const failures: string[] = [];
    const pools = Object.entries(RIDDLE_POOLS);
    expect(pools.length).toBeGreaterThan(0);

    for (const [skill, pool] of pools) {
      for (const template of pool ?? []) {
        let ladderHits = 0;
        for (let seed = 1; seed <= 30; seed += 1) {
          let question;
          try {
            [question] = generateQuestion({ templates: [template], recentTemplateIds: [], rng: createRng(seed) });
          } catch (error) {
            failures.push(`${skill}/${template.id} seed=${seed}: threw ${String(error)}`);
            continue;
          }
          if (question.text.includes('{') || question.text.includes('}')) {
            failures.push(`${template.id} seed=${seed}: unrendered text "${question.text}"`);
          }
          if (question.choices.length !== CHOICE_COUNT) {
            failures.push(`${template.id} seed=${seed}: ${question.choices.length} choices`);
          }
          const values = question.choices.map((c) => c.value);
          if (new Set(values).size !== values.length) {
            failures.push(`${template.id} seed=${seed}: duplicate choices ${JSON.stringify(values)}`);
          }
          const expected = evaluateNumber(template.answerExpr, question.params);
          if (question.choices[question.correctIndex]?.value !== expected) {
            failures.push(`${template.id} seed=${seed}: correct choice is not the answer`);
          }
          if (describeDistractorSources(template, question.params).includes('ladder')) {
            ladderHits += 1;
          }
        }
        if (ladderHits / 30 >= 0.25) {
          failures.push(`${template.id}: ladder on ${ladderHits}/30 seeds — declared distractors collide too often`);
        }
      }
    }

    expect(failures, failures.slice(0, 20).join('\n')).toEqual([]);
  });
});

// ── AC-4: no wrong outcome ──────────────────────────────────────────────────────────────────────

describe('AC-4 — correct pays +8 exactly once, wrong pays nothing, both latch, never red', () => {
  it('spec(A-066:AC-4) a first correct completion pays exactly ENCOUNTER_COINS and sets the latch', () => {
    const store = bandedStore('k_1', 40);
    const outcome = completeEncounter(store, 'isla_products', true);
    expect(outcome).toEqual({ applied: true, coinsPaid: ENCOUNTER_COINS });
    expect(store.getState().captain.coins).toBe(40 + ENCOUNTER_COINS);
    expect(store.getState().captain.seenEncounters).toEqual(['isla_products']);
  });

  it('spec(A-066:AC-4) the latch is the idempotency: a replayed completion pays NOTHING', () => {
    // The mutation target: pay coins without checking the latch and this arithmetic reddens.
    const store = bandedStore('k_1', 40);
    completeEncounter(store, 'isla_products', true);

    const replayCorrect = completeEncounter(store, 'isla_products', true);
    const replayWrong = completeEncounter(store, 'isla_products', false);
    expect(replayCorrect).toEqual({ applied: false, coinsPaid: 0 });
    expect(replayWrong).toEqual({ applied: false, coinsPaid: 0 });
    expect(store.getState().captain.coins).toBe(40 + ENCOUNTER_COINS);
    expect(store.getState().captain.seenEncounters).toEqual(['isla_products']);
  });

  it('spec(A-066:AC-4) a wrong answer pays zero coins but latches the island all the same', () => {
    const store = bandedStore('g2_3', 25);
    const outcome = completeEncounter(store, 'quotient_cove', false);
    expect(outcome).toEqual({ applied: true, coinsPaid: 0 });
    expect(store.getState().captain.coins).toBe(25);
    expect(store.getState().captain.seenEncounters).toEqual(['quotient_cove']);
    expect(completeEncounter(store, 'quotient_cove', true)).toEqual({ applied: false, coinsPaid: 0 });
    expect(store.getState().captain.coins).toBe(25);
  });

  it('spec(A-066:AC-4) coins and latch land in ONE commit; a replay emits no commit at all', () => {
    const store = bandedStore('g4_5', 10);
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });
    completeEncounter(store, 'fraction_reef', true);
    expect(notifications).toBe(1);
    completeEncounter(store, 'fraction_reef', true);
    expect(notifications).toBe(1);
    unsubscribe();
  });

  it('spec(A-066:AC-4) the encounter never touches receipts — A-041’s key grammar gains no third kind', () => {
    const store = bandedStore('k_1', 0);
    const receiptsBefore = store.getState().captain.rewardReceipts;
    const sequenceBefore = store.getState().captain.nextPurchaseSequence;
    completeEncounter(store, 'port_sumwich', true);
    expect(store.getState().captain.rewardReceipts).toEqual(receiptsBefore);
    expect(Object.keys(store.getState().captain.rewardReceipts)).toEqual([]);
    expect(store.getState().captain.nextPurchaseSequence).toBe(sequenceBefore);
  });

  it('spec(A-066:AC-4) latch-only completion also works for the ask-nothing band (fails closed, still latches)', () => {
    const store = bandedStore(null, 5);
    expect(encounterSkillFor('grandline', store.getState().captain.gradeBand)).toBeNull();
    const outcome = completeEncounter(store, 'grandline', false);
    expect(outcome).toEqual({ applied: true, coinsPaid: 0 });
    expect(store.getState().captain.coins).toBe(5);
    expect(store.getState().captain.seenEncounters).toEqual(['grandline']);
  });

  it('spec(A-066:AC-4) the payout is the board’s own +8', () => {
    expect(ENCOUNTER_COINS).toBe(8);
    expect(rewardTitleFor(ENCOUNTER_COINS)).toBe('+8 coins');
  });

  it('spec(A-066:AC-4) amber, never red: the miss tile is amberSoft and no encounter file names a red', () => {
    expect(TILE_MISS).toEqual({ bg: color.amberSoft, shadow: color.goldDeep, ink: color.inkDark, mark: '~' });
    expect(color.amberSoft).toBe('#F0A315');

    for (const file of [CARD_SOURCE, BOARD_SOURCE]) {
      const source = src(file);
      for (const banned of ['D93A2E', 'dangerBg', 'dangerInk', 'hullCritical', 'sailStripe']) {
        expect(source.includes(banned), `${file} must not reference ${banned}`).toBe(false);
      }
    }
    // hosts.tsx may use the sailStripe TOKEN once — Pip's bandana is the board's own recipe, a
    // costume rather than a verdict — but no danger token and no raw red hex.
    const hosts = src(HOSTS_SOURCE);
    for (const banned of ['D93A2E', 'dangerBg', 'dangerInk', 'hullCritical']) {
      expect(hosts.includes(banned), `hosts.tsx must not reference ${banned}`).toBe(false);
    }
  });

  it('spec(A-066:AC-4) the reveal carries INK on success — white-on-success stays banned', () => {
    expect(TILE_CORRECT).toEqual({ bg: color.success, shadow: color.successDeep, ink: color.inkDark, mark: '✓' });
    expect(TILE_CORRECT.ink).not.toBe(color.white);
  });
});

// ── AC-1: the five board states, pixel numbers asserted directly ───────────────────────────────

describe('AC-1 — board fidelity: states, timings, geometry', () => {
  it('spec(A-066:AC-1) the state inventory is the board’s five, in board order', () => {
    expect(ENCOUNTER_STATES).toEqual(['entry', 'riddle', 'right', 'gentleMiss', 'exit']);
  });

  it('spec(A-066:AC-1) entry grows 340ms from the island’s own position (origin 76%/34%)', () => {
    expect(GROW.ms).toBe(340);
    expect(GROW.bezier).toEqual([0.2, 1.25, 0.4, 1]);
    expect(GROW.from).toEqual({ dx: 96, dy: 150, scale: 0.14 });
    expect(ORIGIN).toEqual({ x: 0.76, y: 0.34 });
  });

  it('spec(A-066:AC-1) exit tucks 320ms back into the island', () => {
    expect(TUCK.ms).toBe(320);
    expect(TUCK.bezier).toEqual([0.4, 0, 0.7, 1]);
  });

  it('spec(A-066:AC-1) the riddle bubble is 19px with a 44pt speaker slot; greetings run 22px', () => {
    expect(BUBBLE.riddleSize).toBe(19);
    expect(BUBBLE.greetingSize).toBe(22);
    expect(BUBBLE.speakerSlot.size).toBe(44);
  });

  it('spec(A-066:AC-1) four 72pt tiles in a 2×2 grid with 34px numerals, and no tile pre-ringed', () => {
    expect(TILE.height).toBe(72);
    expect(TILE.numeralSize).toBe(34);
    expect(TILE.columns).toBe(2);
    expect(TILE.gap).toBe(12);
    // The shipped build pre-rings nothing: before a pick every tile idles, unmarked.
    expect(tileLooks(4, null, 0)).toEqual([TILE_IDLE, TILE_IDLE, TILE_IDLE, TILE_IDLE]);
  });

  it('spec(A-066:AC-1) right answer: hop 620ms, three-coin arc 900ms staggered 80ms, ring burst 620ms', () => {
    expect(HOP.ms).toBe(620);
    expect(COIN_ARC.ms).toBe(900);
    expect(COIN_ARC.staggerMs).toBe(80);
    expect(COIN_ARC.arcs.map(({ dx, dy }) => ({ dx, dy }))).toEqual([
      { dx: -62, dy: -40 },
      { dx: -8, dy: -58 },
      { dx: 52, dy: -42 },
    ]);
    expect(RING_BURST).toEqual({ ms: 620, size: 76, fromScale: 0.86, toScale: 1.5, fromOpacity: 0.85 });
    expect(REWARD_POP.ms).toBe(220);
    expect(REWARD_RIGHT.bg).toBe(color.gold);
    expect(REWARD_RIGHT.subInk).toBe(color.goldDeepest);
  });

  it('spec(A-066:AC-1) gentle miss: amber ~ on the chosen tile, green ✓ reveal on the true one, shrug 520ms', () => {
    expect(SHRUG.ms).toBe(520);
    expect(tileLooks(4, 2, 0)).toEqual([TILE_CORRECT, TILE_IDLE, TILE_MISS, TILE_IDLE]);
    expect(tileLooks(4, 0, 0)).toEqual([TILE_CORRECT, TILE_IDLE, TILE_IDLE, TILE_IDLE]);
    expect(REWARD_MISS.bg).toBe(color.parchmentSunk);
    expect(REWARD_MISS.subInk).toBe(color.inkDarkMuted);
    expect(COPY.noHarm).toBe('No harm done');
  });

  it('spec(A-066:AC-1) both outcomes end on the identical Onward!, ringed at the 64pt floor', () => {
    expect(COPY.onward).toBe('Onward!');
    expect(ACTION_BUTTON.height).toBe(64);
    expect(ACTION_BUTTON.ring).toEqual({ inset: 5, width: 4, radius: 22 });
  });

  it('spec(A-066:AC-1) card berths and scrim match the board (110/90pt tops, .62 scrim)', () => {
    expect(CARD.top).toEqual({ entry: 110, riddle: 110, right: 90, gentleMiss: 90, exit: 110 });
    expect(CARD.radius).toBe(22);
    expect(SCRIM.opacity).toBe(0.62);
  });

  it('spec(A-066:AC-1) the win and miss lines carry the answer plainly', () => {
    expect(rightBubbleFor(5)).toBe('5! Thank you, Captain.');
    expect(missBubbleFor(5)).toBe('Close! It was 5.');
  });

  it('spec(A-066:AC-1) the component wires the board constants, not private copies', () => {
    const source = src(CARD_SOURCE);
    for (const wiring of [
      'GROW.ms',
      'TUCK.ms',
      'HOP.ms',
      'SHRUG.ms',
      'COIN_ARC.ms',
      'COIN_ARC.staggerMs',
      'RING_BURST.ms',
      'CARD.top[state]',
      'SCRIM.opacity',
      'tileLooks(',
      'COPY.onward',
      'COPY.sayHello',
    ]) {
      expect(source.includes(wiring), `EncounterCard.tsx must wire ${wiring}`).toBe(true);
    }
    // Seeded generation only — the encounter's riddle comes off the engine PRNG, never the host's.
    expect(source.includes('createRng(')).toBe(true);
    expect(source.includes('Math.random')).toBe(false);
  });
});

// ── AC-2: the five hosts ────────────────────────────────────────────────────────────────────────

describe('AC-2 — five hosts, keyed by island, to the board recipes', () => {
  it('spec(A-066:AC-2) the roster is keyed by island id with the board’s names, budgets and bob loops', () => {
    expect(Object.keys(HOSTS).sort()).toEqual([...ISLAND_IDS].sort());
    expect(HOSTS.port_sumwich).toMatchObject({ name: 'Nipper the crab', species: 'crab', shapeBudget: 5, bobMs: 2800 });
    expect(HOSTS.isla_products).toMatchObject({ name: 'Pip the parrot', species: 'parrot', shapeBudget: 6, bobMs: 3200 });
    expect(HOSTS.quotient_cove).toMatchObject({ name: 'Tumble the turtle', species: 'turtle', shapeBudget: 6, bobMs: 3600 });
    expect(HOSTS.fraction_reef).toMatchObject({ name: 'Ollie the octopus', species: 'octopus', shapeBudget: 6, bobMs: 3000 });
    expect(HOSTS.grandline).toMatchObject({ name: 'Gale the gull', species: 'gull', shapeBudget: 5, bobMs: 3400 });
  });

  it('spec(A-066:AC-2) the board’s new creature hexes are NAMED tokens; existing hexes stay referenced by token', () => {
    // New to tokens.ts, with the board as citation:
    expect(color.crabShell).toBe('#E8613C');
    expect(color.crabShellDeep).toBe('#B8462A');
    expect(color.turtleShell).toBe('#2E7D6B');
    expect(color.turtleShellDeep).toBe('#1E5A4C');
    // Already in tokens — the octopus IS the kraken pair, the parrot the success pair, the gull
    // wears fog-grey inkBright; the turtle's scutes are ghostGlow:
    expect(color.krakenPink).toBe('#F26FB2');
    expect(color.krakenDeep).toBe('#B33E86');
    expect(color.success).toBe('#2FB65E');
    expect(color.successDeep).toBe('#1E7F41');
    expect(color.inkBright).toBe('#C9D6E4');
    expect(color.ghostGlow).toBe('#8FE0AC');
  });

  it('spec(A-066:AC-2) hosts.tsx draws all five species from tokens only — zero raw hexes', () => {
    const source = src(HOSTS_SOURCE);
    expect(source).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    for (const figure of ['CrabFigure', 'ParrotFigure', 'TurtleFigure', 'OctopusFigure', 'GullFigure']) {
      expect(source.includes(`function ${figure}`), `hosts.tsx must define ${figure}`).toBe(true);
    }
    for (const token of ['color.crabShell', 'color.turtleShell', 'color.krakenPink', 'color.success', 'color.inkBright', 'color.ghostGlow']) {
      expect(source.includes(token), `hosts.tsx must reference ${token}`).toBe(true);
    }
    // Keyed by island id, bobbing at the roster's own period.
    expect(source.includes('HOSTS[islandId]')).toBe(true);
    expect(source.includes('spec.bobMs')).toBe(true);
    expect(source.includes('BOB.riseY')).toBe(true);
  });
});

// ── AC-5: no skip affordance — re-baselined under owner ruling D-13 ─────────────────────────────

describe('AC-5 — no skip affordance exists (re-baselined under D-13)', () => {
  it('spec(A-066:AC-5) re-baselined under D-13: no skip affordance exists', () => {
    // Owner ruling D-13 (tickets/app/OWNER-RULINGS.md, 2026-08-02): every voyage plays in full.
    // This spec used to pin the "Grown-ups: skip the island chats" link; it now pins its ABSENCE —
    // the encounter card and its board carry no skip row, no SKIP_LINK, and no grown-ups copy.
    for (const file of [CARD_SOURCE, BOARD_SOURCE]) {
      const source = src(file);
      expect(source.includes('SKIP_LINK'), `${file} still names SKIP_LINK`).toBe(false);
      expect(source.includes('onSkip'), `${file} still wires a skip handler`).toBe(false);
      expect(source, `${file} still styles a skip row`).not.toMatch(/skipRow|skipText/);
      expect(source.toLowerCase().includes('grown-ups'), `${file} still carries grown-ups copy`).toBe(
        false,
      );
    }
  });
});

// ── AC-7: the clarity lint — a riddle asks its whole question (D-13, part two) ──────────────────

describe('AC-7 — D-13 clarity lint: the closing question restates the action in full', () => {
  it('spec(A-066:AC-7) every loaded riddle ends on a full question that names what is asked (D-13)', () => {
    // Owner ruling D-13 (tickets/app/OWNER-RULINGS.md, 2026-08-02), part two: a riddle may never
    // end on an elliptical tail ("How many shells?"). Run against the REAL riddle loader so a
    // future truncated riddle fails here, not in front of a child.
    const templates = Object.entries(RIDDLE_POOLS).flatMap(([skill, pool]) =>
      (pool ?? []).map((template) => ({ skill, template })),
    );
    expect(templates.length).toBeGreaterThan(0);

    for (const { skill, template } of templates) {
      const text = template.text.trim();
      expect(text.endsWith('?'), `${skill}/${template.id} does not end with a question`).toBe(true);

      const sentences = text.split(/(?<=[.!?])\s+/);
      const closing = sentences[sentences.length - 1] ?? '';
      const words = closing.split(/\s+/).filter((word) => word.length > 0);
      expect(
        words.length,
        `${skill}/${template.id} closing question "${closing}" is under 5 words — an elliptical tail`,
      ).toBeGreaterThanOrEqual(5);
      expect(
        closing,
        `${skill}/${template.id} closing question "${closing}" does not restate the action`,
      ).toMatch(
        /\b(do|did|does|am|is|are|have|has|get|go|fit|fly|pop|sit|float|say|see|eat|squawk|fill|left|now|in all|each)\b/i,
      );
    }
  });
});

// ── AC-6: the public contract ───────────────────────────────────────────────────────────────────

describe('AC-6 — EncounterCard({ islandId, onDone }), self-contained; services export the pure pieces', () => {
  it('spec(A-066:AC-6) the service layer exports exactly the three pure pieces the ACs are driven on', () => {
    expect(encounterSkillFor).toBeTypeOf('function');
    expect(riddleFor).toBeTypeOf('function');
    expect(completeEncounter).toBeTypeOf('function');
  });

  it('spec(A-066:AC-6) the component’s props are exactly { islandId, onDone }', () => {
    const source = src(CARD_SOURCE);
    const match = source.match(/interface EncounterCardProps \{([\s\S]*?)\n\}/);
    expect(match, 'EncounterCard.tsx must declare EncounterCardProps').not.toBeNull();
    const props = (match?.[1] ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.includes(':'))
      .map((line) => line.replace(/^readonly\s+/, '').split(':')[0]?.trim());
    expect(props).toEqual(['islandId', 'onDone']);
    expect(source.includes('EncounterCard({ islandId, onDone }: EncounterCardProps)')).toBe(true);
  });

  it('spec(A-066:AC-6) self-contained: reads and writes the captain through the module store itself', () => {
    const source = src(CARD_SOURCE);
    expect(source.includes("from '../../stores/useCaptain'")).toBe(true);
    expect(source.includes('completeEncounter(captainStore, islandId')).toBe(true);
    // Mounted BY the chart; never reaches back into it or any route.
    expect(source.includes("from '../../../app")).toBe(false);
    expect(source.includes('expo-router')).toBe(false);
    // And never the duel's shared pool object (the riddle source rule, at the component too).
    expect(source.includes('templatePools')).toBe(false);
  });
});
