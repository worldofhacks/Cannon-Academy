# T-017 — Implementation Report

**Status:** DONE
**Branch:** `ticket/T-017-range-drill`
**Phase:** `implement`
**Active ticket:** `T-017`
**Commit:** `2572fbda13144da3f71e169d0119b12a4efa7b03` — `feat(T-017): range drill session (full-rate mastery)`
**Files changed:** `src/engine/drill.ts` (added) — exactly `file_scopes`, plus this report.

## Unit assertion

| Check | Value |
| ----- | ----- |
| Branch | `ticket/T-017-range-drill` |
| Phase | `implement` |
| Active ticket | `T-017` |
| Frozen suite SHA-256 | `7db026f67f89e6dc54b03cd33e9a520d1b2dd32190034147a2ec9ec8adc11d49` (prefix `7db026f6` ✓; post-unpoison freeze) |

## What was built

`src/engine/drill.ts` exports `DrillSession`, `DrillAnswer`, `startDrill`, `answerDrill`:

- **`startDrill`** — `RangeError` when `length` is not an integer `>= 1` (covers `0`, negatives, `1.5`, `NaN`, `±Infinity`); empty pool → T-007 `QuestionGenerationError` / `NO_TEMPLATE` via `generateQuestion`; returns live session with `answered/correct === 0`, cloned mastery, first question, empty log/recency.
- **`answerDrill`** — grades vs `current.correctIndex`; `choiceIndex === null` → incorrect; applies `applyAnswer(mastery, 'range', correct)` (no local rate arithmetic); prepends answered id to `recentTemplateIds` (most-recent-first); generates next question or completes (`current: null`); post-complete throws `Error` matching `/complet/i` (not `RangeError`); invalid choice/elapsed → `RangeError` without advancing.
- **Session carries `templates`** (deep-copied) so subsequent answers and JSON restore can call `generateQuestion` without a content registry — same pattern as T-013 duel `templatesBySkill`.
- Pure: no `Math.random` / `Date` identifiers in source; seeded `Rng` only.

## Gate results (unpiped exits)

| Gate | Exit | Result |
| ---- | ---- | ------ |
| `npx prettier --check .` | 0 | PASS |
| `npx eslint .` | 0 | PASS |
| `npx tsc --noEmit` | 0 | PASS |
| `npx vitest run` | 0 | **1652 / 1652** (drill suite **32 / 32**) |
| `.tdd-swarm/run-local-gates.sh` | 0 | ALL LOCAL GATES PASS |
| `.tdd-swarm/spec-lint.sh tickets/T-017.md` | 0 | SPEC-LINT PASS (AC-1…14 + DoD-1…7) |

## Prior dispute (closed)

DoD-3 previously failed on a suite self-poison (`dod(T-017:n)` in the header). Orchestrator closed via `test(T-017): unpoison DoD-3…` (`6007ef6`). Implementer did not edit `__tests__/**`.

## Residual risks / notes

- No test disputes remaining. Feat commit includes `src/engine/drill.ts` + this report only.
