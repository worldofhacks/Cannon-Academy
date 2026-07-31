# Cannon Academy — Architecture Defence

Why the system is built this way, what breaks under load, and what I would change.
Every number here is measured from the repo, not estimated.

---

## 1. The pitch

**Thirty seconds.** Cannon Academy is a K–5 maths game where solving arithmetic powers a naval
duel. You pick a cannon, answer its question during the reload, and a correct answer fires. It runs
on iOS, Android and the web from one React Native codebase, works entirely offline, and there is a
live web build at <https://cannon-academy.expo.app>.

**Two minutes.** The interesting problem is not the game, it is that the audience cannot read. A
five-year-old has to be able to tell what a control does from its picture, and the maths they are
shown must never exceed the grade they were placed at. Those two constraints drive most of the
architecture: a pure, deterministic engine that can be exhaustively tested headless; a grade ceiling
enforced where questions are *chosen* rather than where content is granted; and a rendering approach
that composes almost everything from geometry so the app stays tiny and legible at any size.

**By the numbers**

| | |
|---|---|
| Application + engine | 29,828 lines TS/TSX |
| Tests | 46,011 lines, 78 files, ~2,535 cases |
| Test-to-code ratio | ~1.5 : 1 |
| Runtime dependencies | 25 |
| Raster assets | 9 PNGs, MD5-pinned |
| Routes | 11 |
| Commits | 662 |

---

## 2. Architecture

### The load-bearing decision: a pure engine

`src/engine/` has **no React and no `react-native` imports**. It is plain TypeScript — the duel
reducer, mastery, placement, ranks, tuning constants.

Why: React Native's entry point is Flow-typed, and the Node test runner cannot parse it. Anything
importing RN can only be tested in a device harness. Keeping the engine pure means the rules of the
game are testable exhaustively in Node in milliseconds — which is what makes an 8×5 out-of-phase
reducer matrix and property-style sweeps across every grade band affordable.

The same constraint shaped three other modules deliberately: `services/flow.ts` (navigation),
`stores/player.ts` (the captain), and `theme/responsive.ts`. They are all pure for the same reason.

**Layers, outermost in:**

```
app/                    11 expo-router routes — thin, render-only
src/components/         presentation (34 files)
src/services/           app-layer policy: flow, chart, harbor, loadout, rewards (26)
src/stores/             zustand: captain + duel session (3)
src/engine/             pure rules — no RN, no React (18)
src/content/            authored JSON, zod-validated at import (17)
```

Dependencies point inward only. A service may import the engine; the engine imports nothing above it.

### State and persistence

- **Zustand** for in-memory state. Two stores: the persisted `Captain` and the ephemeral duel session.
- **AsyncStorage** for persistence — one key, `cannon-academy/captain`, one JSON document.
- Storage is **injected**, not imported: `persistence.ts` takes a two-method `KeyValueStore`
  (`getItem`/`setItem`). That is the test seam, and it is also the swap point if this ever syncs to
  a server.

**Schema evolution:** new `Captain` fields are *tolerated-as-absent* — defaulted in `emptyCaptain()`,
`normalizeCaptain()` and `migrateLegacyCaptain()`, and deliberately excluded from the
`isBaseCaptain` guard. Adding a field does **not** bump `SCHEMA_VERSION`. Requiring them would
reject every save written before the field existed and silently reset real players to zero.

### Navigation

`services/flow.ts` owns the sequence. `resolveDestination(captain)` is one pure function returning
one of five destinations, and its numbered branches *are* the onboarding flow. No screen hardcodes
where it goes next; every screen asks the resolver.

The route graph is declared as data (`DEMO_ROUTE_EDGES`) and a test walks the TypeScript AST of
every route file to prove each declared edge binds exactly once to real, executable navigation
syntax. A route promised in a comment does not count as evidence.

### Rendering

Almost everything is **composed geometry** — `border-radius` blobs and `clip-path` polygons
transcribed from design boards into React Native views and `react-native-svg` polygons with
`preserveAspectRatio="none"`. Ships, islands, flags, cannons, the kraken: all geometry.

