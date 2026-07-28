# T-002 — Code Review

**Reviewer:** independent senior review (did not write this code)
**Ticket:** `tickets/T-002.md` — Safe arithmetic expression and constraint predicate evaluator
**Implementation:** `/Users/quietguy/Documents/Dev/Gauntlet/cannon-wt/wt-T-002/src/engine/questions/expr.ts` (656 lines)
**Commit:** `a16b864`
**Frozen tests:** `__tests__/engine/questions/expr.test.ts` — 296 tests, immutable, not touched
**Date:** 2026-07-28

---

## Verdict summary

| Dimension | Result |
| --- | --- |
| **1. Spec compliance** | 24/24 ACs met. **1 DoD item NOT MET.** No Iron Law violation. |
| **2. Code quality** | **1 Critical, 2 Important, 4 Minor.** |
| **Overall** | **CHANGES REQUIRED** |

Ground truth accepted as given and not re-derived: local gates green, 297/297, spec-lint 24/24, zero
test files touched, independent codegen-poisoning probe clean, and the listed arithmetic spot checks.

Everything below is what passing 296 tests does not prove. The three real defects all live on axes
neither the frozen suite nor the implementer's two probes varied: **expression length**, **numeric
literal magnitude**, and **the environment's value domain**.

---

# Part 1 — SPEC COMPLIANCE

## Acceptance criteria

