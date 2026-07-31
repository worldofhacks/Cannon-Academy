/**
 * A-034 — cannon identity: visible difficulty, distinct weapons, grade-aware starting play.
 *
 * Written before implementation. Covers catalog presentation, selected-cannon data flow,
 * truthful special-weapon labeling (T-022 not faked), and D-9 placement exceptions.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { cannons, getCannon, getSkill } from '@content/index';
import type { Cannon, CannonId, GradeBand } from '@content/schemas';
import { CANNON_IDS, GRADE_BANDS } from '@content/schemas';
import { duelReducer } from '@engine/duel/reducer';
import { createDuelState, type DuelConfig } from '@engine/duel/types';
import { maxGradeForBand, resolvePlacement } from '@engine/placement';
import { templateSchema, type Template } from '@content/schemas';

import { difficultyPresentation } from '../../src/theme/difficultyPresentation';
import {
  ARC_PEAK,
  cannonLook,
  type ArcShape,
  type CannonLook,
  type Projectile,
} from '../../src/theme/cannonPresentation';
import { duelReducer as appDuelReducer, initialDuelState } from '../../src/stores/duel';

const REPO_ROOT = join(import.meta.dirname, '../..');
const CANNON_DIFFICULTY_MODULE = '../../src/services/cannonDifficulty.ts';
const TRAY_PATH = 'src/components/duel/CannonTray.tsx';
const GUN_DECK_PATH = 'app/gun-deck.tsx';
const PRESENTATION_PATH = 'src/theme/cannonPresentation.ts';
const PLACEMENT_PATH = 'src/engine/placement.ts';
const DAMAGE_PATH = 'src/engine/duel/damage.ts';

const TEMPLATE: Template = templateSchema.parse({
  id: 'a034_add',
  skill: 'add_within_10',
  text: '{a} + {b} = ?',
  params: { a: [1, 3], b: [1, 3] },
  answerExpr: 'a + b',
  distractors: ['a + b + 1', 'a + b + 2', 'a + b + 3'],
});

const MULT_TEMPLATE: Template = templateSchema.parse({
  id: 'a034_mult',
  skill: 'mult_facts',
  text: '{a} × {b} = ?',
  params: { a: [2, 5], b: [2, 5] },
  answerExpr: 'a * b',
  distractors: ['a * b + 1', 'a * b + 2', 'a * b + 3'],
});

interface CannonIdentityPresentation {
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

type CannonIdentityFn = (input: {
  readonly cannon: Cannon;
  readonly gradeBand: GradeBand;
}) => CannonIdentityPresentation;

type FlightLookFn = (cannonId: CannonId) => {
  readonly projectile: Projectile;
  readonly arc: ArcShape;
  readonly arcPeak: number;
};

async function loadCannonDifficulty(): Promise<{
  readonly cannonIdentityPresentation: CannonIdentityFn;
  readonly flightLookForCannon: FlightLookFn;
}> {
  let loaded: unknown;
  try {
    loaded = await import(/* @vite-ignore */ CANNON_DIFFICULTY_MODULE);
  } catch {
    loaded = undefined;
  }
  expect(loaded, 'A-034 is RED: src/services/cannonDifficulty.ts must export identity helpers').toBeDefined();
  const mod = loaded as {
    readonly cannonIdentityPresentation?: unknown;
    readonly flightLookForCannon?: unknown;
  };
  expect(mod.cannonIdentityPresentation, 'cannonIdentityPresentation must be a function').toBeTypeOf(
    'function',
  );
  expect(mod.flightLookForCannon, 'flightLookForCannon must be a function').toBeTypeOf('function');
  return mod as {
    readonly cannonIdentityPresentation: CannonIdentityFn;
    readonly flightLookForCannon: FlightLookFn;
  };
}

