# Wave 2 — Integration Report

**Integrator:** independent integration agent (wrote none of this code)
**Integration branch:** `swarm/engine-core`
**Tickets merged:** T-004 (central tuning constants), T-006 (content catalogs + validated loaders), T-026 (exactly-three distractors)
**Merged commit range:** `c5a3fc9..5ec09f6`
**Date:** 2026-07-28

---

## Verdict

| Dimension | Result |
| --- | --- |
| **Merges** | 3/3 clean — zero conflicts, textual or semantic |
| **Repo gate suite** | ALL GREEN |
| **Test suite** | **776 passed / 776**, 7 files, 1.52s |
| **Cross-ticket compatibility** | VERIFIED — first-ever co-compilation and co-execution, clean (19/19 probe assertions) |
| **Architecture drift** | **1 Minor finding**, escalated (not absorbed). 1 wave-1 finding CLOSED. 3 noted non-drift. |
| **Overall** | **PASS** |

---

# Part 1 — Merges

All three branches merged with `--no-ff` in ticket-id order. Every merge reported
"Merge made by the 'ort' strategy" with exit 0. **No conflict at any point**, so no
semantic conflict resolution was performed or required.

| Merge commit | Branch | Files added / changed |
| --- | --- | --- |
| `1eb39b7` | `ticket/T-004-tuning` | `src/engine/tuning.ts`, `__tests__/engine/tuning.test.ts` |
| `cd59688` | `ticket/T-006-catalogs` | `src/content/{skills,cannons,islands,ranks,crew}.json`, `src/content/index.ts`, `__tests__/content/catalogs.test.ts` |
| `5ec09f6` | `ticket/T-026-exact-distractors` | `src/content/schemas.ts` (1 line), `__tests__/content/schemas.test.ts` |

The three branches touched **strictly disjoint file sets** — T-006 and T-026 both live under
`src/content/` but T-026's only source edit is `schemas.ts:81`, which T-006 never touches.
That is why the merges were trivial despite the shared directory.

**Net wave-2 diff:** 11 files, 2,994 insertions, 1 deletion.

### Dependency-manifest check — PASS

```
git diff --quiet c5a3fc9..HEAD -- package.json package-lock.json   → exit 0
```

