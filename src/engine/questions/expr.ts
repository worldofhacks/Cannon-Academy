/**
 * T-002 — Safe arithmetic expression and constraint predicate evaluator.
 *
 * Question templates (ARCHITECTURE.md §4.1) carry their answer and their validity conditions as
 * short strings over the template's parameters:
 *
 *     constraints: ["a + b <= 20", "a >= b"]
 *     answerExpr:  "a + b"
 *     distractors: ["a + b + 1", "a + b - 1", "a * b"]
 *
 * This module turns those strings into numbers and booleans by tokenising them, parsing them into
 * a tree, and walking that tree. It NEVER constructs or executes code at runtime: no interpreter
 * of the host language is reachable from here, by any spelling. That property is guarded
 * behaviourally by T-002 AC-21, which poisons every runtime route to code construction before
 * importing this file and asserts none of them is touched.
 *
 * Grammar (complete — anything outside it is a PARSE_ERROR):
 *
 *     expr        := or
 *     or          := and ( "||" and )*
 *     and         := compare ( "&&" compare )*
 *     compare     := sum ( ( "==" | "!=" | "<=" | ">=" | "<" | ">" ) sum )?
 *     sum         := product ( ( "+" | "-" ) product )*
 *     product     := unary ( ( "*" | "/" | "%" ) unary )*
 *     unary       := ( "-" )? primary
 *     primary     := NUMBER | IDENT | IDENT "(" args ")" | "(" expr ")"
 *     args        := expr ( "," expr )*
 *     NUMBER      := digits ( "." digits )?
 *     IDENT       := [A-Za-z_][A-Za-z0-9_]*
 *
 * Semantics pinned by the ticket (LESSONS.md L-010 — degenerate inputs are part of the contract):
 *
 *   - `/` is real division: `7 / 2` is `3.5`, never truncated.
 *   - `%` is the host language's remainder: the sign follows the dividend, so `-7 % 2` is `-1`.
 *   - `/` and `%` by zero throw DIVISION_BY_ZERO — never `Infinity`, never `NaN`.
 *   - `gcd` operates on absolute values and `gcd(0, 0)` is `0`.
 *   - `&&` and `||` short-circuit, so a guard like `"b == 0 || a % b == 0"` cannot raise
 *     DIVISION_BY_ZERO from its skipped operand (AC-23).
 *   - Identifier resolution, function resolution, arity and typing are all STATIC: they run over
 *     the whole tree before any value is computed, so a typo'd parameter in hand-authored content
 *     fails loudly even inside a short-circuited branch (AC-24).
 */

export type ExprErrorCode =
  | 'PARSE_ERROR'
  | 'UNKNOWN_IDENTIFIER'
  | 'UNKNOWN_FUNCTION'
  | 'ARITY_MISMATCH'
  | 'DIVISION_BY_ZERO'
  | 'TYPE_MISMATCH';

/** Every failure path in this module throws one of these — never `NaN`, `Infinity` or `null`. */
export class ExprError extends Error {
  readonly code: ExprErrorCode;

  constructor(code: ExprErrorCode, message: string) {
    super(message);
    this.name = 'ExprError';
    this.code = code;
  }
}

/** The parameter environment: template parameter name to sampled value. */
type Environment = Readonly<Record<string, number>>;

// ---------------------------------------------------------------------------------------------
// Tokeniser
// ---------------------------------------------------------------------------------------------

type ArithmeticOperator = '+' | '-' | '*' | '/' | '%';
type ComparisonOperator = '==' | '!=' | '<' | '<=' | '>' | '>=';
type LogicalOperator = '&&' | '||';
type BinaryOperator = ArithmeticOperator | ComparisonOperator | LogicalOperator;
type Punctuation = '(' | ')' | ',';
type OperatorText = BinaryOperator | Punctuation;

type Token =
  | { readonly kind: 'number'; readonly value: number; readonly at: number }
  | { readonly kind: 'identifier'; readonly name: string; readonly at: number }
  | { readonly kind: 'operator'; readonly op: OperatorText; readonly at: number };

/** Two-character operators must be matched before their one-character prefixes. */
const TWO_CHARACTER_OPERATORS: readonly OperatorText[] = ['==', '!=', '<=', '>=', '&&', '||'];

