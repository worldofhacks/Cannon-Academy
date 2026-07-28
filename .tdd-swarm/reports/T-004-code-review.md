# T-004 — Code Review (independent)

**Ticket:** T-004 — Central tuning constants
**Implementation:** `/Users/quietguy/Documents/Dev/Gauntlet/cannon-wt/wt-T-004/src/engine/tuning.ts` (236 lines, 32 exports)
**Frozen tests:** `__tests__/engine/tuning.test.ts` (68 tests, 12/12 ACs tagged)
**Reviewer:** independent senior engineer (did not write this code)
**Date:** 2026-07-28

---

## Verdict summary

| Dimension | Result |
|---|---|
| **1. Spec compliance** | **Clean.** AC-1 … AC-12 all met; all 7 DoD items met (two citation nits). No Iron Law violation. |
| **2. Code quality / value judgement** | **1 Important, 5 Minor.** |

**Overall: CHANGES REQUIRED** — on a single value, `ONBOARDING_ENEMY_HULL`.

The one blocking finding is arithmetic, not stylistic: `ONBOARDING_ENEMY_HULL = 24` makes
PLAN.md's guided first duel end in **two** volleys, not three, for every answer inside the
Perfect-Shot window. AC-12 pinned only the upper half of that relationship, so the frozen tests
do not catch it — and the corrected value (27–30) passes every frozen test unchanged.

Everything else in this file is, on the arithmetic, better than it had to be. The per-island hull
ladder is genuinely well-calibrated against the cannon-unlock progression (§2.2), the chest tiers
are properly separated (§2.3), the mastery arithmetic closes exactly against T-010's formula
(§2.4), and `QUALITY_WEIGHT = 0.7`'s derivation is honest and correct when re-derived from
scratch (§2.6). I looked hard for a second Important and did not find one.

---

## 1. SPEC COMPLIANCE

### Acceptance criteria

