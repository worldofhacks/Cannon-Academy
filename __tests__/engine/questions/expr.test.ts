import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import { evaluateNumber, evaluatePredicate, ExprError } from '@engine/questions/expr';
import type { ExprErrorCode } from '@engine/questions/expr';

/**
 * T-002 — Safe arithmetic expression and constraint predicate evaluator (no eval).
 *
 * Every test below is tagged with the acceptance criterion it encodes, per
 * `.tdd-swarm/spec-lint.sh tickets/T-002.md`.
 *
 * These expressions compute the *correct answer* to questions shown to children
 * (ARCHITECTURE.md §4.1 / §12). Precedence, associativity, division semantics and
 * negative numbers are pinned explicitly rather than sampled.
 */

// --------------------------------------------------------------------------------------------
// helpers
// --------------------------------------------------------------------------------------------

type Env = Record<string, number>;

/** Compile-time exact-type equality (invariant in both directions, unlike `extends`). */
type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Runs `fn`, asserts it threw an `ExprError`, and returns it for further assertions. */
function catchExprError(fn: () => unknown): ExprError {
  let returned: unknown;
  let threw = false;
  let thrown: unknown;
  try {
    returned = fn();
  } catch (e) {
    threw = true;
    thrown = e;
  }
  expect(threw, `expected an ExprError to be thrown, but the call returned ${String(returned)}`).toBe(true);
  expect(thrown, `expected an ExprError, got: ${String(thrown)}`).toBeInstanceOf(ExprError);
  return thrown as ExprError;
}

function expectNumberError(expr: string, env: Env, code: string): ExprError {
  const err = catchExprError(() => evaluateNumber(expr, env));
  expect(err.code, `evaluateNumber(${JSON.stringify(expr)}) threw code ${String(err.code)}`).toBe(code);
  return err;
}

function expectPredicateError(expr: string, env: Env, code: string): ExprError {
  const err = catchExprError(() => evaluatePredicate(expr, env));
  expect(err.code, `evaluatePredicate(${JSON.stringify(expr)}) threw code ${String(err.code)}`).toBe(code);
  return err;
}

// --------------------------------------------------------------------------------------------
// AC-1 — the module never constructs or executes code dynamically
// --------------------------------------------------------------------------------------------

const SOURCE_PATH = fileURLToPath(new URL('../../../src/engine/questions/expr.ts', import.meta.url));

/** Exactly the substrings enumerated by T-002 AC-1. */
const BANNED_SUBSTRINGS = ['eval(', 'new Function', 'Function(', 'setTimeout', 'setInterval', 'import('];

describe('AC-1 — no dynamic code construction in the evaluator source', () => {
  it('spec(T-002:AC-1) the evaluator source file exists and is readable', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8');
    expect(source.length).toBeGreaterThan(0);
  });

  for (const banned of BANNED_SUBSTRINGS) {
    it(`spec(T-002:AC-1) source text contains no "${banned}"`, () => {
      const source = readFileSync(SOURCE_PATH, 'utf8');
      expect(source).not.toContain(banned);
    });
  }
});

// --------------------------------------------------------------------------------------------
// AC-21 — the AUTHORITATIVE anti-codegen guard: a behavioural trap
//
// The AC-1 scan above and the `no-eval` / `no-implied-eval` / `no-new-func` lint rules are both
// secondary defence. Measured, they miss aliasing, computed access and reflection: a complete
// evaluator built on `Reflect.construct(Function, ...)` passed 229/229 with tsc and eslint clean
// (`.tdd-swarm/reports/T-002-test-design-review.md`). Obtaining the `Function` constructor
// requires the global binding, `<anyFunction>.constructor`, `Reflect` over one of those, or
// `eval` — all four are poisoned below, BEFORE the module is imported, so a reference cached at
// module-init time is caught too.
// --------------------------------------------------------------------------------------------

const realFunction = globalThis.Function;
const realEval = globalThis.eval;
const realConstruct = Reflect.construct;
const realCtorDescriptor = Object.getOwnPropertyDescriptor(realFunction.prototype, 'constructor');

type EvaluatorModule = {
  evaluateNumber: (expr: string, env: Env) => number;
  evaluatePredicate: (expr: string, env: Env) => boolean;
};

/**
 * Freshly imports the evaluator with every dynamic-compilation route poisoned, runs `body`
 * while they are still poisoned, then restores the globals. Returns the routes that were
 * touched. All assertions are deliberately made by the caller AFTER restoration, so a poisoned
 * global can never leak into the assertion machinery or into another test.
 */
async function underDynamicCodeTraps<T>(body: (mod: EvaluatorModule) => T): Promise<{
  tripped: string[];
  value: T;
}> {
  const tripped: string[] = [];
  const traps = new Set<unknown>();
  /**
   * A trap must be *constructible* and must return something *callable*, so that a module
   * reaching for codegen keeps running and fails on the assertion below rather than on an
   * incidental TypeError. The point is to report the route, not to break the caller.
   */
  const trap = (what: string): unknown => {
    const stub = function stubbedDynamicCode(): number {
      return 0;
    };
    const trapped = function trappedDynamicCodeRoute(...args: unknown[]) {
      tripped.push(what);
      void args;
      return stub;
    };
    traps.add(trapped);
    return trapped;
  };
  const g = globalThis as unknown as { Function: unknown; eval: unknown };

  try {
    g.Function = trap('globalThis.Function');
    g.eval = trap('globalThis.eval');
    Reflect.construct = ((target: unknown, ...rest: unknown[]) => {
      if (target === realFunction) tripped.push('Reflect.construct(Function)');
      if (traps.has(target)) return (target as () => unknown)();
      return (realConstruct as (...a: unknown[]) => unknown)(target, ...rest);
    }) as typeof Reflect.construct;
    Object.defineProperty(realFunction.prototype, 'constructor', {
      configurable: true,
      get() {
        tripped.push('Function.prototype.constructor');
        return trap('fn.constructor');
      },
    });

    vi.resetModules();
    const mod = (await import('@engine/questions/expr')) as unknown as EvaluatorModule;
    return { tripped, value: body(mod) };
  } finally {
    g.Function = realFunction;
    g.eval = realEval;
    Reflect.construct = realConstruct;
    if (realCtorDescriptor) {
      Object.defineProperty(realFunction.prototype, 'constructor', realCtorDescriptor);
    }
  }
}

describe('AC-21 — no dynamic-compilation route is reached, at import time or at call time', () => {
  it('spec(T-002:AC-21) evaluating arithmetic touches no dynamic-compilation route', async () => {
    const { tripped, value } = await underDynamicCodeTraps((mod) =>
      mod.evaluateNumber('a + b * c', { a: 2, b: 3, c: 4 }),
    );

    expect(tripped).toEqual([]);
    expect(value).toBe(14);
  });

  it('spec(T-002:AC-21) evaluating a predicate touches no dynamic-compilation route', async () => {
    const { tripped, value } = await underDynamicCodeTraps((mod) =>
      mod.evaluatePredicate('a > 0 && b > 0 || a == 0', { a: 0, b: 0 }),
    );

    expect(tripped).toEqual([]);
    expect(value).toBe(true);
  });

  it('spec(T-002:AC-21) importing the module touches no dynamic-compilation route', async () => {
    const { tripped } = await underDynamicCodeTraps(() => undefined);

    expect(tripped).toEqual([]);
  });

  it('spec(T-002:AC-21) function calls and error paths touch no dynamic-compilation route', async () => {
    const { tripped, value } = await underDynamicCodeTraps((mod) => {
      const results: unknown[] = [
        mod.evaluateNumber('gcd(a, b)', { a: 12, b: 18 }),
        mod.evaluateNumber('floor(a / b)', { a: 7, b: 2 }),
        mod.evaluatePredicate('a + b <= 20', { a: 9, b: 9 }),
      ];
      for (const bad of ['a +', 'a + z', 'foo(a)', 'min(a)', 'a / 0', 'a > b']) {
        try {
          mod.evaluateNumber(bad, { a: 1, b: 2 });
        } catch (e) {
          results.push((e as ExprError).code);
        }
      }
      return results;
    });

    expect(tripped).toEqual([]);
    expect(value).toEqual([
      6,
      3,
      true,
      'PARSE_ERROR',
      'UNKNOWN_IDENTIFIER',
      'UNKNOWN_FUNCTION',
      'ARITY_MISMATCH',
      'DIVISION_BY_ZERO',
      'TYPE_MISMATCH',
    ]);
  });

  it('spec(T-002:AC-21) the trap harness itself detects a dynamic-compilation route', async () => {
    const { tripped } = await underDynamicCodeTraps(() => {
      // A deliberate synthetic violation, exercising all four poisoned routes. This proves the
      // harness reports rather than silently passing — L-001: a guard never observed firing is
      // an assumption, not a gate.
      void (globalThis as unknown as { Function: (s: string) => unknown }).Function('return 1');
      void (globalThis as unknown as { eval: (s: string) => unknown }).eval('1');
      void Reflect.construct(realFunction, ['return 1']);
      void function () {}.constructor;
      return undefined;
    });

    expect(tripped).toEqual([
      'globalThis.Function',
      'globalThis.eval',
      'Reflect.construct(Function)',
      'Function.prototype.constructor',
    ]);
  });
});

