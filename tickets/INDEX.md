# Cannon Academy tickets — canonical index

**Planning snapshot: 2026-07-29.** Individual ticket frontmatter is authoritative for that
ticket's lifecycle and acceptance criteria. This is the only cross-track status and execution
index. A-035 replaces this hand-seeded Phase-1 view with deterministic generation and drift checks.

Do not maintain live status tables in `TICKETS.md`, `tickets/app/APP-TICKETS.md`, README, HANDOFF,
or STATE. Those documents link here and keep only their own historical or operational purpose.

## Current release

- Integration branch: `app/shell` at `57563ce` when this plan was written.
- Production alias: <https://cannon-academy.expo.app>
- Pull request: <https://github.com/worldofhacks/Cannon-Academy/pull/2> (`app/shell` → `main`).
- Verified baseline: 2,065 tests across 46 files; format, lint, typecheck, and spec lint clean.
- T-036 is complete on `swarm/engine-core` at `91c013c`, but is not integrated into `app/shell`.
  The range-timeout half of D-8 is therefore not complete in the deployed app.

## Locked delivery decisions

The owner authorized the permanent infrastructure choice and parallel one-hour execution on
2026-07-29. The planner locked the remaining reversible demo rules from the existing economy and
catalog contracts:

1. **Firebase:** default Firestore database in permanent `nam5`; exact default Storage bucket
   `cannon-academy.firebasestorage.app` in `us-central1`. Blaze billing is active.
2. **Hosting:** EAS Hosting remains canonical web production. Firebase is the backend; Railway and
   a second Firebase Hosting target are unnecessary.
3. **Store:** coins remain the only currency. Harbor sells one repeatable chest for the named
   `HARBOR_CHEST_PRICE = 50`; mastery cannons are never sold directly.
4. **Starting cannons:** K-1 gets the two starters; grade 2-3 also gets Six-Pounder; grade 4-5 also
   gets Twelve-Pounder. Those are the only dual placement/mastery paths; every other range cannon
   remains mastery-earned.
5. **Chest cannon:** a rare victory/store chest grants an unowned chest-only cannon; otherwise it
   grants the existing tuned coin result. A cannon replaces chest coins while retaining the roll
   as a duplicate fallback; the normal duel purse remains separate.
6. **Training:** show all age-eligible skills from all unlocked islands so warm-up practice remains
   available; derive difficulty labels from catalog grade spans.
7. **Duel architecture:** the engine reducer is the sole rules machine. The app store becomes a
   presentation adapter; timeouts are distinct free events and stale rival tokens are ignored.
8. **Privacy:** Firebase's private profile omits the child-entered captain name and raw receipts.
   Local play and AsyncStorage remain authoritative.

## Traceability

| User requirement                                             | Owning tickets      |
| ------------------------------------------------------------ | ------------------- |
| Firebase Auth, Firestore, Storage exports and secure config  | A-025               |
| Persist anonymous login and sync private profile             | A-026, A-040        |
| Training is safe, age-appropriate, and offers easier choices | T-036, A-027, A-028 |
| One canonical replay-safe duel machine                       | A-039               |
| Islands/levels actually change duels                         | A-029, A-039        |
| Use built bot/mercy behavior                                 | A-030               |
| Pirate/skeleton/ghost/shark/kraken variety                   | A-031               |
| Cannons can really be acquired and persist                   | A-032, A-041, A-010 |
| Spend existing coins in a store                              | A-033               |
| Cannon difficulty/weapons are visible and truthful           | A-034, T-022        |
| Guided first play teaches the loop                           | A-015               |
| Rank/meta screen is reachable                                | A-012, A-038        |
| One source of ticket truth and accurate docs                 | A-035, A-036        |
| Every screen wired, native-tested, and redeployed            | A-038, A-037        |

## Dependency graph

```text
A-004 ──> A-025 ──> A-026 ───────────────────────────────────────────────┐
T-036 ──> A-027 ──┬──> A-028                                             │
                  └──> A-041 ──┐                                         │
A-016 + T-020/T-021/T-036 ──> A-039 ──> A-029 ──┐                        │
A-027 + A-029 + A-039 + A-041 ────────────────> A-030 ──> A-031          │
A-008 + A-039 + A-041 ─────────────────────────> A-032 ──┬──> A-010      │
                                                        ├──> A-033      │
                                                        └──> A-034      │
A-029 + A-030 + A-032 + A-039 ─────────────────────────────> A-015      │
A-026 + A-030 + A-032 + A-041 ─────────────────────────────> A-040      │
A-008 ──> A-012; A-035 ─────────────────────────────────────────────────┤
                                                                         v
        A-010/A-012/A-015/A-028/A-031/A-033/A-034 ──> A-038 route graph
        A-035/A-038/A-039/A-040/A-041 + shipped work ──> A-036 docs
                                                A-036 ──> A-037 release
```

