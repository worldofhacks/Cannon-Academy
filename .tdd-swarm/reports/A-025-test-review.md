# A-025 Frozen-Test Dispute Review — APPROVED

Reviewed frozen-test HEAD `019913d` against installed `firebase@12.16.0`
(`@firebase/auth@1.13.3`) and production commit `28338e8`.

## Verdict

**APPROVED** — no Critical or Important test-design findings remain. The observed result is the
expected **23 green / 3 legitimate RED**, and the three RED tests expose one remaining production
integration defect without weakening the frozen persistence contract.

## Auth surface and mocking

The dispute resolution is correct:

- `firebase/auth/react-native` is not an exported subpath in installed `firebase@12.16.0`.
- The installed `@firebase/auth` package exposes its React Native implementation through the
  `react-native` condition of the supported `firebase/auth` surface; that conditional bundle
  exports `getReactNativePersistence`.
- Commit `019913d` removes only the unsupported subpath mock and retains the
  `vi.doMock('firebase/auth', ...)` facade containing `getAuth`, `initializeAuth`, and
  `getReactNativePersistence`.

Exact native behavior remains protected. Fresh iOS/Android tests assert AsyncStorage reference
identity, persistence-sentinel identity, exact `{ persistence }` wiring, and no `getAuth` fallback.
The iOS/Android reload tests still assert two persistence constructions with the same AsyncStorage
object, two exact `initializeAuth` calls, retained Firebase app identity, and exactly one
`getAuth(app)` call after `auth/already-initialized`.

## Injected storage types

`InjectedAsyncStorage` and the SDK facade's persistence-storage argument being `unknown` is
appropriate at this cross-platform injection seam. The default Node/TypeScript condition does not
publish the React Native-only storage type, the boundary does not inspect or operate on the value,
and `unknown` prevents unsafe property access while preserving the exact runtime object for the
conditional RN persistence factory. The identity assertions supply the behavioral guarantee; a
fabricated test-only structural type would add no runtime protection.

## 23 green / 3 legitimate RED

The focused run collects 26 tests: 23 pass and these 3 fail:

1. Ambient service-unavailability reaches null clients before the mocked Firestore initializer.
2. iOS ambient module reload returns null on the first evaluation.
3. Android ambient module reload returns null on the first evaluation.

All three share the same production cause: `src/services/firebase.ts` obtains
`getReactNativePersistence` through a namespace/unknown bridge that does not bind to the supported
mocked conditional Auth export in this test runtime. Fresh injected-client persistence tests pass,
so the factory contract is intact; the ambient/reload tests remain RED and correctly require the
production wrapper to use a supported, mockable `firebase/auth` integration without falling back
to in-memory Auth. They are not harness failures or obsolete-subpath failures.

Additional verification:

- `npm test -- --run __tests__/app/firebase.test.ts` — 23 passed, 3 failed for the reasons above
- `npm run typecheck -- --pretty false` — PASS
- `npx prettier --check __tests__/app/firebase.test.ts` — PASS
- Scoped ESLint for the test and production boundary — PASS
- `.tdd-swarm/spec-lint.sh tickets/app/A-025.md` — PASS

The frozen suite is approved; production still needs to drive the three intentional RED cases
green.
