# T-007 — Question generator: test report

_Round 2, 2026-07-28. Written after an independent cross-model test-design review **rejected**
the first suite with three live mutants, and the ticket was amended from 16 criteria to 19._

| | |
| --- | --- |
| Status | `DONE_WITH_CONCERNS` — one Definition-of-Done item is deliberately untagged and `spec-lint` is RED on exactly that line. See §7. |
| Worktree | `.worktrees/wt-T-007`, branch `ticket/T-007-question-generator`, active-ticket `T-007`, phase `tests` — all three echoed back in §1 |
| Test file | `__tests__/engine/questions/generator.test.ts` |
| Starting SHA-256 | `12e82f4ddfc45b872ce0f57f100035852ba2a9786083037a7ec9b6d42b2cd1bf` (verified before editing) |
| Ending SHA-256 | `09b3da13420206d20cc7bdd35d99e0f53b645ac3f078f1b5e1644d7b5b2bdf14` — the bytes every number below was measured against |
| Tests | 72 (`it` blocks), up from 57 |
| Criterion tags | 66 `spec(T-007:AC-n)` + 8 `dod(T-007:n)` |
| Assertion sites | 152 `expect(` call sites, many inside sweeps of 114 seeds × 15 templates |
| Commit | `1389563` — `test(T-007): close the review's holes and re-tag against 19 criteria` |
| Mutants | 53 built, 53 killed, reference clean, kill counts 1 → 44 |

---

## 1. Unit assertion (L-031)

Before any measurement, prefixing every command with an explicit `cd` into the worktree:

```
branch         = ticket/T-007-question-generator
active-ticket  = T-007
phase          = tests
```

The frozen file's SHA-256 matched the expected
`12e82f4ddfc45b872ce0f57f100035852ba2a9786083037a7ec9b6d42b2cd1bf` exactly, so the restore after
the aborted rebase was faithful and I edited the file the review actually read.

---

## 2. What the review found, and what I did about it

All three of its mutants are now dead, and auditing the *class* rather than the report found two
more instances the review did not name.

| # | Mutant | Now killed by | How |
| --- | --- | --- | --- |
| Review 1 | `CONSTRAINTS_UNSATISFIED` typed at the one directly-tested seed, bare `RangeError` elsewhere | **AC-7**, DoD-5 | The sweep at the old `:1120` classified each seed as `type/code/names-id` and compares the whole profile |
| Review 2 | Same trick wearing `INVALID_QUESTION` | **AC-11** | Same correction at the old `:1433` |
| Review 3 | Rejects schema-valid `params: {}` as `INVALID_QUESTION` | **AC-18** | Three new tests; the fixture's legality is asserted before it is used |
| **Mine 1** | Plain `Error` with a `code` property bolted on, instead of `QuestionGenerationError` | AC-7, AC-11, **AC-16**, DoD-5 | AC-16's sweep already checked `code` — which a bare `RangeError` fails, since it has none — but never the **type**. Third instance of the review's shape, found by auditing all four `catch` sites rather than the two reported |
| **Mine 2** | `localeCompare` instead of code-point order for the parameter key sort | **AC-17** | See §6, A-8. This one **survived all 71 tests** after the other fixes were in, and is a hole the amendment itself opened |

The bare-`catch` shape is gone from the file: every sweep now returns a per-seed
`type/code/names-id` profile and compares it in one `toStrictEqual`, so a failure names each
deviant seed and what it actually threw.

---

## 3. Coverage

`spec-lint` resolves **19 of 19 criteria** and **6 of 7 Definition-of-Done items**; DoD-7 is
addressed in §7. "Passes wrongly" below is what would have to be true for a green test to be
worthless.

