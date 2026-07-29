# T-020 — Duel reducer: TEST AGENT REPORT

| | |
| --- | --- |
| Status | `DONE` (RED) — test-design nits I-1…I-3 closed |
| Worktree | `.worktrees/wt-T-020` |
| Branch | `ticket/T-020-duel-reducer` |
| Phase | `tests` |
| Test file | `__tests__/engine/duel/reducer.test.ts` |
| `src/` touched | **no** (`reducer.ts` intentionally absent) |
| Prior suite | `d43dfd7` |
| Review | `.tdd-swarm/reports/T-020-test-design-review.md` (`ACCEPT_WITH_NITS`) |

---

## 1. Status

**DONE** — failing suite encodes AC-1…AC-24 and DoD-1…DoD-8. Module
`@engine/duel/reducer` is absent (Iron Law RED). Important findings from the
independent test-design review are closed in this revision.

| Gate | Result |
| --- | --- |
| `bash .tdd-swarm/spec-lint.sh tickets/T-020.md` | **PASS** (AC-1…24 + DoD-1…8) |
| `npx vitest run __tests__/engine/duel/reducer.test.ts` | **RED** — exit 1; `Cannot find module '@engine/duel/reducer'` (0 tests collected) |
| `npx vitest run --exclude '__tests__/engine/duel/reducer.test.ts'` | **GREEN** — 21 files / **1674** passed |
| Prettier / ESLint on suite | **PASS** |

---

## 1b. Test-design nits closed (Important)

| # | Fix |
| --- | --- |
| **I-1** | Added `resolveRival` + `ANIMATION_DONE` → `defeat` (`playerHull: 0`, `enemyHull > 0`) tagged `spec(T-020:AC-11)`, plus symmetric `resolveRival` → `victory` (`enemyHull: 0`) tagged `spec(T-020:AC-10)`. |
| **I-2** | AC-5 and AC-9 now precompute `resolveShot(...)` with the same inputs and assert `next.outcome.toEqual(expectedOutcome)` (mirrors AC-4). AC-5 also pins self-damage from `expectedOutcome.damageToSelf`. |
| **I-3** | Scripted-duel driver asserts `playerHull` unchanged (still `PLAYER_HULL`) after every rival miss `RIVAL_ACTION` and again after the following `ANIMATION_DONE`; AC-18 also asserts final `playerHull === PLAYER_HULL`. |

---

## 2. Deliverable

| Path | Role |
| --- | --- |
| `__tests__/engine/duel/reducer.test.ts` | Frozen RED suite: transitions, answer matrix, terminals, no-ops, scripted duel, determinism, serialisation, purity |
| `.tdd-swarm/reports/T-020-tests.md` | This report |

Commits:
- `d43dfd7` — `test(T-020): failing tests for duel reducer`
- (this) — `test(T-020): pin resolveRival defeat, resolveShot oracles, rival-miss hull`

---

## 3. Coverage map

| Criterion | What the suite pins |
| --- | --- |
| AC-1 | `countdown` + `ANIMATION_DONE` → `playerChoose`, `turnToken += 1` |
| AC-2 | in-loadout `CANNON_SELECTED` → `reload` with 4 distinct choices, `timerMs`, `recentTemplateIds[0]`, advanced `rng` |
| AC-3 | out-of-loadout cannon → `===` no-op |
| AC-4 | correct @ 90% timer → `resolvePlayer` volley, hull/tally/log via `resolveShot` expectation |
| AC-5 | wrong on `double_broadside` → full `resolveShot` outcome oracle + recoil/tally/log |
| AC-6 | wrong on `swivel_gun` (reliable) → both hulls unchanged |
| AC-7 | `TIMER_EXPIRED` deep-equals wrong `ANSWER_CHOSEN` at `elapsedMs === timerMs` |
| AC-8 | `choiceIndex` ∉ [0,3] or negative `elapsedMs` → `===` no-op |
| AC-9 | below perfect fraction → full `resolveShot` outcome oracle + perfect flags/tally |
| AC-10 | `enemyHull === 0` at `resolvePlayer` **and** `resolveRival` → `victory` + result fields |
| AC-11 | `playerHull === 0` at `resolvePlayer` **and** `resolveRival` → `defeat` |
| AC-12 | both hulls > 0 → `rivalTurn`, `turnToken++`, `volleyNumber` unchanged |
| AC-13 | correct rival volley → player damage + rival log; `tally.totalAnswers` unchanged |
| AC-14 | rival cannon outside loadout → `===` no-op |
| AC-15 | resolveRival continue → `playerChoose`, `volleyNumber++`, `turnToken++` |
| AC-16 | hardcoded 8×5 out-of-phase matrix → reference identity (`dod(T-020:5)`) |
| AC-17 | `victory`/`defeat` ignore all five events |
| AC-18 | seed `0`, four perfect swivel volleys vs `port_sumwich` (45) + rival misses → victory, alternating log; rival misses leave `playerHull === PLAYER_HULL` |
| AC-19 | same sequence × 20 → deep-equal finals |
| AC-20 | every mid-duel state JSON round-trip + next event equals live path |
| AC-21 | missing skill templates → `QuestionGenerationError` / `NO_TEMPLATE` |
| AC-22 | every table transition: new object; input JSON + array refs unchanged |
| AC-23 | overkill clamps at `resolvePlayer`/`resolveRival` (enemy 5→0, player 3→0) |
| AC-24 | `EXPECTED_PHASES` / `EXPECTED_EVENT_TYPES` are quoted literals, not `DUEL_PHASES` derivations |
| DoD-4/7/8 | arity-2 purity source bans; `resolveShot` import; duel dir = `damage+reducer+types` |

Fixtures: schema-parsed `add_within_10` + `two_step_add_sub` templates; catalog cannons
(`swivel_gun`, `double_broadside`, `six_pounder`); hand-built per-phase states for the no-op matrix.

Scripted-duel seed `0` was selected offline with `generateQuestion` + `resolveShot` so four perfect
swivel volleys deal `13+13+12+13` (alive after 3 at hull 7; sunk on 4).

---

## 4. Ambiguities for orchestrator adjudication

1. **`DuelTally.bySkill` updates** — Planning decision says the reducer records per-skill tallies, but
   no AC asserts `bySkill` increments. Suite follows the ACs only. Confirm whether implementer must
   update `bySkill` (and whether a follow-up AC is needed).
2. **Rival misfire / volatile recoil** — Transition table only says “apply damage to `playerHull`”.
   Suite uses `correct: false` + standard `six_pounder` so recoil-to-enemy is untested. Clarify if
   rival volatile misfire should decrement `enemyHull` via `damageToSelf`.
3. **Both hulls ≤ 0** — Terminal order is enemy-first then player. No AC drives a state where both
   are already ≤ 0; suite does not pin the tie-break beyond AC-10/AC-11 separately.
4. **DoD-1/2/3/8 lack `[process]` markers** — Spec-lint enforces them; suite uses T-018-style meta
   tags. Consider marking pure process items `[process]` in the ticket to avoid over-claiming.
5. **AC-7 “except” clause** — Wording says the states are deeply equal *except* recorded
   `elapsedMs` is `timerMs` in both (vacuous). Suite asserts full deep equality.
6. **AC-11 construction** — Uses a hand-built `resolvePlayer` with `playerHull: 0` rather than
   driving recoil from `reload`. Pins the terminal transition; does not re-prove AC-5’s apply path.

---

## 5. Out of scope (per ticket)

Double-Shot (T-022), invariant fuzz / replay (T-024), `useDuelStore` driver, coin/mastery/rank
application, animation/VFX, `src/stores/duel.ts`.
