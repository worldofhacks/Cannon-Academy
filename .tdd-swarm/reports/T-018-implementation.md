# T-018 — Implementation Report

**Status:** BLOCKED(TEST_DISPUTE)
**Branch:** `ticket/T-018-onboarding-rival`
**Phase:** `implement`
**Active ticket:** `T-018`
**Commit:** (see git after commit) — `feat(T-018): opponent interface and scripted onboarding rival`
**Files changed:** `src/engine/opponents/types.ts`, `src/engine/opponents/scripted.ts` (exactly `file_scopes`), plus this report.
**Tests edited:** **none** (`__tests__/**` untouched; frozen suite hash preserved).

## Unit assertion

| Check | Value |
| ----- | ----- |
| Branch | `ticket/T-018-onboarding-rival` |
| Phase | `implement` |
| Active ticket | `T-018` |
| Frozen suite SHA-256 | `812e15106b8c08b280673813543089b92231a4f6afd08f4b2e4ed6010a501653` (unchanged) |

## What was built

`src/engine/opponents/types.ts` exports `Opponent`, `OpponentAnswer` (reuses `RivalView` / `RivalAction` from `@engine/duel/types`, `Question` from `@engine/questions/types`).

`src/engine/opponents/scripted.ts` exports `ScriptedStep`, `createScriptedOpponent`:

- **Construction** — empty `script` → `RangeError`; negative `elapsedMs` or cannon absent from `CANNON_IDS` → plain `Error` naming the step index.
- **Playback** — paired `chooseAction` → `produceAnswer` walks the script; `chooseAction` advances the cursor and selects the step; `produceAnswer` returns that step’s `{ correct, elapsedMs }`.
- **Exhaustion** — after the last step, both methods keep returning the final step forever.
- **Independence** — view/question arguments are intentionally unused (`void`); outcomes are script-only.
- **Determinism** — `Promise.resolve` immediately; no `Date` / `Math.random` / timers / `performance.now` in module sources.

## Gate results

| Gate | Exit | Result |
| ---- | ---- | ------ |
| `npx prettier --check .` | 0 | PASS |
| `npx eslint .` | 0 | PASS |
| `npx tsc --noEmit` | 0 | PASS |
| `npx vitest run __tests__/engine/opponents/scripted.test.ts` | 1 | **21 / 22** — only `dod(T-018:3)` fails (see dispute) |
| `npx vitest run` (full) | (not green while dispute open) | blocked by suite self-poison |
| `.tdd-swarm/run-local-gates.sh` | (blocked) | requires green vitest |
| `.tdd-swarm/spec-lint.sh tickets/T-018.md` | 0 | SPEC-LINT PASS (AC-1…13 + DoD-1…7) |

Behavioural ACs **AC-1…AC-13** and DoD **1,2,4,5,6,7** all pass against the implementation.

## BLOCKED(TEST_DISPUTE) — evidence

**Failing assertion:** `dod(T-018:3)` at `__tests__/engine/opponents/scripted.test.ts:496`

```ts
const tagged = [...OWN_SOURCE.matchAll(/dod\(T-018:([^)]*)\)/g)].map((match) => match[1] ?? '');
const unparseable = tagged.filter((id) => !/^\d+$/.test(id));
expect(unparseable).toEqual([]); // received: ['n']
```

**Root cause (suite self-poison):** file header comment line 13 contains the literal substring `` `dod(T-018:n)` ``:

```
 * numbered `dod(T-018:n)` tags (seven items, file order).
```

`OWN_SOURCE` is the suite itself; the regex captures `n` as an unparseable DoD id. This is independent of production code — the same failure occurs with a correct implementation.

**Precedent:** T-017 DoD-3 self-poison (`dod(T-017:n)` in header); orchestrator closed via unpoison commit without implementer editing tests.

**Required fix (orchestrator / test agent only):** rewrite the header example so it does not match `/dod\(T-018:([^)]*)\)/` — e.g. spell it as `` `dod` + `(T-018:n)` `` or ``dod(T-018:&lt;n&gt;)`` — then re-freeze the suite hash.

**Implementer constraint honored:** did not edit `__tests__/**`.

## Residual risks / notes

- Production modules are complete for all behavioural ACs.
- After suite unpoison, re-run full gates; expect green without further `src/` changes.
- No push performed.
