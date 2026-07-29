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

### Wave 3 — implementation and review

All six implemented; every gate re-run by the orchestrator, one implementation commit each, zero
non-test commits touching frozen tests (now enforced mechanically by the `frozen-tests-unmodified`
gate rather than by inspection).

| ticket | module                     | tests | code review                                 | security |
| ------ | -------------------------- | ----- | ------------------------------------------- | -------- |
| T-005  | `questions/distractors.ts` | 922   | 1 Important → fixing                        | PASS     |
| T-008  | `duel/damage.ts`           | 811   | APPROVED, 4 Minor → fixing                  | PASS     |
| T-009  | `economy.ts`               | 798   | **APPROVED**                                | PASS     |
| T-010  | `mastery.ts`               | 823   | **APPROVED** (called the cleanest of three) | PASS     |
| T-011  | `placement.ts`             | 899   | **APPROVED**                                | PASS     |
| T-012  | `ranks.ts`                 | 816   | 1 Important → fixing                        | PASS     |

**Security: PASS on all six, zero findings at any severity.** Verified by live probe rather than
argument — including a `node -e` check that `JSON.parse` makes `"__proto__"` an own data property
that reads back safely, and a proof that `rollDamage` is always an integer inside
`[damageMin, damageMax]` traced against `nextFloat`'s `[0,1)` range.

**The three findings driving fix rounds:**

- **T-012 — L-020 in production logic.** `rankTierForWins` assumes the `ranks` array is pre-sorted
  by tier; T-006 guarantees increasing `minWins` only _when sorted_. Reordering the same records by
  position alone returns the wrong tier. Invisible today because `ranks.json` ships sorted, and the
  ratchet's `Math.max` would **hide** it — a wrongly-low tier throws nothing, the player just stops
  being promoted. T-009 defends the identical risk with a mocked-reorder test; same repo, same day.
- **T-008 — a `NaN` that never throws.** `elapsedMs: NaN` yields `NaN` damage, which becomes a
  `NaN` hull in T-020: a duel that never ends with nothing to trace. Also: the comment on the
  module's most load-bearing line is false, and the dead zone is **71% of the answer window on the
  K-1 starter**, not the ~50% previously believed.
- **T-005 — an irreproducible failure.** `DISTRACTOR_FAILURE` omits the sampled `params`, so a
  draw-dependent failure cannot be reproduced from its message.

### Documentation audit (owner-requested, 2026-07-28)

Found real drift and fixed what was fixable:

- `README.md` claimed **"Repo scaffold: Not started ← you are here"** — badly stale at 776 merged
  tests. Corrected.
- `ARCHITECTURE.md` §4.4's catalog list omitted `skills.json`, which T-006 ships and §4.1 requires.
  Flagged by wave-2 integration; now corrected.
- `TICKETS.md` had **5 status cells** disagreeing with their ticket files. Synced; ticket files are
  authoritative.
- This ledger was two rounds behind; caught up above.

**Known-stale and blocked on decisions, not oversight:**

- `ARCHITECTURE.md:202` still says a Perfect Shot grants "+1 bonus ball". **T-031** carries the
  correction; the ruling (damage is scalar, balls are presentation) is already binding on T-008.
- `PLAN.md` states the starting loadout is **two** cannons, twice. **T-029** proposes a third
  (`sub_within_10`) to give K-1 a real choice — **awaiting owner approval**, so PLAN is correct as
  written until that lands.

### Wave 3 COMPLETE — all six review-passed

| ticket | module                     | tests | attempts |
| ------ | -------------------------- | ----- | -------- |
| T-005  | `questions/distractors.ts` | 170   | 2        |
| T-008  | `duel/damage.ts`           | 51    | 2        |
| T-009  | `economy.ts`               | 22    | 1        |
| T-010  | `mastery.ts`               | 47    | 1        |
| T-011  | `placement.ts`             | 123   | 1        |
| T-012  | `ranks.ts`                 | 40    | 2        |

**Post-review fixes, all through spec → test → code rather than direct patches:**

- **T-008** — non-finite `elapsedMs` **and** `timerMs` rejected from all three entry points. The
  worst case was `timerMs: Infinity`, which reported the **best possible outcome in every field at
  once** (quality 1, damage = max, perfectShot true), and `-Infinity`, where the three entry points
  disagreed. Orchestrator-verified: all five non-finite cases now throw from `resolveShot`,
  `answerQuality` and `isPerfectShot`, while off-catalog finite timers still evaluate.
  Also: the crossover comment was false and is now measured per cannon.
- **T-005** — the failure message now carries the sampled `params`. Verified independently: two
  different draws of one template, same id and same answer, now produce messages differing exactly
  where the draw differs.
- **T-012** — order-independent tier resolution, verified against a shuffled catalog
  (`0→0, 10→1, 25→2, 50→3, 100→4`).

**Lessons this wave: L-020 through L-028.** Three came from agents catching their own errors —
a test passing by coincidence, a measurement taken in a state that no longer existed, and a
mutation matrix silently running the wrong file.

---

## Wave 3 INTEGRATED — `e8155ad..786abf7`, **PASS**

Independent integration agent, 2026-07-28. Full report:
`.tdd-swarm/reports/wave3-integration.md`.

| Dimension                      | Result                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------- |
| Merges                         | 6/6 clean, zero conflicts — twelve pairwise-disjoint files, no shared surface |
| Tier 1 local gates             | ALL GREEN (7 gates; the 8th never ran — see below)                            |
| spec-lint                      | 6/6 PASS across **88 acceptance criteria**, both directions                   |
| Test suite                     | **1,229 passed / 1,229**, 13 files, 2.33s                                     |
| `npm audit --audit-level=high` | 0 vulnerabilities                                                             |
| `package.json` / lockfile      | byte-identical to the pre-merge head                                          |
| Frozen tests                   | verified by hand: 6 `A`, **0 `M`** under `__tests__`                          |

**The predicted 1,188 was wrong; the real count is 1,229.** The prediction subtracted a 41-test
overlap allowance that does not exist — `776+170+51+22+47+123+40 = 1229` exactly. Six disjoint file
pairs cannot overlap. Nothing was lost or double-counted.

### Cross-ticket probe — 6/6 green, and it found something

Written in a per-ticket scratchpad subdirectory per **L-028** and deleted after. The precaution
earned its keep: the shared scratchpad root still holds a stray `probe.test.ts` from another
session. Per L-028 I refused to take a uniform pass at face value and dumped the composed values to
prove the harness was live.

