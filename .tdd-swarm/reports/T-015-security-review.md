# T-015 Security Review — grade 2–3 template JSON

Reviewer: security subagent (independent of implementer).  
Worktree: `/Users/quietguy/Documents/Dev/Gauntlet/Math Game/.worktrees/wt-T-015`  
Impl commit: `30d2f83`. Frozen suite: `g23.test.ts` @ `3ec4364` (SHA-256 `f941a204…`, unchanged).

## Verdict: PASS

No Critical or Important findings. Offline, developer-authored content only — no runtime user input, network, or code execution surface in these files.

## Scope

Three static JSON catalogs:

| File | Templates |
| --- | ---: |
| `src/content/templates/place_value_compare.json` | 8 |
| `src/content/templates/two_step_add_sub.json` | 8 |
| `src/content/templates/mult_facts.json` | 8 |

Threat model matches wave-2/3 content reviews: bundled catalogs consumed at build/load time, not player-editable. Checks requested: eval-ish content, param-key safety, expression grammar conformance, secrets/URLs, prototype-key abuse.

## 1. Dynamic / eval-ish content — CLEAN

Grepped all three files for `eval`, `Function`, `import(`, `require(`, `constructor`, `__proto__`, `prototype`, `http://`, `https://`, `www.`, credential/token patterns — no hits.

Display `text` uses plain prose and `{param}` placeholders only. Multiplication display uses the Unicode `×` (U+00D7) in `text`; `answerExpr` / `constraints` / `distractors` use `*` per T-002 grammar — intentional split, not an execution vector.

## 2. Param keys — CLEAN

All param keys across 24 templates: `a`, `b`, `c`, `d` — each matches T-002 `IDENT := [A-Za-z_][A-Za-z0-9_]*`. No `__proto__`, `constructor`, `prototype`, or other prototype-chain names.

Every `{token}` in `text` resolves to a declared own param (bi-consistency also enforced by frozen AC-4 in `g23.test.ts`).

Note: schema-level param-key grammar tightening is deferred to T-034; these files are already compliant.

## 3. Expression grammar — CLEAN

137 expression strings total (`answerExpr`, `constraints`, `distractors`):

| Metric | Value |
| --- | --- |
| Longest expression | 31 chars (`((floor(a / 10) % 10) * 10) + 1`) |
| Longest display text | 67 chars |
| Functions used | `floor`, `max` only (both T-002-whitelisted) |
| Forbidden syntax | none — no quotes, brackets, braces, semicolons, property access, or unknown calls |

Operators and comparisons used: `+ - * / % ( ) == != <= >= < > && ||` — all within the frozen grammar in `src/engine/questions/expr.ts`.

Division paths in `mult_facts` missing-factor templates are guarded by `c % a == 0` / `c % b == 0` constraints before `c / a` or `c / b` is evaluated.

Expression length is far below any DoS threshold for the T-002 evaluator (max ~31 chars vs. thousands needed for stack overflow).

## 4. Secrets / URLs / PII — CLEAN

No URLs, email-shaped strings, filesystem paths, API keys, tokens, or credentials in any field.

## 5. Prototype-key abuse — CLEAN

- Param keys are short alphabetic identifiers, not polluting names.
- Text placeholders reference only declared params.
- At runtime, `evaluateNumber` / `evaluatePredicate` resolve identifiers via `Object.hasOwn` (T-002); these templates never introduce a `constructor`/`__proto__` param that could confuse `renderText`'s `params[name] === undefined` check (T-007 M-1 content-trust class).

## Verification

Disposable inline probe (not committed) over all 24 templates: **0 findings**.

Frozen suite: `npx vitest run __tests__/content/templates/g23.test.ts` — **53/53 PASS** (includes 1,000-seed `generateQuestion` sweep per template via the frozen evaluator).

## Summary

| # | Check | Result |
| --- | --- | --- |
| 1 | No eval-ish / codegen strings | Clean |
| 2 | Safe param keys (`IDENT` grammar) | Clean — `{a,b,c,d}` only |
| 3 | Expressions within frozen evaluator grammar | Clean — `floor`/`max`, short arithmetic |
| 4 | No secrets / URLs | Clean |
| 5 | No prototype-key abuse | Clean |

## Follow-up

No code or content change required for merge. T-034 remains the right home for schema-level param-key enforcement; T-019 for catalog aggregation.

**T-015: PASS — offline template JSON is grammar-safe, key-safe, and free of eval/URL/secret content.**
