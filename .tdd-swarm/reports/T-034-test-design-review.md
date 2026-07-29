# T-034 — Independent Test-Design Review

**Reviewer:** Composer (test-design review subagent)  
**Worktree:** `/Users/quietguy/Documents/Dev/Gauntlet/Math Game/.worktrees/wt-T-034`  
**Branch:** `ticket/T-034-param-key-grammar`  
**Suite:** `__tests__/content/schemas.test.ts` (commit `51c37df`; ticket adjudication `a178ba6`)  
**Ticket:** `tickets/T-034.md`  
**Baseline:** spec-lint **PASS**; schemas suite **7 failed / 102 passed** (109); repo excluding `schemas.test.ts` **1612 green**

---

## Verdict

**ACCEPT_WITH_NITS**

**One-line summary:** AC-1–AC-3 and DoD-1–6 are well pinned with genuine RED and no frozen-regression risk to T-003/T-026, but AC-4’s `isT002Ident` oracle misclassifies pure numeric strings as IDENT, leaving a survivor gap for digit-only param keys outside AC-2’s enumerated set.

---

## Critical

*(none — the seven RED failures are the right ones; no AC is untagged; no loophole lets the ticket’s five AC-2 reject cases pass while green)*

---

## Important

| # | File:line | Issue |
|---|-----------|-------|
| I-1 | `schemas.test.ts:1007–1014`, `:962–978` | **AC-4 drift oracle conflates IDENT with numeric literals.** `isT002Ident(key)` returns `evaluateNumber(key, env) === 7`. For `"7"`, `"0"`, `"42"`, T-002 tokenises a `NUMBER` literal (see `expr.ts:142–162`), so the expression evaluates to `7` without ever resolving the env key — the helper returns **true** even though these strings are **not** in `IDENT := [A-Za-z_][A-Za-z0-9_]*`. They are absent from `ILLEGAL_PARAM_KEYS` and `IDENT_DRIFT_CORPUS`. **Survivor mutation:** a schema that rejects AC-2’s five cases but still accepts pure-digit keys (e.g. a mistaken `\|^\d+$` alternation) stays green on AC-2 and AC-4 while violating the ticket’s “same set as IDENT” intent. **Fix before or at freeze:** tighten the oracle (e.g. require `tokenize(key)` to emit exactly one `identifier` token whose `name === key`, or compare against the shared export once DoD-5 lands) and add at least one pure-digit case such as `"7"` to the drift corpus. |
| I-2 | `schemas.test.ts:1154–1155` | **Stale DoD-5 comment.** Inline text still says “file_scopes lists only schemas.ts — see report ambiguity”; orchestrator adjudication (`tickets/T-034.md:81–85`) already expanded scopes to `src/engine/questions/expr.ts`. Harmless for RED, but misleads implementers. |
| I-3 | `schemas.test.ts:1156` | **DoD-5 export-name regex is narrow.** `export\s+(?:const\|function)\s+\w*(?:Ident\|IDENT\|Identifier)\w*` rejects reasonable names like `export const PARAM_KEY_PATTERN = …` unless they embed “Ident/IDENT/Identifier”. Adjudication examples `IDENT_PATTERN` — fine — but implementers should follow that naming or the DoD-5 test will false-RED despite a correct shared export. |

---

## Worktree verification

| Check | Observed |
| --- | --- |
| Test commit | `51c37df` — 246 lines appended under T-034 divider only |
| Ticket adjudication | `a178ba6` — `file_scopes` includes `expr.ts`; AC-2 path-or-message naming accepted |
| `bash .tdd-swarm/spec-lint.sh tickets/T-034.md` | **PASS** (AC-1…4, DoD-1…6) |
| `npx vitest run __tests__/content/schemas.test.ts` | **7 failed \| 102 passed** — AC-2×5, AC-4, DoD-5 |
| `npx vitest run --exclude '__tests__/content/schemas.test.ts'` | **1612 passed** (21 files) |
| Frozen block | Lines 1–930 unchanged in spirit; T-003/T-026 cases above divider still green |

---

## Per-AC review

### AC-1 — Accept IDENT-shaped keys, preserve keys

| Dimension | Assessment |
|-----------|------------|
| Encoded? | **Yes** — `schemas.test.ts:1042–1057`: seven legal keys spanning `_` prefix, mixed case, digits-in-suffix; asserts parse success, key order, and value equality. |
| False green? | **No material gap.** Accept-only test does not prove exclusivity, but AC-2 + AC-4 cover rejection and drift. |
| False red? | **No.** Current permissive `z.record` already accepts these fixtures; test is green pre-implementation (expected). |

### AC-2 — Reject enumerated illegal keys; name offender

| Dimension | Assessment |
|-----------|------------|
| Encoded? | **Yes** — `schemas.test.ts:1059–1073`: `it.each` over all five ticket-mandated cases (`a-b`, `2x`, `""`, `a b`, `a.b`); `issuesNameKey` accepts Zod path segment **or** message per adjudication. |
| False green? | **No** for the ticket’s stated reject set. `templateWithParamKey` (`980–986`) sets `answerExpr: '1'` for illegal keys so failures isolate the key, not expression parse. Empty-string naming via path-only is handled (`992–999`). |
| False red? | **No** once schema narrows correctly. All five cases are **RED** today (parse succeeds). |
| vs ticket | Matches AC-2 enumeration exactly — not sampled. Pure-digit keys (`"7"`) are out of scope for AC-2 literal text; see I-1 for AC-4/backstop. |

