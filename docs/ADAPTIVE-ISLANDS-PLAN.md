# Adaptive & Endless Islands — the deep plan

*Planning artifact, 2026-08-03. Audited against `main` @ `0f661f7` (post-G10: D-11 win-advance,
D-13 whole-question rule, D-14 curriculum atlas). Four read-only investigations, every claim
file:line-verified. Nothing here is implemented; waves G11–G13 build against this document
after the owner rules the open decisions in §7.*

---

## 1. What this is

The loop we are building, end to end:

```
duel settles ──► telemetry doc (Firestore, anonymous, fire-and-forget)
                     │
                     ▼  Cloud Function, debounced
              OpenRouter analysis ──► /plans/{uid}  {skillWeights, difficultyTarget}
                     │
                     ▼  Cloud Function, rewrite-mode generation
              adaptive pack ──► 7-stage validation gauntlet ──► served to the client
                     │
                     ▼  read on chart entry, re-validated on every hydrate
              duel questions adapt ──► the VOYAGE LOOP makes the sea endless
```

Four layers. Each ships independently, each has a silent fallback to today's exact behavior,
and each can be killed without touching the others.

**The prime directive, engineering form:** a captain with no packs, no plan, and no network
plays a game that is **byte-identical to today — by reference equality, not by luck.** The
injection helper returns the *same object* when nothing applies, so the frozen seed-replay
sweeps prove the no-op path rather than assume it.

---

## 2. Layer 1 — Telemetry (what the game already knows, finally kept)

Every shot's cannon, correctness, and elapsed-ms already exist in the engine's action log
(`src/engine/duel/types.ts`) and die at settlement. We keep them — without touching the log's
frozen exact-`toEqual` shape (`engine/duel/reducer.test.ts:532,860`): skillId is derived at the
app edge from cannonId.

- **Doc**: `telemetry/{uid}/duels/{duelId}`, ~2–3 KB, `v:1`, shots (player rows only, ≤64,
  elapsed clamped), per-skill tally, island, band, won, perfects. **Zero PII**: no name (child-
  typed free text), no flag, and the uid never enters any LLM prompt.
- **Write path**: new `src/services/telemetry.ts` on the injected-seam pattern (headless-
  testable with fakes; the RN Firebase SDK never loads in the node runner). Hook: the existing
  victory/defeat effect in `app/duel.tsx`, only after `applied === true`, `void`-called,
  every await inside try/catch. Defeats emit too — misses are the adaptive signal.
- **Identity**: anonymous auth constructed **lazily inside telemetry.ts on first settlement**
  — `app/_layout.tsx` is untouched, which dodges the layout half of the frozen dormancy
  contract outright. `db === null` (no env) or local-only mode → silent skip: a build without
  Firebase keys behaves bit-for-bit like today. **Env absence is the master kill switch.**
- **Offline**: a 1-deep outbox under a NEW key `cannon-academy/telemetry-outbox` (latest doc
  wins; flushed on next settlement). Covers the kid-tablet app-kill case; accepts loss beyond
  depth 1 by design.
- **Rules**: keep global deny-all, add create-only owner-scoped `telemetry/{uid}/duels/{duelId}`
  (shape-checked, ≤64 shots, no read/update/delete) and get-only `/plans/{uid}`.

**The one green frozen contract this layer must consciously move**:
`firebase.test.ts` spec(A-025:AC-5/AC-8) pins the deny-all rules file. Re-baselined in the same
commit as the rules change, preserving default-deny + enumerated-clause inspection. (The prose
half — reviewer-readiness's "not wired" language — is already baseline-red and owned by the
eventual doc-drift wave.)

## 3. Layer 2 — The relay (server-side, no key ever ships)

- **Production shape**: `functions/` workspace (Cloud Functions v2, Node 20, us-central1;
  Blaze already active). Trigger `onDocumentCreated(telemetry/...)` with a per-uid debounce:
  regenerate only if the plan is >20h old OR ≥5 duels newer. Reads the last 20 telemetry docs,
  one OpenRouter call (flash-class model), writes `/plans/{uid}`.
- **Plan doc**: `{ v:1, basedOnDuels, generatedAt, skillWeights: Partial<Record<SkillId,0..1>>,
  difficultyTarget: 0..1 }`. The LLM **re-weights skills that already exist; it can never add
  one** — the reader drops unknown keys against `SKILL_IDS` and clamps every survivor through
  the same `minGrade <= maxGradeForBand` rule the duel tray uses, failing closed on null band.
- **Reader**: `src/services/plan.ts` — fetch on chart entry with a short timeout, zod-parse,
  ceiling-clamp, cache under NEW key `cannon-academy/plan`, export `planOrNull()`.
  Null → exactly today's behavior.
