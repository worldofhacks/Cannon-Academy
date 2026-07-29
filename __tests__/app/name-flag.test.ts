/**
 * A-006 — name and flag.
 *
 * Written before the implementation. Board 5b says the flag chosen at onboarding **becomes the
 * ship's pennant**, so this screen is not cosmetic bookkeeping — it is the step that makes the
 * ship theirs before the first chest ever drops. `flow.ts` already treats it that way: a captain
 * with a blank name or a null flag is routed to `name-flag` and cannot proceed.
 *
 * ## Why there is no screen test here
 *
 * `app/name-flag.tsx` cannot be rendered under this runner. React Native's entry point is
 * Flow-typed and the node runner cannot parse it, so anything reachable from `react-native` is
 * off-limits — which rules out `src/components/duel/Ship.tsx` (`PLAYER_SHIP`, `ShipCosmetics`)
 * along with the screen itself. That is the same constraint that shaped A-001/A-002/A-003, and
 * the same answer applies: put the decision in pure TypeScript, test the decision, and let the
 * screen be a thin caller. Screen geometry stays with the posture-gated screenshot review in the
 * ticket's DoD (`.tdd-swarm/posture.md`).
 *
 * ## The three modules this assumes
 *
 * Two do not exist yet and are proposed here, because the alternative is a hex literal inside a
 * component where nothing can reach it:
 *
 *  - `src/theme/flags.ts` — `FLAGS: readonly FlagOption[]`, the fixed set of six. A fixed set and
 *    not a colour picker, per board 6b's reasoning and this ticket's DoD.
 *  - `src/theme/shipCosmetics.ts` — `shipCosmeticsForCaptain(captain): ShipCosmetics`, the pure
 *    resolver that turns a captain's stored flag id into the pennant colour `Ship.tsx` renders.
 *    `Ship.tsx` keeps `PLAYER_SHIP` as its no-captain default; the duel screen passes this.
 *  - `src/stores/player.ts` — must additionally export `DEFAULT_CAPTAIN_NAME`, and
 *    `setNameAndFlag` must substitute it for a blank name (see AC-3 below).
 *
 * Those first two are loaded with `await import(...)` rather than a static import ON PURPOSE. A
 * static import of a module that does not exist yet fails at collection and takes all 23 tests
 * down with one identical resolution error, which tells the implementer nothing about which
 * acceptance criterion is still open. Loading per-test keeps each AC's failure its own signal —
 * in particular it keeps the AC-3 store tests failing on the *real* reason (`setNameAndFlag`
 * trims a blank name to `''`) rather than on a missing file.
 */
import { describe, expect, it } from 'vitest';

import { resolveDestination } from '../../src/services/flow';
import { hydrate, persist, type KeyValueStore } from '../../src/services/persistence';
import { createCaptainStore, emptyCaptain, type Captain } from '../../src/stores/player';
import { color } from '../../src/theme/tokens';

// ─── The proposed module surfaces ────────────────────────────────────────────────────────────

/**
 * One of the six flags. An object rather than a bare hex string: the id is what persists (and is
 * already frozen as `flag-1`…`flag-6` by A-002's and A-003's tests), the colour is what renders,
 * and the label is what a screen reader announces.
 */
interface FlagOption {
  readonly id: string;
  readonly label: string;
  /** 6-digit hex. This is the pennant. */
  readonly color: string;
}

/** The seven layers `Ship.tsx` destructures. Structural on purpose — the real type lives with it. */
type ShipCosmeticsShape = Record<'hull' | 'hullDeep' | 'sail' | 'trim' | 'pennant' | 'mast' | 'deck', string>;

const COSMETIC_LAYERS = ['hull', 'hullDeep', 'sail', 'trim', 'pennant', 'mast', 'deck'] as const;

async function loadFlags(): Promise<readonly FlagOption[]> {
  const mod = (await import('../../src/theme/flags')) as unknown as {
    FLAGS: readonly FlagOption[];
  };
  return mod.FLAGS;
}

async function loadCosmetics(): Promise<(captain: Captain) => ShipCosmeticsShape> {
  const mod = (await import('../../src/theme/shipCosmetics')) as unknown as {
    shipCosmeticsForCaptain: (captain: Captain) => ShipCosmeticsShape;
  };
  return mod.shipCosmeticsForCaptain;
}

