# A-018 Final Release-Evidence Audit

## Verdict

**APPROVE_EVIDENCE**

The evidence package satisfies every item under A-018 Required Release Evidence. The exact tested
commit is recorded consistently, the web and iOS screenshots visibly contain the required chart
elements, both platform reports cover all destination-and-return routes, and the isolated runtime
results contain no page, application, or worklet error. There are no Critical, Important, or Minor
findings.

Audit tip: `d9509e856101aa37ad763d3842f1beead3cc3169`.

## Exact tested commit

Both successful platform reports name the same full tested commit:
`74c42ecf6443a2199075371d7971d2829ebbb1ef`
(`.tdd-swarm/release-evidence/A-018/2026-07-29T1034-web-smoke.md:3` and
`.tdd-swarm/release-evidence/A-018/20260729T103928-0500-ios-smoke.md:3`).

Repository checks confirm:

- the commit exists, has subject `docs(app): ticket release chart verification and hosting`, and is
  an ancestor of audit tip `d9509e8`;
- recorded source tip `81ccba9` is an ancestor of `74c42ec`, and their `app/` plus `src/` trees are
  byte-identical, validating the web report's source-tip note
  (`.tdd-swarm/release-evidence/A-018/2026-07-29T1034-web-smoke.md:4`);
- `git diff --quiet 74c42ec..d9509e8 -- app src` succeeds, so no application/source change separates
  the observed build from this audit tip.

The timestamped screenshots and runtime reports are all stored under the required
`.tdd-swarm/release-evidence/A-018/` directory.

## Web evidence

Primary evidence:
`.tdd-swarm/release-evidence/A-018/2026-07-29T1034-web-smoke.md`.

The primary report records an exact 375×812 viewport, DPR 1, and UI traversal into `/chart`
(`:3-7`). Independent visual inspection of
`.tdd-swarm/release-evidence/A-018/2026-07-29T1032-web-chart-375x812-74c42ec.png`
confirms:

- captain `Sea Star` and the sea-chart header;
- coin pill;
- current ship and `YOU ARE HERE`;
- all five stations: Port Sumwich, Isla Products, Quotient Cove, Fraction Reef, and The Grandline;
- the fog bank over the unrevealed chart region;
- visible Fight, Practice, and cannon/Gun deck controls;
- no blank render, red screen, or error overlay.

The image payload is 375×812 and decodes successfully; its SHA-256 is
`842fae4d4f8fbe2339c64bdf98eeef42fbcbb5e7290a752199546bbd7d422ef2`. The additional
1280×720 screenshot is visually consistent with the required narrow-viewport capture.

The interaction table records:

- Fight → `/duel` → return to `/chart`;
- Practice → `/range` → return to `/chart`;
- Gun deck/cannon control → `/gun-deck` → return to `/chart`
  (`.tdd-swarm/release-evidence/A-018/2026-07-29T1034-web-smoke.md:23-29`).

The report records zero page/console errors, no unmatched route/red screen/blank render, and
interactive chart animation. Its only messages were two identical React Native Web
`pointerEvents` deprecation warnings, explicitly unrelated to the worklet boundary (`:31-39`).

### Auxiliary blocked report reconciliation

`.tdd-swarm/release-evidence/A-018/2026-07-29T152723Z-web-smoke-blocked.md` is not an application
failure and is not the primary web result. It records the same tested commit and an HTTP 200 Metro
server, but that auxiliary verifier had no browser backend and therefore correctly declined to
manufacture visual or interaction evidence (`:3-7,13-21`).

The orchestrator's successful report supplies the browser session, exact viewport screenshot,
interaction trace, and console/page-error inspection that the auxiliary attempt could not perform.
The two reports are therefore compatible: one documents a verifier-tool availability block; the
other provides the completed app verification at the same commit.

## iOS evidence

Primary evidence:
`.tdd-swarm/release-evidence/A-018/20260729T103928-0500-ios-smoke.md`.

The report records a clean detached `app/shell` checkout, iPhone 17 Pro simulator, iOS 26.5, exact
tested commit, screenshot name, dimensions, byte size, and SHA-256 (`:3-10`). The stored image is a
1206×2622 RGBA PNG, and its independently calculated SHA-256 exactly matches the report:
`a1716737faba23c8d0cf5ce32334d1f210683cf0ffb6fa964f16dbb242557279`.

Independent visual inspection of
`.tdd-swarm/release-evidence/A-018/20260729T103416-0500-ios-chart.png` confirms:

- captain `A018` and the sea-chart header;
- coin pill;
- current ship and `YOU ARE HERE`;
- all five named stations;
- the fog bank;
- visible Fight, Practice, and cannon/Gun deck controls;
- no red screen or error overlay.

The report records fresh app data, onboarding through the guided-duel stub, and the rebuilt first
frame without a red screen or worklet exception (`:12-17`). It also records:

- Fight → duel → anchor return to chart;
- Practice → Gunnery Range → Leave return to chart;
- Gun deck → equipment screen → Done return to chart (`:18-20`).

A final clean Metro restart and dev-menu reload returned directly to the chart with no application
or worklet exception (`:21`). The stale Splash worklet error and unrelated placement message noted
at `:42-45` came from a reused Metro process started before checkout sync; neither recurred after
the exact-checkout clean restart. They are historical-log contamination, not failures of the tested
run.

## Deterministic evidence and route corroboration

- The independent frozen-test review is `APPROVE_FREEZE` with no findings
  (`.tdd-swarm/reports/A-018-test-design-review.md:3-9,82-94`).
- This audit re-ran `npx vitest run __tests__/app/chart-worklet-safety.test.ts`: PASS, 1 file / 14
  tests.
- This audit re-ran `.tdd-swarm/spec-lint.sh tickets/app/A-018.md`: PASS; AC-1 maps to eight tests
  and all six DoD items are explicitly process evidence.
- At tested commit `74c42ec`, `app/chart.tsx` wires Fight to `/duel`, Practice to `/range`, and the
  cannon/Gun deck control to `/gun-deck`; it uses `push` so child-screen exits return to chart
  (`app/chart.tsx:56-70,128-136`).

## Findings

### Critical

None.

### Important

None.

### Minor

None.
