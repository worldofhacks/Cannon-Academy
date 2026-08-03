/**
 * A-086 — Lumen the lanternfish: pose fidelity, the two D-13 overrides, the tally riddle's
 * growth-without-breach, and receipt-idempotent reward integrity.
 *
 * RN components have no node render harness (posture.md), so the contract splits at the usual
 * seams: the PURE surface (`services/uncharted/encounter.ts` — the board tables, the riddle
 * function, the completion) is exercised directly against real stores and real generated
 * documents, and the render half (`LumenFigure.tsx`, `UnchartedEncounter.tsx`) is pinned by
 * source scans. The board tables are re-transcribed INDEPENDENTLY here and deep-equaled, the
 * A-082 discipline, so a drive-by edit to either copy reddens.
 *
 *   - AC-1: the five poses' mouth/arm/star/anim tables pin to the board exactly; the lamp
 *     never crosses the face; no tooth shape exists.
 *   - AC-2: D-13 holds — no bypass affordance in any uncharted component, and 100+ swept tally
 *     riddles all close on the whole restated question inside the FITTED bubble bounds.
 *   - AC-3: the riddle grows with clearedCount but never breaches the band ceiling; four
 *     distinct tiles, the answer among them exactly once.
 *   - AC-4: a correct answer pays coins exactly once per island (receipt-idempotent,
 *     double-tap safe); a wrong answer pays nothing, loses nothing, and the flow still reaches
 *     ready. The authored encounter world never learns Lumen.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { GenIslandDoc } from '../../src/content/genIsland';
import { RIDDLE_POOLS } from '../../src/content/riddles';
import { GRADE_BANDS, ISLAND_IDS, type GradeBand } from '../../src/content/schemas';
import { duelReceiptKey, isChestReceipt, isRewardReceiptKey } from '../../src/contracts/rewards';
import { HOSTS } from '../../src/components/encounter/encounterBoard';
import { resolveUnchartedPhase } from '../../src/components/uncharted/unchartedBoard';
import { commitGradeBand } from '../../src/services/onboarding';
import {
  completeLumenRiddle,
  greetLumen,
  LUMEN,
  LUMEN_ANIM,
  LUMEN_BUBBLE,
  LUMEN_COINS,
  LUMEN_COPY,
  LUMEN_FIGURE,
  LUMEN_MOUTH,
  LUMEN_MOUTH_THUMB,
  LUMEN_POSES,
  LUMEN_RESOLVE_MS,
  LUMEN_VIGNETTE,
  lumenCheerLine,
  lumenCloseLine,
  lumenEncounterId,
  lumenReceiptKey,
  lumenRewardTitle,
  lumenStageFor,
  lumenTileLooks,
  LUMEN_TILE_CORRECT,
  LUMEN_TILE_IDLE,
  LUMEN_TILE_MISS,
  TALLY_CEILING,
  tallyRiddleFor,
} from '../../src/services/uncharted/encounter';
import { unchartedDuelId } from '../../src/services/uncharted/duel';
import { generateIsland } from '../../src/services/uncharted/generator';
import { createCaptainStore, type CaptainStore } from '../../src/stores/player';

const REPO_ROOT = join(import.meta.dirname, '../..');
const read = (relativePath: string): string => readFileSync(join(REPO_ROOT, relativePath), 'utf8');

const FIGURE = 'src/components/uncharted/LumenFigure.tsx';
const CARD = 'src/components/uncharted/UnchartedEncounter.tsx';
const SERVICE = 'src/services/uncharted/encounter.ts';
const SCREEN = 'app/uncharted.tsx';

/** Every uncharted component on disk — the AC-2 sweep must not enumerate-and-miss. */
const UNCHARTED_COMPONENTS = readdirSync(join(REPO_ROOT, 'src/components/uncharted'))
  .filter((name) => name.endsWith('.tsx') || name.endsWith('.ts'))
  .map((name) => `src/components/uncharted/${name}`);

// ── Harness — real store, real generated documents, nothing hand-written ───────────────────────

