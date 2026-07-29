/**
 * A-017 — timeout and misfire: what a burned fuse costs, said out loud.
 *
 * RETROSPECTIVE, AND DELIBERATELY RED-FIRST IN THE CLASSIC SENSE. The owner ruled on 2026-07-29
 * (D-8, `tickets/app/OWNER-RULINGS.md`): **a timeout counts against nothing** — neither `asked`
 * nor `correct`, in the aggregate counters and the per-skill tally alike. The shipped reducer at
 * this commit implements the PRE-ruling behaviour (`TIMEOUT` does `asked: s.asked + 1` and
 * `tallyAnswer(..., false)`), so every test below marked (D-8) FAILS against today's code — that
 * is the ticket's own DoD-5 posture: a first-run failure here is a defect in shipped code, not in
 * the suite. AC-2, AC-3, AC-4 and AC-6 describe shipped behaviour the ruling did not touch and
 * are green today.
 *
 * Traps these tests close:
 *
 *  1. **The half-fix, in either direction.** An implementation that excludes the timeout from the
 *     aggregate but still charges the per-skill tally — or vice versa — must die. AC-1 pins the
 *     aggregate on its own, AC-5 pins the tally on its own, and AC-6's property pins their SUM
 *     invariant, so each half is caught separately and their agreement is caught as a third thing.
 *  2. **"Unchanged" passed by resetting.** The mid-duel AC-1/AC-5 fixtures time out AFTER a real
 *     answered turn, so the counters are non-zero and `asked: 0` cannot fake "unchanged".
 *  3. **Recoil leaking through the timeout path.** AC-2's fixture is a volatile gun with real
 *     `recoilDamage`, and the suite proves in the same breath that a WRONG ANSWER on that gun does
 *     bite the deck — so a lazy implementation that routes a timeout through the misfire path is
 *     visible, and the hull assertions are known to have teeth.
 *  4. **A one-phase guard.** AC-4 sweeps `TIMEOUT` against EVERY non-`question` phase (with a
 *     compile-time proof the sweep is total) and asserts object identity, not just equality.
 *  5. **Numbers from their real homes.** The hold comes from `PHASE_DURATION_MS`, hull deltas from
 *     the cannon's own catalog fields, `elapsedMs` is data derived from the gun's own `timerMs`,
 *     and the only randomness is the engine's seeded `Rng`. No `Math.random()`, no `Date`.
 *
 * `resolveCopy` / `correctionText` live module-private in `app/duel.tsx`, which imports
 * `react-native` and cannot be parsed by the node runner — so AC-3's substitution is pinned at the
 * reducer level: the `timeout` state must carry everything the correction panel needs (the expired
 * question, its answer among the choices, and the `?` slot the answer substitutes into).
 */
import { describe, expect, it } from 'vitest';

import { cannons } from '@content/index';
import type { Cannon } from '@content/schemas';
import { createRng, nextInt } from '@engine/rng';

import {
  duelReducer,
  initialDuelState,
  PHASE_DURATION_MS,
  type DuelPhase,
  type DuelState,
} from '../../src/stores/duel';

// ── Fixtures, derived from the catalog ───────────────────────────────────────────────────────

function mustFind(predicate: (c: Cannon) => boolean, why: string): Cannon {
  const hit = cannons.find(predicate);
  if (hit === undefined) throw new Error(`catalog fixture missing: ${why}`);
  return hit;
}

/** A gun that never bites its own deck — the plain case. */
const plainGun = mustFind((c) => c.temperament !== 'volatile', 'a non-volatile cannon');

/**
 * A volatile gun with real recoil — the only fixture that can tell a timeout from a wrong answer
 * by hull movement alone (AC-2). If every volatile gun carried `recoilDamage: 0`, the hull
 * assertions would be vacuously green; `mustFind` makes that a loud failure instead.
 */
