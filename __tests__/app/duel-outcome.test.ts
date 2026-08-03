/**
 * A-008 — the duel earns something.
 *
 * Written before the implementation. Today `computeCoinPayout` runs at the end of every duel, its
 * result is rendered once by `VictoryPanel`, and then the screen unmounts and the number is gone.
 * Mastery is never touched. Wins are never counted. This file is the contract that turns the duel
 * from a demo into a loop.
 *
 * Nothing here renders a screen. `app/duel.tsx` imports React Native, whose entry point is
 * Flow-typed and unparseable by the node runner — so the rule the app track has followed since
 * A-001 applies again: the logic lives in a module the screen calls, and the module is tested
 * headless. The duel is driven here through the real reducer, so these are the states the screen
 * will actually hand over, not hand-built fixtures.
 *
 * ── The contract these tests assume ──────────────────────────────────────────────────────────
 *
 * NEW MODULE — `src/services/duelRewards.ts`:
 *
 *   export interface DuelRewardOutcome {
 *     readonly applied: boolean;            // false when this duel was already paid for
 *     readonly won: boolean;
 *     readonly coins: number;               // coins actually added; 0 when not applied
 *     readonly unlockedCannons: readonly CannonId[];   // newly granted BY THIS APPLICATION
 *     readonly unlockedIslands: readonly IslandId[];
 *     readonly rankTier: number;
 *     readonly rankedUp: boolean;
 *   }
 *
 *   export function applyDuelOutcome(store: CaptainStore, duel: DuelState): DuelRewardOutcome;
 *
 * NEW FIELDS on `DuelState` (`src/stores/duel.ts`, in this ticket's file_scopes):
 *
 *   readonly duelId: string;
 *   readonly skillTally: Readonly<Partial<Record<SkillId, { readonly correct: number;
 *                                                          readonly asked: number }>>>;
 *
 * Why a duel id at all: AC-6. React re-renders, effects fire twice in StrictMode, and a terminal
 * phase can be observed many times. Anything applied per OBSERVATION pays repeatedly. The identity
 * cannot be the state object — `OPEN_CHEST` produces a new object for the same duel — and it
 * cannot be `{seed, turn}` alone, because a re-mount rebuilds the same seed. So the state carries
 * an id, minted once by `initialDuelState`, preserved by every transition, and freshly minted by
 * `RESET`. The id is derived from the seed (the reducer stays pure — no clock, no uuid), which
 * makes supplying a FRESH SEED PER DUEL the screen's job: `app/duel.tsx` is in file_scopes and
 * today hardcodes `initialDuelState(2026)`, so re-entering the screen would replay one duel id.
 *
 * Why a per-skill tally: AC-2 says "the matching skill's mastery rises". The reducer already
 * counts `asked`/`right` in aggregate, but a duel can fire two cannons on two different skills,
 * and aggregate counters cannot say which meter to fill.
 *
 * Why settlement is remembered PER STORE: the ledger answers "has this captain been paid for this
 * duel", so it is scoped to the captain it paid — not a module-level set that leaks between
 * captains (and between tests).
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { getCannon } from '../../src/content/index';
import type { Cannon, SkillId } from '../../src/content/schemas';
import { computeCoinPayout } from '../../src/engine/economy';
import { rankTierForWins } from '../../src/engine/ranks';
import {
  MASTERY_RATE_DUEL,
  MASTERY_RATE_RANGE,
  MASTERY_THRESHOLD_CORRECT,
  PLAYER_HULL,
} from '../../src/engine/tuning';
import { hydrate, persist, type KeyValueStore } from '../../src/services/persistence';
import { applyDuelOutcome } from '../../src/services/duelRewards';
import { duelReducer, initialDuelState, type DuelState } from '../../src/stores/duel';
import { createCaptainStore, type Captain, type CaptainStore } from '../../src/stores/player';

// ── The duel harness ─────────────────────────────────────────────────────────────────────────

const SWIVEL = getCannon('swivel_gun'); // add_within_10, starter
const CHAIN_SHOT = getCannon('chain_shot'); // sub_within_20, range-unlocked

/** A per-turn script for a duel. */
interface Plan {
  readonly cannonForTurn: (turn: number) => Cannon;
  readonly correctOnTurn: (turn: number) => boolean;
  /** Answer delay. Defaults to the full fuse, which is deliberately NOT a Perfect Shot. */
  readonly elapsedMsForTurn?: (turn: number) => number;
}

