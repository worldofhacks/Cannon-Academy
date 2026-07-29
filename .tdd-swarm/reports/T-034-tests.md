# T-034 — Param-key identifier grammar: TEST AGENT REPORT

| | |
| --- | --- |
| Status | `DONE` (RED) — test-design I-1…I-3 closed |
| Worktree | `.worktrees/wt-T-034` |
| Branch | `ticket/T-034-param-key-grammar` |
| Phase | `tests` |
| Test file | `__tests__/content/schemas.test.ts` (T-034 block appended) |
| `src/` touched | **no** |
| Review | `.tdd-swarm/reports/T-034-test-design-review.md` (`ACCEPT_WITH_NITS`) |

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

## 1b. Test-design nits closed (Important)

| # | Fix |
| --- | --- |
| **I-1** | `isT002Ident` no longer uses `evaluateNumber(key, env) === 7` alone (misclassified `"7"` as IDENT). Empty-env success ⇒ not IDENT (NUMBER literals); bound-env sentinel success ⇒ IDENT. Corpus adds `"7"` and `"0"`. |
| **I-2** | DoD-5 comment: `file_scopes` includes `expr.ts` for pure IDENT export (orchestrator adjudication). |
| **I-3** | DoD-5 export regex documents preferred `IDENT_PATTERN` / `isIdent` / `isIdentifier` (symbol must contain Ident/IDENT/Identifier). |

---

## 2. Deliverable

| Path | Role |
| --- | --- |
| `__tests__/content/schemas.test.ts` | Appended T-034 suite under a marked divider; T-003/T-026 untouched |
| `.tdd-swarm/reports/T-034-tests.md` | This report |

Commits:
- `51c37df` — `test(T-034): failing tests for param key identifier grammar`
- (this) — `test(T-034): fix AC-4 IDENT oracle; digit-only corpus; DoD-5 comments`

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
| AC-4 drift corpus | schema accepts 13 non-IDENT keys (incl. `"7"` / `"0"`) that the IDENT oracle rejects |
| DoD-5 | `schemas.ts` does not import from `@engine/questions/expr`; no Ident/IDENT export yet |

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
| AC-4 | Shared corpus (incl. digit-only `"7"`/`"0"`): schema acceptance ≡ `isT002Ident` (empty-env rejects NUMBER literals) |
| DoD-1…4 | Spec/DoD tag hygiene + local-gates wiring (no skip/only) |
| DoD-5 | schemas imports from `@engine/questions/expr`; no duplicated char-class literal; expr exports Ident/IDENT/Identifier-named symbol (e.g. `IDENT_PATTERN`) |
| DoD-6 | Narrowing lives in `src/content/schemas.ts`; no new `param*`/`ident*` content module |

---

## 5. Implementer target

1. Export `IDENT_PATTERN` (or `isIdent` / `isIdentifier`) from `src/engine/questions/expr.ts` — pure surface; no evaluation semantics change (`file_scopes` includes this file).
2. In `src/content/schemas.ts`, import that export and narrow `params` keys so illegal keys fail with an issue that names them. Do not paste a second `[A-Za-z_][A-Za-z0-9_]*` literal into schemas.

---

## 6. Adjudications (resolved)

1. **file_scopes vs shared import** — Resolved in `a178ba6`: `expr.ts` is in scope for a pure IDENT export.
2. **AC-2 error shape** — Path segment **or** message naming the key is accepted.