const volatileGun = mustFind(
  (c) => c.temperament === 'volatile' && c.recoilDamage > 0,
  'a volatile cannon with recoilDamage > 0',
);

/** One cannon per distinct skill, so the tally has several entries whose sum means something. */
function distinctSkillCannons(count: number): readonly Cannon[] {
  const seen = new Set<string>();
  const picked: Cannon[] = [];
  for (const c of cannons) {
    if (seen.has(c.skill)) continue;
    seen.add(c.skill);
    picked.push(c);
    if (picked.length === count) break;
  }
  if (picked.length !== count) throw new Error(`catalog has fewer than ${count} distinct skills`);
  return picked;
}

/** Fixed and arbitrary — the reducer is pure, so any seed replays exactly. */
const SEED = 20260729;

// ── Harness — the real reducer, driven the way the screen drives it ─────────────────────────

const advance = (s: DuelState): DuelState => duelReducer(s, { type: 'ADVANCE' });
const timeoutNow = (s: DuelState): DuelState => duelReducer(s, { type: 'TIMEOUT' });
const pick = (s: DuelState, cannon: Cannon): DuelState => duelReducer(s, { type: 'PICK_CANNON', cannon });

function atQuestion(cannon: Cannon, seed: number = SEED): DuelState {
  return pick(initialDuelState(seed), cannon);
}

/** Answers at the full fuse — `elapsedMs` is data, derived from the gun's own timer. */
function answer(s: DuelState, value: number): DuelState {
  if (s.cannon === null) throw new Error('answer: no cannon in flight');
  return duelReducer(s, { type: 'ANSWER', value, elapsedMs: s.cannon.timerMs });
}

/** A value guaranteed wrong for the question in flight — derived, never guessed. */
function wrongValue(s: DuelState): number {
  if (s.question === null) throw new Error('wrongValue: no question in flight');
  return s.question.answer + 1;
}

/** Advances until the tray (or a terminal screen) — how the screen plays a resolve out. */
function runToSelect(s: DuelState): DuelState {
  let cur = s;
  for (let i = 0; i < 12; i++) {
    if (cur.phase === 'select' || cur.phase === 'victory' || cur.phase === 'defeat') return cur;
    cur = advance(cur);
  }
  throw new Error(`runToSelect: still in '${cur.phase}' after 12 advances`);
}

const sumAsked = (t: DuelState['skillTally']): number =>
  Object.values(t).reduce((sum, e) => sum + (e?.asked ?? 0), 0);
const sumCorrect = (t: DuelState['skillTally']): number =>
  Object.values(t).reduce((sum, e) => sum + (e?.correct ?? 0), 0);

// ── The phase sweep, with a compile-time proof it is total ──────────────────────────────────

const ALL_PHASES = [
  'select',
  'question',
  'perfect',
  'fly',
  'impact',
  'miss',
  'timeout',
  'watch',
  'rivalFly',
  'rivalImpact',
  'victory',
  'defeat',
] as const satisfies readonly DuelPhase[];

/** `never` unless `ALL_PHASES` covers the whole union — a new phase fails `tsc`, not silence. */
type PhaseSweepIsTotal = Exclude<DuelPhase, (typeof ALL_PHASES)[number]> extends never ? true : never;

/** Reads a source file as text. The A-001 AC-7 pattern: some rules are only visible in the source. */
async function readSource(relative: string): Promise<string> {
  const fs = await import('node:fs/promises');
  return fs.readFile(new URL(relative, import.meta.url), 'utf8');
}

