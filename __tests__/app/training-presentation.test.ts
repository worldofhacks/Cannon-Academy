/**
 * A-028 — difficulty labels and picker presentation guards.
 *
 * Difficulty words are derived from catalog grade spans relative to the captain's band. The range
 * picker must expose skill, island, and difficulty through visible text and accessibility copy.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { getSkill } from '@content/index';
import type { GradeBand, SkillId } from '@content/schemas';
import { maxGradeForBand } from '@engine/placement';
import { MIN_TAP_TARGET } from '../../src/theme/tokens';

const REPO_ROOT = join(import.meta.dirname, '../..');
const RANGE_PATH = 'app/range.tsx';
const DIFFICULTY_MODULE = '../../src/theme/difficultyPresentation.ts';

interface DifficultyPresentation {
  readonly label: string;
  readonly accessibilityDescription: string;
}

type DifficultyPresentationFn = (input: {
  readonly skillId: SkillId;
  readonly gradeBand: GradeBand;
}) => DifficultyPresentation;

async function loadDifficultyPresentation(): Promise<{
  readonly difficultyPresentation: DifficultyPresentationFn;
}> {
  let loaded: unknown;
  try {
    loaded = await import(/* @vite-ignore */ DIFFICULTY_MODULE);
  } catch {
    loaded = undefined;
  }
  expect(
    loaded,
    'A-028 is RED: src/theme/difficultyPresentation.ts must export difficultyPresentation',
  ).toBeDefined();
  const candidate = loaded as { readonly difficultyPresentation?: unknown };
  expect(candidate.difficultyPresentation, 'difficultyPresentation must be a function').toBeTypeOf('function');
  return candidate as { readonly difficultyPresentation: DifficultyPresentationFn };
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
  const match = descendants(file).find(
    (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  expect(match?.body, `${file.fileName}: expected function ${name}`).toBeDefined();
  return match as ts.FunctionDeclaration & { readonly body: ts.Block };
}

function expectedTier(skillId: SkillId, band: GradeBand): 'warm_up' | 'practice' | 'on_level' {
  const bandMax = maxGradeForBand(band);
  const skill = getSkill(skillId);
  if (skill.maxGrade < bandMax - 1) return 'warm_up';
  if (skill.maxGrade < bandMax) return 'practice';
  return 'on_level';
}

const EXPECTED_LABEL: Readonly<Record<'warm_up' | 'practice' | 'on_level', string>> = {
  warm_up: 'Warm-up',
  practice: 'Practice',
  on_level: 'On level',
};

describe('A-028 difficulty presentation', () => {
  it('spec(A-028:AC-3) the same skill and band always produce the same child-readable label and accessibility copy', async () => {
    const { difficultyPresentation } = await loadDifficultyPresentation();
    const cases: readonly { readonly skillId: SkillId; readonly band: GradeBand }[] = [
      { skillId: 'add_within_10', band: 'g4_5' },
      { skillId: 'mult_facts', band: 'g2_3' },
      { skillId: 'div_facts', band: 'g4_5' },
    ];

    for (const { skillId, band } of cases) {
      const first = difficultyPresentation({ skillId, gradeBand: band });
      const second = difficultyPresentation({ skillId, gradeBand: band });
      expect(second).toEqual(first);
      expect(first.label).toBe(EXPECTED_LABEL[expectedTier(skillId, band)]);
      expect(first.accessibilityDescription.length).toBeGreaterThan(0);
      expect(first.accessibilityDescription.toLowerCase()).toContain(first.label.toLowerCase());
      expect(first.accessibilityDescription).toContain(getSkill(skillId).displayName);
    }
  });

  it('spec(A-028:AC-2) an earlier warm-up skill reads easier than the current island skill for the same captain', async () => {
    const { difficultyPresentation } = await loadDifficultyPresentation();
    const band: GradeBand = 'g2_3';
    const warmUp = difficultyPresentation({ skillId: 'add_within_10', gradeBand: band });
    const current = difficultyPresentation({ skillId: 'mult_facts', gradeBand: band });

    expect(warmUp.label).toBe('Warm-up');
    expect(current.label).toBe('On level');
    expect(warmUp.label).not.toBe(current.label);
  });

  it('spec(A-028:AC-3) labels are derived only from catalog grade spans, never template difficulty fields', async () => {
    const { difficultyPresentation } = await loadDifficultyPresentation();
    const source = readFileSync(join(REPO_ROOT, 'src/theme/difficultyPresentation.ts'), 'utf8');
    expect(source).not.toMatch(/template.*difficulty|difficulty\s*:\s*[123]/);
    expect(source).toMatch(/minGrade|maxGrade/);

    const label = difficultyPresentation({ skillId: 'add_within_20', gradeBand: 'g2_3' }).label;
    expect(['Warm-up', 'Practice', 'On level']).toContain(label);
  });
});

describe('A-028 range picker presentation guards', () => {
  it('spec(A-028:AC-2) picker cards expose skill, island, and difficulty through text and accessibility labels', () => {
    const file = sourceFile(RANGE_PATH);
    const picker = namedFunction(file, 'SkillPicker');
    const source = picker.body.getText(file);

    expect(source).toMatch(/getSkill\s*\(/);
    expect(source).toMatch(/getIsland\s*\(/);
    expect(source).toMatch(/difficultyPresentation\s*\(/);
    expect(source).toMatch(/accessibilityLabel/);
    expect(source).toMatch(/\.label/);
    expect(source).toMatch(/accessibilityDescription/);
  });

  it('spec(A-028:AC-2) grouped options mark the current island in visible copy', () => {
    const file = sourceFile(RANGE_PATH);
    const picker = namedFunction(file, 'SkillPicker');
    const source = picker.body.getText(file);

    expect(source).toMatch(/isCurrentIsland/);
    expect(source).toMatch(/getIsland\s*\([^)]*\)\.displayName/);
  });

  it('spec(A-028:AC-2) picker rows keep at least the 64pt tap target from the design system', () => {
    const file = sourceFile(RANGE_PATH);
    const styles = file.statements.find(
      (statement): statement is ts.VariableStatement =>
        ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.some(
          (decl) => ts.isIdentifier(decl.name) && decl.name.text === 's',
        ),
    );
    expect(styles, `${RANGE_PATH} must declare StyleSheet s`).toBeDefined();
    const source = readFileSync(join(REPO_ROOT, RANGE_PATH), 'utf8');
    expect(source).toMatch(new RegExp(`minHeight:\\s*${MIN_TAP_TARGET}|minHeight:\\s*7[2-9]`));
  });

  it('spec(A-028:AC-5) empty-state copy names the chart return explicitly', () => {
    const file = sourceFile(RANGE_PATH);
    const picker = namedFunction(file, 'SkillPicker');
    const source = picker.body.getText(file);

    expect(source).toMatch(/Back to the chart|chart/i);
    expect(source).toMatch(/router\.back\s*\(\s*\)/);
  });
});
