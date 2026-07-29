# T-006 — Code Review (independent)

**Ticket:** T-006 — Catalog data (skills, cannons, islands, ranks, crew) and validated loaders
**Worktree:** `/Users/quietguy/Documents/Dev/Gauntlet/cannon-wt/wt-T-006`
**Reviewer:** independent senior review — did not write this code
**Date:** 2026-07-28

Structural coherence, gate status, diff scope and test-file immutability were established by the
orchestrator and are not re-litigated here. This review covers only what the frozen tests cannot
prove: fidelity to PLAN.md, playability of the arc, `index.ts` quality, the Iron Law, and the
`place_value_compare` hole.

---

## 1. Fidelity to PLAN.md — cell by cell

### 1.1 The armory (PLAN.md §The armory vs `src/content/cannons.json`)

Every row compared field by field against PLAN.md's table (PLAN.md:41-52 region) — skill, damage
range, temperament, recoil, timer, grade band, how-earned.

| Cannon           | PLAN.md row                                                                    | `cannons.json`                                                                           | Verdict                                |
| ---------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------- |
| Swivel Gun       | Addition within 10 (K–1), 8–12, Reliable, 20s, Starter                         | `add_within_10`, 8–12, `reliable`, recoil 0, 20000, grades 0–1, `{kind:starter}`         | match                                  |
| Culverin         | Addition within 10 (K–1), 4–16, Volatile (crit), 20s, Starter                  | `add_within_10`, 4–16, `volatile`, recoil 0, 20000, 0–1, `{kind:starter}`                | match (recoil 0 per locked ruling D-3) |
| Six-Pounder      | Addition within 20 (1–2), 10–16, Standard, 15s, Port Sumwich range             | `add_within_20`, 10–16, `standard`, 0, 15000, 1–2, `{range, port_sumwich, tier 1}`       | match                                  |
| Chain Shot       | Subtraction within 20 (1–2), 10–16, Standard, 15s, Port Sumwich range          | `sub_within_20`, 10–16, `standard`, 0, 15000, 1–2, `{range, port_sumwich, tier 1}`       | match                                  |
| Nine-Pounder     | Place value & compare (2), 12–18, Standard, 15s, Chest drop                    | `place_value_compare`, 12–18, `standard`, 0, 15000, 2–2, `{kind:chest}`                  | match                                  |
| Twelve-Pounder   | Multiplication facts (3), 14–24, Standard, 12s, Isla Products range            | `mult_facts`, 14–24, `standard`, 0, 12000, 3–3, `{range, isla_products, tier 1}`         | match                                  |
| Mortar           | Division facts (3–4), 14–24, Standard, 12s, Quotient Cove range                | `div_facts`, 14–24, `standard`, 0, 12000, 3–4, `{range, quotient_cove, tier 1}`          | match                                  |
| Double Broadside | Two-step add/sub (2–3), 16–28, Volatile (5), 15s, Port Sumwich tier 2          | `two_step_add_sub`, 16–28, `volatile`, 5, 15000, 2–3, `{range, port_sumwich, tier 2}`    | match                                  |
| Powder Keg       | Fractions, int-answerable (4–5), 20–34, Volatile (8), 18s, Fraction Reef range | `fractions_int`, 20–34, `volatile`, 8, 18000, 4–5, `{range, fraction_reef, tier 1}`      | match                                  |
| Long Nine        | Multi-digit ops / order of ops (5), 24–40, Volatile (10), 20s, Grandline Range | `multi_digit_order_ops`, 24–40, `volatile`, 10, 20000, 5–5, `{range, grandline, tier 1}` | match                                  |

**Ten of ten rows transcribe exactly.** All seven timers convert correctly to milliseconds
(20s→20000, 15s→15000, 12s→12000, 18s→18000). No divergence found. The one row where the ticket
departs from PLAN.md's literal text — the Culverin's `Volatile (crit)` parenthetical rendered as
`recoilDamage: 0` — is owner ruling D-3, pinned by AC-4a, and the data implements it.

### 1.2 The island arc (PLAN.md §Sea chart vs `islands.json`)

PLAN.md: "Port Sumwich (add/sub) → Isla Products (multiplication) → Quotient Cove (division) →
Fraction Reef → the Grandline (grade-5 finale)." `islands.json` orders 0–4 in exactly that
sequence, each non-root island naming its predecessor in `requiresIsland`, matching PLAN.md's
"lifts the fog on the next island". The five `rangeSkills`/`unlocksCannons` assignments match
AC-14's table and are the only assignment consistent with the armory's "How earned" column.
No divergence.