| AC | Tests | Would pass wrongly if… |
| --- | --- | --- |
| AC-1 | 6 | …the oracle re-derived the result the same wrong way the module does. Mitigated: the oracle is composed from frozen primitives, written before the reference, and 53 mutants die against it |
| AC-2 | 4 | …two seeds differ in one position of 200. Discriminated by a closed-form per-position floor (`7/8 − 6σ = 0.7347`; worst observed 0.83 over 60 pairs) plus every-template-reached |
| AC-3 | 4 | …the module excluded the *whole* history rather than the first `w`. Discriminated by pinning the eligible set to exactly `pool.slice(w)` |
| AC-4 | 3 | …degradation returned one fixed member. Discriminated by requiring the whole unfiltered pool to be reachable |
| AC-5 | 2 | …`NO_TEMPLATE` were thrown for non-empty pools too. Not bounded — see §8 |
| AC-6 | 4 | …one constraint were checked and the rest skipped. Discriminated by a two-constraint fixture proven to have draws that pass the first and fail the second |
| AC-7 | 3 | …the sweep accepted any throw. **This is what the review exploited**; the sweep now pins type, `code` and template id at each of 114 seeds |
| AC-8 | 3 | …the fixture carried an empty `constraints` array rather than omitting the key. Asserted directly |
| AC-9 | 2 | …the degenerate range succeeded on a later attempt. The draw count is asserted, not just the value |
| AC-10 | 5 | …a brace-free text were the only case tested. Repeated tokens, unused params and empty texts are all swept |
| AC-11 | 4 | …the sweep accepted any throw (**the review's second mutant**), or the module threw on *any* brace. Both closed |
| AC-12 | 4 | …`skill`, `templateId` or `label` were hardcoded. All three now asserted per choice per seed, as the amendment requires |
| AC-13 | 2 | …the answer went into a uniformly random slot with distractors in fixed order — this passes the ±7.75σ band. Discriminated by requiring all 4! orderings |
| AC-14 | 4 | …the module advanced the returned `Rng` while sampling from the original state. Discriminated by the continuation oracle |
| AC-15 | 3 | …the fixture actually carried the keys as `false`. Asserted absent |
| AC-16 | 3 | …the fixture did not really starve T-005. Measured directly first: "built 0, 12 candidates rejected" |
| AC-17 | 3 | …the ordering fixture's keys were already sorted, or the two pre-shuffle readings agreed. Both premises asserted; the code-point/collation pair disagrees on every swept seed |
| AC-18 | 3 | …the module returned `{}` while still burning a draw. Asserted on the PRNG stream, not the params object |
| AC-19 | 4 | …every fixture key were a lowercase single letter, which no narrower renderer would punish. The grammar fixture is chosen so a `[a-z]+` renderer matches **none** of its five keys |

| DoD | Tests | Content |
| --- | --- | --- |
| 1, 3 | 2 | AC↔tag set equality in **both** directions. Not a duplicate of the gate: `spec-lint` checks the reverse direction per *file*, so a tag citing a retired criterion is invisible to it |
| 2 | 1 | No skipped or focused test — one of the eight checks `run-local-gates.sh` performs, and the only one that could silently gut this file. Declared partial; see §7 |
| 4 | 1 | `Math.random`, `Date.now` and the `Date` constructor all replaced with throwing stubs; work done inside that window, compared after restoring |
| 5 | 1 | All four failure paths typed, coded, and naming the template — with `NO_TEMPLATE` asserted as an explicit carve-out rather than skipped |
| 6 | 1 | Behaviour tracks `CHOICE_COUNT`, `RECENT_TEMPLATE_WINDOW` and `MAX_PARAM_SAMPLE_ATTEMPTS`. Limit declared in §8 |
| 7 | — | **Untagged.** See §7 |

---

## 4. RED evidence and gates

Every exit code below was read **without a pipe** — L-036's own footnote, after `cmd | tail`
reported `tail`'s status and nearly recorded a working gate as broken.

| Gate | Exit | Result |
| --- | --- | --- |
| `npx prettier --check .` | 0 | All matched files use Prettier code style |
| `npx eslint . --max-warnings 0` | 0 | Silent |
| `npx tsc --noEmit` | 2 | **Exactly one** diagnostic, quoted below |
| `npx vitest run` | 1 | 1 suite failed, **1229 other tests passed** |
| `.tdd-swarm/spec-lint.sh tickets/T-007.md` | 1 | 19/19 AC PASS, DoD 1-6 PASS, **DoD-7 FAIL** (§7) |
| `tsc -p …/tsconfig.candidate.json` vs reference | 0 | No diagnostics — L-024 satisfied |
| `vitest run` vs reference | 0 | 72 passed (72) |

`tsc`, complete output:

```
__tests__/engine/questions/generator.test.ts(67,63): error TS2307:
  Cannot find module '@engine/questions/generator' or its corresponding type declarations.
```

`vitest`:

```
 FAIL  __tests__/engine/questions/generator.test.ts
Error: Cannot find module '@engine/questions/generator' imported from
'.../.worktrees/wt-T-007/__tests__/engine/questions/generator.test.ts'.
 ❯ __tests__/engine/questions/generator.test.ts:67:1

 Test Files  1 failed | 13 passed (14)
      Tests  1229 passed (1229)
```

**Why this is the right reason.** It is a module-resolution failure at the import of the module
this ticket exists to create, and it is the only one. The file fails as a *suite*, not as an
assertion, so nothing inside it ran; `tsc` names the same import and reports nothing else. The
import is aliased and assigned to an explicitly annotated const, so an unresolved `any` cannot
manufacture `noImplicitAny` errors that would bind the implementer to noise of mine (L-024).

`src/engine/questions/` contains `distractors.ts`, `expr.ts`, `types.ts` and nothing else —
`generator.ts` does not exist.

---

## 5. Mutation matrix

53 mutants, **53 killed**, reference clean, kill counts **1 → 44**. Re-measured in full against
SHA `09b3da13…` after `prettier --write` touched the file — the earlier run described different
bytes, and L-027 says a measurement is evidence only of the state it was taken in.

**Harness proven live before any verdict was trusted** (L-028). A candidate that throws a unique
sentinel produced 159 occurrences of it across 59 of 72 failing tests. The 13 survivors are all
premise or meta assertions that never call the generator — fixture legality checks (AC-2's pool
shape, AC-6's constraint being load-bearing, AC-8's omitted key, AC-15's absent flags, AC-16's
starved distractors, AC-18's schema validity, AC-19's grammar), the `CHOICE_COUNT` constant
check, and the three traceability tests. None of them claims to test the module.

The traceability tests were separately proven non-vacuous: they read 19 declared criteria, 19
cited, 7 DoD checkboxes and `[1,2,3,4,5,6]` cited, and the skip-scanner matches planted
`it.skip`/`xdescribe` source while matching nothing in the suite.

| Mutant | Killed by | Mutant | Killed by |
| --- | --- | --- | --- |
| M01 no recency filter | AC-1 AC-3 DoD-6 | M28 rejects any brace | 14 criteria |
| M02 filter whole history | AC-1 AC-3 | **M29 INVALID typed at one seed** | **AC-11** |
| M03 window − 1 | AC-1 AC-3 DoD-6 | M30 render error omits id | AC-11 DoD-5 |
| M04 window + 1 | AC-1 AC-3 | M31 distractors-first | AC-1 AC-14 **AC-17** DoD-4 |
| M05 no degradation | AC-4 | M32 no shuffle | AC-1 AC-13 AC-14 AC-17 DoD-4 |
| M07 window from the end | AC-1 AC-3 | M33 Math.random shuffle | AC-1 AC-14 AC-17 DoD-4 |
| M08 always first template | AC-1 AC-2 AC-3 AC-4 DoD-4 | M34 correctIndex ≡ 0 | 6 criteria |
| M09 Math.random pick | AC-1 DoD-4 | M35 empty label | AC-1 AC-12 AC-14 DoD-4 |
| M10 Object.keys order | AC-1 **AC-17** | M36 padded label | AC-1 AC-12 AC-14 DoD-4 |
| M11 reverse key order | AC-1 AC-14 AC-17 | M37 three choices | 9 criteria |
| M12 bound − 1 | AC-7 | M38 returns input Rng | 10 criteria |
| M13 bound + 1 | AC-7 | M39 resets Rng | 9 criteria |
| M14 hardcoded window 3 | AC-1 AC-3 DoD-6 | M40 hardcoded templateId | 9 criteria |
| M15 first constraint only | AC-1 AC-6 | M41 hardcoded skill | AC-1 AC-12 AC-14 DoD-4 |
| M16 ignores constraints | AC-1 AC-6 AC-7 DoD-5 | **M42 CONSTRAINTS typed at one seed** | **AC-7** DoD-5 |
| M17 exclusive upper bound | 13 criteria | M43 constraints error omits id | AC-7 DoD-5 |
| M18 no advance between attempts | 10 criteria | M44 NO_TEMPLATE wrong code | AC-5 DoD-5 |
| **M19 rejects `params: {}`** | **AC-18** | M45 mutates input | AC-1 |
| M20 zero-param burns a draw | **AC-18** | M46 hardcoded bound 50 | AC-7 |
| M21 answer off by one | 7 criteria | M47 lower bound off by one | 15 criteria |
| M22 invents own distractors | AC-1 AC-12 AC-16 DoD-4/5 | M48 constraints plain Error | AC-7 DoD-5 |
| M23 rewraps distractor error | AC-16 DoD-5 | M49 INVALID plain Error | AC-11 DoD-5 |
| M24 distractor plain Error | AC-16 DoD-5 | M50 samples from original state | AC-1 AC-6 AC-7 |
| M25 `[a-z]+` token grammar | AC-17 **AC-19** | M51 reaches Date.now | **DoD-4** |
| M26 first token only | 10 criteria | M52 flags always false | AC-1 AC-15 |
| M27 no leftover-brace check | AC-11 DoD-5 | M53 extra field on Question | AC-1 AC-14 DoD-4 |
| | | **M54 localeCompare key order** | **AC-17** |

Eleven mutants die on exactly one criterion, and in every case it is the criterion that owns the
behaviour — the suite discriminates rather than overlapping. The three review mutants (M42, M29,
M19) and my two additions (M24/M48/M49 for the plain-`Error` shape, M54 for collation) are all
caught by their owning criterion.

---

## 6. Ambiguities and proposed amendments

The six findings from round 1 were all accepted into the amendment. Two remain open, one of them
new and load-bearing.

### A-8 (new, load-bearing) — "lexicographically ascending" does not name a collation

**AC-17 says the keys are consumed in "lexicographically ascending" order. It does not say by
which comparison, and AC-19 has just made that difference observable.**

`Array.prototype.sort()` with no comparator orders by UTF-16 code point: every capital before
every lowercase, underscore between them. `String.prototype.localeCompare` applies locale
collation, which interleaves case. On the keys AC-19 now blesses:

```
code point   : ["A_1b2", "Total", "_x", "a1", "z_"]
localeCompare: ["_x", "A_1b2", "a1", "Total", "z_"]
```

The two agree on every lowercase single letter — which is every key in the real catalog, and both
keys in AC-17's own `b`-before-`a` fixture. So nothing in the suite could see the difference.
**Measured, not argued** (L-015): a `localeCompare` implementation passed all 71 tests after every
other fix was in. It is now killed by a second AC-17 fixture keyed `a` and `B` with disjoint
ranges, where code point order, collation order and declaration order are three different things.

I pinned **code point order**, on the reading that lexicographic order over a string alphabet is
order over the underlying code points, and that `localeCompare` is collation rather than
lexicographic order. That is a defensible reading but it is mine, and the cost of being wrong is
the same as the cost AC-17 was written to prevent: two implementations that both look correct
produce different questions from the same seed, and T-024's replay proof fails on real content
the day a template author writes `{Total}`.

**Proposed:** AC-17 should say "ascending code point order (`Array.prototype.sort` with no
comparator), not locale collation", or T-034 should additionally narrow param keys to lowercase,
which collapses the two readings and makes the question moot.

