/**
 * A-014 — retire the placeholder question generator.
 *
 * Written before the implementation. `src/services/questions.ts` is a stopgap whose own header
 * says it must not reach a child: no template pool, no recency window, no distractor
 * plausibility. The engine's real generator (T-007) and all nine template files (T-014/015/016)
 * are done, and nothing in the app calls any of them — every question in the build today is
 * fake. This file is the contract that swaps the stopgap for the real thing.
 *
 * Nothing here renders a screen. The generator is pure and seeded and the duel reducer is pure,
 * so the whole ticket runs headless in the node runner — the same rule the app track has
 * followed since A-001. Nothing below imports `react-native`.
 *
 * ── The contract these tests assume ─────────────────────────────────────────────────────────
 *
 * `src/services/questions.ts` keeps its APP-FACING type and gains one field:
 *
 *     export interface DuelQuestion {
 *       readonly text: string;
 *       readonly answer: number;
 *       readonly choices: readonly number[];   // exactly CHOICE_COUNT, shuffled, answer once
 *       readonly readAloud: boolean;
 *       readonly templateId: string;           // NEW — the handle the recency window needs
 *     }
 *
 *     export function nextQuestion(
 *       skill: SkillId,
 *       rng: Rng,
 *       recentTemplateIds?: readonly string[],   // defaults to []
 *     ): readonly [DuelQuestion, Rng];
 *
 * WHY the app-facing shape survives rather than the engine's `Question`. Three reasons, in
 * order of force:
 *
 *  1. `src/components/duel/QuestionPanel.tsx` imports `DuelQuestion` and reads `question.text`,
 *     `question.answer` and `question.choices` as bare numbers (`choices.slice(0, 2)`, then
 *     `value === question.answer`). `src/components` is NOT in A-014's file_scopes. Adopting
 *     `Question` — `choices: readonly Choice[]`, `correctIndex` instead of `answer` — rewrites
 *     a component this ticket is not allowed to touch.
 *  2. `__tests__/app/duel-outcome.test.ts` (A-008, already frozen and passing) drives the real
 *     reducer and reads `question.answer` and `question.choices` as numbers. Adopting the
 *     engine shape breaks a frozen suite for a different ticket.
 *  3. The stopgap's header states the swap was meant to change which questions appear, not
 *     whether anything moves. Keeping the app-facing shape is that promise kept.
 *
 * So `nextQuestion` becomes a genuine ADAPTER — a projection of the engine's `Question` onto
 * `DuelQuestion` — rather than a re-export.
 *
 * WHY the signature gains a third parameter instead of the module remembering its own history.
 * AC-3 needs a recency window; AC-2 needs the same seed to give the same question forever.
 * Module-level mutable history satisfies the first and destroys the second — the second call at
 * seed 7 would differ from the first. So the history is threaded, exactly as T-007 threads it,
 * and `src/stores/duel.ts` (in file_scopes) carries it on `DuelState`. The parameter is
 * OPTIONAL so `nextQuestion(skill, rng)` still compiles: the swap must not be a rewrite.
 *
 * ── The template pool ───────────────────────────────────────────────────────────────────────
 *
 * For skill `S` the pool is exactly the templates whose `skill === S`, IN THE ORDER THEY APPEAR
 * in `src/content/templates/<S>.json`, each validated by `templateSchema`. Order is part of the
 * contract, not an implementation detail: `pick` indexes into the pool, so re-sorting it changes
 * which question a seed produces and the replay property becomes unreproducible. This suite
 * loads the same files from disk and re-derives the whole result, so a pool that is filtered,
 * re-ordered, deduplicated or hard-coded fails AC-1 immediately.
 *
 * Where the adapter READS those files from is deliberately not pinned — `src/content/index.ts`
 * currently claims to be the only module that touches catalog JSON, and it does not load
 * templates. Either it grows a `templates` export or the service imports the JSON itself;
 * nothing here can tell the difference, and nothing here should.
 *
 * ── How these tests are built to fail a cheat ───────────────────────────────────────────────
 *
 *  - AC-1 does not check that a question "looks generated". It re-derives the exact
 *    `generateQuestion` result from the shipped pool and asserts `toStrictEqual` on the
 *    projection AND on the returned `Rng`, so a hand-rolled generator that happens to produce
 *    plausible arithmetic still fails.
 *  - Every aggregate assertion carries a discriminator. AC-3's "no recently-served template" is
 *    satisfied by an implementation that excludes the whole history, so AC-3 also pins that
 *    templates PAST the window come back. AC-2's "identical" is satisfied by a constant, so
 *    AC-2 also pins that different seeds disagree.
 *  - AC-3's duel-level half is meaningless without a baseline, so it computes the no-window
 *    baseline in-test and asserts the baseline DOES repeat. A green test that would be green
 *    anyway is not a test.
 *  - AC-5 is a source scan (precedent: `spec(A-001:AC-7)` in `player-store.test.ts`) and is the
 *    weakest instrument here on purpose — it is the backstop for "the arithmetic was left in
 *    place next to the real generator", not the proof that the generator is used. AC-1 is that.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getCannon, skills } from '../../src/content/index';
import { templateSchema, type SkillId, type Template } from '../../src/content/schemas';
import { generateQuestion } from '../../src/engine/questions/generator';
import { createRng, type Rng } from '../../src/engine/rng';
import { CHOICE_COUNT, RECENT_TEMPLATE_WINDOW } from '../../src/engine/tuning';
import { nextQuestion, type DuelQuestion } from '../../src/services/questions';
import { duelReducer, initialDuelState, type DuelState } from '../../src/stores/duel';

// ── Fixtures ────────────────────────────────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '../..');
const TEMPLATES_DIR = join(REPO_ROOT, 'src/content/templates');
const ADAPTER_SRC_PATH = join(REPO_ROOT, 'src/services/questions.ts');

const ALL_SKILLS: readonly SkillId[] = skills.map((s) => s.id);

/**
 * The shipped pool for one skill, read from disk in file order and validated.
 *
 * Read here rather than imported from the app so the expectation is anchored to the CONTENT, not
 * to whatever the implementation decided to load.
 */