T-022 remains a truthful follow-up for real Double-Shot. A-034 must not claim it is enabled before
that engine ticket and an app adapter land.

## Wave plan

| Wave       | Parallel work                                                                                                                       | Exit                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Checkpoint | Adversarial review clean; owner approved; commit exact plan; integrate/verify T-036; prove ticket + LESSONS hashes in each worktree | No tests from stale/uncommitted contracts                 |
| D1 / G1    | A-025 Firebase boundary/provisioning; A-027 band safety; A-039 canonical duel; A-012 rank; A-035 index                              | Frozen reviewed tests + green foundations                 |
| D2 / G2    | A-026 anonymous session; A-028 training; A-029 island context; A-041 durable Captain contract                                       | Identity, context, and persistence contracts stable       |
| G3         | A-030 opponent bridge; A-032 atomic chest settlement                                                                                | Real bot + durable acquisition/store API                  |
| D4 / G4    | A-010 ceremony; A-015 guided duel; A-031 enemies; A-033 Harbor; A-034 cannon identity; A-040 private-profile sync                   | Complete first-play, economy, variety, and online profile |
| G5         | A-038 route wiring                                                                                                                  | Complete child-facing route graph                         |
| D6         | A-036 documentation reconciliation                                                                                                  | No stale status, hosting, privacy, or backend claims      |
| D7         | A-037 configured native demo, staged EAS promotion/rollback, PR update                                                              | Exact deployed commit and evidence recorded               |

Each ticket follows RED → independent test-design review → frozen tests → GREEN implementation
without test permission → orchestrator gates → code review → Security Agent. The owner reviews the
PR; the swarm never merges `main`.

## App track

| ID    | Status        | Title                                                     |
| ----- | ------------- | --------------------------------------------------------- |
| A-001 | review-passed | Captain store — the single persisted player               |
| A-002 | review-passed | Persistence — rehydrate, migrate, and survive a bad write |
| A-003 | review-passed | Flow resolver — which screen a captain belongs on         |
| A-004 | review-passed | Anonymous identity service seam                           |
| A-005 | review-passed | Onboarding wired to placement                             |
| A-006 | review-passed | Name and flag                                             |
| A-007 | review-passed | Sea chart                                                 |
| A-008 | review-passed | Duel rewards persist                                      |
| A-009 | review-passed | Gunnery range                                             |
| A-010 | backlog       | Real chest ceremony                                       |
| A-011 | review-passed | Gun deck                                                  |
| A-012 | backlog       | Rank ladder and progress                                  |
| A-013 | backlog       | Sprite/fidelity pass                                      |
| A-014 | review-passed | Real question generator                                   |
| A-015 | backlog       | Guided first duel                                         |
| A-016 | review-passed | Live duel                                                 |
| A-017 | review-passed | Duel timeout                                              |
| A-018 | review-passed | Rebuilt chart verification                                |
| A-019 | backlog       | Release hosting                                           |
| A-020 | backlog       | EAS project link                                          |
| A-021 | review-passed | Native demo-loop verification                             |
| A-022 | review-passed | Truthful victory rewards                                  |
| A-023 | review-passed | Readable questions                                        |
| A-024 | review-passed | Truthful chart progress/fog                               |
| A-025 | backlog       | Firebase client boundary                                  |
| A-026 | backlog       | Anonymous Firebase session                                |
| A-027 | backlog       | Band-safe progression                                     |
| A-028 | backlog       | Training choice                                           |
| A-029 | backlog       | Island-aware duel context                                 |
| A-030 | backlog       | Real rival bridge                                         |
| A-031 | backlog       | Enemy encounter variety                                   |
| A-032 | backlog       | Real chest settlement/acquisition                         |
| A-033 | backlog       | Harbor coin store                                         |
| A-034 | backlog       | Cannon identity and starting play                         |
| A-035 | backlog       | Generated canonical index                                 |
| A-036 | backlog       | Documentation reconciliation                              |
| A-037 | backlog       | Demo-ready release                                        |
| A-038 | backlog       | Demo navigation                                           |
| A-039 | backlog       | Canonical duel core                                       |
| A-040 | backlog       | Cloud-safe private-profile sync                           |
| A-041 | backlog       | Durable Captain contract                                  |

## Engine track

| Status                                         | Tickets                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| done / review-passed in this branch            | T-001…T-018 (except no T-023), T-020, T-021, T-025…T-029, T-031, T-032, T-034, T-035 |
| done on engine branch, pending app integration | T-036                                                                                |
| backlog and relevant now                       | T-022 Double-Shot                                                                    |
| backlog, not on current demo critical path     | T-019, T-024, T-030, T-033                                                           |

The generated A-035 index will expand this compact engine rollup into one row per physical ticket
and will flag the intentionally absent T-023 rather than silently assuming a contiguous sequence.
