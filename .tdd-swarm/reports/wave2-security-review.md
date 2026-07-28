# Wave-2 Security Review — T-004 (`engine/tuning.ts`) and T-006 (content catalogs + loader)

Reviewer: Security Agent
Diffs reviewed: `git diff swarm/engine-core..HEAD -- src/` in `cannon-wt/wt-T-004` and `cannon-wt/wt-T-006`.

## Threat model scoping

This is an offline, single-player, no-network, no-account K-5 game. There is no server, no auth,
no user-supplied strings reaching these two modules at runtime — `tuning.ts` is pure constants and
`content/index.ts` loads catalogs the *developer* authored and bundled, not data a player can edit
or submit. Accordingly this review does **not** examine SQLi, XSS, CSRF, authz/IDOR, SSRF, or
network deserialization — there is no such surface in this diff, and I've confirmed that by
reading every line of both diffs rather than assuming it. What does apply here: mutable shared
state (tuning must not be alterable at runtime), prototype pollution (lookup helpers take
caller-supplied keys, even if today's callers are internal), dynamic code construction (banned
project-wide per L-013), determinism (`Math.random`/`Date` banned in this layer for duel replay),
and content-file leakage (URLs/PII/paths breaking ARCHITECTURE §4.4's airplane-mode requirement).

---

## 1. `content/index.ts` — malformed-catalog failure mode

**Finding: not a defect — a deliberate and tested trade-off. No action needed.**

`parseCatalog` runs at module top level for all five catalogs (`index.ts:71-75`) and throws
synchronously on the first invalid entry. In ES module semantics, a throw during top-level
evaluation fails the whole module's instantiation; a *static* `import` of `@content/index`
elsewhere in the app has no way to catch that — it's not a wrapped exception, it's a failed
module graph. So yes: a single malformed byte in a bundled catalog would hard-crash app startup
with no in-app recovery path.

For this product, that is the right trade, and the wave's own test suite proves it's exercised as
a build-time gate rather than a live risk: `__tests__/content/catalogs.test.ts` (T-006's frozen
suite) calls the exported `validateCatalogs(...)` against the actual shipped catalog objects
(`catalogs.test.ts:900-901`, AC-12: "the shipped catalogs pass validateCatalogs without
throwing") and separately against deliberately corrupted catalogs to confirm the error names the
right catalog/entry (`catalogs.test.ts:905-931`). It also confirms a real dynamic
`import('@content/index')` resolves cleanly today (`catalogs.test.ts:305`). Because these catalogs
are developer-authored, version-controlled, and covered by CI-run tests before ever reaching a
device, "fail loudly at build/test time, never partially load a corrupt catalog on a player's
device" (ARCHITECTURE.md §2, §4.4, as the module's own header states) is the correct posture, not
an inline `try/catch`-and-continue. Flagging as informational: if a future ticket wants the loader
to survive a *partially* bad catalog (e.g. skip one bad island, keep the rest) that would be a
product decision, not a security gap — today's all-or-nothing failure is safe, just not graceful.

## 2. Lookup helpers — prototype pollution

**Finding: safe. Verified by runtime probe, not just static reasoning (per L-015).**

`getCannon`, `getSkill`, `getIsland`, `getRankByTier` (`index.ts:78-100`) each do
`arrayOfFrozenObjects.find(x => x.field === key)` and throw if `find` returns `undefined`. This
pattern cannot walk into `Object.prototype`: it never does bracket/dynamic property access on an
object keyed by the caller's string (`obj[key]`), it only does `===` comparisons of the caller's
value against each element's `id`/`tier` field. `'__proto__' === 'add_within_10'` is simply
`false` for every real entry, so `find` correctly returns `undefined` and the helper throws.

I wrote and ran a disposable vitest probe (not committed) calling all four helpers with
`'__proto__'`, `'constructor'`, `'prototype'`, `'toString'`, `'hasOwnProperty'`, `'valueOf'`, plus
confirmed `Object.prototype` itself was untouched afterward:

```
✓ __tests__/content/_secprobe.test.ts (5 tests) 3ms
```

All four helpers threw for every polluting key; none returned a prototype member; `Object.prototype`
was unpolluted after the run. This matches the repo's own frozen suite, which independently tests
the same property (`catalogs.test.ts:851-881`, e.g. `getCannon(key as CannonId)).toThrow(...)` for
a list of dangerous keys). No `Map`/null-prototype rewrite is needed — the array+`.find` shape is
already immune to the class of bug this check is for.

No hand-rolled object merge, spread over caller input, or dynamic property write exists anywhere
in `index.ts`.

## 3. `tuning.ts` deep-freeze integrity

**Finding: sound. Verified by runtime probe.**

`deepFreeze` (`tuning.ts:19-29`) does `Object.freeze(value)` then recurses into
`Object.values(value)` for any unfrozen object child, so nested payloads (e.g.
`CHEST_COIN_RANGE_BY_RARITY.common`) get their own `Object.freeze` call, not just the parent
container. This is a real deep freeze, not a shallow one that only looks deep.

Disposable vitest probe (not committed), run against the actual built module:

```
✓ __tests__/engine/_secprobe.test.ts (6 tests) 8ms
```

Confirmed: (a) `CHEST_COIN_RANGE_BY_RARITY.common.min = 999` throws in strict mode and leaves the
value unchanged; (b) reassigning the top-level key `CHEST_COIN_RANGE_BY_RARITY.common = {...}`
throws; (c) `ENEMY_HULL_BY_ISLAND.port_sumwich = 9999` throws; (d)
`BOT_ACCURACY_BAND_BY_GRADE.k_1.min = 999` throws and value is unchanged; (e) `Object.isFrozen()`
is `true` at every level tested — outer record, and each of `common`/`uncommon`/`rare`,
`k_1`/`g2_3`/`g4_5`; (f) re-importing the module yields identical values (determinism holds).

The freezing helper itself isn't tricked by getters or non-enumerable properties in this diff: all
of `tuning.ts`'s frozen exports are plain object/array literals with only own, enumerable, plain
data properties (no getters, no `Object.defineProperty` with `enumerable: false` anywhere in the
file — confirmed by reading the whole 236-line file). A getter-trap or non-enumerable-property
attack surface doesn't exist here because nothing in this file constructs its frozen payloads that
way; that risk would only apply if a future ticket built `deepFreeze` inputs from less trusted
constructors.

## 4. Dynamic code construction

**Finding: none present in either diff, checked against more than the 3 lint-covered spellings.**

Per L-013, the project's lint only catches literal `eval(`/`new Function`/`Function` bindings, not
aliasing, computed access, or reflection. I grepped both diffs for the full spelling space named in
L-013 plus adjacent ones: `eval`, `Function`, `setTimeout`, `setInterval`, `require(`, `import(`,
`globalThis`, `getPrototypeOf`, `Reflect`, `constructor`, `.call(`, `.apply(`, `.bind(`, `atob`,
`btoa`, `WebAssembly`. Zero code hits in `tuning.ts` or `content/index.ts` (the only string matches
were the English word "requires" inside doc comments, not code). Both files are declarative:
`tuning.ts` is constant exports plus one recursive `Object.freeze` helper; `content/index.ts` is
static imports, `.map`/`.find`, and `throw new Error(...)`. There is no code construction surface
in this wave at all.

## 5. Determinism

**Finding: none present. `Math.random`/`Date` absent from both files (grep-confirmed), and
re-import equality was probe-confirmed for `tuning.ts` (see §3). `content/index.ts` has no
randomness or clock dependency to check — it is pure JSON-in, validated-typed-arrays-out.**

## 6. Catalog content — URLs / PII / credentials / absolute paths

**Finding: none. Clean.**

Read `cannons.json`, `crew.json`, `islands.json`, `ranks.json`, `skills.json` in full (they are
short — 7 to 132 lines each) and grepped all five for `https?://`, email-shaped strings, and
`/Users/`/`/home/`/`C:\` path fragments. No matches. Content is limited to id/displayName strings,
integers, and enum-shaped fields (`skill`, `temperament`, `unlock.kind`, etc.) — nothing that
touches network, filesystem, or personal data. ARCHITECTURE §4.4's airplane-mode requirement is
unaffected by this wave.

## 7. Dependency risk

**Finding: none. `package.json` and `package-lock.json` are byte-identical to
`swarm/engine-core` in both worktrees** — confirmed via `git diff swarm/engine-core..HEAD --
package.json package-lock.json` in each, both empty. `git diff --stat` confirms the wave only
touches `src/engine/tuning.ts` (T-004) and the five `src/content/*.json` files plus
`src/content/index.ts` (T-006), alongside their frozen test files and ticket/doc bookkeeping —
nothing else.

---

## Summary

No Critical or Important findings. One informational note (§1) documenting a real but
intentional and test-covered trade-off (hard-crash-on-malformed-bundled-catalog), which is the
correct posture for this product and not something I'm asking either ticket to change.

Both deep-freeze and prototype-pollution claims were verified with disposable, non-committed
vitest probes actually executed against the built modules (not just read and reasoned about),
per L-015. Both probe files were deleted after running; `git status --short` in each worktree
confirms no stray files remain from this review.

## Verdicts

- **T-004: PASS**
- **T-006: PASS**
