# A-025 Final Test-Design Review — APPROVED

Reviewed HEAD `41a86fd`, including the formatting-only change over the approved design at
`968781b`.

## Verdict

**APPROVED** — no Critical or Important test-design findings remain, and the prior formatting
blocker is closed.

The suite covers the real native/web `auth/invalid-api-key` paths and ambient fail-closed
bootstrap, exact AsyncStorage persistence across iOS/Android reloads, exact Auth and Firestore
fallback discrimination, unavailable-service startup, non-`any` typed results and nullable
exports, dotenv ignore behavior, deny-all repository configuration, and honest separation of
AC-6 through AC-8/DoD-4 process evidence.

Verification:

- `npx prettier --check __tests__/app/firebase.test.ts` — PASS
- `bash .tdd-swarm/spec-lint.sh tickets/app/A-025.md` — PASS
- Formatting commit `41a86fd` changes presentation only; it does not alter the approved
  assertions or contract.
- The previously observed focused RED collected 26 tests and failed on the intended missing
  production/config artifacts.

The A-025 RED suite is approved for freeze.