Every declared interlock verified in one process for the first time — T-005→T-002/T-004,
T-008→T-001/T-004, T-011→T-008, and all four catalog consumers sharing one frozen parse. Seed
reproducibility holds end-to-end (`toStrictEqual` **and** JSON-identical across two runs), the
stream is provably live across 60 seeds, and the pure stages are provably seed-independent.

### Two findings escalated, zero absorbed

- **T-032 (new, `backlog`, owner decision)** — **placement pre-grants the range guns mastery is
  supposed to award.** With every skill mastered: `k_1` can still earn 5 cannons / 4 islands,
  `g2_3` 2 / 2, and **`g4_5` zero and zero**. A 5th grader can never earn a cannon or an island
  through range mastery — placement hands over all seven range guns and all five islands at
  onboarding, so `resolveUnlocks` returns empty forever and the meter gates nothing.
  **Neither ticket is at fault**: T-011 AC-2/AC-4 require exactly this cannon set, T-010's delta
  semantics are correct, and the boundary between them was never specified. No frozen suite could
  catch it — nothing in either suite runs the two functions together, which is why it survived six
  green gate runs, six approving code reviews and two security passes. Filed without acceptance
  criteria on purpose: three options are on the table and the choice is the owner's.

- **T-033 (new, `backlog`, `wave: 3-repair`)** — **the `frozen-tests-unmodified` gate has never
  run.** Three independent faults, any one sufficient: it sits _after_ `exit "$FAIL"` (line 49 vs
  50); it calls an undefined `report()` (the script defines `run()`); and its guard reads
  `.tdd-swarm/phase`, **a file that does not exist and nothing creates**. The wave-3 run confirms
  it — seven gate lines printed, no `frozen-tests-unmodified` line either way.
  This contradicts the wave-3 dispatch premise _"now enforced mechanically"_. The property itself
  **did** hold — I verified 0 `M` entries by hand — but it held on implementer discipline, not
  enforcement, and that belief was load-bearing in the decision to merge. **L-007 restated: a
  silent gate is indistinguishable from an absent one.** T-033 requires the repaired gate to be
  _observed failing on a real violation_ before it is trusted, and waves 1–2 retro-checked.

### Drift vs ARCHITECTURE.md — as expected, plus one asymmetry

- **§8 placement:** 4 of 6 modules sit exactly where §8 declares. `placement.ts` and `ranks.ts` are
  additive. T-011 argues its case explicitly (`proposed` — §8's list "reads as illustrative");
  **T-012 carries no equivalent note for `ranks.ts`.** Both are fine on the merits; the asymmetry
  is the issue. Recommend amending §8's engine list to name both when T-031 corrects §4.3 — a
  one-line doc edit riding an existing ticket, not a new one.
- **`ARCHITECTURE.md:202`** — confirmed **code matches the T-031 ruling**, doc remains known-stale.
  Probe: `bonusDamage: 1`, `damageToEnemy: 17 = rollDamage 16 + 1`. `ballCount` participates in no
  damage arithmetic and nothing in the engine reads it — presentation only, exactly as ruled. Not
  re-raised.
- **PLAN.md "two cannons"** — reported as pending decision, not drift. One correction the owner
  needs before ruling on **T-029**: its rationale claims _"three cannons is exactly the duel tray's
  capacity, so no loadout selection is needed at K-1."_ Shipped T-011 gives K-1 **four** owned
  cannons, so selection is already needed there regardless. T-029's core argument survives (K-1
  still has one skill); only its tray premise needs correcting. T-030 already owns selection.
- **Contracts changed without a ticket:** none. No consumed signature widened, narrowed or
  redefined. `CHOICE_COUNT` still duplicated, unchanged by this wave, still owned by T-028.

---

## Wave 4 preparation — guard rebuilt and proven, 2026-07-28

The run continues on a different host (Cursor, Opus 5). Before dispatching anything, an independent
review of the branch was requested by the owner and returned **two high-severity findings against
`.claude/hooks/guard-writes.cjs`**. Both were real, and checking them surfaced a third that was
worse than either.

| finding                                                                                                                                            | status                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| The guard read `.tdd-swarm/phase` but never protected it — an implementer could clear it                                                           | **fixed** — the whole control surface is unwritable while a phase is in force |
| The header promised territory enforcement; `file_scopes` / `test_scopes` were never read                                                           | **fixed** — territory is enforced from the active ticket's frontmatter        |
| _(found while fixing)_ the hook is Claude Code config and **does not run in Cursor at all**                                                        | **fixed** — one shared policy, one adapter per host                           |
| _(found by the proof)_ `preToolUse` fires for `Read` too, so the first rewrite would have blocked an implementer from reading its own frozen tests | **fixed** — only mutating tools get the write policy                          |

**What now exists:**

- `.tdd-swarm/guard-policy.cjs` — the single decision function. Phase separation, territory, control
  surface, and the shell shapes L-023 identified (`cp`, `sed -i`, redirect, heredoc, `tee`,
  `git checkout`). Deliberately **not** keyed on cwd: a shell can `cd` one line away from the rule.
- `.cursor/hooks.json` + `.cursor/hooks/swarm-guard.cjs` — Cursor adapter, `preToolUse` and
  `beforeShellExecution`, `failClosed: true`.
- `.claude/hooks/guard-writes.cjs` — rewritten as a shim over the same policy so the two hosts cannot
  drift.
- `.tdd-swarm/prove-guard.sh` — **28 asserted directions, all observed.** Two of the first run's
  cases came back wrong: one was a genuine policy hole (a redirect target with a directory prefix,
  `> .worktrees/wt-T-007/.tdd-swarm/phase`, went unmatched) and one was a false failure caused by
  quoting in the proof script itself. Both fixed; commands are now JSON-encoded by `node` rather than
  hand-escaped, so a case can never fail merely because a quote was wrong.

Engagement is per unit: a unit is guarded when `<unit>/.tdd-swarm/phase` exists. The orchestrator
works in the repo root with no phase file and is therefore unpoliced, which the proof asserts
explicitly in both directions.

**Gate config corrected:** `.tdd-swarm/**` was ESLint-ignored, so the new policy module — the most
load-bearing guard file in the repo — would have gone unlinted. Given that L-007 was caused by a
module-system error in exactly this kind of file, `.cjs` files under `.tdd-swarm/` are now linted.
All local gates green afterwards, **1,229/1,229 tests**, guard re-proven 28/28 after formatting.

**Worktree model changed for this host.** Cursor's sandbox limits subagent writes to the workspace
directory, so the external `../cannon-wt/` layout waves 1–3 used cannot be written to by a dispatched
agent. Wave 4 worktrees go to `.worktrees/` **inside** the repo (gitignored), which also brings them
under the project hook — the previous layout would have put every agent write outside the guard's
jurisdiction.

