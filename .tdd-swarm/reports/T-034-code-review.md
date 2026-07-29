# T-034 Code Review — Narrow template param keys to IDENT grammar

**Reviewer:** independent senior review (did not author this code)  
**Date:** 2026-07-29  
**Worktree:** `/Users/quietguy/Documents/Dev/Gauntlet/Math Game/.worktrees/wt-T-034`  
**Branch:** `ticket/T-034-param-key-grammar`  
**Feat commit:** `9947577` — `feat(T-034): narrow template param keys to IDENT grammar`  
**Scope:** `src/content/schemas.ts`, `src/engine/questions/expr.ts` (IDENT export only)  
**Frozen suite:** SHA-256 `fcf0e43f560bc63aacdd8b39adce5c529f92d7f6e8f4451e38f44abedd79f92f`  
**Orchestrator:** gates PASS; **1721/1721**; schemas **109/109**

Independently re-verified rather than trusted: ran `npx vitest run -t "T-034"` → **14/14 passed**;
`bash .tdd-swarm/spec-lint.sh tickets/T-034.md` → **PASS**; full suite `npx vitest run` →
**1721/1721**; inspected feat diff (export-only change in `expr.ts`); hand-checked shipped template
param keys and AC-2 adjudication compliance.

---

## Verdict

**APPROVE_WITH_NITS**

## One-line summary

Shared `IDENT_PATTERN` export and `z.record(paramKeySchema, …)` narrowing correctly implement the
locked decision with full AC/DoD coverage and zero evaluator semantics change; only minor
triple-representation and unused-export nits remain.

---

## Verification checklist (orchestrator asks)

| Requirement | Result | Evidence |
| --- | --- | --- |
| **`IDENT_PATTERN` / `isIdent` export** | **PASS** | `expr.ts:814-818` — `export const IDENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/` and `export function isIdent`. Matches ticket locked decision and adjudication examples. |
| **schemas imports; no duplicated regex** | **PASS** | `schemas.ts:11` imports `IDENT_PATTERN` from `@engine/questions/expr`. No `[A-Za-z_][A-Za-z0-9_]*` literal in `schemas.ts` (DoD-5 probe). `paramKeySchema` at `:76-78` consumes the import. |
| **Rejection names keys (AC-2)** | **PASS** | `templateSchema.params` is `z.record(paramKeySchema, paramRangeSchema)` (`:87`). Frozen AC-2 cases (`a-b`, `2x`, `""`, `a b`, `a.b`) all fail and satisfy `issuesNameKey` (path segment or message) at `schemas.test.ts:1074-1085`. Adjudication path-or-message shape accepted. |
| **No evaluator semantics change** | **PASS** | Feat diff on `expr.ts` adds **14 lines only** at the Public API block — no edits to `tokenize`, `parse`, `checkNode`, `computeNumber`, `evaluateNumber`, or `evaluatePredicate`. JSDoc explicitly states pure membership check (`:807-812`). |
| **AC-3 shipped content still valid** | **PASS** | `spec(T-034:AC-3)` green via `loadShippedTemplates()`. Independent spot-check of `src/content/templates/*.json` param keys finds only IDENT-shaped names (`a`, `b`, `c`, `d`, `n`, …). Narrowing is a no-op for existing catalogs, as planned. |
| **`file_scopes`** | **PASS** | Feat commit `9947577` production edits: exactly `src/content/schemas.ts` and `src/engine/questions/expr.ts`. Report artifact `.tdd-swarm/reports/T-034-implementation.md` is swarm norm (same pattern as T-020/T-032). No `__tests__/**` edits in feat commit. |

---

## 1. SPEC COMPLIANCE

### Acceptance criteria

| AC | Verdict | Evidence |
| --- | --- | --- |
| AC-1 | **Met** | `paramKeySchema` + `z.record(paramKeySchema, paramRangeSchema)` accepts legal keys and preserves them. Frozen test at `schemas.test.ts:1057-1071` with `_x`, `Total`, `a1`, `A_1b2`, `z_`, `a`, `n`. |
| AC-2 | **Met** | Enumerated reject set fails with key named in issue path/message. Five `it.each` cases green. Empty-string key correctly named via path (test comment at `:991-993`). |
| AC-3 | **Met** | All shipped templates parse; secondary loop asserts every param key satisfies T-002 IDENT oracle (`schemas.test.ts:1088-1100`). |
| AC-4 | **Met** | Shared drift corpus (legal + illegal + near-misses incl. `"7"`/`"0"`) — schema acceptance ≡ `isT002Ident` evaluator oracle (`schemas.test.ts:1103-1114`). No drift between schema regex and live grammar. |

**4 / 4 met.**

### Definition of Done

