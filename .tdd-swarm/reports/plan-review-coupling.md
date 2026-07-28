# Plan Review — Coupling, Sequencing, Architectural Soundness

Reviewer lens: coupling / sequencing / architectural soundness (a second reviewer covers
coverage & testability). Reviewed: `PLAN.md`, `ARCHITECTURE.md`, `.tdd-swarm/posture.md`,
`.tdd-swarm/gates.md`, `.tdd-swarm/traceability.md`, `TICKETS.md`, `tickets/T-001…T-024.md`,
plus the live `tsconfig.json` / `eslint.config.js` / `vitest.config.ts`.

**Verdict: do NOT dispatch wave 1 as planned.** Two cheap edits to `T-003` are required first
(F4, F5). `T-001` and `T-002` are safe to dispatch immediately. Wave 2 is blocked outright by
a Critical finding (F1).

---

## What I verified mechanically (and what actually holds up)

I re-ran the Planner's exclusivity claim rather than trusting it. Parsing all 24 frontmatter
blocks:

- **`file_scopes` exclusivity within a wave: genuinely clean.** No globs are used anywhere —
  every entry is an exact path — so there is no hidden glob overlap to find. The only two
  shared files are the declared cross-wave pair (`duel/types.ts` T-013→T-022,
  `duel/reducer.ts` T-020→T-022).
- **`test_scopes` exclusivity: clean.** No two tickets write to the same test file.
- **No cycles, no backwards edges.** Every declared `depends_on` entry points to a strictly
  earlier wave.
- **Every ticket sits at exactly the earliest wave its declared dependencies allow.** The
  Planner's claim is arithmetically true.

The catch: that last statement is only true *because several `depends_on` sets are incomplete*.
The mechanical check validates the graph the Planner declared, not the graph the code implies.
Findings F1 and F3 are what the mechanical check cannot see.

---

## Critical — plan cannot proceed

### F1. T-005 and T-004 are in the same wave and T-005 imports T-004's module

- `tickets/T-005.md:6` — `depends_on: [T-002, T-003]`, `wave: 2`
- `tickets/T-004.md:6` — `wave: 2`, sole owner of `src/engine/tuning.ts`
- `tickets/T-005.md:42-43` — "…and `DISTRACTOR_MAX_RATIO` / `DISTRACTOR_ABS_FLOOR` /
  `MAX_DISTRACTOR_ATTEMPTS` / `CHOICE_COUNT` **from T-004**"
- `tickets/T-005.md:134` — DoD: "Every threshold used comes from `@engine/tuning`"
- `tickets/T-005.md:54-55, 74, 88` — AC-4, AC-5, AC-6, AC-8 all assert against those constants
- `TICKETS.md:130-148` — the mermaid graph contains **no** `T004 --> T005` edge

This is the exact failure mode the parallel-worktree model cannot survive: two same-wave tickets
sharing an *interface* without sharing a file. T-005's agent gets a worktree in which
`src/engine/tuning.ts` does not exist. It cannot typecheck, cannot lint, cannot run. Worse, the
**frozen tests** for T-005 are written before implementation and must import `@engine/tuning`
too — so the test-writing agent is blocked as well, one phase earlier.

This is not a "hope it lands" situation; it is a compile failure on dispatch.

**Fix (pick one, first is preferred):**

1. Add `T-004` to `T-005`'s `depends_on` and move **T-005 to wave 3**. This cascades T-007 to
   wave 4 and downstream — see the re-wave plan below, which combined with F3 gives **7 waves
   instead of 8**, so this costs nothing in depth.
2. Or move the four distractor constants out of `tuning.ts` into `distractors.ts`. Rejected:
   `T-004`'s `locked-decision` (`tickets/T-004.md:62`) and ARCHITECTURE.md §4.3/§8 require one
   constants file, and this would silently break the dev-slider contract.

---

## Important — must fix before the human sees it

### F2. T-013 AC-11 and T-022 AC-1 directly contradict each other

- `tickets/T-013.md:167-169` — AC-11: "Given `ActionLogEntry`, when constructed, then it has
  **exactly the four fields** `actor`, `cannonId`, `correct`, `elapsedMs` **and no others**"
