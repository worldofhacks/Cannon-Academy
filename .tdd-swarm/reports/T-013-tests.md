# T-013 — Duel state types & initial-state constructor — TEST AGENT REPORT

**Round 2**, after the cross-model test-design review rejected round 1 and the ticket was amended
from 12 acceptance criteria to 15.

## 0. Unit assertion (L-031)

Asserted before any measurement, from an explicit `cd` into the worktree:

| Check | Value |
| --- | --- |
| `git branch --show-current` | `ticket/T-013-duel-types` |
| `.tdd-swarm/active-ticket` | `T-013` |
| `.tdd-swarm/phase` | `tests` |

| File integrity | SHA-256 of `__tests__/engine/duel/types.test.ts` |
| --- | --- |
| **Starting** (expected `89dcd0f9…`) | `89dcd0f967db0e9fdc487927fd5e593353e151e313987bcc3563076d7dd9d030` ✅ matches |
| **Ending** | ``154ebee16c995de53f805bb964316f4c441e362cb2f9a4be945c9397589c5e2d`` |
| Commit | `74d2c21` (`74d2c2144b794363629fad2abf0c00c7501cab6f`) on `ticket/T-013-duel-types` |

The restored file matched the expected digest exactly, so the aborted rebase cost nothing.

---

## 1. Status

**DONE_WITH_CONCERNS** — both contract holes are closed and independently verified dead, all 15
ACs and all 9 DoD items are covered, and the mutation matrix is 45/45 with 5/5 controls
surviving. The concerns are three things the orchestrator should rule on, not defects I left in:
the three known survivors (§9), one **equivalent mutant** I could not kill and will not pretend
to have killed (§6), and one **correction to my own round-1 report** whose conclusion was wrong
in a way that matters to the implementer (§5).

---

## 2. What the review found, reproduced and closed

I built both mutants myself before writing a line of new test, rather than trusting the report.

| Hole | Reproduced against round-1 suite | Now |
| --- | --- | --- |
| **1. Mutable `DuelCore.seed`** | `tsc` **0 errors**, vitest **100/100 pass** — confirmed | **KILLED, 10 `tsc` errors** in the test file |
| **2. `readonly debug?: string` on the `CANNON_SELECTED` variant only** | `tsc` **0 errors**, vitest **100/100 pass** — confirmed | **KILLED, 1 `tsc` error** |

Both diagnoses were exactly right, including the mechanism. Indexed access discards property
modifiers, so `Exact<DuelState['seed'], number>` is `true` either way; and constraining
`DuelEvent['type']` plus the runtime keys of five hand-written fixtures cannot see an optional
field, because the discriminant is unchanged and a fixture just omits the key.

**A trap in closing hole 1 that is worth recording.** The obvious probe — `Exact<Readonly<T>, T>`
— is a **false negative** on every `DuelState` variant. The variants are intersections
(`DuelCore & {phase: …}`), and `Readonly<A & B>` is a flattened mapped type while `A & B` is not;
`Exact` is invariant, so it reports them as different **even when every property is already
readonly**. Written that way, AC-14 would have been unsatisfiable and I would have "discovered" a
defect that was not there. The fix is to map both sides through the same homomorphism:

```ts
type Flatten<T> = { [K in keyof T]: T[K] };            // preserves modifiers, flattens intersections
type IsFullyReadonly<T> = Exact<Flatten<T>, Readonly<T>>;
```

This leaves only the difference in modifiers, which is the thing being measured. It carries a
two-line negative control (`IsFullyReadonly<{a: number; readonly b: string}>` must be `false`,
its all-readonly twin must be `true`), so it cannot silently degrade into true-for-everything and
reopen the hole.

---

## 3. Recounted totals

Counted from the committed file, not restated. The round-1 report's directive count was wrong in
the way the review said: **34 active directives, and 6 further mentions inside prose comments**
that a naive `grep` adds to the total. Prose in this file now spells tag ids longhand for the
same reason.

| Metric | Round 1 | **Round 2** |
| --- | --- | --- |
| Lines | 1641 | **2202** |
| `it()` blocks | 100 | **122** |
| `expect()` call sites | 173 | **219** |
| **Active** `@ts-expect-error` directives | claimed 30, actually 25 | **34** |
| …further occurrences in prose (excluded) | 5 | 6 |
| Type-equality probe declarations | 64 | **90** — 88 asserting `true`, **2 negative controls** asserting `false` |
| Type-level `it()` blocks | 40 | **49 of 122** |
| `spec(T-013:AC-n)` tag occurrences | 87 | **116** |
| `dod(T-013:n)` tag occurrences | 13 (unparseable) | **9, all numeric** |

