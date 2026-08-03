/**
 * The gunnery range — what is drillable, where its questions come from, and what a finished
 * drill is worth.
 *
 * A-009. `src/engine/drill.ts` (T-017) has been merged for a full wave with zero callers: the
 * engine can already run a full-rate practice loop, and nothing in the app could open one. Two
 * MVP checklist items sat at zero because of it — "run a practice drill that fills a mastery
 * meter" and "the meter unlocks the next cannon".
 *
 * PLAN.md sets the cut line: **reuse the duel question UI against a stationary target buoy — a
 * meter, not a new mode.** So there is no opponent here, no hull, no damage and no cannon. This
 * module is deliberately three functions wide, because the middle of a drill is already solved:
 * `answerDrill` is pure, published, and folds mastery at `MASTERY_RATE_RANGE` itself, so
 * `app/range.tsx` calls it directly exactly as `app/duel.tsx` calls the duel reducer. What the
 * engine cannot do is decide WHICH skills an island lets you drill, find that skill's authored
 * template pool, and write the result onto the captain. Those three are this file, and that is
 * the whole of it.
 *
 * Two rules govern it, both inherited from A-008's `duelRewards.ts`:
 *
 *  1. **It prices nothing itself.** The fill rate belongs to `applyAnswer(..., 'range', ...)`
 *     inside the engine, and reaches the captain through the store's `recordRangeAnswers`. The
 *     unlock rule belongs to `resolveUnlocks`. No rate, threshold or meter literal appears below.
 *  2. **It commits exactly once per session.** React re-renders, StrictMode fires effects twice,
 *     and a finished drill can be observed many times — anything applied per OBSERVATION fills
 *     the meter at double the tuned rate, which is precisely the bug this ticket exists to
 *     prevent, arriving through the back door.
 *
 * No React import: the logic is frozen-tested headless (`__tests__/app/range.test.ts`), and the
 * screen is a thin caller.
 */
import { getSkill, islandCurriculumFor } from '@content/index';
import type { CannonId, GradeBand, IslandId, SkillId } from '@content/schemas';
import { GRADE_BANDS } from '@content/schemas';
import { startDrill, type DrillSession } from '@engine/drill';
import { emptyMastery, isMastered, meterPercent, type SkillMastery } from '@engine/mastery';
import { maxGradeForBand } from '@engine/placement';
import type { Rng } from '@engine/rng';

import { templatesForSkill } from './templatePools';

import type { Captain, CaptainStore } from '../stores/player';

/** Everything the range summary announces, plus whether any of it actually happened. */
export interface RangeDrillOutcome {
  /** False when this session was already committed, or has not finished yet. */
  readonly applied: boolean;
  readonly skillId: SkillId;
  /** Raw corrects actually credited; `0` when not applied. */
  readonly correct: number;
  /** Raw attempts actually credited; `0` when not applied. */
  readonly asked: number;
  /** Cannons newly granted BY THIS COMMIT — a grant nobody is told about is a reward that did not happen. */
  readonly unlockedCannons: readonly CannonId[];
  /** Islands whose fog this commit lifted. */
  readonly unlockedIslands: readonly IslandId[];
  /** The 0-100 meter AFTER the commit, so the screen and the store cannot disagree. */
  readonly meterPercent: number;
  /** Whether the skill now clears BOTH mastery gates (weighted corrects and the accuracy floor). */
  readonly mastered: boolean;
}

/**
 * How many questions a drill asks when the caller does not say.
 *
 * A literal, and it is not in `engine/tuning.ts` on purpose: adding a constant there is
 * engine-track scope (COORDINATION.md), and no tuned behaviour depends on this number — the
 * fill rate does, and that IS in tuning. It is the number of questions a child is asked before
 * the summary appears, which is a screen-pacing decision. `MASTERY_THRESHOLD_CORRECT` worth of
 * questions is the honest choice: a perfect drill from empty masters the skill in exactly one
 * visit, which is what makes the meter legible. When T-019 or a pacing ticket wants this tuned,
 * it moves to `tuning.ts` and this export becomes a re-export.
 */
export const RANGE_DRILL_LENGTH = 10;

// ── The authored template pool ──────────────────────────────────────────────────────────────
//
// It used to be built here, from nine static JSON imports. A-014 put the duel on the same
// generator, so the table moved to `services/templatePools.ts` verbatim and both callers import
// it — two tables built from the same nine files is a drift hazard the moment a tenth skill
// lands. The loading rules (static imports rather than `fs`, every entry validated through
// `templateSchema`, file order preserved because `pick` indexes into it) moved with it and are
// documented there.