- `tickets/T-022.md:54` — "`ActionLogEntry` gains `readonly doubleShot?: boolean`"
- `tickets/T-022.md:78-80` — AC-1: "the base machine's frozen tests from T-013 and T-020 …
  every one of them passes **unmodified** — no existing test file is edited by this ticket"

T-013's AC-11 test is frozen in wave 4. If it is written as a type-level exactness assertion
(`Equal<keyof ActionLogEntry, …>`, or a `@ts-expect-error` on an excess property — which is
exactly the style T-013 AC-10/AC-12 already establish at `tickets/T-013.md:163-172`), then
T-022's additive field breaks it and T-022 AC-1 becomes unachievable. The ticket set has
scheduled a guaranteed wave-7 blocker.

Related, same root cause:
- `tickets/T-013.md:194` — DoD: "Exactly the five ARCHITECTURE.md §4.2 event types; no invented
  events" vs T-022 adding a sixth (`DOUBLE_SHOT_SELECTED`).
- `tickets/T-020.md:129-131` — AC-16's "`8 × 5` exhaustive matrix". If the frozen test derives
  the event list from an exported const/union rather than a hardcoded literal array, T-022's
  sixth event silently changes the matrix.

**Fix:** amend T-013 AC-11 to "…exactly the four **required** fields `actor`, `cannonId`,
`correct`, `elapsedMs`; a later ticket may add optional fields, which must be omitted (not
`undefined`) when absent" — this keeps the wire-format guarantee and stays compatible with
T-013 AC-6's JSON round-trip. Add an explicit note to T-013 and T-020 that phase/event
enumerations in their **tests** must be hardcoded literal arrays, never derived from the
exported union, precisely so T-022 can extend them.

### F3. `T-018 → T-020` is a phantom dependency that costs a full wave, and leaves `opponents/**` with zero in-scope consumer

- `tickets/T-020.md:6` — `depends_on: [T-004, T-007, T-008, T-013, T-018]`
- `tickets/T-020.md:31-53` — the complete transition table. Nothing in it touches `Opponent`.
- `tickets/T-020.md:92, 120-125` — `RIVAL_ACTION` carries `RivalVolley`, which
  `tickets/T-013.md:73-75` places in `duel/types.ts`, **not** in `opponents/`.
- `tickets/T-020.md:186-190` — `Opponent` appears only in *Out of Scope*: "awaiting `Opponent`
  promises … out of this swarm's scope".

The reducer is synchronous and consumes events, not opponents. The `Opponent` interface is
consumed exclusively by the store driver, which is out of scope. So `T-018 → T-020` is not a
real compile edge, and it is the edge that makes the declared critical path 8 hops
(`TICKETS.md:199`).

The second-order consequence is worse than the wave cost: **nothing inside `src/engine/**`
imports `src/engine/opponents/**` at all.** `Opponent`, `createScriptedOpponent`,
`createBotOpponent`, and all of `mercy.ts` are an orphaned island. Their interface shape is
never compile-checked against a real caller anywhere in this swarm.

**Fix — choose deliberately, do not leave it ambiguous:**
- (a) **Drop the edge.** T-020 moves a wave earlier. Accept that `opponents/**` is a library
  layer with no in-scope consumer (see F8).
- (b) **Make the edge real.** Rewrite T-020 AC-18 (`tickets/T-020.md:134-137`) to drive its
  scripted duel through `createScriptedOpponent`, awaiting `chooseAction`/`produceAnswer` in
  the test and feeding the results in as `RIVAL_ACTION` events. This costs nothing, keeps the
  wave count, gives `opponents/**` a genuine consumer, and proves the async↔sync seam
  ARCHITECTURE.md §4.2 spends four paragraphs on. **I recommend (b).**

### F4. `T-003` does not pin the `Question` / `Choice` shape that five downstream tickets assert on

`tickets/T-003.md:52-68` lists required shapes for `skillSchema`, `templateSchema`,
`cannonSchema`, `islandSchema`, `rankSchema`, `crewSchema`. It never states the `Question` or
`Choice` shape. Its only `Question` AC is `tickets/T-003.md:126-129` (AC-13), which pins only
`choices.length === 4` and `correctIndex ∈ [0,3]`.

