# T-013 — Duel state types & initial-state constructor — TEST AGENT REPORT

Branch `ticket/T-013-duel-types`, worktree `.worktrees/wt-T-013`, branched from `swarm/engine-core` @ `ce51e71`.
Baseline confirmed at **1229 passing tests** before starting.

---

## 1. Status

**DONE_WITH_CONCERNS**

All gates pass, the suite is RED for the correct reason (module absent), and the mutation harness kills 29/29
designed cheats. The concerns are **six spec defects in the ticket** (§6), three of which I rate as blocking for
the implementer because they leave required behaviour either unspecified or, in one case, provably false as
written. I did not guess past any of them: every test asserts only the property that all defensible readings
share, so none of my assertions has to be rewritten whichever way the amendments are ruled.

---

## 2. Coverage table

Every AC is cited by at least one test (`spec-lint.sh` PASS). "Passes wrongly" = what a wrong implementation
would need for that test to be green anyway.

| AC | Tests covering it | What would have to be true for the test to pass wrongly |
|----|-------------------|--------------------------------------------------------|
| **AC-1** `DUEL_PHASES` is the exact 8-phase tuple | 6 tests: exact content+order vs. a literal array; `toHaveLength(8)`; `new Set(...).size === 8` (no dupes); `Exact<DuelPhase, 'intro'\|…>`; `Exact<(typeof DUEL_PHASES)[number], …>`; `@ts-expect-error` on `'reloading'` | The literal `EXPECTED_PHASES` array in the test file would itself have to be wrong. It is typed `as const` and never derived from the module — the tautology the DoD forbids is structurally impossible here. Order is pinned by `toEqual` on an array, so a re-ordered tuple fails. |
| **AC-2** initial state field values | 14 tests: `phase==='intro'`; `playerHull===enemyHull===enemyMaxHull` sourcing; `volleyNumber===1`; `turnToken` numeric; `actionLog`/`recentTemplateIds` empty; `tally` zeroed; config carry-through for all 5 config fields; + a test that **mocks `@engine/tuning` to a perturbed `PLAYER_HULL`** and re-imports | Hull: only if the implementation reads the real constant — the mock test kills a hardcoded `100` even though `PLAYER_HULL` *is* 100 (see cheat `player-hull-literal`, which survived until this test existed). Enemy hull is read from `ENEMY_HULL_BY_ISLAND[islandId]` for **every** island id, so a single-island coincidence can't hide. Carry-through is asserted per field, so `rivalLoadout: playerLoadout` fails. |
| **AC-3** same config ⇒ deep-equal state and rng | 3 tests: full-state `toEqual` across two constructions; `rng` deep-equal; rng derived from `seed` alone (two configs differing in island/loadout, same seed ⇒ same rng) | An implementation injecting real nondeterminism (`Date.now`, `Math.random`) into any field would fail. It would pass wrongly only if the nondeterminism were confined to a field `toEqual` ignores — i.e. a non-enumerable or `undefined`-valued property, which AC-6's plain-JSON probe independently rejects. |
| **AC-4** different seed ⇒ different rng | 2 tests: pairwise-distinct rng over a spread of seeds; explicit boundary seeds `0` and `0xffffffff` | Only if the implementation ignores the seed *and* the test's seed set collided — it can't, the assertion is pairwise distinctness over the set. **Deliberately confined to `[0, 0xffffffff]`** because AC-4 is false outside it (§6, A1). |
| **AC-5** invalid config rejected | 9 tests: empty player loadout; empty rival loadout; unknown cannon id (via `as unknown as`); unknown island id (via `as unknown as`); 6 out-of-domain seeds (`NaN`, `0.5`, `-0.5`, `2**33`, `-(2**33)`, `Infinity`) | Asserts only *that it throws*, not the message or class — so it cannot pass wrongly by throwing for a different reason, but it also does not pin *which* error. That is intentional: AC-5 does not name an error type and I refuse to invent one. The cannon/island branches are statically unreachable from typed input (all 10 `CannonId`s are in `cannons.json`; `ENEMY_HULL_BY_ISLAND` is total over all 5 `IslandId`s) so per L-015 I **probed with a cast** rather than arguing them away. |
| **AC-6** JSON round-trip | 10 tests: `JSON.parse(JSON.stringify(s))` deep-equals `s` for a state in **each of the 8 phases**; byte-identity of re-stringify; recursive plain-JSON structural probe | The probe walks the whole state rejecting functions, `Map`/`Set`, non-plain prototypes, and `undefined`-valued keys — so `toEqual` can't paper over a dropped `undefined` field or a class instance that happens to serialise. Passes wrongly only if a non-JSON value hides behind a getter the walker doesn't trigger. |
| **AC-7** `isTerminalPhase` | 3 tests: all 8 phases table-driven against a literal expectation map; only `victory`/`defeat` true; exactly 2 terminal phases | The `TERMINAL_BY_PHASE` literal would have to be wrong. `Record<(typeof EXPECTED_PHASES)[number], boolean>` makes `tsc` demand an entry when a phase is added. |
| **AC-8** `toRivalView` projection | 8 tests: `Object.keys` **exactly** equals the literal `RivalView` key list (both directions — no missing, no extra); `Exact<keyof RivalView, …>`; per-field value correctness; explicit no-leak assertions for `seed`, `actionLog`, `templatesBySkill`, `rng`; plain-JSON probe | Key-set equality is asserted both ways, so leaking `seed` fails on the extra key and dropping a field fails on the missing one. Passes wrongly only if a leaked field were named identically to a legitimate one. |
| **AC-9** `playerRecentCorrect` | 5 tests: player-only filtering (rival entries excluded); most-recent-first ordering; no truncation at `BOT_ACCURACY_WINDOW`; **non-palindromic fixture precondition**; empty log ⇒ empty array | The ordering test asserts both `toEqual(reversed)` and `not.toEqual(chronological)`, and the fixture carries a self-check that the chronological sequence is **not** its own reverse. Without that precondition the `not.toEqual` was vacuously true for my first fixture (`i % 3 !== 0` is palindromic at length 13) — a real near-miss, fixed to `i * 2 < count`. This is the L-020 shape: nothing here lets the implementation assume sorted input silently. |
| **AC-10** discriminated-union narrowing | 8 tests: narrowing on `phase` inside helper functions for terminal/non-terminal splits; `Exact<>` on narrowed types; `@ts-expect-error` negative controls that a *wrong* narrowing is a type error | Compile-time. Includes negative controls, so it cannot pass vacuously — if `DuelState` were a wide non-discriminated interface, the `@ts-expect-error` directives become *unused* and `tsc` fails them. That inversion is what makes this probe honest. |
| **AC-11** `ActionLogEntry` required fields | 10 tests: 4 required fields present; `Exact<>` per field type (kills `string`-widening); JSON round-trip identity; `readonly` per field; `@ts-expect-error` for each omitted field; `@ts-expect-error` for each mistyped field | This is the AC that catches the "ten id fields were `z.string()`" failure class. Each field's type is pinned invariantly with `Exact<>`, so `string` in place of a union is a type error, not a passing runtime test. Passes wrongly only if the implementer aliases the exact right union under a different name — which is fine and intended. |
| **AC-12** immutability | 9 tests: `readonly` on `actionLog`, `playerLoadout`, `rivalLoadout`, `recentTemplateIds`; `@ts-expect-error` on reassignment, `push`, and index assignment; each probe runs against a **fresh disposable state copy** | Compile-time only (§9). Shared fixtures are frozen and each probe gets its own state, after an order-dependent leak where a `@ts-expect-error` probe mutated `STATE_BY_PHASE.playerChoose` at runtime and poisoned a later test. |

