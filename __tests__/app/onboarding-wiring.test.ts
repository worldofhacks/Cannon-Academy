/**
 * A-005 — onboarding wired to placement, and the root layout wired to the flow resolver.
 *
 * Board 1a already renders correctly. What is missing is everything behind the tap: the chosen
 * band goes into component state and the screen pushes to `/duel`, so `resolvePlacement` is never
 * called with it and the islands and starter cannons the whole placement design exists to grant
 * are never granted. These tests assert the wiring, not the pixels.
 *
 * **Why there is no rendering here.** vitest runs in a node environment and React Native's entry
 * point is Flow-typed, which the node parser cannot read — importing `app/onboarding.tsx` or
 * `app/_layout.tsx` fails to parse before a single assertion runs, and that failure would look
 * like RED while proving nothing. So the wiring is asserted where it belongs: against the captain
 * store, the flow resolver, and a PURE commit function the screen calls.
 *
 * **The module this ticket assumes.** `src/services/onboarding.ts`:
 *
 *     commitGradeBand(store: CaptainStore, band: GradeBand): Destination
 *
 * It writes the band through the store (which is what calls `resolvePlacement`) and returns the
 * destination the flow resolver gives for the captain that results. The return type is what stops
 * the screen inventing its own next route — the screen navigates to what it is handed.
 *
 * **Two source-text assertions** (`_layout.tsx`, `onboarding.tsx`) read the screens as TEXT rather
 * than importing them, so no RN module is parsed. There is precedent: `player-store.test.ts`
 * `spec(A-001:AC-7)` guards the store's import boundary the same way. They are the only mechanism
 * available for "and from nowhere else", which is a claim about what the file does NOT do and is
 * therefore invisible to any test of the function's output.
 *
 * **AC-4 is deliberately not tested here.** "Given a 360×640 screen, all three cards meet
 * `MIN_TAP_TARGET` and no content is clipped" is screen geometry under a real layout pass, and
 * `.tdd-swarm/posture.md` records the owner-approved, conditional deferral of component-level
 * frozen tests for `app/**`. AC-4 is held by mechanism (3) of that deferral — screenshot evidence
 * at 360×640 / 375 / 390×844 / 430×932, attached to the ticket and reviewed by a second agent. A
 * test asserting `MIN_TAP_TARGET >= 44` here would assert a constant this ticket does not change
 * and would report the criterion as covered when nothing had been measured. That is worse than an
 * honest gap, so it is left as an honest gap.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { cannons } from '../../src/content/index';
import { GRADE_BANDS, type CannonId } from '../../src/content/schemas';
import { resolvePlacement } from '../../src/engine/placement';
import { DESTINATIONS, resolveDestination } from '../../src/services/flow';
import { commitGradeBand } from '../../src/services/onboarding';
import { hydrate, persist, type KeyValueStore } from '../../src/services/persistence';
import { createCaptainStore, emptyCaptain, type CaptainStore } from '../../src/stores/player';

/** An in-memory stand-in for AsyncStorage, exactly as `persistence.test.ts` builds it. */
function fakeStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  const store: KeyValueStore = {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
  };
  return { store, data };
}

/**
 * The cannons placement is allowed to grant at a band, DERIVED from the live catalog and owner
 * rulings D-6 + D-9. Not a hand-copied id list: starters plus the two approved exceptions.
 */
function expectedPlacementCannons(band: (typeof GRADE_BANDS)[number]): CannonId[] {
  const placement = resolvePlacement(band);
  return [...placement.unlockedCannons].sort();
}

const sorted = (ids: readonly CannonId[]): CannonId[] => [...ids].sort();

const readSource = async (relative: string): Promise<string> => {
  const fs = await import('node:fs/promises');
  return fs.readFile(new URL(relative, import.meta.url), 'utf8');
};

let store: CaptainStore;
beforeEach(() => {
  store = createCaptainStore();
});

