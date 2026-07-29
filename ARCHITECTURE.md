> **Historical / target-design document (A-044).** Stack decisions and engine design here are the
> contract intent; screens, services, and dependencies named below may be **target design** rather
> than current code. Shipped routes and limitations: [`README.md`](README.md). Live tickets:
> [`tickets/INDEX.md`](tickets/INDEX.md). Deploy: [`RELEASE.md`](RELEASE.md). Web production is EAS
> Hosting at <https://cannon-academy.expo.app> (not Firebase Hosting).
>
> **Not current architecture unless code exists:** `/harbor`, `/ranks`, `/dev`, Lottie-driven FX,
> live Firebase Auth boot in `app/_layout.tsx`, Firestore gameplay sync, and a second Firebase
> Hosting web target. Owning backlog tickets live in INDEX.

# Cannon Academy — Architecture

_K-5 math duels on the high seas. Turn-based naval combat where correct answers fire cannons and answer speed aims the shot._

This document records, for each layer of the stack and each core game system: the options considered, the decision, why, and what would make us revisit it. Constraints that shaped every call: **one developer, 5 days, MVP at day 2**, target audience K-5 (ages 5–11), must demo well on a phone, and the architecture should leave a clean path to real multiplayer without building any of it now.

Baseline versions at time of writing (July 2026): Expo SDK 57 / React Native 0.86 / Reanimated 4.5 / Gesture Handler 2.32. New Architecture (Fabric) is the default and we do nothing to opt out.

---

## 0. Priorities

**The product is a fun, functional game — and the first milestone is a functional MVP at the end of day 2.** Every architecture decision below is subordinate to two questions: does it make the duel feel better, and does it keep the build shippable? Explicitly _not_ priorities for this build: hardened security, analytics, CI, and scalability — each gets the minimum viable treatment and a one-line future note, no more.

**Sequencing rule: function first, juice after.** Days 1–2 ship the MVP checklist (playable loop, persistence, placeholder art, basic cannonball arc \+ hull bars, zero sound). The juice checklist below is the **day-3+ budget** — timeboxed to roughly half a day, applied in priority order, with overflow landing in day 5's polish block. Two architectural prerequisites make that deferral safe, and both are day-1 work: feedback hooks live in the duel reducer's events, so bolting juice on later touches components and never game logic; and the art pipeline (§7) is incremental by construction, so real sprites replace grey boxes one file at a time, any hour of any day.

The corollary is that **layout is not juice**. Where things sit, how big they are, and what a five-year-old's thumb can reach are day-1 decisions that are expensive to revisit — see §3.6. Colors, art, and motion are the cheap half, and only that half is deferred.

The juice checklist (day 3+, in order):

