# T-002 Security Review — `src/engine/questions/expr.ts`

Reviewed at `/Users/quietguy/Documents/Dev/Gauntlet/cannon-wt/wt-T-002`.
Diff inspected: `git diff swarm/engine-core..HEAD -- src/` — a single new file, 657 lines,
zero imports. Full source read line-by-line; every claim below is backed by either a
source citation or an actual probe run through vitest against the real module (not a
reasoned-about argument).

## 1. Dynamic code construction — CLEAN (no findings)

Grepped the file for every spelling named in the brief: `eval`, `Function`, `Reflect`,
`getPrototypeOf`, `setTimeout`, `setInterval`, `import(`, `require(`, `WebAssembly`,
`Proxy`, `globalThis`, `window[`, `self[`, `with`, tagged templates. The only hits are:
the class constructors `ExprError.constructor` (L56) and `Parser.constructor` (L199)
— ordinary OOP syntax — and two comments discussing the *risk* of a `constructor`
property (L410-413, L568-570), not a use of one.

The module has **zero imports** and never references `Function`, `eval`, `Reflect`, or
any global object. There is no aliasing surface (`const F = Function`) because there is
no binding to alias in the first place, and no computed member access into a host
object exists anywhere in the file. This is structurally incapable of codegen, not
merely abstaining today — there is no object in scope through which a `constructor`
chain could be walked to reach `Function`. Verified with a live probe (see §2) that a
bare `constructor` identifier, `constructor(1)` call, and an explicit `env.constructor`
entry all resolve through `Object.hasOwn`/`Map.get` as ordinary values, never as a
property-chain hop.

## 2. Property access on caller-controlled keys — CLEAN (no findings)

Both passes were checked, per the brief's explicit warning that a guard in one is not
a guard in the other:

- **Static pass** (`checkNode`, L473-515): identifier case uses `Object.hasOwn(env,
  node.name)` (L479) before anything else.
- **Eval pass** (`readIdentifier`, L521-527): also uses `Object.hasOwn(env, name)`
  (L523), and additionally rejects if the value is `undefined`.
- **Function resolution** (`resolveWhitelistedCall`, L425-440): backed by a `Map`
  (L415), not an object literal — `Map.get` has no prototype-chain fallback, so
  `constructor`, `toString`, `__proto__`, `hasOwnProperty` etc. are not resolvable as
  function names by construction, not by a name-blocklist.

Ran a live probe (`evaluateNumber`/`evaluatePredicate` against real inputs, then
deleted the probe file — not part of the frozen suite):

| input | result |
|---|---|
| `__proto__` (empty env) | `ExprError UNKNOWN_IDENTIFIER` |
| `constructor` (empty env) | `ExprError UNKNOWN_IDENTIFIER` |
| `toString` (empty env) | `ExprError UNKNOWN_IDENTIFIER` |
| `hasOwnProperty` (empty env) | `ExprError UNKNOWN_IDENTIFIER` |
| `constructor(1)` | `ExprError UNKNOWN_FUNCTION` |
| `toString()` / `valueOf()` | `ExprError PARSE_ERROR` (zero-arg call is a grammar violation before name resolution, per AC-18) |
| `constructor` identifier, with `env = { constructor: 7 }` | `7` — correctly treated as an ordinary own-keyed parameter, no unsafe exposure |
| `__proto__ == 0` as a predicate | `ExprError UNKNOWN_IDENTIFIER` |

No route from a content-string identifier or function name to `Object.prototype` or
any host constructor exists in either pass.

## 3. Denial of service — Important finding (confirmed by live probe)

**The `MAX_NESTING_DEPTH = 64` guard (L188, enforced in `enterNesting`, L257-268) only
counts parenthesised groups and call argument lists. It does not count chained binary
operators written without parentheses**, and `parseSum`/`parseProduct`/`parseOr`/
`parseAnd` (L270-322) build those chains with plain iterative loops — so parsing itself
never recurses and never trips the limit, however long the chain.

