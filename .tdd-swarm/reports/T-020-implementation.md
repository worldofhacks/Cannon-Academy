# T-020 — Implementation Report

**Status:** BLOCKED(TEST_DISPUTE) — cross-ticket `dod(T-013:9)` after prior AC-24/tsc disputes closed
**Branch:** `ticket/T-020-duel-reducer`
**Phase:** `implement`
**Active ticket:** `T-020`
**Feat commit (kept):** `6ef7aaf` — `feat(T-020): duel reducer pure state machine`
**Suite fix commit (orchestrator):** `bd8bc4d` — AC-24 needle split + `snapshotArrays` type
**Production file:** `src/engine/duel/reducer.ts` only (`file_scopes`)

## Unit assertion

| Check | Value |
| ----- | ----- |
| Branch | `ticket/T-020-duel-reducer` |
| Phase | `implement` |
| Active ticket | `T-020` |
| Frozen suite SHA-256 (post-dispute fix) | `80c4cdb1367a39155689ec037a8cca9430849971cedb40db4b6175cc169236ca` |
| Feat SHA | `6ef7aaf` preserved |

## What was built

`duelReducer(state, event): DuelState` — pure transition table per ticket + adjudications
(`bySkill`, rival volatile recoil → `enemyHull`, enemy-first terminals, `===` no-ops,
`resolveShot` only, most-recent-first `recentTemplateIds`).

## Gate results (after dispute closure)

| Gate | Exit | Result |
| ---- | ---- | ------ |
| `prettier --check .` | 0 | clean (extra blank line in `tickets/T-020.md` removed) |
| `eslint . --max-warnings 0` | 0 | clean |
| `tsc --noEmit` | 0 | clean |
| `vitest run __tests__/engine/duel/reducer.test.ts` | 0 | **33 / 33** |
| `.tdd-swarm/spec-lint.sh tickets/T-020.md` | 0 | SPEC-LINT PASS |
| `vitest run` (full) | **1** | **1706 / 1707** — sole failure is `dod(T-013:9)` |
| `.tdd-swarm/run-local-gates.sh` | blocked | unit gate red on T-013 |

T-020 behavioural + structural ACs are all green. Full-repo gates cannot pass while T-013’s directory-scope DoD forbids `reducer.ts`.

---

## BLOCKED(TEST_DISPUTE) — `dod(T-013:9)` vs T-020 deliverable

**File:** `__tests__/engine/duel/types.test.ts:2393–2399`

```ts
const permitted = ['damage.ts', 'types.ts'];
// …
expect(unexpected, 'T-013 declares only src/engine/duel/types.ts in its file_scopes').toEqual([]);
```

**Failure:** `unexpected === ['reducer.ts']` — exactly the file T-020 DoD / `dod(T-020:8)` requires:

```ts
expect(present).toEqual(['damage.ts', 'reducer.ts', 'types.ts']);
```

**Why this is a suite defect, not an implementer miss:**

- T-013 already grandfathered T-008’s `damage.ts` in the same list.
- T-020’s `file_scopes` is `src/engine/duel/reducer.ts`; omitting it fails T-020; adding it fails T-013.
- Implement phase must not edit `__tests__/**` (including T-013’s frozen suite).

**Suggested fix (test designer / orchestrator — same pattern as T-008):**

```ts
const permitted = ['damage.ts', 'types.ts', 'reducer.ts'];
```

with a comment that `reducer.ts` is T-020’s frozen module.

---

## Residual notes

- Prior disputes (AC-24 self-poison; `readonly` on `choices` union) closed in `bd8bc4d`.
- No edits to `__tests__/` from this implementer after feat.
- Ready to mark DONE the moment `dod(T-013:9)` permits `reducer.ts`.
