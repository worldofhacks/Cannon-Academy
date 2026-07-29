# Wave 4 — Integration Report

**Integrator:** independent integration agent (wrote none of this code)
**Integration branch:** `swarm/engine-core`
**Tickets merged:** T-007 (question generator), T-013 (duel types + hasOwn security fix)
**Pre-merge HEAD:** `b5b666f`
**Post-merge HEAD:** `c0b11ca`
**Date:** 2026-07-28

---

## Verdict

| Dimension                      | Result                                                                     |
| ------------------------------ | -------------------------------------------------------------------------- |
| **Merges**                     | 2/2 clean — zero conflicts, textual or semantic                            |
| **Repo gate suite**            | ALL GREEN (after ledger formatting)                                        |
| **Test suite**                 | **1,438 passed / 1,438**, 15 files, 2.43s                                  |
| **Cross-ticket compatibility** | Probe green (2/2), composed values dumped — see Part 3                     |
| **Architecture drift**         | 0 new escalations; 2 known findings unchanged (T-032, CHOICE_COUNT)        |
| **Overall**                    | **PASS**                                                                   |

Both wave-4 tickets compose cleanly. No new tickets filed from this integration.

---

# Part 1 — Merges

Both branches merged with `--no-ff` in ticket-id order. Every merge reported
"Merge made by the 'ort' strategy" with exit 0. **No conflict at any point.**

| Merge commit | Branch                            | Tip merged | Files added                                                                 |
| ------------ | --------------------------------- | ---------- | --------------------------------------------------------------------------- |
| `63a4388`    | `ticket/T-007-question-generator` | `a358270`  | `src/engine/questions/generator.ts`, `__tests__/engine/questions/generator.test.ts` |
| `c0b11ca`    | `ticket/T-013-duel-types`         | `f99b25f`  | `src/engine/duel/types.ts`, `__tests__/engine/duel/types.test.ts`           |

Each branch added **exactly two implementation/test files and modified none** under `src/` or
`__tests__/`. The four files are pairwise disjoint — the entire reason both merges were trivial.

Each merge also carried its implementation report (`.tdd-swarm/reports/T-00X-implementation.md`)
and an updated test report, per **L-030**.

**Net wave-4 diff (implementation surface):** 4 files, 6,137 insertions, 0 deletions under
`src/` + `__tests__/`.

### Dependency-manifest check — PASS

```
git diff --stat b5b666f HEAD -- package.json package-lock.json   → empty
md5 package.json      15d3453f2c7090b74f4361fb805e03ad   (unchanged)
md5 package-lock.json fa53e2f5d2ba77779c150fced5bed74b   (unchanged)
```

Both manifests are **byte-identical** to the pre-merge head.

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
  PASS  frozen-tests-unmodified
== ALL LOCAL GATES PASS ==
```

**Eight gates printed.** Unlike wave 3 (T-033), `frozen-tests-unmodified` **ran and passed** —
the T-033 repair landed before this wave dispatched implementers.

> Note: the first gate run immediately post-merge reported `format` RED on `.tdd-swarm/progress.md`
> and `TICKETS.md` (pre-existing drift on the integration branch, not introduced by either merge).
> Prettier was applied as part of the ledger commit; the re-run above is the authoritative result.

### `.tdd-swarm/spec-lint.sh` — 2/2 exit 0

| Ticket | Criteria exercised | Result                 |
| ------ | ------------------ | ---------------------- |
| T-007  | 21 ACs + 6 DoD     | `== SPEC-LINT PASS ==` |
| T-013  | 16 ACs + 8 DoD     | `== SPEC-LINT PASS ==` |

### `npx vitest run` — 1,438 passed

```
Test Files  15 passed (15)
     Tests  1438 passed (1438)
  Duration  2.43s
```

| Suite                        | Tests |
| ---------------------------- | ----: |
| wave 1–3 baseline (13 files) | 1,229 |
| T-007 generator              |    81 |
| T-013 duel types             |   128 |
| **Total**                    | **1,438** |

**Expected sum verified:** `1229 + 81 + 128 = 1438` exactly. Two disjoint file pairs cannot
overlap. Nothing was lost or double-counted.

### `npm audit --audit-level=high` — exit 0

```
found 0 vulnerabilities
```

### Frozen-tests check — mechanical gate PASS

```
git diff --name-status b5b666f HEAD -- '__tests__'
A  __tests__/engine/duel/types.test.ts
A  __tests__/engine/questions/generator.test.ts

