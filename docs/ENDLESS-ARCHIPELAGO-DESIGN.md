# The Endless Archipelago — design for never-ending generated islands

*Design artifact, 2026-08-03, under amended ruling D-17 ("it will be never ending islands.
island 7, 8, 9, and so on. all being generated as the player progresses"). Produced by four
read-only codebase audits plus synthesis, audited against `main` @ `c8a4d6d`. Companion to
`docs/ADAPTIVE-ISLANDS-PLAN.md` — its §9 wave table defers to §5 of this document for
waves G13+.*

**Verdict: achievable with zero authored-pin movement.** The amended ruling (islands 6..N,
`gen_*` namespace, authored five keep the closed enum) is *cheaper* than the pre-amendment
single-sixth-island shape, which reopened `IslandId` and reddened the enum-exactness pin
(`__tests__/content/schemas.test.ts:225-236`) plus every total Record. This design keeps all
of that frozen.

---

## 1. The two-tier law

**Statement.** The authored game is a closed, total, compile-checked world; the generated
frontier is an open, schema-checked, quarantined world. The two worlds share exactly three
things — the skill catalog, the grade-band ceiling, and the duel engine's coin — and share
**no identifier space, no captain field, and no chart surface**.

**Tier A (closed, untouchable):**
- `IslandId` stays the 5-literal union (`src/content/schemas.ts:63-70`) with its four zod
  anchors (`schemas.ts:222,231,153,267`). The `Exact<IslandId,…>` compile pin
  (`__tests__/content/schemas.test.ts:234`) stays green forever.
- Every total Record stays total over 5: `ENEMY_HULL_BY_ISLAND` (`src/engine/tuning.ts:38-52`),
  `islandGlyph` (`src/components/chart/board.ts:1137-1143`), `HOSTS`
  (`src/components/encounter/encounterBoard.ts:313-354`), plus their frozen mirrors
  (`__tests__/engine/tuning.test.ts:352-354`, `__tests__/app/encounter.test.ts:103-109,344`,
  `__tests__/app/enemy-presentation.test.ts:22-28`, `__tests__/content/catalogs.test.ts:326-360`).
- `islands.json` / `enemies.json` never gain a row; `validateCatalogs`' DAG and enemy-row laws
  (`src/content/index.ts:180-273`) never execute over a gen id.

**Tier B (generated namespace):**
- ``type GenIslandId = `gen_isle_${string}` `` — a template-literal type, **never a member of
  any union with `IslandId`**. There is no app-wide discriminated union; the discriminant is
  *which module you are standing in*. Zod: `id: z.string().regex(/^gen_isle_[1-9][0-9]*$/)`,
  mirroring the gen-fleet precedent (`src/content/generatedFleet.ts:65`).
- `genIslandSchema` (new `src/content/genIsland.ts`), `.strict()`, every field an enum/count
  over existing primitives:
  - `index` (int ≥ 6), `seed` (int), `displayName` (1-24 chars, per fleet `:66`), `skills`
    (nonempty `z.enum(SKILL_IDS)` array — ceiling-clamped per band at every read via
    `maxGradeForBand`, the same clamp as the plan reader,
    `docs/ADAPTIVE-ISLANDS-PLAN.md:78-79`), `presentationKind` (5-enum =
    `Enemy['presentationKind']`, `generatedFleet.ts:44`), `hull` (bounded int, fed to the
    engine as `enemyMaxHull`, `src/engine/duel/types.ts:86,210`), `host` (`{species:
    z.enum(HostSpecies), name: 1-16, bobMs: enum-of-existing-periods}`, species per
    `encounterBoard.ts:294`), `rivals` (array of D-12 fleet docs per `generatedFleet.ts:63-78`,
    quarantined pool — **never appended to `generatedFleet.json`**, whose 20 docs and preview
    are byte-pinned, `__tests__/app/generated-fleet.test.ts:239,366-376`), optional `packRefs`.
  - Glyph is **not a field**: it is `SKILL_GLYPH[skills[0]]` — total over `SkillId`
    (`src/theme/rankPresentation.ts:113`), so it is free and lint-proof.

**The exact TypeScript boundary.**
- **Bus law (the load-bearing rule):** `captain.currentIsland` and `captain.unlockedIslands`
  (`src/stores/player.ts:57,75`) carry **only** authored ids or null, forever. Persistence
  does not police these strings (`src/services/persistence.ts:140,143` accept any
  string/array), so the law is enforced twice: (a) no code path ever writes a gen id there —
  during Uncharted play `currentIsland` stays **parked at the last authored island**; (b)
  defensive hardening in `normalizeCaptain` (`persistence.ts:167-181`) drops non-catalog
  island strings on hydrate, on the `normalizeMercyState` precedent (`persistence.ts:55-70`).
  This single rule is what keeps `settleDuelRewards`, `chartNodes`, `HOSTS`, `islandGlyph`,
  `resolveDuelContext`, and `app/range.tsx:178` provably out of the blast.
- Gen progress lives in one new tolerated-as-absent captain field: `uncharted?:
  {clearedCount, current: GenIslandDoc|null, next: GenIslandDoc|null}` (pattern ratified at
  `persistence.ts:73-84,97-99`; `player.ts:88-92,113-115`).
- **May see `GenIslandId`:** `src/content/genIsland.ts`, new `src/services/uncharted/*`
  (state, duel context, settlement wrapper, local generator, encounter composer), the
  Uncharted screen, the gen branch of `app/duel.tsx`, telemetry (island field is a plain
  string).
- **Must never see it:** `src/content/index.ts` accessors (throw, `:301-311,334-336`),
  `src/engine/*` (anchor mapping below), `src/services/{chart,duelContext,rewardSettlement,
  mastery,encounter,range,rivalLoadout,rivalVariant}.ts`, `src/components/chart/*`,
  `src/components/encounter/*` authored path, the captain's five core island-typed fields.

---

## 2. Seams

**S1 — Duel engine boot: the ANCHOR MAPPING (ruled here).** `validateConfig` throws for any
non-table `islandId` even with `enemyMaxHull` supplied (`src/engine/duel/types.ts:157-159` —
verified: the hasOwn throw is unconditional; the override applies only at `buildCore`,
`:210`), and `DuelConfig.islandId: IslandId` (`:82`). Ruling: **the engine never learns gen
ids.** A gen duel boots with `islandId: 'grandline'` as a legality anchor + `enemyMaxHull:
doc.hull` + `duelId: 'gduel_<index>_<seed36>'`. The frozen engine is byte-untouched;
`DuelCore.islandId` stays `IslandId` (`:98`). The gen config is built by a new
`unchartedConfig(doc, captain)` — **not** via `legacyConfig` (`src/stores/duel.ts:194-211`),
whose `templatesBySkill: TEMPLATE_POOLS` line is source-pinned (plan `:133-137`); it applies
the same `inBandLoadout` player filter (`duel.ts:196-201`) and derives `rivalLoadout` from
`doc.skills` (mapping skills→cannons the way `rivalLoadout.ts` does, without
`islandCurriculumFor`).

**S2 — Duel screen branch.** `app/duel.tsx` gains one gen branch keyed on an explicit
uncharted boot flag (set by the entry action, never a route param — the no-route-params law,
`app/chart.tsx:252-253`). On that branch: HUD name = `doc.displayName` (bypassing
`state.islandName`, which the anchor would mint as Grandline's band name via
`stores/duel.ts:308-312`; consumed only at `app/duel.tsx:250`); rival kind/variant from
`doc.presentationKind` + doc rivals (bypassing `getEnemyForIsland`/`rivalVariantFor` at
`app/duel.tsx:90-91`, which throw on gen ids — `src/content/index.ts:307-311`,
`src/services/rivalVariant.ts:94-95`); per-turn rival loadout from the doc (bypassing
`deriveRivalLoadout` at `app/duel.tsx:176`); crew from `crewFor(rivalDocId)` directly
(island-free, `src/theme/crewPresentation.ts:99-130`). The authored branch,
`resolveDuelContext` (`src/services/duelContext.ts:28-50`), is byte-untouched — it already
fails closed on anything foreign (`:33-34`) and redirects (`duel.tsx:234`).

**S3 — Settlement (the sharpest bite, ruled here).** Two facts: `applyDuelOutcome` forwards
no options (`src/services/duelRewards.ts:84-90`), and the `metRivals` block runs off any
non-null `currentIsland`, un-gated by `voyage` (`src/services/rewardSettlement.ts:274-279` —
verified). With `currentIsland` parked at grandline, a gen duel settled as-is would mark an
authored kraken ship met — a shelf lie (`enemies.json` grandline=kraken). Ruling: **one
additive option** — `fleet?: 'mark' | 'hold'` (default `'mark'`) gating `:274`, alongside the
existing `voyage: 'hold'` (`:243-246`). New `settleUnchartedDuel` calls
`settleDuelRewards(store, input, {voyage:'hold', fleet:'hold'})`: coins, mastery tallies,
receipts (`duel:<id>` grammar accepts any duelId, `src/contracts/rewards.ts:4,34-37`), chest,
rank all ride the existing code path; both island-keyed blocks (`:274,:281`) no-op. No
existing caller passes `fleet`, so every frozen settlement behavior is unchanged; the
guided-duel call-site regex pin (`__tests__/app/win-advance.test.ts:391-399`) matches
`guidedDuel.ts:271` and is untouched. Gen "met" bookkeeping (gen ship ids into `metRivals:
string[]`, `player.ts:72` — the shelf silently drops them today, `rivalVariant.ts:126,136-152`)
happens in the explicit advance action, not settlement.

**S4 — Progression/advance.** Gen advance is an explicit `advanceUncharted(store)` action —
never a settlement side effect — the exact pattern the plan ratified for the voyage loop
(`ADAPTIVE-ISLANDS-PLAN.md:166-168`). It increments `uncharted.clearedCount`, promotes
`uncharted.next` → `current`, synthesizes the next `next` (S7). `advanceOnWin`/
`resolveUnlocks` are already gen-tolerant on inputs (Set-membership only, catalog iteration —
`src/engine/mastery.ts:212,227,279-284`) and are never fed gen ids anyway.

**S5 — Persistence.** `uncharted` field: validated by its own zod normalizer added inside
`normalizeCaptain` (`persistence.ts:167-181`) and mirrored in `migrateLegacyCaptain`
(`:183-198`); corrupt → fresh (the `normalizeMercyState` shape, `:55-70`). **No
SCHEMA_VERSION bump** — a bump without a migration arm deletes every live save
(`persistence.ts:236-239`). LLM-enriched docs live under their own storage key
(`cannon-academy/uncharted/v1`), never in the captain envelope, re-gauntleted on every
hydrate (plan `:122-131`). Gen encounter latch lives inside `uncharted`, not
`seenEncounters: IslandId[]` (`player.ts:70`).

**S6 — Chart & frontier surface (scroll strategy, ruled here).** The authored chart is a
one-screen, contain-fitted, hand-measured 5-board with no ScrollView
(`app/chart.tsx:625-630,437-449`; `board.ts:653-657`; extent pinned within 8pt of 664,
`__tests__/app/design-fidelity.test.ts:222-241`). A 6th node silently renders nothing
(`VoyageMap.tsx:332-334`). Ruling: **generated islands never render on the authored chart,
and there is no scrolling chart.** The frontier is a separate Uncharted Sea screen with a
**windowed single-frontier view**: exactly the current gen island, fog ahead (`isleFog`
already clamps for index > 4 — the codebase's one pre-authorization, `board.ts:294-305`),
and a cleared-count log behind. Composable today with zero new rasters (A-045 MD5 pins cover
sprites only, `__tests__/app/sprites.test.ts:13-15,97-147`; the chart's one raster is the
ship, `design-fidelity.test.ts:481`): `SeaWater`/`Swells` (`Sea.tsx:54,79,111`), `VoyageIsle`
recipe (`Isle.tsx:34-101`), `IsleFog` (`Fog.tsx:68-102`), `StationMarker`
(`Station.tsx:97-169`), `trailDots` (`board.ts:221-249`). Genuinely new board material: the
Uncharted screen's layout constants and a seeded isle-geometry source (the transcription law
forbids inventing these for the authored file, `board.ts:4-8`) — **board-gated** on the
Uncharted Sea design artifact the owner commissions. Entry: the dock's chain-complete
null-branch (`Dock.tsx:163-186`, fed by `app/chart.tsx:544` when `nextIndex < 0`, i.e.
`chartProgress` `none`, `src/services/chart.ts:154-185`) gains the UNCHARTED affordance — the
currently-silent dead-end is the exact seam. `chartProgress` itself is never taught about gen
islands (its completion-death is pinned, `win-advance.test.ts:342-356`).

**S7 — Island generation.** Two sources, one schema: (a) **local deterministic generator** —
pure function of `(seed, index, band)`: skills rotated from the band's own atlas cells
(catalog skills → ceiling-safe by construction), rival dealt kind-filtered from the *shipped*
20-ship fleet pool (offline-present), name from closed word lists, host species cycled, hull
a clamped ramp above `ENEMY_HULL_BY_ISLAND.grandline`; (b) **LLM enrichment** via the G11
relay — names, D-12 fleet-schema rival docs, adaptive packs — every doc through
`genIslandSchema` + the 7-stage gauntlet (plan `:102-117`), with gauntlet stage 2's cell
check re-pointed at `doc.skills` instead of `islandCurriculumFor`. LLM riddle/pack templates
inject only at the `generateQuestion` call (`src/services/encounter.ts:117`;
`armAdaptivePacks` seam, plan `:133-137`) — never into `RIDDLE_POOLS`/`TEMPLATE_POOLS`,
whose key sets are pinned (`__tests__/app/encounter.test.ts:327-338`).

**S8 — Encounters/hosts (deferred to G15).** `HostFigure` draws by species, not island
(`hosts.tsx:213-217,39-45`); a gen card needs a parallel `hostSpecFor(doc)` because
`HOSTS[islandId]` lookups (`hosts.tsx:198`, `EncounterCard.tsx:124`) and the `IslandId` prop
types (`hosts.tsx:197`, `EncounterCard.tsx:77`, `ArrivalCeremony.tsx:835-838`) are
authored-only, and `Object.keys(HOSTS)` is pinned to the 5 (`encounter.test.ts:344`).

---

## 3. Frozen-test ledger

**Pins the amended D-17 forces to move: effectively ZERO.** The two candidates, both
expected-green:
- `__tests__/app/chart-progress-presentation.test.ts:946-959` — source-scan slices the dock's
  `nextIslandCount === null ? (` branch (`:953`) and asserts *containment* of
  `numberOfLines={1}` / `adjustsFontSizeToFit`. Adding the UNCHARTED affordance inside that
  branch keeps containment true; verify at implementation, re-baseline only if the slice
  boundary shifts. This is the sole authored spec the feature physically touches.
- Prerequisite re-baselines already owned by G11/G12, unchanged by this design:
  `firebase.test.ts` AC-5/AC-8 (D-16) and the D-15 replay-comment re-word.

**Pins that must stay UNTOUCHED — the containment proof:**

| Pin | Why it stays green |
|---|---|
| `schemas.test.ts:225-236` enum exactness | enum never widens |
| `tuning.test.ts:352-398` total hull record, 5 keys, monotonic | no new keys; gen hull rides `enemyMaxHull` (`types.ts:86,210`) |
| `catalogs.test.ts:326-360` 15-cell atlas LAW; `chart-progress-presentation.test.ts:881-926` names | catalog JSON never grows |
| `win-advance.test.ts:44-50,133-160` chain shape; **`:155-158` chain-end opens nothing**; `:162-166,88-109` fixpoints; `:190-260` entry gun; `:305-319` null band | gen advance is `advanceUncharted`, never `advanceOnWin`; settlement runs `voyage:'hold'` |
| `win-advance.test.ts:342-356` completion promise dies; `:323-340` 1-duel promise | `chartProgress` never learns gen islands |
| `win-advance.test.ts:391-399` guided `{voyage:'hold'}` call-site regex | gen caller is a different module |
| `chart.test.ts:63-72` 5 nodes; `design-fidelity.test.ts:237-238,280,441-461,531-532,540` board arithmetic | authored chart file and `chartNodes` byte-untouched; frontier is a new screen |
| `grade-band-duel.test.ts:260-263` `unlockedIslands.length === islands.length` after full chain | gen ids never enter `unlockedIslands` (bus law + hydrate scrub) |
| `encounter.test.ts:103-186,327-344` skill table, HOSTS keys, riddle coverage both-ways | HOSTS untouched; packs inject at `generateQuestion`, not the tables |
| `enemy-presentation.test.ts:22-28,96-101`; `generated-fleet.test.ts:239,366-376` byte-pinned 20-ship pool + preview | gen rivals live in a quarantined pool |
| `mastery.test.ts:634-714`; `k1-island-progression.test.ts:179-251,389-390`; `grade-band-ceiling.test.ts:347-449` | engine unlock functions receive only authored inputs; K-1 ceiling re-enforced for gen content by gauntlet stages 2+4 |
| Engine reducer/seed pins (A-014/A-058) | engine byte-untouched via anchor mapping; gen configs are new fixtures |

**New frozen suites this design authors (not moves):** `genIslandSchema` strictness +
local-generator determinism; bus-law spec (no code path writes non-catalog strings into
`currentIsland`/`unlockedIslands`; hydrate scrub); anchor-mapping spec (gen boot yields a
legal `DuelConfig`, screen never displays the anchor's name); `fleet:'hold'` spec (gen
settlement marks no authored ship met, authored default unchanged).

---

## 4. Failure containment

**Island 6+ with no network / no LLM:** never blocks, never crashes, by construction — the
frontier's *base* is the local deterministic generator (S7a), which needs only shipped
assets: catalog skills, `TEMPLATE_POOLS` (question path is island-free — `duel.ts:209`, no
islandId in `questions.ts`/`duelAdapter.ts`), the shipped fleet pool, host species figures.
The LLM only *enriches*. Degradation ladder:

1. No env keys → client fully dormant on telemetry/relay (master kill switch); Uncharted runs
   pure-local.
2. Relay dead / pack key deleted → `armAdaptivePacks` returns the same reference; gen duels
   use authored pools.
3. Corrupt/hostile gen doc → `genIslandSchema.strict()` + gauntlet on every hydrate
   quarantines silently; the slot regenerates locally from `(seed,index)` — deterministic,
   cannot fail.
4. Corrupt `uncharted` field → normalizer resets to fresh (`persistence.ts:55-70` pattern);
   worst case the player restarts the frontier at island 6; authored save untouched.
5. Gen id somehow on the bus (old bug, hostile save) → hydrate scrub drops it; even
   unscrubbed, every authored gate fails closed: `resolveDuelContext` `'unknown'`→redirect
   (`duelContext.ts:33-34`), `sailPlan` no-ops (`app/chart.tsx:120-138`), `chartNodes` skips
   (`chart.ts:61,84`), `trainingCatalog` skips (`trainingCatalog.ts:56-57`).
6. Mid-duel refresh cannot reach a running duel — the engine deep-copies pools at boot
   (`types.ts:162-202`).

**Kill switch:** feature flag hides the dock affordance; `uncharted` being
tolerated-as-absent means a killed build simply ignores the field (and round-trips it intact
via the raw spread, `persistence.ts:168-169`). Full kill = flag off + delete
`cannon-academy/uncharted/v1` + env absence; the authored game is byte-identical to today.

**Validation gates (write AND read):** strict schema parse → gauntlet stages 1-7 with stage 2
re-pointed at `doc.skills` → K-1 ×/÷ ban (stage 4) → dup id/name rejection (fleet precedent,
`generatedFleet.ts:108-132`) → name lint (length bounded at 24; add the tone lint the fleet's
eyeball-review grid lacks, `generated-fleet.test.ts:333`) → re-run in full on every hydrate
against the live band and catalog.

---

## 5. Wave plan

G11 (A-072 telemetry, A-073 relay+plan reader) and G12 (A-074 gauntlet, A-075 golden sets,
A-076 generation leg, A-077 injection + D-15) are **unchanged prerequisites**. The
pre-amendment G13 (enum reopening) is superseded; the numbers are reassigned:

**G13 — the frontier exists (buildable now; no board, no LLM):**
- **A-078** `genIsland` namespace: schema + local deterministic generator + frozen
  determinism/strictness suite (`src/content/genIsland.ts`). *No deps.*
- **A-079** `uncharted` captain state: tolerated-as-absent field + normalizer + migrate arm +
  hydrate bus-scrub hardening (`persistence.ts:167-198`). *Deps: A-078.*
- **A-080** gen duel boot: `unchartedConfig` anchor mapping, screen gen branch
  (name/kind/rival/crew from doc), gen rival loadout. *Deps: A-078, A-079.*
- **A-081** gen settlement + advance: additive `fleet:'hold'` gate at
  `rewardSettlement.ts:274`, `settleUnchartedDuel`, explicit `advanceUncharted`; frozen
  no-authored-ship-met spec. *Deps: A-080.*
- **A-082** entry affordance: UNCHARTED chip in the dock null-branch (`Dock.tsx:163-186`) +
  minimal Uncharted screen (functional, primitive-composed, pre-board) + route wiring, no
  route params. *Deps: A-081. Verify the `:953` source-scan slice stays contained.*

**G14 — the frontier is generated (LLM + board):**
- **A-083** Uncharted Sea screen proper: windowed single-frontier composition. **Board-gated**
  on the commissioned Uncharted Sea design artifact; everything else in G14 does not wait on
  it. *Deps: A-082 + artifact.*
- **A-084** LLM island enrichment: relay leg emits gen-island docs (names, fleet-schema
  rivals, pack refs) under `cannon-academy/uncharted/v1`; hydrate re-gauntlet; name tone
  lint. *Deps: G11+G12, A-078.*
- **A-085** generated rivals rendered: pool-parameterized variant dealer over the quarantined
  fleet pool (byte-pinned shipped pool untouched), crew derivation, HUD identity. *Deps:
  A-080, A-084.*

**G15 (honest — the polish the amendment implies):**
- **A-086** gen-island encounters: `hostSpecFor(doc)`, species-default sub-lines, riddles via
  the gen composer at `generateQuestion`, latch in `uncharted`. *Deps: A-082; sixth-host ART
  only if the owner wants a new species (board-gated); species reuse ships without it.*
- **A-087** fleet-shelf gen wing / captain's log of cleared frontier islands (gen `metRivals`
  ids are currently shelf-invisible by design, `rivalVariant.ts:126,136-152`). *Deps: A-085.*

Board-gated: **A-083 only** (plus A-086's optional new species art). Buildable the moment G12
lands: A-078..A-082, A-084, A-085. Standing discipline unchanged: full-suite gate against the
accepted baseline, tsc clean, per-ticket commits, no push without the owner's word.
