/**
 * A-047 — no hook may sit below an early return.
 *
 * This exists because `react-hooks/rules-of-hooks` does **not** catch it. That rule flags a hook
 * inside an `if`, a loop or a callback; a hook at the top level of a component that merely happens
 * to sit *after* an `if (…) return <Redirect/>` is invisible to it. eslint was clean on both routes
 * the day the crash shipped.
 *
 * The crash: `app/guided-duel.tsx` returned `<Redirect href="/chart"/>` when
 * `captain.hasFoughtGuidedDuel` was true, above three hooks. `settleGuidedDuel` sets that flag on
 * victory, the store subscription re-rendered the component, the redirect fired, three hooks
 * vanished, and React threw "Rendered fewer hooks than expected" — on the winning turn of the one
 * duel a five-year-old is guaranteed to play. `app/duel.tsx` had the same shape with eight hooks.
 *
 * So this is a static check, deliberately crude and deliberately broad: in any function whose name
 * starts with a capital (React's own component test), once a line matches `if (…) return`, no later
 * line in that function may call a hook. `useRef` is exempt for the same reason React is relaxed
 * about it in practice — it is order-stable and the repo uses it for imperative handles — but note
 * that exemption is about noise, not safety; a `useRef` below a return is still a violation React
 * counts. Nothing else is exempt.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const HOOK_CALL = /\b(use[A-Z]\w*)\s*\(/;
const COMPONENT_DECL = /^(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w*)/;
const EARLY_RETURN = /^\s{2,}(?:if\s*\(.*\)\s*)?return\s+(?:<|null|undefined)/;
/** `useRef` only — see the header. */
const EXEMPT = new Set(['useRef']);

/** Every `.tsx` under the given roots, repo-relative. No dependency; `fast-glob` is not installed. */
function tsxFiles(roots: readonly string[]): readonly string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.tsx')) out.push(relative(REPO_ROOT, full));
    }
  };
  for (const root of roots) walk(join(REPO_ROOT, root));
  return out.sort();
}

interface Violation {
  readonly file: string;
  readonly component: string;
  readonly hook: string;
  readonly hookLine: number;
  readonly returnLine: number;
}

function scan(relativePath: string): readonly Violation[] {
  return scanSource(readFileSync(join(REPO_ROOT, relativePath), 'utf8'), relativePath);
}

function scanSource(source: string, label: string): readonly Violation[] {
  const lines = source.split('\n');
  const found: Violation[] = [];
  let component: string | null = null;
  let firstReturn: number | null = null;

  lines.forEach((line, index) => {
    const declared = COMPONENT_DECL.exec(line);
    if (declared !== null) {
      component = declared[1]!;
      firstReturn = null;
      return;
    }
    if (component === null) return;

    // A conditional early return. The plain `return (` that ends a component is indented two
    // spaces and followed by JSX on the next line, so it is matched too — which is correct: a hook
    // below the final return is unreachable and equally wrong.
    if (firstReturn === null && EARLY_RETURN.test(line)) {
      firstReturn = index + 1;
      return;
    }

    const hook = HOOK_CALL.exec(line);
    if (firstReturn !== null && hook !== null && !EXEMPT.has(hook[1]!)) {
      found.push({
        file: label,
        component,
        hook: hook[1]!,
        hookLine: index + 1,
        returnLine: firstReturn,
      });
    }
  });

  return found;
}

describe('A-047 hook ordering', () => {
  it('spec(A-047:AC-1) no route or component calls a hook below an early return', () => {
    const files = tsxFiles(['app', 'src/components']);
    expect(files.length, 'walk matched nothing — the check would pass vacuously').toBeGreaterThan(10);

    const violations = files.flatMap(scan);
    const report = violations
      .map(
        (v) =>
          `${v.file}: ${v.component} calls ${v.hook}() at line ${v.hookLine}, ` +
          `below the return at line ${v.returnLine}`,
      )
      .join('\n');

    expect(violations, `hooks below an early return:\n${report}`).toEqual([]);
  });

  it('spec(A-047:AC-1) the scanner catches the exact shape that crashed, and clears the fix', () => {
    // A check this crude has to prove it is not vacuous — and it has to prove it against the REAL
    // scanner, not a copy of its logic. This is GuidedDuelBody's pre-fix shape.
    const broken = [
      'function GuidedDuelBody() {',
      '  const [view, setView] = useState(0);',
      '  if (captain.hasFoughtGuidedDuel) return <Redirect href="/chart" />;',
      '  const onAnswer = useCallback(() => setView(1), []);',
      '  return <View onPress={onAnswer} />;',
      '}',
    ].join('\n');

    const caught = scanSource(broken, 'pre-fix.tsx');
    expect(caught).toHaveLength(1);
    expect(caught[0]?.hook).toBe('useCallback');
    expect(caught[0]?.component).toBe('GuidedDuelBody');
    expect(caught[0]?.returnLine).toBe(3);
    expect(caught[0]?.hookLine).toBe(4);

    // And the shipped shape — hooks first, redirects last — must come back clean, or the check
    // would be unsatisfiable rather than merely strict.
    const fixed = [
      'function GuidedDuelBody() {',
      '  const [view, setView] = useState(0);',
      '  const onAnswer = useCallback(() => setView(1), []);',
      '  if (captain.hasFoughtGuidedDuel) return <Redirect href="/chart" />;',
      '  return <View onPress={onAnswer} />;',
      '}',
    ].join('\n');

    expect(scanSource(fixed, 'post-fix.tsx')).toEqual([]);
  });
});