function poolFor(skill: SkillId): readonly Template[] {
  const raw = JSON.parse(readFileSync(join(TEMPLATES_DIR, `${skill}.json`), 'utf8')) as unknown[];
  const parsed = raw.map((entry) => templateSchema.parse(entry));
  return parsed.filter((template) => template.skill === skill);
}

const POOLS: ReadonlyMap<SkillId, readonly Template[]> = new Map(
  ALL_SKILLS.map((skill) => [skill, poolFor(skill)] as const),
);

function pool(skill: SkillId): readonly Template[] {
  const found = POOLS.get(skill);
  if (found === undefined || found.length === 0) throw new Error(`no template pool for ${skill}`);
  return found;
}

/**
 * The engine's answer, projected onto the app-facing shape — the expectation AC-1 compares
 * against. This is the adapter's whole job, restated independently.
 */
function expected(
  skill: SkillId,
  rng: Rng,
  recentTemplateIds: readonly string[] = [],
): readonly [DuelQuestion, Rng] {
  const [question, next] = generateQuestion({
    templates: pool(skill),
    recentTemplateIds,
    rng,
  });
  const answerChoice = question.choices[question.correctIndex];
  if (answerChoice === undefined) throw new Error('engine produced an out-of-range correctIndex');
  return [
    {
      text: question.text,
      answer: answerChoice.value,
      choices: question.choices.map((choice) => choice.value),
      readAloud: question.readAloud,
      templateId: question.templateId,
    },
    next,
  ];
}

/**
 * A template's `text` as a regex over rendered output: every `{name}` becomes an integer slot and
 * everything else must appear verbatim. `-?\d+` rather than `\d+` because a param range may be
 * negative, and anchored so extra text cannot slip past.
 */
function renderPattern(template: Template): RegExp {
  const escaped = template.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const withSlots = escaped.replace(/\\\{[A-Za-z_][A-Za-z0-9_]*\\\}/g, '-?\\d+');
  return new RegExp(`^${withSlots}$`);
}

