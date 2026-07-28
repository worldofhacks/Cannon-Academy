# Cannon Academy — K-5 Math Duels on the High Seas

v3 final · turn-based pirate concept, locked after differentiation review · July 27, 2026 · MVP day 2, submission day 5

## The pitch in one paragraph

A skill-based naval adventure where solving math powers every action on your ship. You're a young captain — not a pirate — rising through the ranks in seas full of pirate crews, ghost ships, and sea monsters. Each turn of a duel you pick a cannon, and while your crew reloads you solve that cannon's math problem: a correct answer fires the volley, and answering *fast* pulls the damage roll toward the top of the cannon's range — true aim as fluency made visible. Bigger guns demand harder problems; volatile guns backfire on a miss; Perfect Shots crit. Victories drop treasure chests — coins, cannons, crew, flags — and island ports host gunnery ranges where mastering a skill unlocks that port's cannon and lifts the fog on the next stretch of the chart. **The ship is your character**: no wizards, no collectible battling pets, no spell casting — the progression loop that makes Prodigy sticky, in a world that shares nothing with it on screen.

## Name — locked

**Cannon Academy**, store subtitle carrying the discovery keywords: *"Cannon Academy: Math on the High Seas."* Verified clean against games, apps, and brands (July 27) — only generic cannon shooters exist nearby, nothing named Cannon Academy. Runner-up if it's ever needed: **NumberSea** (also verified clean). Rejected on conflicts: Sail & Solve (Coolmath's "Solve and Sail"), Tide Academy (real schools), anything with "Broadsides" or "Battleship" (see audit).

## Decisions locked

| Decision | Choice | Consequence |
| --- | --- | --- |
| Name | **Cannon Academy** (subtitle: Math on the High Seas) | Verified no game/app/brand conflict, July 27 |
| Core mechanic | Turn-based broadside duels (final, after evaluating racing, cards, TD, CoC-style) | Natural question rhythm; bounded 5-day scope; head-to-head competitive DNA |
| Skin | Naval world — you're a young captain; *enemies* are pirates, ghost ships, sea monsters | Zero overlap with Prodigy; open faction roster instead of pirates-fighting-pirates |
| Answer model | Correct always fires; answer speed biases the damage roll (floored for slow-correct) | Math shapes execution quality, not just permission — distinct from Prodigy's answer→cast gate |
| MVP opponents | Bot captains and faction ships styled as a living sea | Same actor interface a remote player fills later (async PvP \= ghost captains) |
| Backend | Firebase JS SDK — anonymous Auth \+ Firestore | Works in Expo Go; no native modules until the day-2 EAS build |
| World | Sea chart with island nodes and varied encounter types | Walkable world permanently retired; decisions-first structure without new systems |
| Distribution | EAS → Firebase App Distribution (Android) \+ Expo web link; TestFlight if Apple activates | **Pay the $99 Apple fee today** — 24–48h activation; Android \+ web are the committed path |

## Core design

### The duel loop

Side view: your ship to port, the rival to starboard, hulls as HP bars, sea and sky behind. On your turn: choose a cannon → **reload phase** — the cannon's question appears with its timer and **four big tap-to-answer choices** → a correct tap fires the volley, and **answer speed aims it**: fast answers bias the damage roll toward the top of the cannon's range, slow-but-correct answers still land a floored, respectable volley, and answering inside the fast window (first \~40% of the timer) is a **Perfect Shot** — one bonus ball and spark VFX. A wrong tap is a misfire splash — or hull damage to you on volatile guns. Then the rival fires. Duels resolve in **4–6 player volleys, 2–3 minutes**: enemy hulls are tuned per island (first pirate sloops carry 40–50 hull against your 100) so the very first duel never drags. **Your hull resets after every duel** — no repair grind, no death spiral — and **losing never drops your rank** and still pays a small purse.

**Answer input is multiple choice everywhere**, and that is a deliberate call: four tappable choices are the smoothest thing on a phone for small hands, remove keypad friction and number-reversal for K, and give every skill — addition through fractions — one identical input so no cannon needs a bespoke UI. The known cost (a random tap lands \~25% of the time) is bounded by design: mastery gates still require ≥70% accuracy, so guessing advances no one, and distractors are engineered close to the answer (off-by-one, transposed digits, right-operation-wrong-number) so a correct tap reflects real knowledge.

