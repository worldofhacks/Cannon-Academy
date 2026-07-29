# T-017 — Gunnery-range drill session: TEST AGENT REPORT

| | |
| --- | --- |
| Status | `DONE` (RED) |
| Worktree | `.worktrees/wt-T-017` |
| Branch | `ticket/T-017-range-drill` |
| Phase | `tests` |
| Test file | `__tests__/engine/drill.test.ts` |
| `src/` touched | **no** |

---

## 1. Status

**DONE** — failing suite encodes AC-1…AC-14 and DoD-1…DoD-7. Module `@engine/drill` is intentionally absent (RED phase).

| Gate | Result |
| --- | --- |
| `bash .tdd-swarm/spec-lint.sh tickets/T-017.md` | **PASS** (AC-1…14 + DoD-1…7) |
| `npx vitest run __tests__/engine/drill.test.ts` | **RED** — 1 failed suite / 0 tests collected (`Cannot find module '@engine/drill'`) |
| `npx vitest run --exclude '__tests__/engine/drill.test.ts'` | **GREEN** — 19 files / **1620** passed |
| Prettier / ESLint on suite | **PASS** |

---

## 2. Deliverable

| Path | Role |
| --- | --- |
| `__tests__/engine/drill.test.ts` | Frozen RED suite: `startDrill` / `answerDrill` shapes, grading matrix, completion, mastery progression, recency, purity |
| `.tdd-swarm/reports/T-017-tests.md` | This report |

Commit: `test(T-017): failing tests for range drill session`

---

## 3. Coverage map

| Criterion | What the suite pins |
| --- | --- |
| AC-1 | `answered/correct === 0`, `complete === false`, live `Question` with 4 distinct choices, mastery deep-equals input |
| AC-2 | `RangeError` for length `0` / negative / non-integer / NaN / ∞; `QuestionGenerationError`/`NO_TEMPLATE` for empty pool |
| AC-3 | Correct → counters + mastery `=== applyAnswer(m, 'range', true)` at `MASTERY_RATE_RANGE` |
| AC-4 | Wrong → `correct` stays 0; `weightedCorrect` unchanged; `attempts + 1` |
| AC-5 | `choiceIndex === null` → log `{correct:false, choiceIndex:null}`; miss semantics |
| AC-6 | Out-of-range choice / negative `elapsedMs` → `RangeError`, session snapshot unchanged |
| AC-7 | Length 10 → `answered===10`, `complete`, `current===null`, `log.length===10` |
| AC-8 | Post-complete `answerDrill` throws `Error` whose message matches `/complet/i` |
| AC-9 | 10/10 correct from `emptyMastery` → `isMastered` + `meterPercent === 100` |
| AC-10 | 5/10 correct → `isMastered === false` |
| AC-11 | Pool 8 / length 20: no repeat inside any `RECENT_TEMPLATE_WINDOW` slice; `recentTemplateIds[0]` is most-recent |
| AC-12 | Same seed+answers → deep-equal session **and** question list; different seed diverges |
| AC-13 | Input `answered` / `mastery` / `log` / `rng` unchanged after `answerDrill` |
| AC-14 | `JSON.parse(JSON.stringify(session))` deep-equals live and complete sessions |
| DoD-4 | Source scan: imports `@engine/mastery` / `applyAnswer` / `'range'`; no local `MASTERY_RATE_*` or `weightedCorrect +=` |
| DoD-5 | Poisons `Math.random` + `Date` during a 3-question drill; source bans those identifiers |
| DoD-6/7 | JSON+immutability; production path exactly `src/engine/drill.ts` |

Fixtures: self-contained `templateSchema.parse` pools (2 and 8 templates on `add_within_10`) — no content registry.

---

## 4. Ambiguities for orchestrator adjudication

1. **`recentTemplateIds` order** — Ticket prose says “pushes” (often append/end). T-007/T-020 and `generateQuestion` require **most-recent-first**. Suite pins `recentTemplateIds[0] === answered templateId` after each answer. If implementer appends, AC-11 fails unless they reverse before calling the generator.
2. **Mastery reference equality** — AC-1 requires deep equality only; cloning the input mastery object is not required (but recommended for immutability).
3. **`skillId` vs template pool** — Ticket injects templates; suite does not assert the drill filters by `skillId`. Caller responsibility unless implementer chooses to filter.
4. **AC-2 non-integer set** — Includes `1.5`, `NaN`, `±Infinity` in addition to `0` / negatives. Narrow if product wants only finite non-integers.
5. **AC-8 error type** — Asserts `Error` that is **not** a `RangeError`, message matching `/complet/i`. Exact class name left open.

---

## 5. Out of scope (per ticket)

Unlock resolution, `app/range.tsx`, duel half-rate, persistence, coin payouts.
