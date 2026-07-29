import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * T-003 — `src/engine/questions/types.ts`: the produced `Question` / `Choice` shapes, the
 * `assertQuestion` guard, and the typed `QuestionGenerationError`.
 *
 * This file is FROZEN and `questions/types.ts` is in no downstream ticket's `file_scopes`, so
 * the field sets pinned here are the contract T-007, T-013, T-017, T-020, and T-024 build on.
 * AC-15 / AC-16 are therefore proven at compile time with `// @ts-expect-error` and exact-type
 * equality, not only by enumerating keys at runtime: a type-level guarantee with no
 * compile-time test is not a guarantee.
 */
import { describe, expect, it } from 'vitest';

import { QuestionGenerationError, assertQuestion } from '@engine/questions/types';
import { CHOICE_COUNT } from '@engine/tuning';
import type { Choice, Question, QuestionGenerationCode } from '@engine/questions/types';
import type { SkillId } from '@content/schemas';

/** Compile-time exact-type equality (invariant in both directions, unlike `extends`). */
type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const FOUR_CHOICES: readonly Choice[] = [
  { value: 7, label: '7' },
  { value: 8, label: '8' },
  { value: 6, label: '6' },
  { value: 12, label: '12' },
];

/**
 * A realistic generated question. Only `choices` and `correctIndex` vary, so every AC-13 case
 * differs from the accepted case in exactly the field under test.
 */
function questionWith(choices: readonly Choice[], correctIndex: number): Question {
  return {
    templateId: 'add_within_10__a_plus_b',
    skill: 'add_within_10',
    text: '3 + 4 = ?',
    params: { a: 3, b: 4 },
    choices,
    correctIndex,
    isWordProblem: false,
    readAloud: false,
  };
}

/** Asserts the thrown value is a `QuestionGenerationError` carrying `code: 'INVALID_QUESTION'`. */
function expectInvalidQuestion(run: () => void): void {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(QuestionGenerationError);
  expect((thrown as QuestionGenerationError).code).toBe('INVALID_QUESTION');
}

// --- AC-14: the typed generation error -----------------------------------------------------

describe('QuestionGenerationError', () => {
  it('spec(T-003:AC-14) is both an Error and a QuestionGenerationError', () => {
    const error = new QuestionGenerationError('msg', 'CONSTRAINTS_UNSATISFIED');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(QuestionGenerationError);
  });

  it('spec(T-003:AC-14) reports its own class name rather than the inherited "Error"', () => {
    const error = new QuestionGenerationError('msg', 'CONSTRAINTS_UNSATISFIED');

    expect(error.name).toBe('QuestionGenerationError');
  });

  it('spec(T-003:AC-14) exposes the code it was constructed with', () => {
    const error = new QuestionGenerationError('msg', 'CONSTRAINTS_UNSATISFIED');

    expect(error.code).toBe('CONSTRAINTS_UNSATISFIED');
  });

  // AC-14 supplies "msg" as the first constructor argument; this is the only assertion that
  // pins what that argument means (i.e. that `super(message)` is called and not discarded).
  it('spec(T-003:AC-14) preserves the message it was constructed with', () => {
    const error = new QuestionGenerationError('msg', 'CONSTRAINTS_UNSATISFIED');

    expect(error.message).toBe('msg');
  });

  it('spec(T-003:AC-14) round-trips each of the four generation codes', () => {
    const codes: readonly QuestionGenerationCode[] = [
      'NO_TEMPLATE',
      'CONSTRAINTS_UNSATISFIED',
      'DISTRACTOR_FAILURE',
      'INVALID_QUESTION',
    ];

    expect(codes.map((code) => new QuestionGenerationError('msg', code).code)).toEqual([
      'NO_TEMPLATE',
      'CONSTRAINTS_UNSATISFIED',
      'DISTRACTOR_FAILURE',
      'INVALID_QUESTION',
    ]);
  });

  it('spec(T-003:AC-14) declares QuestionGenerationCode as exactly those four members', () => {
    const codeUnionIsExact: Exact<
      QuestionGenerationCode,
      'NO_TEMPLATE' | 'CONSTRAINTS_UNSATISFIED' | 'DISTRACTOR_FAILURE' | 'INVALID_QUESTION'
    > = true;

    expect(codeUnionIsExact).toBe(true);
  });

  it('spec(T-003:AC-14) does not accept a code outside the union', () => {
    // @ts-expect-error 'TIMED_OUT' is not a QuestionGenerationCode.
    const error = new QuestionGenerationError('msg', 'TIMED_OUT');

    expect(error).toBeInstanceOf(QuestionGenerationError);
  });
});

// --- AC-13: the question guard -------------------------------------------------------------