Three gun temperaments: **Reliable** guns never punish a miss (the starter swivel gun — onboarding can't hurt you), **Standard** guns waste the turn, **Volatile** guns backfire for small hull damage but hit hardest. **The starting loadout is two cannons on the same K skill with different profiles** — a steady Swivel (8–12, Reliable) and a swingy Culverin (4–16, higher crit) — so "choose a cannon" is a real decision from the first duel, not after day 3. Double-Shot (opt into a harder variant of the same skill for a second volley) arrives day 3.

### The armory (launch guns)

Damage tuned against your 100 hull; **enemy hulls scale by island (40–50 at the start).** All answers are four-choice taps. Timers stay generous at K-tier.

| Cannon | Skill (grade band) | Damage | Temperament | Timer | How earned |
| --- | --- | --- | --- | --- | --- |
| Swivel Gun | Addition within 10 (K–1) | 8–12 | Reliable | 20s | Starter |
| Culverin | Addition within 10 (K–1) | 4–16 | Volatile (crit) | 20s | Starter (the real early choice) |
| Six-Pounder | Addition within 20 (1–2) | 10–16 | Standard | 15s | Port Sumwich range |
| Chain Shot | Subtraction within 20 (1–2) | 10–16 | Standard | 15s | Port Sumwich range |
| Nine-Pounder | Place value & compare (2) | 12–18 | Standard | 15s | Chest drop |
| Twelve-Pounder | Multiplication facts (3) | 14–24 | Standard | 12s | Isla Products range |
| Mortar | Division facts (3–4) | 14–24 | Standard | 12s | Quotient Cove range |
| Double Broadside | Two-step add/sub (2–3) | 16–28 | Volatile (5) | 15s | Port Sumwich tier 2 |
| Powder Keg | Fractions, int-answerable (4–5) | 20–34 | Volatile (8) | 18s | Fraction Reef range |
| Long Nine | Multi-digit ops / order of ops (5) | 24–40 | Volatile (10) | 20s | Grandline Range |

Starter loadout is two K cannons (Swivel \+ Culverin) so the youngest players have a genuine choice and a second gun from minute one. First five ship by day 2; the rest are day-3 content. Fractions ride the same four-choice input as everything else — questions are engineered so the answer is a whole number or a tap-the-picture choice (missing numerator, "how many quarters make 2?", compare-and-tap), so Fraction Reef needs no special keypad.

### Treasure chests — the reward moment

Every victory pays coins by performance (win, accuracy, perfects) and drops a chest on a rarity roll: coins, a cannon, a **crew member** (light collectible passives — a Gunner nudges crit chance, a Carpenter heals 5 hull between duels, a Cook re-rolls one wrong answer per duel), or cosmetics (flags, sails, figureheads). Chest-opening is the pack-opening dopamine beat that carried Pokémon TCG Pocket and Clash Royale, in pirate-native form. Everything is earnable by playing; nothing is purchasable — a deliberate anti-Prodigy line for the writeup. Crew depth is a day-4 stretch: the cut line keeps chests as coins \+ cannons \+ cosmetics.

### Sea chart, ports, and mastery

The world is a hand-illustrated sea chart with island nodes: each island has a **gunnery range** (training) and waters to patrol. **Mastery fills two ways** so the fun mode is never progression-dead: range drills fill a skill's meter at full rate, and **correct answers in real duels fill the matching skill at half rate** — a kid who just loves dueling still advances, while ranges stay the fast lane. Crossing a threshold (10 correct at ≥70% accuracy) unlocks that skill's next cannon and lifts the fog on the next island. Islands follow the K-5 arc: Port Sumwich (add/sub) → Isla Products (multiplication) → Quotient Cove (division) → Fraction Reef → the Grandline (grade-5 finale).

**Placement, not grinding:** a grade picker at onboarding (K-1 / 2-3 / 4-5) pre-unlocks islands and cannons up to the player's band and sets starting bot difficulty, so a 5th grader begins at multiplication, not 3+4. Mastery per skill persists to Firestore — the brief's "reward mastery, steady progression," navigable at a glance.

Rank ladder for the competitive frame: Cadet → Ensign → Captain → Commodore → **Fleet Legend**, advanced by duel wins (day 4). Rank never drops on a loss.

### Encounters — decisions first

The design question is never "what math problem comes next?" but "what does the captain *choose* next?" — math is the engine behind the choice. Island waters offer a small mix of encounter types, all reusing the duel and question engines (content, not new systems): **duels** against pirate crews (the core, MVP scope); **merchant rescues** — a timed drill event that pays coins and reputation (day 3); **treasure digs** — a short drill for a bonus chest (day 3); and **boss nodes** — a ghost ship mid-game and a kraken at the Grandline, with bigger hulls and one signature attack each (day 4). Stretch, one branch only: **boarding as a finisher** — when the enemy hull drops under 20%, choose the safe cannon finish or board with a single hard question for a bonus-tier chest. Run/negotiate/free-sail choices are out of 5-day scope and noted as future work.

### Questions, coaching, onboarding, opponents — carried forward

The template engine is unchanged from v1: 15–25 golden parameterized shapes per skill, constrained random params, **four-choice output with engineered distractors**, no LLM in the hot path, pure functions unit-tested day 1. **K-1 templates are symbolic-only** (`{a} + {b} = ?`, never word problems) so a non-reader is never blocked by reading; word-problem shapes are gated to grade 2+. Missed questions trigger a **Navigator's coach card** after the duel — the worked solution in one screen, with a read-aloud button (expo-speech, \~1h, day 4) so the remediation isn't reading-gated either.

Onboarding: **grade picker** (K-1 / 2-3 / 4-5) → pick a captain name and flag (anonymous Firebase auth, username-only, COPPA-friendly) → a guided first duel against a scripted pirate sloop that politely sinks in three volleys; **first reward inside 90 seconds** (worded so a chest-cut can't break the promise).

Opponents come in factions — **rival cadets** (the ranked ladder, styled as players), **pirate crews** (island patrol duels), and **bosses** (ghost ship, kraken). All share one actor interface with grade-banded accuracy, humanlike answer delays, and occasional misfires. **Mercy is built in, not hoped for:** bot accuracy tracks the player's recent accuracy minus a margin (clamped to the band), and after two straight losses the next rival misfires twice — so variance can't convince a 6-year-old they're bad at math. This is the same interface a future remote player fills for async PvP.

## Architecture

| Layer | Choice | Notes |
| --- | --- | --- |
| App | Expo SDK 57 \+ TypeScript \+ expo-router | Portrait-locked; iterated through a **development build**, not Expo Go (the App Store build is a year behind — see ARCHITECTURE §6) |
| State | Zustand | Duel state machine \+ player store, all rules in pure reducers |
| Animation | Reanimated \+ Gesture Handler | Cannonball arcs, ship rock/recoil, hull-bar tweens, screen shake, sprite strips via `Easing.steps` |
| Art | **Pre-rendered 2D sprites from free CC0 low-poly 3D** | Quaternius \+ Kenney pirate kits rendered in Blender from one locked camera — no 3D runtime in the app |
| FX | Lottie \+ `expo-image` | Splashes, hits, chest burst; animated WebP for the rotating-chest moment |
| Backend | Firebase JS SDK v12+ — Auth (anonymous) \+ Firestore | Local-first; the play path works offline |
| Audio | expo-audio | Cannon fire, splash, perfect-shot ding, chest fanfare, sea shanty loop — day 3, never on the MVP path |
| Builds | EAS Build | Dev client day 1 (Android first, no Apple account needed) → preview APK to Firebase App Distribution → TestFlight if Apple clears → web export fallback |

Duel state machine: `countdown → playerChoose → reload(question) → resolvePlayer → rivalTurn → resolveRival → (victory + chest | defeat)` — pure reducer, onboarding is a scripted sequence of the same states, unit-testable headless.

**Art direction:** bright, chunky, flat-shaded low-poly, all CC0 and free. Quaternius' Pirate Kit (71 models including ships, chests, cannons, and a tentacle that becomes the kraken) is the base style; Kenney's Pirate Kit fills gaps; Kenney's 190-sprite 2D Pirate Pack is the parachute if Blender stalls. The ghost ship is a standard hull with a translucent cyan material. One `studio.blend` with a locked orthographic camera and three-point rig makes every asset consistent by construction — \~1–2h setup, then 5–20 minutes per asset, and the whole pipeline is incremental so grey boxes swap to real art one file at a time.

## Milestone 1: functional MVP in 2 days — then everything else

**The first milestone is a functional MVP at the end of day 2.** Its definition of done is the checklist below, written as the *post-cut* version so the cut lines and "done" never contradict each other — everything here must be green; everything in the "cut if behind" list is expendable.

**MVP checklist (cannot slip):** fresh install → grade picker → name/flag → an easy guided duel you win → land back on the sea chart → win a real duel against a bot (four-choice answers, speed-aimed volleys, two starter cannons that are a real choice) → earn coins → run a practice drill that fills a mastery meter → the meter unlocks the next cannon → **lose a duel on purpose and see the loss flow (small purse, rank intact, hull reset)** → **time out a question and see the misfire** → **kill the app mid-duel, relaunch, land safely on the map with progress intact** → close and reopen normally, progress persisted locally **under the same anonymous UID**.

Placeholder art is explicitly fine for this checklist — grey boxes and coloured rectangles pass. Sound is banned until day 3.

**Cut if behind (in this order):** treasure-chest ceremony → plain coin payout; second island → slips to day 3; Firestore sync → day 4 (local persistence is all the MVP needs); scripted-tutorial polish → a plain easy first duel.

| Day | Deliverable | Detail |
| --- | --- | --- |
| **1 (Tue)** | A duel you can win | **Pre-flight first:** pay Apple $99, create the Firebase project, kick off the EAS **dev-client build for Android** (90-min timebox; Simulator/emulator is the fallback and blocks nothing). Then: scaffold with portrait lock \+ safe areas \+ `theme/` tokens, template engine \+ golden tests (add/sub, four-choice with distractors), duel screen — state machine, cannon select (two starter cannons), reload question \+ timer \+ 2×2 answer grid at ≥64pt, speed-biased damage roll, cannonball arc, hull bars, **victory / defeat / timeout flows**, coin payout. Local persistence (Zustand \+ AsyncStorage, hydration-gated) and Firebase auth with `initializeAuth` persistence. `dev.tsx` tuning sliders \+ "grant progressed captain" button; `ui-kit.tsx` stub. Grey-box art. |
| **2 (Wed)** | **MILESTONE 1: MVP checklist green** | Grade picker \+ name/flag onboarding, sea chart with the first island, gunnery range drill raising mastery to unlock the third cannon, treasure chest as a plain rarity roll, mid-duel kill/relaunch safety, Firestore write-on-boundary, preview APK → Firebase App Distribution. Range drill cut line: reuse the duel question UI against a stationary target buoy — a meter, not a new mode. **If there's slack: download the CC0 packs and build `studio.blend`** so day 3's art pass starts warm. |
| **3 (Thu)** | Content complete, then a strictly half-day juice budget | Morning: islands/cannons/templates through grade 5 (≥8 templates/skill floor), gun temperaments \+ Perfect Shot \+ Double-Shot, faction opponent variety, mercy/rubber-banding. Afternoon (\~4h timebox): **art pass — render ships, chests, cannons, islands from the CC0 packs and swap out grey boxes** — then token restyle via `ui-kit.tsx`, SFX, screen shake, haptics, chest ceremony, Lottie FX, in that order. Overflow goes to day 5; day 5's overflow capacity is **zero**, so this list is finite. Coach cards are stretch. |
| **4 (Fri)** | Meta \+ distribution | Rank ladder (Cadet → Fleet Legend) \+ leaderboard (public mirror doc, numeric rank tier), **harbor shop — repair kits, stat parts, decorative flags/sails, buy-a-chest — the coin sink**, ghost-ship boss node, sprite animation strips (ship rock, cannon fire) via `Easing.steps`, coach-card read-aloud, web build deployed \+ smoke-tested (`@lottiefiles/dotlottie-react` installed), TestFlight internal if Apple cleared, clean-device install test. |
| **5 (Sat)** | Polish \+ submission | Timer/damage tuning per band (watch a kid play if possible), day-3 juice overflow, icon/splash, \~5-beat 60–90s demo video (onboarding → duel → perfect shot → chest → new-cannon unlock), README with architecture, pedagogy, and differentiation notes. |

## Risks

- **Duel feel** — volley animation \+ damage legibility is the product's heartbeat. Mitigation: damage math is a tested pure function; animation is one parabola \+ Lottie; a dev screen exposes timers/ranges as sliders for all-week tuning.
- **Day 1 is the fullest day** — pre-flight, scaffold, engine, and duel screen all land together. Mitigation: the dev build is timeboxed to 90 minutes with a fallback that blocks nothing, art is grey boxes by design, and the MVP checklist defines exactly what may be cut.
- **K-band pressure** — Reliable starter gun can't punish, K timers stay long, last place still pays, mercy bots track player accuracy; ranks keep bands apart.
- **Art pipeline for a first-timer** — Blender is new. Mitigation: one locked `studio.blend`, \~1–2h of setup, and a genuine parachute (Kenney's 190 finished 2D sprites) that costs nothing but the low-poly look. The pipeline is incremental, so partial completion is still shippable.
- **Apple activation latency** — paid day 1, out of your hands; Android \+ web are committed.
- **First EAS build friction** — pulled forward to day 1 precisely so it can't surprise you on day 5.

## Differentiation summary (for the writeup)

Versus **Prodigy**: no wizard, no pets, no spell school — and mechanically, Prodigy assigns questions as a toll while Cannon Academy makes difficulty a strategic choice (gun selection, temperaments, Double-Shot) and fluency itself the power fantasy (Perfect Shots). Versus **Blooket/Gimkit**: those are teacher-launched classroom sessions; this is a standalone progression game a kid owns. Versus the considered-and-rejected alternatives (racing: questions interrupt flow-state; tower defense: real-time simulation exceeds plain-RN limits and Blooket owns the lane; CoC-style: no natural seat for questions): the turn-based duel is the only structure with a native thinking-pause, head-to-head framing, and bounded 5-day scope. Out of scope, stated plainly: real-time PvP netcode, chat (its absence is a child-safety feature), purchases of any kind, multiple ships. Future work: ghost-captain async PvP on the recorded duel logs, teacher dashboard over the mastery data.

## Similarity audit (deep check, July 27)

A sweep across app stores, classroom-game platforms, and the indie space — plus a second-opinion review pass — found **no existing game occupying this design**: a persistent-progression, question-gated naval combat game with math-domain weapon unlocks, island-to-island advancement, and ship customization. The neighbors, and why none creates copy optics:

| Neighbor | What it actually is | Distance |
| --- | --- | --- |
| MathLand (\~50K downloads, best-known pirate math game) | Pirate-themed *platform adventure* — solve puzzles to collect gems. No battles, no ships fighting | Shares only the costume; different genre |
| Pirate Treasure Maths | The closest pirate-themed educational title: treasure, maps, cannons, simple ship battles — but a *collection of minigames*, no persistent progression | Confirms the combination, not any single ingredient, is what's unclaimed |
| A Percent of a Pirate (Steam) | Tower-defense teaching percentages/ratios to \~7th graders | Different genre, different age band |
| Reader Rabbit pirate titles, Mystery Math Island, Captain Smartbeard, LeapFrog pirate games | The 1990s–2000s era: linear minigame collections and point-and-click edutainment | Long-dead formats; no progression-game resemblance |
| Pirate Math Adventure Island, Pirate Mathskills, TinyTap/TPT material | Preschool mini-game sets and printable worksheets; largest has 5 reviews, last updated 2018 | Negligible footprint, no combat |
| "Math Battleship" classroom games | Coordinate-grid Battleship variants | Different mechanic; keep the word "Battleship" out of all copy |
| Medieval Math Battle (2013), Math and Sorcery (2018), Math Battle: Heroes of × & ÷, Monster Tower, MathCraft Battle, Math Wizard | The answer-to-attack micro-genre: small, mostly dormant indie apps in sword/wizard/monster skins | Answer-to-attack is a *genre convention* no one owns; none has speed-aimed execution, gun temperaments, mastery-gated economy, chests, or ranked bots |
| Prodigy | Wizard MMO-lite, assigned adaptive questions, battling pets | Separated by skin, by captain-vs-factions framing, and by the execution model: Prodigy gates *permission* to act; this game shapes *quality* of execution |
| Nitro Type / Blooket / Gimkit / 99math | Typing racer and teacher-launched classroom quiz platforms | Different function (live classroom vs. standalone progression game) |

Title actions from the audit: drop **Broadsides\!** as the leading candidate — "Broadsides" is a well-worn game name (the 1983 naval video game, *Broadsides and Boarding Parties*, *Choice of Broadsides* on Steam), all unrelated to math/kids but crowded. Prefer a distinctive compound — Cannon Academy, Treasure Fleet, Sums & Sails, Math Armada — verified against store search on day 5. The honest writeup summary: the *mechanic* has scattered small-scale precedent, the *pirate skin* has only minigame collections and worksheets, and the combination — persistent ship progression \+ math-powered naval combat \+ domain-gated weapons \+ island advancement \+ customization — appears genuinely unclaimed.
