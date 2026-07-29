import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '../..');
const HUD_PATH = 'src/components/duel/Hud.tsx';
const PANELS_PATH = 'src/components/duel/Panels.tsx';
const DUEL_PATH = 'app/duel.tsx';

const TEXT_PRESENTATION = '\uFE0E';
const ANCHOR = '\u2693';
const NEXT = '\u25B6';
const PREVIOUS = '\u25C0';

interface StaticContext {
  readonly file: ts.SourceFile;
  readonly declarations: ReadonlyMap<string, ts.Expression>;
  readonly resolving: ReadonlySet<string>;
}

function sourceFile(relativePath: string, source = readFileSync(join(REPO_ROOT, relativePath), 'utf8')) {
  return ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function staticContext(file: ts.SourceFile): StaticContext {
  const declarations = new Map<string, ts.Expression>();

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
      declarations.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };

  visit(file);
  return { file, declarations, resolving: new Set() };
}

/**
 * Resolve only expressions whose rendered string is statically knowable. Supporting conditionals,
 * concatenation, templates, const aliases, and String.fromCodePoint closes the exact decoy/runtime
 * hole the independent review found without imposing a whole-app glyph policy.
 */
function staticStrings(node: ts.Expression, context: StaticContext): readonly string[] {
  if (ts.isStringLiteralLike(node)) return [node.text];

  if (ts.isConditionalExpression(node)) {
    return [...staticStrings(node.whenTrue, context), ...staticStrings(node.whenFalse, context)];
  }

  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return combine(staticStrings(node.left, context), staticStrings(node.right, context));
  }

  if (ts.isTemplateExpression(node)) {
    let values: readonly string[] = [node.head.text];
    for (const span of node.templateSpans) {
      values = combine(values, staticStrings(span.expression, context)).map(
        (value) => `${value}${span.literal.text}`,
      );
    }
    return values;
  }

  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    return staticStrings(node.expression, context);
  }

  if (ts.isIdentifier(node)) {
    if (context.resolving.has(node.text)) return [];
    const initializer = context.declarations.get(node.text);
    if (initializer === undefined) return [];
    return staticStrings(initializer, {
      ...context,
      resolving: new Set([...context.resolving, node.text]),
    });
  }

  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'String' &&
    (node.expression.name.text === 'fromCodePoint' || node.expression.name.text === 'fromCharCode')
  ) {
    const numbers = node.arguments.map(staticNumber);
    if (numbers.some((value) => value === null)) return [];
    const codePoints = numbers as number[];
    return [
      node.expression.name.text === 'fromCodePoint'
        ? String.fromCodePoint(...codePoints)
        : String.fromCharCode(...codePoints),
    ];
  }

  return [];
}

function staticNumber(node: ts.Expression): number | null {
  if (ts.isNumericLiteral(node)) {
    const value = Number(node.getText());
    return Number.isFinite(value) ? value : null;
  }
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
    const value = staticNumber(node.operand);
    return value === null ? null : -value;
  }
  return null;
}

function combine(left: readonly string[], right: readonly string[]): readonly string[] {
  return left.flatMap((prefix) => right.map((suffix) => `${prefix}${suffix}`));
}

function styledTextValues(file: ts.SourceFile, styleName: string): readonly string[] {
  const matches: ts.JsxElement[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isJsxElement(node) &&
      node.openingElement.tagName.getText(file) === 'Text' &&
      jsxStyleName(node.openingElement) === styleName
    ) {
      matches.push(node);
    }
    ts.forEachChild(node, visit);
  };

  visit(file);
  const match = matches[0];
  if (matches.length !== 1 || match === undefined) {
    throw new Error(
      `${file.fileName}: expected exactly one Text styled ${styleName}, found ${matches.length}`,
    );
  }

  const context = staticContext(file);
  let rendered: readonly string[] = [''];

  for (const child of match.children) {
    let values: readonly string[];
    if (ts.isJsxText(child)) {
      const decoded = decodeJsxEntities(child.text);
      if (decoded.trim() === '') continue;
      values = [decoded];
    } else if (ts.isJsxExpression(child) && child.expression !== undefined) {
      values = staticStrings(child.expression, context);
    } else {
      values = [];
    }
    rendered = combine(rendered, values);
  }

  return rendered.map((value) => value.trim());
}

function jsxStyleName(element: ts.JsxOpeningElement): string | null {
  const style = element.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText() === 'style',
  );
  if (
    style?.initializer === undefined ||
    !ts.isJsxExpression(style.initializer) ||
    style.initializer.expression === undefined ||
    !ts.isPropertyAccessExpression(style.initializer.expression)
  ) {
    return null;
  }
  return style.initializer.expression.name.text;
}

