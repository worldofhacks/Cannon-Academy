import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, initializeAuth, type Auth, type Persistence } from 'firebase/auth';
import * as firebaseAuth from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  type Firestore,
  type FirestoreSettings,
} from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const FIREBASE_KEYS = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
] as const;

type FirebaseEnvKey = (typeof FIREBASE_KEYS)[number];

export interface FirebaseClientConfig {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly storageBucket: string;
  readonly messagingSenderId: string;
  readonly appId: string;
}

export type FirebaseConfigResult =
  | { readonly enabled: true; readonly config: FirebaseClientConfig }
  | { readonly enabled: false; readonly reason: 'missing-config' | 'invalid-config' };

export interface FirebaseSdk {
  readonly getApps: () => readonly FirebaseApp[];
  readonly getApp: () => FirebaseApp;
  readonly initializeApp: (options: FirebaseOptions) => FirebaseApp;
  readonly getReactNativePersistence: (storage: unknown) => Persistence;
  readonly initializeAuth: (app: FirebaseApp, options: { readonly persistence: Persistence }) => Auth;
  readonly getAuth: (app: FirebaseApp) => Auth;
  readonly initializeFirestore: (app: FirebaseApp, settings: FirestoreSettings) => Firestore;
  readonly getFirestore: (app: FirebaseApp) => Firestore;
  readonly getStorage: (app: FirebaseApp) => FirebaseStorage;
}

export interface FirebaseClientDependencies {
  readonly env: Readonly<Record<string, unknown>>;
  readonly platform: 'ios' | 'android' | 'web';
  readonly asyncStorage: unknown;
  readonly sdk: FirebaseSdk;
}

export type FirebaseClient =
  | {
      readonly enabled: true;
      readonly app: FirebaseApp;
      readonly auth: Auth;
      readonly db: Firestore;
      readonly storage: FirebaseStorage;
    }
  | { readonly enabled: false; readonly reason: 'missing-config' | 'invalid-config' };

const FIRESTORE_ALREADY_INITIALIZED_MESSAGE =
  'initializeFirestore() has already been called with different options. To avoid this error, ' +
  'call initializeFirestore() with the same options as when it was originally called, or call ' +
  'getFirestore() to return the already initialized instance.';

const clientCache = new WeakMap<object, FirebaseClient>();

function valueFor(env: Readonly<Record<string, unknown>>, key: FirebaseEnvKey): string | undefined {
  const value = env[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return undefined;
  return value.trim() === '' ? undefined : value;
}

export function parseFirebaseConfig(env: Readonly<Record<string, unknown>>): FirebaseConfigResult {
  const values: Partial<Record<FirebaseEnvKey, string>> = {};
  for (const key of FIREBASE_KEYS) {
    const raw = env[key];
    if (raw === undefined || raw === null || raw === '') return { enabled: false, reason: 'missing-config' };
    if (typeof raw !== 'string') return { enabled: false, reason: 'invalid-config' };
    const value = valueFor(env, key);
    if (value === undefined) return { enabled: false, reason: 'missing-config' };
    values[key] = value;
  }

  return {
    enabled: true,
    config: {
      apiKey: values.EXPO_PUBLIC_FIREBASE_API_KEY!,
      authDomain: values.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN!,
      projectId: values.EXPO_PUBLIC_FIREBASE_PROJECT_ID!,
      storageBucket: values.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET!,
      messagingSenderId: values.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
      appId: values.EXPO_PUBLIC_FIREBASE_APP_ID!,
    },
  };
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

function isAuthAlreadyInitialized(error: unknown): boolean {
  return errorCode(error) === 'auth/already-initialized';
}

function isFirestoreAlreadyInitialized(error: unknown): boolean {
  return (
    errorCode(error) === 'failed-precondition' &&
    errorMessage(error) === FIRESTORE_ALREADY_INITIALIZED_MESSAGE
  );
}

function isInvalidApiKey(error: unknown): boolean {
  return errorCode(error) === 'auth/invalid-api-key';
}

export function createFirebaseClient(deps: FirebaseClientDependencies): FirebaseClient {
  const cached = clientCache.get(deps.sdk);
  if (cached !== undefined) return cached;

  const parsed = parseFirebaseConfig(deps.env);
  if (!parsed.enabled) return parsed;

  try {
    const app = deps.sdk.getApps().length === 0 ? deps.sdk.initializeApp(parsed.config) : deps.sdk.getApp();
    let currentAuth: Auth;
    if (deps.platform === 'web') {
      currentAuth = deps.sdk.getAuth(app);
    } else {
      const persistence = deps.sdk.getReactNativePersistence(deps.asyncStorage);
      try {
        currentAuth = deps.sdk.initializeAuth(app, { persistence });
      } catch (error) {
        if (!isAuthAlreadyInitialized(error)) throw error;
        currentAuth = deps.sdk.getAuth(app);
      }
    }

    let currentDb: Firestore;
    try {
      currentDb = deps.sdk.initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
    } catch (error) {
      if (!isFirestoreAlreadyInitialized(error)) throw error;
      currentDb = deps.sdk.getFirestore(app);
    }

    const client: FirebaseClient = {
      enabled: true,
      app,
      auth: currentAuth,
      db: currentDb,
      storage: deps.sdk.getStorage(app),
    };
    clientCache.set(deps.sdk, client);
    return client;
  } catch (error) {
    if (isInvalidApiKey(error)) return { enabled: false, reason: 'invalid-config' };
    throw error;
  }
}

const ambientSdk: FirebaseSdk = {
  getApps,
  getApp,
  initializeApp,
  getReactNativePersistence: (store) => {
    const fromFirebase = (firebaseAuth as unknown as { getReactNativePersistence?: unknown })
      .getReactNativePersistence;
    const factory = fromFirebase;
    if (typeof factory !== 'function') {
      throw new Error('React Native Firebase Auth persistence is unavailable');
    }
    return factory(store) as Persistence;
  },
  initializeAuth,
  getAuth,
  initializeFirestore,
  getFirestore,
  getStorage,
};

const ambientClient = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- avoids loading Flow syntax in node-only tests.
    const nativeRuntime = require('react-native') as { Platform: { OS: string } };
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- native-only dependency is injected in unit tests.
    const nativeStorage = require('@react-native-async-storage/async-storage') as { default: unknown };
    return createFirebaseClient({
      env: process.env,
      platform:
        nativeRuntime.Platform.OS === 'web' ? 'web' : nativeRuntime.Platform.OS === 'ios' ? 'ios' : 'android',
      asyncStorage: nativeStorage.default,
      sdk: ambientSdk,
    });
  } catch {
    return { enabled: false, reason: 'invalid-config' } as const;
  }
})();

export const auth: Auth | null = ambientClient.enabled ? ambientClient.auth : null;
export const db: Firestore | null = ambientClient.enabled ? ambientClient.db : null;
export const storage: FirebaseStorage | null = ambientClient.enabled ? ambientClient.storage : null;