/** `DEFAULT_CAPTAIN_NAME` is a new export on an existing module, so it is read reflectively. */
async function loadDefaultName(): Promise<unknown> {
  const mod = (await import('../../src/stores/player')) as unknown as Record<string, unknown>;
  return mod.DEFAULT_CAPTAIN_NAME;
}

const SCREEN_PATH = 'app/name-flag.tsx';

/**
 * The screen as TEXT, never as a module — importing it would pull in `react-native` and fail to
 * parse. Same technique as `spec(A-001:AC-7)`.
 *
 * Returns null when the file does not exist yet, so the test can say *that* rather than die on a
 * raw ENOENT stack that reads like a broken test instead of an unbuilt feature.
 *
 * Stated plainly so nobody over-trusts it, because a static check that looks stronger than it is
 * is worse than none. What it proves: the screen commits through the store at all, and no call
 * site can hand that store a flag which is null by construction. What it CANNOT prove: that the
 * skip control specifically is the one wired to that commit. A screen whose Save button commits
 * and whose Skip button only calls `router` passes this test.
 *
 * That last case is control flow, and reconstructing control flow from text means a heuristic —
 * I tried a proximity window between the word "skip" and the commit, and it passed the exact
 * screen it was written to catch. A gate that green-lights its own counterexample is worse than
 * an honest gap, so it is not here. That case belongs to the screenshot review in the ticket's
 * DoD, which is where this ticket already puts screen behaviour.
 */
async function readScreenSource(): Promise<string | null> {
  const { readFile } = await import('node:fs/promises');
  try {
    return await readFile(new URL(`../../${SCREEN_PATH}`, import.meta.url), 'utf8');
  } catch {
    return null;
  }
}

// ─── Colour maths, dependency-free ───────────────────────────────────────────────────────────

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * AC-4's thresholds, named so a future argument is about the number rather than about the test.
 *
 * Six hues spread evenly around the wheel sit 60° apart, so 25° is a floor with real slack in it
 * — a designer can still cluster warm colours. It was calibrated against two candidate palettes
 * rather than guessed: a teal/blue pair 29.7° apart is comfortably readable and must pass, while
 * the token palette's own `amber` (#F5A623) and `gold` (#FFD23F) sit **8.5°** apart and must not.
 * Those two are the trap this test exists for — both are "the brand", both are the instinctive
 * pick, and side by side at 16pt they are one colour. (An earlier 30° floor failed the teal/blue
 * pair by 0.3°, which is a test disagreeing with itself rather than with a designer.)
 *
 * The RGB floor is the backstop for what hue alone misses: a navy and a sky are 0° apart in hue
 * and obviously different, whereas a genuine near-duplicate is close on both measures.
 */
const MIN_HUE_SEPARATION_DEG = 25;
const MIN_RGB_DISTANCE = 60; // of a 441.7 maximum (#000000 → #ffffff)
const MIN_SATURATION = 0.35;

function toRgb(hex: string): readonly [number, number, number] {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  const digits = match?.[1];
  if (digits === undefined) throw new Error(`not a 6-digit hex colour: ${JSON.stringify(hex)}`);
  const n = Number.parseInt(digits, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Plain Euclidean distance in RGB. Not perceptually uniform, and does not need to be — it is a
 *  floor against near-duplicates, and no colour library is worth a dependency for that. */
function rgbDistance(a: string, b: string): number {
  const [ar, ag, ab] = toRgb(a);
  const [br, bg, bb] = toRgb(b);
  return Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2);
}

/** HSV hue (degrees) and saturation (0–1). */
function hueSat(hex: string): { readonly hue: number; readonly saturation: number } {
  const [r255, g255, b255] = toRgb(hex);
  const r = r255 / 255;
  const g = g255 / 255;
  const b = b255 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;

  let hue = 0;
  if (chroma !== 0) {
    if (max === r) hue = 60 * (((g - b) / chroma) % 6);
    else if (max === g) hue = 60 * ((b - r) / chroma + 2);
    else hue = 60 * ((r - g) / chroma + 4);
  }
  return { hue: ((hue % 360) + 360) % 360, saturation: max === 0 ? 0 : chroma / max };
}

/** Shortest angular distance between two hues, 0–180. */
function hueSeparation(a: string, b: string): number {
  const delta = Math.abs(hueSat(a).hue - hueSat(b).hue);
  return Math.min(delta, 360 - delta);
}

/** Every unordered pair, so a failure names the two flags rather than an index. */
function pairs<T>(items: readonly T[]): readonly (readonly [T, T])[] {
  const out: (readonly [T, T])[] = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      out.push([items[i] as T, items[j] as T]);
    }
  }
  return out;
}

