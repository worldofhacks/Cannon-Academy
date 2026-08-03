/**
 * A-002 — persistence.
 * A-041 — durable captain migration (mercy + reward receipts).
 *
 * The failure this exists to prevent is silent: an ungated redirect fires against empty state, a
 * returning captain is shown onboarding, and their progress looks erased. The README lists it
 * under traps already identified.
 *
 * Storage is injected rather than imported so this runs headless — AsyncStorage is a React Native
 * module and RN's entry point is Flow-typed, which the node runner cannot parse.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  duelReceiptKey,
  purchaseReceiptKey,
  type ChestReceipt,
} from '../../src/contracts/rewards';
import { emptyMercyState } from '../../src/engine/opponents/mercy';
import { createCaptainStore, emptyCaptain, type Captain } from '../../src/stores/player';
import {
  hydrate,
  persist,
  SCHEMA_VERSION,
  STORAGE_KEY,
  type KeyValueStore,
} from '../../src/services/persistence';

/** Pre-A-041 captain payload (schema v1) — no mercy/receipts fields. */
function preTicketCaptain(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    gradeBand: 'k_1',
    name: 'Ada',
    flag: 'flag-3',
    coins: 42,
    mastery: {},
    ownedCannons: ['swivel_gun'],
    equippedCannons: ['swivel_gun'],
    seenCannons: ['swivel_gun'],
    unlockedIslands: ['port_sumwich'],
    rankTier: 1,
    wins: 3,
    currentIsland: 'port_sumwich',
    hasCompletedOnboarding: true,
    hasFoughtGuidedDuel: true,
    ...over,
  };
}

function duelReceipt(): ChestReceipt {
  const key = duelReceiptKey('match-7');
  return {
    key,
    source: 'duel',
    seed: 123456789,
    rarity: 'common',
    coinFallback: 17,
    grant: { kind: 'coins', amount: 17 },
  };
}

function purchaseReceipt(): ChestReceipt {
  const key = purchaseReceiptKey(0);
  return {
    key,
    source: 'purchase',
    seed: 987654321,
    rarity: 'rare',
    coinFallback: 80,
    grant: { kind: 'cannon', cannonId: 'nine_pounder' },
  };
}

/** An in-memory stand-in for AsyncStorage, with a switch for making writes fail. */
function fakeStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  let failWrites = false;
  const store: KeyValueStore = {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      if (failWrites) throw new Error('quota exceeded');
      data.set(k, v);
    },
  };
  return { store, data, breakWrites: () => (failWrites = true) };
}

let io: ReturnType<typeof fakeStorage>;
beforeEach(() => {
  io = fakeStorage();
});

describe('A-002 persistence', () => {
  it('spec(A-002:AC-1) every field round-trips exactly', async () => {
    const store = createCaptainStore();
    store.getState().setGradeBand('k_1');
    store.getState().setNameAndFlag('Ada', 'flag-3');
    store.getState().addCoins(42);
    store.getState().recordDuelResult({ won: true });
    const written = store.getState().captain;

    await persist(io.store, written);
    const result = await hydrate(io.store);

    expect(result.captain).toEqual(written);
    expect(result.recovered).toBe(false);
  });

  it('spec(A-002:AC-2) no stored data hydrates to the empty captain and does not throw', async () => {
    const result = await hydrate(io.store);
    expect(result.captain).toEqual(emptyCaptain());
    expect(result.recovered).toBe(false);
  });

  it('spec(A-002:AC-3) a truncated payload recovers to the empty captain and reports it', async () => {
    io.data.set(STORAGE_KEY, '{"version":1,"captain":{"coins":4');
    const result = await hydrate(io.store);
    // A child must never be locked out of the app by a bad write.
    expect(result.captain).toEqual(emptyCaptain());
    expect(result.recovered).toBe(true);
  });

  it('spec(A-002:AC-3) a well-formed payload of the wrong SHAPE also recovers', async () => {
    io.data.set(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, captain: { coins: 'lots' } }));
    const result = await hydrate(io.store);
    expect(result.captain).toEqual(emptyCaptain());
    expect(result.recovered).toBe(true);
  });

  it('spec(A-002:AC-4) an unsupported schema version is discarded explicitly, never half-applied', async () => {
    // Schema v1 is migrated by A-041; unsupported versions (e.g. 0) still discard.
    io.data.set(
      STORAGE_KEY,
      JSON.stringify({ version: 0, captain: { ...emptyCaptain(), coins: 99 } }),
    );
    const result = await hydrate(io.store);
    expect(result.captain.coins).toBe(0);
    expect(result.migrated).toBe(true);
  });

  it('spec(A-002:AC-4) a schema version is written alongside the payload from the first release', async () => {
    await persist(io.store, emptyCaptain());
    const raw = JSON.parse(io.data.get(STORAGE_KEY) ?? '{}');
    expect(raw.version).toBe(SCHEMA_VERSION);
  });

  it('spec(A-002:AC-6) a failed write leaves the in-memory captain untouched', async () => {
    io.breakWrites();
    const captain = { ...emptyCaptain(), coins: 7 };
    await expect(persist(io.store, captain)).resolves.toBe(false);
    expect(captain.coins).toBe(7);
  });
});

