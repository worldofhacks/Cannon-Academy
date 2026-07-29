# T-008 — Code Review

**Reviewer:** independent senior review (did not write this code)
**Ticket:** `tickets/T-008.md` — Damage model, 16 ACs
**Implementation:** `src/engine/duel/damage.ts` (new, 142 lines)
**Commit reviewed:** `a0efbe5` (worktree `cannon-wt/wt-T-008`, branch `ticket/T-008-damage-model`)
**Frozen suite:** `__tests__/engine/duel/damage.test.ts`, 35 tests, one commit (`1e81a5e`), never re-touched

Green gates are taken as given (811/811, spec-lint 16/16, one source-only commit, zero test edits — all
re-confirmed structurally below). This review looks for what passing does not prove: I re-derived the
formula term by term, re-ran the curve numerically against the real catalog, and probed the input
domain the frozen suite does not sweep.

---

## Verdict 1 — SPEC COMPLIANCE

### Acceptance criteria

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 | **met** | `damage.ts:56-63`. `(true,0,20000)` → `remaining=1` → `1`; `(true,10000,20000)` → `0.5`; `(true,20000,·)` and `(true,999999,·)` → clamp to `0` → `Math.max(FLOOR, 0)` = `0.35`; `(false,·)` → early `return 0` at `:58`. |
| AC-2 | **met** | `damage.ts:60-62`. `1 - e/T` is strictly decreasing in `e`; `min`/`max` clamps and `max(FLOOR, ·)` are monotone non-decreasing compositions, so the sweep is non-increasing and confined to `[0.35, 1]`. |
| AC-3 | **met** | `damage.ts:70` — `elapsedMs < PERFECT_SHOT_TIMER_FRACTION * timerMs`, strict `<`. The off-by-one tripwire is on the correct side of the boundary. `resolveShot` does not recompute the edge; it calls the same predicate at `:126`. |
| AC-4 | **met** | `damage.ts:123-124`. `lowerRaw > damageMin` and `damageMin` is a schema-guaranteed integer, so `ceil(lowerRaw) >= damageMin`; `Math.min(·, damageMax)` caps it; `u ∈ [0,1)` makes `round(u*(damageMax-lower)) <= damageMax-lower`. Integer by construction. |
| AC-5 | **met** | `damage.ts:119,123` — `lower` is non-decreasing as `elapsedMs` falls, and for a fixed `u` the roll is monotone in `lower`. `bonusDamage` (`:127`) also only ever goes `0 → +1` as `elapsedMs` falls. |
| AC-6 | **met** | Re-derived independently: Swivel at `elapsedMs = timerMs` gives `lower = ceil(8 + 0.35*4) = 10`, `N = 2`, so the support is exactly `{10,11,12}` with `P = .25/.5/.25` → mean **11.0** ≥ 10.5, min **10** ≥ 10. |
| AC-7 | **met** | `damage.ts:126-127` (bonus), `:135` (`damageToEnemy = rollDamage + bonusDamage`), `:137` (`ballCount`). |
| AC-8 | **met** | `damage.ts:92-110`. Swivel is `reliable`, so the ternary at `:97` yields `0`; every other field is a literal `0`/`false`. |
| AC-9 | **met** | `damage.ts:97` — `cannon.temperament === 'volatile' ? cannon.recoilDamage : 0`. Recoil is read from the cannon, never from a table, so `5/8/10` come from `cannons.json` and the zero-recoil Culverin also reads correctly. |
| AC-10 | **met** | No module-scoped state, no closures, no caches; `rng.ts` is likewise pure. Output is a fresh object literal each call. |
| AC-11 | **met** | `damage.ts:89-90` — the `nextFloat` draw sits **before** the `if (!correct)` at `:92`, and both return paths (`:109`, `:140`) return the same `nextRng`. Exactly one step, both branches. Note the two `RangeError` throws (`:82-87`) are *above* the draw, which is also correct — a rejected call must not consume the stream. |
| AC-12 | **met** | `damage.ts:82-87`, both `RangeError`, both with the offending value in the message. (Non-finite inputs are outside what AC-12 names — see Minor M2.) |
| AC-13 | **met** | Re-derived: Swivel at `0.5*timerMs` gives `lower = 10`, support `{10,11,12}`; against `ENEMY_HULL_BY_ISLAND.port_sumwich = 45` the volley count is bounded by `⌈45/12⌉ = 4` and `⌈45/10⌉ = 5`, so *every* observation is in `[4,5] ⊂ [4,6]`. This holds structurally, not just for the 1,000 seeds sampled. |
| AC-14 | **met** for every finite input | All numeric fields are integers by construction (`round`/`ceil` of integer-anchored values, plus integer catalog fields); `answerQuality ∈ [0,1]` by `:61-62`. See M2 for the non-finite hole, which AC-14's frozen test does not sweep. |
| AC-15 | **met** | `damage.ts:119` — the floor is inside `Math.max(quality * QUALITY_WEIGHT, ANSWER_QUALITY_FLOOR)`, which multiplies `range` and is added to `damageMin` to form the **roll's lower bound**. `rollDamage >= lower >= damageMin + 0.35*range`. This is the term the ticket said was the whole point, and it is placed correctly. The rejected linear blend (`u*(1-W) + q*W`) does not appear anywhere in the file. |
| AC-16 | **met** | Measured against the real catalog at the shipped `QUALITY_WEIGHT = 0.7`: mean gap / required gap = culverin 1.68×, twelve_pounder 1.49×, mortar 1.49×, double_broadside 1.68×, powder_keg 1.81×, long_nine 1.86×. Consistent with L-021's empirical bite point of `w = 0.6`; the shipped value clears it with real margin, not knife-edge margin. |

