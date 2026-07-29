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
 * Arc height. Three shapes cover all ten cannons — the boards' single best-value decision, because
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

export const cannonLook: Record<CannonId, CannonLook> = {
  swivel_gun: { glyph: '+', range: 'to 10', projectile: 'iron', arc: 'standard', spectacle: null },
  culverin: { glyph: '+', range: 'to 10', projectile: 'wobble', arc: 'high', spectacle: null },
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
};

/**
 * Temperament, rendered. The boards give each temper a colour, a badge shape and a one-word gloss
 * a five-year-old can act on — "steady", "normal", "risky" — rather than the engine's term.
 */
export const temperLook: Record<
  Temperament,
  {
    readonly color: string;
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
    glyph: '=',
    word: 'steady',
    points: '50,0 100,25 100,75 50,100 0,75 0,25',
  },
  standard: { color: color.sea, glyph: '~', word: 'normal', points: null },
  volatile: {
    color: '#D93A2E',
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