function frontierStore(band: GradeBand, seed = 4177): { store: CaptainStore; doc: GenIslandDoc } {
  const store = createCaptainStore();
  commitGradeBand(store, band);
  store.getState().beginUncharted();
  store
    .getState()
    .setUnchartedIslands(generateIsland(seed, 6, band), generateIsland(seed, 7, band));
  const doc = store.getState().captain.uncharted?.current as GenIslandDoc;
  expect(doc).toBeDefined();
  return { store, doc };
}

// ── AC-1: pose fidelity ─────────────────────────────────────────────────────────────────────────

describe('A-086 — the five poses pin to the board tables exactly (AC-1)', () => {
  it('spec(A-086:AC-1) the MOUTH table, both scales, deep-equals an independent board transcription', () => {
    // Re-transcribed from the board data script's MOUTH table (`mouthL/B/W/H/R`), px stripped.
    expect(LUMEN_MOUTH).toEqual({
      smile: { left: 52, bottom: 15, w: 14, h: 7, radius: '0 0 999px 999px' },
      open: { left: 54, bottom: 13, w: 12, h: 12, radius: '999px' },
      wide: { left: 50, bottom: 13, w: 18, h: 11, radius: '0 0 999px 999px' },
      flat: { left: 54, bottom: 17, w: 13, h: 4, radius: '999px' },
    });
    // The same table's thumbnail keys (`mL/mB/mW/mH/mR`).
    expect(LUMEN_MOUTH_THUMB).toEqual({
      smile: { left: 28, bottom: 9, w: 10, h: 5, radius: '0 0 999px 999px' },
      open: { left: 29, bottom: 8, w: 8, h: 8, radius: '999px' },
      wide: { left: 26, bottom: 8, w: 13, h: 8, radius: '0 0 999px 999px' },
      flat: { left: 29, bottom: 11, w: 9, h: 3, radius: '999px' },
    });
  });

  it('spec(A-086:AC-1) the POSES table — anim/mouth/stars/spec per pose, board-verbatim', () => {
    expect(LUMEN_POSES).toEqual({
      greeting: { anim: 'bob', mouth: 'smile', stars: false, spec: 'uh-bob 3.4s · mouth smile' },
      asking: { anim: 'bob', mouth: 'open', stars: false, spec: 'uh-bob 3.4s · mouth open' },
      celebrating: { anim: 'hop', mouth: 'wide', stars: true, spec: 'uh-hop 620ms · mouth wide · 2 stars' },
      shrugging: { anim: 'shrug', mouth: 'flat', stars: false, spec: 'uh-shrug 520ms · mouth flat' },
      farewell: { anim: 'bob', mouth: 'smile', stars: false, spec: 'uh-bob 3.4s · mouth smile' },
    });
    // Stars belong to celebrating alone — the board's one two-star pose.
    const starry = Object.entries(LUMEN_POSES).filter(([, p]) => p.stars);
    expect(starry.map(([id]) => id)).toEqual(['celebrating']);
  });

  it('spec(A-086:AC-1) the keyframe table — every duration and value off the board CSS', () => {
    expect(LUMEN_ANIM).toEqual({
      bob: { ms: 3400, riseY: 5 },
      hop: { ms: 620, riseY: 15, tiltFromDeg: -7, tiltToDeg: 5, midRiseY: 4 },
      shrug: { ms: 520, tiltFromDeg: -5, tiltToDeg: 4, riseY: 3 },
      lamp: { ms: 2600, opacityFrom: 0.55, scaleTo: 1.1 },
      sway: { ms: 4200, deg: 6, rodBaseDeg: 32 },
      finTop: { ms: 3600, fromDeg: -7, toDeg: 8 },
      finBottom: { ms: 4000, fromDeg: 6, toDeg: -9 },
      mote: { riseY: 8, opacityFrom: 0.35, opacityTo: 0.8 },
      pop: { ms: 220, fromScale: 0.72, overshootScale: 1.04 },
    });
    expect(LUMEN.bobMs).toBe(3400);
    expect(LUMEN.shapeBudget).toBe(9);
  });

  it('spec(A-086:AC-1) the lamp law: out to the side on a held rod, never over the face', () => {
    const F = LUMEN_FIGURE;
    // The lamp disc ends before the body begins, and the face (eyes) begins further right still.
    expect(F.lamp.left + F.lamp.size).toBeLessThanOrEqual(F.body.left);
    expect(F.body.left).toBeLessThan(F.eyes.lefts[0]);
    // She is visibly HOLDING it: the rod spans from inside the figure toward the lamp's side.
    expect(F.rod.left).toBeLessThan(F.body.left);
    expect(F.rodTip.left).toBeLessThanOrEqual(F.lamp.left);
    // Encounter-scale box and berth, board-verbatim.
    expect(F.box).toEqual({ w: 110, h: 96 });
    expect(LUMEN_VIGNETTE.figure).toEqual({ left: 146, bottom: 34 });
    expect(LUMEN_VIGNETTE.height).toBe(168);
  });

  it('spec(A-086:AC-1) no tooth shape exists — the mouth is ONE solid ink shape with no interior', () => {
    const source = read(FIGURE);
    expect(source).not.toMatch(/tooth|teeth|fang/i);
    // The mouth block: exactly one View, self-closing, ink-filled, driven by the MOUTH table.
    const start = source.indexOf('7/9 — the mouth');
    const end = source.indexOf('The two gold stars');
    expect(start, 'LumenFigure.tsx lost its mouth block').toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const mouthBlock = source.slice(start, end);
    expect(mouthBlock.match(/<View/g)?.length).toBe(1);
    expect(mouthBlock.includes('/>')).toBe(true);
    expect(mouthBlock.includes('<Text')).toBe(false);
    expect(mouthBlock.includes('color.inkDark')).toBe(true);
    expect(source.includes('LUMEN_MOUTH[spec.mouth]')).toBe(true);
    // Poses swap only mouth/anim/stars — the figure reads the pose spec, never forks its shapes.
    expect(source.includes('LUMEN_POSES[pose]')).toBe(true);
    expect(source.includes('spec.stars ?')).toBe(true);
  });
});