**16/16 met. Zero cannot-verify.**

### Definition of Done

| Item | Verdict | Evidence |
|------|---------|----------|
| Every AC has a passing test tagged `spec(T-008:AC-n)` | met | spec-lint 16/16 (given); 35 `it()` blocks each carry a `spec(T-008:AC-n)` comment. |
| `run-local-gates.sh` green | met | given. |
| `spec-lint.sh tickets/T-008.md` green | met | given. |
| No `Math.random()`, no `Date`; `elapsedMs` a parameter | met | `grep` over the source returns nothing for `Math.random`, `Date`, `performance.now`. `elapsedMs` enters only through `ResolveShotInput` (`:47`). |
| Every constant from `@engine/tuning`; no feel-number literal | met | The five tuning imports at `:23-29` are the only feel-numbers. The remaining literals are `0`/`1` acting as clamp bounds (`:61`), absence sentinels in the misfire object (`:101-107`), and the `+ 1` bonus ball at `:137` — which AC-7 itself states literally as `BASE_BALLS_PER_VOLLEY + 1`. Judged compliant; see the note under M4 about the missing companion constant. |
| `ANSWER_QUALITY_FLOOR` bounds the **roll's** lower bound | met | `:119`, as detailed under AC-15. This is the ticket's load-bearing requirement and it is right. |
| `ShotOutcome` is plain and serialisable | met | Object literal at `:99-108` and `:131-139`; no class, no `Symbol`, no getters; prototype is `Object.prototype`. It becomes safe input for T-013's `DuelState`. |
| Files changed exactly `file_scopes` | met | `git show --name-only a0efbe5` → `src/engine/duel/damage.ts`, nothing else. `git diff swarm/engine-core..HEAD --name-only` shows only the frozen test (from the earlier test commit) and this one source file. Working tree carries no stray scratch file under `__tests__/`. |

**8/8 met.**

### Iron Law — anything built the ticket did not ask for

**Clean.** Exports are exactly the ticket's four surfaces: `ShotOutcome`, `answerQuality`,
`isPerfectShot`, `resolveShot`. `ResolveShotInput` (`:44-49`) is unexported and mirrors the ticket's
inline input type verbatim. No options bag, no overloads, no configuration hook, no defensive
normalisation of catalog data, no re-export of tuning constants, no logging, no memoisation. Nothing
in the file anticipates T-013, T-020, or T-022.

### The three verification asks, answered directly

**1. The `+1` Perfect Shot ruling — `BASE_BALLS_PER_VOLLEY` never touches damage. Confirmed.**
It is imported at `:26` and appears exactly once in the body, at `:137`, on the `ballCount` field.
`damageToEnemy` (`:135`) is `rollDamage + bonusDamage`; `rollDamage` (`:124`) is built from
`lower`, `u`, and `damageMax` only; `bonusDamage` (`:127`) is `PERFECT_SHOT_BONUS_DAMAGE` or `0`.
`ballCount` is a leaf — nothing reads it. The implementer's claim is accurate as stated.

**2. Recoil gates on `temperament`. Confirmed, and it is the real gate.**
`damage.ts:97` reads `cannon.temperament === 'volatile' ? cannon.recoilDamage : 0`. All ten catalog
guns that are not `volatile` carry `recoilDamage: 0`, so — as the frozen suite's own comment says —
an ungated `damageToSelf: cannon.recoilDamage` would pass every catalog-data assertion. The gate is
present in source, the synthetic `standard`-with-recoil probe at `damage.test.ts:564-599` is the
only thing that would catch its removal, and `schemas.ts:136,151-157` confirms that probe is
schema-legal (`recoilDamage: z.number().int().min(0)`; only `reliable` is forbidden non-zero
recoil). The defence is one test wide, but it is real and it is pointed at the right thing.