| AC | Verdict | Evidence |
|---|---|---|
| **AC-1** — twelve doc-fixed constants exact | **met** | `tuning.ts:36` `PLAYER_HULL = 100`; `:65` `0.35`; `:68` `0.4`; `:104` `100`; `:114` `4`; `:142` `10`; `:145` `0.7`; `:148` `1`; `:151` `0.5`; `:154` `100`; `:233` `2`; `:236` `2`. All twelve match the Planning Decisions verbatim. |
| **AC-2** — five islands, positive ints, `port_sumwich ∈ [40,50]`, strictly increasing, `≤ 4×PLAYER_HULL` | **met** | `tuning.ts:38-50` → `45 < 60 < 75 < 95 < 120`; `45 ∈ [40,50]`; max `120 ≤ 400`. Typed `Record<IslandId, number>` (`:38`), so a sixth island is a compile error. |
| **AC-3** — `0 < QUALITY_WEIGHT ≤ 1` **and > 7/12**; two integers `≥ 1` | **met** | `:77` `0.7 > 0.5833…`; `:80` `BASE_BALLS_PER_VOLLEY = 1`; `:83` `PERFECT_SHOT_BONUS_DAMAGE = 1`. I re-derived the `7/12` bound independently from T-008's published formula and confirm it (see §2.6). |
| **AC-4** — `RECENT_TEMPLATE_WINDOW` int in `[1,7]` (**corrected** from `≤8`); `MAX_DISTRACTOR_ATTEMPTS ≥ 9` | **met** | `:111` `5 ≤ 7` — respects the amendment, leaves ≥3 candidates on a floor-sized 8-template pool; `:135` `9`, matching T-005's 9-rung ladder exactly. |
| **AC-5** — `DISTRACTOR_MAX_RATIO` finite `> 1`; `DISTRACTOR_ABS_FLOOR` int `≥ 3` | **met** | `:121` `2`; `:129` `3`. Cross-checked against T-005's plausibility rule and 9-rung ladder: the zero-answer set `{1,2,3}` is exactly reachable at floor 3. See §2.7 for a boundary note on `RATIO = 2`. |
| **AC-6** — four coin constants finite `> 0`; `COINS_LOSS_BASE < COINS_WIN_BASE`; magnitudes survive `Math.round` | **met** | `:161` `20`; `:167` `5 < 20`; `:170` `0.2`; `:176` `1`. Under T-009's `round(base + 0.2·acc% + 1·perfects)` both coefficients move whole coins: `0.2 × 100 = 20`, and `+1` per perfect is round-monotone. No `1e-9` hole. |
| **AC-7** — one weight per rarity, `> 0`, sums to 1 ±1e-9, strictly decreasing; coin ranges int, `0 < min ≤ max`, both strictly increasing | **met** | `:178-184` `0.6 > 0.3 > 0.1`, sum `0.9999999999999999` (Δ = 1.1e-16); `:189-195` `10/30 → 25/60 → 50/120`, both bounds strictly increasing. |
| **AC-8** — `BOT_ACCURACY_WINDOW ≥ 10` (**corrected** from `≥1`); `0 < BOT_MERCY_MARGIN < 1` with real magnitude; bands `0 < min < max ≤ 1`, non-decreasing | **met** | `:210` `10` — exactly the corrected floor, satisfying T-021 AC-3's "8 correct and 2 incorrect → 0.8"; `:217` `0.15` = 1.5 answers out of the 10-window, so it moves the bot by more than one answer's granularity; `:219-226` mins `0.5 ≤ 0.55 ≤ 0.6`, maxes `0.7 ≤ 0.75 ≤ 0.8`. |
| **AC-9** — stable references; object exports **deeply** frozen (**amended**) | **met** | `deepFreeze` at `:19-29` recurses `Object.values`, applied at `:52`, `:187`, `:199`, `:230`. Nested `{min,max}` payloads in `CHEST_COIN_RANGE_BY_RARITY` and `BOT_ACCURACY_BAND_BY_GRADE` are frozen, which shallow `Object.freeze` would not have done. Module has no mutable state. |
| **AC-10** — no non-finite numerics; documented integers satisfy `Number.isInteger` | **met** | Confirmed by the orchestrator's probes and by inspection of all 32 exports. |
| **AC-11** — `0 < DOUBLE_SHOT_TIMER_FACTOR < 1`; `DOUBLE_SHOT_VOLLEY_COUNT` int `≥ 2` | **met** | `:94` `0.6`; `:97` `2`. Checked against every catalog timer: `0.6 × {12000, 15000, 18000, 20000} = {7200, 9000, 10800, 12000}` — all strictly shorter and all integral, so the "must still shorten after rounding" clause holds for every cannon. |
| **AC-12** — positive int `< ENEMY_HULL_BY_ISLAND.port_sumwich` and `≤ 3 × ceil(8 + 0.35 × 4) = 30` | **met (as written)** | `:58` `24 < 45`, `24 ≤ 30`. **The criterion is satisfied; the design intent behind it is not** — see Finding **I-1**. AC-12 encodes only the upper half of "sinks in three volleys". |

### Definition of Done

| DoD item | Verdict | Evidence |
|---|---|---|
| Every AC has a passing test tagged `spec(T-004:AC-n)` | **met** | All 12 AC tags present (2/6/7/4/8/4/9/9/5/5/4/5 tests respectively), 68 total. |
| `run-local-gates.sh` green | **met** | Established ground truth (560/560). |
| `spec-lint.sh tickets/T-004.md` green | **met** | Established ground truth (12/12). |
| Every export exists, is `as const` / frozen, has an explicit type | **met, one nit** | All 32 required exports present. The four object exports carry explicit `Readonly<Record<…>>` annotations and are deep-frozen. The 28 scalars have no type annotation and rely on `const` literal-type inference — which is the correct choice (annotating `: number` would *widen* and discard the literal type), but see **M-5** for the one downstream consequence. |
| Record-typed constants keyed by T-003's id unions | **met** | `:38` `Record<IslandId, number>`, `:178`/`:189` `Record<ChestRarity, …>`, `:219` `Record<GradeBand, …>`. `schemas.ts:49/55/61` confirms all three are real `(typeof […])[number]` unions, not `string`. Adding an island is a type error until its hull is supplied — verified as intended. |
| Each constant cites a PLAN/ARCHITECTURE section, or `unspecified` + the pinning AC. No invented citations | **met, two nits** | I machine-checked all 23 quoted phrases against both source documents. 22 are verbatim and correctly attributed. Two nits in **M-6**. Critically, **every open value is labelled `unspecified`** — the file never dresses a choice as a derivation. `DISTRACTOR_ABS_FLOOR` (`:123-128`) explicitly says "derived, not chosen", which is accurate. |
| Files changed exactly `file_scopes` | **met** | Established ground truth; `git diff` on the worktree shows `src/engine/tuning.ts` as the sole `src/` file, zero test files modified. |

