/**
 * Reading and writing the captain.
 *
 * A-002. The splash (board 4a) already holds the first frame; this is the thing it is meant to
 * wait for.
 *
 * **Storage is injected, not imported.** AsyncStorage is a React Native module and RN's entry
 * point is Flow-typed, which the node test runner cannot parse — so taking a `KeyValueStore`
 * parameter is what lets every rule below be frozen-tested headless. The real AsyncStorage is
 * supplied once, at the app edge.
 *
 * The governing stance is that **storage is untrusted input**. A payload can be truncated by a
 * crash mid-write, written by an older build, or corrupted by something outside our control. Every
 * one of those must resolve to a playable app: a child locked out of the game by a bad write is a
 * worse outcome than a child who lost their coins.
 */
import { normalizeRewardReceipts } from '../contracts/rewards';
import { DEFAULT_SKIN_ID } from '../theme/shipSkins';
import { emptyCaptain, type Captain } from '../stores/player';
import type { MercyState } from '@engine/opponents/mercy';

/** The two AsyncStorage methods this needs. Narrow on purpose — it is the whole test seam. */
export interface KeyValueStore {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}

export const STORAGE_KEY = 'cannon-academy/captain';

/**
 * Bumped whenever `Captain`'s shape changes incompatibly. Written from the first release, because
 * retrofitting a version onto unversioned data means guessing which shape you are looking at.
 */
export const SCHEMA_VERSION = 2;

/** Pre-A-041 captain envelope — migrated forward, not discarded. */
const LEGACY_SCHEMA_VERSION = 1;

export interface HydrateResult {
  readonly captain: Captain;
  /** True when stored data existed but could not be used, and the empty captain was substituted. */
  readonly recovered: boolean;
  /** True when stored data was discarded for being from an older schema. */
  readonly migrated: boolean;
}

function freshMercyState(): MercyState {
  return {
    recentPlayerCorrect: [],
    consecutiveLosses: 0,
    forcedMisfiresRemaining: 0,
  };
}

function normalizeMercyState(raw: unknown): MercyState {
  if (typeof raw !== 'object' || raw === null) return freshMercyState();
  const m = raw as Record<string, unknown>;
  const recentPlayerCorrect = Array.isArray(m.recentPlayerCorrect)
    ? m.recentPlayerCorrect.filter((v): v is boolean => typeof v === 'boolean')
    : [];
  const consecutiveLosses =
    typeof m.consecutiveLosses === 'number' && Number.isFinite(m.consecutiveLosses)
      ? Math.max(0, Math.floor(m.consecutiveLosses))
      : 0;
  const forcedMisfiresRemaining =
    typeof m.forcedMisfiresRemaining === 'number' && Number.isFinite(m.forcedMisfiresRemaining)
      ? Math.max(0, Math.floor(m.forcedMisfiresRemaining))
      : 0;
  return { recentPlayerCorrect, consecutiveLosses, forcedMisfiresRemaining };
}

/**
 * The chart-walkthrough beat, defaulted for any save written before it existed.
 *
 * Deliberately NOT part of `isBaseCaptain` and NOT a reason to bump `SCHEMA_VERSION` — the same
 * ruling that governs `seenCannons` and `ownedSkins`. Requiring it would reject every save written
 * before this shipped, and `hydrate` answers a rejected save with `emptyCaptain()`: a returning
 * captain would lose their band, their name, their flag, their coins and their rank, and to a child
 * that is indistinguishable from the game deleting them. A missing resume index costs one replayed
 * beat; the alternative costs the save.
 */
function normalizeOnboardingBeat(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.floor(raw));
}

/**
 * A tour replay never survives a relaunch — this reads `false` for every save, always.
 *
 * It is not a normaliser that happens to be strict; it is the rule that clears an ABANDONED
 * replay, and it lives here because `hydrate` is the one place a launch decides what the captain
 * was doing. A captain who force-quits halfway through walking the tutorial a second time relaunches
 * onto their chart with everything intact, rather than into a tour they walked away from. The board's
 * RESUME rule is about a FIRST run — a child interrupted mid-onboarding — and that case is carried
 * by `hasCompletedOnboarding` being false, which this cannot touch.
 *
 * Like `onboardingBeat`, it is absent from `isBaseCaptain` and costs no `SCHEMA_VERSION` bump: a
 * save written before today must not be rejected, because `hydrate` answers a rejected save with
 * `emptyCaptain()` and that is the game deleting a real captain.
 */
function normalizeReplayingTour(): boolean {
  return false;
}

function normalizeNextPurchaseSequence(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  const sequence = Math.floor(raw);
  return sequence >= 0 ? sequence : 0;
}

/**
 * Structural validation, not a type assertion.
 *
 * `JSON.parse` returns `any`, and casting it to `Captain` would let a corrupted payload through
 * with fields of the wrong type — `coins: "lots"` would sail past a cast and fail much later, on a
 * screen, as `NaN`. Checking the shape here is what makes AC-3 hold for well-formed-but-wrong data
 * as well as for truncated data.
 */