function rivalImpactIcon(file: ts.SourceFile): readonly string[] {
  const context = staticContext(file);
  const functions: ts.FunctionDeclaration[] = [];

  const findFunction = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'resolveCopy') {
      functions.push(node);
    }
    ts.forEachChild(node, findFunction);
  };

  findFunction(file);
  const resolveCopy = functions[0];
  if (functions.length !== 1 || resolveCopy?.body === undefined) {
    throw new Error(`${file.fileName}: expected exactly one resolveCopy function body`);
  }

  const cases: ts.CaseClause[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isCaseClause(node) &&
      staticStrings(node.expression, context).length === 1 &&
      staticStrings(node.expression, context)[0] === 'rivalImpact'
    ) {
      cases.push(node);
    }
    ts.forEachChild(node, visit);
  };

  visit(resolveCopy.body);
  const rivalImpact = cases[0];
  if (cases.length !== 1 || rivalImpact === undefined) {
    throw new Error(`${file.fileName}: expected exactly one rivalImpact case, found ${cases.length}`);
  }

  const returns = rivalImpact.statements.filter(
    (statement): statement is ts.ReturnStatement =>
      ts.isReturnStatement(statement) && statement.expression !== undefined,
  );
  const returned = returns[0];
  if (
    returns.length !== 1 ||
    returned?.expression === undefined ||
    !ts.isObjectLiteralExpression(returned.expression)
  ) {
    throw new Error(`${file.fileName}: rivalImpact must directly return one object literal`);
  }

  const icons = returned.expression.properties.filter(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) && property.name.getText(file).replace(/['"]/g, '') === 'icon',
  );
  const icon = icons[0];
  if (icons.length !== 1 || icon === undefined) {
    throw new Error(`${file.fileName}: rivalImpact must declare exactly one icon property`);
  }
  return staticStrings(icon.initializer, context);
}

function decodeJsxEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function siteProblems(actual: readonly string[], expected: readonly string[]): readonly string[] {
  if (actual.length !== expected.length) {
    return [`expected ${expected.length} static render value(s), found ${actual.length}`];
  }
  return actual.flatMap((value, index) =>
    value === expected[index]
      ? []
      : [`value ${index + 1}: expected ${codePoints(expected[index] ?? '')}, got ${codePoints(value)}`],
  );
}

describe('native text presentation at the four shipped render sites', () => {
  it('spec(A-021:AC-1) pins the duel-HUD anchor Text child', () => {
    const actual = styledTextValues(sourceFile(HUD_PATH), 'anchorGlyph');
    expect(siteProblems(actual, [`${ANCHOR}${TEXT_PRESENTATION}`])).toEqual([]);
  });

  it('spec(A-021:AC-1) pins both branches of the duel-HUD turn-pip Text child', () => {
    const actual = styledTextValues(sourceFile(HUD_PATH), 'turnPipGlyph');
    expect(siteProblems(actual, [`${NEXT}${TEXT_PRESENTATION}`, `${PREVIOUS}${TEXT_PRESENTATION}`])).toEqual(
      [],
    );
  });

  it('spec(A-021:AC-1) pins the rival watch-panel Text child', () => {
    const actual = styledTextValues(sourceFile(PANELS_PATH), 'rivalIconText');
    expect(siteProblems(actual, [`${PREVIOUS}${TEXT_PRESENTATION}`])).toEqual([]);
  });

  it('spec(A-021:AC-1) pins the rivalImpact case icon property', () => {
    const actual = rivalImpactIcon(sourceFile(DUEL_PATH));
    expect(siteProblems(actual, [`${PREVIOUS}${TEXT_PRESENTATION}`])).toEqual([]);
  });

  it('spec(A-021:AC-1) rejects a bare runtime glyph even when a compliant decoy literal exists', () => {
    const source = readFileSync(join(REPO_ROOT, HUD_PATH), 'utf8');
    const safeBranch = "playerActive ? '▶︎' : '◀︎'";
    const unsafeBranch = "playerActive ? '▶︎' : String.fromCodePoint(0x25c0)";
    expect(source).toContain(safeBranch);

    const mutated = `${source.replace(safeBranch, unsafeBranch)}\nconst auditDecoy = '◀︎';\n`;
    const actual = styledTextValues(sourceFile(HUD_PATH, mutated), 'turnPipGlyph');

    expect(siteProblems(actual, [`${NEXT}${TEXT_PRESENTATION}`, `${PREVIOUS}${TEXT_PRESENTATION}`])).toEqual([
      'value 2: expected U+25C0 U+FE0E, got U+25C0',
    ]);
  });
});

function codePoints(value: string): string {
  return Array.from(value, (character) => `U+${character.codePointAt(0)?.toString(16).toUpperCase()}`).join(
    ' ',
  );
}
