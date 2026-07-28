# Traceability — Cannon Academy engine + content core

Requirement → ticket(s), for everything in this swarm's scope (`src/engine/**`, `src/content/**`).
Written at Phase 1 planning, 2026-07-27. **Revision 2** after two independent adversarial plan
reviews. Four sections:

1. **Coverage** — every engine-relevant requirement in `PLAN.md` / `ARCHITECTURE.md` and the
   ticket that serves it.
2. **Open questions** — numbers and rules the source documents do not specify, plus the decisions
   that need the owner rather than the planner. Nothing here was invented; each is either raised
   for the human or reduced to a behaviour-pinned constant.
3. **Planning gaps** — things arguably in scope that **no ticket covers**, with the reason.
4. **Where the plan departs from the review recommendations**, with evidence.

---

## 1. Coverage

### ARCHITECTURE.md §4.1 — Question engine

| requirement | ticket(s) |
|---|---|
| Parameterized golden templates as the question source | T-003, T-014, T-015, T-016 |
| `Template` shape: id, skill, text, params, constraints, answerExpr, distractors, readAloud | T-003 |
| Four-choice taps universally; one answer + three engineered distractors | T-003, T-005, T-007 |
| `constraints: ["a + b <= 20"]` — a **tiny safe evaluator**, never `eval()` | T-002 (AC-1 scans for banned dynamic-code constructs) |
| `answerExpr` and distractor expressions evaluated over sampled params | T-002, T-005, T-007 |
| Pick template **excluding recently served ids** | T-007 (AC-3, AC-4), T-004 (`RECENT_TEMPLATE_WINDOW`) |
| Rejection-sample params until constraints pass, **bounded at 100 attempts**, throw on exhaustion | T-007 (AC-6, AC-7), T-004 (AC-1) |
| Render `{a} + {b} = ?` into display text | T-007 (AC-10, AC-11) |
| Shuffle the four choices via the seeded PRNG | T-007 (AC-12, AC-13) |
| Distractors **all distinct**, **none equal to the answer**, **plausibly typed** | T-005 (AC-2…AC-6, AC-11), T-019 (AC-8, AC-9) |
| **K-1 templates symbolic-only** (`symbolicOnly` per skill) | T-003, T-006 (AC-6), T-014 (AC-3), T-019 (AC-7) |
| **Word problems gated to grade 2+** | T-015 (AC-3), T-016 (AC-10), T-019 (AC-6) |
| Determinism: every draw through seeded mulberry32; `Math.random()` banned | T-001, enforced by the Phase-0 lint guard |
| Seed carried in state | T-013 (`DuelCore.rng`), T-017 (`DrillSession.rng`) |

### ARCHITECTURE.md §4.2 — Duel state machine

| requirement | ticket(s) |
|---|---|
| Phase list `countdown → playerChoose → reload → resolvePlayer → rivalTurn → resolveRival → victory \| defeat` | T-013 (AC-1), T-020 |
| Discriminated-union `DuelState` + `duelReducer(state, event): DuelState` | T-013 (AC-10), T-020 |
| Events `CANNON_SELECTED`, `ANSWER_CHOSEN {choiceIndex, elapsedMs}`, `TIMER_EXPIRED`, `ANIMATION_DONE`, `RIVAL_ACTION` | T-013, T-020 |
| `rivalTurn` collapses the rival's choose+reload+answer into one step | T-013 (`RivalVolley`), T-020 (AC-13) |
| Promise-based `Opponent` interface (`chooseAction`, `produceAnswer`) | T-018 (AC-1) |
| The async `Opponent` ↔ synchronous reducer **seam** composing end to end | T-024 (AC-16, AC-17). The store driver that normally owns this seam is out of scope, so it is exercised by 1,000 opponent-driven fuzz duels instead. This is also the in-scope consumer that keeps `src/engine/opponents/**` from being an orphan (T-024 AC-18) |
| **Turn token** stamped per turn | T-013, T-020 (AC-1, AC-12, AC-15) |
| **Out-of-phase events are no-ops** | T-020 (AC-16, AC-17 — exhaustive 8×5 matrix), T-024 (AC-14) |
| Bot delays PRNG-drawn or presentational, **never wall-clock** | T-018 (AC-8, AC-9), T-021 (AC-14, AC-18) |
| Banded bot accuracy tracking player accuracy minus a margin (mercy) | T-021 (AC-4, AC-6, AC-19) |
| Scripted onboarding rival on the same interface | T-018 (AC-2, AC-3) |
| **Seed + ordered per-volley action log `{actor, cannonId, correct, elapsedMs}` = exactly reconstructable duel** | T-013 (AC-11), T-023 (AC-1, AC-2, AC-7, AC-13) |
| Turn-token discard of stale promises; teardown cancellation | **OUT OF SCOPE** — `src/stores/**`. T-013/T-020 supply the `turnToken` the driver compares. |

