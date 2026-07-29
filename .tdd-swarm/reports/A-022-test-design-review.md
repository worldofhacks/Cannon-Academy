# A-022 Test Design Review

Verdict: **FIX_NEEDED — DO NOT FREEZE**

Reviewed commit: `67177ddfc0f15c75dd9f761af4f3d86dadf7a6c4`

## Findings

### Important — AC-1 can pass while the empty reward still claims “NEW CANNON”

Evidence: `__tests__/app/victory-reward-presentation.test.ts:188-210,237-247`

`hasProjectedCannonMap` only requires that some `.cannons.map(...)` callback somewhere under
`VictoryPanel` reads a property named `displayName`. It does not establish that the map is the
rendered reward row, and it never constrains the authored `NEW CANNON` label. A lazy implementation
can remove `Chain Shot`, add an unused or false-guarded
`rewards.cannons.map((cannon) => cannon.displayName)`, leave `NEW CANNON` rendered unconditionally,
and pass both source tests. That directly violates AC-1's empty-unlock case.

Before freeze, make the test reject a decoy map and prove that both the cannon name and the
`NEW CANNON` claim are emitted only inside reward rows derived from the projected cannon
collection. A deterministic view-model test that returns zero cannon claim rows for an empty
projection is preferable; a source contract must at minimum tie the actual JSX expressions and
tag to the same `rewards.cannons.map` callback and reject authored claims outside it.

### Important — AC-3/AC-4 do not prove one outcome flows from settlement through retention to the panel

Evidence: `__tests__/app/victory-reward-presentation.test.ts:146-175,288-338,342-371`

The wiring and retention assertions search the entire file independently. The AC-4 matcher can
find one `[valueA, setValueA]` state pair populated from `applyDuelOutcome`, while the AC-3 matcher
accepts a different `[valueB, setValueB]` pair projected into `VictoryPanel`. Both can also be
satisfied by dead/unreachable syntax because neither check relates the matched nodes to one
another or scopes them to the live `DuelScreen` effect and return tree.

Before freeze, require one continuous identity chain: the exact variable bound to the real
`applyDuelOutcome` call is guarded as applied, retained by its matching setter, and that setter's
matching state value is the value projected into the rendered `VictoryPanel`. The repeated
observation behavior should ideally be exercised as sequential deterministic behavior (first
applied result followed by `applied: false`) rather than only requiring one particular
`useState(prev => prev ?? outcome)` spelling.

### Important — AC-2 samples only two of eleven valid cannon ids

Evidence: `__tests__/app/victory-reward-presentation.test.ts:221-234`

The exact-id projection test uses only `saker` and `chain_shot`. An implementation with a
two-entry conditional or fallback to `chain_shot` passes while projecting the other nine valid
`CannonId` values incorrectly. That is the hardcoded implementation AC-2 is intended to prevent.

Before freeze, derive the exercised ids from the real cannon catalog (including a deliberately
non-catalog-order permutation) or parameterize over every catalog id, then assert each exact id
resolves to its corresponding catalog object in outcome order.

## What is sound

- The AC-3 integration case at lines 251-285 is strong: it crosses the real subtraction mastery
  threshold, observes the exact `applyDuelOutcome.unlockedCannons` delta, proves the same cannon is
  in `captain.ownedCannons`, and proves `deckSlots` exposes it as `isNew`.
- The RED is meaningful after using the worktree's shared dependency install: all seven tests
  execute and fail on the absent projection, discarded settlement result, hardcoded panel reward,
  and missing wiring—not on collection or fixture errors.
- The test remains within A-022. It does not demand rarity, a ceremony, a new award rule, or any
  other A-010 behavior.

## Verification evidence

- `npm test -- --run __tests__/app/victory-reward-presentation.test.ts`:
  **7 tests collected, 7 expected feature failures**.
- `.tdd-swarm/spec-lint.sh tickets/app/A-022.md`: **PASS**; AC-1 through AC-4 all mapped.
- `npx prettier --check __tests__/app/victory-reward-presentation.test.ts
  .tdd-swarm/reports/A-022-tests.md`: **PASS**.
- `npx eslint __tests__/app/victory-reward-presentation.test.ts --max-warnings 0`: **PASS**.
- `git diff --check 2904f14..67177dd`: **PASS**.

Tests must not freeze until all Important findings are corrected and independently re-reviewed.
