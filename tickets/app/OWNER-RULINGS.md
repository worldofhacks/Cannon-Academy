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

---

## D-7 — A K-1 captain must be able to practise, and practice must pay (T-029 + islands.json)

**Ruled 2026-07-29.** Owner: "make sure a kindergartner can practice."

### The gap

`add_within_10` is on **no island's** `rangeSkills`. After D-6 a K-1 captain owns exactly
`swivel_gun` and `culverin`, and **both use `add_within_10`**. So the youngest player cannot
practise the only skill their guns ask. Port Sumwich trains `add_within_20`, `sub_within_20` and
`two_step_add_sub` — all harder than their own cannons.

### Why the obvious one-line fix is wrong

Adding `add_within_10` to `port_sumwich.rangeSkills` alone produces two bad outcomes, both verified
against the shipped catalog and `resolveUnlocks`:

1. **Practice would pay nothing.** No cannon anywhere has `unlock.kind === 'range'` with
   `skill === 'add_within_10'`. A child would drill, fill the meter, master it — and receive
   nothing. A meter with no payoff teaches that the meter is decoration.
2. **It would open content they cannot do.** `resolveUnlocks` lifts an island's fog when _any_
   skill in its predecessor's `rangeSkills` is mastered. So a five-year-old mastering `3 + 4` would
   be shown **Isla Products — multiplication**.

### The ruling

Both halves, as one content change, or neither:

- **`add_within_10` joins `port_sumwich.rangeSkills`** so the K-1 lane exists.
- **A cannon must unlock from it**, so the lane pays. This is what T-029 already proposes and is the
  reason that ticket exists — the real question was never "does K-1 get a third cannon", it was
  "can a K-1 child practise at all". T-029 and this are one problem.
- **The fog consequence must be handled deliberately** — either the predecessor rule is tightened,
  or Isla Products opening early is accepted as harmless because band-gating still governs what
  content a K-1 captain is served. State which, in writing, in the ticket.

### Ownership

`src/content/islands.json`, `src/content/cannons.json` and `src/engine/mastery.ts` are all
engine-track scope per `COORDINATION.md`. The app track records this ruling; the engine track
implements it under T-029, with the fog decision named explicitly rather than discovered.

### App-side consequence

None. `src/services/range.ts` reads `rangeSkills(island)` from the catalog, and `chartNodes` reads
fog from `resolveUnlocks`. Both follow the content automatically — which is the point of having
kept them catalog-driven.

## D-8 — A timeout counts against nothing (2026-07-29, ruled in session)

**The question.** `src/stores/duel.ts` counted a burned fuse as `asked + 1` in both the aggregate
counter and the per-skill tally, never as `correct` — so accuracy fell, and a child who timed out
often enough could fill the mastery meter and still be refused the cannon. Meanwhile the timeout
panel said **"Damp powder. The fuse burned out. Nothing lost."** The screen and the tally
disagreed in front of a child. A-017 documents the three coherent resolutions.

**The ruling.** Resolution 2 — **exclude it**. A timeout counts in neither `asked` nor `correct`,
in the aggregate and in the per-skill tally. The copy is unchanged and becomes true. The
pedagogical ground: kindergartners time out because they are five, not because they are wrong,
and the game's stated rule is that fluency shapes the QUALITY of an action, never PERMISSION to
act. A reading-speed penalty on unlocks violated that.

**Scope of the ruling — both lanes, one rule.** The same `{correct, asked}` tally shape feeds
mastery from two places:

- **Duel lane** (`src/stores/duel.ts` `TIMEOUT` case) — app track, implemented under A-017.
- **Range lane** (`src/engine/drill.ts`, where `choiceIndex: null` is "counted as an incorrect
  attempt") — engine track, delegated under this ruling. The drill must not charge an expired
  timer against mastery; whether the drill serves a replacement question is the engine's design
  call within the ruling.

The lanes must not drift: a timeout is free in both, or the ruling is not implemented.
