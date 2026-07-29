/**
 * A-042 source contracts.
 *
 * Node cannot import React Native screens (the RN entry point is Flow-typed), so this suite reads
 * the two screen sources rather than pretending a node test has performed a native layout. It
 * freezes the state-machine and Text props that native release evidence must then verify.
 */
import { describe, expect, it } from 'vitest';

const readSource = async (relative: string): Promise<string> => {
  const fs = await import('node:fs/promises');
  return fs.readFile(new URL(relative, import.meta.url), 'utf8');
};

const layoutSource = () => readSource('../../app/_layout.tsx');
const splashSource = () => readSource('../../src/components/Splash.tsx');
const pickerSource = () => readSource('../../app/onboarding.tsx');

function balancedBlock(source: string, start: number): string {
  const open = source.indexOf('{', start);
  expect(open, 'expected a block after the requested source position').toBeGreaterThanOrEqual(0);

  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(open, index + 1);
  }
  throw new Error('unterminated source block');
}

function numberAfter(source: string, property: 'fontSize' | 'lineHeight'): number {
  const match = source.match(new RegExp(`${property}:\\s*tx\\((\\d+(?:\\.\\d+)?)\\)`));
  expect(match, `expected ${property}: tx(number) in ${source}`).not.toBeNull();
  return Number(match?.[1]);
}

describe('A-042 launch gate and ship picker', () => {
  it('spec(A-042:AC-1) keeps board 4a’s three lamps non-interactive while either prerequisite is pending', async () => {
    const [layout, splash] = await Promise.all([layoutSource(), splashSource()]);

    // `ready` means both root prerequisites, rather than one of them. The acknowledgement is a
    // separate gate and is deliberately not part of readiness.
    expect(layout).toMatch(/<Splash\s+ready=\{fontsLoaded\s*&&\s*destination\s*!==\s*null\}/);
    expect(splash).toMatch(/function Splash\s*\(\s*\{\s*ready\s*,\s*onStart\s*}\s*:/);
    expect(splash).toMatch(/!ready[\s\S]{0,800}\[\s*0\s*,\s*180\s*,\s*360\s*\]/);
    expect(splash).toMatch(/!ready[\s\S]{0,1200}HOISTING THE SAILS/);

    // A loader with a hidden press target still fires through screen readers. Its entire branch
    // must contain no Pressable or callback wiring; this kills the lazy "loader plus button"
    // implementation.
    const loadingBranch = balancedBlock(splash, splash.indexOf('!ready'));
    expect(loadingBranch).not.toMatch(/Pressable|onPress|onStart/);
  });

  it('spec(A-042:AC-2) holds the ready board until exactly one accessible SET SAIL action', async () => {
    const [layout, splash] = await Promise.all([layoutSource(), splashSource()]);

    expect(layout).toMatch(/useState\s*\(\s*false\s*\).*launch/i);
    expect(layout).toMatch(/!launch\w*[\s\S]{0,240}<Splash/);

    const sailLabels = splash.match(/SET SAIL/g) ?? [];
    expect(sailLabels).toHaveLength(1);
    expect(splash).toMatch(/accessibilityRole="button"/);
    expect(splash).toMatch(/accessibilityLabel="SET SAIL"/);
    expect(splash).toMatch(/onPress=\{onStart\}/);
  });

  it('spec(A-042:AC-3) routes once, only from the acknowledged action, to the resolver’s saved destination', async () => {
    const layout = await layoutSource();
    const replaceCalls = layout.match(/router\.replace\s*\(/g) ?? [];

    expect(replaceCalls).toHaveLength(1);
    expect(layout).toMatch(
      /onStart=\{\(\)\s*=>\s*\{[\s\S]{0,300}setLaunch\w*\(true\)[\s\S]{0,300}router\.replace\(`\/\$\{destination\}`\)/,
    );

    // Redirecting from an effect once hydration settles bypasses the presenter’s gate.
    const effects = [...layout.matchAll(/useEffect\s*\(/g)].map((match) =>
      balancedBlock(layout, match.index ?? 0),
    );
    expect(effects.some((effect) => /router\.replace/.test(effect))).toBe(false);

    // The destination is already resolved after hydration; the launch action must not become a
    // second flow resolver by checking captain fields.
    for (const field of ['gradeBand', 'hasCompletedOnboarding', 'hasFoughtGuidedDuel', 'equippedCannons']) {
      expect(layout, `launch gate branches on captain.${field}`).not.toMatch(new RegExp(`\\.${field}\\b`));
    }
  });

  it('spec(A-042:AC-4) resets only the process-local acknowledgement while retaining captain persistence', async () => {
    const layout = await layoutSource();

    expect(layout).toMatch(/useState\s*\(\s*false\s*\).*launch/i);
    expect(layout).toMatch(/await\s+hydrate\(AsyncStorage\)/);
    expect(layout).toMatch(/persist\(AsyncStorage,\s*s\.captain\)/);

    // Storing a launch marker would make the title disappear after a native/JS relaunch. The
    // only persisted write in this root remains the captain subscription.
    expect(layout).not.toMatch(/AsyncStorage\.(?:getItem|setItem)\([^)]*launch/i);
    expect(layout).not.toMatch(/persist\([^)]*launch/i);
  });

  it('spec(A-042:AC-5) preserves the three board-1a strings and gives every visible picker text a bounded one-line fit', async () => {
    const picker = await pickerSource();
    const expected = [
      ['3 + 4', 'K–1'],
      ['14 − 6', 'GRADE 2–3'],
      ['12 × 7', 'GRADE 4–5'],
    ];

    for (const [problem, label] of expected) {
      expect(picker).toContain(`problem: '${problem}'`);
      expect(picker).toContain(`label: '${label}'`);
    }

    for (const field of ['b.problem', 'b.label']) {
      const textAt = picker.indexOf(`>{${field}}</Text>`);
      expect(textAt, `expected visible Text for ${field}`).toBeGreaterThanOrEqual(0);
      const text = picker.slice(Math.max(0, textAt - 360), textAt + 32);
      expect(text, `${field} must stay on one line`).toMatch(/numberOfLines=\{1\}/);
      expect(text, `${field} must opt into native fitting`).toMatch(/adjustsFontSizeToFit/);
      const scale = text.match(/minimumFontScale=\{(0?\.\d+)\}/);
      expect(scale, `${field} needs an explicit bounded shrink floor`).not.toBeNull();
      expect(Number(scale?.[1])).toBeGreaterThanOrEqual(0.8);
      expect(Number(scale?.[1])).toBeLessThan(1);
    }

    const problemAt = picker.indexOf('>{b.problem}</Text>');
    const problemText = picker.slice(Math.max(0, problemAt - 360), problemAt + 32);
    expect(numberAfter(problemText, 'lineHeight')).toBeGreaterThan(numberAfter(problemText, 'fontSize'));
  });
});
