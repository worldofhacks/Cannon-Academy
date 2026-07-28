# T-007 — Test Agent Report

**Ticket:** T-007 — Question generator: template selection, rejection sampling, render, four-choice assembly
**Branch:** `ticket/T-007-question-generator` (worktree `.worktrees/wt-T-007`, branched from `swarm/engine-core` @ `ce51e71`)
**Phase:** `tests` · **Date:** 2026-07-28
**Test file:** `__tests__/engine/questions/generator.test.ts` (the only file under `__tests__/` touched)

---

## 1. Status

**`DONE_WITH_CONCERNS`**

The suite is complete, RED for the right reason, and every gate except the deliberately-missing module
is green. The concerns are all **spec** concerns, not test concerns: six ambiguities, two of which are
load-bearing for T-024 duel replay and had to be pinned from the ticket's own step ordering because no
acceptance criterion covers them. They are listed as proposed amendments in §6. Nothing blocked me.

### Pre-flight verification

| Check                                                     | Result                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------- |
| Baseline test count in this worktree                      | **1229 passed / 13 files** — matches the brief                 |
| `tickets/T-007.md` identical to `swarm/engine-core`        | yes (`git diff` empty; sha1 `0ef408a1…`) — L-008              |
| `.tdd-swarm/LESSONS.md` identical to `swarm/engine-core`   | yes (sha1 `4c6ed468…`), L-030 is the last entry — L-025       |
| `.tdd-swarm/phase` / `active-ticket`                       | `tests` / `T-007` — guard engaged for this unit               |
| `src/engine/questions/generator.ts`                        | **does not exist** (`ls src/engine/questions/` → `distractors.ts expr.ts types.ts`) |

> **Environment note for the orchestrator.** My shell tool's `working_directory` parameter was silently
> ignored and every command landed in the repo root (`/Math Game`) rather than the worktree — `pwd`
> reported the root while `git branch --show-current` reported `swarm/engine-core`. My first "baseline"
> measurement was therefore taken in the wrong unit, where **no phase file exists and the guard is
> inert**. I caught it by checking `.tdd-swarm/phase` and finding it absent, then re-ran everything
> behind an explicit `cd` into the worktree. This is L-027 in a new place: a measurement taken in the
> wrong directory reads exactly like one taken in the right directory. Worth adding to the dispatch
> checklist — an agent should assert `git branch --show-current` matches its ticket branch before
> trusting any number, and the guard should arguably not be inert in the root while worktrees are engaged.

---

## 2. Coverage table

Every criterion resolves in both directions (`.tdd-swarm/spec-lint.sh tickets/T-007.md` → `SPEC-LINT PASS`).
"Passes wrongly if" names what would have to be true for the test to be satisfied by a wrong generator.

