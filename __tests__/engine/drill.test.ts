/**
 * T-017 — `src/engine/drill.ts`: gunnery-range drill session (full-rate mastery practice loop).
 *
 * PLAN.md §Sea chart: "each island has a gunnery range (training)"; "range drills fill a skill's
 * meter at full rate". Milestone 1: "run a practice drill that fills a mastery meter → the meter
 * unlocks the next cannon". This is "a meter, not a new mode" — no opponent, hull, damage, or
 * cannon; just questions and mastery applied at `MASTERY_RATE_RANGE` via `applyAnswer(..., 'range', ...)`.
 *
 * HOW THIS SUITE IS BUILT
 * -----------------------------------------------------------------------------------------
 * - Templates are injected fixtures (ticket Planning Decisions), parsed through `templateSchema`
 *   so every pool entry is content-pipeline-valid — no dependency on the T-019 registry.
 * - Mastery expectations are derived from `@engine/mastery` + tuning constants, never from a
 *   re-implemented rate (L-012 / DoD-4): if the drill invents its own arithmetic, AC-3/AC-9 drift.
 * - Recency (AC-11) asserts the *question sequence* property from T-007's most-recent-first
 *   window, not a hard-coded exclusion list (L-012).
 * - Purity (AC-12/13/14, DoD-5/6) is behavioural: poison `Math.random`/`Date`, deep-equal
 *   replays, snapshot immutability, JSON round-trip.
 *
 * Traceability: behavioural tests use spec tags of the form T-017 AC-<n>; DoD coverage uses
 * numbered dod tags for T-017 items 1 through 7 (see the Definition of Done block below).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { templateSchema } from '@content/schemas';
import type { SkillId, Template } from '@content/schemas';
import { applyAnswer, emptyMastery, isMastered, meterPercent, type SkillMastery } from '@engine/mastery';
import { createRng, type Rng } from '@engine/rng';
import { QuestionGenerationError, type Question } from '@engine/questions/types';
import {
  CHOICE_COUNT,
  MASTERY_RATE_RANGE,
  MASTERY_THRESHOLD_CORRECT,
  RECENT_TEMPLATE_WINDOW,
} from '@engine/tuning';
import {
  answerDrill as answerDrillUnderTest,
  startDrill as startDrillUnderTest,
  type DrillAnswer,
  type DrillSession,
} from '@engine/drill';

// =============================================================================================
// Signature pins (honest RED typecheck — LESSONS.md L-024)
// =============================================================================================

type StartDrillInput = {
  readonly skillId: SkillId;
  readonly templates: readonly Template[];
  readonly mastery: SkillMastery;
  readonly rng: Rng;
  readonly length: number;
};

const startDrill: (input: StartDrillInput) => DrillSession = startDrillUnderTest;
const answerDrill: (session: DrillSession, choiceIndex: number | null, elapsedMs: number) => DrillSession =
  answerDrillUnderTest;

// =============================================================================================
// Fixtures
// =============================================================================================

const SKILL: SkillId = 'add_within_10';
const SEED = 17_017;
const DEFAULT_ELAPSED_MS = 1_000;

function nearMissDistractors(answerExpr: string): readonly [string, string, string] {
  return [`(${answerExpr}) + 1`, `(${answerExpr}) - 1`, `(${answerExpr}) + 2`];
}

function makeTemplate(spec: {
  readonly id: string;
  readonly skill?: SkillId;
  readonly text?: string;
  readonly params?: Readonly<Record<string, readonly [number, number]>>;
  readonly answerExpr?: string;
  readonly distractors?: readonly [string, string, string];
}): Template {
  const answerExpr = spec.answerExpr ?? 'a + 1';
  const params: Record<string, [number, number]> = {};
  const rawParams = spec.params ?? { a: [1, 5] as const };
  for (const [name, range] of Object.entries(rawParams)) {
    params[name] = [range[0], range[1]];
  }
  return templateSchema.parse({
    id: spec.id,
    skill: spec.skill ?? SKILL,
    text: spec.text ?? `{a} + 1 = ?`,
    params,
    answerExpr,
    distractors: [...(spec.distractors ?? nearMissDistractors(answerExpr))],
  });
}

/** A pool large enough for recency exclusion without emptying (AC-11 / T-007 contract). */
function makePool(size: number): readonly Template[] {
  return Array.from({ length: size }, (_, index) =>
    makeTemplate({
      id: `drill_fixture_${index}`,
      text: `{a} + ${index} = ?`,
      answerExpr: `a + ${index}`,
      params: { a: [1, 6] },
    }),
  );
}

