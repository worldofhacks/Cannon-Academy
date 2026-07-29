# T-018 — Implementation Report

**Status:** DONE
**Branch:** `ticket/T-018-onboarding-rival`
**Phase:** `implement`
**Active ticket:** `T-018`
**Commit:** `702a804cb4b6d47e22202fa054ede200850cd7b0` — `feat(T-018): opponent interface and scripted onboarding rival`
**Files changed:** `src/engine/opponents/types.ts`, `src/engine/opponents/scripted.ts` (exactly `file_scopes`), plus this report.
**Tests edited by implementer:** **none**

## Unit assertion

| Check | Value |
| ----- | ----- |
| Branch | `ticket/T-018-onboarding-rival` |
| Phase | `implement` |
| Active ticket | `T-018` |
| Feat SHA | `702a804cb4b6d47e22202fa054ede200850cd7b0` |
| Frozen suite SHA-256 (post-unpoison) | `344d3091662158cd6865106846e27a680f29e11e04f136cce1cc2a7bc00567d0` |
| Prior suite SHA-256 (pre-unpoison) | `812e15106b8c08b280673813543089b92231a4f6afd08f4b2e4ed6010a501653` |

Suite hash delta is **only** orchestrator commit `e6ec871` (`test(T-018): unpoison DoD-3…`) — header comment rewrite; implementer did not touch `__tests__/**`.

## What was built

`src/engine/opponents/types.ts` exports `Opponent`, `OpponentAnswer` (reuses `RivalView` / `RivalAction` from `@engine/duel/types`, `Question` from `@engine/questions/types`).

`src/engine/opponents/scripted.ts` exports `ScriptedStep`, `createScriptedOpponent`:

- **Construction** — empty `script` → `RangeError`; negative `elapsedMs` or cannon absent from `CANNON_IDS` → plain `Error` naming the step index.
- **Playback** — paired `chooseAction` → `produceAnswer` walks the script; `chooseAction` advances the cursor and selects the step; `produceAnswer` returns that step’s `{ correct, elapsedMs }`.
- **Exhaustion** — after the last step, both methods keep returning the final step forever.
- **Independence** — view/question arguments are intentionally unused (`void`); outcomes are script-only.
- **Determinism** — `Promise.resolve` immediately; no `Date` / `Math.random` / timers / `performance.now` in module sources.

## Gate results (post-unpoison)

| Gate | Exit | Result |
| ---- | ---- | ------ |
| `npx prettier --check .` | 0 | PASS |
| `npx eslint .` | 0 | PASS |
| `npx tsc --noEmit` | 0 | PASS |
| `npx vitest run` | 0 | **1674 / 1674** (scripted suite **22 / 22**) |
| `.tdd-swarm/run-local-gates.sh` | 0 | ALL LOCAL GATES PASS |
| `.tdd-swarm/spec-lint.sh tickets/T-018.md` | 0 | SPEC-LINT PASS (AC-1…13 + DoD-1…7) |

## Dispute closure

DoD-3 previously failed on suite self-poison (`` `dod(T-018:n)` `` in the header). Orchestrator closed via `e6ec871`. Implementer did not edit `__tests__/**` and did not amend the feat commit.

## Residual risks / notes

- No test disputes remaining. Feat commit is `702a804` (production modules + initial report); report status updated in a follow-up docs commit.
- No push performed.
