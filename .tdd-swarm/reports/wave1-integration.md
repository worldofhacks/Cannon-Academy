# Wave 1 — Integration Report

**Integrator:** independent integration agent (wrote none of this code)
**Integration branch:** `swarm/engine-core`
**Tickets merged:** T-001 (seeded PRNG), T-002 (safe expression evaluator), T-003 (content schemas + question types)
**Merged commit range:** `1eb9cf8..ac34693`
**Date:** 2026-07-28

---

## Verdict

| Dimension                      | Result                                                            |
| ------------------------------ | ----------------------------------------------------------------- |
| **Merges**                     | 3/3 clean — zero conflicts, textual or semantic                   |
| **Repo gate suite**            | ALL GREEN                                                         |
| **Test suite**                 | **492 passed / 492**, 5 files, 1.00s                              |
| **Cross-ticket compatibility** | VERIFIED — first-ever co-compilation and co-execution, clean      |
| **Architecture drift**         | **1 Minor finding**, escalated (not absorbed). 2 noted non-drift. |
| **Overall**                    | **PASS**                                                          |

---

# Part 1 — Merges

All three branches merged with `--no-ff` in ticket-id order. Every merge reported
"Merge made by the 'ort' strategy" with exit 0. **No conflict at any point**, so no
semantic conflict resolution was performed or required.

| Merge commit | Branch                           | Files added                                                                                                                                |
| ------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `6694fc8`    | `ticket/T-001-seeded-prng`       | `src/engine/rng.ts`, `__tests__/engine/rng.test.ts`, `.tdd-swarm/reports/T-001-implementation.md`                                          |
| `e76ca9d`    | `ticket/T-002-safe-expr-eval`    | `src/engine/questions/expr.ts`, `__tests__/engine/questions/expr.test.ts`                                                                  |
| `ac34693`    | `ticket/T-003-schemas-and-types` | `src/content/schemas.ts`, `src/engine/questions/types.ts`, `__tests__/content/schemas.test.ts`, `__tests__/engine/questions/types.test.ts` |

The three branches touched **strictly disjoint file sets**, which is why the merges were
trivial. The `.tdd-swarm/` and `tickets/` ledger edits carried by each branch were already
present on the integration branch and merged as no-ops — the only ledger file actually
added was `T-001-implementation.md`.

**Net wave-1 diff:** 9 files, 4,689 insertions, **0 deletions**.

### Dependency-manifest check — PASS

```
git diff --stat 1eb9cf8..HEAD -- package.json package-lock.json   → empty
git diff --stat main..HEAD    -- package.json package-lock.json   → empty
```

No runtime dependency was introduced by this wave. `zod` predates the wave and is
unchanged. Confirmed against both the pre-merge tip and `main`.

---

# Part 2 — Gate evidence

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

### `.tdd-swarm/spec-lint.sh` — exit 0 for all three

| Ticket             | Result                 | ACs mapped to tests |
| ------------------ | ---------------------- | ------------------- |
| `tickets/T-001.md` | `== SPEC-LINT PASS ==` | 16                  |
| `tickets/T-002.md` | `== SPEC-LINT PASS ==` | 26                  |
| `tickets/T-003.md` | `== SPEC-LINT PASS ==` | 20                  |

Bidirectional: every AC has ≥1 tagged test, and every test file cites ≥1 criterion.

### `npx vitest run` — exit 0

```
 ✓ __tests__/scaffold.test.ts                (1 test)    1ms
 ✓ __tests__/engine/questions/types.test.ts  (26 tests)  3ms
 ✓ __tests__/content/schemas.test.ts         (90 tests)  9ms
 ✓ __tests__/engine/rng.test.ts              (41 tests)  40ms
 ✓ __tests__/engine/questions/expr.test.ts   (334 tests) 490ms

 Test Files  5 passed (5)
      Tests  492 passed (492)
   Duration  1.00s
```