### Iron Law — anything built that the ticket did not ask for

**Clean.** The file exports exactly the 32 constants named in the Required export surface — no
more, no fewer, verified name-by-name against the ticket Context. The only non-constant is
`deepFreeze` (`:19-29`), which is module-private and is exactly the "at most, a private freezing
helper" the review brief allows; the amended AC-9 makes it mandatory rather than optional. No
helper functions, no derived constants, no re-exports, no runtime imports (`import type` only at
`:16`, so this module adds nothing to the bundle graph beyond numbers).

---

## 2. CODE QUALITY / VALUE JUDGEMENT

All arithmetic below uses T-008's published formula verbatim
(`lower = min(ceil(damageMin + max(quality·W, FLOOR)·range), damageMax)`, `roll = lower + round(u·(damageMax − lower))`,
`damageToEnemy = roll + (perfect ? 1 : 0)`) with the frozen `QUALITY_WEIGHT = 0.7`,
`ANSWER_QUALITY_FLOOR = 0.35`, `PERFECT_SHOT_BONUS_DAMAGE = 1`, and T-006's transcribed cannon
table.

### 2.1 The first duel — does it resolve in 4–6 player volleys?

Per-volley damage to the enemy, Swivel Gun (8–12, 20 s timer):

| Answer speed | roll range | perfect bonus | damage | volleys vs 45 hull |
|---|---|---|---|---|
| `elapsed = 0` (perfect) | 11–12 | +1 | **12–13** | **4** (always) |
| `elapsed = 0.5·T` | 10–12 | — | **10–12** | **4–5** |
| `elapsed = T` (floored slow) | 10–12 | — | **10–12** | **4–5** |

**Both ends land inside PLAN.md's 4–6 band, with no tail.** This is the ticket's headline
relationship and it holds. It also means T-008 AC-13 (which requires *every one* of 1,000 seeded
observations in `[4,6]`) will pass — and would pass anywhere in the documented `[40,50]` band, so
`45` is not a lucky pick, it is a safe one.

