# Cannon Academy — Technical Interview and Architecture Defense Guide

> Repository review refreshed July 29, 2026. This guide distinguishes the
> running application from engine capabilities that exist but are not yet wired
> into the application.

## How to use this guide

Do not memorize every sentence. Memorize these four things first:

1. The 30-second overview.
2. The five-layer architecture.
3. Three hard problems and how you solved them.
4. The honest limitations and what you would improve next.

Strong interview answers follow this pattern:

> “I chose X because the requirement was Y. The tradeoff was Z. I reduced that
> risk by doing A. If the product grew in direction B, I would reconsider the
> choice.”

That sounds more credible than claiming every choice was universally “best.”
The tools here were the best fit for this product, team, and delivery stage.

---

## Short descriptive overview of the platform

Cannon Academy is a mobile-first arithmetic learning game. A child creates a
captain, chooses a grade band, sails between islands, equips cannons, answers
curriculum-aligned questions, and uses correct answers to damage a rival ship.
The same math engine also powers a lower-pressure practice range.

The product is built with React Native and Expo so one TypeScript application
can run on iOS, Android, and the web. Its most important architectural
separation is between:

- a presentation layer that renders the nautical game;
- a local application-state layer that manages the captain and the current duel;
- a service layer that converts engine results into screen-friendly data;
- a pure TypeScript domain engine for questions, combat, progression, and
  rewards;
- a local-first persistence boundary that uses AsyncStorage today and is
  designed to add Firebase Authentication and Firestore synchronization.

The app currently supports onboarding, captain setup, a world chart, real math
questions, duels, practice drills, mastery, unlocks, coin rewards, and a gun
deck. It has been smoke-tested on the web and an iOS simulator. It is not yet a
complete production release: cloud accounts and Firestore are not connected,
the guided tutorial route is a stub, Android device verification is still
needed, and a few richer progression and audiovisual features remain planned.

### The 30-second interview answer

> “Cannon Academy is a mobile-first arithmetic game built with React Native,
> Expo, and TypeScript. Expo Router provides the screen structure. A small
> Zustand store owns durable captain progress, while a screen-local reducer
> controls the short-lived duel animation state. Beneath that is a pure
> TypeScript engine that generates seeded questions, evaluates safe math
> expressions, calculates damage and rewards, and updates mastery. Content is
> validated with Zod. Progress currently persists through AsyncStorage, which
> gives the first release instant offline startup. That is phase one of a
> cloud-backed model: Firebase Authentication will establish account identity,
> Firestore will synchronize durable progress, and AsyncStorage will remain the
> device cache and offline queue. The architectural goal was to keep math and
> progression deterministic and portable across the client and a future
> server-validation layer.”

### The one-sentence value proposition

> “It turns arithmetic practice into a short, visually rewarding ship battle
> while keeping the educational logic deterministic and independently
> testable.”

---

## The honest implementation boundary

Interviewers trust candidates who can distinguish shipped behavior, latent
capability, and future plans.

### Implemented and used by the app

- Onboarding and grade-band selection.
- Captain name and flag selection.
- A chart showing all islands, including fogged locked islands.
- Grade-appropriate placement, starters, and island availability.
- A three-cannon gun-deck loadout with ownership and capacity validation.
- Seeded question generation from 72 validated templates across nine skills.
- A visual ship duel with correct, incorrect, and timeout outcomes.
- A ten-question practice range without hull damage or duel rewards.
- Coins, mastery, unlock evaluation, and captain progression.
- Local hydration and persistence through AsyncStorage.
- Responsive layout, safe-area handling, custom fonts, SVG graphics, and
  Reanimated motion.
- Static web export with ten routes.
- Web browser and iOS simulator smoke verification.

### Implemented in the engine but not wired into the running app

- A canonical duel reducer with a richer action log.
- An `Opponent` abstraction.
- Adaptive mercy-bot behavior.
- Scripted opponents for deterministic scenarios.
- Full replay capability at the engine level.
- An injected Firebase authentication service with tests.

These are real, tested capabilities, but do not claim the current UI uses them.

### Present but incomplete

- `/guided-duel` exists, but it currently marks the tutorial flag and redirects
  to the chart. It is not a playable tutorial yet.
- EAS build profiles exist, but the app project and store-submission values
  still need final production configuration.
- Timeouts are free (D-8 / T-036) in both the duel store and `answerDrill` on
  `app/shell`.

### Committed production-readiness roadmap

- Connect Firebase Authentication at startup.
- Support guest-first play and migration into a durable account.
- Store versioned captain profiles and progress in Firestore.
- Retain AsyncStorage as a fast offline cache and pending-operation queue.
- Add deterministic conflict resolution and idempotent progress-event IDs.
- Move authoritative coin/reward grants to a trusted Cloud Function or backend
  transaction.
- Enforce per-user document ownership with Firestore Security Rules.
- Add Firebase Emulator Suite integration tests, observability, backup, account
  deletion, and data-export workflows.

### Planned or intentionally cut from this delivery

- Parent or teacher dashboards.
- Multiplayer.
- Harbor, ranks, and chest-ceremony screens.
- Audio, haptics, and Lottie effects.
- A full Blender-to-WebP sprite pipeline.
- Broader audiovisual polish beyond the current EAS Hosting web deploy at
  https://cannon-academy.expo.app.

### Safe way to describe completeness

> “The core learning loop is implemented and runnable: onboarding, chart,
> questions, duels, practice, rewards, mastery, unlocks, and local persistence.
> I would call it a tested vertical slice rather than a finished live-service
> product.”

---

## The product story you can defend

### The problem

Arithmetic practice often loses children because it feels like a worksheet.
The product needed to make repetition feel like a game without weakening the
correctness of the educational content.

That created several constraints:

- Questions had to be correct and grade appropriate.
- Feedback had to feel immediate.
- The game had to work on common phones and the web.
- A child had to be able to play without an account or reliable connection.
- Progress and rewards could not be duplicated accidentally.
- Visual animation could not become the source of truth for educational state.
- The system needed to remain testable even before every screen existed.

### The central architectural decision

The core rule was:

> UI renders state; the engine decides rules.

The math, damage, mastery, placement, and rewards live in pure TypeScript. React
Native is responsible for input, navigation, layout, and animation. This gives
the platform a stable educational core that can be tested in Node without
launching an emulator.

The current duel screen has one qualification: it uses a separate presentation
reducer for animation phases and calls selected engine functions, rather than
driving the canonical engine duel reducer directly. That worked for the
time-boxed vertical slice, but consolidating the reducers is a high-priority
architectural improvement.

### Why the experience is game-like but not a game-engine project

Cannon Academy is primarily:

- forms and touch input;
- screen navigation;
- 2D animated panels and ships;
- local persisted progress;
- deterministic domain rules.

It does not require:

- a 3D scene graph;
- rigid-body physics;
- shaders;
- a real-time multiplayer loop;
- arbitrary camera movement.

React Native therefore provided the right product primitives with much less
operational weight than Unity, Unreal, or a custom game runtime.

---

## Architecture at a glance

```text
┌──────────────────────────────────────────────────────────────┐
│ Expo Router routes                                          │
│ onboarding · name/flag · chart · duel · range · gun deck    │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│ React Native presentation                                   │
│ reusable panels · ships · questions · buttons · SVG art     │
│ Reanimated owns visual interpolation, not game truth        │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│ Application state and orchestration                         │
│ Zustand captain store · React duel reducer · route flow      │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│ Service adapters                                             │
│ questions · persistence · rewards · drills · startup flow    │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│ Pure TypeScript domain                                      │
│ content · expressions · RNG · combat · mastery · economy     │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│ Persistence and identity boundary                            │
│ AsyncStorage cache today · Firebase Auth + Firestore target  │
└──────────────────────────────────────────────────────────────┘
```

### Dependency direction

The dependency direction should move downward:

```text
route → component → store/service → engine
```

The engine must not import React, React Native, Expo, Firebase, or device APIs.
Lint rules and tests enforce that boundary.

### Why dependency direction matters

If domain logic imported screen or storage code:

- engine tests would require a simulator;
- storage outages could affect pure math;
- animation details could alter scoring;
- web and native behavior could diverge;
- the core could not be reused in a teacher tool or backend.

The pure lower layer gives the project options.

### Why this boundary supports the production backend

Decoupling the engine from React Native is not only a testing convenience. It
creates a path to trusted server validation. Because combat, progression, and
reward rules are plain TypeScript rather than component code, the same domain
package can be executed in a Node-based Cloud Function or backend service.

The client can stay responsive and offline-capable, while the server can
independently validate important events before accepting authoritative rewards.
If those rules depended on React hooks, navigation, Reanimated, or native
storage, reusing them on the server would require a rewrite and would invite
client/server rule drift.

The intended trust boundary is:

```text
Client may propose:
  “duel abc completed with these versioned inputs and actions”

Server must decide:
  “is this event valid, new, owned by this user, and eligible for a reward?”
```

This is another reason the engine cannot depend on React Native even though the
presentation layer necessarily does.

---

## Component and module structure

The app is organized by responsibility rather than putting all logic inside
screens.

```text
app/
  _layout.tsx          Global fonts, hydration, and navigation shell
  index.tsx            Startup route decision
  onboarding.tsx       Grade-band selection
  name-flag.tsx        Captain identity setup
  guided-duel.tsx      Current tutorial placeholder
  chart.tsx            World-map hub
  duel.tsx             Battle orchestration and animation timing
  range.tsx            Ten-question practice session
  gun-deck.tsx         Cannon loadout management

src/
  components/          Reusable visual and interaction pieces
  content/             Skills, islands, cannons, and question templates
  engine/              Pure domain logic
  services/            Adapters and side-effect boundaries
  stores/              Captain store and duel presentation reducer
  theme/               Tokens, typography, scaling, colors, and spacing

assets/
  fonts/               Baloo 2 and Nunito files
  sprites/             CC0 Kenney ship and cannon assets

tests/
  app/                 App service, reducer, store, route, and wiring tests
  content/             Catalog and template validation tests
  engine/              Domain behavior, invariants, and determinism tests
```

### Route layer

Routes answer “which experience is visible?”

- `_layout.tsx` loads six font faces and hydrates captain data before showing
  the app.
