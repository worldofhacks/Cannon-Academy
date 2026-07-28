# Baselines — recorded at Phase 0, 2026-07-27

Every later gate result is compared against these numbers.

| Metric | Baseline | Command |
|---|---|---|
| Test files | 1 (`__tests__/scaffold.test.ts`) | `npx vitest run` |
| Tests passing | 1 | `npx vitest run` |
| Tests failing | 0 | — |
| Coverage (src/) | 0/0 — no source yet | `npx vitest run --coverage` |
| Typecheck errors | 0 | `npx tsc --noEmit` |
| Lint errors | 0 | `npx eslint . --max-warnings 0` |
| npm audit (high+) | 0 | `npm audit --audit-level=high` |

**Regression rule:** passing test count may never fall below the recorded baseline,
and coverage may never fall below the previous wave's recorded percentage.

## Phase 0 note — audit remediation

Baseline `npm audit` initially reported **8 high-severity** advisories, all tracing to
one transitive `brace-expansion` DoS (GHSA-mh99-v99m-4gvg) via eslint and
`@vitest/coverage-v8`. Resolved with an `overrides: { "brace-expansion": "^5.0.8" }`
pin rather than `npm audit fix --force`, which would have installed a breaking
eslint 10. Post-fix: 0 vulnerabilities, all gates re-verified green.

## Performance baselines

**Not recorded — performance smoke is DEFERRED under `mvp` posture** (see posture.md).
No latency surface exists in a synchronous pure-TS engine. Do not invent numbers here.
