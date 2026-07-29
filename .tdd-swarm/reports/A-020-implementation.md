# A-020 — Implementation Report

**Status:** DONE
**Branch:** `ticket/a-020-eas-project-link`
**Files changed:** `app.json` (EAS-created non-secret metadata) and this report.

## Evidence

- RED observed first: `npx vitest run __tests__/app/eas-project.test.ts` exited 1 because `expo.extra.eas.projectId` was `undefined`.
- Ran `npx eas-cli init --account worldofhacks --non-interactive`.
- EAS created and linked `@worldofhacks/cannon-academy` with project ID `be5be296-c153-4619-81ea-423c51a84ae8`.
- `npx eas-cli project:info` exited 0 and identified `@worldofhacks/cannon-academy` with the same ID.

## Configuration change

`app.json` now contains the EAS CLI-generated `expo.owner`, `expo.extra.router`, and
`expo.extra.eas.projectId` metadata. The diff was inspected; it contains no token, password,
callback code, or other credential.

## Gate results

| Gate | Result |
| --- | --- |
| `npx vitest run __tests__/app/eas-project.test.ts` | PASS (1 / 1) |
| `npm run format` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS (41 files, 2,015 tests) |
| `.tdd-swarm/spec-lint.sh tickets/app/A-020.md` | PASS |
| `git diff --check` | PASS |

`run-local-gates.sh` reached its frozen-test-history gate and reported existing predecessor
commits from the app-shell ancestry (`A-017`/chart/design-fidelity), not a working-tree test
change from this ticket. The requested targeted and full test gates above pass; the working-tree
diff is limited to `app.json` and this report.

No deployment was performed.
