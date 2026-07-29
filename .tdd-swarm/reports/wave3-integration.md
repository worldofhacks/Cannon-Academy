# Wave 3 — Integration Report

**Integrator:** independent integration agent (wrote none of this code)
**Integration branch:** `swarm/engine-core`
**Tickets merged:** T-005 (distractors), T-008 (damage model), T-009 (economy), T-010 (mastery), T-011 (placement), T-012 (rank ladder)
**Merged commit range:** `e8155ad..786abf7`
**Date:** 2026-07-28

---

## Verdict

| Dimension                      | Result                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------- |
| **Merges**                     | 6/6 clean — zero conflicts, textual or semantic                               |
| **Repo gate suite**            | ALL GREEN                                                                     |
| **Test suite**                 | **1,229 passed / 1,229**, 13 files, 2.33s                                     |
| **Cross-ticket compatibility** | Probe green (6/6), but it **surfaced one composition gap** — see Finding 1    |
| **Architecture drift**         | 2 findings escalated, 3 noted as known/pending, 0 absorbed                    |
| **Overall**                    | **PASS** — with two tickets filed (T-032, T-033), neither blocking the merge  |

The wave is green and the merge stands. Two findings are escalated that no gate could have
caught, one of which contradicts a stated premise of the wave-3 dispatch.

---

# Part 1 — Merges

All six branches merged with `--no-ff` in ticket-id order. Every merge reported
"Merge made by the 'ort' strategy" with exit 0. **No conflict at any point**, so no semantic
conflict resolution was performed or required.

| Merge commit | Branch                          | Files added                                                                 |
| ------------ | ------------------------------- | --------------------------------------------------------------------------- |
| `4024c8c`    | `ticket/T-005-distractors`      | `src/engine/questions/distractors.ts`, `__tests__/engine/questions/distractors.test.ts` |
| `e8d8b00`    | `ticket/T-008-damage-model`     | `src/engine/duel/damage.ts`, `__tests__/engine/duel/damage.test.ts`         |
| `11434c9`    | `ticket/T-009-economy`          | `src/engine/economy.ts`, `__tests__/engine/economy.test.ts`                 |
| `7907ada`    | `ticket/T-010-mastery`          | `src/engine/mastery.ts`, `__tests__/engine/mastery.test.ts`                 |
| `8630c25`    | `ticket/T-011-placement`        | `src/engine/placement.ts`, `__tests__/engine/placement.test.ts`             |
| `786abf7`    | `ticket/T-012-rank-ladder`      | `src/engine/ranks.ts`, `__tests__/engine/ranks.test.ts`                     |

Each branch added **exactly two files and modified none**, and the twelve files are pairwise
disjoint. That is the entire reason six merges were trivial — this wave had no shared-file surface
at all, unlike wave 2's `src/content/` overlap.

**Net wave-3 diff:** 12 files, 5,984 insertions, 0 deletions.

### Dependency-manifest check — PASS

```
git diff --stat e8155ad HEAD -- package.json package-lock.json   → empty
md5 package.json      15d3453f2c7090b74f4361fb805e03ad   (unchanged)
md5 package-lock.json fa53e2f5d2ba77779c150fced5bed74b   (unchanged)
```

Both manifests are **byte-identical** to the pre-merge head. No dependency added, removed, or
re-pinned by this wave.

---

# Part 2 — Repo gate suite

### `.tdd-swarm/run-local-gates.sh` — exit 0

```
== Tier 1 local gates ==
  PASS  format
  PASS  lint
  PASS  typecheck
  PASS  unit
  PASS  no-todos
  PASS  no-skipped-tests
  PASS  engine-purity
== ALL LOCAL GATES PASS ==
```

**Seven gates printed. `frozen-tests-unmodified` did not run** — see Finding 2. I verified the
underlying property by hand instead (below).

### `.tdd-swarm/spec-lint.sh` — 6/6 exit 0

| Ticket | ACs   | Result                    |
| ------ | ----- | ------------------------- |
| T-005  | 17    | `== SPEC-LINT PASS ==`    |
| T-008  | 20    | `== SPEC-LINT PASS ==`    |
| T-009  | 13    | `== SPEC-LINT PASS ==`    |
| T-010  | 15    | `== SPEC-LINT PASS ==`    |
| T-011  | 11    | `== SPEC-LINT PASS ==`    |
| T-012  | 12    | `== SPEC-LINT PASS ==`    |

