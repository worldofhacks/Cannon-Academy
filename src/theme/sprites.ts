/**
 * Sprite manifest.
 *
 * Every raster the app ships, in one typed record. `require` is the contract Metro needs to bundle
 * an image, and a bare `require` scattered through components is a path typo waiting to become a
 * runtime crash on a device — this file makes it a compile error instead.
 *
 * Source: Kenney "Pirate Pack" (CC0), Retina PNGs, copied from `assets/source/` at the sizes the
 * design boards call for. `assets/source/` stays out of the bundle; only these eight ship.
 */
export const sprite = {
  /** The standard shot. Every cannon that is not chain/fire/bolt/tentacle throws this. */
  cannonball: require('../../assets/sprites/cannonball.png'),
  /** Deck gun, used on the resolve panel. */
  cannon: require('../../assets/sprites/cannon.png'),
  /** Wheeled gun, used on the chest reveal for a cannon drop. */
  cannonMobile: require('../../assets/sprites/cannon-mobile.png'),
  /** Flame — burning hull, Powder Keg's shot and its impact. */
  fire: require('../../assets/sprites/fire1.png'),
  /** Largest blast: bolt, fire and kraken impacts. */
  explosionBig: require('../../assets/sprites/explosion1.png'),
  /** Mid blast: chain shot, and the rival landing one on the player. */
  explosionMid: require('../../assets/sprites/explosion2.png'),
  /** Small blast: every plain iron shot. */
  explosionSmall: require('../../assets/sprites/explosion3.png'),
  /** Planks — the defeat screen's "the crew is already hammering new planks on". */
  wood: require('../../assets/sprites/wood-1.png'),
} as const;

export type SpriteName = keyof typeof sprite;