| AC | Result | Evidence |
| --- | --- | --- |
| **AC-1** — no banned substrings | **MET** | Scanned `expr.ts` for `eval(`, `new Function`, `Function(`, `setTimeout`, `setInterval`, `import(`: zero matches. The only `constructor` occurrences are the class constructor declarations at `expr.ts:56` and `expr.ts:199` and a doc comment at `:413` — none is a `Function(` match. |
| **AC-21** — no dynamic-code route reached (authoritative) | **MET** | Behavioural ground truth accepted. Structurally corroborated: no `Reflect`, no `globalThis`, no `.constructor` read, no computed property access on any built-in anywhere in the file. Calls resolve only through `WHITELISTED_FUNCTIONS.get(name)` (`:426`); `Math.*` appears only as five static references inside the six literal map entries (`:416-421`). Environment lookup is `Object.hasOwn` (`:479`, `:523`), so `constructor`/`toString`/`__proto__` are `UNKNOWN_IDENTIFIER` (verified). Import-time side effects are one class, three frozen arrays and one `Map`. |
| **AC-2** — precedence, parens | **MET** | Descent order `parseOr:270 → parseAnd:281 → parseCompare:293 → parseSum:302 → parseProduct:313 → parseUnary:325 → parsePrimary:334`. Parens re-enter at `:353-358`. |
| **AC-3** — `- * / % unary-` | **MET** | `applyArithmetic:529-548`; real division at `:541`; unary negate `parseUnary:325-332` + `computeNumber:580-581`. |
| **AC-4** — left associativity | **MET** | Read from the descent structure, not the tests: `parseSum:303-310` and `parseProduct:314-321` both fold with `left = { …, left, right: parseX() }` inside a `for(;;)` loop. That is left-associative by construction for `-`, `/` and `%`. Same shape for `parseOr:271-278` and `parseAnd:282-289`. |
| **AC-5** — whitelisted calls | **MET** | `WHITELISTED_FUNCTIONS:415-422`; `greatestCommonDivisor:398-407`. |
| **AC-6** — predicates | **MET** | `parseCompare:293-300`, `applyComparison:550-565`, `evaluatePredicate:652-656`. |
| **AC-7** — six comparisons | **MET** | `applyComparison:551-564` — `===`/`!==` on numbers, correct. |
| **AC-8** — `&&` tighter than `\|\|` | **MET** | `parseOr:270` delegates to `parseAnd:281`, so `\|\|` is the outer production. Verified by reading the descent, not the assertion. |
| **AC-9** — `UNKNOWN_IDENTIFIER` naming the identifier | **MET** | `checkNode:478-482` + `unknownIdentifier:464-466`. |
| **AC-10** — `UNKNOWN_FUNCTION` / `ARITY_MISMATCH` | **MET** | `resolveWhitelistedCall:425-440` — name resolved at `:426` **before** arity at `:433`, which is why `sqrt(a,b)` is `UNKNOWN_FUNCTION` not `ARITY_MISMATCH` (verified). |
| **AC-11** — malformed input | **MET** | All six named inputs verified `PARSE_ERROR`, plus `+a`, `a!b`, `a---b`, `abs(a,)`. |
| **AC-12** — `DIVISION_BY_ZERO` | **MET** | `:538-540`, `:543-545`. `right === 0` is true for `-0`, so `a % (b - c)` with `b === c` is covered (verified). |
| **AC-13** — `TYPE_MISMATCH` both directions | **MET** | `requireType:458-462` invoked at the two public entry points `:644` and `:654`. |
| **AC-14** — purity | **MET** | No module-level mutable state. `parse:386` constructs a fresh `Parser` per call; `Node` is fully `readonly`; nothing is cached (correctly — caching is Out of Scope). Purity is structural, not asserted. |
| **AC-15** — depth limit, not stack overflow | **MET as worded** | `MAX_NESTING_DEPTH = 64` (`:188`), checked on entry (`enterNesting:257-268`). Verified paren depth 65 / 200 / 5,000 → `PARSE_ERROR`. **But see F-2:** the property AC-15 *names* ("rather than overflowing the stack") does not hold for a shape AC-15 does not describe. The AC is literally satisfied; the invariant is not. |
| **AC-16** — JS remainder sign | **MET** | `:546`. Verified `-7 % 2 = -1`, `7 % -2 = 1`. |
| **AC-17** — `gcd` on absolute values, `gcd(0,0)=0` | **MET for the pinned cases** | `:398-407`. Verified `gcd(-12,18)=6`, `gcd(12,-18)=6`, `gcd(0,5)=5`, `gcd(0,0)=0`. **See F-1** for the unpinned case the AC's own rationale anticipated and did not close. |
| **AC-18** — `abs()` is `PARSE_ERROR` | **MET** | `parseArguments:371-382` demands one `expr` before any `,`. Verified for `abs()` and `abs(   )`. |
| **AC-19** — type-only code union, runtime class | **MET** | `export type ExprErrorCode:44-50`; `export class ExprError extends Error:53-61` with `readonly code:54`. |
| **AC-20** — 16 levels evaluate | **MET** | Limit is 64; verified 16 and 64 both evaluate. |
| **AC-22** — closed whitelist vs `Math` own-properties | **MET** | The `Map` at `:415-422` is the *only* resolution path (`:426`). No name is ever used as a property key on a built-in, so the `Math[name]` cheat class is structurally impossible, not merely untested. Verified `sqrt`, `round`, `pow`, `log`, `cbrt`, `atan2` → `UNKNOWN_FUNCTION` at both arities. |
| **AC-23** — short-circuit + static typing | **MET** | `computeBoolean:619-632` short-circuits at `:622` and `:625`; `checkNode:496-513` types **both** operands before any value exists. Verified all three ticket cases. |
| **AC-24** — every identifier resolves statically | **MET** | `checkNode:478-482` runs over the whole tree from `:644`/`:654` before `computeNumber`/`computeBoolean` is entered. Verified. **See F-4** for one shape where the split leaks. |

**24/24 met.**

## Definition of Done

