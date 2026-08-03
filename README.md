# Cannon Academy

**Math on the High Seas** — a K–5 game where solving math powers every action on your ship.

Turn-based naval duels: pick a cannon, answer its math question during the reload, and a correct
answer fires the volley. Answer speed aims the shot. Harder cannons demand harder problems and hit
harder. Master a skill at an island's gunnery range to unlock its cannon and sail on.

**Play the live web build:** <https://cannon-academy.expo.app>

---

## Start here

| Need                                   | Go to                                                         |
| -------------------------------------- | ------------------------------------------------------------- |
| Live app (EAS Hosting)                 | <https://cannon-academy.expo.app>                             |
| Ticket status (canonical)              | [`tickets/INDEX.md`](tickets/INDEX.md)                        |
| Architecture / target design           | [`ARCHITECTURE.md`](ARCHITECTURE.md)                          |
| Build, deploy, rollback                | [`RELEASE.md`](RELEASE.md)                                    |
| Dated ops snapshot                     | [`tickets/app/HANDOFF.md`](tickets/app/HANDOFF.md)            |
| Original pitch & schedule (historical) | [`PLAN.md`](PLAN.md)                                          |
| GitHub mirror                          | <https://github.com/worldofhacks/Cannon-Academy>              |
| GitLab mirror                          | <https://labs.gauntletai.com/alexander.miller/Cannon-Academy> |