const ONE_CHARACTER_OPERATORS: readonly OperatorText[] = ['+', '-', '*', '/', '%', '(', ')', ',', '<', '>'];

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isIdentifierStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

function isIdentifierPart(ch: string): boolean {
  return isIdentifierStart(ch) || isDigit(ch);
}

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

/**
 * `NUMBER := digits ( "." digits )?` and nothing else. Exponents (`1e3`), radix prefixes
 * (`0x10`, `0b11`, `0o17`) and digit separators (`1_000`) are outside the grammar; each of them
 * tokenises as a number immediately followed by an identifier, which the parser then rejects as
 * a trailing token.
 */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const ch = source.charAt(index);

    if (isWhitespace(ch)) {
      index += 1;
      continue;
    }

    if (isDigit(ch)) {
      const start = index;
      while (isDigit(source.charAt(index))) {
        index += 1;
      }
      if (source.charAt(index) === '.' && isDigit(source.charAt(index + 1))) {
        index += 1;
        while (isDigit(source.charAt(index))) {
          index += 1;
        }
      }
      tokens.push({ kind: 'number', value: Number(source.slice(start, index)), at: start });
      continue;
    }

    if (isIdentifierStart(ch)) {
      const start = index;
      while (isIdentifierPart(source.charAt(index))) {
        index += 1;
      }
      tokens.push({ kind: 'identifier', name: source.slice(start, index), at: start });
      continue;
    }

    const pair = source.slice(index, index + 2);
    const twoCharacter = TWO_CHARACTER_OPERATORS.find((candidate) => candidate === pair);
    if (twoCharacter !== undefined) {
      tokens.push({ kind: 'operator', op: twoCharacter, at: index });
      index += 2;
      continue;
    }

    const oneCharacter = ONE_CHARACTER_OPERATORS.find((candidate) => candidate === ch);
    if (oneCharacter !== undefined) {
      tokens.push({ kind: 'operator', op: oneCharacter, at: index });
      index += 1;
      continue;
    }

    throw new ExprError('PARSE_ERROR', `unexpected character ${JSON.stringify(ch)} at position ${index}`);
  }

  return tokens;
}

// ---------------------------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------------------------

type Node =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'identifier'; readonly name: string }
  | { readonly kind: 'negate'; readonly operand: Node }
  | {
      readonly kind: 'binary';
      readonly op: BinaryOperator;
      readonly left: Node;
      readonly right: Node;
    }
  | { readonly kind: 'call'; readonly name: string; readonly args: readonly Node[] };

/**
 * Maximum nesting of parenthesised groups and call argument lists. AC-20 requires 16 levels to
 * evaluate; AC-15 requires 200 to be rejected with PARSE_ERROR rather than a stack overflow. The
 * limit is checked on the way *in*, so a 5,000-deep input stops after 65 groups and never
 * approaches the host stack.
 */
const MAX_NESTING_DEPTH = 64;

const COMPARISON_OPERATORS: readonly ComparisonOperator[] = ['==', '!=', '<=', '>=', '<', '>'];
const SUM_OPERATORS: readonly ArithmeticOperator[] = ['+', '-'];
const PRODUCT_OPERATORS: readonly ArithmeticOperator[] = ['*', '/', '%'];

class Parser {
  private readonly tokens: readonly Token[];
  private index = 0;
  private depth = 0;

  constructor(tokens: readonly Token[]) {
    this.tokens = tokens;
  }

