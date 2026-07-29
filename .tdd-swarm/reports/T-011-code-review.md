# T-011 Code Review — Grade-band placement

Reviewer: senior-engineer pass, independent of implementation.

Files read: `tickets/T-011.md`, `cannon-wt/wt-T-011/src/engine/placement.ts`,
`__tests__/engine/placement.test.ts` (123 tests), `src/content/schemas.ts`, `src/content/index.ts`,
`src/content/{cannons,islands,skills}.json`, `src/engine/tuning.ts`, `.tdd-swarm/LESSONS.md`
(L-005, L-012, L-017), `git diff swarm/engine-core..HEAD -- src/`.

Independently re-verified rather than trusted: ran `npx vitest run __tests__/engine/placement.test.ts`
→ **123/123 passed**; ran `npx tsc --noEmit -p .` → **exit 0**.

---

## 1. SPEC COMPLIANCE

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 | **Met** | `placement.ts:33-37` `MAX_GRADE_BY_BAND = { k_1: 1, g2_3: 3, g4_5: 5 }`, applied at `placement.ts:88`. Matches ticket verbatim; test file's own `it.each([...GRADE_BANDS])` sweep (test:90-94) confirms no band falls through. |
| AC-2 | **Met** | `isCannonEligible` (`placement.ts:44-46`) filters `k_1` (maxGrade=1) to exactly `swivel_gun, culverin` (minGrade 0, starter) + `six_pounder, chain_shot` (minGrade 1, range); `nine_pounder`/others excluded by grade or chest-kind. Hand-traced against `cannons.json` and matches AC-2's named set exactly. Test 99-117 passes. |
| AC-3 | **Met** | `placement.ts:45`: `cannon.unlock.kind !== 'chest'` unconditionally excludes chest cannons at every band — structural, not a per-id check, so it also covers any future second chest cannon (test:126-135 sweeps all chest-kind ids). |
| AC-4 | **Met** | At `maxGrade=5`, every cannon in `cannons.json` has `minGrade <= 5`, so all 9 non-chest cannons pass `isCannonEligible`; every island's `rangeSkills` contains a skill with `minGrade <= 5` (skills.json max is 5), so all 5 islands pass `isIslandEligible`. Verified by hand against the catalog. |
| AC-5 | **Met** | At `g2_3` (maxGrade=3): `twelve_pounder` (minGrade 3), `mortar` (minGrade 3), `double_broadside` (minGrade 2) all pass; `powder_keg` (minGrade 4) and `long_nine` (minGrade 5) both fail `minGrade <= 3`. Matches exactly. |
| AC-6 | **Met** | `isIslandEligible` uses `.some(...)` (not `.every`) — confirmed at `placement.ts:52-54`. Hand-traced prefix property: k_1→`[port_sumwich]` (order 0), g2_3→`[port_sumwich, isla_products, quotient_cove]` (orders 0,1,2 — `quotient_cove` becomes eligible at maxGrade 3 because `div_facts.minGrade = 3`), g4_5→ all 5 (orders 0-4). All contiguous prefixes, `port_sumwich` present in all three. `sortIslands` (`placement.ts:65-70`) sorts by `order` so the returned array's order is itself the prefix, not just derivable from it. |
| AC-7 | **Met** | k_1 → `[port_sumwich]` exactly, per AC-6 trace above. |
| AC-8 | **Met** | `placement.ts:92,98`: `tunedBand = BOT_ACCURACY_BAND_BY_GRADE[band]`, returned as `{min: tunedBand.min, max: tunedBand.max}` — deep-equal to the source by construction. Checked `tuning.ts:229-231` values (k_1 .5/.7, g2_3 .55/.75, g4_5 .6/.8): all satisfy `0 < min < max <= 1`. |
| AC-9 | **Met** | No module-level cache. Every call re-filters `cannons`/`islands` (fresh via `.filter`), then `.slice().sort().map()` (two more fresh arrays) — the returned `CannonId[]`/`IslandId[]` share no reference with any prior call's array or with the catalog's own array. Independently confirmed by running the frozen mutate-then-recall test (123/123 pass includes this). |
| AC-10 | **Met** | `placement.ts:82-86`: checked via `GRADE_BANDS.includes(band)` before any lookup, throws `Error` with the band interpolated via `JSON.stringify` into the message — matches on arbitrary bad strings, `null`, `undefined`, `0`, `{}`, `[]`, and the whole union array passed as one value (test:270-297, all pass). |
| AC-11 | **Met** | `unlockedCannons`/`unlockedIslands` are produced by `.map((c) => c.id)` directly off the validated `cannons`/`islands` catalog arrays — every id is real by construction, and `.filter` cannot introduce a duplicate from a catalog with unique ids. |