// ─── Fixtures ────────────────────────────────────────────────────────────────────────────────

/** An in-memory stand-in for AsyncStorage, as in `persistence.test.ts`. */
function fakeStorage() {
  const data = new Map<string, string>();
  const store: KeyValueStore = {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
  };
  return { store, data };
}

const captain = (over: Partial<Captain> = {}): Captain => ({ ...emptyCaptain(), ...over });

// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('A-006 name and flag — AC-1, they survive relaunch', () => {
  it('spec(A-006:AC-1) a committed name and flag round-trip through persist/hydrate exactly', async () => {
    const flags = await loadFlags();
    const chosen = flags[2];
    expect(chosen, 'FLAGS must offer a third flag').toBeDefined();

    const io = fakeStorage();
    const store = createCaptainStore();
    store.getState().setGradeBand('k_1');
    store.getState().setNameAndFlag('Ada', chosen!.id);
    const written = store.getState().captain;

    await persist(io.store, written);
    const { captain: read } = await hydrate(io.store);

    expect(read.name).toBe('Ada');
    expect(read.flag).toBe(chosen!.id);
    // The whole captain, not just the two fields — a round-trip that preserves the name while
    // dropping the band is not a captain who survived relaunch.
    expect(read).toEqual(written);
  });

  it('spec(A-006:AC-1) the persisted flag id is one of the six offered, not free text', async () => {
    const flags = await loadFlags();
    const ids = new Set(flags.map((f) => f.id));

    const io = fakeStorage();
    const store = createCaptainStore();
    store.getState().setGradeBand('k_1');
    store.getState().setNameAndFlag('Ada', 'flag-3');

    await persist(io.store, store.getState().captain);
    const { captain: read } = await hydrate(io.store);

    // `flag` is typed `string | null` so persistence cannot police this; the offered set must.
    // If the six ever stop containing `flag-3`, A-002's and A-003's frozen tests break too.
    expect(read.flag).not.toBeNull();
    expect(ids.has(read.flag as string), `${read.flag} is not one of ${[...ids].join(', ')}`).toBe(true);
  });

  it('spec(A-006:AC-1) after relaunch the captain is past the name/flag screen, not sent back to it', async () => {
    const io = fakeStorage();
    const store = createCaptainStore();
    store.getState().setGradeBand('k_1');
    store.getState().setNameAndFlag('Ada', 'flag-3');

    await persist(io.store, store.getState().captain);
    const { captain: read } = await hydrate(io.store);

    // The failure this guards is the one the README already lists: a returning captain shown
    // onboarding again, their progress looking erased.
    expect(resolveDestination(read)).not.toBe('name-flag');
  });

  it('spec(A-006:AC-1) the flag still resolves to the same pennant after a relaunch', async () => {
    const flags = await loadFlags();
    const shipCosmeticsForCaptain = await loadCosmetics();
    const chosen = flags[4];
    expect(chosen).toBeDefined();

    const io = fakeStorage();
    const store = createCaptainStore();
    store.getState().setGradeBand('k_1');
    store.getState().setNameAndFlag('Ada', chosen!.id);
    const before = shipCosmeticsForCaptain(store.getState().captain);

    await persist(io.store, store.getState().captain);
    const { captain: read } = await hydrate(io.store);

    // Persisting the id and not the colour is the point: the palette can be retuned without
    // rewriting every stored captain, and this asserts the indirection actually closes.
    expect(shipCosmeticsForCaptain(read).pennant).toBe(before.pennant);
    expect(shipCosmeticsForCaptain(read).pennant).toBe(chosen!.color);
  });
});

