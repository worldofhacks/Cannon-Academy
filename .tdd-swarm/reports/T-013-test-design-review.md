# T-013 test-design review

## Verdict: REJECT

Do not freeze this suite until the following test/spec amendments land:

1. **Enforce `DuelState` readonlyness beyond its two arrays.** The ticket's core declaration and DoD require readonly fields throughout, but `types.test.ts:587-604` indexes field types, which discards property modifiers, and AC-12 checks only `actionLog` and `playerLoadout` (`1401-1439`). Add a type probe that rejects a mutable core/per-phase property (at minimum `seed`; preferably exact readonly checks per variant/core). A scratch reference with `DuelCore.seed` mutable passed `tsc` and **100/100** tests.
2. **Make each `DuelEvent` variant's payload type exact.** `types.test.ts:1515-1521` constrains only `DuelEvent['type']`; `1524-1530` checks keys of five hand-written values, not the union variants. A scratch reference that adds `readonly debug?: string` to only the `CANNON_SELECTED` variant passed `tsc` and **100/100** tests. Add `Exact<Extract<DuelEvent, { type: ... }>, {...}>` (including readonly fields) for all five variants, or equivalent positive/negative type probes.
3. **Amend the ticket with parsed ACs for the unnumbered shapes, then retag their 13 tests.** The confirmed `dod(...)` invisibility means the event union and related contracts have no AC-level trace. The proposed AC-13 wording needs the variant-exactness test above; proposed AC-15 is not usable as written because `RivalVolley` has no `actions` field to be “ordered.”

These are contract holes, not implementation preferences: each permits a type surface contrary to the ticket while the entire frozen suite is green.

## Worktree verification

Observed before review:

* `pwd`: `/Users/quietguy/Documents/Dev/Gauntlet/Math Game/.worktrees/wt-T-013`
* `git branch --show-current`: `ticket/T-013-duel-types`
* `cat .tdd-swarm/active-ticket`: `T-013`

I inspected territory with `BASE=$(git merge-base swarm/engine-core HEAD)` and `git diff "$BASE..HEAD"`. It contains the T-013 test suite and author report, rather than a tip-relative view of integration changes.

## Findings

### [P1] Core state mutability is not tested — `__tests__/engine/duel/types.test.ts:587-604, 1401-1439`

**Verified by running.** Removing `readonly` from `DuelCore.seed` in a scratch reference implementation typechecked and passed 100/100 frozen tests. `Exact<DuelState['seed'], number>` cannot observe `readonly`; neither can the AC-12 array-only mutation probes. This violates the declared common core (`tickets/T-013.md:48-63`) and DoD “readonly fields throughout.” This is L-012: indexed/aggregate type projections certify the field value type, not the property modifier.

### [P1] Event payload closedness is only asserted on fixtures — `__tests__/engine/duel/types.test.ts:1515-1530`

**Verified by running.** I added an optional `debug?: string` only to the `CANNON_SELECTED` union member in the scratch reference. `tsc` was clean and Vitest reported 100/100 passing. The exact discriminant assertion remains true and the fixture simply omits the optional key. This leaves the stated “each variant carries exactly its documented payload fields” requirement unpinned. It also demonstrates why retagging the current tests to AC-13 alone would not make the proposed AC enforceable.

### [P2] The report's “exactly 8 edit sites” count is false — `.tdd-swarm/reports/T-013-tests.md:324-338`

**Verified by reading/counting.** The claimed eight are grouped obligations, not literal edit sites. Just the listed phase changes are seven source edits: `EXPECTED_PHASES`, `TERMINAL_BY_PHASE`, `STATE_BY_PHASE`, both numeric `8` literals at `402-403`, and both exact unions at `409-435`. A sixth event additionally requires at least the expected-event list, event construction, event array membership, the expected mapped runtime list, the discriminant union, and a payload assertion—six more sites under the suite's own “each payload exact” intent. The exact total depends on the new event payload, but 8 cannot be correct for adding both a phase and an event. This is not an argument against closed `RivalVolley`; it is a correction to the forward-maintenance estimate.

## Exact<> audit

**Verified by running.** I copied the helper verbatim into `scratchpad/review-t013/exact-probe.ts` and compiled with strict TypeScript. It correctly rejected:

* `{ a?: number }` versus `{ a: number }`
* `{ readonly a: number }` versus `{ a: number }`
* `any` versus `{ a: number }`, in both directions
* a branded `string` versus plain `string`

It correctly accepted union-order equivalence (`'a' | 'b'` vs `'b' | 'a'`) and a type against itself. The negative control at `63-64` is sufficient to detect a trivial always-true helper, and these probes show the helper itself is not defanged. None of the 64 counted assertion uses is defanged by a weak `Exact<>` implementation.

The larger issue is scope, not helper correctness: an indexed access such as `DuelState['seed']` cannot test the parent property’s readonly modifier. `Exact<Readonly<ActionLogEntry>, ActionLogEntry>` at `1322-1325` is sound for that whole interface; the equivalent check is absent for the core and phase variants.

### @ts-expect-error audit

**Verified by running and reading.** There are **25 active directives**, not 30 (the report’s 30 includes five prose/comment occurrences). I typechecked the entire frozen test file against the scratch reference and then inspected each directive. Each active directive is on the operation it intends to reject:

* phase/terminal argument and explicit-undefined configuration (`441, 867, 907`);
* absent view field (`1002`);
* wrong discriminated-union member access and malformed variants (`1186-1241`);
* omitted/wrong `ActionLogEntry` fields (`1329-1372`);
* readonly array assignment, push, and index assignment (`1411-1436`);
* invalid/absent `DuelEvent` payload access (`1563, 1573`);
* forbidden `RivalAction` payload (`1593`).

The positive controls for reload narrowing (`1100-1107`) and mutable-copy operations (`1447-1459`) make the relevant directives non-vacuous. The audit did not find an active directive suppressed by an unrelated error.

## Surviving mutants

All were built in the scratch reference and verified with clean `tsc` plus **100/100 passing** frozen tests:

1. **Memoised construction:** cache `createDuelState` by serialised config and return the identical state object for equal input. AC-3 should catch an aliasing/different-reference requirement if independent duels must not share state; it currently asks only deep equality.
2. **Config-array/pool aliasing:** carry `playerLoadout`, `rivalLoadout`, and `templatesBySkill` by reference. Subsequent caller mutation aliases state. No AC requires defensive copying.
3. **No runtime freezing:** return ordinary mutable objects and arrays. AC-12 specifies readonly typing only, so this is currently an intentional survivor unless the contract is amended to require runtime immutability.
4. **Mutable `DuelCore.seed`:** remove `readonly` from the core field. This is an unintended survivor; it conflicts with the existing ticket/DoD and is a required pre-freeze fix.
5. **Optional event payload:** add `debug?: string` to `CANNON_SELECTED`. This is an unintended survivor; it conflicts with the documented closed event payload and is a required pre-freeze fix.

I did not build mutations for `recentTemplateIds` window/order, `DuelTally.bySkill` accumulation, or hull clamping: T-013 exports no transition/accumulation behavior to mutate. The tests only exercise initial empty values and hand-built states; these belong to T-020 unless the ticket is expanded. They remain residual risk, not demonstrated survivors.

## Coincidental or vacuous assertions

* **Verified by reading:** `types.test.ts:830-835` is tautological for normal JSON-safe values: `JSON.stringify(JSON.parse(JSON.stringify(value)))` preserves the first JSON string’s own order. It does not establish a separately specified wire ordering. The plain-JSON walker at `838-842` is the meaningful AC-6 mechanism; the byte-identical assertion is redundant L-012-style projection evidence.
* **Verified by running:** the AC-2 perturbation at `490-504` correctly removes the `PLAYER_HULL === 100` L-020 coincidence. The non-palindromic condition at `1070-1082` correctly removes the AC-9 ordering coincidence. I found no additional fixture mutation that passed beyond the five survivors listed above.
* **Verified by reading:** `556-558` says “requires exactly the five DuelConfig fields,” but only checks the keys of `configFor`’s local object. It deliberately does not—and should not, given the proposed override—constrain `keyof DuelConfig`; the test title overstates its evidence.

## Over-constraint and forward compatibility

**Inferred by reading:** `keyof RivalVolley` exactness at `1600-1612` is appropriate for T-013 as written. The ticket closes `RivalVolley` and grants extension tolerance specifically to `ActionLogEntry`, not `RivalVolley`. If T-022 adds rival Double-Shot data to that type, a reviewed patch is required; that is correct fail-loud behavior, not present over-constraint.

The report’s eight-site prediction is incorrect as described above. The test’s hardcoded phase/event enumerations themselves are correct per the DoD; only the claimed maintenance count is unsound.

## Reference implementation and RED state

**Verified by running.** A scratch reference implementation made `npx tsc --noEmit -p scratchpad/review-t013/tsconfig.json` clean and ran the exact frozen suite green (100/100). This adequately demonstrates that the positive `Exact<>` probes and directives can typecheck against a concrete implementation; it is substantially stronger than the absent-module RED state.

It does not substitute for mutation coverage of every required property. The same reference, intentionally carrying the five survivors above, remained green. Therefore reference validation establishes satisfiability and wiring, but not full test teeth.

## Unnumbered requirements

**Verified by reading and running.** The 13 `dod(...)` tests are mostly individually sound for their stated fixtures, and the rival-shape `keyof` tests are meaningful. The `DuelEvent` group has the optional-payload hole demonstrated above. AC-13 through AC-16 would improve traceability only after:

* AC-13 explicitly says each `Extract<DuelEvent, {type: T}>` has exactly the documented readonly fields, and tests enforce it;
* AC-15 replaces “its actions are ordered” with the actual `RivalVolley` contract (or specifies a real ordered collection, if that was intended);
* the 13 tests are retagged to parsed `spec(T-013:AC-13)` through `AC-16` labels and spec-lint’s count is rechecked.

## Residual risk / unverified

I did not independently rerun the author’s 29-mutant harness; instead I ran five targeted survivors against a separately written scratch reference. I did not test future reducer behavior (recent-template recency, by-skill accumulation, clamping) because no reducer exists in T-013. I also did not settle the already-confirmed AC-4 seed collision or onboarding-hull conflict; I verified only that the test suite confines AC-4 samples to the non-colliding uint32 range and does not force an onboarding construction.

## Integrity

The frozen test file’s final SHA-256 is unchanged: `89dcd0f967db0e9fdc487927fd5e593353e151e313987bcc3563076d7dd9d030`. I created no file under `src/` and made no production/test edits. Scratch work was confined to `scratchpad/review-t013/` and is removed before this report is finalized. No write-guard command was blocked during this review.