### ARCHITECTURE.md §4.3 — Damage model

| requirement | ticket(s) |
|---|---|
| `roll = uniform(min, max)` **biased by** `answerQuality` | T-008 (AC-4, AC-5), plus AC-16's effect-size floor so the bias is measurable, not merely non-negative |
| `answerQuality ∈ [0,1]` from `elapsedMs` vs the cannon's timer | T-008 (AC-1, AC-2) |
| **Floored at 0.35 for any correct answer** | T-004 (AC-1), T-008 (AC-1) |
| "a slow-but-correct K kid **always lands ≥ a respectable mid-range volley**" (ARCHITECTURE.md:206) | T-008 (AC-15, AC-6). The floor binds the **roll's lower bound**, not just the quality input — an earlier draft of T-008 floored only the input and would have satisfied every other criterion while breaking this one |
| Perfect shot iff `elapsed < 40%` of timer → `+1 bonus ball` | T-004 (AC-1), T-008 (AC-3, AC-7) |
| Volatile guns: wrong answer → recoil damage to self | T-006 (AC-4), T-008 (AC-9), T-020 (AC-5) |
| **Per-island enemy hull in `tuning.ts`**; starter sloops 40–50 vs player 100 | T-004 (AC-1, AC-2) |
| Player hull session-only, resets each duel | T-013 (AC-2) |
| Duels resolve in 4–6 player volleys | T-008 (AC-13 — 1,000-duel simulation) |
| All feel constants in one file, dev-slider-ready | T-004 |
| Damage renders as N cannonball arcs | T-008 exposes `ballCount`; **VFX out of scope** (`src/components/**`) |

### ARCHITECTURE.md §4.4 — Content catalogs

| requirement | ticket(s) |
|---|---|
| `cannons.json`, `islands.json`, `crew.json`, `ranks.json`, `templates/<skill>.json` | T-006, T-014, T-015, T-016 |
| All typed, all zod-validated | T-003, T-006 (AC-1, AC-12), T-019 (AC-5) |
| **Golden test: every template × 1,000 seeded samples** | T-019 (AC-8) + per-band sweeps in T-014 (AC-5), T-015 (AC-5), T-016 (AC-4) |
| Content ships in the bundle; **no network call in the play path, ever** | T-006 (AC-13), T-019 (explicit Out of Scope) |

### ARCHITECTURE.md §8 — Project structure (`src/engine/`)

| module | ticket(s) |
|---|---|
| `rng.ts` | T-001 |
| `questions/` — types, generator, distractors, safe constraint eval | T-002, T-003, T-005, T-007 |
| `duel/` — DuelState, events, reducer, damage | T-008, T-013, T-020, T-022, T-023, T-024 |
| `opponents/` — Opponent interface, bots, mercy, scripted rival | T-018, T-021 |
| `economy.ts` | T-009 |
| `mastery.ts` | T-010 |
| `tuning.ts` | T-004 |
| `src/content/` — JSON catalogs + zod schemas | T-003, T-006, T-014, T-015, T-016, T-019 |
| *(added)* `placement.ts`, `ranks.ts`, `drill.ts`, `duel/replay.ts`, `duel/invariants.ts` | T-011, T-012, T-017, T-023, T-024 — five modules not named in §8; each is tagged `proposed` in its ticket with the PLAN/ARCHITECTURE line it serves |

### ARCHITECTURE.md §9 — Testing strategy

| requirement | ticket(s) |
|---|---|
| §9.1 Template golden tests (highest value) | T-019, T-014, T-015, T-016 |
| §9.2 Reducer paths: win, loss, timeout, volatile backfire, perfect shot | T-020 (AC-10, AC-11, AC-7, AC-5, AC-9) |
| §9.2 Reducer path: double-shot | T-022 |
| §9.2 Invariant fuzz — never negative hull, never a stuck state, no out-of-phase transition | T-024 (AC-10, AC-11, AC-13, AC-14) |
| §9.2 "never negative coins" | T-009 (AC-12) — coins live in the economy, not `DuelState` |
| §9.3 Economy/mastery: payout math, chest rarity distribution, threshold unlocks | T-009, T-010 |
| §9.4 Component tests minimal | **OUT OF SCOPE** — verified by the owner's on-device playtest ritual |

