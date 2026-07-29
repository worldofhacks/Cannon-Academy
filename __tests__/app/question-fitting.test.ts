/**
 * A-023 — the shared duel/range question must stay readable on the smallest supported phone.
 *
 * React Native cannot be rendered by this repository's Node-only Vitest harness. The test split
 * therefore mirrors the ticket:
 *
 *   1. the typography decision is a pure TypeScript contract, swept across every authored prompt;
 *   2. a TypeScript-AST source contract proves the real QuestionPanel calls that decision and
 *      feeds the same result into the Text props that control wrapping and native font fitting;
 *   3. the existing fuse and two-by-two answer layout remain structurally pinned while the
 *      question band changes.
 *
 * The typography module is intentionally loaded at runtime. Before A-023 it does not exist; a
 * guarded load lets the source-contract assertions still execute, so RED means "feature missing"
 * rather than a suite-collection crash caused by an unresolved static import.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import type { Template } from '@content/schemas';

import { TEMPLATE_POOLS } from '../../src/services/templatePools';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PANEL_PATH = join(REPO_ROOT, 'src/components/duel/QuestionPanel.tsx');
const TYPOGRAPHY_PATH = join(REPO_ROOT, 'src/theme/questionTypography.ts');

/**
 * Fourteen rendered characters is the last compact arithmetic treatment that fits the narrow
 * question band at the design's 44pt face. Any prose is fitted regardless of length.
 */
const COMPACT_PROMPT_MAX_LENGTH = 14;

type TreatmentKind = 'display' | 'fitted';

interface QuestionTypographyTreatment {
  readonly adjustsFontSizeToFit: boolean;
  readonly kind: TreatmentKind;
  readonly minimumFontScale: number;
  readonly numberOfLines: number;
  readonly style: {
    readonly fontSize: number;
    readonly lineHeight: number;
  };
}

interface QuestionTypographyModule {
  readonly questionTypographyFor: (prompt: string) => QuestionTypographyTreatment;
}

async function loadTypographyModule(): Promise<QuestionTypographyModule | null> {
  if (!existsSync(TYPOGRAPHY_PATH)) return null;
  const loaded: unknown = await import(
    /* @vite-ignore */ `${pathToFileURL(TYPOGRAPHY_PATH).href}?a023=${Date.now()}`
  );
  return loaded as QuestionTypographyModule;
}

function renderLongestPrompt(template: Template): string {
  return template.text.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (_token, name: string) => {
    const bounds = template.params[name];
    if (bounds === undefined) {
      throw new Error(`template '${template.id}' has no bounds for token '${name}'`);
    }
    return String(bounds[1]);
  });
}

function expectedKind(prompt: string): TreatmentKind {
  return /[a-z]/i.test(prompt) || prompt.length > COMPACT_PROMPT_MAX_LENGTH ? 'fitted' : 'display';
}

function parseSource(path: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function descendants<T extends ts.Node>(
  root: ts.Node,
  predicate: (node: ts.Node) => node is T,
): readonly T[] {
  const matches: T[] = [];
  const visit = (node: ts.Node): void => {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return matches;
}

function propertyPath(expression: ts.Expression): readonly string[] | null {
  if (ts.isIdentifier(expression)) return [expression.text];
  if (ts.isPropertyAccessExpression(expression)) {
    const left = propertyPath(expression.expression);
    return left === null ? null : [...left, expression.name.text];
  }
  return null;
}

function isPath(expression: ts.Expression, expected: readonly string[]): boolean {
  const actual = propertyPath(expression);
  return (
    actual !== null && actual.length === expected.length && actual.every((part, i) => part === expected[i])
  );
}

function jsxAttribute(element: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return element.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === name,
  );
}

function jsxExpression(attribute: ts.JsxAttribute | undefined): ts.Expression | undefined {
  const initializer = attribute?.initializer;
  if (initializer === undefined || !ts.isJsxExpression(initializer)) return undefined;
  return initializer.expression;
}

function containsPath(root: ts.Node, expected: readonly string[]): boolean {
  return descendants(root, ts.isPropertyAccessExpression).some((expression) => isPath(expression, expected));
}

function panelFunction(source: ts.SourceFile): ts.FunctionDeclaration {
  const found = source.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === 'QuestionPanel',
  );
  if (found === undefined) throw new Error('QuestionPanel function declaration not found');
  return found;
}

function importedLocalName(
  source: ts.SourceFile,
  moduleSuffix: string,
  importedName: string,
): string | undefined {
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.moduleSpecifier.text.endsWith(moduleSuffix)
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
    const specifier = bindings.elements.find(
      (element) => (element.propertyName?.text ?? element.name.text) === importedName,
    );
    if (specifier !== undefined) return specifier.name.text;
  }
  return undefined;
}

function classifiedBinding(panel: ts.FunctionDeclaration, classifierName: string): string | undefined {
  for (const declaration of descendants(panel, ts.isVariableDeclaration)) {
    if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) continue;
    const calls = descendants(declaration.initializer, ts.isCallExpression);
    const appliesQuestionText = calls.some(
      (call) =>
        ts.isIdentifier(call.expression) &&
        call.expression.text === classifierName &&
        call.arguments.length === 1 &&
        isPath(call.arguments[0]!, ['question', 'text']),
    );
    if (appliesQuestionText) return declaration.name.text;
  }
  return undefined;
}