| AC        | Tests (`spec(T-007:AC-n)`)                                                                                                                                                                                                   | Passes wrongly if…                                                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AC-1**  | 6: 50 identical calls; JSON round trip over 14 templates × 14 seeds; **composed-primitive equality** (single-template and 8-template pools × 4 histories); `Math.random` poisoned; input arrays not mutated                    | `composeExpected` itself misreads the ticket's seven steps (the suite's single biggest dependency — see §8.4). Purity could still hide a `globalThis` cache that is keyed on the input.    |
| **AC-2**  | 4: pool-size premise; two 200-long `templateId` sequences differ; every template reached in each sequence; per-position disagreement ≥ closed-form floor over 40 seed pairs                                                    | The generator is seed-sensitive but biased in a way that keeps the disagreement rate near 7/8 — e.g. a permuted-but-uniform selection. Rate alone cannot see that; the oracle can.        |
| **AC-3**  | 4: 500 calls with a growing history, no served id inside the window; every template still reachable; **eligible set is exactly `pool.slice(w)`**; ids at position ≥ w stay reachable                                            | `RECENT_TEMPLATE_WINDOW` is hardcoded to the literal `5` rather than imported (black-box-invisible; see §8.1).                                                                            |
| **AC-4**  | 3: single-template pool with that id recent; 3-template pool all recent → all three reachable over 400 seeds; history longer than the window                                                                                  | The fallback reaches every template but by a different rule than "the unfiltered pool" — e.g. re-filtering on a different window. Caught by AC-1's composition, not by AC-4.              |
| **AC-5**  | 2: empty pool → `NO_TEMPLATE`; same for three shapes of history                                                                                                                                                              | The implementation throws `NO_TEMPLATE` from somewhere else too (over-eager). Nothing here bounds that; AC-4 partly does.                                                                 |
| **AC-6**  | 5: constraint is load-bearing (45 of 81 pairs); 1,000 draws all in range and satisfying; satisfying region covered (≥ 42 of 45 pairs); **every constraint evaluated, not just `constraints[0]`**; **lexicographic key order**  | A generator that samples correctly but reports different values in `Question.params` than it used for the answer — excluded separately by AC-12's answer check.                            |
| **AC-7**  | 3: ticket fixture throws with the id in the message; throws for all 14 sweep seeds; **bound is exactly `MAX_PARAM_SAMPLE_ATTEMPTS`** via two run-time-located boundary seeds                                                    | The intended attempt-count convention is "1 + 100 retries" rather than "100 total" — a real ambiguity, see §6 A-3. Also passes wrongly if the bound literal happens to equal 100.          |
| **AC-8**  | 3: fixture genuinely omits the key; 500 draws in range with **both range endpoints observed**; empty-array variant succeeds                                                                                                    | The generator special-cases the absent key but mishandles `constraints: []`, or vice versa — both are covered, so this is narrow.                                                         |
| **AC-9**  | 2: `a === 4` for all sweep seeds; **returned `Rng` equals exactly one attempt's worth of draws** (plus a two-attempt counter-check proving the assertion discriminates)                                                        | The draw count coincides with one attempt by accident, e.g. a shuffle consuming a different number of draws that happens to total the same. `shuffle` is frozen, so this cannot happen.    |
| **AC-10** | 5: exact `"3 + 5 = ?"`; repeated token replaced everywhere; no brace survives across the whole dimension sweep; unused declared parameter still sampled and reported; token-free text unchanged                                | The substitution is right but the value formatting differs for a value shape no fixture reaches (very large, negative zero). Sweep includes negative and non-integer answers.              |
| **AC-11** | 4: undeclared token → `INVALID_QUESTION` with the id; four stray-brace shapes; throws for every sweep seed; **a fully-declared braced text is NOT rejected**                                                                   | The generator rejects on a pre-substitution scan that happens to agree with the post-substitution one for all four stray shapes. The negative case above is the guard against that.        |
| **AC-12** | 4: `CHOICE_COUNT === 4` premise; full invariant sweep (length, `correctIndex` integer and in range, answer at `correctIndex`, pairwise-distinct, `label === String(value)`, finite, `templateId`, `skill`); T-003 `assertQuestion` accepts; **the three wrong values are exactly what `buildDistractors` returns** | The generator produces the right four values in an order that no test constrains — pinned only by AC-13's permutation coverage and AC-1's composition.                                     |
| **AC-13** | 2: slot histogram inside `[350, 650]`; **all 4! = 24 orderings of the four choice values reached**, with a premise assertion that the value set is constant across seeds                                                        | The shuffle reaches all 24 orderings with a non-uniform distribution the ±7.75σ band cannot see (see §6 A-7). Uniformity beyond the band is not pinned.                                    |
| **AC-14** | 4: returned state differs from input; **chained call's returned `Rng` differs from the first's** (exact, seed-independent); chained call equals the composed continuation; chained parameter repeats ≤ derived ceiling          | The stream advances by the wrong number of draws in a way the composition happens to match — impossible, composition counts every draw.                                                    |
| **AC-15** | 3: absent-key fixture premise; five flag combinations via `Object.is`; absent → `false`, key present, `undefined` excluded, JSON round trip preserves both keys                                                                | Nothing material — `Object.is` plus the round trip closes the `undefined`/`false`/missing-key trio.                                                                                       |
| **AC-16** | 3: the fixture is **proven** to starve T-005 by calling `buildDistractors` directly first; the propagated error's `code`, `name` **and message** are byte-identical; propagates for every sweep seed                            | Nothing material. But the precondition is only reachable at float saturation — see §6 A-6.                                                                                                |

---

## 3. Counts