**492 tests — matches the ~492 expectation exactly.**

**Suite duration investigated, not assumed.** 1.00s looked implausibly fast for a suite
carrying four `node:worker_threads` non-termination tests at a 3s budget each, so I
verified the worker tests actually execute rather than being silently skipped. Running
`expr.test.ts` with `--reporter=verbose` shows all four isolated `gcd` tests plus the
positive control running and passing:

```
✓ ... gcd of an oversized literal terminates and throws            76ms
✓ ... gcd of a non-finite environment value terminates and throws  59ms
✓ ... gcd of an argument that overflows during evaluation          58ms
✓ ... gcd of a NaN environment value terminates and throws         41ms
✓ ... ordinary gcd still evaluates inside the isolation harness    59ms
```

The 3s figure is a **timeout ceiling, not a fixed cost** — it is only reached by a
non-terminating implementation. Each worker spawns, resolves in 41–76ms, and settles.
The suite is fast _because_ T-002's implementation correctly rejects non-finite values
before they ever reach the Euclid loop. This is the intended behavior, and the suite
completes well within any reasonable budget.

### `npm audit --audit-level=high` — exit 0

```
found 0 vulnerabilities
```

Ran successfully offline against the existing lockfile. **Not skipped.**

---

# Part 3 — Cross-ticket compatibility

These three modules were built in isolated worktrees and had **never been compiled or
executed in one process** before this merge. Findings below are all empirical.

### 3.1 Export-namespace collisions — NONE

The four modules' export surfaces are fully disjoint. Nothing in `expr.ts` or `rng.ts`
shadows or conflicts with any `schemas.ts` export:

| Module       | Exports                                                                                                                                                                                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rng.ts`     | `Rng`, `createRng`, `nextFloat`, `nextInt`, `shuffle`, `pick`, `weightedPick`                                                                                                                                                                                                                                                         |
| `expr.ts`    | `ExprErrorCode`, `ExprError`, `evaluateNumber`, `evaluatePredicate`                                                                                                                                                                                                                                                                   |
| `types.ts`   | `Choice`, `Question`, `QuestionGenerationCode`, `QuestionGenerationError`, `assertQuestion`                                                                                                                                                                                                                                           |
| `schemas.ts` | `SKILL_IDS`/`SkillId`, `CANNON_IDS`/`CannonId`, `ISLAND_IDS`/`IslandId`, `RANK_IDS`/`RankId`, `GRADE_BANDS`/`GradeBand`, `TEMPERAMENTS`/`Temperament`, `CHEST_RARITIES`/`ChestRarity`, `templateSchema`/`Template`, `skillSchema`/`Skill`, `cannonSchema`/`Cannon`, `islandSchema`/`Island`, `rankSchema`/`Rank`, `crewSchema`/`Crew` |

### 3.2 `types.ts` → `@content/schemas` resolves — VERIFIED

The wave's only cross-module import is `src/engine/questions/types.ts:9`:
`import type { SkillId } from '@content/schemas';`

`tsc --traceResolution` confirms it resolves to the real file, not a stub:

```
======== Resolving module '@content/schemas' from '.../src/engine/questions/types.ts'. ========
Module name '@content/schemas', matched pattern '@content/*'.
Trying substitution 'src/content/*', candidate module location: 'src/content/schemas'.
File '.../src/content/schemas.ts' exists - use it as a name resolution result.
======== Module name '@content/schemas' was successfully resolved to '.../src/content/schemas.ts'. ========
```

**Negative control** (a passing typecheck alone would not prove `SkillId` isn't silently
`any`): a temporary file assigning an invalid literal to `SkillId` was rejected —

```
error TS2322: Type '"definitely_not_a_skill"' is not assignable to type
'"add_within_10" | "add_within_20" | "sub_within_20" | "place_value_compare" |
 "mult_facts" | "two_step_add_sub" | "div_facts" | "fractions_int" | "multi_digit_order_ops"'.
