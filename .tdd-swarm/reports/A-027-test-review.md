# A-027 Test-Design Re-review

## Verdict: APPROVED

No Critical or Important findings remain.

The frozen AC-5 fixture is now catalog-derived from an island that genuinely trains the selected
skill. With the current catalog it resolves to `port_sumwich` / `two_step_add_sub`
(`minGrade: 2`), which is correctly above the K-1 ceiling of 1. AC-2 therefore includes every
eligible grade-0/1 Port Sumwich skill while AC-5 rejects only the genuinely above-ceiling skill;
the criteria no longer contradict.

The scoped tests are complete without material overconstraint:

- AC-1 preserves attempt/correct/mastery/completion/current state on timeout.
- AC-2 sweeps every declared band and every catalog island, asserting the exact filtered catalog
  order and ceiling.
- AC-3 covers both the resolver boundary and the production player-store tally path.
- AC-4 proves an eligible successor still opens while a pre-existing higher-band island survives.
- AC-5 covers missing, runtime-corrupt, and genuine above-ceiling input using only the ticket-locked
  synchronous `RangeError` class, without pinning incidental message text or a fallback choice.

Existing mastery tests retain the relevant purity and idempotent-delta coverage. The `[process]`
DoD labels also remain correctly outside behavioral spec-lint requirements.
