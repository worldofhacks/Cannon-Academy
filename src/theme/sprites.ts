/**
 * Sprite manifest — every raster the app ships, in one typed record.
 *
 * `require` is the contract Metro needs to bundle an image, and a bare `require` scattered through
 * components is a path typo waiting to become a runtime crash on a device; this file makes it a
 * compile error instead.
 *
 * **Provenance rule (A-045).** Everything listed here is byte-identical to an image embedded in one
 * of the two Claude Design artifacts — `design/boards/README.md` names them. That is the whole
 * admission test. Art from a CC0 pack that the boards never actually place on a screen does not
 * qualify, however tempting the pack is: A-013 added seven hulls, six flags, two crew and two
 * dinghies on that reasoning and repainted the game with ships the design had never shown.
 *
 * The ships are drawn, not blitted — see `src/components/duel/Ship.tsx`. The one ship raster below
 * is the sea chart's top-down map boat, which the corrections board really does author as an
 * `<img>`. `__tests__/app/sprites.test.ts` re-checks every hash here against the allowlist.
 */

export const sprite = {
  /** The sea chart's map ship, at the board's own 66×113. Not a duel hull. */
  ship01: require('../../assets/sprites/ship-01.png'),
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
