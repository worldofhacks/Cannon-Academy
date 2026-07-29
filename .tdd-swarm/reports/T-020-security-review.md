# T-020 Security Review — Pure duel reducer state machine

Reviewer: independent security review (not implementer).  
Feat commit: `6ef7aaf` — `feat(T-020): duel reducer pure state machine`  
Scope: `src/engine/duel/reducer.ts` only (276 lines).  
Frozen suite: ~33/33 (`reducer.test.ts`); full suite **1707/1707** green.

Offline pure TS engine — no server, network, accounts, or player-authored runtime payloads.
SQLi, XSS, authz, SSRF, and secrets exfiltration do not apply.

## Verdict: PASS_WITH_NOTES

No Critical or Important findings. The reducer is a deterministic, side-effect-free state
machine suitable for replay and serialisation. Minor timing-validation gaps mirror the
T-018 opponent note and belong to the trusted store driver, not a merge blocker.

## Threat model

`duelReducer(state, event)` consumes engine-owned `DuelState` and dispatch events from the
async store driver (out of scope). Event payloads are typed literals (`cannonId`, `choiceIndex`,
`elapsedMs`, `volley`); there is no deserialisation layer or user-authored expression surface
inside this module. Randomness is entirely the threaded seeded `Rng` in state — never ambient.

## Checklist

| Check | Result | Notes |
| ----- | ------ | ----- |
| No eval / dynamic code | **PASS** | Source scan: no `eval`, `Function`, dynamic `import`, or runtime code construction. Imports are static (`getCannon`, `resolveShot`, `generateQuestion`). Question math flows through T-002's safe `evaluateNumber` / `evaluatePredicate`, not string eval. |
| No `Date` / `Math.random` | **PASS** | DoD-4 source probe + manual scan: absent from `reducer.ts`. Nondeterminism only via `state.rng` (`nextFloat` in `resolveShot`, `generateQuestion`). |
| Safe no-throw on well-formed events | **PASS** (with note) | Out-of-phase and invalid player payloads (AC-3, AC-8, AC-14, AC-16, AC-17) return identical reference — no throw. In-phase transitions with finite timing and valid config do not throw. **Note:** non-finite `elapsedMs` (`NaN`, `±Infinity`) bypasses the player guard (`NaN < 0` is false) and can propagate into `resolveShot` → `RangeError`. `RIVAL_ACTION` has no timing guard at all. Intentional throw on empty template pool (AC-21 / `QuestionGenerationError` `NO_TEMPLATE`) is a configuration bug, not a runtime event contract violation. |
| No prototype pollution via event payloads | **PASS** | Events are never spread into state. `coreOf` copies a fixed field list. `updatePlayerTally` keys `bySkill` from `state.question.skill` (engine-owned `SkillId`), not from event keys. Loadout membership uses `Array.includes`, not dynamic object indexing. |
| Hull clamps | **PASS** | `clampHull` floors at `0` at damage application in `resolvePlayerAnswer` and `rivalAction` (lines 122–123, 192–193). AC-23 pins overkill clamp before terminal transitions. Upper bound not clamped in reducer, but only subtraction occurs — hull cannot increase. |
| Immutability (`===` no-ops / no input mutation) | **PASS** | AC-22: every table transition leaves input object and held arrays unmutated. No-op contract uses reference identity (`===`) for out-of-phase, invalid payload, and terminal phases. New state via object spread and array copies (`[...state.actionLog, entry]`). |
| No secrets | **PASS** | No credentials, URLs, API keys, tokens, or PII. `seed` is a public replay key, not a secret. |

## Clean

- **Determinism:** AC-19 replays 20× to identical finals; AC-20 JSON round-trip mid-duel survives kill/relaunch.
- **Damage delegation:** All combat arithmetic flows through `@engine/duel/damage.resolveShot` (DoD-7) — no local `damageMin`/`damageMax` math or tuning constant duplication in the reducer.
- **Terminal freeze:** `victory` / `defeat` ignore all five event types (AC-17) — no post-game state corruption.
- **Turn-token stamping:** Increments only on actor-wait phases (`playerChoose` entry, `rivalTurn` entry) — supports stale-promise discard in the driver without wall-clock coupling.
- **Enemy-first terminal order:** `checkTerminal` checks `enemyHull <= 0` before `playerHull <= 0` — deterministic outcome when both reach zero.
- **Scope containment:** Production change is exactly `src/engine/duel/reducer.ts` per `file_scopes`.

## Minor (recorded, not blocking)

1. **Non-finite `elapsedMs` on player `ANSWER_CHOSEN`** — AC-8 rejects negative values only.
   `NaN` / `Infinity` pass the guard and throw inside `damage.requireUsableTiming`. The store
   driver is the sole event source; malformed timing is a caller bug, not reducer injection.
   Symmetric with T-018 note #2.

2. **No `elapsedMs` guard on `RIVAL_ACTION`** — `rivalAction` forwards `volley.elapsedMs`
   directly to `resolveShot`. Out-of-loadout cannons no-op (AC-14); invalid timing throws.
   Opponent modules (T-018/T-021) supply finite literals in practice.

3. **Intentional throw on missing templates (AC-21)** — `CANNON_SELECTED` with an empty skill
   pool throws `QuestionGenerationError`. Documented configuration failure; not reachable from
   a correctly initialised `createDuelState` config.

4. **`bySkill` keyed by question skill** — Uses computed property `[skill]` where `skill` comes
   from generated question metadata, not the event. Safe against `__proto__` / `constructor`
   key injection via event shape.

## Out of scope (future tickets)

- Async store driver stale-promise handling and opponent error surfacing (T-024).
- Invariant fuzz / `checkDuelInvariants` (T-024).
- Double-Shot phase extension (T-022) — will widen the event matrix; AC-24 hardcoded literals
  guard against silent matrix drift.

## Follow-up

No code change required for merge on security grounds. Optional hardening (non-blocking): mirror
AC-8's player timing guard on `RIVAL_ACTION.elapsedMs` and extend both paths to reject
non-finite durations before calling `resolveShot`.
