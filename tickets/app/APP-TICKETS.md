# App tickets — Cannon Academy player spine, screens, and flow

**Scope:** `app/**`, `src/components/**`, `src/stores/**`, `src/services/**` — the layer
`TICKETS.md` explicitly excludes. Numbered `A-` so it cannot collide with the engine track's
`T-` series or with the concurrent engine agent's files.

**17 feature tickets · 8 feature waves · 89 feature acceptance criteria, plus 2 release-verification
tickets.** `HANDOFF.md` supersedes the historical status prose below.

> **Phase 0 note.** The app layer has no component-test harness, so screen _geometry_ cannot be
> frozen-tested the way engine logic is. Every ticket below therefore splits its criteria: logic
> (store, persistence, flow, selectors, rewards, the duel reducer) gets normal frozen vitest tests
> and is fully gateable today; visual fidelity is a recorded screenshot diff against the named board
> and is a **posture-gated deferral** (`.tdd-swarm/posture.md`).
>
> **Numbered ACs are the frozen-test contract; posture-deferred geometry lives in the Test Plan's
> Visual row.** Three criteria that no test could ever satisfy (A-005:AC-4, A-007:AC-6, A-012:AC-4 —
> all "nothing clipped at 360×640") were demoted out of the numbered lists on 2026-07-29. A numbered
> AC that is permanently unsatisfiable is a permanent spec-lint red, and a permanently red gate is
> one everybody learns to ignore (LESSONS L-002). The requirements themselves were kept, verbatim,
> as screenshot evidence.

## Sequencing against the deadline

Submission is **Saturday 2026-08-01**; today is Wednesday 2026-07-29. **The MVP checklist in
`PLAN.md` §Milestone 1 is the contract**, and it is what the wave order below optimises for — not
ticket numbering and not tidiness.

**Checklist-critical, must land:**

| ticket | checklist item                                          | state                                       |
| ------ | ------------------------------------------------------- | ------------------------------------------- |
| A-016  | 5 — win a real duel against a bot                       | shipped, now specified                      |
| A-017  | 10 — time out a question and see the misfire            | shipped, now specified                      |
| A-014  | 5 — the four-choice questions a child is actually asked | **not built** (all fake)                    |
| A-015  | 4 — an easy guided duel you win                         | **not built** (23-line stub)                |
| A-011  | 5 — "two starter cannons that are a real choice"        | **done** — gun deck chooses the sailing set |

**Not checklist-critical — droppable if Friday is tight**, and PLAN.md says so itself:

- **A-010** (chest ceremony) — PLAN's own first cut line: "treasure-chest ceremony → plain coin
  payout". The plain payout already works.
- **A-013** (design fidelity / sprites) — "Placeholder art is explicitly fine for this checklist —
  grey boxes and coloured rectangles pass."
- **A-012** (rank ladder) — PLAN day 4, meta, not Milestone 1.
- **A-011** (gun deck) was blocked on `TRAY_CAPACITY`; **T-035 cleared it** — now in flight.

**The critical path is a single file.** A-016 → A-017 → A-014 → A-015 all edit
`src/stores/duel.ts`, so they cannot be parallelised — that is what forces four waves rather than
one. Each is paired with a non-critical ticket that touches nothing they touch, so the non-critical
work rides along for free and can be abandoned mid-wave without stalling the path.

## Wave A1 — done

| id    | title                                                     | status        | deps | model    |
| ----- | --------------------------------------------------------- | ------------- | ---- | -------- |
| A-001 | Captain store — the single persisted player               | review-passed | —    | standard |
| A-002 | Persistence — rehydrate, migrate, and survive a bad write | review-passed | —    | standard |
| A-003 | Flow resolver — which screen a captain belongs on         | review-passed | —    | standard |

## Wave A2 — done

