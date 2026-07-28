# T-002 — Code Review 2 (re-review after fix)

**Reviewer:** independent senior review (did not write this code)
**Ticket:** `tickets/T-002.md` — now **26 ACs**
**Implementation:** `/Users/quietguy/Documents/Dev/Gauntlet/cannon-wt/wt-T-002/src/engine/questions/expr.ts` (774 lines)
**Fix commit:** `136bc6f` — verified to touch **only** `src/engine/questions/expr.ts`
**Test commit:** `9c46709` — only `__tests__/engine/questions/expr.test.ts`
**Prior review:** `.tdd-swarm/reports/T-002-code-review.md`
**Date:** 2026-07-28

---

## Verdict summary

| Dimension | Result |
| --- | --- |
| **Prior findings** | F-1 (Critical) **closed**. F-2 (Important) **closed**. F-3 (Important) **closed**. |
| **Spec compliance** | 26/26 ACs met. **All 7 DoD items met** — the one that failed last round now passes. |
| **Code quality** | **0 Critical, 0 Important.** 5 Minor (3 carried over unaddressed, 2 new). |
| **Overall** | **APPROVED** |

Accepted as given and not repeated: gates green, 335/335, spec-lint 26/26, single-file diff, and the
coordinator's own probe results. Everything below is independent measurement against the shipped
file.

---

## Closure of the three prior findings

I re-ran all three against the fixed module, plus routes the fix's own tests do not cover.

| Prior finding | Status | Evidence |
| --- | --- | --- |
| **F-1** `gcd` non-terminating on a non-finite argument | **CLOSED** | All three original routes plus six I added now throw `NON_FINITE_VALUE` in milliseconds. No probe hung. |
| **F-2** `RangeError` escaping on a flat operator chain | **CLOSED** | Every chain shape I could construct now fails as `PARSE_ERROR` during parsing. No `RangeError` reached the public API in any probe. |
| **F-3** `Infinity`/`NaN` returned from in-grammar input | **CLOSED** | 11 production routes tested — literal, all four arithmetic operators, negation, environment — all `NON_FINITE_VALUE`. `"9"×308` still returns `1e308` correctly. |

---

# Question 1 — Is `NON_FINITE_VALUE` placed correctly and completely?

**Yes. The placement argument is sound, and I could not construct a route around it.**

## The structural argument, verified

`computeNumber` (`expr.ts:686-714`) is the only place in the evaluation pass where a `number` comes
into existence, and **all five** of its returns are wrapped:

| Return | Line | Covers |
| --- | --- | --- |
| `case 'number'` | `:689` | a literal |
| `case 'identifier'` | `:692` | a parameter read from the environment |
| `case 'negate'` | `:695` | negation |
| `case 'call'` | `:702` | a function result |
| `case 'binary'` (arithmetic) | `:707` | an overflowed intermediate |

The load-bearing detail is `:697-702`: a call's arguments are pushed by `values.push(computeNumber(arg, env))`
**before** `applyWhitelistedCall(node.name, values)` is invoked. Every element of `values` has
therefore already passed `requireFinite`. `greatestCommonDivisor` (`:496-505`) is reachable only
through `WHITELISTED_FUNCTIONS` (`:519`) and thus only through `applyWhitelistedCall` (`:716-733`),
so **a non-finite value cannot reach it at all**. The Euclid fixed point is not fixed — it is
unreachable.

The implementer's framing is correct and worth preserving: a guard on the two *input boundaries*
sits on either side of the offending arithmetic node, whereas a guard on the *product of every node*
cannot be flanked. The fourth route the Test Agent found (`gcd(a * a, 2)` with `a = 1e200`) is the
proof case — finite in the environment, finite as a literal, non-finite only mid-evaluation.

The two remaining number-consuming paths are covered by the same property:

- **Comparisons** — `computeBoolean:745` feeds `applyComparison` from `computeNumber` on both
  operands. Verified: `a * a > 0` with `a = 1e200` → `NON_FINITE_VALUE`; `a == a` with `a = NaN` →
  `NON_FINITE_VALUE` rather than silently `false`.
- **`readIdentifier`** (`:619-625`) returns an unguarded raw value, but its only call site is
  `:692`, which wraps it.

## Routes probed

