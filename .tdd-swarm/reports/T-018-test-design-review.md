# T-018 — Independent Test-Design Review (pre-freeze)

## Verdict

**ACCEPT_WITH_NITS.** The suite faithfully encodes AC-1…AC-13 and DoD-1…DoD-7 with strong
paired-turn oracles, compile-time `Exact<>` pins, immutability and source-scan defences, and
clean missing-module RED. No Critical false-green paths were found. Residual gaps are narrow,
mostly already adjudicated, and do not block freeze.

## One-line summary

Scripted playback, exhaustion, validation, determinism, and hull arithmetic are well pinned;
optional nits cover AC-4’s false-only question scope, AC-6 index regex looseness, and AC-13’s
intentional arithmetic-only decoupling from the factory.

## Worktree verification

| Check | Observed |
| --- | --- |
| Worktree | `.worktrees/wt-T-018` |
| Branch | `ticket/T-018-onboarding-rival` |
| Test commit | `c88dc4b` (`test(T-018): failing tests for onboarding rival`) |
| Test file delta since commit | **0 lines** (docs-only `77194dc` on ticket) |
| Test file | `__tests__/engine/opponents/scripted.test.ts` |
| `src/engine/opponents/{types,scripted}.ts` | absent (expected RED) |
| Spec-lint | **PASS** — AC-1…13 + DoD-1…7 |
| Vitest scripted suite | **RED** — 1 failed suite / 0 tests collected (`Cannot find module '@engine/opponents/scripted'`) |
| Baseline excluding scripted | **1652** green (orchestrator) |

Orchestrator adjudications accepted as ground truth for this review:

1. `Opponent.id` is required — ticket authoritative over ARCHITECTURE.md §4.2 snippet omission.
2. Branch name is `ticket/T-018-onboarding-rival`.
3. AC-6: empty script → `RangeError`; invalid step → plain `Error` naming index.
4. AC-11: loadout membership asserted when scripted cannon is in loadout; off-loadout open.
5. Unpaired `chooseAction`/`produceAnswer` unspecified — do not require tests for that.
6. AC-13 is arithmetic-only against `ONBOARDING_ENEMY_HULL` (no full duel assembly).

## Critical findings

**None.** No behavioural AC would remain green while permitting an implementation that violates
the ticket’s core contract (scripted playback, last-step repeat, construction validation, no clock,
input immutability, Promise actor shape).

## Important findings

**None.** No gap maps to an explicit AC wording violation or a demonstrated high-likelihood
survivor that contradicts adjudicated ground truth.

## AC-by-AC discrimination

| AC | Encoded? | False-green / mutant risk? | Notes |
| --- | --- | --- | --- |
| **AC-1** | Yes — `170-184` | Low | Runtime `typeof` + `id` equality; compile-time `Exact<OpponentKeys, 'id' \| 'chooseAction' \| 'produceAnswer'>`. Empty `id` allowed (ticket silent). |
| **AC-2** | Yes — `191-201` | No | Three paired turns → ordered triples via `driveTurns` / `tripleOf`. Catches cursor skip, desynced action/answer, wrong ordering. |
| **AC-3** | Yes — `208-234` (2 tests) | No | Turns 4–5 repeat step 3 values; second test asserts no throw / no undefined subset. Catches throw-on-exhaustion and `undefined` fields. |
| **AC-4** | Yes — `241-261` | Low (N-1) | Ticket text limits to `correct: false` steps. Adversarial `correctIndex`/`choices` pin. True-step question blindness not AC-bound (see N-1). |
| **AC-5** | Yes — `268-271` | No | Empty script → `RangeError`. Distinct from AC-6 invalid-step class. |
| **AC-6** | Yes — `278-298` (2 tests) | Low (N-2) | Negative `elapsedMs` at index 1 → `Error` + `/1/` + not `RangeError`; unknown `cannonId` at index 0 → `Error` + `/0/`. Index regex is loose (N-2). |
| **AC-7** | Yes — `305-316` | No | Two factories, five turns, element-wise triple equality. Catches construction-time nondeterminism. |
| **AC-8** | Yes — `323-336` | Low (N-3) | Fake timers, `shouldAdvanceTime: false`, no advance — promises resolve. Catches `setTimeout` dependency. Microtask deferral would pass (N-3). |
| **AC-9** | Yes — `343-354` | Low (known) | Substring scan of all `.ts` under `src/engine/opponents/`. Ticket documents secondary defence; ESLint is authoritative. |
| **AC-10** | Yes — `361-377` | No | `elapsedMs: 0` edge; finite ≥ 0; `Object.keys` exactly `correct` + `elapsedMs`; compile-time answer key exactness. |
| **AC-11** | Yes — `384-400` | No | `Object.keys` exactly `cannonId`; membership when scripted cannon ∈ `rivalLoadout`. Off-loadout unconstrained per adjudication #4. |
| **AC-12** | Yes — `407-435` | No | All-incorrect script; two divergent `RivalView`s (hull, volley, loadout, recency) → identical triples. Catches view-driven cannon or answer drift. |
| **AC-13** | Yes — `442-460` | Low (N-4) | Floor volley `ceil(8 + ANSWER_QUALITY_FLOOR * 4)` vs `ONBOARDING_ENEMY_HULL`: >0 after 2, ≤0 after 3. Arithmetic-only per adjudication #6; does not call factory for hull math (N-4). |

## Script cursor / repeat-last / pairing

