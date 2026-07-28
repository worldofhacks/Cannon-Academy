# Progress Ledger — Cannon Academy engine core

Append-only. Every state change gets a line. On session start or after compaction,
READ THIS FILE AND `git log` BEFORE DISPATCHING ANYTHING — work marked complete is
complete; resume at the first incomplete ticket. Never re-dispatch finished work.

---

## Phase 0 — Preconditions (2026-07-27)

- Scope locked: `src/engine/**` + `src/content/**` (pure TS). RN/Firebase/EAS out — see posture.md.
- Posture: **mvp** (owner-selected). Test runner: **vitest** (owner-selected).
- `git init` on a previously untracked directory; planning docs preserved untouched.
- Harness scaffolded: vitest 3 + TS strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) + eslint 9 flat + prettier + zod.
- Architecture invariants encoded as lint rules and **proven firing**: engine purity (no React/RN/Expo/Firebase in `src/engine/`), determinism (`Math.random`/`Date` banned).
- Gate scripts written and executed: `run-local-gates.sh` (7 gates PASS), `run-repo-gates.sh` (5 PASS, 1 deferred), `spec-lint.sh` (proven RED on an untested AC).
- Baseline audit was RED (8 high, transitive `brace-expansion`); fixed via `overrides` pin → **0 vulnerabilities**.
- Baseline recorded: 1 test passing, 0 type errors, 0 lint errors, 0 audit findings.
- Lessons seeded: L-001, L-002, L-003.

**Status: Phase 0 COMPLETE — all gates green.** Next: Phase 1 planning.

---

## Phase 1 — Planning (2026-07-27)

- Decomposed `src/engine/**` + `src/content/**` into **24 tickets across 8 waves**
  (`tickets/T-001.md` … `T-024.md`, index in `TICKETS.md`).
- Wave assignment and `file_scopes` exclusivity verified mechanically: every ticket sits at the
  earliest wave its dependencies allow, and no two tickets in a wave share a file. The only
  cross-wave file overlaps are T-022 extending `duel/types.ts` (T-013) and `duel/reducer.ts`
  (T-020), each as sole owner of those files in wave 7.
- All 24 tickets parse under `spec-lint.sh` with contiguous `AC-n` ids; all currently RED, which
  is correct before the Test Agent runs.
- Every ticket has a non-empty `traces_to`. Coverage map and the explicit list of uncovered
  in-scope work: `.tdd-swarm/traceability.md`.
- **16 open questions raised for the human** (traceability.md §2) — unspecified numbers were
  either named as behaviour-pinned `tuning.ts` constants or escalated; none was invented.
- **12 planning gaps recorded** (traceability.md §3), incl. one recommended follow-up ticket
  (captain-name wordlist filter, ARCHITECTURE.md §11).
- No `Eval` rows anywhere: there is no LLM in this codebase.

**Status: Phase 1 draft complete.** Superseded by the rev-2 entry below.

---

## Phase 1 rev 2 — post adversarial plan review (2026-07-27)

Two independent reviewers (coupling/sequencing lens, coverage/testability lens) attacked the plan.
Both mechanically confirmed file/test-scope exclusivity, absence of cycles and back-edges, engine
purity, TS-strict handling, and that no numeric value was fabricated. Two Critical and eight
Important findings were fixed:

- **F1** — `T-005` imported four `tuning.ts` constants without declaring `T-004`. A compile
  failure on dispatch, blocking the test agent a phase earlier. Edge added; T-005 → wave 3.
- **C-1** — `DISTRACTOR_ABS_FLOOR >= 1` made a zero answer's distractor set unbuildable
  (`sub_within_20` legally yields `0`). Now `>= 3`, with `MAX_DISTRACTOR_ATTEMPTS >= 9`; both
  derived from the 9-rung ladder, not chosen.
- **F6** — the damage curve floored `answerQuality` but not the roll, contradicting
  ARCHITECTURE.md:206. **Formula corrected**, T-008 AC-15 added. Side effect: the 4–6 volley
  tolerance tightened to match PLAN.md exactly.
- **I-2** — T-008 AC-16 adds an effect-size floor so a near-zero `QUALITY_WEIGHT` cannot pass.
- **F2/F4/F5** — T-013's action-log AC restated over _required_ fields; T-003 gained exact
  `Question`/`Choice` shapes and a `difficulty?` insurance field.
- **F3** — the `T-018 → T-020` edge was phantom. Dropped; T-024 now drives 1,000 fuzz duels
  through the real scripted and bot opponents, de-orphaning all of `src/engine/opponents/**`.
- **F10, I-1, I-3** and six minors also fixed.

**Wave count 8 → 7**, re-verified mechanically (24 tickets, 347 ACs, no cycles, no back-edges, no
same-wave file or test-scope collisions, every AC id contiguous, every cross-ticket AC citation
resolving). One reviewer claim was **not** accepted: its re-wave table is internally inconsistent
with its own F3 recommendation — see `.tdd-swarm/traceability.md` §4.1 for the arithmetic.

Two items now need the owner, not the planner: **2.18** (T-020 / T-021 exceed the half-day ticket
rule — go/no-go on splitting) and **2.19** (whether `duel/replay.ts` is built at all, the plan's
strongest cut-line candidate). Question **2.2** (Reliable vs Standard on a miss) must be answered
before wave 3 — it is the only open question that could still force a reducer supersede.

**Orchestrator action before dispatching T-002:** add `no-eval` / `no-implied-eval` /
`no-new-func` to the engine+content ESLint block and prove them firing (L-001). They are not in
`js.configs.recommended`, so nothing currently catches aliased dynamic code in the expression
evaluator.

**Status: Phase 1 rev 2 complete.** Superseded by rev 3 below.

---

## Phase 1 rev 3 — owner rulings applied (2026-07-27)

Owner ruled on the open questions at the Phase 1 checkpoint. All five decisions applied and
recorded **in the tickets themselves**, dated, tagged `locked-decision`, so they cannot be
silently reopened.

- **D-1 template count** — floor of 8 per skill, no cap. The owner amended `PLAN.md:73`, so the
  source documents no longer conflict. Also corrected a **planner citation error**: T-014's
  `traces_to` had attributed the "15–25" figure to ARCHITECTURE.md §4.1, which never stated a
  count — it was PLAN.md §Questions all along.
- **D-2 Double-Shot** — shortened timer on the same question pool. `difficulty?: 1 | 2 | 3` stays
  in T-003 as dormant insurance.
- **D-3 Culverin** — `recoilDamage = 0`; "crit" reads as the wide 4–16 spread.
- **D-4 Reliable vs Standard** — identical at the damage layer, flavour only. **No new reducer
  transition, no new phase.** The owner's note that powerful weapons should recoil is already
  satisfied by the Volatile tier (5 / 8 / 10, T-006 AC-4), so nothing follows from it. This was
  the last question that could have forced a T-020 supersede — closed before wave 3.