**Not covered by any AC** — 13 tests tagged `dod(T-013:…)` instead, because the ticket's DoD requires these
shapes but no numbered criterion does (see §6, A3): the 5-member `DuelEvent` union and its per-variant field
sets, `RivalAction`, `RivalVolley`, `DuelResult`, `DuelTally`. `spec-lint.sh` cannot see these tags.

---

## 3. Counts

| Metric | Value |
|--------|-------|
| Test file | `__tests__/engine/duel/types.test.ts` (1641 lines) |
| `it()` blocks | **100** — 87 tagged `spec(T-013:AC-n)`, 13 tagged `dod(T-013:…)` |
| `expect()` call sites | 173 (higher at runtime: several are inside table-driven loops over all 8 phases / 10 cannons / 5 islands, and inside the recursive plain-JSON walker) |
| Type-level tests | **40 of 100** contain a compile-checked probe |
| `@ts-expect-error` directives | 30 |
| `Exact<>` assertions | 64 |
| Negative control for `Exact<>` | Yes — an `Exact<>` that must resolve `false`, so a broken helper fails loudly rather than passing everything |
| Commit | recorded below after commit |

---

## 4. RED evidence

`npx tsc --noEmit`:

```
__tests__/engine/duel/types.test.ts(23,8): error TS2307: Cannot find module '@engine/duel/types' or its corresponding type declarations.
__tests__/engine/duel/types.test.ts(43,30): error TS2307: Cannot find module '@engine/duel/types' or its corresponding type declarations.
```

