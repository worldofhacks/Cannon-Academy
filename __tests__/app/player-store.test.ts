/**
 * A-001 — the captain store.
 *
 * Written before the implementation. These assert behaviour, not shape: the store's job is to be
 * the one place a captain exists, and every rule it enforces is a rule the game would otherwise
 * lose between screens.
 *
 * The store is pure TypeScript over engine functions, so it runs headless here with no component
 * harness — which is exactly why the spine was ticketed as logic rather than as screens.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { emptyMastery } from '../../src/engine/mastery';
import { MASTERY_MIN_ACCURACY, MASTERY_RATE_DUEL, MASTERY_THRESHOLD_CORRECT } from '../../src/engine/tuning';
import { createCaptainStore, emptyCaptain, type CaptainStore } from '../../src/stores/player';

let store: CaptainStore;
beforeEach(() => {
  store = createCaptainStore();
});

describe('A-001 captain store', () => {
  it('spec(A-001:AC-1) a fresh captain has every field well-formed, never undefined', () => {
    const c = store.getState().captain;
    // Enumerated deliberately: a missing key here becomes `undefined` on a screen three
    // navigations away, which is the hardest class of bug to trace back to its origin.
    expect(c.gradeBand).toBeNull();
    expect(c.name).toBe('');
    expect(c.flag).toBeNull();
    expect(c.coins).toBe(0);
    expect(c.mastery).toEqual({});
    expect(c.ownedCannons).toEqual([]);
    expect(c.equippedCannons).toEqual([]);
    expect(c.unlockedIslands).toEqual([]);
    expect(c.rankTier).toBe(0);
    expect(c.wins).toBe(0);
    expect(c.currentIsland).toBeNull();
    expect(c.hasCompletedOnboarding).toBe(false);
    expect(c.hasFoughtGuidedDuel).toBe(false);
    for (const [key, value] of Object.entries(c)) {
      expect(value, `${key} is undefined`).not.toBeUndefined();
    }
  });

  it('spec(A-001:AC-2) coins can never go negative through any exposed action', () => {
    store.getState().addCoins(10);
    store.getState().spendCoins(25);
    expect(store.getState().captain.coins).toBe(10); // refused, not clamped to a negative
    store.getState().addCoins(-999);
    expect(store.getState().captain.coins).toBeGreaterThanOrEqual(0);
  });

  it('spec(A-001:AC-3) duel answers fill mastery at the duel rate, taken from the engine', () => {
    store.getState().recordDuelAnswers('add_within_10', { correct: 4, asked: 4 });
    // `mastery` holds the engine's SkillMastery record, not a bare number — the store stores what
    // the engine models and never flattens it, or accuracy becomes unrecoverable.
    const m = store.getState().captain.mastery.add_within_10;
    expect(m).toBeDefined();
    // The store must not compute its own rate — 4 correct at the duel rate, not 4 raw.
    expect(m?.weightedCorrect).toBeCloseTo(4 * MASTERY_RATE_DUEL, 5);
    expect(m?.correct).toBe(4);
    expect(m?.attempts).toBe(4);
  });

  it('spec(A-001:AC-4) crossing the threshold grants the unlock exactly once', () => {
    const enough = Math.ceil(MASTERY_THRESHOLD_CORRECT / MASTERY_RATE_DUEL);
    store.getState().setGradeBand('k_1');
    const before = store.getState().captain.ownedCannons.length;

    store.getState().recordDuelAnswers('add_within_10', { correct: enough, asked: enough });
    const afterFirst = store.getState().captain.ownedCannons;
    expect(afterFirst.length).toBeGreaterThanOrEqual(before);

    // Re-crossing must be a no-op. Without this, every subsequent duel re-grants the same cannon
    // and `ownedCannons` grows without bound.
    store.getState().recordDuelAnswers('add_within_10', { correct: enough, asked: enough });
    expect(store.getState().captain.ownedCannons).toEqual(afterFirst);
    expect(new Set(afterFirst).size).toBe(afterFirst.length);
  });

  it('spec(A-001:AC-4) accuracy below the floor does not unlock, however many answers', () => {
    const many = MASTERY_THRESHOLD_CORRECT * 10;
    const asked = Math.ceil(many / (MASTERY_MIN_ACCURACY - 0.2));
    store.getState().setGradeBand('k_1');
    const before = [...store.getState().captain.ownedCannons];
    store.getState().recordDuelAnswers('add_within_10', { correct: many, asked });
    expect(store.getState().captain.ownedCannons).toEqual(before);
  });

  it('spec(A-001:AC-5) a win increments wins and re-derives rank from the engine', () => {
    const startTier = store.getState().captain.rankTier;
    for (let i = 0; i < 12; i += 1) store.getState().recordDuelResult({ won: true });
    expect(store.getState().captain.wins).toBe(12);
    expect(store.getState().captain.rankTier).toBeGreaterThan(startTier);
  });

  it('spec(A-001:AC-6) a loss never decreases rank', () => {
    for (let i = 0; i < 12; i += 1) store.getState().recordDuelResult({ won: true });
    const peak = store.getState().captain.rankTier;
    for (let i = 0; i < 20; i += 1) store.getState().recordDuelResult({ won: false });
    expect(store.getState().captain.rankTier).toBe(peak);
    expect(store.getState().captain.wins).toBe(12);
  });

  it('spec(A-001:AC-5) placement writes starters and islands, per ruling D-6', () => {
    store.getState().setGradeBand('k_1');
    const c = store.getState().captain;
    expect(c.gradeBand).toBe('k_1');
    expect(c.ownedCannons.length).toBeGreaterThan(0);
    expect(c.unlockedIslands.length).toBeGreaterThan(0);
    // Equipping happens from what is owned; it can never exceed it.
    expect(c.equippedCannons.every((id) => c.ownedCannons.includes(id))).toBe(true);
  });

  it('spec(A-001:AC-7) the module imports nothing from app/ or src/components/', async () => {
    const src = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../../src/stores/player.ts', import.meta.url), 'utf8'),
    );
    expect(src).not.toMatch(/from '\.\.\/\.\.\/app\//);
    expect(src).not.toMatch(/from '\.\.\/components\//);
  });

  it('spec(A-001:AC-1) emptyCaptain is a fresh object each call, not a shared reference', () => {
    const a = emptyCaptain();
    const b = emptyCaptain();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    a.mastery.add_within_10 = { ...emptyMastery, correct: 5 };
    // A shared nested object would leak one captain's progress into the next fresh install.
    expect(b.mastery.add_within_10).toBeUndefined();
  });
});