// --------------------------------------------------------------------------------------------
// AC-2 — operator precedence and parentheses
// --------------------------------------------------------------------------------------------

describe('AC-2 — precedence and parentheses', () => {
  it('spec(T-002:AC-2) multiplication binds tighter than addition', () => {
    expect(evaluateNumber('a + b * c', { a: 2, b: 3, c: 4 })).toBe(14);
  });

  it('spec(T-002:AC-2) parentheses override multiplication precedence', () => {
    expect(evaluateNumber('(a + b) * c', { a: 2, b: 3, c: 4 })).toBe(20);
  });

  it('spec(T-002:AC-2) multiplication binds tighter than addition on the left too', () => {
    expect(evaluateNumber('a * b + c', { a: 2, b: 3, c: 4 })).toBe(10);
  });

  it('spec(T-002:AC-2) precedence holds for number literals with no identifiers', () => {
    expect(evaluateNumber('2 + 3 * 4', {})).toBe(14);
  });

  it('spec(T-002:AC-2) parentheses override precedence for number literals', () => {
    expect(evaluateNumber('(2 + 3) * 4', {})).toBe(20);
  });

  it('spec(T-002:AC-2) division binds tighter than subtraction', () => {
    expect(evaluateNumber('a - b / c', { a: 10, b: 6, c: 2 })).toBe(7);
  });

  it('spec(T-002:AC-2) remainder binds tighter than addition', () => {
    expect(evaluateNumber('2 + 6 % 4', {})).toBe(4);
  });

  it('spec(T-002:AC-2) nested parentheses evaluate innermost first', () => {
    expect(evaluateNumber('((a + b) * (c - a))', { a: 2, b: 3, c: 4 })).toBe(10);
  });

  it('spec(T-002:AC-2) whitespace around tokens is insignificant', () => {
    expect(evaluateNumber('   a   +   b   *   c   ', { a: 2, b: 3, c: 4 })).toBe(14);
  });

  it('spec(T-002:AC-2) absent whitespace between tokens is accepted', () => {
    expect(evaluateNumber('a+b*c', { a: 2, b: 3, c: 4 })).toBe(14);
  });
});

// --------------------------------------------------------------------------------------------
// AC-3 — the arithmetic operator set
// --------------------------------------------------------------------------------------------

describe('AC-3 — arithmetic operators', () => {
  const env: Env = { a: 7, b: 2 };

  it('spec(T-002:AC-3) subtraction returns the difference', () => {
    expect(evaluateNumber('a - b', env)).toBe(5);
  });

  it('spec(T-002:AC-3) multiplication returns the product', () => {
    expect(evaluateNumber('a * b', env)).toBe(14);
  });

  it('spec(T-002:AC-3) division is real division, not truncating integer division', () => {
    expect(evaluateNumber('a / b', env)).toBe(3.5);
  });

  it('spec(T-002:AC-3) division that divides evenly returns the exact integer', () => {
    expect(evaluateNumber('a / b', { a: 6, b: 3 })).toBe(2);
  });

  it('spec(T-002:AC-3) remainder returns the modulus', () => {
    expect(evaluateNumber('a % b', env)).toBe(1);
  });

  it('spec(T-002:AC-3) unary minus negates its operand', () => {
    expect(evaluateNumber('-a', env)).toBe(-7);
  });

  it('spec(T-002:AC-3) addition returns the sum', () => {
    expect(evaluateNumber('a + b', env)).toBe(9);
  });

  it('spec(T-002:AC-3) subtraction may produce a negative result', () => {
    expect(evaluateNumber('b - a', env)).toBe(-5);
  });

  it('spec(T-002:AC-3) unary minus is distinguished from binary subtraction', () => {
    expect(evaluateNumber('a - -b', env)).toBe(9);
  });

  it('spec(T-002:AC-3) unary minus binds to its primary, not to the whole product', () => {
    expect(evaluateNumber('-a * b', env)).toBe(-14);
  });

  it('spec(T-002:AC-3) unary minus applies to a parenthesised expression', () => {
    expect(evaluateNumber('-(a + b)', env)).toBe(-9);
  });

  it('spec(T-002:AC-3) unary minus applies to a number literal', () => {
    expect(evaluateNumber('-5 + a', env)).toBe(2);
  });

  it('spec(T-002:AC-3) multiplying two negatives yields a positive', () => {
    expect(evaluateNumber('-a * -b', env)).toBe(14);
  });

  it('spec(T-002:AC-3) decimal number literals are parsed', () => {
    expect(evaluateNumber('1.5 + 2.5', {})).toBe(4);
  });

  it('spec(T-002:AC-3) a fractional division result is not silently rounded', () => {
    expect(evaluateNumber('a / b + 0.5', env)).toBe(4);
  });
});

// --------------------------------------------------------------------------------------------
// AC-4 — left associativity
// --------------------------------------------------------------------------------------------

describe('AC-4 — left associativity of same-precedence operators', () => {
  it('spec(T-002:AC-4) subtraction is left associative', () => {
    expect(evaluateNumber('a - b - c', { a: 10, b: 3, c: 2 })).toBe(5);
  });

  it('spec(T-002:AC-4) division is left associative', () => {
    expect(evaluateNumber('a / b / c', { a: 12, b: 3, c: 2 })).toBe(2);
  });

  it('spec(T-002:AC-4) subtraction of literals is left associative', () => {
    expect(evaluateNumber('10 - 3 - 2', {})).toBe(5);
  });

  it('spec(T-002:AC-4) division of literals is left associative', () => {
    expect(evaluateNumber('100 / 10 / 5', {})).toBe(2);
  });

  it('spec(T-002:AC-4) parentheses can force right associativity for subtraction', () => {
    expect(evaluateNumber('a - (b - c)', { a: 10, b: 3, c: 2 })).toBe(9);
  });

  it('spec(T-002:AC-4) parentheses can force right associativity for division', () => {
    expect(evaluateNumber('a / (b / c)', { a: 12, b: 6, c: 2 })).toBe(4);
  });

  it('spec(T-002:AC-4) mixed addition and subtraction evaluate left to right', () => {
    expect(evaluateNumber('a - b + c', { a: 10, b: 3, c: 2 })).toBe(9);
  });

  it('spec(T-002:AC-4) multiplication and remainder evaluate left to right', () => {
    expect(evaluateNumber('2 * 3 % 4', {})).toBe(2);
  });

  it('spec(T-002:AC-4) three-term subtraction chains stay left associative', () => {
    expect(evaluateNumber('a - b - c - d', { a: 20, b: 5, c: 4, d: 3 })).toBe(8);
  });
});

// --------------------------------------------------------------------------------------------
// AC-5 — the whitelisted function set
// --------------------------------------------------------------------------------------------

