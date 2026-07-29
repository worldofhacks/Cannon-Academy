/**
 * A-010 — chest ceremony projects A-032 settlement without rolling or granting.
 *
 * Pure projection and AST contracts only — no RN harness (posture.md).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { getCannon } from '../../src/content/index';
import { CHEST_RARITIES, type ChestRarity } from '../../src/content/schemas';
import { duelReceiptKey } from '../../src/contracts/rewards';
import type { ChestReceipt } from '../../src/contracts/rewards';
import { rollChest } from '../../src/engine/economy';
import { createRng } from '../../src/engine/rng';
import { rollChestSettlement } from '../../src/services/chestSettlement';
import { settleDuelRewards, canonicalDuelSeed } from '../../src/services/rewardSettlement';
import { victoryRewards } from '../../src/services/victoryRewards';
import { createCaptainStore } from '../../src/stores/player';

const REPO_ROOT = join(import.meta.dirname, '../..');
const PANELS_PATH = 'src/components/duel/Panels.tsx';
const CHEST_RARITY_PATH = 'src/theme/chestRarity.ts';
const PANELS_MODULE = '../../src/components/duel/Panels.tsx';
const CHEST_RARITY_MODULE = '../../src/theme/chestRarity.ts';

interface ChestCeremonyProjection {
  readonly rarity: ChestRarity;
  readonly label: string;
  readonly look: { readonly fill: string; readonly border: string; readonly label: string };
  readonly grant:
    | { readonly kind: 'cannon'; readonly displayName: string }
    | { readonly kind: 'coins'; readonly amount: number };
  readonly purseCoins: number;
}

type ProjectChestCeremony = (
  chestReceipt: ChestReceipt,
  rewards: ReturnType<typeof victoryRewards>,
) => ChestCeremonyProjection;

interface ChestCeremonyModule {
  readonly projectChestCeremony: ProjectChestCeremony;
}

async function loadChestCeremonyModule(): Promise<ChestCeremonyModule> {
  let loaded: unknown;
  try {
    loaded = await import(/* @vite-ignore */ PANELS_MODULE);
  } catch {
    loaded = undefined;
  }
  expect(
    loaded,
    'A-010 is RED: Panels.tsx must export projectChestCeremony for settled chest projection',
  ).toBeDefined();
  const candidate = loaded as { readonly projectChestCeremony?: unknown };
  expect(candidate.projectChestCeremony, 'projectChestCeremony must be a function').toBeTypeOf('function');
  return candidate as ChestCeremonyModule;
}

async function loadChestRarityModule(): Promise<{
  readonly chestRarityLook: Record<ChestRarity, ChestCeremonyProjection['look']>;
}> {
  let loaded: unknown;
  try {
    loaded = await import(/* @vite-ignore */ CHEST_RARITY_MODULE);
  } catch {
    loaded = undefined;
  }
  expect(loaded, 'A-010 is RED: src/theme/chestRarity.ts must export chestRarityLook').toBeDefined();
  const candidate = loaded as { readonly chestRarityLook?: unknown };
  expect(candidate.chestRarityLook, 'chestRarityLook must be an object').toBeTypeOf('object');
  return candidate as { readonly chestRarityLook: Record<ChestRarity, ChestCeremonyProjection['look']> };
}

