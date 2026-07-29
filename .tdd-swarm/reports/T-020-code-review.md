# T-020 — Senior Code Review

**Reviewer:** independent (did not write this code)  
**Date:** 2026-07-28  
**Branch:** `ticket/T-020-duel-reducer`  
**Feat commit:** `6ef7aaf` — `feat(T-020): duel reducer pure state machine`  
**Scope:** `src/engine/duel/reducer.ts` (+ allowlist fix `df8062f` in `__tests__/engine/duel/types.test.ts`, accepted)  
**Frozen suite:** SHA-256 prefix `80c4cdb1…` (AC-24/tsc fixes in `bd8bc4d` — accepted)  
**Orchestrator:** gates PASS; **1707/1707** full suite; reducer **33/33**

Green gates and the frozen suite are taken as given. This review re-derived the transition table,
checked orchestrator adjudications the suite does not pin, and probed purity / scope independently.

---

## Verdict

**APPROVE_WITH_NITS**

## One-line summary

Transition table, reference no-ops, `resolveShot` wiring, `bySkill`, rival recoil→`enemyHull`, and
enemy-first terminals all match the ticket and adjudications; only minor untested edges and a
non-finite `elapsedMs` hole remain.

---

## Verification checklist (orchestrator asks)

| Requirement | Result | Evidence |
| --- | --- | --- |
| **Transition table (complete)** | **PASS** | `reducer.ts:228-275` implements every ticket row and nothing else. `countdown→playerChoose` (`:233-237`), `playerChoose→reload` via `selectCannon` (`:239-243`), `reload→resolvePlayer` via `answerChosen` / `timerExpired` (`:245-251`), `resolvePlayer→*` via `afterResolvePlayer` (`:254-258`), `rivalTurn→resolveRival` (`:260-264`), `resolveRival→*` via `afterResolveRival` (`:266-270`), terminals frozen (`:272-274`). |
| **`===` no-ops** | **PASS** | Every out-of-phase branch returns `state` by reference (`:231`, `:241`, `:252`, `:256`, `:262`, `:268`, `:272-274`). Invalid loadout (`:86-88`), invalid answer payload (`:150-154`), invalid rival cannon (`:178-180`) also return `state`. AC-16 matrix and AC-3/8/14/17 are structurally satisfied. |
| **`resolveShot` wiring** | **PASS** | Player path (`:115-120`): `damageToEnemy`→`enemyHull`, `damageToSelf`→`playerHull`, `nextRng` threaded. Rival path (`:183-188`): `damageToEnemy`→`playerHull` as `damageToPlayer` (`:191-192`), recoil via `damageToSelf`→`enemyHull` (`:193`). No roll arithmetic in this module — only subtraction + `clampHull`. |
| **`bySkill` updates** | **PASS** | `updatePlayerTally` (`:45-64`) increments `attempts` on every player answer and `correct` only when graded correct; preserves other skills via spread. Called from `resolvePlayerAnswer` (`:124`) with `state.question.skill`. Rival path does not touch tally (AC-13). **Suite does not assert `bySkill`** — orchestrator adjudication verified here. |
| **Rival recoil → `enemyHull`** | **PASS** | `rivalAction` `:193`: `enemyHull = clampHull(state.enemyHull - outcome.damageToSelf)`. Symmetric with player recoil on `playerHull` (`:123`). Not AC-pinned; adjudication met. |
| **Terminals (enemy-first)** | **PASS** | `checkTerminal` (`:75-82`): `enemyHull <= 0` → `victory` before `playerHull <= 0` → `defeat`. Used identically from `afterResolvePlayer` and `afterResolveRival`. `makeResult` copies live `tally` and `volleyNumber` (`:66-71`). |
| **Purity** | **PASS** | No `Math.random`, `Date`, `await`, or React imports (`grep` clean). Stateless helpers; `duelReducer` is a pure `(state, event) → state` function. AC-22 non-mutation pattern: spreads `coreOf`, appends new log arrays, never mutates input. |
| **`file_scopes`** | **PASS** (nit) | Production scope is exactly one new file: `src/engine/duel/reducer.ts`. Feat commit `6ef7aaf` also adds `.tdd-swarm/reports/T-020-implementation.md` (swarm artifact — project norm, not a production leak). Allowlist amend `df8062f` is a separate test commit, pre-accepted. |

---

## Acceptance criteria (24/24 via frozen suite)

All 24 ACs have passing `spec(T-020:AC-n)` tests; spec-lint and orchestrator gates confirm coverage.
Independent spot-checks on the highest-risk ACs:

| AC | Verdict | Notes |
| --- | --- | --- |
| AC-1, AC-2, AC-12, AC-15 | **met** | Turn-token and volley stamping match table (`turnToken++` on countdown exit, resolvePlayer→rivalTurn, resolveRival→playerChoose with `volleyNumber++`). |
| AC-4–AC-9 | **met** | Answer matrix delegates grading to `resolveShot`; timeout aliases wrong answer at `timerMs` (`:160-162`). |
| AC-10, AC-11, AC-23 | **met** | `clampHull` at apply time (`:41-43`, `:122-123`, `:192-193`); terminals read already-clamped hulls. |
| AC-13, AC-14 | **met** | Rival damage and log; tally unchanged; out-of-loadout no-op. |
| AC-16, AC-17 | **met** | Exhaustive 8×5 reference matrix + frozen terminals. |
| AC-18–AC-20 | **met** | Scripted duel, 20× replay determinism, JSON round-trip mid-fight. |
| AC-21 | **met** | Missing template pool → `generateQuestion` throws `QuestionGenerationError` / `NO_TEMPLATE` (`:91-96`). |
| AC-22 | **met** | Immutability probe across all table transitions. |
| AC-24 | **met** | Hardcoded phase/event literals in test file. |