describe('A-017 timeout and misfire', () => {
  // ── AC-1 — the fuse expires: phase `timeout`, nothing picked, nothing charged (D-8) ─────────

  it("spec(A-017:AC-1) the fuse expiring in 'question' moves to 'timeout' with nothing picked", () => {
    const before = atQuestion(plainGun);
    const after = timeoutNow(before);

    expect(after.phase).toBe('timeout');
    expect(after.picked).toBeNull();
  });

  it('spec(A-017:AC-1) a burned fuse is not an attempt — asked and right are both unchanged (D-8)', () => {
    const before = atQuestion(plainGun);
    const after = timeoutNow(before);

    // RED against the pre-D-8 reducer, which counts `asked + 1` here. The turn is the whole
    // cost of a timeout, and AC-4 is where that cost is paid.
    expect(after.asked).toBe(before.asked);
    expect(after.right).toBe(before.right);
  });

  it('spec(A-017:AC-1) mid-duel, a timeout leaves the scoreboard exactly where the answers put it (D-8)', () => {
    // One real answered turn first, so the counters are non-zero and "unchanged" cannot be
    // faked by an implementation that resets them.
    let s = atQuestion(plainGun);
    s = answer(s, s.question!.answer);
    s = runToSelect(s);
    expect(s.phase).toBe('select');

    const before = pick(s, plainGun);
    expect(before.asked).toBeGreaterThan(0);

    const after = timeoutNow(before);
    expect({ asked: after.asked, right: after.right }).toEqual({
      asked: before.asked,
      right: before.right,
    });
  });

  // ── AC-2 — no hull moves: the gun never fired, so there is no recoil and no damage ──────────

  it('spec(A-017:AC-2) a timeout moves neither hull, even on a gun whose misses bite the deck', () => {
    const before = atQuestion(volatileGun);
    const after = timeoutNow(before);

    expect(after.playerHull).toBe(before.playerHull);
    expect(after.rivalHull).toBe(before.rivalHull);

    // And through the hold's end: resolving the timeout still moves nothing.
    const resolved = advance(after);
    expect(resolved.phase).toBe('watch');
    expect(resolved.playerHull).toBe(before.playerHull);
    expect(resolved.rivalHull).toBe(before.rivalHull);
  });

  it('spec(A-017:AC-2) the distinction the phase exists for: the same gun answered WRONG does recoil', () => {
    // The teeth of the test above: this fixture CAN move a hull, so "unchanged" is a finding,
    // not an accident of a gun that never recoils.
    const before = atQuestion(volatileGun);
    expect(volatileGun.recoilDamage).toBeGreaterThan(0);

    const missed = answer(before, wrongValue(before));
    expect(missed.phase).toBe('miss');
    expect(missed.playerHull).toBe(before.playerHull - volatileGun.recoilDamage);
    expect(missed.rivalHull).toBe(before.rivalHull);
  });

  // ── AC-3 — the hold and the teaching moment ─────────────────────────────────────────────────

  it('spec(A-017:AC-3) the timeout hold comes from PHASE_DURATION_MS and is among the longest', () => {
    const hold = PHASE_DURATION_MS.timeout;
    expect(hold).toBeDefined();
    expect(Number.isFinite(hold)).toBe(true);
    expect(hold!).toBeGreaterThan(0);

    // "The reason both holds are the longest in the machine": the timeout hold carries the
    // correction, so no other phase may out-hold it.
    for (const [phase, ms] of Object.entries(PHASE_DURATION_MS)) {
      expect(hold!, `timeout hold must be >= '${phase}'`).toBeGreaterThanOrEqual(ms);
    }
  });

  it('spec(A-017:AC-3) the timeout phase carries the expired question, answer intact, for the panel', () => {
    const before = atQuestion(plainGun);
    const inFlight = before.question!;

    const after = timeoutNow(before);

    // The SAME question — a redraw would correct a question the child never saw.
    expect(after.question).toEqual(inFlight);
    // Everything `correctionText` needs is on the state: the value the panel substitutes in,
    // present among the choices, and the `?` slot it substitutes into.
    expect(after.question!.choices).toContain(after.question!.answer);
    expect(after.question!.text).toContain('?');
  });

  // ── AC-4 — the turn is the whole cost, paid exactly once; TIMEOUT anywhere else is a no-op ──

  it('spec(A-017:AC-4) a non-sinking timeout hands the turn to the rival exactly once, then the duel continues', () => {
    const before = atQuestion(plainGun);

    const t = timeoutNow(before);
    expect(t.phase).toBe('timeout');

    // Step by step, so "exactly once" is pinned by the phase sequence itself.
    const watch = advance(t);
    expect(watch.phase).toBe('watch');
    const rivalFly = advance(watch);
    expect(rivalFly.phase).toBe('rivalFly');
    const rivalImpact = advance(rivalFly);
    expect(rivalImpact.phase).toBe('rivalImpact');

    // One rival volley is the entire hull movement of the exchange.
    expect(rivalImpact.rivalDamage).toBeGreaterThan(0);
    expect(rivalImpact.playerHull).toBe(before.playerHull - rivalImpact.rivalDamage);
    expect(rivalImpact.rivalHull).toBe(before.rivalHull);

    const next = advance(rivalImpact);
    expect(next.phase).toBe('select');
    expect(next.turn).toBe(before.turn + 1);
    expect(next.cannon).toBeNull();
    expect(next.question).toBeNull();
    expect(next.picked).toBeNull();
  });

  it("spec(A-017:AC-4) TIMEOUT from every phase but 'question' returns the state object unchanged", () => {
    const sweepIsTotal: PhaseSweepIsTotal = true;
    expect(sweepIsTotal).toBe(true);

    const base = atQuestion(plainGun);
    for (const phase of ALL_PHASES) {
      if (phase === 'question') continue;
      const st: DuelState = { ...base, phase };
      // Identity, not equality: the reducer must return the state it was handed, so a stray
      // re-render dispatching TIMEOUT during a resolve cannot charge or re-charge anything.
      expect(timeoutNow(st), `TIMEOUT in '${phase}' must be a no-op`).toBe(st);
    }

    // The two genuinely reachable no-op cases, not just synthetic ones:
    const fresh = initialDuelState(SEED); // 'select', nothing picked
    expect(timeoutNow(fresh)).toBe(fresh);
    const alreadyOut = timeoutNow(base); // a second TIMEOUT racing the first
    expect(timeoutNow(alreadyOut)).toBe(alreadyOut);
  });

  it('spec(A-017:AC-4) TIMEOUT with no cannon picked returns the state object unchanged', () => {
    const base = atQuestion(plainGun);
    const noCannon: DuelState = { ...base, cannon: null };
    expect(timeoutNow(noCannon)).toBe(noCannon);
  });

  // ── AC-5 — the per-skill tally is untouched: a timeout can never delay an unlock (D-8) ──────

  it("spec(A-017:AC-5) a timeout leaves the skill's tally entry unchanged in both fields (D-8)", () => {
    // Establish a real entry first — one correct answer — so the entry exists and its accuracy
    // is measurable before and after.
    let s = atQuestion(plainGun);
    s = answer(s, s.question!.answer);
    s = runToSelect(s);
    const before = pick(s, plainGun);

    const entryBefore = before.skillTally[plainGun.skill];
    expect(entryBefore).toEqual({ correct: 1, asked: 1 });

    // RED against the pre-D-8 reducer, which tallies the timeout as an incorrect attempt
    // (`asked` rises to 2, accuracy falls to 0.5, and the meter can refuse the cannon).
    const after = timeoutNow(before);
    expect(after.skillTally[plainGun.skill]).toEqual(entryBefore);
  });

  it('spec(A-017:AC-5) a timeout on a never-fired skill charges its meter nothing (D-8)', () => {
    const before = atQuestion(plainGun);
    expect(before.skillTally[plainGun.skill]).toBeUndefined();

    const after = timeoutNow(before);
    const entry = after.skillTally[plainGun.skill];
    // Absent, or present with both fields at zero — either way nothing was charged. The
    // pre-D-8 reducer writes `{ correct: 0, asked: 1 }` here, which is an accuracy of 0.
    expect(entry?.asked ?? 0).toBe(0);
    expect(entry?.correct ?? 0).toBe(0);
  });

  it('spec(A-017:AC-5) any number of timeouts alone leaves the whole tally — and the scoreboard — empty (D-8)', () => {
    let s = initialDuelState(SEED);
    let burned = 0;
    for (let turn = 0; turn < 3; turn++) {
      if (s.phase !== 'select') break; // the rival keeps firing; a late defeat must not mask the point
      s = pick(s, plainGun);
      s = timeoutNow(s);
      s = runToSelect(s);
      burned += 1;
    }

    expect(burned).toBeGreaterThan(0);
    expect(s.skillTally).toEqual({});
    expect(s.asked).toBe(0);
    expect(s.right).toBe(0);
  });

  // ── AC-6 — whatever the ruling, the scoreboard and the meter count the same events ──────────

  it('spec(A-017:AC-6) property: per-skill tallies always sum to the aggregate, across mixed logs at fixed seeds', () => {
    // Written against the INVARIANT, not either regime: pre-D-8 a timeout charges both ledgers,
    // post-D-8 it charges neither — the sums agree either way, and only a half-fix breaks them.
    const armory = distinctSkillCannons(3);
    const seeds = [11, 22, 33, 44, 55, 66, 77, 88, 99, 110];

    let timeouts = 0;
    let rights = 0;
    let wrongs = 0;

    for (const seed of seeds) {
      let s = initialDuelState(seed);
      // The action script draws from its own seeded stream — `Math.random()` never appears.
      let dice = createRng(seed + seeds.length);

      for (let step = 0; step < 60; step++) {
        if (s.phase === 'victory' || s.phase === 'defeat') break;

        if (s.phase === 'select') {
          const [i, d] = nextInt(dice, 0, armory.length - 1);
          dice = d;
          s = pick(s, armory[i]!);
        } else if (s.phase === 'question') {
          const [move, d] = nextInt(dice, 0, 2);
          dice = d;
          if (move === 0) {
            timeouts += 1;
            s = timeoutNow(s);
          } else {
            const value = move === 1 ? s.question!.answer : wrongValue(s);
            if (move === 1) rights += 1;
            else wrongs += 1;
            // `elapsedMs` swept across the gun's own fuse — a data dimension, not a literal.
            const [elapsedMs, d2] = nextInt(dice, 0, s.cannon!.timerMs);
            dice = d2;
            s = duelReducer(s, { type: 'ANSWER', value, elapsedMs });
          }
        } else {
          s = advance(s);
        }

        // After EVERY action, not just at the end: a transient split is still a split.
        const ctx = `seed ${seed}, step ${step}, phase '${s.phase}'`;
        expect(sumAsked(s.skillTally), `${ctx}: per-skill asked must sum to aggregate asked`).toBe(s.asked);
        expect(sumCorrect(s.skillTally), `${ctx}: per-skill correct must sum to aggregate right`).toBe(
          s.right,
        );
      }
    }

    // The property is only worth its name if the logs actually mixed all three moves.
    expect(timeouts).toBeGreaterThan(0);
    expect(rights).toBeGreaterThan(0);
    expect(wrongs).toBeGreaterThan(0);
  });

  // ── Definition of Done ──────────────────────────────────────────────────────────────────────

  it('dod(A-017:1) every acceptance criterion in the ticket is cited by a test in this file', async () => {
    const ticket = await readSource('../../tickets/app/A-017.md');
    const suite = await readSource('./duel-timeout.test.ts');
    const acs = new Set([...ticket.matchAll(/\*\*(AC-\d+)\*\*/g)].map((m) => m[1]!));

    expect(acs.size).toBeGreaterThan(0);
    for (const ac of acs) {
      expect(suite, `${ac} has no test in duel-timeout.test.ts`).toContain(`spec(A-017:${ac})`);
    }
  });
});
