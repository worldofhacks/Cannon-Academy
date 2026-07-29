# A-024 Frozen-Test Design Final Re-review

## Verdict

**APPROVE_FREEZE**

At test tip `07ee067`, all four Important findings from the original review and all three gaps from
the intermediate re-review are closed. There are no remaining Critical or Important findings.
Production and ticket files are untouched.

## Closed findings

### Full-set mastery boundary

The live multi-skill Port Sumwich fixture now masters a strict nonempty subset—every range skill
except one—and requires both `cleared === false` and `available`
(`__tests__/app/chart-progress-presentation.test.ts:590-614`). An erroneous
`rangeSkills.some(isMastered)` implementation no longer passes.

### Available cannot reuse the cleared green-tick presentation

`stationPresentation` exposes a five-way marker-head contract, and the real-state matrix requires
`available` to produce `available`, distinct from `cleared`
(`__tests__/app/chart-progress-presentation.test.ts:743-806`). The component guard counts every
`ClearedHead` occurrence and accepts it only when controlled by the retained
`markerHead === 'cleared'` result (`__tests__/app/chart-progress-presentation.test.ts:410-530`).
The synthetic duplicate-tick mutant proves an additional available-to-`ClearedHead` path is
rejected (`__tests__/app/chart-progress-presentation.test.ts:816-851`).

### Rendered accessibility and pressability are bound to the presentation result

The guard requires the returned presentation object to be retained, its accessibility label to
reach a JSX `accessibilityLabel`, and every `Pressable` in `StationMarker` to occur only on the
truth-matched tappable branch (`__tests__/app/chart-progress-presentation.test.ts:410-530`).
The adversarial empty `if (p.tappable) {}` plus unconditional `Pressable` fixture is rejected
(`__tests__/app/chart-progress-presentation.test.ts:816-851`), closing the former dead-call bypass.

All five presentation rows now use physically possible node/state pairs, and tappability is
compared directly with `!node.fogged`
(`__tests__/app/chart-progress-presentation.test.ts:743-806`).

### Fog precedence is complete

The matrix freezes near and far fog over stale current/focus state and additionally masters every
skill on an island that remains fogged, requiring it to stay `locked-near`
(`__tests__/app/chart-progress-presentation.test.ts:704-741`). Current-over-cleared remains covered
for an unfogged mastered island.

### Fog guard targets the reported rectangular wash without banning edge-free art

The source analyzer rejects opaque SVG `Rect` washes and full-span painted native or animated
Views. It resolves inline objects, function-local variables, composed arrays/spreads, and
`StyleSheet.create` entries (`__tests__/app/chart-progress-presentation.test.ts:184-333`). Its live
synthetic contract counts all three View-style forms while allowing an irregular SVG path
(`__tests__/app/chart-progress-presentation.test.ts:635-680`). Inspection remains scoped to
`Fog.tsx`, so `Sea.tsx` and the edge-free SVG implementation behind imported `Blob` are not
prohibited.

## Meaningful RED and gates

| Command | Result |
| --- | --- |
| `npx vitest run __tests__/app/chart-progress-presentation.test.ts` | Expected RED — 9 missing-behavior failures; 2 adversarial analyzer contracts pass |
| `.tdd-swarm/spec-lint.sh tickets/app/A-024.md` | PASS — AC-1 through AC-4 mapped; process DoD items skipped |
| `npx prettier --check __tests__/app/chart-progress-presentation.test.ts .tdd-swarm/reports/A-024-tests.md` | PASS |
| `npx eslint __tests__/app/chart-progress-presentation.test.ts --max-warnings 0` | PASS |
| `npx tsc --noEmit` | PASS |

The target failures are assertions against the missing A-024 production behavior, not collection,
import, parse, fixture, or setup errors. Commit `07ee067` changes only
`__tests__/app/chart-progress-presentation.test.ts` and `.tdd-swarm/reports/A-024-tests.md`.
