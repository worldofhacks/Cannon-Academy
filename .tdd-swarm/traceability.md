# Traceability — Cannon Academy engine + content core

Requirement → ticket(s), for everything in this swarm's scope (`src/engine/**`, `src/content/**`).
Written at Phase 1 planning, 2026-07-27. Three sections:

1. **Coverage** — every engine-relevant requirement in `PLAN.md` / `ARCHITECTURE.md` and the
   ticket that serves it.
2. **Open questions** — numbers and rules the source documents do not specify. Nothing here was
   invented; each is either raised for the human or reduced to a behaviour-pinned constant.
3. **Planning gaps** — things arguably in scope that **no ticket covers**, with the reason.

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
| `roll = uniform(min, max)` **biased by** `answerQuality` | T-008 (AC-4, AC-5), T-004 (`QUALITY_WEIGHT`) |
| `answerQuality ∈ [0,1]` from `elapsedMs` vs the cannon's timer | T-008 (AC-1, AC-2) |
| **Floored at 0.35 for any correct answer** | T-004 (AC-1), T-008 (AC-1, AC-6) |
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
| Island arc Port Sumwich → Isla Products → Quotient Cove → Fraction Reef → Grandline | T-006 (AC-8) |
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
| easy guided duel you win | T-018 | scripted opponent mechanism |
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

Every item below is a number or rule that **PLAN.md and ARCHITECTURE.md do not specify**. None was
invented. Each was handled one of two ways:

- **(B)** the constant is named in `tuning.ts` (T-004) or a catalog, and the ACs pin its
  *behaviour* — bounds, ordering, monotonicity — not its value; or
- **(R)** it is raised here and needs an answer before the affected ticket can be considered
  finished design rather than finished code.