// ── AC-2: D-13 holds ────────────────────────────────────────────────────────────────────────────

describe('A-086 — the two D-13 overrides hold (AC-2)', () => {
  it('spec(A-086:AC-2) no bypass affordance in any uncharted surface — the board link never ships', () => {
    expect(UNCHARTED_COMPONENTS.length).toBeGreaterThanOrEqual(5);
    for (const file of [...UNCHARTED_COMPONENTS, SERVICE, SCREEN]) {
      const source = read(file);
      expect(source.includes('SKIP_LINK'), `${file} names SKIP_LINK`).toBe(false);
      expect(source.includes('onSkip'), `${file} wires a skip handler`).toBe(false);
      expect(source, `${file} styles a skip row`).not.toMatch(/skipRow|skipText/);
      expect(source.toLowerCase().includes('grown-ups'), `${file} carries grown-ups copy`).toBe(false);
    }
    // The A-086 files hold to the hard form: the banned words appear in no spelling at all.
    for (const file of [FIGURE, CARD, SERVICE]) {
      const source = read(file);
      expect(source, `${file} mentions a skip`).not.toMatch(/skip/i);
      expect(source, `${file} mentions grown-ups`).not.toMatch(/grown/i);
    }
  });

  it('spec(A-086:AC-2) 100+ swept riddles all ask their whole question inside the FITTED bounds', () => {
    // The same clarity predicate the authored riddles pass (spec(A-066:AC-7), D-13 part two).
    const RESTATES =
      /\b(do|did|does|am|is|are|have|has|get|go|fit|fly|pop|sit|float|say|see|eat|squawk|fill|left|now|in all|each)\b/i;
    let swept = 0;
    for (const band of GRADE_BANDS) {
      for (const seed of [11, 4177, 909_090]) {
        const doc = generateIsland(seed, 6, band);
        for (let cleared = 0; cleared <= 12; cleared += 1) {
          const riddle = tallyRiddleFor(doc, cleared, band);
          const text = riddle.text.trim();
          expect(text.endsWith('?'), `${band}/${seed}/${cleared} does not end with a question`).toBe(true);
          const sentences = text.split(/(?<=[.!?])\s+/);
          const closing = sentences[sentences.length - 1] ?? '';
          const words = closing.split(/\s+/).filter((word) => word.length > 0);
          expect(
            words.length,
            `${band}/${seed}/${cleared} closing "${closing}" is under 5 words — an elliptical tail`,
          ).toBeGreaterThanOrEqual(5);
          expect(closing, `${band}/${seed}/${cleared} closing "${closing}" does not restate`).toMatch(RESTATES);
          // She counts LAMPS, and the closer names them — the board's elliptical tail never ships.
          expect(closing).toMatch(/how many lamps did i light/i);
          // FITTED: full-size fit inside the bubble's derived character budget.
          expect(text.length, `${band}/${seed}/${cleared} overflows the FITTED bubble`).toBeLessThanOrEqual(
            LUMEN_BUBBLE.maxChars,
          );
          swept += 1;
        }
      }
    }
    expect(swept).toBeGreaterThanOrEqual(100);
  });
});