| DoD item | Result | Evidence |
| --- | --- | --- |
| Every AC has a passing test tagged `spec(T-002:AC-n)` | **MET** | All 24 tags present; counts range 2–15 per AC; spec-lint 24/24. |
| `run-local-gates.sh` green | **MET** | Ground truth. |
| `spec-lint.sh` green | **MET** | Ground truth. |
| No dynamic code construction anywhere | **MET** | AC-1 + AC-21 above. |
| **Every failure path throws a typed `ExprError` with a `code` field — never returns `NaN`, `Infinity`, `null`, or `undefined`** | **NOT MET** | Two independent violations, both reachable through the public API from in-grammar input: (a) `evaluateNumber` **returns** `Infinity` and `NaN` — **F-3**; (b) a **`RangeError`**, not an `ExprError`, escapes `evaluateNumber` — **F-2**. |
| Exports: `evaluateNumber`, `evaluatePredicate`, `ExprError`, `ExprErrorCode` | **MET** | `:642`, `:652`, `:53`, `:44`. Exactly these four; `Environment` (`:64`) is deliberately internal, which is correct — exporting it would be beyond the DoD. |
| Files changed are exactly those in `file_scopes` | **MET** | `git diff swarm/engine-core...HEAD --name-status` (three-dot, merge-base `db7121c`) returns exactly `A src/engine/questions/expr.ts` and `A __tests__/engine/questions/expr.test.ts`. The implementation commit `a16b864` in isolation touches **only** `src/engine/questions/expr.ts`. (The two-dot range in the review brief also lists `LESSONS.md`, `TICKETS.md` and four ticket files — those are base-branch drift, not branch changes. Verified.) |

**6/7 met. One NOT MET.**

## Iron Law — anything built that the ticket did not ask for

Nothing material. The module is 656 lines for a ticket that needs a tokeniser, a parser, a checker
and a walker, with no speculative extension: no caching or memoisation (correctly deferred per
*Out of Scope*), no configuration surface, no extra exports, no unused helpers, no template or
distractor logic bleeding in from T-005/T-007.

One item is genuinely beyond the ACs' letter and is called out honestly by the implementer:
**function resolution and arity checking are performed statically** (`checkNode:489`), so
`b == 0 || min(a) > 0` throws `ARITY_MISMATCH` even though that branch never runs. AC-24 mandates
static *identifier* resolution and AC-23 mandates static *type* checking; neither mandates static
*arity*. I rule this **consistent, not an over-reach** — see Ruling 2 below. It is unpinned
behaviour rather than unrequested behaviour, so it is not an Iron Law violation, but it should be
pinned.

---

# Part 2 — CODE QUALITY

## F-1 — `gcd` never terminates on a non-finite argument · **CRITICAL**

`src/engine/questions/expr.ts:398-407`

```ts
function greatestCommonDivisor(x: number, y: number): number {
  let left = Math.abs(x);
  let right = Math.abs(y);
  while (right !== 0) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }
  return left;
}
```

`(NaN, NaN)` is a **fixed point** of this loop: `NaN !== 0` is `true` forever and `NaN % NaN` is
`NaN`. Any non-finite argument reaches it in two iterations — `Infinity % 2` is `NaN`, then
`2 % NaN` is `NaN`, then the state never changes again.

Reached through the public API, measured in a worker thread with an 8-second kill:

| Call | Result |
| --- | --- |
| `evaluateNumber("gcd(" + "9".repeat(400) + ", 2)", {})` — **literal only, empty environment** | **HUNG** — terminated after 8s |
| `evaluateNumber("gcd(a, b)", { a: Infinity, b: 2 })` | **HUNG** — terminated after 8s |
| `evaluateNumber("gcd(a, b)", { a: NaN, b: 5 })` | **HUNG** — terminated after 8s |
| `evaluateNumber("gcd(a, b)", { a: 12, b: 18 })` — control | returned `6` |

Loop-state trace with an iteration cap, from an exact copy of `:398-407`: `left=NaN, right=NaN`
after 1,000 iterations for every non-finite input; `gcd(-12,18)` converges in 3, `gcd(0,0)` in 0,
`gcd(9…9 [300 digits], 7)` in 2.