| Metric                                  | Value                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------- |
| Tests in the file                       | **57**                                                                    |
| `spec(T-007:AC-n)` tags                 | **57** (one per test; 16 of 16 criteria covered, both directions)          |
| `expect(` call sites                    | **123** — many inside sweeps, so far more assertions execute per run       |
| Largest sweeps                          | 2,000-seed shuffle sweep (×2), 1,000-question rejection sweeps (×3), 500-call recency sweeps (×2), 400-seed eligibility sweeps (×3), 14 templates × 14 seeds composition sweep |
| Runtime of the file against a reference | ~150 ms                                                                   |
| Commit                                  | `2af1a7f` — `test(T-007): frozen suite for the question generator`        |

---

## 4. RED evidence

`npx vitest run` from the worktree root, scratchpad deleted:

```
 FAIL  __tests__/engine/questions/generator.test.ts [ __tests__/engine/questions/generator.test.ts ]
Error: Cannot find module '@engine/questions/generator' imported from
'/Users/quietguy/Documents/Dev/Gauntlet/Math Game/.worktrees/wt-T-007/__tests__/engine/questions/generator.test.ts'.
 ❯ __tests__/engine/questions/generator.test.ts:52:1
     52| import { generateQuestion as generateQuestionUnderTest } from '@engine…
       | ^

 Test Files  1 failed | 13 passed (14)
      Tests  1229 passed (1229)
```

`npx tsc --noEmit`:

```
__tests__/engine/questions/generator.test.ts(52,63): error TS2307: Cannot find module '@engine/questions/generator' or its corresponding type declarations.
```

**Why this is the right reason.** The failure is a module-resolution failure at the import of the module
this ticket exists to create, and it is the *only* failure: the file is one `FAIL`ing suite, not one
failing assertion, so nothing inside it ran. The other 1229 tests still pass — the baseline is untouched.
`tsc` reports exactly one error, `TS2307`, for the same import and nothing else.

### The RED-state typecheck was initially lying, and I fixed it

My first `tsc` run in the RED state reported the expected `TS2307` **plus eight `TS7006`
"implicitly has an `any` type" errors**. Cause: an unresolved module imports as `any`, so
`question.choices.map((choice) => …)` infers `choice: any` and trips `noImplicitAny`. This is the
mirror image of L-024 — that lesson is about type errors that *appear* once the module lands; this is
about errors the missing module *manufactures*, which would have handed the implementer a file that
could not pass `tsc` until it wrote code, with no way to tell my noise from its own.

Fix: the import is aliased and immediately assigned to an explicitly annotated const:

```ts
const generateQuestion: (input: GeneratorInput) => readonly [Question, Rng] = generateQuestionUnderTest;
```

This does double duty. In the RED state it gives every call site a real type, so the only `tsc` error
is the missing module. Once the module exists, the assignment becomes a **compile-time assertion on the
signature** the ticket's Context section declares — a generator with a different parameter or return
shape fails to assign.

### Gate results (RED state, real exit codes)

| Gate                            | Exit | Notes                                                      |
| ------------------------------- | ---- | ---------------------------------------------------------- |
| `npx prettier --check .`         | 0    | clean                                                      |
| `npx eslint . --max-warnings 0`  | 0    | clean                                                      |
| `npx tsc --noEmit`               | 2    | one `TS2307` for the absent module — expected and the point |
| `npx vitest run`                 | 1    | one failed suite (absent module); **1229 other tests pass** |
| `.tdd-swarm/spec-lint.sh`        | 0    | `SPEC-LINT PASS`, all 16 criteria, both directions          |

---

## 5. Cheat matrix

Built per L-011 in `scratchpad/t007/` (namespaced per L-028; **deleted before commit**). One
parameterised implementation, `mutable.ts`, selected by `T007_MUTANT`, so every mutant runs identical
plumbing and a plumbing fault cannot masquerade as a survivor. The runner **aborts** if the output does
not mention `generator.test.ts`, rather than scoring a startup failure as "survived".

**Harness proven live before any verdict was trusted (L-014, L-028), three ways:**

1. Candidate replaced with a stub throwing `HARNESS-LIVENESS-SENTINEL` → the sentinel appears in the
   frozen suite's failure output (48 failed / 8 passed; the 8 survivors are the premise tests that never
   call the generator, which is exactly right).