### 1.3 Ranks, crew, skills

- Rank ladder `cadet → ensign → captain → commodore → fleet_legend`, tiers 0–4: matches PLAN.md's
  "Cadet → Ensign → Captain → Commodore → **Fleet Legend**". `minWins` `0/10/25/50/100` is the
  ticket's declared open question, resolved inside AC-7's bounds (`cadet === 0`, strictly
  increasing). At PLAN.md's stated 2–3 min/duel, Fleet Legend is ~4–5 hours of play — a defensible
  ladder length for a 5-day-scope game.
- Crew is exactly the Gunner, Carpenter and Cook PLAN.md names, identity-only, passives cut as
  declared (see finding M-3 on the `role` strings).
- Skill grade bands are lifted from the armory's grade column with no drift, and `symbolicOnly` is
  `true` exactly for the three skills with `minGrade < 2` (`add_within_10`, `add_within_20`,
  `sub_within_20`), implementing PLAN.md's "K-1 templates are symbolic-only … word-problem shapes
  are gated to grade 2+".

**No PLAN.md divergence of any kind was found. Section 1 is clean.**

---

## 2. Is the progression actually playable?

Worked against T-004's shipped `ENEMY_HULL_BY_ISLAND` (`45 / 60 / 75 / 95 / 120`,
commit `7a12402`), `PLAYER_HULL = 100`, `ANSWER_QUALITY_FLOOR = 0.35`, and T-008 AC-15's
guaranteed damage floor `damageMin + 0.35 × (damageMax − damageMin)`.

### 2.1 The K-band opening duel

Port Sumwich hull is 45. With the two starters only:

| Cannon            | floor roll | volleys at the floor | volleys at max roll |
| ----------------- | ---------- | -------------------- | ------------------- |
| `swivel_gun` 8–12 | 9.4        | ⌈45/9.4⌉ = **5**     | ⌈45/12⌉ = **4**     |
| `culverin` 4–16   | 8.2        | ⌈45/8.2⌉ = **6**     | ⌈45/16⌉ = **3**     |

A K-band player with only the starters finishes in 4–6 volleys on every realistic line, including
the pathological "every answer slow-but-correct" line. PLAN.md's promise holds. The Culverin's
mean roll (~10) puts a typical duel at 4–5 volleys, so the "real early choice" between a steady
gun and a swingy one is a genuine variance trade rather than a strictly worse option — which is
what PLAN.md claims for it.

### 2.2 Adequacy at each island, walked down the actual unlock chain

The chain is self-sufficient, and this is worth stating precisely because it is not obvious.
T-010's `resolveUnlocks` grants a `range` cannon when its skill is mastered, and lifts island
`I`'s fog when at least one skill of `I.requiresIsland`'s `rangeSkills` is mastered. The **same
mastery event** does both. Therefore arriving at island _N_ logically implies holding at least one
cannon unlocked at island _N−1_:

| Island          | hull | cannon guaranteed on arrival                                         | floor roll | volleys @ floor | volleys @ max |
| --------------- | ---- | -------------------------------------------------------------------- | ---------- | --------------- | ------------- |
| `port_sumwich`  | 45   | starters (8–12 / 4–16)                                               | 9.4 / 8.2  | 5 / 6           | 4 / 3         |
| `isla_products` | 60   | `six_pounder` or `chain_shot` (10–16), or `double_broadside` (16–28) | 12.1       | 5               | 4             |
| `quotient_cove` | 75   | `twelve_pounder` 14–24                                               | 17.5       | 5               | 4             |
| `fraction_reef` | 95   | `mortar` 14–24                                                       | 17.5       | 6               | 4             |
| `grandline`     | 120  | `powder_keg` 20–34                                                   | 24.9       | 5               | 4             |

**Every island is beatable in 4–6 volleys with the weakest cannon a player is guaranteed to hold
on arrival**, before counting the stronger guns they will usually also have. The catalog's damage
ladder and T-004's hull ladder are compatible end to end. No island is a wall.

One noted-not-a-defect consequence of PLAN.md's own table: `double_broadside` (16–28, unlocked at
Port Sumwich tier 2) outdamages the next two islands' rewards (`twelve_pounder` and `mortar`, both
14–24). A damage-optimising player would keep firing it and never fire the multiplication or
division guns. This does **not** stall progression, because mastery also fills from range drills
at full rate and the ranges are the fast lane by design — but it means the mult/div guns are
carried by their skill gating rather than by their numbers. This is transcribed from PLAN.md
exactly, so it is a design observation for the owner, not a T-006 defect.