| Item | Verdict | Evidence |
| --- | --- | --- |
| Every AC has passing `spec(T-034:AC-n)` | **Met** | spec-lint PASS; 14/14 T-034 tests green. |
| `run-local-gates.sh` green | **Met** | Orchestrator + implementation report; independently confirmed full vitest 1721/1721. |
| `spec-lint.sh` green | **Met** | Re-run: AC-1…4 + DoD-1…6 mapped. |
| Every DoD checkbox has `dod(T-034:n)` | **Met** | Six numbered dod tags present (`schemas.test.ts:1118-1183`). |
| Pattern defined once, shared with T-002 | **Met** | Single export in `expr.ts`; schemas imports it (DoD-5). |
| Files changed exactly `file_scopes` | **Met** | See checklist above. |

**6 / 6 met.**

### Adjudications

| Ruling | Verdict | Evidence |
| --- | --- | --- |
| Expand `file_scopes` to `expr.ts` for pure IDENT export | **Met** | Export-only addition; no tokenisation/evaluation change. |
| AC-2 error shape: path segment **or** message | **Met** | `issuesNameKey` accepts either; all AC-2 cases pass. |
| Locked decision: pattern is T-002 IDENT, imported not re-derived | **Met** | `IDENT_PATTERN` matches documented grammar (`expr.ts:29`, `:808`). |

### Iron Law — scope discipline

**Nothing beyond the ticket.** No catalog edits, no generator changes, no new content modules, no
evaluator behaviour change. The narrowing is exactly one private `paramKeySchema` and a one-line
`params` field change in `templateSchema`.

---

## 2. CODE QUALITY

### The fix (highest-priority check)

`schemas.ts:72-87`:

```ts
const paramKeySchema = z.string().regex(IDENT_PATTERN, {
  message: 'param key must be an expression identifier',
});

// ...
params: z.record(paramKeySchema, paramRangeSchema),
```

This is the correct L-009 narrowing: reject authorable-but-unusable keys at load time with the
file attached, instead of silently accepting keys the evaluator can never resolve. Using
`z.record(keySchema, valueSchema)` validates **keys**, not just values — the pre-T-034
`z.record(paramRangeSchema)` bug.

`expr.ts:814-818` export block is minimal, well-documented, and placed in Public API without
touching the guarded evaluator internals.

### Correctness dimensions verified

- **Grammar alignment:** `IDENT_PATTERN` `/^[A-Za-z_][A-Za-z0-9_]*$/` matches the tokenizer's
  `isIdentifierStart` / `isIdentifierPart` rules for full-string identifiers (`expr.ts:107-113,
  :165-170`). AC-4's evaluator oracle provides an independent drift guard over a corpus that
  includes digit-only strings misclassified in an earlier test-design revision (I-1, now closed).
- **Strict schema preserved:** `.strict()` on `templateSchema` unchanged (`schemas.ts:96`).
- **Dependency direction:** `schemas.ts` now imports a **value** from `@engine/questions/expr`.
  This inverts the usual engine→content type-only flow (T-003) but is the orchestrator-locked
  trade-off for a single grammar source. No circular import: `expr.ts` does not import schemas.
  Module has no import-time side effects.
- **Downstream compatibility:** Shipped templates use only `{a,b,c,d,n}`-class keys. T-007
  generator render regex (`generator.ts:52`) already matched IDENT; schema now agrees.

### Severity summary

- **Critical:** none.
- **Important:** none.
- **Minor:**
  1. **Triple representation** — IDENT membership exists as (a) tokenizer char-class functions,
     (b) exported regex `IDENT_PATTERN`, and (c) generator render regex (T-007, out of scope).
     AC-4 mitigates schema↔evaluator drift; tokenizer↔export drift would require a future expr
     test if the char-class functions change without updating `IDENT_PATTERN`.
  2. **`isIdent` unused in production** — `schemas.ts` uses `IDENT_PATTERN` directly in
     `z.string().regex()`. Export is correct per adjudication/DoD-5 naming; helper is available for
     future callers.
  3. **Frozen test helper still inlines char class** — `templateWithParamKey` at
     `schemas.test.ts:987` duplicates the pattern for `answerExpr` fallback logic. Harmless (test
     file frozen); could adopt `isIdent` in a future test-only pass.

---

## Verdict table

| Dimension | Verdict |
| --- | --- |
| **SPEC COMPLIANCE** | **APPROVE** |
| **CODE QUALITY** | **APPROVE_WITH_NITS** |

**Overall: APPROVE_WITH_NITS**

**One-liner:** Minimal shared-export + schema narrowing fully satisfies T-034 and adjudications with
1721/1721 green; nits are unused `isIdent`, triple grammar representation, and frozen test inline regex.
