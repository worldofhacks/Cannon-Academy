/**
 * A-067 (was A-064) — the rival fleet's eyeball grid.
 *
 * Renders every committed roster row in `src/content/generatedFleet.json` as plain `<svg>` into
 * one static HTML page at `design/generated-fleet/preview.html`, so the fleet is reviewable in a
 * browser with no Expo running. The page is COMMITTED, and this script is deterministic — same
 * roster in, same bytes out (no timestamps, no environment) — which is what lets
 * `__tests__/app/generated-fleet.test.ts` assert the committed page byte-for-byte.
 *
 * Run with plain node (Node 25 strips types natively):
 *
 *   node scripts/fleet-preview.ts [optional output path]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generatedFleet, generatedShipSvg } from '../src/content/generatedFleet.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = join(REPO_ROOT, 'design/generated-fleet/preview.html');

/** The board's own ground colours, so the grid reviews ships on the sea they will sail. */
const PAGE_BG = '#0B1E2D';
const CARD_BG = '#0E2233';
const INK = '#E5EFF7';
const INK_SOFT = '#8AA0B4';

function card(svg: string, id: string, displayName: string, kind: string): string {
  return [
    '    <figure>',
    `      ${svg}`,
    `      <figcaption><strong>${displayName}</strong><br /><code>${id}</code> · ${kind}</figcaption>`,
    '    </figure>',
  ].join('\n');
}

const cards = generatedFleet
  .map((doc) => card(generatedShipSvg(doc), doc.id, doc.displayName, doc.kind))
  .join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>The rival fleet — ${generatedFleet.length} ships (A-067)</title>
  <style>
    body { margin: 0; padding: 20px; background: ${PAGE_BG}; font-family: -apple-system, 'Segoe UI', sans-serif; }
    h1 { color: ${INK}; font-size: 18px; }
    p { color: ${INK_SOFT}; font-size: 13px; max-width: 72ch; }
    main { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; }
    figure { margin: 0; padding: 14px; background: ${CARD_BG}; border-radius: 12px; }
    figure svg { width: 100%; height: auto; display: block; }
    figcaption { margin-top: 8px; color: ${INK}; font-size: 12px; line-height: 1.5; }
    figcaption code { color: ${INK_SOFT}; font-size: 11px; }
  </style>
</head>
<body>
  <h1>The rival fleet — ${generatedFleet.length} ships from six parts</h1>
  <p>
    Every hull below is a D-12 recombination: the rival-fleet board's own twenty parameter rows
    (strakes, gunports, sails, castle, emblem) over the duel board's geometry, painted only with
    the named per-kind tokens. Regenerate this page with
    <code>node scripts/fleet-preview.ts</code>; it must reproduce byte-for-byte from the committed
    roster in <code>src/content/generatedFleet.json</code>.
  </p>
  <main>
${cards}
  </main>
</body>
</html>
`;

const out = process.argv[2] ?? DEFAULT_OUT;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`fleet-preview: wrote ${generatedFleet.length} ships to ${out}`);