### ARCHITECTURE.md §5 / §11 / §13 — surfaces this swarm only partly touches

| requirement | ticket(s) |
|---|---|
| `rankTier` is **numeric** (string ranks sort alphabetically and break the ladder) | T-012 (DoD) |
| `mastery: {skillId: 0-100}` persisted shape | T-010 (AC-8, `MASTERY_METER_MAX`) |
| `duels/{id}: { seed, actions[] }` replayable | T-013 (AC-11), T-023 (AC-12) |
| Firestore, Auth, sync, leaderboard mirror, TTL | **OUT OF SCOPE** (`.tdd-swarm/posture.md`) |
| §13 ghost-captain async PvP | `deferred` — T-023 delivers the reconstruction primitive; the `Opponent` adapter is documented, not built |
| §11 captain-name **wordlist filter** | **GAP — see §3.9** |

### PLAN.md — design requirements

| requirement | ticket(s) |
|---|---|
| Choose a cannon → reload with that cannon's question and timer → correct fires | T-020 (AC-2, AC-4) |
| Answer speed aims the shot | T-008 |
| Wrong tap = misfire splash; volatile = hull damage to self | T-008 (AC-8, AC-9), T-020 (AC-5, AC-6) |
| Three temperaments (Reliable / Standard / Volatile) | T-003 (AC-8), T-006 (AC-4), T-008 |
| Starter loadout: two K-skill cannons with different profiles | T-006 (AC-5), T-011 (AC-2) |
| Full 10-cannon armory with damage/temperament/timer/unlock | T-006 (AC-3, AC-4) |
| Double-Shot | T-022 |
| Hull resets after every duel; losing pays a small purse; rank intact | T-013 (AC-2), T-009 (AC-1, AC-2), T-012 (AC-6, AC-8) |
| Coins by performance (win, accuracy, perfects) | T-009 (AC-2, AC-3, AC-4) |
| Chest on a rarity roll | T-009 (AC-8, AC-9, AC-10) — contents beyond coins are a `scope-cut`, §3.5 |
| Island arc Port Sumwich → Isla Products → Quotient Cove → Fraction Reef → Grandline | T-006 (AC-8), with each island's exact `rangeSkills` / `unlocksCannons` pinned by AC-14 — T-010 AC-12 and T-011 AC-7 have frozen tests that assume that assignment |
| Gunnery range drills at **full** mastery rate | T-010 (AC-2), T-017 (AC-3, AC-9) |
| Duel correct answers fill the matching skill at **half** rate | T-010 (AC-2, AC-5), T-013 (`DuelTally.bySkill`), T-020 (AC-4) |
| Threshold = **10 correct at ≥70% accuracy** | T-004 (AC-1), T-010 (AC-6, AC-7) |
| Crossing a threshold unlocks that skill's next cannon and lifts the fog | T-010 (AC-10, AC-12) |
| Placement by grade picker (K-1 / 2-3 / 4-5) pre-unlocks islands and cannons | T-011 |
| Rank ladder Cadet → Fleet Legend, advanced by wins, never drops | T-012 |
| Mercy: bot accuracy tracks player minus a margin, clamped to band | T-021 (AC-4, AC-6, AC-19) |
| Mercy: two straight losses → next rival misfires twice | T-021 (AC-7, AC-8, AC-12) |
| Opponents share one actor interface (bots, scripted, future remote) | T-018 |
| Multiple choice defensible because ≥70% gate blocks guessing | T-010 (AC-7), T-017 (AC-10) |
| ≥8 templates per skill | T-019 (AC-3) — see open question §2.9 |

### PLAN.md — MVP checklist lines this swarm can serve