88 acceptance criteria, every one carrying at least one tagged test, and the reverse direction
(every test file citing a criterion) clean in all six runs.

### `npx vitest run` — 1,229 passed

```
Test Files  13 passed (13)
     Tests  1229 passed (1229)
  Duration  2.33s
```

| Suite                        | Tests |
| ---------------------------- | ----: |
| wave 1–2 baseline (7 files)  |   776 |
| T-005 distractors            |   170 |
| T-008 damage                 |    51 |
| T-009 economy                |    22 |
| T-010 mastery                |    47 |
| T-011 placement              |   123 |
| T-012 ranks                  |    40 |
| **Total**                    | **1,229** |

**The dispatch predicted 1,188; the real figure is 1,229.** The prediction subtracted an
overlap allowance of 41 that does not exist — `776 + 170 + 51 + 22 + 47 + 123 + 40 = 1229`
exactly. Six disjoint file pairs cannot overlap, so the clean sum was always the right
expectation. No tests were lost, and none were double-counted.

### `npm audit --audit-level=high` — exit 0

```
found 0 vulnerabilities
```

Holds the wave-1 remediation (the `brace-expansion` override).

### Frozen-tests check — verified by hand, PASS

Since the mechanical gate did not run, I checked the property directly:

```
git diff --name-status e8155ad HEAD -- '__tests__'
A  __tests__/engine/duel/damage.test.ts
A  __tests__/engine/economy.test.ts
A  __tests__/engine/mastery.test.ts
A  __tests__/engine/placement.test.ts
A  __tests__/engine/questions/distractors.test.ts
A  __tests__/engine/ranks.test.ts

modified (M) entries: 0
```

**Zero pre-existing test files were modified by this wave.** The dispatch's claim is true. It was
true by implementer discipline, not by enforcement — see Finding 2.

---

# Part 3 — Cross-ticket compatibility probe

Written in a **per-ticket scratchpad subdirectory** (`scratchpad/wave3-integration/`) per L-028,
never in `src/` or `__tests__/`, and deleted after the run. The precaution was not theoretical: the
shared scratchpad root still contains a stray `probe.test.ts` from another session, which is exactly
the file that clobbered T-008's mutation run.

The probe imported all six modules in one process — their first-ever co-execution — and drove one
captain run with a single `Rng` threaded through every stage that takes one.

**Result: 6/6 assertions green.** Per L-028 I did not accept a uniform pass at face value: I dumped
the composed values to prove the harness was live rather than silently running nothing.

```
PLACEMENT      : {"maxGrade":1,"unlockedCannons":["culverin","swivel_gun","chain_shot","six_pounder"],
                  "unlockedIslands":["port_sumwich"],"botAccuracyBand":{"min":0.5,"max":0.7}}
STARTER CANNON : culverin 4-16 timer=20000
SHOT           : {"kind":"volley","answerQuality":0.9,"rollDamage":16,"bonusDamage":1,
                  "damageToEnemy":17,"damageToSelf":0,"ballCount":2,"perfectShot":true}
COINS (win)    : 42        COINS (loss) : 11
CHEST          : {"rarity":"common","coins":17}
MASTERY        : answers=10 {"weightedCorrect":10,"correct":10,"attempts":10} meter=100
UNLOCKS        : {"cannons":[],"islands":["isla_products"]}
RANK TIERS     : 0->0 1->0 4->0 5->0 14->1 15->1 29->2 30->2 59->3 60->3 500->4
DISTRACTORS 3+4: [8,6,9]     DISTRACTORS 8+9: [18,16,19]
```

Varied, plausible, catalog-consistent output — the harness was reaching the real modules.

### What the probe verified

| Interlock                                   | Result                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| T-005 → T-002 `expr` + T-004 constants      | Clean. Distractors build off real templates and evaluate correctly.        |
| T-008 → T-001 `rng` + T-004 tuning          | Clean. Roll lands inside the cannon's band; timing helpers mutually agree. |
| T-011 → T-008 (placement feeds duel)        | Clean. A placement cannon id resolves and takes a shot without adaptation. |
| T-009/T-010/T-011/T-012 → `@content/index`  | Clean. Four consumers, one module-level parse, identical frozen catalog.   |
| Seed reproducibility end-to-end             | Clean. Two runs at one seed are `toStrictEqual` **and** JSON-identical.    |
| Seed liveness (anti-L-028)                  | Clean. 60 seeds produce varied states, rolls, and rarities.               |
| Seed independence of the pure stages        | Clean. Placement, payout, mastery, ladder, distractors constant by seed.   |

