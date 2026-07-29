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
  return parseSourceText(readFileSync(path, 'utf8'), path);
}

function parseSourceText(text: string, path = 'fixture.tsx'): ts.SourceFile {
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
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

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
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

function appliesStylePath(expression: ts.Expression | undefined, expected: readonly string[]): boolean {
  if (expression === undefined) return false;
  const unwrapped = unwrapExpression(expression);
  if (isPath(unwrapped, expected)) return true;
  if (ts.isArrayLiteralExpression(unwrapped)) {
    return unwrapped.elements.some(
      (element) => !ts.isSpreadElement(element) && appliesStylePath(element, expected),
    );
  }
  if (ts.isArrowFunction(unwrapped) || ts.isFunctionExpression(unwrapped)) {
    if (!ts.isBlock(unwrapped.body)) return appliesStylePath(unwrapped.body, expected);
    const returned = unwrapped.body.statements.find(ts.isReturnStatement)?.expression;
    return appliesStylePath(returned, expected);
  }
  return false;
}

function functionNamed(source: ts.SourceFile, name: string): ts.FunctionDeclaration {
  const found = source.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
  if (found === undefined) throw new Error(`${name} function declaration not found`);
  return found;
}

function panelFunction(source: ts.SourceFile): ts.FunctionDeclaration {
  return functionNamed(source, 'QuestionPanel');
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
  for (const statement of panel.body?.statements ?? []) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) continue;
      const initializer = unwrapExpression(declaration.initializer);
      if (
        ts.isCallExpression(initializer) &&
        ts.isIdentifier(initializer.expression) &&
        initializer.expression.text === classifierName &&
        initializer.arguments.length === 1 &&
        isPath(initializer.arguments[0]!, ['question', 'text'])
      ) {
        return declaration.name.text;
      }
    }
  }
  return undefined;
}

function returnedJsxElement(fn: ts.FunctionDeclaration): ts.JsxElement | undefined {
  const returned = fn.body?.statements.find(ts.isReturnStatement)?.expression;
  if (returned === undefined) return undefined;
  const expression = unwrapExpression(returned);
  return ts.isJsxElement(expression) ? expression : undefined;
}

function directJsxElements(element: ts.JsxElement): readonly ts.JsxElement[] {
  return element.children.filter(ts.isJsxElement);
}