describe('A-041 durable captain persistence', () => {
  it('spec(A-041:AC-2) a pre-ticket v1 Captain rehydrates retaining prior fields with safe defaults', async () => {
    const prior = preTicketCaptain();
    io.data.set(STORAGE_KEY, JSON.stringify({ version: 1, captain: prior }));

    const first = await hydrate(io.store);
    expect(first.migrated).toBe(true);
    expect(first.recovered).toBe(false);
    expect(first.captain.coins).toBe(42);
    expect(first.captain.name).toBe('Ada');
    expect(first.captain.ownedCannons).toEqual(['swivel_gun']);
    expect(first.captain.seenCannons).toEqual(['swivel_gun']);
    expect(first.captain.hasCompletedOnboarding).toBe(true);
    expect(first.captain.mercyState).toEqual(emptyMercyState);
    expect(first.captain.rewardReceipts).toEqual({});
    expect(first.captain.nextPurchaseSequence).toBe(0);

    // Second rehydrate from the same raw payload is byte-equivalent.
    const second = await hydrate(io.store);
    expect(second.captain).toEqual(first.captain);
    expect(JSON.stringify(second.captain)).toBe(JSON.stringify(first.captain));
  });

  it('spec(A-041:AC-3) shape-valid duel and purchase receipts round-trip exactly across relaunch', async () => {
    const duel = duelReceipt();
    const purchase = purchaseReceipt();
    const written: Captain = {
      ...emptyCaptain(),
      coins: 50,
      mercyState: {
        recentPlayerCorrect: [false, true],
        consecutiveLosses: 2,
        forcedMisfiresRemaining: 1,
      },
      rewardReceipts: {
        [duel.key]: duel,
        [purchase.key]: purchase,
      },
      nextPurchaseSequence: 1,
    };

    await persist(io.store, written);
    const result = await hydrate(io.store);

    expect(result.recovered).toBe(false);
    expect(result.captain.rewardReceipts[duel.key]).toEqual(duel);
    expect(result.captain.rewardReceipts[purchase.key]).toEqual(purchase);
    expect(result.captain.mercyState).toEqual(written.mercyState);
    expect(result.captain.nextPurchaseSequence).toBe(1);
    expect(result.captain).toEqual(written);
  });

  it('spec(A-041:AC-4) malformed, negative, duplicate, invalid, or impossible receipts are dropped on migrate', async () => {
    const good = duelReceipt();
    const priorCoins = 77;
    const priorOwned = ['swivel_gun', 'culverin'];
    const corruptBundle = [
      good,
      { ...good, key: 'duel:dup', grant: { kind: 'coins', amount: 99 } }, // duplicate map key via later object key
      {
        key: 'purchase:-3',
        source: 'purchase',
        seed: 1,
        rarity: 'common',
        coinFallback: 10,
        grant: { kind: 'coins', amount: 10 },
      },
      {
        key: 'store:1',
        source: 'duel',
        seed: 1,
        rarity: 'common',
        coinFallback: 10,
        grant: { kind: 'coins', amount: 10 },
      },
      {
        key: purchaseReceiptKey(1),
        source: 'purchase',
        seed: 1,
        rarity: 'rare',
        coinFallback: 10,
        grant: { kind: 'cannon', cannonId: 'not_a_real_cannon' },
      },
      {
        key: duelReceiptKey('both'),
        source: 'duel',
        seed: 1,
        rarity: 'common',
        coinFallback: 10,
        // Impossible: both coin and cannon grants encoded together.
        grant: { kind: 'coins', amount: 5, cannonId: 'nine_pounder' },
      },
      {
        key: duelReceiptKey('neither'),
        source: 'duel',
        seed: 1,
        rarity: 'common',
        coinFallback: 10,
        grant: { kind: 'hat', amount: 1 },
      },
    ];

    io.data.set(
      STORAGE_KEY,
      JSON.stringify({
        version: SCHEMA_VERSION,
        captain: preTicketCaptain({
          coins: priorCoins,
          ownedCannons: priorOwned,
          equippedCannons: priorOwned,
          // Array form + intentional duplicate key `duel:dup` appearing twice.
          rewardReceipts: [
            good,
            {
              key: 'duel:dup',
              source: 'duel',
              seed: 2,
              rarity: 'common',
              coinFallback: 1,
              grant: { kind: 'coins', amount: 1 },
            },
            {
              key: 'duel:dup',
              source: 'duel',
              seed: 3,
              rarity: 'uncommon',
              coinFallback: 2,
              grant: { kind: 'coins', amount: 2 },
            },
            ...corruptBundle.slice(2),
          ],
          nextPurchaseSequence: 4,
          mercyState: emptyMercyState,
        }),
      }),
    );

    const result = await hydrate(io.store);
    expect(result.captain.coins).toBe(priorCoins);
    expect(result.captain.ownedCannons).toEqual(priorOwned);
    // Only the well-formed duel receipt survives; duplicates and corrupt entries are gone.
    expect(Object.keys(result.captain.rewardReceipts).sort()).toEqual([good.key].sort());
    expect(result.captain.rewardReceipts[good.key]).toEqual(good);
    // Rejected entries must not have been applied as grants.
    expect(result.captain.ownedCannons).not.toContain('nine_pounder');
    expect(result.captain.coins).toBe(priorCoins);
  });

  it('spec(A-041:AC-6) mercy and receipt fields survive persist and are available without a second schema', async () => {
    const store = createCaptainStore();
    const duel = duelReceipt();
    store.getState().replaceCaptain({
      ...store.getState().captain,
      mercyState: {
        recentPlayerCorrect: [true],
        consecutiveLosses: 0,
        forcedMisfiresRemaining: 3,
      },
      rewardReceipts: { [duel.key]: duel },
      nextPurchaseSequence: 5,
    });

    await persist(io.store, store.getState().captain);
    const raw = JSON.parse(io.data.get(STORAGE_KEY) ?? '{}');
    expect(raw.version).toBe(SCHEMA_VERSION);
    expect(raw.captain.mercyState.forcedMisfiresRemaining).toBe(3);
    expect(raw.captain.rewardReceipts[duel.key]).toEqual(duel);
    expect(raw.captain.nextPurchaseSequence).toBe(5);

    const result = await hydrate(io.store);
    expect(result.captain.mercyState.forcedMisfiresRemaining).toBe(3);
    expect(result.captain.rewardReceipts[duel.key]).toEqual(duel);
    expect(result.captain.nextPurchaseSequence).toBe(5);
  });
});