describe('AC-5 — whitelisted functions', () => {
  it('spec(T-002:AC-5) abs returns the magnitude of a negative value', () => {
    expect(evaluateNumber('abs(0 - 5)', {})).toBe(5);
  });

  it('spec(T-002:AC-5) min returns the smaller of two arguments', () => {
    expect(evaluateNumber('min(a, b)', { a: 3, b: 9 })).toBe(3);
  });

  it('spec(T-002:AC-5) max returns the larger of two arguments', () => {
    expect(evaluateNumber('max(a, b)', { a: 3, b: 9 })).toBe(9);
  });

  it('spec(T-002:AC-5) floor rounds a fractional quotient down', () => {
    expect(evaluateNumber('floor(a / b)', { a: 7, b: 2 })).toBe(3);
  });

  it('spec(T-002:AC-5) ceil rounds a fractional quotient up', () => {
    expect(evaluateNumber('ceil(a / b)', { a: 7, b: 2 })).toBe(4);
  });

  it('spec(T-002:AC-5) gcd returns the greatest common divisor', () => {
    expect(evaluateNumber('gcd(a, b)', { a: 12, b: 18 })).toBe(6);
  });

  it('spec(T-002:AC-5) gcd of coprime arguments is 1', () => {
    expect(evaluateNumber('gcd(a, b)', { a: 9, b: 8 })).toBe(1);
  });

  it('spec(T-002:AC-5) abs of a positive value is unchanged', () => {
    expect(evaluateNumber('abs(a)', { a: 5 })).toBe(5);
  });

  it('spec(T-002:AC-5) abs accepts a unary-minus argument', () => {
    expect(evaluateNumber('abs(-a)', { a: 5 })).toBe(5);
  });

  it('spec(T-002:AC-5) floor of a negative fraction rounds toward negative infinity', () => {
    expect(evaluateNumber('floor(0 - 7 / 2)', {})).toBe(-4);
  });

  it('spec(T-002:AC-5) ceil of a negative fraction rounds toward positive infinity', () => {
    expect(evaluateNumber('ceil(0 - 7 / 2)', {})).toBe(-3);
  });

  it('spec(T-002:AC-5) function calls nest as arguments to other functions', () => {
    expect(evaluateNumber('min(a, max(b, c))', { a: 5, b: 1, c: 3 })).toBe(3);
  });

  it('spec(T-002:AC-5) function arguments are full expressions', () => {
    expect(evaluateNumber('max(a + b, a * b)', { a: 2, b: 3 })).toBe(6);
  });

  it('spec(T-002:AC-5) a call result participates in surrounding arithmetic', () => {
    expect(evaluateNumber('floor(a / b) * 10', { a: 7, b: 2 })).toBe(30);
  });
});

// --------------------------------------------------------------------------------------------
// AC-6 — constraint predicates over a boundary
// --------------------------------------------------------------------------------------------

describe('AC-6 — constraint predicates', () => {
  it('spec(T-002:AC-6) a satisfied sum constraint is true', () => {
    expect(evaluatePredicate('a + b <= 20', { a: 9, b: 9 })).toBe(true);
  });

  it('spec(T-002:AC-6) a violated sum constraint is false', () => {
    expect(evaluatePredicate('a + b <= 20', { a: 15, b: 9 })).toBe(false);
  });

  it('spec(T-002:AC-6) a sum one below the bound satisfies <=', () => {
    expect(evaluatePredicate('a + b <= 20', { a: 10, b: 9 })).toBe(true);
  });

  it('spec(T-002:AC-6) a sum exactly at the bound satisfies <=', () => {
    expect(evaluatePredicate('a + b <= 20', { a: 10, b: 10 })).toBe(true);
  });

  it('spec(T-002:AC-6) a sum one above the bound violates <=', () => {
    expect(evaluatePredicate('a + b <= 20', { a: 11, b: 10 })).toBe(false);
  });

  it('spec(T-002:AC-6) arithmetic binds tighter than comparison', () => {
    expect(evaluatePredicate('a + b == 5', { a: 2, b: 3 })).toBe(true);
  });

  it('spec(T-002:AC-6) comparison applies to both sides of the operator', () => {
    expect(evaluatePredicate('a * b >= a + b', { a: 3, b: 3 })).toBe(true);
  });

  it('spec(T-002:AC-6) an ordering constraint between two params holds', () => {
    expect(evaluatePredicate('a >= b', { a: 9, b: 1 })).toBe(true);
  });

  it('spec(T-002:AC-6) a divisibility constraint expressed with % is evaluated', () => {
    expect(evaluatePredicate('a % b == 0', { a: 12, b: 4 })).toBe(true);
  });

  it('spec(T-002:AC-6) a failing divisibility constraint is false', () => {
    expect(evaluatePredicate('a % b == 0', { a: 13, b: 4 })).toBe(false);
  });
});

// --------------------------------------------------------------------------------------------
// AC-7 — every comparison operator, at and either side of the boundary
// --------------------------------------------------------------------------------------------

describe('AC-7 — comparison operators', () => {
  const cases: ReadonlyArray<{ expr: string; a: number; b: number; expected: boolean }> = [
    // equal operands (a === b === 5) — the boundary itself
    { expr: 'a == b', a: 5, b: 5, expected: true },
    { expr: 'a != b', a: 5, b: 5, expected: false },
    { expr: 'a < b', a: 5, b: 5, expected: false },
    { expr: 'a <= b', a: 5, b: 5, expected: true },
    { expr: 'a > b', a: 5, b: 5, expected: false },
    { expr: 'a >= b', a: 5, b: 5, expected: true },
    // a one below b
    { expr: 'a == b', a: 5, b: 6, expected: false },
    { expr: 'a != b', a: 5, b: 6, expected: true },
    { expr: 'a < b', a: 5, b: 6, expected: true },
    { expr: 'a <= b', a: 5, b: 6, expected: true },
    { expr: 'a > b', a: 5, b: 6, expected: false },
    { expr: 'a >= b', a: 5, b: 6, expected: false },
    // a one above b
    { expr: 'a == b', a: 6, b: 5, expected: false },
    { expr: 'a != b', a: 6, b: 5, expected: true },
    { expr: 'a < b', a: 6, b: 5, expected: false },
    { expr: 'a <= b', a: 6, b: 5, expected: false },
    { expr: 'a > b', a: 6, b: 5, expected: true },
    { expr: 'a >= b', a: 6, b: 5, expected: true },
  ];

  for (const { expr, a, b, expected } of cases) {
    it(`spec(T-002:AC-7) "${expr}" with a=${a}, b=${b} is ${expected}`, () => {
      expect(evaluatePredicate(expr, { a, b })).toBe(expected);
    });
  }

  it('spec(T-002:AC-7) == compares fractional values exactly', () => {
    expect(evaluatePredicate('a / b == 3.5', { a: 7, b: 2 })).toBe(true);
  });

  it('spec(T-002:AC-7) == is exact, not tolerance-based, at a distance of 0.5', () => {
    expect(evaluatePredicate('a / b == 3', { a: 7, b: 2 })).toBe(false);
  });

  it('spec(T-002:AC-7) == is exact, not tolerance-based, at a distance of 0.1', () => {
    expect(evaluatePredicate('a / b == 3.4', { a: 7, b: 2 })).toBe(false);
  });

  it('spec(T-002:AC-7) != is exact, not tolerance-based, at a distance of 0.5', () => {
    expect(evaluatePredicate('a / b != 3', { a: 7, b: 2 })).toBe(true);
  });

  it('spec(T-002:AC-7) != is exact, not tolerance-based, at a distance of 0.1', () => {
    expect(evaluatePredicate('a / b != 3.4', { a: 7, b: 2 })).toBe(true);
  });

  it('spec(T-002:AC-7) comparison operands may be negative', () => {
    expect(evaluatePredicate('-a < b', { a: 1, b: 0 })).toBe(true);
  });
});

// --------------------------------------------------------------------------------------------
// AC-8 — logical operators and their relative precedence
// --------------------------------------------------------------------------------------------

