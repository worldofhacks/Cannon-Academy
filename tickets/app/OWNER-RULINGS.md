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
- **Range lane** (`src/engine/drill.ts`, `choiceIndex: null`) — engine track under **T-036**.
  Implemented on `swarm/engine-core` and integrated into `app/shell`: a timeout is logged only,
  mastery/`answered` do not advance, and the same question is kept for retry.

The lanes must not drift: a timeout is free in both, or the ruling is not implemented.

---

## D-9 — Older bands receive one age-appropriate range cannon at placement (2026-07-29)

**Owner authorization.** While directing the one-hour demo-readiness pass, the owner explicitly
authorized the orchestrator to make the remaining product decisions and required the player's own
cannons to expose different difficulties and weapons immediately.

**Narrow supersession of D-6.** D-6 still holds for K-1: placement grants the two catalog starters
only. D-9 adds the only approved exceptions — grades 2–3 also receive the Six-Pounder, and grades
4–5 also receive the Twelve-Pounder. No other non-starter may be placement-granted under this
ruling.

Both cannons retain their catalog `range` unlock for players who did not receive them at placement.
They therefore have two intentional, band-specific acquisition paths; every other range cannon
remains mastery-earned, and the Nine-Pounder remains chest-only. **A-032** owns the complete
band-by-cannon policy audit; **A-034** owns the placement/presentation change that surfaces those
difficulties and weapons.

---

## D-10 — A captain starts with ONE gun; the Culverin is the first gun earned (2026-07-31)

**Reported from a real playthrough.** The owner: _"after the demo walkthrough, when the user does
his first real non walkthrough duel, he still has 2 guns instead of starting with 1, he should not
have the culverin gun yet."_

**What was wrong.** `swivel_gun` and `culverin` were both `unlock.kind: "starter"`, so
`resolvePlacement` granted both and `setGradeBand` equipped both. Meanwhile the guided duel arms
exactly one gun (`src/services/guidedDuel.ts`, `playerLoadout: ['swivel_gun']`). The tutorial
taught one gun and the first real duel handed the child two — a discontinuity on the very first
unscripted screen, and one the child had done nothing to earn.

**The ruling.** `swivel_gun` is the **only** starter. `culverin` becomes
`{ kind: "range", island: "port_sumwich", tier: 1 }` on `add_within_10` — the same skill the
Swivel Gun teaches — so it is the **first gun a captain earns**, paid out by the first mastery.
Nothing new has to be learned to earn it, which is what makes it a reward rather than a wall.

**Narrow supersession of D-6, not a replacement.** D-6's rule is unchanged: placement grants
starters only, mastery grants the rest. The catalog now declares one starter instead of two.
D-9's two band-specific exceptions (Six-Pounder for grades 2–3, Twelve-Pounder for grades 4–5)
are untouched — they are what keeps an older band's opening tray a real choice.

**What a fresh captain of each band now holds** (measured through `commitGradeBand`):

| band   | owned & equipped at onboarding                       | starters |
|--------|------------------------------------------------------|----------|
| `k_1`  | `swivel_gun`                                         | 1        |
| `g2_3` | `swivel_gun`, `six_pounder` (D-9)                    | 1        |
| `g4_5` | `swivel_gun`, `six_pounder`, `twelve_pounder` (D-9)  | 1        |

Every band is non-empty, so `resolveDestination` never diverts a fresh captain to the gun deck and
`stores/duel.ts` never has to fall back on an empty loadout. K-1's opening tray is a single
`add_within_10` gun, which is strictly safer for A-058 than the two it carried before.

**Known consequence — the first mastery pays three guns at K-1.** Mastering `add_within_10` now
grants `culverin` **and** `saker` (D-7 made the Saker the paying range unlock on the same skill),
and at `k_1` it also opens Isla Products, whose entry cannon `grapeshot` is granted with it. That
is three guns landing at once against a three-slot tray, on a captain who owns one. Grant order is
`culverin, saker, grapeshot`, so the Culverin reads first on the victory panel.