describe('A-005 onboarding wiring', () => {
  it('spec(A-005:AC-1) committing a band writes placement’s cannons and islands into the captain', () => {
    // Swept across every band rather than sampled: a wiring bug that only reaches `k_1` is a bug
    // that only a five-year-old finds.
    for (const band of GRADE_BANDS) {
      const fresh = createCaptainStore();
      commitGradeBand(fresh, band);

      const captain = fresh.getState().captain;
      const placement = resolvePlacement(band);

      expect(captain.gradeBand).toBe(band);
      expect(sorted(captain.ownedCannons)).toEqual(sorted(placement.unlockedCannons));
      expect([...captain.unlockedIslands].sort()).toEqual([...placement.unlockedIslands].sort());
    }
  });

  it('spec(A-005:AC-1) placement grants starters plus only D-9 exceptions, per owner rulings', () => {
    for (const band of GRADE_BANDS) {
      const fresh = createCaptainStore();
      commitGradeBand(fresh, band);

      const granted = fresh.getState().captain.ownedCannons;
      expect(sorted(granted)).toEqual(expectedPlacementCannons(band));

      for (const id of granted) {
        const cannon = cannons.find((c) => c.id === id);
        expect(cannon, `granted unknown cannon ${id}`).toBeDefined();
        const isStarter = cannon!.unlock.kind === 'starter';
        const isException =
          (id === 'six_pounder' && (band === 'g2_3' || band === 'g4_5')) ||
          (id === 'twelve_pounder' && band === 'g4_5');
        expect(isStarter || isException, `${id} is not an approved placement grant at ${band}`).toBe(
          true,
        );
      }
    }
  });

  it('spec(A-005:AC-1) the captain leaves the picker able to sail — a gun equipped, an island to sail to', () => {
    commitGradeBand(store, 'k_1');
    const c = store.getState().captain;

    // Not decoration: an empty loadout diverts to the gun deck (`spec(A-003:AC-6)`) and a null
    // island leaves the chart with nowhere to put the ship. Placement writing them is what makes
    // the next screen reachable at all.
    expect(c.equippedCannons.length).toBeGreaterThan(0);
    expect(c.equippedCannons.every((id) => c.ownedCannons.includes(id))).toBe(true);
    expect(c.currentIsland).not.toBeNull();
  });

  it('spec(A-005:AC-2) the committed band and its unlocks survive a persist/hydrate round-trip', async () => {
    const io = fakeStorage();
    commitGradeBand(store, 'g4_5');
    const written = store.getState().captain;

    await persist(io.store, written);
    const { captain: rehydrated } = await hydrate(io.store);

    expect(rehydrated).toEqual(written);
    expect(rehydrated.gradeBand).toBe('g4_5');
    expect(sorted(rehydrated.ownedCannons)).toEqual(sorted(written.ownedCannons));
    expect(rehydrated.unlockedIslands).toEqual(written.unlockedIslands);
  });

  it('spec(A-005:AC-2) a relaunch after committing never returns the captain to the grade picker', async () => {
    const io = fakeStorage();
    commitGradeBand(store, 'k_1');
    await persist(io.store, store.getState().captain);

    const { captain: rehydrated, recovered, migrated } = await hydrate(io.store);
    expect(recovered).toBe(false);
    expect(migrated).toBe(false);
    // The failure this exists to prevent: a returning captain shown onboarding, which looks to a
    // child exactly like their progress was erased.
    expect(resolveDestination(rehydrated)).not.toBe('onboarding');
  });

  it('spec(A-005:AC-3) a fresh captain resolves to the picker; a committed band moves on to name/flag', () => {
    expect(resolveDestination(emptyCaptain())).toBe('onboarding');

    commitGradeBand(store, 'k_1');
    expect(resolveDestination(store.getState().captain)).toBe('name-flag');
  });

  it('spec(A-005:AC-3) the commit hands back the resolver’s destination, never a route of its own', () => {
    for (const band of GRADE_BANDS) {
      const fresh = createCaptainStore();
      const returned = commitGradeBand(fresh, band);

      // The screen navigates to what it is handed. If this returned anything other than the
      // resolver's answer there would be two places deciding the flow, which is the exact defect
      // A-003 exists to remove.
      expect(returned).toBe(resolveDestination(fresh.getState().captain));
      expect(DESTINATIONS as readonly string[]).toContain(returned);
    }
  });

  it('spec(A-005:AC-3) the root layout asks the flow resolver and decides nothing itself', async () => {
    const src = await readSource('../../app/_layout.tsx');

    expect(src).toMatch(/resolveDestination/);
    expect(src).toMatch(/services\/flow/);

    // "From nowhere else" is a claim about what the file does NOT do, so it is asserted as an
    // absence: a layout that reads captain fields is re-deciding the flow beside the resolver,
    // and the second decision is the one that drifts.
    for (const field of [
      'gradeBand',
      'hasCompletedOnboarding',
      'hasFoughtGuidedDuel',
      'equippedCannons',
      'unlockedIslands',
    ]) {
      expect(src, `_layout.tsx branches on captain.${field} instead of delegating`).not.toMatch(
        new RegExp(field),
      );
    }
  });

  it('dod(A-005:3) the picker writes the band through the store and holds none of it in component state', async () => {
    const src = await readSource('../../app/onboarding.tsx');

    expect(src).toMatch(/commitGradeBand/);
    // The band held in `useState` is the whole defect: it dies with the component, so nothing is
    // ever placed and nothing is ever persisted.
    expect(src).not.toMatch(/useState<\s*GradeBand/);
    // Pushing straight to `/duel` is the hardcoded route that bypasses the resolver.
    expect(src).not.toMatch(/router\.(push|replace)\(\s*['"]\/duel['"]/);
  });
});

/**
 * A-005 — the onboarding board's twenty beats, and the five screens they collapse onto.
 *
 * The board is twenty states of one frame selected by `state.i`, not twenty routes. The script that
 * drives them lives in `src/components/onboarding/script.ts` precisely so it can be asserted here:
 * it imports no React and no `react-native`, which is the same discipline that keeps `flow.ts` and
 * `player.ts` testable headless.
 */
const readOnboardingSource = async (relative: string): Promise<string> => {
  const fs = await import('node:fs/promises');
  return fs.readFile(new URL(relative, import.meta.url), 'utf8');
};

describe('A-005 the onboarding script', () => {
  it('spec(A-005:AC-3) every chart beat has a spoken line, and its spotlights name real hub controls', async () => {
    const { CHART_BEATS } = await import('../../src/components/onboarding/script');
    const { chartHubControlLayout } = await import('../../src/services/flow');
    const ids = new Set(chartHubControlLayout({ width: 375, height: 667 }).controls.map((c) => c.id));

    expect(CHART_BEATS.length).toBe(4);
    for (const beat of CHART_BEATS) {
      expect(beat.coach.line.trim(), `${beat.id} has no coach line`).not.toBe('');
      for (const spotlight of beat.spotlights) {
        // A ring pointed at a control the chart does not lay out is a ring drawn at (0,0), which
        // reads to a child as "tap the corner of the screen".
        expect(ids.has(spotlight), `beat ${beat.id} rings unknown control ${spotlight}`).toBe(true);
      }
    }

    // Rule ONE THING: a beat that asks for a tap has exactly one lit target. The pills beat is the
    // one that rings two, and it asks for nothing — it names the two nouns.
    const dock = CHART_BEATS.find((b) => b.id === 'dock');
    expect(dock?.spotlights).toEqual(['duel']);
  });

  it('spec(A-005:AC-3) a stored beat index can never render a beat that does not exist', async () => {
    const { CHART_BEATS, clampChartBeat } = await import('../../src/components/onboarding/script');
    const last = CHART_BEATS.length - 1;

    // `onboardingBeat` is tolerated-as-absent, so it arrives as `undefined` from any save written
    // before it shipped and as anything at all from a corrupt one.
    for (const [given, expected] of [
      [undefined, 0],
      [-3, 0],
      [0, 0],
      [2, 2],
      [99, last],
      [Number.NaN, 0],
      [1.8, 1],
    ] as const) {
      expect(clampChartBeat(given as number | undefined), `clampChartBeat(${String(given)})`).toBe(
        expected,
      );
    }
  });

  it('spec(A-005:AC-3) the send-off says "Captain" once, however the captain got their name', async () => {
    const { readyHeadline, isUnnamedCaptain } = await import('../../src/components/onboarding/script');
    const { DEFAULT_CAPTAIN_NAME } = await import('../../src/stores/player');

    // The shared predicate, asserted directly — it has two call sites (this headline and the name
    // screen's echo banner) and the same bug shipped at both, which is why it is one function.
    expect(isUnnamedCaptain(DEFAULT_CAPTAIN_NAME)).toBe(true);
    expect(isUnnamedCaptain('')).toBe(true);
    expect(isUnnamedCaptain('  captain ')).toBe(true);
    expect(isUnnamedCaptain('Wren')).toBe(false);
    expect(isUnnamedCaptain('Captainia'), 'a name containing the word is still a name').toBe(false);

    // Caught on a device. "Captain" is a SALUTATION in this headline, and it is also the name the
    // store substitutes for anyone who skips the name screen — so the most common captain in the
    // app rendered "Ready, Captain Captain!". The original guard only checked for an empty string,
    // which `setNameAndFlag` makes unreachable: it defaults at commit, so the stored name is the
    // literal word, never ''. The guard was live code protecting a state that cannot occur.
    expect(readyHeadline('Wren')).toBe('Ready, Captain Wren!');
    expect(readyHeadline(DEFAULT_CAPTAIN_NAME)).toBe('Ready, Captain!');
    expect(readyHeadline('')).toBe('Ready, Captain!');
    expect(readyHeadline('   ')).toBe('Ready, Captain!');
    // The rename sheet lets an adult type the word themselves, in any casing.
    expect(readyHeadline('captain')).toBe('Ready, Captain!');
    expect(readyHeadline('  CAPTAIN  ')).toBe('Ready, Captain!');

    // A name that merely CONTAINS the word is still that child's name, and must survive intact.
    expect(readyHeadline('Captainia')).toBe('Ready, Captain Captainia!');

    // Only for names that do not themselves contain the word — "Captainia" correctly yields two
    // matches, one salutation and one belonging to the child, and collapsing that would rename them.
    for (const name of ['Wren', DEFAULT_CAPTAIN_NAME, '', '   ', 'captain', '  CAPTAIN  ', 'Bo']) {
      expect(readyHeadline(name).match(/captain/gi), `"${name}" says Captain twice`).toHaveLength(1);
    }
  });

  it('spec(A-005:AC-3) the impact line counts the blocks the engine actually broke', async () => {
    const { guidedCoach } = await import('../../src/components/onboarding/script');

    // The board hardcodes "You broke three of their blocks!" because its prototype has no engine.
    // Ours does, and the beat's entire job is teaching a child to count the blocks that vanished —
    // so saying three while the hull moved by two is worse than saying nothing at all.
    for (const damage of [1, 2, 3, 5]) {
      const line = guidedCoach({ phase: 'impact', turn: 1, damage, chestOpen: false }).line;
      expect(line, `impact at ${damage} damage`).toContain(String(damage));
    }
    expect(guidedCoach({ phase: 'impact', turn: 1, damage: 0, chestOpen: false }).line).not.toMatch(/\d/);
  });

  it('spec(A-005:AC-3) the first question promises no clock, and every live phase has a line', async () => {
    const { guidedCoach } = await import('../../src/components/onboarding/script');
    const phases = [
      'select',
      'question',
      'perfect',
      'fly',
      'impact',
      'miss',
      'timeout',
      'watch',
      'rivalFly',
      'rivalImpact',
      'victory',
      'defeat',
    ] as const;

    for (const phase of phases) {
      const coach = guidedCoach({ phase, turn: 1, damage: 2, chestOpen: false });
      expect(coach.line.trim(), `${phase} has no coach line`).not.toBe('');
    }

    // Rule NO CLOCK: *"the fear of a hidden timer is nearly as bad as a timer"* — so the absence is
    // stated out loud, on the first question a child is ever asked and not on the later ones.
    const first = guidedCoach({ phase: 'question', turn: 1, damage: 0, chestOpen: false });
    expect(`${first.line} ${first.sub}`.toLowerCase()).toContain('no clock');

    // Rule SAFETY, and the single most important line in the flow.
    const wrong = guidedCoach({ phase: 'miss', turn: 2, damage: 0, chestOpen: false });
    expect(`${wrong.line} ${wrong.sub}`.toLowerCase()).toContain('nothing broke');
  });

  it('spec(A-005:AC-3) the caregiver note claims only what the engine actually does', async () => {
    const { CAREGIVER_NOTE } = await import('../../src/components/onboarding/script');
    const store = createCaptainStore();
    store.getState().setGradeBand('k_1');

    // The board's line promises the band *"moves on its own as your captain gets better"*. Nothing
    // in the app writes `gradeBand` except the picker, and `maxGradeForBand` makes the band a hard
    // ceiling — A-051 exists to enforce that a K-1 captain is never shown multiplication at all.
    // So the note must not make that promise. If a future ticket makes the band adaptive, this test
    // is the thing to delete, and deleting it should be a deliberate act.
    const state = store.getState() as unknown as Record<string, unknown>;
    const actions = Object.keys(state).filter((key) => typeof state[key] === 'function');
    expect(actions.filter((name) => /gradeBand/i.test(name))).toEqual(['setGradeBand']);
    expect(CAREGIVER_NOTE.toLowerCase()).not.toMatch(/moves on its own|adjusts|gets harder by itself/);
    expect(CAREGIVER_NOTE.toLowerCase()).toContain('where to start');
  });
});

describe('A-005 the chart walkthrough overlay', () => {
  it('spec(A-005:AC-3) the overlay is self-contained — it never reaches into the chart route', async () => {
    const src = await readOnboardingSource('../../src/components/onboarding/ChartWalkthrough.tsx');

    // The chart is being rewritten beside this. A component that imported the route would couple
    // the two files' change cadence, and the overlay's whole value is that it does not.
    expect(src, 'the overlay imports app/chart.tsx').not.toMatch(/from\s+['"].*app\/chart/);
    // It derives ring geometry from the same pure model the chart passes to its own dock/header,
    // so the two cannot disagree about where a control is.
    expect(src).toMatch(/chartHubControlLayout/);
  });

  it('spec(A-005:AC-3) beat 20’s Sail! is the app’s only caller of completeOnboarding', async () => {
    const fs = await import('node:fs/promises');
    const { join } = await import('node:path');

    const roots = ['app', 'src'];
    const hits: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const text = await fs.readFile(full, 'utf8');
        // The declaration and the type live in the store; only CALLS count.
        if (/completeOnboarding\(\)/.test(text) && !full.endsWith('stores/player.ts')) hits.push(full);
      }
    };
    for (const root of roots) await walk(join(process.cwd(), root));

    // Before beat 20 existed, `completeOnboarding` had no caller in the app at all — only two test
    // fixtures — so `hasCompletedOnboarding` could never become true on a real device. Beat 20 is
    // its one and only home, and the board's own `restart` binding is NOT implemented, because
    // that resets the prototype to beat zero.
    expect(hits.map((f) => f.replace(`${process.cwd()}/`, ''))).toEqual([
      'src/components/onboarding/ChartWalkthrough.tsx',
    ]);
  });
});

describe('A-006 the six flags carry shape and mark, not colour alone', () => {
  it('spec(A-006:AC-4) three swallowtail, three rectangular, and six distinct marks', async () => {
    const { FLAGS } = await import('../../src/theme/flags');

    // The onboarding board's reading audit: *"six flags differing by shape and mark, not colour
    // alone."* Its own set reuses `circle` twice, which defeats the point of having a mark.
    const shapes = FLAGS.map((f) => f.shape);
    expect(shapes.filter((s) => s === 'swallowtail')).toHaveLength(3);
    expect(shapes.filter((s) => s === 'rectangular')).toHaveLength(3);
    expect(new Set(FLAGS.map((f) => f.mark)).size).toBe(FLAGS.length);

    // Alternating, so no two cards adjacent in the two-column grid share a silhouette.
    for (let i = 1; i < shapes.length; i += 1) expect(shapes[i]).not.toBe(shapes[i - 1]);
  });

  it('spec(A-006:AC-4) every mark clears the 3:1 non-text floor against its own flag', async () => {
    const { FLAGS } = await import('../../src/theme/flags');
    const luminance = (hex: string): number => {
      const h = hex.replace('#', '');
      const channels = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255);
      const linear = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
    };
    const contrast = (a: string, b: string): number => {
      const x = luminance(a);
      const y = luminance(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };

    // A mark is a graphical object, not text, so 3:1 is the applicable floor. It still has to be
    // met: an invisible mark leaves the palette carrying the whole load again, which is what the
    // shape/mark layer exists to stop.
    for (const flag of FLAGS) {
      const ratio = contrast(flag.markColor, flag.color);
      expect(
        ratio,
        `${flag.id}: ${flag.markColor} on ${flag.color} measures ${ratio.toFixed(2)}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('spec(A-006:AC-4) the persisted ids and hexes are untouched by the shape layer', async () => {
    const { FLAGS } = await import('../../src/theme/flags');
    // Flag ids are persisted and frozen; the hexes are what `name-flag.test.ts` AC-4 certifies for
    // hue separation. Adopting the board's palette would have failed that at 10.9°, which is why
    // only its shape/mark system was adopted.
    expect(FLAGS.map((f) => f.id)).toEqual(['flag-1', 'flag-2', 'flag-3', 'flag-4', 'flag-5', 'flag-6']);
    expect(FLAGS.map((f) => f.color)).toEqual([
      '#E03131',
      '#F59F00',
      '#2F9E44',
      '#0B8A8A',
      '#1C7ED6',
      '#9C36B5',
    ]);
  });
});

/**
 * A-005 — the coach bar reserves its band, and covers nothing.
 *
 * The defect these pin, found on a device: the chart walkthrough painted its coach bar into an
 * `absoluteFill` overlay, which reproduces the board's ink and not its LAYOUT. On the board the bar
 * is a flex sibling taking 92pt — that is exactly why the world beats' body is 555pt,
 * `667 − 20 status − 92 coach` — so the map is compressed. Ours covered it, and what it covered was
 * the fogged island's name pill and the requirement chip beneath it, which is the only copy on the
 * screen telling a child what to do next. At 375×667 "Isla Products" was sliced by the bar's top
 * edge and "Train at Port Sumwich to lift the fog." was gone entirely.
 *
 * Asserted geometrically rather than by screenshot, and at two very different shapes, because the
 * failure is an interaction between three scales: ART contain-fits the composition, TYPE sizes the
 * chips inside it, and the reserved band follows both. One viewport cannot show that.
 *
 * The counterexample is asserted too. A no-overlap test that would also pass on the broken build is
 * worse than no test, so each case computes the unreserved layout as well and requires it to fail.
 */
const chartBands = async (input: {
  readonly screenW: number;
  readonly screenH: number;
  readonly insetTop: number;
  readonly insetBottom: number;
  readonly reserved: number;
}) => {
  const { CLOSE, DOCK } = await import('../../src/components/chart/board');
  const { closeChartColumns } = await import('../../src/components/chart/layout');
  const { computeLayout, containWorldBoard } = await import('../../src/theme/responsive');

  const L = computeLayout(input.screenW, input.screenH);
  // The chart's own column, in order: an `insets.top` spacer, the `flex: 1` map, the dock band with
  // its home-indicator spacer, then the reserved coach band. The dock's inset moves to the reserved
  // band while the tour is up, which is why it is not paid twice here.
  const dockInset = input.reserved > 0 ? 0 : input.insetBottom;
  const dockHeight = DOCK.height * L.type + dockInset;
  const mapTop = input.insetTop;
  const mapHeight = input.screenH - mapTop - dockHeight - input.reserved;

  const board = containWorldBoard(input.screenW, mapHeight, CLOSE.map.width, CLOSE.map.height);
  const frame = {
    width: board.width,
    height: board.height,
    boardWidth: CLOSE.map.width,
    boardHeight: CLOSE.map.height,
    art: board.scale,
  };
  // Bottom-anchored inside the measured box, exactly as `app/chart.tsx` places it.
  const slackY = Math.max(0, mapHeight - board.height);
  const columns = closeChartColumns(frame, L.type);
  const toScreen = (top: number, height: number) => ({
    x: 0,
    y: mapTop + slackY + top,
    width: input.screenW,
    height,
  });

  return {
    coach: {
      x: 0,
      y: input.screenH - input.reserved,
      width: input.screenW,
      height: input.reserved,
    },
    dock: { x: 0, y: mapTop + mapHeight, width: input.screenW, height: dockHeight },
    fogGroup: toScreen(columns.ahead.top, columns.ahead.height),
    live: toScreen(columns.live.top, columns.live.height),
    cleared: toScreen(columns.cleared.top, columns.cleared.height),
  };
};

describe('A-005 the chart walkthrough reserves its coach band', () => {
  const shapes = [
    { label: 'reference 375×667, no insets', w: 375, h: 667, top: 0, bottom: 0 },
    { label: 'reference 375×667, notched', w: 375, h: 667, top: 59, bottom: 34 },
    { label: 'short 360×640', w: 360, h: 640, top: 24, bottom: 0 },
    { label: 'tablet 768×1024', w: 768, h: 1024, top: 24, bottom: 20 },
  ] as const;

  it('spec(A-005:AC-3) the reserved band is the board’s own 92pt at the reference frame', async () => {
    const { coachBandHeight } = await import('../../src/components/onboarding/coachBand');
    const { computeLayout } = await import('../../src/theme/responsive');
    const L = computeLayout(375, 667);

    // `667 − 20 status − 92 coach = 555`, which is the board's world body. The sub line costs
    // nothing: the 48pt badge is taller than the text stack until well past two lines.
    for (const hasSub of [false, true]) {
      expect(coachBandHeight({ art: L.a, type: L.t, hasSub, build: 'standard' })).toBe(92);
    }

    // The grown-up skip is reserved above it, and it is a TAP TARGET rather than ink: the row is
    // the 64pt floor and the pill drawn inside it is 24. Slop would not do — spent upward it steals
    // advancing taps from the dock, and spent downward it is dead under the coach bar's speaker.
    const { chartTourBandHeight, TOUR_SKIP_ROW } = await import(
      '../../src/components/onboarding/coachBand'
    );
    expect(TOUR_SKIP_ROW).toBe(64);
    const band = { art: L.a, type: L.t, hasSub: true, build: 'standard' } as const;
    expect(chartTourBandHeight({ ...band, insetBottom: 0, hasSkip: true })).toBe(92 + 64);
    expect(chartTourBandHeight({ ...band, insetBottom: 34, hasSkip: true })).toBe(92 + 64 + 34);
    // Beat 20 is a full-bleed takeover: no bar, no skip, nothing reserved.
    expect(chartTourBandHeight({ ...band, insetBottom: 0, hasSkip: false })).toBe(92);
  });

  it('spec(A-005:AC-3) no chart element sits under the coach band, at four viewports', async () => {
    const { chartTourBandHeight, coachBandHeight, intersects } = await import(
      '../../src/components/onboarding/coachBand'
    );
    const { computeLayout } = await import('../../src/theme/responsive');

    for (const shape of shapes) {
      const L = computeLayout(shape.w, shape.h);
      // The number the chart actually reserves — coach bar, grown-up skip row and the home
      // indicator — from the very function `useChartTourBand` calls, so this sweep cannot drift
      // away from the screen it describes.
      const reserved = chartTourBandHeight({
        art: L.a,
        type: L.t,
        hasSub: true,
        build: 'standard',
        insetBottom: shape.bottom,
        hasSkip: true,
      });

      const bands = await chartBands({
        screenW: shape.w,
        screenH: shape.h,
        insetTop: shape.top,
        insetBottom: shape.bottom,
        reserved,
      });

      for (const [name, rect] of [
        ['the fogged island’s name and requirement chips', bands.fogGroup],
        ['the live island’s label stack', bands.live],
        ['the cleared island’s label', bands.cleared],
        ['the dock', bands.dock],
      ] as const) {
        expect(
          intersects(rect, bands.coach),
          `${shape.label}: the coach bar covers ${name}`,
        ).toBe(false);
      }

      // Not vacuous, and the counterexample is the REAL defect rather than a convenient one. The
      // overlay build reserved nothing and floated the bar 8pt above the dock — inside the map,
      // over the bottom of the fog band, which is where the requirement chip lives.
      const unreserved = await chartBands({
        screenW: shape.w,
        screenH: shape.h,
        insetTop: shape.top,
        insetBottom: shape.bottom,
        reserved: 0,
      });
      // The bar as the broken build drew it: the coach bar alone, floated, with nothing reserved.
      // Deliberately NOT the taller coach-plus-skip band — a counterexample must be the defect that
      // actually shipped, not a bigger rectangle that overlaps more easily.
      const floated = coachBandHeight({ art: L.a, type: L.t, hasSub: true, build: 'standard' });
      const floatedBar = {
        x: 0,
        y: unreserved.dock.y - 8 - floated,
        width: shape.w,
        height: floated,
      };
      expect(
        intersects(unreserved.fogGroup, floatedBar),
        `${shape.label}: the overlay build no longer overlaps, so this test proves nothing`,
      ).toBe(true);
    }
  });

  it('spec(A-005:AC-3) the chart actually reserves the band in its flex column', async () => {
    const chart = await readOnboardingSource('../../app/chart.tsx');

    // The geometry above only holds if the map is really shortened. An overlay that merely *looks*
    // like a band would satisfy every arithmetic assertion in this file and still cover the chips.
    expect(chart, 'chart.tsx does not consult the tour band').toMatch(/useChartTourBand\(\)/);
    expect(chart, 'the reserved band is not a flex child of the screen column').toMatch(
      /tourBand > 0 \? <View style=\{\{ height: tourBand \}\} \/> : null/,
    );
    // The dock owns the home indicator, unconditionally.
    //
    // Re-baselined by owner ruling on 2026-07-30. The band used to be reserved BELOW the dock, so
    // the band held the inset and the dock was handed zero to stop it being paid twice. That left
    // the dock floating mid-screen above a strip of open water — the owner reported it as the dock
    // "in the middle of the page" — so the band moved ABOVE the dock and the dock is the footer
    // again. Whichever element is last in the column owns the inset; that is now the dock.
    expect(chart).toMatch(/insetBottom=\{insets\.bottom\}/);
  });

  it('spec(A-005:AC-3) the rings still land on the real controls once insets are taken', async () => {
    const { chartTourBandHeight, ringRect } = await import('../../src/components/onboarding/coachBand');
    const { chartHubControlLayout } = await import('../../src/services/flow');
    const { DOCK, FRAME, HEADER } = await import('../../src/components/chart/board');
    const { computeLayout } = await import('../../src/theme/responsive');

    for (const shape of shapes) {
      const L = computeLayout(shape.w, shape.h);
      // The live reservation, skip row included — the rings are derived from the height the hub
      // model is handed, so a band that grew and a sweep that did not would put every dock ring
      // one skip row low.
      const reserved = chartTourBandHeight({
        art: L.a,
        type: L.t,
        hasSub: true,
        build: 'standard',
        insetBottom: shape.bottom,
        hasSkip: true,
      });
      const controls = chartHubControlLayout({ width: shape.w, height: shape.h - reserved }).controls;

      // Where `app/chart.tsx` actually draws them.
      const realHeaderTop = shape.top + (HEADER.top - FRAME.statusBar) * L.type;
      const realDockTop = shape.h - reserved - DOCK.height * L.type;

      for (const control of controls) {
        const rect = ringRect(control, { top: shape.top, bottom: 0 });
        if (control.surface === 'header') {
          expect(rect.y, `${shape.label}: the ${control.id} ring misses the header pill`).toBeCloseTo(
            realHeaderTop,
            5,
          );
        } else {
          // The dock's controls sit inside its band; the ring only has to land within it.
          expect(rect.y, `${shape.label}: the ${control.id} ring is above the dock`).toBeGreaterThanOrEqual(
            realDockTop - 0.001,
          );
          expect(
            rect.y + rect.height,
            `${shape.label}: the ${control.id} ring runs past the dock`,
          ).toBeLessThanOrEqual(shape.h - reserved + 0.001);
        }
      }
    }
  });
});

describe('A-005 the guided duel’s coach bar squeezes nothing below the tap floor', () => {
  it('spec(A-005:AC-3) the bar is a flex sibling of the panels, so it can never cover one', async () => {
    const source = await readOnboardingSource('../../app/guided-duel.tsx');

    // The chart needed an explicit reservation because its walkthrough is an overlay. This screen
    // does not: the bar is a plain child of the parchment sheet and the panels are `flex: 1`
    // siblings, so covering is structurally impossible and only SQUEEZING is on the table.
    expect(source).toMatch(/<CoachBar coach=\{coach\} build=\{coachBuild\} \/>/);
    // If it ever acquires absolute positioning, the guarantee above evaporates silently.
    const barBlock = source.slice(source.indexOf('<CoachBar'), source.indexOf('<CoachBar') + 200);
    expect(barBlock).not.toMatch(/position:\s*'absolute'/);
  });

  it('spec(A-005:AC-3) the answer grid keeps its 64pt targets at every supported viewport', async () => {
    const { coachBandFits, coachBandHeight, DUEL_HUD_HEIGHT, DUEL_PANEL_FLOOR } = await import(
      '../../src/components/onboarding/coachBand'
    );
    const { computeLayout, seaStageHeight } = await import('../../src/theme/responsive');

    const shapes = [
      { label: 'reference 375×667, no insets', w: 375, h: 667, top: 0, bottom: 0 },
      { label: 'reference 375×667, status inset', w: 375, h: 667, top: 20, bottom: 0 },
      { label: 'short 360×640', w: 360, h: 640, top: 24, bottom: 0 },
      { label: 'notched 390×844', w: 390, h: 844, top: 59, bottom: 34 },
      { label: 'tablet 768×1024', w: 768, h: 1024, top: 24, bottom: 20 },
      { label: 'desktop 1280×800', w: 1280, h: 800, top: 0, bottom: 0 },
    ] as const;

    let compactWasNeeded = false;
    for (const shape of shapes) {
      const L = computeLayout(shape.w, shape.h);
      // The screen's own column: status inset, the static HUD, the sea stage, then the sheet.
      const sheet = shape.h - shape.top - DUEL_HUD_HEIGHT - seaStageHeight(L);
      const usable = sheet - shape.bottom;

      const standard = coachBandHeight({ art: L.a, type: L.t, hasSub: true, build: 'standard' });
      const build = coachBandFits(usable, standard) ? 'standard' : 'compact';
      if (build === 'compact') compactWasNeeded = true;
      const chosen = coachBandHeight({ art: L.a, type: L.t, hasSub: true, build });

      expect(
        usable - chosen,
        `${shape.label}: the coach bar squeezes the answer grid below its 64pt rows`,
      ).toBeGreaterThanOrEqual(DUEL_PANEL_FLOOR);
    }

    // The fallback has to be reachable, or it is dead code dressed as a safeguard — and it has to
    // be reachable on a phone we actually support, not a hypothetical one.
    expect(compactWasNeeded, 'the compact build is never used, so it is untested in practice').toBe(
      true,
    );
  });

  it('spec(A-005:AC-3) the borrowed chrome numbers still match the files they were summed from', async () => {
    const { DUEL_HUD_HEIGHT, DUEL_PANEL_FLOOR } = await import(
      '../../src/components/onboarding/coachBand'
    );
    const hud = await readOnboardingSource('../../src/components/duel/Hud.tsx');
    const question = await readOnboardingSource('../../src/components/duel/QuestionPanel.tsx');

    // Neither file is ours. The budget above is only as good as these constants, so a change to
    // either announces itself here instead of silently invalidating the arithmetic.
    expect(hud, 'the turn bar is no longer 44pt').toMatch(/height:\s*44/);
    expect(hud, 'the hull card padding changed').toMatch(/paddingTop:\s*7/);
    expect(question, 'the question row is no longer 56pt').toMatch(/minHeight:\s*56/);
    expect(question, 'the answer cell no longer claims the 64pt floor').toMatch(/minHeight:\s*64/);

    expect(DUEL_HUD_HEIGHT).toBe(146);
    expect(DUEL_PANEL_FLOOR).toBe(242);
  });
});

/**
 * A-005 — "Watch the tour again" replays the WHOLE tour.
 *
 * The row on the Rank screen says "the tour", and the tour is twenty beats: the guided duel is
 * 5–16 and the chart walkthrough is 17–20. Until now it replayed the first half only, and the
 * second half was unreachable by construction — `ChartWalkthrough` returned `null` the moment
 * `hasCompletedOnboarding` was true, and nothing in the app ever cleared that flag. The part of the
 * codebase literally named the tour was the part the row could not show.
 *
 * ## Why a third piece of state, and not the obvious fix
 *
 * The obvious fix is to clear a latch. It is also the one change here that can silently damage a
 * real child's save: `resolveDestination` step 3 reads `hasFoughtGuidedDuel`, so a captain whose
 * latch was cleared to "let them replay" is re-gated into the tutorial on the next cold start —
 * `demo-navigation.test.ts` AC-3 freezes that behaviour, and to a child it looks exactly like the
 * game deleted them. So the replay gets its own bit, `replayingTour`, and the two latches remain
 * write-once-true. `spec(A-005:AC-3)` below asserts that directly, in the store and in the source,
 * because it is the mistake that would not show up on any screen until the next launch.
 */
describe('A-005 the tour replays whole', () => {
  const finishedTourStore = (): CaptainStore => {
    const s = createCaptainStore();
    s.getState().setGradeBand('k_1');
    s.getState().setNameAndFlag('Wren', 'flag-2');
    s.getState().markGuidedDuelFought();
    s.getState().completeOnboarding();
    s.getState().addCoins(40);
    s.getState().recordDuelResult({ won: true });
    return s;
  };

  it('spec(A-005:AC-3) the chart tour shows on a first run and on a replay, and never otherwise', async () => {
    const { chartTourShowing } = await import('../../src/services/onboarding');

    // The whole of the fix, as a truth table. Row 2 is the defect: a captain who has finished the
    // tour could never see the chart half again, however they asked.
    expect(chartTourShowing({ hasCompletedOnboarding: false, replayingTour: false })).toBe(true);
    expect(chartTourShowing({ hasCompletedOnboarding: true, replayingTour: false })).toBe(false);
    expect(chartTourShowing({ hasCompletedOnboarding: true, replayingTour: true })).toBe(true);
    expect(chartTourShowing({ hasCompletedOnboarding: false, replayingTour: true })).toBe(true);
  });

  it('spec(A-005:AC-3) a full replay reaches the chart beats and ends on Sail!', async () => {
    const { chartTourShowing } = await import('../../src/services/onboarding');
    const { CHART_BEATS, clampChartBeat } = await import('../../src/components/onboarding/script');
    const store = finishedTourStore();

    // Before: the row's second half is unreachable.
    expect(chartTourShowing(store.getState().captain)).toBe(false);

    // The duel half's send-off arms the chart half from its first beat.
    store.getState().beginTourReplay();
    const armed = store.getState().captain;
    expect(chartTourShowing(armed)).toBe(true);
    expect(armed.onboardingBeat, 'a replay would open on the send-off it just came from').toBe(0);
    expect(armed.hasCompletedOnboarding).toBe(true);
    expect(armed.hasFoughtGuidedDuel).toBe(true);

    // Walking the beats, exactly as the overlay's `advance` does.
    for (let step = 1; step < CHART_BEATS.length; step += 1) {
      store.getState().setOnboardingBeat(clampChartBeat(store.getState().captain.onboardingBeat) + 1);
      expect(chartTourShowing(store.getState().captain), `beat ${step} vanished mid-replay`).toBe(true);
    }

    // The last beat is the send-off, and `Sail!` is `completeOnboarding` — the same ending a first
    // run gets, from the same button, with no second completion path to drift out of step.
    const last = CHART_BEATS[clampChartBeat(store.getState().captain.onboardingBeat)];
    expect(last?.id).toBe('done');

    store.getState().completeOnboarding();
    const after = store.getState().captain;
    expect(chartTourShowing(after), 'the tour never switches itself off').toBe(false);
    expect(after.replayingTour).toBe(false);
    expect(after.hasCompletedOnboarding).toBe(true);
    expect(after.hasFoughtGuidedDuel).toBe(true);
    expect(resolveDestination(after)).toBe('chart');
  });

  it('spec(A-005:AC-3) arming and ending a replay pays nothing and takes nothing', () => {
    const store = finishedTourStore();
    const before = structuredClone(store.getState().captain);

    store.getState().beginTourReplay();
    const armed = store.getState().captain;
    // Everything except the two fields a replay is allowed to touch is byte-identical. Coins,
    // mastery, receipts, rank — a tutorial you can farm is not a tutorial (A-015).
    expect({ ...armed, replayingTour: before.replayingTour, onboardingBeat: before.onboardingBeat }).toEqual(
      before,
    );
    expect(armed.coins).toBe(before.coins);
    expect(armed.rewardReceipts).toEqual(before.rewardReceipts);

    store.getState().completeOnboarding();
    const ended = store.getState().captain;
    expect({ ...ended, onboardingBeat: before.onboardingBeat }).toEqual(before);
  });

  it('spec(A-005:AC-3) no store action ever writes either latch false', () => {
    const store = finishedTourStore();
    const seen: { readonly completed: boolean; readonly fought: boolean }[] = [];
    const unsubscribe = store.subscribe((s) =>
      seen.push({
        completed: s.captain.hasCompletedOnboarding,
        fought: s.captain.hasFoughtGuidedDuel,
      }),
    );

    const called: string[] = [];
    const call = <T>(name: string, run: () => T): T => {
      called.push(name);
      return run();
    };
    const state = () => store.getState();

    call('beginTourReplay', () => state().beginTourReplay());
    call('setOnboardingBeat', () => state().setOnboardingBeat(2));
    call('skipTour', () => state().skipTour());
    call('completeOnboarding', () => state().completeOnboarding());
    call('markGuidedDuelFought', () => state().markGuidedDuelFought());
    call('addCoins', () => state().addCoins(5));
    call('spendCoins', () => state().spendCoins(3));
    call('recordDuelAnswers', () => state().recordDuelAnswers('add_within_10', { correct: 2, asked: 3 }));
    call('recordRangeAnswers', () => state().recordRangeAnswers('add_within_10', { correct: 1, asked: 1 }));
    call('recordDuelResult', () => state().recordDuelResult({ won: false }));
    call('equipCannons', () => state().equipCannons(['swivel_gun']));
    call('markCannonsSeen', () => state().markCannonsSeen(['swivel_gun']));
    call('setCurrentIsland', () => state().setCurrentIsland('port_sumwich'));
    call('setNameAndFlag', () => state().setNameAndFlag('Bo', 'flag-1'));
    call('setGradeBand', () => state().setGradeBand('g2_3'));
    unsubscribe();

    expect(seen.length, 'nothing was recorded, so this proves nothing').toBeGreaterThan(10);
    for (const snapshot of seen) {
      expect(snapshot.completed, 'a store action cleared hasCompletedOnboarding').toBe(true);
      expect(snapshot.fought, 'a store action cleared hasFoughtGuidedDuel').toBe(true);
    }

    // And the sweep is COMPLETE: a new action added to the store has to be swept here or this
    // fails, rather than quietly becoming the one path nobody checked. `replaceCaptain` is exempt
    // and stated as such — it does not mutate a captain, it substitutes a different one, which is
    // how hydration and "start over" both work.
    const actions = Object.entries(store.getState())
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name)
      .filter((name) => name !== 'replaceCaptain');
    expect([...called].sort()).toEqual([...actions].sort());
  });

  it('spec(A-005:AC-3) the two latches are written false in exactly one place — a fresh captain', async () => {
    const fs = await import('node:fs/promises');
    const { join } = await import('node:path');

    const pattern = /(hasCompletedOnboarding|hasFoughtGuidedDuel)\s*[:=]\s*false/g;
    const hits: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const text = await fs.readFile(full, 'utf8');
        if (pattern.test(text)) hits.push(full.replace(`${process.cwd()}/`, ''));
        pattern.lastIndex = 0;
      }
    };
    for (const root of ['app', 'src']) await walk(join(process.cwd(), root));

    expect(hits, 'a latch is written false outside emptyCaptain()').toEqual(['src/stores/player.ts']);

    // And inside that file, only in the fresh-captain constructor — never in an action.
    const player = await readSource('../../src/stores/player.ts');
    const fresh = player.match(/export function emptyCaptain\(\): Captain \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(fresh).toContain('hasCompletedOnboarding: false');
    expect(fresh).toContain('hasFoughtGuidedDuel: false');
    expect(player.match(pattern) ?? []).toHaveLength(2);
  });

  it('spec(A-005:AC-3) an abandoned replay never survives the relaunch, and a first run always does', async () => {
    const { chartTourShowing } = await import('../../src/services/onboarding');

    // Force-quit halfway through a replay: the flag is session state, so the next launch is the
    // captain's own chart rather than a tour they walked away from.
    const io = fakeStorage();
    const store = finishedTourStore();
    store.getState().beginTourReplay();
    store.getState().setOnboardingBeat(1);
    await persist(io.store, store.getState().captain);

    const { captain: relaunched, recovered } = await hydrate(io.store);
    expect(recovered).toBe(false);
    expect(relaunched.replayingTour, 'the captain relaunched into an abandoned replay').toBe(false);
    expect(relaunched.hasCompletedOnboarding).toBe(true);
    expect(relaunched.hasFoughtGuidedDuel).toBe(true);
    expect(chartTourShowing(relaunched)).toBe(false);
    expect(resolveDestination(relaunched)).toBe('chart');
    expect(relaunched.coins, 'clearing the replay cost the captain something').toBe(40);

    // A FIRST run is a different case and must be untouched — board rule RESUME: an interrupted
    // child reopens on the same beat, with the same line spoken again.
    const firstRunIo = fakeStorage();
    const firstRun = createCaptainStore();
    firstRun.getState().setGradeBand('k_1');
    firstRun.getState().setNameAndFlag('Bo', 'flag-1');
    firstRun.getState().markGuidedDuelFought();
    firstRun.getState().setOnboardingBeat(2);
    await persist(firstRunIo.store, firstRun.getState().captain);

    const { captain: resumed } = await hydrate(firstRunIo.store);
    expect(resumed.onboardingBeat).toBe(2);
    expect(chartTourShowing(resumed)).toBe(true);
  });

  it('spec(A-005:AC-3) the overlay gates on the shared predicate, and its skip is forward-only', async () => {
    const overlay = await readOnboardingSource('../../src/components/onboarding/ChartWalkthrough.tsx');

    // Both gates — the reserved band and the render — or the coach bar paints over a chart with no
    // tour on it, which is the same class of defect as the tour that could not come back.
    expect(overlay.match(/chartTourShowing\(captain\)/g), 'a gate still reads the latch alone').toHaveLength(
      2,
    );
    expect(overlay).not.toMatch(/if \(captain\.hasCompletedOnboarding\) return/);

    // The chart tour carries NO skip, by owner ruling on 2026-07-30, and its absence is asserted
    // rather than merely unmentioned.
    //
    // It was unreachable by construction. Rule NEVER BLOCK puts a frame-wide tap catcher over this
    // overlay so every tap advances a beat — so a skip control inside it advanced one beat, which
    // is indistinguishable from a dead button, and the owner reported it as exactly that. The grade
    // picker and the guided duel keep working skips; this screen is four taps from done.
    expect(overlay, 'the chart tour grew a skip again').not.toMatch(/FINAL_BEAT/);
    expect(overlay, 'the chart tour grew a skip again').not.toMatch(/TourSkip/);
    const { CHART_BEATS } = await import('../../src/components/onboarding/script');
    expect(CHART_BEATS[CHART_BEATS.length - 1]?.id, 'the tour ends somewhere with no exit').toBe('done');
  });
});

/**
 * A-005 — the grown-up's skip, and the setup it cannot skip.
 *
 * The board asks for it on the grade picker and the owner asked for it on the tour as well. The
 * rule that makes it safe is one sentence: **it skips the TOUR, never the SETUP.** A skip that
 * jumped the band, the name or the flag would not even work — `resolveDestination` refuses a
 * captain without them, so the "skipped" captain would be handed straight back to the screen they
 * pressed it on, forever. Routing every skip through the resolver is what makes that structural
 * rather than remembered.
 */
describe('A-005 the grown-up skip', () => {
  it('spec(A-005:AC-3) a skip from the grade picker lands on the name screen, never past it', async () => {
    const { chartTourShowing, commitTourSkip } = await import('../../src/services/onboarding');

    // Pressed with no band chosen, the resolver's own answer is this very screen. That is the
    // resolver declining to let a skip outrun the setup, and it is why the picker acknowledges the
    // skip in place instead of pretending to navigate.
    const store = createCaptainStore();
    expect(commitTourSkip(store)).toBe('onboarding');
    const skipped = store.getState().captain;
    expect(skipped.hasFoughtGuidedDuel).toBe(true);
    expect(skipped.hasCompletedOnboarding).toBe(true);
    expect(skipped.gradeBand, 'the skip chose a band for a child').toBeNull();
    expect(skipped.name, 'the skip named the captain').toBe('');
    expect(skipped.flag, 'the skip chose a flag').toBeNull();

    // Every band, because a skip that only works at K-1 is a skip that only a five-year-old's
    // grown-up can use.
    for (const band of GRADE_BANDS) {
      const fresh = createCaptainStore();
      commitTourSkip(fresh);
      expect(commitGradeBand(fresh, band), `${band} skipped past the name screen`).toBe('name-flag');
      expect(resolveDestination(fresh.getState().captain)).not.toBe('guided-duel');
      expect(resolveDestination(fresh.getState().captain)).not.toBe('chart');

      // And only once the name and flag are committed does the skip take effect: no guided duel,
      // and no chart tour waiting on the other side of it.
      fresh.getState().setNameAndFlag('Wren', 'flag-1');
      expect(resolveDestination(fresh.getState().captain)).toBe('chart');
      expect(chartTourShowing(fresh.getState().captain)).toBe(false);
    }
  });

  it('spec(A-005:AC-3) a skip from the tour lands on the chart, or on the repair the resolver asks for', async () => {
    const { commitTourSkip } = await import('../../src/services/onboarding');

    // Mid-tutorial: band, name and flag are done, the duel is not. This is the adult reviewing a
    // fresh install, four beats into twenty.
    const store = createCaptainStore();
    commitGradeBand(store, 'k_1');
    store.getState().setNameAndFlag('Wren', 'flag-3');
    expect(resolveDestination(store.getState().captain)).toBe('guided-duel');
    expect(commitTourSkip(store)).toBe('chart');

    // A captain with nothing equipped is a repair the resolver insists on, and the skip must not
    // talk its way past it — an empty tray is a duel screen with no gun.
    const stripped = createCaptainStore();
    commitGradeBand(stripped, 'k_1');
    stripped.getState().setNameAndFlag('Bo', 'flag-1');
    stripped.getState().equipCannons([]);
    expect(commitTourSkip(stripped)).toBe('gun-deck');
  });

  it('spec(A-005:AC-3) the skip forfeits nothing it did not earn, and latches nothing false', async () => {
    const { commitTourSkip } = await import('../../src/services/onboarding');
    const store = createCaptainStore();
    commitGradeBand(store, 'k_1');
    store.getState().setNameAndFlag('Wren', 'flag-3');
    const before = structuredClone(store.getState().captain);

    commitTourSkip(store);
    const after = store.getState().captain;

    // Two latches, and nothing else. The tutorial's coins and chest are NOT granted — settling a
    // duel that was never fought would fabricate a reward — and nothing already earned is taken.
    expect({ ...after, hasFoughtGuidedDuel: false, hasCompletedOnboarding: false }).toEqual({
      ...before,
      hasFoughtGuidedDuel: false,
      hasCompletedOnboarding: false,
    });
    expect(after.coins).toBe(before.coins);
    expect(after.hasFoughtGuidedDuel).toBe(true);
    expect(after.hasCompletedOnboarding).toBe(true);
  });

  it('spec(A-005:AC-3) both remaining skips are adult-facing, and every one clears the 64pt floor', async () => {
    const { TOUR_SKIP } = await import('../../src/components/onboarding/script');
    const picker = await readSource('../../app/onboarding.tsx');
    const duel = await readSource('../../app/guided-duel.tsx');
    const overlay = await readOnboardingSource('../../src/components/onboarding/ChartWalkthrough.tsx');

    // "I already know this", never "cancel" — the register that tells a grown-up this control is
    // for them and tells a child it is not.
    expect(TOUR_SKIP.label.toLowerCase()).toContain('grown-ups');
    expect(TOUR_SKIP.reason.toLowerCase()).toContain('played');
    expect(TOUR_SKIP.accessibilityLabel.toLowerCase()).toContain('played');
    for (const copy of Object.values(TOUR_SKIP)) {
      expect(copy.toLowerCase(), 'the skip reads as a refusal').not.toMatch(/cancel|quit|exit/);
    }

    // The picker's skip goes through the resolver and says so when the resolver keeps it put.
    expect(picker).toMatch(/router\.replace\(`\/\$\{commitTourSkip\(captainStore\)\}`\)/);
    expect(picker).toContain('TOUR_SKIP.armed');
    // Small INK inside a floor-sized TARGET, at every one of the three sites. The board's literal
    // "10px affordance" is the thing being refused here.
    //
    // The slop is asserted as an EXPRESSION rather than a number, because the number is the part
    // that can be got right by accident: a literal `hitSlop={4}` beside a 40pt row still reads as
    // "we thought about it" and is 16pt short. Deriving it from `MIN_TAP_TARGET` is what makes the
    // floor hold when someone later changes the ink.
    expect(picker, 'the picker’s skip does not derive its slop from the tap floor').toMatch(
      /const SKIP_SLOP = Math\.round\(\(MIN_TAP_TARGET - SKIP_INK_HEIGHT\) \/ 2\)/,
    );
    expect(picker, 'the slop is not actually applied').toMatch(/hitSlop=\{SKIP_SLOP\}/);
    const ink = Number(picker.match(/const SKIP_INK_HEIGHT = (\d+)/)?.[1]);
    // Ink small enough to stay quiet, and big enough to hold the two lines it actually draws:
    // `TOUR_SKIP.label` at 12/18 over `TOUR_SKIP.reason` at 11/15 is 33pt of text. Ink under that
    // is a clipped row, and ink over the floor is not a quiet affordance any more.
    expect(ink, 'the skip ink cannot hold its own two lines').toBeGreaterThanOrEqual(33);
    expect(ink, 'the skip is no longer quiet').toBeLessThan(64);
    expect(ink + Math.round((64 - ink) / 2) * 2).toBeGreaterThanOrEqual(64);

    // The duel's skip is a 22pt chip inside a `MIN_TAP_TARGET` box over the sky — `hitSlop` would
    // have been dead there, because slop above the sea band never reaches this view's parent.
    expect(duel).toMatch(/const SKIP_CHIP_HEIGHT = 22/);
    expect(duel).toMatch(/skipTarget: \{[\s\S]{0,160}height: MIN_TAP_TARGET/);
    // There is deliberately no third skip: the chart tour's was removed (see above), so this
    // asserts the two that exist rather than a count that would quietly pass if one vanished.
    expect(overlay, 'the chart tour must not reserve a skip row').not.toMatch(/TOUR_SKIP_ROW/);
  });
});

/**
 * A-005 — "Start over", the demo path that does not need a terminal.
 *
 * Until now the only way back to a first launch was deleting the app's Documents directory from a
 * shell, which means the walkthrough — the thing this whole ticket is about — could not be shown to
 * anybody who already had a captain. The row is deliberately the most destructive control in the
 * app, so it is also the only one behind a confirmation.
 */
describe('A-005 start over', () => {
  it('spec(A-005:AC-3) the reset produces a captain indistinguishable from a first install', async () => {
    const { commitStartOver } = await import('../../src/services/onboarding');
    const store = createCaptainStore();
    commitGradeBand(store, 'g4_5');
    store.getState().setNameAndFlag('Wren', 'flag-4');
    store.getState().markGuidedDuelFought();
    store.getState().completeOnboarding();
    store.getState().addCoins(120);
    store.getState().recordDuelResult({ won: true });
    store.getState().recordDuelAnswers('add_within_10', { correct: 6, asked: 6 });
    store.getState().setOnboardingBeat(3);

    expect(commitStartOver(store)).toBe('onboarding');

    // Nothing is preserved, and that is the specification rather than an oversight: a reset that
    // quietly kept a field would leave the next launch subtly unlike the first install being
    // demonstrated.
    expect(store.getState().captain).toEqual(emptyCaptain());
    expect(resolveDestination(store.getState().captain)).toBe('onboarding');
  });

  it('spec(A-005:AC-3) the reset survives the relaunch, or the old captain comes back', async () => {
    const { commitStartOver } = await import('../../src/services/onboarding');
    const io = fakeStorage();
    const store = createCaptainStore();
    commitGradeBand(store, 'k_1');
    store.getState().setNameAndFlag('Wren', 'flag-2');
    store.getState().addCoins(90);
    await persist(io.store, store.getState().captain);

    commitStartOver(store);
    // The root layout persists every store change through its subscription; this is that write.
    await persist(io.store, store.getState().captain);

    const { captain: relaunched } = await hydrate(io.store);
    expect(relaunched).toEqual(emptyCaptain());
    expect(relaunched.coins, 'the cleared captain came back on the next launch').toBe(0);
    expect(resolveDestination(relaunched)).toBe('onboarding');
  });

  it('spec(A-005:AC-3) nothing is cleared until the confirm, and the safe answer is the easy tap', async () => {
    const { START_OVER } = await import('../../src/services/onboarding');
    const rank = await readSource('../../app/rank.tsx');

    // The row opens the sheet and does nothing else; the write lives in the sheet's own handler.
    expect(rank).toMatch(/onPress=\{\(\) => setStartingOver\(true\)\}/);
    expect(rank.match(/commitStartOver\(/g), 'the reset has more than one trigger').toHaveLength(1);
    const confirm = rank.match(/onConfirm=\{\(\) => \{([\s\S]*?)\n\s{10}\}\}/)?.[1] ?? '';
    expect(confirm, 'the confirm does not clear the captain').toContain('commitStartOver(captainStore)');
    // Through the resolver, never to a literal `/onboarding`.
    expect(confirm).toMatch(/router\.replace\(`\/\$\{commitStartOver\(captainStore\)\}`\)/);

    // The copy names the loss in the child's own nouns, and keeps the Harbor's register — a
    // question asked warmly, never an error and never a telling-off.
    for (const noun of ['coins', 'ships', 'islands', 'skills']) {
      expect(START_OVER.sheetBody.toLowerCase(), `the sheet does not say what is lost: ${noun}`).toContain(
        noun,
      );
    }
    expect(START_OVER.sheetBody.toLowerCase()).not.toMatch(/warning|danger|error|careful/);
    expect(START_OVER.keepLabel.toLowerCase()).toContain('keep');

    // The destructive button is drawn BEFORE the safe one, so the safe one is the lower — the
    // bottom of a sheet is where a thumb reaching for the row it just tapped comes to rest.
    const danger = rank.indexOf('START_OVER.confirmLabel');
    const keep = rank.indexOf('START_OVER.keepLabel');
    expect(danger).toBeGreaterThan(-1);
    expect(keep).toBeGreaterThan(danger);
    // Both clear the floor.
    expect(rank.match(/minHeight: MIN_TAP_TARGET/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
