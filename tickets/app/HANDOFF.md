# App track — handoff

Verification date: 2026-07-29 (afternoon, America/Chicago).

**Supersedes** older noon-deadline and agent-recovery snapshots in git history.

Live ticket lifecycle: [`tickets/INDEX.md`](../INDEX.md) only. Do not treat wave tables in
`APP-TICKETS.md` or `STATE.md` as current.

---

## 1. Where the code and deploy are

|                          |                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| Integration branch       | `app/shell` (worktree `.worktrees/wt-app`)                                                   |
| Engine branch            | `swarm/engine-core`                                                                          |
| Described docs tip       | whatever `git rev-parse --short HEAD` prints in this worktree after the A-044 commit         |
| Deployed web bundle      | **`28f4ccc`** (may lag docs HEAD)                                                            |
| Production alias         | <https://cannon-academy.expo.app>                                                            |
| Immutable deploy (A-042) | <https://cannon-academy--wejre1bucz.expo.app>                                                |
| Preceding rollback       | <https://cannon-academy--2f4tf1erk3.expo.app>                                                |
| GitHub                   | <https://github.com/worldofhacks/Cannon-Academy>                                             |
| GitLab                   | <https://labs.gauntletai.com/alexander.miller/Cannon-Academy>                                |
| Owner PR                 | <https://github.com/worldofhacks/Cannon-Academy/pull/2> (`app/shell` → `main`, do not merge) |

Mirror tip check (re-run before claiming “pushed”):

```bash
git ls-remote origin refs/heads/app/shell refs/heads/swarm/engine-core refs/heads/main
git ls-remote gitlab refs/heads/app/shell refs/heads/swarm/engine-core refs/heads/main
```

On 2026-07-29 pre-doc-push, both remotes had `app/shell` at `4740d3d`, `swarm/engine-core` at
`91c013c`, GitHub `main` at `aea6fe2`, GitLab `main` at `b498a96`. Re-inspect after every push.

iOS space-free worktree: `/Users/quietguy/Documents/Dev/Gauntlet/cannon-academy-ios` — see
[`RELEASE.md`](../../RELEASE.md).

---

## 2. Canonical ticket frontier

```bash
node scripts/docs/build-ticket-index.mjs --check
# or open tickets/INDEX.md
```

Doc baseline tickets: **A-035** (index generator) then **A-044** (this reviewer baseline).  
**A-036** stays backlog until its feature dependencies finish — do not run it in parallel with
A-044-style landing edits.

Near-term product frontier (confirm statuses in INDEX, not here): band-safe training (A-027),
canonical duel core (A-039), responsive surfaces (A-043), Firebase session (A-026), guided duel
depth (A-015), harbor/ranks (A-010 / A-012).

---

## 3. Known limitations (honest)

- Guided duel route exists; teaching depth is incomplete (A-015).
- Mercy/adaptive bot not wired into the live app rival path (A-030).
- No harbor or ranks screens.
- Firebase client + deny-all rules exist; anonymous boot and profile sync are **not** on the
  play path; AsyncStorage is authoritative.
- Tablet/desktop layout contract open (A-043).
- Headless Vitest only — UI crashes have shipped past green suites before; smoke the running app.

D-8 is implemented on `app/shell`: duel timeouts and range `answerDrill(..., null)` charge neither
`asked` nor `correct` (T-036 + A-017).

---

## 4. Exact next commands

```bash
# gates
npx prettier --check .
npx eslint . --max-warnings 0
npx tsc --noEmit
npx vitest run
node scripts/docs/build-ticket-index.mjs --check

# web / local
npx expo start
# or open https://cannon-academy.expo.app

# after an accepted app/shell commit
git push origin app/shell
git push gitlab app/shell
```

Promote/rollback: [`RELEASE.md`](../../RELEASE.md). Reviewer landing: [`README.md`](../../README.md).

---

## Historical snapshot (superseded — 2026-07-29 10:35)

> Retired ops narrative retained for incident and schedule archaeology. Not current.
> Live handoff is the section above this marker.

# App track — handoff, 2026-07-29 10:35