`npx vitest run`:

```
FAIL  __tests__/engine/duel/types.test.ts [ __tests__/engine/duel/types.test.ts ]
Error: Failed to load url /Users/quietguy/Documents/Dev/Gauntlet/Math Game/.worktrees/wt-T-013/src/engine/duel/types.ts
(resolved id: .../src/engine/duel/types.ts). Does the file exist?

Test Files  1 failed | 63 passed (64)
     Tests  1229 passed (1229)
```

**Why this is the right reason.** The failure is a module-resolution error naming exactly the file the ticket
asks the implementer to create, `src/engine/duel/types.ts`, and confirmed absent (`Glob` on `src/engine/duel/`
returns only the frozen `damage.ts`). It is not a typo, a bad alias, or a setup crash: the `@engine/*` alias
resolves correctly — it resolves to the right absolute path and reports that path as missing, which is
resolution succeeding and the file not existing. Every one of the other **1229 baseline tests still passes**, so
nothing in my file perturbs the suite. And the same file, unmodified, goes fully green (100/100) when the alias
is pointed at a reference implementation, which proves the redness is *only* the absent module and that the
suite is satisfiable at all.

`npx prettier --check .` → clean. `npx eslint . --max-warnings 0` → clean, 0 warnings.
`.tdd-swarm/spec-lint.sh tickets/T-013.md` → PASS, all 12 criteria cited, no test citing an unknown criterion.

---

## 5. Cheat matrix

Harness: `scratchpad/t013/` (namespaced per L-028), a reference implementation plus a mutation runner that for
each mutant rewrites the module, runs `tsc` against a probe tsconfig **and** `vitest --reporter=json`, and
records the killing test. "Killed" requires a *named* failing test or a `tsc` error **in the test file** — a
`tsc` error inside the mutant module itself is scored a harness fault, not a kill, since that proves nothing
about my assertions.

**Harness liveness first (L-028/L-014):** the unmutated reference is green 100/100, and 3 control mutants that
should be invisible to my suite (a renamed private local, an added unasserted optional field, a reordered
non-exported declaration) all **survived** — so the result is not uniform and the harness is measuring
something. Every mutation was also verified to actually apply (find/replace hit count > 0); a no-op edit is
reported as DEAD, not as a kill.

**29 designed cheats, 29 killed.**

