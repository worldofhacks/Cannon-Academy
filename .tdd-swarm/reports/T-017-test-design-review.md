# T-017 — Independent Test-Design Review (pre-freeze)

## Verdict

**ACCEPT_WITH_NITS.** The suite faithfully encodes AC-1…AC-14 and DoD-1…DoD-7 with strong
`applyAnswer(..., 'range', …)` oracles, behavioural recency pins aligned to T-007
most-recent-first, and immutability/purity checks that would catch the obvious lazy
implementations. One adjudicated AC-2 boundary case is missing; no Critical false-green paths
were found.

## One-line summary

Mastery-oracle grading matrix and recency window are solid; add `Number.NEGATIVE_INFINITY` to
AC-2 before or immediately after freeze.

## Worktree verification

| Check | Observed |
| --- | --- |
| Worktree | `.worktrees/wt-T-017` |
| Branch | `ticket/T-017-range-drill` |
| Test commit | `6451010` (`test(T-017): failing tests for range drill session`) |
| Docs commit | `6c56e10` (recentTemplateIds most-recent-first adjudication) |
| Test file | `__tests__/engine/drill.test.ts` |
| `src/engine/drill.ts` | absent (expected RED) |
| Spec-lint | **PASS** — AC-1…14 + DoD-1…7 |
| Vitest drill suite | **RED** — module `@engine/drill` not found (0 tests collected) |
| Baseline excluding drill | **1620** green (orchestrator) |

Orchestrator adjudications accepted as ground truth for this review:

1. `recentTemplateIds` is **most-recent-first** (index 0 = newest).
2. AC-1 mastery deep-equality only (reference clone optional).
3. No `skillId` filtering of injected templates — caller responsibility.
4. AC-2 includes NaN / ±Infinity as `RangeError` length cases.
5. AC-8: any `Error` (not `RangeError`) with `/complet/i` in message.

## Important findings

### I-1 — AC-2 omits `Number.NEGATIVE_INFINITY` — `drill.test.ts:197-201`

**Gap.** The `it.each` length sweep includes `0`, negatives, `1.5`, `NaN`, and
`Number.POSITIVE_INFINITY`, but not `Number.NEGATIVE_INFINITY`. Orchestrator adjudication #4
explicitly lists ±Infinity. An implementation that accepts `-Infinity` as a valid drill length
would remain green.

**Fix (one line):** add `Number.NEGATIVE_INFINITY` to the AC-2 `it.each` array.

## Critical findings

**None.** No mutant traced below survives all behavioural ACs in a way that violates the ticket’s
core contract (full-rate mastery loop, recency, completion guard, purity).

## AC-by-AC discrimination

