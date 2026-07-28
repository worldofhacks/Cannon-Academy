# Wave-1 Security Review — T-001 (rng.ts) + T-003 (schemas.ts, questions/types.ts)

Scope reviewed via `git diff swarm/engine-core..HEAD -- src/` in each worktree:
- `wt-T-001/src/engine/rng.ts` (122 lines, new file)
- `wt-T-003/src/content/schemas.ts` (200 lines, new file)
- `wt-T-003/src/engine/questions/types.ts` (64 lines, new file)

Threat model: offline, single-player, no network, no filesystem, no accounts, no server. Findings below are scoped to what actually applies to a pure-TypeScript engine/content layer; inapplicable web-security categories are noted as not applicable rather than padded out.

## 1. Dynamic code execution

Checked both literal and obfuscated/indirect forms: `eval`, `new Function` / aliased `Function`, `globalThis['ev'+'al']`-style string concatenation, `Reflect.construct(Function, …)`, `[]['constructor']['constructor']`, `setTimeout`/`setInterval` with a string argument, dynamic `import()`, `Math.random()`, `Date`.

None present in either diff. The only match for the string `constructor` is the ordinary ES class constructor of `QuestionGenerationError` in `types.ts:36` (`constructor(message: string, code: QuestionGenerationCode)`), which is not a `Function`-constructor access.

**Result: clean.** No finding.

## 2. Prototype pollution / unsafe property access

`schemas.ts` has one place where a hand-authored, attacker-shaped key could matter: `templateSchema.params` is `z.record(paramRangeSchema)` (schemas.ts:70), so a catalog author (or a corrupted JSON file) could supply a `"__proto__"` key.

Verified against the installed zod version (3.25.76, from `node_modules/zod/package.json`) rather than assuming: both `ZodObject` and `ZodRecord` route through the shared `ParseStatus.mergeObjectSync` (`node_modules/zod/v3/helpers/parseUtil.js:82-96`), which explicitly guards:

```js
if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
    finalObject[key.value] = value.value;
}
```

So `__proto__` keys are silently dropped by zod itself for every schema in this file (`templateSchema.params`, and all `.strict()` objects), regardless of nesting. There is no hand-rolled object merge, spread-based clone, or manual `obj[key]` write anywhere in either diff — every property access in `schemas.ts` and `types.ts` goes through zod's own parser or through statically-known field names (`skill.maxGrade`, `cannon.damageMax`, etc.), never through a dynamic/attacker-controlled key.

**Result: clean, confirmed against library source, not assumed.** No finding.

## 3. Denial of service via unbounded work

- `rng.ts`: `shuffle` is a single bounded Fisher-Yates pass, O(n) in the input array length. `weightedPick` does one O(n) summation pass and one O(n) selection pass — no rejection sampling, no retry loop, no recursion. There is no code path where a pathological catalog value causes an unbounded or looping computation.
- `schemas.ts`: the two `superRefine` blocks (`skillSchema`'s `maxGrade >= minGrade` check, `cannonSchema`'s `damageMax >= damageMin` / reliable-recoil check) are both O(1) single comparisons, not loops. `z.record(paramRangeSchema)` parsing is a single pass over the object's own keys, bounded by the size of the hand-authored template file itself (not by any adversarial input growth vector, since there is no untrusted remote input in this layer).

**Result: clean.** No finding.

## 4. Numeric integrity (rng.ts)

- `mulberry32Step` (rng.ts:16-21): all intermediate arithmetic uses `|0` / `Math.imul` / `>>> 0`, so it stays within int32/uint32 range by construction — no overflow into unexpected values. The final division `/ 4294967296` on a `>>> 0`-forced numerator guarantees the result is strictly in `[0, 1)`, never reaching `1.0`. Correct.
- `nextInt` (rng.ts:33-42): guards non-integer `min`/`max` and `min > max` with `RangeError`, which also excludes `NaN`/`Infinity` for those two parameters (`Number.isInteger` returns `false` for both). `Math.floor(f * range)` is safe for any practically-sized range.
- `weightedPick` (rng.ts:80-121): correctly rejects negative weights and non-positive totals, and its top-boundary floating-point fallback (returning the last entry when accumulated `cumulative` narrowly misses `target` due to float rounding) is a deliberate, comment-documented, and correct piece of defensive coding. I hand-traced the zero-weight-between-positive-weights case (`[5, 0, 5]`) and confirmed a `0`-weight entry is never selected, matching the documented contract.
- **Minor observation (not blocking):** `weightedPick` does not itself guard against a `NaN` or `Infinity` weight reaching it — `entry.weight < 0` is `false` for `NaN`, so a `NaN` weight passes the negative check, poisons `total` to `NaN`, and `total <= 0` is also `false` for `NaN`, so the function does not throw. The subsequent comparisons (`target < cumulative`, all `NaN`) never succeed, so execution silently falls through to the last-entry fallback instead of respecting the intended distribution. Similarly, an `Infinity` weight causes every `target < cumulative` comparison to evaluate `Infinity < Infinity → false`, again silently falling through to the last entry rather than always selecting the infinite-weight entry. In the current pipeline this is not reachable: every caller I'd expect to feed `weightedPick` sources weights from `schemas.ts`-validated catalog fields (e.g. `damageMin`/`damageMax`, tier weights), and zod's `.int()` checks already reject `NaN`/`Infinity` at the content-load boundary (`Number.isInteger` is `false` for both), so no currently-validated data path can produce this. Flagging only as defense-in-depth for future callers that might pass a computed (not catalog-sourced) weight.
  - **Suggested fix (optional, not required for this ticket):** in the summation loop, add `if (!Number.isFinite(entry.weight)) throw new RangeError('weightedPick: weights must be finite');` alongside the existing negative-weight check.

**Result: no Critical/Important finding.** One Minor, non-blocking defense-in-depth suggestion.

## 5. Secrets and PII

No hardcoded keys, tokens, credentials, endpoints, or personal data in either diff. Both files are pure data-shape/PRNG logic with no I/O.

**Result: clean, as expected.**

## 6. Dependency risk

Checked `git diff swarm/engine-core..HEAD -- package.json package-lock.json` in both worktrees — **empty in both**. `zod` (`^3.24.1`, resolved `3.25.76`) is already present in the pre-existing manifest and is not a new dependency introduced by this wave's diffs. `rng.ts` introduces zero runtime dependencies (pure arithmetic).

**Result: no new dependency to justify.**

## Categories deliberately not covered

SQL injection, XSS, CSRF, authz/authn gaps, SSRF, and deserialization-of-untrusted-network-input do not apply: there is no server, no network boundary, and no remote untrusted input anywhere in this layer. Omitted rather than padded.

---

## Verdicts

**T-001: PASS**
**T-003: PASS**

No Critical or Important findings in either ticket. One Minor, non-blocking defense-in-depth suggestion for `weightedPick` in `rng.ts` (finite-weight guard) that the team may pick up opportunistically but which does not block merge.
