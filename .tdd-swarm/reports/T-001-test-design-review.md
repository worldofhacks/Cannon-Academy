# T-001 — Frozen-test design review

**Ticket:** `/Users/quietguy/Documents/Dev/Gauntlet/Math Game/tickets/T-001.md` (main repo copy — authoritative)
**Tests under review:** `/Users/quietguy/Documents/Dev/Gauntlet/cannon-wt/wt-T-001/__tests__/engine/rng.test.ts`
**Reviewer:** independent test-design review, pre-freeze
**Date:** 2026-07-27

**Verdict: DO NOT FREEZE.** Three Critical gaps. The arithmetic core is correct — the fixes are
additive, not a rewrite.

---

## 0. Method, and what I actually executed

This review is not a read-through. I reconstructed the ticket's mulberry32 stream in Node and ran
candidate *cheating* implementations of every export against the exact seeds, sample counts and
tolerance bands the frozen tests use, to measure which cheats survive. I also built a
straightforward correct `src/engine/rng.ts` in a throwaway sandbox (symlinked `node_modules`, the
project's own `vitest.config.ts`) and ran the frozen file against it end to end.

Result of that last run: **all 23 tests pass, 2,841 ms.** So no band in this file is too tight, and
nothing in it is unsatisfiable. Every finding below is about tests that are too *weak*, not too
strict.

Two structural facts worth stating up front, because they organise everything else:

- **AC-3 pins `nextFloat` exactly.** A known-answer test against an independent oracle, `===`, no
  tolerance, four seeds, 100 draws each. `nextFloat` cannot be faked. Every other `nextFloat`
  assertion in the file (AC-1, AC-2, AC-4, AC-12) is redundant belt-and-braces on top of it.
- **AC-3 pins nothing about the four derived helpers.** `nextInt`, `shuffle`, `pick` and
  `weightedPick` — the four functions that T-005/T-007/T-008/T-009/T-021 actually call — are
  constrained *only* by the statistical bands and the error cases. That is precisely where the
  suite is weakest, and all three Critical findings live there.

---

## 1. Criterion coverage — CLEAN

I checked each of AC-1…AC-12 against its test, clause by clause. **All twelve are genuinely
encoded, not gestured at.** Numeric bounds, sample counts, seeds and error types are transcribed
faithfully in every case:

| AC | Test | Verdict |
|---|---|---|
| AC-1 | `rng.test.ts:55-61` | 1,000 draws, two `createRng(seed)`, element-wise — exact |
| AC-2 | `rng.test.ts:77-81` | seeds 1/2, 10 draws, `not.toEqual` — exact |
| AC-3 | `rng.test.ts:85-96` | seeds 0/1/42/4294967295, 100 draws, `toBe` per element — exact |
| AC-4 | `rng.test.ts:100-117` | 100,000 draws, seed 12345, `0 <= v < 1`, mean in [0.49,0.51] — exact |
| AC-5 | `rng.test.ts:121-142` | 60,000, seed 777, integers in [1,6], per-face [9000,11000] — exact |
| AC-6 | `rng.test.ts:144-154` | returns 5, state advances, input unmutated — exact |
| AC-7 | `rng.test.ts:156-169` | three tests: `min>max`, non-integer min, non-integer max — exact |
| AC-8 | `rng.test.ts:173-207` | new array, unmutated input, permutation, idx-0 [700,1300] — exact |
| AC-9 | `rng.test.ts:211-220` | empty throws `RangeError`, single returns element — exact |
| AC-10 | `rng.test.ts:224-243` | 20,000, seed 2026, `b` in [14000,16000], only a/b — exact, and uses the locked `item` field |
| AC-11 | `rng.test.ts:245-273` | four tests: empty, negative, all-zero, single-zero — exact |
| AC-12 | `rng.test.ts:277-292` | JSON round-trip on a *non-initial* state, 50 subsequent draws — exact, and the "advance 5 first" refinement is better than the AC required |

`spec-lint.sh` will pass in both directions: every AC has ≥1 `spec(T-001:AC-n)` tag, and the file
cites criteria throughout.

I also confirmed the tests were written against the **authoritative main-repo ticket**, not the
stale worktree copy. `diff` shows the worktree's `tickets/T-001.md` still has the API decisions as
`proposed` and AC-10 written as `weights [{a,1},{b,3}]` with no `item`/`value` ruling. The test file
uses `{ item, weight }` at `rng.test.ts:225-228` — i.e. it follows the newer, locked main-repo
decision. **L-008's failure mode did not recur here.**

The gaps in this module are therefore *not* AC-to-test translation failures. They are gaps in what
the ACs themselves ask for — which is exactly what a pre-freeze review is for, since the tests are
what actually binds the implementer.

---

## 2. Would a lazy or adversarial implementation pass? — THREE CRITICAL HOLES

All numbers below are measured, driving the cheat implementations off the ticket's own mulberry32
stream at the seeds and trial counts the frozen tests use.

### Cheats the suite **does** catch (verified)

| Cheat | Outcome |
|---|---|
| Constant / trivially-incrementing `nextFloat` | Killed by AC-3 (exact known-answer, 4 seeds) |
| `nextInt` off-by-one high (`min + floor(f*(max-min))`) | face 6 → 0 counts, fails |
| `nextInt` off-by-one low (`ceil`) | face 1 → 0 counts, fails |
| `nextInt` naive `Math.round` (edge bias) | faces 1/6 → 5,956/5,929, fails |
| `weightedPick` ignoring weights entirely | b = 9,938 < 14,000, fails |
| `weightedPick` always-last | b = 20,000 > 16,000, fails |
| `shuffle` via `sort(() => rnd()-0.5)` | idx-0 counts 569–1905, fails the band |
| `shuffle` that forgets to thread the rng inside the swap loop | idx-0 counts 0–5039, fails |
| Mutation-in-place of the input `Rng` by `nextFloat` / `nextInt` / `shuffle` | caught at `:74`, `:153`, `:183` |
| Wrong-reason `RangeError` (e.g. validating only `total<=0`, or only `weight<0`) | AC-11's four cases cover both directions |

That is a real and non-trivial amount of adversarial coverage. The error-case suite in particular
(`rng.test.ts:245-273`) is well constructed — it pins both halves of the validation, so an
implementation cannot satisfy it with a single sloppy check.

### CRITICAL C-1 — `shuffle` uniformity is tested at index 0 only. A one-swap "shuffle" passes.

`rng.test.ts:186-207` (with `:173-184`)

The only uniformity assertion is on `result[0]` (`:195`). Measured against the ticket's stream,
seed 99, 10 elements, 10,000 trials:

| Implementation | idx-0 count range | AC-8 band [700,1300] | count range across **all 10** indices |
|---|---|---|---|
| correct Fisher-Yates (descending) | 937–1040 | PASS | 903–1104 |
| correct Fisher-Yates (ascending) | 956–1054 | PASS | 923–1086 |
| **`BIASED_oneSwap`** — swap `[0]` with one random index, leave 1–9 in input order | **946–1050** | **PASS** | **0–8987** |
| **`BIASED_naiveSwap`** — classic n-pass biased swap | **734–1281** | **PASS** (by 34 counts) | 734–1291 |

`BIASED_oneSwap` also passes `:173-184` in full: it returns a new array, does not mutate the input,
is a genuine permutation, and advances the `Rng`. **It passes 100% of the frozen shuffle contract
while leaving nine of ten positions in their original order.**

**The cheat this permits, concretely:** `tickets/T-007.md:57-58` builds the four answer choices and
calls `shuffle(rng, choices)`, setting `correctIndex` to the post-shuffle index of the answer. With
a one-swap or naive-swap `shuffle` frozen into the foundation, the correct answer's slot is
predictable for three of the four positions. A child learns the position, not the math. That is the
"the game teaches wrong math" catastrophe class named in `.tdd-swarm/posture.md`, arriving through a
test that certified the bug. Note also that `naiveSwap` clearing the band by 34 counts means the
[700,1300] band is not merely loose — it is *just* wide enough to bless a textbook-biased algorithm.

**Fix (verified against every legal variant):** add a full-permutation uniformity test on a
4-element array — 24,000 shuffles threaded from `createRng(99)`, assert exactly 24 distinct
permutations are observed and every permutation count is in **[850, 1150]**. Measured:

- all four legal implementations (Fisher-Yates ascending **and** descending, `nextInt` by
  `floor(f*range)` **and** by rejection sampling): 923–1057 — all pass with margin;
- `BIASED_naiveSwap`: 703–1493 — fails;
- `BIASED_oneSwap`: produces only 4 of 24 permutations — fails.

Keep the existing n=10 idx-0 test as well, and add the same [700,1300] assertion at a second index
(e.g. index 5) as a cheap second gate. Add a matching clause to AC-8.

### CRITICAL C-2 — Purity is asserted for `nextFloat` only. A `nextInt` that ignores the PRNG passes.

`rng.test.ts:63-75` is the only repeat-call determinism test in the file, and it covers `nextFloat`.
`nextInt` (`:144-154`) checks that the *input* object is unmutated but never calls twice.
`shuffle`, `pick` and `weightedPick` have no purity check at all. AC-12 (`:277-292`) round-trips only
the `nextFloat` stream.

Measured: a `nextInt` that advances the `Rng` correctly but derives its **value** from a
module-scoped counter — `min + (n++ % (max-min+1))` — produces per-face counts of exactly
`[10000, 10000, 10000, 10000, 10000, 10000]` for AC-5, returns `5` for AC-6, and throws correctly for
all three AC-7 cases. **It passes every test in the file.**

That implementation is deterministic per process but not a function of the serialised `Rng`, so a
duel replayed from `{seed, action log}` after a relaunch diverges — destroying the exact property
the module exists to provide (ticket Context lines 26-33; DoD line 118, "no closures are returned
from any export"). The suite would certify it.

**Fix:** generalise the excellent pattern already at `:63-75` to all five draw functions. For each
of `nextFloat`, `nextInt`, `shuffle`, `pick`, `weightedPick`: call it twice from the same
un-reassigned `Rng` and assert (a) the values are identical, (b) the returned `Rng` values are
`toEqual`, and (c) the input's `state` is unchanged. Five short assertions kill the entire class of
hidden-state cheats at once. Add this as an explicit **AC-13** (see M-1 — today the one purity test
that exists is not backed by any criterion).

### CRITICAL C-3 — `pick` is never exercised on more than one element. `items[0]` passes.

`rng.test.ts:210-221`. AC-9 (`tickets/T-001.md:88`) specifies only the empty case and the
single-element case, and the tests encode exactly that. The consequence:

- a `pick` that always returns `items[0]` passes the entire frozen contract;
- the single-element test (`:218`) destructures only `[value]`, so **`pick`'s tuple return shape and
  its `Rng` advancement are completely unasserted** — `pick` could return a bare value and pass.

Both consumers pick from real multi-element pools: `tickets/T-007.md:45` calls `pick(rng, eligible)`
over a pool of up to 8 templates (this is *the* template-variety mechanism), and
`tickets/T-021.md:67` has the bot choose its cannon from `loadout` via `pick`. A constant `pick`
means every question comes from the same template and every bot fires the same gun, forever.

**Fix:** add a uniformity test — 10,000 `pick`s from a 10-element array, threading the returned
`Rng` from `createRng(5)`, assert every element's count is in **[900, 1100]**. Measured: a correct
implementation gives 949–1041; the `items[0]` cheat gives 0/10000. Also assert the returned tuple's
`Rng` advances and that repeat calls from the same `Rng` agree (C-2). Extend AC-9 accordingly.

---

## 3. Statistical assertions — bands are loose but sound for `nextFloat`/`nextInt`/`weightedPick`; unsound for `shuffle`

Because the seeds are fixed and `nextFloat` is pinned exactly by AC-3, **none of these tests can
flake** — they are deterministic. Flake risk is zero across the board. The only question that
matters is power.

| AC | Band | Slack vs σ | Power verdict |
|---|---|---|---|
| AC-4 mean | [0.49, 0.51] | σ(mean)=0.00091 → **±11σ** | Weak on its own (a constant 0.5 generator passes) but harmless: AC-3 already pins `nextFloat` exactly. Measured actual: **0.500675**. |
| AC-5 per-face | [9000, 11000] | σ=91.3 → **±11σ** | Loose, but every realistic bias fails it by a wide margin (see §2 table). Modulo bias at range 6 from a 32-bit source is ~1e-9 and undetectable at any sample size, so the extra width costs nothing real. **Sound.** |
| AC-8 idx-0 | [700, 1300] | σ=30 → **±10σ** | **Unsound — see C-1.** Certifies `naiveSwap` (734–1281) and `oneSwap` (946–1050). |
| AC-10 `b` count | [14000, 16000] | σ=61.2 → **±16σ** | Loose, but both weight-ignoring cheats fail it decisively (9,938 and 20,000). **Sound.** |

**Seed-luck / legal-reordering check — CLEAN.** I ran each band against every legal implementation
variant I could construct, to see whether any band depends on one seed's luck in a way a different
but valid internal ordering would break:

- **AC-5**: `floor(f*range)` → `[10033, 9972, 10041, 9858, 10130, 9966]`; rejection sampling →
  `[9916, 10050, 10042, 10028, 9930, 10034]`. Both comfortably inside. (A [9500,10500] band would
  still admit both and halve the slack, if you want more power for free.)
- **AC-8**: descending Fisher-Yates 937–1040; ascending 956–1054; with rejection-sampled `nextInt`
  934–1057. All inside.
- **AC-10**: forward cumulative scan → b = 14,887; reverse scan → b = 14,993. Both inside.

No band is fragile to a legal implementation choice. That dimension is clean.

---

## 4. Behavior vs implementation detail — CLEAN

Nothing in the file asserts an internal derivation. Specifically checked:

- `rng.test.ts:73` compares `Rng` values with `toEqual`, not `toBe` — correctly declines to pin
  object identity, so an implementation that returns a fresh object per call is fine.
- Nothing pins *how* `nextInt` maps a float to a range, *which direction* `shuffle` iterates, or
  *which end* `weightedPick` scans from. Verified empirically that all these variants pass.
- The locked contract items — `Rng = { readonly state: number }`, `[value, nextRng]` tuples,
  `{ item, weight }` entries — are exercised through the public API and nothing beyond them.

One item that *looks* like over-constraint but is not: `rng.test.ts:151` requires
`nextInt(rng, 5, 5)` to advance the `Rng`, which forbids the natural `if (min === max) return [min,
rng]` shortcut. That is AC-6's explicit and deliberate requirement (uniform stream consumption keeps
replay stable), correctly encoded. Not a defect.

---

## 5. The reference implementation (`referenceMulberry32Step`) — CLEAN. Verified two ways.

**This is the highest-risk item in the review and I checked it character by character.**

Comparing `rng.test.ts:21-27` against the pseudocode at `tickets/T-001.md:40-46`, operator by
operator:

| Ticket line | Test line | Match |
|---|---|---|
| `a = (a + 0x6D2B79F5) \| 0` | `const a = (state + 0x6d2b79f5) \| 0;` | identical (hex case only) |
| `t = Math.imul(a ^ (a >>> 15), 1 \| a)` | `let t = Math.imul(a ^ (a >>> 15), 1 \| a);` | identical — `>>>` not `>>`, shift 15, `1 \| a` |
| `t = (t + Math.imul(t ^ (t >>> 7), 61 \| t)) ^ t` | `t = (t + Math.imul(t ^ (t >>> 7), 61 \| t)) ^ t;` | identical — including the parenthesisation that makes the addition bind before the final `^ t` |
| `output = ((t ^ (t >>> 14)) >>> 0) / 4294967296` | `const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;` | identical — shift 14, `>>> 0` before the divide, divisor exactly 2³² |
| `nextState = a` | `return { value, nextState: a };` | identical — the **post**-add value, not the pre-add state |

I then executed the oracle against the canonical published mulberry32 (which writes `a |= 0` before
the add) for 200 draws each across seeds `0, 1, 42, 4294967295, 123456789, 2026, 777, 99, 12345, -1,
2147483647` — **0 mismatches.** The omitted leading `a |= 0` is provably safe: `(x + k) | 0` is
`ToInt32` of a sum exact below 2⁵³, so the truncation happens either way. This matters because AC-3
includes seed `4294967295`, the exact case where the two forms could have diverged; they do not.

The driver at `rng.test.ts:29-38` is also correct: it emits the value derived from the *current*
state and then adopts `nextState`, so the first emitted value is the one derived from the seed
itself — matching AC-3's "advanced 100 times" and matching what any natural `createRng(seed)` +
`nextFloat` implementation produces.

**The oracle is correct. No wrong math is being frozen into the foundation.**

---

## 6. Coverage in both directions

**Tested but no criterion asks for it** (all benign, all worth keeping):

- `rng.test.ts:63-75` — the no-hidden-mutation purity test. See M-1: it is tagged
  `spec(T-001:AC-1)`, but AC-1 says only that two `createRng(s)` calls produce identical sequences.
  The single strongest anti-cheat test in the file is not backed by any criterion.
- `rng.test.ts:107` — `Number.isFinite`, beyond AC-4. Harmless.
- `rng.test.ts:183` — `shuffle` advances the `Rng`, beyond AC-8. Correct, but unstated; fold into
  the new purity AC.

**Asked but not covered:** nothing. Every clause of every AC is encoded (§1).

**Not asked and not covered — the real gaps:** `pick` uniformity (C-3), purity of the four derived
helpers (C-2), `shuffle` uniformity beyond index 0 (C-1), and zero-weight-among-positives (I-1).

---

## Findings by severity

### Critical — must fix before freeze

**C-1 · `rng.test.ts:186-207`** — `shuffle` uniformity checked at index 0 only. A one-swap shuffle
(946–1050 at idx 0, 0–8987 across all indices) and the classic biased n-pass swap (734–1281) both
pass the full frozen shuffle contract. Permits a `shuffle` that leaves the answer slot predictable
in T-007's four-choice assembly. **Fix:** add a 4-element full-permutation test, 24,000 trials from
`createRng(99)`, all 24 permutations present and each count in [850,1150] — verified to admit all
four legal Fisher-Yates variants (923–1057) and reject both biased ones. Add a second-index
assertion to the existing n=10 test. Extend AC-8.

**C-2 · `rng.test.ts:63-75` (scope), `:144-154`, `:172-207`, `:210-221`, `:223-243`** — repeat-call
purity is asserted for `nextFloat` only. A `nextInt` deriving its value from a module-scoped counter
scores a perfect `[10000×6]` on AC-5 and passes the entire suite while breaking replay-from-seed —
the module's whole purpose. **Fix:** apply the `:63-75` pattern (same un-reassigned `Rng`, twice,
identical value + identical returned `Rng` + unchanged input `state`) to all five draw functions.
Add AC-13.

