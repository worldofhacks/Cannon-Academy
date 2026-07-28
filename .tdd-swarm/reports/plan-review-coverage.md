# Plan Review — Coverage & Testability lens

Reviewer: independent plan-review pass (coverage/testability). Scope reviewed: `PLAN.md`,
`ARCHITECTURE.md` §4 + §9, `.tdd-swarm/posture.md`, `TICKETS.md`, all 24 `tickets/T-*.md`,
`.tdd-swarm/traceability.md`, `references/ticket-format.md`.

**Overall assessment up front, because it matters for how to read what follows:** this is an
unusually disciplined plan. `traceability.md` already self-audits coverage line-by-line against
both source docs, flags 16 open numeric questions and 12 planning gaps *in writing*, and every
ticket's Planning Decisions section explicitly labels each number as `locked-decision`,
`proposed`, or `open-question`. I verified this self-audit rather than trusting it, and it holds
up in almost every case I checked. The findings below are the places it doesn't — real gaps and
one class of test-vs-implementation mismatch that the plan's own honesty mechanism didn't catch
because the mismatch is *between* two tickets, not within one.

---

## Critical (plan cannot proceed as written)

### C-1. `DISTRACTOR_ABS_FLOOR`'s lower bound (`>= 1`) cannot satisfy the zero-answer distractor guarantee it is supposed to back

- **Tickets:** `tickets/T-004.md` AC-5 (line 114-115), consumed by `tickets/T-005.md` AC-6-AC-8
  (lines 93-102) and exercised for real by `tickets/T-014.md` (K-1/K-2 subtraction templates).

**What's wrong.** T-005's plausibility rule (`T-005.md` lines 46-56) says a distractor `d` against
answer `x` is valid when it's within `DISTRACTOR_ABS_FLOOR` of `x`, **or** within the
magnitude-ratio band — but "the magnitude-ratio branch is skipped for a zero answer rather than
dividing by zero" (AC-6, line 95). So for `x = 0`, plausibility collapses to *only*:
`0 <= d <= DISTRACTOR_ABS_FLOOR` (negatives excluded by rule 3).

The fixed near-miss ladder (locked in T-005, line 60) is
`x+1, x-1, x+2, x-2, x+10, x-10, x*2, x+3, x-3`. At `x=0` this evaluates to
`1, -1, 2, -2, 10, -10, 0, 3, -3`. Every negative entry is excluded by the no-negative-decoy rule,
`x*2=0` collides with the answer itself, and `x+10=10` is only reachable if the abs floor is
`>= 10`. That leaves exactly `{1, 2, 3}` as the full set of values the ladder can *ever* produce
for a zero answer — and only if `DISTRACTOR_ABS_FLOOR >= 3`.

T-004's AC-5 only requires `DISTRACTOR_ABS_FLOOR` to be `an integer >= 1`. If the implementer
(reasonably, since nothing tells them otherwise) picks `1` or `2`:
- floor `= 1` → only `{1}` passes the floor test. **One** candidate, not the three AC-7 promises
  ("returns 3 values drawn from the fill ladder ... all distinct and all plausible").
- floor `= 2` → only `{1, 2}` pass. Still short by one.

Either value satisfies every AC in T-004 today, but makes T-005's AC-7 mathematically
unsatisfiable and forces AC-8's `DISTRACTOR_FAILURE` path instead — for a case that isn't exotic:
`sub_within_20` templates explicitly allow `a == b` (difference `0` is a normal, curriculum-legal
answer per T-014 line 53), and T-014's own golden sweep (AC-5, line 96-101) requires **every** one
of 1,000 seeded samples to succeed with no thrown error. A single zero-answer draw in that sweep
would fail the whole ticket, non-deterministically, depending on a constant chosen two waves
earlier in a ticket that is by then already frozen.

I also checked whether T-005's AC-6 "+2" tolerance (`within DISTRACTOR_ABS_FLOOR + 2 of 0`, line
94-95) already covers this — it doesn't. That widened *bound* only describes how far a returned
value may sit from zero; it does nothing to fix the *count* problem, because `isPlausibleDistractor`
itself still filters ladder rungs by the un-widened floor. The "+2" reads like the test author
noticed the ladder needs to reach its third positive rung (`x+3`) to gather three candidates when
the floor is assumed to be `1`, and hard-coded that arithmetic into the assertion rather than
fixing the constant it depends on.

**Why this is Critical, not Important:** it is exactly the failure mode the wave structure is
supposed to prevent — a defect that surfaces only after an earlier ticket (T-004, wave 2) is
already implemented and its tests frozen, forcing a reopen of "done" work to satisfy a later
ticket (T-005, same wave, but ordered after) that depends on it.