- **D-5 replay** — `tickets/T-023.md` **deleted**; no `src/engine/duel/replay.ts`. The property it
  proved moved into T-024 as AC-19 (reconstruction over a 200-duel corpus with the log JSON
  round-tripped), AC-20 (negative control), AC-21 (corpus branch coverage), AC-22 (soundness of
  reconstructing an unrecorded choice index). The planner confirms this is an honest proof —
  reasoning in `.tdd-swarm/traceability.md` §4.4. What is lost is the wrapper's own input-validation
  error surface, recorded as gap 3.13 `scope-cut`.
- **2.18 sizing** — owner did not overrule; the planner's disposition is now the accepted one.

**Measured after the changes: 23 tickets, 7 waves, 338 acceptance criteria.** Re-verified
mechanically — no unknown or cyclic dependencies, no back-edges, every ticket at the earliest wave
its dependencies allow, no same-wave `file_scopes` or `test_scopes` collision, AC ids contiguous in
every ticket, every self- and cross-ticket AC citation resolves, every ticket has a non-empty
`traces_to`, prettier clean, all 23 parse under spec-lint.

Still open, none blocking any wave: **2.5** (chest rarity tier count — three was a planner
assumption baked into a wave-1 id union), **2.14** (fog lifts on any one mastered range skill),
**2.16** (captain-name wordlist, gap 3.9, would become T-025).

**Orchestrator action still outstanding, before dispatching T-002:** add `no-eval` /
`no-implied-eval` / `no-new-func` to the engine+content ESLint block and prove them firing (L-001).

**Status: Phase 1 COMPLETE — tickets frozen, awaiting Wave 1 dispatch.**

## Phase 1 — Plan (2026-07-27)

- Planner (opus) decomposed PLAN.md + ARCHITECTURE.md §4 into 24 tickets / 8 waves / 347 ACs.
- **Two adversarial Plan Reviewers dispatched in parallel on different models**, different lenses:
  coverage+testability (sonnet) and coupling+sequencing+architecture (opus).
  Result: **2 Critical, 13 Important**. Both independently CONFIRMED: file/test-scope
  exclusivity holds, no cycles, engine purity across all 24 tickets, TS-strict handling
  correct, and **no fabricated numbers anywhere**.
- Criticals fixed:
  - T-005 imported `tuning.ts` while in the same wave as its owner T-004 — could not have
    compiled in its worktree. (Exclusive file scopes govern _writes_, not _reads_.)
  - `DISTRACTOR_ABS_FLOOR >= 1` made T-005's three-distinct-distractors requirement
    unsatisfiable for a zero answer, which `sub_within_20` legally produces.
- Design corrections (both would have passed their own tests):
  - Damage curve violated ARCHITECTURE.md:206's written guarantee that a slow-but-correct
    answer always lands a respectable mid-range volley. Floor now constrains the roll
    outcome, not just the quality input.
  - `QUALITY_WEIGHT` had no effect-size floor — an implementation could have made
    speed-aimed damage statistically undetectable while passing every AC.
- Orchestrator gate fixes (my own errors, found by review):
  - Determinism/purity lint covered only `src/engine/**`, not `src/content/**`. Extended, re-verified firing.
  - `no-eval` / `no-implied-eval` / `no-new-func` are NOT in `js.configs.recommended` —
    **verified by probe that `eval()` and `new Function()` passed lint silently.** Now
    declared explicitly and verified firing. Load-bearing: T-002 is defined by not using eval.
- Planner rejected one reviewer claim with arithmetic (the proposed re-wave table was
  inconsistent with the recommendation it accompanied). Orchestrator sided with the Planner.
- Plan structure independently re-verified by orchestrator script: 24 tickets, 7 waves,
  347 ACs, no cycles, no back-edges, every ticket at earliest wave, no same-wave collisions.

### CHECKPOINT — owner approved the plan, 2026-07-27

Owner decisions, now locked (recorded in traceability.md §2):

| id  | question                                        | ruling                                                                                                                                                                                                      |
| --- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1 | Template count (docs contradicted: 15–25 vs ≥8) | **Floor of 8/skill, no cap.** `PLAN.md:73` edited to remove the contradiction.                                                                                                                              |
| D-2 | Double-Shot "harder variant"                    | **Shortened timer**, same question pool. `difficulty?: 1\|2\|3` kept as schema insurance.                                                                                                                   |
| D-3 | Culverin recoil ("Volatile (crit)", no number)  | **recoilDamage = 0.** Keeps the K-band starter unable to punish.                                                                                                                                            |
| D-4 | Reliable vs Standard on a miss                  | **Identical** — flavour only, no recoil, no re-answer. Volatile tier (5/8/10) already provides the "powerful guns that punish" the owner wanted. Closed before wave 3, so T-020 cannot be superseded by it. |
| D-5 | Build `duel/replay.ts` (T-023)?                 | **CUT.** Replaced by replay-proof ACs inside T-024's fuzz suite, including a wrong-seed negative control. Engine stays provably replayable; only the wrapper is deferred.                                   |

Still open, none blocking waves 1–3: 2.5 (chest tier count), 2.14 (fog-lift rule),
2.16 / gap 3.9 (captain-name wordlist — the one child-safety promise with no test).

**Status: Phase 1 COMPLETE, owner-approved.** Next: Phase 2 — write and freeze wave 1 tests.

## Phase 2 — Wave 1 tests (RED), dispatched 2026-07-27

Plan re-verified by orchestrator after owner decisions: **23 tickets · 7 waves · 338 ACs**
(T-023 cut per D-5). No cycles, no back-edges, every ticket at earliest wave, no same-wave
file or test-scope collisions. Matches the Planner's reported numbers exactly.

Planner's residual claim that `no-eval` was missing from eslint.config.js was **stale** —
verified present (lines 62-64) and firing by live probe. No action taken.

Guard hook installed and verified by exit code in all four directions
(`.claude/hooks/guard-writes.cjs`, phase file `.tdd-swarm/phase`). See L-007 — the first
version failed OPEN silently because the repo is `"type": "module"`.

Worktrees created off `swarm/engine-core`, each with a symlinked `node_modules`
(verified vitest runs inside a worktree):

| ticket | branch                           | worktree                | test agent model |
| ------ | -------------------------------- | ----------------------- | ---------------- |
| T-001  | `ticket/T-001-seeded-prng`       | `../cannon-wt/wt-T-001` | sonnet           |
| T-002  | `ticket/T-002-safe-expr-eval`    | `../cannon-wt/wt-T-002` | opus             |
| T-003  | `ticket/T-003-schemas-and-types` | `../cannon-wt/wt-T-003` | opus             |

`phase=tests` written into each worktree, so the guard blocks any write to `src/`.
Three Test Agents dispatched in parallel. Next: verify RED for the right reason, then
independent test-design review before freezing.

### Wave 1 test authoring — results

