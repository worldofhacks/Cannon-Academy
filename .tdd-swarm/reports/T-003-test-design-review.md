# T-003 — Frozen-Test Design Review

**Reviewer:** independent test-design review agent
**Date:** 2026-07-27
**Ticket:** `/Users/quietguy/Documents/Dev/Gauntlet/Math Game/tickets/T-003.md` (main repo copy, 20 ACs)
**Tests under review:**
- `/Users/quietguy/Documents/Dev/Gauntlet/cannon-wt/wt-T-003/__tests__/content/schemas.test.ts` (60 tests)
- `/Users/quietguy/Documents/Dev/Gauntlet/cannon-wt/wt-T-003/__tests__/engine/questions/types.test.ts` (25 tests)

**Verdict: DO NOT FREEZE.** Three Critical findings, five Important. All are cheap to fix now
(roughly 25 additional assertions, no restructuring) and expensive to fix after freeze, because
`src/content/schemas.ts` and `src/engine/questions/types.ts` are in no downstream ticket's
`file_scopes`.

---

## Method — this review is empirical, not read-only

I did not judge these tests by reading them. I built a throwaway copy of the worktree
(`scratchpad/cheat/`) with the real `tsconfig.json`, `vitest.config.ts`, and `node_modules`,
wrote a deliberately **lazy-but-plausible** `schemas.ts` + `questions/types.ts`, and ran the
frozen suite plus `tsc --noEmit` against it and against 20 targeted mutations.

Headline result:

```
Tests  85 passed (85)      tsc --noEmit: clean (exit 0)
```

against an implementation that contains **ten** substantive contract violations (enumerated in
C1–C3 and I1–I4 below). Everything asserted here is reproducible from that harness.

Gate context that matters: `.tdd-swarm/run-local-gates.sh:19` runs `npx tsc --noEmit`, and
`tsconfig.json` has `"include": ["src/**/*", "__tests__/**/*"]` with `strict`,
`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals`. So the type-level half
of this suite **is** gated. That is the right design and it is wired up correctly.

---

## 3. The `Exact<>` helper — verified sound (asked for explicitly)

`schemas.test.ts:45` and `types.test.ts:17` both declare:

```ts
type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
```

Note the **missing parentheses** around the second function type — the canonical `IsEqual` idiom
wraps it. I checked this specifically because a mis-parse here would silently make every
`Exact<>` assertion in the suite vacuous.

**It is sound.** I compiled the helper side by side with the canonical parenthesised form and
asserted equality of their results. The parse is as intended: TypeScript's `parseTypeWorker`
takes the early `isStartOfFunctionTypeOrConstructorType()` branch for the `extends` operand, and
the function's *return* type is parsed with conditionals re-enabled, so `T extends B ? 1 : 2` is
consumed as the return type and the trailing `? true : false` binds to the outer conditional.
Empirically confirmed — all of these compile clean under the project's own compiler options:

| Probe | Expected | Result |
|---|---|---|
| `Exact<string, string>` | `true` | ✅ |
| `Exact<'a'\|'b', 'b'\|'a'>` | `true` | ✅ |
| `Exact<string, string \| number>` | `false` | ✅ |
| `Exact<any, string>` | `false` | ✅ |
| `Exact<unknown, string>` / `Exact<string, unknown>` | `false` | ✅ |
| `Exact<string, never>` | `false` | ✅ |
| `Exact<boolean, boolean \| undefined>` | `false` | ✅ (the AC-15 `isWordProblem` check bites) |
| `Exact<{a?: 1}, {a: 1\|undefined}>` | `false` | ✅ |
| `Exact<Readonly<Mut>, Mut>` where `Mut` has mutable props | `false` | ✅ (the AC-15/16 readonly check bites) |
| `Exact<Readonly<Ro>, Ro>` where `Ro` is already readonly | `true` | ✅ (a correct impl passes) |
| `Exact<Exact<X,Y>, ExactParen<X,Y>>` for 3 cases | `true` | ✅ (unparenthesised ≡ canonical) |

