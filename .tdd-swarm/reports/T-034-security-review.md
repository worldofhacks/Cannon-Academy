# T-034 Security Review — Param key IDENT grammar narrowing

Reviewer: Composer 2.5 (independent).  
Worktree: `/Users/quietguy/Documents/Dev/Gauntlet/Math Game/.worktrees/wt-T-034`  
Commit reviewed: `9947577` — `feat(T-034): narrow template param keys to IDENT grammar`  
Territory: `src/content/schemas.ts`, `src/engine/questions/expr.ts` (export-only addition).

Frozen suite: **109/109** schemas tests; repo **1721/1721** green.

## Verdict: PASS_WITH_NOTES

No Critical or Important findings. Schema narrowing is fail-closed at load time, shares T-002's
IDENT surface without altering evaluation, and aligns prototype-key handling with the established
content-trust model (T-007 / wave-1 notes).

## Scope

| File | Change |
| ---- | ------ |
| `src/engine/questions/expr.ts` | Export `IDENT_PATTERN` (`/^[A-Za-z_][A-Za-z0-9_]*$/`) and `isIdent()` — no tokenisation or evaluation edits |
| `src/content/schemas.ts` | Import `IDENT_PATTERN`; narrow `templateSchema.params` to `z.record(paramKeySchema, paramRangeSchema)` |

## Checklist

### 1. No eval / dynamic code — CLEAN

- Diff adds only a anchored regex constant, a one-line `isIdent` helper, and a Zod `z.string().regex(...)` key schema.
- Grepped changed files and full `expr.ts` for `eval(`, `new Function`, `Function(`, `import(`, `require(` — zero executable hits (comments and type names only).
- No new runtime string-to-code paths; validation is declarative Zod + regex membership.

### 2. `IDENT_PATTERN` ReDoS safety — CLEAN

Pattern: `/^[A-Za-z_][A-Za-z0-9_]*$/`

- Fully anchored (`^` … `$`) — no partial-match backtracking.
- Single character class + Kleene star on a disjoint tail class — **linear O(n)**; no nested quantifiers, no overlapping alternation, no catastrophic backtracking surface.
- Inputs are bounded by hand-authored JSON catalog size (offline, ship-time), not adversarial streaming input.

### 3. Schema rejection safety — CLEAN

- Invalid keys (`a-b`, `2x`, `""`, `a b`, `a.b`, pure-digit `"7"`/`"0"`, …) fail at **parse time** with Zod issues naming the key (AC-2 path/message).
- Rejection does not invoke the evaluator or execute expressions — fail-closed at the content boundary (L-009 intent).
- Shipped catalogs still parse (AC-3) — narrowing is a no-op for existing bundled content.

### 4. No secrets — CLEAN

- No URLs, tokens, credentials, or PII in the diff.

### 5. Evaluator behaviour unchanged — CLEAN

- `tokenize`, `parse`, `checkNode`, `computeNumber`, `computeBoolean`, `evaluateNumber`, and `evaluatePredicate` are untouched.
- Only additions are the public exports at the bottom of `expr.ts` (lines 807–819).
- AC-4 drift corpus (109/109 suite) confirms schema acceptance ≡ T-002 IDENT membership over a shared corpus including digit-only rejects and near-misses.

### 6. Prototype-key handling (`__proto__`, `constructor`, …) — CLEAN (consistent with prior trust notes)

| Key | Matches IDENT? | Schema (post-T-034) | Evaluator (`Object.hasOwn`) | Shipped catalogs |
| --- | -------------- | ------------------- | --------------------------- | ---------------- |
| `__proto__` | yes | accepts | resolves only as **own** param binding; empty env → `UNKNOWN_IDENTIFIER` (T-002 AC-9) | absent (AC-3) |
| `constructor` | yes | accepts | same | absent |
| `toString` | yes | accepts | same | absent |

- **Prior model (wave-1, T-007 M-1/M-2):** param keys are content-trusted; identifier resolution uses `Object.hasOwn` in both checking and evaluation passes (`expr.ts:589–591`, `653–656`) — inherited `Object.prototype` members are never reachable as identifiers.
- **T-034 intent:** align schema with T-002 IDENT grammar, not block grammatically valid names like `__proto__`. AC-4 corpus explicitly includes `__proto__` and `constructor`; both sides agree they are IDENT-shaped.
- **Generator draw quirk (pre-existing, not introduced here):** `draw['__proto__'] = n` on a plain `{}` does not create an own property (Node probe: `Object.hasOwn(draw, '__proto__') === false`); expressions referencing `{__proto__}` would still fail `hasOwn` unless params use a null-prototype map. T-007 recorded this under content-trust; no shipped template uses these keys.
- **Zod behaviour shift (informational):** pre-T-034 `z.record` silently dropped `"__proto__"` keys (wave-1 note). Post-T-034, `"__proto__"` is accepted when it matches IDENT. This is a schema-boundary widening for that one key shape only; mitigated by content authorship, AC-3 inventory, and unchanged `Object.hasOwn` evaluator rule.

### 7. Layer coupling (informational)

- `src/content/schemas.ts` now imports a symbol from `@engine/questions/expr`. Reverse of the usual “engine never imports runtime zod” direction, but `expr.ts` remains self-contained (no imports, no import-time side effects). Security impact: none today; noted for future refactors that might add heavyweight engine dependencies.

## Threat model notes

- **Trust boundary:** offline, hand-authored static JSON catalogs — same class as T-014 / T-007 content reviews.
- **Attack surface closed:** authorable-but-unusable keys (`"a-b"`, `"2x"`, …) that could render via `{name}` but never bind in `answerExpr`/constraints now fail loudly at load (the gap T-007 AC-19 identified).
- **Not in scope:** blocking grammatically valid but confusing names (`__proto__`) — that would require a separate denylist beyond IDENT, explicitly out of ticket scope.

## Follow-up

No code change required for merge on security grounds.
