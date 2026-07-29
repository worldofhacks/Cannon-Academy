# A-020 Test Agent Report

## Scope

- Added `__tests__/app/eas-project.test.ts` only.
- The test reads the committed `app.json` from disk; it does not import Expo configuration or mock release tooling.

## Criterion mapping

| Criterion | Frozen test |
| --- | --- |
| AC-1 | `spec(A-020:AC-1) commits a non-placeholder RFC 4122 UUID at expo.extra.eas.projectId` |

The assertion first requires the nested value to be a string, then rejects the nil UUID and requires the RFC 4122 UUID shape (versions 1–5 with RFC 4122 variant bits). This makes a missing nested field fail explicitly rather than silently accepting a placeholder.

## RED evidence

Command:

```text
npx vitest run __tests__/app/eas-project.test.ts
```

Result: exit 1; one collected test failed, with no parser, import, fixture, or setup error:

```text
app.json must define expo.extra.eas.projectId before release tooling can address the project:
expected undefined to be type of 'string'
```

This is the intended pre-implementation failure: the committed `app.json` has no `expo.extra.eas.projectId`.

## Static gates

| Command | Result |
| --- | --- |
| `npx prettier --check __tests__/app/eas-project.test.ts` | PASS |
| `npx eslint __tests__/app/eas-project.test.ts --max-warnings 0` | PASS |
| `npx tsc --noEmit` | PASS |
| `.tdd-swarm/spec-lint.sh tickets/app/A-020.md` | PASS — AC-1 mapped to one test; all five DoD entries are `[process]` and skipped by design |

The unit-test gate remains RED by design until `eas init` (or equivalent) commits a real EAS project UUID to `app.json`.
