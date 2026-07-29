# T-032 — Test Design Review (pre-freeze)

**Reviewer:** Composer (test-design review)  
**Commit:** `fe76dd2`  
**Worktree:** `.worktrees/wt-T-032`  
**Suites reviewed:** `__tests__/engine/placement.test.ts` (`b07759c1…`), `__tests__/engine/placement-mastery.test.ts` (`f90cc079…`, new)  
**Implementation under test:** `src/engine/placement.ts` — still `unlock.kind !== 'chest'` (pre-D-6)

## Verdict

**ACCEPT_WITH_NITS**

## One-line summary

Suites correctly encode D-6 starters-only across all bands, prove mastery still pays via composition, keep islands unchanged, and are RED (29 fail) for the right reason — a one-line `isCannonEligible` fix is the only plausible green path.

## RED confirmation

```
npx vitest run __tests__/engine/placement.test.ts __tests__/engine/placement-mastery.test.ts
 Test Files  2 failed (2)
      Tests  29 failed | 112 passed (141)
```

Representative failure: `resolvePlacement('k_1').unlockedCannons` returns `{swivel_gun, culverin, six_pounder, chain_shot}` instead of the two starters. Island / maxGrade / purity / bot-band tests remain green (112 passed).

---

## AC-by-AC review

### AC-1 — Every band unlocks starter cannons only

| Question | Answer |
| --- | --- |
| Encoded? | **Yes** |
| Lazy implementer pass? | **No** |

**Coverage**

- Dedicated per-band block: `placement.test.ts:370–386` (`spec(T-032:AC-1)`) — asserts every returned id has `unlock.kind === 'starter'` and excludes all non-starters.
- Full cross-product sweep: `placement.test.ts:420–432` — every `GradeBand × CannonId` membership checked against `starter && minGrade <= maxGrade`.

Fixing only `k_1` or excluding a subset of range ids would fail AC-1 at `g2_3` / `g4_5` and the 3×N dimension sweep.

---

### AC-2 — `k_1` exactly `swivel_gun` + `culverin`

| Question | Answer |
| --- | --- |
| Encoded? | **Yes** |
| Lazy implementer pass? | **No** (k_1-only fix insufficient) |

**Coverage**

- Literal ticket example: `placement.test.ts:122–127`
- Catalog-derived cross-check: `placement.test.ts:129–134` (`expectedCannonIds(1)`)
- Named exclusion loop: `placement.test.ts:141–146` (`NON_STARTER_RANGE_AND_CHEST`)
- DoD pin: `placement.test.ts:571–574` (`dod(T-032:5)`)

Literal and derived oracles cannot drift (T-029-ready).

---

### AC-3 — `g2_3` / `g4_5` starter set; named range/chest excluded

| Question | Answer |
| --- | --- |
| Encoded? | **Yes** |
| Lazy implementer pass? | **No** |

**Coverage**

- `g4_5` starter equality: `placement.test.ts:169–177` (catalog-derived, not a count literal)
- `g4_5` named exclusions: `placement.test.ts:179–184`
- `g2_3` starter equality + today-equals-k_1 pin: `placement.test.ts:196–201`
- `g2_3` named exclusions: `placement.test.ts:203–218`
- Also reinforced by AC-1 sweep and AC-2 k_1 exclusion list (covers `six_pounder`, `chain_shot` at lower bands)

A partial fix that drops only grade-1 range guns but leaves `twelve_pounder`+ at `g4_5` fails AC-3, AC-1, and composition AC-5.

---

### AC-4 — Island rules unchanged (T-011)

| Question | Answer |
| --- | --- |
| Encoded? | **Yes** |
| Lazy implementer pass? | N/A (islands untouched by ticket) |

**Coverage**

- Contiguous prefix + `port_sumwich`: `placement.test.ts:222–245`
- `k_1 → [port_sumwich]`: `placement.test.ts:248–258`
- `g4_5` all islands: `placement.test.ts:186–191`
- Island dimension sweep: `placement.test.ts:435–447`
- Monotonicity (island supersets): `placement.test.ts:463–473`

112 passing tests include all island assertions — D-6 cannon change does not regress islands.

---

### AC-5 — Fully-mastered `g4_5` earns all seven range guns via `resolveUnlocks`

| Question | Answer |
| --- | --- |
| Encoded? | **Yes** |
| Lazy implementer pass? | **No** (requires starters-only placement) |
| Actually proves mastery pays? | **Yes** |