**DoD:**
- Every AC has a passing `spec(T-011:AC-n)` test — confirmed by inspection of the test file and the independent 123/123 run.
- Gates green / spec-lint green — asserted as ground truth, consistent with the implementation report at `.tdd-swarm/reports/T-011-implementation.md`.
- **Derived, not hardcoded**: `unlockedCannons`/`unlockedIslands` are computed from `cannons`/`islands`/`getSkill` at call time; no cannon or island id list appears in the module. The one literal, `MAX_GRADE_BY_BAND`, is a grade-band→grade mapping the ticket itself pins in AC-1 (not a cannon/island id list), and is invariant under a T-029-style catalog addition since `GradeBand`'s three values and their top grades are fixed by the ticket, independent of catalog contents.
- Returned arrays fresh/sorted/safe — met, see AC-9.
- No `Math.random`/`Date`/React-RN-Expo-Firebase import — confirmed by reading the full file; only imports are `@content/index`, `@content/schemas`, `@engine/tuning`.
- Files changed exactly `file_scopes` — `git diff swarm/engine-core..HEAD -- src/` shows one new file, `src/engine/placement.ts`; no test file touched.

**Nothing the ticket did not ask for.** The module contains no extra exports, no speculative options, no unused parameters.

---

## 2. CODE QUALITY

**The cannon eligibility rule (highest-priority check).** `placement.ts:44-46` reads:
```ts
function isCannonEligible(cannon: Cannon, maxGrade: number): boolean {
  return cannon.unlock.kind !== 'chest' && cannon.minGrade <= maxGrade;
}
```
This is the ticket's "reachable" rule (`minGrade <= maxGrade`), not the "outgrown" misreading
(`maxGrade <= maxGrade`) the ticket explicitly warns against. Confirmed correct by hand-tracing
every band against the real catalog (AC-2/4/5 above) — a 5th grader (`g4_5`) gets all 9 non-chest
cannons including the two starters, not just the hardest guns.

**Freshness of returned structures.** Genuinely fresh: `cannons.filter(...)` and `islands.filter(...)`
each allocate a new array from the module-scope catalog array; `sortCannons`/`sortIslands` call
`.slice()` before `.sort()` (never sorting in place) and finish with `.map()`, which allocates
again. No frozen or shared catalog array is returned by reference; the `botAccuracyBand` object is
also rebuilt field-by-field (`{min: tunedBand.min, max: tunedBand.max}`) rather than returning the
deep-frozen `tuning.ts` object directly. Confirmed behaviourally by the AC-9 mutate-and-recall test.

**Derivation, not transcription.** No cannon or island id appears as a string literal anywhere in
the module. Both eligibility functions read live catalog fields (`unlock.kind`, `minGrade`,
`rangeSkills`) via the T-003-validated `@content/index` exports. A future T-029 catalog addition
changes `resolvePlacement`'s output without touching this file, which is exactly what the DoD and
the ticket's `open-question` decision require.

