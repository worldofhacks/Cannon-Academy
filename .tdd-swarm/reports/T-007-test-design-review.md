# T-007 — Independent Test-Design Review

## Verdict

**REJECT.** The suite has a faithful core oracle for ordinary identifier-shaped parameters, but it
leaves three demonstrably wrong implementations green and freezes one unsupported interpretation of
a schema-legal text token. Amend the suite/spec before freezing:

1. In `__tests__/engine/questions/generator.test.ts:1120-1134`, make every seed in the
   unsatisfiable-constraint sweep assert `QuestionGenerationError` with
   `CONSTRAINTS_UNSATISFIED` (and the template id), rather than accepting any thrown value.
2. In `__tests__/engine/questions/generator.test.ts:1433-1449`, make every seed for the
   undeclared-token fixture assert `QuestionGenerationError` with `INVALID_QUESTION`, rather than
   accepting any thrown value.
3. Add an acceptance criterion (or explicitly make a non-empty parameter map a schema invariant)
   and a test for schema-valid `params: {}`. With no declared keys, step 3 performs zero `nextInt`
   draws, then answer/render/assembly still proceed.
4. Resolve the token-name domain. `templateSchema` accepts arbitrary string parameter keys
   (`src/content/schemas.ts:78`), while `composeExpected` only recognizes identifier-shaped names
   at `generator.test.ts:178`. Either restrict schema keys/ticket tokens to
   `[A-Za-z_][A-Za-z0-9_]*`, or change the oracle and AC-10 tests to substitute every declared
   brace-delimited key, including a fixture such as `params: { "a-b": [3, 3] }`,
   `text: "{a-b}"`, and constant answer/distractors.

## Worktree verification

Verified before review:

| Check | Observed |
| --- | --- |
| `pwd` | `/Users/quietguy/Documents/Dev/Gauntlet/Math Game/.worktrees/wt-T-007` |
| `git branch --show-current` | `ticket/T-007-question-generator` |
| `.tdd-swarm/active-ticket` | `T-007` |

The frozen test file SHA-256 was rechecked as
`12e82f4ddfc45b872ce0f57f100035852ba2a9786083037a7ec9b6d42b2cd1bf`.
`src/engine/questions/generator.ts` remains absent.

## Oracle audit — every seven step traced

I traced all seven steps of `composeExpected`, not merely its successful output:

1. **Eligibility:** `eligiblePool` (`167-171`) slices the first
   `RECENT_TEMPLATE_WINDOW`, filters while preserving source-pool order, falls back only when the
   filtered pool is empty, and `204-208` emits `NO_TEMPLATE` for an empty unfiltered pool.
   Faithful.
2. **Pick:** `210-211` calls frozen `pick(input.rng, pool)` exactly once and threads its returned
   RNG. Faithful.
3. **Rejection sampling:** `213-235` sorts keys lexicographically, consumes an inclusive
   `nextInt` for every key on every attempt, evaluates every predicate, discards a whole failed
   draw, and limits total draws to `MAX_PARAM_SAMPLE_ATTEMPTS`. Faithful; “100 total” is supported
   by Architecture §4.1’s “fails 100 samples”.
4. **Answer:** `237` calls `evaluateNumber` only after a satisfying draw. Faithful.
5. **Distractors:** `238` calls pure `buildDistractors` before render and consumes no RNG.
   Faithful.
6. **Render:** `239` occurs after distractors, as the ticket requires, and rejects braces that
   survive. However, `renderText` only matches identifier-shaped `{name}` at `178`; this is not
   faithful to the schema’s arbitrary string keys or to the ticket’s unconstrained “{name}”.
7. **Assembly/shuffle:** `241-258` creates `{value,label:String(value)}`, feeds
   `[answer, ...distractors]` to frozen `shuffle`, finds the post-shuffle answer index, normalizes
   flags, and returns the shuffle RNG. Faithful. The project-owner ruling confirms the
   answer-first input; the tests do pin it through the exact oracle.

Apart from the token-name defect, the successful-path PRNG draw order is faithful: pick → sorted
parameter draws/retries → no draw for evaluation/distractors/render → three Fisher-Yates shuffle
draws.

## Independent mutation results

I built a separate scratch reference implementation, ran all 57 frozen tests against it, then
applied the following live mutations. Reference: **57/57 pass**. Every mutant below also:
**57/57 pass**, so each is a survivor.

| Survivor mutation | Evidence | Criterion that should catch it |
| --- | --- | --- |
| For `unsatisfiable-tpl`, return the specified `CONSTRAINTS_UNSATISFIED` only at direct-test seed 5; for all other inputs throw `RangeError` after 100 failed draws. | Measured: mutant pass 57/57. The sweep at `1120-1134` catches any error and only the direct fixture at `1107-1118` checks type/code. | AC-7 |
| For `undeclared-every-seed`, throw `RangeError` for every invalid render rather than `QuestionGenerationError(INVALID_QUESTION)`. | Measured: mutant pass 57/57. The exact-code check uses a different fixture at `1400-1414`; the sweep at `1433-1449` only checks that something throws. | AC-11 |
| Reject a selected template with `params: {}` as `INVALID_QUESTION`. | Measured: mutant pass 57/57. `templateSchema` permits an empty record, and no fixture reaches the zero-key branch. | Missing AC / step 3 and AC-8’s no-constraints success intent |

Additionally, the current oracle itself rejects a schema-valid hyphenated parameter token. That is
not just an untested mutant; it would freeze an incorrect requirement unless the schema or ticket
is narrowed.

