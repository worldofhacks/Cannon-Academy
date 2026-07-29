# T-011 implementation report

## Status
DONE

## Commit
`c4ab1b4` on `ticket/T-011-placement` — `feat(T-011): resolve grade-band placement from catalog + tuning`

Files changed: exactly `src/engine/placement.ts` (matches `file_scopes`).

## What was implemented
`src/engine/placement.ts` exports `resolvePlacement(band: GradeBand): Placement` per the ticket's
signature. Everything is derived from `@content/index` (validated catalog) and
`@engine/tuning`'s `BOT_ACCURACY_BAND_BY_GRADE` — no hardcoded cannon/island id lists.

- `maxGrade`: literal map `k_1→1, g2_3→3, g4_5→5` (ticket AC-1, stated verbatim in the ticket).
- `unlockedCannons`: every cannon with `unlock.kind !== 'chest'` and `minGrade <= maxGrade`
  ("reachable", not "outgrown" — the ticket's Planning Decisions explicitly warn against the
  `maxGrade <= maxGrade` misreading, which would deny a 5th grader the starter cannons). Sorted
  ascending by `minGrade`, then id, matching the interface doc comment.
- `unlockedIslands`: every island where `rangeSkills.some(skillId => getSkill(skillId).minGrade
  <= maxGrade)` — minimum-grade rule from the ticket. Sorted ascending by island `order`.
- `botAccuracyBand`: a fresh `{min, max}` object copied from `BOT_ACCURACY_BAND_BY_GRADE[band]`.
- Invalid band: throws `Error` naming the offending value (checked via `GRADE_BANDS.includes`),
  never falls through to a default.
- Purity: no module-level cache: `cannons`/`islands` are re-filtered and freshly mapped into new
  arrays on every call, so a caller mutating a returned array (or a frozen one throwing on push)
  can never leak into a later call's result (AC-9).

## Test summary
- `.tdd-swarm/run-local-gates.sh`: all green (format, lint, typecheck, unit, no-todos,
  no-skipped-tests, engine-purity).
- `.tdd-swarm/spec-lint.sh tickets/T-011.md`: PASS, all 11 ACs covered.
- Full suite: **899 passed (899)**, 8 test files — including `__tests__/engine/placement.test.ts`
  with **123 passed**, matching the frozen count. No test file was touched.

## Concerns
None. The frozen test file exercises the full catalog (dimension sweeps over every
`CannonId`/`IslandId` × every `GradeBand`), monotonicity across bands, and the "playable start"
guarantee, and all passed without needing any test-shape assumption beyond what's in the ticket.
