# Swarm Lessons — Cannon Academy

Accretes across epics. The Planner reads this before decomposing; every implementer
dispatch names it as required reading. One entry per blocked ticket, wave-review
failure, or adjudicated test dispute: **pattern → why → what to do instead**.

---

## L-001 — Verify a guard fires before trusting it (Phase 0)

**Pattern:** Lint rules meant to enforce architecture invariants (engine purity,
banned `Math.random()`) were written, then proven by deliberately committing a
violating file and confirming ESLint errored — before any ticket relied on them.

**Why:** A misconfigured `no-restricted-imports` glob fails silently. Every ticket
downstream would inherit false confidence that the engine stayed pure.

**What to do instead:** Any gate that exists to *prevent* something must be shown
going red on a synthetic violation at setup time. A guard never observed failing
is an assumption, not a gate.

---

## L-002 — A red baseline makes every later gate meaningless (Phase 0)

**Pattern:** `npm audit` was red (8 high) at scaffold time from transitive dev
dependencies. Fixed at Phase 0 via a targeted `overrides` pin instead of being
waived or deferred.

**Why:** If the baseline is red, "gates pass" for a ticket means nothing — nobody
can tell the ticket's damage from the pre-existing noise, and agents learn to
ignore that gate.

**What to do instead:** Drive every gate green before Wave 1, or write the
deferral down in `posture.md` with a re-enable condition. Never leave a gate
ambiguously red.

---

## L-003 — Prefer a targeted override to `audit fix --force`

**Pattern:** `npm audit fix --force` proposed eslint 10 (a breaking major) to fix a
build-time-only DoS advisory. An `overrides` pin on the single offending transitive
package fixed all 8 findings with zero breaking changes.

**Why:** `--force` optimizes for a clean audit report, not a working toolchain. On
day 1 of a 5-day timebox, a broken linter costs more than the advisory it fixed.

**What to do instead:** Read the advisory tree, find the shared root cause, pin it.
Reach for `--force` only when the direct dependency itself is the vulnerable one.

---

## L-004 — Same-wave tickets that share an *interface* break parallel dispatch (Phase 1)

**Pattern:** A ticket was scheduled in the same wave as the ticket owning the file it
imports, with no dependency edge. File scopes did not overlap, so the mechanical
exclusivity check passed — but in a separate git worktree the importer cannot see the
owner's uncommitted work, so it cannot compile. The frozen tests are blocked a phase
earlier than the code.

**Why:** "Exclusive file scopes" is necessary but NOT sufficient for parallel dispatch.
Exclusivity prevents write collisions; it says nothing about read dependencies.

**What to do instead:** For every same-wave pair, ask what each ticket *imports*, not
just what it *writes*. Any cross-ticket import inside a wave needs a dependency edge.
Validate the graph the code implies, not only the graph the plan declares.

---

## L-005 — A constant's permitted range can make a downstream requirement impossible (Phase 1)

**Pattern:** A tuning constant was specified with bounds (`>= 1`) that were individually
reasonable, while a consumer two waves later required a guarantee that was only
satisfiable at `>= 3`. Nothing in either ticket was internally wrong; the conflict lived
only in the interaction, and would have surfaced as a rare, non-deterministic failure in
a 1,000-sample sweep — against a constant frozen two waves earlier.

**Why:** Behaviour-pinned constants (bounds instead of values) are the right way to avoid
fabricating numbers, but the bounds themselves are a contract. A too-permissive bound is
as much a defect as a wrong value, and far harder to trace.

**What to do instead:** When a ticket pins bounds rather than a value, check every
downstream consumer's guarantees against the *worst legal value* in that range —
especially degenerate inputs (zero, empty, equal operands). If the worst legal value
breaks a consumer, tighten the bound in the ticket that owns the constant.

---

## L-006 — Weak acceptance criteria let a lazy implementation kill the product's core (Phase 1)

**Pattern:** A constant controlling how strongly answer speed biases damage — the game's
entire pedagogical premise — was pinned only as `0 < w <= 1` plus a monotonicity check.
An implementation setting it to `0.001` would pass every acceptance criterion while
making the mechanic statistically undetectable in play.