  /** Parses one complete expression and rejects anything left over. */
  parseProgram(): Node {
    const node = this.parseOr();
    const leftover = this.peek();
    if (leftover !== undefined) {
      throw new ExprError('PARSE_ERROR', `unexpected trailing token at position ${leftover.at}`);
    }
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private takeBinaryOperator<T extends BinaryOperator>(candidates: readonly T[]): T | undefined {
    const token = this.peek();
    if (token === undefined || token.kind !== 'operator') {
      return undefined;
    }
    const found = candidates.find((candidate) => candidate === token.op);
    if (found === undefined) {
      return undefined;
    }
    this.index += 1;
    return found;
  }

  private atPunctuation(op: Punctuation): boolean {
    const token = this.peek();
    return token !== undefined && token.kind === 'operator' && token.op === op;
  }

  private takePunctuation(op: Punctuation): boolean {
    if (!this.atPunctuation(op)) {
      return false;
    }
    this.index += 1;
    return true;
  }

  private expectPunctuation(op: Punctuation): void {
    if (!this.atPunctuation(op)) {
      const token = this.peek();
      throw new ExprError(
        'PARSE_ERROR',
        token === undefined
          ? `expected ${JSON.stringify(op)} but the expression ended`
          : `expected ${JSON.stringify(op)} at position ${token.at}`,
      );
    }
    this.index += 1;
  }

  /** Enters one level of parenthesised or call nesting, rejecting over-deep input up front. */
  private enterNesting<T>(body: () => T): T {
    this.depth += 1;
    if (this.depth > MAX_NESTING_DEPTH) {
      throw new ExprError(
        'PARSE_ERROR',
        `expression nests deeper than the limit of ${MAX_NESTING_DEPTH} levels`,
      );
    }
    const result = body();
    this.depth -= 1;
    return result;
  }

  private parseOr(): Node {
    let left = this.parseAnd();
    for (;;) {
      const op = this.takeBinaryOperator<LogicalOperator>(['||']);
      if (op === undefined) {
        return left;
      }
      left = { kind: 'binary', op, left, right: this.parseAnd() };
    }
  }

  private parseAnd(): Node {
    let left = this.parseCompare();
    for (;;) {
      const op = this.takeBinaryOperator<LogicalOperator>(['&&']);
      if (op === undefined) {
        return left;
      }
      left = { kind: 'binary', op, left, right: this.parseCompare() };
    }
  }

  /** Comparisons do not chain: `a < b < c` leaves a trailing token and fails. */
  private parseCompare(): Node {
    const left = this.parseSum();
    const op = this.takeBinaryOperator(COMPARISON_OPERATORS);
    if (op === undefined) {
      return left;
    }
    return { kind: 'binary', op, left, right: this.parseSum() };
  }

  private parseSum(): Node {
    let left = this.parseProduct();
    for (;;) {
      const op = this.takeBinaryOperator(SUM_OPERATORS);
      if (op === undefined) {
        return left;
      }
      left = { kind: 'binary', op, left, right: this.parseProduct() };
    }
  }

  private parseProduct(): Node {
    let left = this.parseUnary();
    for (;;) {
      const op = this.takeBinaryOperator(PRODUCT_OPERATORS);
      if (op === undefined) {
        return left;
      }
      left = { kind: 'binary', op, left, right: this.parseUnary() };
    }
  }

  /** `unary := ( "-" )? primary` — a single, non-repeating minus, so `- -a` is a parse error. */
  private parseUnary(): Node {
    const token = this.peek();
    if (token !== undefined && token.kind === 'operator' && token.op === '-') {
      this.index += 1;
      return { kind: 'negate', operand: this.parsePrimary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    const token = this.peek();
    if (token === undefined) {
      throw new ExprError('PARSE_ERROR', 'unexpected end of expression');
    }

    if (token.kind === 'number') {
      this.index += 1;
      return { kind: 'number', value: token.value };
    }

    if (token.kind === 'identifier') {
      this.index += 1;
      if (this.atPunctuation('(')) {
        return { kind: 'call', name: token.name, args: this.parseArguments() };
      }
      return { kind: 'identifier', name: token.name };
    }

    if (token.op === '(') {
      this.index += 1;
      const inner = this.enterNesting(() => this.parseOr());
      this.expectPunctuation(')');
      return inner;
    }

    throw new ExprError(
      'PARSE_ERROR',
      `unexpected token ${JSON.stringify(token.op)} at position ${token.at}`,
    );
  }

  /**
   * `args := expr ( "," expr )*` requires at least one argument, so a zero-argument call such as
   * `abs()` is a grammar violation and fails as PARSE_ERROR before the name is ever resolved
   * (AC-18). ARITY_MISMATCH is reserved for one-too-few or one-too-many.
   */
  private parseArguments(): Node[] {
    this.expectPunctuation('(');
    const args = this.enterNesting(() => {
      const collected: Node[] = [this.parseOr()];
      while (this.takePunctuation(',')) {
        collected.push(this.parseOr());
      }
      return collected;
    });
    this.expectPunctuation(')');
    return args;
  }
}

function parse(source: string): Node {
  return new Parser(tokenize(source)).parseProgram();
}

// ---------------------------------------------------------------------------------------------
// The closed function whitelist
// ---------------------------------------------------------------------------------------------

type FunctionSpec =
  | { readonly arity: 1; readonly apply: (x: number) => number }
  | { readonly arity: 2; readonly apply: (x: number, y: number) => number };

/** Euclid on absolute values: `gcd(-12, 18)` is `6`, `gcd(5, 0)` is `5`, `gcd(0, 0)` is `0`. */
function greatestCommonDivisor(x: number, y: number): number {
  let left = Math.abs(x);
  let right = Math.abs(y);
  while (right !== 0) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }
  return left;
}

/**
 * Exactly the six whitelisted names. Calls are resolved through THIS map and nothing else — never
 * by looking a name up on a built-in object, which would silently expose `pow`, `log`, `cbrt` and
 * friends (AC-22). A `Map` is used rather than an object literal so inherited members such as
 * `constructor` and `toString` are not reachable as function names.
 */
const WHITELISTED_FUNCTIONS: ReadonlyMap<string, FunctionSpec> = new Map<string, FunctionSpec>([
  ['abs', { arity: 1, apply: (x) => Math.abs(x) }],
  ['floor', { arity: 1, apply: (x) => Math.floor(x) }],
  ['ceil', { arity: 1, apply: (x) => Math.ceil(x) }],
  ['min', { arity: 2, apply: (x, y) => Math.min(x, y) }],
  ['max', { arity: 2, apply: (x, y) => Math.max(x, y) }],
  ['gcd', { arity: 2, apply: greatestCommonDivisor }],
]);

/** Resolves a call, rejecting an unknown name before ever considering its arity. */
function resolveWhitelistedCall(name: string, argumentCount: number): FunctionSpec {
  const spec = WHITELISTED_FUNCTIONS.get(name);
  if (spec === undefined) {
    throw new ExprError(
      'UNKNOWN_FUNCTION',
      `unknown function "${name}" — permitted functions are abs, min, max, floor, ceil, gcd`,
    );
  }
  if (argumentCount !== spec.arity) {
    throw new ExprError(
      'ARITY_MISMATCH',
      `function "${name}" takes ${spec.arity} argument(s) but received ${argumentCount}`,
    );
  }
  return spec;
}

// ---------------------------------------------------------------------------------------------
// Static checking — names, arity and types, over the whole tree, before any value is computed
// ---------------------------------------------------------------------------------------------

type ValueType = 'number' | 'boolean';

const ARITHMETIC_OPERATORS: readonly ArithmeticOperator[] = ['+', '-', '*', '/', '%'];

function isArithmeticOperator(op: BinaryOperator): op is ArithmeticOperator {
  return ARITHMETIC_OPERATORS.some((candidate) => candidate === op);
}

function isComparisonOperator(op: BinaryOperator): op is ComparisonOperator {
  return COMPARISON_OPERATORS.some((candidate) => candidate === op);
}

function requireType(actual: ValueType, expected: ValueType, context: string): void {
  if (actual !== expected) {
    throw new ExprError('TYPE_MISMATCH', `${context} requires a ${expected} but received a ${actual}`);
  }
}

function unknownIdentifier(name: string): ExprError {
  return new ExprError('UNKNOWN_IDENTIFIER', `unknown identifier "${name}"`);
}

/**
 * Walks the entire tree, resolving every identifier and every call and typing every node. This
 * runs before evaluation and visits both operands of `&&` and `||`, which is what makes
 * identifier resolution and type checking survive short-circuiting (AC-23, AC-24).
 */
function checkNode(node: Node, env: Environment): ValueType {
  switch (node.kind) {
    case 'number':
      return 'number';

    case 'identifier':
      if (!Object.hasOwn(env, node.name)) {
        throw unknownIdentifier(node.name);
      }
      return 'number';

    case 'negate':
      requireType(checkNode(node.operand, env), 'number', 'unary "-"');
      return 'number';

    case 'call': {
      resolveWhitelistedCall(node.name, node.args.length);
      for (const arg of node.args) {
        requireType(checkNode(arg, env), 'number', `an argument of "${node.name}"`);
      }
      return 'number';
    }

    case 'binary': {
      const left = checkNode(node.left, env);
      const right = checkNode(node.right, env);
      const context = `operator "${node.op}"`;
      if (isArithmeticOperator(node.op)) {
        requireType(left, 'number', context);
        requireType(right, 'number', context);
        return 'number';
      }
      if (isComparisonOperator(node.op)) {
        requireType(left, 'number', context);
        requireType(right, 'number', context);
        return 'boolean';
      }
      requireType(left, 'boolean', context);
      requireType(right, 'boolean', context);
      return 'boolean';
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Evaluation — a plain walk of the checked tree
// ---------------------------------------------------------------------------------------------

function readIdentifier(name: string, env: Environment): number {
  const value = env[name];
  if (!Object.hasOwn(env, name) || value === undefined) {
    throw unknownIdentifier(name);
  }
  return value;
}

function applyArithmetic(op: ArithmeticOperator, left: number, right: number): number {
  switch (op) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      if (right === 0) {
        throw new ExprError('DIVISION_BY_ZERO', 'division by zero');
      }
      return left / right;
    case '%':
      if (right === 0) {
        throw new ExprError('DIVISION_BY_ZERO', 'remainder by zero');
      }
      return left % right;
  }
}

function applyComparison(op: ComparisonOperator, left: number, right: number): boolean {
  switch (op) {
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '>':
      return left > right;
    case '>=':
      return left >= right;
  }
}

/**
 * The `TYPE_MISMATCH` throws below are defensive: `checkNode` has already proved every node's
 * type, so a boolean-valued node cannot arrive here. They exist so that a future change which
 * bypasses the static pass fails with a typed error rather than producing `NaN`.
 */
function computeNumber(node: Node, env: Environment): number {
  switch (node.kind) {
    case 'number':
      return node.value;

    case 'identifier':
      return readIdentifier(node.name, env);

    case 'negate':
      return -computeNumber(node.operand, env);

    case 'call': {
      const values: number[] = [];
      for (const arg of node.args) {
        values.push(computeNumber(arg, env));
      }
      return applyWhitelistedCall(node.name, values);
    }

    case 'binary':
      if (isArithmeticOperator(node.op)) {
        return applyArithmetic(node.op, computeNumber(node.left, env), computeNumber(node.right, env));
      }
      throw new ExprError('TYPE_MISMATCH', `operator "${node.op}" does not produce a number`);
  }
}

function applyWhitelistedCall(name: string, values: readonly number[]): number {
  const spec = resolveWhitelistedCall(name, values.length);
  const first = values[0];
  if (spec.arity === 1) {
    if (first === undefined) {
      throw new ExprError('ARITY_MISMATCH', `function "${name}" takes 1 argument but received 0`);
    }
    return spec.apply(first);
  }
  const second = values[1];
  if (first === undefined || second === undefined) {
    throw new ExprError(
      'ARITY_MISMATCH',
      `function "${name}" takes 2 arguments but received ${values.length}`,
    );
  }
  return spec.apply(first, second);
}

/** `&&` and `||` short-circuit, so an unevaluated operand cannot raise DIVISION_BY_ZERO. */
function computeBoolean(node: Node, env: Environment): boolean {
  if (node.kind === 'binary') {
    if (node.op === '&&') {
      return computeBoolean(node.left, env) ? computeBoolean(node.right, env) : false;
    }
    if (node.op === '||') {
      return computeBoolean(node.left, env) ? true : computeBoolean(node.right, env);
    }
    if (isComparisonOperator(node.op)) {
      return applyComparison(node.op, computeNumber(node.left, env), computeNumber(node.right, env));
    }
  }
  throw new ExprError('TYPE_MISMATCH', 'expression does not produce a boolean');
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

/**
 * Evaluates an arithmetic expression (`answerExpr`, a distractor) against a parameter
 * environment. Throws `ExprError` for every failure; never returns `NaN` or `Infinity`.
 */
export function evaluateNumber(source: string, env: Environment): number {
  const node = parse(source);
  requireType(checkNode(node, env), 'number', 'evaluateNumber');
  return computeNumber(node, env);
}

/**
 * Evaluates a constraint predicate against a parameter environment. Throws `ExprError` for every
 * failure; the expression must produce a boolean at top level.
 */
export function evaluatePredicate(source: string, env: Environment): boolean {
  const node = parse(source);
  requireType(checkNode(node, env), 'boolean', 'evaluatePredicate');
  return computeBoolean(node, env);
}