- `index.tsx` asks the flow service for the correct next route.
- `onboarding.tsx` captures grade band.
- `name-flag.tsx` captures identity.
- `chart.tsx` is the central hub.
- `duel.tsx` runs the battle presentation.
- `range.tsx` runs a mastery-oriented drill.
- `gun-deck.tsx` edits the equipped cannon tray.

Routes should coordinate components and services. They should not reimplement
question generation or progression formulas.

### Component layer

Components answer “how is the experience rendered and interacted with?”

Examples include:

- question and answer panels;
- progress and health displays;
- ships, cannons, captain art, fog, and cannonballs;
- grade, name, and flag controls;
- chart nodes and navigation buttons;
- reusable game buttons and panels.

The components are intentionally focused on rendering. Reanimated values make
ships recoil, cannonballs arc, fog move, and chart markers pulse, but completion
of an animation does not calculate mastery or damage.

#### Actual component tree

```text
components/
  Poly.tsx                    Reusable polygon primitive
  Splash.tsx                  Branded loading state

  chart/
    Sea.tsx                   Ocean background and route line
    Fog.tsx                   Animated locked-region fog
    Station.tsx               Island art and interactive station marker
    ChartShip.tsx             Player ship on the map
    Dock.tsx                  Fight, practice, and gun-deck controls
    HeaderPill.tsx            Captain identity and coin summary
    Blob.tsx                  Organic scalable vector shape
    board.ts                  Reference-board geometry and station positions
    layout.ts                 Board-to-device coordinate conversion
    palette.ts                Chart-specific visual tokens

  duel/
    SeaStage.tsx              Battle scene and projectile choreography
    Ship.tsx                  Player/rival ship rendering
    Captain.tsx               Captain rendering and phase-driven poses
    CannonTray.tsx            Equipped-cannon selection
    QuestionPanel.tsx         Prompt, answers, timer, and selected state
    Hud.tsx                   Turn and hull displays
    Panels.tsx                Watch, resolve, victory, and defeat overlays
    TemperBadge.tsx           Cannon temperament indicator
```

#### How the duel screen composes them

`app/duel.tsx` is the orchestrator, not one enormous drawing component:

```text
duel route
  ├─ TurnBar + HullCard
  ├─ SeaStage
  │   ├─ Ship
  │   ├─ Captain
  │   └─ projectile / impact animation
  ├─ CannonTray
  └─ one phase-appropriate panel
      ├─ QuestionPanel
      ├─ WatchPanel / FlyingPanel / ResolvePanel
      └─ VictoryPanel / DefeatPanel
```

The route chooses which phase is active. Child components receive data and
callbacks; they do not mutate the captain store directly.

#### How the chart screen composes them

```text
chart route
  ├─ HeaderPill
  ├─ Sea + Route
  ├─ Fog
  ├─ StationMarker × 5
  ├─ ChartShip
  └─ ChartDock
```

`board.ts` captures the design-board measurements. `layout.ts` converts those
measurements to the current device, while the service layer supplies each
station’s locked/unlocked domain state.

### Theme layer

The theme centralizes:

- color palette;
- fonts and weights;
- spacing;
- borders and shadows;
- responsive type scaling;
- responsive art scaling.

The reference design was 375 × 667. Type and art have separate clamped scales
because text must remain readable while decorative art can compress more
aggressively. Touch targets are kept at approximately 64 points for a
child-friendly interface.

### Store layer

There are two different state lifetimes.

#### Durable captain state

A vanilla Zustand store owns:

- captain identity and grade band;
- coins;
- owned and equipped cannons;
- island unlocks;
- mastery;
- onboarding and tutorial flags;
- durable counters needed by progression.

`useCaptain` is a React hook wrapper around that vanilla store. The vanilla
construction also makes the store easy to instantiate in tests without mounting
React.

#### Ephemeral duel state

The duel route uses React `useReducer` with a pure presentation reducer. It owns:

- the current question;
- player and rival hull values;
- the selected answer;
- visual phases such as question, cannon flight, impact, and rival attack;
- victory and defeat.

This state is intentionally not persisted. If the app is killed during a duel,
the player returns with the last committed captain progress rather than a
half-restored animation.

### Service layer

Services translate between app concepts, platform APIs, and the pure engine.

- The question service calls the engine generator and maps its rich question
  model to the compact model expected by screens.
- The flow service chooses the startup route from captain state.
- The persistence service serializes a versioned captain envelope.
- The reward service applies duel outcomes once.
- The drill service commits mastery once.
- The auth service abstracts Firebase operations but is not connected to
  startup yet.

This layer is where side effects and adaptation belong.

#### Actual service responsibilities

| Service            | Responsibility                                                    |
| ------------------ | ----------------------------------------------------------------- |
| `flow.ts`          | Resolve onboarding, setup, guided, gun-deck, or chart destination |
| `onboarding.ts`    | Commit grade and engine placement as one operation                |
| `questions.ts`     | Adapt engine `Question` objects to duel/range UI objects          |
| `templatePools.ts` | Statically import all template JSON for Metro                     |
| `duelRewards.ts`   | Apply mastery, unlocks, and rewards once                          |
| `range.ts`         | Open and commit ten-question drills                               |
| `loadout.ts`       | Validate ownership, uniqueness, order, and tray capacity          |
| `chart.ts`         | Derive visible chart nodes and requirement copy                   |
| `persistence.ts`   | Read/write the versioned captain envelope                         |
| `auth.ts`          | Injected Firebase auth seam; currently not wired to startup       |

### Engine layer

The pure engine owns:

- seeded random-number generation;
- safe expression parsing and evaluation;
- template and catalog validation;
- question generation;
- distractor generation;
- canonical duel rules;
- damage;
- opponent strategies;
- mastery updates;
- economy and rewards;
- placement;
- drills and unlocks.

No component should have to know how a fraction is normalized, how a rank is
calculated, or how a seeded sample is selected.

---

## End-to-end user flow

### Cold start

1. `_layout.tsx` loads fonts.
2. It hydrates the captain from AsyncStorage.
3. Only after hydration does it subscribe to future store writes.
4. `index.tsx` asks the flow service where the user belongs.
5. The route is replaced, preventing a misleading screen from remaining in the
   back stack.

The subscription order matters. Subscribing before hydration could write the
blank default captain over valid saved data.

### First-time player

```text
index
  → onboarding
  → name and flag
  → guided-duel placeholder
  → chart
```

Grade selection also drives starter placement, initial cannons, and suitable
islands. A blank submitted name safely falls back to “Captain.”

### Returning player

```text
index
  → hydrate captain
  → chart
```

If the player has no valid equipped loadout, flow redirects to the gun deck
instead of entering a duel in an invalid state.

### Duel

1. The route gets the island and equipped cannons.
2. A seed is captured at the platform edge.
3. The question adapter requests a seeded engine question.
4. The player answers or times out.
5. The presentation reducer selects the next visual phase.
6. Engine damage and reward functions determine numeric outcomes.
7. Reanimated renders recoil, flight, impact, and transition effects.
8. At victory or defeat, a reward service commits durable changes once.
9. The app returns to the chart.

### Practice range

1. The range uses the same question panel and engine question generator.
2. It runs a ten-question drill.
3. There is no hull damage or coin payout.
4. Valid attempts update mastery.
5. Skill and island unlocks are reevaluated when the drill is committed.

### Gun deck

1. The player sees owned and locked cannons.
2. They can equip up to three owned, unique cannons.
3. An empty tray, duplicate IDs, locked cannons, or more than three are rejected.
4. The selected order is preserved in durable captain state.

---

## Every major tool, framework, and library

## TypeScript

### What it is

TypeScript is JavaScript with static types. It checks the shapes of values
before the code runs and then compiles to JavaScript.

### Why it fits this project

The project has many structured domain values:

- skills;
- question templates;
- grade bands;
- cannon definitions;
- duel actions;
- mastery records;
- persisted captain data.

TypeScript catches mismatches between those layers. During development, it
caught a real omission when a newly added `saker` cannon was missing from a
total `Record` even though the tests still passed.

### Tradeoff

Types add authoring work and cannot validate data arriving at runtime. That is
why TypeScript is paired with Zod and explicit persistence guards.

## React 19.2

### What it is

React is a declarative UI library. You describe the screen for the current
state, and React updates the rendered output when state changes.

### Why it fits

The product naturally decomposes into panels, questions, answer buttons, ships,
chart nodes, and overlays. React also supports local reducers and reusable hooks,
which fit the separation between screen state and durable captain state.

### Tradeoff

React does not define navigation, native widgets, storage, or high-performance
animation by itself. Those responsibilities are supplied by React Native, Expo,
Expo Router, AsyncStorage, and Reanimated.

## React Native 0.86

### What it is

React Native lets React components render native mobile views rather than HTML.
The same component model can target iOS and Android, with a web adapter for this
project.

### Why it fits

- One TypeScript team can build all three targets.
- The app is mostly 2D layout, touch interaction, text, and animation.
- Native accessibility and touch primitives are available.
- Shared domain code needs no bridge or language boundary.

### Tradeoff

Platform-specific defects still exist. “Cross-platform” means high code reuse,
not zero platform testing. The iOS shell-script path problem and web pointer
event warnings are examples.

## Expo SDK 57

### What it is

Expo is a toolchain and runtime around React Native. It supplies compatible
native modules, development servers, builds, fonts, splash handling, and web
export.

### Why it fits

- It reduces native project setup.
- It keeps package versions aligned.
- It makes simulator and browser iteration quick.
- It supports over-the-air development workflows and EAS builds.
- It can statically export the web routes.

### Tradeoff

Expo does not remove native build knowledge. Custom native requirements or
unusual build failures can still require Xcode, Gradle, and native debugging.

## Expo Router

### What it is

Expo Router maps files in the `app/` directory to routes. It is based on React
Navigation and supports deep links and web URLs.

### Why it fits

The file structure mirrors the product journey. `/chart`, `/duel`, `/range`, and
`/gun-deck` are easy to locate and can be tested as explicit destinations.
Typed routes reduce navigation mistakes.

### Tradeoff

File-based routing does not decide product flow. The dedicated flow service
still decides whether a hydrated player should see onboarding, setup, the gun
deck, or the chart.

## Metro

### What it is