describe('AC-8 — logical operators', () => {
  it('spec(T-002:AC-8) && binds tighter than ||', () => {
    expect(evaluatePredicate('a > 0 && b > 0 || a == 0', { a: 0, b: 0 })).toBe(true);
  });

  it('spec(T-002:AC-8) explicit parentheses matching && precedence give the same result', () => {
    expect(evaluatePredicate('(a > 0 && b > 0) || a == 0', { a: 0, b: 0 })).toBe(true);
  });

  it('spec(T-002:AC-8) explicit parentheses around || change the result', () => {
    expect(evaluatePredicate('a > 0 && (b > 0 || a == 0)', { a: 0, b: 0 })).toBe(false);
  });

  it('spec(T-002:AC-8) the mixed expression is true when both conjuncts hold', () => {
    expect(evaluatePredicate('a > 0 && b > 0 || a == 0', { a: 1, b: 1 })).toBe(true);
  });

  it('spec(T-002:AC-8) the mixed expression is false when neither branch holds', () => {
    expect(evaluatePredicate('a > 0 && b > 0 || a == 0', { a: 1, b: 0 })).toBe(false);
  });

  it('spec(T-002:AC-8) && is true only when both operands are true', () => {
    expect(evaluatePredicate('a > 0 && b > 0', { a: 1, b: 1 })).toBe(true);
  });

  it('spec(T-002:AC-8) && is false when the left operand is false', () => {
    expect(evaluatePredicate('a > 0 && b > 0', { a: 0, b: 1 })).toBe(false);
  });

  it('spec(T-002:AC-8) && is false when the right operand is false', () => {
    expect(evaluatePredicate('a > 0 && b > 0', { a: 1, b: 0 })).toBe(false);
  });

  it('spec(T-002:AC-8) || is true when only the right operand is true', () => {
    expect(evaluatePredicate('a > 0 || b > 0', { a: 0, b: 1 })).toBe(true);
  });

  it('spec(T-002:AC-8) || is false when both operands are false', () => {
    expect(evaluatePredicate('a > 0 || b > 0', { a: 0, b: 0 })).toBe(false);
  });

  it('spec(T-002:AC-8) && chains across three comparisons', () => {
    expect(evaluatePredicate('a > 0 && b > 0 && a + b <= 10', { a: 4, b: 4 })).toBe(true);
  });

  it('spec(T-002:AC-8) a false conjunct anywhere in a && chain makes it false', () => {
    expect(evaluatePredicate('a > 0 && b > 0 && a + b <= 10', { a: 9, b: 9 })).toBe(false);
  });
});

// --------------------------------------------------------------------------------------------
// AC-9 — unknown identifiers
// --------------------------------------------------------------------------------------------

describe('AC-9 — unknown identifiers', () => {
  it('spec(T-002:AC-9) an identifier absent from the environment throws UNKNOWN_IDENTIFIER', () => {
    expectNumberError('a + z', { a: 1 }, 'UNKNOWN_IDENTIFIER');
  });

  it('spec(T-002:AC-9) the UNKNOWN_IDENTIFIER message names the offending identifier', () => {
    const err = expectNumberError('a + z', { a: 1 }, 'UNKNOWN_IDENTIFIER');
    expect(err.message).toMatch(/\bz\b/);
  });

  it('spec(T-002:AC-9) ExprError is a real Error subclass', () => {
    const err = catchExprError(() => evaluateNumber('a + z', { a: 1 }));
    expect(err).toBeInstanceOf(Error);
  });

  it('spec(T-002:AC-9) evaluatePredicate also rejects unknown identifiers', () => {
    expectPredicateError('z > 0', {}, 'UNKNOWN_IDENTIFIER');
  });

  it('spec(T-002:AC-9) an inherited Object.prototype member is not a resolvable identifier', () => {
    expectNumberError('constructor', {}, 'UNKNOWN_IDENTIFIER');
  });

  it('spec(T-002:AC-9) toString is not a resolvable identifier', () => {
    expectNumberError('toString', {}, 'UNKNOWN_IDENTIFIER');
  });

  it('spec(T-002:AC-9) hasOwnProperty is not a resolvable identifier', () => {
    expectNumberError('hasOwnProperty', {}, 'UNKNOWN_IDENTIFIER');
  });

  it('spec(T-002:AC-9) __proto__ is not a resolvable identifier', () => {
    expectNumberError('__proto__', {}, 'UNKNOWN_IDENTIFIER');
  });

  it('spec(T-002:AC-9) a whitelisted function name is not usable as a bare value', () => {
    expectNumberError('abs + a', { a: 1 }, 'UNKNOWN_IDENTIFIER');
  });

  it('spec(T-002:AC-9) an unknown identifier is reported even when it appears first', () => {
    expectNumberError('z + a', { a: 1 }, 'UNKNOWN_IDENTIFIER');
  });

  it('spec(T-002:AC-9) multi-character identifiers resolve from the environment', () => {
    expect(evaluateNumber('num1 + _x2', { num1: 1, _x2: 2 })).toBe(3);
  });

  it('spec(T-002:AC-9) identifier lookup is case sensitive', () => {
    expectNumberError('A + b', { a: 1, b: 2 }, 'UNKNOWN_IDENTIFIER');
  });
});

// --------------------------------------------------------------------------------------------
// AC-10 — unknown functions and arity
// --------------------------------------------------------------------------------------------

describe('AC-10 — function whitelist and arity', () => {
  it('spec(T-002:AC-10) calling a non-whitelisted function throws UNKNOWN_FUNCTION', () => {
    expectNumberError('foo(a)', { a: 1 }, 'UNKNOWN_FUNCTION');
  });

  it('spec(T-002:AC-10) the UNKNOWN_FUNCTION message names the offending function', () => {
    const err = expectNumberError('foo(a)', { a: 1 }, 'UNKNOWN_FUNCTION');
    expect(err.message).toMatch(/\bfoo\b/);
  });

  it('spec(T-002:AC-10) calling a two-argument function with one argument throws ARITY_MISMATCH', () => {
    expectNumberError('min(a)', { a: 1 }, 'ARITY_MISMATCH');
  });

  it('spec(T-002:AC-10) max with one argument throws ARITY_MISMATCH', () => {
    expectNumberError('max(a)', { a: 1 }, 'ARITY_MISMATCH');
  });

  it('spec(T-002:AC-10) gcd with one argument throws ARITY_MISMATCH', () => {
    expectNumberError('gcd(a)', { a: 1 }, 'ARITY_MISMATCH');
  });

  it('spec(T-002:AC-10) abs with two arguments throws ARITY_MISMATCH', () => {
    expectNumberError('abs(a, b)', { a: 1, b: 2 }, 'ARITY_MISMATCH');
  });

  it('spec(T-002:AC-10) floor with two arguments throws ARITY_MISMATCH', () => {
    expectNumberError('floor(a, b)', { a: 1, b: 2 }, 'ARITY_MISMATCH');
  });

  it('spec(T-002:AC-10) ceil with two arguments throws ARITY_MISMATCH', () => {
    expectNumberError('ceil(a, b)', { a: 1, b: 2 }, 'ARITY_MISMATCH');
  });

  it('spec(T-002:AC-10) min with three arguments throws ARITY_MISMATCH', () => {
    expectNumberError('min(a, b, a)', { a: 1, b: 2 }, 'ARITY_MISMATCH');
  });

  it('spec(T-002:AC-10) a JS built-in reachable by name is not a callable function', () => {
    expectNumberError('constructor(a)', { a: 1 }, 'UNKNOWN_FUNCTION');
  });

  it('spec(T-002:AC-10) a global object name is not a callable function', () => {
    expectNumberError('Math(a)', { a: 1 }, 'UNKNOWN_FUNCTION');
  });

  it('spec(T-002:AC-10) an environment key is not promoted to a callable function', () => {
    expectNumberError('a(b)', { a: 1, b: 2 }, 'UNKNOWN_FUNCTION');
  });

  it('spec(T-002:AC-10) function names are case sensitive', () => {
    expectNumberError('ABS(a)', { a: 1 }, 'UNKNOWN_FUNCTION');
  });
});

// --------------------------------------------------------------------------------------------
// AC-11 — malformed input
// --------------------------------------------------------------------------------------------

