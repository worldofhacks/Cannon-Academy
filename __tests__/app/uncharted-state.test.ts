/**
 * A-079 — the uncharted captain state (amended D-17, design §1 + §2 S5).
 *
 * The captain gains exactly one door to the generated frontier: the `uncharted` envelope. This
 * suite freezes the three laws that make that door safe to open:
 *
 *   1. **Tolerated-as-absent** — a save written before the field existed hydrates with the inert
 *      default through BOTH persistence arms, and is never discarded, recovered, or migrated for
 *      lacking it. The alternative (a structural requirement or a SCHEMA_VERSION bump) deletes
 *      every live save, which to a child is the game deleting them.
 *   2. **Corruption never spreads** — the `normalizeMercyState` precedent, member by member: a
 *      corrupt envelope resolves fresh, a corrupt or band-mismatched doc resolves to null (slots
 *      are regenerable from `(seed, index, band)`), and no bad member costs a good one.
 *   3. **The store's uncharted actions are pure state moves** that never touch the authored
 *      island bus (`currentIsland` / `unlockedIslands`) — the bus law, design §1.
 *
 * Storage is injected, headless — the same seam as persistence.test.ts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { GenIslandDoc } from '../../src/content/genIsland';
import {
  hydrate,
  persist,
  SCHEMA_VERSION,
  STORAGE_KEY,
  type KeyValueStore,
} from '../../src/services/persistence';
import { generateIsland } from '../../src/services/uncharted/generator';
import {
  createCaptainStore,
  emptyCaptain,
  freshUnchartedState,
  type Captain,
} from '../../src/stores/player';

// --- Deterministic fixtures (A-078's generator: same inputs, same doc, forever) -------------------

const g45Current = generateIsland(11, 6, 'g4_5');
const g45Next = generateIsland(11, 7, 'g4_5');
const g45Third = generateIsland(11, 8, 'g4_5');
const k1Current = generateIsland(3, 6, 'k_1');
const k1Next = generateIsland(3, 7, 'k_1');

/**
 * Schema-valid but above K-1's ceiling: `mult_facts` is minGrade 2 against k_1's ceiling of 1.
 * The schema alone MUST accept this doc (a document has no band) — which is exactly why the
 * normalizer's band law has to exist on top of it.
 */
const overCeilingForK1: GenIslandDoc = { ...k1Current, skills: ['mult_facts'] };

// --- Harness ---------------------------------------------------------------------------------------

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

/** A v2-shaped raw payload: a real captain, loosened so specs can plant corrupt members. */
function payload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...emptyCaptain(),
    gradeBand: 'k_1',
    name: 'Ada',
    coins: 137,
    ...over,
  } as Record<string, unknown>;
}

/** A pre-A-041 v1 payload — no mercy, no receipts, and (really) no `uncharted`. */
function v1Payload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    gradeBand: 'k_1',
    name: 'Ada',
    flag: 'flag-3',
    coins: 42,
    mastery: {},
    ownedCannons: ['swivel_gun'],
    equippedCannons: ['swivel_gun'],
    seenCannons: ['swivel_gun'],
    unlockedIslands: ['port_sumwich'],
    rankTier: 1,
    wins: 3,
    currentIsland: 'port_sumwich',
    hasCompletedOnboarding: true,
    hasFoughtGuidedDuel: true,
    ...over,
  };
}

async function hydrateEnvelope(version: number, captain: Record<string, unknown>) {
  const io = fakeStorage();
  io.data.set(STORAGE_KEY, JSON.stringify({ version, captain }));
  return { io, result: await hydrate(io.store) };
}

// --- AC-1: tolerated as absent, through both arms --------------------------------------------------