**C-3 · `rng.test.ts:210-221`** — `pick` is only tested on `[]` and `[42]`. A `pick` returning
`items[0]` always, or returning a bare value instead of a tuple, passes. Breaks T-007's template
variety (`tickets/T-007.md:45`) and T-021's bot cannon choice (`tickets/T-021.md:67`). **Fix:**
10,000 threaded picks from a 10-element array, seed 5, each element in [900,1100] (correct impl:
949–1041; cheat: 0/10000); assert the returned tuple advances the `Rng`. Extend AC-9.

### Important — should fix before freeze

**I-1 · `rng.test.ts:245-273`** — a zero weight *among positive weights* is unspecified and
untested. AC-11 covers empty / negative / all-zero only, so an implementation that throws
`RangeError` on any zero weight and one that can *select* the zero-weight item both pass.
`tickets/T-009.md:53-63` builds `CHEST_RARITY_ENTRIES` from `CHEST_RARITY_WEIGHTS` in `tuning.ts`,
where a rarity weight of 0 is a legal tuning value — so this freezes an ambiguity that will surface
in wave 3 as either a crash or a silently-awarded disabled rarity. This is L-005 and L-009 in
combination: a permissive spec that names only what it rejects. **Fix:** one test —
`weightedPick(rng, [{item:'z',weight:0},{item:'p',weight:1}])` must not throw and must return `'p'`
on all 5,000 threaded draws. Add the clause to AC-11.