**Two independent cross-checks that the counts are real**, rather than my say-so:

- 34 active directives ↔ **34 `TS2578`** ("unused `@ts-expect-error`") in the RED state. Every
  active directive goes unused when the module resolves to `any`; the tally matches exactly, so a
  miscount in either direction would show up as a mismatch.
- The suite's own `dod(T-013:3)` test parses this file's tags and fails on any that are
  non-numeric or any DoD number left uncovered. It is the test that would have caught round 1's
  named tags.

---

## 4. spec-lint — 15 ACs and 9 DoD items

```
== spec-lint T-013 ==
  PASS  AC-1 -> 6    PASS  AC-2 -> 18   PASS  AC-3 -> 3    PASS  AC-4 -> 3
  PASS  AC-5 -> 9    PASS  AC-6 -> 8    PASS  AC-7 -> 4    PASS  AC-8 -> 8
  PASS  AC-9 -> 5    PASS  AC-10 -> 11  PASS  AC-11 -> 13  PASS  AC-12 -> 6
  PASS  AC-13 -> 10  PASS  AC-14 -> 6   PASS  AC-15 -> 6
  PASS  DoD-1 -> 1   PASS  DoD-2 -> 1   PASS  DoD-3 -> 1   PASS  DoD-4 -> 1
  PASS  DoD-5 -> 1   PASS  DoD-6 -> 1   PASS  DoD-7 -> 1   PASS  DoD-8 -> 1
  PASS  DoD-9 -> 1
== SPEC-LINT PASS ==
```

### How each DoD item is covered, and where a test cannot honestly carry the claim

`run-local-gates.sh` fails on any `.skip`/`.only` under `__tests__`, so a documented skipped test
was not available as an escape hatch — every tag sits on a **live, passing assertion**.

| DoD | Requirement | How it is asserted | Honest? |
| --- | --- | --- | --- |
| 1 | Every AC has a tagged test | Parses `tickets/T-013.md` for `**AC-n**`, asserts each has a `spec` tag in this file. Goes red if AC-16 is ever added | Fully |
| 2 | `run-local-gates.sh` is green | **Partial, and named so.** A test cannot report its own gate suite's exit code — vitest *is* one of the gates. Asserts the two parts that are real: the script still invokes all four gates (a gate quietly cut to three keeps printing PASS — L-036), and this file adds no deferred-work marker or focused test, which are the only two gate checks a test file can break | Partial, stated |
| 3 | `spec-lint` is green | **Partial, and named so.** Circular in the strict sense. Asserts the part that is real and that round 1 got wrong: every `dod` tag in this file is numeric, all 9 numbers are covered, and the file cites at least one criterion | Partial, stated |
| 4 | Discriminated union, `readonly` throughout | Tagged onto the AC-14 per-variant readonly test — the strongest evidence in the file | Fully |
| 5 | Plain JSON, no class/closure/Map/Set | Tagged onto the AC-6 recursive plain-JSON walker | Fully |
| 6 | Exactly the five event types | Tagged onto the AC-13 discriminant test | Fully |
| 7 | Tests enumerate phases/events as literal arrays | Reads **this file's own source** and requires the two enumerations to be inline arrays of quoted string literals whose contents equal the runtime arrays. Behaviour cannot tell a literal from a derivation; source can | Fully |
| 8 | No `Math.random()`, no `Date`; tuning read | **Behavioural, and named so** — the module does not exist, so its source cannot be scanned. Moves the system clock between constructions (2031 and 1999) and requires deep equality, then repeats 25×; the tuning half is AC-2's perturbed-`PLAYER_HULL` mock | Fully, for the property; lexical scan impossible |
| 9 | Files changed are exactly `file_scopes` | Reads `src/engine/duel/` and requires its contents to be a subset of `{damage.ts (frozen T-008), types.ts}`. Catches an implementer spreading the ticket into helper modules — which nothing else here would notice | Partial, stated |

Nothing was left untagged. Items 2, 3 and 9 are narrower than their checkbox text and say so in
their own test names, which I judged better than either a hollow `expect(true).toBe(true)` or an
uncovered item that fails the gate.

---

## 5. RED evidence — and a correction to round 1

Measured on the committed tree with the scratchpad removed and the working tree clean.

```
 Test Files  1 failed | 13 passed (14)
      Tests  1229 passed (1229)

 FAIL  __tests__/engine/duel/types.test.ts
Error: Cannot find module '@engine/duel/types' imported from …/types.test.ts
 ❯ __tests__/engine/duel/types.test.ts:53:1
```