### AC-3 — Shipped catalogs still parse (narrowing is no-op)

| Dimension | Assessment |
|-----------|------------|
| Encoded? | **Yes** — `schemas.test.ts:1075–1088`: `loadShippedTemplates()` parses every `src/content/templates/*.json` entry through `templateSchema`; second loop asserts every param key satisfies `isT002Ident`. |
| False green? | **Low risk.** Pre-narrowing, parse succeeds because content keys are `{a,b,c,d,n}` and `isT002Ident` agrees. Post-narrowing, parse failure surfaces first. The `isT002Ident` loop is a useful content bug detector independent of schema timing. |
| False red? | **No** on current catalogs (report: 72 templates, IDENT-shaped keys). |
| vs ticket | Slightly stronger than “parse only” — adds T-002 membership check on keys — aligned with “no-op for existing content” intent. |

### AC-4 — Schema acceptance ≡ T-002 IDENT over shared corpus

| Dimension | Assessment |
|-----------|------------|
| Encoded? | **Yes** — `schemas.test.ts:1090–1102`: pairwise compare over `IDENT_DRIFT_CORPUS` (legal + illegal + near-misses: operators, whitespace, `__proto__`, whitelisted function name `abs`, etc.). |
| False green? | **Yes — I-1.** Numeric-only strings not in corpus; flawed oracle would agree with an overly permissive schema on those keys. |
| False red? | **Possible if I-1 fixed naïvely** — adding `"7"` to the corpus without fixing `isT002Ident` would permanent-fail even with a correct schema. Fix oracle first, then extend corpus. |
| Corpus strength | **Good** for hyphen, digit-prefix, empty, space, dot, tab, slash, plus, proto pollution, single `_`, and function-name collision (`abs`). Missing pure-digit literals only. |

---

## Definition of Done review

| DoD | Assessment |
| --- | --- |
| 1 | **Sound** — scans ticket for `AC-n` headers vs `spec(T-034:AC-n)` tags (`1106–1113`). |
| 2 | **Sound** — gates script wiring + no skip/only in file (`1115–1121`). |
| 3–4 | **Sound** — six checkbox items ↔ six numbered `dod(T-034:n)` tags; slight overlap between 3 and 4 is harmless meta redundancy. |
| 5 | **Sound intent, nits I-2/I-3** — import-from-`@engine/questions/expr`, no duplicated char-class literal in `schemas.ts`, expr must export Ident symbol. Correctly **RED** today. Aligns with adjudicated `file_scopes`. |
| 6 | **Sound** — narrowing confined to `schemas.ts`; no new `param*`/`ident*` module under `src/content/` (`1159–1167`). Does not police `expr.ts` surface area (adjudication: export-only touch is scope, not tested here — acceptable). |

---

## Interaction with frozen T-003 / T-026 (same file)

| Concern | Finding |
| --- | --- |
| Frozen block integrity | T-034 block appended after line 932 divider; header comment (`11–12`) warns against weakening upstream cases. **No edits** to T-003/T-026 assertions in `51c37df`. |
| Fixture overlap | `MINIMAL_TEMPLATE` / `FULL_TEMPLATE` use param keys `a`, `b` — all IDENT-shaped. Narrowing is compatible. |
| T-003 param-range tests (`459–481`) | Exercise tuple bounds on keys `a`, `b`; unaffected by key grammar. |
| T-026 distractor tightening (`396–457`, `459–481`) | Same fixtures; `spec(T-026:AC-5)` regression sentinel parses `FULL_TEMPLATE` and sibling schemas — remains green. |
| Regression risk | **Low.** A broken narrowing that rejects `a`/`b` would fail many frozen tests immediately, not only T-034. |

---

## RED / false-green discipline

| Failure (7) | Expected? |
| --- | --- |
| AC-2 × 5 | **Yes** — `z.record(paramRangeSchema)` still accepts illegal keys |
| AC-4 | **Yes** — schema accepts 11 corpus keys that fail IDENT membership under the oracle |
| DoD-5 | **Yes** — no import from `@engine/questions/expr`; no Ident export yet |

| Still green pre-implementation | Expected? |
| --- | --- |
| AC-1, AC-3 | **Yes** — legal keys and shipped content already IDENT-shaped |
| DoD-1–4, DoD-6 | **Yes** — meta / scope pins |

No vacuous always-green AC tests disguised as RED coverage.

---

## Adjudication alignment

| Ruling | Suite compliance |
| --- | --- |
| `file_scopes` includes `expr.ts` for IDENT export only | DoD-5 pins import + export; test report ambiguity resolved in ticket `a178ba6` |
| AC-2: name key via Zod path **or** message | `issuesNameKey` implements both (`992–999`) |

---

## Recommendation before freeze

1. **Address I-1** (oracle + at least one pure-digit drift case) — only material gap.
2. Optionally refresh DoD-5 comment (I-2) and document preferred export name (`IDENT_PATTERN` / `isIdent`-style) for implementers (I-3).

With I-1 acknowledged as a tracked nit, the suite is **fit to freeze** for the implementer phase: RED is honest, AC-2 reject enumeration is complete per ticket, T-003/T-026 are safe, and DoD-5 correctly forces the shared grammar surface the locked decision requires.
