> **Retired status file (A-044).** Superseded first by HANDOFF, then by [`../INDEX.md`](../INDEX.md)
> for ticket lifecycle and [`../../README.md`](../../README.md) for product truth. Retained as a
> historical day-3 narrative only.

# App track — resume point

**Updated 2026-07-29 (day 3 of 5, submission Sat 2026-08-01).**
Read this, then `git log --oneline -15`, before doing anything.

## Where the code is

- Integration branch **`app/shell`**, worktree `.worktrees/wt-app`. Pushed and clean.
- Merged `swarm/engine-core` through **T-029 / D-7** and **T-035** (`TRAY_CAPACITY`).
- iOS worktree at `/Users/quietguy/Documents/Dev/Gauntlet/cannon-academy-ios` (space-free path —
  the main repo path contains a space and iOS build scripts break on it; see `RELEASE.md`).
  Re-sync with `git checkout --detach app/shell` there, then reload the dev client.
- Metro: `npx expo start --port 8081` from the **iOS worktree**, not from `wt-app`.

## What works end to end, on device

Cold start → grade picker → name & flag → sea chart → duel → **rewards persist** → gunnery range
→ mastery → unlock. Verified on the iPhone 17 Pro simulator.

Questions are **real** as of A-014 — the placeholder generator is deleted, not deprecated.

## Ticket state — 17 tickets, `tickets/app/APP-TICKETS.md`

| done | A-001…A-009, A-011, A-014 |
| open | A-010 chest · A-012 rank · A-013 sprites · A-015 guided duel · A-016 duel core · A-017 timeout |

## Engine blockers — cleared

- ~~`TRAY_CAPACITY`~~ — shipped as **T-035** (`src/engine/tuning.ts`). A-011 can run.
- ~~**T-029 / D-7**~~ — shipped on engine (`add_within_10` on Port Sumwich + `saker` range payoff).
  Fog decision named in `tickets/T-029.md`: early Isla Products fog accepted as harmless.

`T-019` is **NOT** a blocker — `src/services/templatePools.ts` already loads all nine template
files.

## Open owner decisions — do not resolve these unilaterally

1. **Does a timeout cost mastery accuracy?** Written up as `open — owner` in `A-017`. Today it
   does, while the screen says "Damp powder. Nothing lost." **A-009's range credits through the
   same tally**, so it must be ruled once or the two lanes drift.
2. **Fidelity vs checklist ordering** — the plan review recommends demoting A-013 (sprites) last.
   The owner asked for pixel fidelity explicitly, so this is theirs.
   _(D-7 fog was decided on the engine ticket — early Isla Products accepted.)_

## The thing most likely to be repeated if forgotten

**Seven screens are designed** and carry `data-screen-label` in the boards file: Splash, Duel intro,
Gun deck, Sea chart, Gunnery range, Name and flag, Guided first duel. Only the splash was
transcribed; the chart and range were improvised and four are stubs. **Every screen ticket starts at
`design/boards/README.md`** — never from the design system when a board exists.

## Process rules learned the hard way

- **Every ticket goes through the `tdd-swarm` skill.** Two were hand-rolled; both came back wrong.
- **Run the adversarial plan review BEFORE dispatching**, not after.
- **Screen tickets consistently forget their logic module.** A-006, A-009 and A-011 all had scopes
  widened by a Test Agent trying to satisfy them.
- **The browser cannot find worklet or routing bugs.** Two launch-blocking crashes shipped past
  green tests and were found only by running the app on a device.
- Commit with explicit paths, never `git add -A`.