function componentSource(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

const sorted = <T extends string>(xs: readonly T[]): T[] => [...xs].sort();

/** D-9: the only direct non-starter placement grants. */
const PLACEMENT_EXCEPTIONS: Readonly<Partial<Record<CannonId, readonly GradeBand[]>>> = {
  six_pounder: ['g2_3', 'g4_5'],
  twelve_pounder: ['g4_5'],
};

function expectedPlacementCannons(band: GradeBand): CannonId[] {
  const maxGrade = maxGradeForBand(band);
  return sorted(
    cannons
      .filter((c) => {
        if (c.minGrade > maxGrade) return false;
        if (c.unlock.kind === 'starter' && c.minGrade <= maxGrade) return true;
        const bands = PLACEMENT_EXCEPTIONS[c.id];
        return bands?.includes(band) === true;
      })
      .map((c) => c.id),
  );
}

describe('A-034 cannon identity', () => {
  it('spec(A-034:AC-1) every owned cannon exposes truthful skill, difficulty, fuse, damage, temper, and weapon copy', async () => {
    const { cannonIdentityPresentation } = await loadCannonDifficulty();

    for (const cannon of cannons) {
      for (const band of GRADE_BANDS) {
        const identity = cannonIdentityPresentation({ cannon, gradeBand: band });
        const skill = getSkill(cannon.skill);
        const difficulty = difficultyPresentation({ skillId: cannon.skill, gradeBand: band });
        const look = cannonLook[cannon.id];

        expect(identity.skillName).toBe(skill.displayName);
        expect(identity.difficultyLabel).toBe(difficulty.label);
        expect(identity.fuseSeconds).toBe(Math.round(cannon.timerMs / 1000));
        expect(identity.fuseLabel.toLowerCase()).toContain(String(identity.fuseSeconds));
        expect(identity.damageLabel).toBe(`${cannon.damageMin}–${cannon.damageMax}`);
        expect(identity.temperamentWord.length).toBeGreaterThan(0);
        expect(identity.accessibilityDescription).toContain(cannon.displayName);
        expect(identity.accessibilityDescription).toContain(identity.difficultyLabel);
        expect(identity.accessibilityDescription).toContain(`${cannon.damageMin} to ${cannon.damageMax}`);
        if (look.spectacle !== null && identity.weaponName === null) {
          expect(identity.accessibilityDescription.toLowerCase()).toContain(look.spectacle.toLowerCase());
        }
      }
    }
  });

  it('spec(A-034:AC-2) every catalog cannon has a complete projectile and arc record', () => {
    for (const id of CANNON_IDS) {
      const look: CannonLook = cannonLook[id];
      expect(look.glyph.length).toBeGreaterThan(0);
      expect(look.range.length).toBeGreaterThan(0);
      expect(look.projectile).toBeTruthy();
      expect(look.arc).toBeTruthy();
      expect(ARC_PEAK[look.arc]).toBeGreaterThan(0);
    }
    expect(Object.keys(cannonLook).sort()).toEqual(sorted(CANNON_IDS));
  });

  it('spec(A-034:AC-2) presentation mapping is exhaustive — no fallback branch in cannonLook', () => {
    const source = readFileSync(join(REPO_ROOT, PRESENTATION_PATH), 'utf8');
    expect(source).toMatch(/Record<CannonId,\s*CannonLook>/);
    expect(source).not.toMatch(/\?\?\s*\{/);
    expect(source).not.toMatch(/cannonLook\[.*\]\s*\?\?/);
    expect(Object.keys(cannonLook).sort()).toEqual(sorted(CANNON_IDS));
  });

  it('spec(A-034:AC-3) firing uses the selected cannon question skill, timer, recoil band, projectile, and arc', async () => {
    const { flightLookForCannon } = await loadCannonDifficulty();
    const swivel = getCannon('swivel_gun');
    const culverin = getCannon('culverin');
    const twelve = getCannon('twelve_pounder');

    const config = (loadout: readonly CannonId[]): DuelConfig =>
      ({
        seed: 34001,
        duelId: 'duel-a034',
        islandId: 'port_sumwich',
        playerLoadout: loadout,
        rivalLoadout: ['culverin'],
        templatesBySkill: {
          add_within_10: [TEMPLATE],
          mult_facts: [MULT_TEMPLATE],
        },
      }) as DuelConfig;

    for (const cannon of [swivel, culverin, twelve]) {
      let core = createDuelState(config([cannon.id]));
      core = duelReducer(core, { type: 'ANIMATION_DONE' });
      core = duelReducer(core, { type: 'CANNON_SELECTED', cannonId: cannon.id });
      expect(core.phase).toBe('reload');
      if (core.phase !== 'reload') continue;
      expect(core.timerMs).toBe(cannon.timerMs);
      expect(core.question.skill).toBe(cannon.skill);

      const flight = flightLookForCannon(cannon.id);
      expect(flight.projectile).toBe(cannonLook[cannon.id].projectile);
      expect(flight.arc).toBe(cannonLook[cannon.id].arc);
      expect(flight.arcPeak).toBe(ARC_PEAK[flight.arc]);

      const app = appDuelReducer(initialDuelState(34002), { type: 'PICK_CANNON', cannon });
      expect(app.cannon?.id).toBe(cannon.id);
      expect(app.question?.text.length).toBeGreaterThan(0);
      expect(app.phase).toBe('question');
    }
  });

  it('spec(A-034:AC-4) double broadside special weapon is labeled unavailable — never enabled or extra-volley copy', async () => {
    const { cannonIdentityPresentation } = await loadCannonDifficulty();
    const cannon = getCannon('double_broadside');
    const identity = cannonIdentityPresentation({ cannon, gradeBand: 'g2_3' });

    expect(identity.weaponName?.toLowerCase()).toContain('double');
    expect(identity.weaponEnabled).toBe(false);
    expect(identity.weaponChipLabel?.toLowerCase()).not.toMatch(/enabled|ready|fire twice|2 volley|extra damage/);

    const tray = componentSource(TRAY_PATH);
    const deck = componentSource(GUN_DECK_PATH);
    for (const source of [tray, deck]) {
      expect(source).toMatch(/weaponEnabled|weaponChipLabel|cannonIdentityPresentation/);
      expect(source).not.toMatch(/DOUBLE.?SHOT.*enabled|extra volley|two volleys/i);
    }
  });

  /**
   * Re-baselined for owner ruling D-10 (2026-07-31, `tickets/app/OWNER-RULINGS.md`): a captain
   * starts with ONE gun, and the Culverin becomes the first gun EARNED rather than a starter.
   * Reported from a real playthrough — the guided duel arms one gun and the first unscripted duel
   * handed the child two.
   *
   * A-034's own subject is untouched and is what the loop below still sweeps: every gun a band is
   * PLACED with must be playable at that band, and the only non-starters allowed in are D-9's two
   * exceptions. The three literals moved because the catalog's starter set shrank from two to one;
   * `expectedPlacementCannons` is derived from the rule and needed no edit, and the two agreeing
   * is the point of asserting both.
   */
  it('spec(A-034:AC-5) each grade band placement grants playable starters plus only the approved exceptions', () => {
    expect(sorted(resolvePlacement('k_1').unlockedCannons)).toEqual(
      sorted(['swivel_gun'] as CannonId[]),
    );
    expect(sorted(resolvePlacement('g2_3').unlockedCannons)).toEqual(
      sorted(['swivel_gun', 'six_pounder'] as CannonId[]),
    );
    expect(sorted(resolvePlacement('g4_5').unlockedCannons)).toEqual(
      sorted(['swivel_gun', 'six_pounder', 'twelve_pounder'] as CannonId[]),
    );

    for (const band of GRADE_BANDS) {
      const placement = resolvePlacement(band);
      const maxGrade = maxGradeForBand(band);
      expect(sorted(placement.unlockedCannons)).toEqual(expectedPlacementCannons(band));
      for (const id of placement.unlockedCannons) {
        const cannon = getCannon(id);
        expect(cannon.minGrade, `${id}@${band} is above band`).toBeLessThanOrEqual(maxGrade);
        const skill = getSkill(cannon.skill);
        expect(skill.minGrade, `${id} skill unreachable at ${band}`).toBeLessThanOrEqual(maxGrade);
      }
    }
  });

  it('spec(A-034:AC-6) only six_pounder and twelve_pounder have placement-exception paths besides mastery', () => {
    const placementSource = readFileSync(join(REPO_ROOT, PLACEMENT_PATH), 'utf8');
    expect(placementSource).toMatch(/six_pounder/);
    expect(placementSource).toMatch(/twelve_pounder/);

    for (const band of GRADE_BANDS) {
      const granted = resolvePlacement(band).unlockedCannons;
      for (const cannon of cannons) {
        const isException =
          (cannon.id === 'six_pounder' && (band === 'g2_3' || band === 'g4_5')) ||
          (cannon.id === 'twelve_pounder' && band === 'g4_5');
        const isStarter = cannon.unlock.kind === 'starter' && cannon.minGrade <= maxGradeForBand(band);
        const shouldGrant = isStarter || isException;
        expect(granted.includes(cannon.id)).toBe(shouldGrant && cannon.minGrade <= maxGradeForBand(band));
      }
    }
  });

  it('spec(A-034:AC-1) tray and gun deck render difficulty and fuse from cannonIdentityPresentation', () => {
    const tray = componentSource(TRAY_PATH);
    const deck = componentSource(GUN_DECK_PATH);

    for (const source of [tray, deck]) {
      expect(source).toMatch(/cannonIdentityPresentation\s*\(/);
      expect(source).toMatch(/difficultyLabel|\.difficultyLabel/);
      expect(source).toMatch(/fuseLabel|\.fuseLabel/);
      expect(source).toMatch(/accessibilityDescription/);
    }
  });

  it('spec(A-034:AC-2) tray and gun deck read projectile identity only from cannonPresentation', () => {
    const tray = componentSource(TRAY_PATH);
    const deck = componentSource(GUN_DECK_PATH);
    for (const source of [tray, deck]) {
      expect(source).toMatch(/cannonLook/);
      expect(source).not.toMatch(/from '@engine\/duel\/damage'/);
    }
  });

  it('spec(A-034:AC-3) presentation-only fields never enter engine damage', () => {
    const damageSource = readFileSync(join(REPO_ROOT, DAMAGE_PATH), 'utf8');
    expect(damageSource).not.toMatch(/from ['"].*cannonPresentation/);
    expect(damageSource).not.toMatch(/from ['"].*cannonDifficulty/);
    expect(damageSource).not.toMatch(/cannonLook|cannonIdentityPresentation|flightLookForCannon/);
  });
});

describe('A-034 Definition of Done', () => {
  it('dod(A-034:1) tags a test against every acceptance criterion A-034 declares', () => {
    const ticket = readFileSync(join(REPO_ROOT, 'tickets/app/A-034.md'), 'utf8');
    const declared = [...ticket.matchAll(/\*\*(AC-\d+)\*\*/g)].map((m) => m[1]);
    const unique = [...new Set(declared)];
    const source = readFileSync(join(import.meta.dirname, 'cannon-identity.test.ts'), 'utf8');
    const untagged = unique.filter((ac) => !source.includes(`spec(A-034:${ac})`));
    expect(unique.length).toBeGreaterThan(0);
    expect(untagged, 'every declared AC needs at least one tagged test').toEqual([]);
  });

  it('dod(A-034:2) states T-022 truthfully — Double-Shot unavailable, not faked', async () => {
    const { cannonIdentityPresentation } = await loadCannonDifficulty();
    const identity = cannonIdentityPresentation({
      cannon: getCannon('double_broadside'),
      gradeBand: 'g2_3',
    });
    expect(identity.weaponEnabled).toBe(false);
    const ticket = readFileSync(join(REPO_ROOT, 'tickets/T-022.md'), 'utf8');
    expect(ticket).toMatch(/backlog/);
  });
});