modified (M) entries: 0
```

**Zero pre-existing test files were modified by this wave.**

---

# Part 3 — Cross-ticket compatibility probe

Written in `scratchpad/wave4-integration/` per **L-028**, never in `src/` or `__tests__/`, and
**deleted after the run** (directory empty; no debris left).

The probe imported `createDuelState`, `toRivalView` from T-013 and `generateQuestion` from T-007
in one process — their first-ever co-execution — and drove:

1. Construct a duel on `port_sumwich` with real catalog cannon ids and fixture templates.
2. Pull templates from `duel.templatesBySkill` (deep-copied at construction).
3. Generate a question using `duel.rng` and `duel.recentTemplateIds`.
4. Assert seed reproducibility across both modules.

**Result: 2/2 assertions green.** Per L-028 I dumped composed values rather than accepting a
silent pass:

```
WAVE4_PROBE_DUMP: {"duelPhase":"countdown","islandId":"port_sumwich","playerHull":100,"enemyHull":45,
  "questionText":"4 + 4 = ?","templateId":"add_within_10__a_plus_b","choiceLabels":["8","7","16","9"],
  "correctIndex":0,"correctValue":8,"rivalVolley":1,"rngAdvanced":true}
```

Varied, catalog-consistent output — the harness reached the real modules.

### What the probe verified

| Interlock                                      | Result                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| T-013 → T-006 catalogs (cannon/island ids)     | Clean. Real loadouts and `port_sumwich` hull resolve without adaptation. |
| T-013 → T-004 tuning (hulls)                   | Clean. `PLAYER_HULL` / `ENEMY_HULL_BY_ISLAND` match probe expectations. |
| T-007 → T-013 (rng threading)                  | Clean. `generateQuestion` advances `duel.rng`; `rngAdvanced: true`.     |
| T-007 → T-005 distractors + T-002 expr         | Clean. Four choices built; `assertQuestion` passes.                     |
| T-013 template deep-copy → T-007 consumption   | Clean. Templates read from state, not caller alias.                     |
| Seed reproducibility end-to-end                | Clean. Same seed → identical question; different seed → different.      |

No composition gap surfaced. T-020 (reducer) will be the first module to wire question generation
into phase transitions; this probe confirms the vocabulary and generator already agree on shapes
and RNG discipline.

---

# Part 4 — Architecture drift vs `ARCHITECTURE.md`

### §8 module placement — both as declared

| Module                              | §8 says                                      | Verdict     |
| ----------------------------------- | -------------------------------------------- | ----------- |
| `src/engine/questions/generator.ts` | `questions/ # template types, generator, …`  | As declared |
| `src/engine/duel/types.ts`          | `duel/ # DuelState, events, reducer, damage` | As declared |

Both modules sit exactly where §8's tree places them. Transitions remain owned by T-020; this
wave only landed the type vocabulary and constructor.

### Known findings — unchanged, not re-raised

- **T-032** (placement pre-grants range guns mastery should award) — still `backlog`, owner
  decision. Not in wave-4 scope; probe did not exercise placement × mastery.
- **CHOICE_COUNT duplication** (`tuning.ts` vs `questions/types.ts`) — still open from wave 2.
  T-007 imports from `@engine/tuning`; the shadow literal in `types.ts` persists unchanged.
- **T-029 / T-032** — not resolved per integration brief; no action taken.

### Contracts changed without a ticket — none found

T-007 consumes T-001 `Rng`, T-002 `evaluateNumber`/`evaluatePredicate`, T-005 `buildDistractors`,
and T-004 constants as published. T-013 consumes T-001 `createRng`, T-006 `getCannon`, T-008
`ShotOutcome` type, and T-004 hull constants as published. No upstream signature was widened,
narrowed, or redefined by either merge.

---

# Verdict: **PASS**

Two clean merges, all gates green, 1,438 tests passing, manifests unchanged, frozen-test property
held mechanically, and the question generator plus duel vocabulary verified co-executing in one
process for the first time. No new findings; no tickets filed from this wave.