`npx tsc --noEmit` → exit 2, **88 errors, every one inside my test file**:

| Code | Count | What it is |
| --- | --- | --- |
| `TS2307` | 3 | **Root cause** — cannot find `@engine/duel/types` |
| `TS2322` | 51 | `Type 'true' is not assignable to type 'false'` |
| `TS2578` | 34 | `Unused '@ts-expect-error' directive` |

**The implementer's target is 88 → 0, not "the three `TS2307`s disappear."** A partial
implementation that resolves the import while leaving `TS2322`/`TS2578` errors has failed the
type contract, and those 85 errors are the specific criteria it failed.

`prettier --check .` clean · `eslint . --max-warnings 0` clean, exit 0 · gate script reports
`format PASS, lint PASS, typecheck FAIL, unit FAIL, no-todos PASS, no-skipped-tests PASS,
engine-purity PASS, frozen-tests-unmodified PASS`. The two FAILs are the Iron Law.

### Correction: round 1 told you the positive probes were vacuous. They are not.

Round 1 §4 claimed that with the module absent every imported type becomes `any`, and therefore
"positive-direction `Exact<>` assertions are vacuous (`Exact<any, X>` resolves `true`)". **That is
backwards.** Measured directly: line 652 is `Exact<DuelConfig['seed'], number> = true` and `tsc`
rejects it with *"Type 'true' is not assignable to type 'false'"* — so `Exact<any, number>` is
**`false`**, and the probe fires. The 51 `TS2322`s are positive probes **working**, not negative
controls.

The nuance that survives: `Exact<any, any>` *is* `true`, so a probe comparing two types that both
come from the missing module does stay quiet. That is why 51 of the 88 `= true` probes fire and
the rest do not, and it is why the suite's teeth were established against a reference
implementation rather than against redness. But the blanket "vacuous" claim was wrong and would
have understated the RED signal for the implementer.

---

## 6. Re-measured mutation matrix

Rebuilt from scratch under `scratchpad/t013-amend/` (L-028), deleted before committing. A mutant
counts as KILLED only on a **named failing test** or a `tsc` error **located in the test file** —
a mutant module that merely fails to compile proves nothing and is scored a harness fault.

**Result: 45/45 designed mutants killed, 5/5 controls survived, 0 harness faults.**

Harness liveness first: five controls that *should* be invisible all survived, so the matrix is
not uniform (L-028). Three of those controls are load-bearing forward-compatibility evidence, not
filler — see §8.

| # | Mutant | Killed by |
| --- | --- | --- |
| 1 | **REVIEW-1** mutable `DuelCore.seed` | AC-14, `tsc` ×10 |
| 2 | **REVIEW-2** `debug?: string` on `CANNON_SELECTED` | AC-13 per-variant, `tsc` ×1 |
| 3–8 | mutable `turnToken` / `playerHull` / `rng` / nested tally counter / `ActionLogEntry.actor` / `RivalView.volleyNumber` | AC-14, `tsc` ×1–11 |
| 9–12 | extra optional field on `ANSWER_CHOSEN`; on `TIMER_EXPIRED`; `volley` widened to `\| undefined`; discriminant widened to `string` | AC-13, `tsc` |
| 13–15 | extra optional field on `RivalAction` / `RivalVolley` / `DuelResult` | AC-15 whole-interface `Exact<>`, `tsc` ×2 |
| 16–18 | override ignored; override applied to `enemyMaxHull` but not `enemyHull`; override made **required** | AC-2 (×2 tests) and `tsc` ×2 |
| 19 | **seed masked instead of validated** (`createRng(seed >>> 0)` with the guard deleted) | AC-5 seed test |
| 20 | seed error message stops naming the field | AC-5 |
| 21–22 | `rng` ignores the seed; `seed` dropped from state | AC-4, AC-2 |
| 23 | `playerHull: 100` hardcoded | AC-2 perturbed-tuning mock |
| 24–28 | `volleyNumber: 0`; `turnToken: 1`; wrong initial phase; loadouts confused; tally not zeroed | AC-2 |
| 29–32 | no empty-loadout check; no catalog check; no island check; generic error message | AC-5 |
| 33–34 | terminal = victory only; terminal too broad | AC-7 |
| 35–39 | rival view leaks whole state; hulls transposed; recent-correct chronological / includes rival / truncated | AC-8, AC-9 |
| 40–41 | phase list reordered; ninth phase added | AC-1 (+`tsc` ×4) |
| 42–43 | state carries a `Set`; state carries a class instance | AC-2, AC-3 (the plain-JSON walker) |
| 44–45 | `islandId` widened to `string`; loadouts widened to `string[]` | `tsc` |

