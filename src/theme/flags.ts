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
 *
 * ## Shape and mark — the onboarding board's layer, added on top (owner ruling 1)
 *
 * The onboarding board draws six flags that differ by **shape and mark, not colour alone**, and its
 * own reading audit says so: *"Six flags differing by shape and mark, not colour alone."* Its six
 * colours cannot be adopted — `#1584B8` and `#14283C` sit 10.9° apart in hue against AC-4's 25°
 * floor, and the ids are persisted and frozen. So the board's **legibility system** is adopted
 * without its palette: three swallowtail pennants, three rectangular ones, and six distinct centre
 * marks. A child now has three independent channels (hue, silhouette, glyph) instead of one, and
 * the frozen colour-separation guarantee is untouched.
 *
 * The alternation is deliberate — swallowtail/rectangular/swallowtail/… — so no two adjacent cards
 * in the 2-column grid share a silhouette.
 *
 * `markColor` is measured against its own ground rather than picked by taste. These are graphical
 * objects, not text, so the 3:1 non-text floor applies; every pair below clears it:
 *
 *   flag-1 white on #E03131   4.51      flag-4 white on #0B8A8A   4.19
 *   flag-2 ink   on #F59F00   7.04      flag-5 white on #1C7ED6   4.20
 *   flag-3 ink   on #2F9E44   4.36      flag-6 gold  on #9C36B5   4.03
 */

/** Pennant silhouette. Three of each, alternating down the grid. */
export type FlagShape = 'swallowtail' | 'rectangular';

/**
 * The centre mark. Six distinct silhouettes — the board reuses `circle` twice, which defeats the
 * purpose of having a mark at all, so its sixth is replaced by a chevron.
 */
export type FlagMark = 'circle' | 'triangle' | 'star' | 'cross' | 'diamond' | 'chevron';

export interface FlagOption {
  /** What persists. Frozen as `flag-1`…`flag-6` — see the note above before changing one. */
  readonly id: string;
  /** What a screen reader announces, and the caption under the swatch. */
  readonly label: string;
  /** 6-digit hex. This is the pennant. */
  readonly color: string;
  /** The board's silhouette layer. Rendered by `components/onboarding/FlagBadge`. */
  readonly shape: FlagShape;
  /** The board's centre-mark layer. */
  readonly mark: FlagMark;
  /** 6-digit hex for the mark, measured against `color` — see the note above. */
  readonly markColor: string;
}

/**
 * Plain colour names rather than nautical ones ("Crimson Gull", "Deep Reach"). The label exists so
 * a child who cannot separate the swatches has something to go on, and a name that has to be
 * decoded first does not do that job.
 */
const FLAG_TUPLE = [
  {
    id: 'flag-1',
    label: 'Red',
    color: '#E03131',
    shape: 'swallowtail',
    mark: 'circle',
    markColor: '#FFFFFF',
  },
  {
    id: 'flag-2',
    label: 'Orange',
    color: '#F59F00',
    shape: 'rectangular',
    mark: 'triangle',
    markColor: '#14283C',
  },
  {
    id: 'flag-3',
    label: 'Green',
    color: '#2F9E44',
    shape: 'swallowtail',
    mark: 'star',
    markColor: '#14283C',
  },
  {
    id: 'flag-4',
    label: 'Teal',
    color: '#0B8A8A',
    shape: 'rectangular',
    mark: 'cross',
    markColor: '#FFFFFF',
  },
  {
    id: 'flag-5',
    label: 'Blue',
    color: '#1C7ED6',
    shape: 'swallowtail',
    mark: 'diamond',
    markColor: '#FFFFFF',
  },
  {
    id: 'flag-6',
    label: 'Purple',
    color: '#9C36B5',
    shape: 'rectangular',
    mark: 'chevron',
    markColor: '#FFD23F',
  },
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