11 production routes, all `NON_FINITE_VALUE`: literal `"9"×309`; overflow via `*`, `+`, `/`, `-`;
`NaN` via literal subtraction; negation of an infinite parameter; `Infinity`, `-Infinity` and `NaN`
supplied directly in the environment. Control: `"9"×308` still returns `1e308`.

16 consumption routes, all `NON_FINITE_VALUE` — including six the fix's own four routes do not
cover:

| Route | Result |
| --- | --- |
| `gcd(2, a * a)` — overflow in the **right-hand** argument | `NON_FINITE_VALUE` |
| `gcd(-a, 2)` — non-finite reached through **negation** | `NON_FINITE_VALUE` |
| `gcd(abs(a), 2)` — through a **nested call** | `NON_FINITE_VALUE` |
| `gcd(gcd(a, 2), 3)` — `gcd` of a `gcd` | `NON_FINITE_VALUE` |
| `gcd((a * a), 2)` — through a **parenthesised** group | `NON_FINITE_VALUE` |
| `min(a * a, 1)` — where the *result* would have been finite | `NON_FINITE_VALUE` |

That last one is the sharpest confirmation that the guard is genuinely upstream: `Math.min(Infinity, 1)`
is `1`, a perfectly finite answer, and it is still rejected — because the argument never gets that
far. Control `gcd(12, 18)` → `6`.

## Is the environment case correctly *runtime* rather than static?

**Yes, and the split is coherent.**

`checkNode`'s identifier case (`:576-580`) checks existence only — `Object.hasOwn`, no finiteness.
Finiteness is checked in `computeNumber:692`, i.e. during evaluation. Verified suppressible by
short-circuit:

| Expression | Environment | Result |
| --- | --- | --- |
| `b == 0 \|\| a > 0` | `{ a: Infinity, b: 0 }` | `true` — suppressed |
| `b != 0 && a > 0` | `{ a: NaN, b: 0 }` | `false` — suppressed |
| `b == 0 \|\| gcd(a, 2) > 0` | `{ a: Infinity, b: 0 }` | `true` — suppressed |
| `a > 0 \|\| b == 0` | `{ a: Infinity, b: 0 }` | `NON_FINITE_VALUE` — branch taken |

This is the right classification and it follows the philosophy already established by AC-23/AC-24
rather than inventing a new one: a non-finite **parameter** is value-dependent, exactly like
division by zero, so short-circuiting may suppress it. An oversized **literal** is a property of the
text, so it is rejected statically in `tokenize:155` and is *not* suppressible — verified:
`b == 0 || "9"×309 > 0` throws even though the branch is skipped. The docblock at `:125-128` states
this split explicitly, which is what makes it a decision rather than an accident.

**Answer: correct and complete.**

---

# Question 2 — Is `MAX_AST_DEPTH = 1024` checked at every construction site?

**Yes. I could not find a shape that grows the tree without passing the check.**

## Every site that can grow a tree

| Site | Line | Guarded |
| --- | --- | --- |
| `makeBinary` — used by all five binary productions (`:368`, `:379`, `:390`, `:400`, `:411`) | `:351-359` | `withinAstDepth` ✓ |
| `negate` | `:421` | `withinAstDepth` ✓ |
| `call` | `:441` | `withinAstDepth` ✓ |
| number literal (leaf, `height: 1`) | `:434` | not needed |
| identifier (leaf, `height: 1`) | `:448` | not needed |
| parenthesised group | `:451-456` | returns `inner` **unchanged** — adds no height and no walk frame, correctly uncounted |

Height increases by exactly 1, only at those three sites, each checked. So *every node in a
completed tree has height ≤ 1024* holds by induction — the guarantee is structural, not
probabilistic.

And `height` is exactly the walk depth, not an approximation:
`Math.max(left.height, right.height) + 1` for binary, `operand.height + 1` for negate,
`tallest(args) + 1` for call, `1` for leaves — matching the recursion shape of `checkNode:571`,
`computeNumber:686` and `computeBoolean:736` node-for-node.

## Bypass probes — the shapes that do not go through the sum/product fold

