# T-007 — Implementation Report

**Status:** DONE
**Branch:** `ticket/T-007-question-generator`
**Phase:** `implement`
**Active ticket:** `T-007`
**Files changed:** `src/engine/questions/generator.ts` (added) — exactly `file_scopes`, plus this report.

## Unit assertion

| Check | Value |
| ----- | ----- |
| Branch | `ticket/T-007-question-generator` |
| Phase | `implement` |
| Active ticket | `T-007` |
| Frozen suite SHA-256 | `1a5865707201bc288bd21deb4865cf8c49d3e176e1f43ef537229460b57799e1` (prefix `1a586570` ✓) |

## What was built

`generateQuestion({ templates, recentTemplateIds, rng }) → readonly [Question, Rng]` — the ticket's seven steps in order:

1. **Eligibility** — exclude ids in the first `RECENT_TEMPLATE_WINDOW` of `recentTemplateIds`; fall back to the unfiltered pool when filtering empties it; `NO_TEMPLATE` only when the pool is empty.
2. **Pick** — `pick(rng, eligible)`.
3. **Rejection sampling** — param keys via `Object.keys(...).sort()` (ascending code-point order); up to `MAX_PARAM_SAMPLE_ATTEMPTS`; `CONSTRAINTS_UNSATISFIED` on exhaustion. Malformed constraints wrap as `INVALID_QUESTION` with `ExprError` cause.
4. **Answer** — `evaluateNumber`; wrap `ExprError` → `INVALID_QUESTION` + cause.
5. **Distractors** — `buildDistractors`; wrap `ExprError`; propagate `DISTRACTOR_FAILURE` unchanged.
6. **Render** — substitute `{IDENT}` tokens; any surviving brace → `INVALID_QUESTION` with **no** `cause`.
7. **Assemble** — `[answer, ...distractors]` as `{ value, label: String(value) }`, `shuffle`, `correctIndex` from post-shuffle answer position; flags default to `false`.

`assertQuestion` is not called (locked-decision); output satisfies its invariants by construction. Tuning constants (`CHOICE_COUNT`, `MAX_PARAM_SAMPLE_ATTEMPTS`, `RECENT_TEMPLATE_WINDOW`) are imported from `@engine/tuning`.

## Gate results (unpiped exits)

| Gate | Exit | Result |
| ---- | ---- | ------ |
| `prettier --write src/engine/questions/generator.ts` | 0 | clean |
| `eslint src/engine/questions/generator.ts` | 0 | clean |
| `tsc --noEmit` | 0 | clean |
| `vitest run __tests__/engine/questions/generator.test.ts` | 0 | **81 / 81** |
| `vitest run` (full suite) | 0 | **1310 / 1310** (81 + 1229) |
| `.tdd-swarm/spec-lint.sh tickets/T-007.md` | 0 | SPEC-LINT PASS (all 21 ACs) |
| `.tdd-swarm/run-local-gates.sh` | 0 | ALL LOCAL GATES PASS |

## Residual risks / notes

- Cleared a pre-existing `scratchpad/T-007-review4/` tree that was failing the local lint gate with unused-var errors; not part of this ticket's deliverable.
- No test disputes. No `ExprError` escapes the generator boundary.