2. A composed value was dumped through the same alias so the harness is provably producing real output,
   not a cached or empty run:
   `{"templateId":"dump","skill":"add_within_10","text":"5 + 4 = ?","params":{"a":5,"b":4},"choices":[{"value":8,"label":"8"},{"value":10,"label":"10"},{"value":9,"label":"9"},{"value":11,"label":"11"}],"correctIndex":2,"isWordProblem":false,"readAloud":false}`
   with returned `Rng` `{"state":2419721014}` from input state `20260728`. Note the answer `9` sits at
   index 2 and the four values are a genuine permutation, so the shuffle is demonstrably running.
3. The kill profile is **varied, not uniform**: kill counts range 1–38, and eight mutants are killed by
   exactly one criterion. A uniform matrix would have been treated as a harness fault.

**Reference implementation: 57/57 green. All 38 mutants killed. `tsc` against the reference: exit 0
(L-024 — the frozen file typechecks against real types, so no hidden error is waiting for the implementer).**

| Mutant                         | What it does                                                          | Caught | Killed by                                          |
| ------------------------------ | --------------------------------------------------------------------- | ------ | -------------------------------------------------- |
| `M01-no-recency`               | ignores `recentTemplateIds` entirely                                  | yes    | **AC-3**, AC-1                                     |
| `M02-whole-history`            | filters against the whole history, not the first `w`                  | yes    | **AC-3**, AC-1                                     |
| `M03-window-minus-one`         | window `w - 1`                                                        | yes    | **AC-3**, AC-1                                     |
| `M04-window-plus-one`          | window `w + 1`                                                        | yes    | **AC-3**, AC-1                                     |
| `M11-window-hardcoded`         | window literal `3` instead of the tuning constant                     | yes    | **AC-3**, AC-1                                     |
| `M40-window-from-wrong-end`    | `slice(-w)` — reads the OLDEST `w` entries ("most-recent-first" slip)  | yes    | **AC-3**, AC-1                                     |
| `M05-fallback-first-only`      | on an empty eligible pool falls back to `templates[0]`                | yes    | **AC-4 only**                                      |
| `M06-no-empty-check`           | drops the `NO_TEMPLATE` guard (lets `pick` throw `RangeError`)        | yes    | **AC-5 only**                                      |
| `M07-insertion-order`          | `Object.keys(params)` without `.sort()`                               | yes    | **AC-6**, AC-1                                     |
| `M08-descending-order`         | sorts keys descending                                                 | yes    | **AC-6**, AC-1, AC-14                              |
| `M09-bound-minus-one`          | attempt bound `MAX - 1`                                               | yes    | **AC-7 only**                                      |
| `M10-bound-plus-one`           | attempt bound `MAX + 1`                                               | yes    | **AC-7 only**                                      |
| `M12-bound-hardcoded-50`       | attempt bound literal `50`                                            | yes    | **AC-7 only**                                      |
| `M13-ignore-constraints`       | never evaluates constraints                                           | yes    | **AC-6**, AC-7, AC-1                               |
| `M14-first-constraint-only`    | evaluates `constraints[0]` and stops                                  | yes    | **AC-6**, AC-1                                     |
| `M15-clamp-instead-of-retry`   | accepts the first draw instead of re-sampling                         | yes    | **AC-6**, AC-7, AC-1                               |
| `M16-no-shuffle`               | never shuffles; `correctIndex` from the built order                   | yes    | **AC-13**, AC-9, AC-14, AC-1                       |
| `M17-slot-swap`                | one `nextInt` slot draw, distractors left in declared order           | yes    | **AC-13**, AC-9, AC-14, AC-1                       |
| `M18-sort-choices`             | shuffles, then sorts the choices ascending                            | yes    | **AC-13**, AC-14, AC-1                             |
| `M22-correct-index-preshuffle` | shuffles correctly but reports the pre-shuffle index                  | yes    | **AC-12**, AC-13, AC-14, AC-1                      |
| `M23-math-random-shuffle`      | orders the choices with `Math.random()`                               | yes    | **AC-1** (poisoning), AC-14                        |
| `M19-replace-first-only`       | non-global token substitution                                         | yes    | **AC-10**, AC-11, AC-12, AC-6, AC-8, AC-14, AC-1   |
| `M20-no-brace-check`           | skips the surviving-brace check                                       | yes    | **AC-11 only**                                     |
| `M21-blanket-brace-reject`     | rejects any text containing a brace at all                            | yes    | 12 criteria (AC-1…AC-14)                           |
| `M24-empty-label`              | `label: ''`                                                           | yes    | **AC-12**, AC-1, AC-14                             |
| `M25-padded-label`             | `label: \`${value} \``                                                | yes    | **AC-12**, AC-1, AC-14                             |
| `M26-skill-hardcoded`          | `skill: 'add_within_10'` regardless of the template                   | yes    | **AC-12**, AC-1, AC-14                             |
| `M27-template-id-hardcoded`    | always reports `templates[0].id`                                      | yes    | **AC-2**, AC-3, AC-4, AC-1                         |
| `M28-own-distractors`          | invents its own near-miss distractors instead of calling T-005        | yes    | **AC-12**, AC-16, AC-1                             |
| `M29-rewrap-distractor-error`  | catches the T-005 error and re-throws with a new message              | yes    | **AC-16 only**                                     |
| `M30-rng-not-advanced`         | returns the input `Rng`                                               | yes    | **AC-14**, AC-2, AC-3, AC-4, AC-6, AC-8, AC-9, AC-1 |
| `M31-sample-from-original-rng` | samples parameters from the pre-`pick` state                          | yes    | **AC-9**, AC-6, AC-7, AC-14, AC-1                  |
| `M32-rng-fixed-reset`          | returns `createRng(12345)`                                            | yes    | **AC-14**, AC-2, AC-3, AC-6, AC-8, AC-9, AC-1      |
| `M33-mutates-input`            | sorts the caller's `templates` array in place                         | yes    | **AC-1 only**                                      |
| `M34-distractors-first`        | pre-shuffle order `[...distractors, answer]`                          | yes    | **AC-1, AC-14 only** (both composition tests)      |
| `M35-flags-undefined`          | passes the optional flags through, so absent → `undefined`            | yes    | **AC-15**, AC-1, AC-14                             |
| `M36-flags-default-true`       | defaults both flags to `true`                                         | yes    | **AC-15**, AC-1, AC-14                             |
| `M37-extra-field`              | adds an undeclared `answerValue` field to the `Question`              | yes    | **AC-1, AC-14** (`toStrictEqual`)                  |

