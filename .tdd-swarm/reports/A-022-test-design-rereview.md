# A-022 Test Design Re-review

Verdict: **FIX_NEEDED — DO NOT FREEZE**

Reviewed commit: `2a27652d8c8048f2e692c74721dfb17bfb18542d`

## Remaining finding

### Important — the “live” panel and exact outcome chain still accept dead or alternate branches

Evidence: `__tests__/app/victory-reward-presentation.test.ts:197-260,269-313`

The revised matchers correctly relate the cannon name and `NEW CANNON` badge to one
`rewards.cannons.map`, and they now relate one settlement state binding to the panel. However,
both matchers accept the required expression merely because it is a descendant of rendered JSX,
not because it is the value React will take:

```tsx
{true ? null : rewards.cannons.map((cannon) => (
  <>
    <Text>{cannon.displayName}</Text>
    <Text>NEW CANNON</Text>
  </>
))}
```

passes `hasLiveProjectedCannonRows`; its dead-branch check recognizes only the exact
`false && map(...)` spelling.

Likewise:

```tsx
<VictoryPanel rewards={true ? fakeRewards : victoryRewards(retainedOutcome)} />
```

passes the direct branch in `projectionArgument`, while the alias branch accepts the equivalent
`true ? fakeRewards : projectedRewards` form. The retained result is therefore still not proven
to be the value supplied to the live panel.

Before freeze:

- Require the cannon map to be the direct payload of its JSX expression (with no intervening
  binary or conditional expression), while still allowing the legitimate surrounding
  `chestOpen` branch.
- Require the `rewards` prop expression to be exactly `victoryRewards(retainedState)` or exactly
  the validated projection alias. If a null guard is necessary, validate its condition and which
  branch contains the projection rather than searching arbitrary descendants.

## Prior-finding disposition

- **Full catalog coverage: closed.** AC-2 now derives all eleven ids from the real catalog,
  reverses their order, and checks exact catalog-object identity.
- **Repeated first-applied behavior: closed.** `retainFirstApplied` is exercised sequentially
  with an applied result followed by a no-payment result, checks object identity, and rejects an
  initial no-payment observation.
- **Exact real reward-to-deck proof: remains sound.** The integration test still crosses a real
  mastery threshold and proves the same unlocked cannon enters `ownedCannons` and an `isNew`
  `deckSlots` row.
- **Unconditional badge: closed.** The sole `NEW CANNON` text must now occur inside the cannon map.
  The remaining issue is reachability of that map.
- **A-010 scope: clean.** No rarity, ceremony, mastery-rule, or new award-rule behavior was added
  to the frozen contract.

## Verification evidence

- Diff `d0f4f38..2a27652` changes only the A-022 test and Test Agent report; production and ticket
  files are untouched.
- Targeted RED: **7 tests collected, 7 meaningful missing-feature failures**.
- Spec-lint: **PASS**, with AC-1 through AC-4 all mapped.
- Prettier, ESLint, and `git diff --check`: **PASS**.

Freeze remains blocked on the one Important source-contract finding above.
