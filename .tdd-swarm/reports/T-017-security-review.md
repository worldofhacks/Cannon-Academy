# T-017 Security Review — `drill.ts`

Reviewer: Composer 2.5 (independent).  
Worktree: `/Users/quietguy/Documents/Dev/Gauntlet/Math Game/.worktrees/wt-T-017`  
Commit reviewed: `2572fbd` (`2572fbda13144da3f71e169d0119b12a4efa7b03` — `feat(T-017): range drill session`).  
Territory: offline pure engine — `src/engine/drill.ts` only (199 lines).  
Frozen suite: `7db026f67f89e6dc54b03cd33e9a520d1b2dd32190034147a2ec9ec8adc11d49` (prefix `7db026f6…`); live probe **32/32** pass.

## Verdict: PASS_WITH_NOTES

No Critical or Important findings. Offline single-player engine layer — no network, persistence, or runtime user-authored templates.

## Scope

| Export / type | Role |
| --- | --- |
| `DrillSession`, `DrillAnswer` | Plain JSON session vocabulary |
| `startDrill` | Validates length, deep-copies ingress, first `generateQuestion` |
| `answerDrill` | Grades answer, `applyAnswer(..., 'range', ...)`, advances or completes |

Dependencies reviewed at boundary only: `generateQuestion` (T-007), `applyAnswer` (T-010), seeded `Rng` (T-004).

## Checklist

### 1. No eval / dynamic code — CLEAN

- Grepped `2572fbd:src/engine/drill.ts` for `eval`, `Function(`, `new Function`, `import(`, `require(` — zero hits.
- No runtime code construction; `answerExpr` / `text` strings are stored on the session and evaluated only inside frozen `generateQuestion` → `evaluateNumber` / `evaluatePredicate` (T-002).
- Territory is orchestration only — no expression parsing in this module.

### 2. No `Date` / `Math.random` side channels — CLEAN

- Source contains no `Date` or `Math.random` identifiers.
- All randomness threads the injected seeded `Rng`; wall-clock enters only as caller-supplied `elapsedMs` (logged, not read).
- Behavioural proof: DoD-5 poisons `Math.random` and `Date` while running a full drill — suite green.

### 3. Safe error paths — CLEAN

| Path | Behaviour |
| --- | --- |
| Invalid `length` (`0`, negative, non-integer, `NaN`, `±Infinity`) | `RangeError` from `assertValidLength`; no session returned |
| Empty template pool | `QuestionGenerationError` / `NO_TEMPLATE` from `generateQuestion`; no session returned |
| Invalid `choiceIndex` / `elapsedMs` | `RangeError` from `assertValidAnswer`; **input session unchanged** (AC-6) |
| Answer on complete session | `Error` matching `/complet/i`; input unchanged |
| Mid-drill `generateQuestion` failure | Throws before return; input session unchanged (functional update never assigned) |

No silent fallbacks, no partial mutation of the caller's session on validation failure.

### 4. No prototype pollution via session fields — CLEAN

- `copyParams` iterates `Object.keys(params)` into a fresh object — no `for…in`, no merge/spread of untrusted maps.
- `copyTemplate` copies an explicit field list (same pattern as T-013 `duel/types.ts`); optional arrays cloned with spread.
- Session scalars are primitives; `log` / `recentTemplateIds` rebuilt with spread on each answer.
- No `in` / prototype-chain lookups on caller-supplied records inside this module.
- Residual `__proto__` as an own param key is the content-trust class documented in T-007 M-2 / T-034 — not introduced here.

### 5. No secrets — CLEAN

- No URLs, API keys, tokens, passwords, or credential-like strings in source or error messages beyond template ids and numeric validation diagnostics.

### 6. Immutability — CLEAN (contract; see Minor)

- **`answerDrill` does not mutate its input session** — AC-13 / DoD-6 pin this behaviourally.
- **`startDrill` decouples from caller ingress:** `copyTemplates(input.templates)`, `copyMastery(input.mastery)` — mutating caller arrays/objects after `startDrill` does not affect the returned session.
- **Functional updates:** each answer returns a new `DrillSession` object; `log` and `recentTemplateIds` are new arrays; `mastery` is a new object from `applyAnswer`.
- `templates` on the session is the same deep-copied array identity for the drill lifetime (intentional for JSON restore / `generateQuestion` — mirrors T-013 duel `templatesBySkill`).

### 7. Template injection handled safely — CLEAN

- Templates are injected at `startDrill` and deep-copied before any question generation.
- Expression evaluation never occurs in `drill.ts`; it delegates to the frozen T-002 evaluator via T-007.
- Trust boundary: hand-authored, schema-validated content (`templateSchema` in tests; catalog load in production) — same class as T-007/T-014/T-016.
- `answerDrill` never interprets template strings; it only compares `choiceIndex` to `current.correctIndex`.

## Minor (recorded, not blocking)

1. **Runtime freeze absent** — `DrillSession` immutability is TypeScript `readonly` plus functional updates, not `Object.freeze`. A caller that mutates a returned session (e.g. `session.templates[0].params.a = …`) can corrupt their own subsequent `answerDrill` calls. Same contract as other engine state types; not a FAIL driver for offline play.
2. **`session.current` / `Question` objects** — references from `generateQuestion` are not deep-frozen; mutating choices before answering is caller-side only (single-player).
3. **Inherited T-007 content-trust notes** — `renderText` membership and exotic param keys remain catalog/schema concerns (T-034), not regressions in this orchestrator.

## Follow-up

No code change required for merge from a security perspective. Wave-4 integration may proceed.