| Shape | Result |
| --- | --- |
| `min(<1024-chain>, 1)` / `min(<1023-chain>, 1)` — **call argument** | `PARSE_ERROR` / `OK` |
| `<1024-chain> > <1024-chain>` / `<1023>` — **comparison operands** | `PARSE_ERROR` / `OK` |
| 2,000-term `\|\|` chain and 2,000-term `&&` chain — **logical fold** | `PARSE_ERROR` |
| `(<3000-chain>)` — paren-wrapped | `PARSE_ERROR` |
| **64 parens around a 1024-chain** | `OK → 1024` |
| `-(-(-…))` × 64 — nested unary through parens | `OK` |
| `min(a, a, … ×50000)` — **wide** argument list | `ARITY_MISMATCH`, no stack risk |
| 5,000,000-term chain | `PARSE_ERROR`, fails fast |

The 64-parens row is the one that closes the question: parentheses add no height, so **1024 is the
true global maximum tree height reachable by any combination of shapes**, not merely the maximum for
a flat chain.

## Measured boundary

Bisected through the public API: **max accepted = exactly 1,024 terms** for additive, multiplicative
and identifier chains — matching the implementer's report.

A *mixed* chain (`1+1*1-1/1…`) accepts **1,535** terms. That is correct, not a leak: `*` and `/`
bind tighter, so the product sub-chains nest *inside* the sum chain and tree height stays ≤ 1024.
It confirms the cap is on the right quantity — walk depth, not token count.

**Answer: checked at every site; no bypass found.**

---

# Question 3 — Is the 1024 margin defensible, or should the walks be rewritten?

**Defensible as shipped. Follow-up ticket, not a blocker — but the margin is roughly half what the
docblock claims, and the comment should be corrected.**

I lifted `MAX_AST_DEPTH` in a scratch copy of the *shipped* module (teeth-checked per L-014: an
8-term chain still evaluates, so the patch is live and failures are real overflows) and bisected the
true overflow point in Node workers at controlled stack sizes:

| Host stack | Max evaluable chain | Margin over the 1024 cap |
| --- | --- | --- |
| 4 MB — Node default | 18,756 | 18.3× |
| 2 MB | 7,818 | 7.6× |
| **1 MB — ≈ browser main thread** | 3,521 | **3.4×** |
| 0.75 MB | 2,350 | 2.3× |
| **0.5 MB — constrained worker** | 1,569 | **1.5×** |

Two things follow.

1. **The docblock's numbers are Node's, presented as host-general.** `:230-239` cites "a first
   `RangeError` between 4,000 and 4,688 terms across three machines" and "roughly a quarter of the
   lowest observed ceiling". Those were all measured on Node's 4 MB default stack, where the real
   ceiling is 18,756 here. The deployment target is a browser game: at a ~1 MB main-thread stack the
   margin is 3.4×, and at 0.5 MB it is 1.5×. The claim is not wrong about the *direction*, but it
   overstates the headroom by roughly 2×. **Minor — fix the comment, not the constant.**
2. **The cap nonetheless holds everywhere I could measure.** Breaching it needs a host with under
   roughly 0.35 MB of usable stack, which no browser or RN engine ships. And reaching height 1024
   at all requires an expression about **100× taller than any plausible template** — a realistic
   `answerExpr` such as `floor(a / b) + c` has height 4. The residual risk is the product of two
   independently implausible conditions.

I also observed that the overflow boundary is **run-dependent**, not merely host-dependent: near the
threshold the bisection's next-larger case sometimes succeeded on retry. That is an argument *for*
the fixed cap, not against it — and it is precisely the nondeterminism AC-26 was written to
eliminate. The actual defect is closed: the same input is now accepted or rejected identically on
every host.

**Ruling.** Do not block on this. The effective legal window is `[500, host ceiling]` — 500 because
the frozen suite pins a 500-term chain as evaluable (`expr.test.ts:1668`) — so 1024 is 2.05× the
floor, and there is not much room to buy margin without sitting brittlely close to a frozen test.
Raise a follow-up ticket to either convert the three walks to an explicit stack (which retires the
question outright) or re-derive the constant against the real deployment target's stack. Rewriting
now would be a larger diff than the fix it replaces, with no failing test demanding it, against the
MVP posture.

---

# Question 4 — New Critical or Important introduced by the diff?

**None. And nothing legitimate is broken.**

## Legitimate content regression battery

- **24 numeric template expressions** (`a + b`, `a / b`, `floor(a / b)`, `gcd(n, d)`,
  `n / gcd(n, d)`, `a + b * c`, `min(a,b) + max(a,b)`, `0.5 * a`, …): **0 regressions.**