/**
 * A-002 — the walkthrough resume index, added the only safe way.
 *
 * Onboarding board rule RESUME: *"Children are interrupted constantly. The beat index persists, so
 * a closed app reopens on the same beat."* That needs a new `Captain` field, and a new field is the
 * single most dangerous kind of change this file can carry — because `hydrate` answers a captain
 * that fails `isBaseCaptain` with `emptyCaptain()`. Require the field structurally, or bump
 * `SCHEMA_VERSION` for it, and every save written before today is discarded: band, name, flag,
 * coins, mastery, rank. To a child that is the game deleting them.
 *
 * So it follows the `seenCannons` / `ownedSkins` precedent exactly — defaulted on read, absent from
 * the structural check, no version bump — and these tests are what stop that being undone later by
 * someone tidying up.
 */
describe('A-002 onboarding beat is tolerated as absent', () => {
  it('spec(A-002:AC-3) a save written before the field existed still hydrates with its progress intact', async () => {
    const io = fakeStorage();
    const legacy = preTicketCaptain({ coins: 137, wins: 9 });
    delete legacy.onboardingBeat;
    io.data.set(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, captain: legacy }));

    const result = await hydrate(io.store);

    // The whole point: NOT recovered, NOT migrated, and the captain is the stored one.
    expect(result.recovered, 'a missing onboardingBeat discarded a real captain').toBe(false);
    expect(result.migrated).toBe(false);
    expect(result.captain.coins).toBe(137);
    expect(result.captain.wins).toBe(9);
    expect(result.captain.name).toBe('Ada');
    expect(result.captain.onboardingBeat).toBe(0);
  });

  it('spec(A-002:AC-3) the field did not cost a schema bump', () => {
    // A bump would reject every v2 payload on the next branch of `hydrate` — the same data loss by
    // a different door, and one that no amount of tolerant normalising can undo.
    expect(SCHEMA_VERSION).toBe(2);
  });

  it('spec(A-002:AC-3) a stored beat round-trips, and a corrupt one resolves to something playable', async () => {
    const io = fakeStorage();
    const store = createCaptainStore();
    store.getState().setGradeBand('k_1');
    store.getState().setNameAndFlag('Ada', 'flag-3');
    store.getState().setOnboardingBeat(2);

    await persist(io.store, store.getState().captain);
    expect((await hydrate(io.store)).captain.onboardingBeat).toBe(2);

    // Storage is untrusted input. Each of these used to be a way to resume into a walkthrough state
    // that does not exist, leaving a captain behind an invisible overlay with no beat to render.
    for (const bad of ['nine', -4, 2.7, null, undefined, Number.NaN]) {
      const corrupt = fakeStorage();
      corrupt.data.set(
        STORAGE_KEY,
        JSON.stringify({ version: SCHEMA_VERSION, captain: preTicketCaptain({ onboardingBeat: bad }) }),
      );
      const read = await hydrate(corrupt.store);
      expect(read.recovered, `onboardingBeat ${String(bad)} discarded the captain`).toBe(false);
      expect(Number.isInteger(read.captain.onboardingBeat)).toBe(true);
      expect(read.captain.onboardingBeat).toBeGreaterThanOrEqual(0);
    }
  });

  it('spec(A-002:AC-4) a v1 save migrates forward with the field defaulted rather than dropped', async () => {
    const io = fakeStorage();
    io.data.set(STORAGE_KEY, JSON.stringify({ version: 1, captain: preTicketCaptain() }));

    const result = await hydrate(io.store);
    expect(result.migrated).toBe(true);
    expect(result.recovered).toBe(false);
    expect(result.captain.onboardingBeat).toBe(0);
    expect(result.captain.coins).toBe(42);
  });
});