function isBaseCaptain(
  value: unknown,
): value is Omit<Captain, 'mercyState' | 'rewardReceipts' | 'nextPurchaseSequence'> {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    (c.gradeBand === null || typeof c.gradeBand === 'string') &&
    typeof c.name === 'string' &&
    (c.flag === null || typeof c.flag === 'string') &&
    typeof c.coins === 'number' &&
    Number.isFinite(c.coins) &&
    typeof c.mastery === 'object' &&
    c.mastery !== null &&
    Array.isArray(c.ownedCannons) &&
    Array.isArray(c.equippedCannons) &&
    (c.seenCannons === undefined || Array.isArray(c.seenCannons)) &&
    // Skins arrived after v2 shipped. Tolerated as absent rather than required, exactly like
    // `seenCannons` — requiring them would reject every save written before the Harbor existed
    // and silently reset real captains to zero (A-052).
    (c.ownedSkins === undefined || Array.isArray(c.ownedSkins)) &&
    (c.equippedSkin === undefined || c.equippedSkin === null || typeof c.equippedSkin === 'string') &&
    Array.isArray(c.unlockedIslands) &&
    typeof c.rankTier === 'number' &&
    typeof c.wins === 'number' &&
    (c.currentIsland === null || typeof c.currentIsland === 'string') &&
    typeof c.hasCompletedOnboarding === 'boolean' &&
    typeof c.hasFoughtGuidedDuel === 'boolean'
  );
}

/**
 * Skins, defaulted for any save written before they existed.
 *
 * The starter is ALWAYS present, even if a stored list omits it: it is the fallback
 * `skinOrDefault` resolves to, so a captain who somehow owned nothing would sail a ship whose
 * palette came from a skin they do not own. `equippedSkin` stays `null` for the starter rather than
 * being written out, which keeps an untouched save byte-identical after a round trip.
 */
function normalizeSkins(raw: Record<string, unknown>): Pick<Captain, 'ownedSkins' | 'equippedSkin'> {
  const stored = Array.isArray(raw.ownedSkins)
    ? raw.ownedSkins.filter((s): s is string => typeof s === 'string')
    : [];
  const owned = stored.includes(DEFAULT_SKIN_ID) ? stored : [DEFAULT_SKIN_ID, ...stored];
  const equipped =
    typeof raw.equippedSkin === 'string' && owned.includes(raw.equippedSkin) ? raw.equippedSkin : null;
  return { ownedSkins: owned, equippedSkin: equipped };
}

function normalizeCaptain(raw: Record<string, unknown>): Captain {
  const base = raw as Omit<Captain, 'mercyState' | 'rewardReceipts' | 'nextPurchaseSequence'>;
  return {
    ...base,
    seenCannons: Array.isArray(base.seenCannons) ? base.seenCannons : [],
    ...normalizeSkins(raw),
    onboardingBeat: normalizeOnboardingBeat(raw.onboardingBeat),
    replayingTour: normalizeReplayingTour(),
    mercyState: normalizeMercyState(raw.mercyState),
    rewardReceipts: normalizeRewardReceipts(raw.rewardReceipts),
    nextPurchaseSequence: normalizeNextPurchaseSequence(raw.nextPurchaseSequence),
  };
}

function migrateLegacyCaptain(raw: Record<string, unknown>): Captain {
  return {
    ...(raw as Omit<Captain, 'mercyState' | 'rewardReceipts' | 'nextPurchaseSequence'>),
    seenCannons: Array.isArray(raw.seenCannons) ? (raw.seenCannons as Captain['seenCannons']) : [],
    ...normalizeSkins(raw),
    onboardingBeat: normalizeOnboardingBeat(raw.onboardingBeat),
    replayingTour: normalizeReplayingTour(),
    mercyState: freshMercyState(),
    rewardReceipts: {},
    nextPurchaseSequence: 0,
  };
}

/** Reads the captain. Always resolves to a usable one; never throws. */
export async function hydrate(storage: KeyValueStore): Promise<HydrateResult> {
  let raw: string | null = null;
  try {
    raw = await storage.getItem(STORAGE_KEY);
  } catch {
    // A storage read that throws is indistinguishable, from here, from having nothing stored.
    return { captain: emptyCaptain(), recovered: true, migrated: false };
  }

  if (raw === null) return { captain: emptyCaptain(), recovered: false, migrated: false };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { captain: emptyCaptain(), recovered: true, migrated: false };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { captain: emptyCaptain(), recovered: true, migrated: false };
  }

  const envelope = parsed as { version?: unknown; captain?: unknown };

  if (envelope.version === LEGACY_SCHEMA_VERSION) {
    if (!isBaseCaptain(envelope.captain)) {
      return { captain: emptyCaptain(), recovered: true, migrated: false };
    }
    return {
      captain: migrateLegacyCaptain(envelope.captain as Record<string, unknown>),
      recovered: false,
      migrated: true,
    };
  }

  // Unsupported schema versions are discarded explicitly, never half-applied.
  if (envelope.version !== SCHEMA_VERSION) {
    return { captain: emptyCaptain(), recovered: false, migrated: true };
  }

  if (!isBaseCaptain(envelope.captain)) {
    return { captain: emptyCaptain(), recovered: true, migrated: false };
  }

  const captain = normalizeCaptain(envelope.captain as Record<string, unknown>);
  return { captain, recovered: false, migrated: false };
}

/**
 * Writes the captain. Returns whether it succeeded; never throws.
 *
 * A failed write must not disturb the in-memory captain — losing a save is recoverable on the next
 * write, but corrupting live state mid-session is not.
 */
export async function persist(storage: KeyValueStore, captain: Captain): Promise<boolean> {
  try {
    await storage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, captain }));
    return true;
  } catch {
    return false;
  }
}