- **Key security**: OPENROUTER key lives in Cloud Secret Manager only. The client-direct
  shortcut is **rejected even for demos** — a bundled key is public and exfiltrates a child's
  gameplay device-to-third-party. Demo stepping stone instead: a `tools/` node script (service
  account + local env key) running the same prompt against real telemetry — demoable the day
  Layer 1 lands, before any Function is deployed.
- **Cost at 1k DAU**: debounced ≈ **$9/month** (per-duel would be ~$45). Telemetry writes
  themselves are noise (<$1).

## 4. Layer 3 — Adaptive packs (LLM content that cannot hurt anyone)

### Rewrite-mode, now enforced rather than trusted

The LLM writes **prose only**. Each pack names its `archetypeId` — a real authored template in
`TEMPLATE_POOLS[skill]` — and the validator **deep-equals** the pack's params, constraints,
answerExpr, and distractors against that archetype. Math correctness is inherited, not
reviewed. Archetype selection per (island, band): the cell's headline skill, word-problem
templates only. Symbolic-only skills (including `place_value_teens`'s closed word list) are
excluded from generation entirely — there is no prose surface to rewrite.

### The 7-stage gauntlet — `src/content/packs/validate.ts`, one pure module

1. **Strict envelope parse** — `templateSchema` verbatim as the LLM contract; hallucinated
   fields die at parse; ids `pack_`-prefixed and disjoint from authored + riddle id spaces.
2. **Cell + ceiling, twice** — skill ∈ `islandCurriculumFor(islandId, band).skills` AND
   `minGrade <= maxGradeForBand(band)`, redundant on purpose (defense in depth).
3. **Static lints** — every `{token}` declared and live; exactly 3 distinct distractors.
4. **Band language lint** — the K-1 ×/÷ glyph AND operator-word ban carried into runtime
   (the frozen sweep only sees authored files; this is the gap it cannot cover).
5. **30-seed generation sweep per template** — zero throws, constraints re-verified, 4 distinct
   choices, answer correct, ladder fill <25%. A crash in front of a child is unrepresentable.
6. **FITTED typography bounds** — rendered length ≤140/160 chars, the proven ceiling.
7. **D-13 clarity lint** on word problems — trailing `?`, ≥5-word closing sentence, action verb.

Nothing is extracted from frozen test files — the heavyweight pieces are already exported src
functions; the ≤10-line predicates are reimplemented, with a **parity suite** running the
runtime lints over every authored pool so the two implementations can never drift.

### Storage & quarantine

Packs live under their **own key** (`cannon-academy/packs/v1`), never inside the captain
envelope — the captain is serialized wholesale on every store change, and +25 KB of pack on
the hot write path is the exact write-amplification bug the scaling audit named. The band-tear
risk a second key creates is closed by rule: **every load re-runs the full gauntlet against
the live captain's band and the current catalog**, dropping failures and band-mismatches
silently. Quarantine is therefore automatic, per-pack, on every hydrate — and a catalog change
in an app update invalidates stale packs by construction. *(Owner may overrule toward the
captain-field home; both were costed — see decision 3.)*

### Injection — the seams that keep replay honest

- `legacyConfig` in `src/stores/duel.ts` stays **byte-identical** (its `templatesBySkill:
  TEMPLATE_POOLS` line is pinned by a frozen source scan). A new `armAdaptivePacks(config,
  captain)` wraps it at exactly two call sites (boot + rematch), **appending** pack templates
  after the whole, file-ordered authored pool for the one target skill — and returning the
  *same reference* when no pack applies.
- `nextQuestion` / `templatesForSkill` / `TEMPLATE_POOLS` stay pack-blind — every A-014 and
  A-058 seed-identity pin passes untouched because its fixtures are pack-less by construction.
- The engine already deep-copies pools at duel boot (pinned), so a pack refresh mid-duel
  cannot reach a running duel; rivals provably ignore pools (their answers come from the bot's
  own rng); the guided tutorial never sees packs.
- Drills can consume packs through the same merge helper behind `openDrill`'s existing gates —
  one line, no seed pins exist there — timing is an owner call (decision 6).

**The single contract that cannot be dodged**: the frozen source pin's *comment* says "the
pools are handed over whole — the replay contract." Packs bend that intent: the replay key
becomes **{seed, action log, pack set}**. This must be ruled (D-15), not slipped past a
still-green regex.

## 5. Layer 4 — "Endless": the VOYAGE LOOP (recommended shape)

Three candidate shapes were costed honestly:

| Shape | Verdict |
|---|---|
| **(a) Voyage loop** — after Grandline, the chain re-arms; same five islands, escalating packs | **MVP.** No enum change, no new art, no board. D-11's own text predicted it. |
| (b) Uncharted Sea — one repeatable 6th island | Real but not small: reopens the closed IslandId enum, needs a 3-band curriculum cell, enemy row, hull entry, glyph, a sixth host species, and **a republished sea-chart board**. Later, board-first. |
| (c) Procedural archipelago | Rejected: dissolves every total Record, the transcription-test discipline, and the board-measurement rule wholesale. |

The loop mechanics: a `voyage` counter on the captain (tolerated-as-absent), an **explicit**
`beginNextVoyage` action (never a settlement side effect — the win-advance chain-end pin stays
frozen) guarded on a complete chain, surfaced as a NEW VOYAGE affordance in the dock's
currently-silent complete state. Everything else — coins, mastery, cannons, receipts, met
rivals — is untouched; `chartProgress` re-arms itself with zero changes. Escalation is
**content** (harder packs within the ceiling), never tuning, in v1. What makes voyage 2 feel
different is Layer 3; the loop is the cheapest surface that makes packs matter.

## 6. Failure containment (the "does not break anything" matrix)

| Failure | Containment |
|---|---|
| Offline / no env / no plan / no pack | Same-reference no-op — byte-identical play, proven by reference equality in the new frozen suite |
| LLM writes garbage | 7-stage gauntlet at generation AND on every hydrate; failures quarantine silently |
| LLM invents a skill / exceeds ceiling | Unrepresentable: closed enums at parse + cell membership + double ceiling check + reader clamp |
| A pack template throws mid-duel | Unrepresentable: 30-seed sweep is a hard gate; a throw quarantines the pack before it can ever be served |
| Network latency | Never blocking: telemetry fire-and-forget, plans cached, packs read at chart entry |
| API key leakage | Key never exists client-side; Secret Manager only; the demo path is a local tools/ script |
| Runaway cost | Debounced relay (~$9/mo per 1k DAU); per-uid regeneration guard; hard caps on pack size/count |
| Replay/audit drift | D-15 ruling names the new replay key; pack ids receipt-adjacent for reconstruction |
| Kid re-banded mid-life | Hydrate-time band check drops mismatched packs; plan reader clamps per current band |
| Full kill needed | Delete env keys (client goes fully dormant) or delete the Function (plans stop; game degrades to static gracefully) |

## 7. Decisions only the owner can make (blocking, in order of bite)

1. **D-15 — the replay contract**: ratify *replay key = {seed, action log, pack set}* and the
   companion `armAdaptivePacks` pin, keeping the frozen source scan green. Gates the duel seam.
2. **The endless shape**: confirm VOYAGE LOOP for MVP; Uncharted Sea deferred until a
   republished sea-chart board exists.
3. **Pack storage home**: separate quarantinable key (recommended, hot-path safe) vs captain
   envelope (atomic with band). §4 argues the key; either works.
4. **K-1 stance for v1**: rewrite-mode excludes symbolic-only skills, so the youngest band gets
   little-to-no LLM content — ratify "K-1 sails authored content only in v1" explicitly.
5. **Rules re-baseline sign-off**: firebase.test.ts AC-5/AC-8 (deny-all → default-deny +
   enumerated owner-scoped clauses).
6. **Drills**: packs in the practice range at v1, or duel-only first? (One line either way.)
7. **Privacy posture**: anonymous uid is still a persistent identifier — internal-operations
   stance, no parental gate in v1, env-absence as kill switch. Confirm.
8. **Voyage-loop UX**: entry affordance (explicit dock tap recommended), child-facing copy, and
   whether encounters replay on voyage 2+ (recommended: hosts greet once, latch stays).
9. **Caps**: 5 packs/captain, ≤12 templates/pack, 20h/5-duel relay debounce — ratify numbers.
10. **Relay model**: flash-class via OpenRouter (~$0.001/call at these token sizes).

## 8. The waves

| Wave | Tickets | Ships | Risk | Hours |
|---|---|---|---|---|
| **G11** | A-072 telemetry write · A-073 relay + plan reader | Plans exist; console demo via tools/ script; **zero gameplay change** | Rules re-baseline only | ~22 |
| **G12** | A-074 gauntlet module · A-075 generation leg · A-076 injection + D-15 | Duels adapt for pack-carrying captains; everyone else byte-identical | The D-15 seam | ~28 |
| **G13** | A-077 voyage loop + affordance | The sea becomes endless | Additive only | ~20 |

Each wave: full-suite gate against the 9-red baseline, tsc clean, on-device verification,
per-ticket commits, no push without owner confirmation — the standing discipline.
