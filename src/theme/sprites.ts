/**
 * Sprite manifest.
 *
 * Every raster the app ships, in one typed record. `require` is the contract Metro needs to bundle
 * an image, and a bare `require` scattered through components is a path typo waiting to become a
 * runtime crash on a device — this file makes it a compile error instead.
 *
 * Source: Kenney "Pirate Pack" (CC0), Retina PNGs, copied from `assets/source/` at the sizes the
 * design boards call for. `assets/source/` stays out of the bundle; only these rasters ship.
 */
import type { ImageSourcePropType } from 'react-native';

import type { EnemyPresentationKind } from '../content/schemas';
import { DEFAULT_FLAG_ID } from './flags';

export const sprite = {
  /** Player and default duel hull — board 5a's pre-rendered sprite per hull. */
  ship01: require('../../assets/sprites/ship-01.png'),
  ship02: require('../../assets/sprites/ship-02.png'),
  ship03: require('../../assets/sprites/ship-03.png'),
  ship04: require('../../assets/sprites/ship-04.png'),
  ship05: require('../../assets/sprites/ship-05.png'),
  ship06: require('../../assets/sprites/ship-06.png'),
  ship07: require('../../assets/sprites/ship-07.png'),
  ship08: require('../../assets/sprites/ship-08.png'),
  /** Onboarding flags — board 5b pennants. */
  flag1: require('../../assets/sprites/flag-1.png'),
  flag2: require('../../assets/sprites/flag-2.png'),
  flag3: require('../../assets/sprites/flag-3.png'),
  flag4: require('../../assets/sprites/flag-4.png'),
  flag5: require('../../assets/sprites/flag-5.png'),
  flag6: require('../../assets/sprites/flag-6.png'),
  /** Reward and chest crew silhouettes. */
  crew1: require('../../assets/sprites/crew-1.png'),
  crew2: require('../../assets/sprites/crew-2.png'),
  /** Harbour dinghies for small-craft reads. */
  dinghy1: require('../../assets/sprites/dinghy-1.png'),
  dinghy2: require('../../assets/sprites/dinghy-2.png'),
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

type FlagSpriteName = 'flag1' | 'flag2' | 'flag3' | 'flag4' | 'flag5' | 'flag6';

const FLAG_SPRITE_BY_ID: Readonly<Record<string, FlagSpriteName>> = {
  'flag-1': 'flag1',
  'flag-2': 'flag2',
  'flag-3': 'flag3',
  'flag-4': 'flag4',
  'flag-5': 'flag5',
  'flag-6': 'flag6',
};

/** The pennant raster for a persisted onboarding flag id. */
export function flagSpriteForId(flagId: string): ImageSourcePropType {
  const key = FLAG_SPRITE_BY_ID[flagId] ?? FLAG_SPRITE_BY_ID[DEFAULT_FLAG_ID];
  return sprite[key!];
}

/** One pre-rendered hull per encounter kind; kraken is not a ship hull. */
export function hullSpriteForKind(
  kind?: EnemyPresentationKind,
): ImageSourcePropType | null {
  switch (kind) {
    case 'pirate':
      return sprite.ship02;
    case 'skeleton':
      return sprite.ship03;
    case 'ghost':
      return sprite.ship04;
    case 'shark':
      return sprite.ship05;
    case 'kraken':
      return null;
    default:
      return sprite.ship01;
  }
}
