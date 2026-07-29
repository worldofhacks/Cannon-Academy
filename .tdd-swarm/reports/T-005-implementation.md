# T-005 — Implementation Report

**Status:** DONE_WITH_CONCERNS (concerns are about the dispatch brief, not the code)
**Branch:** `ticket/T-005-distractors`
**Commit:** `7b7e6ff` — `feat(T-005): distractor construction, plausibility and the near-miss ladder`
**Files changed:** `src/engine/questions/distractors.ts` (added) — exactly `file_scopes`, nothing else.

## Test summary

| Gate                                    | Result                                  |
| --------------------------------------- | --------------------------------------- |
| `__tests__/engine/questions/distractors.test.ts` | 146 / 146 pass                 |
| Full suite                              | **922 / 922 pass** (776 inherited + 146) |
| `.tdd-swarm/run-local-gates.sh`         | ALL LOCAL GATES PASS                    |
| `.tdd-swarm/spec-lint.sh tickets/T-005.md` | SPEC-LINT PASS — all 14 ACs covered  |

The frozen suite passed on the first implementation pass; no test was edited, skipped or weakened.

## What was built

Three exports, exactly the Definition of Done list:

- **`isPlausibleDistractor(candidate, answer)`** — the ticket's four clauses verbatim: finite,
  integrality matching the answer, no negative decoy against a non-negative answer, then near-miss
  OR two-sided magnitude ratio. Clause 4b is guarded by an explicit `answer === 0 → false` so the
  branch is *skipped* at a zero answer rather than divided through. It deliberately does **not**
  check `candidate !== answer`; collision rejection is `buildDistractors`' job, which is what lets
  T-014/T-015/T-016 reuse the predicate on unscreened candidates.
- **`buildDistractors(template, params)`** — evaluates `answerExpr`, then **every** declared
  expression eagerly, then accepts declared values in order and tops up from the nine-rung ladder.
  Throws `QuestionGenerationError` / `DISTRACTOR_FAILURE` naming the template id rather than
  degrading.
- **`describeDistractorSources(template, params)`** — `readonly ('declared' | 'ladder')[]`, derived
  from the same internal build so values and labels cannot drift apart.

Trap-by-trap, against the 24 mutants named in the brief:

- Answer-collision, pairwise-distinctness and plausibility are a single `isUsable` predicate
  applied to declared values and ladder rungs alike, so none of the three can be dropped
  independently.
- The ratio bound is written two-sided in the `|d|` vs `|x|` form, never `|x|/|d|`.
- The ladder is the ticket's nine offsets in the ticket's order, sliced to
  `MAX_DISTRACTOR_ATTEMPTS`; ladder-only results are therefore the first legal rungs in order.
- Declared expressions are evaluated **before** the screening loop, so an `ExprError` in the last
  slot still propagates even when the first two slots already filled the quota.
- Only tuning constants are used as thresholds. The bare numbers in the module are the ladder's
  nine offsets and the `0` comparisons that clauses 3 and 4b are literally stated in terms of
  (a sign boundary and a divide-by-zero guard, not tunable feel-numbers).

## Probe (per L-015 / L-014)

The one branch that could have been an unreachability claim is the quota cap in the **declared**
loop: with `templateSchema`'s `.length(3)`, a declared list can never exceed three, so the cap
looks dead.

It is not, and I did not argue it — I probed it. `Template['distractors']` is typed `string[]`
(the `.length(3)` refinement lives at the schema boundary, not in the inferred type), so a
four-entry template is type-legal. A throwaway probe outside the frozen suite built one and, per
L-014, I verified the *mutant is live* before trusting the verdict: with the cap deleted the call
returns **eight** values (`[8, 6, 12, 9, 5, 14, 10, 4]`) instead of three. Restored, it returns
`[8, 6, 12]`.

That probe also surfaced a real fragility: the cap was originally written `values.length === N`,
and an exact-equality cap that gets overshot stops capping at all — which is exactly why the
mutant produced eight rather than four. Both caps are now `>=`. The probe files live in the
session scratchpad, not the repo.

## Concerns

1. **`LESSONS.md L-022` does not exist.** The dispatch brief cites "LESSONS.md L-022" for the
   claim that an earlier dispatch contradicted this ticket's signature. `.tdd-swarm/LESSONS.md`
   ends at **L-021**. I proceeded from the ticket as the contract, which is what the brief itself
   instructs. If L-022 was written and lost in a merge, the correction it carried has not reached
   me — worth confirming before the wave review reads this report.

   For the record, the signature I implemented is the one the ticket's ACs and Definition of Done
   imply and the one the frozen tests assert: `buildDistractors(template, params)` deriving the
   answer from `template.answerExpr` itself, with no `Rng` and no separately-passed answer. The
   suite pins arity at exactly 2 for all three exports.

