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

import { cannons, getCannon, getSkill } from '@content/index';
import type { CannonId, GradeBand } from '@content/schemas';
import { GRADE_BANDS } from '@content/schemas';
import { maxGradeForBand } from '@engine/placement';
import { TRAY_CAPACITY } from '@engine/tuning';

import { resolveDestination } from '../../src/services/flow';
import {
  asksInBand,
  commitLoadout,
  deckDraft,
  deckSlots,
  displaceCannon,
  inBandLoadout,
  selectCannon,
  trayCannons,
} from '../../src/services/loadout';
import { commitGradeBand } from '../../src/services/onboarding';
import { hydrate, persist, type KeyValueStore } from '../../src/services/persistence';
import { settleDuelRewards } from '../../src/services/rewardSettlement';
import { createCaptainStore, emptyCaptain, type Captain } from '../../src/stores/player';
import {
  cannonNotYetLabel,
  CANNON_NOT_YET_CHIP,
  CANNON_NOT_YET_MESSAGE,
} from '../../src/theme/cannonPresentation';

/**
 * ## Why every fixture below carries the TOP band, and why that is not a re-baseline
 *
 * This file was written before the curriculum ceiling existed, so every fixture used
 * `emptyCaptain()` — `gradeBand: null`. That was harmless while ownership was the only thing the
 * deck measured. It stopped being harmless when the deck learned that a gun can be owned and still
 * unable to sail (A-058's residue, closed below): with a null band NOTHING sails, so the A-011
 * fixtures would have been describing a deck on which no gun can be put in a slot at all — a state
 * `resolveDestination` makes unreachable, and the exact opposite of the deck A-011 is about.
 *
 * The band is DERIVED as the top band rather than written down, for the same reason `ownedIds` is
 * derived from `TRAY_CAPACITY`: `ownedIds` is a catalog prefix whose *width* is a tuning constant.
 * At today's capacity of 3 the prefix stops at `chain_shot` and even K-1 would do; at 4 it reaches
 * `nine_pounder` (grade 2) and at 6 `mortar` (grade 3). A fixture whose validity depends on a
 * number the file's own rule 1 says it must not depend on is a fixture waiting to lie.
 *
 * **Nothing here is re-baselined, and the change cannot hide a regression.** It is strictly
 * *widening*: a band can only turn `sails: false` into `sails: true`, so it can only REMOVE a
 * reason a gun might be missing from a deck, a draft or a tray. Every A-011 assertion is about
 * presence, order, marking or refusal, and none of them ever consulted a band — the proof is that
 * all twenty-three passed with `gradeBand: null` both before `sails` existed and after it was
 * added. `dod(A-011:4)` below pins the widening explicitly, so a catalog or capacity change that
 * pushed a fixture gun above the ceiling fails loudly here instead of quietly converting an A-011
 * test into a ceiling test.
 */
const FIXTURE_BAND: GradeBand = GRADE_BANDS[GRADE_BANDS.length - 1]!;

const captain = (over: Partial<Captain> = {}): Captain => ({
  ...emptyCaptain(),
  gradeBand: FIXTURE_BAND,
  ...over,
});

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