Every referential-integrity check passed: every `CannonId` and `IslandId` returned by placement
and by mastery exists in the catalog, with no duplicates, and repeated `resolvePlacement` calls
return equal-but-not-aliased arrays.

### Finding 1 — placement pre-grants the range guns mastery is meant to award (**escalated, T-032**)

The line `UNLOCKS: {"cannons":[],"islands":["isla_products"]}` above is the tell. A player who
just mastered a range skill received **no cannon**. I chased it across all three bands with every
skill mastered:

```
band   owned at placement   range guns pre-granted   still earnable by mastery
k_1            4                  2 / 7              5 cannons, 4 islands
g2_3           7                  5 / 7              2 cannons, 2 islands
g4_5           9                  7 / 7              0 cannons, 0 islands
```

**A `g4_5` captain can never earn a cannon or an island through range mastery.** Placement hands
over all seven range guns and all five islands at onboarding, so `resolveUnlocks` returns empty
forever. The meter fills and gates nothing.

**Neither ticket is at fault, and both are correctly implemented.** T-011 AC-2 and AC-4 explicitly
require this cannon set; T-010's delta semantics are explicitly idempotent. The boundary between
them was simply never specified. No frozen suite could have caught it, because no test in either
suite exercises the two functions together — which is why it survived six green gate runs, six
approving code reviews, and two security passes.

This needs an **owner decision**, not a patch. T-032 lays out three options and deliberately ships
without acceptance criteria until one is chosen.

---

# Part 4 — Architecture drift vs `ARCHITECTURE.md`

### §8 module placement — 4 of 6 as declared, 2 additive

| Module                              | §8 says                              | Verdict                      |
| ----------------------------------- | ------------------------------------ | ---------------------------- |
| `src/engine/questions/distractors.ts` | `questions/ # ... distractors ...`  | As declared                  |
| `src/engine/duel/damage.ts`         | `duel/ # DuelState, events, reducer, damage` | As declared          |
| `src/engine/economy.ts`             | `economy.ts # payouts, chest rarity rolls`   | As declared          |
| `src/engine/mastery.ts`             | `mastery.ts # meters, thresholds, unlocks`   | As declared          |
| `src/engine/placement.ts`           | **not listed**                       | Additive — **ticketed**      |
| `src/engine/ranks.ts`               | **not listed**                       | Additive — **not ticketed**  |

`placement.ts` is a documented, deliberate deviation: T-011's Planning Decisions carry a `proposed`
entry arguing §8's engine list "reads as illustrative rather than exhaustive" and that folding
placement into `mastery.ts` would mix onboarding with progression. That reasoning is sound and I
accept it.

`ranks.ts` is the same kind of addition with **no equivalent note anywhere in T-012**. It is almost
certainly fine — a rank ladder is obviously engine-pure and obviously not `mastery.ts` — but the
asymmetry is worth closing: §8 has now silently gained two modules and only one of them was argued
for. **Recommendation:** when T-031 corrects §4.3, amend §8's engine list in the same pass to name
`placement.ts` and `ranks.ts`, so the tree stops drifting one unlisted module at a time. Filed as a
note here rather than a ticket, since it is a one-line doc edit riding an existing ticket.

### `ARCHITECTURE.md:202` Perfect Shot — code matches the T-031 ruling. Doc stale, as expected.

Confirmed, not re-raised. The shipped code implements the ruling:

```ts
const bonusDamage = perfect ? PERFECT_SHOT_BONUS_DAMAGE : 0;   // = +1 DAMAGE
damageToEnemy: rollDamage + bonusDamage,
ballCount: perfect ? BASE_BALLS_PER_VOLLEY + 1 : BASE_BALLS_PER_VOLLEY,
```

Probe output `bonusDamage: 1`, `damageToEnemy: 17 = rollDamage 16 + 1`. **Damage is scalar and
`ballCount` participates in no damage arithmetic** — nothing in the engine reads it. It is carried
in `ShotOutcome` purely as a presentation hint, which matches T-031's corrected wording exactly:
"+1 damage, celebrated with an extra cannonball arc."