| checklist line | ticket(s) | note |
|---|---|---|
| grade picker pre-unlocks content | T-011 | screen is out of scope |
| easy guided duel you win | T-018, T-004 | mechanism (T-018) **and** the "politely sinks in three volleys" hull, now a named constant `ONBOARDING_ENEMY_HULL` (T-004 AC-12) asserted against the Swivel's floor volley (T-018 AC-13). Previously this row claimed coverage while the quantitative half had no owner |
| win a real duel against a bot | T-020, T-021 | |
| four-choice answers | T-007 | |
| speed-aimed volleys | T-008 | |
| two starter cannons that are a real choice | T-006 (AC-5) | |
| earn coins | T-009 | |
| practice drill fills a mastery meter | T-017 (AC-9) | |
| the meter unlocks the next cannon | T-010 (AC-10) | |
| lose on purpose: small purse, rank intact, hull reset | T-009, T-012, T-013 | |
| time out a question and see the misfire | T-020 (AC-7) | |
| kill the app mid-duel, relaunch with progress intact | T-013 (AC-6), T-020 (AC-20), T-017 (AC-14) | engine half only — the AsyncStorage hydration gate is out of scope |

---

## 2. Open questions for the human

Every item below is a number or rule that **PLAN.md and ARCHITECTURE.md do not specify**, or a
scoping decision that belongs to the owner rather than the planner. None was invented. Each was
handled one of two ways:

- **(B)** the constant is named in `tuning.ts` (T-004) or a catalog, and the ACs pin its
  *behaviour* — bounds, ordering, monotonicity — not its value; or
- **(R)** it is raised here and needs an answer before the affected ticket can be considered
  finished design rather than finished code.

### Answer-by deadlines (added in rev 2 — the first review found these were unranked)

| when it must be answered | items |
|---|---|
| **Before wave 1 dispatch** | none. 2.10's blast radius was neutralised by adding `difficulty?: 1 \| 2 \| 3` to `templateSchema` as insurance (T-003 AC-17), and 2.5's three-tier `ChestRarity` is now stated as a `(R)` assumption rather than an implicit one. |
| **Before wave 3 dispatch** | **2.2** (Reliable vs Standard on a miss). If `reliable` grants a re-answer, that is a new reducer transition and possibly a new phase — a T-020 supersede, and T-008 changes too. |
| **Before wave 5 dispatch** | **2.9** (templates per skill: 15–25 vs ≥8). Determines the size of three tickets. |
| **Before wave 6 dispatch** | **2.10** (Double-Shot semantics). With the insurance field in place this is now a T-022-local patch plus content authoring, not a cross-wave supersede. |
| **Any time** | 2.1, 2.14, 2.16 (one-line data edits or gap-only). All **(B)** items — never blocking. |
| **Scoping calls, answer before wave 5 / wave 7 respectively** | **2.18** (T-020 / T-021 sizing), **2.19** (whether T-023 is built at all). |