### 2.3 Is any island's `rangeSkills` unreachable via the required chain?

No. Walking the chain by minimum grade of the range skills: `port_sumwich` 1 → `isla_products` 3 →
`quotient_cove` 3 → `fraction_reef` 4 → `grandline` 5, against a starter skill of grade 0–1. Each
island's range sits at or one grade above the highest band the previous island taught
(`two_step_add_sub` tops out at 3, `mult_facts` starts at 3; `div_facts` tops at 4,
`fractions_int` starts at 4; `fractions_int` tops at 5, `multi_digit_order_ops` is 5). No band
gap, so no island's range is out of reach for a player who arrived there legitimately.

I also verified this catalog satisfies T-011's contiguous-prefix requirement, which is a frozen
test in a downstream ticket: islands whose minimum range-skill grade is `≤ band maxGrade` are
`k_1 → {port_sumwich}`, `g2_3 → {port_sumwich, isla_products, quotient_cove}`,
`g4_5 → all five` — a contiguous prefix by `order` in all three bands. T-011 is not blocked.

A player may reach `isla_products` by mastering only `add_within_20` (grade 1–2), skipping
`sub_within_20` and `two_step_add_sub`. That is T-010's locked "one mastered skill lifts the fog"
decision, not something T-006 can or should change, and the earlier range stays open, so nothing
is lost — noted only so it is on the record.

---

## 3. `index.ts` quality

### 3.1 Import-time validation — correct call

`src/content/index.ts:71-75` parses all five catalogs at module load and throws. I judge this
**correct**, not merely permitted:

- The catalogs are bundled build artifacts, not network or user input. They cannot become
  malformed between CI and a device unless the bundle itself is corrupt, so the "crashes the app
  on startup" branch is effectively unreachable in production.
- Degrading instead would mean shipping a game silently missing a cannon or an island, with a
  child discovering it mid-duel. That is strictly worse than the loud failure ARCHITECTURE.md §2
  asks for ("Catalog authoring errors should fail a test, not a child's battle").
- The cost is ~32 zod parses at cold start — immaterial.

The implementation routes both the import-time path and `validateCatalogs` through the same
`parseCatalog`, so the boot failure carries the same catalog-and-id message as the test path. Good.

### 3.2 Lookup helpers — total, and structurally prototype-safe

All four helpers use `Array.prototype.find` over the catalog array, compare `undefined`, and throw
an `Error` naming the key. There is **no object-keyed lookup anywhere in the module**, so
`__proto__`, `constructor` and `toString` cannot resolve to anything: they simply fail the `find`
and throw. This is the right shape — a `Record` lookup would have needed an explicit
`Object.hasOwn` guard and would have been one refactor away from a hole. `getRankByTier` takes a
plain `number` and throws on any unknown tier, so it is total over its whole input domain, not
just over a union. Clean.

### 3.3 `validateCatalogs` delegating entirely to zod — judged

**AC-12 is literally and fully satisfied.** All seven frozen AC-12 cases are single-entry shape
violations (`damageMax < damageMin`, `maxGrade < minGrade`, negative `minWins`, missing `role`,
unknown extra key, wrong type, an island naming a string outside `SkillId`), and zod's `.strict()`
plus the T-003 `superRefine`s catch every one with a message naming the catalog and the entry id.
The implementer is right that the schemas already do this work and that duplicating it would be
fabrication.

But the delegation does leave a corruption class undetected, and it is worth naming precisely —
see **M-1** below. My judgement on the Iron Law call: the implementer's reading is **defensible
and I am not asking for it to be reversed**, because AC-2, AC-9 and AC-10 are enforced against the
shipped catalogs by the frozen suite, so every invariant in question does "fail a test" exactly as
ARCHITECTURE.md §2 requires, and no downstream ticket calls `validateCatalogs`. It is a Minor with
a recommendation, not a blocker.

### 3.4 Nits

`skills` etc. are `readonly T[]` at the type level but not `Object.freeze`d at runtime. Given
`noUncheckedIndexedAccess` and the readonly types, TypeScript already denies `push`/`sort` to
every consumer; T-004 chose `deepFreeze` for `tuning.ts`, so there is a mild house-style
inconsistency, but nothing in the ticket asks for it and adding it would be its own Iron Law
question. No action. Likewise `RawCatalogs` is not exported — the frozen test declares its own and
structural typing makes callers fine — so no action.