| AC | Encoded? | False-green / mutant risk? | Notes |
| --- | --- | --- | --- |
| **AC-1** | Yes — `172-189` | Low | Counters, live `Question` with 4 distinct choices, mastery `toStrictEqual` input. Empty `recentTemplateIds`/`log` pinned. Input-mastery mutation not probed (optional clone not required per adjudication #2). |
| **AC-2** | Yes — `196-213` | **I-1** | Empty pool → `QuestionGenerationError`/`NO_TEMPLATE`. Length sweep missing `-Infinity`. |
| **AC-3** | Yes — `220-238` | No | Full session counters + `mastery === applyAnswer(m, 'range', true)` + log shape. Catches wrong source or hand-rolled arithmetic for this step. |
| **AC-4** | Yes — `241-254` | No | `correct` stays 0; `weightedCorrect`/`correct` unchanged; `attempts +1`; oracle `applyAnswer(..., false)`. |
| **AC-5** | Yes — `257-275` | No | `choiceIndex: null` log entry and miss semantics via oracle. |
| **AC-6** | Yes — `278-296` | No | OOR choice indices, negative `elapsedMs`; `structuredClone` + counter/log prove no advance. |
| **AC-7** | Yes — `303-320` | No | Length-10 run → `complete`, `current === null`, `log.length === 10`. Mixed correctness pattern avoids all-correct shortcut. |
| **AC-8** | Yes — `323-346` | No | `Error` not `RangeError`, message `/complet/i` — matches adjudication #5. |
| **AC-9** | Yes — `353-375` | No | 10/10 correct → `isMastered` + `meterPercent === 100`; expected mastery built by 10× `applyAnswer(..., 'range', true)` reduce. MVP path wired to tuning constants. |
| **AC-10** | Yes — `378-396` | Low | 5/10 → `isMastered === false` with partial counter checks. Sufficient for AC wording. |
| **AC-11** | Yes — `403-437` | Low | Pool 8 / length 20; sliding-window uniqueness on served sequence; `recentTemplateIds[0] === answeredId` after each answer (most-recent-first). Single seed (`4242`) — see Nits. Replace-not-prepend mutant fails window check; append mutant fails `[0]` check. |
| **AC-12** | Yes — `444-478` | No | Same seed+pattern → deep-equal session **and** question list; different seed diverges questions. Mixed correct/wrong/timeout pattern. |
| **AC-13** | Yes — `481-505` | No | Stronger than ticket minimum: input `answered`/`correct`/`mastery`/`log`/`recentTemplateIds`/`current`/`complete`/`rng` unchanged; output not same reference. |
| **AC-14** | Yes — `508-520` | No | JSON round-trip on live, mid-drill, and complete sessions. |

## Mastery rate wiring

| Concern | Assessment |
| --- | --- |
| Per-answer source `'range'` | AC-3/4/5 assert `toStrictEqual(applyAnswer(..., 'range', …))` — strong. |
| End-to-end full rate | AC-9 reduce oracle + `MASTERY_RATE_RANGE`/`MASTERY_THRESHOLD_CORRECT` pins. |
| Half-rate / local arithmetic | DoD-4 source scan bans `MASTERY_RATE_*` imports and `weightedCorrect +=` in `drill.ts` once implementation exists. |
| Unlock resolution | Correctly out of scope — no false requirement. |

## Recency window correctness

| Check | Assessment |
| --- | --- |
| Most-recent-first order | `recentTemplateIds[0] === answeredId` after each answer — matches T-007 `generateQuestion` / `eligiblePool` slice semantics and adjudication #1. |
| Window property | Sliding window of size `RECENT_TEMPLATE_WINDOW` over served `templateId` sequence — matches AC-11 wording. |
| Pool vs window sizing | `RECENT_TEMPLATE_WINDOW (5) < pool (8)` asserted; filtered pool never empty under correct integration (no degradation false greens). |
| `generateQuestion` call pin | Behavioural only (no white-box); acceptable — wrong recency wiring fails window or `[0]` checks with high probability at length 20. |

## Purity / immutability

| Check | Assessment |
| --- | --- |
| `answerDrill` input immutability | AC-13 + DoD-6 — strong snapshot checks. |
| `startDrill` input immutability | Not probed — see Nits. |
| `Math.random` / `Date` | DoD-5 poisons globals during a 3-question run; source scan when `drill.ts` exists. |
| Determinism | AC-12 replay + seed divergence. |
| JSON serialisability | AC-14 + DoD-6; `Rng = { state: number }` is JSON-safe. |

## Surviving mutants (traced, not run)

| Mutant | Would pass? | Why / which AC catches |
| --- | --- | --- |
| Accept `length: -Infinity` | **Yes** | I-1 — only `-Infinity` missing from sweep. |
| `applyAnswer(..., 'duel', …)` | No | AC-3 strictEqual oracle. |
| Hand-rolled mastery math matching oracle for tested paths only | No | DoD-4 requires import + `applyAnswer` + `'range'` in source. |
| Append `recentTemplateIds` instead of prepend | No | AC-11 `[0]` check after answer 2+. |
| Keep only latest id (drop history) | No | AC-11 sliding-window repeat within 5 consecutive served questions. |
| Post-complete silent no-op | No | AC-8. |
| `answerDrill` throws but mutates input | No | AC-6 `structuredClone` + counters. |
| Post-complete `RangeError` with “complete” message | No | AC-8 `not.toBeInstanceOf(RangeError)`. |
| `startDrill` mutates input `mastery` in place, returns same reference | **Likely yes** | AC-1 `toStrictEqual` only — immaterial if values match; not ticket AC-13 scope. Nit. |
| Ignore recency, lucky single seed | Unlikely | 20 questions / 8 templates / window 5 makes within-window repeats probable without exclusion. |

## Nits (non-blocking)

- **AC-11 single seed:** seed `4242` is fixed. A second seed or property-style check would
  reduce residual luck risk; current geometry (8/20/5) makes a no-recency survivor unlikely.
- **`startDrill` input purity:** no probe that `templates`/`mastery`/`rng` inputs are untouched
  after `startDrill`. Ticket emphasises `answerDrill` purity; low priority.
- **DoD-5 source regex `\bDate\b`:** bans the identifier `Date` even in comments/strings inside
  `drill.ts`. Slightly over-constrains prose; harmless if implementer avoids the token.
- **DoD-4/5/7 require `drill.ts`:** fail until implementation lands; entire suite currently RED
  at import — correct for test phase.
- **DoD-6 overlaps AC-13/14:** redundant DoD shorthand; harmless (T-016 pattern).

## Over-constraint / out-of-scope checks

| Item | Verdict |
| --- | --- |
| `skillId` vs template pool filtering | Correctly omitted per adjudication #3. |
| `recentTemplateIds[0]` pin | Required by adjudication #1; not over-freeze. |
| DoD-7 exact file scope | Matches ticket `file_scopes`. |
| Unlock resolution / `app/range.tsx` | Correctly out of scope. |

## DoD / RED integrity

| DoD | Pre-implementation behaviour | Correct? |
| --- | --- | --- |
| dod(T-017:1) | Would PASS — tag coverage meta | Yes |
| dod(T-017:2) | Would PASS — gates/skip meta | Yes |
| dod(T-017:3) | Would PASS — numbered dod tags | Yes |
| dod(T-017:4) | FAIL — `drill.ts` missing | Yes |
| dod(T-017:5) | FAIL — import/module missing before source scan | Yes |
| dod(T-017:6) | FAIL — import/module missing | Yes |
| dod(T-017:7) | FAIL — `drill.ts` missing | Yes |

Entire suite fails at `@engine/drill` import — no vacuous GREEN during RED.

## Integrity

Only this review report was written. The frozen test file was not modified. No commit was made.