| # | question | source ambiguity | handling |
|---|---|---|---|
| 2.1 | **Culverin recoil.** PLAN.md's armory writes `Volatile (5/8/10)` for three guns but `Volatile (crit)` for the Culverin. §Risks says the starter guns "can't punish" K players. | PLAN.md §The armory vs §Risks | **(R)** T-006 sets `culverin.recoilDamage = 0` and reads "crit" as its wide 4–16 spread; the three documented values are pinned exactly (T-006 AC-4). One-line data edit if wrong. |
| 2.2 | **Reliable vs Standard on a miss.** "Reliable guns never punish a miss" vs "Standard guns waste the turn" — at the damage layer these are identical. | PLAN.md §The duel loop | **(R) — answer before wave 3.** T-008 and T-020 treat them identically. If `reliable` should grant a re-answer, that is a **new reducer transition** and possibly a new `DuelState` phase: a T-020 supersede, not a patch, and T-013's phase list would reopen too. This is the highest-blast-radius unanswered question in the set. |
| 2.3 | **Enemy hull for islands 2–5.** Only "40–50 at the start" and "scale by island" are given. | PLAN.md §The duel loop, ARCHITECTURE.md §4.3 | **(B)** T-004 AC-2: first island in `[40,50]`, strictly increasing by island order. |
| 2.4 | **Coin payout coefficients.** Inputs are named (win, accuracy, perfects); no numbers, only "a small purse" on a loss. | PLAN.md §Treasure chests | **(B)** T-004 AC-6 + T-009 AC-1…AC-4: loss < win, loss > 0, monotone in accuracy and in perfects. |
| 2.5 | **Chest rarity tiers, weights, and coin ranges.** PLAN.md names no tiers and no weights. | PLAN.md §Treasure chests | **(R) for the tier count, (B) for the values.** `ChestRarity` is a **wave-1 id union** in T-003, and T-004 AC-7 plus T-009 AC-8/AC-10 are all written against exactly three tiers — so changing the count later is a wave-1 schema edit plus two frozen suites. Three is the planner's assumption, not a sourced fact. Weights/ranges are behaviour-pinned (positive, summing to 1, strictly decreasing, with strictly increasing coin ranges). |
| 2.6 | **Bot mercy margin, accuracy window, per-band accuracy clamps.** | PLAN.md §Opponents | **(B)** T-004 AC-8 + T-021 AC-4…AC-6: within band, below player accuracy where the clamp allows, monotone in player accuracy, bands non-decreasing across grade. |
| 2.7 | **Rank `minWins` thresholds.** Five ranks named; advancement "by duel wins"; no numbers. | PLAN.md §Sea chart | **(B)** T-006 AC-7: `cadet.minWins === 0`, strictly increasing across tiers. |
| 2.8 | **Recent-template exclusion window size.** | ARCHITECTURE.md §4.1 | **(B)** T-004 AC-4: integer in `[1, 8]`, below the per-skill template floor. |
| 2.9 | **Templates per skill — the documents conflict.** ARCHITECTURE.md §4.1 says "15–25 golden parameterized shapes per skill"; PLAN.md day 3 says "≥8 templates/skill floor". | direct contradiction | **(R)** T-014/15/16/19 enforce **≥8** (the explicitly written floor) with no cap. If 15–25 is the real target, three tickets grow rather than change shape. |
| 2.10 | **What "a harder variant of the same skill" means for Double-Shot**, plus the timer factor and volley count. | PLAN.md §The duel loop | **(R) — answer before wave 6.** T-022 models it as the same question under a shortened timer, which composes with the existing quality curve and needs no content change. If harder *templates* are intended instead, T-022 is superseded rather than patched. **Blast radius reduced in rev 2:** `difficulty?: 1 \| 2 \| 3` is now carried on `templateSchema` (T-003 AC-17) as unused insurance, so the alternative answer no longer reopens a frozen wave-1 schema — it becomes a T-022 rewrite plus content authoring. |
| 2.11 | **Perfect Shot bonus ball damage** and the base ball count per volley. | ARCHITECTURE.md §4.3 says "+1 bonus ball" with no value | **(B)** T-004 AC-3: both integers `>= 1`; T-008 AC-7 pins that a perfect shot strictly exceeds a non-perfect one at equal inputs. |
| 2.12 | **`QUALITY_WEIGHT`** — how strongly answer speed biases the roll, and the **effect-size floor** that keeps it honest. ARCHITECTURE.md says "biased by" and gives no curve. | ARCHITECTURE.md §4.3 | **(B)** T-004 AC-3 (`0 < w <= 1`), T-008 AC-4/AC-5 (in range, monotone), **and new in rev 2** T-008 AC-16: the mean roll at full quality must exceed the mean at the floor by `>= 0.10 * range`. Without AC-16 an implementation could set `w = 0.001` — passing everything while making "answer speed aims the shot" statistically undetectable. **The `0.10` threshold is itself unsourced**; it implies roughly `QUALITY_WEIGHT >= 0.62` and is deliberately a floor, not a target. Raise or lower it if the felt effect is wrong on-device. |
| 2.13 | **Distractor plausibility thresholds** — "plausibly typed (same magnitude/sign)" is prose. | ARCHITECTURE.md §4.1 | **(B)** T-005 operationalises it as a four-clause rule over `DISTRACTOR_MAX_RATIO` / `DISTRACTOR_ABS_FLOOR`; T-004 AC-5 pins their bounds. |
| 2.14 | **Fog-lift rule: one mastered range skill or all of them?** PLAN.md's sentence implies a single crossing lifts the fog, but Port Sumwich has three range skills. | PLAN.md §Sea chart | **(R)** T-010 implements **any one** (AC-12), matching the sentence's grammar. |
| 2.15 | **Drill length.** No number anywhere. | PLAN.md §Sea chart / MVP checklist | **(B, by omission)** T-017 makes `length` a caller parameter rather than inventing a tuning constant. |
| 2.16 | **Captain-name wordlist.** ARCHITECTURE.md §11 promises a wordlist filter; no wordlist, no policy, no source. | ARCHITECTURE.md §11 | **(R)** No ticket — see gap §3.9. |
| 2.17 | **`DISTRACTOR_ABS_FLOOR` and `MAX_DISTRACTOR_ATTEMPTS` are now bounded below by derivation, not by choice** (`>= 3` and `>= 9`). | consequence of T-005's ladder | **(B), recorded so nobody "relaxes" it.** For a zero answer — which `sub_within_20` legally produces when `a == b` — the magnitude-ratio branch is undefined and negatives are excluded, so `{1, 2, 3}` is the complete set of distractors the 9-rung ladder can ever yield. A floor under `3` makes a four-choice question unbuildable and fails T-014's 1,000-sample sweep non-deterministically. At exactly `3` there is zero headroom. Values above the floors remain open. |

