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

## D-13 — No grown-up skips, and a riddle asks its whole question (2026-08-02, ruled in session)

> "lets remove all 'grown ups skip' prompts anywhere in the app. also … it says how many seeds?
> instead of saying how many seeds did I eat? it must be clear and descriptive so the child
> actually understands what is going on."

### The ruling, part one — every voyage plays in full

All three "Grown-ups: skip" affordances are removed: the tour skip on the grade picker, the tour
skip over the guided duel, and "skip the island chats" on the encounter card. This supersedes
the board's ADULTS rule ("a 10px 'skip the tour' affordance on that one screen"), the earlier
in-session request that added the adult skip, and the encounter board's skip link.

What it does NOT change: **"Watch the tour again" stays** — that is replay, not escape — and
setup (band, name, flag) was never skippable to begin with. The dead paths (`commitTourSkip`,
`skipTour`, `TOUR_SKIP`, `SKIP_LINK`) leave the codebase rather than lingering unreferenced;
the specs that pinned them are re-baselined citing this ruling.

### The ruling, part two — the question names what is being asked

A riddle may never end on an elliptical tail ("How many shells?"). The closing question restates
the action in full — "How many seeds did I eat?", "How many boats float in my bay now?" — so a
pre-reader being read to hears WHAT is being counted and WHY. Every authored riddle is reworded,
and the encounter suite gains a clarity lint so a future riddle cannot ship truncated.

## D-14 — Five islands for every band, each band its own curriculum (2026-08-02, ruled in session)

> "all of the islands that are available when a kindergartner selects their level should still
> have all of the islands but all of the islands should follow the common core standards for
> their respective band. there should still be 5 islands visable but those islands should be
> completely different based on each band."

### What was true

One shared island chain carried one shared curriculum ladder, and the band was a fence across
it: a K-1 captain saw five islands and could ever open two, because islands three through five
taught nothing under their ceiling. The fence was the A-060 safety property doing its job — but
the sea it protected was mostly someone else's.

### The ruling

The five islands stay — same chart geometry, same enemy kinds, same fleet — but their CONTENT
becomes a function of the band. `islands.json` carries per-band curriculum: display name, the
skills the island teaches, and the cannons it pays, one set per band, each aligned to that
band's Common Core standards. A kindergartner's island three is not a locked Quotient Cove; it
is their own island, teaching their own mathematics, under their own name.

Consequences, all deliberate:

- **Every band reaches all five islands.** The old fixpoints ("K-1 reach is exactly two") are
  re-baselined to the new law: every band's reach is exactly five, and every arrival plays the
  full ceremony and encounter.
- **The ceiling moves from the map to the curriculum.** A-060's guarantee is restated, not
  weakened: no island may carry, for any band, a skill above that band's ceiling — enforced in
  the catalog validator, so a bad authoring edit fails at import, before it can reach a child.
- **Four new skills** enter the catalog to fill the honest gaps: subtraction within 10 and
  teens-as-ten-and-ones for K-1; multi-digit multiplication and long division for G4-5. Each
  arrives the full way — templates, entry cannon, riddles, glyph.
- Placement still opens island one only; D-11 still advances by wins; D-13's whole-question
  rule binds the new riddles.

## D-15 — Replay is not a product promise; the record of a duel is its Firestore result (2026-08-03, ruled in session)

> "why do we need to replay duels? we should just be writing the results to firestore, im not
> sure why we would need to ever replay anything at all"

### What was asked

The adaptive-islands plan (§7, decision 1) asked the owner to ratify a new *replay key* —
{seed, action log, pack set} — because adaptive packs change what a duel's question pool
contains, and a frozen source scan pins a comment calling the whole-pool handover "the replay
contract."

### The ruling

**There is no product requirement to reconstruct historical duels.** The durable record of a
duel is the telemetry document written to Firestore at settlement. Replay-from-seed survives
only as what it always actually was: engineering infrastructure — the determinism that lets the
frozen suites prove the no-op path is byte-identical and that a given seed yields a given
question sequence.

Consequences:

- The pinned "replay contract" comment in `src/stores/duel.ts` is re-worded to name what the
  determinism guarantee is *for* (test reproducibility), and the frozen source scan is
  re-baselined citing this ruling. Determinism itself is not weakened: same seed + same pack
  set → same questions, and the no-op path returns the same object reference.
- Pack ids are still recorded alongside the telemetry doc — cheap, and it keeps generated
  content auditable — but as bookkeeping, not as a replay promise.
- This unblocks the `armAdaptivePacks` injection seam (wave G12).

## D-16 — The Firestore rules open exactly two owner-scoped doors (2026-08-03, ruled in session)

The owner approved the recommended shape: the rules stay **default-deny**, with two narrow
enumerated exceptions — **create-only** owner-scoped telemetry writes
(`telemetry/{uid}/duels/{duelId}`, shape-checked, ≤64 shots, no read/update/delete) and
**get-only** owner-scoped plan reads (`/plans/{uid}`). Nothing else opens.

`firebase.test.ts` spec(A-025:AC-5/AC-8) — the frozen pin on the deny-all rules file — is
re-baselined in the same commit as the rules change, citing this ruling, and its successor must
still verify default-deny plus inspect every enumerated clause.

