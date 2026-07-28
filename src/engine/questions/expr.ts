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
 *   - No non-finite number may enter, leave, or flow through an evaluation (AC-25). `gcd` is the
 *     concrete hazard — `(NaN, NaN)` is a fixed point of the Euclid loop, so a single non-finite
 *     argument would spin forever inside T-007's rejection-sampling loop, with no error and no
 *     recovery.
 *
 * Two deterministic bounds keep the module total. Both are fixed numbers, chosen so that no
 * outcome depends on how deep the host's stack happens to go — see `MAX_AST_DEPTH` for the
 * measured margins, which differ sharply between Node and a browser main thread.
 *
 *   - `MAX_NESTING_DEPTH` bounds parenthesis and call nesting (AC-15, AC-20).
 *   - `MAX_AST_DEPTH` bounds the height of the parsed tree (AC-26). The binary productions fold
 *     iteratively, so an operator chain never touches the nesting counter — but it builds a
 *     left-deep tree that the checking and evaluation passes then walk recursively. Height is
 *     computed as the tree is built and checked at every node, so an over-long chain fails as
 *     PARSE_ERROR during parsing rather than as a `RangeError` during the walk.
 */

export type ExprErrorCode =
  | 'PARSE_ERROR'
  | 'UNKNOWN_IDENTIFIER'
  | 'UNKNOWN_FUNCTION'
  | 'ARITY_MISMATCH'
  | 'DIVISION_BY_ZERO'
  | 'TYPE_MISMATCH'
  | 'NON_FINITE_VALUE';

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
 *
 * A literal too large for a double (`"9".repeat(309)`) is rejected here, at the source, because
 * representability is a property of the text rather than of the parameters — so a bad literal in
 * hand-authored content fails even when its branch is short-circuited. Non-finite *values* are a
 * separate matter and are caught during evaluation; see `computeNumber`.
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
      const text = source.slice(start, index);
      const value = Number(text);
      if (!Number.isFinite(value)) {
        throw new ExprError(
          'NON_FINITE_VALUE',
          `the numeric literal at position ${start} is too large to represent as a finite number`,
        );
      }
      tokens.push({ kind: 'number', value, at: start });
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

/**
 * `height` is the length of the longest path from this node to a leaf, and therefore exactly the
 * recursion depth that `checkNode`, `computeNumber` and `computeBoolean` will reach on it. It is
 * accumulated as the tree is built so the bound can be enforced during parsing.
 */
type Node =
  | { readonly kind: 'number'; readonly value: number; readonly height: number }
  | { readonly kind: 'identifier'; readonly name: string; readonly height: number }
  | { readonly kind: 'negate'; readonly operand: Node; readonly height: number }
  | {
      readonly kind: 'binary';
      readonly op: BinaryOperator;
      readonly left: Node;
      readonly right: Node;
      readonly height: number;
    }
  | {
      readonly kind: 'call';
      readonly name: string;
      readonly args: readonly Node[];
      readonly height: number;
    };

/**
 * Maximum nesting of parenthesised groups and call argument lists. AC-20 requires 16 levels to
 * evaluate; AC-15 requires 200 to be rejected with PARSE_ERROR rather than a stack overflow. The
 * limit is checked on the way *in*, so a 5,000-deep input stops after 65 groups and never
 * approaches the host stack.
 */
const MAX_NESTING_DEPTH = 64;

/**
 * Maximum height of the parsed tree, which is the maximum recursion depth of every later walk.
 *
 * Floor: the longest expression that must still evaluate. AC-26 requires a 500-term operator
 * chain, whose left-deep tree has height 500, so the cap cannot go below that.
 *
 * Ceiling: the host stack. This is NOT one number — it varies by roughly an order of magnitude
 * across the hosts this engine is expected to run on. Bisected with the cap lifted, at controlled
 * stack sizes:
 *
 *     stack size                        longest chain that evaluates      margin over 1024
 *     4 MB   (Node's default)           18,756 terms                      18.3x
 *     1 MB   (approx. a browser main thread)   3,521 terms                 3.4x
 *     0.5 MB (a constrained worker)      1,569 terms                       1.5x
 *
 * So the real headroom on a constrained worker is 1.5x, not the ~4x an earlier revision of this
 * comment claimed from Node-only figures. The boundary is also run-dependent, not merely
 * host-dependent: repeated bisections on one machine do not agree, because the frames already on
 * the stack when the walk begins vary. That is an argument FOR a fixed cap — an emergent limit
 * would make the same input succeed and fail on the same machine.
 *
 * 1024 is twice the required floor and stays inside the smallest measured ceiling, so the same
 * input is accepted or rejected identically everywhere, which is what AC-26 asks for. It is a
 * margin, not a proof: `checkNode`, `computeNumber` and `computeBoolean` still recurse, so this
 * constant is what keeps them safe rather than anything structural. Converting those three walks
 * to explicit-stack iteration would remove the dependence entirely; it is filed as a follow-up.
 */