The ordering that reads best, if the owner wants the Culverin to land alone: move the Saker off
`add_within_10` and onto `add_within_20` (tier 1), making the Port Sumwich ladder one gun per
skill step — Swivel Gun to start, Culverin for adding to 10, Saker and Six-Pounder for adding to
20. **Not done here**, because `tickets/T-029.md` AC-2 is a frozen ticket contract that pins
`saker.skill === 'add_within_10'` and D-7 explicitly named the Saker as the K-1 practice lane's
payoff. Retiring that needs an owner ruling of its own. Note also that `unlock.tier` is validated
by the schema and read by no engine code, so tiers alone cannot stage this.

### Ownership

`src/content/cannons.json` and `src/content/islands.json` are engine-track scope per
`COORDINATION.md`. The owner authorised these two edits directly for this fix; no engine module
changed.

## D-11 — A win advances the voyage (2026-08-02, ruled in session)

> "we should remove the need to play the same island multiple times to move to the next ones so
> it does not feel repetitive."

### What was true

Forward progression was mastery-gated: an island's fog lifted only when a predecessor
`rangeSkill` crossed `MASTERY_THRESHOLD_CORRECT`/`MASTERY_MIN_ACCURACY` — in practice 2–3 wins on
the same island (`src/engine/mastery.ts` `resolveUnlocks`, pinned at ≤3 wins by
`k1-island-progression`). That rationing existed because content was finite: five islands, and a
child who sprinted through them was done. With adaptive generated content planned, the rationing
loses its reason, and the owner judged repetition the bigger retention risk than pacing.

### The ruling

**Winning a duel on an island immediately opens the next band-eligible island in the chain.** One
win, one new island, and the voyage moves.

Narrow supersession: this replaces mastery as the gate for **island fog only**. Everything else
D-6/D-7 built stands untouched —

- **The band gate is not negotiable.** A win never opens an island that teaches nothing inside
  the captain's band. K-1's reachable set remains exactly `[port_sumwich, isla_products]` until
  that band gains lower rungs. The A-060 fixpoint holds; only the *speed* of reaching it changed.
- **Mastery still pays cannons.** `resolveUnlocks` keeps granting range cannons on mastery; the
  practice lane still accelerates the arsenal, it just no longer holds the map hostage.
- **The entry cannon still lands with its island** — an island must arrive holding the gun that
  asks its questions, or we recreate the circular-acquisition bug.

### Consequences

The dock meter's `NEXT: 2 DUELS` arithmetic becomes vestigial — it now reads `NEXT: 1 DUEL`
whenever a next island exists, and the caption plumbing stays so the copy keeps telling the
truth. The frozen specs that pinned mastery-gated fog (`k1-island-progression`,
`engine/mastery` island cases) are re-baselined citing this ruling. Implemented by **A-062**.

## D-12 — Generated fleet art ships only as recombination of artifact material (2026-08-02, ruled in session)

> "We can generate new ships within a specific zod schema since they are svgs … use the existing
> upgrade options we have as golden examples, and then generate 20 more so we have solid golden
> set to generate off of."

### The tension

A-045 ruled — twice — that art appearing in neither design artifact does not ship, and pins the
raster inventory to nine MD5s. Generated ships are, by definition, not on the boards.

### The ruling

A generated ship may ship **as data** when every field of its document is an enum or count over
board-sanctioned primitives: the board's own hull/sail outlines, named palette tokens from
`src/theme/tokens.ts`, and emblem parts that already exist in the composed geometry. Such a
document is a *rearrangement of artifact material*, not outside art. The strict zod schema is the
provenance boundary:

- **No raw coordinates.** Shape variety is counts and enum shapes over fixed anchors; a document
  that could describe a degenerate polygon is unrepresentable.
- **No free hex.** Color fields are enums over named token swatches, so the contrast audits keep
  their meaning.
- **No rasters.** Output renders through the same `Poly`/View stack as everything else; a
  generated PNG on disk stays a test failure.
- **Player identity stays the player's** — the red vertical sail stripe is unrepresentable on a
  rival-role document, mirroring `enemyPresentation`'s rule.

Every shipped document passes the schema **and** a committed human-reviewed golden set (the
eyeball grid). Implemented by **A-064**; the standing A-045 regime is otherwise unchanged.