```

The alias carries the genuine literal union across the engine/content boundary. The
probe file was deleted; the tree is clean.

### 3.3 Path aliases resolve for every file — VERIFIED

`@engine/*` and `@content/*` resolve under both toolchains: `tsc --noEmit` (via
`tsconfig.json` `paths`) and `vitest` (via `vitest.config.ts` `resolve.alias`). Both
map to the same targets, so there is no typecheck/runtime divergence.

### 3.4 Integration probe — 10/10 PASS

Written in the scratchpad (never in `src/` or `__tests__/`), run against the merged
tree, and **deleted afterward**. It exercised the realistic question-generation path
end-to-end, all three modules in one process:

1. `templateSchema.parse()` on an author-shaped template (T-003)
2. `createRng(20260728)` → `nextInt` per param, threading `Rng` state (T-001)
3. `evaluatePredicate` on each constraint, rejection-sampling until satisfied (T-002)
4. `evaluateNumber` on `answerExpr` and all three distractors (T-002)
5. `shuffle` the four choices (T-001)
6. Build a `Question` with `skill: SkillId` flowing from schema into engine type (T-003)
7. `assertQuestion` guard (T-003)

Additional probe assertions, all passing:

- **Determinism across the seam:** the same seed reproduces an identical sampled env and
  answer; a different seed does not.
- **Error taxonomies stay distinct in one process:** `ExprError('DIVISION_BY_ZERO')`,
  `QuestionGenerationError('INVALID_QUESTION')`, and `createRng`'s `RangeError` are all
  independently catchable and correctly typed.
- **`NON_FINITE_VALUE` propagates through a schema-validated expression** (`a * a`, `a = 1e200`).
- **`pick`/`weightedPick` compose over zod-validated catalog rows.**

**This is the substantive new information the wave lacked: the three modules compose
correctly, and the generation path they were designed for actually works.**

### 3.5 Engine runtime purity — VERIFIED

`src/engine/` contains no runtime reference to zod (`grep` hits are comments only) and no
`Math.random` (ARCHITECTURE.md §4.1 bans it). The type-only import is fully erased — a
runtime probe confirmed `@engine/questions/types` exports exactly
`['QuestionGenerationError', 'assertQuestion']`, so zod never enters the engine's runtime
module graph, satisfying T-003's Definition of Done.

---

# Part 4 — Architecture-drift check

### 4.1 Declared paths (§8) — NO DRIFT

| §8 declares                                                                              | Wave 1 built                                                                      | Verdict                                                                                                                                            |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/engine/rng.ts` — "seeded mulberry32"                                                | `src/engine/rng.ts`, mulberry32                                                   | Exact match                                                                                                                                        |
| `src/engine/questions/` — "template types, generator, distractors, safe constraint eval" | `questions/types.ts` (template types), `questions/expr.ts` (safe constraint eval) | Match — §8 declares the directory and its roles, not filenames; both files fill declared roles. Generator and distractors remain for a later wave. |
| `src/content/` — "JSON catalogs + zod schemas"                                           | `src/content/schemas.ts`                                                          | Match — schemas landed; JSON catalogs are a later wave.                                                                                            |

### 4.2 Boundary crossings — NONE UNDECLARED

The wave's only cross-boundary import is engine → content for the `SkillId` type. This is
explicitly sanctioned by §4.1, whose own `Template` sketch types the field as
`skill: SkillId`. It is `import type`, so the runtime dependency direction is empty and
§8's "PURE TS" constraint on `src/engine/` holds (verified in 3.5). No content → engine
import exists. No app/store/service layer is touched.

### 4.3 Contract changes

**(a) `ExprErrorCode` gained a 7th member, `NON_FINITE_VALUE` — NOT DRIFT.**

ARCHITECTURE.md describes T-002's subject only as "constraints?: string[] — tiny safe
evaluator over params" (§4.1). It never enumerates an error taxonomy, never names a single
error code, and never states how many there are. There is no documented contract to drift
_from_. Adding a code is a refinement strictly below the architecture's altitude — the
architecture's actual commitment ("a tiny safe evaluator") is more fully honored by a
sharper failure taxonomy, not violated by it. **No doc amendment needed.** The code is
specified where it belongs: T-002's ACs and frozen tests.

**(b) `createRng` now throws on out-of-range seeds instead of truncating — NOT DRIFT,
and correctly propagated.**

§4.1 commits only to "a seeded PRNG (mulberry32), seed carried in state" and §4.2 to the
seed surviving persistence. Both still hold — `Rng` remains a plain JSON-serialisable
`{state: number}`. The seed _domain_ is not specified at architecture altitude, so
rejecting a 40-bit seed rather than silently truncating it is an input-validation detail,
not a contract change against the document.

It **is** a real API-surface change for downstream consumers, and the important thing is
that it was not absorbed silently: the ledger shows commit `4ec6bf8`
("docs: warn T-013/T-021 that createRng now rejects wide seeds") already propagated it to
the affected tickets. That is the correct handling. Flagged here only for the record.

### 4.4 FINDING (Minor) — `templateSchema` accepts more distractors than the architecture allows

**Escalated, not absorbed. Not fixed by me — it is a semantic decision with an owner.**

ARCHITECTURE.md §4.1 is unambiguous: _"Answers are four-choice taps, universally. Every
question renders one correct answer plus three engineered distractors."_ Exactly three.

`src/content/schemas.ts:81` implements `distractors: z.array(z.string()).min(3)` — **at
least** three. A four-distractor template validates successfully. Confirmed empirically:

- `templateSchema.parse({...,  distractors: [4 items] })` → **succeeds**, `.toHaveLength(4)`
- the resulting five-choice `Question` → **rejected** by `assertQuestion` with
  `QuestionGenerationError('INVALID_QUESTION')` (it enforces `CHOICE_COUNT === 4`)
- `distractors: [2 items]` → correctly rejected

**Origin is the ticket spec, not the implementation.** `tickets/T-003.md:58` specifies
`distractors: string[] (>=3)` and AC-4 reads "at least three distractors". The implementer
built exactly what T-003 asked for, and the frozen tests pin `>=3`. The relaxation from
§4.1's "exactly three" into ">=3" happened at ticket-authoring time.

**Severity Minor, and why:** it fails safe — a bad template cannot ship a five-choice
question to a child, because `assertQuestion` (T-003's own guard) catches it, and §9's
golden tests would too. But it fails **late**, at generation time, rather than at content
validation time, which is precisely where the architecture put the catch. Two wave-1
modules disagree about the same invariant.

**Owner decision required — one of:**

1. Tighten to `.length(3)` and amend AC-4 (needs a repair ticket; frozen tests pin `>=3`, so the suite would need re-freezing), or
2. Amend ARCHITECTURE.md §4.1 if variable choice counts are genuinely wanted later, or
3. Accept as deliberate headroom and record the rationale — consistent with the
   already-documented `difficulty` field ("insurance for open question 2.10").

No repair ticket has been written, because this is not a gate failure and the resolution
depends on an intent the integrator cannot supply. **It must not be closed silently.**

---

# Part 5 — Bottom line

**PASS.** Three clean merges, all repo gates green, 492/492 tests, spec-lint green on all
three tickets, zero vulnerabilities, dependency manifests untouched, and — the thing this
wave had never had — empirical proof that the three modules compile and run together
along their real integration path.

One Minor architecture finding (4.4) is escalated to the owner with evidence and options.
Two candidate drifts (4.3a, 4.3b) were examined and judged to sit correctly below the
architecture's altitude, with reasoning recorded rather than waved through.

No `src/` or `__tests__/` file was modified by this integration.