const MAX_AST_DEPTH = 1024;

const COMPARISON_OPERATORS: readonly ComparisonOperator[] = ['==', '!=', '<=', '>=', '<', '>'];
const SUM_OPERATORS: readonly ArithmeticOperator[] = ['+', '-'];
const PRODUCT_OPERATORS: readonly ArithmeticOperator[] = ['*', '/', '%'];

/** Height of the tallest node in a non-empty list; `args` always has at least one member. */
function tallest(nodes: readonly Node[]): number {
  let best = 0;
  for (const node of nodes) {
    if (node.height > best) {
      best = node.height;
    }
  }
  return best;
}

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

  /**
   * Rejects a tree taller than `MAX_AST_DEPTH`. Called at every node that can grow, so the
   * failure happens while the tree is still being built — before any walk can recurse into it.
   */
  private withinAstDepth<T extends Node>(candidate: T): T {
    if (candidate.height > MAX_AST_DEPTH) {
      throw new ExprError(
        'PARSE_ERROR',
        `expression builds a tree taller than the limit of ${MAX_AST_DEPTH} levels`,
      );
    }
    return candidate;
  }

  /**
   * Binary productions fold iteratively, so an operator chain grows the tree one level per
   * operator without ever touching the nesting counter. Checking here is what bounds it.
   */
  private makeBinary(op: BinaryOperator, left: Node, right: Node): Node {
    return this.withinAstDepth({
      kind: 'binary',
      op,
      left,
      right,
      height: Math.max(left.height, right.height) + 1,
    });
  }

  private parseOr(): Node {
    let left = this.parseAnd();
    for (;;) {
      const op = this.takeBinaryOperator<LogicalOperator>(['||']);
      if (op === undefined) {
        return left;
      }
      left = this.makeBinary(op, left, this.parseAnd());
    }
  }

  private parseAnd(): Node {
    let left = this.parseCompare();
    for (;;) {
      const op = this.takeBinaryOperator<LogicalOperator>(['&&']);
      if (op === undefined) {
        return left;
      }
      left = this.makeBinary(op, left, this.parseCompare());
    }
  }

  /** Comparisons do not chain: `a < b < c` leaves a trailing token and fails. */
  private parseCompare(): Node {
    const left = this.parseSum();
    const op = this.takeBinaryOperator(COMPARISON_OPERATORS);
    if (op === undefined) {
      return left;
    }
    return this.makeBinary(op, left, this.parseSum());
  }

  private parseSum(): Node {
    let left = this.parseProduct();
    for (;;) {
      const op = this.takeBinaryOperator(SUM_OPERATORS);
      if (op === undefined) {
        return left;
      }
      left = this.makeBinary(op, left, this.parseProduct());
    }
  }

  private parseProduct(): Node {
    let left = this.parseUnary();
    for (;;) {
      const op = this.takeBinaryOperator(PRODUCT_OPERATORS);
      if (op === undefined) {
        return left;
      }
      left = this.makeBinary(op, left, this.parseUnary());
    }
  }

  /** `unary := ( "-" )? primary` — a single, non-repeating minus, so `- -a` is a parse error. */
  private parseUnary(): Node {
    const token = this.peek();
    if (token !== undefined && token.kind === 'operator' && token.op === '-') {
      this.index += 1;
      const operand = this.parsePrimary();
      return this.withinAstDepth({ kind: 'negate', operand, height: operand.height + 1 });
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
      return { kind: 'number', value: token.value, height: 1 };
    }

    if (token.kind === 'identifier') {
      this.index += 1;
      if (this.atPunctuation('(')) {
        const args = this.parseArguments();
        return this.withinAstDepth({
          kind: 'call',
          name: token.name,
          args,
          height: tallest(args) + 1,
        });
      }
      return { kind: 'identifier', name: token.name, height: 1 };
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
 * The single membership rule for the environment, shared by the checking pass and the evaluation
 * pass so the two cannot drift apart. Inherited members do not count: `constructor`, `toString`,
 * `hasOwnProperty` and `__proto__` are all reachable on a plain object literal and none of them
 * is a template parameter.
 */
function hasParameter(env: Environment, name: string): boolean {
  return Object.hasOwn(env, name);
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
      if (!hasParameter(env, node.name)) {
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

/**
 * Applies the same `hasParameter` rule as the checking pass, so a name accepted there is accepted
 * here. The second guard is not a second membership rule: `noUncheckedIndexedAccess` types
 * `env[name]` as `number | undefined`, and this is the narrowing that removes the `undefined`.
 * It can only fire if a caller stores an explicit `undefined` under a real key, which the
 * `Environment` type forbids; the throw keeps that case typed rather than leaking `undefined`.
 */
function readIdentifier(name: string, env: Environment): number {
  if (!hasParameter(env, name)) {
    throw unknownIdentifier(name);
  }
  const value = env[name];
  if (value === undefined) {
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

/** Rejects `Infinity`, `-Infinity` and `NaN` wherever a number is produced (AC-25). */
function requireFinite(value: number, source: string): number {
  if (Number.isFinite(value)) {
    return value;
  }
  throw new ExprError('NON_FINITE_VALUE', `${source} produced ${String(value)}, which is not finite`);
}

/**
 * `computeNumber` is the single place a number is produced, so `requireFinite` on its returns is
 * the whole non-finite guard for values (AC-25): a parameter read from the environment, a
 * negation, a function result, and — the route a guard placed only on literals and on the
 * environment would miss — an arithmetic result that becomes non-finite mid-evaluation, as in
 * `gcd(a * a, 2)` with `a = 1e200`. Literals are the exception and are guarded one step earlier,
 * in `tokenize`. Because a call's arguments are themselves produced here, no non-finite value can
 * reach a whitelisted function; that is what stops `gcd` spinning forever on `(NaN, NaN)`, a
 * fixed point of its Euclid loop.
 *
 * The `TYPE_MISMATCH` throws are defensive: `checkNode` has already proved every node's type, so
 * a boolean-valued node cannot arrive here. They exist so that a future change which bypasses the
 * static pass fails with a typed error rather than producing `NaN`.
 */
function computeNumber(node: Node, env: Environment): number {
  switch (node.kind) {
    // A literal is the one number this function does not have to check: `tokenize` rejects an
    // unrepresentable literal at the source, so `node.value` is finite by construction. Probed
    // rather than assumed — with the tokenise guard in place, 0 of 93 expressions placing an
    // oversized literal in every syntactic position delivered a non-finite value here; with that
    // guard removed, 87 of the same 93 did.
    case 'number':
      return node.value;

    case 'identifier':
      return requireFinite(readIdentifier(node.name, env), `parameter "${node.name}"`);

    case 'negate':
      return requireFinite(-computeNumber(node.operand, env), 'unary "-"');

    case 'call': {
      const values: number[] = [];
      for (const arg of node.args) {
        values.push(computeNumber(arg, env));
      }
      return requireFinite(applyWhitelistedCall(node.name, values), `function "${node.name}"`);
    }

    case 'binary':
      if (isArithmeticOperator(node.op)) {
        return requireFinite(
          applyArithmetic(node.op, computeNumber(node.left, env), computeNumber(node.right, env)),
          `operator "${node.op}"`,
        );
      }
      throw new ExprError('TYPE_MISMATCH', `operator "${node.op}" does not produce a number`);
  }
}

function applyWhitelistedCall(name: string, values: readonly number[]): number {
  // `checkNode` has already resolved this name and arity. Resolving again here is not a
  // duplicated rule — `resolveWhitelistedCall` remains the only place the whitelist is read —
  // it is how the evaluator recovers the spec, whose `arity` discriminant is what narrows
  // `apply` to its one- or two-argument shape below. The alternative, threading the resolved
  // spec from the checking pass into the evaluation pass, would make the tree stateful for no
  // gain: resolution is a pure map lookup.
  const spec = resolveWhitelistedCall(name, values.length);
  const first = values[0];
  if (spec.arity === 1) {
    if (first === undefined) {
      throw new ExprError(
        'ARITY_MISMATCH',
        `function "${name}" takes 1 argument but received ${values.length}`,
      );
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
