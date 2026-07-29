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
import { emptyCaptain, type Captain } from '../stores/player';

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
export const SCHEMA_VERSION = 1;

export interface HydrateResult {
  readonly captain: Captain;
  /** True when stored data existed but could not be used, and the empty captain was substituted. */
  readonly recovered: boolean;
  /** True when stored data was discarded for being from an older schema. */
  readonly migrated: boolean;
}

/**
 * Structural validation, not a type assertion.
 *
 * `JSON.parse` returns `any`, and casting it to `Captain` would let a corrupted payload through
 * with fields of the wrong type — `coins: "lots"` would sail past a cast and fail much later, on a
 * screen, as `NaN`. Checking the shape here is what makes AC-3 hold for well-formed-but-wrong data
 * as well as for truncated data.
 */
function isCaptain(value: unknown): value is Captain {
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
    Array.isArray(c.unlockedIslands) &&
    typeof c.rankTier === 'number' &&
    typeof c.wins === 'number' &&
    (c.currentIsland === null || typeof c.currentIsland === 'string') &&
    typeof c.hasCompletedOnboarding === 'boolean' &&
    typeof c.hasFoughtGuidedDuel === 'boolean'
  );
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

  // An older schema is DISCARDED, not partially applied. Merging an old captain into the new
  // shape would leave fields at defaults that look like deliberate values — worse than a reset,
  // because it is invisible. When a real migration is needed it goes here, explicitly, per version.
  if (envelope.version !== SCHEMA_VERSION) {
    return { captain: emptyCaptain(), recovered: false, migrated: true };
  }

  if (!isCaptain(envelope.captain)) {
    return { captain: emptyCaptain(), recovered: true, migrated: false };
  }

  return { captain: envelope.captain, recovered: false, migrated: false };
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
