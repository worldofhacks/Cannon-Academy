# T-007 Security Review — `generator.ts`

Reviewer: Composer 2.5 (independent of Grok implementer).  
Impl commit: `a358270`. Frozen suite: `1a586570…`.

## Verdict: PASS_WITH_NOTES

No Critical or Important findings. Offline single-player engine layer — no server, network, or runtime user-authored templates.

## Clean

- No `eval` / `Function` / dynamic import / `Math.random` / `Date`
- All evaluation via frozen `evaluateNumber` / `evaluatePredicate` / `buildDistractors`
- Loops bounded by `MAX_PARAM_SAMPLE_ATTEMPTS` and `CHOICE_COUNT`
- Key iteration via `Object.keys(…).sort()` — no `for…in`
- Territory: only `generator.ts` in the impl commit

## Minor (recorded, not blocking)

1. **`renderText` membership** (`generator.ts:52–54`) — uses `params[name] === undefined` rather than `Object.hasOwn`. A `{__proto__}` token can render as `"[object Object]"` instead of `INVALID_QUESTION`. Content-trust only; T-034 / identifier grammar are the proper guardrails.
2. **`__proto__` as a param key** during draw assignment — no global pollution; expressions fail via `expr.ts` `hasOwn`. Same content-trust class.
3. **Non-`ExprError` passthrough** — bare `RangeError` from `nextInt` if ranges are non-integer; schema/catalog validation is the load-time guard.
4. **Error message embeds full `template.text`** — content-controlled size; intentional for diagnosis.

## Follow-up

No code change required for merge. T-034 (param key grammar) and catalog load validation remain the right homes for M-1/M-2.
