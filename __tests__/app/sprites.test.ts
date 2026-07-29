/**
 * A-013 — shipped sprites and ship fidelity.
 *
 * AC-1 and AC-3 are exercised headlessly against the typed manifest. AC-2 and AC-5 follow the same
 * source-inspection pattern as A-031 and A-034: React Native's Flow entry point cannot load duel
 * components in vitest, so the contract is enforced on `Ship.tsx` and `sprites.ts` text.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FLAGS } from '../../src/theme/flags';

const REPO_ROOT = join(import.meta.dirname, '../..');
const SPRITES_PATH = 'src/theme/sprites.ts';
const SHIP_PATH = 'src/components/duel/Ship.tsx';
const SHIP_COSMETICS_PATH = 'src/theme/shipCosmetics.ts';

const SHIP_HULL_KEYS = [
  'ship01',
  'ship02',
  'ship03',
  'ship04',
  'ship05',
  'ship06',
  'ship07',
  'ship08',
] as const;

const FLAG_SPRITE_KEYS = ['flag1', 'flag2', 'flag3', 'flag4', 'flag5', 'flag6'] as const;

const CREW_KEYS = ['crew1', 'crew2'] as const;
const DINGHY_KEYS = ['dinghy1', 'dinghy2'] as const;

const FX_KEYS = [
  'cannonball',
  'cannon',
  'cannonMobile',
  'fire',
  'explosionBig',
  'explosionMid',
  'explosionSmall',
  'wood',
] as const;

function readRepo(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

function requirePaths(source: string): readonly string[] {
  return [...source.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]!);
}

function resolveFromSpritesModule(relativePath: string): string {
  return join(REPO_ROOT, relativePath.replace(/^\.\.\/\.\.\//, ''));
}

describe('A-013 sprite manifest', () => {
  it('spec(A-013:AC-1) every manifest entry resolves to a bundled PNG on disk', () => {
    const source = readRepo(SPRITES_PATH);

    for (const rel of requirePaths(source)) {
      const abs = resolveFromSpritesModule(rel);
      expect(existsSync(abs), `missing sprite file referenced by manifest: ${rel}`).toBe(true);
    }

    for (const key of SHIP_HULL_KEYS) {
      expect(source, `manifest missing hull sprite ${key}`).toMatch(new RegExp(`\\b${key}:\\s*require\\(`));
    }
    for (const key of FLAG_SPRITE_KEYS) {
      expect(source, `manifest missing flag sprite ${key}`).toMatch(new RegExp(`\\b${key}:\\s*require\\(`));
    }
    for (const key of CREW_KEYS) {
      expect(source, `manifest missing crew sprite ${key}`).toMatch(new RegExp(`\\b${key}:\\s*require\\(`));
    }
    for (const key of DINGHY_KEYS) {
      expect(source, `manifest missing dinghy sprite ${key}`).toMatch(new RegExp(`\\b${key}:\\s*require\\(`));
    }
    for (const key of FX_KEYS) {
      expect(source, `manifest missing FX sprite ${key}`).toMatch(new RegExp(`\\b${key}:\\s*require\\(`));
    }
  });

  it('spec(A-013:AC-3) the manifest uses static require() paths so a missing file fails at bundle time', () => {
    const source = readRepo(SPRITES_PATH);
    expect(requirePaths(source).length).toBeGreaterThanOrEqual(
      SHIP_HULL_KEYS.length + FLAG_SPRITE_KEYS.length + CREW_KEYS.length + DINGHY_KEYS.length,
    );
    expect(source).not.toMatch(/require\s*\(\s*[a-zA-Z_$]/);
    expect(source).not.toMatch(/`\$\{/);
  });

  it('spec(A-013:AC-1) flag sprites align with the six onboarding flag ids', () => {
    const source = readRepo(SPRITES_PATH);
    expect(source).toMatch(/export function flagSpriteForId/);

    for (const flag of FLAGS) {
      const spriteKey = flag.id.replace('-', '');
      expect(source, `manifest missing sprite for ${flag.id}`).toMatch(
        new RegExp(`['"]${flag.id}['"]:\\s*['"]${spriteKey}['"]`),
      );
    }
  });

  it('spec(A-013:AC-1) hull sprites expose a kind-aware resolver for duel ships', () => {
    const source = readRepo(SPRITES_PATH);
    expect(source).toMatch(/export function hullSpriteForKind/);
    expect(source).toMatch(/case 'pirate':[\s\S]*sprite\.ship02/);
    expect(source).toMatch(/case 'ghost':[\s\S]*sprite\.ship04/);
    expect(source).toMatch(/case 'kraken':[\s\S]*return null/);
    expect(source).toMatch(/default:[\s\S]*sprite\.ship01/);
  });
});

describe('A-013 ship presentation', () => {
  it('spec(A-013:AC-2) Ship renders a pre-rendered hull sprite with cosmetic layers, not a composed hull', () => {
    const ship = readRepo(SHIP_PATH);

    expect(ship).toMatch(/from ['"].*sprites['"]/);
    expect(ship).toMatch(/hullSpriteForKind|<Image[\s\S]*hull/i);
    expect(ship).toMatch(/pennant/i);

    expect(ship).not.toMatch(/points="0,0 100,0 88,100 10,100"/);
    expect(ship).not.toMatch(/color\.gunport/);

    expect(ship).toMatch(/KrakenForm|presentationKind === 'kraken'/);
  });

  it('spec(A-013:AC-2) enemy presentation overlays remain kind-specific cosmetic layers', () => {
    const ship = readRepo(SHIP_PATH);
    expect(ship).toMatch(/presentationKind === 'pirate'/);
    expect(ship).toMatch(/presentationKind === 'skeleton'/);
    expect(ship).toMatch(/presentationKind === 'ghost'/);
    expect(ship).toMatch(/presentationKind === 'shark'/);
  });

  it('spec(A-013:AC-5) the onboarding flag id becomes the pennant sprite on the ship', () => {
    const ship = readRepo(SHIP_PATH);
    const cosmetics = readRepo(SHIP_COSMETICS_PATH);

    expect(cosmetics).toMatch(/pennantFlagId/);
    expect(ship).toMatch(/pennantFlagId/);
    expect(ship).toMatch(/flagSpriteForId/);
  });
});