### Two findings from the matrix, both acted on

**`M14-first-constraint-only` initially died on AC-1 alone.** The composed-oracle test caught it; no
behavioural test did, because AC-6's fixture carries a single constraint and a one-constraint sweep
cannot distinguish "evaluate every entry" from "evaluate `constraints[0]`". Overlap, not
discrimination. I added a two-constraint fixture and a test that first proves the premise — there are
draws satisfying the first constraint and failing the second — then sweeps 1,000 generations. M14 now
dies on AC-6 independently.

**`M33-mutates-input` initially SURVIVED (57/57).** Per L-014 that is a dead mutant, not a clean suite.
The mutant sorts `input.templates` by id — and `POOL`'s ids are `t1…t8`, already in sort order, so the
sort was a no-op. Exactly the L-020 shape: my test's subject and expectation agreed by coincidence, so
the test measured the coincidence. Fixed by passing the pool **reversed**, with two assertions that the
inputs really are non-sorted so the fixture cannot silently drift back. M33 now dies.

Both fixes changed the test file, so **the whole matrix and the reference run were re-measured
afterwards** rather than cited from the earlier state (L-027). Every number in this section comes from
the final run against the committed file.

---

## 6. Ambiguities and proposed ticket amendments

I found six. Two are load-bearing for replay determinism.

### A-1 — AC-14's literal claim is false for legal inputs (**proposed amendment: rewrite**)

> "…feeding the returned `Rng` back in produces a **different parameter draw** than the first call"

Two consecutive draws from the same template can legally coincide, so this cannot hold for "any
successful call". Measured, not argued:

| Template shape           | Collision probability | Repeats over 500 seeds (measured) | Theory |
| ------------------------ | --------------------- | --------------------------------- | ------ |
| one parameter, `[1, 9]`  | 1/9 = 0.111           | **63 / 500** (12.6 %)              | 55.6   |
| two parameters, `[1, 12]`| 1/144 = 0.0069        | **4 / 500** (0.8 %)                | 3.47   |