Metro is React Native’s JavaScript bundler. It resolves modules, transforms
TypeScript and JSX, and packages assets for each platform.

### Why it matters here

Question template JSON files are statically imported so Metro can discover and
bundle all nine skill pools reliably. Dynamic file-system discovery that works
in Node would not be safe to assume inside a mobile bundle.

## Zustand 5

### What it is

Zustand is a small state-management library built around stores, selectors, and
subscriptions.

### Why it fits

Captain state is shared across onboarding, chart, duel rewards, drills, and the
gun deck. A small vanilla store provides:

- one durable source of truth;
- simple actions;
- use outside React;
- easy test construction;
- explicit persistence subscriptions.

### Why not use Zustand for everything

The current duel is local to one route and changes rapidly. React `useReducer`
keeps that ephemeral state close to the screen and avoids persisting animation
phases globally.

### Tradeoff

The project manually manages persistence rather than using Zustand persistence
middleware. That gives control over versioned envelopes and hydration order but
requires more custom code.

## React `useReducer`

### What it is

`useReducer` stores state by applying explicit actions to a pure reducer:

```text
next state = reducer(current state, action)
```

### Why it fits the duel presentation

A duel is a state machine, not a loose collection of booleans. Actions such as
answer, impact, rival attack, victory, and defeat can be phase-gated and tested.

### Current architectural debt

The app’s presentation reducer duplicates part of the canonical engine duel
reducer. It reuses damage, economy, tuning, and question generation, but it does
not use the engine’s opponent model or action log. The next refactor should make
the canonical engine state authoritative and derive animation phases through an
adapter.

## React Native Reanimated 4.5

### What it is

Reanimated runs animation work on the native/UI side through “worklets,” helping
motion stay smooth when the JavaScript thread is busy.

### Why it fits

The platform animates:

- ship entrances and recoil;
- cannonball arcs;
- impact feedback;
- captain and fog motion;
- chart pulses;
- fuse and panel transitions.

These are presentation effects, so Reanimated can interpolate them without
becoming the domain state machine.

### Important lesson

Worklet code cannot freely call ordinary JavaScript helpers. An early iOS run
crashed because a worklet invoked a non-worklet helper. The fix was to keep
worklet dependencies worklet-safe and verify on a real runtime, not just in
Node tests.

## `react-native-worklets` Babel plugin

### What it is

The Babel plugin transforms annotated functions so Reanimated can execute them
as worklets on the correct runtime.

### Why it is required

Without the transform, animation code can fail at runtime even if TypeScript and
unit tests pass.

## React Native SVG

### What it is

`react-native-svg` renders vector paths, polygons, circles, and other SVG
primitives across native and web.

### Why it fits

The design uses map routes, emblematic shapes, and scalable decorative
geometry. Vector rendering stays sharp at multiple phone sizes and avoids
shipping a bitmap for every scale.

## AsyncStorage

### What it is

AsyncStorage is an asynchronous key-value store for React Native.

### The architectural decision

AsyncStorage is not intended to replace authentication or the production
database. It is the first implementation of an offline-first persistence
interface and will remain useful after cloud synchronization exists.

The production model is:

```text
Zustand captain state
  ↕ immediate local reads and optimistic updates
AsyncStorage cache + pending-operation outbox
  ↕ authenticated synchronization
Firestore versioned profile + progress events
  ↕ trusted validation for valuable outcomes
Cloud Function / backend domain engine
```

### Why local persistence still belongs in a production app

- Cold start does not wait on network latency.
- A classroom, car ride, or unreliable connection does not interrupt learning.
- The player can begin in guest mode before a parent-managed account is linked.
- Optimistic updates make answers and rewards feel immediate.
- Pending operations can survive a process restart and synchronize later.
- The same cache supports temporary Firebase outages.

### How it is used

The persistence service injects a generic `KeyValueStore`, serializes a
versioned envelope, validates the decoded shape, and recovers to defaults from
missing, malformed, or unsupported data.

That injected interface is important: the captain store does not know whether
data came from AsyncStorage, Firestore, a test double, or a future migration
service.

### Why it is acceptable before the cloud phase

The vertical slice needed to validate the learning loop and stabilize the
captain schema before introducing distributed-system concerns. Adding cloud
sync first would not eliminate local persistence; it would add authentication,
offline queues, conflict resolution, security rules, account migration, and
failure recovery before the underlying progress model was settled.

This was sequencing, not a decision to remain device-only.

### Tradeoffs and production boundary

It is device-local and is not a relational database. It does not provide
cross-device sync, transactions across devices, or conflict resolution.
AsyncStorage is also not a trustworthy authority for coins or competitive
progress because a determined device owner can modify local data.

Therefore:

- AsyncStorage can own cached and pending state.
- Firestore should own synchronized durable state.
- A trusted backend should own high-value reward validation.
- Authentication should own user identity and document access.

## Zod 3

### What it is

Zod is a runtime schema-validation library. Unlike TypeScript, it checks actual
data while the program runs.

### Why it fits

Static content is data, and data can be malformed. Zod validates question
templates, fields, and invariants before generation. This prevents bad content
from failing deep inside a duel.

### Current limitation

The captain persistence guard is still relatively shallow and does not use a
complete Zod schema. A production migration should validate nested arrays,
mastery records, IDs, and grade-band enums more strictly.

## Vitest

### What it is

Vitest is a fast JavaScript and TypeScript test runner with Jest-like assertions.

### Why it fits

It runs the pure engine directly in Node and supports:

- example tests;
- invariant tests;
- seed reproducibility tests;
- content validation;
- reducer transition tests;
- app service and store tests.

### Current limitation

The app tests are mostly headless. They validate services, reducers, source
wiring, and geometry, but do not mount every React Native component. Two
launch-blocking runtime defects escaped more than 1,800 tests, which is why
device smoke testing is a required gate.

## ESLint

### What it is

ESLint statically checks code for unsafe or inconsistent patterns.

### Why it matters here

The engine rules prohibit:

- React, React Native, Expo, or Firebase imports;
- `Math.random`;
- `Date`;
- `eval`;
- function constructors.

Those are architectural rules, not merely style preferences.

## Prettier

### What it is

Prettier formats source consistently.

### Why it fits

It removes formatting debate, keeps diffs readable, and makes parallel branch
integration less noisy.

## Expo Google Fonts: Baloo 2 and Nunito

### What they are

They are packaged font families loaded through Expo’s font system.

### Why they fit

Baloo 2 gives headings a playful game identity; Nunito keeps instructions and
answers highly readable. Loading all required weights before routing avoids
font-swap layout jumps.

## React Native Safe Area Context

### What it is

It exposes device insets for notches, status bars, and home indicators.

### Why it fits

Critical buttons and progress indicators should not sit under physical screen
cutouts. It is especially important because the design is full-screen and
portrait-oriented.

## PNG sprites and source licensing

### What they are

The current app includes nine small CC0 Kenney PNG sprites alongside
React-Native-drawn and SVG art.

### Why this approach fit the deadline

It gave the vertical slice reliable, redistributable visual assets without
creating a heavy custom-asset pipeline.

### What did not ship

The earlier plan for Blender renders, WebP variants, and Lottie effects was
deferred. Do not describe it as the implemented pipeline.

## EAS configuration

### What it is

EAS Build and Submit are Expo’s cloud build and store-delivery services.

### Current use

The repository defines development, preview APK, and production AAB profiles.
Final project linkage and real store submission credentials remain release
work, so describe EAS as configured in principle, not as a completed store
release.

## Firebase

### What it is

Firebase supplies managed authentication, the Firestore document database,
Cloud Functions, local emulators, analytics/monitoring options, and file
storage.

### Current use

The dependency and an injected, tested authentication service exist, but the
running startup flow does not initialize Firebase and there is no Firestore
sync. The app is local-first today.

### Intended production responsibilities

#### Firebase Authentication

Firebase Authentication should establish a stable user ID and restore login
state across launches. For a child-focused product, the final identity flow
should be designed around privacy and guardian consent rather than collecting
unnecessary child information.

A defensible rollout is:

1. Let a first-time player begin with a local or anonymous guest identity.
2. Offer a parent-managed account-linking flow.
3. Migrate the guest captain to the authenticated UID without losing progress.
4. Restore that account on a new device.

#### Cloud Firestore

Firestore should hold structured, versioned application data such as:

- captain profile and settings;
- mastery by skill;
- owned/equipped cannons;
- island unlocks;
- accepted progression events;
- synchronization metadata.

Firestore, not Firebase Storage, is the appropriate Firebase product for those
structured documents. Firebase Storage would be appropriate only for larger
binary objects such as uploaded avatars or user-generated media.

#### Cloud Functions or another trusted backend

Firestore Security Rules can enforce identity and document ownership, but
valuable rewards should not be trusted merely because a client wrote a field.
A callable function or backend endpoint should:

- authenticate the user;
- validate an idempotent completion event;
- reject duplicates;
- execute compatible domain rules;
- atomically update authoritative coins/progress;
- return the accepted server revision.

#### AsyncStorage after Firebase

AsyncStorage remains the local cache and offline outbox. On launch, the app can
show the cached captain immediately, restore authentication, fetch the latest
server revision, and reconcile pending operations.

### Why retain the current abstraction

The service boundary lets cloud identity be introduced later without moving
Firebase imports into the pure engine. The pure TypeScript rules can also be
shared with a Node-based Cloud Function, reducing client/server rule drift.

### What must be added before calling it production-ready

- Auth initialization and persisted login restoration.
- Guest-to-account migration.
- Firestore profile and event schemas.
- Security Rules tested in the Firebase Emulator Suite.
- Idempotent server-side reward transactions.
- Offline outbox and deterministic conflict resolution.
- Schema migration and server revision strategy.
- Account deletion, export, recovery, and privacy workflows.
- Monitoring for sync failures and rejected events.

## Installed but not central to the current implementation

The dependency list also contains `expo-image`, `expo-linear-gradient`, and
`react-native-gesture-handler`. They are common Expo-compatible tools, but the
current core screens do not depend on them. Do not pad an interview answer by
claiming unused packages are architectural pillars.

---

## Why React Native and Expo instead of Flutter?

### Strong answer