**Why Critical.** Every other failure in this module throws something a caller can catch. This one
cannot be caught, cannot be logged, and cannot be recovered from. T-007 calls `evaluatePredicate`
per candidate inside a rejection-sampling loop; a single non-finite parameter meeting a `gcd`
constraint freezes the tab with no error, no stack trace and no rejection — the game simply stops.
It is a strictly worse outcome than the wrong-answer class the ticket was written to prevent,
because a wrong answer is at least observable.

The ticket anticipated this class and closed only half of it. AC-17's own rationale reads: *"zero
and negative arguments are reachable from constraint expressions and would otherwise be
implementation-defined **or hang**."* Zero and negative were pinned; non-finite was not, and it is
the case that actually hangs.

**Fix.** A finiteness guard. See F-3 for where it belongs — one check placed correctly makes both
defects unreachable.

## F-2 — a `RangeError` escapes the public API; the depth counter does not count operator chains · **IMPORTANT**

`src/engine/questions/expr.ts:188`, `:257-268`, `:355`, `:373`, `:473`, `:497`, `:572`

`MAX_NESTING_DEPTH` is incremented in exactly two places — the `(` branch of `parsePrimary` (`:355`)
and `parseArguments` (`:373`). Those are the only two recursion cycles in the *parser*, because the
binary productions fold **iteratively** (`parseSum:303-310`, `parseProduct:314-321`,
`parseOr:271-278`, `parseAnd:282-289`). Parsing `1+1+1+…` is therefore O(n) with zero depth
accounting — and correctly so.

But the tree it produces is **n levels deep**, and the two tree walks are recursive and ungated:
`checkNode:473` recurses at `:497`, `computeNumber:572` recurses at `:593`. Nothing bounds them.

Measured through the public API, bisected:

```
largest "1+1+...+1" chain that does NOT RangeError:  4561
first failing:                                        4562

RangeError: Maximum call stack size exceeded
    at checkNode (expr.ts:497)
    at checkNode (expr.ts:497)
    at checkNode (expr.ts:497)   ← ~4,500 frames
```

Reproduces identically with `*` chains and, through `evaluatePredicate`, with `||` chains
(`"a > 0 || a > 0 || …" ×10000` → `RangeError`). Paren depth 0 throughout — the counter never
sees it.

**This directly falsifies a measured claim in the implementation report.** Report §"Claims backed
by measurement" item 2 states depths *"65, 200, 1,000, 5,000 and 100,000 all throw
`ExprError`/`PARSE_ERROR`, never a `RangeError`"*. That bisection swept nested parentheses and
nested `abs(` calls — the two shapes the counter was designed for. It did not sweep chain length,
and chain length blows the stack at **4,562**, more than an order of magnitude *below* the 100,000
the probe reported clean. This is L-015 exactly: the reachability claim was measured, but only
over the shape the author had in mind.

The frozen suite is equally blind — all five AC-15 tests (`expr.test.ts:984-1015`) use
`'('.repeat(n)` or `'abs('.repeat(n)`, and the "not a `RangeError`" assertion at
`expr.test.ts:1009-1014` passes vacuously because its input is a paren nest.

AC-15 as literally worded is still met — a 4,562-term chain is not "nested more deeply than the
parser's depth limit", since it does not nest at all in the parser's counting. **The DoD item is
what breaks**: a non-`ExprError` reaches the caller.

**Fix.** One budget that governs total work rather than only group nesting. Cheapest: cap token
count (or source length) in `parse:385-387` before descending — a token cap of a few hundred is
far above any legitimate `answerExpr` and closes the shape permanently. Alternative: charge the
binary fold loops against the same counter. Whichever is chosen, it should be documented next to
`MAX_NESTING_DEPTH` so the two budgets are read together.

## F-3 — `evaluateNumber` returns `Infinity` and `NaN` from in-grammar input · **IMPORTANT**

`src/engine/questions/expr.ts:121-133` (tokeniser), `:529-548` (arithmetic)

`NUMBER := digits ( "." digits )?` puts **no bound on `digits`**, and the tokeniser faithfully
implements that: `while (isDigit(...)) index += 1` then `Number(source.slice(start, index))`
(`:123-132`). A 309-digit literal is a perfectly legal `NUMBER` whose value is `Infinity`.