const TWO_TEMPLATES = makePool(2);
const EIGHT_TEMPLATES = makePool(8);

function start(overrides: Partial<StartDrillInput> = {}): DrillSession {
  return startDrill({
    skillId: SKILL,
    templates: TWO_TEMPLATES,
    mastery: emptyMastery,
    rng: createRng(SEED),
    length: 10,
    ...overrides,
  });
}

function requireCurrent(session: DrillSession): Question {
  expect(session.current, 'expected a live question').not.toBeNull();
  return session.current as Question;
}

function answerCorrect(session: DrillSession, elapsedMs = DEFAULT_ELAPSED_MS): DrillSession {
  const current = requireCurrent(session);
  return answerDrill(session, current.correctIndex, elapsedMs);
}

function answerWrong(session: DrillSession, elapsedMs = DEFAULT_ELAPSED_MS): DrillSession {
  const current = requireCurrent(session);
  const wrongIndex = (current.correctIndex + 1) % CHOICE_COUNT;
  return answerDrill(session, wrongIndex, elapsedMs);
}

/** Run a full drill, answering with the given correctness pattern (true = correct). */
function runDrill(input: StartDrillInput, answers: readonly boolean[]): DrillSession {
  let session = startDrill(input);
  expect(answers.length).toBe(input.length);
  for (const correct of answers) {
    session = correct ? answerCorrect(session) : answerWrong(session);
  }
  return session;
}

function choiceValues(question: Question): number[] {
  return question.choices.map((choice) => choice.value);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '../..');
const TICKET_PATH = join(REPO_ROOT, 'tickets/T-017.md');
const SUITE_PATH = fileURLToPath(import.meta.url);
const DRILL_SRC_PATH = join(REPO_ROOT, 'src/engine/drill.ts');

const TICKET_SOURCE = readFileSync(TICKET_PATH, 'utf8');
const OWN_SOURCE = readFileSync(SUITE_PATH, 'utf8');

const DEFERRED_WORK_MARKERS = [['TO', 'DO'].join(''), ['FIX', 'ME'].join(''), ['HA', 'CK'].join('')];
const FOCUSED_TEST_PATTERN = new RegExp(
  ['\\b(it|test|describe)\\.(', 'sk', 'ip|on', 'ly)\\b|\\b', 'x', '(it|describe)\\b'].join(''),
);

// =============================================================================================
// AC-1 — startDrill construction
// =============================================================================================

describe('AC-1 — startDrill constructs a live, unstarted session', () => {
  it('spec(T-017:AC-1) answered/correct are 0, complete is false, current is a Question', () => {
    const mastery: SkillMastery = { weightedCorrect: 2, correct: 2, attempts: 3 };
    const session = start({ length: 10, mastery });

    expect(session.answered).toBe(0);
    expect(session.correct).toBe(0);
    expect(session.complete).toBe(false);
    expect(session.length).toBe(10);
    expect(session.skillId).toBe(SKILL);
    expect(session.log).toEqual([]);
    expect(session.recentTemplateIds).toEqual([]);

    const current = requireCurrent(session);
    expect(current.choices).toHaveLength(CHOICE_COUNT);
    expect(new Set(choiceValues(current)).size).toBe(CHOICE_COUNT);
    expect(session.mastery).toStrictEqual(mastery);
  });
});

// =============================================================================================
// AC-2 — startDrill validation
// =============================================================================================