| ticket | tests | ACs | RED verified by orchestrator                        | pre-freeze defects caught                                                                                                                                                                                              |
| ------ | ----- | --- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-001  | 19    | 12  | ✅ fails only on `Cannot find module '@engine/rng'` | `weightedPick` entry field named `value`, colliding with T-009's `{item, weight}` — would have hit a frozen file in wave 3 (L-004 class)                                                                               |
| T-003  | 85    | 20  | ✅ fails only on the two absent modules             | zod stripped unknown keys by default (silent data loss on a typo'd optional field in a hand-authored catalog); `crewSchema` had no criterion at all; id-array export names unnamed; nested `unlock` strictness missing |

Both Test Agents flagged ambiguities instead of guessing silently. The T-003 agent built a
throwaway probe implementation in the scratchpad (never in `src/`) to prove its criteria were
satisfiable, then mutation-tested every frozen assertion — M9 proved AC-20 catches what AC-19
provably cannot, and M10 proved that covering all three `unlock` variants catches an
implementation that strictens only the `range` branch.

Ticket amendments made before freeze (orchestrator):

- T-001: `weightedPick` entries locked to `{ item, weight }`; two `proposed` API decisions
  promoted to `locked-decision` because five tickets couple to them.
- T-003: AC-18 (crew schema), AC-19 (reject unknown keys), AC-20 (nested strictness);
  id-array export names locked.

Orchestrator errors found by agents and fixed: `.claude/hooks/guard-writes.cjs` was committed
unformatted, which would have shown every implementer a red format gate they did not cause
(the agent correctly refused to fix a file outside its scope and reported it instead).

Lessons added: L-008 (worktrees must branch from a committed state), L-009 (default-permissive
validation silently loses data).

### Wave 1 — test-design reviews (the highest-value gate so far)

Each suite was attacked by an independent reviewer that built a **deliberately lazy but
plausible implementation** and measured which cheats survived. Both completed reviews returned
**DO NOT FREEZE**, and neither defect would have failed a test.

**T-001 — 3 Critical.** The reviewer's cheats, measured against the frozen bands:

- A `shuffle` swapping index 0 with one random position and leaving positions 1–9 in input order
  scored **946–1050 at index 0** — inside the required [700,1300] — while producing only **4 of
  24 permutations**. It also passed the new-array, no-mutation, and is-a-permutation assertions.
  T-007 uses `shuffle` to place the correct answer among four choices, so this freezes a
  predictable answer slot: a child learns the position, not the math (ARCHITECTURE §9.1's
  catastrophe class). The classic biased n-pass swap also passed, by 34 counts.
- A `nextInt` advancing the `Rng` correctly but deriving its VALUE from a module-scoped counter
  scored a perfect [10000×6] and passed **every test in the file**, while making draws a
  function of process history rather than the serialised seed — destroying replay after relaunch.
- `pick = items[0]` passed, as did returning a bare value instead of a `[value, nextRng]` tuple.
  Verified CLEAN: the mulberry32 oracle, checked character-by-character against the ticket
  pseudocode and executed against canonical mulberry32 over 11 seeds × 200 draws — **0 mismatches**,
  including the `4294967295` edge case. The expensive thing to get wrong was right.
  → AC-8, AC-9, AC-11 extended; AC-13 (purity of all five draw functions) and AC-14 (readonly
  array params) added.

**T-003 — 3 Critical.** The lazy implementation passed **85/85 with clean typecheck**:
`maxGrade > minGrade` (rejecting legal single-grade skills T-006 authors), ten id-union fields
as `z.string()` (making `Cannon['skill']` resolve to `string` everywhere downstream), and
`Question`'s field types unpinned except two booleans.
→ AC-10 amended; suite grown 85 → **116 tests**. Re-verified: the same lazy implementation now
fails **27 tests + 15 type errors**; a correct implementation passes 117/117 with tsc exit 0.
Over-constraint checked in both directions — valid alternative implementations still pass.

### Status

| ticket | tests          | design review              | state                                             |
| ------ | -------------- | -------------------------- | ------------------------------------------------- |
| T-001  | 19 → hardening | 3 Critical                 | Test Agent fixing                                 |
| T-002  | 229            | review running             | —                                                 |
| T-003  | **116**        | 3 Critical, **all closed** | **tests FROZEN**, implementer dispatched (sonnet) |

Worktrees rebased onto the integration branch, closing the L-008 staleness (I5 in the T-003
review). `phase=implement` set in wt-T-003 and the guard verified flipping: edits to frozen
tests now blocked (exit 2), writes to `src/` allowed.

### T-001 hardened and frozen

Suite grown 19 → 27 tests (14 ACs). Cheat-mutation verified by the Test Agent against a
correct implementation in a sandbox:

| cheat                         | outcome                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------- |
| correct implementation        | 31/31 pass, tsc clean                                                        |
| `oneSwap` shuffle             | caught — index-5 count 0, only 4/24 permutations                             |
| `naiveSwap` shuffle           | caught — passes BOTH index bands, fails permutation count at 827 < 850       |
| counter-based `nextInt`       | caught — scores a perfect [10000×6] on AC-5, fails AC-13 purity and cascades |
| `pick = items[0]`             | caught — 0/10000 for 9 of 10 elements                                        |
| `pick` returning a bare value | caught at compile time by the tuple destructuring                            |

Also took M-4: bulk loops converted to collect-then-assert-once; suite runs ~35ms (was 2.8s).

Worktree rebased a second time — the ticket had been amended (AC-13, AC-14) _after_ the first
rebase, so it went stale again. Verified current at 14 ACs before freezing.

`phase=implement` set, guard verified flipping. Implementer dispatched (sonnet, per model_hint).

Lesson L-012 recorded: aggregate assertions certify the projection, not the mechanism.

## Phase 4 — Wave 1 ticket verification

Orchestrator re-ran every local gate itself in both worktrees before accepting any DONE:
format, lint, typecheck, unit, no-TODOs, no-skipped-tests, engine-purity, spec-lint — all green,
and **zero test files modified by implementer commits** (verified at commit level).

**Ticket T-003: review-passed** (commits ..fb5f78d, gates pass, wave 1)

- Code review: **APPROVED** — 20/20 ACs, 8/8 DoD, no Critical/Important. Reviewer verified the
  derived types with its own `Exact<>` probes rather than trusting the frozen tests, confirmed
  `.strict()` on all six schemas AND all three `unlock` variants, and confirmed the id unions are
  _consumed_ by schema fields rather than merely declared (the L-012 failure mode). Zero `!`,
  `as`, `any`, or ts-suppressions. Four Minor findings recorded, none blocking.
- Security review: **PASS**. Prototype pollution checked by reading the installed zod source
  (`parseUtil.js` guards `__proto__` for `ZodRecord`), not by assumption.

**Ticket T-001: CHANGES REQUIRED** (attempt 1)

- Code review verified the mulberry32 transcription token-by-token against the ticket pseudocode
  — **exact**, ruling out the "test and implementation agree with each other but both drift from
  the spec" failure. `shuffle` read as an algorithm and confirmed textbook Fisher-Yates with the
  inclusive upper index. Spec compliance 14/14, DoD 7/7, no Iron Law violation.
- **I-1 (Important, real bug):** the internal bounds helper tests whether the retrieved VALUE is
  `undefined` rather than whether the INDEX is in range. `T` is unconstrained and
  `noUncheckedIndexedAccess` makes `(T | undefined)[]` routine. Measured: `shuffle` throws for
  **37 of 50 seeds** on `[undefined, 1, 2, 3]`; `pick` for 14 of 50; and the message claims
  "index 3 out of bounds" for an in-bounds index. The implementation report called this
  "practically unreachable" — factually wrong.
- Non-finite weights flagged independently by BOTH the code review and the security review.
- **Handled by spec-then-test, not by patching:** the Iron Law forbids production code no failing
  test demands, so AC-11 was extended and AC-15/AC-16 added, and the Test Agent was re-dispatched
  (`phase=tests`) to restore RED before the implementer fixes anything.

**Ticket T-002: tests-written**, design review returned 1 Critical + 2 Important; Test Agent
hardening. See L-013 — the anti-eval guard did not guard.

### Wave 1 test suites — final frozen state

| ticket | tests | ACs | growth                | every addition driven by                               |
| ------ | ----- | --- | --------------------- | ------------------------------------------------------ |
| T-001  | 41    | 16  | 19 → 27 → 41          | a measured cheat, then a real bug found in code review |
| T-002  | 296   | 24  | 194 → 229 → 282 → 296 | a measured cheat that survived the previous version    |
| T-003  | 116   | 20  | 85 → 116              | a lazy implementation that passed 85/85 clean          |

T-002's Test Agent, after materially changing its reference implementation for AC-24, **rebuilt
and re-ran all five earlier cheats** rather than assuming they still bite — and found the eager
`&&`/`||` cheat now correctly trips an AC-24 test as well. Cheat isolation is clean throughout:
each cheat fails only its own criterion, so the tests discriminate rather than overlap.

T-002 also deliberately left ONE case unpinned (an operand that is both unresolvable and
wrongly typed — `UNKNOWN_IDENTIFIER` vs `TYPE_MISMATCH` depends on static-pass ordering, and no
criterion rules on it). Recorded in the suite as a decision, not an oversight. That is review
finding M-3, still open and non-blocking.

All three suites frozen. `phase=implement` set in every wave-1 worktree, guard verified blocking
test edits by exit code in each.

**Ticket T-001: review-passed** (attempt 2, commits ..10ac7f9, gates pass, wave 1)

- Round-2 code review: **APPROVED** — 0 Critical, 0 Important. Round-1 findings I-1, M-1, M-2,
  M-3 all fixed.
- The M-3 normalisation (`state` → true uint32) was the risky change, since it touches the state
  threaded through every random draw in the game. Confirmed safe **algebraically** — the step's
  `| 0` re-reduces mod 2³², so `>>> 0` changes the representative but never the residue class —
  and empirically over 10 seeds × 20,000 draws with 0 mismatches. Orchestrator independently
  verified the stream against a self-transcribed oracle (4 seeds × 100 draws, identical).
- Reviewer verified the Test Agent's seed choice had teeth by replaying the OLD buggy code
  against the CURRENT stream: at seed 0 all three AC-16 tests would have gone red.
- Orchestrator probe: `shuffle`/`pick` on arrays containing `undefined` now throw **0/50 seeds**
  (was 37/50 and 14/50).
- **N-1 (Minor, accepted):** the M-2 invariant `throw` IS reachable in two float regimes the
  comment calls impossible — total overflowing to `Infinity` (3000/3000) and denormal weights
  where absolute rounding lets `f × total` reach `total` (1496/3000). Not a regression, and
  unreachable from this game's data. Comment-only correction dispatched; no behaviour change,
  since a guard is production code no failing test demands.
- **Advisory recorded on T-013 and T-021:** `createRng` now throws on wide seeds instead of
  truncating, so anything seeding from `Date.now()`, a hash, or a composed id must mask with
  `>>> 0` first.

Lesson L-015 recorded: "unreachable" is a claim that needs a probe, not an argument — a
reviewer's own clean proof of unreachability was disproved by measurement on re-review.

### T-002 implementation + security review

Implementation `a16b864`: tokenise → recursive-descent parse → static check pass (identifier
resolution, whitelist/arity, typing) → evaluation pass with short-circuiting. 297/297 tests,
all local gates green, spec-lint 24/24, zero test files touched.

Orchestrator ran an **independent** codegen-poisoning probe (separate from the frozen suite's
AC-21 trap): no route touched. Spot-checked `a+b*c=14`, `7/2=3.5`, `-7%2=-1`, `gcd(12,18)=6`,
`sqrt`→`UNKNOWN_FUNCTION`, `1e3`→`PARSE_ERROR`, static identifier resolution, short-circuiting.

Implementer applied L-015 correctly: rather than claiming three TS-exhaustiveness guards were
unreachable, it probed **36,792 public-API calls** (0 hits) with a teeth-check proving the
matcher fires on a synthetic message.

**Security review: PASS** (no Critical). Primary invariant — no code construction — confirmed
clean by source read, and caller-controlled property access verified safe by live probe
(`__proto__`, `constructor`, `toString` all resolve to errors, never a prototype hop).

Two **Important** findings, both reproduced by execution:

- **DoS / contract breach:** `MAX_NESTING_DEPTH = 64` counts only paren and call nesting. Chained
  binary/logical operators without parentheses parse _iteratively_ (so the limit never trips) but
  build a left-deep AST walked with native recursion. `'1' + '+1'.repeat(10000)` crashes with an
  uncaught `RangeError`, **not** an `ExprError` — breaching the module's "every failure is an
  ExprError" contract and the spirit of AC-15 ("rather than overflowing the stack"). The frozen
  test covered only one shape of the threat.
- **Numeric integrity:** doc comments claim "never NaN, Infinity", but `+`/`-`/`*` overflow is
  unguarded (only `/`,`%` check zero) and raw `env` values are never `Number.isFinite`-checked.
  `a*a` with `a=1e200` returns `Infinity` silently.

Both are the same class: the module's stated contract is not enforced at its boundaries. Holding
the amendment until the code review lands so both are handled in one spec-then-test round.

**Ticket T-002: code review round 2 APPROVED** — 26/26 ACs, 7/7 DoD (the failing one now passes),
0 Critical, 0 Important, 5 Minor.

The reviewer verified the guard placement structurally and then probed **six consumption routes
the implementer's own four did not cover** — right-hand argument, negated argument, nested call,
`gcd` of a `gcd`, parenthesised, and `min(a*a, 1)`. All `NON_FINITE_VALUE`. The last is the
sharpest: `Math.min(Infinity, 1)` is a perfectly finite `1`, and it is still rejected, proving the
guard sits genuinely upstream of function application.

`MAX_AST_DEPTH` verified by induction — three growth sites, leaves height 1, parens adding neither
height nor a walk frame — with no bypass across nine shapes, including 64 parens around a
1024-chain evaluating to exactly 1024.

**The margin is thinner than the implementer measured.** Rather than accept the docblock's
"4,000–4,688 across three machines", the reviewer lifted the cap in a scratch copy and bisected at
controlled stack sizes: 18.3× margin at 4 MB (Node default), **3.4× at 1 MB (browser main
thread), 1.5× at 0.5 MB (constrained worker)**. The docblock's figure is Node-only presented as
host-general, overstating browser headroom ~2×. Also run-dependent, which argues _for_ the fixed
cap. Not blocking — breaching needs a host under ~0.35 MB, and height 1024 is ~100× taller than
any plausible template (`floor(a/b)+c` is height 4).

38 realistic template expressions and constraint predicates: **0 regressions**. Extreme-but-finite
inputs (`1e150*1e150`, `MAX_SAFE_INTEGER`, denormals, `gcd(1e308, 5e-324)`, 308-digit literal,
200/500-term chains) all evaluate in 0–1 ms — no slow-`gcd` path.

Minor-fix pass dispatched (docblock correction plus four carried Minors — three of which I had
dropped when forwarding only the Critical/Important findings; my omission).

**T-025 filed to backlog**: convert the three recursive walks to explicit-stack iteration, turning
AC-26 from "holds with a measured margin" into "holds by construction". Raised by the implementer
as its own residual concern and confirmed by the reviewer's measurements. Not wave-assigned —
this is robustness work, not a live defect, and Hermes' stack budget is unmeasured by this run.

**Ticket T-002: review-passed** (attempt 2, commits ..917f8b0, gates pass, wave 1)

Minor-fix pass closed all five. Two pieces of method worth keeping:

- **No behaviour change was measured, not asserted:** a differential probe ran the approved build
  and the new one side by side over 9,631 expressions × 12 environments × both entry points =
  **231,144 paired calls**, comparing returned value or thrown code. Zero divergence, comparator
  teeth-checked.
- **Dead code removed with evidence, not argument:** rather than claim `requireFinite` on the
  literal path was unreachable, the implementer instrumented the branch with a distinctive marker
  — **0 hits** across a 93-case corpus placing an oversized literal in every syntactic position —
  then deleted the tokenise guard as a teeth check and got **87 hits from the same 93**. Each
  value class is now guarded exactly once, at its only producer, with the measurement cited in the
  comment. This is L-015 done properly.

The `MAX_AST_DEPTH` docblock now states the margin per host class (18.3× / 3.4× / 1.5×), records
the run-dependence, and says plainly that the cap is a margin rather than a proof because the
walks still recurse — pointing at T-025.

**WAVE 1 COMPLETE — all three tickets review-passed.**

| ticket | module                                            | source | tests | ACs | attempts |
| ------ | ------------------------------------------------- | ------ | ----- | --- | -------- |
| T-001  | `engine/rng.ts`                                   | 134    | 41    | 16  | 2        |
| T-002  | `engine/questions/expr.ts`                        | ~700   | 335   | 26  | 2        |
| T-003  | `content/schemas.ts`, `engine/questions/types.ts` | 264    | 116   | 20  | 1        |

Next: Integration Agent merges the three ticket branches into `swarm/engine-core` in dependency
order, runs repo gates, and checks architecture drift against ARCHITECTURE.md §4/§8.

---

## Wave 1 integration — PASS (`1eb9cf8..ac34693`)

Three branches merged into `swarm/engine-core` with `--no-ff` in id order. **Zero conflicts** —
the branches touched strictly disjoint file sets, so nothing semantic had to be resolved. Net
diff: 9 files, 4,689 insertions, 0 deletions. `package.json` / `package-lock.json` byte-identical
to both the pre-merge tip and `main` — no runtime dependency entered in this wave.

| gate                               | result                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `run-local-gates.sh`               | exit 0 — format, lint, typecheck, unit, no-todos, no-skipped-tests, engine-purity all PASS |
| `spec-lint.sh` × T-001/T-002/T-003 | exit 0 — 16 / 26 / 20 ACs mapped, both directions                                          |
| `npx vitest run`                   | **492 passed (492)**, 5 files, **1.00s**                                                   |
| `npm audit --audit-level=high`     | exit 0 — `found 0 vulnerabilities` (ran offline, not skipped)                              |

**The 1.00s suite time was investigated rather than accepted.** T-002's four `node:worker_threads`
non-termination tests do execute — verbose reporter shows them at 41–76 ms each. The 3 s figure is
a _timeout ceiling reached only by a non-terminating implementation_, not a fixed cost. The suite
is fast because the implementation rejects non-finite values before `gcd`'s Euclid loop. Worth
remembering before anyone "optimises" that harness away.

**Cross-ticket compatibility verified — this was the wave's only unverified surface.** A scratchpad
integration probe (10 assertions, written outside `src/`/`__tests__/` and deleted afterwards) ran
all three modules in one process along the real generation path: `templateSchema.parse` → `createRng`

- `nextInt` per param → `evaluatePredicate` rejection sampling → `evaluateNumber` for answer and
  distractors → `shuffle` → `Question` with `SkillId` → `assertQuestion`. All green, plus: same seed
  reproduces the identical question, the three error taxonomies (`ExprError`, `QuestionGenerationError`,
  `RangeError`) stay distinct in one process, and export namespaces are fully disjoint (no shadowing).

Alias resolution proved with a **negative control**, not just a green typecheck: a temporary file
assigning an invalid literal to `SkillId` was rejected by `tsc`, so `@content/schemas` is carrying the
real literal union across the boundary rather than degrading to `any`. Engine runtime purity
confirmed empirically — `@engine/questions/types` exports exactly
`['QuestionGenerationError', 'assertQuestion']` at runtime, so the `import type` is fully erased and
zod never enters the engine module graph.

### Drift findings

- **NOT drift — `ExprErrorCode`'s 7th member (`NON_FINITE_VALUE`).** ARCHITECTURE.md describes T-002's
  subject only as a "tiny safe evaluator over params" and never enumerates an error taxonomy. There is
  no documented contract to drift from; a sharper failure taxonomy honours the architecture's actual
  commitment rather than violating it. Below the doc's altitude. No amendment needed.
- **NOT drift — `createRng` throwing on out-of-range seeds.** §4.1/§4.2 commit to "seeded PRNG
  (mulberry32), seed carried in state"; `Rng` is still a plain JSON-serialisable `{state}`. Seed
  _domain_ is unspecified at architecture altitude, so this is input validation, not a contract change.
  Correctly propagated already via `4ec6bf8` — recorded, not absorbed.
- **FINDING (Minor), ESCALATED — `templateSchema` is looser than §4.1 on distractor count.**
  §4.1: _"one correct answer plus three engineered distractors"_, four-choice universally.
  `schemas.ts` implements `.min(3)`. Verified: a 4-distractor template **parses successfully**, and the
  resulting 5-choice `Question` is then rejected by T-003's own `assertQuestion` with `INVALID_QUESTION`.
  Two wave-1 modules disagree about one invariant. **Origin is the ticket spec, not the implementer** —
  `tickets/T-003.md:58` says `distractors: string[] (>=3)` and AC-4 says "at least three"; the frozen
  tests pin `>=3`. Fails safe but _late_ (generation time, not content-validation time, which is where
  §4.1 put the catch). No repair ticket written: this is not a gate failure and the fix depends on owner
  intent — tighten to `.length(3)` and re-freeze AC-4, amend §4.1, or accept as deliberate headroom and
  record why. **Must not be closed silently.**

Full evidence: `.tdd-swarm/reports/wave1-integration.md`.

Next: wave 2 (T-004 tuning, T-006 catalogs) — both depend on T-003, now on `swarm/engine-core`.

## Wave 2 — dispatched 2026-07-28

Wave 1 worktrees torn down. Wave 2 worktrees created from a **clean committed tree** (L-008
observed: `git status --porcelain` verified empty first, and each worktree's ticket hash compared
against the integration branch before dispatch).

| ticket                      | tests | mutants killed                                | model  |
| --------------------------- | ----- | --------------------------------------------- | ------ |
| T-004 `tuning.ts`           | 68    | 34/36 (2 survivors documented as intentional) | sonnet |
| T-006 catalogs + loaders    | 209   | 16/16                                         | sonnet |
| T-026 exactly-3 distractors | 5     | —                                             | haiku  |

**Ticket T-026: review-passed** (commit `f8dd39f`, gates pass, wave 2). One line:
`z.array(z.string()).min(3)` → `.length(3)`. Review confirmed `.length(3)` does **not** narrow the
inferred type to a tuple — `Template['distractors']` stays `string[]`, which runtime tests cannot
see — and that zod emits `"Array must contain exactly 3 element(s)"` with path `["distractors"]`,
locating the field for a catalog author. 497/497.

Security review for T-026 **deferred with a written reason** in `posture.md` (one-line tightening
of an existing validator adds no input surface or code path); explicitly scoped so it does not
generalise.

### Pre-freeze findings from the wave-2 Test Agents

**T-004 — three real spec defects, all the L-005/L-006 patterns wave 1 produced:**

- AC-4 contradicted its own rationale at exactly 8: at the boundary a floor-sized skill pool is
  _fully_ excluded, so T-007's fallback fires on every call and the recency feature is a permanent
  no-op. Corrected to `<= 7`.
- AC-8's `BOT_ACCURACY_WINDOW >= 1` was unsatisfiable for its own consumer — T-021 needs a
  10-answer history, and at 1 the mercy system degenerates to a coin flip on the last answer.
  Corrected to `>= 10`.
- AC-3/AC-6/AC-8 pinned **direction without magnitude**. The effect size for `QUALITY_WEIGHT` was
  deferred to T-008 AC-16 — two waves _after_ `tuning.ts` freezes. Derived in closed form from
  T-008's own formula and asserted here instead: `QUALITY_WEIGHT > 7/12`, set by `culverin` and
  `double_broadside`. Mutation shows the test bites exactly there (`0.5834` passes, `0.55` dies).
  Recorded as **L-018**.
- Also ratified: AC-9's freeze is **deep** (`as const` freezes nothing at runtime), and AC-2 gains
  a `4 * PLAYER_HULL` ceiling so no later island can be given an unwinnable hull.

**T-006 — ratified three gaps the agent flagged rather than invented:** `validateCatalogs`'
signature (pinned by no AC), `culverin.recoilDamage = 0` (pinned by no AC at all, only by ruling
D-3's body text — and it is exactly the value keeping the K-band starter unable to punish), and
`crew.json` contents (unconstrained, so AC-1 would have passed vacuously on an empty array).

**T-026 — the Test Agent caught an orchestrator error.** The ticket claimed a frozen test asserted
a 4-distractor template parses successfully, and on that basis **authorised a frozen-test edit**.
The claim was false — transcribed from an integration report that verified the _behaviour_ with an
ad-hoc probe, not a test. The agent probed all four historical revisions of the file, found no such
assertion, and made a purely additive change. Recorded as **L-019: never pair an unverified claim
with an authorisation.**

### Wave 2 implementations + security review

**T-004** (`7a12402`): 32 constants, 560/560. Orchestrator probe confirmed the values that matter
as _relationships_ rather than magnitudes: `QUALITY_WEIGHT = 0.7` clears the derived `> 7/12`
effect-size floor (L-018); `RECENT_TEMPLATE_WINDOW = 5 <= 7`; `BOT_ACCURACY_WINDOW = 10`;
`DISTRACTOR_ABS_FLOOR = 3`; hull curve 45/60/75/95/120 monotone and all under `4 × PLAYER_HULL`;
`ONBOARDING_ENEMY_HULL = 24 < 45`; **deep freeze holds on nested objects** (what `as const` does
not give you); no non-finite numeric export.

**T-006** (`e5f21fe`): five catalogs + validated loaders, 701/701. Orchestrator verified coherence
**directly from the raw JSON**, independent of the code under test: unlock relation agrees in both
directions; island order contiguous from 0 with exactly one root (`port_sumwich`); every skill
taught by ≥1 cannon; grades 0–5 with no gap; rank `tier` and `minWins` both strictly increasing;
starters `swivel_gun` 8–12 reliable / `culverin` 4–16 volatile recoil 0 on the same symbolic-only
skill; volatile recoils 5/8/10; no URLs.

_Orchestrator false alarm, recorded for honesty:_ my first probe failed to load the catalogs at all
under raw Node ESM (`ERR_IMPORT_ATTRIBUTE_MISSING`). That read as a portability defect until I
checked the project's own config — `moduleResolution: "bundler"` targeting Metro, where bare JSON
imports are correct, and vitest agrees. **The probe was wrong, not the code.** Same class as the
T-002 implementer's "100,000 … never a RangeError" claim: a measurement that swept the wrong axis.

**Security review (T-004 + T-006): PASS, no Critical or Important.** Verified by executed probe,
not argument: deep freeze sound at every level; lookup helpers structurally immune to prototype
pollution (array `.find` with `===` cannot match a prototype member — probed with `__proto__`,
`constructor`, `prototype`, `toString`, `hasOwnProperty`, `valueOf`; all throw, `Object.prototype`
stays clean); no dynamic code construction in any spelling; no `Math.random`/`Date`; no URLs,
emails, paths or PII in the catalogs; dependencies unchanged.

Informational, non-blocking: a malformed bundled catalog hard-crashes the module graph at import
with no in-app recovery. Judged the right trade for developer-authored, CI-validated content, and
the frozen suite asserts the shipped catalogs validate before reaching a device.

**Ticket T-004: review-passed** (attempt 2, commit `6136bc3`, gates pass, wave 2)

Code review found one Important: `ONBOARDING_ENEMY_HULL = 24` sank the tutorial sloop in **two**
volleys, not the three PLAN.md:75 promises. In a guided duel that points at the correct tap the
player is _always_ inside the Perfect-Shot window, so each Swivel volley deals 13 and two reach 26.
AC-12 pinned only a ceiling, and the frozen test reached for the floor but stopped one volley short
— excluding a one-volley tutorial and omitting the Perfect-Shot bonus.

**Fixed via spec → test → code, not a patch.** AC-12 amended to the window `[27, 30]`; the Test
Agent tightened the floor **derived from `SWIVEL_DAMAGE_MAX + PERFECT_SHOT_BONUS_DAMAGE`** rather
than hardcoded, and proved the derivation tracks: mutating the bonus `1 → 2` raises the floor and
turns a previously-passing hull red. Boundary swept: RED at 24 and 26, GREEN at 27/28/30, RED at 31.

Orchestrator verification of the shipped value, against the real catalog rather than assumed
constants:

```
ONBOARDING_ENEMY_HULL = 28
  Swivel best volley  = 13 -> 3 volleys   (needed >= 3)
  Swivel floored-slow = 10 -> 3 volleys   (needed <= 3)
  OLD value 24 at best speed -> 2 volleys  <- the defect
  Culverin best volley = 17 -> 2 volleys   <- why T-018 must lock the Swivel
  first real duel (port_sumwich 45) -> 4-5 volleys (PLAN: 4-6)
```

The tutorial now takes three volleys _however fast the child answers_, which is stronger than the
criterion required.

_Second orchestrator false alarm, recorded:_ my verification probe guessed `SWIVEL_DAMAGE_MAX` as
a `tuning.ts` export and produced `NaN`. Per-cannon damage correctly lives in the catalog, not
tuning. The probe was wrong, not the code — the same shape as the JSON-import false alarm earlier
in this wave. Verifying the verification is not optional.

**WAVE 2 COMPLETE — all four tickets review-passed.**

| ticket | deliverable                            | tests | ACs | attempts |
| ------ | -------------------------------------- | ----- | --- | -------- |
| T-004  | `engine/tuning.ts` (32 constants)      | 70    | 12  | 2        |
| T-006  | 5 catalogs + validated loaders         | 209   | 16  | 2        |
| T-026  | `templateSchema` exactly-3 distractors | 5     | 5   | 1        |

Follow-ups filed to backlog: **T-025** (iterative walks in the evaluator), **T-027**
(`validateCatalogs` set-level corruption).

## Wave 2 — integrated 2026-07-28

**Merged into `swarm/engine-core` (`c5a3fc9..5ec09f6`) — integration PASS.** Independent
integration agent; wrote none of this code and patched none of it. Full evidence:
`.tdd-swarm/reports/wave2-integration.md`.

Three `--no-ff` merges in ticket-id order, **all clean** — `1eb39b7` (T-004), `cd59688` (T-006),
`5ec09f6` (T-026). Strictly disjoint file sets: T-006 and T-026 share `src/content/` but T-026's
only source edit is `schemas.ts:81`, which T-006 never touches.

Gates on the merged tree: `run-local-gates.sh` exit 0 (`== ALL LOCAL GATES PASS ==`), spec-lint
exit 0 for all three tickets (12 + 14 + 5 ACs, reverse direction clean), `npm audit
--audit-level=high` → **0 vulnerabilities**, `package.json` / `package-lock.json` **byte-identical**
to `c5a3fc9`.

### Test count corrected: 776, not 68-era 774

The wave-2 forecast of 774 was computed from the **68** recorded above at T-004's _first_ freeze.
The real figure is **70** — after the code review found the two-volley onboarding defect, AC-12 was
amended (`b2c7a4a`), the suite was **re-frozen** with +2 tests (`9d592ba`: the "no fewer than three
volleys" floor and the "window is non-empty" guard), and only then was the constant changed
(`6136bc3`, `src/engine/tuning.ts` only). Timestamps confirm spec 09:40 → test 09:43 → code 09:45.
The table above is corrected to 70. **776/776 pass, 7 files, 1.52s.** No test file was touched by
any implementer commit — verified over the whole merge range.

### Cross-ticket compatibility — VERIFIED

A 19-assertion integration probe (scratchpad only, deleted; repo tree untouched) exercised all
three modules in one process for the first time. All green:

- **`ENEMY_HULL_BY_ISLAND` × the islands catalog.** Keysets **exactly equal** and both equal
  `ISLAND_IDS`; hull rises monotonically along the catalog's own `order` (45→60→75→95→120), which
  T-004's tests could only check against a hardcoded order.
- **Referential integrity.** All 10 cannons' `skill` resolves; all `rangeSkills`,
  `unlocksCannons`, `requiresIsland`, and `unlock.island` resolve; all 9 `SKILL_IDS` are authored.
- **T-026 × T-006 — the tightening is inert, and that was _verified, not assumed_.** No entry in
  any of the five catalogs carries a `templates` or `distractors` field at all (checked entry by
  entry). `templateSchema` accepts 3 distractors and rejects both 4 and 2 on the merged tree.
  T-006's **import-time** validation ran against T-026's modified schema module and passed.
- **The headline fix holds.** The catalog's `swivel_gun` is `damageMin 8 / damageMax 12` — matching
  the literals T-004's frozen tests were forced to hardcode (they could not import `@content`).
  Simulating **every** legal per-volley damage for a correct answer (10..13) against
  `ONBOARDING_ENEMY_HULL = 28` gives **exactly 3 volleys in every case**.

### Drift findings

- **CLOSED — wave 1's escalated `templateSchema` Minor.** T-026 shipped the "tighten to
  `.length(3)` and re-freeze" resolution; the probe proves it closed on the merged tree. The
  invariant now fails at content-validation time, where §4.1 put the catch, instead of late at
  `assertQuestion`. Wave 1's open-finding note in `TICKETS.md` marked closed.
- **FINDING (Minor), ESCALATED — `CHOICE_COUNT` now has two homes.** `src/engine/tuning.ts:120`
  exports it (T-004) and `src/engine/questions/types.ts:44` keeps a module-local `const` (T-003).
  §4.3 (_"All tuning constants live in one file"_) and §8 (_"every magic number, one file"_) state
  the rule absolutely, and `T-004.md:50` claims `CHOICE_COUNT` for `tuning.ts`. T-003 was correct
  at the time — no `tuning.ts` existed — so **the merge itself creates the drift**, and no ticket
  is assigned to collapse it (T-005 and T-007 both consume the tuning copy, so the shadow persists).
  Not a gate failure: both hold `4`. But §4.3's stated purpose is the `app/dev.tsx` slider, and
  moving the value there would leave `assertQuestion` checking a stale literal and throwing
  `INVALID_QUESTION` on every question — defeating exactly the capability the rule protects.
  **No repair ticket written and no code patched:** the one-line fix re-opens a review-passed
  wave-1 file with frozen tests, which is an owner call. Recorded in `TICKETS.md`.
  **Must not be closed silently.**
- **NOT drift — `templateSchema` tightening.** §4.1's prose already fixes the count twice ("three
  engineered distractors", "answer + three distractors") under a "four-choice taps, universally"
  heading. The `distractors: string[]` in the doc's TS sketch is an illustrative signature, not a
  cardinality spec. `.length(3)` encodes the prose exactly — code moving _toward_ the architecture.
  No amendment needed.
- **NOT drift — `ExprErrorCode`'s 7th member.** Concurring with wave 1, re-checked and unchanged.
  ARCHITECTURE.md never enumerates an error taxonomy for the "tiny safe evaluator over params", so
  there is no contract to drift from. Below the doc's altitude. No amendment needed.
- **No magic-number leakage.** `src/content/index.ts` contains **zero** numeric literals. Catalog
  numbers are per-entity content attributes, which §4.3's own formula (`uniform(cannon.min,
cannon.max)`) and §4.4 both put in the catalog — the per-entity/cross-cutting line is held
  cleanly. Every other T-004 constant appears nowhere in `src/` outside `tuning.ts` (grep-verified);
  `CHOICE_COUNT` is the sole exception, above.
- **Doc-completeness note (not charged to any ticket).** §4.4 enumerates the `src/content/` files
  but **omits `skills.json`**, which T-006 rightly ships and §4.1 clearly requires (`symbolicOnly`,
  `SkillId`, per-skill grade bands). The enumeration is at the doc's altitude, so it deserves a
  one-line amendment when §4.4 is next touched. `index.ts` is a loader, correctly below that
  altitude; `templates/<skill>.json` is legitimately absent until wave 5.

_Ledger cleanup:_ removed an orphaned, header-less `T-026` table row stranded after the Rev 2
table in `TICKETS.md`; T-026 now sits properly in the Wave 2 table.

**Wave 3 is clear to dispatch** (T-005, T-008, T-009, T-010, T-011, T-012).

## PAUSED at wave 3 start — owner decision, 2026-07-28

Owner: _"pause on wave 3 until we get the base design first."_

**State at pause — everything is committed and resumable:**

- `swarm/engine-core` is at **776 tests green**, waves 1 and 2 fully merged and integrated.
- Six wave-3 worktrees are **created and ready**, each branched from a clean committed tree with
  its ticket verified current (L-008 observed) and `phase=tests` set:

  | ticket | branch                      | ACs | file scope                            |
  | ------ | --------------------------- | --- | ------------------------------------- |
  | T-005  | `ticket/T-005-distractors`  | 14  | `src/engine/questions/distractors.ts` |
  | T-008  | `ticket/T-008-damage-model` | 16  | `src/engine/duel/damage.ts`           |
  | T-009  | `ticket/T-009-economy`      | 13  | `src/engine/economy.ts`               |
  | T-010  | `ticket/T-010-mastery`      | 15  | `src/engine/mastery.ts`               |
  | T-011  | `ticket/T-011-placement`    | 11  | `src/engine/placement.ts`             |
  | T-012  | `ticket/T-012-rank-ladder`  | 11  | `src/engine/ranks.ts`                 |

  Verified: all six file scopes **disjoint**, so the wave parallelises safely.

- One Test Agent (T-008) was dispatched and **stopped before it authored anything**. Its worktree
  is clean; no test file was written. Nothing to unwind.

**To resume:** re-dispatch the six Test Agents. No setup work needs redoing.

### Owner decisions recorded this session

- Captain-name wordlist: **SKIPPED** for MVP, with a written re-enable trigger in `posture.md`
  (before children play, or before the public leaderboard mirror ships).
- CC0 source assets committed to the repo (~26 MB) so a clean checkout is self-contained.

### Non-swarm deliverables produced

- `design/DESIGN-BRIEF.md` — standalone design prompt (audience-first, states-not-compositions,
  invites pushback and a cut list).
- `assets/README.md` — every sprite the game needs, ordered by what it blocks, with MVP rows
  marked grey-box-acceptable.

## Wave 3 — dispatched 2026-07-28 (resumed after the design pause)

Owner resumed after an external design pass delivered tokens, ui-kit, a 10-state duel prototype,
sea chart, onboarding, chest, gunnery range, motion table, and a critique + cut list.

**The design review found three engine gaps our own process missed. All verified against the code
before filing:**

- **T-029** — grade 0 has exactly **one** skill (`add_within_10`) and both K-1 cannons use it, each
  with `recoilDamage: 0`, so they differ only in variance. PLAN.md promises cannon choice is "a real
  decision from the first duel" and the stated differentiator is that difficulty is a strategic
  choice; neither holds at K-1. Resolution **adds rather than replaces**: keep both starters, add
  `sub_within_10` plus a third reliable cannon → three cannons across two skills, exactly the duel
  tray's capacity. Not "a JSON edit" — `SKILL_IDS`/`CANNON_IDS` are frozen unions with tests pinning
  exact members and counts.
- **T-030** — 2 starters + 3 from Port Sumwich = **5 cannons against a 3-slot tray**, with no rule
  deciding which are equipped. Explicit persisted loadout, auto-fill fallback, and acquiring a
  cannon never silently re-equips.
- **T-031** — ARCHITECTURE §4.3 says a Perfect Shot grants "+1 bonus ball" while `tuning.ts`
  implements **+1 damage**, and `BASE_BALLS_PER_VOLLEY = 1` makes the documented "shot spread"
  reading impossible. The T-004 code review had independently flagged the second half.
  **Ruled: damage is scalar, balls are presentation the engine ignores.** The felt reward is the
  quality bias (Swivel 8–10 → 11–12, ~60%), not the `+1`.

Two further design findings were **not** defects: Double-Shot is scheduled as T-022 (wave 6), and
crew/ranks being unconsumed matches PLAN.md's day-4 cut line.

**Six Test Agents dispatched.** All seven wave-3 file scopes verified disjoint.

| ticket | module                     | ACs | model  |
| ------ | -------------------------- | --- | ------ |
| T-005  | `questions/distractors.ts` | 14  | opus   |
| T-008  | `duel/damage.ts`           | 16  | opus   |
| T-009  | `economy.ts`               | 13  | sonnet |
| T-010  | `mastery.ts`               | 15  | sonnet |
| T-011  | `placement.ts`             | 11  | sonnet |
| T-012  | `ranks.ts`                 | 11  | haiku  |

**T-008 carries the T-031 ruling explicitly in its brief** so the damage model cannot infer the
"bonus ball" reading before T-031 lands.

**T-010 and T-011 are told to derive from `SKILL_IDS`/`CANNON_IDS` rather than hardcode counts**,
because T-029 will add a skill and a cannon. This turns a scheduling risk into better test design
(L-012: assert the mechanism, not a projection of it).