| id    | title                                                                         | status        | deps         | model    |
| ----- | ----------------------------------------------------------------------------- | ------------- | ------------ | -------- |
| A-004 | Anonymous identity that survives a cold start                                 | review-passed | A-002        | standard |
| A-005 | Onboarding wired to placement, and the root layout wired to the flow resolver | review-passed | A-001, A-003 | standard |
| A-006 | Name and flag — the ship becomes theirs before the first chest                | review-passed | A-001        | cheap    |

## Wave A3 — done

| id    | title                                             | status        | deps         | model   |
| ----- | ------------------------------------------------- | ------------- | ------------ | ------- |
| A-007 | Sea chart — the hub the whole loop routes through | review-passed | A-001, A-003 | capable |

## Wave A4 — done

| id    | title                                                      | status        | deps         | model    |
| ----- | ---------------------------------------------------------- | ------------- | ------------ | -------- |
| A-008 | The duel earns something — coins, mastery and wins persist | review-passed | A-001, A-007 | standard |
| A-009 | Gunnery range — the drill that makes mastery real          | review-passed | A-001, A-007 | standard |

## Wave A5 — next

| id    | title                                                         | status  | deps         | model   |
| ----- | ------------------------------------------------------------- | ------- | ------------ | ------- |
| A-016 | The duel itself — four choices, a speed-aimed volley          | backlog | A-001, A-008 | capable |
| A-010 | Chest ceremony — the real rarity roll, not a hardcoded reward | backlog | A-008        | cheap   |
| A-012 | Rank ladder and progress — what the meta actually shows       | backlog | A-008        | cheap   |

## Wave A6

| id    | title                                                            | status  | deps         | model    |
| ----- | ---------------------------------------------------------------- | ------- | ------------ | -------- |
| A-017 | Timeout and misfire — what a burned fuse costs, said out loud    | backlog | A-001, A-016 | standard |
| A-013 | Design fidelity — the shipped sprites, and a diff that proves it | backlog | A-007        | standard |

## Wave A7

| id    | title                                        | status        | deps                | model    |
| ----- | -------------------------------------------- | ------------- | ------------------- | -------- |
| A-014 | Retire the placeholder question generator    | review-passed | A-001, A-016, A-017 | standard |
| A-011 | Gun deck — which three cannons sail with you | in-progress   | A-001               | standard |

## Wave A8

| id    | title                                                        | status  | deps                                     | model    |
| ----- | ------------------------------------------------------------ | ------- | ---------------------------------------- | -------- |
| A-015 | The guided first duel — where a five-year-old learns to play | backlog | A-001, A-003, A-008, A-014, A-016, A-017 | standard |

## Blocked

_(none — A-011 unblocked by engine T-035 / `TRAY_CAPACITY`.)_

## Release verification waves — 2026-07-29

These release-only tickets were added from `HANDOFF.md` §5–§6. They do not reopen A-007 or add
features; they freeze the two deadline-critical claims the earlier build had not yet proven.

| id    | title                                                | status  | deps         | model    |
| ----- | ---------------------------------------------------- | ------- | ------------ | -------- |
| A-018 | Rebuilt chart is safe and visible on web and iOS     | backlog | A-007, A-017 | capable  |
| A-019 | Public Expo web build with working direct deep links | backlog | A-018        | standard |

## Submission hotfixes — 2026-07-29

These tickets record owner-directed defects discovered during the final simulator recording pass.
They supersede conflicting historical demo prose in `HANDOFF.md`.

| id    | title                                      | status      | deps         | model    |
| ----- | ------------------------------------------ | ----------- | ------------ | -------- |
| A-042 | Demo launch gate and unclipped ship picker | in-progress | A-005, A-025 | standard |
| A-043 | Responsive tablet and desktop surfaces     | in-progress | A-042        | capable  |

## Why the waves were recomputed (2026-07-29)

The previous plan put A-008, A-010, A-014 and A-015 in one wave, "A4", and printed the heading
`## Wave A4` twice. That wave was not parallelisable at all:

