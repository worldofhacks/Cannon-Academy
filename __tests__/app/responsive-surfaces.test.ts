/**
 * A-043's component contract is deliberately inspected as source plus pure geometry.  Vitest
 * cannot parse React Native's Flow entry point here, so this is not (and must never claim to be)
 * a rendered-native screenshot test; the ticket's iPad/web screenshots remain release evidence.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import * as responsive from '../../src/theme/responsive';
import { MIN_TAP_TARGET } from '../../src/theme/tokens';

type Surface = 'reading' | 'world';
type ViewportClass = 'compact' | 'tablet' | 'desktop';

interface SurfaceLayout {
  readonly viewport: ViewportClass;
  readonly contentWidth: number;
  readonly gutter: number;
  readonly left: number;
  readonly right: number;
}

type ResolveSurface = (width: number, surface: Surface) => SurfaceLayout;

function resolveSurface(width: number, surface: Surface): SurfaceLayout {
  const candidate = (responsive as { resolveResponsiveSurface?: unknown }).resolveResponsiveSurface;
  expect(candidate, 'responsive.ts must export the shared pure surface resolver').toBeTypeOf('function');
  return (candidate as ResolveSurface)(width, surface);
}

const routeRoles = {
  'app/onboarding.tsx': 'reading',
  'app/name-flag.tsx': 'reading',
  'app/gun-deck.tsx': 'reading',
  'app/range.tsx': 'reading',
  'app/chart.tsx': 'world',
  'app/duel.tsx': 'world',
  'app/guided-duel.tsx': 'world',
} as const;

const routeSource = (path: keyof typeof routeRoles) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('responsive tablet and desktop surfaces', () => {
  it('spec(A-043:AC-1) classifies widths only, with 600 and 1024 in the larger class', () => {
    expect(resolveSurface(599, 'reading').viewport).toBe('compact');
    expect(resolveSurface(600, 'reading').viewport).toBe('tablet');
    expect(resolveSurface(1023, 'reading').viewport).toBe('tablet');
    expect(resolveSurface(1024, 'reading').viewport).toBe('desktop');

    // A second surface must not imply a second classifier.
    for (const width of [320, 599, 600, 1023, 1024, 3840]) {
      expect(resolveSurface(width, 'world').viewport).toBe(resolveSurface(width, 'reading').viewport);
    }
  });

  it('spec(A-043:AC-2) preserves every compact width and its existing compact gutter', () => {
    for (let width = 320; width < 600; width += 1) {
      for (const surface of ['reading', 'world'] as const) {
        const layout = resolveSurface(width, surface);
        const compact = responsive.computeLayout(width, 667);
        expect(layout.viewport).toBe('compact');
        expect(layout.gutter).toBe(compact.gutter);
        expect(layout.contentWidth).toBe(width - 2 * compact.gutter);
        expect(layout.left).toBe(compact.gutter);
        expect(layout.right).toBe(compact.gutter);
      }
    }
  });

  it('spec(A-043:AC-3) keeps reading surfaces finite, centered, capped at 760, and inside class gutters', () => {
    for (let width = 600; width <= 10_000; width += 7) {
      const layout = resolveSurface(width, 'reading');
      const requiredGutter = width < 1024 ? 24 : 32;
      expect(layout.viewport).toBe(width < 1024 ? 'tablet' : 'desktop');
      expect(Number.isFinite(layout.contentWidth)).toBe(true);
      expect(Number.isFinite(layout.left)).toBe(true);
      expect(Number.isFinite(layout.right)).toBe(true);
      expect(layout.contentWidth).toBeLessThanOrEqual(760);
      expect(layout.left).toBeGreaterThanOrEqual(requiredGutter);
      expect(layout.right).toBeGreaterThanOrEqual(requiredGutter);
      expect(layout.left).toBeCloseTo(layout.right, 10);
      expect(layout.left + layout.contentWidth + layout.right).toBeCloseTo(width, 10);
    }
  });

  it('spec(A-043:AC-4) keeps world surfaces finite, centered, capped at 1180, and inside class gutters', () => {
    for (let width = 600; width <= 10_000; width += 7) {
      const layout = resolveSurface(width, 'world');
      const requiredGutter = width < 1024 ? 24 : 32;
      expect(layout.viewport).toBe(width < 1024 ? 'tablet' : 'desktop');
      expect(Number.isFinite(layout.contentWidth)).toBe(true);
      expect(Number.isFinite(layout.left)).toBe(true);
      expect(Number.isFinite(layout.right)).toBe(true);
      expect(layout.contentWidth).toBeLessThanOrEqual(1180);
      expect(layout.left).toBeGreaterThanOrEqual(requiredGutter);
      expect(layout.right).toBeGreaterThanOrEqual(requiredGutter);
      expect(layout.left).toBeCloseTo(layout.right, 10);
      expect(layout.left + layout.contentWidth + layout.right).toBeCloseTo(width, 10);
    }
  });

  it('spec(A-043:AC-5) gives every scoped child route one ResponsiveFrame and its prescribed role', () => {
    for (const [path, surface] of Object.entries(routeRoles) as [keyof typeof routeRoles, Surface][]) {
      const source = routeSource(path);
      expect(source, path).toMatch(
        /import\s+\{\s*ResponsiveFrame\s*\}\s+from\s+['"][^'"]*ResponsiveFrame['"]/,
      );
      expect(source.match(/<ResponsiveFrame\b/g), path).toHaveLength(1);
      expect(source, path).toMatch(new RegExp(`<ResponsiveFrame[^>]*\\bsurface=["']${surface}["']`));
      expect(source, path).not.toMatch(/\b(?:Platform|Dimensions|useWindowDimensions)\b/);
      expect(source, path).not.toMatch(/\b(?:window|L\.width)\s*[<>]=?\s*\d+/);
    }
  });

  it('spec(A-043:AC-6) freezes measurable non-clipping invariants while leaving screenshots to release evidence', () => {
    expect(MIN_TAP_TARGET).toBeGreaterThanOrEqual(64);
    const frameSource = readFileSync(resolve(process.cwd(), 'src/components/ResponsiveFrame.tsx'), 'utf8');
    expect(frameSource).toMatch(/export\s+(?:function|const)\s+ResponsiveFrame/);
    expect(frameSource).toContain('surface');
    for (const [width, surface] of [
      [768, 'reading'],
      [768, 'world'],
      [1024, 'reading'],
      [1024, 'world'],
      [1440, 'reading'],
      [1440, 'world'],
    ] as const) {
      const layout = resolveSurface(width, surface);
      expect(layout.contentWidth).toBeLessThanOrEqual(width - 2 * layout.gutter);
      expect(layout.left).toBeGreaterThanOrEqual(layout.gutter);
      expect(layout.right).toBeGreaterThanOrEqual(layout.gutter);
    }
  });
});