But downstream tickets assert on fields T-003 is never required to create:

| field asserted | where |
|---|---|
| `question.templateId` | `tickets/T-007.md:92` (AC-3), `tickets/T-020.md:86-87` (AC-2), `tickets/T-017.md:44` |
| `question.params` | `tickets/T-007.md:115` (AC-12), `tickets/T-019.md:88` (AC-8) |
| `question.isWordProblem` / `readAloud` | `tickets/T-007.md:123-126` (AC-15) |
| `Choice = { value, label }` | `tickets/T-007.md:57-59`, `tickets/T-016.md:107` (AC-7 checks the *label*) |

A T-003 implementer can ship `Question = { text, choices: number[], correctIndex }`, pass every
one of its 14 ACs, and freeze it. T-007 then cannot proceed — `questions/types.ts` is **not** in
T-007's `file_scopes` (`tickets/T-007.md:8-9`), so it cannot add the missing fields. That is a
blocked ticket in wave 3 requiring a new amendment ticket against a frozen file.

**Fix:** add an AC to T-003 enumerating the exact `Question` and `Choice` field sets, in the same
style as its catalog-shape block:
```ts
Question { templateId: string; skill: SkillId; text: string;
           params: Readonly<Record<string, number>>;
           choices: readonly Choice[]; correctIndex: number;
           isWordProblem: boolean; readAloud: boolean }   // normalised, never undefined
Choice   { value: number; label: string }
```

### F5. Two "open questions" land in wave 1's frozen schema but are triaged as deferrable

`traceability.md` §2 does not rank its 16 open questions by urgency at all. Two of them are
**wave-1 blockers**:

- **2.10 — Double-Shot semantics** (`traceability.md:180`). The alternative reading (draw from
  *harder templates*) requires a `difficulty` field on `Template`, which lives in
  `src/content/schemas.ts` — **T-003, wave 1, frozen**. T-022 itself says the wrong guess means
  it is "**superseded, not patched**" (`tickets/T-022.md:64`). But the supersede does not stop at
  T-022: it cascades back to T-003's frozen schema, to ~72 authored templates across
  T-014/T-015/T-016, and to T-019's registry. That is not a wave-7 question; deferring it to
  wave 7 is the expensive path.
  **Cheap insurance:** add `difficulty?: 1 | 2 | 3` to `templateSchema` in T-003 now (one schema
  line, one AC). Nothing in this swarm has to read it. That converts a cross-wave supersede into
  a T-022-local patch. Do this even if the human never answers.
- **2.5 — chest rarity tier count** (`traceability.md:175`). `ChestRarity` is a wave-1 id union
  (`tickets/T-003.md:50`). T-004 AC-7 and T-009 AC-8/AC-10 are all written against exactly three
  tiers. Changing the count later is a wave-1 schema edit plus two frozen test suites.

Also under-ranked: **2.2 — Reliable vs Standard** (`traceability.md:172`). Both T-008
(`tickets/T-008.md:85-89`) and T-020 (`tickets/T-020.md:76-78`) carry it as an open question. If
`reliable` is meant to grant a re-answer, that is a **new reducer transition**, i.e. a T-020
supersede and possibly a T-013 phase addition. Needs an answer before wave 3.

Genuinely deferrable (all handled as behaviour-pinned constants, correctly): 2.3, 2.4, 2.6, 2.7,
2.8, 2.11, 2.12, 2.13, 2.15. 2.1 (Culverin recoil) and 2.14 (fog lift) are one-line data edits.
2.16 (wordlist) has no ticket and blocks nothing here.

### F6. The proposed damage curve does not deliver the guarantee ARCHITECTURE.md §4.3 states

- `tickets/T-008.md:59-62` — `biased = u * (1 - QUALITY_WEIGHT) + quality * QUALITY_WEIGHT`
- `ARCHITECTURE.md:206` — "The floor is a pedagogical guarantee: a slow-but-correct K kid
  **always lands ≥ a respectable mid-range volley**."

