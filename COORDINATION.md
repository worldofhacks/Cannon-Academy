# Two-track coordination — engine swarm vs app shell

Two agents are working this repo concurrently. This file is the contract between them.
**Read it before writing anything.**

## Tracks

| Track             | Branch                                     | Owner         | Scope                                                                                                             |
| ----------------- | ------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| **A — engine**    | `swarm/engine-core` + `ticket/*` worktrees | the TDD swarm | `src/engine/**`, `src/content/**`, `__tests__/**`, `tickets/**`, `.tdd-swarm/**`                                  |
| **B — app shell** | `app/shell` (worktree `.worktrees/wt-app`) | the app build | `app/**`, `src/theme/**`, `src/components/**`, `src/stores/**`, `src/services/**`, `assets/index.ts`, Expo config |

## Shared files — coordinate before touching

These are the only real collision points:

- **`package.json` / `package-lock.json`** — Track B adds the Expo/RN dependency tree. Track A should
  add nothing here; if it genuinely must, say so first.
- **`tsconfig.json`** — Track B adds `jsx`, RN types, and any new path aliases. Existing aliases
  (`@engine/*`, `@content/*`) do not change.
- **`eslint.config.js`** — Track B adds an `app/**` + `src/components/**` block. The engine-purity
  and determinism rules for `src/engine/**` and `src/content/**` **must not be relaxed** — they are
  what keep the engine headless and replayable.

## The invariant that matters

**Track B consumes the engine; it never edits it.** If the app needs an engine change, that is a
ticket on Track A, not an edit on `app/shell`. The engine is pure TypeScript with zero React/RN
imports and that is lint-enforced — an app-shaped change reaching into `src/engine/**` breaks the
property the whole test suite rests on.

Conversely, **Track A must not add UI**. `app/**` and `src/components/**` are out of every ticket's
`file_scopes` by construction.

## Merging

Track B rebases onto `swarm/engine-core` regularly and merges back when the shell is stable.
Neither track pushes to `main` — main moves only by owner-approved PR.

## Current state at the time of writing

- Engine: Wave 5 — **T-014…T-020 + T-034 done** (Wave 5 complete) (templates + range drill; drill API published below).
  **T-035** shipped `TRAY_CAPACITY` — A-011 unblocked. **T-029 / D-7** shipped (`add_within_10` on Port Sumwich + `saker` range payoff; early Isla Products fog accepted). Owner ruling **D-6** on **T-032**.
  Push `swarm/engine-core` after every ticket merge.
- App track (`app/shell`): owns presentation; currently uses a placeholder question service that
  must not ship — real templates from T-014…T-016 replace it.
- iOS: Simulator + Expo web demo path; TestFlight gated on Apple Developer enrollment.

## Published engine APIs (Track A → Track B)

### T-017 — Gunnery-range drill (`@engine/drill`)

Source: `src/engine/drill.ts` (merged on `swarm/engine-core`).

```ts
export interface DrillAnswer {
  readonly templateId: string;
  readonly choiceIndex: number | null; // null = timed out (counts as miss)
  readonly correct: boolean;
  readonly elapsedMs: number;
}

export interface DrillSession {
  readonly skillId: SkillId;
  readonly rng: Rng;
  readonly length: number;
  readonly answered: number;
  readonly correct: number;
  readonly recentTemplateIds: readonly string[]; // most-recent-first
  readonly mastery: SkillMastery; // updated at full rate after each answer
  readonly current: Question | null; // null once complete
  readonly complete: boolean;
  readonly log: readonly DrillAnswer[];
  readonly templates: readonly Template[]; // retained for generate / restore
}

export function startDrill(input: {
  readonly skillId: SkillId;
  readonly templates: readonly Template[];
  readonly mastery: SkillMastery;
  readonly rng: Rng;
  readonly length: number; // integer >= 1
}): DrillSession;

export function answerDrill(
  session: DrillSession,
  choiceIndex: number | null,
  elapsedMs: number,
): DrillSession;
```

Notes for Track B (`app/range.tsx`):