| # | Cheat | What it did | Caught | By |
|---|-------|-------------|--------|-----|
| 1 | `widen-all-ids-to-string` | every `CannonId`/`IslandId`/`SkillId` field → `string` | ✅ | AC-11, AC-2 (`Exact<>`; all runtime tests still passed — the exact failure class the brief warned about) |
| 2 | `widen-phase-to-string` | `DuelPhase` → `string` | ✅ | AC-1 `Exact<DuelPhase, …>` |
| 3 | `widen-event-type-to-string` | event `type` → `string` | ✅ | `dod(events)` `Exact<>` |
| 4 | `widen-log-correct-to-boolean-ish` | `correct: boolean` → `unknown` | ✅ | AC-11 |
| 5 | `omit-log-field-seed`…`-volley`, `-actor`, `-correct` (4 mutants) | dropped one required `ActionLogEntry` field each | ✅×4 | AC-11 (omission probe + `@ts-expect-error` inversion) |
| 6 | `log-field-optional` | made `correct` optional rather than required | ✅ | AC-11 (`Exact<>` rejects `boolean \| undefined`) |
| 7 | `constant-turn-token` | `turnToken` → literal type `0` | ✅ | AC-2 `Exact<DuelCore['turnToken'], number>` — **runtime-invisible**, this cheat is only killable at the type level in T-013 (§9) |
| 8 | `player-hull-literal` | `playerHull: 100` hardcoded instead of `PLAYER_HULL` | ✅ | AC-2 tuning-mock test. **Survived the first run** — `PLAYER_HULL` really is 100, so it was a true coincidence (L-020). Added the perturbation test; this is the one place the suite genuinely lacked teeth. |
| 9 | `enemy-hull-literal` | `enemyHull: 45` hardcoded | ✅ | AC-2 (asserted across all 5 islands, not just `port_sumwich`) |
| 10 | `enemy-hull-swap-max` | `enemyMaxHull` = `PLAYER_HULL` | ✅ | AC-2 |
| 11 | `volley-starts-at-zero` | `volleyNumber: 0` | ✅ | AC-2 |
| 12 | `phase-starts-at-playerChoose` | wrong initial phase | ✅ | AC-2 |
| 13 | `drops-config-loadouts` | `rivalLoadout: config.playerLoadout` | ✅ | AC-2 carry-through — **would have passed AC-2 as literally written** (§6, A5) |
| 14 | `drops-config-seed` | `seed: 0` regardless of config | ✅ | AC-2 carry-through + AC-4 |
| 15 | `mask-seed-with-shift` | `createRng(config.seed >>> 0)` — the exact misapplication of the dispatch advisory | ✅ | AC-5 seed rejection (`NaN`/`2**33` silently became seed 0) |
| 16 | `ignore-seed-in-rng` | `createRng(1)` always | ✅ | AC-4 |
| 17 | `no-validate-empty-loadout` | skipped the empty-loadout check | ✅ | AC-5 |
| 18 | `no-validate-cannon-id` | skipped catalog membership | ✅ | AC-5 (cast probe) |
| 19 | `no-validate-island-id` | skipped island check | ✅ | AC-5 (cast probe) |
| 20 | `terminal-includes-abandoned` | `isTerminalPhase` also true for a third phase | ✅ | AC-7 |
| 21 | `terminal-victory-only` | forgot `defeat` | ✅ | AC-7 |
| 22 | `terminal-string-compare-prefix` | `phase.startsWith('v')` | ✅ | AC-7 (table over all 8 phases) |
| 23 | `rival-view-leaks-seed` | `toRivalView` spread the whole state | ✅ | AC-8 exact key set |
| 24 | `rival-view-drops-field` | omitted one `RivalView` key | ✅ | AC-8 |
| 25 | `rival-view-swaps-hulls` | `playerHull`/`enemyHull` transposed | ✅ | AC-8 per-field values |
| 26 | `recent-correct-chronological` | returned the log in append order (no reverse) | ✅ | AC-9 ordering (**only because the fixture is non-palindromic** — see §2) |
| 27 | `recent-correct-includes-rival` | no actor filter | ✅ | AC-9 |
| 28 | `recent-correct-truncates` | sliced to `BOT_ACCURACY_WINDOW` | ✅ | AC-9 no-truncation |
| 29 | `state-holds-a-function` | added a method to the state object | ✅ | AC-6 plain-JSON walker (`toEqual` alone did **not** catch it) |

Two findings worth the orchestrator's attention: cheats **#8** and **#26** both initially passed for
*coincidental* reasons rather than because the suite was checking the mechanism. Both are now killed by
construction (constant perturbation; fixture precondition), not by luck.

---

## 6. Ambiguities and proposed ticket amendments

Six defects. I changed nothing in `tickets/**` (not writable, and not my call).

### A1 — AC-4 is false as written *(blocking, arithmetic)*

AC-4 says two configs differing only in `seed` must produce different `rng`. But `createRng` stores
`seed >>> 0` (`src/engine/rng.ts:16`), which is reduction mod 2³², while the legal seed domain it validates is
integers in `[-0xffffffff, 0xffffffff]` (`rng.ts:13`). So distinct *legal* seeds collide:

- `-1 >>> 0 === 4294967295` and `0xffffffff >>> 0 === 4294967295` — both legal, identical `Rng`.
- Generally every pair `(-n, 2³² − n)` for `n ∈ [1, 0xffffffff]` collides: **the entire negative half of the
  legal domain aliases onto the positive half.**

AC-4 is therefore unsatisfiable as a universal claim, and an implementer who trusts it will write a state
machine that assumes distinct seeds ⇒ distinct streams.

**Proposed:** *"Given two configs differing only in `seed`, where the seeds are distinct **modulo 2³²**, then
their `rng` values differ."* Or restrict `DuelConfig.seed` to `[0, 0xffffffff]` and reject negatives in AC-5,
which I'd prefer — a duel seed is a replay key and signed keys with two spellings are a persistence hazard.