`ARCHITECTURE.md:202` still says "+1 bonus ball" and remains **known-stale pending T-031**, which
has not landed. No action for this wave.

### PLAN.md "two cannons" — pending decision, not drift

Reported as instructed. One factual note the owner should have before ruling on T-029: its
rationale states *"Three cannons is also exactly the duel tray's capacity, so no loadout selection
is needed at K-1."* The shipped T-011 placement gives K-1 **four** owned cannons (`swivel_gun`,
`culverin`, plus the grade-1 range guns `six_pounder` and `chain_shot`), so loadout selection is
already needed at K-1 with or without T-029. That does not weaken T-029's core argument — K-1 still
has only one *skill* to choose between — but the tray-capacity premise is no longer true. T-030
already owns the selection problem, so nothing is unowned; only T-029's stated reasoning needs a
correction when it is approved.

### Finding 2 — the `frozen-tests-unmodified` gate has never run (**escalated, T-033**)

L-023 records that the frozen-test guard moved from the PreToolUse hook to an outcome gate in
`run-local-gates.sh`. The gate was written. **It cannot execute**, for three independent reasons,
any one of which is sufficient:

1. **Unreachable.** `exit "$FAIL"` is line 49; the gate block begins at line 50.
2. **Undefined function.** It calls `report PASS` / `report FAIL`. The script defines `run()`;
   no `report()` exists in any `.tdd-swarm/*.sh`.
3. **Dead guard.** It is wrapped in `[ "$(cat .tdd-swarm/phase) = "implement" ]`, and
   **`.tdd-swarm/phase` does not exist**. Nothing creates it.

The wave-3 gate run confirms it empirically: seven gate lines printed, no `frozen-tests-unmodified`
line, pass or fail.

**This contradicts a stated premise of the wave-3 dispatch** — *"Zero test files were modified by
any implementer — now enforced mechanically."* The first clause is true and I verified it
independently (Part 2). The second is false. Six implementers were believed to be under a
mechanical guard that was not running, and that belief was load-bearing in the decision to merge.

This is L-007 restated: a guard's real coverage is what it has been *observed* blocking. A silent
gate is indistinguishable from an absent one, which is why this survived a full wave. T-033 requires
the repaired gate to be **observed failing on a real violation** before it is trusted again, and
requires the waves 1–2 merges to be retro-checked once it works.

I did not patch it — the brief forbids patching, and the fix touches the harness every implementer
depends on.

### Contracts changed without a ticket — none found

I checked the six modules' public surfaces against their ticket specs and against the wave-1/2
modules they consume. No consumed signature was widened, narrowed, or redefined. T-005 consumes
T-002's `evaluateNumber` and T-004's constants as published; T-008 consumes T-001's `nextFloat` and
`Rng` as published; the four catalog consumers use only exported readonly arrays and the `getX`
accessors. `CHOICE_COUNT` remains duplicated per the wave-2 finding — unchanged by this wave, still
owned by T-028.

---

# Part 5 — Tickets filed

| Ticket | Title                                                          | Status  | Wave     |
| ------ | -------------------------------------------------------------- | ------- | -------- |
| T-032  | Placement pre-grants the range guns mastery is supposed to award | backlog | null     |
| T-033  | The frozen-tests-unmodified gate is unreachable code            | backlog | 3-repair |

T-032 is `wave: null` deliberately: it is an **owner decision**, not a repair. Nothing failed, and
writing acceptance criteria before the design question is answered would bake in an answer.

T-033 is `wave: 3-repair` because it is a genuine harness defect that should be fixed before wave 4
dispatches implementers under a guard that does not exist.

---

# Verdict: **PASS**

Six clean merges, all gates green, 1,229 tests passing, no dependency movement, and every declared
cross-ticket interlock verified in a single process for the first time. The engine core composes.

Two things a green suite could not tell you, both escalated rather than absorbed:

1. **The top grade band has no progression rewards** (T-032). Two correct modules, one unspecified
   boundary, and a probe that had to run them together to see it.
2. **The frozen-test gate has never run** (T-033). The property it protects held this wave, but it
   held on discipline, and the dispatch brief believed otherwise.

Neither blocks the merge. Both should be resolved before wave 4.