**Why:** Monotonicity proves a direction, not a magnitude. For any mechanic that must be
*perceptible*, direction is not the requirement — effect size is.

**What to do instead:** When a criterion protects something a user must actually notice,
assert an effect size over seeded samples, not just an inequality. Ask of every AC:
"what is the laziest implementation that passes this, and is it still the product?"

---

## L-007 — A crashing guard hook fails OPEN, not closed (Phase 1)

**Pattern:** The PreToolUse hook protecting frozen tests was written as `.js` in a
package with `"type": "module"`, so `require` threw on every invocation. Node exited
**1** — and only exit **2** blocks a tool call. The hook was therefore a no-op that
looked installed: implementers could have edited frozen tests freely while the config
claimed they could not.

**Why:** Guard failures are silent by design (hooks fail open so a broken hook cannot
wedge a session). That safety property is exactly what makes an unverified hook
dangerous — nothing reports that it never worked.

**What to do instead:** Probe every hook with the actual JSON payload shape and assert
the **exit code**, not just that a message appeared. Check both directions: the case it
must block AND the case it must allow. A guard that has never been observed returning 2
is not installed, whatever the settings file says. Corollary of [[L-001]].

---

## L-008 — Create worktrees only from a committed state (Phase 2)

**Pattern:** Wave-1 worktrees were created with `git worktree add` while the Planner's
latest ticket revisions still sat uncommitted in the main working tree. `git worktree add`
branches from the *commit*, not the working tree, so the worktrees silently received the
previous revision of every ticket file. It happened to be harmless — the three wave-1
tickets were byte-identical across the two revisions — but only by luck.

**Why:** A Test Agent's entire brief is its ticket file. If that file is a revision behind,
the agent writes frozen tests against a superseded contract, and nothing downstream will
detect it: the tests will be internally consistent, pass review, and encode the wrong spec.

**What to do instead:** Before `git worktree add`, assert the tree is clean
(`git status --porcelain` empty) or commit first. After creating worktrees, diff each
dispatched ticket file against the integration branch and confirm it is identical.
Verify, then dispatch — never dispatch and then verify.

---

## L-009 — Default-permissive validation silently loses data (Phase 2)

**Pattern:** Content schemas were specified without saying whether unknown keys are
rejected. zod strips them by default, so a typo'd **optional** field in a JSON catalog
(`recoilDmg` for `recoilDamage`, `requiresIsand` for `requiresIsland`) would parse
successfully and vanish. The catalog would look valid, the tests would pass, and the
field would simply not be there at runtime. Required fields are safe — their absence
throws — so the hole is invisible exactly where it is hardest to notice.

**Why:** "Validated" is not a binary. A schema that accepts a superset of the intended
shape provides type safety for what it names and zero protection for what it does not.
The catalogs are authored by a different ticket than the one owning the schema, so the
author cannot fix the schema when a typo slips through — they just get quiet data loss.

**What to do instead:** For any schema validating data authored elsewhere, specify the
unknown-key policy explicitly and test it. Default to strict for hand-authored content.
More generally: when a ticket specifies a validator, require the spec to state what it
**rejects**, not only what it accepts — a criterion listing only accept cases is passed
by a validator that accepts everything.

---

## L-010 — Language-level semantics must be pinned, not assumed shared (Phase 2)

**Pattern:** A safe arithmetic evaluator specified `%`, `/`, and `gcd` without stating
behaviour for negative or zero operands. Every one of those is reachable from a constraint
expression, and each has two defensible answers: `%` is remainder (sign follows the
dividend) in JS but modulo (always non-negative) in mathematics; `gcd(0,0)` is `0` by
convention or an error by argument; a zero-argument call is a parse failure under one
reading of the grammar and an arity failure under another.

**Why:** Both the spec author and the implementer "know" what these mean — and know
different things. Nothing surfaces the disagreement, because each side's tests agree with
its own reading. In a K-5 math engine the downstream cost is not a crash: it is a
divisibility constraint that quietly admits the wrong parameters and ships a question with
a wrong answer.

**What to do instead:** For any evaluator, parser, or numeric routine, require the spec to
pin behaviour at the **degenerate inputs** — zero, negative, empty, and the arity/precedence
boundaries — not merely the happy path. When two conventions exist, name the chosen one and
say why. Prefer the host language's native semantics unless there is a concrete reason not
to; it is the reading an implementer will default to under time pressure.

