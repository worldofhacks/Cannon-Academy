# T-001 Code Review — Seeded mulberry32 PRNG

**Reviewer:** independent code-review agent (did not author the implementation)
**Ticket:** `tickets/T-001.md` (14 ACs, 7 DoD items, 4 locked decisions)
**Under review:** `/Users/quietguy/Documents/Dev/Gauntlet/cannon-wt/wt-T-001/src/engine/rng.ts` (122 lines, sole file in scope)
**Diff:** `git diff swarm/engine-core..HEAD -- src/` → one new file, `src/engine/rng.ts`
**Branch:** `ticket/T-001-seeded-prng`; implementation commit `03b9d58`, report commit `2063783`; frozen-test commits (`232e15c`, `d3f8139`, `2047fa2`) all predate the implementation — **the implementer modified zero test files**, confirmed at commit level.

Gate status was supplied as ground truth and is not re-litigated here. (Independently observed in passing: `vitest run` → 32/32 across 2 files; `npx eslint . --max-warnings 0` → exit 0.)

**Verdict summary**

| Dimension | Critical | Important | Minor |
|---|---|---|---|
| Spec compliance | 0 | 0 | 0 |
| Code quality | 0 | **1** | 5 |

---

## 1. SPEC COMPLIANCE

### 1.1 The mulberry32 transcription (the thing that matters most)

Verified **independently of the frozen tests**, token by token, ticket pseudocode (`tickets/T-001.md:40-45`) against `src/engine/rng.ts:18-22`:

| Spec line | Implementation | Verdict |
|---|---|---|
| `a = (a + 0x6D2B79F5) \| 0` | `const a = (state + 0x6d2b79f5) \| 0;` (:18) | exact — `\| 0` present, constant identical (case only) |
| `t = Math.imul(a ^ (a >>> 15), 1 \| a)` | `let t = Math.imul(a ^ (a >>> 15), 1 \| a);` (:19) | exact — `>>>` not `>>`, shift `15`, `Math.imul`, `1 \| a` |
| `t = (t + Math.imul(t ^ (t >>> 7), 61 \| t)) ^ t` | identical (:20) | exact — shift `7`, `61 \| t`, and the load-bearing parenthesisation `(t + imul(...)) ^ t`, not `t + (imul(...) ^ t)` |
| `output = ((t ^ (t >>> 14)) >>> 0) / 4294967296` | `const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;` (:21) | exact — shift `14`, `>>> 0` applied **before** the divide, divisor `4294967296` |
| `nextState = a` | `return { value, nextState: a };` (:22) | exact — next state is the post-`\| 0` `a`, not `t` |

No deviation. The source matches the ticket independently of the in-test oracle, so the "test and implementation agree with each other but both drift from the spec" failure mode is ruled out.

One representational note (not a divergence, see M-3): `createRng` normalises to uint32 (`seed >>> 0`, :13) but the step returns the **int32** `a`, so states go negative after the first advance (seed 0 → `1831565813` → `-631835670`). Arithmetic is mod-2³² throughout so the stream is unaffected, and the frozen reference (`__tests__/engine/rng.test.ts:26-32`) does the same.

### 1.2 Acceptance criteria