## Weak, vacuous, coincidental assertions

- `generator.test.ts:1120-1134` and `1433-1449`: error sweeps are weak as measured above; the
  `catch` accepts `RangeError`, `ExprError`, or any unrelated throw.
- `generator.test.ts:1724-1754`: the repeat ceiling is 41 repeats for an expectation of 3.47
  (about 20 standard deviations). It is not a meaningful distribution check. It is acceptable
  only as a coarse reset discriminator because the exact continuation oracle at `1697-1721`
  carries the real requirement.
- `generator.test.ts:1609-1622`: AC-13’s supplied 350–650 histogram band is ±7.75 sigma and is
  correspondingly weak. The adjacent all-24-orderings check at `1624-1639` prevents the known
  slot-only shuffle cheat, so this is not a standalone release blocker.
- `generator.test.ts:178-185`: the identifier regex creates an unproven, coincidental equivalence
  between template parameter names and expression identifiers. The schema does not create that
  equivalence.
- The author correctly avoided the known sorted-pool coincidence at `645-664`; I found no repeat
  of that particular fixture defect.

## Over-constraint assessment

Most exactness is justified: the ticket explicitly composes frozen primitives in a specified order,
and the answer-first pre-shuffle order is owner-ruled. Exact `buildDistractors` values, labels,
flags, eligible-pool order, and returned RNG are observable consequences, not implementation-shape
requirements.

The main over-constraint is the implicit token grammar at `178`. It dictates an identifier-only
rendering implementation despite neither the ticket nor the schema saying so. The AC-2
position-disagreement floor (`707-739`) and all-templates-reached rule exceed AC-2’s literal
“not identical,” but are defensible as consequences of using frozen uniform `pick`; they do not
require a particular decomposition.

## AC discrimination

| AC | Independent judgment |
| --- | --- |
| 1 | Strong deterministic/purity coverage; exact oracle dependency remains. |
| 2 | Stronger than literal wording, but consistent with frozen uniform `pick`. |
| 3 | Strong; both window boundaries and reachable set are discriminated. |
| 4 | Strong; whole-pool fallback is distinguished from first-item fallback. |
| 5 | Positive case only. AC-4 and normal successful calls partly bound eager throws, but no broad non-empty “must not throw `NO_TEMPLATE`” bound exists. |
| 6 | Strong; non-vacuous constraint, multiple predicates, ranges, and sorted order. |
| 7 | Incomplete: exact type/code is checked at one seed only; survivor above. |
| 8 | Good absent/empty constraints coverage; misses the schema-legal zero-parameter dimension. |
| 9 | Strong first-attempt/RNG consumption check. |
| 10 | Incorrectly limited to identifier tokens; needs the token-domain decision. |
| 11 | Incomplete typed-error sweep; survivor above. |
| 12 | Strong output invariants and distractor delegation. Extra skill/id/label checks are algorithm-required but absent from literal AC text. |
| 13 | Histogram is weak, but full permutation coverage supplies the needed structural discriminator. |
| 14 | The literal parameter-difference claim is false; replacement checks correctly test advancing stream. |
| 15 | Strong normalization and presence checks. |
| 16 | Strong: direct precondition probe and byte-identical propagation. |

## Ambiguities — independent adjudication

The author calls these “six” but enumerates A-1 through A-7; I reviewed all seven entries.

- **A-1 / AC-14:** Correct. Independent replay of mulberry32, including pick and the three
  shuffle draws, measured **63/500** chained collisions for one `[1,9]` parameter and **4/500**
  for two `[1,12]` parameters. The literal “different parameter draw” must be rewritten. The
  suite’s state/continuation rendering is sound; its 20-sigma rate ceiling is only a reset check.
- **A-2(a), sorted params:** Correct and sound. It is explicit in step 3 and is pinned by a
  non-sorted declaration-order fixture.
- **A-2(b), pre-shuffle array:** The former ambiguity is now resolved by owner ruling:
  `[answer, ...distractors]`. The oracle and tests pin it; no contradiction found.
- **A-3, 100 attempts:** Correct reading and sound boundary test. “Fails 100 samples” selects
  100 total attempts, not 101.
- **A-4, skill/templateId/label absent from literal AC-12:** Correct observation. The tests are
  sound against the algorithm, but the ticket should add them to AC-12 for traceability.
- **A-5, NO_TEMPLATE cannot name an id:** Correct. Carve out `NO_TEMPLATE` in the DoD rather
  than force fabricated identifiers.
- **A-6, distractor failure reachability:** Correct as an observation. The pathological
  float-saturation fixture is schema-valid and direct `buildDistractors` probing makes AC-16
  non-vacuous.
- **A-7, weak AC-2/AC-13 magnitude:** Correct. The added structural discriminators materially
  improve it; the supplied bands alone do not.

## Residual risk / not verified

I did not exhaustively mutation-test every behavior; I ran three independent live survivors plus
the AC-14 stream measurement. I did not benchmark all possible template key strings, malformed
expressions, or simultaneous render/distractor failures. Residual risk is concentrated in
under-specified cross-failure precedence, source-level “must import tuning/assertQuestion”
requirements that black-box tests cannot prove, and untested schema-legal domains (especially
empty/arbitrary-string parameter keys).

## Integrity

Only this review report and `scratchpad/review-t007/**` were written. The scratchpad was removed
after measurement. No production file or frozen test was modified, no file was created under
`src/`, and no commit was made.