- Mastery fills via `applyAnswer(..., 'range', ...)` at full rate; caller runs `resolveUnlocks`.
- Timeout = `choiceIndex === null` (miss, not skip). No `Date` / `Math.random` in the engine.
- Session is plain JSON (interrupt/restore safe). Post-complete `answerDrill` throws.
- Inject a skill's template pool; do not edit `src/engine/**` from the app track.

### T-018 — Opponent interface + scripted rival (`@engine/opponents`)

Sources: `src/engine/opponents/types.ts`, `src/engine/opponents/scripted.ts`.

```ts
export interface Opponent {
  readonly id: string;
  chooseAction(view: RivalView): Promise<RivalAction>; // { cannonId }
  produceAnswer(question: Question): Promise<OpponentAnswer>; // { correct, elapsedMs }
}
export interface OpponentAnswer {
  readonly correct: boolean;
  readonly elapsedMs: number;
}
export interface ScriptedStep {
  readonly cannonId: CannonId;
  readonly correct: boolean;
  readonly elapsedMs: number;
}
export function createScriptedOpponent(input: {
  readonly id: string;
  readonly script: readonly ScriptedStep[]; // >= 1
}): Opponent;
```

Notes for Track B: Promises resolve immediately (no wall-clock). Exhausted script repeats last step.
Onboarding hull arithmetic uses `ONBOARDING_ENEMY_HULL` (T-004); assemble the duel in the app, not here.

### T-020 — Duel reducer (`@engine/duel/reducer` + `@engine/duel/types`)

Sources: `src/engine/duel/reducer.ts`, `src/engine/duel/types.ts` (T-013), `src/engine/duel/damage.ts` (T-008).

**Do not edit `src/stores/duel.ts` from Track A** — the store is Track B; it must call the pure reducer.

```ts
export type DuelPhase =
  | 'countdown'
  | 'playerChoose'
  | 'reload'
  | 'resolvePlayer'
  | 'rivalTurn'
  | 'resolveRival'
  | 'victory'
  | 'defeat';

export type DuelEvent =
  | { readonly type: 'CANNON_SELECTED'; readonly cannonId: CannonId }
  | { readonly type: 'ANSWER_CHOSEN'; readonly choiceIndex: number; readonly elapsedMs: number }
  | { readonly type: 'TIMER_EXPIRED' }
  | { readonly type: 'ANIMATION_DONE' }
  | { readonly type: 'RIVAL_ACTION'; readonly volley: RivalVolley };

export function createDuelState(config: DuelConfig): DuelState;
export function duelReducer(state: DuelState, event: DuelEvent): DuelState;
export function toRivalView(state: DuelState): RivalView;
export function isTerminalPhase(phase: DuelPhase): boolean;
```

Notes for Track B:

- Out-of-phase / invalid payloads return the **same state reference** (`===`) — skip re-render.
- Drive the scripted/banded opponent via `Opponent` (T-018); feed `RIVAL_ACTION` with its volley.
- Mastery: apply `result.tally.bySkill` at half rate through T-010 after the duel ends (store).
- Terminal order: `enemyHull <= 0` → victory, else `playerHull <= 0` → defeat.

### T-035 — Tray capacity (`TRAY_CAPACITY`)

`src/engine/tuning.ts` exports `TRAY_CAPACITY = 3`. App gun deck (A-011) must import this — no UI literal.
Loadout _selection_ rules remain T-030 (`src/engine/loadout.ts`, still backlog).

### T-021 — Mercy + banded bot (`@engine/opponents`)

`mercy.ts`: `MercyState`, `emptyMercyState`, `recordPlayerAnswer`, `recordDuelResult`,
`playerRecentAccuracy`, `targetBotAccuracy`, `consumeForcedMisfire`.
`bot.ts`: `createBotOpponent({ id, loadout, accuracy, forcedMisfires, rng })` → `Opponent`.
Store owns MercyState between duels; pass `targetBotAccuracy` + `forcedMisfiresRemaining` into the bot at duel start.