Under the linear blend, `u` is a fresh uniform draw in `[0,1)`. With `u → 0`, a slow-but-correct
answer produces `biased → 0.35 * W`, i.e. a roll barely above `damageMin`. The 0.35 floor floors
the *quality input*, not the *roll*. The architecture's guarantee is about the roll. The two are
not the same thing and the plan quietly substitutes one for the other.

T-008's ACs will not catch this: AC-6 (`tickets/T-008.md:109-112`) asserts only
`damageToEnemy >= cannon.damageMin` and `mean > cannon.damageMin` — both trivially true under
the blend. The frozen test will lock in a formula that contradicts the design intent.

**Fix (cheap, patch not supersede):** either (a) change the formula so quality raises the roll's
*lower bound* — e.g. `lo = damageMin + quality * QUALITY_WEIGHT * range; roll = uniform(lo, max)`,
which preserves spread, stays monotone, and makes the floor mean what §4.3 says it means; or
(b) keep the blend and add an AC pinning the *minimum* observed roll for a floored correct answer
over N seeds, then get the human to confirm that number is "respectable". Do not ship the current
AC set — it is weak in exactly the place the pedagogy lives.

Note this is the *only* one of the four flagged judgment calls I'd overturn. The other three are
audited below.

### F7. `src/content/**` is in scope but is not covered by the purity or determinism lint

`eslint.config.js:14` scopes `no-restricted-imports`, `no-restricted-properties` (Math.random),
and `no-restricted-globals` (Date) to `files: ['src/engine/**/*.ts']` only.

`.tdd-swarm/posture.md:42` puts **`src/content/**` in scope**. And engine modules import
`src/content/index.ts` at *runtime*, not type-only — `getCannon`/`cannons` are consumed by T-008,
T-010, T-011, T-012, T-013, T-018, T-021. So `src/content/index.ts` is on the engine's runtime
path with no determinism guard. T-006's DoD (`tickets/T-006.md:163`) asserts "no `Math.random()`,
no `Date`" as a checkbox with nothing enforcing it, and `gates.md:20-21` claims the guards are
"proven firing" — true for `src/engine/`, not for the other half of the swarm's scope.

A `Date`-based or `Math.random`-based content loader would break replay (T-023) and the fuzz
determinism (T-024) with **no gate going red**.

**Fix:** extend the eslint block's `files` to `['src/engine/**/*.ts', 'src/content/**/*.ts']`,
keeping the React/RN/Expo/Firebase import ban engine-only if desired but applying
Math.random/Date bans to both. This is a two-line change to `eslint.config.js` at Phase 0, before
wave 1.

### F8. The reachability gate has no written waiver, and eight modules have no in-scope consumer

Modules this swarm ships that **nothing in scope imports**:

| module | ticket | only consumer |
|---|---|---|
| `engine/economy.ts` | T-009 | store (out of scope) — `tickets/T-020.md:191` |
| `engine/placement.ts` | T-011 | onboarding screen (out of scope) |
| `engine/ranks.ts` | T-012 | store (out of scope) |
| `engine/drill.ts` | T-017 | `app/range.tsx` (out of scope) |
| `engine/opponents/types.ts`, `scripted.ts` | T-018 | duel-store driver (out of scope) |
| `engine/opponents/bot.ts`, `mercy.ts` | T-021 | duel-store driver (out of scope) |
| `engine/duel/replay.ts` | T-023 | §13 future work (not built) |
| `engine/duel/invariants.ts` | T-024 | `app/dev.tsx` (out of scope) |

This is **acceptable in principle** — the swarm's declared scope *is* a library layer the app
wires later, and `traceability.md:214-216` says as much. But `posture.md`'s deferred-gates table
has **no row for reachability**, unlike every other waived gate. Wave gating will therefore
either fail this check or skip it silently — the exact thing the posture file exists to prevent.

**Fix:** add an explicit row to `posture.md`'s deferred table: *"Reachability / entrypoint wiring
— **SUBSTITUTED**. This swarm's scope is a pure library layer by design (posture §Scope). The
substituted proof of reachability is: every exported symbol has at least one frozen test that
executes it, and `tsc --noEmit` proves the whole graph compiles. Re-enable when `src/stores/**`
enters scope."* Then F3(b) becomes even more valuable — it converts `opponents/**` from
"tested but never called" to "called by the reducer's own test".

