/**
 * A-011 — the gun deck.
 *
 * A captain owns up to ten cannons and the duel tray holds three. Nothing decides which three:
 * `app/duel.tsx` builds its tray from `resolvePlacement('k_1')` — a hardcoded band, ignoring the
 * captain entirely — which is why the tray had to become scrollable rather than choosy. That is
 * the bug these tests close.
 *
 * **Two rules govern what is asserted here.**
 *
 *  1. **The engine owns the slot count.** `TRAY_CAPACITY` is imported from `@engine/tuning` and
 *     every fixture below is derived from it, so nothing in this file breaks if the tray becomes
 *     four. A literal `3` anywhere in a gun-deck test is the same bug as a literal `3` in the
 *     screen (ticket DoD-3).
 *  2. **Refusal is a result, not an absence.** The heart of the ticket is AC-2: equipping a fourth
 *     cannon must make the player displace one. The naive implementation —
 *     `[...selection, incoming].slice(0, TRAY_CAPACITY)` — silently returns the *unchanged* first
 *     three and reports success, so any test that only inspects the resulting array passes it.
 *     Every assertion on `selectCannon` therefore pins the whole result object, refusal included.
 *
 * The engine-side rule (T-030, `src/engine/loadout.ts`) is still `backlog`, so nothing here imports
 * it. These are the app-side rules, tested against the captain store and a pure selector module.
 *
 * Note the deliberate split between two orderings that AC-3 and T-030 AC-2 pull in opposite
 * directions: the **persisted loadout keeps the player's chosen order**, while the **duel tray
 * renders in catalog order**. `commitLoadout` never reshuffles; `trayCannons` always does.
 */
import { describe, expect, it } from 'vitest';

import { cannons } from '@content/index';
import type { CannonId } from '@content/schemas';
import { TRAY_CAPACITY } from '@engine/tuning';

import { resolveDestination } from '../../src/services/flow';
import {
  commitLoadout,
  deckSlots,
  displaceCannon,
  selectCannon,
  trayCannons,
} from '../../src/services/loadout';
import { hydrate, persist, type KeyValueStore } from '../../src/services/persistence';
import { createCaptainStore, emptyCaptain, type Captain } from '../../src/stores/player';

const captain = (over: Partial<Captain> = {}): Captain => ({ ...emptyCaptain(), ...over });

/** Catalog order — the order `cannons` ships in, gentlest gun first. */
const catalogIds: readonly CannonId[] = cannons.map((c) => c.id);

/** A captain with strictly more cannons than slots. Derived, so a wider tray needs no edit here. */
const ownedIds: readonly CannonId[] = catalogIds.slice(0, TRAY_CAPACITY + 2);

/** A full tray, in catalog order. */
const fullTray: readonly CannonId[] = ownedIds.slice(0, TRAY_CAPACITY);

/** The first owned cannon that is NOT in a full tray — the fourth gun of AC-2. */
const spare: CannonId = ownedIds[TRAY_CAPACITY]!;

/**
 * A loadout of exactly `TRAY_CAPACITY` owned cannons, deliberately NOT in catalog order, so the
 * difference between "what was chosen" and "how the tray renders" is visible in every assertion.
 */
const chosen: readonly CannonId[] = [...ownedIds.slice(0, TRAY_CAPACITY - 1), spare].reverse();

/** Same set, catalog-ordered — what the tray must show. */
const chosenInCatalogOrder: readonly CannonId[] = catalogIds.filter((id) => chosen.includes(id));

/** An in-memory stand-in for AsyncStorage (A-002's seam), so "persists" can be asserted headless. */
function fakeStorage() {
  const data = new Map<string, string>();
  const store: KeyValueStore = {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
  };
  return store;
}

/** Reads a source file as text. The A-001 AC-7 pattern: some rules are only visible in the source. */
async function readSource(relative: string): Promise<string> {
  const fs = await import('node:fs/promises');
  return fs.readFile(new URL(relative, import.meta.url), 'utf8');
}

