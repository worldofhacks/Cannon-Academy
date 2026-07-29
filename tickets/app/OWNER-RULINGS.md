# Owner rulings affecting the app track

Decisions the owner has made that change app behaviour. Recorded here because `COORDINATION.md`
lives on `swarm/engine-core` and this branch cannot edit it without forking the file. The engine
agent applies each ruling to the ticket it belongs to; this file is the app track's copy of record.

---

## D-6 — Placement grants starters only. Mastery grants the rest. (T-032)

**Ruled 2026-07-28.** Closes the open decision in `tickets/T-032.md`.

### What was wrong

`resolvePlacement('k_1')` returns **four** cannons:

```
culverin, swivel_gun, chain_shot, six_pounder
```

Only two of those are starters. `chain_shot` and `six_pounder` are both
`unlock: { kind: "range", island: "port_sumwich", tier: 1 }` — the catalog marks them as **earned at
a gunnery range**, and placement hands them over for nothing.

This is not a balance opinion. It contradicts three written things at once:

1. **`PLAN.md`'s MVP checklist**, twice: _"two starter cannons that are a real choice"_.
2. **The catalog's own `unlock.kind`** — a `range` unlock that requires no range is a dead field.
3. **The mastery design.** PLAN.md: _"Crossing a threshold unlocks that skill's next cannon."_ If
   placement already granted it, the meter unlocks nothing and the practice loop has no payoff. A
   4-5 player could previously earn **zero** cannons through mastery.

### The ruling

**Placement pre-unlocks ISLANDS to the player's band, and starter cannons only. Every non-starter
cannon is earned** — through its declared `unlock` (range mastery, or a chest drop for
`nine_pounder`).

### Why this is the right shape, not just the smaller one

The grade picker's job is to put a child in front of math they can read — that is a _content_
decision, and islands carry content. Cannons are _rewards_, and pre-granting a reward deletes the
reason to practise. Keeping placement on islands and mastery on cannons puts each mechanism on the
thing it is actually for.

It also fixes the K-1 tray, which currently opens to four guns including two grade 1–2 weapons a
five-year-old has no business being offered on turn one.

### Consequences

**Engine track (`T-032`)** — owns the change:

- `resolvePlacement` returns starters only in `unlockedCannons`; island pre-unlock is unchanged.
- Existing engine tests asserting four cannons for `k_1` will fail and are the point of the change,
  not collateral — they encode the behaviour being corrected.
- `T-029` (does K-1 get a _third_ starter) is now the live follow-up question, and it is a
  **content** decision — adding a starter means adding a `sub_within_10` skill for it to fire.

**App track** — nothing to change:

- The duel tray reads `resolvePlacement(...).unlockedCannons` and renders whatever it returns, so it
  drops from four rows to two on its own.
- The title screen already **counts** the arsenal rather than asserting it, so its copy self-corrects.
- Board 2b ("two big cards") becomes the right cannon-select shape at K-1, where the scrolling
  four-row tray was previously needed.

**Watch for:** with two cannons the tray no longer scrolls, but the ScrollView stays — the arsenal
still grows to ten by the Grandline, and A-011 (gun deck) is the screen that manages that.
