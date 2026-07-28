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

**What to do instead:** Any gate that exists to _prevent_ something must be shown
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

## L-004 — Same-wave tickets that share an _interface_ break parallel dispatch (Phase 1)

**Pattern:** A ticket was scheduled in the same wave as the ticket owning the file it
imports, with no dependency edge. File scopes did not overlap, so the mechanical
exclusivity check passed — but in a separate git worktree the importer cannot see the
owner's uncommitted work, so it cannot compile. The frozen tests are blocked a phase
earlier than the code.

**Why:** "Exclusive file scopes" is necessary but NOT sufficient for parallel dispatch.
Exclusivity prevents write collisions; it says nothing about read dependencies.

**What to do instead:** For every same-wave pair, ask what each ticket _imports_, not
just what it _writes_. Any cross-ticket import inside a wave needs a dependency edge.
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
downstream consumer's guarantees against the _worst legal value_ in that range —
especially degenerate inputs (zero, empty, equal operands). If the worst legal value
breaks a consumer, tighten the bound in the ticket that owns the constant.

---

## L-006 — Weak acceptance criteria let a lazy implementation kill the product's core (Phase 1)

**Pattern:** A constant controlling how strongly answer speed biases damage — the game's
entire pedagogical premise — was pinned only as `0 < w <= 1` plus a monotonicity check.
An implementation setting it to `0.001` would pass every acceptance criterion while
making the mechanic statistically undetectable in play.

**Why:** Monotonicity proves a direction, not a magnitude. For any mechanic that must be
_perceptible_, direction is not the requirement — effect size is.

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
branches from the _commit_, not the working tree, so the worktrees silently received the
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
ran the frozen suite against it to prove every criterion was _satisfiable_ and every
hand-computed expected value correct, then deliberately mutated that reference to prove each
assertion had teeth — and deleted it. This caught a criterion that AC text alone made look
fine, and confirmed that assertions which merely _looked_ strong actually failed on a wrong
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

| Assertion                                         | What it measured | What slipped through                                  |
| ------------------------------------------------- | ---------------- | ----------------------------------------------------- |
| index-0 distribution uniform over 10,000 shuffles | one position     | a shuffle that permutes only that position            |
| per-face counts perfect over 60,000 draws         | the histogram    | values from a module counter, not the seed            |
| every id field round-trips through the schema     | runtime values   | `z.string()`, collapsing the derived type to `string` |

Each looks rigorous — large samples, tight bands, real numbers. But an aggregate is a
_projection_ of behaviour, and a cheat only has to match the projection, which is a far weaker
obligation than being correct.

**Why:** Big-N statistical tests feel like strong evidence, so they suppress the instinct to ask
"what else satisfies this?" The tightness of the band is irrelevant when the cheat sits inside it
by construction.

**What to do instead:** For any aggregate assertion, ask what the _weakest_ implementation
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
_bindings_ literally named `eval` and `Function`; they do not follow aliasing, computed member
access, or reflection. Adding `no-restricted-globals: Function` and
`no-restricted-properties: Reflect.construct` raised it to 6 of 8. The last two —
`globalThis['ev'+'al']` and `Object.getPrototypeOf(function(){}).constructor` — are not reachable
by static lint at all.