### A-9 (open, systemic) — the DoD gate cannot distinguish requirements from process

L-036 gave the DoD gate teeth, correctly. But a Definition-of-Done list mixes two kinds of item:
requirements on the module (4, 5, 6 here) and requirements on the *process or repository* (1, 2,
3, 7). The gate demands a test for both, and for a process item there is no honest test — only a
hollow one, or a red gate. T-007 lands on the red side by one item. Details and reasoning in §7.

**Proposed:** either mark process items so the gate skips them (a `[process]` prefix the harvester
recognises), or take L-032's other branch and promote the behavioural DoD items to numbered ACs,
leaving the checklist purely procedural and unharvested. The current arrangement makes a
conscientious agent choose between a false green and a red gate.

### Closed by the amendment

- **AC-14's "different parameter draw"** — accepted and rewritten; my statistical test is deleted
  and replaced by the reset comparison the new wording asks for, which is categorical.
- **AC-17** — both orderings now pinned; the owner ruled `[answer, ...distractors]`, matching what
  I had inferred from the step sequence.
- **AC-18** — the zero-parameter branch now has a criterion.
- **AC-12** — `skill`, `templateId`, `label` now required by the criterion text.
- **DoD `NO_TEMPLATE` carve-out** — accepted, and asserted as a carve-out rather than skipped.
- **AC-19 / the `renderText` grammar** — resolved in the suite's favour; the oracle is unchanged.