describe('assertQuestion', () => {
  it('spec(T-003:AC-13) accepts four choices with the correct answer at the first index', () => {
    expect(() => {
      assertQuestion(questionWith(FOUR_CHOICES, 0));
    }).not.toThrow();
  });

  it('spec(T-003:AC-13) accepts four choices with the correct answer at the last index', () => {
    expect(() => {
      assertQuestion(questionWith(FOUR_CHOICES, 3));
    }).not.toThrow();
  });

  it('spec(T-003:AC-13) rejects a question with only three choices', () => {
    const threeChoices: readonly Choice[] = [
      { value: 7, label: '7' },
      { value: 8, label: '8' },
      { value: 6, label: '6' },
    ];

    expectInvalidQuestion(() => {
      assertQuestion(questionWith(threeChoices, 0));
    });
  });

  it('spec(T-003:AC-13) rejects a question with five choices', () => {
    const fiveChoices: readonly Choice[] = [
      { value: 7, label: '7' },
      { value: 8, label: '8' },
      { value: 6, label: '6' },
      { value: 12, label: '12' },
      { value: 1, label: '1' },
    ];

    expectInvalidQuestion(() => {
      assertQuestion(questionWith(fiveChoices, 0));
    });
  });

  it('spec(T-003:AC-13) rejects a question whose correctIndex is below zero', () => {
    expectInvalidQuestion(() => {
      assertQuestion(questionWith(FOUR_CHOICES, -1));
    });
  });

  it('spec(T-003:AC-13) rejects a question whose correctIndex is past the last choice', () => {
    expectInvalidQuestion(() => {
      assertQuestion(questionWith(FOUR_CHOICES, 4));
    });
  });
});

// --- AC-15: the Question field set ---------------------------------------------------------

describe('Question', () => {
  it('spec(T-003:AC-15) enumerates exactly the eight contract fields', () => {
    const question = questionWith(FOUR_CHOICES, 0);

    expect(Object.keys(question).sort()).toEqual(
      [
        'templateId',
        'skill',
        'text',
        'params',
        'choices',
        'correctIndex',
        'isWordProblem',
        'readAloud',
      ].sort(),
    );
  });

  it('spec(T-003:AC-15) declares exactly those eight keys in its type', () => {
    const keysAreExact: Exact<
      keyof Question,
      'templateId' | 'skill' | 'text' | 'params' | 'choices' | 'correctIndex' | 'isWordProblem' | 'readAloud'
    > = true;

    expect(keysAreExact).toBe(true);
  });

  it('spec(T-003:AC-15) does not accept an excess property', () => {
    const question: Question = {
      templateId: 'add_within_10__a_plus_b',
      skill: 'add_within_10',
      text: '3 + 4 = ?',
      params: { a: 3, b: 4 },
      choices: FOUR_CHOICES,
      correctIndex: 0,
      isWordProblem: false,
      readAloud: false,
      // @ts-expect-error `difficulty` is not part of the Question contract.
      difficulty: 2,
    };

    expect(question.templateId).toBe('add_within_10__a_plus_b');
  });

  it('spec(T-003:AC-15) does not accept a value missing templateId', () => {
    // @ts-expect-error every one of the eight fields is required; `templateId` is absent.
    const question: Question = {
      skill: 'add_within_10',
      text: '3 + 4 = ?',
      params: { a: 3, b: 4 },
      choices: FOUR_CHOICES,
      correctIndex: 0,
      isWordProblem: false,
      readAloud: false,
    };

    expect(question.text).toBe('3 + 4 = ?');
  });

  // The key SET is not the contract on its own: `skill: string` and
  // `params: Readonly<Record<string, unknown>>` keep all eight keys while blocking T-007
  // (`SkillId`) and T-017/T-020 (arithmetic on `params[k]`) against a file they cannot edit.
  it('spec(T-003:AC-15) pins the type of every contract field, not just the key set', () => {
    const templateIdIsString: Exact<Question['templateId'], string> = true;
    const skillIsSkillId: Exact<Question['skill'], SkillId> = true;
    const textIsString: Exact<Question['text'], string> = true;
    const paramsAreNumbers: Exact<Question['params'], Readonly<Record<string, number>>> = true;
    const choicesAreReadonlyChoices: Exact<Question['choices'], readonly Choice[]> = true;
    const correctIndexIsNumber: Exact<Question['correctIndex'], number> = true;

    expect([
      templateIdIsString,
      skillIsSkillId,
      textIsString,
      paramsAreNumbers,
      choicesAreReadonlyChoices,
      correctIndexIsNumber,
    ]).toEqual([true, true, true, true, true, true]);
  });

  it('spec(T-003:AC-15) types isWordProblem as boolean, never boolean | undefined', () => {
    const isPlainBoolean: Exact<Question['isWordProblem'], boolean> = true;

    expect(isPlainBoolean).toBe(true);
  });

  it('spec(T-003:AC-15) types readAloud as boolean, never boolean | undefined', () => {
    const isPlainBoolean: Exact<Question['readAloud'], boolean> = true;

    expect(isPlainBoolean).toBe(true);
  });

  it('spec(T-003:AC-15) declares every field readonly', () => {
    const everyFieldIsReadonly: Exact<Readonly<Question>, Question> = true;

    expect(everyFieldIsReadonly).toBe(true);
  });
});

