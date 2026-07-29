# A-024 Frozen-Test Design Review

## Verdict

**FIX_NEEDED**

The eight tests are meaningful RED and the unaffected 2,034-test baseline is green, but the suite
does not yet prevent several lazy implementations of the exact defects A-024 exists to fix. There
are four Important findings and no Critical findings. Do not freeze or dispatch an implementer at
commit `68f966e`.

## Important findings

### 1. Full-set mastery is not distinguished from any-skill mastery

Evidence: `__tests__/app/chart-progress-presentation.test.ts:182-207`

The AC-2 positive fixture masters all four real `port_sumwich.rangeSkills`, while AC-1 supplies an
entirely empty mastery map. Nothing exercises a nonempty proper subset. A production selector using
`island.rangeSkills.some(...)` instead of the required `every(...)` therefore passes both tests:
empty mastery remains available, and the all-mastered positive fixture clears.

That surviving mutation recreates a false green check after mastering only one of Port Sumwich's
four skills. Add a real-catalog boundary fixture that masters a strict, nonempty subset and requires
both `cleared === false` and `stationState(...) === 'available'`; retaining one final unmastered
skill is the strongest boundary.

### 2. The suite never proves that an `available` station renders without the cleared tick

Evidence: `__tests__/app/chart-progress-presentation.test.ts:156-180,252-273,289-321`

The state tests prove that `stationState` can return the word `available`, but no assertion binds
that state to the marker head rendered by `StationMarker`. The only Station source assertion counts
one call to `stationAffordance`, whose contract contains only a label and a boolean. A renderer can
still map both `available` and `cleared` to `ClearedHead` while all eight tests pass.

This is not theoretical implementation-detail polish: it preserves the user's reported default
green checks, even though the selector tests are green. Freeze a presentation contract that
distinguishes the five marker variants (at minimum, `available` must not select the cleared
tick/head), and prove `StationMarker` uses that result. A pure presentation model consumed by the
component is appropriate in this repository's no-renderer test environment.

### 3. Accessibility/tappability reachability accepts a dead helper call and uses impossible node/state pairs

Evidence: `__tests__/app/chart-progress-presentation.test.ts:275-321`

The AST check proves only that `StationMarker` imports and calls `stationAffordance` once. It does
not prove that the returned `accessibilityLabel` reaches a JSX accessibility prop or that
`tappable` controls `Pressable`/`onPress`. Calling the helper and discarding its return value leaves
the existing hard-coded rendered labels and tap branches untouched and still passes.

The pure test compounds the gap by passing the same unfogged Port Sumwich node for all five states,
including both locked states. It therefore does not test the criterion's real invariant that node
fog state and tappability agree. Nor does the state matrix exercise a fogged node with
`isFocus === true`; an implementation that checks focus before fog can label that node current,
despite AC-4 saying only unfogged nodes are tappable.

Use real node/state pairs for all five rows, add the fog-over-focus/cleared precedence cases, and
make the integration assertion follow the helper result into the rendered label and pressability
decision (or test an exported render/presentation model that `StationMarker` demonstrably consumes).

### 4. The fog AST assertion can pass an opaque rectangular `View` wash and rejects compliant edge-free SVG

Evidence: `__tests__/app/chart-progress-presentation.test.ts:100-145,228-235`

Scoping inspection to `Fog.tsx` is correct: `Sea.tsx` and the edge-free `Blob` implementation are
not banned, and named aliases plus namespace imports are recognized. However, the assertion bans
every direct `<Svg>` in `Fog.tsx`, not specifically a rectangular wash, while it says nothing
about a full-width absolutely positioned `View`/`Animated.View` with
`backgroundColor: chart.fog`. Replacing the current `Svg`/`Rect` overlay with that opaque block and
retaining one existing `Blob` satisfies the frozen test while preserving the reported grey box.
Conversely, a transparent SVG containing only an edge-free path is allowed by AC-3 but rejected.

Make the source guard target rectangle-producing overlay behavior in `Fog.tsx` across the supported
primitives, while allowing transparent/edge-free SVG paths and leaving `Sea.tsx` and `Blob.tsx`
outside the ban. The required native screenshots remain valuable release evidence, but they do not
repair an under- and over-constrained frozen deterministic contract.

## Checks that are sound

- Real placement is used: `resolvePlacement('g2_3')` and the live catalog determine the open
  islands rather than a duplicated placement list.
- Mastery fixtures use the production `applyAnswer`/`isMastered` threshold, not copied tuning
  literals.
- The positive current-over-cleared case and all five state names are present.
- The fog collector ignores comments, strings, unused imports, ordinary named-import aliases, and
  namespace aliases.
- Each AC is tagged and spec-lint maps AC-1 through AC-4 successfully.
- All eight target failures are assertions against missing behavior/structure, not import, parse,
  setup, or fixture errors.

## Independent verification

| Command | Result |
| --- | --- |
| `npx vitest run __tests__/app/chart-progress-presentation.test.ts` | Expected RED — 1 file, 8/8 tests fail for the intended missing implementation |
| `npx vitest run --exclude __tests__/app/chart-progress-presentation.test.ts` | PASS — 43 files, 2,034 tests |
| `.tdd-swarm/spec-lint.sh tickets/app/A-024.md` | PASS — AC-1 through AC-4 mapped; five process DoD items skipped |
| `npx prettier --check __tests__/app/chart-progress-presentation.test.ts` | PASS |
| `npx eslint __tests__/app/chart-progress-presentation.test.ts --max-warnings 0` | PASS |
| `npx tsc --noEmit` | PASS |