The Culverin (4–16) is the sharper case: at perfect speed it deals 14–17, sinking 45 hull in
**3** volleys at the top of its roll and 2.9 on the mean. That is one below PLAN.md's band. I
checked whether any legal hull fixes it: guaranteeing ≥4 volleys against a perfect-speed Culverin
needs hull > 3 × 17 = 51, which is outside PLAN.md's own `[40,50]`. **The tension is in the source
documents (Culverin's 4–16 spread plus the perfect-shot bonus vs. a 40–50 sloop), not in this
file.** Nothing to fix here; recorded so it is not rediscovered as a T-008 defect later.

### 2.2 `ONBOARDING_ENEMY_HULL` — does the tutorial sloop sink in three volleys?

**No.** This is the one blocking finding.

| Answer speed | Swivel damage | volleys vs 24 |
|---|---|---|
| perfect (`elapsed < 8 s` of a 20 s timer) | 12–13 | **2, always** |
| half timer | 10–12 | 2 or 3 |
| floored slow | 10–12 | 2 or 3 |

Two maximum rolls reach `12 + 12 = 24` exactly, so even a slow child can end the tutorial in two
volleys; and *any* answer inside the Perfect-Shot window — the common case in a guided tutorial
that points at the correct tap — deals ≥12 and ends it in two, deterministically. PLAN.md:75
promises "a scripted pirate sloop that **politely sinks in three volleys**". This is the constant
whose entire reason for existing is to make that promise true.

AC-12 pinned only the ceiling (`≤ 3 × floor damage = 30`). The lower half of the relationship —
*don't* sink in two — is not in the criterion. The frozen tests reached for it
(`tuning.test.ts:1010`: `ONBOARDING_ENEMY_HULL > SWIVEL_DAMAGE_MAX`) but stopped one volley
short: it excludes only a **one**-volley tutorial, and it omits the perfect-shot bonus.

**Correct window:** hull must exceed 2 × max Swivel volley (`2 × 13 = 26`) and stay at or below
3 × guaranteed floor volley (`3 × 10 = 30`) → **`ONBOARDING_ENEMY_HULL ∈ [27, 30]`**. I verified
that `28` satisfies **every frozen assertion** in the AC-12 block (`28` int > 0; `28 < 45`;
`28 ≤ 30`; `ceil(28/10) = 3 ≤ 3`; `3 < ceil(45/10) = 5`; `28 > 12`) as well as the AC-10 integer
sweep — **no frozen test needs to change.**

One rider for whoever wires `app/onboarding.tsx`: no value in `[27,30]` guarantees three volleys
if the Culverin is selectable in the guided duel (2 × 17 = 34 > 30, and 34 breaks AC-12's
ceiling). The tutorial must lock the Swivel — which PLAN.md:34 already implies ("the starter
swivel gun — onboarding can't hurt you"). Worth stating in the ticket so it is not re-litigated.

### 2.3 Later-island hulls vs the cannons unlocked by then — **clean, and better than required**

The review brief asked specifically whether `grandline: 120` is reasonable. Working the unlock
ladder (a cannon is earned at *its own* island's range, so on arrival at island N the best gun in
hand is island N−1's), the hull-to-mean-volley ratio is:

| Island | hull | best gun **on arrival** | mean volley | hull ÷ damage | volleys |
|---|---|---|---|---|---|
| `port_sumwich` | 45 | swivel / culverin | 11 | 4.09 | 4–5 |
| `isla_products` | 60 | six_pounder (10–16) | 14.5 | 4.14 | 5 |
| `quotient_cove` | 75 | twelve_pounder (14–24) | 21 | 3.57 | 4 |
| `fraction_reef` | 95 | mortar (14–24) | 21 | 4.52 | 5 |
| `grandline` | 120 | powder_keg (20–34) | 29.5 | 4.07 | 5 |

A ratio band of **3.57–4.52 across five islands** is a tight, deliberate-looking curve, and the
volley count stays in `[4,6]` at every node. On the specific question asked: `grandline: 120` is
reasonable *without* `long_nine` — on arrival with `powder_keg` it is a 5-volley duel; once
`long_nine` (24–40, mean volley 35) is earned at the Grandline Range it becomes a 4-volley duel,
still in band. **This dimension is genuinely clean.** Monotonicity was the only thing the tests
pinned, and the implementer delivered a real curve rather than five increasing numbers.

The one outlier is not a hull problem: `double_broadside` (16–28) is unlocked at *Port Sumwich
tier 2* but is a grade 2–3 gun, so a placement-graded player carrying it flattens
`isla_products` in 3 volleys and `port_sumwich` in 2. That over-reach is inherited from PLAN.md's
armory table (where the cannon is earned), not from any value in this file, and would be fixed in
`cannons.json`, not `tuning.ts`. Recorded as **M-1** so it is visible to the day-5 tuning pass.

### 2.4 Mastery — **clean**

`MASTERY_METER_MAX = 100` initially looks in conflict with `MASTERY_THRESHOLD_CORRECT = 10` at
`MASTERY_RATE_RANGE = 1` (10 correct → 10 points of a 100-point meter). It is not: T-010 defines
`meterPercent = min(MASTERY_METER_MAX, round(100 · weightedCorrect / MASTERY_THRESHOLD_CORRECT))`,
so the meter is a **derived percentage**, `100` is its full-scale value, and the two constants
close exactly: 10 range answers → 100 %, matching ARCHITECTURE.md:247's `mastery: {skillId: 0-100}`
Firestore field. `isMastered` is checked against `weightedCorrect`, not the meter, so the two are
not even coupled at the threshold.

The half-rate duel path reaches the threshold in a plausible number of duels: 20 correct duel
answers at `MASTERY_RATE_DUEL = 0.5`, against 4–6 player volleys per duel at a realistic 70–90 %
accuracy ≈ 4 correct/duel → **~5 duels per skill**. That is the right order of magnitude for
PLAN.md's "a kid who just loves dueling still advances, while ranges stay the fast lane" — the
range path (10 drills) stays roughly 2× faster in answers and far faster in wall time.

The `≥70 %` accuracy gate is raw `correct/attempts` (T-010), well above the 25 % a four-choice
guesser achieves, so PLAN.md:32's stated defence of multiple-choice input holds. **Nothing to
flag.**

### 2.5 Chest economy — **clean**

- **Rarity weights** `0.6 / 0.3 / 0.1` are a clean halving, strictly decreasing, sum to 1 within
  1.1e-16, and every tier is comfortably reachable (T-009 AC-8's ±0.01 tolerance over 100,000
  draws is ~10σ for the rare tier).
- **Tiers are distinct in play, not merely orderable.** Means run `20 / 42.5 / 85` — a clean
  1 : 2.1 : 4.25. The overlaps (`25–30`, `50–60`) are narrow enough that a lower tier out-pays a
  higher one only **1.98 %** of the time (common vs uncommon) and **2.15 %** (uncommon vs rare).
  A child will essentially always feel the tier they rolled. This is the AC-7 gap the amendment
  flagged as "bounded in practice, not in text" — the implementer landed well clear of it.
- **Expected value of a win** = payout + chest ≈ `round(20 + 0.2·acc% + perfects)` + 33.25
  ≈ **36–44 + 33 ≈ 70–77 coins**. A comparable **loss** pays ≈ **19–25 coins**. The win : loss
  ratio is therefore ~**3.3 : 1** once the chest is counted, which reads correctly as PLAN.md's
  "still pays a small purse" rather than a consolation prize. Judging `COINS_LOSS_BASE = 5`
  against `COINS_WIN_BASE = 20` alone understates the separation; the chest is the real gap.
- **Coin sink:** there is none to measure against. PLAN.md's harbor shop is day-4 and T-009
  explicitly records it as "no ticket … recorded as a gap". So a win's EV is only judgeable in the
  abstract, and it is sane there (~70 coins/win, so a shop item should be priced in the
  low hundreds). Noted as **M-4** — not a defect in this file, and the implementer was right not
  to invent a `SHOP_*` constant the ticket did not list.

### 2.6 `QUALITY_WEIGHT` — derivation re-checked from scratch, **honest and correct**

The `> 7/12` bound the amendment asserts is real. Re-deriving independently: T-008 AC-16 needs
`(lower_fast − lower_slow)/2 ≥ 0.10·range`. For `culverin` (4–16),
`lower_slow = ceil(4 + 0.35·12) = 9`, so `lower_fast ≥ 11.4` → `≥ 12` (integer) →
`ceil(4 + 12W) ≥ 12` → `W > 7/12 = 0.5833…`. `double_broadside` (16–28) yields the identical
bound. At `W = 0.7` every ≥10-range cannon clears AC-16 with margin (culverin +2.0 vs required
1.2; long_nine +3.0 vs 1.6). The comment at `:70-76` states this correctly and does not overclaim.

This is the L-018 hole closed properly, and the value chosen is not the minimum that squeaks
past — it has real headroom. See **M-2** for the one property of `0.7` that no criterion covers.

### 2.7 Latent conflicts between constants (the L-005 sweep)

I worked every pair I could find a mechanism for. Results:

| Pair | Interaction | Status |
|---|---|---|
| `ONBOARDING_ENEMY_HULL` × (swivel max roll + `PERFECT_SHOT_BONUS_DAMAGE`) | 2 × 13 = 26 ≥ 24 → tutorial ends a volley early | **I-1 — Important** |
| `QUALITY_WEIGHT` × `ANSWER_QUALITY_FLOOR` | `quality·W ≥ FLOOR` only when `quality ≥ FLOOR/W = 0.5`, so speed is inert over the slower half of every timer | **M-2 — Minor** |
| `DISTRACTOR_MAX_RATIO` × T-005's 9-rung ladder | rung 7 (`x·2`) is plausible only when `RATIO ≥ 2`. `2` is exactly the boundary; AC-5's `> 1` would have allowed `1.5` and silently killed the rung while `MAX_DISTRACTOR_ATTEMPTS = 9` still claimed 9 reachable rungs | **M-3 — Minor** (value is right; the *bound* was loose) |
| `DISTRACTOR_ABS_FLOOR` × `CHOICE_COUNT` at a zero answer | floor 3 yields exactly `{1,2,3}` = the 3 distractors a 4-choice question needs; zero headroom, correct at 3 | **clean** |
| `RECENT_TEMPLATE_WINDOW` × the ≥8-templates/skill floor | 5 ≤ 7 leaves ≥3 candidates on a floor-sized pool | **clean** |
| `MASTERY_METER_MAX` × `MASTERY_THRESHOLD_CORRECT` × `MASTERY_RATE_*` | closes exactly under T-010's percentage formula (§2.4) | **clean** |
| `COINS_PER_ACCURACY_PERCENT` × `COINS_PER_PERFECT_SHOT` × T-009's `round` | `0.2 × 100 = 20` whole coins; `+1`/perfect is round-monotone at every base, so T-009 AC-3/AC-4 monotonicity survives rounding at any `totalAnswers` | **clean** |
| `DOUBLE_SHOT_TIMER_FACTOR` × every catalog timer | all four products integral and strictly shorter | **clean** |
| `BOT_ACCURACY_BAND_BY_GRADE` × `BOT_MERCY_MARGIN` × `BOT_ACCURACY_WINDOW` | mercy tracking is clamped-off outside a 20-point accuracy window per band | **M-1… see M-1b below — Minor** |
| `BASE_BALLS_PER_VOLLEY` × ARCHITECTURE's "the roll reads as shot spread" | at N = 1 there is no spread to read | **M-2b — Minor** |

### 2.8 Bot mercy — worth stating plainly, because the obvious critique is wrong

`BOT_ACCURACY_BAND_BY_GRADE.k_1 = {min: 0.5, max: 0.7}` with `BOT_MERCY_MARGIN = 0.15` means
mercy tracking only bites for `k_1` players between 65 % and 85 % accuracy — outside that
20-point window the bot is pinned at a band edge. A struggling 6-year-old at 40 % accuracy faces
a bot at 50 %: *more* accurate than the child.

That reads alarming, and I expected it to be a finding. It isn't, because the real mercy is
structural: the enemy carries 45 hull and the player carries 100. The player needs ~5 successful
volleys, the bot needs ~10. At 40 % player accuracy that is 12.5 player turns vs the bot's 20 —
the child still wins comfortably; even a pure random-tapper (25 %) is at 20 turns vs 20, a coin
flip, with `MERCY_LOSS_STREAK_TRIGGER = 2` / `MERCY_FORCED_MISFIRES = 2` as the backstop.
**The hull asymmetry is doing the mercy work, and the band floor of 0.5 does not endanger the
cohort mercy exists to protect.** The residual critique — that the *tracking* mechanic is inert
over 80 % of the accuracy domain, so PLAN.md's "tracks the player's recent accuracy" is largely
decorative — is real but is band-width tuning, recorded as **M-1b**.

---

## 3. Findings

### I-1 — `ONBOARDING_ENEMY_HULL = 24` ends the guided first duel in two volleys, not three — **Important**

**File:** `src/engine/tuning.ts:58`
**Breaks:** PLAN.md:75 — "a guided first duel against a scripted pirate sloop that **politely
sinks in three volleys**".

At the Swivel Gun, any correct answer inside the Perfect-Shot window (`elapsed < 8 s` of a 20 s
timer — the normal case in a guided tutorial) deals 12–13, so two volleys deal ≥24 and the sloop
is gone. Even at floored-slow speed, two maximum rolls reach exactly 24. The scripted third beat
therefore has no target, and the constant that exists specifically to make PLAN.md's promise true
does not make it true.

AC-12 constrains only the ceiling; `tuning.test.ts:1010` reaches for the floor but excludes only a
one-volley tutorial and omits the perfect-shot bonus. This is the L-005 shape the ticket has
already been bitten by three times: the criterion pins one side of a two-sided relationship.

**Fix:** set `ONBOARDING_ENEMY_HULL` to a value in `[27, 30]` — **`28` recommended** (mid-window,
absorbs a future ±1 change to `PERFECT_SHOT_BONUS_DAMAGE`).
`27 = 2 × (12 + 1) + 1` is the "survives two perfect volleys" floor; `30 = 3 × 10` is AC-12's
existing ceiling. **I verified `28` passes all five frozen AC-12 assertions plus the AC-10 integer
sweep — no frozen test changes.**
Please also record in T-004 (or the onboarding ticket) that the guided duel must lock the Swivel:
with the Culverin selectable, `2 × 17 = 34` exceeds AC-12's own ceiling of 30, so no legal hull
can guarantee three volleys.

### M-1 — `double_broadside` over-reaches the early islands — **Minor**

**File:** not this file — `cannons.json` (T-006) / PLAN.md's armory.
A grade-2/3 player carrying `double_broadside` (16–28, unlocked at *Port Sumwich* tier 2) sinks
`isla_products` (60) in 3 volleys and `port_sumwich` (45) in 2, below PLAN.md's 4–6 band. The
hull ladder itself is well-calibrated (§2.3); the mismatch is that a tier-2 gun from island 1 is
priced for island 3. Recommend the day-5 pass either raise `isla_products` toward 70–75 or treat
`double_broadside` as intentionally a "power spike you outgrow the first island with". No change
requested in `tuning.ts`.

### M-1b — bot accuracy bands are too narrow for mercy tracking to be visible — **Minor**

**File:** `src/engine/tuning.ts:219-226`
Each band is 0.20 wide, which is also exactly the width of the accuracy window over which
`clamp(player − 0.15, min, max)` actually varies. Outside it the bot is pinned at an edge, so
PLAN.md:77's "bot accuracy tracks the player's recent accuracy" is inert for ~80 % of the
accuracy domain. Not dangerous (§2.8 shows the hull asymmetry carries the mercy), but the
mechanic PLAN.md describes is mostly not running.
**Recommend** widening the low ends so tracking has room — e.g. `k_1 {0.35, 0.70}`,
`g2_3 {0.40, 0.75}`, `g4_5 {0.45, 0.80}`. All still satisfy AC-8's ordering and `0 < min < max ≤ 1`.
This is precisely what the dev slider screen is for; flagging so the owner knows which slider matters.

### M-2 — `QUALITY_WEIGHT = 0.7` makes speed inert over the slower half of every timer — **Minor**

**File:** `src/engine/tuning.ts:77`
T-008's `max(quality · W, ANSWER_QUALITY_FLOOR)` means the quality term only exceeds the floor
when `quality ≥ FLOOR/W`. At `W = 0.7` that is `quality ≥ 0.5`, i.e. **damage responds to speed
only for `elapsed ≤ 0.50 × timer`**; every answer in the slower half produces an identical
distribution. Raising `W` widens the responsive window as well as the effect size:

| `QUALITY_WEIGHT` | speed is live for |
|---|---|
| 0.60 | `elapsed ≤ 0.417 · timer` |
| **0.70 (chosen)** | `elapsed ≤ 0.500 · timer` |
| 0.85 | `elapsed ≤ 0.588 · timer` |
| 1.00 | `elapsed ≤ 0.650 · timer` |

No AC covers this — AC-3 and T-008 AC-16 both measure the *endpoints* (`elapsed = 0` vs
`elapsed = timer`), which are unaffected by where the dead zone starts. `0.7` is defensible and
clears every criterion; **recommend 0.85** so "answer speed aims the shot" is perceptible across
more of the timer. Balance judgement, dev-slider territory — not blocking.

### M-2b — `BASE_BALLS_PER_VOLLEY = 1` makes ARCHITECTURE's "shot spread" reading impossible — **Minor**

**File:** `src/engine/tuning.ts:80`
ARCHITECTURE.md:206: "Damage renders as **N cannonball arcs** with per-ball hit/splash, **so the
roll reads as shot spread**." At `N = 1` a 12-damage volley is one arc and there is no spread to
read; the Perfect Shot's bonus ball then becomes the only multi-ball moment, and it carries 1
damage next to the main ball's 12 — visually the reverse of its importance. AC-3's `≥ 1` permits
this, and ball rendering is day-3 VFX (out of swarm scope), so nothing downstream breaks.
**Recommend `3`**, which makes the spread legible and the Perfect Shot a visible 4th arc.

### M-3 — `DISTRACTOR_MAX_RATIO = 2` sits exactly on the ladder's reachability boundary — **Minor (record, don't change)**

**File:** `src/engine/tuning.ts:121`
T-005's 7th ladder rung is `x · 2`, plausible only when `|2x| ≤ |x| · RATIO`, i.e. `RATIO ≥ 2`.
The chosen `2` is the exact minimum at which that rung functions — correct, but with zero
headroom, and AC-5 only requires `> 1`, so `1.5` would have passed while silently making
`MAX_DISTRACTOR_ATTEMPTS = 9`'s claim of nine reachable rungs false. The value is right; the
*bound* is the loose one. **Recommend** noting on the dev screen that `DISTRACTOR_MAX_RATIO`
must never be slid below 2, or adding the tighter bound to AC-5 if the ticket is ever amended.

### M-4 — no coin-sink constant exists, so payout EV is unanchored — **Minor (informational)**

The ticket claims to define "the *complete* constant surface up front, so no later ticket has to
reach back and edit this file", but PLAN.md's day-4 harbor shop (the stated coin sink) has no
ticket and no constants here. If the shop is ever built, it must either reach back into
`tuning.ts` or violate ARCHITECTURE.md §4.3's one-constants-file rule. The implementer was
**correct** not to invent `SHOP_*` exports — that would have been an Iron Law violation. Flagging
for the orchestrator/owner, not for this ticket.

### M-5 — scalar exports carry literal types, not `number` — **Minor (nit)**

**File:** `src/engine/tuning.ts` (28 scalar exports)
`export const PERFECT_SHOT_BONUS_DAMAGE = 1;` has type `1`, not `number`. This is the *right*
call (annotating `: number` would widen and discard the literal), but it means a downstream
`someNumber === PERFECT_SHOT_BONUS_DAMAGE` is fine while a literal comparison such as
`PERFECT_SHOT_BONUS_DAMAGE === 0` is a TS2367 error. I checked T-008/T-009/T-010's published
signatures and found no place this bites. Recording so a downstream implementer who hits it knows
it is expected, not a bug.

### M-6 — two citation nits — **Minor (nit)**

I machine-checked all 23 quoted phrases against `PLAN.md` and `ARCHITECTURE.md`. 21 are verbatim
in the cited document and correctly attributed. Two are not:

1. `tuning.ts:35` — `PLAN.md §The duel loop: "enemy sloops 40–50 vs the player's 100"`. That
   string appears in **neither** document. PLAN.md:30 says "first pirate sloops carry 40–50 hull
   against your 100"; ARCHITECTURE.md:206 says "starter sloops 40–50 vs the player's 100". The
   quote is an ARCHITECTURE phrasing with `starter` → `enemy`, attributed to PLAN. The *fact*
   (100) is correct and doc-fixed; only the quotation is. **Recommend** quoting PLAN.md:30
   verbatim.
2. `tuning.ts:90` — `PLAN.md §The armory: Double-Shot buys "a harder variant of the same skill
   for a second volley"`. The quote is verbatim but lives at PLAN.md:34, in **§The duel loop**,
   not §The armory.

Given the ticket's explicit "do not write a comment claiming a source that does not exist", these
are worth correcting even though the underlying sources are real.

---

## 4. What is genuinely clean

Stated plainly, so the Minor list above is not read as a wall of objections:

- **Every one of AC-1 … AC-12 and all 7 DoD items is met**, including the three amendments the
  Test Agent added pre-freeze (`RECENT_TEMPLATE_WINDOW ≤ 7`, `BOT_ACCURACY_WINDOW ≥ 10`,
  deep freeze) and the `QUALITY_WEIGHT > 7/12` closed-form bound.
- **No Iron Law violation.** Exactly the 32 named exports, plus one private freezing helper the
  brief permits. No speculative extras.
- **The per-island hull ladder is the best-judged thing in the file** — a 3.57–4.52 hull-to-damage
  ratio across five islands measured against the actual unlock order, when the tests only
  required monotonicity.
- **The chest economy holds together**: tiers invert only ~2 % of the time, means run 1 : 2.1 :
  4.25, and win : loss lands at ~3.3 : 1 once the chest is counted.
- **The mastery constants close exactly** against T-010's formula, and the half-rate duel path
  reaches a threshold in ~5 duels.
- **The honesty boundary was respected throughout.** Every open value is labelled `unspecified`
  with its pinning AC; `DISTRACTOR_ABS_FLOOR`'s "derived, not chosen" claim is genuinely a
  derivation; `QUALITY_WEIGHT`'s cited closed-form bound reproduces exactly when re-derived from
  T-008's formula. Nothing in this file dresses a choice as a citation.

---

## 5. Required to approve

1. **I-1** — change `ONBOARDING_ENEMY_HULL` from `24` to a value in `[27, 30]` (`28` recommended).
   No frozen test changes; `src/engine/tuning.ts:58` only.
2. Optionally in the same edit (all Minor, none blocking): **M-6**'s two comment citations,
   and — owner's call, since the dev screen exists for exactly this — **M-2** (`QUALITY_WEIGHT`
   0.7 → 0.85) and **M-2b** (`BASE_BALLS_PER_VOLLEY` 1 → 3).
3. **M-1**, **M-1b**, **M-3**, **M-4**, **M-5** are recorded for the day-5 tuning pass and the
   traceability log; no action in this ticket.

---

**CHANGES REQUIRED**