type Tally = Partial<Record<SkillId, { correct: number; asked: number }>>;

/**
 * Drives the real reducer to a terminal phase, and independently records which skill each answer
 * belonged to. The tally is built HERE, by the harness, so the mastery assertions never check the
 * implementation against its own bookkeeping.
 */
function playDuel(seed: number, plan: Plan): { readonly state: DuelState; readonly tally: Tally } {
  let s = initialDuelState(seed);
  const tally: Tally = {};

  for (let step = 0; step < 2000; step += 1) {
    if (s.phase === 'victory' || s.phase === 'defeat') return { state: s, tally };

    if (s.phase === 'select') {
      s = duelReducer(s, { type: 'PICK_CANNON', cannon: plan.cannonForTurn(s.turn) });
      continue;
    }

    if (s.phase === 'question') {
      const question = s.question;
      const cannon = s.cannon;
      if (question === null || cannon === null) throw new Error('question phase with no question');
      const correct = plan.correctOnTurn(s.turn);
      const value = correct ? question.answer : wrongChoice(question.choices, question.answer);
      const entry = tally[cannon.skill] ?? { correct: 0, asked: 0 };
      tally[cannon.skill] = { correct: entry.correct + (correct ? 1 : 0), asked: entry.asked + 1 };
      s = duelReducer(s, {
        type: 'ANSWER',
        value,
        elapsedMs: plan.elapsedMsForTurn?.(s.turn) ?? cannon.timerMs,
      });
      continue;
    }

    s = duelReducer(s, { type: 'ADVANCE' });
  }

  throw new Error(`duel never terminated — stuck in phase '${s.phase}'`);
}

function wrongChoice(choices: readonly number[], answer: number): number {
  const wrong = choices.find((c) => c !== answer);
  if (wrong === undefined) throw new Error('question offered no wrong choice');
  return wrong;
}

/** Every turn, same gun, every answer right. The shortest path to a victory. */
const win = (cannon: Cannon = SWIVEL): Plan => ({
  cannonForTurn: () => cannon,
  correctOnTurn: () => true,
});

/**
 * Two right answers, then nothing lands. The rival is hurt but afloat, and the player's hull runs
 * out first — a loss that still earned some mastery, which is what AC-5 is really about.
 */
const lose = (cannon: Cannon = SWIVEL): Plan => ({
  cannonForTurn: () => cannon,
  correctOnTurn: (turn) => turn <= 2,
});

/** What the engine says this performance is worth. The reward layer may not price it itself. */
function payoutFor(d: DuelState, won: boolean, perfectShots = d.perfects): number {
  return computeCoinPayout({
    won,
    totalAnswers: d.asked,
    correctAnswers: d.right,
    perfectShots,
  });
}

/**
 * Re-baselined 2026-08-02 under A-032: since the chest ceremony became a real settlement
 * (`rollChestSettlement` commits inside the same `replaceCaptain` as the purse), a won duel's
 * coin delta is purse + chest — deliberately, so a child who never taps the ceremony still owns
 * its coins; the panel prints them as two lines ("+N from the duel" / chest card). These specs
 * pinned the pre-chest world and had been red since 2026-07-29. The chest half is read off the
 * DURABLE receipt, never re-derived, so exactness ("pays what the engine says, nothing invented")
 * still holds line by line.
 */
function chestCoinsFor(s: CaptainStore, duelId: string): number {
  const receipt = s.getState().captain.rewardReceipts[`duel:${duelId}`];
  return receipt !== undefined && receipt.grant.kind === 'coins' ? receipt.grant.amount : 0;
}