describe('AC-11 — malformed input rejected with PARSE_ERROR', () => {
  /** The six inputs enumerated verbatim by AC-11. */
  const REQUIRED_MALFORMED = ['a +', '(a + b', 'a ** b', '', 'a b', 'a $ b'];

  for (const expr of REQUIRED_MALFORMED) {
    it(`spec(T-002:AC-11) rejects ${JSON.stringify(expr)} with PARSE_ERROR`, () => {
      expectNumberError(expr, { a: 1, b: 2 }, 'PARSE_ERROR');
    });
  }

  /**
   * Further inputs outside the closed grammar declared by T-002
   * ("Grammar (complete — reject anything outside it)"), including injection-shaped strings.
   */
  const OUT_OF_GRAMMAR = [
    'a + b)',
    '   ',
    'a, b',
    '()',
    'a & b',
    'a | b',
    'a ^ b',
    'a = b',
    '!a',
    'a.b',
    'a; b',
    '1.2.3',
    '.5',
    '1.',
    '+ a',
    'a ++ b',
    'a < b < c',
    '- -a',
    "require('fs')",
    'process.exit(1)',
    "globalThis['eval']",
    '(function () {})()',
    'a + b; process.exit(1)',
    '"a"',
    '`a`',
    'a?b:b',
    // `NUMBER := digits ( "." digits )?` excludes exponents, radix prefixes and separators, not
    // only misplaced decimal points. A `Number()`-friendly greedy tokenizer accepts all of these.
    '1e3',
    '1E3',
    '0x10',
    '1_000',
    '0b11',
    '0o17',
  ];

  for (const expr of OUT_OF_GRAMMAR) {
    it(`spec(T-002:AC-11) rejects out-of-grammar input ${JSON.stringify(expr)} with PARSE_ERROR`, () => {
      expectNumberError(expr, { a: 1, b: 2 }, 'PARSE_ERROR');
    });
  }

  it('spec(T-002:AC-11) evaluatePredicate rejects the empty string with PARSE_ERROR', () => {
    expectPredicateError('', {}, 'PARSE_ERROR');
  });

  it('spec(T-002:AC-11) evaluatePredicate rejects an unbalanced parenthesis with PARSE_ERROR', () => {
    expectPredicateError('(a > b', { a: 2, b: 1 }, 'PARSE_ERROR');
  });

  it('spec(T-002:AC-11) evaluatePredicate rejects a trailing logical operator with PARSE_ERROR', () => {
    expectPredicateError('a > b &&', { a: 2, b: 1 }, 'PARSE_ERROR');
  });

  it('spec(T-002:AC-11) a syntax error is reported even when every identifier is bound', () => {
    expectNumberError('a b', { a: 1, b: 2 }, 'PARSE_ERROR');
  });
});

// --------------------------------------------------------------------------------------------
// AC-12 — division by zero
// --------------------------------------------------------------------------------------------

describe('AC-12 — division by zero', () => {
  it('spec(T-002:AC-12) dividing by a zero-valued identifier throws DIVISION_BY_ZERO', () => {
    expectNumberError('a / b', { a: 1, b: 0 }, 'DIVISION_BY_ZERO');
  });

  it('spec(T-002:AC-12) taking a remainder by a zero-valued identifier throws DIVISION_BY_ZERO', () => {
    expectNumberError('a % b', { a: 1, b: 0 }, 'DIVISION_BY_ZERO');
  });

  it('spec(T-002:AC-12) zero divided by zero throws DIVISION_BY_ZERO rather than returning NaN', () => {
    expectNumberError('a / b', { a: 0, b: 0 }, 'DIVISION_BY_ZERO');
  });

  it('spec(T-002:AC-12) dividing by a zero literal throws DIVISION_BY_ZERO', () => {
    expectNumberError('a / 0', { a: 1 }, 'DIVISION_BY_ZERO');
  });

  it('spec(T-002:AC-12) a divisor that evaluates to zero throws DIVISION_BY_ZERO', () => {
    expectNumberError('a / (b - c)', { a: 1, b: 3, c: 3 }, 'DIVISION_BY_ZERO');
  });

  it('spec(T-002:AC-12) division by zero inside a function argument throws DIVISION_BY_ZERO', () => {
    expectNumberError('floor(a / b)', { a: 1, b: 0 }, 'DIVISION_BY_ZERO');
  });

  it('spec(T-002:AC-12) a division-by-zero predicate throws rather than comparing NaN', () => {
    expectPredicateError('a / b > 0', { a: 1, b: 0 }, 'DIVISION_BY_ZERO');
  });

  it('spec(T-002:AC-12) dividing by a negative zero-difference throws DIVISION_BY_ZERO', () => {
    expectNumberError('a % (b - c)', { a: 5, b: 2, c: 2 }, 'DIVISION_BY_ZERO');
  });

  it('spec(T-002:AC-12) ordinary results are finite numbers, never NaN or Infinity', () => {
    for (const expr of ['a + b', 'a - b', 'a * b', 'a / b', 'a % b', '-a', 'gcd(a, b)']) {
      const result = evaluateNumber(expr, { a: 7, b: 2 });
      expect(Number.isFinite(result), `${expr} produced ${String(result)}`).toBe(true);
    }
  });
});

// --------------------------------------------------------------------------------------------
// AC-13 — booleans and numbers do not mix
// --------------------------------------------------------------------------------------------

describe('AC-13 — type mismatches between numeric and boolean results', () => {
  it('spec(T-002:AC-13) evaluateNumber rejects a comparison at top level', () => {
    expectNumberError('a > b', { a: 2, b: 1 }, 'TYPE_MISMATCH');
  });

  it('spec(T-002:AC-13) evaluatePredicate rejects an arithmetic expression at top level', () => {
    expectPredicateError('a + b', { a: 1, b: 1 }, 'TYPE_MISMATCH');
  });

  it('spec(T-002:AC-13) evaluateNumber rejects a logical expression at top level', () => {
    expectNumberError('a > b && b > 0', { a: 2, b: 1 }, 'TYPE_MISMATCH');
  });

  it('spec(T-002:AC-13) evaluatePredicate rejects a bare identifier at top level', () => {
    expectPredicateError('a', { a: 1 }, 'TYPE_MISMATCH');
  });

  it('spec(T-002:AC-13) evaluatePredicate rejects a numeric literal at top level', () => {
    expectPredicateError('1', {}, 'TYPE_MISMATCH');
  });

  it('spec(T-002:AC-13) a boolean operand inside arithmetic throws TYPE_MISMATCH', () => {
    expectNumberError('(a > b) + 1', { a: 2, b: 1 }, 'TYPE_MISMATCH');
  });

  it('spec(T-002:AC-13) a numeric operand inside && throws TYPE_MISMATCH', () => {
    expectPredicateError('a && b', { a: 1, b: 1 }, 'TYPE_MISMATCH');
  });

  it('spec(T-002:AC-13) a numeric operand inside || throws TYPE_MISMATCH', () => {
    expectPredicateError('a || b', { a: 1, b: 1 }, 'TYPE_MISMATCH');
  });

  it('spec(T-002:AC-13) a boolean argument to a whitelisted function throws TYPE_MISMATCH', () => {
    expectNumberError('abs(a > b)', { a: 2, b: 1 }, 'TYPE_MISMATCH');
  });

  it('spec(T-002:AC-13) a boolean operand of a comparison throws TYPE_MISMATCH', () => {
    expectPredicateError('(a > b) > 0', { a: 2, b: 1 }, 'TYPE_MISMATCH');
  });

  it('spec(T-002:AC-13) evaluateNumber accepts an arithmetic expression and returns a number', () => {
    expect(typeof evaluateNumber('a + b', { a: 1, b: 1 })).toBe('number');
  });

  it('spec(T-002:AC-13) evaluatePredicate accepts a comparison and returns a boolean', () => {
    expect(typeof evaluatePredicate('a > b', { a: 2, b: 1 })).toBe('boolean');
  });

  it('spec(T-002:AC-13) evaluatePredicate accepts a parenthesised comparison', () => {
    expect(evaluatePredicate('(a > b)', { a: 2, b: 1 })).toBe(true);
  });
});

// --------------------------------------------------------------------------------------------
// AC-14 — purity and repeatability
// --------------------------------------------------------------------------------------------