describe('A-079 the uncharted field is tolerated as absent', () => {
  it('spec(A-079:AC-1) a v2 save without the field hydrates with the default, progress intact', async () => {
    const legacy = payload();
    delete legacy.uncharted;

    const { result } = await hydrateEnvelope(SCHEMA_VERSION, legacy);

    // The whole point: NOT recovered, NOT migrated — the captain is the stored one.
    expect(result.recovered, 'a missing uncharted field discarded a real captain').toBe(false);
    expect(result.migrated).toBe(false);
    expect(result.captain.coins).toBe(137);
    expect(result.captain.name).toBe('Ada');
    expect(result.captain.uncharted).toEqual(freshUnchartedState());
  });

  it('spec(A-079:AC-1) a v1 save gains the default through the migrate arm, not just the v2 arm', async () => {
    // MUTATION TARGET: removing the `uncharted:` mirror from `migrateLegacyCaptain` reddens this.
    const { result } = await hydrateEnvelope(1, v1Payload());

    expect(result.migrated).toBe(true);
    expect(result.recovered).toBe(false);
    expect(result.captain.coins).toBe(42);
    expect(result.captain.uncharted).toEqual(freshUnchartedState());
  });

  it('spec(A-079:AC-1) the default is inert and round-trips without touching old semantics', async () => {
    const legacy = payload();
    delete legacy.uncharted;
    const { io, result: first } = await hydrateEnvelope(SCHEMA_VERSION, legacy);

    await persist(io.store, first.captain);
    const second = await hydrate(io.store);

    expect(second.recovered).toBe(false);
    expect(second.captain).toEqual(first.captain);
    // Inert: zero cleared, no frontier dealt, host unmet — nothing about the old save is claimed.
    expect(second.captain.uncharted).toEqual({
      clearedCount: 0,
      current: null,
      next: null,
      metLumen: false,
    });
    // The default also lives in emptyCaptain (the ticket's "default in emptyCaptain"), un-aliased.
    expect(emptyCaptain().uncharted).toEqual(freshUnchartedState());
    expect(emptyCaptain().uncharted).not.toBe(emptyCaptain().uncharted);
  });

  it('spec(A-079:AC-1) the migrate arm is a full normalize, not a raw pass-through', async () => {
    // A payload claiming version 1 while carrying uncharted state is hostile-shaped, but the
    // mirror must treat it exactly as the v2 arm would: validate, keep the valid, null the rest.
    // The corrupt members here are the proof — the raw spread alone would carry them through.
    const { result } = await hydrateEnvelope(
      1,
      v1Payload({
        uncharted: { clearedCount: 5.9, current: k1Current, next: 'garbage', metLumen: true },
      }),
    );

    expect(result.migrated).toBe(true);
    expect(result.captain.uncharted).toEqual({
      clearedCount: 5,
      current: k1Current,
      next: null,
      metLumen: true,
    });
  });
});

// --- AC-2: corruption never spreads ----------------------------------------------------------------