**Suggested fix:** in `tickets/T-004.md`, tighten AC-5 to `DISTRACTOR_ABS_FLOOR` must be an
integer `>= 3` (still leaves the value itself open — just the honest lower bound the ladder
needs). In `tickets/T-005.md`, either drop the ad hoc "+2" in AC-6 in favor of asserting directly
against `DISTRACTOR_ABS_FLOOR`, or keep it but add a sentence deriving it from the tightened
constant. While at it, pin `MAX_DISTRACTOR_ATTEMPTS` (T-004 AC-4, `>= 1` only, line 112-113)
relative to the ladder's fixed length (9 entries) — as written, an implementer could set it to `1`
or `5` and never reach the later rungs the zero-answer case needs, reproducing the same failure
through a different constant.

---

## Important (must fix before a human signs off)

### I-1. No tuning constant exists for the onboarding/tutorial duel's enemy hull, despite a specific, quotable PLAN.md promise the swarm treats as covered

- **Tickets:** `tickets/T-018.md` (Context, lines 53-56; Out of Scope, line 145), `tickets/T-004.md`
  (Context "Required export surface," lines 43-58 — only `ENEMY_HULL_BY_ISLAND` exists, keyed by
  the 5 real `IslandId`s).

PLAN.md ("Questions, coaching, onboarding..." section) states the onboarding duel is "a guided
first duel against a scripted pirate sloop that **politely sinks in three volleys**." T-018 ships
the scripting *mechanism* (`createScriptedOpponent`) and says outright: "the concrete onboarding
script is assembled by the caller from `ScriptedStep`s" (line 56) — i.e., out of this swarm's
scope.

That would be fine if the *hull number* that makes "three volleys" true were itself a named,
in-scope constant the out-of-scope caller could just read. It isn't. The only enemy-hull surface
this swarm exports is `ENEMY_HULL_BY_ISLAND` (T-004), and T-008's own AC-13 (`tickets/T-008.md`
lines 133-138) pins `port_sumwich`'s hull (40-50) to resolve in a **median of 4-6 volleys** even
at a reasonably fast, correct pace — not three. If the onboarding encounter reuses that same
per-island hull (the only one that exists), "three volleys" is false by this swarm's own damage
math. If it's meant to use a *lower*, onboarding-specific hull, that number has no home in
`tuning.ts` — meaning whoever wires `app/onboarding.tsx` later must either invent a bare literal
outside `tuning.ts` (directly contradicting ARCHITECTURE.md §4.3's "All tuning constants live in
one file") or this claim silently never gets implemented as specified.

`.tdd-swarm/traceability.md` lists "easy guided duel you win | T-018 | scripted opponent
mechanism" as covered (line 145 area) without flagging that the specific "three volleys" number
has no tuning-surface owner. This is exactly the "a ticket silently depends on something
unresolved" failure mode the review brief calls out, one level removed: here it's a *future,
out-of-scope* consumer that will silently depend on an invented number because this swarm didn't
name one.

**Suggested fix:** add `ONBOARDING_ENEMY_HULL` (or similar) to T-004's Context export surface and
an AC pinning it strictly below `ENEMY_HULL_BY_ISLAND.port_sumwich`, and have T-018's Context note
that the concrete onboarding script should be built against that constant rather than an
unspecified caller-supplied number. Cheap now; awkward once T-004 and T-018 are both frozen.

### I-2. `QUALITY_WEIGHT` has no AC pinning that speed-aimed damage is *meaningful* — only that it's monotone

- **Ticket:** `tickets/T-004.md` AC-3 (line 107-109: `0 < QUALITY_WEIGHT <= 1`, no other
  constraint); `tickets/T-008.md` AC-5 (line 106-108, monotonicity only).

The damage model is described, in T-008's own Context, as "the pedagogical heart of the game" —
PLAN.md's whole differentiation pitch rests on "answer speed aims it" being a real, felt effect
("true aim as fluency made visible"). But the only ACs governing `QUALITY_WEIGHT`'s strength are:
it's `> 0` and `<= 1` (T-004 AC-3), and damage is non-decreasing as elapsed time drops (T-008
AC-5). **A lazy-but-compliant implementation can set `QUALITY_WEIGHT = 0.001`**, making the roll
almost entirely uniform-random and speed's effect on damage negligible in practice — every AC in
both tickets still passes (monotonicity holds trivially with a near-zero slope; AC-6's "mean
strictly greater than damageMin at the floor" is satisfied by the uniform component alone,
independent of `QUALITY_WEIGHT`). This is the textbook "AC a lazy implementation would pass while
being wrong" the review brief asks for: nothing here would catch a build where fast and slow
correct answers feel statistically indistinguishable, which is precisely the bug this system
exists to prevent.

