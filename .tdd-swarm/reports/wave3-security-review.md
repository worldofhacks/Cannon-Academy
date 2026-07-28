# Wave-3 Security Review — Cannon Academy TDD Swarm

Reviewed: `git diff swarm/engine-core..HEAD -- src/` in each of the six wave-3 worktrees.

Scope note: this is an offline, single-player, K-5 educational game engine layer — no server,
no network, no accounts, no credentials. Findings below are limited to what actually applies:
dynamic code execution, determinism (banned `Math.random`/`Date` in `src/engine/**`),
prototype-chain / caller-controlled-key hazards, unbounded work, numeric integrity, mutation of
shared state, and secrets/dependency hygiene. SQL injection, XSS, CSRF, authz, SSRF, and network
deserialization do not apply to this layer and are not discussed further.

## T-005 — `src/engine/questions/distractors.ts`

New file, 191 lines. Builds the three wrong answers for a question from a template's declared
distractor expressions plus a fixed 9-rung "near-miss ladder," screened by `isPlausibleDistractor`.

- **Dynamic code execution**: none. The only "evaluator" touched is `evaluateNumber` from
  `@engine/questions/expr.ts` (pre-existing, unchanged by this diff), which is a hand-rolled
  tokenizer/parser/AST-walker with a closed six-function whitelist (`abs, floor, ceil, min, max,
  gcd`) resolved through a `Map`, never through property lookup on a JS object or built-in.
  Grepped `distractors.ts` for every spelling in scope (`eval`, `Function`, `constructor`,
  `require(`, `import(`, `setTimeout`, `setInterval`, `Math.random`, `new Date`, `Date.now`,
  `Reflect`) — no hits beyond incidental substrings in comments/identifiers (e.g. the word
  "function" inside `buildDistractors`).
- **Determinism**: confirmed structurally, not just by the module doc's claim — `buildDistractors`
  and `describeDistractorSources` take `(template, params)` only, no `Rng` parameter anywhere in
  the file, and the grep above shows no `Math.random`/`Date` access.
- **DoS / unbounded work**: the fill loop is bounded twice over — `template.distractors` (content,
  not user input) and the ladder (`ladderRungs`, hard-sliced to `MAX_DISTRACTOR_ATTEMPTS = 9`,
  matching the literal 9-entry ladder in `tuning.ts`) — both loops also `break` as soon as
  `DISTRACTORS_NEEDED` (3) candidates are accepted. At a degenerate zero answer, `tuning.ts`
  documents the analysis explicitly: `DISTRACTOR_ABS_FLOOR = 3` is sized so `{1, 2, 3}` are exactly
  the plausible ladder values available, which is why the ladder can still supply 3 distinct
  values at `answer === 0`. No loop depends on the magnitude of `answer`, so a huge-magnitude
  answer cannot inflate the loop — it only changes which fixed-size ladder entries pass the
  ratio test.
- **Numeric integrity**: `isPlausibleDistractor` rejects non-finite candidates first
  (`Number.isFinite`), then enforces integer/fractional type match with the answer, then rejects
  negative decoys against a non-negative answer, then the near-miss/ratio window — with the
  zero-answer division hazard explicitly short-circuited (`answer === 0` returns `false` rather
  than evaluating `|x|/0`). `buildInternal` throws `QuestionGenerationError` rather than degrading
  when three distinct plausible values can't be found — verified this cap is real, not merely
  hoped-for: the comment at distractors.ts:141-144 states it was probed (a 4-entry declared list
  would return 8 values without the `values.length >= DISTRACTORS_NEEDED` break).
- **Prototype-chain / caller-controlled keys**: not applicable — this module takes no
  caller-supplied object keys; `Params` is `Record<string, number>` read only by `evaluateNumber`,
  which resolves identifiers via `Object.hasOwn` (in `expr.ts`), not bare indexing.
- **Mutation of shared state**: `buildDistractors`/`describeDistractorSources` build fresh arrays
  every call; no cached or frozen catalog object is returned by reference for a caller to mutate.
- **Secrets/PII**: none found (grepped for credential/token/key patterns — no hits).

**No findings.**

## T-008 — `src/engine/duel/damage.ts`

New file, 142 lines. Resolves one duel volley's damage roll from a cannon's damage range, answer
correctness/speed, and one PRNG draw.

