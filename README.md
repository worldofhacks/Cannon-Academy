# Cannon Academy

**Math on the High Seas** — a K–5 educational game where solving math powers every action on your ship.

Turn-based naval duels: pick a cannon, answer its math question during the reload, and a correct answer fires the volley. Answer speed aims the shot. Harder cannons demand harder problems and hit harder. Master a skill at an island's gunnery range to unlock its cannon and sail on.

Solo build on a five-day Gauntlet timebox (opened 2026-07-28). **Current product and ticket
truth live on `app/shell`:** [`README.md`](https://github.com/worldofhacks/Cannon-Academy/blob/app/shell/README.md),
[`tickets/INDEX.md`](https://github.com/worldofhacks/Cannon-Academy/blob/app/shell/tickets/INDEX.md),
live web <https://cannon-academy.expo.app>. This engine-checkout README is a thin run pointer.

---

## How to run

The main repo path contains a space (`…/Math Game/…`) and **iOS build scripts break on it**. Always run Metro / `expo` from the space-free iOS worktree:

```bash
# one-time
git worktree add --detach ~/Documents/Dev/Gauntlet/cannon-academy-ios app/shell

# each session
cd ~/Documents/Dev/Gauntlet/cannon-academy-ios
git fetch origin && git checkout --detach origin/app/shell
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
npx expo start --port 8081
# or: npx expo run:ios --device "iPhone 17 Pro"
```

Details and device / TestFlight paths: `~/Documents/Dev/Gauntlet/cannon-academy-ios/RELEASE.md`.

Engine / unit gates from either worktree:

```bash
npm test          # vitest
npx tsc --noEmit
```

Integration branches: **`app/shell`** (player app) · **`swarm/engine-core`** (pure engine). Neither merges to `main` without an owner-approved PR.

---

## Known limitations (submission cut)

| Deferred                 | Why                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| **A-010** chest ceremony | PLAN's own first cut — plain coin payout already works                                                   |
| **A-012** rank screen    | Meta / day-4; not Milestone 1                                                                            |
| **A-013** fidelity pass  | Range, name-flag, and duel-intro boards not fully transcribed; placeholders + design-system screens ship |
| **Firestore sync**       | Local persistence (AsyncStorage) only for the checklist; cloud identity sync deferred                    |

Owner rulings that shape the build: **D-6** (placement = starters only), **D-7** (K-1 practice lane pays), **D-8** (timeout charges nothing — duel + range).

---

## What works

Cold start → grade picker → name & flag → sea chart → duel (real catalog questions) → rewards persist → gunnery range → mastery → unlock. Gun deck chooses which cannons sail (`TRAY_CAPACITY` from the engine).

---

## Documents

- **`PLAN.md`** — pitch, game design, MVP checklist, schedule
- **`ARCHITECTURE.md`** — stack, engine, UI, persistence
- **`COORDINATION.md`** — engine ↔ app track contract and published APIs
- **`TICKETS.md`** / **`tickets/app/APP-TICKETS.md`** — engine and app ticket indexes
- **`tickets/app/OWNER-RULINGS.md`** — D-6 / D-7 / D-8

## The decisions, at a glance

|                  |                                                                             |
| ---------------- | --------------------------------------------------------------------------- |
| **Genre**        | Turn-based naval duel, question-gated volleys                               |
| **Platform**     | Expo SDK 57 / RN 0.86 / TypeScript strict, portrait-locked                  |
| **Dev loop**     | **Development build, not Expo Go** — run from the space-free iOS worktree   |
| **Rendering**    | Plain RN Views + Reanimated + sprites — no game engine                      |
| **State**        | Zustand + pure reducers; `src/engine/` has zero React imports               |
| **Answer input** | Four-choice taps                                                            |
| **Backend**      | Local-first persistence for MVP; Firebase/Firestore deferred                |
| **Placement**    | Grade picker (K-1 / 2-3 / 4-5) pre-unlocks starters + islands to band (D-6) |
| **Opponents**    | Bots behind one `Opponent` interface                                        |
