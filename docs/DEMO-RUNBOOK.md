# Cannon Academy — Demo Runbook

*Written 2026-08-03 under the feature freeze, against `main` @ the G13 gate. Everything in
here was verified on the booted iPhone 17 simulator with captain Wren (K-1) unless marked
otherwise.*

---

## 1. Before anyone is watching (10 minutes)

- [ ] `npm ci` if the laptop was "cleaned up" recently — a missing `node_modules` presents
      as mysterious Expo internal errors, not as "not installed."
- [ ] Start Metro from the repo root: `npx expo start`. Boot the iPhone 17 simulator, open
      the app, confirm the title screen renders.
- [ ] **Do not run the full test suite while Metro is up** during setup chatter — parallel
      vitest under load reports phantom failures. Single-fork if you must.
- [ ] The demo save: **Wren, K-1, full chain complete, standing at the Uncharted Sea with
      one generated island ahead ("The Restless Landing") and Lumen already met.** This is
      the money state — protect it. **Do not tap "Start over" (Rank screen) until the final
      beat**, it wipes everything.
- [ ] Know the speaker icon's real job: it is a **visual slot marking where a grown-up
      reads aloud to a pre-reader** — deliberately not a TTS button (no speech dependency
      ships). If asked, that's the answer; device text-to-speech is an easy future add.
- [ ] Optional flourish: toggle Wi-Fi off mid-demo — the entire game, including the endless
      frontier, is offline-first. Nothing degrades.
- [ ] Rehearse ONE duel by hand. The fuse rewards speed with a perfect shot; an adult
      playing casually wins comfortably at K-1. The Grandline-position boss (a 120-hull
      kraken) and frontier rivals (135+) are real fights — budget 2–3 minutes each or
      pre-win them before the audience arrives.

## 2. The walkthrough (12–15 minutes, three phases)

*There is ONE save slot, and the loaded save (Wren) already finished the chain — so the
order below matters: everything non-destructive first, then two deliberate "Start over"
moments. A fresh arrival ceremony can only be shown in Phase C, because Wren has already
arrived everywhere.*

### Phase A — on Wren's save (nothing here can break anything)

**A1 — The chart is a place, not a menu.** Title → SET SAIL → the Sea Chart. Point at:
sixteen places (five islands + buoys, chests, wrecks, rival sails, rocks), the kraken you
can see but never tap, the compass, band-true island names. Say: *"This is a
kindergartner's sea — Take-Away Bay, Minus Lagoon, Teen-Ten Harbor. A 4th-grader gets the
same five islands with a completely different curriculum under different names. Common Core
per band, enforced at import time — a bad content edit fails the build; it can never reach
a child."*

**A2 — The tour, without wiping anything.** "Watch the tour again" replays the full
onboarding + guided duel as a replay, not an escape hatch — it also demos duel mechanics
with zero risk to the save. Say: *"There are deliberately no 'grown-ups skip' buttons
anywhere — an owner ruling. Every voyage plays in full."*

**A3 — Practice pays, and time is never punished.** Practice → band-true drills. Let one
timer expire on purpose: *"Damp powder — nothing lost. A five-year-old who reads slowly is
slow, not wrong. Timeouts count against nothing; speed only upgrades a hit to a perfect
shot. Mastery here pays real cannons in the duel."* Then the Rival Fleet shelf (Rank →
Fleet): twenty ships, met-tracking honest — silhouettes stay locked until actually fought.

**A4 — THE CLOSER, shown early because it's Wren's superpower: the sea never ends.** The
dock's old "every island cleared" dead-end is a gold doorway — **The Uncharted Sea · SAIL
PAST THE EDGE**. Tap it. Fog parts on a generated island. Lumen the lanternfish greets with
her lamp — *"the only host with no beach, because there's no land past the edge"* — and
asks a riddle whose numbers grow with the visit tally. Generated name, band-safe skill,
fleet rival at a scaled hull, a pennant tally that only ever goes up. Fight the duel if
you're warmed up (135 hull — a real fight), or arm it and narrate. Say: *"No streak
counters, no best-runs — an endless mode must never make losing feel like losing
something. Every island is generated on-device, deterministically, from the closed
vocabulary the design boards publish. It works in airplane mode."*

### Phase B — 30 seconds of destruction, worth it (wipes Wren)

**B1 — The same sea, another child.** Rank → Start over → pick **Grades 4-5** → SET SAIL →
the chart re-renders: Quotient Cove, Fraction Reef, division and fraction glyphs. Same
geometry, completely different mathematics. One sentence, then move on.

### Phase C — end as a brand-new kindergartner (the natural loop)