/**
 * A-058's known residue — a gun that is owned and cannot sail.
 *
 * A-058 put the curriculum ceiling where a duel's questions are chosen, and wrote down what it left
 * behind: *"A K-1 captain can still OWN an out-of-band chest cannon and put it on the gun deck; the
 * duel simply never arms it."* Reproduced before this file was written, by driving the real path —
 * place at K-1, win until a chest grants `nine_pounder` (skill `place_value_compare`, grade 2),
 * `commitLoadout` accepts it because ownership is the only thing it checks, and then:
 *
 *     GUN DECK REPORTS: 3 OF 3 SLOTS -> [ 'culverin', 'swivel_gun', 'nine_pounder' ]
 *     DUEL TRAY RENDERS:               [ 'swivel_gun', 'culverin' ]
 *
 * One of the child's three chosen guns did not exist in the fight, and nothing on either screen
 * said so.
 *
 * ## The ruling: show it, mark it, do not let it take a slot
 *
 * Hiding the row is the small fix and the wrong one. The child *earned* that gun from a chest, and
 * a reward that vanishes from the one screen where rewards live reads as the game taking it back.
 * This app has already made the opposite choice twice — the sea chart keeps a locked island's name
 * and skill glyph under fog because anticipation is the whole point of a map, and the Harbor keeps
 * unaffordable ships on the shelf with a progress meter rather than removing them. So the gun deck
 * renders an out-of-band owned cannon as present, visibly not-yet, non-selectable, and excluded
 * from the slot count — so **the count the deck reports is the count the duel will arm**.
 *
 * ## The bandless captain: FAIL CLOSED
 *
 * `gradeBand` can be `null`, and the app holds two opposite readings of that. This deck takes
 * A-058's, and it is not a coin toss:
 *
 *  1. **The deck must never promise what the duel will refuse.** `stores/duel.ts` builds
 *     `playerLoadout` with `inBandLoadout`, which returns `[]` for a null band, and `selectCannon`
 *     returns the same state for anything outside it — so a bandless captain's duel arms nothing at
 *     all. A deck reading null as "no ceiling" would offer that captain three slots against a duel
 *     with an empty tray: the very seam being closed, inverted and made worse.
 *  2. **`engine/mastery.ts:121`'s `POSITIVE_INFINITY` does not transfer.** It is safe *there* only
 *     because a skill has to be MASTERED before it unlocks anything, so an infinite ceiling over an
 *     unmastered skill unlocks nothing. On this screen the guns are already owned, so an infinite
 *     ceiling is the whole catalog, division included, in front of a child the app has not placed.
 *  3. **The apparent cost is not reachable.** Fail-closed means a bandless captain sees zero slots,
 *     and `commitLoadout` refuses an empty deck — which would be a dead end if anything could route
 *     there. Nothing can: `resolveDestination` returns `onboarding` for `gradeBand === null` at its
 *     FIRST branch, three steps above the `equippedCannons.length === 0 → gun-deck` diversion.
 *     Pinned below, because that ordering is the entire safety argument.
 *  4. And if a future route ever did reach it, it fails safe rather than dangerous: a screen that
 *     shows every gun and declines to sail, not a duel armed with maths nobody chose a level for.
 */