Measured, **empty environment throughout**:

| Expression | Returns |
| --- | --- |
| `"9" × 308` | `1e+308` |
| `"9" × 309` | **`Infinity`** |
| `"9…9 - 9…9"` (400 digits each) | **`NaN`** |
| `"9…9 / 2"` | **`Infinity`** |
| `"9…9 % 7"` | **`NaN`** |
| `"floor(9…9)"` | **`Infinity`** |
| `"9…9 * 9…9"` (200 digits each) | **`Infinity`** |

The DoD states the invariant flatly and without qualification: *"never returns `NaN`, `Infinity`,
`null`, or `undefined`."* It is violated by input the grammar explicitly admits.

**This was raised before and dismissed on a false argument.** `T-002-test-design-review.md` §M4
flagged it, and closed it as *"unreachable from realistic `params` ranges, so genuinely minor"* —
using an environment-supplied example (`{ a: 1e308 }`). The literal route needs no `params` at
all, so the reachability argument does not hold, and leaving it open is what left F-1 live. Same
lesson, same ticket: **L-015**, *"finite weights can sum to `Infinity` by overflow."*

The frozen suite cannot catch this: the only finiteness sweep is `expr.test.ts:846-851`, seven
expressions over the single environment `{ a: 7, b: 2 }` — precisely as M4 described.

**Fix — and note the constraint on it.** `expr.test.ts:1130-1142` pins `ExprErrorCode` to
**exactly six codes** via an `Exact<>` type assertion, so a seventh code cannot be added without
an orchestrator ruling that reopens AC-19 and the frozen test. Two in-contract options:

1. **Reject the literal at tokenise time** — `if (!Number.isFinite(value)) throw PARSE_ERROR` at
   `:132`. Honest: a literal outside the representable domain is a lexical form the grammar cannot
   carry. This alone kills the entire literal route, including `gcd("9…9", 2)`.
2. **Reject non-finite environment values statically** — a `Number.isFinite` check in
   `checkNode`'s identifier case (`:478-482`) alongside the existing `Object.hasOwn`. This fires in
   the static pass, consistent with AC-24's philosophy, and kills the environment route to F-1 at
   the source rather than at `gcd`.

Together they make F-1 unreachable without touching `greatestCommonDivisor`. Which error code
option 2 uses is an orchestrator decision, not mine to mandate — `TYPE_MISMATCH` is defensible
("a non-finite double is not the `number` this contract means") and `DIVISION_BY_ZERO` is not.
Escalate rather than guess.

## F-4 — the static/dynamic split leaks for an own key holding `undefined` · **MINOR**

`src/engine/questions/expr.ts:479` vs `:521-527`

The two passes disagree on what "resolved" means:

```ts
checkNode:479        if (!Object.hasOwn(env, node.name)) { throw unknownIdentifier(...); }
readIdentifier:523   if (!Object.hasOwn(env, name) || value === undefined) { throw unknownIdentifier(name); }
```

An environment of shape `{ a: undefined }` therefore passes the *static* pass and throws
`UNKNOWN_IDENTIFIER` from the *evaluation* pass. Verified. That is exactly the ordering AC-24's
rationale exists to prevent — the failure becomes branch-dependent again, since a short-circuited
operand would never reach `readIdentifier`.

`Environment` is typed `Readonly<Record<string, number>>`, so this needs a type-lie to reach — but
it is one spread of an optional field away in T-007, and it is the cheapest of these findings to
close: make the two guards use the same predicate. (If F-3 option 2 is taken, `Number.isFinite`
in `checkNode` subsumes it, since `Number.isFinite(undefined)` is `false`.)

## F-5 — judgement on the 36,792-call probe and on `noUncheckedIndexedAccess` · **MINOR**

