# T-005 — Code Review

**Ticket:** `tickets/T-005.md` — Distractor construction and plausibility validation
**Implementation:** `/Users/quietguy/Documents/Dev/Gauntlet/cannon-wt/wt-T-005/src/engine/questions/distractors.ts` (191 lines)
**Frozen suite:** `__tests__/engine/questions/distractors.test.ts` — 88 `it(` declarations expanding to 146 runtime tests
**Commit under review:** `d56e005` `feat(T-005): distractor construction, plausibility and the near-miss ladder`
**Reviewer:** independent; did not write this code.

Ground truth accepted without re-confirmation: all gates green, 922/922, spec-lint 14/14, one
implementation commit touching only `src/engine/questions/distractors.ts`, zero test files
modified (`git diff swarm/engine-core..HEAD --stat` shows exactly two added files, the test file
arriving in the separate `test(T-005)` commit `9a57a8a`).

All line references below are into the implementation file unless otherwise marked.

Everything asserted here that is not a direct source reading was **measured**, not argued
(L-015). Probes were run out-of-tree via a scratchpad vitest config pointed at the worktree's
aliases; no file inside the repo was created, modified, or executed against.

---

## Verdict 1 — SPEC COMPLIANCE

### Acceptance criteria

| AC | Verdict | Evidence |
| --- | --- | --- |
| **AC-1** — `[8, 6, 12]` in declared order | **met** | `:139-146` iterates `declared` in template order and pushes in order; `:121` preserves order via `.map`. Probed: `{a:3,b:4}` → `[8, 6, 12]`. The ratio branch `:78-81` is what keeps `12` against `7` (12/7 ≤ RATIO=2). |
| **AC-2** — a candidate equal to the answer is dropped, still 3 values | **met** | `candidate !== answer` in `isUsable` `:128`; shortfall backfilled by the ladder loop `:148-155`. Strict `!==` also catches `-0` against a `0` answer (`-0 !== 0` is `false`) — probed with a genuine `-0` answer: declared `-0` and `0` both rejected, result `[3, 1, 2]`. |
| **AC-3** — pairwise distinct | **met** | `!values.includes(candidate)` `:128`. `includes` is SameValueZero, so a `0`/`-0` pair also cannot both land. |
| **AC-4** — answer + 3 distractors all distinct | **met** | Follows from AC-2 + AC-3 sharing one predicate `:127-128`; no path accepts a value without passing it (`accept` `:130-133` is called only from inside `isUsable` guards). |
| **AC-5** — implausible declared value excluded and replaced | **met** | `isPlausibleDistractor` in `isUsable` `:128`; replacement from `:148-155`. Two-sided: `:79` rejects too-large, `:80` rejects too-small. |
| **AC-6** — zero answer, no divide-by-zero, `1 ≤ d ≤ FLOOR` | **met** | `:74-76` returns `false` before the ratio expression is ever evaluated at `answer === 0` — the branch is *skipped*, not divided through. Probed: `x=0` → `[1, 2, 3]`. |
| **AC-7** — all-rejected → 3 ladder values in ladder order | **met** | `:90-100` is the ticket's nine offsets in the ticket's order; `:148-155` is a first-plausible-wins walk, so the result is the first legal rungs in order. |
| **AC-8** — `QuestionGenerationError` / `DISTRACTOR_FAILURE` naming the template id | **met** | `:159-165`. Probed message: `template "multi_digit__x": could only build 1 of 3 distinct plausible distractors for answer 200000000000000000`, `code = DISTRACTOR_FAILURE`. Never returns short/duplicate/answer — the throw is the only exit when `values.length < 3`. (See CQ-1 on message content.) |
| **AC-9** — `ExprError` propagates unchanged | **met** | `:115` evaluates `answerExpr`, `:121` evaluates **every** declared expression eagerly, both **before** the screening loop at `:139`. Nothing is wrapped in `try`; there is no `catch` anywhere in the file. A bad expression in the last slot therefore throws even when slots 1–2 already filled the quota — verified structurally: `declared` is fully materialised by `.map` before `values` exists. |
| **AC-10** — pure, 100 identical calls, no randomness | **met** | See "Purity" below — verified structurally, not only via the frozen behavioural test. |
| **AC-11** — integrality matches the answer | **met** | `:56` (clause 2). This is what rejects the `x*2` rung at a `0.5` answer (`1` is an integer), and it is load-bearing — see the zero-headroom note. |
| **AC-12** — `isPlausibleDistractor` exported, `false` for NaN/Infinity | **met** | `:49`, `:51-53`. |
| **AC-13** — zero answer yields exactly `{1,2,3}`, never `DISTRACTOR_FAILURE` | **met** | Probed directly: `x=0` → `[1, 2, 3]` for every declared shape. Derivation holds in source: at `x=0` clause 3 `:61` kills `-1,-2,-10,-3`; `:74` kills `+10`; `candidate !== answer` `:128` kills `x*2 = 0`; `{1,2,3}` remain, exactly `DISTRACTORS_NEEDED`. |
| **AC-14** — `describeDistractorSources` → `readonly ('declared'\|'ladder')[]`, index-aligned | **met** | `:189-191`; alignment is structural, not incidental — `accept` `:130-133` pushes to `values` and `sources` in the same call, and both exports read one `buildInternal` `:114`. Return type is `readonly DistractorSource[]` with `DistractorSource = 'declared' \| 'ladder'` `:36`, which is what the suite's invariant `Exact<>` check (test `:1351`) demands. |