### F9. `duel/replay.ts` (T-023) is the plan's strongest scope-creep candidate

`ARCHITECTURE.md:385` lists ghost-captain async PvP under **§13 Future architecture (documented,
not built)**. T-023 builds a shipped `src/engine/duel/replay.ts` module (13 ACs, `capable` model,
a whole wave) whose only beneficiaries are two features the architecture explicitly declines to
build. T-023's own justification (`tickets/T-023.md:25-28`) is that it makes a falsifiable
architectural claim testable — which is a real argument, and the ticket is well written.

But: the MVP-facing half of that claim is already covered without it. "Kill the app mid-duel,
relaunch" is T-013 AC-6 (`tickets/T-013.md:152-154`) and T-020 AC-20
(`tickets/T-020.md:141-144`), both JSON round-trip tests. Determinism is T-020 AC-19. What
`replay.ts` adds beyond those is reconstruction-from-log, which serves only §13.

Against a 5-day timebox with an explicit cut list, this is the one ticket I would put on the cut
line.

**Fix:** either (a) demote it — keep the *property* as a test inside T-024's fuzz suite
("re-dispatching a recorded event stream reproduces the final state") and drop the shipped
module; or (b) keep it, but record it in `traceability.md` §3 as an accepted deviation from
§13's "documented, not built", not as ordinary coverage. Do not leave it looking like a
requirement.

### F10. T-010 and T-011 assert against island `rangeSkills` content that no T-006 AC pins

- `tickets/T-010.md:110-112` — AC-12 asserts that mastering `add_within_20` lifts the fog to
  `isla_products`, which requires `add_within_20 ∈ port_sumwich.rangeSkills`.
- `tickets/T-011.md:80` — AC-7 asserts `k_1 → unlockedIslands === [port_sumwich]`, which depends
  on the *minimum* grade across every island's `rangeSkills`.
