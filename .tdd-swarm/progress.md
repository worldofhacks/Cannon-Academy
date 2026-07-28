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

---

## Phase 1 — Planning (2026-07-27)

- Decomposed `src/engine/**` + `src/content/**` into **24 tickets across 8 waves**
  (`tickets/T-001.md` … `T-024.md`, index in `TICKETS.md`).
- Wave assignment and `file_scopes` exclusivity verified mechanically: every ticket sits at the
  earliest wave its dependencies allow, and no two tickets in a wave share a file. The only
  cross-wave file overlaps are T-022 extending `duel/types.ts` (T-013) and `duel/reducer.ts`
  (T-020), each as sole owner of those files in wave 7.
- All 24 tickets parse under `spec-lint.sh` with contiguous `AC-n` ids; all currently RED, which
  is correct before the Test Agent runs.
- Every ticket has a non-empty `traces_to`. Coverage map and the explicit list of uncovered
  in-scope work: `.tdd-swarm/traceability.md`.
- **16 open questions raised for the human** (traceability.md §2) — unspecified numbers were
  either named as behaviour-pinned `tuning.ts` constants or escalated; none was invented.
- **12 planning gaps recorded** (traceability.md §3), incl. one recommended follow-up ticket
  (captain-name wordlist filter, ARCHITECTURE.md §11).
- No `Eval` rows anywhere: there is no LLM in this codebase.

**Status: Phase 1 draft complete.** Superseded by the rev-2 entry below.

---

## Phase 1 rev 2 — post adversarial plan review (2026-07-27)

Two independent reviewers (coupling/sequencing lens, coverage/testability lens) attacked the plan.
Both mechanically confirmed file/test-scope exclusivity, absence of cycles and back-edges, engine
purity, TS-strict handling, and that no numeric value was fabricated. Two Critical and eight
Important findings were fixed:

- **F1** — `T-005` imported four `tuning.ts` constants without declaring `T-004`. A compile
  failure on dispatch, blocking the test agent a phase earlier. Edge added; T-005 → wave 3.
- **C-1** — `DISTRACTOR_ABS_FLOOR >= 1` made a zero answer's distractor set unbuildable
  (`sub_within_20` legally yields `0`). Now `>= 3`, with `MAX_DISTRACTOR_ATTEMPTS >= 9`; both
  derived from the 9-rung ladder, not chosen.
- **F6** — the damage curve floored `answerQuality` but not the roll, contradicting
  ARCHITECTURE.md:206. **Formula corrected**, T-008 AC-15 added. Side effect: the 4–6 volley
  tolerance tightened to match PLAN.md exactly.
- **I-2** — T-008 AC-16 adds an effect-size floor so a near-zero `QUALITY_WEIGHT` cannot pass.
- **F2/F4/F5** — T-013's action-log AC restated over *required* fields; T-003 gained exact
  `Question`/`Choice` shapes and a `difficulty?` insurance field.
- **F3** — the `T-018 → T-020` edge was phantom. Dropped; T-024 now drives 1,000 fuzz duels
  through the real scripted and bot opponents, de-orphaning all of `src/engine/opponents/**`.
- **F10, I-1, I-3** and six minors also fixed.

**Wave count 8 → 7**, re-verified mechanically (24 tickets, 347 ACs, no cycles, no back-edges, no
same-wave file or test-scope collisions, every AC id contiguous, every cross-ticket AC citation
resolving). One reviewer claim was **not** accepted: its re-wave table is internally inconsistent
with its own F3 recommendation — see `.tdd-swarm/traceability.md` §4.1 for the arithmetic.

Two items now need the owner, not the planner: **2.18** (T-020 / T-021 exceed the half-day ticket
rule — go/no-go on splitting) and **2.19** (whether `duel/replay.ts` is built at all, the plan's
strongest cut-line candidate). Question **2.2** (Reliable vs Standard on a miss) must be answered
before wave 3 — it is the only open question that could still force a reducer supersede.

**Orchestrator action before dispatching T-002:** add `no-eval` / `no-implied-eval` /
`no-new-func` to the engine+content ESLint block and prove them firing (L-001). They are not in
`js.configs.recommended`, so nothing currently catches aliased dynamic code in the expression
evaluator.

**Status: Phase 1 COMPLETE — tickets frozen, awaiting Wave 1 dispatch.**
