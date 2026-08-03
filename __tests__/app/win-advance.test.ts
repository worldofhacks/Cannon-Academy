/**
 * A-062 — a win advances the voyage; no island is replayed to open the next.
 *
 * Owner ruling D-11 (2026-08-02, `tickets/app/OWNER-RULINGS.md`): winning a duel on an island
 * immediately opens the next band-eligible island in the chain. One win, one new island, and the
 * voyage moves. This is a narrow supersession — it replaces mastery as the gate for ISLAND FOG
 * only. Everything else stands and is asserted here alongside the new behaviour:
 *
 *   - **The band gate is not negotiable.** A win never opens an island that teaches nothing
 *     inside the captain's band (AC-2). K-1's reachable set stays exactly
 *     `[port_sumwich, isla_products]` however many wins — the A-060 fixpoint, now held for the
 *     right reason.
 *   - **The entry cannon still lands with its island** (AC-3), exactly once, replay-safe under
 *     the `duel:<id>` receipt — or we recreate the circular-acquisition bug.
 *   - **Only wins advance** (AC-4): a lost duel and a sub-mastery drill lift no fog, and
 *     mastery-driven cannon unlocks through `resolveUnlocks` are untouched.
 *
 * Every settlement here is driven through the REAL spine — `commitGradeBand` places the captain
 * exactly as `app/onboarding.tsx` does, and `settleDuelRewards` is the one seam every finished
 * duel passes through (`applyDuelOutcome` and the guided duel both delegate to it). No fixture
 * writes `unlockedIslands` by hand, so a green here means a child's win really moves their map.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getCannon, getIsland, getSkill } from '@content/index';
import type { GradeBand, IslandId } from '@content/schemas';
import { advanceOnWin } from '@engine/mastery';
import { maxGradeForBand } from '@engine/placement';
import { MASTERY_THRESHOLD_CORRECT } from '@engine/tuning';

import { chartNodes, chartProgress } from '../../src/services/chart';
import { commitGradeBand } from '../../src/services/onboarding';
import { settleDuelRewards } from '../../src/services/rewardSettlement';
import { createCaptainStore, type CaptainStore } from '../../src/stores/player';

const BANDS: readonly GradeBand[] = ['k_1', 'g2_3', 'g4_5'];

/** A captain placed the way `app/onboarding.tsx` places one — through `commitGradeBand`. */
function onboarded(band: GradeBand): CaptainStore {
  const store = createCaptainStore();
  commitGradeBand(store, band);
  const captain = store.getState().captain;
  // Non-vacuity: a sweep over an unplaced captain would prove nothing about any band.
  expect(captain.gradeBand).toBe(band);
  expect(captain.unlockedIslands.length).toBeGreaterThan(0);
  return store;
}

/** Fresh ids per settle — `settleDuelRewards` is idempotent per duelId, and that is AC-3's job. */
let mintedDuels = 0;
function mintDuelId(): string {
  mintedDuels += 1;
  return `duel-a62${mintedDuels.toString(36)}`;
}

/**
 * Settles one WON duel fought at `at`, through the same input shape `applyDuelOutcome` builds.
 *
 * The tally is deliberately far below the mastery threshold: if fog lifts after one of these,
 * mastery arithmetic cannot be why — the WIN is (the whole point of D-11).
 */
function winOne(store: CaptainStore, at: IslandId, duelId = mintDuelId()) {
  store.getState().setCurrentIsland(at);
  return settleDuelRewards(store, {
    duelId,
    seed: parseInt(duelId.slice('duel-'.length), 36) >>> 0,
    won: true,
    purseCoins: 7,
    skillTally: { add_within_10: { correct: 3, asked: 4 } },
  });
}

