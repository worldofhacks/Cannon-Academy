# Gate Command Mapping — Cannon Academy

Every command below was executed at Phase 0 and confirmed runnable.
Wrapper scripts exist so implementers and the orchestrator run identical commands.

## Tier 1 — Local (per ticket, every loop iteration)

Run all at once: `.tdd-swarm/run-local-gates.sh`

| Gate             | Command                                                                          | Status                                              |
| ---------------- | -------------------------------------------------------------------------------- | --------------------------------------------------- |
| Format           | `npx prettier --check .`                                                         | ✅ verified                                         |
| Lint             | `npx eslint . --max-warnings 0`                                                  | ✅ verified                                         |
| Typecheck        | `npx tsc --noEmit`                                                               | ✅ verified (caught a real config error at Phase 0) |
| Unit tests       | `npx vitest run`                                                                 | ✅ verified                                         |
| Coverage         | `npx vitest run --coverage`                                                      | ✅ verified — baseline in `baselines.md`            |
| No TODOs         | `grep -rnE '(TODO\|FIXME\|HACK)' src __tests__`                                  | ✅ in runner                                        |
| No debug logging | `no-console: error` on `src/**` (eslint)                                         | ✅ verified                                         |
| No skipped tests | `grep` for `.skip` / `.only` / `xit`                                             | ✅ in runner                                        |
| Engine purity    | eslint `no-restricted-imports` on `src/engine/**`                                | ✅ **guard proven firing**                          |
| Determinism      | eslint `no-restricted-properties` (Math.random) + `no-restricted-globals` (Date) | ✅ **guard proven firing**                          |
| Spec-lint        | `.tdd-swarm/spec-lint.sh tickets/T-XXX.md`                                       | ✅ **proven RED on untested AC**                    |

## Tier 2 — Repo (per wave, integration branch)

Run all at once: `.tdd-swarm/run-repo-gates.sh`

| Gate                          | Command                                                  | Status                                                               |
| ----------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| Build proxy                   | `npx tsc --noEmit`                                       | ✅ substituted (see posture.md — pure-TS layer, no bundler in scope) |
| Regression suite              | `npx vitest run` (≥ baseline pass count)                 | ✅ verified                                                          |
| Dependency audit              | `npm audit --audit-level=high`                           | ✅ verified                                                          |
| Dependency graph              | `npm ls --all` (no unapproved deps; lockfile consistent) | ✅ verified                                                          |
| Secret scan                   | grep credential patterns over the wave commit range      | ⚠️ substituted — `gitleaks` not installed                            |
| Architecture drift            | Manual agent check vs `ARCHITECTURE.md` §4/§8            | Agent judgment                                                       |
| Performance smoke             | —                                                        | ⛔ **DEFERRED** under mvp posture (see posture.md)                   |
| Migrations / API compat / e2e | —                                                        | ⛔ N/A or out of scope (see posture.md)                              |

## Not available in this environment — and why that is safe

`expo`, `metro`, EAS builds, live Firestore, and iOS/Android simulators cannot gate
sub-agent work here. This swarm's scope (`src/engine/**`, `src/content/**`) imports
none of them by construction — the engine-purity lint guard _enforces_ that, so no
in-scope code can develop a dependency on an ungateable surface without going red.

## Scratchpad convention (added 2026-07-28, from L-028)

Agents build throwaway reference implementations and mutation harnesses under the session
scratchpad. **That root is shared across concurrent agent sessions.** A T-008 mutation matrix was
silently invalidated when a concurrently-running T-005 session wrote `probe.test.ts` into the same
directory — all 30 mutants reported as surviving, with no error, because the harness was running
another ticket's test file.

**Every agent must work in a per-ticket subdirectory**, e.g. `scratchpad/t008-probe/`, and must
delete it before committing. A mutation matrix with a uniform result (all killed or all survived)
is a harness fault until proven otherwise.
