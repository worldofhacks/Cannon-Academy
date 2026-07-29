# Build Posture

**Posture: `mvp`** — set by the owner at Phase 0, 2026-07-27.

## Why

Cannon Academy is a 5-day solo timebox (Day 1 = Tue Jul 28, submission Sat Aug 1)
with an explicit cut list in `PLAN.md`. Correctness gates that protect a child's
learning or the demo are fully enforced; infrastructure gates that cost more than
they return at this scale are deferred, in writing, below.

## Fully enforced (never deferred)

These protect the two catastrophe classes named in `ARCHITECTURE.md` §9 — "the game
teaches wrong math" and "a duel state machine that soft-locks a child mid-fight".

| Gate                        | Rationale                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------- |
| Format / Lint / Typecheck   | TS strict is an architecture decision (§2)                                            |
| Unit tests (frozen)         | The whole point of the swarm                                                          |
| Engine purity lint          | `src/engine/` = zero React/RN/Expo/Firebase imports (§8) — verified firing at Phase 0 |
| Determinism lint            | `Math.random()` + `Date` banned in `src/engine/` (§4.1) — replay depends on it        |
| Golden template tests       | 1,000 seeded samples/template (§9.1) — highest-value gate in the project              |
| Spec-lint                   | Every AC has a test; every test cites an AC                                           |
| No TODOs / no debug logging | `no-console` is lint-enforced in `src/`                                               |
| Coverage not reduced        | Baseline recorded in `baselines.md`                                                   |

## Deferred under MVP posture (written decisions, not silent skips)

| Gate                                    | Status                                   | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Re-enable when                                                                  |
| --------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Performance smoke (p50/p95, memory)     | **DEFERRED**                             | The engine is pure synchronous TS; no latency surface exists yet. Real perf risk is duel _animation_ framerate, which lives in RN and is out of this swarm's scope.                                                                                                                                                                                                                                                                                    | Perf becomes measurable in-app (day 3 juice pass)                               |
| Migration validation                    | **ENFORCED — app epic**                  | A-041 adds a schema-versioned local Captain migration. Old/current/corrupt fixtures and relaunch round trips are release gates. Firestore remains a versioned allow-listed projection rather than an implicit object dump.                                                                                                                                                                                                                             | —                                                                               |
| API compatibility / contract diff       | **N/A**                                  | No published API. Internal interfaces are compile-checked by `tsc`.                                                                                                                                                                                                                                                                                                                                                                                    | An external consumer exists                                                     |
| Full build                              | **ENFORCED — app epic**                  | The Expo app is wired and hosted. `npx expo export --platform web`, native Metro/simulator launch, and production route smoke are release gates.                                                                                                                                                                                                                                                                                                       | —                                                                               |
| Integration/e2e suite                   | **OUT OF SCOPE**                         | Requires Expo/RN runtime + simulator; per §9.4 this project verifies UI by on-device scripted playtest, not automation.                                                                                                                                                                                                                                                                                                                                | Owner adds `jest-expo`                                                          |
| Reachability                            | **ENFORCED — app epic**                  | Every child-facing route and new service must have a real inbound/caller edge. A-038 freezes the route graph; A-037 proves it on native and production.                                                                                                                                                                                                                                                                                                | —                                                                               |
| Security review (T-026 only)            | **DEFERRED — proportionality**           | T-026 is a one-line tightening of an existing zod validator (`.min(3)` → `.length(3)`). It adds no input surface, no new parsing, no new dependency, and no new code path — it makes an existing validator stricter. A dedicated Security Agent pass would produce a report with no applicable category. Recorded as a written deferral rather than a silent skip. **Does not generalise**: every other ticket in the run gets a full security review. | Any T-026 follow-up that widens rather than narrows a validator                 |
| Captain-name wordlist filter (ARCH §11) | **SKIPPED — owner decision, 2026-07-28** | The app has no chat, sharing, or public leaderboard. A-040 explicitly excludes the child-entered captain name from `private-profile-v1`, so it remains local-only even after Firestore sync. **Re-enable before any build that real children use, and before any feature uploads or publishes names.**                                                                                                                                                 | Before external playtesting with children, OR before any name leaves the device |
| GitHub Issues mirror                    | **SKIPPED**                              | No remote repo exists; creating one is the owner's call, not the swarm's. Ticket files in `tickets/` are the source of truth.                                                                                                                                                                                                                                                                                                                          | Owner creates a remote                                                          |
| Secret scan (gitleaks)                  | **SUBSTITUTED**                          | `gitleaks` not installed. Substituted a grep-based credential pattern scan in `run-repo-gates.sh`. Engine layer handles no credentials by construction.                                                                                                                                                                                                                                                                                                | `gitleaks` is installed                                                         |

## Scope of this swarm run

**In for this app epic:** `app/**`, `src/components/**`, `src/stores/**`, `src/services/**`,
the duel/content engine contracts they consume, Firebase Auth/Firestore/Storage configuration,
Expo web export, EAS Hosting, and native/production demo verification.

**Out:** new raster-art pipeline, payments, public leaderboard, remote-to-local conflict
resolution, App Store/Play Store submission, and features explicitly deferred in the canonical
ticket index.

## Deferral — app-layer screen geometry (owner-approved 2026-07-28, conditional)

**Deferred:** component-level frozen tests for `app/**` and `src/components/**`. The repo's vitest
runs in a node environment and React Native's entry point is Flow-typed (`import typeof`), which
the node parser cannot read — so any module importing `react-native` is untestable here without a
new harness.

**The owner approved this ON CONDITION that fidelity is held by other means.** It is, by three
mechanisms, in descending order of strength:

1. **Design fixtures as frozen tests** — `design/fixtures/*.json` holds geometry measured off the
   rendered board (`getBoundingClientRect` + `getComputedStyle`), and
   `__tests__/app/design-fidelity.test.ts` asserts the app's style constants against it. Runs in
   node today, no harness. On its first run it caught three drifts that a visual review had already
   passed: the glyph tile radius (14 vs 16), the sheet's top radius (20 vs 22), and a sea stage
   ratio rounded to 0.26 that lands 3pt short of the board.
2. **Pure-logic extraction** — anything that can be tested headless is moved out of components.
   `responsive.ts` holds the rules and `useLayout.ts` is the thin RN binding, so the responsive
   behaviour is frozen-tested even though the hook is not.
3. **Screenshot evidence per ticket** — each screen ticket's DoD requires a side-by-side against
   the named board at 375pt plus 360×640 / 390×844 / 430×932.

**What this still does not catch:** composition. A card with the right radius in the wrong place
passes (1) and is caught only by (3). The two are complements and neither is sufficient alone.

**Revisit when:** a component harness is cheap (`jest-expo`), or a screen defect ships that (1) and
(3) both missed.
