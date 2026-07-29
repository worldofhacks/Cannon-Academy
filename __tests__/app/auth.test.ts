/**
 * A-004 — anonymous identity that survives a cold start.
 *
 * The failure this exists to prevent is invisible from the device: the Firebase JS SDK defaults to
 * **in-memory** auth on React Native, so `getAuth()` mints a NEW anonymous UID on every cold start.
 * Local progress keeps looking correct while cloud identity silently forks. README §Traps names it;
 * this file is the thing that stops it shipping.
 *
 * **The SDK is injected, not imported.** `firebase` and `@react-native-async-storage/async-storage`
 * both reach React Native's Flow-typed entry point, which the node test runner cannot parse — so
 * `createAuthService` takes an `AuthSdk` parameter, exactly as `persistence.ts` takes a
 * `KeyValueStore`. The real Firebase SDK is supplied once, at the app edge. The seam is what lets
 * the trap be asserted against rather than merely avoided: the fake below exposes `getAuth`
 * precisely so that a wrong implementation can reach for it and be caught.
 *
 * The fake models Firebase's real restore sequence rather than stubbing return values:
 * `initializeAuth` schedules an async restore from its persistence, `onAuthStateChanged` fires once
 * that settles, and only an async-storage-backed persistence has anything to restore. That is what
 * makes the cold-start assertions mean something instead of re-stating the implementation.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { KeyValueStore } from '../../src/services/persistence';
import { createAuthService, type AuthSdk, type AuthApp } from '../../src/services/auth';

/** The key Firebase itself owns inside AsyncStorage. It belongs to the SDK, not to our module. */
const FIREBASE_USER_KEY = 'firebase:authUser:fake-api-key:[DEFAULT]';

const FAKE_APP: AuthApp = { name: '[DEFAULT]' };

interface FakeUser {
  readonly uid: string;
}

/** What `getReactNativePersistence(store)` produces, versus the in-memory default. */
interface FakePersistence {
  readonly kind: 'async-storage' | 'in-memory';
  readonly store?: KeyValueStore;
}

interface FakeClient {
  readonly persistence: FakePersistence;
  currentUser: FakeUser | null;
  restored: Promise<void>;
  readonly listeners: Set<(user: FakeUser | null) => void>;
}

/** An in-memory stand-in for AsyncStorage, matching the `KeyValueStore` seam A-002 established. */
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
 * A fake Firebase auth SDK that behaves like the real one on the axis that matters: persistence.
 *
 * One instance stands for one installed app across many launches — `mintCount` keeps rising, so a
 * client that fails to restore is caught by getting a *different* UID, which is exactly the
 * production symptom.
 */
function fakeFirebaseSdk() {
  let mintCount = 0;
  let offline = false;
  const calls = {
    initializeAuth: 0,
    getAuth: 0,
    getReactNativePersistence: 0,
    signInAnonymously: 0,
  };
  const initOptions: { persistence: FakePersistence }[] = [];
  const persistenceByStore = new Map<KeyValueStore, FakePersistence>();

  function makeClient(persistence: FakePersistence): FakeClient {
    const client: FakeClient = {
      persistence,
      currentUser: null,
      // Replaced immediately below; the restore body has to be able to close over `client`.
      restored: Promise.resolve(),
      listeners: new Set(),
    };
    client.restored = (async () => {
      // In-memory persistence has nothing to restore. That IS the trap, modelled.
      if (persistence.kind !== 'async-storage' || persistence.store === undefined) return;
      const raw = await persistence.store.getItem(FIREBASE_USER_KEY);
      if (raw !== null) client.currentUser = { uid: raw };
    })();
    return client;
  }

  const sdk = {
    getReactNativePersistence(store: KeyValueStore): FakePersistence {
      calls.getReactNativePersistence += 1;
      // Firebase hands back a stable persistence object per store; model that so the wiring test
      // can compare by identity rather than by shape.
      const existing = persistenceByStore.get(store);
      if (existing !== undefined) return existing;
      const made: FakePersistence = { kind: 'async-storage', store };
      persistenceByStore.set(store, made);
      return made;
    },

    initializeAuth(_app: AuthApp, options: { persistence: FakePersistence }): FakeClient {
      calls.initializeAuth += 1;
      initOptions.push(options);
      return makeClient(options.persistence);
    },

    /**
     * THE TRAP, deliberately reachable. If this is ever called the implementation has taken the
     * in-memory default and every cold start will fork identity.
     */
    getAuth(_app: AuthApp): FakeClient {
      calls.getAuth += 1;
      return makeClient({ kind: 'in-memory' });
    },

    async signInAnonymously(client: FakeClient): Promise<{ user: FakeUser }> {
      calls.signInAnonymously += 1;
      // A guard, not an assertion: an implementation that re-signs-in on every auth-state event
      // would otherwise spin here forever and hang the run instead of failing.
      if (calls.signInAnonymously > 5) {
        throw new Error('signInAnonymously called 6+ times — missing onAuthStateChanged guard');
      }
      if (offline) {
        const err: Error & { code?: string } = new Error('A network error has occurred.');
        err.code = 'auth/network-request-failed';
        throw err;
      }
      mintCount += 1;
      const user: FakeUser = { uid: `anon-uid-${mintCount}` };
      client.currentUser = user;
      if (client.persistence.kind === 'async-storage' && client.persistence.store !== undefined) {
        await client.persistence.store.setItem(FIREBASE_USER_KEY, user.uid);
      }
      for (const listener of client.listeners) listener(user);
      return { user };
    },

    onAuthStateChanged(client: FakeClient, cb: (user: FakeUser | null) => void): () => void {
      client.listeners.add(cb);
      void client.restored.then(() => cb(client.currentUser));
      return () => client.listeners.delete(cb);
    },
  };

  return {
    sdk: sdk as unknown as AuthSdk,
    raw: sdk,
    calls,
    initOptions,
    goOffline: () => (offline = true),
  };
}