**Five implementation reports were rescued from the wave-3 worktrees before teardown** (`T-005`,
`T-008`, `T-009`, `T-010`, `T-011`) — untracked, existing nowhere else, and one `--force` from gone.
Recorded as **L-030**. The stale worktree directories themselves remain on disk; removing them is a
destructive operation outside the workspace and is left for the owner.

**Lessons added: L-029, L-030.**

## Wave 4 — dispatched 2026-07-28

Two Test Agents on `claude-opus-5-thinking-high`, worktrees at `.worktrees/wt-T-007` and
`.worktrees/wt-T-013`, both branched from `ce51e71` with `phase=tests` and `active-ticket` set.
Model policy for this wave, owner-selected: **authoring on Opus 5, independent review on a different
model family**, so the cross-model adversarial property that caught wave 1's biased-shuffle and
lazy-zod cheats survives.

### T-007: tests-written (commits `2042114`, `5ce1ef5`)

**Orchestrator re-ran every gate itself rather than accepting the DONE report.** All claims hold:

| check           | verified                                                                       |
| --------------- | ------------------------------------------------------------------------------ |
| Diff scope      | exactly 2 files (test + report), **0** changes under `src/`                    |
| Commit prefixes | both `test(T-007):` — the frozen-tests outcome gate accepts them               |
| `generator.ts`  | does not exist; scratchpad deleted before commit                               |
| format / lint   | exit 0 / exit 0                                                                |
| typecheck       | **exactly one error**, `TS2307`, at the absent module's import — no other code |
| suite           | 1 file failed on module resolution, **1229 other tests still pass**            |
| spec-lint       | `SPEC-LINT PASS`, 16 ACs mapped both directions                                |

57 tests, 123 assertion sites. **38 mutants, 38 killed**, with a varied kill profile and eight
mutants dying to exactly one criterion each — so the suite discriminates rather than overlaps. The
agent proved its harness live three ways before trusting any verdict (sentinel stub, dumped composed
value, varied profile), and re-measured the whole matrix after editing the test file rather than
citing the earlier run (L-027 applied without being told).

Two of its own findings are worth keeping:

- A mutant that **sorts the input pool survived at 57/57** — a dead mutant, not a clean suite: the
  fixture ids `t1…t8` were already sorted, so the sort was a no-op. Same shape as L-020, caught by
  L-014 discipline. Fixed by reversing the pool with assertions that it really is unsorted.
- Its first RED typecheck reported `TS2307` **plus eight implicit-`any` errors**, manufactured by
  the missing module rather than by the tests. Left alone, the implementer would have inherited a
  frozen file that could not pass `tsc` until it wrote code, unable to tell the agent's noise from
  its own. Now aliased behind an annotated const, which also turns the ticket's declared signature
  into a compile-time assertion the moment the module lands.

### The environment defect this wave exposed — L-031

The T-007 agent's shell tool **silently ignored `working_directory`**; every command ran in the repo
root while it believed it was in its worktree. The root carries no phase file by design, so **the
guard was inert exactly where the misdirected agent had landed.** It caught the problem itself by
noticing `.tdd-swarm/phase` was absent, and re-ran everything behind an explicit `cd`.

Verified by the orchestrator: the root working tree is **clean** — nothing was written there, and
the root is still at `ce51e71` with `swarm/engine-core` checked out. This was one misdirected write
away from an unguarded change to the integration branch.

**Closed:** `decideWrite` now refuses `src/**` and `__tests__/**` at the repo root whenever any unit
is engaged, with a message that names the likely cause. During a wave the integration tree changes
only by merge, so no hand write there is legitimate; ledger, ticket and doc writes stay open so the
orchestrator can still amend a ticket in response to findings. Proof extended to **37 directions,
all observed**. Also fixed: `.gitignore`'s `node_modules/` never matched the worktrees' `node_modules`
**symlink**, so every worktree showed it as untracked and committable by accident.

### Six spec ambiguities raised, awaiting orchestrator ruling — tests NOT yet frozen

The agent tested a defensible reading of each and reported the reasoning rather than guessing
silently. Two are load-bearing for T-024's replay proof.

**Owner ruling:** the pre-shuffle choice array is `[answer, ...distractors]` (answer first), matching
the algorithm's step order. Sequencing ruling: **review first, amend once** — the independent
test-design review weighs in on all six readings before the ticket is touched, so the ACs are not
amended twice. T-007's suite is therefore committed but **not frozen**. Review dispatched on
`gpt-5.6-terra-medium`, deliberately a different family from the Opus author, aimed hardest at the
`composeExpected` oracle (agent-written code asserting agent-understood behaviour) and at
independently measuring the AC-14 claim. Frozen file recorded at
`12e82f4d…` for a tamper check on return.

### T-013: tests-written (commits `febe70c`, `d817101`, `3d6ff2c`)

Gates re-run by the orchestrator; every claim holds. 100 tests (87 `spec`-tagged, 13 `dod`-tagged),
173 assertion sites, **40 of them compile-time probes** — 64 `Exact<>` assertions and 30
`@ts-expect-error` directives, with a negative control on the `Exact<>` helper itself. **29 designed
cheats, 29 killed**, and liveness proven first by three control mutants that _should_ be invisible
and were. Widening every id to `string` passed every runtime test and was caught only at the type
level.

| check         | verified                                                                           |
| ------------- | ---------------------------------------------------------------------------------- |
| Diff scope    | exactly 2 files vs the **merge base**, 0 changes to `src/`, tickets or config      |
| format / lint | exit 0 / exit 0                                                                    |
| typecheck     | 75 errors, **all in its own test file**: 3× `TS2307` + 72 negative controls firing |
| suite         | 1 collection error, **1229 other tests still pass**                                |
| spec-lint     | `SPEC-LINT PASS`, 12 ACs mapped                                                    |

The 72 non-`TS2307` errors are the suite's type probes proving they are wired to the absent module:
with it missing, every imported type is `any`, so each `Exact<>` that must resolve `false` resolves
`true` and each `@ts-expect-error` finds nothing to suppress. Consequence for the implementer, which
the agent stated rather than leaving to be discovered: **expect `tsc` to go 75 → 0**, not merely for
the module errors to clear. Positive-direction probes are vacuous while the module is absent, so the
agent established the suite's teeth against a reference implementation (100/100 green, `tsc` clean)
instead of trusting redness — L-024's lesson applied unprompted.