A per-call assertion of AC-14 as written would flake on roughly one seed in eight for a K-1 shaped
template. I tested the **sound** rendering of the criterion's stated intent ("the PRNG stream advances
and is not reset") in four parts, three of which are exact and seed-independent:

1. `returned.state !== input.state`. Always true: mulberry32 advances state by `k · 0x6d2b79f5 mod 2³²`
   after `k` draws and `0x6d2b79f5` is odd, so the state can only return to itself after a multiple of
   `2³²` draws — a single call makes at most `1 + 100·|params| + 3`.
2. The `Rng` returned by a chained second call differs from the first call's. Exact; a reset scores 0/14.
3. The chained call's whole result equals the composed continuation of the stream — this is what kills
   an implementation that advances the returned `Rng` correctly while sampling from the original state
   (`M31`, which passes 1 and 2).
4. A rate ceiling on repeated parameter draws: `≤ ceil(500/144 + 20·sd)` where `sd = sqrt(500·(1/144)·(143/144)) = 1.86`.
   The discrimination is between ~3 and 500, not between 3 and 4.

**Proposed AC-14 text:** "…then its `state` differs from the input's, and the `Rng` returned by a second
call made with that returned `Rng` differs again — the stream advances and is not reset. (Two parameter
draws may legally coincide, so identity of the drawn parameters is not asserted per call.)"

### A-2 — the Algorithm section claims every step is an AC; two orderings have none (**proposed amendment: add an AC**)

The ticket says "**Algorithm, in order — each step is an AC below**". Two sub-requirements the algorithm
states or implies have no criterion, and **both change the question produced from a given seed**, so
T-024 replay depends on each:

**(a) Step 3's lexicographic parameter order.** Stated verbatim in the algorithm ("For each param key in
**lexicographically ascending order**") and justified at length in Planning Decisions, but no AC mentions
it. An `Object.keys()` insertion-order implementation satisfies AC-1 … AC-16 as literally written. Per
L-020 a fixture whose keys are already sorted cannot see the difference, so I test it with
`params: { b: [1, 100], a: [1000, 1100] }` — declared `b` first, disjoint ranges — and assert which draw
each name must receive, plus that the two readings genuinely disagree for ≥ 195 of 200 seeds so the
assertion is not vacuous. Tagged to **AC-6**, which is step 3's criterion.

**(b) Step 7's pre-shuffle order is unspecified.** "Build the four choices as `{ value, label }` … shuffle
with `shuffle(rng, choices)`" never says whether the array handed to `shuffle` is `[answer, ...distractors]`
or `[...distractors, answer]`. Both are "a shuffle of the four choices"; they produce **different**
questions from the same seed. I pinned `[answer, ...distractors]`, derived from the only evidence the
ticket offers — "Answer" is step 4 and "Distractors" is step 5. The signature of the gap shows in the
matrix: `M34-distractors-first` is killed **only** by the two composition tests, i.e. only because I
chose a reading, not because any criterion states one.

**Proposed new AC-17:** "Given a template declaring parameters in non-alphabetical order, when called,
then the parameter drawn first is the lexicographically smallest key; and the array passed to `shuffle`
is `[answer, ...distractors]` in that order, so a given seed reproduces a byte-identical `Question`."

### A-3 — "up to 100 attempts" has two readings and the difference is observable (**proposed amendment: state it**)

"Up to `MAX_PARAM_SAMPLE_ATTEMPTS` (100) attempts" could mean 100 attempts in total or one initial
sample plus 100 retries. ARCHITECTURE.md §4.1's "a template that fails **100 samples** throws" points at
100 total, which is the reading I froze. It is observable, so I did not leave it free — but if the
orchestrator intends 101, exactly one test needs amending.