- **14 constraint predicates** (`a + b <= 20`, `a % b == 0`, `b == 0 || a % b == 0`,
  `gcd(a, b) == 1`, `floor(a / b) * b == a`, …): **0 regressions.**

Overflow requires operands around 1e154 or larger; T-007 samples from ranges like `[1, 9]`. There is
no realistic expression a template author would write that the non-finite rejection now refuses.

## Extreme-but-finite values still work

`1e150 * 1e150`, `MAX_SAFE_INTEGER + 1`, denormals (`5e-324 * 2`), underflow to `0`, `-0`,
`gcd(1e308, 5e-324)`, `gcd(MAX_SAFE_INTEGER, 1)`, `gcd(1e308, 3)`, the 308-digit literal, and the
200- and 500-term chains — **all evaluate, all in 0–1 ms.** In particular there is no *slow* `gcd`
path hiding behind the fast one: float Euclid's remainder sequence decreases strictly in magnitude,
so it terminates in a handful of steps even across a 632-order-of-magnitude gap.

## Other checks

- **Purity (AC-14) intact** under the new guards: 100 evaluations of `a + b * c` → one distinct
  result; 100 non-finite failures → one distinct code.
- **All seven `ExprErrorCode` members reachable** from real evaluations.
- **No new dynamic-code surface** — the diff adds only `Number.isFinite` and `Math.max`.
- **Error precedence.** Tokenise-time `NON_FINITE_VALUE` now outranks every later error for the same
  string; verified across six combinations (`"z + 9…9"`, `"9…9 $"`, `"(9…9"`, `"sqrt(9…9)"`,
  `"9…9 > 1 > 2"`). This is a coherent extension of the pre-existing phase ordering — tokenise <
  parse < check < evaluate, under which a stray `$` already outranked an unknown identifier — not a
  new inconsistency. See Minor 5.

---

# Spec compliance

## Acceptance criteria

**AC-1 … AC-24: unchanged and still met.** The diff does not touch the tokeniser's grammar rules,
the descent structure, the whitelist `Map`, the static pass's name/arity/type logic, or the
short-circuit walk. I re-verified the ones the diff could plausibly have disturbed: AC-12
(`DIVISION_BY_ZERO` still precedes any finiteness concern), AC-14 (purity), AC-17 (`gcd(-12,18)=6`,
`gcd(0,0)=0`), AC-19 (union now seven members, all reachable), AC-23/AC-24 (short-circuit and static
resolution both intact), AC-15/AC-20 (`MAX_NESTING_DEPTH = 64` untouched).

| AC | Result | Evidence |
| --- | --- | --- |
| **AC-25** — non-finite produced or consumed → `NON_FINITE_VALUE`; never returns `Infinity`/`-Infinity`/`NaN`; no non-finite reaches a whitelisted function | **MET** | `tokenize:153-161` (literal, static); `requireFinite:666-671`; all five `computeNumber` returns `:689`, `:692`, `:695`, `:702`, `:707`. 11 production + 16 consumption routes verified, including six beyond the fix's own four. `ExprErrorCode` is a seven-member union at `:59-66`. 19 tagged tests. |
| **AC-26** — no `RangeError` escapes; flat chains → `PARSE_ERROR`; bound **deterministic**; ≥200 terms still evaluate | **MET** | `MAX_AST_DEPTH:240`; `withinAstDepth:337-345`; `makeBinary:351-359`; height on every `Node` variant `:204-220`. Deterministic by construction — a fixed constant checked at build time, not an emergent stack property. 200- and 500-term chains evaluate; 1,025 / 2,000 / 5,000,000 → `PARSE_ERROR`. 9 tagged tests. |

**26/26 met.**

## Definition of Done