/** A seed sweep wide enough that every one of the eight templates per skill is reachable. */
const SEEDS: readonly number[] = Array.from({ length: 60 }, (_, i) => i * 7919 + 13);

/** The starter gun, and the only cannon these duels fire — one skill, one pool, one history. */
const SWIVEL = getCannon('swivel_gun');

/**
 * Drives the real reducer through one whole duel, answering WRONG every turn so the duel runs
 * long (10-11 questions, more than twice `RECENT_TEMPLATE_WINDOW`) instead of ending in four.
 * Returns the template ids in the order the duel served them.
 */
function templateIdsServedInDuel(seed: number): readonly string[] {
  let state: DuelState = initialDuelState(seed);
  const served: string[] = [];

  for (let step = 0; step < 5000; step += 1) {
    if (state.phase === 'victory' || state.phase === 'defeat') return served;

    if (state.phase === 'select') {
      state = duelReducer(state, { type: 'PICK_CANNON', cannon: SWIVEL });
      continue;
    }

    if (state.phase === 'question') {
      const question = state.question;
      if (question === null) throw new Error('question phase with no question');
      served.push(question.templateId);
      const wrong = question.choices.find((choice) => choice !== question.answer);
      if (wrong === undefined) throw new Error('question offered no wrong choice');
      state = duelReducer(state, { type: 'ANSWER', value: wrong, elapsedMs: SWIVEL.timerMs });
      continue;
    }

    state = duelReducer(state, { type: 'ADVANCE' });
  }

  throw new Error(`duel never terminated — stuck in phase '${state.phase}'`);
}

/** Counts draws that repeat a template already served inside the trailing recency window. */
function repeatsInsideWindow(served: readonly string[]): number {
  let repeats = 0;
  for (let i = 1; i < served.length; i += 1) {
    const window = served.slice(Math.max(0, i - RECENT_TEMPLATE_WINDOW), i);
    if (window.includes(served[i] as string)) repeats += 1;
  }
  return repeats;
}

// ── AC-1 — the questions come from the engine and its template pool ─────────────────────────