`IsReadonlyArray<T> = T extends unknown[] ? false : true` (`schemas.test.ts:48`) is also correct:
`true` for `as const` tuples and for `readonly string[]`, `false` for `string[]`. It admits a
plain `readonly SkillId[]` rather than strictly an `as const` tuple, but the companion
`Exact<SkillId, (typeof SKILL_IDS)[number]>` assertion in each AC-1 test backstops that, so there
is no hole.

**One limitation worth recording** (not a defect, and separately covered): `Exact<Readonly<T>, T>`
compares property *modifiers* only. It cannot see whether an array-typed property is
`readonly Choice[]` or `Choice[]` — I confirmed `Exact<Readonly<{readonly c: X[]}>, {readonly c: X[]}>`
is `true`. That gap is closed by accident-of-good-design at `types.test.ts:19`
(`const FOUR_CHOICES: readonly Choice[]`): mutating `Question.choices` to `Choice[]` produced
three `TS4104` errors. Credit where due — that fixture is doing real work.

---

## Critical — must fix before freeze

### C1. AC-10 has no `minGrade === maxGrade` accept case, so `>` vs `>=` survives

**Where:** `__tests__/content/schemas.test.ts:349-377` (`describe('skillSchema')`), fixture at
`schemas.test.ts:85-91` (`minGrade: 0, maxGrade: 1`).

**What is wrong.** AC-7 gets this exactly right for cannon damage — `schemas.test.ts:394` rejects
`damageMax < damageMin` and `schemas.test.ts:400` *accepts* `damageMax === damageMin`. AC-10 is
worded in parallel but the equality boundary is missing. The four skill tests are: accept `(0,1)`,
reject `(3,2)`, reject `minGrade: -1`, reject `maxGrade: 6`. A refinement written
`s.maxGrade > s.minGrade` satisfies every one of them.

**Confirmed by mutation:**

```
skill refine: maxGrade >= minGrade (CORRECT)      Tests  85 passed (85)
skill refine: maxGrade >  minGrade (WRONG  >)     Tests  85 passed (85)   <-- not distinguished
cannon damage refine: damageMax > damageMin       Tests  1 failed | 84 passed   <-- correctly caught
```

**The cheat this permits, and why it lands two waves later.** `tickets/T-006.md:117-118` (AC-6)
requires *every authored skill* to satisfy `0 <= minGrade <= maxGrade <= 5`, and T-006 AC-11
requires each cannon's `[minGrade, maxGrade]` to equal its skill's. Single-grade skills are
therefore legal, expected content — `fractions_int` or `multi_digit_order_ops` pinned to one grade
is entirely plausible. T-006 authors `skills.json` against a frozen `schemas.ts` it cannot edit.
A `>` implementation means T-006 hits a validation failure in wave 2 with **no fix path**, and the
symptom ("zod says maxGrade must exceed minGrade") points at the data, not at the schema.

