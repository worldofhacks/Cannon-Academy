import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

type FirebaseBoundaryModule = typeof import('../../src/services/firebase');

type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

type FirebaseConfigResult =
  | { enabled: true; config: FirebaseClientConfig }
  | { enabled: false; reason: 'missing-config' | 'invalid-config' };

type EnabledClient = {
  readonly app: unknown;
  readonly auth: unknown;
  readonly db: unknown;
  readonly storage: unknown;
};

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

const completeEnv = Object.fromEntries(
  PUBLIC_KEYS.map((key, index) => [key, `public-${index}`]),
) as Record<(typeof PUBLIC_KEYS)[number], string>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A dynamic import lets Vitest collect every RED case before the target exists. A missing target
 * becomes an assertion with the intended module path instead of an uncaught Vite loader error.
 * Other import-time failures are deliberately preserved: missing config may never crash import.
 */
async function firebaseBoundary(): Promise<FirebaseBoundaryModule> {
  try {
    return await vi.importActual<FirebaseBoundaryModule>('../../src/services/firebase');
  } catch (error) {
    const message = errorMessage(error);
    const targetIsMissing =
      message.includes('src/services/firebase') &&
      (message.includes('Cannot find module') ||
        message.includes('Failed to load url') ||
        message.includes('Does the file exist'));
    if (targetIsMissing) {
      expect.fail(
        'A-025 RED: expected production boundary src/services/firebase.ts has not been implemented',
      );
    }
    throw error;
  }
}

function enabledClient(value: unknown): EnabledClient {
  expect(value).toEqual(
    expect.objectContaining({
      app: expect.anything(),
      auth: expect.anything(),
      db: expect.anything(),
      storage: expect.anything(),
    }),
  );
  return value as EnabledClient;
}

interface FakeSdkOptions {
  readonly existingApp?: boolean;
  readonly initializeAppError?: Error & { code?: string };
  readonly initializeAuthError?: Error & { code?: string };
  readonly initializeFirestoreError?: Error & { code?: string };
}

/**
 * Records references, not JSON renderings. Firebase objects carry hidden identity and a wiring
 * test that compares only shapes can pass while persistence or an app from another bootstrap is
 * supplied to the SDK.
 */
function fakeSdk(options: FakeSdkOptions = {}) {
  const app = { kind: 'app-sentinel' };
  const initializedAuth = { kind: 'initialized-auth-sentinel' };
  const getterAuth = { kind: 'getter-auth-sentinel' };
  const initializedDb = { kind: 'initialized-firestore-sentinel' };
  const getterDb = { kind: 'getter-firestore-sentinel' };
  const storage = { kind: 'storage-sentinel' };
  const persistence = { kind: 'react-native-persistence-sentinel' };
  let apps: unknown[] = options.existingApp ? [app] : [];

  const events: string[] = [];
  const args = {
    initializeApp: [] as unknown[],
    getReactNativePersistence: [] as unknown[],
    initializeAuth: [] as Array<{ app: unknown; options: unknown }>,
    getAuth: [] as unknown[],
    initializeFirestore: [] as Array<{ app: unknown; settings: unknown }>,
    getFirestore: [] as unknown[],
    getStorage: [] as unknown[],
  };
  const counts = {
    getApps: 0,
    getApp: 0,
  };

  const sdk = {
    getApps(): unknown[] {
      events.push('getApps');
      counts.getApps += 1;
      return apps;
    },
    initializeApp(config: unknown): unknown {
      events.push('initializeApp');
      args.initializeApp.push(config);
      if (options.initializeAppError !== undefined) throw options.initializeAppError;
      apps = [app];
      return app;
    },
    getApp(): unknown {
      events.push('getApp');
      counts.getApp += 1;
      return app;
    },
    getReactNativePersistence(store: unknown): unknown {
      events.push('getReactNativePersistence');
      args.getReactNativePersistence.push(store);
      return persistence;
    },
    initializeAuth(appArg: unknown, authOptions: unknown): unknown {
      events.push('initializeAuth');
      args.initializeAuth.push({ app: appArg, options: authOptions });
      if (options.initializeAuthError !== undefined) throw options.initializeAuthError;
      return initializedAuth;
    },
    getAuth(appArg: unknown): unknown {
      events.push('getAuth');
      args.getAuth.push(appArg);
      return getterAuth;
    },
    initializeFirestore(appArg: unknown, settings: unknown): unknown {
      events.push('initializeFirestore');
      args.initializeFirestore.push({ app: appArg, settings });
      if (options.initializeFirestoreError !== undefined) {
        throw options.initializeFirestoreError;
      }
      return initializedDb;
    },
    getFirestore(appArg: unknown): unknown {
      events.push('getFirestore');
      args.getFirestore.push(appArg);
      return getterDb;
    },
    getStorage(appArg: unknown): unknown {
      events.push('getStorage');
      args.getStorage.push(appArg);
      return storage;
    },
  };

  return {
    sdk,
    app,
    initializedAuth,
    getterAuth,
    initializedDb,
    getterDb,
    storage,
    persistence,
    events,
    args,
    counts,
  };
}