Arithmetic, so the test is reproducible rather than a magic seed. With `params: { a: [1, 100] }` and
`constraints: ["a == 7"]`, each attempt succeeds with `p = 1/100`, so
`P(first success at attempt k) = (1 - p)^(k-1) · p`, maximised at `k = 1/p = 100`, giving
`0.99⁹⁹ × 0.01 ≈ 0.00370` — about 1 seed in 270. The test **searches at run time** for the two boundary
seeds rather than hardcoding them, so it tracks `MAX_PARAM_SAMPLE_ATTEMPTS` if that constant is retuned
instead of going stale against it (L-018/L-021). Measured: seed **244** first satisfies at attempt 100
(must succeed — a bound of 99 throws); seed **18** first satisfies at attempt 101 (must throw — a bound
of 101 succeeds). Together these pin the bound to exactly `MAX`. `M09`, `M10` and `M12` all die here and
nowhere else.

### A-4 — no AC covers `Question.skill`, `Question.templateId` or `Choice.label` (**proposed amendment: extend AC-12**)

`Question.skill` is a required `SkillId` whose only possible source is `template.skill`, and
`label = String(value)` appears only in Algorithm step 7. Neither is in any criterion, so a generator
hardcoding `skill: 'add_within_10'` or `label: ''` satisfies AC-1 … AC-16 as literally written. I
asserted all three inside AC-12's sweep; `M26`, `M24` and `M25` die there.

**Proposed AC-12 addition:** "…and `question.skill` equals `template.skill`, `question.templateId`
equals the selected template's `id`, and every `choices[i].label` equals `String(choices[i].value)`."

### A-5 — the Definition of Done is unsatisfiable for `NO_TEMPLATE` (**proposed amendment: carve it out**)

> "Every failure path throws a typed `QuestionGenerationError` with a `code` **and the template id**"

When the pool is empty there is no template id to name. I asserted the id for
`CONSTRAINTS_UNSATISFIED`, `INVALID_QUESTION` and `DISTRACTOR_FAILURE`, and only a non-empty message for
`NO_TEMPLATE`. Suggest: "…and the template id where one has been selected (`NO_TEMPLATE` excepted)."

### A-6 — AC-16's precondition is unreachable from realistic content (**observation, no amendment needed**)

Probed rather than argued (L-015). With `DISTRACTOR_ABS_FLOOR = 3` and `DISTRACTOR_MAX_RATIO = 2`,
T-005's nine-rung ladder yields at least three usable values for every answer at ordinary magnitudes —
the `+1 / +2 / +3` rungs are inside the absolute floor for any non-negative answer, and for a large
answer clause 4b admits anything within 2×. I could not starve it with integer, zero, negative,
half-integer or third answers.

The one reachable route is **float saturation**. At `answer = 2¹⁰²³ ≈ 8.988 × 10³⁰⁷` the ULP is ≈ 2⁹⁷¹, so
`answer ± 1`, `± 2`, `± 3` and `± 10` all round back onto the answer and are rejected as collisions,
while `answer × 2` overflows to `Infinity` and fails the finiteness clause. Measured directly:
`buildDistractors` reports `built 0, 12 candidates rejected`. (`2⁶⁰`, ULP 256, also starves — only
`answer × 2` survives, giving 1 of 3.) `Number.isInteger(2¹⁰²³)` is `true` and `templateSchema` accepts
it, so the fixture is schema-valid.

So AC-16 is genuinely testable and I test it, but a reviewer should know the fixture is deliberately
pathological and that `DISTRACTOR_FAILURE` is close to dead code for the real catalog — which is good
news for T-019, not a defect here.

### A-7 — AC-2 and AC-13 pin direction without magnitude (**observation; addressed in the suite**)

Both are the L-006 shape. AC-2's "the two sequences are not identical" is satisfied by an implementation
differing in **one** position out of 200, and by one that picks a single template per seed and repeats it
200 times — which deletes the template variety the recency window exists to serve. AC-13's band
`[350, 650]` over 2,000 trials is **±7.75 σ** (`σ = sqrt(2000 · 0.25 · 0.75) = 19.36`), so it certifies
almost nothing about the shuffle on its own, and is satisfied exactly by `M17-slot-swap`.

I did not weaken either criterion; I added discriminators alongside them (all-templates-reached, a
closed-form disagreement floor of `7/8 − 6σ = 0.7347` against a measured worst case of 0.83 over 60 seed
pairs, and full 4! ordering coverage). Reference histogram, for the record: `[509, 515, 518, 458]`.
Suggest stating the effect size in AC-2's text so a future reader does not read "not identical" as the
whole requirement.