My tests confine themselves to `[0, 0xffffffff]`, where `>>> 0` is the identity, so they are satisfiable under
either ruling and encode neither.

### A2 — AC-5 omits `seed`, and the dispatch advisory pushes toward the wrong fix *(blocking)*

AC-5 lists four rejection cases; `seed` is not one. Yet `createRng` throws `RangeError` for any
non-finite-integer or out-of-range seed, so `createDuelState({seed: NaN, …})` has no specified behaviour.

The hazard is the advisory I was given: *"anything seeding from a composed id or hash must mask with `>>> 0`
first."* `DuelConfig.seed` is **neither** — it is a caller-supplied replay key. Applied here it is actively
harmful: `NaN >>> 0`, `2**33 >>> 0`, and `-0.5 >>> 0` are **all `0`**, so three distinct invalid seeds silently
become the same valid duel. That is exactly the aliasing T-001's throw was introduced to eliminate,
reintroduced one layer up, in the module whose entire job is replay-from-seed. My mutant #15 is this cheat.

**Proposed:** add to AC-5 — *"…or a `seed` that is not a finite integer within `createRng`'s accepted range,
then `createDuelState` throws. `createDuelState` must **not** mask or coerce the seed."*

### A3 — no AC covers the event union, `RivalAction`, `RivalVolley`, or `DuelResult` *(blocking)*

`spec-lint.sh` harvests criteria with `grep -oE '\*\*AC-[0-9]+\*\*'`. The 5-member `DuelEvent` union appears
only in the ticket prose, `traces_to`, and a DoD checkbox — **none of which spec-lint reads.** So the gate
reports T-013 fully covered while enforcing nothing about the most widely imported shape in the ticket
(T-018, T-020, T-021, T-022, T-024 all consume it). Green would mean nothing for it.

**Proposed AC-13 … AC-16:**

- **AC-13** — Given the `DuelEvent` union, when its `type` discriminants are enumerated, then they are exactly
  the five documented event types, and each variant carries exactly its documented payload fields.
- **AC-14** — Given a `RivalAction`, when it is constructed, then it carries exactly the documented fields with
  the documented types, and JSON round-trips identically.
- **AC-15** — Given a `RivalVolley`, when it is constructed, then it carries exactly the documented fields, and
  its `actions` are ordered.
- **AC-16** — Given a `DuelResult`, when a duel reaches a terminal phase, then it reports the outcome and the
  per-skill tally, and JSON round-trips identically.

I wrote 13 tests for these anyway, tagged `dod(T-013:…)` so they don't trip spec-lint's "cites no criterion"
arm. **Retag them to AC-13…AC-16 if these land.**

### A4 — `actionLog` ordering direction is never stated *(major)*

AC-9 requires `playerRecentCorrect` "most-recent-first". Whether `toRivalView` must *reverse* depends on the
log's own direction — which neither the ticket nor `ARCHITECTURE.md` §4.2 ("an ordered per-volley action log")
states. Note `recentTemplateIds` **is** explicitly labelled most-recent-first while `actionLog` is not.

I adopted **append order (oldest first)**, and this is *derived, not chosen*: it is the only direction under
which "seed + action log ⇒ an exactly reconstructable duel" (`ARCHITECTURE.md:193`) works, because replay
consumes the PRNG stream forward and T-008's `resolveShot` advances the `Rng` once per shot in play order. A
most-recent-first log would also make the explicit label on `recentTemplateIds` redundant.

**Proposed:** annotate the field — `readonly actionLog: readonly ActionLogEntry[]; // append-ordered, oldest
first` — and make AC-9 read *"…the `correct` values of the player entries in reverse `actionLog` order."*

### A5 — AC-2 does not require the config to reach the state *(major)*

AC-2 enumerates `phase`, hulls, `volleyNumber`, `turnToken`, `actionLog`, `recentTemplateIds`, `tally`. It never
requires `seed`, `islandId`, `playerLoadout`, `rivalLoadout`, or `templatesBySkill` to equal the config's. An
implementation doing `rivalLoadout: config.playerLoadout` satisfies **every letter of AC-2** while breaking
AC-8's projection and every duel downstream. That is my live mutant #13.

**Proposed:** append to AC-2 — *"…and `seed`, `islandId`, `playerLoadout`, `rivalLoadout` and `templatesBySkill`
each equal the corresponding `config` field."* I assert this already; the AC should say so.

