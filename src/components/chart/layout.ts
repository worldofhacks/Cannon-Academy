/**
 * The chart's two rules for turning `board.ts` numbers into pixels, and nothing else.
 *
 * ## Geometry
 *
 * `board.ts` states it: a MAP coordinate maps PROPORTIONALLY (`x / 375`, `y / 455`) against the
 * letterboxed board frame from `containWorldBoard`, while a SIZE scales by that same uniform
 * scale. The outer map box may be wider on tablet/desktop; the composition stays board-faithful.
 *
 * The two are deliberately different multipliers. Scaling positions by `art` would let the map
 * overflow a narrow screen; scaling sizes proportionally would squash every island on a tall one.
 *
 * ## State
 *
 * Which of the four states a station renders is NOT decided here. `services/chart.ts` owns fog and
 * order, and it has frozen tests; this file only reads its answer and pairs it with the board's own
 * per-position drawing (`Station.silhouette` — the far end of the map is drawn small, and only ever
 * matters while a station is fogged).
 */
import type { Station } from './board';
import { MAP } from './board';
import type { ChartNode } from '../../services/chart';

/** The live map box, plus the art scale that everything drawn inside it is measured in. */
export interface MapFrame {
  readonly width: number;
  readonly height: number;
  readonly art: number;
}

/** A MAP x, proportionally. */
export function mapX(f: MapFrame, x: number): number {
  return (x / MAP.width) * f.width;
}

/** A MAP y, proportionally. */
export function mapY(f: MapFrame, y: number): number {
  return (y / MAP.height) * f.height;
}

/** A drawn size, by the art scale. */
export function art(f: MapFrame, designPx: number): number {
  return designPx * f.art;
}

/** The five progress states a child can encounter on the chart. */
export type StationState = 'current' | 'available' | 'cleared' | 'locked-near' | 'far-silhouette';

export interface StationPresentation {
  readonly accessibilityLabel: string;
  readonly markerHead: 'live' | 'available' | 'cleared' | 'locked' | 'silhouette';
  readonly tappable: boolean;
}

/**
 * Where the ship parks, and which node gets the ring and the `SAIL HERE` chip.
 *
 * The captain's own island when they have one. Otherwise the furthest island the fog has already
 * lifted from, because that is the one they are being sent to next — a chart with no live target
 * is a chart with nothing to do. Falls back to the first station so a captain who has not been
 * placed yet still gets a whole screen rather than a hole where the ship goes.
 */
export function focusIndex(nodes: readonly ChartNode[]): number {
  const current = nodes.findIndex((n) => n.isCurrent && !n.fogged);
  if (current >= 0) return current;
  const lastOpen = nodes.reduce((acc, n, i) => (n.fogged ? acc : i), -1);
  return lastOpen >= 0 ? lastOpen : 0;
}

export function stationState(node: ChartNode, station: Station, isFocus: boolean): StationState {
  if (node.fogged) return station.silhouette ? 'far-silhouette' : 'locked-near';
  if (node.isCurrent || isFocus) return 'current';
  return node.cleared ? 'cleared' : 'available';
}

/**
 * The renderer and accessibility tree consume the same state description, so a visual tick can
 * never drift away from what VoiceOver announces or which markers accept a press.
 */
export function stationPresentation(
  node: ChartNode,
  state: StationState,
  requirement: string | null,
): StationPresentation {
  const label = node.island.displayName;

  switch (state) {
    case 'current':
      return {
        accessibilityLabel: `${label}, current island. Sail here`,
        markerHead: 'live',
        tappable: !node.fogged,
      };
    case 'available':
      return {
        accessibilityLabel: `${label}, available. Sail here`,
        markerHead: 'available',
        tappable: !node.fogged,
      };
    case 'cleared':
      return {
        accessibilityLabel: `${label}, cleared. Sail here again`,
        markerHead: 'cleared',
        tappable: !node.fogged,
      };
    case 'locked-near':
      return {
        accessibilityLabel: `${label}, locked in the fog. ${requirement ?? ''}`.trim(),
        markerHead: 'locked',
        tappable: !node.fogged,
      };
    case 'far-silhouette':
      return {
        accessibilityLabel: `${label}, far beyond the fog. ${requirement ?? ''}`.trim(),
        markerHead: 'silhouette',
        tappable: !node.fogged,
      };
  }
}

/**
 * The one node that gets a requirement chip: the nearest closed one.
 *
 * The board draws exactly one, at a fixed MAP y. Printing five would turn the fog into a wall of
 * text, and four of them would name a place the captain cannot reach yet anyway.
 */
export function requirementIndex(nodes: readonly ChartNode[], stations: readonly Station[]): number {
  return nodes.findIndex((n, i) => n.fogged && stations[i]?.silhouette !== true);
}
