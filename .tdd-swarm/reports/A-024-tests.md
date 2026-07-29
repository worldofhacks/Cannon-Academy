# A-024 Test Agent Report

## Status

RED — all four acceptance criteria are frozen in
`__tests__/app/chart-progress-presentation.test.ts`. No production, ticket, configuration, or
existing test file was changed.

## Meaningful RED

`npx vitest run __tests__/app/chart-progress-presentation.test.ts` executes eleven tests: nine fail
against the pre-implementation tree for the intended missing behaviors, while two adversarial
analyzer tests pass. They prove the fog guard allows an irregular SVG path while rejecting inline,
function-local, and `StyleSheet.create` rectangle styles, and prove the marker guard rejects an
empty tappability check plus unconditional `Pressable` and a duplicate available green tick.

| Criterion | Frozen behavior | Pre-implementation failure |
| --- | --- | --- |
| AC-1 | Real `resolvePlacement('g2_3')` islands with empty mastery are open, `cleared: false`, and `available` | `ChartNode.cleared` is absent and every non-focus open node collapses to `cleared` |
| AC-2 | Every real catalog `rangeSkills` entry must pass `isMastered`; that noncurrent island alone clears | No mastery-derived `cleared` field exists |
| AC-2 | A strict nonempty subset (every Port Sumwich skill except one) remains available | `ChartNode.cleared` is absent; the boundary cannot be represented |
| AC-2 | A fully mastered current island still presents as `current` | Current implementation returns `live` |
| AC-3 | Fog keeps irregular imported `Blob` weather and has neither an opaque SVG rectangle nor an absolute painted View wash | AST finds the current filled `<Rect>`; the synthetic guard proves an irregular `<Path>` remains allowed |
| AC-3 | Both physically possible fog states keep the real island name and requirement in accessibility | Pure presentation seam is absent |
| AC-4 | Five exact states plus fog-over-stale-current/focus precedence | Current outputs are `live`, `cleared`, `cleared`, `locked`, `silhouette` |
| AC-4 | Real possible states have distinct semantic labels/heads and tappability exactly matching `!node.fogged` | Pure presentation seam is absent |
| AC-4 | `StationMarker` dataflows the retained presentation result into the accessibility prop, tap branch, and `ClearedHead` decision | AST finds no imported/retained presentation result |

The failures are assertion failures against running code or parsed production JSX—not import
errors, invalid fixtures, comments, or decoy regex matches.

## Test design

- Placement coverage is derived from the live placement function and content catalog, not an
  island-id list copied into the test.
- Mastery records are built by applying real range answers until the engine's `isMastered`
  predicate turns true; no threshold literal is duplicated.
- A strict subset fixture masters every real Port Sumwich range skill except the last, preventing
  an incorrect `some(isMastered)` implementation.
- The five-state matrix uses possible node/state pairs, then adds stale persisted `isCurrent` plus
  forced focus on both near and far fog nodes and a fully mastered-but-fogged node to freeze fog
  precedence.
- `stationPresentation` owns marker head, semantic accessibility label, and tappability. A
  TypeScript-AST dataflow check requires `StationMarker` to retain its return value, feed the label
  to the rendered accessibility prop, return `Pressable` exactly on the tappable branch and a
  non-Pressable otherwise, and select every `ClearedHead` only through the
  `markerHead === 'cleared'` branch. Available has a distinct non-cleared head.
- Fog structure is resolved from real import declarations, JSX tags, and recursively composed
  inline/function-local/`StyleSheet.create` style objects. Filled SVG rectangles and absolutely
  spanning painted `View`/`Animated.View` washes fail; irregular SVG paths and imported `Blob`
  weather remain legal.

## Criterion mapping

| Criterion | Tests |
| --- | --- |
| AC-1 | grade 2–3 placement islands stay available and uncleared before mastery |
| AC-2 | only full range-skill mastery clears; strict subset stays available; current wins |
| AC-3 | semantic no-rectangle guard with irregular SVG/Blob allowed; possible fog labels retain name/requirement |
| AC-4 | five-state plus precedence matrix; possible-state presentation; StationMarker result dataflow |

## Commands and results

| Command | Result |
| --- | --- |
| `npx vitest run __tests__/app/chart-progress-presentation.test.ts` | EXPECTED RED — 1 file, 9 missing-behavior failures and 2 adversarial analyzer contracts passed |
| `npx vitest run --exclude __tests__/app/chart-progress-presentation.test.ts` | PASS — baseline 43 files, 2,034 tests |
| `npx prettier --check __tests__/app/chart-progress-presentation.test.ts` | PASS |
| `npx eslint __tests__/app/chart-progress-presentation.test.ts --max-warnings 0` | PASS |
| `npx tsc --noEmit` | PASS |
| `.tdd-swarm/spec-lint.sh tickets/app/A-024.md` | PASS — AC-1 through AC-4 mapped; five process DoD items skipped correctly |

An ephemeral, ignored `node_modules` symlink points to the dependency-complete app worktree for
these commands and is intentionally not staged.
