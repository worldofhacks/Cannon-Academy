# T-014 Security Review — K–2 add/sub template JSON

Reviewer: Composer 2.5 (independent).  
Worktree: `/Users/quietguy/Documents/Dev/Gauntlet/Math Game/.worktrees/wt-T-014`  
Commits reviewed: `ab41906` (feat — near_doubles distractor fix), `f0496f2` (style — frozen test prettier only).  
Territory: offline static content — `src/content/templates/add_within_10.json`, `add_within_20.json`, `sub_within_20.json` (24 templates total).

## Verdict: PASS

No Critical, Important, or Minor security findings in the three JSON files.

## Scope

| File | Templates | Change in `ab41906` |
| ---- | --------- | ------------------- |
| `add_within_10.json` | 8 | `add_within_10_near_doubles` third distractor `a + a` → `a + b + 2` |
| `add_within_20.json` | 8 | `add_within_20_near_doubles` third distractor `a + a` → `a + b + 2` |
| `sub_within_20.json` | 8 | unchanged |

`f0496f2` reformats `__tests__/content/templates/k2-addsub.test.ts` only (quote/wrap); no JSON or runtime surface touched.

## Checklist

### 1. No eval-ish content — CLEAN

- Files are static JSON arrays loaded via `JSON.parse` + `templateSchema` (see `k2-addsub.test.ts` loaders).
- Grepped all three files for `eval`, `Function`, `import(`, `require(`, `http://`, `https://`, `//` — zero hits.
- `text` fields are symbolic math skeletons only (`{a} + {b} = ?`, etc.); AC-3 tests reject word-problem prose.
- No backticks, tagged templates, or host-language escape hatches in any field.

### 2. No prototype-key abuse in param names — CLEAN

Param keys across all 24 templates:

| Keys used | Count |
| --------- | ----- |
| `a` | 24 |
| `b` | 12 |
| `c` | 8 |

- Every key matches `[A-Za-z_][A-Za-z0-9_]*` (same grammar as `PARAM_TOKEN` in the frozen suite).
- No `__proto__`, `constructor`, `prototype`, `hasOwnProperty`, `toString`, or other inherited-property names.
- Generator builds params with `Object.keys(template.params).sort()` into a fresh `Record<string, number>` (`generator.ts:98–116`); even a poisoned key would not pollute prototypes, and none is present.

### 3. Constraints / distractors / answerExpr within frozen evaluator grammar — CLEAN

Frozen grammar (`expr.ts` L17–29): arithmetic (`+ - * / %`), comparisons (`== != <= >= < >`), logic (`&& ||`), numeric literals, identifiers, parentheses, and a closed function whitelist (`abs`, `floor`, `ceil`, `min`, `max`, `gcd`).

Content usage (manual inventory of all 24 templates):

| Construct | Present in JSON? |
| --------- | -------------- |
| `+`, `-` | yes |
| `<=`, `>=`, `==` | yes |
| Numeric literals `0…20` | yes |
| Identifiers `a`, `b`, `c` only | yes |
| Parentheses (mostly distractors) | yes |
| `*`, `/`, `%` | **no** |
| `&&`, `\|\|` | **no** |
| Whitelisted function calls | **no** |

- Every identifier appearing in `constraints`, `answerExpr`, or `distractors` is declared in that template's `params` — satisfies static `checkNode` / `Object.hasOwn` resolution in `expr.ts`.
- `sub_within_20_doubles` uses literal `"0"` / `"1"` / `"2"` / `"3"` — valid grammar, no param references needed.
- `sub_within_20_minus_zero` uses `a - 0` — valid; no division-by-zero path.
- Near-doubles fix (`a + b + 2`) is grammar-safe and removes a distractor collision under `b == a + 1` (curriculum/AC-7, not security).

Integration evidence: implementation report records **1493/1493** vitest pass including k2-addsub **55/55**, with AC-5 sweeping seeds 1…1000 per template through `evaluateNumber` / `evaluatePredicate` / `generateQuestion`.

### 4. No secrets / URLs — CLEAN

- No URLs, API keys, tokens, passwords, or email addresses in any JSON field.
- No external resource references; content is fully offline.

## Threat model notes (informational, non-blocking)

- **Trust boundary:** templates are hand-authored, ship-time static assets — same content-trust class as T-007's `renderText` / param-key notes. These files stay well inside the safe subset (single-letter params, no division, no function calls).
- **T-034 follow-up:** `templateSchema` still accepts arbitrary param key strings at load time; current K-2 JSON already uses only `a`/`b`/`c`. Hardening belongs in schema/catalog validation, not in these files.

## Follow-up

No content changes required for merge from a security perspective.
