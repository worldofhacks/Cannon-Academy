# App track — resume point

**Updated 2026-07-29 (day 3 of 5, submission Sat 2026-08-01).**
Read this, then `git log --oneline -15`, before doing anything.

## Where the code is

- Integration branch **`app/shell`**, worktree `.worktrees/wt-app`. Pushed and clean.
- **1,852 tests passing.** 7 of 8 local gates green.
- iOS worktree at `/Users/quietguy/Documents/Dev/Gauntlet/cannon-academy-ios` (space-free path —
  the main repo path contains a space and iOS build scripts break on it; see `RELEASE.md`).
  Re-sync with `git checkout --detach app/shell` there, then reload the dev client.
- Metro: `npx expo start --port 8081` from the **iOS worktree**, not from `wt-app`.

## What works end to end, on device

Cold start → grade picker → name & flag → sea chart → duel → **rewards persist** → gunnery range
→ mastery → unlock. Verified on the iPhone 17 Pro simulator.

Questions are **real** as of A-014 — the placeholder generator is deleted, not deprecated.

## Ticket state — 17 tickets, `tickets/app/APP-TICKETS.md`

| done | A-001…A-009 (spine, identity, onboarding, name/flag, chart logic, duel payout, range), A-014 |
| open | A-010 chest · A-011 gun deck · A-012 rank · A-013 sprites/fidelity · A-015 guided duel · A-016 duel core · A-017 timeout |

`A-016` and `A-017` are **retrospective** — they specify shipped code that had no acceptance
criteria (MVP checklist items 5 and 10). Their ACs will likely pass immediately; the point is that
the duel stops being 300 unspecified lines under a `review-passed` label.

## In flight at compaction

- **A background agent is rebuilding `app/chart.tsx`** from the Sea chart design board. It commits
  to `app/shell` as `feat(chart): transcribe the sea chart from its design board`. If its report is
  lost, check `git log` — the work may already be in.
- `.worktrees/wt-A-011` holds 23 frozen tests, blocked (below).

## Blocked on the engine track

- **`TRAY_CAPACITY`** in `src/engine/tuning.ts` (T-030 DoD-1) — A-011's 23 frozen tests cannot run.
- **T-029 under ruling D-7** — a K-1 captain cannot practise; see `OWNER-RULINGS.md`.

`T-019` is **NOT** a blocker — `src/services/templatePools.ts` already loads all nine template
files. I claimed otherwise twice; it was wrong both times.

## Open owner decisions — do not resolve these unilaterally

1. **Does a timeout cost mastery accuracy?** Written up as `open — owner` in `A-017`. Today it
   does, while the screen says "Damp powder. Nothing lost." **A-009's range credits through the
   same tally**, so it must be ruled once or the two lanes drift.
2. **D-7's fog consequence** — whether mastering `add_within_10` should lift Isla Products' fog.
3. **Fidelity vs checklist ordering** — the plan review recommends demoting A-013 (sprites) last.
   The owner asked for pixel fidelity explicitly, so this is theirs.

## The thing most likely to be repeated if forgotten

**Seven screens are designed** and carry `data-screen-label` in the boards file: Splash, Duel intro,
Gun deck, Sea chart, Gunnery range, Name and flag, Guided first duel. Only the splash was
transcribed; the chart and range were improvised and four are stubs. **Every screen ticket starts at
`design/boards/README.md`** — never from the design system when a board exists.

## Process rules learned the hard way

- **Every ticket goes through the `tdd-swarm` skill.** Two were hand-rolled; both came back wrong.
- **Run the adversarial plan review BEFORE dispatching**, not after. Running it late found shipped
  defects instead of planning defects — including a duel with no acceptance criteria.
- **Screen tickets consistently forget their logic module.** A-006, A-009 and A-011 all had scopes
  widened by a Test Agent trying to satisfy them.
- **The browser cannot find worklet or routing bugs.** Two launch-blocking crashes shipped past
  1,852 green tests and were found only by running the app on a device.
- Commit with explicit paths, never `git add -A` — that swept an engine-track file into an app commit.
