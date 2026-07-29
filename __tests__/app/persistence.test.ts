/**
 * A-002 — persistence.
 *
 * The failure this exists to prevent is silent: an ungated redirect fires against empty state, a
 * returning captain is shown onboarding, and their progress looks erased. The README lists it
 * under traps already identified.
 *
 * Storage is injected rather than imported so this runs headless — AsyncStorage is a React Native
 * module and RN's entry point is Flow-typed, which the node runner cannot parse.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { createCaptainStore, emptyCaptain } from '../../src/stores/player';
import {
  hydrate,
  persist,
  SCHEMA_VERSION,
  STORAGE_KEY,
  type KeyValueStore,
} from '../../src/services/persistence';

/** An in-memory stand-in for AsyncStorage, with a switch for making writes fail. */
function fakeStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  let failWrites = false;
  const store: KeyValueStore = {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      if (failWrites) throw new Error('quota exceeded');
      data.set(k, v);
    },
  };
  return { store, data, breakWrites: () => (failWrites = true) };
}

let io: ReturnType<typeof fakeStorage>;
beforeEach(() => {
  io = fakeStorage();
});

describe('A-002 persistence', () => {
  it('spec(A-002:AC-1) every field round-trips exactly', async () => {
    const store = createCaptainStore();
    store.getState().setGradeBand('k_1');
    store.getState().setNameAndFlag('Ada', 'flag-3');
    store.getState().addCoins(42);
    store.getState().recordDuelResult({ won: true });
    const written = store.getState().captain;

    await persist(io.store, written);
    const result = await hydrate(io.store);

    expect(result.captain).toEqual(written);
    expect(result.recovered).toBe(false);
  });

  it('spec(A-002:AC-2) no stored data hydrates to the empty captain and does not throw', async () => {
    const result = await hydrate(io.store);
    expect(result.captain).toEqual(emptyCaptain());
    expect(result.recovered).toBe(false);
  });

  it('spec(A-002:AC-3) a truncated payload recovers to the empty captain and reports it', async () => {
    io.data.set(STORAGE_KEY, '{"version":1,"captain":{"coins":4');
    const result = await hydrate(io.store);
    // A child must never be locked out of the app by a bad write.
    expect(result.captain).toEqual(emptyCaptain());
    expect(result.recovered).toBe(true);
  });

  it('spec(A-002:AC-3) a well-formed payload of the wrong SHAPE also recovers', async () => {
    io.data.set(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, captain: { coins: 'lots' } }));
    const result = await hydrate(io.store);
    expect(result.captain).toEqual(emptyCaptain());
    expect(result.recovered).toBe(true);
  });

  it('spec(A-002:AC-4) an older schema version is discarded explicitly, never half-applied', async () => {
    io.data.set(
      STORAGE_KEY,
      JSON.stringify({ version: SCHEMA_VERSION - 1, captain: { ...emptyCaptain(), coins: 99 } }),
    );
    const result = await hydrate(io.store);
    expect(result.captain.coins).toBe(0);
    expect(result.migrated).toBe(true);
  });

  it('spec(A-002:AC-4) a schema version is written alongside the payload from the first release', async () => {
    await persist(io.store, emptyCaptain());
    const raw = JSON.parse(io.data.get(STORAGE_KEY) ?? '{}');
    expect(raw.version).toBe(SCHEMA_VERSION);
  });

  it('spec(A-002:AC-6) a failed write leaves the in-memory captain untouched', async () => {
    io.breakWrites();
    const captain = { ...emptyCaptain(), coins: 7 };
    await expect(persist(io.store, captain)).resolves.toBe(false);
    expect(captain.coins).toBe(7);
  });
});
