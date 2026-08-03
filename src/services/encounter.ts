/**
 * The island encounter's pure pieces — which skill greets you, which riddle asks it, and what a
 * finished hello writes on the captain.
 *
 * A-066. The component (`src/components/encounter/EncounterCard.tsx`) is a thin caller of these
 * three functions, because the component renders headless-untestable RN and every behavioural
 * promise the ticket makes lives HERE, where `__tests__/app/encounter.test.ts` can drive it:
 *
 *   * `encounterSkillFor` — the band adjustment, which is the point of the ticket.
 *   * `riddleFor`         — the real generator over the authored riddle pools (never the duel's).
 *   * `completeEncounter` — the latch and the coins, one commit, no wrong outcome.
 *
 * ── The band rule (AC-3) ──────────────────────────────────────────────────────────────────────
 *
 * The riddle's skill is the island's first band-eligible `rangeSkill`, under the SAME eligibility
 * ceiling the entry cannon uses (`maxGradeForBand` over the skill's `minGrade`, exactly
 * `engine/mastery.ts`'s `teachesInBand` / `services/range.ts`'s `skillInBand`) — and, because a
 * greeting should meet a captain AT their level rather than at the island's lowest rung, "first"
 * scans the island's rungs in catalog order for one the band has not already outgrown
 * (`skill.maxGrade >= the band's own first grade`). Concretely, from the ticket's own examples:
 * a K-1 captain arriving at Isla Products is asked repeated addition; a g4_5 captain at the same
 * island — for whom every rung there is outgrown — gets the hardest in-ceiling rung, which is
 * multiplication. Nobody is EVER asked above their ceiling, in either branch.
 *
 * And the ceiling fails CLOSED, the same posture as `skillInBand` and for the same reason: a
 * `null` band is a captain the app has not placed, a corrupt band is a save an older build wrote,
 * and both answer `null` — the encounter then asks nothing and completes latch-only, which is a
 * state a child can act on, where a throw is a red box in front of one.
 *
 * ── The payout (AC-4) ─────────────────────────────────────────────────────────────────────────
 *
 * `captain.seenEncounters` is a LATCH, not a receipt — A-041's `duel:`/`purchase:` grammar is
 * frozen and gains no third kind. The latch is simultaneously the shown-once guard and the coin
 * idempotency: coins and latch land in ONE `replaceCaptain` (addCoins-style union, clamped at
 * zero like the store's own action), so there is no interleaving in which the +8 pays twice or
 * pays without latching. A replayed completion — StrictMode's double effect, a re-observed
 * summary, a second tap — finds the latch and pays nothing.
 */
import { getIsland, getSkill } from '@content/index';
import type { GradeBand, IslandId, SkillId } from '@content/schemas';
import { GRADE_BANDS } from '@content/schemas';
import { maxGradeForBand } from '@engine/placement';
import { generateQuestion } from '@engine/questions/generator';
import type { Question } from '@engine/questions/types';
import type { Rng } from '@engine/rng';

import { riddleTemplatesFor } from '../content/riddles';

import type { CaptainStore } from '../stores/player';

/**
 * What a right answer pays, once, ever, per island. A literal here rather than in
 * `engine/tuning.ts` for the same reason as `RANGE_DRILL_LENGTH`: adding an engine constant is
 * engine-track scope, and no tuned behaviour reads this — it is the board's own `+8 coins`
 * strip, a ceremony number. Deliberately small against the duel purse so the hello can never
 * compete with the chest.
 */
export const ENCOUNTER_COINS = 8;

/**
 * Each band's own FIRST grade — the floor that decides whether a rung is "at the captain's
 * level" or already outgrown. Derived from the band ids themselves (k_1 starts at K, g2_3 at
 * grade 2, g4_5 at grade 4); the CEILING half of the pair stays `maxGradeForBand`, shared with
 * placement so the two ends of the band can never disagree with the rest of the app.
 */
const BAND_FLOOR_GRADE: Record<GradeBand, number> = { k_1: 0, g2_3: 2, g4_5: 4 };

