# T-018 Security Review — Opponent interface + scripted onboarding rival

Reviewer: independent security review (not implementer).  
Impl commit: `702a804` — `feat(T-018): opponent interface and scripted onboarding rival`  
Frozen suite hash: `344d3091662158cd6865106846e27a680f29e11e04f136cce1cc2a7bc00567d0` (22/22 green).

Scope: offline pure TS engine — `src/engine/opponents/{types,scripted}.ts` only. No server,
network, accounts, or player-authored opponent data at runtime. SQLi, XSS, authz, SSRF, and
secrets exfiltration do not apply.

## Verdict: PASS_WITH_NOTES

No Critical or Important findings. The async `Opponent` seam is deterministic, side-effect free,
and safe for future network-backed implementations without compromising engine purity today.

## Threat model

Scripts and ids are assembled by internal callers (onboarding wiring, tests) from validated
catalog cannon ids and tuning constants — not from player input. The opponent holds ephemeral
cursor state outside `DuelState`; replay reconstructs from the action log (T-024 AC-19).

## Checklist

| Check | Result | Notes |
| ----- | ------ | ----- |
| No eval / dynamic code | **PASS** | No `eval`, `Function`, dynamic `import`, or runtime code construction in module sources. |
| No wall-clock / `Math.random` | **PASS** | Both methods use `Promise.resolve` synchronously. AC-9 / DoD-5 source scan confirms absence of `Date`, `Math.random`, timers, `performance.now`. |
| Safe error paths | **PASS** | Empty script → `RangeError`; negative `elapsedMs` or unknown `cannonId` → `Error` naming step index. Exhaustion repeats final step (by design — avoids onboarding crash). Promises always resolve; no rejection surface. |
| Script immutability | **PASS** (with note) | Opponent never mutates the input array or step objects (DoD-6). Factory retains a reference — post-construction caller mutation would affect playback; callers are trusted internal assembly code. |
| No secrets | **PASS** | No credentials, URLs, tokens, or PII in either file. |
| Promise surface / engine purity | **PASS** | Interface is the sole async seam (ARCHITECTURE §4.2). Scripted impl resolves immediately without I/O or timers. `view` / `question` are explicitly ignored (`void`) — no engine-state leakage through unused params. Future network ghosts can fill the same shape without changing the reducer. |
| Prototype-safe id / script handling | **PASS** | `id` is stored as a plain string property, never used as a dynamic object key. Script steps are read by numeric index only. `cannonId` membership is checked via `CANNON_IDS.includes()` (equality scan, not `obj[key]` lookup) — immune to `__proto__` / `constructor` key confusion. Returned payloads are fresh literals `{ cannonId }` / `{ correct, elapsedMs }`. |

## Clean

- **Determinism:** Two instances from the same script emit identical five-turn sequences (AC-7). No hidden global or module-level mutable state beyond per-instance cursor/selected.
- **Input validation at construction:** Cannon ids must appear in the T-003-validated `CANNON_IDS` catalog; negative delays rejected before any playback.
- **View/question independence:** Outcomes depend only on the script cursor (AC-4, AC-12). Rival loadout and question content cannot steer scripted playback — reduces injection surface for future callers that pass live duel views.
- **Exhaustion behaviour:** Repeating the final step instead of throwing is fail-safe for onboarding UX; it cannot corrupt reducer state because the reducer owns termination.
- **Scope containment:** Production tree under `src/engine/opponents/` is exactly `types.ts` + `scripted.ts` (DoD-7) — no accidental side modules.

## Minor (recorded, not blocking)

1. **Post-construction script aliasing** — `createScriptedOpponent` captures the caller's `script`
   array by reference and does not snapshot or freeze it. A caller that mutates the array after
   factory creation could change later volleys. Mitigated by: TypeScript `readonly` at call sites,
   developer-authored scripts, and DoD-6 proving the opponent itself never writes into the input.
   Defensive `structuredClone`/`Object.freeze` would be hardening, not required for merge.

2. **Non-finite `elapsedMs` not rejected** — Construction checks `elapsedMs < 0` only; `NaN` and
   `Infinity` pass validation (`NaN < 0` is false). Internal scripts use finite literals; a
   malformed fixture could propagate non-finite timing into reducer math. Content/caller concern,
   not an opponent bypass.

3. **`id` is unconstrained** — Empty string, very long strings, or polluting key names (e.g.
   `__proto__`) are accepted. `id` is never used for dynamic property access — only returned for
   logging and future duel documents. No prototype pollution path.

4. **Off-loadout scripted cannons** — AC-11 adjudication allows returning a scripted `cannonId`
   absent from `rivalLoadout`. Game-logic consistency concern for callers, not a security defect
   in this module.

## Out of scope (future tickets)

- Network ghost replay sanitisation (ARCHITECTURE §13) — belongs on the fetch/deserialise layer,
  not T-018's offline scripted factory.
- Bot PRNG delays (T-021) — must stay PRNG-drawn, never wall-clock; separate review when landed.
- Async reducer driver error handling (T-024) — how rejected Promises from a remote opponent are
  surfaced to the player.

## Follow-up

No code change required for merge on security grounds.
