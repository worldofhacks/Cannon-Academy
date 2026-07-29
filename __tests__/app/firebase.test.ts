import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

const ROOT = new URL('../..', import.meta.url);
const ENV_EXAMPLE = fileURLToPath(new URL('.env.example', ROOT));
const GITIGNORE = fileURLToPath(new URL('.gitignore', ROOT));
const FIREBASE_RC = fileURLToPath(new URL('.firebaserc', ROOT));
const FIREBASE_JSON = fileURLToPath(new URL('firebase.json', ROOT));
const FIRESTORE_RULES = fileURLToPath(new URL('firestore.rules', ROOT));
const STORAGE_RULES = fileURLToPath(new URL('storage.rules', ROOT));

const PUBLIC_KEYS = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
] as const;

const completeEnv = Object.fromEntries(PUBLIC_KEYS.map((key, index) => [key, `public-${index}`]));

/** This dynamic import lets the RED suite collect even before A-025 creates its target module. */
async function firebaseBoundary(): Promise<any> {
  return import('../../src/services/firebase');
}

function fakeSdk() {
  const calls: string[] = [];
  const app = { kind: 'app' };
  const auth = { kind: 'auth' };
  const db = { kind: 'firestore' };
  const storage = { kind: 'storage' };
  let apps: unknown[] = [];

  return {
    calls,
    app,
    auth,
    db,
    storage,
    sdk: {
      getApps: () => apps,
      initializeApp: () => {
        calls.push('initializeApp');
        apps = [app];
        return app;
      },
      getApp: () => {
        calls.push('getApp');
        return app;
      },
      getReactNativePersistence: (store: unknown) => {
        calls.push('getReactNativePersistence');
        return { store };
      },
      initializeAuth: (_app: unknown, options: unknown) => {
        calls.push(`initializeAuth:${JSON.stringify(options)}`);
        return auth;
      },
      getAuth: () => {
        calls.push('getAuth');
        return auth;
      },
      initializeFirestore: (_app: unknown, options: unknown) => {
        calls.push(`initializeFirestore:${JSON.stringify(options)}`);
        return db;
      },
      getFirestore: () => {
        calls.push('getFirestore');
        return db;
      },
      getStorage: () => {
        calls.push('getStorage');
        return storage;
      },
    },
  };
}

