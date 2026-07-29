/**
 * The six flags — A-006.
 *
 * A fixed set, not a colour picker (board 6b, and this ticket's DoD). The reason is AC-4: a picker
 * cannot guarantee that any two captains' pennants are distinguishable, and the flag is not
 * decoration — board 5b makes it the ship's pennant, so it is the mark a child recognises as
 * *theirs* on a moving ship at ~26pt.
 *
 * An object per flag rather than a bare hex, because three different things are needed in three
 * different places: the `id` persists (and is already frozen as `flag-1`…`flag-6` by A-002's and
 * A-003's tests — renaming it orphans real captains), the `color` renders, and the `label` is what
 * a screen reader announces and what a colour-blind child reads instead of the swatch.
 *
 * ## Why these six hexes
 *
 * AC-4 asks for six that are told apart *by hue alone*, and the frozen tests hold that to ≥25°
 * pairwise hue separation, ≥60 RGB distance and ≥0.35 saturation. Six evenly spread hues sit 60°
 * apart, so the floor has real slack — but the instinctive palette does not clear it. Our own
 * `amber` (#F5A623) and `gold` (#FFD23F) are both "the brand" and sit **8.5°** apart: side by side
 * at 16pt they are one colour, and the test rejects them on purpose.
 *
 * So the set below walks the wheel instead of the brand. Measured, not guessed:
 *
 *   flag-1  #E03131    0.0°   sat 0.78
 *   flag-2  #F59F00   38.9°   sat 1.00
 *   flag-3  #2F9E44  131.4°   sat 0.70
 *   flag-4  #0B8A8A  180.0°   sat 0.92
 *   flag-5  #1C7ED6  208.4°   sat 0.87
 *   flag-6  #9C36B5  288.2°   sat 0.70
 *
 * Tightest pair is flag-4/flag-5 at 28.4° hue and 78.8 RGB — the teal/blue neighbours, which is
 * the pair the test's own 25° floor was calibrated to admit. Every hex is dark enough to carry
 * white or parchment beside it and saturated enough that the hue, not the lightness, is the signal.
 */

export interface FlagOption {
  /** What persists. Frozen as `flag-1`…`flag-6` — see the note above before changing one. */
  readonly id: string;
  /** What a screen reader announces, and the caption under the swatch. */
  readonly label: string;
  /** 6-digit hex. This is the pennant. */
  readonly color: string;
}

/**
 * Plain colour names rather than nautical ones ("Crimson Gull", "Deep Reach"). The label exists so
 * a child who cannot separate the swatches has something to go on, and a name that has to be
 * decoded first does not do that job.
 */
const FLAG_TUPLE = [
  { id: 'flag-1', label: 'Red', color: '#E03131' },
  { id: 'flag-2', label: 'Orange', color: '#F59F00' },
  { id: 'flag-3', label: 'Green', color: '#2F9E44' },
  { id: 'flag-4', label: 'Teal', color: '#0B8A8A' },
  { id: 'flag-5', label: 'Blue', color: '#1C7ED6' },
  { id: 'flag-6', label: 'Purple', color: '#9C36B5' },
] as const satisfies readonly FlagOption[];

export const FLAGS: readonly FlagOption[] = FLAG_TUPLE;

/**
 * The flag a skipped screen commits, so `flow.ts` is never handed a null.
 *
 * Read off the tuple rather than off `FLAGS`, because `noUncheckedIndexedAccess` types
 * `FLAGS[0]` as possibly-undefined — and a `!` here would be a non-null assertion guarding a
 * literal that is right there in the file.
 */
export const DEFAULT_FLAG_ID: string = FLAG_TUPLE[0].id;

/** `undefined` for an id from an older build — callers decide the fallback. */
export function flagById(id: string | null): FlagOption | undefined {
  if (id === null) return undefined;
  return FLAGS.find((f) => f.id === id);
}
