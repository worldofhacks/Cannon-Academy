# Wave 3 code review — T-009 (economy), T-010 (mastery), T-012 (rank ladder)

Reviewed independently against their tickets, frozen tests, and LESSONS.md L-006, L-012, L-020.
Ground truth (gates green, spec-lint clean, single-file commits, zero test files touched,
798/798, 823/823, 815/815) taken as given and not re-verified.

---

## T-009 — economy.ts

**Files:** `cannon-wt/wt-T-009/src/engine/economy.ts` (82 lines, full new file)
Tests: `cannon-wt/wt-T-009/__tests__/engine/economy.test.ts` (386 lines, 22 tests)

### Spec compliance — APPROVED

- **Loss floor is structural, not incidental.** `COINS_LOSS_BASE = 5` (`tuning.ts:173`),
  `COINS_WIN_BASE = 20` (`tuning.ts:167`). `computeCoinPayout` (`economy.ts:36-49`) computes
  `Math.round(base + COINS_PER_ACCURACY_PERCENT*(accuracy*100) + COINS_PER_PERFECT_SHOT*perfectShots)`.
  Worst case (loss, 0/N correct, 0 perfect) = `round(5+0+0) = 5`. Best case measured at
  `totalAnswers=correctAnswers=perfectShots=10` = `round(20+20+10) = 50` — matches the reviewer's
  measured 5/50 exactly, and the floor is a named tuning constant on every path, not a special case.
