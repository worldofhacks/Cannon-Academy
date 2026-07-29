/**
 * Child-readable cannon identity — skill, difficulty, fuse, damage, temper, and weapon status (A-034).
 *
 * Difficulty follows the same grade-span rule as training (`difficultyPresentation`). Fuse and
 * damage come from the catalog; weapon enablement is truthful — Double-Shot stays off until T-022.
 */
import { getSkill } from '@content/index';
import type { Cannon, CannonId, GradeBand } from '@content/schemas';

import { difficultyPresentation } from '../theme/difficultyPresentation';
import {
  ARC_PEAK,
  cannonLook,
  cannonWeapon,
  temperLook,
  type ArcShape,
  type Projectile,
} from '../theme/cannonPresentation';

export interface CannonIdentityPresentation {
  readonly skillName: string;
  readonly difficultyLabel: string;
  readonly fuseLabel: string;
  readonly fuseSeconds: number;
  readonly damageLabel: string;
  readonly temperamentWord: string;
  readonly weaponName: string | null;
  readonly weaponEnabled: boolean;
  readonly weaponChipLabel: string | null;
  readonly accessibilityDescription: string;
}

/** Formats catalog `timerMs` as a child-readable fuse label. */
export function fuseLabelFromMs(timerMs: number): string {
  const seconds = Math.round(timerMs / 1000);
  return `${seconds} sec fuse`;
}

/** Truthful tray/deck copy for one owned cannon at the captain's grade band. */
export function cannonIdentityPresentation(input: {
  readonly cannon: Cannon;
  readonly gradeBand: GradeBand;
}): CannonIdentityPresentation {
  const { cannon, gradeBand } = input;
  const skill = getSkill(cannon.skill);
  const difficulty = difficultyPresentation({ skillId: cannon.skill, gradeBand });
  const temper = temperLook[cannon.temperament];
  const look = cannonLook[cannon.id];
  const weapon = cannonWeapon[cannon.id];
  const fuseSeconds = Math.round(cannon.timerMs / 1000);

  const weaponChipLabel =
    weapon.displayName !== null
      ? weapon.enabled
        ? weapon.displayName
        : weapon.unavailableLabel
      : look.spectacle !== null
        ? look.spectacle
        : null;

  const descriptionParts = [
    cannon.displayName,
    skill.displayName,
    difficulty.label,
    `${cannon.damageMin} to ${cannon.damageMax} damage`,
    temper.word,
    fuseLabelFromMs(cannon.timerMs),
  ];
  if (weapon.displayName !== null) {
    descriptionParts.push(
      weapon.enabled ? `${weapon.displayName} ready` : `${weapon.displayName} unavailable`,
    );
  } else if (look.spectacle !== null) {
    descriptionParts.push(look.spectacle);
  }
  if (cannon.recoilDamage > 0) {
    descriptionParts.push(`kicks back ${cannon.recoilDamage}`);
  }

  return {
    skillName: skill.displayName,
    difficultyLabel: difficulty.label,
    fuseLabel: fuseLabelFromMs(cannon.timerMs),
    fuseSeconds,
    damageLabel: `${cannon.damageMin}–${cannon.damageMax}`,
    temperamentWord: temper.word,
    weaponName: weapon.displayName,
    weaponEnabled: weapon.enabled,
    weaponChipLabel,
    accessibilityDescription: descriptionParts.join(', '),
  };
}

/** Presentation-only flight identity for the cannon that was actually selected (AC-3). */
export function flightLookForCannon(cannonId: CannonId): {
  readonly projectile: Projectile;
  readonly arc: ArcShape;
  readonly arcPeak: number;
} {
  const look = cannonLook[cannonId];
  return {
    projectile: look.projectile,
    arc: look.arc,
    arcPeak: ARC_PEAK[look.arc],
  };
}