> “Flutter was a valid option, but React Native with Expo fit this project
> better. The domain engine, content, app, and tests can all share TypeScript.
> The product is mostly 2D UI and state transitions rather than custom rendering,
> so React Native’s primitives were sufficient. Expo reduced native setup and
> gave us routing, fonts, simulator workflows, builds, and web export. Flutter
> could offer very consistent custom rendering, but it would add Dart and a
> separate widget ecosystem without solving a requirement this product uniquely
> had.”

### Detailed comparison

| Criterion            | React Native + Expo                                | Flutter                                               |
| -------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| Primary language     | TypeScript across app, engine, content, and tests  | Dart for the app; another boundary for shared JS work |
| Product shape        | Strong for screens, forms, touch UI, and 2D motion | Strong for highly custom rendered interfaces          |
| Existing logic reuse | Direct reuse of pure TypeScript engine             | Engine would need a Dart port or an integration layer |
| Web target           | Shared Expo Router web export                      | Flutter web is possible but uses a different runtime  |
| Native setup         | Expo manages much of the routine configuration     | Flutter tooling is strong but still a separate stack  |
| Custom rendering     | Adequate for this app through SVG and Reanimated   | Excellent and highly consistent                       |
| Team learning cost   | One React/TypeScript mental model                  | Requires learning Dart and Flutter’s widget model     |
| Escape hatches       | Native modules and prebuild when necessary         | Platform channels and native integration              |

### Do not attack Flutter

Say:

> “Flutter is a strong framework; it was not the best fit for our constraints.”

Do not say:

- Flutter is slow.
- Flutter cannot build real apps.
- React Native is always more native.
- Expo means no native code exists.

### When Flutter might have been the better choice

Flutter would deserve reconsideration if:

- the interface depended on extensive custom canvas rendering;
- visual consistency across platforms outweighed native conventions;
- the team already had strong Dart expertise;
- most of the product was a custom rendering surface rather than navigable
  screens;
- sharing the TypeScript engine was not important.

### Why not bare React Native?

Bare React Native would give direct native configuration from day one, but the
vertical slice did not need enough custom native code to justify that overhead.
Expo still permits prebuild or custom native modules later.

### Why not Unity?

Unity is excellent for physics, real-time scenes, 3D, and complex game loops.
This product is an educational app with a game presentation. Unity would add a
second programming ecosystem, larger runtime concerns, and less natural
screen/form development.

---

## Deep dive: the pure engine

## Content model

The content catalog contains:

- nine skills;
- eight templates per skill;
- 72 templates total;
- 11 cannons;
- five islands.

Templates describe how to construct questions rather than storing only fixed
prompts. That makes the system reusable while still allowing curriculum
constraints.

### Why content is data

Separating content from generator code means:

- a curriculum author can add controlled variety;
- the engine can validate all templates uniformly;
- content tests can detect bad IDs and references;
- the app does not need a new component for each arithmetic question.

### Why file order matters

Seeded selection depends on stable pool order. The loader preserves explicit
file order so the same seed does not silently select a different template after
an unrelated loader refactor.

## Safe expression evaluation

Templates need expressions such as arithmetic combinations of sampled
parameters. Using JavaScript `eval` would allow arbitrary code execution.

The engine instead uses a constrained parser/evaluator that understands only the
required mathematical grammar.

### Benefits

- Content cannot access globals, files, network, or device APIs.
- Invalid syntax produces a controlled error.
- Behavior is deterministic.
- The allowed language is reviewable.
- The security rule is enforced by lint and behavioral tests.

### Interview framing

> “Templates are treated as untrusted data. They can express math, not
> JavaScript.”

## Question generation

At a high level:

```text
skill + context + seed
  → select eligible template
  → sample parameters
  → enforce constraints
  → render prompt
  → evaluate correct answer
  → build distractors
  → shuffle choices
  → return next seed and question
```

The generator supports recent-question IDs so the app can reduce immediate
repetition.

### Rejection sampling

Some random values create invalid educational questions—for example a negative
result when only positive subtraction is intended.

The generator samples, checks constraints, and retries within a bounded budget.
The bound is essential; malformed content must fail clearly rather than loop
forever.

## Distractor generation

Wrong answers should be plausible, unique, and different from the correct
answer.

The engine:

- creates likely misconception-based alternatives;
- removes duplicates;
- removes the correct answer;
- normalizes answer types;
- uses bounded fallback logic if the initial set is too small;
- shuffles choices with the seeded RNG.

This matters educationally. Random nonsense answers make the question easier
without diagnosing the learner’s misconception.

## Seeded randomness

The engine does not call `Math.random`. It threads an explicit seed through
operations.

```text
result = generateQuestion(seed, context)
result.question
result.nextSeed
```

### Benefits

- a failing test can be reproduced;
- authored sequences can be tested;
- simulation can explore many runs;
- the engine can support replay;
- random behavior remains explicit in function signatures.

### Honest current-app qualification

The UI captures a fresh seed using the platform clock at the boundary and then
uses seeded operations. The canonical engine has action-log support, but the
current app presentation reducer does not retain that log. Therefore:

> The engine is replay-capable; the shipped UI does not yet save replayable
> duel sessions.

Do not claim every app duel is currently replayable.

## Canonical duel state machine

The engine reducer models legal phases and transitions:

```text
setup
  → question
  → player resolution
  → opponent resolution
  → next question
  → victory or defeat
```

The reducer is synchronous and pure. Delays and animations belong to the
adapter/UI layer.

### Why not `setTimeout` in the reducer

A timeout is a side effect. Putting it inside the reducer would make the same
input produce behavior that depends on wall-clock scheduling and would make
tests flaky.

### Current integration debt

The running duel has its own richer presentation phases:

```text
select → question → perfect/fly/impact/miss/timeout
       → watch → rivalFly → rivalImpact
       → victory/defeat
```

It calls engine damage and economy functions but does not dispatch the canonical
engine reducer. This emerged from parallel engine and app-shell work. It let the
vertical slice move quickly, but duplicated transition rules and prevented the
app from using the engine action log and opponent abstraction.

### The refactor plan

1. Make canonical engine duel state the only rule authority.
2. Dispatch engine actions from the route.
3. Map each engine transition to a presentation “beat.”
4. Let Reanimated play that beat.
5. Advance only with an expected transition token.
6. Persist an optional replay record containing seed, content version, and
   actions.

## Damage model

Damage is calculated in a pure engine function from explicit values. It is
clamped to valid boundaries so:

- hull does not become negative;
- dead ships cannot take meaningful extra turns;
- output is stable for tests;
- UI animation cannot modify the result.

The app presentation reducer reuses this calculation.

## Opponent model

The engine defines an interface for opponent strategy. Implementations include:

- a seeded adaptive/mercy opponent;
- a scripted opponent for deterministic tests.

### Current app behavior

The running app does not use that interface. The rival currently applies a
seeded flat 7–12 damage per turn. Present that as a vertical-slice simplification,
not as the adaptive bot.

## Mastery

Mastery is a smoothed score rather than a single win/loss flag. Correctness,
history, and valid attempts can update the learner’s skill record gradually.

The important separation is:

- duel outcome answers “did the player win this battle?”
- mastery answers “how is the learner progressing in this skill?”

A dramatic ship animation should not distort the educational measurement.

## Economy

Coin payout is a pure function based on explicit outcome data. The reward
service applies the result to the captain store.

The service uses a per-store set of duel IDs to make completion idempotent. This
protects against an effect firing twice—for example under React Strict Mode or a
re-render—without awarding the same duel twice.

### Current limitation

The in-memory idempotency key protects a running process, not a multi-device
cloud transaction. A backend would need a durable unique completion ID and an
atomic transaction.

## Placement

Grade selection resolves:

- a suitable starting location;
- starter cannons;
- initial equipped loadout;
- grade-appropriate content.

Keeping this in pure logic prevents onboarding screens from becoming a second
curriculum rules engine.

## Drills and the timeout rule

The product decision is that a timeout is “free”:

- it should not count as correct;
- it should not count as an incorrect mastery attempt;
- it should not consume a scored attempt.

The app duel follows that rule. The newest engine branch also follows it for
drills. At review time, the app branch still contained the older drill behavior
and needs the engine change merged before the running range is fully consistent.

This is a useful interview example of integration risk across parallel branches.

---

## State management and persistence defense

## Why split durable and ephemeral state?

Different state has different owners and failure semantics.

| State                         | Owner                     | Persisted? | Reason                                   |
| ----------------------------- | ------------------------- | ---------- | ---------------------------------------- |
| Name, flag, grade             | Captain Zustand store     | Yes        | User identity and placement              |
| Coins and mastery             | Captain Zustand store     | Yes        | Durable progress                         |
| Owned/equipped cannons        | Captain Zustand store     | Yes        | Used across routes                       |
| Current question              | Duel/range reducer        | No         | Session-specific                         |
| Cannonball animation progress | Reanimated shared values  | No         | Purely visual                            |
| Current duel hull values      | Duel presentation reducer | No         | Atomic session; not safely resumable yet |
| Question templates            | Static content catalog    | Bundled    | Versioned application content            |
| Authentication identity       | Firebase Auth target      | Future     | Stable account ownership across devices  |
| Synced captain snapshot       | Firestore target          | Future     | Durable, cross-device state              |
| Accepted reward events        | Trusted backend target    | Future     | Server-authoritative economy             |

### Why not one global store?

A single global store would make transient duel phases visible to unrelated
screens, increase persistence mistakes, and make cleanup harder. State should be
global only when multiple routes need to share it.

## Persistence envelope

Conceptually, local data is stored as:

```ts
{
  version: 1,
  captain: { /* durable fields */ }
}
```

The version allows future migrations. The loader handles:

- no saved value;
- invalid JSON;
- unsupported version;
- missing captain fields;
- storage read errors.

### Hydration race

The dangerous sequence would be:

1. create default captain;
2. subscribe persistence immediately;
3. default state writes;
4. saved captain is overwritten;
5. hydration reads the new blank state.

The app instead hydrates first and subscribes afterward.

### Remaining persistence risks

- The shape guard is not deeply exhaustive.
- A future schema migration framework is not implemented.
- Every captain update triggers a fire-and-forget write.
- Writes are not explicitly serialized, so very rapid updates could finish out
  of order on a slow store.
