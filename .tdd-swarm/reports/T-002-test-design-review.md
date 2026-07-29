# T-002 — Frozen-Test Design Review

**Ticket:** `/Users/quietguy/Documents/Dev/Gauntlet/Math Game/tickets/T-002.md` (main repo copy, 20 ACs)
**Tests under review:** `/Users/quietguy/Documents/Dev/Gauntlet/cannon-wt/wt-T-002/__tests__/engine/questions/expr.test.ts` (229 tests, 1,031 lines)
**Reviewer:** independent test-design review, pre-freeze
**Date:** 2026-07-27

**Verdict: DO NOT FREEZE.** One Critical, two Important. Everything else in this file is
genuinely strong — this is the best-built suite of the three I have seen in this run, and the
arithmetic core is provably correct. The Critical finding is not about the arithmetic: it is
that **the one thing AC-1 exists to prevent is not prevented**, and I have a passing
counter-example. All three fixes are additive (roughly 20 assertions plus one new `describe`
block); none require restructuring.

---

## 0. Method — measured, not read

Per L-011 I built a throwaway sandbox outside the repo
(`…/scratchpad/cheat`, `…/scratchpad/ac1`, `…/scratchpad/mathproxy`) with the project's own
`tsconfig.json`, `vitest.config.ts` and symlinked `node_modules`, wrote a reference
`src/engine/questions/expr.ts`, and ran the frozen suite against it and against 22 targeted
mutations plus 3 alternative whole implementations.

Baseline (honest tokenise → recursive-descent → evaluate reference):

```
Tests  229 passed (229)        npx tsc --noEmit: exit 0
```

So **nothing in this file is unsatisfiable, tautological, or self-contradictory.** Every finding
below is about a cheat that survives, not about a test that is too strict.

### Mutation results (each row = one deliberate defect injected into the reference)

| Mutant                                                            | Frozen suite                                   |
| ----------------------------------------------------------------- | ---------------------------------------------- |
| `-`/`+` right-associative                                         | **4 failed** / 225                             |
| `*`,`/`,`%` right-associative                                     | **3 failed** / 226                             |
| truncating integer division (`Math.trunc(l/r)`)                   | **5 failed** / 224                             |
| `<` implemented as `<=`                                           | **1 failed** / 228                             |
| `<=` implemented as `<`                                           | **2 failed** / 227                             |
| `>` implemented as `>=`                                           | **6 failed** / 223                             |
| `>=` implemented as `>`                                           | **1 failed** / 228                             |
| `\|\|` binds tighter than `&&`                                    | **1 failed** / 228                             |
| every error reported as `PARSE_ERROR`                             | **46 failed** / 183                            |
| `%` as mathematical modulo                                        | **4 failed** / 225                             |
| `gcd` without `Math.abs`                                          | **3 failed** / 226                             |
| depth limit = 2                                                   | **7 failed** / 222                             |
| no depth limit at all                                             | **5 failed** / 224                             |
| zero-arity call accepted → `ARITY_MISMATCH`                       | **8 failed** / 221                             |
| result memoised on source string only                             | **34 failed** / 195                            |
| `ExprErrorCode` exported as a runtime value                       | tsc **TS2578** at test:970 + 1 test failed     |
| `ExprError.code` widened to `string`                              | tsc **TS2322** at test:963, TS2769 at test:986 |
| a 7th code added to the union                                     | tsc **TS2322** at test:948                     |
| **`&&`/`\|\|` short-circuit toggled**                             | **229 passed — survives (I2)**                 |
| **function names resolved via `Math[name]`**                      | **229 passed — survives (I1)**                 |
| **tokenizer accepts `1e3` / `0x10`**                              | **229 passed — survives (M1)**                 |
| **`==`/`!=` compare with a 0.4 epsilon**                          | **229 passed — survives (M2)**                 |
| **dynamic code construction via `Reflect.construct(Function,…)`** | **229 passed — survives (C1)**                 |

---

## 1. Criterion coverage — CLEAN, all 20

I checked each AC clause by clause against its tests. **All twenty are genuinely encoded, none
gestured at.** `.tdd-swarm/spec-lint.sh tickets/T-002.md` is green in both directions.