### Controls — all five survived, as required

| Control | Why it must survive |
| --- | --- |
| renamed private local | pure refactor; a suite that fails here is over-tight |
| **optional `doubleShot?` added to `ActionLogEntry`** | **T-022 forward compatibility.** AC-11 forbids `keyof ActionLogEntry` exactness precisely so this lands additively |
| **optional field added to `DuelConfig`** | AC-2's amendment requires tests to avoid `keyof DuelConfig` exactness |
| seed validation deleted but `createRng` still throws | delegating the throw is a **legal** implementation of AC-5; only *masking* is forbidden. Killing this would mean inventing a requirement |
| **EQUIVALENT: `isTerminalPhase` via `startsWith('v') \|\| startsWith('d')`** | see below |

### The one mutant I could not kill, stated plainly

`return phase.startsWith('v') || phase.startsWith('d')` is **behaviourally identical** to the
correct predicate over T-013's closed eight-phase domain: no other phase begins with `v` or `d`.
It is a genuine equivalent mutant, not a hole, and I am not going to dress up a passing suite as
having caught it. It is only reachable by calling `isTerminalPhase` with a non-phase string,
which AC-7 already makes a compile error.

The residual risk is real but bounded: it becomes a live bug the moment a phase named `draw`,
`disconnected` or `victoryLap` is added. AC-1's exact-eight-phase assertion goes red first in that
case, so the implementer is forced back through this predicate before the bug can ship.

---

## 7. Coverage of the three new criteria