function questionTextElement(panel: ts.FunctionDeclaration): ts.JsxOpeningLikeElement | undefined {
  return descendants(
    panel,
    (node): node is ts.JsxElement =>
      ts.isJsxElement(node) && node.openingElement.tagName.getText() === 'Text',
  )
    .filter((element) => containsPath(element, ['question', 'text']))
    .map((element) => element.openingElement)
    .find((opening) => jsxAttribute(opening, 'accessibilityRole')?.initializer?.getText() === '"header"');
}

function styleObject(source: ts.SourceFile, name: string): ts.ObjectLiteralExpression {
  const styleSheetCall = descendants(source, ts.isCallExpression).find(
    (call) => isPath(call.expression, ['StyleSheet', 'create']) && call.arguments.length === 1,
  );
  const styles = styleSheetCall?.arguments[0];
  if (styles === undefined || !ts.isObjectLiteralExpression(styles)) {
    throw new Error('StyleSheet.create object not found');
  }
  const property = styles.properties.find(
    (candidate): candidate is ts.PropertyAssignment =>
      ts.isPropertyAssignment(candidate) &&
      ((ts.isIdentifier(candidate.name) && candidate.name.text === name) ||
        (ts.isStringLiteral(candidate.name) && candidate.name.text === name)),
  );
  if (property === undefined || !ts.isObjectLiteralExpression(property.initializer)) {
    throw new Error(`style '${name}' not found`);
  }
  return property.initializer;
}

function objectProperty(object: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  const property = object.properties.find(
    (candidate): candidate is ts.PropertyAssignment =>
      ts.isPropertyAssignment(candidate) &&
      ((ts.isIdentifier(candidate.name) && candidate.name.text === name) ||
        (ts.isStringLiteral(candidate.name) && candidate.name.text === name)),
  );
  return property?.initializer;
}

function numericLiteral(expression: ts.Expression | undefined): number | undefined {
  if (expression === undefined || !ts.isNumericLiteral(expression)) return undefined;
  return Number(expression.text);
}

function normalizedText(node: ts.Node): string {
  return node.getText().replace(/\s+/g, '');
}

describe('A-023 question typography classifier', () => {
  it('spec(A-023:AC-1) provides the pure questionTypographyFor classifier', async () => {
    const module = await loadTypographyModule();

    expect(module, 'src/theme/questionTypography.ts is the missing A-023 feature').not.toBeNull();
    if (module === null) return;
    expect(typeof module.questionTypographyFor).toBe('function');
  });

  it('spec(A-023:AC-1) keeps 44pt display type through the compact boundary and fits the next character', async () => {
    const module = await loadTypographyModule();
    expect(module, 'question typography module is not implemented').not.toBeNull();
    if (module === null) return;

    const atBoundary = '123 + 4567 = ?';
    const overBoundary = '1234 + 4567 = ?';
    expect(atBoundary).toHaveLength(COMPACT_PROMPT_MAX_LENGTH);
    expect(overBoundary).toHaveLength(COMPACT_PROMPT_MAX_LENGTH + 1);

    const compact = module.questionTypographyFor(atBoundary);
    expect(compact.kind).toBe('display');
    expect(compact.style).toMatchObject({ fontSize: 44, lineHeight: 50 });
    expect(compact.numberOfLines).toBe(1);

    expect(module.questionTypographyFor(overBoundary).kind).toBe('fitted');
  });

  it('spec(A-023:AC-1) sentence-like prompts fit even when shorter than the compact boundary', async () => {
    const module = await loadTypographyModule();
    expect(module, 'question typography module is not implemented').not.toBeNull();
    if (module === null) return;

    const shortSentence = 'What is 9 + 8?';
    expect(shortSentence).toHaveLength(COMPACT_PROMPT_MAX_LENGTH);
    expect(module.questionTypographyFor(shortSentence).kind).toBe('fitted');
  });

  it('spec(A-023:AC-1) classifies every shipped authored template from its longest rendered prompt', async () => {
    const module = await loadTypographyModule();
    expect(module, 'question typography module is not implemented').not.toBeNull();
    if (module === null) return;

    const templates = Object.values(TEMPLATE_POOLS).flat();
    const seenKinds = new Set<TreatmentKind>();
    expect(templates.length).toBeGreaterThan(0);

    for (const template of templates) {
      const rendered = renderLongestPrompt(template);
      const expected = expectedKind(rendered);
      const treatment = module.questionTypographyFor(rendered);
      seenKinds.add(treatment.kind);
      expect(treatment.kind, `${template.id}: ${rendered}`).toBe(expected);
    }

    expect([...seenKinds].sort()).toEqual(['display', 'fitted']);
  });

  it('spec(A-023:AC-2) fitted prompts have bounded multiline type and native shrinking enabled', async () => {
    const module = await loadTypographyModule();
    expect(module, 'question typography module is not implemented').not.toBeNull();
    if (module === null) return;

    const longest = Object.values(TEMPLATE_POOLS)
      .flat()
      .map(renderLongestPrompt)
      .sort((left, right) => right.length - left.length)[0]!;
    const fitted = module.questionTypographyFor(longest);

    expect(fitted.kind).toBe('fitted');
    expect(fitted.numberOfLines).toBeGreaterThanOrEqual(2);
    expect(fitted.numberOfLines).toBeLessThanOrEqual(3);
    expect(fitted.adjustsFontSizeToFit).toBe(true);
    expect(fitted.minimumFontScale).toBeGreaterThanOrEqual(0.6);
    expect(fitted.minimumFontScale).toBeLessThan(1);
    expect(fitted.style.fontSize).toBeGreaterThanOrEqual(20);
    expect(fitted.style.fontSize).toBeLessThan(44);
    expect(fitted.style.lineHeight).toBeGreaterThanOrEqual(fitted.style.fontSize);
  });
});