describe('A-011 gun deck', () => {
  // ── AC-1 — the deck shows everything owned, and marks exactly what is equipped ──────────────

  it('spec(A-011:AC-1) every owned cannon is on the deck, in catalog order, not in ownership order', () => {
    // Ownership order is an accident of when each gun was earned; the deck must not reshuffle
    // itself as a child unlocks things. Feeding it reversed proves the order is the catalog's.
    const c = captain({ ownedCannons: [...ownedIds].reverse(), equippedCannons: [...fullTray] });
    const slots = deckSlots(c);

    expect(slots.map((s) => s.cannon.id)).toEqual([...ownedIds]);
    // The whole premise of the screen: more guns owned than slots to put them in.
    expect(slots.length).toBeGreaterThan(TRAY_CAPACITY);
  });

  it('spec(A-011:AC-1) exactly the equipped cannons are marked — no more, no fewer', () => {
    const equipped: readonly CannonId[] = [spare, ownedIds[0]!];
    const slots = deckSlots(captain({ ownedCannons: [...ownedIds], equippedCannons: [...equipped] }));

    const marked = slots.filter((s) => s.equipped).map((s) => s.cannon.id);
    const unmarked = slots.filter((s) => !s.equipped).map((s) => s.cannon.id);

    expect([...marked].sort()).toEqual([...equipped].sort());
    // The complement matters as much as the set: an implementation that marks everything owned
    // satisfies "the equipped ones are marked" and is still wrong.
    expect([...unmarked].sort()).toEqual(ownedIds.filter((id) => !equipped.includes(id)).sort());
  });

  it('spec(A-011:AC-1) the deck marks the draft in hand, not the committed set, while it is open', () => {
    // A child taps before they commit. If the marks came from `captain.equippedCannons` only, the
    // screen could not show a selection in progress at all.
    const c = captain({ ownedCannons: [...ownedIds], equippedCannons: [...fullTray] });
    const draft = ownedIds.slice(1, TRAY_CAPACITY + 1);
    const marked = deckSlots(c, draft)
      .filter((s) => s.equipped)
      .map((s) => s.cannon.id);

    expect(marked).toEqual(catalogIds.filter((id) => draft.includes(id)));
  });

  // ── AC-2 — a fourth cannon displaces one; the deck never silently drops a choice ────────────

  it('spec(A-011:AC-2) equipping a fourth on a full tray refuses and names what is in the way', () => {
    const result = selectCannon(fullTray, spare);

    // Pinned as a whole object on purpose. `[...fullTray, spare].slice(0, TRAY_CAPACITY)` returns
    // `fullTray` unchanged and reports success — it passes "the tray still holds TRAY_CAPACITY"
    // and "no gun was lost" and every other assertion about the array alone. The refusal itself,
    // carrying the occupants the player has to choose between, is the only thing that catches it.
    expect(result).toEqual({ kind: 'full', incoming: spare, occupants: [...fullTray] });
  });

  it('spec(A-011:AC-2) no tap on a full tray ever drops a choice — checked against every owned cannon', () => {
    // Exhaustive rather than exemplary: a "drop the oldest" implementation
    // (`[...selection.slice(1), incoming]`) keeps the count right and loses a gun a child picked.
    for (const id of ownedIds) {
      const result = selectCannon(fullTray, id);
      if (fullTray.includes(id)) {
        expect(result).toEqual({ kind: 'deselected', selection: fullTray.filter((x) => x !== id) });
      } else {
        expect(result).toEqual({ kind: 'full', incoming: id, occupants: [...fullTray] });
      }
    }
  });

  it('spec(A-011:AC-2) below capacity a tap simply adds, keeping every earlier choice in place', () => {
    const partial = ownedIds.slice(0, TRAY_CAPACITY - 1);
    expect(selectCannon(partial, spare)).toEqual({ kind: 'selected', selection: [...partial, spare] });
  });

  it('spec(A-011:AC-2) displacing swaps in place — the outgoing gun leaves, the tray does not reshuffle', () => {
    // The FIRST occupant, deliberately. Displacing the last one cannot tell a swap apart from
    // "remove it and append the newcomer", and the difference is the whole point: a tray that
    // re-orders under a child's finger is a tray they have to re-read after every swap.
    const outgoing = fullTray[0]!;
    const next = displaceCannon(fullTray, outgoing, spare);

    expect(next).toHaveLength(TRAY_CAPACITY);
    expect(next).not.toContain(outgoing);
    expect(next[0]).toBe(spare);
    expect(next).toEqual(fullTray.map((id) => (id === outgoing ? spare : id)));
  });

  it('spec(A-011:AC-2) selecting and displacing are pure — neither writes to the array it was handed', () => {
    const live: CannonId[] = [...fullTray];
    const snapshot = [...live];

    selectCannon(live, spare);
    displaceCannon(live, live[0]!, spare);

    // A mutating helper turns a refused fourth tap into a committed one the moment the screen
    // re-renders from the same array.
    expect(live).toEqual(snapshot);
  });

  // ── AC-3 — a committed set persists, and the duel tray shows exactly it, in catalog order ───

  it('spec(A-011:AC-3) a committed loadout is accepted in the order chosen and survives relaunch', async () => {
    const store = createCaptainStore(captain({ ownedCannons: [...ownedIds] }));

    // T-030 AC-2: an explicit loadout comes back "unchanged and in the player's chosen order".
    // Commit validates; it does not reorder. Only the tray does (next test).
    expect(commitLoadout(store.getState().captain, chosen)).toEqual({ ok: true, loadout: [...chosen] });

    store.getState().equipCannons(chosen);
    expect(store.getState().captain.equippedCannons).toEqual([...chosen]);

    const io = fakeStorage();
    await persist(io, store.getState().captain);
    const rehydrated = await hydrate(io);

    expect(rehydrated.recovered).toBe(false);
    expect(rehydrated.captain.equippedCannons).toEqual([...chosen]);
  });

  it('spec(A-011:AC-3) the duel tray is exactly the equipped set, rendered in catalog order', () => {
    const c = captain({ ownedCannons: [...ownedIds], equippedCannons: [...chosen] });
    const tray = trayCannons(c);

    expect(tray.map((x) => x.id)).toEqual([...chosenInCatalogOrder]);
    // "Exactly it": nothing owned-but-unequipped leaks in, and the count is the player's, not
    // the catalog's.
    expect(tray).toHaveLength(chosen.length);
  });

  it('spec(A-011:AC-3) the tray follows the captain, not placement — one equipped gun means one gun', () => {
    // `resolvePlacement('k_1')` returns the starter set regardless of what the captain equipped.
    // A tray of length one is the assertion that no placement call is left behind it.
    const c = captain({ gradeBand: 'k_1', ownedCannons: [...ownedIds], equippedCannons: [spare] });
    expect(trayCannons(c).map((x) => x.id)).toEqual([spare]);
  });

  it('spec(A-011:AC-3) the duel screen builds its tray from the captain, not from resolvePlacement', async () => {
    const src = await readSource('../../app/duel.tsx');

    // The A-001 AC-7 pattern: vitest runs in node and React Native's entry point is Flow-typed,
    // so this screen cannot be rendered here. The source text is the only place the fix is
    // observable — and this is the exact line the ticket exists to delete.
    expect(src).not.toMatch(/resolvePlacement/);
    expect(src).not.toMatch(/@engine\/placement/);
    expect(src).toMatch(/useCaptain/);
    expect(src).toMatch(/trayCannons/);
  });

  it('spec(A-011:AC-3) a loadout naming a cannon the captain does not own is refused, and names it', () => {
    const stranger = catalogIds.find((id) => !ownedIds.includes(id))!;
    const c = captain({ ownedCannons: [...ownedIds] });

    // A stale saved loadout must never equip a gun that was never earned (T-030 AC-3), and the
    // refusal has to name the offender or the screen cannot say which row is the problem.
    expect(commitLoadout(c, [ownedIds[0]!, stranger])).toEqual({
      ok: false,
      refusal: { reason: 'not-owned', offending: stranger },
    });
  });

  it('spec(A-011:AC-3) duplicates and over-capacity selections are refused, never quietly trimmed', () => {
    const c = captain({ ownedCannons: [...ownedIds] });

    expect(commitLoadout(c, [ownedIds[0]!, ownedIds[0]!])).toEqual({
      ok: false,
      refusal: { reason: 'duplicate', offending: ownedIds[0]! },
    });

    const tooMany = ownedIds.slice(0, TRAY_CAPACITY + 1);
    expect(commitLoadout(c, tooMany)).toEqual({
      ok: false,
      refusal: { reason: 'over-capacity', count: tooMany.length },
    });
  });

  // ── AC-4 — an empty loadout is refused, and that refusal is recoverable ─────────────────────

  it('spec(A-011:AC-4) committing zero cannons is refused', () => {
    const c = captain({ ownedCannons: [...ownedIds], equippedCannons: [...fullTray] });
    expect(commitLoadout(c, [])).toEqual({ ok: false, refusal: { reason: 'empty' } });
  });

  it('spec(A-011:AC-4) the refusal leaves the captain with the loadout they already had', () => {
    const store = createCaptainStore(
      captain({ ownedCannons: [...ownedIds], equippedCannons: [...fullTray] }),
    );

    commitLoadout(store.getState().captain, []);

    // Validation is pure. A refusal that had already written an empty set to the store would be
    // a refusal in name only.
    expect(store.getState().captain.equippedCannons).toEqual([...fullTray]);
  });

  it('spec(A-011:AC-4) an empty tray is a recoverable state, not a dead end', () => {
    const stranded = captain({
      gradeBand: 'k_1',
      name: 'Ada',
      flag: 'flag-1',
      hasFoughtGuidedDuel: true,
      ownedCannons: [...ownedIds],
      equippedCannons: [],
    });

    // Refusing an empty commit is safe precisely because a captain who somehow reaches zero is
    // routed back here rather than to a duel screen with no gun on it.
    expect(resolveDestination(stranded)).toBe('gun-deck');
  });

  // ── AC-5 — a newly unlocked cannon is marked new until seen ─────────────────────────────────

  it('spec(A-011:AC-5) an owned cannon that has never been seen is marked new; a seen one is not', () => {
    const fresh = ownedIds[ownedIds.length - 1]!;
    const c = captain({
      ownedCannons: [...ownedIds],
      seenCannons: ownedIds.filter((id) => id !== fresh),
    });

    const isNewById = new Map(deckSlots(c).map((s) => [s.cannon.id, s.isNew]));
    expect(isNewById.get(fresh)).toBe(true);
    for (const id of ownedIds.filter((x) => x !== fresh)) {
      expect(isNewById.get(id), `${id} should not be marked new`).toBe(false);
    }
  });

  it('spec(A-011:AC-5) newness is per cannon, not a single "the deck has been opened" flag', () => {
    const store = createCaptainStore(captain({ ownedCannons: ownedIds.slice(0, 2) }));

    store.getState().markCannonsSeen(store.getState().captain.ownedCannons);
    expect(deckSlots(store.getState().captain).every((s) => !s.isNew)).toBe(true);

    // A chest drops a gun after the deck was closed. A boolean latch would call this one seen.
    const later = ownedIds[ownedIds.length - 1]!;
    const c = store.getState().captain;
    store.getState().replaceCaptain({ ...c, ownedCannons: [...c.ownedCannons, later] });

    const slots = deckSlots(store.getState().captain);
    expect(slots.find((s) => s.cannon.id === later)?.isNew).toBe(true);
    expect(slots.filter((s) => s.isNew).map((s) => s.cannon.id)).toEqual([later]);
  });

  it('spec(A-011:AC-5) marking seen is a set union, and touches nothing else on the captain', () => {
    const store = createCaptainStore(
      captain({ ownedCannons: [...ownedIds], equippedCannons: [...fullTray] }),
    );

    // Two DISJOINT calls. Marking the same growing prefix twice cannot tell a union apart from a
    // replacement — and a replacement re-badges every cannon the child looked at last time.
    store.getState().markCannonsSeen([ownedIds[0]!]);
    store.getState().markCannonsSeen([ownedIds[1]!]);
    // Idempotent, too: re-seeing something changes nothing.
    store.getState().markCannonsSeen([ownedIds[1]!]);

    const c = store.getState().captain;
    expect([...c.seenCannons].sort()).toEqual([ownedIds[0]!, ownedIds[1]!].sort());
    expect(c.ownedCannons).toEqual([...ownedIds]);
    expect(c.equippedCannons).toEqual([...fullTray]);
  });

  it('spec(A-011:AC-5) "seen" survives relaunch — the badge must not come back every launch', async () => {
    const store = createCaptainStore(captain({ ownedCannons: [...ownedIds] }));
    store.getState().markCannonsSeen(ownedIds);

    const io = fakeStorage();
    await persist(io, store.getState().captain);
    const rehydrated = await hydrate(io);

    // "Until seen" is a promise about the next launch as much as this one. Holding seen-ness in
    // memory only would re-badge every cannon a child already inspected, every time they open
    // the app — which teaches them the badge means nothing.
    expect(rehydrated.recovered).toBe(false);
    expect([...rehydrated.captain.seenCannons].sort()).toEqual([...ownedIds].sort());
    expect(deckSlots(rehydrated.captain).some((s) => s.isNew)).toBe(false);
  });

  // ── Definition of Done ──────────────────────────────────────────────────────────────────────

  it('dod(A-011:1) every acceptance criterion in the ticket is cited by a test in this file', async () => {
    const ticket = await readSource('../../tickets/app/A-011.md');
    const suite = await readSource('./gun-deck.test.ts');
    const acs = new Set([...ticket.matchAll(/\*\*(AC-\d+)\*\*/g)].map((m) => m[1]!));

    expect(acs.size).toBeGreaterThan(0);
    for (const ac of acs) {
      expect(suite, `${ac} has no test in gun-deck.test.ts`).toContain(`spec(A-011:${ac})`);
    }
  });

  it('dod(A-011:3) the slot count comes from the engine, never a literal on the deck', async () => {
    expect(Number.isInteger(TRAY_CAPACITY)).toBe(true);
    expect(TRAY_CAPACITY).toBeGreaterThanOrEqual(1);

    const service = await readSource('../../src/services/loadout.ts');
    expect(service).toMatch(/import\s*\{[^}]*TRAY_CAPACITY[^}]*\}\s*from\s*'@engine\/tuning'/);

    for (const path of ['../../src/services/loadout.ts', '../../app/gun-deck.tsx']) {
      const src = await readSource(path);
      // A second definition of the capacity is the same bug as a literal: two numbers that must
      // agree and nothing making them.
      expect(src, `${path} redefines the capacity`).not.toMatch(/TRAY_CAPACITY\s*=\s*\d/);
      expect(src, `${path} truncates to a literal`).not.toMatch(/\.slice\(\s*0\s*,\s*\d+\s*\)/);
    }

    // The screen goes through the selector rather than re-deriving the rules in JSX.
    const deck = await readSource('../../app/gun-deck.tsx');
    expect(deck).toMatch(/from '\.\.\/src\/services\/loadout'/);
  });
});
