# A-021 Final Test-Design and Release-Evidence Review

## Verdict

**APPROVE_FREEZE_AND_EVIDENCE**

No Critical, Important, or Minor findings remain. The two Important findings from the first
test-design review are closed, AC-1 is suitable to freeze, and the native evidence satisfies every
required release observation at exact runtime commit
`f6a3cee3156dd1de5aae85f06c5afaddd5c35688`.

## Frozen-test review

### Prior Important 1 — exact-site binding and decoy resistance: closed

The revised test no longer treats an arbitrary compliant literal in the same file as proof:

- `styledTextValues` requires exactly one `Text` node carrying each shipped style-site name, then
  resolves the child rendered by that node.
- The HUD anchor, both branches of the HUD turn pip, and the Watch-panel triangle are asserted
  independently.
- `rivalImpactIcon` enters the one `resolveCopy` function, the one `rivalImpact` case, and that
  returned object's one `icon` property.
- The mutation test changes the real HUD branch to bare
  `String.fromCodePoint(0x25c0)`, appends a compliant `◀︎` decoy, and proves the site assertion still
  reports `U+25C0` without `U+FE0E`.

The evaluator handles the relevant statically knowable forms—conditionals, concatenation,
templates, const aliases, wrapper expressions, numeric string construction, and decoded JSX
entities—and rejects an unknown runtime value rather than treating it as compliant.

### Prior Important 2 — whole-app overreach: closed

The former recursive whole-app literal ban is gone. The contract opens only the three files that
own the four ticketed render sites:

- `src/components/duel/Hud.tsx`
- `src/components/duel/Panels.tsx`
- `app/duel.tsx`

It does not impose a policy on unrelated anchors, triangles, components, or future intentionally
emoji-presented content. All five tests carry `spec(A-021:AC-1)`, and spec-lint maps AC-1 to all
five while correctly treating the four DoD entries as process checks.

## Native release-evidence review

I inspected the report and each of the 12 PNGs at original resolution. The filenames, visible
simulator times, UI sequence, and recorded state transitions are mutually consistent.

| Required observation | Independent evidence check |
| --- | --- |
| Exact runtime and fresh onboarding | The report records iPhone 17 Pro / iOS 26.5, a fresh data container, and full commit `f6a3cee…`; the separate runtime checkout still resolves to that exact commit. PNG 01 shows the fresh grade picker, and PNG 02 shows the resulting `A021 Tide` captain, Green flag, zero-coin chart, and expected initial fog. |
| Native text-presentation glyphs | PNG 03 visibly shows the monochrome HUD anchor and right triangle. PNG 05 visibly shows the monochrome left triangle in both the rival-turn HUD and Watch panel. The frozen site-bound assertion pins the transient `rivalImpact` icon to the same `U+25C0 U+FE0E` sequence, and the runtime report records repeated traversal of that phase without a render/runtime fault. |
| Fight, answer, timeout, and D-8 | PNG 04 records pre-timeout hulls `92/100` and `35/45`; PNG 05 records the same hulls after the unanswered fuse and before the rival volley. PNG 06 shows the required “Damp powder” / “Nothing lost” panel. PNG 07 shows a six-turn victory summary of `4 of 4 right · 2 perfect`; with the report's four answered turns and two expired fuses, both timeouts are excluded from both `asked` and `correct`. |
| Sink, reward, chart progress, and fog | PNG 07 shows rival `0/45` and `SUNK`; PNG 08 shows Chain Shot and `+42`; PNG 09 shows 42 persisted coins, one filled progress cell, Port Sumwich current, and Fraction Reef / The Grandline still coherently fogged. |
| Practice and return | PNG 10 shows Port Sumwich's gunnery range with Addition within 10 at 20%; the report records Leave returning to chart. |
| Force-close and persistence | The report records `simctl terminate` and icon relaunch. PNG 11 reproduces the same captain name, Green flag, 42 coins, current station, fog, and one-cell progress after relaunch. PNG 12 reproduces the same 20% practice meter after relaunch. |
| Runtime audit | The report records no Metro application warning/error, no red screen, and no focused unified-log match for worklet/Reanimated/RedBox/RCTFatal/uncaught/unhandled/JavaScript/fatal/exception patterns. The listed IOHID, CoreHaptics, unused-port probe, and future UIScene messages are simulator/template noise rather than app failures. |

The transient `rivalImpact` frame does not have its own PNG. This is not a blocking evidence gap:
the exact source site is independently frozen, the same native runtime visibly renders the same
left-triangle-plus-selector sequence correctly at two other shipped sites, and the uninterrupted run
records repeated traversal of `rivalImpact` without error.

## Independent gate evidence

| Command | Result |
| --- | --- |
| `npx vitest run __tests__/app/text-presentation-glyphs.test.ts --reporter=dot` | PASS — 1 file, 5 tests |
| `npx vitest run --reporter=dot` | PASS — 43 files, 2,034 tests |
| `.tdd-swarm/spec-lint.sh tickets/app/A-021.md` | PASS — AC-1 maps to 5 tests |
| `npx prettier --check` on the frozen test and native report | PASS |
| `npx eslint . --max-warnings 0` | PASS |
| `npx tsc --noEmit` | PASS |
| `git diff --check f6a3cee..1545a71` | PASS |

The repository gate wrapper also passed format, lint, typecheck, full unit, no-TODO,
no-skipped-test, and engine-purity checks. It exits red only because its branch-wide
`swarm/engine-core..HEAD` history check reports three inherited app commits (`81ccba9`, `ca3c6ce`,
and `f9ed263`) whose production commit subjects carried tests. A-021 did not introduce those
commits: its post-runtime test change is commit `af55695` with the allowed `test(A-021)` subject,
and `f6a3cee..1545a71` contains no `app/` or `src/` change.