describe('AC-2 — startDrill rejects invalid length and empty pools', () => {
  it.each([0, -1, -10, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY] as const)(
    'spec(T-017:AC-2) length %s throws RangeError',
    (length) => {
      expect(() => start({ length })).toThrow(RangeError);
    },
  );

  it('spec(T-017:AC-2) empty templates throws QuestionGenerationError with code NO_TEMPLATE', () => {
    let thrown: unknown;
    try {
      start({ templates: [] });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(QuestionGenerationError);
    expect((thrown as QuestionGenerationError).code).toBe('NO_TEMPLATE');
  });
});

// =============================================================================================
// AC-3 … AC-6 — grading matrix
// =============================================================================================

describe('AC-3 — correct answer fills mastery at full range rate', () => {
  it('spec(T-017:AC-3) answered/correct increment and mastery matches applyAnswer(..., "range", true)', () => {
    const session = start({ mastery: emptyMastery, length: 3 });
    const next = answerCorrect(session);

    expect(next.answered).toBe(1);
    expect(next.correct).toBe(1);
    expect(next.mastery).toStrictEqual(applyAnswer(emptyMastery, 'range', true));
    expect(next.mastery.weightedCorrect).toBe(MASTERY_RATE_RANGE);
    expect(next.mastery.correct).toBe(1);
    expect(next.mastery.attempts).toBe(1);
    expect(next.log).toHaveLength(1);
    expect(next.log[0]).toMatchObject({
      templateId: requireCurrent(session).templateId,
      choiceIndex: requireCurrent(session).correctIndex,
      correct: true,
      elapsedMs: DEFAULT_ELAPSED_MS,
    } satisfies Partial<DrillAnswer>);
  });
});

describe('AC-4 — wrong answer increments attempts only', () => {
  it('spec(T-017:AC-4) session.correct stays 0; weightedCorrect unchanged; attempts +1', () => {
    const prior: SkillMastery = { weightedCorrect: 4, correct: 4, attempts: 5 };
    const session = start({ mastery: prior, length: 3 });
    const next = answerWrong(session);

    expect(next.correct).toBe(0);
    expect(next.answered).toBe(1);
    expect(next.mastery.weightedCorrect).toBe(prior.weightedCorrect);
    expect(next.mastery.correct).toBe(prior.correct);
    expect(next.mastery.attempts).toBe(prior.attempts + 1);
    expect(next.mastery).toStrictEqual(applyAnswer(prior, 'range', false));
    expect(next.log[0]?.correct).toBe(false);
  });
});

describe('AC-5 / T-036 — timeout (choiceIndex null) charges nothing (D-8)', () => {
  it('spec(T-017:AC-5) spec(T-036:AC-1,AC-2,AC-3) timeout: mastery/answered unchanged; same question; log only', () => {
    const prior: SkillMastery = { weightedCorrect: 1, correct: 1, attempts: 1 };
    const session = start({ mastery: prior, length: 3 });
    const before = requireCurrent(session);
    const next = answerDrill(session, null, 2_500);

    // D-8: neither asked nor correct — applyAnswer is not called.
    expect(next.mastery).toStrictEqual(prior);
    expect(next.answered).toBe(0);
    expect(next.correct).toBe(0);
    expect(next.complete).toBe(false);
    expect(requireCurrent(next).templateId).toBe(before.templateId);
    expect(requireCurrent(next).correctIndex).toBe(before.correctIndex);
    expect(next.log[0]).toStrictEqual({
      templateId: before.templateId,
      choiceIndex: null,
      correct: false,
      elapsedMs: 2_500,
    } satisfies DrillAnswer);
  });

  it('spec(T-036:AC-4) a real wrong choice still charges attempts (D-8 does not soften misses)', () => {
    const prior: SkillMastery = { weightedCorrect: 4, correct: 4, attempts: 5 };
    const session = start({ mastery: prior, length: 3 });
    const next = answerWrong(session);
    expect(next.mastery.attempts).toBe(prior.attempts + 1);
    expect(next.answered).toBe(1);
  });
});

describe('AC-6 — invalid choiceIndex / elapsedMs throw without advancing', () => {
  it.each([
    [-1, DEFAULT_ELAPSED_MS],
    [CHOICE_COUNT, DEFAULT_ELAPSED_MS],
    [99, DEFAULT_ELAPSED_MS],
    [0, -1],
    [1, -0.01],
  ] as const)(
    'spec(T-017:AC-6) choiceIndex=%s elapsedMs=%s throws RangeError and leaves session unchanged',
    (choiceIndex, elapsedMs) => {
      const session = start({ length: 3 });
      const before = structuredClone(session);

      expect(() => answerDrill(session, choiceIndex, elapsedMs)).toThrow(RangeError);
      expect(session).toStrictEqual(before);
      expect(session.answered).toBe(0);
      expect(session.log).toHaveLength(0);
    },
  );
});

// =============================================================================================
// AC-7 / AC-8 — completion
// =============================================================================================

describe('AC-7 — drill completes after length answers', () => {
  it('spec(T-017:AC-7) after 10 answers: answered 10, complete true, current null, log length 10', () => {
    const final = runDrill(
      {
        skillId: SKILL,
        templates: TWO_TEMPLATES,
        mastery: emptyMastery,
        rng: createRng(SEED),
        length: 10,
      },
      Array.from({ length: 10 }, (_, i) => i % 2 === 0),
    );

    expect(final.answered).toBe(10);
    expect(final.complete).toBe(true);
    expect(final.current).toBeNull();
    expect(final.log).toHaveLength(10);
  });
});

describe('AC-8 — answering a completed session throws', () => {
  it('spec(T-017:AC-8) answerDrill on a complete session throws an Error naming completed state', () => {
    const final = runDrill(
      {
        skillId: SKILL,
        templates: TWO_TEMPLATES,
        mastery: emptyMastery,
        rng: createRng(SEED),
        length: 2,
      },
      [true, true],
    );
    expect(final.complete).toBe(true);

    let thrown: unknown;
    try {
      answerDrill(final, 0, DEFAULT_ELAPSED_MS);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(RangeError);
    expect(String((thrown as Error).message).toLowerCase()).toMatch(/complet/);
  });
});

// =============================================================================================
// AC-9 / AC-10 — progression stories
// =============================================================================================

describe('AC-9 — ten correct range answers masters the skill (MVP path)', () => {
  it('spec(T-017:AC-9) 10/10 correct from emptyMastery → isMastered and meterPercent 100', () => {
    expect(MASTERY_THRESHOLD_CORRECT).toBe(10);
    expect(MASTERY_RATE_RANGE).toBe(1);

    const final = runDrill(
      {
        skillId: SKILL,
        templates: TWO_TEMPLATES,
        mastery: emptyMastery,
        rng: createRng(SEED),
        length: 10,
      },
      Array.from({ length: 10 }, () => true),
    );

    expect(final.correct).toBe(10);
    expect(final.mastery).toStrictEqual(
      Array.from({ length: 10 }).reduce<SkillMastery>((m) => applyAnswer(m, 'range', true), emptyMastery),
    );
    expect(isMastered(final.mastery)).toBe(true);
    expect(meterPercent(final.mastery)).toBe(100);
  });
});

describe('AC-10 — 50% accuracy does not master even with half a meter', () => {
  it('spec(T-017:AC-10) 5 correct + 5 incorrect → isMastered false', () => {
    const pattern = [true, false, true, false, true, false, true, false, true, false] as const;
    const final = runDrill(
      {
        skillId: SKILL,
        templates: TWO_TEMPLATES,
        mastery: emptyMastery,
        rng: createRng(SEED),
        length: 10,
      },
      pattern,
    );

    expect(final.correct).toBe(5);
    expect(final.mastery.attempts).toBe(10);
    expect(final.mastery.weightedCorrect).toBe(5 * MASTERY_RATE_RANGE);
    expect(isMastered(final.mastery)).toBe(false);
  });
});

// =============================================================================================
// AC-11 — recent-template exclusion across a long drill
// =============================================================================================

describe('AC-11 — recentTemplateIds exclusion over a drill longer than the pool', () => {
  it('spec(T-017:AC-11) no templateId repeats inside any RECENT_TEMPLATE_WINDOW consecutive questions', () => {
    expect(EIGHT_TEMPLATES).toHaveLength(8);
    expect(RECENT_TEMPLATE_WINDOW).toBeLessThan(EIGHT_TEMPLATES.length);

    const length = 20;
    let session = start({
      templates: EIGHT_TEMPLATES,
      length,
      rng: createRng(4_242),
    });

    const served: string[] = [];
    for (let i = 0; i < length; i += 1) {
      const current = requireCurrent(session);
      served.push(current.templateId);
      // Most-recent-first contract shared with T-007 / T-020: after answering, the served id
      // must land at the front of the exclusion window used by generateQuestion.
      const answeredId = current.templateId;
      session = answerCorrect(session);
      expect(session.recentTemplateIds[0], `after answer ${i + 1}`).toBe(answeredId);
    }

    expect(served).toHaveLength(length);
    expect(session.complete).toBe(true);

    const violations: string[] = [];
    for (let startIdx = 0; startIdx <= served.length - RECENT_TEMPLATE_WINDOW; startIdx += 1) {
      const window = served.slice(startIdx, startIdx + RECENT_TEMPLATE_WINDOW);
      if (new Set(window).size !== window.length) {
        violations.push(`window@${startIdx}: [${window.join(', ')}]`);
      }
    }
    expect(violations).toEqual([]);
  });
});

// =============================================================================================
// AC-12 / AC-13 / AC-14 — determinism, immutability, serialisability
// =============================================================================================

describe('AC-12 — same inputs replay; different seed diverges', () => {
  it('spec(T-017:AC-12) identical start + answer sequence → deeply equal finals; different seed differs', () => {
    // true = correct, false = wrong choice, null = timeout
    const pattern = [true, false, true, null, false, true, true, false, true, false] as const;

    const run = (seed: number): { session: DrillSession; questions: Question[] } => {
      let session = start({
        templates: EIGHT_TEMPLATES,
        mastery: emptyMastery,
        rng: createRng(seed),
        length: pattern.length,
      });
      const questions: Question[] = [];
      for (const step of pattern) {
        const current = requireCurrent(session);
        questions.push(structuredClone(current));
        if (step === null) {
          session = answerDrill(session, null, DEFAULT_ELAPSED_MS);
        } else if (step) {
          session = answerDrill(session, current.correctIndex, DEFAULT_ELAPSED_MS);
        } else {
          session = answerDrill(session, (current.correctIndex + 1) % CHOICE_COUNT, DEFAULT_ELAPSED_MS);
        }
      }
      return { session, questions };
    };

    const first = run(SEED);
    const second = run(SEED);
    expect(second.session).toStrictEqual(first.session);
    expect(second.questions).toStrictEqual(first.questions);

    const other = run(SEED + 99);
    expect(other.questions).not.toStrictEqual(first.questions);
  });
});

describe('AC-13 — answerDrill does not mutate the input session', () => {
  it('spec(T-017:AC-13) answered, mastery, and log on the input are unchanged after the call', () => {
    const session = start({ length: 4, mastery: { weightedCorrect: 1, correct: 1, attempts: 2 } });
    const before = {
      answered: session.answered,
      correct: session.correct,
      mastery: structuredClone(session.mastery),
      log: structuredClone(session.log),
      recentTemplateIds: [...session.recentTemplateIds],
      current: structuredClone(session.current),
      complete: session.complete,
      rng: structuredClone(session.rng),
    };

    const next = answerCorrect(session);
    expect(next).not.toBe(session);
    expect(session.answered).toBe(before.answered);
    expect(session.correct).toBe(before.correct);
    expect(session.mastery).toStrictEqual(before.mastery);
    expect(session.log).toStrictEqual(before.log);
    expect(session.recentTemplateIds).toStrictEqual(before.recentTemplateIds);
    expect(session.current).toStrictEqual(before.current);
    expect(session.complete).toBe(before.complete);
    expect(session.rng).toStrictEqual(before.rng);
  });
});

describe('AC-14 — DrillSession is plain JSON', () => {
  it('spec(T-017:AC-14) JSON round-trip deeply equals the original session (live and complete)', () => {
    const live = start({ length: 3, mastery: { weightedCorrect: 0.5, correct: 0, attempts: 1 } });
    const liveRoundTrip = JSON.parse(JSON.stringify(live)) as DrillSession;
    expect(liveRoundTrip).toStrictEqual(live);

    const mid = answerCorrect(live);
    expect(JSON.parse(JSON.stringify(mid))).toStrictEqual(mid);

    const done = answerCorrect(answerCorrect(mid));
    expect(done.complete).toBe(true);
    expect(JSON.parse(JSON.stringify(done))).toStrictEqual(done);
  });
});

// =============================================================================================
// Definition of Done
// =============================================================================================

describe('T-017 Definition of Done', () => {
  it('dod(T-017:1) tags a test against every acceptance criterion the ticket declares', () => {
    const declared = [...TICKET_SOURCE.matchAll(/\*\*(AC-\d+)\*\*/g)].map((match) => match[1]);
    const unique = [...new Set(declared)];
    const untagged = unique.filter((ac) => !OWN_SOURCE.includes(`spec(T-017:${ac})`));

    expect(unique.length).toBeGreaterThan(0);
    expect(untagged).toEqual([]);
  });

  it('dod(T-017:2) keeps local gates wired and this suite free of skip/only markers', () => {
    const gates = readFileSync(join(REPO_ROOT, '.tdd-swarm/run-local-gates.sh'), 'utf8');
    for (const command of ['prettier --check', 'eslint . --max-warnings 0', 'tsc --noEmit', 'vitest run']) {
      expect(gates, `run-local-gates.sh must still run: ${command}`).toContain(command);
    }
    for (const marker of DEFERRED_WORK_MARKERS) {
      expect(OWN_SOURCE.includes(marker), `suite must not contain ${marker}`).toBe(false);
    }
    expect(FOCUSED_TEST_PATTERN.test(OWN_SOURCE)).toBe(false);
  });

  it('dod(T-017:3) numbers every dod tag so spec-lint covers all seven DoD items', () => {
    const dodCount = (TICKET_SOURCE.match(/^- \[[ x]\] /gm) ?? []).length;
    const tagged = [...OWN_SOURCE.matchAll(/dod\(T-017:([^)]*)\)/g)].map((match) => match[1] ?? '');
    const unparseable = tagged.filter((id) => !/^\d+$/.test(id));
    const covered = new Set(tagged.filter((id) => /^\d+$/.test(id)).map(Number));
    const missing = Array.from({ length: dodCount }, (_, i) => i + 1).filter((n) => !covered.has(n));

    expect(dodCount).toBe(7);
    expect(unparseable).toEqual([]);
    expect(missing).toEqual([]);
    expect(OWN_SOURCE).toContain('spec(T-017:AC-');
  });

  it('dod(T-017:4) mastery flows through applyAnswer with source "range" — no local rate arithmetic', () => {
    expect(existsSync(DRILL_SRC_PATH), 'src/engine/drill.ts must exist for DoD-4').toBe(true);
    const src = readFileSync(DRILL_SRC_PATH, 'utf8');

    expect(src).toMatch(/from\s+['"]@engine\/mastery['"]/);
    expect(src).toMatch(/\bapplyAnswer\b/);
    expect(src).toMatch(/['"]range['"]/);
    // Must not re-implement the meter: no direct rate constants or weightedCorrect mutation.
    expect(src).not.toMatch(/\bMASTERY_RATE_(?:RANGE|DUEL)\b/);
    expect(src).not.toMatch(/weightedCorrect\s*(\+|-)(=|\+)/);
  });

  it('dod(T-017:5) reaches neither Math.random nor Date; elapsedMs is a parameter', () => {
    const originalRandom = Math.random;
    const originalDate = globalThis.Date;

    class PoisonedDate {
      constructor() {
        throw new Error('new Date() — drill must be a pure function of its inputs');
      }
      static now(): number {
        throw new Error('Date.now() — drill must be a pure function of its inputs');
      }
    }

    let final: DrillSession | undefined;
    let escaped: unknown;
    try {
      Math.random = (): number => {
        throw new Error('Math.random() — every draw must go through the seeded Rng');
      };
      globalThis.Date = PoisonedDate as unknown as DateConstructor;

      final = runDrill(
        {
          skillId: SKILL,
          templates: TWO_TEMPLATES,
          mastery: emptyMastery,
          rng: createRng(SEED),
          length: 3,
        },
        [true, false, true],
      );
    } catch (error) {
      escaped = error;
    } finally {
      Math.random = originalRandom;
      globalThis.Date = originalDate;
    }

    expect(escaped, 'drill must not touch Math.random or Date').toBeUndefined();
    expect(final?.complete).toBe(true);
    expect(final?.log.every((entry) => typeof entry.elapsedMs === 'number')).toBe(true);

    if (existsSync(DRILL_SRC_PATH)) {
      const src = readFileSync(DRILL_SRC_PATH, 'utf8');
      expect(src).not.toMatch(/\bMath\.random\b/);
      expect(src).not.toMatch(/\bDate\b/);
    }
  });

  it('dod(T-017:6) DrillSession is plain JSON and immutable by contract', () => {
    const session = start({ length: 2 });
    const roundTripped = JSON.parse(JSON.stringify(session)) as DrillSession;
    expect(roundTripped).toStrictEqual(session);

    const snapshot = structuredClone(session);
    const next = answerCorrect(session);
    expect(session).toStrictEqual(snapshot);
    expect(next).not.toBe(session);
    expect(JSON.parse(JSON.stringify(next))).toStrictEqual(next);
  });

  it('dod(T-017:7) production scope is exactly src/engine/drill.ts — no drill/ subdirectory', () => {
    expect(existsSync(DRILL_SRC_PATH), 'implementer must create src/engine/drill.ts').toBe(true);
    expect(existsSync(join(REPO_ROOT, 'src/engine/drill')), 'do not split into src/engine/drill/').toBe(
      false,
    );
    const engineFiles = readdirSync(join(REPO_ROOT, 'src/engine')).filter((name) => name.startsWith('drill'));
    expect(engineFiles).toEqual(['drill.ts']);
  });
});