**3. PRNG discipline. Confirmed.**
One `nextFloat` at `:90`, above the correctness branch at `:92`; both exits thread `nextRng`
(`:109`, `:140`). A misfire draws and discards. Validation throws precede the draw. Replay
alignment holds across mixed right/wrong sequences.

---

## Verdict 2 — CODE QUALITY

### What is genuinely clean

This is a careful implementation of a subtle spec, and the parts that matter most are the parts
that are right:

- **The floor is in the right place.** `:119` puts `ANSWER_QUALITY_FLOOR` inside the `max` that
  scales `range`, so the guarantee is about the outcome. The rejected linear blend is not present
  in any form, and the file's header comment (`:6-10`) explains *why* the blend was wrong rather
  than just noting that it was rejected. This is the one thing a reviewer most wanted to find, and
  it is correct.
- **The recoil gate exists** rather than coincidentally matching the catalog.
- **The draw ordering is right** and the reason is written down at `:89`.
- **Purity is real**, not asserted: no module state, no `Date`, no `Math.random`, output is a fresh
  frozen-shaped literal, `Rng` is threaded and returned.
- **`noUncheckedIndexedAccess` is a non-issue here.** The source performs zero indexed access, so
  there is no `!` and no `as` anywhere in the file — nothing was silenced because nothing needed
  silencing. (`tsconfig.json:15-16` confirms `strict` + `noUncheckedIndexedAccess` are on.)
- **Validation messages carry the offending value**, which will matter when T-020 starts feeding
  this from a reducer.
- **The implementer's report is honest**, including self-disclosing the transient `cp` into
  `__tests__/` and the guard gap it revealed (a genuinely useful finding, consistent with L-023).
  I verified the disclosure: the frozen test file has exactly one commit and the tree is clean.

### Findings

Severity summary: **Critical 0 · Important 0 · Minor 4 · Observations 2.**

---

#### M1 — Minor — The dead zone is real, is larger than expected, and the one comment that describes it is wrong

`damage.ts:116-118` reads:

> *"Quality above the floor lifts the bound further, so speed shifts the whole distribution upward
> while genuine spread survives at every quality."*

The first clause is false as written. Because the term is `max(quality * QUALITY_WEIGHT, ANSWER_QUALITY_FLOOR)`,
quality only lifts the bound once `quality > ANSWER_QUALITY_FLOOR / QUALITY_WEIGHT = 0.35/0.7 = 0.5` —
not once quality is above the floor (0.35). Quality between 0.35 and 0.5 does nothing at all.

Translated to the timer: `quality = 1 - elapsed/timer`, so **the roll's lower bound stops moving at
exactly 50 % of the timer on every cannon**, and `ceil` discretisation freezes it earlier still on
most guns. Measured over the real catalog:

| Cannon | Range | Roll floor at 0 % / 25 % / 50 % / 75 % / 100 % of timer | Dead zone |
|---|---|---|---|
| swivel_gun | 8–12 | 11 · 11 · 10 · 10 · 10 | **last 71 % of the window** |
| six_pounder / chain_shot | 10–16 | 15 · 14 · 13 · 13 · 13 | last 71 % |
| nine_pounder | 12–18 | 17 · 16 · 15 · 15 · 15 | last 71 % |
| culverin | 4–16 | 13 · 11 · 9 · 9 · 9 | last 60 % |
| twelve_pounder / mortar | 14–24 | 21 · 20 · 18 · 18 · 18 | last 57 % |
| double_broadside | 16–28 | 25 · 23 · 21 · 21 · 21 | last 60 % |
| powder_keg | 20–34 | 30 · 28 · 25 · 25 · 25 | last 51 % |
| long_nine | 24–40 | 36 · 33 · 30 · 30 · 30 | last 53 % |

Two things follow, and I want to separate them cleanly:

**(a) The behaviour is correct.** This is the ticket's formula implemented exactly. It errs on the
*safe* side of ARCHITECTURE:206 — a slow child is never punished — and AC-16 still clears its
effect-size bar at 1.5–1.9×. Nothing here is a spec violation and I am not asking for a formula
change. That is a design conversation for the owner and the dev slider, not a T-008 defect.

