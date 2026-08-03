/**
 * A-062 — a win advances the voyage; no island is replayed to open the next.
 *
 * RE-BASELINED under owner ruling **D-14** (2026-08-02, `tickets/app/OWNER-RULINGS.md`, applied
 * by A-070): five islands for every band, each band its own curriculum. The old fixpoints this
 * suite pinned — "K-1 reach is exactly two", "g2_3 stops at Quotient Cove" — described the
 * one-shared-curriculum world, where the band was a fence across the chain. Under the atlas the
 * fence moves into the curriculum itself (`islandCurriculumFor`), so their successors are:
 *
 *   - **Every band's reach is exactly five** (A-070 AC-1): four settled frontier wins walk the
 *     whole chain, at every band, through the REAL spine.
 *   - **The entry cannon still lands with its island** — now the BAND'S OWN cell gun, one per
 *     arrival, its skill taught to that band by that island, receipt-idempotent (A-070 AC-3,
 *     the A-062 AC-3 property swept across the atlas).
 *   - **Only wins advance** (AC-4, unchanged): a lost duel and a sub-mastery drill lift no fog.
 *   - **No band fails OPEN** (A-070 AC-5): a captain the app never placed gets no island and no
 *     gun from a win — fail closed replaces the old "no ceiling" reading, because there is no
 *     shared curriculum left to fall back to.
 *
 * Every settlement here is driven through the REAL spine — `commitGradeBand` places the captain
 * exactly as `app/onboarding.tsx` does, and `settleDuelRewards` is the one seam every finished
 * duel passes through (`applyDuelOutcome` and the guided duel both delegate to it). No fixture
 * writes `unlockedIslands` by hand, so a green here means a child's win really moves their map.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getCannon, islandCurriculumFor } from '@content/index';
import type { CannonId, GradeBand, IslandId } from '@content/schemas';
import { advanceOnWin } from '@engine/mastery';
import { maxGradeForBand } from '@engine/placement';
import { MASTERY_THRESHOLD_CORRECT } from '@engine/tuning';

import { chartNodes, chartProgress } from '../../src/services/chart';
import { commitGradeBand } from '../../src/services/onboarding';
import { settleDuelRewards } from '../../src/services/rewardSettlement';
import { createCaptainStore, type CaptainStore } from '../../src/stores/player';

const BANDS: readonly GradeBand[] = ['k_1', 'g2_3', 'g4_5'];

/** The chain in `requiresIsland` order — the walk D-14 promises every band in full. */
const CHAIN: readonly IslandId[] = [
  'port_sumwich',
  'isla_products',
  'quotient_cove',
  'fraction_reef',
  'grandline',
];

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

/**
 * The `everReachableIslands` fixpoint over `advanceOnWin` — the D-14 restatement of the old
 * A-060 reach computation: start from placement, keep winning anywhere open, collect until
 * nothing new opens.
 */
function everReachableIslands(band: GradeBand): readonly IslandId[] {
  const store = onboarded(band);
  let reach = new Set<IslandId>(store.getState().captain.unlockedIslands);
  for (;;) {
    const before = reach.size;
    for (const at of [...reach]) {
      const captain = store.getState().captain;
      const delta = advanceOnWin(at, band, captain.unlockedIslands, captain.ownedCannons);
      for (const islandId of delta.islands) {
        winOne(store, at);
        reach = new Set(store.getState().captain.unlockedIslands);
        void islandId;
      }
    }
    reach = new Set(store.getState().captain.unlockedIslands);
    if (reach.size === before) return [...reach].sort();
  }
}

