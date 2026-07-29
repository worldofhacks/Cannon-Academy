# A-027 Test-Design Re-review

## Verdict: APPROVED

No Critical or Important findings remain.

The amended suite now covers the previously missing enforcement path and removes the prior
contract ambiguity:

- `__tests__/app/range-band.test.ts:77-87` proves `openDrill` itself refuses an authored
  above-ceiling K-1 skill, so a correct filtered picker cannot hide an unsafe serving path.
- `tickets/app/A-027.md:40-42,54-56` explicitly locks synchronous `RangeError` refusal for
  missing, invalid, and above-ceiling grade/skill input. The assertions at
  `__tests__/app/range-band.test.ts:62-87` now test that stable error class without constraining
  incidental message prose.
- `__tests__/engine/mastery.test.ts:434-449` exercises the production player-store tally path,
  proving K-1 mastery grants Saker while Isla Products remains closed. This complements the
  direct resolver boundary test.

AC-1 through AC-5 are covered at their relevant engine, service, and store boundaries. The
all-band/all-island filtered-list sweep checks catalog-derived boundary behavior and order;
the K-1 denied and g2_3 allowed cases bracket island progression; preservation is asserted for
an existing higher-band unlock; and the established T-010 resolver tests continue to cover
idempotent delta/set-union semantics.

The `[process]` DoD labels correctly keep T-036 integration verification and freeze/gate evidence
out of behavioral spec-lint coverage. No additional A-027 test tag is needed for those markers.