**Submission target: today, ~12:00.** Read this file, then `git log --oneline -15`, before anything.
Supersedes `STATE.md` (which is now stale — it predates the chart rebuild, D-8, A-016 and A-017).

---

## 1. Where the code is

|                    |                                                                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integration branch | **`app/shell`**, worktree `.worktrees/wt-app`, pushed and clean. Last code commit **`81ccba9`**; docs commits follow it — trust `git log`, not this cell                |
| Tests              | **2,014 passing across 40 files**                                                                                                                                       |
| Gates              | prettier, eslint, `tsc --noEmit` — all clean                                                                                                                            |
| iOS worktree       | `/Users/quietguy/Documents/Dev/Gauntlet/cannon-academy-ios` (space-free path; the main repo path contains a space and iOS build scripts break on it — see `RELEASE.md`) |
| Metro              | `npx expo start --port 8081` **from the iOS worktree**, not from `wt-app`                                                                                               |
| Re-sync iOS        | `git fetch && git checkout --detach app/shell` in that worktree, then reload the dev client                                                                             |

**Port 8081 caveat:** `.claude/launch.json` points at the iOS worktree. An agent that calls
`preview_start` may silently attach to _that_ checkout rather than to `wt-app`. Use a different port
if you need a second server.

---

## 2. What landed this morning

Five agents were running. **All four subagents died simultaneously on a session-usage limit**
(resets 1pm America/Chicago). Their work was salvaged from the worktrees and is all committed —
nothing was lost, but **no agent may be resumed**. Anything further needs fresh dispatches.

Landed since the last handoff:

- **`543a155` — the sea chart, rendered from its board.** `Blob.tsx` draws the board's CSS
  percentage `border-radius` as four SVG elliptical arcs, because RN's absolute-point `borderRadius`
  cannot express it and a rounded rectangle reads as a rounded rectangle, not as land.
- **The same commit closed the worst gap in the build.** A read-only demo-path audit found `/range`
  had **zero inbound navigation edges** — 499 shipped, tested lines (skill picker, live mastery
  meter, unlock celebration) that no child could reach. `/gun-deck` had none either, so a cannon
  unlocked at the range or in a duel could never be equipped. The chart dock now `push`es both
  (`push`, not `replace` — the range exits via `router.back()` and needs a stack entry).
- **`8ee28eb` — four emoji glyphs and a red screen.** Bare U+2693 defaults to emoji presentation on
  iOS, so the leave-duel anchor was a dark colour emoji on the dark `#0A4E70` chip: an invisible
  button in every duel. Three U+25B6/U+25C0 sites had the same exposure. All four now carry U+FE0E.
  The empty-tray guard `throw`ew — it now redirects through `resolveDestination`, which returns
  `gun-deck` for exactly that state.
- **`f613f52` — A-016, the duel specified at last.** 30 tests, all nine criteria, green on first run.
  Retrospective by design: 295 lines of shipped reducer under the MVP's largest checklist item that
  no ticket had ever specified.
- **`51b2cdd` + `81ccba9` — A-017 and ruling D-8.**

Then three docs commits carrying no code: `b92b97d` (this handoff), `cd5f8ca` (the hosting section
below, written after actually building and running the web bundle), `63a0fbc` (punch list re-ranked
around the noon hosting deadline).

**Work already done that you should NOT repeat:** the web bundle has been built and smoke-tested in
a browser — see §5A for exactly what was proven and what was not. Re-running the export is cheap and
fine; re-litigating whether web works is not a good use of the remaining window.

---

## 3. Owner rulings made today — both already implemented

### D-8: a timeout counts against nothing

Ruled in session. A burned fuse charges neither `asked` nor `correct`, in the aggregate scoreboard
and the per-skill tally alike. Recorded in `tickets/app/OWNER-RULINGS.md`; A-017's AC-1 and AC-5
amended; implemented in `src/stores/duel.ts`.

**The engine half is NOT done and is delegated.** `src/engine/drill.ts` still counts an expired
timer (`choiceIndex: null`) as an incorrect attempt. The range lane must not drift from the duel
lane. This was sent to the engine agent; **verify it landed.**