function directStyledChild(
  parent: ts.JsxElement,
  tag: string,
  stylePath: readonly string[],
): ts.JsxElement | undefined {
  const matches = directJsxElements(parent).filter(
    (child) =>
      child.openingElement.tagName.getText() === tag &&
      appliesStylePath(jsxExpression(jsxAttribute(child.openingElement, 'style')), stylePath),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function questionTextElement(panel: ts.FunctionDeclaration): ts.JsxOpeningLikeElement | undefined {
  const root = returnedJsxElement(panel);
  if (root === undefined) return undefined;
  const row = directStyledChild(root, 'View', ['s', 'questionRow']);
  if (row === undefined) return undefined;
  const texts = directJsxElements(row).filter(
    (child) =>
      child.openingElement.tagName.getText() === 'Text' &&
      jsxAttribute(child.openingElement, 'accessibilityRole')?.initializer?.getText() === '"header"',
  );
  if (texts.length !== 1) return undefined;

  const meaningfulChildren = texts[0]!.children.filter(
    (child) => !(ts.isJsxText(child) && child.text.trim().length === 0),
  );
  const onlyChild = meaningfulChildren[0];
  if (meaningfulChildren.length !== 1 || onlyChild === undefined || !ts.isJsxExpression(onlyChild)) {
    return undefined;
  }
  const rendered = onlyChild.expression;
  if (rendered === undefined || !isPath(rendered, ['question', 'text'])) return undefined;
  return texts[0]!.openingElement;
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

function directVariableInitializer(panel: ts.FunctionDeclaration, name: string): ts.Expression | undefined {
  for (const statement of panel.body?.statements ?? []) {
    if (!ts.isVariableStatement(statement)) continue;
    const found = statement.declarationList.declarations.find(
      (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name,
    );
    if (found?.initializer !== undefined) return found.initializer;
  }
  return undefined;
}

function resolvePanelExpression(panel: ts.FunctionDeclaration, expression: ts.Expression): ts.Expression {
  const unwrapped = unwrapExpression(expression);
  if (!ts.isIdentifier(unwrapped)) return unwrapped;
  const initializer = directVariableInitializer(panel, unwrapped.text);
  return initializer === undefined ? unwrapped : resolvePanelExpression(panel, initializer);
}

function numericArgument(expression: ts.Expression | undefined): number | undefined {
  return numericLiteral(expression === undefined ? undefined : unwrapExpression(expression));
}

function choiceIndices(
  panel: ts.FunctionDeclaration,
  expression: ts.Expression,
): readonly number[] | undefined {
  const resolved = resolvePanelExpression(panel, expression);
  if (
    ts.isCallExpression(resolved) &&
    ts.isPropertyAccessExpression(resolved.expression) &&
    resolved.expression.name.text === 'slice' &&
    isPath(resolved.expression.expression, ['question', 'choices'])
  ) {
    const start = numericArgument(resolved.arguments[0]) ?? 0;
    const end = numericArgument(resolved.arguments[1]) ?? 4;
    if (start < 0 || end < start || end > 4) return undefined;
    return Array.from({ length: end - start }, (_unused, index) => start + index);
  }
  if (ts.isArrayLiteralExpression(resolved)) {
    const indices: number[] = [];
    for (const element of resolved.elements) {
      if (!ts.isElementAccessExpression(element) || !isPath(element.expression, ['question', 'choices'])) {
        return undefined;
      }
      const index = numericArgument(element.argumentExpression);
      if (index === undefined) return undefined;
      indices.push(index);
    }
    return indices;
  }
  return undefined;
}

function returnedJsxFromCallback(
  callback: ts.ArrowFunction | ts.FunctionExpression,
): ts.JsxElement | ts.JsxSelfClosingElement | undefined {
  if (!ts.isBlock(callback.body)) {
    const body = unwrapExpression(callback.body);
    return ts.isJsxElement(body) || ts.isJsxSelfClosingElement(body) ? body : undefined;
  }
  const returned = callback.body.statements.find(ts.isReturnStatement)?.expression;
  if (returned === undefined) return undefined;
  const expression = unwrapExpression(returned);
  return ts.isJsxElement(expression) || ts.isJsxSelfClosingElement(expression) ? expression : undefined;
}

function liveChoiceGrid(panel: ts.FunctionDeclaration): boolean {
  const root = returnedJsxElement(panel);
  if (root === undefined) return false;
  const grid = directStyledChild(root, 'View', ['s', 'grid']);
  if (grid === undefined) return false;

  const outerMaps = descendants(grid, ts.isCallExpression).filter((call) => {
    if (
      !ts.isPropertyAccessExpression(call.expression) ||
      call.expression.name.text !== 'map' ||
      call.arguments.length === 0
    ) {
      return false;
    }
    const callback = call.arguments[0]!;
    if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) return false;
    const returned = returnedJsxFromCallback(callback);
    return (
      returned !== undefined &&
      ts.isJsxElement(returned) &&
      returned.openingElement.tagName.getText() === 'View' &&
      appliesStylePath(jsxExpression(jsxAttribute(returned.openingElement, 'style')), ['s', 'gridRow'])
    );
  });
  if (outerMaps.length !== 1) return false;

  const outerMap = outerMaps[0]!;
  const rowsExpression = resolvePanelExpression(
    panel,
    (outerMap.expression as ts.PropertyAccessExpression).expression,
  );
  if (!ts.isArrayLiteralExpression(rowsExpression) || rowsExpression.elements.length !== 2) return false;
  const rowIndices = rowsExpression.elements.map((row) =>
    ts.isSpreadElement(row) ? undefined : choiceIndices(panel, row),
  );
  if (rowIndices.some((indices) => indices === undefined || indices.length !== 2)) return false;
  const flattened = rowIndices.flatMap((indices) => indices ?? []).sort((left, right) => left - right);
  if (flattened.join(',') !== '0,1,2,3') return false;

  const outerCallback = outerMap.arguments[0]!;
  if (!ts.isArrowFunction(outerCallback) && !ts.isFunctionExpression(outerCallback)) return false;
  const rowParameter = outerCallback.parameters[0]?.name;
  if (rowParameter === undefined || !ts.isIdentifier(rowParameter)) return false;
  const rowJsx = returnedJsxFromCallback(outerCallback);
  if (rowJsx === undefined || !ts.isJsxElement(rowJsx)) return false;

  const innerMaps = descendants(rowJsx, ts.isCallExpression).filter(
    (call) =>
      ts.isPropertyAccessExpression(call.expression) &&
      call.expression.name.text === 'map' &&
      ts.isIdentifier(call.expression.expression) &&
      call.expression.expression.text === rowParameter.text,
  );
  if (innerMaps.length !== 1) return false;
  const innerCallback = innerMaps[0]!.arguments[0];
  if (
    innerCallback === undefined ||
    (!ts.isArrowFunction(innerCallback) && !ts.isFunctionExpression(innerCallback))
  ) {
    return false;
  }
  const valueParameter = innerCallback.parameters[0]?.name;
  if (valueParameter === undefined || !ts.isIdentifier(valueParameter)) return false;
  const choice = returnedJsxFromCallback(innerCallback);
  if (choice === undefined || !ts.isJsxSelfClosingElement(choice) || choice.tagName.getText() !== 'Choice') {
    return false;
  }
  const value = jsxExpression(jsxAttribute(choice, 'value'));
  return value !== undefined && ts.isIdentifier(value) && value.text === valueParameter.text;
}

function liveFuse(panel: ts.FunctionDeclaration): boolean {
  const root = returnedJsxElement(panel);
  if (root === undefined) return false;
  const track = directStyledChild(root, 'View', ['s', 'fuseTrack']);
  if (track === undefined) return false;

  type RenderedChild = ts.JsxElement | ts.JsxSelfClosingElement;
  const renderedChildren: readonly RenderedChild[] = track.children.filter(
    (child): child is RenderedChild => ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child),
  );
  const openingOf = (child: RenderedChild): ts.JsxOpeningLikeElement =>
    ts.isJsxElement(child) ? child.openingElement : child;
  const styledChild = (tag: string, stylePath: readonly string[]): RenderedChild | undefined => {
    const matches = renderedChildren.filter((child) => {
      const opening = openingOf(child);
      return (
        opening.tagName.getText() === tag &&
        appliesStylePath(jsxExpression(jsxAttribute(opening, 'style')), stylePath)
      );
    });
    return matches.length === 1 ? matches[0] : undefined;
  };

  const spent = styledChild('View', ['s', 'fuseSpent']);
  const gold = styledChild('View', ['s', 'fuseGold']);
  const burn = styledChild('Animated.View', ['s', 'fuseBurn']);
  if (spent === undefined || gold === undefined || burn === undefined) return false;

  const inlineFlex = (element: RenderedChild): ts.Expression | undefined => {
    const style = jsxExpression(jsxAttribute(openingOf(element), 'style'));
    const array = style === undefined ? undefined : unwrapExpression(style);
    if (array === undefined || !ts.isArrayLiteralExpression(array)) return undefined;
    const object = array.elements.find(ts.isObjectLiteralExpression);
    return object === undefined ? undefined : objectProperty(object, 'flex');
  };

  const spentFlex = inlineFlex(spent);
  const goldFlex = inlineFlex(gold);
  const spentUsesTuning =
    spentFlex !== undefined &&
    ts.isBinaryExpression(spentFlex) &&
    spentFlex.operatorToken.kind === ts.SyntaxKind.MinusToken &&
    numericLiteral(spentFlex.left) === 1 &&
    ts.isIdentifier(spentFlex.right) &&
    spentFlex.right.text === 'PERFECT_SHOT_TIMER_FRACTION';
  const goldUsesTuning =
    goldFlex !== undefined && ts.isIdentifier(goldFlex) && goldFlex.text === 'PERFECT_SHOT_TIMER_FRACTION';
  const burnUsesLiveWidth = appliesStylePath(jsxExpression(jsxAttribute(openingOf(burn), 'style')), [
    'burnStyle',
  ]);
  return spentUsesTuning && goldUsesTuning && burnUsesLiveWidth;
}

function liveChoiceTapPath(source: ts.SourceFile): boolean {
  const choice = functionNamed(source, 'Choice');
  const root = returnedJsxElement(choice);
  if (
    root === undefined ||
    root.openingElement.tagName.getText() !== 'Animated.View' ||
    !appliesStylePath(jsxExpression(jsxAttribute(root.openingElement, 'style')), ['s', 'choiceCell'])
  ) {
    return false;
  }
  const pressables = directJsxElements(root).filter(
    (element) => element.openingElement.tagName.getText() === 'Pressable',
  );
  return (
    pressables.length === 1 &&
    appliesStylePath(jsxExpression(jsxAttribute(pressables[0]!.openingElement, 'style')), ['s', 'choice'])
  );
}

function completeQuestionWiring(source: ts.SourceFile): boolean {
  const panel = panelFunction(source);
  const classifier = importedLocalName(source, 'theme/questionTypography', 'questionTypographyFor');
  if (classifier === undefined) return false;
  const binding = classifiedBinding(panel, classifier);
  if (binding === undefined) return false;
  const text = questionTextElement(panel);
  if (text === undefined) return false;
  const style = jsxExpression(jsxAttribute(text, 'style'));
  if (!appliesStylePath(style, [binding, 'style'])) return false;
  for (const property of ['numberOfLines', 'adjustsFontSizeToFit', 'minimumFontScale'] as const) {
    const applied = jsxExpression(jsxAttribute(text, property));
    if (applied === undefined || !isPath(applied, [binding, property])) return false;
  }
  const label = jsxExpression(jsxAttribute(text, 'accessibilityLabel'));
  return label !== undefined && isPath(label, ['question', 'text']);
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
    expect(fitted.minimumFontScale).toBeGreaterThanOrEqual(0.75);
    expect(fitted.minimumFontScale).toBeLessThan(1);
    expect(fitted.style.fontSize).toBeGreaterThanOrEqual(22);
    expect(fitted.style.fontSize).toBeLessThanOrEqual(32);
    expect(fitted.style.lineHeight).toBeGreaterThanOrEqual(fitted.style.fontSize);
    expect(fitted.style.lineHeight).toBeLessThanOrEqual(38);
    expect(fitted.style.lineHeight - fitted.style.fontSize).toBeLessThanOrEqual(8);
    expect(fitted.style.fontSize * fitted.minimumFontScale).toBeGreaterThanOrEqual(16.5);
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
      expect(
        appliesStylePath(style, [binding, 'style']),
        'classified style is not actively applied to Text',
      ).toBe(true);
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
    const minHeight = numericLiteral(objectProperty(row, 'minHeight'));
    expect(minHeight).toBeGreaterThanOrEqual(56);
    expect(minHeight).toBeLessThanOrEqual(100);
  });

  it('spec(A-023:AC-3) exposes the original full question.text as the header accessibilityLabel', () => {
    const text = questionTextElement(panel);
    expect(text, 'the header Text rendering question.text must remain identifiable').toBeDefined();
    if (text === undefined) return;

    const label = jsxExpression(jsxAttribute(text, 'accessibilityLabel'));
    expect(label !== undefined && isPath(label, ['question', 'text'])).toBe(true);
  });

  it('spec(A-023:AC-4) retains the fuse rule and the two-by-two four-choice grid', () => {
    const fuseTrack = styleObject(source, 'fuseTrack');
    const grid = styleObject(source, 'grid');
    const gridRow = styleObject(source, 'gridRow');
    const choiceCell = styleObject(source, 'choiceCell');
    const choice = styleObject(source, 'choice');

    expect(liveFuse(panel), 'the live returned fuse must stay tuning-driven').toBe(true);
    expect(liveChoiceGrid(panel), 'the live grid must render choices 0–3 once in two rows').toBe(true);
    expect(liveChoiceTapPath(source), 'the rendered Choice/Pressable must apply its fill styles').toBe(true);
    expect(numericLiteral(objectProperty(fuseTrack, 'height'))).toBe(18);
    expect(numericLiteral(objectProperty(grid, 'flex'))).toBe(1);
    expect(numericLiteral(objectProperty(gridRow, 'flex'))).toBe(1);
    expect(objectProperty(gridRow, 'flexDirection')?.getText()).toBe("'row'");
    expect(numericLiteral(objectProperty(choiceCell, 'flex'))).toBe(1);
    expect(numericLiteral(objectProperty(choiceCell, 'minHeight'))).toBeGreaterThanOrEqual(64);
    expect(numericLiteral(objectProperty(choice, 'flex'))).toBe(1);
  });

  it('spec(A-023:AC-2) rejects a fully fitted dead header beside an unsafe visible question row', () => {
    const mutated = parseSourceText(`
      import { questionTypographyFor as fit } from '../../theme/questionTypography';
      function QuestionPanel({ question }) {
        const treatment = fit(question.text);
        return (
          <View style={s.wrap}>
            <View style={s.questionRow}>
              <Text accessibilityRole="header">{question.text}</Text>
            </View>
            {false ? (
              <Text
                accessibilityRole="header"
                accessibilityLabel={question.text}
                style={treatment.style}
                numberOfLines={treatment.numberOfLines}
                adjustsFontSizeToFit={treatment.adjustsFontSizeToFit}
                minimumFontScale={treatment.minimumFontScale}
              >
                {question.text}
              </Text>
            ) : null}
          </View>
        );
      }
    `);

    expect(completeQuestionWiring(mutated)).toBe(false);
  });

  it('spec(A-023:AC-4) rejects a removed live grid even when its old source survives in a comment', () => {
    const mutated = parseSourceText(`
      function QuestionPanel({ question }) {
        return (
          <View style={s.wrap}>
            {/* question.choices.slice(0, 2); question.choices.slice(2, 4);
                <View style={s.grid}><View style={s.gridRow}><Choice value={value} /></View></View> */}
          </View>
        );
      }
    `);

    expect(liveChoiceGrid(panelFunction(mutated))).toBe(false);
  });
});