### Not a defect, worth knowing

AC-16's precondition remains reachable only through float saturation. With
`DISTRACTOR_ABS_FLOOR = 3` and `DISTRACTOR_MAX_RATIO = 2`, T-005's ladder yields three usable
values for every ordinary answer; only at `answer = 2^1023`, where the ULP is ≈2^971, do all rungs
round back onto the answer. `DISTRACTOR_FAILURE` is close to dead code for the real catalog — good
news for T-019, but the fixture is deliberately pathological and a reviewer should read it as such.

---

## 7. What I could not tag, and why

**DoD-7 — "Files changed are exactly those in `file_scopes`" — is untagged, and `spec-lint` is
RED on exactly that line.** Nothing else is uncovered.

The item is a statement about the repository's diff. A unit test of the generator can observe the
module's behaviour and the contents of the working tree, but not which files a branch changed, and
the closest projection available — asserting that `src/engine/questions/` contains no module
beyond the frozen three plus `generator.ts` — would report the item as covered while enforcing
something much narrower. That is exactly L-036's failure mode one level up: a check whose green
means less than its label. I would rather hand back a red line than a green one that misleads.
Per the brief, this is yours to rule on; A-9 above proposes the systemic fix.

For completeness, the honest scope of the other two process items:

- **DoD-2** is covered by one of the eight things `run-local-gates.sh` checks — that no test is
  skipped or focused, the only one whose failure would silently shrink *this file's* coverage
  while every other gate stayed green. The other seven (prettier, eslint, tsc, vitest itself,
  TODO markers, engine purity, the frozen-test commit check) cannot be asserted from inside a
  vitest run without recursion or reaching for git. The script remains their authority, and the
  report says so rather than the tag implying otherwise.