// ── Which drills each captain has already been paid for ─────────────────────────────────────
//
// Scoped PER STORE, not module-global, for the same reason as A-008's duel ledger: the question
// is "has THIS captain been credited for this drill", and one shared set would rob a second
// captain of a drill the first was credited for while quietly making any suite that touches it
// order-dependent. `WeakMap`/`WeakSet` so a discarded store, or a discarded session, takes its
// entry with it.
//
// The identity is the finished session OBJECT rather than a content hash, because `DrillSession`
// carries no id and a hash cannot tell an honest repeat drill from a re-render: two drills of the
// same skill at the same seed from the same captain state are byte-identical and the second one
// is real practice. Object identity is exactly what a double-effect or a re-observed summary
// hands over twice, and exactly what a fresh drill never collides with.

const committedDrills = new WeakMap<CaptainStore, WeakSet<DrillSession>>();

function ledgerFor(store: CaptainStore): WeakSet<DrillSession> {
  const existing = committedDrills.get(store);
  if (existing !== undefined) return existing;
  const fresh = new WeakSet<DrillSession>();
  committedDrills.set(store, fresh);
  return fresh;
}

/** The ids present in `after` that were not in `before` — this commit's own grants. */
function granted<T>(before: readonly T[], after: readonly T[]): readonly T[] {
  const already = new Set(before);
  return after.filter((id) => !already.has(id));
}

/** The outcome for a drill that credits nothing — unfinished, or already committed. */
function noCredit(captain: Captain, skillId: SkillId): RangeDrillOutcome {
  const mastery = masteryFor(captain, skillId);
  return {
    applied: false,
    skillId,
    correct: 0,
    asked: 0,
    unlockedCannons: [],
    unlockedIslands: [],
    // Reported from the stored captain, not zeroed: a re-render that re-observes a settled drill
    // must still be able to draw the meter it is looking at.
    meterPercent: meterPercent(mastery),
    mastered: isMastered(mastery),
  };
}

function masteryFor(captain: Captain, skillId: SkillId): SkillMastery {
  return captain.mastery[skillId] ?? emptyMastery;
}

// ── The curriculum ceiling, as ONE rule (A-058's lesson, applied to practice) ─────────────────
//
// `services/loadout.ts` learned this the hard way: the band gated ACQUISITION in five places, every
// one of them had to remember, and one forgot — a chest granted `nine_pounder` to a K-1 captain and
// the duel asked them "How many tens are in 807?". The fix was to gate at the ONE place questions
// are chosen, so a grant path added tomorrow inherits the ceiling without knowing it exists.
//
// The range's equivalent single place is the SKILL, because a drill asks `templatesForSkill(skill)`
// and nothing else. `asksInBand` is the cannon-shaped sibling of the function below and could not
// be reused directly — it takes a `Cannon` and reads `getSkill(cannon.skill)`, and the range never
// has a cannon in hand — but the RULE is deliberately identical, including the part that matters
// most: **a missing or corrupt band fails CLOSED**. Since D-14 (A-070) `engine/mastery.ts` reads
// an absent band the same way — no cell, no island, no entry gun — so every door in the app now
// shares this posture.

/**
 * Whether the questions this skill generates are inside `band`'s ceiling.
 *
 * Total over every input, including the ones a save can really carry. `maxGradeForBand` THROWS for
 * `null`, for `undefined`, and for a band string an older build wrote under a different name — and
 * a throw reaching the range screen is a red box in front of a five-year-old, not a safety
 * property. So the band is validated here and anything unrecognised answers `false`: no band, no
 * drills. The screen then shows its "No drills ready" panel and the way back to the chart, which is
 * a state a child can act on.
 */
export function skillInBand(skillId: SkillId, band: GradeBand | null | undefined): boolean {
  if (band === null || band === undefined) return false;
  if (!(GRADE_BANDS as readonly unknown[]).includes(band)) return false;
  return getSkill(skillId).minGrade <= maxGradeForBand(band);
}

/**
 * The skills an island's gunnery range trains A CAPTAIN OF THIS BAND, in the cell's teaching
 * order (D-14 — `islandCurriculumFor`, the one door to island content).
 *
 * Straight from the band's cell — a superset would let a child grind a skill their island does
 * not teach them, and a subset silently strands the cannon that skill unlocks.
 *
 * **No band, no drills** (A-070 AC-5). The pre-D-14 signature let a band-less caller read "the
 * island's whole authored list", because one shared list existed to read; under the atlas there
 * is no bandless truth about what an island teaches, so `null`, `undefined` and the corrupt band
 * strings a save can carry all answer the empty list — the same fail-closed posture as
 * `skillInBand`, and the state the range screen already renders as "No drills ready".
 *
 * The `skillInBand` filter survives as the runtime ceiling tripwire: a lawful catalog never
 * trips it (A-069's validator bans over-ceiling cells), a corrupt future one fails closed.
 */