// ── AC-3: growth without breach ─────────────────────────────────────────────────────────────────

describe('A-086 — the riddle grows but never breaches the band (AC-3)', () => {
  it('spec(A-086:AC-3) band × clearedCount 0..30: operands, answer and all four tiles under the ceiling', () => {
    for (const band of GRADE_BANDS) {
      const ceiling = TALLY_CEILING[band];
      for (const seed of [3, 512, 88_431]) {
        const doc = generateIsland(seed, 6, band);
        for (let cleared = 0; cleared <= 30; cleared += 1) {
          const r = tallyRiddleFor(doc, cleared, band);
          // Single in-band operation: k_1 and g2_3 sum; only g4_5 may scale (k_1 never ×/÷).
          expect(r.op).toBe(band === 'g4_5' ? 'mult' : 'add');
          expect(r.answer).toBe(r.op === 'add' ? r.a + r.b : r.a * r.b);
          expect(r.a).toBeGreaterThanOrEqual(1);
          expect(r.b).toBeGreaterThanOrEqual(1);
          expect(r.a).toBeLessThanOrEqual(ceiling);
          expect(r.b).toBeLessThanOrEqual(ceiling);
          expect(r.answer, `${band}/${seed}/${cleared} answer ${r.answer} breaches ${ceiling}`).toBeLessThanOrEqual(
            ceiling,
          );
          // Four DISTINCT tiles, the answer among them exactly once, at correctIndex.
          expect(r.choices).toHaveLength(4);
          expect(new Set(r.choices).size).toBe(4);
          expect(r.choices.filter((value) => value === r.answer)).toHaveLength(1);
          expect(r.choices[r.correctIndex]).toBe(r.answer);
          for (const value of r.choices) {
            expect(value).toBeGreaterThanOrEqual(1);
            expect(value).toBeLessThanOrEqual(ceiling);
          }
        }
      }
    }
  });

  it('spec(A-086:AC-3) deterministic per (island, tally, band); the progress operand grows monotonically', () => {
    for (const band of GRADE_BANDS) {
      const doc = generateIsland(217, 6, band);
      expect(tallyRiddleFor(doc, 4, band)).toEqual(tallyRiddleFor(doc, 4, band));

      // The growth operand: lamps-last-time on the add bands, nights on the scaling band.
      const progressAt = (cleared: number): number => {
        const r = tallyRiddleFor(doc, cleared, band);
        return band === 'g4_5' ? r.b : r.a;
      };
      let previous = progressAt(0);
      for (let cleared = 1; cleared <= 30; cleared += 1) {
        const current = progressAt(cleared);
        expect(current, `${band} progress operand shrank at tally ${cleared}`).toBeGreaterThanOrEqual(previous);
        previous = current;
      }
      expect(progressAt(30)).toBeGreaterThan(progressAt(0));
    }
    // A corrupt tally clamps rather than reaching a child as a broken riddle.
    const doc = generateIsland(217, 6, 'k_1');
    expect(tallyRiddleFor(doc, Number.NaN, 'k_1')).toEqual(tallyRiddleFor(doc, 0, 'k_1'));
    expect(tallyRiddleFor(doc, -3, 'k_1')).toEqual(tallyRiddleFor(doc, 0, 'k_1'));
    expect(() => tallyRiddleFor(doc, 0, 'g7' as GradeBand)).toThrow(RangeError);
  });
});

// ── AC-4: reward integrity ──────────────────────────────────────────────────────────────────────