**A test dispute was adjudicated here, and the next agent should know why.** A-016's AC-8 probe was
authored against the pre-ruling behaviour and went red when D-8 landed. An owner decision that
postdates a test supersedes it, so the probe was _amended, not deleted_ — `TIMEOUT` is still the
narrowest path that could touch one counter and not the other, so a half-migration would still fail
there. The reasoning is in a comment at the test site.

### A-013 (sprite/fidelity pass): dropped

Owner ruled it out of the remaining window. Goes in known limitations.

---

## 4. Ticket state — 17 tickets, `tickets/app/APP-TICKETS.md`

| status                       | tickets                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **done**                     | A-001…A-009 (spine, identity, onboarding, name/flag, chart logic, duel payout, range), A-011 (gun deck), A-014 (real questions), A-016 (duel core), A-017 (timeout + D-8) |
| **open — the only real gap** | **A-015** guided first duel                                                                                                                                               |
| **dropped by owner**         | A-013 sprites/fidelity                                                                                                                                                    |
| **droppable, not started**   | A-010 chest ceremony, A-012 rank screen                                                                                                                                   |

### A-015 is the one thing left worth building

`app/guided-duel.tsx` is a **23-line stub** that marks the step complete and redirects to the chart.
A child finishing onboarding is shown nothing. It is MVP checklist item 4 ("an easy guided duel you
win") and the only place the mechanic is ever taught.

- Worktree exists: `.worktrees/wt-A-015`, branch `ticket/a-015`, **currently empty** (its Test Agent
  died before writing a line).
- Ticket is well-formed and its Planning Decisions already name the reducer change needed:
  `initialDuelState(seed, options?: { rivalHull?: number; hullFloor?: number })`, reducer clamps
  player hull to `hullFloor` (default `0`), both options default to today's behaviour.
- The engine side is ready and unused: T-018's `createScriptedOpponent`, and
  `ONBOARDING_ENEMY_HULL = 28` is tuned so the sloop sinks in three volleys.
- **AC-2 is the heart**: over every answer pattern — all-correct, all-wrong, all-timeout, and mixed
  — `playerHull > 0` and `phase !== 'defeat'` after _every_ transition.
- **Its exit must go through `resolveDestination`**, not a hardcoded `router.replace('/chart')`.
  The current stub hardcodes it, which is precisely the "second hardcoded opinion" bug class
  `app/index.tsx`'s header comment documents.

**Fallback if the clock beats you:** PLAN.md's own cut line is "scripted-tutorial polish → a plain
easy first duel". Keep the committed stub — it auto-advances safely — and move the guided duel to
known limitations. Do not ship a half-built one.

---

## 5. THE HIGHEST-PRIORITY REMAINING TASK — device verification

**Nothing has been run on a device since the chart rebuild, the glyph fixes, or D-8.**

This is not optional caution. **Two launch-blocking crashes in this project shipped past 1,800+
green tests** and were caught only by running the app:

1. `Splash.tsx` called `px()` inside a `useAnimatedStyle` body — a JS closure in a worklet, which
   crashes on the first frame. `react-native-web` does not enforce worklet boundaries, so every test
   passed.
2. `app/index.tsx` was a legacy title screen whose button bypassed onboarding entirely.

The chart rebuild introduced **four new animations** (ring pulse, ship bob, fog drift, sail-chip
rise) written by an agent that died before reporting. **Its worklet bodies have not been reviewed by
anyone.** Grep every `useAnimatedStyle` in `src/components/chart/` for calls to JS helpers before
anything else.

Run the demo script in §7 end to end on the simulator. Screenshot the chart.

---

## 5A. HOSTING — required live by 12:00 today

**Status: de-risked and proven, not yet deployed.** I built and smoke-tested the web bundle
locally before writing this. Findings below are measured, not assumed.

### What is already true

- `app.json` is fully configured for web: `"web": { "bundler": "metro", "output": "static" }`.
- `react-dom`, `react-native-web`, `@expo/metro-runtime` are all installed at correct versions.
- **The export works.** `npx expo export --platform web` succeeds in ~6s and emits **10 statically
  rendered routes**, 6.6 MB total (2.3 MB JS bundle):
  `/`, `/onboarding`, `/name-flag`, `/guided-duel`, `/chart`, `/duel`, `/gun-deck`, `/range`,
  `/_sitemap`, `/+not-found`.
- **The app RUNS on web with zero console errors.** Verified in a 375×812 viewport: the grade
  picker renders correctly (ships, math, band pips), tapping a ship advances to name-and-flag,
  choosing a flag and sailing advances again, and **the duel screen renders fully** — hull bars,
  both ships with the captain aboard, the cannon tray with damage bands and temper badges.
  Reanimated 4 worklets and `react-native-svg` both survive the web bundler. **This was the main
  hosting risk and it is retired.**
- The U+FE0E anchor fix is confirmed rendering correctly on the duel HUD.

### What is NOT yet verified

- **The rebuilt sea chart has not been seen rendered.** Navigation during the smoke test landed on
  `/duel` rather than the chart, and I ran out of budget before diagnosing it. **Verify the chart
  renders first, on both web and device.** It is the newest, least-observed screen in the build.
- Nothing has been run on a physical device or simulator since the chart rebuild (see §5).

### The one hosting requirement that will bite

A plain static file server returns **"Unmatched Route"** for a deep link like `/chart`, because the
export writes `chart.html` and there is no rewrite. Client-side navigation works fine — only direct
URL entry breaks. **The host must map extensionless paths to their `.html` files.** Confirmed by
reproduction with `python -m http.server`; do not use that as your smoke test and conclude routing
is broken.

### Recommended path — EAS Hosting (~10 minutes)

`eas.json` already exists and the project is EAS-linked, so this needs no new account and handles
expo-router static output natively:

```bash
cd "/Users/quietguy/Documents/Dev/Gauntlet/Math Game/.worktrees/wt-app"
npx expo export --platform web
eas deploy --prod
```

Returns a live `*.expo.app` URL. If `eas deploy` prompts for a project link, accept it.

**Fallbacks, in order**, if EAS Hosting stalls:

1. **Firebase Hosting** — `firebase` is already a dependency. Needs `firebase.json` with
   `"public": "dist"` and a rewrite of `**` → `/index.html`, then `firebase deploy --only hosting`.
2. **Netlify drop** — drag `dist/` onto app.netlify.com/drop, plus a `_redirects` file containing
   `/*  /index.html  200`.
3. **Vercel** — `npx vercel deploy --prod dist` with a rewrite rule.

### Hosting schedule

| time   | action                                                                                         |
| ------ | ---------------------------------------------------------------------------------------------- |
| ~11:00 | first deploy, whatever state the build is in — **get a URL existing early**; redeploy is cheap |
| ~11:40 | final deploy after A-015 (or its fallback) lands                                               |
| ~11:50 | smoke-test the live URL: cold load, deep link to `/chart`, one full duel                       |

**Deploy early and redeploy.** The failure mode that loses the deadline is discovering a hosting
problem at 11:55, not shipping a slightly older bundle.

---

## 6. Known open items, ranked

| #   | item                                                 | est | notes                                             |
| --- | ---------------------------------------------------- | --- | ------------------------------------------------- |
| 1   | **Verify the chart renders**, web + device           | 15m | §5, §5A — newest, least-observed screen           |
| 2   | **First deploy — get a live URL existing**           | 10m | §5A — do this EARLY, redeploy later               |
| 3   | **Device verification** of glyphs / D-8 / full loop  | 25m | §5 — the worklet review is the point              |
| 4   | **A-015** guided duel                                | 45m | fresh Test Agent then implementer; fallback in §4 |
| 5   | **Final deploy + live smoke test**                   | 15m | §5A                                               |
| 6   | Confirm engine agent landed **D-8's drill half**     | 5m  | `src/engine/drill.ts`                             |
| 7   | README + known limitations (incl. the live URL)      | 20m | delegated to engine agent — verify                |
| 8   | PR `app/shell` → `main`                              | 10m | **owner merges, never the swarm**                 |
| 9   | Delete engine stray `.tdd-swarm/t025-stack-smoke.ts` | 1m  | untracked in `wt-app`, not ours                   |

**Minor, deferred deliberately:** cold start does a redundant double redirect (root layout
`replace` + index route `Redirect`); both consult the same resolver post-hydration and always agree.
Collapse after submission, not before.

---

## 7. The demo script (from the audit — use this for the video)

1. Fresh install. Splash holds until the save hydrates, then the ship-ladder grade picker — no title
   screen, straight into play.
2. Tap the middle ship (grades 2–3). Places the captain, silently equips both starters.
3. Type a ship name, tap a flag, **Set sail**. Say out loud: that flag flies as your pennant in every
   duel.
4. Guided first duel — _if A-015 lands_. Otherwise this step auto-advances to the chart.
5. On the chart: the fog over later islands, your ship parked at the current one, the coin pill.
   Tap **Fight**.
6. Volley one: tap a cannon, answer while the fuse is gold → "Perfect hit!". **Faster answers hit
   harder** — this is the whole pedagogy.
7. Volley two: hands off. Let the fuse burn → "Damp powder", zero self-damage, rival fires back.
   _(Under D-8 this now genuinely costs nothing.)_
8. Answer quickly, sink the rival, chest opens, purse counts into coins.
9. Anchor to leave → chart: coins in the header, fog lifted off the next island.
10. Tap **Practice**: pick a skill, meter fills live, unlock celebration at the threshold.
11. **The closer:** swipe the app away mid-flow, relaunch. No menus, no login — lands straight back
    on the chart with coins, mastery and fog intact.

---

## 8. Known limitations (draft, for the submission README)

- Progress is local (AsyncStorage) and not tied to an anonymous UID. A complete injected-SDK Firebase
  auth service exists and is fully tested (`src/services/auth.ts`) but is not wired into the boot path.
- The duel rival deals damage from a provisional flat 7–12 band. The adaptive mercy bot is
  implemented and tested on the engine (T-021) but not yet wired into the duel screen.
- Only the duel screen is pinned pixel-for-pixel against design fixtures. The sea chart and gun deck
  are transcribed from their boards; the gunnery range has no board by design (PLAN.md's day-2 cut
  line: reuse the duel question panel); name-and-flag and duel-intro are built from the design system.
- Duel state is deliberately never persisted: killing the app mid-duel forfeits exactly the in-flight
  duel and relaunch lands on the chart with all pre-duel progress intact.
- Treasure-chest ceremony (A-010) and the rank screen (A-012) are not built. Both are on PLAN.md's
  own "cut if behind" list.

---

## 9. Process rules that have each been learned the hard way

- **Every ticket goes through the `tdd-swarm` skill.** Two were hand-rolled; both came back wrong.
- **Tests are frozen before implementers are dispatched**, and implementers are dispatched without
  permission to edit test files.
- **Re-run the gates yourself.** A DONE report is a claim, not evidence. A-011 was merged and marked
  `review-passed` with no reviewer or security report on disk; the retrospective review found a real
  badge bug.
- **The browser cannot find worklet or routing bugs.** See §5.
- **`tsc` catches what tests cannot.** The engine merge added a `saker` cannon and broke
  `cannonLook`'s total `Record<CannonId, …>`; all 1,946 tests passed on a branch that would not
  compile, because nothing reads the presentation map.
- **Commit with explicit paths, never `git add -A`** — that once swept an engine-track file into an
  app commit.
- **Never trust a summary of repo state — verify against git.** Two agent reports this session
  described a tree that did not exist.

---

## 10. Scope boundary with the engine track

The app track must NOT edit `src/engine/**`, `src/content/**`, `.tdd-swarm/**`, or `tickets/T-*.md`.
The engine agent owns those on `swarm/engine-core`. It currently owes: D-8's drill half, the README
and known-limitations section, and opening the PR at ~11:30 (owner merges).
