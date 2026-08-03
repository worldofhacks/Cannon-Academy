# Release runbook — phone builds and EAS Hosting

Current reviewer landing: [`README.md`](README.md). Ticket status: [`tickets/INDEX.md`](tickets/INDEX.md).

**Web production is EAS Hosting only** at <https://cannon-academy.expo.app>. Firebase is the
backend boundary (Auth/Firestore/Storage client + rules), not a web host. Railway is unused.

---

## A. EAS Hosting (web)

| URL                                           | Role                                                                         | Evidence                   |
| --------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------- |
| <https://cannon-academy.expo.app>             | Production alias — serves immutable deployment `24prch14ju` built from `main` @ `bf9df3d` | All 12 routes HTTP 200 probed 2026-08-03 |
| <https://cannon-academy--24prch14ju.expo.app> | Immutable current-production deployment (promoted 2026-08-03 after all-route verification) | HTTP 200 probed 2026-08-03 |
| <https://cannon-academy--wejre1bucz.expo.app> | Immutable A-042 release deployment — code `28f4ccc` (committed A-044 record) | HTTP 200 probed 2026-08-03 |
| <https://cannon-academy--2f4tf1erk3.expo.app> | Immutable rollback target preceding A-042 (committed A-044 record)           | HTTP 200 probed 2026-08-03 |
| <https://cannon-academy--waa9davmr9.expo.app> | Later immutable deployment recorded 2026-07-29 as carrying `5147e38`         | HTTP 200 probed 2026-08-03 |

Deployments are immutable. Promote or roll back by reassigning the production alias.

```bash
# export + deploy a new immutable preview URL
npx expo export --platform web
eas deploy

# promote that deployment (or any known id) to the production alias
eas deploy --prod
# or:
eas deploy:alias --prod --id=<deploymentId>

# roll production back to a known immutable deployment (e.g. the A-042 release)
eas deploy:alias --prod --id=wejre1bucz
```

Do not document Firebase Hosting or a second production web target. `firebase.json` ships
Firestore/Storage rules only.

**Firebase env (no secrets in git):** six `EXPO_PUBLIC_FIREBASE_*` names in `.env.example`; real
values in ignored `.env.local` and EAS preview/production environments. Client exports exist;
anonymous boot and profile sync are separate product tickets — local AsyncStorage remains
authoritative for play.

---

## B. Getting the app onto a phone

Three paths, in the order they become available.

### 0. Constraint you will hit before any of them

**The repo path contains a space** (`.../Gauntlet/Math Game/...`) and iOS build scripts break on
it. Xcode generates script phases of the form:

```
bash -l -c "$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh"
```

Xcode expands the variable into the string and `bash -c` then **re-parses it**, so `Math Game`
splits into a command plus an argument and the build fails with a path truncated at the space.
Two script phases have this shape today (expo-constants, and the expo-modules provider); the
Release bundle phase is a known third. `pod install` and `expo prebuild` regenerate both files,
so patching them does not stick.

Current workaround: a second git worktree at a space-free path.

```bash
git worktree add --detach /Users/quietguy/Documents/Dev/Gauntlet/cannon-academy-ios app/shell
```

Build from there, keep it synced with `git checkout --detach <sha>`. The permanent fix is to
rename the repo directory so it has no space.

CocoaPods also needs a UTF-8 locale or it reads the path as ASCII-8BIT and crashes in
`Pod::Config#installation_root`:

```bash
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
```

### 1. Simulator — works now, no account

```bash
npx expo run:ios --device "iPhone 17 Pro"
```

Builds, installs and launches. This is the loop for development. It cannot run on a physical
phone, and Expo Go is not an option — the App Store build of Expo Go is SDK 54 and this project
is SDK 57.

### 2. USB device build — works now, free provisioning, expires in 7 days

Puts the app on a real iPhone **without** the paid account. Xcode signs it with a personal team
certificate.

1. Plug the phone in, trust the Mac.
2. Open `ios/CannonAcademy.xcworkspace` in Xcode.
3. Target → Signing & Capabilities → Team → your personal Apple ID.
4. Select the device, Run.
5. On the phone: Settings → General → VPN & Device Management → trust the developer.

The app stops launching after **7 days** and has to be rebuilt. Fine for a demo you drive
yourself; not fine for handing the phone to someone next week.

### 3. TestFlight — needs the paid account active

Enrollment was paid on **2026-07-28**. Activation takes 24–48h, and nothing below works until
App Store Connect shows the team.

When it clears:

1. **Fill in the three placeholders in `eas.json`** under `submit.production.ios`. They are
   deliberately obvious strings, so a premature `eas submit` fails loudly rather than uploading
   to the wrong place:
   - `appleId` — the Apple ID email on the developer account
   - `appleTeamId` — from developer.apple.com → Membership
   - `ascAppId` — created in step 3
2. `eas login`, then `eas build:configure` if it asks.
3. Create the app record in App Store Connect with bundle id `com.worldofhacks.cannonacademy`.
   The `ascAppId` is in that record's URL.
4. Build and submit:

```bash
eas build --platform ios --profile production
```

```bash
eas submit --platform ios --profile production
```

5. TestFlight processing takes 5–30 minutes. Internal testers on the team need no review;
   external testers need a Beta App Review pass, which is not same-day.

**Budget the review.** An external-tester TestFlight link is not a safe same-week plan. Internal
testers are, and so is path 2.

## Android

Unblocked by all of the above and committed as the fallback:

```bash
eas build --platform android --profile preview
```

Produces an APK that installs directly — no store, no review, no expiry.