**The `noUncheckedIndexedAccess` dimension is genuinely clean.** Scanned the file: **zero** `!`
non-null assertions, **zero** `as` casts, **zero** `any`, **zero** `@ts-` comments, **zero**
`eslint-disable`. Every `T | undefined` — and there are 22 of them — is discharged by a real
`=== undefined` comparison. No guard hides a path; there is nothing silenced here.

**The probe was well-constructed on the axes it chose and blind on the axes that mattered.** It
carried an L-014 teeth check (correct, and the reason I take its result seriously) and the
implementer's caveat — *"not claiming these branches are provably dead"* — is honest and should be
preserved. But three structural limits:

1. **It asserts nothing about returned values.** Its two assertions are "no distinctive defensive
   message surfaced" and "no non-`ExprError` escaped". A returned `Infinity` is a **pass**. The
   probe could not have caught F-3 even with a 400-digit literal in the corpus.
2. **The environment axis is 6 fixed maps.** Expressions were swept combinatorially (3,066);
   environment *values* were not swept at all. F-4 reaches the `:523` guard — so "0 hits" is a
   statement about the corpus, not about the guard.
3. **Assertion 2 was the right assertion and passed vacuously.** "No non-`ExprError` escaped" is
   exactly what would have caught F-2 — but no input in the corpus was 4,562 terms long.

Same axis-selection error as the depth bisection. Two probes, both rigorous in method, both
sweeping only the shapes the author had already thought of.

On the guards themselves: `:603` and `:609` are **redundant but honest**. `resolveWhitelistedCall`
at `:600` has already proved `values.length === spec.arity`, so `values[0]`/`values[1]` cannot be
`undefined`; the guards exist only to narrow the type, and they throw a typed error rather than
producing `NaN`. Cosmetic defect: `:604`'s message says `"received 0"` when `values.length` is
necessarily 1 — if that branch ever did fire, the message would misreport the cause. Use
`values.length`.

## F-6 — `resolveWhitelistedCall` runs twice per call node · **MINOR**

`:489` (static) and `:600` (evaluation). The second call is dead work whose only purpose is to
re-narrow `spec.arity` for TypeScript. Harmless, but as written it reads like a missing invariant
rather than a deliberate re-narrowing. One comment at `:600` saying so would prevent a future
contributor from "fixing" the static call away.

## F-7 — `-0` · **MINOR (note)**

`evaluateNumber("-a", { a: 0 })` returns `-0` (`computeNumber:581`). `String(-0)` is `"0"` and
`Set` dedup uses SameValueZero, so rendering and set-membership are unaffected — but an
`Object.is`-based distractor dedup in T-005 would treat `-0` and `0` as distinct answers. One line
to normalise if T-005 wants it; no change required here.

## Note, not a finding — float artifacts

`0.1 + 0.2` → `0.30000000000000004`; `1 / 3` → `0.3333333333333333`. This is the direct and
intended consequence of the ticket's own pinned decision that `/` is real division returning a
possibly-fractional `number`, and rounding/presentation belongs to T-007's renderer. Recorded only
so it is not later mistaken for a regression in this module.

## What is genuinely clean

Stated plainly, because it is most of the module:

- **The grammar is closed.** Read production by production against the ticket. `NUMBER` accepts
  `digits ( "." digits )?` and nothing else — `1e3`, `0x10`, `0b11`, `0o17`, `1_000`, `1.`, `.5`,
  `1.2.3` all `PARSE_ERROR` (verified), each by the honest route the docblock at `:103-108`
  describes: number-then-identifier, caught by the trailing-token check at `:206-209`. Stray `!`,
  `&`, `|`, `+`, `$`, `.` are all rejected at `:160`.
- **Precedence and associativity are correct by construction**, read from the descent structure:
  `-`, `/`, `%` left-associative via the `for(;;)` fold; `&&` nested inside `||`; comparison
  non-associative because `parseCompare:293-300` takes **at most one** operator and the leftover
  falls to the trailing-token check (`a < b < c`, `a == b == c` → `PARSE_ERROR`, verified).
