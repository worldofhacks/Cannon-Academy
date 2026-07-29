/**
 * Relative difficulty labels for training choices.
 *
 * A-028. Labels are derived from each skill's catalog grade span relative to the captain's band.
 * Authored per-template tiers are intentionally unused — they are insurance only (T-003).
 */
import { getSkill } from '@content/index';
import type { GradeBand, SkillId } from '@content/schemas';
import { maxGradeForBand } from '@engine/placement';

export interface DifficultyPresentation {
  readonly label: string;
  readonly accessibilityDescription: string;
}

type DifficultyTier = 'warm_up' | 'practice' | 'on_level';

const LABEL_BY_TIER: Readonly<Record<DifficultyTier, string>> = {
  warm_up: 'Warm-up',
  practice: 'Practice',
  on_level: 'On level',
};

function tierFor(skillId: SkillId, gradeBand: GradeBand): DifficultyTier {
  const bandMax = maxGradeForBand(gradeBand);
  const { maxGrade } = getSkill(skillId);
  if (maxGrade < bandMax - 1) return 'warm_up';
  if (maxGrade < bandMax) return 'practice';
  return 'on_level';
}

/** Child-readable difficulty word and accessibility copy for one training card. */
export function difficultyPresentation(input: {
  readonly skillId: SkillId;
  readonly gradeBand: GradeBand;
}): DifficultyPresentation {
  const skill = getSkill(input.skillId);
  const label = LABEL_BY_TIER[tierFor(input.skillId, input.gradeBand)];
  return {
    label,
    accessibilityDescription: `${label} drill for ${skill.displayName}`,
  };
}