**(b) The code does not make it legible, and actively misdescribes it.** There is no named constant
for the 0.5 crossover, no comment marking it, and the one sentence that touches the subject says the
opposite of what the code does. Worse, the neighbouring docstring at `:52-54` tells a reader that
quality *"reaches the floor at 65 % of the timer and stays there"* — true of `quality`, but it invites
the inference that damage stops improving at 65 %, when it actually stops at 50 %. A future editor
reading these two comments together and then measuring the curve will conclude something is broken,
and the obvious "fix" (removing the `max`, or lowering the floor) destroys AC-15.

There is a second, smaller consequence worth writing down: for `elapsed ∈ (0.5·T, 0.65·T)` the
`answerQuality` field still moves (0.5 → 0.35) while damage is frozen. Any UI that drives a quality
meter off `ShotOutcome.answerQuality` will show the child improving when the damage does not change.

**Recommendation.** No behaviour change. Replace `:116-118` with something that names the crossover
and states the consequence, e.g.:

> The floor binds the ROLL's lower bound, which is what makes ARCHITECTURE:206 a guarantee about the
> outcome rather than an intermediate. Consequence, deliberate and not a bug: quality only lifts the
> bound once `quality > ANSWER_QUALITY_FLOOR / QUALITY_WEIGHT` (= 0.5 today), i.e. once the answer
> lands in the first half of the timer. Every slower correct answer resolves to the same floored
> band — the pedagogical floor swallowing the curve is the intended shape, not a missing term.
> Removing the `max` or lowering the floor to "fix" the flat region breaks AC-15.

Optionally introduce a derived local `const QUALITY_CROSSOVER = ANSWER_QUALITY_FLOOR / QUALITY_WEIGHT;`
purely as documentation of the bite point (it need not be used in the arithmetic).

---

#### M2 — Minor — A non-finite `elapsedMs` yields a `NaN` outcome instead of a `RangeError`

`damage.ts:82-87` rejects `elapsedMs < 0` and `timerMs <= 0`. `NaN` passes both comparisons.
Measured against the real Swivel:

```
resolveShot({ elapsedMs: NaN })  -> { kind:'volley', answerQuality: NaN, rollDamage: NaN,
                                      damageToEnemy: NaN, ballCount: 1, perfectShot: false }
answerQuality(true, 0, 0)        -> NaN
answerQuality(true, NaN, 20000)  -> NaN
```

`Infinity` is handled fine (clamps to the floor). `timerMs: NaN` has the same hole but is shielded
upstream by `cannonSchema` (`schemas.ts:137`, `z.number().int().positive()`), so the reachable path is
`elapsedMs` — which is caller-supplied and is exactly the kind of value a UI timer produces from an
undefined start timestamp (`Date.now() - undefined`).

This is not an AC violation: AC-12 names only negatives and `timerMs <= 0`, and AC-14's frozen test
sweeps only finite inputs. But it sits in the gap between the two ACs — AC-14 states as a general
property that every numeric field is a finite integer, and this input class breaks it silently. A
`NaN` `damageToEnemy` reaching T-020's hull subtraction produces a hull that is never `<= 0`, i.e. a
duel that cannot end, with no exception anywhere to point at the cause.

Also worth noting: `answerQuality` is a **public export** with no validation of its own. T-013/T-020
or a UI quality meter can legitimately call it directly with a `timerMs` this module never saw.

**Recommendation.** One line beside the existing guard, fully within AC-12's spirit:

```ts
if (!Number.isFinite(elapsedMs)) {
  throw new RangeError(`resolveShot: elapsedMs must be finite (got ${elapsedMs})`);
}
```

and the same treatment for `cannon.timerMs`. Guarding `answerQuality` itself is optional — but if it
stays unguarded, its docstring should say that `timerMs > 0` is the caller's responsibility.

---

#### M3 — Minor — The clamp comment states an argument where L-015 asks for the probe

`damage.ts:120-122`:

> *"The `min` binds only if `QUALITY_WEIGHT > 1` — for `w <= 1`, `lowerRaw <= damageMax` and
> `damageMax` is an integer, so `ceil` cannot pass it. `QUALITY_WEIGHT` is a live dev-screen slider,
> so the clamp stays rather than resting on today's value."*

**The judgement to keep the clamp is right**, and I want to be explicit about that: `QUALITY_WEIGHT`
is a live slider (`tuning.ts:81`, `ARCHITECTURE.md §4.3`), so `w > 1` is reachable configuration, not
a hypothetical. Deleting the clamp because "it can't bind today" would be exactly the mistake L-015
exists to prevent.

**The argument is also sound.** I checked it: with `w <= 1` and `quality <= 1`,
`max(q*w, 0.35) <= 1`, so `lowerRaw <= damageMin + range = damageMax`, and `damageMax` is a
schema-guaranteed integer (`schemas.ts:134`), so `ceil` cannot exceed it.

