/**
 * A-031 — island-keyed enemy encounters with distinct presentation.
 *
 * Catalog data owns identity; `enemyPresentation.ts` owns the pure visual mapping; duel UI
 * consumes both without touching engine damage or question rules.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { getEnemyForIsland, islands } from '@content/index';
import { ENEMY_PRESENTATION_KINDS, ISLAND_IDS, type EnemyPresentationKind, type IslandId } from '@content/schemas';

const REPO_ROOT = join(import.meta.dirname, '../..');
const DUEL_PATH = 'app/duel.tsx';
const SEA_STAGE_PATH = 'src/components/duel/SeaStage.tsx';
const SHIP_PATH = 'src/components/duel/Ship.tsx';
const ENEMY_PRESENTATION_MODULE = '../../src/theme/enemyPresentation.ts';

const ISLAND_ENEMY_KIND: Readonly<Record<IslandId, EnemyPresentationKind>> = {
  port_sumwich: 'pirate',
  isla_products: 'skeleton',
  quotient_cove: 'ghost',
  fraction_reef: 'shark',
  grandline: 'kraken',
};

type EnemyPresentationApi = {
  readonly enemyPresentationFor: (
    enemy: ReturnType<typeof getEnemyForIsland>,
  ) => {
    readonly kind: EnemyPresentationKind;
    readonly displayName: string;
    readonly faction: string;
    readonly accessibilityLabel: string;
    readonly shapeChannel: string;
    readonly textChannel: string;
    readonly cosmetics: unknown;
    readonly ghostOpacity?: number;
    readonly ghostGlow?: string;
  };
};

async function loadEnemyPresentation(): Promise<EnemyPresentationApi> {
  const loaded = await import(ENEMY_PRESENTATION_MODULE).catch(() => undefined);
  expect(loaded, 'A-031 requires src/theme/enemyPresentation.ts').toBeDefined();
  expect(loaded!.enemyPresentationFor, 'enemyPresentationFor must be exported').toBeTypeOf('function');
  return loaded as EnemyPresentationApi;
}

function sourceFile(relativePath: string): ts.SourceFile {
  return ts.createSourceFile(
    relativePath,
    readFileSync(join(REPO_ROOT, relativePath), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function descendants(root: ts.Node): readonly ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

function namedFunction(
  file: ts.SourceFile,
  name: string,
): ts.FunctionDeclaration & { readonly body: ts.Block } {
  const match = descendants(file).find(
    (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  expect(match?.body, `${file.fileName}: expected function ${name}`).toBeDefined();
  return match as ts.FunctionDeclaration & { readonly body: ts.Block };
}

describe('A-031 enemy encounters', () => {
  it('spec(A-031:AC-1) every island resolves a validated enemy with name, faction, a11y, and kind', () => {
    for (const island of islands) {
      const enemy = getEnemyForIsland(island.id);
      expect(enemy.islandId).toBe(island.id);
      expect(enemy.displayName.trim()).not.toBe('');
      expect(enemy.faction.trim()).not.toBe('');
      expect(enemy.accessibilityLabel.trim()).not.toBe('');
      expect(enemy.presentationKind).toBe(ISLAND_ENEMY_KIND[island.id]);
    }
  });

  it('spec(A-031:AC-2) islands one through five map pirate → skeleton → ghost → shark → kraken', () => {
    const ordered = [...islands].sort((a, b) => a.order - b.order);
    expect(ordered.map((i) => getEnemyForIsland(i.id).presentationKind)).toEqual([
      ...ENEMY_PRESENTATION_KINDS,
    ]);
  });

  it('spec(A-031:AC-2) presentation kinds expose independent text and shape channels', async () => {
    const { enemyPresentationFor } = await loadEnemyPresentation();
    const visuals = ISLAND_IDS.map((id) => enemyPresentationFor(getEnemyForIsland(id)));

    expect(new Set(visuals.map((v) => v.textChannel)).size).toBe(ENEMY_PRESENTATION_KINDS.length);
    expect(new Set(visuals.map((v) => v.shapeChannel)).size).toBe(ENEMY_PRESENTATION_KINDS.length);
    for (const visual of visuals) {
      expect(visual.textChannel).not.toBe(visual.shapeChannel);
    }
  });

  it('spec(A-031:AC-3) ghost uses documented opacity and glow; kraken uses tentacle form not a ship hull', async () => {
    const { enemyPresentationFor } = await loadEnemyPresentation();
    const ghost = enemyPresentationFor(getEnemyForIsland('quotient_cove'));
    const kraken = enemyPresentationFor(getEnemyForIsland('grandline'));

    expect(ghost.kind).toBe('ghost');
    expect(ghost.ghostOpacity).toBeGreaterThan(0);
    expect(ghost.ghostOpacity).toBeLessThan(1);
    expect(ghost.ghostGlow).toMatch(/^#/);

    expect(kraken.kind).toBe('kraken');
    expect(kraken.shapeChannel).toMatch(/tentacle/i);
    expect(kraken.cosmetics).toBeNull();
  });

  it('spec(A-031:AC-4) duel.tsx wires presentation without importing engine duel damage', () => {
    const duelSrc = readFileSync(join(REPO_ROOT, DUEL_PATH), 'utf8');
    expect(duelSrc).toMatch(/getEnemyForIsland|enemyPresentationFor/);
    expect(duelSrc).toMatch(/SeaStage/);
    expect(duelSrc).not.toMatch(/from\s+['"]@engine\/duel\/damage['"]/);
    expect(duelSrc).not.toMatch(/RIVAL_SHIP/);
  });

  it('spec(A-031:AC-4) enemyPresentation.ts stays free of engine and store imports', async () => {
    const src = readFileSync(join(REPO_ROOT, 'src/theme/enemyPresentation.ts'), 'utf8');
    expect(src).not.toMatch(/@engine\//);
    expect(src).not.toMatch(/stores\//);
    expect(src).not.toMatch(/duelReducer|damageMin|damageMax/);
  });

  it('spec(A-031:AC-5) unknown island lookup throws instead of falling back to a generic rival', () => {
    expect(() => getEnemyForIsland('not_an_island' as IslandId)).toThrow(Error);
    expect(() => getEnemyForIsland('not_an_island' as IslandId)).toThrow(/not_an_island/);

    const duelBody = namedFunction(sourceFile(DUEL_PATH), 'DuelBody').body.getText(sourceFile(DUEL_PATH));
    expect(duelBody).not.toMatch(/name="Rival"/);
    expect(duelBody).not.toMatch(/RIVAL_SHIP/);
  });

  it('spec(A-031:AC-2) duel HUD names the enemy, not the island, on the rival hull card', () => {
    const body = namedFunction(sourceFile(DUEL_PATH), 'DuelBody').body.getText(sourceFile(DUEL_PATH));
    expect(body).toMatch(/getEnemyForIsland|enemy\.displayName|enemyPresentation/);
    expect(body).toMatch(/HullCard[^]*displayName/s);
  });

  it('spec(A-031:AC-2) SeaStage and Ship expose kind-specific rival rendering hooks', () => {
    const sea = readFileSync(join(REPO_ROOT, SEA_STAGE_PATH), 'utf8');
    const ship = readFileSync(join(REPO_ROOT, SHIP_PATH), 'utf8');

    expect(sea).toMatch(/rivalPresentation|enemyPresentation|presentationKind/);
    expect(ship).toMatch(/presentationKind|EnemyKind|variant/);
    expect(ship).toMatch(/kraken|tentacle/i);
    expect(ship).toMatch(/ghost|opacity/i);
  });
});