/**
 * The skill an island's host asks a captain of `band` — or `null`, which the caller must read as
 * "ask nothing, latch and move on".
 *
 * Total over everything a save can carry: `null`, `undefined` and unrecognised band strings all
 * answer `null` (fail closed — see module docs). Within the ceiling, the island's `rangeSkills`
 * are scanned in catalog order (the catalog authors them low rung to high; `catalogs.test.ts`
 * AC-14 pins the arrays) for the first the band has not outgrown; when the whole island is below
 * the captain — every in-ceiling rung's `maxGrade` under the band's floor — the hardest
 * in-ceiling rung is asked instead, because "too easy" is merely warm and "nothing" is a host
 * with no riddle.
 */
export function encounterSkillFor(
  islandId: IslandId,
  band: GradeBand | null | undefined,
): SkillId | null {
  if (band === null || band === undefined) return null;
  if (!(GRADE_BANDS as readonly unknown[]).includes(band)) return null;

  const ceiling = maxGradeForBand(band);
  const floor = BAND_FLOOR_GRADE[band];

  // The band filter — the entry cannon's own ceiling, applied at the one place the encounter
  // chooses a skill. Everything after this line sees only skills the band may be asked.
  const eligible = getIsland(islandId).rangeSkills.filter(
    (skillId) => getSkill(skillId).minGrade <= ceiling,
  );
  if (eligible.length === 0) return null;

  const atLevel = eligible.find((skillId) => getSkill(skillId).maxGrade >= floor);
  if (atLevel !== undefined) return atLevel;

  // Every rung the island teaches is below the captain — greet them with the hardest of them.
  return eligible.reduce((hardest, skillId) =>
    getSkill(skillId).minGrade >= getSkill(hardest).minGrade ? skillId : hardest,
  );
}

/**
 * One riddle for `skill`, from the REAL generator over the riddle pools (`@content` riddles
 * first, the skill's plain duel templates as a local fallback — see `content/riddles.ts`). The
 * advanced `Rng` is returned exactly as the engine returned it; the encounter asks one question
 * and never needs it, but a pure function does not eat state its caller might.
 */
export function riddleFor(skill: SkillId, rng: Rng): readonly [Question, Rng] {
  return generateQuestion({ templates: riddleTemplatesFor(skill), recentTemplateIds: [], rng });
}

/** What one completion actually did — `applied: false` means the latch was already set. */
export interface EncounterOutcome {
  readonly applied: boolean;
  /** Coins THIS call paid: `ENCOUNTER_COINS` for a first correct completion, `0` otherwise. */
  readonly coinsPaid: number;
}

/**
 * Ends an island's encounter on the captain: sets the shown-once latch, and pays the +8 exactly
 * when this is the island's FIRST completion and the riddle was answered right.
 *
 * Both outcomes land here — right, wrong, the grown-up skip, and the ask-nothing fallback are
 * all one call with `correct` true or false — because "no wrong outcome" is a store property as
 * much as a screen one: every path sets the same latch and differs only in the payout.
 *
 * One `replaceCaptain`, always: the coin union and the latch are a single commit, so the
 * idempotency guard above them covers both or neither. Nothing else is touched — no receipts
 * (A-041's key grammar is frozen), no mastery, no unlocks. A replayed completion returns
 * `{ applied: false, coinsPaid: 0 }` and writes nothing at all.
 */
export function completeEncounter(
  store: CaptainStore,
  islandId: IslandId,
  correct: boolean,
): EncounterOutcome {
  const state = store.getState();
  const captain = state.captain;

  // The latch IS the idempotency. Checked before any write, so a second completion — whatever
  // path it arrives by — cannot pay, cannot re-latch, cannot even emit a store notification.
  if (captain.seenEncounters.includes(islandId)) {
    return { applied: false, coinsPaid: 0 };
  }

  const coinsPaid = correct ? ENCOUNTER_COINS : 0;
  state.replaceCaptain({
    ...captain,
    // Clamped like `addCoins` clamps: the store is the last place a bad balance can be stopped
    // before it reaches a child's screen, and this write bypasses the action that would clamp.
    coins: Math.max(0, captain.coins + coinsPaid),
    seenEncounters: [...captain.seenEncounters, islandId],
  });

  return { applied: true, coinsPaid };
}