2. **Fill placement is genuinely underspecified, and the tests know it.** The ticket never says
   whether a ladder fill lands in the rejected slot or is appended. I append. The frozen suite
   explicitly declines to assert order in the two cases where the readings diverge (a rejected
   distractor in the *middle* of the declared list). Every fixture that *does* assert exact order
   has its rejects at the tail, where both readings agree. This is correct as frozen, but it means
   **the choice is not pinned by any test** — if T-007's golden suite or a later content ticket
   ever depends on fill placement, it will be depending on an unasserted implementation detail.
   Recommend either an explicit line in the ticket or a note to T-019.

3. **`DISTRACTOR_ABS_FLOOR` has zero headroom at two answers, not one.** The ticket documents the
   zero-answer case. The frozen suite found a second: a `0.5` answer also has exactly three legal
   ladder values (`1.5, 2.5, 3.5`) — `x * 2 = 1` is rejected on clause 2 for being an *integer*
   against a non-integer answer. `fractions_int` content that can produce `0.5` is therefore just
   as tight as `sub_within_20`'s `a == b`. Nothing to change here, but T-015/T-016 should know
   that lowering the floor breaks two content families, not one.

4. **Pre-existing, out of scope, already filed:** `src/engine/questions/types.ts` carries its own
   local `const CHOICE_COUNT = 4` rather than importing from `@engine/tuning` — the duplication
   filed as T-028. This module imports the tuning constant, so it is unaffected; noting only that
   the two could drift.

---

# Follow-up — AC-15 / AC-16 / AC-17

**Status:** DONE
**Commit:** `ffc2440` — `fix(T-005): reproducible failure message and honest cap documentation`
**Files changed:** `src/engine/questions/distractors.ts` only (+49 / -6).
**Tests:** **946 / 946 pass.** Local gates ALL PASS; spec-lint PASS, 17/17 ACs covered.

## AC-15 — reproducible failure message

`DISTRACTOR_FAILURE` now carries the draw. One exhausting draw:

```
template "multi_digit_order_ops__exhausted" could not build 3 distinct plausible distractors
for answer 200000000000000000 (built 1, 11 candidates rejected)
from params {leftFactor=500000000, rightFactor=400000000}
```

The second draw of the same template differs where it must:

```
... from params {leftFactor=1000000000, rightFactor=200000000}
```

Same id, same answer, same counts — only `params` differs, which is exactly what the
discriminator test demands and what `toContain(templateId)` could never catch.

The rejected count is **every candidate screened and turned away, declared and ladder alike**.
Here that is 3 declared collisions + 8 ladder rungs = 11; the three extra declared entries in the
tracking test are each rejected on magnitude, so it rises to 14 — a delta of exactly three under
that definition, as under any other consistent one.

One detail worth recording, because it constrains future edits to this string: the count must not
be preceded by another digit run within 40 non-digit characters, or the test's `before` regex
locks onto the wrong number. `(built 1, 11 candidates rejected)` is safe because the count's own
digits block the earlier match. Reordering the message could silently break that.

## AC-16 — the cap comment, re-measured

The reviewer is right and I was wrong. Re-measured on the shipped file:

| variant                                | n = 4 result                  |
| -------------------------------------- | ----------------------------- |
| shipped (`>=` both caps)               | `[8, 9, 10]` — 3              |
| declared cap removed, ladder `>=`      | `[8, 9, 10, 11]` — **4**      |
| declared cap removed, ladder `===`     | `[8,9,10,11,6,5,14,4]` — **8** |
| shipped `>=` vs `===`, n = 1..12       | **identical**                 |

My "eight values" came from the third row — a mutant that had *also* degraded the ladder cap,
because I measured it before changing that operator and never re-measured after. It was a
two-cap measurement cited as evidence about one cap. And the overshoot risk I used to justify
`>=` does not exist: `values` grows one per iteration with the guard before every push, so the
length cannot step past the quota and `===` can never be missed.

The cap is still load-bearing — row 2 shows the quota breaking without it — so the conclusion
stood while the reasoning under it did not, which is the failure mode L-015 is about. The new
comment states what the cap does, carries both measurements, and names the earlier error rather
than quietly dropping it, so the next editor is not left re-deriving why the claim changed.

`>=` is kept as defensive-only, and the comment says so.

## AC-17 — the 0.5 case beside the floor

Documented as a comment at the clause-4a use of `DISTRACTOR_ABS_FLOOR`, recording both
zero-headroom answers, the sweep result that makes 0.5 the *rule* rather than an example, and the
mechanism that makes the fraction case tight for a different reason than the zero case
(`x * 2 = 1` is rejected on integrality, not magnitude). Written as prose only — the module
contains no `0.5` literal, so the documentation criterion is met without trading away the
Definition of Done's no-numeric-literal rule.