**24/24 met. Zero cannot-verify.**

---

## Definition of Done

| Item | Verdict | Evidence |
| --- | --- | --- |
| Every AC tagged and passing | met | 33 tests; spec-lint 24/24 + 8 DoD |
| Local gates green | met | orchestrator + re-run reducer suite 33/33 |
| Pure reducer, no ambient randomness | met | source scan |
| Reference no-ops | met | see checklist |
| Hull clamp at apply, tally player-only | met | `clampHull` + `updatePlayerTally` only on player answers |
| Damage via `@engine/duel/damage` | met | `resolveShot` only |
| Files in `file_scopes` | met (nit) | production file only; report bundled in feat commit |

**8/8 met** (report bundling is a documented nit, not a blocker).

---

## Architecture alignment

- **§4.2 state machine:** Eight phases, five events, discriminated union transitions — matches ticket table verbatim.
- **§4.2 no-op rule:** Reference identity, not structural copy — implemented correctly for React store skip.
- **§4.2 turn token:** Incremented when entering wait states (`playerChoose`, `rivalTurn`) via exit handlers — equivalent to the planning decision.
- **§3.2 purity:** All game logic outside React; reducer is synchronous and total on well-formed pairs.
- **§9.2 test matrix:** Correct, volatile backfire, reliable miss, timeout, perfect shot — all routed through `resolvePlayerAnswer` + `resolveShot`.
- **Planning / adjudications:** `bySkill` populated on player answers; rival `damageToSelf` hits `enemyHull`; both-hulls-≤0 resolves enemy-first — all present in source.

---

## Strengths

1. **Table-faithful switch** — No hidden phases, no re-answer path, no scope creep toward T-022 Double-Shot.
2. **`coreOf` extraction** — Phase-specific fields stripped cleanly on every rebuild; terminal helper is shared and DRY.
3. **Damage delegation** — Player and rival paths both call `resolveShot`; POV mapping is explicit in comments (`:190-193`).
4. **`updatePlayerTally`** — Correct partial-record merge for `bySkill`; orchestrator contract satisfied though untested.
5. **Invalid-payload guards** — Integer `choiceIndex` in `[0,3]` and non-negative `elapsedMs` before grading (`:150-154`).
6. **Immutability discipline** — New arrays only where appended (`actionLog`, `recentTemplateIds`); tallies rebuilt as new objects.

---

## Findings

Severity summary: **Critical 0 · Important 0 · Minor 3 · Observations 2**

### Critical

**None.**

### Important

**None.** No AC violation, no transition-table gap, no damage bypass, no reference-equality breach in the implemented paths.

### Minor (non-blocking)

| ID | Finding | Recommendation |
| --- | --- | --- |
| **M1** | **`bySkill` and rival volatile recoil are adjudication-only** — correct in source (`:45-64`, `:193`) but not asserted by any frozen test. A regression would green the suite. | Optional follow-up test in a future wave, or rely on T-024 integration / store contract tests. Not blocking merge. |
| **M2** | **Non-finite `elapsedMs` is not a no-op** — `answerChosen` rejects only `elapsedMs < 0` (`:153-154`); `NaN` / `Infinity` pass through to `resolveShot`, which throws `RangeError`. Ticket promises totality on *well-formed* pairs; AC-8 pins only negative/`choiceIndex` cases. | Accept as engine norm (matches T-008 input guard split), or add `Number.isFinite(elapsedMs)` to the no-op guard if the driver should never throw from reducer. |
| **M3** | **Feat commit bundles implementation report** — `6ef7aaf` touches `.tdd-swarm/reports/T-020-implementation.md` in addition to `reducer.ts`. DoD wording says `file_scopes` exactly; swarm reports are project convention. | No action required; note for audit trail only. |

### Observations

| ID | Note |
| --- | --- |
| **O1** | `checkTerminal` does not re-clamp hulls — safe on all reachable paths because damage apply already uses `clampHull`; corrupted input states could surface negative hulls in a terminal phase. Out of scope for well-formed pairs. |
| **O2** | `selectCannon` uses `templatesBySkill[cannon.skill] ?? []` — missing key and empty pool both throw `NO_TEMPLATE`; matches AC-21 intent. |

---

## Iron Law — unrequested surface

**Clean.** Single export `duelReducer`. Helpers are module-private. No store driver, no mastery call, no coin payout, no replay module, no Double-Shot anticipation. Imports are limited to content, damage, types, and question generator as required by the table.

---

## Gate re-verification (review time)

| Check | Result |
| --- | --- |
| `vitest run __tests__/engine/duel/reducer.test.ts` | **33 / 33** |
| Purity grep on `reducer.ts` | clean |
| Transition table manual trace | complete |
| Orchestrator adjudications | all three verified in source |

---

## Merge recommendation

**Merge.** The reducer is a faithful, pure implementation of the locked transition table. Orchestrator adjudications (`bySkill`, rival recoil symmetry, enemy-first terminals) are correctly wired despite lacking dedicated AC pins. Residual items are documentation / defensive-validation nits, not spec defects.