| DoD item | Result |
| --- | --- |
| Every AC has a passing test tagged `spec(T-002:AC-n)` | **MET** — 26 distinct tags; 19 for AC-25, 9 for AC-26 |
| `run-local-gates.sh` green | **MET** (given) |
| `spec-lint.sh` green | **MET** — 26/26 (given) |
| No dynamic code construction anywhere | **MET** — diff adds only `Number.isFinite` / `Math.max` |
| **Every failure path throws a typed `ExprError`; never returns `NaN`, `Infinity`, `null`, `undefined`** | **NOW MET** — both prior violations closed and independently re-verified |
| Exports: `evaluateNumber`, `evaluatePredicate`, `ExprError`, `ExprErrorCode` | **MET** — `:759`, `:769`, `:69`, `:59` |
| Files changed are exactly those in `file_scopes` | **MET** — `136bc6f` touches only `src/engine/questions/expr.ts`; three-dot diff against `swarm/engine-core` shows exactly the two in-scope files |

**7/7 met.** The item that failed last round now passes.

## Iron Law

Nothing built beyond what AC-25 and AC-26 require. `requireFinite`, `withinAstDepth`, `makeBinary`,
`tallest` and the `height` field are each the minimum mechanism for a stated criterion. No
speculative extension, no new exports, no configuration surface.

---

# Minor findings

**Three of these are carried over from review 1 and were not addressed.** The coordinator's note
says the review was "acted on in full"; the two Critical/Important items were, and required
changes 4, 5 and 6 were not. Recording this factually — none of them blocks approval.

1. **[carried over] The static/dynamic split still leaks for an own key holding `undefined`.**
   `checkNode:577` uses `Object.hasOwn` alone; `readIdentifier:621` uses
   `!Object.hasOwn(...) || value === undefined`. Verified still reachable: `{ a: undefined }` passes
   the static pass and throws `UNKNOWN_IDENTIFIER` at evaluation, and is suppressible by
   short-circuit. Mitigating: AC-25 now classifies environment *values* as a runtime concern, which
   makes this leak considerably more defensible than it was — but the two guards still disagree on
   one predicate.
2. **[carried over] `:721` misreports the count** — `"takes 1 argument but received 0"` when
   `values.length` is necessarily 1. Use `values.length`.
3. **[carried over] No comment at `:717`** recording that the second `resolveWhitelistedCall` exists
   only to re-narrow `spec.arity` for TypeScript.
4. **[new] The `MAX_AST_DEPTH` docblock cites Node-only stack figures as host-general** (`:230-239`)
   and attributes the 500-term floor to AC-26 (`:233-234`), which actually says "at least 200" — 500
   comes from the frozen test at `expr.test.ts:1668`. The constant is right; the justification
   should carry the measured browser-relevant numbers (3.4× at 1 MB, 1.5× at 0.5 MB) and the correct
   attribution.
5. **[new] `requireFinite` at `:689` is now unreachable.** `tokenize:155` already rejects any
   literal that is not finite, so `case 'number'` can never carry one. Harmless defence-in-depth and
   not claimed live — but it belongs in the same "defensive, not reachable" note as the guards at
   `:720` and `:726`. Relatedly, the module now has **two** error-precedence rules — phase order
   (tokenise < parse < check < evaluate), then left-to-right DFS within the static pass — and only
   the DFS one is documented. One sentence covers both.

**Note, not a finding, pre-existing and out of scope:** `gcd` on fractional arguments returns a
float-Euclid artifact (`gcd(0.1, 0.3)` → `2.78e-17`). Unchanged by this diff, unpinned by any AC,
and unreachable from integer-valued parameters. Flagging only so it is not mistaken for a
regression later.

---

## Verdict

**Spec compliance:** 26/26 ACs met; **7/7 DoD items met**; no Iron Law violation.
**Code quality:** **0 Critical, 0 Important**, 5 Minor.

Both dimensions are clean of Critical and Important. The Critical hang is closed at the right place
— upstream of every consumer rather than at the two boundaries, which is why it also closes the
three routes I invented that the fix's own tests do not cover. The `RangeError` leak is closed by a
bound that is deterministic by construction and checked at every site that can grow the tree, and I
could not bypass it with call arguments, comparison operands, logical folds, nested parentheses,
unary nesting, or wide argument lists. Nothing legitimate regressed across 38 realistic template
expressions and predicates.

The one place I disagree with the implementation is a comment, not the code: the stack-margin
justification is measured against Node's 4 MB default and overstates the browser-relevant headroom
by roughly 2×. The cap still holds at every stack size I could measure, and the residual risk needs
an expression 100× taller than any plausible template on a host with under ~0.35 MB of stack.
That is a follow-up ticket and a corrected comment, not a blocker.

**APPROVED**