- **Unary minus vs subtraction is disambiguated correctly** and matches the grammar exactly:
  `unary := ( "-" )? primary` is a single non-repeating minus, so `- -a` and `--a` are
  `PARSE_ERROR` (verified) — which also means a long unary chain cannot recurse, closing one of
  the three shapes I probed for a depth bypass.
- **The static/evaluation split is coherent** with the one exception in F-4. Everything AC-23 and
  AC-24 require to be static **is** static, in a single pass over the whole tree
  (`checkNode:473-515`) that runs before any value exists (`:644`, `:654`). `DIVISION_BY_ZERO` is
  the **only** code deferred to evaluation, and it is the only genuinely value-dependent one.
  Verified: `b == 0 || a / 0 == 1` returns `true`, while `sqrt`, `min(a)`, `z` and a bare `a` in
  the same skipped position all throw.
- **The whitelist is closed structurally, not by test.** Resolution through a `Map` means the
  `Math[name]` cheat class from L-014 is not merely caught, it is impossible.
- **Numeric semantics match the ticket** for every finite input: real division, JS remainder sign,
  `gcd` over absolute values, `gcd(0,0) = 0`, division/remainder by zero (including `-0`) typed.
- **Naming and clarity are strong.** One method per grammar production, names that match the
  grammar, no abbreviations, no clever control flow. The docblocks earn their space — `:103-108`,
  `:182-187`, `:292`, `:324`, `:366-370`, `:409-414` and `:567-571` each record *why*, and the
  header at `:31-41` states the pinned semantics explicitly rather than leaving them to be
  inferred. This is well above the bar for readability.
- **File scope is exact** and no test file was touched.

---

# Rulings on the implementer's four concerns

## 1. M-3 — `"b == 0 || z"` returns `UNKNOWN_IDENTIFIER` · **stable and defensible; document it**

Not accidental. `checkNode:473-515` is a single depth-first, left-to-right walk that resolves each
node's name **at the node** and combines operand types only after both recursive calls return
(`:497-498`). The emergent rule is therefore precise and structural: **the first failure in
left-to-right DFS order is the one reported.** That is order-stable and survives any refactor that
preserves the traversal shape.

Verified against the full M3 family from the test-design review, and it is consistent in every case:

| Expression | Code | Why |
| --- | --- | --- |
| `b == 0 \|\| z` | `UNKNOWN_IDENTIFIER` | name resolved at `:479` before the type is combined at `:510` |
| `b == 0 \|\| a` | `TYPE_MISMATCH` | `a` resolves, so the type check is reached — matches AC-23 |
| `z \|\| b == 0` | `UNKNOWN_IDENTIFIER` | left operand, same rule |
| `foo(z)` | `UNKNOWN_FUNCTION` | name at `:489` before args at `:490` |
| `min(z)` | `ARITY_MISMATCH` | arity at `:433` before args at `:490` |
| `z / 0` | `UNKNOWN_IDENTIFIER` | static beats value-dependent |

The implementer was right not to invent a criterion, and right to flag it. **No code change.**
Recommendation to the orchestrator: add one sentence to the module docblock (or an AC) stating the
precedence rule, so a later contributor reordering `checkNode`'s `binary` case knows they are
changing a published contract rather than tidying. **Minor.**

## 2. Static arity checking · **consistent with AC-23/AC-24, not an over-reach — but pin it**

AC-24's rationale is explicit about *why* identifier resolution is static: *"constraints are
hand-authored content, so the evaluator should fail loudly on a name that cannot exist rather than
silently skip it."* `min(a)` is exactly that class — an authoring error that cannot become correct
at any parameter value. Deferring it to evaluation would make it discoverable only when its branch
happens to run, which is the failure mode AC-24 exists to prevent, and T-019's 1,000-sample sweep
cannot guarantee that branch is ever taken.