**Band boundaries (L-005).** Traced each edge directly against the JSON, not just observed a green
test: `six_pounder`/`chain_shot` (minGrade 1) included at `maxGrade=1`; `twelve_pounder`/`mortar`
(minGrade 3) included at `maxGrade=3`, and `quotient_cove` island becomes reachable at exactly
`maxGrade=3` because `div_facts.minGrade` is 3, not 4; `powder_keg`/`long_nine` (minGrade 4/5)
included only once `maxGrade` reaches 4/5. All boundaries use `<=` consistently — no `<` used where
`<=` was intended, in either direction.

**Island rule.** `island.rangeSkills.some(...)`, not `.every(...)` — confirmed at `placement.ts:53`.
`.every` would require *every* range skill of an island to be within reach, which for K-1 would
demand `two_step_add_sub` (minGrade 2) alongside `add_within_20`/`sub_within_20` (minGrade 1) —
`port_sumwich` would never unlock at `maxGrade=1`, soft-locking every K-1 player to zero islands.
The shipped code avoids this.

**Playable start.** Not asserted by an explicit runtime check in the module, but true by
construction given the current catalog: the two starter cannons (`swivel_gun`, `culverin`) have
`minGrade: 0`, which is `<=` every legal `maxGrade` (1, 3, or 5), and neither is `chest`-kind, so at
least one reachable-skill cannon is guaranteed for every band as long as a grade-0 starter cannon
exists in the catalog. That catalog invariant is not this ticket's file to enforce (schema/catalog
integrity is T-003's scope), and the code does not need to special-case it — it falls out correctly
from the general rule. Worth noting only as a boundary of what this module can structurally
guarantee versus what it inherits from the catalog; not a defect.

**Invalid band handling.** Throws `Error` and the message names the bad value via
`JSON.stringify(band)` (falls back to the string `"undefined"` for `undefined`, and to `undefined`→
stringified safely for symbols, neither of which throws). Checked ahead of any indexed lookup, so a
bad value never reaches `MAX_GRADE_BY_BAND[band]` or `BOT_ACCURACY_BAND_BY_GRADE[band]`.

**`noUncheckedIndexedAccess`.** Project has this flag on (`tsconfig.json`). The one type cast in the
file, `(GRADE_BANDS as readonly string[]).includes(band)` (`placement.ts:82`), is a widening cast to
let `.includes` accept a string outside the literal union — not a guard bypass, and it runs *before*
any indexed access. `MAX_GRADE_BY_BAND[band]` and `BOT_ACCURACY_BAND_BY_GRADE[band]` are accessed
through `Record<GradeBand, T>` — an exhaustively-keyed mapped type, not an index signature — so
`noUncheckedIndexedAccess` does not narrow these to `T | undefined`, and no `!` non-null assertion
appears anywhere in the file. Independently confirmed clean via `tsc --noEmit` (exit 0).

**Clarity.** The module-level doc comment states the reachable-vs-outgrown distinction and cites the
dispatch's asymmetric-risk framing directly in the source, which is good practice for a rule this
easy to invert by accident. Function names (`isCannonEligible`, `isIslandEligible`, `sortCannons`,
`sortIslands`) match their single responsibilities; no dead code, no commented-out branches, no
unused imports.

**Minor observation (not a defect):** `sortCannons`/`sortIslands` accept `readonly Cannon[]` /
`readonly Island[]` but are only ever called with the result of `.filter(...)`, so the `.slice()`
inside them is currently redundant (filter already returns a fresh array). Harmless — cheap
defensive copying against a future caller passing a shared array — and not worth requesting a
change for.

No Critical or Important findings in either verdict.

---

## Severity summary

- **Critical:** none.
- **Important:** none.
- **Minor:** one (redundant `.slice()` before sort in `sortCannons`/`sortIslands` — cosmetic, no behavioral risk).

Both verdicts are clean of Critical and Important findings. The cannon eligibility rule uses the
ticket's reachability semantics (not the outgrown misreading), the island rule uses `.some`, all
three band boundaries were hand-verified against the live catalog, returned structures are
genuinely fresh, and nothing in the module is hardcoded against the catalog.

## APPROVED