**But the comment is an argument, and L-015's instruction is "say so with the probe attached."** The
implementer *did* run the probe (report §1: swept `w ∈ [0.001, 4.000]` × 1,001 quality values × ten
cannons plus a degenerate `range === 0` shape; first bite at `w = 1.001`; never on range-0) — that is
good work. But the probe was run from the scratchpad, is not committed, and is not cited in the
comment. A reader of `damage.ts` alone sees only reasoning, which is precisely the artefact L-015
says not to trust. The honesty gap is in the source, not in the report.

**Recommendation.** Amend the comment to carry the measurement rather than the derivation — e.g.
*"Measured (T-008 review probe, 2026-07-28): first binds at `w = 1.001` on every catalog cannon,
never on a `range === 0` shape."* One sentence, and the claim stops being an argument.

---

#### M4 — Minor — Balance note: the Perfect Shot reward vanishes on the late-game guns

Not a T-008 defect — `PERFECT_SHOT_BONUS_DAMAGE` lives in `tuning.ts:87`, outside this ticket's
`file_scopes`, and the dev screen exists for exactly this. Recording it because this review is the
first place the constant meets real cannon ranges.

`PERFECT_SHOT_BONUS_DAMAGE = 1` is a ~9 % lift on the Swivel (8–12) and a **2.5–4 % lift on the Long
Nine (24–40)** — smaller than one step of the roll's own spread, i.e. statistically invisible to the
player it is meant to reward. The Perfect Shot is the game's celebration beat; by grade 5 it will not
be felt. Note also that `tuning.ts:87` still justifies the constant with ARCHITECTURE's superseded
*"+1 bonus ball"* wording, which T-031 is correcting.

**Recommendation.** Raise with the owner alongside T-031, and consider expressing the bonus as a
fraction of `range` rather than a flat point. Also consider adding a `PERFECT_SHOT_BONUS_BALLS`
constant so the literal `+ 1` at `damage.ts:137` has a named home — today it is the only bare
integer in the file with feel-number character, and it is bare only because AC-7 wrote it that way.

---

#### Observations (no action requested)

**O1 — The roll is not uniform, and two documents say it is.** `roll = lower + round(u*(damageMax - lower))`
gives the two endpoints half the probability mass of each interior value (`0.5/N` vs `1/N`). The
ticket says the roll lands *"uniformly in the top 65 %"* and `ARCHITECTURE.md:200` says
`uniform(cannon.min, cannon.max)`. Neither is literally true. The implementation is correct — `round`
is mandated by the ticket's formula — and the mild centre bias is arguably better feel than a flat
distribution. Flagging only so nobody later "fixes" the implementation to match the prose.

**O2 — AC-13 does not guard `QUALITY_WEIGHT`, by coincidence of its sample point.** AC-13 fires at
`elapsedMs = 0.5 * timerMs`, which is exactly the M1 crossover. At `w = 0.7` that point sits on the
boundary; at any `w < 0.7` it sits *inside* the dead zone, so AC-13 returns identical results and
stays green. The 4–6 volley guarantee is therefore insensitive to a downward retune of
`QUALITY_WEIGHT`, and AC-16 is the sole guard on that constant. That matches L-021's conclusion and
is not a defect — but it means the effect-size test carries the whole load, which is worth knowing
before anyone touches the slider.

**O3 — Record-keeping.** `.tdd-swarm/reports/T-008-implementation.md:4` cites commit `ff37036`; the
commit on the branch is `a0efbe5`. Almost certainly a rebase onto `swarm/engine-core` after the
report was written. Content of the report otherwise matches the code exactly. Worth a one-character
fix if reports are meant to be traceable.

---

## Verdict

Spec compliance is **clean**: 16/16 ACs met, 8/8 DoD items met, no cannot-verify, no Iron Law
violation. The three properties the dispatch singled out — the floor binding the roll outcome, the
`temperament` gate on recoil, and the single pre-branch PRNG draw — are all present in source and
correct for the right reasons, not by coincidence of catalog data.

Code quality carries **four Minor findings and no Critical or Important**. None of them changes a
number, breaks a stated guarantee, or blocks a downstream ticket. M1 is the one I would most want
addressed before T-013 and T-020 build on this module: the behaviour is right, but the comment on
the file's single most important line says the opposite of what the code does, in a module whose own
lessons file (L-006, L-021) records two prior near-misses on exactly this constant. M2 is a one-line
hardening with outsized downside if skipped. M3 and M4 are a sentence and a conversation
respectively.

**APPROVED**