| AC | Verdict | Evidence |
|---|---|---|
| AC-1 reproducibility | **met** | `createRng` (:12-14) and `mulberry32Step` (:17-23) are pure functions of their arguments; identical seeds necessarily yield identical sequences. |
| AC-2 seed sensitivity | **met** | State enters the step unmodified (`rng.state`, :27); distinct seeds give distinct `a` and thus distinct first outputs. |
| AC-3 known-answer vs reference | **met** | Transcription table §1.1. Seed `4294967295` handled: `>>> 0` at :13 keeps it a uint32; seed `0` needs no special case. |
| AC-4 range + mean | **met** | `value` is `uint32 / 2**32` (:21) ⇒ `0 ≤ v < 1` by construction; no clamping, no `Math.abs` fudge. |
| AC-5 `nextInt(1,6)` uniformity | **met** | `min + Math.floor(f * range)` (:43-44), `range = max - min + 1` inclusive. Probed 200,000 draws: zero out-of-range values. |
| AC-6 `nextInt(5,5)` advances | **met** | No early return for the degenerate range; `nextFloat` is always consumed (:42), and `nextState = (state + 0x6D2B79F5)\|0 ≠ state` for every state. Explicitly documented at :32-33. |
| AC-7 `RangeError` on bad bounds | **met** | :36-38 (non-integer `min`/`max`, also catches `NaN`/`±Infinity`), :39-41 (`min > max`). |
| AC-8 shuffle | **met** | `items.slice()` (:62) ⇒ new array, input never mutated; loop `i = len-1; i > 0; i -= 1` with `j = nextInt(rng, 0, i)` **inclusive of `i`** (:64-65) is textbook Fisher-Yates. Read the algorithm rather than trusting the band: no off-by-one — the classic bias is `nextInt(0, len-1)` inside the loop or `i >= 0` with an exclusive upper index; neither is present. All *n!* permutations equiprobable. |
| AC-9 pick | **met** | Empty ⇒ `RangeError` (:77-79); returns a `[value, nextRng]` tuple (:81) with `nextRng !== rng`; uniform over `nextInt(0, len-1)`. |
| AC-10 weightedPick + `{item, weight}` | **met** | Entry type is `{ readonly item: T; readonly weight: number }` (:85) — field is `item`, per the locked decision. Selection at :108-117. |
| AC-11 validation + zero-among-positives | **met** | Empty (:93-95), negative (:99-101), zero total (:104-106) all `RangeError`. Zero-weight-among-positives is correct **by construction, not by luck**: at a zero-weight entry `cumulative` is unchanged from the previous iteration, whose `target < cumulative` test already failed; if it is first, `cumulative === 0` and `target ≥ 0`, so strict `<` (:114) rejects it. Caveat M-1 below concerns non-finite weights, which this AC does not name. |
| AC-12 JSON round-trip | **met** | `Rng` is `{ readonly state: number }` (:9) — a plain object literal, no prototype, no closure, no symbol. |
| AC-13 purity / no hidden state | **met** | Whole-file read: zero module-scoped bindings other than the type alias at :85 and the four `function` declarations. No `let` outside function bodies, no cache, no counter, no lazily-initialised singleton, no `this`. Every export's output is a function of its arguments alone. |
| AC-14 readonly parameters | **met** | `shuffle` (:61), `pick` (:76), `weightedPick` (:92) all take `readonly` arrays; `weightedPick` takes `readonly WeightedEntry<T>[]` with readonly fields, so T-009's `readonly { item: ChestRarity; weight: number }[]` binds. |

**14/14 met. Nothing is cannot-verify.**

### 1.3 Definition of Done

| DoD item | Verdict | Evidence |
|---|---|---|
| Every AC has a passing `spec(T-001:AC-n)` test | **met** | All 14 tags present in `__tests__/engine/rng.test.ts` (AC-7 ×3, AC-8 ×3, AC-9 ×3, AC-11 ×5, AC-13 ×5, rest ×1). Authored pre-implementation, unmodified. |
| `run-local-gates.sh` green | **met** (parent-verified; spot-checked vitest + eslint) | |
| `spec-lint.sh` green | **met** (parent-verified) | |
| No `Math.random()`, no `Date`, no React/RN/Expo/Firebase | **met** | The file has **zero imports**. Only `Math.imul`/`Math.floor`/`Number.isInteger` are referenced. |
| Explicit return types, no `any`, clean under `noUncheckedIndexedAccess` | **met literally** | All six exports carry explicit return types (:12, :26, :35, :61, :76, :92); no `any`; **no `!` and no `as` anywhere in the file**. Indexed reads are routed through the `requireAt` guard (:49-55) rather than silenced. But see **I-1** — the guard chosen is the wrong predicate, so this item is satisfied by a mechanism that is itself unsound. |
| `Rng` plain serialisable, no closures returned | **met** | :9, :13, :28. No export returns a function. |
| Files changed are exactly `file_scopes` | **met** | `git diff swarm/engine-core..HEAD -- src/` = `src/engine/rng.ts` only. The branch additionally carries the process-mandated `.tdd-swarm/reports/T-001-implementation.md` (separate commit `2063783`) and the pre-existing frozen-test commits; neither is a scope breach. |

### 1.4 Iron Law — anything built that no failing test demanded?

**Essentially clean.** No unrequested exports, no unrequested options, no "while I was in here" helpers. `mulberry32Step` and `requireAt` are private and directly serve the spec and the `noUncheckedIndexedAccess` DoD item respectively. Nothing from the Out-of-Scope list (consumers, reseeding, singletons, `DuelState` wiring) leaked in.

The single nit: the `weightedPick` fallback at :119-121 is production code no test demands and, for the specified input domain, cannot execute — see **M-2**.

---

## 2. CODE QUALITY

### I-1 — `requireAt` conflates "out of bounds" with "the element is `undefined`" (Important)

`src/engine/rng.ts:49-55`

```ts
function requireAt<T>(arr: readonly T[], index: number): T {
  const value = arr[index];
  if (value === undefined) {
    throw new RangeError(`index ${index} out of bounds`);
  }
  return value;
}
```

The predicate tests the **value**, not the **index**. `T` is unconstrained, so `undefined` is a legal element of a legal input, and `shuffle`/`pick` then throw a `RangeError` on data they are contractually required to permute or select from. Empirically confirmed against the built module:

- `shuffle(createRng(s), [undefined, 1, 2, 3])` throws for **37 of 50 seeds** (it throws whenever the swap touches the `undefined` slot — i.e. almost always, and *seed-dependently*).
- `pick(createRng(s), [undefined, 1, 2])` throws for **14 of 50 seeds**.
- `shuffle(rng, new Array(4))` (sparse array) throws `index 3 out of bounds`.

Three things make this worse than a theoretical nit:

1. **The message is false.** Index 3 of a 4-element array is in bounds. A downstream debugger chasing this is sent to look for a length bug that does not exist.
2. **`noUncheckedIndexedAccess` is on repo-wide**, which is precisely what makes `(T | undefined)[]` a routine array shape in this codebase — every `arr[i]` produces one. A T-007 choice list or T-021 cannon list assembled by indexing is `(X | undefined)[]` unless someone narrows it, and it type-checks against `shuffle` today.
3. **Seed-dependent, data-dependent crash in the module every other module depends on.** It does not fail on the first run; it fails on some player's seed. Wave 1 has no callers yet, which is exactly why the contract must be right now — this file is frozen for T-005/T-007/T-008/T-009/T-021.

The implementer's report asserts this guard is a "practically unreachable" `RangeError`. That is factually wrong, and the claim should not carry into the next review.

The DoD asks for code that is *clean* under `noUncheckedIndexedAccess`, i.e. no unsound silencing. A bounds check plus one audited, guarded assertion is sound; a value check is not:

```ts
function requireAt<T>(arr: readonly T[], index: number): T {
  if (index < 0 || index >= arr.length) {
    throw new RangeError(`index ${index} out of bounds (length ${arr.length})`);
  }
  return arr[index] as T; // sound: bounds proven immediately above
}
```

This is a change to existing code inside `file_scopes`, not new scope, so there is no Iron Law tension. All 27/31 frozen tests remain green under it (their fixtures contain no `undefined`).

### M-2 — `weightedPick`'s fallback is unreachable for every valid input, and its comment misstates why it exists (Minor)

`src/engine/rng.ts:119-121`. `cumulative` accumulates the same weights in the same order as `total` (:97-103 vs :111-113), so after the final iteration `cumulative === total` **bit for bit**. With `f ≤ 1 − 2⁻³²`, `target = f * total < total` for every finite positive `total` (the 2⁻³² deficit dwarfs the 2⁻⁵³ rounding). The loop therefore always returns, and the comment's stated rationale — "floating-point edge case at the top boundary (`target ~= total`)" — describes a condition that cannot occur. The branch is untestable by the frozen suite and misleads the next reader. Its only reachable role today is silently absorbing the non-finite inputs in M-1 below.

### M-1 — non-finite weights pass validation and silently return the last entry (Minor)

`src/engine/rng.ts:97-106`. `NaN < 0` is `false` and `NaN <= 0` is `false`, so a `NaN` weight clears both guards; `target` becomes `NaN`, every `target < cumulative` is `false`, and the M-2 fallback returns **the last entry**. Probed:

- `[{item:'a',weight:NaN},{item:'b',weight:1}]` → `'b'` (should throw).
- `[{item:'a',weight:Infinity},{item:'b',weight:1}]` → `'b'` — the item with essentially probability 1 is never selected.
- `[{item:'a',weight:MAX_VALUE},{item:'b',weight:MAX_VALUE}]` → `'b'` 20,000/20,000 (total overflows to `Infinity`).

No AC names non-finite weights, so this is **not** a spec violation, and adding the guard is production code no failing test demands — hence Minor, and hence a call for the orchestrator rather than a unilateral fix. Flagging it anyway because T-009 feeds `CHEST_RARITY_WEIGHTS` from `tuning.ts` into this function, and LESSONS L-009/L-010 are exactly this pattern: a validator specified only by what it accepts, silently mis-selecting instead of throwing. One-line completion inside the existing loop: `if (!Number.isFinite(entry.weight) || entry.weight < 0) throw ...`.

### M-3 — `Rng.state` is not the "boxed uint32" the locked decision and the doc comment describe (Minor)

`src/engine/rng.ts:8-13, 22`. `createRng` normalises (`seed >>> 0`) but the step returns the int32 `a`, so the module carries two representations. Verified: seed 0 → states `[0, 1831565813, -631835670, 1199730143, -1263671340, 567894473]`. Harmless (every consumer is mod-2³², JSON round-trip is unaffected, the frozen reference behaves identically), but two consequences worth recording: the `>>> 0` at :13 is **not load-bearing** — `createRng(-1)` and `createRng(4294967295)` produce byte-identical streams — and any future code that assumes `rng.state >= 0` (a persistence schema, a `z.number().nonnegative()`, a uint32 serialiser in T-013) will be wrong. Either normalise `nextState` too, or correct the comment at :8 to say "signed 32-bit generator state".

### M-4 — `createRng` performs no seed validation while `nextInt` validates its bounds (Minor)