- `tickets/T-006.md:125-128` — AC-9 checks only referential integrity ("every referenced SkillId
  exists"). Nothing pins *which* skills each island carries.

T-006 (wave 2) has real latitude here; T-010/T-011 (wave 3) have frozen tests that assume one
particular assignment. Cross-wave, so it will surface as a wave-3 red rather than a dispatch
failure — but it will surface.

**Fix:** add an AC to T-006 pinning each island's `rangeSkills` and `unlocksCannons` set exactly,
in the same table-driven style as its AC-3 cannon transcription.

---

## Audit of the four flagged judgment calls

| call | verdict |
|---|---|
| **(a) linear damage blend** | **Overturn.** Fails ARCHITECTURE §4.3's stated guarantee; T-008's ACs are too weak to notice. Correctly tagged `proposed` (`tickets/T-008.md:76-79`) and correctly escalated as 2.12, but the escalation understates it — this is a design *defect*, not just an unspecified number. Cost to fix: one formula line + one AC. **Patch, not supersede.** See F6. |
| **(b) Double-Shot = shortened timer** | **Accept the modelling, reject the deferral.** The mechanic composes cleanly with the existing quality curve, adds no phase (`tickets/T-022.md:73-74` — good call, keeps §4.2's eight-phase list and T-024's fuzz coverage intact), and is honestly tagged `open-question` with the alternative spelled out. But the ticket's own "superseded, not patched" cost lands in **wave 1**, not wave 7. See F5. |
| **(c) `RivalAction` / `RivalVolley` split** | **Endorse, no change.** ARCHITECTURE §4.2's `Opponent` return types genuinely do not reconcile with the `RIVAL_ACTION` payload and the four-field action log; the split is the minimal honest reconciliation. Siting all three (`RivalAction`, `RivalVolley`, `RivalView`) in `duel/types.ts` rather than `opponents/` correctly avoids an import cycle (`tickets/T-013.md:109-111`) and is the reason wave 5/6 stays parallelisable at all. `RivalView`'s deliberate information hiding (`tickets/T-013.md:126-128` — no `rng`, no `question`) is a genuinely good call for the future-network-player path. Clearly tagged `proposed`. |
| **(d) optional `doubleShot` on the action log** | **Necessary and correctly flagged** (`tickets/T-022.md:70-72` names it as a deviation from §4.2's four-field log). But it collides head-on with T-013 AC-11's "exactly four fields and no others". See F2 — this is the finding that turns a good judgment call into a scheduled wave-7 blocker. |

---

## Architectural drift — the five modules not in ARCHITECTURE.md §8

| module | verdict |
|---|---|
| `placement.ts` (T-011) | **Justified.** PLAN.md's grade picker is an MVP-checklist item; the logic has to live somewhere and folding it into `mastery.ts` would mix onboarding with progression. §8's engine list reads as illustrative, not exhaustive. `cheap` ticket. |
| `ranks.ts` (T-012) | **Justified but deferrable.** ARCHITECTURE §5 requires numeric `rankTier`; the ratchet is a stated child-safety guarantee. But PLAN.md dates the rank ladder **day 4**, and the module has no in-scope consumer. Keep if wave width allows; first thing I'd cut if wave 3 runs long. |
| `drill.ts` (T-017) | **Justified.** §8 names `app/range.tsx` but no engine module; putting the pure loop in the engine is exactly right under §3.2's "all game logic outside React". Serves an MVP-checklist line. |
| `duel/replay.ts` (T-023) | **Scope creep.** See F9. |
| `duel/invariants.ts` (T-024) | **Justified for the fuzz; thin as shipped code.** ARCHITECTURE §9.2 explicitly asks for the invariant fuzz, so the ticket earns its place. But the argument for exporting the predicate from `src/engine/` rather than keeping it test-local (`tickets/T-024.md:65-68`) rests on `app/dev.tsx` and a future server validator — both out of scope. Minor; the cost is one small file. |

**Engine purity: clean.** No ticket requires `src/engine/**` to import React/RN/Expo/Firebase.
No ticket uses `Math.random()` or `Date` — T-018 AC-9 and T-021 AC-18 even add source-scan ACs
for `Date`/`Math.random`/`setTimeout`/`performance.now`, which is above the bar. T-013's decision
to inject `templatesBySkill` through `DuelConfig` rather than importing the registry
(`tickets/T-013.md:120-124`) is a genuinely good call: it keeps the reducer at the two-argument
signature §4.2 specifies, keeps `DuelState` serialisable, and severs what would otherwise be a
T-019 → T-020 dependency. Credit where due.

---

## Minor — note in the ledger

- **M1.** `tickets/T-019.md:91` (AC-9) uses `isPlausibleDistractor` from T-005, but T-005 is not
  in T-019's `depends_on` (`tickets/T-019.md:6`). Transitively satisfied via T-007; harmless.
- **M2.** `tickets/T-015.md` AC-3 looks up a skill's `symbolicOnly` "in the catalog" (T-006), but
  T-006 is not in T-015's `depends_on`. Cross-wave (2 → 4), so harmless — but add the edge.
- **M3.** T-020 reads `cannon.skill`, `cannon.timerMs`, `cannon.recoilDamage` from the catalog
  but does not declare T-006. Transitively satisfied via T-008/T-013.
- **M4.** `tickets/T-014.md:106-109` (AC-7), `T-015` AC-10, `T-016` AC-11 all require counting
  "the number of samples in which T-005 substituted a fill-ladder value". `buildDistractors`
  returns `readonly number[]` with no substitution signal (`tickets/T-005.md:136`). The count is
  derivable (evaluate the declared distractor expressions against `question.params` and diff
  against the choice set) but it is awkward and three tickets will each reinvent it. Consider
  having T-005 export the derivation helper, or state the derivation explicitly in T-014.
- **M5.** T-004's AC-2 test must **hardcode** the island order
  (`port_sumwich, isla_products, …`, already spelled out at `tickets/T-004.md:105`) and must not
  read it from T-006's catalog — T-006 is a same-wave sibling. Worth an explicit line in the
  ticket so a test author does not reach for `@content`.
- **M6.** `tickets/T-003.md:154` — DoD: "no runtime dependency on zod inside `src/engine/`". Not
  achievable in spirit: T-008/T-010/T-011/T-012/T-013/T-018/T-021 all import `@content/index.ts`
  at runtime, which imports zod and validates at module load (`tickets/T-006.md:91-93`). Harmless
  (zod is not lint-banned and §2 endorses it) but the DoD line as written is misleading — reword
  to "`questions/types.ts` imports **types only** from `@content/schemas`".
- **M7.** `TICKETS.md:199` declares the critical path as 8 hops. It is 8 hops *as declared*, but
  one of its edges is phantom (F3) and one required edge is missing (F1). Regenerate after fixing.
- **M8.** `traceability.md:88` tags all five added modules as "each is tagged `proposed` in its
  ticket". T-017's `drill.ts` and T-011's `placement.ts` carry no module-level `proposed` tag —
  only per-decision tags. Cosmetic.

---

## Recommended re-wave (fixes F1 + F3(b), 8 waves → 7)

Applying only the two dependency corrections — add `T-004 → T-005`; keep `T-018 → T-020` but make
it real per F3(b) — and recomputing earliest-possible waves:

| wave | tickets | width | file-scope check |
|---|---|---|---|
| 1 | T-001, T-002, T-003 | 3 | disjoint |
| 2 | T-004, T-006 | 2 | disjoint |
| 3 | T-005, T-008, T-009, T-010, T-011, T-012 | 6 | disjoint |
| 4 | T-007, T-013 | 2 | disjoint |
| 5 | T-014, T-015, T-016, T-017, T-018, T-020 | 6 | disjoint (3 template files, `drill.ts`, `opponents/{types,scripted}.ts`, `duel/reducer.ts`) |
| 6 | T-019, T-021, T-022 | 3 | disjoint (`templates/index.ts`, `opponents/{bot,mercy}.ts`, `duel/{types,reducer}.ts`) |
| 7 | T-023, T-024 | 2 | disjoint |

New critical path (7 hops): `T-003 → T-004 → T-005 → T-007 → T-013 → T-020 → T-022 → T-023/T-024`
— note T-013 gates on T-008 (wave 3) and T-020 gates on both T-007 and T-013.

If F3(a) is chosen instead (drop the edge rather than make it real), T-020 can move to wave 5 the
same way and `opponents/**` stays orphaned — the wave count is identical, so F3(b) is strictly
better value.

Wave 5 at width 6 with three heavy template tickets is the run's peak load; that was already true
in the original plan (its wave 4).

---

## Would I dispatch wave 1 as planned?

**No.**

- `T-001` (`rng.ts`) — **dispatch now.** Zero dependencies, self-contained, its `Rng` shape is
  pinned by its own AC-6, and every downstream consumer's usage is consistent with it. Clean.
- `T-002` (`expr.ts`) — **dispatch now.** Zero dependencies, closed grammar, no shared interface,
  no coupling to anything in its wave. Clean.
- `T-003` (`schemas.ts` + `questions/types.ts`) — **hold for two edits, ~15 minutes of work:**
  1. Add the `Question` / `Choice` shape and an AC pinning their exact field sets (**F4**) —
     without this, T-007 is a blocked ticket in wave 3 against a frozen file.
  2. Add `difficulty?: 1 | 2 | 3` to `templateSchema` (**F5**) — one line of cheap insurance that
     converts a possible cross-wave Double-Shot supersede into a T-022-local patch.
  Then dispatch.

Additionally, before wave 2 opens: fix **F1** (T-005's missing `T-004` edge — this is a hard
blocker, not a nice-to-have), **F2** (T-013 AC-11 wording, so wave 7 is not pre-broken), and
**F7** (extend the eslint determinism glob to `src/content/**` — a two-line Phase-0 change that
closes a real gap in the swarm's own gate coverage).

**Dimensions that are genuinely clean — no findings manufactured:** file-scope exclusivity within
every wave (verified mechanically, exact paths only, no glob overlap); test-scope exclusivity; no
dependency cycles; no backwards edges; engine purity across all 24 tickets; determinism discipline
(no wall-clock, no unseeded randomness, PRNG state threaded through serialisable state
throughout); and the `RivalAction`/`RivalVolley`/`RivalView` reconciliation, which is the best
judgment call in the plan.
