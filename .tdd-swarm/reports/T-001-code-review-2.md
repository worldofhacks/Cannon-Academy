# T-001 Code Review — Round 2 (re-review after fix commit `10ac7f9`)

**Reviewer:** independent code-review agent (same reviewer as `T-001-code-review.md`; did not author the implementation)
**Under review:** `/Users/quietguy/Documents/Dev/Gauntlet/cannon-wt/wt-T-001/src/engine/rng.ts` (135 lines)
**Ticket:** amended `tickets/T-001.md` — now 16 ACs (AC-15, AC-16 added; AC-11 extended)
**Fix commit:** `10ac7f9`, `src/engine/rng.ts` only (+23/−11). Preceded by test commit `2204de8`, `__tests__/engine/rng.test.ts` only (+83). **RED-first order preserved; the implementer touched no test file.**

| Round | Critical | Important | Minor |
|---|---|---|---|
| 1 | 0 | 1 (I-1) | 5 |
| **2** | **0** | **0** | **1 new (N-1), 2 carried out-of-scope (M-4, M-5)** |

Round-1 disposition: **I-1 fixed** · **M-1 fixed** · **M-2 fixed (with N-1 below)** · **M-3 fixed** · M-4/M-5 out of scope by orchestrator decision, not re-litigated.

---

## 1. The M-3 normalisation — **confirmed safe** (your question 1)

`rng.ts:33` now returns `{ state: nextState >>> 0 }`. Verified by proof first, probe second.

**Does `>>> 0` alter the sequence for any seed? No — provably.**

The step's first act is `a = (state + 0x6d2b79f5) | 0` (`:21`). `| 0` is `ToInt32`, i.e. reduce mod 2³² into `[−2³¹, 2³¹)`. So `a` depends on `state` **only through its residue class mod 2³²**, provided the addition `state + K` is exact in float64 — and it is: `|state| ≤ 2³²` and `K = 0x6D2B79F5 < 2³¹`, so `|state + K| < 2³³ ≪ 2⁵³`, exact in both the old int32 regime and the new uint32 regime. And `nextState >>> 0 ≡ nextState (mod 2³²)` by definition of `ToUint32`.

By induction: every state entering `mulberry32Step` is congruent mod 2³² to the state the un-normalised version would have supplied ⇒ `a` is **bit-identical at every step** ⇒ `t` and `value` are bit-identical. The normalisation changes the *representative*, never the *residue class*, and the step is insensitive to the representative precisely because it re-reduces with `| 0` on entry. **This is exactly the right place to normalise** — one line, at the single public boundary, downstream of the reduction that makes it a no-op.

**Empirical corroboration** (10 seeds — `0, 1, 42, 4294967295, 2147483647, 2147483648, 123456789, 999, 65535, 4294967294` — × 20,000 draws = 200,000 values), compared against a fresh un-normalised int32 transcription made directly from the ticket pseudocode:

- value mismatches: **0**
- states failing `Number.isInteger(s) && 0 ≤ s ≤ 0xFFFFFFFF`: **0**
- steps where `(rng.state | 0) !== referenceInt32State`: **0**

Independent third check: AC-3's in-test oracle (`__tests__/engine/rng.test.ts:35-42`) was **not** touched by the fix commit and is still the un-normalised int32 form — so the suite passing is itself evidence that normalisation left the stream alone.

**Is `Rng` genuinely a boxed uint32 in every reachable path? Yes.** Only two sites in the module construct an `Rng`: `createRng` (`:16`, `seed >>> 0`) and `nextFloat` (`:33`, `nextState >>> 0`). Every other export (`nextInt`, `shuffle`, `pick`, `weightedPick`) threads `nextFloat`'s output and never fabricates a state. The invariant therefore holds by construction and can only be broken by hand-writing an `Rng` literal.

**After JSON round-trip (AC-12): holds, and is now stronger.** A uint32 is exactly representable in float64; `JSON.stringify` emits a plain decimal integer and `JSON.parse` restores it exactly. Verified on an advanced state: `{"state":4231026098}` → round-trip equal, subsequent streams identical. Before the fix this AC was passing with negative int32 states; the persisted form is now unambiguously a non-negative integer, which is the shape T-013's persistence schema will want.

**Free side benefit:** AC-6's `rng1.state !== rng0.state` assertion is now uint32-vs-uint32 rather than uint32-seed-vs-int32-successor. The property held either way (`nextState = (state + K) mod 2³² ≠ state` since `K ≢ 0`), but the comparison is now apples-to-apples.