function sourceFile(
  relativePath: string,
  source = readFileSync(join(REPO_ROOT, relativePath), 'utf8'),
): ts.SourceFile {
  return ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
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
  const matches = descendants(file).filter(
    (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  const match = matches[0];
  if (matches.length !== 1 || match?.body === undefined) {
    throw new Error(`${file.fileName}: expected exactly one function ${name}`);
  }
  return match as ts.FunctionDeclaration & { readonly body: ts.Block };
}

function findSeed(predicate: (seed: number) => boolean, limit = 200_000): number {
  for (let seed = 0; seed < limit; seed += 1) {
    if (predicate(seed)) return seed;
  }
  throw new Error(`no seed found within ${limit}`);
}

function findRareSeed(): number {
  return findSeed((seed) => rollChest(createRng(seed))[0].rarity === 'rare');
}

function duelIdFromSeed(seed: number): string {
  return `duel-${seed.toString(36)}`;
}

function frozenReceipt(overrides: Partial<ChestReceipt> & Pick<ChestReceipt, 'key' | 'seed' | 'rarity' | 'grant'>): ChestReceipt {
  return Object.freeze({
    source: 'duel',
    coinFallback: 12,
    ...overrides,
  });
}

describe('A-010 chest ceremony projection', () => {
  it('spec(A-010:AC-1) projects settled rarity and grant contents without rerolling', async () => {
    const { projectChestCeremony } = await loadChestCeremonyModule();
    const store = createCaptainStore();
    const rareSeed = findRareSeed();
    const duelId = duelIdFromSeed(rareSeed);

    const outcome = settleDuelRewards(store, {
      duelId,
      seed: canonicalDuelSeed(duelId),
      won: true,
      purseCoins: 17,
      skillTally: {},
    });
    const receipt = outcome.chestReceipt;
    expect(receipt).not.toBeNull();

    const rewards = victoryRewards(outcome);
    const projected = projectChestCeremony(receipt!, rewards);

    expect(projected.rarity).toBe(receipt!.rarity);
    expect(projected.label).toBe(receipt!.rarity.toUpperCase());
    if (receipt!.grant.kind === 'cannon') {
      expect(projected.grant).toEqual({
        kind: 'cannon',
        displayName: getCannon(receipt!.grant.cannonId).displayName,
      });
    } else {
      expect(projected.grant).toEqual({ kind: 'coins', amount: receipt!.grant.amount });
    }
    expect(projected.purseCoins).toBe(outcome.coins);
  });

  it('spec(A-010:AC-2) keeps byte-equivalent projection across repeated reads and remounts', async () => {
    const { projectChestCeremony } = await loadChestCeremonyModule();
    const receipt = frozenReceipt({
      key: 'duel:duel-remount',
      seed: 424242,
      rarity: 'uncommon',
      coinFallback: 18,
      grant: { kind: 'coins', amount: 18 },
    });
    const rewards = Object.freeze(victoryRewards({
      applied: true,
      won: true,
      coins: 9,
      unlockedCannons: [],
      unlockedIslands: [],
      rankTier: 1,
      rankedUp: false,
    }));

    const first = projectChestCeremony(receipt, rewards);
    const second = projectChestCeremony(receipt, rewards);
    const remounted = projectChestCeremony(receipt, rewards);

    expect(second).toEqual(first);
    expect(remounted).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('spec(A-010:AC-4) shows only the coin fallback when settlement degraded a duplicate cannon', async () => {
    const { projectChestCeremony } = await loadChestCeremonyModule();
    const rareSeed = findRareSeed();
    const duelId = duelIdFromSeed(rareSeed);
    const store = createCaptainStore();
    store.getState().replaceCaptain({
      ...store.getState().captain,
      ownedCannons: [...store.getState().captain.ownedCannons, 'nine_pounder'],
    });

    const outcome = settleDuelRewards(store, {
      duelId,
      seed: canonicalDuelSeed(duelId),
      won: true,
      purseCoins: 5,
      skillTally: {},
    });
    const receipt = outcome.chestReceipt!;
    expect(receipt.grant.kind).toBe('coins');

    const projected = projectChestCeremony(receipt, victoryRewards(outcome));

    expect(projected.grant).toEqual({ kind: 'coins', amount: receipt.grant.amount });
    if (projected.grant.kind === 'cannon') {
      throw new Error('duplicate chest must not project a cannon');
    }
    expect(projected.grant.displayName).toBeUndefined();
    expect(getCannon('nine_pounder').displayName).not.toBe('');
  });

  it('spec(A-010:AC-5) does not mutate the captain store when projecting or reopening', async () => {
    const { projectChestCeremony } = await loadChestCeremonyModule();
    const store = createCaptainStore();
    const duelId = duelIdFromSeed(88001);
    settleDuelRewards(store, {
      duelId,
      seed: canonicalDuelSeed(duelId),
      won: true,
      purseCoins: 11,
      skillTally: {},
    });
    const before = structuredClone(store.getState().captain);
    const receipt = before.rewardReceipts[duelReceiptKey(duelId)]!;
    const rewards = victoryRewards({
      applied: true,
      won: true,
      coins: 11,
      unlockedCannons: [],
      unlockedIslands: [],
      rankTier: before.rankTier,
      rankedUp: false,
    });

    projectChestCeremony(receipt, rewards);
    projectChestCeremony(receipt, rewards);
    expect(store.getState().captain).toEqual(before);
  });
});

describe('A-010 chest rarity look-up table', () => {
  it('spec(A-010:AC-3) maps every CHEST_RARITIES entry to distinct token triples from tokens.ts', async () => {
    const { chestRarityLook } = await loadChestRarityModule();
    const tokensSource = readFileSync(join(REPO_ROOT, 'src/theme/tokens.ts'), 'utf8');
    const tokenValues = new Set(
      [...tokensSource.matchAll(/:\s*'(#[0-9A-Fa-f]{3,8})'/g)].map((match) => match[1]!.toLowerCase()),
    );

    expect(Object.keys(chestRarityLook).sort()).toEqual([...CHEST_RARITIES].sort());

    const fills = new Set<string>();
    for (const rarity of CHEST_RARITIES) {
      const look = chestRarityLook[rarity];
      expect(tokenValues.has(look.fill.toLowerCase())).toBe(true);
      expect(tokenValues.has(look.border.toLowerCase())).toBe(true);
      expect(tokenValues.has(look.label.toLowerCase())).toBe(true);
      fills.add(look.fill.toLowerCase());
    }
    expect(fills.size).toBe(CHEST_RARITIES.length);
  });
});

describe('A-010 victory panel source contract', () => {
  it('spec(A-010:AC-1) VictoryPanel accepts a settled chestReceipt and never rolls or grants', () => {
    const panelsSource = readFileSync(join(REPO_ROOT, PANELS_PATH), 'utf8');
    expect(panelsSource).toMatch(/chestReceipt/);
    expect(panelsSource).toMatch(/projectChestCeremony/);
    expect(panelsSource).not.toMatch(/\brollChest\b/);
    expect(panelsSource).not.toMatch(/\brollChestSettlement\b/);
    expect(panelsSource).not.toMatch(/\bsettleDuelRewards\b/);
    expect(panelsSource).not.toMatch(/\bcreateRng\b/);
    expect(panelsSource).not.toMatch(/\breplaceCaptain\b/);
  });

  it('spec(A-010:AC-3) styles rarity from chestRarityLook rather than tier literals', () => {
    const file = sourceFile(PANELS_PATH);
    const panel = namedFunction(file, 'VictoryPanel');
    const body = panel.body.getText(file);
    expect(body).toMatch(/chestRarityLook/);
    expect(body).not.toMatch(/backgroundColor:\s*['"]#6C4BD6['"]/);
  });

  it('spec(A-010:AC-2) derives the announced label from the supplied receipt rarity', () => {
    const file = sourceFile(PANELS_PATH);
    const projector = namedFunction(file, 'projectChestCeremony');
    const body = projector.body.getText(file);
    expect(body).toMatch(/rarity/);
    expect(body).not.toMatch(/['"]RARE['"]/);
    expect(body).not.toMatch(/['"]COMMON['"]/);
    expect(body).not.toMatch(/['"]UNCOMMON['"]/);
  });

  it('spec(A-010:AC-5) keeps chest reveal read-only against settlement services', () => {
    const file = sourceFile(PANELS_PATH);
    const imports = descendants(file)
      .filter(ts.isImportDeclaration)
      .flatMap((node) => node.moduleSpecifier.getText(file));
    expect(imports.some((spec) => spec.includes('rewardSettlement'))).toBe(false);
    expect(imports.some((spec) => spec.includes('chestSettlement'))).toBe(false);
    expect(imports.some((spec) => spec.includes('engine/economy'))).toBe(false);
    expect(imports.some((spec) => spec.includes('engine/rng'))).toBe(false);
  });
});