Development lands on **`main`** (waves G6–G13). `app/shell` and `swarm/engine-core` remain as
historical track branches. Neither repository is a full mirror of the other — branch sets and
merge-request state intentionally differ — and GitHub
[PR #2](https://github.com/worldofhacks/Cannon-Academy/pull/2) (`app/shell` → `main`) stays
**owner review only** — do not merge it from an agent session.

The hosted web bundle now matches the repository: the production alias serves immutable
deployment `24prch14ju`, built from `main` @ `bf9df3d` and promoted 2026-08-03 after all-route
verification. The A-042 release commit **`28f4ccc`** remains available as immutable deployment
`wejre1bucz` (committed A-044 record) — see the hosting section
below for the 2026-08-03 probes.

---

## What ships today

Verified against `app/` routes and the `src/content/` catalog on `main` (2026-08-03):

- **Playable loop:** splash → grade picker → captain name/flag → sea chart → duel → coins →
  gunnery range → mastery unlock → gun deck (equip) → duel again. A win now **advances the
  voyage** (A-062): the ship sails to the island it just earned (A-063), the arrival ceremony
  plays (A-065), and the island's host offers a riddle encounter (A-066).
- **Routes:** `/`, `/onboarding`, `/name-flag`, `/chart`, `/duel`, `/guided-duel`, `/gun-deck`,
  `/range`, `/harbor`, `/rank`, `/fleet`, `/uncharted`.
- **Catalog:** 14 skills, 112 question templates, 16 cannons, and 5 charted islands, each carrying
  a per-band curriculum (ruling D-14: the K–1, 2–3 and 4–5 bands each sail five islands of their
  own, Common-Core-aligned) — plus a 20-ship generated rival fleet.
- **Island hosts:** six — Nipper the crab, Pip the parrot, Tumble the turtle, Ollie the octopus,
  Gale the gull, and Lumen the lanternfish, who greets the **Uncharted Sea**: the endless frontier
  of locally generated islands, gen duels and receipted rewards (no LLM involved — see
  limitations).
- **Harbor and Rank:** the Harbor sells ship skins (A-033 / A-055 — chest removed by owner
  ruling); the Rank screen shows trophies and a tier badge, private progress only (A-012 — ladder
  cut).
- **Duel rival:** the seeded bot with the Mercy system is wired as the live opponent (A-030), with
  band-safe Training choice on the range (A-027 / A-028).
- **Engine:** pure TypeScript duel reducer, damage, mastery, drill, placement, economy; Vitest in a
  `node` environment (headless logic — not component rendering).
- **Timeouts (D-8):** free in both lanes — duel store and `answerDrill(..., null)` / T-036. A
  timeout does not charge mastery.
- **Tray:** `TRAY_CAPACITY = 3` with gun-deck loadout.

Run the suite locally rather than trusting a copied total:

```bash
npx vitest run
```

---

## Current limitations (not shipped)

Do not treat design text, service seams, or green unit tests as product completion. Earlier rows
here — the Guided first duel, the Harbor, the Ranks screen, the Mercy rival, Training choice, and
island variety — shipped across waves G1–G13 and moved up to "What ships today". What genuinely
remains:

| Area                                      | State                                                                                                                                                                                         | Owning work     |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Adaptive / LLM island generation          | **Designed, not implemented** — `docs/ADAPTIVE-ISLANDS-PLAN.md` and `docs/ENDLESS-ARCHIPELAGO-DESIGN.md` are target design; Uncharted Sea generation is local and deterministic, no LLM wired | plan docs       |
| Firebase anonymous boot session           | Client exports exist; **not** mounted in `app/_layout.tsx` — the game is fully offline/local                                                                                                  | A-026           |
| Firestore profile sync / Storage gameplay | Not used; local AsyncStorage remains authoritative                                                                                                                                            | A-040           |
| Guided-duel teaching depth                | Step 1 of 3 is scripted; steps 2–3 wait on the design brief (`design/GUIDED-DUEL-BRIEF.md`)                                                                                                   | A-015 follow-up |
| Ranks ladder                              | Cut by owner ruling — the Rank screen shows private progress only                                                                                                                             | A-012 ruling    |
| Tablet / desktop polish                   | Responsive surfaces shipped (A-043); one known-red fixture remains in the accepted test baseline                                                                                              | A-043           |
| Hosted web build                          | Current as of 2026-08-03: the alias serves `main` @ `bf9df3d` (deployment `24prch14ju`, all 12 routes probed live). Redeploy is a manual owner-gated step — see `RELEASE.md`                  | `RELEASE.md`    |

Final cross-doc reconciliation after those features land is **A-036** (still backlog). This README
is the A-044 reviewer baseline, not an evergreen claim.

---

## Hosting and backend (separate facts)

**Web production = EAS Hosting only**

| URL                                           | Role                                                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| <https://cannon-academy.expo.app>             | Production alias — serves immutable deployment `24prch14ju`, built from `main` @ `bf9df3d` (all 12 routes incl. `/fleet` and `/uncharted` HTTP 200, probed 2026-08-03 post-promotion) |
| <https://cannon-academy--24prch14ju.expo.app> | Immutable current-production deployment — built from `bf9df3d`, promoted to the alias 2026-08-03 after all-route verification                     |
| <https://cannon-academy--wejre1bucz.expo.app> | Immutable A-042 release deployment — code `28f4ccc` per the committed A-044 record; HTTP 200 probed 2026-08-03                                    |
| <https://cannon-academy--2f4tf1erk3.expo.app> | Immutable rollback target preceding A-042 (committed A-044 record); HTTP 200 probed 2026-08-03                                                    |
| <https://cannon-academy--waa9davmr9.expo.app> | Later immutable deployment recorded 2026-07-29 as carrying `5147e38`; HTTP 200 probed 2026-08-03                                                  |

Firebase is **not** a second web host (`firebase.json` has rules only, no `hosting` block).
Railway is not part of this architecture. Promote/rollback commands live in [`RELEASE.md`](RELEASE.md).

**Firebase — four different states**

1. **Client exports** — `src/services/firebase.ts`, `src/services/auth.ts`; six public
   `EXPO_PUBLIC_FIREBASE_*` names in `.env.example`; values live in ignored `.env.local` / EAS env.
2. **Provisioned project** — project id `cannon-academy`; Firestore permanent location `nam5`;
   default Storage bucket `cannon-academy.firebasestorage.app` in `us-central1`; shipped
   `firestore.rules` / `storage.rules` are deny-all; Blaze billing is active for Storage.
3. **Anonymous boot session** — **not wired** into app startup.
4. **Profile sync / Storage gameplay** — **not used**. Local play and AsyncStorage remain
   authoritative.

---

## Quick start (local Expo)

```bash
npm install
npx expo start
```

iOS Simulator note: the repo path contains a space and breaks some Xcode script phases. Use the
space-free worktree documented in [`RELEASE.md`](RELEASE.md).

```bash
npx expo run:ios --device "iPhone 17 Pro"   # from the space-free worktree
```

Development builds are required (App Store Expo Go is an older SDK).

---

## Repository mirrors

| Remote          | URL                                                           |
| --------------- | ------------------------------------------------------------- |
| GitHub `origin` | <https://github.com/worldofhacks/Cannon-Academy>              |
| GitLab `gitlab` | <https://labs.gauntletai.com/alexander.miller/Cannon-Academy> |

As of 2026-08-03 both remotes carry `main` in sync (waves G8–G13 pushed). The repositories are
still **not a full mirror** of each other — historical track branches (`app/shell`,
`swarm/engine-core`) and merge-request state differ, and GitHub
[PR #2](https://github.com/worldofhacks/Cannon-Academy/pull/2) stays owner-review only. Re-run
`git ls-remote` before quoting a tip commit.

---

## Documents — what is current vs historical

| Document                                                                                                            | Role                                                          |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `tickets/INDEX.md`                                                                                                  | **Only** live cross-track ticket status (generated)           |
| `README.md` / `RELEASE.md` / `tickets/app/HANDOFF.md`                                                               | Current reviewer / ops surfaces                               |
| `PLAN.md`, `ARCHITECTURE.md`, `COORDINATION.md`, `TICKETS.md`, `tickets/app/APP-TICKETS.md`, `tickets/app/STATE.md` | Historical or target-design — see banners at top of each file |

Asset and design-board provenance notes: [`assets/README.md`](assets/README.md),
[`design/boards/README.md`](design/boards/README.md).