### Owner decisions — these are not planner calls

| # | decision | what it costs either way | recommendation |
|---|---|---|---|
| 2.18 | **Do T-020 (24 ACs, one file) and T-021 (19 ACs, two files) get split?** Both exceed the ticket-format guidance of "~half a day / ≤8 DoD items". T-020 additionally sits on the critical path in the run's peak-load wave (5). | **Keep whole:** one agent holds the entire transition table, which is where reducer bugs actually live — a split along phases would give two agents overlapping `file_scopes` in the same wave, which the parallel model forbids, so a split necessarily means an extra wave. **Split:** T-020 could shed its rival-turn half (AC-13–AC-15, AC-18) into a wave-6 follow-up; T-021 could separate `mercy.ts` (pure policy, ~10 ACs) from `bot.ts` (~9 ACs) — those two files have no circular dependency, so this one costs nothing but a wave. | **Keep T-020 whole; split T-021 only if wave 6 is running light.** T-020's ACs are numerous because the transition table is exhaustively enumerated, not because it spans two concerns; splitting a state machine mid-table is how soft-locks get in. T-021's split is genuinely cheap — but its two files are coupled by design and the coordination cost is real. Both are flagged, not defaulted. |
| 2.19 | **Is `duel/replay.ts` (T-023) built at all?** It is the plan's strongest cut-line candidate. | **Build it (current plan):** one `capable` ticket, 13 ACs, in wave 7. It makes ARCHITECTURE.md §4.2's claim — "seed + action log = an exactly reconstructable duel" — falsifiable while the machine is small, and it is the primitive both §13 futures (ghost-captain PvP, server-validated payouts) need. **Cut it:** the MVP-facing half of that claim is *already* covered without it — mid-duel kill/relaunch is T-013 AC-6 and T-020 AC-20, and determinism is T-020 AC-19. What `replay.ts` adds beyond those serves only features ARCHITECTURE.md §13 explicitly declines to build. | **Cut-line candidate, owner's call.** Against a 5-day timebox with an explicit cut list, this is the one shipped module in the plan whose only beneficiaries are documented-not-built features. If it is cut, keep the property as one AC inside T-024's fuzz ("re-dispatching a recorded event stream reproduces the final state") and drop the module — that retains the architectural check for roughly a tenth of the cost. Wave 7 would then hold T-024 alone. |

---

## 3. Planning gaps — in-scope-shaped work that NO ticket covers

Listed so the absence is a decision, not an oversight.