**Coverage** (`placement-mastery.test.ts`)

- Primary composition: `46–64` — placement sanity (no range id pre-owned) + full `SKILL_IDS` mastery → exactly `allRangeCannonIds()` (7 today); tagged `dod(T-032:6)`.
- Secondary: `66–84` — kind=`range` per id, full coverage, starters not re-listed.

With current buggy placement, sanity at `46–52` fails (`six_pounder` already in `P.unlockedCannons`). After correct fix, frozen `mastery.ts` delta semantics award the full range set — composition genuinely proves the wave-3 overlap is closed.

---

### AC-6 — `k_1` + `add_within_20`/`sub_within_20` mastered → `six_pounder` + `chain_shot`

| Question | Answer |
| --- | --- |
| Encoded? | **Yes** |
| Lazy implementer pass? | **No** |
| Actually proves mastery pays? | **Yes** |

**Coverage** (`placement-mastery.test.ts`)

- Positive path: `88–105` — placement leaves both range guns unowned; unlock delta includes them; starters not re-listed.
- Negative control: `107–115` — empty mastery → `[]` delta (guards vacuous pass).

Ticket wording is “include … and do not re-list starters”; test matches. Exact delta cardinality is implied by mastery’s per-skill filter (frozen T-010) rather than asserted here — see nit below.

---

### AC-7 — Old four/nine-cannon expectations removed from placement suite

| Question | Answer |
| --- | --- |
| Encoded? | **Yes** |
| Lazy implementer pass? | **No** (amended behavioral tests would still fail until fixed) |

**Coverage**

- Meta source guard: `placement.test.ts:388–412` — forbids old four-cannon literal set, positive g2_3 range inclusions, `starter or range` oracle, and `!== 'chest'` filter phrasing in **this file**.
- Behavioral rewrite: amended `spec(T-011:AC-2/AC-4/AC-5)` blocks throughout (no `.toContain('six_pounder')` positive assertions, no nine-cannon count expectations).

Repo grep confirms no remaining four-cannon **expectations** outside ticket docs and the AC-7 guard strings themselves.

---

## Lazy-implementer matrix

| Cheats | Result |
| --- | --- |
| `isCannonEligible`: `unlock.kind === 'starter'` (correct one-liner) | **GREEN** — intended |
| Hardcode / filter `k_1` only | **RED** — AC-1 all bands, dimension sweep, g2_3/g4_5, composition |
| Exclude only `six_pounder` + `chain_shot`, keep other range at g4_5 | **RED** — AC-1, AC-3, AC-5 composition |
| Change test oracle but not `placement.ts` | **RED** — tests call production `resolvePlacement` |

---

## Findings

### Critical

_None._

### Important

_None._

### Nits (non-blocking)

1. **`placement-mastery.test.ts:66–84`** — second AC-5 test omits the explicit placement pre-grant sanity loop present at `:49–52`; failure is still caught by sorted set equality, but duplicating the sanity guard would clarify intent.
2. **`placement-mastery.test.ts:88–105`** — AC-6 asserts `toContain` / `not.toContain` rather than an exact delta set; consistent with ticket text and safe given frozen mastery per-skill filtering, but an `toEqual(sorted(['six_pounder','chain_shot']))` would tighten the pin.
3. **`placement.test.ts:388–412`** — AC-7 meta-tests are source-string guards (brittle to harmless reformatting); acceptable because ticket scopes to this file and behavioral AC-2/4/5 rewrites carry the real weight.

---

## Traceability / freeze readiness

| Check | Status |
| --- | --- |
| Every T-032 AC tagged `spec(T-032:AC-n)` | PASS |
| Amended T-011 AC-2/4/5 retain `spec(T-011:…)` | PASS |
| DoD tags 1–6, 8 present | PASS |
| Composition isolated from frozen T-010 mastery suite | PASS |
| Spec-lint T-032 + T-011 | PASS (per orchestrator) |
| Correct RED for current `placement.ts` | PASS (29 fail, right assertions) |
| Baseline outside placement suites | PASS (1315 passed) |

**Recommendation:** Freeze tests as written. Implementer changes `src/engine/placement.ts:45` from `unlock.kind !== 'chest'` to `unlock.kind === 'starter'`; islands and `mastery.ts` untouched.