So this is a correct reading of the static philosophy, not scope creep. The risk the implementer
names is real but different: it is **unpinned**, a runtime-only check would also pass 296 tests,
and a consumer will come to depend on it. That is closed with one AC, not with a code change.
**Minor.**

## 3. `MAX_NESTING_DEPTH = 64` · **reasonable, no change**

The legal window is `[16, 199]`. 64 sits with real margin on both sides — 4× AC-20's floor, so
legitimate nested templates are nowhere near it, and 3× under AC-15's ceiling, so the AC-15 tests
are not testing a boundary. Cost at the limit is roughly 64 × 7 descent frames ≈ 450, two orders
below any host stack. Checked on the way **in** (`:257-268`), so a 100,000-deep input stops after 65
groups. Documented at `:182-187` with both bounding ACs named. This is a well-made choice.

One caveat, which is F-2's: it is the module's **only** budget, and it governs exactly the shape
that is safe. If F-2 is fixed with a second budget, document the two together so the next reader
does not conclude, as the implementer's own probe did, that nesting depth is the whole story.

## 4. Non-finite values in the environment · **NOT acceptable — and the concern as written understates it**

Ruled against, on both halves of the reasoning.

- *"an `Infinity` or `NaN` passed in by a caller propagates"* — **incomplete**. It does not merely
  propagate through `gcd`; it **hangs** (F-1). A propagated bad value is observable and
  recoverable; a hang is neither.
- *"the DoD line is met for every finite environment"* — **the environment is not the only route**.
  A 309-digit literal reaches the identical state with an empty environment (F-3), so this cannot
  be characterised as the caller supplying garbage that the type signature disclaims.
- *"adding a guard would be production code no failing test demands"* — **wrong test.** A DoD item
  is a requirement whether or not a frozen test happens to exercise it. The two blind spots here —
  M4 dismissed on a reachability argument that turns out to be false, and no test long enough to
  reach F-2 — are exactly what an independent review is for. "No failing test demands it" is the
  reasoning L-013 and L-015 were both written to retire.

**Real risk for T-007.** Fix per F-3.

---

# Required changes

| # | Change | Severity |
| --- | --- | --- |
| 1 | `gcd` must not be able to loop forever. Closed by a finiteness guard — see 2. | **Critical** |
| 2 | Reject non-finite values: at tokenise time for over-large literals (`:132`), and in the static pass for environment values (`:478-482`). `evaluateNumber` must never return `Infinity` or `NaN`. Error-code choice is constrained by the `Exact<>` pin at `expr.test.ts:1130-1142` — escalate rather than invent a seventh code. | **Important** |
| 3 | Bound total parse work, not only group nesting, so a long operator chain throws `PARSE_ERROR` instead of `RangeError`. A token-count cap in `parse:385-387` is sufficient. | **Important** |
| 4 | Make `checkNode:479` and `readIdentifier:523` agree on what "resolved" means. | Minor |
| 5 | `:604` — report `values.length`, not a hardcoded `0`. | Minor |
| 6 | One comment at `:600` recording that the second `resolveWhitelistedCall` exists to re-narrow `spec.arity`. | Minor |

**To the orchestrator, not the implementer:** M-3's DFS precedence rule and static arity checking
are both correct and both unpinned. Each needs one AC (or one docblock sentence) so a later change
cannot silently move them.

---

## Verdict

**Spec compliance:** 24/24 ACs met; **one DoD item not met**; no Iron Law violation.
**Code quality:** **1 Critical, 2 Important**, 4 Minor.

The grammar, precedence, associativity, whitelist closure, static/evaluation split, dynamic-code
posture, purity, `noUncheckedIndexedAccess` discipline, naming and documentation are all genuinely
clean — this is careful work, and the implementer's four self-reported concerns were all real and
honestly stated. But one of them was under-diagnosed into a hang, and both measured "unreachable"
claims in the report were measured only over the shapes their author had in mind. Approval requires
both verdicts clear of Critical and Important; neither is.

**CHANGES REQUIRED**
