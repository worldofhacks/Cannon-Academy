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
- **F2/F4/F5** — T-013's action-log AC restated over *required* fields; T-003 gained exact
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
    compiled in its worktree. (Exclusive file scopes govern *writes*, not *reads*.)
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

| id | question | ruling |
|---|---|---|
| D-1 | Template count (docs contradicted: 15–25 vs ≥8) | **Floor of 8/skill, no cap.** `PLAN.md:73` edited to remove the contradiction. |
| D-2 | Double-Shot "harder variant" | **Shortened timer**, same question pool. `difficulty?: 1\|2\|3` kept as schema insurance. |
| D-3 | Culverin recoil ("Volatile (crit)", no number) | **recoilDamage = 0.** Keeps the K-band starter unable to punish. |
| D-4 | Reliable vs Standard on a miss | **Identical** — flavour only, no recoil, no re-answer. Volatile tier (5/8/10) already provides the "powerful guns that punish" the owner wanted. Closed before wave 3, so T-020 cannot be superseded by it. |
| D-5 | Build `duel/replay.ts` (T-023)? | **CUT.** Replaced by replay-proof ACs inside T-024's fuzz suite, including a wrong-seed negative control. Engine stays provably replayable; only the wrapper is deferred. |

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

| ticket | branch | worktree | test agent model |
|---|---|---|---|
| T-001 | `ticket/T-001-seeded-prng` | `../cannon-wt/wt-T-001` | sonnet |
| T-002 | `ticket/T-002-safe-expr-eval` | `../cannon-wt/wt-T-002` | opus |
| T-003 | `ticket/T-003-schemas-and-types` | `../cannon-wt/wt-T-003` | opus |

`phase=tests` written into each worktree, so the guard blocks any write to `src/`.
Three Test Agents dispatched in parallel. Next: verify RED for the right reason, then
independent test-design review before freezing.

### Wave 1 test authoring — results

| ticket | tests | ACs | RED verified by orchestrator | pre-freeze defects caught |
|---|---|---|---|---|
| T-001 | 19 | 12 | ✅ fails only on `Cannot find module '@engine/rng'` | `weightedPick` entry field named `value`, colliding with T-009's `{item, weight}` — would have hit a frozen file in wave 3 (L-004 class) |
| T-003 | 85 | 20 | ✅ fails only on the two absent modules | zod stripped unknown keys by default (silent data loss on a typo'd optional field in a hand-authored catalog); `crewSchema` had no criterion at all; id-array export names unnamed; nested `unlock` strictness missing |

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

| ticket | tests | design review | state |
|---|---|---|---|
| T-001 | 19 → hardening | 3 Critical | Test Agent fixing |
| T-002 | 229 | review running | — |
| T-003 | **116** | 3 Critical, **all closed** | **tests FROZEN**, implementer dispatched (sonnet) |

Worktrees rebased onto the integration branch, closing the L-008 staleness (I5 in the T-003
review). `phase=implement` set in wt-T-003 and the guard verified flipping: edits to frozen
tests now blocked (exit 2), writes to `src/` allowed.

### T-001 hardened and frozen

Suite grown 19 → 27 tests (14 ACs). Cheat-mutation verified by the Test Agent against a
correct implementation in a sandbox:

| cheat | outcome |
|---|---|
| correct implementation | 31/31 pass, tsc clean |
| `oneSwap` shuffle | caught — index-5 count 0, only 4/24 permutations |
| `naiveSwap` shuffle | caught — passes BOTH index bands, fails permutation count at 827 < 850 |
| counter-based `nextInt` | caught — scores a perfect [10000×6] on AC-5, fails AC-13 purity and cascades |
| `pick = items[0]` | caught — 0/10000 for 9 of 10 elements |
| `pick` returning a bare value | caught at compile time by the tuple destructuring |

Also took M-4: bulk loops converted to collect-then-assert-once; suite runs ~35ms (was 2.8s).

Worktree rebased a second time — the ticket had been amended (AC-13, AC-14) *after* the first
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
  *consumed* by schema fields rather than merely declared (the L-012 failure mode). Zero `!`,
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

| ticket | tests | ACs | growth | every addition driven by |
|---|---|---|---|---|
| T-001 | 41 | 16 | 19 → 27 → 41 | a measured cheat, then a real bug found in code review |
| T-002 | 296 | 24 | 194 → 229 → 282 → 296 | a measured cheat that survived the previous version |
| T-003 | 116 | 20 | 85 → 116 | a lazy implementation that passed 85/85 clean |

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