Two cheats initially survived for **coincidental** reasons, the same shape T-007 hit independently:
hardcoding `playerHull: 100` survived because `PLAYER_HULL` really is 100 (fixed by mocking tuning to
a perturbed value), and an ordering assertion was **vacuously true** because the fixture's boolean
sequence was palindromic (fixed to a non-palindromic pattern plus a fixture self-check). Two agents
on different tickets both found that their own fixtures were hiding mutants — worth treating as the
default suspicion rather than a curiosity.

#### Three blocking spec defects, two verified arithmetically by the orchestrator

- **AC-4 is provably false.** `createRng` validates seeds over `[-0xffffffff, 0xffffffff]` but stores
  `seed >>> 0`, so `-1` and `0xffffffff` yield an identical `Rng`. Measured: **1000 of 1000**
  `(-n, 2³² − n)` pairs collide — the entire negative half of the legal domain aliases onto the
  positive half. "Distinct seeds produce distinct streams" cannot hold as written.
- **AC-5 never mentions `seed` validation.** `DuelConfig.seed` is a caller-supplied replay key, so
  masking it with `>>> 0` would map `NaN`, `2**33` and `-0.5` all onto seed `0` — reintroducing the
  aliasing T-001's throw exists to prevent, in the one module whose whole purpose is replay.
- **The `DuelEvent` union has no AC** — see L-032. The gate would call T-013 fully covered while
  enforcing nothing about the ticket's most-imported shape.

#### One escalation, confirmed: the onboarding duel cannot be constructed

`ONBOARDING_ENEMY_HULL = 28` is frozen in tuning, but AC-2 forces
`enemyMaxHull = ENEMY_HULL_BY_ISLAND.port_sumwich = 45` and `DuelConfig` has no override. Verified
against the frozen content: `swivel_gun.damageMax = 12` and `PERFECT_SHOT_BONUS_DAMAGE = 1`, so a
Perfect-Shot volley lands 13. **28 hull sinks in exactly 3 volleys; 45 needs 4** — even playing
perfectly. PLAN.md's onboarding sloop that "politely sinks in three volleys" is unmeetable, and
`ONBOARDING_ENEMY_HULL` is dead code, unless `DuelConfig` carries an `enemyMaxHull` override. The
agent escalated rather than inventing the override, and deliberately avoided `keyof DuelConfig`
exactness so that adding one lands additively with no test change. Affects T-018 and T-020.

---

# HANDOFF — paused 2026-07-28, mid Wave 4 (tests phase)

**Both Wave 4 suites are written, verified, and REJECTED by independent review. Neither is frozen.
No implementation has begun. Nothing is half-written; every branch is committed and every gate on
the integration branch is green.**

## Where the work stands

| unit               | branch                            | state                                        |
| ------------------ | --------------------------------- | -------------------------------------------- |
| integration        | `swarm/engine-core`               | all local gates PASS, clean tree             |
| T-007 question gen | `ticket/T-007-question-generator` | tests written, review **REJECT**, not frozen |
| T-013 duel types   | `ticket/T-013-duel-types`         | tests written, review **REJECT**, not frozen |

Worktrees are at `.worktrees/wt-T-007` and `.worktrees/wt-T-013`, both with `phase=tests` and
`active-ticket` set. Frozen-file hashes, for a tamper check on resume:

- T-007 `__tests__/engine/questions/generator.test.ts` → `12e82f4ddfc45b872ce0f57f100035852ba2a9786083037a7ec9b6d42b2cd1bf`
- T-013 `__tests__/engine/duel/types.test.ts` → `89dcd0f967db0e9fdc487927fd5e593353e151e313987bcc3563076d7dd9d030`

Evidence is committed, not left untracked (L-030): four reports under `.tdd-swarm/reports/` —
`T-007-tests.md`, `T-007-test-design-review.md`, `T-013-tests.md`, `T-013-test-design-review.md`.

## Why both were rejected

Cross-model review earned its cost — see **L-034**. Both authors reported perfect self-scored
mutation matrices (38/38 and 29/29) and both were still leaving demonstrably wrong implementations
green. Five live mutants, each verified by the reviewer against its own scratch reference:

**T-007** — the two error sweeps use a bare `catch {}` (verified by the orchestrator at
`generator.test.ts:1130` and `:1445`), so they prove _something_ throws, not _what_:

1. Throw `RangeError` instead of `QuestionGenerationError`/`CONSTRAINTS_UNSATISFIED` for every input
   except the one directly-tested seed → 57/57 green (AC-7).
2. The same trick for `INVALID_QUESTION` → 57/57 green (AC-11).
3. Reject schema-legal `params: {}` → 57/57 green. No fixture reaches the zero-parameter branch.

Plus a **frozen-in misreading**: the oracle's `renderText` only matches identifier-shaped `{name}`
(`:178`) while `templateSchema` permits arbitrary string keys (`src/content/schemas.ts:78`). Freezing
this narrows the schema by accident.

**T-013** — two contract holes, each contradicting the ticket's own DoD while 100/100 pass:

4. **Mutable `DuelCore.seed`.** `Exact<DuelState['seed'], number>` cannot see `readonly` — indexed
   access discards modifiers (L-012). "Readonly throughout" is untested outside two arrays.
5. **An extra optional payload field** (`debug?: string`) on the `CANNON_SELECTED` variant. Only
   `DuelEvent['type']` and the keys of hand-written fixtures are checked, never the variants.

## Rulings already made — apply these, do not re-litigate

1. **Pre-shuffle choice order is `[answer, ...distractors]`** (answer first), matching the algorithm's
   step order. Verified as pinned by T-007's oracle; no contradiction elsewhere in the suite.
2. **Onboarding hull: add an optional `enemyMaxHull` override to `DuelConfig`.** The onboarding duel
   passes 28 explicitly. `ONBOARDING_ENEMY_HULL` stops being dead code, and T-013's tests absorb this
   with no change because they deliberately avoid `keyof DuelConfig` exactness. Affects T-018, T-020.
3. **AC-4: reword to "distinct modulo 2³²"** rather than restricting the seed domain. This describes
   what the frozen `createRng` actually does and leaves shipped T-001 code and its tests untouched.
4. **Sequencing: review first, amend once.** Both reviews are now in, so the amendment round can
   proceed with full information.

## T-007 round 2 — accepted, pending re-review

The Test Agent killed all three review mutants and, by auditing the suite's _shape_ rather than
working from the review's list, found two more. Suite is 72 tests (was 57) over 19 criteria, 53 of
53 mutants killed. Everything below I re-ran myself rather than taking from the report.