/** A captain one duel answer short of mastering `skill`, at an accuracy well clear of the floor. */
function captainOneAnswerShortOf(skill: SkillId): Captain {
  const seedStore = createCaptainStore();
  seedStore.getState().setGradeBand('k_1');
  const c = seedStore.getState().captain;
  return {
    ...c,
    mastery: {
      ...c.mastery,
      [skill]: {
        weightedCorrect: MASTERY_THRESHOLD_CORRECT - MASTERY_RATE_DUEL,
        correct: 19,
        attempts: 20,
      },
    },
  };
}

function fakeStorage(): { store: KeyValueStore; data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    store: {
      getItem: async (k) => data.get(k) ?? null,
      setItem: async (k, v) => {
        data.set(k, v);
      },
    },
  };
}

let store: CaptainStore;
beforeEach(() => {
  store = createCaptainStore();
  store.getState().setGradeBand('k_1');
});

// ── AC-1 — the coins land on the captain ─────────────────────────────────────────────────────

describe('A-008 the duel pays the captain', () => {
  it('spec(A-008:AC-1) a victory adds exactly the engine coin payout to the captain', () => {
    const { state } = playDuel(8001, win());
    expect(state.phase).toBe('victory');

    const before = store.getState().captain.coins;
    const outcome = applyDuelOutcome(store, state);
    const gained = store.getState().captain.coins - before;

    // Priced by `computeCoinPayout` plus the receipted chest (A-032 re-baseline, see
    // `chestCoinsFor`) — never by this layer's own arithmetic.
    expect(gained).toBe(payoutFor(state, true) + chestCoinsFor(store, state.duelId));
    expect(gained).toBeGreaterThan(0);
    expect(outcome.applied).toBe(true);
    expect(outcome.won).toBe(true);
    // `outcome.coins` is the PURSE channel alone — documented "Chest coins are separate".
    expect(outcome.coins).toBe(payoutFor(state, true));
  });

  it('spec(A-008:AC-1) the purse the victory panel shows is the purse the captain receives', () => {
    const { state } = playDuel(8002, win());
    const before = store.getState().captain.coins;
    applyDuelOutcome(store, state);

    // `VictoryPanel` renders `state.coins` as "+N from the duel" and the chest as its own card.
    // A captain credited a number that isn't the sum of the two lines a child just read off the
    // screen is the worst possible version of this bug. (A-032 re-baseline.)
    expect(store.getState().captain.coins - before).toBe(
      state.coins + chestCoinsFor(store, state.duelId),
    );
  });

  it('spec(A-008:AC-1) perfect shots are paid for, not merely celebrated', () => {
    // 1ms is comfortably inside every cannon's Perfect Shot window.
    const { state } = playDuel(8003, { ...win(), elapsedMsForTurn: () => 1 });
    expect(state.perfects).toBeGreaterThan(0);

    const before = store.getState().captain.coins;
    applyDuelOutcome(store, state);
    // The purse channel isolated from the receipted chest (A-032 re-baseline), so the
    // perfect-shot premium stays a pure `computeCoinPayout` comparison.
    const purseGained =
      store.getState().captain.coins - before - chestCoinsFor(store, state.duelId);

    expect(purseGained).toBe(payoutFor(state, true));
    expect(purseGained).toBeGreaterThan(payoutFor(state, true, 0));
  });

  it('spec(A-008:AC-1) the coins survive a relaunch', async () => {
    const { state } = playDuel(8004, win());
    applyDuelOutcome(store, state);
    const written = store.getState().captain;

    const io = fakeStorage();
    await persist(io.store, written);
    const { captain } = await hydrate(io.store);

    expect(captain.coins).toBe(written.coins);
    expect(captain.coins).toBeGreaterThan(0);
    expect(captain).toEqual(written);
  });

  // ── AC-2 — mastery rises, at the duel rate ─────────────────────────────────────────────────

  it('spec(A-008:AC-2) correct duel answers fill the fired skill at exactly the DUEL rate', () => {
    const { state, tally } = playDuel(8005, win(SWIVEL));
    const expected = tally.add_within_10;
    if (expected === undefined) throw new Error('harness recorded no add_within_10 answers');
    expect(expected.correct).toBeGreaterThan(0);

    applyDuelOutcome(store, state);
    const m = store.getState().captain.mastery.add_within_10;

    expect(m).toBeDefined();
    expect(m?.correct).toBe(expected.correct);
    expect(m?.attempts).toBe(expected.asked);
    // re-baselined 2026-08-02: MASTERY_RATE_DUEL=1 per the 2026-07-30 owner ruling
    // (tuning.ts:189-191). PLAN.md's "half rate" clause is void — the range's edge is its own
    // economics now, not a discount on the duel — so the old "not the range rate" pin is retired.
    // What this spec still owns is EXACTNESS: mastery moves by precisely MASTERY_RATE_DUEL per
    // correct duel answer, so a reward layer that grows its own rate arithmetic still fails here.
    // The parity itself is pinned too, so a silent retune reopens the ruling on purpose, not by
    // drift.
    expect(m?.weightedCorrect).toBeCloseTo(expected.correct * MASTERY_RATE_DUEL, 5);
    expect(MASTERY_RATE_DUEL).toBe(MASTERY_RATE_RANGE);
  });

  it('spec(A-008:AC-2) the reducer tallies answers per skill, so the reward layer knows which meter to fill', () => {
    const { state, tally } = playDuel(8006, {
      cannonForTurn: (turn) => (turn % 2 === 1 ? SWIVEL : CHAIN_SHOT),
      correctOnTurn: () => true,
    });

    // Aggregate `asked`/`right` cannot say WHICH skill was fired. Without a per-skill tally the
    // reward layer has to guess, and the only thing left to guess from is the last cannon held.
    expect(state.skillTally).toEqual(tally);
    const entries = Object.values(state.skillTally).filter((t) => t !== undefined);
    expect(entries.reduce((n, t) => n + t.asked, 0)).toBe(state.asked);
    expect(entries.reduce((n, t) => n + t.correct, 0)).toBe(state.right);
  });

  it('spec(A-008:AC-2) a duel fought with two cannons credits each skill only its own answers', () => {
    const { state, tally } = playDuel(8007, {
      cannonForTurn: (turn) => (turn % 2 === 1 ? SWIVEL : CHAIN_SHOT),
      correctOnTurn: () => true,
    });
    const add = tally.add_within_10;
    const sub = tally.sub_within_20;
    if (add === undefined || sub === undefined) throw new Error('duel did not fire both cannons');

    applyDuelOutcome(store, state);
    const mastery = store.getState().captain.mastery;

    expect(mastery.add_within_10?.correct).toBe(add.correct);
    expect(mastery.add_within_10?.attempts).toBe(add.asked);
    expect(mastery.sub_within_20?.correct).toBe(sub.correct);
    expect(mastery.sub_within_20?.attempts).toBe(sub.asked);
    // A skill that was never fired must not appear at all — no blanket credit to every meter.
    expect(mastery.mult_facts).toBeUndefined();
  });

  // ── AC-3 — the unlock is granted AND announced ─────────────────────────────────────────────

  it('spec(A-008:AC-3) a mastery crossing grants the cannon and reports it so the screen can announce it', () => {
    store.getState().replaceCaptain(captainOneAnswerShortOf('sub_within_20'));
    expect(store.getState().captain.ownedCannons).not.toContain('chain_shot');

    const { state } = playDuel(8008, win(CHAIN_SHOT));
    const outcome = applyDuelOutcome(store, state);

    // Granted...
    expect(store.getState().captain.ownedCannons).toContain('chain_shot');
    // ...and announced. A grant the player is never told about is a reward that did not happen.
    expect(outcome.unlockedCannons).toContain('chain_shot');
  });

  it('spec(A-008:AC-3) a duel that crosses nothing pays no mastery cannon — the win itself advances the voyage', () => {
    const owned = [...store.getState().captain.ownedCannons];
    const { state } = playDuel(8009, win(SWIVEL));
    const outcome = applyDuelOutcome(store, state);

    // re-baselined 2026-08-02 under D-11 (OWNER-RULINGS.md): a frontier win advances the voyage —
    // a WON duel at the frontier island now opens the next band-eligible island and lands its
    // entry cannon inside the same settlement commit, so "a win grants nothing" is void at the
    // frontier. What survives is this spec's real property: a mastery crossing that did not
    // happen still grants nothing. A short duel on a starter skill cannot reach the threshold, so
    // the range cannons on `add_within_10` (`culverin`, `saker`) must not appear — and everything
    // announced is exactly what the voyage advance made: Isla Products and its entry gun.
    expect(store.getState().captain.ownedCannons).toEqual([...owned, 'grapeshot']);
    expect(outcome.unlockedCannons).toEqual(['grapeshot']);
    expect(outcome.unlockedIslands).toEqual(['isla_products']);
    expect(store.getState().captain.ownedCannons).not.toContain('culverin');
    expect(store.getState().captain.ownedCannons).not.toContain('saker');
  });

  // ── AC-4 — wins and rank ───────────────────────────────────────────────────────────────────

  it('spec(A-008:AC-4) a win increments wins and re-derives the rank tier from the engine', () => {
    const { state } = playDuel(8010, win());
    const outcome = applyDuelOutcome(store, state);
    const c = store.getState().captain;

    expect(c.wins).toBe(1);
    expect(c.rankTier).toBe(rankTierForWins(1));
    expect(outcome.rankTier).toBe(c.rankTier);
  });

  it('spec(A-008:AC-4) crossing a rank boundary is reported so the promotion can be announced', () => {
    // One win short of the first promotion, derived from the ladder rather than from a literal.
    const short = firstWinCountAtTier(1) - 1;
    store.getState().replaceCaptain({
      ...store.getState().captain,
      wins: short,
      rankTier: rankTierForWins(short),
    });

    const { state } = playDuel(8011, win());
    const outcome = applyDuelOutcome(store, state);

    expect(store.getState().captain.wins).toBe(short + 1);
    expect(store.getState().captain.rankTier).toBe(rankTierForWins(short + 1));
    expect(store.getState().captain.rankTier).toBeGreaterThan(rankTierForWins(short));
    expect(outcome.rankedUp).toBe(true);
  });

  // ── AC-5 — a loss still pays, never demotes, and hands back a full hull ────────────────────

  it('spec(A-008:AC-5) a loss still pays a purse, and a smaller one than the same duel won', () => {
    const { state } = playDuel(8012, lose());
    expect(state.phase).toBe('defeat');

    const before = store.getState().captain.coins;
    const outcome = applyDuelOutcome(store, state);
    const gained = store.getState().captain.coins - before;

    expect(gained).toBe(payoutFor(state, false));
    // PLAN.md: "losing never drops your rank and still pays a small purse". Both halves matter —
    // a zero purse is the version of this that quietly teaches a child that losing is worthless.
    expect(gained).toBeGreaterThan(0);
    expect(gained).toBeLessThan(payoutFor(state, true));
    expect(outcome.applied).toBe(true);
    expect(outcome.won).toBe(false);
    expect(outcome.coins).toBe(gained);
  });

  it('spec(A-008:AC-5) a loss does not count as a win and never lowers the rank tier', () => {
    const start = firstWinCountAtTier(1);
    store.getState().replaceCaptain({
      ...store.getState().captain,
      wins: start,
      rankTier: rankTierForWins(start),
    });
    const peak = store.getState().captain.rankTier;
    expect(peak).toBeGreaterThan(0);

    const { state } = playDuel(8013, lose());
    const outcome = applyDuelOutcome(store, state);

    expect(store.getState().captain.wins).toBe(start);
    expect(store.getState().captain.rankTier).toBe(peak);
    expect(outcome.rankTier).toBe(peak);
    expect(outcome.rankedUp).toBe(false);
  });

  it('spec(A-008:AC-5) a loss still records the mastery the answers earned', () => {
    const { state, tally } = playDuel(8014, lose(SWIVEL));
    const expected = tally.add_within_10;
    if (expected === undefined) throw new Error('harness recorded no add_within_10 answers');
    expect(expected.correct).toBeGreaterThan(0);
    expect(expected.asked).toBeGreaterThan(expected.correct);

    applyDuelOutcome(store, state);
    const m = store.getState().captain.mastery.add_within_10;

    // Practice counts whether or not the duel was won. Attempts include the wrong answers, or
    // accuracy silently inflates and the mastery gate stops meaning anything.
    expect(m?.correct).toBe(expected.correct);
    expect(m?.attempts).toBe(expected.asked);
    expect(m?.weightedCorrect).toBeCloseTo(expected.correct * MASTERY_RATE_DUEL, 5);
  });

  it('spec(A-008:AC-5) the hull is full again for the next duel', () => {
    const { state } = playDuel(8015, lose());
    expect(state.playerHull).toBe(0);
    applyDuelOutcome(store, state);

    const next = duelReducer(state, { type: 'RESET' });
    expect(next.playerHull).toBe(PLAYER_HULL);
    expect(next.playerHull).toBe(next.playerMax);
    expect(next.rivalHull).toBe(next.rivalMax);
    expect(next.phase).toBe('select');
    // The scoreboard resets too, or the next duel is priced on the last one's answers.
    expect(next.asked).toBe(0);
    expect(next.right).toBe(0);
    expect(next.perfects).toBe(0);
  });

  // ── AC-6 — exactly once ────────────────────────────────────────────────────────────────────

  it('spec(A-008:AC-6) applying the same finished duel twice pays exactly once', () => {
    const { state } = playDuel(8016, win());

    const first = applyDuelOutcome(store, state);
    const afterFirst = store.getState().captain;
    const second = applyDuelOutcome(store, state);
    const afterSecond = store.getState().captain;

    expect(first.applied).toBe(true);
    expect(first.coins).toBeGreaterThan(0);
    expect(second.applied).toBe(false);
    expect(second.coins).toBe(0);
    // Not "roughly the same" — byte-for-byte the same captain. Coins, wins, rank AND mastery.
    expect(afterSecond).toEqual(afterFirst);
    expect(afterSecond.wins).toBe(1);
  });

  it('spec(A-008:AC-6) a re-observed terminal state pays once — identity is the duel, not the object', () => {
    const { state } = playDuel(8017, win());
    applyDuelOutcome(store, state);
    const afterFirst = store.getState().captain;

    // The chest opens on the victory screen. Same duel, new state object, same terminal phase —
    // exactly the shape a re-render hands the effect a second time.
    const reobserved = duelReducer(state, { type: 'OPEN_CHEST' });
    expect(reobserved).not.toBe(state);
    expect(reobserved.phase).toBe('victory');

    const second = applyDuelOutcome(store, reobserved);
    expect(second.applied).toBe(false);
    expect(second.coins).toBe(0);
    expect(store.getState().captain).toEqual(afterFirst);
  });

  it('spec(A-008:AC-6) two different duels are both paid', () => {
    const a = playDuel(8018, win()).state;
    const b = playDuel(8019, win()).state;
    expect(a.duelId).not.toBe(b.duelId);

    const first = applyDuelOutcome(store, a);
    const second = applyDuelOutcome(store, b);

    // The failure mode on the other side of AC-6: a ledger so eager it swallows every duel after
    // the first, and the loop silently stops paying.
    expect(first.applied).toBe(true);
    expect(second.applied).toBe(true);
    expect(store.getState().captain.wins).toBe(2);
    // Each win commits its own receipted chest alongside its purse (A-032 re-baseline).
    expect(store.getState().captain.coins).toBe(
      first.coins + second.coins + chestCoinsFor(store, a.duelId) + chestCoinsFor(store, b.duelId),
    );
  });

  it('spec(A-008:AC-6) a duel still in progress pays nothing, and still pays when it finishes', () => {
    const midDuel = duelReducer(initialDuelState(8020), { type: 'PICK_CANNON', cannon: SWIVEL });
    expect(midDuel.phase).toBe('question');

    const early = applyDuelOutcome(store, midDuel);
    expect(early.applied).toBe(false);
    expect(early.coins).toBe(0);
    expect(store.getState().captain.coins).toBe(0);
    expect(store.getState().captain.wins).toBe(0);
    expect(store.getState().captain.mastery).toEqual({});

    // ...and the early call must not have consumed the duel's one payment.
    const { state } = playDuel(8020, win());
    expect(state.duelId).toBe(midDuel.duelId);
    const settled = applyDuelOutcome(store, state);
    expect(settled.applied).toBe(true);
    // Purse plus the receipted chest, in the one late settlement (A-032 re-baseline).
    expect(store.getState().captain.coins).toBe(
      settled.coins + chestCoinsFor(store, state.duelId),
    );
    expect(store.getState().captain.wins).toBe(1);
  });

  it('spec(A-008:AC-6) a duel carries an id that survives its transitions and is fresh after RESET', () => {
    const start = initialDuelState(8021);
    expect(typeof start.duelId).toBe('string');
    expect(start.duelId.length).toBeGreaterThan(0);

    // The reducer is pure — no clock, no uuid — so the id is a function of the seed. That makes
    // handing `initialDuelState` a fresh seed per duel the SCREEN's job.
    expect(initialDuelState(8021).duelId).toBe(start.duelId);
    expect(initialDuelState(8022).duelId).not.toBe(start.duelId);

    const mid = duelReducer(start, { type: 'PICK_CANNON', cannon: SWIVEL });
    expect(mid.duelId).toBe(start.duelId);

    const { state } = playDuel(8021, win());
    expect(state.duelId).toBe(start.duelId);

    // "Fight again" is a NEW duel and must be paid for on its own.
    const again = duelReducer(state, { type: 'RESET' });
    expect(again.duelId).not.toBe(state.duelId);
  });

  it('spec(A-008:AC-6) settlement is remembered per captain, not globally', () => {
    const { state } = playDuel(8023, win());
    const paid = applyDuelOutcome(store, state);
    expect(paid.applied).toBe(true);

    // A second captain has never been paid for this duel. A module-level ledger keyed only by
    // duel id would rob them — and would make this suite order-dependent besides.
    const other = createCaptainStore();
    other.getState().setGradeBand('k_1');
    const outcome = applyDuelOutcome(other, state);

    expect(outcome.applied).toBe(true);
    // The same duel on a fresh captain rolls the same seeded chest — deterministic by duelId —
    // so the second captain's total matches purse + chest exactly (A-032 re-baseline).
    expect(other.getState().captain.coins).toBe(
      paid.coins + chestCoinsFor(other, state.duelId),
    );
    expect(other.getState().captain.wins).toBe(1);
  });
});