describe('AC-14 — evaluation is pure and holds no cross-call state', () => {
  it('spec(T-002:AC-14) evaluateNumber returns an identical result across 100 calls', () => {
    const env: Env = { a: 2, b: 3, c: 4 };
    const results = new Set<number>();
    for (let i = 0; i < 100; i += 1) {
      results.add(evaluateNumber('a + b * c', env));
    }
    expect([...results]).toEqual([14]);
  });

  it('spec(T-002:AC-14) evaluatePredicate returns an identical result across 100 calls', () => {
    const env: Env = { a: 9, b: 9 };
    const results = new Set<boolean>();
    for (let i = 0; i < 100; i += 1) {
      results.add(evaluatePredicate('a + b <= 20', env));
    }
    expect([...results]).toEqual([true]);
  });

  it('spec(T-002:AC-14) interleaving other expressions does not perturb a result', () => {
    const results: number[] = [];
    for (let i = 0; i < 100; i += 1) {
      evaluateNumber('a * b - c', { a: i + 1, b: i + 2, c: i });
      evaluatePredicate('a > b', { a: i, b: 50 });
      results.push(evaluateNumber('a + b * c', { a: 2, b: 3, c: 4 }));
    }
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe(14);
  });

  it('spec(T-002:AC-14) a failed evaluation does not change a later successful one', () => {
    for (let i = 0; i < 100; i += 1) {
      expectNumberError('a + z', { a: 1 }, 'UNKNOWN_IDENTIFIER');
      expect(evaluateNumber('a + b', { a: 1, b: 2 })).toBe(3);
    }
  });

  it('spec(T-002:AC-14) the same error code is thrown on every repetition', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      codes.add(catchExprError(() => evaluateNumber('a / b', { a: 1, b: 0 })).code);
    }
    expect([...codes]).toEqual(['DIVISION_BY_ZERO']);
  });

  it('spec(T-002:AC-14) evaluateNumber does not mutate the environment it is given', () => {
    const env: Env = { a: 2, b: 3, c: 4 };
    evaluateNumber('a + b * c', env);
    expect(env).toEqual({ a: 2, b: 3, c: 4 });
  });

  it('spec(T-002:AC-14) evaluatePredicate does not mutate the environment it is given', () => {
    const env: Env = { a: 9, b: 9 };
    evaluatePredicate('a + b <= 20', env);
    expect(env).toEqual({ a: 9, b: 9 });
  });

  it('spec(T-002:AC-14) results track the environment, not a cached first environment', () => {
    expect(evaluateNumber('a + b', { a: 1, b: 1 })).toBe(2);
    expect(evaluateNumber('a + b', { a: 5, b: 6 })).toBe(11);
    expect(evaluateNumber('a + b', { a: 1, b: 1 })).toBe(2);
  });
});

// --------------------------------------------------------------------------------------------
// AC-15 — parser depth limit
// --------------------------------------------------------------------------------------------

describe('AC-15 — parser depth limit instead of stack overflow', () => {
  it('spec(T-002:AC-15) 200 nested parentheses throw PARSE_ERROR', () => {
    const expr = `${'('.repeat(200)}a${')'.repeat(200)}`;
    expectNumberError(expr, { a: 1 }, 'PARSE_ERROR');
  });

  it('spec(T-002:AC-15) 1000 nested parentheses throw PARSE_ERROR rather than crashing', () => {
    const expr = `${'('.repeat(1000)}a${')'.repeat(1000)}`;
    expectNumberError(expr, { a: 1 }, 'PARSE_ERROR');
  });

  it('spec(T-002:AC-15) 200 nested function calls throw PARSE_ERROR', () => {
    const expr = `${'abs('.repeat(200)}a${')'.repeat(200)}`;
    expectNumberError(expr, { a: 1 }, 'PARSE_ERROR');
  });

  it('spec(T-002:AC-15) evaluatePredicate also enforces the depth limit', () => {
    const expr = `${'('.repeat(200)}a${')'.repeat(200)} > 0`;
    expectPredicateError(expr, { a: 1 }, 'PARSE_ERROR');
  });

  it('spec(T-002:AC-15) an over-deep expression throws ExprError, not a RangeError', () => {
    const expr = `${'('.repeat(5000)}a${')'.repeat(5000)}`;
    const err = catchExprError(() => evaluateNumber(expr, { a: 1 }));
    expect(err).not.toBeInstanceOf(RangeError);
    expect(err.code).toBe('PARSE_ERROR');
  });
});

// --------------------------------------------------------------------------------------------
// AC-16 — `%` uses JavaScript remainder semantics (sign follows the dividend)
// --------------------------------------------------------------------------------------------

describe('AC-16 — remainder with negative operands', () => {
  it('spec(T-002:AC-16) a negative left operand yields a negative remainder', () => {
    expect(evaluateNumber('a % b', { a: -7, b: 2 })).toBe(-1);
  });

  it('spec(T-002:AC-16) a negative left operand does not yield the mathematical modulo', () => {
    expect(evaluateNumber('a % b', { a: -7, b: 2 })).not.toBe(1);
  });

  it('spec(T-002:AC-16) a negative right operand yields a positive remainder', () => {
    expect(evaluateNumber('a % b', { a: 7, b: -2 })).toBe(1);
  });

  it('spec(T-002:AC-16) both operands negative follows the dividend sign', () => {
    expect(evaluateNumber('a % b', { a: -7, b: -2 })).toBe(-1);
  });

  it('spec(T-002:AC-16) a unary-minus dividend follows the same rule', () => {
    expect(evaluateNumber('-a % b', { a: 7, b: 2 })).toBe(-1);
  });

  it('spec(T-002:AC-16) the documented true-modulo idiom recovers a non-negative result', () => {
    expect(evaluateNumber('((a % b) + b) % b', { a: -7, b: 2 })).toBe(1);
  });

  it('spec(T-002:AC-16) the divisibility idiom still holds for a negative dividend', () => {
    expect(evaluatePredicate('a % b == 0', { a: -12, b: 4 })).toBe(true);
  });

  it('spec(T-002:AC-16) the divisibility idiom still rejects an indivisible negative dividend', () => {
    expect(evaluatePredicate('a % b == 0', { a: -13, b: 4 })).toBe(false);
  });
});

// --------------------------------------------------------------------------------------------
// AC-17 — gcd operates on absolute values and terminates on zero
// --------------------------------------------------------------------------------------------

describe('AC-17 — gcd with zero and negative arguments', () => {
  it('spec(T-002:AC-17) a negative first argument is taken by absolute value', () => {
    expect(evaluateNumber('gcd(a, b)', { a: -12, b: 18 })).toBe(6);
  });

  it('spec(T-002:AC-17) a negative second argument is taken by absolute value', () => {
    expect(evaluateNumber('gcd(a, b)', { a: 12, b: -18 })).toBe(6);
  });

  it('spec(T-002:AC-17) two negative arguments are taken by absolute value', () => {
    expect(evaluateNumber('gcd(a, b)', { a: -12, b: -18 })).toBe(6);
  });

  it('spec(T-002:AC-17) gcd of zero and a non-zero value is that value', () => {
    expect(evaluateNumber('gcd(a, b)', { a: 0, b: 5 })).toBe(5);
  });

  it('spec(T-002:AC-17) gcd is symmetric when the zero is the second argument', () => {
    expect(evaluateNumber('gcd(a, b)', { a: 5, b: 0 })).toBe(5);
  });

  it('spec(T-002:AC-17) gcd of zero and zero is zero', () => {
    expect(evaluateNumber('gcd(a, b)', { a: 0, b: 0 })).toBe(0);
  });

  it('spec(T-002:AC-17) gcd of a negative and zero is the absolute value', () => {
    expect(evaluateNumber('gcd(a, b)', { a: -5, b: 0 })).toBe(5);
  });

  it('spec(T-002:AC-17) gcd result is a finite number for every degenerate pair', () => {
    for (const [a, b] of [
      [0, 0],
      [0, 5],
      [-12, 18],
      [-12, -18],
    ] as ReadonlyArray<[number, number]>) {
      const result = evaluateNumber('gcd(a, b)', { a, b });
      expect(Number.isFinite(result), `gcd(${a}, ${b}) produced ${String(result)}`).toBe(true);
    }
  });
});