## D-17 — The Uncharted Sea: endless is a sixth island, LLM-curated and LLM-crewed (2026-08-03, ruled in session)

> "we should have an uncharted sea, but we should use zod for validation and openrouter llm to
> analyze where the student struggled and then create custom curated question sets based on
> that so that when they fire the cannons the questions are still within their bounds but its
> focused on the questions they struggled with. also it should use the llm to generate the
> enemy ships and enemys as well so that we have a endless, adaptive, and llm driven game"

### The ruling

This supersedes the plan's voyage-loop recommendation (§5 shape (a)). The endless surface is
**the Uncharted Sea — a repeatable sixth island beyond the Grandline**, and it is the LLM's
island:

- **Questions**: the telemetry → OpenRouter analysis → curated pack loop (Layers 1–3 of the
  plan, confirmed as designed) aims its packs here. Packs target the skills the student
  struggled with, zod-validated through the full gauntlet, always inside the band's ceiling —
  "still within their bounds but focused on the questions they struggled with."
- **Enemies**: the LLM generates the enemy ships **and** the enemy identities (names, text
  channels) for Uncharted Sea duels — inside D-12's provenance boundary. The generated-fleet
  zod schema is the hard wall: enums and counts over board primitives, no raw coordinates, no
  free hex, no rasters. D-12 is not weakened; the LLM becomes one more author writing inside
  the same schema the golden set already polices.
- **Repeatable**: arriving, dueling, and winning at the Uncharted Sea never exhausts it; each
  visit draws the current pack set and a fresh generated rival.

### Amended 2026-08-03, same session — not one island; islands without end

> "its not just going to be a repeated 6th island. it will be never ending islands. island 7,
> 8, 9, and so on. all being generated as the player progresses"

The Uncharted Sea is a **region**, not a single island. Beyond the authored Grandline the
chain keeps extending — island six, then seven, then eight, without end — each island
generated as the player approaches it. Every generated island is a validated document over
closed primitives: its skills come from the existing catalog (ceiling-clamped to the
captain's band), its questions arrive as packs through the full gauntlet, its rival through
D-12's fleet schema, its chart presence recombined from board-published material (A-045
holds — the republished board must carry the repeatable uncharted-segment primitives that
generation recombines).

**The implementation law under this ruling**: the five authored islands keep the closed
`IslandId` enum and every total Record built on it; generated islands live in their own
namespace behind their own strict schema and never enter that enum. The authored game must
remain provably untouched — same reference, same bytes — for any captain who has not sailed
past the Grandline. The design that satisfies this law is `docs/ENDLESS-ARCHIPELAGO-DESIGN.md`.

### Amended again, same session — the LLM also names and designs the islands

> "we also should generate island names and some island designs using the llm so that we
> have a fully ai native generative endless game that is adaptive to the users"

Names were already in the enrichment leg. This amendment adds **island visual design** to
what the LLM authors — under D-12's provenance discipline, extended from ships to islands:
the LLM writes a *design document*, never art. Every field of an island-design doc is an
enum or count over board-published isle primitives — silhouette recipe, feature pieces in
named slots, palette moods drawn from the theme's named tokens. No raw coordinates, no free
hex, no rasters — a document that could describe a degenerate island is unrepresentable, and
the commissioned Uncharted Sea board is what publishes the vocabulary the LLM composes from.
The local deterministic generator deals designs from the same closed vocabulary, so the
frontier remains fully offline-capable; the LLM makes it *distinctive*, never *possible*.

### What it costs, deliberately

The sixth island reopens the closed `IslandId` enum and needs the full arrival: a curriculum
cell per band (each cell within its band's ceiling), a hull entry, a glyph, a sixth host
species, an enemy row — and **a republished sea-chart board**, because A-045's regime holds:
chart art ships only from design artifacts. G13 is board-gated; the owner commissions the
board via Claude Design. Enemy ship art needs no new board material — that is the point of
routing it through D-12's schema.

## D-18 — Every band gets the rewrite; golden sets are the reference; Langfuse watches (2026-08-03, ruled in session)

> "we should have many different ways to present the questions and reword them regardless of
> the grade. we should have some golden sets that the llm can use as reference but it should
> still be the adaptive llm rewrite based on the telemetry performance of the student. we can
> also use langfuse to track everything"

### The ruling

This supersedes the plan's "K-1 sails authored content only in v1" recommendation (§7,
decision 4). **No band is excluded from adaptive presentation.**

- **Golden sets close the K-1 gap.** Rewrite-mode needs a prose surface, and K-1's skills are
  mostly symbolic — so the gap is filled by *authoring*, not by loosening validation: every
  skill × band cell that lacks a word-problem archetype gains a small human-written golden set
  (D-13-compliant whole questions, FITTED-bounded, seed-swept like any authored template).
  These goldens are both shippable content and the LLM's reference material.
- **The rewrite discipline is unchanged.** The LLM still writes prose only; every pack still
  names a real archetype and deep-equals its math (params, constraints, answerExpr,
  distractors). More surfaces to rewrite, zero new trust.
- **Langfuse traces every generation** — server-side only, inside the relay Function: prompt,
  completion, model, latency, cost, validation verdict per stage. Keys live in Secret Manager
  beside the OpenRouter key; traces carry a hashed uid and never the child's free-typed name,
  which continues to never leave the device.