describe('A-006 name and flag — AC-2, the flag becomes the pennant', () => {
  it('spec(A-006:AC-2) every flag resolves to its own colour as the ship pennant', async () => {
    const flags = await loadFlags();
    const shipCosmeticsForCaptain = await loadCosmetics();

    for (const flag of flags) {
      const cosmetics = shipCosmeticsForCaptain(captain({ flag: flag.id }));
      expect(cosmetics.pennant, `flag ${flag.id} did not become its own pennant`).toBe(flag.color);
    }
  });

  it('spec(A-006:AC-2) six distinct flags give six distinct pennants', async () => {
    const flags = await loadFlags();
    const shipCosmeticsForCaptain = await loadCosmetics();

    const pennants = flags.map((f) => shipCosmeticsForCaptain(captain({ flag: f.id })).pennant);
    // A resolver that collapsed two flags onto one colour would pass the loop above only if the
    // palette were already duplicated — this catches the resolver, AC-4 catches the palette.
    expect(new Set(pennants).size).toBe(flags.length);
  });

  it('spec(A-006:AC-2) a captain with no flag yet still gets a renderable pennant', async () => {
    const shipCosmeticsForCaptain = await loadCosmetics();
    const cosmetics = shipCosmeticsForCaptain(captain({ flag: null }));

    // `Ship.tsx` writes this straight into `backgroundColor`. `undefined` there is an invisible
    // pennant on a real device and nothing at all in a test — so the fallback is load-bearing.
    expect(cosmetics.pennant).toMatch(HEX);
    // Board 5b's default, and today's `PLAYER_SHIP.pennant`: amber.
    expect(cosmetics.pennant).toBe(color.amber);
  });

  it('spec(A-006:AC-2) an unrecognised stored flag id falls back rather than yielding undefined', async () => {
    const shipCosmeticsForCaptain = await loadCosmetics();

    // Storage is untrusted input (see `persistence.ts`): `flag` is typed `string`, so a build that
    // renamed the flags leaves old captains holding an id nothing answers to. Same stance as
    // `hydrate` — resolve to something playable, never to a broken screen.
    const cosmetics = shipCosmeticsForCaptain(captain({ flag: 'flag-from-an-older-build' }));
    expect(cosmetics.pennant).toMatch(HEX);
    expect(cosmetics.pennant).toBe(color.amber);
  });

  it('spec(A-006:AC-2) the resolver returns a complete cosmetics set, usable as-is by Ship', async () => {
    const shipCosmeticsForCaptain = await loadCosmetics();
    const cosmetics = shipCosmeticsForCaptain(captain({ flag: 'flag-1' }));

    // `Ship.tsx` destructures all seven. A partial object renders a ship with transparent sails
    // and no error, which is precisely the kind of failure a screenshot review skims past.
    for (const layer of COSMETIC_LAYERS) {
      expect(cosmetics[layer], `cosmetics.${layer} is missing`).toBeDefined();
      expect(cosmetics[layer], `cosmetics.${layer} is not a hex colour`).toMatch(HEX);
    }
  });

  it('spec(A-006:AC-2) only the pennant follows the flag; the hull is not repainted', async () => {
    const flags = await loadFlags();
    const shipCosmeticsForCaptain = await loadCosmetics();
    const first = flags[0];
    const last = flags[flags.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();

    const a = shipCosmeticsForCaptain(captain({ flag: first!.id }));
    const b = shipCosmeticsForCaptain(captain({ flag: last!.id }));

    // Board 5b promises a pennant, not a recolourable ship. Letting the flag drive `hull` or
    // `sail` would silently break the boards' fixed wood-and-parchment read.
    for (const layer of COSMETIC_LAYERS) {
      if (layer === 'pennant') continue;
      expect(a[layer], `cosmetics.${layer} changed with the flag`).toBe(b[layer]);
    }
    expect(a.pennant).not.toBe(b.pennant);
  });
});

describe('A-006 name and flag — AC-3, a skipped or blank name still yields a captain', () => {
  it('spec(A-006:AC-3) committing a blank name yields a non-empty default, never an empty string', () => {
    const store = createCaptainStore();
    store.getState().setNameAndFlag('', 'flag-1');

    // The store trims today, which turns "skip" into `name: ''` — and `flow.ts` reads an empty
    // name as "not named yet" and routes straight back to this screen. Skipping must terminate.
    expect(store.getState().captain.name).not.toBe('');
    expect(store.getState().captain.name.trim()).not.toBe('');
  });

  it('spec(A-006:AC-3) a whitespace-only name is treated exactly as blank', () => {
    const blank = createCaptainStore();
    blank.getState().setNameAndFlag('', 'flag-1');
    const spaces = createCaptainStore();
    spaces.getState().setNameAndFlag('   \t\n  ', 'flag-1');

    // A child holding the space bar is not naming their ship "    ". Asserting non-empty as well
    // as equal, because today both sides are `''` and equality alone would pass vacuously.
    expect(spaces.getState().captain.name).toBe(blank.getState().captain.name);
    expect(spaces.getState().captain.name).not.toBe('');
  });

  it('spec(A-006:AC-3) the default is a shared exported constant, not a literal in a screen', async () => {
    const fallback = await loadDefaultName();

    // Exported because two callers need the same answer: the store (for a blank commit) and the
    // screen (for the placeholder text it shows before one is typed). Two literals drift.
    expect(typeof fallback).toBe('string');
    expect(fallback).not.toBe('');
    expect((fallback as string).trim()).toBe(fallback);

    const store = createCaptainStore();
    store.getState().setNameAndFlag('', 'flag-1');
    expect(store.getState().captain.name).toBe(fallback);
  });

  it('spec(A-006:AC-3) a real name is trimmed but never replaced by the default', async () => {
    const fallback = await loadDefaultName();
    const store = createCaptainStore();
    store.getState().setNameAndFlag('  Ada  ', 'flag-1');

    expect(store.getState().captain.name).toBe('Ada');
    expect(store.getState().captain.name).not.toBe(fallback);
  });

  it('spec(A-006:AC-3) the default applies at commit, not at construction — the screen stays reachable', () => {
    // If `emptyCaptain()` carried the default name, `flow.ts` could never route anyone here and
    // no child would ever be asked. The empty string IS the "not yet asked" signal, and this
    // pins that AC-3 is about the commit and nothing else.
    expect(emptyCaptain().name).toBe('');
    expect(resolveDestination(captain({ gradeBand: 'k_1' }))).toBe('name-flag');
  });

  it('spec(A-006:AC-3) skipping the screen entirely lands a captain who can proceed', async () => {
    const flags = await loadFlags();
    const fallbackFlag = flags[0];
    expect(fallbackFlag).toBeDefined();

    const store = createCaptainStore();
    store.getState().setGradeBand('k_1');
    // What "skip" does: commit a blank name against the first flag. `flow.ts` needs BOTH a
    // non-empty name and a non-null flag, so a skip that only defaulted the name would loop.
    store.getState().setNameAndFlag('', fallbackFlag!.id);

    const settled = store.getState().captain;
    expect(settled.name).not.toBe('');
    expect(settled.flag).not.toBeNull();
    expect(resolveDestination(settled)).not.toBe('name-flag');
  });

  it('spec(A-006:AC-3) the screen actually commits on skip, with a flag that cannot be null', async () => {
    const src = await readScreenSource();
    expect(src, `${SCREEN_PATH} does not exist yet — AC-3's skip path has nothing to commit`).not.toBeNull();
    const source = src as string;

    // Every test above this one *simulates* the skip by calling the store the way the screen is
    // meant to. None of them checks that the screen does. The gap is real and it is silent:
    // `flow.ts` requires a non-empty name AND a non-null flag, so a skip button that navigates
    // without committing — or that commits a flag still sitting at `null` — bounces the child
    // straight back to this screen forever, with no frozen test objecting.

    expect(source, 'no skip affordance on a screen AC-3 says must be skippable').toMatch(/skip/i);

    const calls = [...source.matchAll(/setNameAndFlag\s*\(([^)]*)\)/g)].map((m) => m[1] ?? '');
    // Skipping must go THROUGH the store. A skip wired only to `router` leaves the captain
    // unnamed and unflagged, which is the loop.
    expect(calls.length, 'the screen never calls setNameAndFlag').toBeGreaterThan(0);

    for (const args of calls) {
      const flagArg = args.split(',')[1]?.trim() ?? '';
      expect(flagArg, `setNameAndFlag(${args}) passes no flag argument`).not.toBe('');
      // The literal forms of "no flag". `flag: null` is exactly what `flow.ts` refuses.
      expect(flagArg, `setNameAndFlag(${args}) commits an empty flag`).not.toMatch(
        /^(null|undefined|''|""|``)$/,
      );
    }

    // The harder case, and the one the reviewer flagged: `setNameAndFlag(name, flag)` reads fine
    // as text while `flag` is a piece of state still holding `null`. So if the screen keeps any
    // null-initialised state at all — and on this screen the flag is the only thing that would
    // be — then every commit must defend itself with a fallback.
    const keepsNullableState = /useState\s*(?:<[^>]*>)?\s*\(\s*(?:null|undefined)\s*\)/.test(source);
    if (keepsNullableState) {
      for (const args of calls) {
        expect(
          args,
          `the screen holds nullable state, so setNameAndFlag(${args}) needs a ?? / || fallback`,
        ).toMatch(/\?\?|\|\|/);
      }
    }

    // The fallback must be one of the six, not a hex literal invented at the call site — the
    // pennant resolver only answers to ids from this module.
    expect(source, 'the screen does not source its flags from the shared set').toMatch(
      /from '\.\.\/src\/theme\/flags'/,
    );
  });
});