// --------------------------------------------------------------------------------------------
// AC-18 — a zero-argument call is a grammar violation, not an arity violation
// --------------------------------------------------------------------------------------------

describe('AC-18 — zero-argument calls are PARSE_ERROR', () => {
  for (const name of ['abs', 'floor', 'ceil', 'min', 'max', 'gcd']) {
    it(`spec(T-002:AC-18) ${name}() throws PARSE_ERROR, not ARITY_MISMATCH`, () => {
      expectNumberError(`${name}()`, { a: 1, b: 2 }, 'PARSE_ERROR');
    });
  }

  it('spec(T-002:AC-18) a zero-argument call is rejected before the function name is resolved', () => {
    expectNumberError('foo()', { a: 1 }, 'PARSE_ERROR');
  });

  it('spec(T-002:AC-18) a whitespace-only argument list is still PARSE_ERROR', () => {
    expectNumberError('abs(   )', { a: 1 }, 'PARSE_ERROR');
  });

  it('spec(T-002:AC-18) one-too-few arguments remains ARITY_MISMATCH', () => {
    expectNumberError('min(a)', { a: 1 }, 'ARITY_MISMATCH');
  });

  it('spec(T-002:AC-18) one-too-many arguments remains ARITY_MISMATCH', () => {
    expectNumberError('abs(a, b)', { a: 1, b: 2 }, 'ARITY_MISMATCH');
  });
});

// --------------------------------------------------------------------------------------------
// AC-19 — ExprErrorCode is a type-only export; ExprError is the runtime class
// --------------------------------------------------------------------------------------------

describe('AC-19 — the exported error contract', () => {
  it('spec(T-002:AC-19) ExprErrorCode is exactly the six documented codes', () => {
    const codeUnionIsExact: Exact<
      ExprErrorCode,
      | 'PARSE_ERROR'
      | 'UNKNOWN_IDENTIFIER'
      | 'UNKNOWN_FUNCTION'
      | 'ARITY_MISMATCH'
      | 'DIVISION_BY_ZERO'
      | 'TYPE_MISMATCH'
    > = true;

    expect(codeUnionIsExact).toBe(true);
  });

  it('spec(T-002:AC-19) a thrown ExprError carries a code assignable to ExprErrorCode', () => {
    const err = catchExprError(() => evaluateNumber('a +', { a: 1 }));
    const code: ExprErrorCode = err.code;
    expect(code).toBe('PARSE_ERROR');
  });

  it('spec(T-002:AC-19) ExprErrorCode has no runtime value binding', async () => {
    const mod = await import('@engine/questions/expr');
    expect(Object.keys(mod)).not.toContain('ExprErrorCode');
    // @ts-expect-error `ExprErrorCode` is a type-only export, so it is not on the value namespace.
    expect(mod.ExprErrorCode).toBeUndefined();
  });

  it('spec(T-002:AC-19) the module exports evaluateNumber and evaluatePredicate as functions', async () => {
    const mod = await import('@engine/questions/expr');
    expect(typeof mod.evaluateNumber).toBe('function');
    expect(typeof mod.evaluatePredicate).toBe('function');
  });

  it('spec(T-002:AC-19) ExprError is a runtime class whose prototype chain reaches Error', () => {
    expect(typeof ExprError).toBe('function');
    expect(Object.getPrototypeOf(ExprError.prototype)).toBe(Error.prototype);
  });

  it('spec(T-002:AC-19) every documented code is reachable from a real evaluation', () => {
    const observed = new Set<ExprErrorCode>([
      catchExprError(() => evaluateNumber('a +', { a: 1 })).code,
      catchExprError(() => evaluateNumber('a + z', { a: 1 })).code,
      catchExprError(() => evaluateNumber('foo(a)', { a: 1 })).code,
      catchExprError(() => evaluateNumber('min(a)', { a: 1 })).code,
      catchExprError(() => evaluateNumber('a / b', { a: 1, b: 0 })).code,
      catchExprError(() => evaluateNumber('a > b', { a: 2, b: 1 })).code,
    ]);

    expect([...observed].sort()).toEqual([
      'ARITY_MISMATCH',
      'DIVISION_BY_ZERO',
      'PARSE_ERROR',
      'TYPE_MISMATCH',
      'UNKNOWN_FUNCTION',
      'UNKNOWN_IDENTIFIER',
    ]);
  });
});

// --------------------------------------------------------------------------------------------
// AC-20 — the depth limit has a usable floor
// --------------------------------------------------------------------------------------------

describe('AC-20 — 16 nested levels must still evaluate', () => {
  it('spec(T-002:AC-20) 16 nested parentheses evaluate successfully', () => {
    const expr = `${'('.repeat(16)}a${')'.repeat(16)}`;
    expect(evaluateNumber(expr, { a: 1 })).toBe(1);
  });

  it('spec(T-002:AC-20) 16 nested parentheses around a compound expression evaluate', () => {
    const expr = `${'('.repeat(16)}a + b * c${')'.repeat(16)}`;
    expect(evaluateNumber(expr, { a: 2, b: 3, c: 4 })).toBe(14);
  });

  it('spec(T-002:AC-20) 16 nested function calls evaluate successfully', () => {
    const expr = `${'abs('.repeat(16)}a${')'.repeat(16)}`;
    expect(evaluateNumber(expr, { a: 5 })).toBe(5);
  });

  it('spec(T-002:AC-20) a 16-level nested predicate evaluates successfully', () => {
    const expr = `${'('.repeat(16)}a + b <= 20${')'.repeat(16)}`;
    expect(evaluatePredicate(expr, { a: 9, b: 9 })).toBe(true);
  });
});

// --------------------------------------------------------------------------------------------
// AC-22 — the function whitelist is CLOSED, not "whatever Math exposes"
//
// Every AC-10 negative uses a name that is not an own property of `Math`, so an evaluator
// resolving calls as `hasOwnProperty.call(Math, name) ? Math[name] : ...` satisfies all of them.
// These names are real `Math` own-properties and are NOT on the declared whitelist.
// --------------------------------------------------------------------------------------------

/** `Math` own-properties that are deliberately absent from the whitelist. */
const MATH_OWN_NON_WHITELISTED = [
  'sqrt',
  'round',
  'pow',
  'sign',
  'trunc',
  'log',
  'hypot',
  'cbrt',
  'random',
  'atan2',
  'imul',
];

/** The whitelist, verbatim from the ticket. Five of these six are also `Math` own-properties. */
const WHITELISTED_FUNCTIONS = ['abs', 'min', 'max', 'floor', 'ceil', 'gcd'];

describe('AC-22 — Math own-properties outside the whitelist are rejected', () => {
  it('spec(T-002:AC-22) every name in this block really is an own-property of Math', () => {
    for (const name of MATH_OWN_NON_WHITELISTED) {
      expect(
        Object.prototype.hasOwnProperty.call(Math, name),
        `${name} is not an own property of Math — this block would be testing nothing`,
      ).toBe(true);
    }
  });

  it('spec(T-002:AC-22) no whitelisted name is accidentally in the rejection list', () => {
    for (const name of WHITELISTED_FUNCTIONS) {
      expect(MATH_OWN_NON_WHITELISTED).not.toContain(name);
    }
  });

  for (const name of MATH_OWN_NON_WHITELISTED) {
    it(`spec(T-002:AC-22) ${name}(a) is UNKNOWN_FUNCTION, not silently resolved from Math`, () => {
      expectNumberError(`${name}(a)`, { a: 4, b: 2 }, 'UNKNOWN_FUNCTION');
    });

    it(`spec(T-002:AC-22) ${name}(a, b) is UNKNOWN_FUNCTION at two-argument arity too`, () => {
      expectNumberError(`${name}(a, b)`, { a: 4, b: 2 }, 'UNKNOWN_FUNCTION');
    });
  }

  it('spec(T-002:AC-22) a non-function Math own-property is not a callable function', () => {
    expectNumberError('PI(a)', { a: 1 }, 'UNKNOWN_FUNCTION');
  });

  it('spec(T-002:AC-22) a non-function Math own-property is not a resolvable identifier', () => {
    expectNumberError('PI', {}, 'UNKNOWN_IDENTIFIER');
  });

  it('spec(T-002:AC-22) Math.E is not a resolvable identifier', () => {
    expectNumberError('E', {}, 'UNKNOWN_IDENTIFIER');
  });

  it('spec(T-002:AC-22) all six whitelisted names remain callable', () => {
    expect(evaluateNumber('abs(0 - 5)', {})).toBe(5);
    expect(evaluateNumber('min(a, b)', { a: 3, b: 9 })).toBe(3);
    expect(evaluateNumber('max(a, b)', { a: 3, b: 9 })).toBe(9);
    expect(evaluateNumber('floor(a / b)', { a: 7, b: 2 })).toBe(3);
    expect(evaluateNumber('ceil(a / b)', { a: 7, b: 2 })).toBe(4);
    expect(evaluateNumber('gcd(a, b)', { a: 12, b: 18 })).toBe(6);
  });
});

