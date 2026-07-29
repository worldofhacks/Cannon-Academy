/**
 * T-035 — `TRAY_CAPACITY` in `@engine/tuning`.
 *
 * Unblocks A-011 (gun deck). Selection rules remain T-030.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { TRAY_CAPACITY } from '@engine/tuning';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const TUNING_SRC = join(REPO_ROOT, 'src/engine/tuning.ts');
const OWN_SOURCE = readFileSync(fileURLToPath(import.meta.url), 'utf8');
const TICKET_SOURCE = readFileSync(join(REPO_ROOT, 'tickets/T-035.md'), 'utf8');

describe('T-035 — TRAY_CAPACITY', () => {
  it('spec(T-035:AC-1) exports TRAY_CAPACITY as the integer 3', () => {
    expect(TRAY_CAPACITY).toBe(3);
    expect(Number.isInteger(TRAY_CAPACITY)).toBe(true);
  });

  it('spec(T-035:AC-2) tuning.ts cites a tray / PLAN provenance next to the export', () => {
    const src = readFileSync(TUNING_SRC, 'utf8');
    expect(src).toMatch(/export const TRAY_CAPACITY\s*=\s*3\b/);
    // Comment near the export must mention tray or PLAN (source citation).
    const idx = src.indexOf('export const TRAY_CAPACITY');
    expect(idx).toBeGreaterThanOrEqual(0);
    const window = src.slice(Math.max(0, idx - 400), idx);
    expect(window.toLowerCase()).toMatch(/tray|plan\.md|armory|loadout/);
  });

  it('spec(T-035:AC-3) tray is a positive proper subset of the ten-cannon armory', () => {
    expect(TRAY_CAPACITY).toBeGreaterThan(0);
    expect(TRAY_CAPACITY).toBeLessThan(10);
  });
});

describe('T-035 Definition of Done', () => {
  it('dod(T-035:1) tags a test against every acceptance criterion the ticket declares', () => {
    const declared = [...TICKET_SOURCE.matchAll(/\*\*(AC-\d+)\*\*/g)].map((m) => m[1]);
    const unique = [...new Set(declared)];
    const untagged = unique.filter((ac) => !OWN_SOURCE.includes(`spec(T-035:${ac})`));
    expect(unique.length).toBe(3);
    expect(untagged).toEqual([]);
  });

  it('dod(T-035:2) keeps local gates wired and this suite free of skip/only markers', () => {
    const gates = readFileSync(join(REPO_ROOT, '.tdd-swarm/run-local-gates.sh'), 'utf8');
    for (const command of ['prettier --check', 'eslint . --max-warnings 0', 'tsc --noEmit', 'vitest run']) {
      expect(gates).toContain(command);
    }
    expect(OWN_SOURCE).not.toMatch(/\b(?:it|test|describe)\.(?:only|skip)\b/);
  });

  it('dod(T-035:3) numbers every dod tag so spec-lint covers all DoD items', () => {
    const dodCount = (TICKET_SOURCE.match(/^- \[[ x]\] /gm) ?? []).length;
    const tagged = [...OWN_SOURCE.matchAll(/dod\(T-035:([^)]*)\)/g)].map((m) => m[1] ?? '');
    const unparseable = tagged.filter((id) => !/^\d+$/.test(id));
    const covered = new Set(tagged.filter((id) => /^\d+$/.test(id)).map(Number));
    const missing = Array.from({ length: dodCount }, (_, i) => i + 1).filter((n) => !covered.has(n));
    expect(dodCount).toBe(5);
    expect(unparseable).toEqual([]);
    expect(missing).toEqual([]);
  });

  it('dod(T-035:4) production scope is src/engine/tuning.ts', () => {
    expect(readFileSync(TUNING_SRC, 'utf8')).toContain('export const TRAY_CAPACITY');
  });

  it('dod(T-035:5) TRAY_CAPACITY is not redefined outside tuning.ts under src/engine', () => {
    const engineRoot = join(REPO_ROOT, 'src/engine');
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, name.name);
        if (name.isDirectory()) walk(path);
        else if (name.name.endsWith('.ts') && path !== TUNING_SRC) {
          const text = readFileSync(path, 'utf8');
          if (/export\s+const\s+TRAY_CAPACITY\b/.test(text)) hits.push(path);
        }
      }
    };
    walk(engineRoot);
    expect(hits).toEqual([]);
  });
});
