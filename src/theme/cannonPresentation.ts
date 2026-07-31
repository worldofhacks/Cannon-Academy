/**
 * How each cannon LOOKS. Deliberately not in the catalog.
 *
 * Board 5c asks for a `projectile` field on the cannon record. That record is `src/content/
 * cannons.json`, which the engine track owns and which every engine test reads — adding a field
 * there is a ticket, not an app edit (COORDINATION.md). It is also the wrong home: a projectile
 * shape has no bearing on damage, and T-031 settled that presentation must not leak into the
 * damage model. So the mapping lives here, keyed by `CannonId`, and the catalog stays about
 * numbers.
 *
 * `Record<CannonId, …>` is the safety net: add a cannon to the catalog and this file stops
 * compiling until it has a look.
 */
import type { CannonId, Temperament } from '@content/schemas';

import { color } from './tokens';

/** Which shot art flies across the sea. Board 5c, "Shot identity — presentation only". */
export type Projectile = 'iron' | 'chain' | 'wobble' | 'fire' | 'bolt' | 'tentacle';

/**
 * Arc height. Three shapes cover every catalog cannon — the boards' single best-value decision, because
 * it costs one keyframe and makes ten guns feel like ten weapons without touching a damage number.
 * Volatile guns get `high`: long hang-time reads as "anything could happen", which is exactly what
 * their damage band already says.
 */
export type ArcShape = 'standard' | 'high' | 'flat';

export interface CannonLook {
  /** Single glyph shown on the tray tile and the question header. */
  readonly glyph: string;
  /** Short range hint under the glyph, e.g. "to 10". */
  readonly range: string;
  readonly projectile: Projectile;
  readonly arc: ArcShape;
  /**
   * The word that goes on the spectacle chip when this gun fires — KRAKEN, FIRE, LIGHTNING.
   * `null` for guns whose shot is just a shot.
   */
  readonly spectacle: string | null;
}

/** Engine special-mechanic identity — presentation only; never read by damage (A-034). */
export interface CannonWeaponLook {
  readonly displayName: string | null;
  readonly enabled: boolean;
  readonly unavailableLabel: string | null;
}

export const cannonLook: Record<CannonId, CannonLook> = {
  swivel_gun: { glyph: '+', range: 'to 10', projectile: 'iron', arc: 'standard', spectacle: null },
  culverin: { glyph: '+', range: 'to 10', projectile: 'wobble', arc: 'high', spectacle: null },
  /**
   * T-029's K-1 payoff gun — the one a five-year-old earns at Port Sumwich for mastering
   * `add_within_10`, the skill their two starter guns already fire. It reads as a starter (same
   * glyph, same range hint) because it IS the same skill; what it adds is damage, not reach.
   */
  saker: { glyph: '+', range: 'to 10', projectile: 'iron', arc: 'standard', spectacle: null },
  six_pounder: { glyph: '+', range: 'to 20', projectile: 'iron', arc: 'standard', spectacle: null },
  chain_shot: { glyph: '−', range: 'to 20', projectile: 'chain', arc: 'standard', spectacle: null },
  nine_pounder: { glyph: '×', range: 'times', projectile: 'iron', arc: 'standard', spectacle: null },
  twelve_pounder: { glyph: '×', range: 'times', projectile: 'iron', arc: 'high', spectacle: null },
  mortar: { glyph: '÷', range: 'shares', projectile: 'iron', arc: 'high', spectacle: null },
  double_broadside: {
    glyph: '±',
    range: '2-step',
    projectile: 'tentacle',
    arc: 'high',
    spectacle: 'KRAKEN',
  },
  powder_keg: {
    glyph: '½',
    range: 'fractions',
    projectile: 'fire',
    arc: 'high',
    spectacle: 'FIRE',
  },
  long_nine: {
    glyph: '( )',
    range: 'order',
    projectile: 'bolt',
    arc: 'flat',
    spectacle: 'LIGHTNING',
  },
  /**
   * Isla Products' K-1 gun. A grapeshot round is many identical small shot fired as one volley,
   * which is the concept the skill teaches, and the glyph is `+` for the same reason the skill's
   * templates only ever print `+`: a five-year-old meets equal groups as addition, not as `×`.
   * It shares `saker`'s deliberate restraint — the reach is new, the shot art is not.
   */
  grapeshot: { glyph: '+', range: 'groups', projectile: 'iron', arc: 'standard', spectacle: null },
};

/** Special-weapon row on the tray — Double-Shot stays unavailable until T-022 ships. */
export const cannonWeapon: Record<CannonId, CannonWeaponLook> = {
  swivel_gun: { displayName: null, enabled: false, unavailableLabel: null },
  culverin: { displayName: null, enabled: false, unavailableLabel: null },
  saker: { displayName: null, enabled: false, unavailableLabel: null },
  six_pounder: { displayName: null, enabled: false, unavailableLabel: null },
  chain_shot: { displayName: null, enabled: false, unavailableLabel: null },
  nine_pounder: { displayName: null, enabled: false, unavailableLabel: null },
  twelve_pounder: { displayName: null, enabled: false, unavailableLabel: null },
  mortar: { displayName: null, enabled: false, unavailableLabel: null },
  double_broadside: {
    displayName: 'Double-Shot',
    enabled: false,
    unavailableLabel: 'Double-Shot — coming later',
  },
  powder_keg: { displayName: null, enabled: false, unavailableLabel: null },
  long_nine: { displayName: null, enabled: false, unavailableLabel: null },
  grapeshot: { displayName: null, enabled: false, unavailableLabel: null },
};