### A6 — the scripted onboarding duel cannot be constructed *(major, arithmetic — escalating, not assuming)*

`ONBOARDING_ENEMY_HULL = 28` is frozen in `tuning.ts:64` for `PLAN.md:75`'s sloop that "politely sinks in three
volleys". But AC-2 forces `enemyHull === enemyMaxHull === ENEMY_HULL_BY_ISLAND[islandId]`, which for
`port_sumwich` is **45** (`tuning.ts:41`), and `DuelConfig` has no override. T-013's `file_scopes` freeze after
this ticket, so nothing downstream can ever construct a 28-hull duel through `createDuelState`.

45 is arithmetically wrong for onboarding. The Swivel Gun is 8–12 (`cannons.json`) and
`PERFECT_SHOT_BONUS_DAMAGE = 1`, so the **maximum** a guided-tap volley (a Perfect Shot by construction) can
land is `12 + 1 = 13`. Sinking 45 hull therefore needs `ceil(45 / 13) = 4` volleys **even playing perfectly** —
the three-volley promise is unmeetable. The `ONBOARDING_ENEMY_HULL` window is internally consistent
(`2 × 13 = 26`, so hull ≥ 27 to avoid sinking in two; ≤ 3 × the floor volley of 10 = 30; 28 sits inside), which
confirms 28 is the intended value and 45 is simply the wrong constant for this one duel.

**Proposed:** add an **optional** field to `DuelConfig` — `readonly enemyMaxHull?: number;` — defaulting to
`ENEMY_HULL_BY_ISLAND[islandId]`, with AC-2 unchanged for the default path. Optional so it is purely additive.
My tests deliberately do **not** assert `keyof DuelConfig` exactness, so this lands without touching them.
I did not invent the field or the number — 28 already exists in frozen tuning; I am asking for a way to reach it.

### A7 — brief/ticket discrepancy on the `reload` phase *(minor, no action needed from me)*

My dispatch brief says T-022 "adds a `reload` phase". `reload` is **already** one of T-013's eight phases. So
either T-022 adds a differently-named phase, or the brief is stale. Flagging so T-022 isn't authored against a
name collision. (No amendment to T-013.)

### Two smaller notes

- **AC-5's catalog branches are statically unreachable** from well-typed input (all 10 `CannonId`s are in
  `cannons.json`; `ENEMY_HULL_BY_ISLAND` is total over all 5 `IslandId`s). They are still worth having — a
  reloaded save is untyped input — but the AC should say "including from untyped input", and the test needs a
  cast to reach them. Per L-015 I wrote the probe instead of arguing the branch away.
- **AC-8 naming hazard:** inside `RivalView`, `enemyHull` is the *rival's own* hull and `playerHull` is its
  opponent's. An `Opponent` implementer (T-018/T-021) will plausibly read `playerHull` as "my hull". Worth a doc
  comment on the type.

---

## 7. Forward-compatibility check for T-022

**Additive with zero changes to my tests:**