`src/engine/rng.ts:12-14` vs `:36-41`. Inconsistent posture in one small module. `createRng(NaN)`, `createRng(-0.5)`, and `createRng(2 ** 33)` all silently collapse to `{ state: 0 }` — the same generator as seed 0. In a module whose entire purpose is replay-from-seed, silently aliasing a malformed seed onto seed 0 is the kind of thing that makes a non-reproducing replay bug take a day to find. No AC covers it; at minimum the `createRng` doc should state that the seed is coerced with `>>> 0`.

### M-5 — `nextInt` inherits 32 bits of entropy and modulo-style bias (Minor, informational)

`src/engine/rng.ts:42-44`. `min + Math.floor(f * range)` is the derivation the ticket's design implies and is correct for the ranges this game uses; the residual non-uniformity is `≈ range / 2³²` (~1.4e-9 for a six-sided die) and is far below every AC band. Recorded for completeness: ranges above 2³² are sparse (only 2³² attainable values), and `max - min + 1` loses integer precision beyond 2⁵³ — `nextInt(MIN_SAFE_INTEGER, MAX_SAFE_INTEGER)` returns a value rather than erroring. No AC requires rejection sampling and adding it would be scope creep; do not "fix" this without a ticket.

### Clean dimensions (stated plainly, not padded)

- **Purity — clean.** No module-scoped mutable state, no closures capturing state, no caches, no lazily-initialised singletons, no `this`, no imports. Every export is a function of its arguments alone. AC-13's motivating cheat (a module-scoped counter) is structurally impossible in this file.
- **Fisher-Yates — clean.** Loop bounds and the inclusive `[0, i]` swap range are both correct; there is no off-by-one and no residual bias. This was read as an algorithm, not inferred from the passing band.
- **`noUncheckedIndexedAccess` hygiene — no `!`, no `as`, no `any`** anywhere in the file. The one problem is the guard's predicate (I-1), not its absence.
- **Naming — clean.** `createRng`/`nextFloat`/`nextInt`/`shuffle`/`pick`/`weightedPick` read at the call site; `nextRng`/`currentRng` make the threading obvious; the locked `item` field name is respected and its unusualness is called out in a comment (:84).
- **Duplication — none.** `nextInt` composes `nextFloat`; `pick` composes `nextInt`; `shuffle` composes `nextInt`. Single derivation path, one place to be wrong.
- **Error handling — consistent** where it exists: every thrown error is a `RangeError` with a prefixed, actionable message. Gaps are M-1/M-4, not inconsistency in style.
- **Clarity — above average.** The header comment ties the file to ARCHITECTURE §4.1/§4.2, and `nextInt`'s "always consumes one draw even when `min === max`" note (:32-33) documents a genuinely non-obvious determinism property. Two comments are wrong (:8 per M-3, :119-120 per M-2).

---

## 3. Implementation report accuracy (non-blocking)

Recorded so the next reader does not inherit them:

1. **"practically unreachable" `requireAt` guard** — false; see I-1 (throws on 37/50 seeds for a 4-element array containing `undefined`).
2. **Commit range `8ca445d..43b5071`** — both objects exist but **neither is an ancestor of `HEAD`**; the branch history was rewritten after the report was written. The actual implementation commit is `03b9d58`.
3. **"All 27 frozen tests pass (32 total including the pre-existing scaffold test)"** — arithmetic does not close. `__tests__/engine/rng.test.ts` reports **31** tests (AC-3's `it.each` expands to 4); 31 + 1 scaffold = 32.
4. **`DONE_WITH_CONCERNS` on repo-level eslint** — stale. `npx eslint . --max-warnings 0` exits **0** in this worktree; `eslint.config` already carries the CommonJS override for the guard hook (commit `8900ec9`). The concern was valid analysis but is now resolved; the status should drop to `DONE`.

---

## 4. Verdict

- **Spec compliance: clean.** 14/14 ACs met, 7/7 DoD items met, mulberry32 transcribed exactly, zero Iron Law violations, zero test files touched.
- **Code quality: one Important finding (I-1).** The `undefined`-vs-out-of-bounds conflation in `requireAt` is a latent, seed-dependent crash with a misleading message, in the module five downstream tickets are about to freeze against. Two lines to fix, inside `file_scopes`, with no test churn.

Required before approval:
- **I-1** — replace the value check in `requireAt` with a bounds check (blocking).
- **M-2** — remove the unreachable `weightedPick` fallback, or correct its comment (do this together with a decision on M-1; if M-1's finiteness guard is added, the fallback becomes provably dead and should go).
- **M-1, M-3, M-4, M-5** — orchestrator's call. M-1 and M-3 are worth a decision before wave 3 (T-009 weights; T-013 persistence). None blocks on its own.

**CHANGES REQUIRED**