function createClient(
  boundary: FirebaseBoundaryModule,
  fake: ReturnType<typeof fakeSdk>,
  platform: 'ios' | 'android' | 'web',
  asyncStorage: unknown = {},
): unknown {
  return boundary.createFirebaseClient({
    env: completeEnv,
    platform,
    asyncStorage,
    sdk: fake.sdk as never,
  });
}

function uncommentedLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

function dotenvAssignments(text: string): Map<string, string> {
  const assignments = new Map<string, string>();
  for (const line of uncommentedLines(text)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    expect(match, `invalid non-comment .env.example line: ${line}`).not.toBeNull();
    const key = match?.[1];
    const value = match?.[2];
    if (key === undefined || value === undefined) {
      throw new Error(`invalid non-comment .env.example line: ${line}`);
    }
    assignments.set(key, value);
  }
  return assignments;
}

function withoutRuleComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function expectDenyAllRules(
  path: string,
  servicePattern: RegExp,
  rootMatchPattern: RegExp,
  catchAllPattern: RegExp,
): void {
  const source = withoutRuleComments(readFileSync(path, 'utf8'));
  expect(source).toMatch(/rules_version\s*=\s*['"]2['"]\s*;/);
  expect(source).toMatch(servicePattern);
  expect(source).toMatch(rootMatchPattern);
  expect(source).toMatch(catchAllPattern);
  expect(source.match(/{/g)).toHaveLength(source.match(/}/g)?.length ?? 0);

  const allowTokens = source.match(/\ballow\b/g) ?? [];
  const clauses = [
    ...source.matchAll(/\ballow\s+([^:;{}]+)\s*:\s*if\s+([^;{}]+)\s*;/g),
  ];
  expect(clauses.length, 'deny-all rules must contain an explicit allow clause').toBeGreaterThan(0);
  expect(clauses, 'every allow token must be a complete, inspectable clause').toHaveLength(
    allowTokens.length,
  );
  for (const clause of clauses) {
    expect(clause[2]?.trim(), `non-deny rule found: ${clause[0]}`).toBe('false');
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('A-025 Firebase client boundary', () => {
  it('spec(A-025:AC-1) parses exactly six populated identifiers and rejects deleted, empty, and whitespace values without logging', async () => {
    const boundary = await firebaseBoundary();
    const logs = [
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
    ];

    const complete = boundary.parseFirebaseConfig(completeEnv);
    expectTypeOf(complete).toMatchTypeOf<FirebaseConfigResult>();
    expect(complete).toEqual({
      enabled: true,
      config: {
        apiKey: 'public-0',
        authDomain: 'public-1',
        projectId: 'public-2',
        storageBucket: 'public-3',
        messagingSenderId: 'public-4',
        appId: 'public-5',
      },
    });

    for (const key of PUBLIC_KEYS) {
      const deleted: Partial<typeof completeEnv> = { ...completeEnv };
      delete deleted[key];
      expect(boundary.parseFirebaseConfig(deleted)).toEqual({
        enabled: false,
        reason: 'missing-config',
      });
      for (const invalidValue of ['', '   \t']) {
        expect(
          boundary.parseFirebaseConfig({ ...completeEnv, [key]: invalidValue }),
        ).toEqual({ enabled: false, reason: 'missing-config' });
      }
    }
    expect(
      boundary.parseFirebaseConfig({
        ...completeEnv,
        EXPO_PUBLIC_FIREBASE_API_KEY: 42,
      } as never),
    ).toEqual({ enabled: false, reason: 'invalid-config' });
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });

  it('spec(A-025:AC-1) missing ambient config cannot throw or log during module import', async () => {
    const prior = new Map(PUBLIC_KEYS.map((key) => [key, process.env[key]]));
    for (const key of PUBLIC_KEYS) delete process.env[key];
    vi.resetModules();
    const logs = [
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
    ];

    try {
      const boundary = await firebaseBoundary();
      expect(boundary.auth).toBeNull();
      expect(boundary.db).toBeNull();
      expect(boundary.storage).toBeNull();
      for (const log of logs) expect(log).not.toHaveBeenCalled();
    } finally {
      for (const [key, value] of prior) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      vi.resetModules();
    }
  });

  it('spec(A-025:AC-1) invalid SDK config fails closed to an explicit disabled client before any data service starts', async () => {
    const boundary = await firebaseBoundary();
    const invalid = Object.assign(new Error('invalid api key'), { code: 'app/invalid-api-key' });
    const fake = fakeSdk({ initializeAppError: invalid });
    let result: unknown;

    expect(() => {
      result = createClient(boundary, fake, 'web');
    }).not.toThrow();
    expect(result).toEqual({
      enabled: false,
      reason: 'invalid-config',
    });
    expect(fake.args.initializeAuth).toHaveLength(0);
    expect(fake.args.getAuth).toHaveLength(0);
    expect(fake.args.initializeFirestore).toHaveLength(0);
    expect(fake.args.getStorage).toHaveLength(0);
  });

  it.each(['ios', 'android'] as const)(
    'spec(A-025:AC-2) %s supplies the exact AsyncStorage-backed persistence sentinel to initializeAuth',
    async (platform) => {
      const boundary = await firebaseBoundary();
      const fake = fakeSdk();
      const asyncStorage = { kind: `${platform}-async-storage-sentinel` };

      const client = enabledClient(createClient(boundary, fake, platform, asyncStorage));

      expect(client.app).toBe(fake.app);
      expect(client.auth).toBe(fake.initializedAuth);
      expect(fake.args.getReactNativePersistence).toEqual([asyncStorage]);
      expect(fake.args.initializeAuth).toHaveLength(1);
      expect(fake.args.initializeAuth[0]?.app).toBe(fake.app);
      expect(fake.args.initializeAuth[0]?.options).toEqual({ persistence: fake.persistence });
      expect(
        (fake.args.initializeAuth[0]?.options as { persistence: unknown }).persistence,
      ).toBe(fake.persistence);
      expect(fake.args.getAuth).toHaveLength(0);
    },
  );

  it('spec(A-025:AC-2) web supplies the exact app to browser Auth and never reaches React Native initialization', async () => {
    const boundary = await firebaseBoundary();
    const fake = fakeSdk();
    const asyncStorage = { kind: 'must-not-be-used' };

    const client = enabledClient(createClient(boundary, fake, 'web', asyncStorage));

    expect(client.app).toBe(fake.app);
    expect(client.auth).toBe(fake.getterAuth);
    expect(fake.args.getAuth).toEqual([fake.app]);
    expect(fake.args.getReactNativePersistence).toHaveLength(0);
    expect(fake.args.initializeAuth).toHaveLength(0);
  });

  it('spec(A-025:AC-3) uses getApps/getApp for an existing app and passes that exact app to every client getter or initializer', async () => {
    const boundary = await firebaseBoundary();
    const fake = fakeSdk({ existingApp: true });

    const client = enabledClient(createClient(boundary, fake, 'web'));

    expect(fake.counts.getApps).toBe(1);
    expect(fake.counts.getApp).toBe(1);
    expect(fake.args.initializeApp).toHaveLength(0);
    expect(client.app).toBe(fake.app);
    expect(fake.args.getAuth).toEqual([fake.app]);
    expect(fake.args.initializeFirestore[0]?.app).toBe(fake.app);
    expect(fake.args.getStorage).toEqual([fake.app]);
  });

  it('spec(A-025:AC-3) reuses one app, Auth configuration, and Firestore configuration across repeated requests', async () => {
    const boundary = await firebaseBoundary();
    const fake = fakeSdk();
    const asyncStorage = { kind: 'stable-store' };

    const first = createClient(boundary, fake, 'android', asyncStorage);
    const second = createClient(boundary, fake, 'android', asyncStorage);

    expect(second).toBe(first);
    expect(fake.args.initializeApp).toHaveLength(1);
    expect(fake.args.initializeAuth).toHaveLength(1);
    expect(fake.args.initializeFirestore).toHaveLength(1);
    expect(fake.args.getStorage).toHaveLength(1);
  });

  it('spec(A-025:AC-3) falls back to getAuth for the Auth already-initialized condition', async () => {
    const boundary = await firebaseBoundary();
    const authAlready = Object.assign(new Error('Auth already initialized'), {
      code: 'auth/already-initialized',
    });
    const authFake = fakeSdk({ initializeAuthError: authAlready });
    const authClient = enabledClient(createClient(boundary, authFake, 'android'));
    expect(authClient.auth).toBe(authFake.getterAuth);
    expect(authFake.args.getAuth).toEqual([authFake.app]);
  });

  it('spec(A-025:AC-3) falls back to getFirestore for the Firestore already-initialized condition', async () => {
    const boundary = await firebaseBoundary();
    const firestoreAlready = Object.assign(new Error('Firestore has already been initialized'), {
      code: 'failed-precondition',
    });
    const firestoreFake = fakeSdk({ initializeFirestoreError: firestoreAlready });
    const firestoreClient = enabledClient(createClient(boundary, firestoreFake, 'web'));
    expect(firestoreClient.db).toBe(firestoreFake.getterDb);
    expect(firestoreFake.args.getFirestore).toEqual([firestoreFake.app]);
  });

  it('spec(A-025:AC-3) propagates unrelated Auth initialization errors without falling back to getAuth', async () => {
    const boundary = await firebaseBoundary();
    const unrelatedAuth = Object.assign(new Error('auth network failure'), {
      code: 'auth/network-request-failed',
    });
    const brokenAuth = fakeSdk({ initializeAuthError: unrelatedAuth });
    expect(() => createClient(boundary, brokenAuth, 'android')).toThrow(unrelatedAuth);
    expect(brokenAuth.args.getAuth).toHaveLength(0);
  });

  it('spec(A-025:AC-3) propagates unrelated Firestore initialization errors without falling back to getFirestore', async () => {
    const boundary = await firebaseBoundary();
    const unrelatedFirestore = Object.assign(new Error('firestore unavailable'), {
      code: 'unavailable',
    });
    const brokenFirestore = fakeSdk({ initializeFirestoreError: unrelatedFirestore });
    expect(() => createClient(boundary, brokenFirestore, 'web')).toThrow(unrelatedFirestore);
    expect(brokenFirestore.args.getFirestore).toHaveLength(0);
  });

  it('spec(A-025:AC-4) initializes Firestore with automatic long-polling detection before any Firestore getter', async () => {
    const boundary = await firebaseBoundary();
    const fake = fakeSdk();

    const client = enabledClient(createClient(boundary, fake, 'android'));

    expect(client.db).toBe(fake.initializedDb);
    expect(client.storage).toBe(fake.storage);
    expect(fake.args.initializeFirestore).toEqual([
      {
        app: fake.app,
        settings: { experimentalAutoDetectLongPolling: true },
      },
    ]);
    expect(fake.args.getFirestore).toHaveLength(0);
    expect(fake.events.indexOf('initializeFirestore')).toBeGreaterThan(-1);
    expect(fake.events.indexOf('initializeFirestore')).toBeLessThan(
      fake.events.indexOf('getStorage'),
    );
  });

  it('spec(A-025:AC-4) dod(A-025:2) exports typed nullable Auth, Firestore, and Storage clients beside the factory', async () => {
    const boundary = await firebaseBoundary();

    expectTypeOf(boundary.auth).toEqualTypeOf<Auth | null>();
    expectTypeOf(boundary.db).toEqualTypeOf<Firestore | null>();
    expectTypeOf(boundary.storage).toEqualTypeOf<FirebaseStorage | null>();
    expect(boundary.createFirebaseClient).toBeTypeOf('function');
    expect(boundary.parseFirebaseConfig).toBeTypeOf('function');
    expect(boundary).toHaveProperty('auth');
    expect(boundary).toHaveProperty('db');
    expect(boundary).toHaveProperty('storage');
  });

  it('spec(A-025:AC-5) commits exactly six blank non-comment dotenv keys and ignores local env variants', () => {
    const assignments = dotenvAssignments(readFileSync(ENV_EXAMPLE, 'utf8'));
    expect([...assignments.keys()]).toEqual(PUBLIC_KEYS);
    expect([...assignments.values()]).toEqual(PUBLIC_KEYS.map(() => ''));

    const ignoreLines = uncommentedLines(readFileSync(GITIGNORE, 'utf8'));
    expect(ignoreLines).toContain('.env');
    expect(ignoreLines).toContain('.env.*');
    expect(ignoreLines).toContain('!.env.example');
  });

  it('spec(A-025:AC-5) wires the selected project to complete Firestore and Storage deny-all rules', () => {
    expect(JSON.parse(readFileSync(FIREBASE_RC, 'utf8'))).toMatchObject({
      projects: { default: 'cannon-academy' },
    });
    expect(JSON.parse(readFileSync(FIREBASE_JSON, 'utf8'))).toMatchObject({
      firestore: { rules: 'firestore.rules' },
      storage: { rules: 'storage.rules' },
    });

    expectDenyAllRules(
      FIRESTORE_RULES,
      /service\s+cloud\.firestore\s*\{/,
      /match\s+\/databases\/\{database\}\/documents\s*\{/,
      /match\s+\/\{document=\*\*\}\s*\{/,
    );
    expectDenyAllRules(
      STORAGE_RULES,
      /service\s+firebase\.storage\s*\{/,
      /match\s+\/b\/\{bucket\}\/o\s*\{/,
      /match\s+\/\{allPaths=\*\*\}\s*\{/,
    );
  });

  it('spec(A-025:AC-6) freezes only the deterministic repository half of provisioning evidence', () => {
    const rc = JSON.parse(readFileSync(FIREBASE_RC, 'utf8'));
    const deploy = JSON.parse(readFileSync(FIREBASE_JSON, 'utf8'));
    expect(rc.projects?.default).toBe('cannon-academy');
    expect(deploy.firestore?.rules).toBe('firestore.rules');
    expect(deploy.storage?.rules).toBe('storage.rules');

    // This does NOT prove the live Web app count, nam5 database, us-central1 bucket, anonymous-only
    // provider state, or deployed rules releases. Those claims require owner-approved CLI/console
    // evidence and are intentionally outside a deterministic unit test.
  });

  it('spec(A-025:AC-7) dod(A-025:3) keeps a config-free client local-only and the committed contract limited to public identifiers', async () => {
    const boundary = await firebaseBoundary();
    expect(
      boundary.createFirebaseClient({
        env: {},
        platform: 'web',
        asyncStorage: {},
        sdk: fakeSdk().sdk as never,
      }),
    ).toEqual({ enabled: false, reason: 'missing-config' });

    const envContract = readFileSync(ENV_EXAMPLE, 'utf8');
    expect([...dotenvAssignments(envContract).keys()]).toEqual(PUBLIC_KEYS);
    expect(envContract).not.toMatch(/SERVICE_ACCOUNT|PRIVATE_KEY|ADMIN|SECRET/i);

    // This does NOT inspect ignored .env.local or live EAS production/preview values, and therefore
    // makes no claim that those process-only environments match the registered Firebase Web app.
  });

  it('spec(A-025:AC-8) freezes only the deterministic local-only and deny-all rollback boundaries', async () => {
    const boundary = await firebaseBoundary();
    expect(
      boundary.createFirebaseClient({
        env: {},
        platform: 'android',
        asyncStorage: {},
        sdk: fakeSdk().sdk as never,
      }),
    ).toEqual({ enabled: false, reason: 'missing-config' });
    expectDenyAllRules(
      FIRESTORE_RULES,
      /service\s+cloud\.firestore\s*\{/,
      /match\s+\/databases\/\{database\}\/documents\s*\{/,
      /match\s+\/\{document=\*\*\}\s*\{/,
    );
    expectDenyAllRules(
      STORAGE_RULES,
      /service\s+firebase\.storage\s*\{/,
      /match\s+\/b\/\{bucket\}\/o\s*\{/,
      /match\s+\/\{allPaths=\*\*\}\s*\{/,
    );

    // Removing live EAS values, preserving Captain progress, retaining the Hosting alias, and
    // redeploying audited rules are process evidence; this test does not pretend to execute them.
  });
});