/** The smallest win count that reaches `tier`, read off the ladder rather than written down. */
function firstWinCountAtTier(tier: number): number {
  for (let wins = 0; wins <= 1000; wins += 1) {
    if (rankTierForWins(wins) >= tier) return wins;
  }
  throw new Error(`no win count reaches rank tier ${tier}`);
}

describe('A-008 the rival hull never counts upward', () => {
  it('spec(A-008:AC-7) a killing blow shows the hull it had, never the damage that killed it', async () => {
    const { projectRivalHullForTest } = await import('../../src/stores/duel');
    if (projectRivalHullForTest === undefined) return;

    // Reported from a real duel at Isla Products: a rival on 2 hull "jumped to 16 before going to
    // 0". The old projection rebuilt the pre-shot hull as `enemyHull + damage`, which is only true
    // while the shot is survivable — the engine clamps `enemyHull` at zero, so an overkill rebuilt
    // as `0 + 16` and the HUD counted UP on the killing blow.
    const lethal = projectRivalHullForTest({
      enemyHull: 0,
      phase: 'fly',
      damageToEnemy: 16,
      previousRivalHull: 2,
    });
    expect(lethal, 'the hull invented a value it never had').toBe(2);
    expect(lethal).toBeLessThanOrEqual(2);

    // A survivable hit still holds the pre-shot value, which is the whole point of the beat: the
    // blocks come off on impact, not on launch.
    expect(
      projectRivalHullForTest({ enemyHull: 30, phase: 'fly', damageToEnemy: 15, previousRivalHull: 45 }),
    ).toBe(45);

    // And once the ball lands, the truth wins.
    expect(
      projectRivalHullForTest({ enemyHull: 30, phase: 'impact', damageToEnemy: 15, previousRivalHull: 45 }),
    ).toBe(30);
  });
});