**Suggested fix:** add an AC to T-008 (or T-004) asserting an *effect size*, e.g.: over N seeded
trials at a fixed cannon, the mean `damageToEnemy` at `quality = 1` (elapsed = 0) must exceed the
mean at `quality = ANSWER_QUALITY_FLOOR` (elapsed = timerMs) by at least some fraction of
`(damageMax - damageMin)` — e.g. `>= 0.3 * range`. That pins the thing the design actually cares
about; monotonicity alone does not.

### I-3. Source-text substring scans for banned APIs are trivially defeated by aliasing, yet they're the frozen tests guarding the project's sharpest safety rules

- **Tickets:** `tickets/T-002.md` AC-1 (lines 76-78, bans `eval(`, `new Function`, `Function(`,
  `setTimeout`, `setInterval`, `import(`), `tickets/T-006.md` AC-13 (lines 139-141, bans
  `http://`/`https://`), `tickets/T-018.md` AC-9 (lines 104-106) and `tickets/T-021.md` AC-18
  (lines 145-147, both ban `Date`, `Math.random`, `setTimeout`, `setInterval`, `performance.now`).

All four are implemented as a literal substring scan over the module's source text. Each is easy
to satisfy in letter while violating it in spirit: `const F = Function; F(userExpr)` never
contains the substring `Function(`; `const D = Date; new D()` never contains `Date` followed
directly by the banned pattern the test author had in mind (it *does* contain the bare word
`Date`, so this specific case is actually caught — but `globalThis['Da' + 'te']` or
`Reflect.construct(Date, [])` is not, and neither is any dynamic-property-access indirection for
`eval`/`Function`). Nobody is going to do this maliciously in a solo 5-day project — but these
four scans are explicitly the mechanism protecting the two things the plan calls out as
non-negotiable ("no eval on child-facing content," "no wall-clock in the replay-critical engine"),
and a textual scan is a weak proxy for either property. A refactor that innocently does
`const { random } = Math;` then calls `random()` would also slip past T-018/T-021's scan while
being exactly the thing it exists to catch.