| # | question | source ambiguity | handling |
|---|---|---|---|
| 2.1 | **Culverin recoil.** PLAN.md's armory writes `Volatile (5/8/10)` for three guns but `Volatile (crit)` for the Culverin. §Risks says the starter guns "can't punish" K players. | PLAN.md §The armory vs §Risks | **(R)** T-006 sets `culverin.recoilDamage = 0` and reads "crit" as its wide 4–16 spread; the three documented values are pinned exactly (T-006 AC-4). One-line data edit if wrong. |
| 2.2 | **Reliable vs Standard on a miss.** "Reliable guns never punish a miss" vs "Standard guns waste the turn" — at the damage layer these are identical. | PLAN.md §The duel loop | **(R)** T-008 and T-020 treat them identically. If `reliable` should grant a re-answer, that is a new reducer transition and needs a written rule first. |
| 2.3 | **Enemy hull for islands 2–5.** Only "40–50 at the start" and "scale by island" are given. | PLAN.md §The duel loop, ARCHITECTURE.md §4.3 | **(B)** T-004 AC-2: first island in `[40,50]`, strictly increasing by island order. |
| 2.4 | **Coin payout coefficients.** Inputs are named (win, accuracy, perfects); no numbers, only "a small purse" on a loss. | PLAN.md §Treasure chests | **(B)** T-004 AC-6 + T-009 AC-1…AC-4: loss < win, loss > 0, monotone in accuracy and in perfects. |
| 2.5 | **Chest rarity tiers, weights, and coin ranges.** PLAN.md names no tiers and no weights. | PLAN.md §Treasure chests | **(B)** T-003 assumes **three** tiers (`common/uncommon/rare`); T-004 AC-7 pins positive weights summing to 1, strictly decreasing, with strictly increasing coin ranges. The *tier count* itself is **(R)**. |
| 2.6 | **Bot mercy margin, accuracy window, per-band accuracy clamps.** | PLAN.md §Opponents | **(B)** T-004 AC-8 + T-021 AC-4…AC-6: within band, below player accuracy where the clamp allows, monotone in player accuracy, bands non-decreasing across grade. |
| 2.7 | **Rank `minWins` thresholds.** Five ranks named; advancement "by duel wins"; no numbers. | PLAN.md §Sea chart | **(B)** T-006 AC-7: `cadet.minWins === 0`, strictly increasing across tiers. |
| 2.8 | **Recent-template exclusion window size.** | ARCHITECTURE.md §4.1 | **(B)** T-004 AC-4: integer in `[1, 8]`, below the per-skill template floor. |
| 2.9 | **Templates per skill — the documents conflict.** ARCHITECTURE.md §4.1 says "15–25 golden parameterized shapes per skill"; PLAN.md day 3 says "≥8 templates/skill floor". | direct contradiction | **(R)** T-014/15/16/19 enforce **≥8** (the explicitly written floor) with no cap. If 15–25 is the real target, three tickets grow rather than change shape. |
| 2.10 | **What "a harder variant of the same skill" means for Double-Shot**, plus the timer factor and volley count. No `difficulty` field exists on `Template`. | PLAN.md §The duel loop | **(R)** T-022 models it as the same question under a shortened timer (which composes with the existing quality curve). If harder *templates* are intended, T-022 is superseded, not patched, and `Template` needs a difficulty rating for ~72 templates. |
| 2.11 | **Perfect Shot bonus ball damage** and the base ball count per volley. | ARCHITECTURE.md §4.3 says "+1 bonus ball" with no value | **(B)** T-004 AC-3: both integers `>= 1`; T-008 AC-7 pins that a perfect shot strictly exceeds a non-perfect one at equal inputs. |
| 2.12 | **`QUALITY_WEIGHT`** — how strongly answer speed biases the roll. ARCHITECTURE.md says "biased by" and gives no curve. | ARCHITECTURE.md §4.3 | **(B)** T-004 AC-3 (`0 < w <= 1`) + T-008 AC-4, AC-5 (always in range, monotone in quality). |
| 2.13 | **Distractor plausibility thresholds** — "plausibly typed (same magnitude/sign)" is prose. | ARCHITECTURE.md §4.1 | **(B)** T-005 operationalises it as a four-clause rule over `DISTRACTOR_MAX_RATIO` / `DISTRACTOR_ABS_FLOOR`; T-004 AC-5 pins their bounds. |
| 2.14 | **Fog-lift rule: one mastered range skill or all of them?** PLAN.md's sentence implies a single crossing lifts the fog, but Port Sumwich has three range skills. | PLAN.md §Sea chart | **(R)** T-010 implements **any one** (AC-12), matching the sentence's grammar. |
| 2.15 | **Drill length.** No number anywhere. | PLAN.md §Sea chart / MVP checklist | **(B, by omission)** T-017 makes `length` a caller parameter rather than inventing a tuning constant. |
| 2.16 | **Captain-name wordlist.** ARCHITECTURE.md §11 promises a wordlist filter; no wordlist, no policy, no source. | ARCHITECTURE.md §11 | **(R)** No ticket — see gap §3.9. |

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
| 3.11 | **Ghost-captain `Opponent` adapter** (ARCHITECTURE.md §13) | Explicitly "documented, not built" in the source. T-023 delivers the seed+log reconstruction primitive it would need, and tests ARCHITECTURE.md's claim that the primitive works. | `deferred` |
| 3.12 | **Server-validated economy** (ARCHITECTURE.md §13) | Cloud Functions — out of this swarm's scope. T-023 and T-009 keep it possible by making payouts a pure function of a replayable log. | `deferred` |

### Requirements deliberately excluded as out of scope

These are covered by `.tdd-swarm/posture.md` and are listed only so nobody looks for them here:
expo-router screens, all components and animation, Zustand stores and the duel-store driver
(turn-token discard, teardown cancellation), AsyncStorage hydration gating, Firebase Auth /
Firestore / sync / leaderboard, EAS builds, the Blender art pipeline, audio, haptics, and the
`app/dev.tsx` tuning-slider screen. T-004 and T-024 each export the surface those screens would
consume, so the wiring stays mechanical.