- **Answer → impact latency near zero**: the volley fires the frame after a correct answer; all feedback on the UI thread. _(Free — it's just not blocking the answer path — and applies from day 1.)_
- **Feedback layering**: cannon boom \+ splash/hit SFX, screen shake on big hits, haptics (expo-haptics), Perfect Shot chime.
- **The chest moment**: anticipation pause → shake → burst — the reward beat gets the largest single animation allocation.
- **Never a dead end**: wrong answers keep the duel moving; a slow kid still lands volleys; losing still pays a little. _(Design rule, not animation — applies from day 1.)_
- **Tuning without rebuilds**: every feel constant in `tuning.ts` behind the dev slider screen.

Functional \= crash-free duels and never teaching wrong math — which is why the engine tests (§9) stay even in a fun-first build.

## 1. Platform & framework

**Options considered**

| Option                               | Verdict                                                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Expo (managed) \+ TypeScript**     | ✅ Chosen                                                                                                      |
| Bare React Native                    | More native control we don't need; loses EAS velocity                                                          |
| Flutter                              | Strong engine, but team experience is React; ecosystem parity for our needs; no reuse of RN web export         |
| Native (Swift/Kotlin)                | Two codebases in 5 days; disqualified                                                                          |
| Web-first (Phaser/PixiJS \+ wrapper) | Real game engine, but WebView perf on Android is 5–10× worse, and bridging auth/UI between runtimes burns days |

**Decision: Expo SDK 57, TypeScript strict mode, managed workflow, iterated through a development build (§6).**

Why: fastest iteration loop that still produces store-distributable binaries (EAS Build), and a free web export for a share-anywhere demo. The game is menu-driven turn-based UI over pre-rendered sprites — exactly what RN is good at — so the classic "RN can't do games" objection doesn't apply (see §3.3).

Revisit if: we ever need \>100 animated entities on screen simultaneously (we won't in this design — max \~12 cannonballs \+ 2 ships \+ FX).

## 2. Language & code conventions

- **TypeScript everywhere, `strict: true`.** Game content (cannons, islands, question templates) is data, and strict types on data catalogs catch authoring mistakes at compile time.
- **Zod** for runtime validation of all content catalogs at test time (and once at app boot in dev). Catalog authoring errors should fail a test, not a child's battle.
- ESLint (expo config) \+ Prettier, no debate time budgeted.
- Package manager: npm (default, zero friction with EAS).

## 3. App-layer stack

### 3.1 Navigation

**Options:** expo-router (file-based, typed routes) vs bare react-navigation.
**Decision: expo-router.** It _is_ react-navigation underneath, adds typed links and web URL support for free (our web demo build gets shareable routes), and file-based layout matches a 6-screen app: `map`, `duel`, `range` (practice), `harbor` (garage/shop), `ranks` (ladder/leaderboard), `onboarding`.

### 3.2 State management

**Options considered**

| Option                              | Verdict                                                                                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Zustand \+ pure reducer modules** | ✅ Chosen                                                                                                                                                   |
| Redux Toolkit                       | Same architecture, more ceremony; nothing RTK gives us that we need (no complex middleware, no devtools requirement)                                        |
| Jotai/Recoil                        | Atom model fits derived-data UIs, fights an explicit state-machine design                                                                                   |
| React Context only                  | Re-render blast radius during animation-heavy duels                                                                                                         |
| XState                              | The _right_ formalism for our duel machine, but its learning/integration tax in 5 days outweighs the benefit over a hand-rolled discriminated-union reducer |

**Decision: two Zustand stores, with all game logic outside React.**

- `usePlayerStore` — profile, coins, cannons, crew, mastery, rank. Persisted (§7).
- `useDuelStore` — thin wrapper that holds the current `DuelState` and dispatches events into the pure reducer.

The rule that matters more than the library: **`src/engine/**` contains zero React imports.** Every gameplay rule — damage, question generation, bot behavior, economy — is a pure function `(state, event) → state`. React components render state and dispatch events; they never contain rules. This is what makes the engine unit-testable headless, the onboarding a scripted event sequence, and a future remote opponent a drop-in actor.

### 3.3 Rendering & animation

**Options considered**

| Option                                                         | Verdict                                                                                   |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **RN Views \+ Reanimated 4 \+ pre-rendered sprites \+ Lottie** | ✅ Chosen                                                                                 |
| Real-time 3D (expo-gl \+ three.js \+ react-three-fiber)        | Rejected — see below                                                                      |
| react-native-skia canvas                                       | GPU batching we don't need at our entity count; hand-rolled loop/camera/input \= days     |
| react-native-game-engine                                       | Dormant since 2020; View-per-entity, no GPU batching                                      |
| Phaser 4 in WebView                                            | Separate runtime sandbox; Android WebView 5–10× slower; postMessage bridge for auth/state |

**Decision: ordinary RN Views animated with Reanimated worklets. All game art is pre-rendered 2D sprites (§7). Lottie for particle-ish FX; one parallax pair of sea/sky layers.**

**Why not real-time 3D, stated plainly, because voxel/3D art was seriously considered:** our camera never moves. Portrait, fixed side view, two ships facing each other, turn-based. Under a fixed camera, real-time 3D produces the _same silhouettes_ as pre-rendered 3D while trading Blender's offline path-traced lighting for whatever a mid-range Android manages at 60fps. It is strictly worse output for materially more cost: \~2.3 MB of added JS (three \+ drei), an `expo-gl` dependency whose own maintainers have flagged it as a maintenance burden they're migrating off (`pmndrs/native` carries a "DO NOT USE YET" banner and has been stalled since Jan 2026), an unresolved iOS Simulator GL crash open since 2024, and 12–25 hours of first-timer setup against a 5-day box. The 3D work still happens — it happens _offline_, in Blender, where it's cheap (§7).

Peak simultaneous animated elements in a volley is roughly a dozen cannonballs (parabolic arcs \= one `withTiming` on x plus a derived parabola on y), two ship sprites, hull bars, and a Lottie or two — comfortably inside plain-RN territory on mid-range Android under the New Architecture.

**Sprite animation costs nothing extra.** Reanimated's `Easing.steps(n, false)` is a worklet: put an N-frame horizontal strip in a one-frame-wide `View` with `overflow: 'hidden'` and animate `translateX` from `0` to `-(frameWidth * N)` inside `withRepeat(withTiming(..., { easing: Easing.steps(N, false) }))`. Ship rock, cannon recoil, splash and muzzle flash all run on the UI thread with zero JS re-renders and no new dependency. Never drive frames with `setState` — it flickers and burns JS frames.

Use **`expo-image`** (not RN's `Image`) for all sprites: WebP and animated-WebP support, better caching, and it's a first-party Expo module. Animated WebP covers any "small 3D moment" (a rotating reward chest is a 36-frame turntable rendered once, \~150 KB) without adopting a 3D runtime for one screen.

Perf rules: 60fps target on mid-range Android; all continuous animation on the UI thread via worklets/`useAnimatedStyle`; no `setState` per frame; the answer keypad is plain Views (it's a form, not a game object); memoize list rows on map/harbor screens.

### 3.4 Audio

**Decision: `expo-audio`** (the current Expo audio library; `expo-av` is deprecated). Sounds: cannon fire, splash, hit, Perfect Shot chime, chest fanfare, victory sting, one ambient sea loop. All bundled locally — no network fetch in the play path.

Two non-obvious requirements, or the day-3 SFX pass "works" in dev and is silent in the demo: expo-audio players are stateful instances, so `services/audio.ts` is a **small player pool** (overlapping cannon booms need more than one player, or `seekTo(0)` reuse), and iOS silent-switch must be handled deliberately with `setAudioModeAsync({ playsInSilentMode: true })` at boot — kids' devices live on mute. Every play call is wrapped in try/catch; a silent duel is still a working duel. Audio is day-3 juice, never on the MVP path.

### 3.5 Local persistence

**Options:** AsyncStorage vs react-native-mmkv vs expo-sqlite.
**Decision: AsyncStorage** (via Zustand `persist` middleware, `createJSONStorage(() => AsyncStorage)`) for the player store. MMKV is faster but needs a native module (kills Expo Go); SQLite is overkill for one small JSON document. Persisted state is a few KB.

**Cold-start hydration is the real risk, not jank.** AsyncStorage rehydration is async, so the first render sees default state (0 coins, no cannons, onboarding-incomplete). The root layout must gate on a `hasHydrated` flag (set in Zustand's `onRehydrateStorage`) and hold the splash screen until hydration completes — otherwise the onboarding-vs-map redirect can fire against empty state, and an early write can clobber the saved snapshot. This gate directly protects the day-2 "reopen, progress persisted" checklist item and is a day-1 task.

### 3.6 UI structure & design tokens

**Portrait-locked.** Every screen assumes portrait; no rotation handling, no landscape layouts. A side-view naval duel superficially argues for landscape, but portrait is how children hold phones, it gives the four-choice answer grid the vertical room it needs, and it halves layout and test work. Locked in `app.json`.

**The build order is layout first, visuals later — and the line between them is not where it looks.** Cheap to change on day 3: colors, radii, shadows, typography, art. Expensive to change on day 3: where things sit, how big they are, what's reachable. So spatial and ergonomic decisions are day-1 work even though they feel like styling:

- **Tap targets sized for five-year-olds.** The 44pt adult minimum is too small here. Answer choices are the largest interactive elements on screen, floored at \~64pt, with generous gaps so a mis-tap doesn't select a neighbour.
- **Answers live in the bottom half**, inside the thumb arc, as a 2×2 grid. Ships and hull bars occupy the top third, question text the middle band. That's the duel screen's spatial contract, fixed on day 1.
- **Safe areas from the first screen** (`react-native-safe-area-context`) so notches and home indicators never force a late reflow.

**What makes the day-3 restyle cheap: tokens and a kit screen.** `src/theme/` holds every color, spacing step, radius, and type size as a named token; components reference tokens only — **no literal hex values or magic numbers in screen files**, enforced by review habit. Retheming then means editing one file rather than forty. Alongside it, `app/ui-kit.tsx` is a hidden dev route rendering every primitive (buttons, panels, meters, the answer grid, hull bars, chest card) on a single screen, so a restyle can be applied and verified in one place instead of clicking through the whole app hunting for what broke.

## 4. Game engine design (`src/engine/`)

The engine is a set of pure TypeScript modules. This section is the real architecture of the product.

### 4.1 Question engine

**Options for question sourcing**

| Option                             | Verdict                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| **Parameterized golden templates** | ✅ Chosen                                                                         |
| Static question bank               | Finite, repeats, heavy authoring                                                  |
| LLM generation at runtime          | Latency in the hot path \+ nonzero wrong-answer rate \= disqualified for K-5 math |
| Adaptive engine (IRT-style)        | Out of scope; "player chooses difficulty" replaces it with agency                 |

**Answers are four-choice taps, universally.** Every question renders one correct answer plus three engineered distractors — a decision driven by mobile smoothness (no keypad for small hands), K-friendliness (no digit reversal, no free-entry anxiety), and uniformity (addition and fractions share one input, so no skill needs a bespoke keypad). A template therefore carries a distractor strategy, not just an answer:

```ts
type Template = {
  id: string;
  skill: SkillId; // e.g. "add_within_20"
  text: string; // "{a} + {b} = ?"  (symbolic only for K-1)
  params: Record<string, [number, number]>; // inclusive ranges
  constraints?: string[]; // ["a + b <= 20"] — tiny safe evaluator over params
  answerExpr: string; // "a + b"
  distractors: string[]; // exprs, e.g. ["a + b + 1", "a + b - 1", "a * b"] — plausible, never equal to answer or each other
  readAloud?: boolean; // grade 2+ word problems flagged for TTS
};
```

Generation \= pick template (excluding recently served ids per session) → rejection-sample params until constraints pass (bounded attempts; a template that fails 100 samples throws in tests) → render text → compute answer \+ three distractors → shuffle the four choices via the seeded PRNG. Golden tests assert distractors are all distinct, none equals the answer, and all are plausibly typed (same magnitude/sign). **K-1 templates are symbolic-only** (a per-skill `symbolicOnly` flag) so non-readers are never blocked; word-problem shapes require grade 2+.

**Determinism:** every random draw — params, distractor shuffle, bot behavior — goes through a seeded PRNG (mulberry32), seed carried in state. `Math.random()` is banned in `src/engine/` by lint rule. This buys reproducible tests and the replayable-duel seed (see §4.2 for what else replay needs).

### 4.2 Duel state machine

One state list, reconciled across both docs (this is authoritative):

```
countdown → playerChoose → reload(question) → resolvePlayer
          → rivalTurn → resolveRival
          → … → victory(chest) | defeat
```

`rivalTurn` collapses the rival's choose+reload+answer into one opponent-driven step (the player doesn't watch a rival keypad). Implemented as a discriminated-union `DuelState` \+ `duelReducer(state, event): DuelState`. Events: `CANNON_SELECTED`, `ANSWER_CHOSEN {choiceIndex, elapsedMs}`, `TIMER_EXPIRED`, `ANIMATION_DONE`, `RIVAL_ACTION {…}`.

**The async/sync seam is real code, and it's specified here so it isn't reinvented at the keyboard.** The reducer is pure and synchronous; the `Opponent` interface is Promise-based (bots think, future network players have latency). A **duel-store driver** in `useDuelStore` owns the bridge:

```ts
interface Opponent {
  chooseAction(view: RivalView): Promise<RivalAction>;
  produceAnswer(q: Question): Promise<{ correct: boolean; elapsedMs: number }>;
}
```

Driver rules, all load-bearing:

- **Turn token:** the reducer stamps every turn with an incrementing id; the driver tags each awaited promise with the token it was launched under and **discards any resolution whose token ≠ the current turn** (kills the "bot answers after the player already quit / timed out" race).
- **Out-of-phase events are no-ops:** the reducer ignores any event that doesn't match its current state (belt-and-suspenders with the token; also covered by the invariant fuzz test in §8).
- **Cancellation on teardown:** leaving the duel screen aborts pending timers/promises; nothing dispatches into an unmounted machine.
- **Bot delays are presentation-only or PRNG-drawn** — never wall-clock values that affect state — so a replayed duel is deterministic.

Bots implement the interface with banded accuracy that tracks the player's recent accuracy minus a margin (mercy; see plan), the scripted onboarding rival implements it with a fixed script, and a future remote player implements it over the network. The reducer never knows which.

**Replay/ghost needs more than the seed.** A seed reproduces PRNG draws but not player inputs, so the duel doc stores the seed **plus an ordered per-volley action log** `{actor, cannonId, correct, elapsedMs}`. Seed \+ action log \= an exactly reconstructable duel, which is what the §12 ghost-captain feature actually replays.

### 4.3 Damage model

All tuning constants live in one file, `engine/tuning.ts`, exposed on the hidden dev screen (`app/dev.tsx`, built day 1) as sliders — this is how day 5 tuning happens without rebuilds.

```
roll = uniform(cannon.min, cannon.max) biased by answerQuality
answerQuality ∈ [0,1] from elapsedMs vs the cannon's timer (floored at 0.35 for any correct answer)
perfectShot (elapsed < 40% of timer) → +1 damage, celebrated with an extra cannonball arc (presentation only)
volatile guns: wrong answer → recoil damage to self
```

**Enemy hull is per-island, in `tuning.ts` from day 1** (starter sloops 40–50 vs the player's 100), so the day-1 "a duel you can win" resolves in 4–6 player volleys rather than the 10+ a flat 100-hull enemy would force. Player hull is session-only and resets each duel. The floor is a pedagogical guarantee: a slow-but-correct K kid always lands ≥ a respectable mid-range volley. Damage is a scalar total; the duel view may render it as N cannonball arcs (from `BASE_BALLS_PER_VOLLEY`, plus one extra arc on a Perfect Shot) so the roll reads as shot spread — arc count is presentation and does not subdivide damage.

`perfectShot` and volatile recoil are **engine behavior from day 1** (cheap, and §8 tests them); their **VFX/UI surface lands day 3**. Writing that split down here prevents a mid-build scope debate.

### 4.4 Content catalogs

`src/content/` holds `skills.json`, `cannons.json`, `islands.json`, `crew.json`, `ranks.json`, `templates/<skill>.json` — all typed, all zod-validated in a test that also golden-tests every template (1,000 samples per template: constraints hold, answer expression evaluates, params in range). Content ships in the bundle; **no network call in the play path, ever**. The whole game must be playable in airplane mode except the leaderboard.

## 5. Backend

**Options considered**

| Option                                  | Verdict                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Firebase JS SDK (Auth \+ Firestore)** | ✅ Chosen                                                                                        |
| react-native-firebase (native)          | Needed only for Analytics/Crashlytics; costs Expo Go \+ config plugins; skipped                  |
| Supabase                                | Fine alternative; Firebase chosen for Expo-docs blessing, anonymous-auth ergonomics, familiarity |
| Local-only                              | Loses accounts/leaderboard, and the brief includes account creation \+ onboarding                |

**Pin `firebase@^12`.** Expo SDK 57 only supports firebase 12.0.0+ (earlier versions hit ES-module resolution errors with Metro's package exports). Do **not** add the widely-Googled `unstable_enablePackageExports=false` / `.cjs` Metro workaround — it's obsolete and can itself break an SDK 57 project.

**Auth: Firebase anonymous auth — and it must be initialized for persistence.** The JS SDK defaults to _in-memory_ auth on React Native, which mints a brand-new anonymous UID on every cold start (orphaned progress, duplicate leaderboard rows) — a silent, latent bug the day-2 checklist would otherwise miss because Zustand is local. Initialize explicitly on day 1:

```ts
const auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
```

and make the day-2 checklist assert **same UID after relaunch**. (Budget \~20 min for a known `getReactNativePersistence` TypeScript-export wrinkle under strict TS.) Username \+ flag only — no email, no PII. Known accepted limitation: AsyncStorage is wiped on uninstall, so reinstall/device-switch orphans cloud progress permanently, and the day-4 clean-device test starts a fresh UID — fine for a showcase, noted in §11.

**Firestore init: force long-polling and expect transport flakiness.** `WebChannelConnection RPC 'Write' stream transport errored` is a live, unresolved class of issue on Expo/RN where writes hang while auth and reads work. Initialize with detection on and treat every write as fire-and-forget:

```ts
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
```

The day-2 EAS build is the canary for this, not just for config.

**Schema**

```
users/{uid}:  { name, flag, grade, coins, cannons[], crew[], cosmetics[],
                mastery: {skillId: 0-100}, rankTier: number, wins, losses, createdAt }
              // hull is session-only, never persisted
leaderboard/{uid}: { name, flag, rankTier, wins }        // public mirror, written at duel end
duels/{id}:   { uid, rivalId, result, seed, actions[], endedAt }   // seed + per-volley log = replayable; TTL on endedAt
```

**Leaderboard is a separate public mirror, not a query over `users`.** Firestore rules are not filters: a top-N query over `users` fails under owner-only read rules, and making `users` world-readable would expose every child's full profile (coins, mastery, W/L) against the §10 posture. Instead each user writes a tiny `leaderboard/{uid}` doc (name, flag, rankTier, wins) at duel end; the board reads that collection, ordered `(rankTier desc, wins desc)` — the one composite index we create (day 4). **`rankTier` is numeric**, because a string `rank` sorts alphabetically (Captain \< Commodore \< Ensign) and breaks the ladder order.

**Write model: client-authoritative, and that's fine.** The client computes payouts and writes its own docs; rules restrict each user to their own `users/{uid}` and `duels`, allow public read on `leaderboard`, and validate shape. A showcase doesn't need an anti-cheat economy — server-validated writes are a one-line future note.

**Sync strategy: local-first, idempotent full-profile writes.** The Zustand player store is the source of truth during play; at each boundary (duel end, purchase, mastery threshold) **and on app-foreground**, sync does a full-profile `setDoc` (merge) from current Zustand state — never incremental `updateDoc` deltas — so a dropped offline write is harmless (the next one carries the complete state). The JS SDK's Firestore cache on RN is memory-only (no durable IndexedDB), so offline boundary writes live in RAM and are lost if the app is killed before reconnecting; the full-profile-from-local design makes profile state self-heal, and the accepted casualty is offline `duels/` logs. The play path works in airplane mode; the leaderboard is the only screen that needs connectivity (empty/error state required). **Duels never advance progression state that matters** beyond the log — mastery lives on the profile — so their loss can't corrupt a player. Enable a Firestore TTL policy on `duels.endedAt` (the one unbounded collection).

## 6. Native surface & the dev-build decision

**Expo Go is not a viable dev loop for this project.** The iOS App Store build is version 54.0.2 (September 2025) and supports SDK 54, not 57; Expo has publicly reframed Expo Go as "first and foremost an educational tool" and directs real projects to development builds. Betting the week's iteration speed on an App Store binary a year behind our toolkit — and on it clearing review mid-build — is a risk with no upside.

**Decision: a development build (custom dev client) from day 1, Android first.** A dev build is our own compiled copy of the Expo Go container, built once via EAS (\~15 min) and installed on-device; afterward the loop is identical — same QR code, same instant reload, same Fast Refresh. Android first because an Android dev client needs no Apple Developer account, which is still pending payment/activation; the iOS Simulator on the Mac covers the second target immediately, and iOS device builds switch on with zero rework once Apple clears.

**What this buys beyond unblocking:** the scariest infrastructure step of the week — first EAS build, credentials, `app.json` identifiers, config — moves from day 2 to day 1, when there is slack to absorb it. It also permanently deletes the entire class of "is this in Expo Go?" questions.

**The old no-native-modules invariant softens from constraint to discipline.** With a dev client we _could_ adopt MMKV, Skia, or react-native-filament. We still don't: every native dependency is build time, upgrade risk, and debugging surface we can't afford this week. The rule is now "justify each native addition against the days it costs," not "never." Current native surface, all first-party or long-stable: Reanimated, Gesture Handler, expo-audio, expo-image, expo-haptics, AsyncStorage, safe-area-context. Firebase stays the pure-JS SDK.

**Fallback:** if the dev build fights us for more than \~90 minutes on day 1, fall back to the iOS Simulator plus an Android emulator (neither needs a dev client for JS-only iteration) and retry the build in the evening. This never blocks engine or UI work, which is all JS.

## 7. Art & asset pipeline

> **SUPERSEDED, A-045 (2026-07-29). This section is history, not instruction.**
>
> The pre-render pipeline below was never completed and is no longer the plan. **The two Claude
> Design artifacts are the only source of art** — [`design/boards/README.md`](design/boards/README.md).
>
> - Ships, sails, hulls, pennants and rigging are **composed geometry** transcribed from the board
>   markup (`src/components/duel/Ship.tsx`, pinned by `design/fixtures/ship-prototype.json`).
> - A raster ships only if it is **byte-identical to an image the artifacts embed** — nine files,
>   enumerated in [`assets/README.md`](assets/README.md), enforced by `__tests__/app/sprites.test.ts`.
> - `assets/source/` is decommissioned. Do not draw from it.
>
> This is not a stylistic preference. A-013 read §7.1 below as a standing instruction, pulled seven
> hulls and eleven other files out of the Kenney pack, and repainted the duel with ships that appear
> in neither board. Everything from "§7.1 Sources" to the end of §7 is retained for the licensing
> research and the rejected-options record, both of which are still worth having.

The visual style is **bright, chunky, flat-shaded low-poly**, delivered as pre-rendered 2D sprites. This section is the whole art plan; there is no in-app 3D (§3.3).

### 7.1 Sources — all CC0, $0 *(historical — see the note above)*

| Pack                                                                 | Contents                                                                                                                                          | License |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| [Quaternius Pirate Kit](https://quaternius.com/packs/piratekit.html) | 71 models — ships, dock, cannon, chests, coins, gems, barrels, palms, rocks, houses, shark, **tentacle**, 5 animated pirate characters, skeletons | **CC0** |
| [Kenney Pirate Kit](https://kenney.nl/assets/pirate-kit)             | 70+ naval assets, modular ship parts, treasure, terrain                                                                                           | **CC0** |
| [Kenney Pirate Pack (2D)](https://kenney.nl/assets/pirate-pack)      | 190 finished 2D sprites — **the parachute** if the Blender step ever stalls                                                                       | **CC0** |

CC0 means no attribution obligation, no license text to comply with, and no redistribution question about pre-rendering to sprites. Both 3D packs ship glTF/GLB natively. Quaternius is the base style; Kenney fills gaps — the two mix well (both flat-shaded, saturated, comparable poly budgets). **Do not mix in a third house style** (Synty in particular reads weathered and adult next to these, and its prop inventory is wall-to-wall cutlasses and blunderbusses — wrong register for K-5).

**The two gaps, solved without shopping:** the _ghost ship_ is a standard hull with a translucent cyan-white emissive material, rendered as a separate sprite. The _kraken_ is Quaternius' tentacle duplicated and rotated into a cluster around a ship — which reads better at K-5 than a full monster and stays perfectly in style. No pack at any price ships a matching sea monster, so this is the answer rather than a compromise.

**Rejected, with reasons worth remembering:** true voxel is a genuine market gap — the one good voxel pirate pack (monogon, €12.95) is **CC BY-ND**, and NoDerivatives forbids pre-rendering it to sprites at all. MagicaVoxel is abandoned on macOS (0.99.6.2, 2020, Intel-only — unusable on Apple Silicon). AI 3D generation (TRELLIS.2, Hunyuan3D) works per-asset but has a _consistency_ problem across a set that costs roughly the half-day the packs hand over free — kept in reserve as a day-3 gap-filler only, never as the day-1 pipeline.

### 7.2 The render pipeline

One Blender file, `tools/studio.blend`, built once and never re-aimed — consistency comes free because the camera and lights are constants:

1. **Orthographic camera**, side view, transform locked. Ortho keeps low-poly reading cleanly and guarantees every asset shares a scale.
2. **Three-point light rig** (key \+ fill \+ rim), locked.
3. **Film → Transparent**, so every PNG carries alpha.
4. Fixed square output (1024×1024) and a fixed world-space "stage" box so each asset fills the frame identically.
5. Import GLB → drop on the stage → render → next.

Setup is \~1–2 hours (Blender 5.1, free); **each asset after that is 5–20 minutes**, and animated strips are \~1–2 hours for the first and 20–30 minutes thereafter via the official [Sprite Sheet Maker](https://extensions.blender.org/add-ons/sprite-sheet-maker/) extension. A complete MVP art set is 4–8 hours total.

Crucially the pipeline is **incremental**: grey boxes ship on day 1 and real renders swap in one at a time, any hour of any day, with no code change beyond the asset path. Real-time 3D has no such property — it's all-or-nothing, which is the other half of why it lost.

### 7.3 Output conventions

Sprites are WebP, alpha preserved, **≤2048 px on any side** (some Android decoders get unhappy above that — wrap long strips into a grid rather than one wide row). Loaded via `expo-image`. Naming is `<subject>_<state>@<n>.webp` with frame count in the name for strips, so the `Easing.steps` component can assert its frame count against the file. Everything lives under `assets/sprites/`, referenced through a typed `assets/index.ts` manifest so a missing file is a TypeScript error, not a blank rectangle at runtime.

## 8. Project structure

```
cannon-academy/
├── app/                    # expo-router screens
│   ├── _layout.tsx         # hydration gate + safe area + portrait lock
│   ├── onboarding.tsx      # grade picker → name/flag → guided duel
│   ├── map.tsx             # sea chart
│   ├── duel.tsx
│   ├── range.tsx           # practice / mastery drills
│   ├── harbor.tsx          # shop (day 4 — the coin sink)
│   ├── ranks.tsx           # ladder + leaderboard
│   ├── dev.tsx             # tuning sliders + "grant progressed captain" (hidden)
│   └── ui-kit.tsx          # every primitive on one screen (hidden)
├── src/
│   ├── engine/             # PURE TS — no React imports (lint-enforced)
│   │   ├── rng.ts          # seeded mulberry32
│   │   ├── questions/      # template types, generator, distractors, safe constraint eval
│   │   ├── duel/           # DuelState, events, reducer, damage
│   │   ├── opponents/      # Opponent interface, bots, mercy, scripted rival
│   │   ├── economy.ts      # payouts, chest rarity rolls
│   │   ├── mastery.ts      # meters, thresholds, unlocks
│   │   └── tuning.ts       # every magic number, one file
│   ├── content/            # JSON catalogs + zod schemas
│   ├── stores/             # Zustand: player (persisted), duel (wraps reducer + driver)
│   ├── services/           # firebase.ts, sync.ts, audio.ts
│   ├── components/         # ships, cannonball layer, answer grid, hull bars, SpriteStrip
│   └── theme/              # design tokens — colors, spacing, radii, type
├── assets/
│   ├── sprites/            # rendered WebP + typed index.ts manifest
│   ├── lottie/
│   └── audio/
├── tools/
│   └── studio.blend        # the locked render rig
└── __tests__/              # engine + catalog golden tests
```

## 9. Testing strategy

Effort goes where regressions hurt a child or a demo:

1. **Template golden tests** (highest value): every template × 1,000 seeded samples → constraints satisfied, answer correct, params in range, text renders, **distractors all distinct and none equal to the answer**. Catches the "game teaches wrong math" catastrophe class at commit time.
2. **Duel reducer tests**: scripted event sequences → expected state paths (win, loss, timeout, volatile backfire, perfect shot, double-shot), plus an invariant fuzz (random valid event streams never produce negative hull/coins, a stuck state, or an out-of-phase transition).
3. **Economy/mastery tests**: payout math, chest rarity distribution over seeded rolls, threshold unlocks.
4. **Component tests: minimal.** The UI is thin by design; manual playtesting on-device covers it. A daily 10-minute scripted playtest checklist (onboarding → duel → loss → range → unlock → relaunch) is the day 3–5 QA ritual.

CI: none for a 5-day solo project — `npm test` is a pre-commit habit instead.

## 10. Build & release pipeline

- **Dev loop: development build, not Expo Go** (§6). Day 1: `npx expo prebuild` is not needed — EAS builds the dev client from the managed project; install the Android APK on a physical device, run the iOS Simulator alongside, iterate with `npx expo start --dev-client`.
- **EAS profiles:** `development` (dev client, Android APK \+ iOS Simulator build), `preview` (Android release APK → **Firebase App Distribution**), `production` (iOS → **TestFlight internal**, no review, \~15 min processing — contingent on Apple activation).
- **Web:** `npx expo export --platform web` → Firebase Hosting. Not free: `lottie-react-native` on web needs `@lottiefiles/dotlottie-react` installed or the bundle fails to resolve, and expo-haptics is a silent no-op on desktop/iOS Safari (acceptable). Add the dep now and put a **web-export smoke test** in day 4 — don't discover it Saturday.
- **Committed submission path:** Android APK link \+ web link. TestFlight is upside, never the critical path.
- **Apple Developer:** enrollment created but unpaid. Pay day 1; activation takes 24–48h. Nothing on the committed path depends on it.

## 11. Privacy note

The safe-by-construction posture falls out of the design rather than requiring work: anonymous auth, no email, no chat or free text beyond the captain name (wordlist filter), no ads, no IAP, no analytics SDK. All art is CC0, so there is no asset attribution obligation either. One line for the writeup — "no PII collected, nothing to secure" — and we move on.

## 12. Risks & mitigations (architecture-level)

| Risk                                                 | Mitigation                                                                                                                                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duel feel needs endless tuning                       | All constants in `tuning.ts` \+ hidden dev slider screen (`dev.tsx`, day 1); feel work never requires a rebuild                                                                     |
| Dev build fights us on day 1                         | 90-minute timebox, then fall back to Simulator/emulator (JS-only iteration is unaffected) and retry in the evening                                                                  |
| Blender defeats a first-timer                        | Fallback is Kenney's 190-sprite 2D Pirate Pack — ship on free 2D art, lose only the low-poly look. Route's fallback costs nothing; real-time 3D's fallback would have cost two days |
| Anonymous UID rotates on cold start                  | `initializeAuth` \+ `getReactNativePersistence(AsyncStorage)` day 1; day-2 checklist asserts same-UID-after-relaunch                                                                |
| AsyncStorage hydration race on launch                | Root layout gates on `hasHydrated`; splash held until rehydrated                                                                                                                    |
| Async Opponent ↔ sync reducer races                  | Turn-token discard \+ out-of-phase no-op events \+ teardown cancellation (§4.2)                                                                                                     |
| Firestore transport hangs on RN                      | Auto-detect long-polling on; every write fire-and-forget with catch                                                                                                                 |
| Offline writes lost (memory-only cache)              | Idempotent full-profile `setDoc` from local state on every boundary \+ foreground; profile self-heals                                                                               |
| A template generates a wrong answer / bad distractor | Golden tests make it a commit-time failure, not a runtime one                                                                                                                       |
| Reinstall/device-switch orphans cloud progress       | Accepted for showcase; never demo from a reinstalled device with an account you care about                                                                                          |
| Art/juice creep eats content days                    | The §0 checklist is the finite juice budget; sprite work is incremental and interruptible by construction                                                                           |

## 13. Future architecture (documented, not built)

- **Async PvP ("ghost captains")**: duels record `seed` \+ an ordered per-volley action log; a ghost replays a real player's recorded actions through the existing `Opponent` interface. No netcode — just reads.
- **Real-time PvP**: turn-based cadence tolerates a Firestore-doc-per-duel sync (\~1 write per turn); the reducer's event stream is already the wire protocol.
- **Server-validated economy**: Cloud Functions recomputing payouts from the submitted action log (the seed \+ log make them verifiable).
- **Teacher dashboard**: mastery is already per-skill in Firestore; a web view over it is a weekend, not a rewrite.
- **Email-linked parent accounts**: Firebase anonymous → credential linking (also the fix for reinstall progress loss).
- **Real-time 3D, if it ever earns its place**: the sprite pipeline's Blender source models are glTF, so a future 3D renderer — most likely Skia \+ WebGPU rather than expo-gl, given where that ecosystem is heading — would reuse the same assets rather than restart the art.