**14 / 14 met. 0 not met. 0 cannot-verify.**

### Definition of Done

| Item | Verdict | Evidence |
| --- | --- | --- |
| Every AC has a passing `spec(T-005:AC-n)` test | **met** | All 14 tags present (AC-4's two literal occurrences expand to 51 generated tests through the sweep loop at test `:519-542`). |
| `run-local-gates.sh` green | **met** | Ground truth. |
| `spec-lint.sh` green | **met** | Ground truth (14/14). |
| No `Math.random()`, no `Date`, no `Rng` parameter | **met** | No global access of any kind beyond `Number`, `Math.abs`, and `Array.prototype`. All three exports have arity 2. |
| Thresholds from `@engine/tuning`; no literal except ladder offsets | **met, with a stated reading** | `:25-30` imports all four constants; the only bare numbers are the nine ladder offsets `:91-99`, the `0` comparisons at `:61` and `:74`, and the `- 1` in `DISTRACTORS_NEEDED = CHOICE_COUNT - 1` `:39`. The `0`s are the sign boundary and the divide-guard the rule is *literally stated in terms of*, and the `- 1` is "one answer among `CHOICE_COUNT`", not a threshold — the module header `:17-20` says so explicitly, and the frozen suite makes the identical derivation (test `:60`). No tunable feel-number is hard-coded. |
| Exports: `buildDistractors`, `isPlausibleDistractor`, `describeDistractorSources` | **met** | `:179`, `:49`, `:189`. Exactly three exports, no more. |
| Zero answer → three distinct plausible distractors, never `DISTRACTOR_FAILURE` | **met** | Probed. |
| Files changed exactly `file_scopes` | **met** | Ground truth + `--stat` above. |

### Iron Law — anything built that the ticket did not ask for

**Nothing.** The non-exported surface is `Params` `:33`, `DistractorSource` `:36`,
`DISTRACTORS_NEEDED` `:39`, `ladderRungs` `:89`, `BuiltDistractors` `:105`, `buildInternal` `:114`
— each is required by an AC and none escapes the module. The local `Params` alias is not
duplication-by-choice: `expr.ts:80` declares `Environment` without exporting it, so there is no
shared type to import.

Notably absent, and correctly so: no shuffle, no `correctIndex`, no `Rng`, no param sampling, no
constraint evaluation, no text rendering, no per-skill strategy plugin. Every item in **Out of
Scope** stayed out. The implementer also declined to add a combined `values + sources` export
even though the recomputation cost (CQ-4) would justify one — the DoD fixes the export list at
three, and that was the right call.

---

## Verdict 2 — CODE QUALITY

### Where the review was told to concentrate — findings

**The plausibility predicate, clause by clause.** Correct against the ticket, clause for clause.
`:51` = clause 1; `:56` = clause 2; `:61` = clause 3, correctly *conditional* (`answer >= 0 &&`),
so negatives remain legal against a negative answer; `:66` = clause 4a; `:78-81` = clause 4b.
**The ratio bound is two-sided and in the `|d|` vs `|x|` form** — `Math.abs(candidate) <=
Math.abs(answer) * RATIO` and `Math.abs(candidate) >= Math.abs(answer) / RATIO`. The
divide-through form `|x| / |d|` appears nowhere in the file; the comment at `:71-73` names it as
the trap and explains why it is not used. `isPlausibleDistractor(x, x) === true` is deliberate
and **is clearly documented at the definition site** `:44-47`, naming both the reason (collision
rejection belongs to the builder) and the beneficiary (content tickets reusing the predicate on
unscreened candidates). That is the separation stated where a reader will actually meet it.

**Ladder order and slicing.** `:90-100` is the ticket's nine offsets, in the ticket's order, with
no invented rungs. `rungs.slice(0, MAX_DISTRACTOR_ATTEMPTS)` `:102` with the constant at `9` and
nine rungs yields all nine — **not off by one** (`slice(0,9)` = indices 0–8). The slice is applied
to the rung list *before* filtering, so the constant caps rungs *attempted*, which is the reading
its name and T-004's comment support; and the declared loop is correctly not counted against it.
Because the ladder loop is a first-plausible-wins walk with no lookahead, ladder-only results are
necessarily the first legal rungs in order — which is exactly what the frozen suite pins across
the whole answer sweep (test `:738`).

**Evaluation order.** Verified, and the implementer's claim holds: `:115` (answer) and `:121`
(all declared, via `.map`) both complete before the screening loop begins at `:139`. There is no
`try`/`catch` in the file, so an `ExprError` from any slot — including one the loop would never
reach — propagates untouched. The reverse ordering (evaluate lazily inside the loop) would
silently swallow a broken template's last expression once the quota filled; it is not what is
written.

**The quota cap.** **Both caps are `>=`** (`:140`, `:149`), and I confirmed by probe that **no
path can overshoot**: `accept` pushes exactly one value and the guard precedes every push, so
`values.length` reaches `DISTRACTORS_NEEDED` and stops. Correct. The rationale recorded in the
comment, however, does not survive its own probe — see **CQ-2**.

**Purity.** Honoured structurally, not merely lint-clean and not merely test-green. The ESLint
determinism block (`eslint.config.js`) is scoped `src/engine/**/*.ts` and does cover this file,
but per L-013 that guard is spelling-based and proves little. The stronger observation: this
module's imports are `@content/schemas` (type-only), `@engine/questions/expr`,
`@engine/questions/types`, `@engine/tuning` — no ambient capability is reachable. Its only global
references are `Number.isFinite` / `Number.isInteger`, `Math.abs`, and array methods. There is no
module-level mutable state; `ladderRungs`, `values`, `sources`, `isUsable` and `accept` are all
allocated per call, so no cross-call channel exists even in principle. No `Rng`, no `Date`, no
clock, no I/O.

**`noUncheckedIndexedAccess` handling.** **Clean.** The module performs no indexed access at all
— it iterates with `for…of` and builds with `push` — so the setting has nothing to defeat. There
is not a single `!` non-null assertion or `as` cast in the file (grep hits are prose only). No
guard has been papered over.

### Findings by severity

#### Critical

None.

#### Important

**CQ-1 — the `DISTRACTOR_FAILURE` message omits the one input that makes the failure
reproducible.** `:160-164`

The message a catalog author actually receives is:

```
template "multi_digit__x": could only build 1 of 3 distinct plausible distractors for answer 200000000000000000
```

This satisfies AC-8 (it names the template id) and it reports the shortfall and the answer. But
the failure is a property of `(template, params)`, and **`params` is not in the message.** The
draw is what starves the ladder; without it the author cannot reproduce the failure. Nor does the
message say which declared candidates were rejected, or on which ground — collision, duplicate,
or implausibility — and those three call for three different fixes (rewrite the expression, break
the tie, rescale the magnitude).

This is not hypothetical. T-014, T-015 and T-016 will exercise this module over sampled draws;
when one throws, the test output is this string. From `answer = 2e17` and `answerExpr = "a * b"` a
factorisation is not unique, so the author is left guessing at the draw that produced it. The
module has `params` in scope at the throw site.

Suggested fix (one interpolation, inside file scope):

```ts
`template "${template.id}" with params ${JSON.stringify(params)}: could only build ` +
  `${values.length} of ${DISTRACTORS_NEEDED} distinct plausible distractors for answer ${answer} ` +
  `(declared candidates: ${JSON.stringify(declared)})`
```

The frozen suite asserts only `expect(message).toContain(exhaustionTemplate.id)`
(test `:804`), so extending the message keeps all 146 tests green. This is the sole item
standing between this ticket and approval, and it is a one-line change.

#### Minor

**CQ-2 — the cap comment records a probe result that a probe contradicts.** `:135-138`

The comment says: *"an exact-equality cap that gets overshot stops capping at all. Probed:
without this cap a four-entry list returns eight values."* I rebuilt both mutants and measured
them (L-014 — confirm the mutant is live before trusting what it demonstrates):

| Variant | 4-entry declared list | 6-entry declared list |
| --- | --- | --- |
| as shipped | `[8, 6, 12]` | `[8, 6, 12]` |
| **this** cap deleted (declared loop only) | `[8, 6, 12, 9]` — **four**, not eight | `[8, 6, 12, 9, 5, 10]` |
| **both** caps deleted | `[8, 6, 12, 9, 5, 14, 10, 4]` — eight | eight |
| both caps as `===` instead of `>=` | `[8, 6, 12]` | `[8, 6, 12]` |

Two inaccuracies. The "eight values" figure belongs to the *both-caps* mutant, not to the cap the
comment annotates. And the hazard the comment gives as its rationale — an equality cap being
overshot — **cannot occur in this code**: `===` is behaviourally identical to `>=` here, because
`values` grows by exactly one per iteration and the guard precedes every push. `>=` remains the
right defensive spelling and the cap itself is genuinely load-bearing (row 2 proves it). What is
wrong is the stated reason, which will send the next maintainer looking for an overshoot path
that does not exist. Rewrite the comment to the claim the probe actually supports: the cap is
needed because `Template['distractors']` is `string[]` (the `.length(3)` refinement lives on
`templateSchema`, `src/content/schemas.ts:81`, not in the inferred type), and without it a
four-entry list returns four values.

**CQ-3 — the second zero-headroom answer is invisible from `src/`.** `:56`, `:66`

The `x = 0` fragility is well documented: module header, the inline comment at `:71-73`, and
`tuning.ts`'s `DISTRACTOR_ABS_FLOOR` note. The **`x = 0.5`** case — legal rungs exactly
`{1.5, 2.5, 3.5}`, because `x*2 = 1` is rejected by clause 2 as an integer against a non-integer
answer — is documented nowhere in `src/`. I confirmed it by probe: `x = 0.5` → `[1.5, 2.5, 3.5]`,
and `isPlausibleDistractor(1, 0.5) === false`.

It lives only in the frozen test's comment (test `:1053-1055`) and the implementer's report.
Neither is source. A maintainer reading `:56` sees an integrality rule justified as "an integer
offered against 3.5 is free to eliminate" — true, and it understates the clause: it is also the
difference between a buildable and an unbuildable `fractions_int` question at a `0.5` answer.
Any future softening of clause 2, or any tightening of clause 4a, silently breaks **two** content
families rather than the one `tuning.ts` warns about. One sentence at `:56` closes it. (The
behavioural guard does exist — tests `:1065` and `:1259` pin both the value and the constant — so
this is documentation risk, not correctness risk.)

**CQ-4 — both exports recompute the whole build.** `:180`, `:190`

`describeDistractorSources` calls `buildInternal` afresh, re-parsing and re-evaluating
`answerExpr` and every declared expression (`expr.ts` parses per call; there is no cache). The
consumers named in the doc comment at `:184-187` — T-014, T-015, T-016 — need *both* the values
and the ladder-substitution count, so they pay this on every call, inside 1,000-sample sweeps.
Correctness is unaffected and the single-derivation design at `:114` is the right structure. But
the ticket's fixed export list leaves no in-scope way to expose the pair, so the redundancy is
forced on every consumer. Not a defect in this ticket — flag it for the content tickets, or for a
follow-up that widens the export list deliberately rather than by accretion.

**CQ-5 — fill placement is a real decision that no test pins.** `:139-155`

Rejected declared slots are not filled in place; survivors keep their relative order and ladder
fills are appended. Probed: declared `['a+b+1', 'a*b*1000', 'a+b-1']` at `{a:3,b:4}` →
`[8, 6, 9]` with sources `['declared', 'declared', 'ladder']`, i.e. the surviving third declared
value moves up into slot 1. The frozen suite deliberately declines to assert order for
mid-list rejections (test `:342-344`, `:1301-1303`), and every order-asserting fixture has its
rejects at the tail, where both readings agree. The implementer flagged this and I confirm it:
**the behaviour is correct, unasserted, and therefore free to change silently.** T-019's golden
suite will bake it in as an unstated dependency the first time it records a question whose
declared list rejects in the middle. Endorse the implementer's recommendation — one line in the
ticket, or a note carried to T-019.

**CQ-6 — `DistractorSource` is not exported.** `:36`

AC-14's consumers can recover the union via `ReturnType<typeof describeDistractorSources>[number]`,
which is what the frozen suite does, so nothing is blocked. Exporting the alias would be friendlier,
but the DoD fixes the export list and the Iron Law says leave it. Recording as an observation only,
so a later ticket can widen it on purpose.

### What is genuinely clean

Stated plainly, because most of this module is:

- **The predicate is the ticket, clause for clause**, with the two traps the review was told to
  hunt — the divide-through ratio form and a one-sided bound — both absent, and the correct form
  annotated with *why* at `:71-73`.
- **The zero-answer path is right and is right for the stated reason.** `:74-76` skips the branch
  rather than guarding a division after the fact; `{1,2,3}` and `{1.5,2.5,3.5}` both hold under
  probe.
- **The ladder is the ticket's ladder** — nine offsets, that order, no invention — and the slice
  against `MAX_DISTRACTOR_ATTEMPTS` is exact.
- **Evaluation order is correct and structurally guaranteed**, not incidental: eager `.map` before
  the loop, and not a single `try`/`catch` in the file.
- **One predicate, one accept.** Collision, duplication and implausibility are a single `isUsable`
  `:127-128` applied identically to declared values and ladder rungs, so no one of the three can
  be dropped or diverge between the two paths. `accept` `:130-133` is the only writer of both
  arrays, which makes AC-14's index alignment a structural property rather than a discipline.
- **Purity holds structurally**, with no ambient capability reachable and no module-level state —
  a stronger property than either the lint rule or the poisoned-`Math.random` test establishes.
- **Not one `!`, not one `as`, not one indexed access.** Under `noUncheckedIndexedAccess` that is
  the cleanest possible answer.
- **`-0` is handled correctly throughout**, by construction rather than by special case: `!==`
  makes `-0` collide with a `0` answer, `includes`' SameValueZero prevents a `0`/`-0` pair, and
  `answer === 0` `:74` is true for `-0` so the divide-guard fires. Probed with a real `-0` answer.
- **The comments explain reasoning, not mechanics**, and the reusability contract on
  `isPlausibleDistractor` is documented exactly where a reader meets it.

---

## Verdict

- **Spec compliance:** clean. 14/14 ACs met, 8/8 DoD items met, Iron Law respected — nothing
  built that the ticket did not ask for, and every Out of Scope item stayed out.
- **Code quality:** one **Important** finding (CQ-1), five Minor.

Per the standing rule that approval requires both verdicts clean of Critical and Important, and
noting that the single blocker is a one-line change to a string literal that the frozen suite
already accommodates:

**CHANGES REQUIRED**