**I-2 · `rng.test.ts:174, 187, 213, 218, 225-228`** — every array passed to `shuffle`, `pick` and
`weightedPick` is mutable, so nothing forces `readonly` parameter types. But
`tickets/T-009.md:56` declares `CHEST_RARITY_ENTRIES: readonly { item: ChestRarity; weight: number }[]`
and passes it to `weightedPick`; `tickets/T-007.md:33,45` passes a pool derived from
`readonly Template[]` to `pick`; `tickets/T-021.md:58,67` passes `readonly CannonId[]`. If the T-001
implementer types these as mutable `T[]`, T-001 goes green and three downstream tickets fail `tsc`
two waves later against a contract that can no longer be edited — the L-004/L-005 shape exactly.
**Fix:** annotate the test fixtures as `readonly` (`const items: readonly number[] = […]`,
`const entries: readonly { item: string; weight: number }[] = […]`). Compile-time only; zero runtime
cost.

### Minor — note only

**M-1 · `rng.test.ts:63-75`** — tagged `spec(T-001:AC-1)` but asserts a property AC-1 does not
state. `spec-lint.sh` passes either way, but an implementer disputing the test has the literal
reading on their side. Resolved by adding the AC-13 proposed in C-2.

**M-2 · `rng.test.ts:183`** — `shuffle` advancing the `Rng` is beyond AC-8. Correct for a 10-element
array; fold into AC-13 rather than leaving it unstated.