| AC    | Where                | Verdict                                                                                         |
| ----- | -------------------- | ----------------------------------------------------------------------------------------------- |
| AC-1  | `expr.test.ts:65-77` | all six substrings, one test each — literal transcription (but see **C1**)                      |
| AC-2  | `:83-123`            | `14` and `20` verbatim, plus 8 reinforcements                                                   |
| AC-3  | `:129-191`           | all five results (`5,14,3.5,1,-7`) present; `3.5` asserted twice                                |
| AC-4  | `:197-233`           | `a-b-c=5`, `a/b/c=2` verbatim; 7 more                                                           |
| AC-5  | `:239-295`           | all six functions with the AC's exact arguments                                                 |
| AC-6  | `:301-341`           | both AC values plus 19/20/21 boundary triple                                                    |
| AC-7  | `:347-385`           | all six operators × 3 positions (`a<b`, `a==b`, `a>b`) = 18 cases                               |
| AC-8  | `:391-439`           | the AC's exact expression and env, plus 11                                                      |
| AC-9  | `:445-495`           | code + message-names-`z`, plus prototype-chain degenerates                                      |
| AC-10 | `:501-554`           | `foo(a)`→`UNKNOWN_FUNCTION`, `min(a)`→`ARITY_MISMATCH`, plus 11                                 |
| AC-11 | `:560-624`           | all six required inputs enumerated verbatim at `:562`, plus 25 out-of-grammar                   |
| AC-12 | `:630-669`           | `/` and `%` by zero, plus a "never NaN/Infinity" sweep                                          |
| AC-13 | `:675-727`           | both directions plus 11 nested-position cases                                                   |
| AC-14 | `:733-795`           | 100 iterations × 5 shapes, env non-mutation, no-stale-cache                                     |
| AC-15 | `:801-828`           | 200, 1000 and 5000 nesting; `not.toBeInstanceOf(RangeError)`                                    |
| AC-16 | `:834-866`           | `{-7,2}→-1`, `{7,-2}→1`, an explicit `not.toBe(1)`, the true-modulo idiom                       |
| AC-17 | `:872-912`           | all four AC pairs plus `{5,0}` and `{-5,0}`                                                     |
| AC-18 | `:918-940`           | all six names, `foo()`, whitespace-only arg list, both ARITY retentions                         |
| AC-19 | `:946-1004`          | `Exact<>` union, no value binding, `@ts-expect-error`, prototype chain, all six codes reachable |
| AC-20 | `:1010-1030`         | parens, compound, calls, predicate — all at exactly 16                                          |

The five newest criteria (AC-16…AC-20) are, if anything, the _best_ covered in the file. AC-16's
`not.toBe(1)` at `:840` is the right instinct — it names the rejected convention, not just the
accepted one (L-009). AC-18's loop over all six function names at `:919` closes the grammar-vs-arity
contradiction completely. AC-15/AC-20 together pin the depth limit to `[16, 199]`, which is a
usable window and does not dictate the exact value (correct response to L-006).

---

## 2. Arithmetic correctness — CLEAN, zero wrong expected values

Every hand-computed expectation in the file was re-derived against an **independent oracle**
(JavaScript's own operator semantics, which the ticket names as the reference for `/`, `%` and
precedence) with `abs/floor/ceil/min/max/gcd` shimmed, `==`→`===`.

```
independently checked: 100   (98 value assertions + the 18-row AC-7 table, minus 2
                              `typeof` assertions my extractor mis-parsed)
mismatches: 0
not auto-extracted: 0
```

I additionally hand-verified the fourteen least obvious ones:
`a - b / c = 7` (`:105`), `2 + 6 % 4 = 4` (`:109`), `a/b + 0.5 = 4` (`:189`),
`a / (b / c) = 4` (`:219`), `2 * 3 % 4 = 2` (`:227`), `a-b-c-d = 8` (`:231`),
`floor(0 - 7/2) = -4` (`:277`), `ceil(0 - 7/2) = -3` (`:281`), `min(a, max(b,c)) = 3` (`:285`),
`max(a+b, a*b) = 6` (`:289`), `floor(a/b)*10 = 30` (`:293`), `a*b >= a+b` (`:327`),
`-a % b = -1` (`:852`), `((a % b) + b) % b = 1` (`:856`). All correct.

