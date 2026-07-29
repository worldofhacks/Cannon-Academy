# T-020 — Independent Test-Design Review (pre-freeze)

## Verdict

**ACCEPT_WITH_NITS.** The suite faithfully encodes AC-1…AC-24 and DoD-1…DoD-8 with strong
`resolveShot` oracles on the primary volley paths, an exhaustive 8×5 reference-equality matrix,
scripted-duel integration (determinism + mid-duel serialisation), immutability probes, and clean
missing-module RED. No Critical false-green paths were found. Residual gaps are narrow, mostly
already adjudicated, and do not block freeze.

## One-line summary

Transition table, answer matrix, no-op contract, and scripted victory are well pinned; nits cover
the untested `resolveRival` → `defeat` terminal, lighter `resolveShot` oracles on misfire/perfect
paths, and AC-18’s tolerance of wrong rival-miss damage.

## Worktree verification

| Check | Observed |
| --- | --- |
| Worktree | `.worktrees/wt-T-020` |
| Branch | `ticket/T-020-duel-reducer` |
| Test commit | `d43dfd7` (`test(T-020): failing tests for duel reducer`) |
| Test file | `__tests__/engine/duel/reducer.test.ts` |
| `src/engine/duel/reducer.ts` | absent (expected RED) |
| Spec-lint | **PASS** — AC-1…24 + DoD-1…8 |
| Vitest reducer suite | **RED** — 1 failed suite / 0 tests collected (`Cannot find module '@engine/duel/reducer'`) |
| Baseline excluding reducer | **1674** green (orchestrator) |

Orchestrator adjudications accepted as ground truth for this review:

1. `bySkill` updates required in implementation but not AC-asserted — suite may omit.
2. Rival volatile recoil → `enemyHull` symmetric intent not pinned — standard-miss rival path only.
3. Both-hulls ≤ 0 tie-break enemy-first — no extra AC required.
4. AC-7 full deep-equality and AC-11 hand-built `playerHull: 0` accepted.
5. DoD process-style items may use T-018 meta-tag pattern without `[process]` markers.

## Critical findings

**None.** No behavioural AC would remain green while permitting an implementation that violates
the ticket’s core contract (eight phases, five events, no-op reference identity, damage via
`resolveShot`, player-only tally, terminal victory on sink, scripted duel determinism).

## Important findings