describe('A-058 residue — an owned gun the band cannot fire yet', () => {
  /** A captain placed the way `app/onboarding.tsx` places one. */
  function onboarded(band: GradeBand): ReturnType<typeof createCaptainStore> {
    const store = createCaptainStore();
    commitGradeBand(store, band);
    expect(store.getState().captain.gradeBand).toBe(band);
    expect(store.getState().captain.equippedCannons.length).toBeGreaterThan(0);
    return store;
  }

  /** Catalog cannons whose questions sit above `band` — the guns that can be owned but not fired. */
  function outOfBand(band: GradeBand): readonly CannonId[] {
    return cannons.filter((c) => !asksInBand(c, band)).map((c) => c.id);
  }

  /**
   * What the DUEL will actually arm, by the two rules that decide it:
   * `stores/duel.ts` builds `playerLoadout` with `inBandLoadout` (the hard gate — `selectCannon`
   * refuses anything outside it), and `app/duel.tsx` renders `trayCannons` filtered by `asksInBand`.
   * Computed both ways here and required to agree, so this helper cannot drift from either.
   */
  function duelWillArm(c: Captain): readonly CannonId[] {
    const engineSide = inBandLoadout(c.equippedCannons, c.gradeBand);
    const screenSide = trayCannons(c)
      .filter((gun) => asksInBand(gun, c.gradeBand))
      .map((gun) => gun.id);
    expect([...engineSide].sort()).toEqual([...screenSide].sort());
    return engineSide;
  }

  // ── The reproduction, closed ────────────────────────────────────────────────────────────────

  it('spec(A-058:residue) the reported path: the deck now reports the number the duel will arm', () => {
    // Driven, not simulated. Every step is the one the app really takes.
    const store = onboarded('k_1');
    const placed = store.getState().captain.equippedCannons;

    // Which duel id rolls a cannon is a property of the seeded chest table, so it is SEARCHED for
    // rather than written down — a retune of `rollChest` moves the id, not the guarantee.
    let winner: string | null = null;
    let prize: CannonId | null = null;
    for (let n = 0; n < 512 && winner === null; n += 1) {
      const duelId = `duel-${n.toString(36)}`;
      const outcome = settleDuelRewards(onboarded('k_1'), {
        duelId,
        seed: n,
        won: true,
        purseCoins: 0,
        skillTally: {},
      });
      if (outcome.unlockedCannons.length > 0) {
        winner = duelId;
        prize = outcome.unlockedCannons[0]!;
      }
    }
    expect(winner, 'no chest in 512 duels granted a cannon — the fixture found nothing to test').not.toBeNull();
    // The prize really is above the K-1 ceiling, or this test proves nothing about the band.
    expect(asksInBand(getCannon(prize!), 'k_1')).toBe(false);

    settleDuelRewards(store, { duelId: winner!, seed: 0, won: true, purseCoins: 0, skillTally: {} });
    const won = store.getState().captain;
    expect(won.ownedCannons).toContain(prize!);

    // The gun deck SHOWS it — the reward did not vanish from the screen where rewards live.
    const shown = deckSlots(won);
    expect(shown.map((s) => s.cannon.id)).toContain(prize!);
    expect(shown.find((s) => s.cannon.id === prize!)?.sails).toBe(false);
    // ...and it is the newly-won gun, so it is badged as new as well as waiting. Both are true.
    expect(shown.find((s) => s.cannon.id === prize!)?.isNew).toBe(true);

    // It cannot take a slot. This is the fix: before it, the draft was `equippedCannons` filtered
    // by ownership alone, and the deck went on to report `3 OF 3 SLOTS`.
    store.getState().equipCannons([...placed, prize!]);
    const carrying = store.getState().captain;
    expect(carrying.equippedCannons).toContain(prize!);

    const draft = deckDraft(carrying);
    expect(draft).not.toContain(prize!);
    expect(draft).toEqual([...placed]);
    // The whole point, stated as the two numbers that disagreed: 3 and 2.
    expect(draft.length).toBe(duelWillArm(carrying).length);
    expect(draft.length).toBeLessThan(carrying.equippedCannons.length);

    // And leaving the deck HEALS the save — what is persisted is what the duel will arm.
    const commit = commitLoadout(carrying, draft);
    expect(commit.ok).toBe(true);
    store.getState().equipCannons(commit.ok ? commit.loadout : []);
    const healed = store.getState().captain;
    expect(healed.equippedCannons).toEqual([...duelWillArm(healed)]);
    // Healed, never confiscated: the gun is still owned and still on the deck.
    expect(healed.ownedCannons).toContain(prize!);
    expect(deckSlots(healed).map((s) => s.cannon.id)).toContain(prize!);
  });

  // ── Shown, never hidden ─────────────────────────────────────────────────────────────────────

  it('spec(A-058:residue) an out-of-band owned gun keeps its row and is marked, at every band', () => {
    // Swept over every out-of-band cannon at every band, so a fix that special-cased `nine_pounder`
    // — the only one a chest can actually grant today — fails here.
    let probed = 0;

    for (const band of GRADE_BANDS) {
      const base = onboarded(band).getState().captain;

      for (const stranger of outOfBand(band)) {
        const owning: Captain = {
          ...base,
          ownedCannons: [...new Set([...base.ownedCannons, stranger])],
        };
        const slots = deckSlots(owning);
        const row = slots.find((s) => s.cannon.id === stranger);

        // Present — hiding it is the fix this ticket exists to refuse.
        expect(row, `${band}: ${stranger} was hidden from the deck instead of marked`).toBeDefined();
        expect(row!.sails).toBe(false);
        // ...and marking it did not quietly mark everything else. The complement matters as much
        // as the set: a `sails: false` constant satisfies "the stranger is marked" and is wrong.
        for (const s of slots) {
          expect(s.sails, `${band}: ${s.cannon.id} sails=${s.sails}`).toBe(
            asksInBand(s.cannon, band),
          );
        }
        expect(slots.some((s) => s.sails)).toBe(true);
        probed += 1;
      }
    }

    // Non-vacuity: there really are out-of-band cannons to probe.
    expect(probed).toBeGreaterThan(0);
  });

  // ── Never occupies a slot ───────────────────────────────────────────────────────────────────

  it('spec(A-058:residue) the deck offers exactly the slots the duel will arm, at every band', () => {
    // The headline invariant, and the one the reproduction violated. Asserted as an EQUALITY
    // between the deck's own count and the duel's own rule, so neither side can drift alone.
    for (const band of GRADE_BANDS) {
      const base = onboarded(band).getState().captain;
      const strangers = outOfBand(band);

      for (const stranger of strangers) {
        // The stranger DISPLACES a placed gun rather than being appended past the slot count, so
        // the fixture is a deck a child could really have committed.
        const placed = base.equippedCannons.slice(0, TRAY_CAPACITY - 1);
        const carrying: Captain = {
          ...base,
          ownedCannons: [...new Set([...base.ownedCannons, stranger])],
          equippedCannons: [...placed, stranger],
        };
        // Honest fixture: `commitLoadout` really would have accepted this, because ownership is
        // still the only thing it checks — that guarantee belongs to A-058 and must not move.
        expect(commitLoadout(carrying, carrying.equippedCannons).ok).toBe(true);

        const draft = deckDraft(carrying);
        expect(draft, `${band}: ${stranger} took a slot`).not.toContain(stranger);
        expect(draft.length, `${band}: the deck offered a slot the duel will not arm`).toBe(
          duelWillArm(carrying).length,
        );
        expect(draft.length).toBeGreaterThan(0);
      }
    }
  });

  it('spec(A-058:residue) the draft is the in-band subset in the captain order — removal, never substitution', () => {
    // A draft that "helpfully" fell back to `resolvePlacement(band)` would keep the count honest
    // and still be wrong: it would hand a child guns they never chose, and reorder the deck they
    // arranged. Feeding it reversed proves the survivors keep the player's order, not the catalog's.
    for (const band of GRADE_BANDS) {
      const base = onboarded(band).getState().captain;
      const chosenOrder = [...base.equippedCannons].reverse();
      const strangers = outOfBand(band);

      const carrying: Captain = {
        ...base,
        ownedCannons: [...new Set([...base.ownedCannons, ...strangers])],
        equippedCannons: [chosenOrder[0]!, ...strangers, ...chosenOrder.slice(1)],
      };

      expect(deckDraft(carrying)).toEqual(chosenOrder);
    }
  });

  it('spec(A-058:residue) the draft still refuses a gun that was never earned, and one the catalog never had', () => {
    // The band filter joined two filters that were already there; none of the three may have been
    // displaced by it. `getCannon` THROWS on an unknown id, so the catalog filter is not tidiness —
    // a corrupt save would crash the screen on mount without it (`persistence.ts`: storage is
    // untrusted).
    const base = onboarded('g2_3').getState().captain;
    const unearned = cannons.map((c) => c.id).find((id) => !base.ownedCannons.includes(id))!;
    const ghost = 'no_such_gun' as CannonId;

    // Owned but never earned: in `equippedCannons`, absent from `ownedCannons`.
    const unearnedSave: Captain = {
      ...base,
      equippedCannons: [...base.equippedCannons, unearned],
    };
    expect(deckDraft(unearnedSave)).toEqual([...base.equippedCannons]);

    // A gun the catalog has never heard of, and it is in BOTH lists — which is the only shape that
    // actually reaches `getCannon`. A ghost that is merely equipped is already stopped by the
    // ownership filter, so a fixture that only puts it there proves nothing about this one: the
    // catalog filter can be deleted and such a test still passes. (It did, once.)
    const ghostSave: Captain = {
      ...base,
      ownedCannons: [...base.ownedCannons, ghost],
      equippedCannons: [...base.equippedCannons, ghost],
    };
    expect(() => deckDraft(ghostSave)).not.toThrow();
    expect(deckDraft(ghostSave)).toEqual([...base.equippedCannons]);
    // The deck rows survive it too — the screen must be able to MOUNT on a corrupt save, not just
    // compute a draft from one.
    expect(() => deckSlots(ghostSave)).not.toThrow();
    expect(deckSlots(ghostSave).map((s) => s.cannon.id)).not.toContain(ghost);
  });

  // ── The bandless captain ────────────────────────────────────────────────────────────────────

  it('spec(A-058:residue) a captain with no band is offered no slots — the same nothing the duel arms', () => {
    // Fail closed, matching A-058. See the header for why this is the only reading consistent with
    // the duel, and why `engine/mastery.ts`'s opposite reading is safe there and not here.
    const bandless = captain({
      gradeBand: null,
      ownedCannons: [...ownedIds],
      equippedCannons: [...fullTray],
    });

    expect(deckDraft(bandless)).toEqual([]);
    expect(duelWillArm(bandless)).toEqual([]);
    // The deck and the duel agree on zero — which is the whole contract, at its edge.
    expect(deckDraft(bandless).length).toBe(duelWillArm(bandless).length);

    // Every gun is still SHOWN. Fail-closed hides nothing; it only declines to sail.
    const slots = deckSlots(bandless);
    expect(slots.map((s) => s.cannon.id)).toEqual([...ownedIds]);
    expect(slots.every((s) => !s.sails)).toBe(true);
  });

  it('spec(A-058:residue) …and no route reaches this screen without a band, so zero slots is not a dead end', () => {
    // The entire safety argument for failing closed. `commitLoadout` refuses an empty deck, so if
    // anything could route a bandless captain here they would be stranded. The ORDER of
    // `resolveDestination`'s branches is what makes that unreachable: the null-band branch fires
    // first, above the `equippedCannons.length === 0 → gun-deck` diversion that would otherwise
    // send exactly this captain to exactly this screen.
    const stranded = captain({
      gradeBand: null,
      name: 'Ada',
      flag: 'flag-1',
      hasFoughtGuidedDuel: true,
      ownedCannons: [...ownedIds],
      equippedCannons: [],
    });

    expect(resolveDestination(stranded)).toBe('onboarding');
    // Non-vacuity: this captain satisfies the gun-deck diversion in every respect except the band,
    // so it really is the band branch winning and not some unrelated redirect.
    expect(resolveDestination({ ...stranded, gradeBand: FIXTURE_BAND })).toBe('gun-deck');
    // And an empty deck really is refused, which is why the ordering above has to hold.
    expect(commitLoadout(stranded, []).ok).toBe(false);
  });

  // ── The copy ────────────────────────────────────────────────────────────────────────────────

  it('spec(A-058:residue) the not-yet copy says waiting rather than broken, and never names a grade', () => {
    const label = cannonNotYetLabel('Nine-pounder', 'Place value');
    const all = [CANNON_NOT_YET_CHIP, CANNON_NOT_YET_MESSAGE, label];

    for (const text of all) {
      expect(text.trim().length).toBeGreaterThan(0);
      // A five-year-old does not know what grade 2 means, and a number is a verdict they cannot
      // act on. Adults get that context on the Rank screen; this screen never states one.
      expect(text, `"${text}" states a number to a five-year-old`).not.toMatch(/\d/);
      expect(text, `"${text}" names a grade`).not.toMatch(/\bgrade|\bkindergarten|\bK-1\b/i);
      // Waiting, not broken, and never a bare refusal. The Harbor turns "you cannot afford this"
      // into "About four more duels"; this is the same move on a different obstacle.
      expect(text, `"${text}" reads as a failure rather than a wait`).not.toMatch(
        /can'?t|cannot|locked|denied|error|too hard|not allowed|forbidden/i,
      );
    }

    // The chip is the Harbor's own two words — "Not yet, Captain" — so the two screens refuse the
    // same way, and it is the deliberate opposite of `YOURS — FLYING NOW`.
    expect(CANNON_NOT_YET_CHIP).toMatch(/not yet/i);
    // "Yours" carries the whole ruling: the reward was not taken back.
    expect(CANNON_NOT_YET_MESSAGE).toMatch(/yours/i);
    expect(label).toMatch(/yours/i);
    // The label leads with the gun and what it teaches — the anticipation — before the state.
    expect(label.indexOf('Place value')).toBeLessThan(label.toLowerCase().indexOf('not yet'));
    expect(label).toContain('Nine-pounder');
  });

  // ── The screen ──────────────────────────────────────────────────────────────────────────────

  it('spec(A-058:residue) the deck opens on deckDraft and renders the not-yet gun as a card, not a dead button', async () => {
    // Vitest runs in node and React Native's entry point is Flow-typed, so the screen cannot be
    // rendered here; the wiring is asserted against its source (the A-001 AC-7 pattern).
    const src = await readSource('../../app/gun-deck.tsx');

    // The draft comes from the shared selector, so the deck's count and the duel's loadout are the
    // same rule rather than two rules that must agree.
    expect(src).toMatch(/useState<readonly CannonId\[\]>\(\(\) => deckDraft\(captain\)\)/);
    // ...and it is NOT the old ownership-only filter, which is what reported three slots for two.
    expect(src).not.toMatch(/captain\.equippedCannons\.filter\(\(id\) =>/);

    // The card branches on the slot's own flag rather than re-deriving the ceiling in JSX.
    expect(src).toMatch(/sails \? /);
    expect(src).toMatch(/!sails/);
    expect(src).toMatch(/CANNON_NOT_YET_CHIP/);
    expect(src).toMatch(/CANNON_NOT_YET_MESSAGE/);
    expect(src).toMatch(/cannonNotYetLabel\(/);

    // Not a disabled button. `select` has no exit but leaving the screen, so a control that
    // announces itself and does nothing is the A-047 dead tile one screen over. The not-yet branch
    // returns a plain View, and nothing on this screen is a disabled Pressable.
    expect(src).toMatch(/if \(!sails\) \{\s*\n\s*return \(\s*\n\s*<View/);
    expect(src).not.toMatch(/disabled=/);

    // The copy lives in the presentation module, never inline on the screen.
    expect(src).not.toMatch(/'NOT YET'|"NOT YET"/);
    const presentation = await readSource('../../src/theme/cannonPresentation.ts');
    expect(presentation).toMatch(/CANNON_NOT_YET_CHIP/);
  });

  // ── The fixtures this file's other 23 tests stand on ────────────────────────────────────────

  it('spec(A-058:residue) every A-011 fixture gun sails at the fixture band, so no A-011 test measures the ceiling', () => {
    // The guard that makes the fixture band a widening rather than a re-baseline. `ownedIds` is a
    // catalog prefix whose width is `TRAY_CAPACITY + 2`; if a capacity bump or a catalog edit ever
    // pushed one of those guns above the ceiling, an A-011 test about ORDER or MARKING would start
    // silently measuring the band instead. It fails here first.
    expect(maxGradeForBand(FIXTURE_BAND)).toBe(Math.max(...GRADE_BANDS.map(maxGradeForBand)));

    for (const id of ownedIds) {
      expect(
        asksInBand(getCannon(id), FIXTURE_BAND),
        `${id} (skill ${getCannon(id).skill}, grade ${getSkill(getCannon(id).skill).minGrade}) ` +
          `is above the ${FIXTURE_BAND} ceiling — the A-011 fixtures are no longer all sailable`,
      ).toBe(true);
    }
    expect(deckSlots(captain({ ownedCannons: [...ownedIds] })).every((s) => s.sails)).toBe(true);

    // ...and the band genuinely is doing nothing to those tests: with it removed the same fixture
    // still lists the same guns in the same order. Only `sails` moves.
    const withBand = deckSlots(captain({ ownedCannons: [...ownedIds] }));
    const without = deckSlots({ ...captain({ ownedCannons: [...ownedIds] }), gradeBand: null });
    expect(without.map((s) => s.cannon.id)).toEqual(withBand.map((s) => s.cannon.id));
    expect(without.every((s) => !s.sails)).toBe(true);
  });
});
