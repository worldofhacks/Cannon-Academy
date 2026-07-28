# Cannon Academy

**Math on the High Seas** — a K-5 educational game where solving math powers every action on your ship.

Turn-based naval duels: pick a cannon, answer its math question during the reload, and a correct answer fires the volley. Answer speed aims the shot. Harder cannons demand harder problems and hit harder. Master a skill at an island's gunnery range to unlock its cannon and sail on. You're a young captain — the pirates, ghost ships, and krakens are the enemy.

Solo build, 5-day timebox. **Day 1 is Tuesday July 28, 2026. Submission is Saturday August 1.**

---

## Status

Planning is complete and adversarially reviewed. Nothing is open; the next action is code.

| Artifact                                           | State                                                 |
| -------------------------------------------------- | ----------------------------------------------------- |
| Concept, name, differentiation                     | Locked (`PLAN.md`)                                    |
| Game design + 5-day schedule                       | Locked (`PLAN.md`)                                    |
| Technical architecture                             | Locked (`ARCHITECTURE.md`)                            |
| UI approach + art pipeline                         | Locked (`ARCHITECTURE.md` §3.6, §7)                   |
| Adversarial review (schedule / technical / design) | Complete — findings folded in                         |
| Repo scaffold                                      | Complete (Vitest + TS strict + lint gates)            |
| Engine core (`src/engine/`, `src/content/`)        | **Waves 1–2 merged, wave 3 in review ← you are here** |

## Documents

- **`PLAN.md`** — the pitch, game design (duel loop, armory, mastery, economy, encounters), the 2-day MVP milestone with its definition of done, the day-by-day schedule, risks, and the competitive/similarity audit. Read this for _what_ we're building.
- **`ARCHITECTURE.md`** — every stack layer with options considered, the decision, and revisit conditions; UI structure and design tokens; the art pipeline; the engine design (question templates, duel state machine, damage model); backend schema and known React Native gotchas; testing, builds, project structure. Read this for _how_.

## The decisions, at a glance

|                  |                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| **Genre**        | Turn-based naval duel, question-gated volleys                                                             |
| **Platform**     | Expo SDK 57 / RN 0.86 / TypeScript strict, portrait-locked                                                |
| **Dev loop**     | **Development build, not Expo Go** (App Store Expo Go is SDK 54) — Android dev client first               |
| **Rendering**    | Plain RN Views + Reanimated 4.5 + pre-rendered sprites + Lottie — no game engine, no 3D runtime           |
| **Art**          | Free CC0 low-poly packs rendered to 2D sprites in Blender from one locked camera                          |
| **State**        | Zustand + pure reducers; `src/engine/` has zero React imports                                             |
| **Answer input** | Four-choice taps, universally (mobile smoothness, K-friendly, one input for every skill)                  |
| **Backend**      | Firebase JS SDK v12+ — anonymous auth + Firestore, local-first sync                                       |
| **Placement**    | Grade picker at onboarding (K-1 / 2-3 / 4-5) pre-unlocks content to band                                  |
| **Opponents**    | Bots behind one `Opponent` interface — the seam a remote player fills later                               |
| **Distribution** | Android APK via Firebase App Distribution + web build (committed); TestFlight if Apple activates (upside) |

## MVP definition of done (end of day 2)

Everything here must be green. Nothing here may slip. Grey-box art passes; sound is banned until day 3.

- [ ] Fresh install → grade picker → name/flag
- [ ] Guided first duel, winnable, cannot hurt you
- [ ] Sea chart → win a real duel vs a bot (four-choice answers, speed-aimed volleys, two starter cannons that are a genuine choice)
- [ ] Coins paid on victory
- [ ] Practice drill fills a mastery meter
- [ ] Meter crossing unlocks the next cannon
- [ ] Lose a duel: small purse, rank intact, hull reset
- [ ] Time out a question: misfire, duel continues
- [ ] Kill the app mid-duel → relaunch lands safely on the map, progress intact
- [ ] Normal close/reopen: progress persisted, **same anonymous UID**

**Cut in this order if behind:** chest ceremony → plain coin payout · second island → day 3 · Firestore sync → day 4 · scripted tutorial → plain easy first duel.

## Pre-flight (before writing code)

1. **Pay the Apple Developer $99** — enrollment is created but unpaid; activation takes 24–48h and TestFlight is blocked until it clears. Android + web remain the committed path either way.
2. **Kick off the EAS dev-client build for Android** — 90-minute timebox. Expo Go is _not_ the dev loop for this project (see below). Simulator/emulator is the fallback and blocks no JS work.
3. **Create the Firebase project** — anonymous auth enabled; grab the web config.
4. **Download the art packs** (free, CC0, no account needed): [Quaternius Pirate Kit](https://quaternius.com/packs/piratekit.html), [Kenney Pirate Kit](https://kenney.nl/assets/pirate-kit), [Kenney Pirate Pack 2D](https://kenney.nl/assets/pirate-pack) (the parachute).
5. Confirm `npm`, Node LTS, Blender 5.1, and an EAS account are ready.

## Day 1 targets

Scaffold with portrait lock, safe areas, and `theme/` tokens · question-template engine with four-choice output and golden tests · duel state machine as a pure reducer · duel screen (cannon select, timer, 2×2 answer grid at ≥64pt, speed-biased damage, hull bars) · victory, defeat, and timeout flows · local persistence with hydration gating · Firebase auth with `initializeAuth` persistence · `dev.tsx` tuning sliders + "grant progressed captain" button.

Grey-box art. No sound, no screen shake. Juice starts day 3.

## Traps already identified — don't rediscover them

- **Expo Go won't work.** The iOS App Store build is 54.0.2 (Sept 2025) and supports SDK 54, not 57; Expo now calls it "an educational tool." Use a development build — one 15-minute EAS build, then the loop is identical.
- **`initializeAuth` + `getReactNativePersistence(AsyncStorage)` is mandatory.** The Firebase JS SDK defaults to in-memory auth on RN and will mint a new anonymous UID on every cold start — silently forking cloud identity while local progress looks fine.
- **Gate the root layout on Zustand's `hasHydrated`.** AsyncStorage rehydration is async; an ungated redirect fires against empty state.
- **The leaderboard is a separate public `leaderboard/{uid}` mirror**, not a query over `users` — rules aren't filters, and world-readable `users` would expose every child's profile. `rankTier` is numeric so the ladder sorts.
- **Pin `firebase@^12`** and skip the obsolete `unstable_enablePackageExports=false` Metro workaround.
- **`lottie-react-native` on web needs `@lottiefiles/dotlottie-react`** or the export fails to resolve.
- **Bot promises need a turn token** — discard resolutions whose token no longer matches the current turn.
- **Don't buy the voxel pirate pack.** monogon's is CC BY-**ND** — NoDerivatives forbids pre-rendering it to sprites. The free CC0 packs have no such restriction.

Full context for each is in `ARCHITECTURE.md`.

## Credits

All art is CC0 (public domain) from [Quaternius](https://quaternius.com/) and [Kenney](https://kenney.nl/) — no attribution required, but both deserve it anyway.