describe('A-014 the question adapter', () => {
  it('spec(A-014:AC-1) every question is exactly what the engine generator produces from the shipped pool', () => {
    const mismatches: string[] = [];

    for (const skill of ALL_SKILLS) {
      for (const seed of SEEDS) {
        const [actualQuestion, actualRng] = nextQuestion(skill, createRng(seed));
        const [expectedQuestion, expectedRng] = expected(skill, createRng(seed));

        if (JSON.stringify(actualQuestion) !== JSON.stringify(expectedQuestion)) {
          mismatches.push(
            `${skill}/${seed} question: ${JSON.stringify(actualQuestion)} != ${JSON.stringify(expectedQuestion)}`,
          );
        }
        if (JSON.stringify(actualRng) !== JSON.stringify(expectedRng)) {
          mismatches.push(
            `${skill}/${seed} rng: ${JSON.stringify(actualRng)} != ${JSON.stringify(expectedRng)}`,
          );
        }
      }
    }

    // Collected then asserted once, so a failure reports the shape of the divergence rather
    // than dying on the first seed.
    expect(mismatches.slice(0, 5), `${mismatches.length} divergences`).toEqual([]);
  });

  it('spec(A-014:AC-1) every shipped template for a skill is reachable, and nothing else is', () => {
    const unreachable: string[] = [];
    const foreign: string[] = [];

    for (const skill of ALL_SKILLS) {
      const shipped = new Set(pool(skill).map((template) => template.id));
      const served = new Set<string>();
      for (const seed of SEEDS) {
        const [question] = nextQuestion(skill, createRng(seed));
        served.add(question.templateId);
        if (!shipped.has(question.templateId)) foreign.push(`${skill}/${seed}: ${question.templateId}`);
      }
      for (const id of shipped) {
        if (!served.has(id)) unreachable.push(`${skill}: ${id}`);
      }
    }

    // A generator hard-wired to one template, or to a pool it built itself, fails one of these.
    expect(foreign, 'a template id that is not in this skill’s shipped pool').toEqual([]);
    expect(unreachable, 'a shipped template no seed can reach').toEqual([]);
  });

  it('spec(A-014:AC-1) the text a child reads is its template rendered, word problems included', () => {
    // Independent of the re-derivation above and of `templateId`, which an app-layer generator
    // could simply copy off a real template while rendering its own arithmetic underneath. This
    // reads the TEXT: it must be the claimed template's own sentence with its `{tokens}` filled
    // in, and across the sweep the six skills that ship word problems must actually produce one.
    // No amount of `${a} + ${b} = ?` assembly in the app layer can satisfy either half.
    const wrongShape: string[] = [];
    const missingWordProblems: string[] = [];

    for (const skill of ALL_SKILLS) {
      const byId = new Map(pool(skill).map((template) => [template.id, template] as const));
      const shipsWordProblems = pool(skill).some((template) => template.isWordProblem === true);
      let sawWordProblem = false;

      for (const seed of SEEDS) {
        const [question] = nextQuestion(skill, createRng(seed));
        const template = byId.get(question.templateId);
        if (template === undefined) {
          wrongShape.push(`${skill}/${seed}: unknown template ${String(question.templateId)}`);
          continue;
        }
        if (!renderPattern(template).test(question.text)) {
          wrongShape.push(`${skill}/${seed}: "${question.text}" is not "${template.text}" rendered`);
          continue;
        }
        if (template.isWordProblem === true) sawWordProblem = true;
      }

      if (shipsWordProblems && !sawWordProblem) missingWordProblems.push(skill);
    }

    expect(wrongShape.slice(0, 5), `${wrongShape.length} texts that are not their template`).toEqual([]);
    expect(
      missingWordProblems,
      'skills that ship word problems but never rendered one across the sweep',
    ).toEqual([]);
  });

  // ── AC-2 — the replay property survives the swap ──────────────────────────────────────────

  it('spec(A-014:AC-2) the same seed and skill always yield the identical question and rng', () => {
    const drifted: string[] = [];

    for (const skill of ALL_SKILLS) {
      for (const seed of SEEDS) {
        // Five calls, not two. Two catches a pure function that is not; five also catches a
        // module-level recency cache, which would satisfy AC-3 and quietly destroy replay.
        const runs = Array.from({ length: 5 }, () => nextQuestion(skill, createRng(seed)));
        const first = JSON.stringify(runs[0]);
        for (let i = 1; i < runs.length; i += 1) {
          if (JSON.stringify(runs[i]) !== first) {
            drifted.push(`${skill}/${seed} call ${i + 1}: ${JSON.stringify(runs[i])} != ${first}`);
          }
        }
      }
    }

    expect(drifted.slice(0, 5), `${drifted.length} drifted calls`).toEqual([]);
  });

  it('spec(A-014:AC-2) a reused Rng value is not mutated, and re-drawing from it repeats exactly', () => {
    for (const skill of ALL_SKILLS) {
      const rng = createRng(4242);
      const before = JSON.stringify(rng);
      const [a, rngA] = nextQuestion(skill, rng);
      const [b, rngB] = nextQuestion(skill, rng);
      expect(JSON.stringify(rng), `${skill}: nextQuestion mutated the Rng it was handed`).toBe(before);
      expect(a).toStrictEqual(b);
      expect(rngA).toStrictEqual(rngB);
    }
  });

  it('spec(A-014:AC-2) different seeds disagree — identical is a property, not a constant', () => {
    // The discriminator for the two tests above: an implementation returning one frozen question
    // passes "identical" perfectly and fails here.
    for (const skill of ALL_SKILLS) {
      const rendered = new Set(SEEDS.map((seed) => JSON.stringify(nextQuestion(skill, createRng(seed))[0])));
      expect(
        rendered.size,
        `${skill} produced ${rendered.size} distinct questions across ${SEEDS.length} seeds`,
      ).toBeGreaterThan(1);
    }
  });

  it('spec(A-014:AC-2) the adapter draws no entropy of its own', () => {
    // Behavioural purity, not a source scan (LESSONS.md L-013): poison the global sources of
    // non-determinism and require the same answer. `Math.random` only — the distractor screen
    // legitimately uses `Math.abs`.
    const realRandom = Math.random;
    const realNow = Date.now;
    const skill = ALL_SKILLS[0] as SkillId;
    const clean = nextQuestion(skill, createRng(31337));

    try {
      Math.random = () => {
        throw new Error('the adapter reached for Math.random');
      };
      Date.now = () => {
        throw new Error('the adapter reached for the clock');
      };
      expect(nextQuestion(skill, createRng(31337))).toStrictEqual(clean);
    } finally {
      Math.random = realRandom;
      Date.now = realNow;
    }
  });

  // ── AC-3 — the recency window actually applies ────────────────────────────────────────────

  it('spec(A-014:AC-3) a template inside the recency window is never served', () => {
    const violations: string[] = [];

    for (const skill of ALL_SKILLS) {
      const ids = pool(skill).map((template) => template.id);
      expect(
        ids.length,
        `${skill} ships ${ids.length} templates; a window of ${RECENT_TEMPLATE_WINDOW} cannot bite unless there are more`,
      ).toBeGreaterThan(RECENT_TEMPLATE_WINDOW);

      // Most-recent-first, exactly as `generateQuestion` reads its own `recentTemplateIds`.
      const recent = ids.slice(0, RECENT_TEMPLATE_WINDOW);
      const shipped = new Set(ids);
      for (const seed of SEEDS) {
        const [question] = nextQuestion(skill, createRng(seed), recent);
        // Checked FIRST, or this whole criterion is vacuously satisfied by an adapter that
        // serves no template id at all: `[...].includes(undefined)` is false for every window.
        if (!shipped.has(question.templateId)) {
          violations.push(`${skill}/${seed}: served ${String(question.templateId)}, not a shipped id`);
          continue;
        }
        if (recent.includes(question.templateId)) {
          violations.push(`${skill}/${seed}: served ${question.templateId} from the window`);
        }
      }
    }

    expect(violations.slice(0, 5), `${violations.length} violations`).toEqual([]);
  });

  it('spec(A-014:AC-3) only the window is excluded — history older than it comes back', () => {
    // The discriminator. "Never re-serve anything ever seen" also passes the test above and is a
    // different, worse rule: with eight templates it starves the pool inside two duels.
    const starved: string[] = [];

    for (const skill of ALL_SKILLS) {
      const ids = pool(skill).map((template) => template.id);
      // A history longer than the window: everything, most-recent-first. Only the first
      // RECENT_TEMPLATE_WINDOW entries may be filtered; the tail must stay eligible.
      const eligible = new Set(ids.slice(RECENT_TEMPLATE_WINDOW));
      const served = new Set<string>();
      for (const seed of SEEDS) {
        const [question] = nextQuestion(skill, createRng(seed), ids);
        served.add(question.templateId);
      }
      for (const id of eligible) {
        if (!served.has(id)) starved.push(`${skill}: ${id} never served though outside the window`);
      }
      for (const id of served) {
        if (!eligible.has(id)) starved.push(`${skill}: ${id} served though inside the window`);
      }
    }

    expect(starved.slice(0, 5), `${starved.length} eligibility errors`).toEqual([]);
  });

  it('spec(A-014:AC-3) a real duel threads the window across its whole sequence of draws', () => {
    // The adapter can honour a window it is never given. This is the half that proves
    // `src/stores/duel.ts` actually carries the history from one question to the next.
    //
    // Re-hunted 2026-08-03 under D-14 (OWNER-RULINGS.md; A-069/A-070): the harness's legacy
    // captain is top-band, and Port Sumwich's g4_5 cell now teaches `div_facts` — so the rival
    // fires the mortar instead of an add_within_10 gun and these wrong-answer duels run shorter.
    // Seed 31689's duel fell to exactly RECENT_TEMPLATE_WINDOW draws, which the harness guard
    // below rightly refuses; it is swapped for the next seed in the same sweep (158393, 8 draws).
    // Still 20 duels, and the guard keeps its teeth — nothing here computes its way around it.
    const duelSeeds = SEEDS.slice(0, 21).filter((seed) => seed !== 31689);
    let totalDraws = 0;
    let totalRepeats = 0;
    const short: string[] = [];

    for (const seed of duelSeeds) {
      const served = templateIdsServedInDuel(seed);
      if (served.length <= RECENT_TEMPLATE_WINDOW) short.push(`${seed}: only ${served.length} draws`);
      totalDraws += served.length;
      totalRepeats += repeatsInsideWindow(served);
    }

    expect(short, 'duels too short for the window to bite — the harness, not the code').toEqual([]);

    // The baseline, computed here rather than assumed: the same number of draws from the same
    // pool with NO window. If this were also zero the assertion below would prove nothing.
    let baselineRepeats = 0;
    let baselineDraws = 0;
    const drawsPerDuel = Math.round(totalDraws / duelSeeds.length);
    for (const seed of duelSeeds) {
      let rng = createRng(seed);
      const served: string[] = [];
      for (let i = 0; i < drawsPerDuel; i += 1) {
        const [question, next] = expected('add_within_10', rng, []);
        rng = next;
        served.push(question.templateId);
      }
      baselineDraws += served.length;
      baselineRepeats += repeatsInsideWindow(served);
    }
    expect(
      baselineRepeats,
      `windowless baseline over ${baselineDraws} draws must repeat, or this test is vacuous`,
    ).toBeGreaterThan(0);

    expect(
      totalRepeats,
      `${totalRepeats} of ${totalDraws} duel draws re-served a template inside the window of ${RECENT_TEMPLATE_WINDOW}`,
    ).toBe(0);
  });

  // ── AC-4 — the four choices ───────────────────────────────────────────────────────────────

  it('spec(A-014:AC-4) every question offers exactly CHOICE_COUNT choices, the answer once', () => {
    const faults: string[] = [];

    const inspect = (label: string, question: DuelQuestion): void => {
      if (question.choices.length !== CHOICE_COUNT) {
        faults.push(`${label}: ${question.choices.length} choices, expected ${CHOICE_COUNT}`);
      }
      const occurrences = question.choices.filter((choice) => choice === question.answer).length;
      if (occurrences !== 1) {
        faults.push(`${label}: answer ${question.answer} appears ${occurrences} times`);
      }
      if (new Set(question.choices).size !== question.choices.length) {
        faults.push(`${label}: duplicate choices ${JSON.stringify(question.choices)}`);
      }
      if (!question.choices.every((choice) => Number.isFinite(choice))) {
        faults.push(`${label}: a choice is not a finite number ${JSON.stringify(question.choices)}`);
      }
    };

    for (const skill of ALL_SKILLS) {
      // Fresh draws...
      for (const seed of SEEDS) {
        inspect(`${skill}/${seed}`, nextQuestion(skill, createRng(seed))[0]);
      }
      // ...and draws taken under a recency window, where a shrunken pool is most likely to
      // starve the distractor screen.
      const recent = pool(skill)
        .map((template) => template.id)
        .slice(0, RECENT_TEMPLATE_WINDOW);
      for (const seed of SEEDS) {
        inspect(`${skill}/${seed}/windowed`, nextQuestion(skill, createRng(seed), recent)[0]);
      }
    }

    expect(faults.slice(0, 5), `${faults.length} malformed choice sets`).toEqual([]);
  });

  it('spec(A-014:AC-4) the answer a duel accepts is the one the engine marked correct', () => {
    // `answer` is a projection of `choices[correctIndex]`. If the adapter recomputed it — say by
    // re-evaluating the template — a shuffle bug would be invisible. This pins the projection.
    const wrong: string[] = [];
    for (const skill of ALL_SKILLS) {
      for (const seed of SEEDS) {
        const [question] = generateQuestion({
          templates: pool(skill),
          recentTemplateIds: [],
          rng: createRng(seed),
        });
        const [adapted] = nextQuestion(skill, createRng(seed));
        const marked = question.choices[question.correctIndex]?.value;
        if (adapted.answer !== marked) {
          wrong.push(`${skill}/${seed}: adapter says ${adapted.answer}, engine marked ${String(marked)}`);
        }
      }
    }
    expect(wrong.slice(0, 5), `${wrong.length} mismatched answers`).toEqual([]);
  });

  // ── AC-5 — no arithmetic left in the app layer ────────────────────────────────────────────

  describe('spec(A-014:AC-5) the app layer keeps no arithmetic of its own', () => {
    const SOURCE = readFileSync(ADAPTER_SRC_PATH, 'utf8');

    /**
     * Comments are prose — a header that explains why `a + b` is gone is not `a + b`. Block
     * comments first, then trailing line comments (the `[^:]` guard keeps `https://` intact).
     */
    const stripComments = (src: string): string =>
      src.replace(/\/\*[\s\S]*?\*\//g, '\n').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

    /** Import lines carry `import * as` and slash-separated paths; scanned separately. */
    const stripImports = (src: string): string => src.replace(/^import[\s\S]*?;$/gm, '');

    /**
     * Blanks quoted strings so a message like `'A-014 has no pool'` is not read as subtraction,
     * while KEEPING every `${...}` interpolation inside a template literal — `${a + b}` is
     * arithmetic hiding in a string, and dropping the whole literal would let it through.
     */
    const stripLiterals = (src: string): string =>
      src
        .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
        .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
        .replace(/`(?:[^`\\]|\\.)*`/g, (literal) => (literal.match(/\$\{[^}]*\}/g) ?? []).join(' '));

    const CODE = stripComments(SOURCE);
    const BODY = stripImports(CODE);
    /** The executable body with its string CONTENT removed — where operators are looked for. */
    const EXPRESSIONS = stripLiterals(BODY);

    /** Every quoted string and template literal in the executable body, verbatim. */
    const literals = (src: string): readonly string[] => src.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g) ?? [];

    it('spec(A-014:AC-5) it computes no operands, answers or distractors', () => {
      const OPERATORS: readonly (readonly [string, RegExp])[] = [
        ['addition', /[\w)\]]\s*\+\s*[\w(]/],
        ['subtraction', /[\w)\]]\s*-\s*[\w(]/],
        ['multiplication', /[\w)\]]\s*\*\s*[\w(]/],
        ['division', /[\w)\]]\s*\/\s*[\w(]/],
        ['modulo', /[\w)\]]\s*%\s*[\w(]/],
        ['increment/decrement', /(\+\+|--)/],
        ['compound assignment', /[\w)\]]\s*[+\-*/%]=/],
      ];

      const found = OPERATORS.filter(([, pattern]) => pattern.test(EXPRESSIONS)).map(([name]) => name);
      expect(found, `arithmetic still in ${ADAPTER_SRC_PATH}`).toEqual([]);
    });

    it('spec(A-014:AC-5) it builds no question text and reaches for no math helpers', () => {
      // The stopgap renders `${a} + ${b} = ?`, `${a} × ${b} = ?`, `${total} − ${take} = ?`.
      // Every one of those characters is a template's job now.
      const offending = literals(BODY).filter((literal) => /[+×÷−*]|=\s*\?/.test(literal));
      expect(offending, 'question text assembled in the app layer').toEqual([]);

      // `nextInt` drew its operands, `shuffle` shuffled its own choice set, `Math.*` clamped
      // them. The engine owns all three now; none of them belongs in an adapter.
      const helpers = ['nextInt', 'shuffle', 'Math.'].filter((helper) => CODE.includes(helper));
      expect(helpers, 'engine primitives the adapter should no longer call directly').toEqual([]);
    });

    it('spec(A-014:AC-5) it delegates to the engine generator', () => {
      // The positive half: absence of arithmetic is also satisfied by a file that throws.
      expect(CODE).toMatch(/generateQuestion/);
      expect(CODE).toMatch(/questions\/generator/);
    });
  });
});
