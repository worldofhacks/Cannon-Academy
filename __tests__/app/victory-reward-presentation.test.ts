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

async function loadVictoryRewards(): Promise<VictoryRewards> {
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
  const candidate = (loaded as { readonly victoryRewards?: unknown }).victoryRewards;
  expect(candidate, 'victoryRewards must be a function').toBeTypeOf('function');
  return candidate as VictoryRewards;
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

function sourceFile(relativePath: string): ts.SourceFile {
  return ts.createSourceFile(
    relativePath,
    readFileSync(join(REPO_ROOT, relativePath), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
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
  const matches = descendants(file).filter(
    (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  const match = matches[0];
  if (matches.length !== 1 || match?.body === undefined) {
    throw new Error(`${file.fileName}: expected exactly one function ${name}`);
  }
  return match as ts.FunctionDeclaration & { readonly body: ts.Block };
}

function containsIdentifier(node: ts.Node, name: string): boolean {
  return descendants(node).some((child) => ts.isIdentifier(child) && child.text === name);
}

function containsAppliedCheck(node: ts.Node, outcomeName: string): boolean {
  return descendants(node).some(
    (child) =>
      ts.isPropertyAccessExpression(child) &&
      ts.isIdentifier(child.expression) &&
      child.expression.text === outcomeName &&
      child.name.text === 'applied',
  );
}

function isInsideAppliedGuard(node: ts.Node, outcomeName: string): boolean {
  let current = node.parent;
  while (current !== undefined && !ts.isSourceFile(current)) {
    if (ts.isIfStatement(current) && containsAppliedCheck(current.expression, outcomeName)) return true;
    current = current.parent;
  }
  return false;
}

function isFirstOutcomeUpdater(call: ts.CallExpression, outcomeName: string): boolean {
  const updater = call.arguments[0];
  if (updater === undefined || !ts.isArrowFunction(updater) || updater.parameters.length !== 1) {
    return false;
  }
  const parameter = updater.parameters[0]?.name;
  if (parameter === undefined || !ts.isIdentifier(parameter)) return false;

  return descendants(updater.body).some(
    (node) =>
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
      containsIdentifier(node.left, parameter.text) &&
      containsIdentifier(node.right, outcomeName),
  );
}

function victoryStateBindings(file: ts.SourceFile): readonly {
  readonly value: string;
  readonly setter: string;
}[] {
  return descendants(file).flatMap((node) => {
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

function authoredVictoryStrings(file: ts.SourceFile): readonly string[] {
  const panel = namedFunction(file, 'VictoryPanel');
  return descendants(panel.body)
    .flatMap((node) => {
      if (ts.isJsxText(node)) return [node.text.trim()];
      if (ts.isStringLiteralLike(node)) return [node.text.trim()];
      return [];
    })
    .filter((value) => value.length > 0);
}

function hasProjectedCannonMap(file: ts.SourceFile): boolean {
  const panel = namedFunction(file, 'VictoryPanel');
  return descendants(panel.body).some((node) => {
    if (
      !ts.isCallExpression(node) ||
      !ts.isPropertyAccessExpression(node.expression) ||
      node.expression.name.text !== 'map'
    ) {
      return false;
    }
    const source = node.expression.expression;
    const readsCannons =
      (ts.isPropertyAccessExpression(source) && source.name.text === 'cannons') ||
      (ts.isIdentifier(source) && source.text === 'cannons');
    return (
      readsCannons &&
      node.arguments.some((callback) =>
        descendants(callback).some(
          (child) => ts.isPropertyAccessExpression(child) && child.name.text === 'displayName',
        ),
      )
    );
  });
}

describe('A-022 truthful victory reward projection', () => {
  it('spec(A-022:AC-1) projects the applied coin payout and no cannon when the outcome unlocked none', async () => {
    const victoryRewards = await loadVictoryRewards();
    const outcome = Object.freeze(rewardOutcome({ coins: 23, unlockedCannons: Object.freeze([]) }));

    expect(victoryRewards(outcome)).toEqual({ coins: 23, cannons: [] });
  });

  it('spec(A-022:AC-2) resolves every exact unlocked id through the cannon catalog in outcome order', async () => {
    const victoryRewards = await loadVictoryRewards();
    const ids = Object.freeze<CannonId[]>(['saker', 'chain_shot']);
    const outcome = Object.freeze(rewardOutcome({ coins: 31, unlockedCannons: ids }));

    const projected = victoryRewards(outcome);

    expect(projected).toEqual({
      coins: 31,
      cannons: ids.map(getCannon),
    });
    expect(projected.cannons.map((cannon) => cannon.id)).toEqual(ids);
    expect(outcome.unlockedCannons).toEqual(ids);
  });
});

describe('A-022 victory panel source contract', () => {
  it('spec(A-022:AC-1) renders cannon claims only by mapping projected cannons', () => {
    expect(hasProjectedCannonMap(sourceFile(PANELS_PATH))).toBe(true);
  });

  it('spec(A-022:AC-2) contains no catalog cannon display name authored in VictoryPanel JSX', () => {
    const authored = new Set(authoredVictoryStrings(sourceFile(PANELS_PATH)));
    const hardcoded = cannons.map((cannon) => cannon.displayName).filter((name) => authored.has(name));

    expect(hardcoded).toEqual([]);
  });
});

describe('A-022 settlement reaches presentation and the existing gun deck', () => {
  it('spec(A-022:AC-3) an applied unlock is the same catalog cannon shown and marked new in deckSlots', async () => {
    const victoryRewards = await loadVictoryRewards();
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
    expect(outcome.unlockedCannons).toEqual(['chain_shot']);
    expect(projected.cannons.map((cannon) => cannon.id)).toEqual(outcome.unlockedCannons);
    for (const cannon of projected.cannons) {
      expect(store.getState().captain.ownedCannons).toContain(cannon.id);
      expect(slots.find((slot) => slot.cannon.id === cannon.id)).toMatchObject({
        cannon: { id: cannon.id, displayName: cannon.displayName },
        isNew: true,
      });
    }
  });

  it('spec(A-022:AC-3) feeds the retained applied outcome through victoryRewards into VictoryPanel', () => {
    const file = sourceFile(DUEL_PATH);
    const bindings = victoryStateBindings(file);

    const wired = bindings.some(({ value }) => {
      const projectionVariables = descendants(file).flatMap((node) => {
        if (
          !ts.isVariableDeclaration(node) ||
          !ts.isIdentifier(node.name) ||
          node.initializer === undefined
        ) {
          return [];
        }
        const projectionCall = descendants(node.initializer).find(
          (child): child is ts.CallExpression =>
            ts.isCallExpression(child) &&
            child.expression.getText(file) === 'victoryRewards' &&
            child.arguments.some((argument) => containsIdentifier(argument, value)),
        );
        return projectionCall === undefined ? [] : [node.name.text];
      });
      if (projectionVariables.length === 0) return false;

      return descendants(file).some(
        (node) =>
          ts.isJsxAttribute(node) &&
          node.name.getText(file) === 'rewards' &&
          node.initializer !== undefined &&
          projectionVariables.some(
            (name) => node.initializer !== undefined && containsIdentifier(node.initializer, name),
          ),
      );
    });

    // Also accept the direct, unaliased expression <VictoryPanel rewards={victoryRewards(value)} />.
    const directlyWired = descendants(file).some(
      (node) =>
        ts.isJsxAttribute(node) &&
        node.name.getText(file) === 'rewards' &&
        node.initializer !== undefined &&
        descendants(node.initializer).some(
          (child) =>
            ts.isCallExpression(child) &&
            child.expression.getText(file) === 'victoryRewards' &&
            bindings.some(({ value }) =>
              child.arguments.some((argument) => containsIdentifier(argument, value)),
            ),
        ),
    );

    expect(wired || directlyWired).toBe(true);
  });
});

describe('A-022 repeated settlement observation', () => {
  it('spec(A-022:AC-4) retains the first applied outcome instead of replacing it with no-payment', () => {
    const file = sourceFile(DUEL_PATH);
    const calls = descendants(file).filter(ts.isCallExpression);
    const appliedBindings = descendants(file).flatMap((node) => {
      if (
        !ts.isVariableDeclaration(node) ||
        !ts.isIdentifier(node.name) ||
        node.initializer === undefined ||
        !ts.isCallExpression(node.initializer) ||
        node.initializer.expression.getText(file) !== 'applyDuelOutcome'
      ) {
        return [];
      }
      return [node.name.text];
    });

    const retainsFirst = victoryStateBindings(file).some(({ setter }) =>
      appliedBindings.some((outcomeName) =>
        calls.some(
          (call) =>
            call.expression.getText(file) === setter &&
            isFirstOutcomeUpdater(call, outcomeName) &&
            (isInsideAppliedGuard(call, outcomeName) || containsAppliedCheck(call, outcomeName)),
        ),
      ),
    );

    expect(appliedBindings.length, 'applyDuelOutcome must not be a discarded expression statement').toBe(1);
    expect(retainsFirst).toBe(true);
  });
});
