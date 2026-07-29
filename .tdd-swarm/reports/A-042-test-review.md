# A-042 Final Test Review — APPROVED

Candidate test amendment: `ec8e84e`; reviewed test SHA-256:
`16fb2240117f72ff1a74e89889bfd44877cdae45186b86546994ea53a9103ad5` (**matches expected**).
No production or test file was edited.

## Verdict

**APPROVED.** The amended suite strongly and satisfiably pins all A-042 acceptance criteria at the
headless-test layer, while leaving rendered release-width completeness to the ticket's explicitly
required simulator/web visual evidence.

## Evidence

- The pure gate rejects repeated pending starts without acknowledging or navigating.
- Readiness is bound to both fonts and a captured hydrated destination; Splash's pending branch
  early-returns the three-lamp loader before the ready action.
- Ready Splash contains exactly one direct accessible `SET SAIL` Pressable wired to `onStart`, and
  readiness alone performs no gate navigation.
- Same-turn double starts are exercised directly and produce exactly one navigation.
- Captured routing is tested with two distinct resolver outputs, `onboarding` and `chart`; a gate
  hard-coded to either destination cannot pass.
- AC-4 persists and hydrates a genuinely progressed, chart-bound captain, verifies retained coins
  and wins, and proves a fresh gate instance resets acknowledgement while preserving the resolved
  destination.
- Root acknowledgement state is initialized from and updated from the process-local gate, with no
  persisted launch marker.
- The root TSX AST permits exactly one unaliased `router` binding/reference and one
  `router.replace` call, located inside the inline callback passed to the sole
  `launchGate.start`. Router aliases, wrappers, effect navigation, alternate expo-router imports,
  and the prior automatic redirect cannot satisfy the contract.
- Exact picker strings are frozen. TypeScript TSX parsing binds `numberOfLines={1}`,
  `adjustsFontSizeToFit`, and the bounded `minimumFontScale` to the exact problem and label Text
  nodes, eliminating cross-node accumulation. The problem node's own line height must be strictly
  greater than its font size.
- The ticket honestly requires iPhone and 360×640 / 375×812 web visual evidence for actual
  non-truncation; the source test does not claim to simulate native layout.

## Gates run

- Focused A-042 suite: **RED, 6/6 failed** against pre-implementation production, as expected.
- Test SHA-256: **PASS**.
- Prettier check: **PASS**.
- TypeScript no-emit check: **PASS**.

