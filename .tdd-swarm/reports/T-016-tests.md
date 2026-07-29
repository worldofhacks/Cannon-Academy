# T-016 — Grade 3–5 templates — TEST AGENT REPORT

## 0. Unit assertion

| Check | Value |
| --- | --- |
| Worktree | `.worktrees/wt-T-016` |
| `git branch --show-current` | `ticket/T-016-templates-g35` |
| `.tdd-swarm/phase` | `tests` |
| `.tdd-swarm/active-ticket` | `T-016` |
| `src/` touched | **no** (stale JSON left for implementer refresh) |

## 1. Status

**DONE** — TEST DISPUTE closed (AC-11 ladder freeze).

Authoring-contract preflight (including new AC-11 ladder preflight) is green. Loaded stale JSON correctly fails AC-1 deep-equals / AC-11 / updated AC-12 spots until the implementer re-copies `REQUIRED_TEMPLATES`. Spec-lint PASS. Baseline outside this file **1438 passed**.

## 2. Deliverable

| Path | Role |
| --- | --- |
| `__tests__/content/templates/g35.test.ts` | Frozen suite + fixed REQUIRED_TEMPLATES |
| Commit | `test(T-016): fix ladder collisions in REQUIRED_TEMPLATES; add AC-11 preflight` |

## 3. TEST DISPUTE — AC-11 ladder collisions

Implementer copied `REQUIRED_TEMPLATES` faithfully (`8de5d24`); AC-11 failed on four rows. Root cause: AC-1 deep-equals froze distractors that routinely collide or fail plausibility, with no AC-11 preflight on REQUIRED (same class as T-014).

### Ladder rates (seeds 1…1000)

| id | Before | After | Fix |
| --- | --- | --- | --- |
| `div_facts_same` | **913** | **0** | Distractors `0,2,3` (answer always 1; param `a` usually fails magnitude) |
| `multi_digit_order_ops_no_paren` | **520** | **51** | Keep wrong-order; add `b * c` + `+2`; tighten `c∈[2,6]`, `b>=a` so WO stays plausible |
| `multi_digit_order_ops_paren` | **346** | **124** | Keep wrong-order; near-misses `±1`; tighten `c∈[2,4]` |
| `multi_digit_order_ops_times_minus` | **893** | **170** | Replace `a*(b-c)` (often negative) with forgot-subtract `a * b` + near-misses |

SPOT_CHECKS updated for no_paren / paren seed-1 text+answer (param ranges changed).

### AC-11 preflight added

`spec(T-016:AC-11) REQUIRED_TEMPLATES preflight: ladder fills on fewer than 250 of 1000 samples per template` — mirrors T-014's AC-7 preflight so bad distractors cannot freeze again.

## 4. Gates

| Gate | Result |
| --- | --- |
| Preflight (spots, div constraints, headroom, **AC-11 ladder**) | **PASS** |
| `bash .tdd-swarm/spec-lint.sh tickets/T-016.md` | **PASS** |
| Loaded stale JSON | AC-1 verbatim / AC-11 / AC-12 spots **FAIL** (expected until refresh) |
| Existing suite excluding this file | **1438 passed** |

## 5. Prior review closures (still in force)

- **C-1** AC-12 literal SPOT_CHECKS (not `independentArithmetic`)
- **I-1** `\b` word-boundary `paramIsLive`
- **I-2** structural `dividend % divisor == 0` + non-zero divisor for div_facts