- Local data can be lost if the app is removed.

### Production improvement

Use a full Zod captain schema, explicit migrations, and a serialized/debounced
write queue. For cloud sync, add durable event IDs or field-level merge rules
rather than blindly overwriting whole documents.

## Target production persistence model

The production architecture is not “replace AsyncStorage with Firestore.” It is
a coordinated local-plus-cloud system with explicit ownership.

### Ownership model

| Concern                               | Authority                               |
| ------------------------------------- | --------------------------------------- |
| Current rendered captain              | Zustand in memory                       |
| Fast startup and offline cache        | AsyncStorage                            |
| Pending offline operations            | AsyncStorage outbox                     |
| Account identity                      | Firebase Authentication                 |
| Cross-device durable profile          | Firestore                               |
| Document access                       | Firestore Security Rules                |
| Coin and high-value reward acceptance | Cloud Function or trusted backend       |
| Question/combat validation rules      | Shared versioned pure TypeScript domain |

### Proposed startup sequence

1. Read the cached profile immediately so the app can render offline.
2. Restore the Firebase Auth session in parallel.
3. If signed in, fetch the latest Firestore profile and server revision.
4. Migrate both local and remote documents to the current schema version.
5. Reconcile remote state with locally queued idempotent events.
6. Update the Zustand store with the accepted merged state.
7. Persist the new snapshot locally and acknowledge delivered outbox events.

### Proposed write sequence

For low-risk profile data such as flag choice:

1. Update Zustand optimistically.
2. Persist to the local cache.
3. Queue a versioned operation with a unique ID.
4. Synchronize it to Firestore when authenticated and online.
5. Mark it acknowledged after the server accepts it.

For coins, unlocks, or competitive progress:

1. Create a unique completion event.
2. Submit the event and versioned evidence to a trusted endpoint.
3. Let the server verify ownership, duplication, and domain rules.
4. Update the profile atomically.
5. Return the authoritative balance and revision.
6. Reconcile the local optimistic view if the server disagrees.

### Conflict strategy

Blindly uploading an entire captain object with last-write-wins could erase
progress from another device. Use policy by data type:

- Profile cosmetics can use a server revision or latest accepted user action.
- Mastery can merge versioned skill evidence or accepted attempt events.
- Owned items and unlocks are usually monotonic sets.
- Equipped-cannon order is a replaceable preference with a revision.
- Coin balances must be derived from accepted server-side ledger events.

Device timestamps should not decide valuable conflicts because clocks can be
wrong or manipulated.

### Why this is stronger than cloud-only

A cloud-only read before rendering creates unnecessary latency and makes
temporary outages a product outage. A local-only design loses accounts,
recovery, and authority. The hybrid model provides:

- immediate interaction;
- offline continuity;
- authenticated recovery;
- cross-device synchronization;
- server-authoritative valuable state;
- controlled failure recovery.

---

## Biggest technical hurdles

## 1. Keeping the engine independent from the UI

The risk was that question rules, damage, and progression would leak into route
components because that feels fast initially.

The solution was:

- pure TypeScript modules;
- dependency rules in ESLint;
- injected clocks/storage/services;
- seeded RNG instead of global randomness;
- Node tests for domain behavior.

The result is a core that can be simulated and tested without Expo.

## 2. Safely turning templates into varied questions

The engine needed variety without executing arbitrary content.

The solution combined:

- Zod validation;
- a restricted expression evaluator;
- bounded rejection sampling;
- deterministic distractors;
- static template imports compatible with Metro.

This is stronger than interpolating arbitrary JavaScript strings.

## 3. Coordinating two reducers built in parallel

The engine track created a canonical duel reducer while the app-shell track
created a presentation reducer optimized for animation beats. Both are good
locally, but the app now has duplicated transition knowledge.

The honest lesson:

> Parallelization needs an integration contract, not only individually passing
> tests.

The next integration should make engine transitions authoritative and leave
presentation sequencing to an adapter.

## 4. Correct startup around asynchronous hydration

Navigation cannot be chosen correctly before local progress loads. Showing the
wrong screen briefly also creates a poor experience.

The app blocks routing until fonts and storage are ready, then uses a pure flow
service to choose the destination.

## 5. Preventing duplicate rewards

React effects can rerun. A “victory detected” effect that directly adds coins
could pay twice.

The reward service accepts a duel ID and remembers which outcomes were applied
to a specific store. Drills have a similar once-only commit guard.

## 6. Runtime-only Reanimated failures

Node tests and TypeScript cannot fully model worklet execution. A normal
JavaScript helper called from a worklet caused an iOS runtime crash.

The response was:

- isolate worklet-safe logic;
- run a clean Metro reload;
- add simulator smoke tests to the release gate.

## 7. Route entry bypassing expected setup

A launch path initially reached the chart/duel with an empty cannon tray,
causing a crash even though normal onboarding would have populated it.

The response was to make flow decisions explicit and guard invalid loadouts.
The lesson is that deep links, restored routes, and developer entry points must
not assume a previous screen ran.

## 8. Translating a fixed design board to responsive native layout

The reference design assumed a 375 × 667 frame and CSS-like geometry. Native
phones have different ratios, notches, and text behavior.

The response was:

- separate clamped scales for art and text;
- safe-area insets;
- large touch targets;
- reusable tokens;
- computed duel geometry extracted and tested;
- smoke checks at the target web viewport and an iOS simulator.

## 9. Native tooling and path sensitivity

The main repository path contains a space. Xcode shell-script phases failed in
that path even though the JavaScript code was correct.

The practical workaround was a space-free worktree for iOS verification. This
is a tooling constraint, not a domain failure, and it should be documented so
future engineers do not repeatedly rediscover it.

## 10. Tests that were broad but not sufficient

The suite had more than 1,800 passing tests while two launch-blocking issues
still existed. Most tests run in Node and do not mount actual native screens.

The lesson is not that unit tests failed. It is that each test layer answers a
different question:

- unit tests: are rules and invariants correct?
- typecheck: do modules agree structurally?
- lint: are boundaries respected?
- web export: can the bundle be produced?
- device smoke: does the real runtime launch and navigate?

---

## Edge cases to explain proactively

## Content and math

- Invalid template JSON is rejected before gameplay.
- Duplicate template and content IDs are detected.
- Missing skill, island, or cannon references are detected.
- Unsafe expressions cannot call global JavaScript.
- Division by zero and invalid numeric results are rejected.
- Generated values are retried only within a bounded budget.
- Fraction answers are normalized before comparison.
- Distractors cannot duplicate one another or the correct answer.
- Insufficient distractors use bounded fallback generation.
- Choice order is seeded instead of globally random.
- Stable template order preserves seed behavior.
- Recent IDs reduce immediate question repetition.

## Duel

- A late answer after the question phase should be ignored.
- A timeout must not also register as an incorrect tap.
- Hull is clamped and cannot fall below zero.
- Terminal victory/defeat prevents another meaningful turn.
- Duplicate completion effects cannot apply a second reward.
- Animation phases do not directly write mastery or coins.
- An empty or invalid cannon tray is rejected before play.
- A deep-linked route cannot assume onboarding ran first.
- Navigation away during an animation must not persist a half-complete duel.
- Current rival damage is seeded but intentionally simple.

## Practice range

- It shares question rendering but not duel damage or rewards.
- Session completion is committed once.
- A timeout should not affect mastery or consume a scored attempt.
- The free-timeout drill fix (T-036) is present on `app/shell`.
- Unlock evaluation occurs from committed learning progress.

## Captain and progression

- Blank name becomes “Captain.”
- The selected grade controls starters and placement.
- The gun tray rejects locked cannons.
- The tray rejects duplicate cannon IDs.
- The tray capacity is three.
- The selected order is retained in durable state.
- Fogged islands stay visible so progression has context.
- Locked islands are not treated as navigable unlocked content.
- A repeated reward application is idempotent.

## Persistence

- Missing storage means a first-time player.
- Malformed JSON recovers to defaults.
- Unsupported envelope versions are discarded safely.
- Hydration occurs before the write subscription.
- A storage failure should not crash pure question generation.
- A killed mid-duel session does not commit partial rewards.
- Local-only progress does not synchronize to another device.
- Current validation is shallow enough that nested corruption remains a known
  improvement.

## Cross-platform

- Safe areas vary across iPhones and Android devices.
- Text and art require different scaling behavior.
- Hover cannot be required for a touch-first workflow.
- Web may emit non-fatal React Native deprecation warnings.
- Worklet failures require a native runtime to expose.
- A successful web build does not prove iOS or Android runtime correctness.
- A space in the repository path can affect Xcode shell phases.

## Concurrency and timing

- Reducers remain synchronous.
- Timers and animation callbacks live in effects/adapters.
- Actions are valid only in expected phases.
- Reward and drill commits have idempotency guards.
- Local writes are asynchronous and should eventually be serialized.
- A future backend must use durable idempotency rather than an in-memory
  `WeakMap`.

---

## Testing and verification defense

### Current verification snapshot

At the time of this review:

- App branch tests: **40 files, 2,014 tests passed**.
- App branch TypeScript check: **passed**.
- App branch ESLint: **passed**.
- App branch static web export: **passed**, producing ten routes.
- Web smoke: **passed** through onboarding, name/flag, chart, duel, range, and
  gun deck with no page or console errors; only two non-fatal React Native web
  deprecation warnings.
- iOS simulator smoke: **passed** for chart and core navigation after a clean
  Metro reload.
- Android device smoke: **not yet completed**.
- App repository-wide format command was blocked only by an unformatted,
  untracked release-evidence Markdown file, not application source.

The newest engine branch separately reports:

- TypeScript: **passed**.
- ESLint: **passed**.
- Prettier: **passed**.
- Tests: **1,811 passed and 5 failed**.

All five failures are from a worker-isolation harness trying to dynamically
import a `.ts` file directly in the current Node environment. Treat that as a
real unresolved test-harness issue. Do not say “all tests are green” for that
branch.

### What the tests prove well

- Deterministic question generation.
- Content and catalog integrity.
- Safe expression behavior.
- Distractor invariants.
- Duel and drill rule transitions.
- Damage, mastery, economy, placement, and unlock rules.
- Captain-store actions.
- Persistence recovery and flow decisions.
- Idempotent reward/drill application.
- Design-board geometry calculations.
- Source-level app wiring.