**C1 — Full fresh arc.** Start over again → **K to 1st** → real onboarding (name, flag,
tour, guided duel — one gun, one lesson). Then the first real duel at Port Sumwich: show
questions inside the band, wrong answers never damaging your own ship, the rival's
hands-off turn. **Win → chest → the voyage advances** — sail animation, fog lift, and the
first ARRIVAL at Take-Away Bay: Pip the parrot greets and riddles. Read it aloud: *"the
question always restates the whole action — 'How many seeds did I eat?', never a bare 'How
many?' — that's a ruling. Right answer pays coins; a miss is an amber shrug and costs
nothing."* End the demo here, on a
progressing save — which is also the perfect state to hand the phone to anyone who wants
to play.

## 3. Capabilities you can claim (all shipped and tested)

- Five-island voyage per band × three bands, Common-Core-aligned curriculum atlas, ceiling
  enforced at import time and property-swept at runtime.
- Guided onboarding, replayable tour, no adult skips (D-13).
- Duels: band-true questions, fuse-as-quality, mercy system, timeouts free (D-8), win
  advances the voyage (D-11), receipted idempotent rewards (no farming, no dupes).
- Practice range with band-matched drills that pay real cannons via mastery.
- Arrival ceremonies, six island hosts with whole-question riddles, honest rival-fleet
  shelf (20 generated-from-schema ships), deck crew, harbor cosmetics ("paint, never
  power"), rank tiers.
- **The Uncharted Sea**: endless generated islands — schema-validated documents over closed
  primitives, deterministic offline generator, anchor-mapped duels (the frozen engine never
  learns generated ids), honest settlement, Lumen's tally riddle, pennant log.
- Engineering: ~3,000 tests across 96 suites, frozen behavioral contracts, 19 recorded
  owner rulings, per-ticket commits, design boards as pixel authority, pure-TS engine.

## 4. Discussion points (the AI story, told honestly)

**"Where's the AI?"** Two-part answer:
1. **Shipped**: every piece of generated content — the 20-ship fleet, the endless islands —
   is authored *inside a strict schema over closed primitives* (enums and counts over
   board-published parts, no raw coordinates, no free colors). That schema IS the AI
   safety boundary: an LLM becomes just one more author writing into a slot that cannot
   express a broken, off-brand, or above-ceiling result.
2. **Designed and committed, not yet wired**: the adaptive loop
   (`docs/ADAPTIVE-ISLANDS-PLAN.md`, `docs/ENDLESS-ARCHIPELAGO-DESIGN.md`) — anonymous
   telemetry → a Cloud Function relay → OpenRouter writes question packs targeting the
   skills the child struggled with → a 7-stage validation gauntlet → duels adapt. Firebase
   is provisioned and dormant; no keys ship in the client; deleting the env is the kill
   switch. Estimated relay cost ~$9/month at 1,000 daily players. Langfuse traces every
   generation server-side.

**The child-safety story** (worth leading with): the LLM never writes math — it rewrites
*story prose* around human-authored, seed-swept templates and its output must deep-equal
the named archetype's math. No PII ever reaches a model: the captain's name is child-typed
free text and never leaves the device. K-1 never sees a multiplication sign anywhere in
the pipeline — catalog law, duel tray, drills, riddles, and generated content are all
independently swept.

**Why these product rules**: one-win-advance (repetition was the churn risk once content
became infinite); no skips (the tour is the contract with the parent); whole-question
riddles (pre-readers hear WHAT is being counted); defeat costs nothing, timeouts count
nothing (fluency shapes quality, never permission).

## 5. Rough edges — know them, don't stumble

- **Five accepted red tests** (engine reducer 2, victory presentation 2, glyph pin 1):
  frozen-contract drift from the D-14 curriculum change, each tracked with a ruling
  citation; deliberately not silently re-baselined. Say: *"our frozen tests are contracts —
  when a product ruling moves one, it stays red until re-ruled, never quietly edited."*
- The **adaptive/LLM loop is not live** — don't imply it is; the two committed design docs
  are the artifact to show instead.
- The **sixth station on the chart map** (the fogged "BEAT THE GRANDLINE FIRST"
  anticipation door) is queued behind the freeze (A-088); today the doorway appears in the
  dock at chain completion.
- Waypoints (chests, wrecks, rival sails) are **scenery today** — mechanics are ruled
  (D-19) and queued (A-089/A-090).
- Frontier rivals reuse the 20-ship fleet roster locally; LLM-authored unique rivals are
  the G14 enrichment leg.
- If Metro dies mid-demo: `npx expo start` from repo root, reload — save state persists.