- **Dynamic code execution**: none — grepped the file for the full spelling list, no hits.
- **Determinism**: `elapsedMs` is an input parameter, never measured via `Date.now()`/`new Date()`
  inside this module (confirmed by grep and by reading the full file). The only randomness is the
  threaded `Rng` via `nextFloat(rng)` from `@engine/rng.ts`, which draws from mulberry32 — no
  `Math.random`. `nextFloat` is called exactly once per `resolveShot`, on both the correct and
  incorrect paths, preserving stream alignment for replay as the module doc claims.
- **DoS / unbounded work**: none — the function is straight-line arithmetic, no loops.
- **Numeric integrity** (the sharpest category, per the review brief, for this ticket):
  - `rollDamage = lower + Math.round(u * (cannon.damageMax - lower))`, where
    `lower = Math.min(Math.ceil(lowerRaw), cannon.damageMax)` and `u ∈ [0, 1)` from `nextFloat`
    (verified `nextFloat`'s doc and implementation in `rng.ts`: `value = (... >>> 0) / 4294967296`,
    strictly `< 1`). Since `lower <= cannon.damageMax` by construction and `u < 1`, `rollDamage`
    is bounded to `[lower, damageMax]` ⊆ `[damageMin, damageMax]`, and is always an integer because
    `Math.ceil`, `Math.min` of two integers, and `Math.round` of the second term are each integer.
  - The floor guarantee (`ANSWER_QUALITY_FLOOR` applied to the roll's lower bound, not just to
    `quality`) is explicitly the fix for a documented prior bug (module doc: "T-008 AC-15 is the
    frozen proof that this module does not do that") — i.e., a correct-but-slow answer cannot
    collapse to `damageMin` via `u → 0`.
  - Input validation guards `elapsedMs < 0` and `cannon.timerMs <= 0`, both throwing `RangeError`
    before any arithmetic runs, so a caller can't force a negative-duration or divide-by-zero
    path through `remaining = 1 - elapsedMs / timerMs`.
  - This module does not itself validate `cannon.damageMin <= cannon.damageMax` — that precondition
    is a T-003 catalog-schema concern (content data, not caller/user input in this offline game),
    and is out of this ticket's scope; noting it for completeness, not as a finding.
- **Prototype-chain / caller-controlled keys**: not applicable — no object-keyed lookups in this
  file.
- **Mutation of shared state**: `resolveShot` returns a freshly-constructed `ShotOutcome` object
  and the already-immutable `[value, Rng]` tuple from `nextFloat`; no shared/frozen object is
  exposed for mutation.
- **Secrets/PII**: none found.

**No findings.**

## T-009 — `src/engine/economy.ts`

New file, 82 lines. Prices a duel's coin payout and rolls chest rarity/coins.

- **Dynamic code execution**: none — grepped the file, no hits on any spelling.
- **Determinism**: `computeCoinPayout` is pure arithmetic over its input, no randomness at all.
  `rollChest` consumes randomness only via the threaded `Rng` (`weightedPick`, then `nextInt`),
  both from `@engine/rng.ts` — no `Math.random`/`Date`.
- **DoS / unbounded work**: `weightedPick` iterates `CHEST_RARITY_ENTRIES`, a fixed 3-entry array
  built from the catalog's `CHEST_RARITIES` id list — bounded, not user-influenced.
- **Numeric integrity**: `computeCoinPayout` validates `correctAnswers`, `totalAnswers`,
  `perfectShots` are all non-negative integers, and enforces `correctAnswers <= totalAnswers` and
  `perfectShots <= correctAnswers`, throwing `RangeError` otherwise. The payout formula
  (`base + accuracy-term + perfect-term`, all non-negative given validated inputs) is passed
  through `Math.round`, so the return is always an integer, always `> 0` (base alone is `20` or
  `5` per `tuning.ts`). `rollChest`'s coin amount comes from `nextInt(min, max)` over
  `CHEST_COIN_RANGE_BY_RARITY`, whose entries are validated integers in `tuning.ts` with
  `0 < min <= max`; `nextInt` itself throws on non-integer or `min > max` bounds.
- **Prototype-chain / caller-controlled keys**: `CHEST_RARITY_ENTRIES` is built by mapping over
  `CHEST_RARITIES` (a fixed content-schema array) and indexing `CHEST_RARITY_WEIGHTS[item]` — the
  key (`item`) comes only from that fixed compile-time array, never from external input, so this
  is not a caller-controlled-key scenario. `CHEST_COIN_RANGE_BY_RARITY[rarity]` is likewise keyed
  only by the `rarity` value `weightedPick` selected from that same fixed array.
- **Mutation of shared state**: `CHEST_RARITY_ENTRIES` is exported as `readonly` and built once at
  module load from already-frozen `tuning.ts` constants (`deepFreeze`'d); the array itself isn't
  frozen, but nothing in this diff or its consumers mutates it, and its entries are plain `{item,
  weight}` value objects rebuilt fresh, not shared catalog references.
- **Secrets/PII**: none found.

**No findings.**

## T-010 — `src/engine/mastery.ts`

New file, 133 lines. Dual-rate mastery counters, the mastery-threshold check, and unlock
resolution against the content catalog.

- **Dynamic code execution / determinism**: none — no randomness, no `Date`, no code-construction
  spellings found by grep.
- **DoS / unbounded work**: `masteredSkillIds` iterates `Object.keys(mastery)` (bounded by the
  fixed `SkillId` union — a handful of skills); `resolveUnlocks` filters the `cannons`/`islands`
  catalogs (fixed-size arrays). No unbounded recursion or loop.
- **Prototype-chain / caller-controlled keys** — this is the ticket the review brief specifically
  flags for probing (T-010 keys a mastery map by skill id). `masteredSkillIds` does
  `for (const skillId of Object.keys(mastery)) { const entry = mastery[skillId]; ... }` — a bare
  `mastery[skillId]` read. I probed this rather than reasoning about it abstractly:

  ```js
  const mastery = JSON.parse('{"__proto__":{"weightedCorrect":999,...},"constructor":{...},"add":{...}}');
  Object.keys(mastery)              // ['__proto__', 'constructor', 'add']
  Object.prototype.hasOwnProperty.call(mastery, '__proto__')   // true
  mastery['__proto__']              // { weightedCorrect: 999, ... }  (the JSON value, not a prototype)
  Object.getPrototypeOf(mastery) === Object.prototype   // true — unpolluted
  ```

  Because `JSON.parse` creates `"__proto__"` as an ordinary **own data property** (it does not
  route through the property-assignment path that would reinterpret it as a prototype set), and
  `Object.keys` only ever enumerates own properties, `mastery[skillId]` for every `skillId` drawn
  from `Object.keys(mastery)` reads back exactly that own property — never the object's actual
  prototype — regardless of whether the key text is `__proto__`, `constructor`, or `toString`.
  This pattern is safe for any object built by `JSON.parse` or an object literal with computed
  keys. It would **not** be safe if some other layer constructed the mastery map with a literal
  `{ __proto__: userValue }` object-literal expression (that syntax does set the prototype) or via
  `obj.__proto__ = value` assignment — but no such construction exists in this diff, and in this
  game `SkillId` keys only ever originate from the fixed content-schema `SkillId` union at
  call sites elsewhere in the engine, not from freeform user text. `getIsland` (used in
  `resolveUnlocks`) is the shared `@content/index.ts` helper, which uses `.find(i => i.id === id)`
  — a safe array-scan pattern, not bare indexing — confirmed by reading that file directly.
- **Numeric integrity**: `weightedCorrect` only ever increases by `MASTERY_RATE_RANGE` (1) or
  `MASTERY_RATE_DUEL` (0.5), both non-negative `tuning.ts` constants, starting from `0` — it can
  never go negative. `meterPercent` clamps its upper bound to `MASTERY_METER_MAX` via `Math.min`;
  no explicit lower clamp exists but none is needed since the input is provably non-negative.
  `accuracy` guards the zero-attempts case explicitly, returning `0` rather than `NaN` from `0/0`.
- **Mutation of shared state**: `emptyMastery` is exported `Object.freeze`'d and `applyAnswer`
  always returns a new object rather than mutating `m`, matching the doc's claim.
- **Secrets/PII**: none found.

**No findings.** (The `__proto__`-as-key scenario was probed and confirmed safe under this
module's actual read pattern; flagging the probe result rather than asserting safety on reasoning
alone, per L-015.)

## T-011 — `src/engine/placement.ts`

New file, 100 lines. Turns an onboarding grade-band answer into starting unlocks.

- **Dynamic code execution / determinism**: none — pure function of `band`, no randomness, no
  `Date`, no code-construction spellings found.
- **DoS / unbounded work**: filters/sorts fixed-size catalog arrays (`cannons`, `islands`) — bounded.
- **Prototype-chain / caller-controlled keys**: `resolvePlacement` does
  `MAX_GRADE_BY_BAND[band]` and `BOT_ACCURACY_BAND_BY_GRADE[band]`, both bare-indexed by `band`.
  This is guarded upstream: the function first checks
  `if (!(GRADE_BANDS as readonly string[]).includes(band)) throw ...` — `GRADE_BANDS` is the fixed
  three-element union (`k_1`, `g2_3`, `g4_5`); `Array.prototype.includes` does a `===` scan, so a
  value like `"__proto__"` or `"constructor"` fails the `includes` check (it is not one of the
  three literal strings) and throws before either indexing expression executes. Verified this is
  the actual runtime behavior of `includes` (exact string equality, no coercion), not merely typed
  away — `band`'s static `GradeBand` type doesn't prevent a runtime caller from passing an
  arbitrary string, but the explicit `includes` guard does. `getSkill` (used in
  `isIslandEligible`) is the shared `.find()`-based catalog helper — safe.
- **Numeric integrity**: `maxGrade` comes only from the fixed `MAX_GRADE_BY_BAND` map (values
  1/3/5); `botAccuracyBand` is copied field-by-field from the already-validated, frozen
  `tuning.ts` constant. No arithmetic that could produce `NaN`/`Infinity`/negatives here.
- **Mutation of shared state**: "no module-level cache is shared across calls" per the module doc
  — confirmed: every call rebuilds `unlockedCannons`/`unlockedIslands` via fresh `.filter().sort()`
  chains (which themselves `.slice()` before sorting, so the catalog's own arrays are never
  mutated) and a fresh `{ min, max }` object for `botAccuracyBand` rather than returning the
  `tuning.ts` object by reference.
- **Secrets/PII**: none found.

**No findings.**

## T-012 — `src/engine/ranks.ts`

New file, 119 lines. Numeric rank tier from cumulative wins, with a no-demotion ratchet.

- **Dynamic code execution / determinism**: none — no randomness, no `Date`, no code-construction
  spellings found.
- **DoS / unbounded work**: `rankTierForWins` does a single linear scan over `ranks` (a fixed,
  small catalog — 5 tiers) with no early-exit but no possibility of unbounded growth either, since
  `ranks` is a validated, static catalog array. Not a concern.
- **Prototype-chain / caller-controlled keys**: `rankByTier`/`getRankByTier` (the latter in shared
  `@content/index.ts`) resolve via `ranks.find(r => r.tier === tier)` — safe array-scan pattern,
  not object indexing. No bare `obj[key]` lookups anywhere in this file.
- **Numeric integrity**: `validateNonNegativeInteger` and `validateTier` (bounds `[0,4]`) guard
  every public entry point (`rankTierForWins`, `rankForWins`, `advanceRank`, and transitively
  `rankByTier`'s callers), throwing `RangeError` on negative, fractional, or out-of-range values.
  `advanceRank` returns `Math.max(currentTier, earnedTier)`, and since both inputs are validated
  integers in `[0,4]`, the result is always an integer in that same range — the ratchet (never
  demoting on a loss) is structurally guaranteed by `Math.max`, not by a conditional that could be
  gotten wrong.
- **Mutation of shared state**: no local caches or returned catalog references that a caller could
  mutate; `rankByTier` returns whatever `getRankByTier` returns (the catalog's own frozen-at-parse
  `Rank` object — catalog immutability is a T-003/`content/index.ts` concern, out of this ticket's
  diff, but nothing in `ranks.ts` copies/mutates it either way).
- **Secrets/PII**: none found.

**No findings.**

## Dependency / manifest check

`git diff --stat swarm/engine-core..HEAD -- package.json package-lock.json` produced no output in
any of the six worktrees — confirmed unchanged by this wave.

## Verdicts

- **T-005: PASS**
- **T-008: PASS**
- **T-009: PASS**
- **T-010: PASS**
- **T-011: PASS**
- **T-012: PASS**

No Critical, Important, or Minor findings across the six wave-3 diffs. This is a legitimate clean
result, not an incomplete review — every module was read in full, every banned-spelling grep run
directly against the new file (not trusted from memory), the shared `@content/index.ts` and
`@engine/rng.ts` helpers each of these tickets depends on were also read to confirm their lookup
and randomness patterns are safe, and the one place a caller-controlled key could plausibly reach
`Object.prototype` (T-010's `mastery[skillId]`) was probed with an actual `node -e` script rather
than argued from first principles.
