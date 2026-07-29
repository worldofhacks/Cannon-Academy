# T-018 — Opponent interface & scripted onboarding rival: TEST AGENT REPORT

| | |
| --- | --- |
| Status | `DONE` (RED) |
| Worktree | `.worktrees/wt-T-018` |
| Branch | `ticket/T-018-onboarding-rival` |
| Phase | `tests` |
| Test file | `__tests__/engine/opponents/scripted.test.ts` |
| `src/` touched | **no** |

---

## 1. Status

**DONE** — failing suite encodes AC-1…AC-13 and DoD-1…DoD-7. Modules
`@engine/opponents/{types,scripted}` are intentionally absent (RED phase).

| Gate | Result |
| --- | --- |
| `bash .tdd-swarm/spec-lint.sh tickets/T-018.md` | **PASS** (AC-1…13 + DoD-1…7) |
| `npx vitest run __tests__/engine/opponents/scripted.test.ts` | **RED** — 1 failed suite / 0 tests collected (`Cannot find module '@engine/opponents/scripted'`) |
| `npx vitest run --exclude '__tests__/engine/opponents/scripted.test.ts'` | **GREEN** — 20 files / **1652** passed |
| Prettier / ESLint on suite | **PASS** |

---

## 2. Deliverable

| Path | Role |
| --- | --- |
| `__tests__/engine/opponents/scripted.test.ts` | Frozen RED suite: Opponent shape, scripted playback, exhaustion, validation, determinism, no clock, onboarding hull arithmetic |
| `.tdd-swarm/reports/T-018-tests.md` | This report |

Commit message: `test(T-018): failing tests for onboarding rival`

---

## 3. Coverage map

| Criterion | What the suite pins |
| --- | --- |
| AC-1 | `id` string + `chooseAction` / `produceAnswer` functions; Exact keys `'id' \| 'chooseAction' \| 'produceAnswer'` |
| AC-2 | 3-step script → three `(cannonId, correct, elapsedMs)` triples in order |
| AC-3 | 4th and 5th turns repeat step 3; no throw / no undefined fields |
| AC-4 | `correct: false` + scripted `elapsedMs` even when Question has unrelated `correctIndex`/`choices` |
| AC-5 | empty `script` → `RangeError` |
| AC-6 | negative `elapsedMs` / unknown `cannonId` → `Error` naming step index (not `RangeError` for elapsed) |
| AC-7 | two factories, same script, five turns → element-wise identical triples |
| AC-8 | three turns complete under fake timers with **no** timer advance |
| AC-9 | every `.ts` under `src/engine/opponents/` lacks `Date`, `Math.random`, `setTimeout`, `setInterval`, `performance.now` |
| AC-10 | `elapsedMs` finite ≥ 0; Object.keys exactly `correct`, `elapsedMs` |
| AC-11 | Object.keys exactly `cannonId`; value ∈ `rivalLoadout` when scripted cannon is in loadout |
| AC-12 | all-incorrect script + two different `RivalView`s → identical triples |
| AC-13 | `ceil(8 + ANSWER_QUALITY_FLOOR * 4)` volleys vs `ONBOARDING_ENEMY_HULL`: >0 after 2, ≤0 after 3 |
| DoD-4 | Promise signatures for both methods; `OpponentAnswer` exact shape |
| DoD-5 | source bans (overlaps AC-9) |
| DoD-6 | frozen input script unchanged after 4 turns |
| DoD-7 | directory contains exactly `types.ts` + `scripted.ts` |

Fixtures: hand-built `Question` / `RivalView`; 3-step mixed + all-incorrect scripts; Swivel/Culverin catalog ids.

---

## 4. Ambiguities for orchestrator adjudication

1. **`Opponent.id` vs ARCHITECTURE.md §4.2** — Ticket + suite require `readonly id: string`. ARCHITECTURE's snippet shows only the two methods. Suite pins the ticket. Confirm docs sync (T-031?) or treat ticket as authoritative.
2. **Branch name drift** — Ticket frontmatter `branch: ticket/T-018-opponent-interface`; worktree is on `ticket/T-018-onboarding-rival`.
3. **AC-6 error class** — Empty script → `RangeError` (AC-5); invalid step → plain `Error` (AC-6). Suite asserts negative-elapsed path is **not** a `RangeError`. Narrow if product wants one class for all construction failures.
4. **AC-11 off-loadout script cannons** — Criterion only constrains membership *when* the scripted cannon is in `rivalLoadout`. Suite does not forbid returning a scripted cannon absent from the view.
5. **`chooseAction` / `produceAnswer` call pairing** — Ticket: `chooseAction` advances the cursor; `produceAnswer` reads that step. Suite always pairs them. Unpaired / double-`produceAnswer` behaviour is unspecified.
6. **AC-13 is arithmetic-only** — Does not drive `createScriptedOpponent` against a real duel; onboarding duel assembly stays caller-side (`app/onboarding.tsx`), as the ticket says.

---

## 5. Out of scope (per ticket)

Banded bot / mercy (T-021), duel-store driver, ghost-captain replay, boss signature attacks, presentation thinking delays.