/**
 * A-079 — the bus law, enforced on hydrate (amended D-17, design §1).
 *
 * `currentIsland` and `unlockedIslands` carry authored ids or null, forever — every total Record
 * and settlement gate downstream is built on that. `isBaseCaptain` deliberately checks only that
 * these fields are string-shaped, so the scrub in both normalize arms is what keeps a hostile or
 * bugged save from ever putting a `gen_isle_*` (or any foreign) string on the authored bus.
 */
describe('A-079 hydrate scrubs the authored island bus', () => {
  it('spec(A-079:AC-3) gen ids in currentIsland and unlockedIslands are scrubbed on hydrate', async () => {
    io.data.set(
      STORAGE_KEY,
      JSON.stringify({
        version: SCHEMA_VERSION,
        captain: preTicketCaptain({
          currentIsland: 'gen_isle_7',
          unlockedIslands: ['port_sumwich', 'gen_isle_9', 'isla_products'],
        }),
      }),
    );

    const result = await hydrate(io.store);

    // Scrubbed, never discarded: the captain keeps everything else.
    expect(result.recovered).toBe(false);
    expect(result.captain.coins).toBe(42);
    expect(result.captain.currentIsland).toBeNull();
    expect(result.captain.unlockedIslands).toEqual(['port_sumwich', 'isla_products']);
  });

  it('spec(A-079:AC-3) any non-catalog value is scrubbed — the law is catalog membership', async () => {
    io.data.set(
      STORAGE_KEY,
      JSON.stringify({
        version: SCHEMA_VERSION,
        captain: preTicketCaptain({
          currentIsland: 'atlantis',
          unlockedIslands: ['port_sumwich', 42, null, 'atlantis', 'PORT_SUMWICH'],
        }),
      }),
    );

    const result = await hydrate(io.store);
    expect(result.captain.currentIsland).toBeNull();
    expect(result.captain.unlockedIslands).toEqual(['port_sumwich']);
  });

  it('spec(A-079:AC-3) a hostile v1 payload cannot smuggle a gen id through the migrate arm', async () => {
    io.data.set(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        captain: preTicketCaptain({
          currentIsland: 'gen_isle_6',
          unlockedIslands: ['gen_isle_6', 'port_sumwich'],
        }),
      }),
    );

    const result = await hydrate(io.store);
    expect(result.migrated).toBe(true);
    expect(result.captain.currentIsland).toBeNull();
    expect(result.captain.unlockedIslands).toEqual(['port_sumwich']);
  });

  it('spec(A-079:AC-3) authored ids pass the scrub intact — the whole chain, in stored order', async () => {
    const all = ['port_sumwich', 'isla_products', 'quotient_cove', 'fraction_reef', 'grandline'];
    io.data.set(
      STORAGE_KEY,
      JSON.stringify({
        version: SCHEMA_VERSION,
        captain: preTicketCaptain({ currentIsland: 'grandline', unlockedIslands: all }),
      }),
    );

    const result = await hydrate(io.store);
    expect(result.recovered).toBe(false);
    expect(result.captain.currentIsland).toBe('grandline');
    expect(result.captain.unlockedIslands).toEqual(all);
  });
});
