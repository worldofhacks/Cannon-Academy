/**
 * Anonymous identity that survives a cold start.
 *
 * A-004. The checklist requires progress to persist "under the same anonymous UID", and README
 * §Traps names the way that silently fails: the Firebase JS SDK defaults to **in-memory** auth on
 * React Native, so `getAuth()` mints a NEW anonymous UID on every cold start. Local progress keeps
 * looking correct while cloud identity forks. The only fix is `initializeAuth` with
 * `getReactNativePersistence(store)` — which is why `getAuth` is never referenced in this file.
 *
 * **The SDK is injected, not imported**, exactly as `persistence.ts` takes a `KeyValueStore`:
 * `firebase` and `@react-native-async-storage/async-storage` both reach React Native's Flow-typed
 * entry point, which the node test runner cannot parse. The real SDK is supplied once, at the app
 * edge; the seam is what lets the trap be asserted against rather than merely avoided.
 *
 * The governing stance is that **cloud identity is optional to play**. Construction is synchronous
 * and `snapshot()` is readable immediately, so no screen ever awaits the auth round-trip; `ready`
 * resolves and never rejects, because an unhandled rejection here is a blocked screen on a device.
 */
import type { KeyValueStore } from './persistence';

/** The slice of `FirebaseApp` this needs. Narrow on purpose — it is the whole test seam. */
export interface AuthApp {
  readonly name: string;
}

export interface AuthUser {
  readonly uid: string;
}

/**
 * Opaque handles. Only the SDK ever looks inside a persistence object or an auth client, so
 * naming their shape here would be inventing a contract we do not own — and would stop the real
 * Firebase types from satisfying it at the app edge.
 */
export type AuthPersistence = unknown;
export type AuthClient = unknown;

/** The four SDK entry points this service uses, plus the trap it must never reach for. */
export interface AuthSdk {
  getReactNativePersistence: (store: KeyValueStore) => AuthPersistence;
  initializeAuth: (app: AuthApp, options: { persistence: AuthPersistence }) => AuthClient;
  signInAnonymously: (client: AuthClient) => Promise<{ user: AuthUser }>;
  onAuthStateChanged: (client: AuthClient, cb: (user: AuthUser | null) => void) => () => void;
}

export interface AuthSnapshot {
  /** Null until an identity exists — and permanently null when the device is offline. */
  readonly uid: string | null;
  readonly mode: 'cloud' | 'local-only';
}

export interface AuthService {
  /** Readable at any time, including before `ready` settles. */
  snapshot: () => AuthSnapshot;
  /** Resolves once identity is known, or once it is known to be unavailable. Never rejects. */
  ready: Promise<AuthSnapshot>;
}

const LOCAL_ONLY: AuthSnapshot = { uid: null, mode: 'local-only' };

export interface AuthDeps {
  readonly app: AuthApp;
  readonly store: KeyValueStore;
}

/**
 * Wires anonymous auth and starts the round-trip. Returns synchronously.
 *
 * The restore-then-decide order is what makes the cold start work: `onAuthStateChanged` fires only
 * after the SDK has finished reading its own record out of `store`, so a relaunch sees the restored
 * user and never signs in again. Signing in on a `null` user is therefore guarded to happen at most
 * once per service — a second sign-in is a forked identity by another name.
 */
export function createAuthService(sdk: AuthSdk, deps: AuthDeps): AuthService {
  let current: AuthSnapshot = LOCAL_ONLY;

  // The executor runs synchronously, so `resolveReady` is assigned before this function returns.
  let resolveReady: (snapshot: AuthSnapshot) => void = () => undefined;
  const ready = new Promise<AuthSnapshot>((resolve) => {
    resolveReady = resolve;
  });

  let settled = false;
  const settle = (snapshot: AuthSnapshot): void => {
    current = snapshot;
    if (settled) return;
    settled = true;
    resolveReady(snapshot);
  };

  // `getAuth()` is the trap; `initializeAuth` with an AsyncStorage-backed persistence is the fix.
  const persistence = sdk.getReactNativePersistence(deps.store);
  const client = sdk.initializeAuth(deps.app, { persistence });

  let signInStarted = false;
  sdk.onAuthStateChanged(client, (user) => {
    if (user !== null) {
      settle({ uid: user.uid, mode: 'cloud' });
      return;
    }
    if (signInStarted) return;
    signInStarted = true;
    void sdk.signInAnonymously(client).then(
      (credential) => {
        settle({ uid: credential.user.uid, mode: 'cloud' });
      },
      () => {
        // No network, or auth is unreachable. Play continues locally; the next launch retries.
        settle(LOCAL_ONLY);
      },
    );
  });

  return {
    snapshot: () => current,
    ready,
  };
}