describe('A-062 a win advances the voyage (re-baselined to D-14 by A-070)', () => {
  // ── AC-1 — one win, one new island, at every band, all the way to island five ────────────────

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

  it('spec(A-070:AC-1) every band reaches all five islands in exactly four frontier wins, through the real spine', () => {
    for (const band of BANDS) {
      const store = onboarded(band);
      // D-14: placement opens island one ONLY, for every band — the voyage is won, never granted.
      expect(store.getState().captain.unlockedIslands, `${band} placement`).toEqual(['port_sumwich']);

      for (let step = 0; step < CHAIN.length - 1; step += 1) {
        const at = CHAIN[step]!;
        const opens = CHAIN[step + 1]!;
        expect(store.getState().captain.unlockedIslands, `${band} before win ${step + 1}`).not.toContain(
          opens,
        );
        const outcome = winOne(store, at);
        expect(outcome.applied).toBe(true);
        expect(outcome.unlockedIslands, `${band}: win ${step + 1} at ${at} must open ${opens}`).toContain(
          opens,
        );
      }

      const captain = store.getState().captain;
      expect([...captain.unlockedIslands].sort(), `${band} after four wins`).toEqual([...CHAIN].sort());

      // Win five: the chain is finished — a win at the last island opens nothing and breaks nothing.
      const fifth = winOne(store, 'grandline');
      expect(fifth.unlockedIslands, `${band} chain end`).toEqual([]);
      expect(store.getState().captain.unlockedIslands).toHaveLength(CHAIN.length);
    }
  });

  it('spec(A-070:AC-1) the everReachableIslands fixpoint is ALL FIVE at every band — the D-14 restatement of the A-060 fixpoint', () => {
    for (const band of BANDS) {
      expect(everReachableIslands(band), band).toEqual([...CHAIN].sort());
    }
  });

  // ── AC-2 — delta semantics survive the atlas ─────────────────────────────────────────────────

  it('spec(A-062:AC-2) a win behind the frontier re-opens nothing and duplicates nothing', () => {
    const store = onboarded('g2_3');
    winOne(store, 'port_sumwich');
    winOne(store, 'isla_products');

    // Delta semantics: winning where the successor is already open advances nothing and
    // duplicates nothing.
    const before = [...store.getState().captain.unlockedIslands];
    const outcome = winOne(store, 'port_sumwich');
    expect(outcome.unlockedIslands).toEqual([]);
    expect(store.getState().captain.unlockedIslands).toEqual(before);

    const captain = store.getState().captain;
    const advance = advanceOnWin('port_sumwich', 'g2_3', captain.unlockedIslands, captain.ownedCannons);
    expect(advance.islands).toEqual([]);
    expect(advance.cannons).toEqual([]);
  });

  // ── AC-3 — the entry cannon lands with its island, exactly once, from the band's own cell ────

  it('spec(A-062:AC-3) the Dinghy Gun arrives with a K-1 Isla Products, once, and a replayed duelId grants nothing twice', () => {
    const store = onboarded('k_1');
    expect(store.getState().captain.ownedCannons).not.toContain('dinghy_gun');

    const duelId = 'duel-a62ac3';
    const first = winOne(store, 'port_sumwich', duelId);
    expect(first.applied).toBe(true);
    expect(first.unlockedIslands).toContain('isla_products');
    // D-14: the arrival gun is the BAND'S cell gun — subtraction within 10, the island's own
    // K-1 teaching — never the old shared list's grapeshot.
    expect(first.unlockedCannons).toContain('dinghy_gun');
    expect(first.unlockedCannons).not.toContain('grapeshot');

    const captain = store.getState().captain;
    expect(captain.ownedCannons.filter((id) => id === 'dinghy_gun')).toHaveLength(1);
    // The arrival gun asks the island's own questions inside the band — that is what it is FOR.
    expect(getCannon('dinghy_gun').minGrade).toBeLessThanOrEqual(maxGradeForBand('k_1'));
    expect(islandCurriculumFor('isla_products', 'k_1').skills).toContain(getCannon('dinghy_gun').skill);

    // Settlement replay of the same duelId is a durable no-op: no island, no gun, no win.
    const replay = winOne(store, 'port_sumwich', duelId);
    expect(replay.applied).toBe(false);
    expect(replay.unlockedIslands).toEqual([]);
    expect(replay.unlockedCannons).toEqual([]);
    const after = store.getState().captain;
    expect(after.ownedCannons.filter((id) => id === 'dinghy_gun')).toHaveLength(1);
    expect(after.unlockedIslands.filter((id) => id === 'isla_products')).toHaveLength(1);
    expect(after.wins).toBe(captain.wins);
  });

  it('spec(A-070:AC-3) every band\'s four arrivals each land exactly one in-band gun whose skill that island teaches THAT band', () => {
    for (const band of BANDS) {
      const store = onboarded(band);
      const ceiling = maxGradeForBand(band);

      for (let step = 0; step < CHAIN.length - 1; step += 1) {
        const at = CHAIN[step]!;
        const opens = CHAIN[step + 1]!;
        const before = store.getState().captain;
        const ownedBefore = new Set<CannonId>(before.ownedCannons);

        // The ARRIVAL delta, from the engine helper the settlement calls: exactly one gun rides
        // with the island. (The settlement may ALSO roll a chest gun on the same win — a separate
        // reward with its own receipt — so the exactly-one property is asserted at the seam that
        // owns it.)
        const delta = advanceOnWin(at, band, before.unlockedIslands, before.ownedCannons);
        expect(delta.islands, `${band} arrival ${opens}`).toEqual([opens]);
        expect(delta.cannons, `${band} arrival ${opens} grants one gun`).toHaveLength(1);
        const gun = getCannon(delta.cannons[0]!);
        expect(ownedBefore.has(gun.id), `${band} ${opens}: ${gun.id} must be NEW`).toBe(false);

        // …it is a gun the island pays THIS band…
        const cell = islandCurriculumFor(opens, band);
        expect(cell.unlocksCannons, `${band} ${opens}: cell pays ${gun.id}`).toContain(gun.id);

        // …its skill is one the island teaches THIS band, inside the band's ceiling.
        expect(cell.skills, `${band} ${opens}: ${gun.id} asks the island's own questions`).toContain(
          gun.skill,
        );
        expect(gun.minGrade, `${band} ${opens}: ${gun.id} is in band`).toBeLessThanOrEqual(ceiling);

        // And the REAL spine pays that gun with the arrival. (A settled win can grant more than
        // the entry gun — the chest roll and the mastery lane both pay through the same commit —
        // but the ARRIVAL's own delta is exactly the one cell gun, pinned above at the seam that
        // owns it.)
        const outcome = winOne(store, at);
        expect(outcome.unlockedIslands, `${band} spine arrival ${opens}`).toEqual([opens]);
        expect(outcome.unlockedCannons, `${band} spine pays ${gun.id}`).toContain(gun.id);
      }
    }
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
    expect(store.getState().captain.ownedCannons).not.toContain('dinghy_gun');

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

  // ── AC-5 — null band fails closed at the engine and through the spine (A-070) ────────────────

  it('spec(A-070:AC-5) a band-less captain gets no island and no gun from a win — fail closed, not "no ceiling"', () => {
    // The engine helper, directly: null band is a captain the app never placed, and D-14 leaves
    // them no shared curriculum to fall back onto.
    const advance = advanceOnWin('port_sumwich', null, ['port_sumwich'], []);
    expect(advance.islands).toEqual([]);
    expect(advance.cannons).toEqual([]);

    // And through the settlement spine: an unplaced store settles a win without moving the map.
    const store = createCaptainStore();
    expect(store.getState().captain.gradeBand).toBeNull();
    const outcome = winOne(store, 'port_sumwich');
    expect(outcome.applied).toBe(true);
    expect(outcome.unlockedIslands).toEqual([]);
    expect(outcome.unlockedCannons).toEqual([]);
  });

  // ── AC-5 (A-062) — the dock meter tells the truth, now all the way down the chain ────────────

  it('spec(A-062:AC-5) the chart promises exactly ONE duel while a next island exists — at every band, every step', () => {
    for (const band of BANDS) {
      const store = onboarded(band);
      // Four steps of promise, one per remaining island — D-14: no band's caption ever dead-ends
      // before island five.
      for (let step = 0; step < CHAIN.length - 1; step += 1) {
        const captain = store.getState().captain;
        const progress = chartProgress(captain, chartNodes(captain));
        expect(progress.nextIndex, `${band} step ${step} has a next island`).toBeGreaterThanOrEqual(0);
        expect(progress.next, band).not.toBeNull();
        // The dock chip renders `NEXT: 1 DUEL` exactly when this count is 1 (`Dock.tsx`).
        expect(progress.duelsToOpen, band).toBe(1);
        expect(progress.caption, band).toBe('1 DUEL TO OPEN');
        expect(progress.message, band).not.toBeNull();
        winOne(store, CHAIN[step]!);
      }
    }
  });

  it('spec(A-062:AC-5) the promise goes away exactly when the voyage completes — five islands open, nothing to count', () => {
    for (const band of BANDS) {
      const store = onboarded(band);
      for (let step = 0; step < CHAIN.length - 1; step += 1) winOne(store, CHAIN[step]!);

      const done = store.getState().captain;
      expect(done.unlockedIslands, band).toHaveLength(5);
      const progress = chartProgress(done, chartNodes(done));
      expect(progress.nextIndex, band).toBe(-1);
      expect(progress.next, band).toBeNull();
      expect(progress.duelsToOpen, band).toBe(0);
      expect(progress.caption, band).toBeNull();
      expect(progress.message, band).toBeNull();
    }
  });

  // ── AC-7 — the tutorial is choreographed, not earned ─────────────────────────────────────────
  //
  // D-11 applies to REAL wins. The tutorial's scripted victory must not consume the first
  // arrival — the win→sail→next-battle beat belongs to the first free duel, at every band.

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