// --------------------------------------------------------------------------------------------
// AC-23 — `&&` and `||` short-circuit (host-language semantics, per the AC-16 ruling)
//
// T-007 rejection-samples params and calls evaluatePredicate per candidate. Under eager
// evaluation a guarded constraint THROWS on a candidate it was written to reject, turning an
// ordinary rejection into a generator crash.
// --------------------------------------------------------------------------------------------

describe('AC-23 — short-circuit evaluation of logical operators', () => {
  it('spec(T-002:AC-23) || does not evaluate its right operand when the left is true', () => {
    expect(evaluatePredicate('b == 0 || a % b == 0', { a: 5, b: 0 })).toBe(true);
  });

  it('spec(T-002:AC-23) && does not evaluate its right operand when the left is false', () => {
    expect(evaluatePredicate('b != 0 && a % b == 0', { a: 5, b: 0 })).toBe(false);
  });

  it('spec(T-002:AC-23) a short-circuited operand is still type-checked', () => {
    expectPredicateError('b == 0 || a', { a: 5, b: 0 }, 'TYPE_MISMATCH');
  });

  it('spec(T-002:AC-23) a short-circuited && operand is still type-checked', () => {
    expectPredicateError('b != 0 && a', { a: 5, b: 0 }, 'TYPE_MISMATCH');
  });

  it('spec(T-002:AC-23) || still evaluates its right operand when the left is false', () => {
    expectPredicateError('b == 1 || a % b == 0', { a: 5, b: 0 }, 'DIVISION_BY_ZERO');
  });

  it('spec(T-002:AC-23) && still evaluates its right operand when the left is true', () => {
    expectPredicateError('b == 0 && a % b == 0', { a: 5, b: 0 }, 'DIVISION_BY_ZERO');
  });

  it('spec(T-002:AC-23) a division guard short-circuits the same way', () => {
    expect(evaluatePredicate('b == 0 || a / b > 1', { a: 5, b: 0 })).toBe(true);
  });

  it('spec(T-002:AC-23) a guarded constraint still evaluates normally for a valid candidate', () => {
    expect(evaluatePredicate('b == 0 || a % b == 0', { a: 12, b: 4 })).toBe(true);
  });

  it('spec(T-002:AC-23) a guarded constraint still rejects an invalid candidate', () => {
    expect(evaluatePredicate('b == 0 || a % b == 0', { a: 13, b: 4 })).toBe(false);
  });

  it('spec(T-002:AC-23) short-circuiting composes left to right across a chain', () => {
    expect(evaluatePredicate('b == 0 || a % b == 0 || a / b > 1', { a: 5, b: 0 })).toBe(true);
  });
});

// --------------------------------------------------------------------------------------------
// AC-24 — identifier resolution is STATIC, and survives short-circuiting
//
// Short-circuiting suppresses only genuinely value-dependent failures (DIVISION_BY_ZERO).
// An identifier that cannot resolve is a defect in hand-authored content: a typo'd parameter
// would otherwise sit undetected in a catalog for as long as its branch happened to be
// short-circuited, and T-019's sample sweep cannot guarantee that branch is ever evaluated.
// --------------------------------------------------------------------------------------------

describe('AC-24 — every identifier must resolve, evaluated branch or not', () => {
  it('spec(T-002:AC-24) an unknown identifier in a short-circuited || operand still throws', () => {
    expectPredicateError('b == 0 || z > 0', { b: 0 }, 'UNKNOWN_IDENTIFIER');
  });

  it('spec(T-002:AC-24) an unknown identifier in an evaluated || operand throws', () => {
    expectPredicateError('b == 1 || z > 0', { b: 0 }, 'UNKNOWN_IDENTIFIER');
  });

  it('spec(T-002:AC-24) an unknown identifier in a short-circuited && operand still throws', () => {
    expectPredicateError('b != 0 && z > 0', { b: 0 }, 'UNKNOWN_IDENTIFIER');
  });

  it('spec(T-002:AC-24) an unknown identifier in an evaluated && operand throws', () => {
    expectPredicateError('b == 0 && z > 0', { b: 0 }, 'UNKNOWN_IDENTIFIER');
  });

  it('spec(T-002:AC-24) an unknown identifier in the left operand throws', () => {
    expectPredicateError('z > 0 || b == 0', { b: 0 }, 'UNKNOWN_IDENTIFIER');
  });

  it('spec(T-002:AC-24) the message names the unresolved identifier from the skipped branch', () => {
    const err = expectPredicateError('b == 0 || z > 0', { b: 0 }, 'UNKNOWN_IDENTIFIER');
    expect(err.message).toMatch(/\bz\b/);
  });

  it('spec(T-002:AC-24) an unknown identifier inside a short-circuited call argument throws', () => {
    expectPredicateError('b == 0 || abs(z) > 0', { b: 0 }, 'UNKNOWN_IDENTIFIER');
  });

  it('spec(T-002:AC-24) a mistyped parameter in a guarded constraint is reported, not skipped', () => {
    expectPredicateError('a % b == 0 || zz > 1', { a: 12, b: 4 }, 'UNKNOWN_IDENTIFIER');
  });

  it('spec(T-002:AC-24) an unknown identifier in a short-circuited third disjunct throws', () => {
    expectPredicateError('b == 0 || a > 0 || z > 0', { a: 5, b: 0 }, 'UNKNOWN_IDENTIFIER');
  });

  // Positive controls — the rule must not be satisfiable by an evaluator that rejects everything.

  it('spec(T-002:AC-24) a short-circuited || operand using a valid identifier still succeeds', () => {
    expect(evaluatePredicate('b == 0 || a > 0', { a: 5, b: 0 })).toBe(true);
  });

  it('spec(T-002:AC-24) a short-circuited && operand using a valid identifier still succeeds', () => {
    expect(evaluatePredicate('b != 0 && a > 0', { a: 5, b: 0 })).toBe(false);
  });

  it('spec(T-002:AC-24) a short-circuited call argument using a valid identifier still succeeds', () => {
    expect(evaluatePredicate('b == 0 || abs(a) > 0', { a: 5, b: 0 })).toBe(true);
  });

  it('spec(T-002:AC-24) an environment key unused by the expression is not required', () => {
    expect(evaluatePredicate('b == 0 || a > 0', { a: 5, b: 0, unused: 99 })).toBe(true);
  });

  // The distinction the ruling turns on: a value-dependent failure is suppressed, name
  // resolution is not.

  it('spec(T-002:AC-24) short-circuiting suppresses DIVISION_BY_ZERO but not UNKNOWN_IDENTIFIER', () => {
    expect(evaluatePredicate('b == 0 || a % b == 0', { a: 5, b: 0 })).toBe(true);
    expectPredicateError('b == 0 || z % 2 == 0', { a: 5, b: 0 }, 'UNKNOWN_IDENTIFIER');
  });

  // NOTE: `"b == 0 || z"` — where the skipped operand is BOTH unresolvable and of the wrong
  // type — is deliberately NOT pinned. `UNKNOWN_IDENTIFIER` and `TYPE_MISMATCH` are each
  // defensible depending on the order of the static passes, and no criterion rules on it
  // (this is review finding M3, still open). Inventing an answer here would freeze a guess.
});
