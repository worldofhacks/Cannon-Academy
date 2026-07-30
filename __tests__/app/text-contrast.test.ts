/**
 * A-054 — text colours are certified against the ground they sit on.
 *
 * The bug class, in the designer's words: *"the contrast table certifies FILLS, not text roles — so
 * three colours got used as text on grounds nobody ever measured them against."* Each was picked by
 * proximity to a hue rather than by certification, which is why fixing instances kept surfacing new
 * instances.
 *
 * Four real failures were shipping when this was written, all at 10–11px where "large only" does not
 * apply:
 *
 *   Panels.rewardTag           goldDeep on surface-sunk   2.99  hard fail
 *   rank.tsx subtitle          inkFaint on dark surface   3.49
 *   QuestionPanel.fastIsPerfect goldDeep on parchment      3.56
 *   TemperBadge 'standard'     white on sea               4.18
 *
 * This file measures rather than greps, so a future colour swap is checked on arithmetic instead of
 * on whether someone remembered the rule.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { temperLook } from '../../src/theme/cannonPresentation';
import { color } from '../../src/theme/tokens';

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const linear = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** AA for body text. Every text pair in this app is small — 10–11px chips upward. */
const AA_SMALL = 4.5;

function src(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relative}`, import.meta.url)), 'utf8');
}

describe('A-054 text contrast', () => {
  it('spec(A-054:AC-1) every text/ground pair the app actually renders clears AA', () => {
    // Enumerated by hand from the call sites, because a colour is only wrong in the context it is
    // used — the same hex is fine as a fill and illegal as text.
    const pairs: readonly { readonly where: string; readonly fg: string; readonly bg: string }[] = [
      { where: 'QuestionPanel.fastIsPerfect on parchment', fg: color.goldDeepest, bg: color.parchment },
      { where: 'Panels.rewardTag on sunken parchment', fg: color.goldDeepest, bg: '#F0E2C8' },
      { where: 'Panels.perfectSub on parchment', fg: color.goldDeepest, bg: color.parchment },
      { where: 'rank.tsx subtitle on dark surface', fg: color.inkSoft, bg: color.surface },
      {
        where: 'TemperBadge glyph on the standard badge',
        fg: temperLook.standard.ink,
        bg: temperLook.standard.color,
      },
      {
        where: 'TemperBadge glyph on the reliable badge',
        fg: temperLook.reliable.ink,
        bg: temperLook.reliable.color,
      },
      {
        where: 'TemperBadge glyph on the volatile badge',
        fg: temperLook.volatile.ink,
        bg: temperLook.volatile.color,
      },
      { where: 'ink on parchment', fg: color.inkDark, bg: color.parchment },
      { where: 'white on sea-deep', fg: color.white, bg: color.seaDeep },
    ];

    for (const { where, fg, bg } of pairs) {
      const ratio = contrast(fg, bg);
      expect(
        ratio,
        `${where}: ${fg} on ${bg} measures ${ratio.toFixed(2)}, below AA ${AA_SMALL}`,
      ).toBeGreaterThanOrEqual(AA_SMALL);
    }
  });

  it('spec(A-054:AC-2) the banned pairs are still banned — the arithmetic that motivated the fix', () => {
    // If any of these ever clears AA, a token was retuned and the rules below need rewriting rather
    // than trusting. Documented as measurements, not as folklore.
    expect(contrast(color.white, color.sea)).toBeLessThan(AA_SMALL); // 4.18
    expect(contrast(color.inkDark, color.sea)).toBeLessThan(AA_SMALL); // 3.59
    expect(contrast(color.goldDeep, color.parchment)).toBeLessThan(AA_SMALL); // 3.56
    expect(contrast(color.white, color.success)).toBeLessThan(AA_SMALL); // 2.63, the board's own ban
    expect(contrast(color.white, color.amber)).toBeLessThan(AA_SMALL); // 2.03, the board's own ban
  });

  it('spec(A-054:AC-3) the retired text colours are not used as text anywhere', () => {
    // `goldDeep` and `inkFaint` remain valid as FILLS — goldDeep is a plank shadow under gold, which
    // is what it was always for. What must not recur is either appearing after `color:`.
    for (const file of [
      'src/components/duel/QuestionPanel.tsx',
      'src/components/duel/Panels.tsx',
      'app/rank.tsx',
      'src/components/duel/CannonTray.tsx',
      'src/components/duel/Hud.tsx',
    ]) {
      const text = src(file);
      expect(text, `${file} uses goldDeep as a text colour (3.56 on parchment)`).not.toMatch(
        /color:\s*color\.goldDeep\b/,
      );
      expect(text, `${file} uses inkFaint as a text colour (3.49 on dark)`).not.toMatch(
        /color:\s*color\.inkFaint\b/,
      );
    }
  });

  it('spec(A-054:AC-4) the standard temperament badge uses the readable blue', () => {
    // It carries a white glyph, so it cannot be the 4.18 `sea`. This is the one badge of the three
    // that was failing, and it is the one a child sees most — `standard` is the common temperament.
    expect(temperLook.standard.color).toBe(color.seaDeep);
    expect(contrast(temperLook.standard.ink, temperLook.standard.color)).toBeGreaterThanOrEqual(AA_SMALL);
  });
});