- **Adding an optional field to `ActionLogEntry`** (e.g. T-022's Double-Shot marker). I assert the four
  *required* fields and each of their types, but deliberately **not** `keyof ActionLogEntry` exactness. My
  "omitted-not-`undefined`" test compares key sets generically across the round-trip and never names a field, so
  a new optional field passes untouched.
- **Adding an optional field to `DuelConfig`** — same reason, no `keyof DuelConfig` exactness (this is also what
  makes A6 land cleanly).
- **Adding payload fields to a new event variant**, as long as existing variants are unchanged.

**Requires a small mechanical patch — by the ticket's explicit design:** adding a **9th phase** and a **6th
event type**. The DoD mandates *literal, non-derived* enumerations precisely so that this fails loudly instead
of silently changing meaning, so the honest answer to "without your tests needing to change" is **no** for these
two, and that is intent, not oversight. I minimised and localised the surface to **8 edit sites, all literal
lists, no logic**:

1. `EXPECTED_PHASES` — one array element.
2. `TERMINAL_BY_PHASE` — one entry (`false`).
3. `EXPECTED_EVENT_TYPES` — one array element.
4. `STATE_BY_PHASE` — one fixture entry (typed `Record<(typeof EXPECTED_PHASES)[number], DuelState>`, so `tsc`
   *demands* it rather than letting it be forgotten).
5. AC-1's `toHaveLength(8)` and `Set size 8` → 9.
6. AC-1's two `Exact<>` unions (`DuelPhase`, `(typeof DUEL_PHASES)[number]`).
7. The `dod(events)` `Exact<DuelEvent['type'], …>` union.
8. The `dod(events)` runtime event list.

The `@ts-expect-error` negative controls use names chosen so no future ticket turns them into unused
directives: phase `'reloading'`, event `NOT_A_DUEL_EVENT`, cannon `'brass_monkey'`, islands `'atlantis'` /
`'kraken'`.

**One risk to confirm:** I *do* assert `keyof RivalVolley` exactness. If T-022 gives the rival a Double-Shot,
that becomes a 9th patch site. The ticket specifies `RivalVolley` as closed and flags only `ActionLogEntry` for
extension, so I followed the ticket — but the orchestrator should confirm before T-022 is authored.

---

## 8. Blocked / write-guard interactions

Nothing I needed was denied, and I did not route around anything. The guard fired twice, both times correctly
per its documented rules, both times on *read-only* intent:

1. `node -e "…require('./src/content/cannons.json')…"` (listing catalog ids) — matched the
   interpreter-with-`src/` rule. Used the `Read`/`Grep` tools instead.
2. `rm -rf scratchpad && … && ls -la src/engine/duel/` — matched the `rm … src/` rule because the pattern spans
   `&&`. Split into two commands; the `rm` targeted only `scratchpad/`.

I did not attempt to write `src/**`, `tickets/**`, `.tdd-swarm/phase`, `.tdd-swarm/active-ticket`, config files,
or any sibling's test file. `src/engine/duel/types.ts` **does not exist** on this branch;
`src/engine/duel/` contains only the frozen `damage.ts`. `scratchpad/t013/` was removed before committing.
Committed on `ticket/T-013-duel-types` only — no merge, no push, no other branch touched.

---

## 9. Residual risk — what this suite does *not* pin

1. **`turnToken` semantics.** T-013 only ever emits `0`, and `src/stores/**` (which would own the comparison) is
   out of scope. I pin that it is `number` and not the literal `0`, and that a non-zero token round-trips — but
   **nothing here can prove it changes on handoff.** That is T-020's, and the `constant-turn-token` cheat is
   killable in this ticket at the type level only. Highest-value thing for a reviewer to look at.
2. **Reference identity.** AC-3 requires deep equality, not distinct objects. A memoising `createDuelState`
   returning the *same* object for equal configs passes my suite, and would then alias state across two duels.
   Not asserted because no AC implies it — worth an AC.
3. **Config aliasing / no defensive copy.** `playerLoadout`, `rivalLoadout`, and `templatesBySkill` may be held
   by reference. A caller mutating its own config array afterwards would mutate the duel state. Nothing pins
   copying, and AC-12 is compile-time only.
4. **Runtime immutability.** AC-12 is `readonly` *typing*. Nothing calls `Object.freeze`, so plain JS (or the
   out-of-scope store, or a `JSON.parse` round-trip result) can mutate a state freely.
5. **`recentTemplateIds` semantics.** Typed and asserted empty at construction; its window
   (`RECENT_TEMPLATE_WINDOW = 5`) and most-recent-first ordering are **unpinned** — no AC covers them and
   T-007/T-019 consume them.
6. **`DuelTally.bySkill` accumulation rules** are unpinned beyond "zeroed at construction" (T-020).
7. **Hull clamping at ≥ 0** is not asserted; that is T-020's reducer, but no type here prevents a negative hull.
8. **The 13 `dod(…)`-tagged tests are invisible to `spec-lint`.** If someone deletes them, no gate notices until
   a downstream ticket breaks. Fixed by adopting A3.
9. **`Exact<>` strictness vs. spelling.** `templatesBySkill` is pinned as
   `Readonly<Partial<Record<SkillId, readonly Template[]>>>`. A semantically equivalent but differently spelled
   type (notably one with an explicit `| undefined` member under `exactOptionalPropertyTypes`) will be rejected.
   That is deliberate, but the implementer should expect it rather than be surprised.
10. **All measurements are from this worktree at `ce51e71` with `src/engine/duel/types.ts` absent** (L-027). The
    mutation results specifically describe the suite's behaviour against *my* reference implementation, not
    against whatever T-013's implementer writes.