describe('A-079 corrupt and band-mismatched uncharted state', () => {
  it('spec(A-079:AC-2) a corrupt envelope resolves fresh and never discards the captain', async () => {
    for (const bad of ['banana', 42, null, [], true]) {
      const { result } = await hydrateEnvelope(SCHEMA_VERSION, payload({ uncharted: bad }));
      expect(result.recovered, `uncharted ${JSON.stringify(bad)} discarded the captain`).toBe(false);
      expect(result.captain.coins).toBe(137);
      expect(result.captain.uncharted).toEqual(freshUnchartedState());
    }
  });

  it('spec(A-079:AC-2) wrong-typed members resolve member by member, the mercy precedent', async () => {
    const { result } = await hydrateEnvelope(
      SCHEMA_VERSION,
      payload({
        uncharted: { clearedCount: 'nine', current: 'not a doc', next: 7, metLumen: 'yes' },
      }),
    );
    expect(result.captain.uncharted).toEqual(freshUnchartedState());
  });

  it('spec(A-079:AC-2) clearedCount clamps to a non-negative integer without costing valid docs', async () => {
    const negative = await hydrateEnvelope(
      SCHEMA_VERSION,
      payload({
        uncharted: { clearedCount: -4, current: k1Current, next: null, metLumen: true },
      }),
    );
    expect(negative.result.captain.uncharted).toEqual({
      clearedCount: 0,
      current: k1Current,
      next: null,
      metLumen: true,
    });

    const fractional = await hydrateEnvelope(
      SCHEMA_VERSION,
      payload({ uncharted: { clearedCount: 2.7, current: null, next: null, metLumen: false } }),
    );
    expect(fractional.result.captain.uncharted?.clearedCount).toBe(2);
  });

  it('spec(A-079:AC-2) an invalid doc nulls its slot only — count, latch, and the other slot survive', async () => {
    const { result } = await hydrateEnvelope(
      SCHEMA_VERSION,
      payload({
        uncharted: {
          clearedCount: 3,
          // hull 5 sits below GEN_HULL_MIN — genIslandSchema rejects it.
          current: { ...k1Current, hull: 5 },
          next: k1Next,
          metLumen: true,
        },
      }),
    );
    expect(result.captain.uncharted).toEqual({
      clearedCount: 3,
      current: null,
      next: k1Next,
      metLumen: true,
    });
  });

  it('spec(A-079:AC-2) a smuggled unknown field fails the strict schema and nulls the slot', async () => {
    const { result } = await hydrateEnvelope(
      SCHEMA_VERSION,
      payload({
        uncharted: {
          clearedCount: 1,
          current: { ...k1Current, glyph: '×' },
          next: null,
          metLumen: false,
        },
      }),
    );
    expect(result.captain.uncharted?.current).toBeNull();
    expect(result.captain.uncharted?.clearedCount).toBe(1);
  });

  it('spec(A-079:AC-2) a band-mismatched doc nulls its slot for THAT band and survives its own', async () => {
    // MUTATION-adjacent: this is the band law, above and beyond the schema.
    const onK1 = await hydrateEnvelope(
      SCHEMA_VERSION,
      payload({
        gradeBand: 'k_1',
        uncharted: { clearedCount: 4, current: overCeilingForK1, next: k1Next, metLumen: false },
      }),
    );
    expect(onK1.result.captain.uncharted).toEqual({
      clearedCount: 4,
      current: null, // mult_facts (grade 2) has no business under a k_1 ceiling of 1
      next: k1Next,
      metLumen: false,
    });

    // The SAME doc under a g2_3 captain is legal — the check is band-relative, not schema-level.
    const onG23 = await hydrateEnvelope(
      SCHEMA_VERSION,
      payload({
        gradeBand: 'g2_3',
        uncharted: { clearedCount: 4, current: overCeilingForK1, next: null, metLumen: false },
      }),
    );
    expect(onG23.result.captain.uncharted?.current).toEqual(overCeilingForK1);
  });

  it('spec(A-079:AC-2) a captain with no valid band cannot hold docs — slots reset, count survives', async () => {
    for (const band of [null, 'grade_9']) {
      const { result } = await hydrateEnvelope(
        SCHEMA_VERSION,
        payload({
          gradeBand: band,
          uncharted: { clearedCount: 1, current: k1Current, next: k1Next, metLumen: false },
        }),
      );
      expect(result.captain.uncharted).toEqual({
        clearedCount: 1,
        current: null,
        next: null,
        metLumen: false,
      });
    }
  });

  it('spec(A-079:AC-2) a valid frontier round-trips exactly', async () => {
    const io = fakeStorage();
    const written: Captain = {
      ...emptyCaptain(),
      gradeBand: 'g4_5',
      name: 'Ada',
      uncharted: { clearedCount: 2, current: g45Current, next: g45Next, metLumen: true },
    };

    await persist(io.store, written);
    const result = await hydrate(io.store);

    expect(result.recovered).toBe(false);
    expect(result.captain).toEqual(written);
    expect(result.captain.uncharted?.current?.id).toBe('gen_isle_6');
    expect(result.captain.uncharted?.next?.id).toBe('gen_isle_7');
  });
});

// --- Work item 4: the store's pure state moves -----------------------------------------------------