describe('A-023 QuestionPanel source contract', () => {
  const source = parseSource(PANEL_PATH);
  const panel = panelFunction(source);

  it('spec(A-023:AC-1) applies questionTypographyFor to the rendered question.text, not a proxy or decoy', () => {
    const classifier = importedLocalName(source, 'theme/questionTypography', 'questionTypographyFor');
    expect(classifier, 'QuestionPanel must import questionTypographyFor').toBeDefined();
    if (classifier === undefined) return;

    expect(
      classifiedBinding(panel, classifier),
      'QuestionPanel must bind questionTypographyFor(question.text)',
    ).toBeDefined();
  });

  it('spec(A-023:AC-2) feeds that exact classification into style, line bound, and native fitting props', () => {
    const classifier = importedLocalName(source, 'theme/questionTypography', 'questionTypographyFor');
    expect(classifier, 'QuestionPanel must import questionTypographyFor').toBeDefined();
    if (classifier === undefined) return;
    const binding = classifiedBinding(panel, classifier);
    expect(binding, 'QuestionPanel must bind questionTypographyFor(question.text)').toBeDefined();
    if (binding === undefined) return;

    const text = questionTextElement(panel);
    expect(text, 'the header Text rendering question.text must remain identifiable').toBeDefined();
    if (text === undefined) return;

    const style = jsxExpression(jsxAttribute(text, 'style'));
    expect(style, 'question Text must have a style expression').toBeDefined();
    if (style !== undefined) {
      expect(containsPath(style, [binding, 'style']), 'classified style is not applied to Text').toBe(true);
    }

    for (const property of ['numberOfLines', 'adjustsFontSizeToFit', 'minimumFontScale'] as const) {
      const applied = jsxExpression(jsxAttribute(text, property));
      expect(
        applied !== undefined && isPath(applied, [binding, property]),
        `${property} must come from the same classification binding`,
      ).toBe(true);
    }
  });

  it('spec(A-023:AC-2) releases the question row from the fixed one-line height that clips Practice', () => {
    const row = styleObject(source, 'questionRow');

    expect(
      objectProperty(row, 'height'),
      'questionRow must not retain a fixed height while prompts become multiline',
    ).toBeUndefined();
    expect(numericLiteral(objectProperty(row, 'minHeight'))).toBeGreaterThanOrEqual(56);
  });

  it('spec(A-023:AC-3) exposes the original full question.text as the header accessibilityLabel', () => {
    const text = questionTextElement(panel);
    expect(text, 'the header Text rendering question.text must remain identifiable').toBeDefined();
    if (text === undefined) return;

    const label = jsxExpression(jsxAttribute(text, 'accessibilityLabel'));
    expect(label !== undefined && isPath(label, ['question', 'text'])).toBe(true);
  });

  it('spec(A-023:AC-4) retains the fuse rule and the two-by-two four-choice grid', () => {
    const panelText = normalizedText(panel);

    expect(panelText).toContain('question.choices.slice(0,2)');
    expect(panelText).toContain('question.choices.slice(2,4)');
    expect(panelText).toContain('1-PERFECT_SHOT_TIMER_FRACTION');
    expect(panelText).toContain('flex:PERFECT_SHOT_TIMER_FRACTION');

    const fuseTrack = styleObject(source, 'fuseTrack');
    const grid = styleObject(source, 'grid');
    const gridRow = styleObject(source, 'gridRow');
    const choiceCell = styleObject(source, 'choiceCell');
    const choice = styleObject(source, 'choice');

    expect(numericLiteral(objectProperty(fuseTrack, 'height'))).toBe(18);
    expect(numericLiteral(objectProperty(grid, 'flex'))).toBe(1);
    expect(numericLiteral(objectProperty(gridRow, 'flex'))).toBe(1);
    expect(objectProperty(gridRow, 'flexDirection')?.getText()).toBe("'row'");
    expect(numericLiteral(objectProperty(choiceCell, 'flex'))).toBe(1);
    expect(numericLiteral(objectProperty(choiceCell, 'minHeight'))).toBeGreaterThanOrEqual(64);
    expect(numericLiteral(objectProperty(choice, 'flex'))).toBe(1);
  });
});