The resulting AST, however, is a left-deep chain of `binary` nodes whose depth equals
the operator count. Both `checkNode` (L473-515, the static pass — runs *first*, before
any value is computed) and `computeNumber`/`computeBoolean` (L572-597, L619-632, the
eval pass) walk that tree with plain **native recursion** on `node.left`. Recursion
depth is therefore unbounded by anything the parser tracks.

**Reproduced live** (vitest, against the real `evaluateNumber`/`evaluatePredicate`,
probe file created and deleted, not left in the tree):

```
source = '1' + '+1'.repeat(N)      // no parens anywhere, plain chain
N =   500 → OK
N =  1000 → OK
N =  5000 → OK
N =  8000 → OK
N = 10000 → CRASH: RangeError: Maximum call stack size exceeded
N = 100000 → CRASH: RangeError: Maximum call stack size exceeded  (uncaught, not ExprError)
N = 1000000 → CRASH: RangeError: Maximum call stack size exceeded
```

Same result for an unparenthesized `&&` chain (`evaluatePredicate`, `'1==1'` repeated
and joined with `&&`) and for a comparison over a long `+` chain
(`'1' + '+1'.repeat(N) + '==' + N`). The crash is an **uncaught `RangeError`**, not an
`ExprError` — it bypasses the module's own contract ("Every failure path in this module
throws one of these", L52) and would propagate as an unhandled exception to whatever
calls `evaluateNumber`/`evaluatePredicate` (T-007's rejection-sampling loop), rather
than being rejected as malformed content.

The trigger is a ~16–20 KB expression string (roughly 10,000 repetitions of `+1`) —
large for a hand-authored template, but trivially producible by a buggy or malicious
content-generation step, and well within what a string field in a JSON/YAML catalog
entry can hold. This is exactly the bypass shape the ticket's own comment on
`MAX_NESTING_DEPTH` warns about ("a shape it does not count, such as deep call nesting
or a long unary chain") — confirmed real for long *binary/logical* chains specifically.

Everything else checked clean on this axis: the tokenizer has no regexes at all (hand-rolled
character-class checks only, so no catastrophic backtracking is possible), tokenizing
and parsing are both single-pass and O(n) (verified: the 1,000,000-term case tokenized
and parsed in under 200ms total, before crashing only in the recursive check/eval walk),
and repeated-minus unary chains (`- - - -a`) cannot be constructed at all — the grammar
only accepts one leading `-` and `parseUnary` calls `parsePrimary` (not itself) for the
operand, so a second `-` is an immediate `PARSE_ERROR` rather than a recursion vector.

**Fix:** bound something that scales with *all* shapes, not just explicit nesting. The
minimal, surgical fix: cap total token count in `tokenize()` (e.g. reject with
`PARSE_ERROR` above ~300–500 tokens) — since content-catalog expressions
(`constraints`, `answerExpr`, distractors) are short by design, this costs nothing on
real content and uniformly bounds AST depth/size regardless of whether the depth comes
from parens, calls, or bare operator chains. Belt-and-suspenders: if a stronger
guarantee is wanted independent of any cap, convert `checkNode`/`computeNumber`/
`computeBoolean` to an explicit-stack (iterative) walk so recursion depth is decoupled
from input size entirely.

## 4. Numeric integrity — Important finding (confirmed by live probe)

The module's own header claims (L52 `ExprError` doc comment: "never `NaN`, `Infinity`
or `null`"; L646 `evaluateNumber` doc comment: "never returns `NaN` or `Infinity`") are
**not enforced** for two paths:

1. **Arithmetic overflow.** `applyArithmetic` (L529-548) only guards `/` and `%`
   against a zero divisor. `+`, `-`, `*` have no finiteness check on their result.
2. **Identifiers read straight from `env`.** `readIdentifier` (L521-527) returns
   whatever numeric value is stored in the environment, with no `Number.isFinite`
   check — only an "is it present" check (`Object.hasOwn` + `!== undefined`). A `NaN`
   or `Infinity` already present in the sampled parameter environment (e.g. from an
   upstream sampler bug in T-007) passes straight through as a "valid" number.

Live probe results (real module, not reasoned about):

| expression | env | result |
|---|---|---|
| `a*a` | `{a: 1e200}` | `Infinity` (no throw) |
| `a+a` | `{a: Number.MAX_VALUE}` | `Infinity` (no throw) |
| `a` | `{a: NaN}` | `NaN` (no throw) |
| `a` | `{a: Infinity}` | `Infinity` (no throw) |
| `a > 0` | `{a: Infinity}` | `true` (no throw — a constraint or the answer-check could silently accept a degenerate sample) |
| `a/b` | `{a:0, b:0}` | `ExprError DIVISION_BY_ZERO` — correct, division-by-zero path is guarded |
| `1/a` | `{a: -0}` | `ExprError DIVISION_BY_ZERO` — correct |

Reachability caveat, stated plainly: for a K-5 arithmetic game, legitimate sampled
parameters are small (single/double-digit), so hitting `Infinity` via `*`/`+` overflow
through *ordinary* content is unlikely — it takes deliberately extreme values. The `NaN`/
`Infinity`-via-`env` path is more realistic as a **defense-in-depth gap**: if any
upstream code (a sampler, a future template feature) ever computes a degenerate value
and hands it to this evaluator, this module — the one place in the codebase that is
supposed to make "never NaN/Infinity" an enforced property — will pass it straight
through into an answer or a constraint check instead of catching it. Given the
project's stated catastrophe class is "wrong math shown to a child," and this module is
the documented enforcement point for that invariant, the gap between the doc comment
and the actual behavior is worth closing.

**Fix:** add an explicit `Number.isFinite` check at the two production points and throw
a typed `ExprError` instead of returning the value silently:
- in `readIdentifier` (L521-527), after reading `value` from `env`;
- in `applyArithmetic` (L529-548) (or once, centrally, wrapping `computeNumber`'s
  return in L572-597) after computing the arithmetic result.

Either reuse `TYPE_MISMATCH` or add a dedicated `ExprErrorCode` (e.g.
`NUMERIC_OVERFLOW`) — the latter is cleaner since it is not actually a type error, and
gives callers a distinguishable code to log/report on.

## 5. Secrets/PII, dependency risk — CLEAN (one line each, as expected)

- **Secrets/PII:** none — the file is a pure tokenizer/parser/evaluator over numbers
  and content-catalog strings; no credentials, tokens, user data, or logging of raw
  input beyond position-indexed parse-error messages.
- **Dependency risk:** none — confirmed zero `import` statements in the file (grepped);
  the module has no dependency surface at all.

## Not applicable to this layer

SQL injection, XSS, CSRF, authz, SSRF, and network deserialization do not apply — there
is no server, no network boundary, and no remote input reachable from this module.

## Summary

| # | Area | Finding | Severity |
|---|---|---|---|
| 1 | Dynamic code construction | None — structurally incapable, verified by source read + probe | — |
| 2 | Caller-controlled property access | None — `Object.hasOwn` / `Map` used consistently on both passes, verified by probe | — |
| 3 | Denial of service | Unparenthesized binary/logical operator chains bypass `MAX_NESTING_DEPTH` and crash with an uncaught `RangeError` (stack overflow) around ~10,000 chained terms, in both the static-check and eval walks | **Important** |
| 4 | Numeric integrity | `NaN`/`Infinity` can escape via unchecked `+`/`-`/`*` overflow and via unchecked raw `env` values, contradicting the module's own documented "never NaN/Infinity" contract | **Important** |
| 5 | Secrets/PII, dependency risk | Clean | — |

Both findings are real and reproduced live, not hypothetical, but neither breaches the
ticket's primary invariant (no code construction/execution — confirmed clean by direct
source inspection, not just absence of banned substrings), and neither is a Critical
blocker under this ticket's own severity rubric. Both should be fixed — recommend
filing them as follow-up hardening work before this evaluator is exposed to
less-trusted or auto-generated content catalogs — but they do not block T-002.

**T-002: PASS**