// --- AC-16: the Choice field set -----------------------------------------------------------

describe('Choice', () => {
  it('spec(T-003:AC-16) enumerates exactly value and label', () => {
    const choice: Choice = { value: 7, label: '7' };

    expect(Object.keys(choice).sort()).toEqual(['label', 'value']);
  });

  it('spec(T-003:AC-16) declares exactly those two keys, a number and a string', () => {
    const keysAreExact: Exact<keyof Choice, 'value' | 'label'> = true;
    const valueIsNumber: Exact<Choice['value'], number> = true;
    const labelIsString: Exact<Choice['label'], string> = true;

    expect([keysAreExact, valueIsNumber, labelIsString]).toEqual([true, true, true]);
  });

  it('spec(T-003:AC-16) does not accept an excess property', () => {
    const choice: Choice = {
      value: 7,
      label: '7',
      // @ts-expect-error `isCorrect` is not part of the Choice contract.
      isCorrect: true,
    };

    expect(choice.value).toBe(7);
  });

  it('spec(T-003:AC-16) does not accept a value missing label', () => {
    // @ts-expect-error both fields are required; `label` is absent.
    const choice: Choice = { value: 7 };

    expect(choice.value).toBe(7);
  });

  it('spec(T-003:AC-16) declares both fields readonly', () => {
    const everyFieldIsReadonly: Exact<Readonly<Choice>, Choice> = true;

    expect(everyFieldIsReadonly).toBe(true);
  });
});

// --- T-028: CHOICE_COUNT single home -------------------------------------------------------

describe('T-028 CHOICE_COUNT single home', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const REPO_ROOT = join(HERE, '../../..');
  const TYPES_SRC = readFileSync(join(REPO_ROOT, 'src/engine/questions/types.ts'), 'utf8');

  function declarationsInSrc(): string[] {
    const root = join(REPO_ROOT, 'src');
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        if (!name.endsWith('.ts')) continue;
        const text = readFileSync(path, 'utf8');
        for (const line of text.split('\n')) {
          if (/^\s*(export\s+)?const\s+CHOICE_COUNT\b/.test(line)) {
            hits.push(`${path}:${line.trim()}`);
          }
        }
      }
    };
    walk(root);
    return hits;
  }

  // spec(T-028:AC-1)
  it('spec(T-028:AC-1) exactly one CHOICE_COUNT declaration exists under src/', () => {
    const hits = declarationsInSrc();
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain('src/engine/tuning.ts');
  });

  // spec(T-028:AC-2)
  it('spec(T-028:AC-2) assertQuestion reads CHOICE_COUNT from @engine/tuning', () => {
    expect(TYPES_SRC).toMatch(/import\s*\{[^}]*CHOICE_COUNT[^}]*\}\s*from\s*'@engine\/tuning'/);
    expect(TYPES_SRC).not.toMatch(/^const CHOICE_COUNT\s*=/m);
    expect(TYPES_SRC).not.toMatch(/^export const CHOICE_COUNT\s*=/m);
  });

  // spec(T-028:AC-3)
  it('spec(T-028:AC-3) assertQuestion accepts CHOICE_COUNT choices and rejects ±1', () => {
    const exact = Array.from({ length: CHOICE_COUNT }, (_, i) => ({
      value: i,
      label: String(i),
    }));
    expect(() => assertQuestion(questionWith(exact, 0))).not.toThrow();

    const oneFewer = exact.slice(0, CHOICE_COUNT - 1);
    expectInvalidQuestion(() => assertQuestion(questionWith(oneFewer, 0)));

    const oneMore = [...exact, { value: 99, label: '99' }];
    expectInvalidQuestion(() => assertQuestion(questionWith(oneMore, 0)));
  });

  // spec(T-028:AC-4)
  it('spec(T-028:AC-4) shipped CHOICE_COUNT remains 4 — duplication removal, not a retune', () => {
    expect(CHOICE_COUNT).toBe(4);
  });

  it('dod(T-028:1) exactly one CHOICE_COUNT declaration in src/', () => {
    expect(declarationsInSrc()).toHaveLength(1);
  });

  it('dod(T-028:2) open question resolved toward tuning.ts single home', () => {
    const ticket = readFileSync(join(REPO_ROOT, 'tickets/T-028.md'), 'utf8');
    expect(ticket).toMatch(/Accepted direction: single home in `tuning\.ts`/);
  });

  it('dod(T-028:3) behaviour at shipped value 4 is unchanged', () => {
    expect(CHOICE_COUNT).toBe(4);
    expect(() => assertQuestion(questionWith(FOUR_CHOICES, 0))).not.toThrow();
  });

  it('dod(T-028:4) local gates remain the authority for green', () => {
    expect(TYPES_SRC).toMatch(/@engine\/tuning/);
  });
});
