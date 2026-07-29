# T-020 — Duel reducer: TEST AGENT REPORT

| | |
| --- | --- |
| Status | `DONE` (RED) |
| Worktree | `.worktrees/wt-T-020` |
| Branch | `ticket/T-020-duel-reducer` |
| Phase | `tests` |
| Test file | `__tests__/engine/duel/reducer.test.ts` |
| `src/` touched | **no** (`reducer.ts` intentionally absent) |

---

## 1. Status

**DONE** — failing suite encodes AC-1…AC-24 and DoD-1…DoD-8. Module
`@engine/duel/reducer` is absent (Iron Law RED).

| Gate | Result |
| --- | --- |
| `bash .tdd-swarm/spec-lint.sh tickets/T-020.md` | **PASS** (AC-1…24 + DoD-1…8) |
| `npx vitest run __tests__/engine/duel/reducer.test.ts` | **RED** — exit 1; `Cannot find module '@engine/duel/reducer'` (0 tests collected) |
| `npx vitest run --exclude '__tests__/engine/duel/reducer.test.ts'` | **GREEN** — 21 files / **1674** passed |
| Prettier / ESLint on suite | **PASS** |

Suite SHA-256: `532cfd83959606757711f30d59379dc0ec35aede0a43bf153c10ef39c19048be`

---

## 2. Deliverable

| Path | Role |
| --- | --- |
| `__tests__/engine/duel/reducer.test.ts` | Frozen RED suite: transitions, answer matrix, terminals, no-ops, scripted duel, determinism, serialisation, purity |
| `.tdd-swarm/reports/T-020-tests.md` | This report |

Commit message: `test(T-020): failing tests for duel reducer`

---

## 3. Coverage map

| Criterion | What the suite pins |
| --- | --- |
| AC-1 | `countdown` + `ANIMATION_DONE` → `playerChoose`, `turnToken += 1` |
| AC-2 | in-loadout `CANNON_SELECTED` → `reload` with 4 distinct choices, `timerMs`, `recentTemplateIds[0]`, advanced `rng` |
| AC-3 | out-of-loadout cannon → `===` no-op |
| AC-4 | correct @ 90% timer → `resolvePlayer` volley, hull/tally/log via `resolveShot` expectation |
| AC-5 | wrong on `double_broadside` (volatile recoil > 0) → misfire, self-damage, attempts-only tally |
| AC-6 | wrong on `swivel_gun` (reliable) → both hulls unchanged |
| AC-7 | `TIMER_EXPIRED` deep-equals wrong `ANSWER_CHOSEN` at `elapsedMs === timerMs` |
| AC-8 | `choiceIndex` ∉ [0,3] or negative `elapsedMs` → `===` no-op |
| AC-9 | below perfect fraction → `perfectShot`, `perfectShots++`, `ballCount = BASE+1` |
| AC-10 | `enemyHull === 0` resolvePlayer → `victory` + result fields |
| AC-11 | `playerHull === 0` after volatile → `defeat` |
| AC-12 | both hulls > 0 → `rivalTurn`, `turnToken++`, `volleyNumber` unchanged |
| AC-13 | correct rival volley → player damage + rival log; `tally.totalAnswers` unchanged |
| AC-14 | rival cannon outside loadout → `===` no-op |
| AC-15 | resolveRival continue → `playerChoose`, `volleyNumber++`, `turnToken++` |
| AC-16 | hardcoded 8×5 out-of-phase matrix → reference identity (`dod(T-020:5)`) |
| AC-17 | `victory`/`defeat` ignore all five events |
| AC-18 | seed `0`, four perfect swivel volleys vs `port_sumwich` (45) + rival misses → victory, alternating log |
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
