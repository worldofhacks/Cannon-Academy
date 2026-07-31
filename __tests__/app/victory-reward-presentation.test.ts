/**
 * A-022 — the victory chest must describe the reward that was actually applied.
 *
 * The pure seam frozen here deliberately returns catalog cannons rather than authored labels:
 *
 *   victoryRewards(outcome: DuelRewardOutcome): {
 *     readonly coins: number;
 *     readonly cannons: readonly Cannon[];
 *   }
 *
 *   retainFirstApplied(
 *     current: DuelRewardOutcome | null,
 *     observed: DuelRewardOutcome,
 *   ): DuelRewardOutcome | null
 *
 * `app/duel.tsx` owns settlement and retains its first applied outcome. `VictoryPanel` receives
 * the projection, so an id absent from `DuelRewardOutcome.unlockedCannons` cannot become a cannon
 * claim and a repeated idempotent no-payment result cannot erase the real reward.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { cannons, getCannon } from '../../src/content/index';
import type { Cannon, CannonId } from '../../src/content/schemas';
import { MASTERY_RATE_DUEL, MASTERY_THRESHOLD_CORRECT } from '../../src/engine/tuning';
import { applyDuelOutcome, type DuelRewardOutcome } from '../../src/services/duelRewards';
import { deckSlots } from '../../src/services/loadout';
import { initialDuelState, type DuelState } from '../../src/stores/duel';
import { createCaptainStore, emptyCaptain } from '../../src/stores/player';

const REPO_ROOT = join(import.meta.dirname, '../..');
const DUEL_PATH = 'app/duel.tsx';
const PANELS_PATH = 'src/components/duel/Panels.tsx';
const VICTORY_REWARDS_MODULE = '../../src/services/victoryRewards.ts';

interface RewardProjection {
  readonly coins: number;
  readonly cannons: readonly Cannon[];
}

type VictoryRewards = (outcome: DuelRewardOutcome) => RewardProjection;

type RetainFirstApplied = (
  current: DuelRewardOutcome | null,
  observed: DuelRewardOutcome,
) => DuelRewardOutcome | null;

interface VictoryRewardModule {
  readonly retainFirstApplied: RetainFirstApplied;
  readonly victoryRewards: VictoryRewards;
}

async function loadVictoryRewardModule(): Promise<VictoryRewardModule> {
  let loaded: unknown;
  try {
    // A variable keeps the deliberately absent RED module from becoming a transform/setup error.
    loaded = await import(/* @vite-ignore */ VICTORY_REWARDS_MODULE);
  } catch {
    loaded = undefined;
  }

  expect(
    loaded,
    'A-022 is RED: src/services/victoryRewards.ts must export the pure victoryRewards projection',
  ).toBeDefined();
  const candidate = loaded as {
    readonly retainFirstApplied?: unknown;
    readonly victoryRewards?: unknown;
  };
  expect(candidate.victoryRewards, 'victoryRewards must be a function').toBeTypeOf('function');
  expect(candidate.retainFirstApplied, 'retainFirstApplied must be a function').toBeTypeOf('function');
  return candidate as VictoryRewardModule;
}