**M-3 · `rng.test.ts:216-220`** — the single-element `pick` test catches an off-by-one high bound
(`nextInt(rng, 0, items.length)`) only by seed luck: `createRng(1)`'s first float is 0.6270739, so
the bug indexes out of bounds and fails. Under `createRng(99)` (0.2604) or `createRng(2026)` (0.4554)
the same bug would return `items[0]` and pass. Deterministic, so not a flake — but the catch is
incidental, not designed. C-3's uniformity test removes the dependence.

**M-4 · `rng.test.ts:107-110, 130-133`** — three `expect()` calls inside a 100,000-iteration loop
(1,419 ms) and a 60,000-iteration loop (1,152 ms); ~500k assertions, 2,841 ms for the file.
Acceptable, but accumulating violations and asserting once outside the loop would cut it ~10× on a
file that runs in every local and repo gate.

**M-5 · `rng.test.ts:286-287`** — AC-12 asserts round-trip equality but never that `state` is a
`number` or that `Rng` has exactly one key. `toEqual` does catch a function-valued property, so the
closure ban is effectively covered; `expect(Object.keys(rng)).toEqual(['state'])` plus a `typeof`
check would pin the locked `{ readonly state: number }` shape directly.

**M-6 · `rng.test.ts:172-207`** — `shuffle` on empty and single-element arrays is untested (not in
AC-8). T-007 always shuffles exactly 4, so risk is low.