---

## 4. Iron Law

**Clean.** The module exports exactly the eleven names the ACs require (`skills`, `cannons`,
`islands`, `ranks`, `crew`, `getCannon`, `getSkill`, `getIsland`, `getRankByTier`,
`validateCatalogs`), and keeps `CatalogName`, `RawCatalogs`, `entryId` and `parseCatalog` private.
Every field in every JSON file is a field the T-003 schema **requires** — `displayName` on four
catalogs and `role` on crew are schema-mandated, not invented. No `critBonus` field appeared, as
the ticket's `proposed` decision said it must not. No `templates/` directory was created. No crew
passive, cosmetic or shop data. No enemy hull. Nothing authored or exported that the ticket did
not ask for.

---

## 5. The `place_value_compare` hole — confirmed coherent

The claim checks out in all three directions:

- **Nothing gates on it.** T-010 unlocks islands from the previous island's `rangeSkills` (it is on
  none) and unlocks cannons only for `unlock.kind === 'range'` (`nine_pounder` is `chest`). T-011
  explicitly excludes chest cannons from placement. T-019 AC-11 requires templates for every
  cannon's skill, and T-015 owns `place_value_compare.json`, so the registry requirement is met.
  Removing it from every range creates no dangling dependency anywhere downstream.
- **It is masterable.** PLAN.md fills mastery two ways; with no range, only the duel path at
  `MASTERY_RATE_DUEL = 0.5` applies, so 20 correct duel answers at ≥70% accuracy reach the
  threshold. Slower, but reachable.
- **It is gated on chest RNG.** A player who never rolls the Nine-Pounder never fires
  `place_value_compare` at all and cannot accrue a single point of mastery on it — see **M-4**.

I also checked `double_broadside`'s `tier: 2`, since T-010's unlock rule reads `unlock.kind` and
`skill` but never `tier`. This is coherent, not dead data: "Port Sumwich tier 2" is naturally
expressed as "the harder of Port Sumwich's skills", and `two_step_add_sub` (grade 2–3) is exactly
that relative to `add_within_20`/`sub_within_20` (grade 1–2). The tier field is descriptive
metadata that the mastery rule reproduces by other means.

---

## 6. Findings

### M-1 (Minor) — `validateCatalogs` detects no _set-level_ corruption

`src/content/index.ts:63-69` validates each entry in isolation. Undetected classes, all of which
pass every schema:

1. **Duplicate ids** — two `culverin` entries both parse; `getCannon` silently returns the first.
   This is the single most likely hand-authoring error (copy-paste while adding a gun).
2. **Dangling cross-references** — an `IslandId`/`SkillId`/`CannonId` that is legal in the enum but
   absent from the corresponding JSON. Delete a skill from `skills.json` and import still succeeds;
   `getSkill` then throws deep inside a duel.
3. **Missing entries** — a three-entry `skills.json` passes `validateCatalogs` entirely.
4. **Duplicate or gapped rank tiers** — `getRankByTier` shadows the duplicate.
5. **`requiresIsland` cycles or multiple roots** — a two-island cycle is schema-valid and dead-ends
   progression.

The strongest form of the argument against the current shape: the ratified signature takes **all
five catalogs in one object**. A function that only ever checks entries in isolation did not need
that signature — `validateCatalog(name, array)` would have done. Taking the set and never relating
it is a signature that implies a cross-catalog check and delivers none.

Why this is Minor and not Important: AC-2 (no duplicates, exact counts), AC-9 (bidirectional
island↔cannon integrity) and AC-10 (cannon→skill existence and grade agreement) are all enforced
against the shipped catalogs by the frozen suite, so every invariant above **does** fail a test
before it can reach a device — which is precisely what ARCHITECTURE.md §2 asks. No downstream
ticket calls `validateCatalogs`. The repository is protected; only the exported function
under-delivers on its name.