| # | gap | why no ticket | tag |
|---|---|---|---|
| 3.1 | **Boss encounters** — ghost ship and kraken with bigger hulls and "one signature attack each" | Hulls are already expressible in `tuning.ts`, but a *signature attack* is a new reducer transition with no written rule. PLAN.md dates it day 4, after this swarm's content. | `deferred` |
| 3.2 | **Merchant rescues and treasure digs** — timed drill events paying coins and reputation | PLAN.md day 3. "Reputation" is a currency that exists nowhere else in either document; the drill loop itself is T-017. Needs a design line before it can be a ticket. | `deferred` |
| 3.3 | **Boarding finisher** — at <20% enemy hull, choose the safe cannon finish or one hard question for a bonus-tier chest | PLAN.md marks it "Stretch, one branch only". Depends on 2.10 (what "hard" means) and 3.5 (bonus-tier chest contents). | `deferred` |
| 3.4 | **Coach cards** — the worked solution for a missed question | PLAN.md: "Coach cards are stretch" (day 4). Would require a new `explanation` / solution-steps field on `Template` and authored prose for ~72 templates. Adding the field speculatively would be fabrication. | `deferred` |
| 3.5 | **Chest item resolution** — turning a chest into a specific cannon, crew member, or cosmetic | PLAN.md's own cut line keeps chests as "coins + cannons + cosmetics" and the first thing cut is the ceremony → "plain coin payout"; day 2 says "treasure chest as a plain rarity roll". A cosmetics catalog does not exist in either document, and eligible-cannon selection needs player unlock state that lives in the store. T-009 ships rarity + coins. | `scope-cut` |
| 3.6 | **Crew passive effects** — Gunner crit nudge, Carpenter +5 hull between duels, Cook one answer re-roll | PLAN.md: "Crew depth is a day-4 stretch: the cut line keeps chests as coins + cannons + cosmetics." T-006 ships `crew.json` as identity data only. | `scope-cut` |
| 3.7 | **Harbor shop / coin sink pricing** — repair kits, stat parts, decorative flags, buy-a-chest | PLAN.md day 4. Every item price is unspecified and half the catalog (cosmetics, stat parts) does not exist. | `deferred` |
| 3.8 | **Faction taxonomy** — rival cadets vs pirate crews vs bosses | PLAN.md day 3 calls it "faction opponent variety". T-018/T-021 carry an opaque `id` string, which is the whole mechanical surface; anything more is art and copy. | `scope-cut` |
| 3.9 | **Captain-name wordlist filter** (ARCHITECTURE.md §11) | This *is* pure-TS, in-scope-shaped work, and it is the only user-generated text in the product — the one place a child-safety promise is made and not tested. No ticket exists because the wordlist itself is content nobody has specified (source, language coverage, match strategy). **Recommend a T-025 once the human answers 2.16.** | `research-required` |
| 3.10 | **"Tap-the-picture" fraction choices** (PLAN.md §The armory) | Needs an image asset pipeline and a non-numeric `Choice` shape, both out of this swarm's scope. T-016 ships integer-answerable fractions, which PLAN.md offers as the primary option. | `scope-cut` |
| 3.11 | **Ghost-captain `Opponent` adapter** (ARCHITECTURE.md §13) | Explicitly "documented, not built" in the source. T-023 delivers the seed+log reconstruction primitive it would need, and tests ARCHITECTURE.md's claim that the primitive works. **Recorded as an accepted deviation, not as ordinary coverage:** T-023 ships a module whose only beneficiaries are §13 futures. See owner decision 2.19. | `deferred` (adapter) · **accepted deviation** (the primitive) |
| 3.12 | **Server-validated economy** (ARCHITECTURE.md §13) | Cloud Functions — out of this swarm's scope. T-023 and T-009 keep it possible by making payouts a pure function of a replayable log. | `deferred` |

### Requirements deliberately excluded as out of scope

These are covered by `.tdd-swarm/posture.md` and are listed only so nobody looks for them here:
expo-router screens, all components and animation, Zustand stores and the duel-store driver
(turn-token discard, teardown cancellation), AsyncStorage hydration gating, Firebase Auth /
Firestore / sync / leaderboard, EAS builds, the Blender art pipeline, audio, haptics, and the
`app/dev.tsx` tuning-slider screen. T-004 and T-024 each export the surface those screens would
consume, so the wiring stays mechanical.

### Reachability — which modules have an in-scope consumer

`.tdd-swarm/posture.md` waives the standard reachability gate for this library layer and
substitutes: *every module must be exported from its package index and exercised by frozen tests
through its public API; an orphan that nothing imports and no test drives is still a finding.*

Rev 2 closed the one real orphan cluster. `src/engine/opponents/**` — `types.ts`, `scripted.ts`,
`bot.ts`, `mercy.ts` — previously had **no in-scope consumer at all**: the declared
`T-018 → T-020` edge was phantom (the reducer consumes `RivalVolley` from `duel/types.ts`, never
the `Opponent` interface), so those four modules were tested only in isolation and their interface
shape was never compile-checked against a caller. T-024 AC-16–AC-18 now drive 1,000 fuzz duels
through `createScriptedOpponent` and `createBotOpponent`, which both de-orphans the directory and
provides the only in-scope exercise of ARCHITECTURE.md §4.2's async↔sync seam.