| AC | Tests | What would have to be true to pass wrongly |
| --- | --- | --- |
| **AC-13** — per-variant event payloads | 10 | The five right-hand literals in the per-variant `Exact<>` block would have to be wrong. They are written out longhand from ARCHITECTURE.md §4.2, not derived from the union. An added optional field on any variant is now a `tsc` error — verified against the review's own mutant and against three more of my own |
| **AC-14** — `readonly` throughout | 6 | The `IsFullyReadonly` negative control would have to stop reporting `false` for a mutable property; it is asserted in the same block. Covers all eight variants individually **and** the union, plus the nested shapes `Readonly<>` cannot reach (`bySkill`'s counters, `ActionLogEntry`, `DuelConfig`, `DuelResult`), plus nine `@ts-expect-error` reassignment probes with a mutable-copy positive control so they cannot be satisfied by an unrelated error |
| **AC-15** — closed rival/result shapes | 6 | Whole-interface `Exact<>` on all three, so an extra field of any kind fails. The `keyof` and per-field probes are kept only to localise which field broke |

AC-2 gained 4 tests for the `enemyMaxHull` override, swept across **all five islands** with a
probe value of `ENEMY_HULL_BY_ISLAND[island] + 13` so the override is shown to *beat* the
per-island value rather than coincide with it, plus the `ONBOARDING_ENEMY_HULL` case read from
frozen tuning and a fallback test proving the field is genuinely optional.

AC-4 gained the other side of its quantifier: `(-1, 0xffffffff)`, `(-2, 0xfffffffe)` and
`(-0xffffffff, 1)` are asserted to produce **identical** `rng`, which is what "modulo 2³²" means
and stops a later reader from "correcting" the criterion back to the false universal form.

AC-5 gained the field-naming assertion (satisfied by either legal implementation, since
`createRng`'s own `RangeError` text contains "seed"), a test that the three canonical masking
victims do not become seed `0`, and an accepting-side test at the range extremes so an
implementation that rejected *every* seed could not pass.

### On the AC-15 rewrite

The orchestrator's rewrite is **correct and mine was wrong**. My round-1 draft required
`RivalVolley`'s "actions" to be ordered; `RivalVolley` has no `actions` field — it is a single
volley `{cannonId, correct, elapsedMs}`. I had conflated it with a collection of `RivalAction`s.
The shipped wording is what the tests assert.

---

## 8. Forward compatibility — corrected site count

Round 1 claimed "exactly 8 edit sites". The review was right that this is too low. **Recounted by
enumerating every site that would need editing: 17.**

**Adding a ninth phase — 11 sites:** the `EXPECTED_PHASES` literal; `TERMINAL_BY_PHASE`;
`STATE_BY_PHASE`; AC-1's runtime `toEqual` list; the harness self-check's list; `toHaveLength(8)`;
`new Set(…).size).toBe(8)`; the `Exact<DuelPhase, …>` union; the
`Exact<(typeof DUEL_PHASES)[number], …>` union; AC-7's per-phase truth table; and AC-14's
per-variant probe list.

**Adding a sixth event — 6 sites:** the `EXPECTED_EVENT_TYPES` literal; AC-13's event fixtures;
its `toEqual` list; its `Exact<DuelEvent['type'], …>` union; its per-variant `Exact<>` block; and
its `Object.keys` payload check.

All 17 are literal lists — no logic changes — and this is the ticket's intended fail-loud
behaviour, not an oversight. Two things reduce the risk of a *partial* patch:

- `STATE_BY_PHASE` is typed `Record<(typeof EXPECTED_PHASES)[number], DuelState>`, so `tsc`
  **demands** the new fixture rather than letting it be forgotten.
- **A gap worth knowing:** AC-14's per-variant list is *not* self-enforcing — forgetting the
  ninth line leaves the new variant unchecked silently. The union-level `IsFullyReadonly<DuelState>`
  is the safety net that still covers it, which is why both forms are present.

**Additive with zero edits** (each verified as a surviving control, not asserted): an optional
field on `ActionLogEntry`, and an optional field on `DuelConfig`.

---

## 9. The three known survivors — my recommendation

You asked whether any deserves a criterion. My views, for you to rule on:

**Config-array aliasing — yes, this one matters most.** `state.playerLoadout` is the *same array
object* the caller passed in. Callers hold a mutable `CannonId[]` and pass it as `readonly
CannonId[]`, so a caller that later mutates its own array silently mutates the duel — defeating
AC-12's intent and breaking AC-6 replay, and `readonly` typing cannot stop it because the
aliasing happens on the caller's side of the boundary. Cheap to fix (copy three arrays once, at
construction) and cheap to specify. **Recommend a criterion.**

**Memoised construction — yes, but low priority and one line.** AC-3 asks only for deep equality,
so returning the identical object twice conforms. Nothing here is mutable, so the danger is
confusion rather than corruption. **Recommend appending "…and the two are not the same object
reference" to AC-3** rather than a new criterion.

**Absent runtime freezing — no, and I'd decline it explicitly.** AC-12 deliberately says readonly
*typing*. `Object.freeze` on every state would sit on T-020's hot path, which allocates a new
state per event, and the engine has no untrusted callers. If you want mutation caught at runtime,
T-024's invariant checker is the right home for a dev-only assertion. **Recommend recording the
decision in AC-12 so the next reviewer does not re-raise it.**

## 10. Residual risk

1. **`turnToken` is still only ever `0` in this ticket.** Type-level probes pin it as `number`
   rather than the literal `0`, and a non-zero token is asserted to survive serialisation, but
   nothing here can prove it increments on handoff. That is T-020's, and `src/stores/**` — which
   owns the comparison — is out of scope.
2. **The equivalent mutant in §6.**
3. **DoD-2 and DoD-9 are narrower than their checkbox text** (§4). DoD-9 in particular checks the
   directory contents, not the git diff, so an implementer editing a file *outside*
   `src/engine/duel/` is invisible to it; the `frozen-tests-unmodified` gate and review cover that.
4. **`Readonly<>` is shallow**, so AC-14's nested coverage is a hand-maintained list
   (`bySkill` counters, `ActionLogEntry`, `DuelConfig`, `DuelResult`). A *new* nested object type
   added to the state would need a new line; nothing forces it.
5. **`recentTemplateIds` semantics remain unpinned** beyond type and empty-at-construction — no AC
   covers its `RECENT_TEMPLATE_WINDOW` bound or most-recent-first ordering, and T-007/T-019
   consume it.
6. **`DuelTally.bySkill` accumulation rules and hull clamping at ≥ 0** are unpinned here; both are
   T-020's.
7. **`exactOptionalPropertyTypes` interacts with AC-15's strictness.** A semantically equivalent
   but differently-spelled type (notably an explicit `| undefined` member) will be rejected by the
   whole-interface `Exact<>`. That is deliberate; the implementer should expect it.
8. **All measurements are from this worktree with `src/engine/duel/types.ts` absent** (L-027), and
   the mutation matrix describes the suite's behaviour against *my* reference implementation, not
   against whatever the implementer writes.

## 11. Blocked / write-guard

Nothing was blocked this round and I routed around nothing. Writes were confined to
`__tests__/engine/duel/types.test.ts`, this report, and `scratchpad/t013-amend/**` (deleted before
committing). No write was attempted to `src/**`, `tickets/**`, `app/**`, `src/theme/**`,
`src/components/**`, `src/stores/**`, `src/services/**`, `package.json`, `tsconfig.json`,
`eslint.config.js`, or the second track's files. `src/engine/duel/` contains only the frozen
`damage.ts`; `types.ts` does not exist. No merge, no rebase, no push.