This is precisely L-005 ("a constant's permitted range can make a downstream requirement
impossible") re-expressed as a comparison operator.

**Fix.** Add to `describe('skillSchema')`:

```ts
it('spec(T-003:AC-10) accepts a skill whose maxGrade equals its minGrade', () => {
  const result = skillSchema.safeParse(withOverrides(VALID_SKILL, { minGrade: 4, maxGrade: 4 }));
  expect(result.success).toBe(true);
});
```

and amend AC-10 in the ticket to mirror AC-7's phrasing ("given `maxGrade === minGrade`, then it
returns `success: true`"), so the test and the criterion agree.

---

### C2. Every id-union field except `template.skill` is unpinned

**Where:** `schemas.test.ts:245-252` is the *only* test that rejects a value outside an id union
(`template.skill`). No test rejects a bad value for:

| Schema field | Contract (ticket required-shapes) | Reject test |
|---|---|---|
| `skillSchema.id` | `SkillId` | ❌ none |
| `cannonSchema.id` | `CannonId` | ❌ none |
| `cannonSchema.skill` | `SkillId` | ❌ none |
| `cannonSchema.temperament` | `Temperament` | ❌ none |
| `islandSchema.id` | `IslandId` | ❌ none |
| `islandSchema.rangeSkills` | `SkillId[]` | ❌ none |
| `islandSchema.unlocksCannons` | `CannonId[]` | ❌ none |
| `islandSchema.requiresIsland` | `IslandId?` | ❌ none (`schemas.test.ts:527` only accepts a valid one) |
| `rankSchema.id` | `RankId` | ❌ none |
| `unlock.island` (range variant) | `IslandId` | ❌ none |

**Confirmed:** an implementation using `z.string()` for all ten passes 85/85 with `tsc --noEmit`
clean. The happy-path assertions (`schemas.test.ts:382-392`, `512-519`, `540-546`) only read values
back, and `const parsed: Cannon = cannonSchema.parse(...)` constrains nothing — assignment *to* a
type is not a pin.

**The cheat and its blast radius.** The whole point of this ticket is the id vocabulary
("`SkillId` … these are exhaustive"), and the types are `z.infer`-derived. `z.string()` makes
`Cannon['skill']`, `Island['rangeSkills']`, `Rank['id']` etc. resolve to `string`/`string[]`
**everywhere**. T-007 calling `getTemplatesForSkill(cannon.skill)` where that parameter is
`SkillId` gets a type error against a file it cannot edit; same for T-009 (`RankId`) and T-013.
That is the "shape pinned wrongly propagates everywhere" case the review brief names.

Note that T-006 AC-9 does referential-integrity checking on the *data*, so a typo in `islands.json`
is eventually caught — but one wave later, and only for data. The *type* damage is permanent.

**Fix.** One reject case per row, using the existing `withOverrides` helper — e.g.

```ts
it('spec(T-003:AC-1) cannonSchema rejects a skill outside SkillId', () => {
  expect(cannonSchema.safeParse(withOverrides(VALID_CANNON, { skill: 'algebra_ii' })).success).toBe(false);
});
it('spec(T-003:AC-1) islandSchema rejects a rangeSkills entry outside SkillId', () => {
  expect(islandSchema.safeParse(withOverrides(VALID_ISLAND, { rangeSkills: ['algebra_ii'] })).success).toBe(false);
});
```

A compact `it.each` table over `(schema, fixture, field, badValue)` keeps this to ~12 lines.
Optionally reinforce with type-level pins (`const idIsPinned: Exact<Cannon['id'], CannonId> = true;`),
which is stronger because it survives any future runtime-only refactor.

---

### C3. `Question`'s field *types* are unpinned except `isWordProblem` / `readAloud`

**Where:** `__tests__/engine/questions/types.test.ts:191-198` pins `keyof Question`;
`types.test.ts:232-242` pins the two booleans; `types.test.ts:244-248` pins readonly modifiers.
Nothing pins `templateId`, `skill`, `text`, `params`, or `correctIndex`. Note also
`types.test.ts:13-14` — the file never imports `SkillId` at all.

**Confirmed:** an implementation declaring

```ts
readonly skill: string;                              // ticket says SkillId
readonly params: Readonly<Record<string, unknown>>;  // ticket says Readonly<Record<string, number>>
```

passes 85/85 with `tsc --noEmit` clean. `questionWith` at `types.test.ts:30-41` supplies
`skill: 'add_within_10'` and `params: { a: 3, b: 4 }`, both of which are assignable to the loose
types, so nothing notices.

**The cheat and its blast radius.** The ticket's own Planning Decisions
(`tickets/T-003.md:126-129`) say `questions/types.ts` is in no downstream `file_scopes`, "so a
thinner shape frozen here would block T-007 two waves later." That is exactly what
`params: Record<string, unknown>` does: T-017/T-020 doing arithmetic on `question.params[k]` get
`unknown`, and cannot fix the declaration. `skill: string` breaks anything that needs `SkillId`.
AC-15 as written only demands the key *set* and the two boolean types — but the required-shapes
block is the contract, and the tests are what make it binding.

**Fix.** In `types.test.ts`, import `SkillId` from `@content/schemas` and add:

```ts
it('spec(T-003:AC-15) pins the type of every contract field', () => {
  const templateIdIsString: Exact<Question['templateId'], string> = true;
  const skillIsSkillId: Exact<Question['skill'], SkillId> = true;
  const textIsString: Exact<Question['text'], string> = true;
  const paramsAreNumbers: Exact<Question['params'], Readonly<Record<string, number>>> = true;
  const choicesAreReadonly: Exact<Question['choices'], readonly Choice[]> = true;
  const correctIndexIsNumber: Exact<Question['correctIndex'], number> = true;
  expect([templateIdIsString, skillIsSkillId, textIsString, paramsAreNumbers,
          choicesAreReadonly, correctIndexIsNumber]).toEqual([true, true, true, true, true, true]);
});
```

(The `choices` line is belt-and-braces given `FOUR_CHOICES` already covers it, but it makes the
guarantee explicit rather than incidental.)

---

## Important — should fix before freeze

### I1. `cannonSchema.minGrade` / `maxGrade` have zero tests

**Where:** `schemas.test.ts:381-507` — the whole `cannonSchema` block. `VALID_CANNON`
(`schemas.test.ts:102-103`) carries `minGrade: 1, maxGrade: 2`, and nothing ever varies them.

The required-shapes block specifies `minGrade: 0..5; maxGrade: 0..5` for cannons, and T-006 AC-11
asserts each cannon's grade pair equals its skill's. **Confirmed:** declaring both as bare
`z.number()` (no integer check, no bounds, no ordering) passes 85/85. A cannon authored with
`maxGrade: 7` would validate cleanly.

**Fix.** Mirror the skillSchema tests: reject `minGrade: -1`, reject `maxGrade: 6`, reject a
non-integer grade. (Cannon grade *ordering* is not required by any AC — do not add it, or add an
AC first.)

### I2. Integrality is tested on exactly one numeric field

**Where:** only `schemas.test.ts:456` (`timerMs: 15000.5`) and `schemas.test.ts:292`
(`params: [1.5, 4]`) exercise the int/number distinction.

Untested for non-integers, all of which the contract types `int`: `damageMin`, `damageMax`,
`recoilDamage`, `skill.minGrade`, `skill.maxGrade`, `island.order`, `rank.tier`, `rank.minWins`,
`unlock.tier`. **Confirmed:** `z.number().positive()` / `z.number().min(0)` for these passes 85/85.
This is L-009's exact class — a validator that accepts a superset of the intended shape, protecting
what it names and nothing else, for data authored by a different ticket.

**Fix.** One `it.each` over `(schema, fixture, field)` asserting a `.5` value is rejected.

### I3. String-array element types are unpinned (`distractors`, `constraints`)

**Where:** `schemas.test.ts:254-274` counts distractors but never types them;
`schemas.test.ts:238` only reads `constraints` back.

**Confirmed:** `distractors: z.array(z.unknown()).min(3)` and `constraints: z.array(z.unknown()).optional()`
pass 85/85. `Template['distractors']` then infers as `unknown[]`, and T-007 — which must evaluate
each distractor as an expression string — is blocked against a frozen file.

**Fix.** Add `distractors: [1, 2, 3]` → reject, and `constraints: [7]` → reject.

### I4. `difficulty` is bounded, not enumerated

**Where:** `schemas.test.ts:315-334`. AC-17 and the required-shapes block both say
`difficulty?: 1 | 2 | 3`. The tests accept `2`, reject `0`, reject `4`.

**Confirmed:** `z.number().min(1).max(3).optional()` passes 85/85 and accepts `difficulty: 2.5`.
Low practical blast radius (the ticket says nothing in this swarm reads the field), but the field's
entire purpose is to be a stable escape hatch for open question 2.10 — a fuzzy type defeats that.

**Fix.** Add a `difficulty: 2.5` reject case, or
`const difficultyIsALiteralUnion: Exact<Template['difficulty'], 1 | 2 | 3 | undefined> = true;`.

### I5. (Process) The worktree's ticket copy is stale — L-008 recurrence

`cannon-wt/wt-T-003/tickets/T-003.md` carries **17** ACs. It is missing AC-18, AC-19, AC-20 *and*
the "Exported id-array names — locked by the orchestrator" block. The tests were correctly written
against the newer main-repo copy, so the tests are fine — but the implementer dispatched into that
worktree will read a superseded contract, and `.tdd-swarm/spec-lint.sh` run inside the worktree
enumerates ACs from the *ticket*, so it would report green on 17/17 while three criteria go
unchecked.

**Fix.** Sync the ticket file into the worktree before dispatching, and re-run spec-lint there.
This is the second occurrence of L-008; consider making "diff every dispatched ticket file against
the integration branch" a scripted pre-dispatch check rather than a remembered habit.

---

## Minor — note only

- **M1.** `types.test.ts:174-189` and `types.test.ts:254-257` enumerate `Object.keys` on object
  literals the test itself authors. Because `questionWith` is annotated `: Question` and the
  literals are annotated `: Choice`, the key set is fully determined by `tsc` before the test runs
  — these assertions cannot fail independently. Harmless as documentation; just not the runtime
  guarantee they resemble. The real work is done by the `Exact<keyof …>` assertions beside them.
- **M2.** `assertQuestion`'s signature is unpinned. `(q: Question) => void`,
  `(q: Question): asserts q is Question`, and `(q: unknown): asserts q is Question` all pass. If
  T-007 is expected to narrow an `unknown` candidate, say so in an AC.
- **M3.** `islandSchema.requiresIsland` gets no absent-key omission check, unlike the template
  optionals at `schemas.test.ts:300-313`. AC-11 does not ask for it; noted only for symmetry.
- **M4.** Some happy-path assertions are tagged to an AC that does not cover them —
  `schemas.test.ts:512` (tagged AC-11, asserts id-list preservation), `schemas.test.ts:527`
  (tagged AC-11, asserts `requiresIsland`), `schemas.test.ts:382` (tagged AC-7, asserts
  `id`/`skill`/`temperament`/`recoilDamage`/`timerMs` preservation), `types.test.ts:78`
  (tagged AC-14, asserts `message`). All are consistent with the required-shapes contract, so
  none is over-constraint — the tags are just imprecise. spec-lint passes either way.
- **M5.** `params` values that are not arrays at all (`{ a: 5 }`), and an empty `params: {}`, are
  untested. Low risk given the tuple tests.
- **M6.** `template.id` / `text` / `answerExpr` have no non-string reject (same class as I3, lower
  stakes since they are required fields and AC-2 reads them back).

---

## Dimensions that are genuinely clean

I looked hard at each of these and found nothing to fix. Stating that plainly rather than padding
the findings list.

**AC ↔ test coverage is complete in both directions.** All 20 criteria have at least one test
tagged `spec(T-003:AC-n)`; `.tdd-swarm/spec-lint.sh` would pass against the main-repo ticket. The
60 + 25 test counts reconcile exactly. Nothing is tested that the ticket does not ask for.

**AC-19 (top-level strictness) is fully and independently covered.** All six schemas named in the
criterion have a dedicated test (`schemas.test.ts:590-626`), each fixture otherwise valid so it
fails for exactly one reason. Dropping `.strict()` from any single schema turns exactly one test
red — verified for `templateSchema` and `crewSchema`.

**AC-20 (nested strictness) — the author's M10 claim is TRUE; I verified it independently.**
The claim was that each `unlock` variant is separately covered. It is:

```
strict off: starter unlock variant    Tests  1 failed | 84 passed (85)
strict off: range   unlock variant    Tests  1 failed | 84 passed (85)
strict off: chest   unlock variant    Tests  1 failed | 84 passed (85)
```

An implementation that strictens only the `range` branch is caught by `schemas.test.ts:644` and
`schemas.test.ts:652`. This is the best-constructed part of the suite.

**Blanket-permissive schema cheats are caught.** `templateSchema = z.any()` → 9 failures;
`crewSchema = z.record(z.unknown())` → 3 failures. Every schema has at least one reject case, so
none can be `z.any()`.

**All three cross-field refinements have accept AND reject cases, and no-op refinements die.**
This is the specific concern the brief raised, and the suite handles it correctly:

| Refinement | `() => true` (no-op) | `() => false` (always reject) |
|---|---|---|
| `damageMax >= damageMin` | 1 failed | 1 failed |
| reliable ⇒ no recoil | 1 failed | 7 failed |
| grade ordering | 1 failed | 1 failed |

(The only refinement defect is C1 — the `>`/`>=` boundary, not a no-op.)

**`assertQuestion` boundaries are tested on both sides.** Emptying the body → 4 failures.
`correctIndex > 3` → `>= 3` → 1 failure. `choices.length !== 4` → `< 4` → 1 failure.
`expectInvalidQuestion` (`types.test.ts:44-54`) correctly fails when nothing is thrown, because
`thrown` stays `undefined` and `toBeInstanceOf` rejects it. AC-13's accept cases at index 0 and 3
kill an always-throwing guard.

**Optionality semantics are correct — the tests distinguish absent from `undefined`.**
`schemas.test.ts:300-313` and `schemas.test.ts:336-344` use both `Object.keys(...).not.toContain`
and `Object.prototype.hasOwnProperty.call(...) === false`. Confirmed non-vacuous: mutating to
`z.boolean().optional().default(false)` turns AC-6 red, and `difficulty…optional().default(1)`
turns AC-17 red. `schemas.test.ts:242` (`expect(parsed).toEqual(FULL_TEMPLATE)`) additionally
forbids the schema inventing keys on the way out.

**No over-constraint found.** Every assertion I traced maps back to the required-shapes block, the
locked id-array names, or an explicit AC. The `Exact<Readonly<Question>, Question>` and
`IsReadonlyArray` checks look aggressive but are exactly what the ticket's `readonly` annotations
and "`as const` array" wording require. A valid alternative implementation — different refinement
mechanics, different internal schema composition, `z.strictObject` instead of `.strict()` — would
pass unchanged.

**The type gate is correctly wired.** `run-local-gates.sh:19` runs `tsc --noEmit`;
`tsconfig.json` includes `__tests__/**/*`. The `Exact<>` assertions and `@ts-expect-error`
directives can only fail there (a `const x: false = true` is a compile error but
`expect(x).toBe(true)` still passes at runtime), and they do — I saw the mutated build emit
`TS4104` and `TS2578 Unused '@ts-expect-error' directive`. `noUnusedLocals` does not produce false
positives here; every type-level const is consumed by an `expect`.

---

## Summary of required changes before freeze

| # | Severity | File | Change |
|---|---|---|---|
| C1 | Critical | `schemas.test.ts` ~377 | Accept case for `minGrade === maxGrade`; amend AC-10 wording to match AC-7 |
| C2 | Critical | `schemas.test.ts` | Reject case per id-union field (10 fields), or `Exact<>` pins on the derived types |
| C3 | Critical | `types.test.ts` | `Exact<>` pins for `templateId`, `skill`, `text`, `params`, `correctIndex` (import `SkillId`) |
| I1 | Important | `schemas.test.ts` ~507 | Cannon `minGrade`/`maxGrade` bound + integer rejects |
| I2 | Important | `schemas.test.ts` | Non-integer reject for the 9 untested `int` fields |
| I3 | Important | `schemas.test.ts` | Non-string reject for `distractors` / `constraints` elements |
| I4 | Important | `schemas.test.ts` ~334 | `difficulty: 2.5` reject (or literal-union `Exact<>` pin) |
| I5 | Important | worktree | Sync `tickets/T-003.md` into `wt-T-003` before dispatch; re-run spec-lint |

Estimated ~25 assertions, all using helpers and fixtures that already exist. C1 alone is worth the
round trip: it is a one-line test that separates a correct implementation from one that will fail
T-006 in wave 2 against a file nobody can edit.

### Suggested new lesson (after fixing)

> **L-010 — A boundary tested on one schema is not tested on its twin.** AC-7 and AC-10 specify
> the same shape of cross-field rule (`b >= a`). AC-7's test suite pinned the equality case; AC-10's
> did not, and a `>` implementation passed 85/85. When two criteria share a rule shape, diff their
> test tables field by field — parallel wording is not parallel coverage.