describe('A-025 Firebase client boundary', () => {
  it('spec(A-025:AC-1) dod(A-025:1) parses all six public identifiers and disables explicitly for any missing value without logging or import-time throw', async () => {
    const boundary = await firebaseBoundary();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(boundary.parseFirebaseConfig(completeEnv)).toEqual({
        enabled: true,
        config: {
          apiKey: 'public-0', authDomain: 'public-1', projectId: 'public-2',
          storageBucket: 'public-3', messagingSenderId: 'public-4', appId: 'public-5',
        },
      });
      for (const missing of PUBLIC_KEYS) {
        const env = { ...completeEnv, [missing]: '' };
        expect(boundary.parseFirebaseConfig(env)).toEqual({ enabled: false, reason: 'missing-config' });
      }
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('spec(A-025:AC-2) dod(A-025:2) uses AsyncStorage React Native persistence on native, and browser Auth without it on web', async () => {
    const boundary = await firebaseBoundary();
    const native = fakeSdk();
    const store = { getItem: vi.fn(), setItem: vi.fn() };
    const nativeClient = boundary.createFirebaseClient({ env: completeEnv, platform: 'ios', asyncStorage: store, sdk: native.sdk });
    expect(nativeClient.auth).toBe(native.auth);
    expect(native.calls).toContain('getReactNativePersistence');
    expect(native.calls.find((call: string) => call.startsWith('initializeAuth:'))).toContain('store');

    const web = fakeSdk();
    const webClient = boundary.createFirebaseClient({ env: completeEnv, platform: 'web', asyncStorage: store, sdk: web.sdk });
    expect(webClient.auth).toBe(web.auth);
    expect(web.calls).not.toContain('getReactNativePersistence');
    expect(web.calls.find((call: string) => call.startsWith('initializeAuth:'))).toBeUndefined();
    expect(web.calls).toContain('getAuth');
  });

  it('spec(A-025:AC-3) reuses one app, Auth setup, and Firestore setup across repeated bootstrap calls', async () => {
    const boundary = await firebaseBoundary();
    const fake = fakeSdk();
    const args = { env: completeEnv, platform: 'android', asyncStorage: {}, sdk: fake.sdk };
    const first = boundary.createFirebaseClient(args);
    const second = boundary.createFirebaseClient(args);
    expect(second).toBe(first);
    expect(fake.calls.filter((call) => call === 'initializeApp')).toHaveLength(1);
    expect(fake.calls.filter((call) => call.startsWith('initializeAuth:'))).toHaveLength(1);
    expect(fake.calls.filter((call) => call.startsWith('initializeFirestore:'))).toHaveLength(1);
  });

  it('spec(A-025:AC-3) only falls back to SDK getters for the documented already-initialized condition', async () => {
    const boundary = await firebaseBoundary();
    const already = fakeSdk();
    already.sdk.initializeAuth = () => { throw Object.assign(new Error('already initialized'), { code: 'auth/already-initialized' }); };
    expect(boundary.createFirebaseClient({ env: completeEnv, platform: 'android', asyncStorage: {}, sdk: already.sdk }).auth).toBe(already.auth);
    expect(already.calls).toContain('getAuth');

    const broken = fakeSdk();
    broken.sdk.initializeAuth = () => { throw Object.assign(new Error('network'), { code: 'auth/network-request-failed' }); };
    expect(() => boundary.createFirebaseClient({ env: completeEnv, platform: 'android', asyncStorage: {}, sdk: broken.sdk })).toThrow('network');
  });

  it('spec(A-025:AC-4) initializes Firestore long-polling before any getter and exports auth, db, and storage', async () => {
    const boundary = await firebaseBoundary();
    const fake = fakeSdk();
    const client = boundary.createFirebaseClient({ env: completeEnv, platform: 'android', asyncStorage: {}, sdk: fake.sdk });
    expect(client).toMatchObject({ auth: fake.auth, db: fake.db, storage: fake.storage });
    expect(fake.calls.findIndex((call) => call.startsWith('initializeFirestore:'))).toBeLessThan(fake.calls.findIndex((call) => call === 'getStorage'));
    expect(fake.calls.find((call) => call.startsWith('initializeFirestore:'))).toContain('experimentalAutoDetectLongPolling');
    expect(boundary).toHaveProperty('auth');
    expect(boundary).toHaveProperty('db');
    expect(boundary).toHaveProperty('storage');
  });

  it('spec(A-025:AC-5) dod(A-025:5) commits the six-key public environment contract, project selection, and deny-all deployed rules', () => {
    const entries = readFileSync(ENV_EXAMPLE, 'utf8').split(/\r?\n/).filter(Boolean);
    expect(entries).toEqual(PUBLIC_KEYS.map((key) => `${key}=`));
    expect(readFileSync(GITIGNORE, 'utf8')).toMatch(/^\.env(?:\.|$)/m);
    expect(JSON.parse(readFileSync(FIREBASE_RC, 'utf8'))).toMatchObject({ projects: { default: 'cannon-academy' } });
    expect(JSON.parse(readFileSync(FIREBASE_JSON, 'utf8'))).toMatchObject({ firestore: { rules: 'firestore.rules' }, storage: { rules: 'storage.rules' } });
    for (const rulesPath of [FIRESTORE_RULES, STORAGE_RULES]) {
      expect(readFileSync(rulesPath, 'utf8')).toMatch(/allow\s+(?:read|write|read,\s*write)\s*:\s*if\s+false\s*;/);
    }
  });

  it('spec(A-025:AC-6) dod(A-025:4) freezes the non-destructive provisioning evidence contract in Firebase configuration', () => {
    const config = JSON.parse(readFileSync(FIREBASE_JSON, 'utf8'));
    expect(config).toMatchObject({ firestore: { rules: 'firestore.rules' }, storage: { rules: 'storage.rules' } });
    expect(readFileSync(FIREBASE_RC, 'utf8')).toContain('cannon-academy');
    // Project/app/database/bucket/provider state is console evidence, not something a unit mock can prove.
  });

  it('spec(A-025:AC-7) dod(A-025:3) treats a config-free launch as local-only and keeps only public client identifiers in the repository contract', async () => {
    const boundary = await firebaseBoundary();
    expect(boundary.createFirebaseClient({ env: {}, platform: 'web', asyncStorage: {}, sdk: fakeSdk().sdk })).toEqual({ enabled: false, reason: 'missing-config' });
    expect(readFileSync(ENV_EXAMPLE, 'utf8')).not.toMatch(/SERVICE_ACCOUNT|PRIVATE_KEY|ADMIN|SECRET/);
  });

  it('spec(A-025:AC-8) dod(A-025:6) preserves the rollback boundary: removing public config returns local-only while both services remain deny-all', async () => {
    const boundary = await firebaseBoundary();
    expect(boundary.createFirebaseClient({ env: {}, platform: 'android', asyncStorage: {}, sdk: fakeSdk().sdk })).toEqual({ enabled: false, reason: 'missing-config' });
    for (const rulesPath of [FIRESTORE_RULES, STORAGE_RULES]) {
      expect(readFileSync(rulesPath, 'utf8')).toMatch(/if\s+false\s*;/);
    }
  });
});