// ── An owned gun the band cannot fire yet ─────────────────────────────────────────────────────
//
// A K-1 captain can win `nine_pounder` from a chest and OWN it, while the duel refuses to arm it
// (A-058). The gun deck shows that gun rather than hiding it: the child earned it, and a reward
// that disappears from the one screen where rewards live reads as the game taking it back. This is
// the same call the sea chart makes by keeping a locked island's name and skill glyph under fog,
// and the Harbor makes by leaving an unaffordable ship on the shelf with a progress meter.
//
// Two rules govern the words below.
//
//  1. **No grade number.** A five-year-old does not know what grade 2 means, and a number is a
//     verdict they cannot act on. Adults get that context on the Rank screen, not here.
//  2. **Waiting, not broken.** `harborShortfallMessage` turns "you cannot afford this" into "About
//     four more duels" — a refusal re-stated as something arriving. The gun deck's obstacle is not
//     coins and cannot be counted in duels, so the forward fact is growth rather than a tally.

/**
 * The chip on a gun that is owned but cannot sail yet.
 *
 * Deliberately the same two words as the Harbor's *"Not yet, Captain"* sheet, and the deliberate
 * opposite of `harborRevealOwnedLabel`'s "YOURS — FLYING NOW": one pill, one of two states, learned
 * by position rather than by reading.
 */
export const CANNON_NOT_YET_CHIP = 'NOT YET';

/** The line on the card. "Yours" first, because the point is that nothing was taken away. */
export const CANNON_NOT_YET_MESSAGE = 'Yours. You will grow into it.';

/**
 * What the card announces to a screen reader — the whole state, in one sentence.
 *
 * The skill is named BEFORE the state on purpose. The gun is kept on screen so a child can look
 * forward to it, and "what it teaches" is the entire content of that anticipation; a label that led
 * with the refusal would make the row a rejection notice read aloud.
 */
export function cannonNotYetLabel(displayName: string, skillName: string): string {
  return `${displayName}, ${skillName}. Yours, not yet — you will grow into it.`;
}

/**
 * Temperament, rendered. The boards give each temper a colour, a badge shape and a one-word gloss
 * a five-year-old can act on — "steady", "normal", "risky" — rather than the engine's term.
 */
export const temperLook: Record<
  Temperament,
  {
    readonly color: string;
    /**
     * The glyph colour ON this badge, certified against its own fill.
     *
     * Not a constant: white on the green `reliable` badge measures 2.63 — one of the board's two
     * explicitly BANNED pairs — while white on the red and the deep blue are 4.57 and 7.09. A single
     * shared glyph colour cannot be right for three different grounds, and the badge a beginner sees
     * most was the one failing (A-054).
     */
    readonly ink: string;
    readonly glyph: string;
    readonly word: string;
    /**
     * The badge outline, as SVG points in a 0–100 viewBox. These are the design's own `clip-path`
     * polygons, digit for digit — a hexagon for steady, a twelve-point burst for risky. `null`
     * means a circle.
     *
     * The shape is not decoration: it is the only temperament cue that survives colour-blindness,
     * and it is why a child can tell the risky gun from the steady one at a glance.
     */
    readonly points: string | null;
  }
> = {
  reliable: {
    color: color.success,
    // ink on hull-remaining — 5.70 AA. White here is 2.63 and banned by the board.
    ink: color.inkDark,
    glyph: '=',
    word: 'steady',
    points: '50,0 100,25 100,75 50,100 0,75 0,25',
  },
  // white on sea-deep — 7.09 AA, certified in the board's own table.
  standard: { color: color.seaDeep, ink: color.white, glyph: '~', word: 'normal', points: null },
  volatile: {
    color: '#D93A2E',
    // white on hull-critical — 4.57 AA.
    ink: color.white,
    glyph: '!',
    word: 'risky',
    points: '50,0 62,30 93,22 80,50 98,74 66,74 50,100 34,74 2,74 20,50 7,22 38,30',
  },
};

/**
 * The damage band track is drawn as ten discrete segments, not a smooth bar — the design's
 * `repeating-linear-gradient` with a 2px parchment divider every 10%. Ten segments against a
 * fixed 0–40 ruler is what lets a child compare two guns by counting rather than by reading.
 */
export const DAMAGE_BAND_SEGMENTS = 10;

/**
 * Damage-band scale for the tray's band meter. The widest cannon in the catalog is the Long Nine at
 * 24–40, so 40 is the full width and every band is drawn against the same ruler — that is the whole
 * point of the meter. A child compares two guns by where the bar sits, not by reading two numbers.
 */
export const DAMAGE_BAND_SCALE = 40;

/** Peak height of the shot arc, in points, per arc shape. */
export const ARC_PEAK: Record<ArcShape, number> = { standard: 56, high: 78, flat: 28 };