**Why:** Both defences check _how the threat is written_. The threat is defined by _what happens
at runtime_, and the set of ways to spell it is open. Any enumeration of spellings is a
denylist, and a denylist for an open set is a false sense of safety — worse than none, because it
gets cited as the authoritative guard (this ticket's own AC text did exactly that).

**What to do instead:** Guard the behaviour. Poison every runtime route to the capability before
importing the module under test — for code construction that is `globalThis.Function`,
`globalThis.eval`, `Reflect.construct` called with `Function`, and the `constructor` getter on
`Function.prototype` — then assert no route is reached while the module still returns correct
results. Static checks stay as cheap secondary defence, never as the authority. Generally: when a
requirement is "X never happens", the test must make X _observable_, not make its common
spellings unwriteable.

---

## L-014 — Verify the cheat is a real cheat before trusting that the guard beat it (Phase 2)

**Pattern:** While proving a new test closed a hole, a Test Agent built the cheat it was meant to
catch — an evaluator resolving calls via `Math[name]` — and the suite reported **282/282
passing**. The natural read is "my guard already handles this". The truth was that the cheat was
incomplete: only the static type pass had been patched, so the evaluator still rejected `sqrt`
downstream and the cheat never actually exposed anything. Rebuilt properly, and independently
proven to expose `sqrt(9)=3`, `round(7/2)=4`, `pow(2,10)=1024` via a throwaway probe **before**
re-running the suite, it failed 22 tests.

**Why:** A cheat that does not cheat produces a green run indistinguishable from a guard that
works. The mutation-testing method (L-011) assumes the mutant is live; if it is dead on arrival,
the method silently inverts and manufactures false confidence — the very failure mode it exists
to prevent.

**What to do instead:** Before concluding a guard caught a cheat, prove the cheat is real on its
own terms — demonstrate the capability it was supposed to smuggle in, with a direct probe,
independently of the suite under test. Only then does the suite's verdict mean anything. This is
[[L-001]] applied to the mutant instead of the guard: never trust an unobserved failure OR an
unobserved success.

---

## L-015 — "Unreachable" is a claim that needs a probe, not an argument (Phase 4)

**Pattern:** Twice in one ticket, a plausible reachability argument was wrong.

1. An implementer described a code path as "practically unreachable". A reviewer measured it:
   the path threw for **37 of 50 seeds** on a legal input.
2. A reviewer then proved a _different_ path unreachable with a clean argument (two accumulators
   summing in the same order are bit-identical, and `nextFloat < 1` forces `target < total`).
   On re-review it disproved its own proof: finite weights can sum to `Infinity` by overflow, and
   at the denormal floor rounding is **absolute** rather than relative, so `f × total` can round
   up to exactly `total`. Measured: 3000/3000 and 1496/3000.

**Why:** Reachability arguments are about the _whole input domain_, and the interesting inputs
live at the boundaries — overflow, denormals, `undefined` elements, empty collections. Reasoning
about "normal" inputs and generalising is the default failure. Floating point is especially
hostile: relative-error intuitions silently break at the denormal floor.

**What to do instead:** Treat "this cannot happen" as a testable claim. Write the probe that
tries to make it happen, sweeping the degenerate end of the domain. If the probe cannot reach it,
say so with the probe attached. And when a path is unreachable only for _your current callers_,
write that — not "impossible" — because the caller set changes and the comment does not.

---

## L-016 — A source-text ban can fail a correct implementation on its naming (Phase 3)

**Pattern:** T-002's AC-1 scans the source for the substring `Function(`. A correct,
codegen-free implementation went red on it — because it had named its helpers
`resolveFunction(` and `applyWhitelistedFunction(`. Nothing was wrong with the code; the ban
matched an ordinary identifier that happened to contain the forbidden spelling.

**Why:** Text-level bans do not know about syntax. Their false-positive surface is every
identifier, comment, and string that shares a substring with the thing being banned — and the
failure arrives as "you violated the security rule", which is exactly the message most likely to
send someone hunting for a vulnerability that does not exist, or worse, to weaken the check.

**What to do instead:** Keep text scans as cheap secondary defence, but say so in the criterion,
and warn the implementer in the dispatch that the ban is **literal** — describe the prohibition
behaviourally ("no dynamic code construction") and never by spelling the banned token, so nobody
names a helper into a false failure. Where the property genuinely matters, the authoritative
guard must be behavioural ([[L-013]]). A guard whose failure mode is "rename your function" is
not measuring what it claims to measure.

---

## L-017 — Cover dimensions, not cases (Phase 4)

**Pattern:** T-002 reached 296 tests across 24 criteria and survived three independent review
passes. Then a code review and a security review, working separately, found three defects — one
Critical — that all lived on axes **nothing had ever varied**:

| Axis                     | What every test used  | What broke                                                                                                      |
| ------------------------ | --------------------- | --------------------------------------------------------------------------------------------------------------- |
| Expression length        | short expressions     | a 4,000-term chain overflowed the stack, escaping as `RangeError` rather than the module's `ExprError` contract |
| Literal magnitude        | small numbers         | `"9"×309` → `Infinity`; `"9"×400 - "9"×400` → `NaN`                                                             |
| Environment value domain | small finite integers | `{a: Infinity}` → an infinite loop in `gcd`, unrecoverable                                                      |

A fourth route surfaced only when a Test Agent went looking: `gcd(a * a, 2)` with `{a: 1e200}`,
where the argument is finite **in the environment and as a literal** and becomes non-finite only
mid-evaluation. A guard at the input boundaries alone would not have caught it.

**Why:** Tests are written case by case, and cases cluster around the shapes the author is
picturing. Adding more cases in the same cluster raises the count without widening coverage.
Every review had checked whether _behaviours_ were covered; none had asked which _input
dimensions_ were being held constant. The implementer's own 36,792-call probe passed its "no
non-`ExprError` escaped" assertion **vacuously** — nothing in the corpus was long enough to
overflow.

**What to do instead:** Before freezing, enumerate the input **dimensions** — length, magnitude,
sign, cardinality, nesting shape, value domain of every injected input — and confirm each is
varied to its extreme, not merely represented. Where a value can be transformed mid-computation,
check the _intermediate_ domain too, not only the boundaries. And treat a passing assertion over
an unswept domain as no evidence at all.

---

## L-018 — A criterion that defers its own effect size defers it past the freeze (Phase 2)

**Pattern:** T-004 pinned `QUALITY_WEIGHT` as `0 < w <= 1` and explicitly deferred the effect size
to T-008 AC-16 — a ticket two waves later. But `tuning.ts` **freezes in wave 2**. By the time
T-008's criterion existed, the constant it constrains would already be immovable, so a value of
`0.001` would have satisfied every criterion in force at freeze time while making speed-aimed
damage — the game's stated pedagogical core — statistically invisible.

The Test Agent closed it by deriving the bound in closed form from T-008's own published formula
(`QUALITY_WEIGHT > 7/12`, set by the widest-range cannons) and asserting it in wave 2, where the
constant actually freezes. Mutation confirmed the test bites exactly at that boundary and not
before: `0.5834` passes, `0.55` and `0.001` die.

**Why:** "A later ticket will constrain this" is only true if the later ticket can still change
the artefact. Once a value is frozen, every constraint on it must already exist — a deferred
constraint is not deferred, it is discarded.

**What to do instead:** When a criterion defers a bound to a downstream ticket, check which
artefact freezes first. If **this** one does, the bound must be derived and asserted **now**,
using the downstream ticket's own stated formula so the two cannot disagree. Deferral is only
legitimate when the constrained artefact is still editable at the point the constraint arrives.

---

## L-019 — An orchestrator claim about existing artefacts is a claim, not a fact (Phase 2)

**Pattern:** A ticket I wrote stated that the frozen test suite "currently asserts that a
4-distractor template parses successfully", and on that basis **granted the Test Agent permission
to edit a frozen test** — normally the most tightly guarded action in the system. The claim was
false. It came from an integration report that had verified the _behaviour_ with an ad-hoc probe
script, and I transcribed it as if the behaviour were encoded in a test.

The Test Agent grepped every occurrence of the term across all four historical revisions of the
file, found no such assertion had ever existed, and made a purely additive change instead — 90
pre-existing assertions untouched.

**Why this is worse than an ordinary mistake:** the false claim came bundled with an
authorisation. A less careful agent would have gone looking for something to invert, "found" the
nearest plausible assertion, and damaged a frozen contract with the orchestrator's blessing. The
guard hook does not help here — the edit was explicitly permitted.

**What to do instead:** Any dispatch asserting that an artefact already contains something —
especially one that unlocks a normally-forbidden action — must either carry the evidence
(file:line, the quoted assertion) or instruct the agent to verify the claim before acting and to
stop if it does not hold. Distinguish "this behaviour was observed" from "this behaviour is
encoded in a test"; those come from different sources and only one of them is a file you can
point at. And the narrower rule: **never pair an unverified claim with an authorisation** —
verify first, then authorise, or make the authorisation conditional on the agent's own check.

---

## L-020 — A test can pass for the wrong reason when two orderings coincide (Phase 2)

**Pattern:** T-009's `CHEST_RARITY_ENTRIES` must be built in the order of T-003's `CHEST_RARITIES`
array, **not** from `Object.entries(CHEST_RARITY_WEIGHTS)` — object key order is an implementation
detail, not a contract. The Test Agent wrote the obvious static assertion, then noticed it passed
against an `Object.entries`-based implementation too: `tuning.ts`'s record happens to declare its
keys in the same order as `CHEST_RARITIES`.

The assertion was **true but vacuous**. It could not distinguish the correct implementation from
the one it existed to forbid. Only a test that _reorders the source record_ (via module mocking)
gives the guarantee teeth — and the agent confirmed the plain test's false pass first, before
trusting the mocked test's catch.

**Why:** When two independent orderings coincide today, any test comparing one to the other passes
regardless of which the implementation actually reads. Nothing signals this — the test is green,
the code is correct, and the guarantee is absent. It surfaces later, when someone reorders a
record for readability and a downstream weighted draw silently mis-weights.

**What to do instead:** When a test asserts that A is derived from B, ask whether A and B currently
agree by _coincidence_. If they do, the test proves nothing until you perturb one of them. Mock the
source into a different order, or construct a fixture where the two orderings genuinely differ.
The general rule: **a test whose subject and expectation happen to agree today is measuring the
coincidence, not the contract.**

---

## L-021 — A derived bound must be measured against the real assertion, not the formula it came from (Phase 3)

**Pattern:** L-018 established that when a constant freezes before its consumer, the consumer's
bound must be derived and asserted **now**. That was done for `QUALITY_WEIGHT`: the bound
`> 7/12 ≈ 0.5833` was derived in closed form from T-008's published damage formula and frozen in
wave 2.

The derivation was wrong. It dropped the `ceil` in `lower = min(ceil(lowerRaw), damageMax)` — and
that rounding is exactly what discretises the effect the criterion measures. When T-008's Test
Agent ran candidate values against the **actual** AC-16 assertion, `0.5834` failed and the true
threshold was `0.6`. The shipped `0.7` clears both, so nothing broke; but a later retune to `0.6`
would have passed the guard and failed the consumer — reintroducing precisely the split-brain
L-018 exists to prevent.

**Why:** deriving from a formula is modelling, and a model omits whatever the modeller did not
notice — here, an integer rounding step that looks incidental and is not. The derived bound then
carries the authority of arithmetic while encoding an approximation.

**What to do instead:** treat a derived bound as a **hypothesis to test**, not a result. Once the
consumer's assertion exists, run candidate values through it and find the empirical bite point;
where they disagree, the assertion wins. And when deriving before the consumer exists, prefer a
bound with visible margin over a tight closed-form one — an approximation with slack is safe,
an approximation at the knife edge is not.

---

## L-022 — A dispatch that restates a ticket's contract can drift from it (Phase 2)

**Pattern:** T-005's ticket says plainly: _"the module takes no `Rng` parameter at all"_, and AC-10
requires it to consume no randomness. My dispatch brief, written to be helpful, restated the
contract as _"same seed + same answer → same distractor set, `Rng` threaded"_ — the opposite. The
Test Agent followed the **ticket**, which is correct, and flagged the contradiction rather than
silently choosing.

The same brief also asserted that `Math.random()` is lint-banned in the tests. It is not — that
rule is scoped to `src/engine/**` and `src/content/**`. The agent proved purity **behaviourally**
by poisoning `Math.random` instead of relying on a guard I had wrongly claimed existed.

**Why:** a dispatch is written from memory of the ticket, and memory paraphrases. The paraphrase
then arrives carrying the orchestrator's authority, which is exactly the weight needed to talk a
careful agent out of the real contract. This is [[L-019]]'s shape — an unverified claim delivered
with authority — appearing in the routine case rather than the dramatic one.

**What to do instead:** dispatches should **point at** contracts, not restate them: "the signature
is in the ticket's DoD — follow it." Reserve restating for things the ticket does _not_ say, which
is where a dispatch adds value. And never assert that a guard exists without checking its scope —
if the brief claims a lint rule covers something, verify the rule's `files` glob first.

---

## L-023 — The frozen-test guard has a bash-shaped hole; gate the outcome instead (Phase 3)

**Pattern:** The PreToolUse hook blocks `Write`/`Edit` under `__tests__/` during the implement
phase. It does not see a shell write. Both the T-008 implementer and I independently copied a
scratch probe into `__tests__/` with `cp` to borrow vitest's alias resolution — the hook never
fired for either of us. It is a natural workflow, not an exotic bypass.

**Why:** a hook intercepts _tool calls_, so its coverage is the set of tools it matches. Anything
that reaches the filesystem another way is outside it. Per [[L-007]], a guard's real coverage is
what it has been observed blocking — and shell writes were never in that set.

**What to do instead:** guard the **outcome**, not the mechanism. `run-local-gates.sh` now carries
a `frozen-tests-unmodified` gate: during the implement phase, any committed change under
`__tests__/` that did not come from a `test(...)` or `style(...)` commit fails the run. That
catches the result regardless of how the write happened, and it does not depend on the orchestrator
remembering to inspect each commit.

---

## L-024 — A test file's type errors can hide until the module exists (Phase 3)

**Pattern:** T-012's frozen suite passed `tsc --noEmit` in the RED state — the only errors were the
expected `TS2307` for the absent module. Once the implementation landed, **five `TS2532` errors and
an unused-import error appeared in the test file**, and the implementer was correctly blocked: it
could not fix a frozen file, and the gate could not go green.

The cause is structural. While the module is missing, its imports resolve to `any`, so
`noUncheckedIndexedAccess` has nothing to narrow and `sequence[i].tier` typechecks fine. The moment
real types exist, the same line is `T | undefined`. **The RED-state typecheck cannot see this class
of error, by construction.**

**What to do instead:** the L-011 probe already builds a throwaway reference implementation to
prove the suite is satisfiable — **run `tsc --noEmit` against that probe too, not just `vitest`.**
That is the only moment before freezing when the test file is typechecked against real types. Add
it to the Test Agent's verification list: green vitest _and_ clean tsc against the reference, or
the suite is not ready to freeze.

---

## L-025 — Worktrees go stale on the lessons file too, and dispatches cite it by number (Phase 3)

**Pattern:** The T-005 implementer reported that `LESSONS.md` L-022 "does not exist" — its copy
ended at L-021. It was right about what it could see. I had appended L-022 and rebased the six
worktrees **in the same command**, with the rebase running before the commit, so every worktree
carried a lessons file one entry short.

This is [[L-008]] wearing different clothes. There I checked ticket freshness after creating
worktrees; I never thought to check the lessons file, because it reads like ambient documentation
rather than a contract.

**Why it matters:** dispatch briefs cite lessons **by number** — "per L-014, prove the mutant is
live". A stale lessons file turns a specific instruction into a dangling reference, and an agent
that follows it either guesses or, as here, correctly stops and asks. The failure is silent from
the orchestrator's side: the number resolves fine in my copy.

**What to do instead:** treat `LESSONS.md` as a dispatched artefact with the same freshness
requirement as the ticket. Commit lessons **before** rebasing worktrees, never in the same
command, and verify the file hash alongside the ticket hash in the pre-dispatch check. If a brief
cites a lesson number, that number must resolve in the agent's worktree, not only in mine.

---

## L-026 — An acceptance criterion the gate cannot parse is not a criterion (Phase 4)

**Pattern:** I amended three tickets with seven new criteria, writing them as
`**AC-15 (new): the thing must hold.**`. `spec-lint.sh` extracts criteria with
`grep -oE '\*\*AC-[0-9]+\*\*'`, which requires the closing `**` immediately after the number. My
format put it after the parenthetical, so **all seven were invisible to the gate**. Spec-lint would
have reported the ticket fully covered while enforcing nothing for them, and a Test Agent reading
the gate's output rather than the prose could reasonably have skipped them.

I caught it only because a routine pre-dispatch check printed an AC count that disagreed with what
I had just written — 14 where I expected 17.

**Why:** a criterion has two audiences, a human and a parser, and prose formatting satisfies only
the first. The failure is silent in the worst direction: the gate reports **green**, because from
its perspective every criterion it can see is covered.

**What to do instead:** after amending a ticket, re-run `spec-lint` and confirm the **count** rose
by exactly the number of criteria added. Never trust that a hand-written criterion parsed — count
it. More generally: when a gate extracts structure from prose, any edit to that prose is an edit to
the gate's input, and needs the same verification as an edit to the gate itself.