---

## L-011 — Prove a frozen suite against a throwaway reference implementation (Phase 2)

**Pattern:** Two Test Agents, independently, built a scratch implementation outside `src/`,
ran the frozen suite against it to prove every criterion was *satisfiable* and every
hand-computed expected value correct, then deliberately mutated that reference to prove each
assertion had teeth — and deleted it. This caught a criterion that AC text alone made look
fine, and confirmed that assertions which merely *looked* strong actually failed on a wrong
implementation.

**Why:** A red suite proves only that code is missing. It cannot distinguish a correct
frozen contract from an unsatisfiable one, a tautology, or a wrong expected value — all of
which look identical while the module is absent, and all of which become extremely expensive
the moment an implementer is bound by them.

**What to do instead:** Before freezing, build a throwaway reference in the scratchpad, prove
the suite goes fully green against it, then mutate it once per assertion class and confirm the
matching tests fail. Never create it under `src/` — it is a proof device, not production code,
and it must be deleted before commit.

---

## L-012 — Aggregate assertions certify the projection, not the mechanism (Phase 2)

**Pattern:** Every Critical finding in wave 1 had the same shape — a test that constrained an
aggregate while leaving the mechanism free:

| Assertion | What it measured | What slipped through |
|---|---|---|
| index-0 distribution uniform over 10,000 shuffles | one position | a shuffle that permutes only that position |
| per-face counts perfect over 60,000 draws | the histogram | values from a module counter, not the seed |
| every id field round-trips through the schema | runtime values | `z.string()`, collapsing the derived type to `string` |

Each looks rigorous — large samples, tight bands, real numbers. But an aggregate is a
*projection* of behaviour, and a cheat only has to match the projection, which is a far weaker
obligation than being correct.

**Why:** Big-N statistical tests feel like strong evidence, so they suppress the instinct to ask
"what else satisfies this?" The tightness of the band is irrelevant when the cheat sits inside it
by construction.

**What to do instead:** For any aggregate assertion, ask what the *weakest* implementation
satisfying it looks like, and write it. Then assert the property that actually matters:
- distribution over one position → **the full permutation set**
- the output histogram → **purity: same input twice, same output**
- runtime round-trip → **the derived type itself**

A statistical band belongs alongside a structural assertion, never instead of one.

---

## L-013 — A guard that names a threat must be tested against the threat, not its spelling (Phase 2)

**Pattern:** T-002's whole purpose is "evaluate expressions without dynamic code construction."
Its guard was a substring scan for `eval(`, `new Function`, etc., backed by ESLint's
`no-eval`/`no-implied-eval`/`no-new-func`. A reviewer wrote a complete evaluator that compiles
each expression to JavaScript and runs it via
`Reflect.construct(Object.getPrototypeOf(function(){}).constructor, [params, body])`. It passed
**229/229 frozen tests, `tsc` exit 0, and `eslint` exit 0.**

Probing eight spellings against the real config, the lint rules caught **3 of 8**. They match the
*bindings* literally named `eval` and `Function`; they do not follow aliasing, computed member
access, or reflection. Adding `no-restricted-globals: Function` and
`no-restricted-properties: Reflect.construct` raised it to 6 of 8. The last two —
`globalThis['ev'+'al']` and `Object.getPrototypeOf(function(){}).constructor` — are not reachable
by static lint at all.

**Why:** Both defences check *how the threat is written*. The threat is defined by *what happens
at runtime*, and the set of ways to spell it is open. Any enumeration of spellings is a
denylist, and a denylist for an open set is a false sense of safety — worse than none, because it
gets cited as the authoritative guard (this ticket's own AC text did exactly that).

**What to do instead:** Guard the behaviour. Poison every runtime route to the capability before
importing the module under test — for code construction that is `globalThis.Function`,
`globalThis.eval`, `Reflect.construct` called with `Function`, and the `constructor` getter on
`Function.prototype` — then assert no route is reached while the module still returns correct
results. Static checks stay as cheap secondary defence, never as the authority. Generally: when a
requirement is "X never happens", the test must make X *observable*, not make its common
spellings unwriteable.