function rewardOutcome(overrides: Partial<DuelRewardOutcome> = {}): DuelRewardOutcome {
  return {
    applied: true,
    won: true,
    coins: 0,
    unlockedCannons: [],
    unlockedIslands: [],
    rankTier: 0,
    rankedUp: false,
    ...overrides,
  };
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

function directVariableDeclarations(root: ts.Block): readonly ts.VariableDeclaration[] {
  return root.statements.flatMap((statement) =>
    ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [],
  );
}

function stateBindings(
  root: ts.Block,
  file: ts.SourceFile,
): readonly {
  readonly value: string;
  readonly setter: string;
}[] {
  return directVariableDeclarations(root).flatMap((node) => {
    if (
      !ts.isVariableDeclaration(node) ||
      !ts.isArrayBindingPattern(node.name) ||
      node.name.elements.length < 2 ||
      node.initializer === undefined ||
      !ts.isCallExpression(node.initializer) ||
      node.initializer.expression.getText(file) !== 'useState'
    ) {
      return [];
    }
    const valueElement = node.name.elements[0];
    const setterElement = node.name.elements[1];
    if (
      valueElement === undefined ||
      setterElement === undefined ||
      ts.isOmittedExpression(valueElement) ||
      ts.isOmittedExpression(setterElement) ||
      !ts.isIdentifier(valueElement.name) ||
      !ts.isIdentifier(setterElement.name)
    ) {
      return [];
    }
    return [{ value: valueElement.name.text, setter: setterElement.name.text }];
  });
}

function directReturn(root: ts.Block, fileName: string): ts.Expression {
  const returns = root.statements.filter(
    (statement): statement is ts.ReturnStatement =>
      ts.isReturnStatement(statement) && statement.expression !== undefined,
  );
  const returned = returns[0]?.expression;
  if (returns.length !== 1 || returned === undefined) {
    throw new Error(`${fileName}: expected exactly one direct return`);
  }
  return returned;
}

function isInside(node: ts.Node, ancestor: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  while (current !== undefined) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function authoredVictoryStrings(file: ts.SourceFile): readonly string[] {
  const panel = namedFunction(file, 'VictoryPanel');
  return descendants(directReturn(panel.body, file.fileName))
    .flatMap((node) => {
      if (ts.isJsxText(node)) return [node.text.trim()];
      if (ts.isStringLiteralLike(node)) return [node.text.trim()];
      return [];
    })
    .filter((value) => value.length > 0);
}

function hasLiveProjectedCannonRows(file: ts.SourceFile): boolean {
  const panel = namedFunction(file, 'VictoryPanel');
  const returned = directReturn(panel.body, file.fileName);
  const maps = descendants(returned).filter(
    (node): node is ts.CallExpression =>
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'map' &&
      ts.isPropertyAccessExpression(node.expression.expression) &&
      ts.isIdentifier(node.expression.expression.expression) &&
      node.expression.expression.expression.text === 'rewards' &&
      node.expression.expression.name.text === 'cannons',
  );
  const map = maps[0];
  if (maps.length !== 1 || map === undefined) return false;
  const callback = map.arguments[0];
  const callbackParameter =
    callback !== undefined && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
      ? callback.parameters[0]
      : undefined;
  if (
    callback === undefined ||
    (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) ||
    callback.parameters.length !== 1 ||
    callbackParameter === undefined ||
    !ts.isIdentifier(callbackParameter.name)
  ) {
    return false;
  }
  const cannonName = callbackParameter.name.text;
  const displayNames = descendants(callback.body).filter(
    (node) =>
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === cannonName &&
      node.name.text === 'displayName',
  );
  const newClaims = descendants(returned).filter(
    (node) =>
      (ts.isJsxText(node) || ts.isStringLiteralLike(node)) &&
      node.getText(file).replace(/['"]/g, '').trim() === 'NEW CANNON',
  );
  const isDirectJsxPayload =
    ts.isJsxExpression(map.parent) && map.parent.expression !== undefined && map.parent.expression === map;

  return (
    isDirectJsxPayload &&
    displayNames.length === 1 &&
    newClaims.length === 1 &&
    newClaims.every((claim) => isInside(claim, callback.body))
  );
}

function rewardAttribute(panel: ts.Node, file: ts.SourceFile): ts.JsxAttribute | undefined {
  return descendants(panel).find(
    (node): node is ts.JsxAttribute => ts.isJsxAttribute(node) && node.name.getText(file) === 'rewards',
  );
}

function projectionArgument(
  screen: ts.FunctionDeclaration & { readonly body: ts.Block },
  panel: ts.Node,
  file: ts.SourceFile,
): string | null {
  const attribute = rewardAttribute(panel, file);
  if (
    attribute?.initializer === undefined ||
    !ts.isJsxExpression(attribute.initializer) ||
    attribute.initializer.expression === undefined
  ) {
    return null;
  }
  const expression = attribute.initializer.expression;
  if (ts.isCallExpression(expression) && expression.expression.getText(file) === 'victoryRewards') {
    const argument = expression.arguments[0];
    return argument !== undefined && ts.isIdentifier(argument) ? argument.text : null;
  }

  if (!ts.isIdentifier(expression)) return null;
  const declaration = directVariableDeclarations(screen.body).find(
    (node): node is ts.VariableDeclaration =>
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === expression.text &&
      node.initializer !== undefined &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText(file) === 'victoryRewards',
  );
  const call =
    declaration?.initializer !== undefined && ts.isCallExpression(declaration.initializer)
      ? declaration.initializer
      : undefined;
  const argument = call?.arguments[0];
  return argument !== undefined && ts.isIdentifier(argument) ? argument.text : null;
}

function hasExactSettlementToPanelChain(file: ts.SourceFile): boolean {
  const screen = namedFunction(file, 'DuelScreen');
  const returned = directReturn(screen.body, file.fileName);
  const panels = descendants(returned).filter(
    (node) =>
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(file) === 'VictoryPanel',
  );
  const panel = panels[0];
  if (panels.length !== 1 || panel === undefined) return false;
  const projectedState = projectionArgument(screen, panel, file);
  if (projectedState === null) return false;
  const state = stateBindings(screen.body, file).find(({ value }) => value === projectedState);
  if (state === undefined) return false;

  const effects = screen.body.statements.flatMap((statement) => {
    if (
      !ts.isExpressionStatement(statement) ||
      !ts.isCallExpression(statement.expression) ||
      statement.expression.expression.getText(file) !== 'useEffect'
    ) {
      return [];
    }
    return [statement.expression];
  });
  return effects.some((effect) => {
    const callback = effect.arguments[0];
    if (callback === undefined || (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))) {
      return false;
    }
    const applied = descendants(callback.body).find(
      (node): node is ts.VariableDeclaration =>
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined &&
        ts.isCallExpression(node.initializer) &&
        node.initializer.expression.getText(file) === 'applyDuelOutcome',
    );
    if (applied === undefined || !ts.isIdentifier(applied.name)) return false;
    const appliedName = applied.name.text;
    const setter = descendants(callback.body).find(
      (node): node is ts.CallExpression =>
        ts.isCallExpression(node) &&
        node.expression.getText(file) === state.setter &&
        node.arguments.some((argument) => {
          if (!ts.isArrowFunction(argument) || argument.parameters.length !== 1) return false;
          const parameter = argument.parameters[0];
          if (parameter === undefined || !ts.isIdentifier(parameter.name)) return false;
          const parameterName = parameter.name.text;
          return descendants(argument.body).some(
            (child) =>
              ts.isCallExpression(child) &&
              child.expression.getText(file) === 'retainFirstApplied' &&
              child.arguments.length === 2 &&
              child.arguments[0] !== undefined &&
              ts.isIdentifier(child.arguments[0]) &&
              child.arguments[0].text === parameterName &&
              child.arguments[1] !== undefined &&
              ts.isIdentifier(child.arguments[1]) &&
              child.arguments[1].text === appliedName,
          );
        }),
    );
    return setter !== undefined;
  });
}

describe('A-022 truthful victory reward projection', () => {
  it('spec(A-022:AC-1) projects the applied coin payout and no cannon when the outcome unlocked none', async () => {
    const { victoryRewards } = await loadVictoryRewardModule();
    const outcome = Object.freeze(rewardOutcome({ coins: 23, unlockedCannons: Object.freeze([]) }));

    expect(victoryRewards(outcome)).toEqual({ coins: 23, cannons: [] });
  });

  it('spec(A-022:AC-2) resolves every catalog id exactly in a non-catalog outcome order', async () => {
    const { victoryRewards } = await loadVictoryRewardModule();
    const ids = Object.freeze<CannonId[]>(cannons.map((cannon) => cannon.id).reverse());
    const outcome = Object.freeze(rewardOutcome({ coins: 31, unlockedCannons: ids }));

    const projected = victoryRewards(outcome);

    expect(ids.length).toBe(cannons.length);
    expect(projected).toEqual({
      coins: 31,
      cannons: ids.map(getCannon),
    });
    projected.cannons.forEach((cannon, index) => {
      expect(cannon).toBe(getCannon(ids[index]!));
    });
    expect(outcome.unlockedCannons).toEqual(ids);
  });
});

describe('A-022 victory panel source contract', () => {
  it('spec(A-022:AC-1) puts the actual name and NEW CANNON badge only inside the live projected row iteration', () => {
    const deadConditional = sourceFile(
      'dead-victory-panel.tsx',
      `function VictoryPanel({ rewards }) {
        return <View>{true ? null : rewards.cannons.map((cannon) => (
          <View><Text>{cannon.displayName}</Text><Text>NEW CANNON</Text></View>
        ))}</View>;
      }`,
    );

    expect(hasLiveProjectedCannonRows(deadConditional)).toBe(false);
    expect(hasLiveProjectedCannonRows(sourceFile(PANELS_PATH))).toBe(true);
  });

  it('spec(A-022:AC-2) contains no catalog cannon display name authored in VictoryPanel JSX', () => {
    const authored = new Set(authoredVictoryStrings(sourceFile(PANELS_PATH)));
    const hardcoded = cannons.map((cannon) => cannon.displayName).filter((name) => authored.has(name));

    expect(hardcoded).toEqual([]);
  });
});

describe('A-022 settlement reaches presentation and the existing gun deck', () => {
  it('spec(A-022:AC-3) an applied unlock is the same catalog cannon shown and marked new in deckSlots', async () => {
    const { victoryRewards } = await loadVictoryRewardModule();
    const fresh = emptyCaptain();
    const store = createCaptainStore({
      ...fresh,
      gradeBand: 'g2_3',
      mastery: {
        sub_within_20: {
          weightedCorrect: MASTERY_THRESHOLD_CORRECT - MASTERY_RATE_DUEL,
          correct: 20,
          attempts: 20,
        },
      },
    });
    const terminal: DuelState = {
      ...initialDuelState(22003),
      phase: 'victory',
      coins: 17,
      skillTally: { sub_within_20: { correct: 1, asked: 1 } },
    };

    const outcome = applyDuelOutcome(store, terminal);
    const projected = victoryRewards(outcome);
    const slots = deckSlots(store.getState().captain);

    expect(outcome.applied).toBe(true);
    // `chain_shot` from mastering `sub_within_20`, and Grapeshot because that same mastery opens
    // Isla Products, which now grants its entry cannon (re-baselined 2026-07-30 — `unlocksCannons`
    // was declared on every island and read by nothing, making acquisition circular at a new
    // island). Asserted as a set: the panel's contract is which cannons it shows, not their order.
    expect([...outcome.unlockedCannons].sort()).toEqual(['chain_shot', 'grapeshot']);
    expect(projected.cannons.map((cannon) => cannon.id)).toEqual(outcome.unlockedCannons);
    for (const cannon of projected.cannons) {
      expect(store.getState().captain.ownedCannons).toContain(cannon.id);
      expect(slots.find((slot) => slot.cannon.id === cannon.id)).toMatchObject({
        cannon: { id: cannon.id, displayName: cannon.displayName },
        isNew: true,
      });
    }
  });

  it('spec(A-022:AC-3) binds the exact settlement result through one retained identity into the rendered panel', () => {
    const alternatePropBranch = sourceFile(
      'alternate-reward-prop.tsx',
      `function DuelScreen() {
        const [retained, setRetained] = useState(null);
        useEffect(() => {
          const observed = applyDuelOutcome(store, state);
          setRetained((current) => retainFirstApplied(current, observed));
        }, []);
        return <VictoryPanel rewards={true ? fakeRewards : victoryRewards(retained)} />;
      }`,
    );

    expect(hasExactSettlementToPanelChain(alternatePropBranch)).toBe(false);
    expect(hasExactSettlementToPanelChain(sourceFile(DUEL_PATH))).toBe(true);
  });
});

describe('A-022 repeated settlement observation', () => {
  it('spec(A-022:AC-4) keeps the first applied object by identity when no-payment is observed later', async () => {
    const { retainFirstApplied } = await loadVictoryRewardModule();
    const first = Object.freeze(rewardOutcome({ coins: 19, unlockedCannons: ['saker'] }));
    const repeated = Object.freeze(
      rewardOutcome({ applied: false, coins: 0, unlockedCannons: [], rankedUp: false }),
    );

    const retained = retainFirstApplied(retainFirstApplied(null, first), repeated);

    expect(retained).toBe(first);
    expect(retainFirstApplied(null, repeated)).toBeNull();
  });
});