- **`CHEST_RARITY_ENTRIES` is built correctly per L-020.** `economy.ts:32-33`:
  `CHEST_RARITIES.map((item) => ({ item, weight: CHEST_RARITY_WEIGHTS[item] }))` — maps T-003's id
  array, never `Object.entries` over the weights record. The test suite doesn't stop at the plain
  ordering assertion (`economy.test.ts:334-338`, which L-020 warns is vacuous today since
  `tuning.ts`'s declaration order happens to match); it also carries a `vi.doMock`-based test
  (`economy.test.ts:342-383`) that rebuilds `CHEST_RARITY_WEIGHTS` with keys in `rare, common,
  uncommon` order and re-imports the module, proving `CHEST_RARITY_ENTRIES` stays
  `common, uncommon, rare` regardless. This is exactly the remedy L-020 prescribes, present and
  correct.
- **Coin rounding cannot emit a fraction:** the only output path is `Math.round(...)`, and
  `Number.isInteger` is asserted at every AC-1/AC-5 case in tests.
- **Both draws thread the `Rng`:** `rollChest` (`economy.ts:75-80`) calls `weightedPick(rng, ...)`
  then `nextInt(rngAfterRarity, ...)` in that order, returning the final advanced `Rng` — matches
  the ticket's "rarity, then coins" ordering and AC-11's determinism/advancement checks.
- All 13 ACs have direct, non-vacuous coverage, including the L-006-flagged anti-vanishing-rate
  checks (AC-3/AC-4 assert the exact formula at every step, not just direction) and the L-012-flagged
  aggregate risks (AC-8 checks per-draw membership, not just the histogram; AC-10 measures actual
  sampled coin means per rarity, not the declared range ordering).

### Code quality — APPROVED

- Pure: no `Math.random`/`Date`; `Rng` threaded explicitly everywhere.
- No `!` or `as` anywhere in the file; `rarity` from `weightedPick` is statically a `ChestRarity`,
  so the `CHEST_COIN_RANGE_BY_RARITY[rarity]` lookup needs no cast or guard.
- Validation (`requireNonNegativeInteger`, `economy.ts:22-26`) is minimal, private, and named per
  field — a caller gets `"computeCoinPayout: correctAnswers must be a non-negative integer"`, not a
  generic message.
- Nothing built beyond the ticket's two functions and the one required export.

**Verdict: APPROVED.** Clean on both dimensions; no findings above Minor, and none worth listing —
this is the strongest of the three implementations.

---

## T-010 — mastery.ts

**Files:** `cannon-wt/wt-T-010/src/engine/mastery.ts` (133 lines, full new file)
Tests: `cannon-wt/wt-T-010/__tests__/engine/mastery.test.ts` (643 lines, 47 tests)

### Spec compliance — APPROVED

- **Dual rate is derived, not duplicated.** `applyAnswer` (`mastery.ts:56-68`) reads
  `MASTERY_RATE_RANGE` / `MASTERY_RATE_DUEL` from `@engine/tuning` and adds the selected rate only
  on a correct answer; no literal `1` or `0.5` appears in the arithmetic. `meterPercent`
  (`mastery.ts:76-79`) and `isMastered` (`mastery.ts:82-84`) likewise reference
  `MASTERY_THRESHOLD_CORRECT` / `MASTERY_MIN_ACCURACY` / `MASTERY_METER_MAX` by name.
- **Accuracy gate is `>=` on both count and accuracy, both inclusive**, exactly matching the
  locked-decision: `mastery.ts:83`, `m.weightedCorrect >= MASTERY_THRESHOLD_CORRECT && accuracy(m) >=
  MASTERY_MIN_ACCURACY`. Test AC-6 (exactly at 10/0.70 → true) and AC-7 (9.5 weighted or 0.667
  accuracy → false) both exercise the boundary from both sides.
- **`emptyMastery` is frozen** (`mastery.ts:44-48`, `Object.freeze`), and **`applyAnswer` is
  non-mutating** — it always constructs a new object, never touches `m`'s fields. The test suite
  goes further than re-reading fields after the call: `mastery.test.ts:185` passes an
  `Object.freeze`d input, so a mutate-in-place implementation would throw under ESM strict mode
  rather than merely fail an equality check — a materially stronger guarantee.
- **The pre-freeze note's literal island rule is implemented exactly as specified**, and the
  reviewer's specific worry (a well-meaning "fix" adding a predecessor-unlocked precondition) is
  addressed directly: `resolveUnlocks`'s island filter (`mastery.ts:117-124`) reads
  `unlockedIslands` only via `alreadyIslands.has(i.id)` to exclude the *candidate* island from the
  delta; it never checks whether `predecessor` (`J`) is itself in `unlockedIslands`. The module
  docstring (`mastery.ts:14-17`) states why, in the implementer's own words, and a dedicated frozen
  test (`mastery.test.ts:528-549`) proves the literal reading by mastering a skill while **neither**
  island is in `unlockedIslands` and confirming the successor's fog still lifts.
- AC-1 … AC-15 all have direct coverage, including the JSON round-trip (AC-15) and the
  idempotence check that masters every catalog skill at once before re-resolving (AC-14,
  `mastery.test.ts:568-586` — the "strongest form" rather than a single hand-picked case).

### Code quality — APPROVED

- Pure, non-mutating throughout; `SkillMastery` is a plain, serialisable, frozen-safe object.
- The one cast in the file, `Object.keys(mastery) as SkillId[]` (`mastery.ts:92`), is the standard,
  narrow workaround for `Object.keys`'s `string[]` erasure on a `Partial<Record<SkillId, …>>`; it is
  immediately followed by an explicit `entry !== undefined` guard before any use
  (`mastery.ts:93-95`), satisfying the ticket's `noUncheckedIndexedAccess` DoD item rather than
  routing around it.
- No hardcoded skill/cannon/island id anywhere; the catalog (`cannons`, `islands`, `getIsland`) is
  the sole source of ids.
- Nothing built beyond the ticket's specified exports.

**Verdict: APPROVED.** No findings above Minor. This is a genuinely clean implementation of the
ticket's most subtle rule (the deliberately non-gated island unlock), including the module
comment explaining *why* it's written that way — exactly what the ticket asked for.

---

## T-012 — ranks.ts

**Files:** `cannon-wt/wt-T-012/src/engine/ranks.ts` (119 lines, full new file)
Tests: `cannon-wt/wt-T-012/__tests__/engine/ranks.test.ts` (375 lines, 39 tests)

### Spec compliance — CHANGES REQUESTED

- **The ratchet is structurally sound.** `advanceRank(currentTier, wins)` (`ranks.ts:82-96`) takes
  exactly the two named parameters, no `won` flag, and returns `Math.max(currentTier,
  rankTierForWins(wins))`. There is no parameter and no internal path capable of expressing a
  demotion — verified structurally (the function signature itself), not just by the 1,000-
  combination sweep (AC-7) or the 200-duel simulated career (AC-8, `ranks.test.ts:20-35`, which
  drives the ratchet through `advanceRank` on every duel and asserts non-decrease). This promise
  holds regardless of the finding below.
- **Thresholds come from the catalog, not transcribed:** `rankTierForWins` and `rankByTier` both
  read `ranks` / `getRankByTier` from `@content/index`; no `minWins` literal appears anywhere in
  `ranks.ts`.
- **Boundaries are inclusive at `minWins`:** `rank.minWins <= wins` (`ranks.ts:54`) promotes on the
  exact boundary, matching AC-3/AC-4.
- **Invalid input is rejected definitely:** `validateNonNegativeInteger` and `validateTier`
  (`ranks.ts:15-31`) throw `RangeError` for negative, non-integer, or out-of-range values before any
  computation runs — no path returns `undefined` or `NaN`. `rankByTier(5)` throws a plain `Error`
  naming the tier (AC-10).

- **Critical/Important finding — `rankTierForWins`'s algorithm depends on catalog array order,
  which nothing guarantees, and this is unguarded by any test.**
  `ranks.ts:49-59`:
  ```ts
  // Find the highest-tier rank whose minWins does not exceed wins.
  // Because minWins is strictly increasing (T-006 AC-7), the last match is the answer.
  let resultTier = 0;
  for (const rank of ranks) {
    if (rank.minWins <= wins) {
      resultTier = rank.tier;
    }
  }
  return resultTier;
  ```
  This is a **misreading of T-006 AC-7**. That AC says: *"Given `ranks`, **when sorted by tier**,
  then ... `minWins` is strictly increasing"* (tickets/T-006.md:129-131) — a guarantee about the
  catalog's *values* once sorted, not a promise that `@content/index`'s exported `ranks` array is
  itself pre-sorted. Checking `src/content/index.ts:74`, `ranks` is simply
  `parseCatalog('ranks', rankSchema, ranksRaw)` — the raw JSON array, unsorted, in whatever order
  `ranks.json` lists its entries. The loop's "last match wins" logic silently assumes the array is
  already tier-ascending; it happens to be true today only because `ranks.json` lists
  `cadet, ensign, captain, commodore, fleet_legend` in that order.

  I verified this is a real defect, not a theoretical one, by reproducing the exact algorithm
  standalone: with the same five rank records reordered to
  `[commodore, cadet, ensign, captain, fleet_legend]` (values unchanged, array position only),
  `rankTierForWins(60)` returns `2` instead of the correct `3` (a `commodore`-tier player would be
  told they're merely `captain`). Sorted-order input correctly returns `3`.

  This is precisely the pattern LESSONS.md L-020 documents ("a test can pass for the wrong reason
  when two orderings coincide") — except here it's in production logic, not a test, and unlike
  T-009's `CHEST_RARITY_ENTRIES` (which defends against exactly this by mapping the id array rather
  than trusting record/array order, and which is proven by a mocked-reorder test), **no test in
  `ranks.test.ts` reorders the catalog.** Every AC-2/AC-3/AC-4/AC-11 test builds its expectations
  from `[...ranks].sort((a, b) => a.tier - b.tier)` (`ranks.test.ts:12-13`, `273-306`) and then
  exercises `ranksModule` against the *same, already-sorted* real catalog — so the suite is
  structurally unable to distinguish this implementation from a correct order-independent one
  (e.g. `Math.max(0, ...ranks.filter(r => r.minWins <= wins).map(r => r.tier))`).

  **Why it doesn't currently fail anything:** `ranks.json` ships in tier order, and the ratchet
  itself (`Math.max(currentTier, earnedTier)`) can't demote regardless of what `earnedTier` computes
  to — so the specific "loss never demotes" guarantee this ticket exists to protect is not at risk.
  What is at risk is the ladder's basic correctness (`rankTierForWins` returning the wrong tier for a
  valid win count) the moment `ranks.json` is ever reordered for any ordinary reason (alphabetizing,
  editorial cleanup) — exactly the maintenance action L-020 warns is when such bugs "surface later."
  **Recommend:** replace the loop with an order-independent reduction (max over matching tiers, or
  sort a local copy before scanning), and add a mocked-reorder test on `@content/index` analogous to
  `economy.test.ts:342-383`.

- **Minor — dead/redundant error-enrichment in `rankByTier`.** `ranks.ts:106-119` wraps
  `getRankByTier(tier)` in a `try/catch` that re-checks `tier < 0 || tier > 4` and throws a new
  `Error` — but `getRankByTier` (`src/content/index.ts:97-99`) already throws
  `` `getRankByTier: no rank with tier ${tier}` ``, which already names the tier and satisfies AC-10
  on its own. The wrapper adds no information, duplicates the hardcoded tier-count literal `4`
  (which also appears in `validateTier`, `ranks.ts:29`) a second time, and the `else` branch
  (`throw err`) is unreachable in practice since `getRankByTier` has exactly one throw site. Simplify
  to `return getRankByTier(tier);` unless there's a reason to prefer `Error` over the same message
  `getRankByTier` already produces.

### Code quality

- Pure, no `Math.random`/`Date`, no `!`/`as` anywhere in the file.
- Otherwise minimal and readable; the two validators are shared correctly across the exported
  functions per the ticket's shape.
- The two findings above (the ordering dependency and the redundant catch) are the only quality
  issues; nothing else stood out.

**Verdict: CHANGES REQUESTED.** The ratchet guarantee — the ticket's headline promise — is sound
and well-tested. But `rankTierForWins`'s core lookup is not actually "the highest tier whose minWins
<= wins" in general; it is "the last catalog entry in array order satisfying that," which only
coincides with the correct answer because `ranks.json` happens to be pre-sorted, and no test
exercises the case where it isn't. This is a real, demonstrated defect in the load-bearing
wins→tier mapping, unguarded by the frozen suite, and should be fixed (order-independent
computation) with a companion reorder test before this ticket is approved.

---

## Summary

| Ticket | Spec compliance | Code quality | Verdict |
|---|---|---|---|
| T-009 economy | APPROVED | APPROVED | **APPROVED** |
| T-010 mastery | APPROVED | APPROVED | **APPROVED** |
| T-012 ranks | CHANGES REQUESTED (1 Important) | CHANGES REQUESTED (1 Minor) | **CHANGES REQUESTED** |