describe('A-006 name and flag — AC-4, the six flags are told apart by hue', () => {
  it('spec(A-006:AC-4) dod(A-006:3) there are exactly six flags — a fixed set, not a colour picker', async () => {
    const flags = await loadFlags();
    // The DoD says fixed at six, per board 6b. Six is also what makes AC-4 achievable: an
    // arbitrary picker cannot guarantee any two captains' pennants are distinguishable.
    expect(flags.length).toBe(6);
  });

  it('spec(A-006:AC-4) the ids are the stable flag-1…flag-6 already written to storage', async () => {
    const flags = await loadFlags();
    const ids = flags.map((f) => f.id);

    // Not a naming preference — `flag-1` and `flag-3` are already literals in A-002's and A-003's
    // frozen tests, so this set is de facto persisted. Renaming it orphans real captains.
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(['flag-1', 'flag-2', 'flag-3', 'flag-4', 'flag-5', 'flag-6']);
  });

  it('spec(A-006:AC-4) every flag colour is a well-formed hex and all six are distinct', async () => {
    const flags = await loadFlags();
    for (const flag of flags) {
      expect(flag.color, `${flag.id} is not a 6-digit hex`).toMatch(HEX);
    }
    const normalised = flags.map((f) => f.color.toLowerCase());
    expect(new Set(normalised).size).toBe(flags.length);
  });

  it('spec(A-006:AC-4) no two flags are near-duplicates in RGB', async () => {
    const flags = await loadFlags();
    for (const [a, b] of pairs(flags)) {
      const distance = rgbDistance(a.color, b.color);
      expect(
        distance,
        `${a.id} (${a.color}) and ${b.id} (${b.color}) are ${distance.toFixed(1)} apart in RGB`,
      ).toBeGreaterThanOrEqual(MIN_RGB_DISTANCE);
    }
  });

  it('spec(A-006:AC-4) each flag is separated from every other by hue alone', async () => {
    const flags = await loadFlags();
    for (const [a, b] of pairs(flags)) {
      const separation = hueSeparation(a.color, b.color);
      // "By hue alone" is the AC's own wording, and it is the property that survives the 16pt
      // swatch on the flag row and the ~26pt pennant on a moving ship — where a lightness
      // difference of the same hue reads as one flag in shadow rather than as two flags.
      expect(
        separation,
        `${a.id} (${a.color}) and ${b.id} (${b.color}) are only ${separation.toFixed(1)}° apart in hue`,
      ).toBeGreaterThanOrEqual(MIN_HUE_SEPARATION_DEG);
    }
  });

  it('spec(A-006:AC-4) every flag is saturated enough for its hue to be the signal', async () => {
    // [DERIVED — TIGHTER THAN AC-4'S LITERAL TEXT, flagged to the orchestrator]
    // AC-4 asks for separation by hue. A near-grey has a hue but no perceptible one, so a
    // palette could satisfy the angular test on paper and be six greys on a screen. This is the
    // precondition that makes the hue test mean what it says.
    const flags = await loadFlags();
    for (const flag of flags) {
      const { saturation } = hueSat(flag.color);
      expect(
        saturation,
        `${flag.id} (${flag.color}) is too desaturated for hue to distinguish it`,
      ).toBeGreaterThanOrEqual(MIN_SATURATION);
    }
  });

  it('spec(A-006:AC-4) every flag carries a non-empty label', async () => {
    // [DERIVED — BEYOND AC-4'S LITERAL TEXT, flagged to the orchestrator]
    // Six unlabelled colour swatches are unusable to a colour-blind child and silent to a screen
    // reader, and this ticket is the only moment the set is defined. Cheap here, expensive later.
    const flags = await loadFlags();
    for (const flag of flags) {
      expect(typeof flag.label, `${flag.id} has no label`).toBe('string');
      expect(flag.label.trim(), `${flag.id} has an empty label`).not.toBe('');
    }
    expect(new Set(flags.map((f) => f.label)).size).toBe(flags.length);
  });
});
