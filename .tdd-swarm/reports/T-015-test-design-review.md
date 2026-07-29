# T-015 — Independent Test-Design Review

## Re-review (round 2)

**Verdict: ACCEPT_WITH_NITS**

Round-2 commit `3ec4364` closes all Critical and Important findings from the initial REJECT.
The suite is freeze-ready for the implementer phase.

**One-line summary:** T-014-style `REQUIRED_TEMPLATES` + literal `SPOT_CHECKS` restore AC-11
independence; `\b` param liveness and `SYMBOLIC_OPERATOR_WORDS` close AC-4/AC-3 gaps; RED integrity
holds (47 fail / 6 pass on missing JSON).

### Closure verification

| Finding | Status | Evidence |
| --- | --- | --- |
| **C-1** AC-11 not independent | **Closed** | `independentArithmetic` removed. `REQUIRED_TEMPLATES` (24 templates, 8/skill) at `g23.test.ts:99-328`; literal `SPOT_CHECKS` at `337-385`; AC-11 uses `it.each(SPOT_CHECKS)` with frozen `expect(…).toBe(text/answer)` at `928-955` — no runtime derivation from `answerExpr`. Authoring preflight proves literals against `generateQuestion` on `REQUIRED_TEMPLATES` (`568-577`); AC-10 ladder preflight on contract shapes (`588-606`). AC-1 pins shipped JSON to exact contract (`619-629`). |
| **I-1** AC-4 substring false-positives | **Closed** | `paramIsLive` uses `new RegExp(\`\\b${name}\\b\`)` on `answerExpr` and constraints (`437-442`), matching T-014 (`k2-addsub.test.ts:509-510`). |
| **I-2** AC-3 operator allowlist | **Closed** | `SYMBOLIC_OPERATOR_WORDS` at `73-86`; forward gate filters prose via `!SYMBOLIC_OPERATOR_WORDS.has(word.toLowerCase())` at `665-667`. Verified: symbolic place-value shapes (`rounded…ten`, `Which is greater…`, `{a} is ? more than {b}`) produce empty `proseWords`; word-problem shapes retain non-allowlisted vocabulary and require `isWordProblem: true`. |
| **I-3** unreachable AC-11 failures | **Closed** | AC-11 block uses direct `expect` in `it.each`; no post-throw `failures.push`. |

### Worktree verification (round 2)

| Check | Observed |
| --- | --- |
| Worktree | `.worktrees/wt-T-015` |
| Branch | `ticket/T-015-templates-g23` |
| Commit | `3ec4364` — `test(T-015): hand-pinned spot checks, word-boundary params, AC-3 allowlist` |
| Test file SHA-256 prefix | `f941a204…` |
| Content JSON | absent (expected RED) |
| Vitest | **47 failed \| 6 passed** (53) — missing-file on scoped JSON paths |
| Passes without JSON | authoring-contract preflight (3) + dod(T-015:1/2/3) (3) |
| Spec-lint | **PASS** — 14 ACs + 7 DoD items |
| Baseline outside file | 1438 green (orchestrator) |
| `independentArithmetic` | absent from suite |

### Remaining nits (non-blocking)

- **N-1** — All 24 `SPOT_CHECKS` use `seed: 1`. Valid per AC-11 ("one fixed seed"), but T-014 varies
  seeds per template for better param-range discrimination. Consider diversifying in a follow-up.
- **N-2** — DoD-5 (`1094-1103`) samples 100 seeds vs AC-7's 1,000. Redundant but harmless as DoD
  shorthand.
- **N-3** — AC-8 mandatory `×` in every `mult_facts` skeleton still conflicts with ticket Context
  crate example (no `×`); AC literal wins — implementer must not copy that example verbatim.

### Remaining Critical / Important

**None.**

---

## Initial review (round 1) — REJECT

<details>
<summary>Prior verdict and findings (superseded except nits noted above)</summary>

**Verdict: REJECT.** Two contract holes would let a lazy implementer pass while violating ticket
intent:

1. **AC-11** — `independentArithmetic(template.answerExpr, …)` derived expectations from the same
   grammar AC-5 already exercises; not literal author-pinned values.
2. **AC-4** — `paramIsLive` used substring `.includes(name)`, false-positiving on names like `a`
   inside `ab`.

Also **I-2** (AC-3 no operator allowlist) and **I-3** (unreachable `failures.push` in AC-11).

See git history before `3ec4364` for the rejected suite (`bce3cdd1…` SHA prefix).

</details>

## AC-by-AC discrimination (round 2)

| AC | Encoded? | Adversarial / lazy bypass? | Notes |
| --- | --- | --- | --- |
| **AC-1** | Yes — `613-630`, DoD-4 | No | Schema + `≥8` per skill; shipped JSON must exactly match `REQUIRED_TEMPLATES`. |
| **AC-2** | Yes — `636-653` | No | Skill field, id prefix, global uniqueness. |
| **AC-3** | Yes — `659-682` | Unlikely | Reverse gate sound. Forward gate uses `SYMBOLIC_OPERATOR_WORDS` aligned with ticket Context shapes. |
| **AC-4** | Yes — `688-708` | No | Word-boundary liveness on `answerExpr` and constraints. |
| **AC-5** | Yes — `714-766` | Unlikely | Full 1,000-seed golden sweep. |
| **AC-6** | Yes — `772-797` | Unlikely | Per-skill display bounds on answers and text numerals. |
| **AC-7** | Yes — `803-828`, DoD-5 | Minor | `firstAddSubIntermediate` handles standard two-step shapes; unusual expr shapes unlikely for this skill. |
| **AC-8** | Yes — `834-868` | Minor | `×` glyph + factor bounds; `factorValues` scans rendered `×` and `answerExpr` `*`. |
| **AC-9** | Yes — `874-898` | Unlikely | Word-problem length, `?`, substituted numeral. |
| **AC-10** | Yes — `904-922` | Unlikely | Ladder `< 250/1000`; contract preflight on `REQUIRED_TEMPLATES` during RED. |
| **AC-11** | Yes — `928-955` | No | Literal `SPOT_CHECKS` table; `it.each` pins text and answer independently of `evaluateNumber`. |
| **AC-12** | Yes — `961-975`, DoD-4 | Partial | `≥5` skeletons + word/symbolic mix; up to 3 skeleton copies acceptable per AC. |
| **AC-13** | Yes — `981-1002` | Unlikely | Seeds 1..200, no `CONSTRAINTS_UNSATISFIED`. |
| **AC-14** | Yes — `1008-1030` | Unlikely | `≥3` distractors, textual uniqueness. |

## DoD / RED integrity

| DoD | RED behaviour | Correct? |
| --- | --- | --- |
| dod(T-015:1) | PASS — tag coverage | Yes (meta) |
| dod(T-015:2) | PASS — gates, no TODO/focus | Yes (meta) |
| dod(T-015:3) | PASS — numbered dod tags | Yes (meta) |
| dod(T-015:4) | FAIL — missing JSON | Yes |
| dod(T-015:5) | FAIL — missing JSON | Yes |
| dod(T-015:6) | FAIL — missing JSON | Yes |
| dod(T-015:7) | FAIL — missing JSON | Yes |

Authoring-contract preflight (3 tests) passes without JSON — validates `REQUIRED_TEMPLATES` ↔
`SPOT_CHECKS` ↔ generator before content lands.

## Integrity

Round-2 re-review performed on commit `3ec4364`. Only this review report was updated. The frozen
test file was not modified. No commit was made.
