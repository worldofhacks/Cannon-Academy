# T-016 Security Review — grade 3–5 template JSON

Reviewer: Composer 2.5 (independent).  
Worktree: `/Users/quietguy/Documents/Dev/Gauntlet/Math Game/.worktrees/wt-T-016`  
Commit reviewed: `1198daa` (`1198daab8c1f3b389e705a5fe4058e9d6aa9be3f` — refresh after ladder fix).  
Territory: offline static content — `src/content/templates/div_facts.json`, `fractions_int.json`, `multi_digit_order_ops.json` (24 templates total).

## Verdict: PASS

No Critical, Important, or Minor security findings in the three JSON files.

## Scope

| File | Templates | Change in `1198daa` |
| ---- | --------- | ------------------- |
| `div_facts.json` | 8 | `div_facts_same` distractors `["0","2","a"]` → `["0","2","3"]` |
| `fractions_int.json` | 8 | unchanged (included in review scope) |
| `multi_digit_order_ops.json` | 8 | `no_paren` / `paren` param tightening + distractor fixes; `times_minus` distractor `a * (b - c)` → `a * b` |

## Checklist

### 1. No eval-ish content — CLEAN

- Files are static JSON arrays loaded via `JSON.parse` + `templateSchema`.
- Grepped all three files for `eval`, `Function`, `import(`, `require(`, `http://`, `https://`, `//` — zero hits.
- `text` fields are math skeletons and short word problems (`{a} ÷ {b} = ?`, `How many {d}ths make {n} wholes?`, etc.); no host-language escape hatches, backticks, or tagged templates.
- Expression strings (`answerExpr`, `constraints`, `distractors`) are consumed exclusively by the frozen `evaluateNumber` / `evaluatePredicate` path — no runtime code construction.

### 2. No prototype-key abuse in param names — CLEAN

Param keys across all 24 templates:

| Keys used | Templates referencing |
| --------- | --------------------- |
| `a` | 22 |
| `b` | 18 |
| `c` | 10 |
| `d` | 3 |
| `n` | 1 |

- Every key matches `[A-Za-z_][A-Za-z0-9_]*` (same grammar as `IDENT` in `expr.ts`).
- No `__proto__`, `constructor`, `prototype`, `hasOwnProperty`, `toString`, or other inherited-property names.
- Every `{name}` placeholder in `text` names a key declared in that template's `params`.
- Generator builds params into a fresh `Record<string, number>` with sorted keys; even a poisoned key would not pollute prototypes, and none is present.

### 3. Constraints / distractors / answerExpr within frozen evaluator grammar — CLEAN

Frozen grammar (`expr.ts` L17–29): arithmetic (`+ - * / %`), comparisons (`== != <= >= < >`), logic (`&& ||`), numeric literals, identifiers, parentheses, and a closed function whitelist (`abs`, `floor`, `ceil`, `min`, `max`, `gcd`).

Content usage (inventory of all 137 expression strings across 24 templates):

| Construct | Present in JSON? |
| --------- | -------------- |
| `+`, `-`, `*`, `/`, `%` | yes |
| `==`, `!=`, `<=`, `>=` | yes |
| Numeric literals (`0`–`1000`) | yes |
| Identifiers `a`, `b`, `c`, `d`, `n` only | yes |
| Parentheses | yes |
| `&&`, `\|\|` | **no** |
| Whitelisted function calls | **no** |

- Every identifier in `constraints`, `answerExpr`, or `distractors` is declared in that template's `params` — satisfies static `checkNode` / `Object.hasOwn` resolution in `expr.ts`.
- Longest expression is 19 characters (`(a + b) * c <= 1000`); well inside `MAX_AST_DEPTH` / token-count bounds — no DoS vector from expression size.
- `div_facts_same` literal distractors `["0","2","3"]` are grammar-safe; removing bare `"a"` eliminates a param-evaluation distractor (curriculum/AC-11, not a security regression).

Integration evidence: frozen suite `__tests__/content/templates/g35.test.ts` — **56/56** pass (live probe this review), sweeping seeds 1…1000 per template through `evaluateNumber` / `evaluatePredicate` / `generateQuestion`.

### 4. No secrets / URLs — CLEAN

- No URLs, API keys, tokens, passwords, or email addresses in any JSON field.
- No external resource references; content is fully offline.

## Threat model notes (informational, non-blocking)

- **Trust boundary:** templates are hand-authored, ship-time static assets — same content-trust class as T-014/T-007. These files use only single-letter param keys and stay within the safe arithmetic subset.
- **Real division:** `expr.ts` performs true division; `div_facts` templates correctly guard with `b != 0` / `a % b == 0` constraints so answers stay integer — curriculum integrity enforced by AC-5/AC-6 tests, not an injection surface.
- **T-034 follow-up:** `templateSchema` still accepts arbitrary param key strings at load time; current grade 3–5 JSON already uses only `a`/`b`/`c`/`d`/`n`. Hardening belongs in schema/catalog validation, not in these files.

## Follow-up

No content changes required for merge from a security perspective.