| Claim                                          | Verified                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| Frozen file SHA-256 `09b3da13…`                | matches                                                                       |
| Diff vs **merge base** `a7249fef` (L-033)      | exactly 2 files: the suite + its report, **0 under `src/`**                   |
| RED is a module-resolution failure only        | `tsc --noEmit` exit 2, one diagnostic, `TS2307`                               |
| Wave 1–3 baseline intact                       | `Tests 1229 passed`, suite fails at the import                                |
| Prettier / ESLint                              | exit 0 / exit 0                                                               |
| `spec-lint`                                    | **PASS** after the two rulings below — 19/19 AC, DoD 1–6 tagged, DoD-7 `SKIP` |
| DoD-7 itself ("files changed ⊆ `file_scopes`") | verified by me from the diff above, which is what `[process]` promises        |

**The two mutants the review missed** are worth naming because neither was a gap in the review's
diligence — they were only visible from the suite's structure. One was a third instance of the
`catch` shape the review found twice (AC-16 checked an error's `code` but never its type). The other
**the amendment itself created**, which is the more interesting failure: AC-17 said keys are consumed
in "lexicographically ascending" order without naming a collation, and AC-19 — added last round —
made mixed-case keys legal, which is exactly where code-point order and `localeCompare` diverge. A
`localeCompare` implementation passed all 71 tests. This is [[L-020]] precisely: the two orderings
agree on every lowercase single letter, which is every key in the real catalog **and both keys in
AC-17's own fixture**, so the criterion could not see its own ambiguity. Tightening a spec can open
a hole elsewhere in it, and only a suite audited as a whole catches that.

### Rulings

- **A-8, collation → code point.** AC-17 now names ascending code-point order (`sort()` with no
  comparator) and forbids `localeCompare`. Code point is `sort()`'s default and needs no locale data,
  so it cannot drift with a platform's ICU version — the property T-024's replay proof rests on. The
  agent had pinned this reading already, so no test changes; the criterion now states what the suite
  measures. (I checked whether `localeCompare` actually varies by locale for identifier-shaped keys
  and it did not across four locales — the hazard is the ambiguity, not observed platform drift.)
- **A-9, process items → the gate skips them.** A DoD item marked `[process]` reports `SKIP` and is
  verified by the orchestrator's diff instead of by a test. The agent was right to leave DoD-7 red
  rather than tag it with a narrower check; see [[L-036]]. The marker is **required, not inferred**,
  so a forgotten marker still fails. Numbering spans skipped items, so no `dod(id:n)` tag shifted —
  confirmed by re-running the gate on T-013 and a grandfathered ticket.

Open, carried to review: `composeExpected` is the suite's strongest oracle and is the agent's own
code; a lookup-table implementation would still pass the 114-seed error sweeps; AC-5 bounds when
`NO_TEMPLATE` must fire but never when it must not.

## T-013 round 2 — accepted, one criterion added, needs a short round 3

Both contract holes closed. The agent did the thing that makes a kill trustworthy: it **built each
mutant first and confirmed it was live** — mutable `DuelCore.seed` and a variant-only `debug?: string`
each produced 0 tsc errors and 100/100 passing against the old suite — then killed them, at 10 and 1
tsc errors. Suite is 122 tests (was 100), 45 of 45 mutants killed, 5 of 5 negative controls surviving.
Re-verified by me, not taken from the report:

| Claim                                                  | Verified                                            |
| ------------------------------------------------------ | --------------------------------------------------- |
| Frozen file SHA-256 `154ebee1…`                        | matches                                             |
| Diff vs merge base `a7249fef`                          | exactly 2 files: suite + report, **0 under `src/`** |
| RED is 88 errors: 3 `TS2307`, 51 `TS2322`, 34 `TS2578` | matches exactly, **0 outside the suite**            |
| Wave 1–3 baseline                                      | `Tests 1229 passed`                                 |
| Prettier / ESLint / `spec-lint` (pre-amendment)        | 0 / 0 / PASS at 15 AC + 9 DoD                       |
| DoD-9 ("files changed ⊆ `file_scopes`")                | verified by me from the diff above                  |

Two pieces of self-correction are worth more than the mutant counts. The agent **retracted its own
round-1 claim** that positive `Exact<>` probes go vacuous in RED: measured, `Exact<any, X>` is
`false`, those 51 `TS2322`s are probes _firing_, and **the implementer's target is 88 → 0**, not
merely clearing the 3 import errors. And it reported one mutant it **could not** kill as genuinely
equivalent rather than claiming it — `isTerminalPhase` via `startsWith('v') || startsWith('d')` is
identical over the closed eight-phase domain, and becomes a bug only if a phase like `draw` is added,
at which point AC-1 fails first. Both are [[L-027]] honoured rather than cited.

It also avoided a trap that would have manufactured a false defect: `Exact<Readonly<T>, T>` is a
false negative on every variant, because the variants are intersections and `Readonly<A & B>` is a
flattened mapped type while `A & B` is not. Written that way, AC-14 would have been unsatisfiable.

### Rulings on the three escalations

- **Config-array aliasing → new AC-16.** Accepted as the one finding that earns a criterion.
  `state.playerLoadout` was the caller's array, and callers hold a mutable `CannonId[]`; a push
  anywhere in the app rewrites a duel in flight and makes it unreproducible from its own seed. The
  aliasing is on the **caller's** side, so `readonly` cannot reach it and no engine test was looking.
  This is [[L-012]] at the value level: a modifier says the field cannot be reassigned, never that
  the object it points at belongs to the duel. Count verified 15 → **16**, gate correctly RED on
  AC-16 ([[L-026]]).
- **Memoised construction → a clause on AC-3, not a criterion.** Every field is readonly, so a
  shared cached state is confusion rather than corruption. AC-3 now also demands the two calls not
  return the same reference.
- **Runtime freezing → declined, and recorded as a locked decision** so it is not re-raised.
  `Object.freeze` would sit on T-020's per-event hot path; T-024's invariant checker is the right
  home. AC-16 is the deliberate exception, and for the one reason freezing could not have helped
  anyway — it guards a reference the caller owns.
- **DoD-9 marked `[process]`, for consistency with T-007.** The two agents made opposite calls on the
  same item: T-007's declined to tag it, T-013's tagged it with a directory check. The directory
  assertion is useful and stays in the suite, but it constrains `src/engine/duel/`'s contents rather
  than the branch diff, so the gate no longer credits it. DoD-2 and DoD-3 stay enforced — both assert
  something real and neither name overclaims, and DoD-3's tag-numbering check is the test that would
  have caught round 1's own bug.

**Round 3 is two tests wide:** cover AC-16, add the reference clause to AC-3. Everything else is
frozen-ready.

## T-007 round-2 re-review — REJECTED, and it was worth the round

Cross-model re-review (different family) rejected the suite on **one live mutant**, verified by me
rather than accepted: an ordinary generator that calls `evaluateNumber` / `evaluatePredicate` /
`buildDistractors` without translating their `ExprError`s **passes all 72 tests and typechecks
clean**, while breaking DoD-5's promise that every failure path throws a typed
`QuestionGenerationError`. I confirmed both halves of its reachability argument: `answerExpr` is
`z.string()` in `src/content/schemas.ts`, so `"a +"` is schema-valid; and `distractors.ts` really does
document `@throws {ExprError} unchanged`. Its harness was proven live first (a sentinel produced 60
failures), so the 72-pass result means what it says.

That is a second rejection of a suite that had already killed 53 of 53 mutants — and the reason is
[[L-038]]: **no fixture in the suite carried a malformed expression**, so the whole failure class was
invisible to the suite and to its own mutation matrix. This is the clearest evidence yet for
cross-model review: one family wrote the suite and its mutants, so the blind spot was shared.

### Rulings

- **AC-20 (new) — the generator wraps, `distractors.ts` does not change.** `ExprError` from any of the
  three evaluated sites surfaces as `QuestionGenerationError` code `INVALID_QUESTION`, naming the
  template id, with the original as `cause`. This resolves the apparent spec conflict instead of
  choosing a side: the frozen module keeps propagating unchanged, and translation happens at the
  generator's boundary because that is what the app and T-020 call, and DoD-5's whole value is one
  error type per caller. `Error.cause` is assignable at ES2022 — verified — so no change to the frozen
  `types.ts` is needed.
- **AC-5 gains its negative half.** `NO_TEMPLATE` is now forbidden whenever a usable template exists,
  including when recency filtering empties the eligible pool. The criterion had bounded only when it
  _must_ fire.
- **AC-21 (new) — failure precedence is the documented step order.** Two implementations could report
  different codes for one template and both be defensible. Where two failures share
  `INVALID_QUESTION`, the test separates them by `cause`.
- **`assertQuestion` — locked as output validity, not an observable call.** The review was right that
  `types.ts` claims T-007 calls it while the ticket never required that. A spy test would freeze an
  implementation detail and buy nothing, since the guard's checks are a subset of what the criteria
  already assert on the output.
- **DoD-7 reworded in both tickets — it was unsatisfiable.** "Files changed are exactly those in
  `file_scopes`" cannot hold for any branch, which also changes its test file and its report. I had
  been verifying the sensible reading and reporting the literal checkbox green ([[L-039]]).

### One gate defect the review found that my own baseline could not

`run-local-gates.sh` matched a bare `(TODO|FIXME|HACK)`, so the suite's phrase "no-TODO markers"
**failed the gate on its own description**. It passed for me at the root only because the file
containing that phrase exists solely in the worktree — my green described a tree without the code in
it. Fixed to require the canonical `TODO:` / `FIXME(owner):` form; verified it still catches all three
real markers, ignores the prose, and that `no-todos` now PASSes in `wt-T-007`, leaving only the
expected RED-state typecheck and unit failures.

Count verified 19 → **21**, gate red on AC-20 and AC-21 only ([[L-026]]).

## T-013 round 3 — accepted, pending re-review

Narrow scope delivered as asked: one AC-3 reference-inequality test and three AC-16 aliasing
tests covering `playerLoadout`, `rivalLoadout`, and `templatesBySkill` plus nested `Template[]`.
Authored on Grok 4.5 fast after Opus hit the API limit. Re-verified by me:

| Claim                                                | Verified                                |
| ---------------------------------------------------- | --------------------------------------- |
| Start hash `154ebee1…` → end `c5e80f2b…`             | matches                                 |
| Diff vs merge base                                   | suite + report only, **0 under `src/`** |
| RED still 88: 3 `TS2307` / 51 `TS2322` / 34 `TS2578` | matches, 0 outside suite                |
| Baseline                                             | `Tests 1229 passed`                     |
| `spec-lint`                                          | **PASS** — 16/16 AC, DoD-9 `SKIP`       |
| Prettier / ESLint / `no-todos`                       | 0 / 0 / PASS                            |
| `types.ts` absent; scratchpad gone                   | yes                                     |

Liveness method held: aliasing and memoising impls passed the old suite and die on the new tests.
Matrix 51/51 killed, 5/5 controls surviving including the three T-022 forward-compat ones.
Implementer target remains **88 → 0**.

## T-007 round 3 — accepted, pending re-review

Round-3 suite closes the re-review rejection: AC-20 (ExprError wrap at all three sites with
`cause`), AC-21 (failure precedence), AC-5 negative half. Authored on Grok 4.5 fast. Re-verified:

| Claim                               | Verified                                    |
| ----------------------------------- | ------------------------------------------- |
| Start `09b3da13…` → end `f7c62e4d…` | matches                                     |
| Diff vs merge base                  | suite + report only, **0 under `src/`**     |
| RED                                 | sole `TS2307`; baseline `Tests 1229 passed` |
| `spec-lint`                         | **PASS** — 21/21 AC, DoD-7 `SKIP`           |
| Prettier / ESLint / `no-todos`      | 0 / 0 / PASS                                |
| Tags                                | AC-20 ×5, AC-21 ×3, AC-5 ×3; 81 tests       |
| `generator.ts` absent               | yes                                         |

Cause assertions are real (`toBeInstanceOf(ExprError)`), and AC-20 includes a premise that the three
fixtures are schema-valid and throw `ExprError` directly — so the translation is testable.

T-013's GPT Terra re-review died on API limit before starting; both re-reviews re-dispatched on
Claude Sonnet (still cross-family vs Grok authoring).

## T-007 round-3 re-review — REJECTED (Composer 2.5)

Cross-model review found one live mutant, re-measured by me:

`m3-render-first-fake-cause` — runs render (step 6) before distractors (step 5), and on render
failure attaches a **fabricated** `ExprError` cause. **81/81 + clean tsc.** Control without the
fake cause dies on exactly AC-21's step-5-vs-6 test (80/81). So AC-21's `instanceof ExprError`
check partially bites and still lets a competent cheat through.

Partial-wrap / no-cause / answer-before-constraints mutants all die — round 3 closed those.

### Rulings (no new AC numbers; tighten existing)

- **AC-11** — render `INVALID_QUESTION` must have `cause === undefined`, every swept seed.
- **AC-20** — `cause` must match the frozen evaluator's `code` **and** `message` for that
  expression+params, not merely `instanceof ExprError`.
- **AC-21** — step-5 diagnosis uses AC-20's identity rule; step-6 absence is asserted via AC-11
  too, not only implied by the dual-failure fixture.

Count stays 21; gate still green on tags. Suite assertions themselves are what must change.

## T-013 round-3 re-review — REJECTED (Composer 2.5)

Two live mutants, both re-measured at **126/126**:

1. **Shallow `Template[]`** — `[...templates]` sharing `Template` object refs. Suite only mutated
   containers (`pop` / reassignment), never `template.text`. Direct probe: caller overwrites text →
   state sees `"HACKED BY CALLER"`.
2. **Shared-core wrapper** — `WeakMap` caches core; each call returns `{ ...cached, phase }`.
   Top-level `not.toBe` is green; `first.playerLoadout.push` rewrites `second`. Control that
   returns the same top-level ref still dies on AC-3 — so the reference clause partially bites.

`startsWith` terminal predicate remains equivalent over the closed eight-phase domain — residual,
not a reject.

### Rulings (count stays 16)

- **AC-16** — deep-copy: new containers **and** new element objects, including each `Template` and
  its nested `distractors` / `params` / `constraints`.
- **AC-3** — independent state graphs, not just top-level reference inequality.

## T-007 round 4 — accepted, pending re-review

Cause-identity tightenings landed. Re-verified: hash `1a586570…`, merge-base diff = suite +
report only, sole `TS2307`, baseline 1229, `spec-lint` 21/21 with DoD-7 SKIP. Suite now asserts
`cause === undefined` on every AC-11 seed and matches frozen-evaluator `code`/`message` on AC-20/21.
Agent reported m3 81/81 → 4 fails (AC-11 ×3 + AC-21 ×1); assertion shapes confirm that kill path.

## T-013 round 4 — accepted, pending re-review

Deep-copy / independent-graph tightenings landed. Re-verified: hash `737335df…`, 128 tests,
merge-base diff = suite + report only, RED still 88 (3/51/34), baseline 1229, `spec-lint` 16/16
with DoD-9 SKIP. New tests cover AC-3 graph independence (`playerLoadout.push` + nested
`templatesBySkill[…][0].text`) and AC-16 deep-copy of `Template` plus nested `params` /
`distractors` / `constraints` with `not.toBe` on those references.

## T-007 FROZEN — Composer ACCEPT round 4

Verdict **ACCEPT** from [T-007 Re-review](fc68fe03-f84a-4103-a0c1-84f8c572c51c). Independently confirmed
before freeze: suite SHA `1a5865707201bc288bd21deb4865cf8c49d3e176e1f43ef537229460b57799e1`,
`phase=implement` set in `wt-T-007`, write guard **blocks** the frozen suite (engaged, frozen-test
reason). Merge-base diff remains suite + report; RED = sole `TS2307`; 21/21 spec-lint.

Reviewer confirmed m3 dead (4 fails: AC-11 ×3 + AC-21 ×1). Two 81/81 survivors are **not** reject
grounds: (1) copying `ExprError` code+message into a fresh cause — allowed by AC-20 as written;
(2) calling `buildDistractors` before an explicit `evaluateNumber` — observably identical because
frozen T-005 evaluates `answerExpr` internally. Residuals recorded, not blockers.

**Do not dispatch the T-007 implementer until T-013 also freezes** — wave 4 is the critical-path
narrowest point and both should enter GREEN together.

## T-013 round-4 re-review — REJECTED (Composer 2.5)

Round-3 mutants confirmed dead. Three new live mutants re-measured at **128/128**:

1. Shared module-level `tally` / `actionLog` / `recentTemplateIds` while loadouts/templates copy
2. Deep-copy `Template` but alias `params.b` (suite only probed `params.a`)
3. Memoised `rng` object identity across two constructions (suite checks deep equality only)

Control shared-core wrapper still dies (127/128). Same pattern: tests measured the last layer's
exact failures; half-fixes lived one field over.

### Rulings (count stays 16)

- **AC-3** — independence covers every mutable interior: loadouts, templates, `actionLog`,
  `recentTemplateIds`, `tally`/`bySkill`, and `rng` reference inequality.
- **AC-16** — every `params` key's range array must be a new reference; mutate an unprobed key.

T-007 remains frozen (`1a586570…`, `phase=implement`); implementer still held.

## T-013 round 5 — accepted, pending re-review

Full-graph / every-params-key tightenings landed. Re-verified: hash `767fc8da…`, 128 tests,
merge-base diff = suite + report only, RED still 88, baseline 1229, `spec-lint` 16/16 with DoD-9
SKIP. AC-3 now `not.toBe` + mutates loadouts, nested templates, `actionLog`, `recentTemplateIds`,
`tally`/`bySkill`, and `rng`. AC-16 loops `Object.keys(params)` and mutates `params.b`.

## Wave 4 FREEZE complete — both suites frozen, implementers dispatched

| Ticket | Frozen SHA                                                         | Composer verdict | phase                            |
| ------ | ------------------------------------------------------------------ | ---------------- | -------------------------------- |
| T-007  | `1a586570…`                                                        | ACCEPT round 4   | `implement` (guard blocks suite) |
| T-013  | `767fc8daf622fac13081d4f1fb7147818e2401cb7afc6464292d0db12656de05` | ACCEPT round 5   | `implement` (guard blocks suite) |

T-013 residuals recorded, not blockers: `startsWith` terminal equivalent on eight phases;
`toRivalView` loadout alias unpinned by any AC; non-enumerable `params` keys unreachable via zod.

### RED-state facts for implementers (re-verified)

- **T-007:** sole `TS2307` missing `@engine/questions/generator`; baseline **1229** pass; **81**
  suite tests waiting. Target: module exists → 81/81 + tsc 0.
- **T-013:** **88** errors all in suite (3×TS2307, 51×TS2322, 34×TS2578). Target: **88 → 0**,
  not merely clearing the three import errors — positive `Exact<>` probes fire in RED.

## T-007 implementation — verified green, pending code review

Implementer DONE (`a358270`). Re-verified: frozen suite still `1a586570…`; commit touches only
`generator.ts` + implementation report; prettier/eslint/tsc 0; **1310/1310**; spec-lint PASS;
`run-local-gates` ALL PASS including `frozen-tests-unmodified`.

## T-013 implementation — verified green, pending code review

Implementer DONE_WITH_CONCERNS (`f4adb7b`). Re-verified: frozen suite still `767fc8da…`;
commit touches only `types.ts` + report; **tsc 88→0**; **1357/1357**; prettier/eslint/spec-lint
PASS. The sole concern was real: two Test Agent commits used `spec(T-013):` subjects, which
`frozen-tests-unmodified` rejected. Gate now also accepts `spec(` — its job is blocking
implement commits that touch tests, not policing Test Agent synonyms. Local gates ALL PASS
after that fix.

## T-007 code review — APPROVE_WITH_NITS

[T-007 Code Review](ef18d061-3d72-41d9-a853-0c0607ccddf7): all 21 ACs / DoD items verified; gates
re-confirmed green (1310/1310, tsc 0, frozen-tests-unmodified). One low nit: `correctIndex` via
`findIndex` on value rather than tracked shuffle index — safe under AC-12 distinctness; no fix
required. Security review dispatched next. T-013 code review still in flight.

## T-013 code review — APPROVE_WITH_NITS

[T-013 Code Review](87210f96-cac5-4edc-bb48-3c84da28c89f): all 16 ACs verified; gates re-confirmed
(1357/1357, tsc 0, frozen-tests-unmodified PASS). Two nits, neither AC-blocking: blanket
`getCannon` catch may mislabel errors; optional `enemyMaxHull` accepts any number. No fixes
required. Security review dispatched. T-007 security still in flight.

## Resume here — the next actions, in order

1. **Amend `tickets/T-007.md`:** rewrite AC-14 (its literal claim is false — 63 of 500 seeds repeat a
   draw, measured twice independently); add an AC pinning lexicographic parameter order and the
   answer-first pre-shuffle order; extend AC-12 to cover `skill`, `templateId` and `label`; carve
   `NO_TEMPLATE` out of the DoD's "must name the template id"; and **decide the token-name domain** —
   either narrow the schema to `[A-Za-z_][A-Za-z0-9_]*` or widen the oracle, plus an AC for
   `params: {}`.
2. **Amend `tickets/T-013.md`:** reword AC-4; add seed validation to AC-5; add the `enemyMaxHull`
   override to AC-2; and add numbered ACs for the `DuelEvent` union so its 13 currently `dod(...)`-
   tagged tests become enforceable. **Note:** the reviewer found the drafted AC-15 unusable as written
   — `RivalVolley` has no `actions` field to be "ordered". Fix that wording before adopting it.
3. **Re-dispatch both Test Agents** (resume them; they hold the context) to fix the five survivors and
   re-tag against the amended ACs. Every amendment adding an AC requires a citing test or spec-lint
   fails — that is the gate working, not an obstacle.
4. **Re-review, then freeze.** Same different-family policy.
5. **Only then dispatch implementation.** Give the implementers the two RED-state facts the authors
   surfaced: T-013's `tsc` must go **75 → 0**, not merely lose its `TS2307`s, and T-007's suite is one
   failing _file_, not one failing assertion.

## Resumed 2026-07-28 evening — amendment round complete, agents not yet re-dispatched

Baseline re-established before touching anything: all local gates PASS, guard proven **37/37** on
this host. Two concurrent tracks are now live (`COORDINATION.md`); this track stayed inside
`src/engine/**`, `src/content/**`, `__tests__/**`, `tickets/**`, `.tdd-swarm/**` throughout.

**Tickets amended, each count-verified per L-026.** T-007 **16 → 19** criteria, T-013 **12 → 15**,
every new one confirmed to parse rather than assumed:

| ticket | amendment                                                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| T-007  | AC-7/AC-11 now demand the error **type and code on every swept seed**, closing the bare-`catch` hole                             |
| T-007  | AC-12 extended to `skill`, `templateId`, `label`                                                                                 |
| T-007  | AC-14 rewritten — the old wording was measurably false                                                                           |
| T-007  | **AC-17** lexicographic param order + answer-first pre-shuffle order (both load-bearing for T-024)                               |
| T-007  | **AC-18** zero-parameter templates must succeed                                                                                  |
| T-007  | **AC-19** param keys are identifier-shaped; every declared token substituted                                                     |
| T-007  | DoD carve-out: `NO_TEMPLATE` cannot name a template id                                                                           |
| T-013  | AC-2 gains the optional `enemyMaxHull` override; AC-4 reworded to "distinct modulo 2³²"                                          |
| T-013  | AC-5 gains seed validation — validate and throw, never mask                                                                      |
| T-013  | **AC-13** per-variant `DuelEvent` payload exactness; **AC-14** `Exact<Readonly<T>, T>` throughout; **AC-15** closed rival shapes |

The drafted AC-15 from the review round was **not** adopted as written — it required `RivalVolley`'s
"actions" to be ordered, and `RivalVolley` has no such field. Rewritten as a closed-shape criterion.

**Owner rulings applied this round:** narrow the schema to the identifier grammar (now **T-034**,
wave 5 — it edits merged wave-1 code, so it is a ticket rather than an edit, which is also what the
guard enforces mid-wave), and make DoD coverage a failing gate for new work while grandfathering the
twelve merged tickets.

**L-036 — the gate that closed L-032 was itself inert.** It reported `SPEC-LINT PASS` for T-013 with
all nine DoD items uncovered: misses were `WARN`, and the existing tests tag by name
(`dod(T-013:events)`) where the gate numbers by file order. Both now fixed and **proven in both
directions** — T-013 and T-007 exit 1, a grandfathered ticket exits 0.

**Both wave-4 tickets are now legitimately RED** on spec-lint: the new criteria have no citing tests
and the DoD items are untagged. That is the intended pre-dispatch state, not a regression.

### Still to do on resume

Re-dispatch both Test Agents (resume them — they hold the context) to fix the five live mutants,
cover AC-17/18/19 and AC-13/14/15, and tag every DoD item `dod(<id>:<n>)` in file order. Then
re-review cross-model, freeze, and only then implement. The two RED-state facts for implementers
still stand: T-013's `tsc` must go 75 → 0, and T-007's suite is one failing _file_.

**Blocked on owner, not on me:** T-029 (does K-1 get a third starter cannon) and T-032 (placement
pre-grants the cannons mastery is meant to award, so a 4–5 player can currently earn zero).

## Open decision, deferred deliberately

**L-032:** `spec-lint` harvests only numbered `**AC-n**`, so DoD checkboxes and prose requirements are
invisible to the coverage gate. The systemic fix — number every DoD item, or teach the gate to harvest
`dod(...)` — was **not** applied under two running agents. Decide it before Wave 5.

## Process repairs landed this session

The guard was rebuilt and is now proven in **37 directions**. Newly closed: the integration tree is
off limits to everyone while a wave is in flight (L-031), after a Test Agent's shell tool silently
ignored its `working_directory` and ran in the repo root — where the guard was inert by design. Also
fixed: the root lint gate was linting `.worktrees/*/` (L-029's blast radius), and `.gitignore` never
matched the worktrees' `node_modules` **symlink**. Lessons added this session: **L-031, L-032, L-033,
L-034**, plus a note that the `SWARM_ORCHESTRATOR=1` bypass is anchored to the first token, so a
misplaced one is indistinguishable from a real policy hit.