let io: ReturnType<typeof fakeStorage>;
let fb: ReturnType<typeof fakeFirebaseSdk>;

beforeEach(() => {
  io = fakeStorage();
  fb = fakeFirebaseSdk();
});

describe('A-004 anonymous auth', () => {
  it('spec(A-004:AC-1) a first launch creates an anonymous user whose UID is retrievable', async () => {
    const service = createAuthService(fb.sdk, { app: FAKE_APP, store: io.store });

    const snapshot = await service.ready;

    expect(snapshot.uid).toBeTypeOf('string');
    expect(snapshot.uid).not.toBe('');
    expect(snapshot.mode).toBe('cloud');
    // The synchronous accessor a screen would read must agree with the resolved state.
    expect(service.snapshot().uid).toBe(snapshot.uid);
  });

  it('spec(A-004:AC-1) a first launch signs in exactly once', async () => {
    const service = createAuthService(fb.sdk, { app: FAKE_APP, store: io.store });
    await service.ready;

    expect(fb.calls.signInAnonymously).toBe(1);
  });

  /**
   * AC-2, headless half. A real force-quit cannot be reproduced in the node runner, so this asserts
   * the *wiring* that makes surviving one possible: the persistence handed to `initializeAuth` is
   * the one built from the injected store. The real two-cold-start verification is MANUAL, on the
   * simulator, and is recorded in tickets/app/A-004.md per its Test Plan.
   */
  it('spec(A-004:AC-2) dod(A-004:3) auth is constructed with a persistence backed by the injected store', () => {
    createAuthService(fb.sdk, { app: FAKE_APP, store: io.store });

    expect(fb.calls.initializeAuth).toBe(1);
    expect(fb.initOptions[0]?.persistence.kind).toBe('async-storage');
    // Identity, not shape: the persistence must be built from THIS store, not some other one.
    expect(fb.initOptions[0]?.persistence.store).toBe(io.store);
  });

  it('spec(A-004:AC-2) the UID is identical across two relaunches', async () => {
    // Launch 1 — mints the identity.
    const first = await createAuthService(fb.sdk, { app: FAKE_APP, store: io.store }).ready;

    // Relaunch 1 and 2 — a fresh service over the same installed storage, as a cold start is.
    const second = await createAuthService(fb.sdk, { app: FAKE_APP, store: io.store }).ready;
    const third = await createAuthService(fb.sdk, { app: FAKE_APP, store: io.store }).ready;

    expect(second.uid).toBe(first.uid);
    expect(third.uid).toBe(first.uid);
    // A restored user must not be re-minted; a second sign-in is a forked identity by another name.
    expect(fb.calls.signInAnonymously).toBe(1);
  });

  it('spec(A-004:AC-3) dod(A-004:4) the service is usable synchronously, before the round-trip resolves', () => {
    const service = createAuthService(fb.sdk, { app: FAKE_APP, store: io.store });

    // No await. A screen that renders off this can never block on the network.
    expect(service.snapshot()).toEqual({ uid: null, mode: 'local-only' });
  });

  it('spec(A-004:AC-3) with no network the service resolves to local-only play and never rejects', async () => {
    fb.goOffline();
    const service = createAuthService(fb.sdk, { app: FAKE_APP, store: io.store });

    // `resolves`, not `rejects` — an unhandled rejection here is a blocked screen on a device.
    await expect(service.ready).resolves.toEqual({ uid: null, mode: 'local-only' });
    expect(service.snapshot().mode).toBe('local-only');
  });

  it('spec(A-004:AC-4) dod(A-004:3) getAuth() is never reached; initializeAuth carries RN persistence', async () => {
    const service = createAuthService(fb.sdk, { app: FAKE_APP, store: io.store });
    await service.ready;

    // The trap is reachable on the fake and must still be untouched.
    expect(fb.calls.getAuth).toBe(0);
    expect(fb.calls.initializeAuth).toBe(1);
    expect(fb.calls.getReactNativePersistence).toBe(1);
  });

  it('spec(A-004:AC-4) the trap detector is armed — a getAuth() client does fork identity', async () => {
    // This exercises the FAKE, on purpose. It is the proof that the assertions above can fail:
    // if getAuth() were silently equivalent to initializeAuth here, the cold-start test would be
    // green for the wrong reason and the trap would ship. Driving the same two-launch sequence
    // through a getAuth() client must produce two different UIDs.
    const launch = async () => {
      const client = fb.raw.getAuth(FAKE_APP);
      await new Promise<void>((resolve) => {
        fb.raw.onAuthStateChanged(client, () => resolve());
      });
      const { user } = await fb.raw.signInAnonymously(client);
      return user.uid;
    };

    const firstUid = await launch();
    const secondUid = await launch();

    expect(secondUid).not.toBe(firstUid);
  });
});