### What the tests do not prove

- Every React Native component mounts.
- Every Reanimated worklet is runtime-safe.
- Touch interactions behave identically on every device.
- App Store or Play Store submission succeeds.
- Cloud auth or sync works.
- Android hardware behavior.
- Full accessibility with assistive technologies.

### Recommended next testing layers

1. Add React Native Testing Library for mounted component behavior.
2. Add route-level tests with mocked navigation and storage.
3. Add Maestro or Detox smoke flows for iOS and Android.
4. Run simulator/device gates in CI.
5. Fix the worker-isolation TypeScript loader.
6. Add persistence migration and write-order tests.
7. Add visual regression snapshots for core frames.
8. Add accessibility audits for labels, contrast, and focus order.

---

## Security, privacy, and reliability

### Current security posture

- The pure engine cannot import network or device APIs.
- Template expressions cannot execute arbitrary JavaScript.
- Content is runtime-validated.
- No cloud identity or child data is transmitted by the current startup flow.
- Progress is local to the device.

### What not to claim

Do not claim:

- COPPA compliance has been certified.
- Firestore rules protect production data.
- authentication is live;
- local AsyncStorage is encrypted;
- multiplayer cheating has been solved.

### Production cloud security requirements

The committed Firebase phase should include:

- minimal child data collection;
- parent-controlled identity and consent where required;
- authenticated ownership checks;
- default-deny Firestore Security Rules;
- Firebase App Check as an abuse-reduction layer, not an authorization
  substitute;
- server-validated reward events;
- server-assigned revisions rather than trusted device clocks;
- Emulator Suite tests proving one UID cannot read or write another UID’s
  documents;
- deletion/export workflows;
- no sensitive data in analytics logs;
- durable sync conflict and idempotency rules.

### Offline-first behavior

Today, all core gameplay is bundled and local:

- questions do not require a server;
- content is packaged in the app;
- progress is stored locally;
- a network failure does not block the learning loop.

Cloud sync should enhance this model rather than make a child’s first play
dependent on connectivity.

The production standard is therefore not “online-only.” It is authenticated,
cloud-backed, and offline-capable.

---

## Current technical debt, ranked

### Priority 1: unify duel state

Replace the duplicate presentation rules with an adapter over the canonical
engine reducer. This removes divergence and unlocks the tested opponent and
action-log capabilities.

### Priority 2: finish and verify tutorial behavior

The guided-duel route should teach answering, cannon firing, misses, and rewards
instead of immediately redirecting.

### Priority 3: merge the free-timeout drill fix

Bring the newest engine drill semantics into the app branch and rerun the full
app, range, and smoke gates.

### Priority 4: strengthen persistence

Add a full captain schema, migrations, and ordered writes.

### Priority 5: add mounted and device automation

Headless tests are strong for rules but insufficient for animation and native
runtime integration.

### Priority 6: complete the Firebase production path

Wire Firebase Authentication into startup, migrate guest progress to durable
accounts, introduce versioned Firestore profile/event schemas, retain
AsyncStorage as an offline cache/outbox, and move authoritative rewards to
idempotent backend transactions. Until those gates exist, the app should remain
explicitly labeled a local-first vertical slice.

### Priority 7: finish release configuration

Link the EAS project, replace submission placeholders, verify Android, and
deploy the web export if web distribution is in scope.

### Priority 8: prune unused packages and dead state

Review currently unused image, gradient, and gesture dependencies. Track
Firebase as an intentional staged dependency with an owner and delivery
milestone. Remove or document redundant state such as an onboarding-complete
flag that is not used by flow.

---

## Interview question bank with defensible answers

## Product and architecture

### 1. Walk me through the architecture.

> “The top layer is Expo Router, which owns navigation. Route components compose
> reusable React Native UI. Durable captain progress lives in a vanilla Zustand
> store, while short-lived duel state lives in a local reducer and Reanimated
> owns only visual interpolation. Services adapt questions, flow, persistence,
> and rewards. Beneath all of that is a pure TypeScript engine for content,
> math, combat, mastery, economy, placement, and drills. AsyncStorage is the
> current offline persistence implementation. The production boundary adds
> Firebase Authentication, Firestore synchronization, and trusted reward
> validation without coupling those concerns into the engine. Dependencies flow
> toward the engine, never back toward the UI.”

### 2. Why did you choose this layering?

> “The requirements change at different rates. Visual timing changes often;
> arithmetic correctness should change cautiously. Separating them lets us
> redesign a ship animation without risking mastery or damage rules.”

### 3. What is the source of truth?

> “For durable player progress, it is the captain Zustand store. For a running
> screen duel, it is the presentation reducer. For domain calculations, it is
> the pure engine. One current weakness is that the screen reducer duplicates
> some canonical engine transition logic, and unifying those is the first
> refactor I would make.”

### 4. Why not put everything in components?

> “Components have lifecycle and rendering concerns. If math rules lived there,
> they would be harder to simulate, reuse, and test. Pure functions make
> correctness independent of a device.”

### 5. Why services between screens and the engine?

> “The screen wants a compact UI model while the engine returns a richer domain
> model. Services adapt those shapes and isolate side effects such as storage
> and reward commits.”

### 6. Is this clean architecture?

> “It uses the central idea of inward dependency direction, but I would not
> oversell it as a textbook implementation. It is a pragmatic layered
> architecture with a pure domain core and explicit platform boundaries.”

### 7. How large is the application?

> “The reviewed app has nine route files, about 4,500 component lines, roughly
> 3,400 engine lines, 72 question templates across nine skills, 11 cannons, five
> islands, and just over 2,000 passing tests on the app branch.”

### 8. Why file-based routing?

> “The product is naturally a set of named experiences. File routing makes the
> app map visible in the repository and gives the web build stable URLs.”

### 9. Why is flow logic not in the index route?

> “Startup conditions are domain-like decisions that are easier to test as a
> pure function. The route asks for a destination; it does not reproduce every
> onboarding condition.”

### 10. How would you draw this on a whiteboard?

Draw five boxes:

```text
Routes/UI → App State → Services → Pure Engine → Storage/Cloud Boundary
```

Then trace one correct answer downward and the resulting animation/reward
upward.

## React Native, Expo, and Flutter

### 11. Why React Native?

> “It matched a screen-heavy, 2D, touch-first product and let the team keep the
> app and domain engine in TypeScript.”

### 12. Why Expo?

> “Expo reduced native setup and provided a coherent routing, font, simulator,
> web-export, and build workflow. The project did not initially require custom
> native code that would justify starting bare.”

### 13. Why not Flutter?

> “Flutter was credible, especially for custom rendering. React Native was a
> better fit because the existing domain and tests were TypeScript, the product
> used standard screen primitives, and Expo provided the required native and
> web workflow without adding Dart.”

### 14. Would Flutter have performed better?

> “That cannot be answered honestly in the abstract. Both can deliver this UI.
> The likely bottleneck was animation structure and asset discipline, not the
> framework name. I would profile real frames before rewriting.”

### 15. Why not Unity?

> “We needed navigation, text, touch targets, local forms, and 2D transitions,
> not physics or a continuously rendered 3D world. Unity would have increased
> complexity without serving a core requirement.”

### 16. Does Expo prevent native customization?

> “No. Expo can prebuild native projects and use custom modules. It changes the
> default workflow; it does not remove the native escape hatch.”

### 17. What platform-specific issue did you face?

> “Xcode shell-script phases did not tolerate the space in the main repository
> path, so iOS verification used a space-free worktree. We also found a
> Reanimated worklet crash that Node tests could not expose.”

## State and reducers

### 18. Why Zustand?

> “The captain is shared across many routes, but the state model is too small to
> justify a heavier framework. A vanilla Zustand store gives actions,
> subscriptions, selectors, and easy test construction.”

### 19. Why not Redux?

> “Redux would work, but the global state is modest. Zustand provided the needed
> structure with less ceremony. If the application grew into complex
> event-sourced collaboration or required extensive middleware, I would
> reevaluate.”

### 20. Why use `useReducer` for duels?

> “A duel is a state machine. Explicit actions and phases are safer than several
> booleans such as `isFlying`, `isHit`, and `isOver`, which can form impossible
> combinations.”

### 21. Why do you have two duel reducers?

> “The engine and visual shell were developed in parallel. The engine optimized
> for canonical, deterministic rules; the app reducer optimized for animation
> beats. The vertical slice integrated shared calculations but not the reducers
> themselves. That is an honest integration debt. I would now make the engine
> reducer authoritative and map its transitions to presentation beats.”

### 22. Was using two reducers a mistake?

> “It was a reasonable parallel-delivery tactic but not the desired final
> architecture. It shortened the critical path and exposed the UI contract, but
> the duplicated transition logic now costs more than it saves. The important
> part is recognizing the crossover point and consolidating it.”

### 23. Why not persist a duel?

> “A duel contains timing and animation state. Partially restoring it requires a
> versioned session protocol and careful reward semantics. For this release, an
> interrupted duel is abandoned and only completed outcomes affect durable
> progress.”

### 24. How do you prevent duplicate rewards?

> “Outcome application accepts a unique duel ID and records applied IDs per
> store. Repeated effects become no-ops. For cloud sync I would move that
> idempotency into a backend transaction.”

### 25. What happens if a timer fires late?

> “Timing is outside the pure reducer, and actions are valid only in expected
> phases. Effects also need cleanup on dependency change and unmount. A stronger
> future adapter would attach a transition token so stale callbacks cannot
> advance a newer state.”

### 26. Why is Reanimated not the state machine?

> “Animation progress is implementation detail. Rules must remain deterministic
> even if an animation is skipped, slowed, or disabled for accessibility.”

## Questions and educational correctness

### 27. How are questions generated?

> “A seeded generator chooses an eligible validated template, samples bounded
> parameters, enforces constraints, evaluates a restricted math expression,
> generates unique plausible distractors, shuffles choices, and returns the next
> seed.”

### 28. Why not store thousands of fixed questions?

> “Templates give controlled variety with a smaller review surface. The tradeoff
> is that the generator and constraints must be tested much more thoroughly.”

### 29. Why Zod if TypeScript already checks types?