describe('A-079 uncharted store actions are pure state moves', () => {
  it('spec(A-079:AC-1) beginUncharted initializes when absent and never resets when present', () => {
    const store = createCaptainStore();
    const stripped = { ...emptyCaptain() };
    delete stripped.uncharted;
    store.getState().replaceCaptain(stripped);
    expect(store.getState().captain.uncharted).toBeUndefined();

    store.getState().beginUncharted();
    expect(store.getState().captain.uncharted).toEqual(freshUnchartedState());

    // Idempotent: progress in an existing envelope is never reset — not even by reference.
    store.getState().setUnchartedIslands(g45Current, g45Next);
    store.getState().markLumenMet();
    const before = store.getState().captain;
    store.getState().beginUncharted();
    expect(store.getState().captain).toBe(before);
    expect(store.getState().captain.uncharted).toEqual({
      clearedCount: 0,
      current: g45Current,
      next: g45Next,
      metLumen: true,
    });
  });

  it('spec(A-079:AC-2) setUnchartedIslands deals both slots and preserves count and latch', () => {
    const store = createCaptainStore();
    store.getState().replaceCaptain({
      ...emptyCaptain(),
      gradeBand: 'g4_5',
      uncharted: { clearedCount: 2, current: null, next: null, metLumen: true },
    });

    store.getState().setUnchartedIslands(g45Current, g45Next);
    expect(store.getState().captain.uncharted).toEqual({
      clearedCount: 2,
      current: g45Current,
      next: g45Next,
      metLumen: true,
    });

    // Null is legal — slots are regenerable from seed, and a normalizer may have reset them.
    store.getState().setUnchartedIslands(null, null);
    expect(store.getState().captain.uncharted).toEqual({
      clearedCount: 2,
      current: null,
      next: null,
      metLumen: true,
    });
  });

  it('spec(A-079:AC-2) advanceUnchartedState: count+1, next promotes, caller deals the new next', () => {
    const store = createCaptainStore();
    store.getState().replaceCaptain({
      ...emptyCaptain(),
      gradeBand: 'g4_5',
      coins: 55,
      uncharted: { clearedCount: 1, current: g45Current, next: g45Next, metLumen: true },
    });
    const prior = store.getState().captain;

    store.getState().advanceUnchartedState(g45Third);

    const after = store.getState().captain;
    expect(after.uncharted).toEqual({
      clearedCount: 2,
      current: g45Next,
      next: g45Third,
      metLumen: true,
    });
    // A state MOVE, not a mutation — and nothing outside the envelope is touched.
    expect(prior.uncharted?.clearedCount).toBe(1);
    expect(prior.uncharted?.current).toBe(g45Current);
    expect(after.coins).toBe(55);
    expect(after.wins).toBe(prior.wins);
  });

  it('spec(A-079:AC-2) markLumenMet latches true, idempotently, and touches only the latch', () => {
    const store = createCaptainStore();
    store.getState().replaceCaptain({
      ...emptyCaptain(),
      uncharted: { clearedCount: 3, current: null, next: null, metLumen: false },
    });

    store.getState().markLumenMet();
    store.getState().markLumenMet();
    expect(store.getState().captain.uncharted).toEqual({
      clearedCount: 3,
      current: null,
      next: null,
      metLumen: true,
    });
  });

  it('spec(A-079:AC-3) no uncharted action ever touches the authored island bus', () => {
    const store = createCaptainStore();
    store.getState().setGradeBand('g4_5');
    const busBefore = {
      currentIsland: store.getState().captain.currentIsland,
      unlockedIslands: [...store.getState().captain.unlockedIslands],
    };
    expect(busBefore.currentIsland).not.toBeNull();

    store.getState().beginUncharted();
    store.getState().setUnchartedIslands(g45Current, g45Next);
    store.getState().advanceUnchartedState(g45Third);
    store.getState().markLumenMet();

    const captain = store.getState().captain;
    expect(captain.currentIsland).toBe(busBefore.currentIsland);
    expect(captain.unlockedIslands).toEqual(busBefore.unlockedIslands);
    // And no gen id anywhere near the bus — the two-tier law's namespace never leaks.
    expect(captain.unlockedIslands.some((id) => String(id).startsWith('gen_isle_'))).toBe(false);
  });
});

// --- AC-4: the guardrails that keep old saves alive ------------------------------------------------

describe('A-079 guardrails', () => {
  it('spec(A-079:AC-4) the field did not cost a schema bump', () => {
    // A bump without a migration arm deletes every live v2 save on hydrate's unsupported-version
    // branch — the same data loss tolerated-as-absent exists to prevent.
    expect(SCHEMA_VERSION).toBe(2);
  });

  it('spec(A-079:AC-4) isBaseCaptain is unchanged — uncharted is not a structural requirement', () => {
    const source = readFileSync(
      join(__dirname, '../../src/services/persistence.ts'),
      'utf8',
    );
    const start = source.indexOf('function isBaseCaptain');
    const end = source.indexOf('function normalizeSkins');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const body = source.slice(start, end);
    // The slice really is the structural check…
    expect(body).toContain('hasFoughtGuidedDuel');
    expect(body).toContain('unlockedIslands');
    // …and it never learned the new field. Requiring it would reject every pre-A-079 save.
    expect(body).not.toMatch(/uncharted/i);
  });
});