Nine PNGs ship, and a test pins each by **MD5** against the design source. Consequences: a tiny
bundle, no asset CDN, and art that stays crisp at any density without `@2x`/`@3x` sets.

---

## 3. Infrastructure, as actually configured

| Concern | Reality |
|---|---|
| Web hosting | **EAS Hosting**, static export on a CDN — `cannon-academy.expo.app` |
| Native builds | EAS Build; `eas.json` has development / preview / production profiles |
| Store submission | **Not configured** — `eas.json` submit block is still placeholders |
| Backend | **None in the play path.** `services/firebase.ts` and `auth.ts` exist and are imported by nothing |
| Firebase project | Exists — Firestore + Storage *rules only*. `firebase.json` has no `hosting` block |
| Data | 100% on-device. One AsyncStorage key |
| Telemetry / crash reporting | **None** |
| CI | None wired; gates are local (`tsc`, vitest, eslint, prettier) |

**Say this plainly in an interview:** there is no server. Thousands of users means thousands of
independent offline apps. That is a deliberate fit for the product — a maths game for children needs
no network, works on a plane, and collects no personal data, which is a real advantage under COPPA.
It is also the single biggest limitation, and I would not pretend otherwise.

---

## 4. Decisions worth defending

**Grade ceiling enforced at the point of use, not at each grant.**
The band (`k_1` ≤ grade 1, `g2_3` ≤ 3, `g4_5` ≤ 5) originally gated *acquisition* — which cannons
you could earn. It did not gate question selection. A chest-granted cannon therefore leaked grade-2
maths to a K-1 child, and multiplication stayed out only by luck: the chest can grant exactly one
gun, and the × and ÷ guns unlock by a different path. One content edit would have changed that.

The fix puts one rule (`asksInBand`) where questions are actually chosen. Acquisition gates are
leaky by construction — every future grant path has to remember. A gate at the point of use cannot
be forgotten.

**Determinism and idempotence.**
Duels run from a seeded RNG, so a seed replays exactly. Rewards are keyed by `duel:<id>` in a
receipt ledger, so settling twice pays once. This was built for correctness, but it is also the
foundation for sync: merging two devices is a union of receipts and a replay, not conflict
resolution.

**Content as validated data.**
Islands, cannons, skills and question templates are JSON, parsed through zod at import. Malformed
content throws at startup and fails a test rather than reaching a child. Templates use **static
imports, never `fs`** — a directory read works in the Node test runner and breaks under Metro on a
device, which is the worst kind of bug because every gate stays green.

**Tests as a specification.**
Cases are named `spec(TICKET:AC-n)` and tied to acceptance criteria. Where a component cannot be
rendered headless, the test reads the **source AST** instead — proving, for example, that the chart
actually consumes the navigation model rather than merely declaring it. New tests are
**mutation-verified**: break the behaviour, watch the test fail, restore it. A test that passes for
free is worse than no test, and this project shipped one that measured a component nobody had
written and certified the bug it was meant to catch.

**Accessibility as a measured constraint.**
Contrast ratios are computed, not eyeballed, and four specific pairs are banned in tokens with their
measured values. Minimum tap target is 64pt, above the 44pt platform norm, because the users are
five. Where a design needs a small visual, the ink stays small and `hitSlop` carries the target to
64.

---

## 5. What breaks at scale — in the order it breaks

**1. Write amplification.** The root layout persists on *every* store change, and a duel produces
30–50 of them in about two minutes. Each write serialises the whole captain. On AsyncStorage that is
main-thread JSON plus a bridge write, repeatedly, mid-duel. On Firestore it would hit the
~1-write-per-second-per-document soft limit and contend with itself — **this breaks with one user.**
Fix: debounce, and write at meaningful checkpoints.

**2. The document grows without bound.** `rewardReceipts` is only ever appended. Measured: a
400-duel captain is 17.7 KB, ~80% receipts. Combined with (1), **the most engaged players get the
slowest app** — the exact inversion you do not want. Fix: roll up to a counter plus a bounded recent
window.