Both manifests are **byte-identical** to the wave-1 head. No dependency was added,
removed, or re-pinned by this wave. `zod` (the only runtime dependency, consumed by
T-006's loaders) predates the wave.

---

# Part 2 — Repo gate suite

Run on the fully merged tree at `5ec09f6`.

| Gate | Command | Exit | Key output |
| --- | --- | --- | --- |
| Tier-1 local gates | `.tdd-swarm/run-local-gates.sh` | **0** | `== ALL LOCAL GATES PASS ==` |
| ├ format | `npx prettier --check .` | 0 | `PASS  format` |
| ├ lint | `npx eslint . --max-warnings 0` | 0 | `PASS  lint` |
| ├ typecheck | `npx tsc --noEmit` | 0 | `PASS  typecheck` |
| ├ unit | `npx vitest run` | 0 | `PASS  unit` |
| ├ no-todos | grep `TODO\|FIXME\|HACK` | 0 | `PASS  no-todos` |
| ├ no-skipped-tests | grep `.skip\|.only` | 0 | `PASS  no-skipped-tests` |
| └ engine-purity | grep react/RN/expo/firebase in `src/engine` | 0 | `PASS  engine-purity` |
| spec-lint T-004 | `.tdd-swarm/spec-lint.sh tickets/T-004.md` | **0** | `== SPEC-LINT PASS ==` — 12/12 AC covered |
| spec-lint T-006 | `.tdd-swarm/spec-lint.sh tickets/T-006.md` | **0** | `== SPEC-LINT PASS ==` — 14/14 AC covered |
| spec-lint T-026 | `.tdd-swarm/spec-lint.sh tickets/T-026.md` | **0** | `== SPEC-LINT PASS ==` — 5/5 AC covered |
| dep-audit | `npm audit --audit-level=high` | **0** | `found 0 vulnerabilities` |

Spec-lint's reverse direction (every test file must cite at least one criterion) also passed
on all three runs, so no wave-2 test file is uncited.

### Test suite — 776, not the forecast 774

```
 ✓ __tests__/scaffold.test.ts                  (  1 test)
 ✓ __tests__/engine/questions/types.test.ts    ( 26 tests)
 ✓ __tests__/content/schemas.test.ts           ( 95 tests)
 ✓ __tests__/engine/rng.test.ts                ( 41 tests)
 ✓ __tests__/engine/tuning.test.ts             ( 70 tests)
 ✓ __tests__/content/catalogs.test.ts          (209 tests)
 ✓ __tests__/engine/questions/expr.test.ts     (334 tests)

 Test Files  7 passed (7)
      Tests  776 passed (776)
   Duration  1.52s
```

The dispatch brief forecast **774** = 492 + 68 + 209 + 5. Actual is **776**. The +2 is fully
accounted for and **legitimate** — it is not an unexplained test appearing or disappearing:

| Source | Forecast | Actual | Reconciliation |
| --- | --- | --- | --- |
| Wave 1 baseline | 492 | 492 | `1 + 26 + 90 + 41 + 334` — unchanged |
| T-026 | +5 | +5 | `schemas.test.ts` 90 → 95 |
| T-006 | +209 | +209 | exact |
| T-004 | +68 | **+70** | **AC-12 re-freeze, see below** |

The T-004 forecast of 68 was taken from `progress.md:535`/`:648`, which record the suite size at
**first** freeze. After first freeze, the independent code review found `ONBOARDING_ENEMY_HULL = 24`
sank the tutorial sloop in **two** volleys, not the three PLAN.md:75 promises. The orchestrator
amended AC-12 (`b2c7a4a`), the Test Author re-froze the suite (`9d592ba`, +2 tests: the
"no fewer than three volleys" floor and the "window is non-empty" guard), and only then did the
implementer change the constant (`6136bc3`, `src/engine/tuning.ts` only). Commit timestamps confirm
the order — spec 09:40 → test 09:43 → code 09:45, never the reverse. **`progress.md`'s 68 is stale
bookkeeping, not a defect**; it is corrected in this wave's ledger entry.

**Test-freeze discipline verified independently:** the only `__tests__/` paths touched across
`c5a3fc9..HEAD` are the three files each ticket owns, and the sole post-freeze test edit is the
authorised AC-12 re-freeze above. No implementer commit touches a test file.

---

# Part 3 — Cross-ticket compatibility

The three branches were built in isolated worktrees and had **never been compiled or executed
together**. This section is the wave's real risk surface.

`npx tsc --noEmit` passing on the merged tree is itself the first hard evidence: `tuning.ts`
imports `IslandId`/`GradeBand`/`ChestRarity` from `@content/schemas` and `index.ts` imports the
schemas T-026 modified, so all three ticket outputs sit in one type graph for the first time.

Beyond that, an **integration probe** was written in the scratchpad (never in `src/` or
`__tests__/`), run against the merged tree, and deleted. `git status --porcelain` is empty after
the run — the repo tree was not touched. **19/19 assertions passed**, 428ms.

### Probe A — `ENEMY_HULL_BY_ISLAND` × the islands catalog — PASS

The concern: T-004 types the record as `Record<IslandId, number>` against T-003's union, while
T-006 authors the islands. A missing or extra island is a compile error, and this is the first
time both sides exist together.

- Every one of the 5 `ENEMY_HULL_BY_ISLAND` keys resolves to a real catalog island, via both the
  array and the `getIsland` total helper.
- Every catalog island has a hull entry — no island shipped without tuning.
- The two keysets are **exactly equal**, and both equal `ISLAND_IDS`:
  `port_sumwich, isla_products, quotient_cove, fraction_reef, grandline`.
- Hull grows monotonically along the catalog's own `order` field: `45 → 60 → 75 → 95 → 120`.
  (T-004's own test asserted monotonicity against a *hardcoded* island order; this is the first
  check of it against the order T-006 actually authored.)

`port_sumwich = 45` also lands inside ARCHITECTURE §4.3's documented "starter sloops 40–50".

### Probe B — catalog referential integrity — PASS

- All 10 cannons' `skill` fields resolve in the skills catalog (`getSkill` throws for none).
- All islands' `rangeSkills` and `unlocksCannons` resolve; every `requiresIsland` resolves.
- Every range-unlocked cannon's `unlock.island` resolves.
- All 9 `SKILL_IDS` union members are actually authored — the union has no phantom members.
- All five catalogs imported without throwing and are non-empty, i.e. T-006's **import-time**
  validation ran against T-026's tightened schema module and passed.

### Probe C — T-026's tightening × T-006's catalogs — PASS

The stated risk: T-026 tightened `templateSchema` from `.min(3)` to `.length(3)` while T-006
authored its catalogs against the older schema. **Verified rather than assumed:**

- `templateSchema` **accepts** a valid 3-distractor template on the merged tree.
- It **rejects** a 4-distractor template — the tightening is live, not shadowed by the merge.
- It also rejects a 2-distractor template (the pre-existing lower bound still holds).
- **No shipped catalog entry across all five catalogs carries a `templates` or `distractors`
  field at all.** The interaction is genuinely inert, confirmed by inspection of every entry
  rather than by trusting "templates arrive in wave 5".

`schemas.ts` is also `.strict()` throughout, so a template smuggled into a catalog would be
rejected for the unknown key before the distractor count ever mattered — a second, independent
reason this cannot regress silently.

### Probe D — the headline fix: exactly 3 Swivel volleys — PASS

T-004's frozen tests **could not import `@content`** (T-006 was a same-wave sibling whose files did
not exist in T-004's worktree), so they hardcoded the Swivel's `8`/`12` damage range as literals.
That assumption had never been checked against the catalog. Closing that loop is the single most
load-bearing assertion in this report.

| Check | Result |
| --- | --- |
| Catalog `swivel_gun.damageMin` | **8** — matches T-004's hardcoded literal |
| Catalog `swivel_gun.damageMax` | **12** — matches T-004's hardcoded literal |
| `ONBOARDING_ENEMY_HULL` | 28 |
| Floor volley `ceil(8 + 0.35·(12−8))` | 10 → `2×10 = 20 < 28 ≤ 30 = 3×10` ⇒ **3 volleys** |
| Best volley `damageMax + PERFECT_SHOT_BONUS_DAMAGE` | 13 → `2×13 = 26 < 28 ≤ 39 = 3×13` ⇒ **3 volleys** |

The decisive check simulates **every legal per-volley damage for a correct answer**, 10 through 13
inclusive, draining a hull of 28 — and every single one takes **exactly 3 volleys**. The
three-volley promise is not merely satisfiable on the merged tree; it is satisfied across the
whole legal band, using T-006's real catalog numbers rather than T-004's assumed ones.

Two supporting relationships also hold: the tutorial (3 volleys) is strictly shorter than the
first real duel at `port_sumwich` (5 volleys, inside T-008 AC-13's required 4–6), and the Swivel
is a legal `starter` gun with `reliable` temperament and zero recoil — which is what makes the
T-018 rider ("the guided duel must restrict the player to the Swivel") satisfiable at all.

---

# Part 4 — Architecture drift

Judged against ARCHITECTURE.md §4.1, §4.3 (tuning as the single home for every magic number),
§4.4 (content catalogs), and §8 (project structure).

### Module placement vs §8 — CONFORMS

| §8 declares | Wave 2 ships | Verdict |
| --- | --- | --- |
| `src/engine/tuning.ts` — "every magic number, one file" | `src/engine/tuning.ts` | ✅ exact |
| `src/content/` — "JSON catalogs + zod schemas" | `{skills,cannons,islands,ranks,crew}.json`, `schemas.ts`, `index.ts` | ✅ |

`tuning.ts` depends on `@content/schemas` only via `import type`, so the import is fully erased at
runtime and zod never enters the engine module graph — the engine-purity gate confirms this.

### FINDING (Minor) — ESCALATED: `CHOICE_COUNT` now has two homes

**This is new drift, created by the wave-2 merge itself.**

```
src/engine/tuning.ts:120           export const CHOICE_COUNT = 4;   (T-004, wave 2)
src/engine/questions/types.ts:44   const CHOICE_COUNT = 4;          (T-003, wave 1 — module-local)
```

§4.3 states the rule absolutely: *"All tuning constants live in one file, `engine/tuning.ts`"*, and
§8 repeats it: *"every magic number, one file"*. `tickets/T-004.md:50` explicitly claims
`CHOICE_COUNT` for `tuning.ts`. When T-003 shipped, `tuning.ts` did not yet exist, so its private
copy was unavoidable and correct at the time. Wave 2 creates the duplication — **two sources of
truth for the same number, with no ticket assigned to collapse them.** T-005 and T-007 both consume
`CHOICE_COUNT` from T-004, so `types.ts` will keep its shadow copy indefinitely unless this is fixed.

**Why it matters concretely, beyond tidiness.** §4.3's stated purpose for the one-file rule is the
hidden dev slider screen: *"exposed on the hidden dev screen (`app/dev.tsx`) as sliders — this is how
day 5 tuning happens without rebuilds."* Moving `CHOICE_COUNT` on that slider changes `tuning.ts`
only; `assertQuestion` keeps validating against its own hardcoded `4` and throws
`INVALID_QUESTION` on every generated question. The failure is loud rather than silent, but it
defeats the exact capability §4.3 built the rule to protect.

**Severity: Minor.** Not a gate failure — both constants currently hold the same value, so nothing
is broken today. **No repair ticket written**, because the fix touches `src/engine/questions/types.ts`,
a wave-1 file that is already review-passed with frozen tests referencing it, and re-opening it is an
owner decision, not an integrator's. **Recommended resolution:** a small repair ticket making
`types.ts` import `CHOICE_COUNT` from `@engine/tuning` and deleting the local const — a one-line
change with no behavioural difference at the current value. **Must not be closed silently.**

### CLOSED — wave 1's escalated Minor finding

Wave 1 escalated: *"`templateSchema` is looser than §4.1 on distractor count"* — §4.1 requires
"one correct answer plus three engineered distractors" while `schemas.ts` implemented `.min(3)`,
letting a 4-distractor template parse only to be rejected later by `assertQuestion`. **T-026 closes
this**, and Probe C proves it closed on the merged tree. The owner chose the "tighten to `.length(3)`
and re-freeze" option of the three recorded. The invariant now fails at content-validation time,
which is where §4.1 put the catch, rather than late at generation time.

### NOT drift — `templateSchema` tightening to `.length(3)` — no doc amendment needed

§4.1's **prose** already fixes the count twice: *"one correct answer plus three engineered
distractors"* and *"compute answer + three distractors"*, under a heading that declares four-choice
taps *universally*. `CHOICE_COUNT = 4` in `tuning.ts` agrees. The `distractors: string[]` in §4.1's
TypeScript sketch is an illustrative type signature, not a cardinality specification — TS cannot
express a fixed-length array idiomatically there anyway, and the adjacent comment carries a
three-element example. `.length(3)` **encodes the documented prose exactly**; this is code moving
into alignment with the architecture, not away from it. Below the doc's altitude. No amendment.

### NOT drift — `ExprErrorCode`'s 7th member (`NON_FINITE_VALUE`) — no doc amendment needed

Concurring with wave 1's judgement, re-checked here and unchanged by wave 2. ARCHITECTURE.md
describes T-002's subject only as a *"tiny safe evaluator over params"* and never enumerates an
error taxonomy anywhere. There is no documented contract to drift from. An error taxonomy is an
implementation-level concern the architecture deliberately does not reach down to; a sharper one
honours the doc's actual commitment (a safe evaluator that fails rather than mis-evaluates). Below
the doc's altitude.

### Magic-number leakage — NONE

Audited explicitly, since this is §4.3's core rule and wave 2 is the wave that could break it:

- **`src/content/index.ts` contains zero numeric literals.** No thresholds, no counts, no bounds.
- **The catalogs contain only per-entity content attributes** — cannon `damageMin`/`damageMax`/
  `timerMs`/`recoilDamage`, island `order`, rank `minWins`/`tier`, skill `minGrade`/`maxGrade`.
  These are **not** §4.3 tuning constants, and the doc itself puts them in the catalog: §4.3's own
  damage formula reads `uniform(cannon.min, cannon.max)`, i.e. it sources the range from the cannon
  entry. §4.4 declares `cannons.json`/`islands.json`/`ranks.json` as the home for exactly this data.
  The dividing line — per-entity content in catalogs, cross-cutting feel-numbers in `tuning.ts` — is
  held cleanly by both tickets.
- Every cross-cutting constant T-004 owns (`ANSWER_QUALITY_FLOOR`, `PERFECT_SHOT_TIMER_FRACTION`,
  `MAX_PARAM_SAMPLE_ATTEMPTS`, `DISTRACTOR_MAX_RATIO`, `DISTRACTOR_ABS_FLOOR`,
  `MAX_DISTRACTOR_ATTEMPTS`) appears **nowhere in `src/` outside `tuning.ts`** — verified by grep.
  `CHOICE_COUNT` is the sole exception, and is the finding above.

### Minor doc-completeness note (not a wave-2 defect)

§4.4 enumerates `src/content/` as holding *"`cannons.json`, `islands.json`, `crew.json`,
`ranks.json`, `templates/<skill>.json`"* — it **omits `skills.json`**, which T-006 ships and which
§4.1 clearly requires (the per-skill `symbolicOnly` flag, `SkillId`, per-skill grade bands all live
there). The enumeration is itself at the doc's altitude, so its incompleteness is worth a one-line
amendment when §4.4 is next touched. T-006 is right to ship the file; the doc is the incomplete
party. `index.ts` is a loader, correctly below the enumeration's altitude, and `templates/<skill>.json`
is legitimately absent until wave 5. Recording this as an observation, not charging it to any ticket.

Also checked and clean: §4.4 says catalogs are *"zod-validated in a test"* while `index.ts` validates
at **import time** and throws. §2 resolves this — *"runtime validation of all content catalogs at
test time (and once at app boot in dev)"* — so import-time validation satisfies the documented
contract and is strictly stronger than the §4.4 phrasing alone. Not drift.

---

# Part 5 — Verdict

## PASS

- 3/3 merges clean, zero conflicts.
- Every repo gate green; `npm audit` reports 0 vulnerabilities; both dependency manifests
  byte-identical to the wave-1 head.
- 776/776 tests pass in 1.52s. The +2 over the 774 forecast is a documented, correctly-sequenced
  AC-12 re-freeze, not an anomaly.
- Cross-ticket compatibility verified by a 19-assertion integration probe against the merged tree,
  covering all three named risks. The headline three-volley onboarding fix holds across the entire
  legal Swivel damage band using T-006's real catalog numbers — including the confirmation that the
  catalog's `8`/`12` match the literals T-004's frozen tests were forced to hardcode.
- Wave 1's escalated `templateSchema` finding is **closed** by T-026 and proven closed.

**One Minor drift finding is open and escalated, not absorbed:** `CHOICE_COUNT` is duplicated
between `src/engine/tuning.ts` and `src/engine/questions/types.ts`, contradicting §4.3/§8's
one-file rule. It blocks nothing today and no code was patched by the integrator; it needs the
owner's decision on re-opening a wave-1 file.

**Wave 3 is clear to dispatch.**