**No wrong math is being frozen.** This is the dimension that mattered most and it is clean.

---

## 3. AC-19's type-level assertions — CLEAN and non-vacuous

The `Exact<>` helper at `expr.test.ts:26` is the same unparenthesised form the T-003 review
verified. I re-verified it independently in this file's exact compiler configuration with ten
probes (`Exact<C,C>=true`, `Exact<C,string>=false`, `Exact<C,C|'EXTRA'>=false`,
`Exact<C,Exclude<C,'TYPE_MISMATCH'>>=false`, `Exact<C,any>=false`, `Exact<C,never>=false`,
order-insensitivity, and equivalence with the canonical parenthesised `IsEqual` in three cases).
**All ten compile as asserted — the helper is sound, not vacuous.**

And it has teeth in practice: all three plausible mis-implementations of the export contract are
caught by `npx tsc --noEmit`, which `.tdd-swarm/run-local-gates.sh:20` runs, with
`"include": ["src/**/*", "__tests__/**/*"]` covering the test file (see the mutation table).
The `@ts-expect-error` at `:970` correctly _fails_ (TS2578 "unused directive") the moment
`ExprErrorCode` becomes a value export. Nothing to fix here.

---

## 4. Behaviour vs implementation detail — CLEAN

Nothing in this file asserts an AST shape, a token stream, an internal function name, an error
_position_, or a recovery strategy. Recursive-descent, Pratt/precedence-climbing, and a
shunting-yard implementation all pass identically — I confirmed with the recursive-descent
reference and with a second, structurally different implementation (`scratchpad/ac1`, a
validate-then-emit design). Error _messages_ are constrained only where the ticket constrains
them (AC-9's "names `z`"). One borderline item is noted as **M5**.

---

# Critical

## C1. AC-1 does not prevent dynamic code construction, and neither does the ESLint rule the ticket calls "authoritative"

**Where:** `expr.test.ts:63` (`BANNED_SUBSTRINGS`), `:71-76` (the scan), and
`tickets/T-002.md:76-85` (AC-1's own claim about ESLint).

**Measured evidence.** I wrote a complete, otherwise-correct evaluator that validates the declared
grammar and then **compiles each expression to JavaScript source and executes it**, obtaining the
`Function` constructor as:

```ts
const CTOR: any = Object.getPrototypeOf(function () {}).constructor; // === Function
const build = (params: string, body: string): any => Reflect.construct(CTOR, [params, body]);
…
fn = build('__e,__f,__z', `return (${js});`);   // dynamic code construction
```

Results against the frozen suite and both gates:

```
npx vitest run   →  Tests  229 passed (229)
npx tsc --noEmit →  exit 0
npx eslint src/engine/questions/expr.ts → exit 0     (no-eval, no-implied-eval, no-new-func all silent)
```

**The scan is defeated because the source text contains none of the six substrings** — verified by
`grep -c -F` returning `0` for each of `eval(`, `new Function`, `Function(`, `setTimeout`,
`setInterval`, `import(`.

**And AC-1's fallback claim is factually wrong.** AC-1 (`tickets/T-002.md:79-81`) says "The
authoritative guard is ESLint, which matches identifier _references_ rather than text." I probed
that directly, L-001 style, with a synthetic file containing eight spellings under
`src/engine/**` and the repo's real `eslint.config.js`:

```
1:42  error  eval can be harmful               no-eval          ← eval(s)
2:42  error  The Function constructor is eval  no-new-func      ← new Function(s)
3:42  error  The Function constructor is eval  no-new-func      ← Function(s)
(nothing)                                                       ← setTimeout(stringVar, 0)
(nothing)                                                       ← const F = Function; F(s)
(nothing)                                                       ← Reflect.construct(Function, [s])
(nothing)                                                       ← globalThis['ev'+'al'](s)
(nothing)                                                       ← Object.getPrototypeOf(function(){}).constructor(s)
```

**3 of 8 caught.** `no-eval` matches the _binding named_ `eval`, and `no-new-func` matches the
_binding named_ `Function`; neither follows an alias, a computed member access, or reflection. The
rules are correctly wired (they do fire) — they are just not sufficient, and the ticket asserts a
property they do not have.

**Why this is Critical and not academic.** This module's stated first purpose (`tickets/T-002.md:34-36`)
is that it "must not be `eval()`, `new Function()`, or any dynamic code construction" in a
child-facing app. It is one of two catastrophe classes for the ticket. An implementer under time
pressure who reaches for codegen — or a future contributor who "optimises" the evaluator into a
compile-and-cache design — gets a fully green suite, green lint, green typecheck, and a shipped
code-injection surface. Freezing a guard that has never been observed blocking the thing it names
is L-001 and L-007 in one.

**Fix — replace the substring scan with a behavioural trap (keep the scan as belt-and-braces).**
Poison every route to dynamic compilation _before_ the module is imported, so a reference cached
at module-init time is caught too. Verified working: this file **passes** against the honest
parser reference and **fails** against the `Reflect.construct` implementation above.

```ts
describe('AC-1 — the evaluator constructs no code, at import time or at call time', () => {
  const realFn = globalThis.Function;
  const realEval = globalThis.eval;
  const realConstruct = Reflect.construct;
  const protoCtor = Object.getOwnPropertyDescriptor(realFn.prototype, 'constructor')!;
  let tripped: string[] = [];

  beforeEach(() => {
    tripped = [];
    const trap =
      (what: string) =>
      (...args: unknown[]) => {
        tripped.push(what);
        void args;
        return () => 0;
      };
    // @ts-expect-error deliberate poisoning
    globalThis.Function = trap('Function');
    // @ts-expect-error deliberate poisoning
    globalThis.eval = trap('eval');
    // @ts-expect-error deliberate poisoning
    Reflect.construct = (...a: unknown[]) => {
      if (a[0] === realFn) tripped.push('Reflect.construct(Function)');
      // @ts-expect-error passthrough
      return realConstruct(...a);
    };
    Object.defineProperty(realFn.prototype, 'constructor', {
      configurable: true,
      get() {
        tripped.push('Function.prototype.constructor');
        return trap('fn.constructor');
      },
    });
  });

  afterEach(() => {
    globalThis.Function = realFn;
    globalThis.eval = realEval;
    Reflect.construct = realConstruct;
    Object.defineProperty(realFn.prototype, 'constructor', protoCtor);
  });

  it('spec(T-002:AC-1) no dynamic-compilation route is reached', async () => {
    vi.resetModules();
    const mod = await import('@engine/questions/expr');
    expect(mod.evaluateNumber('a + b * c', { a: 2, b: 3, c: 4 })).toBe(14);
    expect(mod.evaluatePredicate('a > 0 && b > 0 || a == 0', { a: 0, b: 0 })).toBe(true);
    expect(tripped).toEqual([]);
  });
});
```

This closes every route I could construct, because obtaining the `Function` constructor requires
either the global binding, `<anyFunction>.constructor` (i.e. `Function.prototype.constructor`),
`Reflect` over one of those, or `eval` — all four are trapped. Recommend also correcting
`tickets/T-002.md:79-81`, which currently tells downstream readers the ESLint rules are
authoritative when they are not.

---

# Important

## I1. The function whitelist is not closed — a `Math[name]`-resolving evaluator passes 229/229

**Where:** `expr.test.ts:501-554` (AC-10 negatives) and `:239-295` (AC-5 positives).

**What is wrong.** The ticket declares the whitelist "exactly these: `abs`, `min`, `max`, `floor`,
`ceil`, `gcd`" (`tickets/T-002.md:58-59`), and the grammar is declared complete. The suite proves
those six work and rejects five _non-function_ names — `foo`, `constructor`, `Math`, `ABS`, `a`.
Every one of those is chosen so that it is **not an own property of `Math`**. An implementation
that resolves calls as `Object.prototype.hasOwnProperty.call(Math, name) ? Math[name] : …`
satisfies all thirteen AC-10 tests.

**Confirmed by mutation** (`scratchpad/mathproxy`):

```
Tests  229 passed (229)      tsc --noEmit: exit 0
```

with these silently reachable:

```
sqrt(a)=3   round(a/b)=4   pow(a,b)=1024   sign(a)=-1   trunc(a/b)=3
log(a)=0    hypot(a,b)=5   atan2(a,b)=0.785…   cbrt(a)=2   imul(a,b)=12
```

**The cheat this permits.** The whitelist is one half of the contract this module exists to
enforce. Silently widening it means (a) T-014/T-015/T-016 template authors, two waves later, can
write `round(a / b)` or `sqrt(a)` in an `answerExpr`, it will work, and the contract will have
drifted with nothing recording it; (b) `pow`, `log`, `cbrt`, `atan2` produce irrational values in
a K-5 math game — an "answer" no child can tap; (c) resolving names reflectively over a built-in
global is precisely the posture this module is supposed to reject. This is L-009 restated: a
criterion listing only _accept_ cases is satisfied by an evaluator that accepts everything.

**Fix.** Add to `describe('AC-10 …')`:

```ts
for (const name of ['sqrt', 'round', 'pow', 'sign', 'trunc', 'log', 'hypot', 'cbrt', 'random']) {
  it(`spec(T-002:AC-10) ${name} is not on the whitelist`, () => {
    expectNumberError(`${name}(a, b)`, { a: 4, b: 2 }, 'UNKNOWN_FUNCTION');
    expectNumberError(`${name}(a)`, { a: 4 }, 'UNKNOWN_FUNCTION');
  });
}
```

(Both arities, so a length-based arity check cannot convert the failure into `ARITY_MISMATCH`.)

## I2. `&&` / `||` short-circuit behaviour is unspecified and untested — both conventions pass

**Where:** `expr.test.ts:391-439` (the whole AC-8 block); ticket AC-8 (`tickets/T-002.md:103-104`)
pins only relative precedence.

**Measured evidence.** I ran the identical reference with eager and short-circuit `&&`/`||`:

```
eager        Tests  229 passed (229)
short-circuit Tests  229 passed (229)
```

They disagree on the most natural divide-by-zero guard a template author can write:

| expression, `{ a: 5, b: 0 }` | eager                         | short-circuit |
| ---------------------------- | ----------------------------- | ------------- |
| `b == 0 \|\| a % b == 0`     | **throws `DIVISION_BY_ZERO`** | `true`        |
| `b != 0 && a % b == 0`       | **throws `DIVISION_BY_ZERO`** | `false`       |

**Why it matters.** This is exactly the L-010 pattern the ticket already applied three times
(AC-16, AC-17, AC-18): two defensible conventions, both sides "know" the answer, and each side's
tests agree with its own reading. The downstream cost is concrete — T-007's generator
rejection-samples parameters and calls `evaluatePredicate` per candidate. Under eager evaluation a
guarded constraint **throws** on a candidate it was written to reject, turning an ordinary
rejection into a crash in the question generator, against a module frozen two waves earlier with
no fix path. `src/engine/questions/expr.ts` is in no downstream ticket's `file_scopes`.

**Fix.** Adopt the host language's semantics per L-010 — `&&`/`||` short-circuit — state it as a
new AC, and add:

```ts
it('spec(T-002:AC-8) || does not evaluate its right operand when the left is true', () => {
  expect(evaluatePredicate('b == 0 || a % b == 0', { a: 5, b: 0 })).toBe(true);
});
it('spec(T-002:AC-8) && does not evaluate its right operand when the left is false', () => {
  expect(evaluatePredicate('b != 0 && a % b == 0', { a: 5, b: 0 })).toBe(false);
});
it('spec(T-002:AC-8) a short-circuited operand is still type-checked', () => {
  expectPredicateError('b == 0 || a', { a: 5, b: 0 }, 'TYPE_MISMATCH');
});
```

The third test matters: it forces the implementation to validate types statically rather than
letting short-circuiting hide a type error, which keeps AC-13 honest.

---

# Minor

## M1. Out-of-grammar _numeric literal_ forms are untested

**Where:** `expr.test.ts:574-601` (`OUT_OF_GRAMMAR`). The list is genuinely good — 25 entries
covering `a.b`, `a; b`, `1.2.3`, `.5`, `1.`, `"a"`, backticks, `a?b:b`, `a < b < c`, `- -a`,
`require('fs')`, `globalThis['eval']` — but every numeric entry is about the _decimal point_.
`NUMBER := digits ( "." digits )?` also excludes exponents, hex, and separators.

**Measured:** a tokenizer using a greedy `Number()`-friendly regex passes **229/229**, silently
accepting `1e3 = 1000` and `0x10 = 16`. Cheap fix — add `'1e3'`, `'0x10'`, `'1_000'`, `'0b11'` to
the `OUT_OF_GRAMMAR` array at `:574`.

## M2. `==` / `!=` are not pinned as exact comparisons

**Where:** `expr.test.ts:350-369` (table) and `:378` (`a / b == 3.5`). All `==` cases compare
values that are either identical or differ by ≥ 1. **Measured:** an implementation using
`Math.abs(l - r) < 0.4` for `==` passes **229/229**. A tolerance-based `==` would let a
divisibility-style constraint admit a near-miss. Fix — one line:
`expect(evaluatePredicate('a / b == 3', { a: 7, b: 2 })).toBe(false);` plus the `!=` twin.

## M3. Error precedence between two simultaneous failures is unpinned

`foo(z)` (unknown function _and_ unknown identifier), `min(z)` (arity _and_ unknown identifier),
and `z / 0` (unknown identifier _and_ division by zero) each have two defensible codes and no
test. My reference returns `UNKNOWN_FUNCTION`, `ARITY_MISMATCH`, `UNKNOWN_IDENTIFIER`
respectively; a different-but-reasonable implementation returns the other code in each case.
Harmless today, but if T-005/T-007 ever branch on `err.code` this becomes a silent behaviour
change. Worth one test per pair, or an explicit "unspecified" note in the ticket.

## M4. The DoD's "never returns `Infinity`" is untested for overflow

`expr.test.ts:663-668` sweeps for finiteness only over `{ a: 7, b: 2 }`. `evaluateNumber('a * b',
{ a: 1e308, b: 1e308 })` returns `Infinity` on my reference and passes. Unreachable from realistic
`params` ranges, so genuinely minor — but the DoD (`tickets/T-002.md:166-167`) states it flatly.

## M5. `Object.getPrototypeOf(ExprError.prototype)).toBe(Error.prototype)` is slightly over-tight

`expr.test.ts:982` forbids any intermediate class in the hierarchy. AC-19 says "a runtime class
extending `Error`", so a `class ExprError extends BaseEngineError extends Error` would satisfy the
AC and fail the test. Note-only — direct extension is the obvious reading and no other ticket
introduces a base error class. `expect(new ExprError(...)).toBeInstanceOf(Error)` would be the
looser equivalent.

---

## 5. Coverage in the other direction — nothing asserted that no criterion asks for

I looked specifically for invented requirements. There are none of consequence. Everything beyond
literal AC text is a defensible extension of a declared clause:

- the 25 `OUT_OF_GRAMMAR` strings (`:574-601`) encode "Grammar (complete — reject anything outside
  it)" (`tickets/T-002.md:42`) — a criterion that would otherwise have zero enforcement;
- the prototype-chain identifiers `constructor` / `toString` / `hasOwnProperty` / `__proto__`
  (`:464-478`) are AC-9 applied at its degenerate inputs (L-010) and force an own-property lookup;
- env non-mutation (`:778-788`) is AC-14's "pure" made observable;
- the `foo`-named message assertion (`:506`) goes one clause beyond AC-10, mirroring AC-9's
  message requirement. Harmless.

Nothing in the file would be violated by a valid alternative parser, and nothing constrains the
export surface beyond what the DoD lists.

---

## Verdict

**DO NOT FREEZE.**

What is genuinely clean, stated plainly: **criterion coverage (all 20, including all five new
ones), arithmetic correctness (98 expected values independently re-derived, zero wrong), operator
precedence and associativity, real vs truncating division, JS remainder semantics, gcd degenerates,
the depth window `[16,199]`, the zero-arity/arity split, error-code discrimination, AC-19's
type-level assertions and the `Exact<>` helper, and freedom from implementation-detail
over-constraint.** That is most of the file, and it is well built.

The blocker is C1: the suite's own AC-1 — the criterion protecting the "unsafe evaluation"
catastrophe class — passes against an implementation that compiles and executes generated code,
as does ESLint, which the ticket wrongly names as the authoritative guard. I1 and I2 are the two
places where the closed grammar / whitelist contract is not actually closed. All three fixes are
additive and were validated against both a correct reference and the corresponding cheat.

The sandbox was created outside the repository and has been deleted (L-011).