**3. No accounts, no sync, no recovery.** One key, one device. A shared classroom tablet is one
shared captain; a lost phone is lost progress. Disqualifying for schools.

**4. No telemetry.** For an *educational* product this may be the real gap: you cannot answer which
skill is too hard, where children quit, or whether placement worked. The pedagogy is the product,
and it is currently unmeasured.

**5. Client authority.** Coins, wins, mastery and unlocks are computed and stored locally. Correct
for offline solo play; every number is forgeable the moment anything is compared. Receipts guard
double-apply, not a tampered save.

**6. Leaderboards are a cliff, and Firestore is the wrong tool for them.** There is no efficient
"what is my rank" query — position among thousands means reading everything above you. The honest
answers are batch-computed rank buckets or a Redis sorted set. For under-13s it also drags in COPPA.

**Cost is not the first thing that breaks.** 1,000 DAU × ~50 writes/session ≈ 50k writes/day ≈ **9
cents/day** on Firestore. Anyone who answers "it gets expensive" has not done the arithmetic. The
constraints are write *shape*, ranking, and trust.

### If it had to scale tomorrow

1. Debounce persistence and bound the receipt log. Hours of work, no backend, removes a bug that
   worsens with engagement.
2. Anonymous auth + a captain document, using the existing `KeyValueStore` seam. Sync is a union of
   receipts because the idempotence primitive already exists.
3. Security rules as **invariants** — wins monotonic, coin deltas bounded, mastery non-decreasing —
   rather than moving settlement into Cloud Functions and paying latency and cold starts on every
   duel. Cheating yourself in a maths game is self-limiting.
4. Telemetry before features. You cannot tune difficulty you cannot see.
5. Leaderboards last, on the right datastore, with the compliance question answered first.

---

## 6. Weaknesses to raise before they are found

Owning these is stronger than being caught by them.

- **The backend is scaffolding.** `firebase.ts` and `auth.ts` are imported by nothing. The shape of
  a backend exists with no implementation behind it.
- **~35 tests currently fail.** 15 are a long-standing baseline; ~20 are stale assertions describing
  rules that were deliberately changed — the old placement rule and the old duel-vs-drill weighting.
  Not regressions, but they should be re-baselined with the decision recorded, not left red.
- **No CI.** Gates are local and therefore skippable.
- **English only**, and copy is spread across screens rather than centralised except for onboarding.
- **Store submission is unconfigured** — placeholders in `eas.json`.
- **The grade band is set once** and can only be changed by resetting the captain.

---

## 7. Questions to expect

**"Why React Native rather than native or a web game?"**
One codebase across iOS, Android and web, and the web build is the demo path — a reviewer plays it
in a browser with no install. The cost is animation performance, which is why motion uses Reanimated
worklets on the UI thread, and a test pins the exact inventory of animated-style callbacks so new
animation cannot silently land on the JS thread.

**"Why no backend?"**
Product fit and privacy. A maths game for children should work offline, and collecting nothing is a
genuine advantage under COPPA. It is also the main limitation — no sync, no recovery, no
measurement — and the storage seam exists precisely so that decision is reversible.

**"How do you know a K-1 child never sees multiplication?"**
A test drives real duels for all three bands to terminal state and asserts on the questions actually
generated, by skill `minGrade` and by glyph. That guarantee used to hold by accident; it now holds
by a rule at the point of use.

**"What was the hardest bug?"**
A class of bug rather than one: design-board mock data shipped as application state. The board draws
one captain standing at one island and captions it "YOU ARE HERE" — transcribed literally, that
became a permanent second marker, so two islands claimed it. Same root cause as a decorative dash
that became a route pointing at open water. The lesson is to ask of every transcribed constant:
*what does this mean when the captain moves?*

**"What would you do differently?"**
Merge to `main` continuously. The project ran two long-lived tracks — engine and app — and only the
engine was ever promoted, so the default branch showed planning and an engine with no application.
The work was real and the packaging hid it. Trunk-based development, or at minimum a default branch
that points where the work actually is.