- **DoD-1 and DoD-3** are fully covered, and the test is not a duplicate of the gate: `spec-lint`
  checks the reverse direction per *file*, so a tag citing a retired criterion is invisible to it.
  The set equality closes that direction and runs on every `vitest run`.

Nothing else blocked me. I wrote only the test file, `scratchpad/t007-amend/**` (deleted before
committing) and this report. The write guard fired once, on a compound shell command that
combined a redirect with a mention of the frozen test path — the guard reading a shell write
conservatively, which is the correct direction. I split the command rather than routing around it.

---

## 8. Residual risk

Ordered by what a reviewer should actually look at.

1. **A-8's collation ruling is mine.** I pinned code point order with a derivation, but if the
   owner intends collation, one fixture and one assertion change. This is the single highest-value
   line in the report.
2. **`composeExpected` is the suite's strongest assertion and it is my code.** If it embodies a
   misreading of the seven steps, the misreading is frozen. Mitigated — it was written before the
   reference, from the frozen primitives, and 53 mutants die against it — but read it against the
   ticket's steps line by line.
3. **A lookup-table implementation would still pass the error sweeps.** The review's mutant
   special-cased one seed; mine sweep 114. An implementation special-casing all 114 would survive.
   The seeds are derived and contiguous rather than sparse, which makes that expensive, but it is
   not impossible and no black-box test closes it.
4. **A hardcoded literal equal to a current tuning value is invisible.** `4`, `5` and `100` behave
   identically to the imports today; DoD-6 catches drift *after* a retune, not a literal written
   now. The DoD's "read from `@engine/tuning`" needs a source read at review time.
5. **AC-5 bounds when `NO_TEMPLATE` must be thrown, never when it must not be.** An
   implementation throwing it for some non-empty pool fails elsewhere, but not on AC-5.
6. **Step ordering between failures is unpinned.** A template that would fail both step 5 and
   step 6 could report either code; nothing says which wins.
7. **`ExprError` propagation is unspecified and untested.** Whether a malformed `answerExpr`
   surfaces as `ExprError` or is wrapped as `INVALID_QUESTION` matters for how loudly T-019 fails
   on a content typo.
8. **The eligible pool's order is load-bearing** — `pick` indexes into it — but no criterion
   states it. AC-1's multi-template composition pins it by construction only.
9. **Nothing proves the generator calls `assertQuestion`**, only that its output satisfies it.
10. **The suite reads two files from disk** (the ticket and itself) for the traceability tests.
    Both paths are resolved from `import.meta.url`, matching the existing convention in
    `catalogs.test.ts`, but they will break if the ticket is renamed or moved.