export function rangeSkills(islandId: IslandId, band: GradeBand | null | undefined): readonly SkillId[] {
  if (band === null || band === undefined) return [];
  if (!(GRADE_BANDS as readonly unknown[]).includes(band)) return [];
  return islandCurriculumFor(islandId, band).skills.filter((skillId) => skillInBand(skillId, band));
}

/**
 * Opens a live drill at an island's range.
 *
 * Throws when the skill is not one this island trains — refusing loudly rather than quietly
 * drilling something the range does not teach.
 *
 * The session's mastery is SEEDED from the captain's stored meter. A drill that starts every
 * session at zero shows a child a bar that resets each time they practise, and makes the live
 * meter and `commitDrill` disagree about where the drill ended up.
 */
export function openDrill(input: {
  readonly islandId: IslandId;
  readonly skillId: SkillId;
  readonly captain: Captain;
  readonly rng: Rng;
  readonly length?: number;
}): DrillSession {
  // The ceiling, and it THROWS rather than returning empty — the opposite posture to the screen's.
  // `openDrill` is only ever reached from a card a child pressed, so an out-of-band skill arriving
  // here means a caller built an offer the band filter should already have removed. Failing loudly
  // is what keeps that a test failure instead of a lesson three years early; `range-band.test.ts`
  // AC-5 pins the throw for a null band, for a corrupt one, and for an over-grade skill.
  const gradeBand = input.captain.gradeBand;
  if (!skillInBand(input.skillId, gradeBand)) {
    throw new RangeError(
      `openDrill: '${input.skillId}' (minGrade ${getSkill(input.skillId).minGrade}) is outside the ` +
        `${JSON.stringify(gradeBand)} grade ceiling`,
    );
  }

  const drillable = rangeSkills(input.islandId, gradeBand);
  if (!drillable.includes(input.skillId)) {
    throw new RangeError(
      `openDrill: '${input.skillId}' is not trained at ${input.islandId} — its range drills ${
        drillable.length === 0 ? 'nothing' : drillable.join(', ')
      }`,
    );
  }

  return startDrill({
    skillId: input.skillId,
    templates: templatesForSkill(input.skillId),
    mastery: masteryFor(input.captain, input.skillId),
    rng: input.rng,
    length: input.length ?? RANGE_DRILL_LENGTH,
  });
}

/**
 * Writes a finished drill onto the captain: mastery at the full rate, and whatever that unlocked.
 *
 * Safe to call on any session at any time. An unfinished drill and an already-committed one both
 * return `applied: false` and change nothing — and an unfinished one is NOT recorded as committed,
 * because the screen will observe a session mid-drill and burning its one commit there would mean
 * the drill finishes and pays nothing (the A-008 failure mode, in a new place).
 *
 * Nothing but mastery is touched. There is no hull to damage, no purse to charge and no rank to
 * lose: the range is a buoy, so a wrong answer costs an attempt and nothing else. That is a
 * pedagogy guarantee — a child told practice is safe and then charged for a guess has been lied
 * to by the software.
 */
export function commitDrill(store: CaptainStore, session: DrillSession): RangeDrillOutcome {
  const before = store.getState().captain;
  const skillId = session.skillId;

  if (!session.complete) return noCredit(before, skillId);

  const ledger = ledgerFor(store);
  if (ledger.has(session)) return noCredit(before, skillId);
  ledger.add(session);

  // `asked` carries the wrong answers with it: crediting only the corrects would inflate accuracy
  // and hollow out the mastery gate the unlock hangs on. The store folds them at the range rate
  // and applies the unlocks — this file re-derives neither.
  store.getState().recordRangeAnswers(skillId, { correct: session.correct, asked: session.answered });

  const after = store.getState().captain;
  const mastery = masteryFor(after, skillId);

  return {
    applied: true,
    skillId,
    correct: session.correct,
    asked: session.answered,
    unlockedCannons: granted(before.ownedCannons, after.ownedCannons),
    unlockedIslands: granted(before.unlockedIslands, after.unlockedIslands),
    meterPercent: meterPercent(mastery),
    mastered: isMastered(mastery),
  };
}