**M-7 · `rng.test.ts:156-169, 211-214, 245-273`** — error tests assert the type but never the
message. Cross-test coverage (happy paths in the same describe blocks) rules out "throws always", so
wrong-reason throws are adequately constrained — except for the zero-weight case in I-1.

---

## Dimensions that are genuinely clean

Stated plainly, without manufactured findings:

- **The oracle (§5).** Verified character by character against the ticket pseudocode and executed
  against canonical mulberry32 across 11 seeds × 200 draws with 0 mismatches, including the
  `4294967295` edge case. Correct.
- **AC-to-test translation (§1).** All twelve criteria faithfully encoded, no gestures, and written
  against the authoritative main-repo ticket rather than the stale worktree copy.
- **Behavior vs implementation detail (§4).** Nothing over-constrains a valid alternative
  implementation; verified empirically across shuffle direction, `nextInt` sampling method and
  `weightedPick` scan direction.
- **Band stability (§3).** Zero flake risk (fixed seeds, exact `nextFloat`), and no band depends on
  a legal implementation choice. The straightforward correct implementation passes all 23 tests.
- **`nextInt` and `weightedPick` error-case design.** AC-7 and AC-11 pin both directions of
  validation; a single sloppy check cannot satisfy them.

---

## Verdict

**DO NOT FREEZE.**

Three Critical findings, each of which admits an implementation that is not merely lazy but
functionally destroys a downstream feature: a `shuffle` that does not shuffle (C-1), a draw helper
that is not a function of the seed (C-2), and a `pick` that does not pick (C-3). All three are in
the four helpers that AC-3's exactness does not reach, and all three consume five downstream
tickets' worth of trust.

The remediation is small and fully specified above: roughly four new tests plus `readonly`
annotations on existing fixtures, and three AC amendments (extend AC-8, AC-9, AC-11; add AC-13). The
mulberry32 core — the one thing that would have been expensive to get wrong — is correct, so this is
additive work on a sound foundation. Re-review after the amendments, then freeze.