**Suggested fix:** keep the source scans (they're cheap and catch the common case) but back them
with an ESLint rule (`no-restricted-syntax`/`no-restricted-globals`) that matches identifier
*references*, not substrings — that catches aliasing and destructuring, which a grep cannot.
`.tdd-swarm/posture.md` already lists "Engine purity lint" and "Determinism lint" as enforced
gates; this is asking those existing lint rules to also cover `eval`/`Function`/network-literal
bans, rather than leaning on a second, weaker mechanism (a test-time text scan) for the same job.

---

## Minor (note in ledger)

### M-1. T-008 AC-13's volley-count tolerance is looser than the PLAN.md line it's cited against

`tickets/T-008.md` AC-13 (lines 133-138) requires the **median** volley count to land in `[4, 6]`
but allows **any individual observation** in `[4, 7]`. `traceability.md` cites this AC as covering
PLAN.md's "duels resolve in 4-6 player volleys." A 7-volley duel would pass this AC yet
contradicts the PLAN.md line as quoted. This is a defensible engineering call (a stochastic system
needs some tail tolerance) but the traceability citation overstates what's actually pinned — worth
either tightening the outer bound to `[4, 6]` and accepting a very rare seeded flake, or annotating
the citation to say "median-only, tail tolerance to 7."

### M-2. Intermediate-phase hull clamping is asserted only by the invariant fuzz (T-024), not directly by T-020

`tickets/T-020.md`'s DoD says "Hulls are clamped at 0 and can never go negative" (line ~178), and
AC-10/AC-11 (lines 110-116) check clamping *at the victory/defeat transition*, but no AC checks
that the `resolvePlayer`/`resolveRival` state itself (before the terminal `ANIMATION_DONE` check)
already holds a clamped hull after a lethal overkill hit (e.g. hull=5, incoming damage=20). This is
implicitly covered by T-024's invariant #1 (`0 <= enemyHull <= enemyMaxHull`, no phase qualifier)
run across 2,000 fuzz duels after every dispatch — likely to catch it — but T-020 itself, the
ticket that actually implements clamping, has no direct AC for the exact scenario. Cheap to add:
one AC dispatching a single overkill volley and checking the `resolvePlayer` state's hull directly.

### M-3. `weightedPick`'s declared input shape and `CHEST_RARITY_WEIGHTS`'s declared shape aren't reconciled by any AC

`tickets/T-001.md` specifies `weightedPick(rng, entries)` over an array of `{value, weight}`-like
entries (AC-10, example `[{a,1},{b,3}]`). `tickets/T-004.md` describes `CHEST_RARITY_WEIGHTS` as
keyed one-entry-per-`ChestRarity` (AC-7, implying a `Record<ChestRarity, number>`).
`tickets/T-009.md`'s Context says `rollChest` calls `weightedPick(rng, CHEST_RARITY_WEIGHTS)`
directly (line 51) with no conversion step named or tested. Whoever implements T-009 has to invent
an array-from-record conversion (ordering, most naturally `Object.entries` in the const's
declaration order) that no AC in either T-001, T-004, or T-009 pins. Low risk in practice (JS
preserves string-key insertion order, so it's deterministic either way) but it's an unspecified
interface point between two tickets in different waves — worth a one-line note in T-009 saying
what shape the conversion takes, so two different implementers wouldn't independently guess
differently in a way that changed which enumeration order feeds the PRNG stream.

### M-4. Sizing: T-020 (22 ACs, single file) and T-021 (19 ACs across two files) are large relative to the "~half a day" ticket-format rule

`TICKETS.md` already self-flags T-020 as "the largest ticket in the run (22 ACs)" (line 195), so
this isn't a discovery so much as a second confirmation that the self-flagged risk is real: 22 ACs
for one reducer, several requiring full scripted event sequences (AC-18 through AC-20), is a
substantial implementation-plus-test-writing load for a single half-day ticket, and it sits on the
critical path (wave 6, gates waves 7-8). T-021 similarly bundles two files (`mercy.ts`, `bot.ts`)
and 19 ACs into one ticket; the two files are tightly coupled by design, so splitting them may cost
more coordination than it saves, but it's worth the orchestrator explicitly deciding to accept the
overrun rather than defaulting into it. No action needed beyond a conscious go/no-go by the human,
since ticket-format.md's split trigger is DoD-item-count and "spans two concerns," neither of which
technically fires here.

### M-5. T-022's Perfect Shot boundary test is less rigorous than the precedent it modifies

`tickets/T-008.md` AC-3 pins the Perfect Shot boundary with an exact off-by-one pair (`e = 7999`
true, `e = 8000` false) against a concrete timer. `tickets/T-022.md` AC-9 (lines 102-104) tests the
same boundary qualitatively ("an elapsed time that would be a Perfect Shot under the full timer but
is not under the shortened one") with no concrete numeric pair. Since Double-Shot changes the
denominator the boundary is computed against, an off-by-one error in how the shortened timer feeds
`isPerfectShot` (e.g. rounding direction on `Math.round(cannon.timerMs * DOUBLE_SHOT_TIMER_FACTOR)`)
could slip through a qualitative check that a T-008-style exact-boundary check would not. Cheap fix:
add one concrete numeric example alongside AC-9.

---

## Confirmed clean (checked, not just assumed)

- **`traceability.md`'s coverage table itself:** spot-checked roughly a dozen citations (question
  engine, duel machine, damage model, mastery, ranks, economy) against the actual AC text they
  point to. All matched what they claimed, with the one caveat in M-1 above.
- **`noUncheckedIndexedAccess` handling:** consistently correct throughout. `Partial<Record<...>>`
  lookups are explicitly called out for `undefined`-handling (T-010's DoD, T-013's
  `templatesBySkill`, T-020 AC-21 for the missing-skill-pool case). Full `Record<K,V>` lookups
  (`ENEMY_HULL_BY_ISLAND`, `BOT_ACCURACY_BAND_BY_GRADE`) are fine as-is since TS treats a mapped
  type over a closed union as total, not an index signature. The "total lookup helper that throws
  instead of returning `undefined`" pattern (T-006 AC-11, T-012 AC-10, T-019 AC-13) is applied
  consistently everywhere a `.find()`-style lookup would otherwise leak `T | undefined`.
- **`exactOptionalPropertyTypes` handling:** T-003 AC-6 explicitly requires optional fields to be
  *omitted*, not set to `undefined`, on successful parse — the correct behavior under this flag,
  and it's tested.
- **Determinism:** no `Map`/`Set` anywhere in serializable state (T-013 DoD explicitly bans them),
  no wall-clock reads found anywhere `elapsedMs`-shaped data is needed (always a parameter), and
  every numeric boundary I checked for float-precision hazards (Perfect Shot cutoffs against
  15000/18000/20000ms timers, mastery meter arithmetic) lands on exact values, not
  floating-point-fragile ones.
- **Silent dependency on open/research-required items:** every locked/proposed/open-question
  numeric decision I traced back to its source was either genuinely sourced from PLAN.md/
  ARCHITECTURE.md verbatim (I checked all of T-004's `locked-decision` values against the source
  documents directly — all confirmed exact, no fabrication) or explicitly marked `open-question`
  with bounds-only ACs and a cross-reference into `traceability.md` §2. The two exceptions are C-1
  and I-1 above, which are gaps in *what got a constant at all*, not fabricated values.
- **MVP "cannot slip" checklist:** walked all twelve lines against engine-ticket coverage. Eleven
  are fully covered or correctly, explicitly marked partial (persistence/UID lines are honestly
  out of scope). The twelfth (guided duel) is covered as a *mechanism* but its specific "three
  volleys" quantitative claim is the gap in I-1.