describe('A-086 — coins land exactly once per island; a miss costs nothing (AC-4)', () => {
  it('spec(A-086:AC-4) a correct answer pays once — the receipt is the idempotency, double-tap safe', () => {
    const { store, doc } = frontierStore('g2_3');
    const before = store.getState().captain.coins;

    const first = completeLumenRiddle(store, doc, true);
    expect(first).toEqual({ applied: true, coinsPaid: LUMEN_COINS });
    expect(store.getState().captain.coins).toBe(before + LUMEN_COINS);

    const receipt = store.getState().captain.rewardReceipts[lumenReceiptKey(doc)];
    expect(receipt).toBeDefined();
    expect(isChestReceipt(receipt)).toBe(true);
    expect(receipt?.grant).toEqual({ kind: 'coins', amount: LUMEN_COINS });
    expect(receipt?.source).toBe('duel');

    // The double tap, the re-mounted card, the relaunch: applied:false, not a byte moves.
    for (let replay = 0; replay < 3; replay += 1) {
      expect(completeLumenRiddle(store, doc, true)).toEqual({ applied: false, coinsPaid: 0 });
    }
    expect(store.getState().captain.coins).toBe(before + LUMEN_COINS);
    expect(store.getState().captain.rewardReceipts[lumenReceiptKey(doc)]).toEqual(receipt);
    expect(LUMEN_COINS).toBe(8); // the board's own `+8 coins` strip
  });

  it('spec(A-086:AC-4) a wrong answer grants nothing, loses nothing, and the flow still reaches ready', () => {
    const { store, doc } = frontierStore('k_1');
    const before = store.getState().captain;

    const outcome = completeLumenRiddle(store, doc, false);
    expect(outcome).toEqual({ applied: false, coinsPaid: 0 });

    const after = store.getState().captain;
    expect(after.coins).toBe(before.coins);
    expect(after.rewardReceipts[lumenReceiptKey(doc)]).toBeUndefined();
    expect(after.uncharted).toEqual(before.uncharted);
    // Either way → ready: the island is unanswered-by-duel, fog parted, SET SAIL live.
    expect(resolveUnchartedPhase(after, true)).toBe('ready');

    // The same island, answered right later (a return visit), still pays — a miss is never a debt.
    expect(completeLumenRiddle(store, doc, true)).toEqual({ applied: true, coinsPaid: LUMEN_COINS });
    expect(store.getState().captain.coins).toBe(before.coins + LUMEN_COINS);
  });

  it('spec(A-086:AC-4) the encounter receipt can never collide with a duel receipt, and a hostile doc commits nothing', () => {
    const { store, doc } = frontierStore('g4_5');
    expect(lumenEncounterId(doc)).toMatch(/^genc_[0-9]+_[0-9a-z]+$/);
    expect(lumenEncounterId(doc)).not.toBe(unchartedDuelId(doc));
    expect(lumenReceiptKey(doc)).not.toBe(duelReceiptKey(unchartedDuelId(doc)));
    expect(isRewardReceiptKey(lumenReceiptKey(doc))).toBe(true);

    // The trust boundary (the A-080 arm precedent): a tampered document throws before any write.
    const before = store.getState().captain;
    expect(() =>
      completeLumenRiddle(store, { ...doc, mood: 'neon_scream' } as unknown as GenIslandDoc, true),
    ).toThrow();
    expect(store.getState().captain).toEqual(before);
  });

  it('spec(A-086:AC-4) greeting latches once through A-079’s action; asking is every visit after', () => {
    const { store, doc } = frontierStore('k_1');
    const coinsBefore = store.getState().captain.coins;
    expect(lumenStageFor(store.getState().captain)).toBe('greeting');
    greetLumen(store);
    expect(lumenStageFor(store.getState().captain)).toBe('asking');
    expect(store.getState().captain.uncharted?.metLumen).toBe(true);
    // Idempotent — the latch never resets, and greeting never pays anything.
    greetLumen(store);
    expect(store.getState().captain.uncharted?.metLumen).toBe(true);
    expect(store.getState().captain.coins).toBe(coinsBefore);
    expect(store.getState().captain.rewardReceipts[lumenReceiptKey(doc)]).toBeUndefined();
  });

  it('spec(A-086:AC-4) the authored encounter world never learns Lumen — HOSTS, pools and files sealed', () => {
    expect(Object.keys(HOSTS).sort()).toEqual([...ISLAND_IDS].sort());
    expect(Object.keys(HOSTS)).toHaveLength(5);
    for (const pool of Object.values(RIDDLE_POOLS)) {
      for (const template of pool ?? []) {
        expect(template.text).not.toMatch(/lumen|lanternfish/i);
      }
    }
    for (const file of [
      'src/components/encounter/EncounterCard.tsx',
      'src/components/encounter/encounterBoard.ts',
      'src/components/encounter/hosts.tsx',
      'src/services/encounter.ts',
      'src/content/riddles.ts',
    ]) {
      expect(read(file), `${file} learned Lumen`).not.toMatch(/lumen|lanternfish/i);
    }
    // And the gen world returns the courtesy: Tier B copies, it never imports the sealed card.
    for (const file of [CARD, FIGURE, SERVICE]) {
      const source = read(file);
      expect(source, `${file} reaches into components/encounter`).not.toMatch(/components\/encounter/);
      expect(source, `${file} imports the authored encounter service`).not.toMatch(
        /from '(\.\.\/)+services\/encounter'/,
      );
    }
  });

  it('spec(A-086:AC-4) the card commits at the tap and never touches a route or a settlement', () => {
    const source = read(CARD);
    // Commit-at-the-tap, through the service, on the module store.
    expect(source.includes('completeLumenRiddle(captainStore, doc, index === riddle.correctIndex)')).toBe(true);
    expect(source.includes('greetLumen(captainStore)')).toBe(true);
    expect(source.includes('lumenStageFor(captainStore.getState().captain)')).toBe(true);
    expect(source.includes('tallyRiddleFor(doc, clearedCount, band)')).toBe(true);
    // Self-contained: mounted by the screen, never reaching back into routes or settlement.
    expect(source.includes('expo-router')).toBe(false);
    expect(source.includes("from '../../../app")).toBe(false);
    expect(source).not.toMatch(/settleUnchartedDuel|advanceUncharted|settleDuelRewards/);
    // One pick only; tiles die after it; the resolve window is the copied A-066 900ms.
    expect(source.includes("if (phase !== 'riddle' || picked !== null || riddle === null) return;")).toBe(true);
    expect(source.includes("disabled={phase !== 'riddle'}")).toBe(true);
    expect(LUMEN_RESOLVE_MS).toBe(900);
    // No streak, no best-run — the standing red-flag rule, swept here too.
    for (const file of [CARD, FIGURE, SERVICE]) {
      expect(read(file)).not.toMatch(/streak|best[- _]?run/i);
    }
  });

  it('spec(A-086:AC-4) the shrug is amber, never red, and the copy carries the live numeral', () => {
    expect(lumenTileLooks(4, null, 2)).toEqual([
      LUMEN_TILE_IDLE,
      LUMEN_TILE_IDLE,
      LUMEN_TILE_IDLE,
      LUMEN_TILE_IDLE,
    ]);
    expect(lumenTileLooks(4, 0, 2)).toEqual([
      LUMEN_TILE_MISS,
      LUMEN_TILE_IDLE,
      LUMEN_TILE_CORRECT,
      LUMEN_TILE_IDLE,
    ]);
    expect(LUMEN_TILE_MISS.mark).toBe('~');
    expect(LUMEN_TILE_CORRECT.mark).toBe('✓');
    // No red anywhere in the gen encounter's own surfaces (danger tokens stay in the duel).
    for (const file of [CARD, FIGURE, SERVICE]) {
      expect(read(file)).not.toMatch(/color\.(danger|red)|#D93A2E/i);
    }
    expect(lumenCheerLine(7)).toBe('7 lamps! You have sharp eyes.');
    expect(lumenCloseLine(7)).toBe('Close! It was 7. Lamps are tricky.');
    expect(lumenRewardTitle(LUMEN_COINS)).toBe('+8 coins');
    expect(LUMEN_COPY).toEqual({
      greeting: 'Hello! I keep the lamps out here.',
      sayHello: 'Say hello',
      onward: 'Onward!',
      bye: 'Bye!',
      farewell: 'Come back any time. I will be here.',
      noHarm: 'No harm done',
    });
    expect(LUMEN.rewardSub).toBe('Lumen found them in the deep.');
    expect(LUMEN.missSub).toBe('Nothing lost. Lumen is glad you came.');
  });
});
