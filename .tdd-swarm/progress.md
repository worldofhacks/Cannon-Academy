# Progress Ledger — Cannon Academy engine core

Append-only. Every state change gets a line. On session start or after compaction,
READ THIS FILE AND `git log` BEFORE DISPATCHING ANYTHING — work marked complete is
complete; resume at the first incomplete ticket. Never re-dispatch finished work.

---

## Phase 0 — Preconditions (2026-07-27)

- Scope locked: `src/engine/**` + `src/content/**` (pure TS). RN/Firebase/EAS out — see posture.md.
- Posture: **mvp** (owner-selected). Test runner: **vitest** (owner-selected).
- `git init` on a previously untracked directory; planning docs preserved untouched.
- Harness scaffolded: vitest 3 + TS strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) + eslint 9 flat + prettier + zod.
- Architecture invariants encoded as lint rules and **proven firing**: engine purity (no React/RN/Expo/Firebase in `src/engine/`), determinism (`Math.random`/`Date` banned).
- Gate scripts written and executed: `run-local-gates.sh` (7 gates PASS), `run-repo-gates.sh` (5 PASS, 1 deferred), `spec-lint.sh` (proven RED on an untested AC).
- Baseline audit was RED (8 high, transitive `brace-expansion`); fixed via `overrides` pin → **0 vulnerabilities**.
- Baseline recorded: 1 test passing, 0 type errors, 0 lint errors, 0 audit findings.
- Lessons seeded: L-001, L-002, L-003.

**Status: Phase 0 COMPLETE — all gates green.** Next: Phase 1 planning.
