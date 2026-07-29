import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '../..');
const TEXT_PRESENTATION = '\uFE0E';

const NAVAL_GLYPHS = {
  anchor: '\u2693',
  next: '\u25B6',
  previous: '\u25C0',
} as const;

interface ExpectedLiteral {
  readonly label: string;
  readonly relativePath: string;
  readonly glyph: string;
}

/**
 * Commit 8ee28eb fixed four render call sites. The turn-pip site is conditional, so it has both
 * a next and a previous literal; keeping both branches here prevents one direction from silently
 * falling back to a platform-colour emoji while the other branch stays correct.
 */
const SHIPPED_RENDER_LITERALS: readonly ExpectedLiteral[] = [
  {
    label: 'duel HUD anchor',
    relativePath: 'src/components/duel/Hud.tsx',
    glyph: NAVAL_GLYPHS.anchor,
  },
  {
    label: 'duel HUD active-turn triangle',
    relativePath: 'src/components/duel/Hud.tsx',
    glyph: NAVAL_GLYPHS.next,
  },
  {
    label: 'duel HUD rival-turn triangle',
    relativePath: 'src/components/duel/Hud.tsx',
    glyph: NAVAL_GLYPHS.previous,
  },
  {
    label: 'rival watch-panel triangle',
    relativePath: 'src/components/duel/Panels.tsx',
    glyph: NAVAL_GLYPHS.previous,
  },
  {
    label: 'rival-impact triangle',
    relativePath: 'app/duel.tsx',
    glyph: NAVAL_GLYPHS.previous,
  },
];

interface SourceLiteral {
  readonly text: string;
  readonly line: number;
}

function sourceLiterals(relativePath: string): readonly SourceLiteral[] {
  const path = join(REPO_ROOT, relativePath);
  const source = readFileSync(path, 'utf8');
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const literals: SourceLiteral[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node) || ts.isJsxText(node)) {
      literals.push({
        text: node.text,
        line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
      });
    }
    ts.forEachChild(node, visit);
  };

  visit(file);
  return literals;
}

function sourceFiles(root: string): readonly string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(path) ? [path] : [];
  });
}

describe('native text presentation', () => {
  it.each(SHIPPED_RENDER_LITERALS)(
    'spec(A-021:AC-1) keeps the $label text-presented',
    ({ relativePath, glyph }) => {
      const expected = `${glyph}${TEXT_PRESENTATION}`;
      const matches = sourceLiterals(relativePath).filter((literal) => literal.text.includes(expected));

      expect(matches, `${relativePath} has no source literal containing ${codePoints(expected)}`).not.toEqual(
        [],
      );
    },
  );

  it('spec(A-021:AC-1) leaves no bare audited glyph in app-layer source literals', () => {
    const roots = [join(REPO_ROOT, 'app'), join(REPO_ROOT, 'src/components')];
    const failures: string[] = [];

    for (const path of roots.flatMap(sourceFiles)) {
      const relativePath = path.slice(REPO_ROOT.length + 1);
      for (const literal of sourceLiterals(relativePath)) {
        for (const glyph of Object.values(NAVAL_GLYPHS)) {
          for (
            let index = literal.text.indexOf(glyph);
            index >= 0;
            index = literal.text.indexOf(glyph, index + 1)
          ) {
            if (literal.text[index + glyph.length] !== TEXT_PRESENTATION) {
              failures.push(`${relativePath}:${literal.line} has bare ${codePoints(glyph)}`);
            }
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });
});

function codePoints(value: string): string {
  return Array.from(value, (character) => `U+${character.codePointAt(0)?.toString(16).toUpperCase()}`).join(
    ' ',
  );
}
