# T-032 Security Review — `placement.ts` (D-6 starters-only)

Reviewer: independent security review (not implementer).  
Impl commit: `ff66b32` — `isCannonEligible` now `unlock.kind === 'starter' && minGrade <= maxGrade`.

Scope: offline pure TS engine — progression/unlock integrity only. No server, network, accounts,
or user-authored cannon data. Prototype pollution, SQLi, XSS, authz, and SSRF do not apply.

## Verdict: PASS

No Critical or Important findings. The one-line change **tightens** placement grants and closes
the wave-3 integration gap where range cannons were pre-awarded at onboarding.

## Change under review

```diff
- return cannon.unlock.kind !== 'chest' && cannon.minGrade <= maxGrade;
+ return cannon.unlock.kind === 'starter' && cannon.minGrade <= maxGrade;
```

Only `src/engine/placement.ts` changed (comment aligned). `mastery.ts` untouched.

## Clean

- **Wrong unlock grants (fixed):** Prior rule granted every non-chest cannon with
  `minGrade <= maxGrade`, including all seven `range` guns (e.g. `k_1` received
  `six_pounder` + `chain_shot` without mastery). New rule grants **starters only** — today
  exactly `swivel_gun` and `culverin` at every band. `nine_pounder` (`chest`) remains excluded.
- **Fail-safe vs old filter:** `=== 'starter'` is strictly safer than `!== 'chest'`. A hypothetical
  future `unlock.kind` would not be auto-granted unless placement is explicitly updated; the old
  filter would have granted it.
- **Input surface:** `resolvePlacement(band)` accepts only the closed `GradeBand` union; invalid
  values throw before eligibility runs. Cannon rows come from the T-003-validated catalog
  (`cannonUnlockSchema` discriminated union: `starter` | `range` | `chest`), not runtime user input.
- **No dynamic execution / pollution:** Pure filter over imported `cannons`; no `eval`, no
  caller-controlled keys, no shared mutable cache (fresh arrays each call — existing AC-9).
- **Mastery path intact:** `resolveUnlocks` still awards `range` guns when skills are mastered;
  composition suite `__tests__/engine/placement-mastery.test.ts` (4 tests) passes — top-band full
  mastery yields all seven range ids without re-listing starters.
- **Tests:** `__tests__/engine/placement.test.ts` + `placement-mastery.test.ts` — **141/141**
  passing (vitest, 2026-07-28).

## Minor (recorded, not blocking)

1. **Catalog-trust for `unlock.kind`** — placement trusts validated catalog tagging. A
   misclassified `range`/`chest` cannon tagged `starter` would be pre-granted; guarded by
   `__tests__/content/catalogs.test.ts` (kind partitions, island↔range linkage). Content-review
   concern, not a placement-engine bypass.
2. **Future starters (T-029)** — any new `starter` with `minGrade <= maxGrade` auto-includes in
   placement by design (module comment documents catalog-driven behaviour). Intentional; not an
   escalation path for non-starters.

## Follow-up

No code change required for merge on security grounds.
