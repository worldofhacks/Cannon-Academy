# App tickets — Cannon Academy player spine, screens, and flow

**Scope:** `app/**`, `src/components/**`, `src/stores/**`, `src/services/**` — the layer
`TICKETS.md` explicitly excludes. Numbered `A-` so it cannot collide with the engine track's
`T-` series or with the concurrent engine agent's files.

**13 tickets · 5 waves · 92 acceptance criteria.**

> **Phase 0 note.** The app layer has no component-test harness, so screen _geometry_ cannot be
> frozen-tested the way engine logic is. Every ticket below therefore splits its criteria: logic
> (store, persistence, flow, selectors, rewards) gets normal frozen vitest tests and is fully
> gateable today; visual fidelity is a recorded screenshot diff against the named board and is a
> **posture-gated deferral awaiting owner sign-off**.

## Wave A1

| id    | title                                                     | status        | deps | model    |
| ----- | --------------------------------------------------------- | ------------- | ---- | -------- |
| A-001 | Captain store — the single persisted player               | review-passed | —    | standard |
| A-002 | Persistence — rehydrate, migrate, and survive a bad write | review-passed | —    | standard |
| A-003 | Flow resolver — which screen a captain belongs on         | review-passed | —    | standard |

## Wave A2

| id    | title                                                                         | status  | deps         | model    |
| ----- | ----------------------------------------------------------------------------- | ------- | ------------ | -------- |
| A-004 | Anonymous identity that survives a cold start                                 | backlog | A-002        | standard |
| A-005 | Onboarding wired to placement, and the root layout wired to the flow resolver | backlog | A-001, A-003 | standard |
| A-006 | Name and flag — the ship becomes theirs before the first chest                | backlog | A-001        | cheap    |

## Wave A3

| id    | title                                             | status      | deps         | model   |
| ----- | ------------------------------------------------- | ----------- | ------------ | ------- |
| A-007 | Sea chart — the hub the whole loop routes through | in-progress | A-001, A-003 | capable |

## Wave A4

| id    | title                                                         | status  | deps         | model    |
| ----- | ------------------------------------------------------------- | ------- | ------------ | -------- |
| A-008 | The duel earns something — coins, mastery and wins persist    | backlog | A-001, A-007 | standard |
| A-009 | Gunnery range — the drill that makes mastery real             | backlog | A-001, A-007 | standard |
| A-010 | Chest ceremony — the real rarity roll, not a hardcoded reward | backlog | A-008        | cheap    |

## Wave A5

| id    | title                                                            | status  | deps  | model    |
| ----- | ---------------------------------------------------------------- | ------- | ----- | -------- |
| A-011 | Gun deck — which three cannons sail with you                     | backlog | A-001 | standard |
| A-012 | Rank ladder and progress — what the meta actually shows          | backlog | A-008 | cheap    |
| A-013 | Design fidelity — the shipped sprites, and a diff that proves it | backlog | A-007 | standard |