- All four needed `src/stores/duel.ts`. **`ticket-format.md`: file scopes are exclusive within a
  wave** — overlapping scopes are a forced dependency, and it is exactly that exclusivity that makes
  parallel dispatch safe.
- A-010 and A-015 both `depends_on` A-008, which was in the same wave as them.

The graph above is recomputed from the real file scopes. Finished work (A-001…A-009) keeps its
historical wave numbers — re-waving merged tickets would rewrite history for no gain — but its
scopes were corrected in place, because six shipped files were in no ticket's `file_scopes` at all:

| file                                                | now owned by | why it matters                                              |
| --------------------------------------------------- | ------------ | ----------------------------------------------------------- |
| `src/services/duelRewards.ts`                       | A-008        | carries A-008's entire idempotency guarantee; was ownerless |
| `src/services/chart.ts`                             | A-007        | the pure fog/unlock selector A-007's own DoD requires       |
| `src/services/onboarding.ts`                        | A-005        | placement wiring                                            |
| `app/index.tsx`                                     | A-005        | the other entry route                                       |
| `src/components/Splash.tsx`                         | A-005        | the visible half of the hydration gate                      |
| `src/stores/useCaptain.ts`                          | A-001        | the React binding for A-001's store                         |
| most of `src/theme/**` and `src/components/duel/**` | A-013        | the substrate every fidelity claim is measured against      |

`src/theme/flags.ts` and `shipCosmetics.ts` stay with A-006 and `src/components/duel/Panels.tsx`
stays with A-010, so scopes remain exclusive within every wave above.

## Open items an owner has to decide

1. **Does a timed-out question count against mastery accuracy?** `open — owner`, recorded in
   **A-017 §Planning Decisions**. Today it does: a timeout increments `asked`, never `correct`,
   which lowers accuracy, which is gated at `MASTERY_MIN_ACCURACY = 0.7` before any cannon unlocks —
   while the screen tells the child "Damp powder. Nothing lost." Nobody decided this; it emerged
   from two agents working independently. A-009's range credits mastery through the same
   `{correct, asked}` tally, so the ruling has to be made once in the tally or the two lanes drift.
2. **`hasHydrated` does not exist.** Named in README and ARCHITECTURE §8, implemented as
   `destination === null` in `app/_layout.tsx`. A-002:AC-5 was restated against the contract
   `hydrate` actually offers; the layout-side half of the gate is unasserted. Recorded in
   **A-002 §Planning Decisions**.
3. **`culverin` ships `recoilDamage: 0`**, so the volatile starter has no downside but variance and
   the reducer's recoil path is dead at K-1. Catalog tuning, not a duel defect. Recorded in
   **A-016 §Planning Decisions**, deliberately not pinned by a test.
4. **`src/stores/player.ts`'s file header repeats A-001's deleted claim** that the captain shape
   "mirrors the Firestore captain document in ARCHITECTURE.md §5". It does not — §5's document has
   `crew`, `cosmetics`, `losses`, `createdAt`, and a flat `mastery: {skillId: 0-100}`. The ticket
   text is corrected; the source comment is outside `tickets/app/**` and needs an implementer.

## Known spec-lint state

`bash .tdd-swarm/spec-lint.sh tickets/app/A-00N.md` is green for A-001, A-003, A-004, A-005, A-006,
A-007, A-008 and A-009. **A-002 is RED on one item**: its restated AC-5 needs one tagged assertion
in `__tests__/app/persistence.test.ts`, which is a Test Agent's line to write, not a planner's.
A-010 through A-017 are RED by construction — they are `backlog` and their tests do not exist yet.

Definition-of-Done items that assert a property of the _diff_ rather than of the _module_ are tagged
`[process]` and reported as SKIP, per the gate's own contract. Marking a real module requirement
`[process]` to buy a green would be LESSONS L-036 one level up, so each tag carries its reason
inline and every genuinely testable DoD item was left enforced.
