# T-032 Code Review — Placement grants starter cannons only (D-6)

Reviewer: senior-engineer pass, independent of implementation.

Files read: `tickets/T-032.md`, `src/engine/placement.ts`, `src/engine/mastery.ts`,
`__tests__/engine/placement.test.ts` (frozen `b07759c1…`), `__tests__/engine/placement-mastery.test.ts`
(frozen `f90cc079…`), `src/content/cannons.json`, `src/content/schemas.ts`,
`.tdd-swarm/reports/T-032-implementation.md`, `git diff 7696a0c..ff66b32`.

Independently re-verified rather than trusted: ran
`npx vitest run __tests__/engine/placement.test.ts __tests__/engine/placement-mastery.test.ts`
→ **141/141 passed**; inspected impl commit `ff66b32` (exactly one production file changed).

---

## 1. SPEC COMPLIANCE

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 | **Met** | `isCannonEligible` (`placement.ts:44-46`) now requires `unlock.kind === 'starter'`. Hand-traced all three bands against `cannons.json`: only `swivel_gun` and `culverin` pass; all seven `range` and one `chest` cannon fail. Per-band sweep at `placement.test.ts:372-386` and full `GradeBand × CannonId` dimension sweep at `placement.test.ts:420-432` pass. |
| AC-2 | **Met** | At `k_1` (`maxGrade=1`), starters with `minGrade 0` pass `minGrade <= maxGrade`; `six_pounder`/`chain_shot` (`range`, `minGrade 1`) no longer pass despite grade reachability. Returns exactly `{swivel_gun, culverin}`. Tests at `placement.test.ts:122-146`, DoD pin `placement.test.ts:571-574`. |
| AC-3 | **Met** | `g2_3` and `g4_5` both return the catalog starter set (`expectedCannonIds(3/5)` — today the same two starters). Named exclusions (`six_pounder`, `chain_shot`, `twelve_pounder`, `mortar`, `double_broadside`, `powder_keg`, `long_nine`, `nine_pounder`) verified absent at `placement.test.ts:179-218`. |
| AC-4 | **Met** | `isIslandEligible` and `sortIslands` untouched (`placement.ts:52-54, 65-70`). Island prefix / `port_sumwich` / `k_1 → [port_sumwich]` / `g4_5 → all islands` behaviour unchanged — only cannon filter changed. Tests at `placement.test.ts:186-191, 224-256, 463-471`. |
| AC-5 | **Met** | `resolvePlacement('g4_5')` leaves all seven range ids out of `unlockedCannons`; `resolveUnlocks` with full mastery returns exactly those seven (`placement-mastery.test.ts:46-84`). Proves the wave-3 overlap bug is fixed without touching `mastery.ts`. |
| AC-6 | **Met** | `k_1` placement excludes `six_pounder`/`chain_shot`; mastering `add_within_20` + `sub_within_20` yields them via `resolveUnlocks` without re-listing starters (`placement-mastery.test.ts:88-105`). Empty mastery yields `[]` delta (`placement-mastery.test.ts:107-115`). |
| AC-7 | **Met** | Meta-tests confirm old four-cannon / nine-cannon expectations are gone from the placement suite (`placement.test.ts:396-408`). Amended T-011 AC-2/4/5 tags pass under starters-only rule. |

**DoD:**

- Every AC has a passing `spec(T-032:AC-n)` test — confirmed by grep + 141/141 run.
- Amended T-011 cannon criteria still pass — `spec(T-011:AC-2/4/5)` tags green in the same run.
- Gates green / spec-lint green — asserted in implementation report; placement suites independently green.
- `resolvePlacement('k_1').unlockedCannons` exactly two starters — hand-traced and tested (`dod(T-032:5)`).
- Fully-mastered `g4_5` earns all seven range guns through `resolveUnlocks` — composition test + hand trace.
- Files changed exactly `file_scopes` — impl commit touches only `src/engine/placement.ts`; test files frozen at pre-impl hashes.
- No edit to `mastery.ts` or `mastery.test.ts` — confirmed; delta semantics were already correct.

**Owner ruling D-6:** Placement pre-unlocks islands to band and **starter cannons only**; every non-starter cannon is mastery/chest-earned. The one-line eligibility flip (`!== 'chest'` → `=== 'starter'`) is the minimal, correct expression of this ruling.

**Nothing the ticket did not ask for.** No extra exports, no speculative options, no scope creep beyond the eligibility predicate and its JSDoc.

---

## 2. CODE QUALITY

**The fix (highest-priority check).** `placement.ts:44-46`:

```ts
function isCannonEligible(cannon: Cannon, maxGrade: number): boolean {
  return cannon.unlock.kind === 'starter' && cannon.minGrade <= maxGrade;
}
```

This is strictly tighter and clearer than the pre-D-6 rule (`!== 'chest'`). The old predicate accidentally admitted every `range` cannon whose `minGrade <= maxGrade`, which is exactly the wave-3 bug. The new positive check (`=== 'starter'`) aligns with the schema's three-way `UnlockKind` union (`starter | range | chest` in `schemas.ts:117-125`) and with the test oracle duplicated in `placement.test.ts:60-62`. Reachability semantics (`minGrade <= maxGrade`, not outgrown) are preserved — a future T-029 third starter with `minGrade 0` would still pass at every band.

**Island logic untouched.** Confirmed no accidental edit to `isIslandEligible`, `sortIslands`, or `resolvePlacement`'s island branch. D-6 explicitly scopes to cannons; islands remain band-scoped.

**Composition contract.** `mastery.ts:119-121` filters `unlock.kind === 'range'` and excludes ids already in `unlockedCannons`. With starters-only placement, the delta is non-empty for mastered skills — the composition tests' sanity checks (`placement must leave '${id}' for mastery`) would catch any regression back to pre-granting range guns.

**Playable start.** Still guaranteed by construction: both starters have `minGrade: 0` and `unlock.kind: 'starter'`, so every band owns at least one cannon whose skill is reachable (`placement.test.ts:507-518`).

**Freshness / purity / determinism.** Unchanged from T-011 — no module-level cache, fresh arrays per call, no forbidden imports. AC-9/AC-10 tests still pass in the frozen suite.

**JSDoc on `isCannonEligible`.** Updated accurately for D-6 (`placement.ts:39-43`) — cites starter-only, range mastery-earned, chest reward.

**Minor observation (not a defect):** Module-level doc comment at `placement.ts:4-5` still reads "pre-unlocks the islands and **cannons up to the player's declared band**". Post-D-6, islands are band-scoped but cannons are starters-only (not all grade-reachable cannons). The `isCannonEligible` JSDoc is correct; the module header predates the ruling and is slightly stale. Cosmetic documentation drift only — behaviour and function-level docs are accurate.

No Critical or Important findings in either verdict.

---

## Severity summary

- **Critical:** none.
- **Important:** none.
- **Minor:** one — stale module-level header at `placement.ts:4-5` still describes pre-D-6 cannon semantics.

Both verdicts are clean of Critical and Important findings. The eligibility flip is minimal, correct, and fully covered by frozen suites plus composition proofs. Island behaviour, reachability semantics, and mastery delta semantics are preserved.

## Verdict

| Dimension | Verdict |
|-----------|---------|
| **SPEC COMPLIANCE** | **APPROVE** |
| **CODE QUALITY** | **APPROVE_WITH_NITS** |

**Overall: APPROVE_WITH_NITS**

**One-liner:** One-line `=== 'starter'` flip correctly implements D-6 with full AC coverage; only nit is a stale module header at `placement.ts:4-5`.