> “TypeScript disappears at runtime. JSON content can still be malformed. Zod
> checks the actual content entering the engine.”

### 30. Why not use `eval`?

> “Templates are data and should never gain arbitrary code execution. A
> restricted evaluator allows only the math grammar we need.”

### 31. How do you prevent impossible questions?

> “Templates define parameter constraints. The generator uses bounded rejection
> sampling and fails with diagnostics if it cannot find a valid sample.”

### 32. Why bounded retries?

> “A malformed template must not hang the app. A finite retry budget turns a
> silent infinite loop into a visible content defect.”

### 33. How do you make wrong answers useful?

> “Distractors model likely mistakes, are normalized, de-duplicated, and checked
> against the correct answer. Fallbacks are bounded and still deterministic.”

### 34. How do you avoid repeating questions?

> “The adapter threads recent question IDs into generation. The generator
> prefers eligible templates outside that recent set when possible.”

### 35. How is grade appropriateness enforced?

> “Grade selection maps to initial placement, skills, islands, and starter
> content. Template metadata and generation constraints provide the lower-level
> guard.”

### 36. What does mastery represent?

> “Mastery is smoothed evidence over valid attempts, not a copy of battle wins.
> That separates learning progress from game drama.”

### 37. What happens on timeout?

> “The intended policy is that timeout is free: no correct credit, no incorrect
> mastery penalty, and no consumed scored attempt. The duel follows it, and the
> latest engine drill implementation follows it. The app branch still needs
> that drill fix merged.”

## Randomness and determinism

### 38. Why seeded randomness?

> “A seed makes random-looking content reproducible. A failing scenario can be
> rerun exactly instead of becoming a flaky one-off.”

### 39. Why ban `Math.random` in the engine?

> “Global randomness hides a dependency. Passing the seed makes randomness
> visible, testable, and replayable.”

### 40. Where does the first seed come from?

> “The platform edge captures a fresh time-derived value. Once inside the
> engine, randomness is explicit and seeded.”

### 41. Can you replay a current app duel?

> “Not end to end today. The engine has action-log and replay-oriented
> capability, but the app presentation reducer does not store that log. A
> complete replay record would need the initial seed, content version, engine
> version, and ordered actions.”

### 42. Is deterministic the same as predictable to the user?

> “No. A player does not know the seed. Determinism is for reproducibility; the
> sequence still appears varied.”

## Persistence and backend

### 43. What is persisted?

> “Durable captain progress: identity, grade, coins, mastery, owned and equipped
> cannons, unlocks, and flow flags. Animation and in-progress duel state are not
> persisted.”

### 44. Why AsyncStorage?

> “I did not choose AsyncStorage as the eventual backend. I chose a local-first
> persistence boundary so startup and learning do not depend on a network
> round-trip. In the production design, Firebase Authentication owns identity,
> Firestore owns synchronized durable progress, and a trusted backend owns
> valuable rewards. AsyncStorage remains the fast guest profile, offline cache,
> and pending-operation outbox. That gives us responsiveness and offline
> continuity without giving up accounts, recovery, or server authority.”

### 45. How do you handle corrupt storage?

> “The loader catches parse and read errors, checks the envelope version and
> captain shape, and safely falls back to a default profile.”

### 46. What is the hydration race?

> “If the app subscribes to the default store before reading saved data, it can
> overwrite the save. The app hydrates first and subscribes afterward.”

### 47. What persistence weakness remains?

> “Nested validation is shallow and writes are fire-and-forget rather than
> serialized. I would add a full Zod schema, migrations, and an ordered write
> queue.”

### 48. Is Firebase implemented?

> “Partially. The Firebase dependency and an injected, tested authentication
> service exist, but startup does not initialize it and Firestore sync is not
> implemented. The current build proves the local learning loop. Production
> readiness requires wiring Auth, guest-account migration, versioned Firestore
> documents, Security Rules, an offline outbox, and server-side idempotent reward
> transactions.”

### 49. Why abstract authentication before using it?

> “It establishes the production seam early while keeping Firebase SDK calls out
> of routes and the pure engine. Screens should depend on an auth session model,
> not a vendor API. That makes the integration testable and allows account
> startup to change without changing combat or curriculum code.”

### 50. How would you add cross-device sync?

> “On launch I would render the cached captain, restore Firebase Auth, fetch the
> latest server revision, migrate schemas, and submit locally queued idempotent
> operations. Conflict policy would be field-specific: cosmetics can use
> revisions, unlocks can merge monotonically, mastery can merge accepted
> evidence, and coins must come from a server-owned ledger. I would never
> last-write-wins the entire captain document.”

### 51. How would you stop double rewards in the cloud?

> “The client would submit a stable completion ID and versioned evidence to a
> Cloud Function or backend endpoint. In one transaction, the server would
> verify authentication, ownership, validity, and whether the ID was already
> accepted; then it would record the event and update the coin balance. Retrying
> the same request would return the original result rather than paying twice.”

### 52. How does the app work offline?

> “Questions and catalogs are bundled, the engine is local, and progress writes
> to an AsyncStorage-backed cache/outbox. Network access is not required for the
> core loop. When connectivity and authentication return, pending versioned
> operations synchronize and the local view reconciles with the server
> revision.”

### 52A. Why not use Firestore alone?

> “I would use Firestore for durable synchronized documents, but I would not make
> the first render wait for it. We still need guest-mode state, predictable
> startup, and explicit pending-operation recovery. If the chosen Firebase SDK’s
> offline cache fully satisfies part of that requirement on every target, I
> would reduce duplicated caching rather than maintain two databases. The
> architectural requirement is offline-first behavior; AsyncStorage is the
> current implementation, not a dogma.”

### 52B. Do you mean Firebase Storage or Firestore?

> “Firestore. Captain progress is structured document data. Firebase Storage is
> for large binary objects such as uploads. Using Storage for JSON profiles would
> give up document queries, Security Rules semantics, and transactional update
> patterns.”

### 52C. How would authentication work for a child-focused product?

> “I would minimize child PII and design the durable account around the required
> guardian-consent model. A player could begin as a guest, then a parent-managed
> flow could link that progress to a durable Firebase UID. The exact providers
> and consent UX require product and legal review; I would not improvise those
> requirements inside a game screen.”

## Animation and performance

### 53. Why Reanimated?

> “It can run motion on the UI runtime and keep ship and cannonball animation
> smooth without making the JavaScript thread the frame clock.”

### 54. What Reanimated bug did you face?

> “A worklet called an ordinary JavaScript helper, which failed only on the
> native runtime. I moved the calculation into worklet-safe code and made clean
> simulator smoke testing part of release verification.”

### 55. How do you keep animations from changing rules?

> “The reducer computes the outcome first. Animation visualizes that outcome.
> Skipping the animation cannot change damage or rewards.”

### 56. How did you handle different screen sizes?

> “The design has a reference frame, but type and decorative art use separate
> clamped scales. Safe-area insets and large touch targets protect usability.”

### 57. Did you optimize before profiling?

> “The main structural optimization was keeping animation on the UI runtime and
> static content bundled. I would use actual frame and memory profiling before
> more aggressive changes.”

### 58. Why not render everything as images?

> “Text, touch targets, and dynamic values need native layout. SVG and views
> scale better for many shapes, while small licensed PNGs are used where they
> are efficient.”

### 59. What is the web bundle status?

> “Expo successfully statically exports ten routes. The current main JavaScript
> bundle is about 2.3 MB. The web experience has been smoke-tested but is not yet
> deployed as a production site.”

## Testing and delivery

### 60. How did you test the platform?

> “I used layered gates: Vitest for pure rules and invariants, TypeScript for
> structural consistency, ESLint for architectural boundaries, Prettier for
> stable diffs, Expo export for bundling, and browser/iOS smoke flows for real
> runtime behavior.”

### 61. Are all tests green?

> “The app branch is green at 2,014 tests, typecheck, lint, and web export. The
> newest engine branch has 1,811 passing and five worker-isolation harness
> failures caused by direct `.ts` dynamic imports in the current Node
> environment. I would not call that branch fully green until the harness is
> fixed.”

### 62. What did the tests miss?

> “They missed a Reanimated worklet crash and an invalid startup route with an
> empty tray because most tests are headless and do not mount the real native
> runtime.”

### 63. Why have so many engine tests?

> “Generated content has a large input space. Beyond examples, the suite checks
> invariants over many seeds: valid answers, unique distractors, bounded values,
> deterministic transitions, and content integrity.”

### 64. Why not rely only on snapshots?

> “A snapshot can show that output changed, but not whether educational
> invariants remain true. Property-like assertions explain correctness better.”

### 65. What is your next testing investment?

> “Mounted React Native component tests and automated iOS/Android smoke flows,
> because that is the largest current coverage gap.”

### 66. What does a web export prove?

> “It proves route discovery, bundling, static rendering, and asset resolution.
> It does not prove native worklets or device behavior.”

### 67. What does simulator smoke prove?

> “It proves the app launches in the native runtime and that critical navigation
> paths work. It is still not a replacement for comprehensive automated
> behavior or physical-device accessibility testing.”

## Tradeoffs and future scale

### 68. What would you refactor first?

> “Unify the app duel with the canonical engine reducer. That removes duplicate
> rules and lets the UI use the tested opponent and action-log infrastructure.”

### 69. What would you build next for product value?

> “A real guided duel, because it improves first-session comprehension. Then I
> would merge the timeout semantics and automate device smoke.”

### 70. What would break first at large scale?

> “The local architecture itself does not face server scale, but cloud sync and
> analytics would. The first design problem would be durable event identity and
> conflict resolution, not question-generation CPU.”

### 71. How would you support a teacher dashboard?

> “Keep the pure engine shared, send privacy-conscious attempt summaries through
> an authenticated service, and build the dashboard as a separate client over a
> server-owned reporting model.”

### 72. How would you add multiplayer?

> “I would not trust clients for rewards or battle truth. A server-authoritative
> session would validate actions, sequence turns, and grant outcomes
> idempotently. The current reducer concepts remain useful, but networking
> changes the trust model.”

### 73. How would you add new curriculum content?

> “Add validated templates and catalog metadata, run content and many-seed
> invariant tests, then release with an explicit content version so replays and
> analytics remain interpretable.”