describe('A-062 a win advances the voyage', () => {
  // ── AC-1 — one win, one new island, at every band ────────────────────────────────────────────

  it('spec(A-062:AC-1) a K-1 captain who wins ONCE on Port Sumwich holds Isla Products — and not via mastery', () => {
    const store = onboarded('k_1');
    expect(store.getState().captain.unlockedIslands).toEqual(['port_sumwich']);

    const outcome = winOne(store, 'port_sumwich');

    expect(outcome.applied).toBe(true);
    expect(outcome.unlockedIslands).toContain('isla_products');
    const captain = store.getState().captain;
    expect(captain.unlockedIslands).toContain('isla_products');

    // The mechanism check: one sub-threshold tally mastered nothing, so the fog cannot have
    // lifted through `resolveUnlocks` — the win itself did it.
    const anyMastered = Object.values(captain.mastery).some(
      (m) => m !== undefined && m.weightedCorrect >= MASTERY_THRESHOLD_CORRECT,
    );
    expect(anyMastered).toBe(false);
  });

  it('spec(A-062:AC-1) winning the frontier island opens the next band-eligible island immediately, at every band', () => {
    const walk: Record<GradeBand, readonly { at: IslandId; opens: IslandId }[]> = {
      k_1: [{ at: 'port_sumwich', opens: 'isla_products' }],
      g2_3: [{ at: 'isla_products', opens: 'quotient_cove' }],
      g4_5: [
        { at: 'quotient_cove', opens: 'fraction_reef' },
        { at: 'fraction_reef', opens: 'grandline' },
      ],
    };

    for (const band of BANDS) {
      const store = onboarded(band);
      for (const step of walk[band]) {
        expect(store.getState().captain.unlockedIslands, `${band} starts without ${step.opens}`).not.toContain(
          step.opens,
        );
        const outcome = winOne(store, step.at);
        expect(outcome.applied).toBe(true);
        expect(outcome.unlockedIslands, `${band}: one win at ${step.at} must open ${step.opens}`).toContain(
          step.opens,
        );
        expect(store.getState().captain.unlockedIslands).toContain(step.opens);
      }
    }
  });

  // ── AC-2 — the band gate survives instant advancement ────────────────────────────────────────

  it('spec(A-062:AC-2) K-1 reach is exactly two islands no matter how many wins — the A-060 fixpoint holds', () => {
    const store = onboarded('k_1');
    winOne(store, 'port_sumwich');

    // Grind both open islands well past any pacing argument. Quotient Cove must stay shut the
    // whole time: it teaches only `div_facts`, and nothing it teaches is inside the K-1 ceiling.
    for (let round = 0; round < 4; round += 1) {
      winOne(store, 'port_sumwich');
      winOne(store, 'isla_products');
    }

    const captain = store.getState().captain;
    expect([...captain.unlockedIslands].sort()).toEqual(['isla_products', 'port_sumwich']);

    // The refusal is the band filter, stated as the reason: the successor teaches nothing in band.
    const ceiling = maxGradeForBand('k_1');
    expect(
      getIsland('quotient_cove').rangeSkills.some((skill) => getSkill(skill).minGrade <= ceiling),
    ).toBe(false);
    const advance = advanceOnWin('isla_products', 'k_1', captain.unlockedIslands, captain.ownedCannons);
    expect(advance.islands).toEqual([]);
    expect(advance.cannons).toEqual([]);
  });

  it('spec(A-062:AC-2) g2_3 stops at Quotient Cove, and a win behind the frontier re-opens nothing', () => {
    const store = onboarded('g2_3');
    winOne(store, 'isla_products');
    for (let i = 0; i < 3; i += 1) winOne(store, 'quotient_cove');

    // Fraction Reef teaches grade-4 fractions only — out of band for g2_3, shut forever.
    expect([...store.getState().captain.unlockedIslands].sort()).toEqual([
      'isla_products',
      'port_sumwich',
      'quotient_cove',
    ]);

    // Delta semantics: winning where the successor is already open advances nothing and
    // duplicates nothing.
    const before = [...store.getState().captain.unlockedIslands];
    const outcome = winOne(store, 'port_sumwich');
    expect(outcome.unlockedIslands).toEqual([]);
    expect(store.getState().captain.unlockedIslands).toEqual(before);
  });

  // ── AC-3 — the entry cannon lands with its island, exactly once ──────────────────────────────

  it('spec(A-062:AC-3) Grapeshot arrives with Isla Products, once, and a replayed duelId grants nothing twice', () => {
    const store = onboarded('k_1');
    expect(store.getState().captain.ownedCannons).not.toContain('grapeshot');

    const duelId = 'duel-a62ac3';
    const first = winOne(store, 'port_sumwich', duelId);
    expect(first.applied).toBe(true);
    expect(first.unlockedIslands).toContain('isla_products');
    expect(first.unlockedCannons).toContain('grapeshot');

    const captain = store.getState().captain;
    expect(captain.ownedCannons.filter((id) => id === 'grapeshot')).toHaveLength(1);
    // The arrival gun asks the island's own questions inside the band — that is what it is FOR.
    expect(getCannon('grapeshot').minGrade).toBeLessThanOrEqual(maxGradeForBand('k_1'));

    // Settlement replay of the same duelId is a durable no-op: no island, no gun, no win.
    const replay = winOne(store, 'port_sumwich', duelId);
    expect(replay.applied).toBe(false);
    expect(replay.unlockedIslands).toEqual([]);
    expect(replay.unlockedCannons).toEqual([]);
    const after = store.getState().captain;
    expect(after.ownedCannons.filter((id) => id === 'grapeshot')).toHaveLength(1);
    expect(after.unlockedIslands.filter((id) => id === 'isla_products')).toHaveLength(1);
    expect(after.wins).toBe(captain.wins);
  });

  it('spec(A-062:AC-3) every opened island arrives holding one in-band entry cannon, at the older bands too', () => {
    const top = onboarded('g4_5');
    const first = winOne(top, 'quotient_cove');
    expect(first.unlockedIslands).toContain('fraction_reef');
    expect(first.unlockedCannons).toContain('powder_keg');
    const second = winOne(top, 'fraction_reef');
    expect(second.unlockedIslands).toContain('grandline');
    expect(second.unlockedCannons).toContain('long_nine');

    const mid = onboarded('g2_3');
    const opened = winOne(mid, 'isla_products');
    expect(opened.unlockedIslands).toContain('quotient_cove');
    expect(opened.unlockedCannons).toContain('mortar');
    expect(getCannon('mortar').minGrade).toBeLessThanOrEqual(maxGradeForBand('g2_3'));
  });

  // ── AC-4 — only wins advance ─────────────────────────────────────────────────────────────────

  it('spec(A-062:AC-4) a lost duel lifts no fog and lands no gun', () => {
    const store = onboarded('k_1');
    const before = store.getState().captain;
    store.getState().setCurrentIsland('port_sumwich');

    const outcome = settleDuelRewards(store, {
      duelId: 'duel-a62ac4',
      seed: parseInt('a62ac4', 36) >>> 0,
      won: false,
      purseCoins: 3,
      skillTally: { add_within_10: { correct: 3, asked: 6 } },
    });

    expect(outcome.applied).toBe(true);
    expect(outcome.won).toBe(false);
    expect(outcome.unlockedIslands).toEqual([]);
    expect(outcome.unlockedCannons).toEqual([]);
    const after = store.getState().captain;
    expect(after.unlockedIslands).toEqual(before.unlockedIslands);
    expect(after.ownedCannons).toEqual(before.ownedCannons);
  });

  it('spec(A-062:AC-4) a drill short of mastery lifts no fog, and mastery still pays cannons unchanged', () => {
    const store = onboarded('k_1');
    store.getState().recordRangeAnswers('add_within_10', { correct: 5, asked: 6 });
    expect(store.getState().captain.unlockedIslands).toEqual(['port_sumwich']);
    expect(store.getState().captain.ownedCannons).not.toContain('grapeshot');

    // D-11 is a narrow supersession: `resolveUnlocks` keeps paying range cannons on mastery —
    // the practice lane still accelerates the arsenal, it just no longer holds the map hostage.
    store.getState().recordRangeAnswers('add_within_10', {
      correct: MASTERY_THRESHOLD_CORRECT,
      asked: MASTERY_THRESHOLD_CORRECT,
    });
    const captain = store.getState().captain;
    expect(captain.ownedCannons).toContain('culverin');
    expect(captain.ownedCannons).toContain('saker');
  });

  // ── AC-5 — the dock meter tells the truth ────────────────────────────────────────────────────

  it('spec(A-062:AC-5) the chart promises exactly ONE duel while a next island exists, at every band', () => {
    for (const band of BANDS) {
      const store = onboarded(band);
      const captain = store.getState().captain;
      const progress = chartProgress(captain, chartNodes(captain));

      expect(progress.nextIndex, `${band} has a next island to promise`).toBeGreaterThanOrEqual(0);
      expect(progress.next, band).not.toBeNull();
      // The dock chip renders `NEXT: 1 DUEL` exactly when this count is 1 (`Dock.tsx`).
      expect(progress.duelsToOpen, band).toBe(1);
      expect(progress.caption, band).toBe('1 DUEL TO OPEN');
      expect(progress.message, band).not.toBeNull();
    }
  });

  it('spec(A-062:AC-5) no caption dead-ends: once no win can open anything, the promise goes away', () => {
    // K-1 fully advanced: Quotient Cove is out of band, so a win can NEVER open it — the chart
    // must stop counting rather than promise a duel that pays nothing.
    const store = onboarded('k_1');
    winOne(store, 'port_sumwich');
    const captain = store.getState().captain;
    const progress = chartProgress(captain, chartNodes(captain));
    expect(progress.nextIndex).toBe(-1);
    expect(progress.next).toBeNull();
    expect(progress.duelsToOpen).toBe(0);
    expect(progress.caption).toBeNull();
    expect(progress.message).toBeNull();

    // The top band at the end of the chain: the voyage-complete state keeps the same hidden copy.
    const top = onboarded('g4_5');
    winOne(top, 'quotient_cove');
    winOne(top, 'fraction_reef');
    const done = top.getState().captain;
    expect(done.unlockedIslands).toHaveLength(5);
    const doneProgress = chartProgress(done, chartNodes(done));
    expect(doneProgress.nextIndex).toBe(-1);
    expect(doneProgress.caption).toBeNull();
    expect(doneProgress.message).toBeNull();
  });

  // ── AC-7 — the tutorial is choreographed, not earned ─────────────────────────────────────────
  //
  // D-11 applies to REAL wins. A K-1 captain's whole reach is two islands; if the scripted
  // tutorial victory consumed the advance, the win→sail→next-battle beat could never fire for
  // that band — their one arrival would be spent before their first free duel.

  it('spec(A-062:AC-7) a held settlement pays everything except the voyage — the tutorial opens no fog', () => {
    const store = onboarded('k_1');
    expect(store.getState().captain.unlockedIslands).toEqual(['port_sumwich']);

    store.getState().setCurrentIsland('port_sumwich');
    const duelId = mintDuelId();
    const held = settleDuelRewards(
      store,
      {
        duelId,
        seed: parseInt(duelId.slice('duel-'.length), 36) >>> 0,
        won: true,
        purseCoins: 7,
        skillTally: { add_within_10: { correct: 3, asked: 4 } },
      },
      { voyage: 'hold' },
    );

    // Paid like any win — coins, tally, receipt — but the map did not move.
    expect(held.applied).toBe(true);
    expect(held.unlockedIslands).toEqual([]);
    expect(store.getState().captain.unlockedIslands).toEqual(['port_sumwich']);

    // The FIRST REAL win still finds the arrival waiting for it.
    const real = winOne(store, 'port_sumwich');
    expect(real.unlockedIslands).toContain('isla_products');
  });

  it('spec(A-062:AC-7) the guided duel settles with the voyage held — pinned at its one call site', () => {
    // `settleGuidedDuel` needs a full async session harness to reach victory; the seam above is
    // proven behaviourally, so the wiring is pinned at source — the repo's precedent for call
    // sites a node test cannot drive (chart-worklet-safety.test.ts, design-fidelity.test.ts).
    const source = readFileSync(
      join(__dirname, '../../src/services/guidedDuel.ts'),
      'utf8',
    );
    expect(source).toMatch(/settleDuelRewards\(\s*store,\s*core,\s*\{\s*voyage:\s*'hold'\s*\}\s*\)/);
  });
});
