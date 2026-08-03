import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

const SCOPED_DOCS = [
  'ARCHITECTURE.md',
  'COORDINATION.md',
  'PLAN.md',
  'README.md',
  'RELEASE.md',
  'TICKETS.md',
  'assets/README.md',
  'assets/source/README.md',
  'design/boards/README.md',
  'tickets/app/APP-TICKETS.md',
  'tickets/app/HANDOFF.md',
  'tickets/app/OWNER-RULINGS.md',
  'tickets/app/STATE.md',
] as const;

describe('A-044 reviewer-ready documentation baseline', () => {
  it('spec(A-044:AC-1) README is the reviewer landing with required links', () => {
    const readme = read('README.md');
    for (const needle of [
      'https://cannon-academy.expo.app',
      'tickets/INDEX.md',
      'ARCHITECTURE.md',
      'RELEASE.md',
      'https://github.com/worldofhacks/Cannon-Academy',
      'https://labs.gauntletai.com/alexander.miller/Cannon-Academy',
      'npx expo start',
      'Current limitations',
    ]) {
      expect(readme, `README missing ${needle}`).toContain(needle);
    }
    expect(readme).not.toMatch(/Day 1 is Tuesday/i);
    expect(readme).not.toMatch(/Wave 4 at the freeze gate/i);
    expect(readme).not.toMatch(/T-029.*open|open owner-blocked/i);
  });

  it('spec(A-044:AC-2) status-bearing docs point at INDEX and keep historical markers', () => {
    for (const path of [
      'PLAN.md',
      'ARCHITECTURE.md',
      'COORDINATION.md',
      'TICKETS.md',
      'tickets/app/APP-TICKETS.md',
      'tickets/app/STATE.md',
    ]) {
      const text = read(path);
      expect(text, `${path} needs INDEX link`).toMatch(/tickets\/INDEX\.md|INDEX\.md/);
      expect(text, `${path} needs historical/retired banner`).toMatch(
        /Historical|Retired status|historical\/retired|snapshots/i,
      );
    }
    const rulings = read('tickets/app/OWNER-RULINGS.md');
    expect(rulings).toMatch(/T-036/);
    expect(rulings).toMatch(/D-9/);
    expect(rulings).toMatch(/D-6/);
    expect(rulings).toMatch(/A-032/);
    expect(rulings).toMatch(/A-034/);
  });

  it('spec(A-044:AC-3) HANDOFF is a fresh dated ops snapshot without expired noon ops', () => {
    const handoff = read('tickets/app/HANDOFF.md');
    expect(handoff).toMatch(/Verification date:\s*2026-07-29/);
    expect(handoff).toContain('app/shell');
    expect(handoff).toContain('28f4ccc');
    expect(handoff).toContain('https://cannon-academy.expo.app');
    expect(handoff).toContain('https://github.com/worldofhacks/Cannon-Academy');
    expect(handoff).toContain('https://labs.gauntletai.com/alexander.miller/Cannon-Academy');
    expect(handoff).toMatch(/INDEX\.md/);
    expect(handoff).toMatch(/Known limitations/i);
    expect(handoff).toMatch(/npx vitest run|vitest run/);
    // Current section must not sell the expired noon deadline as live.
    const current = handoff.split('## Historical snapshot')[0] ?? handoff;
    expect(current).not.toMatch(/Submission target:\s*today,\s*~12:00/i);
    expect(current).not.toMatch(/2,014 passing across 40 files/);
  });

  it('spec(A-044:AC-4) hosting/backend four-state language is consistent', () => {
    for (const path of ['README.md', 'RELEASE.md', 'tickets/app/HANDOFF.md', 'ARCHITECTURE.md']) {
      const text = read(path);
      expect(text, `${path} must name EAS production alias`).toContain('https://cannon-academy.expo.app');
    }
    const readme = read('README.md');
    const release = read('RELEASE.md');
    for (const text of [readme, release]) {
      expect(text).toContain('https://cannon-academy--wejre1bucz.expo.app');
      expect(text).toContain('https://cannon-academy--2f4tf1erk3.expo.app');
      expect(text).toMatch(/EAS Hosting/i);
      expect(text).not.toMatch(/Firebase Hosting is the canonical/i);
    }
    expect(readme).toMatch(/Client exports/i);
    expect(readme).toMatch(/nam5/);
    expect(readme).toMatch(/us-central1/);
    expect(readme).toMatch(/not wired|NOT wired/i);
    expect(readme).toMatch(/AsyncStorage/);
    expect(readme).toContain('EXPO_PUBLIC_FIREBASE_');

    const firebaseJson = JSON.parse(read('firebase.json')) as Record<string, unknown>;
    expect(firebaseJson.hosting, 'firebase.json must not configure web hosting').toBeUndefined();
    expect(existsSync(join(ROOT, 'src/services/firebase.ts'))).toBe(true);
    const layout = read('app/_layout.tsx');
    expect(layout).not.toMatch(/createAuthService|signInAnonymously/);
  });

  it('spec(A-044:AC-5) limitations and target-design are not described as shipped', () => {
    const readme = read('README.md');
    for (const area of ['Guided', 'Harbor', 'Ranks', 'Firebase', 'Mercy', 'Tablet', 'Training']) {
      expect(readme, `limitations should mention ${area}`).toMatch(new RegExp(area, 'i'));
    }
    expect(readme).toMatch(/A-036/);
    const architecture = read('ARCHITECTURE.md');
    expect(architecture).toMatch(/Not current architecture|target design/i);
    expect(architecture).toMatch(/\/harbor|harbor/i);
    const routes = readdirSync(join(ROOT, 'app')).filter((name) => name.endsWith('.tsx'));
    // Amended 2026-08-03 (integrator): at A-044 time Harbor was target-design, so its route's
    // ABSENCE was the honesty check. Harbor then shipped as review-passed work (A-033 wave G4,
    // A-055 wave G7) and the frozen demo-navigation route inventory now REQUIRES harbor.tsx —
    // two frozen contracts contradicted each other, and shipped reality picks the winner. The
    // probe is amended (the D-8/HANDOFF §3 precedent: amended, not deleted): Harbor must exist,
    // and `ranks.tsx` — which never shipped (the screen is rank.tsx) — stays banned.
    expect(routes).toContain('harbor.tsx');
    expect(routes).not.toContain('ranks.tsx');
    expect(read('package.json')).not.toMatch(/lottie/i);
  });

  it('spec(A-044:AC-6) asset/board docs avoid unsupported console and blanket CC0 claims', () => {
    const handoffCurrent = (read('tickets/app/HANDOFF.md').split('## Historical snapshot')[0] ??
      '') as string;
    const currentFacing = [read('README.md'), read('RELEASE.md'), handoffCurrent].join('\n');
    expect(currentFacing).not.toMatch(/zero console errors|clean console/i);
    expect(currentFacing).not.toMatch(/all art is CC0|every shipped asset is CC0/i);

    const assets = read('assets/README.md');
    expect(assets).toMatch(/unknown|Provenance/i);
    expect(assets).toMatch(/sprites/);
    expect(assets).not.toMatch(/All art is CC0/);

    const source = read('assets/source/README.md');
    expect(source).toMatch(/does \*\*not\*\* ship|do \*\*not\*\* ship|nothing here ships/i);

    const boards = read('design/boards/README.md');
    expect(boards).toMatch(/absent/i);
    expect(existsSync(join(ROOT, 'design/boards/Cannon Academy Design Boards.dc.html'))).toBe(false);
  });

  it('spec(A-044:AC-7) mirror URLs and non-full-mirror caveats are present', () => {
    const readme = read('README.md');
    expect(readme).toContain('https://github.com/worldofhacks/Cannon-Academy');
    expect(readme).toContain('https://labs.gauntletai.com/alexander.miller/Cannon-Academy');
    expect(readme).toMatch(/not a full mirror|intentionally differ|intentionally different/i);
    expect(readme).toMatch(/PR #2|pull\/2/);
    expect(readme).toContain('28f4ccc');
    expect(readme).not.toMatch(/GitHub mirror skipped|no remote repo/i);
  });

  it('spec(A-044:AC-8) A-036 remains the post-feature reconciliation owner', () => {
    const readme = read('README.md');
    const handoff = read('tickets/app/HANDOFF.md');
    expect(readme).toMatch(/A-036/);
    expect(handoff).toMatch(/A-036/);
    expect(read('tickets/app/A-036.md')).toMatch(/^status:\s*backlog/m);
  });

  it('historical preservation: distinctive planning sentinels remain readable', () => {
    expect(read('PLAN.md')).toMatch(/Math on the High Seas|definition of done/i);
    expect(read('TICKETS.md')).toMatch(/Wave/i);
    expect(read('tickets/app/APP-TICKETS.md')).toMatch(/wave|A-\d{3}/i);
    expect(read('tickets/app/HANDOFF.md')).toMatch(/Historical snapshot/i);
    expect(read('tickets/app/HANDOFF.md')).toMatch(/sea chart|Damp powder|Submission target/i);
  });

  it('every A-044 scoped document exists', () => {
    for (const path of SCOPED_DOCS) {
      expect(existsSync(join(ROOT, path)), path).toBe(true);
    }
  });
});
