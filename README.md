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

Integration branch: **`app/shell`**. Engine track: **`swarm/engine-core`**. Neither repository is a
full mirror of the other: GitHub `main` and GitLab `main` intentionally differ, and GitHub
[PR #2](https://github.com/worldofhacks/Cannon-Academy/pull/2) (`app/shell` → `main`) stays open for
**owner review only** — do not merge it from an agent session.

The production web bundle currently served at the alias was built from commit **`28f4ccc`**. Local
`app/shell` may be ahead with documentation and later tickets; that does not mean `app/shell` is on
`main`.

---

## What ships today

Verified against routes and engine content on `app/shell` (2026-07-29):

- **Playable loop:** splash → grade picker → captain name/flag → sea chart → duel → coins →
  gunnery range → mastery unlock → gun deck (equip) → duel again.
- **Routes:** `/`, `/onboarding`, `/name-flag`, `/chart`, `/duel`, `/guided-duel`, `/gun-deck`,
  `/range`.
- **Catalog:** 9 skills, 72 question templates, 11 cannons, 5 islands.
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

Do not treat design text, service seams, or green unit tests as product completion.

| Area                                      | State                                                       | Owning work  |
| ----------------------------------------- | ----------------------------------------------------------- | ------------ |
| Guided first duel                         | Reachable stub; teaching hold/depth incomplete              | A-015        |
| Mercy / adaptive bot                      | Engine opponents exist; not wired as the live duel rival UX | A-030        |
| Harbor / spend coins                      | Not built                                                   | A-010, A-033 |
| Ranks / meta screen                       | Not built                                                   | A-012, A-038 |
| Island & rival variety                    | Thin vs PLAN encounters                                     | A-029, A-031 |
| Training choice / difficulty labels       | Partial; band-safety and UX still open                      | A-027, A-028 |
| Firebase anonymous boot session           | Client exports exist; **not** mounted in `app/_layout.tsx`  | A-026        |
| Firestore profile sync / Storage gameplay | Not used; local AsyncStorage remains authoritative          | A-040        |
| Tablet / desktop responsiveness           | Open                                                        | A-043        |
| Harbor chest / acquisition polish         | Open                                                        | A-032, A-041 |

Final cross-doc reconciliation after those features land is **A-036** (still backlog). This README
is the A-044 reviewer baseline, not an evergreen claim.

---

## Hosting and backend (separate facts)

**Web production = EAS Hosting only**

| URL                                           | Role                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| <https://cannon-academy.expo.app>             | Production alias                                                       |
| <https://cannon-academy--wejre1bucz.expo.app> | Immutable A-042 deployment (`28f4ccc`) — probed HTTP 200 on 2026-07-29 |
| <https://cannon-academy--2f4tf1erk3.expo.app> | Preceding immutable rollback target — probed HTTP 200 on 2026-07-29    |

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

## Repository mirrors (inspected 2026-07-29)

| Remote          | URL                                                           | `app/shell`           | `swarm/engine-core` | `main`    |
| --------------- | ------------------------------------------------------------- | --------------------- | ------------------- | --------- |
| GitHub `origin` | <https://github.com/worldofhacks/Cannon-Academy>              | `448f233` (inspected) | `7ffeb6e`           | `aea6fe2` |
| GitLab `gitlab` | <https://labs.gauntletai.com/alexander.miller/Cannon-Academy> | `448f233` (inspected) | `7ffeb6e`           | `aea6fe2` |

The deployed web bundle remains `28f4ccc` until a new EAS promote. Re-run `git ls-remote` after
later pushes.

---

## Documents — what is current vs historical

| Document                                                                                                            | Role                                                          |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `tickets/INDEX.md`                                                                                                  | **Only** live cross-track ticket status (generated)           |
| `README.md` / `RELEASE.md` / `tickets/app/HANDOFF.md`                                                               | Current reviewer / ops surfaces                               |
| `PLAN.md`, `ARCHITECTURE.md`, `COORDINATION.md`, `TICKETS.md`, `tickets/app/APP-TICKETS.md`, `tickets/app/STATE.md` | Historical or target-design — see banners at top of each file |

Asset and design-board provenance notes: [`assets/README.md`](assets/README.md),
[`design/boards/README.md`](design/boards/README.md).