### 74. How would you roll out a new mastery formula?

> “Version it. Do not silently reinterpret historical scores. Migrate or keep
> old mastery records tagged with the formula version.”

### 75. Why show locked islands instead of hiding them?

> “Fogged islands communicate future progression and make unlocks meaningful.
> They remain non-interactive until their rules are satisfied.”

### 76. Why a maximum of three cannons?

> “It creates a meaningful but understandable loadout choice and keeps the duel
> UI readable on a phone. The store validates the capacity rather than trusting
> the screen.”

### 77. What feature did you intentionally cut?

> “The full custom asset pipeline and audiovisual polish. I prioritized a
> correct playable loop and used lightweight CC0 assets plus vector/native art.
> That was the right time-box tradeoff.”

### 78. What is your biggest architectural concern?

> “The duplicate duel reducers. They can drift in timing, opponent, timeout, and
> replay semantics. The boundary is visible and the consolidation path is clear,
> so it is manageable debt rather than hidden debt.”

### 79. What are you proudest of technically?

> “The pure content and question engine: constrained expressions, runtime schema
> validation, bounded generation, deterministic randomness, and strong
> invariants. It protects the educational core from UI and runtime changes.”

### 80. What did you learn?

> “Passing domain tests is necessary but not sufficient for a cross-platform
> animated app. Integration contracts and device gates must be designed as
> deliberately as pure logic.”

---

## Tough follow-up questions

### “If the canonical engine is so important, why is the app not using its

reducer?”

> “The engine and visual shell were parallel workstreams with different immediate
> interfaces. We integrated shared calculations first to keep delivery moving.
> That exposed a contract mismatch: the UI needed fine-grained animation phases
> while the engine modeled semantic turns. I would resolve it with an adapter,
> not by deleting either concern. Engine state remains authoritative; the
> adapter expands transitions into visual beats.”

### “Doesn’t a `WeakMap` idempotency guard disappear on restart?”

> “Yes. It prevents duplicate effects within one running process, which is the
> current local threat. It is not durable transaction protection. A cloud
> reward system needs a persisted event ID and atomic server grant.”

### “Why does the app contain Firebase if it is unused?”

> “It reflects a staged production integration, not an accidental package. The
> auth seam is already injected and tested, while the vertical slice first
> stabilized the profile and progression model that will be synchronized. The
> next milestone wires Auth, guest migration, Firestore schemas, Security Rules,
> and idempotent server rewards. I would still track bundle and maintenance
> costs and require an owner and delivery date for that staged dependency.”

### “Why did 2,000 tests not catch two crashes?”

> “Because count is not coverage quality. The tests were deep in the pure engine
> and broad in services, but shallow at the React Native runtime boundary.
> Worklets and route mounting require a real or emulated runtime. We corrected
> the gate, not merely the two symptoms.”

### “How do you know the math is correct?”

> “Content is schema-validated, expressions use a constrained evaluator,
> generated questions are checked through example and many-seed invariants, and
> distractors are checked for uniqueness and answer exclusion. For production
> curriculum claims I would also require educator review and versioned
> approval.”

### “Is the app production ready?”

> “It is a verified vertical slice, not yet a public production release. The
> core loop works on web and iOS simulation. Android verification, EAS/store
> configuration, Firebase Auth/Firestore integration, server-authoritative
> rewards, mounted UI automation, and the guided duel remain release work.”

### “What happens when content changes and a saved seed points somewhere else?”

> “That is why a real replay should include a content version, not only a seed.
> Stable file ordering reduces accidental changes, but versioned catalogs are
> the durable solution.”

### “Why is the rival so simple if an adaptive bot exists?”

> “The app integrated a predictable 7–12 damage rival to finish and tune the
> vertical slice. The engine bot is available but its integration depends on
> resolving the duel-state boundary. I would wire it only after the canonical
> reducer becomes authoritative, then tune it with simulations.”

### “How do you prevent a child from editing AsyncStorage and granting coins?”

> “For local offline play, the client owns its own data, so determined local
> tampering is possible. If coins gain server value or social consequences, the
> backend must own reward truth. Client obfuscation would not be a security
> boundary.”

---

## A whiteboard walkthrough to memorize

### Step 1: State the product

> “A child answers arithmetic questions to power ship battles and unlock a
> nautical map.”

### Step 2: Draw the layers

```text
Expo Router screens
       ↓
React Native components + Reanimated
       ↓
Zustand captain state + local duel reducer
       ↓
Question/reward/persistence/flow services
       ↓
Pure TypeScript engine
       ↓
Persistence boundary
  ├─ AsyncStorage cache/outbox today
  └─ Firebase Auth + Firestore + trusted backend target
```

### Step 3: Trace a correct answer

1. The player taps a choice.
2. The route dispatches an answer action.
3. The presentation reducer checks the phase.
4. The engine damage function calculates the result.
5. The UI animates a cannonball and impact.
6. Victory triggers one idempotent reward commit.
7. Durable captain state persists after hydration.

### Step 4: Trace question generation

1. The service receives a skill, context, recent IDs, and seed.
2. The engine chooses an eligible template.
3. It samples constrained parameters.
4. It evaluates safe math.
5. It creates and shuffles distractors.
6. It returns the question and next seed.

### Step 5: Name the tradeoff

> “The current UI reducer duplicates some canonical engine transition logic. It
> accelerated parallel delivery, but I would now consolidate it through an
> adapter.”

### Step 6: Name the verification gap

> “The domain suite is strong; mounted native UI automation is the next testing
> layer.”

---

## Three STAR stories

## Story 1: Reanimated production crash

**Situation:** The app passed a large Node test suite but crashed on iOS during
animation.

**Task:** Identify whether the failure was business logic, bundling, or runtime
isolation.

**Action:** Reproduced on a clean simulator run, isolated a normal JavaScript
helper being invoked by a worklet, moved the calculation into worklet-safe code,
and added native smoke verification to the release gate.

**Result:** The iOS chart and core routes ran without red screens or worklet
errors. The larger lesson was to align test layers with runtime boundaries.

## Story 2: Duplicate rewards

**Situation:** A victory side effect could be triggered multiple times by React
effect behavior.

**Task:** Ensure one duel could never award coins twice in one session.

**Action:** Moved reward application into a service, required a duel ID, and
kept an applied-ID set per store. Repeated calls return without mutation.

**Result:** Reward application became testable and idempotent. The design also
made the future cloud requirement explicit: durable IDs and atomic server
transactions.

## Story 3: Safe generated content

**Situation:** Question templates needed mathematical expressions and random
parameters, but executing content as JavaScript would be unsafe and difficult to
reproduce.

**Task:** Support varied questions while preserving correctness and security.

**Action:** Added Zod schemas, a restricted expression evaluator, explicit
seeded RNG, bounded constraint retries, and distractor invariants.

**Result:** The engine can generate a broad question space reproducibly while
rejecting malformed or unsafe content before it reaches a player.

---

## Phrases that signal strong engineering judgment

- “That was a fit-for-constraints choice, not a universal claim.”
- “The source of truth depends on the lifetime of the state.”
- “The engine owns rules; animation owns presentation.”
- “A seed is useful only with an engine and content version.”
- “Idempotency in one process is different from transactional idempotency.”
- “Cross-platform code reuse does not remove platform verification.”
- “Type safety does not replace runtime validation.”
- “A high test count does not prove runtime coverage.”
- “That capability exists in the engine, but it is not wired into the current
  app.”
- “I would describe it as a verified vertical slice.”

---

## Things not to claim

Do not say:

- “The guided duel is complete.”
- “The app uses the adaptive mercy bot.”
- “The app duel is fully replayable.”
- “The app uses the canonical engine reducer end to end.”
- “Firebase authentication and Firestore sync are live.”
- “All tests pass on every branch.”
- “Android is verified.”
- “The app is deployed to production.”
- “The app uses Blender, WebP, Lottie, audio, or haptics.”
- “All installed dependencies are used.”
- “AsyncStorage is a secure cloud database.”
- “The platform is COPPA certified.”
- “React Native means there are no platform-specific bugs.”
- “Expo eliminates native build work.”

Instead, state the current boundary and the next concrete step.

---

## Strong opening answer

> “I approached Cannon Academy as an educational system with a game
> presentation, not as animation code with some math inside it. The core is a
> pure TypeScript engine that owns validated content, seeded questions, combat,
> mastery, placement, and rewards. Expo and React Native render that engine
> across mobile and web. Durable captain progress lives in a small Zustand
> store; short-lived duel state stays local; and AsyncStorage gives the current
> build offline-first startup. That local store is the first layer of the
> production persistence model, not the final authority: Firebase Authentication
> will own identity, Firestore will synchronize versioned progress, and a
> trusted backend will validate valuable reward events. The result today is a
> working vertical slice with more than 2,000 passing app-branch tests and
> verified web and iOS flows. The remaining work is explicit: unify the duel
> reducers, complete native automation, and implement the cloud security and
> synchronization gates.”

## Strong closing answer

> “The main strength of the platform is that educational correctness is isolated
> from presentation. The main debt is equally clear: parallel development left
> two duel transition models. I can explain both why that happened and how I
> would consolidate it. That combination—a working product, explicit tradeoffs,
> measured verification, and a concrete next step—is the architecture I would
> defend.”

---

## Final interview checklist

Before the interview, be able to answer without notes:

- What is Cannon Academy in one sentence?
- What are the five architecture layers?
- What state is durable and what state is ephemeral?
- Why is the engine pure?
- Why TypeScript, React Native, Expo, and Expo Router?
- Why Zustand for captain state and `useReducer` for a duel?
- Why not Flutter or Unity?
- How are templates validated and expressions evaluated safely?
- Why seeded randomness?
- What can and cannot be replayed today?
- How is duplicate reward application prevented?
- What is the hydration race?
- What runtime bug did device testing catch?
- Why are there two duel reducers, and how would you unify them?
- What exactly is implemented in Firebase?
- What exactly is the guided-duel route today?
- What is the current test and platform-verification status?
- What would you improve first?
- Which features must you avoid claiming?

If you can explain those clearly, acknowledge the limitations without becoming
defensive, and tie each tool to a product requirement, you will sound like the
architect of the system rather than someone reciting its package list.