**Recommendation (owner's call, not a blocker):** if `validateCatalogs` is ever pointed at
authored content outside `src/content/` — the use its own doc comment advertises — add a
set-level pass (id uniqueness per catalog, then resolve every `SkillId`/`CannonId`/`IslandId`
reference against the sibling arrays), still throwing with catalog + id. Roughly 25 lines. Best
raised as a follow-up ticket so the Iron Law question is decided by the planner rather than by an
implementer mid-ticket.

### M-2 (Minor) — `add_within_10` has no gunnery range, so the K-1 band has no fast lane

`add_within_10` appears in no island's `rangeSkills`. It is the only grade-0 skill and the skill
behind **both** starter cannons, so a K-band player's own level has no range: the lowest drill
available is `add_within_20` at Port Sumwich (grade 1–2). PLAN.md's "range drills fill a skill's
meter at full rate … ranges stay the fast lane" is therefore unavailable to exactly the band the
ranges most benefit, and mastery of `add_within_10` accrues only at the half duel rate.

This is not a T-006 authoring error — AC-14 pins the island assignment literally, and it follows
from PLAN.md's armory, where both K guns are starters and so no island needs to unlock them. But
it is the same structural hole as `place_value_compare`, sitting on the onboarding band.

**Recommendation:** the owner may want `add_within_10` added to `port_sumwich.rangeSkills`. I
checked the blast radius: `port_sumwich`'s minimum range grade would become 0, which keeps T-011's
contiguous prefix intact in all three bands; T-019 AC-12 is satisfied because T-014 owns
`add_within_10` templates; and T-010 gains no new cannon unlock because no `range` cannon uses
that skill. It is a safe change — but it would contradict AC-14 and T-010/T-011 frozen tests, so
it belongs in a follow-up ticket, **not** in T-006.

### M-3 (Minor) — `crew.json` `role` strings advertise scope-cut mechanics

`crew.json:5,10,15` set `role` to `"Crit-nudge specialist"`, `"Hull-repair specialist"`,
`"Answer-reroll specialist"`. `role` is schema-required so a string must be there, and these
paraphrase PLAN.md's passives accurately — but crew passives are a declared `scope-cut`, and the
ticket's own `proposed` decision records that **there is no crit term in the damage model at all**
(ARCHITECTURE.md §4.3). Any day-3 UI that renders `role` will tell a player the Gunner nudges a
crit chance that does not exist.

**Recommendation:** neutral identity strings — `"Gunnery"`, `"Repair"`, `"Galley"` — say the same
thing about who the crew member is without promising a mechanic. One-line change, but it touches
`crew.json` and the frozen AC-4b test only checks ids and count, so it is safe if the owner wants
it. Not a blocker.

### M-4 (Minor, informational) — grade-2 place value is chest-RNG-gated

Following from §5: `place_value_compare` is reachable only through the `nine_pounder` chest drop.
A player who never rolls it never encounters grade-2 place value and comparison anywhere in the
game. That is coherent with the systems, and PLAN.md does assign the gun to a chest, but it means
one of nine curriculum skills has a drop-rate-dependent presence. Flagging for the owner's
awareness; nothing in T-006 should change.

### M-5 (Minor, informational, cross-ticket) — the Culverin's fast path lands under PLAN's floor

At Port Sumwich hull 45, `culverin` at max roll clears the enemy in ⌈45/16⌉ = 3 volleys, below
PLAN.md's stated 4–6. T-008 AC-13 pins the 4–6 window for `swivel_gun` at exactly `0.5 × timerMs`
only, so this line is unconstrained by any frozen test. It requires near-max rolls every volley,
so it is an outlier rather than the typical case, and the Culverin's mean (~10) sits at 4–5
volleys. Raised as information for T-008's reviewer and for the dev-screen tuning pass; no T-006
change.

---

## 7. What is genuinely clean

Stated plainly, because most of this ticket is:

- **All ten armory rows transcribe exactly from PLAN.md**, across all eight compared fields,
  including the three timer conversions to milliseconds. This was the highest-risk failure mode in
  the ticket — a silent balance change the tests could not catch, because they were written from
  the same table — and there is none.
- **The island arc, rank ladder, crew roster and skill grade bands match PLAN.md** with no drift,
  and `symbolicOnly` is genuinely derived from `minGrade < 2` rather than hand-set.
- **The progression completes.** Every island is beatable in 4–6 volleys using only the cannon a
  player is guaranteed to hold on arrival via the required unlock chain, verified arithmetically
  against T-004's shipped hulls and T-008's damage floor.
- **The lookup helpers are total and structurally immune to prototype-chain keys** — no object
  indexing exists in the module, so the class of bug is absent rather than guarded against.
- **Import-time validation is the right architectural call** for bundled content, and both the
  boot path and the test path share one error-message shape.
- **The Iron Law is respected without exception** — no invented field, no extra export, no
  speculative structure.
- **The `place_value_compare` hole is coherent**, confirmed against T-010, T-011 and T-019.

No Critical findings. No Important findings. Five Minors, none of which requires a change to land
this ticket; M-1 and M-2 are worth follow-up tickets for the planner.

---

**APPROVED**