**Verdict: the change I was asked to scrutinise hardest is correct.** No divergence, no regression, no reachable path producing a non-uint32 state.

## 2. I-1's fix — correct **and complete** (your question 2)

`rng.ts:59-64`:

- The guard tests the **index** (`index < 0 || index >= arr.length`, `:60`) — the correct predicate. A legitimately-`undefined` element is now returned, not thrown on.
- The `as T` at `:63` is **the only type assertion in the file** (`grep` for ` as ` → one hit; for non-null `!` → zero hits), and it sits on the line *immediately* after the guard's closing brace, with the justification inline. That is a sound, audited assertion, not a silencing cast: the bounds are proven two lines above and nothing intervenes.
- The message now reads `index ${index} out of bounds (length ${arr.length})` — **accurate**, and it now carries the length, which is what a debugger actually needs.
- Completeness: `requireAt`'s only call sites are `shuffle` (`:76`, `:77`) and `pick` (`:90`). `i ∈ [1, len−1]`, `j ∈ [0, i]`, `index ∈ [0, len−1]` — all provably in bounds, so the guard cannot fire from inside the module. The third old call site (the `weightedPick` fallback) is gone with M-2.
- The doc comment (`:53-58`) explains *why* the predicate is index-based. That is the right thing to leave behind: the next person to "simplify" this helper is warned.

Re-probed: `shuffle(createRng(s), [undefined, 1, 2, 3])` and `pick(createRng(s), [undefined, 1, 2])` throw **0/50 seeds** (were 37/50 and 14/50), and all 50 shuffle results are valid permutations of the input multiset. `shuffle(rng, new Array(4))` returns a 4-length array instead of throwing.

**The AC-16 regression seed has teeth — verified, not taken on trust.** I re-implemented the *old* `requireAt` and replayed it against the *current* stream (proved identical in §1). At seed 0, all three AC-16 tests would have gone RED:

```
old impl @ seed 0: shuffle[undefined,1,2,3] -> THREW: index 0 out of bounds
old impl @ seed 0: pick[undefined,1,2]      -> THREW: index 0 out of bounds
old impl @ seed 0: shuffle(new Array(4))    -> THREW: index 3 out of bounds
```

## 3. AC-11 / AC-15 guards do not over-reject (your question 3)

`createRng` (`:13-15`), probed exhaustively at the boundaries:

| Seed | Result | |
|---|---|---|
| `0`, `1`, `-1`, `-0` | accepted (`0`, `1`, `4294967295`, `0`) | legal, per M-4 being out of scope |
| `4294967295`, `-4294967295` | accepted | AC-3's largest fixture seed is safe |
| `2147483648`, `-2147483648` | accepted | int32/uint32 boundary clean |
| `4294967296`, `-4294967296`, `2**33` | `RangeError` | AC-15 |
| `NaN`, `Infinity`, `-0.5` | `RangeError` | AC-15 |

No legal input is rejected; every seed used anywhere in the frozen suite (`0, 1, 2, 3, 5, 7, 11, 13, 17, 42, 99, 777, 2024, 2026, 12345, 123456789, 4294967295`) is accepted. The bound is written as `±0xFFFFFFFF` rather than `[−0x80000000, 0xFFFFFFFF]`, which is *permissive*, not restrictive — cosmetically odd, no functional consequence beyond widening the M-4 aliasing surface the orchestrator already scoped out.

`weightedPick` (`:108-110`): `!Number.isFinite(w) || w < 0` rejects `NaN`, `±Infinity`, and negatives. It does **not** touch anything legal — verified across 3,000 threaded draws each: `[{z,0},{p,1}]` never throws and never selects `z`; `[{a,1},{b,3}]` unaffected; even subnormal weights (`1e-320`) and a `1e-300 / 1e300` spread are accepted and behave correctly. The zero-among-positives proof from round 1 is untouched by this change (0 is finite and not `< 0`).

## 4. N-1 (Minor, new) — the M-2 invariant `throw` **is** reachable, in two regimes the comment says are impossible (your question 4)

`rng.ts:128-133`. The removal of the silent fallback is right, but the replacement asserts a proof that is false at two edges. Both are reachable with input this function *accepts* (every weight finite, non-negative, total > 0):

| Input | Result |
|---|---|
| `[{a, MAX_VALUE}, {b, MAX_VALUE}]` | `Error: internal invariant violated` — **3000/3000 draws** |
| `[{a, 5e-324}]` (single smallest subnormal) | throws **1496/3000 draws** |
| `[{a, 5e-324}, {b, 5e-324}]` | throws **730/3000 draws** |

Why the comment's proof fails:

1. *"every weight is finite ⇒ `total` is finite"* — **false**. Finite weights can sum to `Infinity` by overflow. `total <= 0` (`:113`) does not catch `Infinity`, so `target = f * Infinity` is `Infinity` (or `NaN` when `f === 0`), every `target < cumulative` is false, and control reaches `:133`.
2. *"`f < 1 ⇒ target = f * total < total`"* — **false at subnormal magnitudes**. My round-1 argument used a *relative* rounding bound (2⁻⁵³ ≪ 2⁻³²); at the denormal floor rounding is *absolute*, so `0.9 × 5e-324` rounds **up** to exactly `5e-324 === total`, and strict `<` then rejects the final entry.

Severity is **Minor**, deliberately:

- It is not reachable from any data path in this game. Weights come from `tuning.ts` as small integers (chest rarity), and nothing here produces a weight near `1e-323` or a sum near `1.8e308`.
- It is **not a regression**: on these exact inputs the pre-fix code silently returned the last entry. A loud throw is the better failure mode, and the round-1 finding was that the *silence* was the problem.
- The residue is a code-comment that overstates a proof, plus a thrown `Error` (not `RangeError`) that blames an internal invariant for what is in fact a caller-input condition, so a caller catching `RangeError` for bad weights won't catch it.

Recommended, in order of cost:

- **Zero-risk, no AC needed (a comment is not behaviour):** soften `:128-132` to state the actual precondition — "unreachable for finite `total` in the normal (non-subnormal) range" — and note the two edges. This alone clears the finding.
- **Optional, orchestrator's call (would need an AC to stay RED-first):** fold finiteness into the existing total check — `if (!Number.isFinite(total) || total <= 0) throw new RangeError('weightedPick: total weight must be finite and greater than 0')`. This closes the overflow regime and keeps the AC-11 error family consistent (`RangeError` for all caller-input faults). The subnormal regime would remain and is best handled by the comment.

Not blocking on its own, and I am explicitly **not** asking for production code that no failing test demands.

## 5. New Critical/Important introduced by this diff (your question 5)

**None.** Every one of the 23 added lines traces to an amended AC: `:13-15` → AC-15; `:108-109` → AC-11's non-finite clause; `:54-63` → AC-16; `:31-33` → M-3. The single line no AC demands is the invariant `throw` at `:133`, which replaced a fallback that no AC demanded either — net-neutral on the Iron Law, and it is the subject of N-1.

Re-checked for collateral damage: purity is unchanged (still zero module-scoped mutable state, zero closures, zero caches, zero imports); the mulberry32 transcription at `:21-24` is byte-identical to round 1 and to the ticket pseudocode; Fisher-Yates (`:73-80`) is untouched and still the correct inclusive-`[0, i]` form; no new `any`, no new assertions beyond the audited one; all six exports still carry explicit return types; `Rng` is still a plain serialisable object; all 16 ACs carry `spec(T-001:AC-n)` tags (AC-7 ×3, AC-8 ×3, AC-9 ×3, AC-11 ×6, AC-13 ×5, AC-16 ×3, rest ×1).

## 6. Forward-looking advisory (not a finding against T-001)

AC-15 is a real contract change for downstream consumers: `createRng` now **throws** on a seed outside 32 bits where it previously truncated. Any seed source that is not already 32-bit — `Date.now()`, a UUID-derived number, a server-issued duel id — will now throw at the call site rather than silently aliasing. T-013 (PRNG state into `DuelState`) and T-021 must mask with `>>> 0` before calling `createRng`. Worth one line in the ticket's downstream notes so wave 3 does not discover it as a crash.

---

## 7. Verdict

- **Spec compliance: clean.** 16/16 ACs met, DoD intact, mulberry32 still transcribed exactly, no Iron Law violation, no test file touched by the implementer, RED-first order preserved.
- **Code quality: clean of Critical and Important.** The round-1 Important (I-1) is fixed correctly, completely, and with the reasoning documented in place. M-1, M-2 and M-3 are all properly closed. The M-3 normalisation — the change carrying the most risk — is verified safe by proof and by 200,000 compared draws, and is now the reason `Rng` is genuinely the boxed uint32 the locked decision promised.
- One new Minor (N-1) and two out-of-scope carries (M-4, M-5) remain. None blocks.

Suggested (non-blocking) follow-ups: correct the `weightedPick` unreachability comment (N-1); decide on the `total` finiteness guard; record the 32-bit-seed contract for T-013/T-021; and note in the implementation report that the round-1 report's "practically unreachable `requireAt`" claim was disproven, so it does not propagate.

**APPROVED**