Still consumed only by out-of-scope callers, which is expected and covered by the waiver:
`economy.ts` (store), `placement.ts` (onboarding screen), `ranks.ts` (store), `drill.ts`
(`app/range.tsx`), `duel/invariants.ts` (`app/dev.tsx` — though T-024's own fuzz drives it), and
`duel/replay.ts` (§13 futures — see owner decision 2.19).

---

## 4. Where this plan departs from the review recommendations

Both reviewers were right about every Critical and Important finding, and all of them are fixed.
Three recommendations were **not** followed as written. Evidence for each, so the coordinator can
overrule me if I have this wrong.

### 4.1 The "8 waves → 7" arithmetic in the coupling review is inconsistent with its own F3 recommendation

The coupling review's re-wave table (its final section) places `T-018` and `T-020` **both in
wave 5**, while its F3 recommends *keeping* the `T-018 → T-020` edge and making it real via
option (b). Those two statements cannot both hold: if `T-018` is in wave 5 and `T-020` depends on
it, `T-020` is in wave 6 by the review's own "earliest wave its dependencies allow" rule — and
`T-022`, `T-023`, `T-024` each shift with it, giving **8 waves, not 7**.

The table's numbers are correct only under F3 option **(a)** — dropping the edge — which the same
review recommends against. So the claim "the wave count is identical, so F3(b) is strictly better
value" is not true as stated: **F3(b) costs exactly one wave.**

**What this plan does instead**, which gets both properties the review wanted:

- **Drop the edge** (option a). It is genuinely phantom — the transition table never touches
  `Opponent`, and `RivalVolley` lives in `duel/types.ts`. `T-020` moves to wave 5. → **7 waves.**
- **Make the consumer relationship real in `T-024` instead** (the substance of option b), which
  already sits at wave 7 behind `T-022`. `T-018` and `T-021` join its `depends_on` at **zero wave
  cost**, and AC-16–AC-18 drive 1,000 fuzz duels through the real scripted **and** bot opponents.

This is strictly better than either reviewer option: it de-orphans **all four**
`opponents/**` modules rather than the two `T-020` would have touched, exercises the async seam
across 1,000 duels rather than one scripted example, and keeps the shorter schedule. Verified
mechanically: 24 tickets, 7 waves, no cycles, no back-edges, no same-wave file or test-scope
collisions.

### 4.2 The damage-curve fix required changing the formula, not adding an assertion

The coupling review offered two options for F6: (a) change the formula so quality raises the
roll's lower bound, or (b) keep the linear blend and add an AC pinning the minimum observed roll.

**(b) does not work.** Under `biased = u*(1-W) + q*W`, the minimum observed roll over any number
of seeds converges to `damageMin + round(0.35 * W * range)` as `u → 0` — for the Swivel Gun
(8–12) with any `W < 1` that is `9`, one point above the floor. There is no threshold you can
assert that both passes and means "a respectable mid-range volley"; the AC would have documented
the defect rather than caught it. Option (a) was taken, with the exact formula written into T-008's
Context and `Math.ceil` on the lower bound so the coordinator's requested criterion
(`rollDamage >= damageMin + ANSWER_QUALITY_FLOOR * (damageMax - damageMin)`, T-008 AC-15) is
*exactly* true rather than true-to-within-rounding.

Two consequences worth flagging:

- **The 4–6 volley tolerance (minor M-1) fixed itself.** With the floor binding the roll, a
  correct answer at half the timer on the Swivel always rolls `10–12` against a 40–50 hull, so
  every observation lands in `[4, 5]`. T-008 AC-13 was tightened from `[4, 7]` to `[4, 6]` for
  **every** observation, matching PLAN.md's quoted line with no tail tolerance.
- **The effect-size AC (I-2) is scoped to cannons with `range >= 10`.** On the Swivel's 4-damage
  range, `Math.round` of a single roll dominates any mean difference, so the assertion would be
  measuring rounding rather than the curve. Monotonicity (AC-5) and the floor (AC-15) still apply
  to every cannon.

### 4.3 `no-eval` is a recommendation to the orchestrator, not a ticket edit

I-3 asked for the source-text scans to be backed by identifier-based lint. The determinism half is
already done — the coordinator's F7 fix extended `no-restricted-properties` / `no-restricted-globals`
to `src/content/**`, verified. The **dynamic-code** half is not: `no-eval`, `no-implied-eval`, and
`no-new-func` are **not** in `js.configs.recommended`, so nothing currently catches
`const F = Function; F(src)` in `src/engine/questions/expr.ts`.

That is a `eslint.config.js` change, which is outside this planner's scope (and outside every
ticket's `file_scopes`). It is written into T-002 AC-1 as an explicit **orchestrator action
required before T-002 is dispatched**, including the lesson L-001 requirement to prove the rules
firing on a synthetic violation. The scans stay in all four tickets as secondary defence, per the
coordinator's instruction.
