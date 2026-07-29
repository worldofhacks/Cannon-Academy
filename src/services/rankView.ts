/**
 * Rank ladder and mastery progress — what the competitive frame shows.
 *
 * A-012. `ranks.json` and `rankTierForWins` existed in the engine but never reached a screen.
 * Tier is derived from wins here, never read from a persisted rank label, so a stale stored tier
 * cannot lie to the player and a loss (wins unchanged) cannot demote the ladder.
 */
import { ranks, skills } from '@content/index';
import type { Rank, SkillId } from '@content/schemas';
import { emptyMastery, isMastered, meterPercent } from '@engine/mastery';
import { maxGradeForBand } from '@engine/placement';
import { rankTierForWins } from '@engine/ranks';
import { MASTERY_THRESHOLD_CORRECT } from '@engine/tuning';

import type { Captain } from '../stores/player';

export interface RankRung {
  readonly rank: Rank;
  readonly isCurrent: boolean;
  readonly isAchieved: boolean;
}

export interface RankLadderView {
  readonly rungs: readonly RankRung[];
  readonly currentTier: number;
  /** Child-readable text for the next promotion, or null at Fleet Legend. */
  readonly nextRequirement: string | null;
}

export interface SkillProgressRow {
  readonly skillId: SkillId;
  readonly displayName: string;
  readonly meterPercent: number;
  readonly thresholdCorrect: number;
  readonly weightedCorrect: number;
  readonly mastered: boolean;
}

/** Every rank tier on the ladder, with the captain's current place derived from wins. */
export function rankLadder(captain: Captain): RankLadderView {
  const currentTier = rankTierForWins(captain.wins);
  const ordered = [...ranks].sort((a, b) => a.tier - b.tier);
  const rungs: RankRung[] = ordered.map((rank) => ({
    rank,
    isCurrent: rank.tier === currentTier,
    isAchieved: rank.tier <= currentTier,
  }));

  const next = ordered.find((rank) => rank.tier === currentTier + 1);
  const nextRequirement =
    next === undefined
      ? null
      : `${Math.max(0, next.minWins - captain.wins)} more win${next.minWins - captain.wins === 1 ? '' : 's'} to reach ${next.displayName}`;

  return { rungs, currentTier, nextRequirement };
}

/** Grade-eligible skills with meters derived from stored mastery counters. */
export function skillProgress(captain: Captain): readonly SkillProgressRow[] {
  if (captain.gradeBand === null) return [];

  const maxGrade = maxGradeForBand(captain.gradeBand);
  return skills
    .filter((skill) => skill.minGrade <= maxGrade)
    .map((skill) => {
      const mastery = captain.mastery[skill.id] ?? emptyMastery;
      return {
        skillId: skill.id,
        displayName: skill.displayName,
        meterPercent: meterPercent(mastery),
        thresholdCorrect: MASTERY_THRESHOLD_CORRECT,
        weightedCorrect: mastery.weightedCorrect,
        mastered: isMastered(mastery),
      };
    });
}
