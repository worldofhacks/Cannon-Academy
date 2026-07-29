# T-034 — Param-key identifier grammar: TEST AGENT REPORT

| | |
| --- | --- |
| Status | `DONE` (RED) |
| Worktree | `.worktrees/wt-T-034` |
| Branch | `ticket/T-034-param-key-grammar` |
| Phase | `tests` |
| Test file | `__tests__/content/schemas.test.ts` (T-034 block appended) |
| `src/` touched | **no** |

---

## 1. Status

**DONE** — failing coverage for AC-1…AC-4 and DoD-1…DoD-6. Current
`params: z.record(paramRangeSchema)` still accepts any string key; AC-2 / AC-4 /
DoD-5 fail for that reason. Frozen T-003 / T-026 cases above the divider stay green.

| Gate | Result |
| --- | --- |
| `bash .tdd-swarm/spec-lint.sh tickets/T-034.md` | **PASS** (AC-1…4 + DoD-1…6) |
| `npx vitest run __tests__/content/schemas.test.ts` | **RED** — 7 failed \| 102 passed (109) |
| `npx vitest run --exclude '__tests__/content/schemas.test.ts'` | **GREEN** — 21 files / **1612** passed |
| Pre-T-034 full suite size | **~1707** (= 1612 + 95 frozen schemas tests) |

---

## 2. Deliverable

| Path | Role |
| --- | --- |
| `__tests__/content/schemas.test.ts` | Appended T-034 suite under a marked divider; T-003/T-026 untouched |
| `.tdd-swarm/reports/T-034-tests.md` | This report |

Commit message: `test(T-034): failing tests for param key identifier grammar`

---

## 3. RED evidence

```
npx vitest run __tests__/content/schemas.test.ts
 Test Files  1 failed (1)
      Tests  7 failed | 102 passed (109)
```

| Failure | Why (current schema) |
| --- | --- |
| AC-2 × 5 (`a-b`, `2x`, `""`, `a b`, `a.b`) | `safeParse` succeeds; expect fail + issue naming the key |
| AC-4 drift corpus | schema accepts 11 non-IDENT keys that `evaluateNumber` rejects as idents |
| DoD-5 | `schemas.ts` does not import from `@engine/questions/expr`; no shared export |

Still green (and must stay green after implementer lands):

| Case | Note |
| --- | --- |
| AC-1 | Legal IDENT keys already parse |
| AC-3 | All 72 shipped templates / keys `{a,b,c,d,n}` already IDENT-shaped |
| DoD-1…4, DoD-6 | Meta / scope pins |

---

## 4. Coverage map

| Criterion | What the suite pins |
| --- | --- |
| AC-1 | Legal keys `_x`, `Total`, `a1`, `A_1b2`, `z_`, `a`, `n` parse; keys preserved |
| AC-2 | Enumerated reject set; each failure must name the key (path segment or message) |
| AC-3 | Every `src/content/templates/*.json` entry parses; every key is T-002 IDENT |
| AC-4 | Shared corpus: `templateSchema` acceptance ≡ `evaluateNumber(key, env) === 7` |
| DoD-1…4 | Spec/DoD tag hygiene + local-gates wiring (no skip/only) |
| DoD-5 | schemas imports IDENT helper from `@engine/questions/expr`; no duplicated `[A-Za-z_][A-Za-z0-9_]*` literal; expr exports an Ident/IDENT symbol |
| DoD-6 | Narrowing lives in `src/content/schemas.ts`; no new `param*`/`ident*` content module |

---

## 5. Implementer target

In `src/content/schemas.ts`, narrow `params` keys to T-002 `IDENT := [A-Za-z_][A-Za-z0-9_]*`
so illegal keys fail with an issue that names them. Prefer importing a shared
predicate/pattern exported from `@engine/questions/expr` (DoD-5 / locked decision)
rather than pasting a second regex literal into the schema file.

---

## 6. Ambiguities for orchestrator adjudication

1. **file_scopes vs shared import** — Ticket `file_scopes` is only
   `src/content/schemas.ts`, and Out of Scope says “no change to T-002's evaluator”,
   but the locked decision + DoD-5 require importing the IDENT definition from
   `@engine/questions/expr` (which today does not export one). Confirm whether a
   one-line `export` of an existing helper/`IDENT_PATTERN` in `expr.ts` is allowed
   as a dependency touch, or whether schemas may define a single named pattern and
   rely on AC-4's behavioural drift check alone.
2. **Error shape for naming the key** — AC-2 accepts either a Zod `path` segment equal
   to the key or a `message` containing it (empty key: path only). Pin a preferred
   shape if implementer review wants one API.
3. **Ticket status file** — Worktree still has a dirty `tickets/T-034.md`
   (`status: in-progress`) matching the ledger tip; left unstaged (tests phase).