| # | Location | Issue |
| --- | --- | --- |
| I-1 | AC-10/AC-11 vs Context terminal table | **`resolveRival` → `defeat` terminal untested.** Context requires identical terminal checks at both `ANIMATION_DONE` exits. AC-10 pins `resolvePlayer` → `victory`; AC-11 pins `resolvePlayer` → `defeat` (hand-built). AC-15 covers the continue path from `resolveRival`; AC-23 clamps `playerHull` after `RIVAL_ACTION` but never drives `ANIMATION_DONE` → `defeat` when `playerHull <= 0`. A mutant that applies terminal checks only on the `resolvePlayer` exit would likely survive the full suite. Symmetric to AC-10/AC-11 in intent; low freeze risk given AC-10 establishes the pattern, but this is the largest untested transition in the table. |
| I-2 | AC-5, AC-9 (`532-564`, `624-645`) | **Misfire / perfect paths lack `resolveShot` outcome oracles.** AC-4 and AC-13 pin full `outcome` via pre-computed `resolveShot(...)` expectations. AC-5 asserts `kind`, catalog `recoilDamage`, and tally/log fields but not `next.outcome === resolveShot(...)`. AC-9 asserts `perfectShot`, `ballCount`, and tally only. An implementer could inline misfire/perfect arithmetic while still calling `resolveShot` incorrectly (or partially) on those paths and remain green until DoD-7 source scan at implementation time. |
| I-3 | AC-18 rival miss loop (`400-407`) | **Rival `correct: false` never asserts zero player damage.** AC-13 pins damage on a correct rival volley. The scripted duel uses three standard-miss rival volleys; with `PLAYER_HULL = 100` and `six_pounder` max 16, wrongly applying hit damage on miss (~39 total) still leaves the player alive and AC-18 green. Isolated rival-miss behaviour is therefore under-pinned (consistent with adjudication #2 for volatile recoil, but hit-on-miss is a separate bug class). |

## AC-by-AC discrimination

| AC | Encoded? | False-green / mutant risk? | Notes |
| --- | --- | --- | --- |
| **AC-1** | Yes — `422-432` | No | Phase + exact `turnToken + 1`; `not.toBe(start)`. |
| **AC-2** | Yes — `434-451` | Low | Four distinct choices, `timerMs`, `recentTemplateIds[0]`, rng advanced via inequality on object and `.state`. Does not oracle question text/params (AC silent). |
| **AC-3** | Yes — `453-457` | No | Reference no-op for out-of-loadout cannon. |
| **AC-4** | Yes — `493-530` | No | Strong: `outcome.toEqual(expectedOutcome)` from `resolveShot` with shared starting `rng`; hull/tally/log pinned. |
| **AC-5** | Yes — `532-565` | Low (I-2) | Volatile misfire path; recoil from catalog not `resolveShot` oracle. Catches wrong kind, hull directions, tally split. |
| **AC-6** | Yes — `567-584` | Low | Matches AC wording exactly (hulls unchanged, `resolvePlayer`). AC silent on tally/log — not over/under-freeze. |
| **AC-7** | Yes — `586-613` | No | JSON-cloned parallel paths; full deep equality; explicit `elapsedMs === timerMs` on log entries. Adjudication #4 accepted. |
| **AC-8** | Yes — `615-622` | No | Four invalid payloads → reference no-op. |
| **AC-9** | Yes — `624-645` | Low (I-2) | Boundary `elapsedMs = fraction * timerMs - 1`; pins perfect flags without full outcome oracle. |
| **AC-10** | Yes — `653-676` | No | Hand-built `enemyHull: 0` at `resolvePlayer`; result fields + clamp. |
| **AC-11** | Yes — `678-697` | Low | Hand-built `playerHull: 0` — pins terminal transition only, not AC-5 apply path. Adjudication #4 accepted. |
| **AC-12** | Yes — `459-471` | No | Continue path; `turnToken++`, `volleyNumber` unchanged. |
| **AC-13** | Yes — `757-791` | No | Strong `resolveShot` damage oracle; rival log shape; tally unchanged. |
| **AC-14** | Yes — `793-800` | No | Out-of-loadout rival cannon → reference no-op. |
| **AC-15** | Yes — `473-485` | No | Continue path; `volleyNumber++`, `turnToken++`. |
| **AC-16** | Yes — `808-821` | No | Hardcoded 8×5 matrix; each out-of-phase pair → `===` input. Includes victory/defeat (all events no-op). `dod(T-020:5)` co-tagged. |
| **AC-17** | Yes — `823-833` | No | Redundant with AC-16 for terminals; harmless reinforcement. |
| **AC-18** | Yes — `841-855` | Low (I-3) | Seed `0`, four perfect swivel volleys vs hull 45; alternating log; `result.volleys === 4`. Seed claim documented in report; offline proof not re-run (module absent). |
| **AC-19** | Yes — `857-865` | No | 20× replay deep equality on scripted path. |
| **AC-20** | Yes — `867-911` | No | Every pre-event state in scripted plan: JSON round-trip + next event equals live path. |
| **AC-21** | Yes — `919-939` | No | `QuestionGenerationError` / `NO_TEMPLATE`; dispatches twice (throw + catch) — fine. |
| **AC-22** | Yes — `947-1003` | Low | Seven table transitions; JSON + array ref identity on input. No-op transitions correctly excluded. `rng` covered indirectly via JSON snapshot. |
| **AC-23** | Yes — `699-749` | No | Overkill clamp at `resolvePlayer` and `resolveRival` before terminal; pre-checks `damageToEnemy > hull` via `resolveShot`. Rival field naming correct (player is rival’s “enemy”). |
| **AC-24** | Yes — `1011-1035` | No | Source-regex literal arrays; anti-derivation guards. |

## Cross-cutting review axes

### False greens / reference equality

| Concern | Assessment |
| --- | --- |
| No-op `===` vs structural clone | AC-3, AC-8, AC-14, AC-16, AC-17 all assert reference identity. AC-22 correctly requires `not.toBe` only for in-table transitions. |
| Hand-built terminal states | AC-10/AC-11 bypass apply paths; AC-5 + AC-23 cover apply-time clamp/damage. Accepted per adjudication #4. |
| DoD meta-only greens | dod(T-020:6) delegates to AC-13/AC-23 tags — honest per adjudication #5. dod(T-020:1-3) are process coverage counters. |

### Missing mutants (traced, not run — module absent)

| Mutant | Would pass? | Which AC catches / gap |
| --- | --- | --- |
| Terminal check only on `resolvePlayer` exit | **Likely yes** | I-1 — no `resolveRival` → `defeat` test |
| Skip `resolveShot` on misfire; hardcode recoil | **Likely yes** | AC-5 pins behaviour not oracle; DoD-7 at impl |
| Skip `resolveShot` on perfect path | **Maybe** | AC-9 partial; AC-4 pins volley path |
| Apply hit damage on rival miss | **Likely yes** if ≤ ~48 total | I-3 — AC-18 tolerant |
| Rival volatile recoil → `enemyHull` | **Yes** | Adjudication #2 — out of scope |
| Omit `bySkill` updates | **Yes** | Adjudication #1 — code review |
| Both hulls ≤ 0 → wrong winner | **Yes** | Adjudication #3 — no AC |
| Out-of-phase returns shallow copy | **No** | AC-16 matrix |
| Mutate input arrays | **No** | AC-22 ref + JSON checks |
| `TIMER_EXPIRED` differs from wrong answer | **No** | AC-7 deep equality |
| Clamp only at terminal, not apply | **No** | AC-23 intermediate phases |
| Tally increments on rival volley | **No** | AC-13 |
| Non-deterministic reducer | **No** | AC-19 |
| State lost on JSON round-trip | **No** | AC-20 (`Rng` is `{ state: number }`) |

### `resolveShot` wiring

| Path | Oracle strength |
| --- | --- |
| Player correct volley (AC-4) | **Strong** — full outcome equality |
| Player misfire volatile (AC-5) | **Moderate** — kind + catalog recoil |
| Player reliable miss (AC-6) | **Weak by AC design** — hulls only |
| Perfect shot (AC-9) | **Moderate** — flags, not full outcome |
| Rival hit (AC-13) | **Strong** — damage from `resolveShot` |
| Overkill clamp (AC-23) | **Strong** — pre/post with `resolveShot` |
| DoD-7 source scan | Requires `resolveShot` import and bans inline tuning constants |

### Terminal order

Enemy-first when both hulls ≤ 0 is documented in Context but untested — accepted per adjudication #3. AC-10 and AC-11 exercise each condition in isolation.

### Purity / serialisation / scripted duel

| Check | Assessment |
| --- | --- |
| Determinism | AC-19 — 20 replays |
| Mid-duel kill/relaunch | AC-20 — stepwise JSON round-trip on full scripted plan |
| Immutability | AC-22 — all seven table transitions |
| Scripted soundness | AC-18 — log alternation, volley counts, victory; drives AC-19/AC-20 |
| Literal enumerations | AC-24 — freeze-safe for T-022 sixth event |

## DoD / RED integrity

| DoD | Pre-implementation behaviour | Correct? |
| --- | --- | --- |
| dod(T-020:1) | Untestable until import resolves | Meta — counts tags |
| dod(T-020:2) | Untestable until import resolves | Meta — gates/skip scan |
| dod(T-020:3) | Untestable until import resolves | Meta — dod numbering |
| dod(T-020:4) | Untestable until import resolves | Requires `reducer.ts` + purity bans |
| dod(T-020:5) | Untestable until import resolves | Co-tagged on AC-16 |
| dod(T-020:6) | Untestable until import resolves | Meta delegate to AC-13/AC-23 |
| dod(T-020:7) | Untestable until import resolves | Source import/`resolveShot` scan |
| dod(T-020:8) | Untestable until import resolves | File-scope dir listing |

Entire suite fails at `@engine/duel/reducer` import — **no vacuous GREEN** during RED. DoD-4/7/8
correctly activate once the implementer adds `reducer.ts` (T-018 pattern).

## Nits (non-blocking)

- **N-1 — AC-11 hand-built defeat:** Accepted per adjudication #4; AC-5 covers volatile apply path separately.
- **N-2 — AC-17 overlaps AC-16:** Victory/defeat no-ops tested twice — harmless.
- **N-3 — AC-18 seed offline proof:** Comment claims `13+13+12+13` on seed `0`; not re-verified in this review (module absent). Wrong seed would fail loudly at implementation — test bug, not false green.
- **N-4 — `bySkill` omitted:** Accepted per adjudication #1.
- **N-5 — DoD without `[process]`:** Accepted per adjudication #5; T-018 meta pattern.
- **N-6 — AC-6 tally/log silent:** Matches AC wording; not a suite defect.

## Over-constraint / out-of-scope checks

| Item | Verdict |
| --- | --- |
| `bySkill` assertion | Correctly omitted per adjudication #1 |
| Rival volatile recoil | Correctly omitted per adjudication #2 |
| Both-hulls tie-break | Correctly omitted per adjudication #3 |
| Double-Shot / T-022 | AC-24 literal freeze is intentional |
| `useDuelStore` driver | Correctly out of scope |
| Replay module | Correctly out of scope (T-024) |

## Integrity

Only this review report was written. The frozen test file at commit `d43dfd7` was not modified. No
commit was made. No scratch reference implementation was built under `src/`.