**I invented no number the source documents do not specify.** Every threshold is imported from
`@engine/tuning`, quoted from an AC, or derived in closed form with the derivation written into the test.

---

## 7. Blocked / not done

**Nothing was blocked.** The write guard never fired against me. I wrote only:

- `__tests__/engine/questions/generator.test.ts` (my declared `test_scopes`)
- `scratchpad/t007/**` (namespaced per L-028; deleted before commit — `ls scratchpad` → no such file)
- `.tdd-swarm/reports/T-007-tests.md` (this file)

I did not touch `src/`, another ticket's tests, or the control surface. `src/engine/questions/generator.ts`
does not exist.

Two notes rather than blockers:

1. The `working_directory` problem in §1 — my tooling silently ran in the repo root, where the guard is
   inert because the root has no phase file. I detected it myself, but nothing in the system would have.
2. `git status` in the worktree shows `?? node_modules`, because `.gitignore`'s `node_modules/` pattern
   does not match a **symlink** of that name. Harmless here (I did not stage it) but it will show up in
   every worktree's status and could be committed by accident. A `node_modules` line without the trailing
   slash would fix it — control surface, so I could not.

---

## 8. Residual risk — what this suite does NOT pin

1. **A hardcoded literal equal to the current tuning value is invisible.** `M11` (window `3`) and `M12`
   (bound `50`) die, but a literal `5`, `100` or `4` is behaviourally identical to importing the
   constant. The DoD's "read from `@engine/tuning`" needs a reviewer's eye or a source check; no
   black-box test can reach it.
2. **Which error wins when two failures coexist.** Steps 5 (distractors) and 6 (render) are both pure and
   both can throw. A template with an undeclared text token *and* unbuildable distractors yields
   `DISTRACTOR_FAILURE` or `INVALID_QUESTION` depending on order. No AC covers it and I did not pin it;
   my reference follows the ticket's step order.
3. **`ExprError` propagation is unspecified.** A malformed `answerExpr` or a bad declared distractor
   raises `ExprError`, not `QuestionGenerationError`. Whether the generator should let it through (T-005
   does) or wrap it as `INVALID_QUESTION` is stated nowhere, so nothing here asserts it. It matters for
   T-019: a content typo's error type determines how loudly the golden suite fails.
4. **The composed oracle is the suite's single biggest dependency, and it is my code.** `composeExpected`
   is the assertion that kills the widest range of cheats, and if it embodies a misreading, the
   misreading is frozen. Mitigations: the reference implementation was written separately and structured
   differently (`matchAll` scan vs `replace` callback, guard-clause loop vs `every`), 38 mutants die with
   a varied profile, and eight die on non-oracle criteria alone. **A reviewer should read
   `composeExpected` line-by-line against the ticket's seven steps** — that is the highest-value review
   target in this file.
5. **Eligible-pool ORDER is load-bearing but has no criterion.** `pick` indexes into the filtered array,
   so filtering that preserves membership while changing order produces a different template for the same
   seed. AC-1's multi-template composition test pins it; no AC states it. Related to A-2(b).
6. **Zero-parameter templates are not swept.** `params: {}` is schema-legal and would consume no parameter
   draws. No fixture covers it; nothing in the ticket suggests it should exist, but T-014/15/16 could
   author one.
7. **Shuffle uniformity beyond AC-13's band.** I assert all 24 orderings are reached, not that they are
   equiprobable. A shuffle with a mild positional bias inside ±7.75 σ passes. `shuffle` is frozen and
   T-001 tests it, so the risk lives in T-001's coverage, not here.
8. **Parameter magnitude at the extremes is only probed through AC-16.** `SWEEP_SEEDS` spans the 32-bit
   space and the fixtures span negative, zero, non-integer and 1,000-wide ranges, but the only
   float-saturation fixture is AC-16's. Per L-017 that dimension is represented rather than swept.
9. **Nothing asserts the generator calls `assertQuestion`.** AC-12 asserts the produced `Question`
   *satisfies* T-003's guard, not that the guard runs. A generator that never calls it and happens to be
   correct passes; so does one that calls it. That is the right scope, but it means the guard is not
   proven wired.
