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

/**
 * Board 7b, "Enemy roster the pack already gives you": the pirate sloop is the shell, and
 * "everything else is a re-tint of this". So every set below shares one geometry and differs only
 * in palette — and every one of them is `tattered`, which is the board's ragged-sail outline, and
 * none of them carries `sailStripe`, which is the player's alone.
 *
 * These were invented colours until A-045. The pirate in particular rendered BROWN while the duel
 * board's rival — the very ship the prototype shows opposite you — is the dark purple sloop below.
 */
const PIRATE_SHIP: ShipCosmetics = {
  hull: '#4A3B5C',
  hullDeep: '#33284A',
  sail: '#6C4BD6',
  trim: '#4A2FA0',
  pennant: '#6C4BD6',
  mast: '#5C4A3A',
  deck: '#6B5A48',
  tattered: true,
};

/**
 * Board 7b: "Bone-white re-tint of the same figure… reads as silly, not scary." Its roster chip is
 * `#F0E2C8` — the `surface-sunk` token — so the bone palette is built from the artifact's own
 * parchment ramp. A-046 replaced seven invented greys that appeared nowhere in either board.
 */
const SKELETON_SHIP: ShipCosmetics = {
  hull: '#F0E2C8',
  hullDeep: '#C9AE7E',
  sail: '#FFF6E4',
  trim: '#D8CBB2',
  pennant: '#F0E2C8',
  mast: '#C9AE7E',
  deck: '#D8CBB2',
  tattered: true,
};

/** Board 7b: "Same geometry at 55% opacity, sails shifted to pale green, one radial glow." */
const GHOST_SHIP: ShipCosmetics = {
  hull: '#5A7A72',
  hullDeep: '#3E5A54',
  sail: '#BFE8D4',
  trim: '#8FE0AC',
  pennant: '#8FE0AC',
  mast: '#4A6A62',
  deck: '#8FE0AC',
  tattered: true,
};

/**
 * Board 7b: the shark-man crew, "grey and blue", chip `#7FCDEC`; the great white's chip is
 * `#BFD8E8`. Both are artifact colours, and the rest of the skiff is drawn off the sea ramp — A-046
 * replaced an invented grey-blue set that appeared nowhere in either board.
 */
const SHARK_SKIFF: ShipCosmetics = {
  hull: '#1584B8',
  hullDeep: '#0C5E86',
  sail: '#C9D6E4',
  trim: '#43B4E0',
  pennant: '#7FCDEC',
  mast: '#4C637A',
  deck: '#BFD8E8',
  tattered: true,
};

/**
 * Translucent hull with a glow wash. The board's roster says `.55` outright; this was 0.58 before
 * A-045, transcribed from prose rather than from the roster entry.
 */
export const GHOST_HULL_OPACITY = 0.55;

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
        accent: '#6C4BD6',
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
        accent: '#C9AE7E',
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
        accent: '#7FCDEC',
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
