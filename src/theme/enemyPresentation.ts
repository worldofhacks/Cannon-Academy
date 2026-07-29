/**
 * Enemy encounter presentation — pure mapping from catalog data to duel visuals (A-031).
 *
 * No engine imports: hull tuning and damage stay in A-029/A-030. This module only decides how
 * each island's encounter reads on screen.
 */
import type { Enemy } from '../content/schemas';
import type { ShipCosmetics } from '../components/duel/Ship';
import { color } from './tokens';

export type RivalPresentation = {
  readonly kind: Enemy['presentationKind'];
  readonly displayName: string;
  readonly faction: string;
  readonly accessibilityLabel: string;
  /** Independent text channel for tests — never reused as a shape id. */
  readonly textChannel: string;
  /** Independent shape channel for tests — never reused as display copy. */
  readonly shapeChannel: string;
  readonly cosmetics: ShipCosmetics | null;
  readonly accent: string;
  readonly ghostOpacity?: number;
  readonly ghostGlow?: string;
};

const PIRATE_SHIP: ShipCosmetics = {
  hull: '#6B4A3A',
  hullDeep: '#4A3028',
  sail: '#F0E0C8',
  trim: '#1A1410',
  pennant: '#1A1410',
  mast: '#5C4A3A',
  deck: '#7A5A48',
};

const SKELETON_SHIP: ShipCosmetics = {
  hull: '#D8D0C4',
  hullDeep: '#A89E90',
  sail: '#F5F2EA',
  trim: '#8A8070',
  pennant: '#E8E4DC',
  mast: '#B8AEA0',
  deck: '#CFC6BA',
};

const GHOST_SHIP: ShipCosmetics = {
  hull: '#B8E8F0',
  hullDeep: '#7EC8DC',
  sail: '#E8FAFF',
  trim: color.ghostGlow,
  pennant: '#D0F8FF',
  mast: '#9AD4E8',
  deck: '#A8DCE8',
};

const SHARK_SKIFF: ShipCosmetics = {
  hull: '#5A7080',
  hullDeep: '#3A5060',
  sail: '#C8D8E4',
  trim: '#8098A8',
  pennant: '#607888',
  mast: '#4A6070',
  deck: '#6A8494',
};

/** Documented ghost treatment from the design artifact — translucent hull with a glow wash. */
export const GHOST_HULL_OPACITY = 0.58;

export function enemyPresentationFor(enemy: Enemy): RivalPresentation {
  switch (enemy.presentationKind) {
    case 'pirate':
      return {
        kind: 'pirate',
        displayName: enemy.displayName,
        faction: enemy.faction,
        accessibilityLabel: enemy.accessibilityLabel,
        textChannel: `${enemy.displayName} · ${enemy.faction}`,
        shapeChannel: 'ship-crossbones-flag',
        cosmetics: PIRATE_SHIP,
        accent: '#1A1410',
      };
    case 'skeleton':
      return {
        kind: 'skeleton',
        displayName: enemy.displayName,
        faction: enemy.faction,
        accessibilityLabel: enemy.accessibilityLabel,
        textChannel: `${enemy.displayName} · rattling bones`,
        shapeChannel: 'ship-skull-sails',
        cosmetics: SKELETON_SHIP,
        accent: '#8A8070',
      };
    case 'ghost':
      return {
        kind: 'ghost',
        displayName: enemy.displayName,
        faction: enemy.faction,
        accessibilityLabel: enemy.accessibilityLabel,
        textChannel: `${enemy.displayName} · mist and glow`,
        shapeChannel: 'ghost-hull-glow',
        cosmetics: GHOST_SHIP,
        accent: color.ghostGlow,
        ghostOpacity: GHOST_HULL_OPACITY,
        ghostGlow: color.ghostGlow,
      };
    case 'shark':
      return {
        kind: 'shark',
        displayName: enemy.displayName,
        faction: enemy.faction,
        accessibilityLabel: enemy.accessibilityLabel,
        textChannel: `${enemy.displayName} · circling fin`,
        shapeChannel: 'fin-and-skiff',
        cosmetics: SHARK_SKIFF,
        accent: '#607888',
      };
    case 'kraken':
      return {
        kind: 'kraken',
        displayName: enemy.displayName,
        faction: enemy.faction,
        accessibilityLabel: enemy.accessibilityLabel,
        textChannel: `${enemy.displayName} · tentacle swarm`,
        shapeChannel: 'tentacle-cluster',
        cosmetics: null,
        accent: color.krakenPink,
      };
  }
}