| Concern | Assessment |
| --- | --- |
| Paired `chooseAction` → `produceAnswer` | All behavioural turns use `driveTurn` — matches AC-2/3 wording. |
| Cursor ownership | Advance-on-`chooseAction` vs advance-on-`produceAnswer` indistinguishable under pairing; unpaired behaviour correctly out of scope (adjudication #5). |
| Double-advance per turn | Would skip script steps — AC-2 fails. |
| Action/answer desync | `tripleOf` binds cannon from action and answer fields from same turn — AC-2/3 fail. |
| Repeat-last | AC-3 explicitly drives turns 4–5 after exhausting 3-step script; values and no-throw covered. |

## Question-independence

| Concern | Assessment |
| --- | --- |
| False script steps vs Question | AC-4 — strong adversarial `correctIndex`/`choices`. |
| True script steps vs Question | AC-2 step 2 is `correct: true` but uses default `makeQuestion()` only. Ticket AC-4 text is false-only; implied script-driven semantics for true steps rely on AC-2 ordering, not question mutation. Residual text-parser mutant unlikely in engine code (N-1). |
| View vs Question | AC-12 covers view; AC-4 covers question — complementary, not redundant. |

## Clock / purity holes

| Check | Assessment |
| --- | --- |
| AC-8 no timer advance | Fake timers without `advanceTimersByTime` / `runAllTimers`. Hung promises if implementation schedules macrotasks. |
| AC-9 + DoD-5 source bans | Substring + `\b`-bounded regex overlap; known blind spots documented in ticket. |
| DoD-6 input immutability | Frozen script array + `structuredClone` snapshot after 4 turns (2-step script + repeat-last). Strong. |
| Hidden nondeterminism | AC-7 cross-instance replay. |

## Surviving mutants (traced, not run)

| Mutant | Would pass? | Why / which AC catches |
| --- | --- | --- |
| Throw on script exhaustion | No | AC-3 second test. |
| Return first step instead of last on exhaustion | No | AC-3 value assertions. |
| Read `Question.correctIndex` when script says `correct: false` | No | AC-4. |
| Read `Question` when script says `correct: true` only | **Likely yes** | AC-4 is false-only; default question aligns with step 2 `correct: true`. Low-impact; N-1. |
| `chooseAction` picks from `rivalLoadout` instead of script | No | AC-12 viewB loadout excludes scripted `swivel_gun`. |
| Mutate input `script` array | No | DoD-6 frozen-input probe. |
| Extra keys on `RivalAction` / `OpponentAnswer` | No | AC-10/11 `Object.keys` exactness. |
| Negative `elapsedMs` in valid script at runtime | No | AC-6 construction guard (if enforced at create). |
| `setTimeout(0)` deferral | No | AC-8 without timer advance — hang or timeout. |
| `queueMicrotask` deferral | **Yes** | AC-8 only requires resolution without timer advance. Nit N-3; still no wall-clock. |
| Broken factory but correct tuning constants | **Yes for AC-13 only** | Intentional per adjudication #6; all other ACs import factory. |
| Invalid step error without index in message containing `1` | **Maybe** | AC-6 negative-elapsed uses loose `/1/` — N-2. |
| Off-loadout scripted cannon returned | **Yes** | Adjudication #4 — open by design. |

## DoD / RED integrity

| DoD | Pre-implementation behaviour | Correct? |
| --- | --- | --- |
| dod(T-018:1) | PASS — static tag coverage | Yes |
| dod(T-018:2) | PASS — gates/skip meta | Yes |
| dod(T-018:3) | PASS — numbered dod tags | Yes |
| dod(T-018:4) | FAIL — module missing | Yes |
| dod(T-018:5) | FAIL — module / sources missing | Yes |
| dod(T-018:6) | FAIL — module missing | Yes |
| dod(T-018:7) | FAIL — `types.ts` / `scripted.ts` absent | Yes |

Entire suite fails at `@engine/opponents/scripted` import — **no vacuous GREEN** during RED
(unlike meta-only partial greens in content-ticket patterns).

## Nits (non-blocking)

- **N-1 — AC-4 false-only scope:** Matches ticket wording exactly. Test-plan prose (“not
  question-driven”) is broader; true-step question independence is not AC-bound. Optional
  hardening: one `correct: true` step with a question whose text/params could tempt parsing —
  not required for freeze.
- **N-2 — AC-6 index regex:** `/1/` and `/0/` do not require “index”/“step” tokens; could
  match unrelated numerals in a verbose message. Low risk given paired `Error` class assertions.
- **N-3 — AC-8 vs “immediately”:** Planning decision proposes instant resolution; AC-8 pins
  no timer advance only. Microtask-delayed promises would pass.
- **N-4 — AC-13 decoupling:** Hull arithmetic never calls `createScriptedOpponent`; fixture
  length/correctness checks are decorative. Correct per adjudication #6; overlaps T-004 AC-12 in
  `tuning.test.ts` by design for cross-ticket drift prevention.
- **DoD-5 duplicates AC-9:** Regex `\b` boundaries slightly stricter than AC-9 substring scan;
  harmless redundancy (T-016/T-017 pattern).
- **Two tests share `spec(T-018:AC-3)`:** Spec-lint counts tags, not unique AC coverage; both
  tests add distinct exhaustion assertions — acceptable.

## Over-constraint / out-of-scope checks

| Item | Verdict |
| --- | --- |
| `Opponent.id` compile-time exactness | Required per adjudication #1 — not over-freeze. |
| Unpaired / double-`produceAnswer` | Correctly omitted per adjudication #5. |
| AC-11 off-loadout cannon | Correctly open per adjudication #4. |
| Full onboarding duel assembly | Correctly out of scope; AC-13 arithmetic-only per adjudication #6. |
| DoD-7 exact file scope | Matches ticket `file_scopes`. |
| Duel-store driver / banded bot / ghost replay | Correctly out of scope. |

## Integrity

Only this review report was written. The frozen test file (`c88dc4b`) was not modified. No commit
was made. No scratch reference implementation was built under `src/`.
